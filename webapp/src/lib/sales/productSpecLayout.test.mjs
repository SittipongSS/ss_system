/* ── งบหน้ากระดาษ FM-SA-04 — คณิตล้วน (productSpecLayout) ─────────────────────────────
 *
 * ⚠️ ตัวเลข "วัดได้" ทุกตัวในไฟล์นี้มาจากสวีปด้วย Chrome 2026-09-22 (วิธีวัดที่หัว productSpecLayout.js)
 *    ถ้าแดงหลังแก้ CSS ของเปลือก/ตาราง ⇒ วัดใหม่ อย่าขยับตัวเลขให้เขียวเฉย ๆ
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_SPEC_COST_MM, PRODUCT_SPEC_LAYOUT_MM, certRowMm, checklistRowMm, estimateTextLines, figureRowMm, kvRowMm,
  lineMm, paginateProductSpecSections, productSpecHeaderMm, productSpecPageBudgets, productSpecPartyMm,
  sectionOpenMm, signatureBoxMm, signaturesMm, tableRowMm, textWidthMm,
} from './productSpecLayout.js';

/* ── ตัวประเมินบรรทัด ─────────────────────────────────────────────────────────── */

test('🪤 สระบน/ล่าง วรรณยุกต์ ของไทยไม่กินความกว้าง', () => {
  // "กิ่ง" = ก ิ ่ ง ⇒ กินที่สองตัว เท่ากับ "กง"
  assert.equal(textWidthMm('กิ่ง', 8), textWidthMm('กง', 8));
  assert.ok(textWidthMm('ผลิตภัณฑ์', 8) < textWidthMm('ผลตภณฑ', 8) + 1e-9);
});

test('ว่าง = หนึ่งบรรทัด (ช่องพิมพ์ขีด/N/A) · ข้อความสั้นที่ลงบรรทัดเดียวได้ = 1', () => {
  assert.equal(estimateTextLines('', 50, 8), 1);
  assert.equal(estimateTextLines(null, 50, 8), 1);
  assert.equal(estimateTextLines('QT-26090271-0', 44.4, 8), 1);
});

test('pre-wrap: ขึ้นบรรทัดใหม่ของผู้ใช้คือบรรทัดจริง บรรทัดว่างก็กินที่ · ตาราง (ไม่ pre-wrap) ยุบเป็นบรรทัดเดียว', () => {
  const address = 'บรรทัดหนึ่ง\nบรรทัดสอง\n\nบรรทัดสี่';
  assert.equal(estimateTextLines(address, 97.8, 8, { preWrap: true }), 4);
  assert.equal(estimateTextLines(address, 97.8, 8), 1);
});

test('🪤 คำละตินยาวที่ไม่มีเว้นวรรค (อีเมล) ขึ้นบรรทัดใหม่ทั้งคำ — ไม่ถูกนับเหมือนหั่นท้ายบรรทัดก่อน', () => {
  const email = 'sittipong.kittisakdinanchaiyaporn@scentandsense.co.th';
  const alone = estimateTextLines(email, 44.4, 8);
  // ข้อความสั้นนำหน้าเหลือที่ท้ายบรรทัด แต่อีเมลไม่ลงที่เหลือนั้น ⇒ ต้องเริ่มบรรทัดใหม่
  assert.equal(estimateTextLines(`ติดต่อ ${email}`, 44.4, 8), alone + 1);
});

test('ท่อนไทย (ไม่มีเว้นวรรคระหว่างคำ) ไหลต่อท้ายบรรทัดได้ — ไม่ถูกยกทั้งท่อนแบบคำละติน', () => {
  const thai = 'กลิ่นหอมที่สร้างความมั่นใจช่วยให้กลิ่นหอมสร้างคาแร็คเตอร์ที่โดดเด่นเหมาะกับผู้หญิงวัยเริ่มต้นทำงาน';
  const alone = estimateTextLines(thai, 47, 8.4);
  assert.ok(estimateTextLines(`นำ ${thai}`, 47, 8.4) <= alone + 1);
});

