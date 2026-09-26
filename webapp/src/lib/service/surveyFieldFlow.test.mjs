// ── flow ส่งงานหน้างานของนัดประเมิน (มติผู้ใช้ 2026-09-21) — ยามอ่านซอร์สจอ ──────
//
// ⭐ สามจุดที่พังกลับได้เงียบ ๆ โดยไม่มีเทสต์ฟังก์ชันไหนเห็น เพราะอยู่ที่ "จอเรียกอะไร"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('🔴 งานวันนี้: นัดประเมินต้องไม่เปิดแผ่นปิดงานของงานบริการ', () => {
  const page = code(read('../../app/service/today/page.js'));
  // ปุ่ม "ปิดงาน/แก้ผลการเข้า" บนการ์ดขึ้นเฉพาะนัดที่ไม่ใช่นัดประเมิน
  assert.match(page, /canEdit && !surveyLink && \(running \|\| done\)/);
  // ปุ่มส่งงานของนัดประเมินพาไปโมดัลบนจอประเมิน
  assert.match(page, /\/service\/surveys\/\$\{visit\.requestId\}\?submit=1/);
});

test('จอประเมิน: ส่งงาน = ปิดนัดด้วยนาฬิกาของ server · แถบของช่างไม่ขึ้นให้หัวหน้าที่ไม่ได้อยู่บนนัด', () => {
  const page = code(read('../../app/service/surveys/[id]/page.js'));
  assert.match(page, /stamp: "end"/, 'เวลาจบต้องประทับที่ server');
  assert.match(page, /!canDecide \|\| data\?\.onVisit === true/);
  const route = code(read('../../app/api/service/surveys/[id]/route.js'));
  assert.match(route, /onVisit: isOnVisit\(user, visit\)/, 'จอไม่รู้ user id ของตัวเอง — server ต้องตอบ');
});

test('ปุ่มถ่ายรูปไม่บังคับกล้อง — ช่างต้องเลือกรูปจากคลังได้', () => {
  const panel = code(read('../../components/AttachmentsPanel.js'));
  assert.doesNotMatch(panel, /\scapture=/);
  assert.match(panel, /multiple=\{photoCapture \|\| undefined\}/);
  // 🔄 §10.5 S7 — หน้าพื้นที่ใช้แผ่นรูป (ถ่าย/เลือกจากคลังได้ · ลบในกล่องดูรูป 44px)
  const zonePage = code(read('../../components/service/SurveyZonePage.js'));
  assert.match(zonePage, /photoCapture/);
  assert.match(zonePage, /photoTiles/);
  /* แพ็คเกจไม่อยู่บนหน้าพื้นที่ของใครเลย (แผน §10.5 C16 · AW-2) — เป็นของแท็บสรุปส่งผลกับราง */
  assert.doesNotMatch(zonePage, /suggestedPackages|packageQty|showPackage/);
});

/* ══ ภาพผังย้ายไปแท็บสรุปส่งผล (มติเจ้าของ 25/09 · แผน §10.5 S2) ═══════════════════ */
test('ภาพผัง: ช่องอัปอยู่คอลัมน์ของตารางสรุป (เฉพาะคนที่ server ยอมให้อัป) · การ์ดพื้นที่ของช่างไม่มีช่องผังแล้ว', () => {
  const zonePage = code(read('../../components/service/SurveyZonePage.js'));
  assert.doesNotMatch(zonePage, /SURVEY_DOC_PLAN|survey_plan/, 'ผังเป็นของหัวหน้า — หน้าพื้นที่ของช่างเหลือภาพกว้าง + ภาพจุด');

  const table = code(read('../../components/service/SurveyResultTable.js'));
  assert.match(table, /SURVEY_DOC_PLAN/);
  assert.match(table, /canEdit=\{canUploadPlan\}/, 'ปุ่มอัปขึ้นตามด่านเดียวกับ server ไม่ใช่ตาม canDecide');
  assert.match(table, /surveyResultZoneCell\(zone, files\)/, 'ผลวัดของช่างในช่องพื้นที่มาจากตัวตัดสิน');
  // 🐞 "8 × 6 × 0" — ช่องขนาดที่ยังว่างต้องเป็นขีด (ตัวตัดสินทำให้แล้ว ห้ามตารางกลับไปจัดรูปเอง)
  assert.doesNotMatch(table, /fmtNumber\(p\.(widthM|lengthM|heightM)\)/);
  assert.match(table, /<td colSpan=\{3\}/, 'แถวที่ตัดออกกินสามคอลัมน์ที่เหลือ (สี่คอลัมน์แล้ว)');
  assert.match(table, /<td colSpan=\{4\}>/, 'แถว "ยังขาด" กินเต็มแถว');

  const page = code(read('../../app/service/surveys/[id]/page.js'));
  assert.match(page, /canUploadPlan=\{view\.flags\.canUploadPlan\}/);
  // ตารางเขียนว่า "ออกจากหน้านี้ก่อนบันทึก ระบบจะถามก่อนทิ้ง" — คำนั้นต้องจริง
  // 🔄 §10.5 S7 — ด่านเดียวของหน้าถามทุกของค้าง (ค่าในพื้นที่ · การเคาะ · ข้อความถึงหัวหน้า · รูปที่ยังส่ง)
  // 🐞 review 26/09: เดิมตรึงแค่สองเงื่อนไขแรกจากสี่ — ถอดข้อความถึงหัวหน้า/รูปที่ยังส่งออกแล้วเทสต์ยังเขียว ⇒ ตรึงทั้งสองบรรทัด
  assert.match(page, /const pageDirty = pendingDecisionZoneIds\.length > 0 \|\| fixedNote\.trim\(\) !== "" \|\| uploadsBusy > 0;/);
  assert.match(page, /const anyUnsaved = dirtyZoneIds\.length > 0 \|\| pageDirty;/);
  assert.match(page, /useUnsavedChanges\(anyUnsaved,/);
});
