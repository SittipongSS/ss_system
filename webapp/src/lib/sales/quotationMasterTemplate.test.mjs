import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUOTATION_DOC_LANGUAGE,
  DEFAULT_QUOTATION_MASTER_VARIANT,
  ITEM_TEXT_CHARS,
  PACK_DISCOUNT_MEASURED_UNITS,
  QUOTATION_MASTER_TEMPLATE_VERSION,
  QUOTATION_MASTER_TEMPLATE_VERSIONS,
  QUOTATION_PREVIEW_SCENARIOS,
  allocateInstallmentAmounts,
  buildQuotationMasterModelFromQuote,
  buildQuotationMasterPreview,
  controlledFormLine,
  docLanguageOf,
  itemTextChars,
  lineIdentityParts,
  paginateQuotationMasterLines,
  quotationDocLabels,
} from './quotationMasterTemplate.js';
import { SALE_UNIT_EN, saleUnitLabel } from '../master/units.js';
import { PACK_LINE_UNIT } from './linePacks.js';

test('controlled form line preserves the exact ISO punctuation and spacing', () => {
  assert.equal(controlledFormLine(), 'FM-SA-01: Rev. No.00. 08/05/2568');
});

test('every preview scenario builds a stable isolated master model', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    const model = buildQuotationMasterPreview(scenario.id, 'approved');
    assert.equal(model.templateVersion, QUOTATION_MASTER_TEMPLATE_VERSION);
    assert.equal(model.templateVariant, DEFAULT_QUOTATION_MASTER_VARIANT);
    assert.ok(model.lines.length > 0, scenario.id);
    assert.ok(model.pages.length > 0, scenario.id);
    assert.equal(model.pages.flatMap((page) => page.lines).length, model.lines.length, scenario.id);
    assert.deepEqual(
      model.pages.flatMap((page) => page.lines).map((line) => line.id),
      model.lines.map((line) => line.id),
      scenario.id,
    );
    assert.equal(model.formLine, 'FM-SA-01: Rev. No.00. 08/05/2568');
  }
});

test('installment allocation rounds to the document total without drift', () => {
  const rows = allocateInstallmentAmounts(107, [
    { percent: 33.33 },
    { percent: 33.33 },
    { percent: 33.34 },
  ]);
  assert.deepEqual(rows.map((row) => row.amount), [35.66, 35.66, 35.68]);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 107);
});

test('four-installment scenario totals 100 percent and the grand total', () => {
  const model = buildQuotationMasterPreview('installments', 'approved');
  assert.equal(model.installments.reduce((sum, row) => sum + row.percent, 0), 100);
  assert.equal(model.installments.reduce((sum, row) => sum + row.amount, 0), model.totals.totalAmount);
});

test('pagination preserves order and does not mutate source lines', () => {
  const lines = Array.from({ length: 24 }, (_, index) => ({
    id: `L-${index}`,
    description: `รายการ ${index} ${'รายละเอียด'.repeat(index % 3)}`,
  }));
  const before = structuredClone(lines);
  const pages = paginateQuotationMasterLines(lines, { totalsReserve: 3 });
  assert.deepEqual(lines, before);
  assert.deepEqual(pages.flat().map((line) => line.id), lines.map((line) => line.id));
  assert.ok(pages.length > 1);
});

test('preview exposes stable V1, V2 and V3 template identities', () => {
  for (const variant of QUOTATION_MASTER_TEMPLATE_VERSIONS) {
    const model = buildQuotationMasterPreview('compact', 'approved', variant.id);
    assert.equal(model.templateVariant, variant.id);
    assert.equal(model.templateVersion, variant.templateVersion);
  }
});

test('semantic pagination separates commercial value from payment details', () => {
  const standard = buildQuotationMasterPreview('standard', 'approved');
  const installments = buildQuotationMasterPreview('installments', 'approved');
  const compact = buildQuotationMasterPreview('compact', 'approved');
  assert.deepEqual(standard.pages.map((page) => page.kind), ['items', 'payment']);
  assert.deepEqual(standard.linePages.map((page) => page.length), [4]);
  assert.equal(standard.pages[0].showTotals, true);
  assert.equal(standard.pages[1].lines.length, 0);
  assert.equal(standard.pages[1].showPayment, true);
  assert.deepEqual(installments.pages.map((page) => page.kind), ['items', 'payment']);
  assert.deepEqual(installments.linePages.map((page) => page.length), [5]);
  /* ⚠️ ใบสั้นสุดใช้ 2 หน้าตั้งแต่มีบรรทัด "จำนวนเงินตัวอักษร" (IS-26080034) — วัดจริงแล้ว
     เนื้อหาหน้าเดียวของ compact สูง 862px เกินงบ .sheetContent (858.2px) ไป 4px
     ไม่ใช่ค่าจองเกินแบบที่เคยเข้าใจผิดตอน #1265 · ถ้าจะให้กลับมาหน้าเดียว ต้องย้าย
     บรรทัดตัวอักษรไปอยู่ที่ว่างข้างซ้ายของกล่องยอดรวม ไม่ใช่ลดค่าจองให้ต่ำกว่าของจริง */
  assert.deepEqual(compact.pages.map((page) => page.kind), ['items', 'payment']);
  assert.equal(compact.pages[0].showTotals, true);
  assert.equal(compact.pages[1].showPayment, true);
  assert.equal(compact.pages[1].showSignatures, true);
});

test('every scenario keeps totals with the final item page and payment after all items', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    const model = buildQuotationMasterPreview(scenario.id, 'approved');
    const itemPages = model.pages.filter((page) => page.lines.length > 0);
    const totalsPages = model.pages.filter((page) => page.showTotals);
    const paymentPageIndex = model.pages.findIndex((page) => page.showPayment);
    assert.ok(itemPages.every((page) => page.lines.length > 0), `${scenario.id} item pages must not be empty`);
    assert.equal(totalsPages.length, 1, `${scenario.id} must render totals once`);
    assert.equal(totalsPages[0], itemPages.at(-1), `${scenario.id} totals must close the final item page`);
    assert.ok(paymentPageIndex >= 0, `${scenario.id} must render payment details`);
    assert.ok(
      paymentPageIndex >= model.pages.indexOf(itemPages.at(-1)),
      `${scenario.id} payment details must follow all items`,
    );
  }
});

test('fixture page distributions stay balanced by semantic section', () => {
  // ตรึงไว้ที่ v3 โดยตั้งใจ — นี่คือเทสต์ของ semantic pagination แบบ V1–V3
  // ซึ่งต้องไม่เปลี่ยนแม้ค่าตั้งต้นของระบบจะย้ายไป V4 แล้ว (การกระจายหน้าของ V4
  // มีเทสต์แยกด้านล่าง)
  const expected = {
    compact: [['combined', 1]],
    standard: [['items', 4], ['payment', 0]],
    dense: [['items', 6], ['items', 5], ['payment', 0]],
    multipage: [['items', 11], ['items', 10], ['items', 6], ['payment', 0]],
    'long-content': [['items', 4], ['items', 2], ['payment', 0]],
    installments: [['items', 5], ['payment', 0]],
  };

  for (const [scenarioId, distribution] of Object.entries(expected)) {
    const model = buildQuotationMasterPreview(scenarioId, 'approved', 'v3');
    assert.deepEqual(model.pages.map((page) => [page.kind, page.lines.length]), distribution);
  }
});

// หมายเหตุ Phase 7C (2026-07-21): เทสต์ที่อ่านไฟล์ component QuotationMasterDocument
// (.js/.module.css) ถูกลบพร้อม component เมื่อปลดระวาง renderer แม่แบบ — เส้นทางเรนเดอร์
// จริง + preview ใช้ lib/sales/quotationMasterDocument.js (server builder) แล้ว ดู
// เทสต์หน้าตา/CSS ที่ quotationMasterDocument.test.mjs. buildQuotationMasterPreview
// ยังอยู่เป็นแหล่งข้อมูล fixture ให้ preview + เก็บ pagination V1–V4 ไว้เทียบย้อนหลัง.

test('document states map to watermark and signature evidence variants', () => {
  const draft = buildQuotationMasterPreview('compact', 'draft');
  const approved = buildQuotationMasterPreview('compact', 'approved');
  const cancelled = buildQuotationMasterPreview('compact', 'cancelled');
  assert.equal(draft.watermark, 'ฉบับร่าง');
  assert.equal(draft.signature, null);
  assert.equal(approved.watermark, '');
  assert.ok(approved.signature?.evidenceId);
  assert.equal(cancelled.watermark, 'ยกเลิก');
  assert.equal(cancelled.signature, null);
});

// ── V4: กติกาแบ่งหน้าตามมติผู้ใช้ 2026-07-20 ─────────────────────────────
// V4 = หน้าตาแบบ V2 แต่ (1) เติมรายการให้เต็มหน้าก่อนค่อยตัด (2) หน้าที่ถือ
// มูลค่ารวมต้องมีรายการอยู่ด้านบน (3) เงื่อนไขชำระ+หมายเหตุ+ลงชื่อ เป็นกลุ่มเดียว

test('V4 เป็นค่าตั้งต้นของแม่แบบ — preview ต้องตรงกับตัวพิมพ์จริง', () => {
  const v4 = QUOTATION_MASTER_TEMPLATE_VERSIONS.find((item) => item.id === 'v4');
  assert.ok(v4, 'ต้องมี v4 ในทะเบียน');
  assert.equal(v4.templateVersion, 'quotation-balanced-controlled-v4');
  // quotePrint.js ใช้กติกาแบ่งหน้าชุด V4 แล้ว preview จึงต้องตั้งต้นที่ V4 ด้วย
  // ไม่งั้นดูตัวอย่างแล้วพิมพ์ออกมาคนละแบบ
  assert.equal(DEFAULT_QUOTATION_MASTER_VARIANT, 'v4');
  assert.equal(QUOTATION_MASTER_TEMPLATE_VERSION, 'quotation-balanced-controlled-v4');
  // V1–V3 ยังอยู่ครบให้เทียบย้อนหลังได้
  assert.deepEqual(QUOTATION_MASTER_TEMPLATE_VERSIONS.map((item) => item.id), ['v1', 'v2', 'v3', 'v4']);
});

test('โหมด fill เติมหน้าให้เต็มก่อนตัด ไม่เกลี่ยสองหน้าแบบ balanced', () => {
  const lines = Array.from({ length: 12 }, (_, index) => ({ id: `L${index}`, fgCode: 'FG', description: 'สินค้า' }));
  const balanced = paginateQuotationMasterLines(lines, { mode: 'balanced' });
  const filled = paginateQuotationMasterLines(lines, { mode: 'fill' });

  // balanced จงใจเกลี่ยให้สองหน้าใกล้เคียงกัน — fill ต้องอัดหน้าแรกมากกว่า
  assert.ok(filled[0].length > balanced[0].length, `fill ${filled[0].length} ต้องมากกว่า balanced ${balanced[0].length}`);
  // ไม่ทำข้อมูลหาย ไม่สลับลำดับ และไม่แก้ของเดิม
  assert.deepEqual(filled.flat().map((l) => l.id), lines.map((l) => l.id));
  assert.equal(lines.length, 12);
});

