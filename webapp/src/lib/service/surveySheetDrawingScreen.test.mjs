// ── ประเมินจากแบบ งวด S2b กลุ่ม A: หน้าใบประเมิน · โมดัลเปลี่ยนวิธี · กล่องตัดพื้นที่ที่พลิกใบ · โมดัลส่งผล — ยามอ่านซอร์สจอ ─────────
//
// ⭐ เทสต์ชุดนี้รันใต้ Node ล้วน (เรนเดอร์ JSX ไม่ได้) ⇒ สองชั้น ท่าเดียวกับ `surveyFieldScreen.test.mjs`:
//   ① **จอเรียกอะไร / ประกาศอะไร** — ของที่พังเงียบได้: ปุ่มใหม่ที่โผล่บนใบของวันนี้ · คำตอบที่ถูกเลือกไว้ให้ · คีย์ใหม่ในคำขอของใบลงหน้างาน ·
//      ช่างเห็นพื้นที่ที่ไม่ใช่งานของเขา · ผู้วางคิวได้ปุ่มที่ server ไม่ให้กด · การกดซ้ำที่ได้เลขการกดใหม่
//   ② **ตัวตัดสินที่จอกิน** ให้ค่าตามที่จอคาด — โดยเฉพาะ "ใบลงหน้างานล้วน / สวิตช์ปิด = ไม่มีอะไรโผล่" (สเปก S2b §4)
// ⚠️ ตัวช่วยล้วนของโมดัล (`surveyReasonWithPreset` · `surveyMethodFailure` · `newSurveyActionId`) อยู่ในไฟล์จอ (JSX — import ตรง ๆ ไม่ได้)
//    ⇒ หยิบซอร์สของฟังก์ชันมารันตรง ๆ (สามตัวนี้ไม่อ้างอะไรนอกอาร์กิวเมนต์)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commitDueLabels, deskDueAction } from '../requests/commitDue.js';
import { SURVEY_ZONE_STALE_CODE } from './survey.js';
import { surveyControlView as controlView } from './surveyControl.js';
import {
  surveyDefaultZoneId, surveyDrawingZoneView, surveyJobHeaderView, surveySalesDrawingsView, surveyZoneListView,
  surveyZoneNeighbors,
} from './surveyFieldView.js';
import {
  SURVEY_CONFIRM_MISSING, SURVEY_DESK_ADD_HEAD_ONLY, SURVEY_METHOD_BUTTON, SURVEY_METHOD_CANCEL_ONLY_REASON,
  SURVEY_METHOD_ERRORS, SURVEY_METHOD_LABEL, SURVEY_METHOD_MODAL_TITLE, SURVEY_METHOD_REASON_CHIPS,
  SURVEY_METHOD_REASON_LABEL, SURVEY_METHOD_RESULT_DATE_LABEL, SURVEY_METHOD_SHORTCUTS, surveyMethodActionId,
  surveyMethodErrorFields, surveyMethodErrorTexts, surveyMethodSwitchPlan,
} from './surveyMethodSwitch.js';
import { surveySendConfirm } from './surveySendClose.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const count = (src, needle) => src.split(needle).length - 1;
const between = (src, from, to) => {
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
/** ฟังก์ชันล้วนที่ประกาศด้วย `export function` ในไฟล์จอ → ฟังก์ชันที่รันได้ (นับปีกกาหาท้ายตัวฟังก์ชัน) */
const pureFunction = (src, name) => {
  const start = src.indexOf(`export function ${name}(`);
  assert.ok(start !== -1, `ไม่มี ${name}`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return new Function(`${src.slice(start + 'export '.length, i + 1)}\nreturn ${name};`)();
    }
  }
  throw new Error(`หาท้ายของ ${name} ไม่เจอ`);
};

const PAGE_PATH = '../../app/service/surveys/[id]/page.js';
const DIALOG_PATH = '../../components/service/SurveyMethodDialog.js';
const PAGE = code(read(PAGE_PATH));
const DIALOG = code(read(DIALOG_PATH));
const PAGE_CSS = css('../../app/service/surveys/[id]/page.module.css');
const DIALOG_CSS = css('../../components/service/SurveyMethodDialog.module.css');
const GROUP = { 'page.js': PAGE, 'SurveyMethodDialog.js': DIALOG };

/* ── ของตั้งต้น ─────────────────────────────────────────────────────────────────────────────── */
const SIZES = [
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
];
const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
const zone = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneCode: `ZN-1203-1031${id.slice(-1)}`, zoneName: name, floor: '5', status: 'ok',
  parts: [part(4, 5, 3)], spots: [{ id: 's1', label: 'มุมโซฟา', selected: true }],
  packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: '', note: '', ...extra,
});
const drawingZone = (id, name, extra = {}) => zone(id, name, { method: 'drawing', ...extra });
const WIDE = { id: 'F-w', docType: 'survey_wide', fileName: 'wide.jpg', mimeType: 'image/jpeg' };
const PLAN = { id: 'F-p', docType: 'survey_plan', fileName: 'plan.png', mimeType: 'image/png' };
const SPOT = { id: 'F-s', docType: 'survey_spot', fileName: 'spot.jpg', mimeType: 'image/jpeg', metadata: { spotId: 's1' } };
const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26100352', title: 'ประเมินพื้นที่สำนักงานสาทร', kind: 'site_survey', dept: 'TS',
  status: 'acknowledged', acknowledgedAt: '2026-10-08T02:00:00.000Z', siteId: 'SS-1', customerId: 'CU-1',
  committedDueDate: '2026-10-13', committedResultDate: '2026-10-15', ...extra,
});
const VISIT = {
  id: 'SV-1', code: 'SV-26100011', status: 'scheduled', scheduledDate: '2026-10-13', startTime: '10:00',
  assigneeId: 'U-9', assigneeName: 'Phuwadol Aoonnankad',
};
const HEAD = { canWrite: true, canDecide: true };
const CREW = { canWrite: true, canDecide: false };
const sheet = (args = {}) => controlView({
  request: request(), zones: [], filesByZone: {}, viewer: HEAD, packageSizes: SIZES, today: '2026-10-09', ...args,
});
const ONSITE_ROWS = [zone('z1', 'ล็อบบี้'), zone('z2', 'ห้องประชุมใหญ่')];
const ONSITE_FILES = { z1: [WIDE, PLAN, SPOT], z2: [WIDE, PLAN, SPOT] };
const MIXED_ROWS = [zone('z1', 'ล็อบบี้'), zone('z2', 'ห้องประชุมใหญ่'), drawingZone('z3', 'โซนคาเฟ่พนักงาน')];
const MIXED_FILES = { ...ONSITE_FILES, z3: [PLAN] };
const DESK_ROWS = [drawingZone('z1', 'โถงต้อนรับ'), drawingZone('z2', 'โซนขายหน้าร้าน')];
const DESK_FILES = { z1: [PLAN], z2: [PLAN] };

/* ══ ① ตัวตัดสินของการ์ดได้สวิตช์กับนัดที่เข้าพื้นที่แล้วจาก GET ═══════════════════════════════════════════════ */

test('หน้าส่ง `drawingMethodEnabled` / `siteVisitReached` ของ GET ให้ `surveyControlView` — ปุ่มเปลี่ยนวิธีมีได้เฉพาะสวิตช์เปิด + หัวหน้า', () => {
  const call = between(PAGE, 'const view = useMemo(() => surveyControlView({', '  const canDecide =');
  assert.match(call, /\n {4}drawingMethodEnabled: data\?\.drawingMethodEnabled === true,\n {4}siteVisitReached: data\?\.siteVisitReached \?\? null,/,
    'สองคีย์จาก GET ล้วน — จอไม่อ่านสวิตช์เอง · `null` = ไม่ได้อ่าน (ไม่ขึ้นเหตุของเรื่องนี้)');
  assert.match(call, /\}\), \[data, zones, filesByZone, [^\]]*\]\);/, 'สองคีย์ใหม่มาจาก `data` ซึ่งอยู่ใน deps แล้ว');

  // สวิตช์ปิด = ไม่มีปุ่ม (ไม่ใช่ปุ่มจาง) · ใบลงหน้างานล้วน = ทุกคีย์ใหม่ตกค่าเดิม
  const off = sheet({ zones: ONSITE_ROWS, filesByZone: ONSITE_FILES });
  assert.deepEqual(off.method, { show: false, allowed: false, reason: null });
  assert.deepEqual(off.mix, { onsite: 2, drawing: 0, mode: 'onsite' });
  assert.equal(off.needsVisit, true);
  assert.equal(off.fieldTabLabel, 'หน้างาน');
  assert.equal(off.send.confirm.required, false);
  assert.equal(off.progress.desk, null);
  assert.equal(off.gatesHidden, false);
  // สวิตช์เปิด: หัวหน้าได้ปุ่ม · ช่าง / ผู้วางคิว (ไม่ได้เคาะ) ไม่มีปุ่มเลย
  const on = sheet({ zones: ONSITE_ROWS, filesByZone: ONSITE_FILES, drawingMethodEnabled: true });
  assert.deepEqual(on.method, { show: true, allowed: true, reason: null });
  assert.equal(sheet({ zones: ONSITE_ROWS, filesByZone: ONSITE_FILES, drawingMethodEnabled: true, viewer: CREW }).method.show, false);
});

/* ══ ② ใครเห็นพื้นที่จากแบบ (มติ O4) ══════════════════════════════════════════════════════════════════════ */

test('🔴 `hideDrawing` = ช่างเท่านั้น · ผู้วางคิวแยกจากช่างด้วย `canEditService` ของ GET (ไม่ใช่ชื่อตำแหน่ง) · ไปที่สี่ตัวเรียกพอดี', () => {
  assert.match(PAGE, /const crewOnly = !!data && data\.canWrite === true && !canDecide;/, 'บรรทัดเดิม — ยังเป็นจริงทั้งช่างและผู้วางคิว');
  assert.match(PAGE, /const planReader = crewOnly && data\?\.canEditService === true;/);
  assert.match(PAGE, /const hideDrawing = crewOnly && !planReader;/);
  assert.ok(PAGE.indexOf('const crewOnly =') < PAGE.indexOf('const defaultZoneId ='), 'พื้นที่ตั้งต้นต้องรู้ `hideDrawing` — ประกาศก่อน');
  assert.doesNotMatch(PAGE, /ts_planner|\brole\s*===|\.role\b/, 'จอไม่รู้ role ของตัวเอง — แยกด้วยความสามารถที่ server ตอบ');

  assert.match(PAGE, /surveyDefaultZoneId\(zones, filesByZone, \{ editable: defaultEditable, hideDrawing, drawingEditable: canDecide \}\)/);
  assert.match(PAGE, /surveyZoneListView\(\{[\s\S]{0,260}\n\s+hideDrawing, dept: req\.dept,\n\s+\}\)/);
  assert.match(PAGE, /neighbors=\{surveyZoneNeighbors\(zones, shownZone\.id, filesByZone, \{ hideDrawing \}\)\}/);
  /* ตัวที่สี่ (UAT S22/S13 · 12/10): "ถัดไป" ของท้ายหน้าพื้นที่ — ทางเดินตามลำดับของ `surveyNextStep` ไม่ได้ตัดพื้นที่จากแบบออกเอง
     ⇒ ช่างที่นัดยังไม่เริ่มเคยได้ปุ่ม "ถัดไป: {พื้นที่จากแบบ}" ที่พาเข้าพื้นที่ซึ่งรายการของเขาซ่อนไว้ · ผู้วางคิวยังเดินเข้าได้ (อ่านอย่างเดียว) */
  assert.match(PAGE, /surveyNextStep\(\{\s+zones, filesByZone, zoneId: shownZone\.id,[\s\S]{0,160}canSubmit: canSubmitField && actsAsCrew,\s+hideDrawing,\s+\}\) : null;/);
  // ประกาศ 1 + สี่ตัวเรียก + deps ของ useMemo พื้นที่ตั้งต้น 1 — ไม่มีที่อื่น (แถบของช่าง · ด่านแจ้งหัวหน้า ได้ทั้งใบตามเดิม)
  assert.equal((PAGE.match(/\bhideDrawing\b/g) || []).length, 6);
  assert.match(PAGE, /tabsNote=\{canDecide \? surveySheetTotalsText\(\{ zones, filesByZone \}\) : null\}/,
    'บรรทัดรวมข้างแท็บเป็นของหัวหน้า (`hideDrawing` เป็นเท็จเสมอที่นั่น) — ไม่แตะ');
  assert.match(PAGE, /zoneIds = useMemo\(\(\) => zones\.map\(\(z\) => String\(z\.id\)\), \[zones\]\)/,
    'ลิงก์ตรงเข้าพื้นที่จากแบบยังเปิดได้ (อ่านอย่างเดียว) — ตัวต่อสายได้ทุกพื้นที่');
});

