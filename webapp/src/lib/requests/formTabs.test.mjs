import { test } from 'node:test';
import assert from 'node:assert/strict';

import { missingRequiredByTab, requestFormTabs } from './formTabs.js';
import { requestFormBlocker } from '../master/requestCreate.js';

/* ⭐ เทสต์ที่สำคัญที่สุดของไฟล์นี้ — **เกจกับด่านส่งต้องเป็นความจริงเดียวกัน**
   เกจที่บอกว่าครบแล้วแต่ปุ่มยังกดไม่ได้ (หรือกลับกัน) แย่กว่าไม่มีเกจเลย
   เพราะผู้ใช้จะเลิกเชื่อทั้งสองอย่าง */
const base = {
  dept: 'RD', kind: 'info', dealId: 'DEAL-1', projectId: 'PRJ-1',
  title: 'ถามเรื่องขวด', requestedDueDate: '2026-08-20',
};

test('ไม่มีแท็บไหนขาด ⟺ ด่านส่งผ่าน (ทุกหัวข้อ ทุกช่องที่ถอดออกทีละตัว)', () => {
  const forms = [
    base,
    { ...base, kind: 'document', items: [{ docType: 'coa' }] },
    { ...base, kind: 'formula_dev', items: [{ categoryId: 1 }] },
    { ...base, kind: 'scent_dev', salesOrderId: 'SO-1' },
  ];
  for (const form of forms) {
    // ครบ → ทั้งสองฝั่งต้องบอกว่าผ่าน
    assert.equal(missingRequiredByTab(form).length, 0, `${form.kind}: เกจบอกว่าขาดทั้งที่ครบ`);
    assert.equal(requestFormBlocker(form), null, `${form.kind}: ด่านบอกว่าขาดทั้งที่ครบ`);

    // ถอดทีละช่อง → ทั้งสองฝั่งต้องบอกว่าขาดพร้อมกัน
    for (const key of ['title', 'requestedDueDate', 'dealId', 'salesOrderId', 'items']) {
      if (form[key] === undefined) continue;
      const broken = { ...form, [key]: Array.isArray(form[key]) ? [] : '' };
      const missing = missingRequiredByTab(broken).length > 0;
      const blocked = requestFormBlocker(broken) != null;
      assert.equal(missing, blocked, `${form.kind}/${key}: เกจกับด่านไม่ตรงกัน`);
    }
  }
});

test('งานด่วนที่ยังไม่บอกเหตุผล นับเป็นของขาดของแท็บกำหนด', () => {
  const urgent = { ...base, urgent: true };
  const missing = missingRequiredByTab(urgent);
  assert.deepEqual(missing, [{ tab: 'due', label: 'เหตุผลที่เป็นงานด่วน' }]);
  assert.notEqual(requestFormBlocker(urgent), null);
  assert.equal(missingRequiredByTab({ ...urgent, urgentReason: 'ลูกค้าออกบูธวันที่ 20' }).length, 0);
});

test('ตัวหารนับเฉพาะช่องบังคับที่ใช้จริงกับหัวข้อนั้น', () => {
  const info = requestFormTabs(base);
  const work = info.find((t) => t.key === 'work');
  // สอบถามข้อมูลต้องมีดีล + โครงการของดีล — ไม่มีใบสั่งขาย
  assert.equal(work.required.total, 2);
  assert.equal(work.required.filled, 2);
  assert.equal(info.some((t) => t.key === 'pdr'), false, 'หัวข้อที่ไม่มี PDR ต้องไม่มีแท็บ PDR');

  const scent = requestFormTabs({ ...base, kind: 'scent_dev', salesOrderId: 'SO-1' });
  assert.equal(scent.some((t) => t.key === 'pdr'), true);
  // พัฒนากลิ่นยึดใบสั่งขาย ไม่ได้ยึดดีล ⇒ แท็บงานมีช่องบังคับตัวเดียว
  assert.equal(scent.find((t) => t.key === 'work').required.total, 1);
});

test('ยังไม่เลือกดีล = ขาด "ดีล" ไม่ใช่ขาด "โครงการ"', () => {
  const missing = missingRequiredByTab({ ...base, dealId: '', projectId: '' });
  assert.deepEqual(missing.map((m) => m.label), ['ดีล']);
});

test('เกจช่องไม่บังคับของ PDR นับตามที่กรอกจริง', () => {
  const form = {
    ...base, kind: 'scent_dev', salesOrderId: 'SO-1',
    pdr: { customerBrand: 'Vanique', moodTone: 'อบอุ่น' },
    briefs: [{ label: 'กลิ่นที่ 1' }, { label: '' }],
  };
  const pdr = requestFormTabs(form).find((t) => t.key === 'pdr');
  assert.ok(pdr.optional.total > 20, 'PDR ต้องนับช่องทั้งแบบฟอร์ม');
  // 2 ช่องที่กรอก + 1 บรีฟที่ตั้งชื่อแล้ว
  assert.equal(pdr.optional.filled, 3);
  assert.equal(pdr.required.total, 0, 'PDR ไม่มีช่องบังคับสักช่อง');
});
