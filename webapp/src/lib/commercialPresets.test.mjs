import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_PRESET_LIMITS,
  commercialPresetSummary,
  fullPaymentInstallment,
  isFullPaymentPlan,
  normalizeCommercialPresetInput,
  normalizeCommercialPresetKind,
} from './commercialPresets.js';
import { MAX_INSTALLMENTS } from './sales/paymentPlan.js';

const paymentInput = {
  title: 'โอน · เครดิต 30 วัน',
  paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
  paymentTerms: 'เครดิต 30 วันนับจากวันส่งมอบ',
  installments: [
    { label: 'มัดจำ', percent: 50, trigger: 'เมื่ออนุมัติใบเสนอราคา', dueRule: 'ภายใน 7 วัน', note: '' },
    { label: 'ส่วนที่เหลือ', percent: 50, trigger: 'ก่อนส่งมอบ', dueRule: '', note: '' },
  ],
  changeNote: 'ตั้งชุดเริ่มต้น',
};

test('kind: รับเฉพาะ payment/remarks และเติม documentKey ให้เอง', () => {
  assert.deepEqual(normalizeCommercialPresetKind({ kind: 'payment' }).value, { documentKey: 'quotation', kind: 'payment' });
  assert.deepEqual(normalizeCommercialPresetKind({ kind: 'remarks' }).errors, []);
  assert.match(normalizeCommercialPresetKind({ kind: 'scope' }).errors.join(' '), /ชนิดคลังไม่ถูกต้อง/);
  assert.match(normalizeCommercialPresetKind({ kind: 'payment', documentKey: 'salesOrder' }).errors.join(' '), /ชนิดเอกสารไม่ถูกต้อง/);
});

test('ชุดการชำระ: normalize เนื้อหาครบและตัดช่องของอีกคลังทิ้ง', () => {
  const result = normalizeCommercialPresetInput({ ...paymentInput, remarks: 'ไม่ควรติดมา' }, { kind: 'payment' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.paymentMethod, 'โอนเงินเข้าบัญชีบริษัท');
  assert.equal(result.value.installments.length, 2);
  assert.equal(result.value.installments[0].note, null);
  // ช่องของคลังหมายเหตุต้องไม่ปนเข้ามา
  assert.equal(result.value.remarks, null);
});

test('ชุดหมายเหตุ: บังคับข้อความ และไม่เก็บข้อมูลการชำระ', () => {
  const ok = normalizeCommercialPresetInput({ title: 'หมายเหตุ SCENT', remarks: 'ราคานี้ไม่รวมค่าขนส่ง', ...paymentInput, kind: undefined }, { kind: 'remarks' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.remarks, 'ราคานี้ไม่รวมค่าขนส่ง');
  assert.equal(ok.value.paymentMethod, null);
  assert.equal(ok.value.paymentTerms, null);
  assert.deepEqual(ok.value.installments, []);

  const missing = normalizeCommercialPresetInput({ title: 'หมายเหตุ NPD' }, { kind: 'remarks' });
  assert.match(missing.errors.join(' | '), /กรุณาระบุรายละเอียดหมายเหตุ/);
});

test('ชุดการชำระ: ต้องมีชื่อชุดและวิธีชำระเสมอ', () => {
  const result = normalizeCommercialPresetInput({ installments: [fullPaymentInstallment()] }, { kind: 'payment' });
  assert.match(result.errors.join(' | '), /กรุณาระบุชื่อชุด/);
  assert.match(result.errors.join(' | '), /กรุณาระบุวิธีชำระเงิน/);
});

test('ตารางงวด: ชำระเต็มจำนวน = 1 แถว 100% ผ่านได้', () => {
  const result = normalizeCommercialPresetInput({
    ...paymentInput,
    installments: [fullPaymentInstallment()],
  }, { kind: 'payment' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.installments.length, 1);
  assert.equal(result.value.installments[0].percent, 100);
  assert.ok(isFullPaymentPlan(result.value.installments));
});

test('ตารางงวด: ห้ามว่าง และผลรวมต้องเท่ากับ 100', () => {
  const empty = normalizeCommercialPresetInput({ ...paymentInput, installments: [] }, { kind: 'payment' });
  assert.match(empty.errors.join(' | '), /อย่างน้อย 1 งวด/);

  const short = normalizeCommercialPresetInput({ ...paymentInput, installments: [{ label: 'มัดจำ', percent: 40 }] }, { kind: 'payment' });
  assert.match(short.errors.join(' | '), /รวมต้องเท่ากับ 100/);
});

test('เพดานงวดของคลังต้องเท่ากับที่ฟอร์มใบเสนอราคารับไหว', () => {
  assert.equal(COMMERCIAL_PRESET_LIMITS.installmentCount, MAX_INSTALLMENTS);
  const rows = Array.from({ length: MAX_INSTALLMENTS + 1 }, (_, index) => ({
    label: `งวด ${index + 1}`,
    percent: 100 / (MAX_INSTALLMENTS + 1),
  }));
  const result = normalizeCommercialPresetInput({ ...paymentInput, installments: rows }, { kind: 'payment' });
  assert.match(result.errors.join(' | '), new RegExp(`ไม่เกิน ${MAX_INSTALLMENTS} งวด`));
});

test('isFullPaymentPlan: จริงเฉพาะแถวเดียว 100%', () => {
  assert.ok(isFullPaymentPlan([{ percent: 100 }]));
  assert.equal(isFullPaymentPlan([{ percent: 50 }, { percent: 50 }]), false);
  assert.equal(isFullPaymentPlan([]), false);
  assert.equal(isFullPaymentPlan(null), false);
});

test('สรุปในตาราง: แยกข้อความตามชนิดคลัง', () => {
  assert.equal(commercialPresetSummary('payment', null), 'ยังไม่มีเวอร์ชันใช้งาน');
  assert.equal(
    commercialPresetSummary('payment', { paymentMethod: 'โอน', installments: [{ percent: 100 }] }),
    'โอน · ชำระเต็มจำนวน',
  );
  assert.equal(
    commercialPresetSummary('payment', { paymentMethod: 'โอน', installments: [{ percent: 50 }, { percent: 50 }] }),
    'โอน · แบ่ง 2 งวด',
  );
  assert.equal(commercialPresetSummary('remarks', { remarks: 'บรรทัดแรก\nบรรทัดสอง' }), 'บรรทัดแรก');
  assert.equal(commercialPresetSummary('remarks', { remarks: '' }), 'ยังไม่ระบุหมายเหตุ');
});
