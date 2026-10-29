// ── ประเมินจากแบบ งวด S2b · กลุ่ม C: แท็บสรุปส่งผล + การ์ดจัดการผล — ยามอ่านซอร์สจอ ─────────────────────────
//
// ⭐ เทสต์ชุดนี้รันใต้ Node ล้วน (เรนเดอร์ JSX ไม่ได้) ⇒ ตรึงสองอย่างที่พังเงียบได้:
//   ① **จอแขวนของใหม่กับคีย์ไหนของตัวตัดสิน** (ตาราง: `surveyResultMethodCell` · `surveyDrawingZoneView` · `mix` ·
//      การ์ด: `view.method.show` · `progress.desk` · `view.gatesHidden` · `deskDue`)
//   ② **ตัวตัดสินตอบอะไรให้คีย์นั้น** — แถวลงหน้างาน / ใบลงหน้างานล้วน / สวิตช์ปิด ต้องได้ค่าว่าง ⇒ จอเดิมทุกจุด
// 🔴 ของใหม่ทุกชิ้นต้อง **ไม่ถูกวาด** เมื่อคีย์ว่าง (ไม่ใช่วาดแล้วจาง) — ใบที่ไม่มีพื้นที่จากแบบและทุกใบตอนสวิตช์ปิดต้องเหมือนวันนี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURVEY_ZONE_STALE_CODE, SURVEY_ZONE_STALE_TEXT } from './survey.js';
import { surveyControlView, surveyResultMethodCell } from './surveyControl.js';
import { surveyDrawingZoneView } from './surveyFieldView.js';
import { isJpgOrPngFile } from './surveyMethod.js';
import { SURVEY_METHOD_BUTTON, SURVEY_METHOD_ERRORS } from './surveyMethodSwitch.js';
import { panelFileGate } from '../../components/attachmentsPanelItems.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const between = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start !== -1, `หา "${from}" ไม่เจอ`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end !== -1, `หา "${to}" หลัง "${from}" ไม่เจอ`);
  return src.slice(start, end);
};
const count = (src, needle) => src.split(needle).length - 1;

const TABLE_RAW = read('../../components/service/SurveyResultTable.js');
const TABLE = code(TABLE_RAW);
const TABLE_CSS = css('../../components/service/SurveyResultTable.module.css');
const CARD_RAW = read('../../components/service/SurveyControlCard.js');
const CARD = code(CARD_RAW);
/* ปุ่มพาไปของการ์ด — ยกเป็นไฟล์ของตัวเองให้ส่วนเอกสารประเมินใช้ร่วม (มติเจ้าของ 19/10/2026: ส่วนนั้นวาดนอกการ์ดได้) */
const JUMP = code(read('../../components/service/SurveyJumpButton.js'));
const CARD_CSS = css('../../components/service/SurveyControlCard.module.css');

/* ── ของจำลอง ───────────────────────────────────────────────────────────────────────────── */
const TODAY = '2026-10-09';
const HEAD = { canDecide: true, canWrite: true };
const PLANNER = { canDecide: false, canWrite: true };
const DRAWING = { method: 'drawing' };
const PART = { id: 'p', widthM: 8, lengthM: 6, heightM: 3 };
const zone = (id, over = {}) => ({ id, zoneId: `ZN-${id}`, zoneName: `ห้อง ${id}`, status: 'ok', parts: [PART], spots: [], ...over });
const drawn = (id, over = {}) => zone(id, {
  ...DRAWING, surveyedByName: 'Arnon Aunsapwilai', surveyedAt: '2026-10-09T03:00:00Z', ...over,
});
const file = (id, docType, mimeType = 'image/jpeg', fileName = `${id}.jpg`) => ({ id, docType, mimeType, fileName });
const REQUEST = {
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26100312',
  acknowledgedAt: '2026-10-08T08:12:00Z', committedDueDate: '2026-10-15', committedResultDate: '2026-10-15',
  dueCommittedAt: '2026-10-08T09:00:00Z',
};
const control = (rows, { filesByZone = {}, viewer = HEAD, request = REQUEST, enabled = true } = {}) => surveyControlView({
  request, zones: rows, filesByZone, visit: null, viewer, today: TODAY, drawingMethodEnabled: enabled,
});

/* ══ ตาราง: แถวจากแบบ vs แถวลงหน้างาน ══════════════════════════════════════════════════════ */

