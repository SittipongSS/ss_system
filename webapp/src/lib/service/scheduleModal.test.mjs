// ── โมดัลจัดคิวแบบ A "สองคอลัมน์" (มติเจ้าของ 24/09) — ตรรกะล้วนของเปลือกเดียวสองงาน ─────────
//
// ⭐ ตัวเลขและข้อความทั้งหมดมาจาก fixture ของ BRIEF §C (mockups/schedule-modal/BRIEF.md) — วันเดียวกัน
//    (พฤ. 1 ต.ค. 2026) ภาระชุดเดียวกัน ⇒ ถ้าตัวเลขในเทสต์ไม่ตรงม็อก แปลว่าตรรกะเพี้ยน ไม่ใช่ม็อก
// ⚠️ คอมโพเนนต์เป็น JSX (import ใต้ raw node ไม่ได้) ⇒ กติกาทุกข้ออยู่ใน `scheduleModal.js` และเทสต์ที่นี่
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_UNKNOWN_TEXT, CREW_GONE_NOTE, CREW_NODATE_TEXT, CREW_ROSTER_TEXT, CREW_UNKNOWN_TEXT, DRAFT_STATUS_OPTIONS,
  GATE_CAPTIONS, HELPER_GONE_TEXT, HELPER_LOADING_TEXT, LOAD_BAR_SCALE, OVERRIDE_TRACE_TEXT, STAMPED_STATUS_HINT,
  ZONE_SKIPPED_TAG,
  accessLine, applyTimePreset, commitDueGateView, crewPickerView, gatePanelView, gateShortReasons, helperChipsView,
  keepTogetherRuns, loadBarCells, orderHelperIds, pickTimePreset, releaseSlotText,
  releasedToastText, threadDigest, timePresetOf, timePresetOptions, visitHeaderView, visitJobRows, visitModalView,
} from './scheduleModal.js';
import { accessWarnText } from './queueWords.js';
import { projectedDayLoad } from './visitLoad.js';
import { commitDueOutcome } from '../requests/commitDue.js';
import { crewLoadPeople, freeCrewOn } from './scheduleQueue.js';
import { evaluateVisitGate, gateBlocker, initialVisitStatus } from './visitGate.js';
import { visitDeleteButton, VISIT_DELETE_BLOCKS } from './visitDelete.js';
import { surveyVisitDraft } from './surveyVisit.js';
import { MAX_ASSETS_PER_DAY } from './visitLoad.js';
import { NA } from '../format.js';

const TODAY = '2026-09-24';   // พฤ.
const DAY = '2026-10-01';     // พฤ. 1 ต.ค. — วันนัดของทั้งสองเคส

/* ── BRIEF C0: รายชื่อ + ภาระของวันนั้น (นัดที่อยู่บนตารางเท่านั้น) ─────────────────── */
const ROSTER = [
  ['AP', 'Apisith Pattangthani', 'Planer'],
  ['AJ', 'Ariya Jintapanichakarn', 'supervisor'],
  ['AA', 'Arnon Aunsapwilai', 'Audit'],
  ['NP', 'Nattawut Pornprasit', 'Operations'],
  ['PK', 'Peera Khantawee', 'Operations'],
  ['PA', 'Phuwadol Aoonnankad', 'Operations'],
  ['VT', 'Veerachai Teratumtada', 'Operations'],
  ['WB', 'Witthaya Bunyotha', 'Operations'],
];
const technicians = ROSTER.map(([id, name]) => ({ id, name }));
const crewByUser = new Map(ROSTER.map(([id, , team]) => [id, team]));
const teamNames = new Map(ROSTER.map(([, , team]) => [team, team]));
const live = (id, code, who, siteId, startTime, endTime) => ({
  id, code, status: 'scheduled', scheduledDate: DAY, assigneeId: who, siteId, startTime, endTime,
});
const dayVisits = [
  live('V31', 'SV-26090031', 'NP', 'W5', '09:00', '10:00'),
  live('V35', 'SV-26090035', 'NP', 'W4', '13:30', '15:30'),
  live('V28', 'SV-26090028', 'VT', 'X5', '08:30', '10:00'),
  live('V29', 'SV-26090029', 'VT', 'X6', '10:30:00', '12:30:00'),
  live('V33', 'SV-26090033', 'VT', 'X3', '14:00', '16:00'),
  // ร่างไม่นับภาระ ไม่ทำให้ใครไม่ว่าง
  { ...live('V99', 'SV-26090099', 'PK', 'X6', '10:30', '12:00'), status: 'draft' },
];
const workload = {
  W5: { assets: 5, packs: 2 }, W4: { assets: 4, packs: 1 },
  X5: { assets: 5, packs: 2 }, X6: { assets: 6, packs: 2 }, X3: { assets: 3, packs: 1 },
};
const people = crewLoadPeople({ visits: dayVisits, dateIso: DAY, workload, technicians, crewByUser, teamNames });
const load = { state: 'ok', people };

