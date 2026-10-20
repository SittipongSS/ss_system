// ── H3 (ตรวจตัวเลข 2026-10-08): การ์ด "สินค้า/ลูกค้ารออนุมัติ n" บนภาพรวม /database เปิดทะเบียนทั้งกอง ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PENDING_APPROVAL_HREF } from './pendingApprovalLinks.js';
import { MENU_GROUPS } from '../../config/menuRegistry.js';

const menuCountHref = (href) => MENU_GROUPS.flatMap((g) => g.items || []).find((i) => i.href === href)?.countHref;
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('ลิงก์ "รออนุมัติ" ของการ์ด = ลิงก์ของป้ายตัวเลขบนเมนู (นับชุดเดียวกัน ต้องเปิดชุดเดียวกัน)', () => {
  assert.equal(PENDING_APPROVAL_HREF.products, menuCountHref('/database/products'));
  assert.equal(PENDING_APPROVAL_HREF.customers, menuCountHref('/database/customers'));
});

test('ทะเบียนปลายทางอ่าน `?count=` ค่าเดียวกับที่ลิงก์ส่ง แล้วตั้งตัวกรอง "รออนุมัติ"', () => {
  const read = (href) => new URL(href, 'http://x').searchParams.get('count');
  const products = src('../../app/database/products/page.js');
  assert.match(products, new RegExp(`useSearchParams\\(\\)\\.get\\("count"\\) === "${read(PENDING_APPROVAL_HREF.products)}"`));
  assert.match(products, /fromNavCount \? PENDING_ONLY : EMPTY/);
  const customers = src('../../app/database/customers/page.js');
  assert.match(customers, new RegExp(`useSearchParams\\(\\)\\.get\\("count"\\) === "${read(PENDING_APPROVAL_HREF.customers)}"`));
  assert.match(customers, /useState\(fromNavCount \? \["pending"\] : \[\]\)/);
});

test('การ์ดรออนุมัติบน /database ใช้ลิงก์ชุดนี้ — ไม่เปิดทะเบียนเปล่าอีก', () => {
  const page = src('../../app/database/page.js');
  assert.match(page, /label="สินค้ารออนุมัติ"[^\n]*onClick=\{\(\) => router\.push\(PENDING_APPROVAL_HREF\.products\)\}/);
  assert.match(page, /label="ลูกค้ารออนุมัติ"[^\n]*onClick=\{\(\) => router\.push\(PENDING_APPROVAL_HREF\.customers\)\}/);
});

// ── ใบเลิกใช้ที่ยังรออนุมัติ (มติเจ้าของ 19/10): การ์ด == ป้าย == แถวที่ `?count=` เปิด ─────────────
// วันนี้ไม่มีใบแบบนี้ในฐาน (0 ใบ) ⇒ พิสูจน์ด้วยชุดจำลองที่มีครบทุกมุม: เลิกใช้ × สถานะ × NULL ของแถวเก่า
import { isPendingApproval, pendingApprovalCount, passesApprovalFilters } from './pendingApprovalLinks.js';
import { filterProducts } from './productFilter.js';

const ROWS = [
  { id: 'A', isActive: true, approvalStatus: 'pending' },
  { id: 'B', isActive: false, approvalStatus: 'pending' },   // ← ใบที่เคยนับแต่เปิดไม่เจอ
  { id: 'C', isActive: true, approvalStatus: 'approved' },
  { id: 'D', isActive: false, approvalStatus: 'approved' },
  { id: 'E', isActive: true, approvalStatus: 'rejected' },
  { id: 'F', isActive: false, approvalStatus: 'rejected' },
  { id: 'G', isActive: true, approvalStatus: null },         // แถวก่อน mig 0027 = อนุมัติแล้ว
  { id: 'H', approvalStatus: 'pending' },                    // ไม่มีช่อง isActive = ยังใช้อยู่
];
const ids = (rows) => rows.map((r) => r.id);
/* สถานะตัวกรองที่ลิงก์ `?count=` ตั้งให้ทะเบียน: สถานะ "รออนุมัติ" · ไม่ติ๊ก "รวมที่เลิกใช้" (ยามซอร์สข้างล่างยึดไว้) */
const COUNT_STATE = Object.freeze({ statuses: ['pending'], showInactive: false });

