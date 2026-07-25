import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_PRESET_LIMITS,
  commercialPresetSummary,
  fullPaymentInstallment,
  isEmptyPaymentValue,
  isFullPaymentPlan,
  matchesPaymentPreset,
  matchesRemarksPreset,
  normalizeCommercialPresetInput,
  normalizeCommercialPresetKind,
  paymentPresetToFormValue,
  publishedCommercialPresetOptions,
  remarksPresetToFormValue,
} from './commercialPresets.js';
import { MAX_INSTALLMENTS, validatePaymentPlan } from './sales/paymentPlan.js';

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

// ── การนำชุดไปใช้บนใบเสนอราคา ─────────────────────────────────────────────────

const PAYMENT_OPTION = Object.freeze({
  versionId: 'ver-pay-1',
  title: 'โอน · มัดจำ 50%',
  paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
  paymentTerms: 'เครดิต 30 วัน',
  installments: [
    { label: 'มัดจำ', percent: 50, trigger: 'เมื่ออนุมัติใบเสนอราคา', dueRule: 'ภายใน 7 วัน', note: '' },
    { label: 'ส่วนที่เหลือ', percent: 50, trigger: '', dueRule: '', note: 'ก่อนส่งมอบ' },
  ],
});

const FULL_OPTION = Object.freeze({
  versionId: 'ver-pay-full',
  title: 'โอน · เต็มจำนวน',
  paymentMethod: 'โอนเงินเข้าบัญชีบริษัท',
  paymentTerms: '',
  installments: [{ label: 'ชำระเต็มจำนวน', percent: 100, trigger: 'เมื่อยืนยันคำสั่งซื้อ', dueRule: 'ภายใน 7 วัน', note: '' }],
});

test('ชุดการชำระ → ฟอร์ม: ใช้ installment ทุกกรณี แม้แถวเดียว 100%', () => {
  const full = paymentPresetToFormValue(FULL_OPTION);
  // ถ้าแปลงเป็น type 'full' แถวงวดจะไม่ถูกเก็บ แล้วเงื่อนไข/กำหนดชำระจะหายจากเอกสาร
  assert.equal(full.type, 'installment');
  assert.equal(full.installments.length, 1);
  assert.equal(full.installments[0].percent, 100);
  assert.equal(full.installments[0].note, 'เมื่อยืนยันคำสั่งซื้อ · ภายใน 7 วัน');
  // แผน 1 งวดต้องผ่าน validate ของฟอร์มใบด้วย ไม่งั้นเลือกชุดแล้วบันทึกไม่ได้
  assert.equal(validatePaymentPlan(full).ok, true);
});

test('ชุดการชำระ → ฟอร์ม: หลายงวดครบทุกแถว + พับ trigger/dueRule/note เข้า note', () => {
  const value = paymentPresetToFormValue(PAYMENT_OPTION);
  assert.equal(value.paymentMethod, 'โอนเงินเข้าบัญชีบริษัท');
  assert.equal(value.paymentTerms, 'เครดิต 30 วัน');
  assert.deepEqual(value.installments.map((row) => row.percent), [50, 50]);
  assert.equal(value.installments[0].note, 'เมื่ออนุมัติใบเสนอราคา · ภายใน 7 วัน');
  assert.equal(value.installments[1].note, 'ก่อนส่งมอบ');
  assert.equal(validatePaymentPlan(value).ok, true);
});

test('ชุดการชำระ → ฟอร์ม: ไม่มีชุด/ไม่มีงวด → null', () => {
  assert.equal(paymentPresetToFormValue(null), null);
  assert.equal(paymentPresetToFormValue({ versionId: 'x', installments: [] }), null);
});

test('เทียบชุดการชำระ: ตรงตอนเพิ่งเลือก, ต่างเมื่อแก้, กลับมาตรงเมื่อแก้คืน', () => {
  const applied = paymentPresetToFormValue(PAYMENT_OPTION);
  assert.equal(matchesPaymentPreset(applied, PAYMENT_OPTION), true);

  const edited = { ...applied, paymentTerms: 'เครดิต 45 วัน' };
  assert.equal(matchesPaymentPreset(edited, PAYMENT_OPTION), false);
  // แก้กลับให้ตรง → ต้องกลับเป็น true เอง (ป้าย "แก้เพิ่มเติมแล้ว" ต้องไม่ค้าง)
  assert.equal(matchesPaymentPreset({ ...edited, paymentTerms: 'เครดิต 30 วัน' }, PAYMENT_OPTION), true);

  // แก้ในตารางงวดก็ต้องจับได้ (จำนวนแถว / %/ ข้อความ)
  assert.equal(matchesPaymentPreset({ ...applied, installments: [applied.installments[0]] }, PAYMENT_OPTION), false);
  assert.equal(matchesPaymentPreset({
    ...applied,
    installments: [{ ...applied.installments[0], percent: 60 }, applied.installments[1]],
  }, PAYMENT_OPTION), false);
  assert.equal(matchesPaymentPreset(null, PAYMENT_OPTION), false);
  assert.equal(matchesPaymentPreset(applied, null), false);
});

