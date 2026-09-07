/* ── แตกยอด FC ของดีลออกเป็นบรรทัด (หมวด · ปริมาตร · จำนวน) ─────────────────
 *
 * ใช้กับรายงาน Excel "FC รายหมวด" ที่ฝ่ายวางแผนผลิต/จัดซื้อเอาไปดูว่าเดือนไหนต้อง
 * เตรียมกำลังการผลิตหรือวัตถุดิบเท่าไร ⇒ **ยอดรวมของทุกบรรทัดต้องเท่ากับ FC ที่
 * แดชบอร์ดโชว์เป๊ะ ๆ** ไม่งั้นสองจอบอกคนละเรื่องแล้วไม่มีใครรู้ว่าอันไหนถูก
 *
 * ที่มาของบรรทัดขึ้นกับที่มาของ FC (mig 0337) — สองเส้น ไม่ใช่เส้นเดียว:
 *   forecastSource='quotation' → บรรทัดของ **ใบที่ FC เดินตาม** join ทะเบียนสินค้า
 *                                 เพื่อได้หมวด+ปริมาตร (มติผู้ใช้ 2026-09-02)
 *   forecastSource='manual'    → แถวมูลค่ารายหมวดที่ AE กรอกเอง (mig 0264/0265)
 *                                 ซึ่งมีหมวด/ปริมาตรครบอยู่แล้ว
 *
 * ⚠️ ดีลที่ยังไม่มีทั้งสองอย่างก็ยังต้องมีตัวตนในรายงาน — คืนบรรทัดเดียวกอง
 *    "ไม่ระบุหมวด" ที่ถือยอด FC ทั้งก้อน · ถ้าตัดทิ้ง ยอดรวมของไฟล์จะน้อยกว่า
 *    แดชบอร์ดโดยไม่มีอะไรบอก ซึ่งเป็นความผิดพลาดชนิดที่หาไม่เจอ
 */

import { isSuperuser } from '@/lib/permissions';

export const UNCATEGORIZED = 'ไม่ระบุหมวด';

/* ── ใครโหลดไฟล์นี้ได้ (มติผู้ใช้ 2026-09-02) ─────────────────────────────────
 *
 *   admin · ae_supervisor  → ทั้งบริษัท
 *   senior_ae              → **เฉพาะทีมตัวเอง**
 *
 * ⭐ **ขอบเขตข้อมูลไม่ได้อยู่ที่นี่** — route กรองรายแถวด้วย `inSalesViewScope` ซึ่งให้
 *    `senior_ae` เป็น scope `'team'` อยู่แล้ว ⇒ เปิดสิทธิ์ตรงนี้ = เขาได้ไฟล์ของทีม
 *    ตัวเองโดยอัตโนมัติ **ห้ามเขียนตัวกรองทีมซ้ำที่รายงาน** จะกลายเป็นกติกาสองชุด
 *    ที่เพี้ยนหากันวันไหนก็ได้
 * ⚠️ **แคบกว่า `salesplan:view` มาก** — ไฟล์มียอด FC เป็นแถว ๆ พร้อมชื่อลูกค้าและ
 *    ราคาต่อหน่วย · `ae`/`ac` ที่บนจอเห็นดีลของตัวเอง/ทีม ยังไม่ได้ไฟล์ เพราะ
 *    "ดูตัวเลขบนจอ" กับ "โหลดรายการออกไป" เป็นคนละสิทธิ์ (บทเรียนจาก
 *    `canExportLeadReport` ที่แม้แต่ ae_supervisor ก็ยังโหลดไม่ได้)
 * ⚠️ ไฟล์ของ senior_ae **ต้องประทับบนหัวว่าเป็นของทีมไหน** ไม่งั้นถูกส่งต่อแล้วอ่าน
 *    เป็นยอดทั้งบริษัท (ดู `scopeLabel` ใน forecastReportWorkbook)
 */