test('นิยาม "รออนุมัติ" ไม่ดูการเลิกใช้ · NULL ของแถวเก่าไม่นับ', () => {
  assert.deepEqual(ids(ROWS.filter(isPendingApproval)), ['A', 'B', 'H']);
  assert.equal(pendingApprovalCount(ROWS), 3);
  assert.equal(pendingApprovalCount([]), 0);
  assert.equal(pendingApprovalCount(), 0);
  assert.equal(isPendingApproval(null), false);
});

test('ตาราง `?count=` เปิดเจอทุกใบที่นับ รวมใบเลิกใช้ — สินค้า (filterProducts) และลูกค้า (passesApprovalFilters)', () => {
  const counted = ids(ROWS.filter(isPendingApproval));
  // สินค้า: ตัวกรองของจอ + ไฟล์ส่งออก (filterProducts ตัวเดียว)
  const products = filterProducts(ROWS, COUNT_STATE);
  assert.equal(products.length, pendingApprovalCount(ROWS));
  assert.deepEqual(ids(products), counted);
  // ลูกค้า: หน้าเรียกตัวตัดสินตรง ๆ (ยามซอร์สข้างล่าง)
  const customers = ROWS.filter((r) => passesApprovalFilters(r, COUNT_STATE));
  assert.equal(customers.length, pendingApprovalCount(ROWS));
  assert.deepEqual(ids(customers), counted);
});

test('ทะเบียนเปล่า ๆ ไม่เปลี่ยน — ใบเลิกใช้ทุกสถานะยังซ่อน (รวมใบที่รออนุมัติ) จนกว่าจะติ๊กรวม', () => {
  assert.deepEqual(ids(ROWS.filter((r) => passesApprovalFilters(r))), ['A', 'C', 'E', 'G', 'H']);
  assert.deepEqual(ids(filterProducts(ROWS)), ['A', 'C', 'E', 'G', 'H']);
  assert.deepEqual(ids(filterProducts(ROWS, { showInactive: true })), ids(ROWS));
});

test('ข้อยกเว้นแคบที่สุด: เฉพาะใบรออนุมัติ ขณะกรองสถานะรออนุมัติ — สถานะอื่นยังซ่อนใบเลิกใช้', () => {
  const pass = (state) => ids(ROWS.filter((r) => passesApprovalFilters(r, state)));
  assert.deepEqual(pass({ statuses: ['approved'] }), ['C', 'G']);
  assert.deepEqual(pass({ statuses: ['rejected'] }), ['E']);
  assert.deepEqual(pass({ statuses: ['pending', 'approved'] }), ['A', 'B', 'C', 'G', 'H']); // D (เลิกใช้·อนุมัติแล้ว) ยังซ่อน
  assert.deepEqual(pass({ statuses: ['approved'], showInactive: true }), ['C', 'D', 'G']);
  // ติ๊ก "รวมที่เลิกใช้" คู่กับ "รออนุมัติ" = ชุดเดียวกัน (ไม่มีใบซ้ำ ไม่มีใบหาย)
  assert.deepEqual(pass({ statuses: ['pending'], showInactive: true }), pass(COUNT_STATE));
});

test('ป้ายเมนูนับนิยามเดียวกัน — `approvalStatus = pending` ไม่มีเงื่อนไข isActive', () => {
  const route = src('../../app/api/nav/counts/route.js');
  const block = route.slice(route.indexOf('const pendingApproval = (table)'), route.indexOf("jobs.push(attempt('products'"));
  assert.ok(block.length > 50, 'หาบล็อกนับรออนุมัติของ nav/counts ไม่เจอ');
  assert.match(block, /\.eq\('approvalStatus', 'pending'\)/);
  assert.doesNotMatch(block, /isActive/, 'ป้ายนับใบเลิกใช้ด้วย — ถ้าเพิ่มเงื่อนไขนี้ ต้องแก้ isPendingApproval ให้ตรงกัน');
});

