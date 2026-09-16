import test from 'node:test';
import assert from 'node:assert/strict';
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
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'components', 'AppLayout.js'),
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
  const layout = readFileSync(join(SRC, 'components', 'AppLayout.js'), 'utf8');

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
