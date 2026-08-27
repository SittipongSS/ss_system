// ── ลิสต์ใบเสนอราคาห้ามกลับไป `select('*')` ────────────────────────────────
//
// วัด 2026-08-27 บน 213 ใบ: `select('*')` + join = 989 KB ต่อการเปิดหน้าหนึ่งครั้ง
// ระบุคอลัมน์เองแล้วเหลือ 353 KB (−64%) · คอลัมน์ที่กินคือของที่มีแต่หน้ารายละเอียด
// ใช้ (`notes` 152 KB · `metadata` 67 KB · `paymentTerms` 61 KB · ที่อยู่ 82 KB)
//
// 🪤 เทสต์นี้กันการถอยกลับ ไม่ได้กันคอลัมน์ขาด — เพิ่มช่องบนจอแล้วลืมเติมชื่อคอลัมน์
// ที่ route จะได้ช่องว่างเงียบ ๆ ไม่มี error (ดูคอมเมนต์ในไฟล์ route)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const route = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'route.js'), 'utf8');

test('quotations list: ห้าม select ทั้งก้อน', () => {
  assert.doesNotMatch(route, /\.select\(\s*['"`]\*/,
    "ลิสต์นี้ต้องระบุคอลัมน์เอง — select('*') ทำให้ egress พุ่ง");
});

test('quotations list: คอลัมน์ที่ด่านสิทธิ์/สายอนุมัติต้องอ่าน ต้องอยู่ในลิสต์', () => {
  // inSalesViewScope อ่านทีม/เจ้าของของ **ดีลแม่** · quotationWorkflow อ่านสี่ช่องนี้
  for (const col of ['approvalStatus', 'approvalRequestedBy', 'createdBy', 'status']) {
    assert.match(route, new RegExp(`'${col}'`), `ขาดคอลัมน์ ${col} — ธง _waitingOnMe จะเพี้ยน`);
  }
  for (const col of ['team', 'ownerId', 'stage']) {
    assert.match(route, new RegExp(`\\b${col}\\b`), `ดีลต้องมี ${col} ให้ด่านขอบเขต/สถานะปิดอ่าน`);
  }
});

test('quotations list: ดีลต้องยังมีทางถอย projectType ให้ dealTypeOf', () => {
  // จอเรียก dealTypeOf(r.deal) ซึ่งอ่าน dealType ก่อน แล้วถอยไป metadata.projectType
  // ⇒ ดึงเฉพาะคีย์นั้นพอ แต่ต้องประกอบ metadata กลับ ไม่งั้นดีลเก่าที่ไม่มี dealType
  // จะขึ้น "—" ทั้งคอลัมน์โดยไม่มี error
  assert.match(route, /projectType:metadata->>projectType/,
    'ต้องดึง projectType จาก metadata ของดีล');
  assert.match(route, /metadata: \{ projectType/,
    'ต้องประกอบ deal.metadata.projectType กลับให้จออ่านที่เดิม');
});