/* สอบเทียบกับ Chrome (รอบสอง 2026-09-22): 19 ชุดข้อความ × 18 ความยาว × 14 ช่อง (11,760 กรณี · ความกว้างที่วาดจริง)
   ข้อความที่คนพิมพ์ได้ทุกชุดประเมินไม่ต่ำกว่าจริง · ที่นี่ตรึงตัวอย่างที่วัดได้ ให้ใครแก้ตัวตัดบรรทัด/ความกว้างแล้วรู้ตัว
   ความกว้าง = ค่าที่ตัวประเมินใช้ (checklist 46.53 · kv 110.82/66.37 · cert 58.97 · กล่องผู้ซื้อ 71.8/97.8/23.99 · ชื่อ 71.96) */
const NBSP = '\u00a0';
// 🐞 ผลตรวจรอบสอง: ไทยติดรหัส/URL ไม่มีเว้นวรรค — ตัวเดิมประเมิน 9 บรรทัด Chrome วาด 10 (แถว checklist ล้นท้ายกระดาษ)
const GLUED = 'ขวดแก้วใสทรงกระบอกขนาด50mlพร้อมหัวสเปรย์FEA15สีทองด้านฝาครอบABSสีดำเงาตามตัวอย่างที่ลูกค้าอนุมัติไฟล์อาร์ตเวิร์กล่าสุดอยู่ที่https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWสติกเกอร์PPใสพิมพ์4สีเคลือบUVขนาด40x60mmกล่องกระดาษArtCard350แ';
const URL3 = 'https://www.scentandsense.co.th/products/fragrance/eau-de-parfum-50ml?ref=spec&lang=th'.repeat(3).slice(0, 250);
// NBSP ตัดไม่ได้ — 🐞 ตัวเดิมยุบด้วย `\s` กลายเป็นเว้นวรรคธรรมดา (ประเมิน 5 วาด 6) · Chrome ตัดหลัง "-" ใน Eau-de-Parfum
const NBSP_EN = ['Premium', 'of', 'MMMMMMMMMM', 'a', 'with', 'PACKAGING', 'a', 'a', 'mmmmmmmm', 'a', 'Internationalization',
  'Eau-de-Parfum', 'MMMMMMMMMM', 'Internationalization', 'Internationalization', 'with', 'with', 'of', 'fragrance', 'mmmmmmmm',
  'Eau-de-Parfum', 'with', 'Premium', 'mmmmmmmm', 'of', 'Premium', 'mmmmmmmm', 'Premium', 'MMMMMMMMMM', 'WWWWWWWW', 'a', 'Eau-de-Parfum'].join(NBSP);