test('โหมด fill เหลือรายการให้หน้าถัดไปเสมอ — ไม่มีหน้าที่มีแต่ยอดรวมลอย', () => {
  for (const count of [8, 15, 20, 31, 60]) {
    const lines = Array.from({ length: count }, (_, index) => ({ id: `L${index}`, description: 'สินค้าทดสอบ' }));
    const pages = paginateQuotationMasterLines(lines, { mode: 'fill' });
    for (const [index, page] of pages.entries()) {
      assert.ok(page.length >= 1, `${count} รายการ: หน้า ${index + 1} ต้องมีอย่างน้อย 1 รายการ`);
    }
    assert.equal(pages.flat().length, count);
  }
});

test('V4: หน้าที่ถือมูลค่ารวมต้องมีรายการสินค้าอยู่ด้านบนเสมอ', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    const model = buildQuotationMasterPreview(scenario.id, 'approved', 'v4');
    const totalsPage = model.pages.find((page) => page.showTotals);
    assert.ok(totalsPage, scenario.id);
    assert.ok(totalsPage.lines.length >= 1, `${scenario.id}: หน้ามูลค่ารวมต้องมีรายการ`);
  }
});

test('V4: เงื่อนไขชำระ หมายเหตุ และลงชื่อ ไม่ถูกแยกคนละหน้า', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    const model = buildQuotationMasterPreview(scenario.id, 'approved', 'v4');
    for (const page of model.pages) {
      assert.equal(page.showPayment, page.showSignatures, `${scenario.id}/${page.id}: กลุ่มท้ายเอกสารต้องอยู่ด้วยกัน`);
    }
    // และมีกลุ่มนี้โผล่หน้าเดียวเท่านั้น
    assert.equal(model.pages.filter((page) => page.showSignatures).length, 1, scenario.id);
    // ไม่มีหน้า acceptance แยกแบบ V1–V3
    assert.equal(model.pages.some((page) => page.kind === 'acceptance'), false, scenario.id);
  }
});

test('V4 อัดหน้าได้แน่นกว่า V3 โดยไม่ทำให้ใบสั้นยาวขึ้น', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    // compact หลุดข้อนี้ไปตั้งแต่ IS-26080034: V4 จองที่ให้บรรทัดจำนวนเงินตัวอักษรตามที่
    // วัดได้จริง ส่วน V1–V3 ใช้สเกลหน่วยเก่าที่ไม่ได้คาลิเบรตกับ line-height 1.65 เลย
    // (ของเลิกใช้แล้ว เหลือไว้เทียบในหน้าพรีวิว) — "V3 บอกว่าหน้าเดียว" จึงไม่ใช่ของจริง
    if (scenario.id === 'compact') continue;
    const v3 = buildQuotationMasterPreview(scenario.id, 'approved', 'v3');
    const v4 = buildQuotationMasterPreview(scenario.id, 'approved', 'v4');
    assert.ok(
      v4.pages.length <= v3.pages.length,
      `${scenario.id}: V4 ใช้ ${v4.pages.length} หน้า ต้องไม่มากกว่า V3 ที่ ${v3.pages.length}`,
    );
  }
  // เคสจริงที่ fill-first ช่วยได้: ข้อความยาวลดจาก 3 เหลือ 2 หน้า
  // (multipage เคยลด 4→3 ตอน line-height 1.42-1.5 · พอยกเป็น 1.65 ตามกฎ typography
  //  แถวสูงขึ้น 7% ทั้งสองแบบจึงกลับไปเท่ากันที่ 4 หน้า — วัด DOM ยืนยันแล้วว่าไม่ล้น)
  assert.equal(buildQuotationMasterPreview('long-content', 'approved', 'v3').pages.length, 3);
  assert.equal(buildQuotationMasterPreview('long-content', 'approved', 'v4').pages.length, 2);
});

test('V4 px-calibrated: หน้าแรกอัดเต็มจริง — แก้บั๊ก "ไม่เต็มหน้าก็ตัดแล้ว" (2026-07-20)', () => {
  // การกระจายหน้าชุดนี้ยืนยันด้วยการวัด DOM จริงแล้วว่าไม่ล้นหน้า (overflow = 0
  // ทุก scenario × ทั้งสามสถานะ + ใบสังเคราะห์ 128 เคส) — ถ้าเทสต์นี้แตกเพราะไปลดความจุ
  // ให้กลับไปอ่านคอมเมนต์ V4_PAGE_UNITS ก่อน: ค่าพวกนี้มาจากการวัด ไม่ใช่เดา
  //
  // ⭐ ตัวเลขชุดนี้ **วัดใหม่ทั้งชุด 2026-08-14** ตอนยก line-height เอกสารเป็น 1.65
  // แถวสูงขึ้น 50→53.8px และพื้นที่เนื้อหาหดจาก 881 เหลือ 858 ⇒ แถวต่อหน้าน้อยลง
  // (หน้าแรก 12→9 · หน้าต่อ 14→12)
  // ⭐ วัดซ้ำ 2026-08-26 (IS-26080034): บล็อกมูลค่ารวมโตขึ้น 24.2px จากบรรทัดจำนวนเงิน
  // ตัวอักษร ⇒ V4_TOTALS 5→7 · V4_TOTALS_WITH_DISCOUNT_ROWS 8→10 · compact ขยับเป็น 2 หน้า
  // (ใบจริงในฐาน 12 จาก 202 ใบเพิ่มหน้า · เรนเดอร์ครบ 202 ใบแล้วไม่มีใบไหนล้น)
  const expected = {
    compact: [['items', 1], ['payment', 0]],
    standard: [['items', 4], ['payment', 0]],
    dense: [['items', 7], ['items', 4], ['payment', 0]],
    multipage: [['items', 9], ['items', 12], ['items', 6], ['payment', 0]],
    'long-content': [['items', 5], ['combined', 1]], // เดิมผ่าเป็น 3+3 สองหน้า
    installments: [['items', 5], ['payment', 0]],
  };
  for (const [scenarioId, distribution] of Object.entries(expected)) {
    const model = buildQuotationMasterPreview(scenarioId, 'approved', 'v4');
    assert.deepEqual(
      model.pages.map((page) => [page.kind, page.lines.length]),
      distribution,
      scenarioId,
    );
  }
});

test('IS-QT-26080226-0: ช่องว่างท้ายบรรทัดในหมายเหตุ (ก๊อปมาจากไฟล์อื่น) ไม่ทำให้ตัดหน้าเกินจริง', () => {
  // ของจริงจากใบที่ผู้ใช้แจ้ง — แต่ละบรรทัดมีช่องว่างเติมท้ายหลายสิบตัวอักษร (จัดคอลัมน์
  // มาจากไฟล์ต้นทาง) ⚠️ CSS ของ .itemNote เป็น white-space:pre-wrap ซึ่ง "แขวน" ช่องว่าง
  // ท้ายบรรทัดทิ้ง (ไม่กินความกว้าง ไม่บังคับตัดบรรทัดเพิ่ม) — ก่อนแก้ estimatedTextLines
  // นับความยาวรวมช่องว่างตรง ๆ จน 2 รายการนี้ถูกแยกเป็นคนละหน้า ทั้งที่รวมกันยังพอหน้าเดียว
  const note1 = [
    'บริเวณพื้นที่ชั้น 4  ทางเดิน                                                                                     ',
    '-กว้าง 15.26 เมตร x ยาว 12.10 เมตร x สูง 3.40 เมตร',
    '-รวมพื้นที่ประมาณ 627.79 ลูกบาศก์เมตร                                                   ',
    '-ราคา 3,500 บาท/เดือน/Package (ไม่รวม VAT7%)                                    ',
    '-เสนอราคา จำนวน 1 Package เครื่อง OV-08  2 เครื่อง  OV-05 1 เครื่อง',
    '-น้ำหอม  1  ลิตร ',
    '-ระยะเวลาสัญญา จำนวน 12 เดือน',
    '-เวลาการทำงานของเครื่อง 8 ชม./วัน',
  ].join('\n');
  const note2 = [
    '- บริเวณพื้นที่ชั้น 1                                                                                       ',
    '-กว้าง 3.79 เมตร x ยาว 15.05 เมตร x สูง 3.38 เมตร',
    '-รวมพื้นที่ประมาณ 192.79 ลูกบาศก์เมตร                                                   ',
    '-ราคา 3,500 บาท/เดือน/Package (ไม่รวม VAT7%)                                    ',
    '-เสนอราคา จำนวน 1 Package เครื่อง OV-08 1 เครื่อง  ',
    '-  น้ำหอม 1 ลิตร',
    '-ระยะเวลาสัญญา จำนวน 12 เดือน',
    '-เวลาการทำงานของเครื่อง 8 ชม./วัน',
  ].join('\n');
  const lines = [
    { id: 'L0', fgCode: 'FG-364-02-001-1061', brand: 'Asan Service', description: 'ระบบกระจายกลิ่น · 2 package', note: note1 },
    { id: 'L1', fgCode: 'FG-364-02-001-1061', brand: 'Asan Service', description: 'ระบบกระจายกลิ่น · 2 package', note: note2 },
  ];
  const pages = paginateQuotationMasterLines(lines, { mode: 'fill' });
  assert.equal(pages.length, 1, `ต้องอยู่หน้าเดียว ได้ ${pages.length} หน้า`);
  assert.equal(pages[0].length, 2);
});

// ── หัวเอกสาร: คู่ "โครงการหลัก / โครงการย่อย" (มติผู้ใช้ 2026-08-04, ปรับคำ 08-05) ──
// ป้ายนี้ใช้ **เฉพาะบนเอกสาร** — ในแอปยังเรียกดีลเหมือนเดิม

const QUOTE_WITH_PROJECT = {
  id: 'QT-TEST',
  quoteNumber: 'QT-26080001-0',
  customerName: 'บริษัท ตัวอย่าง จำกัด',
  createdByName: 'พนักงานขาย ตัวอย่าง',
  lines: [],
  deal: {
    id: 'DL-1',
    title: 'ผลิตภัณฑ์น้ำหอมปรับอากาศ 2026',
    dealType: 'SCENT',
    project: { id: 'PRJ-1', code: 'PJ-26070038', name: 'Signature Bloom' },
  },
};

const refRow = (model, label) => model.referenceRows.find((row) => row.label === label)?.value;

test('อ้างอิงบนใบเสนอราคา: แยกรหัส/ชื่อ/ประเภท คนละแถว ตามลำดับที่ตกลงไว้', () => {
  const model = buildQuotationMasterModelFromQuote({ ...QUOTE_WITH_PROJECT, deal: { ...QUOTE_WITH_PROJECT.deal, ownerName: 'เอเจ้าของดีล' } });
  const labels = model.referenceRows.map((row) => row.label);
  // เอกสารเรียกดีลว่า "โครงการ" และไม่มีชื่อโครงการแม่/ผู้จัดทำแล้ว (มติผู้ใช้ 2026-08-05)
  assert.deepEqual(labels.slice(0, 4), [
    'เลขที่โครงการ', 'โครงการ', 'ประเภทโครงการ', 'ผู้เสนอราคา',
  ]);
  assert.ok(!labels.includes('โครงการหลัก'));
  // "ผู้จัดทำ" เป็นช่องเซ็น ไม่ใช่แถวอ้างอิง
  assert.ok(!labels.includes('ผู้จัดทำ'));
  assert.equal(refRow(model, 'เลขที่โครงการ'), 'PJ-26070038');
  assert.equal(refRow(model, 'โครงการ'), 'ผลิตภัณฑ์น้ำหอมปรับอากาศ 2026');
  assert.equal(refRow(model, 'ประเภทโครงการ'), 'SCENT');
  // เอกสารต้องไม่ยุบ "รหัส · ชื่อ" ไว้แถวเดียวอีก
  assert.ok(!model.referenceRows.some((row) => String(row.value).includes(' · ')));
  // คำว่า "ดีล" ต้องไม่โผล่บนเอกสาร
  assert.ok(!labels.includes('ดีล'));
});

