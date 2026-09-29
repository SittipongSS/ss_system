// ── เทสต์ตัวช่วยจอแก้ปฏิทินรายปีของลูกค้า (billingCalendarEdit.js · มติเจ้าของ 29/09) ──
// ตัวอย่างจริง: ปฏิทินมีเมตตา 2026 (AR-281 · mockups/billing-cycle/calendar-v3/brief.md §1) ทั้งเครดิต 0 และเครดิต 30 (Q1 ยังเปิด)
// สิ่งที่พิสูจน์: ตาราง ⇄ runs ไม่เพี้ยน · ร่างลงเฉพาะช่องว่าง · ร่างต้อง "ตรงกับรูป" ก่อนบันทึก · ปฏิทินเล็ก อา–ส · คำเตือนวันจ่ายข้ามเดือน ·
//   ผลสุดท้ายผ่าน ruleFromForm → normalizeRule(โหมดบันทึก) ได้กติกาเดียวกับที่เก็บ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_WEEKDAY_HEADS, addCalendarRound, calendarCellInfo, calendarDraftPreview, calendarEditorIssues, calendarEditorOf, calendarFormYears,
  calendarMonthGrid, calendarNextRunMonth, calendarPastMonths, calendarPatternOf, calendarRollovers, calendarRowWarnings, calendarYearRuns,
  calendarYearTabs, cellTextOf, confirmCalendarMonth, draftCalendarFromPattern, emptyCalendarYear, fillCalendarCellFromDay, nextCalendarCell,
  parseCalendarCell, pickCalendarAlternative, removeCalendarRound, setCalendarCell, setCalendarFile,
} from './billingCalendarEdit.js';
import { calendarDiffSummary, dueDateForBilling, normalizeRule, ruleFromForm, ruleOf } from './billingRuleV4.js';

const TODAY = '2026-09-29';
const MEEMETTA_TABLE = [
  [1, 9, 15, 22, 30], [2, 6, 16, 19, 27], [3, 6, 16, 23, 31], [4, 2, 16, 22, 30],
  [5, 8, 15, 21, 29], [6, 8, 15, 22, 30], [7, 8, 15, 23, 30], [8, 10, 17, 21, 31],
  [9, 8, 15, 22, 30], [10, 8, 15, 21, 30], [11, 9, 16, 20, 30], [12, 8, 15, 22, 30],
];
const d26 = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MEEMETTA_2026 = MEEMETTA_TABLE.flatMap(([m, c1, p1, c2, p2]) => [{ cutoff: d26(m, c1), pay: d26(m, p1) }, { cutoff: d26(m, c2), pay: d26(m, p2) }]);
const meemetta = (creditDays, years = { 2026: { runs: MEEMETTA_2026 } }) => ({
  v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays, runs: { kind: 'calendar', cutoffTime: '16:00', years },
});
const HOLIDAYS = new Map([['2026-10-13', 'วันคล้ายวันสวรรคต ร.9'], ['2026-10-23', 'วันปิยมหาราช'], ['2026-12-07', 'ชดเชยวันพ่อแห่งชาติ']]);
/* ฟอร์มโมดัล ② "ตามปฏิทินลูกค้า" + ③ ไม่มีค่าตั้งต้น — คนเลือก calPay เอง (Q1) */
const saveFrom = (state, calPay, creditDays = null, cutoffTime = '16:00') => normalizeRule(ruleFromForm({
  need: 'required', bill: 'calendar', calPay, creditDays, calendar: { ...calendarFormYears(state), cutoffTime },
}), { allowLegacy: false });

