// ── ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 · กลุ่ม D) — จอฝ่ายขาย: หน้าใบต้นทาง · ฟอร์มล็อก · หน้าใบยืนยัน ─────────────
//
// ⭐ สามส่วน: (1) ค่าที่จอวาด — แถบแจ้งของใบต้นทาง (ตาราง D-1 ทุกแถว ทั้ง text · keep · note · refs · action) และบรรทัดลิงก์สองทาง
//    จาก view-model จริง (`surveyJobView` · `surveyRequestDrawingSummary`) · (2) ยามอ่านซอร์สของจอ (JSX import ใต้ Node เปล่าไม่ได้)
//    · (3) ฟังก์ชันล้วนของหน้าเปิดคำร้องที่หยิบออกมารันตรง ๆ
// 🔴 หมายเหตุของแถว 0–3 เทียบกับสวิตช์ `SURVEY_CONFIRM_ACTION_READY` ตามค่าที่เป็นอยู่ (F5 · F18) — วันเปิดสวิตช์ไฟล์นี้ไม่ต้องแก้:
//    สวิตช์ปิด = ทุกแถบที่ประโยคเอ่ย “ขอยืนยันหน้างาน” ต้องพกหมายเหตุ "ปุ่มจะเปิดใช้ในรอบถัดไป" · เปิดแล้ว = หมายเหตุของแถวนั้นเอง
// ⛔ สตริง/regex ในไฟล์นี้ห้ามมีทับตามด้วยดอกจันติดกัน (ตัวตัดคอมเมนต์ของยามจะกลืนโค้ดตั้งแต่จุดนั้น)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyJobView, surveyRequestDrawingSummary } from '../service/surveyJob.js';
import { SURVEY_CONFIRM_ACTION_READY, SURVEY_CONFIRM_PENDING_NOTE } from '../service/surveyMethodSwitch.js';
import {
  SURVEY_CONFIRM_ID_PATTERN, SURVEY_CONFIRM_NO_ORIGINAL, SURVEY_CONFIRM_WRAP_KEEP, surveyConfirmBannerParts, surveyConfirmDealHint,
  surveyConfirmHref, surveyConfirmSubtitle, surveyConfirmZonesLockText,
} from '../service/surveyConfirmLink.js';
import { phraseRuns } from '../thaiWrap.js';
import { requestClosure } from './closure.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
/* ตัดคอมเมนต์ทิ้ง (คอมเมนต์ JSX ทั้งปีกกา · บล็อก · ทั้งบรรทัด) — คอมเมนต์เล่าเหตุผลได้โดยไม่ทำให้ยามเข้าใจผิด */
const code = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sheet, selector) => {
  const at = sheet.indexOf(`${selector} {`);
  assert.ok(at >= 0, `ไม่พบกฎ ${selector}`);
  return sheet.slice(at, sheet.indexOf('}', at) + 1);
};
const between = (src, from, to) => {
  const at = src.indexOf(from);
  assert.ok(at > -1, `ไม่พบ ${from}`);
  const end = src.indexOf(to, at + from.length);
  assert.ok(end > at, `ไม่พบ ${to} หลัง ${from}`);
  return src.slice(at, end);
};

const RAW = {
  VIEW: read('../../components/requests/details/SurveyRequestView.js'),
  PAGE: read('../../app/requests/[id]/page.js'),
  NEW: read('../../app/requests/new/page.js'),
  FORM: read('../../components/requests/RequestForm.js'),
  SITE: read('../../components/requests/SurveySiteFields.js'),
  JOB: read('../service/surveyJob.js'),
};
const VIEW = code(RAW.VIEW);
const PAGE = code(RAW.PAGE);
const NEW = code(RAW.NEW);
const FORM = code(RAW.FORM);
const SITE = code(RAW.SITE);
const JOB = code(RAW.JOB);
const DETAIL = code(read('../../components/requests/details/SurveyDetail.js'));

/* ── ฟิกซ์เจอร์: ใบต้นทาง RQ-AS-26100345 (กรณี A ของ UAT) — สามพื้นที่จากแบบ ส่งผลแล้ว หัวหน้าเลือก "ต้องยืนยันหน้างาน" ── */
const TODAY = '2026-10-09';
const ORIGINAL_DOC = 'RQ-AS-26100345';
const CHILD_DOC = 'RQ-AS-26100361';
const DRAWING = { method: 'drawing' };
const zones = (over = {}) => ([
  { id: 'z1', zoneId: 'ZN-1', zoneName: 'Lobby ชั้น 1', zoneCode: 'ZN-1160-10301', zoneFloor: '01', status: 'ok',
    parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }], spots: [], ...over },
  { id: 'z2', zoneId: 'ZN-2', zoneName: 'ห้องประชุม ชั้น 2', zoneCode: 'ZN-1160-10302', zoneFloor: '02', status: 'ok',
    parts: [{ id: 'p', widthM: 6, lengthM: 5, heightM: 2.8 }], spots: [], ...over },
  { id: 'z3', zoneId: 'ZN-3', zoneName: 'ห้อง Spa ชั้น 3', zoneCode: 'ZN-1160-10303', zoneFloor: '03', status: 'ok',
    parts: [{ id: 'p', widthM: 3, lengthM: 2, heightM: 3 }], spots: [], ...over },
]);
const original = (over = {}) => ({
  id: 'DR-orig', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'answered', docNo: ORIGINAL_DOC, team: 'SV',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-08T07:50:00Z',
  acknowledgedAt: '2026-10-08T08:12:00Z', acknowledgedByName: 'Arnon Aunsapwilai',
  assigneeId: 'u-head', assigneeName: 'Arnon Aunsapwilai',
  requestedDueDate: '2026-10-13', requestedResultDate: '2026-10-15',
  committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z',
  answeredAt: '2026-10-14T03:00:00Z', answeredByName: 'Arnon Aunsapwilai', surveyConfirm: 'needed',
  surveyNeedsVisit: false, surveyVisit: null, surveyZones: zones(DRAWING), surveyFilesByZone: {},
  ...over,
});
/* ใบลงหน้างานล้วนที่ส่งผลแล้ว (ใบของวันนี้) */
const onsite = (over = {}) => original({ surveyNeedsVisit: undefined, surveyZones: zones(), surveyConfirm: null, ...over });

const HREF = surveyConfirmHref('DR-orig');
const childRef = (over = {}) => ({ id: 'DR-child', docNo: CHILD_DOC, href: '/requests/DR-child', linked: true, ...over });
/* ก้อน `surveyConfirmLink` ที่ GET หน้าคำร้องแนบมา (รูปตาม §2.3 ของสเปก) */
const link = (over = {}) => ({
  unknown: false, awaiting: 3, confirmed: 0, moved: 0, confirmedBy: [], movedTo: [],
  action: { state: 'ready', reason: null, href: HREF }, children: [], confirmOf: null,
  ...over,
});
const N12 = 'มี 3 พื้นที่ที่ประเมินจากแบบ — วัดหน้างานแล้วครบ ใช้ตัวเลขของใบ';
const N15 = 'อ่านสถานะใบยืนยันหน้างานไม่สำเร็จ — โหลดหน้าใหม่';
const N22 = 'ขอยืนยันหน้างานของพื้นที่ที่เหลือได้ที่ใบนั้น';
const TODAY_TEXT = 'มี 3 พื้นที่ที่ประเมินจากแบบ — ใช้ตัวเลขเสนอราคาได้เลย · เมื่อพื้นที่พร้อม กด “ขอยืนยันหน้างาน” เพื่อให้ TS เข้าวัดจริง';
const TODAY_KEEP = ['“ขอยืนยันหน้างาน”'];
const QUOTED_BUTTON = '“ขอยืนยันหน้างาน”';
/* หมายเหตุของแถว 0 และ 2 (ของวันนี้) · แถว 1 และ 3 (ของตัวเองหลังเปิดสวิตช์ — F5) */
const todayNote = SURVEY_CONFIRM_ACTION_READY ? null : SURVEY_CONFIRM_PENDING_NOTE;
const ownNote = (afterFlip) => (SURVEY_CONFIRM_ACTION_READY ? afterFlip : SURVEY_CONFIRM_PENDING_NOTE);

