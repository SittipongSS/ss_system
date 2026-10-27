// ── S2b แก้หลังตรวจจอ · กลุ่ม J — ฟอร์มฝ่ายขาย + แท็บพื้นที่บริการของลูกค้า ────────────────────────────────────────
//
// ⭐ ไฟล์นี้ยามมติเจ้าของ/ข้อบกพร่องของกลุ่ม J (FIX-PLAN.md §2 กลุ่ม J · decisions.json / items.json ตาม id):
//     sales-q3       ฟอร์มแก้ของใบที่ทุกพื้นที่ (ที่ยังใช้อยู่) ประเมินจากแบบ — คำใบ้ใต้วันเข้าพื้นที่บอกว่าวันนั้นไม่ถูกใช้
//     sales-q5       พื้นที่ที่ไม่เคยวัดหน้างาน (ผลมีแต่จากแบบ) ไม่ถูกเรียกว่า "วัดซ้ำ" บนคำชุดวัด (`measure`)
//     sales-q6       ตัวเลขในหมายเหตุใต้ "ประเมินแล้วยังไม่ขาย" นับเฉพาะพื้นที่ที่ยังไม่ขาย (ชุดเดียวกับตัวเลขของช่อง)
//     sales-minor-5  สรุปบนไทล์สถานที่ — คู่ "คำ ตัวเลข" ไม่ขาดจากกัน ตัดบรรทัดได้แค่ที่ " · "
//   (sales-q4 · sales-q7 ถ้อยคำอยู่ที่ surveyDownstreamLabels.test.mjs ตามแผน)
// ⚠️ จอเป็น JSX (เทสต์รันใต้ Node ดิบ เรนเดอร์ไม่ได้) ⇒ ฟังก์ชันล้วนที่ประกาศในไฟล์จอถูกหยิบไปรันตรง ๆ (`pureFunction` —
//   ท่าเดียวกับ surveySheetDrawingScreen.test.mjs) · "จอเรียกอะไร" ยามด้วยซอร์สที่ตัดคอมเมนต์แล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customerZoneRegistry } from './zoneRegistry.js';
/* namespace import — ตัวช่วยใหม่ที่หายไปทำให้เทสต์ของมันแดงทีละข้อ ไม่ใช่ทั้งไฟล์โหลดไม่ขึ้น */
import * as pick from './zonePickState.js';
import {
  SURVEY_INTAKE_SWITCH_NOTE, SURVEY_VARIANT_DRAWING, SURVEY_ZONE_KNOWN_TEXT, surveyZoneRowText, surveyZoneWording,
} from './surveyIntake.js';
import { surveyZoneSeedPatch } from './surveyIntakeSeed.js';
import { surveyNeedsVisit } from './surveyMethod.js';
import { requestVariantAskedOnly } from '../requests/variantSwitch.js';
import { requestResultDateOnly } from '../master/requestTypes.js';
import { requestDueRequired } from '../requests/formTabs.js';
import { SURVEY_METHOD_CHIP } from './surveyMethodSwitch.js';
import { phraseRuns } from '../thaiWrap.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
/* ตัดคอมเมนต์ทิ้ง (คอมเมนต์ JSX ทั้งปีกกา · บล็อก · ทั้งบรรทัด) — คอมเมนต์เล่าที่มาได้โดยไม่ทำให้ยามเข้าใจผิด */
const code = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** ฟังก์ชันล้วน (`function ชื่อ(`) ในไฟล์จอ → ฟังก์ชันที่รันได้ — นับปีกกาหาท้ายตัวฟังก์ชัน · ต้องไม่อ้างชื่ออื่นในไฟล์ */
const pureFunction = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `ไม่มี ${name}`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return new Function(`${src.slice(start, i + 1)}\nreturn ${name};`)();
    }
  }
  throw new Error(`หาท้ายของ ${name} ไม่เจอ`);
};

const FORM = code(read('../../components/requests/RequestForm.js'));
const PAGE = code(read('../../app/requests/[id]/page.js'));
const SITE = code(read('../../components/requests/SurveySiteFields.js'));
const PANEL = code(read('../../components/service/CustomerZonesPanel.js'));

/* ═══ sales-q3 — คำใบ้ใต้ "วันที่ต้องการให้เข้าพื้นที่" ของใบที่ไม่มีการนัดแล้ว ═══════════════════════════════════════ */

const HINT_TODAY = 'เจ้าหน้าที่จะยืนยันวัน/เวลาจริงตอนกด "แจ้งกำหนดส่ง" — ใส่ช่วงที่อาคารเข้าได้จะช่วยให้ตรงรอบเดียว';
const HINT_NO_VISIT = 'ใบนี้หัวหน้า TS ประเมินจากแบบ ไม่มีการนัดเข้าพื้นที่ — วันที่ที่กรอกไว้จะไม่ถูกใช้';
const siteDueHint = (...args) => pureFunction(FORM, 'siteDueHint')(...args);
/* ค่า `noVisit` ที่หน้าคำร้องส่ง = `deskJob` = หัวข้อมีสถานที่ && ธงของตัวโหลด `surveyNeedsVisit(แถวพื้นที่) === false` (ยามซอร์สข้างล่าง) */
const noVisitOf = (zoneRows) => surveyNeedsVisit(zoneRows) === false;
/* RequestForm ส่ง `siteDueHint(noVisitHint)` ให้ช่อง · `noVisitHint = isEdit && noVisit && variantAskedOnly` (ยามซอร์สข้างล่าง)
   ค่าตั้งต้นของตัวช่วยนี้ = ใบที่ส่งแล้ว (`variantAskedOnly` จริง) — กรณีร่างส่งค่าเองในเทสต์ของมัน */
