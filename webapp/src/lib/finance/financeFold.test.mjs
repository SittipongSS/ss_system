// ── รวมหน้าภาพรวม /finance + คิวคำร้อง /finance/requests เข้าหน้างานบัญชี (รื้อ SO + บัญชี PR-4b · มติเจ้าของ 09/11 ข้อ 2 + 4) ──────
// ⭐ แทนยามเดิมของหน้าภาพรวม (financeOverviewCards.test — การ์ด "ใบรอปิด" พาไปแผงที่นับเป๊ะทุกคนดู · ตรวจตัวเลข L18d)
//   กติกาเดิมยังอยู่: เลขของ "รอปิดใบ" = แถวที่เห็นหลังกด ทุกคนดู (แอดมินด้วย) — ตอนนี้คือเลขบนแท็บ (`workTally.close` · ledgerWork.test)
//   คิดจากชุดใบเดียวกับตัวกรอง `close=1` ⇒ ไม่มีทางพาไปหน้าที่คิวเดินตามเปลือกคนดูอีก
// ⚠️ ยามอ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) — พิสูจน์ว่าสายยังต่ออยู่
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('/finance และ /finance/requests เด้งมาหน้างานบัญชี — ลิงก์เก่าไม่ตาย (query ของต้นทางตามไป)', () => {
  const config = readFileSync(join(SRC, '..', 'next.config.mjs'), 'utf8');
  assert.match(config, /\{ source: '\/finance', destination: '\/finance\/payments', permanent: false \},/);
  assert.match(config, /\{ source: '\/finance\/requests', destination: '\/finance\/payments\?view=requests', permanent: false \},/);
  // หน้าเดิมถูกลบ — redirects ของ next.config ทำงานก่อนระบบไฟล์ แต่ไฟล์ค้างคือของตายที่คนจะไปแก้ผิดที่
  assert.equal(existsSync(join(SRC, 'app/finance/page.js')), false);
  assert.equal(existsSync(join(SRC, 'app/finance/requests/page.js')), false);
  // ปลายทางของการ์ดระบบยังเป็นหน้างานบัญชี
  assert.match(code('config/systems.js'), /landing: \(\) => '\/finance\/payments',/);
});

test('แท็บคิวคำร้อง: ปลายทางเดียวกับทางเด้ง · เลขบนแท็บ = เลขบนเมนู (financeRequests) · ตัวคิวยกมาทั้งก้อน', () => {
  const page = code('app/finance/payments/page.js');
  assert.match(page, /const view = params\.get\("view"\) === "requests" \? "requests" : "ledger";/);
  assert.match(page, /\{view === "requests" \? <FinanceRequestsQueue \/> : \(/);
  assert.match(page, /Number\(navState\.counts\?\.financeRequests\) \|\| 0/);
  assert.match(page, /router\.replace\(`\$\{FINANCE_REQUESTS_HREF\}&tab=todo`, \{ scroll: false \}\);/);
  // ตัวกรอง/แท็บงานของทะเบียน = ออกจากคิวคำร้อง (การ์ดบนหัวกดได้จากแท็บคิวคำร้องด้วย)
  assert.match(page, /const REQUEST_VIEW_KEYS = \["view", "tab", "owner", "count"\];/);
  assert.match(page, /REQUEST_VIEW_KEYS\.forEach\(\(k\) => sp\.delete\(k\)\);/);
  const queue = code('components/finance/FinanceRequestsQueue.js');
  assert.match(queue, /apiFetch\(`\/api\/sa\/requests\?dept=\$\{DEPT\}`/);
  assert.match(queue, /const DEPT = "FN";/);
  // ปุ่มย้อนกลับบนใบคำร้อง + ป้ายของฝ่ายยังผูกกับ href เดิม (เด้งมาที่แท็บ)
  assert.match(code('lib/requests/modules.js'), /FN: '\/finance\/requests',/);
});

test('เมนูบัญชี: ไม่มี "ภาพรวม" แล้ว · หน้าหลักชื่อ "งานบัญชี" · ป้ายรอตรวจยังพาไป ?status=reported (= แท็บรอตรวจงวด)', () => {
  const menu = readFileSync(join(SRC, 'config/menuRegistry.js'), 'utf8');
  assert.doesNotMatch(menu, /href: '\/finance', name:/);
  assert.match(menu, /\{ href: '\/finance\/payments', name: 'งานบัญชี', countHref: '\/finance\/payments\?status=reported',/);
  assert.match(code('app/finance/payments/page.js'), /title="งานบัญชี"/);
});
