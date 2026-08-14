"use client";
import { TableScroll } from "@/components/ui/Table";
// หน้ารายละเอียดใบขอราคาผลิต — อ่านได้ทุกฝ่ายที่เกี่ยวข้อง, แก้ได้เฉพาะฝ่ายขาย
// เจ้าของใบ (canEditCostingRequest).
//
// 0159: บรรทัดผูกวัสดุจาก **ทะเบียน** ด้วย id (MaterialPicker) + แก้กรัม/ชิ้นได้ +
// เลือกชั้นราคาเองได้ (ระบบแนะนำจากจำนวนในใบ แต่เซลตัดสิน) — ที่ยังไม่มีราคา/
// เกินอายุ กด "ขอราคา" เปิดเคสผูกกลับบรรทัดนี้ให้ RD/PC ตอบ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Calculator, Pencil, Ban, Send, Check, Undo2, ArrowDownToLine, ExternalLink,
  Package, RefreshCw, Copy, MessageSquare,
} from "lucide-react";
import Modal from "@/components/Modal";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import ReadableText from "@/components/ui/ReadableText";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import UpdateThread from "@/components/updates/UpdateThread";
import {
  DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import CostingRequestForm, {
  costingFormFromRequest, costingPayloadFrom,
} from "@/components/costing/CostingRequestForm";
import MaterialPicker from "@/components/materials/MaterialPicker";
import { kindForMaterial } from "@/lib/master/requestTypes";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { fmtDate, fmtNumber } from "@/lib/format";
import {
  COSTING_STATUS_LABELS, COSTING_STATUS_TONES, ITEM_APPROVAL_LABELS,
  approvalProgress, canDecideItem, canEditCostingRequest, canFeedCostFromRequest,
  canWithdrawCostingRequest, componentUnitCost, feedCostError, feedCostValue,
  isMoqTier, itemUnitCost, pricingProgress, submitToExecError,
} from "@/lib/costing";
import {
  COMPONENT_LIBRARY_LABELS, componentLibraryStatus, componentSnapshotExpired,
  suggestedTierForComponent, suggestedTierQty,
} from "@/lib/costingLibrary";
import {
  latestRevision, revisionTiers, sourceDeptForMaterialKind, tierUnitPrice,
} from "@/lib/materialPrices";
import { COST_LINE_KIND_LABELS } from "@/lib/master/costTemplate";
import { productSelectOptions } from "@/components/master/productOption";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import Textarea from "@/components/ui/Textarea";
import { businessDate } from "@/lib/businessDate";

const money = (value) => (value == null
  ? "—"
  : fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const qty = (value) => fmtNumber(value);

// สีป้ายสถานะการผูกทะเบียนของบรรทัด (token เท่านั้น — ห้าม hex ตรง ๆ)
const LIBRARY_TONE = {
  unlinked: "var(--text-3)",
  missing: "var(--red)",
  draft: "var(--amber)",
  no_price: "var(--amber)",
  expired: "var(--red)",
  ready: "var(--green)",
};

export default function CostingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();

  const [request, setRequest] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [templateCategories, setTemplateCategories] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [withdrawForm, setWithdrawForm] = useState(null); // { reason } เมื่อเปิดกล่องดึงกลับ
  const [toast, setToast] = useState(null);
  // การตัดสินของผู้บริหารต่อรายการ — { itemId, mode: 'approve'|'return' }
  const [decision, setDecision] = useState(null);
  const [tierDraft, setTierDraft] = useState({});
  const [returnReason, setReturnReason] = useState("");
  // รายการที่รอยืนยันก่อนป้อนต้นทุนกลับสินค้า
  const [pendingFeed, setPendingFeed] = useState(null);
  // รายการที่กำลังผูก FG เดิม — { item, products } (โหลดตอนเปิด)
  const [pendingLink, setPendingLink] = useState(null);
  const [linkProducts, setLinkProducts] = useState([]);
  // เคสขอราคาที่กำลังจะเปิดจากบรรทัดในใบ — { form, componentId }
  // ทะเบียนที่ฟอร์มคำร้องต้องใช้ — โหลด **ตอนกดเปิดโมดัล** ไม่ใช่ตอนเปิดหน้า
  // (คนเข้าหน้าใบขอราคาผลิตส่วนใหญ่ไม่ได้มาเปิดคำร้อง จะดึง 5 endpoint ทิ้งเปล่า)
  // ค่าที่กำลังพิมพ์ในช่องกรัม (คุมแยกจาก request เพื่อไม่ยิง API ทุกตัวอักษร)
  const [gramsDraft, setGramsDraft] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [reqRes, typeRes, tplRes, matRes] = await Promise.all([
        fetch(`/api/sa/costing/${id}`, { cache: "no-store" }),
        fetch("/api/product-types", { cache: "no-store" }),
        fetch("/api/cost-templates", { cache: "no-store" }),
        fetch("/api/sa/materials", { cache: "no-store" }),
      ]);
      const d = await reqRes.json().catch(() => null);
      if (!reqRes.ok) throw new Error(d?.error || "โหลดใบขอราคาไม่สำเร็จ");
      setRequest(d);
      setGramsDraft({});
      setProductTypes(await typeRes.json().catch(() => []));
      const templates = await tplRes.json().catch(() => []);
      setTemplateCategories(new Set((Array.isArray(templates) ? templates : []).map((t) => t.categoryCode)));
      const mats = await matRes.json().catch(() => []);
      setMaterials(Array.isArray(mats) ? mats : []);
    } catch (e) {
      setLoadError(e.message);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ผู้ใช้ปัจจุบันในรูปที่ predicate ฝั่ง lib ต้องการ (id มาจาก requestedById ไม่ได้ —
  // ใช้ role/team/department ที่ context ให้มา; server กันซ้ำอยู่แล้ว)
  const canEdit = useMemo(
    () => !!request && canEditCostingRequest({ role, team, teams, department, id: request.requestedById }, request),
    [request, role, team, teams, department],
  );
  const canFeed = useMemo(
    () => !!request && canFeedCostFromRequest({ role, team, teams, department, id: request.requestedById }, request),
    [request, role, team, teams, department],
  );

  // รายการที่มีราคาที่ฝ่ายอื่นตอบแล้ว หรือมีราคาอนุมัติแล้ว = ลบ/เปลี่ยนประเภทไม่ได้
  const lockedItemIds = useMemo(() => new Set(
    (request?.items || [])
      .filter((item) => (item.components || []).some((c) => c.priceStatus === "quoted")
        || (item.tiers || []).some((t) => t.approvedUnitPrice != null))
      .map((item) => item.id),
  ), [request]);

  const me = useMemo(() => ({ role, team, teams, department }), [role, team, teams, department]);

  // เรียก endpoint แล้วโหลดใบใหม่ — ใช้ร่วมทุก action (ส่ง/ตอบราคา/อนุมัติ)
  const runAction = useCallback(async (path, init, successMsg) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/costing/${id}${path}`, {
        headers: { "Content-Type": "application/json" }, ...init,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      setToast({ kind: "success", msg: successMsg });
      await load();
      return d || true;
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, load]);

  const openEdit = () => setForm(costingFormFromRequest(request));
  const closeEdit = () => { setForm(null); setPendingSave(false); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/costing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(costingPayloadFrom(form)),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
      setToast({ kind: "success", msg: "บันทึกใบขอราคาแล้ว" });
      closeEdit();
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setPendingSave(false);
    }
    setSaving(false);
  };

  const cancelRequest = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/costing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", cancelReason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ยกเลิกไม่สำเร็จ");
      setToast({ kind: "success", msg: "ยกเลิกใบแล้ว" });
      setPendingCancel(false);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setSaving(false);
  };

  if (loading) return <Workspace hideHeader back={{ href: "/sa/costing", label: "กลับรายการ" }}><SkeletonRows rows={6} /></Workspace>;
  if (loadError || !request) {
    return (
      <Workspace hideHeader back={{ href: "/sa/costing", label: "กลับรายการ" }}>
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>
          {loadError || "ไม่พบใบขอราคา"}
        </div>
      </Workspace>
    );
  }

  const approval = approvalProgress(request.items || []);
  const pricing = pricingProgress((request.items || []).flatMap((i) => i.components || []));

  const todayIso = businessDate();
  const suggestQty = suggestedTierQty(request);

  // ดึงราคาล่าสุดทุกบรรทัดที่ผูกวัสดุแล้ว — toast บอกจำนวนจริง ไม่ใช่ "สำเร็จ" ลอย ๆ
  const fillFromLibrary = async () => {
    const res = await runAction("/fill-prices", { method: "PATCH", body: "{}" }, "ดึงราคาแล้ว");
    if (!res) return;
    const parts = [];
    if (res._filled) parts.push(`เติม ${res._filled} บรรทัด`);
    if (res._refreshed) parts.push(`ต่ออายุ ${res._refreshed}`);
    if (res._expired) parts.push(`เกินอายุ ${res._expired} (ต้องขอราคาใหม่)`);
    if (res._missing) parts.push(`ยังไม่มีราคา ${res._missing}`);
    if (res._tierBelow) parts.push(`${res._tierBelow} บรรทัดใช้ชั้นที่ต่ำกว่าชั้นต่ำสุดที่มี`);
    setToast({
      kind: res._filled || res._refreshed ? "success" : "error",
      msg: parts.length ? parts.join(" · ") : "ไม่มีบรรทัดไหนขยับ — ทุกบรรทัดมีราคาสดอยู่แล้ว",
    });
  };

  // แก้บรรทัด (ผูกวัสดุ / กรัม / ชั้นราคา) — ส่งเฉพาะ key ที่เปลี่ยน
  const patchComponent = (componentId, patch, msg) => runAction("/components", {
    method: "PATCH", body: JSON.stringify({ componentId, ...patch }),
  }, msg);

  // ⚠️ **ปุ่ม "ขอราคา" บนบรรทัดถูกถอดใน mig 0219** (มติ ม-28) — มันเปิดคำร้อง
  // หัวข้อ `price_f`/`price_fb`/`price_pm` ซึ่งไม่มีอยู่แล้ว · ราคาในโมเดลใหม่มาจาก
  // ขั้นสุดท้ายของคำร้องพัฒนากลิ่น/พัฒนาสูตร แล้วไหลเข้าทะเบียนวัสดุตามเดิม
  // ⇒ ใบขอราคาผลิตยังดึงราคาจากทะเบียนได้เหมือนเดิมทุกอย่าง เปลี่ยนแค่ **ทางที่
  // ราคาเข้าทะเบียน** ไม่ใช่ทางที่ใบนี้อ่านราคา
  // ดึงกลับ (B5): ยื่นไปแล้วแต่ผู้บริหารยังไม่ตัดสิน — เอากลับมาแก้เองได้
  // ด่านจริงอยู่ที่ predicate กลางตัวเดียว (withdrawFromExecError) ที่ route ใช้ร่วมกัน
  const withdraw = () => {
    const reason = (withdrawForm?.reason || "").trim();
    if (reason.length < 10) return;
    runAction("/withdraw", { method: "POST", body: JSON.stringify({ reason }) },
      "ดึงกลับแล้ว ใบกลับมาแก้ไขได้")
      .then((ok) => { if (ok) setWithdrawForm(null); });
  };

  const submit = () => {
    const blocked = submitToExecError(request);
    if (blocked) { setToast({ kind: "error", msg: blocked }); return; }
    runAction("/submit", { method: "POST", body: JSON.stringify({ stage: "exec" }) }, "ส่งให้ผู้บริหารแล้ว");
  };

  // ออกฉบับแก้ไข (rev.2) — สร้างใบใหม่แล้วพาไปที่ใบนั้น
  const revise = () => runAction("/revise", { method: "POST", body: "{}" }, "ออกฉบับแก้ไขแล้ว")
    .then((ok) => { if (ok?.id) router.push(`/sa/costing/${ok.id}`); });

  const linkFg = (itemId, productId) => runAction("/link-fg", {
    method: "PATCH", body: JSON.stringify({ itemId, productId }),
  }, "ผูกสินค้าแล้ว").then((ok) => { if (ok) setPendingLink(null); });

  // "ไปต่อ → ขึ้นทะเบียน FG": stash ข้อมูลรายการไว้ให้หน้าสินค้า prefill (มีในมือ
  // อยู่แล้ว ไม่ต้อง fetch) แล้วพาไปหน้าเพิ่มสินค้า — กลับมากด "ผูก FG เดิม" ทีหลัง
  const registerFg = (item) => {
    try {
      sessionStorage.setItem("costingFgPrefill", JSON.stringify({
        productDescription: item.productLabel,
        fragranceName: item.fragranceName || "",
        customerName: request.customerName || "",
        note: `จากใบขอราคาผลิต ${request.docNo || id}`,
      }));
    } catch { /* sessionStorage อาจถูกปิด — ไปหน้าเพิ่มสินค้าเปล่าแทน */ }
    router.push("/database/products?prefill=costing");
  };

  // เปิดโมดัลผูก FG เดิม — โหลดสินค้าของลูกค้าใบนี้ (ถ้ามี) ให้เลือก
  const openLinkFg = async (item) => {
    setPendingLink({ item });
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const rows = await res.json().catch(() => []);
      const list = Array.isArray(rows) ? rows : (rows.items || rows.data || []);
      // กรองเฉพาะสินค้าของลูกค้าใบนี้ ถ้าใบผูกลูกค้าไว้
      setLinkProducts(request.customerId ? list.filter((p) => p.customerId === request.customerId) : list);
    } catch {
      setToast({ kind: "error", msg: "โหลดรายการสินค้าไม่สำเร็จ" });
    }
  };

  const sendDecision = () => {
    const item = (request.items || []).find((i) => i.id === decision.itemId);
    const payload = decision.mode === "return"
      ? { itemId: decision.itemId, decision: "return", returnReason }
      : {
        itemId: decision.itemId,
        decision: "approve",
        tierPrices: (item?.tiers || []).map((t) => ({
          tierId: t.id,
          price: tierDraft[t.id] ?? t.approvedUnitPrice,
        })),
      };
    runAction("/approve", { method: "POST", body: JSON.stringify(payload) },
      decision.mode === "return" ? "ตีกลับรายการแล้ว" : "อนุมัติราคาผลิตแล้ว")
      .then((ok) => {
        if (ok) { setDecision(null); setTierDraft({}); setReturnReason(""); }
      });
  };

  const editableStatus = ["draft", "assembling", "returned", "pricing"].includes(request.status);
  const workflowIndex = ["draft"].includes(request.status)
    ? 0
    : ["pricing", "assembling", "returned"].includes(request.status)
      ? 1
      : request.status === "pending_exec"
        ? 2
        : request.status === "approved"
          ? 3
          : 4;
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "จัดทำใบ", hint: "ระบุสินค้าและโครงสร้างต้นทุน" },
    { id: "pricing", label: "รวบรวมราคา", hint: "ผูกวัสดุและตรึงราคาล่าสุด" },
    { id: "approval", label: "อนุมัติ", hint: "ผู้บริหารอนุมัติรายสินค้า" },
    { id: "approved", label: "อนุมัติครบ", hint: "พร้อมป้อนต้นทุนเข้า FG" },
    { id: "linked", label: "ป้อนต้นทุนแล้ว", hint: "ต้นทุนถูกส่งกลับทะเบียนสินค้า" },
  ], workflowIndex, request.status === "cancelled");
  const submitBlocked = editableStatus ? submitToExecError(request) : null;
  // ปุ่มกับ API ต้องตัดสินด้วย predicate ตัวเดียวกัน — ห้ามหน้าเว็บเขียนเงื่อนไขเองซ้ำ
  // (บทเรียนจาก QT/SO: ปุ่มโผล่แต่ API ปฏิเสธ หรือกลับกัน). รูปแบบ user เดียวกับ
  // canEdit/canFeed ข้างบน — roleContext ไม่มี id ให้ ด่านตัวจริงจึงอยู่ที่ route เสมอ
  const canWithdraw = canWithdrawCostingRequest(
    { role, team, teams, department, id: request.requestedById },
    request,
  );
  const documentPrimaryAction = canEdit && editableStatus
    ? {
      id: "submit",
      label: "ส่งผู้บริหารอนุมัติ",
      kind: "submit",
      icon: Send,
      onClick: submit,
      disabled: !!submitBlocked,
      disabledReason: submitBlocked || undefined,
    }
    : null;

  return (
    <Workspace hideHeader back={{ href: "/sa/costing", label: "กลับรายการ" }}>
      <SalesDetailOverview
        eyebrow="SA COSTING REQUEST"
        title={request.docNo || "ใบขอราคา (ร่าง)"}
        description={`${request.customerName || "ใบสำรวจ (ไม่ผูกดีล)"} · สร้างเมื่อ ${fmtDate(request.createdAt)}${request.revisionNo > 1 ? ` · ฉบับแก้ไขที่ ${request.revisionNo}` : ""}`}
        badges={<SalesStateBadge label={COSTING_STATUS_LABELS[request.status] || request.status} color={COSTING_STATUS_TONES[request.status]} />}
        actions={canEdit ? (
          <button type="button" className="btn" onClick={openEdit} disabled={saving}>
            <Pencil size={14} /> แก้ไขข้อมูล
          </button>
        ) : null}
        facts={[
          { key: "moq", icon: Calculator, label: "MOQ", value: `${qty(request.moq)} ชิ้น` },
          { key: "items", icon: Package, label: "สินค้า", value: `${(request.items || []).length} รายการ` },
          { key: "pricing", label: "ราคาวัสดุ", value: pricing.total ? `${pricing.quoted}/${pricing.total}` : "ไม่ต้องขอราคา" },
          { key: "approval", label: "อนุมัติ", value: `${approval.approved}/${approval.total}` },
        ]}
      />

      <DetailPageLayout
        asideLabel="สรุปและจัดการใบขอราคาผลิต"
        aside={(
          <>
            <DocumentSummaryCard
              title="สรุปใบขอราคา"
              rows={[
                { id: "moq", label: "MOQ", value: `${qty(request.moq)} ชิ้น` },
                { id: "items", label: "สินค้า", value: `${(request.items || []).length} รายการ` },
                { id: "pricing", label: "ราคาวัสดุ", value: pricing.total ? `${pricing.quoted}/${pricing.total}` : "ครบ" },
                { id: "approval", label: "อนุมัติ", value: `${approval.approved}/${approval.total}${approval.returned ? ` · ตีกลับ ${approval.returned}` : ""}` },
              ]}
              status={COSTING_STATUS_LABELS[request.status] || request.status}
              statusColor={COSTING_STATUS_TONES[request.status]}
            />
            <DocumentControlCard
              status={COSTING_STATUS_LABELS[request.status] || request.status}
              statusColor={COSTING_STATUS_TONES[request.status]}
              statusDescription="การดำเนินการระดับใบขอราคา"
              workflowSteps={workflowSteps}
              primaryAction={documentPrimaryAction}
              secondaryActions={[
                {
                  id: "withdraw",
                  kind: "withdraw",
                  icon: Undo2,
                  onClick: () => setWithdrawForm({ reason: "" }),
                  visible: canWithdraw,
                },
                {
                  id: "fill-prices",
                  label: "ดึงราคาล่าสุดทุกบรรทัด",
                  kind: "refresh",
                  icon: RefreshCw,
                  onClick: fillFromLibrary,
                  visible: canEdit && editableStatus,
                },
                {
                  id: "revise",
                  label: `ออกฉบับแก้ไข (rev.${(request.revisionNo || 1) + 1})`,
                  kind: "revise",
                  icon: Copy,
                  onClick: revise,
                  visible: canFeed && ["approved", "linked"].includes(request.status),
                },
              ]}
              dangerActions={[
                {
                  id: "cancel",
                  label: "ยกเลิกใบ",
                  kind: "cancel",
                  icon: Ban,
                  onClick: () => setPendingCancel(true),
                  visible: canEdit,
                },
              ]}
              busy={saving}
            />
            {request.dealId ? (
              <RelatedDocumentCard
                title="ดีลต้นทาง"
                meta={request.customerName || "ดีลที่ใช้สร้างใบขอราคา"}
                actions={(
                  <Link href={`/sa/deals/${request.dealId}`} className="btn ghost sm">
                    <ExternalLink size={13} /> เปิดดีลต้นทาง
                  </Link>
                )}
              >
                ใบขอราคานี้อ้างอิงข้อมูลสินค้าและลูกค้าจากดีล
              </RelatedDocumentCard>
            ) : null}
          </>
        )}
      >
        <div>
          <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span
            className="status-pill"
            style={{ color: COSTING_STATUS_TONES[request.status], borderColor: "currentColor" }}
          >
            {COSTING_STATUS_LABELS[request.status] || request.status}
          </span>
          <span className="chip">MOQ {fmtNumber(request.moq)} ชิ้น</span>
          <span className="chip">
            ราคา {pricing.total === 0 ? "—" : `${pricing.quoted}/${pricing.total}`}
          </span>
          <span className="chip" style={{ color: approval.returned > 0 ? "var(--red)" : undefined }}>
            อนุมัติ {approval.approved}/{approval.total}
            {approval.returned > 0 ? ` · ตีกลับ ${approval.returned}` : ""}
          </span>
          <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
            ผู้ขอ {request.requestedByName || "—"}
          </span>
          {/* ลิงก์กลับดีลต้นทาง — เฉพาะใบที่ผูกดีล (ใบสำรวจไม่มีดีล) */}
          {request.dealId && (
            <Link
              href={`/sa/deals/${request.dealId}`}
              style={{ fontSize: "var(--fs-5)", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <ExternalLink size={12} /> เปิดดีลต้นทาง
            </Link>
          )}
        </div>
        {request.note && (
          <ReadableText text={request.note} lines={4} style={{ marginTop: 12, fontSize: "var(--fs-7)", color: "var(--text-2)" }} />
        )}
        {request.status === "cancelled" && request.cancelReason && (
          <div style={{ marginTop: 8, fontSize: "var(--fs-7)", color: "var(--red)" }}>
            <strong>เหตุผลที่ยกเลิก: </strong><ReadableText text={request.cancelReason} lines={4} />
          </div>
        )}
      </div>

      {(request.items || []).map((item) => {
        const cost = itemUnitCost(item.components || []);
        return (
          <div key={item.id} className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: "var(--fs-9)" }}>{item.productLabel}</strong>
              <span className="ui-badge" style={{ background: "var(--panel-2)", color: "var(--text-2)" }}>
                {item.categoryCode}
              </span>
              {item.fragranceName && <span className="chip">{item.fragranceName}</span>}
              {item.formulaCode && (
                <span className="chip" style={{ color: "var(--violet)" }}>สูตร {item.formulaCode}</span>
              )}
              <span className="spacer" style={{ flex: 1 }} />
              <span
                className="status-pill"
                style={{
                  color: item.approvalStatus === "approved" ? "var(--green)"
                    : item.approvalStatus === "returned" ? "var(--red)" : "var(--amber)",
                  borderColor: "currentColor",
                }}
              >
                {ITEM_APPROVAL_LABELS[item.approvalStatus] || item.approvalStatus}
              </span>
            </div>

            {/* สถานะการผูก FG — ไปต่อ = กดขึ้นทะเบียน/ผูก FG เดิม */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              {item.productId ? (
                <span style={{ fontSize: "var(--fs-5)", color: "var(--green)" }}>ผูกสินค้าแล้ว (FG)</span>
              ) : (
                <>
                  <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>ยังไม่ผูกสินค้า (FG)</span>
                  {canEdit || ["approved", "linked"].includes(request.status) ? (
                    <>
                      <button type="button" className="btn sm" onClick={() => registerFg(item)}>
                        ขึ้นทะเบียน FG จากรายการนี้
                      </button>
                      <button type="button" className="btn sm" disabled={saving} onClick={() => openLinkFg(item)}>
                        ผูก FG เดิม
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>

            {item.approvalStatus === "returned" && item.returnReason && (
              <div style={{ margin: "0 0 12px", fontSize: "var(--fs-7)", color: "var(--red)" }}>
                <strong>ผู้บริหารตีกลับ: </strong><ReadableText text={item.returnReason} lines={4} />
              </div>
            )}

            <TableScroll>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>รายการต้นทุน</th>
                    <th style={{ width: 230 }}>วัสดุในทะเบียน</th>
                    <th style={{ width: 110 }}>กรัม/ชิ้น</th>
                    <th style={{ width: 170 }}>ชั้นราคาที่ใช้</th>
                    <th style={{ width: 200 }}>ราคาวัสดุ (ตรึงในใบ)</th>
                    <th style={{ width: 120 }}>ต้นทุน/ชิ้น</th>
                  </tr>
                </thead>
                <tbody>
                  {(item.components || []).map((component) => {
                    const unit = componentUnitCost(component);
                    const internal = !component.sourceDept;
                    const state = componentLibraryStatus(component, materials, { todayIso });
                    const staleSnapshot = componentSnapshotExpired(component, materials, todayIso);
                    const material = materials.find((m) => m.id === component.materialId) || null;
                    const tiers = revisionTiers(latestRevision(material?.revisions || []));
                    const suggestTier = suggestedTierForComponent(material, suggestQty);
                    return (
                      <tr key={component.id}>
                        <td>
                          {component.label}
                          {component.required === false && (
                            <span style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}> (ไม่บังคับ)</span>
                          )}
                          <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>
                            {COST_LINE_KIND_LABELS[component.kind] || component.kind}
                            {component.sourceDept ? ` · ขอจาก ${component.sourceDept}` : " · คิดภายใน"}
                          </div>
                        </td>

                        {/* วัสดุในทะเบียน — ผูกด้วย id ไม่ใช่เทียบชื่อ (0159) */}
                        <td>
                          {internal ? (
                            <span style={{ color: "var(--text-3)" }}>—</span>
                          ) : canEdit ? (
                            <MaterialPicker
                              materials={materials}
                              kind={component.kind}
                              customerId={request.customerId || null}
                              value={{ materialId: component.materialId || null, label: material?.label || "" }}
                              disabled={saving}
                              ariaLabel={`เลือกวัสดุของบรรทัด ${component.label}`}
                              onChange={(picked) => {
                                if (picked.isNew) return;   // ของใหม่ต้องไปสร้างที่ทะเบียนวัสดุ
                                patchComponent(component.id, { materialId: picked.materialId },
                                  "ผูกวัสดุกับบรรทัดแล้ว");
                              }}
                              allowCreate={false}
                            />
                          ) : (
                            <span>{material?.label || <span style={{ color: "var(--text-3)" }}>ยังไม่ผูกวัสดุ</span>}</span>
                          )}
                          {!internal && (
                            <div style={{ fontSize: "var(--fs-3)", marginTop: 4, color: LIBRARY_TONE[state.status] }}>
                              {COMPONENT_LIBRARY_LABELS[state.status] || ""}
                            </div>
                          )}
                        </td>

                        {/* กรัม/ชิ้น — แม่แบบให้แค่ค่าตั้งต้น แก้ได้ตลอด (บั๊ก 3) */}
                        <td>
                          {component.unitBasis !== "per_kg" ? (
                            <span style={{ color: "var(--text-3)" }}>—</span>
                          ) : canEdit ? (
                            <input
                              className="premium-input" type="number" min="0" step="0.01"
                              style={{ width: 90 }} disabled={saving} placeholder="กรัม"
                              aria-label={`กรัมต่อชิ้นของบรรทัด ${component.label}`}
                              value={gramsDraft[component.id] ?? (component.gramsPerUnit ?? "")}
                              onChange={(e) => setGramsDraft((d) => ({ ...d, [component.id]: e.target.value }))}
                              onBlur={(e) => {
                                const next = e.target.value;
                                if (String(component.gramsPerUnit ?? "") === String(next)) return;
                                patchComponent(component.id, { gramsPerUnit: next }, "บันทึกกรัม/ชิ้นแล้ว");
                              }}
                            />
                          ) : (
                            component.gramsPerUnit ?? <span style={{ color: "var(--text-3)" }}>—</span>
                          )}
                        </td>

                        {/* ชั้นราคา — ระบบแนะนำจากจำนวนในใบ แต่เซลตัดสิน (มติ 1+2) */}
                        <td>
                          {internal ? (
                            <span style={{ color: "var(--text-3)" }}>—</span>
                          ) : (
                            <>
                              {canEdit && tiers.length > 0 ? (
                                <Select
                                  value={component.priceTierQty == null ? "" : String(component.priceTierQty)}
                                  disabled={saving}
                                  aria-label={`ชั้นราคาของบรรทัด ${component.label}`}
                                  onChange={(e) => patchComponent(component.id,
                                    { priceTierQty: e.target.value || null }, "เปลี่ยนชั้นราคาแล้ว")}
                                  options={[
                                    { value: "", label: "ชั้นตั้งต้น (ต่ำสุด)" },
                                    ...tiers.filter((t) => t.qty != null).map((t) => ({
                                      value: String(t.qty),
                                      label: `${qty(t.qty)} ชิ้นขึ้นไป · ${money(tierUnitPrice(latestRevision(material.revisions), t))} ฿`,
                                    })),
                                  ]}
                                />
                              ) : (
                                <span>
                                  {component.priceTierQty == null
                                    ? <span style={{ color: "var(--text-3)" }}>ไม่แบ่งชั้น</span>
                                    : `ชั้น ${qty(component.priceTierQty)}`}
                                </span>
                              )}
                              {suggestQty != null && (
                                <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", marginTop: 4 }}>
                                  ใบนี้ {(request.items || []).length} SKU × {qty(request.moq)} = {qty(suggestQty)} ชิ้น
                                  {suggestTier != null && suggestTier !== component.priceTierQty
                                    ? ` → แนะนำชั้น ${qty(suggestTier)}`
                                    : ""}
                                </div>
                              )}
                              {state.tierBelow && (
                                <div style={{ fontSize: "var(--fs-3)", color: "var(--amber)" }}>
                                  ชั้นที่เลือกต่ำกว่าชั้นต่ำสุดที่มี — ราคาที่ได้เป็นของล็อตใหญ่กว่า
                                </div>
                              )}
                            </>
                          )}
                        </td>

                        <td>
                          {internal ? (
                            <span style={{ color: "var(--text-3)" }}>คิดภายใน</span>
                          ) : component.priceStatus === "quoted" ? (
                            <div>
                              <span>
                                {money(component.pricePerKg ?? component.pricePerUnit)} {component.unitBasis === "per_kg" ? "฿/กก." : "฿/ชิ้น"}
                              </span>
                              {staleSnapshot && (
                                <div style={{ fontSize: "var(--fs-3)", color: "var(--red)", marginTop: 2 }}>
                                  ⚠️ ราคาที่ตรึงไว้เกินอายุแล้ว
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-3)" }}>ยังไม่ดึงราคา</span>
                          )}
                        </td>
                        <td>{unit == null ? <span style={{ color: "var(--text-3)" }}>—</span> : money(unit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>
                      ต้นทุนรวมต่อชิ้น
                      {!cost.complete && (
                        <span style={{ color: "var(--amber)", fontWeight: "var(--fw-normal)", fontSize: "var(--fs-5)" }}>
                          {" "}(ยังไม่ครบ — รอราคาบางรายการ)
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: "var(--fw-semibold)" }}>{money(cost.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableScroll>

            <div style={{ marginTop: 12 }}>
              <div className="toolbar-label" style={{ marginBottom: 6 }}>ราคาผลิตที่อนุมัติ (ต่อชั้นจำนวน)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(item.tiers || []).map((tier) => (
                  <span
                    key={tier.id}
                    className="chip"
                    style={isMoqTier(tier, request.moq) ? { color: "var(--accent)" } : undefined}
                  >
                    {fmtNumber(tier.qty)} ชิ้น:{" "}
                    {tier.approvedUnitPrice == null ? "รออนุมัติ" : `${money(tier.approvedUnitPrice)} ฿`}
                    {isMoqTier(tier, request.moq) ? " · MOQ" : ""}
                  </span>
                ))}
              </div>
            </div>

            {/* รูปตัวอย่าง/สเปกของสินค้าตัวนี้ — RD/PC ดูประกอบตอนตอบราคา
                แนบได้เฉพาะฝ่ายขายเจ้าของใบ (ฝ่ายอื่นเห็นอย่างเดียว) */}
            <div style={{ marginTop: 12 }}>
              <div className="toolbar-label">ไฟล์แนบของสินค้านี้</div>
              <AttachmentsPanel
                entityType="costing_item"
                entityId={item.id}
                canEdit={canEdit}
                inlineUpload
              />
            </div>

            {/* ป้อนต้นทุนกลับสินค้า — โผล่หลังอนุมัติ และหายเมื่อป้อนแล้ว */}
            {item.costFedAt ? (
              <p style={{ margin: "12px 0 0", fontSize: "var(--fs-5)", color: "var(--green)" }}>
                ป้อนราคาผลิต {money(item.costFedPrice)} ฿/ชิ้น เข้าสินค้าแล้ว
                {item.costFedTierQty ? ` (อ้างชั้น ${fmtNumber(item.costFedTierQty)} ชิ้น)` : ""}
                {item.costFedByName ? ` โดย ${item.costFedByName}` : ""}
                <span style={{ color: "var(--text-3)" }}>
                  {" "}— ฝ่ายขายปรับราคาเพิ่มได้ที่ฐานข้อมูลสินค้า
                </span>
              </p>
            ) : canFeed && item.approvalStatus === "approved" && (
              <div className="action-bar" style={{ marginTop: 12 }}>
                <span style={{ marginRight: "auto", fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
                  {feedCostError(item, request.moq)
                    || `จะเขียนราคาผลิต ${money(feedCostValue(item, request.moq))} ฿/ชิ้น ลงสินค้าที่ผูกไว้`}
                </span>
                <button
                  type="button" className="btn btn-accent" disabled={saving || !!feedCostError(item, request.moq)}
                  onClick={() => setPendingFeed(item)}
                >
                  <ArrowDownToLine size={14} /> ป้อนราคาผลิตเข้า FG
                </button>
              </div>
            )}

            {canDecideItem(me, request, item) && (
              <div className="action-bar" style={{ marginTop: 12 }}>
                <button
                  type="button" className="btn" disabled={saving}
                  onClick={() => { setDecision({ itemId: item.id, mode: "return" }); setReturnReason(""); }}
                >
                  <Undo2 size={14} /> ตีกลับให้แก้
                </button>
                <button
                  type="button" className="btn btn-success" disabled={saving}
                  onClick={() => {
                    setDecision({ itemId: item.id, mode: "approve" });
                    setTierDraft(Object.fromEntries((item.tiers || [])
                      .map((t) => [t.id, t.approvedUnitPrice ?? ""])));
                  }}
                >
                  <Check size={14} /> อนุมัติราคาผลิต
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* เธรดของใบ (mig 0163) — เหตุผลที่ผู้บริหารตีกลับเคยอยู่ในช่อง returnReason
          ช่องเดียวต่อรายการ และถูกล้างทุกครั้งที่เซลยื่นใหม่ ใบที่วนสามรอบจึงเหลือ
          เหตุผลรอบสุดท้ายรอบเดียว · เธรดเก็บครบทุกรอบ */}
      <DetailCard icon={MessageSquare} eyebrow="Discussion" title="พูดคุยในใบนี้">
        <UpdateThread
          entityType="costing_request"
          entityId={request.id}
          placeholder="ชี้แจงต้นทุน / ถามผู้บริหาร / บันทึกข้อตกลง..."
          emptyText="ยังไม่มีการพูดคุย — ชี้แจงที่มาของต้นทุนหรือถามเงื่อนไขไว้ตรงนี้ได้"
          onPosted={load}
        />
      </DetailCard>
        </div>
      </DetailPageLayout>

      <Modal open={!!form} onClose={closeEdit} title="แก้ไขใบขอราคา" size="lg" dismissible={!saving}>
        {form && (
          <>
            <CostingRequestForm
              mode="edit"
              form={form}
              setForm={setForm}
              productTypes={productTypes}
              templateCategories={templateCategories}
              dealLabel={request.customerName ? `${request.customerName} (ดีล ${request.dealId})` : request.dealId}
              lockedItemIds={lockedItemIds}
            />
            <div className="action-bar" style={{ marginTop: 20 }}>
              <button type="button" className="btn ghost" onClick={closeEdit} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={() => setPendingSave(true)} disabled={saving}>
                บันทึก
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingSave}
        title="ยืนยันบันทึกใบขอราคา"
        description="สินค้าที่เพิ่มใหม่จะกางบรรทัดต้นทุนจากแม่แบบของประเภทนั้นให้อัตโนมัติ"
        detail="รายการที่ฝ่ายอื่นตอบราคาแล้วจะไม่ถูกแตะ — ถ้ามีอะไรที่ลบไม่ได้ ระบบจะแจ้งกลับก่อนบันทึก"
        confirmLabel="บันทึก"
        busy={saving}
        onConfirm={save}
        onClose={() => setPendingSave(false)}
      />

      {/* ดึงกลับ = ผู้ยื่นเอาใบของตัวเองคืนก่อนถูกตัดสิน (คู่ตรงข้ามของ "ตีกลับ" ที่เป็น
          การกระทำของผู้บริหาร) — บังคับเหตุผลเหมือน QT/SO เพราะมันจะกลายเป็นบรรทัด
          ในเธรด อธิบายช่วงที่ใบหายไปจากคิวผู้บริหาร */}
      <ReasonDialog
        open={!!withdrawForm}
        title="ดึงกลับใบขอราคาผลิต"
        description={`ใบ ${request.docNo || "-"} จะออกจากคิวผู้บริหารและกลับมาแก้ไขได้`}
        detail="รายการที่ผู้บริหารอนุมัติราคาไปแล้วยังอนุมัติอยู่เหมือนเดิม — ยื่นใหม่แล้วเหลือเฉพาะรายการที่ยังไม่ตัดสิน"
        label="เหตุผลที่ดึงกลับ"
        value={withdrawForm?.reason || ""}
        onChange={(reason) => setWithdrawForm({ reason })}
        onClose={() => setWithdrawForm(null)}
        onConfirm={withdraw}
        confirmLabel="ยืนยันดึงกลับ"
        placeholder="ระบุเหตุผลที่ต้องนำใบกลับมาแก้ไข"
        helpText={`อย่างน้อย 10 ตัวอักษร · ${(withdrawForm?.reason || "").length}/500`}
        error={withdrawForm?.reason && withdrawForm.reason.trim().length < 10 ? "กรุณาระบุอย่างน้อย 10 ตัวอักษร" : ""}
        minLength={10}
        maxLength={500}
        busy={saving}
      />

      <Modal open={pendingCancel} onClose={() => setPendingCancel(false)} title="ยกเลิกใบขอราคา" size="sm" dismissible={!saving}>
        <div className="form-group">
          <label htmlFor="cr-cancel-reason">เหตุผลที่ยกเลิก</label>
          <Textarea
            id="cr-cancel-reason" rows={3} maxLength={500}
            placeholder="เช่น ดีลไม่ไปต่อ / ลูกค้าเปลี่ยนสเปก"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <small style={{ color: "var(--text-3)" }}>
            ใบที่ยกเลิกแล้วเปิดกลับไม่ได้ และยังเก็บไว้เป็นร่องรอย ไม่ได้ถูกลบ
          </small>
        </div>
        <div className="action-bar" style={{ marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={() => setPendingCancel(false)} disabled={saving}>
            ปิด
          </button>
          <button
            type="button" className="btn btn-danger" disabled={saving || !cancelReason.trim()}
            onClick={cancelRequest}
          >
            ยกเลิกใบนี้
          </button>
        </div>
      </Modal>

      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision?.mode === "return" ? "ตีกลับรายการนี้" : "อนุมัติราคาผลิต"}
        size="sm"
        dismissible={!saving}
      >
        {decision && (() => {
          const item = (request.items || []).find((i) => i.id === decision.itemId);
          if (!item) return null;
          const cost = itemUnitCost(item.components || []);
          return (
            <>
              <p style={{ marginTop: 0, color: "var(--text-2)" }}>{item.productLabel}</p>
              {decision.mode === "return" ? (
                <div className="form-group">
                  <label htmlFor="cr-return-reason">เหตุผลที่ตีกลับ</label>
                  <Textarea
                    id="cr-return-reason" rows={3} maxLength={500}
                    placeholder="เช่น ต้นทุนบรรจุภัณฑ์สูงผิดปกติ ให้ตรวจสอบราคาใหม่"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                  <small style={{ color: "var(--text-3)" }}>
                    ฝ่ายขายจะเห็นเหตุผลนี้ และรายการอื่นที่อนุมัติแล้วจะไม่ถูกกระทบ
                  </small>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: "var(--fs-7)", color: "var(--text-2)" }}>
                    ต้นทุนรวมต่อชิ้น <strong>{money(cost.total)} ฿</strong>
                    {!cost.complete && (
                      <span style={{ color: "var(--amber)" }}> (ยังไม่ครบ)</span>
                    )}
                  </p>
                  {(item.tiers || []).map((tier) => (
                    <div className="form-group" key={tier.id}>
                      <label htmlFor={`tier-${tier.id}`}>
                        ราคาผลิตที่ {fmtNumber(tier.qty)} ชิ้น
                        {isMoqTier(tier, request.moq) ? " (MOQ)" : ""}
                      </label>
                      <input
                        id={`tier-${tier.id}`} className="premium-input"
                        type="number" min="0" step="0.01" placeholder="บาท/ชิ้น"
                        value={tierDraft[tier.id] ?? ""}
                        onChange={(e) => setTierDraft((d) => ({ ...d, [tier.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <small style={{ color: "var(--text-3)" }}>
                    ต้องกรอกครบทุกชั้น — การอนุมัติจะถูกบันทึกพร้อมลายเซ็นอิเล็กทรอนิกส์ของคุณ
                  </small>
                </>
              )}
              <div className="action-bar" style={{ marginTop: 16 }}>
                <button type="button" className="btn ghost" onClick={() => setDecision(null)} disabled={saving}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={decision.mode === "return" ? "btn btn-danger" : "btn btn-success"}
                  disabled={saving || (decision.mode === "return" && !returnReason.trim())}
                  onClick={sendDecision}
                >
                  {decision.mode === "return" ? "ตีกลับ" : "อนุมัติ"}
                </button>
              </div>
            </>
          );
        })()}
      </Modal>

      <ConfirmDialog
        open={!!pendingFeed}
        title="ป้อนราคาผลิตเข้าสินค้า"
        description={pendingFeed
          ? `เขียนราคาผลิต ${money(feedCostValue(pendingFeed, request.moq))} บาท/ชิ้น ลงสินค้าที่ผูกกับ "${pendingFeed.productLabel}"`
          : ""}
        detail="นี่คือราคาตั้งต้นจากผู้บริหาร — ฝ่ายขายปรับเพิ่ม (บวก margin) ได้ภายหลังที่ฐานข้อมูลสินค้า ซึ่งจะผ่านการอนุมัติของหัวหน้าฝ่ายขายตามปกติ; ราคาที่ผู้บริหารอนุมัติยังถูกตรึงไว้ในใบนี้ให้ย้อนดูได้เสมอ"
        confirmLabel="ป้อนราคาผลิต"
        busy={saving}
        onConfirm={() => runAction("/feed-cost", {
          method: "POST", body: JSON.stringify({ itemId: pendingFeed.id }),
        }, "ป้อนราคาผลิตเข้าสินค้าแล้ว").then((ok) => { if (ok) setPendingFeed(null); })}
        onClose={() => setPendingFeed(null)}
      />

      <Modal open={!!pendingLink} onClose={() => setPendingLink(null)} title="ผูกสินค้า (FG) เดิม" size="sm" dismissible={!saving}>
        {pendingLink && (
          <>
            <p style={{ marginTop: 0, color: "var(--text-2)" }}>{pendingLink.item.productLabel}</p>
            <div className="form-group">
              <label htmlFor="link-fg">เลือกสินค้าในระบบ</label>
              <SearchableSelect
                value=""
                onChange={(value) => value && linkFg(pendingLink.item.id, value)}
                options={productSelectOptions(linkProducts)}
                placeholder="ค้นหาด้วยรหัส FG หรือชื่อสินค้า"
                ariaLabel="เลือกสินค้า"
              />
              <small style={{ color: "var(--text-3)" }}>
                {request.customerId ? "แสดงเฉพาะสินค้าของลูกค้าเจ้าของใบนี้" : "ใบไม่ผูกลูกค้า — แสดงสินค้าทั้งหมด"}
                {" · "}เลือกแล้วผูกทันที
              </small>
            </div>
            <div className="action-bar" style={{ marginTop: 12 }}>
              <button type="button" className="btn ghost" onClick={() => setPendingLink(null)} disabled={saving}>ปิด</button>
            </div>
          </>
        )}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