const CALIBRATED = [
  // [ข้อความ, ความกว้าง (มม.), pt, pre-wrap, บรรทัดจริงที่ Chrome วาด]
  ['กลิ่นหอมที่สร้างความมั่นใจ ช่วยให้กลิ่นหอม สร้างคาแร็คเตอร์ที่โดดเด่น เหมาะกับผู้หญิงวัยเริ่มต้นทำงาน บรรจุขวดแก้วหัวสเปรย์พร้อมกล่องกระดาษ ', 46.53, 8.4, false, 4],
  ['PACKED IN GLASS BOTTLE WITH SPRAY PUMP AND PRINTED GIFT BOX, SHRINK WRAPPED 12 PCS PER CARTON. ', 46.53, 8.4, false, 4],
  ['88/8 EMPIRE TOWER 47TH FLOOR, SOUTH SATHORN ROAD, YANNAWA, SATHORN, BANGKOK 10120 THAILAND ', 71.8, 8, true, 2],
  ['*ออกใบเสนอราคา / ที่อยู่จัดส่งใบกำกับภาษี*\nบริษัท เดอะ ซีซั่น ฮิล จำกัด\nที่อยู่ 999/121 หมู่ที่ 3 ต.บางขนุน อ.บางกรวย จ.นนทบุรี 11130\nเลขประจำตัวผู้เสียภาษี 0125566039412\n\nส่งใบกำกับถึงคุณเบลล์ 0844326199 ตำบลบางขนุน อำเภอบางกรวย จังหวัดนนทบุรี 11130', 97.8, 8, true, 7],
  // ป้ายอังกฤษที่ยาวที่สุดของกล่องผู้ซื้อ — บรรทัดเดียวในช่อง 24mm (แถวสูงสองบรรทัดเพราะค่าตก ไม่ใช่ป้าย)
  ['Shipping Address', 23.99, 7.7, false, 1],
  ['รายละเอียดผลิตภัณฑ์', 71.96, 19, false, 1],
  [GLUED, 46.53, 8.4, false, 10],
  [GLUED.slice(0, 144), 110.82, 8.4, false, 2],
  ['ส่งตัวอย่างให้คุณเบลล์ตรวจที่bell.purchasing@theseasonhill.co.thก่อนผลิตจริงอ้างอิงPOเลขที่4000172299', 66.37, 8.4, false, 3],
  ['สติกเกอร์PPใสพิมพ์4สีเคลือบUVขนาด40x60mmกล่องกระดาษArtCard35', 58.97, 8.4, false, 3],
  [NBSP_EN, 110.82, 8.4, false, 6],
  [URL3, 110.82, 8.4, false, 5],
  // ตัดฉุกเฉินกลางคำไทยแล้ว Chrome แบ่งคำของเศษใหม่ ("สมุทรป | รา | การ(50ML)…" — เศษสองตัวกินทั้งบรรทัด)
  ['สุวรรณภูมิISO22716:2007สุวรรณภูมิผลิตภัณฑ์ณอุตสาหกรรมผลิตภัณฑ์และสารประกอบอินทรีย์ระเหยง่ายกล่อง(50ML)ofofInternationalizationISO22716:2007สมุทรปราการ(50ML)พระนครศรีอยุธยาMMMMMMMMMM1,500,000,000ที่htt', 71.8, 8, true, 6],
];

test('🔴 ตัวประเมินบรรทัดไม่ต่ำกว่าที่ Chrome วาดจริง (ตัวอย่างที่สอบเทียบแล้ว)', () => {
  for (const [text, width, pt, preWrap, actual] of CALIBRATED) {
    const estimate = estimateTextLines(text, width, pt, { preWrap });
    assert.ok(estimate >= actual, `"${text.slice(0, 24)}…" @${width}mm ${pt}pt: ประเมิน ${estimate} < จริง ${actual}`);
    assert.ok(estimate <= actual + 2, `"${text.slice(0, 24)}…": ประเมินเกินจริงเกินสองบรรทัด (${estimate} vs ${actual})`);
  }
});

test('🪤 Chrome ไม่ตัดระหว่างไทยกับละติน/ตัวเลข — คำไทยที่ติดหัว URL ยกไปทั้งก้อน', () => {
  // "อยู่ที่https://…" : ที่ + URL เป็นก้อนเดียว ⇒ ต้องไม่น้อยกว่ากรณีที่มีเว้นวรรคหน้า URL
  const url = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp';
  assert.ok(estimateTextLines(`ไฟล์อยู่ที่${url}`, 46.53, 8.4) >= estimateTextLines(`ไฟล์อยู่ที่ ${url}`, 46.53, 8.4));
  // "/" หน้าอักษรละตินไม่ใช่จุดตัด — URL ยาวเกินบรรทัดถูกตัดฉุกเฉิน ไม่ใช่ตัดสวย ๆ ที่ "/"
  assert.equal(estimateTextLines('abcdefghijklmnop/qrstuvwxyzabcdefghijklmnopqrstuvwxyz', 30, 8.4), estimateTextLines('abcdefghijklmnopXqrstuvwxyzabcdefghijklmnopqrstuvwxyz', 30, 8.4));
});

