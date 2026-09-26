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
import { HISTORICAL_APPROVER_LABEL } from './historicalOrders.js';

const apiError = (status, data) => Object.assign(new Error(data?.error || 'x'), { status, data });

/* แผนขนาดเล็กรูปเดียวกับที่ planHistoricalServiceOrder คืน (เฉพาะช่องที่ขั้น ④ อ่าน) */
const PLAN = Object.freeze({
  header: {
    customerName: 'บริษัท เอ จำกัด', ownerName: 'สมชาย', team: 'A', totalAmount: 261936, vatRate: 7,
    refs: { quote: 'QT-OLD-1', express: '', invoice: 'IV-2601-0412' }, notes: '',
  },
  contract: { docKind: 'customer_po', ref: 'PO-7781', startDate: '2026-01-01', endDate: '2026-12-31' },
  lines: [
    { zoneId: 'Z-1', siteId: 'S-1', siteCode: 'ST-01', siteName: 'อาคาร A' },
    { zoneId: 'Z-2', siteId: 'S-1', siteCode: 'ST-01', siteName: 'อาคาร A' },
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
  assert.deepEqual(rows.map((r) => r.key), ['contract', 'signedFile', 'refs', 'zones', 'opening', 'remaining', 'verdict']);
  assert.equal(rowOf(rows, 'contract').value, 'ใบสั่งซื้อของลูกค้า (PO) PO-7781 · 01/01/2026–31/12/2026 · 12 เดือน');
  assert.equal(rowOf(rows, 'signedFile').value, 'PO-7781.pdf');
  assert.equal(rowOf(rows, 'refs').value, 'QT-OLD-1 · IV-2601-0412');
  assert.equal(rowOf(rows, 'zones').value, '2 โซน — ST-01 อาคาร A 2 โซน');
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
  assert.deepEqual(rows.map((r) => r.key), ['contract', 'signedFile', 'refs', 'notes', 'zones', 'zero']);
  assert.match(rowOf(rows, 'zero').value, /ด่านเงินของนัดบริการผ่านเอง/);
  /* ยอดใบเปลี่ยนที่รายการ — ขั้น ③ ของใบ ฿0 ไม่มีช่อง (และไม่มีจุดยึด) ให้พาไป */
  assert.deepEqual([rowOf(rows, 'zero').step, rowOf(rows, 'zero').field], ['zones', 'zones']);
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
