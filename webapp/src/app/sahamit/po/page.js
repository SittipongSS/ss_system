"use client";
import { TableScroll } from "@/components/ui/Table";
import DetailRow from "@/components/ui/DetailRow";
import { notifyToast } from "@/components/ui/Toast";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Plus, ChevronRight, ChevronDown, Pencil, Download, Search, ArrowUp, ArrowDown, AlertCircle } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Select from "@/components/ui/Select";
import FilterPopover from "@/components/ui/FilterPopover";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { fmtDate, fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { poTotalQty, poLineCount, poRollupStatus, PO_STATUS_LABEL, lineStage, poStageRollup, STAGE_LABEL, STAGE_COLOR, effectivePoQty } from "@/lib/sahamit/po";
import { productMetaText, indexProducts } from "@/lib/sahamit/productMeta";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { destinationLabel, DESTINATIONS } from "@/components/sahamit/destinations";
import { useCan } from "@/lib/roleContext";
import Pager from "@/components/ui/Pager";
import { usePagination } from "@/lib/usePagination";
import { SortTh } from "@/lib/useSortableTable";
import { businessDate } from "@/lib/businessDate";

const nf = (n) => fmtNumber(n || 0);
// มูลค่า PO โชว์เต็ม 2 ตำแหน่ง (ไม่ย่อ) — formatter กลาง fmtMoney
const baht = (n) => fmtMoney(n);
const VAT = 1.07;
const C = { amber: "var(--amber)", blue: "var(--blue)", violet: "var(--violet)", green: "var(--green)", "text-3": "var(--text-3)" };
const today = () => businessDate();
// มูลค่าก่อน VAT ของ PO (ตัดบรรทัดยกเลิก) — ใช้เรียงมุมมองรายใบ
const poExVat = (po, priceByFg) => (po.lines || []).reduce((s, l) => {
  if (l.status === "cancelled") return s;
  const price = priceByFg.get(String(l.fgCode).trim().toLowerCase());
  return price == null ? s : s + effectivePoQty(l) * price;
}, 0);

// สถานะวัสดุ 1 ช่อง (อ่านอย่างเดียว): มาแล้ว / กำหนดถึง / —  (แก้ที่เมนูวัสดุเท่านั้น)
function matCell(dueDate, arrivedAt) {
  if (arrivedAt) return <span style={{ color: "var(--green)", fontWeight: "var(--fw-semibold)" }}>✓ มาแล้ว {fmtDate(arrivedAt)}</span>;
  if (dueDate) return <span style={{ color: "var(--text-2)" }}>กำหนด {fmtDate(dueDate)}</span>;
  return <span style={{ color: "var(--text-3)" }}>{NA}</span>;
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
    } catch (e) { notifyToast.error(e.message); }
    setBusy(false);
  };

  // viewer (ไม่มี sahamit:edit) เห็นสถานะอย่างเดียว — ซ่อนปุ่มเดินสถานะ
  let action = null;
  if (stage === "waiting_materials") action = <span style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>รอ PM/RM</span>;
  else if (canEdit && stage === "ready_produce") action = <button className="btn sm" disabled={busy} onClick={() => advance({ status: "produced" })}>ผลิตเสร็จ →</button>;
  else if (canEdit && stage === "produced") action = <button className="btn btn-primary sm" disabled={busy} onClick={() => advance({ status: "delivered", actualDeliveredDate: today() })}>ส่งแล้ว →</button>;
  else if (canEdit && stage === "delivered") action = <button className="btn sm" disabled={busy} onClick={() => advance({ status: "closed" })}>ปิดงาน →</button>;

  return (
    <tr>
      <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>
        {row.fgCode}
        <div style={{ fontSize: "var(--fs-3)", color: row.productName ? "var(--text-3)" : "var(--amber)" }}>{row.productName || "— ไม่รู้จัก —"}</div>
        {productMetaText(product) && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{productMetaText(product)}</div>}
      </td>
      <td style={{ textAlign: "right" }}>
        {nf(row.qty)}
        {casesText(row.qty, ppcOf(product)) && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{casesText(row.qty, ppcOf(product))}</div>}
      </td>
      <td>{naText(row.deliveryMonth)}</td>
      <td>{matCell(t.pmDueDate, t.pmArrivedAt)}</td>
      <td>{matCell(t.rmDueDate, t.rmArrivedAt)}</td>
      <td>
        {row.readyDate ? fmtDate(row.readyDate) : NA}
        {row.lateVsDue && <div style={{ fontSize: "var(--fs-2)", color: "var(--amber)" }}>เกินกำหนด (PO/lead)</div>}
      </td>
      <td><span className="ui-badge" style={{ color, borderColor: color }}>{STAGE_LABEL[stage]}</span></td>
      <td>
        {row.actualDeliveredDate ? fmtDate(row.actualDeliveredDate) : NA}
        {row.ourSlip && <div style={{ fontSize: "var(--fs-2)", color: "var(--red)" }}>เราส่งช้า</div>}
      </td>
      <td style={{ textAlign: "right" }}>{action}</td>
    </tr>
  );
}