test('ช่องของตาราง — "15" = วันที่ 15 ของเดือนแถว · วันจ่ายเลขน้อยกว่าวันตัดรอบ = เดือนถัดไป · "5/1" = ข้ามปี · ผิดรูปบอกเหตุเป็นไทย', () => {
  assert.deepEqual(parseCalendarCell(2026, 10, '8', 'c'), { iso: '2026-10-08', rolled: false });
  assert.deepEqual(parseCalendarCell(2026, 10, '5', 'p', '2026-10-21'), { iso: '2026-11-05', rolled: true });
  assert.deepEqual(parseCalendarCell(2026, 12, '5/1', 'p', '2026-12-22'), { iso: '2027-01-05', rolled: false });
  assert.deepEqual(parseCalendarCell(2026, 10, '', 'c'), { iso: null });
  assert.match(parseCalendarCell(2026, 10, '5/11', 'c').err, /วันตัดรอบต้องอยู่ใน ต\.ค\./);
  assert.match(parseCalendarCell(2026, 2, '30', 'c').err, /ก\.พ\. มี 28 วัน/);
  assert.match(parseCalendarCell(2026, 10, 'สิบ', 'c').err, /พิมพ์เลขวัน/);
  assert.match(parseCalendarCell(2026, 10, '21/10', 'p', '2026-10-22').err, /ก่อนวันตัดรอบ/);
  assert.deepEqual(cellTextOf('2027-01-05', 2026, 12, 'p'), { text: '5/1', err: null });
  assert.deepEqual(cellTextOf('2026-10-30', 2026, 10, 'p'), { text: '30', err: null });
  assert.match(cellTextOf('2026-11-02', 2026, 10, 'c').err, /ต\.ค\./);
});

test('⭐ กติกาที่เก็บ → ตาราง → กติกา ได้ค่าเดิม (มีเมตตา เครดิต 0 และ 30 · จ่ายข้ามปี · รูปแนบ) · แท็บปี "2027 ยังไม่มี"', () => {
  const st = calendarEditorOf(meemetta(0), { todayIso: TODAY });
  assert.equal(st.roundsN, 2);
  assert.deepEqual(Object.keys(st.years), ['2026', '2027']);
  assert.deepEqual(st.years['2026'].cells[0], [{ c: '9', p: '15' }, { c: '22', p: '30' }]);
  assert.deepEqual(calendarYearRuns(st, 2026), MEEMETTA_2026);
  assert.deepEqual(calendarYearTabs(st, TODAY).map((t) => [t.year, t.count, t.label, t.current]), [[2026, 24, '2026', true], [2027, 0, '2027 ยังไม่มี', false]]);
  for (const [calPay, credit] of [['same', null], ['credit', 30]]) {
    const { rule, error } = saveFrom(st, calPay, credit);
    assert.equal(error, null, calPay);
    assert.deepEqual(rule, ruleOf(meemetta(credit || 0)), `เปิดแล้วบันทึกซ้ำ = กติกาเดิม (${calPay})`);
  }
  assert.match(saveFrom(st, null).error, /เครดิต/, 'ข้อ ③ ไม่มีค่าตั้งต้น (Q1 ยังเปิด)');
  const cross = { ...meemetta(0), runs: { kind: 'calendar', years: { 2026: { runs: [{ cutoff: '2026-12-22', pay: '2027-01-05' }], fileId: 'att-9' } } } };
  const cs = calendarEditorOf(cross, { todayIso: TODAY });
  assert.deepEqual(cs.years['2026'].cells[11][0], { c: '22', p: '5/1' });
  assert.equal(cs.years['2026'].fileId, 'att-9');
  assert.deepEqual(calendarFormYears(cs), { years: { 2026: [{ cutoff: '2026-12-22', pay: '2027-01-05' }] }, files: { 2026: 'att-9' } });
  assert.deepEqual(saveFrom(cs, 'same', null, null).rule, ruleOf(cross));
  const fresh = calendarEditorOf(null, { todayIso: TODAY });
  assert.deepEqual([fresh.roundsN, Object.keys(fresh.years)], [2, ['2026', '2027']], 'ปฏิทินใหม่: สองรอบ · ปีนี้กับปีหน้า');
  assert.deepEqual(calendarEditorIssues(fresh).messages, ['ใส่วันในตารางปฏิทินอย่างน้อยหนึ่งรอบ']);
});

