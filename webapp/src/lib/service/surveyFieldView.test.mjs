// ── ของที่จอหน้างานแบบ A วาด (แผน §10.5 · ม็อก A-1…A-5 · AT · AW · AO) ─────────────────
//
// ⭐ ข้อมูลตั้งต้น = ชุดเดียวกับม็อกที่เจ้าของอนุมัติ (BRIEF §C) — ตัวเลขต้องบวกกันลงตัวแบบเดียวกับบอร์ด:
//   Reception 8 × 6 × 3 = 48 / 144 · MD 6 × 5 × 2.8 = 30 / 84 · Treatment (7.5 × 4 × 3) + (3 × 2 × 3) = 36 / 108
//   ⇒ รวม 114 ตร.ม. / 336 ลบ.ม. · จุด 7 · ภาพกว้าง 5
// ⇒ คำบนจอที่เทสต์ตรึงไว้คือคำบนบอร์ด — เปลี่ยนคำเมื่อไร ต้องเปลี่ยนเพราะตั้งใจ ไม่ใช่เพราะเผลอ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyControlView } from './surveyControl.js';
import {
  SURVEY_DIM_FIELDS,
  SURVEY_RAIL_QUERY,
  SURVEY_SPLIT_QUERY,
  surveyDefaultZoneId,
  surveyAboutView,
  surveyDiscardConfirm,
  surveyDraftSummary,
  surveyDueLine,
  surveyEscapeView,
  surveyFieldBarView,
  surveyInitials,
  surveyJobHeaderView,
  surveyLeaveMessage,
  surveyLeaveConfirm,
  surveyNextDimField,
  surveyNextStep,
  surveyNowKey,
  surveyPartsView,
  surveySendBackItemsView,
  surveySendBackZoneIds,
  surveySheetHref,
  surveySheetNotices,
  surveySheetTotalsText,
  surveySubmitView,
  surveyVisitBadge,
  surveyZoneFooterView,
  surveyZoneActions,
  surveyZoneListView,
  surveyZoneNeighbors,
  surveyZoneSections,
  surveyZoneStateBadge,
  surveyZoneTitle,
  surveyZoneBaseName,
  surveyZoneListView as zoneListForNames,
} from './surveyFieldView.js';

// ── ของตั้งต้น (BRIEF §C) ─────────────────────────────────────────────────────
const part = (id, w, l, h, label = null) => ({ id, label, widthM: w, lengthM: l, heightM: h });
const file = (docType, fileName, createdAt = '2026-09-28T03:30:00.000Z') => ({ id: fileName, docType, fileName, createdAt });
const wide = (name, at) => file('survey_wide', name, at);
const spotPhoto = (name, at) => file('survey_spot', name, at);

const reception = (extra = {}) => ({
  id: 'z1', zoneId: 'SZN-1', zoneCode: 'ZN-1160-10254', zoneName: 'Reception', floor: '01', status: 'ok',
  parts: [part('p1', 8, 6, 3)],
  spots: [
    { id: 's1', label: 'มุมโซฟารับแขก', note: 'ปลั๊กอยู่ใต้โซฟา' },
    { id: 's2', label: 'ข้างเคาน์เตอร์ต้อนรับ', note: null },
    { id: 's3', label: 'เสาข้างประตูกระจก', note: null },
  ],
  note: '', packageQty: null,
  surveyedAt: '2026-09-28T03:36:00.000Z', surveyedByName: 'Phuwadol Aoonnankad',
  ...extra,
});
const md = (extra = {}) => ({
  id: 'z2', zoneId: 'SZN-2', zoneCode: 'ZN-1160-10255', zoneName: 'ห้อง MD', floor: '05', status: 'ok',
  parts: [part('p2', 6, 5, 2.8)],
  spots: [{ id: 's4', label: 'ชั้นวางหลังโต๊ะทำงาน', note: null }, { id: 's5', label: 'ข้างประตูห้องน้ำ', note: null }],
  note: '', packageQty: null, surveyedAt: '2026-09-28T03:50:00.000Z', surveyedByName: 'Phuwadol Aoonnankad',
  ...extra,
});
const treatment = (extra = {}) => ({
  id: 'z3', zoneId: 'SZN-3', zoneCode: 'ZN-1160-10256', zoneName: 'ห้อง Treatment', floor: '05', status: 'ok',
  parts: [part('p3', 7.5, 4, 3), part('p4', 3, 2, 3)],
  spots: [{ id: 's6', label: 'มุมเตียงที่ 1', note: null }, { id: 's7', label: 'เหนือชั้นวางผ้าขนหนู', note: null }],
  note: '', packageQty: null, surveyedAt: '2026-09-28T04:44:00.000Z', surveyedByName: 'Phuwadol Aoonnankad',
  ...extra,
});
/** Treatment ที่ยังไม่มีอะไรบันทึก (ม็อก A-2/A-3/AO-2) */
const treatmentEmpty = () => treatment({ parts: [], spots: [], surveyedAt: null, surveyedByName: null });

const filesAll = () => ({
  z1: [wide('IMG_2031.jpg'), wide('IMG_2032.jpg'), spotPhoto('IMG_2033.jpg')],
  z2: [wide('IMG_2040.jpg')],
  z3: [wide('IMG_2046.jpg'), wide('IMG_2047.jpg')],
});
const filesMidWork = () => ({ ...filesAll(), z3: [] });
const allZones = () => [reception(), md(), treatment()];
const midWorkZones = () => [reception(), md(), treatmentEmpty()];

const VISIT = {
  id: 'SV-1', code: 'SV-26090014', status: 'in_progress', scheduledDate: '2026-09-28',
  startTime: '10:00:00', endTime: null, actualStartTime: '10:12:00', actualEndTime: null,
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', assistantIds: ['u-np'],
};
const visit = (extra = {}) => ({ ...VISIT, ...extra });

/* ชื่อพื้นที่ตามที่ `surveyZoneTitle` คืนจริง — ตาเห็น "ห้อง Treatment · ชั้น 05" แต่มี NBSP สองตัว (จุดคั่นติดท้ายชื่อ ·
   "ชั้น" ติดเลข) ⇒ ตัวช่วยนี้แปลงคำบนบอร์ดเป็นสตริงจริง เทสต์จะได้อ่านเหมือนบอร์ด
   ⚠️ ใช้กับชื่อที่ต่อชั้นท้ายเท่านั้น — ชื่อที่ SA พิมพ์ชั้นไว้กลางชื่อเป็นข้อความดิบ (ช่องว่างปกติ) */
const NB = ' ';
const T = (text) => text.replace(' · ชั้น ', `${NB}· ชั้น${NB}`).replace(/^ชั้น /, `ชั้น${NB}`);

// ── ที่อยู่ · ชื่อ · ป้าย ────────────────────────────────────────────────────────

test('เส้นแบ่งจอ = เส้นของระบบ (1000 สองบาน · 1200 รางของหัวหน้า)', () => {
  assert.equal(SURVEY_SPLIT_QUERY, '(min-width: 1000px)');
  assert.equal(SURVEY_RAIL_QUERY, '(min-width: 1200px)');
});

test('ลิงก์ของใบ: หน้างาน · พื้นที่ · แท็บสรุป (แท็บสรุปไม่พกพื้นที่)', () => {
  assert.equal(surveySheetHref('DR-1'), '/service/surveys/DR-1');
  assert.equal(surveySheetHref('DR-1', { zoneId: 'SVZ-9' }), '/service/surveys/DR-1?zone=SVZ-9');
  assert.equal(surveySheetHref('DR-1', { tab: 'result', zoneId: 'SVZ-9' }), '/service/surveys/DR-1?tab=result');
});

test('ชื่อพื้นที่: ชั้นขึ้นครั้งเดียว — 🐞 เดิม "ห้อง Treatment ชั้น 5 ชั้น 05"', () => {
  assert.equal(surveyZoneTitle(treatment()), T('ห้อง Treatment · ชั้น 05'));
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'ห้อง Treatment ชั้น 5' })), T('ห้อง Treatment · ชั้น 05'));
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'ชั้น 5 ฝั่งตะวันออก' })), 'ชั้น 5 ฝั่งตะวันออก',
    'ชั้นอยู่กลางชื่อ = ไม่ต่อซ้ำ');
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'ชั้น 5' })), T('ชั้น 05'));
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'ห้องประชุม ชั้น 3' })), T('ห้องประชุม ชั้น 3 · ชั้น 05'),
    'ชั้นขัดกัน = เห็นทั้งคู่ (ไม่ซ่อนข้อมูลที่ขัดกัน)');
  assert.equal(surveyZoneTitle(treatment({ floor: null })), 'ห้อง Treatment');
  assert.equal(surveyZoneTitle({ zoneName: '  ' }), 'พื้นที่ไม่มีชื่อ');
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'Lobby LG', floor: 'LG' })), T('Lobby LG · ชั้น LG'));
});

test('🐞 ชื่อพื้นที่ตัดบรรทัดได้หลังจุดคั่นเท่านั้น — UAT 360: "ห้อง Treatment · ชั้น" / "05" (เลขชั้นตกบรรทัดเดี่ยว)', () => {
  /* NBSP ไม่ใช่ span nowrap — ชื่อนี้ไปอยู่ในหกที่ (หัวหน้าพื้นที่ · แถวรายการ · แถวกล่องส่งงาน · ตารางสรุป · กล่องตัด/ลบ ·
     ประโยค "ถัดไป"/"ยังขาด") และบางที่เป็นแค่ข้อความในกล่องยืนยัน ⇒ ข้อความต้องพกกติกาการตัดบรรทัดไปเอง */
  assert.equal(surveyZoneTitle(treatment()), 'ห้อง Treatment · ชั้น 05',
    'จุดคั่นติดท้ายชื่อ (บรรทัดไม่ขึ้นต้นด้วย "·" — กติกาเดียวกับแถวทีมบนหัวงาน) · "ชั้น" ติดเลข');
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'ชั้น 5' })), 'ชั้น 05');
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'ห้องประชุม ชั้น 3' })), 'ห้องประชุม ชั้น 3 · ชั้น 05',
    'ชั้นที่ SA พิมพ์ไว้ในชื่อเป็นข้อความดิบ — แตะเฉพาะส่วนที่ระบบต่อท้าย');
  assert.equal(surveyZoneTitle(treatment({ zoneName: 'ชั้น 5 ฝั่งตะวันออก' })), 'ชั้น 5 ฝั่งตะวันออก');
});

test('อักษรย่อบนวงชื่อ — คำแรก + คำสุดท้าย · ชื่อไทยข้ามสระหน้า', () => {
  assert.equal(surveyInitials('Phuwadol Aoonnankad'), 'PA');
  assert.equal(surveyInitials('Nattawut Pornprasit'), 'NP');
  assert.equal(surveyInitials('เอกชัย ใจดี'), 'อจ');
  assert.equal(surveyInitials('Admin'), 'AD');
  assert.equal(surveyInitials(''), '');
  assert.equal(surveyInitials(null), '');
});

test('ป้ายนัด: ส่งผลแล้วแต่นัดยังเปิด = "นัดยังไม่ปิด" มาก่อน · นอกนั้นสถานะนัดคำเดียวกับหน้าคำร้อง', () => {
  assert.deepEqual(surveyVisitBadge(visit({ status: 'in_progress' }), { sent: true }), { label: 'นัดยังไม่ปิด', tone: 'warning' });
  assert.deepEqual(surveyVisitBadge(visit({ status: 'scheduled' }), { sent: false }), { label: 'นัดไว้', tone: 'info' },
    '🐞 ใบที่ยังไม่ส่งผลห้ามขึ้นสีเตือน');
  assert.deepEqual(surveyVisitBadge(visit({ status: 'in_progress' })), { label: 'กำลังทำ', tone: 'info' });
  assert.deepEqual(surveyVisitBadge(visit({ status: 'done' }), { sent: true }), { label: 'เข้าแล้ว', tone: 'success' });
  assert.deepEqual(surveyVisitBadge(visit({ status: 'unable' })), { label: 'ทำไม่ได้', tone: 'warning' });
  assert.deepEqual(surveyVisitBadge(visit({ status: 'cancelled' }), { sent: true }), { label: 'ยกเลิก', tone: 'neutral' },
    'นัดที่ยกเลิกไม่ใช่นัดที่ค้าง');
  assert.equal(surveyVisitBadge(null), null);
});

// ── รายการพื้นที่ ─────────────────────────────────────────────────────────────

test('รายการระหว่างวัด (AO-2): Reception ✓ 48/144 · MD ✓ · Treatment "ขาด: ขนาด · ภาพกว้าง · จุด"', () => {
  const view = surveyZoneListView({ zones: midWorkZones(), filesByZone: filesMidWork() });
  const [r1, r2, r3] = view.rows;
  assert.equal(r1.code, 'ZN-1160-10254');
  assert.equal(r1.title, T('Reception · ชั้น 01'));
  assert.equal(r1.state, 'done');
  assert.equal(r1.areaText, '48 ตร.ม.');
  assert.equal(r1.sizeText, '48 ตร.ม. · 144 ลบ.ม.');
  assert.deepEqual(r1.marks.map((m) => [m.label, m.ok, m.value]), [['ขนาด', true, '48 ตร.ม.'], ['ภาพกว้าง', true, 2], ['จุด', true, 3]]);
  assert.equal(r1.missingText, null);
  assert.equal(r2.sizeText, '30 ตร.ม. · 84 ลบ.ม.');
  assert.equal(r2.state, 'done');
  assert.equal(r3.state, 'todo');
  assert.equal(r3.missingText, 'ขาด: ขนาด · ภาพกว้าง · จุด');
  assert.deepEqual(r3.marks.map((m) => [m.ok, m.value]), [[false, null], [false, null], [false, null]]);
  assert.equal(r3.index, 3);
  assert.equal(view.progressText, 'วัดแล้ว 2 / 3 พื้นที่');
  assert.deepEqual(view.leftNames, ['ห้อง Treatment']);
});

test('พื้นที่ที่ตัดออกไม่นับในตัวหาร แต่ยังเป็นแถว (เอากลับเข้าใบได้) พร้อมเหตุผล', () => {
  const zones = [...midWorkZones(), { id: 'z4', zoneName: 'ห้องน้ำชาย', status: 'cut', cutReason: 'ลูกค้าไม่ให้เข้า', parts: [], spots: [] }];
  const view = surveyZoneListView({ zones, filesByZone: filesMidWork() });
  assert.equal(view.progressText, 'วัดแล้ว 2 / 3 พื้นที่');
  const cut = view.rows[3];
  assert.equal(cut.state, 'cut');
  assert.equal(cut.tags.cut, true);
  assert.equal(cut.cutReason, 'ลูกค้าไม่ให้เข้า');
  assert.deepEqual(cut.marks, []);
  assert.equal(cut.missingText, null);
});

