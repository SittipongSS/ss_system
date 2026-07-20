import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUOTATION_MASTER_VARIANT,
  QUOTATION_MASTER_TEMPLATE_VERSION,
  QUOTATION_MASTER_TEMPLATE_VERSIONS,
  QUOTATION_PREVIEW_SCENARIOS,
  QUOTATION_PREVIEW_STATES,
  allocateInstallmentAmounts,
  buildQuotationMasterPreview,
  buildQuotationPreviewPrintInput,
  controlledFormLine,
  paginateQuotationMasterLines,
} from './quotationMasterTemplate.js';
import { buildQuotePrintHTML } from './quotePrint.js';

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
    'long-content': [['items', 3], ['items', 3], ['payment', 0]],
    installments: [['items', 5], ['payment', 0]],
  };

  for (const [scenarioId, distribution] of Object.entries(expected)) {
    const model = buildQuotationMasterPreview(scenarioId, 'approved', 'v3');
    assert.deepEqual(model.pages.map((page) => [page.kind, page.lines.length]), distribution);
  }
});

// หมายเหตุ Phase 7C (2026-07-21): เทสต์ที่อ่าน CSS/โค้ดของ component
// QuotationMasterDocument ถูกลบพร้อม component (ปลดระวาง renderer แม่แบบแยก) —
// เส้นทางเรนเดอร์จริงย้ายไป quotePrint.js แล้ว (ดู quotePrint.test.mjs สำหรับ
// A4/CSS/ช่องลงชื่อ). buildQuotationMasterPreview ยังอยู่เป็นแหล่งข้อมูล fixture
// ให้ adapter (buildQuotationPreviewPrintInput) + เก็บ pagination V1–V4 ไว้เทียบย้อนหลัง.

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

// ── Phase 7C (Direction A): preview เรนเดอร์ด้วยเครื่องยนต์ใบจริง ──────────────
// adapter fixture→quote ป้อน buildQuotePrintHTML เพื่อ preview = ใบพิมพ์ 100%

test('7C adapter: ทุก scenario แปลงเป็น quote ที่ตัวพิมพ์จริงเรนเดอร์ได้ครบ', () => {
  for (const scenario of QUOTATION_PREVIEW_SCENARIOS) {
    const { quote, options } = buildQuotationPreviewPrintInput(scenario.id, 'approved');
    // จำนวนรายการ + ยอดตรงกับ fixture model
    const model = buildQuotationMasterPreview(scenario.id, 'approved');
    assert.equal(quote.lines.length, model.lines.length, scenario.id);
    assert.deepEqual(quote.lines.map((l) => l.id), model.lines.map((l) => l.id), `${scenario.id}: ลำดับรายการต้องคงเดิม`);
    assert.equal(quote.totalAmount, model.totals.totalAmount, scenario.id);
    // เรนเดอร์ผ่านเครื่องยนต์ใบจริงได้ HTML เต็มใบ มีชื่อลูกค้า + ยอดรวมทั้งสิ้น
    const html = buildQuotePrintHTML(quote, options);
    assert.match(html, /class="sheet explicit-page"/, scenario.id);
    assert.ok(html.includes(model.customer.name), `${scenario.id}: ต้องมีชื่อลูกค้า`);
    assert.match(html, /ยอดรวมทั้งสิ้น/, scenario.id);
  }
});

test('7C adapter: หลายงวด → paymentPlan installment ยอดรวมงวดเท่ายอดเอกสาร', () => {
  const { quote } = buildQuotationPreviewPrintInput('installments', 'approved');
  assert.equal(quote.paymentPlan.type, 'installment');
  assert.ok(quote.paymentPlan.installments.length > 1);
  const sum = quote.paymentPlan.installments.reduce((acc, row) => acc + row.amount, 0);
  assert.equal(sum, quote.totalAmount);
});

test('7C adapter: สถานะเอกสารคุมลายน้ำถูกต้อง (ร่าง/อนุมัติ/ยกเลิก)', () => {
  const draft = buildQuotationPreviewPrintInput('compact', 'draft');
  assert.equal(draft.quote.approvalStatus, 'pending');
  assert.match(buildQuotePrintHTML(draft.quote, draft.options), /class="watermark">ฉบับร่าง/);

  const approved = buildQuotationPreviewPrintInput('compact', 'approved');
  assert.doesNotMatch(buildQuotePrintHTML(approved.quote, approved.options), /class="watermark"/);

  const cancelled = buildQuotationPreviewPrintInput('compact', 'cancelled');
  assert.equal(cancelled.options.watermark, 'ยกเลิก');
  assert.match(buildQuotePrintHTML(cancelled.quote, cancelled.options), /class="watermark">ยกเลิก/);

  // ครอบคลุมทุกสถานะที่ UI มีให้เลือก
  assert.deepEqual(QUOTATION_PREVIEW_STATES.map((s) => s.id), ['draft', 'approved', 'cancelled']);
});

test('7C adapter: หมายเหตุรายบรรทัดไปเป็น metadata.note และเรนเดอร์เป็น line-note', () => {
  const { quote, options } = buildQuotationPreviewPrintInput('standard', 'approved');
  const noted = quote.lines.find((line) => line.metadata?.note);
  assert.ok(noted, 'scenario standard ควรมีรายการที่มีหมายเหตุ');
  const html = buildQuotePrintHTML(quote, options);
  assert.match(html, /class="line-note"/);
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
