// ── แม่แบบสัญญาบริการ — ตรึงข้อความไว้กับต้นฉบับ ────────────────────────
//
// ⭐ เอกสารผูกพันตามกฎหมาย ⇒ เทสต์ชุดนี้ไม่ได้ตรวจ "โค้ดทำงานถูกไหม" แต่ตรวจว่า
//   **ข้อความยังตรงกับต้นฉบับที่ตกลงกันไว้** · แก้ข้อความแล้วเทสต์แดง = ตั้งใจให้แดง
//   คนแก้ต้องมีต้นฉบับใหม่และ bump version ด้วยเสมอ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICE_TEMPLATE } from './contractTemplateService.js';
import { contractTemplate, hasContractTemplate, missingContractFields } from './contractTemplates.js';
import { contractQuotationBlocks, buildContractHTML } from './contractDocument.js';

/* ⚠️ ตรวจ **เนื้อเอกสาร** ไม่ใช่ทั้งไฟล์ — `<style>` มีคอมเมนต์ที่พูดถึง "หมวด"
   และ `<script>` มีชื่อตัวแปรที่บังเอิญตรงคำ ⇒ ตัดออกก่อนเสมอ ไม่งั้นยามจับผิดตัว */
const docBody = (html) => String(html)
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const clauses = SERVICE_TEMPLATE.sections.flatMap((s) => s.clauses);
const byNo = (no) => clauses.find((c) => c.no === no);

test('⭐ สัญญาบริการมีแม่แบบแล้ว — เลิกเป็น null', () => {
  assert.equal(hasContractTemplate('service'), true);
  assert.equal(contractTemplate('service'), SERVICE_TEMPLATE);
  assert.equal(SERVICE_TEMPLATE.version, '20260903');
  assert.equal(SERVICE_TEMPLATE.titleTh, 'สัญญาบริการ');
});

/* 🔴 มติผู้ใช้ 2026-09-03 ข้อ ② — ต้นฉบับรับปาก 30 วันทำการ แล้วปรับที่ 7 วันทำการ
   ⇒ บทลงโทษเริ่มก่อนกำหนดที่รับปาก 23 วัน · ผู้ใช้ชี้ขาดเป็น 3 / 7 */
test('🔴 ข้อ 2.2 — เข้าแก้ไขภายใน 3 วันทำการ ล่าช้าเกิน 7 จึงขยายเวลาให้ฟรี', () => {
  const fix = SERVICE_TEMPLATE.fields.find((f) => f.key === 'fixWorkingDays');
  const late = SERVICE_TEMPLATE.fields.find((f) => f.key === 'lateWorkingDays');
  assert.equal(fix.default, 3);
  assert.equal(late.default, 7);
  assert.ok(fix.default < late.default, 'กำหนดที่รับปากต้องมาก่อนบทลงโทษ ไม่งั้นขัดกันเอง');
  assert.match(byNo('ข้อ 2.2').text, /ภายใน \{\{fixWorkingDays\}\} วันทำการ/);
  assert.match(byNo('ข้อ 2.2').text, /ล่าช้าเกิน \{\{lateWorkingDays\}\} วันทำการ/);
});

/* 🔴 มติข้อ ① — ต้นฉบับเขียนปี 2570 แต่งวดสุดท้ายคือ 2569 ⇒ ห้ามฝังปีตายตัว */
test('🔴 ข้อ 3.1 — วันชำระครบเป็นช่องกรอก ไม่ใช่ปีที่ฝังไว้', () => {
  assert.match(byNo('ข้อ 3.1').text, /\{\{finalPaymentDate\}\}/);
  assert.doesNotMatch(byNo('ข้อ 3.1').text, /25[67]\d/, 'ห้ามมีปีตายตัวในข้อสัญญา');
  const f = SERVICE_TEMPLATE.fields.find((x) => x.key === 'finalPaymentDate');
  assert.equal(f.required, true);
  assert.equal(f.default, undefined, 'ห้ามเดาวันจากข้อมูล — วันที่ของงวดอยู่ในช่อง note ที่เป็นข้อความอิสระ');
});

