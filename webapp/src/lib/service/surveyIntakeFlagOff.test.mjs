// ── ประเมินจากแบบ งวด 4 (S4) — หลักฐานของ §4 "สวิตช์ปิด = จอทุกจอเหมือนวันนี้" ระดับซอร์ส (Integrate) ──────────
//
// ⭐ งวดนี้ขึ้น production ขณะสวิตช์ `SURVEY_DRAWING_METHOD` **ปิด** ⇒ ใบประเมินพื้นที่ทุกใบที่มีอยู่ (`variant = 'standard'`
//    จาก DEFAULT ของคอลัมน์ · mig 0351) และแถวเก่าที่ไม่มีคีย์ `variant` ต้องได้ผลเดิมทุกตัวอักษร ในทุกเส้นที่งวดนี้แตะ:
//    สร้าง · แก้ · ส่ง · ป้ายคิว · การ์ดหน้าจัดคิว · โมดัลลงคิว · หัวใบประเมิน · ด่านปิดนัด · ภาพนิ่งกระดาษ
//    ของที่ **ตั้งใจให้เห็นทันที** มีเท่าที่ §4 ระบุ (ไทล์ "ลงหน้างาน" ตัวเดียว · ป้าย "สถานที่ที่จะให้ประเมิน" · ข้อความหัวข้อ ·
//    บรรทัดอ่านอย่างเดียว "วิธีที่ฝ่ายขายขอ" หลังส่ง · ประโยคล็อกฝั่งผู้ขอ · " · ลงหน้างาน" ในกล่องยืนยันส่ง)
// ⚠️ เทียบกับโค้ด 954861d8 ทั้งก้อนทำนอกเทสต์นี้แล้ว (สคริปต์ HEAD vs ต้นไม้งาน 1,394 ผลลัพธ์ — รายงาน Integrate)
//    ไฟล์นี้ตรึงสิ่งที่ต้องจริงตลอดไป: `standard` ≡ ไม่มีคีย์ ≡ ค่าสวิตช์ใด ๆ ที่หลุดมาบนแถว ในทุก view-model
//    + ค่าทองของวันนี้ที่เป็นคำ (ลอกจาก 954861d8) + ยามซอร์สของสวิตช์ + "สร้างกับแก้คือฟอร์มเดียว" (§2.7)
// ⚠️ ห้ามมีทับตามด้วยดอกจันติดกันในสตริงของไฟล์นี้ (ตัวตัดคอมเมนต์ของยามตัวอื่นกลืนโค้ด)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUEST_KIND_LIST, requestKindLabelFull, requestKindMeta, requestShapeError, requestVariantFieldLabel,
} from '../master/requestTypes.js';
import {
  requestEditVariant, requestImpliedVariant, requestVariantAskedOnly, requestVariantChoices, requestVariantLock,
  requestVariantSideLock, requestVariantSwitchError,
} from '../requests/variantSwitch.js';
import { requestFormBlocker, requestPayload } from '../master/requestCreate.js';
import { requiredChecks } from '../requests/formTabs.js';
import { surveyVariantRefusal, surveyVariantsOff } from './surveyIntake.js';
import { surveyJobView } from './surveyJob.js';
import { requestHeaderFacts } from '../requests/headerFacts.js';
import { surveyRequestRow } from './scheduleQueueView.js';
import {
  commitDueDefaults, commitDueJobRows, commitDueLabels, commitDueMode, commitDueWishes, deskDueAction,
} from '../requests/commitDue.js';
import { surveyAboutView, surveyJobHeaderView } from './surveyFieldView.js';
import { surveyFieldSubmitError } from './survey.js';
import { zonePickList } from './zonePickState.js';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = path.resolve(HERE, '../../..');
const SRC = path.join(WEBAPP, 'src');
const rel = (file) => path.relative(WEBAPP, file).split(path.sep).join('/');
const read = (relative) => fs.readFileSync(path.join(WEBAPP, relative), 'utf8');
const BLOCK_COMMENT = new RegExp('\\/\\*[\\s\\S]*?\\*\\/', 'g');
const stripComments = (source) => source.replace(BLOCK_COMMENT, '').replace(/(^|\s)\/\/.*$/gm, '$1');
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(entry.name) && !/\.test\.mjs$|TestKit\.mjs$/.test(entry.name)) out.push(full);
  }
  return out;
}
const APP = walk(SRC).map((file) => ({ file: rel(file), code: stripComments(fs.readFileSync(file, 'utf8')) }));

