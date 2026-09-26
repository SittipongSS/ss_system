// ── หัวหน้าแจ้งช่างให้กลับไปเก็บงานหน้างาน (แผน §5.4 บรรทัด 604) ──────────
//
// 🐞 **ทางตันที่มีมาตั้งแต่เฟส 3** — ด่านสามข้อบนของหกข้อเป็นของช่าง หัวหน้าแก้เองไม่ได้
//   ⇒ เขาเห็นแค่ปุ่มส่งผลที่กดไม่ได้ · คอมเมนต์ใน survey.js อ้างชื่อปุ่มนี้มาตั้งแต่วันแรก
//   ในฐานะเหตุผลที่จอสรุปต้องกางเช็คลิสต์หกข้อ — แต่ปุ่มไม่เคยถูกสร้าง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEND_BACK_ITEM_MAX, SEND_BACK_MAX_ITEMS,
  SURVEY_GATES, surveyCrewGaps, surveyFieldMissing, surveyGateChecklist,
  surveyResultMissing, surveySendBackBody, surveySendBackError, surveySendBackItems,
} from './survey.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const full = (over = {}) => ({
  id: 'SVZ1', zoneName: 'ล็อบบี้', status: 'ok',
  parts: [{ id: 'p1', widthM: 10, lengthM: 10, heightM: 3 }],
  spots: [{ id: 's1', label: 'เสา', selected: true }],
  packageQty: 1, packageNote: null, ...over,
});
const allFiles = [{ docType: 'survey_wide' }, { docType: 'survey_plan' }];
const request = (over = {}) => ({ id: 'REQ1', answeredAt: null, cancelledAt: null, ...over });

/* ══ ทะเบียนด่าน ═══════════════════════════════════════════════════════ */

test('🔑 ด่านหกข้อประกาศที่เดียว และรู้ว่าใครเป็นเจ้าของ', () => {
  assert.equal(SURVEY_GATES.length, 6);
  assert.deepEqual(SURVEY_GATES.map((g) => g.key),
    ['size', 'wide', 'spots', 'plan', 'picked', 'package']);
  assert.deepEqual(SURVEY_GATES.filter((g) => g.owner === 'crew').map((g) => g.key),
    ['size', 'wide', 'spots'], 'สามข้อที่ต้องยืนหน้างานถึงจะทำได้');
  assert.deepEqual(SURVEY_GATES.filter((g) => g.owner === 'head').map((g) => g.key),
    ['plan', 'picked', 'package']);
});

/* 🔴 ตัวแยกเดิมต้องให้คำตอบเท่าเดิมเป๊ะ — ยกทะเบียนออกมาแล้วข้อความเพี้ยน
   = ด่านส่งผลบอกคนละเรื่องกับที่เคยบอก */
test('🔴 ยกเป็นทะเบียนแล้วข้อความเดิมต้องไม่เปลี่ยน', () => {
  const empty = { id: 'X', zoneName: 'X', parts: [], spots: [], packageQty: null };
  assert.deepEqual(surveyFieldMissing(empty, []), [
    'ยังไม่ได้วัดขนาด — เพิ่มอย่างน้อยหนึ่งส่วน',
    'ยังไม่มีภาพกว้าง',
    'ยังไม่ได้ระบุจุดที่ติดตั้งได้',
  ]);
  assert.deepEqual(surveyResultMissing(empty, []).result, [
    'ยังไม่มีภาพผังที่มาร์กจุดแล้ว',
    'ยังไม่ได้เลือกจุดที่จะติดตั้ง',
    'ยังไม่ได้เคาะจำนวนแพ็คเกจ',
  ]);
  // แถวที่ถูกตัดออกไม่ต้องผ่านด่านไหนเลย
  assert.deepEqual(surveyFieldMissing({ ...empty, status: 'cut' }, []), []);
  assert.deepEqual(surveyResultMissing({ ...empty, status: 'cut' }, []), { field: [], result: [] });
});

/* ══ เช็คลิสต์ของทั้งใบ ═══════════════════════════════════════════════ */