const SALES = { isOpener: true, isRequesterSide: true };
const VIEWERS = [
  ['ฝ่ายขายเจ้าของใบ', SALES],
  ['ฝ่ายขายทีมเดียวกัน', { isOpener: false, isRequesterSide: true }],
  ['หัวหน้า TS', { canDecide: true, canWork: true, canOpenVisit: true }],
  ['ผู้วางคิว', { canWork: true }],
];
const job = (request, viewer = SALES) => surveyJobView({ request, today: TODAY, viewer });
const banner = (request, viewer = SALES) => job(request, viewer).zones.drawingBanner;

/* ══ D-1 ตาราง: ทุกแถว ═════════════════════════════════════════════════════════════════════════ */

test('D-1 แถว 0: ไม่มีคีย์ link (ฟิกซ์เจอร์เดิมทุกตัว) = ก้อนของวันนี้ทุกไบต์ — `action` ไม่มี `state` ⇒ จอไม่วาดปุ่ม', () => {
  assert.deepEqual(banner(original()), {
    text: TODAY_TEXT,
    keep: TODAY_KEEP,
    note: todayNote,
    action: { label: 'ขอยืนยันหน้างาน', ready: SURVEY_CONFIRM_ACTION_READY },
  });
});

test('D-1 แถว 1: อ่านสถานะไม่สำเร็จ (`unknown`) — ประโยคของวันนี้ · หมายเหตุ N15 หลังเปิดสวิตช์เท่านั้น · ไม่มีปุ่ม', () => {
  const got = banner(original({ surveyConfirmLink: { unknown: true } }));
  assert.deepEqual(got, { text: TODAY_TEXT, keep: TODAY_KEEP, note: ownNote(N15), action: null });
  assert.deepEqual(Object.keys(got), ['text', 'keep', 'note', 'action'], 'ไม่มี refs เปล่า (R-KEYS)');
});

test('D-1 แถว 2: รออย่างเดียว — สี่คีย์ของวันนี้ · ปุ่มจาก link.action (ready อยู่ท้ายก้อน) · ไม่มีสิทธิ์ = ไม่มีปุ่ม', () => {
  const got = banner(original({ surveyConfirmLink: link() }));
  assert.deepEqual(Object.keys(got), ['text', 'keep', 'note', 'action']);
  assert.equal(got.text, TODAY_TEXT);
  assert.deepEqual(got.keep, TODAY_KEEP);
  assert.equal(got.note, todayNote);
  assert.deepEqual(got.action, {
    label: 'ขอยืนยันหน้างาน', state: 'ready', reason: null, href: HREF, emphasis: 'secondary', ready: SURVEY_CONFIRM_ACTION_READY,
  });
  assert.equal(Object.keys(got.action).at(-1), 'ready');
  // ติดด่าน: เหตุมาจาก server ทั้งประโยค
  const reason = `พื้นที่ Lobby ชั้น 1: มีใบสั่งวัดค้างอยู่แล้ว ${CHILD_DOC} — รอใบนั้นจบก่อน`;
  const blocked = banner(original({ surveyConfirmLink: link({ action: { state: 'blocked', reason, href: HREF } }) }));
  assert.deepEqual([blocked.action.state, blocked.action.reason, blocked.action.href], ['blocked', reason, HREF]);
  // คนที่จัดการใบไม่ได้ (server ไม่ส่ง action) = ประโยคล้วน
  assert.equal(banner(original({ surveyConfirmLink: link({ action: null }) })).action, null);
});

test('D-1 แถว 3: ยังรอ + ยืนยัน/ย้ายไปแล้วบางส่วน — ประโยคของวันนี้ · หมายเหตุ N13 หลังเปิดสวิตช์ · N13 ไม่เคยขึ้นต้นด้วย "แล้ว 0"', () => {
  const both = banner(original({ surveyConfirmLink: link({ awaiting: 1, confirmed: 1, moved: 1 }) }));
  assert.equal(both.text, TODAY_TEXT);
  assert.deepEqual(both.keep, TODAY_KEEP);
  assert.equal(both.note, ownNote('ยืนยันหน้างานแล้ว 1 พื้นที่ · ประเมินจากแบบอีกครั้ง 1 พื้นที่ · ยังรอยืนยัน 1 พื้นที่'));
  assert.equal(both.action.state, 'ready');
  assert.equal(Object.keys(both.action).at(-1), 'ready');
  const confirmedOnly = banner(original({ surveyConfirmLink: link({ awaiting: 2, confirmed: 1 }) }));
  assert.equal(confirmedOnly.note, ownNote('ยืนยันหน้างานแล้ว 1 พื้นที่ · ยังรอยืนยัน 2 พื้นที่'));
  // ตัวประกอบหมายเหตุ (ค่าหลังเปิดสวิตช์) — ไม่มีส่วน "ยืนยันแล้ว" เมื่อยืนยัน 0
  const movedOnly = surveyConfirmBannerParts(link({ awaiting: 1, moved: 2 }), { n: 3 });
  assert.equal(movedOnly.note, 'ประเมินจากแบบอีกครั้ง 2 พื้นที่ · ยังรอยืนยัน 1 พื้นที่');
  assert.doesNotMatch(movedOnly.note, /ยืนยันหน้างานแล้ว 0/);
});

test('D-1 แถว 4: วัดหน้างานครบ — N12 + เลขที่ของใบที่ถือตัวเลข (ผูกหรือไม่ผูก) · ไม่มีปุ่ม ไม่มีหมายเหตุ', () => {
  const linked = banner(original({ surveyConfirmLink: link({ awaiting: 0, confirmed: 3, confirmedBy: [childRef()], action: null }) }));
  assert.deepEqual(linked, {
    text: N12, keep: ['วัดหน้างานแล้วครบ'], note: null, refs: [{ docNo: CHILD_DOC, href: '/requests/DR-child' }], action: null,
  });
  // ใบลงหน้างานธรรมดาที่ไม่ได้ผูก (ทางที่ฝ่ายขายใช้ก่อนงวด S5) — ประโยคชี้เลขของใบนั้น ไม่มีบรรทัด "ใบยืนยันหน้างาน"
  const plain = original({
    surveyConfirmLink: link({
      awaiting: 0, confirmed: 3, action: null,
      confirmedBy: [{ id: 'DR-plain', docNo: 'RQ-AS-26100350', href: '/requests/DR-plain', linked: false }],
    }),
  });
  assert.deepEqual(banner(plain).refs, [{ docNo: 'RQ-AS-26100350', href: '/requests/DR-plain' }]);
  assert.equal('confirmLinks' in job(plain).zones, false);
});