/* ระยะแถวในตารางจริง (รอบสอง · ตาราง 12 แถวลบตาราง 1 แถว ÷ 11 · จอ = พิมพ์) — แถวซ้อนกันด้วยเศษพิกเซล
   🐞 รอบแรกเทียบ `offsetHeight` ของ <tr> ทีละแถว (ปัดเป็น 29px = 7.67) ⇒ กรอบ 2.8 เกินจริง ~0.13 ต่อแถว */
const MEASURED_PITCH = [
  // [บรรทัด, ระยะแถวสูงสุดที่วัดได้ในสามตาราง (มม.)]
  [1, 7.5527], [2, 12.4354], [3, 17.3422], [4, 22.2250], [5, 27.1318], [6, 32.0146], [7, 36.8973], [8, 41.8042], [9, 46.6869], [10, 51.5697],
];

test('🔴 แถวตารางไม่ต่ำกว่าระยะแถวที่วัดได้ในตารางจริง · เปิดตารางครอบแถวแรกที่สูงกว่าระยะแถว (0.41)', () => {
  for (const [lines, pitch] of MEASURED_PITCH) {
    assert.ok(tableRowMm(lines) >= pitch + 0.02, `${lines} บรรทัด: ${tableRowMm(lines).toFixed(4)} < วัดได้ ${pitch} (+ เศษการวัด)`);
  }
  assert.ok(kvRowMm('ลักษณะเนื้อสาร', 'เหลว') >= 7.5527);
  assert.ok(certRowMm({ label: 'COA', note: null }) >= 12.4354, 'แถว cert มีสองบรรทัดสถานะเสมอ');
  assert.ok(checklistRowMm({ itemLabel: 'ฝา', detail: null, note: null }) >= 7.5527);
  assert.ok(PRODUCT_SPEC_COST_MM.tableEdge >= 0.41, 'แถวแรก + เส้นขอบบนสูงกว่าระยะแถวได้ถึง 0.41');
  // ใบมาตรฐาน: checklist 17 แถวบรรทัดเดียว + หัวตาราง วาดจริง 136.26 (หัวบรรทัดเดียวรอบสี่ · เดิมหัวสองบรรทัด 141.02)
  // ต้องไม่ต่ำกว่า และไม่เกินเกิน 2.5
  const checklist = sectionOpenMm({ table: 'checklist', headCost: PRODUCT_SPEC_COST_MM.checklistHead })
    - PRODUCT_SPEC_COST_MM.heading + 17 * checklistRowMm({ itemLabel: 'ฝา' });
  assert.ok(checklist >= 136.26 && checklist <= 136.26 + 2.5, `ตาราง checklist 17 แถว ประเมิน ${checklist.toFixed(2)}`);
});

/* หัวข้อแบบ "งวดชำระเงิน / PAYMENT SCHEDULE" ของใบเสนอราคา (มติผู้ใช้ 2026-09-22 รอบสี่): h3 8.7pt วาด 19.14px (5.06) +
   margin 3.5 + 1.5 = 10.06 (ระยะจริงขอบล่างตาราง → ขอบบนตารางถัดไป 10.05–10.32 ปัดพิกเซลของสองก้อน) · รุ่นก่อน 12.69 */
const HEADING_MEASURED = 10.06;

test('ต้นทุนเปิดหัวข้อ = หัวข้อ + หัวตาราง + ขอบตาราง (เฉพาะหัวข้อที่เป็นตาราง)', () => {
  assert.equal(sectionOpenMm({ table: null, headCost: 0 }), PRODUCT_SPEC_COST_MM.heading);
  assert.ok(PRODUCT_SPEC_COST_MM.heading >= HEADING_MEASURED && PRODUCT_SPEC_COST_MM.heading <= HEADING_MEASURED + 0.5,
    `หัวข้อ ${PRODUCT_SPEC_COST_MM.heading} ต้องครอบที่วัดได้ ${HEADING_MEASURED} (และไม่เกินเกินเหตุ)`);
  // หัวตารางบรรทัดเดียวทั้งสองตาราง (วัด 7.67 · "ลำดับ" ไม่ตกบรรทัดแล้ว — ดู checklistHead)
  assert.ok(sectionOpenMm({ table: 'checklist', headCost: PRODUCT_SPEC_COST_MM.checklistHead }) >= HEADING_MEASURED + 7.67);
  assert.ok(sectionOpenMm({ table: 'cert', headCost: PRODUCT_SPEC_COST_MM.certHead }) >= HEADING_MEASURED + 7.67);
});