test('🔑 เช็คลิสต์บอกชื่อพื้นที่ที่ขาด ไม่ใช่แค่ "ยังไม่ครบ"', () => {
  const rows = [full(), full({ id: 'SVZ2', zoneName: 'ห้องประชุมใหญ่' })];
  const list = surveyGateChecklist(rows, { SVZ1: allFiles, SVZ2: [{ docType: 'survey_plan' }] });
  const wide = list.find((g) => g.key === 'wide');
  assert.equal(wide.ok, false);
  assert.equal(wide.done, 1);
  assert.equal(wide.total, 2);
  assert.deepEqual(wide.zones, ['ห้องประชุมใหญ่']);
  assert.equal(list.find((g) => g.key === 'size').ok, true);
});

test('⚠️ แถวที่ถูกตัดออกไม่นับเป็นตัวหาร', () => {
  const rows = [full(), full({ id: 'SVZ2', zoneName: 'ตัดทิ้ง', status: 'cut' })];
  const list = surveyGateChecklist(rows, { SVZ1: allFiles });
  assert.equal(list[0].total, 1);
  assert.ok(list.every((g) => g.ok), 'ใบที่เหลือแถวเดียวและครบ ต้องผ่านทุกข้อ');
});

test('🔑 surveyCrewGaps คืนเฉพาะข้อของช่างที่ยังติด', () => {
  const rows = [full({ packageQty: null })];   // ขาดของหัวหน้าหนึ่งข้อ
  assert.deepEqual(surveyCrewGaps(rows, { SVZ1: allFiles }), []);
  const rows2 = [full({ spots: [] })];
  const gaps = surveyCrewGaps(rows2, { SVZ1: allFiles });
  assert.deepEqual(gaps.map((g) => g.key), ['spots']);
});

/* ══ ด่านของปุ่ม ═══════════════════════════════════════════════════════ */

const gaps = [{ key: 'wide', label: 'ภาพกว้างครบทุกพื้นที่', zones: ['ห้องประชุมใหญ่'] }];

test('🔑 ด่านสี่ข้อ เรียงตามลำดับที่ผู้ใช้แก้ได้จริง', () => {
  assert.equal(surveySendBackError(request(), {
    canSend: true, note: 'ถ่ายภาพกว้างเพิ่ม', gaps, crewIds: ['u1'],
  }), null);
  assert.match(surveySendBackError(request(), { canSend: false }), /ได้เฉพาะหัวหน้า/);
  assert.match(
    surveySendBackError(request({ answeredAt: 'x' }), { canSend: true, gaps, crewIds: ['u1'] }),
    /ส่งผลให้ฝ่ายขายไปแล้ว/,
  );
  assert.match(
    surveySendBackError(request(), { canSend: true, note: 'ถ่ายภาพกว้างเพิ่ม', gaps, crewIds: [] }),
    /ยังไม่มีช่างที่ถูกมอบหมาย/,
  );
  assert.match(
    surveySendBackError(request(), { canSend: true, note: 'สั้น', gaps, crewIds: ['u1'] }),
    /10 ตัวอักษร/,
  );
  // fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ
  assert.ok(surveySendBackError(request()));
});

/* 🔄 **ฝั่งช่างครบแล้วก็ส่งกลับได้** (แผน §10.5 S4 · ม็อก A-5/AW-2) — เดิมด่านตีกลับว่า "ไม่มีอะไรให้ช่าง
   กลับไปทำ" ทุกครั้งที่ขนาด/ภาพกว้าง/จุดครบ ⇒ หัวหน้าที่เปิดรูปแล้วเห็นว่าภาพกว้างถ่ายไม่ถึงส่วน B (ม็อก A-5)
   ไม่มีทางขอรูปเพิ่มในระบบ · ด่านสามข้อบอกได้แค่ "มีรูปไหม" ไม่ได้บอกว่า "รูปใช้ได้ไหม" ⇒ คนตัดสินคือหัวหน้า */
test('🔄 ฝั่งช่างครบแล้ว หัวหน้ายังส่งกลับขอเพิ่มได้ — ข้อความยังบังคับเหมือนเดิม', () => {
  const crewDone = { canSend: true, gaps: [], crewIds: ['u1'] };
  assert.equal(surveySendBackError(request(), { ...crewDone, note: 'ห้อง Treatment ขอภาพส่วน B' }), null);
  assert.match(surveySendBackError(request(), crewDone), /10 ตัวอักษร/, 'ไม่มีของขาดให้เล่า = ข้อความคือทั้งหมดที่ช่างได้');
  // ด่านอื่นไม่หลวมตาม — ยังไม่มีช่าง/ล็อกแล้ว ยังตีกลับ
  assert.match(surveySendBackError(request(), { ...crewDone, crewIds: [], note: 'ห้อง Treatment ขอภาพส่วน B' }),
    /ยังไม่มีช่างที่ถูกมอบหมาย/);
  assert.match(surveySendBackError(request({ answeredAt: 'x' }), { ...crewDone, note: 'ห้อง Treatment ขอภาพส่วน B' }),
    /ส่งผลให้ฝ่ายขายไปแล้ว/);
});

