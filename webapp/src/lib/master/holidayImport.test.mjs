import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diffHolidayYear,
  expandDateRange,
  filterByYear,
  normalizeImportRows,
  parseHolidayIcs,
  sanitizeHolidayName,
  unfoldIcsLines,
  MAX_IMPORT_ROWS,
} from './holidayImport.js';

// ตัวอักษรล่องหนที่เจอจริงในปฏิทิน Google — เขียนด้วย escape ไม่ใช่วางตัวจริงลงซอร์ส
const ZWSP = '​';

const vevent = ({ start, end, summary, description, extra = '' }) => [
  'BEGIN:VEVENT',
  `DTSTART;VALUE=DATE:${start}`,
  end ? `DTEND;VALUE=DATE:${end}` : '',
  `SUMMARY:${summary}`,
  description ? `DESCRIPTION:${description}` : '',
  extra,
  'END:VEVENT',
].filter(Boolean).join('\r\n');

const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');

test('คลาย line-folding: ชื่อวันหยุดยาวที่ถูกตัดขึ้นบรรทัดใหม่ต้องต่อกลับเป็นชื่อเดียว', () => {
  const lines = unfoldIcsLines('SUMMARY:วันเฉลิมพระชนมพรรษา\r\n สมเด็จพระเจ้าอยู่หัว\r\nEND:VEVENT');
  assert.deepEqual(lines, ['SUMMARY:วันเฉลิมพระชนมพรรษาสมเด็จพระเจ้าอยู่หัว', 'END:VEVENT']);
});

test('อีเวนต์ all-day วันเดียว: DTEND เป็นวันถัดไปแบบ exclusive ต้องได้วันเดียว ไม่ใช่สองวัน', () => {
  const rows = parseHolidayIcs(ics(vevent({
    start: '20270101', end: '20270102', summary: 'วันขึ้นปีใหม่', description: 'วันหยุดนักขัตฤกษ์',
  })));
  assert.deepEqual(rows, [{ date: '2027-01-01', name: 'วันขึ้นปีใหม่', kind: 'public' }]);
});

test('อีเวนต์ช่วงหลายวัน: 13→16 เม.ย. ได้ 3 วัน ชื่อเดียวกัน (วันสุดท้ายไม่นับ)', () => {
  assert.deepEqual(
    expandDateRange('20270413', '20270416'),
    ['2027-04-13', '2027-04-14', '2027-04-15'],
  );
});

test('ไม่มี timezone shift: 31 ธ.ค. ต้องเป็น 31 ไม่ว่าเครื่องจะอยู่โซนไหน', () => {
  // new Date('2027-12-31').getDate() คืน 30 ใน timezone ลบ — ทั้งไฟล์จึงต้องใช้ Date.UTC เท่านั้น
  assert.deepEqual(expandDateRange('20271231', '20280101'), ['2027-12-31']);
  const rows = parseHolidayIcs(ics(vevent({ start: '20271231T000000Z', summary: 'วันสิ้นปี' })));
  assert.equal(rows[0].date, '2027-12-31');
});

test('VTIMEZONE มี DTSTART ของตัวเอง ต้องไม่หลุดเข้ามาเป็นวันหยุด', () => {
  const text = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Bangkok',
    'BEGIN:STANDARD',
    'DTSTART:19700329T020000',
    'TZOFFSETFROM:+0630',
    'END:STANDARD',
    'END:VTIMEZONE',
    vevent({ start: '20270406', end: '20270407', summary: 'วันจักรี', description: 'วันหยุดนักขัตฤกษ์' }),
    'END:VCALENDAR',
  ].join('\r\n');
  assert.deepEqual(parseHolidayIcs(text).map((r) => r.date), ['2027-04-06']);
});