export const canExportForecastReport = (role) => isSuperuser(role) || role === 'senior_ae';

/* ── เดือนของดีลบนรายงานนี้ = เดือนที่ลูกค้าจะรับของ ─────────────────────────
 *
 * ⭐ กติกาอยู่ **ในลิบที่มีเทสต์** ไม่ใช่ในตัว route — นี่คือข้อเดียวที่ผู้ใช้ขอจริง ๆ
 *    ถ้าปล่อยไว้ในเส้น API มันจะถูกแก้กลับวันไหนก็ได้โดยไม่มีอะไรฟ้อง
 *
 * ลำดับที่มา (ตัวแรกที่มีค่าชนะ):
 *   endDate               "วันที่สิ้นสุด" = วันที่ลูกค้าต้องการรับ — ตัวจริง
 *   metadata.demandMonth  🐞 **สายสหมิตรเก็บเดือนที่ลูกค้าต้องการของไว้ตรงนี้อยู่แล้ว**
 *                         (create-sales-deal เขียนจาก `line.month`) แต่ไม่เคยเขียน
 *                         `endDate` และตั้ง `expectedCloseDate` = สิ้นเดือนที่คาดได้ PO
 *                         ⇒ ถ้าไม่อ่านช่องนี้ ดีลสหมิตรลงเดือนผิดทั้งกอง · วัดของจริง
 *                         2026-09-02: 39 ดีล 9,202,345 บาท ผิดทุกใบ (32 ใบเร็วไป 2 เดือน)
 *   expectedCloseDate     วันปิดการขาย — เดาแทนเมื่อไม่มีอะไรดีกว่านี้
 *   forecastMonth         ค่าที่ระบบคำนวณจากวันปิด (ตาข่ายชั้นสุดท้าย)
 *
 * ⚠️ คืน `basis` มาด้วยเสมอ เพื่อให้ไฟล์ติดป้ายได้ว่าแถวไหนเป็นเดือนที่ **เดา** —
 *    ผู้อ่านคือฝ่ายวางแผนผลิต ถ้าไม่บอก เขาจะเชื่อว่าทุกแถวคือเดือนส่งของจริง
 */
export const MONTH_BASIS = ['endDate', 'demandMonth', 'expectedCloseDate', 'forecastMonth'];

/* ── เดือนที่ "รู้จริง" กับกอง "ยังไม่ระบุเดือน" (มติผู้ใช้ 2026-09-07) ────────
 *
 * ⭐ **เฉพาะ `endDate`/`demandMonth` เท่านั้นที่นับว่ารู้เดือนรับของจริง** — ที่เหลือ
 *    คือถอยมาจากวันปิดการขาย ซึ่งเป็นคนละคำถาม ⇒ ยอดพวกนั้น **ห้ามลงช่องเดือน**
 *    ไปกองที่คอลัมน์ "ยังไม่ระบุเดือน" ท้ายกริดแทน · ของจริง 2026-09-07: 29 ดีล
 *    12,824,400 บาท ที่เคยถูกเดาเดือนให้แบบเงียบ ๆ จนฝ่ายวางแผนอ่านเป็นเดือนส่งจริง
 * ⚠️ **ยอดยังอยู่ในไฟล์เสมอ** ไม่ใช่ตัดทิ้ง — ยอดรวมทั้งไฟล์จึงไม่เปลี่ยน เปลี่ยนแค่
 *    ว่ามันไปนั่งช่องไหน · แถวที่ไม่มี `monthBasis` เลย (ผู้เรียกเก่า/เทสต์) ถือว่ารู้เดือน
 */
export const SCHEDULED_BASIS = ['endDate', 'demandMonth'];
export const isScheduledBasis = (basis) => !basis || SCHEDULED_BASIS.includes(basis);
export const isScheduledRow = (row) => isScheduledBasis(row?.monthBasis) && !!row?.month;