test('D-1 แถว 5–6: ประเมินจากแบบอีกครั้งในใบอื่น — N20 / N21 · N22 เฉพาะใบนั้นต้องยืนยันหน้างานด้วย · ref ชี้ใบนั้น', () => {
  const moved = { id: 'DR-again', docNo: 'RQ-AS-26100370', href: '/requests/DR-again', linked: true, needed: true };
  const five = banner(original({ surveyConfirmLink: link({ awaiting: 0, confirmed: 1, moved: 2, movedTo: [moved], action: null }) }));
  assert.deepEqual(five, {
    text: 'มี 3 พื้นที่ที่ประเมินจากแบบ — ยืนยันหน้างานแล้ว 1 พื้นที่ · อีก 2 พื้นที่ประเมินจากแบบอีกครั้งในใบ',
    keep: ['ยืนยันหน้างานแล้ว 1 พื้นที่', 'ประเมินจากแบบอีกครั้ง'],
    note: SURVEY_CONFIRM_ACTION_READY ? N22 : null, // N22 ชี้การกระทำของปุ่ม ⇒ สวิตช์ปิด = ไม่มี (ข้อ F5 ข้างล่าง)
    refs: [{ docNo: 'RQ-AS-26100370', href: '/requests/DR-again' }],
    action: null,
  });
  const six = banner(original({ surveyConfirmLink: link({ awaiting: 0, moved: 3, movedTo: [{ ...moved, needed: false }], action: null }) }));
  assert.deepEqual(six, {
    text: 'มี 3 พื้นที่ที่ประเมินจากแบบ — ประเมินจากแบบอีกครั้งในใบ',
    keep: ['ประเมินจากแบบอีกครั้ง'],
    note: null,
    refs: [{ docNo: 'RQ-AS-26100370', href: '/requests/DR-again' }],
    action: null,
  });
});

test('D-1 แถว 7: จัดพื้นที่ไม่ได้สักพื้นที่ — ประโยคของวันนี้โดยไม่เอ่ยปุ่ม · ไม่มี refs เปล่า', () => {
  const got = banner(original({ surveyConfirmLink: link({ awaiting: 0, action: null }) }));
  assert.deepEqual(got, {
    text: 'มี 3 พื้นที่ที่ประเมินจากแบบ — ใช้ตัวเลขเสนอราคาได้เลย', keep: ['ใช้ตัวเลขเสนอราคาได้เลย'], note: null, action: null,
  });
});

test('🔴 F5 · R5: ทุกแถบที่เอ่ยชื่อปุ่มพกหมายเหตุตามสวิตช์ · แถว 4–7 ไม่เอ่ยชื่อปุ่ม ไม่มีปุ่ม และ keep เป็นของตัวเอง', () => {
  const shapes = [
    undefined,
    { unknown: true },
    link(),
    link({ awaiting: 1, confirmed: 2 }),
    link({ awaiting: 2, moved: 1 }),
    link({ awaiting: 0, confirmed: 3, confirmedBy: [childRef()], action: null }),
    link({ awaiting: 0, confirmed: 1, moved: 2, movedTo: [{ id: 'DR-a', docNo: 'RQ-1', href: '/requests/DR-a', needed: true }] }),
    link({ awaiting: 0, moved: 3, movedTo: [{ id: 'DR-a', docNo: 'RQ-1', href: '/requests/DR-a', needed: false }] }),
    link({ awaiting: 0 }),
  ];
  for (const shape of shapes) {
    const got = banner(original(shape === undefined ? {} : { surveyConfirmLink: shape }));
    if (got.text.includes(QUOTED_BUTTON)) {
      // แถว 0–3: สวิตช์ปิด = หมายเหตุ "ปุ่มจะเปิดใช้ในรอบถัดไป" ทุกแถว (รวมแถว 1 และ 3)
      if (!SURVEY_CONFIRM_ACTION_READY) assert.equal(got.note, SURVEY_CONFIRM_PENDING_NOTE, JSON.stringify(shape));
      assert.deepEqual(got.keep, TODAY_KEEP);
      assert.equal('refs' in got, false);
    } else {
      assert.equal(got.action, null, 'ประโยคที่ไม่เอ่ยปุ่ม = ไม่มีปุ่ม');
      assert.ok(!got.keep.includes(QUOTED_BUTTON), 'แถว 4–7 ไม่ยก keep ของวันนี้มา');
      assert.ok(got.keep.length > 0);
      assert.ok(got.note === null || !got.note.includes(QUOTED_BUTTON));
      // สวิตช์ปิด (ก่อนเปิด/ถอยสวิตช์) = แถว 4–7 ไม่มีหมายเหตุเลย — N22 ส่งฝ่ายขายไปกดปุ่มที่ยังไม่มี
      if (!SURVEY_CONFIRM_ACTION_READY) assert.equal(got.note, null, JSON.stringify(shape));
    }
    assert.doesNotMatch(JSON.stringify(got), /ไม่ได้เข้าพื้นที่/);
  }
});

test('🔴 N22 ขึ้นตามสวิตช์เท่านั้น — ยามซอร์สกัดกลับไปเป็น `parts.note ?? null` เปล่า (ข้อข้างบนเห็นแค่สวิตช์ค่าปัจจุบัน)', () => {
  const job = code(read('../service/surveyJob.js'));
  assert.match(job, /note: SURVEY_CONFIRM_ACTION_READY \? \(parts\.note \?\? null\) : null,/);
  assert.doesNotMatch(job, /^\s*note: parts\.note \?\? null,/m);
  // ฟังก์ชันล้วนยังคืน N22 (ค่าหลังเปิดสวิตช์) — ผู้เรียกเป็นคนเลือกตามสวิตช์
  const moved = { id: 'DR-a', docNo: 'RQ-1', href: '/requests/DR-a', needed: true };
  assert.equal(surveyConfirmBannerParts(link({ awaiting: 0, moved: 1, movedTo: [moved] }), { n: 3 }).note, N22);
});

test('emphasis ตามมติเจ้าของ B: ฝ่ายขายยังไม่ปิดเรื่อง = รอง · ปิดแล้ว = หลัก — และตอนนั้นแถบปุ่มของหน้าไม่มี "ปิดเรื่อง" ให้แย่ง', () => {
  assert.equal(banner(original({ surveyConfirmLink: link() })).action.emphasis, 'secondary');
  const closed = original({ status: 'closed', closedAt: '2026-10-15T03:00:00Z', surveyConfirmLink: link() });
  assert.equal(banner(closed).action.emphasis, 'primary');
  // ปุ่ม "ปิดเรื่อง" ของหน้าเกิดจาก `canClose` ซึ่งถามว่าฝั่งผู้ขอยังไม่ได้ปิด — ปิดแล้ว = ไม่มีปุ่มหลักนั้น
  assert.match(PAGE, /const canClose = !closeBlocker && req\._mine && !closure\.requesterDone;/);
  assert.equal(requestClosure(closed).requesterDone, true);
  assert.equal(requestClosure(original()).requesterDone, false);
});

