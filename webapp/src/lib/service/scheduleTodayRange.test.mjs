// ── การ์ด "นัดวันนี้" ของหน้าภาพรวม (/service) → รายการงานวันนี้วันเดียว (ตรวจตัวกรอง 08/10 · H15) ──────
//
// 🐞 การ์ด "นัดวันนี้ 3" เคยเปิดช่วง 7 วันของรายการงาน (12 แถว · กลุ่ม "วันนี้" ขึ้นก่อน) เพราะรายการงานไม่มีช่วง
//    "เฉพาะวันนี้" ⇒ มติเจ้าของ 19/10: การ์ดเปิดรายการ **วันนี้วันเดียว** — เลขบนการ์ด = จำนวนแถวที่เปิดเจอ
// ⭐ กติกาที่เทสต์ชุดนี้ยึด:
//   · เลขบนการ์ด (`serviceCounts().today`) กับตัวกรอง (`inQueueRange(…, 'today')`) ใช้ตัวตัดสินเดียว `isVisitToday`
//   · ลิงก์ของการ์ดประกอบด้วย `scheduleQueueHref` · หน้าจัดคิวอ่านกลับด้วย `queueRangeFrom` ⇒ เทสต์เดินทางเดียวกับจอ:
//     ประกอบลิงก์ → อ่าน query กลับ → ประกอบรายการ → เทียบจำนวนแถวกับเลขบนการ์ด
//   · "วันนี้" มาจากนาฬิกาไทย (`businessDate`) ทั้งสองฝั่ง — ไม่ใช่นาฬิกาเครื่อง (รันด้วย TZ=UTC แล้วยังต้องผ่าน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUEUE_LINK_RANGES,
  QUEUE_RANGES,
  QUEUE_RANGE_TODAY,
  QUEUE_RANGE_TODAY_LABEL,
  inQueueRange,
  isVisitToday,
  queueBucketOf,
  queueRangeFrom,
  queueWindow,
  scheduleQueueHref,
} from './scheduleQueue.js';
import * as queueLink from './scheduleQueueLink.js';
import * as queue from './scheduleQueue.js';
import { buildScheduleQueue } from './scheduleQueueView.js';
import { serviceCounts, todayByTechnician } from './overview.js';
import { VISIT_STATUSES } from './visitStatus.js';
import { businessDate } from '../businessDate.js';

const TODAY = '2026-10-19';
const YESTERDAY = '2026-10-18';
const TOMORROW = '2026-10-20';

/* ชุดนัดที่ทำให้ "วันนี้" กับ "7 วัน" ต่างกันจริง (ของจริงบนจอ: 3 กับ 12) */
const fixture = [
  { id: 'a', code: 'SV-01', status: 'scheduled', scheduledDate: TODAY, assigneeId: 'U1', assigneeName: 'สมชาย' },
  { id: 'b', code: 'SV-02', status: 'in_progress', scheduledDate: TODAY, assigneeId: 'U2', assigneeName: 'สมศักดิ์' },
  { id: 'c', code: 'SV-03', status: 'scheduled', scheduledDate: TODAY, assigneeId: null },
  { id: 'd', code: 'SV-04', status: 'done', scheduledDate: TODAY, actualDate: TODAY, assigneeId: 'U1' },   // ปิดแล้ว ไม่ใช่นัดวันนี้
  { id: 'e', code: 'SV-05', status: 'draft', scheduledDate: TODAY, assigneeId: null },                     // ร่าง ไม่ใช่นัด
  { id: 'f', code: 'SV-06', status: 'cancelled', scheduledDate: TODAY, assigneeId: 'U2' },
  { id: 'g', code: 'SV-07', status: 'scheduled', scheduledDate: YESTERDAY, assigneeId: 'U1' },             // ค้าง
  { id: 'h', code: 'SV-08', status: 'scheduled', scheduledDate: TOMORROW, assigneeId: 'U2' },
  { id: 'i', code: 'SV-09', status: 'scheduled', scheduledDate: '2026-10-25', assigneeId: null },          // ขอบ 7 วัน
  { id: 'j', code: 'SV-10', status: 'scheduled', scheduledDate: '2026-10-26', assigneeId: 'U1' },          // เลย 7 วัน
];