export function forecastMonthOfDeal(deal, monthKey) {
  const sources = [
    ['endDate', deal?.endDate],
    ['demandMonth', deal?.metadata?.demandMonth],
    ['expectedCloseDate', deal?.expectedCloseDate],
    ['forecastMonth', deal?.forecastMonth],
  ];
  for (const [basis, value] of sources) {
    const month = monthKey(value);
    if (month) return { month, basis };
  }
  return { month: null, basis: null };
}

/* ── หมวดจากรหัส FG (มติผู้ใช้ 2026-09-07: "ถ้ามีใบเสนอราคา ก็ดึงหมวดมาจากหมวดของ FG") ──
 *
 * ⭐ **รหัส FG อุ้มหมวดไว้ในตัวมันเอง** — `FG-336-01-009-1290` ⇒ หมวด `01-009`
 *    (ท่อนที่ 3 กับ 4) · วัดของจริง 2026-09-07: สินค้าทั้ง 440 รายการในทะเบียน
 *    หมวดตรงกับท่อน 3-4 ของรหัสตัวเอง **ทุกใบ ไม่มีข้อยกเว้น**
 * ⭐ **ต้องอ่านจากข้อความในบรรทัดด้วย** — คนพิมพ์รหัสลงช่องรายละเอียดกันเยอะ
 *    (47 บรรทัด 3,427,770 บาท ในใบที่มีสิทธิ์วันนี้) มักเป็นรูปสั้น `FG-321-03-002`
 *    ที่ไม่มีท้าย ⇒ หาในทะเบียนไม่เจอ แต่ตัวรหัสบอกหมวดได้อยู่ดี
 * ⚠️ **ไม่ใช่การเดา** — นี่คือการอ่านรหัสจริงที่คนกรอกไว้ ต่างจากการยืมหมวดของดีล
 *    มาแปะ (ซึ่งผู้ใช้ปฏิเสธ 2026-09-07: "ต้องอ้างอิงหมวดจริง หลายหมวดก็ต้องหลายหมวด")
 */
const FG_CODE = /FG-\d{3}-\d{2}-\d{3}(?:-\d+)?/i;

export const normalizeFgCode = (value) => {
  const text = String(value || '').replace(/\s+/g, '').toUpperCase();
  return FG_CODE.test(text) && text.startsWith('FG-') ? text : null;
};

/** รหัส FG ตัวแรกที่ฝังอยู่ในข้อความ (ช่องรายละเอียดที่พิมพ์เอง) */
export function fgCodeInText(text) {
  const found = String(text || '').replace(/\s+/g, '').toUpperCase().match(FG_CODE);
  return found ? found[0] : null;
}

/** หมวดที่รหัส FG ชี้ไป — `FG-336-01-009-1290` → `01-009` · รูปที่ไม่ใช่ FG → null */
export function fgCategoryCode(fgCode) {
  const code = normalizeFgCode(fgCode) || fgCodeInText(fgCode);
  if (!code) return null;
  const parts = code.split('-');
  const category = `${parts[2]}-${parts[3]}`;
  return /^\d{2}-\d{3}$/.test(category) ? category : null;
}

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ปัดเงินสองตำแหน่ง — ใช้ตอนปันส่วนเท่านั้น
   (กติกาเดียวกับ dealValueItems: ปัดรายบรรทัดก่อนบวก ยอดรวมจึงเท่ากับที่ตาเห็น) */
const money = (value) => Math.round(num(value) * 100) / 100;

