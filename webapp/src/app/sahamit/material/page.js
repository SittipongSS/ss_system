"use client";
import { TableScroll } from "@/components/ui/Table";
import { notifyToast } from "@/components/ui/Toast";
import { useMemo, useState, useEffect } from "react";
import { Boxes, ChevronRight, ChevronDown, Save, Download, Search, AlertCircle } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import FilterPopover from "@/components/ui/FilterPopover";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { productMetaText, indexProducts } from "@/lib/sahamit/productMeta";
import { lineStage, STAGE_LABEL } from "@/lib/sahamit/po";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { fmtDate, fmtNumber, naText, NA } from "@/lib/format";
import { useCan } from "@/lib/roleContext";
import { businessDate } from "@/lib/businessDate";

const nf = (n) => fmtNumber(n || 0);

// สถานะวัสดุ 1 ช่อง: มาแล้ว (เขียว+วันที่) / กำหนดถึง (วันที่) / —
function matCell(dueDate, arrivedAt) {
  if (arrivedAt) return <span style={{ color: "var(--green)", fontWeight: "var(--fw-semibold)" }}>✓ มาแล้ว {fmtDate(arrivedAt)}</span>;
  if (dueDate) return <span style={{ color: "var(--text-2)" }}>กำหนด {fmtDate(dueDate)}</span>;
  return <span style={{ color: "var(--text-3)" }}>{NA}</span>;
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
      const today = businessDate();
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
    } catch (e) { notifyToast.error(e.message); }
    setBusy(false);
  };

  const t = row.tracking || {};
  return (
    <>
      <tr>
        <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>
          {row.fgCode}
          <div style={{ fontSize: "var(--fs-3)", color: row.productName ? "var(--text-3)" : "var(--amber)" }}>{row.productName || "— ไม่รู้จัก —"}</div>
          {productMetaText(product) && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{productMetaText(product)}</div>}
        </td>
        <td className="font-mono">{row.poNumber}</td>
        <td style={{ textAlign: "right" }}>
          {nf(row.qty)}
          {casesText(row.qty, ppcOf(product)) && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{casesText(row.qty, ppcOf(product))}</div>}
        </td>
        <td>{naText(row.deliveryMonth)}</td>
        <td>
          <span className="ui-badge" style={{ color: row.inForecast ? "var(--green)" : "var(--violet)", borderColor: row.inForecast ? "var(--green)" : "var(--violet)" }}>
            {row.inForecast ? "ตรง FC" : "นอก FC"}
          </span>
          <span style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", marginLeft: 4 }}>{row.leadDays} วัน</span>
        </td>
        <td>{row.receivedDate ? fmtDate(row.receivedDate) : NA}</td>
        <td>
          {row.readyDate ? fmtDate(row.readyDate) : NA}
          {row.lateVsDue && <div style={{ fontSize: "var(--fs-2)", color: "var(--amber)" }}>เกินกำหนด (PO/lead)</div>}
        </td>
        <td>{row.dueDate ? fmtDate(row.dueDate) : NA}</td>
        <td>{matCell(t.pmDueDate, t.pmArrivedAt)}</td>
        <td>{matCell(t.rmDueDate, t.rmArrivedAt)}</td>
        <td>
          {row.actualDeliveredDate ? fmtDate(row.actualDeliveredDate) : NA}
          {row.ourSlip && <div style={{ fontSize: "var(--fs-2)", color: "var(--red)" }}>เราส่งช้า</div>}
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
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-7)", paddingBottom: 6 }}>
                <input type="checkbox" checked={d.pmArrived} onChange={(e) => setD({ ...d, pmArrived: e.target.checked })} /> PM มาแล้ว
              </label>
              <div className="form-group" style={{ width: 160 }}>
                <label>RM กำหนดถึง</label>
                <DateInput style={{ height: 30 }} value={d.rmDueDate} onChange={(value) => setD({ ...d, rmDueDate: value })} />
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-7)", paddingBottom: 6 }}>
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
  const { data: rows, loading, error, staleError, errorDetail, loaded, reload } = useApiList("/api/sahamit/material");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/sahamit/products");
  const prodIdx = useMemo(() => indexProducts(products), [products]);
  const canEdit = useCan("sahamit:edit");

  /* ── โหลดพัง ≠ ไม่มีบรรทัด PO · รายการสินค้าพัง ≠ สินค้าไม่มีแบรนด์ ───────────────────────
     🐞 ของเดิมแกะ error แค่ลิสต์หลัก และทิ้ง `/api/sahamit/products` เงียบ ⇒ รายการสินค้าล้มเมื่อไร ทุกแถวเสีย
        บรรทัดแบรนด์/ปริมาตรใต้ชื่อ กับบรรทัด "N ลัง" ใต้จำนวนชิ้นพร้อมกัน โดยไม่มีอะไรบอก — อ่านได้ว่าสินค้า
        ทั้งหมดไม่ได้ตั้งแบรนด์/ชิ้นต่อลังไว้ (ทรงเดียวกับที่ซ่อน /tax ไว้ 26 วัน #1795)
     ⭐ **สายไหนบล็อกอะไร** (`blocks`)
        · `"page"` — บรรทัด PO + สถานะวัสดุ คือเนื้อทั้งหน้า (ตาราง + การ์ดนับสี่ใบ) ⇒ ไม่มีของในมือ = ซ่อนทั้งก้อน
          ไม่ใช่การ์ด "0 บรรทัด" คู่กับ "ยังไม่มีบรรทัด PO ให้ติดตาม" (0 ที่มาจากความไม่รู้)
        · `"lookup"` — รายการสินค้าเป็นของประกอบ: ชื่อสินค้า เลข PO จำนวนชิ้น วันที่ และสถานะวัสดุมาจากลิสต์หลักล้วน
          และปุ่มบันทึก PM/RM ไม่ได้อ่านรายการสินค้าเลย ⇒ ตารางอ่านต่อได้ แก้วัสดุต่อได้ · ของที่หายมีแค่บรรทัดประกอบ
          (แบรนด์/ปริมาตร · จำนวนลัง) ซึ่งป้ายบอกไว้ว่าหายเพราะอะไร
     ⚠️ **สองคำถามคนละข้อ** (กติกาเดียวกับ /tax · /sahamit) — ขึ้นป้าย = มี `error` หรือรอบเบื้องหลังล้ม
        (`staleError`) · บล็อก = error **คู่กับ** ไม่เคยโหลดสำเร็จ (`blocked`) · แคชอายุเท่าแท็บ ⇒ ตารางที่วาดจากแคช
        แล้วรอบใหม่ล้ม ต้องวาดต่อพร้อมบอกว่าเป็นของรอบก่อน (เดิม `error ? null` ซ่อนตารางที่มีอยู่ในมือทิ้ง)
     🪤 `empty` = **ไม่มีของในมือ** (`loaded` ของ useApiList) ไม่ใช่ `!rows.length` — ระบบที่ยังไม่มี PO ตอบ `200 []`
        ซึ่งต้องยังขึ้น "ยังไม่มีบรรทัด PO ให้ติดตาม" ตามจริง */
  const sources = [
    {
      label: "บรรทัด PO และสถานะวัสดุ", error: error || staleError, empty: !loaded, detail: errorDetail, reload, blocks: "page",
      blockedNote: "ตารางวัสดุ / lead time ยังแสดงไม่ได้",
    },
    {
      label: "รายการสินค้า", error: productsError || productsStale, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts, blocks: "lookup",
      blockedNote: "แบรนด์/ปริมาตรใต้ชื่อสินค้าและจำนวนลังใต้จำนวนชิ้นยังไม่แสดง (ไม่ได้แปลว่าสินค้าไม่มีข้อมูลเหล่านี้) — บรรทัด PO วันที่ และสถานะวัสดุยังใช้ได้ตามปกติ",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const pageBlocked = blocked.some((s) => s.blocks === "page");
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — สองสายล้มพร้อมกันมักคนละเหตุ และตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  /* ตารางหายทั้งก้อนแล้ว = ไม่ต้องพูดถึงบรรทัดประกอบของมัน (ประโยค "บรรทัด PO ยังใช้ได้" จะขัดกับตารางที่ถูกซ่อน)
     · ตารางยังอยู่ = บอกทีละสายว่าอะไรหาย + สายที่มีแคชอยู่เป็นของรอบก่อน */
  const impact = pageBlocked
    ? blocked.filter((s) => s.blocks === "page").map((s) => s.blockedNote)
    : [
      ...blocked.map((s) => s.blockedNote),
      blocked.length < failing.length ? "ข้อมูลที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด" : null,
    ].filter(Boolean);
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${impact.join(" · ")} · ${causes}`
    : null;
  // ⭐ ข้อความดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09/2569 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  /* ลองเฉพาะรายการสินค้า = ตารางไม่สลับเป็นสปินเนอร์ (สปินเนอร์ผูกกับลิสต์หลักเท่านั้น) ⇒ ปุ่มต้องบอกเองว่ากำลังลอง
     ไม่งั้นกดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ */
  const retrying = loading || lProducts;
  const notice = loadError ? (
    <StatusNotice
      tone="error"
      className="mb-4"
      detail={loadErrorDetail}
      action={(
        <Button size="sm" variant="ghost" onClick={() => failing.forEach((s) => s.reload())} disabled={retrying}>
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่"}
        </Button>
      )}
    >
      {loadError}
    </StatusNotice>
  ) : null;

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
      <div style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-bold)", color: color || "var(--text)" }}>{n}</div>
      <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>{label}</div>
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
      {/* ⭐ ป้ายเดียวคลุมทุกสาย ขึ้นทั้งตอนตารางถูกซ่อนและตอนตารางยังวาดจากแคช (ของรอบก่อน) */}
      {notice}

      {/* 🪤 ตารางที่ถูกซ่อนต้องมีบรรทัดแทนที่ ไม่ปล่อยป้ายลอยเหนือที่ว่าง · และห้ามตก "ยังไม่มีบรรทัด PO ให้ติดตาม"
          (ดึงไม่ได้ ≠ ไม่มีบรรทัด) */}
      {loading ? <Spinner /> : pageBlocked ? (
        <EmptyState icon={AlertCircle}>ตารางวัสดุยังแสดงไม่ได้ — ดูข้อความด้านบนแล้วกด “ลองใหม่”</EmptyState>
      ) : rows.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <Boxes size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ยังไม่มีบรรทัด PO ให้ติดตาม</div>
          <div style={{ fontSize: "var(--fs-7)", marginTop: 6 }}>บันทึก PO ก่อน แล้วระบบจะคำนวณ lead time ให้</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <Stat n={stats.total} label="บรรทัด PO ทั้งหมด" />
            <Stat n={stats.outFc} label="นอก FC (90 วัน)" color="var(--violet)" />
            <Stat n={stats.lateDue} label="เกินกำหนด (PO/lead)" color="var(--amber)" />
            <Stat n={stats.slip} label="เราส่งช้า" color="var(--red)" />
          </div>

          <div className="toolbar">
            <div className="search-glass" style={{ width: 240 }}>
              <Search size={18} color="var(--text-3)" />
              <input autoComplete="off" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัส / ชื่อสินค้า / เลข PO..." />
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
            {(filterCount > 0 || q) && <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>แสดง {filteredRows.length} จาก {rows.length} บรรทัด</span>}
          </div>

          <TableScroll style={{ overflowX: "auto" }}>
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
          </TableScroll>
        </>
      )}
    </Workspace>
  );
}
