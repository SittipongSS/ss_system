// ── ด่านของใบประเมิน × วิธีประเมินรายพื้นที่ (mig 0408 · แผน survey-desk-assessment §2 · งวด S1) ──
//
// ⭐ พื้นที่ที่ **ประเมินจากแบบ** หัวหน้าทำเองที่โต๊ะ ไม่มีใครไปยืนหน้างาน ⇒ ด่านที่ต้องยืนหน้างานถึงทำได้
//   (ภาพกว้าง · จุดที่ติดตั้งได้ · เลือกจุด · รูปจุด) ไม่ใช้กับมัน · ข้อที่เหลือ (ขนาด · ภาพแบบ · แพ็คเกจ)
//   เป็นของหัวหน้าทั้งหมด · ช่างไม่มีอะไรค้างที่พื้นที่แบบนี้เลย
// 🔴 **ใบที่ลงหน้างานล้วนต้องเหมือนเดิมทุกตัวอักษร** — แถวเก่าไม่มีคีย์ `method` เลย ⇒ ทุกเทสต์ที่นี่
//   เทียบสามแบบ: ไม่มีคีย์ · `'onsite'` · คอลัมน์ใหม่ครบแต่เป็น null
// ⚠️ งวดนี้ยังไม่มีเส้นไหนทำให้แถวเป็น `'drawing'` ได้ (งวด S2a) — กฎทั้งหมดพิสูจน์ด้วย fixture เท่านั้น
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEND_BACK_KIND, SURVEY_GATES,
  normalizeSurveySpots, surveyCrewGaps, surveyFieldMissing, surveyFieldProgress, surveyFieldSubmitError,
  surveyGateChecklist, surveyResultMissing, surveySendBackDoneError, surveySendBackOnSheet, surveySendBackState,
  surveySendError,
} from './survey.js';
import {
  SPOT_GATE_LINKED, SPOT_GATE_PHOTOS, surveySpotGates, surveySpotPhotoGaps, surveySpotSendError,
  surveySpotSubmitError,
} from './surveySpotPhotos.js';

/* ══ fixture ═════════════════════════════════════════════════════════════ */

/* วิธีประเมินสามแบบที่แถวจริงมีได้ — `absent` คือแถวก่อน mig 0408 / fixture เก่า (ไม่มีคีย์เลย) */
const METHODS = {
  absent: {},
  onsite: { method: 'onsite' },
  drawing: { method: 'drawing' },
};
const ONSITE_SPELLINGS = [
  ['ไม่มีคีย์ method', {}],
  ['method onsite', { method: 'onsite' }],
  ['คอลัมน์ใหม่ครบแต่ null', { method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }],
];
const STATUSES = ['ok', 'cut', 'added'];

const part = (w, l, h) => ({ id: 'p1', widthM: w, lengthM: l, heightM: h, label: null });
const file = (docType, fileName, mimeType, extra = {}) => ({ id: `F-${fileName}`, docType, fileName, mimeType, ...extra });
const WIDE_JPG = file('survey_wide', 'wide.jpg', 'image/jpeg');
const WIDE_HEIC = file('survey_wide', 'wide.heic', 'image/heic');
const PLAN_JPG = file('survey_plan', 'plan.jpg', 'image/jpeg');
const PLAN_PNG = file('survey_plan', 'plan.png', 'image/png');
const PLAN_PDF = file('survey_plan', 'plan.pdf', 'application/pdf');
const PLAN_TIFF = file('survey_plan', 'plan.tif', 'image/tiff');
const PLAN_HEIC = file('survey_plan', 'plan.heic', 'image/heic');
const spotPhoto = (id, spotId) => ({
  id, docType: 'survey_spot', fileName: `${id}.jpg`, mimeType: 'image/jpeg', createdAt: '2026-10-09T02:00:00+00:00',
  metadata: spotId === undefined ? {} : { spotId },
});
/* ชุดไฟล์ของตาราง — ชุดละไฟล์เดียว เพื่อให้เห็นว่าไฟล์ชนิดไหนปลดด่านข้อไหน */
const FILES = {
  none: [],
  wideJpg: [WIDE_JPG],
  planJpg: [PLAN_JPG],
  planPdf: [PLAN_PDF],
  planTiff: [PLAN_TIFF],
  planHeic: [PLAN_HEIC],
  spotLinked: [spotPhoto('S1', 's1')],
  spotUnlinked: [spotPhoto('S2')],
};
const ANY_PLAN = ['planJpg', 'planPdf', 'planTiff', 'planHeic'];

/** พื้นที่ที่ยังไม่มีอะไรเลย — ติดทุกข้อที่ใช้กับมัน */
const empty = (over = {}) => ({ id: 'Z1', zoneName: 'ล็อบบี้', status: 'ok', parts: [], spots: [], packageQty: null, ...over });
/** พื้นที่ที่ผ่านทุกข้อที่ไม่ใช่ไฟล์ (ขนาด · จุด · จุดที่เลือก · แพ็คเกจตรงกับที่ระบบเสนอ) */
const full = (over = {}) => ({
  id: 'Z1', zoneName: 'ล็อบบี้', status: 'ok',
  parts: [part(10, 10, 3)], spots: [{ id: 's1', label: 'เสากลาง', selected: true }],
  packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: null, ...over,
});
const drawing = (over = {}) => full({ method: 'drawing', ...over });

const T = {
  size0: 'ยังไม่ได้วัดขนาด — เพิ่มอย่างน้อยหนึ่งส่วน',
  resave: 'พื้นที่นี้เพิ่งกลับมาเป็นลงหน้างาน — ตรวจขนาดกับของจริงแล้วกดบันทึกอีกครั้ง',
  wide: 'ยังไม่มีภาพกว้าง',
  spots: 'ยังไม่ได้ระบุจุดที่ติดตั้งได้',
  plan: 'ยังไม่มีภาพผังที่มาร์กจุดแล้ว',
  planDrawing: 'ยังไม่มีภาพแบบของพื้นที่ (ต้องเป็นรูป JPG/PNG — ไฟล์ PDF/TIFF ลงเอกสารไม่ได้)',
  picked: 'ยังไม่ได้เลือกจุดที่จะติดตั้ง',
  pkg: 'ยังไม่ได้เคาะแพ็คเกจ',
};
const ONSITE_ONLY_TEXTS = [T.wide, T.spots, T.picked, T.plan, T.resave];

const gate = (key) => SURVEY_GATES.find((g) => g.key === key);
const byKey = (list) => Object.fromEntries(list.map((g) => [g.key, g]));

/* ══ ทะเบียนด่าน ═════════════════════════════════════════════════════════ */

test('🔴 ทะเบียนหกข้อ: ลำดับ · key · short · owner · label เดิมทุกตัวอักษร', () => {
  assert.deepEqual(SURVEY_GATES.map((g) => [g.key, g.short, g.owner, g.label]), [
    ['size', 'ขนาด', 'crew', 'ขนาด ก × ย × ส ครบทุกพื้นที่'],
    ['wide', 'ภาพกว้าง', 'crew', 'ภาพกว้างครบทุกพื้นที่'],
    ['spots', 'จุดติดตั้ง', 'crew', 'จุดที่ติดตั้งได้ อย่างน้อย 1 จุดต่อพื้นที่'],
    ['plan', 'ภาพผัง', 'head', 'ภาพผังที่มาร์กจุดแล้ว'],
    ['picked', 'เลือกจุด', 'head', 'เลือกจุดที่จะติดตั้งแล้ว'],
    ['package', 'แพ็คเกจ', 'head', 'เคาะขนาดและจำนวนแพ็คเกจแล้ว'],
  ]);
  /* ชื่อข้อของพื้นที่จากแบบ — เป็นข้อมูลของทะเบียน (จอไม่ตั้งชื่อเอง) · มีที่ข้อผังข้อเดียว */
  assert.deepEqual([gate('plan').drawingLabel, gate('plan').drawingShort], ['ภาพแบบของพื้นที่', 'ภาพแบบ']);
  for (const g of SURVEY_GATES.filter((x) => x.key !== 'plan')) {
    assert.deepEqual([g.drawingLabel, g.drawingShort], [undefined, undefined], g.key);
  }
});