test('🔄 ไม่มีของขาด — บรรทัดเธรดมีแต่ข้อที่หัวหน้าขอ ไม่มีจุดคั่นค้างท้าย', () => {
  assert.equal(surveySendBackBody([], 'ขอภาพส่วน B อีกรูป · ขอรูปใกล้มุมเตียง'),
    'หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — ขอภาพส่วน B อีกรูป · ขอรูปใกล้มุมเตียง');
});

/* 🔴 ปุ่มที่แจ้งไม่ถึงใครคือปุ่มที่โกหก — ต้องตีกลับก่อน ไม่ใช่ตอบ "แจ้งแล้ว 0 คน" */
test('🔴 ไม่มีช่างที่ถูกมอบหมาย = ตีกลับ ไม่ใช่แจ้งลม', () => {
  const err = surveySendBackError(request(), {
    canSend: true, note: 'ถ่ายภาพกว้างเพิ่มด้วยครับ', gaps, crewIds: [],
  });
  assert.match(err, /แจ้งไม่ถึงใคร/);
  assert.match(err, /ลงคิวก่อน/, 'ห้ามห้ามเฉย ๆ — ต้องบอกทางออก');
});

test('🔑 ข้อความที่ช่างได้รับต้องมีทั้งคำสั่งและชื่อพื้นที่ที่ขาด', () => {
  const text = surveySendBackBody(gaps, 'ถ่ายภาพกว้างเพิ่ม');
  assert.match(text, /ถ่ายภาพกว้างเพิ่ม/);
  assert.match(text, /ภาพกว้างครบทุกพื้นที่ — ขาด ห้องประชุมใหญ่/);
});

/* ══ ส่งกลับทีละข้อ (แผน §10.5 S3 · ม็อก A-5) ═════════════════════════════
   ⭐ หัวหน้าพิมพ์หนึ่งบรรทัดต่อหนึ่งเรื่อง ⇒ ช่างติ๊กได้ทีละข้อ · 🐞 เดิมข้อความเป็นก้อนเดียว
     เรื่องที่สอง ("ขอรูปใกล้อีกรูป") ไม่มีใครตามว่าทำแล้วหรือยัง */
const TWO_ASKS = 'ห้อง Treatment ภาพกว้างเห็นแค่ส่วน A — ขอภาพส่วน B อีกรูป\n\n  จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป  \r\n';

test('🔑 หนึ่งบรรทัดหนึ่งข้อ — บรรทัดว่างไม่นับ · ตัดช่องว่างหัวท้าย · \\r\\n ก็เป็นบรรทัด', () => {
  assert.deepEqual(surveySendBackItems(TWO_ASKS), {
    items: ['ห้อง Treatment ภาพกว้างเห็นแค่ส่วน A — ขอภาพส่วน B อีกรูป', 'จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป'],
    error: null,
  });
  // ว่าง = ไม่มีข้อ · ด่าน "อย่างน้อย 10 ตัวอักษร" ของปุ่มเป็นคนบอกเหตุ ไม่ใช่ตัวแยกบรรทัด
  assert.deepEqual(surveySendBackItems(''), { items: [], error: null });
  assert.deepEqual(surveySendBackItems(null), { items: [], error: null });
  assert.deepEqual(surveySendBackItems(' \n \n'), { items: [], error: null });
});

test('🔴 เกิน 10 ข้อ / ข้อเดียวยาวเกิน 300 ตัวอักษร = ตีกลับพร้อมบอกว่าข้อไหน', () => {
  assert.equal(SEND_BACK_MAX_ITEMS, 10);
  assert.equal(SEND_BACK_ITEM_MAX, 300);
  const ten = Array.from({ length: 10 }, (_, i) => `ขอภาพกว้างห้องที่ ${i + 1}`).join('\n');
  assert.equal(surveySendBackItems(ten).error, null);
  const eleven = `${ten}\nขอภาพกว้างห้องที่ 11`;
  const many = surveySendBackItems(eleven);
  assert.equal(many.items.length, 11, 'ยังคืนข้อครบ — จอใช้นับ "n ข้อ" ระหว่างพิมพ์');
  assert.match(many.error, /ไม่เกิน 10 ข้อ/);
  assert.match(many.error, /11 ข้อ/);

  assert.equal(surveySendBackItems('ก'.repeat(300)).error, null);
  const long = surveySendBackItems(`ขอภาพกว้างห้องประชุม\n${'ก'.repeat(301)}`);
  assert.match(long.error, /ข้อที่ 2/);
  assert.match(long.error, /300 ตัวอักษร/);
});