test('🔴 แถบเดียวกันจากสองผู้เรียก ทุกคนดู ทุกรูปของ link — แถบไม่รู้จักคนดู (ใครกดได้อยู่ใน link.action ของ server แล้ว)', () => {
  const shapes = [
    undefined,
    { unknown: true },
    link(),
    link({ action: { state: 'blocked', reason: 'มีใบยืนยันหน้างานเปิดอยู่แล้ว', href: HREF } }),
    link({ awaiting: 1, confirmed: 1, moved: 1 }),
    link({ awaiting: 0, confirmed: 3, confirmedBy: [childRef()], action: null }),
    link({ awaiting: 0, confirmed: 1, moved: 2, movedTo: [{ id: 'DR-a', docNo: 'RQ-1', href: '/requests/DR-a', needed: true }] }),
    link({ awaiting: 0, action: null }),
  ];
  for (const shape of shapes) {
    for (const closedAt of [null, '2026-10-15T03:00:00Z']) {
      const request = original({ closedAt, ...(shape === undefined ? {} : { surveyConfirmLink: shape }) });
      const summary = surveyRequestDrawingSummary(request).banner;
      for (const [who, viewer] of VIEWERS) {
        assert.deepEqual(banner(request, viewer), summary, `${who} · ${JSON.stringify(shape)} · ${closedAt}`);
      }
    }
  }
  // ใบลงหน้างานล้วน: สรุปของจอรุ่นเก่ายังว่างทั้งก้อน แม้จะมี link ติดมา
  assert.deepEqual(surveyRequestDrawingSummary(onsite({ surveyConfirmLink: link() })), { banner: null, rows: {} });
  assert.deepEqual(surveyRequestDrawingSummary(onsite({ surveyConfirm: 'needed' })), { banner: null, rows: {} });
});

/* ══ บรรทัดลิงก์สองทาง (`zones.confirmLinks` · `zones.confirmOf`) ══════════════════════════════════════ */

test('R-KEYS: ใบที่ไม่ผูกอะไร (รวมอ่านสถานะไม่สำเร็จ) ไม่มีคีย์ confirmLinks / confirmOf บน zones · ไม่ขึ้นบนสรุปของจอรุ่นเก่า', () => {
  for (const request of [onsite(), original(), original({ surveyConfirmLink: { unknown: true } }), original({ surveyConfirmLink: link() })]) {
    const keys = Object.keys(job(request).zones);
    assert.equal(keys.includes('confirmLinks'), false);
    assert.equal(keys.includes('confirmOf'), false);
  }
  const summary = surveyRequestDrawingSummary(original({ surveyConfirmLink: link({ children: [{ id: 'DR-child', docNo: CHILD_DOC }] }) }));
  assert.deepEqual(Object.keys(summary).sort(), ['banner', 'rows']);
});

test('ลูกของใบต้นทาง: ประโยคจาก lib · ท่อนเลขที่ (หรือ "ร่าง") เป็นลิงก์ · ต่อท่อนกลับได้ประโยคเดิมทุกตัวอักษร', () => {
  const children = [
    { id: 'DR-child', docNo: CHILD_DOC, statusLabel: 'รอรับเรื่อง', href: '/requests/DR-child' },
    { id: 'DR-draft', docNo: null, statusLabel: 'ร่าง', href: '/requests/DR-draft' },
  ];
  const lines = job(original({ surveyConfirmLink: link({ children }) })).zones.confirmLinks;
  assert.deepEqual(lines.map((l) => l.text), [
    `ใบยืนยันหน้างาน: ${CHILD_DOC} · รอรับเรื่อง`,
    'ใบยืนยันหน้างาน: ร่าง', // ร่างไม่มีหาง "· ร่าง" ซ้ำ — ท่อนลิงก์ยังเป็นคำว่า "ร่าง" (linkSegments รับบรรทัดที่ไม่มี " · ")
  ]);
  for (const line of lines) {
    assert.equal(line.segments.map((s) => s.text).join(''), line.text);
    assert.equal(line.segments.filter((s) => s.href).length, 1, 'ท่อนลิงก์ท่อนเดียว');
  }
  assert.deepEqual(lines[0].segments.find((s) => s.href), { text: CHILD_DOC, href: '/requests/DR-child' });
  assert.deepEqual(lines[1].segments.find((s) => s.href), { text: 'ร่าง', href: '/requests/DR-draft' });
  assert.deepEqual([lines[0].docNo, lines[0].href, lines[0].statusLabel], [CHILD_DOC, '/requests/DR-child', 'รอรับเรื่อง']);
  // บรรทัดลูกไม่ผูกกับแถบ — ใบ not_needed ที่มีลูกเก่ายังเห็นบรรทัด
  const old = job(original({ surveyConfirm: 'not_needed', surveyConfirmLink: link({ children: children.slice(0, 1), action: null }) }));
  assert.equal(old.zones.confirmLinks.length, 1);
  assert.equal(old.zones.drawingBanner.action, null);
});

test('ใบยืนยัน: บรรทัด "ยืนยันผลจากแบบของ" ลิงก์ไปใบต้นทาง · ใบต้นทางถูกลบ = N16 ไม่มีลิงก์ ไม่มีคีย์ href', () => {
  const child = onsite({
    id: 'DR-child', docNo: CHILD_DOC, status: 'pending', answeredAt: null,
    surveyConfirmLink: link({ awaiting: 0, action: null, confirmOf: { id: 'DR-orig', docNo: ORIGINAL_DOC, href: '/requests/DR-orig', missing: false } }),
  });
  const of = job(child).zones.confirmOf;
  assert.equal(of.text, `ยืนยันผลจากแบบของ: ${ORIGINAL_DOC}`);
  assert.deepEqual([of.docNo, of.href], [ORIGINAL_DOC, '/requests/DR-orig']);
  assert.deepEqual(of.segments, [{ text: 'ยืนยันผลจากแบบของ: ' }, { text: ORIGINAL_DOC, href: '/requests/DR-orig' }]);
  assert.equal(job(child).zones.drawingBanner, null, 'ใบยืนยันลงหน้างานล้วน ไม่มีแถบ');

  const gone = onsite({
    id: 'DR-child', docNo: CHILD_DOC, status: 'pending', answeredAt: null,
    surveyConfirmLink: link({ awaiting: 0, action: null, confirmOf: { id: 'DR-orig', docNo: null, href: null, missing: true } }),
  });
  const lost = job(gone).zones.confirmOf;
  assert.equal(lost.text, 'ยืนยันผลจากแบบของ: ใบต้นทางถูกลบไปแล้ว');
  assert.equal('href' in lost, false);
  assert.equal(lost.docNo, null);
  assert.deepEqual(lost.segments, [{ text: lost.text }]);
});

/* ══ ยามอ่านซอร์ส — SurveyRequestView ═════════════════════════════════════════════════════════════════ */

