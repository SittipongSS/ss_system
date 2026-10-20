// ── ประเมินจากแบบ งวด 4 (S4 กลุ่ม C) — หน้าคำร้องฝั่งฝ่ายขาย: บรรทัด "ฝ่ายขายขอ" · วันที่อยากให้เข้า · ร่างของหน้า ──
//
// ⭐ `variant` = สิ่งที่ฝ่ายขายขอ ไม่ใช่วิธีปัจจุบัน — ขั้น/ราง/ด่านอ่านแถวพื้นที่ (`surveyNeedsVisit`) เหมือนเดิม
//    ไฟล์นี้ตรึงแค่ถ้อยคำที่ "ฝ่ายขายขออะไร" แตะ: บรรทัดของขั้นร่าง · ช่อง "ผู้ขอ: วันที่ต้องการให้เข้าพื้นที่" ·
//    บรรทัดรองของขั้น "รอลงคิว" · ช่องเดียวกันบนหัวใบ (`requestHeaderFacts`)
// 🔴 ใบที่ยื่นเป็นประเมินจากแบบเก็บ `requestedDueDate` = กระจกของวันรับผล ⇒ ต้องไม่มีจอไหนอ่านค่านั้นเป็นวันที่อยากให้เข้า
//    (ใบที่หัวหน้าสลับกลับเป็นลงหน้างานจะขึ้น "ขอเข้า …" ด้วยวันรับผลที่ไม่มีใครขอ)
// 🔴 ใบลงหน้างาน + แถวเก่าที่ไม่มีคีย์ `variant` = ค่าของวันนี้ทุกตัวอักษร (ทองคำ: เทียบกับแถวเดียวกันที่ถอดคีย์ออก
//    + ถ้อยคำตรงตัวของวันนี้ · ก้อนเต็มของใบลงหน้างานถูกตรึงอีกชั้นที่ `surveyMethodGolden.test.mjs`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyIntakeSwitchNotes, surveyJobView } from './surveyJob.js';
import {
  SURVEY_INTAKE_REMEASURE_CHIP, SURVEY_INTAKE_SWITCH_NOTE, SURVEY_INTAKE_SWITCH_REASON,
  SURVEY_NO_VISIT_WISH_LINE, SURVEY_NO_VISIT_WISH_TEXT, SURVEY_SALES_ASKED,
} from './surveyIntake.js';
import { requestHeaderFacts } from '../requests/headerFacts.js';
import { REQUEST_KIND_LIST } from '../master/requestTypes.js';

const TODAY = '2026-10-15';
const NOW = new Date('2026-10-15T05:00:00Z');
const VIEWER = { isOpener: true, isRequesterSide: true };
const OLD_SHEET = 'ใบเก่าที่เปิดก่อนกติกาบังคับวัน';

const baseZones = () => ([
  { id: 'z1', zoneName: 'Lobby ชั้น 1', zoneFloor: '01', status: 'ok', parts: [], spots: [] },
  { id: 'z2', zoneName: 'ห้องประชุม ชั้น 2', zoneFloor: '02', status: 'ok', parts: [], spots: [] },
]);
// หัวหน้าสลับพื้นที่ (ตัวเขียนของแผนสลับวิธีประทับสองช่องนี้)
const SWITCH_STAMP = { methodReason: 'ลูกค้าไม่มีแบบ ต้องเข้าไปวัด', methodChangedAt: '2026-10-14T03:00:00Z' };

/* สี่รูปของใบ — ทุกใบเป็นประเมินพื้นที่ ส่งถึง TS
   · standard: ลงหน้างาน ขอเข้า อ. 20 ต.ค. 09:00 · ขอผล พฤ. 22 ต.ค.
   · drawing-desk: ยื่นเป็นประเมินจากแบบ · ทุกพื้นที่จากแบบ · `requestedDueDate` = กระจกของวันรับผล ไม่มีเวลา
   · drawing-switched: ยื่นเป็นประเมินจากแบบ แต่หัวหน้าสลับทุกพื้นที่กลับเป็นลงหน้างาน (กระจกยังอยู่ในคอลัมน์)
   · legacy: แถวก่อน mig 0351 ไม่มีคีย์ `variant` เลย — ต้องอ่านเหมือน standard */