test('🔑 ด่านปุ่มถามตัวแยกบรรทัดตัวเดียวกัน — ข้อเกิน = ส่งไม่ได้ · ปกติผ่าน', () => {
  const ok = { canSend: true, gaps, crewIds: ['u1'] };
  assert.equal(surveySendBackError(request(), { ...ok, note: TWO_ASKS }), null);
  const eleven = Array.from({ length: 11 }, (_, i) => `ขอภาพกว้างห้องที่ ${i + 1}`).join('\n');
  assert.match(surveySendBackError(request(), { ...ok, note: eleven }), /ไม่เกิน 10 ข้อ/);
  // 🔴 บรรทัดว่างไม่ช่วยให้ผ่านขั้นต่ำ — นับจากข้อที่ช่างจะเห็นจริง
  assert.match(surveySendBackError(request(), { ...ok, note: 'ถ่ายรูป\n\n\n\n\n' }), /10 ตัวอักษร/);
});

test('🔑 บรรทัดเธรดมีครบทุกข้อ — ไม่ตัดที่ 300 ตัวอักษรเหมือนตอนเป็นก้อนเดียว', () => {
  const asks = Array.from({ length: 3 }, (_, i) => `ข้อ ${i + 1} ${'ก'.repeat(200)}`);
  const text = surveySendBackBody(gaps, asks.join(' · '));
  for (const ask of asks) assert.ok(text.includes(ask), 'ข้อท้าย ๆ หายจากเธรด = ฝ่ายขายเห็นไม่ครบ');
});

/* 🐞 UAT 25/09 — กระดิ่งเก็บแค่ 500 ตัวอักษรแรก (`notifyUsers`) · ข้อของหัวหน้ามาก่อนของขาด ⇒ ข้อยาว ๆ
   สามสี่ข้อดันบรรทัด "ภาพกว้าง — ขาด ห้อง A" หลุดท้าย ⇒ กระดิ่งไม่บอกแล้วว่าไปที่พื้นที่ไหน
   ⇒ กระดิ่ง: ของขาดก่อน · ข้อของหัวหน้าสองข้อแรก (ตัดยาว) + "และอีก n ข้อ" · เธรดยังได้ครบทุกข้อ */
test('🐞 กระดิ่งของช่าง: ชื่อพื้นที่ที่ขาดมาก่อนและรอดการตัด 500 · ข้อของหัวหน้าย่อเป็นสองข้อ + "และอีก n ข้อ"', () => {
  const asks = Array.from({ length: 4 }, (_, i) => `ข้อ ${i + 1} ${'ก'.repeat(130)}`);
  const zoneGaps = [{ label: 'ภาพกว้างครบทุกพื้นที่', zones: ['ห้อง A'] }];
  const bell = surveySendBackBody(zoneGaps, asks, { bell: true });
  const kept = bell.slice(0, 500);
  assert.ok(kept.includes('ภาพกว้างครบทุกพื้นที่ — ขาด ห้อง A'), 'ชื่อพื้นที่ต้องรอดการตัดของกระดิ่ง');
  assert.ok(bell.indexOf('ขาด ห้อง A') < bell.indexOf('ข้อ 1 '), 'ของขาดมาก่อนข้อของหัวหน้า');
  assert.ok(bell.includes('ข้อ 1 ') && bell.includes('ข้อ 2 '));
  assert.ok(!bell.includes('ข้อ 3 '), 'ข้อที่สามเป็นต้นไปนับรวมเป็น "และอีก n ข้อ"');
  assert.match(kept, /และอีก 2 ข้อ/, 'คำว่ายังมีข้ออื่นต้องรอดการตัดด้วย');
  // สองข้อหรือน้อยกว่า = ครบทุกข้อ ไม่มี "และอีก" · ไม่มีของขาด = ขึ้นข้อของหัวหน้าเลย
  assert.equal(surveySendBackBody([], ['ขอภาพส่วน B อีกรูป', 'ขอรูปใกล้มุมเตียง'], { bell: true }),
    'หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — ขอภาพส่วน B อีกรูป · ขอรูปใกล้มุมเตียง');
  // เธรด (ตัวเรียกแบบเดิม) ไม่ถูกย่อ
  const thread = surveySendBackBody(zoneGaps, asks.join(' · '));
  for (const ask of asks) assert.ok(thread.includes(ask));
});

