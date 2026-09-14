import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHistoryRows,
  historyRowKey,
  historySaveItems,
  historyYearOptions,
  isMonthClosed,
  isMonthEditable,
  monthsSum,
  resolveYearTotal,
  systemHintCells,
} from './historyEntry.js';

const JULY_2026 = new Date('2026-07-26T10:00:00+07:00');

test('ตัวเลือกปีต้องมีปีปัจจุบันเป็นตัวแรก — เดือนต้นปีนี้ก็ต้องกรอกย้อนหลังได้', () => {
  assert.deepEqual(historyYearOptions(JULY_2026), ['2026', '2025', '2024', '2023']);
});

test('เดือนที่ยังมาไม่ถึงกรอกไม่ได้ ส่วนปีก่อนกรอกได้ทุกเดือน', () => {
  // ก.ค. 2026 = index 6 → ม.ค.–ก.ค. กรอกได้ ส่วน ส.ค. เป็นต้นไปยังไม่เกิดขึ้น
  assert.equal(isMonthEditable('2026', 0, JULY_2026), true);
  assert.equal(isMonthEditable('2026', 6, JULY_2026), true);
  assert.equal(isMonthEditable('2026', 7, JULY_2026), false);
  assert.equal(isMonthEditable('2026', 11, JULY_2026), false);

  for (let mi = 0; mi < 12; mi += 1) assert.equal(isMonthEditable('2025', mi, JULY_2026), true, `2025-${mi}`);

  assert.equal(isMonthEditable('2027', 0, JULY_2026), false);
  assert.equal(isMonthEditable('ไม่ใช่ปี', 0, JULY_2026), false);
  assert.equal(isMonthEditable('2025', 12, JULY_2026), false);
});

test('เดือนปัจจุบันยัง "ไม่ปิด" — ปุ่มเติมยอดจากระบบต้องไม่แตะเดือนที่ยังเดินอยู่', () => {
  // ก.ค. 2026 = index 6 · กรอกเองได้ (isMonthEditable) แต่ยังไม่ปิด จึงห้ามเติมอัตโนมัติ
  assert.equal(isMonthEditable('2026', 6, JULY_2026), true);
  assert.equal(isMonthClosed('2026', 6, JULY_2026), false);

  assert.equal(isMonthClosed('2026', 5, JULY_2026), true);
  assert.equal(isMonthClosed('2026', 7, JULY_2026), false);
  for (let mi = 0; mi < 12; mi += 1) assert.equal(isMonthClosed('2025', mi, JULY_2026), true, `2025-${mi}`);
  assert.equal(isMonthClosed('2027', 0, JULY_2026), false);
  assert.equal(isMonthClosed('ไม่ใช่ปี', 0, JULY_2026), false);
  assert.equal(isMonthClosed('2025', 12, JULY_2026), false);
});

/* 🪤 งวดต้องนับตามวันไทย ไม่ใช่นาฬิกาของเครื่องที่เปิดหน้า
   สองเคสนี้ห่างกันชั่วโมงเดียวและคร่อมเที่ยงคืนไทยพอดี — ถ้าใครเผลอกลับไปใช้
   `now.getMonth()` เคสแรกจะพัง (เครื่องโซนล้ำหน้าจะนับว่าเป็น ก.ย. แล้ว) */
test('เดือนที่ปิด/แก้ได้ นับตามเวลาไทย ไม่ใช่เวลาเครื่อง', () => {
  const stillAugustBkk = new Date('2026-08-31T16:00:00Z'); // 31 ส.ค. 23:00 ไทย
  const alreadySeptBkk = new Date('2026-08-31T17:00:00Z'); // 1 ก.ย. 00:00 ไทย

  // ส.ค. = index 7
  assert.equal(isMonthClosed('2026', 7, stillAugustBkk), false, 'ยังเป็นสิงหาคมในไทย = ยังไม่ปิด');
  assert.equal(isMonthClosed('2026', 7, alreadySeptBkk), true, 'ขึ้นกันยายนในไทยแล้ว = สิงหาคมปิด');

  // ก.ย. = index 8 — เพิ่งเริ่ม ยังกรอกได้แต่ยังไม่ปิด
  assert.equal(isMonthEditable('2026', 8, stillAugustBkk), false);
  assert.equal(isMonthEditable('2026', 8, alreadySeptBkk), true);
  assert.equal(isMonthClosed('2026', 8, alreadySeptBkk), false);
});