test('ป้าย "กำลังแก้ · ยังไม่บันทึก" เฉพาะแถวที่เลือก + มีค่าค้าง + สองบาน', () => {
  const base = { zones: midWorkZones(), filesByZone: filesMidWork(), selectedZoneId: 'z3', dirtyZoneId: 'z3' };
  assert.equal(surveyZoneListView({ ...base, split: true }).rows[2].tags.editing, true);
  assert.equal(surveyZoneListView({ ...base, split: true }).rows[2].selected, true);
  assert.equal(surveyZoneListView({ ...base, split: false }).rows[2].tags.editing, false, 'หน้าเดียวไม่มีทางเห็นแถวค้าง');
  assert.equal(surveyZoneListView({ ...base, split: true, dirtyZoneId: null }).rows[2].tags.editing, false);
  assert.equal(surveyZoneListView({ ...base, split: true, selectedZoneId: 'z1' }).rows[2].tags.editing, false);
});

test('ป้าย "หัวหน้ายังไม่เคาะ" (AW-2) เฉพาะหัวหน้า และเฉพาะแถวที่ช่างครบแล้ว · ป้ายเพิ่มหน้างาน', () => {
  const zones = [...midWorkZones(), { ...reception({ id: 'z5', zoneName: 'ห้องประชุมเล็ก', status: 'added' }) }];
  const files = { ...filesMidWork(), z5: [wide('IMG_3000.jpg')] };
  const head = surveyZoneListView({ zones, filesByZone: files, canDecide: true });
  assert.deepEqual(head.rows.map((r) => r.tags.headPending), [true, true, false, true],
    'Treatment ยังขาดของช่าง — บรรทัด "ขาด" พูดอยู่แล้ว ไม่ซ้อนป้ายที่สอง');
  const crew = surveyZoneListView({ zones, filesByZone: files, canDecide: false });
  assert.equal(crew.rows.some((r) => r.tags.headPending), false);
  assert.equal(head.rows[3].tags.added, true);
});

test('ป้าย "ส่งกลับให้แก้" บนแถวที่ข้อของหัวหน้าชี้ถึง — เฉพาะรอบที่ยังค้าง', () => {
  const sendBack = {
    pending: true,
    sentBack: { id: 'EU-1', at: '2026-09-29T02:10:00.000Z', byName: 'Arnon Aunsapwilai', items: ['ห้อง Treatment ขอภาพส่วน B อีกรูป'] },
  };
  const view = surveyZoneListView({ zones: allZones(), filesByZone: filesAll(), sendBack });
  assert.deepEqual(view.rows.map((r) => r.tags.sentBack), [false, false, true]);
  const done = surveyZoneListView({ zones: allZones(), filesByZone: filesAll(), sendBack: { ...sendBack, pending: false } });
  assert.equal(done.rows.some((r) => r.tags.sentBack), false);
});

test('รหัส ZN อ่านไม่สำเร็จ ≠ ไม่มีรหัส', () => {
  const view = surveyZoneListView({ zones: [reception({ zoneCode: null, zoneCodeUnknown: true })], filesByZone: filesAll() });
  assert.equal(view.rows[0].code, null);
  assert.equal(view.rows[0].codeUnknown, true);
});

test('พื้นที่ตั้งต้นของบานขวา: คนแก้ได้ = พื้นที่แรกที่ของช่างยังขาด · นอกนั้น = พื้นที่แรกที่ยังอยู่ในใบ', () => {
  assert.equal(surveyDefaultZoneId(midWorkZones(), filesMidWork(), { editable: true }), 'z3');
  assert.equal(surveyDefaultZoneId(midWorkZones(), filesMidWork(), { editable: false }), 'z1');
  assert.equal(surveyDefaultZoneId(allZones(), filesAll(), { editable: true }), 'z1', 'ครบหมด = พื้นที่แรก');
  const firstCut = [{ ...reception(), status: 'cut' }, md(), treatment()];
  assert.equal(surveyDefaultZoneId(firstCut, filesAll(), { editable: false }), 'z2', 'ข้ามพื้นที่ที่ตัดออก');
  assert.equal(surveyDefaultZoneId([{ ...reception(), status: 'cut' }], filesAll(), { editable: true }), null);
  assert.equal(surveyDefaultZoneId([], {}, {}), null);
});

test('🐞 canWrite ของ server ไม่รู้จักการล็อก — ใบที่ส่ง/ยกเลิกแล้วเปิดพื้นที่แรก ไม่ใช่ "งานถัดไป" ที่แก้ไม่ได้', () => {
  /* ยกมาจากเทสต์ค่าพับตั้งต้นที่ถอดไปใน §10.5 S10 — `visitWriteAccess` ตอบแค่ "เป็นช่างของนัดใบนี้ไหม"
     ⇒ GET ส่ง `canWrite: true` มาแม้บนใบที่ส่งไปแล้ว · หน้าต้องถาม `view.flags.canWrite` (หักล็อกแล้ว)
     ไม่ใช่ค่าดิบ ไม่งั้นบานขวาของใบที่ส่งแล้วเปิดพื้นที่ที่ "ยังขาด" ทั้งที่กรอกอะไรไม่ได้สักช่อง */
  const base = { id: 'DR-1', docNo: 'RQ-AS-26090188', kind: 'site_survey', dept: 'TS', status: 'acknowledged' };
  const viewer = { canWrite: true, canDecide: false };
  const openSheet = surveyControlView({ request: base, zones: midWorkZones(), filesByZone: filesMidWork(), viewer });
  assert.equal(openSheet.flags.canWrite, true);
  assert.equal(surveyDefaultZoneId(midWorkZones(), filesMidWork(), { editable: openSheet.flags.canWrite }), 'z3');
  for (const lock of [{ answeredAt: '2026-09-28T09:00:00.000Z' }, { cancelledAt: '2026-09-28T09:00:00.000Z' }]) {
    const locked = surveyControlView({ request: { ...base, ...lock }, zones: midWorkZones(), filesByZone: filesMidWork(), viewer });
    assert.equal(locked.flags.canWrite, false, 'flags.canWrite หักล็อกแล้ว');
    assert.equal(surveyDefaultZoneId(midWorkZones(), filesMidWork(), { editable: locked.flags.canWrite }), 'z1');
  }
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /surveyDefaultZoneId\(zones, filesByZone, \{ editable: view\.flags\.canWrite \}\)/,
    'หน้าส่งค่าที่หักล็อกแล้ว ไม่ใช่ data.canWrite ดิบ');
});

// ── ตัวเลื่อนพื้นที่ · ถัดไป ─────────────────────────────────────────────────────

test('ตัวเลื่อน: "พื้นที่ที่ 3 จาก 3 · วัดแล้ว 2" · พื้นที่สุดท้าย › ไม่วน · จุดบอกสถานะรายพื้นที่', () => {
  const n = surveyZoneNeighbors(midWorkZones(), 'z3', filesMidWork());
  assert.equal(n.index, 3);
  assert.equal(n.total, 3);
  assert.equal(n.prev, 'z2');
  assert.equal(n.next, null);
  assert.equal(n.ariaLabel, 'พื้นที่ที่ 3 จาก 3 · วัดแล้ว 2');
  assert.equal(n.compactText, null);
  assert.deepEqual(n.dots.map((d) => [d.state, d.current]), [['done', false], ['done', false], ['todo', true]]);
  const first = surveyZoneNeighbors(midWorkZones(), 'z1', filesMidWork());
  assert.equal(first.prev, null);
  assert.equal(first.next, 'z2');
});

test('ตัวเลื่อนเกิน 8 พื้นที่ขึ้น "n / t" · หาพื้นที่ไม่เจอ = ไม่มีปุ่มพาไป', () => {
  const many = Array.from({ length: 9 }, (_, i) => reception({ id: `z${i + 1}`, zoneName: `ห้อง ${i + 1}` }));
  assert.equal(surveyZoneNeighbors(many, 'z3', {}).compactText, '3 / 9');
  const missing = surveyZoneNeighbors(many, 'nope', {});
  assert.equal(missing.index, 0);
  assert.equal(missing.prev, null);
  assert.equal(missing.next, null);
});

const fiveZones = (gapAt) => Array.from({ length: 5 }, (_, i) => (gapAt.includes(i + 1)
  ? treatment({ id: `z${i + 1}`, zoneName: `ห้อง ${i + 1}`, parts: [], spots: [] })
  : reception({ id: `z${i + 1}`, zoneName: `ห้อง ${i + 1}` })));
const fiveFiles = () => Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`z${i}`, [wide(`IMG_${i}.jpg`)]]));

test('🐞 ถัดไป = ตัวที่ขาดข้างหน้าก่อน แล้วค่อยวนกลับ (ไม่ใช่ใบแรกของลิสต์เสมอ · ใบ 5 พื้นที่)', () => {
  const zones = fiveZones([1, 3, 5]);
  const at = (zoneId) => surveyNextStep({ zones, filesByZone: fiveFiles(), zoneId, canSubmit: true }).target;
  assert.deepEqual(at('z3'), { kind: 'zone', id: 'z5', name: 'ห้อง 5', back: false }, 'เดิมได้ห้อง 1 (ถอยหลัง)');
  assert.deepEqual(at('z2'), { kind: 'zone', id: 'z3', name: 'ห้อง 3', back: false });
  assert.deepEqual(at('z5'), { kind: 'zone', id: 'z1', name: 'ห้อง 1', back: true });
  assert.equal(surveyNextStep({ zones, filesByZone: fiveFiles(), zoneId: 'z5', canSubmit: true }).label, 'กลับไปที่ ห้อง 1');
});

test('🐞 ขาดที่ 1 กับ 5 — ยืนที่ 3 ต้องไปข้างหน้า (5) ไม่ใช่เด้งขึ้นหัวใบ · ไม่สลับ 1↔5 ไม่จบ', () => {
  const zones = fiveZones([1, 5]);
  const at = (zoneId) => surveyNextStep({ zones, filesByZone: fiveFiles(), zoneId, canSubmit: true }).target;
  assert.equal(at('z3').id, 'z5');
  assert.equal(at('z1').id, 'z5');
  assert.equal(at('z5').id, 'z1');
  assert.equal(at('z5').back, true);
});

test('ถัดไป: ไม่เหลือของขาดที่อื่น + ส่งงานได้ = "ถัดไป: ส่งงาน" · ค่าค้าง = บอก "บันทึกก่อน" แต่ยังบอกปลายทาง', () => {
  const step = surveyNextStep({ zones: midWorkZones(), filesByZone: filesMidWork(), zoneId: 'z3', dirty: true, canSubmit: true });
  assert.deepEqual(step.target, { kind: 'submit' });
  assert.equal(step.label, 'ถัดไป: ส่งงาน');
  assert.equal(step.blocker, 'บันทึกก่อน');
  const clean = surveyNextStep({ zones: midWorkZones(), filesByZone: filesMidWork(), zoneId: 'z3', canSubmit: true });
  assert.equal(clean.blocker, null);
});

test('ถัดไป: คนที่ส่งงานไม่ได้ (หัวหน้าไล่ดู · AW-2) = พื้นที่ถัดไปตามลำดับ · พื้นที่สุดท้าย = ไม่มี', () => {
  const head = surveyNextStep({ zones: allZones(), filesByZone: filesAll(), zoneId: 'z1', canSubmit: false });
  assert.deepEqual(head.target, { kind: 'zone', id: 'z2', name: 'ห้อง MD', back: false });
  assert.equal(head.label, 'ถัดไป: ห้อง MD');
  const last = surveyNextStep({ zones: allZones(), filesByZone: filesAll(), zoneId: 'z3', canSubmit: false });
  assert.equal(last.target, null);
  assert.equal(last.label, null);
});

// ── หน้าพื้นที่ ─────────────────────────────────────────────────────────────────

test('ขนาดรายส่วน (A-2): ส่วน A 30/90 · ส่วน B "รอความสูง" · รวมตอนนี้ + "ส่วน B ยังไม่ครบ"', () => {
  const view = surveyPartsView([
    { id: 'a', widthM: '7.5', lengthM: '4', heightM: '3' },
    { id: 'b', widthM: '3', lengthM: '2', heightM: '' },
  ]);
  assert.deepEqual(view.rows.map((r) => [r.name, r.state, r.resultText]), [
    ['ส่วน A', 'complete', '30 ตร.ม. · 90 ลบ.ม.'],
    ['ส่วน B', 'waiting', 'รอความสูง'],
  ]);
  assert.equal(view.rows[1].field, 'heightM', 'จอทำเครื่องหมายช่องที่ยังขาด');
  assert.deepEqual(view.total, {
    label: 'รวมตอนนี้', text: '30 ตร.ม. · 90 ลบ.ม.', sub: 'ส่วน B ยังไม่ครบ', hint: 'แบ่งส่วนไม่ให้ทับกัน', complete: false,
  });
  assert.equal(view.rows.every((r) => r.removable), true);
});

test('ขนาดครบ (A-3): "ครบ 2 ส่วน" 36 / 108 · "7,5" = 7.5 (แป้นทศนิยมบางภาษา)', () => {
  const view = surveyPartsView([
    { id: 'a', widthM: '7,5', lengthM: '4', heightM: '3' },
    { id: 'b', widthM: '3', lengthM: '2', heightM: '3' },
  ]);
  assert.equal(view.total.label, 'ครบ 2 ส่วน');
  assert.equal(view.total.text, '36 ตร.ม. · 108 ลบ.ม.');
  assert.equal(view.total.sub, null);
  assert.equal(view.total.complete, true);
});

test('ขนาด: ค่าที่ใช้ไม่ได้ใช้คำของด่านบันทึก · แถวว่างไม่นับ · ส่วนเดียวไม่มีถังขยะ', () => {
  const broken = surveyPartsView([{ id: 'a', widthM: '4', lengthM: '5', heightM: '0' }]);
  assert.equal(broken.rows[0].resultText, 'ความสูงต้องมากกว่า 0');
  assert.equal(broken.rows[0].removable, false);
  assert.equal(broken.total.text, '—');
  const blank = surveyPartsView([{ id: 'a', widthM: '', lengthM: '', heightM: '' }]);
  assert.equal(blank.rows[0].state, 'empty');
  assert.equal(blank.total.label, 'รวมตอนนี้');
  assert.equal(blank.total.sub, null, 'แถวว่าง ≠ แถวที่ยังไม่ครบ');
  assert.equal(blank.total.hint, null);
  assert.equal(surveyPartsView().rows.length, 0);
});

