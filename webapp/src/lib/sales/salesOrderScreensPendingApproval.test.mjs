// ยอด SO "รออนุมัติ" บนจอใบสั่งขาย/ใบเสนอราคา (มติผู้ใช้ 2026-09-11 · mig 0353)
//
// ผู้ใช้แจ้ง: "SO ที่รออนุมัติ มันกลายเป็น 0 อยากให้โชว์ยอดด้วย แต่แยกให้รู้ว่า รออนุมัติ
// กับ Actual แล้ว ทั้งระบบ" — จอชุดนี้อ่านแถว sales_orders ตรง ๆ (ไม่ผ่าน cache บนดีล)
// จึงต้องใช้ตัวตัดสินรายแถวตัวกลาง (`salesOrderAmountKind` · `splitSalesOrderAmounts` ·
// `salesOrderActual`) ไม่คิดเงื่อนไขสถานะเอง
//
// เทสต์นี้ล็อกสองชั้น:
//   1. ตัวเลขที่จอเอาไปวาด (การ์ด KPI · ยอดหัวกลุ่ม · สามทางของเซลล์) คิดจากตัวกลางแล้วได้ค่าถูก
//   2. จอเรียกตัวกลางจริง และไม่มีใครถอยกลับไปเขียน `status !== 'approved'` หรือ `? … : 0`
//      ที่ทำให้ยอดรออนุมัติกลายเป็นศูนย์/ปนเข้า Actual อีก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PENDING_APPROVAL_LABEL,
  salesOrderActual,
  salesOrderAmountKind,
  splitSalesOrderAmounts,
} from './salesOrderWorkflow.js';
import { isLiveSalesOrder } from './handoffQueue.js';
import { bucketList } from '../listGrouping.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = (rel) => readFileSync(join(SRC, rel), 'utf8');
// ลอกคอมเมนต์ก่อนตรวจ — คอมเมนต์ที่ *เล่า* รูปผิด (เช่น "ห้ามใช้ status !== 'approved'")
// ไม่ใช่โค้ดผิด · ลอกเฉพาะบรรทัดที่ขึ้นต้นด้วย // ไม่แตะ URL ในสตริง
const code = (rel) => raw(rel)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

const SO_LIST = 'app/sales-planning/sales-orders/page.js';
const SO_DETAIL = 'app/sales-planning/sales-orders/[id]/page.js';
const QT_DETAIL = 'app/sales-planning/quotations/[id]/page.js';
const QT_LIST = 'app/sales-planning/quotations/page.js';
const QT_ROUTE = 'app/api/sales-planning/quotations/[id]/route.js';
const LINE_ITEMS = 'components/salesPlanning/QuotationLineItems.js';
const LINE_ITEMS_CSS = 'components/salesPlanning/QuotationLineItems.module.css';

// ทะเบียนใบสั่งขายหน้าตาแบบที่ API ส่งมา — ทุกสถานะมี actualAmount ตั้งแต่ร่าง
// (ตัวการของกับดัก `status !== 'approved'`) · totalAmount รวม VAT ห้ามถูกหยิบมาใช้
const ROWS = [
  { id: 'A', status: 'approved', actualAmount: 100000, totalAmount: 107000, customerName: 'ลูกค้า ก' },
  { id: 'B', status: 'pending_approval', actualAmount: 300000, totalAmount: 321000, customerName: 'ลูกค้า ก' },
  { id: 'C', status: 'pending_approval', actualAmount: 693000, totalAmount: 741510, customerName: 'ลูกค้า ข' },
  { id: 'D', status: 'draft', actualAmount: 50000, totalAmount: 53500, customerName: 'ลูกค้า ข' },
  { id: 'E', status: 'rejected', actualAmount: 40000, totalAmount: 42800, customerName: 'ลูกค้า ข' },
  { id: 'F', status: 'cancelled', actualAmount: 30000, totalAmount: 32100, customerName: 'ลูกค้า ค' },
  { id: 'G', status: 'revised', actualAmount: 20000, totalAmount: 21400, customerName: 'ลูกค้า ค' },
  { id: 'H', status: 'approval_revoked', actualAmount: 10000, totalAmount: 10700, customerName: 'ลูกค้า ค' },
];

/* ── 1. ตัวเลขที่จอวาด ─────────────────────────────────────────────────────── */

