import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf } from './categoryOf.js';
import {
  AR_FIRST_NUMBER,
  CODE_MODE_AUTO,
  CODE_MODE_MANUAL,
  DEFAULT_CODE_MODE,
  FG_FIRST_NUMBER,
  arCodeError,
  codeModeOf,
  composeFgCode,
  customerCodeSegment,
  fgCodeError,
  fgCodeHasRunNo,
  fgCodeParts,
  fgCodePrefix,
  formatArCode,
  insertCustomerWithCode,
  insertProductWithCode,
  isAutoArCode,
  isAutoFgCode,
  isReusableCode,
  reclaimableArNumber,
  peekMasterNumber,
  RECLAIMED_TABLE,
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

// ท่อนหน้าเลขรันต้องเป็นตัวเดียวกับที่ composeFgCode ใช้ — ฟังก์ชัน SQL (mig 0237)
// รับค่านี้ไปเติมเลขท้าย ถ้าสองทางประกอบไม่เหมือนกัน รหัสจะต่างกันระหว่างพรีวิวกับของจริง
test('ท่อนหน้าเลขรันของรหัส FG', () => {
  assert.equal(fgCodePrefix({ arCode: 'AR-109', categoryCode: '01-002' }), 'FG-0109-01-002-');
  assert.equal(fgCodePrefix({ arCode: 'AR-1001', categoryCode: '33-444' }), 'FG-1001-33-444-');
  assert.equal(fgCodePrefix({ arCode: 'AR-109', categoryCode: '' }), null);
  assert.equal(fgCodePrefix({ arCode: '', categoryCode: '01-002' }), null);
  assert.equal(fgCodePrefix({ arCode: 'AR-109', categoryCode: '1-2' }), null);
  // ต่อเลขเข้าไปแล้วต้องได้รหัสเดียวกับ composeFgCode เป๊ะ
  assert.equal(
    `${fgCodePrefix({ arCode: 'AR-109', categoryCode: '01-002' })}10001`,
    composeFgCode({ arCode: 'AR-109', categoryCode: '01-002', runNo: 10001 }),
  );
});

test('สร้างแถวพร้อมออกรหัส: ส่ง prefix/width ให้ฟังก์ชัน SQL ไม่ใช่ตัวรหัสสำเร็จรูป', async () => {
  const calls = [];
  const fakeSupabase = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: {}, error: null }; } };

  await insertCustomerWithCode(fakeSupabase, { id: 'CUS-1', name: 'ก' });
  assert.deepEqual(calls[0], [
    'create_customer_with_code',
    { p_prefix: 'AR-', p_width: 4, p_row: { id: 'CUS-1', name: 'ก' } },
  ]);

  await insertProductWithCode(fakeSupabase, 'FG-0109-01-002-', { id: 'PRD-1' });
  assert.deepEqual(calls[1], [
    'create_product_with_code',
    { p_prefix: 'FG-0109-01-002-', p_width: 5, p_row: { id: 'PRD-1' } },
  ]);

  // แถวที่ส่งไปต้องไม่มีคีย์รหัสติดไปด้วย — เลขยังไม่ถูกจองตอนประกอบแถว
  assert.equal('arCode' in calls[0][1].p_row, false);
  assert.equal('fgCode' in calls[1][1].p_row, false);
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

// แอดมินซ่อมเลข AR ได้ทุกรูปแบบ (มติผู้ใช้ 2026-08-24) — `allowIssued` เปิดเฉพาะตอน **แก้**
// ทะเบียนโดยแอดมิน · ตอนสร้างยังห้ามพิมพ์รูปแบบที่ระบบออกให้เหมือนเดิมทุกประการ
test('allowIssued: แอดมินพิมพ์ได้ทั้งรูปแบบเดิมและรูปแบบที่ระบบออกให้', () => {
  assert.equal(arCodeError('AR-1001', { mode: CODE_MODE_MANUAL, allowIssued: true }), null);
  assert.equal(arCodeError('AR-109', { mode: CODE_MODE_MANUAL, allowIssued: true }), null);
  // ผิดรูปแบบยังผิดเหมือนเดิม และข้อความต้องบอกทั้งสองแบบที่พิมพ์ได้
  const wrong = arCodeError('AR-10', { mode: CODE_MODE_MANUAL, allowIssued: true });
  assert.match(wrong, /AR-AAA/);
  assert.match(wrong, /AR-AAAA/);
  assert.match(arCodeError('', { mode: CODE_MODE_MANUAL, allowIssued: true }), /กรุณากรอก/);
  // ค่าตั้งต้นต้องเป็น "ห้าม" — ผู้เรียกที่ลืมส่งธงต้องได้กติกาเดิม ไม่ใช่กติกาแอดมิน
  assert.match(arCodeError('AR-1001', { mode: CODE_MODE_MANUAL }), /เปิดสวิตช์ระบบใหม่/);
  // โหมด auto ไม่เกี่ยวกับธงนี้เลย (ระบบออกเลขเอง ไม่มีใครพิมพ์)
  assert.match(arCodeError('AR-109', { mode: CODE_MODE_AUTO, allowIssued: true }), /4 หลัก/);
});

