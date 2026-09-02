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

/* บรรทัดจากใบเสนอราคา — หมวด/ปริมาตรมาจากทะเบียนสินค้าผ่าน productId
 * ⚠️ 27% ของบรรทัดจริง (89/329 เมื่อ 2026-09-02) **ไม่มีทั้ง productId และ fgCode**
 *    เพราะพิมพ์เป็นข้อความล้วน ("PERFUME LOTION" 30,000 ชิ้น) ⇒ ลงกอง "ไม่ระบุหมวด"
 *    ตามมติผู้ใช้ 2026-09-02 · ห้ามเดาหมวดจากหมวดของดีล เพราะดีลใบเดียวมีได้หลายหมวด */
function quotationLineRows(lines, productById) {
  return [...(lines || [])]
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
    .map((line) => {
      const product = line.productId ? productById.get(line.productId) : null;
      return {
        categoryCode: product?.categoryCode || null,
        fgCode: line.fgCode || product?.fgCode || null,
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
  const { quotationLines, valueItems, productById = new Map(), quoteNumber = null } = context;
  const total = num(deal?.projectValue);
  const followsQuotation = deal?.forecastSource === 'quotation';

  const raw = followsQuotation
    ? quotationLineRows(quotationLines, productById)
    : valueItemRows(valueItems);

  /* ไม่มีบรรทัดให้แตก (ดีลที่ยังไม่ได้กรอกรายหมวด · ใบที่ไม่มีบรรทัด) — ยังต้องมี
     ตัวตนในรายงาน ไม่งั้นยอดรวมไฟล์น้อยกว่าแดชบอร์ดแบบเงียบ ๆ */
  const lines = raw.length ? raw : [{
    categoryCode: null, fgCode: null, description: null,
    qty: 0, unit: null, volume: null, volumeUnit: null, unitPrice: 0, amount: money(total),
  }];

  return allocateToLines(lines, total).map((line) => ({
    ...line,
    dealId: deal?.id || null,
    source: followsQuotation ? 'quotation' : 'manual',
    quoteNumber: followsQuotation ? quoteNumber : null,
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

/* เดือนที่พบจริงในข้อมูล (เรียงแล้ว) — ใช้เมื่อไม่ได้ระบุปี */
export const monthsInRows = (rows = []) => [
  ...new Set(rows.map((row) => row.month).filter(Boolean)),
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
        guessedAmount: 0,
        months: blankGrid(axis),
        deals: new Set(),
      });
    }
    const group = groups.get(key);
    group.qty += num(row.qty);
    if (row.volumeTotal != null) { group.volumeTotal += num(row.volumeTotal); group.hasVolume = true; }
    group.fcAmount = money(group.fcAmount + num(row.fcAmount));
    /* ยอดที่เดือน "เดามา" (ไม่ได้มาจากวันที่สิ้นสุด/เดือนที่ลูกค้าขอ) — ชีตสรุปต้อง
       บอกสัดส่วนนี้ ไม่งั้นทุกช่องเดือนอ่านเหมือนเดือนส่งของจริงเท่ากันหมด */
    if (row.monthBasis && !['endDate', 'demandMonth'].includes(row.monthBasis)) {
      group.guessedAmount = money(group.guessedAmount + num(row.fcAmount));
    }
    addToMonth(group.months, row.month, row.fcAmount);
    if (row.dealId) group.deals.add(row.dealId);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      volumeTotal: group.hasVolume ? money(group.volumeTotal) : null,
      guessedAmount: group.guessedAmount > 0 ? group.guessedAmount : null,
      dealCount: group.deals.size,
      deals: undefined,
    }))
    .sort((a, b) => String(a.categoryLabel).localeCompare(String(b.categoryLabel))
      || String(a.unit || '').localeCompare(String(b.unit || ''))
      // ขนาดเล็กไปใหญ่ในหมวดเดียวกัน — อ่านเป็นรายการสินค้าของหมวดนั้นได้ทันที
      || (Number(a.volume ?? 0) - Number(b.volume ?? 0)));
}

/** แถวราย deal-บรรทัด พร้อมกริดเดือน — หนึ่งบรรทัดลงเดือนเดียวเสมอ (ดีลมีเดือน FC เดียว) */
export function gridForecastLines(rows = [], months = null) {
  const axis = months || monthsInRows(rows);
  return rows.map((row) => {
    const grid = blankGrid(axis);
    addToMonth(grid, row.month, row.fcAmount);
    return { ...row, months: grid, total: money(row.fcAmount) };
  });
}