export default function PoPage() {
  const { data: pos, loading, error: posError, staleError: posStale, errorDetail: posDetail, loaded: posLoaded, reload: reloadPos } = useApiList("/api/sahamit/po");
  const { data: material, loading: lMaterial, error: materialError, staleError: materialStale, errorDetail: materialDetail, loaded: materialLoaded, reload: reloadMaterial } = useApiList("/api/sahamit/material");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/sahamit/products");

  /* ── สามสายบนหน้าเดียว: สาย PO คือตัวรายการ · อีกสองสายเป็นของประกอบแถว ─────────────────────
     🐞 ทรงเดิม: สายรองสองสายแกะแค่ `data` ⇒ ล้มเมื่อไรจอวาดความไม่รู้เป็นคำตอบ
        · รายการสินค้าล้ม ⇒ คอลัมน์มูลค่าขึ้น "฿0.00 · รวม VAT ฿0.00" + "n รายการไม่มีราคา" ทุกใบ — 0 ที่มาจากความไม่รู้
        · สถานะผลิต/วัสดุล้ม ⇒ ขยายแถวแล้วขึ้น "ไม่มีรายการที่ต้องติดตาม (อาจถูกยกเลิกทั้งหมด)" และปุ่มเดินสถานะ
          (ผลิตเสร็จ / ส่งแล้ว / ปิดงาน) หายไปเงียบ ๆ
        · สาย PO ล้มพร้อมแคชอุ่น ⇒ ตารางทั้งใบหาย (`error ? null`) ทั้งที่ของรอบก่อนอยู่ในมือครบ
     ⭐ **สายไหนบล็อกอะไร** (`blocks`) — บล็อกเฉพาะชิ้นที่กินสายนั้นจริง ที่เหลือของหน้ายังอ่านได้
        · PO (`"page"`) — ไม่มีรายการในมือ = ไม่มีอะไรให้โชว์ ⇒ เนื้อเหลือป้าย และ **ห้าม** ตกไปที่ "ยังไม่มี PO"
          (อ่านว่ายังไม่เคยลง PO เลย ทั้งที่แค่โหลดไม่ขึ้น)
        · สถานะผลิต/วัสดุ (`"status"`) — ป้ายสถานะของใบถอยไปใช้สถานะส่งของจากตัว PO เอง (รอส่ง/ส่งบางส่วน/ส่งครบ —
          ข้อมูลจริงจากสาย PO ชุดเดียวกับที่ใบที่ไม่มีบรรทัดติดตามใช้อยู่แล้ว) · แถวที่ขยายบอกว่ายังดึงสถานะรายบรรทัดไม่ได้
          ⇒ ปุ่มเดินสถานะรายบรรทัดไม่ขึ้นเพราะไม่มีบรรทัดให้วาด และมีบรรทัดบอกเหตุแทนที่ (ติดด่าน = โชว์แล้วบอกเหตุ)
        · รายการสินค้า (`"value"`) — มูลค่าเป็นขีด (`NA`) ไม่ใช่ ฿0.00 และไม่ขึ้น "ไม่มีราคา" · ตารางรายบรรทัดขึ้นขีดอยู่แล้ว
          (ราคาที่หาไม่เจอเป็น null) · ชื่อสินค้าที่ใช้ค้นหาอ่านจากบรรทัด PO ได้ด้วย (ดู filteredPos) ⇒ ค้นด้วยชื่อยังเจอ
     ⚠️ ป้ายกับการบล็อกคนละคำถาม: มี `error` (หรือรอบเบื้องหลังล้ม `staleError`) = ขึ้นป้ายเสมอ · บล็อกเฉพาะตอน
        ไม่เคยโหลดสำเร็จ (`loaded`) — แคชอุ่นก็วาดแถวต่อ ป้ายบอกว่าเป็นของรอบก่อน (`staleNote`)
     🪤 `empty` = **ไม่มีของในมือ** (`!loaded`) ไม่ใช่ `!list.length` — ระบบที่ยังไม่มี PO เลยก็ตอบ `[]` สำเร็จ = "ยังไม่มี PO" จริง */
  const sources = [
    {
      label: "PO", error: posError || posStale, empty: !posLoaded, detail: posDetail, reload: reloadPos, blocks: "page",
      blockedNote: "ยังแสดงรายการ PO ไม่ได้ (ไม่ได้แปลว่ายังไม่มี PO)",
      staleNote: "รายการ PO ที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "สถานะผลิต/วัสดุ", error: materialError || materialStale, empty: !materialLoaded, detail: materialDetail, reload: reloadMaterial, blocks: "status",
      pending: lMaterial && !materialLoaded,
      blockedNote: "สถานะของแต่ละใบจึงเหลือแค่สถานะส่งของ และยังขยายดู/เดินสถานะผลิตรายบรรทัดไม่ได้",
      staleNote: "สถานะผลิต/วัสดุที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "รายการสินค้า", error: productsError || productsStale, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts, blocks: "value",
      pending: lProducts && !productsLoaded,
      blockedNote: "มูลค่า PO และราคา/ชิ้นยังคำนวณไม่ได้ จึงขึ้นเป็นขีด",
      staleNote: "ราคาที่ใช้คิดมูลค่าเป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const pageBlocked = blocked.some((s) => s.blocks === "page");
  const statusBlocked = blocked.some((s) => s.blocks === "status");
  const valueBlocked = blocked.some((s) => s.blocks === "value");
  /* ⭐ รอบแรกที่สายรองยังไม่มีของในมือ (`pending`) = ไม่รู้เท่ากับตอนล้ม ⇒ รอทุกสายก่อนวาดแถว (ท่าเดียวกับ /sahamit · /database
     ที่ skeleton รอทุกสาย) ไม่งั้นมูลค่าวาบเป็น "฿0.00 · n รายการไม่มีราคา" ก่อนรายการสินค้ามาถึง
     🪤 `!s.error` — รอบ "ลองใหม่" ของสายที่ล้มไม่นับ: error ของรอบก่อนค้างจนรอบใหม่ตอบ ⇒ ตารางที่อ่านได้อยู่ไม่หายระหว่างลอง
        (ปุ่มบอก "กำลังลองใหม่…" เอง) */
  const firstLoad = loading || sources.some((s) => s.pending && !s.error);
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — สามสายล้มพร้อมกันมักคนละเหตุ และตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  /* รายการ PO ไม่ขึ้น = พูดเรื่องนั้นเรื่องเดียว (คอลัมน์สถานะ/มูลค่าไม่ได้อยู่บนจอให้เตือน) · ไม่งั้นพูดทุกสายที่ล้ม —
     สายที่บล็อกใช้ blockedNote สายที่ยังมีแคชใช้ staleNote (ท่าเดียวกับหน้าใบยื่นชำระ tax/filings/[id]) */
  const said = pageBlocked ? blocked.filter((s) => s.blocks === "page") : failing;
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      ...new Set(said.map((s) => (s.empty ? s.blockedNote : s.staleNote))),
    ].join(" · ")} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  /* ลองสาย PO = รอบหน้าบ้าน ⇒ เนื้อเป็น Spinner ระหว่างรอ · แต่ลองสายรองไม่ได้พาเนื้อไปไหน (ตารางยังอยู่)
     ⇒ ปุ่มต้องบอกเองว่ากำลังลองอยู่ ไม่งั้นกดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ */
  const retrying = loading || lMaterial || lProducts;
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
  const [openPo, setOpenPo] = useState({});
  const [search, setSearch] = useState("");
  const [statusSel, setStatusSel] = useState([]);  // poRollupStatus keys
  const [destSel, setDestSel] = useState([]);       // destination keys
  const canEdit = useCan("sahamit:edit");
  const [view, setView] = useState("grouped"); // grouped (รายใบ) | table (รายบรรทัด)
  /* เรียงตาราง — คอมพาเรเตอร์ยังทำเองในหน้านี้ (เรียงจากค่าที่ *คำนวณ* เช่น มูลค่าก่อน VAT
     กับสถานะรวมของใบ ซึ่ง accessors ของ useSortableTable รับไม่ได้ตรง ๆ) แต่ **ทรงของ state
     ทำให้ตรงกับที่ useSortableTable คืน** = { sortKey, sortDir, sortBy } เพื่อส่งเข้า
     <SortTh> ได้ตรง ๆ ⇒ หัวตารางกดด้วยคีย์บอร์ดได้และมี aria-sort เหมือนทั้งระบบ
     (WCAG 2.1.1 Keyboard · 1.3.1 · 4.1.2) โดยไม่ต้องยกคอมพาเรเตอร์ออกไปที่ hook */
  const [sortState, setSortState] = useState({ sortKey: null, sortDir: "asc" });
  const { sortKey, sortDir } = sortState;
  const sortBy = (key) => setSortState((s) => (s.sortKey === key
    ? { sortKey: key, sortDir: s.sortDir === "asc" ? "desc" : "asc" }
    : { sortKey: key, sortDir: "asc" })); // กดหัวตาราง
  const sort = { sortKey, sortDir, sortBy };
  const pickSort = (key) => setSortState((s) => ({ sortKey: key || null, sortDir: s.sortDir })); // เลือกจาก dropdown
  const toggleDir = () => setSortState((s) => ({ ...s, sortDir: s.sortDir === "asc" ? "desc" : "asc" }));
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
        /* ชื่อสินค้ามีสองแหล่ง: ชื่อที่บันทึกไว้กับบรรทัด PO (`l.productName` — มากับสาย PO เอง) และชื่อปัจจุบันจากรายการ
           สินค้า · ต้องมีทั้งคู่ — รายการสินค้าล้มแล้วค้นด้วยชื่อเคยได้ "ไม่มี PO ตรงเงื่อนไข" (โทษคำค้น ทั้งที่ใบอยู่ครบ) */
        const hay = [
          po.poNumber,
          destinationLabel(po.destination),
          ...(po.lines || []).flatMap((l) => [l.fgCode, l.productName, prodIdx.get(String(l.fgCode).trim().toLowerCase())?.name]),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pos, q, statusSel, destSel, prodIdx]);

  const filterCount = statusSel.length + destSel.length;
  const clearFilters = () => { setStatusSel([]); setDestSel([]); };

  // แบ่งหน้ามุมมอง "รายใบ" (รีเซ็ตกลับหน้า 1 เมื่อค้น/กรองเปลี่ยน)
  // เรียงมุมมองรายใบก่อนแบ่งหน้า (sort เดียวกับปุ่ม/หัวตาราง)
  const sortedGroupedPos = useMemo(() => {
    if (!sortKey) return filteredPos;
    const s = sortDir === "asc" ? 1 : -1;
    const key = (po) => ({
      po: po.poNumber || "", doc: po.docDate || "", recv: po.receivedDate || "", due: po.dueDate || "",
      qty: poTotalQty(po), value: poExVat(po, priceByFg), status: poRollupStatus(po),
    }[sortKey]);
    return [...filteredPos].sort((a, b) => { const ka = key(a), kb = key(b); return (ka < kb ? -1 : ka > kb ? 1 : 0) * s; });
  }, [filteredPos, sortKey, sortDir, priceByFg]);
  const grouped = usePagination(sortedGroupedPos, { resetKey: `${q}|${statusSel.join(",")}|${destSel.join(",")}|${sortKey}|${sortDir}` });

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
      icon={<ShoppingCart size={22} />}
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
      {/* ⭐ กล่องแจ้งกลาง: ประโยคไทยนำ + ข้อความดิบเป็นบรรทัดรอง (มติ 23/09/2569 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
          ทุกสายของหน้าขึ้นที่ป้ายเดียวนี้ — ดูมติรายสายที่ก้อน sources */}
      {notice}

      {/* ⚠️ `pageBlocked` ต้องตัดสินก่อน "ยังไม่มี PO" — รายการที่โหลดไม่ขึ้นไม่ใช่รายการว่าง
          แคชอุ่นที่รอบใหม่ล้มไม่ถูกบล็อก (มีของในมือ) ⇒ ตารางวาดต่อ ป้ายบอกว่าเป็นของรอบก่อน
          🪤 ตารางที่ถูกซ่อนต้องมีบรรทัดแทนที่ ไม่ปล่อยป้ายลอยเหนือที่ว่าง (ท่าเดียวกับหน้าวัสดุ/กระทบยอด/FC) */}
      {firstLoad ? (
        <Spinner />
      ) : pageBlocked ? (
        <EmptyState icon={AlertCircle}>รายการ PO ยังแสดงไม่ได้ — ดูข้อความด้านบนแล้วกด “ลองใหม่”</EmptyState>
      ) : pos.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <ShoppingCart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-9)" }}>ยังไม่มี PO</div>
          <div style={{ fontSize: "var(--fs-7)", marginTop: 6 }}>เริ่มจากบันทึก PO ที่ลูกค้าส่งมา</div>
          {canEdit && (
            <Link href="/sahamit/po/new" className="btn btn-accent" style={{ marginTop: 16 }}>
              <Plus size={16} /> บันทึก PO
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search-glass" style={{ width: 240 }}>
              <Search size={18} color="var(--text-3)" />
              <input autoComplete="off" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลข PO / สินค้า / สถานที่ส่ง..." />
            </div>
            <FilterPopover
              count={filterCount}
              onClear={clearFilters}
              groups={[
                { key: "status", label: "สถานะ", options: statusOptions, selected: statusSel, onChange: setStatusSel },
                { key: "dest", label: "สถานที่ส่ง", options: destOptions, selected: destSel, onChange: setDestSel },
              ]}
            />
            {(filterCount > 0 || q) && <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>แสดง {filteredPos.length} จาก {pos.length} ใบ</span>}
            {(() => {
              const fields = view === "grouped"
                ? [["po", "เลข PO"], ["doc", "วันที่เอกสาร"], ["recv", "วันรับ PO"], ["due", "กำหนดส่ง"], ["qty", "จำนวนรวม"], ["value", "มูลค่า"], ["status", "สถานะ"]]
                : [["po", "เลข PO"], ["month", "เดือนส่ง"], ["fg", "สินค้า"], ["qty", "จำนวน"], ["value", "มูลค่า"], ["status", "สถานะ"]];
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "var(--fs-7)", color: "var(--text-3)" }}>เรียงตาม</span>
                  <Select className="premium-select" value={sortKey || ""} onChange={(e) => pickSort(e.target.value)}>
                    <option value="">— ไม่เรียง —</option>
                    {fields.map(([col, label]) => <option key={col} value={col}>{label}</option>)}
                  </Select>
                  <button type="button" className="btn-icon" title="สลับทิศเรียง (น้อย→มาก / มาก→น้อย)" disabled={!sortKey} onClick={toggleDir}>
                    {sortDir === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                  </button>
                </div>
              );
            })()}
            <div className="segmented" style={{ marginLeft: "auto" }} title="สลับมุมมอง">
              <button className={view === "grouped" ? "active" : ""} onClick={() => { setView("grouped"); setSortState({ sortKey: null, sortDir: "asc" }); }}>รายใบ</button>
              <button className={view === "table" ? "active" : ""} onClick={() => { setView("table"); setSortState({ sortKey: null, sortDir: "asc" }); }}>ตาราง</button>
            </div>
          </div>

          {view === "grouped" ? (
            <TableScroll>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <SortTh label="เลขที่ PO" sortKey="po" sort={sort} />
                    <SortTh label="วันที่เอกสาร" sortKey="doc" sort={sort} />
                    <SortTh label="วันรับ PO" sortKey="recv" sort={sort} />
                    <SortTh label="กำหนดส่ง" sortKey="due" sort={sort} />
                    <th>สถานที่ส่ง</th>
                    <th style={{ textAlign: "right" }}>รายการ</th>
                    <SortTh label="จำนวนรวม" sortKey="qty" sort={sort} style={{ textAlign: "right" }} />
                    <SortTh label="มูลค่า PO" sortKey="value" sort={sort} style={{ textAlign: "right" }} />
                    <SortTh label="สถานะ" sortKey="status" sort={sort} />
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPos.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--text-3)", padding: 28 }}>ไม่มี PO ตรงเงื่อนไข — ปรับคำค้นหรือตัวกรอง</td></tr>
                  ) : (
                    grouped.pageRows.map((po) => (
                      <PoGroup key={po.id} po={po} lines={matByPo.get(po.poNumber) || []} priceByFg={priceByFg} prodIdx={prodIdx} isOpen={!!openPo[po.id]} onToggle={() => toggle(po.id)} onSaved={reloadMaterial} canEdit={canEdit} statusBlocked={statusBlocked} valueBlocked={valueBlocked} />
                    ))
                  )}
                </tbody>
              </table>
            </TableScroll>
          ) : (
            <PoLinesTable pos={filteredPos} priceByFg={priceByFg} prodIdx={prodIdx} q={q} sort={sort} />
          )}
          {view === "grouped" && (
            <Pager page={grouped.page} pageCount={grouped.pageCount} total={grouped.total} onPage={grouped.setPage} pageSize={grouped.pageSize} onPageSize={grouped.setPageSize} />
          )}
        </>
      )}
    </Workspace>
  );
}

