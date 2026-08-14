"use client";
import { TableScroll } from "@/components/ui/Table";
import ConfirmDialog, { confirmAction } from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Button from "@/components/ui/Button";
import styles from "./page.module.css";
import DateInput from "@/components/ui/DateInput";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingCart, MessagesSquare, Pencil, Save, Trash2, History, Truck, ChevronDown, ChevronRight, PackageCheck, ExternalLink } from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import StatusNotice from "@/components/ui/StatusNotice";
import { useApiList } from "@/lib/excise/useApiList";
import { apiCache } from "@/lib/apiCache";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { productMetaText, indexProducts } from "@/lib/sahamit/productMeta";
import { fmtDate, fmtMoneyCompact, fmtNumber, naText, NA } from "@/lib/format";
import { poTotalQty, poLineCount, PO_STATUS_LABEL } from "@/lib/sahamit/po";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { DestinationToggle, destinationLabel } from "@/components/sahamit/destinations";
import { useCan } from "@/lib/roleContext";
import useDealOwners from "@/lib/sales/useDealOwners";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { createClient } from "@/lib/supabaseBrowser";
import Modal from "@/components/Modal";
import Toast, { notifyToast } from "@/components/ui/Toast";
import ReadableText from "@/components/ui/ReadableText";
import Textarea from "@/components/ui/Textarea";

const STATUS_OPTIONS = ["open", "partial", "delivered", "cancelled"];
const nf = (n) => fmtNumber(n || 0);

// สถานะวัสดุ 1 ช่อง (อ่านอย่างเดียว): มาแล้ว / กำหนดถึง / — (แก้ที่เมนูวัสดุเท่านั้น)
function matCell(dueDate, arrivedAt) {
  if (arrivedAt) return <span style={{ color: "var(--green)", fontWeight: "var(--fw-semibold)" }}>✓ มาแล้ว {fmtDate(arrivedAt)}</span>;
  if (dueDate) return <span style={{ color: "var(--text-2)" }}>กำหนด {fmtDate(dueDate)}</span>;
  return <span style={{ color: "var(--text-3)" }}>{NA}</span>;
}

