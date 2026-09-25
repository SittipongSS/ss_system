import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deptRequestsTodoCount, myTasksTodoCount, pruneZeroCounts, requestsTodoCount,
} from './navCounts.js';

const req = (over = {}) => ({
  id: 'r1', status: 'pending', dept: 'PC', kind: 'inquiry', _mine: false, ...over,
});

test('เลขบนเมนูคำร้อง = ใบที่รอฝ่ายฉันตอบ ไม่ใช่ทุกใบที่มองเห็น', () => {
  const rows = [
    req({ id: 'a', dept: 'PC' }),                       // รอฝ่ายฉัน
    req({ id: 'b', dept: 'RD' }),                       // ฝ่ายอื่น
    req({ id: 'c', dept: 'PC', status: 'draft', _mine: true }), // ร่างของฉัน ยังไม่ส่ง
  ];
  assert.equal(requestsTodoCount(rows, ['PC']), 1);
});

test('ร่างของตัวเองไม่นับ — ไม่งั้นเลขบนเมนูบวกซ้ำกับแท็บ "ที่ฉันเปิด"', () => {
  const rows = [req({ status: 'draft', _mine: true, dept: 'PC' })];
  assert.equal(requestsTodoCount(rows, ['PC']), 0);
});

// 🐞 ผู้ใช้ถามเอง 2026-08-12 — เมนูคำร้องไม่ขึ้นป้ายเลย ทั้งที่กดเข้าไปแล้วการ์ด
// "เริ่มที่นี่" ชี้ใบตีกลับให้แก้อยู่ตรงหน้า · ใบตีกลับเป็น `draft` ⇒ ตกด่านบรรทัดบน
test('⭐ ใบของฉันที่ถูกตีกลับต้องนับ — มันรอเราแก้อยู่ ไม่ใช่ร่างที่ยังไม่ได้ส่ง', () => {
  const bounced = req({ status: 'draft', _mine: true, dept: 'PC', bouncedAt: '2026-08-08T03:00:00Z' });
  assert.equal(requestsTodoCount([bounced], ['PC']), 1);
  // ไม่มีฝ่ายที่ตอบได้ก็ยังนับ — ใบนี้รอ **ผู้ขอ** ไม่ได้รอฝ่าย
  assert.equal(requestsTodoCount([bounced], []), 1);
  // ของเพื่อนร่วมทีมไม่ใช่ของค้างของเรา
  assert.equal(requestsTodoCount([{ ...bounced, _mine: false }], ['PC']), 0);
  // ส่งใหม่แล้วไม่ใช่ใบตีกลับอีก — นับเป็นใบที่รอฝ่ายตามปกติ ไม่ใช่นับสองรอบ
  assert.equal(requestsTodoCount([{ ...bounced, status: 'pending' }], ['PC']), 1);
});

// ── ยอดรวมรายระบบ (การ์ดหน้าแรก + เมนูสลับระบบ) ───────────────────────────
test('⭐ ทุกเมนูที่มีป้าย ต้องอยู่ในระบบใดระบบหนึ่งเสมอ', async () => {
  const { NAV_COUNT_KEYS, SYSTEM_COUNT_HREFS } = await import('./useNavCounts.js');
  // เมนูที่ตกสำรวจ = ป้ายขึ้นบนเมนู แต่การ์ดหน้าแรกยังโล่ง ⇒ คนสรุปว่าระบบนั้นว่าง
  const claimed = Object.values(SYSTEM_COUNT_HREFS).flat();
  assert.deepEqual(
    Object.keys(NAV_COUNT_KEYS).filter((href) => !claimed.includes(href)),
    [],
    'มี href ใน NAV_COUNT_KEYS ที่ไม่มีระบบไหนนับ',
  );
  // และห้ามนับซ้ำสองระบบ — ยอดรวมจะเกินจริง
  assert.equal(new Set(claimed).size, claimed.length);
});