test('การ์ดบนทะเบียน SO: Actual คงเป็นใบอนุมัติล้วน · รออนุมัติเป็นยอดแยก (ก่อน VAT)', () => {
  const amounts = splitSalesOrderAmounts(ROWS);
  // ⭐ ของจริงบน prod วันที่แจ้ง: 8 ใบรออนุมัติ = 993,000 ก่อน VAT — ฟิกซ์เจอร์นี้จำลองยอดเดียวกัน
  assert.equal(amounts.pendingApproval, 993000);
  assert.equal(amounts.pendingApprovalCount, 2);
  // Actual ไม่ขยับเพราะมีใบรออนุมัติ — ยอดสองกองไม่ปนกัน
  assert.equal(amounts.actual, 100000);
  assert.equal(amounts.actualCount, 1);
  // ถ้าใครเผลอนับด้วย `status !== 'approved'` จะได้ 1,143,000 (ดึงร่าง/ตีกลับ/ยกเลิกมาปน)
  const wrong = ROWS.filter((r) => r.status !== 'approved').reduce((s, r) => s + r.actualAmount, 0);
  assert.notEqual(amounts.pendingApproval, wrong);
});

test('เซลล์ยอดบนแถว SO มีสามทางเท่านั้น — รออนุมัติ = pending_approval ตัวเดียว', () => {
  const kinds = Object.fromEntries(ROWS.map((row) => [row.status, salesOrderAmountKind(row)]));
  assert.deepEqual(kinds, {
    approved: 'actual',
    pending_approval: 'pending_approval',
    draft: 'excluded',
    rejected: 'excluded',
    cancelled: 'excluded',
    revised: 'excluded',
    approval_revoked: 'excluded',
  });
});

test('ยอดหัวกลุ่ม: weight = Actual ล้วน · รออนุมัติคิดจากแถวในถังชุดเดียวกัน', () => {
  // จัดตามสถานะ — ถัง "รออนุมัติ" เคยขึ้น ฿0.00 เฉย ๆ (ต้นเรื่องที่ผู้ใช้แจ้ง)
  const byStatus = bucketList(ROWS, (row) => ({ key: row.status, label: row.status, weight: salesOrderActual(row) }));
  const pendingBucket = byStatus.find((b) => b.key === 'pending_approval');
  assert.equal(pendingBucket.total, 0, 'weight ของถังต้องเป็น Actual ล้วน — ไม่งั้นหัวกลุ่มอ่านเป็น Actual');
  assert.deepEqual(
    splitSalesOrderAmounts(pendingBucket.items),
    { actual: 0, actualCount: 0, pendingApproval: 993000, pendingApprovalCount: 2 },
  );

  // จัดตามลูกค้า — ถังเดียวมีทั้งสองกองได้ (Actual ฿X · รออนุมัติ ฿Y)
  const byCustomer = bucketList(ROWS, (row) => ({ key: row.customerName, label: row.customerName, weight: salesOrderActual(row) }));
  const first = byCustomer.find((b) => b.key === 'ลูกค้า ก');
  assert.equal(first.total, 100000);
  assert.equal(splitSalesOrderAmounts(first.items).pendingApproval, 300000);
  // ถังที่มีแต่ใบนิ่ง (ยกเลิก/ออก Rev./ย้อนอนุมัติ) ไม่มีทั้งสองกอง = หน้าตาเดิม ฿0.00
  const idle = byCustomer.find((b) => b.key === 'ลูกค้า ค');
  assert.equal(idle.total, 0);
  assert.equal(splitSalesOrderAmounts(idle.items).pendingApprovalCount, 0);
});