/* ⭐ ปันส่วน FC ลงบรรทัด — **หัวใจของความถูกต้องทั้งไฟล์**
 *
 * ยอดรวมบรรทัดใบเสนอราคา (`lineTotal`) = ยอดก่อนหักส่วนลดท้ายใบ ส่วน FC = ยอดหลัง
 * หักส่วนลด ก่อน VAT ⇒ **สองตัวนี้ไม่เท่ากันเมื่อใบมีส่วนลด** (ของจริง 2026-09-02:
 * 27 ใบจาก 195 ใบ เช่น QT-26080032-1 บรรทัดรวม 843,000 แต่ FC 756,600)
 * ถ้าเอา lineTotal ดิบ ๆ ไปรวมเป็นรายงาน ยอดจะเกินจริงและไม่ตรงแดชบอร์ด
 *
 * ⚠️ **เศษต้องลงบรรทัดสุดท้าย** ไม่ใช่ปล่อยหาย — ปัดทีละบรรทัดแล้วบวกจะขาด/เกิน
 *    ไม่กี่สตางค์ต่อดีล ซึ่งพอคูณ 200 ดีลกลายเป็นยอดที่อธิบายไม่ได้บนหัวรายงาน
 */
export function allocateToLines(lines, total) {
  const rows = lines.filter(Boolean);
  if (!rows.length) return [];
  const target = money(total);
  const base = rows.reduce((sum, row) => sum + Math.max(0, num(row.amount)), 0);
  // ไม่มีฐานให้ปันส่วน (ทุกบรรทัดเป็น 0) → หารเท่ากัน ดีกว่าโยนยอดทั้งก้อนลงบรรทัดแรก
  const shares = rows.map((row) => (base > 0
    ? money(target * (Math.max(0, num(row.amount)) / base))
    : money(target / rows.length)));
  const drift = money(target - shares.reduce((sum, value) => sum + value, 0));
  if (drift !== 0) shares[shares.length - 1] = money(shares[shares.length - 1] + drift);
  return rows.map((row, index) => ({ ...row, fcAmount: shares[index] }));
}

/* บรรทัดจากใบเสนอราคา — หมวด/ปริมาตรมาจากทะเบียนสินค้า
 *
 * ⭐ **บันไดหาหมวดสามขั้น** (มติผู้ใช้ 2026-09-07) — ตกขั้นแรกแล้วยังไปต่อได้:
 *      1. `productId` → ทะเบียนสินค้า (ได้ครบทั้งหมวด ปริมาตร หน่วย)
 *      2. `fgCode` บนบรรทัด → ทะเบียนสินค้าด้วยรหัส FG
 *      3. รหัส FG ที่ **พิมพ์อยู่ในช่องรายละเอียด** → ทะเบียน · ถ้าไม่มีในทะเบียน
 *         ก็ยังอ่านหมวดจากตัวรหัสได้ (ท่อน 3-4 — ดู `fgCategoryCode`)
 * ⚠️ ขั้น 2-3 ให้ **หมวดอย่างเดียว ไม่ให้ปริมาตร** เมื่อรหัสไม่มีในทะเบียน — ฝ่ายผลิต
 *    ต้องอ่านออกว่าแถวนี้รู้แค่หมวด ⇒ คืน `categoryFrom` มาให้ไฟล์ติดป้าย
 * ⚠️ ที่เหลือคือข้อความล้วนจริง ๆ ("PERFUME LOTION" 30,000 ชิ้น) — ยังลงกอง
 *    "ไม่ระบุหมวด" · **ห้ามยืมหมวดของดีลมาแปะ** เพราะดีลใบเดียวมีได้หลายหมวด
 *    (มติผู้ใช้ 2026-09-07: "ต้องอ้างอิงหมวดจริง หลายหมวดก็ต้องหลายหมวด") */