/* ทางเดียวกับจอ: ลิงก์ของการ์ด → query ที่หน้าจัดคิวอ่าน (`tab` + `queueRangeFrom(range)`) → แผงรายการงาน */
function openFromCard(href, visits, todayIso) {
  const url = new URL(href, 'https://suk.test');
  assert.equal(url.pathname, '/service/schedule');
  const bucket = url.searchParams.get('tab') || 'waiting';
  const range = queueRangeFrom(url.searchParams.get('range'));
  return { bucket, range, view: buildScheduleQueue({ visits, todayIso, bucket, range }) };
}

test('isVisitToday: นัดที่ยังรอลงมือ (นัดไว้ · กำลังทำ) ของวันนี้เท่านั้น', () => {
  const yes = VISIT_STATUSES.filter((status) => isVisitToday({ status, scheduledDate: TODAY }, TODAY));
  assert.deepEqual(yes, ['scheduled', 'in_progress'], 'ร่าง/ปิดแล้ว/เลื่อน/ยกเลิก ไม่ใช่นัดวันนี้');
  assert.equal(isVisitToday({ status: 'scheduled', scheduledDate: YESTERDAY }, TODAY), false, 'เมื่อวาน = ค้าง');
  assert.equal(isVisitToday({ status: 'scheduled', scheduledDate: TOMORROW }, TODAY), false);
  assert.equal(isVisitToday({ status: 'scheduled', scheduledDate: '' }, TODAY), false, 'ไม่มีวันนัด');
  // ไม่มี "วันนี้" ต้องไม่กลายเป็น "ทุกวัน" (สตริงว่างเทียบกับนัดไร้วันแล้วได้ true)
  assert.equal(isVisitToday({ status: 'scheduled', scheduledDate: '' }, ''), false);
  assert.equal(isVisitToday({ status: 'scheduled', scheduledDate: TODAY }, undefined), false);
  assert.equal(isVisitToday(null, TODAY), false);
});

test('ช่วง "today" รับได้จาก URL แต่ไม่อยู่บนแถบเลือกช่วง · ค่าที่ไม่รู้จัก = ทั้งหมด', () => {
  assert.equal(QUEUE_RANGE_TODAY, 'today');
  assert.equal(QUEUE_RANGE_TODAY_LABEL, 'นัดวันนี้');
  assert.equal(QUEUE_RANGES.includes(QUEUE_RANGE_TODAY), false, 'โชว์เป็นป้าย "กรอง: … ×" ไม่ใช่ปุ่มบนแถบ');
  assert.deepEqual([...QUEUE_LINK_RANGES], ['all', '7d', 'unassigned', 'today']);
  for (const range of QUEUE_LINK_RANGES) assert.equal(queueRangeFrom(range), range);
  for (const bogus of [null, undefined, '', 'TODAY', 'tomorrow', '1d']) assert.equal(queueRangeFrom(bogus), 'all', String(bogus));
});

test('scheduleQueueHref: ประกอบลิงก์รูปเดียวกับที่หน้าจัดคิวเขียนเอง', () => {
  assert.equal(scheduleQueueHref({ tab: 'scheduled', range: QUEUE_RANGE_TODAY }), '/service/schedule?tab=scheduled&range=today');
  assert.equal(scheduleQueueHref({ tab: 'scheduled', range: '7d' }), '/service/schedule?tab=scheduled&range=7d');
  assert.equal(scheduleQueueHref({ tab: 'scheduled' }), '/service/schedule?tab=scheduled');
  assert.equal(scheduleQueueHref({ tab: 'overdue' }), '/service/schedule?tab=overdue');
  assert.equal(scheduleQueueHref(), '/service/schedule', 'ถังตั้งต้นไม่ใส่ใน URL');
  // ช่วงใช้กับถัง "จัดแล้ว" เท่านั้น · ช่วง/ถังที่ไม่รู้จักไม่หลุดเข้า URL
  assert.equal(scheduleQueueHref({ tab: 'overdue', range: QUEUE_RANGE_TODAY }), '/service/schedule?tab=overdue');
  assert.equal(scheduleQueueHref({ tab: 'scheduled', range: 'bogus' }), '/service/schedule?tab=scheduled');
  assert.equal(scheduleQueueHref({ tab: 'bogus' }), '/service/schedule');
});

