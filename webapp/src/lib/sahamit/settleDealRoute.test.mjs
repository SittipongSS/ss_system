/* กติกาของ POST /api/sahamit/po/[id]/settle-deal ที่ห้ามหลุด
 *
 * ขั้นย้ายพยากรณ์ + ปิดดีลต้นทาง **ไม่มีทรานแซกชัน** โดยเจตนา (คอมเมนต์ในไฟล์อธิบายไว้)
 * ⇒ ความถูกต้องพึ่งกติกาเดียว: **ปิดดีลต้นทางได้ก็ต่อเมื่อย้าย allocation สำเร็จจริงครบ**
 *
 * 🐞 บั๊กที่แก้ 2026-08-16: `chk()` แค่บันทึกคำเตือนแล้วเดินต่อเหมือนสำเร็จ · `movedQty`
 * บวกทุกกรณี ⇒ ดีลต้นทางถูกปิดทั้งที่ allocation ยังผูกอยู่ ⇒ ยอดพยากรณ์หายจากท่อ
 * (ดีลรวมไม่มี ต้นทางปิดแล้ว) และไม่มีใครเห็นนอกจากบรรทัดคำเตือนที่มาช้าไปแล้ว
 *
 * เทสต์ชุดนี้อ่านซอร์ส (แนวเดียวกับ soFilingRoute.test) เพราะสิ่งที่ต้องกันคือ "ลำดับ
 * การตัดสินใจ" ซึ่งพิสูจน์ด้วยการเรียกฟังก์ชันไม่ได้ — handler ผูกกับ supabase ทั้งก้อน
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  new URL('../../app/api/sahamit/po/[id]/settle-deal/route.js', import.meta.url),
  'utf8',
);

test('chk() ต้องคืนผลสำเร็จ ไม่ใช่บันทึกคำเตือนแล้วเงียบ', () => {
  const chk = src.slice(src.indexOf('const chk ='), src.indexOf('const byCreated'));
  assert.match(chk, /return false;/, 'ล้มต้องคืน false');
  assert.match(chk, /return true;/, 'สำเร็จต้องคืน true');
});

test('ปิดดีลต้นทางต้องผูกกับ allMoved ทั้งสองทาง (ทั้งดีล / แบ่ง)', () => {
  // ทาง 'ทั้งดีล'
  assert.match(src, /closeAsMerged = allMoved;/,
    'ทาง "ทั้งดีล" ต้องปิดเฉพาะเมื่อย้ายครบ ไม่ใช่ปิดทันที');
  // ทาง 'แบ่ง'
  assert.match(src, /if \(allMoved && movedQty >= totalAllocAll\)/,
    'ทาง "แบ่ง" ต้องมี allMoved คู่กับการเทียบจำนวน');
  // ⚠️ เคยเขียน assertion ห้าม `closeAsMerged = true;` แบบเหมารวม แล้วมันจับสาขาที่
  // ถูกต้อง (`if (allMoved && …) { closeAsMerged = true; }`) ไปด้วย — เงื่อนไขสองข้อ
  // ข้างบนล็อกพฤติกรรมครบแล้ว ไม่ต้องมีข้อห้ามเหมารวมที่จับผิดตัว
});

test('แถวที่ย้ายไม่สำเร็จต้องไม่ถูกนับเป็นย้ายแล้ว', () => {
  assert.match(src, /if \(!rowMoved\) \{ allMoved = false; continue; \}/,
    'ต้อง continue ก่อนบวก movedQty/movedValue');
  // ลำดับสำคัญ: เช็ค rowMoved ต้องมาก่อนการบวกทั้งสองตัว
  const iCheck = src.indexOf('if (!rowMoved)');
  assert.ok(iCheck > 0 && iCheck < src.indexOf('movedQty += take;'), 'ต้องเช็คก่อนบวก movedQty');
  assert.ok(iCheck < src.indexOf('movedValue += take'), 'ต้องเช็คก่อนบวก movedValue');
});

test('แบ่งแถว: ลดของเดิม + เพิ่มแถวใหม่ ต้องสำเร็จทั้งคู่ถึงนับว่าย้ายแล้ว', () => {
  // ⚠️ ลดสำเร็จแต่เพิ่มล้ม = จำนวนหายทั้งก้อน (ต้นทางถูกหัก ดีลรวมไม่ได้รับ)
  assert.match(src, /rowMoved = cut && add;/);
});

test('ดีลที่ถูกปล่อยเปิดเพราะเขียนล้ม ต้องบอกผู้ใช้ให้กดซ้ำ', () => {
  const warns = src.match(/ยังเปิดอยู่ \(ย้ายพยากรณ์ไม่ครบ\)/g) || [];
  assert.equal(warns.length, 2, 'ต้องมีทั้งทาง "ทั้งดีล" และทาง "แบ่ง"');
  assert.match(src, /กดยืนยันซ้ำอีกครั้ง/);
});

test('ยังคงกติกาเดิม: ดีลหลายสินค้าที่ยังมี demand ค้าง ต้องไม่ถูกปิด', () => {
  // เทียบ movedQty กับ allocation รวมทุกสินค้าของดีล ไม่ใช่เฉพาะสินค้าที่ PO ครอบ
  assert.match(src, /const totalAllocAll = rowsAll\.reduce/);
});