// ⚠️ สองบทบาทนี้เคยถูกยุบเป็นค่าเดียวกันมาแล้ว 2 รอบ ทดสอบจึงตั้งชื่อคนละคนเสมอ:
// "ผู้เสนอราคา" (บล็อกอ้างอิง) = AE เจ้าของดีล · "ผู้จัดทำ" (ช่องเซ็น) = คนที่ทำใบจริง
test('ผู้เสนอราคาในอ้างอิง กับ ผู้จัดทำในช่องเซ็น ต้องแยกที่มากัน', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: 'คนทำใบ',
    deal: { ...QUOTE_WITH_PROJECT.deal, ownerName: 'เอเจ้าของดีล' },
  });
  assert.equal(refRow(model, 'ผู้เสนอราคา'), 'เอเจ้าของดีล');
  // ชื่อคนทำใบเป็นของช่องเซ็น ห้ามหลุดไปอยู่ในบล็อกอ้างอิง
  assert.ok(!model.referenceRows.some((row) => row.value === 'คนทำใบ'));
  assert.equal(model.signers[0].label, 'ผู้จัดทำ');
  assert.equal(model.signers[0].name, 'คนทำใบ');
  assert.equal(model.signers[1].label, 'ผู้อนุมัติเสนอราคา');
  // ไม่มีคนทำใบ → เว้นว่าง ไม่ถอยไปใช้ชื่อ AE เจ้าของดีล (คนละบทบาท)
  const noPreparer = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: null,
    deal: { ...QUOTE_WITH_PROJECT.deal, ownerName: 'เอเจ้าของดีล' },
  });
  assert.equal(noPreparer.signers[0].name, '');
  // ดีลไม่มีเจ้าของ → ขีด ไม่ถอยไปใช้ชื่อคนทำใบ (ทิศทางกลับกัน)
  assert.equal(refRow(buildQuotationMasterModelFromQuote({ ...QUOTE_WITH_PROJECT, createdByName: 'คนทำใบ' }), 'ผู้เสนอราคา'), '-');
});

// เบอร์บนใบต่อท้ายแถว "ผู้เสนอราคา" แต่ค่าที่ตรึงไว้เป็นเบอร์ของคนทำใบ — ถ้าปล่อยให้โชว์
// ตอนสองบทบาทเป็นคนละคน ลูกค้าจะโทรตามเบอร์นั้นแล้วไปเจอคนที่ไม่ใช่ชื่อที่อ่าน
test('โทร (ใบก่อนเริ่มตรึง): ถอยไปใช้เบอร์คนทำใบเฉพาะตอนเป็นเจ้าของดีลเอง', () => {
  const base = { ...QUOTE_WITH_PROJECT, createdBy: 'U-AE', createdByPhone: '081-234-5678' };
  const same = buildQuotationMasterModelFromQuote({
    ...base,
    deal: { ...base.deal, ownerId: 'U-AE', ownerName: 'เอเจ้าของดีล' },
  });
  assert.equal(refRow(same, 'โทร'), '081-234-5678');

  // คนทำใบคนละคนกับเจ้าของดีล → ตัดแถวทิ้ง ไม่โชว์เบอร์ผิดคน
  const other = buildQuotationMasterModelFromQuote({
    ...base,
    deal: { ...base.deal, ownerId: 'U-OTHER', ownerName: 'เอเจ้าของดีล' },
  });
  assert.equal(refRow(other, 'โทร'), undefined);
  // แถวที่เหลือต้องไม่กระทบ
  assert.equal(refRow(other, 'ผู้เสนอราคา'), 'เอเจ้าของดีล');
});

// เบอร์เจ้าของดีลถูกตรึงลงใบตอนออกใบ (createQuotationDraft / revise) — ทางหลัก
test('โทร: ใช้เบอร์เจ้าของดีลที่ตรึงไว้ ไม่ใช่เบอร์คนทำใบ', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdBy: 'U-AC',
    createdByPhone: '02-000-0000', // เบอร์คนทำใบ ต้องไม่โผล่
    metadata: { salesOwnerId: 'U-AE', salesOwnerPhone: '081-234-5678' },
    deal: { ...QUOTE_WITH_PROJECT.deal, ownerId: 'U-AE', ownerName: 'เอเจ้าของดีล' },
  });
  assert.equal(refRow(model, 'โทร'), '081-234-5678');
});

// ชื่อผู้เสนอราคาอ่านสดจากดีล แต่เบอร์ถูกตรึง — เปลี่ยนเจ้าของดีลแล้วสองค่านี้จะไม่ตรงกัน
test('โทร: เปลี่ยนเจ้าของดีลแล้ว เบอร์ที่ตรึงไว้ต้องไม่ถูกใช้ต่อ', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdBy: 'U-AC',
    createdByPhone: '02-000-0000',
    metadata: { salesOwnerId: 'U-AE-เก่า', salesOwnerPhone: '081-234-5678' },
    deal: { ...QUOTE_WITH_PROJECT.deal, ownerId: 'U-AE-ใหม่', ownerName: 'เจ้าของดีลคนใหม่' },
  });
  assert.equal(refRow(model, 'ผู้เสนอราคา'), 'เจ้าของดีลคนใหม่');
  assert.equal(refRow(model, 'โทร'), undefined);
});

// ฉบับตรึง/ใบเก่าไม่มี id ครบ → เทียบชื่อแทน (สองค่ามาจาก snapshot ชุดเดียวกัน)
// ⚠️ เบอร์ที่ยกมาคือ `createdByPhone` = เบอร์ **ผู้สร้างร่าง** ⇒ ชื่อที่เอามาเทียบต้องเป็น
// createdByName ไม่ใช่ชื่อบนช่องผู้จัดทำ (ซึ่งตอนนี้คือผู้ยื่น — มติผู้ใช้ 2026-08-17)
test('โทร: ไม่มี id ให้เทียบ ก็ถอยไปเทียบชื่อผู้สร้างร่างกับผู้เสนอราคา', () => {
  const meta = { salesOwner: 'คนเดียวกัน' };
  const pinned = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: 'คนเดียวกัน',
    createdByPhone: '081-234-5678',
    deal: null,
    metadata: meta,
  });
  assert.equal(refRow(pinned, 'โทร'), '081-234-5678');

  const mismatched = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: 'อีกคน',
    createdByPhone: '081-234-5678',
    deal: null,
    metadata: meta,
  });
  assert.equal(refRow(mismatched, 'โทร'), undefined);
});

// มติผู้ใช้ 2026-08-17: ผู้จัดทำ = **คนที่กดยื่นอนุมัติ** (approvalRequestedByName ที่
// mig 0156 เขียนให้) ไม่ใช่คนเปิดร่าง — ร่างเปิดค้างได้ทั้งทีม สองคนนี้คนละคนได้
test('ผู้จัดทำ = คนที่กดยื่น ไม่ใช่คนเปิดร่าง', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: 'AC คนเปิดร่าง',
    approvalRequestedByName: 'Senior AE คนยื่น',
  });
  assert.equal(model.signers[0].name, 'Senior AE คนยื่น');
});

// ใบก่อน mig 0156 ไม่มีขั้นยื่น — ยังต้องมีชื่อขึ้นเอกสาร ไม่ปล่อยช่องว่าง
test('ใบเก่าที่ไม่มีขั้นยื่น → ผู้จัดทำถอยไปใช้ผู้เปิดร่าง', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: 'คนทำใบเก่า',
    approvalRequestedByName: null,
  });
  assert.equal(model.signers[0].name, 'คนทำใบเก่า');
});

// ⚠️ metadata.preparedBy = "ผู้ประสานงาน (AC)" คนละบทบาทกับผู้จัดทำ — เคยเป็นค่าสำรอง
// ของช่องนี้ แล้วชื่อ AC ไปยืนคู่ลายเซ็นผู้จัดทำแทนคนที่ทำจริง
test('ผู้จัดทำต้องไม่ถอยไปใช้ metadata.preparedBy (นั่นคือผู้ประสานงาน)', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: null,
    approvalRequestedByName: null,
    metadata: { ...QUOTE_WITH_PROJECT.metadata, preparedBy: 'AC ผู้ประสานงาน' },
  });
  assert.equal(model.signers[0].name, '');
});

// ลายเซ็นต้องเป็นของคนที่เซ็นจริง ห้ามเอาชื่อในระบบไปแปะทับ
test('มีหลักฐานการลงนาม → ช่องผู้จัดทำใช้ชื่อคนที่เซ็นจริง', () => {
  const model = buildQuotationMasterModelFromQuote(
    {
      ...QUOTE_WITH_PROJECT,
      createdByName: 'คนทำใบ',
      deal: { ...QUOTE_WITH_PROJECT.deal, ownerName: 'เอเจ้าของดีล' },
    },
    {
      proposerSignatureImage: 'data:image/png;base64,AAA',
      proposerEvidence: { id: 'EV-1', signerName: 'คนที่เซ็นจริง', signedAt: '2026-08-05' },
    },
  );
  assert.equal(model.signers[0].label, 'ผู้จัดทำ');
  assert.equal(model.signers[0].esignature.signerName, 'คนที่เซ็นจริง');
});

test('ประกอบอ้างอิงจากข้อมูลเท่าที่มี ไม่เดาประเภทเอง', () => {
  // ดีลยังไม่ผูกโครงการ
  const noProject = buildQuotationMasterModelFromQuote({ ...QUOTE_WITH_PROJECT, deal: { ...QUOTE_WITH_PROJECT.deal, project: null } });
  assert.equal(refRow(noProject, 'เลขที่โครงการ'), '-');
  // โครงการยังไม่มีรหัส (ข้อมูลเก่า) → ช่องรหัสเป็นขีด
  const noCode = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    deal: { ...QUOTE_WITH_PROJECT.deal, project: { name: 'Signature Bloom' } },
  });
  assert.equal(refRow(noCode, 'เลขที่โครงการ'), '-');
  // ไม่มีดีลเลย
  const noDeal = buildQuotationMasterModelFromQuote({ ...QUOTE_WITH_PROJECT, deal: null });
  assert.equal(refRow(noDeal, 'โครงการ'), '-');
  assert.equal(refRow(noDeal, 'ประเภทโครงการ'), '-');
  // snapshot เก่าที่มีแต่ชื่อดีล ไม่มีแถวดีล → ห้ามเดาประเภทเป็น NPD
  const legacy = buildQuotationMasterModelFromQuote({ ...QUOTE_WITH_PROJECT, deal: null, dealTitle: 'ดีลเก่า' });
  assert.equal(refRow(legacy, 'โครงการ'), 'ดีลเก่า');
  assert.equal(refRow(legacy, 'ประเภทโครงการ'), '-');
  // ดีลที่ยังไม่ตั้งประเภท → normalize เป็น NPD เหมือนที่หน้าจอแสดง
  const noType = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    deal: { ...QUOTE_WITH_PROJECT.deal, dealType: null },
  });
  assert.equal(refRow(noType, 'ประเภทโครงการ'), 'NPD');
});

