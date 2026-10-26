// ── ประเมินจากแบบ งวด S2b · กลุ่ม B: รายการพื้นที่ · หน้าพื้นที่ · แผง "แบบจากฝ่ายขาย" — ยามอ่านซอร์สจอ ─────────────────
//
// ⭐ เทสต์ชุดนี้รันใต้ Node ล้วน (เรนเดอร์ JSX ไม่ได้) ⇒ ตรึงสองอย่าง:
//   ① **จอเรียกอะไร / ประกาศอะไร** — ของที่พังเงียบ: พื้นที่ลงหน้างานหลุดเข้ากิ่งของพื้นที่จากแบบ · ช่องภาพแบบรับ PDF ·
//      ปุ่มแก้ที่โผล่ให้คนที่แก้ไม่ได้ (ผู้วางคิว · มติ O4) · ปุ่ม "ใช้รูปนี้…" ที่ขึ้นโดยไม่มีพื้นที่ให้แนบ
//   ② **ค่าที่จอหยิบจาก view-model** (ตัวตัดสินของงวด S2a/S2b) — คีย์ที่จอพึ่งต้องมีอยู่จริง และใบลงหน้างานล้วนต้องได้ค่าว่างทุกคีย์
// 🔴 ทุกข้อของพื้นที่จากแบบมีคู่ "ใบลงหน้างานล้วน = จอเดิม" — สวิตช์ปิด/ใบที่ไม่มีพื้นที่จากแบบต้องไม่มีอะไรโผล่เพิ่ม (สเปก §4 แถว B)
// ⚠️ อ่านซอร์สหลังตัดคอมเมนต์ — ⛔ สตริง/regex ในไฟล์นี้ห้ามมีทับตามด้วยดอกจันติดกัน (ตัวตัดคอมเมนต์ของยามตัวอื่นกลืนโค้ดที่เหลือ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  surveyDrawingZoneView, surveySalesDrawingsView, surveyZoneActions, surveyZoneListView, surveyZoneSections, surveyZoneStateBadge,
} from './surveyFieldView.js';
import { SURVEY_METHOD_CHIP, SURVEY_METHOD_LABEL } from './surveyMethodSwitch.js';
import { isJpgOrPngFile } from './surveyMethod.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const count = (src, needle) => src.split(needle).length - 1;
const slice = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start !== -1, `หา "${from}" ไม่เจอ`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end !== -1, `หา "${to}" หลัง "${from}" ไม่เจอ`);
  return src.slice(start, end);
};
// แท็กเปิดของ JSX ทั้งแท็ก — นับวงเล็บปีกกา เพราะ `=>` / `>` ในค่า prop ไม่ใช่จุดปิดแท็ก
const jsxOpenTags = (src, start) => [...src.matchAll(start)].map((m) => {
  let depth = 0;
  for (let i = m.index + 1; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    else if (src[i] === '>' && depth === 0) return src.slice(m.index, i + 1);
  }
  return src.slice(m.index);
});

const FILES = {
  SurveyZoneList: '../../components/service/SurveyZoneList.js',
  SurveyZonePage: '../../components/service/SurveyZonePage.js',
  SurveySalesDrawings: '../../components/service/SurveySalesDrawings.js',
};
const RAW = Object.fromEntries(Object.entries(FILES).map(([name, rel]) => [name, read(rel)]));
const LIST = code(RAW.SurveyZoneList);
const ZONE = code(RAW.SurveyZonePage);
const PANEL = code(RAW.SurveySalesDrawings);
const LIST_CSS = css('../../components/service/SurveyZoneList.module.css');
const ZONE_CSS = css('../../components/service/SurveyZonePage.module.css');
const PANEL_CSS = css('../../components/service/SurveySalesDrawings.module.css');

/* กิ่งของพื้นที่จากแบบในหน้าพื้นที่ = หัวข้อ ② ③ ชุดที่สอง (ชุดลงหน้างานอยู่ก่อนในไฟล์) */
const ONSITE_SECTIONS = slice(ZONE, '{!drawing ? (', '<Section area="plan"');
const DRAWING_SECTIONS = slice(ZONE, '<Section area="plan"', '<Section area="note"');

/* ── ค่าตั้งต้นของเทสต์ฝั่ง view-model ─────────────────────────────────────────────── */
const DRAWING = { method: 'drawing' };
const zone = (id, over = {}) => ({
  id, zoneCode: `ZN-1188-1030${id}`, zoneName: `ห้อง ${id}`, zoneFloor: '01', status: 'ok', parts: [], spots: [], ...over,
});
const sized = { parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }] };
const file = (id, docType, mimeType = 'image/jpeg', fileName = `${id}.jpg`) => ({ id, docType, mimeType, fileName });
const chipOf = (row) => {
  const { chip: label } = row;
  return label;
};

/* ══ ① ทางแยกเดียว: หน้าพื้นที่ถาม `surveyDrawingZoneView` · จอไม่อ่านคอลัมน์วิธีเอง ═══════════════════════════ */

test('🔑 หน้าพื้นที่แยกทางด้วย surveyDrawingZoneView ตัวเดียว — แก้ได้ไหมของพื้นที่จากแบบมาจาก editable ไม่ใช่ canWrite', () => {
  assert.match(ZONE, /const drawing = surveyDrawingZoneView\(\{ zone, files: shownFiles, canDecide, locked, dept \}\);/);
  assert.match(ZONE, /const edit = drawing \? drawing\.editable : \(canWrite && !isCut\);/,
    'พื้นที่ลงหน้างาน (drawing === null) ได้กติกาเดิมทุกตัวอักษร');
  assert.equal(count(ZONE, 'surveyDrawingZoneView('), 1, 'ถามครั้งเดียว — สองครั้งคือสองคำตอบที่เพี้ยนหากันได้');
  for (const name of ['canDecide = false', 'locked = false', 'dept = null', 'drawings = null', 'planReloadKey = 0']) {
    assert.ok(ZONE.includes(`\n  ${name},\n`), `prop ${name} ต้องมีค่าตั้งต้นที่ทำให้ผู้เรียกเดิมได้หน้าเดิม`);
  }
  // ป้ายที่มาของพื้นที่จากแบบและคำของปุ่ม/ป้ายมาจากตัวตัดสิน — ส่งฝ่ายของใบให้ทั้งสองตัว
  assert.match(ZONE, /surveyZoneStateBadge\(\{ zone, files: shownFiles, dirty, error, conflict, dept \}\)/);
});