test('แถวภาพสูงตามคำบรรยายที่ยาวที่สุดในแถว — บรรทัดเดียวไม่ต่ำกว่าที่วัดได้ 85.37', () => {
  assert.ok(figureRowMm(['1. กล่อง', '2. ขวด']) >= 85.37);
  const long = `1. ${'คำบรรยายยาว '.repeat(20)}`;
  assert.ok(figureRowMm(['2. สั้น', long]) > figureRowMm(['1. สั้น', '2. สั้น']));
});

/* ⭐ ช่องลงนามแบบ QT/SO (มติ 2026-09-22) — วัดด้วย Chrome รอบสาม (จอ = พิมพ์ · กล่องเนื้อกว้าง 40.185):
   กล่องทุกบรรทัดเดียว 34.13 · ชื่อสองบรรทัด 38.63 · สามบรรทัด 43.13 · ช่องลูกค้าใบอังกฤษ (ไม่มีบรรทัดตำแหน่ง) 30.16
   (min-height 31) · ทั้งก้อนรวมหัวข้อ (margin บน 2.5) วัดรอบสี่ (หัวข้อ 8.7pt แบบใบเสนอราคา) 43.16 / 47.66 / 52.15
   (รุ่นหัวข้อ 10.5pt 44.32 / 48.81 / 53.31) */
const box = (name, { label = 'ผู้ประสานงานฝ่ายขาย', role = 'Account Coordinator', meta = '17/09/2569' } = {}) => ({ label, role, name, meta });
const UNSIGNED = { label: 'ลูกค้า', role: 'Customer', name: '(____________________________)', meta: 'วันที่ ______ / ______ / ______' };
const SIGNATURE_MEASURED = [
  // [กล่อง, วัดได้ (มม.)]
  [box('ชลิตา เอซี'), 34.13],
  [UNSIGNED, 34.13],
  [{ ...UNSIGNED, label: 'Customer', role: '', meta: 'Date ______ / ______ / ______' }, 31],
  [box('Patcharaphit Wongsakulchaiyaporn', { label: 'ผู้จัดการฝ่ายขาย', role: 'Account Executive Supervisor' }), 38.63],
  [box('สิทธิพงศ์ กิตติศักดิ์ดินันท์ชัยพร ณ อยุธยา วงศ์ใหญ่', { label: 'ฝ่ายขาย', role: 'Account Executive' }), 38.63],
  [box('Chalita Sriwattanaprasertkulchai Na Ayutthaya', { role: 'Assistant Technical Service Manager' }), 43.13],
];

test('🔴 กล่องลงนามไม่ต่ำกว่าที่วัดได้ และไม่เกินเกินเหตุ (เกิน = ดันลายเซ็นไปหน้าเปล่า)', () => {
  for (const [input, drawn] of SIGNATURE_MEASURED) {
    const est = signatureBoxMm(input);
    assert.ok(est >= drawn, `${input.name}: ${est.toFixed(2)} < วัดได้ ${drawn}`);
    assert.ok(est <= drawn + 1, `${input.name}: ประเมินเกินจริง ${(est - drawn).toFixed(2)}`);
  }
});