test('ตัวตัดสิน: ช่างไม่เห็นพื้นที่จากแบบ (มีบรรทัดบอกจำนวน) · ผู้วางคิวเห็นทุกแถวพร้อมป้ายวิธี · ใบลงหน้างานล้วนเท่ากันทุกคนดู', () => {
  const base = { zones: MIXED_ROWS, filesByZone: MIXED_FILES, canDecide: false, dept: 'TS' };
  const crew = surveyZoneListView({ ...base, hideDrawing: true });
  assert.deepEqual(crew.rows.map((r) => r.id), ['z1', 'z2']);
  assert.ok(crew.drawingNote, 'ช่างได้บรรทัด "อีก n พื้นที่หัวหน้าประเมินจากแบบ"');
  const planner = surveyZoneListView({ ...base, hideDrawing: false });
  assert.deepEqual(planner.rows.map((r) => r.id), ['z1', 'z2', 'z3']);
  assert.equal(planner.drawingNote, null);
  const { method: plannerMethod } = planner.rows[2];
  assert.equal(plannerMethod, 'drawing');
  assert.equal(planner.rows.every((r) => r.tags.headPending === false), true, 'ไม่ใช่หัวหน้า = ไม่มีป้ายของหัวหน้า');
  assert.equal(surveyZoneNeighbors(MIXED_ROWS, 'z1', MIXED_FILES, { hideDrawing: true }).total, 2);
  assert.equal(surveyZoneNeighbors(MIXED_ROWS, 'z1', MIXED_FILES, { hideDrawing: false }).total, 3);

  // ใบที่ไม่มีพื้นที่จากแบบ: สองธงไม่เปลี่ยนอะไรเลย (สเปก §4)
  const plain = { zones: ONSITE_ROWS, filesByZone: ONSITE_FILES, canDecide: false };
  assert.deepEqual(surveyZoneListView({ ...plain, hideDrawing: true, dept: 'TS' }), surveyZoneListView({ ...plain, hideDrawing: false, dept: 'TS' }));
  assert.deepEqual(
    surveyZoneNeighbors(ONSITE_ROWS, 'z1', ONSITE_FILES, { hideDrawing: true }),
    surveyZoneNeighbors(ONSITE_ROWS, 'z1', ONSITE_FILES),
  );
});

test('พื้นที่ตั้งต้น: ผู้วางคิวไม่ถูกพาไปพื้นที่จากแบบที่ยังขาด · หัวหน้าที่เขียนผลวัดไม่ได้ก็ได้งานถัดไป · ใบเดิม = คำสั่งเดิม', () => {
  assert.match(PAGE, /const defaultEditable = view\.flags\.canWrite \|\| \(canDecide && !view\.flags\.locked && view\.mix\.drawing > 0\);/);
  const memo = between(PAGE, 'const defaultZoneId = useMemo(', 'const route = useSurveyZoneRoute({');
  assert.match(memo, /view\.mix\.drawing > 0\s*\? surveyDefaultZoneId\([^)]*drawingEditable: canDecide \}\)\s*: surveyDefaultZoneId\(zones, filesByZone, \{ editable: view\.flags\.canWrite \}\)/,
    'ใบที่ไม่มีพื้นที่จากแบบเดินคำสั่งเดิมทุกตัวอักษร');
  assert.match(memo, /\[zones, filesByZone, view\.flags\.canWrite, view\.mix\.drawing, defaultEditable, hideDrawing, canDecide\]/);

  // z1 จากแบบยังไม่มีขนาด · z2 ลงหน้างานยังไม่มีขนาด
  const rows = [drawingZone('z1', 'โซนคาเฟ่', { parts: [] }), zone('z2', 'ล็อบบี้', { parts: [] }), zone('z3', 'ห้องประชุม')];
  const files = { z1: [], z2: [WIDE, SPOT], z3: [WIDE, SPOT] };
  assert.equal(surveyDefaultZoneId(rows, files, { editable: true, hideDrawing: false, drawingEditable: false }), 'z2', 'ผู้วางคิว');
  assert.equal(surveyDefaultZoneId(rows, files, { editable: true, hideDrawing: false, drawingEditable: true }), 'z1', 'หัวหน้า');
  assert.equal(surveyDefaultZoneId(rows, files, { editable: true, hideDrawing: true, drawingEditable: false }), 'z2', 'ช่าง');
  // สองกิ่งของหน้าให้ผลเดียวกันบนใบที่ไม่มีพื้นที่จากแบบ — กิ่งเดิมเป็นแค่ตัวอักษรเดิม ไม่ใช่กติกาที่สอง
  for (const editable of [true, false]) {
    for (const hideDrawing of [true, false]) {
      for (const drawingEditable of [true, false]) {
        assert.equal(
          surveyDefaultZoneId(ONSITE_ROWS, { z1: [WIDE, SPOT], z2: [] }, { editable, hideDrawing, drawingEditable }),
          surveyDefaultZoneId(ONSITE_ROWS, { z1: [WIDE, SPOT], z2: [] }, { editable }),
        );
      }
    }
  }
});

/* ══ ③ พื้นที่จากแบบที่เปิดอยู่: ชนิดคนดู · ของที่หน้าพื้นที่ต้องได้ ═══════════════════════════════════════════════ */

test('🔴 พื้นที่จากแบบได้ชนิดคนดูจากตัวตัดสินของพื้นที่นั้น (`shownDrawing`) — หัวหน้าที่เขียนผลวัดไม่ได้ต้องมีปุ่มบันทึก', () => {
  assert.match(PAGE, /const shownDrawing = shownZone \? surveyDrawingZoneView\(\{\s*zone: shownZone, files: filesByZone\[shownZone\.id\] \|\| \[\], canDecide, locked: view\.flags\.locked, dept: req\.dept,\s*\}\) : null;/);
  assert.match(PAGE, /const drawingZoneEditable = shownDrawing\?\.editable === true;/);
  assert.match(PAGE, /viewerKind=\{shownDrawing \? \(drawingZoneEditable \? "head" : "readonly"\) : viewerKind\}/);
  assert.match(PAGE, /const viewerKind = !view\.flags\.canWrite \? "readonly" : !canDecide \? "crew" : data\?\.onVisit === true \? "senior" : "head";/,
    'พื้นที่ลงหน้างาน = ค่าเดิม');
  const [tag] = jsxOpenTags(PAGE, /<SurveyZonePage\b/g);
  for (const prop of [
    /\bcanDecide=\{canDecide\}/, /\blocked=\{view\.flags\.locked\}/, /\bdept=\{req\.dept\}/,
    /\bdrawings=\{drawingsInZone\}/, /\bplanReloadKey=\{planReloadKey\}/,
  ]) assert.match(tag, prop);

  // ตัวตัดสิน: แก้ได้ = หัวหน้า + ใบไม่ล็อก (ไม่ถาม canWrite) · ผู้วางคิว/ช่าง = อ่านอย่างเดียวพร้อมเหตุ · ลงหน้างาน = null
  const target = MIXED_ROWS[2];
  assert.equal(surveyDrawingZoneView({ zone: target, files: [PLAN], canDecide: true, locked: false }).editable, true);
  assert.equal(surveyDrawingZoneView({ zone: target, files: [PLAN], canDecide: true, locked: true }).editable, false);
  const reader = surveyDrawingZoneView({ zone: target, files: [PLAN], canDecide: false, locked: false });
  assert.equal(reader.editable, false);
  assert.equal(reader.readOnlyReason, 'พื้นที่นี้หัวหน้าประเมินจากแบบ — ไม่ต้องวัดหน้างาน');
  assert.equal(surveyDrawingZoneView({ zone: MIXED_ROWS[0], files: [WIDE], canDecide: true }), null);
});

/* ══ ④ แผง "แบบจากฝ่ายขาย" ═════════════════════════════════════════════════════════════════════════════ */

test('🔴 แผงแบบจากฝ่ายขาย: เฉพาะหัวหน้า/ผู้วางคิวบนใบที่มีพื้นที่จากแบบ · ปุ่มใช้รูปเป็นของหัวหน้าที่เปิดพื้นที่จากแบบที่แก้ได้เท่านั้น', () => {
  assert.match(PAGE, /const showDrawings = \(canDecide \|\| planReader\) && view\.mix\.drawing > 0;/);
  assert.match(PAGE, /const drawingsView = showDrawings \? surveySalesDrawingsView\(\{\s*requestFiles: data\?\.requestFiles, threadFiles: data\?\.threadFiles, zone: shownZone, unknown: data\?\.unknown,\s*editable: drawingZoneEditable,\s*\}\) : null;/);
  assert.match(PAGE, /const reuseZone = canDecide && drawingZoneEditable \? shownZone : null;/);
  const reuse = between(PAGE, 'const reuseProps = ', 'const drawingsAbovePanes');
  assert.match(reuse, /reuseZone \? \{\s*zoneTitle: surveyZoneTitle\(reuseZone\),\s*busyKey: reuseBusyKey,\s*onReuse: \(file\) => reusePlan\(reuseZone\.id, file\),\s*\} : null;/);
  assert.equal((PAGE.match(/\bonReuse\b/g) || []).length, 1, '`onReuse` มีที่เดียว — ใต้ `canDecide`');
  assert.equal((PAGE.match(/\bbusyKey\b/g) || []).length, 1);
  assert.equal((PAGE.match(/\bzoneTitle\b/g) || []).length, 1);

  const tags = jsxOpenTags(PAGE, /<SurveySalesDrawings\b/g);
  assert.deepEqual(tags, [
    /* พับ/กางตอนเปิดหน้า (มติเจ้าของ head-r3-31): หัวหน้าบนจอแยกบาน = กางเมื่อไม่เกิน 3 ไฟล์ · จอไม่แยกบาน + ผู้วางคิว = พับ ·
       อ่านรายชื่อไฟล์ไม่สำเร็จ = กางทุกที่ (กล่องเตือนอยู่ในแผง · planner-q11 ถอดแถวไฟล์แนบของคำร้องไปแล้ว) */
    '<SurveySalesDrawings view={drawingsView} defaultOpen={(canDecide && drawingsView.files.length <= 3) || drawingsView.unknown} {...reuseProps} />',
    '<SurveySalesDrawings view={drawingsView} compact defaultOpen={zoneDrawingsOpen ?? drawingsView.unknown} onOpenChange={setZoneDrawingsOpen} {...reuseProps} />',
    '<SurveySalesDrawings view={drawingsView} compact defaultOpen={drawingsView.unknown} />',
  ], 'สามที่วาง — ตัวสุดท้าย (เหนือรายการของหน้าเดียว) ไม่มีปุ่มเสมอ: ไม่มีพื้นที่ไหนเปิดอยู่');
  assert.match(PAGE, /const drawingsAbovePanes = showDrawings && split\s*\?/);
  assert.match(PAGE, /const drawingsInZone = showDrawings && !split && shownDrawing\s*\?/);
  assert.match(PAGE, /const drawingsAboveList = showDrawings && !split\s*\?/);
  // `{}` = คอมเมนต์ JSX ที่ตัวตัดคอมเมนต์เหลือไว้
  assert.match(PAGE, /\{cardInList && controlFirst \? controlCard : null\}\s*(?:\{\}\s*)?\{drawingsAboveList\}/, 'ติดเหนือรายการพื้นที่');
  /* สองบานต้องอยู่ตำแหน่งเดิมของต้นไม้ทุกสภาพ — แผงโผล่/หายแล้วสองบานถูกถอด-ใส่ใหม่ = ร่างที่พิมพ์ค้างหายไม่ถาม */
  assert.match(PAGE, /const fieldMain = \(\s*<>\s*\{drawingsAbovePanes\}\s*\{fieldWorkspace\}\s*<\/>\s*\);/);
  assert.doesNotMatch(PAGE, /const fieldMain = drawingsAbovePanes \?/);

  // ตัวตัดสิน: แก้ไม่ได้ / ไม่มีพื้นที่เปิดอยู่ / พื้นที่ลงหน้างาน = ไม่มีปุ่มสักไฟล์
  const files = {
    requestFiles: [{ id: 'A-1', docType: 'spec', fileName: 'แปลนชั้น 1.jpg', mimeType: 'image/jpeg', fileUrl: 'https://drive.example/a' }],
    threadFiles: [{ updateId: 'U-1', index: 0, fileName: 'แปลน.pdf', mimeType: 'application/pdf' }],
  };
  const drawing = MIXED_ROWS[2];
  const head = surveySalesDrawingsView({ ...files, zone: drawing, editable: true });
  assert.equal(head.files.length, 2);
  assert.equal(head.files[0].reuse.enabled, true);
  assert.equal(head.files[1].reuse.enabled, false, 'PDF ลงเอกสารไม่ได้ — ปุ่มโชว์พร้อมเหตุ');
  assert.deepEqual(head.files[0].ref, { kind: 'request', attachmentId: 'A-1' });
  for (const view of [
    surveySalesDrawingsView({ ...files, zone: drawing, editable: false }),
    surveySalesDrawingsView({ ...files, zone: null, editable: true }),
    surveySalesDrawingsView({ ...files, zone: MIXED_ROWS[0], editable: true }),
  ]) assert.equal(view.files.every((f) => f.reuse === null), true);
});