test('🐞 route: กระดิ่งใช้ข้อความแบบย่อ · แถวเธรดยังเก็บข้อความเต็ม (UAT 25/09)', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  const bellCall = route.slice(route.indexOf('notifyUsers(supabase, {'));
  assert.match(bellCall, /body: surveySendBackBody\(gaps, items, \{ bell: true \}\)/);
  const write = route.slice(route.indexOf('appendUpdate(supabase, {'), route.indexOf('notifyUsers(supabase, {'));
  assert.match(write, /body: text,/, 'เธรดที่ฝ่ายขายอ่านต้องได้ครบทุกข้อ');
});

/* 🐞 UAT 25/09 — route ทิ้งผลของ `appendUpdate` (ไม่ throw — คืน `{ row, error }`) ⇒ เขียนแถวส่งกลับพลาด
   ช่างยังได้กระดิ่ง "กลับไปเก็บงาน…" หัวหน้าได้ toast สำเร็จ แต่ใบไม่มีเรื่องค้างเลย (แถวนี้คือที่เก็บเดียว)
   ⇒ ช่างกดแจ้งแก้แล้วโดนตอบ "ไม่มีเรื่องที่หัวหน้าแจ้งให้แก้ค้างอยู่" */
test('🐞 route: เขียนแถวส่งกลับไม่สำเร็จ = ตอบ error ก่อนถึงกระดิ่ง', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.match(route, /const \{ row, error: writeError \} = await appendUpdate\(supabase, \{/);
  const check = route.indexOf('if (writeError || !row) return fail(');
  assert.ok(check > route.indexOf('appendUpdate(supabase'), 'ตรวจหลังเขียน');
  assert.ok(check > 0 && check < route.indexOf('notifyUsers(supabase'), 'เขียนพลาดต้องไม่มีกระดิ่งออกไป');
});

/* ── ยามผูกกับซอร์สจริง ──────────────────────────────────────────────── */

test('🔴 route ต้องนับของขาดจากฐาน ไม่ใช่เชื่อตัวเลขที่จอส่งมา', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.match(route, /surveyCrewGaps\(zones, filesByZone\)/);
  assert.doesNotMatch(route, /body\.gaps|body\.gates/,
    'จอที่โหลดค้างไว้จะบอกว่ายังขาด ทั้งที่ช่างบันทึกไปแล้ว');
  assert.match(route, /surveySendBackError\(/, 'ต้องใช้ตัวตัดสินกลาง ไม่ใช่เขียนเงื่อนไขซ้ำ');
});

/* 🔄 S4 — ของขาดเป็นเรื่องเล่า ไม่ใช่ด่าน: route ยังนับจากฐาน (เธรด/กระดิ่งเล่าต่อท้าย) แต่ไม่ส่งเข้าด่าน
   และบันทึกตรวจสอบไม่เขียน "ติด 0 ข้อ" (อ่านเหมือนนับพลาด) */
test('🔄 route: ของขาดไม่เข้าด่านแล้ว · ฝั่งช่างครบ = บันทึกว่า "ฝั่งช่างครบแล้ว"', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  const gateCall = route.slice(route.indexOf('surveySendBackError(request, {'));
  assert.match(gateCall, /^surveySendBackError\(request, \{\s*canSend: canSendSurveyResult\(user\), note, crewIds,\s*\}\)/);
  assert.match(route, /surveySendBackBody\(gaps, /, 'ของขาดที่มีจริงยังเล่าในเธรด/กระดิ่ง');
  assert.match(route, /gaps\.length \? `ติด \$\{gaps\.length\} ข้อ` : 'ฝั่งช่างครบแล้ว'/);
});

/* ⭐ ขาไปเก็บ "ข้อ" ไว้ในแถวเธรด — จอของช่างติ๊กทีละข้อจาก `meta.items` · `note` ยังอยู่ (ท้ายสุด)
   ให้แท็บเก่า/แถบเดิมของช่างอ่านต่อได้ · ข้อที่ผิดทรงเป็นความผิดของคำขอ (400) ไม่ใช่สภาพใบ (409) */
test('🔑 route แยกข้อด้วยตัวเดียวกับจอ · เก็บ items ใน meta · เธรด/กระดิ่งได้ทุกข้อ', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.match(route, /surveySendBackItems\(body\.note\)/);
  assert.match(route, /meta: \{ gates: gaps\.map\(\(g\) => g\.key\), crew: crewIds\.length, items, note \}/);
  assert.match(route, /const note = items\.join\('\\n'\)/, 'note = ข้อต่อบรรทัด ไม่ใช่ข้อความดิบที่มีบรรทัดว่าง');
  assert.match(route, /surveySendBackBody\(gaps, items\.join\(' · '\)\)/);
  assert.match(route, /gate === itemsError/, 'ข้อผิดทรง = 400');
});

