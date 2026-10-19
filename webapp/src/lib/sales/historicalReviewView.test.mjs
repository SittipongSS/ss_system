// ขั้น ④ "ตรวจและส่งอนุมัติ" ของฟอร์มคีย์ใบสั่งขายย้อนหลัง (มติเจ้าของ 25/09 — "ตรวจแบบผู้อนุมัติ")
// ตัวตัดสินทั้งหมดของขั้นนี้บริสุทธิ์ ⇒ ทดสอบพฤติกรรมตรง ๆ (ส่วนที่จอต่อสายตรึงที่ historicalRegisterUi.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  historicalKeyerMode, historicalReviewChecklist, historicalReviewFacts, historicalReviewFootNote,
  historicalSaveResultView, historicalSaveStages, historicalSubmitToast, historicalWarningGroups,
} from './historicalReviewView.js';
import { historicalSaveExit, HISTORICAL_SAVE_BUTTON_LABEL } from './historicalIntakeForm.js';
import {
  HISTORICAL_ALIGNMENT_MISSING_SAVED, HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED, HISTORICAL_PACK_QTY_NOT_STORED_SAVED,
} from './historicalOrderCopy.js';
import { HISTORICAL_APPROVER_LABEL } from './historicalOrders.js';

const apiError = (status, data) => Object.assign(new Error(data?.error || 'x'), { status, data });

