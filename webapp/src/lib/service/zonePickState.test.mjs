import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sitePickSummary, surveyZoneBusyError, zonePickList, zonePickState } from './zonePickState.js';

const zone = (over = {}) => ({
  id: 'ZN1', name: 'ล็อบบี้', code: 'ZN-A-01', floor: '01',
  surveyedAt: null, termState: 'none', pendingRequest: null, surveyCount: 0,
  areaSqm: null, assessedPackages: null, ...over,
});

/* ⭐ กรณี ④ ของเมทริกซ์เจ็ดกรณี — ของที่จ่ายค่าแรงไปแล้วแต่ยังไม่ได้เงิน */
test('⭐ วัดแล้วยังไม่ขาย = ไทล์เด่น ติ๊กได้ และต้องบอกว่าไม่ต้องไปวัดใหม่', () => {
  const t = zonePickState(zone({ surveyedAt: '2026-08-20', areaSqm: 303, assessedPackages: 3 }));
  assert.equal(t.kind, 'hot');
  assert.equal(t.locked, false);
  assert.match(t.reason, /ไม่ต้องไปวัดใหม่/);
});

/* 🔒 กรณี ③⑦ — "มีใบอื่นสั่งวัดไว้แล้ว" เป็นสถานะของตัวเอง ไม่ใช่ "ยังไม่วัด" */
test('🔒 มีใบสั่งวัดค้าง = ติ๊กไม่ได้ และต้องบอกเลขใบ', () => {
  const t = zonePickState(zone({ pendingRequest: { id: 'R2', docNo: 'AS-2', dueDate: '2026-09-20' } }));
  assert.equal(t.kind, 'locked');
  assert.equal(t.locked, true);
  assert.match(t.reason, /AS-2/, 'ปุ่มจางต้องบอกเหตุ ไม่ใช่จางเปล่า ๆ');
  assert.match(t.reason, /2026-09-20/, 'ต้องบอกวันนัดด้วย คนจะได้รู้ว่ารออีกนานไหม');
  assert.equal(t.surveyState, 'pending', 'ห้ามยุบรวมกับ none — สองใบจะสั่งวัดซ้อนกัน');
});

/* 🔴 กรณี ⑥ — ขายแล้วแต่ไม่เคยวัด · หนี้ข้อมูล ไม่ใช่ error ⇒ ชวนไปวัด ไม่ใช่ห้าม */
test('🔴 ขายแล้วแต่ไม่เคยวัด = เตือน แต่ยังติ๊กได้', () => {
  const t = zonePickState(zone({ termState: 'active' }));
  assert.equal(t.kind, 'debt');
  assert.equal(t.locked, false);
  assert.match(t.reason, /ไม่เคยวัด/);
});

test('เคยขายรอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้', () => {
  const t = zonePickState(zone({ surveyedAt: '2026-01-10', termState: 'ended' }));
  assert.equal(t.kind, 'plain');
  assert.match(t.reason, /ต่ออายุ/);
});

/* ⭐ ที่เด่นขึ้นก่อน ที่ล็อกอยู่ล่างสุด — แต่ **ทุกอันต้องอยู่ในลิสต์**
   ไม่โชว์ = คนพิมพ์ชื่อซ้ำแล้วชน UNIQUE ของ mig 0297 */
test('⭐ เรียงตามความสำคัญ และไม่ซ่อนอันที่ล็อก', () => {
  const list = zonePickList([
    zone({ id: 'A', name: 'ล็อกไว้', pendingRequest: { id: 'R', docNo: 'AS-9' } }),
    zone({ id: 'B', name: 'ธรรมดา', surveyedAt: '2026-08-01', termState: 'active' }),
    zone({ id: 'C', name: 'เด่น', surveyedAt: '2026-08-01' }),
    zone({ id: 'D', name: 'หนี้ข้อมูล', termState: 'active' }),
  ]);
  assert.deepEqual(list.map((t) => t.id), ['C', 'D', 'B', 'A']);
  assert.equal(list.length, 4, 'ที่ล็อกต้องยังอยู่ในลิสต์ ไม่ใช่หายไป');
});