test('sub-component ใน VEVENT (VALARM) ต้องไม่กลืน property ของอีเวนต์', () => {
  const text = ics([
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20270501',
    'DTEND;VALUE=DATE:20270502',
    'SUMMARY:วันแรงงานแห่งชาติ',
    'DESCRIPTION:วันหยุดนักขัตฤกษ์',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'SUMMARY:เตือนล่วงหน้า',
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n'));
  assert.deepEqual(parseHolidayIcs(text), [
    { date: '2027-05-01', name: 'วันแรงงานแห่งชาติ', kind: 'public' },
  ]);
});

test('คลาย escape ของ ICS: \\, กลายเป็นคอมมาจริง', () => {
  const rows = parseHolidayIcs(ics(vevent({ start: '20270510', summary: 'หยุดบริษัท\\, ปิดโรงงาน' })));
  assert.equal(rows[0].name, 'หยุดบริษัท, ปิดโรงงาน');
});

test('ข้ามอีเวนต์ที่ถูกยกเลิกและอีเวนต์ที่วนซ้ำ (RRULE)', () => {
  const text = ics(
    vevent({ start: '20270601', summary: 'ยกเลิกแล้ว', extra: 'STATUS:CANCELLED' }),
    vevent({ start: '20270602', summary: 'ทุกปี', extra: 'RRULE:FREQ=YEARLY' }),
    vevent({ start: '20270603', summary: 'วันเฉลิมฯ พระราชินี', description: 'วันหยุดนักขัตฤกษ์' }),
  );
  assert.deepEqual(parseHolidayIcs(text).map((r) => r.name), ['วันเฉลิมฯ พระราชินี']);
});

test('ICS พัง/ว่าง/ไม่ใช่ ICS → คืนลิสต์ว่าง ไม่ throw (หน้าตั้งค่าต้องไม่พังเพราะ Google)', () => {
  for (const bad of ['', null, undefined, '<html>ระบบล่ม</html>', 'BEGIN:VEVENT\r\nDTSTART:ขยะ\r\nEND:VEVENT', 'BEGIN:VEVENT']) {
    assert.deepEqual(parseHolidayIcs(bad), []);
  }
});

test('ตัดอักขระล่องหนออกจากชื่อ — ไม่งั้น "วันรัฐธรรมนูญ" ที่ตรงกันอยู่แล้วจะขึ้นว่าชื่อไม่ตรงทุกครั้ง', () => {
  assert.equal(sanitizeHolidayName(`${ZWSP}วันรัฐธรรมนูญ`), 'วันรัฐธรรมนูญ');
  assert.equal(sanitizeHolidayName('  วันหยุด   ชดเชย  '), 'วันหยุด ชดเชย');
  assert.equal(sanitizeHolidayName(null), '');
});

test('แยกวันหยุดราชการออกจาก "วันสำคัญ" ตาม DESCRIPTION (บริษัทไม่ได้หยุดวันสำคัญ)', () => {
  const text = ics(
    vevent({ start: '20270214', summary: 'วันวาเลนไทน์', description: 'วันสำคัญ\\nหากต้องการซ่อนวันสำคัญ ให้ไปที่การตั้งค่า' }),
    vevent({ start: '20270406', summary: 'วันจักรี', description: 'วันหยุดนักขัตฤกษ์' }),
    vevent({ start: '20270407', summary: 'ไม่มีคำอธิบาย' }),
  );
  assert.deepEqual(
    parseHolidayIcs(text).map((r) => [r.date, r.kind]),
    [['2027-02-14', 'observance'], ['2027-04-06', 'public'], ['2027-04-07', 'public']],
  );
});

test('วันซ้ำในไฟล์เดียวกัน → เหลือแถวเดียวเสมอ (holidays.date เป็น PK)', () => {
  const text = ics(
    vevent({ start: '20270101', summary: 'ปีใหม่' }),
    vevent({ start: '20270101', summary: 'ปีใหม่ (ซ้ำ)' }),
  );
  assert.deepEqual(parseHolidayIcs(text).map((r) => r.name), ['ปีใหม่']);
});

test('filterByYear ตัดปีอื่นทิ้ง', () => {
  const rows = [{ date: '2026-12-31' }, { date: '2027-01-01' }, { date: '2028-01-01' }];
  assert.deepEqual(filterByYear(rows, 2027).map((r) => r.date), ['2027-01-01']);
});

test('diff: แยก เพิ่มใหม่ / มีอยู่แล้ว / ชื่อไม่ตรง ได้ครบ', () => {
  const google = [
    { date: '2027-01-01', name: 'วันขึ้นปีใหม่', kind: 'public' },
    { date: '2027-05-01', name: 'วันแรงงานแห่งชาติ', kind: 'public' },
    { date: '2027-12-10', name: `${ZWSP}วันรัฐธรรมนูญ`, kind: 'public' },
  ];
  const existing = [
    { date: '2027-05-01', name: 'วันแรงงาน' },
    { date: '2027-12-10', name: 'วันรัฐธรรมนูญ' },
  ];
  const { rows, summary } = diffHolidayYear(google, existing, 2027);
  assert.deepEqual(rows.map((r) => [r.date, r.action]), [
    ['2027-01-01', 'new'],
    ['2027-05-01', 'renamed'],
    ['2027-12-10', 'same'], // อักขระล่องหนถูกตัดก่อนเทียบ จึงไม่เป็น renamed ปลอม
  ]);
  assert.deepEqual(summary, { new: 1, renamed: 1, same: 1, total: 3 });
  assert.equal(rows[1].current, 'วันแรงงาน');
});

test('diff เป็น additive อย่างเดียว: วันหยุดที่ระบบมีแต่ Google ไม่มี ต้องไม่โผล่และไม่ถูกแตะ', () => {
  // ของจริง: บริษัทหยุด "วันเข้าพรรษา" แต่ปฏิทิน Google ไม่มีวันนี้
  const { rows, summary } = diffHolidayYear(
    [{ date: '2027-01-01', name: 'วันขึ้นปีใหม่', kind: 'public' }],
    [{ date: '2027-07-19', name: 'วันเข้าพรรษา' }],
    2027,
  );
  assert.deepEqual(rows.map((r) => r.date), ['2027-01-01']);
  assert.equal(summary.total, 1);
});

test('normalizeImportRows: ปฏิเสธวันนอกปีที่ขอ รูปแบบผิด และเกินเพดาน', () => {
  assert.equal(normalizeImportRows([{ date: '2028-01-01' }], 2027).error, 'วันที่ 2028-01-01 ไม่ได้อยู่ในปี 2027');
  assert.match(normalizeImportRows([{ date: '2027-1-1' }], 2027).error, /รูปแบบวันที่ไม่ถูกต้อง/);
  assert.match(normalizeImportRows([], 2027).error, /ไม่มีรายการ/);
  const tooMany = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ date: `2027-01-${String((i % 28) + 1).padStart(2, '0')}` }));
  assert.match(normalizeImportRows(tooMany, 2027).error, /ไม่เกิน/);
});

test('normalizeImportRows: ตัดชื่อให้สะอาด รวมวันซ้ำ และเรียงตามวัน', () => {
  const { rows, error } = normalizeImportRows([
    { date: '2027-05-01', name: `  ${ZWSP}วันแรงงาน  ` },
    { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
    { date: '2027-05-01', name: 'วันแรงงาน (ซ้ำ)' },
  ], 2027);
  assert.equal(error, null);
  assert.deepEqual(rows, [
    { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
    { date: '2027-05-01', name: 'วันแรงงาน (ซ้ำ)' },
  ]);
});