const SHAPES = {
  standard: {
    variant: 'standard', requestedDueDate: '2026-10-20', requestedDueTime: '09:00:00', requestedResultDate: '2026-10-22',
    surveyZones: baseZones(), surveyNeedsVisit: true,
  },
  'drawing-desk': {
    variant: 'drawing', requestedDueDate: '2026-10-22', requestedDueTime: null, requestedResultDate: '2026-10-22',
    surveyZones: baseZones().map((z) => ({ ...z, method: 'drawing' })), surveyNeedsVisit: false,
  },
  'drawing-switched': {
    variant: 'drawing', requestedDueDate: '2026-10-22', requestedDueTime: null, requestedResultDate: '2026-10-22',
    surveyZones: baseZones().map((z) => ({ ...z, method: 'onsite', ...SWITCH_STAMP })), surveyNeedsVisit: true,
  },
  legacy: {
    requestedDueDate: '2026-10-20', requestedDueTime: '09:00:00', requestedResultDate: '2026-10-22',
    surveyZones: baseZones(), surveyNeedsVisit: true,
  },
};
const STATUSES = {
  draft: { status: 'draft', submittedAt: null },
  pending: { status: 'pending', submittedAt: '2026-10-13T02:00:00Z' },
  acknowledged: {
    status: 'acknowledged', submittedAt: '2026-10-13T02:00:00Z',
    acknowledgedAt: '2026-10-13T04:00:00Z', acknowledgedByName: 'Arnon Aunsapwilai',
  },
  answered: {
    status: 'answered', submittedAt: '2026-10-13T02:00:00Z',
    acknowledgedAt: '2026-10-13T04:00:00Z', acknowledgedByName: 'Arnon Aunsapwilai',
    committedDueDate: '2026-10-21', committedResultDate: '2026-10-22', dueCommittedAt: '2026-10-13T05:00:00Z',
    answeredAt: '2026-10-14T03:00:00Z', answeredByName: 'Arnon Aunsapwilai',
  },
};
const row = (shape, status) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', docNo: status === 'draft' ? null : 'RQ-AS-26100401',
  team: 'SV', requestedByName: 'Lalida Chaiwanna', assigneeId: 'u-head', assigneeName: 'Arnon Aunsapwilai',
  committedDueDate: null, committedResultDate: null, surveyVisit: null, surveyFilesByZone: {},
  ...SHAPES[shape], ...STATUSES[status],
});
const withoutVariant = (request) => {
  const copy = { ...request };
  delete copy.variant;
  return copy;
};
const job = (request) => surveyJobView({ request, today: TODAY, viewer: VIEWER });
const draftLines = (view) => view.steps.find((s) => s.id === 'draft').lines.map((l) => l.text);
const jobFact = (view, key) => view.facts.find((f) => f.key === key) || null;
const headerFact = (request, key) => requestHeaderFacts(request, { now: NOW }).find((f) => f.key === key) || null;

/* ── 1) ทองคำ: ใบลงหน้างาน + แถวเก่า = ของวันนี้ ─────────────────────────────────── */
test('🔴 ทองคำ — ใบลงหน้างานและแถวเก่า: ทุกค่าที่ surveyJobView / requestHeaderFacts คืน = แถวเดียวกันที่ถอดคีย์ variant ออก', () => {
  for (const shape of ['standard', 'legacy']) {
    for (const status of Object.keys(STATUSES)) {
      const request = row(shape, status);
      assert.deepEqual(job(request), job(withoutVariant(request)), `${shape} · ${status} · surveyJobView`);
      assert.deepEqual(
        requestHeaderFacts(request, { now: NOW }),
        requestHeaderFacts(withoutVariant(request), { now: NOW }),
        `${shape} · ${status} · requestHeaderFacts`,
      );
    }
  }
  // ใบลงหน้างานกับแถวเก่า (ข้อมูลอื่นเท่ากัน) อ่านเหมือนกันทุกตัวอักษร
  for (const status of Object.keys(STATUSES)) {
    assert.deepEqual(job(row('standard', status)), job(row('legacy', status)), status);
  }
});