test('การ์ดภาพรวม · แถบตัวเลขข้างทะเบียน · ตารางทั้งสองหน้า ใช้ตัวตัดสินชุดนี้ ไม่เขียนเงื่อนไขสด', () => {
  const overview = src('../../app/database/page.js');
  assert.match(overview, /products: pendingApprovalCount\(rawProducts \|\| \[\]\)/);
  assert.match(overview, /customers: pendingApprovalCount\(rawCustomers \|\| \[\]\)/);
  const products = src('../../app/database/products/page.js');
  assert.match(products, /pending: pendingApprovalCount\(products\)/);
  const customers = src('../../app/database/customers/page.js');
  assert.match(customers, /pending: pendingApprovalCount\(customers\)/);
  assert.match(customers, /if \(!passesApprovalFilters\(c, \{ statuses: statusFilter, showInactive \}\)\) return false;/);
  assert.doesNotMatch(customers, /!showInactive && c\.isActive === false/, 'ตัดใบเลิกใช้ก่อนดูสถานะ = ใบรออนุมัติที่เลิกใช้หายจากตาราง `?count=`');
  assert.match(src('./productFilter.js'), /passesApprovalFilters\(p, \{ statuses, showInactive \}\)/);
  // `?count=` ไม่ได้ติ๊ก "รวมที่เลิกใช้" ให้ — ใบเลิกใช้ที่ไม่ได้รออนุมัติต้องไม่ติดมาด้วย (COUNT_STATE ข้างบน)
  for (const page of [products, customers]) {
    assert.match(page, /const \[showInactive, setShowInactive\] = useState\(false\);/);
  }
});

test('แถวเลิกใช้ที่รออนุมัติยังมีป้าย "เลิกใช้" ข้างปุ่มอนุมัติในมุมมองตาราง', () => {
  for (const [file, v] of [['../../app/database/products/page.js', 'p'], ['../../app/database/customers/page.js', 'c']]) {
    const page = src(file);
    const at = page.indexOf(`<ApprovalActions onDecide={(status) => decide(${v}, status)} />`);
    assert.ok(at > 0, `${file}: หาปุ่มอนุมัติในตารางไม่เจอ`);
    // ป้ายอยู่หลังปิดทางแยก `)}` ของปุ่ม/ป้ายสถานะ = ขึ้นทั้งแถวที่มีปุ่มและแถวที่ไม่มี (ไม่ได้ซ่อนอยู่ในกิ่ง "ไม่มีปุ่ม")
    const after = page.slice(at, at + 400);
    assert.match(after, new RegExp(`<ApprovalBadge status=\\{approvalStatusOf\\(${v}\\)\\} />\\s*\\)\\}\\s*\\{${v}\\.isActive === false && <span className="status-pill"[^>]*>เลิกใช้</span>\\}`));
  }
});

// ── รอบตรวจซ้ำ (19/10): ทางอื่นบน /database ที่พาไปหาใบรออนุมัติ ต้องได้ชุดเดียวกัน ─────────────────────

test('การ์ดรออนุมัติบนภาพรวมนับจากทะเบียนเต็ม — ตัวกรองทีม/ช่วงเวลาของหน้าไม่เปลี่ยนเลข (ลิงก์ส่งตัวกรองพวกนั้นไปไม่ได้)', () => {
  const page = src('../../app/database/page.js');
  // เลขบนการ์ดมาจาก `pendingAll` (ทะเบียนดิบ) ไม่ใช่ชุด `products`/`customers` ที่ผ่านตัวกรองของหน้าแล้ว
  assert.match(page, /<KpiCard label="สินค้ารออนุมัติ" value=\{productsFailed \? NA : pendingAll\.products\}/);
  assert.match(page, /<KpiCard label="ลูกค้ารออนุมัติ" value=\{customersFailed \? NA : pendingAll\.customers\}/);
  assert.doesNotMatch(page, /pendingApprovalCount\((?:products|customers|list)\)/, 'นับจากชุดที่ผ่านตัวกรองของหน้า = การ์ดบอก 1 เปิดเจอ 3');
  // ตัวกรองติดอยู่ ⇒ บอกใต้เลขว่าการ์ดนี้ไม่ตามตัวกรอง (การ์ด "ทั้งหมด" ข้าง ๆ ตามตัวกรอง)
  assert.match(page, /const pageFiltered = timeframe\.length \+ teamFilter\.length > 0;/);
  assert.match(page, /const pendingHint = pageFiltered \? "[^"]+" : undefined;/);
  for (const flag of ['productsFailed', 'customersFailed']) {
    assert.match(page, new RegExp(`hint=\\{${flag} \\? "ดึงข้อมูลไม่ได้ — ดูข้อความด้านบน" : pendingHint\\}`));
  }
  // ชุดที่การ์ดนับ = ชุดที่ตาราง `?count=` เปิดเจอ ไม่ว่าตัวกรองของภาพรวมจะเป็นอะไร (ทะเบียนปลายทางไม่รู้จักตัวกรองนั้น)
  const raw = ROWS.map((r, i) => ({ ...r, team: i % 2 ? 'X' : 'Y', createdAt: i % 2 ? '2020-01-01' : '2026-10-01' }));
  const teamX = raw.filter((r) => r.team === 'X');
  assert.notEqual(pendingApprovalCount(teamX), pendingApprovalCount(raw), 'ชุดจำลองต้องให้ตัวกรองทีมเปลี่ยนเลขได้จริง');
  assert.equal(pendingApprovalCount(raw), filterProducts(raw, COUNT_STATE).length);
});