function quotationLineRows(lines, productById, productByFg = new Map()) {
  return [...(lines || [])]
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
    .map((line) => {
      const byId = line.productId ? productById.get(line.productId) : null;
      const ownFg = normalizeFgCode(line.fgCode);
      const textFg = ownFg ? null : fgCodeInText(line.description);
      const product = byId
        || (ownFg ? productByFg.get(ownFg) : null)
        || (textFg ? productByFg.get(textFg) : null)
        || null;
      const fgCode = line.fgCode || product?.fgCode || textFg || null;
      const categoryCode = product?.categoryCode || fgCategoryCode(fgCode);
      const categoryFrom = !categoryCode ? null
        : (byId && byId.categoryCode) ? 'product'
          : product ? 'fg-registry'
            : (ownFg ? 'fg-code' : 'fg-text');
      return {
        categoryCode: categoryCode || null,
        categoryFrom,
        fgCode,
        description: line.description || product?.productDescription || null,
        qty: num(line.qty),
        unit: line.unit || product?.saleUnit || null,
        volume: product ? num(product.volume) || null : null,
        volumeUnit: product?.volumeUnit || null,
        unitPrice: num(line.unitPrice),
        /* ⚠️ ปัดสองตำแหน่งตั้งแต่ต้นทาง — `lineTotal` ที่ฐานเป็น numeric ที่ผ่าน
           การคูณมาแล้ว บางแถวจึงเป็น 196799.99999999997 · ถ้าไม่ปัดที่นี่ เลขนั้นจะ
           ไปโผล่ในช่อง "มูลค่าบรรทัด" ของ Excel ดิบ ๆ (ของจริงเจอกับใบสหมิตร) */
        amount: money(line.lineTotal),
      };
    });
}

/* บรรทัดจากแถวที่ AE กรอกเอง — ครบทุกช่องอยู่แล้ว ไม่ต้อง join อะไร */
function valueItemRows(items) {
  return [...(items || [])]
    .sort((a, b) => num(a.seq) - num(b.seq))
    .map((item) => ({
      categoryCode: item.categoryCode || null,
      categoryFrom: item.categoryCode ? 'manual' : null,
      fgCode: null,
      description: item.note || null,
      qty: num(item.qty),
      unit: item.unit || null,
      volume: num(item.volume) || null,
      volumeUnit: item.volumeUnit || null,
      unitPrice: num(item.unitPrice),
      amount: money(item.amount),
    }));
}

/**
 * แตกยอด FC ของดีลหนึ่งใบ
 * @param deal        แถว sales_deals (ต้องมี forecastSource / forecastQuotationId / projectValue)
 * @param context     { quotationLines, valueItems, productById, quoteNumber }
 * @returns บรรทัดที่ `fcAmount` รวมกันได้เท่ากับ FC ของดีลเสมอ
 */
export function forecastBreakdownOfDeal(deal, context = {}) {
  const {
    quotationLines, valueItems, productById = new Map(), productByFg = new Map(),
    quoteNumber = null,
    /* ⭐ ใบที่ **มีอยู่แต่ FC ไม่ได้เดินตาม** (มติผู้ใช้ 2026-09-07: "ถ้ามีใบเสนอราคา
       ก็ดึงหมวดมาจากหมวดของ FG") — ใช้เฉพาะตอนไม่มีแถวรายหมวดที่ AE กรอก
       ⚠️ **เอามาแค่ "รายการ" ไม่ได้เอา "ยอด"** — ยอดยังปันส่วนจาก `projectValue`
          ของดีลเหมือนเดิม ⇒ ยอดรวมไฟล์ไม่ขยับสักบาท และไม่แตะ `forecastSource`
       ⭐ ทางนี้คือทางเดียวที่ดีล **Won** จะได้รายหมวด — FC ของดีลปิดถูกแช่แข็ง
          (`won_frozen`) ระบบไม่มีวันสลับให้เดินตามใบอีกแล้ว */
    fallbackQuotationLines = null, fallbackQuoteNumber = null,
  } = context;
  const total = num(deal?.projectValue);
  const followsQuotation = deal?.forecastSource === 'quotation';

  const own = followsQuotation
    ? quotationLineRows(quotationLines, productById, productByFg)
    : valueItemRows(valueItems);
  const usedFallback = !own.length && Boolean(fallbackQuotationLines?.length);
  const raw = usedFallback
    ? quotationLineRows(fallbackQuotationLines, productById, productByFg)
    : own;

  /* ไม่มีบรรทัดให้แตก (ดีลที่ยังไม่ได้กรอกรายหมวด · ใบที่ไม่มีบรรทัด) — ยังต้องมี
     ตัวตนในรายงาน ไม่งั้นยอดรวมไฟล์น้อยกว่าแดชบอร์ดแบบเงียบ ๆ */
  const lines = raw.length ? raw : [{
    categoryCode: null, categoryFrom: null, fgCode: null, description: null,
    qty: 0, unit: null, volume: null, volumeUnit: null, unitPrice: 0, amount: money(total),
  }];

  return allocateToLines(lines, total).map((line) => ({
    ...line,
    dealId: deal?.id || null,
    source: followsQuotation ? 'quotation' : (usedFallback ? 'quotation_lines' : 'manual'),
    quoteNumber: followsQuotation ? quoteNumber : (usedFallback ? fallbackQuoteNumber : null),
    categoryLabel: line.categoryCode || UNCATEGORIZED,
    // ปริมาตรรวมของบรรทัด = ขนาดต่อหนึ่งหน่วยขาย × จำนวน (ดู dealValueItems: volume
    // ไม่เข้าสูตรคิดเงิน แต่เป็นตัวที่ฝ่ายผลิตใช้วางแผน)
    volumeTotal: line.volume == null ? null : money(num(line.volume) * num(line.qty)),
  }));
}

