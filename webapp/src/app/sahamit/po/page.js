"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, AlertCircle, ChevronRight, ChevronDown, Pencil, Download, Search } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import FilterPopover from "@/components/ui/FilterPopover";
import { useApiList } from "@/lib/excise/useApiList";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { fmtDate, fmtMoneyCompact } from "@/lib/format";
import { poTotalQty, poLineCount, poRollupStatus, PO_STATUS_LABEL, lineStage, poStageRollup, STAGE_LABEL, STAGE_COLOR, effectivePoQty } from "@/lib/sahamit/po";
import { productMetaText, indexProducts } from "@/lib/sahamit/productMeta";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { destinationLabel, DESTINATIONS } from "@/components/sahamit/destinations";
import { useCan } from "@/lib/roleContext";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");
const baht = (n) => fmtMoneyCompact(n);
const VAT = 1.07;
const C = { amber: "var(--amber)", blue: "var(--blue)", violet: "var(--violet)", green: "var(--green)", "text-3": "var(--text-3)" };
const today = () => new Date().toISOString().slice(0, 10);

// สถานะวัสดุ 1 ช่อง (อ่านอย่างเดียว): มาแล้ว / กำหนดถึง / —  (แก้ที่เมนูวัสดุเท่านั้น)
function matCell(dueDate, arrivedAt) {
  if (arrivedAt) return <span style={{ color: "var(--green)", fontWeight: 600 }}>✓ มาแล้ว {fmtDate(arrivedAt)}</span>;
  if (dueDate) return <span style={{ color: "var(--text-2)" }}>กำหนด {fmtDate(dueDate)}</span>;
  return <span style={{ color: "var(--text-3)" }}>—</span>;
}