test('การ์ดใบสั่งขายบนหน้าใบเสนอราคาเลือกใบที่ยังมีชีวิตก่อน (สาย Rev./ออกใหม่หลังยกเลิก)', () => {
  // ตัวเลือกเดียวกับใน route: rows.find(isLiveSalesOrder) || rows[0] || null (เรียงใหม่→เก่า)
  const pick = (rows) => rows.find(isLiveSalesOrder) || rows[0] || null;
  // Rev. chain: ฉบับเก่าถูกแทนที่ ฉบับใหม่รออนุมัติ ⇒ ต้องได้ฉบับใหม่ (ยอดรออนุมัติไม่หาย)
  assert.equal(pick([
    { id: 'SO-2', status: 'pending_approval', supersededById: null },
    { id: 'SO-1', status: 'revised', supersededById: 'SO-2' },
  ]).id, 'SO-2');
  // ยกเลิกแล้วออกใหม่ ⇒ ใบใหม่
  assert.equal(pick([
    { id: 'SO-9', status: 'draft', supersededById: null },
    { id: 'SO-8', status: 'cancelled', supersededById: null },
  ]).id, 'SO-9');
  // มีแต่ใบยกเลิก ⇒ ยังโชว์ใบนั้น (พฤติกรรมเดิมของ QT ที่มี SO ใบเดียว)
  assert.equal(pick([{ id: 'SO-7', status: 'cancelled', supersededById: null }]).id, 'SO-7');
  assert.equal(pick([]), null);
  // ⭐ ปุ่ม "สร้างใบสั่งขาย" เดินตามผลเลือกนี้ด้วย `isLiveSalesOrder` (ด่านเดียวกับ RPC 0169):
  //    ได้ใบที่ไม่มีชีวิต (ยกเลิกหมด · ปลายสาย Rev. ถูกยกเลิก) = ออกใบใหม่ได้ · ได้ใบมีชีวิต = ห้าม
  //    🐞 เดิมเช็ค `!quote.salesOrder` ⇒ QT ที่ยกเลิก SO ไปหลายใบเคยได้ปุ่มคืนเพราะ maybeSingle
  //    พังเงียบ พอ route เลือกใบถูกแล้วปุ่มจะหายถาวร ถ้าจอไม่เปลี่ยนมาถามว่า "มีชีวิตไหม"
  assert.equal(isLiveSalesOrder(pick([
    { id: 'SO-8', status: 'cancelled', supersededById: null },
    { id: 'SO-7', status: 'cancelled', supersededById: null },
  ])), false);
  assert.equal(isLiveSalesOrder(pick([
    { id: 'SO-2', status: 'cancelled', supersededById: null },
    { id: 'SO-1', status: 'revised', supersededById: 'SO-2' },
  ])), false);
  assert.equal(isLiveSalesOrder(pick([
    { id: 'SO-9', status: 'pending_approval', supersededById: null },
    { id: 'SO-8', status: 'cancelled', supersededById: null },
  ])), true);
});

test('หน้าใบเสนอราคา: การ์ด "สร้างใบสั่งขาย" ขึ้นเมื่อไม่มีใบที่ยังมีชีวิต — ใบยกเลิกไม่ปิดทาง (mig 0169)', () => {
  const page = code(QT_DETAIL);
  assert.match(page, /import \{ isLiveSalesOrder \} from "@\/lib\/sales\/handoffQueue";/);
  assert.match(page, /quote\.status === "accepted" && !isLiveSalesOrder\(quote\.salesOrder\) && canEditCap/);
  assert.doesNotMatch(page, /quote\.status === "accepted" && !quote\.salesOrder && canEditCap/,
    'ห้ามกลับไปถาม "มีแถวไหม" — route คืนใบยกเลิกมาด้วยเมื่อไม่มีใบที่มีชีวิต');
});

/* ── 2. จอเรียกตัวกลางจริง ─────────────────────────────────────────────────── */