/* ── BRIEF C1: ร่างเติมน้ำหอมของรอบบริการ ─────────────────────────────────────────── */
const riverside = {
  id: 'ST-RS', code: 'ST-0388-01-BKK-1093', name: 'โรงแรม เดอะ ริเวอร์ไซด์ สาทร',
  customerName: 'บริษัท ริเวอร์ไซด์ ฮอสพิทาลิตี้ จำกัด', routeZone: 'BKK',
  accessDays: [1, 2, 3, 4, 5], accessFrom: '10:00:00', accessTo: '16:00:00', accessNote: 'เข้าทางลานจอด B1 แลกบัตรที่ รปภ.',
};
const riversideCtx = {
  site: riverside,
  zones: [{ id: 'Z1', name: 'ล็อบบี้ชั้น G' }, { id: 'Z2', name: 'ห้องอาหาร ชั้น 2' }],
  terms: [
    { id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', startDate: '2026-08-01', endDate: '2027-07-31' },
    { id: 'T2', zoneId: 'Z2', salesOrderId: 'SO1', startDate: '2026-08-01', endDate: '2027-07-31' },
  ],
  ordersById: { SO1: { id: 'SO1', status: 'approved', serviceContractId: 'CT1' } },
  contractsById: { CT1: { id: 'CT1', status: 'signed', effectiveDate: '2026-08-01', expiryDate: '2027-07-31' } },
  installmentsByOrderId: { SO1: [{ status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-10-31', dueDate: '2026-08-01' }] },
};
const draft21 = {
  id: 'SVV-21', code: 'SV-26090021', siteId: 'ST-RS', planId: 'PL-1', kind: 'refill', status: 'draft',
  scheduledDate: DAY, startTime: '10:30:00', endTime: '12:00:00', assigneeId: null, assigneeName: null,
};
const form21 = (over = {}) => ({
  siteId: 'ST-RS', kind: 'refill', scheduledDate: DAY, startTime: '10:30', endTime: '12:00',
  assigneeId: '', assigneeName: '', assistantIds: [], status: 'draft', actualDate: '', actualStartTime: '',
  actualEndTime: '', summary: '', note: '', rescheduleReason: '', unableReason: '', ...over,
});

/* ── BRIEF C2: ประเมินพื้นที่ ─────────────────────────────────────────────────────── */
const hostel = {
  id: 'ST-HH', code: 'ST-1011-01-BKK-1162', name: 'หอม คุ้กกิ้ง โฮสเทล', customerName: 'บริษัท หอมคุ้กกิ้งโฮสเทล จำกัด',
  routeZone: 'BKK', accessDays: [], accessFrom: '10:00', accessTo: '20:00',
};
const surveyRequest = { id: 'DR-192', docNo: 'RQ-AS-26090192', siteId: 'ST-HH', kind: 'site_survey' };

/* ═══ เวลานัด ═══════════════════════════════════════════════════════════════════════ */
test('แผ่นเวลาที่เลือกอยู่อ่านจากเวลาในฟอร์ม — ปุ่มลัดตรงเป๊ะ · ว่าง = ไม่ระบุ · อื่น ๆ = กำหนดเอง', () => {
  assert.equal(timePresetOf({ startTime: '09:00', endTime: '12:00' }), 'morning');
  assert.equal(timePresetOf({ startTime: '13:00', endTime: '17:00' }), 'afternoon');
  assert.equal(timePresetOf({ startTime: '09:00', endTime: '17:00' }), 'fullday');
  assert.equal(timePresetOf({ startTime: '', endTime: '' }), 'none');
  assert.equal(timePresetOf({}), 'none');
  assert.equal(timePresetOf({ startTime: '10:30', endTime: '12:00' }), 'custom', 'BRIEF C1: ไม่ตรงปุ่มลัดไหน');
  assert.equal(timePresetOf({ startTime: '11:00' }), 'custom', 'เวลาเริ่มอย่างเดียว (ลงคิวเข้าพื้นที่)');
  // Postgres คืน '09:00:00' — ต้องยังจำได้ว่าเป็นช่วงเช้า
  assert.equal(timePresetOf({ startTime: '09:00:00', endTime: '12:00:00' }), 'morning');
});

test('แผ่นเวลาทั้งแถว — ห้าแผ่นเมื่อมีเวลาจบ · ลงคิวเข้าพื้นที่ (เวลาเริ่มอย่างเดียว) สี่แผ่น เช้า/บ่ายบอกเวลาเริ่ม', () => {
  assert.deepEqual(timePresetOptions().map((o) => [o.key, o.label, o.sub]), [
    ['morning', 'เช้า', '09–12'],
    ['afternoon', 'บ่าย', '13–17'],
    ['fullday', 'เต็มวัน', ''],
    ['none', 'ไม่ระบุเวลา', ''],
    ['custom', 'กำหนดเอง', ''],
  ]);
  /* 🐞 รีวิว UAT 24/09: ลงคิวเคยเหลือสองแผ่น (ไม่ระบุ/กำหนดเอง) ต่างจากแบบ A ที่เจ้าของเลือก ⇒ เช้า/บ่ายกลับมา
     แต่ **เติมแค่เวลาเริ่ม** (ก้อนที่ส่งเก็บได้แค่ `committedDueTime`) และป้ายบอกเวลาเริ่ม ไม่ใช่ช่วง "09–12"
     ⚠️ ไม่มี "เต็มวัน" — เวลาเริ่มอย่างเดียวของเต็มวัน (09:00) ซ้ำกับเช้า และ "ไปทั้งวัน" คือ "ไม่ระบุเวลา" อยู่แล้ว */
  assert.deepEqual(timePresetOptions({ withEnd: false }).map((o) => [o.key, o.label, o.sub]), [
    ['morning', 'เช้า', '09:00'],
    ['afternoon', 'บ่าย', '13:00'],
    ['none', 'ไม่ระบุเวลา', ''],
    ['custom', 'กำหนดเอง', ''],
  ]);
});

test('แผ่นเวลาแบบเวลาเริ่มอย่างเดียว (ลงคิวเข้าพื้นที่): ตรงแผ่นด้วยเวลาเริ่ม · กดแล้วไม่มีเวลาจบ', () => {
  const startOnly = { withEnd: false };
  assert.equal(timePresetOf({ startTime: '09:00' }, startOnly), 'morning');
  assert.equal(timePresetOf({ startTime: '13:00:00' }, startOnly), 'afternoon');
  assert.equal(timePresetOf({ startTime: '11:00' }, startOnly), 'custom', 'BRIEF C2: 11:00 ไม่ตรงแผ่นไหน');
  assert.equal(timePresetOf({ startTime: '' }, startOnly), 'none');
  assert.equal(timePresetOf({ startTime: '09:00', endTime: '12:00' }, startOnly), 'morning', 'เวลาจบไม่นับ (ไม่ถูกเก็บ)');
  assert.deepEqual(applyTimePreset('morning', { startTime: '11:00' }, startOnly), { startTime: '09:00', endTime: '' });
  assert.deepEqual(applyTimePreset('afternoon', {}, startOnly), { startTime: '13:00', endTime: '' });
  assert.deepEqual(applyTimePreset('fullday', { startTime: '11:00' }, startOnly), { startTime: '11:00', endTime: '' },
    'ไม่มีแผ่นเต็มวันในโหมดนี้ — ไม่เติมเวลาที่ไม่มีปุ่ม');
  // โหมดเดิม (มีเวลาจบ) ไม่ขยับ
  assert.equal(timePresetOf({ startTime: '09:00' }), 'custom');
});

/* 🐞 รีวิว UAT 24/09: ลูกศรบนแผ่นเวลาเลือกไปด้วย (radio) ⇒ จาก "กำหนดเอง" 10:30–12:00 กดลูกศรครั้งเดียว
   เวลาที่พิมพ์ถูกทับ/ล้าง แล้วกลับมา "กำหนดเอง" ได้ค่าของปุ่มลัดแทน — เวลาที่พิมพ์หายเงียบ ๆ
   ⇒ ออกจาก "กำหนดเอง" เมื่อไร จำเวลาที่พิมพ์ไว้ · กลับมา "กำหนดเอง" ได้คืน (ทั้งเมาส์และคีย์บอร์ด) */
test('🐞 กดแผ่นเวลา: ออกจาก "กำหนดเอง" จำเวลาที่พิมพ์ไว้ · กลับมาได้คืน (กำหนดเอง → ไม่ระบุ → กำหนดเอง)', () => {
  const typed = { startTime: '10:30', endTime: '12:00' };
  const toNone = pickTimePreset('none', { selected: 'custom', current: typed, remembered: null });
  assert.deepEqual(toNone.times, { startTime: '', endTime: '' });
  assert.deepEqual(toNone.remembered, typed);
  const back = pickTimePreset('custom', { selected: 'none', current: toNone.times, remembered: toNone.remembered });
  assert.deepEqual(back.times, typed, 'เวลาที่พิมพ์กลับมา');

  // ลูกศรวนผ่านหลายแผ่น (กำหนดเอง → เช้า → บ่าย → กำหนดเอง) ยังได้ของเดิม — จำตอนออกจากกำหนดเองเท่านั้น
  let step = pickTimePreset('morning', { selected: 'custom', current: typed, remembered: null });
  assert.deepEqual(step.times, { startTime: '09:00', endTime: '12:00' });
  step = pickTimePreset('afternoon', { selected: 'morning', current: step.times, remembered: step.remembered });
  step = pickTimePreset('custom', { selected: 'afternoon', current: step.times, remembered: step.remembered });
  assert.deepEqual(step.times, typed);

  // ไม่เคยพิมพ์เอง = กำหนดเองคงค่าปัจจุบัน (พฤติกรรมเดิม)
  assert.deepEqual(pickTimePreset('custom', { selected: 'morning', current: { startTime: '09:00', endTime: '12:00' } }).times,
    { startTime: '09:00', endTime: '12:00' });
  // ออกจากกำหนดเองที่ยังว่างอยู่ ไม่ทับของที่จำไว้
  assert.deepEqual(pickTimePreset('none', { selected: 'custom', current: {}, remembered: typed }).remembered, typed);
  // ลงคิวเข้าพื้นที่ (เวลาเริ่มอย่างเดียว) — แผ่นสองแผ่นเดิมเคยล้างเวลาเริ่มทุกครั้งที่กดลูกศร
  const survey = pickTimePreset('none', { selected: 'custom', current: { startTime: '11:00' }, withEnd: false });
  assert.deepEqual(survey.remembered, { startTime: '11:00', endTime: '' });
  assert.deepEqual(pickTimePreset('custom', { selected: 'none', current: survey.times, remembered: survey.remembered, withEnd: false }).times,
    { startTime: '11:00', endTime: '' });
});

test('กดแผ่นเวลา — ปุ่มลัดเติมทั้งคู่ · ไม่ระบุล้าง · กำหนดเองคงค่าเดิม', () => {
  assert.deepEqual(applyTimePreset('afternoon', { startTime: '10:30', endTime: '12:00' }), { startTime: '13:00', endTime: '17:00' });
  assert.deepEqual(applyTimePreset('none', { startTime: '10:30', endTime: '12:00' }), { startTime: '', endTime: '' });
  assert.deepEqual(applyTimePreset('custom', { startTime: '10:30', endTime: '12:00' }), { startTime: '10:30', endTime: '12:00' });
  assert.deepEqual(applyTimePreset('custom', {}), { startTime: '', endTime: '' });
});

/* ═══ ช่วงที่ไซต์ให้เข้า ═══════════════════════════════════════════════════════════ */
test('บรรทัดช่วงเข้าไซต์ใต้เวลา: อยู่ในช่วง · ชน · ไม่ระบุเวลา · ไซต์ไม่จำกัด · จอไม่รู้', () => {
  assert.deepEqual(accessLine(riverside, { date: DAY, startTime: '10:30', endTime: '12:00' }), {
    state: 'ok', windowText: 'จ. อ. พ. พฤ. ศ. · 10:00–16:00', text: '10:30–12:00 อยู่ในช่วง',
  });
  /* 🐞 รีวิว UAT 24/09: ชนแล้วบรรทัดพูดช่วงซ้ำสองรอบ ("ไซต์ให้เข้า … 10:00–16:00 — เข้าก่อนเวลา… (10:00–16:00)")
     ⇒ ช่วงอยู่หน้าเส้นแล้ว ท้ายเส้นบอกแค่เวลาของนัดกับสิ่งที่ชน */
  assert.deepEqual(accessLine(riverside, { date: DAY, startTime: '09:00', endTime: '12:00' }), {
    state: 'conflict', windowText: 'จ. อ. พ. พฤ. ศ. · 10:00–16:00', text: '09:00–12:00 เข้าก่อนเวลาที่ไซต์อนุญาต',
  });
  assert.equal(accessLine(riverside, { date: '2026-10-03' }).text, 'ส. 3 ต.ค. ไม่ใช่วันที่ไซต์ให้เข้า');
  // วันที่ไซต์ไม่ให้เข้า ชนได้แม้ยังไม่ระบุเวลา (กติกาเดียวกับด่าน ④)
  assert.equal(accessLine(riverside, { date: '2026-10-03', startTime: '', endTime: '' }).state, 'conflict');
  assert.deepEqual(accessLine(riverside, { date: DAY, startTime: '', endTime: '' }), {
    state: 'untimed', windowText: 'จ. อ. พ. พฤ. ศ. · 10:00–16:00', text: 'ยังไม่ระบุเวลา',
  });
  assert.equal(accessLine({ id: 'X' }, { date: DAY, startTime: '10:00' }).state, 'open');
  assert.equal(accessLine(hostel, { date: DAY, startTime: '11:00' }).text, '11:00 อยู่ในช่วง');
  assert.deepEqual(accessLine(hostel, { date: DAY, startTime: '21:00' }), {
    state: 'conflict', windowText: '10:00–20:00', text: '21:00 เริ่มหลังเวลาที่ไซต์ปิดรับ',
  });
  assert.equal(accessLine(null, { date: DAY }), null, 'ยังไม่เลือกไซต์');
  /* หน้าใบคำร้องไม่มีช่วงเข้าในมือ — 🐞 รีวิว UAT 24/09: เคยบอก "ตรวจตอนลงคิว" ทั้งที่ server ไม่ได้ตรวจ
     (`loadSurveySite` ไม่ได้ select ช่วงเวลา) ⇒ บอกตรง ๆ ว่าจอนี้ไม่เห็น และไม่บล็อก */
  assert.deepEqual(accessLine(null, {}, { known: false }), { state: 'unknown', windowText: '', text: ACCESS_UNKNOWN_TEXT });
  assert.equal(ACCESS_UNKNOWN_TEXT, 'หน้านี้ไม่เห็นช่วงที่ไซต์ให้เข้า — ไม่บล็อกการลงคิว');
  assert.doesNotMatch(ACCESS_UNKNOWN_TEXT, /ตรวจตอนลงคิว/);
});

/* ═══ ด่าน ═════════════════════════════════════════════════════════════════════════ */
test('⭐ BRIEF C1: ด่านร่างเติมน้ำหอม ผ่าน 3 จาก 4 · ข้อ ③ ของ TS มีลิงก์ "เลือกเจ้าหน้าที่" · ข้อ ④ บอกว่าผ่านเพราะอะไร', () => {
  const gate = evaluateVisitGate({ ...draft21, ...form21() }, riversideCtx);
  const view = gatePanelView(gate, { visit: form21(), site: riverside, mode: 'draft' });
  assert.equal(view.summary, 'ผ่าน 3 จาก 4 ข้อ');
  assert.equal(view.ready, false);
  assert.equal(view.tone, 'warning');
  assert.equal(view.verdict, 'ยังขึ้นตารางไม่ได้');
  assert.equal(view.caption, GATE_CAPTIONS.draft);
  assert.deepEqual(view.rows.map((r) => [r.n, r.key, r.state, r.owner]), [
    ['①', 'contract', 'pass', 'SA'],
    ['②', 'payment', 'pass', 'SA → FN'],
    ['③', 'assignee', 'fail', 'TS'],
    ['④', 'access', 'pass', 'TS'],
  ]);
  const assignee = view.rows[2];
  assert.equal(assignee.detail, 'ยังไม่มอบหมาย', 'ครึ่งหลังของเหตุเป็นลิงก์แก้แทน (คำเดียวกับการ์ด)');
  assert.deepEqual(assignee.fix, { key: 'assignee', label: 'เลือกเจ้าหน้าที่', field: 'assignee' });
  assert.equal(assignee.ownerTone, 'info');
  assert.equal(view.rows[3].detail, '10:30–12:00 อยู่ในช่วง 10:00–16:00');

  // เลือก Phuwadol ⇒ 4/4 และข้อ ③ บอกชื่อ
  const picked = form21({ assigneeId: 'PA', assigneeName: 'Phuwadol Aoonnankad' });
  const after = gatePanelView(evaluateVisitGate(picked, riversideCtx), { visit: picked, site: riverside });
  assert.equal(after.summary, 'ผ่าน 4 จาก 4 ข้อ');
  assert.equal(after.verdict, 'ปล่อยขึ้นตารางได้');
  assert.equal(after.tone, 'success');
  assert.equal(after.rows[2].detail, 'Phuwadol Aoonnankad');
  assert.equal(after.rows[2].fix, null);
});

test('⭐ BRIEF C2: ประเมินพื้นที่ ①② ไม่ต้องตรวจ (นับว่าผ่าน) · ④ ไม่รู้ช่วงเข้า = unknown ไม่นับ', () => {
  const draft = surveyVisitDraft({ request: surveyRequest, date: DAY, time: '11:00' });
  const gate = evaluateVisitGate(draft, { site: hostel });
  const view = gatePanelView(gate, { visit: draft, site: hostel, mode: 'create' });
  assert.deepEqual(view.rows.map((r) => r.state), ['exempt', 'exempt', 'fail', 'pass']);
  /* 🐞 รีวิว UAT 24/09: ข้อความเต็มของด่าน "(มติผู้ใช้ 2026-08-31)" ตัดบรรทัดกลางวันที่บน 390px · แบบ A เขียนสั้น */
  assert.deepEqual(view.rows.slice(0, 2).map((r) => r.detail), ['ไม่ต้องตรวจ — งานสำรวจ', 'ไม่ต้องตรวจ — งานสำรวจ']);
  assert.equal(view.rows[3].detail, '11:00 อยู่ในช่วง 10:00–20:00');
  assert.equal(view.summary, 'ผ่าน 3 จาก 4 ข้อ');
  assert.equal(view.caption, GATE_CAPTIONS.create);

  // หน้าใบคำร้อง: ไม่มีช่วงเข้าในมือ ⇒ ④ unknown · ไม่นับผ่าน · ไม่บล็อก
  const unknown = gatePanelView(evaluateVisitGate({ ...draft, assigneeId: 'PK' }, { site: null }), {
    visit: draft, accessKnown: false, mode: 'survey',
  });
  assert.equal(unknown.rows[3].state, 'unknown');
  assert.equal(unknown.rows[3].detail, 'หน้านี้ไม่เห็นช่วงเข้าไซต์ — ไม่บล็อกการลงคิว');
  assert.equal(unknown.summary, 'ผ่าน 3 จาก 4 ข้อ', 'ไม่รู้ ≠ ผ่าน');
  assert.equal(unknown.ready, true);
  assert.equal(unknown.tone, 'info');
  /* 🐞 รีวิว UAT 24/09: ป้ายนับบอก 3/4 แต่คำที่โปรแกรมอ่านจอประกาศในหัวแผงคือ "ขึ้นตารางได้" (ข้อ ④ ยังไม่ได้ตรวจ)
     ⇒ ไม่รู้ = คำของมันเอง */
  assert.equal(unknown.verdict, 'ยังตรวจไม่ครบ — ข้อ ④ ไม่บล็อกการลงคิว');
  assert.notEqual(unknown.verdict, 'ขึ้นตารางได้');
});

test('ข้อ ④ ผ่าน — บอกเหตุเสมอ: ไม่ระบุเวลา = ทั้งวัน · ไซต์ไม่จำกัด · ไม่มีไซต์ = ว่าง', () => {
  const untimed = form21({ startTime: '', endTime: '', assigneeId: 'PA', assigneeName: 'Phuwadol Aoonnankad' });
  const view = gatePanelView(evaluateVisitGate(untimed, riversideCtx), { visit: untimed, site: riverside });
  assert.equal(view.rows[3].state, 'pass');
  assert.equal(view.rows[3].detail, 'ยังไม่ระบุเวลา — ทั้งวัน', '🐞 เคยเป็นแถวเปล่ามีแต่ป้าย TS');
  const open = { id: 'OPEN' };
  const free = gatePanelView(evaluateVisitGate({ ...untimed, startTime: '10:00' }, { ...riversideCtx, site: open }), { visit: untimed, site: open });
  assert.equal(free.rows[3].detail, 'ไซต์ไม่จำกัดวัน/เวลาเข้า');
  assert.equal(gatePanelView(evaluateVisitGate(untimed, { ...riversideCtx, site: null }), { visit: untimed, site: null }).rows[3].detail, '');
});

/* ═══ ตัวเลือกเจ้าหน้าที่ ═══════════════════════════════════════════════════════════ */
test('⭐ BRIEF C1: ว่างเป็นแผ่น 6 คน · ไม่ว่างเป็นแถว + ถ้าเลือก + เกินภาระ + เวลาทับ', () => {
  const view = crewPickerView({
    technicians, load, dateIso: DAY, siteLoad: { assets: 3, packs: 2 },
    timeWindow: { startTime: '10:30', endTime: '12:00' },
  });
  assert.equal(view.state, 'ok');
  assert.deepEqual(view.head, { text: 'ภาระวันที่ พฤ. 1 ต.ค. — ไม่นับร่าง', aside: 'วันนั้นว่าง 6 จาก 8 คน', asideTone: 'ok' });
  assert.equal(view.notice, '');
  assert.equal(view.free.label, 'ว่างทั้งวัน · 6 คน');
  assert.equal(view.free.projection, 'ถ้าเลือก 1 นัด · 3/12 จุด');
  assert.deepEqual(view.free.people.map((p) => [p.name, p.team]), [
    ['Apisith Pattangthani', 'Planer'], ['Ariya Jintapanichakarn', 'supervisor'], ['Arnon Aunsapwilai', 'Audit'],
    ['Peera Khantawee', 'Operations'], ['Phuwadol Aoonnankad', 'Operations'], ['Witthaya Bunyotha', 'Operations'],
  ], 'ลำดับตามรายชื่อ · ร่างของ Peera ไม่ทำให้ไม่ว่าง');

  const [natt, veer] = view.busy;
  assert.equal(natt.name, 'Nattawut Pornprasit');
  assert.equal(natt.nowText, 'ตอนนี้ 2 นัด · 9 จุด · 3 แพ็ค');
  assert.deepEqual(natt.projection, { text: 'ถ้าเลือก 3 นัด · 12/12 จุด', over: false }, 'เต็มพอดีไม่ใช่เกิน');
  assert.deepEqual(natt.tags, []);
  assert.deepEqual(natt.overlaps, []);

  assert.equal(veer.name, 'Veerachai Teratumtada');
  assert.equal(veer.nowText, 'ตอนนี้ 3 นัด · 14 จุด · 5 แพ็ค');
  assert.deepEqual(veer.projection, { text: 'ถ้าเลือก 4 นัด · 17/12 จุด', over: true });
  assert.deepEqual(veer.tags.map((t) => t.text), ['เกินภาระ 12 จุด']);
  assert.deepEqual(veer.overlaps.map((t) => t.text), ['เวลาทับ SV-26090029 10:30–12:30']);

  // แบบ A: "ทุกทีมหยิบได้ แต่ขึ้นตารางไม่ได้" (รีวิว UAT 24/09 — ของเดิมพูดแค่ครึ่งแรก)
  assert.deepEqual(view.unassigned, { label: 'ยังไม่มอบหมาย', sub: 'ทุกทีมหยิบได้ แต่ขึ้นตารางไม่ได้', selected: true });
  assert.equal(view.invalid, false, 'โมดัลนัดยอมให้ไม่มีคน — ไม่ใช่ช่องที่ขาด');
  assert.deepEqual(view.plain, []);
  assert.equal(view.pinned, null);
});

test('⭐ BRIEF C2: เวลาเริ่มอย่างเดียว 11:00 ทับ Veerachai (10:30–12:30) ไม่ทับ Nattawut · ไม่มีแถวยังไม่มอบหมาย', () => {
  const view = crewPickerView({
    technicians, load, dateIso: DAY, siteLoad: { assets: 0, packs: 0 },
    timeWindow: { startTime: '11:00', endTime: '' }, allowUnassigned: false, value: 'PK',
  });
  const [natt, veer] = view.busy;
  assert.deepEqual(natt.overlaps, []);
  assert.deepEqual(veer.overlaps.map((t) => t.text), ['เวลาทับ SV-26090029 10:30–12:30']);
  assert.equal(view.free.projection, 'ถ้าเลือก 1 นัด · 0/12 จุด');
  assert.equal(veer.projection.text, 'ถ้าเลือก 4 นัด · 14/12 จุด');
  assert.equal(view.unassigned, null);
  assert.equal(view.free.people.find((p) => p.id === 'PK').selected, true);
  assert.equal(view.invalid, false);
  /* 🐞 รีวิว UAT 24/09: ลงคิวบังคับเจ้าหน้าที่ แต่กรอบตัวเลือกไม่บอกว่าขาด (บอกแค่ท้ายโมดัล) — แบบ A ขอบสีเตือน */
  assert.equal(crewPickerView({ technicians, load, dateIso: DAY, allowUnassigned: false, value: '' }).invalid, true);
  assert.equal(crewPickerView({ technicians, load, dateIso: DAY, allowUnassigned: false, value: 'GONE' }).invalid, false,
    'คนเดิมที่หลุดรายชื่อยังเป็นค่าที่เลือกอยู่');
});

test('ไม่รู้ภาระของไซต์ (หน้าใบคำร้อง) — ถ้าเลือกพูดแค่จำนวนนัด ไม่เดาจุด', () => {
  const view = crewPickerView({ technicians, load, dateIso: DAY, siteLoad: null });
  assert.equal(view.free.projection, 'ถ้าเลือก 1 นัด');
  assert.deepEqual(view.busy.map((b) => b.projection), [
    { text: 'ถ้าเลือก 3 นัด', over: false },
    { text: 'ถ้าเลือก 4 นัด', over: true },
  ]);
});

test('⭐ "ว่าง" ของตัวเลือก = คนชุดเดียวกับ freeCrewOn ของการ์ด (ไปช่วยก็คือไม่ว่าง)', () => {
  const withHelper = [...dayVisits, { ...live('V40', 'SV-26090040', 'NP', 'W4', '16:00', '17:00'), assistantIds: ['AP'] }];
  const helperLoad = { state: 'ok', people: crewLoadPeople({ visits: withHelper, dateIso: DAY, workload, technicians, crewByUser, teamNames }) };
  const view = crewPickerView({ technicians, load: helperLoad, dateIso: DAY, siteLoad: { assets: 3, packs: 2 } });
  assert.deepEqual(view.free.people.map((p) => p.id), freeCrewOn(withHelper, DAY, technicians).free.map((p) => p.id));
  const helper = view.busy.find((b) => b.id === 'AP');
  assert.deepEqual(helper.tags.map((t) => t.text), ['ไปช่วย 1 นัด']);
  assert.equal(helper.nowText, 'ตอนนี้ 0 นัด');
  assert.equal(view.head.aside, 'วันนั้นว่าง 5 จาก 8 คน');
});

test('โหลดภาระไม่ได้ / ยังไม่มีวัน — แผ่นล้วนไม่มีตัวเลข · ขีดแทนศูนย์ · ไม่แยกว่าง/ไม่ว่าง', () => {
  const unknown = crewPickerView({ technicians, load: { state: 'unknown', people: [] }, dateIso: DAY });
  assert.equal(unknown.state, 'unknown');
  assert.equal(unknown.notice, CREW_UNKNOWN_TEXT);
  assert.equal(unknown.head.aside, `วันนั้นว่าง ${NA} จาก 8 คน`);
  assert.equal(unknown.free, null);
  assert.deepEqual(unknown.busy, []);
  assert.equal(unknown.plain.length, 8);
  assert.ok(unknown.plain.every((p) => !('nowText' in p) && !('projection' in p)), 'ไม่มีตัวเลขปลอม');

  const nodate = crewPickerView({ technicians, load, dateIso: '' });
  assert.equal(nodate.state, 'nodate');
  assert.equal(nodate.head.text, CREW_NODATE_TEXT);
  assert.equal(nodate.head.aside, '');
  assert.equal(nodate.notice, '');
  assert.equal(nodate.free, null);
  assert.equal(nodate.plain.length, 8);
});

test('ผู้รับผิดชอบเดิมที่หลุดรายชื่อ = แถวค้างที่ถูกเลือกอยู่ พร้อมหมายเหตุ', () => {
  const view = crewPickerView({ technicians, load, dateIso: DAY, value: 'GONE', currentName: 'สมหมาย ลาออก' });
  assert.deepEqual(view.pinned, { id: 'GONE', name: 'สมหมาย ลาออก', note: CREW_GONE_NOTE, selected: true });
  assert.equal(view.unassigned.selected, false);
  assert.ok([...view.free.people, ...view.busy].every((p) => !p.selected));
});

test('สถานะรายชื่อ — กำลังโหลด · โหลดพัง · ไม่มีใครเลย (สามข้อความ ไม่ใช่ข้อความเดียว)', () => {
  assert.deepEqual(crewPickerView({ technicians: [], rosterState: 'loading' }).roster, { state: 'loading', text: CREW_ROSTER_TEXT.loading });
  assert.deepEqual(crewPickerView({ technicians: [], rosterState: 'error' }).roster, { state: 'error', text: CREW_ROSTER_TEXT.error });
  assert.deepEqual(crewPickerView({ technicians: [], rosterState: 'ready' }).roster, { state: 'empty', text: CREW_ROSTER_TEXT.empty });
  assert.deepEqual(crewPickerView({ technicians }).roster, { state: 'ready', text: '' });
  assert.equal(CREW_ROSTER_TEXT.empty, 'ยังไม่มีบัญชีที่รับงานเข้าไซต์ได้ — เปิดบัญชีฝ่าย TS ก่อน');
});

test('แถบภาระ: ขีดละหนึ่งจุด เต็มแถบ 18 · เส้นเพดานหลังขีดที่ 12 · เกินแถบตัดทิ้ง (ตัวเลขข้างแถบบอกค่าจริง)', () => {
  assert.equal(LOAD_BAR_SCALE, 18);
  const natt = loadBarCells({ now: 9, add: 3 });
  assert.equal(natt.cells.length, 18);
  assert.equal(natt.cells.filter((c) => c.fill === 'now').length, 9);
  assert.equal(natt.cells.filter((c) => c.fill === 'add').length, 3);
  assert.deepEqual(natt.cells.map((c, i) => (c.cap ? i : -1)).filter((i) => i >= 0), [MAX_ASSETS_PER_DAY - 1]);
  assert.equal(natt.over, false);
  assert.equal(loadBarCells({ now: 14, add: 3 }).over, true);
  const huge = loadBarCells({ now: 20, add: 3 });
  assert.equal(huge.cells.filter((c) => c.fill === 'now').length, 18);
  assert.equal(huge.cells.filter((c) => c.fill === 'add').length, 0);
  assert.equal(huge.clamped, true);
  assert.equal(huge.total, 23);
  assert.equal(loadBarCells({ now: 16, add: 6 }).cells.filter((c) => c.fill === 'add').length, 2);
});

/* ═══ หัว + ข้อความของการปล่อย ═════════════════════════════════════════════════════ */
test('หัวโมดัลนัด: แก้ = รหัส + ชิปชนิด + ชิปสถานะ (ร่างเส้นประ) + ที่มา + บรรทัดไซต์ · สร้าง = ไม่มีชิป', () => {
  assert.deepEqual(visitHeaderView(draft21, { form: form21(), site: riverside }), {
    title: 'แก้นัด SV-26090021',
    kind: { key: 'refill', label: 'เติมน้ำหอม' },
    status: { key: 'draft', label: 'ร่าง', draft: true },
    origin: 'จากรอบบริการ',
    context: { code: 'ST-0388-01-BKK-1093', name: 'โรงแรม เดอะ ริเวอร์ไซด์ สาทร', customer: 'บริษัท ริเวอร์ไซด์ ฮอสพิทาลิตี้ จำกัด' },
  });
  const create = visitHeaderView(null, { form: { ...form21(), planId: 'PL-1', status: 'scheduled' }, site: riverside });
  assert.equal(create.title, 'นัดเข้าบริการ');
  assert.equal(create.kind, null);
  assert.equal(create.status, null);
  assert.equal(create.origin, 'จากรอบบริการ', 'ตั้งนัดรอบถัดไป = ฟอร์มมี planId');
  assert.equal(visitHeaderView(null, { form: {} }).context, null);
});

test('⭐ BRIEF C1: ประโยคของการปล่อย — กล่องยืนยันกับบรรทัดผลลัพธ์ใช้ประโยคเดียว · toast ของสองทางคำเดียวกัน', () => {
  const released = { ...draft21, assigneeId: 'PA', assigneeName: 'Phuwadol Aoonnankad' };
  assert.equal(releaseSlotText(released),
    'จะขึ้นช่อง Phuwadol Aoonnankad · พฤ. 1 ต.ค. 10:30–12:00 บนตาราง และโผล่ในงานวันนี้ของ Phuwadol วันนั้น');
  assert.equal(releaseSlotText({ scheduledDate: DAY }), 'จะขึ้นแถว “ยังไม่มอบหมาย” · พฤ. 1 ต.ค.');
  assert.equal(releasedToastText(released), 'ปล่อย SV-26090021 ขึ้นตารางแล้ว — Phuwadol Aoonnankad · พฤ. 1 ต.ค.');
  assert.equal(releaseSlotText(null), '');
});

/* ═══ โมดัลนัด: ส่วนที่โผล่ · ปุ่มท้าย · บรรทัดผลลัพธ์ (ตาราง 1c) ═════════════════════════ */
const blockedGate = evaluateVisitGate({ ...draft21, ...form21() }, riversideCtx);
const passedGate = evaluateVisitGate({ ...draft21, ...form21({ assigneeId: 'PA', assigneeName: 'Phuwadol Aoonnankad' }) }, riversideCtx);

/* แถวนัดตามสถานะ × ต้นเรื่อง — วันนัดอยู่ในอนาคตเสมอ (ผลการเข้าจริงของนัดล่วงหน้าพับไว้) */
const ORIGINS = {
  round: { planId: 'PL-1' },
  outOfRound: {},
  survey: { requestId: 'DR-192', kind: 'survey' },
};
const visitOf = (status, origin, over = {}) => ({
  ...draft21, planId: null, requestId: null, ...ORIGINS[origin], status,
  assigneeId: status === 'draft' ? null : 'PA', assigneeName: status === 'draft' ? null : 'Phuwadol Aoonnankad',
  ...(['done', 'partial', 'unable'].includes(status) ? { actualDate: DAY } : {}),
  ...over,
});
const formOf = (visit) => ({ ...form21(), kind: visit.kind, status: visit.status, assigneeId: visit.assigneeId || '', assigneeName: visit.assigneeName || '', actualDate: visit.actualDate || '' });

const ROWS = [
  // [ชื่อ, visit, gates, status, actual, secondary, primary]
  ['สร้าง', null, true, null, 'hidden', ['cancel'], 'สร้างนัด'],
  ['ร่าง · รอบ', visitOf('draft', 'round'), true, 'edit', 'hidden', ['cancel', 'saveDraft', 'override'], 'ปล่อยขึ้นตาราง'],
  ['ร่าง · นอกรอบ', visitOf('draft', 'outOfRound'), true, 'edit', 'hidden', ['delete', 'cancel', 'saveDraft', 'override'], 'ปล่อยขึ้นตาราง'],
  ['ร่าง · ประเมิน', visitOf('draft', 'survey'), true, 'edit', 'hidden', ['cancel', 'saveDraft', 'override'], 'ปล่อยขึ้นตาราง'],
  ['นัดไว้ · รอบ', visitOf('scheduled', 'round'), false, 'edit', 'collapsed', ['cancel'], 'บันทึกการแก้ไข'],
  ['นัดไว้ · นอกรอบ', visitOf('scheduled', 'outOfRound'), false, 'edit', 'collapsed', ['delete', 'cancel'], 'บันทึกการแก้ไข'],
  ['นัดไว้ · ประเมิน', visitOf('scheduled', 'survey'), false, 'edit', 'collapsed', ['cancel'], 'บันทึกการแก้ไข'],
  ['กำลังทำ · นอกรอบ', visitOf('in_progress', 'outOfRound', { actualStartTime: '10:35' }), false, 'locked', 'open', ['delete', 'cancel'], 'บันทึกการแก้ไข'],
  ['เข้าแล้ว · นอกรอบ', visitOf('done', 'outOfRound'), false, 'locked', 'open', ['cancel'], 'บันทึกการแก้ไข'],
  ['ทำไม่ครบ · รอบ', visitOf('partial', 'round'), false, 'locked', 'open', ['cancel'], 'บันทึกการแก้ไข'],
  ['ทำไม่ได้ · นอกรอบ', visitOf('unable', 'outOfRound', { unableReason: 'ลูกค้าปิดร้านไม่แจ้งล่วงหน้า' }), false, 'edit', 'open', ['cancel'], 'บันทึกการแก้ไข'],
  ['เลื่อนแล้ว · นอกรอบ', visitOf('rescheduled', 'outOfRound'), false, 'edit', 'hidden', ['delete', 'cancel'], 'บันทึกการแก้ไข'],
  ['ยกเลิก · นอกรอบ · มีร่องรอย', visitOf('cancelled', 'outOfRound', { actualDate: DAY }), false, 'edit', 'collapsed', ['delete', 'cancel'], 'บันทึกการแก้ไข'],
];

test('⭐ ตาราง 1c — ทุกสถานะ × ต้นเรื่อง (แอดมิน · มีสิทธิ์ลบ · ด่านติด): ส่วนที่โผล่ · ปุ่มรอง · ปุ่มหลัก', () => {
  for (const [name, visit, gates, status, actual, secondary, primaryLabel] of ROWS) {
    const form = visit ? formOf(visit) : { ...form21(), status: 'scheduled' };
    const view = visitModalView({
      visit, form, todayIso: TODAY, gate: blockedGate, canOverride: true,
      deleteAction: visit ? visitDeleteButton(visit) : null,
    });
    assert.equal(view.sections.gates, gates, `${name}: แผงด่าน`);
    assert.equal(view.sections.status, status, `${name}: สถานะ`);
    assert.equal(view.sections.actual, actual, `${name}: ผลการเข้าจริง`);
    assert.equal(view.sections.thread, !!visit, `${name}: ความเคลื่อนไหว`);
    assert.deepEqual(view.secondary.map((b) => b.key), secondary, `${name}: ปุ่มรอง`);
    assert.equal(view.primary.label, primaryLabel, `${name}: ปุ่มหลัก`);
    // ⭐ ปุ่มหลักปุ่มเดียวเสมอ · ไม่มีปุ่มรองชื่อซ้ำปุ่มหลัก
    assert.ok(!view.secondary.some((b) => b.label === view.primary.label), `${name}: ปุ่มหลักต้องมีปุ่มเดียว`);
  }
});

test('ตาราง 1c — ไม่ใช่แอดมิน = ไม่มี "ข้ามด่าน" · ไม่มีสิทธิ์ลบ (ไม่ส่ง onDelete) = ไม่มี "ลบนัด"', () => {
  const visit = visitOf('draft', 'outOfRound');
  const view = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: blockedGate, canOverride: false, deleteAction: null });
  assert.deepEqual(view.secondary.map((b) => b.key), ['cancel', 'saveDraft']);
  // ผ่านด่านแล้ว ⇒ ปุ่มข้ามด่านหายแม้เป็นแอดมิน
  const passed = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: passedGate, canOverride: true, deleteAction: null });
  assert.deepEqual(passed.secondary.map((b) => b.key), ['cancel', 'saveDraft']);
  assert.equal(passed.primary.blocker, '');
});

