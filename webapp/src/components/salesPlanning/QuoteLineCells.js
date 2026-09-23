"use client";
// ── ตารางรายการแบบใบเสนอราคา: กล่อง · หัวคอลัมน์ · เซลล์ — **ชุดเดียว** ที่สองฟอร์มวาด ─────────────
//
// ⭐ มติเจ้าของ 23/09: "3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควรแตกต่างจาก form ใบเสนอราคา
//   เพื่อไม่ให้ USER สับสน" ⇒ ตารางรายการของใบเสนอราคา (`QuotationLineItems`) กับบรรทัดโซนของ
//   ใบสั่งขายย้อนหลัง (`historicalWizard/WizardZonesStep`) เรียกคอมโพเนนต์ในไฟล์นี้ทั้งคู่ —
//   หัวคอลัมน์ ป้าย ลำดับ ช่องกรอก ตัวล็อกราคา/หน่วย และสูตรเงิน (`quoteLineNet`) มาจากที่เดียว
//   ⇒ แก้ฝั่งหนึ่ง = อีกฝั่งเปลี่ยนตาม ไม่มีทางเพี้ยนกันเงียบ ๆ (บทเรียน AGENTS.md "ฟอร์มแก้ = ฟอร์มสร้าง")
// 🐞 ก่อนมตินี้ ขั้น ② ของใบย้อนหลังถาม "แพ็ค" + "ยอด" ที่พิมพ์เอง + ปุ่มลัดราคา × แพ็ค × เดือน ⇒ ผู้คีย์
//   คีย์ 1 ชุด × 12 เดือน ได้สามแบบ (1 × 42,000 · 12 × 3,500 · ปุ่มเสนอ 504,000) ทั้งที่ในใบเสนอราคา
//   มันคือ จำนวน 12 (แพ็คเกจ) × ราคา/หน่วย 3,500 = 42,000 แบบเดียว
//
// ⚠️ ของที่ใบย้อนหลังมีเพิ่มสองอย่าง (โซนที่ผูก · รอบบริการที่ขายไว้) เป็น **บรรทัดใต้คำอธิบายในเซลล์ "รายการ"**
//   (`QuoteLineInstallationPoint` · `QuoteLineServiceRounds`) — ตรงเดียวกับที่ตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย
//   โชว์ "ไซต์ · โซน" กับ "รอบบริการที่ขายไว้" ⇒ คอลัมน์ของสองฟอร์มเท่ากันเป๊ะ: # · รายการ · จำนวน · ราคา/หน่วย ·
//   ส่วนลดรายการ · จำนวนเงิน · ปุ่มลบ (UAT 23/09: ของเดิมเอาคอลัมน์ "โซน" มาแทน "#" แล้วซ้อนตารางไว้ในการ์ดไซต์
//   ⇒ กล่องแคบกว่า 900 ทุกจอเดสก์ท็อป ตารางพับเป็นการ์ดตลอด — หน้าตาคนละแบบกับใบเสนอราคา)
// ⚠️ สไตล์เป็นของ `QuotationLineItems.module.css` (โฟลเดอร์เดียวกัน) — ผู้เรียกที่อยู่คนละโฟลเดอร์
//   **ห้าม import ชีตนั้นเอง** (audit:ui ด่าน crossDirectory) ⇒ ใช้กล่อง/เซลล์ของไฟล์นี้แทนทุกชิ้น
import Link from "next/link";
import { Trash2 } from "lucide-react";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import ReadableText from "@/components/ui/ReadableText";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import { TableScroll } from "@/components/ui/Table";
import { productOwnerTag } from "@/components/master/productOption";
import { fmtMoney, naText, NA } from "@/lib/format";
import { productIdentity } from "@/lib/master/productIdentity";
import { DEFAULT_SALE_UNIT, SALE_UNITS, unitOptions } from "@/lib/master/units";
import { quoteLineNet } from "@/lib/salesPlanning";
import { masterPriceDrift, masterPriceState, quoteLineLocks } from "@/lib/sales/quoteLines";
import styles from "./QuotationLineItems.module.css";

/* พื้นความกว้างของตาราง — คอลัมน์ตายตัวรวมกัน 646 (36+120+130+210+150) ที่เหลือเป็นของ "รายการ"
   (เหตุผลของเลข 900 อยู่ที่ `.linesTable` ใน QuotationLineItems.module.css)
   ⚠️ เลขเดียวกับจุดพับเป็นการ์ด `@container (max-width: 900px)` — กล่องที่แคบกว่านี้ = การ์ดต่อบรรทัด */
