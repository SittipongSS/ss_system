// ── หัวหน้าแจ้งช่างให้กลับไปเก็บงานหน้างาน (แผน §5.4 บรรทัด 604) ──────────
//
// 🐞 **ทางตันที่มีมาตั้งแต่เฟส 3** — ด่านสามข้อบนของหกข้อเป็นของช่าง หัวหน้าแก้เองไม่ได้
//   ⇒ เขาเห็นแค่ปุ่มส่งผลที่กดไม่ได้ · คอมเมนต์ใน survey.js อ้างชื่อปุ่มนี้มาตั้งแต่วันแรก
//   ในฐานะเหตุผลที่จอสรุปต้องกางเช็คลิสต์หกข้อ — แต่ปุ่มไม่เคยถูกสร้าง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_GATES, surveyCrewGaps, surveyFieldMissing, surveyGateChecklist,
  surveyResultMissing, surveySendBackBody, surveySendBackError,
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

test('🔑 ด่านครบห้าข้อ เรียงตามลำดับที่ผู้ใช้แก้ได้จริง', () => {
  assert.equal(surveySendBackError(request(), {
    canSend: true, note: 'ถ่ายภาพกว้างเพิ่ม', gaps, crewIds: ['u1'],
  }), null);
  assert.match(surveySendBackError(request(), { canSend: false }), /ได้เฉพาะหัวหน้า/);
  assert.match(
    surveySendBackError(request({ answeredAt: 'x' }), { canSend: true, gaps, crewIds: ['u1'] }),
    /ส่งผลให้ฝ่ายขายไปแล้ว/,
  );
  assert.match(
    surveySendBackError(request(), { canSend: true, gaps: [], crewIds: ['u1'] }),
    /ไม่มีอะไรให้ช่างกลับไปทำ/,
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

/* ── ยามผูกกับซอร์สจริง ──────────────────────────────────────────────── */

test('🔴 route ต้องนับของขาดจากฐาน ไม่ใช่เชื่อตัวเลขที่จอส่งมา', () => {
  const route = code('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.match(route, /surveyCrewGaps\(zones, filesByZone\)/);
  assert.doesNotMatch(route, /body\.gaps|body\.gates/,
    'จอที่โหลดค้างไว้จะบอกว่ายังขาด ทั้งที่ช่างบันทึกไปแล้ว');
  assert.match(route, /surveySendBackError\(/, 'ต้องใช้ตัวตัดสินกลาง ไม่ใช่เขียนเงื่อนไขซ้ำ');
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

test('🔑 จอสรุปต้องกางเช็คลิสต์แยกตามเจ้าของ และวางปุ่มไว้ข้างข้อของช่าง', () => {
  const list = code('../../components/service/SurveyGateList.js');
  assert.match(list, /ช่างเท่านั้นที่แก้ได้/);
  assert.match(list, /หัวหน้าแก้ได้เอง/);
  assert.match(list, /group\.owner === "crew" && !gate\.ok && canSendBack/,
    'ปุ่มขึ้นเฉพาะข้อของช่างที่ยังติด — ไม่ใช่ทุกข้อ');
  assert.match(list, /แจ้งช่างให้กลับไป/);

  const page = code('../../app/service/surveys/[id]/page.js');
  assert.match(page, /<SurveyGateList/);
  assert.match(page, /surveySendBackError\(/, 'ปุ่มในโมดัลต้องปิดด้วยด่านตัวเดียวกับ server');
  assert.match(page, /method: "POST", json: \{ note: sendBackNote\.trim\(\) \}/);
});
