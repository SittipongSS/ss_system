import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MGMT_TASKS_COUNT_PARAM, TASK_STATUSES, isMyOpenTask, isOpenStatus, isUrgentOpenTask, mgmtTaskLinkRows, mgmtTasksHref,
  readMgmtTasksLink, statusCounts,
} from './constants.js';

// ── ป้ายตัวเลขบนเมนู "รายการงาน" (ม-116) ─────────────────────────────────
test('⭐ "รอฉันลงมือ" = ยังไม่จบ + มอบหมายให้ฉัน — งานที่ฉันสั่งคนอื่นไม่นับ', () => {
  const me = 'USR-ME';
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: me }, me), true);
  assert.equal(isMyOpenTask({ status: 'in_progress', assigneeId: me }, me), true);
  assert.equal(isMyOpenTask({ status: 'done', assigneeId: me }, me), false);
  assert.equal(isMyOpenTask({ status: 'cancelled', assigneeId: me }, me), false);
  // งานของคนอื่น — แม้ฉันจะเป็นคนสร้าง ก็ไม่ใช่งานที่รอฉัน
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: 'USR-OTHER' }, me), false);
  // งานที่ยังไม่มีผู้รับผิดชอบ ไม่ใช่ของใครโดยเฉพาะ
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: null }, me), false);
  assert.equal(isMyOpenTask({ status: 'todo', assigneeId: me }, ''), false);
});

test('สถานะที่นับว่ายังไม่จบ ตรงกับที่ statusCounts แยกช่อง', () => {
  assert.equal(isOpenStatus('todo'), true);
  assert.equal(isOpenStatus('in_progress'), true);
  assert.equal(isOpenStatus('done'), false);
  const counts = statusCounts([
    { status: 'todo' }, { status: 'in_progress' }, { status: 'done' }, { status: 'cancelled' },
  ]);
  assert.deepEqual(counts, { todo: 1, in_progress: 1, done: 1, cancelled: 1 });
});

// ── ตรวจตัวเลข L4 (26/10/2026): การ์ด KPI ของ /mgmt = แถวที่ /mgmt/tasks เปิดเจอหลังกด ───────────────────
// 🐞 เดิมการ์ดทั้งห้าใบกดไม่ได้ · ลิงก์หัวกล่อง "งานด่วน — ยังไม่เสร็จ" พาไป /mgmt/tasks เปล่า (= งานทุกใบของปีปัจจุบัน
//    ไม่สนปีที่เลือกบน /mgmt) · ป้าย "งานด่วน" ไม่บอกว่านับเฉพาะที่ยังไม่เสร็จ
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const paramsOf = (href) => new URLSearchParams(href.split('?')[1] || '');

test('isUrgentOpenTask = ด่วน + ยังไม่จบ (todo · in_progress) เท่านั้น', () => {
  for (const priority of ['urgent', 'normal', undefined]) {
    for (const status of [...TASK_STATUSES, undefined]) {
      assert.equal(isUrgentOpenTask({ priority, status }), priority === 'urgent' && isOpenStatus(status), `${priority} · ${status}`);
    }
  }
  assert.equal(isUrgentOpenTask(null), false);
});

/* จำลองสองฝั่งบนงานชุดเดียวกันของปีหนึ่ง (= `listTasks(year)` ทั้งคู่):
   /mgmt — `/api/mgmt/overview` นับ total · statusCounts · urgent
   /mgmt/tasks — API กรอง `?status=` แบบ `.eq` แล้วหน้ากรองธงจากลิงก์ด้วย `mgmtTaskLinkRows` (ลงจากลิงก์ = ไม่มีคำค้น) */
const YEAR_TASKS = [];
for (const status of TASK_STATUSES) {
  for (const priority of ['urgent', 'normal']) {
    for (let i = 0; i < (status === 'todo' ? 3 : 2); i += 1) {
      YEAR_TASKS.push({ id: `${status}-${priority}-${i}`, status, priority, _waitingOnMe: i === 0 });
    }
  }
}
const landedRows = (href) => {
  const link = readMgmtTasksLink(paramsOf(href), { defaultYear: 2026 });
  const fromApi = link.status ? YEAR_TASKS.filter((t) => t.status === link.status) : YEAR_TASKS;
  return { link, rows: mgmtTaskLinkRows(fromApi, link) };
};