test('ปุ่ม "ลบนัด" = เหตุจากด่านตัวเดียวกับ API · กำลังทำ = โชว์พร้อมเหตุ · กำลังลบ = ป้ายเปลี่ยน', () => {
  const going = visitOf('in_progress', 'outOfRound');
  const view = visitModalView({ visit: going, form: formOf(going), todayIso: TODAY, gate: passedGate, deleteAction: visitDeleteButton(going) });
  const del = view.secondary.find((b) => b.key === 'delete');
  assert.equal(del.blocker, VISIT_DELETE_BLOCKS.visited);
  assert.equal(del.tone, 'danger');
  assert.equal(del.variant, 'outline');
  const open = visitOf('scheduled', 'outOfRound');
  const busy = visitModalView({ visit: open, form: formOf(open), todayIso: TODAY, gate: passedGate, deleteAction: visitDeleteButton(open), deleting: true });
  assert.equal(busy.secondary[0].label, 'กำลังลบ…');
  assert.equal(busy.secondary[0].blocker, '');
});

test('⭐ ร่าง: ปุ่มหลัก "ปล่อยขึ้นตาราง" ติดด่าน = บอกเหตุตอนกด · บรรทัดผลลัพธ์พูดเหตุเดียวกัน · ผ่านแล้วบอกช่องที่จะขึ้น', () => {
  const visit = visitOf('draft', 'round');
  const blocked = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: blockedGate });
  assert.equal(blocked.primary.key, 'release');
  assert.equal(blocked.primary.blocker, gateBlocker(blockedGate));
  assert.equal(blocked.primary.blocker, 'ยังขึ้นตารางไม่ได้ — ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยขึ้นตาราง');
  /* 🐞 รีวิว UAT 24/09: บรรทัดใต้ปุ่มเคยเป็นเหตุเต็มของด่าน (ขีดยาวซ้อนสองชั้น กินทั้งแถบท้าย) ⇒ ป้ายสั้น
     รายข้อ · เหตุเต็มอยู่ที่แผงด่าน (และ toast ตอนกดปุ่ม) */
  assert.deepEqual(blocked.outcome, { tone: 'warn', text: 'ยังขึ้นตารางไม่ได้ — ③ ยังไม่มีเจ้าหน้าที่' });

  const form = { ...formOf(visit), assigneeId: 'PA', assigneeName: 'Phuwadol Aoonnankad' };
  const ready = visitModalView({ visit, form, todayIso: TODAY, gate: passedGate });
  assert.equal(ready.primary.blocker, '');
  assert.deepEqual(ready.outcome, {
    tone: 'ok',
    text: 'จะขึ้นช่อง Phuwadol Aoonnankad · พฤ. 1 ต.ค. 10:30–12:00 บนตาราง และโผล่ในงานวันนี้ของ Phuwadol วันนั้น',
  });
});