const dueHintOf = ({ isEdit = true, noVisit = false, variantAskedOnly = true } = {}) => siteDueHint(isEdit && noVisit && variantAskedOnly);

test('sales-q3 สามกรณีของมติ: จากแบบทั้งใบ = คำใบ้ใหม่ · ใบปน = คำเดิม · ไม่ส่งพร็อพ = คำเดิม (ทุกตัวอักษร)', () => {
  const allDrawing = [{ id: 'a', method: 'drawing', status: 'ok' }, { id: 'b', method: 'drawing', status: 'ok' }];
  const mixed = [{ id: 'a', method: 'drawing', status: 'ok' }, { id: 'b', method: 'onsite', status: 'ok' }];
  assert.equal(dueHintOf({ noVisit: noVisitOf(allDrawing) }), HINT_NO_VISIT);
  assert.equal(dueHintOf({ noVisit: noVisitOf(mixed) }), HINT_TODAY);
  assert.equal(dueHintOf(), HINT_TODAY, 'ผู้เรียกที่ไม่รู้จักพร็อพ (ฟอร์มสร้าง · โมดัลอื่น) = ประโยคเดิม');
  // "ทุกพื้นที่ที่ยังใช้อยู่" — พื้นที่ลงหน้างานที่ถูกตัดไปแล้วไม่ทำให้ใบกลับไปมีนัด (ค่าเดียวกับขั้นงาน "ประเมินจากแบบ")
  assert.equal(dueHintOf({ noVisit: noVisitOf([{ method: 'onsite', status: 'cut' }, { method: 'drawing', status: 'ok' }]) }), HINT_NO_VISIT);
  // ใบที่ยังต้องลงหน้างานล้วน / ใบที่ยังไม่มีแถวพื้นที่ = คำเดิม
  assert.equal(dueHintOf({ noVisit: noVisitOf([{ method: 'onsite', status: 'ok' }]) }), HINT_TODAY);
  assert.equal(dueHintOf({ noVisit: noVisitOf([]) }), HINT_TODAY);
  // ฟอร์มสร้างไม่มีทางได้คำใบ้ใหม่ แม้มีคนส่งพร็อพมา (มติ: "เฉพาะ…ในโหมดแก้ไข")
  assert.equal(dueHintOf({ isEdit: false, noVisit: true }), HINT_TODAY);
});

test('sales-q3 ร่างที่ยื่นเป็นจากแบบ แล้วกดไทล์ "ลงหน้างาน" = ประโยคเดิมทุกตัวอักษร (วันนั้นจะถูกใช้จริงหลังบันทึก)', () => {
  /* 🐞 ตรวจรอบสอง: ร่างก็มีแถวพื้นที่ — เปิดใบเป็นจากแบบ ⇒ ทุกแถวเกิดมาเป็นจากแบบ (`surveyZoneSeedPatch`) ⇒ `deskJob` จริง
     แต่ไทล์ของร่างยังกดได้ (`variantAskedOnly` เท็จ) — กด "ลงหน้างาน" ⇒ ช่องวันโผล่และบังคับ แล้วตอนบันทึกทุกพื้นที่กลายเป็น
     ลงหน้างาน ⇒ คำใบ้ "…จะไม่ถูกใช้" โกหก (และขัดกับ SURVEY_INTAKE_SWITCH_NOTE ของร่างที่ถูกตีกลับบนจอเดียวกัน) */
  const kind = 'site_survey';
  const seededRows = ['a', 'b'].map((id) => ({ id, status: 'ok', ...surveyZoneSeedPatch(SURVEY_VARIANT_DRAWING) }));
  const noVisit = noVisitOf(seededRows);
  assert.equal(noVisit, true, 'ร่างจากแบบ = deskJob จริง (ค่าที่หน้าคำร้องส่ง)');
  const draftAskedOnly = requestVariantAskedOnly({ kind, status: 'draft' });
  assert.equal(draftAskedOnly, false, 'ร่าง = ไทล์ยังกดได้');
  // ไทล์ยังเป็นจากแบบ — ช่องวันเข้าพื้นที่ถูกซ่อนทั้งก้อน (`hideDue` ของ S4) ⇒ คำใบ้ไม่ถูกวาดอยู่แล้ว
  assert.equal(requestResultDateOnly({ kind, variant: SURVEY_VARIANT_DRAWING }), true);
  // กด "ลงหน้างาน" — ช่องโผล่ (`hideDue` เท็จ) และบังคับ ⇒ คำใบ้ที่วาดต้องเป็นประโยคเดิม
  const onsite = { kind, variant: 'standard' };
  assert.equal(requestResultDateOnly(onsite), false);
  assert.equal(requestDueRequired(onsite), true);
  assert.equal(dueHintOf({ noVisit, variantAskedOnly: draftAskedOnly }), HINT_TODAY);
  // ประโยคของร่างที่ถูกตีกลับที่อยู่บนจอเดียวกันพูดว่าต้องวัดที่หน้างานใหม่ — คำใบ้ต้องไม่บอกว่าไม่มีนัด
  assert.match(SURVEY_INTAKE_SWITCH_NOTE, /ทุกพื้นที่ต้องวัดที่หน้างานใหม่/);
  // ใบเดียวกันหลังส่ง (รอรับเรื่อง · กำลังทำ) ที่ทุกพื้นที่ยังเป็นจากแบบ = ไทล์อ่านอย่างเดียว ⇒ คำใบ้ใหม่
  for (const status of ['pending', 'acknowledged']) {
    const variantAskedOnly = requestVariantAskedOnly({ kind, status });
    assert.equal(variantAskedOnly, true, status);
    assert.equal(dueHintOf({ noVisit, variantAskedOnly }), HINT_NO_VISIT, status);
  }
});