test('ข้ามปีก็ยังนับตามวันไทย', () => {
  const stillDecBkk = new Date('2026-12-31T16:00:00Z'); // 31 ธ.ค. 23:00 ไทย
  const alreadyJanBkk = new Date('2026-12-31T17:00:00Z'); // 1 ม.ค. 2027 00:00 ไทย
  assert.equal(isMonthClosed('2026', 11, stillDecBkk), false);
  assert.equal(isMonthClosed('2026', 11, alreadyJanBkk), true);
  assert.equal(isMonthEditable('2027', 0, stillDecBkk), false);
  assert.equal(isMonthEditable('2027', 0, alreadyJanBkk), true);
});

test('ผลรวมรายเดือนข้ามช่องว่างและค่าที่ไม่ใช่ตัวเลข', () => {
  assert.equal(monthsSum(['', 100, null, 250, undefined, 'x']), 350);
  assert.equal(monthsSum([]), 0);
});

test('ยอดรวมทั้งปีตามผลรวมรายเดือนจนกว่าผู้ใช้จะแตะช่องเอง', () => {
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: null }), { total: 300, mismatch: false });
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: '' }), { total: 300, mismatch: false });
  // แตะแล้ว = คนคุมเอง ห้ามเขียนทับ
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: 500 }), { total: 500, mismatch: true });
  assert.deepEqual(resolveYearTotal({ months: [100, 200], override: 300 }), { total: 300, mismatch: false });
});

test('ปีที่รู้แค่ยอดรวม (ไม่มีรายเดือน) ต้องไม่ขึ้นเตือนว่าไม่ตรง', () => {
  assert.deepEqual(resolveYearTotal({ months: [], override: 1200000 }), { total: 1200000, mismatch: false });
});

/* ---------- แถวสามระดับ (บริษัท / ทีม / รายคน) ---------- */

const USERS = [
  { id: 'u1', name: 'สมชาย', role: 'ae', team: 'KA' },
  { id: 'u2', name: 'สมหญิง', role: 'senior_ae', team: 'ODM' },
  { id: 'u3', name: 'หัวหน้า', role: 'ae_supervisor', team: 'KA' }, // ไม่ถือเป้ารายคน
];
const OWNER_ROLES = ['senior_ae', 'ae'];

test('คีย์แถวต้องแยกสามระดับ และคีย์รายคนต้องมีทีมประกอบเสมอ', () => {
  assert.equal(historyRowKey({}), 'company');
  assert.equal(historyRowKey({ team: 'KA' }), 'team:KA');
  assert.equal(historyRowKey({ team: 'KA', ownerId: 'u1' }), 'owner:KA:u1');
  // คนเดียวกันคนละทีม = คนละแถว (คีย์เดียวกับที่ API ใช้ upsert)
  assert.notEqual(historyRowKey({ team: 'KA', ownerId: 'u1' }), historyRowKey({ team: 'ODM', ownerId: 'u1' }));
});

test('แถวเรียง บริษัท → ทีม → คนในทีม และไม่เอา role ที่ไม่ถือเป้า', () => {
  const rows = buildHistoryRows({ teams: ['KA', 'ODM'], users: USERS, ownerRoles: OWNER_ROLES });
  assert.deepEqual(rows.map((r) => r.key), ['company', 'team:KA', 'owner:KA:u1', 'team:ODM', 'owner:ODM:u2']);
  assert.equal(rows.find((r) => r.key === 'owner:KA:u1').team, 'KA');
});

test('คนที่มีข้อมูลบันทึกไว้แต่ย้ายทีม/ออกแล้ว ต้องยังมีแถวให้เห็นและแก้ได้', () => {
  const savedRows = [
    { period: '2025-03', team: 'KA', ownerId: 'u2', ownerName: 'สมหญิง', actualAmount: 500 }, // ตอนนี้อยู่ ODM
    { period: '2025-04', team: 'KA', ownerId: 'u9', ownerName: 'คนเก่า', actualAmount: 700 }, // ไม่มีในระบบแล้ว
  ];
  const rows = buildHistoryRows({ teams: ['KA', 'ODM'], users: USERS, savedRows, ownerRoles: OWNER_ROLES });
  const detached = rows.filter((r) => r.detached);
  assert.deepEqual(detached.map((r) => r.key), ['owner:KA:u2', 'owner:KA:u9']);
  // u2 ยังอยู่ในระบบ แค่ย้ายทีม — ต้องบอกว่าย้ายไปไหน ไม่ใช่บอกว่าหายไป
  assert.deepEqual(detached[0].detached, { movedTo: 'ODM' });
  assert.deepEqual(detached[1].detached, { gone: true });
  // แถวที่ค้างอยู่ในทีม KA ต้องอยู่ใต้ KA ไม่ใช่ใต้ทีมปัจจุบันของคนนั้น
  assert.equal(detached[0].team, 'KA');
  /* u2 โผล่ **สองแถว** โดยตั้งใจ: ยอดเก่าใต้ KA + ยอดปัจจุบันใต้ ODM
     — คีย์ต่างกัน จึงกรอกแยกกันได้และบันทึกไม่ทับกัน */
  const u2Rows = rows.filter((r) => r.ownerId === 'u2');
  assert.deepEqual(u2Rows.map((r) => [r.team, r.key]), [['KA', 'owner:KA:u2'], ['ODM', 'owner:ODM:u2']]);
});

