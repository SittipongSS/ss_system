"use client";

// หน้ารายละเอียดสัญญา (mig 0278)
//
// โครงหน้าตามหน้าเอกสารอื่นของสายขาย: เนื้อซ้าย · การ์ดจัดการที่รางขวา
// (`controlFirst` เพื่อให้จอแคบเห็นสถานะ+ปุ่มก่อนเนื้อ — เหตุผลอยู่ที่ DetailPage.js)
//
// ⚠️ ปุ่มระดับใบอยู่ที่ **การ์ดจัดการที่เดียว** (ม-49/ม-57) — ห้ามวาดปุ่มซ้ำในเนื้อ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FileSignature, FileText, Handshake, Pencil, Printer, ShieldCheck, Trash2, X } from "lucide-react";
import SaWorkspace from "@/components/ui/Workspace";
import AccessDenied from "@/components/ui/AccessDenied";
import StatusNotice from "@/components/ui/StatusNotice";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import RecordControlCard from "@/components/ui/RecordControlCard";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { approvalPrompt } from "@/lib/approvalPrompt";
import ContractAddendaCard from "@/components/salesPlanning/ContractAddendaCard";
import ContractFormFields from "@/components/salesPlanning/ContractFormFields";
import { contractKindBadge, contractStatusBadge } from "@/components/salesPlanning/ui";
import { useCan, useRole } from "@/lib/roleContext";
import { fmtDate, naText, NA } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import {
  CONTRACT_SOURCE_LABELS, EXTERNAL_DOC_KINDS, EXTERNAL_DOC_KIND_LABELS,
  canDeleteContract, canSignContract, contractKindLabel, daysAwaitingSignature, isContractEditable,
  externalApproveError, externalApproveOpenError, externalDocKindLabel, isExternalContract,
  showExternalApprove,
  showSignedApprove, signedApproveError,
} from "@/lib/sales/contracts";
import { buildContractLifecycle } from "@/lib/sales/contractLifecycle";
import { contractTemplateFields, missingContractFields } from "@/lib/sales/contractTemplates";
import styles from "./page.module.css";
import { ATTACHMENT_TYPES, EXTERNAL_DOC_TYPE, SIGNED_CONTRACT_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { attachmentHref } from "@/lib/master/attachmentStorage";
import { apiFetch } from "@/lib/apiFetch";

export default function ContractDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canView = useCan("salesplan:view");
  const canEditCap = useCan("salesplan:edit");
  /* ⚠️ `RoleContext` ถือ **สตริงบทบาท** ไม่ใช่อ็อบเจกต์ผู้ใช้ — `const { user } = useRole()`
     ที่เขียนไว้เดิมจึงได้ `undefined` มาตลอด (ไม่พังเพราะ `contractLifecycle` ไม่ได้ใช้
     `user` เลยสักจุด) · ด่านอนุมัติเอกสารภายนอกอ่าน `role` จริง จึงต้องประกอบให้ถูก */
  const role = useRole();
  const user = useMemo(() => ({ role }), [role]);

  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({ fields: {}, contractDate: "" });
  const [signOpen, setSignOpen] = useState(false);
  const [signDate, setSignDate] = useState("");
  const [signFileId, setSignFileId] = useState("");
  /* อนุมัติเอกสารภายนอกใช้แทนสัญญา (mig 0322) — ช่วงมีผลบังคับที่นี่ ต่างจากใบ
     generated ที่กรอกทีหลังได้ เพราะ "จ่ายถึง" กับทะเบียนต่อสัญญาอ่านสองค่านี้ตรง ๆ */
  /* โมดัลยืนยันของขั้นอนุมัติ — กติกา [[approval-confirm-modals]] (#1223):
     ทุกการอนุมัติต้องมีโมดัลบอก **ผลลัพธ์** ไม่ใช่แค่ถาม "แน่ใจไหม" */
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [apEffective, setApEffective] = useState("");
  const [apExpiry, setApExpiry] = useState("");
  const [apDocDate, setApDocDate] = useState("");
  const [externalFileId, setExternalFileId] = useState("");
  const [externalDocs, setExternalDocs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "โหลดสัญญาไม่สำเร็จ");
      setContract(data);
      setForm({
        fields: { ...(data.fields || {}) },
        contractDate: data.contractDate || "",
        externalDocKind: data.externalDocKind || "",
        externalRef: data.externalRef || "",
      });
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const canEdit = !!contract?.canEdit && canEditCap;
  /* ที่มาของใบตัดสินหลายอย่างบนหน้านี้ (ปุ่มพิมพ์ · การ์ดข้อมูล · ขั้นที่ใบเดินผ่าน) —
     อ่านครั้งเดียวจากตัวตัดสินกลาง ไม่ใช่เทียบ `contract.source === "external"` กระจาย */
  const external = isExternalContract(contract);
  /* 🪤 **ต้องผูกกับ `source` ไม่ใช่ `kind`** — ใบ external ชนิดที่มีแม่แบบ (`scent_design`)
     ยังคืนช่องมาครบ 13 ช่อง ⇒ โหมดแก้กางฟอร์มของแม่แบบให้กรอก แล้ว PATCH ก็เขียนกลับได้
     = `fields` ที่ route สร้างเพิ่งกันออกไปเดินกลับเข้ามาทางประตูหลัง (และค่าที่กรอก
     ก็ไม่มีที่แสดง เพราะโหมดอ่านสลับไปโชว้บล็อกของใบ external แทนแล้ว) */
  const templateFields = useMemo(
    () => (external ? [] : contractTemplateFields(contract?.kind)),
    [external, contract?.kind],
  );
  const lifecycle = useMemo(() => buildContractLifecycle({ canEdit, external }), [canEdit, external]);

  // ช่องบังคับที่ยังว่าง — บอกตั้งแต่ก่อนกดออกสัญญา ไม่ใช่ให้ API ตอบ 400 ทีหลัง
  const missing = useMemo(
    /* ใบ external ไม่มีช่องบังคับของแม่แบบ (ตั้งใจ) — ทวงต่อไปคือส่งคนไปกรอกของที่
       ระบบเพิ่งถอดออกเอง แล้วค่าที่กรอกก็ไม่ถูกใช้ที่ไหน */
    () => (contract && !external ? missingContractFields(contract.kind, contract.fields) : []),
    [contract, external],
  );

  const act = async (path, body, okMessage) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${id}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ดำเนินการไม่สำเร็จ");
      notifyToast.success(okMessage);
      await load();
      return true;
    } catch (err) {
      notifyToast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onTransition = async (transitionId, values = {}) => {
    if (transitionId === "issue") return act("/issue", {}, "ออกสัญญาแล้ว");
    if (transitionId === "cancel") return act("/cancel", { reason: values.reason }, "ยกเลิกสัญญาแล้ว");
    if (transitionId === "revise") return revise();
    return false;
  };

  /* ออกฉบับแก้ไข = ได้ "ใบใหม่" ⇒ ต้องพาไปที่ใบนั้น ไม่ใช่รีเฟรชใบเดิมที่กลายเป็น
     อ่านอย่างเดียวไปแล้ว (คนกดจะงงว่าทำไมกดแล้วแก้อะไรไม่ได้) */
  const revise = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${id}/revise`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ออกฉบับแก้ไขไม่สำเร็จ");
      notifyToast.success(`ออกฉบับแก้ไขแล้ว — แก้ข้อมูลแล้วกดออกสัญญาอีกครั้ง`);
      router.push(`/sa/contracts/${data.id}`);
      return true;
    } catch (err) {
      notifyToast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        /* ใบ external ไม่มี `fields` ให้ส่ง (server ก็ทิ้งอยู่แล้ว) — ที่ต้องส่งคือ
           ข้อมูลของเอกสารที่ใช้แทนสัญญา ซึ่งเป็น "ข้อมูลที่ระบบต้องการ" ของสายนี้ */
        body: JSON.stringify(external
          ? {
            contractDate: form.contractDate,
            externalDocKind: form.externalDocKind,
            externalRef: form.externalRef,
          }
          : { fields: form.fields, contractDate: form.contractDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      notifyToast.success("บันทึกร่างสัญญาแล้ว");
      setEditing(false);
      await load();
    } catch (err) {
      notifyToast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const approvePayload = {
    signedFileId: externalFileId,
    effectiveDate: apEffective,
    expiryDate: apExpiry,
    signedDate: apDocDate || apEffective,
  };
  /* ด่านตัวเดียวกับที่ API ใช้ปฏิเสธ — ปุ่มกับหลังบ้านขัดกันไม่ได้ (ใช้กับปุ่ม *ยืนยัน* ในโมดัล) */
  const approveGate = contract ? externalApproveError(contract, user, approvePayload) : "ไม่พบสัญญา";
  /* 🔴 **ปุ่มบนการ์ดจัดการต้องใช้ด่านชั้น "เปิดฟอร์ม" เท่านั้น** — ของเดิมใช้ `approveGate`
     ซึ่งอ่านวันที่จาก state ของโมดัล ⇒ ปุ่มถูกปิดด้วยเหตุ "ยังไม่ระบุวันที่เริ่มมีผล"
     แต่ช่องกรอกวันอยู่ในโมดัลที่ปุ่มนั้นเป็นคนเปิด = **เดดล็อก** กดอนุมัติไม่ได้เลยสักใบ */
  const approveOpenGate = contract
    ? externalApproveOpenError(contract, user, { signedFileId: externalFileId })
    : "ไม่พบสัญญา";

  /* ── AE Sup รับรองการลงนาม (mig 0323 · มติผู้ใช้ 2026-08-31) ────────────────
     ด่านตัวเดียวกับที่ API ใช้ปฏิเสธ — ปุ่มกับหลังบ้านขัดกันไม่ได้ */
  const signApproveGate = contract ? signedApproveError(contract, user) : "ไม่พบสัญญา";
  const runConfirmed = async () => {
    const action = confirmState?.action;
    if (!action) return;
    setConfirmBusy(true);
    try {
      const done = await action();
      if (done !== false) setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const submitSignApprove = async () => {
    await act("/approve-signed", {}, "รับรองการลงนามแล้ว — สัญญาใช้งานได้");
  };

  const submitApprove = async () => {
    const done = await act("/approve-external", approvePayload, "อนุมัติเอกสารใช้แทนสัญญาแล้ว");
    if (done) setApproveOpen(false);
  };

  const submitSign = async () => {
    if (!signDate) { notifyToast.error("ระบุวันที่ลงนาม"); return; }
    if (!signFileId) { notifyToast.error("แนบไฟล์สัญญาที่ลงนามแล้วก่อน"); return; }
    const done = await act("/sign", { signedDate: signDate, signedFileId: signFileId }, "บันทึกการลงนามแล้ว");
    if (done) setSignOpen(false);
  };

  /* ⚠️ ต้องเป็น callback ที่ identity คงที่ — `AttachmentsPanel` เรียก `onItemsChange`
     ใน effect ที่มี dependency เป็นตัวฟังก์ชัน ถ้าสร้างใหม่ทุกเรนเดอร์ effect จะยิงซ้ำ
     ทุกรอบ (รอดมาได้เพราะ setState ค่าเดิมไม่ทำให้เรนเดอร์ใหม่ — พึ่งความบังเอิญนั้นไม่ได้) */
  const handleAttachments = useCallback((items) => {
    const signed = (items || []).find((item) => item.docType === SIGNED_CONTRACT_DOC_TYPE);
    setSignFileId(signed?.id || "");
    // เอกสารที่ใช้แทนสัญญาเป็นคีย์คนละตัว — ใบ external ไม่มี "สัญญาที่ลงนามแล้ว"
    const externalDocs = (items || []).filter((item) => item.docType === EXTERNAL_DOC_TYPE);
    setExternalFileId(externalDocs[0]?.id || "");
    /* ปุ่มบนการ์ดจัดการของใบ external พาไปที่ **ไฟล์ตัวจริง** ⇒ ต้องรู้ที่อยู่ ไม่ใช่แค่ id
       · ใช้ตัวหาที่อยู่ตัวเดียวกับที่การ์ดไฟล์ใช้ ไม่ประกอบ URL เอง
       ⚠️ เก็บทั้งชุด ไม่ใช่ใบแรกใบเดียว — แนบ PO ได้หลายใบ และหลังอนุมัติแล้ว
          "ใบที่ใช้แทนสัญญา" คือใบที่ AE Sup กดอนุมัติ (`signedFileId`) ซึ่งอาจไม่ใช่ใบแรก */
    setExternalDocs(externalDocs.map((item) => ({ id: item.id, href: attachmentHref(item) })));
  }, []);

  /* ไฟล์ที่ปุ่มจะพาไป: หลังอนุมัติแล้วคือใบที่ AE Sup กดอนุมัติจริง (`signedFileId`)
     ก่อนหน้านั้นคือใบแรกที่แนบไว้ — ร่างที่แนบแล้วต้องเปิดดูได้ก่อนกดอนุมัติ */
  const externalFileHref = useMemo(() => {
    if (!externalDocs.length) return "";
    const approved = externalDocs.find((doc) => doc.id === contract?.signedFileId);
    return (approved || externalDocs[0]).href || "";
  }, [externalDocs, contract?.signedFileId]);

  /* ⭐ **ปุ่มเดียว สองความหมาย ตามที่มาของใบ** — ใบที่ระบบเจนมีเอกสารของตัวเองให้พิมพ์
     ส่วนใบ external เอกสารคือไฟล์ที่แนบไว้ · route `/document` ปฏิเสธใบ external แล้ว
     (409) ⇒ ถ้าไม่แยกตรงนี้ ปุ่มจะเปิดแท็บใหม่มาโชว์ JSON error ให้คนอ่าน */
  const openDocument = () => {
    if (external) {
      if (externalFileHref) window.open(externalFileHref, "_blank", "noopener");
      return;
    }
    window.open(`/api/sales-planning/contracts/${id}/document`, "_blank", "noopener");
  };



  const removeDraft = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ลบสัญญาไม่สำเร็จ");
      notifyToast.success("ลบร่างสัญญาแล้ว");
      router.push("/sa/contracts");
      return true;
    } catch (err) {
      notifyToast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return <AccessDenied icon={<FileSignature size={22} />} title="สัญญา" message="บัญชีนี้ยังไม่มีสิทธิ์อ่านเอกสารของสายขาย" back="/sa/contracts" />;
  }

  if (loading || !contract) {
    return (
      <SaWorkspace icon={<FileSignature size={22} />} title="สัญญา">
        {error
          ? <StatusNotice tone="error" title="เปิดสัญญาไม่สำเร็จ">{error}</StatusNotice>
          : <StatusNotice tone="info" title="กำลังโหลด…">กำลังดึงข้อมูลสัญญา</StatusNotice>}
      </SaWorkspace>
    );
  }

  const waitingDays = daysAwaitingSignature(contract);

  /* ป้ายเตือนบนการ์ดจัดการ — ประกอบเป็นลิสต์ก่อน เพื่อให้ "ไม่มีอะไรเตือน" แปลว่า
     ไม่ส่งอะไรไปเลย (ดูคอมเมนต์ที่ prop notices) */
  const notices = [
    contract.quotationNotice ? (
      <span
        key="quotation"
        className={`ui-badge${contract.quotationNotice.tone === "warning" ? " ui-badge-warn" : ""}`}
      >
        {contract.quotationNotice.title}
      </span>
    ) : null,
    /* ⚠️ บอกก่อนกด ไม่ใช่ให้ API ตอบ 400 ทีหลัง */
    missing.length && isContractEditable(contract) ? (
      <span key="missing" className="ui-badge ui-badge-warn">ยังกรอกไม่ครบ: {missing.join(" · ")}</span>
    ) : null,
    contract.status === "awaiting_signature" ? (
      <span key="waiting" className={`ui-badge${waitingDays > 14 ? ` ${styles.late}` : ""}`}>
        รอฉบับลงนามมา {waitingDays ?? 0} วัน
      </span>
    ) : null,
    contract.status === "cancelled" && contract.cancelReason ? (
      <span key="cancelled" className="ui-badge danger">เหตุผลที่ยกเลิก: {contract.cancelReason}</span>
    ) : null,
  ].filter(Boolean);

  return (
    <SaWorkspace
      icon={<FileSignature size={22} />}
      title={`${contractKindLabel(contract.kind)} ${contract.contractNo || "(ฉบับร่าง)"}`}
      subtitle={naText(contract.customerName)}
    >
      <DetailPageLayout
        controlFirst
        asideLabel="สถานะและการจัดการสัญญา"
        aside={(
          <>
            <RecordControlCard
              lifecycle={lifecycle}
              record={contract}
              user={user}
              busy={busy}
              onTransition={onTransition}
              extraActions={[
                /* 🔴 ใบ external เคยได้ปุ่มพิมพ์ตัวเดียวกับใบที่ระบบเจน — ชนิดที่มีแม่แบบจึง
                   เปิดออกมาเป็น "สัญญา" ที่ระบบแต่งเองครบทุกช่อง ส่วนชนิดที่ไม่มีแม่แบบได้
                   409 ที่แนะนำผิดทาง ("ส่งต้นฉบับให้ผู้ดูแลเพิ่ม") ทั้งที่สายนี้ไม่ใช้แม่แบบ
                   ⇒ ปุ่มเดียวกันแต่พาไปคนละที่ตามที่มา · **ไม่ซ่อน** เมื่อยังไม่มีไฟล์ —
                     คนกดปุ่มนี้อยากเห็นเอกสาร ต้องบอกว่าทำไมยังไม่มีให้ดู (กติกา GatedAction) */
                {
                  id: "print",
                  label: external
                    ? "เปิดเอกสารแทนสัญญา"
                    : (contract.contractNo ? "เปิดเอกสารเพื่อพิมพ์" : "ดูตัวอย่างฉบับร่าง"),
                  kind: "print",
                  icon: Printer,
                  slot: "secondary",
                  disabled: external && !externalFileHref,
                  /* ⚠️ ผูกกับเงื่อนไขเดียวกับ `disabled` — `disabledReason` ถูกยัดเป็น `title`
                     ของปุ่มเสมอ ไม่ได้ดูว่าปุ่มปิดอยู่ไหม ⇒ ตั้งลอย ๆ แล้วใบที่ระบบเจนจะได้
                     ทูลทิปเรื่องเอกสารภายนอกติดมาด้วย (เจอตอนไล่ดูจอจริง) */
                  disabledReason: external && !externalFileHref
                    ? "ยังไม่ได้แนบเอกสารที่ใช้แทนสัญญา — แนบที่การ์ดไฟล์ของสัญญาก่อน"
                    : undefined,
                  onClick: openDocument,
                },
                {
                  id: "sign",
                  label: "บันทึกการลงนาม",
                  kind: "submit",
                  icon: FileSignature,
                  slot: "primary",
                  visible: canEdit && canSignContract(contract),
                  onClick: () => { setSignDate(""); setSignOpen(true); },
                },
                /* ⭐ อนุมัติเอกสารแทนสัญญา (มติผู้ใช้ 2026-08-30) — **เฉพาะ AE Supervisor**
                   ⚠️ โชว์เสมอกับคนที่เป็นเจ้าของขั้น แล้วบอกเหตุตอนกด (กติกา GatedAction)
                   ⚠️ นี่คือปุ่มที่ปลดล็อกด่าน "จ่ายก่อนบริการ" ของทั้งเฟส ⇒ ห้ามให้ AE/AC
                      กดได้ (เทสต์ยามล็อกไว้ที่ contracts.test.mjs) */
                /* ⭐ รับรองการลงนาม — ด่านที่สองของสาย generated (มติผู้ใช้ 2026-08-31)
                   ⚠️ คนละปุ่มกับ "อนุมัติเอกสารแทนสัญญา" ข้างล่างโดยตั้งใจ: อันนั้นตัดสิน
                      ว่า *เอกสารอื่นใช้แทนสัญญาได้ไหม* อันนี้ตรวจ *ฉบับที่ลูกค้าเซ็นกลับมา*
                      สองใบไม่มีทางขึ้นพร้อมกันเพราะอยู่คนละสถานะ */
                {
                  id: "approve-signed",
                  label: "รับรองการลงนาม",
                  kind: "approve",
                  icon: ShieldCheck,
                  slot: "primary",
                  visible: showSignedApprove(contract, user),
                  disabled: !!signApproveGate,
                  disabledReason: signApproveGate || undefined,
                  onClick: () => setConfirmState({
                    ...approvalPrompt({
                      title: "รับรองการลงนาม",
                      subject: `${contractKindLabel(contract.kind)} ${contract.contractNo}`,
                      irreversible: true,
                      effects: [
                        "**สัญญาใช้งานได้ทันที** — เปิดบันทึกเพิ่มเติมได้ และงานที่รอสัญญาใบนี้เดินต่อได้",
                        "ชื่อคุณถูกบันทึกเป็นผู้รับรอง",
                        "ตรวจไฟล์ฉบับลงนามที่การ์ด “ไฟล์ของสัญญา” ให้ตรงกับใบนี้ก่อนกด",
                      ],
                      confirmLabel: "ยืนยันรับรอง",
                    }),
                    action: submitSignApprove,
                  }),
                },
                {
                  id: "approve-external",
                  label: "อนุมัติเอกสารแทนสัญญา",
                  kind: "approve",
                  icon: ShieldCheck,
                  slot: "primary",
                  visible: showExternalApprove(contract, user),
                  disabled: !!approveOpenGate,
                  disabledReason: approveOpenGate || undefined,
                  onClick: () => { setApDocDate(""); setApproveOpen(true); },
                },
                {
                  id: "edit",
                  label: editing ? "ปิดโหมดแก้ไข" : "แก้ไขร่าง",
                  kind: "edit",
                  icon: editing ? X : Pencil,
                  slot: "secondary",
                  visible: canEdit && isContractEditable(contract),
                  onClick: () => setEditing((on) => !on),
                },
                /* ⭐ ลบได้เฉพาะร่างที่ยังไม่ออกเลข (มติผู้ใช้ 2026-08-21) — ออกเลขแล้ว
                   ต้องออกฉบับแก้ไขหรือยกเลิก ไม่ใช่ลบหลักฐานทิ้ง */
                {
                  id: "delete",
                  label: "ลบฉบับร่าง",
                  kind: "delete",
                  icon: Trash2,
                  slot: "danger",
                  visible: canEdit && canDeleteContract(contract),
                  onClick: () => setDeleteOpen(true),
                },
              ]}
              /* ⚠️ ส่ง null เมื่อไม่มีอะไรจะเตือน — ส่ง fragment เปล่ามาคือ "มีของ" ในสายตา
                 การ์ด แล้วได้แถบว่างพร้อมระยะห่างค้างอยู่ใต้รางขั้น (เห็นชัดบนจอมือถือ) */
              notices={notices.length ? <>{notices}</> : null}
            />
            <ContextGrid>
              <ContextCard
                icon={Handshake}
                eyebrow="ดีล"
                title={contract.deal?.title}
                href={contract.deal?.id ? `/sa/deals/${contract.deal.id}` : undefined}
                facts={[
                  { label: "ลูกค้า", value: contract.customerName },
                  { label: "ผู้ดูแล", value: contract.ownerName },
                ]}
              />
              <ContextCard
                icon={FileText}
                eyebrow="ใบเสนอราคาที่อ้างถึง"
                title={contract.quotation?.quoteNumber || contract.metadata?.quoteNumber}
                href={contract.quotationId ? `/sa/quotations/${contract.quotationId}` : undefined}
                facts={[{
                  label: "สถานะอนุมัติ",
                  value: contract.quotation?.approvalStatus === "approved" ? "อนุมัติแล้ว" : NA,
                }]}
              />
            </ContextGrid>
          </>
        )}
      >
        {/* ข้อความเต็มของเรื่องใบเสนอราคา — ป้ายบนการ์ดจัดการบอกได้แค่หัวข้อ
            แต่คนอ่านต้องรู้ว่า *ต้องทำอะไรต่อ* ซึ่งต่างกันตามสถานะของสัญญา */}
        {contract.quotationNotice && (
          <StatusNotice tone={contract.quotationNotice.tone} title={contract.quotationNotice.title}>
            {contract.quotationNotice.body}
          </StatusNotice>
        )}

        <DetailCard
          icon={FileSignature}
          title="ข้อมูลบนสัญญา"
          meta={`${contractKindLabel(contract.kind)} · ${contract.contractNo || "ยังไม่ออกเลขที่"}`}
          actions={(
            <div className={styles.badgeRow}>
              {contractKindBadge(contract.kind)}
              {contractStatusBadge(contract.status)}
            </div>
          )}
        >
          {/* สายฉบับ (Rev.) — เห็นทุกฉบับของเลขฐานเดียวกัน กดข้ามไปดูฉบับก่อนหน้าได้
              (ฉบับเก่าไม่โผล่ในทะเบียนแล้ว ทางเข้าเดียวคือจากตรงนี้) */}
          {contract.revisions?.length > 1 && (
            <p className={styles.revChain}>
              ฉบับของเลขที่ {contract.baseNumber || contract.contractNo}:{" "}
              {contract.revisions.map((rev, index) => (
                <span key={rev.id}>
                  {index > 0 ? " · " : ""}
                  {rev.id === contract.id
                    ? <strong>ฉบับที่ {rev.revisionNo} (ใบนี้)</strong>
                    : <Link prefetch={false} href={`/sa/contracts/${rev.id}`} className="linklike">ฉบับที่ {rev.revisionNo}</Link>}
                </span>
              ))}
            </p>
          )}

          {editing ? (
            <>
              <ContractFormFields
                fields={templateFields}
                values={form.fields}
                contractDate={form.contractDate}
                disabled={busy}
                onPatch={(patch) => setForm((current) => ({ ...current, fields: { ...current.fields, ...patch } }))}
                onContractDate={(value) => setForm((current) => ({ ...current, contractDate: value }))}
                external={external ? { docKind: form.externalDocKind, ref: form.externalRef } : null}
                externalDocKinds={EXTERNAL_DOC_KINDS.map((item) => ({
                  value: item, label: EXTERNAL_DOC_KIND_LABELS[item],
                }))}
                onExternalPatch={(patch) => setForm((current) => ({ ...current, ...patch }))}
              />
              <div className="form-actions">
                <div className="form-actions-buttons">
                  <Button
                    onClick={() => {
                      setEditing(false);
                      setForm({
                        fields: { ...(contract.fields || {}) },
                        contractDate: contract.contractDate || "",
                        externalDocKind: contract.externalDocKind || "",
                        externalRef: contract.externalRef || "",
                      });
                    }}
                    disabled={busy}
                  >
                    ยกเลิก
                  </Button>
                  <Button tone="primary" onClick={save} disabled={busy}>บันทึกร่าง</Button>
                </div>
              </div>
            </>
          ) : (
            <dl className={styles.factList}>
              <div><dt>วันที่สัญญา</dt><dd>{fmtDate(contract.contractDate)}</dd></div>
              {/* ⭐ ใบ external ไม่มีช่องของแม่แบบให้แสดง (และไม่ควรมี — ดู route สร้าง)
                  ⇒ การ์ดนี้ต้องตอบแทนว่า *เอกสารไหนคือตัวสัญญา* ไม่ใช่เหลือแค่วันที่ใบเดียว
                  ค่าพวกนี้ถูกกรอกตอนสร้าง/ตอนอนุมัติอยู่แล้ว แต่ก่อนหน้านี้ไม่มีที่แสดงเลย
                  ทั้งหน้า — โผล่ที่เดียวคือหัวโมดัลตอนกดอนุมัติซึ่งปิดไปแล้วก็หายไปด้วย */}
              {external ? (
                <>
                  <div><dt>ที่มาของใบ</dt><dd>{CONTRACT_SOURCE_LABELS.external}</dd></div>
                  <div><dt>ชนิดเอกสาร</dt><dd>{externalDocKindLabel(contract.externalDocKind)}</dd></div>
                  <div><dt>เลขที่อ้างอิงของเอกสาร</dt><dd>{naText(contract.externalRef)}</dd></div>
                  <div><dt>ผู้อนุมัติให้ใช้แทนสัญญา</dt><dd>{naText(contract.approvedByName)}</dd></div>
                  <div><dt>วันที่อนุมัติ</dt><dd>{contract.approvedAt ? fmtDate(contract.approvedAt) : NA}</dd></div>
                </>
              ) : templateFields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{naText(contract.fields?.[field.key])}</dd>
                </div>
              ))}
            </dl>
          )}
        </DetailCard>

        {/* บันทึกเพิ่มเติมสัญญา (mig 0282) — เอกสารลูกของสัญญา ทางสร้างอยู่ที่นี่ที่เดียว */}
        <ContractAddendaCard contract={contract} canEdit={canEdit} />

        {/* ⭐ ไฟล์ฉบับลงนามอยู่ในการ์ดไฟล์แนบตัวเดียวกับที่ทั้งระบบใช้ — ไม่ทำท่ออัปโหลด
            ของตัวเอง เพราะจะได้ทางอัปไฟล์ที่สองที่ไม่ผ่านด่านเดียวกับของเดิม */}
        <DetailCard
          icon={FileText}
          title="ไฟล์ของสัญญา"
          meta={external ? "เอกสารที่ใช้แทนสัญญาอยู่ที่นี่" : "อัปโหลดฉบับที่ลูกค้าเซ็นแล้วที่นี่"}
        >
          <AttachmentsPanel
            entityType="contract"
            entityId={contract.id}
            canEdit={canEdit}
            title="ไฟล์แนบสัญญา"
            /* 🔴 **โน้ตต้องเดินตามที่มาของใบ** — ของเดิมเป็นถ้อยคำของสายที่ระบบเจน
               แต่ขึ้นบนใบ external ด้วย ⇒ คนแนบ PO เข้ามาแล้วอ่านตามก็เลือก
               "สัญญาที่ลงนามแล้ว" · ระบบดูชนิดไฟล์เพื่อตัดสินว่าใบพร้อมให้ AE Sup
               อนุมัติหรือยัง ⇒ เลือกผิดชนิด = ใบไม่เข้าคิวของคนที่ต้องกด ทั้งที่ไฟล์ครบ
               (เกิดขึ้นจริงแล้ว: ไฟล์แนบของสัญญาภายนอกใบเดียวบน production ถูกตั้งเป็น
               `signed_contract`) */
            note={external
              ? "เอกสารที่ลูกค้าส่งมา (PO · อีเมล · สัญญากระดาษ) ให้เลือกชนิด “เอกสารที่ใช้แทนสัญญา” — AE Supervisor จะเห็นใบนี้ในคิวเมื่อแนบชนิดนี้แล้ว"
              : "ฉบับที่ลงนามแล้วให้เลือกชนิด “สัญญาที่ลงนามแล้ว”"}
            /* 🔴 **แคบตัวเลือกด้วย ไม่ใช่แก้แต่คำแนะนำ** — #1581 แก้ข้อความอย่างเดียว
               แล้วปล่อยชนิด "สัญญาที่ลงนามแล้ว" ให้เลือกได้ต่อบนใบ external ทั้งที่ใบแบบนี้
               **ไม่มีสัญญาของระบบให้ลงนาม** ⇒ คำแนะนำที่ถูกกับตัวเลือกที่ผิดอยู่ในการ์ด
               เดียวกัน · ตัวเลือกที่ไม่ควรมีคือของที่คนจะเลือกจนได้ (เกิดมาแล้วบน production)
               ⚠️ ปล่อย `other` ไว้ — ใบ external ก็มีเอกสารประกอบอื่นได้ตามปกติ */
            docTypes={external
              ? ATTACHMENT_TYPES.contract.filter((t) => t.key !== SIGNED_CONTRACT_DOC_TYPE)
              : undefined}
            onItemsChange={handleAttachments}
          />
        </DetailCard>

        {contract.status === "signed" && (
          <DetailCard icon={FileSignature} title="การลงนาม">
            <dl className={styles.factList}>
              <div><dt>วันที่ลงนาม</dt><dd>{fmtDate(contract.signedDate)}</dd></div>
              <div><dt>เริ่มมีผล</dt><dd>{fmtDate(contract.effectiveDate)}</dd></div>
              <div><dt>สิ้นสุด</dt><dd>{contract.expiryDate ? fmtDate(contract.expiryDate) : NA}</dd></div>
              <div><dt>ไฟล์ฉบับลงนาม</dt><dd>{naText(contract.signedFile?.fileName)}</dd></div>
            </dl>
          </DetailCard>
        )}

        <div className={styles.backLink}>
          <Link href="/sa/contracts" className="linklike">← กลับไปทะเบียนสัญญา</Link>
        </div>
      </DetailPageLayout>

      {/* ── อนุมัติเอกสารภายนอกใช้แทนสัญญา (mig 0322 · มติผู้ใช้ 2026-08-30) ──────
          ⭐ ใช้ `approvalPrompt` ไม่ได้เพราะขั้นนี้ **ต้องกรอกวัน** ก่อนยืนยัน (ช่วงมีผล
            คือสิ่งที่ปลดล็อกงานบริการ) ⇒ เป็นโมดัลกรอกแบบเดียวกับกล่องลงนามข้าง ๆ
            แต่บอกผลลัพธ์ให้ครบเหมือน approvalPrompt ในตัวเนื้อ */}
      <Modal
        open={approveOpen}
        onClose={() => !busy && setApproveOpen(false)}
        title="อนุมัติเอกสารแทนสัญญา"
        subtitle={`ยืนยันว่า${externalDocKindLabel(contract.externalDocKind)}ฉบับที่แนบไว้ ผูกพันพอที่จะใช้แทนสัญญาได้`}
        footer={(
          <div className="form-actions-buttons">
            <Button onClick={() => setApproveOpen(false)} disabled={busy}>ปิด</Button>
            <Button tone="primary" onClick={submitApprove} disabled={busy || !!approveGate}>
              ยืนยันอนุมัติ
            </Button>
          </div>
        )}
      >
        <StatusNotice tone="warning" title="กดแล้วเกิดอะไรขึ้น">
          ใบนี้จะได้เลขที่สัญญาของระบบและกลายเป็น “ลงนามแล้ว” ทันที · ชื่อคุณถูกบันทึกเป็น
          ผู้อนุมัติ · งานบริการที่รอสัญญาใบนี้จะเดินต่อได้ตามช่วงเวลาที่ระบุด้านล่าง
        </StatusNotice>
        <div className="form-grid">
          <div className="form-field span-2">
            <span className="form-field-label">ไฟล์เอกสาร <span className="required-mark">*</span></span>
            {/* เหตุผลเดียวกับโมดัลลงนาม — แนบตรงนี้ได้เลย ไม่ต้องไล่คนออกไปที่การ์ด */}
            <AttachmentsPanel
              entityType="contract"
              entityId={contract.id}
              canEdit={canEdit}
              title="แนบเอกสารที่ใช้แทนสัญญา"
              docTypes={[{ key: EXTERNAL_DOC_TYPE, label: "เอกสารที่ใช้แทนสัญญา" }]}
              cardColumns={1}
              onItemsChange={handleAttachments}
            />
          </div>
          <label className="form-field">
            <span className="form-field-label">เริ่มมีผล <span className="required-mark">*</span></span>
            <DateInput value={apEffective} onChange={setApEffective} disabled={busy} />
          </label>
          <label className="form-field">
            <span className="form-field-label">สิ้นสุด <span className="required-mark">*</span></span>
            <DateInput value={apExpiry} onChange={setApExpiry} disabled={busy} />
            <span className="hint">ทะเบียนต่อสัญญาเตือนล่วงหน้า 90 วันจากวันนี้</span>
          </label>
          <label className="form-field span-2">
            <span className="form-field-label">วันที่บนเอกสาร</span>
            <DateInput value={apDocDate} onChange={setApDocDate} disabled={busy} />
            <span className="hint">ไม่กรอก = ใช้วันที่เริ่มมีผล</span>
          </label>
        </div>
        {approveGate ? <span className="hint">{approveGate}</span> : null}
      </Modal>

      {/* ⭐ ขั้นลงนามเป็น **โมดัล** (มติผู้ใช้ 2026-08-28) — เดิมเป็นการ์ดที่แทรกอยู่ท้าย
          คอลัมน์เนื้อหา ซึ่งอยู่ต่ำกว่าปุ่มที่กดหลายจอ ⇒ กดแล้วหน้าจอไม่ขยับ คนอ่านว่า
          "ปุ่มเสีย" · โมดัลบังคับให้ของที่ต้องกรอกมาอยู่ตรงหน้าเสมอ */}
      <Modal
        open={signOpen}
        onClose={() => !busy && setSignOpen(false)}
        title="บันทึกการลงนาม"
        subtitle="กรอกวันที่บนสัญญาที่ลูกค้าเซ็นกลับมา แล้วระบบจะปิดใบนี้เป็น “ลงนามแล้ว”"
        footer={(
          <div className="form-actions-buttons">
            <Button onClick={() => setSignOpen(false)} disabled={busy}>ปิด</Button>
            <Button tone="primary" onClick={submitSign} disabled={busy || !signFileId || !signDate}>
              บันทึกการลงนาม
            </Button>
          </div>
        )}
      >
        <div className="form-grid">
          <label className="form-field span-2">
            <span className="form-field-label">วันที่ลงนาม <span className="required-mark">*</span></span>
            <DateInput value={signDate} onChange={setSignDate} disabled={busy} />
            <span className="hint">วันที่ที่เขียนบนกระดาษ ไม่ใช่วันที่อัปโหลดไฟล์</span>
          </label>
          <div className="form-field span-2">
            <span className="form-field-label">ไฟล์ฉบับลงนาม <span className="required-mark">*</span></span>
            {/* ⭐ **แนบได้ในโมดัลเลย** (มติผู้ใช้ 2026-08-31: *"ให้บังคับ ใส่ไฟล์ เลย ใน modal"*)
                ของเดิมบอกให้ "ปิดหน้าต่างนี้ แล้วไปแนบที่การ์ด แล้วกลับมากดใหม่" ซึ่งคือ
                การไล่คนออกจากงานที่กำลังทำอยู่ แล้วหวังว่าเขาจะเดินกลับมาถูกที่
                ⚠️ **ยังเป็น `AttachmentsPanel` ตัวเดิม ไม่ใช่ช่องอัปโหลดตัวที่สอง** — ทางอัป
                ไฟล์ที่เขียนใหม่จะไม่ผ่านด่าน/ขนาด/ปลายทางเดียวกับของเดิม · ที่ทำคือจำกัด
                ชนิดให้เหลือใบเดียวแล้วยกมาวางในโมดัล ⇒ ไฟล์ที่แนบตรงนี้กับที่แนบจากการ์ด
                เป็นของก้อนเดียวกัน (`onItemsChange` ตัวเดียวกันจึงอัปเดต `signFileId` ให้เอง) */}
            <AttachmentsPanel
              entityType="contract"
              entityId={contract.id}
              canEdit={canEdit}
              title="แนบฉบับที่ลูกค้าเซ็นกลับมา"
              docTypes={[{ key: SIGNED_CONTRACT_DOC_TYPE, label: "สัญญาที่ลงนามแล้ว" }]}
              cardColumns={1}
              onItemsChange={handleAttachments}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        description={confirmState?.description}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={confirmBusy}
        onConfirm={runConfirmed}
        onClose={() => { if (!confirmBusy) setConfirmState(null); }}
      />

      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title="ลบร่างสัญญา"
        description={`ต้องการลบร่าง${contractKindLabel(contract.kind)} ของ ${naText(contract.customerName)} ใช่หรือไม่`}
        detail="ร่างนี้ยังไม่ได้ออกเลขที่ ลบแล้วเรียกคืนจากหน้าจอนี้ไม่ได้"
        confirmLabel="ลบร่างสัญญา"
        busy={busy}
        onClose={() => !busy && setDeleteOpen(false)}
        onConfirm={removeDraft}
      />
    </SaWorkspace>
  );
}