test('ลายเซ็นทั้งก้อน = หัวข้อ + กล่องที่สูงที่สุด — ไม่ต่ำกว่าที่วัดได้ (43.16 · ชื่อสองบรรทัด 47.66)', () => {
  const four = (names) => names.map((name) => box(name));
  const oneLine = signaturesMm([...four(['ชลิตา เอซี', 'สิทธิพงศ์', 'พัชราภิชญ์']), UNSIGNED]);
  assert.ok(oneLine >= 43.16 && oneLine <= 43.16 + 1, `บรรทัดเดียว ${oneLine.toFixed(2)}`);
  const twoLine = signaturesMm([...four(['ชลิตา เอซี', 'Patcharaphit Wongsakulchaiyaporn']), UNSIGNED]);
  assert.ok(twoLine >= 47.66, `ชื่อสองบรรทัด ${twoLine.toFixed(2)}`);
  // ไม่มีกล่อง (ป้องกันผู้เรียกพลาด) ยังจองเท่ากล่องขั้นต่ำ + หัวข้อ
  assert.ok(signaturesMm([]) >= PRODUCT_SPEC_COST_MM.signatureHeading + 31);
});

test('หัวเอกสาร: ชื่อเอกสารที่ยาวจนตกบรรทัดเพิ่มความสูง 11.06 ต่อบรรทัด', () => {
  const lines = ['2/4 ซอยเพชรเกษม 35/1 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160', 'เลขประจำตัวผู้เสียภาษี 0105560000000', 'โทร 02-000-7722 · Line @perfumefactory · www.scentandsense.co.th'];
  const one = productSpecHeaderMm({ title: 'รายละเอียดผลิตภัณฑ์', companyName: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด', companyLines: lines });
  assert.ok(one >= 42.86, 'ไม่ต่ำกว่าที่วัดได้');
  const two = productSpecHeaderMm({ title: 'เอกสารระบุรายละเอียดผลิตภัณฑ์และบรรจุภัณฑ์ของลูกค้า', companyName: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด', companyLines: lines });
  // วัดได้: identityBlock ชื่อบรรทัดเดียว 33.34 · ท้ายหัว (padding + เส้น) 4.23 ⇒ ชื่อสองบรรทัดสูงอย่างน้อยเท่านี้
  assert.ok(two >= 33.34 + lineMm(19) + 4.23, 'ชื่อสองบรรทัด ⇒ identityBlock สูงกว่าบล็อกบริษัท');
  assert.ok(two > one);
});

test('กล่องผู้ซื้อ/อ้างอิงสูงเท่าคอลัมน์ที่สูงกว่า — แถวอ้างอิงเยอะ ฝั่งขวาชนะ', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `แถว ${i}`, value: 'ค่า' }));
  const fewRef = productSpecPartyMm({ name: 'ก', address: 'ข', partyRows: rows(4), referenceRows: rows(2) });
  const manyRef = productSpecPartyMm({ name: 'ก', address: 'ข', partyRows: rows(4), referenceRows: rows(12) });
  assert.ok(manyRef > fewRef);
  // แถวที่เป็น null (เช่น PO ที่ไม่มี) ไม่นับ
  assert.equal(productSpecPartyMm({ name: 'ก', address: 'ข', partyRows: rows(4), referenceRows: [...rows(2), null] }), fewRef);
});

/* ── งบต่อแผ่น + ตัดหน้าตามหัวข้อ ────────────────────────────────────────────────── */

const section = (key, openCost, rowCosts) => ({ key, openCost, rows: rowCosts.map((cost, i) => ({ cost, i })) });
const BUDGET = { first: 100, rest: 200 };
const shape = (pages) => pages.map((entries) => entries.map((e) => (e.kind === 'row' ? `${e.section.key}${e.row.i}` : e.kind === 'tail' ? 'SIG' : `${e.kind === 'continue' ? '+' : '['}${e.section.key}`)).join(' '));