test('🔴 ทองคำ — ถ้อยคำของวันนี้ตรงตัว: ขั้นร่าง "ขอเข้า …" · ช่องผู้ขอ · บรรทัด "ผู้ขออยากให้เข้า …" · หัวใบ', () => {
  for (const shape of ['standard', 'legacy']) {
    for (const status of Object.keys(STATUSES)) {
      assert.deepEqual(draftLines(job(row(shape, status))), ['ขอเข้า อ. 20 ต.ค. 09:00 · ขอผล พฤ. 22 ต.ค.'], `${shape} · ${status}`);
      const fact = jobFact(job(row(shape, status)), 'requestedDue');
      assert.equal(fact.value, 'อ. 20 ต.ค. 2026 · 09:00', `${shape} · ${status}`);
      assert.equal(fact.sub, null);
      const head = headerFact(row(shape, status), 'requestedDue');
      assert.ok(head.value && head.value !== SURVEY_NO_VISIT_WISH_TEXT, `${shape} · ${status}`);
      assert.notEqual(head.sub, OLD_SHEET);
    }
    const queue = job(row(shape, 'acknowledged'));
    assert.equal(queue.stage, 'queue');
    assert.equal(queue.now.sub, 'รับเรื่องแล้วโดย Arnon Aunsapwilai · ผู้ขออยากให้เข้า อ. 20 ต.ค. 09:00');
    assert.ok(!JSON.stringify(job(row(shape, 'acknowledged'))).includes(SURVEY_SALES_ASKED.line), shape);
  }
});

/* ── 2) บรรทัดของขั้นร่าง ─────────────────────────────────────────────────────── */
test('⭐ ขั้นร่าง — ยื่นเป็นประเมินจากแบบ: "ฝ่ายขายขอ: ประเมินจากแบบ" ขึ้นบรรทัดแรก · ไม่มี "ขอเข้า" (กระจกของวันรับผลไม่ใช่วันเข้า)', () => {
  for (const shape of ['drawing-desk', 'drawing-switched']) {
    for (const status of Object.keys(STATUSES)) {
      const lines = draftLines(job(row(shape, status)));
      assert.deepEqual(lines, ['ฝ่ายขายขอ: ประเมินจากแบบ', 'ขอผล พฤ. 22 ต.ค.'], `${shape} · ${status}`);
      assert.ok(!lines.some((line) => line.includes('ขอเข้า')), `${shape} · ${status}`);
    }
  }
});

test('🔴 แถบ "ตอนนี้" ขั้นร่าง — ทุกพื้นที่จากแบบ (ธงพื้นที่ ไม่ใช่ variant) = ไม่สัญญาว่าจะลงคิวเข้าพื้นที่ · ลงหน้างานเท่าเดิมทุกตัวอักษร', () => {
  const desk = job(row('drawing-desk', 'draft'));
  assert.equal(desk.stage, 'draft');
  assert.equal(desk.now.headline, 'ยังไม่ส่งคำร้อง');
  assert.equal(desk.now.sub, 'ส่งแล้ว หัวหน้า TS จะรับเรื่องแล้วแจ้งวันส่งผล — ใบนี้ประเมินจากแบบ ไม่มีการเข้าพื้นที่');
  assert.ok(!desk.now.sub.includes('ลงคิว'));
  assert.equal(desk.now.next, 'กด “ส่งคำร้อง” เมื่อกรอกครบ');
  // golden: ลงหน้างาน · แถวเก่า · ยื่นจากแบบแต่หัวหน้าสลับกลับ (ธงพื้นที่ = ต้องเข้า) = ประโยคเดิม
  for (const shape of ['standard', 'legacy', 'drawing-switched']) {
    const view = job(row(shape, 'draft'));
    assert.equal(view.now.sub, 'ส่งแล้ว TS จะรับเรื่องและลงคิวเข้าพื้นที่', shape);
  }
});

/* ── 3) ช่อง "ผู้ขอ: วันที่ต้องการให้เข้าพื้นที่" ของงาน ────────────────────────────── */
test('⭐ ช่องผู้ขอ (dateFacts) — งานโต๊ะไม่มีช่องนี้ (กติกาเดิม) · ใบที่หัวหน้าสลับกลับเป็นลงหน้างาน = "ยังไม่ได้ระบุ" ไม่ใช่วันรับผล', () => {
  for (const status of Object.keys(STATUSES)) {
    assert.equal(jobFact(job(row('drawing-desk', status)), 'requestedDue'), null, `desk · ${status}`);
    const fact = jobFact(job(row('drawing-switched', status)), 'requestedDue');
    assert.equal(fact.value, SURVEY_NO_VISIT_WISH_TEXT, status);
    assert.equal(fact.sub, null, status);
  }
  // ⚠️ ไม่มีวันที่ขอ ⇒ บรรทัด "ตรงกับที่ขอ / ช้ากว่าที่ขอ" ใต้วันนัดหายไปเอง (ไม่เทียบกับกระจก)
  const answered = jobFact(job(row('drawing-switched', 'answered')), 'committedDue');
  const standard = jobFact(job(row('standard', 'answered')), 'committedDue');
  assert.ok(standard.sub, 'ใบลงหน้างานยังมีบรรทัดเทียบกับวันที่ขอ');
  assert.equal(answered.sub, null);
});