test('ตารางถามตัวตัดสินรายแถว (surveyResultMethodCell) · source ว่าง = แถวลงหน้างาน เข้าทางเดิมทุกช่อง', () => {
  assert.match(TABLE, /const m = surveyResultMethodCell\(zone, request\);/);
  // ทุกทางแยกของแถวแขวนกับ `m.source` (คีย์เดียว) — ไม่มีที่ไหนอ่านคอลัมน์วิธีหรือเรียกตัวตัดสินวิธีเอง
  assert.doesNotMatch(TABLE, /\.method\b|zoneMethod\(|isDrawingZone\(|surveyMethodMix\(/);
  assert.match(TABLE, /const drawing = m\.source \? surveyDrawingZoneView\(\{ zone, files, canDecide, locked \}\) : null;/);
  // ช่องผัง: แถวลงหน้างานได้ตัวนับและด่านอัปเดิม (`cell.photos.plan` · `canUploadPlan` ของใบ)
  assert.match(TABLE, /count=\{drawing \? drawing\.plan\.files\.filter\(\(f\) => f\.printable\)\.length : cell\.photos\.plan\}/);
  assert.match(TABLE, /canUploadPlan=\{drawing \? drawing\.editable : canUploadPlan\}/);
  // ช่องจุด: ทางเดิม ("ช่างยังไม่แจ้งจุดสักจุด" · ปุ่มติ๊ก · "เลือก n / m") อยู่หลังทางของแถวจากแบบ
  const spotCell = between(TABLE, '<td data-label={m.source ? DRAWING_SPOT_LABEL : "เลือกจุด"} className="ui-cell-wide">', '<td data-label="แพ็คเกจ/เดือน"');
  assert.match(spotCell, /\{m\.source \? \(/);
  assert.match(spotCell, /\) : spots\.length === 0 \? \(\s*<span className=\{styles\.warnText\}>ช่างยังไม่แจ้งจุดสักจุด<\/span>/);
  assert.ok(spotCell.indexOf('{m.source ? (') < spotCell.indexOf('ช่างยังไม่แจ้งจุดสักจุด'));

  // ตัวตัดสิน: แถวลงหน้างาน (รวมแถวเก่าที่ไม่มีคีย์วิธีเลย) = สี่คีย์ของแถวจากแบบว่างหมด
  for (const row of [zone('a'), zone('b', { method: 'onsite' }), zone('c', { method: null })]) {
    const m = surveyResultMethodCell(row, REQUEST);
    assert.equal(m.source, null);
    assert.equal(m.planTitle, null);
    assert.equal(m.spotNote, null);
    assert.equal(surveyDrawingZoneView({ zone: row, files: [], canDecide: true, locked: false }), null);
  }
  // แถวจากแบบ: บรรทัดที่มาขึ้นต้นด้วยคำของวิธี (จึงไม่มีป้ายวิธีแยกในช่อง) + คำของช่องผัง/ช่องจุด
  const m = surveyResultMethodCell(drawn('z'), REQUEST);
  assert.match(m.source, /^จากแบบ · Arnon Aunsapwilai /);
  assert.equal(m.planTitle, 'ภาพแบบของพื้นที่');
  assert.equal(m.spotNote, 'ไม่บังคับ');
  // ไม่มีชื่อผู้ประเมินเลย = "จากแบบ" เฉย ๆ — ยังเป็นแถวจากแบบ (source ไม่ว่าง)
  assert.equal(surveyResultMethodCell(zone('n', DRAWING), null).source, 'จากแบบ');
});

test('แถวจากแบบ: บรรทัดที่มาใต้ชื่อพื้นที่ · ไม่มีแถบ "รูปจากช่าง" และไม่มีตัวนับภาพกว้าง/ภาพจุด', () => {
  const zoneCell = between(TABLE, '<td data-label="พื้นที่"', '{cut ? (');
  assert.match(zoneCell, /\{m\.source \? <span className=\{styles\.source\}>\{m\.source\}<\/span> : null\}/);
  assert.ok(zoneCell.indexOf('surveyZoneTitle(zone)') < zoneCell.indexOf('styles.source'), 'อยู่ใต้ชื่อพื้นที่');
  assert.ok(zoneCell.indexOf('styles.source') < zoneCell.indexOf('cell.figures'), 'อยู่เหนือตัวเลขผลวัด');
  // แถบรูป + ตัวนับ อยู่ในก้อนเดียวที่แขวนกับ "ไม่ใช่แถวจากแบบ" — มีที่เดียวในตาราง
  const strip = between(zoneCell, '{!cut && !m.source ? (', '</td>');
  assert.match(strip, /aria-label=\{`รูปจากช่าง \$\{surveyZoneName\(zone\)\}`\}/);
  assert.match(strip, /ภาพกว้าง \{fmtNumber\(cell\.photos\.wide\)\}/);
  assert.match(strip, /ภาพจุด \{fmtNumber\(cell\.photos\.spot\)\}/);
  assert.equal(count(TABLE, 'รูปจากช่าง'), 1);
  assert.equal(count(TABLE, 'cell.photos.wide'), 2, 'ตัวนับภาพกว้าง (ค่า + ธงเป็นศูนย์) อยู่ในแถบเดียวกัน');
  assert.equal(count(TABLE, 'cell.photos.spot'), 1);
  assert.doesNotMatch(zoneCell.slice(0, zoneCell.indexOf('{!cut && !m.source ? (')), /รูปจากช่าง|ภาพกว้าง|ภาพจุด/);
  // ไม่มีป้ายวิธีแยกในตาราง — บรรทัดที่มาพูดคำนั้นเอง
  assert.doesNotMatch(TABLE, /SurveyMethodChip/);
  assert.match(TABLE_CSS, /\.source \{[^}]*color: var\(--blue\);[^}]*overflow-wrap: anywhere;/, 'โทน info · ชื่อยาวห่อในช่อง ไม่ถูกตัด');
});

test('ป้าย "เพิ่มบนใบ": แถวจากแบบใช้ addedLabel ของตัวตัดสิน · แถวลงหน้างานคงคำ "ช่างเพิ่มหน้างาน" ของตารางนี้', () => {
  assert.match(TABLE, /const tags = \[m\.source \? m\.addedLabel : \(zone\.status === "added" \? "ช่างเพิ่มหน้างาน" : null\),/);
  assert.equal(count(TABLE, 'ช่างเพิ่มหน้างาน'), 1);
  // แถวลงหน้างานที่ถูกเพิ่ม: ตัวตัดสินให้ "เพิ่มหน้างาน" (คำของจออื่น) — ตารางนี้ไม่ใช้กับแถวลงหน้างาน จึงยังเป็นคำเดิม
  assert.equal(surveyResultMethodCell(zone('a', { status: 'added' }), REQUEST).source, null);
  assert.equal(surveyResultMethodCell(drawn('z', { status: 'added' }), REQUEST).addedLabel, 'เพิ่มโดย TS');
  assert.equal(surveyResultMethodCell(drawn('z'), REQUEST).addedLabel, null, 'ไม่ได้ถูกเพิ่มบนใบ = ไม่มีป้าย');
});

test('ช่องภาพแบบของแถวจากแบบ: ชื่อช่อง · ด่านไฟล์ JPG/PNG ชุดเดียวกับหน้าพื้นที่ · ตัวนับเฉพาะไฟล์ที่ลงเอกสารได้ · เหตุของไฟล์ที่ลงไม่ได้', () => {
  const planCell = between(TABLE, '<td data-label={m.source && m.planTitle ? m.planTitle : "ภาพผัง"} className={styles.planCell}>', '</td>');
  assert.match(planCell, /\{m\.planTitle \? \(\s*<span className=\{styles\.planTitle\} data-in-head=\{drawnHead \? "1" : undefined\}>\{m\.planTitle\}<\/span>/);
  assert.match(planCell, /drawing=\{drawing\}/);
  // แผงเดียว (ไม่ก๊อปแผงที่สองให้แถวจากแบบ) — pin เดิมของช่องผังยังจริง: ด่านอัป + แผ่นรูป
  assert.equal(count(TABLE, '<AttachmentsPanel'), 1);
  assert.match(TABLE, /canEdit=\{canUploadPlan\}/);
  assert.match(TABLE, /fileGate=\{fileGate\}/);
  const gate = between(TABLE, 'const fileGate = useMemo(', '[accept, rejectText]);');
  assert.match(gate, /accept \? \{/, 'แถวลงหน้างาน (ไม่มี `drawing`) = ไม่มีด่าน ⇒ แผงรับไฟล์ตามกติกาเดิม');
  assert.match(gate, /test: \(file\) => isJpgOrPngFile\(\{ fileName: file\?\.name, mimeType: file\?\.type \}\),/);
  assert.match(gate, /pickLabel: DRAWING_PICK_LABEL,\s*hideDropHint: true,/);
  assert.match(TABLE, /const accept = drawing\?\.plan\.accept \|\| null;\s*const rejectText = drawing\?\.plan\.rejectText \|\| null;/);
  assert.match(TABLE, /const DRAWING_PICK_LABEL = "เลือกรูปจากเครื่อง";/);
  // คำใบ้ของช่องว่าง: แถวจากแบบใช้คำของตัวตัดสิน · แถวลงหน้างานคงคำเดิม
  assert.match(TABLE, /\{canUploadPlan\s*\? <small>\{drawing \? drawing\.plan\.hint : "มาร์กจุดที่เลือกลงบนผังก่อนแนบ"\}<\/small>\s*: null\}/);
  assert.match(TABLE, /const rejected = drawing \? drawing\.plan\.files\.filter\(\(f\) => !f\.printable\) : \[\];/);
  assert.match(TABLE, /\{rejected\.map\(\(f\) => \(\s*<span key=\{f\.id\} className=\{styles\.planReject\}>[\s\S]*?\{f\.note\}/);
  // ⚠️ ชนิดไฟล์อยู่ที่ตัวตัดสิน — จอไม่พิมพ์รายชื่อชนิดเอง (สตริงชนิดลงท้ายดอกจันทำให้ยามซอร์สอ่านโค้ดเป็นคอมเมนต์)
  assert.doesNotMatch(TABLE_RAW, /["'`]image\//);

  // ── ตัวตัดสินที่ช่องนี้อ่าน ──
  const files = [file('p1', 'survey_plan'), file('p2', 'survey_plan', 'application/pdf', 'แปลน.pdf'), file('w1', 'survey_wide')];
  const head = surveyDrawingZoneView({ zone: drawn('z'), files, canDecide: true, locked: false });
  assert.equal(head.editable, true, 'หัวหน้าบนใบที่ยังไม่ล็อกแนบได้ — ไม่ขึ้นกับสิทธิ์เขียนผลวัดหน้างาน');
  assert.equal(head.plan.files.filter((f) => f.printable).length, 1, 'PDF แนบไว้ได้แต่ไม่นับ');
  const pdf = head.plan.files.find((f) => !f.printable);
  assert.equal(pdf.note, head.plan.rejectText);
  assert.equal(head.plan.accept, 'image/jpeg,image/png');
  assert.equal(typeof head.plan.hint, 'string');
  assert.equal(surveyDrawingZoneView({ zone: drawn('z'), files, canDecide: true, locked: true }).editable, false, 'ใบล็อก');
  assert.equal(surveyDrawingZoneView({ zone: drawn('z'), files, canDecide: false, locked: false }).editable, false, 'ไม่ใช่หัวหน้า');
  assert.equal(surveyDrawingZoneView({ zone: drawn('z', { status: 'cut' }), files, canDecide: true, locked: false }).editable, false, 'พื้นที่ที่ตัด');

  // ── ด่านไฟล์: ไฟล์จากเบราว์เซอร์ถือ name/type — ต้องแปลงก่อนถามตัวตัดสิน (ส่งดิบ = ทุกไฟล์ไม่ผ่าน) ──
  const browserFile = (name, type) => ({ name, type, size: 1024 });
  const tableGate = {
    accept: head.plan.accept,
    test: (f) => isJpgOrPngFile({ fileName: f?.name, mimeType: f?.type }),
    rejectText: head.plan.rejectText,
  };
  const png = browserFile('plan.png', 'image/png');
  const tiff = browserFile('plan.tiff', 'image/tiff');
  assert.deepEqual(panelFileGate(tableGate, [png, tiff]), { accepted: [png], rejectText: head.plan.rejectText });
  assert.deepEqual(panelFileGate(tableGate, [browserFile('scan.pdf', 'application/pdf')]).accepted, []);
  assert.equal(isJpgOrPngFile(png), false, 'รูปของ File ดิบไม่ใช่รูปที่ตัวตัดสินอ่าน — จอจึงต้องแปลง');
});

test('ช่องจุดของแถวจากแบบ: ไม่บังคับ ไม่มีการเลือก ไม่มีภาพย่อ ไม่มีบรรทัด "ยังไม่ได้ผูกจุด"', () => {
  const spotCell = between(TABLE, '<td data-label={m.source ? DRAWING_SPOT_LABEL : "เลือกจุด"} className="ui-cell-wide">', '<td data-label="แพ็คเกจ/เดือน"');
  const drawnBranch = between(spotCell, '{m.source ? (', ') : spots.length === 0 ? (');
  assert.match(drawnBranch, /\{spots\.length === 0 \? \(\s*<span>\{NA\}<\/span>/, 'ไม่มีจุด = ขีด ไม่ใช่คำเตือน');
  assert.match(drawnBranch, /\{spots\.map\(\(s\) => \(\s*<span key=\{s\.id\} className=\{styles\.spotChip\}>\{naText\(s\.label\)\}<\/span>/, 'มีจุด = ชื่อเป็นตัวหนังสือ');
  assert.match(drawnBranch, /<span className=\{styles\.sub\}>\{m\.spotNote\}<\/span>/);
  assert.doesNotMatch(drawnBranch, /<button|toggleSpot|aria-pressed|PhotoThumb|spotThumbs|เลือก \{picked\}|ช่างยังไม่แจ้งจุด/);
  // บรรทัดรูปจุดที่ยังไม่ผูก = ของแถวลงหน้างานเท่านั้น
  assert.match(spotCell, /\{!m\.source && spotCell\.unlinkedCount \? \(/);
  assert.equal(count(TABLE, 'spotCell.unlinkedCount ?'), 1);
});

test('หัวคอลัมน์: "ผลวัดจากช่าง" กับ "จากจุดที่ช่างแจ้ง" ขึ้นเฉพาะใบที่ไม่มีพื้นที่จากแบบ · ใบจากแบบทั้งใบใช้คำของพื้นที่จากแบบ', () => {
  assert.match(TABLE, /const drawnSome = \(mix\?\.drawing \|\| 0\) > 0;/);
  assert.match(TABLE, /const drawnHead = mix\?\.mode === "drawing"\s*\? zones\.map\(\(zone\) => surveyResultMethodCell\(zone, request\)\)\.find\(\(cell\) => cell\.source\) \|\| null\s*: null;/);
  const head = between(TABLE, '<thead>', '</thead>');
  assert.match(head, /<th>\{drawnSome \? "พื้นที่" : "พื้นที่ · ผลวัดจากช่าง"\}<\/th>/);
  assert.match(head, /\{drawnHead \? drawnHead\.planTitle : "ภาพผังที่มาร์กจุดแล้ว"\}/);
  assert.match(head, /\{drawnSome \? null : <span className=\{styles\.thNote\}> · จากจุดที่ช่างแจ้ง<\/span>\}/);
  assert.equal(count(TABLE, 'ผลวัดจากช่าง'), 1);
  assert.equal(count(TABLE, 'จากจุดที่ช่างแจ้ง'), 1);
  // ใบจากแบบทั้งใบ: ช่องจุดไม่มีดอกจัน (ไม่บังคับ) — ดอกจันของช่องจุดอยู่ในทางของใบที่ยังมีพื้นที่ลงหน้างานเท่านั้น
  const drawnTh = between(head, '{drawnHead ? (', ') : (');
  assert.match(drawnTh, /\{DRAWING_SPOT_LABEL\}\s*<span className=\{styles\.thNote\}> · \{drawnHead\.spotNote\}<\/span>/);
  assert.doesNotMatch(drawnTh, /styles\.star/);
  /* 🐞 review S2b — ตารางพับเป็นการ์ด (≤680px หัวตารางหาย): ป้ายช่องของแถวจากแบบต้องไม่ใช่ "เลือกจุด" / "ภาพผัง"
     (ไม่มีอะไรให้เลือก · ด่านเลือกจุดไม่ใช้กับแถวนี้) — คำเดียวกับหัวคอลัมน์ของใบจากแบบทั้งใบ · แถวลงหน้างานป้ายเดิม */
  assert.match(TABLE, /\nconst DRAWING_SPOT_LABEL = "จุดติดตั้งโดยประมาณ";\n/);
  assert.equal(count(TABLE, 'จุดติดตั้งโดยประมาณ'), 1, 'คำเดียว ที่เดียว');
  assert.equal(count(TABLE, 'data-label={m.source ? DRAWING_SPOT_LABEL : "เลือกจุด"}'), 1);
  assert.equal(count(TABLE, 'data-label={m.source && m.planTitle ? m.planTitle : "ภาพผัง"}'), 1);
  assert.equal(count(TABLE, 'data-label="เลือกจุด"') + count(TABLE, 'data-label="ภาพผัง"'), 0);
  // สี่คอลัมน์เท่าเดิม — ไม่มีคอลัมน์ใหม่
  assert.equal(count(head, '<th>'), 5, 'สามหัวตายตัว + ช่องจุดสองทาง (วาดทางเดียวต่อครั้ง)');
  assert.equal(count(TABLE, '<col '), 4);
  // ชื่อช่องรายแถว: ใบจากแบบทั้งใบซ่อนบนตาราง (หัวคอลัมน์พูดแล้ว) แล้วคืนที่จอ ≤680 ซึ่งหัวตารางหาย
  assert.match(TABLE_CSS, /\.planTitle\[data-in-head\] \{ display: none; \}/);
  /* 🐞 UAT S2b S04 (375) — จอซ้อนแถว: ป้ายของเซลล์ (`data-label`) พูด "ภาพแบบของพื้นที่" แล้ว ⇒ ชื่อช่องในเซลล์ไม่ขึ้นซ้ำ (เดิมคืนกลับมา = คำเดียวกันสองครั้ง) */
  assert.match(TABLE_CSS, /@media \(max-width: 680px\) \{(?:[^{}]|\{[^{}]*\})*\.planTitle,\s*\.planTitle\[data-in-head\] \{ display: none; \}/);
  assert.doesNotMatch(TABLE_CSS, /\.planTitle\[data-in-head\] \{ display: block; \}/);

  // ── `mix` ที่หน้าส่งมา (view.mix ของการ์ด) ──
  assert.deepEqual(control([zone('a'), zone('b')]).mix, { onsite: 2, drawing: 0, mode: 'onsite' }, 'ลงหน้างานล้วน ⇒ หัวเดิมทุกตัวอักษร');
  assert.deepEqual(control([zone('a'), drawn('z')]).mix, { onsite: 1, drawing: 1, mode: 'mixed' });
  assert.deepEqual(control([drawn('y'), drawn('z')]).mix, { onsite: 0, drawing: 2, mode: 'drawing' });
  // ไม่ส่ง `mix` (ค่าตั้งต้น null) = หัวเดิม
  assert.match(TABLE, /\n {2}mix = null,\n {2}request = null,\n {2}locked = false,\n/);
});

test('บันทึกการเคาะชนกับการแก้จากที่อื่น (zone_stale): เหตุขึ้นบนแถวที่ชน จาก result.failure.code — ไม่มี prop แยก', () => {
  assert.equal(SURVEY_ZONE_STALE_CODE, 'zone_stale');
  assert.equal(SURVEY_ZONE_STALE_TEXT, 'พื้นที่นี้ถูกแก้จากที่อื่น — โหลดใหม่แล้วตรวจก่อนบันทึก');
  assert.doesNotMatch(TABLE, /saveFailure/);
  const save = between(TABLE, 'const saveAll = async () => {', 'const discardAll = ');
  assert.match(save, /const result = await onSaveDecisions\?\.\(items\);/);
  assert.match(save, /const failure = result\?\.failure \|\| null;/);
  assert.match(save, /if \(failure\?\.code === SURVEY_ZONE_STALE_CODE && failure\.zoneId && \(mix\?\.drawing \|\| 0\) > 0\) \{\s*setStaleRow\(\{ zoneId: String\(failure\.zoneId\), message: failure\.message \|\| SURVEY_ZONE_STALE_TEXT \}\);\s*\} else if \(failure\) \{\s*setSaveError\(failure\.message \|\| "บันทึกการเคาะไม่สำเร็จ"\);/);
  // ร่างของพื้นที่ที่ยังไม่ลงอยู่ครบ — ล้างเฉพาะที่ลงจริง (ของเดิม) · รอบใหม่ล้างเหตุเก่าก่อนยิง
  assert.match(save, /for \(const id of savedIds\) delete next\[id\];/);
  assert.ok(save.indexOf('setStaleRow(null);') !== -1 && save.indexOf('setStaleRow(null);') < save.indexOf('onSaveDecisions'));
  assert.match(TABLE, /const discardAll = \(\) => \{ setDrafts\?\.\(\{\}\); setSaveError\(""\); setStaleRow\(null\); \};/);
  // ตารางยังไม่ถือร่างเป็น state ของตัวเอง (ยามเดิมของ surveyControl.test.mjs) — เหตุของแถวเริ่มที่ null
  assert.match(TABLE, /const \[staleRow, setStaleRow\] = useState\(null\);/);
  assert.doesNotMatch(TABLE, /useState\(\{\}\)/);
  // เหตุอยู่ในแถวย่อยของพื้นที่นั้น (เต็มกว้าง) โทนเดียวกับ "บันทึกไม่ได้" และถูกประกาศ (role="alert")
  assert.match(TABLE, /const staleText = staleRow && staleRow\.zoneId === String\(zone\.id\) \? staleRow\.message : null;/);
  assert.match(TABLE, /\{\(missText \|\| rowError \|\| staleText\) && \(\s*<tr data-miss-row="1">\s*<td colSpan=\{4\}>/);
  assert.match(TABLE, /\{staleText \? \(\s*<span className=\{styles\.rowMiss\} data-block="1" role="alert" ref=\{staleRef\} tabIndex=\{-1\}>[\s\S]*?\{staleText\}\s*<\/span>/);
  // บรรทัดรวมเหนือตารางยังเป็นของเหตุอื่น — ประโยคของ zone_stale ไม่ขึ้นสองที่
  assert.equal(count(TABLE, '{saveError ?'), 1);
});

test('ตาราง: ไม่มีสไตล์ฝังในแท็ก · ไม่มีดรอปดาวน์ · คลาสใหม่มีอยู่จริงในโมดูล CSS และใช้โทเคนล้วน', () => {
  assert.doesNotMatch(TABLE, /style=\{/);
  assert.doesNotMatch(TABLE, /<select|<Select|SearchableSelect/);
  for (const name of ['source', 'planTitle', 'planReject']) {
    assert.match(TABLE, new RegExp(`styles\\.${name}\\b`), `ตารางไม่ได้ใช้ ${name}`);
    assert.match(TABLE_CSS, new RegExp(`\\.${name}\\b`), `โมดูล CSS ไม่มี .${name}`);
  }
  const added = [between(TABLE_CSS, '.source {', '}'), between(TABLE_CSS, '.planTitle {', '}'), between(TABLE_CSS, '.planReject {', '}')].join('\n');
  assert.doesNotMatch(added, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'สีจากโทเคนเท่านั้น');
  assert.doesNotMatch(added, /line-height:\s*[\d.]/, 'line-height จากโทเคนเท่านั้น');
  // เส้นจอของไฟล์นี้เท่าเดิม: 680 กับชนิดตัวชี้ (ไม่เพิ่มเส้นใหม่)
  const queries = [...new Set((TABLE_CSS.match(/@media[^{]*/g) || []).map((q) => q.trim()))].sort();
  assert.deepEqual(queries, ['@media (max-width: 680px)', '@media (pointer: coarse)']);
});

/* ══ การ์ดจัดการผล ═════════════════════════════════════════════════════════════════════════ */

test('การ์ด: ปุ่ม "เปลี่ยนวิธีประเมิน" ขึ้นตาม view.method.show ตัวเดียว · ไม่มีวันจาง · อยู่หลังดึงกลับ ก่อนไปพื้นที่ที่ยังไม่ครบ', () => {
  assert.match(CARD, /import \{ SURVEY_METHOD_BUTTON \} from "@\/lib\/service\/surveyMethodSwitch";/);
  assert.equal(SURVEY_METHOD_BUTTON, 'เปลี่ยนวิธีประเมิน');
  const block = between(CARD, 'if (view.method.show) {', 'const nextZone = ');
  assert.match(block, /secondaryActions\.push\(\{\s*id: "method",\s*kind: "edit",\s*icon: ArrowLeftRight,\s*label: SURVEY_METHOD_BUTTON,\s*onClick: onSwitchMethod,\s*\}\);/);
  assert.doesNotMatch(block, /disabled|allowed|reason/, 'เหตุที่ยังเปลี่ยนไม่ได้บอกตอนกด (หน้าเป็นคนบอก) — การ์ดไม่จางปุ่ม ไม่วาดบรรทัดเหตุ');
  assert.equal(count(CARD, 'view.method'), 1, 'ที่เดียวในการ์ด');
  /* 🐞 UAT S2b S09 / S10 — ปุ่มทางออก "เปลี่ยนวิธีประเมิน" ในบรรทัดเหตุของปุ่มส่งผล (แถว 17 · 17a) กดแล้วเงียบ: `JumpButton` ไม่รู้จักเป้า
     ชนิด `method` และไม่ได้รับตัวจัดการ ⇒ ตัวจัดการตัวเดียวกับปุ่มของการ์ด ส่งต่อให้ปุ่มในบรรทัดเหตุด้วย */
  assert.equal(count(CARD, 'onSwitchMethod'), 4, 'prop + ปุ่มของการ์ด + ปุ่มทางออกในบรรทัดเหตุ (รับ · ส่งต่อ)');
  assert.match(CARD, /import JumpButton from "\.\/SurveyJumpButton";/);
  assert.match(JUMP, /export default function JumpButton\(\{ target, onOpenZone, onGoTab, onReload, onSwitchMethod, className \}\)/);
  assert.match(JUMP, /else if \(target\.kind === "method"\) onSwitchMethod\?\.\(\);/);
  assert.match(CARD, /onReload=\{reasonReload\}\s+onSwitchMethod=\{onSwitchMethod\}\s+className=\{styles\.reasonJump\}/);
  assert.doesNotMatch(CARD, /เปลี่ยนวิธีประเมิน/, 'คำบนปุ่มมาจากค่าคงที่ ไม่พิมพ์ซ้ำ');
  const order = ['id: "recall"', 'id: "method"', 'id: "next-zone"'].map((needle) => CARD.indexOf(needle));
  assert.ok(order.every((at) => at !== -1));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // ป้ายวิธีไม่ผ่านการ์ดเลย — ไม่มีคีย์ป้ายให้หลุดไปอยู่บรรทัดเดียวกับสตริง (ยามนับคลาสป้ายของหน้าต้นแบบ)
  assert.doesNotMatch(CARD_RAW, /(?<![\w-])chip(?![\w-])/);
  assert.doesNotMatch(TABLE_RAW, /(?<![\w-])chip(?![\w-])/);

  // ── ตัวตัดสิน: ใครได้ปุ่ม ──
  const rows = [zone('a'), drawn('z')];
  assert.deepEqual(control(rows).method, { show: true, allowed: true, reason: null });
  assert.equal(control(rows, { enabled: false }).method.show, false, 'สวิตช์ปิด = ไม่มีปุ่ม');
  assert.equal(control(rows, { viewer: PLANNER }).method.show, false, 'ผู้วางคิว / ช่าง = ไม่มีปุ่ม');
  assert.equal(control([zone('a')], { enabled: false }).method.show, false, 'ใบลงหน้างานล้วน สวิตช์ปิด = การ์ดเดิม');
  // โชว์แต่ยังเปลี่ยนไม่ได้ = ยังเป็นปุ่มปกติบนการ์ด เหตุอยู่ที่ `reason` ให้หน้าบอกตอนกด
  const sent = control(rows, { request: { ...REQUEST, status: 'answered', answeredAt: '2026-10-09T05:00:00Z' } }).method;
  assert.deepEqual(sent, { show: true, allowed: false, reason: SURVEY_METHOD_ERRORS.sentButton });
});

test('การ์ด: แถบวัดของงานโต๊ะวาดจาก progress.desk เท่านั้น · ใบผสมได้คำของแถบจาก progress.text · ใบลงหน้างานล้วนเหมือนเดิม', () => {
  const meter = between(CARD, 'const drawMeter = ', 'const noticeNodes = ');
  assert.equal(count(CARD, 'role="progressbar"'), 1, 'แถบทรงเดียว');
  assert.match(meter, /aria-label=\{label\}\s*aria-valuemin=\{0\}\s*aria-valuemax=\{total\}\s*aria-valuenow=\{done\}/);
  assert.match(meter, /\{Array\.from\(\{ length: total \}, \(_, i\) => \(\s*<i key=\{i\} data-ok=\{i < done \? "1" : undefined\} \/>/, 'ขีดละหนึ่งพื้นที่');
  assert.match(meter, /const deskMeter = progress\.desk;/);
  assert.match(meter, /: deskMeter\s*\? \(deskMeter\.total \? drawMeter\(\{\s*label: status\.headline,\s*done: deskMeter\.done,\s*total: deskMeter\.total,\s*complete: deskMeter\.done >= deskMeter\.total,\s*\}\) : null\)/);
  assert.equal(count(CARD, 'progress.desk'), 1, 'ที่เดียว — ไม่มีชิ้นอื่นของการ์ดคิดจากเลขงานโต๊ะ');
  // ทางเดิม: ยังเงียบเมื่อไม่มีพื้นที่ให้นับ และยังใช้ชื่อแถบเดิมเมื่อไม่มีพื้นที่จากแบบ
  assert.match(meter, /: !progress\.total \? null : drawMeter\(\{\s*label: mixedText \|\| `วัดแล้ว \$\{progress\.done\} จาก \$\{progress\.total\} พื้นที่`,\s*done: progress\.done,\s*total: progress\.total,\s*complete: progress\.complete,\s*note: mixedSaid \? null : mixedText,\s*\}\);/);
  assert.match(meter, /const mixedText = progress\.drawing > 0 \? progress\.text : null;/);
  assert.match(meter, /const meter = flags\.cancelled\s*\? null/);
  // คำของใบผสมอยู่หลังแถบ ตรงที่ "ตัดออก n" อยู่ (และ "ตัดออก n" ยังอยู่)
  assert.match(meter, /<\/span>\s*\{note \? <small>\{note\}<\/small> : null\}\s*\{progress\.cut \? <small>ตัดออก \{progress\.cut\}<\/small> : null\}/);
  // ใบผสม: คำยาวกว่าราง ⇒ แถบเต็มบรรทัด คำลงบรรทัดถัดไป (ห่อได้ ไม่ตัด)
  assert.match(CARD_CSS, /\.meterNoted \{\s*flex-wrap: wrap;/);
  assert.match(CARD_CSS, /\.meterNoted \.bar \{\s*flex-basis: 100%;\s*\}/);
  assert.ok(CARD_CSS.indexOf('.meterNoted small {') > CARD_CSS.indexOf('.meter small {'), 'ความจำเพาะเท่ากัน — ตัวหลังในไฟล์ชนะ');

  // ── ตัวตัดสิน ──
  const ready = (z) => ({ ...z, packageQty: 1, packageSize: 'ST' });
  const desk = control([ready(drawn('y')), drawn('z')], { filesByZone: { y: [file('p', 'survey_plan')] } });
  assert.equal(desk.mix.mode, 'drawing');
  assert.equal(desk.progress.total, 0, 'ตัวนับงานหน้างานของใบงานโต๊ะเป็นศูนย์ — ทางเดิมจึงไม่วาดแถบให้');
  assert.deepEqual(desk.progress.desk, { done: 1, total: 2 });
  assert.equal(desk.status.key, 'desk-working');
  assert.equal(desk.status.headline, `กำลังประเมินจากแบบ — ${desk.progress.desk.done}/${desk.progress.desk.total} พื้นที่`,
    'ชื่อของแถบ (พาดหัว) กับตัวเลขของแถบเป็นคู่เดียวกัน');
  // ยังไม่ได้กรอกอะไรเลย: แถบยังขึ้น (ขีดว่างครบทุกพื้นที่) ใต้พาดหัว "ยังไม่ได้กรอกขนาด"
  const blank = control([drawn('y', { parts: [] }), drawn('z', { parts: [] })]);
  assert.equal(blank.status.headline, 'ยังไม่ได้กรอกขนาด');
  assert.deepEqual(blank.progress.desk, { done: 0, total: 2 });
  // สถานะนี้ไม่มีบรรทัดรอง — การ์ดไม่วาดบรรทัดเปล่าไว้เหนือแถบ (สถานะอื่นทุกตัวมีบรรทัดรอง ⇒ วาดเหมือนเดิม)
  assert.equal(blank.status.sub, '');
  assert.match(CARD, /\{status\.sub \? <span className=\{styles\.statusSub\}>\{status\.sub\}<\/span> : null\}/);
  const mixed = control([zone('a'), drawn('z')]);
  assert.equal(mixed.progress.desk, null);
  assert.equal(mixed.progress.drawing, 1);
  assert.match(mixed.progress.text, /^วัดแล้ว \d+ \/ 1 พื้นที่ · จากแบบ 1 \(หัวหน้ากรอกเอง\)$/);
  const onsite = control([zone('a'), zone('b')]);
  assert.equal(onsite.progress.desk, null);
  assert.equal(onsite.progress.drawing, 0, 'ไม่มีพื้นที่จากแบบ ⇒ ชื่อแถบเดิม ไม่มีคำต่อท้ายแถบ');
});

test('การ์ด: บล็อกด่านไม่ถูกวาดเมื่อ view.gatesHidden (ใบจากแบบทั้งใบที่คนดูไม่ได้เคาะ) · ธงมาจากตัวตัดสินตัวเดียว', () => {
  assert.match(CARD, /const gatesSection = flags\.cancelled \? null : \(\s*view\.gatesHidden \? null : \(\s*<section className=\{styles\.sec\} aria-label=\{view\.gatesTitle\}>/);
  assert.equal(count(CARD, 'gatesHidden'), 1, 'ที่เดียว — ปุ่มคลี่อ่านชื่อก้อนจาก `fold.labels` ซึ่งว่างคู่กันอยู่แล้ว');
  assert.doesNotMatch(CARD, /hidden=\{view\.gatesHidden\}/, 'ไม่วาด ไม่ใช่วาดแล้วซ่อน');
  // การ์ดไม่ตัดสินเองจากวิธีประเมินหรือสิทธิ์
  assert.doesNotMatch(CARD, /mix\.mode|view\.mix|needsVisit|isDrawingZone|zoneMethod/);

  const drawnOnly = [drawn('y'), drawn('z')];
  const planner = control(drawnOnly, { viewer: PLANNER });
  assert.equal(planner.gatesHidden, true);
  assert.equal(planner.fold.labels.gates, null, 'ปุ่มคลี่ไม่เอ่ยชื่อก้อนที่ไม่ได้วาด');
  assert.equal(control(drawnOnly).gatesHidden, false, 'หัวหน้ายังเห็นด่านก่อนส่งผล');
  assert.equal(control([zone('a'), drawn('z')], { viewer: PLANNER }).gatesHidden, false, 'ใบผสมยังมีของให้ช่างเก็บ');
  assert.equal(control([zone('a')], { viewer: PLANNER }).gatesHidden, false, 'ใบลงหน้างานล้วน = การ์ดเดิม');
  // ใบงานโต๊ะไม่มี "ส่งกลับให้ช่างแก้" — มาจากตัวตัดสิน การ์ดไม่เพิ่มกติกา
  assert.equal(control(drawnOnly).sendBackAction.show, false);
  assert.match(CARD, /\{sendBackAction\.show \? \(/);
});

test('การ์ด: แถววันส่งผลของงานโต๊ะวาดจาก deskDue ที่หน้าส่งมา — ไม่ส่ง = ไม่มีแถว · ปุ่มรอง สูง 44px', () => {
  assert.match(CARD, /\n {2}deskDue = null,\n/);
  const row = between(CARD, '{deskDue ? (', ') : null}');
  assert.match(row, /<CalendarDays size=\{14\} aria-hidden="true" \/>/);
  assert.match(row, /\{deskDue\.wish \? <span>\{deskDue\.wish\}<\/span> : null\}/, 'ผู้ขอไม่ระบุวัน = ไม่พิมพ์');
  assert.match(row, /<Button variant="outline" className=\{styles\.deskDueBtn\} onClick=\{deskDue\.onClick\}>\s*\{deskDue\.label\}\s*<\/Button>/);
  assert.doesNotMatch(row, /tone="primary"|disabled|รับปากวันส่งผล|เลื่อนวันส่งผล|ผู้ขอต้องการผล/, 'คำมาจากหน้า (ตัวตัดสินวันส่งผล) · ไม่ใช่ปุ่มหลัก');
  assert.equal(count(CARD, 'deskDue ?'), 1);
  // การ์ดไม่ถามตัวตัดสินวันส่งผลเอง และไม่ยิง API
  assert.doesNotMatch(CARD, /deskDueAction|commitDueLabels|apiJson|apiFetch/);
  // อยู่ในบล็อกสถานะ ใต้กำหนดส่งผลและแถบวัด (ชิ้นแรกของการ์ดทั้งใน DOM และบนจอ ⇒ ลำดับ Tab ตรงกับที่ตาเห็น)
  const status = between(CARD, 'statusSub={(', 'notices={noticeNodes}');
  const at = ['{dueLine ?', '{meter}', '{deskDue ? ('].map((needle) => status.indexOf(needle));
  assert.ok(at.every((i) => i !== -1));
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  // ปุ่ม 44px ทุกความกว้าง — ไฟล์นี้มีเส้นจอได้เส้นเดียว (ยามของ surveyDocumentSheet.test.mjs) จึงไม่ผูกกับชนิดตัวชี้
  assert.match(CARD_CSS, /\.deskDueBtn:global\(\.btn\) \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(CARD_CSS, /\.deskDue \{[^}]*flex-wrap: wrap;/, 'ราง 330px: ปุ่มลงบรรทัดของตัวเองได้ ไม่ล้น');
  const queries = [...new Set((CARD_CSS.match(/@media[^{]*/g) || []).map((q) => q.trim()))];
  assert.deepEqual(queries, ['@media (max-width: 1050px)']);
  for (const name of ['deskDue', 'deskDueWish', 'deskDueBtn', 'meterNoted']) {
    assert.match(CARD, new RegExp(`styles\\.${name}\\b`), `การ์ดไม่ได้ใช้ ${name}`);
    assert.match(CARD_CSS, new RegExp(`\\.${name}\\b`), `โมดูล CSS ไม่มี .${name}`);
  }
  assert.doesNotMatch(CARD_CSS, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

test('สวิตช์ปิด / ใบลงหน้างานล้วน: ทุกคีย์ที่ของใหม่แขวนอยู่เป็นค่าว่าง ⇒ ตารางและการ์ดเดิมทุกจุด', () => {
  const rows = [zone('a'), zone('b', { status: 'added' }), zone('c', { status: 'cut', cutReason: 'ลูกค้ายกเลิกห้องนี้' })];
  for (const row of rows) assert.equal(surveyResultMethodCell(row, REQUEST).source, null);
  for (const viewer of [HEAD, PLANNER]) {
    const view = control(rows, { viewer, enabled: false });
    assert.equal(view.method.show, false);
    assert.equal(view.progress.desk, null);
    assert.equal(view.progress.drawing, 0);
    assert.equal(view.gatesHidden, false);
    assert.equal(view.mix.drawing, 0);
    assert.notEqual(view.mix.mode, 'drawing');
  }
  // สวิตช์ปิดหลังมีแถวจากแบบแล้ว: แถวยังวาดทางของแถวจากแบบ (ข้อมูลเป็นตัวตัดสิน) — หายแค่ปุ่มสลับวิธี
  const late = control([drawn('z')], { enabled: false });
  assert.equal(late.method.show, false);
  assert.deepEqual(late.progress.desk, { done: 0, total: 1 });
  assert.notEqual(surveyResultMethodCell(drawn('z'), REQUEST).source, null);
});
