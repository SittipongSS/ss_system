import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf } from './categoryOf.js';
import {
  AR_FIRST_NUMBER,
  CODE_MODE_AUTO,
  CODE_MODE_MANUAL,
  FG_FIRST_NUMBER,
  arCodeError,
  codeModeOf,
  composeFgCode,
  customerCodeSegment,
  fgCodeError,
  fgCodeParts,
  formatArCode,
  isAutoArCode,
  isAutoFgCode,
  peekMasterNumber,
} from './masterCodes.js';

test('รหัสลูกค้าอัตโนมัติเริ่มที่ 1001 และเป็น 4 หลักเสมอ', () => {
  assert.equal(AR_FIRST_NUMBER, 1001);
  assert.equal(formatArCode(1001), 'AR-1001');
  assert.equal(formatArCode(9999), 'AR-9999');
  assert.equal(isAutoArCode('AR-1001'), true);
  assert.equal(isAutoArCode('AR-109'), false);
});

test('ลูกค้าเก่า 3 หลักเติมศูนย์เป็น AAAA เฉพาะตอนประกอบรหัส FG', () => {
  assert.equal(customerCodeSegment('AR-109'), '0109');
  assert.equal(customerCodeSegment('AR-1001'), '1001');
  assert.equal(customerCodeSegment('AR-9'), null);      // ไม่ใช่รูปแบบที่ระบบรู้จัก
  assert.equal(customerCodeSegment(''), null);
});

test('ประกอบรหัส FG จากลูกค้า + หมวด + เลขรัน', () => {
  assert.equal(FG_FIRST_NUMBER, 10001);
  assert.equal(
    composeFgCode({ arCode: 'AR-109', categoryCode: '01-002', runNo: 10001 }),
    'FG-0109-01-002-10001',
  );
  assert.equal(
    composeFgCode({ arCode: 'AR-1001', categoryCode: '33-444', runNo: 10023 }),
    'FG-1001-33-444-10023',
  );
  // ตอบไม่ครบ = ยังไม่มีรหัส (ฟอร์มโชว์ท่อนที่ว่างไว้ ไม่ใช่รหัสครึ่งใบ)
  assert.equal(composeFgCode({ arCode: 'AR-109', categoryCode: '', runNo: 10001 }), null);
  assert.equal(composeFgCode({ arCode: '', categoryCode: '01-002', runNo: 10001 }), null);
  assert.equal(composeFgCode({ arCode: 'AR-109', categoryCode: '01-002', runNo: 0 }), null);
});

test('แถบรหัสโชว์ครบทุกท่อน ท่อนที่ยังไม่ตอบเป็นค่าว่าง', () => {
  const parts = fgCodeParts({ arCode: 'AR-109', categoryCode: '', runNo: 10001 });
  assert.deepEqual(parts.map((p) => p.key), ['prefix', 'customer', 'main', 'sub', 'run']);
  assert.equal(parts[1].value, '0109');
  assert.equal(parts[2].value, null);   // ยังไม่เลือกหมวด
  assert.equal(parts[4].value, '10001');
});

test('🐞 หมวดที่ parse จากรหัสรูปแบบใหม่ ต้องได้ BB-CCC ไม่ใช่ท่อนของรหัสลูกค้า', () => {
  // categoryOf ใช้ regex หลวม (\d{2})-(\d{3}) มาตั้งแต่รูปแบบเดิม 3 หลัก — รูปแบบใหม่
  // ที่รหัสลูกค้ายาว 4 หลักต้องไม่ทำให้มันไปจับผิดท่อน
  assert.equal(categoryOf('FG-0109-01-002-10001'), '01-002');
  assert.equal(categoryOf('FG-1001-33-444-10023'), '33-444');
  assert.equal(categoryOf('FG-109-01-002-1001'), '01-002'); // รูปแบบเดิมยังอ่านได้เหมือนเดิม
});

test('ด่านตรวจรหัสลูกค้าแยกตามโหมดสวิตช์', () => {
  assert.equal(arCodeError('AR-1001', { mode: CODE_MODE_AUTO }), null);
  assert.match(arCodeError('AR-109', { mode: CODE_MODE_AUTO }), /4 หลัก/);
  assert.equal(arCodeError('AR-109', { mode: CODE_MODE_MANUAL }), null);
  assert.match(arCodeError('109', { mode: CODE_MODE_MANUAL }), /รูปแบบ/);
  assert.match(arCodeError('', { mode: CODE_MODE_MANUAL }), /กรุณากรอก/);
});

