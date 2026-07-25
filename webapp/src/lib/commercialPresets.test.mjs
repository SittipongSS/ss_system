import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_PRESET_KIND_LABELS,
  commercialPresetSummary,
  isEmptyPaymentValue,
  matchesPaymentPreset,
  matchesRemarksPreset,
  normalizeCommercialPresetInput,
  normalizeCommercialPresetKind,
  paymentPresetToFormValue,
  publishedCommercialPresetOptions,
  remarksPresetToFormValue,
} from './commercialPresets.js';

const paymentInput = {
  title: 'โอน · เครดิต 30 วัน',
  paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
  paymentTerms: 'เครดิต 30 วันนับจากวันส่งมอบ',
  installments: [
    { label: 'มัดจำ', percent: 50 },
    { label: 'ส่วนที่เหลือ', percent: 50 },
  ],
  changeNote: 'ตั้งชุดเริ่มต้น',
};

test('kind: รับเฉพาะ payment/remarks และเติม documentKey ให้เอง', () => {
  assert.deepEqual(normalizeCommercialPresetKind({ kind: 'payment' }).value, { documentKey: 'quotation', kind: 'payment' });
  assert.deepEqual(normalizeCommercialPresetKind({ kind: 'remarks' }).errors, []);
  assert.match(normalizeCommercialPresetKind({ kind: 'scope' }).errors.join(' '), /ชนิดคลังไม่ถูกต้อง/);
  assert.match(normalizeCommercialPresetKind({ kind: 'payment', documentKey: 'salesOrder' }).errors.join(' '), /ชนิดเอกสารไม่ถูกต้อง/);
});