/* 🔴 มติข้อ ④ — ข้อ 10.3 ของต้นฉบับซ้ำกับข้อ 9 ทุกตัวอักษร */
test('🔴 ตัดข้อ 10.3 ที่ซ้ำกับข้อ 9 ออกแล้ว', () => {
  assert.equal(byNo('ข้อ 10.3'), undefined);
  assert.ok(byNo('ข้อ 9'), 'ข้อ 9 ต้องยังอยู่');
  assert.match(byNo('ข้อ 9').text, /อยู่ใต้บังคับและตีความตามกฎหมายไทย/);
  // ข้อความกฎหมายที่ใช้บังคับต้องปรากฏครั้งเดียวทั้งฉบับ
  const hits = clauses.filter((c) => /ศาลไทยเป็นศาลที่มีเขตอำนาจ/.test(c.text)).length;
  assert.equal(hits, 1);
});

/* 🔴 มติข้อ ③ — ต้นฉบับกรอกสาขาไม่ตรงกันเองสามที่ ⇒ ใช้ช่องเดียวทุกที่ */
test('🔴 สาขาใช้ช่องเดียวทั้งฉบับ — ขัดกันเองไม่ได้', () => {
  const uses = [...SERVICE_TEMPLATE.intro, ...clauses.map((c) => c.text), ...SERVICE_TEMPLATE.closing]
    .filter((t) => /\{\{clientBranch\}\}/.test(String(t)));
  assert.ok(uses.length >= 4, 'ต้องใช้ token สาขาทั้งความนำ · ข้อ 1 · ข้อ 2.1 · ปิดท้าย');
  assert.ok(SERVICE_TEMPLATE.fields.some((f) => f.key === 'clientBranch' && f.required));
});

test('ต้นฉบับไม่มีหมวด — หัวหมวดต้องไม่ถูกพิมพ์เพิ่ม', () => {
  for (const s of SERVICE_TEMPLATE.sections) {
    assert.equal(s.no, null);
    assert.equal(s.heading, null);
  }
  assert.equal(SERVICE_TEMPLATE.definitions, null, 'ต้นฉบับไม่มีหมวดคำจำกัดความ');
});

/* ── งวดชำระดึงจากใบเสนอราคา ────────────────────────────────────────────
   🪤 วันที่ของงวดอยู่ในช่อง `note` เป็นข้อความอิสระ — ต้องพิมพ์ตามที่กรอก ห้ามแปลง */
const PLAN = {
  type: 'installment',
  installments: [
    { no: 1, label: 'ชำระงวดที่ 1', amount: 7639.8, note: 'ก่อนการติดตั้ง' },
    { no: 2, label: 'ชำระงวดที่ 2', amount: 7639.8, note: 'วันที่ 17 กันยายน 2569' },
  ],
};

test('⭐ งวดชำระประกอบตามต้นฉบับ — วันที่ต่อท้ายป้าย เงื่อนไขอยู่ในวงเล็บ', () => {
  const { quotationInstallments: lines } = contractQuotationBlocks({ quoteNumber: 'QT-1', paymentPlan: PLAN });
  assert.equal(lines.length, 2);
  // งวดที่มีเงื่อนไข (ไม่ใช่วันที่) → วงเล็บท้ายบรรทัด
  assert.equal(lines[0], 'ชำระงวดที่ 1 จำนวน 7,639.80 บาท (ก่อนการติดตั้ง)');
  // งวดที่ note เป็นวันที่ → วางต่อจากป้าย ไม่ใส่วงเล็บ
  assert.equal(lines[1], 'ชำระงวดที่ 2 วันที่ 17 กันยายน 2569 จำนวน 7,639.80 บาท');
});

test('ใบที่ชำระเต็มจำนวน ไม่มีบรรทัดงวด — ไม่ใช่บรรทัดเปล่า', () => {
  const { quotationInstallments } = contractQuotationBlocks({ quoteNumber: 'QT-1', paymentPlan: { type: 'full' } });
  assert.deepEqual(quotationInstallments, []);
  assert.deepEqual(contractQuotationBlocks(null).quotationInstallments, []);
});