/* ── 4) บรรทัดรองของขั้น "รอลงคิว" ───────────────────────────────────────────────── */
test('⭐ ขั้นรอลงคิว — ใบที่ยื่นเป็นประเมินจากแบบแล้วหัวหน้าสลับกลับ: "ผู้ขออยากให้เข้า: ยังไม่ได้ระบุ (ยื่นเป็นประเมินจากแบบ) — ดูเธรด"', () => {
  const switched = job(row('drawing-switched', 'acknowledged'));
  assert.equal(switched.stage, 'queue');
  assert.equal(switched.now.sub, `รับเรื่องแล้วโดย Arnon Aunsapwilai · ${SURVEY_NO_VISIT_WISH_LINE}`);
  // งานโต๊ะไม่มีขั้นรอลงคิว — บรรทัดของมันเป็นของงวด S2a ไม่ถูกแตะ
  const desk = job(row('drawing-desk', 'acknowledged'));
  assert.equal(desk.stage, 'desk-queue');
  assert.ok(!desk.now.sub.includes('ผู้ขออยากให้เข้า'));
  assert.ok(!JSON.stringify(desk.steps).includes('ขอเข้า'));
});

/* ── 5) หัวใบ ───────────────────────────────────────────────────────────────── */
test('🔴 หัวใบ — ยื่นเป็นประเมินจากแบบ: ช่องผู้ขอ = "ยังไม่ได้ระบุ (ยื่นเป็นประเมินจากแบบ) — ดูเธรด" · sub เป็น null ไม่ใช่ "ใบเก่า…" · ไม่เทียบกับวันนัด', () => {
  for (const status of Object.keys(STATUSES)) {
    const switched = row('drawing-switched', status);
    const fact = headerFact(switched, 'requestedDue');
    assert.equal(fact.label, 'ผู้ขอ: วันที่ต้องการให้เข้าพื้นที่', status);
    assert.equal(fact.value, SURVEY_NO_VISIT_WISH_TEXT, status);
    assert.equal(fact.sub, null, status);
    assert.ok(!JSON.stringify(requestHeaderFacts(switched, { now: NOW })).includes(OLD_SHEET), status);
    // งานโต๊ะ: ธงจากตัวโหลด = ไม่มีสองช่องวันเข้าพื้นที่ (กติกางวด S2a ไม่เปลี่ยน)
    assert.equal(headerFact(row('drawing-desk', status), 'requestedDue'), null, status);
  }
  // ไม่มีธงจากตัวโหลด (ร่างที่ยังไม่มีพื้นที่) ก็ยังไม่อ่านกระจกเป็นวันเข้า
  const draft = { ...row('drawing-desk', 'draft'), surveyNeedsVisit: undefined };
  const fact = headerFact(draft, 'requestedDue');
  assert.equal(fact.value, SURVEY_NO_VISIT_WISH_TEXT);
  assert.equal(fact.sub, null);
  // วันนัดของใบที่สลับกลับ: ไม่มี "ตรงกับที่ขอ / ช้ากว่าที่ขอ" เพราะไม่มีวันที่ขอ
  const committed = headerFact(row('drawing-switched', 'answered'), 'committedDue');
  assert.equal(committed.sub, null);
  assert.ok(headerFact(row('standard', 'answered'), 'committedDue').sub, 'ใบลงหน้างานยังเทียบ');
});

test('หัวข้ออื่นที่บังเอิญถือ variant = drawing ไม่ถูกอ่านเป็นประเมินจากแบบ', () => {
  const other = { ...row('drawing-switched', 'pending'), kind: 'formula_dev' };
  const fact = headerFact(other, 'requestedDue');
  assert.notEqual(fact.value, SURVEY_NO_VISIT_WISH_TEXT);
});

