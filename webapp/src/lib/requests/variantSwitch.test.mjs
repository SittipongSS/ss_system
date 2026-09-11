// ── รูปแบบงานในหัวข้อเดียว: พัฒนาสูตร standard | NPD (มติผู้ใช้ 2026-09-09) ──
//
// 🔴 **ก่อนงานนี้ ไม่มีเทสต์สักตัวแตะ `hasPdr` เลยทั้งรีโป** (grep ยืนยัน) — ธงที่ตัดสิน
// ~30 ด่าน (ฟอร์ม · สิทธิ์แก้ · เลขที่เอกสาร · ตัวพิมพ์เอกสาร) ไม่มีตาข่ายอะไรรองอยู่
// ⇒ ไฟล์นี้ปิดช่องนั้นพร้อมกับของใหม่ ไม่ใช่ทดสอบเฉพาะของใหม่
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestLineShape,
  requestUsesItems,
  requestUsesPdr,
  requestVariantError,
  requestVariantKey,
  requestVariantLabel,
  requestKindLabelFull,
  requestShapeError,
  requestPdrScentSource,
  requestPdrRowsPickScent,
  requestUsesScentBriefs,
} from '../master/requestTypes.js';
import { requestVariantLock, requestVariantSwitchError } from './variantSwitch.js';
import { assertKind } from './kinds/registry.js';

const npd = (over = {}) => ({ kind: 'formula_dev', variant: 'npd', ...over });
const std = (over = {}) => ({ kind: 'formula_dev', variant: 'standard', ...over });

test('พัฒนาสูตรตอบคนละรูปทรงตามรูปแบบ — ไม่ใช่ตอบตามชื่อหัวข้อ', () => {
  assert.equal(requestUsesItems(std()), true);
  assert.equal(requestUsesPdr(std()), false, 'standard ยังใช้ช่องรายละเอียดเหมือนเดิม (ม-40)');

  assert.equal(requestUsesItems(npd()), false, 'NPD ไม่มีตารางรายการ');
  assert.equal(requestUsesPdr(npd()), true, 'NPD ใช้แบบฟอร์ม PDR');

  // 🔴 ตัวที่ทำให้ตาราง **หายจากจอจริง ๆ** คือรูปร่างบรรทัด ไม่ใช่ `hasItems`
  // (`RequestEditableFields` เลือกตารางจากค่านี้) — ตกหล่นตัวนี้ = ฟอร์มโชว์ PDR
  // พร้อมตาราง หมวด × กลิ่น ค้างอยู่ข้าง ๆ
  assert.equal(requestLineShape(std()), 'product_dev');
  assert.equal(requestLineShape(npd()), null);
});

test('ใบเก่า/ค่าเพี้ยน ตกไปที่รูปแบบตั้งต้น ไม่ใช่พัง', () => {
  assert.equal(requestVariantKey({ kind: 'formula_dev' }), 'standard');
  assert.equal(requestVariantKey({ kind: 'formula_dev', variant: '' }), 'standard');
  assert.equal(requestVariantKey({ kind: 'formula_dev', variant: 'mystery' }), 'standard');
  // หัวข้อที่ไม่มีรูปแบบให้เลือกต้องตอบ null — ไม่ใช่แต่งรูปแบบขึ้นมาเอง
  assert.equal(requestVariantKey({ kind: 'scent_dev', variant: 'npd' }), null);
  assert.equal(requestUsesPdr({ kind: 'scent_dev' }), true, 'พัฒนากลิ่นยังใช้ PDR เหมือนเดิม');
  assert.equal(requestUsesItems({ kind: 'document' }), true, 'หัวข้ออื่นไม่ถูกกระทบ');
});

test('ค่ารูปแบบที่ไม่มีในทะเบียนถูกตีกลับพร้อมบอกว่าหัวข้อไหน', () => {
  assert.equal(requestVariantError('formula_dev', 'npd'), null);
  assert.equal(requestVariantError('formula_dev', ''), null, 'ว่าง = ใช้ตัวตั้งต้น ไม่ใช่ error');
  assert.match(requestVariantError('formula_dev', 'mystery'), /ไม่มีในหัวข้อ/);
  assert.match(requestVariantError('info', 'npd'), /ไม่มีรูปแบบให้เลือก/);
});