test('ไม่มีใบเสนอราคา = ไม่มีแถวตาราง (ตัวเรนเดอร์จะพิมพ์แถวเส้นประให้เขียนมือ)', () => {
  assert.deepEqual(contractQuotationBlocks(null).quotationLines, []);
  const { quotationLines } = contractQuotationBlocks({ quoteNumber: 'QT-26080037-5', subtotal: 35700 });
  assert.equal(quotationLines.length, 1);
  assert.equal(quotationLines[0].quoteNumber, 'QT-26080037-5');
  assert.equal(quotationLines[0].amount, '35,700.00');
  // จำนวนเครื่องเป็น token ของใบ ไม่ใช่ค่าจากใบเสนอราคา — ระบบยังไม่มีที่เก็บ
  assert.equal(quotationLines[0].machines, '{{machineCount}}');
});

/* ── เรนเดอร์จริง ───────────────────────────────────────────────────────── */
const CONTRACT = {
  kind: 'service', contractNo: 'CT-SR-26090004-0', contractDate: '2026-08-25',
  fields: {
    clientName: 'บริษัท ซารางแฮร์ ดูล จำกัด', clientBranch: 'สาขาบางนา',
    clientRegNo: '0105566080951', clientAddress: 'เลขที่ 507 ถนนประเสริฐมนูกิจ',
    termMonths: 13, branchCount: 1, serviceStartTh: '27 สิงหาคม พ.ศ. 2569',
    serviceEndTh: '26 กันยายน 2570', totalWithVat: 38199,
    totalWithVatText: 'สามหมื่นแปดพันหนึ่งร้อยเก้าสิบเก้าบาทถ้วน',
    finalPaymentDate: '17 ธันวาคม 2569', machineCount: '2 เครื่อง',
  },
};
const QUOTATION = { quoteNumber: 'QT-26080037-5', subtotal: 35700, paymentPlan: PLAN };