test('ของค้างเป็นคำสั้น: "ขนาด 2 ส่วน · จุด 2 จุด" เฉพาะหัวข้อที่ต่างจากที่บันทึก · กล่องถามก่อนทิ้งบอกว่ารูปไม่หาย', () => {
  const draft = {
    parts: [{ widthM: '7.5', lengthM: '4', heightM: '3' }, { widthM: '3', lengthM: '2', heightM: '3' }, { widthM: '', lengthM: '', heightM: '' }],
    spots: [{ label: 'มุมเตียงที่ 1', note: '' }, { label: 'เหนือชั้นวางผ้าขนหนู', note: '' }],
    note: '',
  };
  const summary = surveyDraftSummary(draft, treatmentEmpty());
  assert.equal(summary, 'ขนาด 2 ส่วน · จุด 2 จุด');
  assert.equal(surveyDraftSummary({ parts: treatment().parts, spots: treatment().spots, note: 'ฝ้าสูง' }, treatment()), 'หมายเหตุ');
  assert.equal(surveyDraftSummary({ parts: treatment().parts, spots: treatment().spots, note: '' }, treatment()), '');

  const ask = surveyDiscardConfirm({ zone: treatment(), summary });
  assert.equal(ask.title, 'ทิ้งค่าที่ยังไม่บันทึก?');
  assert.equal(ask.message, `${T('ห้อง Treatment · ชั้น 05')}: ขนาด 2 ส่วน · จุด 2 จุด ยังไม่ได้บันทึก — รูปที่ถ่ายไว้ขึ้นระบบแล้ว ไม่หาย`);
  assert.equal(ask.cancelLabel, 'กลับไปบันทึก');
  assert.equal(ask.confirmLabel, 'ทิ้งแล้วไปต่อ');
});

test('ป้ายรายหัวข้อ (A-3): ขนาด/จุดยังไม่บันทึก · ภาพกว้างขึ้นแล้ว 1 รูป · ภาพจุดยังไม่มี · หมายเหตุไม่มีป้าย', () => {
  const draft = {
    parts: [{ widthM: '7.5', lengthM: '4', heightM: '3' }, { widthM: '3', lengthM: '2', heightM: '3' }],
    spots: [{ label: 'มุมเตียงที่ 1', note: '' }],
    note: '',
  };
  const s = surveyZoneSections({ zone: treatmentEmpty(), files: [wide('IMG_2046.jpg')], draft, dirty: true });
  assert.deepEqual([s.size.mark, s.size.chip.text], ['dirty', 'ยังไม่บันทึก']);
  assert.deepEqual([s.wide.mark, s.wide.chip.text, s.wide.chip.check], ['done', 'ขึ้นแล้ว 1 รูป', true]);
  assert.deepEqual([s.spots.mark, s.spots.chip.text], ['dirty', 'ยังไม่บันทึก']);
  assert.deepEqual([s.spotPhotos.mark, s.spotPhotos.chip.text], ['todo', 'ยังไม่มี']);
  assert.deepEqual([s.note.mark, s.note.chip], ['todo', null]);
});

test('ป้ายรายหัวข้อ: บันทึกแล้ว = ติ๊กเขียว · ธงรวมบอกไม่ค้าง = ไม่มีหัวข้อค้าง แม้ลายเซ็นยังต่าง', () => {
  const saved = surveyZoneSections({ zone: reception(), files: filesAll().z1, draft: null, dirty: false });
  assert.deepEqual([saved.size.chip.text, saved.spots.chip.text, saved.wide.chip.text, saved.spotPhotos.chip.text],
    ['บันทึกแล้ว', 'บันทึกแล้ว', 'ขึ้นแล้ว 2 รูป', 'ขึ้นแล้ว 1 รูป']);
  const justSaved = surveyZoneSections({
    zone: treatmentEmpty(), files: [], dirty: false,
    draft: { parts: [{ widthM: '4', lengthM: '5', heightM: '3' }], spots: [], note: '' },
  });
  assert.equal(justSaved.size.mark, 'todo', 'บันทึกสำเร็จแล้วแถวใหม่ยังโหลดไม่ถึง — ไม่ใช่ค่าค้าง');
});

test('ท้ายหน้าพื้นที่ — ค่าค้าง (AT-2): "กดบันทึกเพื่อเก็บ …" + รูปขึ้นแล้ว/กำลังส่ง · ปุ่มบันทึกกรมท่า', () => {
  const next = surveyNextStep({ zones: midWorkZones(), filesByZone: filesMidWork(), zoneId: 'z3', dirty: true, canSubmit: true });
  const view = surveyZoneFooterView({
    zone: treatmentEmpty(), files: [wide('IMG_2046.jpg')], dirty: true,
    draftSummary: 'ขนาด 2 ส่วน · จุด 2 จุด', next, uploading: 1,
  });
  assert.equal(view.tone, 'dirty');
  assert.equal(view.head, 'กดบันทึกเพื่อเก็บ ขนาด 2 ส่วน · จุด 2 จุด');
  assert.equal(view.sub, 'ภาพกว้างขึ้นแล้ว 1 · กำลังส่ง 1 · รูปไม่ต้องรอบันทึก');
  assert.deepEqual(view.next, { label: 'ถัดไป: ส่งงาน', target: { kind: 'submit' }, blocker: 'บันทึกก่อน' });
  assert.deepEqual(view.save, { show: true, label: 'บันทึกพื้นที่นี้', enabled: true, reason: null, emphasis: 'primary' });
});

test('ท้ายหน้าพื้นที่ — ติดด่านบันทึก (AT-3): ประโยคของด่าน · ปุ่มดับพร้อมเหตุที่ตาเห็น', () => {
  const view = surveyZoneFooterView({ zone: treatmentEmpty(), files: [], dirty: true, saveBlocker: 'ส่วน B ยังขาดความสูง' });
  assert.equal(view.head, 'ส่วน B ยังขาดความสูง');
  assert.match(view.sub, /ระบบจะถามก่อนทิ้งค่าที่พิมพ์/);
  assert.equal(view.save.enabled, false);
  assert.equal(view.save.reason, 'ส่วน B ยังขาดความสูง');
  assert.equal(view.save.emphasis, 'quiet');
});

test('ท้ายหน้าพื้นที่ — บันทึกแล้ว: ช่าง "บันทึกครบแล้ว · ใคร · เมื่อไร" · หัวหน้า (AW-2) แก้ได้จนส่งผล · ยังไม่ได้แก้อะไร', () => {
  const crew = surveyZoneFooterView({ zone: reception(), files: filesAll().z1, dirty: false });
  assert.equal(crew.tone, 'saved');
  assert.equal(crew.head, 'บันทึกครบแล้ว · Phuwadol Aoonnankad · จ. 28 ก.ย. 10:36');
  assert.equal(crew.sub, 'ไม่มีค่าที่ยังไม่บันทึก');
  assert.deepEqual([crew.save.enabled, crew.save.reason], [false, 'ยังไม่ได้แก้อะไร']);

  const head = surveyZoneFooterView({
    zone: reception(), files: filesAll().z1, viewerKind: 'head',
    next: surveyNextStep({ zones: allZones(), filesByZone: filesAll(), zoneId: 'z1' }),
  });
  assert.equal(head.sub, 'หัวหน้าแก้ได้จนกว่าจะส่งผลให้ฝ่ายขาย · แก้แล้วต้องกดบันทึก');
  assert.equal(head.next.label, 'ถัดไป: ห้อง MD');

  const partial = surveyZoneFooterView({ zone: reception(), files: [], dirty: false });
  assert.equal(partial.head.startsWith('บันทึกแล้ว · '), true, 'ยังขาดรูป = ไม่ใช่ "บันทึกครบแล้ว"');
  assert.equal(partial.sub, 'ขาด: ภาพกว้าง');
});

test('ท้ายหน้าพื้นที่ — ยังไม่เคยบันทึก · กำลังบันทึก · บันทึกไม่สำเร็จ · ตัดออก · อ่านอย่างเดียว', () => {
  const fresh = surveyZoneFooterView({ zone: treatmentEmpty(), files: [] });
  assert.deepEqual([fresh.tone, fresh.head, fresh.sub], ['plain', 'ยังไม่ได้บันทึกค่าของพื้นที่นี้', 'ขาด: ขนาด · ภาพกว้าง · จุด']);

  const busy = surveyZoneFooterView({ zone: treatmentEmpty(), dirty: true, busy: true });
  assert.deepEqual([busy.head, busy.save.enabled, busy.save.reason], ['กำลังบันทึก…', false, 'กำลังบันทึก…']);

  const failed = surveyZoneFooterView({ zone: treatmentEmpty(), dirty: true, error: 'ส่งไม่ถึงเซิร์ฟเวอร์' });
  assert.deepEqual([failed.tone, failed.head, failed.sub], ['error', 'บันทึกไม่สำเร็จ', 'ส่งไม่ถึงเซิร์ฟเวอร์']);
  assert.equal(failed.save.enabled, true, 'กดบันทึกซ้ำได้');

  const cut = surveyZoneFooterView({ zone: treatment({ status: 'cut', cutReason: 'ลูกค้าไม่ให้เข้า' }) });
  assert.equal(cut.head, 'ตัดออกแล้ว — ลูกค้าไม่ให้เข้า');
  assert.equal(cut.save.show, false, 'พื้นที่ที่ตัดออกไม่มีอะไรให้บันทึก');

  const readOnly = surveyZoneFooterView({ zone: reception(), files: filesAll().z1, viewerKind: 'readonly' });
  assert.equal(readOnly.save.show, false);
  assert.equal(readOnly.sub, 'ดูอย่างเดียว');
});

// ── แถบงานของช่าง ─────────────────────────────────────────────────────────────

test('แถบก่อนเริ่มงาน (A-1): "นัด 10:00 · อีก 8 นาที" · รหัสนัด · เริ่มงานเป็นปุ่มกรมท่า', () => {
  const bar = surveyFieldBarView({ visit: visit({ status: 'scheduled', actualStartTime: null }), nowKey: '2026-09-28 09:52' });
  assert.equal(bar.head, 'นัด 10:00 · อีก 8 นาที');
  assert.equal(bar.sub, 'SV-26090014 · กดเมื่อถึงหน้างาน');
  assert.deepEqual(bar.action, { key: 'start', label: 'เริ่มงาน', blocker: null, emphasis: 'primary', gated: true });
  assert.equal(bar.label, 'งานของนัด SV-26090014', 'ชื่อพื้นที่ของแถบสำหรับโปรแกรมอ่านจอ');
  assert.equal(bar.sticky, true);
  assert.equal(bar.late, false);
});

test('นับถอยหลังของนัด: ชั่วโมง · เลยเวลา · คนละวัน · ไม่มีเวลา', () => {
  const at = (nowKey, extra = {}) => surveyFieldBarView({ visit: visit({ status: 'scheduled', ...extra }), nowKey });
  assert.equal(at('2026-09-28 08:55').head, 'นัด 10:00 · อีก 1 ชม. 5 นาที');
  assert.equal(at('2026-09-28 08:00').head, 'นัด 10:00 · อีก 2 ชม.');
  assert.equal(at('2026-09-28 10:00').head, 'นัด 10:00 · ถึงเวลานัดแล้ว');
  const late = at('2026-09-28 10:25');
  assert.equal(late.head, 'นัด 10:00 · เลยเวลานัด 25 นาที');
  assert.equal(late.late, true);
  assert.equal(at('2026-09-27 16:00').head, 'นัด จ. 28 ก.ย. 10:00 · พรุ่งนี้');
  assert.equal(at('2026-09-26 16:00').head, 'นัด จ. 28 ก.ย. 10:00 · อีก 2 วัน');
  assert.equal(at('2026-09-29 09:00').head, 'นัด จ. 28 ก.ย. 10:00 · เลยวันนัดมา 1 วัน');
  assert.equal(at('2026-09-28 09:00', { startTime: null }).head, 'นัดวันนี้');
  assert.equal(at(null).head, 'นัด จ. 28 ก.ย. 10:00', 'ไม่รู้เวลาตอนนี้ = ไม่นับถอยหลัง (ไม่อ่านนาฬิกาเอง)');
});

test('แถบระหว่างวัด (AO-2): "ยังส่งไม่ได้ · ยังขาด ห้อง Treatment" · ปุ่มส่งงานเงียบแต่ยังกดได้ (เปิดกล่องบอกรายพื้นที่)', () => {
  const list = surveyZoneListView({ zones: midWorkZones(), filesByZone: filesMidWork() });
  const bar = surveyFieldBarView({
    visit: visit(), progress: list.progress, leftNames: list.leftNames, crewGaps: [{ key: 'size' }], nowKey: '2026-09-28 10:58',
  });
  assert.equal(bar.head, 'ยังส่งไม่ได้');
  assert.equal(bar.sub, 'ยังขาด ห้อง Treatment');
  assert.deepEqual(bar.action, { key: 'submit', label: 'ส่งงาน', blocker: 'ยังขาด ห้อง Treatment', emphasis: 'quiet', gated: false });
  /* ⭐ ส่งงานไม่ใช่ปุ่มติดด่าน (`gated: false`) — ติดด่านก็ยังเปิดกล่องส่งงาน ซึ่งบอกรายพื้นที่พร้อม "ไปแก้"
     (แผนลงมือ §4 SurveyFieldBar) · เหตุบนแถบมีไว้บอกล่วงหน้า + เลือกโทนปุ่ม ไม่ใช่ไว้กั้น */
});

test('แถบระหว่างวัด: ครบแล้วแต่มีค่าค้าง = ยังส่งไม่ได้ · ใบว่าง = ชี้ทางเพิ่มพื้นที่/เข้าไม่ได้', () => {
  const dirty = surveyFieldBarView({ visit: visit(), progress: { done: 3, total: 3 }, dirtyZoneIds: ['z3'] });
  assert.equal(dirty.sub, 'มีค่าที่ยังไม่บันทึก — กดบันทึกพื้นที่นี้ก่อน');
  assert.equal(dirty.action.emphasis, 'quiet');
  const empty = surveyFieldBarView({ visit: visit(), progress: { done: 0, total: 0, cut: 0 } });
  assert.equal(empty.head, 'ยังไม่มีพื้นที่ให้วัด');
  assert.equal(empty.action.blocker, 'ใบนี้ยังไม่มีพื้นที่ให้วัด');
  const allCut = surveyFieldBarView({ visit: visit(), progress: { done: 0, total: 0, cut: 2 } });
  assert.equal(allCut.action.blocker, null, 'ตัดออกหมดทุกพื้นที่ = ส่งงานได้ (ด่านของ server ก็ปล่อย)');
});

test('แถบพร้อมส่ง (AT-4): "ครบทุกพื้นที่แล้ว · ส่งได้ · เริ่มงาน 10:12" · สองบานที่บันทึกได้อยู่ = ปุ่มเงียบ (กรมท่าปุ่มเดียว)', () => {
  const ready = surveyFieldBarView({ visit: visit(), progress: { done: 3, total: 3 } });
  assert.equal(ready.head, 'ครบทุกพื้นที่แล้ว');
  assert.equal(ready.sub, 'ส่งได้ · เริ่มงาน 10:12');
  assert.equal(ready.action.emphasis, 'primary');
  const split = surveyFieldBarView({ visit: visit(), progress: { done: 3, total: 3 }, split: true, zoneSaveEnabled: true });
  assert.equal(split.action.emphasis, 'quiet');
  assert.equal(split.action.blocker, null, 'เงียบเพราะมีปุ่มกรมท่าอื่น ไม่ใช่เพราะติดด่าน');
  const phone = surveyFieldBarView({ visit: visit(), progress: { done: 3, total: 3 }, split: false, zoneSaveEnabled: true });
  assert.equal(phone.action.emphasis, 'primary', 'หน้าเดียว: แถบกับท้ายพื้นที่ไม่อยู่บนจอพร้อมกัน');
});