test('sales-q3 สายไฟ: หน้าคำร้องส่ง noVisit={deskJob} · ฟอร์มใช้เฉพาะใบที่ส่งแล้ว (noVisitHint) แล้วส่งคำใบ้ผ่าน siteDueHint · ช่องอื่นเท่าเดิม', () => {
  // หน้าคำร้อง: ค่าเดียวกับที่ทำให้ขั้นงานขึ้น "ประเมินจากแบบ" (ธงของตัวโหลด ผ่านทะเบียนหัวข้อ — ไม่เทียบชื่อหัวข้อ)
  assert.match(PAGE, /const deskJob = isScheduling && req\.surveyNeedsVisit === false;/);
  const editForm = PAGE.slice(PAGE.indexOf('<RequestForm\n'), PAGE.indexOf('/>', PAGE.indexOf('quotations={editRefs.quotations}')));
  assert.match(editForm, /mode="edit"/);
  assert.match(editForm, /\bnoVisit=\{deskJob\}/);
  assert.equal((PAGE.match(/\bnoVisit=/g) || []).length, 1, 'ส่งที่ฟอร์มแก้ที่เดียว');
  // ฟอร์ม: ค่าตั้งต้น = ไม่มีผล · คำใบ้ของวันเข้าพื้นที่มาจากตัวเดียว
  assert.match(FORM, /\n {2}noVisit = false,\n/);
  /* ด่านร่าง: ใช้ `variantAskedOnly` ตัวเดียวกับ `deskZonesOnly` ของ S4 (ใบที่ส่งแล้ว · ไทล์อ่านอย่างเดียว) — ถอดออก = ร่างที่
     สลับไทล์เป็นลงหน้างานได้คำใบ้ "…จะไม่ถูกใช้" ทั้งที่วันนั้นจะถูกใช้ (ตรวจรอบสอง) */
  assert.match(FORM, /const noVisitHint = isEdit && noVisit && variantAskedOnly;/);
  assert.match(FORM, /dueHint=\{needsSite \? keepPhrases\(siteDueHint\(noVisitHint\), \["จะไม่ถูกใช้"\]\) : undefined\}/);
  assert.equal((FORM.match(/siteDueHint\(/g) || []).length, 2, 'ประกาศหนึ่ง · เรียกที่ช่องเดียว');
  assert.equal((FORM.match(/วันที่ที่กรอกไว้จะไม่ถูกใช้/g) || []).length, 1);
  assert.equal((FORM.match(/เจ้าหน้าที่จะยืนยันวัน\/เวลาจริงตอนกด/g) || []).length, 1, 'ประโยคเดิมมีที่เดียว (ใน siteDueHint)');
  // ช่องวัน · ช่วงเวลา · ด่านบังคับ · คำใบ้ใต้วันรับผล ไม่ถูกแตะ (คำใบ้วันรับผลยังเป็นของ S4)
  assert.match(FORM, /hideDue=\{resultDateOnly\}/);
  assert.match(FORM, /showTime=\{needsSite && !resultDateOnly\}/);
  assert.match(FORM, /dueRequired=\{requestDueRequired\(value\)\}/);
  assert.match(FORM, /resultDueHint=\{resultDateOnly\n\s*\? \(awaitingAck \? "หัวหน้า TS จะแจ้งวันส่งผลจริงหลังรับเรื่อง" : false\)\n\s*: deskZonesOnly \? false : undefined\}/);
  assert.doesNotMatch(FORM, /noVisit[^\n]*(?:hideDue|showTime|dueRequired|resultDueHint)/, 'noVisit คุมแค่คำใบ้');
  // เมื่อ hideDue ของ S4 ซ่อนช่องอยู่แล้ว ไม่มีอะไรเพิ่ม — คำใบ้อยู่ในกิ่ง !hideDue ของช่องกลาง (ไม่ถูกวาด)
  const shared = code(read('../../components/requests/RequestEditableFields.js'));
  const body = shared.slice(shared.indexOf('export function RequestDueUrgentFields'));
  const gate = body.indexOf('{!hideDue && (');
  const result = body.indexOf('{resultDueLabel && (');
  assert.ok(gate > -1 && result > gate);
  assert.match(body.slice(gate, result), /\{dueHint && <small className=\{styles\.hint\}>\{dueHint\}<\/small>\}/);
});

/* ═══ sales-q5 — "วัดซ้ำ" ของพื้นที่ที่ไม่เคยวัดหน้างาน ═══════════════════════════════════════════════════════════ */

const NEVER_ONSITE = {
  id: 'Z-DR', name: 'ห้องประชุม', code: 'ZN-0002', surveyedAt: '2026-10-08T03:30:00+00:00',
  assessMethod: 'drawing', confirm: 'drawing', surveyCount: 1, onsiteSurveyCount: 0,
};
const MEASURED = { ...NEVER_ONSITE, id: 'Z-ON', assessMethod: 'onsite', confirm: 'none', surveyCount: 2, onsiteSurveyCount: 1 };
/* แถวทะเบียนรุ่นที่ยังไม่มีคีย์ `onsiteSurveyCount` — ถอยไปใช้ `surveyCount` แบบเดิม ⇒ วัดมาแล้ว = คำเดิม */
const LEGACY = { id: 'Z-OLD', name: 'ห้องเก่า', surveyedAt: '2026-08-01T05:00:00Z', surveyCount: 2 };
const RENEW_TODAY = 'เคยขาย รอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้';
const RENEW_NEW = 'เคยขาย รอบจบแล้ว — วัดใหม่เพื่อต่ออายุได้';
const RENEW_ASSESS = 'เคยขาย รอบจบแล้ว — ประเมินซ้ำเพื่อต่ออายุได้';
const AWAITING_NOTE = ' · ตัวเลขจากแบบ รอยืนยันหน้างาน';
/* ตัวประกอบบรรทัดรองของแถวที่ติ๊กแล้ว — ตรงกับ `knownZoneText` ของฟอร์ม (ยามซอร์สข้างล่าง) */
const zonePickedOnsiteText = (...args) => pick.zonePickedOnsiteText(...args);
const zonePickedRow = (wording, zone) => zonePickedOnsiteText(zone, { wording }) || surveyZoneRowText(wording, zone);

test('sales-q5 ไทล์รอบจบแล้ว: ไม่เคยวัดหน้างาน = "วัดใหม่…" (ต่อท้ายรอยืนยันเหมือนเดิม) · วัดหน้างานแล้ว / แถวไม่มีคีย์ = คำเดิม', () => {
  const ended = (zone) => pick.zonePickState({ ...zone, termState: 'ended' }).reason;
  assert.equal(ended(NEVER_ONSITE), RENEW_NEW);
  assert.equal(ended({ ...NEVER_ONSITE, confirm: 'awaiting' }), `${RENEW_NEW}${AWAITING_NOTE}`);
  assert.equal(ended(MEASURED), RENEW_TODAY);
  assert.equal(ended(LEGACY), RENEW_TODAY);
  // วัดหน้างานมาแล้ว แล้วรอบล่าสุดจากแบบ (รอยืนยัน) = เคยวัดหน้างาน ⇒ คำเดิม + ต่อท้าย
  assert.equal(ended({ ...NEVER_ONSITE, confirm: 'awaiting', surveyCount: 3, onsiteSurveyCount: 2 }), `${RENEW_TODAY}${AWAITING_NOTE}`);
  // แถวที่ไม่มีตัวนับรอบเลย = ไม่รู้ ⇒ คำเดิม (ไม่เรียกพื้นที่ที่ไม่รู้ประวัติว่า "ไม่เคยวัดหน้างาน")
  assert.equal(ended({ id: 'Z-X', surveyedAt: '2026-01-10' }), RENEW_TODAY);
});

test('sales-q5 ฟอร์มที่เลือก "ประเมินจากแบบ" (assess): คำของ S4 ชนะ — "ประเมินซ้ำ…" ทุกพื้นที่', () => {
  for (const zone of [NEVER_ONSITE, MEASURED, LEGACY]) {
    assert.equal(pick.zonePickState({ ...zone, termState: 'ended' }, new Set(), { wording: 'assess' }).reason, RENEW_ASSESS, zone.id);
    assert.equal(zonePickedOnsiteText(zone, { wording: 'assess' }), null, zone.id);
    assert.equal(zonePickedRow('assess', zone), 'ประเมินซ้ำพื้นที่เดิม', zone.id);
  }
});

test('sales-q5 แถวที่ติ๊กแล้ว: ไม่เคยวัดหน้างาน = "วัดหน้างานพื้นที่เดิม" · วัดแล้ว / ไม่มีคีย์ = "วัดซ้ำพื้นที่เดิม" · ไม่เคยมีผล = คำกลาง', () => {
  assert.equal(zonePickedOnsiteText(NEVER_ONSITE), 'วัดหน้างานพื้นที่เดิม');
  assert.equal(zonePickedRow('measure', NEVER_ONSITE), 'วัดหน้างานพื้นที่เดิม');
  assert.equal(zonePickedRow('measure', MEASURED), 'วัดซ้ำพื้นที่เดิม');
  assert.equal(zonePickedRow('measure', LEGACY), 'วัดซ้ำพื้นที่เดิม');
  // ยังไม่เคยมีผล / แถวทะเบียนยังไม่มา = คำกลางของ S4 (UAT S4 รอบ 4 ข้อ 5) — ไม่ถูกแตะ
  assert.equal(zonePickedOnsiteText({ id: 'Z-NEW', surveyCount: 0, onsiteSurveyCount: 0 }), null);
  assert.equal(zonePickedRow('measure', { id: 'Z-NEW', surveyCount: 0, onsiteSurveyCount: 0 }), SURVEY_ZONE_KNOWN_TEXT);
  assert.equal(zonePickedOnsiteText(undefined), null);
  assert.equal(zonePickedRow('measure', undefined), SURVEY_ZONE_KNOWN_TEXT);
  // ยังไม่เลือกวิธี / ลงหน้างาน = คำชุดวัด
  for (const variant of [null, '', 'standard']) {
    assert.equal(zonePickedRow(surveyZoneWording(variant), NEVER_ONSITE), 'วัดหน้างานพื้นที่เดิม', String(variant));
  }
});

test('sales-q5 ผ่านทะเบียนจริง: พื้นที่ที่ผลมีแต่จากแบบได้คำใหม่ทั้งสองจุด · พื้นที่ที่วัดหน้างานแล้วได้คำเดิม · ไทล์กับแถวพูดตรงกัน', () => {
  const parts = [{ widthM: 10, lengthM: 4, heightM: 3 }];
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', name: 'สำนักงานใหญ่' }],
    zones: [{ id: 'ZD', siteId: 'ST1', name: 'จากแบบล้วน' }, { id: 'ZO', siteId: 'ST1', name: 'วัดจริง' }],
    surveys: [
      { id: 'S1', zoneId: 'ZD', requestId: 'RD', status: 'ok', method: 'drawing', createdAt: '2026-10-01T03:00:01Z', surveyedAt: '2026-10-01T05:00:00Z', parts },
      { id: 'S2', zoneId: 'ZO', requestId: 'RO', status: 'ok', createdAt: '2026-09-01T03:00:01Z', surveyedAt: '2026-09-01T05:00:00Z', parts },
    ],
    requests: [
      { id: 'RD', status: 'closed', createdAt: '2026-10-01T03:00:00Z', answeredAt: '2026-10-02T03:00:00Z', surveyConfirm: 'not_needed' },
      { id: 'RO', status: 'closed', createdAt: '2026-09-01T03:00:00Z', answeredAt: '2026-09-02T03:00:00Z' },
    ],
    terms: [
      { id: 'T1', zoneId: 'ZD', salesOrderId: 'SO1', endDate: '2026-10-05' },
      { id: 'T2', zoneId: 'ZO', salesOrderId: 'SO1', endDate: '2026-10-05' },
    ],
    orders: [{ id: 'SO1', status: 'approved', orderNumber: 'SO-1' }],
    todayIso: '2026-10-20',
  });
  const rows = new Map(reg.sites[0].zones.map((z) => [z.id, z]));
  assert.deepEqual([rows.get('ZD').termState, rows.get('ZD').onsiteSurveyCount], ['ended', 0]);
  assert.deepEqual([rows.get('ZO').termState, rows.get('ZO').onsiteSurveyCount], ['ended', 1]);
  const tiles = new Map(pick.zonePickList(reg.sites[0].zones).map((t) => [t.id, t]));
  assert.equal(tiles.get('ZD').reason, RENEW_NEW);
  assert.equal(tiles.get('ZO').reason, RENEW_TODAY);
  assert.equal(zonePickedRow('measure', rows.get('ZD')), 'วัดหน้างานพื้นที่เดิม');
  assert.equal(zonePickedRow('measure', rows.get('ZO')), 'วัดซ้ำพื้นที่เดิม');
  // ไทล์ "วัดใหม่…" ไม่มีวันได้แถวที่พูด "ซ้ำ" (และกลับกัน)
  for (const [id, tile] of tiles) assert.equal(/วัดใหม่/.test(tile.reason), !/ซ้ำ/.test(zonePickedRow('measure', rows.get(id))), id);
});