test('ผู้เรียกที่ส่ง referenceRows เองยังคุมได้เหมือนเดิม (ใบสั่งขาย)', () => {
  const model = buildQuotationMasterModelFromQuote(QUOTE_WITH_PROJECT, {
    referenceRows: [{ label: 'อ้างอิง QT', value: 'QT-26080001-0' }],
  });
  assert.deepEqual(model.referenceRows.map((row) => row.label), ['อ้างอิง QT']);
});

// ── กลุ่มท้ายเอกสารสูงเกินหนึ่งหน้า (IS-26080009) ────────────────────────────
// 🐞 ผู้ใช้แจ้ง "ตารางงวดชำระในเอกสารทับหัวข้อ" — ใบจริง QT-26080032 หมายเหตุยาว
// ~30 บรรทัด กลุ่มท้ายเอกสารจึงสูงเกินหน้าเต็ม แต่ V4 ยังยัดลงหน้าเดียวแล้วปล่อยล้น
// ⚠️ CSS `.v4 .paymentContent { justify-content: flex-end }` ดันส่วนที่ล้น **ขึ้น**
// ตารางงวดชำระจึงไปทับหัวเอกสาร (วัดของจริง: -65px จากขอบบนกระดาษ)
const quoteWithRemarks = (remarks) => ({
  ...QUOTE_WITH_PROJECT,
  notes: remarks,
  paymentPlan: {
    type: 'installment',
    paymentMethod: 'โอนเข้าบัญชีบริษัท',
    installments: [
      { no: 1, label: 'ชำระยืนยันสั่งซื้อ', percent: 50, amount: 404781 },
      { no: 2, label: 'ชำระหลังส่งสินค้า ภายใน 3 วัน', percent: 50, amount: 404781 },
    ],
  },
});

test('หมายเหตุยาวจนกลุ่มท้ายเอกสารเกินหนึ่งหน้า = ตัดหมายเหตุข้ามหน้า ไม่ปล่อยล้น', () => {
  const longRemarks = Array.from({ length: 40 }, (_, index) => `บรรทัดหมายเหตุที่ ${index + 1}`).join('\n');
  const pages = buildQuotationMasterModelFromQuote(quoteWithRemarks(longRemarks)).pages;
  // หมายเหตุ 40 บรรทัดสูงเกินหนึ่งหน้า ⇒ ตัดเป็นสองช่วง หน้าหลังแบกช่องลงชื่อไปด้วย
  assert.deepEqual(pages.map((page) => page.kind), ['items', 'payment', 'payment']);

  const paymentPages = pages.filter((page) => page.kind === 'payment');
  assert.equal(paymentPages[0].showSignatures, false, 'หน้าที่ยังมีหมายเหตุต่อต้องไม่แบกช่องลงชื่อ');
  assert.equal(paymentPages[1].showSignatures, true);
  // ช่องลงชื่อต้องมีที่เดียวเสมอ ไม่ว่าจะผ่ากี่หน้า
  assert.equal(pages.filter((page) => page.showSignatures).length, 1);

  // ทุกบรรทัดหมายเหตุต้องถูกพิมพ์ครบ ไม่ซ้ำ ไม่ขาด (ช่วงต่อกันพอดี)
  const ranges = paymentPages.map((page) => page.remarksRange).filter(Boolean);
  assert.equal(ranges[0].start, 0);
  ranges.slice(1).forEach((range, index) => assert.equal(range.start, ranges[index].end));
  assert.equal(ranges[ranges.length - 1].end, 40);
  assert.equal(paymentPages[1].remarksContinued, true, 'หน้าต่อต้องขึ้นหัวข้อ "หมายเหตุ (ต่อ)"');
});

// ── ตารางงวดชำระยาวเกินหนึ่งหน้า (ใบสั่งขายรายงวด · 2026-09-17) ───────────────
// 🐞 ผู้ใช้แจ้ง "เอกสาร QT / SO หน้าล้น" — ใบสั่งขาย 12 งวด (แถวละ 2 บรรทัดเพราะมี
// "วางบิล …") + หมายเหตุ 4 บรรทัด วัดจริงด้วย Chrome ได้ 962px บนพื้นที่ 878px
// ⇒ กล่องหมายเหตุมุดใต้ท้ายกระดาษ ทับบรรทัดชื่อบริษัท/รหัสแบบฟอร์ม
const BANK_TERMS = 'ชำระเงินเพื่อยืนยันการผลิตได้ที่\n\nธนาคารกสิกรไทย\nชื่อบัญชี บจก. เซนท์ แอนด์ เซนส์ แลบอราทอรี่\nเลขที่บัญชี 034-296-2459';
const installmentQuote = (count, { remarks = '- ผลิต 45-60 วัน', paymentTerms = BANK_TERMS } = {}) => ({
  ...QUOTE_WITH_PROJECT,
  paymentTerms,
  notes: remarks,
  paymentPlan: {
    type: 'installment',
    paymentMethod: 'โอนเข้าบัญชีบริษัท',
    installments: Array.from({ length: count }, (_, index) => ({
      no: index + 1,
      label: `งวดที่ ${index + 1}`,
      note: `วางบิล 24/${String((index % 12) + 1).padStart(2, '0')}/2027`,
      percent: Number((100 / count).toFixed(2)),
      amount: 20856,
    })),
  },
});

test('ใบสั่งขาย 12 งวด + เงื่อนไขธนาคาร + หมายเหตุ = กระจายหลายหน้า ไม่ยัดหน้าเดียวแล้วล้น', () => {
  const pages = buildQuotationMasterModelFromQuote(installmentQuote(12, {
    remarks: '1. ราคาที่เสนอยืนราคาภายใน 7 วัน\n2. ระยะเวลาการผลิต 30 - 45 วัน ตามคิวผลิตปัจจุบัน\n3. ราคานี้ไม่รวมค่าขนส่ง\n4. บริษัทขอสงวนสิทธิ์ทบทวนราคา',
  })).pages;
  const groupPages = pages.filter((page) => page.showPayment || page.showSignatures);
  assert.ok(groupPages.length > 1, 'กลุ่มท้ายเอกสารที่ไม่พอหน้าเดียวต้องถูกกระจาย');
  assert.equal(pages.filter((page) => page.showSignatures).length, 1);
  const installmentPages = pages.filter((page) => page.installmentRange);
  assert.equal(installmentPages[installmentPages.length - 1].installmentRange.end, 12, 'ต้องพิมพ์ครบ 12 งวด');
  assert.equal(pages.filter((page) => page.remarksRange).length, 1, 'หมายเหตุสั้นต้องไม่ถูกหั่น');
});

test('ตารางงวดยาวเกินหน้า = ตัดแถวข้ามหน้า ครบทุกงวด ไม่ซ้ำ ไม่ขาด', () => {
  for (const count of [18, 24, 30]) {
    const pages = buildQuotationMasterModelFromQuote(installmentQuote(count)).pages;
    const ranges = pages.map((page) => page.installmentRange).filter(Boolean);
    assert.ok(ranges.length > 1, `${count} งวด: ต้องตัดตารางข้ามหน้า`);
    assert.equal(ranges[0].start, 0);
    ranges.slice(1).forEach((range, index) => assert.equal(range.start, ranges[index].end, `${count} งวด: ช่วงแถวต้องต่อกันพอดี`));
    assert.equal(ranges[ranges.length - 1].end, count, `${count} งวด: ต้องพิมพ์ครบทุกงวด`);
    assert.equal(ranges.slice(1).every((range, index) => pages.filter((page) => page.installmentRange === range)[0].installmentsContinued), true);
    // กล่องเงื่อนไข หมายเหตุ และช่องลงชื่อยังมีที่เดียวเหมือนเดิม
    assert.equal(pages.filter((page) => page.showTerms).length, 1, `${count} งวด`);
    assert.equal(pages.filter((page) => page.remarksRange).length, 1, `${count} งวด`);
    assert.equal(pages.filter((page) => page.showSignatures).length, 1, `${count} งวด`);
  }
});

test('6 งวดพร้อมหมายเหตุยังจบในหน้าท้ายเอกสารหน้าเดียว — ห้ามผ่าเพราะจองเผื่อเกิน', () => {
  const pages = buildQuotationMasterModelFromQuote(installmentQuote(6, {
    remarks: '1. ราคาที่เสนอยืนราคาภายใน 7 วัน\n2. ระยะเวลาการผลิต 30 - 45 วัน\n3. ราคานี้ไม่รวมค่าขนส่ง\n4. บริษัทขอสงวนสิทธิ์ทบทวนราคา',
  })).pages;
  assert.equal(pages.filter((page) => page.showPayment).length, 1, 'กลุ่มท้ายเอกสารที่พอในหน้าเดียวต้องไม่ถูกผ่า');
  const last = pages[pages.length - 1];
  assert.equal(last.showSignatures, true);
});

test('หมายเหตุปกติยังอยู่หน้าเดียวเหมือนเดิม — ห้ามผ่าเพราะเผื่อไว้ก่อน', () => {
  const pages = buildQuotationMasterModelFromQuote(quoteWithRemarks('- ผลิต 45-60 วัน\n- ส่งฟรีในกรุงเทพและปริมณฑล')).pages;
  assert.equal(pages.some((page) => page.kind === 'acceptance'), false);
  const last = pages[pages.length - 1];
  assert.equal(last.showPayment, last.showSignatures, 'กลุ่มท้ายเอกสารต้องอยู่ด้วยกัน');
});

// ── ภาษาของเอกสาร (IS-26080005 · mig 0238) ─────────────────────────────────

test('docLanguageOf: รับเฉพาะ th/en · ค่าอื่นและใบเก่าที่ไม่มีคอลัมน์ตกไปเป็นไทย', () => {
  assert.equal(docLanguageOf('th'), 'th');
  assert.equal(docLanguageOf('en'), 'en');
  assert.equal(docLanguageOf(undefined), DEFAULT_QUOTATION_DOC_LANGUAGE);
  assert.equal(docLanguageOf(null), 'th');
  assert.equal(docLanguageOf('EN'), 'th', 'ไม่เดาให้จากตัวพิมพ์ใหญ่ — DB เก็บตัวเล็กเท่านั้น');
  assert.equal(docLanguageOf('jp'), 'th');
});

test('พจนานุกรมป้าย: ทุกคีย์มีครบทั้งสองภาษา ไม่มีช่องว่าง', () => {
  const th = quotationDocLabels('th');
  const en = quotationDocLabels('en');
  // คีย์ที่เอกสารเรียกใช้จริง — ขาดข้างใดข้างหนึ่ง = ป้ายหายไปจากกระดาษเงียบ ๆ
  for (const key of ['number', 'grandTotal', 'paymentSchedule', 'signHere', 'page', 'lineNo']) {
    assert.ok(th.t(key), `th ขาดคีย์ ${key}`);
    assert.ok(en.t(key), `en ขาดคีย์ ${key}`);
    assert.notEqual(th.t(key), en.t(key), `${key} ต้องแปลจริง ไม่ใช่ค่าเดียวกันสองฝั่ง`);
  }
  assert.equal(th.isEnglish, false);
  assert.equal(en.isEnglish, true);
});

test('หัวข้อคู่: ใบไทยพิมพ์สองบรรทัด · ใบอังกฤษเหลือบรรทัดเดียว', () => {
  assert.deepEqual(
    quotationDocLabels('th').pair('paymentSchedule'),
    { text: 'งวดชำระเงิน', sub: '/ PAYMENT SCHEDULE' },
  );
  assert.deepEqual(
    quotationDocLabels('en').pair('paymentSchedule'),
    { text: 'PAYMENT SCHEDULE', sub: '' },
  );
});