test('ด่านตอนสร้าง: NPD ไม่มีตารางรายการ ⇒ ส่งแถวมาต้องถูกตีกลับ', () => {
  const base = { title: 'ขอพัฒนาสินค้าใหม่', dealId: 'D-1', requestedDueDate: '2026-09-30' };
  // standard ยังบังคับ ≥1 แถวเหมือนเดิม
  assert.match(requestShapeError('formula_dev', { ...base }), /ต้องมีรายการอย่างน้อย 1 รายการ/);
  assert.equal(requestShapeError('formula_dev', { ...base, items: [{}] }), null);

  // NPD เปิดใบได้โดยไม่มีแถวเลย
  assert.equal(requestShapeError('formula_dev', { ...base, variant: 'npd' }), null);
  // 🔴 แต่ถ้ามีแถวหลุดมาต้องตีกลับ ไม่ใช่เขียนลงเงียบ ๆ — แถวที่มองไม่เห็นบนจอ
  // ยังถูกนับใน `requestProgress` และค้างเป็นสูตรที่ไม่มีใครรู้ที่มา
  assert.match(
    requestShapeError('formula_dev', { ...base, variant: 'npd', items: [{}] }),
    /ไม่มีตารางรายการ/,
  );
  assert.match(requestShapeError('formula_dev', { ...base, variant: 'mystery' }), /ไม่มีในหัวข้อ/);
});

test('สลับรูปแบบได้ถึงก่อนรับเรื่อง — หลังจากนั้นบอกเหตุ ไม่ใช่เงียบ', () => {
  assert.equal(requestVariantLock(std({ status: 'draft' })), null);
  assert.equal(requestVariantLock(std({ status: 'pending' })), null);
  assert.match(requestVariantLock(std({ status: 'acknowledged' })), /รับเรื่องไปแล้ว/);
  assert.match(requestVariantLock(std({ status: 'answered' })), /รับเรื่องไปแล้ว/);
  assert.match(requestVariantLock(std({ status: 'cancelled' })), /ยกเลิก/);
  // เลขที่ FM-RD-01 ออกแล้วห้ามสลับ — DB ห้ามแก้เลขนั้นตลอดกาล (mig 0271/0272)
  assert.match(
    requestVariantLock(npd({ status: 'pending', pdrRefNo: '100926-003' })),
    /ออกเลขที่แบบฟอร์ม 100926-003/,
  );
});

test('ด่านสลับ: ค่าเดิมผ่านเสมอ · แถวค้างต้องให้ลบเอง ไม่ลบให้', () => {
  const draft = std({ status: 'draft' });
  assert.equal(requestVariantSwitchError(draft, 'standard', [{}, {}]), null, 'ไม่ได้สลับ = ไม่ตรวจ');
  assert.equal(requestVariantSwitchError(draft, '', [{}]), null, 'ไม่ส่งมา = ไม่แตะ');

  // ⚠️ ลบแถวออกให้หมดแล้วสลับในบันทึกครั้งเดียวต้องผ่าน — ด่านอ่าน **แถวชุดใหม่**
  assert.equal(requestVariantSwitchError(draft, 'npd', []), null);
  assert.match(requestVariantSwitchError(draft, 'npd', [{}, {}]), /ลบรายการ 2 แถวออกก่อน/);
  // สลับกลับมา standard ไม่ต้องลบอะไร (ของ PDR ไม่ถูกลบ — อยู่คนละคอลัมน์)
  assert.equal(requestVariantSwitchError(npd({ status: 'pending' }), 'standard', []), null);
  assert.match(requestVariantSwitchError(std({ status: 'acknowledged' }), 'npd', []), /รับเรื่องไปแล้ว/);
});

test('ป้ายบนคิวบอกรูปแบบเมื่อไม่ใช่ตัวตั้งต้น — และต้องค้นเจอด้วยคำนั้น', () => {
  assert.equal(requestKindLabelFull(std()), 'พัฒนาสูตร', 'ตัวตั้งต้นไม่ต่อท้าย');
  assert.equal(requestKindLabelFull(npd()), 'พัฒนาสูตร · NPD');
  assert.equal(requestKindLabelFull({ kind: 'scent_dev' }), 'พัฒนากลิ่น');
  assert.equal(requestVariantLabel(npd()), 'NPD');
});

