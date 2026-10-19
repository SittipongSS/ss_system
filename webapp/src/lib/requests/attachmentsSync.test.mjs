// ── สองแผงไฟล์แนบของใบเดียวกันซิงก์กัน (ผลรีวิวรอบแก้ S4) — ก้าวซิงก์ต้องไม่วนและไม่นับ "ยังไม่รู้" ─────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentsSignature, attachmentsSyncStep } from './attachmentsSync.js';

test('ลายมือชื่อ = id เรียง · ลำดับไม่มีผล · แถวไม่มี id ไม่นับ · ไม่ใช่ลิสต์ = ว่าง', () => {
  assert.equal(attachmentsSignature([{ id: 'B' }, { id: 'A' }]), 'A|B');
  assert.equal(attachmentsSignature([{ id: 'A' }, { id: 'B' }]), attachmentsSignature([{ id: 'B' }, { id: 'A' }]));
  assert.equal(attachmentsSignature([{ id: 'A' }, {}, null]), 'A');
  assert.equal(attachmentsSignature(null), '');
});

test('ครั้งแรกที่รู้ = จำไว้ ไม่ขยับ · ยังโหลดไม่ได้ = ไม่แตะของที่จำ', () => {
  assert.deepEqual(attachmentsSyncStep(null, [{ id: 'A' }], { loaded: true }), { signature: 'A', bump: false });
  assert.deepEqual(attachmentsSyncStep(null, [], { loaded: false }), { signature: null, bump: false });
  assert.deepEqual(attachmentsSyncStep('A', [], { loaded: false }), { signature: 'A', bump: false }, '"ยังไม่รู้" ไม่ใช่ "ไม่มีไฟล์"');
});

test('🔴 แผงหนึ่งแนบ/ลบ = ขยับ · แผงอื่นโหลดใหม่ได้ชุดเดิม = ไม่ขยับอีก (ไม่วน)', () => {
  // การ์ดทั่วไปแนบแบบ (ชนิดสเปก) → ลายมือชื่อเปลี่ยน → ขยับให้บล็อกไฟล์บังคับโหลดใหม่ (ตัวนับของด่านส่งตามทัน)
  const added = attachmentsSyncStep('A', [{ id: 'A' }, { id: 'P' }], { loaded: true });
  assert.deepEqual(added, { signature: 'A|P', bump: true });
  // บล็อกไฟล์บังคับโหลดใหม่ได้ชุดเดียวกัน → หยุด
  assert.deepEqual(attachmentsSyncStep(added.signature, [{ id: 'P' }, { id: 'A' }], { loaded: true }), { signature: 'A|P', bump: false });
  // ลบแบบใบเดียวจากการ์ดทั่วไป → ขยับ (บล็อกไฟล์บังคับต้องไม่ยังโชว์ใบที่ลบแล้ว)
  assert.deepEqual(attachmentsSyncStep('A|P', [{ id: 'A' }], { loaded: true }), { signature: 'A', bump: true });
});