test('ร่างที่ย้ายสถานะเป็น "ยกเลิก" — ปุ่มหลักกลายเป็น "บันทึกการแก้ไข" · บอกว่าจะไม่นับภาระ · ไม่มีบันทึกร่าง/ข้ามด่าน', () => {
  const visit = visitOf('draft', 'round');
  const view = visitModalView({ visit, form: { ...formOf(visit), status: 'cancelled' }, todayIso: TODAY, gate: blockedGate, canOverride: true });
  assert.equal(view.primary.key, 'save');
  assert.equal(view.primary.label, 'บันทึกการแก้ไข');
  assert.equal(view.primary.blocker, '');
  assert.deepEqual(view.secondary.map((b) => b.key), ['cancel']);
  assert.deepEqual(view.outcome, { tone: 'warn', text: 'จะเปลี่ยนสถานะเป็น “ยกเลิก” — ไม่นับภาระ ไม่อยู่ในงานวันนี้ของใคร' });
});

test('สถานะของร่างไม่มี "นัดไว้" (D5) · ใบที่ประทับเวลาแล้วล็อกพร้อมคำอธิบาย', () => {
  const draft = visitOf('draft', 'round');
  const dv = visitModalView({ visit: draft, form: formOf(draft), todayIso: TODAY, gate: blockedGate });
  assert.deepEqual(dv.sections.statusOptions.map((o) => o.value), [...DRAFT_STATUS_OPTIONS]);
  assert.deepEqual(dv.sections.statusOptions.map((o) => o.label), ['ร่าง', 'ทำไม่ได้', 'เลื่อนแล้ว', 'ยกเลิก']);
  const sched = visitOf('scheduled', 'round');
  const sv = visitModalView({ visit: sched, form: formOf(sched), todayIso: TODAY, gate: passedGate });
  assert.deepEqual(sv.sections.statusOptions.map((o) => o.value), ['draft', 'scheduled', 'unable', 'rescheduled', 'cancelled']);
  const done = visitOf('done', 'round');
  const cv = visitModalView({ visit: done, form: formOf(done), todayIso: TODAY, gate: passedGate });
  assert.deepEqual(cv.sections.statusOptions, [{ value: 'done', label: 'เข้าแล้ว' }]);
  assert.equal(cv.sections.statusHint, STAMPED_STATUS_HINT);
  assert.equal(sv.sections.statusHint, '');
});