test('🔴 การ์ด "นัดวันนี้" = จำนวนแถวที่ลิงก์ของการ์ดเปิดเจอ (H15)', () => {
  const counts = serviceCounts(fixture, TODAY);
  assert.equal(counts.today, 3, 'นัดไว้ + กำลังทำ + ยังไม่มอบหมาย — กันเทสต์ผ่านเพราะศูนย์ทั้งคู่');

  const { bucket, range, view } = openFromCard(scheduleQueueHref({ tab: 'scheduled', range: QUEUE_RANGE_TODAY }), fixture, TODAY);
  assert.equal(bucket, 'scheduled');
  assert.equal(range, QUEUE_RANGE_TODAY);
  assert.equal(view.listedCount, counts.today);
  assert.deepEqual(view.groups.flatMap((g) => g.rows.map((r) => r.id)).sort(), ['a', 'b', 'c']);
  // กลุ่มเดียว = วันนี้ · หัวกลุ่มนับเท่าการ์ด
  assert.equal(view.groups.length, 1);
  assert.match(view.groups[0].label, /^วันนี้ · /);
  assert.match(view.groups[0].total, /^3 นัด/);
  // แผง "วันนี้ใครไปไหน" บนหน้าภาพรวมนับชุดเดียวกัน
  assert.equal(todayByTechnician(fixture, TODAY).reduce((n, row) => n + row.count, 0), counts.today);
});

test('การ์ดอื่นบนหน้าภาพรวมก็เปิดเจอเท่าเลข — ค้าง / สัปดาห์นี้ (ลิงก์ตัวประกอบเดียวกัน)', () => {
  const counts = serviceCounts(fixture, TODAY);
  const week = openFromCard(scheduleQueueHref({ tab: 'scheduled', range: '7d' }), fixture, TODAY).view;
  assert.equal(week.listedCount, counts.week);
  assert.equal(counts.week, 5);
  assert.ok(week.listedCount > counts.today, 'ช่วง 7 วันต้องกว้างกว่าวันนี้ — ไม่งั้นเทสต์ข้อบนพิสูจน์อะไรไม่ได้');
  const overdue = openFromCard(scheduleQueueHref({ tab: 'overdue' }), fixture, TODAY).view;
  assert.equal(overdue.listedCount, counts.overdue);
  assert.equal(counts.overdue, 1);
});

test('ตัวกรองวันนี้ = ตัวตัดสินเดียวกับเลขบนการ์ด ทุกนัดทุกสถานะ', () => {
  const win = queueWindow(TODAY);
  const statuses = VISIT_STATUSES;
  const dates = [YESTERDAY, TODAY, TOMORROW];
  for (const status of statuses) {
    for (const scheduledDate of dates) {
      const visit = { id: `${status}-${scheduledDate}`, status, scheduledDate, actualDate: scheduledDate, assigneeId: null };
      const onCard = serviceCounts([visit], TODAY).today === 1;
      const listed = queueBucketOf(visit, win) === 'scheduled' && inQueueRange(visit, QUEUE_RANGE_TODAY, win);
      assert.equal(listed, onCard, `${status} ${scheduledDate}`);
      assert.equal(isVisitToday(visit, TODAY), onCard, `${status} ${scheduledDate}`);
    }
  }
});

test('"วันนี้" มาจากนาฬิกาไทย — 00:30 น. ของ 19 ต.ค. ที่ไทย (17:30 UTC ของ 18) ยังเป็นวันที่ 19 ทั้งการ์ดและรายการ', () => {
  const instant = new Date('2026-10-18T17:30:00Z');
  const thaiToday = businessDate(instant);
  assert.equal(thaiToday, TODAY);
  const counts = serviceCounts(fixture, thaiToday);
  const { view } = openFromCard(scheduleQueueHref({ tab: 'scheduled', range: QUEUE_RANGE_TODAY }), fixture, thaiToday);
  assert.equal(view.listedCount, counts.today);
  assert.equal(counts.today, 3);
  // ถ้าใช้วันของนาฬิกาเครื่อง (UTC) จะได้วันที่ 18 = นัดเมื่อวานกลายเป็นนัดวันนี้
  assert.equal(serviceCounts(fixture, instant.toISOString().slice(0, 10)).today, 1);
});