/* คีย์ของแถวสรุป
   ⚠️ **หน่วยต้องอยู่ในคีย์** ไม่งั้นจะบวก "13 เดือน" กับ "30,000 ชิ้น" เข้าด้วยกันแล้ว
      ได้ 30,013 ซึ่งไม่มีความหมายอะไรเลย (ของจริงมีทั้งสองหน่วยในระบบ)
   ⭐ **ขนาดต่อหน่วยก็อยู่ในคีย์ด้วย** (มติผู้ใช้ 2026-09-02) — หมวดเดียวกันแต่คนละขนาด
      ต้องแยกบรรทัด · น้ำหอม 30 ml กับ 100 ml เป็นคนละงานผลิต คนละขวด คนละกล่อง
      ถ้ายุบรวม "จำนวนรวม" จะเป็นเลขที่เอาไปสั่งของไม่ได้เลย และ "ปริมาตรรวม" ก็บอก
      ไม่ได้ว่าต้องเตรียมขวดขนาดไหนกี่ใบ
   ⚠️ **เดือนไม่อยู่ในคีย์** เพราะเดือนกลายเป็น *คอลัมน์* ของกริด ไม่ใช่แถว */
export const summaryKeyOf = (row) => [
  row.categoryLabel, row.unit || '', row.volume ?? '', row.volumeUnit || '',
].join(' ');

/* เดือนทั้ง 12 ของปี — กริดต้องมีคอลัมน์ครบทุกเดือนเสมอ แม้เดือนนั้นยังไม่มียอด
   ไม่งั้นไฟล์ของแต่ละรอบมีคอลัมน์ไม่เท่ากัน เอาไปวางทับกันเทียบไม่ได้ */
export const monthsOfYear = (year) => Array.from({ length: 12 },
  (unused, index) => `${year}-${String(index + 1).padStart(2, '0')}`);

/* เดือนที่พบจริงในข้อมูล (เรียงแล้ว) — ใช้เมื่อไม่ได้ระบุปี
   ⚠️ นับเฉพาะแถวที่ **รู้เดือนรับของจริง** ไม่งั้นเดือนที่ถอยมาจากวันปิดการขายจะสร้าง
      คอลัมน์ที่ไม่มีวันมียอดลง (ยอดของมันไปอยู่ "ยังไม่ระบุเดือน" แล้ว) */
export const monthsInRows = (rows = []) => [
  ...new Set(rows.filter(isScheduledRow).map((row) => row.month)),
].sort();

