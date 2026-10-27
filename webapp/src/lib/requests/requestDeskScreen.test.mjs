// ── ประเมินจากแบบบนฝั่งคำร้อง (งวด S2b · กลุ่ม D) — ยามอ่านซอร์สจอ + ค่าที่จอวาดจาก view-model ─────────────
//
// ⭐ สี่จอของกลุ่มนี้: โมดัลกลาง `CommitDueDialog` (ทรงงานโต๊ะ: รับปาก · เลื่อนวันส่งผล) · หน้าคำร้อง `/requests/[id]`
//    · หน้าคำร้องแบบไทม์ไลน์ `SurveyRequestView` · จอรายละเอียดรุ่นเก่า `SurveyDetail`
// ⚠️ ไฟล์จอเป็น JSX (import ใต้ Node เปล่าไม่ได้) ⇒ ตรึง "จอเรียกอะไร / วาดจากคีย์ไหน" ด้วยการอ่านซอร์ส แล้วตรึง **ค่า** ของคีย์นั้น
//    ด้วยการเรียก view-model จริง (`commitDue.js` · `surveyJob.js`) — จอไม่มีตรรกะของตัวเองให้เทสต์
// 🔴 ทุกข้อมีคู่เทียบของใบลงหน้างาน: คีย์ของวิธีนี้เป็น null / เท็จ / ว่าง ⇒ จอของใบวันนี้ไม่ขยับ (สเปก §4 แถว D)
// ⛔ สตริง/regex ในไฟล์นี้ห้ามมีทับตามด้วยดอกจันติดกัน (ตัวตัดคอมเมนต์ของยามจะกลืนโค้ดตั้งแต่จุดนั้น)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  commitDueDefaults, commitDueGaps, commitDueHeader, commitDueLabels, commitDueMode, commitDueOutcome, commitDuePayload,
  deskDueAction, deskRescheduleView,
} from './commitDue.js';
import { requestRailSteps } from './requestRail.js';
import { surveyJobView, surveyRequestDrawingSummary } from '../service/surveyJob.js';
import {
  SURVEY_CONFIRM_ACTION_READY, SURVEY_CONFIRM_PENDING_NOTE, SURVEY_METHOD_CHIP, surveyDeskRailSteps,
} from '../service/surveyMethodSwitch.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
/* ตัดคอมเมนต์ทิ้ง (คอมเมนต์ JSX ทั้งปีกกา · บล็อก · ทั้งบรรทัด) — คอมเมนต์เล่าเหตุผลได้โดยไม่ทำให้ยามเข้าใจผิด
   ⚠️ คอมเมนต์ JSX ต้องถูกตัดก่อนพร้อมปีกกาของมัน — ตัดแต่เนื้อจะเหลือปีกกาเปล่าที่แยกไม่ออกจากอ็อบเจกต์ว่างของโค้ดจริง */
const code = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
/* กฎ CSS ทั้งก้อนของตัวเลือกหนึ่ง (ตัวแรกที่เจอ) */
const rule = (sheet, selector) => {
  const at = sheet.indexOf(`${selector} {`);
  assert.ok(at >= 0, `ไม่พบกฎ ${selector}`);
  return sheet.slice(at, sheet.indexOf('}', at) + 1);
};

const DIALOG = code(read('../../components/requests/CommitDueDialog.js'));
const DIALOG_CSS = css('../../components/requests/CommitDueDialog.module.css');
const PAGE = code(read('../../app/requests/[id]/page.js'));
const VIEW = code(read('../../components/requests/details/SurveyRequestView.js'));
const VIEW_CSS = css('../../components/requests/details/surveyRequest.module.css');
const DETAIL = code(read('../../components/requests/details/SurveyDetail.js'));
const DETAIL_CSS = css('../../components/requests/details/details.module.css');
const SCREENS = [['CommitDueDialog', DIALOG], ['หน้าคำร้อง', PAGE], ['SurveyRequestView', VIEW], ['SurveyDetail', DETAIL]];