// 🔴 เลข 4 หลักนำศูนย์ = ท่อนลูกค้าของรหัส FG ไปชนกับรหัสเก่า 3 หลัก (AR-0306 vs AR-306
// เติมศูนย์แล้วได้ `0306` เหมือนกัน) ⇒ ห้ามแม้เป็นแอดมิน · ข้อความต้องชี้ทางที่ถูกให้ด้วย
// เพราะเคสจริงคือ "เผลอสร้างด้วยระบบใหม่ ต้องแก้กลับเป็นเลขเก่า" ซึ่งพิมพ์ 3 หลักได้อยู่แล้ว
test('allowIssued: เลข 4 หลักต่ำกว่า 1001 ห้าม — ท่อนรหัส FG จะชนกับรหัสเก่า', () => {
  const admin = { mode: CODE_MODE_MANUAL, allowIssued: true };
  const err = arCodeError('AR-0306', admin);
  assert.match(err, /AR-1001/);   // บอกว่าเลขของระบบเริ่มที่ไหน
  assert.match(err, /AR-306/);    // และบอกว่าถ้าจะใช้เลขเก่าให้พิมพ์อะไร
  assert.equal(customerCodeSegment('AR-0306'), customerCodeSegment('AR-306')); // เหตุผลที่ห้าม
  assert.match(arCodeError('AR-0001', admin), /AR-001/);
  assert.match(arCodeError('AR-0000', admin), /AR-000/);
  // ขอบเขตพอดี: 1001 ผ่าน · 1000 ไม่ผ่าน
  assert.equal(arCodeError(formatArCode(AR_FIRST_NUMBER), admin), null);
  assert.match(arCodeError('AR-1000', admin), /ระบบไม่เคยออกให้/);
  // รูปเดิม 3 หลัก (เคสจริงของผู้ใช้) ต้องไม่ถูกแตะเลย
  assert.equal(arCodeError('AR-306', admin), null);
  assert.equal(arCodeError('AR-001', admin), null);
});