test('model อ่านภาษาจากตัวใบ — ป้ายอ้างอิง/ช่องลงนาม/วันที่ ตามภาษาที่ใบเลือก', () => {
  const quote = {
    quoteNumber: 'QT-2026-0009', quoteDate: '2026-08-12', validUntil: '2026-09-11',
    customerName: 'ACME PTE LTD', billingAddress: '1 Marina Blvd, Singapore',
    lines: [], subtotal: 0, vatRate: 7, vatAmount: 0, totalAmount: 0,
    paymentPlan: { type: 'full' }, approvalStatus: 'not_submitted',
    docLanguage: 'en',
    deal: { title: 'Room Diffuser 2026', ownerName: 'Kanti' },
  };
  const model = buildQuotationMasterModelFromQuote(quote);
  assert.equal(model.docLanguage, 'en');
  assert.equal(model.document.dateLabel, 'Date');
  assert.equal(model.document.secondaryLabel, 'Valid Until');
  assert.deepEqual(model.referenceRows.map((row) => row.label), ['Project No.', 'Project', 'Project Type', 'Quoted By']);
  assert.deepEqual(model.signers.map((row) => row.label), ['Prepared By', 'Approved By', 'Confirmed By']);
  assert.equal(model.watermark, 'DRAFT');
  // เลขสาขาเป็นเลขล้วนทั้งสองภาษาแล้ว (มติผู้ใช้ 2026-08-27)
  assert.equal(model.customer.branch, '00000');

  // ใบเดียวกันแต่ไม่ระบุภาษา = ใบไทยเดิมทุกป้าย
  const thai = buildQuotationMasterModelFromQuote({ ...quote, docLanguage: undefined });
  assert.equal(thai.docLanguage, 'th');
  assert.equal(thai.document.dateLabel, 'วันที่');
  assert.deepEqual(thai.referenceRows.map((row) => row.label), ['เลขที่โครงการ', 'โครงการ', 'ประเภทโครงการ', 'ผู้เสนอราคา']);
  assert.deepEqual(thai.signers.map((row) => row.label), ['ผู้จัดทำ', 'ผู้อนุมัติเสนอราคา', 'ผู้ยืนยันคำสั่งซื้อ']);
  assert.equal(thai.watermark, 'ฉบับร่าง');
});

test('ที่อยู่บริษัทภาษาอังกฤษเดินทางมากับ model — ยังไม่ได้กรอกก็ยังมีที่อยู่ไทยให้พิมพ์', () => {
  const quote = {
    quoteNumber: 'QT-1', lines: [], subtotal: 0, vatRate: 0, vatAmount: 0, totalAmount: 0,
    paymentPlan: { type: 'full' }, approvalStatus: 'approved', docLanguage: 'en',
  };
  const withEn = buildQuotationMasterModelFromQuote(quote, {
    company: { legalNameTh: 'บริษัท ทดสอบ จำกัด', legalNameEn: 'TEST CO., LTD.', address: '1 ถนนไทย', addressEn: '1 Thai Road' },
  });
  assert.equal(withEn.company.addressEn, '1 Thai Road');
  assert.equal(withEn.company.address, '1 ถนนไทย', 'คีย์ address ต้องยังเป็นไทยจริง ๆ ไม่ถูกสลับค่า');

  const withoutEn = buildQuotationMasterModelFromQuote(quote, {
    company: { legalNameTh: 'บริษัท ทดสอบ จำกัด', address: '1 ถนนไทย' },
  });
  assert.equal(withoutEn.company.addressEn, '');
});

// ── เอกสารอ้างอิง (mig 0267) ────────────────────────────────────────────────
// ข้อความอิสระที่คนทำใบพิมพ์เอง — ไม่ผูกกับเอกสารจริงในระบบ (มติผู้ใช้ 2026-08-17)
test('เอกสารอ้างอิง: กรอกแล้วขึ้นเป็นแถวในบล็อกอ้างอิง', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    referenceNote: 'อ้างถึง PO-1234 ลว. 5 ส.ค. 69',
  });
  assert.equal(refRow(model, 'เอกสารอ้างอิง'), 'อ้างถึง PO-1234 ลว. 5 ส.ค. 69');
});

// ไม่กรอก = ไม่มีแถว ไม่ใช่แถวที่ค่าเป็น '-' — บล็อกอ้างอิงมีที่จำกัด อย่าใส่แถวเปล่า
test('เอกสารอ้างอิง: ไม่กรอก (หรือเว้นวรรคล้วน) = ตัดแถวทิ้ง', () => {
  assert.equal(refRow(buildQuotationMasterModelFromQuote(QUOTE_WITH_PROJECT), 'เอกสารอ้างอิง'), undefined);
  const blank = buildQuotationMasterModelFromQuote({ ...QUOTE_WITH_PROJECT, referenceNote: '   ' });
  assert.equal(refRow(blank, 'เอกสารอ้างอิง'), undefined);
});

/* ชื่อหมวดสินค้าบนบรรทัดรหัส · แบรนด์ (มติผู้ใช้ 2026-09-22) — ตัวแบ่งหน้าต้องนับบรรทัดที่
   ยาวขึ้นด้วย ไม่งั้นประเมินแถวเตี้ยกว่าจริงแล้วตารางล้นขอบล่างของแผ่นเงียบ ๆ */
test('ชื่อหมวดยาวจนบรรทัดรหัสตัดสองบรรทัด ⇒ หน้าหนึ่งรับรายการได้น้อยลง', () => {
  const mk = (category) => Array.from({ length: 40 }, (_, index) => ({
    id: `L${index}`, fgCode: 'FG-AAA-01-002-0001', brand: 'SCENT AND SENSE', category, description: 'สินค้าทดสอบ',
  }));
  const short = paginateQuotationMasterLines(mk(''), { mode: 'fill' });
  const long = paginateQuotationMasterLines(mk('ผลิตภัณฑ์ปรับอากาศชนิดก้านไม้หอมกระจายกลิ่น'), { mode: 'fill' });
  assert.ok(long[0].length < short[0].length, `มีหมวด ${long[0].length} ต้องน้อยกว่าไม่มี ${short[0].length}`);
  assert.deepEqual(lineIdentityParts({ fgCode: 'FG-1', brand: '', category: 'น้ำหอม' }), ['FG-1', 'น้ำหอม']);
});