test('D-2 ปุ่มบนแถบ: สามเงื่อนไข · ปุ่มเดียวสองสภาพผ่าน GatedAction · navy เป็นโทน ไม่ใช่ variant', () => {
  const bannerSrc = between(VIEW, 'export function SurveyDrawingBanner', 'function ConfirmLinks');
  assert.match(bannerSrc, /const confirm = banner\.action\?\.ready === true && banner\.action\.state && typeof onConfirm === "function" \? banner\.action : null;/);
  assert.match(bannerSrc, /<GatedAction\s+tone=\{confirm\.emphasis === "primary" \? "primary" : undefined\}\s+variant=\{confirm\.emphasis === "primary" \? "filled" : "outline"\}/);
  assert.match(bannerSrc, /blocker=\{confirm\.state === "blocked" \? confirm\.reason : ""\}/);
  assert.match(bannerSrc, /onClick=\{\(\) => onConfirm\(confirm\)\}/);
  assert.match(bannerSrc, /aria-disabled=\{confirm\.state === "blocked" \? "true" : undefined\}/);
  assert.doesNotMatch(bannerSrc, /<Button\b/, 'ปุ่มเดียว ไม่มีกิ่งปุ่มธรรมดา');
  assert.doesNotMatch(bannerSrc, /ActionControl/, 'ActionControl บังคับโทน neutral');
  assert.doesNotMatch(VIEW, /variant="primary"/);
  // จอรุ่นเก่าไม่ส่งตัวกด (ไม่ถูก mount กับประเมินพื้นที่อยู่แล้ว — รั้วราคาถูก)
  assert.match(DETAIL, /<SurveyDrawingBanner banner=\{summary\.banner\} \/>/);
  assert.doesNotMatch(DETAIL, /onConfirm=/);
});

test('D-2 refs: ลิงก์ต่อท้ายประโยค (หลังนิพจน์ keep/thaiText เดิม) ก่อนหมายเหตุ · คั่นด้วย " · "', () => {
  const bannerSrc = between(VIEW, 'export function SurveyDrawingBanner', 'function ConfirmLinks');
  const textAt = bannerSrc.indexOf('{banner.keep?.length ? keepPhrases(banner.text, banner.keep) : thaiText(banner.text)}');
  const refsAt = bannerSrc.indexOf('{banner.refs?.length ? (');
  const noteAt = bannerSrc.indexOf('{banner.note ? <span className={styles.bannerNote}>');
  assert.ok(textAt > -1 && refsAt > textAt && noteAt > refsAt, 'ประโยค → เลขที่ → หมายเหตุ');
  const refs = bannerSrc.slice(refsAt, noteAt);
  assert.match(refs, /\{" "\}/);
  assert.match(refs, /\{index \? " · " : null\}/);
  assert.match(refs, /<Link className=\{`linklike \$\{styles\.docRef\} \$\{styles\.bannerRef\}`\} href=\{ref\.href\}>\{ref\.docNo\}<\/Link>/);
});