/* แผนขนาดเล็กรูปเดียวกับที่ planHistoricalServiceOrder คืน (เฉพาะช่องที่ขั้น ④ อ่าน) */
const PLAN = Object.freeze({
  header: {
    customerName: 'บริษัท เอ จำกัด', ownerName: 'สมชาย', team: 'A', totalAmount: 261936, vatRate: 7,
    refs: { quote: 'QT-OLD-1', express: '', invoice: 'IV-2601-0412' }, notes: '',
  },
  contract: { docKind: 'customer_po', ref: 'PO-7781', startDate: '2026-01-01', endDate: '2026-12-31' },
  /* บรรทัดของแผนพก packsPerRound (จำนวนเต็ม 1–9999) + serviceRounds — PR-D · มติ 26/09 A3/O9 */
  lines: [
    { zoneId: 'Z-1', zoneName: 'Lobby', siteId: 'S-1', siteCode: 'ST-01', siteName: 'อาคาร A', packsPerRound: 2, serviceRounds: 12 },
    { zoneId: 'Z-2', zoneName: 'ทางเดิน', siteId: 'S-1', siteCode: 'ST-01', siteName: 'อาคาร A', packsPerRound: 1, serviceRounds: 12 },
  ],
  opening: { amount: 196452, coversFrom: '2026-01-01', coversTo: '2026-09-30', paidOn: '2026-01-10', note: '' },
  installments: [{ label: 'งวด 2', amount: 65484, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31' }],
  check: { sumMatches: true, coverageContinuous: true },
  zeroValue: false,
  warnings: [],
  warningItems: [],
  duplicates: [],
});
const plan = (patch = {}) => ({ ...PLAN, ...patch });
const rowOf = (rows, key) => rows.find((row) => row.key === key);

test('ผู้คีย์: admin อนุมัติเองได้แบบ Override · ผู้จัดการฝ่ายขาย (AE Sup/CM/CD) อนุมัติใบที่ตัวเองคีย์ไม่ได้ · ที่เหลือ = ผู้คีย์', () => {
  assert.equal(historicalKeyerMode('admin'), 'admin');
  for (const role of ['ae_supervisor', 'commercial_manager', 'commercial_director']) assert.equal(historicalKeyerMode(role), 'manager', role);
  for (const role of ['ae', 'ac', 'senior_ae', '', null]) assert.equal(historicalKeyerMode(role), 'keyer', String(role));
});

test('⭐ คำเตือนรวมเป็นกลุ่ม: งวดเลยกำหนด 10 งวด = ข้อเดียวพร้อมจำนวน · โซนซ้อนรวมตามใบ · "ไม่มีงวดยกมา" ไม่ใช่คำเตือน', () => {
  const overdue = Array.from({ length: 10 }, (_, i) => ({ topic: 'overdue', text: `งวดที่ ${i + 2} …`, seq: i + 2, dueDate: '2026-02-01' }));
  const groups = historicalWarningGroups(plan({
    warningItems: [
      { topic: 'contractEnded', text: 'สัญญาสิ้นสุดแล้ว' },
      { topic: 'liveTerm', text: 'x', index: 0, orderNumber: 'SO-1', endDate: '2026-12-31' },
      { topic: 'liveTerm', text: 'y', index: 2, orderNumber: 'SO-1', endDate: '2026-12-31' },
      ...overdue,
      { topic: 'noOpening', text: 'ไม่มีงวดยกมา — TS …' },
    ],
  }), { todayIso: '2026-09-25' });
  assert.deepEqual(groups.map((g) => g.topic), ['contractEnded', 'liveTerm', 'overdue']);
  assert.deepEqual(groups.map((g) => g.step), ['contract', 'zones', 'money']);
  assert.match(groups[1].text, /^2 โซนมีรอบขายของใบอื่นอยู่แล้ว — SO-1 \(ถึง 31\/12\/2026\) รายการ 1, 3/);
  assert.match(groups[2].text, /^10 งวดครบกำหนดก่อนวันนี้/);
  /* โซนเดียวที่มีรอบของสองใบ = 1 โซน (นับบรรทัด ไม่ใช่คู่โซน × ใบ) */
  const twoOrders = historicalWarningGroups(plan({ warningItems: [
    { topic: 'liveTerm', text: 'x', index: 0, orderNumber: 'SO-A', endDate: null },
    { topic: 'liveTerm', text: 'y', index: 0, orderNumber: 'SO-B', endDate: null },
  ] }));
  assert.match(twoOrders[0].text, /^1 โซนมีรอบขายของใบอื่นอยู่แล้ว — SO-A .* · SO-B /);
  assert.match(groups[2].text, new RegExp(`หลัง${HISTORICAL_APPROVER_LABEL}อนุมัติ`));
});

test('🪤 แผนรุ่นก่อนที่ไม่มี warningItems: ทุกข้อเป็น "คำเตือนอื่น" — ไม่มีข้อไหนหายเงียบ', () => {
  const groups = historicalWarningGroups({ warnings: ['ก', 'ข'] });
  assert.deepEqual(groups.map((g) => [g.topic, g.text]), [['other', 'ก'], ['other', 'ข']]);
  const rows = historicalReviewChecklist(plan({ warningItems: undefined, warnings: ['ก'] }));
  assert.deepEqual(rows.filter((r) => r.label === 'คำเตือนอื่น').map((r) => r.value), ['ก']);
});

test('⭐ แถวตรวจ: ข้อเดียวกับหน้าต่างอนุมัติ ตามลำดับ · ทุกแถวที่แก้ได้ชี้ขั้น + ช่อง', () => {
  const rows = historicalReviewChecklist(plan(), {
    contractFiles: { count: 1, names: ['PO-7781.pdf'], pending: [] }, evidenceFileCount: 2, todayIso: '2026-09-25',
  });
  /* ⭐ PR-D: แถว "รอบละกี่แพ็ค · จำนวนรอบบริการ" ต่อจากโซน — ข้อเดียวกับหน้าต่างอนุมัติ (historicalPacksRoundsText)
     มติเจ้าของ 08/10 รอบสอง — จอฝ่ายขายที่เหลือ: หน่วยเดือน + แพ็คก่อนจำนวนรอบบริการ
     (ของเดิมยึดรอบก่อนแพ็คตามมติ 29/09: 'จำนวนรอบบริการ · รอบละกี่แพ็ค' · '12 รอบ/โซน · รวม 3 แพ็ค/รอบ' · 'Lobby 12 รอบ × 2 แพ็ค/รอบ') */
  assert.deepEqual(rows.map((r) => r.key), ['contract', 'signedFile', 'refs', 'zones', 'packs', 'opening', 'remaining', 'verdict']);
  assert.equal(rowOf(rows, 'contract').value, 'ใบสั่งซื้อของลูกค้า (PO) PO-7781 · 01/01/2026–31/12/2026 · 12 เดือน');
  assert.equal(rowOf(rows, 'signedFile').value, 'PO-7781.pdf');
  assert.equal(rowOf(rows, 'refs').value, 'QT-OLD-1 · IV-2601-0412');
  assert.equal(rowOf(rows, 'zones').value, '2 โซน — ST-01 อาคาร A 2 โซน');
  /* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-5 · มติเจ้าของ 12/10 ข้อ A8 "ปุ่มรับค่า + เตือน" · แผน IMPL_PLAN_PR5 §5 แถว G17): เดิมแถวนี้มีเจ็ดคีย์ —
     วันนี้แปด: + `warn` (คำเตือนเมื่อคู่เงินของบรรทัดไม่ตรงกับคู่ของงานบริการ — PR-5 D1(ก)) · ไม่ได้คลายด่าน: ทั้งแถวยังยึดแบบเท่ากันทุกคีย์
     เจ็ดคีย์เดิมเท่าเดิมทุกตัวอักษร · คู่ที่ตรงกัน / เทียบไม่ได้ (แผนชุดนี้ไม่พกจำนวนและเลขแพ็ค) = `warn: null` · กรณีไม่ตรงอยู่ที่เทสต์ของงวด PR-5 ข้างล่าง */
  assert.deepEqual(rowOf(rows, 'packs'), {
    key: 'packs', label: 'รอบละกี่แพ็ค · จำนวนรอบบริการ', value: 'รวม 3 แพ็ค/รอบ · 12 เดือน/โซน',
    sub: 'Lobby 2 แพ็ค/รอบ × 12 เดือน · ทางเดิน 1 แพ็ค/รอบ × 12 เดือน', tone: null, warn: null, step: 'zones', field: 'zones',
  });
  assert.equal(rowOf(rows, 'remaining').sub, null, 'ไม่มีวันวางบิลสักงวด = ไม่พูด');
  assert.match(rowOf(rows, 'opening').value, /หลักฐาน 2 ไฟล์/);
  assert.match(rowOf(rows, 'remaining').value, /^งวด 2 ฿?65,484/);
  assert.equal(rowOf(rows, 'verdict').tone, 'ok');
  assert.equal(rowOf(rows, 'verdict').step, null, 'ผ่านแล้วไม่มีอะไรให้แก้');
  for (const row of rows.filter((r) => r.key !== 'verdict')) {
    assert.ok(['contract', 'zones', 'money'].includes(row.step), `${row.key} ต้องชี้ขั้นที่แก้ได้`);
    assert.ok(row.field, `${row.key} ต้องชี้ช่อง`);
  }
});

test('⭐ ไฟล์หลักฐานลงนาม: null = ยังอ่านไม่ได้ · 0 = ยังไม่แนบ (เหลือง) · ไฟล์แรกที่แนบ = ไฟล์ที่ผู้อนุมัติใช้ · ในตะกร้า = อัปตอนกดบันทึก', () => {
  const file = (contractFiles) => rowOf(historicalReviewChecklist(plan(), { contractFiles }), 'signedFile');
  assert.match(file({ count: null }).value, /ยังอ่านรายการไฟล์ไม่ได้/);
  assert.equal(file({ count: null }).tone, null);
  assert.equal(file({ count: 0 }).tone, 'warn');
  assert.match(file({ count: 0 }).value, /ยังไม่แนบ/);
  assert.equal(file({ count: 3, names: ['a.pdf', 'b.pdf', 'c.pdf'] }).value, 'a.pdf (จาก 3 ไฟล์ที่แนบ)');
  assert.equal(file({ count: 1, names: ['new.pdf'], pending: ['new.pdf'] }).value, 'new.pdf · อัปตอนกดบันทึก');
});

test('⭐ คำเตือนอยู่ในแถวของมัน: สัญญาสิ้นสุด → เอกสาร · โซนซ้อน → โซน · งวดเลยกำหนด → งวดที่ต้องเก็บ', () => {
  const rows = historicalReviewChecklist(plan({
    warningItems: [
      { topic: 'contractEnded', text: 'สัญญาสิ้นสุดแล้ว' },
      { topic: 'liveTerm', text: 'x', index: 0, orderNumber: 'SO-1', endDate: null },
      { topic: 'overdue', text: 'y', seq: 2, dueDate: '2026-02-01' },
    ],
  }), { todayIso: '2026-09-25' });
  assert.equal(rowOf(rows, 'contract').warn, 'สัญญาสิ้นสุดแล้ว');
  assert.match(rowOf(rows, 'zones').warn, /SO-1 \(ถึง ไม่ระบุวันสิ้นสุด\)/);
  assert.match(rowOf(rows, 'remaining').warn, /^1 งวดครบกำหนดก่อนวันนี้/);
});

test('⭐ ใบ ฿0: แถวยอดใบแทนงวด · หมายเหตุขึ้นเสมอ (มติข้อ 11) · ไม่มีแถวตรวจยอด/ช่วง', () => {
  const rows = historicalReviewChecklist(plan({ zeroValue: true, opening: null, installments: [], header: { ...PLAN.header, totalAmount: 0 } }));
  assert.deepEqual(rows.map((r) => r.key), ['contract', 'signedFile', 'refs', 'notes', 'zones', 'packs', 'zero']);
  assert.match(rowOf(rows, 'zero').value, /ด่านเงินของนัดบริการผ่านเอง/);
  /* ยอดใบเปลี่ยนที่รายการ — ขั้น ③ ของใบ ฿0 ไม่มีช่อง (และไม่มีจุดยึด) ให้พาไป */
  assert.deepEqual([rowOf(rows, 'zero').step, rowOf(rows, 'zero').field], ['zones', 'zones']);
});

/* ⭐ PR-D (มติ 26/09 A3/O9 · IMPL_PLAN_D §3.4): แพ็คต่อรอบ · จำนวนรอบบริการ — เดือนต่างกันเป็นช่วง · เกิน 5 โซนชี้ตารางด้านล่าง
   มติเจ้าของ 08/10 รอบสอง — จอฝ่ายขายที่เหลือ: หน่วยเดือน + แพ็คก่อนจำนวนรอบบริการ (ทุกข้อคาดหวังข้างล่างย้ายจาก "n รอบ" + รอบก่อนแพ็ค)
   · ยังไม่ครบ = เหลือง ชี้ขั้น ② (ช่อง 'zones' มีจุดยึดบนขั้น ② อยู่แล้ว — ยามจุดยึดของ historicalRegisterUi) */
test('⭐ แถวแพ็ค · จำนวนรอบบริการ: ช่วงเดือน · เกิน 5 โซน = ดูรายการด้านล่าง · ขาดแพ็ค = เหลือง ชี้ขั้น ② · ไม่มีบรรทัด = ขีด', () => {
  const packs = (lines) => rowOf(historicalReviewChecklist(plan({ lines })), 'packs');
  const mixed = packs([{ ...PLAN.lines[0], serviceRounds: 6 }, PLAN.lines[1]]);
  assert.equal(mixed.value, 'รวม 3 แพ็ค/รอบ · 6–12 เดือน/โซน');
  assert.equal(mixed.sub, 'Lobby 2 แพ็ค/รอบ × 6 เดือน · ทางเดิน 1 แพ็ค/รอบ × 12 เดือน');
  const six = packs(Array.from({ length: 6 }, (_, i) => ({ ...PLAN.lines[0], zoneId: `Z-${i}`, zoneName: `โซน ${i + 1}` })));
  assert.deepEqual([six.value, six.sub, six.tone], ['รวม 12 แพ็ค/รอบ · 12 เดือน/โซน', 'ดูรายการด้านล่าง', null]);
  const missing = packs([PLAN.lines[0], { ...PLAN.lines[1], packsPerRound: null }]);
  assert.deepEqual([missing.value, missing.tone, missing.step, missing.field], ['ยังไม่ครบ 1 รายการ — กลับไปขั้น ②', 'warn', 'zones', 'zones']);
  /* ผลตรวจทาน 08/10: ค่าเดือนของโซนที่ขาดแพ็คอยู่ในวงเล็บของโซนนั้น (ไม่ต่อด้วยตัวคั่นโซน " · " — ตัวเลขจะลอยระหว่างสองโซน) */
  assert.equal(missing.sub, 'Lobby 2 แพ็ค/รอบ × 12 เดือน · ทางเดิน ยังไม่ใส่รอบละกี่แพ็ค (12 เดือน)', 'บอกว่าโซนไหนยังขาด');
  const empty = packs([]);
  assert.deepEqual([empty.value, empty.sub, empty.tone], ['—', null, null]);
  for (const row of [mixed, six, missing]) assert.doesNotMatch(`${row.value} ${row.sub}`, /(?<!กี่)แพ็ค(?!เกจ|\/รอบ)/);
  for (const row of [mixed, six, missing]) assert.doesNotMatch(`${row.value} ${row.sub}`, /\d\s*รอบ/, 'ไม่มี "n รอบ" — จำนวนรอบบริการพูด "n เดือน"');
});

/* ⭐ PR-5 D1(ก) (มติเจ้าของ 12/10 ข้อ A8 "ปุ่มรับค่า + เตือน" · แผน IMPL_PLAN_PR5 §2.9): คู่เงินของบรรทัด (เลขแพ็ค · จำนวน) กับคู่ของงานบริการ
   (รอบละกี่แพ็ค · จำนวนรอบบริการ) ไม่เท่ากัน = กลุ่มคำเตือน `packService` — คิดจากบรรทัดของแผน (ไม่ใช่จาก `warningItems`) ·
   ประโยคเดียวกับหน้าต่างอนุมัติ · อยู่ในแถวแพ็คต่อรอบ · บรรทัดใต้ปุ่มนับเป็นหนึ่งข้อ · **ไม่กั้นอะไร** (ไม่ใช่ error ของแผน ไม่เปลี่ยนสีของแถว) */
const packLine = (extra = {}) => ({ ...PLAN.lines[0], packQty: 2, qty: 12, packsPerRound: 2, serviceRounds: 12, ...extra });
const MISMATCH = 'รายการ 1: “แพ็ค/เดือน” ≠ รอบละกี่แพ็ค · รายการ 2: จำนวน ≠ จำนวนรอบบริการ — ตรวจอีกครั้ง (ไม่บังคับให้เท่า)';

test('PR-5 D1(ก) ⭐ กลุ่มคำเตือน packService: มาจากบรรทัดของแผน · ชี้ขั้น ② · คู่ตรงกัน / เทียบไม่ได้ = ไม่มีกลุ่ม · ไม่ไหลลงแถว "คำเตือนอื่น"', () => {
  const differ = plan({ lines: [packLine({ packsPerRound: 1 }), packLine({ zoneId: 'Z-2', zoneName: 'ทางเดิน', serviceRounds: 6 })] });
  const groups = historicalWarningGroups(differ, { todayIso: '2026-09-25' });
  assert.deepEqual(groups, [{ topic: 'packService', step: 'zones', text: MISMATCH }]);
  // คู่ตรงกันทุกบรรทัด = ไม่มีกลุ่ม · แผนชุดตั้งต้น (ไม่พกเลขแพ็ค/จำนวน — เทียบไม่ได้) = ไม่มีกลุ่ม · ไม่มีแผน = ไม่พัง
  assert.deepEqual(historicalWarningGroups(plan({ lines: [packLine(), packLine()] })), []);
  assert.deepEqual(historicalWarningGroups(plan()), []);
  assert.deepEqual(historicalWarningGroups(null), []);
  assert.deepEqual(historicalWarningGroups({ warnings: [] }), []);
  // อยู่ร่วมกับกลุ่มอื่นตามลำดับของแถวตรวจ (สัญญา → โซน → แพ็คต่อรอบ → งวด) · ไม่ถูกนับเป็น "คำเตือนอื่น"
  const mixed = historicalWarningGroups(plan({
    lines: differ.lines,
    warningItems: [
      { topic: 'overdue', text: 'y', seq: 2, dueDate: '2026-02-01' },
      { topic: 'liveTerm', text: 'x', index: 0, orderNumber: 'SO-1', endDate: null },
      { topic: 'contractEnded', text: 'สัญญาสิ้นสุดแล้ว' },
    ],
  }), { todayIso: '2026-09-25' });
  assert.deepEqual(mixed.map((g) => [g.topic, g.step]), [['contractEnded', 'contract'], ['liveTerm', 'zones'], ['packService', 'zones'], ['overdue', 'money']]);
  // แผนรุ่นก่อนที่ไม่มี warningItems: คำเตือนเดิมยังเป็น "คำเตือนอื่น" ครบ + กลุ่มนี้ (คิดจากบรรทัด ไม่ขึ้นกับรุ่นของคำเตือน)
  assert.deepEqual(historicalWarningGroups({ warnings: ['ก'], lines: differ.lines }).map((g) => g.topic), ['packService', 'other']);
});

test('PR-5 D1(ก) ⭐ แถวตรวจ "รอบละกี่แพ็ค · จำนวนรอบบริการ" พกคำเตือนเป็น `warn` (สีของแถวไม่เปลี่ยน) · บรรทัดใต้ปุ่มนับเป็นหนึ่งข้อ และยังพร้อมส่ง', () => {
  const differ = plan({ lines: [packLine({ packsPerRound: 1 }), packLine({ zoneId: 'Z-2', zoneName: 'ทางเดิน', serviceRounds: 6 })] });
  const rows = historicalReviewChecklist(differ, { contractFiles: { count: 1, names: ['PO-7781.pdf'] }, evidenceFileCount: 2, todayIso: '2026-09-25' });
  assert.deepEqual(rowOf(rows, 'packs'), {
    key: 'packs', label: 'รอบละกี่แพ็ค · จำนวนรอบบริการ', value: 'รวม 3 แพ็ค/รอบ · 6–12 เดือน/โซน',
    sub: 'Lobby 1 แพ็ค/รอบ × 12 เดือน · ทางเดิน 2 แพ็ค/รอบ × 6 เดือน', tone: null, warn: MISMATCH, step: 'zones', field: 'zones',
  });
  assert.deepEqual(rows.map((r) => r.key), ['contract', 'signedFile', 'refs', 'zones', 'packs', 'opening', 'remaining', 'verdict'], 'ไม่มีแถว "คำเตือนอื่น" งอก');
  assert.equal(rowOf(rows, 'zones').warn, null, 'คำเตือนอยู่ที่แถวแพ็คต่อรอบแถวเดียว');
  assert.equal(rowOf(rows, 'verdict').tone, 'ok', 'ไม่กระทบผลตรวจยอด/ช่วง');
  // คู่ตรงกัน = warn null (เจ็ดคีย์ที่เหลือเท่ากับแถวของแผนที่ตรงกัน)
  const agree = historicalReviewChecklist(plan({ lines: [packLine(), packLine({ zoneId: 'Z-2', zoneName: 'ทางเดิน' })] }));
  assert.equal(rowOf(agree, 'packs').warn, null);
  // แถวที่ขาดแพ็คต่อรอบ: เหลืองเพราะขาด (ของเดิม) — คู่ที่เทียบไม่ได้ไม่ทำให้เกิดคำเตือนซ้อน
  const missing = rowOf(historicalReviewChecklist(plan({ lines: [packLine({ packsPerRound: null })] })), 'packs');
  assert.deepEqual([missing.tone, missing.warn], ['warn', null]);
  // บรรทัดใต้ปุ่ม: นับกลุ่มนี้เป็นหนึ่งข้อ · ยัง "พร้อมส่ง" (คำเตือนไม่บล็อก)
  const groups = historicalWarningGroups(differ, { todayIso: '2026-09-25' });
  assert.deepEqual(historicalReviewFootNote({ plan: differ, warningGroups: groups }), {
    text: 'พร้อมส่ง · คำเตือน 1 ข้อ (ไม่บล็อก) อยู่ในการ์ด “สิ่งที่ผู้อนุมัติจะตรวจ”', tone: null,
  });
  assert.deepEqual(historicalReviewFootNote({ plan: plan({ lines: [packLine()] }), warningGroups: historicalWarningGroups(plan({ lines: [packLine()] })) }),
    { text: 'พร้อมส่ง — ไม่มีคำเตือน', tone: null });
});

/* ⭐ H1 (IMPL_PLAN_D §3.3): วันวางบิลไม่บังคับ — แถวงวดที่ยังต้องเก็บบอกว่าตั้งไว้กี่งวด (คำเดียวกับหน้าต่างอนุมัติ) */
test('แถวงวดที่ยังต้องเก็บ: มีวันวางบิล k จาก m งวด เป็นบรรทัดรอง · ไม่มีสักงวด = ไม่มีบรรทัดรอง', () => {
  const rows = historicalReviewChecklist(plan({
    installments: [
      { label: 'งวด 2', amount: 32742, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-11-15', billingDate: '2026-09-25' },
      { label: 'งวด 3', amount: 32742, dueDate: '2026-11-16', coversFrom: '2026-11-16', coversTo: '2026-12-31', billingDate: null },
    ],
  }));
  assert.equal(rowOf(rows, 'remaining').sub, 'มีวันวางบิล 1 จาก 2 งวด');
});

test('ยอด/ช่วงยังไม่ผ่านการตรวจของแผน = เหลือง ชี้ขั้น ③ (ไม่พูดว่า "ไม่มีช่องโหว่")', () => {
  const row = rowOf(historicalReviewChecklist(plan({ check: { sumMatches: true, coverageContinuous: false } })), 'verdict');
  assert.equal(row.tone, 'warn');
  assert.equal(row.step, 'money');
  assert.doesNotMatch(row.value, /ไม่มีช่องโหว่/);
});

test('⭐ บรรทัดใต้ปุ่มของขั้น ④ — ตัวเดียวที่บอกว่าส่งได้ไหม/ติดอะไร/กำลังทำอะไร', () => {
  const saving = historicalSaveStages({ stage: 'contractFiles', counts: { contract: [1, 2] } });
  assert.deepEqual(historicalReviewFootNote({ plan: PLAN, saving }), { text: 'กำลังบันทึก ขั้น 2/3 — อย่าปิดหน้านี้', tone: 'busy' });
  assert.match(historicalReviewFootNote({ plan: PLAN, failed: { orderNumber: 'SO-26090001-0' } }).text,
    new RegExp(`^ใบร่าง SO-26090001-0 บันทึกแล้ว ยังไม่ส่งอนุมัติ — กด “${HISTORICAL_SAVE_BUTTON_LABEL}” เพื่อทำต่อ`));
  assert.equal(historicalReviewFootNote({ plan: PLAN, failed: {} }).text, 'ส่งไม่สำเร็จ — ดูกล่องแดงเหนือแถบนี้');
  /* 🐞 รีวิวขั้น ④: "กดเพื่อทำต่อ" เฉพาะผลที่กดซ้ำแล้วผ่านได้ — รหัสที่ server ตั้งกฎไว้กดซ้ำได้รหัสเดิมวนไม่รู้จบ */
  for (const error of [
    apiError(409, { code: 'workflow_stale', error: 'ถูกแก้' }),
    apiError(409, { code: 'historical_so_submit_state_invalid', error: 'ส่งไปแล้ว' }),
    apiError(403, { error: 'ไม่มีสิทธิ์' }),
    apiError(409, { code: 'historical_so_contract_file_missing', error: 'ไม่มีไฟล์' }),
  ]) {
    const note = historicalReviewFootNote({ plan: PLAN, failed: { orderNumber: 'SO-1', exit: historicalSaveExit(error) } });
    assert.equal(note.text, 'ส่งไม่สำเร็จ — ดูกล่องแดงเหนือแถบนี้', error.data?.code || String(error.status));
  }
  for (const error of [apiError(0, { error: 'หลุด' }), apiError(409, { code: 'historical_so_container_deal_race', error: 'ชน' })]) {
    assert.match(historicalReviewFootNote({ plan: PLAN, failed: { orderNumber: 'SO-1', exit: historicalSaveExit(error) } }).text, /^ใบร่าง SO-1 บันทึกแล้ว/);
  }
  assert.match(historicalReviewFootNote({ plan: null }).text, /กด “บันทึกและส่งอนุมัติ” ครั้งแรกคือการตรวจ ยังไม่บันทึก/);
  const local = historicalReviewFootNote({ plan: PLAN, localIssues: [{ field: 'contract.file' }, { field: 'installments' }] });
  assert.equal(local.tone, 'warn');
  assert.match(local.text, /^ยังส่งไม่ได้ — ขั้น ① ลูกค้าและสัญญา มี 1 ข้อต้องแก้/);
  assert.match(historicalReviewFootNote({ plan: PLAN, gate: { gated: true } }).text, /เปิด “ตรวจแล้ว ไม่ใช่ใบซ้ำ”/);
  assert.match(historicalReviewFootNote({ plan: PLAN, warningGroups: [{}, {}] }).text, /^พร้อมส่ง · คำเตือน 2 ข้อ \(ไม่บล็อก\)/);
  assert.deepEqual(historicalReviewFootNote({ plan: PLAN }), { text: 'พร้อมส่ง — ไม่มีคำเตือน', tone: null });
});

test('⭐ แผงบันทึก: เฉพาะจังหวะที่มีงานจริง · หลักฐาน = อัป + แก้ใบผูก ref (ผู้คีย์ไม่ต้องเห็นสองจังหวะ) · เลข SO ขึ้นหลังได้', () => {
  const bare = historicalSaveStages({ stage: 'persist' });
  assert.deepEqual(bare.stages.map((s) => s.key), ['persist', 'submit']);
  assert.deepEqual([bare.index, bare.count], [1, 2]);
  assert.equal(bare.stages[0].hint, 'สร้างใบร่าง ได้เลข SO');

  const full = historicalSaveStages({
    stage: 'persistEvidence', counts: { contract: [2, 2], evidence: [1, 1] }, orderNumber: 'SO-26090001-0',
  });
  assert.deepEqual(full.stages.map((s) => [s.key, s.state]), [
    ['persist', 'done'], ['contractFiles', 'done'], ['evidence', 'current'], ['submit', 'pending'],
  ]);
  assert.equal(full.stages[0].hint, 'SO-26090001-0');
  assert.equal(full.stages[1].hint, '2/2 ไฟล์');
  assert.deepEqual([full.index, full.count], [3, 4]);

  /* กดซ้ำหลังหลักฐานขึ้นครบแล้วแต่การผูก ref ล้ม — ไม่มีไฟล์ค้าง แต่ยังต้องมีจังหวะหลักฐานให้ชี้ (ไม่ใช่ "ขั้น 1/2" ที่ไม่มีขั้นปัจจุบัน) */
  const resumed = historicalSaveStages({ stage: 'persistEvidence', counts: { contract: [0, 0], evidence: [0, 0] } });
  assert.deepEqual(resumed.stages.map((s) => [s.key, s.state]), [['persist', 'done'], ['evidence', 'current'], ['submit', 'pending']]);
  assert.deepEqual([resumed.index, resumed.count], [2, 3]);
});

test('🔴 ผลที่ล้ม: ทางออกไม่เกินหนึ่งปุ่ม และไม่มี "บันทึกอีกครั้ง" (ลองใหม่ = ปุ่มบันทึกตัวเดิมซึ่งผ่านด่านใบซ้ำ)', () => {
  const cases = [
    apiError(0, { error: 'เชื่อมต่อไม่ได้' }),
    apiError(500, { error: 'พัง' }),
    apiError(409, { code: 'historical_so_container_deal_race', error: 'ชน' }),
    apiError(409, { code: 'historical_so_intake_key_conflict', error: 'ชน', orderId: 'SOR-H1' }),
    apiError(400, { error: 'x', errors: [{ field: 'zones', message: 'x' }] }),
    apiError(400, { code: 'historical_so_money_mismatch', error: 'ยอดไม่ตรง' }),
    apiError(409, { code: 'workflow_stale', error: 'ถูกแก้' }),
    apiError(409, { code: 'historical_so_submit_state_invalid', error: 'ส่งไปแล้ว' }),
    apiError(409, { code: 'historical_so_contract_file_missing', error: 'ไม่มีไฟล์' }),
    apiError(403, { error: 'ไม่มีสิทธิ์' }),
    apiError(503, { error: 'ยังไม่ได้รัน 0374' }),
    apiError(503, { code: 'historical_pack_qty_not_stored', error: HISTORICAL_PACK_QTY_NOT_STORED_SAVED, orderId: 'SOR-H1', replayed: false }),
    apiError(503, { code: 'historical_pack_qty_not_stored', error: HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED, orderId: 'SOR-H1', replayed: true }),
    apiError(409, { code: 'something_new', error: 'ใหม่' }),
  ];
  for (const error of cases) {
    for (const extra of [{}, { orderNumber: 'SO-1', failedFile: { name: 'a.pdf', kind: 'contract', key: 'k' } }]) {
      const view = historicalSaveResultView(historicalSaveExit(error), { stage: 'contractFiles', ...extra });
      assert.ok(view.title.startsWith('ส่งไม่สำเร็จ'), view.title);
      assert.ok(!view.action || ['removeFile', 'open', 'reload', 'openOrder', 'goToStep'].includes(view.action.key),
        `${error.data?.code || error.status}: ${JSON.stringify(view.action)}`);
      assert.doesNotMatch(JSON.stringify(view), /บันทึกอีกครั้ง/);
    }
  }
});

test('⭐ ผลที่ล้มแต่ละชนิดบอกสิ่งที่ลงฐานไปแล้วตามจริง', () => {
  const offline = historicalSaveExit(apiError(0, { error: 'เชื่อมต่อไม่ได้' }));
  /* ยังไม่มีเลขใบ = ไม่รู้ว่าสร้างลงไปหรือยัง ⇒ ห้ามพูดว่า "ยังไม่มีอะไรลงฐาน" */
  const early = historicalSaveResultView(offline, { stage: 'persist' });
  assert.match(early.title, /การเชื่อมต่อสะดุดที่ขั้น “บันทึกใบ”/);
  assert.doesNotMatch(early.body, /ยังไม่มีอะไรลงฐาน/);
  assert.equal(early.action, null);

  const upload = historicalSaveResultView(offline, {
    stage: 'contractFiles', orderNumber: 'SO-26090001-0', failedFile: { name: 'PO.pdf', kind: 'contract', key: 'k' },
  });
  assert.match(upload.title, /ติดที่ “อัปไฟล์เอกสารแทนสัญญา”/);
  assert.match(upload.body, /ไฟล์ “PO\.pdf” อัปไม่ขึ้น · ลงฐานแล้ว: ใบร่าง SO-26090001-0 \(ยังไม่ส่งอนุมัติ\)/);
  assert.equal(upload.action.key, 'removeFile', 'ไฟล์ค้างในตะกร้าที่ไม่อยู่บนจอขั้น ④ เคยเป็นทางตันที่มองไม่เห็น');

  const race = historicalSaveResultView(historicalSaveExit(apiError(409, { code: 'historical_so_container_deal_race', error: 'ชน' })));
  assert.match(race.body, /^ยังไม่มีอะไรลงฐาน/);

  const invalid = historicalSaveResultView(historicalSaveExit(apiError(400, {
    error: 'x', errors: [{ field: 'installments.0.amount', message: 'x' }, { field: 'opening', message: 'y' }],
  })), { orderNumber: 'SO-1' });
  assert.match(invalid.title, /^ส่งไม่สำเร็จ — ขั้น ③ งวดชำระ มี 2 ข้อต้องแก้/);
  assert.equal(invalid.body, 'ลงฐานแล้ว: ใบร่าง SO-1 (ยังไม่ส่งอนุมัติ)');

  const blocked = historicalSaveExit(apiError(409, { code: 'historical_so_contract_file_missing', error: 'ไม่มีไฟล์' }));
  assert.deepEqual(historicalSaveResultView(blocked, { currentStep: 'review' }).action, { key: 'goToStep', label: 'ไปแก้ที่ขั้น ① ลูกค้าและสัญญา', step: 'contract' });
  assert.equal(historicalSaveResultView(blocked, { currentStep: 'contract' }).action, null, 'อยู่ขั้นนั้นแล้ว = ไม่มีปุ่มพาไป');

  const stale = historicalSaveResultView(historicalSaveExit(apiError(409, { code: 'historical_so_edit_state_invalid', error: 'ใบไม่อยู่ในสถานะที่แก้ได้' })));
  assert.equal(stale.action.key, 'reload');
  assert.equal(historicalSaveResultView(historicalSaveExit(apiError(409, { code: 'historical_so_submit_state_invalid', error: 'x' }))).action.key, 'openOrder');
  /* รหัสที่ตารางรหัส → ขั้นไม่รู้จัก = แจ้งผู้ดูแลพร้อมรหัส · ไม่สั่ง "แก้ข้อมูลแล้วกดส่งใหม่" (ไม่มีช่องให้แก้) */
  const unmapped = historicalSaveResultView(historicalSaveExit(apiError(409, { code: 'something_new', error: 'ใหม่' })));
  assert.equal(unmapped.body, 'ใหม่ · แจ้งผู้ดูแลระบบพร้อมรหัส something_new');
  assert.equal(unmapped.action, null);
  /* รหัสที่รู้ขั้น ยังบอกให้แก้ตามข้อความ ไม่ใช่แจ้งผู้ดูแล */
  assert.doesNotMatch(historicalSaveResultView(blocked).body, /แจ้งผู้ดูแลระบบ/);
  assert.equal(historicalSaveResultView(null), null);
});

/* 🔴 มติผู้นำงาน 12/10/2026 (งวด PR-5 · แผน IMPL_PLAN_PR5 §3.4 · ฉาก S21 ของหลักฐานจอ): 503 ของเข็มขัดหลังบันทึกของ 0409
   (`historical_pack_qty_not_stored`) — แผงบันทึกพูดประโยคของ server **ตามที่มันเขียน** ไม่มีอะไรห่อ
   🐞 ของเดิม: กิ่ง 503 ห่อทุกประโยคเป็น "ระบบยังไม่พร้อม — … · ลองส่งอีกครั้งในไม่กี่นาที" ⇒ ประโยคของการส่งซ้ำที่บอกว่า "กดบันทึกซ้ำไม่ช่วย"
      ถูกต่อท้ายด้วยคำชวนลองใหม่ (สองคำสั่งที่ขัดกันในกล่องเดียว) · และใบร่างลงฐานไปแล้ว — "ระบบยังไม่พร้อม" อ่านเหมือนยังไม่มีอะไรถูกบันทึก
   ⚠️ แคบเท่ารหัสนี้รหัสเดียว: 503 ตัวอื่น (ฐานยังไม่รัน 0374 ที่ไม่มีรหัส · เข็มขัดของ 0394) เท่าเดิมทุกไบต์ — เทสต์นี้ตรึงทั้งสองฝั่ง */
test('PR-5 🔴 แผงบันทึก: 503 ของเข็มขัด 0409 = ประโยคของ server ทั้งประโยคตามที่เขียน — ไม่มีคำนำ ไม่มีคำชวนลองใหม่ ไม่มีปุ่ม · 503 ตัวอื่นเท่าเดิมทุกไบต์', () => {
  const NOT_STORED = 'historical_pack_qty_not_stored';
  for (const [sentence, replayed] of [[HISTORICAL_PACK_QTY_NOT_STORED_SAVED, false], [HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED, true]]) {
    const exit = historicalSaveExit(apiError(503, { code: NOT_STORED, error: sentence, orderId: 'SOR-H1', replayed }));
    /* ผลของ 503 พกรหัสมาถึงแผง (กิ่ง 503 ของ historicalSaveExit กระจาย `base` ที่มี `code`) — ไม่งั้นแผงแยกเข็มขัดนี้ออกจาก 503 ตัวอื่นไม่ได้ */
    assert.deepEqual([exit.kind, exit.code, exit.message, exit.hint, exit.canRetry], ['schema', NOT_STORED, sentence, null, false]);
    for (const extra of [
      {}, { stage: 'persist' }, { stage: 'persist', orderNumber: 'SO-26100001-0' },
      { stage: 'contractFiles', orderNumber: 'SO-26100001-0', failedFile: { name: 'PO.pdf', kind: 'contract', key: 'k' }, currentStep: 'review' },
    ]) {
      assert.deepEqual(historicalSaveResultView(exit, extra), { title: 'ส่งไม่สำเร็จ', body: sentence, action: null }, JSON.stringify(extra));
    }
    const said = JSON.stringify(historicalSaveResultView(exit, { stage: 'persist', orderNumber: 'SO-26100001-0' }));
    assert.doesNotMatch(said, /ระบบยังไม่พร้อม|ลองส่งอีกครั้ง|ลองอีกครั้ง|ในไม่กี่นาที|อีกครั้ง/, 'ไม่มีคำนำ / คำชวนลองใหม่รอบประโยคของเข็มขัด');
    /* บรรทัดใต้ปุ่มก็ไม่ชวนกดต่อ (canRetry เท็จ) — ชี้กล่องแดงที่พูดประโยคนี้ */
    assert.equal(historicalReviewFootNote({ plan: PLAN, failed: { orderNumber: 'SO-26100001-0', exit } }).text, 'ส่งไม่สำเร็จ — ดูกล่องแดงเหนือแถบนี้');
  }
  /* ประโยคของการส่งซ้ำเป็นตัวที่ชนกับคำชวนตรง ๆ — ยึดว่ามันยังพูดอย่างนั้น (เปลี่ยนประโยคแล้วเทสต์นี้ต้องถูกอ่านใหม่) */
  assert.match(HISTORICAL_PACK_QTY_NOT_STORED_REPLAYED, /กดบันทึกซ้ำไม่ช่วย/);

  /* 503 ตัวอื่น — เท่าเดิมทุกไบต์ */
  assert.deepEqual(historicalSaveResultView(historicalSaveExit(apiError(503, { error: 'ยังไม่ได้รัน 0374' }))),
    { title: 'ส่งไม่สำเร็จ', body: 'ระบบยังไม่พร้อม — ยังไม่ได้รัน 0374 · ลองส่งอีกครั้งในไม่กี่นาที', action: null });
  assert.deepEqual(
    historicalSaveResultView(historicalSaveExit(apiError(503, { code: 'historical_service_alignment_missing', error: HISTORICAL_ALIGNMENT_MISSING_SAVED, orderId: 'SOR-H1' })), { stage: 'persist', orderNumber: 'SO-26100001-0' }),
    { title: 'ส่งไม่สำเร็จ', body: `ระบบยังไม่พร้อม — ${HISTORICAL_ALIGNMENT_MISSING_SAVED} · ลองส่งอีกครั้งในไม่กี่นาที`, action: null },
  );
  assert.deepEqual(historicalSaveResultView(historicalSaveExit(apiError(503, { code: 'something_else_503', error: 'ฐานยังไม่พร้อม' }))),
    { title: 'ส่งไม่สำเร็จ', body: 'ระบบยังไม่พร้อม — ฐานยังไม่พร้อม · ลองส่งอีกครั้งในไม่กี่นาที', action: null });
});

test('⭐ ถ้อยคำหลังส่ง: เรียกผู้อนุมัติว่า "ผู้จัดการฝ่ายขาย" (มติ 25/09 ข้อ 2) · ไม่นับ Actual', () => {
  assert.equal(historicalSubmitToast('SO-26090001-0'),
    'บันทึกและส่งอนุมัติแล้ว — SO-26090001-0 รอผู้จัดการฝ่ายขายอนุมัติ · ใบย้อนหลังไม่นับ Actual');
  assert.doesNotMatch(historicalSubmitToast(null), /AE Sup|—  /);
});

test('หัวขั้น ④: ลูกค้า · ช่วงสัญญา · ยอดรวมทั้งสิ้น · เลขใบ (ยังไม่ออก = จาง) · คีย์โดยผู้ใช้ที่ล็อกอิน', () => {
  const facts = historicalReviewFacts(PLAN, { customerLabel: 'C-001 บริษัท เอ', keyerName: 'วิภา', vatLabel: '+ VAT 7%' });
  assert.deepEqual(facts.map((f) => f.key), ['customer', 'span', 'total', 'number']);
  assert.equal(facts[0].value, 'C-001 บริษัท เอ');
  assert.equal(facts[0].sub, 'AE สมชาย · ทีม A');
  assert.equal(facts[1].sub, '12 เดือน');
  assert.equal(facts[2].sub, '+ VAT 7%');
  assert.deepEqual([facts[3].value, facts[3].tone, facts[3].sub], ['ออกตอนกดบันทึก', 'muted', 'คีย์โดย วิภา']);
  assert.equal(historicalReviewFacts(PLAN, { orderNumber: 'SO-1' })[3].tone, null);
  assert.deepEqual(historicalReviewFacts(null), []);
});

test('ไฟล์ตัวตัดสินบริสุทธิ์ — ไม่มี React · ไม่ยิง API · ไม่อ่านนาฬิกา · ไม่มี "AE Sup"', () => {
  const src = readFileSync(new URL('./historicalReviewView.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /from ['"]react|apiFetch|apiJson|fetch\(|Date\.now|new Date\(\)/);
  assert.doesNotMatch(src, /AE Sup/);
});