test('🔑 ทะเบียน: ข้อไหนใช้กับพื้นที่จากแบบ · ใครเป็นเจ้าของ — ตารางเดียว ทุกวิธี × ทุกสถานะ', () => {
  /* [key, ใช้กับลงหน้างาน, ใช้กับจากแบบ, เจ้าของตอนลงหน้างาน] — พื้นที่จากแบบ หัวหน้าเป็นเจ้าของทุกข้อ */
  const table = [
    ['size', true, true, 'crew'],
    ['wide', true, false, 'crew'],
    ['spots', true, false, 'crew'],
    ['plan', true, true, 'head'],
    ['picked', true, false, 'head'],
    ['package', true, true, 'head'],
  ];
  assert.deepEqual(table.map((r) => r[0]), SURVEY_GATES.map((g) => g.key), 'ตารางต้องครบทุกข้อของทะเบียน');
  for (const [key, onsiteApplies, drawingApplies, declared] of table) {
    const g = gate(key);
    for (const [name, method] of Object.entries(METHODS)) {
      for (const status of STATUSES) {
        const row = empty({ status, ...method });
        const isDrawing = name === 'drawing';
        assert.equal(g.applies(row), isDrawing ? drawingApplies : onsiteApplies, `applies · ${key} · ${name} · ${status}`);
        assert.equal(g.ownerOf(row), isDrawing ? 'head' : declared, `ownerOf · ${key} · ${name} · ${status}`);
      }
    }
    /* ค่าที่ "เกือบใช่" = ลงหน้างาน (ตัวตัดสินอยู่ที่ `zoneMethod` ตัวเดียว) */
    for (const odd of [{ method: 'Drawing' }, { method: '' }, { method: ' drawing ' }, null, undefined]) {
      assert.equal(g.applies(odd), onsiteApplies, `applies · ${key} · ${JSON.stringify(odd)}`);
      assert.equal(g.ownerOf(odd), declared, `ownerOf · ${key} · ${JSON.stringify(odd)}`);
    }
  }
});

/* ══ ข้อความที่ขาด — วิธี × สถานะ × ไฟล์ ══════════════════════════════════ */

/* คำตอบที่ถูกของพื้นที่ **ที่ยังไม่มีอะไรเลย** — เขียนจากกติกา ไม่ได้ถามตัวที่ถูกทดสอบ */
function wantEmpty(methodName, status, filesKey) {
  if (status === 'cut') return { field: [], result: [] };
  if (methodName === 'drawing') {
    return { field: [], result: [T.size0, ...(filesKey === 'planJpg' ? [] : [T.planDrawing]), T.pkg] };
  }
  return {
    field: [T.size0, ...(filesKey === 'wideJpg' ? [] : [T.wide]), T.spots],
    result: [...(ANY_PLAN.includes(filesKey) ? [] : [T.plan]), T.picked, T.pkg],
  };
}
/* คำตอบที่ถูกของพื้นที่ **ที่ครบทุกอย่างยกเว้นไฟล์** */
function wantFull(methodName, status, filesKey) {
  if (status === 'cut') return { field: [], result: [] };
  if (methodName === 'drawing') return { field: [], result: filesKey === 'planJpg' ? [] : [T.planDrawing] };
  return {
    field: filesKey === 'wideJpg' ? [] : [T.wide],
    result: ANY_PLAN.includes(filesKey) ? [] : [T.plan],
  };
}

/* ข้อความที่ขาด → ข้อของทะเบียน (ใช้แปลงคำตอบรายพื้นที่เป็นคำตอบของเช็คลิสต์) */
const GATE_OF_TEXT = {
  [T.size0]: 'size', [T.wide]: 'wide', [T.spots]: 'spots', [T.plan]: 'plan', [T.planDrawing]: 'plan', [T.picked]: 'picked', [T.pkg]: 'package',
};