test('⭐ ร่างล่วงหน้าไม่มีผลการเข้าจริง · เลือก "ทำไม่ได้" แล้วโผล่พร้อมช่องเหตุผล', () => {
  const visit = visitOf('draft', 'round');
  const base = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: blockedGate });
  assert.equal(base.sections.actual, 'hidden');
  assert.equal(base.sections.unableReason, false);
  const unable = visitModalView({ visit, form: { ...formOf(visit), status: 'unable', unableReason: 'สั้น' }, todayIso: TODAY, gate: blockedGate });
  assert.equal(unable.sections.actual, 'open');
  assert.equal(unable.sections.unableReason, true);
  assert.equal(unable.sections.unableHint, 'อย่างน้อย 10 ตัวอักษร (ฐานข้อมูลบังคับ)');
  const long = visitModalView({ visit, form: { ...formOf(visit), status: 'unable', unableReason: 'ลูกค้าปิดร้านไม่แจ้งล่วงหน้า' }, todayIso: TODAY, gate: blockedGate });
  assert.equal(long.sections.unableHint, 'ผู้ขอจะเห็นเหตุผลนี้ — ใบประเมินจะถอยกลับขั้นลงคิวให้เอง');
});

test('นัดไว้: วันนัดมาถึงแล้ว = ผลการเข้าจริงกางเอง · ยังไม่ถึง = พับ', () => {
  const past = visitOf('scheduled', 'round', { scheduledDate: '2026-09-20' });
  const view = visitModalView({ visit: past, form: { ...formOf(past), scheduledDate: '2026-09-20' }, todayIso: TODAY, gate: passedGate });
  assert.equal(view.sections.actual, 'open');
  const today = visitOf('scheduled', 'round', { scheduledDate: TODAY });
  assert.equal(visitModalView({ visit: today, form: { ...formOf(today), scheduledDate: TODAY }, todayIso: TODAY, gate: passedGate }).sections.actual, 'open');
});

