import { categoryFlags, categoryOf } from "@/lib/master/categoryOf";
import { billedTaxTotals, exciseTaxLine, resolveProductTaxable, round2 } from "@/lib/tax/exciseBilling";
import { lineUnitsTotal } from "@/lib/sales/linePacks";
import { isExciseChargeProduct } from "@/lib/excise/exciseCharge";

const normalizedKey = (value) => String(value || "").trim().toLowerCase();

/* สถานะทะเบียนของ FG หนึ่งตัวเท่าที่ใบนี้มองเห็น — เรียงตาม "ใกล้ยื่นได้ที่สุดชนะ"
   approved → pending (ยื่นแล้วรอนิติกรรม) → rejected (ต้องแก้) → draft (ร่างค้าง) → none

   ⚠️ อย่ายุบกลับเป็น boolean — "ยังไม่เคยยื่นขึ้นทะเบียน" กับ "ยื่นแล้วรอนิติกรรมตรวจ"
   คนละงานคนละคนทำ เส้นเดินงานของ SO ต้องบอกให้ตรงว่าติดอยู่ที่ใคร
   คำเดียวกับ lib/excise/recommendation.js ตั้งใจให้ตรงกัน */
/* ข้อความต่อท้ายรหัส FG ใน warning — บอก **ติดที่ใคร** ไม่ใช่แค่ว่ายังไม่ครบ */
const REGISTRATION_GAP_TEXT = {
  none: "ยังไม่ได้ขึ้นทะเบียนสรรพสามิต",
  draft: "มีร่างทะเบียนค้างอยู่ ยังไม่ได้ยื่นให้นิติกรรม",
  pending: "ยื่นขึ้นทะเบียนแล้ว รอนิติกรรมตรวจ",
  rejected: "ทะเบียนถูกตีกลับ ต้องแก้ก่อน",
};

export function registrationStateOf(regs) {
  const list = regs || [];
  if (!list.length) return "none";
  if (list.some((row) => row?.status === "approved")) return "approved";
  if (list.some((row) => row?.status === "pending_legal")) return "pending";
  if (list.some((row) => row?.status === "rejected")) return "rejected";
  return "draft";
}