// เลขรูปแบบใหม่เป็นของเคาน์เตอร์กลาง — พิมพ์เองไปจับจองล่วงหน้าไม่ได้ ไม่งั้นคนที่
// เปิดสวิตช์จะโดน unique ตีกลับตอนเคาน์เตอร์รันมาถึงเลขนั้น (มติผู้ใช้ 2026-08-12)
test('โหมดกรอกเอง: ห้ามพิมพ์รหัสรูปแบบที่ระบบออกให้ ทั้งลูกค้าและสินค้า', () => {
  assert.match(arCodeError('AR-1001', { mode: CODE_MODE_MANUAL }), /เปิดสวิตช์ระบบใหม่/);
  assert.match(arCodeError('AR-9999', { mode: CODE_MODE_MANUAL }), /เปิดสวิตช์ระบบใหม่/);
  assert.match(
    fgCodeError('FG-0109-01-002-10001', { mode: CODE_MODE_MANUAL }),
    /เปิดสวิตช์ระบบใหม่/,
  );
  // จำนวนหลักที่ไม่ใช่ทั้งสองแบบ = ผิดรูปแบบตามเดิม
  assert.match(arCodeError('AR-10', { mode: CODE_MODE_MANUAL }), /รูปแบบ/);
  assert.match(arCodeError('AR-10001', { mode: CODE_MODE_MANUAL }), /รูปแบบ/);
  assert.match(fgCodeError('FG-109-01-002-100', { mode: CODE_MODE_MANUAL }), /รูปแบบ/);
  assert.match(fgCodeError('FG-109-01-002-100011', { mode: CODE_MODE_MANUAL }), /รูปแบบ/);
});

test('ด่านตรวจรหัสสินค้าแยกตามโหมด และต้องตรงกับหมวดที่เลือก', () => {
  assert.equal(fgCodeError('FG-0109-01-002-10001', { mode: CODE_MODE_AUTO }), null);
  assert.match(fgCodeError('FG-109-01-002-1001', { mode: CODE_MODE_AUTO }), /FG-AAAA/);
  assert.equal(fgCodeError('FG-109-01-002-1001', { mode: CODE_MODE_MANUAL }), null);
  assert.match(fgCodeError('FG-109-1-2-3', { mode: CODE_MODE_MANUAL }), /รูปแบบ/);
  // หมวดที่เลือกในฟอร์มขัดกับ BB-CCC ในรหัส = ห้ามผ่าน
  assert.match(
    fgCodeError('FG-109-01-002-1001', { mode: CODE_MODE_MANUAL, categoryCode: '02-003' }),
    /ไม่ตรงกับหมวดที่เลือก/,
  );
  assert.equal(
    fgCodeError('FG-109-01-002-1001', { mode: CODE_MODE_MANUAL, categoryCode: '01-002' }),
    null,
  );
  assert.equal(isAutoFgCode('FG-0109-01-002-10001'), true);
  assert.equal(isAutoFgCode('FG-109-01-002-1001'), false);
});

test('โหมดที่ส่งมาผิด/ไม่ส่ง ถือเป็นอัตโนมัติ (ค่าตั้งต้นของสวิตช์)', () => {
  assert.equal(codeModeOf(undefined), CODE_MODE_AUTO);
  assert.equal(codeModeOf('manual'), CODE_MODE_MANUAL);
  assert.equal(codeModeOf('อะไรไม่รู้'), CODE_MODE_AUTO);
});

test('พรีวิวเลขถัดไป: ยังไม่มีแถวเคาน์เตอร์ = เลขแรกของ scope', async () => {
  const fakeSupabase = (row) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      }),
    }),
  });
  assert.equal(await peekMasterNumber(fakeSupabase(null), 'AR'), 1001);
  assert.equal(await peekMasterNumber(fakeSupabase(null), 'FG'), 10001);
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 1000 }), 'AR'), 1001);
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 1042 }), 'AR'), 1043);
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 10007 }), 'FG'), 10008);
});