test('เลื่อนวันของนัดไว้ = ช่องเหตุผลโผล่ พร้อมวันไทย (ไม่ใช่ ISO · pain 10) · ร่างเปลี่ยนวันไม่ใช่การเลื่อน', () => {
  const sched = visitOf('scheduled', 'round');
  const moved = visitModalView({ visit: sched, form: { ...formOf(sched), scheduledDate: '2026-10-02' }, todayIso: TODAY, gate: passedGate });
  assert.equal(moved.sections.reschedule, true);
  assert.equal(moved.sections.rescheduleHint, 'เลื่อนจาก พฤ. 1 ต.ค. → ศ. 2 ต.ค. · เหตุผลจะถูกบันทึกลงความเคลื่อนไหวของนัดนี้');
  assert.deepEqual(moved.outcome, { tone: 'info', text: 'จะย้ายไปช่อง Phuwadol Aoonnankad · ศ. 2 ต.ค. 10:30–12:00' });
  const same = visitModalView({ visit: sched, form: formOf(sched), todayIso: TODAY, gate: passedGate });
  assert.equal(same.sections.reschedule, false);
  assert.deepEqual(same.outcome, { tone: 'info', text: 'ยังอยู่ช่อง Phuwadol Aoonnankad · พฤ. 1 ต.ค. 10:30–12:00' });
  const draft = visitOf('draft', 'round');
  assert.equal(visitModalView({ visit: draft, form: { ...formOf(draft), scheduledDate: '2026-10-02' }, todayIso: TODAY, gate: blockedGate }).sections.reschedule, false);
});

test('สร้างนัด (ตั้งนัดรอบถัดไป): ผ่านด่าน = บอกช่องที่จะขึ้น · ไม่ผ่าน = จะจอดเป็นร่าง พร้อมเหตุ', () => {
  const form = { ...form21({ assigneeId: 'PA', assigneeName: 'Phuwadol Aoonnankad' }), status: 'scheduled', planId: 'PL-1' };
  const ok = visitModalView({ visit: null, form, todayIso: TODAY, gate: passedGate });
  assert.equal(ok.primary.key, 'create');
  assert.equal(ok.sections.gateMode, 'create');
  assert.equal(ok.outcome.tone, 'ok');
  assert.match(ok.outcome.text, /^จะขึ้นช่อง Phuwadol Aoonnankad · พฤ\. 1 ต\.ค\./);
  const parked = visitModalView({ visit: null, form: { ...form, assigneeId: '' }, todayIso: TODAY, gate: blockedGate });
  assert.deepEqual(parked.outcome, { tone: 'warn', text: 'จะจอดเป็นร่างในแท็บรอจัด — ③ ยังไม่มีเจ้าหน้าที่' });
});

test('แผ่นข้ามด่านเปิด: ปุ่มรองเหลือ "ยกเลิกการข้ามด่าน" · ปุ่มหลักกดไม่ได้จนเหตุผลครบ 10 ตัว · บอกร่องรอยถาวร', () => {
  const visit = visitOf('draft', 'round');
  const short = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: blockedGate, canOverride: true, overriding: true, overrideReason: 'สั้นไป' });
  assert.deepEqual(short.secondary.map((b) => b.key), ['cancelOverride']);
  assert.equal(short.primary.key, 'override');
  assert.equal(short.primary.label, 'ข้ามด่านและขึ้นตาราง');
  assert.equal(short.primary.disabled, true);
  assert.deepEqual(short.outcome, { tone: 'warn', text: OVERRIDE_TRACE_TEXT });
  const enough = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: blockedGate, canOverride: true, overriding: true, overrideReason: 'ลูกค้าโอนแล้วส่งสลิปทางไลน์' });
  assert.equal(enough.primary.disabled, false);
});

test('⭐ error ทับบรรทัดผลลัพธ์เสมอ (ขึ้นเหนือเนื้อที่เลื่อน ไม่จมใต้โมดัล)', () => {
  const visit = visitOf('draft', 'round');
  const view = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: blockedGate, error: 'บันทึกไม่สำเร็จ' });
  assert.deepEqual(view.outcome, { tone: 'error', text: 'บันทึกไม่สำเร็จ' });
  const over = visitModalView({ visit, form: formOf(visit), todayIso: TODAY, gate: blockedGate, overriding: true, error: 'ข้ามด่านไม่สำเร็จ' });
  assert.equal(over.outcome.tone, 'error');
});

test('นัดที่ไม่อยู่บนตาราง (เลื่อนแล้ว/ยกเลิก) ไม่ได้บอกว่า "ยังอยู่ช่อง" · สถานะที่นับภาระพูดว่ายังนับ', () => {
  const off = visitOf('cancelled', 'round');
  assert.deepEqual(visitModalView({ visit: off, form: formOf(off), todayIso: TODAY, gate: passedGate }).outcome, {
    tone: 'info', text: 'นัดนี้ “ยกเลิก” — ไม่อยู่บนตาราง ไม่นับภาระ',
  });
  const sched = visitOf('scheduled', 'round');
  const toUnable = visitModalView({ visit: sched, form: { ...formOf(sched), status: 'unable' }, todayIso: TODAY, gate: passedGate });
  assert.deepEqual(toUnable.outcome, { tone: 'info', text: 'จะเปลี่ยนสถานะเป็น “ทำไม่ได้” — ยังนับเป็นงานของวันนั้น' });
});

test('ชนิดงานที่คนเลือกเองไม่ได้ (ประเมินพื้นที่) ล็อก · ยังไม่มีไซต์ = กางช่องแก้ไซต์ไว้ตั้งแต่เปิด', () => {
  const survey = visitOf('scheduled', 'survey');
  assert.equal(visitModalView({ visit: survey, form: formOf(survey), todayIso: TODAY, gate: passedGate }).sections.kindLocked, true);
  const round = visitOf('scheduled', 'round');
  const view = visitModalView({ visit: round, form: formOf(round), todayIso: TODAY, gate: passedGate });
  assert.equal(view.sections.kindLocked, false);
  assert.equal(view.sections.siteEditOpen, false);
  assert.equal(visitModalView({ visit: null, form: { ...form21(), siteId: '' }, todayIso: TODAY, gate: blockedGate }).sections.siteEditOpen, true);
});

/* (ความตรงกับ server ของบรรทัดผลลัพธ์ลงคิว — ทดสอบกับไซต์รูปที่ `loadSurveySite` คืนจริง ที่ surveyVisit.test.mjs) */

/* ═══ ขั้น B2 — "งานนี้" ของโมดัลนัด · แผงด่านของลงคิว · บรรทัดย่อของเธรด ══════════════════════ */

test('⭐ BRIEF C1: "งานนี้" ของโมดัลนัด — ชนิด + ภาระไซต์ · ชื่อโซน · ที่ไหน · ที่มา (คำเดียวกับการ์ด)', () => {
  const gate = evaluateVisitGate({ ...form21(), id: draft21.id }, riversideCtx);
  const rows = visitJobRows({
    visit: draft21, form: form21(), site: riverside,
    zones: riversideCtx.zones.map((z) => ({ ...z, siteId: 'ST-RS' })), zoneGates: gate.zoneGates, siteLoad: { assets: 3, packs: 2 },
  });
  assert.deepEqual(rows, [
    { key: 'kind', label: 'งาน', value: 'เติมน้ำหอม', kind: 'refill', extra: '3 จุด · 2 แพ็ค' },
    { key: 'zones', label: 'โซน', items: [
      { key: 'Z1', text: 'ล็อบบี้ชั้น G', tag: '' },
      { key: 'Z2', text: 'ห้องอาหาร ชั้น 2', tag: '' },
    ] },
    { key: 'where', label: 'ที่ไหน', value: 'เขต BKK · เข้าทางลานจอด B1 แลกบัตรที่ รปภ.' },
    { key: 'origin', label: 'ที่มา', value: 'จากรอบบริการ' },
  ]);
});