test('⭐ L4: เลขบนการ์ด KPI ทั้งห้าใบ = แถวที่ลิงก์ของการ์ดเปิดเจอ (ปีเดียวกับที่เลือกบน /mgmt)', () => {
  const year = 2025;
  const counts = statusCounts(YEAR_TASKS);
  const urgent = YEAR_TASKS.filter(isUrgentOpenTask); // = route overview
  const cards = [
    { href: mgmtTasksHref({ year }), value: YEAR_TASKS.length },
    { href: mgmtTasksHref({ year, status: 'done' }), value: counts.done },
    { href: mgmtTasksHref({ year, status: 'in_progress' }), value: counts.in_progress },
    { href: mgmtTasksHref({ year, status: 'todo' }), value: counts.todo },
    { href: mgmtTasksHref({ year, urgentOpen: true }), value: urgent.length },
  ];
  for (const { href, value } of cards) {
    const { link, rows } = landedRows(href);
    assert.equal(rows.length, value, href);
    assert.equal(link.year, year, `${href}: ต้องเปิดที่ปีที่เลือก ไม่ใช่ปีปัจจุบัน`);
  }
  assert.ok(urgent.length > 0 && urgent.length < YEAR_TASKS.filter((t) => t.priority === 'urgent').length, 'ฟิกซ์เจอร์มีงานด่วนที่จบแล้วด้วย');
});

test('L4: ลิงก์ไปกลับได้ · ค่าแปลกถูกทิ้ง · ธงสองตัวตัดเพิ่ม', () => {
  for (const input of [
    { year: 2024, status: '', urgentOpen: false, waitingOnMe: false },
    { year: 2026, status: 'done', urgentOpen: false, waitingOnMe: true },
    { year: 2027, status: '', urgentOpen: true, waitingOnMe: true },
  ]) {
    assert.deepEqual(readMgmtTasksLink(paramsOf(mgmtTasksHref(input)), { defaultYear: 1999 }), input);
  }
  assert.deepEqual(
    readMgmtTasksLink(new URLSearchParams('year=abc&status=closed&view=x&count=tasks'), { defaultYear: 2026 }),
    { year: 2026, status: '', urgentOpen: false, waitingOnMe: false },
  );
  assert.equal(mgmtTasksHref({}), '/mgmt/tasks');
  // ป้ายเมนู (ม-116) ใช้คีย์เดียวกับตัวอ่าน
  assert.equal(readMgmtTasksLink(new URLSearchParams(`count=${MGMT_TASKS_COUNT_PARAM}`), { defaultYear: 2026 }).waitingOnMe, true);
  const both = mgmtTaskLinkRows(YEAR_TASKS, { urgentOpen: true, waitingOnMe: true });
  assert.ok(both.length > 0 && both.every((t) => t._waitingOnMe && isUrgentOpenTask(t)));
});