/* ═══ ยามอ่านซอร์ส — การ์ดใช้ลิงก์ตัวประกอบ · หน้าจัดคิวอ่านกลับด้วยตัวอ่านเดียวกัน + ป้ายล้างที่เขียน URL ════ */
const live = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const importsOf = (source) => [...source.matchAll(/^import[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

test('ไฟล์ลิงก์เบา: scheduleQueue.js re-export ตัวเดียวกันทุกตัว · หน้าภาพรวมไม่ลากตัวตัดสินด่านเข้า bundle', () => {
  // re-export = ตัวเดียวกัน ไม่ใช่สำเนา (ผู้เรียกเดิมของ scheduleQueue.js ได้ของชุดเดียวกับหน้าภาพรวม)
  for (const [name, value] of Object.entries(queueLink)) assert.equal(queue[name], value, name);
  const link = readFileSync(new URL('./scheduleQueueLink.js', import.meta.url), 'utf8');
  assert.deepEqual(importsOf(link), ['./visitStatus'], 'ไฟล์ลิงก์ import ได้แค่ visitStatus');
  const overview = readFileSync(new URL('./overview.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../app/service/page.js', import.meta.url), 'utf8');
  for (const [file, source] of [['overview.js', overview], ['service/page.js', page]]) {
    const deps = importsOf(source);
    assert.ok(deps.some((dep) => /scheduleQueueLink$/.test(dep)), `${file} ใช้ไฟล์ลิงก์`);
    assert.equal(deps.some((dep) => /scheduleQueue$|scheduleQueueView$|visitGate$/.test(dep)), false, `${file} ห้าม import ตัวตัดสินรายการงาน/ด่าน`);
  }
});

test('🔴 ยามอ่านซอร์ส: การ์ด "นัดวันนี้" เปิดช่วงวันนี้ ไม่ใช่ 7 วัน', () => {
  const page = live(readFileSync(new URL('../../app/service/page.js', import.meta.url), 'utf8'));
  const card = page.match(/label="นัดวันนี้"(?:(?!\/>)[\s\S])*\/>/)?.[0] || '';
  assert.match(card, /value=\{counts\.today\}/);
  assert.match(card, /scheduleQueueHref\(\{ tab: "scheduled", range: QUEUE_RANGE_TODAY \}\)/);
  assert.doesNotMatch(card, /7d/);
  // "วันนี้" ของหน้าภาพรวมมาจากนาฬิกาไทย และ **เลื่อนตอนกลับมามองแท็บ** — ห้ามตรึงตอนเมานต์
  // (แท็บเปิดค้างข้ามเที่ยงคืน = การ์ดนับนัดของเมื่อวาน ขณะที่ลิงก์ของการ์ดเปิด `range=today` ของวันใหม่)
  assert.match(page, /const \[todayIso, setTodayIso\] = useState\(\(\) => businessDate\(\)\);/);
  assert.doesNotMatch(page, /useMemo\(\(\) => businessDate\(\), \[\]\)/, 'วันนี้ที่ตรึงตอนเมานต์ไม่ข้ามเที่ยงคืน');
  const revalidate = page.match(/useRevalidateOnFocus\(\(opts\) => \{[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(revalidate, /const nowIso = businessDate\(\);/, 'กลับมามองแท็บต้องอ่านนาฬิกาไทยใหม่');
  assert.match(revalidate, /if \(nowIso !== todayIso\) setTodayIso\(nowIso\);/, 'ข้ามวัน = เลื่อนวันนี้ (ช่วงที่ดึงขยับ ⇒ โหลดใหม่ทั้งแผง)');
  assert.match(revalidate, /else load\(opts\);/, 'วันเดิม = ดึงเบื้องหลังตามปกติ');
});

test('🔴 ยามอ่านซอร์ส: หน้าจัดคิวอ่าน range ด้วย queueRangeFrom (useSearchParams) · ป้าย "กรอง: … ×" ล้างด้วยการเขียน URL', () => {
  const page = live(readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8'));
  assert.match(page, /const searchParams = useSearchParams\(\);/);
  assert.match(page, /const range = queueRangeFrom\(rangeParam\);/);
  assert.match(page, /const rangeParam = searchParams\.get\("range"\);/);
  // ⚠️ รูปเดิม `QUEUE_RANGES.includes(rangeParam)` ทิ้ง today เงียบ ๆ ⇒ การ์ดพาไปทั้งหมด
  assert.doesNotMatch(page, /QUEUE_RANGES\.includes\(rangeParam\)/);
  const chip = page.match(/bucket === "scheduled" && todayOnly && \([\s\S]*?<\/Button>/)?.[0] || '';
  assert.match(chip, /onClick=\{\(\) => setQuery\(\{ range: null \}\)\}/);
  assert.match(chip, /กรอง: \{QUEUE_RANGE_TODAY_LABEL\} \{dayText\(todayIso\)\} <span aria-hidden="true">×<\/span>/);
  // โปรแกรมอ่านจอ: ชื่อขึ้นต้นด้วยข้อความที่ตาเห็น แล้วบอกว่ากดเพื่อล้าง ("×" ซ่อน ไม่ให้อ่านว่า "คูณ")
  assert.match(chip, /aria-label=\{`กรอง: \$\{QUEUE_RANGE_TODAY_LABEL\} \$\{dayText\(todayIso\)\} — กดเพื่อล้างตัวกรอง`\}/);
  // วันนี้ของหน้าจัดคิวก็จากนาฬิกาไทย
  assert.match(page, /const todayIso = businessDate\(\);/);
  // แถบเลือกช่วงยังเป็นสามช่วงเดิม (today ไม่ใช่ปุ่มบนแถบ)
  assert.match(page, /const rangeOptions = QUEUE_RANGES\.map\(/);
});

/* ── M24g (ตรวจตัวเลข 20/10): การ์ด "นัดค้าง" นับชุดเดียวกับแท็บ "ค้าง" ──────────────────────────────────
   🐞 หน้าภาพรวมดึง `/api/service/visits?from=วันนี้-120&to=วันนี้+6` ⇒ นัดที่ค้างเกิน 120 วันไม่ถูกนับ แต่แท็บ "ค้าง"
      (`loadQueueVisits`) ไม่มีขอบล่าง ⇒ กดการ์ดแล้วเจอมากกว่าเลข · ตัวตัดสินตรงกันอยู่แล้ว (เทสต์ข้างบน) — ช่องโหว่คือ **ชุดข้อมูล**
   ⭐ หน้าภาพรวมดึง `visits/queue?view=load` ตัวเดียวกับแท็บ ⇒ ยามซอร์ส + เทสต์ตรรกะด้วยนัดค้างเก่ากว่า 120 วัน */
test('🔴 M24g: หน้าภาพรวมดึงนัดจาก visits/queue?view=load — ไม่มีช่วงวัน/LOOKBACK · ข้ามวันยังโหลดใหม่', () => {
  const page = live(readFileSync(new URL('../../app/service/page.js', import.meta.url), 'utf8'));
  assert.match(page, /apiFetch\("\/api\/service\/visits\/queue\?view=load"\)/);
  assert.doesNotMatch(page, /\/api\/service\/visits\?from=/, 'ห้ามกลับไปดึงเป็นช่วงวัน — นัดค้างเก่าหายจากการ์ด');
  assert.doesNotMatch(page, /LOOKBACK/);
  // ตัวโหลดไม่อ่านวันแล้ว ⇒ วันต้องอยู่ใน deps ของ effect ไม่งั้นทางข้ามวันของ useRevalidateOnFocus แค่เลื่อนวัน ไม่โหลดใหม่
  assert.match(page, /useEffect\(\(\) => \{ load\(\); \}, \[load, todayIso\]\);/);
  // การ์ด/แผงนับจากชุดในกรอบของหน้า (ไม่มีขอบล่าง · ขอบบนวันนี้ + 6)
  assert.match(page, /const counts = useMemo\(\(\) => serviceCounts\(windowVisits, todayIso\), \[windowVisits, todayIso\]\);/);
  assert.match(page, /return visits\.filter\(\(v\) => String\(v\.scheduledDate \|\| ""\) <= until\);/);
  // ผู้เรียกที่สองของ view=load ถูกจดไว้ที่ queueRouteMode
  const queueSrc = readFileSync(new URL('./scheduleQueue.js', import.meta.url), 'utf8');
  assert.match(queueSrc, /ผู้เรียกที่สอง: \*\*หน้าภาพรวมบริการ\*\*/);
});

test('🔴 M24g: นัดค้างเก่ากว่า 120 วัน — การ์ดนับ และแท็บ "ค้าง" เปิดเจอ (เลขเดียวกัน)', () => {
  const ancient = { id: 'old', status: 'scheduled', scheduledDate: '2026-04-01', assigneeId: null };
  const rows = [...fixture, ancient];
  const counts = serviceCounts(rows, TODAY);
  const overdue = openFromCard(scheduleQueueHref({ tab: 'overdue' }), rows, TODAY).view;
  assert.equal(overdue.listedCount, counts.overdue);
  assert.ok(overdue.rows.some((r) => r.id === 'old' && r.bucket === 'overdue'), 'แท็บค้างไม่มีขอบล่าง');
  // 🐞 ชุดของเดิม (ย้อน 120 วัน) ทำการ์ดขาดไปหนึ่งใบ — ช่องโหว่อยู่ที่ชุดข้อมูล ไม่ใช่ตัวตัดสิน
  const lookback120 = rows.filter((v) => v.scheduledDate >= '2026-06-21');
  assert.equal(serviceCounts(lookback120, TODAY).overdue, overdue.listedCount - 1);
});