test('⭐ หัวข้อที่ลงที่เหลือไม่พอแต่ลงแผ่นเปล่าได้ = ย้ายทั้งหัวข้อ (ไม่ตัดกลาง)', () => {
  const pages = paginateProductSpecSections([
    section('a', 10, [20, 20]),     // 50
    section('b', 10, [20, 20, 20]), // 70 — เหลือ 50 ไม่พอ ⇒ ย้ายทั้งก้อน
  ], { cost: 30 }, BUDGET);
  assert.deepEqual(shape(pages), ['[a a0 a1', '[b b0 b1 b2 SIG']);
});

test('⭐ หัวข้อที่สูงกว่าแผ่นเปล่าเท่านั้นที่ตัดกลาง — แผ่นต่อเปิดด้วยหัวข้อ "(ต่อ)" และคิดที่หัวข้อซ้ำ', () => {
  const pages = paginateProductSpecSections([
    section('a', 10, [20]),
    section('big', 10, Array(12).fill(20)), // 250 > แผ่นเปล่า 200
  ], null, BUDGET);
  const text = shape(pages);
  assert.deepEqual(text[0], '[a a0 [big big0 big1 big2'); // เริ่มบนแผ่นปัจจุบันเพราะหัว + แถวแรกลงได้
  assert.match(text[1], /^\+big /);
  // ทุกแผ่นไม่เกินงบ (รวมต้นทุนหัวข้อ "(ต่อ)")
  pages.forEach((entries, index) => {
    const used = entries.reduce((sum, e) => sum + (e.kind === 'row' ? e.row.cost : e.section.openCost), 0);
    assert.ok(used <= (index === 0 ? BUDGET.first : BUDGET.rest), `แผ่น ${index + 1} ใช้ ${used}`);
  });
});

test('ก้อนท้าย (ลายเซ็น) ไม่แบ่ง — ลงไม่พอขึ้นแผ่นใหม่ · แผ่นต่อทุกแผ่นเปิดด้วยหัวข้อ/หัวลายเซ็น', () => {
  const pages = paginateProductSpecSections([section('a', 10, [20, 20, 20, 20])], { cost: 30 }, BUDGET);
  assert.deepEqual(shape(pages), ['[a a0 a1 a2 a3', 'SIG']);
  for (const entries of pages.slice(1)) assert.ok(['open', 'continue', 'tail'].includes(entries[0].kind));
});

test('🪤 หัวข้อแรกลงแผ่นแรกไม่ได้ (กล่องผู้ซื้อสูงมาก) = แผ่นแรกมีแต่หัว/กล่อง — ตามกติกาไม่ตัดหัวข้อ', () => {
  const pages = paginateProductSpecSections([section('a', 10, [40, 40])], null, { first: 60, rest: 200 });
  assert.deepEqual(shape(pages), ['', '[a a0 a1']);
});

test('⭐ ก้อนแรกของแผ่นได้ความจุเต็ม (ไม่หักส่วนเผื่อ) — หัวข้อที่เกินงบแค่ส่วนเผื่อไม่ถูกตัดไปแผ่น "(ต่อ)"', () => {
  // 🐞 ผลตรวจรอบสอง: ภาพ 5 รูป (3 แถว) ประเมิน 269.6 > งบ 267.8 แต่วาดจริงลงแผ่นเดียวเหลือ 3.2mm
  const budgets = { first: 100, rest: 200, reserve: 4 };
  const pages = paginateProductSpecSections([
    section('a', 10, [20, 20]),
    section('fig', 10, [64, 64, 64]), // 202 — เกิน rest 200 แต่ไม่เกินความจุเต็ม 204
  ], null, budgets);
  assert.deepEqual(shape(pages), ['[a a0 a1', '[fig fig0 fig1 fig2']);
  // แชร์แผ่นกับก้อนก่อนหน้า = ยังหักส่วนเผื่อ
  const shared = paginateProductSpecSections([section('a', 10, [20]), section('b', 10, [58])], null, { first: 100, rest: 200, reserve: 4 });
  assert.deepEqual(shape(shared), ['[a a0 [b b0'], '30 + 68 = 98 ≤ 100 ลงแผ่นเดียวกันได้');
  const over = paginateProductSpecSections([section('a', 10, [20]), section('b', 10, [62])], null, { first: 100, rest: 200, reserve: 4 });
  assert.deepEqual(shape(over), ['[a a0', '[b b0'], '30 + 72 = 102 > 100 — แชร์แผ่นไม่ได้ใช้ส่วนเผื่อ');
});