/* 🔴 กระดิ่งของใบคำร้องไปหาผู้ขอ (SA) เท่านั้น · ช่างไม่อยู่ในทะเบียนผู้รับ และเปิดหน้า
   คำร้องไม่ได้ (403) ⇒ เขียนเธรดอย่างเดียว = ช่างไม่มีทางรู้เรื่อง */
test('🔴 ต้องยิงกระดิ่งตรงถึงช่าง และ href ต้องเป็นจอที่ช่างเปิดได้', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.match(route, /notifyUsers\(supabase, \{/);
  assert.match(route, /userIds: crewIds/);
  assert.match(route, /href: `\/service\/surveys\/\$\{id\}`/,
    'ชี้ไปหน้าคำร้อง = พาช่างไปชนกำแพง 403');
  assert.match(route, /visit\?\.assigneeId/, 'รายชื่อช่างมาจากนัด ไม่ใช่จากใบ');
});

/* ⚠️ ไม่แตะสถานะใบและไม่แตะนัด — ผลวัดค้างอยู่บนใบแล้ว และของที่ขาดจะเติมลงแถวเดิม
   (UNIQUE (requestId, zoneId)) ⇒ ถอยขั้นเมื่อไรคือทิ้งงานที่ทำมาแล้ว */
test('🔴 ห้ามถอยขั้นใบ และห้ามพลิกสถานะนัด', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.doesNotMatch(route, /committedDueDate/);
  assert.doesNotMatch(route, /from\('service_visits'\)\.update/);
  assert.doesNotMatch(route, /from\('dept_requests'\)\.update/);
});

test('🪤 kind "send_back" ต้องมีป้ายในทะเบียน และอยู่ในกล่องกระดิ่ง', async () => {
  const { UPDATE_KINDS } = await import('@/lib/master/updateTypes');
  assert.ok(Object.hasOwn(UPDATE_KINDS.dept_request, 'send_back'),
    'ไม่มีป้าย = กระดิ่งขึ้นว่า "ข้อความ" และหายตอนกดซ่อนเหตุการณ์ระบบ');
  const { SERVICE_BELL_KINDS } = await import('@/lib/notifications');
  assert.ok(SERVICE_BELL_KINDS.includes('survey_send_back'));
});

/* 🔄 **ย้ายบ้าน 2026-09-16 (PR3 ของการรื้อจอประเมิน)** — เช็คลิสต์เดิม
   (`components/service/SurveyGateList.js`) ถูก**ย้ายเข้าการ์ดควบคุม** `SurveyControlCard`
   และเปลี่ยนรูปตามแบบที่อนุมัติ: ด่านที่ติดรวมเป็น **กลุ่มต่อพื้นที่** (ช่างต้องเก็บ /
   หัวหน้าต้องทำ) ส่วนรายการครบหกข้ออยู่หลังปุ่มคลี่ · ปุ่ม "แจ้งช่างให้กลับไป" จึงมี
   **ครั้งเดียวต่อใบ** ไม่ใช่ปุ่มต่อข้ออีกแล้ว (ปุ่มหกปุ่มที่ส่งข้อความชุดเดียวกัน)
   ⇒ ยามข้อนี้ยังตรึงเรื่องเดิม คือ "ของช่างกับของหัวหน้าต้องแยกกันให้เห็น และปุ่มแจ้ง
   ต้องขึ้นเฉพาะตอนที่ยังมีของช่างค้าง" แค่ย้ายไปตรึงที่ไฟล์ที่วาดจริงตอนนี้ */