export const QUOTE_LINES_MIN_WIDTH = 900;

/**
 * กล่องของตาราง — `TableScroll` + `<table>` พร้อมคลาสของตารางรายการ (คอลัมน์ล็อก · แคบกว่าพื้น = การ์ด)
 * @param minWidth พื้นความกว้าง — ผู้เรียกที่มีคอลัมน์หน้าแถวกว้างกว่า "#" บวกส่วนต่างเอง
 *
 * ⚠️ คลาสการ์ดเก่าอยู่บนกล่องเลื่อนเอง ไม่ใช่ div ที่ห่ออีกชั้น (2026-09-07)
 *   🐞 เดิมเป็น div คลาส premium-glass-table ห่อกล่องเลื่อนอีกชั้น
 *   ⇒ วัดจริงที่ /sales-planning/quotations/new (1440): กรอบมนซ้อนกันสามชั้น
 *   ขอบสีเดียวกัน มุมมน 13px เท่ากัน ห่างกันชั้นละ 17px
 *     การ์ดหัวข้อ  ซ้าย 28  กว้าง 1026
 *     กรอบเก่า     ซ้าย 47  กว้าง  988   ← ชั้นนี้ไม่ได้ทำอะไรที่กล่องเลื่อนไม่ทำ
 *     กล่องตาราง   ซ้าย 64  กว้าง  954
 *   ⚠️ ยุบทิ้งเฉย ๆ ไม่ได้ — ตารางนี้ไม่ใช่ `.premium-table` เซลล์กับหัวตาราง
 *   กินสไตล์จาก `.premium-glass-table thead th/tbody td` ⇒ ต้อง **ย้ายคลาสลงมา**
 *   ไม่ใช่ลบ (นับใน uiLegacyBudget เท่าเดิม ไม่ใช่เพิ่ม) · ยาม: tableBoxWidth.test.mjs
 * ⚠️ cells="stacked": เซลล์รายการซ้อนหลายบรรทัด (SKU+ชื่อ+หมายเหตุ / ช่อง+หน่วย)
 *   — ค่าตั้งต้น middle ทำคอนโทรลแต่ละคอลัมน์ลอยคนละระดับ (กฎ 5)
 * ⚠️ พื้นความกว้างต้องส่งผ่าน prop `minWidth` ไม่ใช่ min-width ในคลาส — `.scroll table` ของ
 *   Table.module.css อ่าน --table-min-width ด้วย specificity ที่สูงกว่าคลาสของหน้า
 * ⚠️ container=inline-size (`.linesContainer`) ให้กฎ "แคบกว่า 900 = การ์ด" วัดจากความกว้างที่ตารางมีจริง
 *   ไม่ใช่ความกว้างจอ (คอลัมน์เอกสารแคบกว่าจอเสมอ และแคบไม่เท่ากันตามว่ามีแถบข้างหรือไม่)
 */
export function QuoteLinesTable({ minWidth = QUOTE_LINES_MIN_WIDTH, children }) {
  return (
    <TableScroll surface="embedded" family="editable" cells="stacked" minWidth={minWidth} className={`premium-glass-table table-responsive ${styles.linesContainer}`}>
      <table className={`w-full text-sm ${styles.linesTable}`}>{children}</table>
    </TableScroll>
  );
}

/** หัว "#" ของคอลัมน์ลำดับ (36px — ส่วนหนึ่งของพื้น 900) */
export function QuoteLineIndexHead() {
  return <th className={`${styles.rowNumber} ${styles.colIndex}`}>#</th>;
}

/** เลขลำดับของบรรทัด (โหมดการ์ดเติม "รายการที่ " ให้เอง — ดู `.rowNumber::before`) */
export function QuoteLineIndexCell({ index }) {
  return <td className={styles.rowNumber}>{index + 1}</td>;
}

/** หัวของช่องปุ่มลบท้ายแถว (40px) — ว่างโดยเจตนา เหมือนหัวตารางใบเสนอราคาเดิม */
export function QuoteLineActionsHead() {
  return <th className={styles.colActions}></th>;
}

/**
 * ปุ่มลบบรรทัดท้ายแถว (ถังขยะ) — ป้ายโปรแกรมอ่านหน้าจอ = "ลบ" + ชื่อบรรทัด ("ลบรายการ 1" · "ลบรายการของโซน A")
 * @param disabled/title ปุ่มที่ลบไม่ได้ต้องบอกเหตุใน title (กฎบ้าน: ติดด่าน = โชว์แล้วบอกเหตุ)
 */