test('🐞 หัวหน้าที่ไปหน้างานเอง: การ์ดส่งผลกดได้ = แถบถอยเป็นปุ่มเงียบ (กรมท่าปุ่มเดียวต่อจอ · UAT 25/09)', () => {
  const senior = surveyFieldBarView({ visit: visit(), progress: { done: 3, total: 3 }, cardPrimary: true });
  assert.equal(senior.action.emphasis, 'quiet');
  assert.equal(senior.action.blocker, null, 'เงียบเพราะการ์ดเป็นปุ่มหลัก ไม่ใช่เพราะติดด่าน');
  const crew = surveyFieldBarView({ visit: visit(), progress: { done: 3, total: 3 }, cardPrimary: false });
  assert.equal(crew.action.emphasis, 'primary');
});

test('แถบถูกส่งกลับ (A-5): "แก้แล้ว 1 / 2 ข้อ" · ครบฝั่งช่าง = "แจ้งได้" · ยังขาด = ด่านเดียวกับ route', () => {
  const sendBack = { pending: true, sentBack: { items: ['ข้อหนึ่ง', 'ข้อสอง'] } };
  const closed = visit({ status: 'done', actualEndTime: '11:46:00' });
  const ok = surveyFieldBarView({ visit: closed, sendBack, ticks: [0], progress: { done: 3, total: 3 } });
  assert.equal(ok.tone, 'todo');
  assert.equal(ok.head, 'แก้แล้ว 1 / 2 ข้อ');
  assert.equal(ok.sub, 'ขนาด · ภาพกว้าง · จุด ครบ · แจ้งได้');
  assert.deepEqual(ok.action, { key: 'report-fixed', label: 'แจ้งหัวหน้าว่าแก้แล้ว', blocker: null, emphasis: 'primary', gated: true });

  const blocked = surveyFieldBarView({
    visit: closed, sendBack, ticks: [0, 1, 7], leftNames: ['ห้อง Treatment'], crewGaps: [{ key: 'wide' }],
    doneBlocker: 'ยังแจ้งไม่ได้ — ยังขาด ภาพกว้าง (ห้อง Treatment)',
  });
  assert.equal(blocked.head, 'แก้แล้ว 2 / 2 ข้อ', 'เลขข้อที่เกินจำนวนข้อไม่นับ');
  assert.equal(blocked.sub, 'ยังขาด ห้อง Treatment');
  assert.equal(blocked.action.blocker, 'ยังแจ้งไม่ได้ — ยังขาด ภาพกว้าง (ห้อง Treatment)');
  assert.equal(blocked.action.emphasis, 'quiet');
  assert.equal(blocked.action.gated, true, 'แจ้งแก้แล้วยิงตรงจากแถบ — ติดด่าน = กดแล้วบอกเหตุ ไม่ยิง');
});

test('แถบหลังส่งงาน = บอกผล ไม่มีปุ่ม ไม่ติดขอบ · ร่าง/ยกเลิก/ไม่มีนัด = ไม่มีแถบ', () => {
  const done = surveyFieldBarView({ visit: visit({ status: 'done', actualEndTime: '11:46:00' }) });
  assert.deepEqual([done.tone, done.head, done.sub, done.action, done.sticky],
    ['ok', 'ส่งงานแล้ว', 'เมื่อ 11:46 น. · ยังแก้ผลวัดได้จนกว่าจะส่งผลให้ฝ่ายขาย', null, false]);
  const unable = surveyFieldBarView({ visit: visit({ status: 'unable' }) });
  assert.deepEqual([unable.tone, unable.head], ['warn', 'ปิดว่าไปแล้วเข้าไม่ได้']);
  assert.equal(surveyFieldBarView({ visit: visit({ status: 'draft' }) }), null);
  assert.equal(surveyFieldBarView({ visit: visit({ status: 'cancelled' }) }), null);
  assert.equal(surveyFieldBarView({ visit: null }), null);
  assert.equal(surveyFieldBarView(), null);
});

test('แถว "ไปแล้วเข้าไม่ได้": คำถามเปลี่ยนหลังเริ่มงาน · ซ่อนเมื่อนัดปิด/ใบล็อก/ไม่ใช่ช่าง', () => {
  const crew = { canWrite: true, locked: false, actsAsCrew: true };
  assert.deepEqual(surveyEscapeView({ ...crew, visit: visit({ status: 'scheduled' }) }),
    { show: true, prompt: 'มาถึงแล้วแต่เข้าไม่ได้?', label: 'ไปแล้วเข้าไม่ได้' });
  assert.equal(surveyEscapeView({ ...crew, visit: visit() }).prompt, 'ทำต่อทั้งงานไม่ได้?');
  assert.equal(surveyEscapeView({ ...crew, visit: visit({ status: 'done' }) }).show, false);
  assert.equal(surveyEscapeView({ ...crew, locked: true, visit: visit() }).show, false);
  assert.equal(surveyEscapeView({ ...crew, actsAsCrew: false, visit: visit() }).show, false);
  assert.equal(surveyEscapeView({ ...crew, canWrite: false, visit: visit() }).show, false);
  assert.equal(surveyEscapeView().show, false);
});

// ── กล่องส่งงาน ─────────────────────────────────────────────────────────────────

test('กล่องส่งงาน (A-4): ยังไม่เลือกผล = เหตุแรก · รวม 114 / 336 · ภาพกว้าง 5 · จุด 7 · บอกผลกรณีเข้าได้ไว้ก่อน', () => {
  const view = surveySubmitView({ outcome: null, visit: visit(), zones: allZones(), filesByZone: filesAll(), nowKey: '2026-09-28 11:46' });
  assert.equal(view.title, 'ส่งงาน · SV-26090014');
  assert.equal(view.statusLabel, 'กำลังทำ');
  assert.equal(view.blocker, 'เลือกผลของการเข้าครั้งนี้ก่อน');
  assert.deepEqual(view.outcome, { tone: 'warn', text: 'เลือกผลของการเข้าครั้งนี้ก่อน' });
  assert.equal(view.progressText, 'วัดแล้ว 3 / 3 พื้นที่');
  assert.deepEqual(view.totals, { zones: 3, areaSqm: 114, volumeCbm: 336, wide: 5, spots: 7 });
  assert.deepEqual(view.totalsText, { label: 'รวม 3 พื้นที่', figures: '114 ตร.ม. · 336 ลบ.ม.', counts: 'ภาพกว้าง 5 · จุด 7' });
  assert.deepEqual(view.rows.map((r) => [r.code, r.title, r.state, r.figures, r.counts]), [
    ['ZN-1160-10254', T('Reception · ชั้น 01'), 'ok', '48 ตร.ม. · 144 ลบ.ม.', 'ภาพกว้าง 2 · จุด 3'],
    ['ZN-1160-10255', T('ห้อง MD · ชั้น 05'), 'ok', '30 ตร.ม. · 84 ลบ.ม.', 'ภาพกว้าง 1 · จุด 2'],
    ['ZN-1160-10256', T('ห้อง Treatment · ชั้น 05'), 'ok', '36 ตร.ม. · 108 ลบ.ม.', 'ภาพกว้าง 2 · จุด 2'],
  ]);
  assert.equal(view.effectsCaption, 'กรณีเข้าพื้นที่ได้');
  assert.deepEqual(view.effects.map((e) => e.text), [
    'ปิดนัด SV-26090014 เป็น “เข้าแล้ว” (10:12–11:46)',
    'แจ้งหัวหน้า TS ให้เคาะจุดติดตั้งและแพ็คเกจ',
    'ยังแก้ผลวัดได้จนกว่าหัวหน้าจะส่งผลให้ฝ่ายขาย',
  ]);
  assert.equal(view.effects[0].code, 'SV-26090014');
});

test('กล่องส่งงาน: เข้าได้ + ครบ = ไม่มีเหตุ · บรรทัดผลบอกสองข้อแรก', () => {
  const view = surveySubmitView({ outcome: 'entered', visit: visit(), zones: allZones(), filesByZone: filesAll(), nowKey: '2026-09-28 11:46' });
  assert.equal(view.blocker, null);
  assert.deepEqual(view.outcome, {
    tone: 'ok', text: 'ปิดนัด SV-26090014 เป็น “เข้าแล้ว” (10:12–11:46) · แจ้งหัวหน้า TS ให้เคาะจุดติดตั้งและแพ็คเกจ',
  });
});

test('กล่องส่งงาน: "เข้าได้" ก่อนกดเริ่มงาน = ติด พร้อมทางออก (ไม่มีเวลาเริ่มจริงให้ปิด)', () => {
  const scheduled = visit({ status: 'scheduled', actualStartTime: null });
  const view = surveySubmitView({ outcome: 'entered', visit: scheduled, zones: allZones(), filesByZone: filesAll(), nowKey: '2026-09-28 09:55' });
  assert.equal(view.blocker, 'ยังไม่ได้กด “เริ่มงาน” — ปิดกล่องนี้แล้วกดเริ่มงานที่แถบล่าง');
  assert.equal(view.enteredBlocker, view.blocker, 'ไทล์ "เข้าพื้นที่ได้" บอกเหตุเดียวกันตั้งแต่ก่อนเลือก');
  const unable = surveySubmitView({ outcome: 'unable', reason: 'ตึกปิดซ่อมระบบไฟทั้งชั้น', visit: scheduled, zones: allZones(), filesByZone: filesAll(), nowKey: '2026-09-28 09:55' });
  assert.equal(unable.blocker, null, 'เข้าไม่ได้ก่อนเริ่มงานทำได้ (server ประทับเวลาเริ่ม = จบ)');
  assert.equal(unable.effects[0].text, 'ปิดนัด SV-26090014 เป็น “ทำไม่ได้” (09:55)');
});

test('กล่องส่งงาน — เข้าไม่ได้: เหตุผลสั้นไป = ติด · ครบ = บอกผล "ทำไม่ได้" + กลับเข้าคิว + ผลวัดที่บันทึกไว้ยังอยู่', () => {
  const short = surveySubmitView({ outcome: 'unable', reason: 'ปิด', visit: visit(), zones: midWorkZones(), filesByZone: filesMidWork(), nowKey: '2026-09-28 11:46' });
  assert.equal(short.blocker, 'บอกเหตุผลที่เข้าไม่ได้อย่างน้อย 10 ตัวอักษร — ฝ่ายขายจะเห็นข้อความนี้');
  const ok = surveySubmitView({
    outcome: 'unable', reason: 'ลูกค้าปิดห้อง Treatment ทำความสะอาด', visit: visit(),
    zones: midWorkZones(), filesByZone: filesMidWork(), dirtyZoneIds: ['z3'], nowKey: '2026-09-28 11:46',
  });
  assert.equal(ok.blocker, null, 'เข้าไม่ได้ไม่ถามของขาด/ค่าค้าง');
  assert.equal(ok.effectsCaption, 'กรณีไปแล้วเข้าไม่ได้');
  assert.deepEqual(ok.effects.map((e) => e.text), [
    'ปิดนัด SV-26090014 เป็น “ทำไม่ได้” (10:12–11:46)',
    'คำร้องกลับเข้าคิว ให้ TS ลงวันใหม่',
    'ฝ่ายขายได้รับเหตุผลที่เข้าไม่ได้',
    'ผลวัดที่บันทึกไว้ 2 พื้นที่ยังอยู่บนใบ',
  ]);
  const nothingKept = surveySubmitView({ outcome: 'unable', reason: 'ลูกค้าปิดทั้งชั้นวันนี้', visit: visit(), zones: [treatmentEmpty()], filesByZone: {}, nowKey: '2026-09-28 11:46' });
  assert.equal(nothingKept.effects.some((e) => e.key === 'kept'), false);
});

test('กล่องส่งงาน — ลำดับเหตุของ "เข้าได้": ค่าค้าง → ไม่มีพื้นที่ → ของขาด (คำเดิมของกล่อง)', () => {
  const dirty = surveySubmitView({ outcome: 'entered', visit: visit(), zones: midWorkZones(), filesByZone: filesMidWork(), dirtyZoneIds: ['z3'] });
  assert.equal(dirty.blocker, 'มีค่าที่ยังไม่บันทึก: ห้อง Treatment — กด “บันทึกพื้นที่นี้” ก่อนส่งงาน');
  assert.equal(dirty.rows[2].state, 'miss', 'แถวบอกของขาดก่อน · กล่องยังบล็อกเรื่องค่าค้าง');
  assert.equal(dirty.rows[2].go, true);

  const gaps = surveySubmitView({ outcome: 'entered', visit: visit(), zones: midWorkZones(), filesByZone: filesMidWork() });
  assert.equal(gaps.blocker, 'ยังขาดผลวัด 1 พื้นที่ — กด “ไปแก้” หรือ “ตัดพื้นที่นี้ออก”');
  assert.equal(gaps.rows[2].note, 'ขาด: ขนาด · ภาพกว้าง · จุด');

  const none = surveySubmitView({ outcome: 'entered', visit: visit(), zones: [], filesByZone: {} });
  assert.equal(none.blocker, 'ใบนี้ยังไม่มีพื้นที่ให้วัด — เพิ่มพื้นที่ที่เจอหน้างานก่อน หรือเลือก “ไปแล้วเข้าไม่ได้”');

  const cut = surveySubmitView({ outcome: 'entered', visit: visit(), zones: [...allZones(), { id: 'z4', zoneName: 'ห้องน้ำ', status: 'cut' }], filesByZone: filesAll() });
  assert.equal(cut.blocker, null);
  assert.deepEqual([cut.rows[3].state, cut.rows[3].note, cut.rows[3].counts], ['cut', 'ตัดออก — ไม่ต้องวัด', null]);
  assert.equal(cut.totalsText.label, 'รวม 3 พื้นที่');
});

test('กล่องส่งงาน — ผลหลังส่งพูดตามคนกด: Senior ที่ออกหน้างานเอง · หัวหน้าที่ส่งแทนช่าง', () => {
  const senior = surveySubmitView({ outcome: 'entered', visit: visit(), zones: allZones(), filesByZone: filesAll(), viewerKind: 'senior' });
  assert.match(senior.effects.map((e) => e.text).join(' | '), /คุณเคาะจุดติดตั้งและแพ็คเกจต่อได้เลยที่แท็บสรุปส่งผล/);
  const head = surveySubmitView({ outcome: 'entered', visit: visit(), zones: allZones(), filesByZone: filesAll(), viewerKind: 'head' });
  assert.match(head.effects[1].text, /^ส่งแทนช่าง/);
});

