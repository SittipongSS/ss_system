"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Plus, AlertCircle, ChevronRight, ChevronDown, Save, Pencil, Download } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";
import { poTotalQty, poLineCount, poRollupStatus, PO_STATUS_LABEL } from "@/lib/sahamit/po";
import { destinationLabel } from "@/components/sahamit/destinations";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// บรรทัดสินค้าใน PO (มุมมองวัสดุ): จำนวน/เดือนส่ง/วันรับ PO/วันส่งแนะนำ/วันกำหนด/PM/RM/ส่งจริง
// + แก้ PM/RM inline (เหมือนหน้าวัสดุ). `row` = แถวจาก /api/sahamit/material.
function PoLineRow({ row, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({});
  useEffect(() => {
    const t = row.tracking || {};
    setD({
      pmInStock: !!t.pmInStock, pmArrivedAt: t.pmArrivedAt || "",
      rmOrderedAt: t.rmOrderedAt || "", rmArrivedAt: t.rmArrivedAt || "", note: t.note || "",
    });
  }, [row]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sahamit/material/${row.poLineId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      onSaved?.();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const t = row.tracking || {};
  return (
    <>
      <tr>
        <td className="font-mono" style={{ fontWeight: 600 }}>
          {row.fgCode}
          <div style={{ fontSize: 11, color: row.productName ? "var(--text-3)" : "var(--amber)" }}>{row.productName || "— ไม่รู้จัก —"}</div>
        </td>
        <td style={{ textAlign: "right" }}>{nf(row.qty)}</td>
        <td>{row.deliveryMonth || "—"}</td>
        <td>{row.receivedDate ? fmtDate(row.receivedDate) : "—"}</td>
        <td>
          {row.readyDate ? fmtDate(row.readyDate) : "—"}
          {row.lateVsDue && <div style={{ fontSize: 10.5, color: "var(--amber)" }}>เกินกำหนด (PO/lead)</div>}
        </td>
        <td>{row.dueDate ? fmtDate(row.dueDate) : "—"}</td>
        <td style={{ color: t.pmInStock ? "var(--green)" : "var(--text-3)" }}>{t.pmInStock ? "พร้อม" : "—"}{t.pmArrivedAt ? ` (${fmtDate(t.pmArrivedAt)})` : ""}</td>
        <td style={{ color: t.rmArrivedAt ? "var(--green)" : t.rmOrderedAt ? "var(--blue)" : "var(--text-3)" }}>{t.rmArrivedAt ? `รับ ${fmtDate(t.rmArrivedAt)}` : t.rmOrderedAt ? `สั่ง ${fmtDate(t.rmOrderedAt)}` : "—"}</td>
        <td>
          {row.actualDeliveredDate ? fmtDate(row.actualDeliveredDate) : "—"}
          {row.ourSlip && <div style={{ fontSize: 10.5, color: "var(--red)" }}>เราส่งช้า</div>}
        </td>
        <td><button className="btn-icon" onClick={() => setOpen((v) => !v)} title="แก้สถานะวัสดุ">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={10} style={{ background: "var(--panel-2)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", padding: "6px 2px" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={d.pmInStock} onChange={(e) => setD({ ...d, pmInStock: e.target.checked })} /> PM มีสต็อก
              </label>
              <div className="form-group" style={{ width: 150 }}>
                <label>PM มาถึง</label>
                <input type="date" className="premium-input" style={{ height: 30 }} value={d.pmArrivedAt} onChange={(e) => setD({ ...d, pmArrivedAt: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label>RM สั่งเมื่อ</label>
                <input type="date" className="premium-input" style={{ height: 30 }} value={d.rmOrderedAt} onChange={(e) => setD({ ...d, rmOrderedAt: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label>RM มาถึง</label>
                <input type="date" className="premium-input" style={{ height: 30 }} value={d.rmArrivedAt} onChange={(e) => setD({ ...d, rmArrivedAt: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: "1 1 160px", minWidth: 140 }}>
                <label>หมายเหตุ</label>
                <input className="premium-input" style={{ height: 30 }} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
              </div>
              <button className="btn btn-primary sm" onClick={save} disabled={busy}><Save size={14} /> บันทึก</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PoPage() {
  const { data: pos, loading, error, reload } = useApiList("/api/sahamit/po");
  const { data: material, reload: reloadMaterial } = useApiList("/api/sahamit/material");
  const [openPo, setOpenPo] = useState({});

  // material lines grouped by PO number (คัดเฉพาะบรรทัด active แล้วจาก API)
  const matByPo = useMemo(() => {
    const m = new Map();
    for (const r of material) {
      if (!m.has(r.poNumber)) m.set(r.poNumber, []);
      m.get(r.poNumber).push(r);
    }
    return m;
  }, [material]);

  const toggle = (id) => setOpenPo((s) => ({ ...s, [id]: !s[id] }));

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="Purchase Orders"
      subtitle="ติดตาม PO รายใบ · ขยายเพื่อดูรายการ + สถานะวัสดุ (ลูกค้า AR-109)"
      back={{ href: "/sahamit", label: "งานสหมิตร" }}
      headerRight={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={() => window.open("/api/sahamit/export?view=po", "_blank")}>
            <Download size={16} /> Excel
          </button>
          <Link href="/sahamit/po/new" className="btn btn-primary">
            <Plus size={16} /> บันทึก PO
          </Link>
        </div>
      }
    >
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : pos.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ยังไม่มี PO</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>เริ่มจากบันทึก PO ที่ลูกค้าส่งมา</div>
          <Link href="/sahamit/po/new" className="btn btn-primary" style={{ marginTop: 16 }}>
            <Plus size={16} /> บันทึก PO
          </Link>
        </div>
      ) : (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>เลขที่ PO</th>
                <th>วันที่เอกสาร</th>
                <th>วันรับ PO</th>
                <th>กำหนดรับ</th>
                <th>สถานที่ส่ง</th>
                <th style={{ textAlign: "right" }}>รายการ</th>
                <th style={{ textAlign: "right" }}>จำนวนรวม</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => {
                const lines = matByPo.get(po.poNumber) || [];
                const isOpen = !!openPo[po.id];
                return (
                  <PoGroup key={po.id} po={po} lines={lines} isOpen={isOpen} onToggle={() => toggle(po.id)} onSaved={reloadMaterial} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Workspace>
  );
}

function PoGroup({ po, lines, isOpen, onToggle, onSaved }) {
  return (
    <>
      <tr className="clickable-row" style={{ cursor: "pointer" }} onClick={onToggle}>
        <td><button className="btn-icon" title={isOpen ? "ย่อ" : "ขยาย"}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
        <td className="font-mono" style={{ fontWeight: 600 }}>{po.poNumber}</td>
        <td>{po.docDate ? fmtDate(po.docDate) : "—"}</td>
        <td>{po.receivedDate ? fmtDate(po.receivedDate) : "—"}</td>
        <td>{po.dueDate ? fmtDate(po.dueDate) : "—"}</td>
        <td>{destinationLabel(po.destination) || "—"}</td>
        <td style={{ textAlign: "right" }}>{poLineCount(po)}</td>
        <td style={{ textAlign: "right", fontWeight: 600 }}>{nf(poTotalQty(po))}</td>
        <td><span className="status-pill">{PO_STATUS_LABEL[poRollupStatus(po)]}</span></td>
        <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
          <Link href={`/sahamit/po/${po.id}`} className="btn-icon" title="แก้ไข PO"><Pencil size={15} /></Link>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={10} style={{ background: "var(--panel-2)", padding: "8px 12px" }}>
            {lines.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, padding: 8 }}>ไม่มีรายการที่ต้องติดตาม (อาจถูกยกเลิกทั้งหมด)</div>
            ) : (
              <div className="premium-table-wrapper">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th style={{ textAlign: "right" }}>จำนวน</th>
                      <th>เดือนส่ง</th>
                      <th>วันรับ PO</th>
                      <th>วันส่งแนะนำ</th>
                      <th>วันกำหนด</th>
                      <th>PM</th>
                      <th>RM</th>
                      <th>ส่งจริง</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((r) => <PoLineRow key={r.poLineId} row={r} onSaved={onSaved} />)}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