export function QuoteLineRemoveCell({ name, onRemove, disabled = false, title }) {
  return (
    <td className={styles.rowActions}>
      <button type="button" className="btn-icon danger" onClick={onRemove} disabled={disabled} title={title || undefined} aria-label={`ลบ${name}`}>
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </td>
  );
}

/** แถวว่างของตาราง (ยังไม่มีรายการ) — กินทุกคอลัมน์ */
export function QuoteLinesEmptyRow({ colSpan, children }) {
  return <tr><td colSpan={colSpan} className={styles.emptyRows}>{children}</td></tr>;
}

/** หัวคอลัมน์ห้าช่องของบรรทัด (ไม่รวม "#" และช่องปุ่มลบ — `QuoteLineIndexHead` · `QuoteLineActionsHead`) */
export function QuoteLineHeadCells() {
  return (
    <>
      <th>รายการ</th>
      {/* หัวคอลัมน์ตัวเลขชิดขวาให้ตรงกับตัวเลขในช่องกรอก (numeric-input ชิดขวา) */}
      <th className={`${styles.numHeader} ${styles.colQty}`}>จำนวน</th>
      <th className={`${styles.numHeader} ${styles.colPrice}`}>ราคา/หน่วย</th>
      <th className={styles.colDiscount}>ส่วนลดรายการ</th>
      {/* 150px รับยอดรายบรรทัดถึงหลักสิบล้าน (จำนวนหลักพัน × ราคาหลักหมื่น) ไม่ล้นช่อง */}
      <th className={`num ${styles.colAmount}`}>จำนวนเงิน</th>
    </>
  );
}

/** เซลล์ "รายการ" — ช่องเลือกสินค้า · ข้อมูล FG · ของใต้คำอธิบาย ซ้อนเป็นคอลัมน์เดียว (ผู้เรียกส่งลูกเอง) */
export function QuoteLineItemCell({ children }) {
  return (
    <td>
      <div className={styles.lineDescriptionCell}>{children}</div>
    </td>
  );
}

/**
 * ช่องเลือกสินค้าของบรรทัด — มาตรฐาน dropdown สินค้าทั้งระบบ (`productSelectOptions` · entity="product")
 * @param options ตัวเลือกที่ผู้เรียกกรองแล้ว (ใบย้อนหลัง = แพ็คเกจบริการหมวด 02-001 เท่านั้น)
 * @param rest    `placeholder` · `searchPlaceholder` · `emptyText` · `disabled` ของช่องนั้น ๆ
 */
export function QuoteLineProductPicker({ value, options, onChange, name, placeholder = "เลือก FG / สินค้า...", ...rest }) {
  return (
    <SearchableSelect
      entity="product"
      size="sm"
      className="w-full"
      value={value || ""}
      onChange={onChange}
      ariaLabel={`เลือกสินค้า ${name}`}
      placeholder={placeholder}
      options={options}
      {...rest}
    />
  );
}

/**
 * บรรทัด FG 2 บรรทัด (มติผู้ใช้ 2026-07-19): รหัส · แบรนด์ · หมวด / ชื่อสินค้า · ปริมาตร
 * — บรรทัดเดียวยาวโดนตัด … แล้วชื่อ/ปริมาตรหาย. ดึงสดจากฐานข้อมูลสินค้า;
 * สินค้าหายจาก master → โชว์ค่าที่ snapshot ไว้ในใบ (description เดิม)
 * @param product สินค้าตัวสดจากลิสต์ของผู้เรียก (`null` = ไม่เจอในลิสต์ / ไม่มีลิสต์)
 */