test('⭐ ร่างจากรอบประจำ — รอบประจำมาจากปี 2026 (ตัด 8 → 15 · ตัด 22 → 30) · ลงเฉพาะช่องที่ว่าง · วันหยุด/เสาร์อาทิตย์ = ธง + วันทำงานก่อน/หลัง ไม่เลื่อนเอง', () => {
  let st = calendarEditorOf(meemetta(0), { todayIso: TODAY });
  st = setCalendarCell(st, 2027, 0, 0, 'c', '7');
  st = setCalendarCell(st, 2027, 0, 0, 'p', '14');
  const pattern = calendarPatternOf(st, 2027);
  assert.deepEqual(pattern, [{ cutoffDay: 8, payDay: 15, payMonthOffset: 0 }, { cutoffDay: 22, payDay: 30, payMonthOffset: 0 }], 'ไม่ใช่จากช่องที่เพิ่งพิมพ์ในปี 2027');
  assert.match(calendarDraftPreview(st, 2027, pattern).text, /^ร่างลงช่องว่าง 23 คู่ · 10 วันตรงเสาร์\/อาทิตย์\/วันหยุด/);
  const { state: drafted, filled, flagged, error } = draftCalendarFromPattern(st, 2027, pattern);
  assert.deepEqual([filled, flagged, error], [23, 10, null]);
  assert.deepEqual(drafted.years['2027'].cells[0], [{ c: '7', p: '14' }, { c: '22', p: '30' }], 'ช่องที่คนพิมพ์ไม่ถูกทับ');
  assert.deepEqual(drafted.years['2027'].cells[1][1], { c: '22', p: '28' }, 'ก.พ. ไม่มีวันที่ 30 = วันสุดท้ายของเดือน (ร่าง)');
  assert.deepEqual(drafted.years['2026'], st.years['2026'], 'ปีอื่นไม่แตะ');
  const feb = calendarRowWarnings(drafted, 2027, 1);
  assert.deepEqual(feb.map((w) => w.kind), ['draft', 'alt']);
  assert.deepEqual([feb[1].before, feb[1].after], ['2027-02-26', '2027-03-01']);
  const picked = pickCalendarAlternative(drafted, 2027, 1, 1, 'p', '2027-03-01');
  assert.deepEqual(picked.years['2027'].cells[1][1], { c: '22', p: '1/3' });
  assert.equal(calendarCellInfo(picked, 2027, 1, 1).p.iso, '2027-03-01');
  assert.equal(picked.years['2027'].unchecked.includes(1), false, 'คนเลือกเอง = ดูเดือนนั้นแล้ว');
  const all = draftCalendarFromPattern(st, 2027, pattern, { overwrite: true }).state;
  assert.deepEqual(all.years['2027'].cells[0][0], { c: '8', p: '15' }, 'ทับทั้งปี = คนเลือกเองเท่านั้น');
  const late = draftCalendarFromPattern(calendarEditorOf(null, { todayIso: TODAY }), 2026, pattern, { fromMonth: 10 });
  assert.deepEqual([late.filled, late.state.years['2026'].unchecked], [6, [9, 10, 11]], 'ไม่ร่างเดือนที่ผ่านแล้ว');
  assert.match(draftCalendarFromPattern(st, 2027, []).error, /อย่างน้อยหนึ่งรอบ/);
});