test('ใช้รูปของฝ่ายขายเป็นภาพแบบ: ผ่านตัวช่วยฝั่งเบราว์เซอร์ตัวเดียว · สำเร็จ = ช่องภาพแบบอ่านใหม่ + อ่านใบใหม่ · ล้ม = toast ด้วยประโยคที่ได้กลับมา', () => {
  const fn = between(PAGE, 'const reusePlan = async', 'const submitDeskDue = async');
  assert.match(fn, /if \(reuseBusyKey \|\| !file\?\.ref\) return;\s*setReuseBusyKey\(file\.key\);/, 'กดได้ทีละไฟล์');
  assert.match(fn, /const out = await reuseSalesFileAsPlan\(\{ requestId: id, zoneId, ref: file\.ref \}\);/);
  /* 🐞 review S2b — ล้ม ≠ ไม่มีอะไรถูกเขียน (คำตอบของเส้นแนบหาย · 409 = ใบที่ถืออยู่เก่า) ⇒ ช่องภาพแบบกับใบอ่านใหม่ทุกครั้ง */
  assert.match(fn, /if \(!out\.ok\) \{\s*setToast\(\{ kind: "error", msg: out\.error \}\);\s*setPlanReloadKey\(\(n\) => n \+ 1\);\s*await load\(\{ background: true \}\);\s*return;\s*\}/);
  assert.match(fn, /setPlanReloadKey\(\(n\) => n \+ 1\);\s*setToast\(\{ kind: "success", msg: "ใช้รูปนี้เป็นภาพแบบแล้ว" \}\);\s*await load\(\{ background: true \}\);/);
  assert.match(fn, /finally \{\s*setReuseBusyKey\(null\);/);
  assert.doesNotMatch(PAGE, /plan-from-sales|surveyPlanCopy/, 'หน้าไม่ยิงเส้นคัดลอกเอง — ลำดับสองจังหวะ (คัดลอก → แนบ → ถอยเมื่อแนบล้ม) อยู่ที่ตัวช่วย');
});

/* ══ ⑤ เพิ่มพื้นที่บนใบงานโต๊ะ ═════════════════════════════════════════════════════════════════════════ */

test('🔴 ใบงานโต๊ะ: ด่านเพิ่มพื้นที่ถามแค่ "เป็นหัวหน้าไหม" (ไม่ถาม canWrite) · ผู้วางคิวได้ประโยคของ server ตรงที่ปุ่มเคยอยู่ · ใบที่ยังต้องมีนัด = ด่านเดิม', () => {
  assert.match(PAGE, /const deskSheet = view\.needsVisit === false;/);
  const gate = between(PAGE, 'const addGate = ', 'const fixedGate = ');
  assert.match(gate, /^const addGate = deskSheet\s*\? \(canDecide \? surveyEditLockError\(data\?\.request\) : ADD_HEAD_ONLY\)\s*: surveyAddZoneError\(data\?\.request, \{ canWrite: data\?\.canWrite === true \}\);/);
  assert.doesNotMatch(gate.slice(0, gate.indexOf(': surveyAddZoneError(')), /canWrite/, 'กิ่งงานโต๊ะไม่ถาม canWrite — หัวหน้าที่เขียนผลวัดไม่ได้ก็เพิ่มได้');
  // ค่าของด่านถูกถามแค่ "มีหรือไม่มี" — ไม่มีที่ไหนพิมพ์มัน
  assert.equal((PAGE.match(/\bADD_HEAD_ONLY\b/g) || []).length, 2, 'ประกาศ 1 · ใช้ 1 (ชื่อ SURVEY_DESK_ADD_HEAD_ONLY เป็นอีกคำ ไม่นับ)');
  for (const use of PAGE.match(/[^\n]*\baddGate\b[^\n]*/g).slice(1)) assert.match(use, /!addGate|addGate \?/, use.trim());

  assert.match(PAGE, /addBlockedNote=\{planReader && view\.needsVisit === false && !view\.flags\.locked \? SURVEY_DESK_ADD_HEAD_ONLY : null\}/);
  assert.match(PAGE, /import \{\s*SURVEY_DESK_ADD_HEAD_ONLY, SURVEY_METHOD_ERRORS, SURVEY_METHOD_RESULT_DATE_LABEL,\s*\} from "@\/lib\/service\/surveyMethodSwitch";/);
  assert.equal(PAGE.includes(SURVEY_DESK_ADD_HEAD_ONLY), false, 'ประโยคมาจากค่าคงที่ตัวเดียวกับที่ server ตอบ — หน้าไม่พิมพ์ซ้ำ');
  assert.equal(count(PAGE, 'SURVEY_DESK_ADD_HEAD_ONLY'), 2, 'import 1 · ใช้ 1 (ใต้ `planReader`)');

  // คำของปุ่ม/กล่อง: งานโต๊ะ = "เพิ่มพื้นที่" + ป้าย "เพิ่มโดย {ฝ่าย}" · ใบที่ยังต้องมีนัด = คำเดิมทั้งชุด
  const words = between(PAGE, 'const addWords = deskSheet', 'const visitBadge');
  assert.match(words, /label: "เพิ่มพื้นที่",\s*detail: `ฝ่ายขายจะเห็นป้าย “เพิ่มโดย \$\{req\.dept \|\| "TS"\}” บนแถวนี้ — ไม่ต้องขออนุมัติก่อน`,/);
  assert.match(words, /label: "เพิ่มพื้นที่ที่เจอหน้างาน",\s*detail: "ฝ่ายขายจะเห็นป้าย “เจ้าหน้าที่เพิ่มหน้างาน” บนแถวนี้ — ไม่ต้องขออนุมัติก่อน",/);
  assert.match(PAGE, /addLabel=\{deskSheet \? addWords\.label : null\}/, 'ไม่ส่ง = คำเดิมของรายการ');
  assert.match(PAGE, /title=\{addWords\.label\}\s*message="พื้นที่นี้จะเข้าทะเบียนของลูกค้าทันทีพร้อมรหัส และเข้าไปอยู่ในผลที่ส่งให้ฝ่ายขาย"\s*detail=\{addWords\.detail\}/);

  // ตัวตัดสิน: ใบลงหน้างานล้วน/ผสมยังต้องมีนัด · จากแบบทั้งใบ = งานโต๊ะ
  assert.equal(sheet({ zones: ONSITE_ROWS, filesByZone: ONSITE_FILES }).needsVisit, true);
  assert.equal(sheet({ zones: MIXED_ROWS, filesByZone: MIXED_FILES }).needsVisit, true);
  assert.equal(sheet({ zones: DESK_ROWS, filesByZone: DESK_FILES }).needsVisit, false);
});

/* ══ ⑥ โมดัลส่งผลของใบที่มีพื้นที่จากแบบ ═════════════════════════════════════════════════════════════════ */

test('🔴 คำขอส่งผล: `methodMix` กับ `surveyConfirm` อยู่ใต้ `view.send.confirm.required` เท่านั้น — ใบลงหน้างานล้วนส่งคำขอเท่าเดิมทุกคีย์', () => {
  const send = between(PAGE, 'const send = async', 'const confirmSend = ');
  assert.match(send, /json: \{ closeVisitId: view\.send\.closesVisit\?\.id \?\? null, \.\.\.\(says \? \{ seenWarnings: seen \} : \{\}\), \.\.\.\(view\.send\.confirm\.required \? \{ methodMix: view\.send\.confirm\.mix, surveyConfirm: sendChoice \} : \{\}\) \},/);
  assert.equal((PAGE.match(/\bmethodMix\b/g) || []).length, 1);
  assert.equal((PAGE.match(/\bsurveyConfirm\b/g) || []).length, 1);

  const confirm = between(PAGE, 'const confirmSend = ', 'const recall = async');
  assert.match(confirm, /if \(view\.send\.confirm\.required && !sendChoice\) \{\s*setSendChoiceMissing\(true\);\s*return false;\s*\}\s*return send\(\);/,
    'ยังไม่เลือก = คืน false (กล่องยังเปิด ไม่มีคำขอ)');
  assert.doesNotMatch(confirm, /throw/, 'ของที่โยนออกจากปุ่มนี้ถูกจำเป็นการตีกลับของ server (`rememberSendRefusal`)');
  assert.doesNotMatch(between(PAGE, 'const send = async', 'const recall = async'), /kind: "error"/, 'ช่วง send → recall ไม่มี toast โทน error');
});

test('🔴 โมดัลส่งผล: ตัวตัดสินได้ `method` เฉพาะเมื่อการ์ดบอกว่าต้องถาม · ไม่มีคำตอบที่ถูกเลือกไว้ · ไทล์อยู่เหนือรายการผล · หัว/ขนาดเดิมเมื่อไม่มีไทล์', () => {
  assert.match(PAGE, /const \[sendChoice, setSendChoice\] = useState\(null\);/, 'ไม่มีค่าตั้งต้น');
  assert.match(PAGE, /useEffect\(\(\) => \{\s*setSendChoice\(null\);\s*setSendChoiceMissing\(false\);\s*\}, \[sending\]\);/, 'ล้างทุกครั้งที่โมดัลเปิด/ปิด');
  assert.match(PAGE, /const sendOpenVisit = data\?\.visit && OPEN_VISIT_STATES\.includes\(data\.visit\.status\)\s*\? \{ code: data\.visit\.code, status: data\.visit\.status \} : null;/);
  assert.match(PAGE, /const OPEN_VISIT_STATES = \["draft", "scheduled", "in_progress"\];/);
  assert.match(PAGE, /const sendMethod = view\.send\.confirm\.required\s*\? \{ mix: view\.mix, confirm: sendChoice, openVisit: sendOpenVisit \} : null;/,
    '`view.mix` (มี mode) ไม่ใช่ `view.send.confirm.mix`');
  // ตัวตัดสินได้ทั้งสองอย่างในคำเรียกเดียว: `signers` (ลายเซ็นจริง · PR-SIG ของ main) แล้ว `method` (งวด S2b) — งวด S3: ใบที่มีพื้นที่จากแบบได้ข้อลายเซ็นเหมือนใบลงหน้างาน (เอกสารไม่ถูกพักแล้ว)
  assert.match(PAGE, /documentUnknown: view\.send\.documentUnknown,\s*signers: view\.send\.signers,\s*method: sendMethod,\s*sendBackPending: view\.send\.sendBackPending,/);
  assert.equal((PAGE.match(/signers: view\.send\.signers,/g) || []).length, 1, 'ส่ง `signers` ครั้งเดียว');
  assert.equal((PAGE.match(/method: sendMethod,/g) || []).length, 1, 'ส่ง `method` ครั้งเดียว');
  // เลือกแล้วเก็บในหน้าอย่างเดียว — ไม่มีคำขอไหนถูกยิงจากการเลือก
  assert.match(PAGE, /const pickSendChoice = \(value\) => \{\s*setSendChoice\(value\);\s*setSendChoiceMissing\(false\);\s*\};/);
  assert.equal((PAGE.match(/setSendChoice\(/g) || []).length, 2, 'ล้าง 1 · เลือก 1');

  const at = PAGE.indexOf('title="ส่งผลประเมินให้ฝ่ายขาย"');
  assert.ok(at !== -1, 'หัวตั้งต้นคงเป็นตัวหนังสือบนแท็ก (เทสต์เดิมสามไฟล์หากล่องนี้จากบรรทัดนี้)');
  const dialog = PAGE.slice(at, PAGE.indexOf('</ConfirmDialog>', at));
  assert.match(dialog, /^title="ส่งผลประเมินให้ฝ่ายขาย"\s*\{\.\.\.sendTitle\}\s*size=\{sendConfirm\.choice \? "md" : "sm"\}/);
  assert.match(PAGE, /const sendTitle = sendConfirm\.title \? \{ title: sendConfirm\.title \} : null;/, 'ไม่มีหัวของใบจากแบบ = ไม่ทับหัวตั้งต้น');
  assert.match(dialog, /onConfirm=\{view\.send\.allowed \? confirmSend : undefined\}/);
  assert.match(PAGE, /const sendChoiceOptions = sendConfirm\.choice\s*(?:\/\*[^*]*\*\/\s*)?\? sendConfirm\.choice\.options\.map\(\(\{ value, label, hint \}\) => \(\{ value, label, description: keepPhrases\(hint, surveyCardUnits\(hint, SEND_TILE_UNITS\)\) \}\)\)\s*: \[\];/);
  // UAT S2b รอบสอง (S05 · 375): คำกำกับไทล์ขาดกลาง "“รอ / ยืนยันหน้างาน”" · "ฝ่าย / ขาย" · "ใบยืนยันหน้า / งาน" ⇒ ห่อชิ้น
  assert.match(PAGE, /const SEND_TILE_UNITS = \["ใบยืนยันหน้างาน", "ขอยืนยันหน้างาน"\];/);
  const [tiles] = jsxOpenTags(dialog, /<OptionTiles\b/g);
  assert.ok(tiles, 'ชุดเล็กตายตัว = ไทล์ ไม่ใช่ดรอปดาวน์');
  for (const prop of [
    /options=\{sendChoiceOptions\}/, /value=\{sendChoice\}/, /onChange=\{pickSendChoice\}/, /invalid=\{sendChoiceMissing\}/,
    /disabled=\{sendBusy\}/, /ariaLabel=\{sendConfirm\.choice\.question\}/,
  ]) assert.match(tiles, prop);
  assert.match(dialog, /\{sendConfirm\.choice\.question\}<span className="required-mark" aria-hidden="true"> \*<\/span>/, 'ดอกจันบรรทัดเดียวกับป้าย');
  assert.match(dialog, /\{sendChoiceMissing \? \(\s*<p className=\{styles\.fieldError\} role="alert">\{sendConfirm\.choice\.missing\}<\/p>\s*\) : null\}/);
  assert.match(dialog, /\{sendConfirm\.choice\.pendingNote \? \(\s*<p className=\{styles\.fieldNote\}>\{thaiText\(sendConfirm\.choice\.pendingNote\)\}<\/p>\s*\) : null\}/);
  assert.match(dialog, /\{sendConfirm\.choice \? \(/, 'ไทล์ขึ้นจากผลของตัวตัดสิน — ไม่มี = ไม่มีไทล์');
  assert.ok(dialog.indexOf('<OptionTiles') < dialog.indexOf('sendConfirm.effects.map('), 'ไทล์อยู่เหนือรายการผล (ม็อก B3)');
  assert.doesNotMatch(dialog, /<select|<Select\b|SearchableSelect/);
  for (const text of [SURVEY_CONFIRM_MISSING, 'ต้องเข้ายืนยันหน้างานภายหลังไหม', 'ต้องยืนยันหน้างาน']) {
    assert.equal(PAGE.includes(`"${text}"`), false, `"${text}" เป็นคำของตัวตัดสิน — หน้าไม่พิมพ์เอง`);
  }
});

test('ตัวตัดสินของโมดัลส่งผล: ใบลงหน้างานล้วน = สองคีย์เดิม · ใบที่มีพื้นที่จากแบบ = หัว + ไทล์สองใบที่ยังไม่ถูกเลือก · เลือกแล้วรายการผลเปลี่ยน', () => {
  const plain = sheet({ zones: ONSITE_ROWS, filesByZone: ONSITE_FILES });
  assert.equal(plain.send.confirm.required, false);
  assert.deepEqual(Object.keys(surveySendConfirm({ docNo: 'RQ-AS-26100352', closesVisit: null, method: null })).sort(), ['confirmLabel', 'effects']);

  const desk = sheet({ zones: DESK_ROWS, filesByZone: DESK_FILES });
  assert.equal(desk.send.confirm.required, true);
  assert.deepEqual(desk.send.confirm.mix, { onsite: 0, drawing: 2 }, 'ก้อนที่ส่งกลับ route ไม่มีโหมด');
  assert.equal(desk.mix.mode, 'drawing');
  const ask = (confirm) => surveySendConfirm({
    docNo: 'RQ-AS-26100352', closesVisit: null, method: { mix: desk.mix, confirm, openVisit: null },
  });
  const blank = ask(null);
  assert.equal(blank.title, 'ส่งผลประเมินจากแบบให้ฝ่ายขาย');
  assert.equal(blank.choice.value, null, 'ไม่เลือกให้ล่วงหน้า');
  assert.equal(blank.choice.missing, SURVEY_CONFIRM_MISSING);
  assert.deepEqual(blank.choice.options.map((o) => o.value), ['needed', 'not_needed']);
  for (const option of blank.choice.options) assert.ok(option.label && option.hint, 'ไทล์มีคำกำกับ');
  assert.ok(blank.choice.pendingNote, 'จนกว่าปุ่มของฝ่ายขายจะมีจริง — บรรทัดใต้ไทล์กันหัวหน้ารับปากแทน');
  const needed = ask('needed');
  const final = ask('not_needed');
  assert.equal(needed.effects.length, blank.effects.length + 1, 'ข้อป้ายบนทะเบียนขึ้นหลังเลือกเท่านั้น');
  assert.notDeepEqual(needed.effects, final.effects);
  assert.equal(sheet({ zones: MIXED_ROWS, filesByZone: MIXED_FILES }).send.confirm.required, true, 'ใบผสมก็ต้องถาม');
});

/* ══ ⑦ หัวหน้าตัดพื้นที่ลงหน้างานสุดท้ายขณะนัดยังเปิด ═══════════════════════════════════════════════════════ */

test('🔴 กล่อง "ตัดพื้นที่และยกเลิกนัด" เปิดได้ทางเดียว: เส้นตัดตอบรหัส `survey_flip_confirm` · เนื้อกล่องคัดลอกจากคำตอบ · เลขการกดใหม่ทุกครั้งที่เปิด', () => {
  assert.match(PAGE, /const FLIP_CONFIRM_CODE = "survey_flip_confirm";\s*const FLIP_RETRY_CODE = "survey_flip_retry";/);
  const cut = between(PAGE, 'const cutZone = async', 'const openFlipBox = ');
  assert.match(cut, /json: \{ status: "cut", cutReason: cutReason\.trim\(\) \}/, 'รอบแรกยังเป็นคำขอเดิม (ไม่พ่วงอะไร)');
  assert.match(cut, /catch \(e\) \{\s*if \(e\.data\?\.code === FLIP_CONFIRM_CODE && e\.data\?\.flip\) \{\s*openFlipBox\(cutting, cutReason\.trim\(\), e\.data\.flip\);\s*return;\s*\}\s*setCutError\(/,
    'แยกด้วย code ไม่เทียบประโยค · ไม่ขึ้นเป็นข้อผิดพลาดของกล่องเหตุผล');
  assert.equal(count(PAGE, 'openFlipBox('), 1, 'ผู้เรียกเดียว — ใต้รหัสนั้น');
  assert.equal(count(PAGE, 'FLIP_CONFIRM_CODE'), 2);

  const open = between(PAGE, 'const openFlipBox = ', 'const setFlipDate = ');
  for (const key of [
    /zoneId: zone\.id,/, /title: `ตัด \$\{surveyZoneTitle\(zone\)\} ออกจากใบนี้`,/,
    /message: `พื้นที่สุดท้ายที่ต้องวัด และนัด \$\{flip\.visit\?\.code \|\| flip\.visit\?\.id\} ยังเปิดอยู่ — ตัดออกได้ โดยนัดจะถูกยกเลิกไปด้วย`,/,
    /lines: textLines\(flip\.lines\),/, /needsDate: flip\.needs\?\.resultDate === true,/, /confirmLabel: flip\.confirmLabel,/,
    /visitId: flip\.visit\?\.id \?\? null,/, /resultDate: flip\.defaults\?\.resultDate \|\| "",/, /actionId: newSurveyActionId\(\),/,
  ]) assert.match(open, key);
  assert.doesNotMatch(PAGE, /ตัดพื้นที่และยกเลิกนัด"|"ตัดพื้นที่และยกเลิกนัด/, 'ป้ายปุ่มมาจากคำตอบของ server');

  // กล่องเหตุผลหลบระหว่างกล่องยืนยันเปิด (พื้นที่กับเหตุผลยังถืออยู่) · ปิดกล่องยืนยัน = เลิกตัด
  assert.match(PAGE, /<ReasonDialog\s+open=\{!!cutting && !flipBox\}/);
  assert.match(PAGE, /const closeFlipBox = \(\) => \{\s*setFlipBox\(null\);\s*setCutting\(null\);\s*setCutReason\(""\);\s*\};/);
  const at = PAGE.indexOf('open={!!flipBox}');
  const dialog = PAGE.slice(PAGE.lastIndexOf('<ConfirmDialog', at), PAGE.indexOf('</ConfirmDialog>', at));
  assert.equal(count(PAGE, 'open={!!flipBox}'), 1);
  for (const prop of [
    /tone="warning"/, /title=\{flipBox\?\.title\}/, /message=\{flipBox\?\.message\}/,
    /confirmLabel=\{flipBox\?\.dead \? "ปิด" : flipBox\?\.confirmLabel\}/, /hideCancel=\{flipBox\?\.dead === true\}/, /busy=\{flipBusy\}/,
    /onConfirm=\{flipBox && !flipBox\.dead \? confirmFlipCut : undefined\}/, /onClose=\{\(\) => !flipBusy && closeFlipBox\(\)\}/,
    // มติเจ้าของ head-r3-1: ปุ่มเงียบข้าง "ตัดพื้นที่และยกเลิกนัด" = "ปิด" (ค่าตั้งต้นของ ConfirmDialog คือ "ยกเลิก" — กดผิดปุ่มเดียวนัดหาย)
    /cancelLabel="ปิด"/,
  ]) assert.match(dialog, prop);
  assert.doesNotMatch(dialog, /cancelLabel=\{|cancelLabel="ยกเลิก"/, 'ไม่สลับคำตามรูปของกล่อง (head-r3-1)');
  assert.match(dialog, /<p className=\{styles\.effectsTitle\}>กดแล้วเกิดขึ้นทันที<\/p>\s*<ul className=\{styles\.effectList\}>\s*\{flipBox\.lines\.map\(\(line\) => <li key=\{line\}>\{thaiText\(line\)\}<\/li>\)\}/,
    'บอกผลทุกข้อก่อนกด — ชุดคลาสเดียวกับโมดัลส่งผล');
  assert.match(dialog, /\{flipBox\.needsDate \? \(/);
  assert.match(dialog, /\{SURVEY_METHOD_RESULT_DATE_LABEL\}<span className="required-mark" aria-hidden="true"> \*<\/span>/);
  const [date] = jsxOpenTags(dialog, /<DateInput\b/g);
  for (const prop of [/value=\{flipBox\.resultDate\}/, /onChange=\{setFlipDate\}/, /\brequired\b/, /\bweekday\b/, /disabled=\{flipBusy \|\| flipBox\.pinned\}/, /invalid=\{flipBox\.dateMissing\}/]) {
    assert.match(date, prop);
  }
  assert.equal(PAGE.includes(`"${SURVEY_METHOD_RESULT_DATE_LABEL}"`), false);
});

test('🔴 ยืนยันตัดที่พลิกใบ: body = สถานะ + เหตุผล + `flip` · "บันทึกไม่ครบ" คงเลขการกดเดิมและไม่ปิดกล่อง · แก้วัน = เลขใหม่ · 409 อื่น = เหลือปุ่มปิด', () => {
  const fn = between(PAGE, 'const confirmFlipCut = async', 'const restoreZone = async');
  assert.match(fn, /method: "PATCH",\s*json: \{\s*status: "cut",\s*cutReason: box\.reason,\s*flip: \{ actionId: box\.actionId, committedResultDate: box\.resultDate, cancelVisitId: box\.visitId \},\s*\},/);
  assert.doesNotMatch(fn, /newSurveyActionId\(/, 'กดซ้ำด้วย body เดิม = เลขเดิม (server กันซ้ำด้วยเลขนี้)');
  assert.doesNotMatch(fn, /retry: true/);
  /* 🐞 UAT S2b S08 — เดิมโยน error เข้ากล่อง: ประโยคแดงค้างอยู่หลังพิมพ์วันแล้ว (กล่องล้างเฉพาะตอนกดรอบถัดไป)
     ⇒ คืน false (กล่องไม่ปิด ไม่ยิง) และประโยคเดียวกับ server ขึ้นใต้ช่อง ผูกกับ `dateMissing` ที่ `setFlipDate` ล้างเอง */
  assert.match(fn, /if \(box\.needsDate && !box\.resultDate\) \{\s*setFlipBox\(\(prev\) => \(prev \? \{ \.\.\.prev, dateMissing: true \} : prev\)\);\s*return false;\s*\}/,
    'ช่องวันว่าง = ประโยคเดียวกับ server ในกล่อง ไม่ยิงไปให้ถูกตีกลับ');
  assert.doesNotMatch(fn, /throw new Error\(/);
  assert.match(PAGE, /\{flipBox\.dateMissing \? \(\s*<p className=\{styles\.fieldError\} id="survey-flip-result-date-error" role="alert">\{SURVEY_METHOD_ERRORS\.resultDate\}<\/p>\s*\) : null\}/);
  assert.match(fn, /catch \(e\) \{\s*if \(e\.data\?\.code === FLIP_RETRY_CODE\) \{\s*setFlipBox\(\(prev\) => \(prev \? \{ \.\.\.prev, pinned: true \} : prev\)\);\s*void load\(\{ background: true \}\);\s*\} else if \(e\.status === 409\) \{\s*setFlipBox\(\(prev\) => \(prev \? \{ \.\.\.prev, dead: true \} : prev\)\);\s*void load\(\{ background: true \}\);\s*\}\s*throw e;\s*\}/,
    'ทุกทางที่ล้ม = โยนให้กล่องบอก (ไม่ใช่ toast) · บันทึกไม่ครบ: อ่านใบเบื้องหลังแต่กล่องไม่เปลี่ยน');
  assert.doesNotMatch(fn, /kind: "error"/);
  assert.match(fn, /closeFlipBox\(\);\s*setToast\(\{ kind: "success", msg: "ตัดพื้นที่ออกแล้ว — เอากลับเข้าใบได้จากเมนูบนหัวพื้นที่" \}\);\s*await load\(\{ background: true \}\);/);
  /* 🐞 review S2b — หลัง "บันทึกไม่ครบ" กล่องถูกตรึงที่ body เดิม (`pinned`): แก้วันไม่ได้ ⇒ ไม่มีทางได้เลขการกดใหม่
     (server พิสูจน์ว่าการกดนี้เป็นคนยกเลิกนัดด้วยเลขเดิม) · เปิดกล่องใหม่ = ยังไม่ตรึง */
  assert.match(PAGE, /dead: false,\s*pinned: false,\s*\}\);/);
  assert.equal(count(PAGE, 'pinned: true'), 1, 'ตรึงได้ทางเดียว: คำตอบ survey_flip_retry');
  /* 🐞 UAT S2b S08 — บรรทัดผลพูดวันส่งผลของตอนเปิดกล่อง: แก้วัน = คิดบรรทัดใหม่จากแผนตัวเดียวกับ server (`basis` = ชุดอินพุตที่
     ให้บรรทัดตรงกับของ server ทุกตัวอักษรตอนเปิด · ไม่ตรง = null ⇒ บรรทัดของ server ตามเดิม) */
  assert.match(PAGE, /const setFlipDate = \(value\) => setFlipBox\(\(prev\) => \(prev && !prev\.pinned\s*\? \{ \.\.\.prev, resultDate: value, dateMissing: false, actionId: newSurveyActionId\(\), lines: prev\.basis \? surveyFlipLinesAt\(prev\.basis, value\) : prev\.lines \}\s*: prev\)\);/);
  assert.match(DIALOG, /export function surveyFlipBasis\(input, flip\) \{\s*const sent = planLines\(flip\?\.lines\);\s*const mine = surveyFlipLinesAt\(input, flip\?\.defaults\?\.resultDate\);\s*return mine\.length === sent\.length && mine\.every\(\(line, i\) => line === sent\[i\]\) \? input : null;\s*\}/);
  assert.match(PAGE, /basis: surveyFlipBasis\(\{\s*rows: data\?\.zones \|\| \[\], cut: \{ zoneId: zone\.id, to: "cut" \}, visit: data\?\.visit \|\| null,\s*request: data\?\.request \|\| null, sendBack: data\?\.sendBack, reason,\s*\}, flip\),/);
  // เขียน `flipBox` ที่ไม่ใช่ null ได้สามจุด: เปิด · แก้วัน · ธงในกล่อง (สองจุดหลังต้องมีกล่องอยู่ก่อน)
  assert.equal(count(PAGE, 'setFlipBox({'), 1);
  assert.equal(count(PAGE, 'newSurveyActionId('), 2, 'เปิดกล่อง · แก้วัน');
});

/* 🐞 review S2b — ปุ่ม "ตัดพื้นที่นี้ออก" ของพื้นที่จากแบบไม่เล่าเรื่องหน้างานแล้ว (กลุ่ม B) แต่กล่องที่ปุ่มเปิดยังบอกว่า
   "เข้าห้องนี้ไม่ได้ หรือไม่ต้องวัด" — ใบงานโต๊ะไม่มีใครไปถึงห้อง ⇒ พื้นที่จากแบบเหลือบรรทัดผล (`detail`) · ลงหน้างานคำเดิม */
test('กล่องเหตุผลตัดพื้นที่: พื้นที่จากแบบไม่มีประโยคหน้างาน · พื้นที่ลงหน้างานคำเดิมทุกตัวอักษร', () => {
  const [dialog] = jsxOpenTags(PAGE, /<ReasonDialog\s+open=\{!!cutting && !flipBox\}/g);
  assert.match(dialog, /description=\{cutting && isDrawingZone\(cutting\)\s*\? undefined : "เข้าห้องนี้ไม่ได้ หรือไม่ต้องวัด — ตัดได้โดยไม่ต้องมีขนาดหรือรูป"\}/);
  assert.match(dialog, /detail="ฝ่ายขายจะเห็นเหตุผลนี้ · เอากลับเข้าใบได้"/);
  assert.equal(count(PAGE, 'เข้าห้องนี้ไม่ได้ หรือไม่ต้องวัด'), 1);
  assert.match(PAGE, /import \{ isDrawingZone \} from "@\/lib\/service\/surveyMethod";/, 'ถามตัวตัดสิน ไม่อ่านคอลัมน์วิธีเอง');
  assert.doesNotMatch(PAGE, /cutting\??\.method\b/);
});

/* ══ ⑧ บันทึกการเคาะที่ชนรุ่นของแถว ════════════════════════════════════════════════════════════════════ */

test('บันทึกการเคาะล้ม: รหัสของคำตอบไปถึงตารางในค่าที่คืน · ชนรุ่นของแถวไม่ toast ซ้ำ (ตารางพิมพ์ประโยคนั้นบนแถว)', () => {
  const fn = between(PAGE, 'const saveDecisions = async', 'const startVisit = async');
  assert.match(fn, /failure = \{ zoneId: String\(zoneId\), message: e\.message, code: e\.data\?\.code \?\? null \};/);
  /* 🐞 review S2b — ใบลงหน้างานล้วนต้องเหมือนเดิมทุกจุด (toast + บรรทัดรวม): งด toast เฉพาะใบที่มีพื้นที่จากแบบ — เงื่อนไขเดียวกับตาราง */
  assert.match(fn, /if \(failure\) \{\s*const staleOnRow = failure\.code === SURVEY_ZONE_STALE_CODE && view\.mix\.drawing > 0;\s*if \(!staleOnRow\) setToast\(\{ kind: "error", msg: failure\.message \}\);\s*\} else \{/);
  assert.match(read('../../components/service/SurveyResultTable.js'), /failure\?\.code === SURVEY_ZONE_STALE_CODE && failure\.zoneId && \(mix\?\.drawing \|\| 0\) > 0/);
  assert.match(fn, /return \{ savedIds, failure \};/);
  assert.equal(SURVEY_ZONE_STALE_CODE, 'zone_stale');
  assert.doesNotMatch(PAGE, /"zone_stale"|saveFailure=/, 'ไม่มี prop แยก · ไม่พิมพ์รหัสเอง');
  const [table] = jsxOpenTags(PAGE, /<SurveyResultTable\b/g);
  for (const prop of [/\bmix=\{view\.mix\}/, /\brequest=\{req\}/, /\blocked=\{view\.flags\.locked\}/]) assert.match(table, prop);
});

/* ══ ⑨ ปุ่มเปลี่ยนวิธี + โมดัล ═════════════════════════════════════════════════════════════════════════ */

test('🔴 ปุ่ม "เปลี่ยนวิธีประเมิน": กดได้เสมอ ติดด่าน = เหตุของตัวตัดสิน · โมดัลถูกเมานต์เฉพาะคนที่มีปุ่ม · เปิดแล้วอ่านใบใหม่ · สำเร็จ = toast + อ่านใบใหม่', () => {
  assert.match(PAGE, /onSwitchMethod=\{switchMethod\}\s*deskDue=\{deskDue\}/);
  assert.match(PAGE, /const switchMethod = \(\) => \(view\.method\.allowed\s*\? openMethodDialog\(\)\s*: setToast\(\{\s*kind: "warning", msg: view\.method\.reason,\s*\.\.\.\(view\.method\.reason === SURVEY_METHOD_ERRORS\.notAcknowledged && view\.flags\.canOpenRequest\s*\? \{ action: \{ label: "เปิดหน้าคำร้อง", onClick: \(\) => router\.push\(`\/requests\/\$\{id\}`\) \} \} : \{\}\),\s*\}\)\);/,
    'head-r3-8: ยังไม่รับเรื่อง = toast มีปุ่มพาไปหน้าคำร้อง (เฉพาะคนที่ server ให้เปิดหน้าคำร้องได้) · เหตุอื่นไม่มีปุ่ม');
  assert.match(PAGE, /const openMethodDialog = \(\) => \{\s*setMethodOpen\(true\);\s*load\(\{ background: true \}\);\s*\};/);
  assert.equal(count(PAGE, 'setMethodOpen(true)'), 1, 'เปิดได้ทางเดียว — ผ่าน `view.method.allowed`');
  assert.equal(count(PAGE, 'openMethodDialog()'), 1);
  for (const text of [SURVEY_METHOD_ERRORS.notAcknowledged, SURVEY_METHOD_ERRORS.sentButton, SURVEY_METHOD_BUTTON]) {
    assert.equal(PAGE.includes(text), false, 'เหตุสองข้อและคำบนปุ่มเป็นของตัวตัดสิน/การ์ด — หน้าไม่พิมพ์เอง');
  }

  assert.match(PAGE, /\{view\.method\.show \|\| methodOpen \? \(\s*<SurveyMethodDialog\b/, 'สวิตช์ปิด / ไม่ใช่หัวหน้า = ไม่มีโมดัลในต้นไม้เลย');
  const [tag] = jsxOpenTags(PAGE, /<SurveyMethodDialog\b/g);
  assert.equal(jsxOpenTags(PAGE, /<SurveyMethodDialog\b/g).length, 1);
  for (const prop of [
    /open=\{methodOpen\}/, /requestId=\{id\}/, /request=\{req\}/, /zones=\{zones\}/, /visit=\{visit\}/,
    // "ใบเคยเข้าพื้นที่แล้วไหม" ของ GET — แผนในโมดัลถามเรื่องเดียวกับ route (นัดถึงไซต์แล้วตามด้วยนัดซ้ำที่ถูกยกเลิก · รีวิว 12/10)
    /siteReached=\{data\?\.siteVisitReached \?\? null\}/,
    /sendBack=\{data\?\.sendBack \|\| null\}/, /subtitle=\{methodSubtitle\}/, /onClose=\{closeMethodDialog\}/,
    /onDone=\{methodDone\}/, /onStale=\{reloadSheet\}/,
  ]) assert.match(tag, prop);
  /* 🐞 review S2b — ปิดโดยไม่ได้บันทึกก็อ่านใบใหม่: รอบที่ตอบ `partial` / คำตอบหาย เขียนฐานไปแล้วทั้งที่โมดัลยังให้กดซ้ำ */
  assert.match(PAGE, /const closeMethodDialog = \(\) => \{\s*setMethodOpen\(false\);\s*load\(\{ background: true \}\);\s*\};/);
  assert.match(PAGE, /const methodDone = \(\{ plan \} = \{\}\) => \{\s*setMethodOpen\(false\);\s*setToast\(\{ kind: "success", msg: plan\?\.kind === "cancel-only" \? "ยกเลิกนัดแล้ว" : "บันทึกวิธีประเมินแล้ว" \}\);\s*load\(\{ background: true \}\);\s*\};/,
    'หน้าไม่วาดจากคำตอบของ route — อ่านใบใหม่เสมอ');
  assert.match(PAGE, /const methodSubtitle = \[\s*headerView\.request\.docNo, headerView\.site\.name, visitFact\?\.value \? `นัด\\u00a0\$\{visitFact\.value\.split\(" · "\)\.join\(" "\)\}` : null,\s*\]\.filter\(Boolean\)\.join\(" · "\);/);
  assert.doesNotMatch(PAGE, /\/method`|surveyMethodSwitchPlan|retry: true/, 'เส้นสลับวิธีและแผนอยู่ในโมดัล — หน้าแค่เปิด/ปิด');

  // ตัวตัดสินของปุ่ม: ยังไม่รับเรื่อง / ส่งผลแล้ว = โชว์แล้วบอกเหตุ
  const pending = sheet({ request: request({ status: 'pending', acknowledgedAt: null }), zones: ONSITE_ROWS, filesByZone: ONSITE_FILES, drawingMethodEnabled: true });
  assert.deepEqual(pending.method, { show: true, allowed: false, reason: SURVEY_METHOD_ERRORS.notAcknowledged });
  const sent = sheet({ request: request({ status: 'answered', answeredAt: '2026-10-09T03:00:00.000Z' }), zones: ONSITE_ROWS, filesByZone: ONSITE_FILES, drawingMethodEnabled: true });
  assert.deepEqual(sent.method, { show: true, allowed: false, reason: SURVEY_METHOD_ERRORS.sentButton });
});

/* ══ ⑩ วันส่งผลของใบงานโต๊ะ ═══════════════════════════════════════════════════════════════════════════ */

test('วันส่งผลของงานโต๊ะ: แถวบนการ์ดมาจาก `deskDueAction` · โมดัลตัวเดียวกับหน้าคำร้อง (ทรงงานโต๊ะ) · ล้ม = toast กล่องยังเปิด', () => {
  assert.match(PAGE, /const deskRequest = \{ \.\.\.req, surveyNeedsVisit: view\.needsVisit \};\s*const deskAction = deskDueAction\(deskRequest, \{ canCommit: canDecide \}\);/);
  assert.match(PAGE, /const deskDue = deskAction \? \{\s*wish: commitDueLabels\(deskRequest\)\.wish,\s*label: deskAction\.label,\s*onClick: \(\) => setDeskDueDialog\(\{ mode: deskAction\.kind \}\),\s*\} : null;/);
  const tags = jsxOpenTags(PAGE, /<CommitDueDialog\b/g);
  assert.equal(tags.length, 1, 'หนึ่งหน้า หนึ่งโมดัล');
  for (const prop of [
    /open=\{!!deskDueDialog\}/, /request=\{\{ \.\.\.req, surveyNeedsVisit: false \}\}/, /mode=\{deskDueDialog\?\.mode\}/,
    /today=\{businessDate\(\)\}/, /busy=\{deskDueBusy\}/, /onClose=\{\(\) => !deskDueBusy && setDeskDueDialog\(null\)\}/, /onSubmit=\{submitDeskDue\}/,
  ]) assert.match(tags[0], prop);
  assert.doesNotMatch(tags[0], /technicians/, 'ทรงงานโต๊ะไม่มีตัวเลือกคน');
  const fn = between(PAGE, 'const submitDeskDue = async', 'const zones = useMemo(');
  assert.match(fn, /await apiJson\(`\/api\/sa\/requests\/\$\{id\}`, \{\s*method: "PATCH", json: payload, fallbackError: "บันทึกวันส่งผลไม่สำเร็จ",\s*\}\);/);
  assert.match(fn, /msg: mode === "reschedule" \? "เลื่อนวันแล้ว" : commitDueLabels\(\{ \.\.\.data\?\.request, surveyNeedsVisit: false \}\)\.okMsg,/);
  assert.match(fn, /catch \(e\) \{\s*setToast\(\{ kind: "error", msg: e\.message \}\);\s*\} finally \{\s*setDeskDueBusy\(false\);/, 'ล้ม = กล่องยังเปิดพร้อมของที่พิมพ์ · busy กลับเป็นเท็จ');
  assert.ok(PAGE.indexOf('const submitDeskDue = async') > PAGE.indexOf('const recall = async'), 'toast โทน error อยู่หลัง recall');
  assert.ok(PAGE.indexOf('const reusePlan = async') > PAGE.indexOf('const recall = async'));

  // ตัวตัดสิน: ใบที่ยังต้องมีนัด / คนที่ไม่ใช่หัวหน้า = ไม่มีแถว · งานโต๊ะ: ยังไม่รับปาก → รับปาก · รับปากแล้ว → เลื่อน
  const committed = request({ dueCommittedAt: '2026-10-08T03:00:00.000Z' });
  assert.equal(deskDueAction({ ...committed, surveyNeedsVisit: true }, { canCommit: true }), null);
  assert.equal(deskDueAction({ ...committed, surveyNeedsVisit: false }, { canCommit: false }), null);
  const open = deskDueAction({ ...request({ committedDueDate: null, committedResultDate: null }), surveyNeedsVisit: false }, { canCommit: true });
  assert.deepEqual(open, { kind: 'commit', label: 'รับปากวันส่งผล' });
  assert.equal(deskDueAction({ ...committed, surveyNeedsVisit: false }, { canCommit: true })?.label, 'เลื่อนวันส่งผล');
  assert.equal(commitDueLabels({ ...request({ requestedResultDate: '2026-10-12' }), surveyNeedsVisit: false }).wish.startsWith('ผู้ขอต้องการผล '), true);
  assert.equal(commitDueLabels({ ...request(), surveyNeedsVisit: true }).wish, null);
});

/* ══ ⑪ แท็บ · หัวงาน · ข้อความว่าง ═════════════════════════════════════════════════════════════════════ */

test('ชื่อแท็บแรก · ปุ่มกลับ · หัวงาน · ข้อความว่างของบานขวา มาจากตัวตัดสิน — ใบลงหน้างานล้วนได้คำเดิม', () => {
  assert.match(PAGE, /\{ key: "field", label: view\.fieldTabLabel \},\s*\{ key: "result", label: "สรุปส่งผล" \},/);
  assert.match(PAGE, /onClick=\{\(\) => goTab\("field"\)\}>\s*(?:\{\}\s*)?\{view\.fieldTabLabel\}\s*<\/Button>/);
  assert.doesNotMatch(PAGE, /label: "หน้างาน"|"ข้อมูลพื้นที่"/);
  assert.match(PAGE, /unknown: data\?\.unknown \|\| \{\},\s*method: \{ mix: view\.mix, needsVisit: view\.needsVisit \},\s*\}\);/);
  assert.match(PAGE, /\{listView\.emptyReason === "drawing" \? listView\.drawingNote\s*: zones\.length \? "ไม่มีพื้นที่ที่ต้องวัดแล้ว — พื้นที่ที่ตัดออกเปิดดูได้จากรายการ" : "ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน"\}/);

  assert.equal(sheet({ zones: MIXED_ROWS, filesByZone: MIXED_FILES }).fieldTabLabel, 'ข้อมูลพื้นที่');
  // หัวงาน: ไม่ส่ง / ใบลงหน้างานล้วน = ผลเดิมทุกคีย์ · ใบที่มีพื้นที่จากแบบ = ข้อแรกเป็น "วิธีประเมิน"
  const base = { request: request(), site: { id: 'SS-1', code: 'ST-1051', name: 'สำนักงานสาทร' }, visit: VISIT };
  const plain = sheet({ zones: ONSITE_ROWS, filesByZone: ONSITE_FILES });
  assert.deepEqual(
    surveyJobHeaderView({ ...base, method: { mix: plain.mix, needsVisit: plain.needsVisit } }),
    surveyJobHeaderView(base),
  );
  const mixed = sheet({ zones: MIXED_ROWS, filesByZone: MIXED_FILES });
  const header = surveyJobHeaderView({ ...base, method: { mix: mixed.mix, needsVisit: mixed.needsVisit } });
  assert.equal(header.facts[0].key, 'method');
  // บรรทัดบริบทของโมดัลเปลี่ยนวิธีอ่านสามชิ้นนี้จากหัวงาน
  assert.equal(header.request.docNo, 'RQ-AS-26100352');
  assert.equal(header.site.name, 'สำนักงานสาทร');
  assert.match(header.facts.find((fact) => fact.key === 'visit').value, /^SV-26100011 · /);
});

/* ══ ⑫ โมดัล "วิธีประเมินรายพื้นที่" ══════════════════════════════════════════════════════════════════════ */

test('🔴 โมดัลเปลี่ยนวิธี: ทุกคำของฟีเจอร์มาจาก `surveyMethodSwitch.js` — ไม่พิมพ์ซ้ำ · ไม่อ่านคอลัมน์วิธีของแถวเอง', () => {
  assert.match(DIALOG, /import \{\s*SURVEY_METHOD_CHIP, SURVEY_METHOD_ERRORS, SURVEY_METHOD_LABEL, SURVEY_METHOD_MODAL_TITLE, SURVEY_METHOD_REASON_CHIPS,\s*SURVEY_METHOD_REASON_LABEL, SURVEY_METHOD_REASON_MAX, SURVEY_METHOD_RESULT_DATE_LABEL, SURVEY_METHOD_SHORTCUTS,\s*surveyMethodErrorTexts, surveyMethodSwitchPlan,\s*\} from "@\/lib\/service\/surveyMethodSwitch";/);
  assert.match(DIALOG, /import \{ SURVEY_METHOD_DRAWING, SURVEY_METHOD_ONSITE, zoneMethod \} from "@\/lib\/service\/surveyMethod";/);
  const owned = [
    SURVEY_METHOD_MODAL_TITLE, SURVEY_METHOD_REASON_LABEL, SURVEY_METHOD_RESULT_DATE_LABEL, SURVEY_METHOD_CANCEL_ONLY_REASON,
    ...Object.values(SURVEY_METHOD_LABEL), ...Object.values(SURVEY_METHOD_SHORTCUTS), ...SURVEY_METHOD_REASON_CHIPS,
    ...Object.values(SURVEY_METHOD_ERRORS), 'บันทึกวิธีประเมิน"', 'ยกเลิกนัด"',
  ];
  for (const text of owned) assert.equal(DIALOG.includes(text), false, `โมดัลพิมพ์ "${text}" เอง`);
  assert.match(DIALOG, /title=\{SURVEY_METHOD_MODAL_TITLE\}/);
  assert.match(DIALOG, /\{SURVEY_METHOD_REASON_LABEL\}<span className="required-mark" aria-hidden="true"> \*<\/span>/);
  assert.match(DIALOG, /\{SURVEY_METHOD_RESULT_DATE_LABEL\}<span className="required-mark" aria-hidden="true"> \*<\/span>/);
  assert.match(DIALOG, /\{SURVEY_METHOD_SHORTCUTS\.onsite\}/);
  assert.match(DIALOG, /\{SURVEY_METHOD_SHORTCUTS\.drawing\}/);
  assert.match(DIALOG, /\{ value: SURVEY_METHOD_ONSITE, label: SURVEY_METHOD_LABEL\.onsite \},\s*\{ value: SURVEY_METHOD_DRAWING, label: SURVEY_METHOD_LABEL\.drawing \},/);
  assert.match(DIALOG, /\{busy \? "กำลังบันทึก…" : plan\.confirmLabel\}/, 'ป้ายปุ่มหลักเป็นของแผน');
  assert.match(DIALOG, /maxLength=\{SURVEY_METHOD_REASON_MAX\}/);
  assert.doesNotMatch(DIALOG, /\.method\b\s*[!=]==?|\.method\b(?!\s*\()/, 'ถามวิธีของแถวผ่าน `zoneMethod` เท่านั้น');
});

test('🔴 โมดัลเปลี่ยนวิธี: ผลบนจอมาจากแผนตัวเดียวกับ server · body ตามสัญญาของ route · เลขการกดใหม่เมื่อ body ต่าง · แยกคำตอบด้วย code', () => {
  assert.match(DIALOG, /const changes = active\s*\.filter\(\(zone\) => targetOf\(zone\) !== zoneMethod\(zone\)\)\s*\.map\(\(zone\) => \(\{ zoneId: keyOf\(zone\), method: targetOf\(zone\) \}\)\);/);
  assert.match(DIALOG, /const plan = surveyMethodSwitchPlan\(\{\s*rows, changes, visit: source\.visit, siteReached: source\.siteReached, request: source\.request, sendBack: source\.sendBack,\s*reason, resultDate,\s*\}\);/);
  assert.match(DIALOG, /const active = rows\.filter\(\(zone\) => !isCutRow\(zone\)\);/, 'พื้นที่ที่ตัดไม่อยู่ในรายการ (แผนยังเห็นครบทุกแถว)');
  assert.match(DIALOG, /const targetOf = \(zone\) => targets\[keyOf\(zone\)\] \?\? zoneMethod\(zone\);/, 'ถือเฉพาะที่หัวหน้าเลือกต่าง — แถวสดที่มาทีหลังไม่กลายเป็นการเปลี่ยนที่ไม่ได้เลือก');

  const submit = between(DIALOG, 'const submit = async', 'const blocker = ');
  assert.match(submit, /const body = \{\s*changes,\s*reason: reason\.trim\(\),\s*seenMix: plan\.before\.mix,\s*\.\.\.\(plan\.needs\.resultDate \? \{ committedResultDate: resultDate \} : \{\}\),\s*\.\.\.\(plan\.visit\.action === "cancel" \? \{ cancelVisitId: String\(plan\.visit\.id\) \} : \{\}\),\s*\};/);
  assert.match(submit, /const key = JSON\.stringify\(body\);\s*if \(sent\.current\.key !== key\) sent\.current = \{ key, id: newSurveyActionId\(\) \};/,
    'body เดิม = เลขเดิม · ต่างไป = เลขใหม่');
  assert.match(submit, /setHeld\(source\);/, 'หลังกดส่ง โมดัลถือแถวชุดที่ส่งไว้ — ใบที่อ่านใหม่เบื้องหลังไม่เปลี่ยน body ของการกดซ้ำ');
  assert.match(submit, /apiJson\(`\/api\/service\/surveys\/\$\{requestId\}\/method`, \{\s*method: "POST", json: \{ \.\.\.body, actionId: sent\.current\.id \}, retry: true, fallbackError: SAVE_FAILED,\s*\}\);/);
  assert.match(submit, /onDone\?\.\(\{ already: res\?\.already === true, plan: res\?\.plan \|\| \{ kind: plan\.kind \}, reload: true \}\);/);
  assert.match(submit, /catch \(e\) \{\s*setError\(e\.message \|\| SAVE_FAILED\);\s*if \(surveyMethodFailure\(e\)\.dead\) \{\s*setDead\(true\);\s*onStale\?\.\(\);\s*\}\s*\}/);
  assert.doesNotMatch(DIALOG, /e\.message ===|\.message\.includes\(|\.message\.startsWith\(/, 'ไม่เทียบประโยคของ server');
  assert.match(DIALOG, /const source = held \|\| \{ zones, visit, siteReached, request, sendBack \};/);
  // ปิดกล่อง = ล้างฟอร์มและเลขการกด (เปิดใหม่ = เลขใหม่)
  assert.match(DIALOG, /useEffect\(\(\) => \{\s*if \(open\) return;[\s\S]{0,360}sent\.current = \{ key: null, id: null \};[\s\S]{0,80}\}, \[open\]\);/);
  assert.doesNotMatch(DIALOG, /\bfetch\(|apiFetch\(|localStorage|sessionStorage/);
});

test('โมดัลเปลี่ยนวิธี: ปุ่มหลักบอกเหตุของแผนตอนกด + ช่องที่ติดขึ้นขอบแดง · ตัวเลือกวิธีเป็น radiogroup · ตัวเลือกเหตุผลเป็นปุ่มกดค้าง · ใบถูกแก้จากที่อื่น = ปุ่มเดียว', () => {
  assert.match(DIALOG, /const blocker = plan\.disabledReason \|\| plan\.errors\.join\(" · "\);/);
  /* (S2b แก้หลังตรวจจอ head-r3-4) ปุ่มหลักเป็นปุ่มธรรมดา — ติดด่าน = ไม่ยิง · เหตุอยู่ใต้ช่อง / ใต้ปุ่ม ไม่มี toast ซ้ำ
     ยามละเอียดของข้อนี้อยู่ที่ `components/service/surveyMethodDialog.test.mjs` */
  const [primary] = jsxOpenTags(DIALOG, /<Button\s+ref=\{primaryRef\}/g);
  for (const prop of [/tone="primary"/, /onClick=\{press\}/, /disabled=\{busy\}/]) {
    assert.match(primary, prop);
  }
  assert.doesNotMatch(DIALOG, /<GatedAction\b/);
  assert.match(DIALOG, /const press = \(\) => \{\s*setTried\(true\);\s*if \(blocker\) \{[\s\S]*?return;\s*\}\s*submit\(\);\s*\};/);
  assert.equal((DIALOG.match(/tone="primary"/g) || []).length, 2, 'ปุ่มหลักปุ่มเดียวต่อสภาพ: บันทึก (ปกติ) / ปิด (ใบถูกแก้จากที่อื่น)');
  assert.match(DIALOG, /\{dead \? \(\s*<Button ref=\{closeRef\} tone="primary" onClick=\{close\}>ปิด<\/Button>\s*\) : \(/);
  /* 🐞 review S2b — ช่องที่ขึ้นขอบแดงต้องตรงกับที่ toast พูด: วันที่ผิดรูปเคยถูกนับเป็น "เหตุผลขาด" (นับจำนวน error) */
  /* 🐞 UAT S2b S06 — ขอบแดงที่ไม่มีประโยคข้าง ๆ (toast หายไปเอง): ช่องได้ **ประโยคของเหตุ** จากลิสต์เดียวกับที่ toast พูด */
  assert.match(DIALOG, /const fieldErrors = surveyMethodErrorTexts\(plan\.errors\);/);
  assert.match(DIALOG, /const reasonOver = reason\.trim\(\)\.length > SURVEY_METHOD_REASON_MAX;\s*const reasonError = \(tried \|\| reasonOver\) \? fieldErrors\.reason : null;\s*const dateError = tried \? fieldErrors\.resultDate : null;/,
    'เหตุผลยาวเกิน (ตัวเลือกสำเร็จรูปเติมคำนำหน้าจนเกินได้) บอกทันที ไม่รอกดปุ่มหลัก');
  assert.doesNotMatch(DIALOG, /plan\.errors\.length/);
  {
    const toDrawing = ONSITE_ROWS.map((z) => ({ zoneId: z.id, method: 'drawing' }));
    const planOf = (extra) => surveyMethodSwitchPlan({
      rows: ONSITE_ROWS, changes: toDrawing, visit: VISIT, request: request(), sendBack: null, ...extra,
    });
    const errorsOf = (extra) => planOf(extra).errors;
    const good = 'ลูกค้าส่งแบบตกแต่งมาครบแล้ว';
    assert.deepEqual(surveyMethodErrorFields(errorsOf({ reason: good, resultDate: 'ไม่ใช่วัน' })), { reason: false, resultDate: true },
      'วันผิดรูป = ช่องวัน ไม่ใช่ช่องเหตุผล');
    assert.deepEqual(surveyMethodErrorFields(errorsOf({ reason: 'สั้น', resultDate: '' })), { reason: true, resultDate: true });
    assert.deepEqual(surveyMethodErrorFields(errorsOf({ reason: 'ก'.repeat(2000), resultDate: '2026-10-20' })), { reason: true, resultDate: false });
    assert.deepEqual(surveyMethodErrorFields(errorsOf({ reason: good, resultDate: '2026-10-20' })), { reason: false, resultDate: false });
    assert.deepEqual(surveyMethodErrorFields(null), { reason: false, resultDate: false });
    // ประโยคใต้ช่อง = ข้อของช่องนั้นในลิสต์ของแผน (คำเดียวกับ toast) · ไม่มีข้อ = null
    assert.deepEqual(surveyMethodErrorTexts(errorsOf({ reason: 'สั้น', resultDate: '' })),
      { reason: SURVEY_METHOD_ERRORS.reason, resultDate: SURVEY_METHOD_ERRORS.resultDate });
    assert.deepEqual(surveyMethodErrorTexts(errorsOf({ reason: 'ก'.repeat(2000), resultDate: '2026-10-20' })),
      { reason: "เหตุผลยาวเกิน 300 ตัวอักษร", resultDate: null });
    assert.deepEqual(surveyMethodErrorTexts(errorsOf({ reason: good, resultDate: 'ไม่ใช่วัน' })), { reason: null, resultDate: 'วันที่จะส่งผลประเมินไม่ถูกต้อง' });
    assert.deepEqual(surveyMethodErrorTexts(errorsOf({ reason: good, resultDate: '2026-10-20' })), { reason: null, resultDate: null });
    assert.deepEqual(surveyMethodErrorTexts(null), { reason: null, resultDate: null });
  }
  assert.match(DIALOG, /invalid=\{!!reasonError\}/);
  assert.match(DIALOG, /invalid=\{!!dateError\}/);
  assert.match(DIALOG, /\{reasonError \? <span className=\{styles\.fieldError\} role="alert">\{reasonError\}<\/span> : <span \/>\}/);
  assert.match(DIALOG, /\{dateError \? <p className=\{styles\.fieldError\} id=\{`\$\{dateId\}-error`\} role="alert">\{dateError\}<\/p> : null\}/);
  assert.match(DIALOG, /\{fmtNumber\(reason\.trim\(\)\.length\)\}\/\{fmtNumber\(SURVEY_METHOD_REASON_MAX\)\}/, 'ตัวนับนับแบบเดียวกับแผน');
  assert.match(DIALOG, /\{error \? <StatusNotice tone="error" role="alert">\{error\}<\/StatusNotice> : null\}/, 'ข้อความล้มเหลวอยู่ในแถบท้ายที่นิ่ง');

  const [modal] = jsxOpenTags(DIALOG, /<Modal\b/g);
  for (const prop of [/size="md"/, /\bsheetOnPhone\b/, /dismissible=\{!busy\}/, /initialFocusRef=\{firstTarget\}/, /footer=\{footer\}/, /subtitle=\{subtitle \|\| undefined\}/]) {
    assert.match(modal, prop);
  }
  const [seg] = jsxOpenTags(DIALOG, /<Segmented\b/g);
  for (const prop of [
    /selection="radio"/, /value=\{target\}/, /onChange=\{\(to\) => pick\(zone, to\)\}/,
    /options=\{locked \? LOCKED_OPTIONS : TARGET_OPTIONS\}/, /ariaLabel=\{`วิธีประเมินของ \$\{title\}`\}/,
  ]) assert.match(seg, prop);
  assert.doesNotMatch(DIALOG, /<select|<Select\b|SearchableSelect/, 'ชุดเล็ก = แถบเลือก ไม่ใช่ดรอปดาวน์');
  assert.match(DIALOG, /data-changed=\{changed \? "" : undefined\}/);
  assert.match(DIALOG, /firstTarget\.current = node \? node\.querySelector\('button\[role="radio"\]:not\(\[disabled\]\)\[tabindex="0"\]'\) : null;/,
    'โฟกัสแรก = ตัวเลือกของพื้นที่แรก');

  // ตัวเลือกเหตุผลสำเร็จรูป: ปุ่มจริง · กดค้างเมื่อข้อความขึ้นต้นด้วยคำนั้น · เติมผ่านตัวช่วยที่ไม่ทับของที่พิมพ์
  assert.match(DIALOG, /\{SURVEY_METHOD_REASON_CHIPS\.map\(\(word\) => \{\s*const on = reason\.startsWith\(word\);/);
  assert.match(DIALOG, /<button\s+key=\{word\}\s+type="button"\s+className="choice-chip"\s+aria-pressed=\{on\}\s+data-on=\{on \? "1" : undefined\}\s+disabled=\{locked\}\s+onClick=\{\(\) => fillReason\(word\)\}/);
  assert.match(DIALOG, /const fillReason = \(word\) => setReason\(\(text\) => surveyReasonWithPreset\(text, word, SURVEY_METHOD_REASON_CHIPS\)\);/);
  // ช่องวันขึ้นเมื่อแผนขอเท่านั้น · กล่องผลไม่มีบรรทัด = ไม่มีกล่อง (ที่ห่อ aria-live อยู่เสมอ)
  assert.match(DIALOG, /\{plan\.needs\.resultDate \? \(/);
  /* 🔴 UAT S2b S06 — กล่องผลอยู่ใน**แถบท้ายที่นิ่ง** เหนือข้อความล้มเหลวและปุ่ม (เห็นเสมอก่อนกด: บนมือถือเดิมกดบันทึกได้โดยไม่เคยเห็น
     บรรทัด "นัดจะถูกยกเลิก") · ใบไม่อยู่ในสภาพที่กล่องบอกแล้ว (`dead`) = ไม่มีกล่อง */
  assert.match(DIALOG, /<div className=\{styles\.live\} aria-live="polite">\s*\{!dead && plan\.lines\.length \? \(/);
  {
    const foot = DIALOG.slice(DIALOG.indexOf('const footer = ('), DIALOG.indexOf('return (\n    <Modal'));
    assert.ok(foot.indexOf('styles.live') > 0 && foot.indexOf('styles.live') < foot.indexOf('<StatusNotice tone="error"'), 'ผลของการกด → ข้อความล้มเหลว → ปุ่ม');
    assert.ok(foot.indexOf('<StatusNotice tone="error"') < foot.indexOf('styles.footBtns'));
    assert.equal(DIALOG.slice(DIALOG.indexOf('return (\n    <Modal')).includes('styles.outcome'), false, 'ไม่อยู่ในเนื้อที่เลื่อน');
  }
  assert.match(DIALOG, /\{plan\.lines\.map\(\(line\) => <li key=\{line\}>\{outcomeText\(line\)\}<\/li>\)\}/);
  // ค่าตั้งต้นสองช่อง: ครั้งเดียวต่อการเปิดหนึ่งรอบ และเฉพาะตอนช่องยังว่าง
  assert.match(DIALOG, /if \(!open \|\| planKind !== "cancel-only" \|\| prefilled\.current\.reason\) return;\s*prefilled\.current\.reason = true;\s*setReason\(\(text\) => \(text === "" \? defaultReason : text\)\);/);
  assert.match(DIALOG, /if \(!open \|\| !needsDate \|\| prefilled\.current\.date\) return;\s*prefilled\.current\.date = true;\s*setResultDate\(\(value\) => \(value === "" \? defaultDate : value\)\);/);
  for (const tag of jsxOpenTags(DIALOG, /<(Input|Textarea)\b/g)) assert.match(tag, /\btouch\b/, 'ช่องพิมพ์ ≥16px (iOS ไม่ซูม)');
});

test('ตัวช่วยล้วนของโมดัล: เหตุผลสำเร็จรูปเติมคำไม่ทับของที่พิมพ์ · คำตอบที่ไม่สำเร็จแยกด้วย code/สถานะ · เลขการกดผ่านด่านของ server', () => {
  const fill = pureFunction(DIALOG, 'surveyReasonWithPreset');
  const [A, B] = SURVEY_METHOD_REASON_CHIPS;
  const P = SURVEY_METHOD_REASON_CHIPS;
  assert.equal(fill('', A, P), A, 'ช่องว่าง = คำของตัวเลือก');
  assert.equal(fill('   ', A, P), A);
  assert.equal(fill(B, A, P), A, 'มีแค่คำของตัวเลือกอีกตัว = สลับ');
  const typed = 'โซนคาเฟ่พนักงานก่อสร้างถึงสิ้นเดือน ต.ค. ตามที่ฝ่ายขายแจ้งในเธรด';
  assert.equal(fill(typed, A, P), `${A} — ${typed}`, 'พิมพ์ก่อนแล้วกดตัวเลือก = คำนำหน้า ของที่พิมพ์อยู่ครบ');
  assert.equal(fill(`${A} — ${typed}`, A, P), `${A} — ${typed}`, 'กดซ้ำ = ไม่เปลี่ยน');
  assert.equal(fill(`${A} — ${typed}`, B, P), `${B} — ${typed}`, 'เปลี่ยนตัวเลือก = สลับเฉพาะท่อนที่ตัวเลือกเติมเอง ไม่ซ้อนสองคำนำ');
  assert.equal(fill(`${A}และฝนตก`, A, P), `${A}และฝนตก`);
  for (const word of P) {
    for (const before of ['', typed, `${A} — ${typed}`, B]) {
      const after = fill(before, word, P);
      assert.equal(after.startsWith(word), true, 'กดแล้วตัวเลือกนั้นต้องขึ้นเป็นกดค้าง');
      if (before.includes(typed)) assert.equal(after.endsWith(typed), true, 'ของที่หัวหน้าพิมพ์ไม่หาย');
    }
  }
  // ไม่มีคำไหนเป็นคำขึ้นต้นของอีกคำ — ไม่งั้นสองตัวเลือกจะขึ้นกดค้างพร้อมกัน
  for (const a of P) for (const b of P) if (a !== b) assert.equal(a.startsWith(b), false);

  const failure = pureFunction(DIALOG, 'surveyMethodFailure');
  const answer = (status, code) => failure({ status, data: code ? { code } : {} }).dead;
  assert.equal(answer(409, 'partial'), false, 'บันทึกไม่ครบ = ฟอร์มอยู่ กดซ้ำด้วยเลขเดิม');
  assert.equal(answer(409, 'nothing'), false);
  assert.equal(answer(409, 'stale'), true);
  assert.equal(answer(409, 'sent'), true);
  assert.equal(answer(409, null), true, '409 ไม่มีรหัส: สวิตช์ปิด · ยังไม่รับเรื่อง · ใบล็อก');
  assert.equal(answer(403, null), true);
  assert.equal(answer(400, null), false);
  assert.equal(answer(400, 'invalid'), false);
  assert.equal(answer(500, 'error'), false);
  assert.equal(failure(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')).dead, false, 'ไม่ได้คำตอบ = ฟอร์มอยู่ กดซ้ำได้');
  assert.equal(failure(null).dead, false);

  const newId = pureFunction(DIALOG, 'newSurveyActionId');
  const ids = new Set(Array.from({ length: 50 }, () => newId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.equal(surveyMethodActionId(id), id, 'รูปที่ server รับ');
  // เครื่องที่ไม่มี randomUUID (เปิดผ่าน http ในวงแลน) / ไม่มี crypto เลย — ยังได้เลขที่ server รับ
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (bytes) => real.get ? real.get.call(globalThis).getRandomValues(bytes) : real.value.getRandomValues(bytes) } });
    assert.match(newId(), /^[0-9a-f]{32}$/);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const plain = newId();
    assert.equal(surveyMethodActionId(plain), plain);
    assert.notEqual(newId(), plain);
  } finally {
    Object.defineProperty(globalThis, 'crypto', real);
  }
});

test('แผนที่โมดัลกิน: เปิดเฉย ๆ = ปุ่มติดด่าน · สลับหนึ่งพื้นที่บนใบผสม = นัดยังอยู่ · สลับหมด = ขอวัน + ยกเลิกนัด · ยกเลิกนัดอย่างเดียว', () => {
  const plan = (rows, changes, extra = {}) => surveyMethodSwitchPlan({
    rows, changes, visit: VISIT, request: request(), sendBack: null, reason: '', resultDate: '', ...extra,
  });
  const untouched = plan(ONSITE_ROWS, []);
  assert.equal(untouched.disabledReason, SURVEY_METHOD_ERRORS.nothing);
  assert.deepEqual(untouched.lines, []);
  assert.equal(untouched.needs.resultDate, false);
  assert.deepEqual(untouched.after.mix, { onsite: 2, drawing: 0, mode: 'onsite' });

  const one = plan([...ONSITE_ROWS, zone('z3', 'โซนคาเฟ่พนักงาน')], [{ zoneId: 'z3', method: 'drawing' }]);
  assert.equal(one.disabledReason, null);
  assert.deepEqual(one.errors, [SURVEY_METHOD_ERRORS.reason], 'ช่องเหตุผลติด — ค่าคงที่ตัวเดียวกับที่โมดัลใช้ชี้ช่อง');
  assert.equal(one.visit.action, 'stays');
  assert.equal(one.needs.resultDate, false);
  assert.deepEqual(one.before.mix, { onsite: 3, drawing: 0, mode: 'onsite' });
  assert.deepEqual(one.after.mix, { onsite: 2, drawing: 1, mode: 'mixed' });
  assert.equal(one.confirmLabel, 'บันทึกวิธีประเมิน');
  assert.ok(one.lines.length >= 2);

  const all = plan(ONSITE_ROWS, ONSITE_ROWS.map((z) => ({ zoneId: z.id, method: 'drawing' })), { request: request({ committedResultDate: null }) });
  assert.equal(all.needs.resultDate, true);
  assert.deepEqual(all.errors, [SURVEY_METHOD_ERRORS.reason, SURVEY_METHOD_ERRORS.resultDate], 'เหตุผลก่อน วันทีหลัง (ลำดับของ route) — โมดัลชี้ช่องผ่าน surveyMethodErrorFields');
  assert.equal(all.visit.action, 'cancel');
  assert.equal(String(all.visit.id), 'SV-1');
  assert.equal(plan(ONSITE_ROWS, ONSITE_ROWS.map((z) => ({ zoneId: z.id, method: 'drawing' }))).defaults.resultDate, '2026-10-15', 'ค่าตั้งต้นของช่องวัน = วันที่ใบรับปากไว้');
  const ready = plan(ONSITE_ROWS, ONSITE_ROWS.map((z) => ({ zoneId: z.id, method: 'drawing' })), {
    reason: `${SURVEY_METHOD_REASON_CHIPS[0]} — ถึงสิ้นเดือน`, resultDate: '2026-10-20',
  });
  assert.deepEqual(ready.errors, []);
  assert.equal(ready.disabledReason, null);

  const cancelOnly = plan(DESK_ROWS, []);
  assert.equal(cancelOnly.kind, 'cancel-only');
  assert.equal(cancelOnly.confirmLabel, 'ยกเลิกนัด');
  assert.equal(cancelOnly.defaults.reason, SURVEY_METHOD_CANCEL_ONLY_REASON);
  assert.equal(cancelOnly.visit.action, 'cancel');
  assert.equal(plan(DESK_ROWS, [], { reason: cancelOnly.defaults.reason }).errors.length, 0, 'เหตุผลตั้งต้นผ่านด่านเอง');
});

/* ══ ⑬ ยามของทั้งกลุ่ม ═══════════════════════════════════════════════════════════════════════════════ */

test('🔴 ไฟล์ของกลุ่ม A: ไม่มีค่าวิธีติดกับคำว่า method · ไม่เทียบคอลัมน์วิธีเอง · ไม่มีคำว่า chip เปล่า ๆ บนบรรทัดที่มีสตริง · ไม่มี style ฝังบรรทัด', () => {
  const write = /\bmethod\s*(?::|=(?!=))\s*(?:SURVEY_METHOD_\w+|['"`](?:drawing|onsite)['"`])/;
  const compare = /\.method\s*[!=]==?\s*(?:['"`](?:drawing|onsite)['"`]|SURVEY_METHOD_)/;
  const chipWord = /(["'`])[^"'`\n]*(?<![\w-])chip(?![\w-])[^"'`\n]*\1/;
  for (const [name, src] of Object.entries(GROUP)) {
    assert.doesNotMatch(src, write, `${name}: ยามเขียนของงวด S2a (prop ของป้ายวิธีชื่อ variant ด้วยเหตุนี้)`);
    assert.doesNotMatch(src, compare, name);
    assert.doesNotMatch(src, /style=\{\{/, name);
  }
  // ค่าของวิธีมาจากค่าคงที่ของโมดูลใบ — โมดัลไม่มีสตริงค่าวิธีเลย · หน้ามีคำนี้ที่เดียวและไม่ใช่วิธี: เหตุที่รายการว่าง (`emptyReason`)
  assert.doesNotMatch(DIALOG, /['"`](?:drawing|onsite)['"`]/);
  assert.deepEqual(PAGE.match(/[^\n]*['"`](?:drawing|onsite)['"`][^\n]*/g).map((line) => line.trim()),
    ['{listView.emptyReason === "drawing" ? listView.drawingNote']);
  // ตัวนับ badgeFamilies อ่านไฟล์ดิบ (รวมคอมเมนต์) — ตรวจแบบเดียวกัน
  for (const rel of [PAGE_PATH, DIALOG_PATH]) assert.doesNotMatch(read(rel), chipWord, rel);
  // ตัวตัดคอมเมนต์ของยามซอร์สเป็นแบบง่าย — สตริงที่มีเครื่องหมายเปิดคอมเมนต์จะทำให้ยามทั้งไฟล์ตาบอด
  const opener = '/' + '*';
  for (const [name, src] of Object.entries(GROUP)) assert.equal(src.includes(opener), false, `${name}: เหลือเครื่องหมายเปิดคอมเมนต์หลังตัดคอมเมนต์`);
  assert.doesNotMatch(DIALOG, /from "next\/link"|<a\s/);
});

test('CSS ของกลุ่ม A: โทเคนล้วน · เส้นจอเดียว (680) · เป้านิ้ว 40px / 44px บนจอสัมผัสและจอแคบ · แถวพื้นที่ซ้อนบนมือถือ', () => {
  for (const [name, src] of [['page.module.css', PAGE_CSS], ['SurveyMethodDialog.module.css', DIALOG_CSS]]) {
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, `${name}: สีดิบ`);
    assert.doesNotMatch(src, /line-height:\s*[\d.]/, `${name}: line-height ดิบ`);
    assert.doesNotMatch(src, /font-size:\s*[\d.]/, `${name}: ขนาดตัวอักษรดิบ`);
    assert.doesNotMatch(src, /font-weight:\s*\d/, `${name}: น้ำหนักตัวอักษรดิบ`);
    const cuts = [...src.matchAll(/@media[^{]*?(?:max|min)-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(cuts)].filter((n) => n !== 680), [], `${name}: เส้นจอใหม่`);
  }
  // ทุกคลาสที่โมดัลเรียกมีใน CSS และทุกคลาสใน CSS ถูกเรียก
  const used = new Set([...read(DIALOG_PATH).matchAll(/styles\.([A-Za-z]\w*)/g)].map((m) => m[1]));
  const declared = new Set([...DIALOG_CSS.matchAll(/\.([A-Za-z][\w-]*)(?=[\s{:.,>+\[)])/g)].map((m) => m[1])
    .filter((name) => !['segmented', 'btn', 'choice-chip', 'date-input-wrap', 'drawer', 'drawer-header', 'drawer-close', 'date-input-text', 'date-input-picker'].includes(name)));
  assert.deepEqual([...used].filter((name) => !declared.has(name)), [], 'คลาสที่เรียกแต่ไม่มีใน CSS');
  assert.deepEqual([...declared].filter((name) => !used.has(name)), [], 'คลาสกำพร้าใน CSS');
  for (const name of ['field', 'fieldLabel', 'fieldError', 'fieldNote']) {
    assert.match(PAGE_CSS, new RegExp(`\\.${name}\\b`), name);
    assert.match(PAGE, new RegExp(`styles\\.${name}\\b`), name);
  }

  assert.match(DIALOG_CSS, /\.seg:global\(\.segmented\) > button \{\s*min-height: var\(--ctl-h\);/);
  assert.match(DIALOG_CSS, /\.presets :global\(\.choice-chip\) \{\s*min-height: var\(--ctl-h\);/);
  const coarse = DIALOG_CSS.slice(DIALOG_CSS.indexOf('@media (pointer: coarse) {'), DIALOG_CSS.indexOf('@media (max-width: 680px) {'));
  assert.match(coarse, /\.seg:global\(\.segmented\) > button,\s*\.presets :global\(\.choice-chip\),\s*\.shortcut,\s*\.footBtns :global\(\.btn\) \{ min-height: var\(--ctl-h-touch\); \}/);
  const phone = DIALOG_CSS.slice(DIALOG_CSS.indexOf('@media (max-width: 680px) {'));
  assert.match(phone, /\.row \{ grid-template-columns: auto minmax\(0, 1fr\); \}/, 'แถวซ้อน: ชื่อ แล้วตัวเลือกเต็มกว้าง');
  assert.match(phone, /\.seg:global\(\.segmented\) \{\s*grid-column: 1 \/ -1;\s*display: flex;\s*\}/);
  assert.match(phone, /\.seg:global\(\.segmented\) > button \{\s*flex: 1 1 0;\s*min-width: 0;\s*min-height: var\(--ctl-h-touch\);\s*\}/);
  assert.match(phone, /\.footBtns :global\(\.btn\) \{\s*flex: 1;\s*min-width: 0;\s*min-height: var\(--ctl-h-touch\);\s*\}/, 'ปุ่มท้ายเต็มกว้าง ปุ่มหลักอยู่ท้าย');
  assert.doesNotMatch(DIALOG_CSS, /overflow:\s*hidden|white-space:\s*nowrap;[^}]*text-overflow/, 'ชื่อพื้นที่ไม่ถูกตัด · วงโฟกัสไม่ถูกตัด');
  assert.match(DIALOG_CSS, /\.title \{[^}]*overflow-wrap: anywhere;/);
});
