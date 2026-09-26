// ── สัญญาเปลือกของจอหน้างาน (แผน §10.5 จอหน้างานแบบ A · ชุด S6) — ยามอ่าน CSS ─────────────────────
//
// ⭐ สองเครื่องหมายที่คอมโพเนนต์ประกาศแล้ว `globals.css` ทำให้ — ตัวคอมโพเนนต์ไม่ต้องรู้เรื่องเปลือกเลย
//   • `data-osk-hide` + ธง `<html data-osk="up">` (จาก `useOnScreenKeyboard`) = แถบติดขอบล่างหลบตอนแป้นบนจอขึ้น
//   • `data-immersive-page` = หน้าเต็มจอ เปลือกของแอป (แถบบน · เมนูล่าง · แถวย้อน · ลิ้นชัก · แถบระบุใบ) หลบทั้งชุด
// 🐞 สิ่งที่พังเงียบได้: ชื่อคลาสของเปลือกเปลี่ยน (กฎยังอยู่แต่ไม่โดนอะไร) · ลำดับในไฟล์สลับ (ความจำเพาะเท่ากัน
//    ตัวที่อยู่ทีหลังชนะ) · ซ่อนแถบแต่ลืมตั้งตัวแปรเป็น 0 (ช่องว่างผีเท่าแถบ) — ไม่มี error ให้เห็นสักอย่าง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const GLOBALS = css('../../app/globals.css');

/** เนื้อของบล็อกที่ตัวเลือกตรงตัว (ครั้งแรกที่เจอ) — ไม่เจอ = ตก */
function block(source, selector) {
  const at = source.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `ไม่มีกฎ ${selector}`);
  return source.slice(at, source.indexOf('}', at));
}

test('แป้นบนจอขึ้น: ของที่ประกาศ data-osk-hide + เมนูล่างมือถือหลบ · ระยะเผื่อเมนูล่างเป็น 0', () => {
  assert.match(block(GLOBALS, ':root[data-osk="up"]'), /--mobile-nav-h: 0px/);
  assert.match(GLOBALS, /:root\[data-osk="up"\] \[data-osk-hide\],\s*:root\[data-osk="up"\] \.mobile-bottom-nav \{ display: none; \}/);
});

test('แป้นบนจอขึ้น: แถบงานของช่างเลิกกันท้ายหน้า (แถบหลบไปแล้ว ช่องว่างเท่าแถบต้องไม่ค้างเหนือแป้น)', () => {
  const bar = css('../../components/service/SurveyFieldBar.module.css');
  assert.match(bar, /:global\(html\):not\(\[data-osk="up"\]\):has\(\.bar/);
  assert.doesNotMatch(bar, /:global\(html\):has\(\.bar/, 'กฎเดิมที่ไม่ถามธงแป้นต้องไม่เหลือ');
});

test('หน้าเต็มจอ: ตัวแปรของเปลือกเป็น 0 ครบ · ซ่อนเปลือกครบหกชิ้น', () => {
  const vars = block(GLOBALS, ':root:has([data-immersive-page])');
  for (const name of ['--topbar-h', '--sysbar-h', '--detail-pin-h', '--mobile-nav-h']) {
    assert.match(vars, new RegExp(`${name}: 0px`), `${name} ต้องเป็น 0 — ซ่อนแถบเฉย ๆ = ระยะเผื่อค้าง`);
  }
  const hide = GLOBALS.match(/:root:has\(\[data-immersive-page\]\) :is\(([^)]*)\) \{ display: none; \}/);
  assert.ok(hide, 'ต้องมีกฎซ่อนเปลือก');
  const hidden = hide[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(hidden, [
    '.topnav', '.mobile-bottom-nav', '.ui-workspace-back-row', '.topnav-menu', '.sidenav-backdrop', '.ui-detail-pin',
  ]);
});

test('หน้าเต็มจอ: ระยะของ .page เป็น 0 — หน้าจัดขอบเอง (แถบกรมท่าชนขอบจอ · ท้ายหน้าจอดที่ขอบล่างจริง · §10.5 S7)', () => {
  assert.match(GLOBALS, /:root:has\(\[data-immersive-page\]\) \.page \{ padding: 0; \}/);
});

test('หน้าเต็มจอ: อยู่หลังกฎที่ตั้งตัวแปรเดียวกันด้วยความจำเพาะเท่ากัน (ลำดับในไฟล์คือตัวตัดสิน)', () => {
  const mine = GLOBALS.indexOf(':root:has([data-immersive-page]) {');
  assert.ok(GLOBALS.indexOf(':root:has(.ui-detail-overview)') < mine, 'หัวใบที่ซ่อนอยู่ยังจอง 49px ถ้ากฎนี้มาก่อน');
  assert.ok(GLOBALS.indexOf('.app-container.sidenav-open .topnav-menu') < mine, 'ลิ้นชักที่กางค้างจะกลับมาทับ');
});

test('หน้าเต็มจอ: ชื่อคลาสที่ซ่อนยังเป็นของจริงบนเปลือก (เปลี่ยนชื่อแล้วกฎไม่โดนอะไร = เปลือกโผล่กลับเงียบ ๆ)', () => {
  const shell = read('../../components/AppLayout.js');
  assert.match(shell, /className="topnav"/);
  assert.match(shell, /className="topnav-menu"/);
  assert.match(shell, /className="sidenav-backdrop"/);
  assert.match(read('../../components/MobileBottomNav.js'), /className="mobile-bottom-nav"/);
  assert.match(read('../../components/ui/Workspace.js'), /className="ui-workspace-back-row"/);
  assert.match(read('./detailPin.js'), /className="ui-detail-pin"/);
});