test('คิวรออนุมัติบนภาพรวม: ปุ่มพาไปหน้าของใบนั้น ไม่ใช่ทะเบียนเปล่าที่ซ่อนใบเลิกใช้', () => {
  const page = src('../../app/database/page.js');
  const queue = page.slice(page.indexOf('const queue = useMemo('), page.indexOf('return q;'));
  assert.ok(queue.length > 100, 'หาคิวรออนุมัติไม่เจอ');
  assert.match(queue, /products\.filter\(isPendingApproval\)/);
  assert.match(queue, /customers\.filter\(isPendingApproval\)/);
  assert.match(queue, /onClick: \(\) => router\.push\(`\/database\/products\/\$\{x\.id\}`\)/);
  assert.match(queue, /onClick: \(\) => router\.push\(`\/database\/customers\/\$\{x\.id\}`\)/);
  assert.doesNotMatch(queue, /router\.push\("\/database\/(?:products|customers)"\)/,
    'ทะเบียนเปล่าซ่อนใบเลิกใช้ — ใบเลิกใช้ที่ยังรออนุมัติจะหาไม่เจอจากคิวนี้');
  // หน้าของใบไม่กั้นการตัดสินด้วย isActive (ปุ่มอนุมัติของใบเลิกใช้ยังขึ้น)
  for (const detail of ['../../app/database/products/[id]/page.js', '../../app/database/customers/[id]/page.js']) {
    const canDecide = src(detail).match(/const canDecide = ([^;]+);/);
    assert.ok(canDecide, `${detail}: หา canDecide ไม่เจอ`);
    assert.doesNotMatch(canDecide[1], /isActive/, `${detail}: ใบเลิกใช้ที่รออนุมัติต้องตัดสินได้`);
  }
});

test('ไม่มีเงื่อนไข "รออนุมัติ" เขียนสดเหลือในสามหน้า — คิวข้างทะเบียน · ปุ่มบนการ์ด/ตาราง ถาม isPendingApproval', () => {
  for (const file of ['../../app/database/page.js', '../../app/database/products/page.js', '../../app/database/customers/page.js']) {
    assert.doesNotMatch(src(file), /approvalStatusOf\([^)]*\) === "pending"/, `${file}: ใช้ isPendingApproval แทน`);
  }
  for (const [file, list] of [['../../app/database/products/page.js', 'products'], ['../../app/database/customers/page.js', 'customers']]) {
    const page = src(file);
    assert.match(page, /const canDecideRow = \(rec\) => isPendingApproval\(rec\) && canApproveRow\(rec\);/);
    assert.match(page, new RegExp(`const approvalQueue = ${list}\\.filter\\(canDecideRow\\);`));
  }
});

test('ใบเลิกใช้ที่มีปุ่มอนุมัติไม่จาง — ปุ่มที่จางตามแถวอ่านเป็นกดไม่ได้ (ตาราง `?count=` เปิดใบพวกนี้เป็นค่าตั้งต้นแล้ว)', () => {
  const products = src('../../app/database/products/page.js');
  assert.match(products, /<DetailRow key=\{p\.id\}[^\n]*style=\{p\.isActive === false && !showActions \? \{ opacity: "var\(--op-muted\)" \} : undefined\}>/);
  assert.match(products, /const showActions = canDecideRow\(p\);\n\s*return \(/, 'แถวตารางต้องมี showActions ของตัวเอง');
  const customers = src('../../app/database/customers/page.js');
  assert.match(customers, /<DetailRow key=\{c\.id\}[^\n]*style=\{c\.isActive === false && !canDecideRow\(c\) \? \{ opacity: "var\(--op-muted\)" \} : undefined\}>/);
  for (const page of [products, customers]) {
    assert.match(page, /<ClickableCard [^\n]*style=\{inactive && !showActions \? \{ opacity: 0\.6 \} : undefined\}>/);
    assert.match(page, /const showActions = canDecideRow\([pc]\);/);
  }
});