test('ยาม L4: route · หน้า /mgmt · หน้า /mgmt/tasks · เมนู ต่อสายตัวตัดสิน/ลิงก์ชุดเดียว', () => {
  const route = read('../../app/api/mgmt/overview/route.js');
  assert.match(route, /\.filter\(isUrgentOpenTask\)/);
  assert.doesNotMatch(route, /priority === 'urgent'/, 'ห้ามมีเงื่อนไขงานด่วนสำเนาที่สองที่ route');

  const overview = read('../../app/mgmt/page.js');
  assert.match(overview, /label="งานด่วนที่ยังไม่เสร็จ"[^\n]*onClick=\{\(\) => router\.push\(mgmtTasksHref\(\{ year, urgentOpen: true \}\)\)\}/);
  for (const status of ['done', 'in_progress', 'todo']) {
    assert.match(overview, new RegExp(`onClick=\\{\\(\\) => router\\.push\\(mgmtTasksHref\\(\\{ year, status: "${status}" \\}\\)\\)\\}`));
  }
  assert.match(overview, /label="ทั้งหมด"[^\n]*onClick=\{\(\) => router\.push\(mgmtTasksHref\(\{ year \}\)\)\}/);
  assert.match(overview, /<Link href=\{mgmtTasksHref\(\{ year, urgentOpen: true \}\)\} className="linklike">/);
  assert.doesNotMatch(overview, /href="\/mgmt\/tasks"/);

  const list = read('../../app/mgmt/tasks/page.js');
  assert.match(list, /const link = readMgmtTasksLink\(searchParams, \{ defaultYear: nowYear \}\);/);
  assert.match(list, /mgmtTaskLinkRows\(tasks, \{ urgentOpen: urgentOpenOnly, waitingOnMe: waitingOnMeOnly \}\)/);
  assert.doesNotMatch(list, /window\.location/, 'อ่าน URL ครั้งเดียวไม่ได้แล้ว (กติกาที่แทน ม-115)');
  assert.doesNotMatch(list, /useState\(nowYear\)/, 'ปีต้องมาจาก URL');
  // "ล้าง" ล้างชิปจากลิงก์ด้วย (เดิมชิป "รอฉันลงมือ" ค้าง)
  assert.match(list, /setFilters\(EMPTY_FILTERS\); setWaitingOnMeOnly\(false\); router\.replace\(mgmtTasksHref\(\{ year \}\), \{ scroll: false \}\);/);
  assert.match(list, /onClick=\{\(\) => setWaitingOnMeOnly\(false\)\}/);
  assert.match(list, /onClick=\{\(\) => writeLink\(\{ urgentOpen: false \}\)\}/);
  // writeLink ไม่เขียน `count` กลับ (ธงป้ายเป็น state) — ส่งสามช่องของ URL ระบุชื่อ ไม่ใช่ `...link`
  assert.match(list, /mgmtTasksHref\(\{ year: link\.year, status: link\.status, urgentOpen: link\.urgentOpen, \.\.\.patch \}\)/);
  assert.doesNotMatch(list, /mgmtTasksHref\(\{ \.\.\.link/, 'ห้ามกระจาย link ทั้งก้อน — พา `count` กลับเข้า URL');

  const menu = read('../../config/menuRegistry.js');
  assert.match(menu, new RegExp(`countHref: '/mgmt/tasks\\?count=${MGMT_TASKS_COUNT_PARAM}'`));
});

/* รีวิว L4 (26/10): กดป้ายเมนูซ้ำขณะอยู่บน /mgmt/tasks ต้องลงใหม่ทุกครั้ง (แพตเทิร์น M9 ของ /sa/tasks)
   🐞 รุ่นแรกเก็บ `?count=` ไว้ใน URL และล้างตัวกรองเฉพาะตอนธง "เพิ่งติด" ⇒ อยู่ที่ `?count=mgmtTasks` แล้วพิมพ์คำค้น →
      กดป้ายซ้ำ = URL เดิม (Next ไม่เปลี่ยน searchParams) ⇒ คำค้นค้าง ตารางน้อยกว่าเลขบนป้าย */
test('⭐ รีวิว L4: ลงจากป้ายแล้ว URL ไม่มี `count` เหลือ ⇒ กดป้ายซ้ำ = URL ใหม่จริงทุกครั้ง · แถว = ป้าย', () => {
  const badgeHref = `/mgmt/tasks?count=${MGMT_TASKS_COUNT_PARAM}`;
  const nowYear = 2026;
  // แถวที่ป้ายนับ = งานของปีวันไทยที่ `_waitingOnMe` (server ตั้งธงด้วย helper ตัวเดียวกับป้าย)
  const badge = YEAR_TASKS.filter((t) => t._waitingOnMe).length;
  const link = readMgmtTasksLink(paramsOf(badgeHref), { defaultYear: nowYear });
  assert.deepEqual(link, { year: nowYear, status: '', urgentOpen: false, waitingOnMe: true }, 'ลิงก์ป้ายล้างปี/สถานะ/มุมมองกลับค่าตั้งต้น');
  // หน้าทำ: ติดธง (state) + ล้างตัวกรองในหน้า แล้ว replace ด้วยสามช่องของ URL (ไม่มี count)
  const landedHref = mgmtTasksHref({ year: link.year, status: link.status, urgentOpen: link.urgentOpen });
  assert.equal(paramsOf(landedHref).has('count'), false);
  assert.notEqual(landedHref, badgeHref, 'URL หลังลงจอดต้องต่างจากลิงก์ป้าย ไม่งั้นกดซ้ำแล้ว effect ไม่วิ่ง');
  const rows = mgmtTaskLinkRows(YEAR_TASKS, { urgentOpen: link.urgentOpen, waitingOnMe: true });
  assert.equal(rows.length, badge);
  // เปลี่ยนปีต่อจากนั้น (writeLink) ก็ไม่พา `count` กลับมา
  assert.equal(paramsOf(mgmtTasksHref({ year: 2025, status: link.status, urgentOpen: link.urgentOpen })).has('count'), false);

  const list = read('../../app/mgmt/tasks/page.js');
  const effect = list.match(/useEffect\(\(\) => \{\n\s*if \(!badgeParam\) return;[\s\S]*?\}, \[badgeParam\]\);/);
  assert.ok(effect, 'ต้องมี effect ที่เฝ้า `?count=` ของป้าย');
  assert.match(effect[0], /setWaitingOnMeOnly\(true\);/);
  assert.match(effect[0], /setFilters\(EMPTY_FILTERS\);/);
  assert.match(effect[0], /router\.replace\(mgmtTasksHref\(\{ year: link\.year, status: link\.status, urgentOpen: link\.urgentOpen \}\), \{ scroll: false \}\);/);
  assert.doesNotMatch(list, /prevFlagKey|useRef/, 'ล้างแบบ "ธงเพิ่งติด" ตกไปแล้ว — กดป้ายซ้ำไม่ทำงาน');
});