test('⭐ ร่างที่ยังไม่ได้เทียบกับรูป = บันทึกไม่ได้ · "ตรงกับรูป" ทีละเดือน · แก้ช่องเอง = ดูแล้ว', () => {
  const base = calendarEditorOf(meemetta(0), { todayIso: TODAY });
  let st = draftCalendarFromPattern(base, 2027, calendarPatternOf(base, 2027)).state;
  const issues = calendarEditorIssues(st);
  assert.equal(issues.ok, false);
  assert.equal(issues.unchecked.length, 12);
  assert.match(issues.messages[0], /^ร่างที่ยังไม่ได้เทียบกับรูป 12 เดือน \(ม\.ค\. 2027 · /);
  for (let mi = 0; mi < 11; mi += 1) st = confirmCalendarMonth(st, 2027, mi);
  assert.deepEqual(calendarEditorIssues(st).unchecked.map((u) => u.label), ['ธ.ค. 2027']);
  st = setCalendarCell(st, 2027, 11, 1, 'p', '31');
  const ok = calendarEditorIssues(st);
  assert.deepEqual([ok.ok, ok.messages], [true, []]);
  assert.deepEqual(st.years['2027'].draft.filter((k) => k.startsWith('11-')), ['11-0-c', '11-0-p', '11-1-c'], 'ช่องที่ยังเป็นร่างยังรู้ว่าเป็นร่าง');
  const saved = saveFrom(st, 'credit', 30).rule;
  assert.deepEqual(Object.keys(saved.runs.years), ['2026', '2027']);
  assert.equal(saved.runs.years['2027'].runs.length, 24);
  assert.equal(dueDateForBilling(saved, '2026-11-23'), '2027-01-15', 'เครดิต 30: หลังใส่ปี 2027 งวดที่เคยหยุดได้วันตามปฏิทิน');
  assert.deepEqual(calendarDiffSummary(meemetta(30), saved).lines, ['เพิ่มปฏิทิน 2027 (24 รอบ)'], 'บรรทัดเธรดของการแก้');
});

test('ตรวจก่อนบันทึก — ช่องอ่านไม่ได้ · คู่ครึ่งเดียว · วันตัดรอบไม่เรียง · ตัวตรวจของตัวคิด (จ่ายห่างเกิน 120 วัน)', () => {
  let st = calendarEditorOf(null, { todayIso: TODAY });
  st = setCalendarCell(st, 2026, 9, 0, 'c', '8');
  assert.deepEqual(calendarEditorIssues(st).errors.map((e) => e.text), ['ต.ค. 2026 รอบ 1: ใส่วันจ่ายด้วย']);
  assert.deepEqual(calendarRowWarnings(st, 2026, 9).map((w) => w.kind), ['half']);
  st = setCalendarCell(st, 2026, 9, 0, 'p', '15');
  st = setCalendarCell(st, 2026, 9, 1, 'c', '5');
  st = setCalendarCell(st, 2026, 9, 1, 'p', '9');
  assert.match(calendarEditorIssues(st).errors[0].text, /ต\.ค\. 2026 รอบ 2: วันตัดรอบ ต้องหลังวันตัดรอบ รอบ 1/);
  st = setCalendarCell(st, 2026, 9, 1, 'c', '21');
  st = setCalendarCell(st, 2026, 9, 1, 'p', 'x');
  assert.match(calendarEditorIssues(st).errors[0].text, /วันจ่าย พิมพ์เลขวัน/);
  st = setCalendarCell(st, 2026, 9, 1, 'p', '28/2');
  assert.match(calendarEditorIssues(st).errors[0].text, /ห่างวันตัดรอบเกิน 120 วัน/, 'ด่านเดียวกับ normalizeRule — ไม่ปล่อยให้ API ตีกลับ');
  st = setCalendarCell(st, 2026, 9, 1, 'p', '30');
  assert.equal(calendarEditorIssues(st).ok, true);
});

test('คำเตือนวันจ่ายข้ามเดือน (พิมพ์ 5 แทน 25) · เสาร์/อาทิตย์/วันหยุดในระบบ = ข้อมูลประกอบ วันที่ลูกค้าประกาศชนะ', () => {
  let st = calendarEditorOf(meemetta(0), { todayIso: TODAY });
  st = setCalendarCell(st, 2026, 10, 1, 'p', '5');
  const rolled = calendarRollovers(st, 2026);
  assert.deepEqual(rolled.map((r) => [r.mi, r.ri, r.pay, r.gap, r.median]), [[10, 1, '2026-12-05', 15, 8]]);
  assert.equal(rolled[0].text, 'วันจ่ายรอบ 2 ข้ามไป ส. 5 ธ.ค. ห่าง 15 วัน (รอบอื่น ~8 วัน) — ตรวจกับรูป');
  assert.deepEqual(calendarRowWarnings(st, 2026, 10).map((w) => w.kind), ['weekend', 'rolled']);
  st = setCalendarCell(st, 2026, 10, 1, 'p', '5/12');
  assert.deepEqual(calendarRollovers(st, 2026), [], 'พิมพ์เดือนเอง = ตั้งใจ ไม่เตือนข้ามเดือน');
  st = setCalendarCell(st, 2026, 9, 1, 'c', '23');
  assert.deepEqual(calendarRowWarnings(st, 2026, 9, { holidays: HOLIDAYS }).map((w) => w.text), ['วันตัดรอบ ศ. 23 ต.ค. ตรงวันหยุดในระบบ (วันปิยมหาราช) — ลูกค้าประกาศเอง ใช้ตามรูป']);
});

test('ปฏิทินเล็ก อา–ส — ต.ค. 2026 เริ่มวันพฤหัส · วันตัดรอบ/วันจ่ายของรอบ · วันหยุดในระบบ · แตะวันเพื่อใส่ช่องแล้วไปช่องถัดไป', () => {
  const st = calendarEditorOf(meemetta(0), { todayIso: TODAY });
  const g = calendarMonthGrid(st, 2026, 10, { holidays: HOLIDAYS, todayIso: TODAY });
  assert.deepEqual(g.heads, ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']);
  assert.deepEqual(CALENDAR_WEEKDAY_HEADS[0], 'อา.', 'สัปดาห์เริ่มวันอาทิตย์ (มติ 26/09)');
  assert.equal(g.title, 'ต.ค. 2026');
  assert.deepEqual(g.weeks[0].slice(0, 4), [null, null, null, null]);
  assert.equal(g.weeks[0][4].day, 1);
  const cell = (d) => g.weeks.flat().find((c) => c && c.day === d);
  assert.deepEqual([cell(8).mark, cell(15).mark, cell(21).mark, cell(30).mark], [{ kind: 'c', ri: 0, draft: false }, { kind: 'p', ri: 0, draft: false }, { kind: 'c', ri: 1, draft: false }, { kind: 'p', ri: 1, draft: false }]);
  assert.deepEqual([cell(23).holiday, cell(23).holidayName, cell(24).weekend], [true, 'วันปิยมหาราช', true]);
  assert.equal(calendarMonthGrid(st, 2026, 13).title, 'ม.ค. 2027', 'เดือนถัดไปของ ธ.ค. (วันจ่ายข้ามปี)');
  let s2 = calendarEditorOf(null, { todayIso: TODAY });
  const t0 = { year: 2027, mi: 0, ri: 0, kind: 'c' };
  let r = fillCalendarCellFromDay(s2, t0, '2027-01-08');
  assert.deepEqual([r.error, r.next], [null, { year: 2027, mi: 0, ri: 0, kind: 'p' }]);
  r = fillCalendarCellFromDay(r.state, r.next, '2027-01-15');
  assert.deepEqual(r.next, { year: 2027, mi: 0, ri: 1, kind: 'c' });
  assert.deepEqual(r.state.years['2027'].cells[0][0], { c: '8', p: '15' });
  const bad = fillCalendarCellFromDay(r.state, { year: 2027, mi: 0, ri: 1, kind: 'c' }, '2027-02-01');
  assert.match(bad.error, /วันตัดรอบต้องอยู่ใน ม\.ค\./);
  assert.equal(bad.state, r.state, 'ผิด = ไม่แก้สถานะ');
  assert.equal(nextCalendarCell(s2, { year: 2027, mi: 11, ri: 1, kind: 'p' }), null, 'หมดปี');
  s2 = r.state;
  assert.match(fillCalendarCellFromDay(s2, null, '2027-01-08').error, /แตะช่องในตารางก่อน/);
});

test('เพิ่ม/ลดรอบ · เดือนที่ผ่านแล้ว · รอบถัดไป · รูปแนบรายปี', () => {
  let st = calendarEditorOf(meemetta(0), { todayIso: TODAY });
  st = addCalendarRound(st);
  assert.equal(st.roundsN, 3);
  assert.equal(st.years['2027'].cells[5].length, 3);
  const { state: back, error } = removeCalendarRound(st);
  assert.deepEqual([error, back.roundsN], [null, 2]);
  const used = setCalendarCell(st, 2027, 0, 2, 'c', '28');
  assert.match(removeCalendarRound(used).error, /รอบ 3 ยังมีวันที่อยู่/, 'ไม่ลบวันที่คนพิมพ์เงียบ ๆ');
  for (let i = 0; i < 5; i += 1) st = addCalendarRound(st);
  assert.equal(st.roundsN, 4, 'ไม่เกิน 4 รอบต่อเดือน');
  assert.deepEqual([calendarPastMonths(2026, TODAY), calendarPastMonths(2025, TODAY), calendarPastMonths(2027, TODAY)], [8, 12, 0]);
  assert.deepEqual(calendarNextRunMonth(st, TODAY), { year: 2026, mi: 9, cutoff: '2026-10-08' });
  assert.equal(setCalendarFile(st, 2027, 'att-2027').years['2027'].fileId, 'att-2027');
  assert.deepEqual(emptyCalendarYear(9).cells[0].length, 4);
});

test('ข้อผิดต้องชี้ช่องได้ — "15/3" (ตั้งใจพิมพ์ 15) แดงที่ช่องวันจ่ายของแถว · ข้อผิดระดับปีบอกข้อความเต็ม ไม่ใช่แค่ "N ช่อง"', () => {
  let st = calendarEditorOf(null, { todayIso: TODAY });
  st = setCalendarCell(st, 2026, 9, 0, 'c', '8');
  st = setCalendarCell(st, 2026, 9, 0, 'p', '15/3');
  st = setCalendarCell(st, 2026, 9, 1, 'c', '21');
  st = setCalendarCell(st, 2026, 9, 1, 'p', '30');
  assert.match(calendarCellInfo(st, 2026, 9, 0).p.err, /ห่างวันตัดรอบเกิน 120 วัน/);
  assert.deepEqual(calendarRowWarnings(st, 2026, 9).map((w) => [w.kind, w.field]), [['bad', 'p']], 'แถว ต.ค. มีธงแดง');
  const issues = calendarEditorIssues(st);
  assert.equal(issues.ok, false);
  assert.deepEqual(issues.messages, ['ตารางปฏิทินมี 1 ช่องที่ต้องแก้']);
});

test('ชิปวันทำงานก่อน/หลังที่ใส่ลงช่องไม่ได้ ไม่โชว์ — ตัดรอบสิ้นเดือน ม.ค. 2027 ตรงอาทิตย์: เหลือ "ศ. 29 ม.ค." ไม่มี "จ. 1 ก.พ." ที่แตะแล้วเงียบ', () => {
  const st0 = calendarEditorOf(null, { todayIso: TODAY });
  const { state } = draftCalendarFromPattern(st0, 2027, [{ cutoffDay: 31, payDay: 15, payMonthOffset: 1 }]);
  const alt = calendarRowWarnings(state, 2027, 0).find((w) => w.kind === 'alt' && w.field === 'c');
  assert.ok(alt, 'ร่าง 31 ม.ค. 2027 (อาทิตย์) มีธง');
  assert.deepEqual([alt.before, alt.after], ['2027-01-29', null]);
  assert.match(alt.text, /เลือก:$/);
  const picked = pickCalendarAlternative(state, 2027, 0, alt.ri, 'c', alt.before);
  assert.equal(calendarCellInfo(picked, 2027, 0, alt.ri).c.iso, '2027-01-29', 'ชิปที่เหลือแตะแล้วได้จริง');
});