/* `statusBlocked` / `valueBlocked` = สายสถานะผลิต/วัสดุ · รายการสินค้า ไม่มีของในมือ (ล้มและไม่เคยโหลดสำเร็จ) — ดูมติที่ก้อน
   sources ของ PoPage: ของที่กินสายนั้นเลิกพูดเป็นคำตอบ (ขีด / บรรทัดบอกเหตุ) ส่วนที่เหลือของแถวมาจากสาย PO อ่านได้ตามปกติ */
function PoGroup({ po, lines, priceByFg, prodIdx, isOpen, onToggle, onSaved, canEdit, statusBlocked = false, valueBlocked = false }) {
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
  // ⚠️ สายวัสดุไม่มีของในมือ ⇒ `lines` ว่างทุกใบ ⇒ ตกมาที่สถานะส่งของของตัว PO (ข้อมูลจริงจากสาย PO) — ป้ายหัวจอบอกไว้แล้ว
  const hasLines = lines.length > 0;
  const poStage = hasLines ? poStageRollup(lines.map((r) => lineStage(r.status, !!r.tracking?.pmArrivedAt, !!r.tracking?.rmArrivedAt))) : null;
  const stageLabel = hasLines ? STAGE_LABEL[poStage] : PO_STATUS_LABEL[poRollupStatus(po)];
  const stageColor = hasLines ? (C[STAGE_COLOR[poStage]] || C["text-3"]) : "var(--text-3)";

  return (
    <>
      {/* กดที่แถว = เข้าหน้ารายละเอียด (ทางลัดของเมาส์); ปุ่มลูกศร = ขยายดูรายการในแถว
          ⚠️ ทางเข้าของคีย์บอร์ดคือ <Link> บนเลขที่ PO — ปุ่มขยายกับปุ่มแก้ไขในเซลล์
          เป็นคนละปลายทาง จึงยกเว้นให้แถวไม่ได้ (ดูหัวไฟล์ ui/DetailRow.js) */}
      <DetailRow href={`/sahamit/po/${po.id}`} className="clickable-row">
        <td onClick={(e) => e.stopPropagation()}><button className="btn-icon" title={isOpen ? "ย่อ" : "ขยาย"} aria-expanded={isOpen} onClick={onToggle}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
        <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>
          {/* prefetch={false}: ลิสต์ยาว — กัน RSC prefetch ต่อแถว */}
          <Link prefetch={false} href={`/sahamit/po/${po.id}`} className="linklike" title="เปิดหน้า PO">{po.poNumber}</Link>
        </td>
        <td>{po.docDate ? fmtDate(po.docDate) : NA}</td>
        <td>{po.receivedDate ? fmtDate(po.receivedDate) : NA}</td>
        <td>{po.dueDate ? fmtDate(po.dueDate) : NA}</td>
        <td>{naText(destinationLabel(po.destination))}</td>
        <td style={{ textAlign: "right" }}>{poLineCount(po)}</td>
        <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>
          {nf(fullQty)}
          {isSplit && (
            <div style={{ fontSize: "var(--fs-2)", fontWeight: "var(--fw-normal)" }}>
              <span style={{ color: "var(--green)" }}>ส่งแล้ว {nf(keptQty)}</span>{" · "}
              <span style={{ color: "var(--blue)" }}>เหลือ {nf(fullQty - keptQty)}</span>
            </div>
          )}
        </td>
        <td style={{ textAlign: "right" }}>
          {/* ไม่มีราคาในมือ = ขีด — ฿0.00 กับ "n รายการไม่มีราคา" คือคำตอบผิดที่มาจากความไม่รู้ (เหตุอยู่ที่ป้ายหัวจอ) */}
          {valueBlocked ? NA : (
            <>
              <div style={{ fontWeight: "var(--fw-semibold)" }}>{baht(exVat)}</div>
              <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>รวม VAT {baht(incVat)}</div>
              {unpriced > 0 && <div style={{ fontSize: "var(--fs-2)", color: "var(--amber)" }}>{unpriced} รายการไม่มีราคา</div>}
            </>
          )}
        </td>
        <td><span className="ui-badge" style={{ color: stageColor, borderColor: stageColor }}>{stageLabel}</span></td>
        <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
          {canEdit && <Link href={`/sahamit/po/${po.id}/edit`} className="btn-icon" title="แก้ไข PO"><Pencil size={15} /></Link>}
        </td>
      </DetailRow>
      {isOpen && (
        <tr>
          <td colSpan={11} style={{ background: "var(--panel-2)", padding: "8px 12px" }}>
            {lines.length === 0 ? (
              /* สายวัสดุไม่มีของในมือ ⇒ `lines` ว่างเพราะไม่รู้ ไม่ใช่เพราะไม่มี — "ไม่มีรายการที่ต้องติดตาม" ตรงนี้คือคำโกหก
                 และปุ่มเดินสถานะ (ผลิตเสร็จ / ส่งแล้ว / ปิดงาน) หายไปพร้อมกัน ⇒ บอกเหตุแทนที่ */
              <div style={{ color: "var(--text-3)", fontSize: "var(--fs-7)", padding: 8 }}>
                {statusBlocked
                  ? "ยังดึงสถานะผลิต/วัสดุรายบรรทัดไม่ได้ จึงยังเดินสถานะผลิต/ส่งจากตรงนี้ไม่ได้ — กดลองใหม่ที่ป้ายด้านบน"
                  : "ไม่มีรายการที่ต้องติดตาม (อาจถูกยกเลิกทั้งหมด)"}
              </div>
            ) : (
              <TableScroll>
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
              </TableScroll>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// สถานะบรรทัด PO → ป้ายภาษาไทย (รวมสองชุด stage + rollup)
const lineStatusLabel = (s) => STAGE_LABEL[s] || PO_STATUS_LABEL[s] || naText(s);
const lineStatusColor = (s) => C[STAGE_COLOR[s]] || (s === "cancelled" ? C["text-3"] : "var(--text-3)");

// มุมมอง "ตาราง (รายบรรทัด)": ทุกบรรทัดสินค้าในทุก PO = 1 แถว (สเปรดชีต) เรียง/รวมมูลค่าได้.
// ราคา/มูลค่าอ่านอย่างเดียวจากราคาผลิต master (เหมือนหน้ารายละเอียด/รายการ).
function PoLinesTable({ pos, priceByFg, prodIdx, q, sort }) {
  const { sortKey, sortDir } = sort;   // sort = { sortKey, sortDir, sortBy } ทรงเดียวกับ useSortableTable
  const rows = useMemo(() => {
    const out = [];
    for (const po of pos) {
      for (const l of po.lines || []) {
        if (q) {
          const name = prodIdx.get(String(l.fgCode).trim().toLowerCase())?.name;
          const hay = [po.poNumber, l.fgCode, l.productName, name].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) continue;
        }
        const cancelled = l.status === "cancelled";
        const price = priceByFg.get(String(l.fgCode).trim().toLowerCase());
        const value = !cancelled && price != null ? Number(l.qty || 0) * price : null;
        out.push({ po, l, price, value, cancelled });
      }
    }
    if (sortKey) {
      const s = sortDir === "asc" ? 1 : -1;
      const key = (r) => ({
        po: r.po.poNumber || "", fg: r.l.fgCode || "", qty: Number(r.l.qty || 0),
        value: Number(r.value || 0), month: r.l.deliveryMonth || "", status: r.l.status || "",
      }[sortKey]);
      out.sort((a, b) => { const ka = key(a), kb = key(b); return (ka < kb ? -1 : ka > kb ? 1 : 0) * s; });
    }
    return out;
  }, [pos, q, priceByFg, prodIdx, sortKey, sortDir]);

  const totalExVat = rows.reduce((s, r) => s + (r.value || 0), 0); // รวมทุกหน้า (ไม่ใช่เฉพาะหน้าปัจจุบัน)
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } = usePagination(rows, { resetKey: `${q}|${sortKey}|${sortDir}` });
  /* 🪤 เดิมมีคอมโพเนนต์ `Th` ประกาศ **ซ้อนอยู่ตรงนี้** — ห้ามเอากลับมา: React เห็นเป็น
     type ใหม่ทุกเรนเดอร์ ⇒ remount <th> ทั้งช่องทุกครั้งที่ state ขยับ ซึ่งแปลว่า
     **โฟกัสบนปุ่มเรียงหลุดทันทีที่กด** = คีย์บอร์ดยังใช้งานจริงไม่ได้ทั้งที่มีปุ่มแล้ว
     (ตอนเป็น <th onClick> ไม่มีใครเห็นอาการ เพราะในหัวตารางไม่มีอะไรโฟกัสได้เลย) */

  return (
    <>
    <TableScroll style={{ overflowX: "auto" }}>
      <table className="premium-table">
        <thead>
          <tr>
            <SortTh label="เลขที่ PO" sortKey="po" sort={sort} style={{ whiteSpace: "nowrap" }} />
            <SortTh label="กำหนดส่ง" sortKey="month" sort={sort} style={{ whiteSpace: "nowrap" }} />
            <SortTh label="สินค้า" sortKey="fg" sort={sort} style={{ whiteSpace: "nowrap" }} />
            <SortTh label="จำนวน" sortKey="qty" sort={sort} style={{ textAlign: "right", whiteSpace: "nowrap" }} />
            <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>ราคา/ชิ้น</th>
            <SortTh label="มูลค่า" sortKey="value" sort={sort} style={{ textAlign: "right", whiteSpace: "nowrap" }} />
            <SortTh label="สถานะ" sortKey="status" sort={sort} style={{ whiteSpace: "nowrap" }} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-3)", padding: 28 }}>ไม่มีรายการตรงเงื่อนไข — ปรับคำค้นหรือตัวกรอง</td></tr>
          ) : pageRows.map((r, i) => {
            const product = prodIdx.get(String(r.l.fgCode).trim().toLowerCase());
            return (
              /* ทางเข้าของคีย์บอร์ดคือ <Link> บนเลขที่ PO — เดิมทั้งแถวเป็น onClick
                 ที่ไม่มีอะไรโฟกัสได้เลยสักเซลล์ (WCAG 2.1.1) */
              <DetailRow key={`${r.po.id}-${r.l.id || i}`} href={`/sahamit/po/${r.po.id}`} className="clickable-row" style={{ opacity: r.cancelled ? 0.55 : 1 }}>
                <td className="font-mono" style={{ fontWeight: "var(--fw-semibold)", color: "var(--accent)", whiteSpace: "nowrap" }}>
                  {/* prefetch={false}: ลิสต์ยาว — กัน RSC prefetch ต่อแถว */}
                  <Link prefetch={false} href={`/sahamit/po/${r.po.id}`} className="linklike" title="เปิดหน้า PO">{r.po.poNumber}</Link>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {r.l.dueDate ? fmtDate(r.l.dueDate) : (r.po.dueDate ? fmtDate(r.po.dueDate) : NA)}
                  <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{naText(r.l.deliveryMonth)}</div>
                </td>
                <td>
                  <span className="font-mono" style={{ fontWeight: "var(--fw-semibold)" }}>{r.l.fgCode}</span>
                  <div style={{ fontSize: "var(--fs-3)", color: r.l.productName ? "var(--text-2)" : "var(--amber)" }}>{r.l.productName || "— ไม่รู้จัก —"}</div>
                  {productMetaText(product) && <div style={{ fontSize: "var(--fs-2)", color: "var(--text-3)" }}>{productMetaText(product)}</div>}
                </td>
                <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>
                  {nf(r.l.qty)}
                  {casesText(r.l.qty, ppcOf(product)) && <div style={{ fontSize: "var(--fs-2)", fontWeight: "var(--fw-normal)", color: "var(--text-3)" }}>{casesText(r.l.qty, ppcOf(product))}</div>}
                </td>
                <td style={{ textAlign: "right", color: r.price != null ? "var(--text-2)" : "var(--text-3)", whiteSpace: "nowrap" }}>{r.price != null ? baht(r.price) : NA}</td>
                <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)", whiteSpace: "nowrap" }}>{r.cancelled ? "ยกเลิก" : (r.value != null ? baht(r.value) : NA)}</td>
                <td><span className="ui-badge" style={{ color: lineStatusColor(r.l.status), borderColor: lineStatusColor(r.l.status) }}>{lineStatusLabel(r.l.status)}</span></td>
              </DetailRow>
            );
          })}
        </tbody>
        {totalExVat > 0 && (
          <tfoot>
            <tr>
              <td colSpan={5} style={{ textAlign: "right", color: "var(--text-2)" }}>รวมก่อน VAT</td>
              <td style={{ textAlign: "right", fontWeight: "var(--fw-semibold)" }}>{baht(totalExVat)}</td><td />
            </tr>
            <tr>
              <td colSpan={5} style={{ textAlign: "right", fontWeight: "var(--fw-bold)", borderTop: "2px solid var(--border)" }}>ยอดสุทธิ (รวม VAT)</td>
              <td style={{ textAlign: "right", fontWeight: "var(--fw-bold)", borderTop: "2px solid var(--border)" }}>{baht(totalExVat * VAT)}</td>
              <td style={{ borderTop: "2px solid var(--border)" }} />
            </tr>
          </tfoot>
        )}
      </table>
    </TableScroll>
    <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
    </>
  );
}