/* ---------- ทีมตามแถว (มติผู้ใช้ 2026-09-14 "ทีมตามดีล") ----------
   ทีมของยอดย้อนหลังคือ sales_history.team ที่ประทับไว้ ⇒ ทุกคู่ (คน, ทีม) ที่มีแถวบันทึก
   ต้องมีแถวให้เห็นและแก้ได้ · 🪤 เดิมจำแค่ทีมของแถวแรกต่อคน */

test('คนที่มีแถวค้างหลายทีมเดิม ได้แถวค้างครบทุกทีม — ไม่ใช่แค่ทีมของแถวแรก', () => {
  const savedRows = [
    // u9 ออกจากระบบแล้ว มียอดค้างสองทีม · แถวแรกไม่มีชื่อ
    { period: '2025-01', team: 'ODM', ownerId: 'u9', ownerName: null, actualAmount: 100 },
    { period: '2025-02', team: 'KA', ownerId: 'u9', ownerName: 'คนเก่า', actualAmount: 200 },
    { period: '2025-03', team: 'ODM', ownerId: 'u9', ownerName: 'คนเก่า', actualAmount: 300 },
    // u2 อยู่ ODM ตอนนี้ — แถวแรกเป็นทีมปัจจุบัน ⇒ ของเดิมทำแถวค้าง KA หายทั้งแถว
    { period: '2025-04', team: 'ODM', ownerId: 'u2', ownerName: 'สมหญิง', actualAmount: 400 },
    { period: '2025-05', team: 'KA', ownerId: 'u2', ownerName: 'สมหญิง', actualAmount: 500 },
    // u1 อยู่ KA — มียอดค้างสองทีมเดิม (ODM, SV) + ยอดทีมปัจจุบัน
    { period: '2025-06', team: 'ODM', ownerId: 'u1', ownerName: 'สมชาย', actualAmount: 600 },
    { period: '2025-07', team: 'SV', ownerId: 'u1', ownerName: 'สมชาย', actualAmount: 700 },
    { period: '2025-08', team: 'KA', ownerId: 'u1', ownerName: 'สมชาย', actualAmount: 800 },
  ];
  const rows = buildHistoryRows({ teams: ['KA', 'ODM', 'SV'], users: USERS, savedRows, ownerRoles: OWNER_ROLES });
  assert.deepEqual(rows.map((r) => r.key), [
    'company',
    'team:KA', 'owner:KA:u1', 'owner:KA:u9', 'owner:KA:u2',
    'team:ODM', 'owner:ODM:u2', 'owner:ODM:u9', 'owner:ODM:u1',
    'team:SV', 'owner:SV:u1',
  ]);
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, 'คีย์ซ้ำ = สองแถวแชร์ค่าก้อนเดียวแล้วบันทึกทับกัน');

  // ทุกคู่ (ทีม, คน) ที่มีแถวบันทึก ต้องมีแถวบนจอ — ไม่งั้นยอดยังถูกทับบนแท็บผลงานแต่แก้ไม่ได้
  for (const saved of savedRows) {
    const key = historyRowKey({ team: saved.team, ownerId: saved.ownerId });
    const row = rows.find((r) => r.key === key);
    assert.ok(row, `ไม่มีแถวของ ${key}`);
    assert.equal(row.team, saved.team, `${key} ต้องอยู่ใต้ทีมที่ประทับบนแถว ไม่ใช่ทีมปัจจุบันของคน`);
  }

  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual(byKey['owner:KA:u9'].detached, { gone: true });
  assert.deepEqual(byKey['owner:ODM:u9'].detached, { gone: true });
  // ชื่อเป็นเรื่อง "ใคร" — คนที่ไม่มีบัญชีแล้วใช้ชื่อแรกที่มีจริง ไม่ถอยไปเป็น uuid ในทีมที่แถวแรกไม่มีชื่อ
  assert.equal(byKey['owner:ODM:u9'].ownerName, 'คนเก่า');
  assert.equal(byKey['owner:KA:u9'].ownerName, 'คนเก่า');
  assert.deepEqual(byKey['owner:KA:u2'].detached, { movedTo: 'ODM' });
  assert.deepEqual(byKey['owner:ODM:u1'].detached, { movedTo: 'KA' });
  assert.deepEqual(byKey['owner:SV:u1'].detached, { movedTo: 'KA' });
  // แถวของทีมที่คนนั้นยังสังกัด ไม่ใช่แถวค้าง
  assert.equal(byKey['owner:KA:u1'].detached, undefined);
  assert.equal(byKey['owner:ODM:u2'].detached, undefined);
});

