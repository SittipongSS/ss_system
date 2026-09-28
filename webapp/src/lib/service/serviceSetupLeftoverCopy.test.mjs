// ── คำค้างของยุค "TS ผูกโซนที่งานเข้าใหม่" (mig 0392 · PR-A · D14/D15) ─────────────────────────────
//
// ⭐ ตั้งแต่ 0392 รอบขาย (term) เกิดตอน **อนุมัติใบสั่งขาย** ที่ฝ่ายขายเลือกโซน/แพ็คต่อรอบไว้แล้ว ·
//    วิซาร์ดผูกโซนของ TS ถอดแล้ว (`POST /api/service/intake/bind` = 409) · ถัง "รอตั้งไซต์/โซน" ไม่มีแล้ว
// 🔴 คำบนจอ/เอกสารที่ยังชี้ให้ TS ไป "เก็บ" แพ็คที่หน้างานเข้าใหม่ = ส่งคนไปหาทางที่ไม่มีอยู่
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UNSET_SERVICE_ORDER_REASON, NO_ZONE_SITE_REASON } from './visitGate.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
/* ตัดคอมเมนต์ — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\s*\}/g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const docSection = (doc, heading) => {
  const start = doc.indexOf(heading);
  assert.ok(start >= 0, `หาหัวข้อ ${heading} ไม่เจอ`);
  const next = doc.indexOf('\n## ', start + heading.length);
  return doc.slice(start, next < 0 ? undefined : next);
};

test('หน้านำเข้า: แพ็ค/ปริมาณที่ไม่ได้นำเข้า ชี้ไปใบสั่งขายที่ฝ่ายขายตั้งโซน ไม่ใช่ให้ TS ไปเก็บที่หน้างานเข้าใหม่', () => {
  const src = code('../../app/service/import/page.js');
  const note = src.match(/<b>ไม่ได้นำเข้า:<\/b>[\s\S]*?<\/p>/);
  assert.ok(note, 'หาโน้ต "ไม่ได้นำเข้า" ไม่เจอ');
  const text = note[0].replace(/\s+/g, ' ');
  assert.doesNotMatch(text, /\(หน้า “งานเข้าใหม่”\)/, 'หน้างานเข้าใหม่สร้างรอบขายไม่ได้แล้ว (bind = 409)');
  assert.match(text, /ต้องมาจากใบสั่งขายที่อนุมัติแล้ว \(ฝ่ายขายเลือกโซนในใบ — อนุมัติแล้วขึ้น “งานเข้าใหม่ › รอตั้งรอบ”\) จึงจะเก็บได้/);
});

test('docs/historical-sales-orders.md §8: โน้ตถังตั้งรอบตรงกับจอ · ไม่อ้างถัง "รอตั้งไซต์/โซน" เป็นทางปกติ · ชี้ 0392', () => {
  const intake = code('../../app/service/intake/page.js');
  const title = intake.match(/title="(โซนผูกจากฝ่ายขายตอนคีย์ใบแล้ว[^"]*)"/);
  assert.ok(title, 'หาโน้ตโซนผูกแล้วบนหน้างานเข้าใหม่ไม่เจอ');
  const s8 = docSection(read('../../../../docs/historical-sales-orders.md'), '## 8. ฝั่งบริการ');
  assert.ok(s8.includes(`"${title[1]}"`), `เอกสารต้องยกโน้ตตามจอ: ${title[1]}`);
  assert.doesNotMatch(s8, /ใบย้อนหลังไม่ต้องผ่าน รอตั้งไซต์\/โซน/);
  assert.match(s8, /0392[^\n]*\[so-service-setup\.md\]\(so-service-setup\.md\)/, '§8 ต้องชี้ว่าถังผูกโซนถอดแล้วทุก origin ตั้งแต่ 0392');
  // ป้ายเมนู `bind + plan` และตัวสลับแท็บอัตโนมัติ ถอดใน 0392 — ต้องมีหมายเหตุติดบรรทัด ไม่ใช่บอกเป็นของปัจจุบัน
  assert.match(s8, /นับ `bind \+ plan`[\s\S]{0,200}\n {2}🔄 \*\*0392 \(D14 · \[owner\]\): ป้ายนับเฉพาะถัง "รอตั้งรอบ"\*\* \(`return plan\.length;`\)/);
  assert.match(s8, /~~หน้าคิว \*\*สลับไปถัง "รอตั้งรอบ"[^\n]*~~\n {2}🔄 \*\*0392 \(D14\): ตัวสลับถอดแล้ว — แท็บตั้งต้นคือ "รอตั้งรอบ" เสมอ\*\*/);
  // ตัวเลขที่เอกสารอ้างต้องมีจริงในโค้ด
  assert.match(code('../../app/api/nav/counts/route.js'), /return plan\.length;/);
  assert.match(intake, /const \[tab, setTab\] = useState\("plan"\);/);
});

test('docs/service-field-operations.md: แถวนำเข้าไม่ส่งไปคีย์ที่งานเข้าใหม่ · ด่านโซนไม่มีรอบขายบอกว่า 0392 ย้ายเป็นของฝ่ายขาย', () => {
  const doc = read('../../../../docs/service-field-operations.md');
  const importRow = doc.split('\n').find((l) => l.startsWith('| **จำนวนแพ็ค · ลิตร/เดือน** |'));
  assert.ok(importRow, 'หาแถว "จำนวนแพ็ค · ลิตร/เดือน" ไม่เจอ');
  assert.doesNotMatch(importRow, /ให้ไปคีย์ผ่าน “งานเข้าใหม่”/);
  assert.match(importRow, /0392/);

  const f6c = doc.split('\n').find((l) => l.startsWith('| **F-6c**'));
  assert.ok(f6c, 'หาแถว F-6c ไม่เจอ');
  // ประวัติมติ 23/09 คงไว้ได้ แต่ต้องมีหมายเหตุ 0392 ต่อท้ายทันที: เหตุใหม่ + เจ้าของใหม่
  const at = f6c.indexOf('(ผูกที่หน้า "งานเข้าใหม่")');
  assert.ok(at >= 0, 'หาประโยคด่านของมติ 23/09 ไม่เจอ');
  const after = f6c.slice(at, at + 600);
  assert.match(after, /🔄 \*\*ตั้งแต่ mig 0392\*\*/);
  assert.ok(after.includes('`UNSET_SERVICE_ORDER_REASON`'), 'ต้องบอกชื่อเหตุใหม่');
  assert.ok(after.includes('`NO_ZONE_SITE_REASON`'), 'ต้องบอกว่าไซต์ไม่มีโซนยังเป็นของ TS');
  assert.ok(after.includes('[so-service-setup.md](so-service-setup.md)'));
  // เหตุที่อ้างต้องมีจริงในโค้ด (เปลี่ยนชื่อแล้วลืมเอกสาร = แดง)
  assert.match(UNSET_SERVICE_ORDER_REASON, /ฝ่ายขาย/);
  assert.match(NO_ZONE_SITE_REASON, /TS เพิ่มโซน/);
});
