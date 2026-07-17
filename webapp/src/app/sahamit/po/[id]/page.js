"use client";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Pencil, Save, Trash2, History, Truck, ChevronDown, ChevronRight, AlertCircle, PackageCheck, ExternalLink } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { apiCache } from "@/lib/apiCache";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { productMetaText, indexProducts } from "@/lib/sahamit/productMeta";
import { fmtDate, fmtMoneyCompact } from "@/lib/format";
import { poTotalQty, poLineCount, PO_STATUS_LABEL } from "@/lib/sahamit/po";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { DestinationToggle, destinationLabel } from "@/components/sahamit/destinations";
import { useCan } from "@/lib/roleContext";
import ConfirmModal from "@/components/tax/ConfirmModal";
import Modal from "@/components/Modal";
import Toast from "@/components/ui/Toast";

const STATUS_OPTIONS = ["open", "partial", "delivered", "cancelled"];
const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// สถานะวัสดุ 1 ช่อง (อ่านอย่างเดียว): มาแล้ว / กำหนดถึง / — (แก้ที่เมนูวัสดุเท่านั้น)
function matCell(dueDate, arrivedAt) {
  if (arrivedAt) return <span style={{ color: "var(--green)", fontWeight: 600 }}>✓ มาแล้ว {fmtDate(arrivedAt)}</span>;
  if (dueDate) return <span style={{ color: "var(--text-2)" }}>กำหนด {fmtDate(dueDate)}</span>;
  return <span style={{ color: "var(--text-3)" }}>—</span>;
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
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const save = () => {
    const rescheduled = (d.expectedDate || "") !== (line.expectedDate || "");
    if (rescheduled && !d.rescheduleReason) {
      if (!confirm("เลื่อนวันคาดการณ์ส่งโดยไม่ระบุเหตุผล?")) return;
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

  const del = () => {
    if (!confirm(`ลบรายการ ${line.fgCode}?`)) return;
    call(`/api/sahamit/po/lines/${line.id}`, { method: "DELETE" });
  };

  const hist = Array.isArray(line.expectedHistory) ? line.expectedHistory : [];

  return (
    <>
      <tr>
        <td className="font-mono" style={{ fontWeight: 600 }}>
          {line.fgCode}
          {line.splitFromPoLineId && <span className="ui-badge" style={{ marginLeft: 6, color: "var(--blue)", borderColor: "var(--blue)" }}>ยอดแยก</span>}
        </td>
        <td style={{ color: line.productName ? "inherit" : "var(--amber)" }}>
          {line.productName || "— ไม่รู้จัก —"}
          {productMetaText(product) && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{productMetaText(product)}</div>}
        </td>
        <td style={{ textAlign: "right" }}>
          <div>เต็ม {nf(line.qty)}</div>
          {casesText(line.qty, ppcOf(product)) && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{casesText(line.qty, ppcOf(product))}</div>}
          {line.shippedQty != null && (
            <div style={{ fontSize: 11 }}>
              <span style={{ color: "var(--green)" }}>ส่งแล้ว {nf(line.shippedQty)}</span>
              {" · "}
              <span style={{ color: "var(--blue)" }}>เหลือ {nf(Number(line.qty) - Number(line.shippedQty))}</span>
            </div>
          )}
        </td>
        <td>{line.dueDate ? fmtDate(line.dueDate) : "—"}</td>
        <td>
          {line.expectedDate ? fmtDate(line.expectedDate) : "—"}
          {hist.length > 0 && (
            <button className="btn-icon" title={`เลื่อนมาแล้ว ${hist.length} ครั้ง`} onClick={() => setShowHist((v) => !v)} style={{ marginLeft: 4 }}>
              <History size={13} />
            </button>
          )}
        </td>
        <td>{matCell(tracking?.pmDueDate, tracking?.pmArrivedAt)}</td>
        <td>{matCell(tracking?.rmDueDate, tracking?.rmArrivedAt)}</td>
        <td>{line.actualDeliveredDate ? fmtDate(line.actualDeliveredDate) : "—"}</td>
        <td>{destinationLabel(line.destination) || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
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
          <td colSpan={11} style={{ background: "var(--panel-2)", fontSize: 12 }}>
            <b>ประวัติการเลื่อนวันคาดการณ์ส่ง:</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {hist.map((h, i) => (
                <li key={i}>เดิม {h.expectedDate ? fmtDate(h.expectedDate) : "—"} {h.reason ? `· ${h.reason}` : ""} <span style={{ color: "var(--text-3)" }}>({h.changedAt ? fmtDate(h.changedAt) : ""})</span></li>
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
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleData, setSettleData] = useState(null); // { poReceivedMonth, lines } | null=กำลังโหลด
  const [settleChoices, setSettleChoices] = useState({}); // poLineId -> dealId | "new" | "skip"
  const [toast, setToast] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ลบทั้งใบ — server เป็นคนตัดสินว่าลบได้ไหม (ผูกโครงการ/ดีล/แบ่งส่ง/วัสดุ = 409
  // พร้อมข้อความบอกว่าติดอะไร) หน้าเว็บแค่ถามยืนยันแล้วส่งต่อข้อความนั้นให้ผู้ใช้
  const deletePo = async () => {
    if (!confirm(`ลบ PO ${po?.poNumber || ""}? รายการทั้งใบจะถูกลบและย้อนกลับไม่ได้`)) return;
    setDeleteBusy(true);
    try {
      await sahamitFetch(`/api/sahamit/po/${id}`, { method: "DELETE" });
      apiCache.delete("/api/sahamit/po");
      apiCache.delete("/api/sahamit/material");
      router.push("/sahamit/po");
    } catch (e) {
      alert(e.message || "ลบ PO ไม่สำเร็จ");
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
    if (!lines.some((l) => Number.isFinite(l.shippedQty) && l.shippedQty >= 0)) { alert("กรอกยอดส่งจริง"); return; }
    setSplitBusy(true);
    try {
      await sahamitFetch(`/api/sahamit/po/${id}/split`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balancePoNumber: balanceNo.trim(), lines }),
      });
      setSplitOpen(false); reload();
    } catch (e) { alert(e.message); }
    setSplitBusy(false);
  };
  const doMerge = async () => {
    if (!confirm("รวมกลับ (ยกเลิกแบ่งส่ง)? PO ยอดเหลือใบนี้จะถูกลบ และ PO แม่กลับเป็นยอดเต็ม")) return;
    try {
      const j = await sahamitFetch(`/api/sahamit/po/${id}/merge`, { method: "POST" });
      router.push(j?.restoredPoId ? `/sahamit/po/${j.restoredPoId}` : "/sahamit/po");
    } catch (e) { alert(e.message); }
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
    setProjectBusy(true);
    try {
      const payload = await sahamitFetch(`/api/sahamit/po/${id}/create-project`, { method: "POST" });
      setProjectConfirmOpen(false);
      if (payload.warning) setToast({ kind: "info", msg: payload.warning });
      const project = payload.project;
      if (project?.code || project?.id) router.push(`/sa/projects/${project.code || project.id}`);
      else await reload();
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "สร้างโครงการไม่สำเร็จ" });
    } finally {
      setProjectBusy(false);
    }
  };

  // เปิด modal จับคู่รายบรรทัด (โหลด candidate ต่อบรรทัด)
  const openSettleModal = async () => {
    setSettleOpen(true);
    setSettleData(null);
    setSettleChoices({});
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
      setToast({ kind: "error", msg: e.message || "โหลดโครงการที่แนะนำไม่สำเร็จ" });
    }
  };

  // ยืนยันเชื่อม PO → โครงการ รายบรรทัด (ปิด Won ได้หลายโครงการ)
  const confirmSettle = async () => {
    const settlements = (settleData?.lines || [])
      .filter((ln) => !ln.settledDealId)
      .map((ln) => ({ ln, choice: settleChoices[ln.poLineId] }))
      .filter((x) => x.choice && x.choice !== "skip")
      .map(({ ln, choice }) => (choice === "new"
        ? { poLineId: ln.poLineId, createNew: true }
        : { poLineId: ln.poLineId, dealId: choice }));
    if (!settlements.length) { setToast({ kind: "info", msg: "ไม่มีบรรทัดที่จะเชื่อม" }); return; }
    setSettleBusy(true);
    try {
      const payload = await sahamitFetch(`/api/sahamit/po/${id}/settle-deal`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settlements }),
      });
      setSettleOpen(false);
      setToast({ kind: "success", msg: `ปิด Won เข้าโครงการแล้ว ${payload.settled || 0} โครงการ` });
      await reload();
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "เชื่อมโครงการไม่สำเร็จ" });
    } finally {
      setSettleBusy(false);
    }
  };

  return (
    <Workspace
      icon={<FileText size={22} />}
      title={po ? `PO ${po.poNumber}` : "PO"}
      subtitle="รายละเอียดใบสั่งซื้อ (ลูกค้า AR-109)"
      back={{ href: "/sahamit/po", label: "Purchase Orders" }}
    >
      <Toast toast={toast} onClose={() => setToast(null)} />
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : !po ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ไม่พบ PO นี้</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Summary */}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 12, color: "var(--text-3)" }}>จำนวนรายการ</div><div style={{ fontSize: 20, fontWeight: 700 }}>{poLineCount(po)}</div></div>
            <div><div style={{ fontSize: 12, color: "var(--text-3)" }}>ยอดรวม (ชิ้น)</div><div style={{ fontSize: 20, fontWeight: 700 }}>{nf(poTotalQty(po))}</div></div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* การขาย (หลัก): เชื่อม PO เข้าโครงการรายบรรทัด → ปิด Won */}
              {canSettle && (
                <button type="button" className="btn btn-primary" onClick={openSettleModal} disabled={!po.lines?.length}>
                  <PackageCheck size={14} /> {po.salesDealId ? "จัดการการเชื่อมโครงการ" : "เชื่อมเข้าโครงการ (ปิด Won)"}
                </button>
              )}
              {po.salesDealId && (
                <a className="btn ghost" href={`/sa/deals/${po.salesDealId}`}>
                  <ExternalLink size={14} /> เปิดโครงการ
                </a>
              )}

              {/* PM project (ออปชัน) */}
              {po.projectId ? (
                <button type="button" className="btn" onClick={() => router.push(`/sa/projects/${po.projectId}`)}>
                  <ExternalLink size={14} /> เปิด PM Project
                </button>
              ) : canCreateProject ? (
                <button type="button" className="btn ghost" onClick={() => setProjectConfirmOpen(true)} disabled={!po.lines?.length}>
                  <PackageCheck size={14} /> สร้าง PM (ออปชัน)
                </button>
              ) : null}

              {/* แก้/ลบ ทั้งใบ — ฟอร์มแก้เป็นตัวเดียวกับตอนสร้าง; ลบมี guard ฝั่ง server
                  (PO ที่ผูกโครงการ/ดีล/แบ่งส่ง/วัสดุ จะตีกลับพร้อมบอกว่าติดอะไร) */}
              {canEdit && (
                <button type="button" className="btn ghost" onClick={() => router.push(`/sahamit/po/${id}/edit`)}>
                  <Pencil size={14} /> แก้ไข PO
                </button>
              )}
              {canEdit && (
                <button type="button" className="btn ghost danger" onClick={deletePo} disabled={deleteBusy}>
                  <Trash2 size={14} /> {deleteBusy ? "กำลังลบ..." : "ลบ PO"}
                </button>
              )}
            </div>
          </div>

          {/* Header editor — ย่อ/ขยายได้ แบบหัว ISO */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel)" }}>
            <button
              onClick={() => setHeaderExpanded((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--panel-2)", border: "none", cursor: "pointer", textAlign: "left", overflow: "hidden", borderRadius: headerExpanded ? "10px 10px 0 0" : "10px" }}
              title={headerExpanded ? "ย่อหัว PO" : "ขยายหัว PO"}
            >
              {headerExpanded ? <ChevronDown size={18} color="var(--accent)" /> : <ChevronRight size={18} color="var(--accent)" />}
              <span style={{ fontSize: 14, fontWeight: 600, flexShrink: 0 }}>ข้อมูลหัว PO</span>
              {!headerExpanded && (
                <span style={{ fontSize: 13, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8, marginLeft: 8 }}>
                  {[po.poNumber, po.docDate && `เอกสาร ${fmtDate(po.docDate)}`, po.receivedDate && `รับ ${fmtDate(po.receivedDate)}`, po.dueDate && `กำหนดส่ง ${fmtDate(po.dueDate)}`, destinationLabel(po.destination), po.quoteRef].filter(Boolean).join("   ·   ")}
                </span>
              )}
              <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto", fontWeight: 500 }}>(คลิกเพื่อ{headerExpanded ? "ย่อ" : "ขยาย"})</span>
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
                <input className="premium-input" value={h.note || ""} onChange={(e) => setH({ ...h, note: e.target.value })} />
              </div>
              {canEdit && <button className="btn btn-primary" onClick={saveHeader} disabled={busy}><Save size={14} /> {busy ? "กำลังบันทึก..." : "บันทึก PO"}</button>}
            </div>
            {hErr && <div style={{ color: "var(--red)", fontSize: 13 }}>{hErr}</div>}
            </div>
            )}
          </div>

          {/* แบ่งส่ง / รวมกลับ */}
          {po.splitFromPoId ? (
            <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--blue)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>🔗 PO นี้คือ <b>ยอดเหลือจากการแบ่งส่ง</b> (โยงกับ PO แม่)</span>
              {canEdit && <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={doMerge}>↩ รวมกลับ (ยกเลิกแบ่งส่ง)</button>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {balancePos.length > 0 && (
                <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--blue)", fontSize: 13 }}>
                  🔗 PO นี้ถูกแบ่งส่ง — ยอดเหลือไปที่:{" "}
                  {balancePos.map((bp) => (
                    <Link key={bp.id} href={`/sahamit/po/${bp.id}`} style={{ color: "var(--accent)", marginRight: 10, fontWeight: 600 }}>{bp.poNumber}</Link>
                  ))}
                </div>
              )}
              {!splitOpen ? (
                canEdit ? <button className="btn" style={{ alignSelf: "flex-start" }} onClick={openSplit}>✂ แบ่งส่ง (เปิด PO ยอดเหลือ)</button> : null
              ) : (
                <div className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontWeight: 600 }}>แบ่งส่ง — กรอกยอดส่งจริงต่อบรรทัด (ส่วนที่เหลือจะเปิดเป็น PO ใหม่)</div>
                  <div className="form-group" style={{ maxWidth: 300 }}>
                    <label>เลขที่ PO ยอดเหลือ <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(ไม่บังคับ — เว้นว่างได้ แก้ทีหลัง)</span></label>
                    <input className="premium-input font-mono" value={balanceNo} onChange={(e) => setBalanceNo(e.target.value)} placeholder="เว้นว่างไว้ก่อนได้ (ระบบตั้งเลขชั่วคราวให้)" />
                  </div>
                  <div className="premium-table-wrapper">
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
                                  <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesText(l.qty, ppcOf(prodIdx.get(String(l.fgCode).trim().toLowerCase())))}</div>
                                )}
                              </td>
                              <td style={{ padding: 2, textAlign: "right" }}>
                                <input type="number" min={0} max={l.qty} className="premium-input" style={{ width: 100, textAlign: "right", height: 30 }}
                                  value={shipped[l.id] ?? ""} onChange={(e) => setShipped({ ...shipped, [l.id]: e.target.value })} />
                              </td>
                              <td style={{ textAlign: "right", color: rem > 0 ? "var(--blue)" : "var(--text-3)" }}>{rem > 0 ? nf(rem) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => setSplitOpen(false)} disabled={splitBusy}>ยกเลิก</button>
                    <button className="btn btn-primary" onClick={doSplit} disabled={splitBusy}>{splitBusy ? "กำลังแบ่ง..." : "แบ่งส่ง + เปิด PO ยอดเหลือ"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lines */}
          <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
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
          </div>
        </div>
      )}
      <ConfirmModal
        open={projectConfirmOpen}
        onClose={() => !projectBusy && setProjectConfirmOpen(false)}
        onConfirm={createProject}
        title="สร้าง RE-ORDER Project จาก PO นี้?"
        message={`ระบบจะสร้าง PM project จาก PO ${po?.poNumber || ""} และผูก FG/จำนวนจากรายการใน PO นี้ กดซ้ำภายหลังจะเปิดโครงการเดิม ไม่สร้างซ้ำ`}
        confirmLabel={projectBusy ? "กำลังสร้าง..." : "สร้างโครงการ"}
        danger={false}
      />

      <Modal open={settleOpen} onClose={() => !settleBusy && setSettleOpen(false)} title="เชื่อม PO เข้าโครงการแผนการขาย (ปิด Won รายบรรทัด)" size="lg">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {!settleData ? (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>กำลังโหลดโครงการที่แนะนำ…</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                จับคู่แต่ละสินค้าใน PO กับโครงการของมันเอง (แนะนำโครงการที่เดือนคาดปิดใกล้เดือนรับ PO {settleData.poReceivedMonth || "—"} สุด) — ปิด Won ได้หลายโครงการ
              </div>
              <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th style={{ textAlign: "right" }}>จำนวน</th>
                      <th style={{ minWidth: 240 }}>เชื่อมกับโครงการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settleData.lines.map((ln) => (
                      <tr key={ln.poLineId}>
                        <td>
                          <span className="font-mono" style={{ fontWeight: 600 }}>{ln.fgCode}</span>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{ln.productName || "—"}</div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {nf(ln.qty)}
                          {casesText(ln.qty, ppcOf(prodIdx.get(String(ln.fgCode).trim().toLowerCase()))) && (
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesText(ln.qty, ppcOf(prodIdx.get(String(ln.fgCode).trim().toLowerCase())))}</div>
                          )}
                        </td>
                        <td>
                          {ln.settledDealId ? (
                            <a className="ui-badge" style={{ color: "var(--green)" }} href={`/sa/deals/${ln.settledDealId}`}>เชื่อมแล้ว (Won) →</a>
                          ) : (
                            <Select
                              className="premium-select"
                              style={{ height: 32, minWidth: 230 }}
                              value={settleChoices[ln.poLineId] || "new"}
                              onChange={(e) => setSettleChoices((p) => ({ ...p, [ln.poLineId]: e.target.value }))}
                            >
                              {ln.candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title} · คาดปิด {c.forecastMonth || "—"} · {fmtMoneyCompact(c.projectValue)}{c.id === ln.suggestedDealId ? " (แนะนำ)" : !c.match ? " · ไม่ตรงสินค้า" : ""}
                                </option>
                              ))}
                              <option value="new">— สร้างโครงการใหม่ (PO นอก forecast) —</option>
                              <option value="skip">— ข้าม (ไม่เชื่อม) —</option>
                            </Select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button className="btn" onClick={() => setSettleOpen(false)} disabled={settleBusy}>ยกเลิก</button>
                <button className="btn btn-primary" onClick={confirmSettle} disabled={settleBusy}>
                  {settleBusy ? "กำลังปิด Won…" : "ยืนยันปิด Won"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </Workspace>
  );
}