test('🔑 ตารางด่านรายพื้นที่: วิธี (ไม่มีคีย์ / onsite / drawing) × สถานะ (ok / cut / added) × ไฟล์ 8 ชุด — ข้อความตรงตัว', () => {
  let cases = 0;
  for (const [methodName, method] of Object.entries(METHODS)) {
    for (const status of STATUSES) {
      for (const [filesKey, files] of Object.entries(FILES)) {
        const tag = `${methodName} · ${status} · ${filesKey}`;
        const isDrawing = methodName === 'drawing';
        const isCutRow = status === 'cut';
        for (const [build, want] of [[empty, wantEmpty], [full, wantFull]]) {
          const row = build({ status, ...method });
          const expected = want(methodName, status, filesKey);
          assert.deepEqual(surveyFieldMissing(row, files), expected.field, `ฝั่งหน้างาน · ${tag}`);
          assert.deepEqual(surveyResultMissing(row, files), expected, `ฝั่งส่งผล · ${tag}`);

          /* เช็คลิสต์ของใบที่มีพื้นที่นี้แถวเดียว — ข้อที่ขึ้น · เจ้าของ · ตัวหาร · ผ่านหรือไม่ */
          const stuck = new Set([...expected.field, ...expected.result].map((text) => GATE_OF_TEXT[text]));
          const shown = isDrawing && !isCutRow ? ['size', 'plan', 'package'] : SURVEY_GATES.map((g) => g.key);
          assert.deepEqual(
            surveyGateChecklist([row], { Z1: files }).map((g) => [g.key, g.owner, g.total, g.ok]),
            shown.map((key) => [key, isDrawing && !isCutRow ? 'head' : gate(key).owner, isCutRow ? 0 : 1, !stuck.has(key)]),
            `เช็คลิสต์ · ${tag}`,
          );

          /* ด่านรูปจุด — พื้นที่ที่ตัดและพื้นที่จากแบบไม่ถูกนับเลย · นอกนั้นจุดต้องมีรูปที่ผูก และถาดต้องว่าง */
          const counted = !isCutRow && !isDrawing;
          const spotWithoutPhoto = counted && row.spots.length > 0 && filesKey !== 'spotLinked';
          // รูปที่ชี้จุด s1 ของพื้นที่ที่ไม่มีจุดนั้น (พื้นที่ว่าง) = รูปที่ไม่รู้ว่าเป็นของจุดไหน ⇒ ลงถาดเหมือนรูปที่ไม่ได้ผูก
          const inTray = counted && (filesKey === 'spotUnlinked' || (filesKey === 'spotLinked' && row.spots.length === 0));
          const gaps = surveySpotPhotoGaps([row], { Z1: files });
          assert.deepEqual([gaps.active, gaps.missingTotal, gaps.unlinkedTotal],
            [counted ? 1 : 0, spotWithoutPhoto ? 1 : 0, inTray ? 1 : 0], `ตัวนับรูปจุด · ${tag}`);
          assert.equal(surveySpotSubmitError([row], { Z1: files }) !== null, spotWithoutPhoto || inTray, `G1 ส่งงาน · ${tag}`);
          assert.equal(surveySpotSendError([row], { Z1: files }) !== null, inTray, `G2 ส่งผล · ${tag}`);
          assert.equal(surveySpotSendError([row], { Z1: files }, { closesVisit: true }) !== null, spotWithoutPhoto || inTray,
            `ส่งผลที่ปิดนัด · ${tag}`);
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 3 * 3 * 8 * 2, 'ตารางต้องเดินครบทุกช่อง');
});

test('🔴 พื้นที่จากแบบไม่มีวันได้ข้อความของด่านหน้างาน (ภาพกว้าง · จุดที่ติดตั้งได้ · เลือกจุด) และไม่มีข้อของช่างเลย', () => {
  for (const status of ['ok', 'added']) {
    for (const [filesKey, files] of Object.entries(FILES)) {
      for (const build of [empty, full]) {
        const row = build({ status, method: 'drawing' });
        const miss = surveyResultMissing(row, files);
        assert.deepEqual(miss.field, [], `ช่างไม่มีอะไรค้าง · ${status} · ${filesKey}`);
        for (const text of ONSITE_ONLY_TEXTS) {
          assert.ok(!miss.result.includes(text), `"${text}" โผล่ที่พื้นที่จากแบบ · ${status} · ${filesKey}`);
        }
        const sendError = surveySendError([row], { Z1: files }, { canSend: true }) || '';
        for (const text of ONSITE_ONLY_TEXTS) assert.ok(!sendError.includes(text), `ด่านส่งผล · ${status} · ${filesKey}`);
      }
    }
  }
});

test('🔑 ภาพแบบของพื้นที่จากแบบ: ต้องเป็นรูป JPG/PNG ที่แนบเป็นภาพผัง — PDF · TIFF · HEIC ไม่ผ่าน (ลงเอกสารไม่ได้)', () => {
  const planGate = gate('plan');
  const cases = [
    ['ยังไม่มีไฟล์', [], false],
    ['JPG', [PLAN_JPG], true],
    ['PNG', [PLAN_PNG], true],
    ['ไม่มี mime · นามสกุล .JPEG', [file('survey_plan', 'แบบชั้น 5.JPEG', '')], true],
    ['ไม่มี mime · นามสกุล .png', [file('survey_plan', 'plan.png', null)], true],
    ['PDF', [PLAN_PDF], false],
    ['TIFF', [PLAN_TIFF], false],
    ['HEIC', [PLAN_HEIC], false],
    ['BMP', [file('survey_plan', 'plan.bmp', 'image/bmp')], false],
    ['WEBP', [file('survey_plan', 'plan.webp', 'image/webp')], false],
    ['GIF', [file('survey_plan', 'plan.gif', 'image/gif')], false],
    ['mime ชนะนามสกุล — ชื่อ .jpg แต่เป็น PDF', [file('survey_plan', 'plan.jpg', 'application/pdf')], false],
    ['ไม่มีทั้ง mime และชื่อไฟล์', [{ docType: 'survey_plan' }], false],
    ['รูป JPG แต่แนบเป็นภาพกว้าง', [WIDE_JPG], false],
    ['รูป JPG แต่แนบเป็นภาพจุด', [spotPhoto('S1', 's1')], false],
    ['PDF + PNG — มีรูปที่ใช้ได้หนึ่งไฟล์ก็พอ', [PLAN_PDF, PLAN_PNG], true],
    ['PDF + TIFF + HEIC', [PLAN_PDF, PLAN_TIFF, PLAN_HEIC], false],
  ];
  for (const [name, files, passes] of cases) {
    const want = passes ? null : T.planDrawing;
    assert.equal(planGate.missing(drawing(), files), want, name);
    assert.deepEqual(surveyResultMissing(drawing(), files).result, passes ? [] : [T.planDrawing], `ผ่านทะเบียน · ${name}`);
  }
  /* ไฟล์ยังไม่มา / ค่าแปลกปลอม = ยังไม่มีรูป (fail-closed เหมือน `surveyDocCounts`) */
  for (const odd of [undefined, null, 'x', [null, undefined]]) {
    assert.equal(planGate.missing(drawing(), odd), T.planDrawing, JSON.stringify(odd));
  }
});

test('🔴 ภาพผังของพื้นที่ลงหน้างาน: ไฟล์ภาพผังชนิดใดก็ผ่านเหมือนเดิม (PDF · TIFF · HEIC · ไฟล์ไม่มีชื่อ)', () => {
  const planGate = gate('plan');
  for (const [name, spelling] of ONSITE_SPELLINGS) {
    const row = full(spelling);
    for (const files of [[PLAN_PDF], [PLAN_TIFF], [PLAN_HEIC], [PLAN_JPG], [{ docType: 'survey_plan' }]]) {
      assert.equal(planGate.missing(row, files), null, `${name} · ${files[0].fileName || 'ไม่มีชื่อไฟล์'}`);
    }
    assert.equal(planGate.missing(row, [WIDE_JPG]), T.plan, name);
    assert.equal(planGate.missing(row, []), T.plan, name);
  }
});

/* ══ ขนาด — พื้นที่ที่สลับกลับมาเป็นลงหน้างาน ═════════════════════════════ */

test('🔑 ด่านขนาด: พื้นที่ที่เพิ่งกลับมาเป็นลงหน้างานต้องถูกบันทึกอีกครั้งหลังสลับ — ตัวเลขที่ค้างอยู่เป็นของตอนประเมินจากแบบ', () => {
  const SWITCHED = '2026-10-09T03:00:00+00:00';
  const cases = [
    ['ไม่เคยสลับ (ไม่มีคีย์)', {}, null],
    ['ไม่เคยสลับ (methodChangedAt null)', { methodChangedAt: null, surveyedAt: '2026-10-01T03:00:00+00:00' }, null],
    ['สลับแล้วยังไม่เคยบันทึก', { methodChangedAt: SWITCHED }, T.resave],
    ['สลับแล้ว surveyedAt ว่าง', { methodChangedAt: SWITCHED, surveyedAt: '' }, T.resave],
    ['บันทึกก่อนสลับ', { methodChangedAt: SWITCHED, surveyedAt: '2026-10-09T02:59:59+00:00' }, T.resave],
    ['บันทึกเวลาเดียวกับที่สลับพอดี', { methodChangedAt: SWITCHED, surveyedAt: SWITCHED }, T.resave],
    ['ชั่วขณะเดียวกันคนละรูปแบบ (+00:00 กับ Z)', { methodChangedAt: SWITCHED, surveyedAt: '2026-10-09T03:00:00.000Z' }, T.resave],
    ['บันทึกหลังสลับ', { methodChangedAt: SWITCHED, surveyedAt: '2026-10-09T03:00:01+00:00' }, null],
    ['บันทึกหลังสลับ คนละรูปแบบ', { methodChangedAt: SWITCHED, surveyedAt: '2026-10-09T03:00:00.001Z' }, null],
    ['บันทึกหลังสลับ คนละโซนเวลา (10:30 เวลาไทย)', { methodChangedAt: SWITCHED, surveyedAt: '2026-10-09T10:30:00+07:00' }, null],
    ['อ่านเวลาบันทึกไม่ออก', { methodChangedAt: SWITCHED, surveyedAt: 'เมื่อวาน' }, T.resave],
    ['อ่านเวลาสลับไม่ออก', { methodChangedAt: 'x', surveyedAt: '2026-10-09T03:00:01+00:00' }, T.resave],
  ];
  for (const [name, over, want] of cases) {
    for (const method of [{}, { method: 'onsite' }]) {
      assert.equal(gate('size').missing(full({ ...method, ...over })), want, name);
    }
  }
  /* ขนาดยังไม่ครบ = บอกเรื่องขนาดก่อนเสมอ (ข้อความเดิม) — ไม่ซ้อนคำว่า "เพิ่งกลับมา" */
  assert.equal(gate('size').missing(full({ methodChangedAt: SWITCHED, parts: [] })), T.size0);
  assert.equal(gate('size').missing(full({ methodChangedAt: SWITCHED, parts: [part(10, 10, 3), { widthM: 5 }] })),
    'มีส่วนที่กรอกไม่ครบสามช่อง 1 ส่วน');
  /* พื้นที่ที่ยังเป็นจากแบบ ไม่มีใครต้องไปวัดจริง — ไม่ถามเรื่องบันทึกซ้ำ */
  assert.equal(gate('size').missing(drawing({ methodChangedAt: SWITCHED })), null);
  assert.equal(gate('size').missing(drawing({ methodChangedAt: SWITCHED, surveyedAt: '2026-10-01T00:00:00Z' })), null);
});

test('ด่านขนาดหลังสลับกลับ: เป็นข้อของช่าง — ขึ้นทั้งที่ส่งงาน · แจ้งว่าแก้แล้ว · ส่งผล · เช็คลิสต์ แล้วหายเมื่อบันทึกใหม่', () => {
  const back = full({ methodChangedAt: '2026-10-09T03:00:00+00:00', surveyedAt: '2026-10-08T03:00:00+00:00' });
  const files = { Z1: [WIDE_JPG, PLAN_JPG] };
  assert.deepEqual(surveyFieldMissing(back, files.Z1), [T.resave]);
  assert.deepEqual(surveyCrewGaps([back], files).map((g) => [g.key, g.owner, g.zones]), [['size', 'crew', ['ล็อบบี้']]]);
  assert.equal(surveyFieldSubmitError([back], files),
    'ยังส่งงานไม่ได้ — ขาด ขนาด (ล็อบบี้) · กรอกให้ครบ หรือกด “ตัดพื้นที่นี้ออก” พร้อมเหตุผล');
  assert.equal(surveySendBackDoneError({ id: 'REQ1' }, { canWrite: true, pending: true, rows: [back], filesByZone: files }),
    'ยังแจ้งไม่ได้ — ยังขาด ขนาด (ล็อบบี้)');
  assert.equal(surveySendError([back], files, { canSend: true }), `ยังส่งผลไม่ได้ — ล็อบบี้: ${T.resave}`);
  assert.deepEqual(surveyFieldProgress([back], files), { total: 1, done: 0, complete: false });

  const saved = { ...back, surveyedAt: '2026-10-09T04:00:00+00:00' };
  assert.deepEqual(surveyFieldMissing(saved, files.Z1), []);
  assert.equal(surveyFieldSubmitError([saved], files), null);
  assert.equal(surveySendError([saved], files, { canSend: true }), null);
});

/* ══ เช็คลิสต์ของทั้งใบ ══════════════════════════════════════════════════ */

const SIX = ['size', 'wide', 'spots', 'plan', 'picked', 'package'];

test('🔴 เช็คลิสต์ ใบลงหน้างานล้วน: หกข้อ ตัวหาร = พื้นที่ที่ยังอยู่ในใบ — เหมือนเดิมทั้งสามแบบของแถว', () => {
  const sheets = ONSITE_SPELLINGS.map(([, spelling]) => [
    full({ id: 'A', zoneName: 'ล็อบบี้', ...spelling }),
    empty({ id: 'B', zoneName: 'แพนทรี', status: 'added', ...spelling }),
    empty({ id: 'C', zoneName: 'ห้องเก็บของ', status: 'cut', ...spelling }),
  ]);
  const files = { A: [WIDE_JPG, PLAN_PDF], B: [WIDE_JPG] };
  const want = [
    { key: 'size', owner: 'crew', label: 'ขนาด ก × ย × ส ครบทุกพื้นที่', short: 'ขนาด', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
    { key: 'wide', owner: 'crew', label: 'ภาพกว้างครบทุกพื้นที่', short: 'ภาพกว้าง', ok: true, done: 2, total: 2, zones: [] },
    { key: 'spots', owner: 'crew', label: 'จุดที่ติดตั้งได้ อย่างน้อย 1 จุดต่อพื้นที่', short: 'จุดติดตั้ง', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
    { key: 'plan', owner: 'head', label: 'ภาพผังที่มาร์กจุดแล้ว', short: 'ภาพผัง', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
    { key: 'picked', owner: 'head', label: 'เลือกจุดที่จะติดตั้งแล้ว', short: 'เลือกจุด', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
    { key: 'package', owner: 'head', label: 'เคาะขนาดและจำนวนแพ็คเกจแล้ว', short: 'แพ็คเกจ', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
  ];
  for (const [i, rows] of sheets.entries()) {
    const list = surveyGateChecklist(rows, files);
    assert.deepEqual(list, want, ONSITE_SPELLINGS[i][0]);
    assert.equal(JSON.stringify(list), JSON.stringify(want), `ลำดับคีย์ของแถวด่านต้องเท่าเดิม · ${ONSITE_SPELLINGS[i][0]}`);
  }
});

test('🔑 เช็คลิสต์ ใบจากแบบล้วน: เหลือสามข้อ (ขนาด · ภาพแบบ · แพ็คเกจ) เป็นของหัวหน้าทั้งหมด', () => {
  const rows = [
    drawing({ id: 'A', zoneName: 'ล็อบบี้' }),
    empty({ id: 'B', zoneName: 'แพนทรี', method: 'drawing', status: 'added' }),
    empty({ id: 'C', zoneName: 'ห้องเก็บของ', method: 'drawing', status: 'cut' }),
  ];
  const list = surveyGateChecklist(rows, { A: [PLAN_PNG], B: [PLAN_PDF] });
  assert.deepEqual(list, [
    { key: 'size', owner: 'head', label: 'ขนาด ก × ย × ส ครบทุกพื้นที่', short: 'ขนาด', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
    { key: 'plan', owner: 'head', label: 'ภาพแบบของพื้นที่', short: 'ภาพแบบ', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
    { key: 'package', owner: 'head', label: 'เคาะขนาดและจำนวนแพ็คเกจแล้ว', short: 'แพ็คเกจ', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
  ]);
  /* ครบแล้ว = สามข้อเขียวหมด และส่งผลได้ */
  const done = [drawing({ id: 'A' })];
  assert.deepEqual(surveyGateChecklist(done, { A: [PLAN_JPG] }).map((g) => [g.key, g.owner, g.ok, g.done, g.total]),
    [['size', 'head', true, 1, 1], ['plan', 'head', true, 1, 1], ['package', 'head', true, 1, 1]]);
  assert.equal(surveySendError(done, { A: [PLAN_JPG] }, { canSend: true }), null);
});

test('🔑 เช็คลิสต์ ใบผสม: ครบหกข้อ · ตัวหารของแต่ละข้อ = พื้นที่ที่ข้อนั้นใช้ด้วย · เจ้าของและชื่อข้อตามที่ประกาศ', () => {
  const rows = [
    full({ id: 'A', zoneName: 'ล็อบบี้' }),
    empty({ id: 'B', zoneName: 'แพนทรี', method: 'onsite' }),
    empty({ id: 'D', zoneName: 'ห้อง MD', method: 'drawing' }),
    drawing({ id: 'E', zoneName: 'ห้องประชุม' }),
    empty({ id: 'X', zoneName: 'ห้องเก็บของ', method: 'drawing', status: 'cut' }),
  ];
  const list = surveyGateChecklist(rows, { A: [WIDE_JPG, PLAN_PDF], B: [], D: [PLAN_PDF], E: [PLAN_JPG] });
  assert.deepEqual(list.map((g) => g.key), SIX);
  assert.deepEqual(list.map((g) => [g.key, g.owner, g.label, g.short]),
    SURVEY_GATES.map((g) => [g.key, g.owner, g.label, g.short]), 'ใบผสมใช้เจ้าของและชื่อข้อเดิม');
  const g = byKey(list);
  /* ขนาด · ผัง · แพ็คเกจ ใช้กับทั้งสี่พื้นที่ · ภาพกว้าง · จุด · เลือกจุด ใช้กับสองพื้นที่ลงหน้างาน */
  assert.deepEqual([g.size.done, g.size.total, g.size.zones], [2, 4, ['แพนทรี', 'ห้อง MD']]);
  assert.deepEqual([g.wide.done, g.wide.total, g.wide.zones], [1, 2, ['แพนทรี']]);
  assert.deepEqual([g.spots.done, g.spots.total, g.spots.zones], [1, 2, ['แพนทรี']]);
  assert.deepEqual([g.plan.done, g.plan.total, g.plan.zones], [2, 4, ['แพนทรี', 'ห้อง MD']]);
  assert.deepEqual([g.picked.done, g.picked.total, g.picked.zones], [1, 2, ['แพนทรี']]);
  assert.deepEqual([g.package.done, g.package.total, g.package.zones], [2, 4, ['แพนทรี', 'ห้อง MD']]);
  for (const row of list) assert.equal(row.ok, row.zones.length === 0, row.key);
});

test('⚠️ เช็คลิสต์ ไม่เหลือพื้นที่ในใบ: ยังครบหกข้อ ตัวหาร 0 เหมือนเดิม — ข้อถูกซ่อนเฉพาะเมื่อมีพื้นที่แต่ไม่มีพื้นที่ไหนใช้ข้อนั้น', () => {
  const zero = SURVEY_GATES.map((g) => ({ key: g.key, owner: g.owner, label: g.label, short: g.short, ok: true, done: 0, total: 0, zones: [] }));
  assert.deepEqual(surveyGateChecklist([], {}), zero);
  assert.deepEqual(surveyGateChecklist(undefined, undefined), zero);
  assert.deepEqual(surveyGateChecklist(null, null), zero);
  for (const method of Object.values(METHODS)) {
    assert.deepEqual(surveyGateChecklist([empty({ status: 'cut', ...method })], {}), zero, JSON.stringify(method));
  }
  assert.deepEqual(surveyGateChecklist([empty({ id: 'A', status: 'cut' }), empty({ id: 'B', status: 'cut', method: 'drawing' })], {}), zero);
  /* พื้นที่ลงหน้างานถูกตัดหมด เหลือแต่พื้นที่จากแบบ = อ่านเป็นใบจากแบบ (สามข้อ) */
  const left = surveyGateChecklist([empty({ id: 'A', status: 'cut' }), drawing({ id: 'B' })], { B: [PLAN_JPG] });
  assert.deepEqual(left.map((g) => [g.key, g.owner, g.total]), [['size', 'head', 1], ['plan', 'head', 1], ['package', 'head', 1]]);
});

/* ══ ข้อของช่าง — พื้นที่จากแบบไม่เคยเป็นงานค้างของช่าง ════════════════════ */

test('🔑 surveyCrewGaps: ใบผสมที่ขาดขนาดเฉพาะพื้นที่จากแบบ = ช่างไม่มีอะไรค้าง · ส่งงานและแจ้งว่าแก้แล้วได้', () => {
  const rows = [
    full({ id: 'A', zoneName: 'ล็อบบี้' }),
    empty({ id: 'D', zoneName: 'ห้อง MD', method: 'drawing' }),
  ];
  const files = { A: [WIDE_JPG], D: [] };
  assert.deepEqual(surveyCrewGaps(rows, files), []);
  assert.equal(surveyFieldSubmitError(rows, files), null);
  assert.equal(surveySendBackDoneError({ id: 'REQ1' }, { canWrite: true, pending: true, rows, filesByZone: files }), null);
  /* หัวหน้ายังเห็นว่าพื้นที่จากแบบขาดอะไร — ด่านส่งผลไม่ได้หลับ */
  assert.equal(surveySendError(rows, { A: [WIDE_JPG, PLAN_JPG], D: [] }, { canSend: true }),
    `ยังส่งผลไม่ได้ — ห้อง MD: ${T.size0} · ${T.planDrawing} · ${T.pkg}`);
});

test('surveyCrewGaps: ใบผสม — ข้อที่ติดบอกเฉพาะพื้นที่ลงหน้างาน ตัวหารไม่นับพื้นที่จากแบบ · ใบจากแบบล้วน = ว่างเสมอ', () => {
  const rows = [
    full({ id: 'A', zoneName: 'ล็อบบี้' }),
    empty({ id: 'B', zoneName: 'แพนทรี' }),
    empty({ id: 'D', zoneName: 'ห้อง MD', method: 'drawing' }),
  ];
  const gaps = surveyCrewGaps(rows, { A: [WIDE_JPG], B: [], D: [] });
  assert.deepEqual(gaps.map((g) => [g.key, g.owner, g.done, g.total, g.zones]), [
    ['size', 'crew', 1, 2, ['แพนทรี']],
    ['wide', 'crew', 1, 2, ['แพนทรี']],
    ['spots', 'crew', 1, 2, ['แพนทรี']],
  ]);
  assert.equal(surveyFieldSubmitError(rows, { A: [WIDE_JPG], B: [], D: [] }),
    'ยังส่งงานไม่ได้ — ขาด ขนาด (แพนทรี) · ภาพกว้าง (แพนทรี) · จุดติดตั้ง (แพนทรี) · กรอกให้ครบ หรือกด “ตัดพื้นที่นี้ออก” พร้อมเหตุผล');

  const desk = [empty({ id: 'D', method: 'drawing' }), empty({ id: 'E', method: 'drawing', status: 'added' })];
  assert.deepEqual(surveyCrewGaps(desk, {}), []);
  /* "ใบยังไม่มีพื้นที่" ถามจากทั้งใบ — ใบจากแบบล้วนมีพื้นที่อยู่ ไม่ใช่ใบว่าง */
  assert.equal(surveyFieldSubmitError(desk, {}), null);
  assert.match(surveyFieldSubmitError([], {}), /^ใบนี้ยังไม่มีพื้นที่ให้วัด/);
  /* ค่าแปลกปลอมไม่พัง — เหมือนเดิม */
  assert.deepEqual(surveyCrewGaps(undefined, undefined), []);
  assert.deepEqual(surveyCrewGaps(null, null), []);
});

test('🔴 surveyCrewGaps ใบลงหน้างานล้วน: เหมือนเดิมทั้งสามแบบของแถว', () => {
  const want = [
    { key: 'wide', owner: 'crew', label: 'ภาพกว้างครบทุกพื้นที่', short: 'ภาพกว้าง', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
    { key: 'spots', owner: 'crew', label: 'จุดที่ติดตั้งได้ อย่างน้อย 1 จุดต่อพื้นที่', short: 'จุดติดตั้ง', ok: false, done: 1, total: 2, zones: ['แพนทรี'] },
  ];
  for (const [name, spelling] of ONSITE_SPELLINGS) {
    const rows = [
      full({ id: 'A', zoneName: 'ล็อบบี้', ...spelling }),
      full({ id: 'B', zoneName: 'แพนทรี', spots: [], ...spelling }),
      empty({ id: 'C', status: 'cut', ...spelling }),
    ];
    assert.deepEqual(surveyCrewGaps(rows, { A: [WIDE_JPG], B: [] }), want, name);
  }
});

/* ══ ความคืบหน้าหน้างาน ══════════════════════════════════════════════════ */

test('🔴 surveyFieldProgress ใบลงหน้างานล้วน: ได้สามคีย์เดิม ไม่มีคีย์ drawing — ทั้งสามแบบของแถว', () => {
  for (const [name, spelling] of ONSITE_SPELLINGS) {
    const rows = [
      full({ id: 'A', ...spelling }),
      empty({ id: 'B', ...spelling }),
      empty({ id: 'C', status: 'cut', ...spelling }),
    ];
    const progress = surveyFieldProgress(rows, { A: [WIDE_JPG], B: [WIDE_JPG] });
    assert.deepEqual(progress, { total: 2, done: 1, complete: false }, name);
    assert.deepEqual(Object.keys(progress), ['total', 'done', 'complete'], name);
    assert.deepEqual(surveyFieldProgress([rows[0]], { A: [WIDE_JPG] }), { total: 1, done: 1, complete: true }, name);
  }
  assert.deepEqual(surveyFieldProgress([], {}), { total: 0, done: 0, complete: false });
  assert.deepEqual(surveyFieldProgress(undefined, undefined), { total: 0, done: 0, complete: false });
  /* พื้นที่จากแบบที่ถูกตัดไม่นับ ⇒ ไม่มีคีย์ drawing */
  assert.deepEqual(surveyFieldProgress([full({ id: 'A' }), drawing({ id: 'D', status: 'cut' })], { A: [WIDE_JPG] }),
    { total: 1, done: 1, complete: true });
});

test('🔑 surveyFieldProgress: นับ "วัดแล้ว" เฉพาะพื้นที่ลงหน้างาน · พื้นที่จากแบบแยกเป็น drawing ไม่ปนเป็นงานที่ช่างวัด', () => {
  const mixed = [
    full({ id: 'A' }),
    empty({ id: 'B' }),
    drawing({ id: 'D' }),
    empty({ id: 'E', method: 'drawing', status: 'added' }),
    drawing({ id: 'X', status: 'cut' }),
  ];
  assert.deepEqual(surveyFieldProgress(mixed, { A: [WIDE_JPG] }), { total: 2, done: 1, complete: false, drawing: 2 });
  /* พื้นที่ลงหน้างานวัดครบ = complete แม้พื้นที่จากแบบยังไม่มีอะไร (ไม่ใช่งานของช่าง) */
  assert.deepEqual(surveyFieldProgress([full({ id: 'A' }), empty({ id: 'D', method: 'drawing' })], { A: [WIDE_JPG] }),
    { total: 1, done: 1, complete: true, drawing: 1 });
  /* ใบจากแบบล้วน — ไม่มีอะไรให้ช่างวัด ⇒ ไม่ complete (กติกาเดิมของ total 0) */
  assert.deepEqual(surveyFieldProgress([drawing({ id: 'D' }), drawing({ id: 'E' }), empty({ id: 'F', method: 'drawing' })], {}),
    { total: 0, done: 0, complete: false, drawing: 3 });
});

/* ══ ส่งกลับให้ช่างแก้ — ใบที่ไม่ต้องมีนัดแล้ว ════════════════════════════ */

const sendBack = (at) => ({ id: `B-${at}`, kind: SEND_BACK_KIND, createdAt: at, authorId: 'U-HEAD', authorName: 'หัวหน้า', meta: { note: 'ถ่ายภาพกว้างเพิ่ม' } });

test('🔴 surveySendBackOnSheet: ไม่ส่งตัวเลือกมา / needsVisit ไม่ใช่ false ตรงตัว = พฤติกรรมเดิมทุกกรณี', () => {
  const pending = surveySendBackState([sendBack('2026-10-09T03:00:00Z')]);
  const open = { id: 'REQ1', answeredAt: null };
  const sent = { id: 'REQ1', answeredAt: '2026-10-09T05:00:00Z' };
  for (const opts of [undefined, {}, { needsVisit: true }, { needsVisit: undefined }, { needsVisit: null }, { needsVisit: 0 }, { needsVisit: 'false' }]) {
    const call = (state, request) => (opts === undefined ? surveySendBackOnSheet(state, request) : surveySendBackOnSheet(state, request, opts));
    const tag = JSON.stringify(opts);
    assert.equal(call(pending, open), pending, `ยังค้างตามจริง · ${tag}`);
    assert.equal(call(pending, null), pending, `ไม่รู้จักใบ · ${tag}`);
    assert.deepEqual(call(pending, sent), { ...pending, pending: false, closedBySend: true }, `ใบล็อก · ${tag}`);
    assert.equal(call(null, sent), null, `อ่านเธรดไม่สำเร็จ · ${tag}`);
    assert.equal(call(undefined, open), null, tag);
  }
  assert.equal(surveySendBackOnSheet(pending), pending);
});

test('🔑 surveySendBackOnSheet: ใบที่ไม่ต้องมีนัดแล้ว (needsVisit false) = เรื่องส่งกลับไม่ค้าง — ไม่มีช่างให้รอ', () => {
  const pending = surveySendBackState([sendBack('2026-10-09T03:00:00Z')]);
  const open = { id: 'REQ1', answeredAt: null };
  const closed = surveySendBackOnSheet(pending, open, { needsVisit: false });
  assert.deepEqual(closed, { ...pending, pending: false, closedByMethod: true });
  assert.equal(closed.sentBack, pending.sentBack, 'ข้อที่ขอยังอยู่ (ประวัติ)');
  assert.ok(!('closedBySend' in closed), 'ไม่มีอะไรถูกส่ง — ห้ามอ้างว่าปิดเพราะส่งผล');
  assert.equal(pending.pending, true, 'ไม่แก้ของเดิม');
  assert.deepEqual(surveySendBackOnSheet(pending, null, { needsVisit: false }), { ...pending, pending: false, closedByMethod: true },
    'ตัดสินจากแถวพื้นที่ ไม่ต้องรู้จักใบ');

  /* ใบล็อกชนะเสมอ — เหตุที่ไม่ค้างคือ "ส่งผลแล้ว" ไม่ใช่ "เปลี่ยนวิธี" */
  for (const locked of [{ answeredAt: '2026-10-09T05:00:00Z' }, { cancelledAt: '2026-10-09T06:00:00Z' }, { status: 'closed' }]) {
    const out = surveySendBackOnSheet(pending, locked, { needsVisit: false });
    assert.deepEqual(out, { ...pending, pending: false, closedBySend: true }, JSON.stringify(locked));
    assert.ok(!('closedByMethod' in out), JSON.stringify(locked));
  }
  /* ไม่ได้ค้างอยู่แล้ว = ไม่แตะ */
  const settled = { pending: false, sentBack: pending.sentBack, done: null };
  assert.equal(surveySendBackOnSheet(settled, open, { needsVisit: false }), settled);
  assert.equal(surveySendBackOnSheet(null, open, { needsVisit: false }), null);
  assert.equal(surveySendBackOnSheet(undefined, null, { needsVisit: false }), null);
});

/* ══ จุดของพื้นที่จากแบบ ════════════════════════════════════════════════ */

test('🔑 normalizeSurveySpots: defaultSelected ติ๊กให้เฉพาะจุดที่เพิ่งเพิ่ม — จุดเดิมคงค่าที่เคาะไว้ทั้ง true และ false', () => {
  const before = [{ id: 's1', label: 'เสา', selected: true }, { id: 's2', label: 'ผนัง', selected: false }, { id: 's3', label: 'ประตู' }];
  const input = [{ id: 's1', label: 'เสา' }, { id: 's2', label: 'ผนัง' }, { id: 's3', label: 'ประตู' }, { id: 's9', label: 'หน้าลิฟต์' }, { label: 'เคาน์เตอร์' }];
  const ids = () => { let n = 0; return () => `SPT-${++n}`; };
  const picked = (opts) => normalizeSurveySpots(input, before, opts).value.map((s) => [s.id, s.selected]);

  assert.deepEqual(picked({ newId: ids(), defaultSelected: true }),
    [['s1', true], ['s2', false], ['s3', false], ['s9', true], ['SPT-1', true]]);
  /* ไม่ส่งตัวเลือก / false = เหมือนเดิม: จุดใหม่ยังไม่ถูกเลือก */
  const today = [['s1', true], ['s2', false], ['s3', false], ['s9', false], ['SPT-1', false]];
  assert.deepEqual(picked({ newId: ids() }), today);
  assert.deepEqual(picked({ newId: ids(), defaultSelected: false }), today);
  /* ต้องเป็น true ตรงตัว — ค่าที่ "เกือบใช่" ไม่ติ๊กให้ */
  for (const odd of [1, 'true', {}, null, undefined]) {
    assert.deepEqual(picked({ newId: ids(), defaultSelected: odd }), today, JSON.stringify(odd));
  }
  /* ไม่มี newId และไม่ส่ง id = จุดใหม่ (id null) ก็ได้ค่าตั้งต้น */
  assert.deepEqual(normalizeSurveySpots([{ label: 'ก' }], before, { defaultSelected: true }).value, [{ id: null, label: 'ก', note: null, selected: true }]);
  assert.deepEqual(normalizeSurveySpots([{ label: 'ก' }], before).value, [{ id: null, label: 'ก', note: null, selected: false }]);
  /* `selected` ที่จอส่งมาไม่ถูกเชื่อ — ทั้งจุดเดิมและจุดใหม่ */
  assert.deepEqual(normalizeSurveySpots([{ id: 's2', label: 'ผนัง', selected: true }, { id: 'n1', label: 'ใหม่', selected: true }], before).value.map((s) => s.selected), [false, false]);
  assert.deepEqual(normalizeSurveySpots([{ id: 's2', label: 'ผนัง', selected: true }, { id: 'n1', label: 'ใหม่', selected: false }], before, { defaultSelected: true }).value.map((s) => s.selected), [false, true]);
  /* ด่านเดิมยังอยู่ครบ */
  assert.deepEqual(normalizeSurveySpots(undefined, before, { defaultSelected: true }), { value: undefined, error: null });
  assert.match(normalizeSurveySpots('x', before, { defaultSelected: true }).error, /ไม่ถูกต้อง/);
  assert.match(normalizeSurveySpots([{ id: 'a', label: 'ก' }, { id: 'a', label: 'ข' }], [], { defaultSelected: true }).error, /id ซ้ำ/);
});

/* ══ ด่านรูปจุด (G1 · G2) ════════════════════════════════════════════════ */

/* พื้นที่ที่ครบหกข้อ มีจุดสองจุด — เหลือเรื่องรูปจุดอย่างเดียว */
const spotZone = (id, name, over = {}) => full({
  id, zoneName: name,
  spots: [{ id: `${id}-s1`, label: 'จุด 1', selected: true }, { id: `${id}-s2`, label: 'จุด 2', selected: true }],
  ...over,
});
/* ไฟล์ที่ทำให้ติดทั้ง G1 (จุด 2 ไม่มีรูป) และ G2 (รูปหนึ่งใบยังไม่ผูก) + ภาพกว้าง HEIC */
const stuckFiles = (id) => [WIDE_HEIC, PLAN_JPG, spotPhoto(`${id}-f1`, `${id}-s1`), spotPhoto(`${id}-f2`)];
const cleanFiles = (id) => [WIDE_JPG, PLAN_JPG, spotPhoto(`${id}-f1`, `${id}-s1`), spotPhoto(`${id}-f2`, `${id}-s2`)];

test('🔑 ด่านรูปจุด ใบผสม: รูปที่ยังไม่ผูก + ภาพกว้าง HEIC ที่พื้นที่จากแบบ ไม่บล็อกอะไร · ไฟล์ชุดเดียวกันที่พื้นที่ลงหน้างาน = ข้อความเดิม', () => {
  const onsite = spotZone('A', 'Reception');
  const desk = spotZone('D', 'ห้อง MD', { method: 'drawing' });

  const onDesk = { A: cleanFiles('A'), D: stuckFiles('D') };
  assert.equal(surveySpotSendError([onsite, desk], onDesk), null);
  assert.equal(surveySpotSendError([onsite, desk], onDesk, { closesVisit: true }), null, 'ส่งผลที่ปิดนัดก็ไม่ถาม G1 ของพื้นที่จากแบบ');
  assert.equal(surveySpotSubmitError([onsite, desk], onDesk), null, 'ช่างส่งงานได้ — พื้นที่จากแบบไม่ใช่งานของช่าง');

  const onSite = { A: stuckFiles('A'), D: cleanFiles('D') };
  assert.equal(surveySpotSendError([onsite, desk], onSite), 'มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Reception)');
  assert.equal(surveySpotSendError([onsite, desk], onSite, { closesVisit: true }),
    'Reception · จุด 1.2 ยังไม่มีรูป — ช่างยังไม่ส่งงาน ส่งผลจะปิดนัดให้ ทุกจุดต้องมีรูปก่อน | มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Reception)');
  assert.equal(surveySpotSubmitError([onsite, desk], onSite),
    'ยังส่งงานไม่ได้ — Reception · จุด 1.2 ยังไม่มีรูป | มีรูปที่ยังไม่ได้ผูกจุด 1 รูป (Reception)');
  /* ทั้งสามแบบของแถวลงหน้างานได้ข้อความเดียวกัน */
  for (const [name, spelling] of ONSITE_SPELLINGS) {
    assert.equal(surveySpotSendError([spotZone('A', 'Reception', spelling), desk], onSite),
      'มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Reception)', name);
  }
});

test('🔑 ตัวนับรูปจุด: ข้ามพื้นที่จากแบบเหมือนพื้นที่ที่ตัด — เลขจุด k.n ของพื้นที่ที่เหลือไม่เลื่อน · ตัวหารไม่นับ', () => {
  const rows = [
    spotZone('A', 'Reception'),
    spotZone('D', 'ห้อง MD', { method: 'drawing' }),
    spotZone('C', 'ห้องเก็บของ', { status: 'cut' }),
    spotZone('B', 'แพนทรี', { status: 'added' }),
  ];
  const files = { A: stuckFiles('A'), D: stuckFiles('D'), C: stuckFiles('C'), B: [WIDE_JPG] };
  const gaps = surveySpotPhotoGaps(rows, files);
  assert.deepEqual(gaps.zones.map((z) => [z.zoneId, z.number, z.missing.map((m) => m.number), z.unlinked]), [
    ['A', 1, ['1.2'], 1],
    ['B', 4, ['4.1', '4.2'], 0],
  ]);
  assert.deepEqual([gaps.active, gaps.missingTotal, gaps.unlinkedTotal], [2, 3, 1]);

  const g1 = surveySpotGates(rows, files, { mode: 'submit' }).find((g) => g.key === SPOT_GATE_PHOTOS);
  assert.deepEqual([g1.total, g1.done, g1.zoneIds, g1.count], [2, 0, ['A', 'B'], 3]);
  const g2 = surveySpotGates(rows, files, { mode: 'send' }).find((g) => g.key === SPOT_GATE_LINKED);
  assert.deepEqual([g2.total, g2.done, g2.zoneIds, g2.count], [2, 1, ['A'], 1]);

  /* ใบจากแบบล้วน — ไม่มีพื้นที่ไหนเข้าด่านรูปจุดเลย */
  const desk = [spotZone('D', 'ห้อง MD', { method: 'drawing' }), spotZone('E', 'ห้องประชุม', { method: 'drawing', status: 'added' })];
  const deskFiles = { D: stuckFiles('D'), E: [] };
  assert.deepEqual(surveySpotPhotoGaps(desk, deskFiles), { zones: [], active: 0, missingTotal: 0, unlinkedTotal: 0 });
  assert.equal(surveySpotSubmitError(desk, deskFiles), null);
  assert.equal(surveySpotSendError(desk, deskFiles, { closesVisit: true }), null);
});

test('🔴 ตัวนับรูปจุด ใบลงหน้างานล้วน: เหมือนเดิมทั้งสามแบบของแถว', () => {
  const want = {
    zones: [
      { zoneId: 'A', zoneName: 'Reception', number: 1, missing: [{ spotId: 'A-s2', number: '1.2', label: 'จุด 2' }], unlinked: 1 },
      { zoneId: 'B', zoneName: 'แพนทรี', number: 3, missing: [], unlinked: 0 },
    ],
    active: 2,
    missingTotal: 1,
    unlinkedTotal: 1,
  };
  for (const [name, spelling] of ONSITE_SPELLINGS) {
    const rows = [
      spotZone('A', 'Reception', spelling),
      spotZone('C', 'ห้องเก็บของ', { status: 'cut', ...spelling }),
      spotZone('B', 'แพนทรี', { status: 'added', ...spelling }),
    ];
    assert.deepEqual(surveySpotPhotoGaps(rows, { A: stuckFiles('A'), C: stuckFiles('C'), B: cleanFiles('B') }), want, name);
  }
});

/* ══ ความครอบ: ส่งผลต้องปฏิเสธทุกกรณีที่ช่างส่งงานไม่ได้ ════════════════════
 * มติเจ้าของ 24/09 ข้อ 2 — ส่งผลปิดนัดที่ยังเปิดให้ได้โดยไม่มีด่านที่สอง ⇒ ด่านส่งผลต้องครอบด่านส่งงานของช่าง
 * 🔑 พื้นที่จากแบบถูกถอดออกจากด่านของช่างทั้งคู่ — ความครอบต้องยังจริงทั้งบนใบผสม และบนใบที่เหลือเฉพาะแถวลงหน้างาน */
test('🔑 ความครอบ: ช่างส่งงานไม่ได้ ⇒ ส่งผลไม่ได้ — ทุกใบของตาราง (ใบผสมทั้งใบ · เฉพาะแถวลงหน้างานของใบนั้น)', () => {
  const SWITCHED = '2026-10-09T03:00:00+00:00';
  const zoneVariants = [
    full(),
    full({ parts: [] }),
    full({ parts: [part(5, 5, 3), { widthM: 5, lengthM: 5 }] }),
    full({ spots: [] }),
    full({ methodChangedAt: SWITCHED, surveyedAt: '2026-10-08T03:00:00+00:00' }),
    full({ method: 'onsite', methodChangedAt: SWITCHED, surveyedAt: '2026-10-09T04:00:00+00:00' }),
    full({ status: 'cut', parts: [], spots: [] }),
    drawing(),
    drawing({ parts: [], spots: [] }),
    drawing({ status: 'cut', parts: [] }),
    empty({ method: 'drawing', status: 'added' }),
  ];
  const fileVariants = [[], [WIDE_JPG], [PLAN_JPG], [WIDE_JPG, PLAN_PDF], [WIDE_JPG, PLAN_JPG, spotPhoto('F1', 's1')], [WIDE_HEIC, PLAN_TIFF, spotPhoto('F2')]];
  const onsiteOnly = (rows) => rows.filter((r) => r.method !== 'drawing');
  let fieldRefusals = 0;
  let spotRefusals = 0;
  let sendPasses = 0;
  let mixedSheets = 0;
  for (const a of zoneVariants) {
    for (const b of [null, ...zoneVariants]) {
      const sheet = b ? [{ ...a, id: 'Z1' }, { ...b, id: 'Z2', zoneName: 'แพนทรี' }] : [{ ...a, id: 'Z1' }];
      if (sheet.some((r) => r.method === 'drawing') && onsiteOnly(sheet).length) mixedSheets += 1;
      for (const fa of fileVariants) {
        for (const fb of fileVariants) {
          const files = { Z1: fa, Z2: fb };
          for (const rows of [sheet, onsiteOnly(sheet)]) {
            const tag = JSON.stringify({ rows: rows.map((r) => [r.method || '-', r.status]), fa: fa.map((f) => f.fileName), fb: fb.map((f) => f.fileName) });
            if (surveyFieldSubmitError(rows, files)) {
              fieldRefusals += 1;
              assert.ok(surveySendError(rows, files, { canSend: true }), `ช่างส่งงานไม่ได้ แต่ส่งผลผ่าน: ${tag}`);
            }
            if (!surveySendError(rows, files, { canSend: true })) sendPasses += 1;
            /* ส่วนรูปจุด: ส่งผลที่ปิดนัด (closesVisit) ต้องครอบ G1 ของช่างเช่นกัน */
            if (surveySpotSubmitError(rows, files)) {
              spotRefusals += 1;
              assert.ok(surveySpotSendError(rows, files, { closesVisit: true }), `ช่างส่งงานไม่ได้เพราะรูปจุด แต่ส่งผลปิดนัดผ่าน: ${tag}`);
            }
          }
          /* พื้นที่จากแบบไม่เปลี่ยนคำตอบของช่าง: ใบผสมทั้งใบ = เฉพาะแถวลงหน้างานของมัน (เว้นใบที่ไม่เหลือแถวลงหน้างานเลย) */
          if (onsiteOnly(sheet).length) {
            assert.equal(surveyFieldSubmitError(sheet, files), surveyFieldSubmitError(onsiteOnly(sheet), files));
            assert.deepEqual(surveyCrewGaps(sheet, files), surveyCrewGaps(onsiteOnly(sheet), files));
          }
        }
      }
    }
  }
  assert.ok(fieldRefusals > 5000, `ชุดทดสอบต้องมีกรณีที่ช่างส่งไม่ได้จริงจำนวนมาก (ได้ ${fieldRefusals})`);
  assert.ok(spotRefusals > 4000, `ชุดทดสอบต้องมีกรณีที่ติดรูปจุดจริง (ได้ ${spotRefusals})`);
  assert.ok(sendPasses > 500, `ด่านส่งผลต้องไม่ปฏิเสธทุกใบ — ไม่งั้นความครอบจริงแบบไม่ได้พิสูจน์อะไร (ผ่าน ${sendPasses})`);
  assert.ok(mixedSheets > 50, `ชุดทดสอบต้องมีใบผสมจริง (ได้ ${mixedSheets})`);
});

/* ══ ซอร์สจริง ═══════════════════════════════════════════════════════════ */

const code = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('🔴 ไฟล์ด่านถามวิธีประเมินผ่านโมดูลใบตัวเดียว — ไม่เทียบคอลัมน์ method เอง · ไม่ดึงไฟล์ที่ทำให้เป็นวงกลม', () => {
  const survey = code('./survey.js');
  const spots = code('./surveySpotPhotos.js');
  for (const [name, src] of [['survey.js', survey], ['surveySpotPhotos.js', spots]]) {
    assert.doesNotMatch(src, /\.method\b|\bmethod\s*[!=]==/, `${name} อ่านคอลัมน์ method เอง — ต้องถาม zoneMethod / isDrawingZone`);
    assert.match(src, /^import \{[^}]*\bisDrawingZone\b[^}]*\} from '@\/lib\/service\/surveyMethod';$/m, `${name} ต้องดึงตัวตัดสินจากโมดูลใบ`);
  }
  /* `attachmentTypes.js` · `surveySendClose.js` · `surveySpotPhotos.js` ดึง `survey.js` อยู่แล้ว ⇒ ดึงย้อนกลับ = วงกลม
     (`attachmentTypes.js` อ่านค่าคงที่ของไฟล์นี้ตอนโหลดโมดูล — วงกลม = พังตั้งแต่ import) */
  assert.doesNotMatch(survey, /^import [^;]*(attachmentTypes|surveySendClose|surveySpotPhotos)/m);
  assert.deepEqual([...survey.matchAll(/^import [^;]* from '([^']+)';$/gm)].map((m) => m[1]),
    ['@/lib/format', '@/lib/service/surveyMethod'], 'survey.js ดึงได้แค่ตัวจัดรูปตัวเลขกับโมดูลใบของวิธีประเมิน');
});