/* ── 6) ยามซอร์สของหน้าคำร้อง ───────────────────────────────────────────────────── */
const PAGE = readFileSync(new URL('../../app/requests/[id]/page.js', import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '');
const CODE = stripComments(PAGE);
const between = (src, start, end) => {
  const from = src.indexOf(start);
  assert.ok(from >= 0, `ไม่พบ ${start}`);
  const to = src.indexOf(end, from + start.length);
  assert.ok(to > from, `ไม่พบ ${end} หลัง ${start}`);
  return src.slice(from, to + end.length);
};

test('ยาม: บล็อกแบบ/ผังพื้นที่วาดที่เดียวนอกฟอร์มแก้ — ซ่อนตอนฟอร์มแก้เปิด (ฟอร์มวาดบล็อกเดียวกันอยู่แล้ว)', () => {
  assert.equal(CODE.match(/<RequiredFilesBlock\b/g)?.length, 1);
  assert.match(CODE, /const requiredFilesSpec = requestRequiredFiles\(req\);/);
  const block = between(CODE, 'const requiredFilesSpec = requestRequiredFiles(req);', 'const showKindView');
  assert.match(block, /const requiredFilesCard = requiredFilesSpec && !editing \? \(/);
  assert.match(block, /<RequiredFilesBlock\b/);
  assert.match(block, /spec=\{requiredFilesSpec\}/);
  assert.match(block, /mode="saved"/);
  // ชื่อการ์ด = ป้ายของบล็อก ⇒ บล็อกในการ์ดไม่วาดป้ายซ้ำ (UAT S4 รอบ 4 ข้อ 14) · คำบรรยายยังอยู่ (ตัวบล็อกตัดสิน)
  assert.match(block, /<DetailCard icon=\{Paperclip\} eyebrow="DRAWINGS" title=\{requiredFilesSpec\.label\}>/);
  assert.match(block, /mode="saved"\n\s+hideLabel\n/);
  assert.match(block, /requestId=\{req\.id\}/);
  assert.match(block, /onCountChange=\{setRequiredFileCount\}/);
  // canEdit เดียวกับการ์ดไฟล์แนบของคำร้อง
  const canEdit = 'canEdit={(req._mine || owner) && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}';
  assert.equal(block.split(canEdit).length - 1, 2);
  // บล็อกขึ้นเหนือการ์ด "ไฟล์แนบของคำร้อง" · สองการ์ดห่อ .stack (คอลัมน์ไฟล์ของจอใบประเมินไม่มี gap) · ไม่มีบล็อก = การ์ดเดิมตัวเดียว
  assert.match(block, /const attachmentsBlock = requiredFilesCard\n\s+\? <div className=\{styles\.stack\}>\{requiredFilesCard\}\{attachmentsCard\}<\/div>\n\s+: attachmentsCard;/);
  assert.ok(block.indexOf('<RequiredFilesBlock') < block.indexOf('title="ไฟล์แนบของคำร้อง"'));
  const editCard = between(CODE, '{editDraft && (', '</DetailCard>');
  assert.doesNotMatch(editCard, /RequiredFilesBlock/);
});

test('ยาม: ฟอร์มแก้ได้ requestId · variantsOff จากสวิตช์ของ GET · variantAskedOnly · ตัวล็อกฝั่งผู้ขอรู้หัวข้อ', () => {
  const form = between(CODE, '<RequestForm\n            mode="edit"', '\n          />');
  assert.match(form, /requestId=\{req\.id\}/);
  assert.match(form, /variantsOff=\{surveyVariantsOff\(req\.drawingMethodEnabled\)\}/);
  assert.match(form, /variantAskedOnly=\{requestVariantAskedOnly\(req\)\}/);
  assert.match(form, /variantLock=\{requestVariantLock\(req\) \|\| requestVariantSideLock\(!!req\._mine, req\.kind\)\}/);
  // ฟอร์มแก้ไม่ได้รับ variantsPending (GET ของใบพาคีย์มาแล้ว)
  assert.doesNotMatch(form, /variantsPending/);
});

test('ยาม: บันทึกการแก้ไขตัด files / requiredFiles ออกจาก body ก่อนส่ง PATCH', () => {
  assert.match(CODE, /const \{ items: draftItems, files: _files, requiredFiles: _requiredFiles, \.\.\.draftRest \} = editDraft;/);
});

test('ยาม: ด่านก่อนเปิดโมดัลส่งคำร้องถาม requestSubmitGapsError ตัวเดียวกับ route — ก่อน setConfirm', () => {
  const submit = between(CODE, 'id: "submit",', 'setConfirm({ kind: "submit" });');
  assert.match(submit, /requestSubmitGapsError\(req, \{ count: requiredFileCount \}\)/);
  assert.ok(submit.indexOf('requestSubmitGapsError') < submit.indexOf('setConfirm({ kind: "submit" })'));
});

test('ยาม: confirmCopy ไม่เอ่ยชื่อหัวข้อ — ถามทะเบียน (requestVariantLockAfterSubmit) · ประโยคเปลี่ยนวิธีขึ้นเมื่อสวิตช์เปิดเท่านั้น', () => {
  const copy = between(CODE, 'const confirmCopy = () => {', '\n  };\n');
  for (const kind of REQUEST_KIND_LIST) {
    assert.ok(!copy.includes(`'${kind}'`) && !copy.includes(`"${kind}"`), kind);
  }
  // `confirm.kind === "…"` คือชนิดของโมดัล ไม่ใช่หัวข้อคำร้อง — ที่ห้ามคือเทียบ `req.kind`
  assert.doesNotMatch(copy, /req\.kind\s*[!=]==|[!=]==\s*req\.kind/);
  assert.match(copy, /requestVariantLockAfterSubmit\(req\.kind\)/);
  assert.match(copy, /req\.drawingMethodEnabled === true/);
  assert.match(copy, /requestVariantFieldLabel\(req\.kind\)/);
  // หัวข้ออื่น: สองประโยคเดิมทุกตัวอักษร (O12)
  assert.match(copy, /`\$\{submitScope\(req\)\} → \$\{req\.dept\}`/);
  assert.match(copy, /`ระบบจะออกเลขที่และแจ้งฝ่ายปลายทางทันที — หลังส่งแล้วลบใบไม่ได้\$\{switchNote\}`/);
  /* ประโยคของ S4 ขึ้นบรรทัดของตัวเอง (`\n` · รายละเอียดของกล่องยืนยันเป็น pre-line) — ต่อท้ายด้วย " · " แล้วประโยคเดิมขาด
     "ไม่|ได้" ที่ 375px (UAT S4 รอบ 4 ข้อ 13b) · หัวข้ออื่นได้ `switchNote` ว่าง ⇒ ประโยคเดิมทุกตัวอักษร (O12) */
  assert.match(copy, /const switchNote = variantLocks && req\.drawingMethodEnabled === true\n\s+\? `\\nหลังส่งแล้วเปลี่ยน\$\{requestVariantFieldLabel\(req\.kind\)\}ได้ที่ฝ่ายบริการ \(หัวหน้า TS\)`\n\s+: "";/);
  assert.doesNotMatch(copy, /u00A0· หลังส่งแล้ว/, 'ไม่ต่อท้ายบรรทัดเดิมแล้ว');
  assert.match(copy, /description: variantLocks\n\s+\? `\$\{submitScope\(req\)\} · \$\{requestVariantLabel\(req\)\} → \$\{req\.dept\}`/);
});

/* ══ UAT S4 รอบ 4 (20/10) ══════════════════════════════════════════════════════════════════════
   ข้อ 7 ราคาของการสลับบนร่าง (O8) · ข้อ 17 ป้าย "จากแบบ · รอวัดใหม่" บนตารางพื้นที่ — ตัดสินที่ view-model ไม่ใช่ที่จอ */

const DESK_RESULT = { method: 'drawing', surveyedAt: '2026-10-12T03:00:00Z', parts: [{ widthM: 10, lengthM: 4, heightM: 3 }] };

test('รอบ 4 ข้อ 7: ร่างที่หัวหน้าประเมินจากแบบไว้แล้ว — สลับเป็นลงหน้างานมีราคา (ประโยคต่อท้ายกล่องยืนยัน) · จากแบบไม่มี', () => {
  const bounced = {
    ...row('drawing-desk', 'draft'), submittedAt: '2026-10-11T02:00:00Z', docNo: 'RQ-AS-26100401',
    surveyZones: baseZones().map((z, i) => ({ ...z, method: 'drawing', ...(i === 0 ? DESK_RESULT : {}) })),
  };
  assert.deepEqual(surveyIntakeSwitchNotes(bounced), { standard: SURVEY_INTAKE_SWITCH_NOTE });
  // ไม่มีแถวจากแบบที่มีผล = ไม่มีราคา (กล่องเดิม)
  assert.deepEqual(surveyIntakeSwitchNotes(row('drawing-desk', 'draft')), {});
  // แถวลงหน้างานที่มีผล ไม่ใช่ผลจากแบบ — ทิศนี้ (เป็นจากแบบ) ตีกลับที่ server อยู่แล้ว ไม่ใช่เรื่องของประโยคนี้
  assert.deepEqual(surveyIntakeSwitchNotes({ ...row('standard', 'draft'),
    surveyZones: baseZones().map((z) => ({ ...z, method: 'onsite', surveyedAt: '2026-10-12T03:00:00Z' })) }), {});
  // ใบที่ไม่ใช่ร่าง — ฟอร์มไม่มีไทล์ให้กด ⇒ ไม่มีราคา
  for (const status of ['pending', 'acknowledged', 'answered']) {
    assert.deepEqual(surveyIntakeSwitchNotes({ ...bounced, ...STATUSES[status] }), {}, status);
  }
  assert.deepEqual(surveyIntakeSwitchNotes(null), {});
});

test('รอบ 4 ข้อ 17: แถวที่ฝ่ายขายตราให้วัดใหม่ (O8) ยังไม่ถูกวัดทับ = ป้าย "จากแบบ · รอวัดใหม่" · วัดทับแล้ว/หัวหน้าสลับ/จากแบบ = คำเดิม', () => {
  const stamped = {
    method: 'onsite', methodReason: SURVEY_INTAKE_SWITCH_REASON, methodChangedAt: '2026-10-14T03:00:00Z',
    methodChangedByName: 'Lalida Chaiwanna', surveyedAt: '2026-10-12T03:00:00Z',
  };
  const zones = [
    { id: 'z1', zoneName: 'Lobby', status: 'ok', parts: [], spots: [], ...stamped },
    // ช่างบันทึกทับหลังเวลาตรา = ตัวเลขของหน้างานแล้ว
    { id: 'z2', zoneName: 'ห้องประชุม', status: 'ok', parts: [], spots: [], ...stamped, surveyedAt: '2026-10-16T03:00:00Z' },
    // หัวหน้าสลับกลับเป็นลงหน้างาน (เหตุผลของหัวหน้า) — มีคำของตัวเองอยู่แล้ว ("กลับมาเป็นลงหน้างาน — …")
    { id: 'z3', zoneName: 'โถง', status: 'ok', parts: [], spots: [], ...stamped, methodReason: SWITCH_STAMP.methodReason },
    { id: 'z4', zoneName: 'ร้าน', status: 'ok', parts: [], spots: [], ...DESK_RESULT },
    { id: 'z5', zoneName: 'ทางเดิน', status: 'ok', parts: [], spots: [] },
  ];
  const request = { ...row('drawing-switched', 'acknowledged'), variant: 'standard', surveyZones: zones };
  const chips = Object.fromEntries(job(request).zones.rows.map((r) => [r.id, r.chip]));
  assert.deepEqual(chips, { z1: SURVEY_INTAKE_REMEASURE_CHIP, z2: null, z3: null, z4: 'จากแบบ', z5: null });
  // ทองคำของใบลงหน้างาน (ไม่มีตรา) ไม่ขยับ — ตารางของวันนี้ไม่มีป้ายใดเลย
  assert.ok(job(row('standard', 'acknowledged')).zones.rows.every((r) => r.chip === null));
});

test('รอบ 4 ข้อ 14: RequiredFilesBlock ซ่อนบรรทัดป้ายได้ (การ์ดที่วาดชื่อเอง) · คำบรรยายอยู่เสมอ · ฟอร์มไม่ส่ง = ป้าย "(บังคับ)" เดิม', () => {
  const blockSrc = readFileSync(new URL('../../components/requests/RequiredFilesBlock.js', import.meta.url), 'utf8');
  assert.match(blockSrc, /hideLabel = false,/);
  assert.match(blockSrc, /\{!hideLabel && <span className=\{formStyles\.fieldLabel\}>\{spec\.label\} \(บังคับ\)<\/span>\}/);
  assert.match(blockSrc, /<small className=\{formStyles\.hint\}>\{spec\.hint\}<\/small>/);
  const form = readFileSync(new URL('../../components/requests/RequestForm.js', import.meta.url), 'utf8');
  const call = form.slice(form.indexOf('<RequiredFilesBlock'), form.indexOf('/>', form.indexOf('<RequiredFilesBlock')));
  assert.doesNotMatch(call, /hideLabel/, 'ฟอร์มแก้ยังวาดป้ายของบล็อก (ไม่มีชื่อการ์ดครอบ)');
});