export function QuoteLineFgInfo({ line, product = null, editable = true }) {
  const identity = productIdentity(product || line);
  /* เจ้าของ FG เมื่อไม่ใช่ใบลูกค้าใบนี้ (นิติบุคคลเดียวกัน คนละสาขา/คนละรหัส AR)
     อ่านจากลิสต์สดก่อน แล้วค่อยตกไปที่ snapshot ที่ server ประทับไว้กับบรรทัด —
     บรรทัดในโหมดอ่านและใบสั่งขายไม่มีลิสต์สินค้าให้ค้น เหลือแต่ snapshot
     🪤 ตัวตัดสินคือ **เจอสินค้าในลิสต์สดไหม** ไม่ใช่ "ป้ายว่างไหม" — ป้ายว่างแปลได้
     สองอย่าง (ลิสต์บอกว่าเป็นของใบนี้เอง / ไม่มีลิสต์ให้ถาม) ถ้าใช้ `||` สองกรณีนี้
     ยุบเป็นอันเดียว แล้วบรรทัดที่เพิ่งสลับ FG กลับมาเป็นของใบตัวเองจะยังโชว์ป้าย
     เจ้าของเก่าค้างอยู่ (metadata เดิมถูกส่งต่อมาจนกว่า server จะล้างตอนบันทึก) */
  const owner = product ? productOwnerTag(product) : (line.metadata?.fgOwnerArCode
    ? [line.metadata.fgOwnerArCode, line.metadata.fgOwnerBranchCode
      ? `สาขา ${line.metadata.fgOwnerBranchCode}` : ""].filter(Boolean).join(" · ")
    : "");
  return (
    <div className={styles.fgInfo} title="ข้อมูลจากฐานข้อมูลสินค้า — แก้ที่ฐานข้อมูลสินค้า">
      <span className={styles.fgInfoMeta}><strong>{identity.code || "FG"}</strong>{identity.brand && <> · {identity.brand}</>}{identity.category && <> · {identity.category}</>}</span>
      <div className={styles.fgInfoName}>
        {editable ? (naText(identity.detail)) : <ReadableText text={identity.detail} lines={3} />}
      </div>
      {owner && (
        <span className={styles.fgInfoOwner}>FG ของ {owner}</span>
      )}
    </div>
  );
}

/* tooltip ของช่องราคาที่ปิดอยู่ — บอกว่าราคามาจากไหน และต้องทำอะไรถึงจะมีราคา */
const priceTitle = (bound, registryPriceOnly) => {
  if (bound) return "ราคาจากฐานข้อมูลสินค้า — แก้ราคาต้องแก้ที่ฐานข้อมูล";
  return registryPriceOnly ? "ราคาจากฐานข้อมูลสินค้า — เลือกสินค้าก่อน ราคาจะเติมเอง" : undefined;
};

/**
 * บรรทัด "ไซต์ · โซน" ใต้คำอธิบาย — ตัวเดียวกันทั้งตารางฝั่งอ่าน (ขั้น ④ · หน้าใบสั่งขาย) และบรรทัดโซน
 * ของฟอร์มคีย์ใบย้อนหลัง (มติเจ้าของ 23/09: บรรทัดไม่ต่างจากใบเสนอราคา · โซนที่ผูกเป็นของเพิ่มใต้คำอธิบาย)
 * @param point ชื่อจุด '<รหัสไซต์> <ชื่อไซต์> · <ชื่อโซน>' (`historicalZonePoint`) · ไม่มี = ไม่วาด
 * @param note  เหตุที่ยังอ่านชื่อจุดไม่ได้ (ทะเบียนยังโหลดไม่ครบ ฯลฯ) — ขึ้นแทนชื่อ
 */
export function QuoteLineInstallationPoint({ point, note = null }) {
  if (!point && !note) return null;
  return (
    <span className={styles.serviceRoundsTag}>
      ไซต์ · โซน: <strong>{point || note}</strong>
    </span>
  );
}

/**
 * กล่องสรุปท้ายตาราง (ฝั่งอ่าน) — กล่องเดียวกับท้ายตารางใบเสนอราคา: แถวยอด · เส้นคู่ · ยอดรวมทั้งสิ้น
 * ใช้ทั้งตารางฝั่งอ่าน (`QuotationReadOnlyLineItems`) และท้ายบรรทัดโซนของฟอร์มคีย์ใบย้อนหลัง
 * @param rows `[{ id, label, value }]` — value ว่าง = ขีด
 * @param children แถวเน้นต่อท้าย (ยอดสามกองของหน้าใบสั่งขาย)
 */