// ── หัวงาน ────────────────────────────────────────────────────────────────────

const SITE = {
  id: 'SS-1', code: 'ST-1036-01-BKK-1160', name: 'สำนักงานใหญ่',
  address: 'พันนา เอกมัย - รามอินทรา (เซ็นทรัล อีสต์วิลล์ 106 Nak Niwat 6 Alley, Khwaeng Lat Phrao, Lat Phrao, Bangkok 10230',
  contactName: 'คุณแหวน', contactPhone: '098-162-3632',
  accessDays: [1], accessFrom: '14:30:00', accessTo: '16:30:00', accessNote: 'นำเครื่อง 05 กับกลิ่นสุขไปด้วย',
  mapUrl: 'https://maps.app.goo.gl/abc',
};
const CREW = [
  { id: 'u-pa', name: 'Phuwadol Aoonnankad', lead: true, you: true },
  { id: 'u-np', name: 'Nattawut Pornprasit', lead: false, you: false },
];
const header = (extra = {}) => surveyJobHeaderView({
  request: { docNo: 'RQ-AS-26090188', title: 'ขอทีมงานประเมินพื้นที่และร่วมประชุมนอกสถานที่' },
  customer: { arCode: 'AR-1036', name: 'บริษัท เอสล่า จำกัด' },
  site: SITE, visit: visit({ status: 'scheduled', actualStartTime: null }), crew: CREW, ...extra,
});

test('หัวงาน (A-1): ไซต์ "รหัส · ชื่อ" · โทร/นำทาง · ทีม "คุณ · … (ผู้ช่วย)" · ฝากมา', () => {
  const h = header();
  assert.equal(h.site.title, 'ST-1036-01-BKK-1160 · สำนักงานใหญ่');
  assert.equal(h.site.href, '/database/sites/SS-1', 'ลิงก์ทะเบียนไซต์ของหัวใบเดิมยังอยู่ (ชุด S9)');
  assert.equal(h.site.address, SITE.address);
  assert.deepEqual(h.call, { href: 'tel:0981623632', label: 'โทร คุณแหวน' });
  assert.deepEqual(h.nav, { href: 'https://maps.app.goo.gl/abc', label: 'นำทาง' });
  const facts = Object.fromEntries(h.facts.map((f) => [f.key, f]));
  assert.equal(facts.visit.value, 'SV-26090014 · จ. 28 ก.ย. 10:00');
  assert.equal(facts.visit.sub, null);
  assert.equal(facts.crew.value, 'คุณ · Nattawut Pornprasit (ผู้ช่วย)');
  assert.deepEqual(facts.crew.people.map((p) => [p.initials, p.text, p.helper]), [['PA', 'คุณ', false], ['NP', 'Nattawut Pornprasit', true]]);
  assert.equal(facts.access.value, 'จ. · 14:30–16:30');
  assert.equal(facts.note.value, 'นำเครื่อง 05 กับกลิ่นสุขไปด้วย');
  assert.deepEqual(h.request, {
    docNo: 'RQ-AS-26090188', title: 'ขอทีมงานประเมินพื้นที่และร่วมประชุมนอกสถานที่', customerText: 'AR-1036 · บริษัท เอสล่า จำกัด',
  });
});

test('หัวงาน: เตือนสีอำพันเรื่องช่วงเข้าไซต์ **ก่อนเริ่มงานเท่านั้น** — เข้าไปแล้วคำเตือนหมดประโยชน์', () => {
  const before = header().facts.find((f) => f.key === 'access');
  assert.equal(before.warn, 'นัด 10:00 อยู่นอกช่วงนี้ — โทรเช็กคุณแหวนก่อน');
  const started = header({ visit: visit() }).facts.find((f) => f.key === 'access');
  assert.equal(started.warn, null);
  const inside = header({ visit: visit({ status: 'scheduled', startTime: '15:00:00' }) }).facts.find((f) => f.key === 'access');
  assert.equal(inside.warn, null, 'อยู่ในช่วง = ไม่เตือน');
  const wrongDay = header({ visit: visit({ status: 'scheduled', scheduledDate: '2026-09-29', startTime: '15:00:00' }) })
    .facts.find((f) => f.key === 'access');
  assert.equal(wrongDay.warn, 'อ. 29 ก.ย. ไซต์ไม่ให้เข้า — โทรเช็กคุณแหวนก่อน');
});

test('หัวงาน: นัดเริ่มแล้ว/ปิดแล้วบอกเวลาจริง · ไซต์อ่านไม่สำเร็จ = "ไม่ทราบ" ไม่ใช่ขีด · ไม่มีเบอร์ = ไม่มีปุ่มโทร', () => {
  assert.equal(header({ visit: visit() }).facts[0].sub, 'เริ่มงาน 10:12');
  assert.equal(header({ visit: visit({ status: 'done', actualEndTime: '11:46:00' }) }).facts[0].sub, 'เข้าแล้ว 10:12–11:46');
  const lost = header({ site: null, unknown: { site: true } });
  assert.equal(lost.site.title, 'ไม่ทราบ');
  assert.equal(lost.facts.find((f) => f.key === 'access').value, 'ไม่ทราบ');
  const noSite = header({ site: null });
  assert.equal(noSite.site.title, '—');
  assert.equal(noSite.site.href, null);
  assert.equal(noSite.call, null);
  assert.equal(noSite.nav, null);
  assert.equal(header({ site: { ...SITE, contactPhone: '' } }).call, null);
});

test('หัวงาน: ไม่มีรายชื่อทีม (GET รุ่นก่อน) = ถอยไปชื่อคนไปบนนัด · ชื่อผู้ช่วยอ่านไม่สำเร็จ = "ไม่ทราบ"', () => {
  const fallback = header({ crew: [] }).facts.find((f) => f.key === 'crew');
  assert.equal(fallback.value, 'Phuwadol Aoonnankad');
  const lost = header({ crew: [CREW[0], { id: 'u-x', name: null, lead: false, you: false }] }).facts.find((f) => f.key === 'crew');
  assert.equal(lost.value, 'คุณ · ไม่ทราบ (ผู้ช่วย)');
  const gone = header({ crew: [CREW[0], { id: 'u-x', name: null, lead: false, you: false, gone: true }] }).facts.find((f) => f.key === 'crew');
  assert.equal(gone.value, 'คุณ · เจ้าหน้าที่ที่ไม่อยู่ในรายชื่อแล้ว (ผู้ช่วย)');
});

// ── การ์ดส่งกลับของช่าง (A-5) ───────────────────────────────────────────────────

const SENT_AT = '2026-09-29T02:10:00.000Z'; // อ. 29 ก.ย. 09:10 เวลาไทย
const sentBack = (items, extra = {}) => ({
  pending: true,
  sentBack: { id: 'EU-9', at: SENT_AT, byId: 'u-aa', byName: 'Arnon Aunsapwilai', note: items.join('\n'), items },
  done: null,
  ...extra,
});
const A5_ITEMS = [
  'ห้อง Treatment ภาพกว้างเห็นแค่ส่วน A — ขอภาพส่วน B อีกรูป',
  'จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป',
];

test('การ์ดส่งกลับ (A-5): ใคร/เมื่อไร · ข้อที่ชื่อพื้นที่ตรง = "ไปถ่าย" + หลักฐานรูปที่ขึ้นหลังส่งกลับ · ติ๊ก 1 / 2', () => {
  const files = { ...filesAll(), z3: [...filesAll().z3, wide('IMG_2118.jpg', '2026-09-29T02:25:00.000Z')] };
  const view = surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS), zones: allZones(), filesByZone: files, ticks: [0] });
  assert.equal(view.title, 'หัวหน้าส่งกลับให้แก้');
  assert.equal(view.meta, 'Arnon Aunsapwilai · อ. 29 ก.ย. 09:10');
  assert.equal(view.byInitials, 'AA');
  assert.deepEqual(view.items.map((i) => [i.index, i.zoneId, i.via, i.done]), [[0, 'z3', 'zone', true], [1, 'z3', 'spot', false]]);
  assert.deepEqual(view.items[0].evidence, { count: 1, text: 'เพิ่ม IMG_2118.jpg · ภาพกว้างรวม 3 รูป' });
  assert.equal(view.items[1].evidence, null, 'ข้อที่ผูกผ่านชื่อจุดนับเฉพาะภาพจุด — รูปกว้างเป็นหลักฐานของอีกข้อ');
  assert.equal(view.doneText, '1 / 2 ข้อ');
  assert.deepEqual(view.doneItems, [0]);
});

test('ผูกข้อกับพื้นที่: ชื่อยาวสุดชนะ · ยาวเท่ากันคนละพื้นที่ = ไม่ผูก · ไม่มีชื่อไหนตรง = ไม่มีปุ่มพาไป', () => {
  const zones = [
    { id: 'a', zoneName: 'MD', status: 'ok', parts: [], spots: [] },
    { id: 'b', zoneName: 'ห้อง MD', status: 'ok', parts: [], spots: [] },
    { id: 'c', zoneName: 'ห้อง A1', status: 'ok', parts: [], spots: [] },
    { id: 'd', zoneName: 'ห้อง B1', status: 'ok', parts: [], spots: [] },
  ];
  const view = surveySendBackItemsView({
    sendBack: sentBack(['ห้อง MD ขอรูปมุมกว้างอีกรูป', 'ห้อง A1 กับ ห้อง B1 ขอวัดใหม่', 'ขอรูปป้ายหน้าตึก']), zones, filesByZone: {},
  });
  assert.deepEqual(view.items.map((i) => i.zoneId), ['b', null, null]);
});

test('หลักฐาน = เฉพาะรูปที่ขึ้น **หลัง** หัวหน้าส่งกลับ · ไม่รู้เวลาส่งกลับ = ไม่เดา', () => {
  const old = { z3: [wide('IMG_2046.jpg', '2026-09-28T04:00:00.000Z')] };
  const view = surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS), zones: allZones(), filesByZone: old });
  assert.equal(view.items[0].evidence, null);
  const noTime = surveySendBackItemsView({
    sendBack: { pending: true, sentBack: { items: A5_ITEMS, at: null, byName: null } },
    zones: allZones(), filesByZone: { z3: [wide('IMG_9.jpg', '2026-09-30T00:00:00.000Z')] },
  });
  assert.equal(noTime.items[0].evidence, null);
  assert.equal(noTime.meta, 'ไม่ทราบ · ไม่ทราบ');
});

test('แถวส่งกลับรุ่นเก่า (ไม่มี items) = ข้อความทั้งก้อนเป็นหนึ่งข้อ · ไม่เคยส่งกลับ = null · ติ๊กนอกช่วงไม่นับ', () => {
  const legacy = surveySendBackItemsView({
    sendBack: { pending: true, sentBack: { at: SENT_AT, byName: 'Arnon', note: 'ห้อง MD ขอรูปใหม่' } },
    zones: allZones(), filesByZone: {}, ticks: [0, 3, -1, 1.5],
  });
  assert.equal(legacy.items.length, 1);
  assert.equal(legacy.items[0].zoneId, 'z2');
  assert.deepEqual(legacy.doneItems, [0]);
  assert.equal(surveySendBackItemsView({ sendBack: { pending: false, sentBack: null } }), null);
  assert.equal(surveySendBackItemsView(), null);
  assert.equal(surveySendBackZoneIds(null, allZones()).size, 0);
});

/* ══ ชุด S8 — การ์ดส่งกลับของช่าง · นาฬิกาของแถบ (แผน §10.5 S8) ═══════════════════════════════ */

test('การ์ดส่งกลับ: นัดปิดแล้ว = ติ๊ก + "แก้อะไรไป" ไปกับปุ่มบนแถบ · นัดยังเปิด = ส่งงานปิดเรื่องให้เอง (ไม่มีช่องติ๊ก)', () => {
  const closed = visit({ status: 'done', actualEndTime: '11:46:00' });
  const report = surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS), zones: allZones(), filesByZone: filesAll(), visit: closed });
  assert.equal(report.mode, 'report');
  assert.equal(report.hint, null);
  /* ⚠️ นัดยังเปิด: route ปิดนัดเขียน "แก้แล้ว" ให้เองตอนส่งงาน โดยไม่พกข้อที่ติ๊ก ⇒ ช่องติ๊กบนจอ = ติ๊กที่หายเงียบ */
  const open = surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS), zones: allZones(), filesByZone: filesAll(), visit: visit() });
  assert.equal(open.mode, 'submit');
  assert.equal(open.hint, 'แก้ให้ครบแล้วกด “ส่งงาน” — เรื่องนี้ปิดไปพร้อมการส่งงาน');
  assert.equal(surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS), zones: allZones(), visit: visit({ status: 'scheduled' }) }).mode,
    'submit');
  // ปิดว่าเข้าไม่ได้ = ใบกลับไปลงคิว ไม่มีอะไรให้แจ้งแก้ · แจ้งไปแล้ว (ไม่ค้าง) · ไม่มีนัด = ไม่มีการ์ด
  assert.equal(surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS), zones: allZones(), visit: visit({ status: 'unable' }) }).mode, null);
  assert.equal(surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS, { pending: false }), zones: allZones(), visit: closed }).mode, null);
  assert.equal(surveySendBackItemsView({ sendBack: sentBack(A5_ITEMS), zones: allZones() }).mode, null);
});

test('ปุ่มพาไปของข้อ: ข้อที่พูดถึงรูป = "ไปถ่าย" · ข้ออื่น = "ไปแก้" · ชื่อปุ่มบอกว่าไปที่พื้นที่ไหน', () => {
  const view = surveySendBackItemsView({
    sendBack: sentBack([...A5_ITEMS, 'ห้อง MD ความยาวผิด ต้องวัดใหม่']), zones: allZones(), filesByZone: {},
  });
  assert.deepEqual(view.items.map((i) => [i.goLabel, i.goAria]), [
    ['ไปถ่าย', 'ไปถ่ายที่ ห้อง Treatment'],
    ['ไปถ่าย', 'ไปถ่ายที่ ห้อง Treatment'],
    ['ไปแก้', 'ไปแก้ที่ ห้อง MD'],
  ]);
  const none = surveySendBackItemsView({ sendBack: sentBack(['ขอรูปป้ายหน้าตึก']), zones: allZones(), filesByZone: {} });
  assert.deepEqual([none.items[0].goLabel, none.items[0].goAria], [null, null], 'ไม่รู้ว่าพื้นที่ไหน = ไม่มีปุ่มพาไป');
});

