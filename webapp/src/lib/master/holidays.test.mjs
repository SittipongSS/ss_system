import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { listHolidays, holidaySet } from './holidays';
import {
  THAI_HOLIDAYS, setHolidays, isBusinessDay, addBusinessDays, toLocalISODate,
} from '@/lib/pm/dateHelpers';

// จำลอง chain เดียวกับของจริง: from('holidays').select('*').order('date', …)
const fakeClient = (result, seen = {}) => ({
  from(table) {
    seen.table = table;
    return { select: () => ({ order: () => Promise.resolve(result) }) };
  },
});

// setHolidays เป็น global state ของ dateHelpers — คืนค่าตั้งต้นหลังทุก test
afterEach(() => setHolidays([...THAI_HOLIDAYS]));

test('listHolidays อ่านตาราง holidays เดิมตรง ๆ (Decision 0012 ฉบับแก้ไขครั้งที่ 2 — ไม่มีชั้น published version)', async () => {
  const seen = {};
  const rows = [
    { date: '2026-07-22', name: 'หยุดบริษัท' },
    { date: '2026-12-31', name: 'วันสิ้นปี' },
  ];
  const out = await listHolidays(fakeClient({ data: rows, error: null }, seen));
  assert.equal(seen.table, 'holidays');
  assert.deepEqual(out, rows);
});

test('scheduler นับวันทำการจากแถวในตาราง: addBusinessDays ข้ามวันหยุดที่กรอกไว้', async () => {
  // 2026-07-22 = พุธ — กรอกเป็นวันหยุดบริษัท
  const set = await holidaySet(fakeClient({ data: [{ date: '2026-07-22', name: 'หยุดบริษัท' }], error: null }));
  setHolidays([...set]);

  assert.equal(isBusinessDay(new Date(2026, 6, 22)), false);
  // อังคาร 21 ก.ค. + 1 วันทำการ → ข้ามพุธ (หยุด) ไปพฤหัส 23 ก.ค.
  assert.equal(toLocalISODate(addBusinessDays(new Date(2026, 6, 21), 1)), '2026-07-23');
  // วันหยุด hardcode เดิม (31 ธ.ค. 2026 = พฤหัส) ไม่อยู่ในตาราง → กลายเป็นวันทำการ
  // = ตารางจริงแทนที่ list hardcode ทั้งชุด ไม่ใช่ merge
  assert.equal(isBusinessDay(new Date(2026, 11, 31)), true);
});

test('ตารางว่าง → fallback THAI_HOLIDAYS (พฤติกรรมเดิมก่อน mig 0018)', async () => {
  const set = await holidaySet(fakeClient({ data: [], error: null }));
  assert.deepEqual(set, new Set(THAI_HOLIDAYS));
});

test('DB error → fallback THAI_HOLIDAYS ไม่ throw (ไทม์ไลน์ต้องไม่พังเพราะปฏิทิน)', async () => {
  const set = await holidaySet(fakeClient({ data: null, error: new Error('boom') }));
  assert.deepEqual(set, new Set(THAI_HOLIDAYS));
});