export function QuoteLineTotals({ rows = [], grandTotal, grandTotalLabel = "ยอดรวมทั้งสิ้น", children = null }) {
  return (
    <div className={styles.totalsWrap}>
      <div className={styles.totalsPanel}>
        {rows.map((row, index) => (
          <div key={row.id || row.label || index} className={styles.totalLine}>
            <span>{row.label}</span>
            <strong className="mono">{naText(row.value)}</strong>
          </div>
        ))}
        {grandTotal !== undefined && grandTotal !== null ? (
          <div className={styles.totalGrand}>
            <strong>{grandTotalLabel}</strong>
            <strong className="mono">{grandTotal}</strong>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

// ส่วนลด % เกิน 100 ไม่มีความหมาย — server clamp อยู่แล้ว (normalizeDiscountValue)
// แต่ถ้าปล่อยให้พิมพ์ 150 ค้างบนจอ ตัวเลขที่เห็นจะไม่ตรงกับยอดที่คำนวณให้ทันที
export const clampQuoteDiscount = (type, value) =>
  (type === "percent" && Number(value) > 100 ? 100 : value);

/**
 * สี่เซลล์เงินของบรรทัด: จำนวน (+หน่วย) · ราคา/หน่วย · ส่วนลดรายการ · จำนวนเงิน
 * @param line     บรรทัด `{ productId, fgCode, _lineKind, qty, unit, unitPrice, discountType, discountValue }`
 * @param product  สินค้าตัวสดของบรรทัด (ตัดสิน "ยังไม่ตั้งราคา" และ "ราคาในทะเบียนขยับ")
 * @param onPatch  `(patch) => void` — แพตช์ของบรรทัดนี้บรรทัดเดียว
 * @param name     ชื่อบรรทัดในป้ายของโปรแกรมอ่านหน้าจอ ("รายการ 1" · "รายการของโซน A")
 * @param driftNote ประโยคท้ายคำเตือนราคาขยับ — **ชื่อปุ่มที่ทำให้ราคาเปลี่ยนจริง** ของฟอร์มนั้น
 * @param amountPending ยังไม่มียอดให้พูด (ใบย้อนหลัง: จำนวนว่าง/ยังไม่เลือกแพ็คเกจ) ⇒ ขีด ไม่ใช่ 0.00
 *   ⚠️ สูตรไม่เปลี่ยน — ใบเสนอราคานับจำนวนว่างเป็น 1 (quoteLineNet) แต่ใบย้อนหลังตีกลับจำนวนว่าง (มติ 23/09)
 *      ⇒ ต่างกันแค่ "พูดยอดหรือยัง" ไม่ใช่ต่างกันที่วิธีคิด
 * @param registryPriceOnly ราคา/หน่วยมาจากทะเบียน **เท่านั้น** ⇒ ช่องราคาปิดตั้งแต่ยังไม่เลือกสินค้า
 *   (ใบย้อนหลัง · รีวิว 23/09) — ใบเสนอราคาเปิดช่องให้พิมพ์ได้ก่อนเลือก (บรรทัดที่ไม่ผูกสินค้าใช้ราคาที่พิมพ์)
 *   แต่ใบย้อนหลังไม่ส่งราคาขึ้นไปเลย ⇒ เปิดไว้ = ช่องที่พิมพ์แล้วหายเงียบ (เช่นพิมพ์ 42,000 เป็นราคา/หน่วย)
 * @param qtyNote   เหตุที่จำนวนนี้ใช้ไม่ได้ ใต้ช่องจำนวน (ใบย้อนหลัง: ไม่ใช่จำนวนเต็ม > 0) — ไม่ส่ง = ไม่มีบรรทัดนี้
 */
export function QuoteLineMoneyCells({
  line, product = null, editable = true, onPatch, name, driftNote = "กดบันทึกเพื่ออัปเดต",
  amountPending = false, registryPriceOnly = false, qtyNote = null,
}) {
  const { bound, unitLocked, priceLocked } = quoteLineLocks(line, { registryPriceOnly });
  const priceDrift = editable ? masterPriceDrift(product, line) : null;
  return (
    <>
      <td data-label="จำนวน">
        <MoneyInput min="0" value={line.qty} disabled={!editable} onChange={(value) => onPatch?.({ qty: value ?? "" })} aria-label={`จำนวน ${name}`} aria-invalid={qtyNote ? "true" : undefined} />
        {/* บรรทัดที่ผูกสินค้า: หน่วยล็อกตามฐานข้อมูลสินค้า (เหมือนราคา — มติ 2026-07-23)
            บรรทัดที่พิมพ์เอง (ค่าบริการ ฯลฯ) ไม่มี master ให้ผูก จึงเลือกเองได้
            นับ _lineKind ด้วย เพราะแถวสินค้าที่ยังไม่ได้เลือกสินค้ายังไม่มี productId —
            ถ้าไม่นับ จะให้เลือกหน่วยแล้วโดน master ทับทิ้งตอนเลือกสินค้า */}
        {unitLocked || !editable
          ? (line.unit && <span className={styles.unitNote}>หน่วย: {line.unit}</span>)
          : (
            <Select
              className="premium-select"
              value={line.unit || DEFAULT_SALE_UNIT}
              onChange={(event) => onPatch?.({ unit: event.target.value })}
              aria-label={`หน่วย ${name}`}
            >
              {unitOptions(SALE_UNITS, line.unit).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          )}
        {qtyNote ? <span className={styles.qtyNote}>{qtyNote}</span> : null}
      </td>
      <td data-label="ราคา/หน่วย">
        <MoneyInput min="0" value={line.unitPrice} disabled={!editable || priceLocked} title={priceTitle(bound, registryPriceOnly)} onChange={(value) => onPatch?.({ unitPrice: value ?? "" })} aria-label={`ราคาต่อหน่วย ${name}`} />
        {/* เตือนเฉพาะตอนรู้แน่ว่า master ยังไม่ตั้งราคา (ห้ามกรอกราคาในใบ) — กรณีปกติ
            ไม่ต้องมีคำอธิบายกำกับ ช่องถูกล็อกอยู่แล้วและมี tooltip บอกที่มา
            สินค้าที่ไม่อยู่ในลิสต์ (รออนุมัติ/พักใช้) = ไม่รู้ราคา ไม่ใช่ไม่มีราคา — ดู masterPriceState */}
        {editable && line.productId && masterPriceState(product) === "unpriced" && (
          <Link prefetch={false} href={`/database/products/${line.productId}`} target="_blank" className={styles.unpricedLink}>
            ยังไม่ตั้งราคาในฐานข้อมูล — ไปตั้งราคา →
          </Link>
        )}
        {/* ราคาในทะเบียนสินค้าถูกแก้หลังบรรทัดนี้ถูกเติมราคา — บอกตัวเลขที่จะได้ และบอกว่าต้องกดอะไร
            ถึงจะเปลี่ยน (ห้ามเปลี่ยนให้เองบนจอ: ยอดรวมทั้งใบคิดที่ server ⇒ แถวกับยอดจะไม่ตรงกันจนกว่าจะกด) */}
        {priceDrift !== null && (
          <span className={styles.priceHint}>
            ราคาในฐานข้อมูลตอนนี้ {fmtMoney(priceDrift)} — {driftNote}
          </span>
        )}
      </td>
      <td data-label="ส่วนลดรายการ">
        <div className={styles.discountControls}>
          <Select className="premium-select" value={line.discountType || ""} disabled={!editable} aria-label={`ชนิดส่วนลด ${name}`} onChange={(event) => onPatch?.({ discountType: event.target.value || null, discountValue: event.target.value ? line.discountValue : 0 })}>
            <option value="">ไม่ลด</option>
            <option value="percent">%</option>
            <option value="amount">บาท</option>
          </Select>
          <MoneyInput min="0" value={line.discountValue || ""} disabled={!editable || !line.discountType} onChange={(value) => onPatch?.({ discountValue: clampQuoteDiscount(line.discountType, value) ?? "" })} aria-label={`ส่วนลด ${name}`} />
        </div>
      </td>
      <td className={`num mono ${styles.lineAmount}`} data-label="จำนวนเงิน">{amountPending ? NA : fmtMoney(quoteLineNet(line).lineTotal)}</td>
    </>
  );
}

/**
 * ช่อง "รอบบริการที่ขายไว้" ของบรรทัดแพ็คเกจบริการ — ช่องเดียวกับการ์ดสัญญาบริการของใบสั่งขาย
 * (`ServiceContractCard`: จำนวนเต็ม ≥ 1 · เว้นว่างได้ · ต่อท้ายด้วย "รอบ") วางใต้คำอธิบายของบรรทัด
 * ตรงที่ตารางฝั่งอ่านโชว์ "รอบบริการที่ขายไว้: N รอบ"
 * ⚠️ เป็นของ **ใบสั่งขาย** ที่เดียว (มติผู้ใช้ 2026-08-31) — ใบเสนอราคาไม่เรียกตัวนี้
 */
export function QuoteLineServiceRounds({ value, onChange, disabled = false, name, note = null }) {
  return (
    <div className={styles.serviceRounds}>
      <span>รอบบริการที่ขายไว้</span>
      <span className={styles.roundsField}>
        <Input
          type="number" min="1" step="1" inputMode="numeric" placeholder="—" autoComplete="off"
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.value)}
          aria-label={`รอบบริการที่ขายไว้ ${name}`}
        />
        <span className={styles.roundsUnit}>รอบ</span>
      </span>
      {note ? <small>{note}</small> : null}
    </div>
  );
}