// ค่าที่มีช่องว่างติดมาต้องผ่านด่านได้เหมือนเดิม (ตัวตรวจ trim ให้) — ข้อควรระวังคือ
// **ผู้เรียกต้องบันทึกค่าที่ตัดแล้ว** ไม่ใช่ค่าดิบ ไม่งั้นด่านกันซ้ำ/unique มองเป็นคนละค่า
// (PATCH /api/customers/[id] ตัดก่อนทุกด่านแล้วเขียนค่าที่ตัดแล้วลงตาราง)
test('ช่องว่างหัวท้ายไม่ทำให้ด่านรูปแบบเพี้ยน', () => {
  assert.equal(arCodeError(' AR-1009 ', { mode: CODE_MODE_MANUAL, allowIssued: true }), null);
  assert.equal(arCodeError('  AR-306  ', { mode: CODE_MODE_MANUAL }), null);
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

// ── รหัสไม่มีเลขรัน (มติผู้ใช้ 2026-08-13) ────────────────────────────────
test('กรอกเอง: FG-AAA-BB-CCC ไม่มีท่อน DDDD ก็ผ่าน (มีอยู่จริงในทะเบียน 7 แถว)', () => {
  assert.equal(fgCodeError('FG-109-01-002', { mode: CODE_MODE_MANUAL }), null);
  assert.equal(fgCodeError('FG-109-01-002-1001', { mode: CODE_MODE_MANUAL }), null);
  // หมวดในรหัสยังต้องตรงกับหมวดที่เลือกเหมือนเดิม
  assert.match(
    fgCodeError('FG-109-01-002', { mode: CODE_MODE_MANUAL, categoryCode: '02-003' }),
    /ไม่ตรงกับหมวดที่เลือก/,
  );
  // จำนวนหลักอื่นยังผิดรูปแบบ — ไม่ได้เปิดกว้างทั้งหมด
  assert.match(fgCodeError('FG-1090-01-002', { mode: CODE_MODE_MANUAL }), /เปิดสวิตช์ระบบใหม่/);
  assert.match(fgCodeError('FG-109-01-02', { mode: CODE_MODE_MANUAL }), /รูปแบบ/);
});

test('หมวดหลัก 03/04 ออกรหัสอัตโนมัติโดยไม่มีเลขรัน', () => {
  assert.equal(fgCodeHasRunNo('01-002'), true);
  assert.equal(fgCodeHasRunNo('02-003'), true);
  assert.equal(fgCodeHasRunNo('03-001'), false);
  assert.equal(fgCodeHasRunNo('04-005'), false);

  // ประกอบรหัส: หมวดปกติต้องมีเลขรัน · 03/04 จบที่ CCC และ **ไม่สนใจ runNo ที่ส่งมา**
  assert.equal(
    composeFgCode({ arCode: 'AR-109', categoryCode: '01-002', runNo: 10001 }),
    'FG-0109-01-002-10001',
  );
  assert.equal(composeFgCode({ arCode: 'AR-109', categoryCode: '01-002' }), null);
  assert.equal(composeFgCode({ arCode: 'AR-109', categoryCode: '03-001' }), 'FG-0109-03-001');
  assert.equal(
    composeFgCode({ arCode: 'AR-1001', categoryCode: '04-005', runNo: 10007 }),
    'FG-1001-04-005',
  );

  // ด่านตรวจแยกตามหมวด — หมวดปกติที่หลุดเลขรันต้องไม่ผ่าน และกลับกัน
  assert.equal(fgCodeError('FG-0109-03-001', { mode: CODE_MODE_AUTO, categoryCode: '03-001' }), null);
  assert.match(
    fgCodeError('FG-0109-03-001-10001', { mode: CODE_MODE_AUTO, categoryCode: '03-001' }),
    /FG-AAAA-BB-CCC$/,
  );
  assert.match(
    fgCodeError('FG-0109-01-002', { mode: CODE_MODE_AUTO, categoryCode: '01-002' }),
    /FG-AAAA-BB-CCC-DDDDD/,
  );

  // รหัสไร้เลขรันที่ระบบออกให้ = แก้ไม่ได้เหมือนรหัสอัตโนมัติอื่น (ท่อนลูกค้า 4 หลัก)
  assert.equal(isAutoFgCode('FG-0109-03-001'), true);
  assert.equal(isAutoFgCode('FG-109-03-001'), false);
});

test('แถบรหัสซ่อนท่อนเลขรันเมื่อเลือกหมวด 03/04', () => {
  const keys = (categoryCode) =>
    fgCodeParts({ arCode: 'AR-109', categoryCode, runNo: 10001 }).map((p) => p.key);
  assert.deepEqual(keys('01-002'), ['prefix', 'customer', 'main', 'sub', 'run']);
  assert.deepEqual(keys('03-001'), ['prefix', 'customer', 'main', 'sub']);
  // ยังไม่เลือกหมวด = ยังไม่รู้ว่าหมวดไหน ท่อนเลขจึงยังอยู่ตามค่าตั้งต้น
  assert.deepEqual(keys(''), ['prefix', 'customer', 'main', 'sub', 'run']);
});

// ⚠️ สองค่านี้ต่างกันโดยตั้งใจ — ผูกเข้าด้วยกันเมื่อไร การเปลี่ยนหน้าตาฟอร์มจะไป
// เปลี่ยนความหมายของ API พร้อมกันโดยไม่มีใครตั้งใจ (มติ 2026-08-13)
test('สวิตช์ในฟอร์มตั้งต้นปิด · แต่คำขอที่ไม่ส่ง codeMode ยังถือเป็นอัตโนมัติ', () => {
  assert.equal(DEFAULT_CODE_MODE, CODE_MODE_MANUAL);
  assert.equal(codeModeOf(undefined), CODE_MODE_AUTO);
  assert.equal(codeModeOf('manual'), CODE_MODE_MANUAL);
  assert.equal(codeModeOf('อะไรไม่รู้'), CODE_MODE_AUTO);
});

// เคาน์เตอร์ = { lastNo } · กองเลขคืน = { no } (null = กองว่าง) · reclaimedError = ตารางหาย
const fakeSupabase = (counterRow, reclaimedRow = null, reclaimedError = null) => ({
  from: (table) => (table === RECLAIMED_TABLE
    ? {
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: reclaimedRow, error: reclaimedError }),
            }),
          }),
        }),
      }),
    }
    : {
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: counterRow, error: null }) }),
        }),
      }),
    }),
});

test('พรีวิวเลขถัดไป: ยังไม่มีแถวเคาน์เตอร์ = เลขแรกของ scope', async () => {
  assert.equal(await peekMasterNumber(fakeSupabase(null), 'AR'), 1001);
  assert.equal(await peekMasterNumber(fakeSupabase(null), 'FG'), 10001);
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 1000 }), 'AR'), 1001);
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 1042 }), 'AR'), 1043);
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 10007 }), 'FG'), 10008);
});