test('⭐ ออกสัญญาบริการได้จริง — ตารางและงวดขึ้นครบในเอกสาร', () => {
  const html = buildContractHTML(CONTRACT, { company: { legalNameTh: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด' }, quotation: QUOTATION });
  const body = docBody(html);
  assert.match(body, /clauseTable/, 'ต้องมีตารางข้อ 2');
  assert.match(body, /QT-26080037-5/, 'เลขที่ใบเสนอราคาต้องอยู่ในตาราง');
  assert.match(body, /clauseLines/, 'ต้องมีรายการงวดข้อ 3');
  assert.match(body, /ก่อนการติดตั้ง/);
  assert.match(body, /17 ธันวาคม 2569/, 'วันชำระครบต้องเป็นปีของงวดสุดท้าย');
  assert.doesNotMatch(body, /หมวด/, 'ต้นฉบับไม่มีหมวด — ห้ามพิมพ์คำนี้เพิ่ม');
});

test('ไม่มีใบเสนอราคาก็ยังออกเอกสารได้ — ตารางเป็นแถวเส้นประ', () => {
  const body = docBody(buildContractHTML(CONTRACT, { company: {}, quotation: null }));
  assert.match(body, /clauseTable/);
  assert.match(body, /__________/, 'แถวเปล่าต้องเป็นเส้นประให้เขียนมือ');
  assert.doesNotMatch(body, /clauseLines/, 'ไม่มีงวด = ไม่มีรายการ');
});

test('ด่านช่องบังคับใช้ตัวเดียวกับสัญญาชนิดอื่น', () => {
  const missing = missingContractFields('service', {});
  assert.ok(missing.includes('สาขาของผู้ว่าจ้างที่รับบริการ'));
  assert.ok(missing.includes('ชำระครบถ้วนภายในวันที่'));
  assert.ok(missing.includes('จำนวนเครื่องกระจายกลิ่นที่ติดตั้ง'));
  assert.equal(missingContractFields('service', {
    ...CONTRACT.fields, contractPlace: 'x', contractorSignerName: 'x', serviceKind: 'x',
    visitFrequency: 'x', fixWorkingDays: 3, lateWorkingDays: 7, bankName: 'x',
    bankAccountNo: 'x', latePaymentDays: 15, copyCount: 'สองฉบับ',
  }).length, 0);
});

/* 🐞 **รูที่เทสต์ชุดแรกมองไม่เห็น** (เจอ 2026-09-03 ตอนผู้ใช้ทักให้เช็คตาราง) —
   ฟังก์ชันประกอบตารางถูกต้อง แต่ route ที่ออกสัญญา `select` ใบเสนอราคามาแค่ 4 ช่อง
   ที่ด่านตัวเองใช้ แล้วส่งต่อเฉพาะ `quoteNumber` ⇒ **บนกระดาษจริงช่องค่าบริการว่าง
   และไม่มีบรรทัดงวดเลย** ทั้งที่เทสต์เขียวหมด เพราะเทสต์ป้อนใบเต็มเข้าไปเอง
   ⇒ ยามนี้ผูกกับ **ซอร์สของ route** ไม่ใช่กับฟังก์ชัน — เป็นที่เดียวที่รูนี้มองเห็นได้ */
test('🐞 เส้นออกสัญญาต้องดึงของที่แม่แบบใช้จริงมาด้วย ไม่ใช่แค่ช่องที่ด่านตรวจ', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/[id]/issue/route.js', import.meta.url), 'utf8',
  );
  for (const col of ['subtotal', '"paymentPlan"']) {
    assert.ok(route.includes(col), `select ของใบเสนอราคาต้องมี ${col} — แม่แบบสัญญาบริการใช้ทำตารางข้อ 2 / งวดข้อ 3`);
  }
  // จับเจตนา ไม่ใช่รูปประโยค — ขอแค่ "กระจายแถวจริงเข้าไป" ไม่ล็อกการจัดบรรทัด
  const block = route.slice(route.indexOf('quotation: contract.quotationId'));
  assert.match(block.slice(0, 220), /\.\.\.\(?\s*quote/,
    'ต้องส่งแถวจริงเข้า buildContractHTML ไม่ใช่ประกอบออบเจ็กต์ที่มีแต่เลขที่');
});

/* ⚠️ **มูลค่าเป็นทศนิยม 2 ตำแหน่งเสมอ** (มติผู้ใช้ 2026-09-03)
   🪤 ต้นฉบับ .docx เขียน `35,700` ไม่มีทศนิยม — ห้ามแก้ตาม เคยแก้แล้วโดนตีกลับ */
test('รูปแบบตัวเลข: มูลค่าเป็นทศนิยม 2 ตำแหน่งทั้งตารางและงวด', () => {
  const { quotationLines, quotationInstallments } = contractQuotationBlocks({
    quoteNumber: 'QT-1', subtotal: 35700,
    paymentPlan: { type: 'installment', installments: [{ no: 1, label: 'ชำระงวดที่ 1', amount: 7639.8 }] },
  });
  assert.equal(quotationLines[0].amount, '35,700.00');
  assert.match(quotationInstallments[0], /7,639\.80 บาท/);
});

/* ⭐ **เอกสารสัญญาเป็นทศนิยม 2 ตำแหน่งทั้งหมด** (มติผู้ใช้ 2026-09-03)
   ⚠️ ต่างจากกติกาของจอ ("เงินเต็มหลัก" #1540/#1541/#1543) โดยตั้งใจ —
   เอกสารที่พิมพ์ให้ลูกค้าเซ็นมีสตางค์จริง ⇒ ฉบับเดียวมีสองรูปแบบปนกันไม่ได้
   🪤 ครอบ **ทุกชนิดสัญญา** ไม่ใช่แค่สัญญาบริการ — ตัวจัดรูปเป็นตัวเดียวกัน */
test('⭐ เงินในเอกสารสัญญาเป็นทศนิยม 2 ตำแหน่ง — ทั้งช่องกรอกและตาราง', () => {
  const body = docBody(buildContractHTML(
    { ...CONTRACT, fields: { ...CONTRACT.fields, totalWithVat: 38199 } },
    { company: {}, quotation: QUOTATION },
  ));
  assert.match(body, /38,199\.00 บาท/, 'ยอดรวมข้อ 3 ต้องมีทศนิยม');
  assert.match(body, /35,700\.00/, 'ค่าบริการในตารางต้องมีทศนิยม');
  assert.match(body, /7,639\.80 บาท/, 'งวดชำระต้องมีทศนิยม');
  assert.doesNotMatch(body, /38,199 บาท/, 'ห้ามมีเลขเงินไม่มีทศนิยมปนในเอกสารเดียวกัน');
});
