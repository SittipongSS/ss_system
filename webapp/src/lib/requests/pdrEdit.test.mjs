// ── สิทธิ์แก้ PDR ตามขั้นของใบ ──────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditPdr, editPdrError, pdrEditor } from './pdrEdit.js';

const ae = { id: 'U-AE', role: 'ae' };
const rd = { id: 'U-RD', role: 'rd', department: 'RD' };
const req = (over = {}) => ({
  kind: 'scent_dev', dept: 'RD', requestedById: 'U-AE', status: 'draft', ...over,
});

test('⭐ สิทธิ์สลับมือที่จังหวะ "รับเรื่อง"', () => {
  for (const status of ['draft', 'pending']) {
    assert.equal(pdrEditor(req({ status })), 'requester', status);
    assert.ok(canEditPdr(ae, req({ status })));
    assert.ok(!canEditPdr(rd, req({ status })));
  }
  for (const status of ['acknowledged', 'answered']) {
    assert.equal(pdrEditor(req({ status })), 'dept', status);
    assert.ok(canEditPdr(rd, req({ status })));
    assert.ok(!canEditPdr(ae, req({ status })));
  }
});

test('ตีกลับคืนใบเป็นร่าง ⇒ สิทธิ์กลับไปที่ผู้ขอเอง ไม่ต้องมีกฎแยก', () => {
  const bounced = req({ status: 'draft', bounceReason: 'ข้อมูลไม่ครบ' });
  assert.ok(canEditPdr(ae, bounced));
  assert.ok(!canEditPdr(rd, bounced));
});

test('ปิดเรื่อง/ยกเลิกแล้วแก้ไม่ได้ทั้งคู่ — ใบที่จบแล้วเป็นบันทึก', () => {
  for (const status of ['closed', 'cancelled']) {
    assert.equal(pdrEditor(req({ status })), null);
    assert.ok(!canEditPdr(ae, req({ status })));
    assert.ok(!canEditPdr(rd, req({ status })));
    assert.match(editPdrError(req({ status }), ae), /ปิดแล้ว/);
  }
});

test('หัวข้อที่ไม่มี PDR ไม่มีสิทธิ์นี้เลย', () => {
  for (const kind of ['info', 'document', 'product_dev']) {
    assert.equal(pdrEditor(req({ kind })), null);
    assert.match(editPdrError(req({ kind }), ae), /ไม่มีแบบฟอร์ม PDR/);
  }
});

test('⚠️ ข้อความบอกว่าตอนนี้เป็นของใคร ไม่ใช่แค่ "แก้ไม่ได้"', () => {
  // คนที่กดแล้วโดนปฏิเสธต้องรู้ว่าต้องไปบอกใครให้แก้ให้
  assert.match(editPdrError(req({ status: 'draft' }), rd), /เฉพาะผู้เปิดคำร้อง/);
  assert.match(editPdrError(req({ status: 'acknowledged' }), ae), /เฉพาะ RD/);
});

// ⭐ ประโยคนี้มีมาตั้งแต่ mig 0216 แต่ถูกเรียกที่ route เท่านั้น ⇒ **จอไม่เคยแสดง**
// (ผลตรวจ 2026-08-17): ปุ่ม "แก้ไข" ของอีกฝั่งหายไปเฉย ๆ แล้วคนกดต้องเดาเองว่าต้อง
// ไปบอกใคร · เทสต์นี้ล็อกว่า route ส่งเหตุผลขึ้นจอคู่กับสิทธิ์ **ทุกจุดที่ตอบกลับ**
// — ตอบแค่ `_canEditPdr` เมื่อไร หน้าจอจะรู้ว่า "กดไม่ได้" แต่ไม่รู้ว่าทำไม
test('⭐ route ส่ง `_editPdrBlocker` คู่กับ `_canEditPdr` ทุกจุดที่ตอบกลับ', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/app/api/sa/requests/[id]/route.js', 'utf8');
  const grants = (src.match(/_canEditPdr:/g) || []).length;
  const reasons = (src.match(/_editPdrBlocker:/g) || []).length;
  assert.ok(grants > 0, 'route ต้องคืนสิทธิ์แก้ PDR');
  assert.equal(reasons, grants, 'ทุกจุดที่คืนสิทธิ์ ต้องคืนเหตุผลด้วย');
});
