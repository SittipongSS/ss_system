// ── PO สหมิตรไม่สร้าง/ผูกโครงการอีกแล้ว (ยุบโครงการ P3a · มติเจ้าของ 16/11 ⑪) ─────────────
//
// เดิมไฟล์นี้ตรึงว่า "โครงการที่เกิดจาก PO สหมิตรต้องมีผู้ดูแล (AE) จริง" — route `create-project`
// เคยตรึงเจ้าของเป็นคนกดปุ่ม · หน้าจอ PO ถามครบสามฝ่ายก่อนสร้าง · และ `settle-deal` บังคับให้
// PO มีโครงการก่อนออก QT (QT มาตรฐานเคยบังคับ projectId)
// P3a ปลดระวางโครงการ (ข้อมูลเก่าอ่านอย่างเดียว ไม่มีทางสร้าง/ผูก/ย้าย/ดู) ⇒ ยามกลับทิศเป็น
// "ทางสร้าง/ผูกโครงการห้ามกลับมา · ยืนยันดีล/ออก QT ไม่ติดด่านโครงการ · ดีลรวมไม่ผูกโครงการ"
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const at = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const settle = codeOnly(read('../../app/api/sahamit/po/[id]/settle-deal/route.js'));
const page = codeOnly(read('../../app/sahamit/po/[id]/page.js'));

test('route สร้าง/ผูกโครงการของ PO ถูกลบ — ห้ามกลับมา', () => {
  for (const rel of [
    '../../app/api/sahamit/po/[id]/create-project/route.js',
    '../../app/api/sahamit/po/[id]/link-project/route.js',
  ]) {
    assert.equal(existsSync(at(rel)), false, `${rel} กลับมาแล้ว — โครงการปลดระวาง (P3a)`);
  }
});

test('หน้าจอ PO ไม่มีปุ่ม/โมดัลโครงการ และไม่ลิงก์ไปหน้าโครงการ', () => {
  assert.doesNotMatch(page, /\/create-project|\/link-project/, 'ปุ่มสร้าง/เชื่อมโครงการต้องไม่กลับมา');
  assert.doesNotMatch(page, /\/api\/pm\/projects/, 'ไม่ต้องโหลดรายชื่อโครงการมาให้เลือกอีก');
  assert.doesNotMatch(page, /\/sa\/projects\//, 'หน้าโครงการถูกลบแล้ว — ห้ามลิงก์ไป');
  assert.doesNotMatch(page, /projectConfirmOpen|createProject|submitLinkProject|PROJECT_PEOPLE_ROLES/);
});

test('settle-deal: ยืนยันดีล/ออก QT ไม่ติดด่านโครงการ', () => {
  assert.doesNotMatch(settle, /!po\.projectId/, 'ด่าน "PO ยังไม่มีโครงการ" ต้องไม่กลับมา');
  assert.doesNotMatch(settle, /from\('projects'\)/, 'ไม่อ่าน/เขียนตาราง projects อีก');
  assert.doesNotMatch(settle, /projectWriteBlockedError/, 'ด่าน "โครงการปิดแล้ว" ไม่เกี่ยวกับเส้นนี้แล้ว');
  assert.doesNotMatch(settle, /d\.projectId/, 'ดีลที่เคยผูกโครงการ (ข้อมูลเก่า) ยังเลือกรวมได้');
  // GET ไม่ส่ง projectId ให้จอเตือน และไม่กรองดีลด้วยโครงการ
  assert.doesNotMatch(settle, /\.is\('projectId', null\)/);
});

test('settle-deal: ดีลรวมที่สร้างใหม่ไม่ผูกโครงการ', () => {
  assert.doesNotMatch(settle, /\bprojectId\s*:/, 'แถวดีลรวม/คำตอบต้องไม่มีคีย์ projectId');
  assert.doesNotMatch(settle, /\bprojectCode\s*:/, 'metadata ของดีลรวมไม่พกรหัสโครงการ');
});