test('model ของใบ: หมวดตามภาษาของใบ ถอยไปไทยเมื่อไม่มีคู่อังกฤษ', () => {
  const quote = (docLanguage, metadata) => ({ docLanguage, lines: [{ id: 'L1', fgCode: 'FG-1', description: 'x', metadata }] });
  assert.equal(buildQuotationMasterModelFromQuote(quote('th', { categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' })).lines[0].category, 'น้ำหอม');
  assert.equal(buildQuotationMasterModelFromQuote(quote('en', { categoryName: 'น้ำหอม', categoryNameEn: 'Perfume' })).lines[0].category, 'Perfume');
  assert.equal(buildQuotationMasterModelFromQuote(quote('en', { categoryName: 'น้ำหอม' })).lines[0].category, 'น้ำหอม');
  assert.equal(buildQuotationMasterModelFromQuote(quote('th', {})).lines[0].category, '');
});

test('บรรทัดเพิ่มเอง (ไม่มีรหัส FG) พิมพ์หมวดที่เลือกไว้บนบรรทัดเล็กเหนือรายละเอียด (มติ 2026-09-27)', () => {
  const quote = { docLanguage: 'en', lines: [{ id: 'L1', fgCode: null, description: 'ค่าติดตั้ง', metadata: { categoryCode: '02-001', categoryName: 'บริการ', categoryNameEn: 'Service' } }] };
  const [line] = buildQuotationMasterModelFromQuote(quote).lines;
  assert.equal(line.category, 'Service');
  assert.deepEqual(lineIdentityParts(line), ['Service']);
});

/* ⭐ ใบที่ถูกยกเลิก (ปุ่มยกเลิกใบของผู้อนุมัติ มติ 24/09 · หรือ SO ย้อน Won ตาม 0116) พิมพ์ซ้ำได้
   แต่ต้องมีลายน้ำ "ยกเลิก" เสมอ — ฉบับตรึงล่าสุดถูกตอบ 409 แล้วปุ่มพิมพ์ตกมาเรนเดอร์สดที่นี่
   🐞 เดิมใบที่ยกเลิกหลังอนุมัติพิมพ์ออกมา **สะอาด** (ไม่มีลายน้ำ) เหมือนใบที่ใช้ได้ */
test('ใบที่ยกเลิกแล้วพิมพ์สดมีลายน้ำ "ยกเลิก" ทุกสถานะอนุมัติ และตามภาษาของใบ', () => {
  const base = {
    quoteNumber: 'QT-26090001-0', lines: [], subtotal: 0, vatRate: 7, vatAmount: 0, totalAmount: 0,
    paymentPlan: { type: 'full' }, status: 'cancelled',
  };
  for (const approvalStatus of ['approved', 'pending', 'not_submitted', 'not_required']) {
    const model = buildQuotationMasterModelFromQuote({ ...base, approvalStatus });
    assert.equal(model.watermark, 'ยกเลิก', approvalStatus);
  }
  assert.equal(
    buildQuotationMasterModelFromQuote({ ...base, approvalStatus: 'approved', docLanguage: 'en' }).watermark,
    'CANCELLED',
  );
  // ใบที่ยังใช้ได้ไม่เปลี่ยน
  assert.equal(buildQuotationMasterModelFromQuote({ ...base, status: 'sent', approvalStatus: 'approved' }).watermark, '');
  assert.equal(buildQuotationMasterModelFromQuote({ ...base, status: 'draft', approvalStatus: 'pending' }).watermark, 'ฉบับร่าง');
});

// ══ เลขแพ็คต่อเดือนในโมเดลและตัวแบ่งหน้า (มติเจ้าของ 08/10 · mig 0407 · docs/qt-pack-column.md) ═══════════════════

/* คีย์ของบรรทัดในโมเดล ณ ก่อนเพิ่มเลขแพ็ค — บรรทัดที่ไม่มีเลขแพ็คต้องมีคีย์ชุดนี้เป๊ะ ไม่มีคีย์ packQty แม้เป็น null */
const MODEL_LINE_KEYS = ['id', 'fgCode', 'brand', 'category', 'description', 'note', 'qty', 'unit', 'unitPrice', 'discountAmount', 'lineTotal'];
const NOT_A_PACK = [null, undefined, '', '   ', 'abc', 0, '0', '02', 1.5, 10000, true];

test('โมเดล: คีย์ packQty มีเฉพาะบรรทัดที่มีเลขแพ็คที่ใช้ได้ (ต่อท้ายสุด เป็นตัวเลข) — บรรทัดอื่นคีย์ชุดเดิม', () => {
  const line = { id: 'L1', fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น', qty: 12, unit: 'เดือน', unitPrice: 3500, lineTotal: 84000 };
  const modelLine = (over) => buildQuotationMasterModelFromQuote({ lines: [{ ...line, ...over }] }).lines[0];
  assert.deepEqual(Object.keys(modelLine({})), MODEL_LINE_KEYS);
  for (const value of NOT_A_PACK) {
    assert.deepEqual(Object.keys(modelLine({ packQty: value })), MODEL_LINE_KEYS, `packQty=${JSON.stringify(value) ?? 'undefined'}`);
    assert.deepEqual(modelLine({ packQty: value }), modelLine({}), `packQty=${JSON.stringify(value) ?? 'undefined'}`);
  }
  for (const [value, expected] of [[2, 2], ['2', 2], [' 2 ', 2], [1, 1], [9999, 9999]]) {
    const built = modelLine({ packQty: value });
    assert.deepEqual(Object.keys(built), [...MODEL_LINE_KEYS, 'packQty']);
    assert.equal(built.packQty, expected);
    // คีย์อื่นของบรรทัดไม่ขยับ — จำนวนยังเป็นจำนวนเดือน ราคา/ยอดตามที่เก็บ
    const { packQty: _pack, ...rest } = built;
    assert.deepEqual(rest, modelLine({}));
  }
});

test('โมเดล: หน่วยของบรรทัดที่มีเลขแพ็คคือเดือนตามภาษาของใบ ไม่ว่าหน่วยที่เก็บเป็นอะไร — บรรทัดที่ไม่มีเลขแพ็คได้หน่วยเดิม', () => {
  const unitOf = (docLanguage, over) => buildQuotationMasterModelFromQuote({ docLanguage, lines: [{ id: 'L1', description: 'x', qty: 12, ...over }] }).lines[0].unit;
  for (const stored of ['แพ็คเกจ', 'กิโลกรัม', 'ชิ้น', 'เดือน', '', null, undefined]) {
    assert.equal(unitOf('th', { unit: stored, packQty: 2 }), 'เดือน', `th · ${stored}`);
    assert.equal(unitOf('en', { unit: stored, packQty: 2 }), 'Month', `en · ${stored}`);
  }
  // ไม่มีเลขแพ็ค (รวมค่าที่ไม่ใช่เลขแพ็ค) = พฤติกรรมเดิม: หน่วยที่เก็บ แปลตามภาษา · ไม่มีหน่วย = ชิ้น
  for (const value of [undefined, null, '', 'abc', 0]) {
    assert.equal(unitOf('th', { unit: 'แพ็คเกจ', packQty: value }), 'แพ็คเกจ');
    assert.equal(unitOf('en', { unit: 'แพ็คเกจ', packQty: value }), 'Package');
    assert.equal(unitOf('th', { unit: 'กิโลกรัม', packQty: value }), 'กิโลกรัม');
    assert.equal(unitOf('th', { packQty: value }), 'ชิ้น');
    assert.equal(unitOf('en', { packQty: value }), 'Piece');
  }
});

test('ITEM_TEXT_CHARS: สี่ชุดตามที่วัดไว้ และแก้ค่าในหน่วยความจำไม่ได้', () => {
  // ⛔ base = ค่าที่ใบเดิมทุกใบใช้แบ่งหน้า (54 · 48 · 54 มาตั้งแต่ก่อนมีคอลัมน์แพ็ค) — เปลี่ยน = ใบเดิมถูกแบ่งหน้าใหม่
  // สามชุดของใบแพ็ค + ส่วนลด = วัดกับข้อความจริงทุกบรรทัดในฐาน 2026-10-09 (ดูบันทึกเหนือ V4_SAFETY) — ลดได้อย่างเดียว
  assert.deepEqual(ITEM_TEXT_CHARS, {
    base: { identity: 54, name: 48, note: 54 },
    packDiscountTh: { identity: 52, name: 44, note: 50 },
    packDiscountEn: { identity: 50, name: 41, note: 44 },
    packDiscount: { identity: 43, name: 36, note: 40 },
  });
  assert.ok(Object.isFrozen(ITEM_TEXT_CHARS));
  for (const profile of Object.values(ITEM_TEXT_CHARS)) assert.ok(Object.isFrozen(profile));
  for (const key of ['identity', 'name', 'note']) {
    // ช่องแคบกว่าต้องประเมินตัวอักษรต่อบรรทัดน้อยกว่า: เดิม > ใบไทย ≥ ใบอังกฤษ > คอลัมน์ถูกดันกว้าง
    assert.ok(ITEM_TEXT_CHARS.base[key] > ITEM_TEXT_CHARS.packDiscountTh[key], key);
    // ⚠️ ข้อนี้คือเหตุที่ "ไม่ส่งภาษา = ชุดของใบอังกฤษ" ปลอดภัย: ชุดอังกฤษต้องไม่มากกว่าชุดไทยสักช่อง
    assert.ok(ITEM_TEXT_CHARS.packDiscountTh[key] >= ITEM_TEXT_CHARS.packDiscountEn[key], key);
    assert.ok(ITEM_TEXT_CHARS.packDiscountEn[key] > ITEM_TEXT_CHARS.packDiscount[key], key);
  }
});

test('PACK_DISCOUNT_MEASURED_UNITS: รายการหน่วยที่วัดแล้ว — คำไทยกับคำอังกฤษคู่กันตามตารางแปลของหน่วยขาย', () => {
  /* ⛔ จะเติมคำ ต้องวัดคอลัมน์หน่วยของตารางแพ็ค + ส่วนลดใน Chrome ก่อน (ช่องรายละเอียดต้องไม่แคบกว่า 73.64mm บนใบไทย /
     69.75mm บนใบอังกฤษ) — คำที่ไม่อยู่ในรายการทำให้ใบใช้ชุดแคบสุด ซึ่งปลอดภัยอยู่แล้ว */
  assert.deepEqual(PACK_DISCOUNT_MEASURED_UNITS, {
    th: ['ชิ้น', 'กิโลกรัม', 'เดือน', 'แพ็คเกจ', 'งาน', 'ชุด', 'เล่ม', 'ขวด', 'หลอด', 'กล่อง', 'Kg', 'ครั้ง'],
    en: ['Piece', 'Kilogram', 'Month', 'Package', 'Job', 'Set', 'Book', 'Bottle', 'Tube', 'Box', 'Kg', 'Time'],
  });
  assert.ok(Object.isFrozen(PACK_DISCOUNT_MEASURED_UNITS) && Object.isFrozen(PACK_DISCOUNT_MEASURED_UNITS.th) && Object.isFrozen(PACK_DISCOUNT_MEASURED_UNITS.en));
  // คำอังกฤษ = คำที่ใบอังกฤษพิมพ์จริงของคำไทยตำแหน่งเดียวกัน (saleUnitLabel) — ไม่ใช่คำที่พิมพ์ขึ้นเอง
  PACK_DISCOUNT_MEASURED_UNITS.th.forEach((unit, index) => {
    assert.ok(Object.hasOwn(SALE_UNIT_EN, unit), `${unit} ต้องเป็นหน่วยของ units.js`);
    assert.equal(saleUnitLabel(unit, 'en'), PACK_DISCOUNT_MEASURED_UNITS.en[index], unit);
  });
  // หน่วยของบรรทัดที่มีเลขแพ็ค (เดือน / Month) ต้องอยู่ในรายการเสมอ — ไม่งั้นใบแพ็ค + ส่วนลดทุกใบตกไปชุดแคบสุด
  assert.ok(PACK_DISCOUNT_MEASURED_UNITS.th.includes(PACK_LINE_UNIT));
  assert.ok(PACK_DISCOUNT_MEASURED_UNITS.en.includes(saleUnitLabel(PACK_LINE_UNIT, 'en')));
});

test('itemTextChars: ใบที่ไม่มีทั้งคอลัมน์แพ็คและคอลัมน์ส่วนลดรายบรรทัดพร้อมกัน = ชุดเดิมเสมอ ไม่ว่าภาษาไหน — ตัดสินทั้งใบ', () => {
  const plain = { id: 'a', qty: 1 };
  const discount = { id: 'b', qty: 1, discountAmount: 100 };
  const pack = { id: 'c', qty: 12, packQty: 2 };
  // ตัวเลขยาวและหน่วยแปลก ๆ ไม่เกี่ยวกับใบเหล่านี้ — กติกาใหม่ใช้กับใบแพ็ค + ส่วนลดเท่านั้น (ใบจริงทุกใบวันนี้อยู่กลุ่มนี้)
  const wide = { id: 'w', qty: 1234567.25, unit: 'ตารางเมตรต่อเดือน', unitPrice: 98765432.1, lineTotal: 9876543210 };
  for (const language of [undefined, 'th', 'en']) {
    assert.equal(itemTextChars(undefined, language), ITEM_TEXT_CHARS.base);
    assert.equal(itemTextChars([], language), ITEM_TEXT_CHARS.base);
    assert.equal(itemTextChars([plain, plain, wide], language), ITEM_TEXT_CHARS.base, 'ไม่มีทั้งสองอย่าง');
    assert.equal(itemTextChars([plain, discount, wide], language), ITEM_TEXT_CHARS.base, 'ส่วนลดอย่างเดียว = ใบเดิม');
    assert.equal(itemTextChars([plain, pack, wide], language), ITEM_TEXT_CHARS.base, 'แพ็คอย่างเดียว = ช่องรายละเอียดยังกว้างพอ');
    // ค่าที่ไม่ใช่เลขแพ็ค (รวม null ที่ select * คืนทุกบรรทัดหลังรัน 0407) ไม่ทำให้ใบที่มีส่วนลดเปลี่ยนชุด
    for (const value of NOT_A_PACK) {
      assert.equal(itemTextChars([{ ...discount, packQty: value }, { ...plain, packQty: value }, wide], language), ITEM_TEXT_CHARS.base, `packQty=${JSON.stringify(value) ?? 'undefined'}`);
    }
  }
});

test('itemTextChars: ใบแพ็ค + ส่วนลดที่ไม่มีคอลัมน์ไหนถูกดันกว้าง เลือกชุดตามภาษาของใบ — ไม่ส่งภาษา = ชุดของใบอังกฤษ (แคบกว่า)', () => {
  const plain = { id: 'a', qty: 1 };
  const discount = { id: 'b', qty: 1, discountAmount: 100 };
  const pack = { id: 'c', qty: 12, packQty: 2 };
  const both = { id: 'd', qty: 12, packQty: 2, discountAmount: 100 };
  assert.equal(itemTextChars([both], 'th'), ITEM_TEXT_CHARS.packDiscountTh);
  assert.equal(itemTextChars([both], 'en'), ITEM_TEXT_CHARS.packDiscountEn);
  assert.equal(itemTextChars([plain, pack, discount], 'th'), ITEM_TEXT_CHARS.packDiscountTh, 'แพ็คกับส่วนลดอยู่คนละบรรทัดก็นับ — คอลัมน์เป็นของทั้งใบ');
  assert.equal(itemTextChars([plain, pack, discount], 'en'), ITEM_TEXT_CHARS.packDiscountEn);
  // ลืมส่งภาษา หรือส่งค่าที่ไม่ใช่ 'th' ตรงตัว = ชุดของใบอังกฤษ — เปลืองหน้าได้ แต่ไม่มีวันประเมินแถวเตี้ยกว่าจริง
  for (const language of [undefined, null, '', 'TH', 'Th', 'jp', 0, true]) {
    assert.equal(itemTextChars([both], language), ITEM_TEXT_CHARS.packDiscountEn, `language=${JSON.stringify(language) ?? 'undefined'}`);
  }
});

test('itemTextChars: ใบแพ็ค + ส่วนลดที่มีคอลัมน์ถูกดันกว้าง = ชุดแคบสุด — ขอบของแต่ละช่องตามที่วัด และบรรทัดไหนของใบก็นับ', () => {
  const service = (over = {}) => ({ id: 's', packQty: 2, qty: 12, unit: 'เดือน', unitPrice: 3500, discountAmount: 7200, lineTotal: 76800, ...over });
  const goods = (over = {}) => ({ id: 'g', qty: 552, unit: 'ชิ้น', unitPrice: 185, discountAmount: 0, lineTotal: 102120, ...over });
  const NOMINAL = ITEM_TEXT_CHARS.packDiscountTh;
  const WIDE = ITEM_TEXT_CHARS.packDiscount;
  assert.equal(itemTextChars([service(), goods()], 'th'), NOMINAL);
  // [ค่าที่ยังอยู่ในคอลัมน์, ค่าแรกที่ดันคอลัมน์] ของแต่ละช่อง — ข้อความที่พิมพ์: 99,999 · 999,999.99 · -99,999.99 · 9,999,999.99
  const EDGES = [
    ['qty', 99999, 100000],
    ['qty', 999.75, 9999.5],            // ทศนิยมทำให้ข้อความยาวขึ้นโดยตัวเลขไม่ถึงแสน (9,999.5 = 7 ตัวอักษร)
    ['unitPrice', 999999.99, 1000000],
    ['unitPrice', -99999.99, -999999.99], // ขีดลบกินที่หนึ่งตัวอักษร: -999,999.99 = 11 ตัวอักษร เกินคอลัมน์ทั้งที่ยังไม่ถึงล้าน
    ['discountAmount', 99999.99, 100000],
    ['lineTotal', 9999999.99, 10000000],
  ];
  for (const [key, fits, widens] of EDGES) {
    for (const make of [service, goods]) {
      // ช่องส่วนลดของบรรทัดที่ไม่ได้ลด (goods) พิมพ์ขีด — ต้องมีส่วนลดจริงถึงจะมีข้อความให้ดัน
      assert.equal(itemTextChars([service(), make({ [key]: fits })], 'th'), NOMINAL, `${key}=${fits} ยังอยู่ในคอลัมน์`);
      assert.equal(itemTextChars([service(), make({ [key]: widens })], 'th'), WIDE, `${key}=${widens} ดันคอลัมน์`);
      assert.equal(itemTextChars([make({ [key]: widens }), service()], 'en'), WIDE, `${key}=${widens} ดันคอลัมน์ (ใบอังกฤษ · บรรทัดแรก)`);
    }
  }
  // เลขแพ็คสูงสุดของช่อง (9,999) ไม่ดันคอลัมน์ของตัวเอง
  assert.equal(itemTextChars([service({ packQty: 9999 }), goods()], 'th'), NOMINAL);
  // หน่วย: คำในรายการที่วัดของภาษานั้น = ชุดของภาษานั้น · ไม่มีหน่วย (ตัวพิมพ์พิมพ์ขีด) ก็ไม่ดันอะไร
  for (const unit of PACK_DISCOUNT_MEASURED_UNITS.th) assert.equal(itemTextChars([service(), goods({ unit })], 'th'), NOMINAL, unit);
  for (const unit of PACK_DISCOUNT_MEASURED_UNITS.en) {
    assert.equal(itemTextChars([service({ unit: 'Month' }), goods({ unit })], 'en'), ITEM_TEXT_CHARS.packDiscountEn, unit);
  }
  for (const unit of [undefined, null, '', '   ']) {
    assert.equal(itemTextChars([service(), goods({ unit })], 'th'), NOMINAL, `unit=${JSON.stringify(unit) ?? 'undefined'}`);
    assert.equal(itemTextChars([service({ unit })], 'en'), ITEM_TEXT_CHARS.packDiscountEn, `unit=${JSON.stringify(unit) ?? 'undefined'}`);
  }
  assert.equal(itemTextChars([service(), goods({ unit: ' แพ็คเกจ ' })], 'th'), NOMINAL, 'ช่องว่างหัวท้ายไม่นับ (ตัวพิมพ์ตัดทิ้งเหมือนกัน)');
  // หน่วยนอกรายการ = ยังไม่รู้ความกว้าง ⇒ ชุดแคบสุด: คำที่คนพิมพ์เอง · คำอังกฤษบนใบไทย · คำไทยที่ไม่ถูกแปลบนใบอังกฤษ
  for (const unit of ['แพ็ค', 'โหล', 'ตารางเมตร', 'Kilogram', 'Month', 'ชิ้น/เดือน']) {
    assert.equal(itemTextChars([service(), goods({ unit })], 'th'), WIDE, `ใบไทย · ${unit}`);
  }
  for (const unit of ['เดือน', 'แพ็คเกจ', 'แพ็ค', 'Kilograms', 'kilogram']) {
    assert.equal(itemTextChars([service({ unit: 'Month' }), goods({ unit })], 'en'), WIDE, `ใบอังกฤษ · ${unit}`);
  }
});

test('ตัวแบ่งหน้า: ใบแพ็ค + ส่วนลดประเมินแถวตามชุดของตัวเอง — ชื่อ 42 ตัวอักษร = 1 บรรทัดบนใบไทย แต่ 2 บรรทัดบนใบอังกฤษและใบที่คอลัมน์ถูกดัน', () => {
  /* 20 บรรทัด: แถวที่ชื่ออยู่ในบรรทัดเดียว = 3 หน่วย ⇒ หน้าแรก (30 หน่วย) รับ 10 แถว · ชื่อสองบรรทัด = 4 หน่วย ⇒ รับ 7 แถว
     ชื่อ 42 ตัวอักษร: เดิม 48 ✓ · ไทย 44 ✓ · อังกฤษ 41 ✗ · แคบสุด 36 ✗     ชื่อ 45 ตัวอักษร: เดิม 48 ✓ · นอกนั้น ✗ */
  const lines = (nameLength, first, last = {}) => Array.from({ length: 20 }, (_, index) => ({
    id: `L${index}`, fgCode: 'FG-1', description: 'x'.repeat(nameLength), qty: 12,
    ...(index === 0 ? first : {}), ...(index === 19 ? last : {}),
  }));
  const firstPage = (list, language) => paginateQuotationMasterLines(list, { mode: 'fill', language })[0].length;
  const both = { packQty: 2, discountAmount: 100 };
  for (const language of [undefined, 'th', 'en']) {
    for (const nameLength of [42, 45]) {
      assert.equal(firstPage(lines(nameLength, {}), language), 10, 'ไม่มีทั้งสองคอลัมน์ = เดิม');
      assert.equal(firstPage(lines(nameLength, { discountAmount: 100 }), language), 10, 'ส่วนลดอย่างเดียว = เดิม (ห้ามขยับใบจริงที่มีส่วนลด)');
      assert.equal(firstPage(lines(nameLength, { packQty: 2 }), language), 10, 'แพ็คอย่างเดียว = ชุดเดิม');
      for (const value of NOT_A_PACK) {
        assert.equal(firstPage(lines(nameLength, { packQty: value, discountAmount: 100 }), language), 10, `packQty=${JSON.stringify(value) ?? 'undefined'} ไม่ใช่เลขแพ็ค = เดิม`);
      }
    }
  }
  // 🐞 ตรวจ 2026-10-09: ใบไทยที่ไม่มีคอลัมน์ถูกดันต้องไม่ถูกนับด้วยชุดแคบสุด (เดิมได้ 7 แถว ทั้งที่แถวสูงเท่าใบเดิม)
  assert.equal(firstPage(lines(42, both), 'th'), 10, 'ใบไทย: ชื่อ 42 ตัวอักษรอยู่ในบรรทัดเดียว');
  assert.equal(firstPage(lines(42, both), 'en'), 7, 'ใบอังกฤษ: ช่องแคบกว่า 2.1mm ขึ้นไป');
  assert.equal(firstPage(lines(42, both)), 7, 'ไม่ส่งภาษา = ชุดของใบอังกฤษ');
  assert.equal(firstPage(lines(42, { ...both, unitPrice: 1000000 }), 'th'), 7, 'ใบไทยที่ราคา/หน่วยดันคอลัมน์ = ชุดแคบสุด');
  assert.equal(firstPage(lines(38, both), 'en'), 10, 'ใบอังกฤษ: ชื่อ 38 ตัวอักษรอยู่ในบรรทัดเดียว');
  assert.equal(firstPage(lines(38, { ...both, unitPrice: 1000000 }), 'en'), 7, 'ใบอังกฤษที่ราคา/หน่วยดันคอลัมน์ = ชุดแคบสุด (36)');
  assert.equal(firstPage(lines(45, both), 'th'), 7, 'ชื่อ 45 ตัวอักษรเกินชุดของใบไทย (44)');
  assert.equal(firstPage(lines(42, { packQty: 2 }, { discountAmount: 100 }), 'en'), 7, 'แพ็คบรรทัดแรก ส่วนลดบรรทัดสุดท้าย (คนละหน้า) ก็ชุดของใบแพ็ค + ส่วนลด — ตัดสินทั้งใบ');
  assert.equal(firstPage(lines(42, both, { lineTotal: 10000000 }), 'th'), 7, 'ตัวเลขที่ดันคอลัมน์อยู่บรรทัดสุดท้าย (คนละหน้า) ก็นับ — ตัดสินทั้งใบ');
  // ไม่มีบรรทัดหาย ไม่สลับลำดับ ไม่ว่าชุดไหน
  for (const [list, language] of [[lines(42, both), 'th'], [lines(42, both), 'en'], [lines(42, { ...both, unitPrice: 1000000 }), 'th']]) {
    const pages = paginateQuotationMasterLines(list, { mode: 'fill', language });
    assert.deepEqual(pages.flat().map((line) => line.id), Array.from({ length: 20 }, (_, index) => `L${index}`));
  }
  // โหมด balanced (แม่แบบ V1–V3 ของหน้าพรีวิว) เดินชุดเดียวกัน — ชุดที่แคบกว่าต้องไม่ได้หน้าน้อยกว่าชุดเดิม
  const balanced = (list, language) => paginateQuotationMasterLines(list, { mode: 'balanced', language }).length;
  assert.ok(balanced(lines(45, both), 'th') > balanced(lines(45, { discountAmount: 100 }), 'th'));
  assert.equal(balanced(lines(42, both), 'th'), balanced(lines(42, { discountAmount: 100 }), 'th'), 'ใบไทย ชื่อ 42 ตัวอักษร = จำนวนหน้าเท่าใบส่วนลดอย่างเดียว');
  assert.ok(balanced(lines(42, both), 'en') > balanced(lines(42, { discountAmount: 100 }), 'en'));
});

test('ตัวแบ่งหน้า: กลุ่มท้ายเอกสารคิดที่ว่างของหน้าสุดท้ายด้วยชุดเดียวกับที่แบ่งหน้า (ใบแพ็ค + ส่วนลดบรรทัดเดียว)', () => {
  /* ใบบรรทัดเดียว ชื่อ 45 ตัวอักษร: ชุด base แถว 3 หน่วย ⇒ ที่ว่าง 30 − 7 − 3 = 20 พอสำหรับกลุ่มท้าย (19.2) ⇒ หน้าเดียว
     ชุดของใบแพ็ค + ส่วนลด (ไทย 44) แถว 4 หน่วย ⇒ ที่ว่าง 19 ไม่พอ ⇒ กลุ่มท้ายได้หน้าของตัวเอง — ถ้าตรงนี้ยังคิดด้วยชุดเดิม
     กลุ่มท้ายจะถูกวางต่อท้ายตารางที่สูงกว่าที่ประเมิน แล้วล้นขอบล่างของแผ่น */
  const quote = (over, docLanguage) => ({
    quoteNumber: 'QT-26100001-0', customerName: 'ลูกค้า', billingAddress: 'ที่อยู่', subtotal: 1000, vatRate: 7, vatAmount: 70, totalAmount: 1070,
    paymentPlan: { type: 'full', paymentMethod: 'โอน' }, paymentTerms: 'เครดิต 30 วัน', notes: 'หมายเหตุ', ...(docLanguage ? { docLanguage } : {}),
    lines: [{ id: 'L1', fgCode: 'FG-1', description: 'x'.repeat(45), qty: 12, unitPrice: 100, lineTotal: 1000, ...over }],
  });
  const kinds = (over, docLanguage) => buildQuotationMasterModelFromQuote(quote(over, docLanguage)).pages.map((page) => [page.kind, page.lines.length]);
  assert.deepEqual(kinds({}), [['combined', 1]]);
  assert.deepEqual(kinds({ discountAmount: 100 }), [['combined', 1]], 'ส่วนลดอย่างเดียว = เดิม');
  assert.deepEqual(kinds({ packQty: 2 }), [['combined', 1]], 'แพ็คอย่างเดียว = ชุดเดิม');
  assert.deepEqual(kinds({ packQty: 2, discountAmount: 100 }), [['items', 1], ['payment', 0]]);
  /* ภาษาของใบต้องไปถึง **ทั้งสองจังหวะ** (แบ่งหน้า + กลุ่มท้าย): ชื่อ 42 ตัวอักษร = 1 บรรทัดบนใบไทย (44) ⇒ หน้าเดียว
     แต่ 2 บรรทัดบนใบอังกฤษ (41) ⇒ กลุ่มท้ายได้หน้าของตัวเอง — จังหวะไหนลืมส่งภาษา ใบไทยจะตกไปชุดอังกฤษแล้วได้สองแผ่น */
  const name42 = { description: 'x'.repeat(42), packQty: 2, discountAmount: 100 };
  assert.deepEqual(kinds(name42), [['combined', 1]], 'ใบไทย (ไม่ระบุภาษา = ไทย)');
  assert.deepEqual(kinds(name42, 'th'), [['combined', 1]]);
  assert.deepEqual(kinds(name42, 'en'), [['items', 1], ['payment', 0]]);
  assert.deepEqual(kinds({ ...name42, unitPrice: 1000000 }, 'th'), [['items', 1], ['payment', 0]], 'ราคา/หน่วยดันคอลัมน์ = ชุดแคบสุด');
});

test('ตัวแบ่งหน้า: ใบบริการบรรทัดเดียวแบบที่ออกจริง (บรรทัดรหัส 52 ตัวอักษร · ชื่อ 43 ตัวอักษร · ลดเป็นบาท) อยู่แผ่นเดียวเหมือนใบที่ไม่มีคอลัมน์แพ็ค', () => {
  /* 🐞 ตรวจ 2026-10-09 (paper-01): ใบนี้พิมพ์แถวสูง 53px เท่ากันทั้งสี่ทรง แต่ชุดแคบสุด (43 · 36) นับบรรทัดรหัสและชื่อเป็น
     อย่างละสองบรรทัด ⇒ กลุ่มท้ายถูกดันไปแผ่นที่สอง ทั้งที่แผ่นแรกเหลือที่ 437px
     ⚠️ บรรทัดรหัสของใบนี้ยาว 52 ตัวอักษรพอดีค่าของชุดไทย — ลดค่านั้นลงแม้ขั้นเดียว ใบนี้กลับไปเป็นสองแผ่น */
  const line = {
    id: 'L1', fgCode: 'FG-364-02-001-1061', metadata: { productBrand: 'SCENT & SENSE', categoryName: 'ระบบกระจายกลิ่น', categoryNameEn: 'Scent System' },
    description: 'ระบบกระจายกลิ่น Signature Lobby · 1 package', qty: 12, unit: 'แพ็คเกจ', unitPrice: 3500,
  };
  const quote = (over, docLanguage = 'th') => ({
    quoteNumber: 'QT-26100001-0', customerName: 'ลูกค้า', billingAddress: 'ที่อยู่', vatRate: 7, docLanguage,
    paymentPlan: { type: 'full', paymentMethod: 'โอน' }, paymentTerms: 'เครดิต 30 วัน', notes: 'หมายเหตุ',
    lines: [{ ...line, lineTotal: 42000, ...over }],
  });
  const model = (over, docLanguage) => buildQuotationMasterModelFromQuote(quote(over, docLanguage));
  const kinds = (over, docLanguage) => model(over, docLanguage).pages.map((page) => [page.kind, page.lines.length]);
  const identity = lineIdentityParts(model({}).lines[0]).join(' · ');
  assert.equal(identity, 'FG-364-02-001-1061 · SCENT & SENSE · ระบบกระจายกลิ่น');
  assert.equal(identity.length, 52);
  assert.equal(line.description.length, 43);
  const packed = { packQty: 2, discountType: 'amount', discountValue: 7200, discountAmount: 7200, lineTotal: 76800 };
  assert.deepEqual(kinds({}), [['combined', 1]], 'ไม่มีทั้งสองคอลัมน์');
  assert.deepEqual(kinds({ discountAmount: 7200, lineTotal: 34800 }), [['combined', 1]], 'ส่วนลดอย่างเดียว');
  assert.deepEqual(kinds({ packQty: 2, lineTotal: 84000 }), [['combined', 1]], 'แพ็คอย่างเดียว');
  assert.deepEqual(kinds(packed), [['combined', 1]], 'แพ็ค + ส่วนลด บนใบไทย = แผ่นเดียว');
  assert.equal(itemTextChars(model(packed).lines, 'th'), ITEM_TEXT_CHARS.packDiscountTh);
  // บรรทัดที่มีเลขแพ็คพิมพ์หน่วยเป็นเดือน ⇒ หน่วยที่เก็บ (แพ็คเกจ) ไม่มีผลกับชุด · ใบอังกฤษได้ Month และชุดของใบอังกฤษ
  assert.equal(model(packed).lines[0].unit, 'เดือน');
  assert.equal(itemTextChars(model(packed, 'en').lines, 'en'), ITEM_TEXT_CHARS.packDiscountEn);
  // ใบเดียวกันที่ราคา/หน่วยเจ็ดหลักดันคอลัมน์ = ชุดแคบสุดยังทำงาน (กลุ่มท้ายได้แผ่นของตัวเอง)
  const wide = { ...packed, unitPrice: 1000000, lineTotal: 23992800 };
  assert.equal(itemTextChars(model(wide).lines, 'th'), ITEM_TEXT_CHARS.packDiscount);
  assert.deepEqual(kinds(wide), [['items', 1], ['payment', 0]]);
});

test('ตัวแบ่งหน้า: ผู้เรียกทั้งสองจุดส่งภาษาของใบให้ทั้งตัวแบ่งหน้าและตัวจัดกลุ่มท้าย (ยามซอร์ส)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./quotationMasterTemplate.js', import.meta.url), 'utf8');
  // ตัวอ่านเดียวของชุดตัวอักษร: สองจุดนี้เท่านั้น และทั้งคู่ส่งภาษา
  assert.deepEqual(source.match(/itemTextChars\(.*\);/g), [
    'itemTextChars(lines, language);',
    'itemTextChars(linePages.flat(), language);',
  ]);
  // ใบจริง: ภาษาของใบ (docLanguageOf) ไปทั้งสองจังหวะ · ตัวอย่างของหน้าตั้งค่า: ใบไทยทั้งสองจังหวะ
  assert.match(source, /paginateQuotationMasterLines\(lines, \{ firstCapacity, mode: 'fill', totalsReserve, language \}\);\n  const pages = buildGroupedPages\(\{\n(?:    \w+,\n)+    continuationCapacity: V4_CONTINUATION_CAPACITY,\n    totalsReserve,\n    language,\n  \}\);/);
  assert.equal(source.match(/language: DEFAULT_QUOTATION_DOC_LANGUAGE,/g).length, 2);
  assert.equal(source.match(/buildGroupedPages\(\{/g).length, 3, 'นิยาม 1 + ผู้เรียก 2 — มีผู้เรียกใหม่ต้องส่งภาษาและแก้เทสต์นี้');
  assert.equal(source.match(/paginateQuotationMasterLines\(/g).length, 3, 'นิยาม 1 + ผู้เรียก 2');
});

test('ตัวอย่าง packs: บรรทัดแพ็คคิดเงินสูตรเดียวกับของจริง หน่วยเป็นเดือน · การแบ่งหน้าที่วัดแล้วไม่ล้น', () => {
  const model = buildQuotationMasterPreview('packs', 'approved', 'v4');
  assert.deepEqual(model.lines.map((line) => [line.packQty, line.qty, line.unit, line.unitPrice, line.discountAmount, line.lineTotal]), [
    [2, 12, 'เดือน', 3500, 0, 84000],       // 2 แพ็ค × 12 เดือน × 3,500 (ตัวอย่างของเจ้าของ)
    [1, 12, 'เดือน', 5800, 7200, 62400],    // 1 × 12 × 5,800 − 7,200 (ส่วนลดบาทหักจากยอดทั้งรายการ)
    [undefined, 360, 'ชิ้น', 185, 0, 66600],
    [undefined, 1, 'งาน', 25000, 0, 25000],
  ]);
  assert.deepEqual(model.lines.map((line) => 'packQty' in line), [true, true, false, false]);
  assert.equal(model.totals.subtotal, 238000);
  assert.equal(itemTextChars(model.lines, 'th'), ITEM_TEXT_CHARS.packDiscountTh, 'ตัวอย่างนี้คือใบไทยทรงแพ็ค + ส่วนลด ที่ไม่มีคอลัมน์ไหนถูกดันกว้าง');
  /* การกระจายหน้าของตัวอย่างนี้วัดด้วย Chrome 2026-10-09 (จอและ media print · ใบเสนอราคาและใบสั่งขาย · สามสถานะ):
     ล้น 0px ทุกแผ่น · หัวตาราง 34.33px · ช่องรายละเอียด 74.02mm */
  for (const docType of ['quotation', 'salesOrder']) {
    for (const state of ['draft', 'approved', 'cancelled']) {
      const built = buildQuotationMasterPreview('packs', state, 'v4', docType);
      assert.deepEqual(built.pages.map((page) => [page.kind, page.lines.length]), [['items', 4], ['payment', 0]], `${docType}/${state}`);
    }
  }
});

test('ตัวอย่างเดิมทั้งหกแบบไม่มีเลขแพ็ค — ไม่มีคีย์ packQty และใช้ชุดตัวอักษรเดิม', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS.filter((item) => item.id !== 'packs')) {
    const model = buildQuotationMasterPreview(scenario.id, 'approved', 'v4');
    assert.ok(model.lines.every((line) => !('packQty' in line)), scenario.id);
    assert.equal(itemTextChars(model.lines), ITEM_TEXT_CHARS.base, scenario.id);
  }
  assert.equal(QUOTATION_PREVIEW_SCENARIOS.length, 7);
});

test('ป้ายคอลัมน์แพ็คมีครบทั้งสองภาษา และแปลจริง', () => {
  assert.equal(quotationDocLabels('th').t('packQty'), 'แพ็ค/เดือน');
  assert.equal(quotationDocLabels('en').t('packQty'), 'Pack/Month');
});