test('sales-q5 สายไฟ: ฟอร์มถาม zonePickedOnsiteText ก่อน surveyZoneRowText ด้วยแถวทะเบียนตัวเดียวกับไทล์ · zonePickState ไม่รู้จักวิธี', () => {
  assert.match(SITE, /import \{ sitePickSummary, zonePickedOnsiteText, zonePickList \} from "@\/lib\/service\/zonePickState";/);
  assert.match(SITE, /const knownZoneText = \(registryZone\) => zonePickedOnsiteText\(registryZone, \{ wording \}\)\s*\|\| surveyZoneRowText\(wording, registryZone\);/);
  assert.match(SITE, /`\$\{siteZones\.find\(\(z\) => z\.id === row\.zoneId\)\?\.code \|\| row\.zoneId\} · \$\{knownZoneText\(siteZones\.find\(\(z\) => z\.id === row\.zoneId\)\)\}`/);
  assert.equal((SITE.match(/surveyZoneRowText\(/g) || []).length, 1, 'คำของแถวผ่านตัวประกอบตัวเดียว');
  // ยามของ S4: ไฟล์ตัดสินคำไม่อ่าน .variant · ไม่มีค่าวิธีเป็นตัวอักษร
  const pickSrc = code(read('./zonePickState.js'));
  assert.doesNotMatch(pickSrc, /\.variant\b/);
  assert.doesNotMatch(pickSrc, /['"`](?:drawing|onsite|standard)['"`]/);
});

/* ═══ sales-q6 — หมายเหตุใต้ "ประเมินแล้วยังไม่ขาย" นับชุดเดียวกับตัวเลขของช่อง ═══════════════════════════════════ */

/* ช่องกับหมายเหตุนับจากรายการเดียว (`unsoldCounts` · ฟังก์ชันล้วนของแท็บ) */
const unsoldCounts = (...args) => pureFunction(PANEL, 'unsoldCounts')(...args);
const SURVEY_PARTS = [{ widthM: 10, lengthM: 4, heightM: 3 }];

test('sales-q6 พื้นที่รอยืนยันที่ขายแล้ว / รอบจบแล้ว ไม่ถูกนับในหมายเหตุ — นับแค่ที่ยังไม่ขาย', () => {
  const ids = ['ZA', 'ZS', 'ZE', 'ZN'];
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', name: 'สำนักงานใหญ่' }, { id: 'ST2', name: 'สาขา' }],
    zones: [
      { id: 'ZA', siteId: 'ST1', name: 'รอยืนยัน ยังไม่ขาย' },
      { id: 'ZS', siteId: 'ST1', name: 'รอยืนยัน ขายแล้ว' },
      { id: 'ZE', siteId: 'ST2', name: 'รอยืนยัน รอบจบแล้ว' },
      { id: 'ZN', siteId: 'ST2', name: 'ลงหน้างาน ยังไม่ขาย' },
    ],
    surveys: ids.map((zoneId) => ({
      id: `S-${zoneId}`, zoneId, requestId: zoneId === 'ZN' ? 'RO' : 'RD', status: 'ok',
      method: zoneId === 'ZN' ? undefined : 'drawing', createdAt: '2026-10-01T03:00:01Z', surveyedAt: '2026-10-01T05:00:00Z',
      parts: SURVEY_PARTS,
    })),
    requests: [
      { id: 'RD', status: 'closed', createdAt: '2026-10-01T03:00:00Z', answeredAt: '2026-10-02T03:00:00Z', surveyConfirm: 'needed' },
      { id: 'RO', status: 'closed', createdAt: '2026-10-01T03:00:00Z', answeredAt: '2026-10-02T03:00:00Z' },
    ],
    terms: [
      { id: 'T-S', zoneId: 'ZS', salesOrderId: 'SO1' },
      { id: 'T-E', zoneId: 'ZE', salesOrderId: 'SO1', endDate: '2026-10-05' },
    ],
    orders: [{ id: 'SO1', status: 'approved', orderNumber: 'SO-1' }],
    todayIso: '2026-10-20',
  });
  // ทะเบียนนับรอยืนยันทุกพื้นที่ (3) — นั่นคือที่มาของตัวเลขในหมายเหตุที่มากกว่าตัวเลขของช่องเอง
  assert.equal(reg.awaitingConfirm, 3);
  assert.deepEqual(unsoldCounts(reg), { unsold: 2, awaiting: 1 }, 'ช่อง = ZA + ZN · หมายเหตุ = เฉพาะ ZA (ZS ขายแล้ว · ZE รอบจบแล้ว · ZN ไม่ได้รอยืนยัน)');
  // ไม่มีพื้นที่รอยืนยันที่ยังไม่ขาย / ทะเบียนว่าง / ไม่มีคีย์ = 0 ⇒ ประโยคเดิม
  assert.equal(unsoldCounts({ sites: [{ zones: [{ confirm: 'awaiting', termState: 'active', surveyedAt: '2026-10-01' }] }] }).awaiting, 0);
  assert.deepEqual(unsoldCounts({ sites: [] }), { unsold: 0, awaiting: 0 });
  assert.deepEqual(unsoldCounts({}), { unsold: 0, awaiting: 0 });
  assert.deepEqual(unsoldCounts(null), { unsold: 0, awaiting: 0 });
  // แถวที่ไม่มี termState = ยังไม่ขาย (ค่าตั้งต้นเดียวกับป้ายของแท็บ)
  assert.equal(unsoldCounts({ sites: [{ zones: [{ confirm: 'awaiting', surveyedAt: '2026-10-01' }, { confirm: 'drawing', surveyedAt: '2026-10-01' }] }] }).awaiting, 1);
});

test('sales-q6 (ตรวจรอบสอง) พื้นที่ที่ขายแล้วแต่ไม่เคยวัด: ช่องไม่ถูกหักจนหมายเหตุใหญ่กว่า — ช่องกับหมายเหตุนับจากรายการเดียว', () => {
  /* ทรงที่ผู้ตรวจลอง: จากแบบรอยืนยัน ยังไม่ขาย 2 พื้นที่ + ขายแล้วแต่ไม่เคยวัด 1 พื้นที่ (มีในข้อมูลนำเข้า)
     สูตรเดิมของช่อง (ประเมินแล้ว − ขายแล้ว − รอบจบ) = 2 − 1 − 0 = 1 แต่หมายเหตุนับได้ 2 ⇒ "1" ข้างประโยค "…2 พื้นที่จากแบบ…" */
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', name: 'สำนักงานใหญ่' }],
    zones: [
      { id: 'ZA1', siteId: 'ST1', name: 'จากแบบ 1' },
      { id: 'ZA2', siteId: 'ST1', name: 'จากแบบ 2' },
      { id: 'ZD', siteId: 'ST1', name: 'ขายแล้วแต่ไม่เคยวัด' },
    ],
    surveys: ['ZA1', 'ZA2'].map((zoneId) => ({
      id: `S-${zoneId}`, zoneId, requestId: 'RD', status: 'ok', method: 'drawing',
      createdAt: '2026-10-01T03:00:01Z', surveyedAt: '2026-10-01T05:00:00Z', parts: SURVEY_PARTS,
    })),
    requests: [{ id: 'RD', status: 'closed', createdAt: '2026-10-01T03:00:00Z', answeredAt: '2026-10-02T03:00:00Z', surveyConfirm: 'needed' }],
    terms: [{ id: 'T-D', zoneId: 'ZD', salesOrderId: 'SO1' }],
    orders: [{ id: 'SO1', status: 'approved', orderNumber: 'SO-1' }],
    todayIso: '2026-10-20',
  });
  const debt = reg.sites[0].zones.find((z) => z.id === 'ZD');
  assert.deepEqual([debt.termState, debt.surveyedAt, debt.volumeCbm], ['active', null, null], 'ขายอยู่ ไม่มีผล');
  assert.deepEqual([reg.measuredCount, reg.soldCount, reg.endedCount], [2, 1, 0]);
  const oldBox = reg.measuredCount - reg.soldCount - reg.endedCount;
  assert.equal(oldBox, 1, 'สูตรเดิมหักพื้นที่ที่ไม่เคยอยู่ในตัวตั้ง');
  assert.deepEqual(unsoldCounts(reg), { unsold: 2, awaiting: 2 }, 'ช่อง = ZA1 + ZA2 (พื้นที่ที่ขายแล้วแต่ไม่เคยวัดไม่ใช่ "ประเมินแล้ว")');
  // ทุกพื้นที่ในหมายเหตุอยู่ในช่องด้วย — หมายเหตุไม่มีวันเกินช่อง เพราะเป็นส่วนหนึ่งของรายการเดียวกัน (ไม่ใช่เพราะข้อมูลชุดนี้)
  for (const fixture of [reg, { sites: [{ zones: [{ confirm: 'awaiting', surveyedAt: null, volumeCbm: null }] }] }]) {
    const { unsold, awaiting } = unsoldCounts(fixture);
    assert.ok(awaiting <= unsold, JSON.stringify({ unsold, awaiting }));
  }
});