test('นาฬิกาของแถบ: จุดเวลา → "YYYY-MM-DD HH:MM" เวลาไทย (ข้ามเที่ยงคืน UTC ถูกวัน) · ค่าเสีย = null', () => {
  assert.equal(surveyNowKey('2026-09-28T02:52:10.000Z'), '2026-09-28 09:52');
  assert.equal(surveyNowKey('2026-09-27T17:30:00.000Z'), '2026-09-28 00:30', '00:30 ไทย = 17:30Z ของเมื่อวาน');
  assert.equal(surveyNowKey('ไม่ใช่เวลา'), null);
  assert.equal(surveyNowKey(null), null);
  // ใช้ต่อกับนับถอยหลังของแถบได้ตรง ๆ
  const bar = surveyFieldBarView({ visit: visit({ status: 'scheduled', actualStartTime: null }), nowKey: surveyNowKey('2026-09-28T02:52:00.000Z') });
  assert.equal(bar.head, 'นัด 10:00 · อีก 8 นาที');
});

// ── ยาม: ไฟล์ตัวตัดสินต้องบริสุทธิ์ ───────────────────────────────────────────────

test('🔴 ตัวตัดสินของจอหน้างานไม่อ่านนาฬิกา · ไม่แตะที่เก็บในเครื่อง · ไม่ลาก React/Next เข้ามา', () => {
  /* "ตอนนี้" ต้องมาจากผู้เรียก (`nowKey` เวลาไทย) — อ่านนาฬิกาที่นี่ = นาฬิกาเครื่องผู้ใช้ และเทสต์ขึ้นกับเวลาที่รัน
     · เจ้าของเลือกไม่เก็บร่างในเครื่อง (§3.4) */
  for (const file of ['./surveyFieldView.js', './surveyZoneRoute.js', '../ui/onScreenKeyboard.js']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /new Date\(|Date\.now\(/, `${file} ห้ามอ่านนาฬิกา`);
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/, `${file} ห้ามเก็บอะไรในเครื่อง`);
    assert.doesNotMatch(src, /from ['"](react|next\/)/, `${file} ต้องเป็นของล้วน`);
  }
});

/* ══ ชุด S7 — หน้ารายการ ↔ หน้าพื้นที่ (แผน §10.5 S7) ══════════════════════════════════════ */

test('แถวรายการ: ก่อนเริ่มงาน = วงเปล่าสามข้อ (A-1) · เริ่มแล้ว = "ขาด: …" (AO-2) · ครบ = ติ๊ก · ตัดออก = เหตุผล', () => {
  const before = surveyZoneListView({ zones: midWorkZones(), filesByZone: filesMidWork(), visit: visit({ status: 'scheduled' }) });
  assert.deepEqual(before.rows.map((r) => r.detail), ['marks', 'marks', 'marks'], 'ยังไม่เริ่ม = บอกว่าต้องมีอะไร ยังไม่มีใครขาด');
  const mid = surveyZoneListView({ zones: midWorkZones(), filesByZone: filesMidWork(), visit: visit() });
  assert.deepEqual(mid.rows.map((r) => r.detail), ['marks', 'marks', 'missing']);
  assert.equal(mid.rows[2].missingText, 'ขาด: ขนาด · ภาพกว้าง · จุด');
  const closed = surveyZoneListView({ zones: midWorkZones(), filesByZone: filesMidWork(), visit: visit({ status: 'done' }) });
  assert.equal(closed.rows[2].detail, 'missing', 'ส่งงานแล้วแต่ยังขาด (ถูกส่งกลับ) = ของที่ต้องไปเก็บ');
  const noVisit = surveyZoneListView({ zones: midWorkZones(), filesByZone: filesMidWork() });
  assert.equal(noVisit.rows[2].detail, 'marks', 'ไม่มีนัด = ไม่มีใครต้องไปเก็บ');
  const cut = surveyZoneListView({
    zones: [treatment({ status: 'cut', cutReason: 'ห้องปิดซ่อม' })], filesByZone: {}, visit: visit(),
  });
  assert.equal(cut.rows[0].detail, 'cut');
  assert.equal(cut.rows[0].cutReason, 'ห้องปิดซ่อม');
});

test('ช่อง ก × ย × ส: Enter ไปช่องถัดไป ก → ย → ส → ก ของส่วนถัดไป · ส ของส่วนสุดท้าย = จบแถว (ไม่วนกลับ)', () => {
  assert.deepEqual(SURVEY_DIM_FIELDS.map((d) => d.letter), ['ก', 'ย', 'ส']);
  assert.deepEqual(SURVEY_DIM_FIELDS.map((d) => d.field), ['widthM', 'lengthM', 'heightM']);
  const parts = treatment().parts;
  assert.deepEqual(surveyNextDimField(parts, 'p3', 'widthM'), { partId: 'p3', field: 'lengthM' });
  assert.deepEqual(surveyNextDimField(parts, 'p3', 'lengthM'), { partId: 'p3', field: 'heightM' });
  assert.deepEqual(surveyNextDimField(parts, 'p3', 'heightM'), { partId: 'p4', field: 'widthM' }, 'ส่วน A สูง → ส่วน B กว้าง');
  assert.equal(surveyNextDimField(parts, 'p4', 'heightM'), null, 'ช่องสุดท้าย — ปล่อยให้แป้นปิดเอง');
  assert.equal(surveyNextDimField(parts, 'nope', 'widthM'), null);
  assert.equal(surveyNextDimField(parts, 'p3', 'label'), null, 'ช่องชื่อส่วนไม่อยู่ในแถว Enter');
  assert.equal(surveyNextDimField(null, 'p3', 'widthM'), null);
});

test('ป้ายหัวหน้าพื้นที่: ป้ายเดียวตามความเร่ง — บันทึกไม่ผ่าน → ชน → ตัดออก → ยังไม่บันทึก → วัดแล้ว/ยังไม่ครบ', () => {
  const done = { zone: treatment(), files: filesAll().z3 };
  assert.deepEqual(surveyZoneStateBadge(done), { key: 'done', tone: 'success', text: 'วัดแล้ว', added: false });
  assert.equal(surveyZoneStateBadge({ zone: treatmentEmpty(), files: [] }).text, 'ยังไม่ครบ');
  assert.equal(surveyZoneStateBadge({ ...done, dirty: true }).text, 'ยังไม่บันทึก',
    'ม็อก A-2: คนที่กำลังกรอกต้องรู้ก่อนว่า "ออกตอนนี้หาย" — ของขาดรายข้ออยู่บนหัวข้อแล้ว');
  assert.equal(surveyZoneStateBadge({ zone: treatmentEmpty(), files: [], dirty: true }).text, 'ยังไม่บันทึก');
  assert.equal(surveyZoneStateBadge({ ...done, dirty: true, conflict: true }).text, 'ถูกแก้จากที่อื่น');
  assert.equal(surveyZoneStateBadge({ ...done, dirty: true, conflict: true, error: 'x' }).tone, 'danger');
  assert.equal(surveyZoneStateBadge({ zone: treatment({ status: 'cut' }), files: [], conflict: true }).text, 'ตัดออก',
    'พื้นที่ที่ตัดออกไม่มีร่างให้ชน');
  assert.equal(surveyZoneStateBadge({ zone: treatment({ status: 'added' }), files: filesAll().z3 }).added, true,
    'ป้าย "เพิ่มหน้างาน" เป็นอีกแกน ขึ้นคู่กับสถานะ');
});

test('ทางออกของพื้นที่ (เมนู ⋮ · แถวท้ายเนื้อ): ขอมา = ตัดออก · เพิ่มเอง = ลบทิ้ง · ตัดแล้ว = เอากลับ · เขียนไม่ได้ = ไม่มีเลย', () => {
  assert.deepEqual(surveyZoneActions({ zone: treatment(), canWrite: true }), { cut: true, remove: false, restore: false });
  assert.deepEqual(surveyZoneActions({ zone: treatment({ status: 'added' }), canWrite: true }),
    { cut: false, remove: true, restore: false }, 'ตัดพื้นที่ที่เพิ่มเอง = ป้าย "เพิ่มหน้างาน" หาย (server ปฏิเสธ)');
  assert.deepEqual(surveyZoneActions({ zone: treatment({ status: 'cut' }), canWrite: true }),
    { cut: false, remove: false, restore: true });
  assert.deepEqual(surveyZoneActions({ zone: treatment(), canWrite: false }), { cut: false, remove: false, restore: false },
    'ไม่มีสิทธิ์ = ไม่โชว์ (กติกา ui-visibility)');
  assert.deepEqual(surveyZoneActions({ zone: {}, canWrite: true }), { cut: false, remove: false, restore: false });
});

test('ถามก่อนออกจากหน้า: รูปที่ยังส่งมาก่อน → ค่าค้างในพื้นที่ (คำเดียวกับกล่องย้ายพื้นที่) → การเคาะ → ข้อความถึงหัวหน้า', () => {
  assert.equal(surveyLeaveMessage(), null, 'ไม่มีอะไรค้าง = ไม่ถาม');
  /* ข้อที่หนักสุดขึ้นต้นประโยค — ข้ออื่นต่อท้ายว่า "จะหายด้วย" (เทสต์ review 26/09 ท้ายไฟล์) */
  assert.ok(surveyLeaveMessage({ uploads: 1, zoneDirty: true, zone: treatment(), summary: 'ขนาด 2 ส่วน' })
    .startsWith('รูปยังส่งไม่เสร็จ — ออกตอนนี้รูปที่ค้างจะไม่ขึ้นระบบ · '));
  assert.ok(
    surveyLeaveMessage({ zoneDirty: true, zone: treatment(), summary: 'ขนาด 2 ส่วน · จุด 2 จุด', decisions: 2 })
      .startsWith(`${surveyDiscardConfirm({ zone: treatment(), summary: 'ขนาด 2 ส่วน · จุด 2 จุด' }).message} · `),
  );
  assert.match(surveyLeaveMessage({ decisions: 1, fixedNote: 'x' }), /การเคาะจุด\/แพ็คเกจยังไม่บันทึก/);
  assert.match(surveyLeaveMessage({ fixedNote: 'ถ่ายเพิ่มแล้ว' }), /ข้อความถึงหัวหน้ายังไม่ได้ส่ง/);
  assert.equal(surveyLeaveMessage({ fixedNote: '   ' }), null, 'ช่องว่างล้วนไม่ใช่ข้อความ');
});

test('🐞 กล่องถามตอนออกทางลิงก์ = กล่องเดียวกับการย้ายพื้นที่ (หัวเป็นคำถาม · ปุ่มทิ้งโทนอันตราย) — UAT 25/09 ได้ "ยืนยัน" น้ำเงิน', () => {
  assert.equal(surveyLeaveConfirm(), null);
  const zone = surveyLeaveConfirm({ zoneDirty: true, zone: treatment(), summary: 'ขนาด 1 ส่วน' });
  const move = surveyDiscardConfirm({ zone: treatment(), summary: 'ขนาด 1 ส่วน' });
  assert.deepEqual(zone, {
    title: move.title, description: move.message, cancelLabel: move.cancelLabel, confirmLabel: move.confirmLabel, tone: 'danger',
  });
  for (const input of [{ uploads: 2 }, { decisions: 1 }, { fixedNote: 'ถ่ายแล้ว' }]) {
    const box = surveyLeaveConfirm(input);
    assert.match(box.title, /\?$/, 'หัวกล่องเป็นคำถาม');
    assert.equal(box.tone, 'danger');
    assert.equal(box.confirmLabel, 'ทิ้งแล้วไปต่อ', 'ปุ่มบอกว่าทิ้ง ไม่ใช่ "ยืนยัน"');
    assert.equal(box.description, surveyLeaveMessage(input), 'ประโยคเดียวกับ surveyLeaveMessage');
    assert.notEqual(box.cancelLabel, 'ยกเลิก');
  }
});

// ── เปลือกของใบ (ชุด S9) — หัวใบเดิมถูกถอด ของที่มันพูดต้องมีที่อยู่ใหม่ ──────────────────────────────────

test('ป้ายนัดข้างรหัสคำร้อง: สถานะนัดคำเดียวกับหน้าคำร้อง · ส่งผลแล้วแต่นัดยังเปิด = "นัดยังไม่ปิด" (ถาม sent ก่อนเสมอ)', () => {
  /* 🔄 ยามเดิมอ่านซอร์สหน้า ("ป้ายต้องถาม view.flags.sent ก่อนป้ายอำพัน") — กติกาย้ายมาอยู่ในตัวตัดสินแล้ว
     ⇒ ตรึงด้วยข้อมูลแทน · หน้าถูกตรึงแค่ว่าเรียกตัวนี้พร้อม `sent` (surveyFieldScreen.test.mjs) */
  assert.deepEqual(surveyVisitBadge(visit({ status: 'scheduled' })), { label: 'นัดไว้', tone: 'info' },
    '🐞 เดิมนัดที่เพิ่งตั้งบนใบที่ยังไม่มีใครแตะขึ้นอำพัน "นัดยังไม่ปิด" ทันทีที่เปิดจอ');
  assert.deepEqual(surveyVisitBadge(visit({ status: 'scheduled' }), { sent: true }), { label: 'นัดยังไม่ปิด', tone: 'warning' });
  assert.deepEqual(surveyVisitBadge(visit({ status: 'done' })), { label: 'เข้าแล้ว', tone: 'success' });
  assert.equal(surveyVisitBadge(visit({ status: 'rescheduled' }), { sent: true }).label, 'เลื่อนแล้ว',
    'นัดที่ถูกเลื่อนไม่ใช่นัดที่ค้าง');
});

test('บรรทัดท้ายแถบแท็บ (AW-2): รวม 114 ตร.ม. · 336 ลบ.ม. · ภาพกว้าง 5 · จุด 7 — ตัวรวมเดียวกับกล่องส่งงาน', () => {
  assert.equal(surveySheetTotalsText({ zones: allZones(), filesByZone: filesAll() }),
    'รวม 114 ตร.ม. · 336 ลบ.ม. · ภาพกว้าง 5 · จุด 7');
  const submit = surveySubmitView({ outcome: 'entered', visit: visit(), zones: allZones(), filesByZone: filesAll() });
  assert.equal(surveySheetTotalsText({ zones: allZones(), filesByZone: filesAll() }),
    `รวม ${submit.totalsText.figures} · ${submit.totalsText.counts}`, 'สองที่บนจอเดียวต้องบอกเลขเดียวกัน');
  const cut = [...allZones(), { id: 'z4', zoneName: 'ห้องน้ำ', status: 'cut', parts: [part('p9', 2, 2, 2)], spots: [] }];
  assert.equal(surveySheetTotalsText({ zones: cut, filesByZone: { ...filesAll(), z4: [wide('IMG_9.jpg')] } }),
    'รวม 114 ตร.ม. · 336 ลบ.ม. · ภาพกว้าง 5 · จุด 7', 'พื้นที่ที่ตัดออกไม่นับ (รูปของมันด้วย)');
  assert.equal(surveySheetTotalsText({ zones: [], filesByZone: {} }), null, 'ไม่มีพื้นที่ = ไม่มีบรรทัด (ไม่ใช่ "รวม 0")');
});

const CREW_VIEWER = { canWrite: true, canDecide: false };
const sheetView = (request, extra = {}) => surveyControlView({
  request: { id: 'DR-1', docNo: 'RQ-AS-26090188', status: 'acknowledged', ...request },
  zones: allZones(), filesByZone: filesAll(), visit: visit({ status: 'done', actualEndTime: '11:46:00' }),
  viewer: CREW_VIEWER, today: '2026-09-28', ...extra,
});

test('กล่องแจ้งของช่าง (ไม่มีการ์ดจัดการผล): ใบที่ส่งผลแล้ว = สถานะ + "แก้ไม่ได้ — แจ้งหัวหน้า…" ในกล่องเดียว', () => {
  const view = sheetView({ answeredAt: '2026-09-28T06:05:00.000Z', answeredByName: 'Arnon Aunsapwilai' });
  const notices = surveySheetNotices(view);
  assert.equal(notices[0].key, 'status');
  assert.equal(notices[0].tone, 'success');
  assert.equal(notices[0].title, 'ส่งผลให้ฝ่ายขายแล้ว');
  assert.match(notices[0].text, /^ส่งโดย Arnon Aunsapwilai · /);
  assert.match(notices[0].meta, /แจ้งหัวหน้าบริการให้กด "ดึงผลกลับมาแก้"/,
    'ทางออกที่ช่างเดินได้จริง (เขาเปิดใบคำร้องไม่ได้)');
  assert.equal(notices.filter((n) => n.key === 'crew-sent').length, 0, 'เรื่องเดียวกันไม่ขึ้นสองกล่อง');
});

test('กล่องแจ้งของช่าง: ยกเลิก = สถานะ + เหตุผล · ดึงกลับ = เหตุผลของหัวหน้า · ใบที่ยังทำงานอยู่ไม่มีกล่องสถานะ', () => {
  const cancelled = surveySheetNotices(sheetView({ cancelledAt: '2026-09-28T05:00:00.000Z', cancelReason: 'ลูกค้าเลื่อนโครงการ' }));
  assert.deepEqual(cancelled.map((n) => [n.key, n.title]), [['status', 'คำร้องถูกยกเลิก'], ['cancelled', 'เหตุผล']]);
  assert.equal(cancelled[1].text, 'ลูกค้าเลื่อนโครงการ');

  const working = surveySheetNotices(sheetView({}, { visit: visit() }));
  assert.deepEqual(working, [], 'กำลังวัด = แถบของช่างกับรายการพูดครบแล้ว ไม่มีกล่องซ้อน');

  const readOnly = surveySheetNotices(sheetView({}, {
    viewer: { canWrite: false, canDecide: false, writeBlockedReason: 'นัดนี้ไม่ใช่งานของคุณ — แก้ได้เฉพาะงานที่ถูกมอบหมายให้คุณ' },
  }));
  assert.deepEqual(readOnly.map((n) => [n.key, n.text]),
    [['read-only', 'นัดนี้ไม่ใช่งานของคุณ — แก้ได้เฉพาะงานที่ถูกมอบหมายให้คุณ']], 'เหตุรายคนของ server มาก่อนประโยคกลาง');

  const lost = surveySheetNotices(sheetView({}, { visit: visit(), unknown: { site: true } }));
  assert.equal(lost[0].key, 'unknown', 'อ่านไม่สำเร็จต้องพูดออกมา — ไม่ใช่เงียบเหมือนไม่มีข้อมูล');
  assert.deepEqual(surveySheetNotices(null), []);
});

const HEADER_REQ = { docNo: 'RQ-AS-26090188', title: 'ขอทีมงานประเมินพื้นที่และร่วมประชุมนอกสถานที่', customerText: 'AR-1036 · บริษัท เอสล่า จำกัด' };

test('เกี่ยวกับคำร้อง (ช่าง): รายละเอียดกางในที่ · ไม่มีแถวสรุปส่งผล (มติ 26/09) · เปิดหน้าคำร้องไม่ได้ = ไม่มีแถวลิงก์', () => {
  const crew = surveyAboutView({ header: HEADER_REQ, requestId: 'DR-1', canDecide: false, canWrite: true, canOpenRequest: false });
  assert.equal(crew.detail.label, 'รายละเอียดคำร้อง');
  assert.equal(crew.detail.sub, 'AR-1036 · บริษัท เอสล่า จำกัด');
  assert.deepEqual(crew.detail.facts.map((f) => [f.label, f.value]), [
    ['ลูกค้า', 'AR-1036 · บริษัท เอสล่า จำกัด'],
    ['เรื่อง', 'ขอทีมงานประเมินพื้นที่และร่วมประชุมนอกสถานที่'],
    ['เลขคำร้อง', 'RQ-AS-26090188'],
  ]);
  assert.equal(crew.link, null, 'role ts ได้ 403 ที่ /requests/* — ลิงก์ที่กดแล้วเจอ 403 อ่านเหมือนระบบพัง');
  assert.equal(crew.result, null, 'มติเจ้าของ 26/09 "ช่างเห็นแค่งานตัวเอง" — ช่างไม่มีจอสรุปส่งผล (ไม่เห็นตัวเลขแพ็คเกจที่หัวหน้าเคาะ)');
  assert.deepEqual(crew.line, { title: HEADER_REQ.title, customer: HEADER_REQ.customerText });
});

test('เกี่ยวกับคำร้อง (คนดูอย่างเดียว เช่นฝ่ายขาย): ยังมีแถว "สรุปส่งผล · ดูอย่างเดียว"', () => {
  const reader = surveyAboutView({ header: HEADER_REQ, requestId: 'DR-1', canDecide: false, canWrite: false, canOpenRequest: true });
  assert.deepEqual(reader.result, { label: 'สรุปส่งผล', sub: 'ดูอย่างเดียว' });
  const unset = surveyAboutView({ header: HEADER_REQ, requestId: 'DR-1' });
  assert.deepEqual(unset.result, { label: 'สรุปส่งผล', sub: 'ดูอย่างเดียว' }, 'ไม่ส่ง canWrite = ถือเป็นคนดูอย่างเดียว');
});

test('เกี่ยวกับคำร้อง (หัวหน้า): แถวลิงก์เดียวไปหน้าคำร้อง (ไม่มีลิงก์ลงหัวข้อย่อย) · มีแท็บแล้วไม่มีแถวสรุปส่งผล', () => {
  const head = surveyAboutView({ header: HEADER_REQ, requestId: 'DR-1', canDecide: true, canOpenRequest: true });
  assert.deepEqual(head.link, {
    href: '/requests/DR-1', label: 'หน้าคำร้อง RQ-AS-26090188', sub: 'รายละเอียด · ความเคลื่อนไหว · ไฟล์แนบ',
  });
  assert.equal(head.result, null);
  const lost = surveyAboutView({ header: { ...HEADER_REQ, customerText: 'ไม่ทราบ', title: '' } });
  assert.deepEqual(lost.line, { title: null, customer: null }, 'ไม่รู้ = ไม่ต่อท้ายรหัสบนแถวย้อน');
  assert.equal(lost.detail.facts[1].value, '—');
  assert.equal(lost.detail.sub, 'ไม่ทราบ', 'ในรายละเอียดยังบอกว่าอ่านไม่สำเร็จ');
});

test('กำหนดส่งผลบนการ์ด (AW-2): "ส่งผลให้ฝ่ายขายภายใน พ. 30 ก.ย. · อีก 2 วัน" · เลยกำหนด = อำพัน · ล็อกแล้ว/ไม่มีวัน = ไม่มีบรรทัด', () => {
  assert.deepEqual(surveyDueLine({ due: { date: '2026-09-30' }, today: '2026-09-28' }),
    { text: 'ส่งผลให้ฝ่ายขายภายใน พ. 30 ก.ย. · อีก 2 วัน', late: false });
  assert.deepEqual(surveyDueLine({ due: { date: '2026-09-27' }, today: '2026-09-28' }),
    { text: 'ส่งผลให้ฝ่ายขายภายใน อา. 27 ก.ย. · เลยกำหนด 1 วัน', late: true });
  assert.equal(surveyDueLine({ due: { date: '2026-09-28' }, today: '2026-09-28' }).text, 'ส่งผลให้ฝ่ายขายภายใน จ. 28 ก.ย. · วันนี้');
  assert.equal(surveyDueLine({ due: { date: '2026-09-30' } }).text, 'ส่งผลให้ฝ่ายขายภายใน พ. 30 ก.ย.', 'ไม่รู้วันนี้ = บอกแค่วัน');
  assert.equal(surveyDueLine({ due: { date: '2026-09-30' }, locked: true, today: '2026-09-28' }), null);
  assert.equal(surveyDueLine({ due: { date: null }, today: '2026-09-28' }), null);
  assert.equal(surveyDueLine(), null);
});

test('🐞 ข้อส่งกลับผูกกับห้องได้แม้ชื่อจริงพกชั้น ("ห้อง Treatment ชั้น 5") — UAT: ปุ่ม "ไปถ่าย" หายทั้งที่ข้อระบุห้อง', () => {
  const zones = [
    { id: 'rc', zoneName: 'Reception ชั้น 1', floor: '01', parts: [], spots: [] },
    { id: 'tr', zoneName: 'ห้อง Treatment ชั้น 5', floor: '05', parts: [], spots: [{ id: 's1', label: 'มุมเตียงที่ 1' }] },
  ];
  assert.equal(surveyZoneBaseName(zones[1]), 'ห้อง Treatment');
  assert.equal(surveyZoneBaseName({ zoneName: 'ห้อง Treatment' }), null, 'ไม่มีชั้นท้ายชื่อ = ไม่มีชื่อฐานแยก');
  const sendBack = {
    pending: true,
    sentBack: { id: 'sb1', at: '2026-09-29T02:10:00Z', byName: 'Arnon Aunsapwilai', items: ['ห้อง Treatment ภาพกว้างเห็นแค่ส่วน A — ขอภาพส่วน B อีกรูป'] },
  };
  const view = surveySendBackItemsView({ sendBack, zones, filesByZone: {}, ticks: [] });
  assert.equal(view.items[0].zoneId, 'tr');
  // ชื่อฐานซ้ำกันคนละชั้น = ไม่ผูกเดา
  const twin = [
    { id: 'r1', zoneName: 'Reception ชั้น 1', floor: '01', parts: [], spots: [] },
    { id: 'r2', zoneName: 'Reception ชั้น 2', floor: '02', parts: [], spots: [] },
  ];
  const ambiguous = surveySendBackItemsView({
    sendBack: { ...sendBack, sentBack: { ...sendBack.sentBack, items: ['Reception ขอภาพกว้างอีกรูป'] } },
    zones: twin, filesByZone: {}, ticks: [],
  });
  assert.equal(ambiguous.items[0].zoneId, null);
});

test('🐞 ชื่อในประโยค (แถบ/ถัดไป) ตัวสะกดเดียวกับหัว — ชื่อไม่มีชั้นท้าย · ชื่อฐานซ้ำในใบ = ใช้หัวเต็ม', () => {
  const view = zoneListForNames({ zones: [
    { id: 'a', zoneName: 'ห้อง MD ชั้น 5', floor: '05', parts: [], spots: [] },
    { id: 'b', zoneName: 'Reception ชั้น 1', floor: '01', parts: [], spots: [] },
    { id: 'c', zoneName: 'Reception ชั้น 2', floor: '02', parts: [], spots: [] },
  ] });
  assert.deepEqual(view.rows.map((r) => r.name), ['ห้อง MD', T('Reception · ชั้น 01'), T('Reception · ชั้น 02')]);
});

test('🐞 กล่องส่งงาน: ชื่อในเหตุค่าค้างตัวสะกดเดียวกับแถบ — ชื่อจริงพกชั้น ("ห้อง MD ชั้น 5") ขึ้นเป็น "ห้อง MD" (UAT 25/09)', () => {
  const zones = [
    { id: 'm', zoneName: 'ห้อง MD ชั้น 5', floor: '05', parts: [], spots: [] },
    { id: 'r', zoneName: 'Reception ชั้น 1', floor: '01', parts: [], spots: [] },
  ];
  const view = surveySubmitView({ outcome: 'entered', visit: visit(), zones, filesByZone: {}, dirtyZoneIds: ['m'] });
  assert.equal(view.blocker, 'มีค่าที่ยังไม่บันทึก: ห้อง MD — กด “บันทึกพื้นที่นี้” ก่อนส่งงาน');
  assert.equal(view.rows[0].title, T('ห้อง MD · ชั้น 05'), 'หัวแถวยังเป็นชื่อเต็มพร้อมชั้น');
});

/* ══ review 26/09 — ตัวตัดสินของจอหน้างาน ══════════════════════════════════════════════════ */

test('🐞 นัดข้ามเที่ยงคืน: ช่วงเวลาเขียนวันที่ทั้งสองปลาย — เดิม "14:00–09:00" ช่วงถอยหลัง (review 26/09)', () => {
  const night = visit({ scheduledDate: '2026-09-24', actualDate: '2026-09-24', actualStartTime: '14:00:00' });
  const submit = (nowKey) => surveySubmitView({ outcome: 'entered', visit: night, zones: allZones(), filesByZone: filesAll(), nowKey });
  // กล่องส่งงาน — จบ = ตอนนี้ (วันถัดไป)
  assert.equal(submit('2026-09-25 09:00').effects[0].text, 'ปิดนัด SV-26090014 เป็น “เข้าแล้ว” (พฤ. 24 ก.ย. 14:00 – ศ. 25 ก.ย. 09:00)');
  assert.equal(submit('2026-09-24 16:30').effects[0].text, 'ปิดนัด SV-26090014 เป็น “เข้าแล้ว” (14:00–16:30)', 'วันเดียวกัน = ช่วงสั้นเหมือนเดิม');
  // แถบพร้อมส่ง — เริ่มเมื่อวาน = บอกวันเริ่ม
  const bar = (nowKey) => surveyFieldBarView({ visit: night, progress: { done: 3, total: 3 }, nowKey }).sub;
  assert.equal(bar('2026-09-25 09:00'), 'ส่งได้ · เริ่มงาน พฤ. 24 ก.ย. 14:00');
  assert.equal(bar('2026-09-24 15:00'), 'ส่งได้ · เริ่มงาน 14:00');
  // หัวงาน — ปิดข้ามวัน (actualEndDate · mig 0386) = วันที่ทั้งสองปลาย รูปเดียวกับ onSiteText ของ surveyJob
  const closed = header({ visit: visit({
    status: 'done', scheduledDate: '2026-09-24', actualDate: '2026-09-24',
    actualStartTime: '14:00:00', actualEndTime: '09:00:00', actualEndDate: '2026-09-25',
  }) });
  assert.equal(closed.facts[0].sub, 'เข้าแล้ว พฤ. 24 ก.ย. 14:00 – ศ. 25 ก.ย. 09:00');
  // เริ่มคนละวันกับวันนัดที่ข้อ "นัด" บอกไว้ = บอกวันเริ่ม · วันเดียวกัน = เวลาอย่างเดียว (เทสต์หัวงานเดิม)
  const moved = header({ visit: visit({ scheduledDate: '2026-09-24', actualDate: '2026-09-25', actualStartTime: '08:30:00' }) });
  assert.equal(moved.facts[0].sub, 'เริ่มงาน ศ. 25 ก.ย. 08:30');
});

test('🐞 แถบถูกส่งกลับ: ค่าค้าง/ด่านอื่นของ route = ไม่พูด "แจ้งได้" ข้างปุ่มที่ติดด่าน (review 26/09)', () => {
  const sendBack = { pending: true, sentBack: { items: ['ข้อหนึ่ง'] } };
  const closed = visit({ status: 'done', actualEndTime: '11:46:00' });
  const dirtyGate = 'มีค่าที่ยังไม่บันทึก — กด “บันทึกพื้นที่นี้” ก่อนแจ้งหัวหน้า'; // ประโยคที่ page.js พับเข้า doneBlocker
  const dirty = surveyFieldBarView({ visit: closed, sendBack, dirtyZoneIds: ['z3'], doneBlocker: dirtyGate });
  assert.equal(dirty.sub, 'มีค่าที่ยังไม่บันทึก — กดบันทึกพื้นที่นี้ก่อน', 'คำเดียวกับแถบระหว่างวัด');
  assert.equal(dirty.action.blocker, dirtyGate);
  assert.equal(dirty.action.emphasis, 'quiet');
  // ด่านอื่นของ route (ไม่ใช่ของขาด/ค่าค้าง) = เหตุของด่านขึ้นแทน "แจ้งได้"
  const other = surveyFieldBarView({ visit: closed, sendBack, doneBlocker: 'แจ้งว่าแก้แล้วได้เฉพาะช่างที่ถูกมอบหมายนัดของใบนี้' });
  assert.equal(other.sub, 'แจ้งว่าแก้แล้วได้เฉพาะช่างที่ถูกมอบหมายนัดของใบนี้');
  // ผู้เรียกไม่ได้พับค่าค้างเข้าด่าน — ตัวตัดสินกันเอง (แบบเดียวกับแถบระหว่างวัด)
  const bare = surveyFieldBarView({ visit: closed, sendBack, dirtyZoneIds: ['z3'] });
  assert.equal(bare.action.blocker, 'มีค่าที่ยังไม่บันทึก — กดบันทึกพื้นที่นี้ก่อน');
  assert.equal(bare.action.emphasis, 'quiet');
  for (const bar of [dirty, other, bare]) assert.doesNotMatch(bar.sub, /แจ้งได้/);
});

test('🐞 ข้อส่งกลับที่พิมพ์ชั้นตามที่ตาเห็น ("ชั้น 05" · "· ชั้น 05") ผูกกับพื้นที่ชั้นนั้น · กติกาไม่ผูกเดายังคุม (review 26/09)', () => {
  const ids = (zones, text) => [...surveySendBackZoneIds(sentBack([text]), zones)];
  const floors = [
    { id: 'a', zoneName: 'Reception ชั้น 5', floor: '05', parts: [], spots: [] },
    { id: 'b', zoneName: 'Reception ชั้น 6', floor: '06', parts: [], spots: [] },
  ];
  assert.deepEqual(ids(floors, 'Reception ชั้น 5 ขอภาพกว้างอีกรูป'), ['a']);
  assert.deepEqual(ids(floors, 'Reception ชั้น 05 ขอภาพกว้างอีกรูป'), ['a']);
  assert.deepEqual(ids(floors, 'Reception · ชั้น 06 ขอภาพกว้างอีกรูป'), ['b']);
  assert.deepEqual(ids(floors, `${surveyZoneTitle(floors[1])} ขอภาพกว้างอีกรูป`), ['b'], 'ก๊อปชื่อบนจอ (มี NBSP) มาวางก็ผูก');
  assert.deepEqual(ids(floors, 'Reception ขอภาพกว้างอีกรูป'), [], 'ไม่บอกชั้น = ไม่ผูกเดา');
  // ชื่อเหมือนกันทุกตัว ต่างแค่ชั้นของแถว (แถวจากทะเบียน/นำเข้า) — เดิมไม่มีคำพิมพ์แบบไหนผูกได้เลย
  const lobby = [
    { id: 'l1', zoneName: 'Lift Lobby', floor: '01', parts: [], spots: [] },
    { id: 'l2', zoneName: 'Lift Lobby', floor: '02', parts: [], spots: [] },
    { id: 'l10', zoneName: 'Lift Lobby', floor: '10', parts: [], spots: [] },
  ];
  assert.deepEqual(ids(lobby, 'Lift Lobby ชั้น 02 ขอภาพกว้างอีกรูป'), ['l2']);
  assert.deepEqual(ids(lobby, 'Lift Lobby ชั้น 10 ขอภาพกว้างอีกรูป'), ['l10'], 'ชั้น 1 ไม่ชนะชั้น 10');
  assert.deepEqual(ids(lobby.slice(0, 2), 'Lift Lobby ชั้น 12 ขอภาพกว้างอีกรูป'), [], 'ชั้นที่ไม่มีในใบ ≠ ชั้น 1');
  assert.deepEqual(ids(lobby, 'Lift Lobby ขอภาพกว้างอีกรูป'), []);
});

test('🐞 ปุ่มโทรหยิบเบอร์แรกเบอร์เดียว — เดิมรวมเลขทั้งช่อง "02-123-4567 ต่อ 102" → tel:021234567102 (review 26/09)', () => {
  const call = (contactPhone, contactName = 'คุณแหวน') => header({ site: { ...SITE, contactPhone, contactName } }).call;
  assert.deepEqual(call('02-123-4567 ต่อ 102'), { href: 'tel:021234567,102', label: 'โทร คุณแหวน' });
  assert.deepEqual(call('081-111-2222, 02-333-4444'), { href: 'tel:0811112222', label: 'โทร คุณแหวน 081-111-2222' },
    'หลายเบอร์ = ป้ายบอกว่ากดแล้วโทรเบอร์ไหน');
  assert.deepEqual(call('081 111 2222 02 333 4444', ''), { href: 'tel:0811112222', label: 'โทร 081 111 2222' });
  assert.deepEqual(call('+66 81 111 2222'), { href: 'tel:+66811112222', label: 'โทร คุณแหวน' });
  assert.deepEqual(call('(02) 123-4567'), { href: 'tel:021234567', label: 'โทร คุณแหวน' });
  // ไม่มีเบอร์ที่โทรได้ = ไม่มีปุ่ม แต่ข้อความในช่องยังอยู่บนหัว
  const none = header({ site: { ...SITE, contactPhone: 'โทรหา รปภ. หน้าตึก' } });
  assert.equal(none.call, null);
  assert.equal(none.facts.find((f) => f.key === 'phone')?.value, 'คุณแหวน · โทรหา รปภ. หน้าตึก');
  assert.equal(header().facts.some((f) => f.key === 'phone'), false, 'เบอร์ปกติ = ไม่มีแถวเพิ่ม');
});

test('🐞 กล่องถามก่อนออกบอกของค้างครบทุกชนิด — เดิมบอกข้อแรกข้อเดียว ช่างยอมทิ้งรูปแล้วค่าที่พิมพ์หายตาม (review 26/09)', () => {
  const both = surveyLeaveConfirm({ uploads: 1, zoneDirty: true, zone: treatment(), summary: 'ขนาด 2 ส่วน' });
  assert.equal(both.title, 'ออกตอนรูปยังส่งไม่เสร็จ?', 'หัว/ปุ่มมาจากของที่เสียแล้วเอาคืนยากสุด');
  assert.equal(both.cancelLabel, 'รอให้ส่งเสร็จ');
  assert.equal(both.description,
    `รูปยังส่งไม่เสร็จ — ออกตอนนี้รูปที่ค้างจะไม่ขึ้นระบบ · ค่าที่พิมพ์ค้างใน“${surveyZoneTitle(treatment())}” (ขนาด 2 ส่วน) จะหายด้วย`);
  assert.doesNotMatch(both.description, /ไม่หาย/, 'รูปกำลังส่งอยู่ — ห้ามบอกว่ารูปไม่หาย');

  const input = { zoneDirty: true, zone: treatment(), summary: 'ขนาด 1 ส่วน', decisions: 2, fixedNote: 'ถ่ายเพิ่มแล้ว' };
  const all = surveyLeaveConfirm(input);
  assert.equal(all.title, 'ทิ้งค่าที่ยังไม่บันทึก?');
  assert.equal(all.description, `${surveyDiscardConfirm({ zone: treatment(), summary: 'ขนาด 1 ส่วน' }).message}`
    + ' · การเคาะจุด/แพ็คเกจที่ยังไม่บันทึกจะหายด้วย · ข้อความถึงหัวหน้าที่ยังไม่ได้ส่งจะหายด้วย');
  assert.equal(surveyLeaveMessage(input), all.description, 'ประโยคเดียวกับ surveyLeaveMessage');

  const decided = surveyLeaveConfirm({ decisions: 1, fixedNote: 'x' });
  assert.equal(decided.title, 'ทิ้งการเคาะที่ยังไม่บันทึก?');
  assert.match(decided.description, /ข้อความถึงหัวหน้าที่ยังไม่ได้ส่งจะหายด้วย$/);
  assert.equal(surveyLeaveConfirm({ uploads: 1, zoneDirty: true, zone: null }).description,
    'รูปยังส่งไม่เสร็จ — ออกตอนนี้รูปที่ค้างจะไม่ขึ้นระบบ · ค่าที่พิมพ์ค้างในพื้นที่ที่เปิดอยู่จะหายด้วย', 'ไม่รู้พื้นที่ = ไม่เขียนชื่อว่าง');
});

test('🐞 review 26/09 รอบสอง: ผูกข้อส่งกลับ — ชื่อยาวสุดชนะก่อน ชั้นใช้แค่ตัดสินชื่อที่เท่ากัน (ชั้นไม่เพิ่มความยาวให้ชื่อสั้นแซง)', () => {
  const Z = (id, zoneName, floor) => ({ id, zoneName, floor, parts: [], spots: [] });
  const linked = (zones, ask) => surveySendBackItemsView({
    sendBack: { pending: true, sentBack: { id: 's', at: '2026-09-26T00:00:00Z', items: [ask] } }, zones, filesByZone: {}, ticks: [],
  }).items[0].zoneId;
  assert.equal(linked([Z('a', 'MD', '02'), Z('b', 'ห้อง MD', '03')], 'ห้อง MD ชั้น 2 ความยาวผิด'), 'b', 'เดิมรอบแรก: "MD ชั้น 2" แซง "ห้อง MD"');
  assert.equal(linked([Z('a', 'Reception', '01'), Z('b', 'VIP Reception', '02')], 'VIP Reception ชั้น 1 ขอภาพกว้าง'), 'b');
  assert.equal(linked([Z('a', 'Lobby', 'G'), Z('b', 'Lift Lobby', '01')], 'Lift Lobby ชั้น G ขอภาพ'), 'b');
  assert.equal(linked([Z('a', 'Lift Lobby', '01'), Z('b', 'Lift Lobby', '02')], 'Lift Lobby · ชั้น 02 ขอภาพ'), 'b', 'ชื่อเท่ากัน = ชั้นตัดสิน');
  assert.equal(linked([Z('a', 'Lift Lobby', '01'), Z('b', 'Lift Lobby', '02')], 'Lift Lobby ขอภาพ'), null, 'ไม่บอกชั้น = ไม่ผูกเดา');
  assert.equal(linked([Z('a', 'Hall', '1'), Z('b', 'Hall', '12')], 'Hall ชั้น 12 ขอภาพ'), 'b', 'ชั้น 1 ไม่ใช่ส่วนหน้าของชั้น 12');
});

test('🐞 review 26/09 รอบสอง: ปุ่มโทร — เบอร์ขึ้นต้น 0/+ (หรือสายด่วน 1xxx) · ขีดเป็นตัวคั่นกลุ่ม · ช่วงเบอร์ไม่ต่อเลขท้าย', () => {
  const dial = (contactPhone) => surveyJobHeaderView({ site: { contactPhone, contactName: 'คุณแหวน' } }).call?.href ?? null;
  assert.equal(dial('02-123-4567-8'), 'tel:021234567', 'เดิม tel:0212345678 (เบอร์กรุงเทพ 10 หลักไม่มีจริง)');
  assert.equal(dial('02-123-4567-9 ต่อ 5'), 'tel:021234567,5');
  assert.equal(dial('ห้อง 305 081-111-2222'), 'tel:0811112222', 'เดิม tel:3050811112222');
  assert.equal(dial('ชั้น 12 081-111-2222'), 'tel:0811112222');
  assert.equal(dial('1557'), 'tel:1557', 'สายด่วน 4 หลักยังโทรได้');
  assert.equal(dial('1800-123-456'), 'tel:1800123456');
  assert.equal(dial('(+66) 81 111 2222'), 'tel:+66811112222');
  assert.equal(dial('081 111 2222 02 333 4444'), 'tel:0811112222');
  assert.equal(dial('+66 (0) 2 123 4567'), 'tel:+6621234567', 'รอบสาม: ศูนย์ในวงเล็บหลังรหัสประเทศตัดทิ้ง');
  assert.equal(dial('+66 (0)81 234 5678'), 'tel:+66812345678');
});

test('🐞 review 26/09 รอบสาม: ชื่อเสมอกันและชั้นตัดสินไม่ได้ = ลองชื่อจุดในพื้นที่ที่เสมอกันเท่านั้น', () => {
  const Z = (id, zoneName, floor, spot) => ({ id, zoneName, floor, parts: [], spots: spot ? [{ id: `s${id}`, label: spot }] : [] });
  const linked = (zones, ask) => surveySendBackItemsView({
    sendBack: { pending: true, sentBack: { id: 's', at: '2026-09-26T00:00:00Z', items: [ask] } }, zones, filesByZone: {}, ticks: [],
  }).items[0].zoneId;
  const tied = [Z('1', 'Reception ชั้น 1', '01', 'เคาน์เตอร์ A'), Z('2', 'Reception ชั้น 2', '02', 'เคาน์เตอร์ B')];
  assert.equal(linked(tied, 'Reception เคาน์เตอร์ B ขอภาพจุดใหม่'), '2');
  const lobby = [Z('1', 'Lift Lobby', '01', ''), Z('2', 'Lift Lobby', '02', 'หน้าห้องน้ำหญิง'), Z('3', 'Pantry', '02', 'หน้าห้องน้ำชาย')];
  assert.equal(linked(lobby, 'Lift Lobby หน้าห้องน้ำหญิง ขอรูปใกล้'), '2');
  assert.equal(linked(lobby, 'Lift Lobby หน้าห้องน้ำชาย ขอรูปใกล้'), null, 'จุดของพื้นที่อื่น (Pantry) ชนะชื่อที่เสมอกันไม่ได้');
});