test('แถวค้างหลายเดือนในทีมเดียวกัน = แถวเดียว · แถวคนที่ไม่มีทีมยังไม่ถูกวาดเหมือนเดิม', () => {
  const savedRows = [
    { period: '2025-01', team: 'KA', ownerId: 'u2', ownerName: 'สมหญิง', actualAmount: 1 },
    { period: '2025-02', team: 'KA', ownerId: 'u2', ownerName: 'สมหญิง', actualAmount: 2 },
    { period: '2025-03', team: null, ownerId: 'u9', ownerName: 'คนเก่า', actualAmount: 3 },
  ];
  const rows = buildHistoryRows({ teams: ['KA', 'ODM'], users: USERS, savedRows, ownerRoles: OWNER_ROLES });
  assert.deepEqual(rows.filter((r) => r.detached).map((r) => r.key), ['owner:KA:u2']);
});

/* ---------- ตัวเลขใบ้จากยอดระบบ (payload แดชบอร์ด) ---------- */

test('ตัวเลขใบ้: ถังไร้ทีมไม่ลงแถวบริษัท · แถวคนไม่มี ownerId ไม่ลงแถวทีม · คีย์เดียวกันบวกกัน', () => {
  const months = [
    {
      month: '2025-03',
      totals: { wonValue: 1000 },
      byTeam: [{ team: 'KA', won: 700 }, { team: 'ODM', won: 250 }, { team: null, won: 50 }],
      byOwner: [
        { ownerId: 'u1', team: 'KA', won: 400 },
        { ownerId: 'u1', team: 'KA', won: 100 }, // คนเดียวกันอีกแถวในทีมเดียวกัน — ต้องบวก ไม่ใช่แถวหลังชนะ
        { ownerId: null, ownerName: 'ไม่ระบุ', team: 'KA', won: 200 }, // ห้ามไปทับแถว team:KA
        { ownerId: 'u1', team: 'ODM', won: 250 }, // คนเดียวกันอีกทีม = อีกแถว
        { ownerId: 'u5', team: null, won: 50 },
        { ownerId: 'u2', team: 'KA', won: 0 },
      ],
    },
    { month: '2025-04', totals: { wonValue: 30 }, byTeam: [{ team: 'KA', won: 30 }], byOwner: [{ ownerId: 'u1', team: 'KA', won: 30 }] },
    { month: 'ไม่ใช่เดือน', totals: { wonValue: 999 } },
  ];
  assert.deepEqual(systemHintCells(months), {
    company: { 2: 1000, 3: 30 }, // 🪤 ของเดิม: ถังไร้ทีมเขียนทับเป็น 50
    'team:KA': { 2: 700, 3: 30 },
    'team:ODM': { 2: 250 },
    'owner:KA:u1': { 2: 500, 3: 30 },
    'owner:ODM:u1': { 2: 250 },
    'owner:-:u5': { 2: 50 }, // ไม่มีแถวบนจอให้วาง แต่ไม่ไปปนคีย์ของใคร
  });
  assert.deepEqual(systemHintCells(), {});
  assert.deepEqual(systemHintCells(null), {});
});