test('ทะเบียน SO: การ์ด KPI คิดจาก rows ชุดเดียวผ่าน splitSalesOrderAmounts', () => {
  const page = code(SO_LIST);
  assert.match(page, /const amounts = splitSalesOrderAmounts\(rows\);/, 'ฐานเดียวกับการ์ดอื่นทั้งแถบ (rows ไม่ใช่ filtered)');
  assert.match(page, /pendingApproval: amounts\.pendingApproval,/);
  assert.match(page, /actual: amounts\.actual,/);
  // การ์ด Actual ไม่ถูกแตะ — อ่าน summary.actual ตัวเดิม
  assert.match(page, /label="Actual ก่อน VAT" value=\{fmtMoney\(summary\.actual\)\} note="รวมเฉพาะ SO ที่อนุมัติแล้ว"/);
  // ยอดรออนุมัติอยู่ใต้การ์ด "รอตรวจอนุมัติ" พร้อมบอกว่ายังไม่นับ
  assert.match(page, /label="รอตรวจอนุมัติ"/);
  assert.match(page, /`\$\{fmtMoney\(summary\.pendingApproval\)\} ก่อน VAT · ยังไม่นับ Actual`/);
  // 🛑 กับดักหลัก: status !== 'approved' ดึงร่าง/ตีกลับ/ยกเลิกมาปน
  assert.doesNotMatch(page, /status\s*!==?\s*["']approved["']/);
  assert.doesNotMatch(page, /status\s*===?\s*["']approved["']\s*\?\s*Number\(row\.actualAmount\)/,
    'ห้ามคิด Actual รายแถวเอง — ใช้ salesOrderActual ตัวกลาง');
});

test('ทะเบียน SO: หัวกลุ่มแยกสองกอง · เซลล์ยอดสามทาง · หัวคอลัมน์ไม่เรียกทุกแถวว่า Actual', () => {
  const page = code(SO_LIST);
  // weight ของถัง = Actual ล้วนทั้งสามโหมดจัดกลุ่ม
  assert.equal((page.match(/weight: salesOrderActual\(row\)/g) || []).length, 3);
  assert.doesNotMatch(page, /weight:[^\n]*[Pp]endingApproval/, 'ยอดรออนุมัติห้ามเข้า weight ของถัง');
  assert.match(page, /splitSalesOrderAmounts\(bucket\.items\)/, 'รออนุมัติของหัวกลุ่มคิดจากแถวในถังชุดเดียวกัน');
  assert.match(page, /<PendingApprovalAmount[\s\S]{0,200}amount=\{pendingOfBucket\.pendingApproval\}/);
  assert.match(page, /total=\{bucketTotal\}/);

  // เซลล์ยอด: ตัดสินด้วยตัวกลาง · ใบรออนุมัติบอกคำว่า "รออนุมัติ" (amber) ไม่ใช่คำกลาง ๆ
  assert.match(page, /const amountKind = salesOrderAmountKind\(row\);/);
  assert.match(page, /amountKind === "excluded" \? "cell-num-idle" : ""/, 'หรี่เฉพาะใบนิ่ง — ใบรออนุมัติไม่หรี่');
  assert.match(page, /<span className="so-pending-approval-tag">\{PENDING_APPROVAL_LABEL\}<\/span> · ยังไม่นับ Actual/);
  assert.match(page, /<span className="cell-sub">ยังไม่นับเป็น Actual<\/span>/, 'ใบนิ่งคงบรรทัดเดิม');

  // คอลัมน์โชว์ยอดทุกสถานะ ⇒ หัวคอลัมน์และป้ายเรียงต้องไม่เรียกว่า Actual
  assert.match(page, /<th className="num">ยอดก่อน VAT<\/th>/);
  assert.doesNotMatch(page, /<th className="num">Actual ก่อน VAT<\/th>/);
  assert.match(page, /\{ value: "actual", label: "ยอดก่อน VAT", dir: "desc" \}/, 'value คงเดิม (ค่าที่จำไว้ของผู้ใช้)');
});

test('คิวรออนุมัติบนทะเบียน SO โชว์ยอดก่อน VAT ตัวเดียวกับการ์ด (ไม่ใช่ยอดรวม VAT)', () => {
  const page = code(SO_LIST);
  assert.match(page, /`\$\{naText\(o\.customerName\)\} · \$\{fmtMoney\(o\.actualAmount\)\} ก่อน VAT`/);
  // ⚠️ คิวของเปลือกบัญชี (ใบเก็บครบรอปิด) ยังเป็นยอดรวม VAT = เงินที่เก็บจริง
  assert.match(page, /secondary=\{\(o\) => \(financeShell\s*\?/);
});

test('หน้าใบสั่งขาย: การ์ดสรุป · แถบท้ายรายการ · รางขั้นตอน เดินตามกองของยอด', () => {
  const page = code(SO_DETAIL);
  assert.match(page, /const amountKind = salesOrderAmountKind\(order\);/);
  // การ์ดสรุป: ใบรออนุมัติโชว์ยอดผ่านชิ้นกลาง ไม่ใช่ "ยังไม่นับ" เฉย ๆ
  assert.match(page, /amountKind === "pending_approval"\s*\?\s*\(\s*<>\s*<PendingApprovalAmount amount=\{order\.actualAmount\} count=\{1\} \/>/);
  assert.match(page, /ยังไม่นับเป็น Actual<\/span>/);
  // แถบเน้นท้ายตาราง: เขียว Actual เฉพาะใบอนุมัติ — เดิมเขียวทุกสถานะ
  assert.match(page, /\{ label: "Actual ก่อน VAT", tone: "success" \}/);
  assert.match(page, /\{ label: `\$\{PENDING_APPROVAL_LABEL\} \(ก่อน VAT\)`, tone: "warning" \}/);
  assert.match(page, /\{ label: "ยอดก่อน VAT", tone: "neutral" \}/);
  assert.match(page, /highlightRows=\{\[amountHighlight\]\}/);
  assert.doesNotMatch(page, /highlightRows=\{\[\{ id: "actual", label: "Actual ก่อน VAT"[^\n]*tone: "success" \}\]\}/,
    'ห้ามกลับไปเขียนแถบเขียวตายตัว');
  // รางขั้น "นับ Actual" บอกยอดรออนุมัติ
  assert.match(page, /amountKind === "pending_approval" \? `\$\{PENDING_APPROVAL_LABEL\} \$\{fmtMoney\(order\.actualAmount\)\}`/);
  // สถานะรออนุมัติมีคำอธิบายผลต่อยอดแล้ว
  assert.match(page, /pending_approval: \{[\s\S]{0,200}description: `ยอดขึ้นเป็น "\$\{PENDING_APPROVAL_LABEL\}"/);
});

test('หน้าใบสั่งขาย: ทุกโมดัลของสายอนุมัติบอกว่ายอดไปอยู่กองไหน (กติกาโมดัลอนุมัติ #1223)', () => {
  const page = code(SO_DETAIL);
  // ยื่น = ยอดขึ้นเป็นรออนุมัติบนภาพรวม ดีล โครงการ
  assert.match(page,
    /`ยอด \$\{fmtMoney\(order\.actualAmount\)\} \(ก่อน VAT\) จะขึ้นเป็น "\$\{PENDING_APPROVAL_LABEL\}" บนภาพรวม ดีล และโครงการ — ยังไม่นับเป็น Actual จนกว่าจะอนุมัติ`/);
  // อนุมัติ = ย้ายจากรออนุมัติเข้า Actual ของเดือนที่อนุมัติ (เวลาไทย)
  assert.match(page,
    /`ยอด \$\{fmtMoney\(order\.actualAmount\)\} ย้ายจาก "\$\{PENDING_APPROVAL_LABEL\}" เข้าเป็น Actual ของเดือน \$\{formatMonthLabel\(currentMonth\(\)\)\}/);
  assert.match(page, /import \{ currentMonth, formatMonthLabel \} from "@\/lib\/datePeriods";/);
  // 🛑 เดือนต้องเป็น YYYY-MM เวลาไทย — businessMonthKey คืน YYMM ของเลขเอกสาร
  assert.doesNotMatch(page, /businessMonthKey/);
  assert.doesNotMatch(page, /toISOString\(\)\.slice\(0,\s*7\)/);
  // ดึงกลับ + ตีกลับ = ยอดออกจากรออนุมัติ
  const leaves = page.match(/จะออกจาก "\$\{PENDING_APPROVAL_LABEL\}"/g) || [];
  assert.ok(leaves.length >= 2, 'ทั้งดึงกลับและตีกลับต้องบอกว่ายอดออกจากรออนุมัติ');
  assert.match(page, /open=\{!!rejectForm\}[\s\S]{0,400}detail=\{`ยอด \$\{fmtMoney\(order\.actualAmount\)\} จะออกจาก "\$\{PENDING_APPROVAL_LABEL\}"/);
});

test('หน้าใบเสนอราคา: การ์ดใบสั่งขายไม่ขึ้น "Actual ฿0.00" ข้างป้ายรออนุมัติอีก', () => {
  const page = code(QT_DETAIL);
  // 🐞 ต้นเรื่อง: Actual ก่อน VAT {fmtMoney(status === "approved" ? actualAmount : 0)}
  assert.doesNotMatch(page, /quote\.salesOrder\.status === "approved" \? quote\.salesOrder\.actualAmount : 0/);
  assert.match(page, /salesOrderAmountKind\(quote\.salesOrder\) === "actual"/);
  assert.match(page, /salesOrderAmountKind\(quote\.salesOrder\) === "pending_approval"/);
  assert.match(page, /<PendingApprovalAmount inline amount=\{quote\.salesOrder\.actualAmount\} count=\{1\} \/> ก่อน VAT · ยังไม่นับ Actual/);
  // ป้ายสถานะมาจากทะเบียนกลาง (ครอบ revised/approval_revoked)
  assert.match(page, /SALES_ORDER_STATUS_LABELS\[quote\.salesOrder\.status\]/);
});

test('route ใบเสนอราคาหาใบสั่งขายได้แม้มีหลายแถว — ไม่ใช้ maybeSingle ที่พังเงียบ', () => {
  const route = code(QT_ROUTE);
  assert.doesNotMatch(route, /\.eq\('quotationId', data\.id\)\s*\.maybeSingle\(\)/);
  assert.match(route, /fetchAllResult\(\(\) => supabase\s*\n\s*\.from\('sales_orders'\)/, 'อ่านทั้งหมดผ่าน fetchAllResult (check:rowcap)');
  assert.match(route, /\.order\('createdAt', \{ ascending: false \}\)\s*\n\s*\.order\('id', \{ ascending: true \}\)/, 'ลำดับต้องนิ่ง');
  assert.match(route, /if \(salesOrderError\) throw salesOrderError;/, 'อ่านไม่ขึ้น ≠ ไม่มีใบ');
  assert.match(route, /data\.salesOrder = rows\.find\(isLiveSalesOrder\) \|\| rows\[0\] \|\| null;/);
  assert.match(route, /select\('id, orderNumber, status, orderDate, actualAmount, supersededById, createdAt'\)/);
});

test('แถบเตือนบนทะเบียนใบเสนอราคาบอกทางสามขั้น: ยื่น → รออนุมัติ → Actual', () => {
  const page = code(QT_LIST);
  assert.doesNotMatch(page, /กดสร้างใบสั่งขายเพื่อให้ยอดเข้าเป็น Actual/, 'ข้อความเดิมเล่าทางเดียวขั้นเดียว');
  assert.match(page, /สร้างและยื่นใบสั่งขาย ยอดจะขึ้นเป็น “รออนุมัติ” แล้วเป็น Actual เมื่ออนุมัติ/);
});

test('แถบเน้นท้ายตารางรายการมีโทน warning/neutral — รออนุมัติห้ามเขียวของ Actual', () => {
  const component = code(LINE_ITEMS);
  assert.match(component, /warning: styles\.warningTotal,/);
  assert.match(component, /neutral: styles\.neutralTotal,/);
  assert.match(component, /HIGHLIGHT_TONE\[row\.tone\] \|\| styles\.successTotal/, 'ไม่ส่ง tone = เขียวเหมือนเดิม');
  const css = raw(LINE_ITEMS_CSS);
  const block = (name) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] || '';
  assert.match(block('warningTotal'), /var\(--amber\)/);
  assert.doesNotMatch(block('warningTotal'), /--green/);
  assert.doesNotMatch(block('neutralTotal'), /--green|--amber|--red/);
});

test('ป้าย "รออนุมัติ" บนทุกจอมาจากค่าคงที่ตัวเดียว', () => {
  assert.equal(PENDING_APPROVAL_LABEL, 'รออนุมัติ');
  for (const rel of [SO_LIST, SO_DETAIL]) {
    assert.match(code(rel), /PENDING_APPROVAL_LABEL/, `${rel} ต้องใช้ค่าคงที่กลาง`);
  }
});

test('ปุ่มย้อนการรับดูทุกใบ SO กติกาเดียวกับ RPC unaccept — ไม่ใช่แค่ใบที่เลือกโชว์', () => {
  // สาย Rev. ที่ฉบับใหม่ถูกยกเลิก: ใบที่เลือกโชว์ = ใบยกเลิก แต่ใบต้นทาง 'revised' ยังค้าง
  // ⇒ RPC (0138/0170) บล็อกเพราะมีใบที่ไม่ใช่ cancelled · จอต้องไม่ชวนกดแล้วโดน 409
  const route = readFileSync(new URL('../../app/api/sales-planning/quotations/[id]/route.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../app/sales-planning/quotations/[id]/page.js', import.meta.url), 'utf8');
  assert.match(route, /data\.hasNonCancelledSalesOrder = rows\.some\(\(row\) => row\.status !== 'cancelled'\)/);
  assert.match(page, /canUnaccept = [^;]*!quote\.hasNonCancelledSalesOrder/);
  assert.doesNotMatch(page, /canUnaccept = [^;]*quote\.salesOrder\.status === "cancelled"/);
});
