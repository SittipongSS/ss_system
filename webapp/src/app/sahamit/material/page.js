"use client";
import { useMemo, useState, useEffect } from "react";
import { Boxes, AlertCircle, ChevronRight, ChevronDown, Save, Download, Search } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import FilterPopover from "@/components/ui/FilterPopover";
import { useApiList } from "@/lib/excise/useApiList";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { productMetaText, indexProducts } from "@/lib/sahamit/productMeta";
import { lineStage, STAGE_LABEL } from "@/lib/sahamit/po";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { fmtDate } from "@/lib/format";
import { useCan } from "@/lib/roleContext";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// สถานะวัสดุ 1 ช่อง: มาแล้ว (เขียว+วันที่) / กำหนดถึง (วันที่) / —
function matCell(dueDate, arrivedAt) {
  if (arrivedAt) return <span style={{ color: "var(--green)", fontWeight: 600 }}>✓ มาแล้ว {fmtDate(arrivedAt)}</span>;
  if (dueDate) return <span style={{ color: "var(--text-2)" }}>กำหนด {fmtDate(dueDate)}</span>;
  return <span style={{ color: "var(--text-3)" }}>—</span>;
}

// One PO line: lead-time view (read-only) + PM/RM editor (กำหนดถึง + ปุ่มมาแล้ว).
// นี่คือ "ที่เดียว" ที่แก้วันวัสดุได้ (หน้า POs โชว์อย่างเดียว).
function MaterialRow({ row, product, onSaved, canEdit }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({});
  useEffect(() => {
    const t = row.tracking || {};
    setD({
      pmDueDate: t.pmDueDate || "", pmArrived: !!t.pmArrivedAt,
      rmDueDate: t.rmDueDate || "", rmArrived: !!t.rmArrivedAt, note: t.note || "",
    });
  }, [row]);

  const save = async () => {
    setBusy(true);
    try {
      const t = row.tracking || {};
      const today = new Date().toISOString().slice(0, 10);
      const body = {
        pmDueDate: d.pmDueDate || null,
        rmDueDate: d.rmDueDate || null,
        pmArrivedAt: d.pmArrived ? (t.pmArrivedAt || today) : null,
        rmArrivedAt: d.rmArrived ? (t.rmArrivedAt || today) : null,
        note: d.note,
      };
      await sahamitFetch(`/api/sahamit/material/${row.poLineId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
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
          {productMetaText(product) && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{productMetaText(product)}</div>}
        </td>
        <td className="font-mono">{row.poNumber}</td>
        <td style={{ textAlign: "right" }}>
          {nf(row.qty)}
          {casesText(row.qty, ppcOf(product)) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesText(row.qty, ppcOf(product))}</div>}
        </td>
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
        <td>{matCell(t.pmDueDate, t.pmArrivedAt)}</td>
        <td>{matCell(t.rmDueDate, t.rmArrivedAt)}</td>
        <td>
          {row.actualDeliveredDate ? fmtDate(row.actualDeliveredDate) : "—"}
          {row.ourSlip && <div style={{ fontSize: 10.5, color: "var(--red)" }}>เราส่งช้า</div>}
        </td>
        <td>{canEdit && <button className="btn-icon" onClick={() => setOpen((v) => !v)} title="แก้สถานะวัสดุ">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={12} style={{ background: "var(--panel-2)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", padding: "6px 2px" }}>
              <div className="form-group" style={{ width: 160 }}>
                <label>PM กำหนดถึง</label>
                <DateInput style={{ height: 30 }} value={d.pmDueDate} onChange={(value) => setD({ ...d, pmDueDate: value })} />
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 6 }}>
                <input type="checkbox" checked={d.pmArrived} onChange={(e) => setD({ ...d, pmArrived: e.target.checked })} /> PM มาแล้ว
              </label>
              <div className="form-group" style={{ width: 160 }}>
                <label>RM กำหนดถึง</label>
                <DateInput style={{ height: 30 }} value={d.rmDueDate} onChange={(value) => setD({ ...d, rmDueDate: value })} />
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 6 }}>
                <input type="checkbox" checked={d.rmArrived} onChange={(e) => setD({ ...d, rmArrived: e.target.checked })} /> RM มาแล้ว
              </label>
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

// stage ปัจจุบันของบรรทัดวัสดุ (auto จาก PM/RM + สถานะที่กดเดิน)
const rowStage = (r) => lineStage(r.status, !!r.tracking?.pmArrivedAt, !!r.tracking?.rmArrivedAt);

export default function MaterialPage() {
  const { data: rows, loading, error, reload } = useApiList("/api/sahamit/material");
  const { data: products } = useApiList("/api/sahamit/products");
  const prodIdx = useMemo(() => indexProducts(products), [products]);
  const canEdit = useCan("sahamit:edit");

  const [search, setSearch] = useState("");
  const [fcSel, setFcSel] = useState([]);     // "in" | "out"
  const [stageSel, setStageSel] = useState([]); // stage keys
  const [issueSel, setIssueSel] = useState([]); // "late" | "slip"
  const q = search.trim().toLowerCase();

  // ตัวเลือกสถานะ = เฉพาะ stage ที่มีจริงในข้อมูล (เรียงตามลำดับ label)
  const stageOptions = useMemo(() => {
    const present = new Set(rows.map(rowStage));
    return Object.keys(STAGE_LABEL).filter((k) => present.has(k)).map((k) => ({ value: k, label: STAGE_LABEL[k] }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!q && !fcSel.length && !stageSel.length && !issueSel.length) return rows;
    return rows.filter((r) => {
      if (q && !String(r.fgCode).toLowerCase().includes(q)
        && !String(r.productName || "").toLowerCase().includes(q)
        && !String(r.poNumber || "").toLowerCase().includes(q)) return false;
      if (fcSel.length && !fcSel.includes(r.inForecast ? "in" : "out")) return false;
      if (stageSel.length && !stageSel.includes(rowStage(r))) return false;
      if (issueSel.length) {
        const hit = (issueSel.includes("late") && r.lateVsDue) || (issueSel.includes("slip") && r.ourSlip);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, q, fcSel, stageSel, issueSel]);

  const filterCount = fcSel.length + stageSel.length + issueSel.length;
  const clearFilters = () => { setFcSel([]); setStageSel([]); setIssueSel([]); };

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

          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 240 }}>
              <Search size={18} color="var(--text-3)" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัส / ชื่อสินค้า / เลข PO..." />
            </div>
            <FilterPopover
              count={filterCount}
              onClear={clearFilters}
              groups={[
                { key: "fc", label: "ในแผน (FC)", options: [{ value: "in", label: "ตรง FC" }, { value: "out", label: "นอก FC" }], selected: fcSel, onChange: setFcSel },
                { key: "stage", label: "สถานะ", options: stageOptions, selected: stageSel, onChange: setStageSel },
                { key: "issue", label: "ปัญหา", options: [{ value: "late", label: "เกินกำหนด (PO/lead)" }, { value: "slip", label: "เราส่งช้า" }], selected: issueSel, onChange: setIssueSel },
              ]}
            />
            {(filterCount > 0 || q) && <span style={{ fontSize: 12, color: "var(--text-3)" }}>แสดง {filteredRows.length} จาก {rows.length} บรรทัด</span>}
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
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={12} style={{ textAlign: "center", color: "var(--text-3)", padding: 28 }}>ไม่มีบรรทัดตรงเงื่อนไข — ปรับคำค้นหรือตัวกรอง</td></tr>
                ) : (
                  filteredRows.map((r) => <MaterialRow key={r.poLineId} row={r} product={prodIdx.get(String(r.fgCode).trim().toLowerCase())} onSaved={reload} canEdit={canEdit} />)
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Workspace>
  );
}