test('สรุประดับสถานที่ — "N พื้นที่ · วัดแล้ว · ขายแล้ว · มีใบค้าง"', () => {
  const sum = sitePickSummary({
    zones: [
      zone({ id: 'A', surveyedAt: '2026-08-01', termState: 'active' }),
      zone({ id: 'B', surveyedAt: '2026-08-01' }),
      zone({ id: 'C', pendingRequest: { id: 'R', docNo: 'AS-9' } }),
      zone({ id: 'D' }),
    ],
  });
  assert.deepEqual(sum, { zones: 4, measured: 2, sold: 1, pending: 1 });
});

/* ══ ยามฝั่ง server ══════════════════════════════════════════════════════
   🔴 ล็อกบนจออย่างเดียวไม่พอ — จอที่โหลดไว้ก่อนไม่รู้ว่าอีกคนเพิ่งเปิดใบไป */
test('🔴 server ต้องตีกลับพื้นที่ที่มีใบสั่งวัดค้าง แม้จอจะปล่อยผ่านมา', () => {
  const requests = new Map([
    ['R_OPEN', { id: 'R_OPEN', docNo: 'AS-7', status: 'acknowledged' }],
    ['R_DONE', { id: 'R_DONE', docNo: 'AS-6', status: 'closed' }],
  ]);
  const rows = [
    { id: 'sz1', requestId: 'R_OPEN', zoneId: 'ZN9', status: 'ok' },
    { id: 'sz2', requestId: 'R_DONE', zoneId: 'ZN8', status: 'ok' },
  ];

  assert.match(
    surveyZoneBusyError([{ zoneId: 'ZN9' }], rows, requests),
    /AS-7/,
    'ต้องบอกเลขใบที่ค้าง ไม่ใช่ปฏิเสธลอย ๆ',
  );
  // ใบที่จบแล้วไม่ล็อก — ประเมินซ้ำเป็นเรื่องปกติ (มติข้อ 8)
  assert.equal(surveyZoneBusyError([{ zoneId: 'ZN8' }], rows, requests), null);
  // พื้นที่ใหม่ (ไม่มี zoneId) ไม่มีอะไรให้ชน
  assert.equal(surveyZoneBusyError([{ name: 'พื้นที่ใหม่' }], rows, requests), null);
  // แถวที่ถูกตัดออกจากใบนั้นแล้ว ไม่นับว่าจอง
  assert.equal(
    surveyZoneBusyError([{ zoneId: 'ZN9' }], [{ ...rows[0], status: 'cut' }], requests),
    null,
  );
});

/* 🐞 รูที่เทสต์ฟังก์ชันมองไม่เห็น — ด่านถูกหมด แต่ถ้า route ไม่เรียกก็ไม่มีผล */
test('🔴 route เปิดคำร้องต้องเรียกยามพื้นที่ที่มีใบสั่งวัดค้าง', () => {
  const route = readFileSync(new URL('../../app/api/sa/requests/route.js', import.meta.url), 'utf8');
  assert.match(route, /surveyZoneBusyError\(/, 'ต้องใช้ตัวตัดสินตัวเดียวกับจอ');
  assert.match(route, /loadZoneSurveyLocks\(/, 'ต้องอ่านของจริงมาตรวจ ไม่ใช่เชื่อค่าที่จอส่งมา');
});

/* ⚠️ ฟอร์มต้องอ่านทะเบียนของลูกค้า ไม่ใช่โซนรายไซต์เปล่า ๆ (เฟส 3A(ข)) */
test('🔴 ฟอร์มต้องดึงทะเบียนพื้นที่ของลูกค้า และไม่บล็อกเมื่อดึงไม่ได้', () => {
  const form = readFileSync(new URL('../../components/requests/SurveySiteFields.js', import.meta.url), 'utf8');
  assert.match(form, /api\/service\/customers\/\$\{encodeURIComponent\(customerId\)\}\/zones/,
    'ต้องอ่านเส้นเดียวกับแท็บพื้นที่บริการ');
  assert.match(form, /zonePickList\(/, 'ไทล์ต้องมีสถานะสองแกน ไม่ใช่ปุ่มเปล่า');
  assert.match(form, /ดึงพื้นที่เดิมไม่ได้/, 'ดึงไม่ได้ต้องไม่บล็อกการเปิดใบ');
  assert.doesNotMatch(form, /window\.confirm/, 'ต้องใช้ ConfirmDialog ของระบบ');
});