test('ตัวเลขใบ้: payload ที่ทุกดีลมีทีมและทุกแถวคนมี ownerId ได้ผลเท่าของเดิมทุกช่อง', () => {
  // สำเนากติกาเดิมของหน้า (เขียนทับ ไม่ข้ามอะไร) — ข้อมูลวันนี้เป็นรูปนี้ ตัวเลขใบ้ต้องไม่ขยับ
  const legacy = (months) => {
    const sys = {};
    for (const month of months) {
      const mi = Number(String(month.month).slice(5, 7)) - 1;
      if (mi < 0 || mi > 11) continue;
      const put = (key, amount) => { if (Number(amount) > 0) (sys[key] ||= {})[mi] = Number(amount); };
      put('company', month.totals?.wonValue);
      for (const t of month.byTeam || []) put(historyRowKey({ team: t.team }), t.won);
      for (const o of month.byOwner || []) put(historyRowKey({ team: o.team, ownerId: o.ownerId }), o.won);
    }
    return sys;
  };
  const months = [
    { month: '2026-01', totals: { wonValue: 900 }, byTeam: [{ team: 'KA', won: 600 }, { team: 'ODM', won: 300 }],
      byOwner: [{ ownerId: 'u1', team: 'KA', won: 600 }, { ownerId: 'u2', team: 'ODM', won: 300 }] },
    { month: '2026-02', totals: { wonValue: 0 }, byTeam: [{ team: 'KA', won: 0 }], byOwner: [{ ownerId: 'u1', team: 'KA', won: 0 }] },
  ];
  assert.deepEqual(systemHintCells(months), legacy(months));
});

/* ---------- แปลงเป็น items ของ POST ---------- */

const ROWS = [
  { key: 'company', scope: 'company', team: null, ownerId: null, ownerName: null },
  { key: 'team:KA', scope: 'team', team: 'KA', ownerId: null, ownerName: null },
  { key: 'owner:KA:u1', scope: 'owner', team: 'KA', ownerId: 'u1', ownerName: 'สมชาย' },
];

test('ช่องว่าง = ไม่ส่งแถวนั้น (คนละความหมายกับใส่ 0)', () => {
  const items = historySaveItems({
    rows: ROWS,
    values: { 'team:KA': { months: Array(12).fill(''), yearOverride: null } },
    year: '2025',
    now: JULY_2026,
  });
  assert.deepEqual(items, []);

  const withZero = historySaveItems({
    rows: ROWS,
    values: { 'team:KA': { months: Object.assign(Array(12).fill(''), { 0: 0 }), yearOverride: null } },
    year: '2025',
    now: JULY_2026,
  });
  assert.equal(withZero.length, 1);
  assert.equal(withZero[0].actualAmount, 0);
  // 0 ทั้งปี → ไม่มีแถวรายปี (resolveYearTotal = 0) แต่แถวรายเดือนยังต้องถูกส่ง
  assert.equal(withZero.filter((i) => i.periodType === 'year').length, 0);
});

test('ส่ง team/ownerId/ownerName ตามระดับของแถว และมีแถวรายปีต่อระดับ', () => {
  const items = historySaveItems({
    rows: ROWS,
    values: {
      'owner:KA:u1': { months: Object.assign(Array(12).fill(''), { 0: 100, 1: 200 }), yearOverride: null },
    },
    year: '2025',
    now: JULY_2026,
  });
  assert.deepEqual(items.map((i) => [i.period, i.periodType, i.team, i.ownerId, i.actualAmount]), [
    ['2025-01', 'month', 'KA', 'u1', 100],
    ['2025-02', 'month', 'KA', 'u1', 200],
    ['2025', 'year', 'KA', 'u1', 300],
  ]);
  assert.equal(items[0].ownerName, 'สมชาย');
  // ⚠️ ห้ามมี targetAmount เด็ดขาด — แถวเดียวกันเก็บเป้าที่ตัวช่วยวางเป้าบันทึกไว้
  for (const item of items) assert.equal(Object.hasOwn(item, 'targetAmount'), false);
});

test('เดือนที่ยังมาไม่ถึงไม่ถูกส่งขึ้น server แม้จะมีค่าค้างในช่อง', () => {
  const items = historySaveItems({
    rows: ROWS,
    values: { company: { months: Object.assign(Array(12).fill(''), { 6: 10, 7: 999 }), yearOverride: null } },
    year: '2026',
    now: JULY_2026, // ก.ค. 2026 = index 6 → index 7 ยังมาไม่ถึง
  });
  assert.deepEqual(items.filter((i) => i.periodType === 'month').map((i) => i.period), ['2026-07']);
  // แต่ยอดรายปีคิดจากค่าที่กรอกทั้งหมดตามที่ผู้ใช้เห็นบนจอ
  assert.equal(items.find((i) => i.periodType === 'year').actualAmount, 1009);
});