test('เทียบชุดหมายเหตุ: เทียบข้อความแบบตัดช่องว่างหัวท้าย', () => {
  const option = { versionId: 'ver-rm-1', title: 'หมายเหตุ SCENT', remarks: 'ราคานี้ไม่รวมค่าขนส่ง' };
  assert.equal(remarksPresetToFormValue(option), 'ราคานี้ไม่รวมค่าขนส่ง');
  assert.equal(matchesRemarksPreset('ราคานี้ไม่รวมค่าขนส่ง', option), true);
  assert.equal(matchesRemarksPreset('  ราคานี้ไม่รวมค่าขนส่ง  ', option), true);
  assert.equal(matchesRemarksPreset('ราคานี้ไม่รวมค่าขนส่ง และค่าติดตั้ง', option), false);
  assert.equal(matchesRemarksPreset('', option), false);
  assert.equal(matchesRemarksPreset('อะไรก็ตาม', null), false);
});

test('ช่องว่าง = ไม่มีของจะเสีย (เลือกชุดทับได้เลยไม่ต้องถาม)', () => {
  assert.equal(isEmptyPaymentValue({ type: 'full', paymentMethod: '', paymentTerms: '', installments: [] }), true);
  assert.equal(isEmptyPaymentValue({ paymentMethod: '  ', installments: [{ label: '', note: '', percent: 0 }] }), true);
  assert.equal(isEmptyPaymentValue({ paymentMethod: 'โอน', installments: [] }), false);
  assert.equal(isEmptyPaymentValue(paymentPresetToFormValue(PAYMENT_OPTION)), false);
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

test('dropdown อ่านคลัง schema ใหม่โดยแยก payment/remarks ตาม kind', () => {
  const roots = [
    { id: 'pay', kind: 'payment', publishedVersionId: 'pay-v1' },
    { id: 'remarks', kind: 'remarks', publishedVersionId: 'remarks-v1' },
  ];
  const versions = [
    { id: 'pay-v1', status: 'published', title: 'โอนเต็มจำนวน', paymentMethod: 'โอน', installments: [{ label: 'เต็มจำนวน', percent: 100 }] },
    { id: 'remarks-v1', status: 'published', title: 'หมายเหตุทั่วไป', remarks: 'ไม่รวมค่าขนส่ง' },
  ];

  assert.deepEqual(publishedCommercialPresetOptions(roots, versions, 'payment').map((row) => row.versionId), ['pay-v1']);
  assert.deepEqual(publishedCommercialPresetOptions(roots, versions, 'remarks').map((row) => row.versionId), ['remarks-v1']);
});

test('dropdown อ่าน schema 0128 เดิมและแยกเนื้อหาที่รวมอยู่ใน published version เดียว', () => {
  const roots = [{ id: 'legacy', publishedVersionId: 'legacy-v1' }];
  const versions = [{
    id: 'legacy-v1',
    status: 'published',
    title: 'เงื่อนไขมาตรฐาน',
    paymentMethod: 'โอน',
    paymentTerms: 'เครดิต 30 วัน',
    installments: [{ label: 'เต็มจำนวน', percent: 100 }],
    remarks: 'ไม่รวมค่าขนส่ง',
  }];

  const payment = publishedCommercialPresetOptions(roots, versions, 'payment');
  const remarks = publishedCommercialPresetOptions(roots, versions, 'remarks');
  assert.equal(payment[0].paymentMethod, 'โอน');
  assert.equal(payment[0].installments.length, 1);
  assert.equal(remarks[0].remarks, 'ไม่รวมค่าขนส่ง');
  assert.deepEqual(publishedCommercialPresetOptions(roots, [{ ...versions[0], status: 'draft' }], 'payment'), []);
});
