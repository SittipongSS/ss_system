// ── ข้อความในกล่องยืนยัน "รับเรื่อง" (มติเจ้าของ 23/09 — ปุ่มเดียวกันสองหน้า) ───────────────
//
// ⭐ ยกออกจาก `app/requests/[id]/page.js` ให้การ์ดคำร้องบนหน้าจัดคิวใช้ข้อความชุดเดียวกัน
//    ⇒ ล็อกว่าข้อความ **เท่าของเดิมทุกตัวอักษร** ทุกสาขา (ประเมินพื้นที่ · หัวข้ออื่น · PDR สองโหมด · NPD)
//    ค่าที่คาดไว้ลอกมาจากโค้ดเดิมที่ origin/main f2162535
import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeConfirmCopy } from './acknowledgeConfirm.js';

const BEFORE_AUTO = new Date('2026-08-15T03:00:00Z'); // ก่อนเดือนที่ระบบออกเลข PDR ให้เอง (2609)
const AUTO = new Date('2026-09-23T03:00:00Z');

test('⭐ ใบประเมินพื้นที่: ขั้นถัดไปคือ "ลงคิวเข้าพื้นที่" (ไม่ใช่ปุ่ม "แจ้งกำหนดส่ง" ที่ไม่มีบนจอ)', () => {
  const copy = acknowledgeConfirmCopy({ kind: 'site_survey', dept: 'TS', docNo: 'AS-26090001' });
  assert.deepEqual(copy, {
    title: 'รับเรื่อง',
    description: 'AS-26090001',
    detail: 'ใบนี้จะเข้าคิวของ TS ทันที และนับเป็นงานที่ TS รับไว้แล้ว'
      + ' · ยังไม่ต้องระบุวันตอนนี้ — ใบจะไปอยู่สถานะ "รอกำหนดส่ง"'
      + ' แล้วกด "ลงคิวเข้าพื้นที่" เมื่อรู้วัน เวลา และเจ้าหน้าที่ที่จะไป',
    confirmLabel: 'รับเรื่อง',
  });
});

test('หัวข้ออื่น: ขั้นถัดไปคือ "แจ้งกำหนดส่ง" · ไม่มีเลขที่ = คำอธิบายว่าง', () => {
  const copy = acknowledgeConfirmCopy({ kind: 'formula_dev', variant: 'standard', dept: 'RD' });
  assert.equal(copy.description, '');
  assert.equal(copy.detail,
    'ใบนี้จะเข้าคิวของ RD ทันที และนับเป็นงานที่ RD รับไว้แล้ว'
    + ' · ยังไม่ต้องระบุวันกำหนดส่งตอนนี้ — ใบจะไปอยู่สถานะ "รอกำหนดส่ง"'
    + ' แล้วกด "แจ้งกำหนดส่ง" เมื่อรู้วันจริง');
  assert.doesNotMatch(copy.detail, /ลงคิวเข้าพื้นที่/);
});

test('ใบ PDR: บอกว่าได้เลขที่เอกสารในจังหวะเดียวกันไหม (สองโหมดตามเดือน)', () => {
  const scent = { kind: 'scent_dev', dept: 'RD', docNo: 'RQ-1' };
  assert.match(acknowledgeConfirmCopy(scent, { now: AUTO }).detail,
    / · ระบบจะออกเลขที่เอกสารของ PDR \(วันที่วันนี้\) ให้ในจังหวะเดียวกัน$/);
  assert.match(acknowledgeConfirmCopy(scent, { now: BEFORE_AUTO }).detail,
    / · เดือนนี้ยังไม่ออกเลขให้เอง — รับเรื่องแล้วกด "กรอกเลขที่เอกสาร" ใส่เลขจากกระดาษ$/);
  // มีเลขแล้ว = ไม่ออกซ้ำ ⇒ บอกทางกรอกเอง (ตรงกับ issuesPdrRefNoOnAcknowledge)
  assert.match(acknowledgeConfirmCopy({ ...scent, pdrRefNo: '230926-001' }, { now: AUTO }).detail, /ยังไม่ออกเลขให้เอง/);
  // ใบประเมินไม่มี PDR — ไม่มีประโยคเรื่องเลข
  assert.doesNotMatch(acknowledgeConfirmCopy({ kind: 'site_survey', dept: 'TS' }, { now: AUTO }).detail, /PDR|เลขที่เอกสาร/);
});

test('พัฒนาสูตร NPD: บอกล่วงหน้าว่าแตกเป็นรายการส่งสูตรกี่รายการ (คู่หมวด × กลิ่นที่ไม่ซ้ำ)', () => {
  const npd = {
    kind: 'formula_dev', variant: 'npd', dept: 'RD', docNo: 'RQ-2',
    targets: [
      { categoryCode: '01', scentId: 'SC-1', size: '50ml' },
      { categoryCode: '01', scentId: 'SC-1', size: '100ml' }, // สเปรย์กลิ่นเดียวหลายขนาด = สูตรเดียว
      { categoryCode: '02', scentId: 'SC-1' },
    ],
    items: [],
  };
  const { detail } = acknowledgeConfirmCopy(npd, { now: AUTO });
  assert.match(detail, / · ระบบจะแตกสินค้าในแบบฟอร์ม PDR เป็นรายการส่งสูตร 2 รายการ \(หนึ่งรายการต่อคู่หมวด × กลิ่น\)$/);
  // ไม่มีคู่ให้แตก = ไม่พูดถึง
  assert.doesNotMatch(acknowledgeConfirmCopy({ ...npd, targets: [] }, { now: AUTO }).detail, /แตกสินค้า/);
});