test('payment preset: เก็บเฉพาะวิธีและข้อความเงื่อนไข ไม่เก็บงวด', () => {
  const result = normalizeCommercialPresetInput({ ...paymentInput, remarks: 'ไม่ควรติดมา' }, { kind: 'payment' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.paymentMethod, 'โอนเงินเข้าบัญชีบริษัท');
  assert.equal(result.value.paymentTerms, 'เครดิต 30 วันนับจากวันส่งมอบ');
  assert.deepEqual(result.value.installments, []);
  assert.equal(result.value.remarks, null);
});

test('payment preset: บังคับชื่อและวิธีชำระ แต่ไม่ validate งวด', () => {
  const missing = normalizeCommercialPresetInput({ installments: [{ percent: 40 }] }, { kind: 'payment' });
  assert.match(missing.errors.join(' | '), /กรุณาระบุชื่อชุด/);
  assert.match(missing.errors.join(' | '), /กรุณาระบุวิธีชำระเงิน/);
  assert.doesNotMatch(missing.errors.join(' | '), /งวด|เปอร์เซ็นต์/);
});

test('remarks preset: บังคับข้อความและตัดข้อมูล payment ทิ้ง', () => {
  const result = normalizeCommercialPresetInput({
    ...paymentInput,
    title: 'หมายเหตุ SCENT',
    remarks: 'ราคานี้ไม่รวมค่าขนส่ง',
  }, { kind: 'remarks' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.paymentMethod, null);
  assert.equal(result.value.paymentTerms, null);
  assert.deepEqual(result.value.installments, []);
  assert.equal(result.value.remarks, 'ราคานี้ไม่รวมค่าขนส่ง');
});

test('ชื่อคลัง payment สื่อว่าเป็นเทมเพลตเงื่อนไข ไม่ใช่งวด', () => {
  assert.equal(COMMERCIAL_PRESET_KIND_LABELS.payment, 'เทมเพลตเงื่อนไขการชำระ');
});

const PAYMENT_OPTION = Object.freeze({
  versionId: 'ver-pay-1',
  title: 'โอน · เครดิต 30 วัน',
  paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
  paymentTerms: 'เครดิต 30 วัน',
  installments: [
    { label: 'มัดจำ', percent: 50 },
    { label: 'ส่วนที่เหลือ', percent: 50 },
  ],
});

test('payment preset → ฟอร์ม: เติมเฉพาะวิธีและข้อความ ไม่แตะชนิดหรืองวด', () => {
  assert.deepEqual(paymentPresetToFormValue(PAYMENT_OPTION), {
    paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
    paymentTerms: 'เครดิต 30 วัน',
  });
  assert.equal(paymentPresetToFormValue(null), null);
});

test('เทียบ payment preset จากวิธีและข้อความเท่านั้น', () => {
  const applied = {
    ...paymentPresetToFormValue(PAYMENT_OPTION),
    type: 'installment',
    installments: [{ label: 'งวดเดียวที่แก้เอง', percent: 100 }],
  };
  assert.equal(matchesPaymentPreset(applied, PAYMENT_OPTION), true);
  assert.equal(matchesPaymentPreset({ ...applied, paymentTerms: 'เครดิต 45 วัน' }, PAYMENT_OPTION), false);
  assert.equal(matchesPaymentPreset({ ...applied, paymentMethod: 'เช็ค' }, PAYMENT_OPTION), false);
  assert.equal(matchesPaymentPreset(applied, null), false);
});

test('ช่อง payment ว่างพิจารณาเฉพาะวิธีและข้อความ ไม่พิจารณางวด', () => {
  assert.equal(isEmptyPaymentValue({
    paymentMethod: '',
    paymentTerms: '',
    installments: [{ label: 'มัดจำ', percent: 50 }],
  }), true);
  assert.equal(isEmptyPaymentValue({ paymentMethod: 'โอน', paymentTerms: '' }), false);
  assert.equal(isEmptyPaymentValue({ paymentMethod: '', paymentTerms: 'เครดิต 30 วัน' }), false);
});

test('ชุดหมายเหตุยังแปลงและเทียบข้อความแบบตัดช่องว่างหัวท้าย', () => {
  const option = { versionId: 'ver-rm-1', title: 'หมายเหตุ SCENT', remarks: 'ราคานี้ไม่รวมค่าขนส่ง' };
  assert.equal(remarksPresetToFormValue(option), 'ราคานี้ไม่รวมค่าขนส่ง');
  assert.equal(matchesRemarksPreset('  ราคานี้ไม่รวมค่าขนส่ง  ', option), true);
  assert.equal(matchesRemarksPreset('ราคานี้รวมค่าขนส่ง', option), false);
});

test('สรุป payment preset ไม่อ้างอิงจำนวนงวด', () => {
  assert.equal(commercialPresetSummary('payment', null), 'ยังไม่มีเวอร์ชันใช้งาน');
  assert.equal(
    commercialPresetSummary('payment', {
      paymentMethod: 'โอน',
      paymentTerms: 'เครดิต 30 วัน\nหลังส่งมอบ',
      installments: [{ percent: 50 }, { percent: 50 }],
    }),
    'โอน · เครดิต 30 วัน',
  );
  assert.equal(commercialPresetSummary('payment', { paymentMethod: 'เช็ค' }), 'เช็ค');
  assert.equal(commercialPresetSummary('remarks', { remarks: 'บรรทัดแรก\nบรรทัดสอง' }), 'บรรทัดแรก');
});

test('dropdown schema ใหม่แยก payment/remarks และไม่ส่งงวดไปยังใบ', () => {
  const roots = [
    { id: 'pay', kind: 'payment', publishedVersionId: 'pay-v1' },
    { id: 'remarks', kind: 'remarks', publishedVersionId: 'remarks-v1' },
  ];
  const versions = [
    {
      id: 'pay-v1',
      status: 'published',
      title: 'โอนเครดิต',
      paymentMethod: 'โอน',
      paymentTerms: 'เครดิต 30 วัน',
      installments: [{ label: 'ข้อมูลเก่า', percent: 100 }],
    },
    { id: 'remarks-v1', status: 'published', title: 'หมายเหตุทั่วไป', remarks: 'ไม่รวมค่าขนส่ง' },
  ];

  const payment = publishedCommercialPresetOptions(roots, versions, 'payment');
  assert.equal(payment[0].versionId, 'pay-v1');
  assert.equal('installments' in payment[0], false);
  assert.deepEqual(publishedCommercialPresetOptions(roots, versions, 'remarks').map((row) => row.versionId), ['remarks-v1']);
});

test('dropdown schema 0128 เดิมอ่าน payment/remarks จาก version รวม แต่ไม่ใช้ installment แยกชนิด', () => {
  const roots = [
    { id: 'legacy', publishedVersionId: 'legacy-v1' },
    { id: 'installment-only', publishedVersionId: 'installment-v1' },
  ];
  const versions = [
    {
      id: 'legacy-v1',
      status: 'published',
      title: 'เงื่อนไขมาตรฐาน',
      paymentMethod: 'โอน',
      paymentTerms: 'เครดิต 30 วัน',
      installments: [{ label: 'เต็มจำนวน', percent: 100 }],
      remarks: 'ไม่รวมค่าขนส่ง',
    },
    {
      id: 'installment-v1',
      status: 'published',
      title: 'งวดอย่างเดียว',
      installments: [{ label: 'เต็มจำนวน', percent: 100 }],
    },
  ];

  const payment = publishedCommercialPresetOptions(roots, versions, 'payment');
  const remarks = publishedCommercialPresetOptions(roots, versions, 'remarks');
  assert.deepEqual(payment.map((row) => row.versionId), ['legacy-v1']);
  assert.equal('installments' in payment[0], false);
  assert.equal(remarks[0].remarks, 'ไม่รวมค่าขนส่ง');
});
