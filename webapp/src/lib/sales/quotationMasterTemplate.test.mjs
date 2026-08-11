import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUOTATION_MASTER_VARIANT,
  QUOTATION_MASTER_TEMPLATE_VERSION,
  QUOTATION_MASTER_TEMPLATE_VERSIONS,
  QUOTATION_PREVIEW_SCENARIOS,
  allocateInstallmentAmounts,
  buildQuotationMasterModelFromQuote,
  buildQuotationMasterPreview,
  controlledFormLine,
  paginateQuotationMasterLines,
} from './quotationMasterTemplate.js';

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
  assert.equal(compact.pages.length, 1, 'a genuinely compact quotation still fits one page');
  assert.equal(compact.pages[0].kind, 'combined');
  assert.equal(compact.pages[0].showPayment, true);
  assert.equal(compact.pages[0].showSignatures, true);
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
    const v3 = buildQuotationMasterPreview(scenario.id, 'approved', 'v3');
    const v4 = buildQuotationMasterPreview(scenario.id, 'approved', 'v4');
    assert.ok(
      v4.pages.length <= v3.pages.length,
      `${scenario.id}: V4 ใช้ ${v4.pages.length} หน้า ต้องไม่มากกว่า V3 ที่ ${v3.pages.length}`,
    );
  }
  // เคสจริงที่ fill-first ช่วยได้: multipage ลดจาก 4 เหลือ 3 หน้า
  assert.equal(buildQuotationMasterPreview('multipage', 'approved', 'v3').pages.length, 4);
  assert.equal(buildQuotationMasterPreview('multipage', 'approved', 'v4').pages.length, 3);
});

test('V4 px-calibrated: หน้าแรกอัดเต็มจริง — แก้บั๊ก "ไม่เต็มหน้าก็ตัดแล้ว" (2026-07-20)', () => {
  // การกระจายหน้าชุดนี้ยืนยันด้วยการวัด DOM จริงแล้วว่าไม่ล้นหน้า (overflow = 0
  // ทุก scenario) และหน้า items เหลือที่ว่างน้อย — ถ้าเทสต์นี้แตกเพราะไปลดความจุ
  // ให้กลับไปอ่านคอมเมนต์ V4_PAGE_UNITS ก่อน: ค่าพวกนี้มาจากการวัด ไม่ใช่เดา
  const expected = {
    compact: [['combined', 1]],
    standard: [['items', 4], ['payment', 0]],
    dense: [['items', 10], ['combined', 1]], // เดิมตัดที่ 6 แถวทั้งที่ใส่ได้ 10
    multipage: [['items', 12], ['items', 14], ['combined', 1]],
    'long-content': [['items', 6], ['payment', 0]], // เดิมผ่าเป็น 3+3 สองหน้า
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
test('โทร: ไม่มี id ให้เทียบ ก็ถอยไปเทียบชื่อผู้จัดทำกับผู้เสนอราคา', () => {
  const meta = { preparedBy: 'คนเดียวกัน', salesOwner: 'คนเดียวกัน' };
  const pinned = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: null,
    createdByPhone: '081-234-5678',
    deal: null,
    metadata: meta,
  });
  assert.equal(refRow(pinned, 'โทร'), '081-234-5678');

  const mismatched = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: null,
    createdByPhone: '081-234-5678',
    deal: null,
    metadata: { ...meta, preparedBy: 'อีกคน' },
  });
  assert.equal(refRow(mismatched, 'โทร'), undefined);
});

// ฉบับที่ตรึงแล้วเก็บชื่อผู้จัดทำไว้ใน metadata (issuedQuotationSnapshot) ไม่มี createdByName
test('ไม่มี createdByName → ผู้จัดทำถอยไปใช้ metadata.preparedBy ของฉบับตรึง', () => {
  const model = buildQuotationMasterModelFromQuote({
    ...QUOTE_WITH_PROJECT,
    createdByName: null,
    metadata: { ...QUOTE_WITH_PROJECT.metadata, preparedBy: 'คนทำใบฉบับตรึง' },
  });
  assert.equal(model.signers[0].name, 'คนทำใบฉบับตรึง');
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

test('หมายเหตุยาวจนกลุ่มท้ายเอกสารเกินหนึ่งหน้า = ผ่าหน้าลงชื่อออกไป ไม่ปล่อยล้น', () => {
  const longRemarks = Array.from({ length: 40 }, (_, index) => `บรรทัดหมายเหตุที่ ${index + 1}`).join('\n');
  const pages = buildQuotationMasterModelFromQuote(quoteWithRemarks(longRemarks)).pages;
  assert.deepEqual(pages.map((page) => page.kind), ['items', 'payment', 'acceptance']);

  const payment = pages.find((page) => page.kind === 'payment');
  const acceptance = pages.find((page) => page.kind === 'acceptance');
  assert.equal(payment.showPayment, true);
  assert.equal(payment.showSignatures, false, 'หน้าที่ล้นแล้วต้องไม่แบกช่องลงชื่อไว้อีก');
  assert.equal(acceptance.showSignatures, true);
  assert.equal(acceptance.showPayment, false);
  // ช่องลงชื่อต้องมีที่เดียวเสมอ ไม่ว่าจะผ่าหรือไม่
  assert.equal(pages.filter((page) => page.showSignatures).length, 1);
});

test('หมายเหตุปกติยังอยู่หน้าเดียวเหมือนเดิม — ห้ามผ่าเพราะเผื่อไว้ก่อน', () => {
  const pages = buildQuotationMasterModelFromQuote(quoteWithRemarks('- ผลิต 45-60 วัน\n- ส่งฟรีในกรุงเทพและปริมณฑล')).pages;
  assert.equal(pages.some((page) => page.kind === 'acceptance'), false);
  const last = pages[pages.length - 1];
  assert.equal(last.showPayment, last.showSignatures, 'กลุ่มท้ายเอกสารต้องอยู่ด้วยกัน');
});