test('sales-q6 + sales-q7 สายไฟ: ตัวเลขของช่อง · ประโยคที่มีจำนวน · คลาสตัดบรรทัด อ่านรายการเดียวกัน · ไม่อ่านยอดรวม/สูตรลบของทะเบียนแล้ว', () => {
  assert.match(PANEL, /const unsoldSet = unsoldCounts\(registry\);\s*const \{ unsold \} = unsoldSet;/);
  assert.match(PANEL, /className=\{unsold > 0 && unsoldSet\.awaiting > 0 \? styles\.noteWrap : undefined\}/);
  assert.match(PANEL, /label="ประเมินแล้วยังไม่ขาย" value=\{unsold\}/);
  assert.match(PANEL, /note=\{keepPhrases\(unsoldNote\(unsoldSet\), \["รอยืนยันหน้างาน"\]\)\}/);
  assert.match(PANEL, /function unsoldNote\(\{ unsold, awaiting \}\) \{/);
  assert.doesNotMatch(PANEL, /registry\.awaitingConfirm/);
  assert.doesNotMatch(PANEL, /registry\.(?:soldCount|endedCount)\s*\|\|/, 'สูตรลบของช่องเดิมไม่เหลือ');
  // "ประเมินแล้ว" ของรายการ = สูตรเดียวกับยอด `measuredCount` ของทะเบียน (registryTotals)
  assert.match(code(read('./zoneRegistry.js')), /zones\.filter\(\(z\) => z\.surveyedAt \|\| z\.volumeCbm !== null\)/);
  assert.match(PANEL, /zone\.surveyedAt \|\| zone\.volumeCbm !== null/);
  // ประโยคบรรทัดเดียวของมติ sales-q7 — คำ "จากแบบ" มาจากค่าคงที่ตัวเดียวกับป้ายวิธี
  // ทางสำรองของมติ (UAT sales 27/10 — ประโยคที่มี "จากแบบ" ยังขึ้นสองบรรทัดที่ 1440): ป้ายบนแถวบอกที่มาอยู่แล้ว
  assert.match(PANEL, /\? `เสนอราคาได้ · \$\{fmtNumber\(awaiting\)\} พื้นที่รอยืนยันหน้างาน`/);
  // คลาสตัดบรรทัดยังอยู่ (k สองหลัก / จอแคบ ห้ามตัดท่อน "รอยืนยันหน้างาน" ทิ้ง)
  assert.match(read('../../components/service/CustomerZonesPanel.module.css'), /\.wrap \.noteWrap em \{\s*overflow: visible;\s*white-space: normal;/);
});

/* ═══ sales-minor-5 — สรุปบนไทล์สถานที่: คู่ "คำ ตัวเลข" ไม่ขาดจากกัน ═══════════════════════════════════════════════ */

test('sales-minor-5 คำอธิบายของไทล์สถานที่ห่อ nowrap ทีละคู่ — นอกคู่เหลือแค่ตัวคั่น ⇒ ตัดบรรทัดได้เฉพาะที่ " · " · ตัวหนังสือไม่ถูกแตะ', () => {
  // ฟอร์มส่งท่อนของสรุปเป็นวลีที่ห้ามขาดให้ keepPhrases (ตัววาดของ phraseRuns) — ยามซอร์สเต็มอยู่ในเทสต์ถัดไป
  assert.match(SITE, /description: keepPhrases\(/);
  const parts = ['3 พื้นที่', 'วัดหน้างาน 2', `${SURVEY_METHOD_CHIP.drawing} 1`, 'ขายแล้ว 1', 'มีใบสั่งวัดค้าง 1'];
  const text = ['SS-0001 · 99 ถนนสุขุมวิท', parts.join(' · ')].join(' — ');
  const runs = phraseRuns(text, parts);
  assert.equal(runs.map((r) => r.text).join(''), text, 'ไม่เติม/ไม่ตัดตัวอักษร (ไม่มี WORD JOINER · Ctrl+F ยังเจอ)');
  assert.deepEqual(runs.filter((r) => r.keep).map((r) => r.text), parts, 'ทุกคู่เป็นหนึ่งชิ้น');
  const tail = runs.slice(runs.findIndex((r) => r.keep));
  for (const run of tail.filter((r) => !r.keep)) assert.equal(run.text, ' · ', `ช่องว่างนอกคู่มีแค่รอบตัวคั่น: "${run.text}"`);
  // สรุปของใบลงหน้างานล้วน (ประโยคเดิม) ก็ถูกห่อแบบเดียวกัน
  const today = ['4 พื้นที่', 'วัดแล้ว 2', 'ขายแล้ว 1'];
  assert.deepEqual(phraseRuns(today.join(' · '), today).map((r) => [r.text, r.keep]),
    [['4 พื้นที่', true], [' · ', false], ['วัดแล้ว 2', true], [' · ', false], ['ขายแล้ว 1', true]]);
});

test('sales-minor-5 สายไฟ: สรุปเป็นรายการท่อน · คำอธิบายของไทล์ห่อด้วย keepPhrases(ข้อความ, ท่อน) · ลำดับท่อนเดิม', () => {
  assert.match(SITE, /import \{ keepPhrases \} from "@\/components\/ThaiText";/);
  assert.match(SITE, /const summaryPartsOf = \(siteRow\) => \{/);
  assert.match(SITE, /if \(!entry \|\| !entry\.zoneCount\) return \[\];/);
  assert.match(SITE, /sum\.pending \? `มีใบสั่งวัดค้าง \$\{sum\.pending\}` : null,\n\s*\]\.filter\(Boolean\);/, 'คืนท่อน ไม่ใช่สตริงที่ต่อแล้ว');
  assert.match(SITE, /description: keepPhrases\(\n\s*\[\[s\.code, s\.address\]\.filter\(Boolean\)\.join\(" · "\), summary\.join\(" · "\)\]\.filter\(Boolean\)\.join\(" — "\),\n\s*summary,\n\s*\) \|\| undefined,/);
  assert.doesNotMatch(SITE, /summaryOf\(/, 'ตัวต่อสตริงตัวเดิมไม่เหลือ');
  // ไทล์ (OptionTiles) และดรอปดาวน์ค้นได้ (SearchableSelect · เกิน 6 สถานที่) วาดคำอธิบายตัวเดียวกัน
  assert.match(SITE, /\{o\.description \? <small className=\{styles\.hint\}>\{o\.description\}<\/small> : null\}/);
  assert.match(SITE, /<OptionTiles\s+options=\{siteOptions\}/);
  // ไม่มีอักขระซ่อนในซอร์ส (กติกา: ห้าม U+2060 / ZWSP / NBSP ในข้อความไทย)
  assert.doesNotMatch(read('../../components/requests/SurveySiteFields.js'), /[\u2060\u200b\u00a0]/);
});