test('ยอดรวมของระบบ = ผลบวกของเมนูในระบบนั้น · ศูนย์/ไม่มีสิทธิ์ = ไม่มีป้าย', async () => {
  const { navCountForSystem } = await import('./useNavCounts.js');
  // คีย์ที่ผู้ใช้ไม่มีสิทธิ์เห็นไม่ถูกส่งมาเลย (ดู api/nav/counts) — ตัวที่ขาดต้องนับเป็น 0
  assert.equal(navCountForSystem({ leads: 21, requests: 2 }, 'salesplan'), 23);
  assert.equal(navCountForSystem({ rdRequests: 16 }, 'rd'), 16);
  assert.equal(navCountForSystem({ rdRequests: 16 }, 'salesplan'), null);
  assert.equal(navCountForSystem({}, 'salesplan'), null);
  // ระบบที่ยังไม่มีเมนูมีป้ายสักตัว — ต้องเงียบ ไม่ใช่ 0
  assert.equal(navCountForSystem({ leads: 21 }, 'tax'), null);
});

test('ไม่มีฝ่ายที่ตอบได้ = ไม่มีอะไรรอเรา', () => {
  assert.equal(requestsTodoCount([req({ dept: 'PC' })], []), 0);
});

test('คิวของฝ่าย (RD) นับเฉพาะใบที่ยังรอฝ่ายนั้นตอบ', () => {
  const rows = [
    req({ id: 'a', dept: 'RD' }),
    req({ id: 'b', dept: 'PC' }),
  ];
  assert.equal(deptRequestsTodoCount(rows, 'RD'), 1);
  assert.equal(deptRequestsTodoCount(rows, null), 0);
});

test('งานของฉัน = ยังไม่เสร็จ + ฉันเป็นผู้รับผิดชอบ (งานที่ฉันมอบให้คนอื่นไม่นับ)', () => {
  const me = 'u1';
  const tasks = [
    { id: '1', status: 'Pending', assigneeId: me },              // ต้องทำ
    { id: '2', status: 'Completed', assigneeId: me },            // เสร็จแล้ว
    { id: '3', status: 'Pending', ownerId: me, assigneeId: 'u2' }, // ฉันมอบให้คนอื่น
    { id: '4', status: 'InProgress', proxyBy: me, assigneeId: 'u2' }, // ฉันดึงมาทำแทน
  ];
  assert.equal(myTasksTodoCount(tasks, me), 2);
});

test('ค่าศูนย์ถูกตัดทิ้ง — เมนูที่ไม่มีอะไรค้างต้องไม่มีป้าย', () => {
  assert.deepEqual(pruneZeroCounts({ requests: 3, tasks: 0, leads: 0 }), { requests: 3 });
});

/* ── ด่านที่รอบตรวจ 2026-09-02 เปิดโปง: เมนูมีอยู่ แต่ตัวเลขไม่มี ─────────────
   สามช่องที่ทำให้ป้าย "หายเงียบ" ซึ่งไม่มีเทสต์ไหนจับมาก่อน — ทั้งสามเคยเกิดจริง */

test('⭐ ฝ่ายที่มีคิวของตัวเอง ต้องมีคีย์ตัวเลขครบทุกฝ่าย (สามแผนที่ต้องตรงกัน)', async () => {
  const { DEPT_MODULE_QUEUE } = await import('../requests/modules.js');
  const { NAV_COUNT_KEYS } = await import('./useNavCounts.js');
  const { DEPT_QUEUE_COUNT_KEYS } = await import('./navCounts.js');

  assert.deepEqual(
    Object.keys(DEPT_MODULE_QUEUE).sort(), Object.keys(DEPT_QUEUE_COUNT_KEYS).sort(),
    'ฝ่ายที่ได้บ้านของตัวเองแล้วต้องมีคีย์ตัวเลขด้วย — ไม่งั้นเงียบสองชั้น '
    + '(หลุดจากป้ายคิวรวมเพราะ deptsInSharedQueue + ไม่มีป้ายของตัวเอง)',
  );
  for (const [dept, href] of Object.entries(DEPT_MODULE_QUEUE)) {
    assert.equal(
      DEPT_QUEUE_COUNT_KEYS[dept], NAV_COUNT_KEYS[href],
      `คีย์ของฝ่าย ${dept} ต้องเป็นตัวเดียวกับที่เมนู ${href} อ่าน`,
    );
  }
});

