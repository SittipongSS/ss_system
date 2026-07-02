"use client";
import { useMemo, useState, useEffect } from "react";
import { Boxes, AlertCircle, ChevronRight, ChevronDown, Save, Download } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// One PO line: lead-time view (read-only) + expandable PM/RM editor.
function MaterialRow({ row, onSaved }) {
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
        <td className="font-mono">{row.poNumber}</td>
        <td style={{ textAlign: "right" }}>{nf(row.qty)}</td>
        <td>{row.deliveryMonth || "—"}</td>
        <td>
          <span className="ui-badge" style={{ color: row.inForecast ? "var(--green)" : "var(--violet)", borderColor: row.inForecast ? "var(--green)" : "var(--violet)" }}>
            {row.inForecast ? "ตรง FC" : "นอก FC"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>{row.leadDays} วัน</span>
        </td>
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
          <td colSpan={12} style={{ background: "var(--panel-2)" }}>
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

export default function MaterialPage() {
  const { data: rows, loading, error, reload } = useApiList("/api/sahamit/material");

  const stats = useMemo(() => ({
    total: rows.length,
    outFc: rows.filter((r) => !r.inForecast).length,
    lateDue: rows.filter((r) => r.lateVsDue).length,
    slip: rows.filter((r) => r.ourSlip).length,
  }), [rows]);

  const Stat = ({ n, label, color }) => (
    <div className="glass-panel" style={{ padding: "12px 16px", minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--text)" }}>{n}</div>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</div>
    </div>
  );

  return (
    <Workspace
      icon={<Boxes size={22} />}
      title="วัสดุ / Lead time"
      subtitle="PM สต็อกตาม FC · RM สั่งตาม PO · วันส่งแนะนำ = วันรับ + 60/90 วันทำการ"
      back={{ href: "/sahamit", label: "งานสหมิตร" }}
      headerRight={
        <button className="btn ghost" onClick={() => window.open("/api/sahamit/export?view=material", "_blank")}>
          <Download size={16} /> Excel
        </button>
      }
    >
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? <Spinner /> : error ? null : rows.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <Boxes size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ยังไม่มีบรรทัด PO ให้ติดตาม</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>บันทึก PO ก่อน แล้วระบบจะคำนวณ lead time ให้</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <Stat n={stats.total} label="บรรทัด PO ทั้งหมด" />
            <Stat n={stats.outFc} label="นอก FC (90 วัน)" color="var(--violet)" />
            <Stat n={stats.lateDue} label="เกินกำหนด (PO/lead)" color="var(--amber)" />
            <Stat n={stats.slip} label="เราส่งช้า" color="var(--red)" />
          </div>

          <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="premium-table sticky-col1">
              <thead>
                <tr>
                  <th>สินค้า</th><th>PO</th><th style={{ textAlign: "right" }}>จำนวน</th><th>เดือนส่ง</th>
                  <th>ในแผน</th><th>วันรับ PO</th><th>วันส่งแนะนำ</th><th>วันกำหนด</th>
                  <th>PM</th><th>RM</th><th>ส่งจริง</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <MaterialRow key={r.poLineId} row={r} onSaved={reload} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Workspace>
  );
}