test('🔴 สามไฟล์ของกลุ่มไม่อ่านคอลัมน์วิธีของแถวเอง — ถามผ่าน view-model (ยามงวด S1 ข้อ ①) · รายการใช้ค่านั้นเป็นหน้าตาของป้ายอย่างเดียว', () => {
  for (const [name, src] of [['SurveyZonePage', ZONE], ['SurveySalesDrawings', PANEL]]) {
    assert.doesNotMatch(src, /\.method\b/, `${name} ต้องไม่แตะ .method`);
  }
  for (const [name, src] of [['SurveyZoneList', LIST], ['SurveyZonePage', ZONE], ['SurveySalesDrawings', PANEL]]) {
    assert.doesNotMatch(src, /isDrawingZone|zoneMethod|SURVEY_METHOD_(?:DRAWING|ONSITE)/, `${name} ไม่ตัดสินวิธีเอง`);
    // สองรูปที่ยามงวด S1 ข้อ ① ห้าม (เทียบค่าคอลัมน์วิธีตรง ๆ ทั้งสองด้าน)
    assert.doesNotMatch(src, /\.method\s*[!=]==?\s*['"`](?:drawing|onsite)['"`]/, `${name} ไม่เทียบค่าวิธี`);
    assert.doesNotMatch(src, /['"`](?:drawing|onsite)['"`]\s*[!=]==?\s*[\w.?]*\.method\b/, `${name} ไม่เทียบค่าวิธีกลับด้าน`);
  }
  assert.equal(count(LIST, '.method'), 2, 'รายการ: ค่าวิธีของแถวไปที่ prop หน้าตาของป้ายที่เดียว (+ ชื่อคลาสของป้าย)');
  assert.match(LIST, /<SurveyMethodChip variant=\{row\.method\} label=\{methodLabel\} className=\{styles\.method\} \/>/);
});

test('🔴 ยามข้ามไฟล์สองตัว: ไม่มีคำว่าชิป (ตัวเล็ก) ในสตริงบรรทัดเดียวกัน · ไม่มีค่าวิธีติดกับชื่อคอลัมน์วิธี', () => {
  /* ตัวนับของ `badgeFamilies.test.mjs` (นับทั้งไฟล์รวมคอมเมนต์) — ช่วงในเครื่องหมายคำพูดบนบรรทัดเดียวที่มีคำนั้นโดด ๆ */
  const chipInString = /(["'`])[^"'`\n]*(?<![\w-])chip(?![\w-])[^"'`\n]*\1/g;
  /* ยามเขียนของงวด S2a (`surveyMethodGuards.test.mjs` ข้อ ②) */
  const methodWrite = /\bmethod\s*(?::|=(?!=))\s*(?:SURVEY_METHOD_\w+|['"`](?:drawing|onsite)['"`])/;
  for (const [name, src] of Object.entries(RAW)) {
    assert.deepEqual(src.match(chipInString) || [], [], `${name}: คีย์ป้ายวิธีต้องถูกแกะบนบรรทัดที่ไม่มีสตริง`);
    assert.doesNotMatch(src, methodWrite, `${name}: prop ของป้ายชื่อ variant ไม่ใช่ method`);
  }
  // คีย์ป้ายวิธีถูกแกะเป็นชื่อกลางบนบรรทัดของตัวเอง
  assert.match(LIST, /\n\s+const \{ chip: methodLabel \} = row;\n/);
  assert.match(ZONE, /\n\s+const \{ chip: methodLabel = null \} = drawing \|\| \{\};\n/);
  assert.match(ZONE, /<SurveyMethodChip label=\{methodLabel\} size="md" \/>/, 'หัวหน้าพื้นที่: หน้าตาตั้งต้นของป้าย = จากแบบ (ไม่ส่ง variant)');
  for (const src of [LIST, ZONE]) assert.doesNotMatch(src, /<SurveyMethodChip[^>]*\bmethod=/);
});

test('พื้นที่ลงหน้างานไปกิ่งเดิม: ตัวตัดสินคืน null (รวมแถวเก่าที่ไม่มีคีย์วิธี) · หัวข้อ ② ③ ชุดเดิมอยู่ครบและมาก่อนในไฟล์', () => {
  for (const row of [zone('1'), zone('2', { method: 'onsite' }), zone('3', { method: null }), zone('4', { method: 'Drawing' })]) {
    assert.equal(surveyDrawingZoneView({ zone: row, files: [], canDecide: true }), null);
  }
  assert.equal(surveyDrawingZoneView({ zone: null }), null);
  assert.notEqual(surveyDrawingZoneView({ zone: zone('5', DRAWING), files: [], canDecide: true }), null);

  assert.match(ONSITE_SECTIONS, /<Section area="wide" id=\{sectionId\("wide"\)\} number=\{2\} title="ภาพกว้าง"/);
  assert.match(ONSITE_SECTIONS, /\{photoPanel\(SURVEY_DOC_WIDE, "ภาพกว้าง", 0\)\}/);
  assert.match(ONSITE_SECTIONS, /<Section area="spots" id=\{sectionId\("spots"\)\} number=\{3\} title="จุดที่ติดตั้งได้"/);
  assert.match(ONSITE_SECTIONS, /docTypes=\{SPOT_DOC_TYPES\}/);
  assert.match(ONSITE_SECTIONS, /เพิ่มจุดที่ติดตั้งได้/);
  /* ช่องผังของพื้นที่ลงหน้างานยังเป็นของตารางสรุปส่งผล — หน้าพื้นที่ของช่างไม่มีช่องผัง (มติ 25/09) */
  assert.doesNotMatch(ONSITE_SECTIONS, /SURVEY_DOC_PLAN|PLAN_DOC_TYPES|survey_plan|fileGate/);
  assert.ok(ZONE.indexOf('<Section area="spots"') < ZONE.indexOf('<Section area="plan"'),
    'ยามซอร์สเดิมอ่านหัวข้อจุดชุดแรกของไฟล์ — ชุดลงหน้างานต้องมาก่อน');
  // หัวข้อที่ใช้ร่วม: คำเดิมยังเป็นค่าตั้งต้นเมื่อไม่ใช่พื้นที่จากแบบ
  assert.match(ZONE, /title=\{drawing \? drawing\.size\.label : "ขนาด"\}/);
  assert.match(ZONE, /title=\{drawing \? drawing\.note\.label : "หมายเหตุพื้นที่"\}/);
  assert.match(ZONE, /placeholder=\{drawing \? "เช่น ความสูงฝ้าอ่านจากแบบตกแต่ง" : "เช่น ลูกค้าขอให้เลี่ยงมุมเตียงที่ 2"\}/);
});

/* ══ ② หัวข้อของพื้นที่จากแบบ ═══════════════════════════════════════════════════════════════════ */

test('🔴 กิ่งของพื้นที่จากแบบ: ไม่มีแผงภาพกว้าง/ภาพจุด · แผงเดียวคือช่องภาพแบบ ผ่านด่านไฟล์ JPG/PNG ของผู้เรียก', () => {
  assert.doesNotMatch(DRAWING_SECTIONS, /SURVEY_DOC_WIDE|SURVEY_DOC_SPOT|SPOT_DOC_TYPES|photoPanel\(|photoGroups|spotsNote/,
    'ไม่มีใครยืนอยู่ในห้อง — ไม่มีภาพกว้าง จุดไม่มีรูป ไม่มีถาด ไม่มีบรรทัดเรื่องผูกรูป');
  const panels = jsxOpenTags(DRAWING_SECTIONS, /<AttachmentsPanel\b/g);
  assert.equal(panels.length, 1);
  const [panel] = panels;
  assert.match(panel, /docTypes=\{PLAN_DOC_TYPES\}/, 'ค่าคงที่ระดับไฟล์ — อาร์เรย์ใหม่ทุกรอบ = ตัวรับ Ctrl+V ผูกใหม่ทุกรอบ');
  assert.match(ZONE, /const PLAN_DOC_TYPES = \[\{ key: SURVEY_DOC_PLAN, label: "ภาพแบบของพื้นที่" \}\];/);
  assert.match(panel, /canEdit=\{edit\}/, 'อ่านอย่างเดียว = ไม่มีแผ่นเลือกรูป ไม่รับลากวาง/วาง ไม่มีปุ่มลบ');
  assert.match(panel, /fileGate=\{\{\s*accept: drawing\.plan\.accept, test: planFileTest, rejectText: drawing\.plan\.rejectText,\s*pickLabel: "เลือกรูปจากเครื่อง", hideDropHint: true,\s*\}\}/);
  assert.match(panel, /reloadKey=\{planReloadKey \+ filesEpoch\}/, 'ปุ่ม "ใช้รูปนี้…" ของหน้า และการลบไฟล์เดิม = อ่านรายการใหม่');
  assert.match(panel, /photoCapture photoTiles/);
  assert.match(panel, /onItemsChange=\{handleItems\}/);
  assert.match(panel, /onBusyChange=\{handleBusy\}/);
  assert.match(panel, /intakeWeight=\{0\}/);
  /* 🐞 แผงส่ง `File` ของเบราว์เซอร์ (name / type) — ตัวตัดสินอ่านทรงแถวไฟล์แนบ ⇒ หน้าต้องแปลงก่อนถาม
     (ส่งตัวตัดสินตรง ๆ = ทุกไฟล์ถูกทิ้ง รวม JPG/PNG) */
  assert.match(ZONE, /const planFileTest = \(file\) => isJpgOrPngFile\(\{ fileName: file\?\.name, mimeType: file\?\.type \}\);/);
  assert.equal(isJpgOrPngFile({ name: 'a.png', type: 'image/png' }), false, 'File ดิบไม่ใช่ทรงที่ตัวตัดสินอ่าน');
  // ด่านไฟล์ตัวเดียวกับด่านของ server และตัวตัดสิน
  assert.equal(isJpgOrPngFile({ fileName: 'a.PNG' }), true);
  assert.equal(isJpgOrPngFile({ fileName: 'a.png', mimeType: 'image/tiff' }), false);
  assert.equal(isJpgOrPngFile({ fileName: 'a.pdf', mimeType: 'application/pdf' }), false);
});

test('ช่องภาพแบบ: ชื่อ · คำกำกับ · ไฟล์ที่ลงเอกสารไม่ได้ · ประโยคของด่าน มาจากตัวตัดสินทั้งหมด', () => {
  assert.match(DRAWING_SECTIONS, /<Section area="plan" id=\{sectionId\("plan"\)\} number=\{2\} title=\{drawing\.plan\.label\} state=\{sections\.plan\}>/);
  assert.match(DRAWING_SECTIONS, /\{edit \? <p className=\{styles\.hint\}>\{thaiText\(drawing\.plan\.hint\)\}<\/p> : null\}/);
  assert.match(DRAWING_SECTIONS, /drawing\.plan\.files\.filter\(\(file\) => !file\.printable\)\.map\(/);
  assert.match(DRAWING_SECTIONS, /<b>\{file\.name\}<\/b> \{thaiText\(file\.note\)\}/, 'ชี้ที่ตัวไฟล์ — ไม่รอไปเจอตอนส่งผล');
  assert.match(DRAWING_SECTIONS, /\{drawing\.plan\.missing \? \(\s*<p className=\{styles\.gap\}>/);
  assert.match(DRAWING_SECTIONS, /\{layout === "page" && drawings \? drawings : null\}/, 'หน้าเต็มจอ: แผงแบบจากฝ่ายขายอยู่ใต้ช่องภาพแบบ');
  assert.doesNotMatch(ZONE, /ต้องเป็นรูป JPG|แคปเป็น PNG|มาร์กจุดหรือไม่ก็ได้|ประเมินจากแบบ — ไม่ต้องวัดหน้างาน/,
    'ประโยคของตัวตัดสินไม่ถูกพิมพ์ซ้ำในจอ');
  assert.match(ZONE_CSS, /\.body > \[data-area="plan"\] \{ grid-area: wide; \}/, 'สองคอลัมน์: ① ③ ซ้าย · ② ④ ขวา (ช่องเดิมของภาพกว้าง)');
  assert.ok(ZONE_CSS.indexOf('.body > [data-area="plan"]') < ZONE_CSS.indexOf('@media (max-width: 680px)'),
    'ต้องมาก่อนกฎคอลัมน์เดียวของมือถือ (ความจำเพาะเท่ากัน — ตัวหลังชนะ)');

  const plan = [file('f1', 'survey_plan'), file('f2', 'survey_plan', 'application/pdf', 'แบบตกแต่ง.pdf')];
  const view = surveyDrawingZoneView({ zone: zone('1', { ...DRAWING, ...sized }), files: plan, canDecide: true });
  assert.equal(view.plan.label, 'ภาพแบบของพื้นที่ (บังคับ · JPG/PNG)');
  assert.equal(view.plan.hint, 'แนบรูปแบบของพื้นที่นี้ (JPG/PNG) — มาร์กจุดหรือไม่ก็ได้');
  assert.equal(view.plan.accept, 'image/jpeg,image/png');
  assert.deepEqual(view.plan.files.map((f) => [f.id, f.printable, f.note]), [
    ['f1', true, null],
    ['f2', false, 'ไฟล์นี้ลงเอกสารไม่ได้ (PDF/TIFF) — แคปเป็น PNG แล้วแนบใหม่'],
  ]);
  assert.equal(view.plan.missing, null, 'มีรูป JPG แล้ว = ด่านผ่าน แม้ไฟล์ PDF ยังค้างอยู่');
  const onlyPdf = surveyDrawingZoneView({ zone: zone('1', { ...DRAWING, ...sized }), files: [plan[1]], canDecide: true });
  assert.ok(onlyPdf.plan.missing, 'ไฟล์ที่ลงเอกสารไม่ได้ไม่ปลดด่าน');
  // ป้ายของหัวข้อ: พื้นที่จากแบบมีคีย์ plan และไม่มีภาพกว้าง · พื้นที่ลงหน้างานได้สี่คีย์เดิม
  const drawn = surveyZoneSections({ zone: zone('1', { ...DRAWING, ...sized }), files: plan });
  assert.equal(drawn.wide, null);
  assert.equal(drawn.plan.mark, 'done');
  assert.deepEqual(Object.keys(surveyZoneSections({ zone: zone('1', sized), files: [] })), ['size', 'wide', 'spots', 'note']);
});

test('จุดโดยประมาณ: แถวชื่อ + บันทึก ไม่มีรูป · ลบจุดไม่ถามเรื่องรูป · คำใหม่ตรงตามสเปก (N17–N20)', () => {
  assert.match(DRAWING_SECTIONS, /<Section area="spots" id=\{sectionId\("spots"\)\} number=\{3\} title=\{drawing\.spots\.label\} state=\{sections\.spots\}>/);
  assert.match(DRAWING_SECTIONS, /\{spots\.map\(\(spot, i\) => <li key=\{spot\.id\}>\{spotRow\(spot, i\)\}<\/li>\)\}/,
    'แถวของจุดตัวเดียวกับหน้าลงหน้างาน (แก้ = ช่อง · อ่านอย่างเดียว = ตัวหนังสือ) — ไม่เขียนชุดที่สอง');
  // ว่าง = ขีดตัวเดียวกับหมายเหตุที่ว่าง (S2b แก้หลังตรวจจอ planner-minor-4 · ยามละเอียดที่ surveyZonePageScreen.test.mjs)
  assert.match(DRAWING_SECTIONS, /\{spots\.length === 0 && !edit \? EMPTY_DASH : null\}/);
  const row = slice(ZONE, 'const spotRow = ', 'const spotRelink = ');
  assert.match(row, /const noteShown = !!drawing \|\| /, 'พื้นที่จากแบบ: ช่องบันทึกกางไว้เลย (ไม่มีเมนูให้เปิด)');
  const remove = slice(ZONE, 'const removeSpot = ', 'const spotRow = ');
  assert.match(remove, /const notice = drawing \? null : spotRemovalNotice\(\{ spot, files: shownFiles \}\);/);
  assert.match(DRAWING_SECTIONS, />\s*เพิ่มจุด\s*</);
  assert.doesNotMatch(DRAWING_SECTIONS, /เพิ่มจุดที่ติดตั้งได้|หัวหน้าเป็นคนเลือก|รูปของจุดขึ้นระบบทันที/, 'คำกำกับของช่างไม่ขึ้นในพื้นที่จากแบบ');
  assert.match(ZONE, /หรือกด “ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้” ที่ไฟล์ในแผง “แบบจากฝ่ายขาย”/);
  const view = surveyDrawingZoneView({ zone: zone('1', DRAWING), files: [], canDecide: true });
  assert.equal(view.spots.photos, false);
  assert.equal(view.spots.label, 'จุดติดตั้งโดยประมาณ (ไม่บังคับ)');
  assert.equal(view.size.label, 'ขนาด ก × ย × ส');
  assert.equal(view.wide, null);
});

/* ══ ③ อ่านอย่างเดียว (ผู้วางคิว · ช่างที่ตามลิงก์ · ใบล็อก) — ไม่มีสิทธิ์/แก้ไม่ได้ = ไม่วาด ไม่ใช่ปุ่มจาง ════════════ */

test('🔴 ของที่แก้ได้ทุกชิ้นของกิ่งพื้นที่จากแบบอยู่หลัง edit · ทางออกอยู่หลังตัวตัดสิน · เหตุที่แก้ไม่ได้ขึ้นบรรทัดเดียว', () => {
  // ① ช่องวัด · ปุ่มเพิ่ม/ลบส่วน (ใช้ร่วมกับหน้าลงหน้างาน)
  assert.match(ZONE, /\{edit \? \(\s*<label className=\{styles\.dim\}>/);
  assert.match(ZONE, /\{edit \? \(\s*<button type="button" className=\{styles\.addRow\} onClick=\{\(\) => setParts\(/);
  assert.match(ZONE, /\{edit && row\.removable \? \(/);
  // ③ ช่องของจุด · ปุ่มลบจุด · ปุ่มเพิ่มจุด
  const row = slice(ZONE, 'const spotRow = ', 'const spotRelink = ');
  assert.match(row, /<div className=\{styles\.spotMain\}>\s*\{edit \? \(\s*<>\s*<Input/);
  assert.match(row, /\{edit && drawing \? \(\s*<button type="button" className=\{styles\.iconBtn\} data-tone="danger" aria-label=\{`ลบจุดที่ \$\{i \+ 1\}`\}/);
  // ดับระหว่างบันทึก (S2b แก้หลังตรวจจอ head-r3-26 · ยามละเอียดที่ surveyZonePageScreen.test.mjs)
  assert.match(DRAWING_SECTIONS, /\{edit \? \(\s*<button type="button" className=\{styles\.addRow\} onClick=\{\(\) => setSpots\(\(rows\) => \[\.\.\.rows, emptySpot\(\)\]\)\}\s*disabled=\{saving\}>/);
  // ② บรรทัดชี้ไปปุ่ม "ใช้รูปนี้…" (N18) — เฉพาะคนที่แนบได้ และมีแผงให้ชี้จริง
  assert.match(DRAWING_SECTIONS, /\{edit && drawing\.plan\.missing && salesReuseOffered \? \(/);
  // ไฟล์เดิม: เปิดดูได้ทุกคน · ลบเฉพาะคนที่แก้ได้
  const old = slice(DRAWING_SECTIONS, '{drawing.oldFiles ? (', '</details>');
  assert.match(old, /\{edit \? \(\s*<button type="button" className=\{styles\.iconBtn\} data-tone="danger" aria-label=\{`ลบ \$\{file\.name\}`\}/);
  assert.equal(count(old, 'removeOldFile('), 1);
  // ④ หมายเหตุ
  assert.match(ZONE, /\{edit \? \(\s*<Textarea/);
  // ทางออก (เมนู ⋮ · แถวท้ายเนื้อ) ถามตัวตัดสิน ด้วยสิทธิ์ของพื้นที่จากแบบ ไม่ใช่ canWrite ของผลวัดหน้างาน
  assert.match(ZONE, /const actions = surveyZoneActions\(\{ zone, canWrite: drawing \? \(canDecide && !locked\) : canWrite \}\);/);
  assert.match(ZONE, /\{actions\.cut \|\| actions\.remove \? \(\s*<p className=\{styles\.cutRow\} data-area="cut">/);
  assert.deepEqual(surveyZoneActions({ zone: zone('1', DRAWING), canWrite: false }), { cut: false, remove: false, restore: false });
  assert.deepEqual(surveyZoneActions({ zone: zone('1', DRAWING), canWrite: true }), { cut: true, remove: false, restore: false });
  assert.deepEqual(surveyZoneActions({ zone: zone('1', { ...DRAWING, status: 'added' }), canWrite: true }), { cut: false, remove: true, restore: false });
  /* แถวที่ถูกตัด: `editable` เป็นเท็จ (เนื้อแก้ไม่ได้) แต่หัวหน้าบนใบที่ยังไม่ล็อกต้องเอากลับเข้าใบได้ — ใบงานโต๊ะทุกแถวที่ถูกตัดเป็นจากแบบ */
  const cut = zone('1', { ...DRAWING, status: 'cut', cutReason: 'ซ้ำกับพื้นที่อื่น' });
  assert.equal(surveyDrawingZoneView({ zone: cut, files: [], canDecide: true }).editable, false);
  assert.deepEqual(surveyZoneActions({ zone: cut, canWrite: true }), { cut: false, remove: false, restore: true });
  // คำนำของแถวทางออกเป็นของคนที่ยืนอยู่หน้างาน
  assert.match(ZONE, /\{drawing \? null : <span>เข้าห้องนี้ไม่ได้ \/ ไม่ต้องวัด<\/span>\}/);
  assert.match(ZONE, /\{drawing \? null : <span>เพิ่มผิดพื้นที่\?<\/span>\}/);
  // เหตุหนึ่งบรรทัดใต้หัว — ประโยคของตัวตัดสิน
  assert.match(ZONE, /\{drawing\?\.readOnlyReason \? \(\s*<StatusNotice tone="info" className=\{styles\.reason\}>\{drawing\.readOnlyReason\}<\/StatusNotice>/);
  assert.equal(count(ZONE, 'readOnlyReason'), 2);
});

test('ตัวตัดสินของพื้นที่จากแบบ: หัวหน้าบนใบเปิดแก้ได้ · ผู้วางคิว/ช่างได้เหตุ · ใบล็อกและแถวที่ถูกตัดแก้ไม่ได้ · ไฟล์เดิมลบได้อย่างเดียว', () => {
  const row = zone('1', { ...DRAWING, ...sized });
  const files = [file('p1', 'survey_plan'), file('w1', 'survey_wide'), file('s1', 'survey_spot')];
  const head = surveyDrawingZoneView({ zone: row, files, canDecide: true, locked: false });
  assert.equal(head.editable, true);
  assert.equal(head.readOnlyReason, null);
  assert.equal(chipOf(head), SURVEY_METHOD_LABEL.drawing);
  const planner = surveyDrawingZoneView({ zone: row, files, canDecide: false });
  assert.equal(planner.editable, false);
  assert.equal(planner.readOnlyReason, 'พื้นที่นี้หัวหน้าประเมินจากแบบ — ไม่ต้องวัดหน้างาน');
  assert.deepEqual(planner.plan.files.map((f) => f.id), ['p1'], 'ผู้วางคิวเห็นของครบ (มติ O4) — แค่แก้ไม่ได้');
  const sent = surveyDrawingZoneView({ zone: row, files, canDecide: true, locked: true });
  assert.equal(sent.editable, false);
  assert.equal(sent.readOnlyReason, null, 'หัวหน้าบนใบล็อก: กล่องสถานะของใบบอกเหตุแล้ว');
  assert.equal(head.oldFiles.label, 'ไฟล์เดิมก่อนเปลี่ยนเป็นประเมินจากแบบ (2) — ไม่ลงเอกสาร');
  assert.deepEqual(head.oldFiles.files.map((f) => f.id), ['w1', 's1']);
  assert.equal(surveyDrawingZoneView({ zone: row, files: [files[0]], canDecide: true }).oldFiles, null);
  // ป้ายหัว: ครบ = "ครบแล้ว" (ไม่ใช่ "วัดแล้ว") · ป้ายที่มาของพื้นที่ที่หัวหน้าเพิ่ม
  assert.equal(surveyZoneStateBadge({ zone: row, files }).text, 'ครบแล้ว');
  const added = surveyZoneStateBadge({ zone: zone('2', { ...DRAWING, status: 'added' }), files: [], dept: 'TS' });
  assert.equal(added.addedLabel, 'เพิ่มโดย TS');
  assert.equal(surveyZoneStateBadge({ zone: zone('3', { status: 'added' }), files: [] }).addedLabel, 'เพิ่มหน้างาน');
});

test('ไฟล์เดิม: ลิสต์พับ (ไม่ใช่การ์ดพับได้ของระบบ) · เปิดแท็บใหม่ด้วยปุ่ม · ลบถามก่อนแล้วรายงานรายการใหม่ขึ้นหน้า', () => {
  assert.match(DRAWING_SECTIONS, /<details className=\{styles\.old\}>\s*<summary className=\{styles\.oldHead\}>/);
  assert.match(DRAWING_SECTIONS, /\{thaiText\(drawing\.oldFiles\.label\)\}/);
  assert.match(DRAWING_SECTIONS, /<button type="button" className=\{styles\.oldOpen\} onClick=\{\(\) => openFile\(file\)\}>/);
  assert.match(ZONE, /const openFile = \(file\) => window\.open\(file\.href, "_blank", "noopener,noreferrer"\);/,
    'หน้าพื้นที่ห้ามมีลิงก์ (ตัวเฝ้าค่าค้าง) — แท็บใหม่ผ่านปุ่ม');
  const remove = slice(ZONE, 'const removeOldFile = ', 'const photoPanel = ');
  assert.match(remove, /if \(!\(await confirmAction\(photoDeleteConfirm\(\{ fileName: file\.name \}\)\)\)\) return;/, 'คำถามตัวเดียวกับการลบรูปของแผงไฟล์แนบ');
  assert.match(remove, /await apiJson\(`\/api\/master\/attachments\/\$\{file\.id\}`, \{ method: "DELETE", fallbackError: "ลบไม่สำเร็จ" \}\);/);
  assert.match(remove, /onFilesChange\?\.\(zone\.id, left, \{ loaded: true \}\);/);
  assert.match(remove, /setFilesEpoch\(\(n\) => n \+ 1\);/, 'ช่องภาพแบบอ่านรายการจริงอีกรอบ — ไม่งั้นรายงานไฟล์ที่เพิ่งลบกลับมา');
  assert.match(remove, /notifyToast\.error\(/);
  assert.doesNotMatch(ZONE, /\bfetch\(/, 'จอเรียก API ผ่าน apiFetch/apiJson เท่านั้น');
  for (const cls of ['oldHead', 'oldOpen']) {
    assert.match(ZONE_CSS, new RegExp(`\\.${cls} \\{[^}]*min-height: var\\(--ctl-h-touch\\);`), `${cls} สูงระดับนิ้ว`);
    assert.match(ZONE_CSS, new RegExp(`\\.${cls}:focus-visible \\{ outline: 2px solid var\\(--accent-ink\\);`));
  }
});

test('ป้าย "เพิ่มหน้างาน": ในรายการคำมาจาก view · ในหน้าพื้นที่เหลือบรรทัดเดียวของพื้นที่ลงหน้างาน (ที่ยามเดิมตรึงไว้)', () => {
  assert.equal(count(LIST, 'เพิ่มหน้างาน'), 0);
  assert.match(LIST, /\{row\.tags\.added \? <span className=\{styles\.tag\} data-tone="accent">\{row\.addedLabel\}<\/span> : null\}/);
  assert.equal(count(ZONE, 'เพิ่มหน้างาน'), 1);
  assert.match(ZONE, /\{!drawing && badge\.added \? <StatusBadge tone="accent">เพิ่มหน้างาน<\/StatusBadge> : null\}/);
  assert.match(ZONE, /\{drawing && badge\.addedLabel \? <StatusBadge tone="accent">\{badge\.addedLabel\}<\/StatusBadge> : null\}/);
});

test('หน้าพื้นที่ส่ง viewerKind ต่อให้ตัวตัดสินของท้ายหน้าเฉย ๆ — ไม่ตั้งเองตามวิธีของพื้นที่ (ปุ่มบันทึกเป็นเรื่องของหน้า)', () => {
  assert.equal(count(ZONE, 'viewerKind'), 2, 'ค่าตั้งต้นของ prop + ส่งเข้า surveyZoneFooterView เท่านั้น');
  assert.ok(ZONE.includes('\n  viewerKind = "crew",\n'));
  assert.match(ZONE, /surveyZoneFooterView\(\{\s*zone, files: shownFiles, dirty, draftSummary, saveBlocker, busy, error, next, viewerKind, uploading,\s*\}\)/);
  assert.match(ZONE, /\{footer\.save\.show \? \(/);
});

/* ══ ④ รายการพื้นที่ ═══════════════════════════════════════════════════════════════════════ */

test('รายการ: หัว · แถบหัวคอลัมน์ · การจัดวาง เปลี่ยนเฉพาะเมื่อรายการโชว์แถวจากแบบ (เทียบคำของป้ายจากค่าคงที่)', () => {
  assert.match(LIST, /const \{ drawing: DRAWING_WORD \} = SURVEY_METHOD_CHIP;/);
  assert.match(LIST, /return methodLabel === DRAWING_WORD;/);
  assert.match(LIST, /const labelled = showsDrawingRow\(rows\);/);
  /* ช่างที่ใบเหลือแต่พื้นที่จากแบบ (`emptyReason === "drawing"`) ไม่มีพื้นที่ต้องวัด ⇒ หัวเป็น "พื้นที่" ด้วย (S2b แก้หลังตรวจจอ crew-q6) */
  assert.match(LIST, /const deskOnlyForCrew = view\?\.emptyReason === "drawing";/);
  assert.match(LIST, /\{labelled \|\| deskOnlyForCrew \? "พื้นที่" : "พื้นที่ที่ต้องวัด"\}/);
  assert.match(LIST, /\{rows\.length && !labelled \? \(\s*<div className=\{styles\.cols\} aria-hidden="true">/);
  assert.match(LIST, /const layout = split \? "split" : \(labelled \? "stack" : "pages"\);/,
    'มีแถวจากแบบ = ซ้อนแถว (ข้อพูดชื่อตัวเอง) — การจัดแบบคอลัมน์ต้องมีหัวคอลัมน์ชุดเดียวที่ตรงกับทุกแถว');
  assert.doesNotMatch(LIST_CSS, /data-layout="stack"/, 'ซ้อนแถวคือค่าตั้งต้นของ CSS — ไม่มีกฎชุดที่สาม');
  // กติกาของป้ายผูกกับ data-tagged — บรรทัดรหัสของใบลงหน้างานล้วนไม่ถูกแตะ
  assert.match(LIST, /<span className=\{styles\.codeLine\} data-tagged=\{methodLabel \? "" : undefined\}>/);
  assert.match(LIST_CSS, /\.codeLine\[data-tagged\] \{\s*flex-wrap: wrap;/, 'จอ 375: ป้ายตกลงมาใต้รหัสเมื่อบรรทัดเต็ม');
  assert.match(LIST_CSS, /\.codeLine \{\s*display: flex;\s*justify-content: space-between;\s*gap: var\(--space-2\);\s*\}/, 'กติกาเดิมของบรรทัดรหัสอยู่ครบ');
  assert.match(LIST_CSS, /\.row \{[^}]*min-height: 56px;/, 'แถวยังเป็นปุ่มเดียวสูงระดับนิ้ว');
});

test('รายการ: ป้ายของแถว · บรรทัดเงียบ · ประโยคใบว่าง ตามคีย์ของตัวตัดสิน — ใบลงหน้างานล้วนได้ค่าว่างทุกคีย์', () => {
  const onsite = [zone('1', sized), zone('2'), zone('3', { status: 'added' })];
  const plain = surveyZoneListView({ zones: onsite, filesByZone: {} });
  assert.deepEqual(plain.rows.map(chipOf), [null, null, null]);
  assert.equal(plain.drawingNote, null);
  assert.equal(plain.emptyReason, null);
  assert.equal(plain.rows[2].addedLabel, 'เพิ่มหน้างาน', 'คำเดิมของป้ายที่มา');
  assert.equal(plain.rows.some((r) => chipOf(r) === SURVEY_METHOD_CHIP.drawing), false, 'หัว "พื้นที่ที่ต้องวัด" + แถบหัวคอลัมน์เดิม');

  const mixed = [zone('1', sized), zone('2', DRAWING), zone('3', { ...DRAWING, status: 'added' })];
  const head = surveyZoneListView({ zones: mixed, filesByZone: {}, canDecide: true, dept: 'TS' });
  assert.deepEqual(head.rows.map(chipOf), [SURVEY_METHOD_CHIP.onsite, SURVEY_METHOD_CHIP.drawing, SURVEY_METHOD_CHIP.drawing]);
  assert.deepEqual(head.rows.map((r) => r.method), ['onsite', 'drawing', 'drawing']);
  assert.deepEqual(head.rows[1].marks.map((m) => m.key), ['size', 'plan'], 'แถวจากแบบมีสองข้อ — หัวคอลัมน์สามช่องใช้กับมันไม่ได้');
  assert.equal(head.rows[2].addedLabel, 'เพิ่มโดย TS');
  assert.equal(head.drawingNote, null, 'หัวหน้าและผู้วางคิวเห็นแถวครบ — ไม่มีบรรทัดเงียบ');

  const crew = surveyZoneListView({ zones: mixed, filesByZone: {}, hideDrawing: true });
  assert.deepEqual(crew.rows.map((r) => r.id), ['1']);
  assert.equal(crew.drawingNote, 'อีก 2 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด');
  assert.equal(crew.emptyReason, null);
  const crewDesk = surveyZoneListView({ zones: mixed.slice(1), filesByZone: {}, hideDrawing: true });
  assert.deepEqual(crewDesk.rows, []);
  assert.equal(crewDesk.emptyReason, 'drawing');

  assert.match(LIST, /\) : view\?\.emptyReason === "drawing" \? null : \(\s*<p className=\{styles\.empty\}>/,
    'ช่างไม่เหลือแถวเพราะที่เหลือเป็นจากแบบ = ไม่พูดว่า "ใบนี้ยังไม่มีพื้นที่"');
  assert.match(LIST, /\{view\?\.drawingNote \? \(\s*<p className=\{styles\.quiet\}>/);
  assert.doesNotMatch(LIST, /หัวหน้าประเมินจากแบบ/, 'ประโยคมาจากตัวตัดสิน');
});

test('รายการ: ปุ่มเพิ่มรับคำจากผู้เรียก (คำเดิมยังอยู่ในไฟล์) · เหตุที่ไม่มีปุ่มขึ้นเฉพาะตอนไม่มีปุ่ม', () => {
  assert.ok(LIST.includes('addLabel = null, addBlockedNote = null,'));
  assert.match(LIST, /\{addLabel \?\? <>เพิ่มพื้นที่ที่เจอหน้างาน<\/>\}/);
  assert.match(LIST, /\{onAdd \? \(\s*<button type="button" className=\{styles\.add\} onClick=\{onAdd\}>[\s\S]*?<\/button>\s*\) : addBlockedNote \? \(\s*<p className=\{styles\.quiet\}>\{addBlockedNote\}<\/p>\s*\) : null\}/);
  assert.equal(count(LIST, 'addBlockedNote'), 3, 'ค่าตั้งต้น + เงื่อนไข + ที่พิมพ์ — ไม่มีที่อื่น');
  assert.doesNotMatch(LIST, /เฉพาะหัวหน้าฝ่ายบริการ/, 'ไฟล์นี้ไม่รู้ว่าใครดู — ประโยคเป็นของผู้เรียก');
});

/* ══ ⑤ แผง "แบบจากฝ่ายขาย" ══════════════════════════════════════════════════════════════════ */

test('🔴 แผง: ปุ่ม "ใช้รูปนี้…" ขึ้นเมื่อ view ให้ file.reuse และผู้เรียกส่ง onReuse เท่านั้น — ขาดข้างเดียว = ไม่มีปุ่ม ไม่มีเหตุ ไม่มีชื่อพื้นที่', () => {
  assert.match(PANEL, /const canReuse = typeof onReuse === "function";/);
  assert.match(PANEL, /const reuse = canReuse \? file\.reuse : null;/);
  assert.equal(count(PANEL, 'file.reuse'), 2, 'อ่าน file.reuse สองจุด: ตัวแปรของการ์ด + คำถามว่ามีปุ่มสักใบไหม (ทั้งคู่อยู่หลัง canReuse)');
  assert.doesNotMatch(PANEL, /file\.reuse\.(?:reason|label|enabled)/, 'เหตุ · คำ · สถานะของปุ่มอ่านผ่านตัวแปรที่ผ่านด่าน onReuse แล้ว');
  assert.match(PANEL, /const target = canReuse && zoneTitle && files\.some\(\(file\) => file\.reuse\) \? `พื้นที่ที่เปิดอยู่: \$\{zoneTitle\}` : null;/);
  const block = slice(PANEL, '{reuse ? (', '</li>');
  assert.equal(count(PANEL, 'reuse.reason'), 1);
  assert.ok(block.includes('{thaiText(reuse.reason)}'), 'เหตุเป็นตัวหนังสือเหนือปุ่ม (ไม่ใช่ tooltip)');
  assert.ok(block.indexOf('reuse.reason') < block.indexOf('<Button'), 'เหตุอยู่เหนือปุ่ม');
  // S2b แก้หลังตรวจจอ head-r3-35: `held` = ติดด่าน หรือ ใช้กับพื้นที่นี้แล้ว (ยามละเอียดอยู่ที่ components/service/surveySalesDrawings.test.mjs)
  assert.match(PANEL, /const held = blocked \|\| used;/);
  assert.match(block, /aria-disabled=\{held \|\| copying \? "true" : undefined\}/);
  assert.match(block, /aria-describedby=\{blocked \|\| showUsed \? reasonId : undefined\}/);
  assert.match(block, /disabled=\{!held && !copying && !!busyKey\}/, 'คัดลอกทีละไฟล์ — ปุ่มของไฟล์อื่นดับระหว่างรอ');
  assert.match(block, /onClick=\{used \? \(\) => setTold\(file\.key\) : blocked \|\| copying \? undefined : \(\) => onReuse\(file\)\}/);
  assert.match(block, /\{copying \? COPYING : reuse\.label\}/);
  assert.match(PANEL, /const copying = busyKey === file\.key;/);
  assert.match(PANEL, /const blocked = !!reuse && reuse\.enabled === false;/);
});

test('ตัวตัดสินของแผง: ปุ่มมีเฉพาะพื้นที่จากแบบที่แก้ได้ · PDF/TIFF/เอกสาร Google = ปุ่มจางพร้อมเหตุ · ผู้วางคิว (editable: false) ไม่มีปุ่มสักไฟล์', () => {
  const requestFiles = [
    { id: 'a1', docType: 'other', driveFileId: 'drive-a1', fileName: 'แปลนชั้น 1.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 },
    { id: 'a2', docType: 'other', driveFileId: 'drive-a2', fileName: 'แบบตกแต่ง.pdf', mimeType: 'application/pdf' },
  ];
  const threadFiles = [{ updateId: 'u1', index: 0, fileName: 'ผัง.png', mimeType: 'image/png' }];
  const open = zone('1', DRAWING);
  const head = surveySalesDrawingsView({ requestFiles, threadFiles, zone: open, editable: true });
  assert.equal(head.label, 'แบบจากฝ่ายขาย');
  assert.equal(head.countText, '3 ไฟล์');
  assert.deepEqual(head.files.map((f) => [f.key, f.image, f.reuse.enabled]), [
    ['request:a1', true, true], ['request:a2', false, false], ['thread:u1:0', true, true],
  ]);
  assert.equal(head.files[0].reuse.label, 'ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้');
  assert.equal(head.files[1].reuse.reason, 'ไฟล์นี้ลงเอกสารไม่ได้ — แคปหน้าที่ต้องการเป็น PNG แล้วแนบ');
  assert.equal(head.files[0].typeText, 'JPG');
  assert.equal(head.files[2].sourceLabel, 'จากเธรด');
  assert.deepEqual(head.files[2].ref, { kind: 'thread', updateId: 'u1', index: 0 });

  const planner = surveySalesDrawingsView({ requestFiles, threadFiles, zone: open, editable: false });
  assert.deepEqual(planner.files.map((f) => f.reuse), [null, null, null]);
  for (const other of [null, zone('2'), zone('3', { ...DRAWING, status: 'cut' })]) {
    const view = surveySalesDrawingsView({ requestFiles, threadFiles, zone: other });
    assert.deepEqual(view.files.map((f) => f.reuse), [null, null, null], 'หน้ารายการ · พื้นที่ลงหน้างาน (กติกา 29/08) · พื้นที่ที่ถูกตัด');
  }
  const unread = surveySalesDrawingsView({ requestFiles, threadFiles: [], zone: open, unknown: { threadFiles: true } });
  assert.equal(unread.unknown, true);
  assert.equal(unread.empty, null, 'อ่านไม่สำเร็จ ≠ ไม่มีไฟล์');
  assert.equal(unread.countText, null);
  assert.equal(surveySalesDrawingsView({ zone: open }).empty, 'ยังไม่มีไฟล์แบบจากฝ่ายขาย — ขอในเธรดของคำร้อง');
});

test('แผง: การ์ดพับได้แบบ controlled · ไม่มีของที่กดได้บนหัว · อ่านไม่สำเร็จกับไม่มีไฟล์ไม่ขึ้นพร้อมกัน · รูปขยายในหน้า ไฟล์อื่นเปิดแท็บใหม่', () => {
  // S2b แก้หลังตรวจจอ head-r3-31: กางตอนแรกตามที่หน้าส่ง (`defaultOpen`) · compact ก็เป็นการ์ดพับได้ตัวเดียวกัน (id ของตัวเอง)
  assert.match(PANEL, /const \[open, setOpen\] = useState\(defaultOpen\);/);
  const [card] = jsxOpenTags(PANEL, /<CollapsibleCard\b/g);
  assert.ok(card, 'ทุกที่วาง = การ์ดพับได้ของระบบ');
  assert.match(card, /id=\{cardId\}/);
  assert.match(PANEL, /const cardId = compact \? `\$\{CARD_ID\}-\$\{instanceId\.replace\(/);
  assert.match(PANEL, /const CARD_ID = "survey-sales-drawings";/);
  assert.match(card, /open=\{open\}/);
  // กด = สลับ แล้วบอกหน้าผ่าน `onOpenChange` (ไม่บังคับ) — หน้าจำค่าข้ามการถอดใส่ใหม่ของหน้าพื้นที่ (head-r3-31)
  assert.match(card, /onToggle=\{\(\) => \{ const next = !open; setOpen\(next\); onOpenChange\?\.\(next\); \}\}/);
  assert.match(card, /title=\{view\.label\}/);
  assert.match(card, /badges=\{view\.countText \? <Tag label=\{view\.countText\} \/> : null\}/);
  assert.match(card, /tone="info"/);
  assert.doesNotMatch(card, /<a\b|<button\b|<Button\b|<Link\b|<input\b|href=|onClick=/,
    'ช่อง title/summary/badges เรนเดอร์ในปุ่มหัว — ปุ่มซ้อนปุ่มคือปุ่มที่กดโดนกันเองบนจอสัมผัส');
  assert.doesNotMatch(PANEL, /if \(compact\)/, 'compact พับได้ด้วยหัวเดียวกัน — ไม่มีบล็อกหัวธรรมดาแล้ว (มติเจ้าของ head-r3-31)');
  // คำใหม่ของสเปก (N21–N25)
  assert.match(PANEL, /const HOW_TO = "กดรูปเพื่อขยาย · PDF เปิดในแท็บใหม่";/);
  assert.match(PANEL, /const NEW_TAB = "เปิดในแท็บใหม่";/);
  assert.match(PANEL, /const COPYING = "กำลังคัดลอก…";/);
  assert.match(PANEL, /const UNREAD = "อ่านไฟล์จากฝ่ายขายไม่สำเร็จ — ลองโหลดหน้าใหม่";/);
  assert.match(PANEL, /\{view\.unknown \? \(\s*<StatusNotice tone="warning">\{UNREAD\}<\/StatusNotice>\s*\) : view\.empty \? \(/,
    'อ่านไม่สำเร็จชนะ — ไม่บอกว่า "ยังไม่มีไฟล์" ตอนที่จริง ๆ อ่านไม่ได้');
  assert.match(PANEL, /\{file\.image \? \(\s*<button type="button" className=\{styles\.media\} onClick=\{\(\) => setZoom\(file\)\}/);
  assert.match(PANEL, /<a className=\{styles\.media\} data-kind="doc" href=\{file\.href\} target="_blank" rel="noreferrer">/);
  // กล่องขยายรูป — หน้าตาเดียวกับตัวดูภาพแบบ (S2b แก้หลังตรวจจอ planner-q12 · ยามละเอียดที่ surveySalesDrawings.test.mjs)
  assert.match(PANEL, /<Modal\s+open=\{!!zoom\}\s+onClose=\{\(\) => setZoom\(null\)\}\s+title=\{zoom\?\.name \|\| view\.label\}\s+size="lg"\s+closeOnOverlay/);
  assert.match(PANEL, /\{file\.sourceLabel \? <Tag label=\{file\.sourceLabel\} className=\{styles\.source\} \/> : null\}/);
  assert.doesNotMatch(PANEL, /StatusBadge/, 'ที่มาของไฟล์และจำนวนเป็นคุณสมบัติ ไม่ใช่สถานะ');
});

test('แผง: จำนวนคอลัมน์ตามความกว้างที่ได้จริง (ไม่มีจุดตัดจอใหม่) · ทุกอย่างที่กดได้สูงระดับนิ้ว · มือถือรูปอยู่บน', () => {
  assert.match(PANEL_CSS, /grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, max\(var\(--file-min\), var\(--file-third\)\)\), 1fr\)\);/,
    'min(100%, …) = แผงไม่ดันตัวเองให้กว้างกว่าจอ');
  assert.match(PANEL_CSS, /\.media \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(PANEL_CSS, /\.reuse \.reuseBtn \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(PANEL_CSS, /\.reuse \.reuseBtn \{[^}]*width: 100%;/);
  assert.match(PANEL_CSS, /\.reuse \.reuseBtn \{[^}]*white-space: normal;/, 'คำบนปุ่มยาว — ห่อได้ ไม่ล้นการ์ด');
  assert.match(PANEL_CSS, /\.zoomBtn \{[^}]*min-height: var\(--ctl-h-touch\);/, 'ปุ่ม "เปิดไฟล์ต้นฉบับ" แทนลิงก์เล็กใต้รูป (planner-q12)');
  assert.match(PANEL_CSS, /@media \(max-width: 680px\) \{\s*\.file \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  for (const [name, sheet] of [['รายการ', LIST_CSS], ['หน้าพื้นที่', ZONE_CSS], ['แผง', PANEL_CSS]]) {
    const cuts = [...sheet.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, ' '));
    assert.deepEqual([...new Set(cuts)], ['max-width: 680px'], `${name}: จุดตัดจอมีจุดเดียวคือ 680`);
    assert.doesNotMatch(sheet, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${name}: สีจากโทเคนเท่านั้น`);
    assert.doesNotMatch(sheet, /line-height:\s*[0-9.]/, `${name}: ความสูงบรรทัดจากโทเคนเท่านั้น`);
  }
});

/* 🐞 review S2b — ช่างพิมพ์ขนาดค้างไว้ (ยังไม่บันทึก) แล้วหัวหน้าสลับห้องนั้นเป็นประเมินจากแบบ: ช่องกับปุ่มบันทึกหายไป
   ร่างที่ค้างจึงบันทึกไม่ได้ ทิ้งไม่ได้ ถูกวาดเป็น "ขนาดของพื้นที่" และยังล็อกแถบล่าง/ด่านส่งงานด้วยคำว่ากดบันทึกก่อน
   ⇒ พื้นที่จากแบบที่คนนี้แก้ไม่ได้ **ไม่มีร่าง**: ธงค้างเป็น false เสมอ และช่องรับแถวจากฐาน */
test('🔴 หน้าพื้นที่: พื้นที่จากแบบที่แก้ไม่ได้ไม่มีร่าง — dirty เป็น false และรับแถวจากฐานทันทีที่กลายเป็นอ่านอย่างเดียว', () => {
  assert.match(ZONE, /const frozen = !!drawing && !edit;\s*const dirty = !isCut && !frozen && draftSig !== savedSig && draftSig !== sentSig;/);
  assert.equal(count(ZONE, 'const dirty = '), 1, 'ธงค้างมีที่มาเดียว — ทุกตัวตัดสินของหน้า (ป้าย · ท้ายหน้า · onDirtyChange) อ่านตัวนี้');
  assert.match(ZONE, /useEffect\(\(\) => \{ if \(frozen\) adoptRow\(zoneRef\.current\); \}, \[frozen, adoptRow\]\);/);
  // ธงที่ขึ้นไปถึงหน้า (แถบล่าง + ด่านแจ้งหัวหน้า) คือ `dirty` ตัวเดียวกัน ⇒ false ไปถึงด้วย
  assert.match(ZONE, /useEffect\(\(\) => \{ onDirtyChange\?\.\(zone\.id, dirty, draftSummary, unlinkPhotos\); \}/);
  // `frozen` จริงเฉพาะพื้นที่จากแบบ — พื้นที่ลงหน้างาน (`drawing` เป็น null) ได้สูตรเดิมทุกกรณี รวมคนอ่านอย่างเดียว
  const files = [];
  const onsite = { id: 'z1', status: 'ok', method: 'onsite', parts: [], spots: [] };
  const drawn = { ...onsite, id: 'z2', method: 'drawing' };
  assert.equal(surveyDrawingZoneView({ zone: onsite, files, canDecide: false, locked: false }), null);
  assert.equal(surveyDrawingZoneView({ zone: drawn, files, canDecide: false, locked: false }).editable, false, 'ช่าง / ผู้วางคิว = อ่านอย่างเดียว');
  assert.equal(surveyDrawingZoneView({ zone: drawn, files, canDecide: true, locked: false }).editable, true, 'หัวหน้ายังมีร่างของตัวเอง');
  assert.equal(surveyDrawingZoneView({ zone: drawn, files, canDecide: true, locked: true }).editable, false);
});