const OFF = surveyVariantsOff(false);
const TODAY = '2026-10-15';
const NOW = new Date('2026-10-15T05:00:00Z');
const SITE = { id: 'S1', code: 'ST-1001', name: 'เซ็นทรัลเวิลด์', routeZone: 'BKK-C', customerName: 'บจก. เซ็นทรัล' };
const sitesById = new Map([[SITE.id, SITE]]);
const crew = [{ id: 'U1', name: 'สมชาย ใจดี' }];

/* ═══ ยามซอร์ส: สวิตช์อ่านที่ server · จอรู้จากคำตอบ GET ═══════════════════════════════════════════ */

test('🔴 ไม่มีไฟล์ใต้ src/components หรือ page.js ไหนอ่าน process.env.SURVEY_DRAWING_METHOD หรือดึง surveyDrawingFlag', () => {
  const screens = APP.filter(({ file }) => file.startsWith('src/components/') || /\/page\.js$/.test(file));
  assert.ok(screens.length > 100, 'ต้องเดินเจอจอจริง');
  const offenders = screens
    .filter(({ code }) => /process\.env\.SURVEY_DRAWING_METHOD|NEXT_PUBLIC_SURVEY_DRAWING|surveyDrawingFlag|surveyDrawingMethodEnabled\s*\(/.test(code))
    .map(({ file }) => file);
  assert.deepEqual(offenders, []);
  // ทั้งสองหน้าที่วาดฟอร์มรู้ค่าจาก payload: หน้าเปิดใบจาก GET form-options · หน้าใบจากคีย์ของ GET ใบนั้น
  assert.match(stripComments(read('src/app/requests/new/page.js')), /apiJson\("\/api\/sa\/requests\/form-options"/);
  assert.match(stripComments(read('src/app/requests/new/page.js')), /surveyVariantsOff\(options\?\.drawingMethodEnabled\)/);
  assert.match(stripComments(read('src/app/requests/[id]/page.js')), /variantsOff=\{surveyVariantsOff\(req\.drawingMethodEnabled\)\}/);
});

/* ═══ สร้างกับแก้คือฟอร์มเดียว (AGENTS.md · สเปก §2.7) ═══════════════════════════════════════════ */

test('🔴 สร้างกับแก้คือ RequestForm ตัวเดียว — สองหน้าวาดฟอร์มเดียวกัน ต่างกันแค่ props · ไม่มีไทล์วิธีประเมินที่อื่น', () => {
  const renders = APP.filter(({ code }) => /<RequestForm\b/.test(code)).map(({ file }) => file).sort();
  assert.deepEqual(renders, ['src/app/requests/[id]/page.js', 'src/app/requests/new/page.js']);
  for (const file of renders) {
    assert.match(read(file), /import RequestForm(?:, \{[^}]*\})? from "@\/components\/requests\/RequestForm";/, file);
  }
  assert.match(read('src/app/requests/[id]/page.js'), /<RequestForm\s+mode="edit"/);
  assert.doesNotMatch(read('src/app/requests/new/page.js'), /<RequestForm[^>]*mode="edit"/);
  // props ของงวดนี้มีผู้อ่านคนเดียว (ฟอร์ม) — ไม่มีชุดช่อง/ไทล์คู่ขนานในหน้าใด
  for (const prop of ['variantsOff', 'variantsPending', 'variantAskedOnly']) {
    const users = APP.filter(({ code }) => new RegExp(`\\b${prop}\\b`).test(code)).map(({ file }) => file).sort();
    for (const file of users) {
      assert.ok(
        ['src/components/requests/RequestForm.js', 'src/app/requests/new/page.js', 'src/app/requests/[id]/page.js'].includes(file),
        `${prop} ← ${file}`,
      );
    }
  }
  // บล็อกไฟล์บังคับเป็นคอมโพเนนต์เดียว: ฟอร์ม (สร้าง + แก้) กับการ์ดของหน้าใบ (ซ่อนตอนฟอร์มแก้เปิด)
  const blocks = APP.filter(({ code }) => /<RequiredFilesBlock\b/.test(code)).map(({ file }) => file).sort();
  assert.deepEqual(blocks, ['src/app/requests/[id]/page.js', 'src/components/requests/RequestForm.js']);
  assert.match(stripComments(read('src/app/requests/[id]/page.js')), /const requiredFilesCard = requiredFilesSpec && !editing \?/);
});

/* ═══ สวิตช์ปิด: ทางเลือกของฟอร์มและด่าน server ═══════════════════════════════════════════════ */

test('สวิตช์ปิด: ใบประเมินเหลือทางเดียว "ลงหน้างาน" ที่หน้าเลือกไว้ให้ · ค่าที่ไม่ใช่ true ตรงตัว = ปิด', () => {
  for (const flag of [false, undefined, null, 'true', 1]) {
    assert.deepEqual(surveyVariantsOff(flag), ['drawing'], String(flag));
  }
  assert.deepEqual(requestVariantChoices('site_survey', { off: OFF }), ['standard']);
  assert.equal(requestImpliedVariant('site_survey', { off: OFF }), 'standard');
  // ร่างที่ถือ drawing อยู่แล้ว (สวิตช์ถูกปิดทีหลัง) ยังเห็นไทล์ของตัวเอง — §4 แถว "draft that already is drawing"
  assert.deepEqual(requestVariantChoices('site_survey', { off: OFF, current: 'drawing' }), ['standard', 'drawing']);
  assert.equal(surveyVariantRefusal({ variant: 'drawing', enabled: false, current: 'drawing' }), null);
  assert.equal(surveyVariantRefusal({ variant: 'drawing', enabled: false, current: 'standard' }), 'ยังไม่เปิดใช้การประเมินจากแบบ');
  assert.equal(surveyVariantRefusal({ variant: 'standard', enabled: false }), null);
  assert.equal(surveyVariantRefusal({ variant: undefined, enabled: false }), null);
  // หัวข้ออื่นไม่มีทางที่ "เลือกไว้ให้" (พัฒนาสูตรไม่บังคับเลือก — รูปแบบตั้งต้นเดิม)
  for (const kind of REQUEST_KIND_LIST.filter((k) => k !== 'site_survey')) {
    assert.equal(requestImpliedVariant(kind, { off: OFF }), null, kind);
  }
});

const SURVEY_FORM = {
  kind: 'site_survey', dept: 'TS', title: 'ประเมินล็อบบี้', body: 'รายละเอียด', dealId: 'D1', projectId: 'P1', siteId: 'S1',
  zones: [{ zoneName: 'Lobby', floor: '1' }], requestedDueDate: '2026-10-20', requestedDueTime: '10:00', requestedResultDate: '2026-10-22',
  urgent: false, items: [], files: [], requiredFiles: [],
};

test('สร้าง (สวิตช์ปิด · หน้าเลือก "ลงหน้างาน" ไว้ให้): payload = ของวันนี้ + variant "standard" (ค่าเดียวกับ DEFAULT ของคอลัมน์)', () => {
  const form = { ...SURVEY_FORM, variant: requestImpliedVariant('site_survey', { off: OFF }) };
  const today = { ...requestPayload({ ...SURVEY_FORM, variant: '' }), variant: 'standard' };
  assert.deepEqual(requestPayload(form), today);
  // วันเข้าพื้นที่ · ช่วงเวลา · วันรับผล ไปครบ (ไม่ใช่รูปวันเดียวของจากแบบ)
  assert.equal(requestPayload(form).requestedDueDate, '2026-10-20');
  assert.equal(requestPayload(form).requestedDueTime, '10:00');
  assert.equal(requestFormBlocker(form), null);
  assert.equal(requestShapeError('site_survey', requestPayload(form)), null);
  // ด่านเดิมของวันนี้ยังตอบประโยคเดิม (ป้ายสถานที่ = มติเจ้าของ 12/10 · O1)
  // ⭐ ยกเว้นประโยควันเข้า: พูดป้ายของช่องจริง "วันที่ต้องการให้เข้าพื้นที่" (UAT S4 รอบ 4 ข้อ 11 · เห็นทันทีที่ deploy แม้สวิตช์ปิด —
  //    อยู่ในลิสต์ §15.2 ของแผน) · หัวข้ออื่นยัง "ต้องระบุวันที่ต้องการรับงาน" ทุกตัวอักษร (requestVariantIntake.test.mjs)
  assert.equal(requestFormBlocker({ ...form, requestedDueDate: '' }), 'ต้องระบุวันที่ต้องการให้เข้าพื้นที่');
  assert.equal(requestFormBlocker({ ...form, siteId: '' }), 'ต้องเลือกสถานที่ที่จะให้ประเมิน — ไม่มีในทะเบียนให้กด “สร้างสถานที่ใหม่” ในฟอร์มนี้');
  // แท็บความพร้อม: ของวันนี้ + บรรทัดแรก "วิธีประเมิน" (ติ๊กแล้ว) · ไม่มีบรรทัดไฟล์แบบ
  assert.deepEqual(requiredChecks(form).map(({ tab, label, ok }) => [tab, label, ok]), [
    ['work', 'วิธีประเมิน', true],
    ['work', 'ดีล', true],
    ['subject', 'สถานที่ที่จะให้ประเมิน', true],
    ['subject', 'พื้นที่ที่ต้องประเมินอย่างน้อย 1 รายการ', true],
    ['subject', 'ชื่อเรื่อง', true],
    ['subject', 'รายละเอียดเพิ่มเติม', true],
    ['due', 'วันที่ต้องการให้เข้าพื้นที่', true],
    ['due', 'วันที่ต้องการรับผลประเมิน', true],
  ]);
});

/* ═══ แถวที่มีอยู่: standard ≡ ไม่มีคีย์ ≡ ค่าสวิตช์ที่หลุดมาบนแถว — ทุก view-model ═══════════════════════════ */

const zones = (method) => ([
  { id: 'z1', zoneName: 'Lobby ชั้น 1', zoneFloor: '01', status: 'ok', parts: [], spots: [] },
  {
    id: 'z2', zoneName: 'ห้องประชุม', zoneFloor: '02', status: 'ok', parts: [{ widthM: 4, lengthM: 5, heightM: 3 }], spots: [],
    surveyedAt: '2026-10-14T03:00:00Z',
  },
].map((z) => (method ? { ...z, method } : z)));
const STATUSES = {
  draft: { status: 'draft', submittedAt: null, docNo: null },
  pending: { status: 'pending', submittedAt: '2026-10-13T02:00:00Z' },
  acknowledged: { status: 'acknowledged', submittedAt: '2026-10-13T02:00:00Z', acknowledgedAt: '2026-10-13T04:00:00Z', acknowledgedByName: 'หัวหน้า TS' },
  committed: {
    status: 'acknowledged', submittedAt: '2026-10-13T02:00:00Z', acknowledgedAt: '2026-10-13T04:00:00Z', acknowledgedByName: 'หัวหน้า TS',
    committedDueDate: '2026-10-21', committedDueTime: '13:00:00', committedResultDate: '2026-10-23', dueCommittedAt: '2026-10-13T05:00:00Z',
  },
  answered: {
    status: 'answered', submittedAt: '2026-10-13T02:00:00Z', acknowledgedAt: '2026-10-13T04:00:00Z',
    committedDueDate: '2026-10-21', committedResultDate: '2026-10-22', dueCommittedAt: '2026-10-13T05:00:00Z', answeredAt: '2026-10-14T03:00:00Z',
  },
  closed: { status: 'closed', submittedAt: '2026-10-13T02:00:00Z', answeredAt: '2026-10-14T03:00:00Z', closedAt: '2026-10-14T05:00:00Z' },
  cancelled: { status: 'cancelled', submittedAt: '2026-10-13T02:00:00Z', cancelledAt: '2026-10-14T05:00:00Z' },
};
const DATES = {
  both: { requestedDueDate: '2026-10-20', requestedDueTime: '10:00:00', requestedResultDate: '2026-10-22' },
  none: { requestedDueDate: null, requestedDueTime: null, requestedResultDate: null },
};
const legacyRows = () => {
  const out = [];
  for (const [s, st] of Object.entries(STATUSES)) {
    for (const [d, dt] of Object.entries(DATES)) {
      for (const desk of [false, true]) {
        out.push([`${s}|${d}|${desk ? 'desk' : 'visit'}`, {
          id: 'R1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', docNo: 'RQ-AS-26100101', title: 'ประเมินล็อบบี้',
          team: 'SV', requestedByName: 'วิภา ขายเก่ง', siteId: 'S1', customerName: 'บจก. เซ็นทรัล', surveyVisit: null,
          surveyFilesByZone: {}, ...dt, ...st, surveyZones: zones(desk ? 'drawing' : null), surveyNeedsVisit: !desk,
        }]);
      }
    }
  }
  return out;
};
const without = (row, key) => {
  const copy = { ...row };
  delete copy[key];
  return copy;
};
/* ทุกจอที่งวดนี้แตะ (ฝั่งฝ่ายขาย · ผู้วางคิว · หัวหน้า · กระดาษ) เป็นก้อนเดียว — คีย์ `request` ของการ์ดคือวัตถุที่ส่งเข้าไปเอง */
const screensOf = (r) => {
  const card = surveyRequestRow(r, { todayIso: TODAY, sitesById, live: [], peopleInView: crew });
  const header = surveyJobHeaderView({ request: r, customer: { arCode: 'AR-1', name: 'ลูกค้า' }, site: SITE, visit: null, crew: [], unknown: {} });
  return {
    jobOpener: surveyJobView({ request: r, today: TODAY, viewer: { isOpener: true, isRequesterSide: true } }),
    jobOther: surveyJobView({ request: r, today: TODAY, viewer: { isOpener: false, isRequesterSide: false } }),
    header: requestHeaderFacts(r, { now: NOW }),
    queueLabel: requestKindLabelFull(r),
    card: card ? without(card, 'request') : card,
    commit: [
      commitDueMode(r), commitDueLabels(r), commitDueLabels(r, { requeue: true }),
      commitDueDefaults(r, { today: TODAY }), commitDueDefaults(r, { requeue: true, today: TODAY }),
      commitDueJobRows(r, { site: SITE, todayIso: TODAY }),
      commitDueWishes(r, { date: '2026-10-20', time: '10:00', resultDate: '2026-10-22' }),
      deskDueAction(r, { canCommit: true }),
    ],
    sheet: { header, about: surveyAboutView({ header: header.request, requestId: r.id }) },
  };
};

test('🔴 แถวที่มีอยู่: variant "standard" ≡ ไม่มีคีย์ ≡ มีค่าสวิตช์ติดมา — ทุกจอ (หน้าใบ · หัวใบ · ป้ายคิว · การ์ด · โมดัลลงคิว · หัวใบประเมิน)', () => {
  let n = 0;
  for (const [key, row] of legacyRows()) {
    const legacy = screensOf(row);
    for (const variant of [{ variant: 'standard' }, { variant: 'standard', drawingMethodEnabled: false }, { variant: 'standard', drawingMethodEnabled: true }]) {
      assert.deepEqual(screensOf({ ...row, ...variant }), legacy, `${key} ${JSON.stringify(variant)}`);
      n += 1;
    }
    // registry ratchet (สเปก §3 Integrate ข้อ 3): ใบ standard ไม่พิมพ์ "ฝ่ายขายขอ" ที่ไหนเลย
    assert.doesNotMatch(JSON.stringify(legacy), /ฝ่ายขายขอ|ยื่นเป็นประเมินจากแบบ/, key);
    assert.equal(legacy.queueLabel, 'ประเมินพื้นที่', key);
  }
  assert.equal(n, Object.keys(STATUSES).length * Object.keys(DATES).length * 2 * 3);
});

test('ด่านปิดนัด (409) · ภาพนิ่งกระดาษ · ตัวเลือกพื้นที่: standard / ไม่มีคีย์ = ของวันนี้ทุกตัวอักษร', () => {
  const TODAY_EMPTY = 'ใบนี้ยังไม่มีพื้นที่ให้วัด — กด “เพิ่มพื้นที่ที่เจอหน้างาน” ก่อน หรือเลือก “ไปแล้วเข้าไม่ได้”';
  assert.equal(surveyFieldSubmitError([], {}), TODAY_EMPTY);
  for (const variant of [undefined, null, '', 'standard']) {
    assert.equal(surveyFieldSubmitError([], {}, { variant }), TODAY_EMPTY, String(variant));
    assert.equal(surveyFieldSubmitError(zones(null), {}, { variant }), surveyFieldSubmitError(zones(null), {}));
  }
  const snapshotOf = (variant) => {
    const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
    if (variant !== undefined) inputs.request.variant = variant;
    return buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  };
  assert.deepEqual(snapshotOf('standard'), snapshotOf(undefined));
  const pick = [
    { id: 'a', name: 'A', surveyedAt: null, termState: 'none' },
    { id: 'b', name: 'B', surveyedAt: null, termState: 'active' },
    { id: 'c', name: 'C', surveyedAt: '2026-01-01', termState: 'ended' },
  ];
  // ค่าทองของ 954861d8 (คำ "วัด" ของวันนี้) — ฟอร์มที่ไม่ได้เลือกจากแบบไม่เปลี่ยนคำ
  assert.deepEqual(zonePickList(pick, new Set()).map((z) => z.reason), [
    'ขายแล้วแต่ไม่เคยวัด — วัดเก็บไว้ได้ในรอบนี้', 'ยังไม่เคยวัด', 'เคยขาย รอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้',
  ]);
  assert.deepEqual(zonePickList(pick, new Set(), { wording: 'measure' }), zonePickList(pick, new Set()));
});

test('แก้ / ส่ง ของใบประเมินที่มีอยู่ (สวิตช์ปิด): ไม่เคยเขียน variant: null · ค่าเดิมไม่ถือเป็นการสลับ · ล็อกหลังส่งตาม §4 ข้อ 4–5', () => {
  for (const [key, row] of legacyRows()) {
    for (const r of [row, { ...row, variant: 'standard' }]) {
      // ฟอร์มส่งค่าเดิม (หรือไม่ส่ง) = ไม่มี error · ไม่มี null · ไม่มีอะไรนอกจาก "standard"
      for (const asked of [undefined, r.variant]) {
        const out = requestEditVariant(r, asked);
        assert.equal(out.error, null, key);
        assert.ok(out.variant === undefined || out.variant === 'standard', `${key} ${JSON.stringify(out)}`);
      }
      assert.equal(requestVariantSwitchError(r, 'standard', []), null, key);
      // หลังส่ง = บรรทัดอ่านอย่างเดียว (ไม่ใช่ไทล์) · ร่าง = ไทล์
      assert.equal(requestVariantAskedOnly(r), r.status !== 'draft', key);
    }
  }
  assert.equal(requestVariantAskedOnly({ kind: 'site_survey', status: 'draft', variant: 'standard' }), false);
  assert.equal(requestVariantAskedOnly({ kind: 'site_survey', status: 'pending', variant: 'standard' }), true);
  assert.equal(requestVariantLock({ kind: 'site_survey', status: 'draft', variant: 'standard' }), null);
  // §4 ข้อ 5: ร่างที่ล็อกฝั่งผู้ขอ — ประโยคใช้ป้ายของหัวข้อ
  assert.equal(requestVariantSideLock(false, 'site_survey'), 'สลับวิธีประเมินได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน');
  // ร่างที่บรรทัดอ่านอย่างเดียวเขียนประโยคล็อกเฉพาะตอนสลับได้จริง (สวิตช์ปิด = ไม่มีใครสลับได้ ⇒ ไม่มีประโยค · B-1)
  assert.equal(requestVariantChoices('site_survey', { off: OFF }).length >= 2, false);
});

/* ═══ หัวข้ออื่น: ไม่ได้รับผลจากงวดนี้ ═══════════════════════════════════════════════════════════ */

test('หัวข้ออื่นทุกตัว: ไม่มีคีย์ใหม่ของงวดนี้ · ด่านรูปทรงเท่ากันทั้งมีและไม่มี variant "standard" ค้างมา (รูปของ mig 0351)', () => {
  const NEW_KIND_KEYS = ['variantLabel', 'variantRequired', 'variantRequiredError', 'variantLockAfterSubmit', 'variantLockText', 'variantAskedLabel'];
  const NEW_VARIANT_KEYS = ['description', 'notice', 'form', 'resultDateOnly', 'requiredFiles', 'switchConfirm'];
  for (const kind of REQUEST_KIND_LIST.filter((k) => k !== 'site_survey')) {
    const meta = requestKindMeta(kind);
    for (const key of NEW_KIND_KEYS) assert.equal(meta[key], undefined, `${kind}.${key}`);
    for (const v of Object.values(meta.variants || {})) {
      for (const key of NEW_VARIANT_KEYS) assert.equal(v[key], undefined, `${kind} variant.${key}`);
    }
    const body = {
      kind, dept: meta.dept, title: 'x', body: 'y', dealId: 'D1', projectId: 'P1',
      requestedDueDate: '2026-10-20', requestedResultDate: '2026-10-22', items: [], zones: [], urgent: false,
    };
    assert.equal(requestShapeError(kind, { ...body, variant: 'standard' }), requestShapeError(kind, body), kind);
    assert.equal(requestFormBlocker({ ...body, variant: 'standard' }), requestFormBlocker(body), kind);
  }
  // พัฒนาสูตร: ป้าย "รูปแบบงาน" · ร่าง + รอรับเรื่องสลับได้ · รับเรื่องแล้วล็อกด้วยประโยคเดิม (ค่าทองของ 954861d8)
  assert.equal(requestVariantFieldLabel('formula_dev'), 'รูปแบบงาน');
  assert.deepEqual(Object.keys(requestKindMeta('formula_dev').variants), ['standard', 'npd']);
  const f = { kind: 'formula_dev', id: 'X', docNo: 'RQ-1', variant: 'standard', pdrNo: null };
  assert.equal(requestVariantLock({ ...f, status: 'draft' }), null);
  assert.equal(requestVariantLock({ ...f, status: 'pending' }), null);
  assert.equal(requestVariantLock({ ...f, status: 'acknowledged' }), 'รับเรื่องไปแล้ว — สลับรูปแบบไม่ได้ (งานเดินไปแล้ว)');
  assert.equal(requestVariantSideLock(false), 'สลับรูปแบบงานได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน');
  assert.equal(requestVariantSideLock(false, 'formula_dev'), 'สลับรูปแบบงานได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน');
  assert.equal(requestVariantSideLock(true, 'formula_dev'), null);
  assert.deepEqual(requestEditVariant({ ...f, status: 'draft' }, 'npd'), { variant: 'npd', error: null });
  const untouched = requestEditVariant({ ...f, status: 'draft' }, undefined);
  assert.equal(untouched.error, null);
  assert.equal(untouched.variant, undefined, 'ไม่ส่งรูปแบบมา = ไม่เขียนคอลัมน์ (ถดถอย 0351)');
  assert.equal(requestVariantAskedOnly({ ...f, status: 'pending' }), false);
  assert.equal(requestKindLabelFull({ ...f, variant: 'npd' }), `${requestKindMeta('formula_dev').label} · ${requestKindMeta('formula_dev').variants.npd.label}`);
});