test('⭐ ทุก countHref บนเมนู ต้องเป็นของ href ที่มีคีย์จริง', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { NAV_COUNT_KEYS } = await import('./useNavCounts.js');

  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'menuRegistry.js'),
    'utf8',
  );
  /* `countHref` คือลิงก์ที่ใช้ **เฉพาะตอนมีป้าย** ⇒ รายการที่มีมันแต่ไม่มีคีย์
     = โค้ดที่ไม่มีวันทำงาน และคนอ่านจะเข้าใจผิดว่าเมนูนั้นมีป้ายแล้ว */
  const withCountHref = [...src.matchAll(/href: '([^']+)',[^\n]*countHref:/g)].map((m) => m[1]);
  assert.ok(withCountHref.length >= 8, 'อ่าน countHref จาก AppLayout ไม่เจอ — regex ล้าไปแล้ว');
  assert.deepEqual(
    withCountHref.filter((href) => !NAV_COUNT_KEYS[href]), [],
    'มีเมนูที่ผูก countHref ไว้แต่ไม่มีคีย์ใน NAV_COUNT_KEYS',
  );
});

test('🔴 ด่านของตัวนับต้องไม่แคบกว่าด่านของเมนู (งานวันนี้ = canDoFieldWork)', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const route = readFileSync(join(SRC, 'app', 'api', 'nav', 'counts', 'route.js'), 'utf8');
  const layout = readFileSync(join(SRC, 'config', 'menuRegistry.js'), 'utf8');

  /* 🐞 เมนู "งานวันนี้" กั้นด้วย `canDoFieldWork` แต่ตัวนับเคยกั้นด้วย `canEditService`
     ⇒ เจ้าหน้าที่หน้างานเห็นเมนูที่ไม่มีวันขึ้นป้าย ทั้งที่เลขนั้นคือนัดของตัวเขาเอง */
  assert.match(layout, /href: '\/service\/today'[^\n]*visible: canDoFieldWork/);
  assert.match(route, /if \(canDoFieldWork\(user\)\) \{\n\s*jobs\.push\(attempt\('visits'/);
});

/* ── สถานะรายคีย์ (ADR 0016 · PR0) ─────────────────────────────────────────
   🐞 ก่อนหน้านี้ปลายทางแยกไม่ออกว่า "นับไม่สำเร็จ" กับ "ศูนย์" กับ "ไม่มีสิทธิ์"
      ต่างกันอย่างไร — ทั้งสามอย่างมาถึงจอเป็น "ไม่มีคีย์นั้น" เหมือนกันหมด
      หน้าไหนจะกล้าพูดว่า "ไม่มีงานค้าง" ต้องแยกสามอย่างนี้ได้ก่อน */
test('withCountStatus: ตัดศูนย์เหมือนเดิม แต่บอกว่าคีย์ไหนถูกนับและคีย์ไหนพัง', async () => {
  const { withCountStatus } = await import('./navCounts.js');
  const payload = withCountStatus({ requests: 3, leads: 0 }, ['requests', 'leads', 'scents'], ['scents']);
  assert.equal(payload.requests, 3);
  assert.equal('leads' in payload, false, 'ศูนย์ยังต้องถูกตัดทิ้ง — ป้าย 0 ไม่มีใครอ่าน');
  assert.equal('scents' in payload, false, 'คีย์ที่พังต้องไม่มีตัวเลขติดมาด้วย');
  assert.deepEqual(payload._attempted, ['requests', 'leads', 'scents']);
  assert.deepEqual(payload._failed, ['scents']);
});

test('readCountStatus: คีย์ _* ต้องไม่ปนไปอยู่กับตัวเลข', async () => {
  const { readCountStatus, withCountStatus } = await import('./navCounts.js');
  const state = readCountStatus(withCountStatus({ requests: 3, leads: 0 }, ['requests', 'leads'], ['leads']));
  assert.deepEqual(state.counts, { requests: 3 });
  assert.deepEqual([...state.attempted], ['requests', 'leads']);
  assert.deepEqual([...state.failed], ['leads']);
});

test('payload รุ่นเก่า (ไม่มี _attempted) ⇒ attempted = null = "ไม่รู้ว่าคีย์ไหนถูกนับ"', async () => {
  const { readCountStatus } = await import('./navCounts.js');
  // ⚠️ ต่างจากชุดว่าง ซึ่งแปลว่า "นับแล้ว ไม่มีคีย์ไหนเข้าเงื่อนไขของคนนี้เลย"
  const old = readCountStatus({ requests: 3 });
  assert.equal(old.attempted, null);
  assert.deepEqual(old.counts, { requests: 3 });
  assert.equal(old.failed.size, 0);
  assert.equal(readCountStatus(null).attempted, null);
  assert.deepEqual(readCountStatus(undefined).counts, {});
});

test('⭐ แท็บที่เปิดค้างก่อน deploy ต้องอ่าน payload ใหม่ได้เท่าเดิม', async () => {
  const { withCountStatus } = await import('./navCounts.js');
  const { navCountFor, navCountForSystem } = await import('./useNavCounts.js');
  const before = { leads: 21, requests: 2 };
  const after = withCountStatus(before, ['leads', 'requests'], []);
  // โค้ดรุ่นเก่าหยิบตามชื่อคีย์ / บวกตาม href ⇒ ทั้งคู่ต้องมองไม่เห็นคีย์ `_*`
  assert.equal(navCountFor(after, '/sa/leads'), navCountFor(before, '/sa/leads'));
  assert.equal(navCountForSystem(after, 'salesplan'), navCountForSystem(before, 'salesplan'));
});

/* ── hook ฝั่งจอ (ด่านซอร์ส) ────────────────────────────────────────────────
   ทดสอบ hook จริงต้องมี React harness ซึ่งโปรเจกต์นี้ไม่มี — ล็อกสัญญาที่ซอร์สแทน
   เพราะสามข้อนี้คือสิ่งที่หน้าแรก (ADR 0016) พึ่งพาโดยตรง */
test('useNavCounts คืนสถานะ ไม่ใช่ตัวเลขเปล่า ๆ · พังแล้วคงเลขเดิม', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./useNavCounts.js', import.meta.url), 'utf8');
  assert.match(src, /status: "ready"/, 'ต้องบอกได้ว่าคำตอบแรกมาถึงแล้ว');
  assert.match(src, /\.\.\.EMPTY_STATE, status: "error"/, 'ยังไม่เคยสำเร็จแล้วพัง = error ไม่ใช่ศูนย์');
  assert.match(src, /\{ \.\.\.prev, stale: true \}/, 'เคยสำเร็จแล้วพัง = คงเลขเดิม + ธง stale');
  assert.match(src, /readCountStatus\(data\)/, 'ต้องแยกคีย์ _* ออกจากตัวเลขด้วยตัวอ่านกลาง');
  // เปลือกดึงชุดเดียวแล้วแจกต่อ — หน้าแรกห้ามยิงรอบที่สองของตัวเอง (PR3 วาง Provider)
  assert.match(src, /export const NavCountsContext/);
  assert.match(src, /export function useNavCountsState/);
});

// ── ตัวนับต้องไม่อ่านแบบมีเพดานที่โกหก (PR5 · 2026-09-17) ──────────────────
//
// 🐞 `.limit(5000)` อ่านเหมือน "เผื่อไว้เยอะแล้ว" แต่โปรเจกต์นี้ตั้ง Supabase Max rows = 1000
//   ⇒ PostgREST ตัดที่ 1,000 เสมอ **ไม่มี error** · ตัวเลข 5000 จึงไม่เคยมีผล และวันที่
//   กองงานโตเกิน 1,000 ป้ายจะนับขาดเงียบ ๆ โดยไม่มีอะไรให้จับเลย
//   (ตอนตรวจ 17/09 ทุกก้อน < 500 แถว ⇒ แก้ตอนยังไม่เจ็บ ไม่ใช่รอให้เจ็บ)
// 🔑 ทางที่ถูกคือไล่ทีละหน้าด้วย `fetchAllResult` ซึ่งบังคับ `.order()` ที่นิ่งไปในตัว
test('เส้น /api/nav/counts ไม่มี .limit(5000) เหลืออยู่ — ต้องไล่ทีละหน้าแทน', () => {
  const route = readFileSync(new URL('../../app/api/nav/counts/route.js', import.meta.url), 'utf8');
  const code = route
    .replace(/\/\*[\s\S]*?\*\//g, '')   // คอมเมนต์บล็อก (ตัวที่อธิบายกับดักนี้อยู่ในนั้น)
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // คอมเมนต์บรรทัดเดียว
  assert.doesNotMatch(code, /\.limit\(\s*5000\s*\)/, 'ยังมี .limit(5000) ในโค้ดจริง');
  /* กันท่าเลี่ยง: ตัวเลขเกินเพดานจริงของ PostgREST ในเส้นนี้แปลว่าเข้าใจผิดเรื่องเดิม */
  const overCap = [...code.matchAll(/\.limit\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1])).filter((n) => n > 1000);
  assert.deepEqual(overCap, [], `.limit() ที่เกินเพดาน 1,000 แถว: ${overCap.join(', ')}`);
});

// ── ป้ายใบสั่งขาย: เลนผู้รีวิวตัดใบตัวเอง · เลนร่างของใบย้อนหลัง (มติ 22/09 · mig 0374) ──────────
/* 🐞 ป้ายเคยนับใบที่ AE Sup สร้าง/ยื่นเองทั้งที่อนุมัติเองไม่ได้ ⇒ ป้ายเกินคิว "รออนุมัติจากคุณ" เสมอ
   ⭐ ร่างของใบย้อนหลัง = บันทึกค้างครึ่งทาง ต้องขึ้นป้ายให้ผู้คีย์ — ไม่งั้นใบค้างเงียบ
   ⚠️ helper ตัดสินจากแถว ⇒ select ต้องพกคอลัมน์ที่ helper อ่าน (ขาด = ตัดสินผิดเงียบ ไม่ error) */
test('ป้ายใบสั่งขาย: เลนอนุมัติพก submittedBy/origin · ส่ง role · เลนร่างใบย้อนหลังผ่าน historicalRowsOnly', () => {
  const route = readFileSync(new URL('../../app/api/nav/counts/route.js', import.meta.url), 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const job = code.slice(code.indexOf("attempt('salesOrders'"), code.indexOf("attempt('projectCloses'"));
  assert.ok(job.length > 100, 'หาก้อนตัวนับใบสั่งขายไม่เจอ');
  assert.match(job, /\.select\('id, status, createdBy, submittedBy, origin'\)\s*\.in\('status', \['pending_approval', 'rejected'\]\)/);
  assert.match(job, /fetchAllResult\(\(\) => historicalRowsOnly\(supabase\.from\('sales_orders'\)\.select\('id, status, createdBy, origin'\)\)\s*\.eq\('status', 'draft'\)\.eq\('createdBy', user\.id\)\.order\('id', \{ ascending: true \}\)\)/);
  assert.match(job, /isSalesOrderWaitingOnMe\(row, \{ userId: user\.id, reviewer, role: user\.role \}\)/);
  // error ของเลนร่างต้องโยน ไม่ใช่กลืนเป็น [] (ป้ายนับขาดเงียบ)
  assert.match(job, /if \(approvalError \|\| draftError \|\| revokedError \|\| financeError\) throw/);
  // literal ของ origin มีบ้านเดียว — ห้ามกรองเองในไฟล์นี้
  assert.doesNotMatch(code, /\.eq\(\s*['"]origin['"]/);
});

test('ตัวตัดสินของป้าย: ผู้ตรวจไม่ถูกนับใบตัวเอง (ยกเว้น admin) · ร่างใบย้อนหลังของฉันนับ', async () => {
  const { isSalesOrderWaitingOnMe } = await import('../sales/salesOrderWorkflow.js');
  const mine = { status: 'pending_approval', origin: 'pipeline', createdBy: 'U-SUP', submittedBy: 'U-SUP' };
  assert.equal(isSalesOrderWaitingOnMe(mine, { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor' }), false);
  assert.equal(isSalesOrderWaitingOnMe(mine, { userId: 'U-SUP', reviewer: true, role: 'admin' }), true);
  assert.equal(isSalesOrderWaitingOnMe({ status: 'draft', origin: 'historical', createdBy: 'U-AE' },
    { userId: 'U-AE', reviewer: false, role: 'ae' }), true);
});

// ── ป้ายใบสั่งขาย: ใบที่ถูกย้อนการอนุมัติ รอ AE เจ้าของดีลออก Rev. (มติ 24/09 · #1808) ──────────
/* 🐞 prod 24–25/09: SO-26080138-0 ถูกย้อนอนุมัติแล้วค้างเงียบข้ามวัน — ไม่มีป้าย ไม่มีคิว ไม่มีอะไรบอก AE ว่าต้องกด
   "ออก Rev." (หลัง #1808 เจ้าของดีลกดเองได้ และควรเป็นคนกด ไม่งั้นผู้จัดการที่กดจะอนุมัติใบ Rev. เองไม่ได้)
   ⭐ นับให้ **เจ้าของดีลปัจจุบัน** คนเดียว (deal.ownerId) — ไม่ใช่ผู้สร้างใบ (AC สร้างแทนได้) และไม่ใช่ผู้จัดการ
   ⚠️ helper ตัดสินจาก deal ที่ฝังมากับแถว ⇒ select ต้องพก deal:sales_deals(ownerId) ไม่งั้นนับ 0 เงียบ */
test('ป้ายใบสั่งขาย: เลนย้อนการอนุมัติพก deal.ownerId และโยน error ของเลน', () => {
  const route = readFileSync(new URL('../../app/api/nav/counts/route.js', import.meta.url), 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const job = code.slice(code.indexOf("attempt('salesOrders'"), code.indexOf("attempt('projectCloses'"));
  // ⭐ ใบย้อนหลังย้อนอนุมัติไม่ได้ (CHECK 0374) — กรอง pipeline ผ่านตัวกลางตัวเดียว (literal ของ origin มีบ้านเดียว)
  assert.match(job, /pipelineRowsOnly\(supabase\.from\('sales_orders'\)\.select\('id, status, createdBy, origin, deal:sales_deals\(ownerId\)'\)\)\s*\.eq\('status', 'approval_revoked'\)/);
  assert.match(job, /if \(approvalError \|\| draftError \|\| revokedError \|\| financeError\) throw/);
  assert.match(job, /\.\.\.\(revokedRows \|\| \[\]\)/);
});

test('ตัวตัดสินของป้าย: ใบที่ถูกย้อนอนุมัติ = งานของเจ้าของดีลปัจจุบันเท่านั้น', async () => {
  const { isSalesOrderWaitingOnMe } = await import('../sales/salesOrderWorkflow.js');
  const revoked = { status: 'approval_revoked', origin: 'pipeline', createdBy: 'U-AC', deal: { ownerId: 'U-AE' } };
  assert.equal(isSalesOrderWaitingOnMe(revoked, { userId: 'U-AE', reviewer: false, role: 'ae' }), true);
  // ผู้สร้างใบ (AC) ไม่ใช่คนกด · ผู้จัดการไม่นับ (กดเองแล้วอนุมัติใบ Rev. เองไม่ได้)
  assert.equal(isSalesOrderWaitingOnMe(revoked, { userId: 'U-AC', reviewer: false, role: 'ac' }), false);
  assert.equal(isSalesOrderWaitingOnMe(revoked, { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor' }), false);
  // ไม่มีดีลแนบมา / ไม่มีผู้ใช้ = ไม่นับ (ไม่เดา)
  assert.equal(isSalesOrderWaitingOnMe({ ...revoked, deal: null }, { userId: 'U-AE' }), false);
  assert.equal(isSalesOrderWaitingOnMe({ ...revoked, deal: { ownerId: '' } }, { userId: '' }), false);
  // ใบที่ออก Rev. ไปแล้ว (revised) ไม่ค้างอีก
  assert.equal(isSalesOrderWaitingOnMe({ ...revoked, status: 'revised' }, { userId: 'U-AE' }), false);
});

// ── ป้ายสัญญา: เอกสารแทนสัญญาของใบสั่งขายย้อนหลังไม่นับซ้ำกับป้ายใบสั่งขาย (0374) ──────────────
/* `isContractWaitingOnMe` ตัดร่างที่ชี้กลับใบสั่งขายย้อนหลังจาก `metadata.historicalSalesOrderId`
   ⚠️ helper ตัดสินจากแถว ⇒ select ต้องพก `metadata` (ขาด = ร่างที่แนบไฟล์แล้วนับในป้ายสัญญาของ AE Sup เงียบ ๆ)
   ⚠️ select ต้องอยู่ในระยะที่ check:columns มองเห็น (200 ตัวอักษรหลัง `.from()`) — คอมเมนต์อยู่เหนือ `.from()` */
test('ป้ายสัญญา: select พก metadata ให้ตัวตัดสินตัดเอกสารแทนสัญญาได้ · check:columns มองเห็น', () => {
  const route = readFileSync(new URL('../../app/api/nav/counts/route.js', import.meta.url), 'utf8');
  const job = route.slice(route.indexOf("attempt('contracts'"), route.indexOf('externalDocReadyIds(supabase, latest'));
  assert.ok(job.length > 100, 'หาก้อนตัวนับสัญญาไม่เจอ');
  assert.match(job, /\.from\('sales_contracts'\)\s*\.select\('id, status, source, metadata, /);
});

// ── ป้ายงานเข้าใหม่ของ TS: ถังผูกโซน + ถังตั้งรอบ (มติ 22/09 · mig 0374) ────────────────────
/* 🐞 ใบสั่งขายย้อนหลังเลือกโซนจากทะเบียนตอนคีย์ และรอบขายเกิดตอน AE Sup อนุมัติ ⇒ ไม่เคยผ่านถังผูกโซน
   ป้ายที่นับถังเดียว = ใบย้อนหลังมาถึง TS โดยไม่มีสัญญาณอะไรเลย (ถังตั้งรอบไม่มีป้าย)
   ⚠️ โซน/รอบต้องไล่หน้า (เพดาน 1,000 แถว) · error ต้องโยนผ่าน mustData ไม่ใช่กลืนเป็นชุดว่าง */
test('ป้ายงานเข้าใหม่: นับ bind + plan · อ่านโซน/รอบแบบไล่หน้าและไม่กลืน error', () => {
  const route = readFileSync(new URL('../../app/api/nav/counts/route.js', import.meta.url), 'utf8');
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const job = code.slice(code.indexOf("attempt('serviceIntake'"), code.indexOf("attempt('payments'"));
  assert.ok(job.length > 100, 'หาก้อนตัวนับงานเข้าใหม่ไม่เจอ');
  assert.match(code, /import \{ bindQueue, planQueue \} from '@\/lib\/service\/intake';/);
  assert.match(job, /fetchAllResult\(\(\) => supabase\.from\('service_zones'\)\.select\('id, "siteId", "isActive"'\)\s*\.order\('id', \{ ascending: true \}\)\)\.then\(mustData\)/);
  assert.match(job, /fetchAllResult\(\(\) => supabase\.from\('service_plans'\)\.select\('id, "siteId", "salesOrderId", "isActive"'\)\s*\.order\('id', \{ ascending: true \}\)\)\.then\(mustData\)/);
  // โซนต้องเป็นทุกโซน (หน้าคิวใช้ loadAllZones) — กรองที่ query แล้วป้ายนับไม่ตรงแท็บ
  assert.doesNotMatch(job, /from\('service_zones'\)[^;]*\.eq\(/);
  assert.match(job, /const plan = planQueue\(\{\s*zones, terms, plans,/);
  assert.match(job, /return bind\.rows\.length \+ plan\.length;/);
});

test('ตัวตัดสินของป้ายงานเข้าใหม่: ใบย้อนหลังที่ผูกโซนตอนอนุมัติแล้วนับที่ถังตั้งรอบ · มีรอบแล้วไม่นับ', async () => {
  const { bindQueue, planQueue } = await import('../service/intake.js');
  // คอลัมน์ผอมชุดเดียวกับที่ตัวนับเลือก (ไม่มี origin · ไม่มียอด)
  const orders = [{ id: 'SOH', status: 'approved', supersededById: null, projectId: null, dealId: 'DL-S', orderNumber: 'SO-26090051-0' }];
  const lines = [{ id: 'L1', salesOrderId: 'SOH', qty: 6 }];
  const terms = [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SOH', salesOrderLineId: 'L1', packageQty: 6 }];
  const zones = [{ id: 'Z1', siteId: 'S1', isActive: true }];
  const bind = bindQueue({ orders, lines, terms, dealsById: new Map([['DL-S', { id: 'DL-S', line: 'SERVICE' }]]) });
  assert.equal(bind.rows.length, 0, 'ผูกครบตอนอนุมัติ = ไม่อยู่ถังผูกโซน');
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  assert.equal(planQueue({ zones, terms, plans: [], ordersById, todayIso: '2026-09-23' }).length, 1);
  const plans = [{ id: 'PL1', siteId: 'S1', salesOrderId: 'SOH', isActive: true }];
  assert.equal(planQueue({ zones, terms, plans, ordersById, todayIso: '2026-09-23' }).length, 0, 'ตั้งรอบแล้วหลุดจากป้าย');
});