export function resolveSoFiling({
  salesOrder,
  lines = [],
  products = [],
  productTypes = [],
  registrations = [],
  ownerCustomerIds = null,
} = {}) {
  const productById = new Map(products.filter((row) => row?.id).map((row) => [row.id, row]));
  const productByFg = new Map(products.filter((row) => row?.fgCode).map((row) => [normalizedKey(row.fgCode), row]));
  /* ทะเบียนของลูกค้าเจ้าของใบนี้เท่านั้น — ทะเบียนเป็นของคู่ (สินค้า × ลูกค้า)
     ⭐ มติผู้ใช้ 2026-09-07: **เลขประจำตัวผู้เสียภาษีเดียวกัน = ลูกค้าคนเดียวกัน**
     ⇒ ใบลูกค้าใบอื่นของนิติบุคคลเดียวกันนับเป็น "ของใบนี้" ด้วย · ต้องเป็นแบบนี้เพราะ
     ใบเสนอราคาหยิบ FG ข้ามใบลูกค้าได้แล้ว (ดู lib/master/customerTaxSiblings) แต่ตอน
     ขึ้นทะเบียน server บังคับ `customerId = product.customerId` เลือกเองไม่ได้ ⇒ ถ้า
     ที่นี่ยังเทียบ id ตรง ๆ ใบยื่นจะได้ `registrationId: null` แบบล้างไม่ได้
     ⚠️ ผู้เรียกต้องส่ง `ownerCustomerIds` มาเอง (ฟังก์ชันนี้ pure ไม่ยิง query) —
     ไม่ส่ง = พฤติกรรมเดิม เทียบ id ตรง ๆ */
  const ownerIds = new Set(
    (ownerCustomerIds && ownerCustomerIds.length ? ownerCustomerIds : [salesOrder?.customerId])
      .filter(Boolean),
  );
  const ownRegistration = (row) => !!row && (!salesOrder?.customerId || ownerIds.has(row.customerId));
  const approvedRegistrationByProduct = new Map(
    registrations
      .filter((row) => row?.status === "approved" && ownRegistration(row))
      .map((row) => [row.productId, row]),
  );
  /* ⭐ เก็บทะเบียน **ทุกสถานะ** ไว้ด้วย ไม่ใช่เฉพาะที่อนุมัติแล้ว (2026-08-17) —
     ของเดิมทิ้งแถวที่ยังไม่อนุมัติตั้งแต่บรรทัดนี้ ปลายทางจึงบอกได้แค่ "ไม่มีทะเบียน"
     ทั้งที่ฝ่าย RA อาจกำลังตรวจอยู่ · ตัวเลข eligible/ภาษี ไม่ขยับ เพิ่มแต่ข้อมูลอ่าน */
  const registrationsByProduct = new Map();
  for (const row of registrations) {
    if (!row?.productId || !ownRegistration(row)) continue;
    const list = registrationsByProduct.get(row.productId) || [];
    list.push(row);
    registrationsByProduct.set(row.productId, list);
  }

  const filingLines = [];
  const warnings = [];
  for (const line of lines) {
    const product = productById.get(line.productId) || productByFg.get(normalizedKey(line.fgCode));
    const fgCode = line.fgCode || product?.fgCode || "";
    /* ⛔ บรรทัด "ค่าภาษีสรรพสามิต" (04-003) ไม่ใช่ของที่ต้องเสียภาษี — เป็นตัวภาษีเอง · ปล่อยเข้าไป = ยื่นภาษีซ้อนภาษี
       (ใบค่าสรรพสามิตเป็น SO จริง · หมวดนี้ห้ามติ๊ก isExcise อยู่แล้ว ตัดที่นี่อีกชั้นเผื่อธงถูกติ๊กผิด) */
    if (isExciseChargeProduct(product || { fgCode })) continue;
    const flags = categoryFlags(categoryOf(fgCode), productTypes);
    /* 🐞 **แก้ 2026-08-16:** เดิมเขียน `!flags.isExcise || product?.isExciseTaxable === false`
       ซึ่งเอาธงของ **หมวด** เป็นตัวตั้ง ⇒ override ของฝ่าย RA ทำงานทางเดียว:
       "ยกเว้น" ได้ แต่ **"บังคับเก็บ" ไม่ได้** — สินค้าที่ RA สั่งเก็บภาษีบนหมวดที่ไม่ได้
       ติ๊ก isExcise ถูกข้ามทั้งบรรทัด ทั้งที่ product.exciseTax มีค่าอยู่จริง
       ⇒ ใบยื่นจาก SO ตกรายการที่กฎหมายสั่งให้เก็บ ขัดกับกฎที่ exciseBilling เขียนไว้เอง
       ว่า override **ชนะเสมอ**

       ⚠️ ตัดสินด้วย `product.isExciseTaxable` ซึ่งเป็น **ธงที่ resolve แล้ว** ตอนบันทึก
       สินค้า (`resolveProductTaxable` รวม override เข้าไปแล้วทั้งสองทาง) — ไม่ใช่
       `taxableOverride` ดิบ ๆ ที่แถวเก่าจำนวนมากไม่มีค่า · ไม่มีธง (แถวก่อน mig 0131)
       จึงถอยไปใช้ธงของหมวดตามเดิม */
    const productTaxable = resolveProductTaxable({
      taxableOverride: product?.isExciseTaxable,
      autoTaxable: flags.isExcise,
    });
    /* ⭐ ทะเบียนที่อนุมัติแล้ว **ตัดสินว่าเสียภาษีไหม** (ตรวจระบบ 26/10 ข้อ H2) — ฝ่าย RA ยกเว้น/บังคับรายทะเบียนได้
       (`taxableOverride` → `isExciseTaxable` ที่ resolve แล้วบนทะเบียน) · ทางสร้างใบยื่นเองฟังธงนี้อยู่แล้ว
       (exciseTaxLineForRegistration) แต่ทางนี้เคยดูแค่ธงของสินค้า ⇒ สินค้าที่ RA ยกเว้นบนทะเบียนยังถูกเก็บภาษี
       ⚠️ เฉพาะทะเบียนที่อนุมัติแล้ว — ร่าง/รอนิติกรรม/ตีกลับยังไม่ใช่คำตัดสิน ⇒ ใช้ธงของสินค้าตามเดิม */
    const approvedRegistration = product ? approvedRegistrationByProduct.get(product.id) || null : null;
    const taxable = approvedRegistration ? approvedRegistration.isExciseTaxable !== false : productTaxable;
    if (!taxable) continue;

    /* ⭐ จำนวนที่ยื่นภาษี = หน่วยรวมของบรรทัด (`lineUnitsTotal` = แพ็ค × จำนวน · mig 0407) — บรรทัด 2 แพ็ค × 12 เดือน คือของ 24 หน่วย
       ยื่น 12 = ยื่นขาดครึ่งหนึ่ง · บรรทัดที่ไม่มีเลขแพ็ค (ทุกบรรทัดก่อนงวด PR-3) ได้ `qty` ตามเดิม · จำนวนว่าง/ไม่ใช่ตัวเลข = 0 ⇒ คำเตือนเดิม
       ⚠️ ตัวโหลดสองตัว (from-sales-order · handoffQueueData) ต้อง select `packQty` คู่กับ `qty` (ด่าน linePackReaders.test.mjs) */
    const quantity = lineUnitsTotal(line);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
      warnings.push({
        code: "missing_product",
        salesOrderLineId: line.id,
        fgCode,
        message: `ไม่พบข้อมูลสินค้าหรือจำนวนของ ${fgCode || line.description || "รายการนี้"}`,
      });
      continue;
    }

    // อัตรามาจากสินค้า (= ราคาขายปลีกของ FG) และคิดด้วยตัวคิดกลางตัวเดียวกับใบยื่น
    // ที่สร้างด้วยมือ — สองทางเคยคิดคนละสูตร ดูเหตุผลเต็มที่ exciseTaxLine
    const taxLine = exciseTaxLine({
      exciseRatePerUnit: product.exciseTax,
      localTaxRatePerUnit: product.localTax,
      quantity,
    });
    /* 🔴 **ภาษีต่อชิ้น 0 บนสินค้าที่ต้องเสียภาษี = ไม่มีฐานภาษี ไม่ใช่ยกเว้น** (ตรวจระบบ 2026-10-26)
       อัตราบนสินค้าคิดจากราคาขายปลีก (productTaxRates) — ไม่มีราคา ⇒ 0 ⇒ ยื่นขาดเงียบ ๆ
       (SO อนุมัติแล้ว 22 ใบมีบรรทัดแบบนี้ · 21 ใบเป็น 0 ทั้งใบ) · ด่านราคาขายปลีกที่ "ยื่นขึ้นทะเบียน"
       ไม่ช่วย เพราะใบยื่นจาก SO ไม่บังคับทะเบียน ⇒ เตือนรายบรรทัดที่นี่ ไม่บล็อก (บล็อกต้องได้มติก่อน)
       ⚠️ ตัดสินจาก **อัตราที่ปัดแล้ว** (ตัวที่จะลงใบจริง) ไม่ใช่ราคาดิบ — ราคามีแต่อัตราค้าง 0 ก็ยื่นขาดเท่ากัน */
    const taxBaseMissing = taxLine.taxPerUnit === 0;
    const retailMissing = !(Number(product.retailPriceIncVat) > 0);
    const registration = approvedRegistration;
    const needsRegistration = !registration;
    const productRegistrations = registrationsByProduct.get(product.id) || [];
    const registrationState = registrationStateOf(productRegistrations);

    filingLines.push({
      salesOrderLineId: line.id,
      registrationId: registration?.id || null,
      // ปลายทางของลิงก์ "ไปดูทะเบียน" — ใบที่อนุมัติแล้วก่อน ไม่มีก็ใบที่ค้างอยู่
      // (null = ยังไม่เคยเปิดทะเบียนเลย ⇒ ผู้เรียกพาไปหน้าสร้างแทน)
      registrationLinkId: registration?.id || productRegistrations[0]?.id || null,
      registrationState,
      productId: product.id,
      fgCode,
      description: line.description || product.name || product.productName || fgCode,
      ...taxLine,
      needsRegistration,
      taxBaseMissing,
    });
    if (taxBaseMissing) {
      warnings.push({
        code: "missing_tax_base",
        salesOrderLineId: line.id,
        productId: product.id,
        fgCode,
        message: retailMissing
          ? `${fgCode || line.description} ยังไม่มีราคาขายปลีก (ฐานภาษี) — ภาษีคิดออกมา ฿0`
          : `${fgCode || line.description} อัตราภาษีบนสินค้าเป็น 0 ทั้งที่มีราคาขายปลีก — ตรวจทะเบียนสินค้าก่อนยื่น`,
      });
    }
    if (needsRegistration) {
      warnings.push({
        code: "registration_missing",
        salesOrderLineId: line.id,
        productId: product.id,
        fgCode,
        registrationState,
        message: `${fgCode || line.description} ${REGISTRATION_GAP_TEXT[registrationState] || REGISTRATION_GAP_TEXT.none}`,
      });
    }
  }

  const totals = filingLines.reduce((result, line) => ({
    totalExciseTax: round2(result.totalExciseTax + line.totalExciseTax),
    totalLocalTax: round2(result.totalLocalTax + line.totalLocalTax),
    totalTax: round2(result.totalTax + line.totalTax),
  }), { totalExciseTax: 0, totalLocalTax: 0, totalTax: 0 });

  return {
    eligible: salesOrder?.status === "approved" && filingLines.length > 0,
    lines: filingLines,
    warnings,
    ...totals,
    // ยอดที่เรียกเก็บจากลูกค้า = ค่าภาษี + VAT 7% (มติผู้ใช้ 2026-07-26) — สูตรเดียว
    // กับที่เอกสารพิมพ์และที่ตรึงลงใบ ห้ามให้หน้าไหนคิด VAT เองซ้ำ
    amountToCollect: billedTaxTotals(filingLines).amountToCollect,
  };
}