const blankGrid = (months) => Object.fromEntries(months.map((month) => [month, null]));

/* ใส่ยอดลงช่องเดือน — `null` แปลว่า "เดือนนั้นไม่มีอะไร" ซึ่งต้องต่างจาก 0 บนกระดาษ
   (กติกาค่าว่างของระบบ: ขีด ไม่ใช่ศูนย์) */
const addToMonth = (grid, month, value) => {
  if (!month || !(month in grid)) return;
  grid[month] = money(num(grid[month]) + num(value));
};

/** ยุบบรรทัดเป็นแถวสรุปแบบ **กริด**: แถว = หมวด × หน่วยขาย · คอลัมน์ = เดือน */
export function summarizeForecastLines(rows = [], months = null) {
  const axis = months || monthsInRows(rows);
  const groups = new Map();
  for (const row of rows) {
    const key = summaryKeyOf(row);
    if (!groups.has(key)) {
      groups.set(key, {
        categoryCode: row.categoryCode || null,
        categoryLabel: row.categoryLabel,
        unit: row.unit || null,
        volume: row.volume ?? null,
        volumeUnit: row.volumeUnit || null,
        qty: 0,
        volumeTotal: 0,
        hasVolume: false,
        fcAmount: 0,
        unscheduled: 0,
        months: blankGrid(axis),
        deals: new Set(),
      });
    }
    const group = groups.get(key);
    group.qty += num(row.qty);
    if (row.volumeTotal != null) { group.volumeTotal += num(row.volumeTotal); group.hasVolume = true; }
    group.fcAmount = money(group.fcAmount + num(row.fcAmount));
    /* ⭐ ยอดที่ยังไม่รู้เดือนรับของ **ไม่ลงช่องเดือน** — ไปกองคอลัมน์ท้ายกริด
       (มติผู้ใช้ 2026-09-07) · เดิมถูกเดาเดือนให้จากวันปิดการขายแล้ววางปนกับเดือนจริง
       ทำให้ฝ่ายวางแผนอ่านทั้งกริดเป็นเดือนส่งของจริงทั้งที่ 28% ของยอดไม่ใช่ */
    if (isScheduledRow(row)) addToMonth(group.months, row.month, row.fcAmount);
    else group.unscheduled = money(group.unscheduled + num(row.fcAmount));
    if (row.dealId) group.deals.add(row.dealId);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      volumeTotal: group.hasVolume ? money(group.volumeTotal) : null,
      unscheduled: group.unscheduled > 0 ? group.unscheduled : null,
      dealCount: group.deals.size,
      deals: undefined,
    }))
    .sort((a, b) => String(a.categoryLabel).localeCompare(String(b.categoryLabel))
      || String(a.unit || '').localeCompare(String(b.unit || ''))
      // ขนาดเล็กไปใหญ่ในหมวดเดียวกัน — อ่านเป็นรายการสินค้าของหมวดนั้นได้ทันที
      || (Number(a.volume ?? 0) - Number(b.volume ?? 0)));
}

/** แถวราย deal-บรรทัด พร้อมกริดเดือน — หนึ่งบรรทัดลงช่องเดียวเสมอ (ดีลมีเดือน FC เดียว)
 *  แถวที่ยังไม่รู้เดือนรับของลงช่อง `unscheduled` แทนช่องเดือน — `total` เท่าเดิมทั้งสองทาง */
export function gridForecastLines(rows = [], months = null) {
  const axis = months || monthsInRows(rows);
  return rows.map((row) => {
    const grid = blankGrid(axis);
    const scheduled = isScheduledRow(row);
    if (scheduled) addToMonth(grid, row.month, row.fcAmount);
    return {
      ...row,
      months: grid,
      unscheduled: scheduled ? null : money(row.fcAmount),
      total: money(row.fcAmount),
    };
  });
}