/* ── ฟิกซ์เจอร์: ใบ RQ-AS-26100312 ของบรีฟม็อก ───────────────────────────────────────────── */
const TODAY = '2026-10-09';
const DRAWING = { method: 'drawing' };
const SALES = { isOpener: true, isRequesterSide: true };
const HEAD = { canDecide: true, canWork: true };
const zones = (over = {}) => ([
  { id: 'z1', zoneName: 'Lobby ชั้น 1', zoneCode: 'ZN-1160-10301', zoneFloor: '01', status: 'ok',
    parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }], spots: [], ...over },
  { id: 'z2', zoneName: 'ห้องประชุม ชั้น 2', zoneCode: 'ZN-1160-10302', zoneFloor: '02', status: 'added',
    parts: [{ id: 'p', widthM: 6, lengthM: 5, heightM: 2.8 }], spots: [], ...over },
  { id: 'z3', zoneName: 'ห้อง Spa ชั้น 3', zoneCode: 'ZN-1160-10303', zoneFloor: '03', status: 'ok',
    parts: [{ id: 'p', widthM: 3, lengthM: 2, heightM: 3 }], spots: [], ...over },
]);
/* ใบงานโต๊ะที่รับเรื่องแล้ว ยังไม่รับปากวันส่งผล — ธง `surveyNeedsVisit` คือสิ่งที่ตัวโหลดคำร้องติดมา */
const desk = (over = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26100312', team: 'SV',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-08T07:50:00Z',
  acknowledgedAt: '2026-10-08T08:12:00Z', acknowledgedByName: 'Arnon Aunsapwilai',
  assigneeId: 'u-head', assigneeName: 'Arnon Aunsapwilai',
  requestedDueDate: '2026-10-13', requestedDueTime: '10:00:00', requestedResultDate: '2026-10-15',
  committedDueDate: null, committedResultDate: null, surveyNeedsVisit: false,
  surveyVisit: null, surveyZones: zones(DRAWING), surveyFilesByZone: {},
  ...over,
});
const PROMISED = { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' };
const SENT = { ...PROMISED, status: 'answered', answeredAt: '2026-10-14T03:00:00Z', answeredByName: 'Arnon Aunsapwilai' };
/* ใบลงหน้างานล้วน (ใบของวันนี้) — ไม่มีธง ไม่มีพื้นที่จากแบบ */
const onsite = (over = {}) => desk({ surveyNeedsVisit: undefined, surveyZones: zones(), ...over });
/* ใบผสม — พื้นที่ที่สามประเมินจากแบบ อีกสองพื้นที่ช่างต้องไปวัด (ยังต้องมีนัด) */
const mixed = (over = {}) => desk({
  surveyNeedsVisit: true, surveyZones: zones().map((z, i) => (i === 2 ? { ...z, ...DRAWING } : z)), ...over,
});
const job = (request, viewer = SALES) => surveyJobView({ request, today: TODAY, viewer });

/* ══ D-1 โมดัล: ทรงงานโต๊ะ ═══════════════════════════════════════════════════════════════════ */

test('🔴 D-1 เลื่อนวันส่งผล: โมดัลอ่าน `deskRescheduleView` แล้วส่ง `payload` ของมันทั้งก้อน — ไม่ประกอบก้อนเอง · ทรงนี้มีเฉพาะงานโต๊ะ', () => {
  assert.match(DIALOG, /commitDueOutcome, commitDuePayload, commitDueWishes, deskRescheduleView,\s*\} from "@\/lib\/requests\/commitDue";/);
  // โหมดเลื่อนต้องเป็นงานโต๊ะด้วย — ใบที่ต้องมีนัดส่ง mode="reschedule" มา = ทรงเดิมของมัน (ไม่ได้ทรงนี้)
  assert.match(DIALOG, /const deskMode = commitDueMode\(request\) === "desk";/);
  assert.match(DIALOG, /const reschedule = deskMode && mode === "reschedule" \? deskRescheduleView\(request, form\) : null;/);
  assert.equal((DIALOG.match(/deskRescheduleView\(/g) || []).length, 1, 'ถาม view ครั้งเดียว ใช้ทุกจุด');
  assert.match(DIALOG, /const submitReschedule = \(\) => onSubmit\?\.\(reschedule\.payload\);/);
  // ไม่มีชื่อ action · ไม่มีคีย์ของก้อน เขียนอยู่ในโมดัล
  assert.doesNotMatch(DIALOG, /action:\s*["'`]|committedResultDate\s*:|committedDueDate\s*:/);
  // หัว · ป้ายวัน · ด่านของปุ่ม · ดอกจันของเหตุผล มาจาก view
  assert.match(DIALOG, /title=\{reschedule \? reschedule\.title : header\.title\}/);
  assert.match(DIALOG, /dateLabel=\{reschedule \? reschedule\.dateLabel : labels\.dateLabel\}/);
  assert.match(DIALOG, /blocker: reschedule\.gaps\.join\(" · "\),\s*onClick: submitReschedule,/);
  assert.match(DIALOG, /required: reschedule\.reasonRequired,/);
  // ค่าตั้งต้นของโมดัล: "commit" — ผู้เรียกเดิมสองหน้าไม่ส่ง mode จึงได้ทรงเดิม
  assert.match(DIALOG, /mode = "commit",\s*viewerName = "",/);
  // โมดัลยังไม่ขึ้นข้อผิดพลาดเอง — ผู้เรียกเป็นคนทัก (403 ของ route มาทางนั้น)
  assert.doesNotMatch(DIALOG, /error=\{|setError\(|role="alert"/);
});

test('D-1 เลื่อนวันส่งผล: ถ้อยคำตรงตัว (หัว · ป้ายวัน · "เดิมรับปากไว้ …" · เหตุผลบังคับ · ปุ่ม "บันทึกวันใหม่") และด่าน/ก้อนของ view', () => {
  assert.match(DIALOG, /const RESCHEDULE_SUBMIT = "บันทึกวันใหม่";/);
  assert.match(DIALOG, /const RESCHEDULE_REASON_LABEL = "เหตุผล";/);
  assert.match(DIALOG, /const RESCHEDULE_REASON_PLACEHOLDER = "บอกผู้ขอว่าทำไมต้องเลื่อน — จะได้ไปคุยกับลูกค้าต่อได้";/);
  assert.match(DIALOG, /const RESCHEDULE_HELD_LEAD = "เดิมรับปากไว้";/);
  assert.match(DIALOG, /const heldDate = reschedule \? dayText\(request\.committedResultDate \|\| request\.committedDueDate\) : "";/);
  assert.match(DIALOG, /const dateHint = reschedule \? `\$\{RESCHEDULE_HELD_LEAD\} \$\{naText\(heldDate\)\}` : labels\.dateHint;/);
  // คำเดียวกับโมดัลเลื่อนวันของหน้าใบ (หัวข้ออื่น) — คนที่เคยเลื่อนวันอ่านแล้วเป็นเรื่องเดียวกัน
  for (const words of ['บอกผู้ขอว่าทำไมต้องเลื่อน — จะได้ไปคุยกับลูกค้าต่อได้', 'บันทึกวันใหม่', 'เดิมรับปากไว้']) {
    assert.ok(PAGE.includes(words), words);
  }

  const promised = desk(PROMISED);
  // เปิดมา: วันตั้งต้น = วันที่รับปากไว้ ⇒ ปุ่มบอกครบสองข้อในครั้งเดียว และบรรทัดใต้ปุ่มพูดด่านชุดเดียวกัน
  const opened = commitDueDefaults(promised, { today: TODAY });
  assert.equal(opened.date, '2026-10-15');
  const first = deskRescheduleView(promised, opened);
  assert.deepEqual(
    [first.title, first.dateLabel, first.reasonRequired, first.gaps],
    ['เลื่อนวันส่งผล', 'วันที่จะส่งผลประเมิน', true, ['วันเดิมกับที่แจ้งไว้แล้ว', 'ต้องบอกเหตุผลที่เลื่อนวันส่งผล']],
  );
  // กรอกครบ: ไม่มีด่าน · ก้อนที่ออกจากโมดัลคือก้อนนี้ตรงตัว (ไม่มีวันนัด เวลา หรือช่าง)
  const done = deskRescheduleView(promised, { ...opened, date: '2026-10-20', reason: 'รอแบบแก้จากลูกค้า' });
  assert.deepEqual(done.gaps, []);
  assert.deepEqual(done.payload, { action: 'reschedule', committedResultDate: '2026-10-20', reason: 'รอแบบแก้จากลูกค้า' });
  // ผ่านครบ = บรรทัดใต้ปุ่มเป็นประโยคของงานโต๊ะ · ผู้รับผิดชอบคือคนเดิมบนใบ (การเลื่อนไม่เปลี่ยนคน)
  assert.match(DIALOG, /const ownerName = reschedule \? request\.assigneeName \|\| viewerName : viewerName;/);
  assert.equal(
    commitDueOutcome(promised, { date: '2026-10-20', reason: 'รอแบบแก้จากลูกค้า' }, { viewerName: promised.assigneeName }).text,
    'ใบนี้ไม่ลงคิว ไม่มีนัดบนตารางเจ้าหน้าที่ · ผู้รับผิดชอบ = Arnon Aunsapwilai · ฝ่ายขายจะเห็นวันส่งผลนี้',
  );
});

test('D-1 รับปากวันส่งผล: หัว · เส้นประ "ผู้ขอต้องการผล" · ป้ายวัน · "หมายเหตุถึงฝ่ายขาย (ไม่บังคับ)" · ปุ่ม · ผลลัพธ์ — ทุกคำมาจาก lib', () => {
  const request = desk();
  assert.equal(commitDueMode(request), 'desk');
  const labels = commitDueLabels(request);
  assert.equal(commitDueHeader(request, {}).title, 'รับปากวันส่งผลประเมิน (จากแบบ)');
  assert.equal(labels.wish, 'ผู้ขอต้องการผล พฤ. 15 ต.ค.');
  assert.equal(labels.dateLabel, 'วันที่จะส่งผลประเมิน');
  assert.equal(labels.noteLabel, 'หมายเหตุถึงฝ่ายขาย');
  assert.equal(labels.submit, 'รับปากวันส่งผล');
  assert.equal(labels.okMsg, 'รับปากวันส่งผลแล้ว — ฝ่ายขายเห็นวันส่งผลนี้');
  assert.equal(commitDueLabels(desk({ requestedResultDate: null })).wish, null, 'ผู้ขอไม่ระบุ = ไม่มีเส้นประ');

  // เส้นประเหนือช่องวัน — วาดเฉพาะเมื่อ lib ให้คำ และอยู่ก่อนช่องวันในคอลัมน์เดียวกัน
  const main = DIALOG.slice(DIALOG.indexOf('const main = ('), DIALOG.indexOf('const note = reschedule'));
  assert.match(main, /\{labels\.wish \? <p className=\{styles\.wishLine\}><KeepTogether text=\{labels\.wish\} \/><\/p> : null\}/);
  assert.ok(main.indexOf('styles.wishLine') < main.indexOf('<TimeWindowField'), 'เส้นประอยู่เหนือช่องวัน');
  const wish = rule(DIALOG_CSS, '.wishLine');
  assert.match(wish, /border: 1px dashed var\(--border-strong\);/);
  assert.match(wish, /overflow-wrap: anywhere;/, 'จอ 375: ยาวแค่ไหนก็ตัดบรรทัดในกล่อง');
  assert.doesNotMatch(wish, /#[0-9a-fA-F]{3,8}\b|rgba?\(|line-height: [\d.]/, 'โทเคนล้วน');
  // งานโต๊ะ = คอลัมน์เดียว วันอย่างเดียว (ไม่ใช่ 'site' ⇒ ไม่มีแผงงาน ชิปวันนัด ตัวเลือกช่าง ด่านเข้าไซต์)
  assert.match(DIALOG, /layout=\{siteMode \? "split" : "single"\}/);
  assert.match(DIALOG, /withTime=\{siteMode\}/);
  // ป้ายหมายเหตุ: คำของ lib + ท้ายเดิม
  assert.match(DIALOG, /label: `\$\{labels\.noteLabel \|\| "หมายเหตุ"\} \(ไม่บังคับ\)`/);
  // ด่านของปุ่ม + ก้อนที่ส่ง + บรรทัดผลลัพธ์ (ชื่อคนกด — ไม่ส่งชื่อมา = "คุณ")
  assert.deepEqual(commitDueGaps(request, { date: '', reason: '' }), ['ต้องระบุวันที่จะส่งผลประเมิน']);
  assert.deepEqual(commitDueGaps(request, { date: '15/10/2026', reason: '' }), ['วันที่จะส่งผลประเมินไม่ถูกต้อง']);
  assert.deepEqual(
    commitDuePayload(request, { date: '2026-10-15', reason: 'ส่งได้ตามที่ขอ' }),
    { action: 'commit-due', committedResultDate: '2026-10-15', reason: 'ส่งได้ตามที่ขอ' },
  );
  assert.match(DIALOG, /commitDueOutcome\(request, form, \{ site, accessKnown, technicians, load, siteLoad, viewerName: ownerName \}\)/);
  assert.equal(
    commitDueOutcome(request, { date: '2026-10-15', reason: '' }, { viewerName: 'Arnon Aunsapwilai' }).text,
    'ใบนี้ไม่ลงคิว ไม่มีนัดบนตารางเจ้าหน้าที่ · ผู้รับผิดชอบ = Arnon Aunsapwilai · ฝ่ายขายจะเห็นวันส่งผลนี้',
  );
  assert.match(commitDueOutcome(request, { date: '2026-10-15', reason: '' }).text, /ผู้รับผิดชอบ = คุณ/);
});

test('🔴 D-1 ใบที่ไม่ใช่งานโต๊ะ: ไม่มีเส้นประ ไม่มีป้ายหมายเหตุใหม่ ไม่มีทรงเลื่อนวัน — โมดัลของวันนี้ทุกตัวอักษร', () => {
  for (const request of [onsite(), mixed(), { id: 'q1', kind: 'inquiry', dept: 'RD', status: 'acknowledged' }]) {
    const labels = commitDueLabels(request);
    assert.notEqual(commitDueMode(request), 'desk', request.kind);
    assert.equal(labels.wish, null, request.kind);
    assert.equal(labels.plannerNote, null, request.kind);
    assert.equal(labels.noteLabel, undefined, `${request.kind}: ป้ายหมายเหตุยังเป็น "หมายเหตุ (ไม่บังคับ)"`);
  }
  // ช่องเหตุผล/หมายเหตุของทรงเดิมไม่บังคับ ⇒ ไม่มี required ติดไปที่ช่อง
  assert.match(DIALOG, /: \{ label: `[^`]+`, required: false, placeholder: labels\.notePlaceholder \};/);
});

/* ══ D-2 หน้าคำร้อง ══════════════════════════════════════════════════════════════════════ */

test('🔴 D-2 งานโต๊ะตัดสินจากธงของตัวโหลด (`surveyNeedsVisit === false` ตรงตัว) ผ่านทะเบียนหัวข้อ — หน้าเปลือกไม่เทียบชื่อหัวข้อ', () => {
  assert.match(PAGE, /const deskJob = isScheduling && req\.surveyNeedsVisit === false;/);
  assert.equal((PAGE.match(/surveyNeedsVisit/g) || []).length, 1, 'ถามธงที่เดียว ที่เหลืออ่าน deskJob');
  assert.doesNotMatch(PAGE, /req\.kind === ["']/);
  assert.match(PAGE, /const head = canSendSurveyResult\(\{ role, department \}\);/);
  // ปุ่มวันส่งผล = ตัวตัดสินเดียวกับใบประเมิน และฐานเดียวกับ route
  assert.match(PAGE, /const deskDue = deskJob \? deskDueAction\(req, \{ canCommit: head && owner \}\) : null;/);
  assert.match(PAGE, /import \{ commitDueLabels, deskDueAction \} from "@\/lib\/requests\/commitDue";/);

  // ค่าที่หน้าอ่าน: รอรับปาก → commit · รับปากแล้ว → reschedule · ไม่ใช่หัวหน้า / ส่งผลแล้ว / ยกเลิก / ผู้ขอปิดแล้ว → ไม่มีปุ่ม
  assert.deepEqual(deskDueAction(desk(), { canCommit: true }), { kind: 'commit', label: 'รับปากวันส่งผล' });
  assert.deepEqual(deskDueAction(desk(PROMISED), { canCommit: true }), { kind: 'reschedule', label: 'เลื่อนวันส่งผล' });
  for (const [why, request] of [
    ['ส่งผลแล้ว', desk(SENT)],
    ['ยังไม่รับเรื่อง', desk({ status: 'pending', acknowledgedAt: null })],
    ['ถูกยกเลิก', desk({ ...PROMISED, cancelledAt: '2026-10-09T02:00:00Z' })],
    ['ผู้ขอปิดฝั่งตัวเองแล้ว', desk({ ...PROMISED, closedAt: '2026-10-09T02:00:00Z' })],
    ['ใบลงหน้างาน', onsite(PROMISED)],
    ['ใบผสม', mixed(PROMISED)],
  ]) assert.equal(deskDueAction(request, { canCommit: true }), null, why);
  assert.equal(deskDueAction(desk(), { canCommit: false }), null, 'ผู้วางคิว / ช่าง: ไม่มีปุ่ม');
});

test('D-2 ราง: งานโต๊ะใช้ชื่อขั้นของ `surveyDeskRailSteps` หลังธง deskJob — ตัวชี้ขั้นไม่ขยับ · ใบอื่นใช้รางเดิม', () => {
  assert.match(PAGE, /import \{ surveyDeskRailSteps \} from "@\/lib\/service\/surveyMethodSwitch";/);
  assert.match(PAGE, /const railShown = deskJob \? surveyDeskRailSteps\(railSteps\) : railSteps;/);
  assert.match(PAGE, /const workflowSteps = workflowStepsFromIndex\(railShown, workflowIndex, req\.status === "cancelled"\);/);
  assert.equal((PAGE.match(/surveyDeskRailSteps\(/g) || []).length, 1);

  const rail = requestRailSteps(desk(), { hasItems: false });
  const shown = surveyDeskRailSteps(rail.steps);
  assert.deepEqual(shown.map((step) => step.label), ['ส่งคำร้อง', 'รับเรื่อง', 'รับปากวันส่งผล', 'ประเมินจากแบบ', 'ส่งผล', 'ปิดเรื่อง']);
  assert.deepEqual(shown.map((step) => step.id), rail.steps.map((step) => step.id), 'รหัสขั้นและลำดับเท่าเดิม ⇒ ตัวชี้ขั้นใช้ต่อได้');
  // บรรทัดใต้สองขั้นกลางไม่พูดเรื่องลงคิว
  assert.doesNotMatch(JSON.stringify(shown), /ลงคิว|เข้าพื้นที่/);
});

test('🔴 D-2 ปุ่มหลัก: งานโต๊ะได้ "รับปากวันส่งผล" เฉพาะเมื่อ deskDue เป็น commit · คนของฝ่ายที่ไม่ใช่หัวหน้าได้ประโยคแทนปุ่ม', () => {
  assert.match(PAGE, /: \(deskJob \? deskDue\?\.kind === "commit" : owner && \(requestAwaitingDue\(req\) \|\| needsRequeue\)\)\s*\? \{\s*id: "commit-due",/);
  // ป้าย/คำใบ้ของปุ่มยังมาจาก commitDueLabels ตัวเดียว (งานโต๊ะ = "รับปากวันส่งผล") และปุ่มแค่เปิดโมดัล
  assert.match(PAGE, /label: dueDialogLabels\.action,\s*hint: dueDialogLabels\.hint,/);
  assert.equal(commitDueLabels(desk()).action, 'รับปากวันส่งผล');
  assert.equal(commitDueLabels(desk()).hint, undefined);
  // ประโยคแทนปุ่ม: ฝ่ายเจ้าของใบ · ไม่ใช่หัวหน้า · และเป็นจังหวะที่หัวหน้าจะได้ปุ่มรับปาก
  assert.match(
    PAGE,
    /const deskPlannerNote = deskJob && owner && !head && deskDueAction\(req, \{ canCommit: true \}\)\?\.kind === "commit"\s*\? dueDialogLabels\.plannerNote\s*: null;/,
  );
  assert.equal(commitDueLabels(desk()).plannerNote, 'ใบนี้ประเมินจากแบบ — หัวหน้าฝ่ายบริการเป็นผู้รับและส่งผล ไม่ต้องลงคิว');
  assert.ok(!PAGE.includes('หัวหน้าฝ่ายบริการเป็นผู้รับและส่งผล'), 'หน้าไม่พิมพ์ประโยคนี้เอง');
  // ขึ้นสองที่ที่ปุ่มของใบอยู่: การ์ดจัดการ (โครงกลาง) และแถบตอนนี้ของหน้าหัวข้อ
  assert.match(PAGE, /const controlNotices = \[\s*deskPlannerNote,/);
  const kindView = PAGE.slice(PAGE.indexOf('<KindView'), PAGE.indexOf('/>', PAGE.indexOf('<KindView')));
  assert.match(kindView, /stepNotes=\{deskPlannerNote \? \[deskPlannerNote\] : \[\]\}/);
  assert.match(kindView, /actions=\{requestActions\}/);
});

test('🔴 D-2 เลื่อนวัน: งานโต๊ะเปิดโมดัลกลางในทรงเลื่อนวัน — ไปถึงโมดัลเลื่อนวันเดิมไม่ได้สักทาง', () => {
  const action = PAGE.slice(PAGE.indexOf('id: "reschedule",'), PAGE.indexOf('id: "reopen",'));
  assert.match(action, /label: deskJob \? deskReschedule\?\.label : isScheduling \? "เลื่อนวันนัดเข้าพื้นที่" : "เลื่อนวันกำหนดส่ง",/);
  assert.match(action, /onClick: deskJob\s*\? \(\) => \{ setDueDialogMode\("reschedule"\); setDueDialogOpen\(true\); \}\s*: \(\) => setReschedule\(\{/);
  assert.match(action, /visible: deskJob\s*\? !!deskReschedule\s*: canAnswer && !!req\.acknowledgedAt && !!req\.committedDueDate,/);
  assert.match(PAGE, /const deskReschedule = deskDue\?\.kind === "reschedule" \? deskDue : null;/);
  // ตัวเปิดโมดัลเดิม (ตั้งค่าเริ่ม) มีที่เดียว และอยู่ในกิ่ง "ไม่ใช่งานโต๊ะ" ข้างบน
  assert.equal((PAGE.match(/setReschedule\(\{\s*date:/g) || []).length, 1);
  // และตัวโมดัลเองปิดเมื่อใบเป็นงานโต๊ะ (ใบที่กลายเป็นงานโต๊ะระหว่างที่โมดัลเปิดค้าง)
  assert.match(PAGE, /open=\{!!reschedule && !deskJob\}/);
  assert.equal((PAGE.match(/open=\{!!reschedule\b/g) || []).length, 1);
  // โมดัลเดิมส่ง committedDueDate — ก้อนที่กิ่งงานโต๊ะของ route ไม่อ่าน (เหตุที่ต้องกัน)
  assert.match(PAGE, /action: "reschedule",\s*committedDueDate: reschedule\.date,/);
});

test('D-2 โมดัลกลางบนหน้าคำร้อง: ส่งทรงให้โมดัล · ปิดทุกทางกลับเป็น commit · toast ตามทรง · ไม่ส่งชื่อคนดู (หน้าไม่มีในมือ)', () => {
  const tag = PAGE.match(/<CommitDueDialog[\s\S]*?\/>/)[0];
  assert.match(tag, /mode=\{dueDialogMode\}/);
  assert.match(tag, /onClose=\{closeDueDialog\}/);
  assert.match(tag, /\}, dueDialogMode === "reschedule" \? "เลื่อนวันแล้ว" : dueDialogLabels\.okMsg\)\.then\(\(ok\) => \{ if \(ok\) closeDueDialog\(\); \}\)\}/);
  assert.doesNotMatch(tag, /viewerName=/);
  assert.match(PAGE, /const \[dueDialogMode, setDueDialogMode\] = useState\("commit"\);/);
  assert.match(PAGE, /const closeDueDialog = \(\) => \{ setDueDialogOpen\(false\); setDueDialogMode\("commit"\); \};/);
  // ทรงเลื่อนวันตั้งได้ที่เดียว (ปุ่มเลื่อนของงานโต๊ะ) — ปุ่มหลักเปิดทรงตั้งต้นเสมอ
  assert.equal((PAGE.match(/setDueDialogMode\("reschedule"\)/g) || []).length, 1);
  assert.equal((PAGE.match(/setDueDialogMode\(/g) || []).length, 2);
  assert.match(PAGE, /onClick: \(\) => setDueDialogOpen\(true\),/);
});

/* ══ D-3 หน้าคำร้องแบบไทม์ไลน์ ═══════════════════════════════════════════════════════════ */

test('🔴 D-3 แถบแจ้งเหนือตาราง: วาดจาก `zones.drawingBanner` · ปุ่มอยู่หลัง `action.ready` เท่านั้น · พิมพ์ `note` ของ lib ไม่พิมพ์ประโยคเอง', () => {
  assert.match(VIEW, /\{zones\.drawingBanner \? <SurveyDrawingBanner banner=\{zones\.drawingBanner\} onConfirm=\{onDrawingConfirm\} \/> : null\}/);
  // อยู่เหนือตารางที่มันพูดถึง
  assert.ok(VIEW.indexOf('<SurveyDrawingBanner banner={zones.drawingBanner}') < VIEW.indexOf('<ZonesTable zones={zones} />'));
  const banner = VIEW.slice(VIEW.indexOf('export function SurveyDrawingBanner'), VIEW.indexOf('function ZonesTable'));
  assert.match(banner, /const confirm = banner\.action\?\.ready === true && typeof onConfirm === "function" \? banner\.action : null;/);
  assert.match(banner, /action=\{confirm \? \(/, 'ไม่มี confirm = ไม่มีปุ่มเลย (ไม่ใช่ปุ่มจาง)');
  assert.equal((VIEW.match(/\.action\?\.ready/g) || []).length, 1);
  assert.match(banner, /<StatusNotice\s+tone="info"/);
  // วลีที่ห้ามตัดกลางมาจาก lib (`banner.keep`) · ไม่มี = ทางเดิม (S2b แก้หลังตรวจจอ sales รอบ 27/10)
  assert.match(banner, /\{banner\.keep\?\.length \? keepPhrases\(banner\.text, banner\.keep\) : thaiText\(banner\.text\)\}/);
  assert.match(banner, /\{banner\.note \? <span className=\{styles\.bannerNote\}>\{thaiText\(banner\.note\)\}<\/span> : null\}/);
  // ไม่มีจอไหนของกลุ่มนี้พิมพ์ประโยค N26 หรือชื่อปุ่มของงวด S5 เอง
  for (const [name, src] of SCREENS) {
    assert.ok(!src.includes(SURVEY_CONFIRM_PENDING_NOTE), name);
    assert.doesNotMatch(src, /ขอยืนยันหน้างาน|จะเปิดใช้ในรอบถัดไป/, name);
  }
  // เปลือกยังไม่ส่งตัวกดของปุ่ม (งวด S5) ⇒ ต่อให้สวิตช์เปิด ก็ไม่มีปุ่มที่กดแล้วไม่เกิดอะไร
  assert.doesNotMatch(PAGE, /onDrawingConfirm/);

  // ค่าที่จอวาด: ใบจากแบบที่ส่งผลแล้ว (ต้องยืนยัน) = ประโยค + บรรทัดรอง · งวดนี้ปุ่มยังไม่พร้อม
  const needed = job(desk({ ...SENT, surveyConfirm: 'needed' })).zones.drawingBanner;
  assert.equal(needed.text, 'มี 3 พื้นที่ที่ประเมินจากแบบ — ใช้ตัวเลขเสนอราคาได้เลย · เมื่อพื้นที่พร้อม กด “ขอยืนยันหน้างาน” เพื่อให้ TS เข้าวัดจริง');
  assert.equal(needed.note, SURVEY_CONFIRM_PENDING_NOTE);
  assert.equal(needed.action.ready, SURVEY_CONFIRM_ACTION_READY);
  assert.equal(SURVEY_CONFIRM_ACTION_READY, false, 'งวด S2b: ปุ่มของฝ่ายขายยังไม่มี');
  const notNeeded = job(desk({ ...SENT, surveyConfirm: 'not_needed' })).zones.drawingBanner;
  assert.equal(notNeeded.text, 'มี 3 พื้นที่ที่ประเมินจากแบบ — TS แจ้งว่าไม่ต้องยืนยันหน้างาน ใช้ผลนี้เป็นผลสุดท้าย');
  assert.equal(notNeeded.action, null);
  assert.equal(notNeeded.note, undefined);
  // ใบผสมนับเฉพาะพื้นที่จากแบบ · ยังไม่ส่งผล / ใบลงหน้างาน = ไม่มีแถบ
  assert.match(job(mixed({ ...SENT, surveyConfirm: 'needed' })).zones.drawingBanner.text, /^มี 1 พื้นที่ที่ประเมินจากแบบ/);
  assert.equal(job(desk({ ...PROMISED, surveyConfirm: 'needed' })).zones.drawingBanner, null);
  assert.equal(job(onsite({ ...SENT, surveyConfirm: 'needed' })).zones.drawingBanner, null);
});

test('D-3 แถวของตาราง: ป้าย "จากแบบ" ใต้ชื่อ (ผ่าน SurveyMethodChip · ไม่ส่งชนิด) · คำของแถวที่ถูกเพิ่ม · ช่องรูป "แบบ n" — ใบลงหน้างานได้ช่องเดิม', () => {
  assert.match(VIEW, /import SurveyMethodChip from "@\/components\/service\/SurveyMethodChip";/);
  // คีย์ของป้ายถูกแกะบนบรรทัดที่ไม่มีสตริง (ตัวนับของ badgeFamilies) แล้วส่งเป็นคำให้ป้าย
  assert.match(VIEW, /function MethodTag\(\{ row \}\) \{\s*const \{ chip: methodLabel \} = row;\s*return <SurveyMethodChip label=\{methodLabel\} className=\{styles\.methodTag\} \/>;\s*\}/);
  // ป้ายอยู่ในเซลล์แรก (จอแคบ = หัวการ์ดของพื้นที่) ถัดจากบรรทัดรอง
  const firstCell = VIEW.slice(VIEW.indexOf('<td data-label="พื้นที่">'), VIEW.indexOf('<Cell label="ชั้น">'));
  assert.match(firstCell, /<\/span>\s*<MethodTag row=\{row\} \/>\s*<\/td>/);
  assert.match(firstCell, /\{row\.addedLabel \? ` · \$\{row\.addedLabel\}` : ""\}/);
  assert.doesNotMatch(VIEW, /row\.added \?|" · เพิ่มหน้างาน"/, 'คำของแถวที่ถูกเพิ่มมาจาก lib');
  assert.match(VIEW, /row\.photosText \?\? \(row\.cut \? naText\(null\) : row\.photosWide == null \? "ไม่ทราบ" : `ภาพกว้าง \$\{row\.photosWide\} · ผัง \$\{row\.photosPlan\}`\)/);
  assert.match(VIEW, /\(zones\.photosTotalText \?\? \(photos\.wide == null \? "ไม่ทราบ" : `ภาพกว้าง \$\{photos\.wide\} · ผัง \$\{photos\.plan\}`\)\)/);
  assert.match(rule(VIEW_CSS, '.methodTag'), /margin-top: var\(--space-1\);/);

  // ค่าที่จอวาด — ใบจากแบบทั้งใบที่ส่งผลแล้ว (มีภาพแบบหนึ่งรูปที่พื้นที่แรก)
  const plan = { docType: 'survey_plan', mimeType: 'image/png', fileName: 'plan.png', metadata: {} };
  const sent = job(desk({ ...SENT, surveyConfirm: 'needed', surveyFilesByZone: { z1: [plan] } })).zones;
  assert.deepEqual(sent.rows.map((row) => row.chip), [SURVEY_METHOD_CHIP.drawing, SURVEY_METHOD_CHIP.drawing, SURVEY_METHOD_CHIP.drawing]);
  assert.equal(SURVEY_METHOD_CHIP.drawing, 'จากแบบ');
  assert.deepEqual(sent.rows.map((row) => row.addedLabel), [null, 'เพิ่มโดย TS', null]);
  assert.deepEqual(sent.rows.map((row) => row.photosText), ['แบบ 1', 'แบบ 0', 'แบบ 0']);
  assert.equal(sent.photosTotalText, 'แบบ 1');
  // ใบผสม: ป้ายเฉพาะแถวจากแบบ · แถวรวมพูดสองภาษา
  const mix = job(mixed({ ...SENT, surveyConfirm: 'needed' })).zones;
  assert.deepEqual(mix.rows.map((row) => row.chip), [null, null, 'จากแบบ']);
  assert.deepEqual(mix.rows.map((row) => row.photosText), [null, null, 'แบบ 0']);
  assert.equal(mix.photosTotalText, 'ภาพกว้าง 0 · ผัง 0 · แบบ 0');
  // 🔴 ใบลงหน้างานล้วน: ทุกคีย์ว่าง ⇒ ป้ายไม่ถูกวาด · ช่องรูปเดิม · คำ "เพิ่มหน้างาน" เดิม
  const old = job(onsite(SENT)).zones;
  assert.deepEqual(old.rows.map((row) => [row.chip, row.photosText]), [[null, null], [null, null], [null, null]]);
  assert.deepEqual(old.rows.map((row) => row.addedLabel), [null, 'เพิ่มหน้างาน', null]);
  assert.equal(old.photosTotalText, null);
});

/* ── ตารางของใบที่ยังไม่ส่งผล เดินตามวิธี (มติเจ้าของ 12/10 · S2b-followups ข้อ 2 · UAT ผู้วางคิวข้อ 9 / ฝ่ายขายข้อ 10) ──
   ใบจากแบบทั้งใบเคยมีคอลัมน์ "ภาพกว้าง" (ขีดทุกแถว) กับ "หน้างาน" (ว่างทุกแถว) ⇒ ทรงของตารางย้ายไปอยู่ที่ `zones.table`
   🔴 ใบลงหน้างานล้วนต้องได้ตารางของวันนี้ตรงตัว — ตรึงสองชั้น: (1) ห้าบรรทัดที่เปลี่ยน เมื่อแทนคีย์ใหม่ด้วยค่าของใบลงหน้างาน
      ต้องได้บรรทัดของ main (`070bfcde`) ทุกตัวอักษร (2) ค่าของคีย์พวกนั้นบนใบลงหน้างานจริงคือค่าที่ใช้แทน */
const ZONES_TABLE = VIEW.slice(VIEW.indexOf('function ZonesTable('), VIEW.indexOf('function GateCard('));
const TABLE_LINES = [   // [บรรทัดของ main, บรรทัดของวันนี้]
  ['{!sent && <th className="num">ภาพกว้าง</th>}', '{table.wideColumn && <th className="num">ภาพกว้าง</th>}'],
  ['<th>{sent ? "รูป" : "หน้างาน"}</th>', '<th>{table.lastLabel}</th>'],
  ['{!sent && <Cell label="ภาพกว้าง" num>{photoText(row.photosWide)}</Cell>}', '{table.wideColumn && <Cell label="ภาพกว้าง" num>{row.wideText ?? photoText(row.photosWide)}</Cell>}'],
  ['<Cell label={sent ? "รูป" : "หน้างาน"}>', '<Cell label={table.lastLabel}>'],
  ['{!sent && <Cell label="ภาพกว้าง" num>{photoText(photos.wide)}</Cell>}', '{table.wideColumn && <Cell label="ภาพกว้าง" num>{photoText(table.wideTotal)}</Cell>}'],
];
/* ค่าของคีย์ใหม่บนใบลงหน้างานล้วน เขียนเป็นนิพจน์ของ main — แต่ละคู่ถูกพิสูจน์ด้วยค่าจริงในเทสต์ข้อ "ใบลงหน้างานล้วน" ข้างล่าง */
const ON_SITE_VALUE = [
  ['table.wideColumn', '!sent'],
  ['table.lastLabel', 'sent ? "รูป" : "หน้างาน"'],
  ['row.wideText ?? ', ''],
  ['table.wideTotal', 'photos.wide'],
];
const asOnSite = (line) => ON_SITE_VALUE.reduce((text, [key, value]) => text.replaceAll(key, value), line);

test('🔴 D-3 ตารางที่ยังไม่ส่งผล (มติ 12/10): จอถามทรงจาก `zones.table` อย่างเดียว — คอลัมน์ภาพกว้างสามจุดเปิดปิดพร้อมกัน · หัวคอลัมน์สุดท้ายกับ data-label เป็นคำเดียวกัน', () => {
  assert.ok(ZONES_TABLE.length > 2000, 'หา ZonesTable ไม่เจอ');
  assert.match(ZONES_TABLE, /const \{ rows, sent, totals, photos, table \} = zones;/);
  for (const [main, now] of TABLE_LINES) {
    assert.equal(ZONES_TABLE.split(now).length - 1, 1, `ต้องมีบรรทัดนี้ที่เดียว: ${now}`);
    assert.ok(!ZONES_TABLE.includes(main), `บรรทัดของ main ต้องไม่เหลือคู่กับบรรทัดใหม่: ${main}`);
    // 🔴 ใบลงหน้างานล้วน: แทนคีย์ใหม่ด้วยค่าของมันแล้ว = บรรทัดของ main ทุกตัวอักษร
    assert.equal(asOnSite(now), main);
  }
  // หัว · เซลล์ของแถว · เซลล์ของแถวรวม — สามจุดถามธงตัวเดียว (ไม่งั้นหัวกับเซลล์เหลื่อมกันหนึ่งคอลัมน์)
  assert.equal((ZONES_TABLE.match(/table\.wideColumn &&/g) || []).length, 3);
  assert.equal((ZONES_TABLE.match(/table\.wideColumn/g) || []).length, 3);
  // หัวคอลัมน์สุดท้าย + ป้ายของเซลล์บนจอแคบ (`data-label` — ตาราง ≤ 680px ไม่มีหัว) อ่านคำเดียวกัน
  assert.equal((ZONES_TABLE.match(/table\.lastLabel/g) || []).length, 2);
  // (S2b แก้หลังตรวจจอ head-r3-12) `data-long-label` = ป้ายยาวขึ้นบรรทัดของตัวเองบนจอแคบ — ป้ายยังมาจาก `label` ตัวเดียว
  assert.match(VIEW, /<td data-label=\{label\} data-long-label=\{longLabel \? "1" : undefined\} className=\{isNum \? "num" : undefined\}>/, 'Cell ส่ง label ลง data-label');
  // ช่องสุดท้ายของแถวที่ยังไม่ส่งผล: จำนวนภาพแบบของแถวจากแบบต่อจากป้ายสถานะ — แถวลงหน้างานได้ null = ไม่วาดอะไรเพิ่ม
  assert.match(ZONES_TABLE, /\{row\.missingText \? <span className=\{styles\.miss\}>\{row\.missingText\}<\/span> : null\}\s*\{row\.planText\}\s*<\/>/);
  assert.equal((ZONES_TABLE.match(/row\.planText/g) || []).length, 1);
  assert.equal((ZONES_TABLE.match(/row\.wideText/g) || []).length, 1);
  // จอไม่พิมพ์คำของวิธีนี้เอง และไม่ตัดสินจากสัดส่วนวิธีเอง — หัว "แบบ" · ขีด · "แบบ n" มาจาก lib
  assert.doesNotMatch(ZONES_TABLE, /"แบบ"|>แบบ<|`แบบ |mix\b|deskJob|needsVisit/);
  // แถวรวมของตารางที่ยังไม่ส่งผลยังเป็นช่องของหัวหน้า (ไม่ได้อยู่ในมตินี้)
  assert.match(ZONES_TABLE, /<Cell label=\{sent \? "รูป" : "หัวหน้า"\}>/);
});

test('D-3 ตารางที่ยังไม่ส่งผล · ค่าที่จอวาด: จากแบบทั้งใบ = ไม่มีภาพกว้าง หัว "แบบ" · ผสม = คอลัมน์เดิม แถวจากแบบขีดทั้งสองช่อง · ส่งแล้ว = ตารางผลเดิม', () => {
  const wide = { docType: 'survey_wide', mimeType: 'image/jpeg', fileName: 'wide.jpg', metadata: {} };
  const plan = { docType: 'survey_plan', mimeType: 'image/png', fileName: 'plan.png', metadata: {} };
  const cells = (z) => z.rows.map((row) => [row.wideText, row.planText]);
  for (const [who, viewer] of [['ฝ่ายขาย', SALES], ['หัวหน้า', HEAD], ['ผู้วางคิว', { canWork: true }]]) {
    // จากแบบทั้งใบ — ทุกขั้นก่อนส่งผล (รอรับปาก · รับปากแล้ว)
    for (const over of [{}, PROMISED]) {
      const z = job(desk({ ...over, surveyFilesByZone: { z1: [plan], z2: [wide] } }), viewer).zones;
      assert.deepEqual(z.table, { wideColumn: false, wideTotal: null, lastLabel: 'แบบ' }, who);
      assert.deepEqual(cells(z), [['—', 'แบบ 1'], ['—', '—'], ['—', '—']], who);
    }
    // ผสม — พื้นที่ที่สามจากแบบ (มีภาพกว้างค้างหนึ่งรูป: แถวพิมพ์ขีด แถวรวมไม่นับ)
    const mix = job(mixed({ ...PROMISED, surveyFilesByZone: { z1: [wide, wide], z3: [wide, plan, plan] } }), viewer).zones;
    assert.deepEqual(mix.table, { wideColumn: true, wideTotal: 2, lastLabel: 'หน้างาน' }, who);
    // ช่องสุดท้ายของใบผสมชื่อ "หน้างาน" — แถวจากแบบขีด (มติ 12/10 ข้อ 2) ไม่ใช่ "แบบ 2" ใต้ป้ายหน้างาน
    assert.deepEqual(cells(mix), [[null, null], [null, null], ['—', '—']], who);
    // ส่งผลแล้ว — ตารางผลของงวด S2b ทุกวิธี (ช่องรูป "แบบ n" เดิม · ไม่มีคีย์ของตารางที่ยังทำอยู่)
    for (const request of [desk({ ...SENT, surveyConfirm: 'needed' }), mixed({ ...SENT, surveyConfirm: 'needed' }), onsite(SENT)]) {
      const z = job(request, viewer).zones;
      assert.deepEqual(z.table, { wideColumn: false, wideTotal: null, lastLabel: 'รูป' }, who);
      assert.deepEqual(cells(z), [[null, null], [null, null], [null, null]], who);
    }
  }
});

test('🔴 D-3 ตารางที่ยังไม่ส่งผล · ใบลงหน้างานล้วน: คีย์ใหม่มีค่าเท่านิพจน์ของ main ทุกขั้น ทุกคนดู — ตารางของวันนี้ไม่ขยับ (สวิตช์เปิดหรือปิดก็ใบเดียวกัน)', () => {
  const wide = { docType: 'survey_wide', mimeType: 'image/jpeg', fileName: 'wide.jpg', metadata: {} };
  const plan = { docType: 'survey_plan', mimeType: 'image/png', fileName: 'plan.png', metadata: {} };
  const files = { z1: [wide, wide, plan], z2: [wide] };
  const visit = (status) => ({ id: 'v1', code: 'SV-26100011', status, scheduledDate: '2026-10-13', startTime: '10:00:00', assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', assistantIds: [] });
  const requests = {
    'รอรับเรื่อง': onsite({ status: 'pending', acknowledgedAt: null }),
    'รอลงคิว': onsite(),
    'นัดแล้ว': onsite({ ...PROMISED, surveyVisit: visit('scheduled') }),
    'กำลังวัด': onsite({ ...PROMISED, surveyVisit: visit('in_progress') }),
    'ช่างส่งงานแล้ว': onsite({ ...PROMISED, surveyVisit: visit('done') }),
    'ส่งผลแล้ว': onsite({ ...SENT, surveyVisit: visit('done') }),
    'อ่านรูปไม่สำเร็จ': onsite({ ...PROMISED, surveyVisit: visit('scheduled'), surveyUnknown: { files: true } }),
    'แถวพก method onsite': onsite({ ...PROMISED, surveyZones: zones({ method: 'onsite' }) }),
    'แถวพก method null': onsite({ ...PROMISED, surveyZones: zones({ method: null }) }),
    // ธงที่ตัวโหลดคำร้องติดมาเมื่อใบต้องมีนัด — หน้านี้ไม่อ่านสวิตช์ของงานนี้เอง (ยามของ surveyMethodGuards.test.mjs: สวิตช์ SURVEY_DRAWING_METHOD ถูกอ่านใต้ src/app/api เท่านั้น)
    'ตัวโหลดติดธงต้องมีนัด': onsite({ ...PROMISED, surveyNeedsVisit: true, surveyVisit: visit('scheduled') }),
    'ตัดออกหนึ่งพื้นที่': onsite({ ...PROMISED, surveyZones: zones().map((z, i) => (i === 1 ? { ...z, status: 'cut', cutReason: 'ลูกค้าไม่เอาแล้ว' } : z)) }),
  };
  for (const [name, request] of Object.entries(requests)) {
    for (const [who, viewer] of [['ฝ่ายขาย', SALES], ['หัวหน้า', HEAD], ['ผู้วางคิว', { canWork: true }]]) {
      const z = job({ ...request, surveyFilesByZone: files }, viewer).zones;
      const at = `${name} · ${who}`;
      // คู่ของ ON_SITE_VALUE ทีละตัว: ค่าจริงของคีย์ใหม่ = นิพจน์ของ main ที่ถูกใช้แทน
      assert.equal(z.table.wideColumn, !z.sent, at);
      assert.equal(z.table.lastLabel, z.sent ? 'รูป' : 'หน้างาน', at);
      for (const row of z.rows) assert.equal(row.wideText ?? 'เดิม', 'เดิม', at);      // `row.wideText ?? ` ตกไปที่ตัวนับเดิมทุกแถว
      // ภาพกว้างรวมถูกอ่านเฉพาะหลังธงคอลัมน์ (ตารางที่ยังไม่ส่งผล) — ที่นั่นเท่า `photos.wide` ตัวเดิม (รวม null = ไม่ทราบ)
      if (z.table.wideColumn) assert.equal(z.table.wideTotal, z.photos.wide, at);
      // `{row.planText}` ไม่วาดอะไรบนแถวลงหน้างาน
      assert.deepEqual(z.rows.map((row) => row.planText), z.rows.map(() => null), at);
    }
  }
  // ตัวเลขจริงของหนึ่งใบ กันเทสต์ผ่านเพราะสองฝั่งว่างเท่ากัน
  assert.deepEqual(job({ ...requests['นัดแล้ว'], surveyFilesByZone: files }).zones.table, { wideColumn: true, wideTotal: 3, lastLabel: 'หน้างาน' });
  assert.equal(job({ ...requests['อ่านรูปไม่สำเร็จ'], surveyFilesByZone: files }).zones.table.wideTotal, null);
});

test('D-3 การ์ดด่าน: ใบจากแบบทั้งใบไม่วาดการ์ดฝั่งช่าง การ์ดฝั่งหัวหน้ากินทั้งแถว · ใบผสม/ลงหน้างานได้สองการ์ดเดิม', () => {
  const gates = VIEW.slice(VIEW.indexOf('<div className={styles.gates}'), VIEW.indexOf('{zones.sent ? (\n            <p className={styles.changeLine}'));
  assert.match(gates, /<div className=\{styles\.gates\} data-single=\{zones\.crewGate\.hidden \? "1" : undefined\}>/);
  assert.match(gates, /\{zones\.crewGate\.hidden \? null : \(\s*<GateCard icon=\{Route\} title=\{`ฝั่งช่าง · \$\{zones\.crewGate\.labels\.join\(" · "\)\}`\} gate=\{zones\.crewGate\} \/>\s*\)\}/);
  assert.equal((gates.match(/<GateCard /g) || []).length, 2);
  assert.match(rule(VIEW_CSS, '.gates[data-single]'), /grid-template-columns: minmax\(0, 1fr\);/);

  assert.equal(job(desk(PROMISED)).zones.crewGate.hidden, true);
  assert.equal(job(mixed(PROMISED)).zones.crewGate.hidden, false);
  assert.equal(job(onsite(PROMISED)).zones.crewGate.hidden, false);
});

test('🔴 D-3 บล็อกเอกสาร: วาดจาก `job.document` อย่างเดียว — ใบที่มีพื้นที่จากแบบได้บล็อกของใบลงหน้างาน (งวด S3 ถอดข้อพักเอกสาร)', () => {
  assert.equal((VIEW.match(/<DocumentBlock\b/g) || []).length, 1);
  assert.match(VIEW, /\{job\.document \? <DocumentBlock doc=\{job\.document\} sheetHref=\{surveyHref\} onRefresh=\{onRefresh\} \/> : null\}/);
  // จอไม่มีประโยคของตัวเองเรื่องออกเอกสาร (ทั้งชวนกดและทวงหัวหน้า) และไม่รู้จักวิธีประเมินของใบ — ทุกคำมาจาก lib
  assert.doesNotMatch(VIEW, /ออกเอกสาร|แจ้งหัวหน้า|drawingHold|SURVEY_SEND_PAPER_HOLD|hasDrawing/);
  const block = VIEW.slice(VIEW.indexOf('function DocumentBlock('), VIEW.indexOf('export default function SurveyRequestView'));
  assert.match(block, /\{doc\.text \? <StatusNotice tone=\{doc\.text\.tone\}>\{doc\.text\.text\}<\/StatusNotice> : null\}/);
  assert.match(block, /const hasActions = doc\.buttons\.length > 0 \|\| !!sheetLink \|\| !!doc\.foot;/);
  assert.match(block, /const sheetLink = doc\.sheetLink && sheetHref;/);

  // ใบที่ส่งผลไปตอนเอกสารถูกพัก = "ยังไม่มีเอกสาร" เหมือนใบอื่น: หัวหน้าถูกชี้ไปกดออกเอกสาร (+ ลิงก์) · ฝ่ายขายทวงหัวหน้าในเธรด
  const surveyDocument = { access: { customer: true }, state: 'missing', current: null, storeAllowed: true };
  const headDocument = { access: { customer: true, internal: true, issue: true, history: true }, state: 'missing', current: null, storeAllowed: true };
  for (const [who, viewer, doc] of [['ฝ่ายขาย', SALES, surveyDocument], ['หัวหน้า', HEAD, headDocument]]) {
    const today = job(onsite({ ...SENT, surveyDocument: doc }), viewer).document;
    for (const request of [desk({ ...SENT, surveyDocument: doc }), mixed({ ...SENT, surveyDocument: doc })]) {
      assert.deepEqual(job(request, viewer).document, today, who);
    }
  }
  const sales = job(desk({ ...SENT, surveyDocument }), SALES).document;
  assert.deepEqual(sales.text, { tone: 'info', text: 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร (เขียนในเธรดด้านล่างได้)' });
  assert.deepEqual([sales.buttons.length, sales.sheetLink], [1, false]);
  const head = job(mixed({ ...SENT, surveyDocument: headDocument }), HEAD).document;
  assert.deepEqual(head.text, { tone: 'info', text: 'ยังไม่มีเอกสารของใบนี้ — กด “ออกเอกสาร” ที่ใบประเมิน' });
  assert.equal(head.sheetLink, true);
  // ผู้วางคิวยังไม่มีบล็อก (ไม่มีสิทธิ์เอกสาร) — ใบจากแบบไม่เปลี่ยนกติกานี้
  const PLANNER = { canWork: true };
  for (const request of [desk({ ...SENT, surveyDocument: { access: 'none', voids: null } }), mixed({ ...SENT, surveyDocument: { access: 'none', voids: null } })]) {
    assert.equal(job(request, PLANNER).document, null);
  }
});

test('D-3 ประโยคแทนปุ่มบนแถบตอนนี้: วาดจาก `stepNotes` ของเปลือก (ไม่ส่ง = ไม่มีอะไร) · หน้าของหัวข้อยังไม่ยิง API เอง', () => {
  assert.match(VIEW, /peopleLoading = false, stepNotes = \[\], onDrawingConfirm,/);
  // อยู่ในคอลัมน์ปุ่มของแถบตอนนี้ — ที่เดียวกับที่ปุ่มของก้าวนั้นจะอยู่
  const from = VIEW.indexOf('<div className={styles.nowActions}>');
  const to = VIEW.indexOf('<DetailCard\n        icon={ClipboardList}');
  assert.ok(from > 0 && to > from, 'หาแถบตอนนี้ไม่เจอ');
  const now = VIEW.slice(from, to);
  // ห่อด้วย span ตัวเดียว: `.wait` เป็น flex — ชิ้นคำที่ thaiText ซอยไว้จะกลายเป็นคอลัมน์แยกกันถ้าวางเป็นลูกตรง ๆ
  assert.match(now, /\{stepNotes\.map\(\(text\) => \(\s*<p key=\{text\} className=\{styles\.wait\} role="status"><span>\{thaiText\(text\)\}<\/span><\/p>\s*\)\)\}/);
  // จอแคบ: บรรทัดนี้กินเต็มแถวของกริดปุ่ม (กฎเดิมของ .wait)
  assert.match(VIEW_CSS, /\.nowActions > \.blocked,\s*\.nowActions > \.wait \{\s*grid-column: 1 \/ -1;/);
  assert.doesNotMatch(VIEW, /apiFetch|apiJson|method:\s*"(PATCH|POST|DELETE)"/);
});

/* ══ D-4 จอรายละเอียดรุ่นเก่า ════════════════════════════════════════════════════════════ */

test('🔴 D-4 SurveyDetail: ถาม `surveyRequestDrawingSummary` ตัวเดียว — แถบตัวเดียวกับหน้าไทม์ไลน์ (ประโยคล้วน) · ป้ายเฉพาะแถวจากแบบ · คำเดิมของแถวลงหน้างานยังอยู่', () => {
  assert.match(DETAIL, /import \{ surveyRequestDrawingSummary \} from "@\/lib\/service\/surveyJob";/);
  assert.match(DETAIL, /const summary = surveyRequestDrawingSummary\(request\);/);
  assert.equal((DETAIL.match(/surveyRequestDrawingSummary\(/g) || []).length, 1);
  // แถบ: component เดียวกับหน้าไทม์ไลน์ · ไม่ส่งตัวกด ⇒ ไม่มีปุ่มไม่ว่าสวิตช์ของ S5 จะเป็นอะไร
  assert.match(DETAIL, /import \{ SurveyDrawingBanner \} from "\.\/SurveyRequestView";/);
  assert.match(DETAIL, /\{summary\.banner \? <SurveyDrawingBanner banner=\{summary\.banner\} \/> : null\}/);
  assert.ok(DETAIL.indexOf('<SurveyDrawingBanner') < DETAIL.indexOf('<TableScroll'), 'แถบอยู่เหนือตารางพื้นที่');
  // แถว: รายการมีเฉพาะพื้นที่จากแบบ · ป้ายผ่าน SurveyMethodChip · คำของแถวที่ถูกเพิ่มมาแทนคำเดิมเฉพาะแถวนั้น
  assert.match(DETAIL, /const entry = summary\.rows\[zone\.id\] \|\| null;/);
  assert.match(DETAIL, /const \{ chip: methodLabel \} = entry \|\| \{\};/);
  assert.match(DETAIL, /const statusLabel = entry\?\.addedLabel \|\| STATUS_LABEL\[s\.status\];/);
  assert.match(DETAIL, /\{statusLabel \? ` · \$\{statusLabel\}` : ""\}/);
  assert.match(DETAIL, /<\/span>\s*<SurveyMethodChip label=\{methodLabel\} className=\{styles\.surveyMethodTag\} \/>\s*<\/td>/);
  assert.match(rule(DETAIL_CSS, '.surveyMethodTag'), /margin-top: var\(--space-1\);/);
  // 🔒 คำของแถวลงหน้างานที่ถูกเพิ่ม และบรรทัดรวม ไม่ถูกแตะ (ยามเดิมของ surveyAddZone.test.mjs)
  assert.match(DETAIL, /added: "เจ้าหน้าที่เพิ่มหน้างาน"/);
  assert.match(DETAIL, /totals\.addedZones \? <span className="cell-sub">เพิ่มหน้างาน/);

  // ค่าที่จอวาด
  const sent = surveyRequestDrawingSummary(desk({ ...SENT, surveyConfirm: 'needed' }));
  assert.deepEqual(sent.rows, {
    z1: { chip: 'จากแบบ', addedLabel: null },
    z2: { chip: 'จากแบบ', addedLabel: 'เพิ่มโดย TS' },
    z3: { chip: 'จากแบบ', addedLabel: null },
  });
  assert.deepEqual(sent.banner, job(desk({ ...SENT, surveyConfirm: 'needed' })).zones.drawingBanner, 'แถบเดียวกับหน้าไทม์ไลน์');
  assert.deepEqual(Object.keys(surveyRequestDrawingSummary(mixed(SENT)).rows), ['z3'], 'ใบผสม: เฉพาะพื้นที่จากแบบ');
  // 🔴 ใบลงหน้างานล้วน: สรุปว่าง ⇒ ไม่มีแถบ ไม่มีป้าย และทุกแถวพิมพ์ STATUS_LABEL เดิม
  assert.deepEqual(surveyRequestDrawingSummary(onsite({ ...SENT, surveyConfirm: 'needed' })), { banner: null, rows: {} });
});

test('D-4 SurveyDetail: ใบที่ประเมินจากแบบทั้งใบไม่วาดบรรทัดนัด (ธง false ตรงตัว) — ใบอื่นได้บรรทัดนัดเดิม', () => {
  assert.match(DETAIL, /const visit = request\.surveyNeedsVisit === false \? null : request\.surveyVisit \|\| null;/);
  assert.equal((DETAIL.match(/request\.surveyVisit/g) || []).length, 1, 'ทุกจุดของบรรทัดนัดอ่านตัวแปรเดียว');
  // สองบล็อกของนัด (สถานะ · เหตุที่เข้าไม่ได้) ยังอยู่หลังตัวแปรนั้น
  assert.match(DETAIL, /\{visit && \(\s*<p className=\{styles\.surveyVisit\}>/);
  assert.match(DETAIL, /\{visit\?\.status === 'unable' && visit\.unableReason && \(/);
});

/* ══ กติกาของบ้านที่ทั้งกลุ่มต้องถือ ═══════════════════════════════════════════════════════ */

test('🔴 จอของกลุ่ม D ไม่อ่านคอลัมน์วิธีของพื้นที่เอง ไม่ส่งค่าวิธีให้ป้าย และไม่มี style ฝังบรรทัดของงานนี้', () => {
  for (const [name, src] of SCREENS) {
    assert.doesNotMatch(src, /\.method\s*[!=]==/, `${name}: ถามวิธีผ่าน view-model เท่านั้น`);
    assert.doesNotMatch(src, /isDrawingZone|zoneMethod\(/, `${name}: ไม่ตัดสินวิธีเองในจอ`);
    assert.doesNotMatch(src, /<SurveyMethodChip[^>]*\b(variant|method)=/, `${name}: ป้ายของกลุ่มนี้เป็นหน้าตา "จากแบบ" ตั้งต้นเสมอ`);
  }
  for (const [name, src] of [['CommitDueDialog', DIALOG], ['SurveyRequestView', VIEW], ['SurveyDetail', DETAIL]]) {
    assert.doesNotMatch(src, /style=\{\{/, name);
  }
  // คลาสใหม่ทุกตัวใช้โทเคน — ไม่มีสีดิบ ไม่มี line-height ดิบ
  for (const [sheet, selectors] of [
    [DIALOG_CSS, ['.wishLine']],
    [VIEW_CSS, ['.methodTag', '.bannerNote', '.bannerAction', '.gates[data-single]']],
    [DETAIL_CSS, ['.surveyMethodTag']],
  ]) {
    for (const selector of selectors) {
      assert.doesNotMatch(rule(sheet, selector), /#[0-9a-fA-F]{3,8}\b|rgba?\(|line-height: [\d.]/, selector);
    }
  }
  // ปุ่มบนแถบแจ้ง (เมื่อถึงงวดของมัน): เป้ากด 44px บนจอสัมผัสและจอแคบ
  assert.match(VIEW_CSS, /@media \(pointer: coarse\) \{\s*\.bannerAction \{\s*min-height: var\(--ctl-h-touch\);/);
});