test('"งานนี้": ติดด่านบางโซน = ป้าย "งดบริการ" · ทุกโซนติด/งานที่ข้ามด่านเงิน = ไม่มีป้าย · เปลี่ยนไซต์ = โซนเดิมไม่ค้าง', () => {
  const zones = [{ id: 'Z1', siteId: 'S', name: 'ล็อบบี้' }, { id: 'Z2', siteId: 'S', name: 'ห้องอาหาร' }];
  const partial = [{ zoneId: 'Z1', state: 'ok' }, { zoneId: 'Z2', state: 'blocked' }];
  const tags = (over) => visitJobRows({ form: { kind: 'refill', siteId: 'S' }, zones, ...over })
    .find((r) => r.key === 'zones')?.items.map((i) => i.tag);
  assert.deepEqual(tags({ zoneGates: partial }), ['', ZONE_SKIPPED_TAG]);
  assert.deepEqual(tags({ zoneGates: partial.map((z) => ({ ...z, state: 'blocked' })) }), ['', ''], 'ทุกโซนติด = ด่านทั้งใบติด (แผงบอกเหตุ)');
  assert.deepEqual(visitJobRows({ form: { kind: 'remove', siteId: 'S' }, zones, zoneGates: partial })
    .find((r) => r.key === 'zones').items.map((i) => i.tag), ['', ''], 'ถอนเครื่องไม่ผ่านด่านเงิน ⇒ ไม่มีโซนงดบริการ');
  // บริบทด่านเป็นของไซต์ตอนเปิดโมดัล — เลือกไซต์อื่นแล้วโซนเดิมต้องหาย
  assert.equal(visitJobRows({ form: { kind: 'refill', siteId: 'OTHER' }, zones }).some((r) => r.key === 'zones'), false);
  // ภาระไซต์เป็นศูนย์ = ไม่มีตัวเลข (การ์ดเขียนแบบเดียวกัน) · ไม่มีไซต์ = ขีด
  const bare = visitJobRows({ form: { kind: 'repair', siteId: '' }, siteLoad: { assets: 0, packs: 0 } });
  assert.equal(bare[0].extra, '');
  assert.equal(bare.find((r) => r.key === 'where').value, NA);
  assert.equal(bare.find((r) => r.key === 'origin').value, 'งานนอกรอบ');
});

test('⭐ BRIEF C2: แผงด่านของลงคิว = ด่านของแถวที่ createSurveyVisit จะบันทึก · ①② ไม่ต้องตรวจ · ③ ลิงก์เลือกคน', () => {
  const form = { date: DAY, time: '11:00', resultDate: '2026-10-09', assigneeId: '', reason: '' };
  const open = commitDueGateView(surveyRequest, form, { site: hostel, accessKnown: true, technicians });
  assert.deepEqual(open.rows.map((r) => [r.n, r.state]), [['①', 'exempt'], ['②', 'exempt'], ['③', 'fail'], ['④', 'pass']]);
  assert.equal(open.summary, 'ผ่าน 3 จาก 4 ข้อ');
  assert.deepEqual(open.rows[2].fix, { key: 'assignee', label: 'เลือกเจ้าหน้าที่', field: 'assignee' });
  assert.equal(open.rows[3].detail, '11:00 อยู่ในช่วง 10:00–20:00');
  assert.equal(open.caption, GATE_CAPTIONS.survey);
  /* 🐞 รีวิว UAT 24/09: คำอธิบายเคยบอกว่านอกช่วงเข้าไซต์ "นัดจอดเป็นร่าง" — server ไม่ได้ตรวจข้อ ④ ของงานสำรวจ
     (`loadSurveySite` ไม่ได้ select ช่วงเวลา) ⇒ นัดขึ้นตารางเสมอ · ข้อ ④ เตือนเท่านั้น */
  assert.doesNotMatch(GATE_CAPTIONS.survey, /ร่าง/);
  assert.match(GATE_CAPTIONS.survey, /เตือนเท่านั้น/);

  const picked = commitDueGateView(surveyRequest, { ...form, assigneeId: 'PK' }, { site: hostel, accessKnown: true, technicians });
  assert.equal(picked.ready, true);
  assert.equal(picked.rows[2].detail, 'Peera Khantawee');

  /* 🐞 รีวิว UAT 24/09 (high): นอกช่วงเข้าไซต์ (21:00) เคยขึ้น ④ ไม่ผ่าน + "จะจอดเป็นร่าง" แต่ server ใส่นัด
     ลงตารางช่างเสมอ ⇒ ④ = เตือน (ไม่นับผ่าน · ไม่บล็อก) · แผงกับบรรทัดผลลัพธ์พูดเรื่องเดียวกัน (ขึ้นตาราง) */
  const late = { ...form, time: '21:00', assigneeId: 'PK' };
  const lateView = commitDueGateView(surveyRequest, late, { site: hostel, accessKnown: true, technicians });
  assert.equal(lateView.rows[3].state, 'warn');
  assert.equal(lateView.rows[3].detail, 'เริ่มหลังเวลาที่ไซต์ปิดรับ (10:00–20:00) · เตือนเท่านั้น นัดยังขึ้นตาราง');
  assert.equal(lateView.rows[3].fix.field, 'scheduledDate', 'ยังพาไปแก้เวลาได้');
  assert.equal(lateView.summary, 'ผ่าน 3 จาก 4 ข้อ', 'เตือน ≠ ผ่าน');
  assert.equal(lateView.ready, true);
  assert.equal(lateView.tone, 'warning');
  assert.equal(lateView.verdict, 'ขึ้นตารางได้ — ข้อ ④ เตือนเท่านั้น');
  const outcome = commitDueOutcome(surveyRequest, late, { site: hostel, accessKnown: true, technicians });
  assert.equal(outcome.lands, 'scheduled');
  assert.equal(lateView.ready, outcome.lands === 'scheduled');

  // หน้าใบคำร้อง (ไม่รู้ช่วงเข้า) — ④ บอกว่าจอนี้ไม่เห็น ไม่นับว่าผ่าน · ไม่ติด
  const unknown = commitDueGateView(surveyRequest, late, { site: { id: 'ST-HH', code: 'ST-1011-01-BKK-1162' }, accessKnown: false, technicians });
  assert.equal(unknown.rows[3].state, 'unknown');
  assert.equal(unknown.summary, 'ผ่าน 3 จาก 4 ข้อ');
  assert.equal(unknown.verdict, 'ยังตรวจไม่ครบ — ข้อ ④ ไม่บล็อกการลงคิว');
  // แจ้งกำหนดส่ง (หัวข้ออื่น) ไม่มีนัด ⇒ ไม่มีแผง
  assert.equal(commitDueGateView({ id: 'R', kind: 'formula_dev' }, form, { site: hostel }), null);
});

test('บรรทัดย่อของเธรด: ยังไม่โหลด = ไม่มีตัวเลข · ว่าง = 0 · มีของ = ใหม่สุด "วัน เวลา · ชื่อต้น — ข้อความ" (เวลาไทย)', () => {
  assert.deepEqual(threadDigest(null), { count: null, latest: '' });
  assert.deepEqual(threadDigest([]), { count: 0, latest: '' });
  const items = [
    { id: 'U0', createdAt: '2026-09-21T02:00:00Z', authorName: 'Ariya Jintapanichakarn', body: 'นัดครั้งแรก' },
    { id: 'U1', createdAt: '2026-09-22T07:05:00Z', authorName: 'Apisith Pattangthani', body: 'ลูกค้าขอให้เข้าหลัง 10:30 เพราะห้องอาหารเปิด 11:00' },
  ];
  // BRIEF C1: "อ. 22 ก.ย. 14:05 · Apisith — …" (07:05Z = 14:05 เวลาไทย)
  assert.deepEqual(threadDigest(items), {
    count: 2, latest: 'อ. 22 ก.ย. 14:05 · Apisith — ลูกค้าขอให้เข้าหลัง 10:30 เพราะห้องอาหารเปิด 11:00',
  });
  // ข้อความที่ถูกลบไม่โผล่เนื้อเดิม · ระบบไม่มีชื่อคน
  assert.match(threadDigest([{ createdAt: '2026-09-22T07:05:00Z', deletedAt: '2026-09-22T08:00:00Z', body: 'x' }]).latest, /ข้อความนี้ถูกลบแล้ว$/);
  assert.match(threadDigest([{ createdAt: '2026-09-22T07:05:00Z', body: 'ปล่อยขึ้นตาราง — ด่านครบ' }]).latest, /^อ\. 22 ก\.ย\. 14:05 · ระบบ — /);
});


/* ═══ รีวิว UAT 24/09 — ข้อที่แก้หลังเปิดจอจริง ═══════════════════════════════════════════════ */

/* 🐞 บรรทัดใต้ปุ่มเคยยาวเต็มแถบ: "ยังขึ้นตารางไม่ได้ — ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยขึ้นตาราง ·
   เข้าก่อนเวลาที่ไซต์อนุญาต (14:30–16:30)" ⇒ ป้ายสั้นรายข้อ (เหตุเต็มอยู่ที่แผงด่าน) */
test('🐞 ป้ายสั้นของข้อที่ติด — ③ ไม่มีคน · ④ นอกช่วง/วันที่ไซต์ไม่ให้เข้า · ①② บอกเจ้าของ', () => {
  const narrow = { ...riverside, accessFrom: '14:30', accessTo: '16:30' };
  const early = form21({ startTime: '10:00', endTime: '11:00' });
  const gate = evaluateVisitGate(early, { ...riversideCtx, site: narrow });
  assert.deepEqual(gateShortReasons(gate, { site: narrow, visit: early }), ['③ ยังไม่มีเจ้าหน้าที่', '④ นอกช่วงเข้าไซต์ 14:30–16:30']);
  const view = visitModalView({ visit: visitOf('draft', 'round'), form: { ...formOf(visitOf('draft', 'round')), ...early }, todayIso: TODAY, gate, site: narrow });
  assert.deepEqual(view.outcome, { tone: 'warn', text: 'ยังขึ้นตารางไม่ได้ — ③ ยังไม่มีเจ้าหน้าที่ · ④ นอกช่วงเข้าไซต์ 14:30–16:30' });
  assert.equal(view.primary.blocker, gateBlocker(gate), 'toast ตอนกดยังบอกเหตุเต็ม');

  // วันที่ไซต์ไม่ให้เข้า (ส.) — ไม่พูดว่า "นอกช่วงเวลา" ทั้งที่เวลาอยู่ในช่วง
  const saturday = form21({ scheduledDate: '2026-10-03', assigneeId: 'PA', assigneeName: 'Phuwadol Aoonnankad' });
  const satGate = evaluateVisitGate(saturday, riversideCtx);
  assert.deepEqual(gateShortReasons(satGate, { site: riverside, visit: saturday }), ['④ ส. 3 ต.ค. ไซต์ไม่ให้เข้า']);

  // ①② ของฝ่ายอื่น — บอกเจ้าของ (TS ทำเองไม่ได้)
  const noContract = evaluateVisitGate(form21({ assigneeId: 'PA' }), { ...riversideCtx, ordersById: { SO1: { id: 'SO1', status: 'approved', serviceContractId: null } } });
  assert.deepEqual(gateShortReasons(noContract, { site: riverside, visit: form21() }), ['① สัญญา (SA)']);
  assert.deepEqual(gateShortReasons(passedGate, { site: riverside, visit: form21() }), []);
});