test('D-2 b บรรทัดลิงก์: คอมโพเนนต์เดียว วางตามสภาพของใบ (ยังไม่ส่ง = อย่างแรกใต้หัวการ์ด · ส่งแล้ว = ติดเหนือแถบ) · ลิงก์จาก segments', () => {
  const links = between(VIEW, 'function ConfirmLinks', 'function ZonesTable');
  assert.match(links, /zones\.confirmOf \? \[zones\.confirmOf\] : \[\]/);
  assert.match(links, /zones\.confirmLinks \|\| \[\]/);
  assert.match(links, /<Link key=\{at\} className=\{`linklike \$\{styles\.docRef\} \$\{styles\.lineRef\}`\} href=\{part\.href\}>\{part\.text\}<\/Link>/);
  assert.match(links, /thaiText\(part\.text\)/);
  assert.equal((VIEW.match(/<ConfirmLinks zones=\{zones\} \/>/g) || []).length, 2, 'สองที่ที่สลับกันด้วยสภาพเดียว');
  const stack = between(VIEW, '<div className={styles.zoneStack}>', '<ZonesTable zones={zones} />');
  assert.match(stack, /^<div className=\{styles\.zoneStack\}>\s*\{zones\.sent \? null : <ConfirmLinks zones=\{zones\} \/>\}/);
  assert.match(stack, /\{zones\.sent \? <ConfirmLinks zones=\{zones\} \/> : null\}\s*\{zones\.drawingBanner \? <SurveyDrawingBanner/);
  // คลาสใหม่ใช้โทเคนเท่านั้น
  const sheet = css('../../components/requests/details/surveyRequest.module.css');
  // เลขที่ที่เป็นลิงก์ห้ามขาดที่ขีด (UAT S5 sales รอบ 1 · K05 375)
  assert.match(rule(sheet, '.docRef'), /white-space: nowrap;/);
  // เลขที่กลางบรรทัดลิงก์เว้นสองข้างเท่าวงโฟกัส — วงเคยทับ ":" กับ "·" (UAT S5 head รอบ 1 K10/K03 focus)
  assert.match(rule(sheet, '.lineRef'), /margin-inline: var\(--space-1\);/);
  for (const selector of ['.confirmLinks', '.confirmLink', '.docRef', '.lineRef']) {
    assert.doesNotMatch(rule(sheet, selector), /#[0-9a-fA-F]{3,8}\b|rgba?\(|line-height: [\d.]|\d+px/, selector);
  }
  // view ยังไม่นำทาง ไม่ยิง API เอง (เปลือกพาไป)
  assert.doesNotMatch(VIEW, /router\.|useRouter|apiFetch|apiJson/);
});

/* ══ หน้าคำร้อง (เปลือก) ════════════════════════════════════════════════════════════════════════════ */

test('D-3 หน้าคำร้อง: router ของหน้า · ตัวกดพาไป href ของปุ่ม · ฟอร์มแก้ของใบยืนยันได้ confirmLock (ช่องวิธีเฉพาะร่าง)', () => {
  assert.match(PAGE, /import \{ useParams, useRouter \} from "next\/navigation";/);
  assert.match(PAGE, /const \{ id \} = useParams\(\);\s*const router = useRouter\(\);/);
  const kindView = PAGE.slice(PAGE.indexOf('<KindView'), PAGE.indexOf('/>', PAGE.indexOf('<KindView')));
  assert.match(kindView, /onDrawingConfirm=\{\(action\) => router\.push\(action\.href\)\}/);
  const edit = between(PAGE, '<RequestForm\n            mode="edit"', '\n          />');
  assert.match(edit, /confirmLock=\{req\.surveyConfirmLink\?\.confirmOf \? \{\s*mode: "edit",/);
  assert.match(edit, /original: \{ docNo: req\.surveyConfirmLink\.confirmOf\.docNo, missing: req\.surveyConfirmLink\.confirmOf\.missing \},/);
  assert.match(edit, /showMethod: req\.status === "draft",/);
  assert.match(edit, /\} : null\}/);
});

/* ══ ฟอร์ม (โหมดล็อก) ══════════════════════════════════════════════════════════════════════════════ */

test('D-5 ฟอร์ม: โหมดล็อกซ่อนบล็อกไทล์ทั้งสองกิ่ง · ไม่มีป้าย "ดีล" ซ้ำ · ช่องเส้นประของงวด · ไม่โหลดลิสต์ในโหมดสร้าง', () => {
  assert.match(FORM, /confirmLock = null,/);
  assert.match(FORM, /\{variants && !confirmLock && \(/);
  // ช่องที่มาแทน: "ยืนยันผลจากแบบของ" เสมอ · "วิธีประเมิน" เฉพาะฟอร์มสร้าง/ร่าง — ป้าย/ค่ามาจากทะเบียนหัวข้อ
  const lockBlock = between(FORM, '{confirmLock && (', '{needsQuotation && (');
  assert.match(lockBlock, /label=\{SURVEY_CONFIRM_OF_LABEL\}/);
  assert.match(lockBlock, /value=\{confirmLock\.original\?\.missing \? SURVEY_CONFIRM_ORIGINAL_MISSING : confirmLock\.original\?\.docNo\}/);
  assert.match(lockBlock, /\{\(confirmLock\.mode === "create" \|\| confirmLock\.showMethod\) && \(/);
  assert.match(lockBlock, /label=\{requestVariantFieldLabel\(kind\)\} from=\{SURVEY_CONFIRM_CHILD_LABEL\}/);
  assert.match(lockBlock, /value=\{requestVariantLabel\(value\)\} hint=\{SURVEY_CONFIRM_FORM_HINT\}/);
  assert.doesNotMatch(lockBlock, /<OptionTiles|requestVariantAskedLabel/);
  // ดีล: ป้ายของตัวเลือกไม่วาด · ช่องเส้นประของงวดมาก่อนกิ่งโหมดแก้ · ประโยค N18 แทนคำใบ้โครงการ
  assert.match(FORM, /\{!isEdit && !confirmLock && <span className=\{styles\.fieldLabel\}>ดีล<\/span>\}/);
  assert.match(FORM, /value=\{confirmLock\.mode === "create" \? confirmLock\.original\?\.dealLabel : \(lockedRefs\.deal \|\| ""\)\}/);
  assert.match(FORM, /\{value\.dealId && !value\.projectId && !dealLock && \(/);
  assert.match(FORM, /value=\{selectedDeal\?\.customerName \|\| lockedRefs\.customer \|\| confirmLock\?\.original\?\.customerName \|\| ""\}/);
  // บล็อกสถานที่: อ่านอย่างเดียว · สร้างสถานที่ไม่ได้ · โหมดสร้างไม่ส่งลูกค้า (ไม่ยิงลิสต์ · นิ่งทันที — R4)
  const site = between(FORM, '<SurveySiteFields', '/>');
  assert.match(site, /customerId=\{confirmLock\?\.mode === "create" \? null : \(selectedDeal\?\.customerId \|\| lockedRefs\.customerId \|\| null\)\}/);
  assert.match(site, /readOnly=\{isEdit \|\| !!confirmLock\}/);
  assert.match(site, /confirmLock=\{confirmLock\}/);
  assert.match(site, /canCreateSite=\{confirmLock \? false : !isEdit && canCreateServiceSite\(me\)\}/);
  // ไม่ดึงตัวสลับวิธีของ S2b (ไม่อยู่ในรายชื่อจอที่ดึงได้)
  assert.doesNotMatch(RAW.FORM, /from "@\/lib\/service\/surveyMethodSwitch"/);
});

test('D-6 SurveySiteFields: กิ่งสร้างไม่พึ่งลิสต์ที่โหลด · ประโยคปิดท้ายประโยคเดียว · ตัวโหลดสองตัวไม่ถูกแตะ', () => {
  assert.match(SITE, /confirmLock = null,/);
  const readOnly = between(SITE, 'if (readOnly) {', '\n  return (\n');
  assert.match(readOnly, /const fromPlan = confirmLock\?\.mode === "create";/);
  assert.match(readOnly, /\{fromPlan \? naText\(confirmLock\.original\?\.siteLabel\)/);
  assert.match(readOnly, /\[planOf\(row\)\?\.code, floorLabel\(planOf\(row\)\?\.floor\)\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(readOnly, /planOf\(row\)\?\.previous \? <small className=\{styles\.hint\}>\{planOf\(row\)\.previous\}<\/small> : null/);
  // กิ่งสร้างไม่มีคำสำรอง "พื้นที่เดิม" (คำนั้นอยู่แต่ในกิ่งเดิม)
  const planBranch = between(readOnly, '{fromPlan ? (', ') : (');
  assert.doesNotMatch(planBranch, /พื้นที่เดิม|siteZones/);
  // ประโยคปิดท้าย: ใบยืนยัน (ใบต้นทางยังอยู่) = N19 เท่านั้น · ประโยค freshDraft ของ S4 อยู่ในอีกกิ่ง
  const closing = between(readOnly, '{confirmLock && !confirmLock.original?.missing ? (', '</div>');
  const lockOnly = closing.slice(0, closing.indexOf(') : ('));
  assert.match(lockOnly, /surveyConfirmZonesLockText\(confirmLock\.original\)/);
  assert.doesNotMatch(lockOnly, /freshDraft|แก้ที่นี่ไม่ได้/);
  // ตัวโหลดสองตัวยังออกทันทีเมื่อไม่มีลูกค้า (โหมดสร้างของใบยืนยันส่ง null มา)
  assert.match(SITE, /useEffect\(\(\) => \{\n\s*if \(!customerId\) \{ setSites\(\[\]\); return undefined; \}/);
  assert.match(SITE, /useEffect\(\(\) => \{\n\s*if \(!customerId\) \{ setRegistry\(null\); setRegistryError\(""\); return undefined; \}/);
  assert.match(SITE, /const settled = !customerId \|\| \(sitesFor === customerId && registryFor === customerId\);/);
});

/* ══ หน้าเปิดคำร้อง ?confirms= ══════════════════════════════════════════════════════════════════════ */

/* หยิบฟังก์ชันล้วนออกจากซอร์สแล้วรันตรง ๆ (ไฟล์มี JSX — import ใต้ Node ไม่ได้) · ฟังก์ชันนี้ไม่อ้างชื่ออื่นในไฟล์ */
const confirmLockDefaults = (() => {
  const src = between(RAW.NEW, 'function confirmLockDefaults(plan) {', '\n}\n') + '\n}';
  return new Function(`${src}\nreturn confirmLockDefaults;`)();
})();

test('D-4 ค่าล็อก: variant standard · zoneId + ชื่อเท่านั้น · id ของใบต้นทางไม่อยู่ในฟอร์ม · pristine คิดจากค่าชุดเดียวกัน', () => {
  const plan = {
    original: { id: 'DR-orig', docNo: ORIGINAL_DOC, dealId: 'DL-1', siteId: 'SS-1', dealLabel: 'DL-1 — โรงแรม' },
    title: `ยืนยันหน้างาน — ${ORIGINAL_DOC}`,
    zones: [{ zoneId: 'ZN-1', name: 'Lobby', code: 'ZN-1160-10301', floor: '01', previous: 'รอบจากแบบ' }],
  };
  assert.deepEqual(confirmLockDefaults(plan), {
    kind: 'site_survey', variant: 'standard', dealId: 'DL-1', siteId: 'SS-1',
    title: `ยืนยันหน้างาน — ${ORIGINAL_DOC}`, zones: [{ zoneId: 'ZN-1', name: 'Lobby' }],
  });
  assert.equal(JSON.stringify(confirmLockDefaults(plan)).includes('confirms'), false);
  assert.doesNotMatch(between(RAW.FORM, 'export const emptyRequestForm', '});'), /confirmsRequestId/);
  // pristine กับฟอร์มที่ตั้งครั้งแรกมาจาก confirmLockDefaults ตัวเดียวกัน
  assert.match(NEW, /const confirmDefaults = useMemo\(\(\) => \(confirmData \? confirmLockDefaults\(confirmData\) : null\), \[confirmData\]\);/);
  assert.match(NEW, /const pristine = useMemo\(\(\) => JSON\.stringify\(emptyRequestForm\(\n\s*confirmDefaults \|\| \(defaultVariant \? \{ \.\.\.defaults, variant: defaultVariant \} : defaults\),/);
  assert.match(NEW, /const lock = confirmLockDefaults\(plan\);/);
  assert.match(NEW, /setForm\(\(prev\) => \(first \? emptyRequestForm\(lock\) : \{/);
});

test('🔴 D-4 F14: ?confirms= ตรวจรูปก่อนเป็น path · ไม่ผ่าน = ไม่ยิงอะไร (รวมทะเบียนของหน้า) · path ประกอบด้วย encodeURIComponent', () => {
  assert.match(NEW, /const confirms = \(searchParams\.get\("confirms"\) \|\| ""\)\.trim\(\)\.slice\(0, 120\);/);
  assert.match(NEW, /const confirmsBad = !!confirms && !SURVEY_CONFIRM_ID_PATTERN\.test\(confirms\);/);
  const testAt = NEW.indexOf('SURVEY_CONFIRM_ID_PATTERN.test(confirms)');
  const fetchAt = NEW.indexOf('/confirm-plan');
  assert.ok(testAt > -1 && fetchAt > testAt, 'ตรวจรูปก่อนยิง');
  assert.match(NEW, /apiJson\(`\/api\/sa\/requests\/\$\{encodeURIComponent\(confirms\)\}\/confirm-plan`/);
  assert.doesNotMatch(NEW, /`\/api\/[^`]*\$\{confirms\}/, 'ไม่มี path ของ API ที่ใส่ค่าดิบ');
  // ทั้งสองตัวยิงของหน้าออกก่อนเมื่อรูปไม่ผ่าน · ค่าเริ่มของแผน = ประโยค N4 ทันที (ไม่มีรอบโหลด)
  assert.match(NEW, /useEffect\(\(\) => \{\n\s*if \(confirmsBad\) return;\n\s*const grab = /);
  assert.match(NEW, /if \(!confirms \|\| confirmsBad\) return undefined;/);
  assert.match(NEW, /useState\(\(\) => \(confirmsBad\n\s*\? \{ ok: false, error: SURVEY_CONFIRM_NO_ORIGINAL, open: null, original: null \}/);
  // ลิงก์ที่แต่งมาไม่ผ่านรูป · id จริงผ่าน
  for (const bad of ['../../production/jobs%3FautoDraft=1%23', 'DR-1/../x', 'DR-1?x=1', 'DR-1#x', 'DR-1.json', '']) {
    assert.equal(SURVEY_CONFIRM_ID_PATTERN.test(bad), false, bad);
  }
  assert.equal(SURVEY_CONFIRM_ID_PATTERN.test('DR-3f2b8c9e-1a2b-4c3d-9e8f-0123456789ab'), true);
});

test('D-4 บันทึก: id ใบต้นทางไปทาง extra · บันทึกไม่ผ่าน = ถามแผนซ้ำหนึ่งครั้ง (ยัง 200 คงฟอร์ม · ถูกปฏิเสธ = กล่องแจ้ง)', () => {
  // กิ่งงวดชำระ = ไทล์ที่เลือก (PR-2 ของขอเอกสารจากหน้า QT · 28/10) — ใบยืนยันหน้างานยังมาก่อนเสมอ
  assert.match(NEW, /createRequestDraft\(\n\s*form, confirmData \? \{ confirmsRequestId: confirms \} : installmentExtra,\n\s*\)/);
  const save = between(NEW, 'const saveDraft = async', '} catch (e) {');
  const refetchAt = save.indexOf('if (error && confirmData) setConfirmTick((n) => n + 1);');
  const toastAt = save.indexOf('if (error) { setToast({ kind: "error", msg: confirmData ? refusalText(error) : error }); return; }');
  assert.ok(refetchAt > -1 && toastAt > refetchAt);
  // ถามซ้ำได้ 200: คงที่พิมพ์ไว้ (ชื่อเรื่อง วันที่ รายละเอียด) เปลี่ยนเฉพาะช่องล็อก
  assert.match(NEW, /\.\.\.prev, kind: lock\.kind, variant: lock\.variant, dealId: lock\.dealId, siteId: lock\.siteId, zones: lock\.zones,/);
  assert.match(NEW, /\}, \[confirms, confirmsBad, confirmTick\]\);/);
});

test('D-4 จอ: ชื่อหน้า/คำโปรย/ลิงก์จากค่าคงที่ · ถูกปฏิเสธ = กล่องเตือนกล่องเดียว ไม่มีฟอร์ม · ฟอร์มล็อกไม่มีปุ่มเปลี่ยนหัวข้อ', () => {
  assert.match(NEW, /title=\{confirms \? SURVEY_CONFIRM_ACTION_LABEL : "เปิดคำร้อง"\}/);
  assert.match(NEW, /confirmOriginal \? keepPhrases\(surveyConfirmSubtitle\(confirmOriginal\), SURVEY_CONFIRM_WRAP_KEEP\) : undefined/);
  assert.match(NEW, /back=\{\{ href: confirms && \(!confirmRefused \|\| confirmRefused\.original\) \? originalHref : returnTo, label: "กลับ" \}\}/);
  assert.match(NEW, /const originalHref = confirms && !confirmsBad \? `\/requests\/\$\{encodeURIComponent\(confirms\)\}` : returnTo;/);
  const refusal = between(NEW, 'const confirmBody = ', 'return (');
  assert.match(refusal, /confirmLoading \? <SkeletonRows rows=\{6\} \/>/);
  assert.match(refusal, /<StatusNotice tone="warning">/);
  // วลีของงวดห้ามขาดกลางในประโยคปฏิเสธ ("หน้า|งาน" ที่ 375 · UAT S5 sales รอบ 1 K08) — ไม่มีวลี = thaiText เดิม
  assert.match(refusal, /\{refusalText\(confirmRefused\.error\)\}/);
  assert.match(NEW, /const DOC_CODE = \/\[A-Z\]\{2,\}\(\?:-\[A-Z0-9\]\+\)\+\/g;\n\s*const refusalText = \(text\) => \{\n\s*const kept = keepPhrases\(text, \[\.\.\.SURVEY_CONFIRM_WRAP_KEEP, \.\.\.\(String\(text \?\? ""\)\.match\(DOC_CODE\) \|\| \[\]\)\]\);\s*return kept === text \? thaiText\(text\) : kept;/);
  assert.match(FORM, /hint=\{keepPhrases\(surveyConfirmDealHint\(confirmLock\.original\), SURVEY_CONFIRM_WRAP_KEEP\)\}/);
  assert.match(refusal, /surveyConfirmOpenLinkText\(confirmRefused\.open\)/);
  assert.match(refusal, /href=\{`\/requests\/\$\{encodeURIComponent\(confirmRefused\.open\.id\)\}`\}/);
  assert.match(refusal, /\{confirmRefused\.original \? \(\s*<Link className="linklike" href=\{originalHref\}>\{surveyConfirmBackLinkText\(confirmRefused\.original\)\}<\/Link>/);
  assert.match(NEW, /\{confirmBody \|\| \(\n\s*<DetailPageLayout/, 'โหลด/ปฏิเสธ = ไม่มีฟอร์มและแผงบันทึก');
  assert.match(NEW, /lockKind=\{!!confirmData\}/);
  assert.match(NEW, /confirmLock=\{confirmData \? \{ mode: "create", original: confirmData\.original, zones: confirmData\.zones \} : null\}/);
  assert.match(NEW, /topicAction=\{confirmData \? null : revealed \? \{/);
  // ประโยคที่ใช้มีจริงและพูดตามแผน (ป้ายกับตัวประกอบอยู่ไฟล์เดียว)
  assert.equal(surveyConfirmSubtitle({ docNo: ORIGINAL_DOC }), `ใบยืนยันหน้างานของ ${ORIGINAL_DOC} — บันทึกเป็นร่างก่อน เลขที่ออกตอนกดส่ง`);
  assert.equal(surveyConfirmDealHint({ docNo: ORIGINAL_DOC }), `ดีล ลูกค้า และสถานที่ยกมาจากใบ ${ORIGINAL_DOC} — เปลี่ยนที่นี่ไม่ได้`);
  assert.match(surveyConfirmZonesLockText({ docNo: ORIGINAL_DOC }), new RegExp(`^พื้นที่ชุดนี้ยกมาจากใบ ${ORIGINAL_DOC} ทั้งหมด`));
  const sheet = css('../../app/requests/new/page.module.css');
  assert.doesNotMatch(rule(sheet, '.refusalLinks'), /#[0-9a-fA-F]{3,8}\b|rgba?\(|\d+px/);
});

test('UAT S5 sales รอบ 2: วลีห้ามขาดของ N19 · N17 · N4 · N15 ถูกห่อจริง · ทุกจุดวาดผ่าน keepPhrases · ปุ่มติดด่านตอนโฟกัสป้ายยังจาง', () => {
  const kept = (text) => phraseRuns(text, SURVEY_CONFIRM_WRAP_KEEP).filter((r) => r.keep).map((r) => r.text);
  assert.deepEqual(kept(surveyConfirmZonesLockText({ docNo: ORIGINAL_DOC })), ['เพิ่มที่นี่ไม่ได้', 'ประเมินจากแบบ', 'ใบยืนยันหน้างาน']);
  assert.deepEqual(kept(surveyConfirmSubtitle({ docNo: ORIGINAL_DOC })), ['ใบยืนยันหน้างาน', 'บันทึกเป็นร่างก่อน']);
  assert.deepEqual(kept(SURVEY_CONFIRM_NO_ORIGINAL), ['ใบยืนยันหน้างาน', 'ถูกลบไปแล้ว']);
  assert.deepEqual(kept('อ่านสถานะใบยืนยันหน้างานไม่สำเร็จ — โหลดหน้าใหม่'), ['ใบยืนยันหน้างาน', 'โหลดหน้าใหม่']);
  assert.match(SITE, /\{keepPhrases\(surveyConfirmZonesLockText\(confirmLock\.original\), SURVEY_CONFIRM_WRAP_KEEP\)\}/);
  assert.match(VIEW, /const keepNote = \(note\) => \{\n\s*const kept = keepPhrases\(note, SURVEY_CONFIRM_WRAP_KEEP\);\n\s*return kept === note \? thaiText\(note\) : kept;/);
  assert.match(VIEW, /><span className=\{styles\.actionLabel\}>\{confirm\.label\}<\/span><\/GatedAction>/);
  const sheet = css('../../components/requests/details/surveyRequest.module.css');
  assert.match(rule(sheet, '.action[data-blocked]:focus-visible'), /opacity: 1;/);
  assert.match(rule(sheet, '.action[data-blocked]:focus-visible .actionLabel'), /opacity: var\(--op-disabled\);/);
  assert.match(rule(sheet, '.bannerRef'), /margin-inline-start: var\(--space-1\);/);
});

/* ══ F1: ไม่มีจอไหนของกลุ่มนี้พิมพ์ประโยคของงวดเอง · apiFetch เท่านั้น ═════════════════════════════════════ */

test('🔴 F1: ห้าไฟล์ของกลุ่ม D ไม่ถือประโยคของงวด S5 เป็นลิเทอรัล — ทุกคำมาจาก surveyConfirmLink.js · ไม่มี fetch ดิบ', () => {
  const files = [['RequestForm', FORM], ['SurveySiteFields', SITE], ['requests/new', NEW], ['SurveyRequestView', VIEW], ['surveyJob', JOB]];
  const phrases = [
    'ใบต้นทางถูกลบไปแล้ว', 'จากใบต้นทาง', 'ใบยืนยันหน้างาน:', 'ใบยืนยันหน้างานของ', 'ยกมาจากใบ', 'พื้นที่ชุดนี้',
    'ยืนยันผลจากแบบของ', 'ลงหน้างานเท่านั้น', 'ไม่พบใบต้นทาง',
  ];
  for (const [name, src] of files) {
    for (const phrase of phrases) assert.ok(!src.includes(phrase), `${name}: ${phrase}`);
    assert.doesNotMatch(src, /["'`]เปิดใบ |["'`]กลับไปที่ใบ/, name);
    assert.doesNotMatch(src, /(^|[^.\w])fetch\(/, `${name}: เรียก API ผ่าน apiFetch/apiJson เท่านั้น`);
  }
  // "ไม่ได้เข้าพื้นที่" ของนัดที่ทำไม่ได้ (surveyJob.js) เป็นของเดิม — หน้าใหม่ของงวดนี้ไม่มีคำนี้ (ค่าที่แถบวาดตรวจในเทสต์ F5 ข้างบน)
  assert.doesNotMatch(NEW, /ไม่ได้เข้าพื้นที่/);
  // surveyJob.js ทิ้งสำเนาชื่อปุ่มของตัวเองแล้ว — ใช้ค่าคงที่ของงวด
  assert.doesNotMatch(JOB, /CONFIRM_ACTION_LABEL = /);
  assert.match(JOB, /SURVEY_CONFIRM_ACTION_LABEL, surveyConfirmBannerParts, surveyConfirmChildLine, surveyConfirmOfLine,/);
  // แถบไม่รู้จักคนดู — ผู้เรียกสองที่ส่งสามตัวเลือกเดิม
  assert.equal((JOB.match(/surveyDrawingBanner\(request, \{ show: /g) || []).length, 2);
  assert.match(JOB, /function surveyDrawingBanner\(request, \{ show = false, count = 0, dept = 'TS' \} = \{\}\) \{/);
  // คีย์ใหม่ทุกตัวผ่าน spread แบบมีเงื่อนไข (R-KEYS)
  assert.match(JOB, /\.\.\.\(parts\.refs\.length \? \{ refs: parts\.refs \} : \{\}\)/);
  assert.match(JOB, /\.\.\.\(confirmLinks\.length \? \{ confirmLinks \} : \{\}\), \.\.\.\(confirmOf \? \{ confirmOf \} : \{\}\)/);
});