test('ทะเบียนตีกลับรูปแบบที่ประกาศผิดตั้งแต่ตอนโหลด', () => {
  const base = { key: 'x_test', label: 'x', scope: 'XT', dept: 'RD' };
  const bad = [
    [{ ...base, variants: { a: { label: 'A' } } }, /อย่างน้อย 2 รูปแบบ/],
    [{ ...base, variants: { a: { label: 'A' }, b: { label: 'B' } } }, /ต้องบอก defaultVariant/],
    [{ ...base, defaultVariant: 'c', variants: { a: { label: 'A' }, b: { label: 'B' } } }, /ไม่มีใน variants/],
    [{ ...base, defaultVariant: 'a', variants: { a: {}, b: { label: 'B' } } }, /ต้องมี label/],
    // รูปทรงในรูปแบบโดนกฎชุดเดียวกับหัวข้อธรรมดา
    [{ ...base, defaultVariant: 'a', variants: { a: { label: 'A', hasItems: true }, b: { label: 'B' } } }, /hasItems ต้องมากับ lineShape/],
    [{ ...base, defaultVariant: 'a', variants: { a: { label: 'A', lineShape: 'product_dev' }, b: { label: 'B' } } }, /lineShape ต้องมากับ hasItems/],
    [{ ...base, defaultVariant: 'a', variants: { a: { label: 'A', hasItems: true, lineShape: 'product_dev', deliversRows: true }, b: { label: 'B' } } }, /deliversRows/],
    // ประกาศธงรูปทรงสองชั้นพร้อมกัน = แหล่งความจริงสองที่
    [{ ...base, hasPdr: true, defaultVariant: 'a', variants: { a: { label: 'A' }, b: { label: 'B' } } }, /ย้ายไปไว้ในรูปแบบ/],
    // คีย์ระดับบนสุดที่พิมพ์ผิดต้องพังตอน build ไม่ใช่เงียบ
    [{ ...base, varaints: {} }, /ไม่ใช่คีย์ที่ทะเบียนรู้จัก/],
    [{ ...base, hasPdr: 'yes' }, /ต้องเป็น true\/false/],
    // ⭐ ใช้ PDR แล้วต้องบอกว่ากลิ่นมาจากไหน (mig 0352) — ไม่บอก = ฟอร์มเดาเอง
    [{ ...base, hasPdr: true }, /ต้องบอก pdrScents/],
    [{ ...base, hasPdr: true, pdrScents: 'magic' }, /ต้องบอก pdrScents/],
    [{ ...base, pdrScents: 'briefs' }, /ใช้ได้เฉพาะรูปทรงที่มี hasPdr/],
  ];
  for (const [kind, re] of bad) {
    assert.throws(() => assertKind(kind), re, JSON.stringify(kind));
  }
});

test('⭐ ที่มาของกลิ่นใน PDR: พัฒนากลิ่น = บรีฟ · พัฒนาสูตร NPD = ทะเบียนรายแถว (มติผู้ใช้ 2026-09-11)', () => {
  assert.equal(requestPdrScentSource({ kind: 'scent_dev' }), 'briefs');
  assert.equal(requestUsesScentBriefs({ kind: 'scent_dev' }), true);
  assert.equal(requestPdrRowsPickScent({ kind: 'scent_dev' }), false);

  assert.equal(requestPdrScentSource(npd()), 'registry');
  assert.equal(requestUsesScentBriefs(npd()), false, 'NPD ไม่มีบรีฟกลิ่น — กลิ่นใหม่เกิดที่พัฒนากลิ่นเท่านั้น (ม-40)');
  assert.equal(requestPdrRowsPickScent(npd()), true);

  // ไม่มี PDR = ไม่มีคำตอบ ไม่ใช่เดาเป็นบรีฟ
  assert.equal(requestPdrScentSource(std()), null);
  assert.equal(requestUsesScentBriefs(std()), false);
  assert.equal(requestPdrScentSource({ kind: 'info' }), null);
});