/* 🔄 S4 (แผน §10.5 · ม็อก AW-2) — ปุ่มไม่ผูกกับ "ยังมีของช่างค้าง" แล้ว: ฝั่งช่างครบก็ส่งกลับได้
   ⇒ ขึ้นตาม `view.sendBackAction.show` (หัวหน้า · ใบไม่ล็อก · นัดมีช่าง) และใช้คำของม็อก "ส่งกลับให้ช่างแก้"
   · `zoneGaps.crewPending` ยังอยู่ในตัวตัดสิน (บอกว่ามีของช่างค้างไหม) แต่ไม่ใช่ตัวเปิดปุ่มอีกแล้ว */
test('🔑 การ์ดควบคุมต้องแยกของช่างกับของหัวหน้า และมีปุ่มส่งกลับตามตัวตัดสิน', () => {
  const card = code('../../components/service/SurveyControlCard.js');
  assert.match(card, /row\.crewText/, 'กลุ่มต่อพื้นที่ต้องบอก "ช่างต้องเก็บ: …"');
  assert.match(card, /row\.headText/, 'และบอก "หัวหน้าต้องทำ: …" แยกบรรทัดกัน');
  assert.match(card, /sendBackAction\.show \?/,
    'ปุ่มขึ้นตามตัวตัดสินตัวเดียว — ไม่คิดเงื่อนไขเองที่การ์ด');
  assert.doesNotMatch(card, /zoneGaps\.crewPending/, 'ฝั่งช่างครบแล้วปุ่มต้องยังอยู่ (A-5/AW-2)');
  assert.match(card, /sendBackAction\.label/, 'คำบนปุ่มมาจากตัวตัดสิน ("ส่งกลับให้ช่างแก้")');

  const page = code('../../app/service/surveys/[id]/page.js');
  assert.match(page, /<SurveyControlCard/, 'ด่านก่อนส่งอยู่ในการ์ดควบคุม ไม่ลอยอยู่ในหน้า');
  assert.match(page, /surveySendBackError\(/, 'ปุ่มในโมดัลต้องปิดด้วยด่านตัวเดียวกับ server');
  assert.match(page, /method: "POST", json: \{ note: sendBackNote\.trim\(\) \}/);
  // 🔄 S4 — ฝั่งช่างครบแล้วกล่องยืนยันเคยขึ้น "ข้อที่ติด: " ว่าง ๆ ⇒ ข้อความมาจากตัวตัดสิน ไม่ประกอบเองในหน้า
  assert.match(page, /\|\| view\.sendBackAction\.message/);
  assert.doesNotMatch(page, /ข้อที่ติด: \$\{/);
});

/* ⭐ กล่องของหัวหน้าเป็นช่องหลายบรรทัด — ช่องบรรทัดเดียว (`Input`) กด Enter ขึ้นบรรทัดใหม่ไม่ได้
   ⇒ หัวหน้าแยกข้อไม่ได้เลย · ตัวนับ "n ข้อ" มาจากตัวแยกบรรทัดตัวเดียวกับ server (ตาเห็นกี่ข้อ = ช่างได้กี่ข้อ)
   ⚠️ ตัวคำขอไม่เปลี่ยน (`{ note }` ข้อความดิบ) — server แยกเอง แท็บเก่าที่ส่งบรรทัดเดียวยังได้หนึ่งข้อ */
test('🔑 หน้า: กล่องส่งกลับเป็น Textarea หนึ่งบรรทัดต่อหนึ่งเรื่อง พร้อมตัวนับข้อจากตัวแยกเดียวกัน', () => {
  const page = code('../../app/service/surveys/[id]/page.js');
  assert.match(page, /surveySendBackItems\(sendBackNote\)/);
  const at = page.indexOf('title="แจ้งช่างให้กลับไปเก็บงาน"');
  assert.ok(at > 0, 'ยังมีกล่องแจ้งช่างให้กลับไปบนหน้า');
  const box = page.slice(at, page.indexOf('</ConfirmDialog>', at));
  assert.match(box, /<Textarea/);
  assert.doesNotMatch(box, /<Input/, 'ช่องบรรทัดเดียวแยกข้อไม่ได้');
  assert.match(box, /placeholder="หนึ่งบรรทัดต่อหนึ่งเรื่อง/);
  assert.match(box, /sendBackItems\.items\.length\} ข้อ/);
});
