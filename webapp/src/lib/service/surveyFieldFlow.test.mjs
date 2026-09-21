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
  const card = code(read('../../components/service/SurveyZoneCard.js'));
  assert.match(card, /photoCapture/);
  assert.match(card, /showPackage \? \(/, 'ตัวเลขสูตรแพ็คเกจต้องขึ้นเฉพาะคนที่เคาะได้');
});