test('⭐ ก้อนท้าย (ลายเซ็น — สูงคงที่) ใช้ความจุเต็ม: ใบมาตรฐานไม่ได้หน้าที่มีแต่ลายเซ็น', () => {
  // 🐞 ผลตรวจรอบสอง: หน้า 2 ของใบมาตรฐานเหลือจริง 3.3mm หลังใส่ลายเซ็น แต่งบ (หักเผื่อ 4) บอกไม่พอ
  const budgets = { first: 100, rest: 200, reserve: 4 };
  assert.deepEqual(shape(paginateProductSpecSections([section('a', 10, [60, 60, 40])], { cost: 32 }, budgets)), ['', '[a a0 a1 a2 SIG']);
  assert.deepEqual(shape(paginateProductSpecSections([section('a', 10, [60, 60, 40])], { cost: 35 }, budgets)), ['', '[a a0 a1 a2', 'SIG']);
});

test('ไม่มีแผ่นต่อที่ว่างเปล่า — ทุกแผ่นหลังแผ่นแรกมีของ', () => {
  const budgets = { first: 100, rest: 200, reserve: 4 };
  const pages = paginateProductSpecSections([
    section('big', 10, Array(12).fill(20)),
    section('b', 10, [180]),
    section('c', 10, [150]),
  ], { cost: 40 }, budgets);
  pages.slice(1).forEach((entries, index) => assert.ok(entries.length > 0, `แผ่น ${index + 2} ว่าง`));
});

test('งบแผ่นแรก = งบแผ่นต่อ − หัวเอกสาร − กล่อง − margin หัวข้อแรกที่แผ่นต่อได้คืน', () => {
  const { first, rest, reserve } = productSpecPageBudgets({ headerMm: 43.4, partyMm: 55 });
  assert.ok(Math.abs(rest - first - 43.4 - 55 - PRODUCT_SPEC_COST_MM.headingTopMargin) < 1e-9);
  assert.equal(reserve, PRODUCT_SPEC_LAYOUT_MM.safety, 'ส่วนเผื่อที่หักไว้ต้องบอกผู้ตัดหน้า (ขอคืนได้เฉพาะก้อนเดี่ยว/ก้อนท้าย)');
});

test('⭐ หัวข้อ breakBefore (ภาพประกอบ) ขึ้นแผ่นใหม่เสมอ แม้แผ่นเดิมยังเหลือที่ (มติผู้ใช้ 2026-09-22)', () => {
  const figs = { ...section('fig', 10, [20]), breakBefore: true };
  // แผ่นแรกเหลือที่พอ แต่ต้องขึ้นแผ่นใหม่
  assert.deepEqual(shape(paginateProductSpecSections([section('a', 10, [20]), figs], { cost: 30 }, BUDGET)),
    ['[a a0', '[fig fig0 SIG']);
  // แผ่นแรกไม่มีหัวข้ออื่น (มีแต่หัวเอกสาร + กล่องผู้ซื้อ) ⇒ ก็ขึ้นแผ่นใหม่
  assert.deepEqual(shape(paginateProductSpecSections([figs], null, BUDGET)), ['', '[fig fig0']);
  // แผ่นต่อที่เพิ่งเปิดและยังว่าง ไม่เปิดซ้อนเป็นแผ่นเปล่า
  const pages = paginateProductSpecSections([section('big', 10, Array(12).fill(20)), figs], null, BUDGET);
  assert.ok(pages.every((entries, index) => index === 0 || entries.length > 0), 'ไม่มีแผ่นต่อที่ว่าง');
  assert.equal(shape(pages).at(-1), '[fig fig0');
});