// One PO line with an inline editor: reschedule (expected date + reason →
// history), mark delivered, change qty/due/status/destination, split, delete.
// PM/RM แสดงอย่างเดียว (แก้ที่เมนูวัสดุ).
function PoLineRow({ line, tracking, product, onChanged, canEdit }) {
  const [open, setOpen] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({});

  useEffect(() => {
    setD({
      qty: line.qty ?? "",
      dueDate: line.dueDate || "",
      expectedDate: line.expectedDate || "",
      actualDeliveredDate: line.actualDeliveredDate || "",
      status: line.status || "open",
      destination: line.destination || null,
      rescheduleReason: "",
    });
  }, [line]);

  const call = async (url, opts) => {
    setBusy(true);
    try {
      await sahamitFetch(url, opts);
      onChanged?.();
    } catch (e) { notifyToast.error(e.message); }
    setBusy(false);
  };

  const save = async () => {
    const rescheduled = (d.expectedDate || "") !== (line.expectedDate || "");
    if (rescheduled && !d.rescheduleReason) {
      if (!(await confirmAction("เลื่อนวันคาดการณ์ส่งโดยไม่ระบุเหตุผล?"))) return;
    }
    call(`/api/sahamit/po/lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qty: Number(d.qty), dueDate: d.dueDate || null,
        expectedDate: d.expectedDate || null, rescheduleReason: d.rescheduleReason || null,
        actualDeliveredDate: d.actualDeliveredDate || null, status: d.status, destination: d.destination || null,
      }),
    });
  };

  const del = async () => {
    if (!(await confirmAction(`ลบรายการ ${line.fgCode}?`))) return;
    call(`/api/sahamit/po/lines/${line.id}`, { method: "DELETE" });
  };

  const hist = Array.isArray(line.expectedHistory) ? line.expectedHistory : [];

  return (
    <>
      <tr>
        <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>
          {line.fgCode}
          {line.splitFromPoLineId && <span className="ui-badge" style={{ marginLeft: 6, color: "var(--blue)", borderColor: "var(--blue)" }}>ยอดแยก</span>}
        </td>
        <td style={{ color: line.productName ? "inherit" : "var(--amber)" }}>
          {line.productName || "— ไม่รู้จัก —"}
          {productMetaText(product) && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{productMetaText(product)}</div>}
        </td>
        <td style={{ textAlign: "right" }}>
          <div>เต็ม {nf(line.qty)}</div>
          {casesText(line.qty, ppcOf(product)) && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{casesText(line.qty, ppcOf(product))}</div>}
          {Number(product?.price) > 0 && (
            <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>
              @ ฿{fmtNumber(product.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = ฿{fmtNumber(Number(line.qty || 0) * Number(product.price), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
          {line.shippedQty != null && (
            <div style={{ fontSize: "var(--fs-3)" }}>
              <span style={{ color: "var(--green)" }}>ส่งแล้ว {nf(line.shippedQty)}</span>
              {" · "}
              <span style={{ color: "var(--blue)" }}>เหลือ {nf(Number(line.qty) - Number(line.shippedQty))}</span>
            </div>
          )}
        </td>
        <td>{line.dueDate ? fmtDate(line.dueDate) : NA}</td>
        <td>
          {line.expectedDate ? fmtDate(line.expectedDate) : NA}
          {hist.length > 0 && (
            <button className="btn-icon" title={`เลื่อนมาแล้ว ${hist.length} ครั้ง`} onClick={() => setShowHist((v) => !v)} style={{ marginLeft: 4 }}>
              <History size={13} />
            </button>
          )}
        </td>
        <td>{matCell(tracking?.pmDueDate, tracking?.pmArrivedAt)}</td>
        <td>{matCell(tracking?.rmDueDate, tracking?.rmArrivedAt)}</td>
        <td>{line.actualDeliveredDate ? fmtDate(line.actualDeliveredDate) : NA}</td>
        <td>{destinationLabel(line.destination) || <span style={{ color: "var(--text-3)" }}>{NA}</span>}</td>
        <td><span className="status-pill">{PO_STATUS_LABEL[line.status] || line.status}</span></td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          {canEdit && (
            <>
              <button className="btn-icon" title="แก้ไข/เลื่อน/ส่งจริง" onClick={() => setOpen((v) => !v)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
              <button className="btn-icon" title="ลบ" onClick={del} disabled={busy}><Trash2 size={15} /></button>
            </>
          )}
        </td>
      </tr>

      {showHist && hist.length > 0 && (
        <tr>
          <td colSpan={11} style={{ background: "var(--panel-2)", fontSize: "var(--fs-5)" }}>
            <b>ประวัติการเลื่อนวันคาดการณ์ส่ง:</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {hist.map((h, i) => (
                <li key={i}>
                  <span>เดิม {h.expectedDate ? fmtDate(h.expectedDate) : NA} <span style={{ color: "var(--text-3)" }}>({h.changedAt ? fmtDate(h.changedAt) : ""})</span></span>
                  {h.reason && <ReadableText text={h.reason} lines={3} style={{ marginTop: 2, color: "var(--text-2)" }} />}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}

      {open && (
        <tr>
          <td colSpan={11} style={{ background: "var(--panel-2)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end", padding: "6px 2px" }}>
              <div className="form-group" style={{ width: 90 }}>
                <label>จำนวน (ชิ้น)</label>
                <input type="number" min={1} className="premium-input" style={{ height: 30 }} value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label>กำหนดส่ง</label>
                <DateInput style={{ height: 30 }} value={d.dueDate} onChange={(value) => setD({ ...d, dueDate: value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label>คาดการณ์ส่ง</label>
                <DateInput style={{ height: 30 }} value={d.expectedDate} onChange={(value) => setD({ ...d, expectedDate: value })} />
              </div>
              <div className="form-group" style={{ flex: "1 1 160px", minWidth: 140 }}>
                <label>เหตุผลที่เลื่อน (ถ้ามี)</label>
                <input className="premium-input" style={{ height: 30 }} value={d.rescheduleReason} placeholder="กรอกเมื่อเปลี่ยนวันคาดการณ์" onChange={(e) => setD({ ...d, rescheduleReason: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label><Truck size={12} style={{ verticalAlign: -1 }} /> วันส่งจริง</label>
                <DateInput style={{ height: 30 }} value={d.actualDeliveredDate} onChange={(value) => setD({ ...d, actualDeliveredDate: value })} />
              </div>
              <div className="form-group" style={{ width: 130 }}>
                <label>สถานะ</label>
                <Select className="premium-select" style={{ height: 30 }} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}
                </Select>
              </div>
              <div className="form-group">
                <label>สถานที่ส่ง</label>
                <DestinationToggle value={d.destination} onChange={(v) => setD({ ...d, destination: v })} />
              </div>
              <button className="btn btn-primary sm" onClick={save} disabled={busy}><Save size={14} /> บันทึกบรรทัด</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const canCreateProject = useCan("pm:edit");
  const canSettle = useCan("salesplan:edit");
  const canEdit = useCan("sahamit:edit");
  const id = params.id;
  const { data: pos, loading, error, reload } = useApiList("/api/sahamit/po");
  const { data: material } = useApiList("/api/sahamit/material");
  const { data: products } = useApiList("/api/sahamit/products");
  const prodIdx = useMemo(() => indexProducts(products), [products]);
  const po = useMemo(() => pos.find((p) => p.id === id) || null, [pos, id]);
  const trackByLine = useMemo(() => {
    const m = new Map();
    for (const r of material) m.set(r.poLineId, r.tracking || null);
    return m;
  }, [material]);
  // PO ยอดเหลือที่แตกออกจาก PO นี้ (โยงด้วย splitFromPoId)
  const balancePos = useMemo(() => pos.filter((p) => p.splitFromPoId === id), [pos, id]);

  const [h, setH] = useState({});
  const [busy, setBusy] = useState(false);
  const [hErr, setHErr] = useState("");
  const [headerExpanded, setHeaderExpanded] = useState(false); // ย่อไว้ก่อนแบบหัว ISO
  const [projectConfirmOpen, setProjectConfirmOpen] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  /* ผู้ดูแล (AE) ของโครงการที่จะสร้างจาก PO — เดิม route ตรึงเป็นคนกดปุ่มเสมอ
     ⇒ Admin/หัวหน้าฝ่ายขายกดแล้วโครงการตกเป็นของคนที่ไม่ใช่ AE (ชื่อผิดบนเอกสาร
     ISO ด้วย) · ae/senior_ae ยังกดแล้วเป็นของตัวเอง ช่องจึงล็อกไม่ใช่ซ่อน
     ⚠️ รายชื่อมาจาก hook กลางตัวเดียวกับฟอร์มดีล — คนถือดีลกับผู้ดูแลโครงการเป็น
     ชุด role เดียวกัน (PROJECT_OWNER_ROLES = DEAL_HOLDER_ROLES) ห้ามกรองเองซ้ำ */
  const [meId, setMeId] = useState(null);
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setMeId(user?.id || null)).catch(() => {});
  }, []);
  const { owners: aeOwners, lockedOwner } = useDealOwners(meId);
  const [projectAeId, setProjectAeId] = useState("");
  /* โครงการต้องมีครบสามฝ่ายตั้งแต่วันเกิด (มติผู้ใช้ 2026-08-14) — เดิม route ของ PO
     เขียนผู้ประสานงาน/ผู้ตรวจสอบเป็นค่าว่างตายตัว ⇒ โครงการจาก PO ไม่มีสองฝ่ายนี้เลย
     รายชื่อกรองด้วย role เดียวกับที่ server ตรวจ (resolveProjectAcOwner / Supervisor) */
  const directory = usePeopleDirectory();
  const acUsers = useMemo(() => directory.filter((u) => u.role === "ac" && !u.disabled), [directory]);
  const supervisorUsers = useMemo(
    () => directory.filter((u) => u.role === "ae_supervisor" && !u.disabled),
    [directory],
  );
  const [projectAcId, setProjectAcId] = useState("");
  const [projectSupervisorId, setProjectSupervisorId] = useState("");
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleData, setSettleData] = useState(null); // { poReceivedMonth, projectId, lines } | null=กำลังโหลด
  const [settleChoices, setSettleChoices] = useState({}); // poLineId -> dealId | "new" | "skip"
  const [settleModes, setSettleModes] = useState({}); // poLineId -> "split" | "whole" (เฉพาะ PO ครอบดีลบางส่วน)
  // เลือกโครงการเดิมมาเชื่อม (มติ 2026-07-20) — ทางเลือกคู่กับ "สร้างโครงการใหม่"
  // ผูกโครงการจากในโมดัลยืนยันดีล (แยก state จาก modal "เลือกโครงการเดิม" ที่เปิดเดี่ยว
  // เพราะสองที่เปิดพร้อมกันได้ และ modal เดี่ยวเด้งออกไปหน้าโครงการหลังผูกเสร็จ)
  const [inlineProjects, setInlineProjects] = useState([]);
  const [inlineProjectId, setInlineProjectId] = useState("");
  const [inlineLoading, setInlineLoading] = useState(false);
  const [inlineBusy, setInlineBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkProjects, setLinkProjects] = useState([]);
  const [linkProjectId, setLinkProjectId] = useState("");
  const [toast, setToast] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ลบทั้งใบ — server เป็นคนตัดสินว่าลบได้ไหม (ผูกโครงการ/ดีล/แบ่งส่ง/วัสดุ = 409
  // พร้อมข้อความบอกว่าติดอะไร) หน้าเว็บแค่ถามยืนยันแล้วส่งต่อข้อความนั้นให้ผู้ใช้
  const deletePo = async () => {
    setDeleteBusy(true);
    try {
      await sahamitFetch(`/api/sahamit/po/${id}`, { method: "DELETE" });
      apiCache.delete("/api/sahamit/po");
      apiCache.delete("/api/sahamit/material");
      router.push("/sahamit/po");
    } catch (e) {
      notifyToast.error(e.message || "ลบ PO ไม่สำเร็จ");
      setDeleteBusy(false);
    }
  };

  // แบ่งส่ง (split): ระบุยอดส่งจริงต่อบรรทัด → เปิด PO ยอดเหลือ
  const [splitOpen, setSplitOpen] = useState(false);
  const [balanceNo, setBalanceNo] = useState("");
  const [shipped, setShipped] = useState({});
  const [splitBusy, setSplitBusy] = useState(false);
  const openSplit = () => {
    const init = {};
    for (const l of po?.lines || []) init[l.id] = l.qty ?? "";
    setShipped(init); setBalanceNo(""); setSplitOpen(true);
  };
  const doSplit = async () => {
    // เลขที่ PO ยอดเหลือไม่บังคับ — เว้นว่างได้ (ระบบตั้งเลขชั่วคราวให้)
    const lines = (po?.lines || []).map((l) => ({ lineId: l.id, shippedQty: Number(shipped[l.id]) }));
    if (!lines.some((l) => Number.isFinite(l.shippedQty) && l.shippedQty >= 0)) { notifyToast.error("กรอกยอดส่งจริง"); return; }
    setSplitBusy(true);
    try {
      await sahamitFetch(`/api/sahamit/po/${id}/split`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balancePoNumber: balanceNo.trim(), lines }),
      });
      setSplitOpen(false); reload();
    } catch (e) { notifyToast.error(e.message); }
    setSplitBusy(false);
  };
  const doMerge = async () => {
    if (!(await confirmAction("รวมกลับ (ยกเลิกแบ่งส่ง)? PO ยอดเหลือใบนี้จะถูกลบ และ PO แม่กลับเป็นยอดเต็ม"))) return;
    try {
      const j = await sahamitFetch(`/api/sahamit/po/${id}/merge`, { method: "POST" });
      router.push(j?.restoredPoId ? `/sahamit/po/${j.restoredPoId}` : "/sahamit/po");
    } catch (e) { notifyToast.error(e.message); }
  };

  useEffect(() => {
    if (!po) return;
    setH({
      poNumber: po.poNumber || "", docDate: po.docDate || "", receivedDate: po.receivedDate || "",
      dueDate: po.dueDate || "", destination: po.destination || null,
      quoteRef: po.quoteRef || "", note: po.note || "",
    });
    setHErr("");
  }, [po]);

  const saveHeader = async () => {
    setBusy(true); setHErr("");
    try {
      await sahamitFetch(`/api/sahamit/po/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(h),
      });
      await reload();
      // ล้าง cache ที่หน้ากระทบยอด/วัสดุใช้ร่วม → เปิดหน้าเหล่านั้นจะเห็นค่าล่าสุด ไม่ค้างของเก่า
      apiCache.delete("/api/sahamit/po");
      apiCache.delete("/api/sahamit/material");
      setToast({ kind: "success", msg: "บันทึก PO แล้ว — กระทบยอด/วัสดุจะอัปเดตเมื่อเปิดหน้านั้น" });
    } catch (e) { setHErr(e.message); }
    setBusy(false);
  };

  const createProject = async () => {
    // ล็อกชื่อตัวเอง (ae/senior_ae) = ไม่ต้องเลือก · นอกนั้นต้องเลือกก่อน ไม่งั้น API ตีกลับ
    const aeOwnerId = lockedOwner?.id || projectAeId;
    // ด่านรวมข้อความเดียว (docs/form-design-rules.md §2) — บอกทุกช่องที่ขาดในครั้งเดียว
    const missing = [
      [!aeOwnerId, "ผู้ดูแลโครงการ (AE)"],
      [!projectAcId, "ผู้ประสานงาน (AC)"],
      [!projectSupervisorId, "ผู้ตรวจสอบ (AE Supervisor)"],
    ].filter(([absent]) => absent).map(([, label]) => label);
    if (missing.length) {
      setToast({ kind: "error", msg: `เลือก ${missing.join(" · ")} ก่อน` });
      return;
    }
    setProjectBusy(true);
    try {
      const payload = await sahamitFetch(`/api/sahamit/po/${id}/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aeOwnerId, acOwnerId: projectAcId, aeSupervisorId: projectSupervisorId }),
      });
      setProjectConfirmOpen(false);
      const project = payload.project;
      if (project?.code || project?.id) router.push(`/sa/projects/${project.code || project.id}`);
      else await reload();
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "สร้างโครงการไม่สำเร็จ" });
    } finally {
      setProjectBusy(false);
    }
  };

  // เลือกโครงการเดิม: โหลดโครงการของลูกค้าสหมิตร (customerId เดียวกับ PO) มาให้เลือก
  const openLinkProject = async () => {
    setLinkOpen(true);
    setLinkLoading(true);
    setLinkProjects([]);
    setLinkProjectId("");
    try {
      const res = await fetch("/api/pm/projects");
      const rows = res.ok ? await res.json() : [];
      const mine = (Array.isArray(rows) ? rows : []).filter((p) => p.customerId && p.customerId === po.customerId);
      setLinkProjects(mine);
      if (mine.length === 1) setLinkProjectId(mine[0].id);
    } catch {
      setLinkProjects([]);
    } finally {
      setLinkLoading(false);
    }
  };
  const submitLinkProject = async () => {
    if (!linkProjectId) { setToast({ kind: "error", msg: "เลือกโครงการที่จะเชื่อมก่อน" }); return; }
    setLinkBusy(true);
    try {
      const payload = await sahamitFetch(`/api/sahamit/po/${id}/link-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: linkProjectId }),
      });
      setLinkOpen(false);
      const project = payload.project;
      if (project?.code || project?.id) router.push(`/sa/projects/${project.code || project.id}`);
      else await reload();
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "เชื่อมโครงการไม่สำเร็จ" });
    } finally {
      setLinkBusy(false);
    }
  };

  // ผูกโครงการเดิมจาก "ในโมดัลยืนยันดีล" — ต่างจาก submitLinkProject ตรงที่ไม่เด้ง
  // ออกไปหน้าโครงการ แต่โหลดข้อมูล settle ใหม่ให้ทำงานต่อในโมดัลเดิมได้เลย
  const linkProjectInline = async () => {
    if (!inlineProjectId) return;
    setInlineBusy(true);
    try {
      await sahamitFetch(`/api/sahamit/po/${id}/link-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: inlineProjectId }),
      });
      await reload();
      const data = await sahamitFetch(`/api/sahamit/po/${id}/settle-deal`);
      setSettleData(data);
      setToast({ kind: "success", msg: "ผูกโครงการแล้ว — ยืนยันดีลต่อได้เลย" });
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "ผูกโครงการไม่สำเร็จ" });
    } finally {
      setInlineBusy(false);
    }
  };

  // เปิด modal จับคู่รายบรรทัด (โหลด candidate ต่อบรรทัด)
  const openSettleModal = async () => {
    setSettleOpen(true);
    setSettleData(null);
    setSettleChoices({});
    setSettleModes({});
    // โหลดโครงการของลูกค้าไว้เผื่อ PO นี้ยังไม่มีโครงการ — จะได้เลือกผูกในโมดัลเลย
    setInlineLoading(true);
    setInlineProjectId("");
    fetch("/api/pm/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setInlineProjects(
        (Array.isArray(rows) ? rows : []).filter((p) => p.customerId && p.customerId === po.customerId),
      ))
      .catch(() => setInlineProjects([]))
      .finally(() => setInlineLoading(false));
    try {
      const data = await sahamitFetch(`/api/sahamit/po/${id}/settle-deal`);
      setSettleData(data);
      const init = {};
      for (const ln of data.lines || []) {
        init[ln.poLineId] = ln.settledDealId ? "settled" : (ln.suggestedDealId || "new");
      }
      setSettleChoices(init);
    } catch (e) {
      setSettleOpen(false);
      setToast({ kind: "error", msg: e.message || "โหลดดีลที่แนะนำไม่สำเร็จ" });
    }
  };

  // ยืนยันทั้งชุด → ดีลรวม 1 ใบต่อ PO + QT 1 ใบหลายบรรทัด (ท่อ QT→SO มติ §7 —
  // ไม่ปิด Won ที่นี่; Won เกิดตอน accept QT พร้อมแนบไฟล์ PO + เลือกเดือน แล้วออก SO)
  const confirmSettle = async () => {
    const settlements = (settleData?.lines || [])
      .filter((ln) => !ln.settledDealId)
      .map((ln) => ({ ln, choice: settleChoices[ln.poLineId] }))
      .filter((x) => x.choice && x.choice !== "skip")
      .map(({ ln, choice }) => (choice === "new"
        ? { poLineId: ln.poLineId, createNew: true }
        : { poLineId: ln.poLineId, dealId: choice, mode: settleModes[ln.poLineId] || "split" }));
    if (!settlements.length) { setToast({ kind: "info", msg: "ไม่มีบรรทัดที่จะเชื่อม" }); return; }
    setSettleBusy(true);
    try {
      const payload = await sahamitFetch(`/api/sahamit/po/${id}/settle-deal`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settlements }),
      });
      setSettleOpen(false);
      const priceWarn = payload.priceMissing ? " ⚠ ราคา master บางสินค้ายังไม่ตั้ง — ไปเติมในใบเสนอราคา" : "";
      const writeWarn = payload.warnings?.length ? ` ⚠ เขียนข้อมูลไม่ครบ ${payload.warnings.length} จุด (${payload.warnings[0]}) — แจ้งแอดมิน` : "";
      setToast({
        kind: payload.warnings?.length ? "info" : "success",
        msg: `รวมเป็นดีลเดียว ${payload.title || ""} + ออกใบเสนอราคา ${payload.quoteNumber || ""} (${payload.settled || 0} รายการ) — เข้าคิวอนุมัติเจ้าของดีล${priceWarn}${writeWarn}`,
      });
      await reload();
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "ยืนยันดีลไม่สำเร็จ" });
    } finally {
      setSettleBusy(false);
    }
  };

  const poValueBeforeVat = (po?.lines || []).reduce((sum, line) => {
    const price = Number(prodIdx.get(String(line.fgCode).trim().toLowerCase())?.price);
    return sum + (Number.isFinite(price) && price > 0 ? Number(line.qty || 0) * price : 0);
  }, 0);
  const deliveredLines = (po?.lines || []).filter((line) => line.status === "delivered").length;
  const poStatus = po?.status || (po?.lines?.length && deliveredLines === po.lines.length ? "delivered" : deliveredLines ? "partial" : "open");
  const poStatusColor = poStatus === "delivered"
    ? "var(--green)"
    : poStatus === "cancelled"
      ? "var(--red)"
      : poStatus === "partial"
        ? "var(--amber)"
        : "var(--blue)";

  return (
    <Workspace
      icon={<ShoppingCart size={22} />}
      title={po ? `PO ${po.poNumber}` : "PO"}
      subtitle="รายละเอียดใบสั่งซื้อ (ลูกค้า AR-109)"
      back={{ href: "/sahamit/po", label: "Purchase Orders" }}
    >
      <Toast toast={toast} onClose={() => setToast(null)} />
      {error && (
        <StatusNotice tone="error">{error}</StatusNotice>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : !po ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <ShoppingCart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ไม่พบ PO นี้</div>
        </div>
      ) : (
        <DetailPageLayout
          asideLabel="สรุปและจัดการ Purchase Order"
          aside={(
            <>
              <DocumentSummaryCard
                title="สรุป Purchase Order"
                total={poValueBeforeVat > 0 ? `฿${fmtNumber((poValueBeforeVat * 1.07), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined}
                rows={[
                  { id: "lines", label: "จำนวนรายการ", value: `${poLineCount(po)} รายการ` },
                  { id: "qty", label: "ยอดรวม", value: `${nf(poTotalQty(po))} ชิ้น` },
                  { id: "destination", label: "สถานที่ส่ง", value: naText(destinationLabel(po.destination)) },
                  { id: "delivery", label: "ส่งครบแล้ว", value: `${deliveredLines}/${po.lines?.length || 0}` },
                ]}
                status={PO_STATUS_LABEL[poStatus] || poStatus}
                statusColor={poStatusColor}
              />
              <DocumentControlCard
                status={PO_STATUS_LABEL[poStatus] || poStatus}
                statusColor={poStatusColor}
                statusDescription="การจัดการข้อมูลระดับ PO"
                primaryAction={canEdit ? {
                  id: "save", label: "บันทึกข้อมูลหัว PO", kind: "save", icon: Save,
                  onClick: saveHeader,
                } : null}
                secondaryActions={[
                  {
                    id: "edit", label: "เปิดฟอร์มแก้ไข PO", kind: "edit", icon: Pencil,
                    href: `/sahamit/po/${id}/edit`, visible: canEdit,
                  },
                ]}
                dangerActions={[
                  {
                    id: "delete", label: deleteBusy ? "กำลังลบ..." : "ลบ PO",
                    kind: "delete", icon: Trash2, onClick: () => setDeleteOpen(true), visible: canEdit,
                  },
                ]}
                busy={busy || deleteBusy}
              />
              <RelatedDocumentCard
                title="โครงการและงานขาย"
                meta="เชื่อม PO ไปยัง PM Project และท่อ QT → SO"
                actions={(
                  <div className="flex flex-col gap-2">
                    {po.projectId ? (
                      <Link className="btn ghost sm" href={`/sa/projects/${po.projectId}`}><ExternalLink size={13} /> เปิด PM Project</Link>
                    ) : canCreateProject ? (
                      <>
                        <button type="button" className="btn ghost sm" onClick={openLinkProject} disabled={!po.lines?.length}><PackageCheck size={13} /> เลือกโครงการเดิม</button>
                        <button type="button" className="btn ghost sm" onClick={() => setProjectConfirmOpen(true)} disabled={!po.lines?.length}><PackageCheck size={13} /> สร้างโครงการใหม่</button>
                      </>
                    ) : null}
                    {/* ⚠️ เดิมปุ่มนี้ disabled ตอนยังไม่มีโครงการ → เปิดโมดัลไม่ได้เลย
                        และคำเตือนในโมดัลกลายเป็นโค้ดตายที่ไม่มีใครได้เห็น · ตอนนี้เปิดได้
                        แล้วไปแก้ในโมดัล (ยังบังคับว่าต้องมีโครงการก่อนยืนยัน — ปุ่มยืนยัน
                        ยัง disabled อยู่ · มติผู้ใช้ 2026-07-29: ห้ามสร้างโครงการให้เอง) */}
                    {canSettle ? (
                      <button type="button" className="btn ghost sm" onClick={openSettleModal} disabled={!po.lines?.length}>
                        <PackageCheck size={13} /> {po.salesDealId ? "เชื่อมบรรทัดที่เหลือ" : "ยืนยันดีล + ออกใบเสนอราคา"}
                      </button>
                    ) : null}
                    {po.salesDealId ? <Link className="btn ghost sm" href={`/sa/deals/${po.salesDealId}`}><ExternalLink size={13} /> เปิดดีลขาย</Link> : null}
                  </div>
                )}
              >
                Action ของโครงการและดีลแยกจากการแก้ข้อมูล PO เพื่อไม่ปะปนวงจรเอกสาร
              </RelatedDocumentCard>
            </>
          )}
        >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Header editor — ย่อ/ขยายได้ แบบหัว ISO */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel)" }}>
            <button
              onClick={() => setHeaderExpanded((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--panel-2)", border: "none", cursor: "pointer", textAlign: "left", overflow: "hidden", borderRadius: headerExpanded ? "10px 10px 0 0" : "10px" }}
              title={headerExpanded ? "ย่อหัว PO" : "ขยายหัว PO"}
            >
              {headerExpanded ? <ChevronDown size={18} color="var(--accent)" /> : <ChevronRight size={18} color="var(--accent)" />}
              <span style={{ fontSize: "var(--fs-8)", fontWeight: "var(--fw-semibold)", flexShrink: 0 }}>ข้อมูลหัว PO</span>
              {!headerExpanded && (
                <span style={{ fontSize: "var(--fs-7)", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8, marginLeft: 8 }}>
                  {[po.poNumber, po.docDate && `เอกสาร ${fmtDate(po.docDate)}`, po.receivedDate && `รับ ${fmtDate(po.receivedDate)}`, po.dueDate && `กำหนดส่ง ${fmtDate(po.dueDate)}`, destinationLabel(po.destination), po.quoteRef].filter(Boolean).join("   ·   ")}
                </span>
              )}
              <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", marginLeft: "auto", fontWeight: "var(--fw-medium)" }}>(คลิกเพื่อ{headerExpanded ? "ย่อ" : "ขยาย"})</span>
            </button>
            {headerExpanded && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)" }}>
            <div className="form-grid cols-2">
              <div className="form-group">
                <label>เลขที่ PO</label>
                <input className="premium-input font-mono" value={h.poNumber || ""} onChange={(e) => setH({ ...h, poNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label>วันที่เอกสาร</label>
                <DateInput value={h.docDate || ""} onChange={(value) => setH({ ...h, docDate: value })} />
              </div>
              <div className="form-group">
                <label>วันที่รับ PO</label>
                <DateInput value={h.receivedDate || ""} onChange={(value) => setH({ ...h, receivedDate: value })} />
              </div>
              <div className="form-group">
                <label>กำหนดส่ง (ทั้ง PO)</label>
                <DateInput value={h.dueDate || ""} onChange={(value) => setH({ ...h, dueDate: value })} />
              </div>
              <div className="form-group">
                <label>สถานที่ส่ง (ทั้ง PO)</label>
                <DestinationToggle value={h.destination || null} onChange={(v) => setH({ ...h, destination: v })} />
              </div>
              <div className="form-group">
                <label>อ้างอิงใบเสนอราคา</label>
                <input className="premium-input" value={h.quoteRef || ""} onChange={(e) => setH({ ...h, quoteRef: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>หมายเหตุ</label>
                {canEdit
                  ? <Textarea rows={2} value={h.note || ""} onChange={(e) => setH({ ...h, note: e.target.value })} />
                  : <div className="readable-field"><ReadableText text={h.note} lines={4} empty={<span className="readable-field-empty">ไม่มีหมายเหตุ</span>} /></div>}
              </div>
            </div>
            {hErr && <div style={{ color: "var(--red)", fontSize: "var(--fs-7)" }}>{hErr}</div>}
            </div>
            )}
          </div>

          {/* แบ่งส่ง / รวมกลับ */}
          {po.splitFromPoId ? (
            <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--blue)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--fs-7)", color: "var(--text-2)" }}>🔗 PO นี้คือ <b>ยอดเหลือจากการแบ่งส่ง</b> (โยงกับ PO แม่)</span>
              {canEdit && <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={doMerge}>↩ รวมกลับ (ยกเลิกแบ่งส่ง)</button>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {balancePos.length > 0 && (
                <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--blue)", fontSize: "var(--fs-7)" }}>
                  🔗 PO นี้ถูกแบ่งส่ง — ยอดเหลือไปที่:{" "}
                  {balancePos.map((bp) => (
                    <Link key={bp.id} href={`/sahamit/po/${bp.id}`} style={{ color: "var(--accent)", marginRight: 10, fontWeight: "var(--fw-semibold)" }}>{bp.poNumber}</Link>
                  ))}
                </div>
              )}
              {!splitOpen ? (
                canEdit ? <button className="btn" style={{ alignSelf: "flex-start" }} onClick={openSplit}>✂ แบ่งส่ง (เปิด PO ยอดเหลือ)</button> : null
              ) : (
                <div className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontWeight: "var(--fw-semibold)" }}>แบ่งส่ง — กรอกยอดส่งจริงต่อบรรทัด (ส่วนที่เหลือจะเปิดเป็น PO ใหม่)</div>
                  <div className="form-group" style={{ maxWidth: 300 }}>
                    <label>เลขที่ PO ยอดเหลือ <span style={{ color: "var(--text-3)", fontWeight: "var(--fw-normal)" }}>(ไม่บังคับ — เว้นว่างได้ แก้ทีหลัง)</span></label>
                    <input className="premium-input font-mono" value={balanceNo} onChange={(e) => setBalanceNo(e.target.value)} placeholder="เว้นว่างไว้ก่อนได้ (ระบบตั้งเลขชั่วคราวให้)" />
                  </div>
                  <TableScroll surface="embedded">
                    <table className="premium-table">
                      <thead><tr><th>สินค้า</th><th style={{ textAlign: "right" }}>เต็ม</th><th style={{ textAlign: "right" }}>ส่งจริง</th><th style={{ textAlign: "right" }}>เหลือ</th></tr></thead>
                      <tbody>
                        {(po.lines || []).map((l) => {
                          const s = Number(shipped[l.id]);
                          const rem = Number.isFinite(s) ? Number(l.qty) - s : 0;
                          return (
                            <tr key={l.id}>
                              <td className="font-mono">{l.fgCode}</td>
                              <td style={{ textAlign: "right" }}>
                                {nf(l.qty)}
                                {casesText(l.qty, ppcOf(prodIdx.get(String(l.fgCode).trim().toLowerCase()))) && (
                                  <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{casesText(l.qty, ppcOf(prodIdx.get(String(l.fgCode).trim().toLowerCase())))}</div>
                                )}
                              </td>
                              <td style={{ padding: 2, textAlign: "right" }}>
                                <input type="number" min={0} max={l.qty} className="premium-input" style={{ width: 100, textAlign: "right", height: 30 }}
                                  value={shipped[l.id] ?? ""} onChange={(e) => setShipped({ ...shipped, [l.id]: e.target.value })} />
                              </td>
                              <td style={{ textAlign: "right", color: rem > 0 ? "var(--blue)" : "var(--text-3)" }}>{rem > 0 ? nf(rem) : NA}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableScroll>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => setSplitOpen(false)} disabled={splitBusy}>ยกเลิก</button>
                    <button className="btn btn-primary" onClick={doSplit} disabled={splitBusy}>{splitBusy ? "กำลังแบ่ง..." : "แบ่งส่ง + เปิด PO ยอดเหลือ"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lines */}
          <TableScroll style={{ overflowX: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า</th><th>ชื่อสินค้า</th>
                  <th style={{ textAlign: "right" }}>จำนวน</th>
                  <th>กำหนดส่ง</th><th>คาดการณ์ส่ง</th><th>PM</th><th>RM</th><th>ส่งจริง</th><th>สถานที่ส่ง</th><th>สถานะ</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(po.lines || []).map((l) => <PoLineRow key={l.id} line={l} tracking={trackByLine.get(l.id)} product={prodIdx.get(String(l.fgCode).trim().toLowerCase())} onChanged={async () => { await reload(); apiCache.delete("/api/sahamit/po"); apiCache.delete("/api/sahamit/material"); }} canEdit={canEdit} />)}
              </tbody>
            </table>
          </TableScroll>
        </div>

        {/* เธรดกลาง (mig 0163) — PO สหมิตรมีข้อตกลงนอกเอกสารเยอะที่สุดในระบบ
            (เลื่อนกำหนดส่ง/เปลี่ยนปลายทาง/แบ่งงวด) และเจ้านี้เป็นลูกค้าอันดับ 1
            เดิมข้อมูลพวกนี้อยู่ในแชทฝ่าย ไม่ได้ติดอยู่กับตัว PO */}
        <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title="ความเคลื่อนไหว">
          <UpdateThread
            entityType="sahamit_po"
            entityId={po.id}
            order="desc"
            placeholder="พิมพ์ข้อความ เช่น ลูกค้าขอเลื่อนส่งงวดสอง..."
            emptyText="ยังไม่มีความเคลื่อนไหว"
          />
        </DetailCard>
        </DetailPageLayout>
      )}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => !deleteBusy && setDeleteOpen(false)}
        onConfirm={deletePo}
        title="ลบ Purchase Order"
        message={`ลบ PO ${po?.poNumber || ""}? รายการทั้งใบจะถูกลบและย้อนกลับไม่ได้`}
        confirmLabel={deleteBusy ? "กำลังลบ..." : "ลบ PO"}
        danger
      />
      {/* ⚠️ ไม่ใช่ ConfirmDialog แล้ว — โมดัลนี้ถามค่าที่ต้องบันทึกจริง (ผู้ดูแล AE)
          ไม่ใช่แค่ยืนยัน · ทีม/เจ้าของของโครงการเดินตามช่องนี้ (mig 0253) */}
      <Modal
        open={projectConfirmOpen}
        onClose={() => !projectBusy && setProjectConfirmOpen(false)}
        title="สร้าง RE-ORDER Project จาก PO นี้?"
        size="sm"
        footer={(
          <>
            <Button variant="quiet" onClick={() => setProjectConfirmOpen(false)} disabled={projectBusy}>ยกเลิก</Button>
            <Button tone="primary" onClick={createProject} disabled={projectBusy || (!lockedOwner && !projectAeId) || !projectAcId || !projectSupervisorId}>
              {projectBusy ? "กำลังสร้าง..." : "สร้างโครงการ"}
            </Button>
          </>
        )}
      >
        <div className="pm-form-grid gap-[12px]">
          <div className="form-group col-span-2">
            <ReadableText text={`ระบบจะสร้าง PM project จาก PO ${po?.poNumber || ""} และผูก FG/จำนวนจากรายการใน PO นี้ กดซ้ำภายหลังจะเปิดโครงการเดิม ไม่สร้างซ้ำ`} />
          </div>
          <div className="form-group col-span-2">
            <label>ผู้ดูแลโครงการ (AE) <span className="required-mark">*</span></label>
            {lockedOwner ? (
              /* ล็อกไม่ใช่ซ่อน (docs/form-design-rules.md §2) — คนต้องเห็นว่าใบนี้จะเป็นของใคร */
              <div className="deal-derived">{lockedOwner.name} (คุณ)</div>
            ) : (
              <Select
                className="w-full"
                value={projectAeId}
                onChange={(e) => setProjectAeId(e.target.value)}
                aria-label="ผู้ดูแลโครงการ (AE)"
              >
                <option value="">— เลือกผู้ดูแล —</option>
                {aeOwners.map((u) => (
                  <option key={u.id} value={u.id}>{u.team ? `${u.name} · ${u.team}` : u.name}</option>
                ))}
              </Select>
            )}
            <p className="form-note">โครงการจะเข้าลิสต์และทีมของผู้ดูแลคนนี้ — ไม่ใช่ของคนกดสร้าง</p>
          </div>
          {/* อีกสองฝ่ายของโครงการ — บังคับเท่ากับผู้ดูแล (มติผู้ใช้ 2026-08-14)
              เดิม route เขียนสองช่องนี้เป็นค่าว่างตายตัว ⇒ โครงการจาก PO ไม่มีผู้ประสานงาน
              และไม่มีผู้ตรวจสอบเลยสักใบ */}
          <div className="form-group col-span-2">
            <label>ผู้ประสานงาน (AC) <span className="required-mark">*</span></label>
            <Select
              className="w-full"
              value={projectAcId}
              onChange={(e) => setProjectAcId(e.target.value)}
              aria-label="ผู้ประสานงาน (AC)"
            >
              <option value="">— เลือกผู้ประสานงาน —</option>
              {acUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.team ? `${u.name} · ${u.team}` : u.name}</option>
              ))}
            </Select>
          </div>
          <div className="form-group col-span-2">
            <label>ผู้ตรวจสอบ (AE Supervisor) <span className="required-mark">*</span></label>
            <Select
              className="w-full"
              value={projectSupervisorId}
              onChange={(e) => setProjectSupervisorId(e.target.value)}
              aria-label="ผู้ตรวจสอบ (AE Supervisor)"
            >
              <option value="">— เลือกผู้ตรวจสอบ —</option>
              {supervisorUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>

      <Modal open={linkOpen} onClose={() => !linkBusy && setLinkOpen(false)} title="เลือกโครงการเดิมมาเชื่อม PO">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {linkLoading ? (
            <div style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>กำลังโหลดโครงการ…</div>
          ) : linkProjects.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>ยังไม่มีโครงการสหมิตรให้เลือก — ใช้ &quot;สร้างโครงการใหม่&quot; แทน</div>
          ) : (
            <>
              <label style={{ fontSize: "var(--fs-7)", fontWeight: "var(--fw-semibold)" }}>โครงการ</label>
              {/* ค้นได้ด้วยรหัส/ชื่อโครงการ (มติผู้ใช้ 2026-08-06) — โครงการสหมิตรสะสมทุกรอบ RE-ORDER */}
              <SearchableSelect className="w-full" entity="project" ariaLabel="โครงการที่จะเชื่อม PO"
                value={linkProjectId} onChange={setLinkProjectId}
                options={linkProjects.map((p) => ({
                  value: p.id,
                  label: `${p.code ? `${p.code} · ` : ""}${p.name}${p.type ? ` (${p.type})` : ""}`,
                  search: `${p.code || ""} ${p.name || ""} ${p.type || ""}`,
                }))}
                placeholder="— เลือกโครงการ —"
                searchPlaceholder="ค้นหารหัสหรือชื่อโครงการ…"
                emptyText="ไม่พบโครงการที่ตรงกับคำค้น" />
              <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
                FG และจำนวนจาก PO นี้จะถูกเพิ่มเข้าโครงการที่เลือก แล้วเดินขั้นตอน &quot;ยืนยันดีล + ออกใบเสนอราคา&quot; ต่อได้
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn ghost" onClick={() => !linkBusy && setLinkOpen(false)} disabled={linkBusy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={submitLinkProject} disabled={linkBusy || !linkProjectId}>
              {linkBusy ? "กำลังเชื่อม…" : "เชื่อมโครงการ"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={settleOpen} onClose={() => !settleBusy && setSettleOpen(false)} title="ยืนยันดีล + ออกใบเสนอราคา (รายบรรทัด)" size="lg">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {!settleData ? (
            <div style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>กำลังโหลดดีลที่แนะนำ…</div>
          ) : (
            <>
              {/* ยังไม่มีโครงการ = แก้ตรงนี้เลย ไม่ต้องปิดโมดัลไปหาปุ่มอื่น
                  ⚠️ ระบบ **ไม่สร้างโครงการให้เอง** โดยเจตนา (มติผู้ใช้ 2026-07-29) —
                  โครงการคือศูนย์รวมข้อมูลดีลของสินค้าตัวนั้น การเลือกว่า PO ใบนี้เป็น
                  รอบใหม่ของโครงการเดิม หรือเป็นสินค้าใหม่จริง ๆ เป็นการตัดสินของคน */}
              {!settleData.projectId && (
                <div className={`glass-panel ${styles.needProject}`}>
                  <div>
                    ⚠ PO นี้ยังไม่มีโครงการ PM — ต้องมีก่อนจึงออกใบเสนอราคาได้
                    <div className={styles.needProjectWhy}>
                      โครงการคือศูนย์รวมข้อมูลดีลของสินค้า — RE-ORDER รอบใหม่ควร<b>ผูกโครงการเดิม</b>
                      เพื่อให้สูตร/กลิ่น/ทะเบียนสรรพสามิต/BOM ที่ทำไว้แล้วอยู่ที่เดียวกัน
                      สร้างใหม่เฉพาะตอนเป็นสินค้าที่ยังไม่เคยมีโครงการ
                    </div>
                  </div>
                  {inlineProjects.length > 0 ? (
                    <div className={styles.needProjectPick}>
                      <Select
                        value={inlineProjectId}
                        onChange={(e) => setInlineProjectId(e.target.value)}
                        aria-label="เลือกโครงการเดิมมาผูก"
                      >
                        <option value="">— เลือกโครงการเดิม —</option>
                        {inlineProjects.map((p) => (
                          <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.name}{p.type ? ` (${p.type})` : ""}</option>
                        ))}
                      </Select>
                      <Button
                        tone="primary" size="sm"
                        onClick={linkProjectInline}
                        disabled={inlineBusy || !inlineProjectId}
                      >
                        {inlineBusy ? "กำลังผูก…" : "ผูกโครงการนี้"}
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.needProjectNote}>
                      {inlineLoading ? "กำลังโหลดโครงการ…" : "ยังไม่มีโครงการของลูกค้ารายนี้ให้เลือก"}
                    </div>
                  )}
                  {canCreateProject && (
                    <div className={styles.needProjectNote}>
                      เป็นสินค้าใหม่ที่ยังไม่มีโครงการ?{" "}
                      <button
                        type="button" className="linklike"
                        onClick={() => { setSettleOpen(false); setProjectConfirmOpen(true); }}
                      >
                        สร้างโครงการใหม่จาก PO นี้
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* เชื่อมครบแล้ว = ใบเสนอราคาออกไปแล้วตั้งแต่ตอนยืนยัน (action เดียวทำทั้ง
                  รวมดีล + ออกใบ) — พาไปดูใบเดิม ไม่ใช่ปล่อยให้กดยืนยันแล้วเจอ
                  "ไม่มีบรรทัดที่จะเชื่อม" */}
              {settleData.allSettled && (
                <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--green)", fontSize: "var(--fs-7)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>✓ PO ใบนี้เชื่อมดีลครบทุกบรรทัดแล้ว — <b>ใบเสนอราคาออกไปแล้ว</b>ตอนกดยืนยัน ไม่ต้องออกซ้ำ</div>
                  {settleData.quotations?.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {settleData.quotations.map((q) => (
                        <a key={q.id} href={`/sa/quotations/${q.id}`} style={{ color: "var(--accent)", fontSize: "var(--fs-5)" }}>
                          <span className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>{q.quoteNumber}</span>
                          {" · "}{fmtMoneyCompact(q.totalAmount)}
                          {" · "}{q.approvalStatus === "approved" ? "เจ้าของดีลเซ็นแล้ว" : "รอเจ้าของดีลเซ็น"}
                          {" →"}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
                      ⚠ ไม่พบใบเสนอราคาของดีลนี้ — เปิดดีลขายเพื่อตรวจสอบ หรือแจ้งแอดมิน
                    </div>
                  )}
                </div>
              )}
              <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
                จับคู่แต่ละสินค้าใน PO กับดีล FC ของมัน (แนะนำดีลที่เดือนคาดปิดใกล้เดือนรับ PO {naText(settleData.poReceivedMonth)} สุด)
                — ยืนยันแล้วระบบจะ<b>รวมทุกบรรทัดเป็นดีลเดียว (SHM_PO {settleData.poNumber || ""})</b> ผูกเข้าโครงการ
                แล้วออก<b>ใบเสนอราคา 1 ใบหลายบรรทัด (ราคาตาม master)</b> เข้าคิวอนุมัติเจ้าของดีล
                — ยอดเก็บเงิน/งวดชำระ/SO จะตรงกับ PO ทั้งใบ · ดีล FC ต้นทางถูกยุบเข้าดีลรวม
                (แบ่งได้ถ้า PO ครอบบางส่วน) · Won เกิดตอน accept ใบเสนอราคา (แนบไฟล์ PO + เลือกเดือน)
              </div>
              <TableScroll style={{ overflowX: "auto" }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th style={{ textAlign: "right" }}>จำนวน</th>
                      <th style={{ minWidth: 240 }}>เชื่อมกับดีล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settleData.lines.map((ln) => {
                      const chosen = ln.candidates.find((c) => c.id === settleChoices[ln.poLineId]);
                      const partial = chosen && chosen.allocQty > ln.qty; // PO ครอบดีลบางส่วน → ให้เลือกแบ่ง/ทั้งดีล (มติ §7)
                      return (
                        <tr key={ln.poLineId}>
                          <td>
                            <span className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>{ln.fgCode}</span>
                            <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>{naText(ln.productName)}</div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {nf(ln.qty)}
                            {casesText(ln.qty, ppcOf(prodIdx.get(String(ln.fgCode).trim().toLowerCase()))) && (
                              <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{casesText(ln.qty, ppcOf(prodIdx.get(String(ln.fgCode).trim().toLowerCase())))}</div>
                            )}
                          </td>
                          <td>
                            {ln.settledDealId ? (
                              <a className="ui-badge" style={{ color: "var(--green)" }} href={`/sa/deals/${ln.settledDealId}`}>รวมในดีล PO แล้ว →</a>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <Select
                                  className="premium-select"
                                  style={{ height: 32, minWidth: 230 }}
                                  value={settleChoices[ln.poLineId] || "new"}
                                  onChange={(e) => setSettleChoices((p) => ({ ...p, [ln.poLineId]: e.target.value }))}
                                >
                                  {ln.candidates.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.title} · คาดปิด {naText(c.forecastMonth)} · {fmtMoneyCompact(c.projectValue)}{c.id === ln.suggestedDealId ? " (แนะนำ)" : !c.match ? " · ไม่ตรงสินค้า" : ""}
                                    </option>
                                  ))}
                                  <option value="new">— ไม่มีดีล FC (สินค้านอก forecast — เข้าดีลรวมเลย) —</option>
                                  <option value="skip">— ข้าม (ไม่เชื่อม) —</option>
                                </Select>
                                {partial && (
                                  <Select
                                    className="premium-select"
                                    style={{ height: 30, minWidth: 230, fontSize: "var(--fs-5)" }}
                                    value={settleModes[ln.poLineId] || "split"}
                                    onChange={(e) => setSettleModes((p) => ({ ...p, [ln.poLineId]: e.target.value }))}
                                    title={`PO ครอบ ${nf(ln.qty)} จากที่ดีลผูกไว้ ${nf(chosen.allocQty)}`}
                                  >
                                    <option value="split">แบ่ง — ยุบเฉพาะที่ PO ครอบ, เหลือ {nf(chosen.allocQty - ln.qty)} ชิ้นเปิดรอ PO ถัดไป</option>
                                    <option value="whole">ทั้งดีล — ยุบทั้งดีลเข้าดีลรวมของ PO นี้</option>
                                  </Select>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button className="btn" onClick={() => setSettleOpen(false)} disabled={settleBusy}>
                  {settleData.allSettled ? "ปิด" : "ยกเลิก"}
                </button>
                {/* ไม่มีบรรทัดเหลือ = ไม่มีอะไรให้ยืนยัน — ซ่อนปุ่มแทนที่จะให้กดแล้วเด้ง toast */}
                {!settleData.allSettled && (
                  <button className="btn btn-primary" onClick={confirmSettle} disabled={settleBusy || !settleData.projectId}>
                    {settleBusy ? "กำลังออกใบเสนอราคา…" : "ยืนยัน + ออกใบเสนอราคา"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </Workspace>
  );
}