// ── เลขที่ร่างคืนมา (mig 0248) ────────────────────────────────────────────
test('พรีวิวหยิบจากกองเลขคืนก่อนเคาน์เตอร์ — ลำดับเดียวกับฝั่ง SQL', async () => {
  // เคาน์เตอร์วิ่งไปถึง 1042 แล้ว แต่ AR-1005 ถูกคืนมา ⇒ ใบถัดไปต้องได้ 1005 ไม่ใช่ 1043
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 1042 }, { no: 1005 }), 'AR'), 1005);
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 10007 }, { no: 10003 }), 'FG'), 10003);
  // กองว่าง = พฤติกรรมเดิมทุกประการ
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 1042 }, null), 'AR'), 1043);
});

test('ยังไม่ได้รัน mig 0248 (ไม่มีตารางกองเลขคืน) = อ่านเคาน์เตอร์ตามเดิม ไม่ใช่พัง', async () => {
  const missing = { code: '42P01', message: 'relation "entity_number_reclaimed" does not exist' };
  assert.equal(await peekMasterNumber(fakeSupabase({ lastNo: 1042 }, null, missing), 'AR'), 1043);
  assert.equal(await peekMasterNumber(fakeSupabase(null, null, { code: 'PGRST205' }), 'FG'), 10001);
  // error อื่นยังต้องดังเหมือนเดิม — ไม่ใช่กลบทุกอย่างที่อ่านไม่ได้
  await assert.rejects(
    () => peekMasterNumber(fakeSupabase({ lastNo: 1042 }, null, { code: '42501', message: 'permission denied' }), 'AR'),
    /อ่านเลขคืน AR ไม่สำเร็จ/,
  );
});

test('เลขคืนได้เฉพาะแถวที่ไม่เคยอนุมัติ — ดู firstApprovedAt ไม่ใช่ approvalStatus', () => {
  assert.equal(isReusableCode({ approvalStatus: 'pending', firstApprovedAt: null }), true);
  assert.equal(isReusableCode({ approvalStatus: 'rejected', firstApprovedAt: null }), true);
  assert.equal(isReusableCode({ approvalStatus: 'approved', firstApprovedAt: '2026-08-13T00:00:00Z' }), false);
  // เคสที่กติกานี้มีอยู่เพื่อกัน: อนุมัติแล้วถูกแก้ → สถานะกลับเป็น pending และ
  // approvedAt ถูกล้าง (resetApprovalOnEdit) แต่รหัสอยู่บนเอกสารไปแล้ว ⇒ ห้ามคืนเลข
  assert.equal(
    isReusableCode({ approvalStatus: 'pending', approvedAt: null, firstApprovedAt: '2026-08-13T00:00:00Z' }),
    false,
  );
  assert.equal(isReusableCode(null), false);   // ไม่มีแถวให้ดู = ไม่สัญญาว่าเลขจะคืน
  // ยังไม่ได้รัน mig 0248 = แถวไม่มีคีย์นี้เลย ต่างจาก null (มีคอลัมน์ = ยังไม่เคยอนุมัติ)
  assert.equal(isReusableCode({ approvalStatus: 'pending' }), false);
});

// ── ย้ายรหัสออกจากใบ แล้วเลขเดิมได้คืนไหม (มติผู้ใช้ 2026-08-25) ──────────────
// กติกาต้องตรงกับ trigger `customer_code_reclaim` ของ mig 0248 ทุกข้อ — ที่นี่คือฝั่งแอป
test('reclaimableArNumber: คืนเฉพาะรหัสที่ระบบออกให้ และใบที่ไม่เคยผ่านอนุมัติ', () => {
  const draft = { arCode: 'AR-1011', firstApprovedAt: null };
  assert.equal(reclaimableArNumber(draft), 1011);

  // เคยอนุมัติ = เลขตายถาวร (รหัสไปอยู่บนเอกสารแล้ว)
  assert.equal(reclaimableArNumber({ arCode: 'AR-1011', firstApprovedAt: '2026-08-20T00:00:00Z' }), null);

  // รหัสกรอกเองไม่เคยกินเลขรัน จึงไม่มีอะไรให้คืน
  assert.equal(reclaimableArNumber({ arCode: 'AR-306', firstApprovedAt: null }), null);

  // ไม่มีคอลัมน์ (mig 0248 ยังไม่รัน) = ตอบ "ไม่คืน" เสมอ ไม่ใช่เดาว่าเป็นร่าง
  assert.equal(reclaimableArNumber({ arCode: 'AR-1011' }), null);
  assert.equal(reclaimableArNumber(null), null);

  // รับ previousCode แยกได้ สำหรับผู้เรียกที่ถือแถวหลังแก้ไปแล้ว
  assert.equal(reclaimableArNumber({ arCode: 'AR-306', firstApprovedAt: null }, { previousCode: 'AR-1011' }), 1011);
});