// บรรทัดสินค้าใน PO: โชว์วัสดุ (read-only) + สถานะ auto + ปุ่มเดินสถานะ (ผลิต/ส่ง/ปิด).
// `row` = แถวจาก /api/sahamit/material (มี status + tracking).
function PoLineRow({ row, product, onSaved, canEdit }) {
  const [busy, setBusy] = useState(false);
  const t = row.tracking || {};
  const stage = lineStage(row.status, !!t.pmArrivedAt, !!t.rmArrivedAt);
  const color = C[STAGE_COLOR[stage]] || C["text-3"];

  const advance = async (patch) => {
    setBusy(true);
    try {
      await sahamitFetch(`/api/sahamit/po/lines/${row.poLineId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      onSaved?.();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  // viewer (ไม่มี sahamit:edit) เห็นสถานะอย่างเดียว — ซ่อนปุ่มเดินสถานะ
  let action = null;
  if (stage === "waiting_materials") action = <span style={{ fontSize: 11, color: "var(--text-3)" }}>รอ PM/RM</span>;
  else if (canEdit && stage === "ready_produce") action = <button className="btn sm" disabled={busy} onClick={() => advance({ status: "produced" })}>ผลิตเสร็จ →</button>;
  else if (canEdit && stage === "produced") action = <button className="btn btn-primary sm" disabled={busy} onClick={() => advance({ status: "delivered", actualDeliveredDate: today() })}>ส่งแล้ว →</button>;
  else if (canEdit && stage === "delivered") action = <button className="btn sm" disabled={busy} onClick={() => advance({ status: "closed" })}>ปิดงาน →</button>;

  return (
    <tr>
      <td className="font-mono" style={{ fontWeight: 600 }}>
        {row.fgCode}
        <div style={{ fontSize: 11, color: row.productName ? "var(--text-3)" : "var(--amber)" }}>{row.productName || "— ไม่รู้จัก —"}</div>
        {productMetaText(product) && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{productMetaText(product)}</div>}
      </td>
      <td style={{ textAlign: "right" }}>
        {nf(row.qty)}
        {casesText(row.qty, ppcOf(product)) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesText(row.qty, ppcOf(product))}</div>}
      </td>
      <td>{row.deliveryMonth || "—"}</td>
      <td>{matCell(t.pmDueDate, t.pmArrivedAt)}</td>
      <td>{matCell(t.rmDueDate, t.rmArrivedAt)}</td>
      <td>
        {row.readyDate ? fmtDate(row.readyDate) : "—"}
        {row.lateVsDue && <div style={{ fontSize: 10.5, color: "var(--amber)" }}>เกินกำหนด (PO/lead)</div>}
      </td>
      <td><span className="ui-badge" style={{ color, borderColor: color }}>{STAGE_LABEL[stage]}</span></td>
      <td>
        {row.actualDeliveredDate ? fmtDate(row.actualDeliveredDate) : "—"}
        {row.ourSlip && <div style={{ fontSize: 10.5, color: "var(--red)" }}>เราส่งช้า</div>}
      </td>
      <td style={{ textAlign: "right" }}>{action}</td>
    </tr>
  );
}

export default function PoPage() {
  const { data: pos, loading, error } = useApiList("/api/sahamit/po");
  const { data: material, reload: reloadMaterial } = useApiList("/api/sahamit/material");
  const { data: products } = useApiList("/api/sahamit/products");
  const [openPo, setOpenPo] = useState({});
  const [search, setSearch] = useState("");
  const [statusSel, setStatusSel] = useState([]);  // poRollupStatus keys
  const [destSel, setDestSel] = useState([]);       // destination keys
  const canEdit = useCan("sahamit:edit");
  const q = search.trim().toLowerCase();

  // ราคาผลิต (costPrice, ก่อน VAT) ต่อ fgCode — สำหรับยอดรวมมูลค่า PO
  const priceByFg = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p.price == null ? null : Number(p.price));
    return m;
  }, [products]);
  const prodIdx = useMemo(() => indexProducts(products), [products]);

  // ตัวเลือกตัวกรอง (สถานะ/สถานที่ส่ง) จำกัดเฉพาะที่มีจริงใน PO ปัจจุบัน
  const statusOptions = useMemo(() => {
    const present = new Set(pos.map(poRollupStatus));
    return Object.keys(PO_STATUS_LABEL).filter((k) => present.has(k)).map((k) => ({ value: k, label: PO_STATUS_LABEL[k] }));
  }, [pos]);
  const destOptions = useMemo(() => {
    const present = new Set(pos.map((p) => p.destination).filter(Boolean));
    return DESTINATIONS.filter((d) => present.has(d.key)).map((d) => ({ value: d.key, label: d.label }));
  }, [pos]);

  // PO ที่ผ่านคำค้น + ตัวกรอง. คำค้นครอบคลุม เลข PO, สถานที่ส่ง, และรหัส/ชื่อสินค้าในบรรทัด
  const filteredPos = useMemo(() => {
    if (!q && !statusSel.length && !destSel.length) return pos;
    return pos.filter((po) => {
      if (statusSel.length && !statusSel.includes(poRollupStatus(po))) return false;
      if (destSel.length && !destSel.includes(po.destination)) return false;
      if (q) {
        const hay = [
          po.poNumber,
          destinationLabel(po.destination),
          ...(po.lines || []).flatMap((l) => [l.fgCode, prodIdx.get(String(l.fgCode).trim().toLowerCase())?.name]),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pos, q, statusSel, destSel, prodIdx]);

  const filterCount = statusSel.length + destSel.length;
  const clearFilters = () => { setStatusSel([]); setDestSel([]); };

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
      subtitle="ติดตาม PO รายใบ · ขยายดูรายการ + สถานะผลิต/ส่ง (แก้วัสดุที่เมนู วัสดุ/Lead time)"
      headerRight={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={() => window.open("/api/sahamit/export?view=po", "_blank")}>
            <Download size={16} /> Excel
          </button>
          {canEdit && (
            <Link href="/sahamit/po/new" className="btn btn-accent">
              <Plus size={16} /> บันทึก PO
            </Link>
          )}
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
          {canEdit && (
            <Link href="/sahamit/po/new" className="btn btn-accent" style={{ marginTop: 16 }}>
              <Plus size={16} /> บันทึก PO
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 240 }}>
              <Search size={18} color="var(--text-3)" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลข PO / สินค้า / สถานที่ส่ง..." />
            </div>
            <FilterPopover
              count={filterCount}
              onClear={clearFilters}
              groups={[
                { key: "status", label: "สถานะ", options: statusOptions, selected: statusSel, onChange: setStatusSel },
                { key: "dest", label: "สถานที่ส่ง", options: destOptions, selected: destSel, onChange: setDestSel },
              ]}
            />
            {(filterCount > 0 || q) && <span style={{ fontSize: 12, color: "var(--text-3)" }}>แสดง {filteredPos.length} จาก {pos.length} ใบ</span>}
          </div>

          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>เลขที่ PO</th>
                  <th>วันที่เอกสาร</th>
                  <th>วันรับ PO</th>
                  <th>กำหนดส่ง</th>
                  <th>สถานที่ส่ง</th>
                  <th style={{ textAlign: "right" }}>รายการ</th>
                  <th style={{ textAlign: "right" }}>จำนวนรวม</th>
                  <th style={{ textAlign: "right" }}>มูลค่า PO</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredPos.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--text-3)", padding: 28 }}>ไม่มี PO ตรงเงื่อนไข — ปรับคำค้นหรือตัวกรอง</td></tr>
                ) : (
                  filteredPos.map((po) => (
                    <PoGroup key={po.id} po={po} lines={matByPo.get(po.poNumber) || []} priceByFg={priceByFg} prodIdx={prodIdx} isOpen={!!openPo[po.id]} onToggle={() => toggle(po.id)} onSaved={reloadMaterial} canEdit={canEdit} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Workspace>
  );
}

function PoGroup({ po, lines, priceByFg, prodIdx, isOpen, onToggle, onSaved, canEdit }) {
  let unpriced = 0;
  const exVat = (po.lines || []).reduce((s, l) => {
    if (l.status === "cancelled") return s;
    const price = priceByFg.get(String(l.fgCode).trim().toLowerCase()) ?? null;
    if (price == null) { if (Number(l.qty) > 0) unpriced += 1; return s; }
    return s + effectivePoQty(l) * price; // แบ่งส่ง: มูลค่านับยอดส่งจริง (ยอดเหลืออยู่ PO ใหม่)
  }, 0);
  const incVat = exVat * VAT;

  // แบ่งส่ง: เต็ม vs คงบน PO นี้ (ส่งจริง) vs ย้ายไป PO ยอดเหลือ
  const fullQty = poTotalQty(po);
  const keptQty = (po.lines || []).reduce((s, l) => s + effectivePoQty(l), 0);
  const isSplit = (po.lines || []).some((l) => l.shippedQty != null);

  // สถานะหัว PO: รวมจากบรรทัด (ผ่านวัสดุ); ถ้าไม่มีบรรทัด active → สถานะเดิม
  const hasLines = lines.length > 0;
  const poStage = hasLines ? poStageRollup(lines.map((r) => lineStage(r.status, !!r.tracking?.pmArrivedAt, !!r.tracking?.rmArrivedAt))) : null;
  const stageLabel = hasLines ? STAGE_LABEL[poStage] : PO_STATUS_LABEL[poRollupStatus(po)];
  const stageColor = hasLines ? (C[STAGE_COLOR[poStage]] || C["text-3"]) : "var(--text-3)";

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
        <td style={{ textAlign: "right", fontWeight: 600 }}>
          {nf(fullQty)}
          {isSplit && (
            <div style={{ fontSize: 10.5, fontWeight: 400 }}>
              <span style={{ color: "var(--green)" }}>ส่งแล้ว {nf(keptQty)}</span>{" · "}
              <span style={{ color: "var(--blue)" }}>เหลือ {nf(fullQty - keptQty)}</span>
            </div>
          )}
        </td>
        <td style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 600 }}>{baht(exVat)}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>รวม VAT {baht(incVat)}</div>
          {unpriced > 0 && <div style={{ fontSize: 10.5, color: "var(--amber)" }}>{unpriced} รายการไม่มีราคา</div>}
        </td>
        <td><span className="ui-badge" style={{ color: stageColor, borderColor: stageColor }}>{stageLabel}</span></td>
        <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
          <Link href={`/sahamit/po/${po.id}`} className="btn-icon" title="แก้ไข PO"><Pencil size={15} /></Link>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={11} style={{ background: "var(--panel-2)", padding: "8px 12px" }}>
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
                      <th>PM</th>
                      <th>RM</th>
                      <th>วันส่งแนะนำ</th>
                      <th>สถานะ</th>
                      <th>ส่งจริง</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((r) => <PoLineRow key={r.poLineId} row={r} product={prodIdx.get(String(r.fgCode).trim().toLowerCase())} onSaved={onSaved} canEdit={canEdit} />)}
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