test('accessWarnText — คำสั้นของการชนช่วงเข้าไซต์ (ตัวเดียวของบรรทัดผลลัพธ์สองโมดัล)', () => {
  assert.equal(accessWarnText(hostel, { date: DAY, startTime: '21:00' }), 'นอกช่วงเข้าไซต์ 10:00–20:00');
  assert.equal(accessWarnText(hostel, { date: DAY, startTime: '11:00' }), '');
  assert.equal(accessWarnText(riverside, { date: '2026-10-03' }), 'ส. 3 ต.ค. ไซต์ไม่ให้เข้า');
  assert.equal(accessWarnText(null, { date: DAY, startTime: '21:00' }), '');
});

/* 🐞 เลือกคนที่เกินภาระแล้วบรรทัดผลลัพธ์ยังเขียวเฉย ๆ — กล่องยืนยันบนการ์ดเตือนเรื่องเดียวกัน ⇒ เตือนเท่ากัน
   ⚠️ เตือน ไม่ห้าม: ปุ่มหลักไม่ติด blocker */
test('🐞 ปล่อยให้คนที่เกินภาระ — บรรทัดผลลัพธ์เป็นอำพัน + "เกินภาระ 12 จุด (เตือนเท่านั้น)" · ไม่บล็อก', () => {
  const visit = visitOf('draft', 'round');
  const form = { ...formOf(visit), assigneeId: 'VT', assigneeName: 'Veerachai Teratumtada' };
  const gate = evaluateVisitGate({ ...draft21, ...form }, riversideCtx);
  const view = visitModalView({ visit, form, todayIso: TODAY, gate, load, siteLoad: { assets: 3, packs: 2 } });
  assert.equal(view.primary.blocker, '');
  assert.deepEqual(view.outcome, {
    tone: 'warn',
    text: 'จะขึ้นช่อง Veerachai Teratumtada · พฤ. 1 ต.ค. 10:30–12:00 บนตาราง และโผล่ในงานวันนี้ของ Veerachai วันนั้น · เกินภาระ 12 จุด (เตือนเท่านั้น)',
  });
  // เต็มพอดี (Nattawut 9 + 3 = 12) ไม่ใช่เกิน · ไม่รู้ภาระ = ไม่เดา
  const natt = { ...formOf(visit), assigneeId: 'NP', assigneeName: 'Nattawut Pornprasit' };
  assert.equal(visitModalView({ visit, form: natt, todayIso: TODAY, gate: evaluateVisitGate({ ...draft21, ...natt }, riversideCtx), load, siteLoad: { assets: 3, packs: 2 } }).outcome.tone, 'ok');
  assert.equal(visitModalView({ visit, form, todayIso: TODAY, gate, load: { state: 'unknown', people: [] }, siteLoad: { assets: 3, packs: 2 } }).outcome.tone, 'ok');
  // สร้างนัดที่ผ่านด่าน = เตือนแบบเดียวกัน
  const create = visitModalView({ visit: null, form: { ...form, status: 'scheduled', planId: 'PL-1' }, todayIso: TODAY, gate, load, siteLoad: { assets: 3, packs: 2 } });
  assert.equal(create.outcome.tone, 'warn');
  assert.match(create.outcome.text, / · เกินภาระ 12 จุด \(เตือนเท่านั้น\)$/);
});

test('projectedDayLoad — "ถ้าเลือก" ตัวเดียวของตัวเลือกคนและบรรทัดผลลัพธ์', () => {
  const veer = people.find((p) => p.id === 'VT');
  assert.deepEqual(projectedDayLoad(veer, { assets: 3, packs: 2 }), { visits: 4, assets: 17, known: true, over: true });
  assert.deepEqual(projectedDayLoad({ visits: 2, assets: 9 }, { assets: 3 }), { visits: 3, assets: 12, known: true, over: false });
  // ไม่รู้ภาระของไซต์ ⇒ จุดไม่บวก · เกินหรือไม่ดูจากที่มีอยู่แล้ว
  assert.deepEqual(projectedDayLoad(veer, null), { visits: 4, assets: 14, known: false, over: true });
});

/* 🐞 ผู้ไปด้วยที่ไม่อยู่ในรายชื่อ (ย้ายออกจาก TS) หรือรายชื่อยังโหลดไม่เสร็จ ขึ้นเป็นรหัสผู้ใช้ดิบ (UUID) บนชิป */
test('🐞 ชิปผู้ไปด้วย: ชื่อจากรายชื่อ · กำลังโหลด = ข้อความโหลด · หลุดรายชื่อ = คำอ่านได้ ไม่ใช่รหัส', () => {
  const uuid = '7c1e2b9a-0000-4000-8000-00000000abcd';
  const ready = helperChipsView({ value: ['PK', uuid, 'PA'], technicians, assigneeId: 'PA' });
  assert.deepEqual(ready.chips, [
    { id: 'PK', name: 'Peera Khantawee', known: true },
    { id: uuid, name: HELPER_GONE_TEXT, known: false },
  ], 'ผู้รับผิดชอบไม่ขึ้นเป็นชิป');
  assert.equal(HELPER_GONE_TEXT, 'เจ้าหน้าที่ที่ไม่อยู่ในรายชื่อแล้ว');
  assert.ok(ready.chips.every((chip) => chip.name !== chip.id));
  assert.deepEqual(ready.options.map((o) => o.value), ['AP', 'AJ', 'AA', 'NP', 'VT', 'WB'], 'ไม่มีผู้รับผิดชอบ · ไม่มีคนที่เลือกแล้ว');
  assert.equal(ready.hint, 'คนที่เลือกจะเห็นนัดนี้ในงานวันนี้ของตัวเอง');
  const loading = helperChipsView({ value: [uuid], technicians: [], rosterState: 'loading' });
  assert.deepEqual(loading.chips, [{ id: uuid, name: HELPER_LOADING_TEXT, known: false }]);
  assert.equal(helperChipsView({ value: [], technicians }).hint, 'เว้นว่าง = ไปคนเดียว');
});

test('orderHelperIds — ส่งออกตามลำดับรายชื่อ · คนหลุดรายชื่อต่อท้าย · ตัดผู้รับผิดชอบ/ค่าว่าง (ก้อนที่บันทึกเท่าของเดิม)', () => {
  assert.deepEqual(orderHelperIds(['WB', 'GONE', 'AP', '', 'PA'], { technicians, assigneeId: 'PA' }), ['AP', 'WB', 'GONE']);
  assert.deepEqual(orderHelperIds([], { technicians }), []);
});

/* 🐞 390px: ช่วงเวลาถูกตัดกลางบรรทัด "(14:30–" / "16:30)" ⇒ ท่อนเวลา/วันที่ต้องไม่ถูกหั่น */
test('🐞 keepTogetherRuns — ช่วงเวลา (รวมวงเล็บ) และวันไทยเป็นก้อนเดียว ข้อความอื่นตัดบรรทัดได้ตามปกติ', () => {
  assert.deepEqual(keepTogetherRuns('ไซต์ให้เข้า จ. · 14:30–16:30 — เข้าก่อนเวลาที่ไซต์อนุญาต (14:30–16:30)'), [
    { text: 'ไซต์ให้เข้า จ. · ', keep: false },
    { text: '14:30–16:30', keep: true },
    { text: ' — เข้าก่อนเวลาที่ไซต์อนุญาต ', keep: false },
    { text: '(14:30–16:30)', keep: true },
  ]);
  assert.deepEqual(keepTogetherRuns('จะขึ้นช่อง Phuwadol · พฤ. 1 ต.ค. 10:30–12:00 บนตาราง').filter((r) => r.keep).map((r) => r.text),
    ['พฤ. 1 ต.ค.', '10:30–12:00']);
  assert.deepEqual(keepTogetherRuns('มติผู้ใช้ 2026-08-31').filter((r) => r.keep).map((r) => r.text), ['2026-08-31']);
  assert.deepEqual(keepTogetherRuns('ไม่มีเวลา'), [{ text: 'ไม่มีเวลา', keep: false }]);
  assert.deepEqual(keepTogetherRuns(''), []);
});

/* 🐞 ร่างบนจอ 1440: ชิปสถานะ (ร่าง/ทำไม่ได้/เลื่อนแล้ว/ยกเลิก) อยู่ใต้แผงด่านดันหมายเหตุ/ความเคลื่อนไหวตกขอบ
   ⇒ ร่างพับชิปไว้ (ทางออกของร่างยังอยู่ครบ — กฎชุดปุ่มเท่าเดิม) · กางเองเมื่อเลือกสถานะอื่นแล้ว · นัดที่ขึ้นตารางกางเสมอ */
test('🐞 สถานะของร่างพับไว้ใต้ "ปิดร่างนี้" · นัดที่ขึ้นตารางแล้วโชว์ชิปตามเดิม', () => {
  const draft = visitOf('draft', 'round');
  const folded = visitModalView({ visit: draft, form: formOf(draft), todayIso: TODAY, gate: blockedGate });
  assert.equal(folded.sections.statusFold, 'folded');
  assert.equal(visitModalView({ visit: draft, form: { ...formOf(draft), status: 'cancelled' }, todayIso: TODAY, gate: blockedGate }).sections.statusFold, 'open',
    'เลือกปิดร่างแล้ว = ต้องเห็นว่าเลือกอะไรอยู่');
  const sched = visitOf('scheduled', 'round');
  assert.equal(visitModalView({ visit: sched, form: formOf(sched), todayIso: TODAY, gate: passedGate }).sections.statusFold, 'none');
  assert.equal(visitModalView({ visit: null, form: form21(), todayIso: TODAY, gate: passedGate }).sections.statusFold, 'none');
});
