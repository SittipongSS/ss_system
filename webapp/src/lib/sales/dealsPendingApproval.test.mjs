// ยอด SO "รออนุมัติ" บนหน้ารายการดีล · หน้ารายละเอียดดีล · การ์ดดีลบนหน้าลีด
// (มติผู้ใช้ 2026-09-11 · mig 0353) — โชว์ยอดได้ แต่แยกจาก Actual เสมอ
//
// ล็อกสองชั้น:
//   ① ตัวช่วยกลางของมูลค่าที่ขึ้นจอ (lib/sales/dealAmountDisplay) — Won = Actual · เปิด = FC ·
//      รออนุมัติเป็นกองแยก ไม่ไหลเข้าตัวเลขหลัก/ยอดรวม/การเรียง
//   ② ต้นทางของสามจอ — ห้ามกลับไปอ่าน `wonValue ?? projectValue` ดิบ (โค้ดตาย: trigger
//      เขียน wonValue = 0 ไม่ใช่ null) · ตาราง SO ในหน้าดีลใช้ทะเบียนป้าย/สามสถานะกลาง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareDealDisplayValue, dealDisplayValue, sumDealDisplay } from './dealAmountDisplay.js';

const read = (rel) => readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, '$1'))
  .join('\n');

const DEALS_PAGE = 'src/app/sales-planning/deals/page.js';
const DEAL_DETAIL = 'src/app/sales-planning/deals/[id]/page.js';
const LEAD_PAGE = 'src/app/sales-planning/leads/[id]/page.js';
const LEAD_ROUTE = 'src/app/api/sales-planning/leads/[id]/route.js';

// รูปจริงบน prod 2026-09-11 (DL-260900474): trigger เขียน wonValue 0 + สองคีย์ของ mig 0353
const PENDING_ONLY_WON = {
  stage: 'won', projectValue: 108000, wonValue: 0,
  metadata: { actualSource: 'sale_order', soPendingAmount: 108000, soPendingCount: 1 },
};
const MIXED_WON = {
  stage: 'won', projectValue: 300000, wonValue: 200000,
  metadata: { actualSource: 'sale_order', soPendingAmount: 100000, soPendingCount: 2 },
};
// ดีลเปิดก็ถูก trigger เขียน wonValue = 0 ตั้งแต่ INSERT — `??` จึงไม่เคยถอยไป FC
const OPEN = { stage: 'quotation', projectValue: 50000, wonValue: 0, metadata: {} };

test('มูลค่าที่ขึ้นจอ: Won = Actual (ผ่านด่าน actualSource) · ดีลเปิด = FC', () => {
  assert.equal(dealDisplayValue(PENDING_ONLY_WON), 0, 'ยอดรออนุมัติต้องไม่ไหลเข้าตัวเลขหลัก');
  assert.equal(dealDisplayValue(MIXED_WON), 200000);
  assert.equal(dealDisplayValue(OPEN), 50000, 'ดีลเปิดต้องได้ FC ไม่ใช่ wonValue 0');
  // in_project = Won (ยุบตั้งแต่ mig 0082)
  assert.equal(dealDisplayValue({ ...MIXED_WON, stage: 'in_project' }), 200000);
  // wonValue ที่ไม่ได้มาจาก SO อนุมัติ (ไม่มี actualSource) ไม่ใช่ Actual
  assert.equal(dealDisplayValue({ stage: 'won', wonValue: 90000, projectValue: 90000, metadata: {} }), 0);
  // ดีลเก่าที่ย้ายระบบ (legacy) ยังนับตามเดิม
  assert.equal(dealDisplayValue({ stage: 'won', wonValue: 70000, metadata: { actualSource: 'legacy' } }), 70000);
  // ข้อมูลไม่ครบต้องไม่พัง
  assert.equal(dealDisplayValue({ stage: 'lead', projectValue: null }), 0);
  assert.equal(dealDisplayValue(null), 0);
  // ดีลแพ้ = FC ตามเดิม (ไม่ใช่ Won) และไม่มียอดรออนุมัติ
  assert.equal(dealDisplayValue({ stage: 'lost', projectValue: 1234, metadata: { soPendingAmount: 99 } }), 1234);
});

test('รวมยอด (หัวกลุ่ม · KPI): สองกองแยกกัน รออนุมัตินับเฉพาะดีล Won', () => {
  const totals = sumDealDisplay([
    PENDING_ONLY_WON,
    MIXED_WON,
    OPEN,
    // ดีลเปิดที่มี cache รออนุมัติ (แทบเกิดไม่ได้) — FC อยู่ใน value แล้ว ห้ามนับรออนุมัติซ้ำ
    { stage: 'qualified', projectValue: 20000, metadata: { soPendingAmount: 999, soPendingCount: 1 } },
  ]);
  assert.deepEqual(totals, {
    value: 0 + 200000 + 50000 + 20000,
    pendingApproval: 108000 + 100000,
    pendingApprovalCount: 1 + 2,
  });
  assert.deepEqual(sumDealDisplay([]), { value: 0, pendingApproval: 0, pendingApprovalCount: 0 });
  assert.deepEqual(sumDealDisplay(undefined), { value: 0, pendingApproval: 0, pendingApprovalCount: 0 });
});

test('JS ขึ้นก่อนรัน mig 0353 ได้: ไม่มีคีย์ soPending* = ไม่มียอดรออนุมัติ ตัวเลขหลักไม่เปลี่ยน', () => {
  const beforeMigration = { stage: 'won', projectValue: 108000, wonValue: 0, metadata: { actualSource: 'sale_order' } };
  assert.equal(dealDisplayValue(beforeMigration), 0);
  assert.deepEqual(sumDealDisplay([beforeMigration]), { value: 0, pendingApproval: 0, pendingApprovalCount: 0 });
});

test('เรียงตามมูลค่า: ตัวเลขหลักก่อน · รออนุมัติเป็นแค่ตัวตัดสินตอนเสมอ', () => {
  const zeroWon = { stage: 'won', wonValue: 0, metadata: { actualSource: 'sale_order' } };
  const small = { stage: 'won', wonValue: 1, metadata: { actualSource: 'sale_order' } };
  const desc = [zeroWon, PENDING_ONLY_WON, small].sort((a, b) => -compareDealDisplayValue(a, b));
  // ดีลที่มี Actual แม้ 1 บาท ยังอยู่เหนือดีลที่มีแต่รออนุมัติ — รออนุมัติไม่ถูกบวกเข้าคีย์เรียง
  assert.deepEqual(desc, [small, PENDING_ONLY_WON, zeroWon]);
  assert.equal(compareDealDisplayValue(OPEN, OPEN), 0);
});

/* ── ② ต้นทางของจอ ─────────────────────────────────────────────────────────── */

const RAW_WON_FALLBACK = /wonValue\s*\?\?\s*(?:[\w.]*\.)?projectValue/;

test('หน้ารายการดีล: มูลค่า · การเรียง · ยอดหัวกลุ่ม · KPI ใช้ตัวช่วยกลางตัวเดียว', () => {
  const page = stripComments(read(DEALS_PAGE));
  assert.doesNotMatch(page, RAW_WON_FALLBACK, 'ห้ามอ่าน wonValue ดิบแล้วถอยไป FC (โค้ดตาย · ข้ามด่าน actualSource)');
  assert.doesNotMatch(page, /const dealValue\s*=/, 'ห้ามมีสูตรมูลค่าของตัวเองอีกชุด');
  assert.match(page, /from "@\/lib\/sales\/dealAmountDisplay"/);
  assert.match(page, /fmtMoney\(dealDisplayValue\(deal\)\)/, 'คอลัมน์มูลค่า');
  assert.match(page, /sortKey === "amount"\) return compareDealDisplayValue\(a, b\) \* mul/, 'การเรียงต้องใช้ตัวเดียวกับคอลัมน์');
  assert.match(page, /group\.total \+= dealDisplayValue\(deal\)/, 'ยอดหัวกลุ่มบวกจากตัวเลขเดียวกับในแถว');
  assert.match(page, /sumDealDisplay\(wonDeals\)/, 'KPI Won ใช้ชุดเดียวกับตัวนับ Won');
});

test('หน้ารายการดีล: ยอดรออนุมัติเป็นชิ้นแยก (PendingApprovalAmount) ไม่บวกเข้ายอดรวม', () => {
  const page = stripComments(read(DEALS_PAGE));
  assert.match(page, /import PendingApprovalAmount from "@\/components\/salesPlanning\/PendingApprovalAmount"/);
  assert.match(page, /<PendingApprovalAmount amount=\{pendingApprovalAmountOf\(deal\)\} count=\{pendingApprovalCountOf\(deal\)\} \/>/,
    'บรรทัดรองในแถว');
  assert.match(page, /<PendingApprovalAmount amount=\{group\.pendingApproval\} count=\{group\.pendingApprovalCount\} inline prefix=" · " \/>/,
    'ยอดรออนุมัติข้างยอดรวมหัวกลุ่ม (มีตัวคั่นเสมอ — หัวกลุ่มไม่ใช่ flex)');
  assert.match(page, /amount=\{wonTotals\.pendingApproval\}/, 'note ของการ์ด Won');
  /* note ของการ์ด KPI เป็น nowrap + ตัดท้าย "…" — ยอดรออนุมัติต่อท้ายบรรทัดเดียวกับ Actual
     จะถูกตัดทิ้งบนจอโน้ตบุ๊ก (แถบ 4 ช่อง) ⇒ ต้องเป็นบรรทัดของตัวเอง (ไม่ใช่ inline) */
  const kpiPending = page.match(/<PendingApprovalAmount\s+amount=\{wonTotals\.pendingApproval\}[^>]*\/>/);
  assert.ok(kpiPending, 'ต้องเจอชิ้นรออนุมัติของการ์ด Won');
  assert.doesNotMatch(kpiPending[0], /\binline\b/, 'ยอดรออนุมัติบนการ์ด KPI ต้องขึ้นบรรทัดของตัวเอง');
  assert.match(kpiPending[0], /className=\{styles\.metricPending\}/, 'ขนาดตัวอักษรต้องรับจาก note');
  /* ทรงเดียวกับ note ของการ์ดบนแดชบอร์ดของฉันและ /sa/projects (Metric ตัวเดียวกัน): ตัดบรรทัด
     ไม่ตัด … — ยอดเงินที่ถูกเฉือนอ่านต่อจากที่ไหนไม่ได้ (title ของชิ้นกลางไม่มีตัวเลข) */
  const css = read('src/app/sales-planning/deals/page.module.css');
  const rule = css.match(/\.metricPending:global\(\.so-pending-approval\)\s*\{([^}]*)\}/);
  assert.ok(rule, 'ต้องมีกฎ .metricPending ของ note การ์ด');
  assert.match(rule[1], /font-size: inherit/, 'ขนาดตัวอักษรรับจาก note');
  assert.match(rule[1], /white-space: normal/, 'บรรทัดรออนุมัติต้องตัดบรรทัดได้');
  assert.doesNotMatch(rule[1], /text-overflow|nowrap/, 'ห้ามตัดยอดเงินทิ้งด้วย "…"');
  // กองแยก: total ไม่มีวันถูกบวกด้วยยอดรออนุมัติ และกลุ่มยังเรียงด้วย total เดิม
  assert.doesNotMatch(page, /group\.total \+=[^\n;]*pendingApproval/);
  assert.match(page, /\(b\.total - a\.total\)/);
  assert.doesNotMatch(page, /wonValue\s*=\s*[^\n;]*pendingApproval/, 'ยอด Won ของ KPI ต้องเป็น Actual ล้วน');
});

test('หน้ารายละเอียดดีล: การ์ด Won = Actual + บรรทัดรออนุมัติจากแถว SO ที่โหลดมาแล้ว', () => {
  const page = stripComments(read(DEAL_DETAIL));
  assert.doesNotMatch(page, RAW_WON_FALLBACK, 'การ์ดมูลค่าปิดจริงต้องไม่อ่าน wonValue ดิบ');
  assert.match(page, /const dealActual = dealActualFromSalesOrders\(deal\)/);
  assert.match(page, /const soAmounts = splitSalesOrderAmounts\(data\?\.salesOrders \|\| \[\]\)/,
    'ยอดรออนุมัติต้องรวมจากแถว SO สด — ไม่พึ่ง cache ของ mig 0353');
  assert.match(page, /value=\{money\(dealActual\)\}/);
  assert.match(page, /<PendingApprovalAmount amount=\{soAmounts\.pendingApproval\} count=\{soAmounts\.pendingApprovalCount\} \/>/);
  // ส่วนต่างเทียบ FC คิดจาก Actual ล้วน
  assert.match(page, /\(Number\(deal\.projectValue\) \|\| 0\) - dealActual/);
  assert.doesNotMatch(page, /dealActual\s*\+\s*soAmounts/, 'ห้ามบวกรออนุมัติเข้า Actual');
});

test('หน้ารายละเอียดดีล: ตาราง SO ใช้ป้ายสถานะกลาง + ยอดสามสถานะ', () => {
  const page = stripComments(read(DEAL_DETAIL));
  assert.match(page, /SALES_ORDER_STATUS_LABELS\[order\.status\]/, 'ป้ายสถานะมาจากทะเบียนกลาง');
  assert.doesNotMatch(page, /\{\s*draft:\s*"ร่าง"/, 'map ป้ายที่เขียนเอง (ขาด revised/approval_revoked) ต้องไม่กลับมา');
  assert.doesNotMatch(page, /order\.status === "approved" \? order\.actualAmount : 0/,
    'ใบรออนุมัติต้องไม่ถูกตีเป็น ฿0.00 อีก');
  assert.match(page, /const kind = salesOrderAmountKind\(order\)/);
  assert.match(page, /if \(kind === "actual"\) return money\(salesOrderActual\(order\)\)/);
  assert.match(page, /kind === "pending_approval"[\s\S]{0,120}<PendingApprovalAmount amount=\{salesOrderPendingApprovalAmount\(order\)\}/);
  assert.match(page, /· ไม่นับ/, 'ใบที่ไม่นับต้องมีคำกำกับ ไม่ใช่แค่สีจาง');
  assert.match(page, /<td className="num mono">\{soAmountCell\(order\)\}<\/td>/);
});

test('หน้าลีด: API ส่ง metadata ของดีล · การ์ดแยก Won/เปิด ไม่อ่าน wonValue ดิบ', () => {
  const route = read(LEAD_ROUTE);
  const select = route.match(/from\('sales_deals'\)\.select\('([^']+)'\)\.eq\('leadId', id\)\.order/);
  assert.ok(select, 'ต้องเจอ select ของ relatedDeals');
  assert.ok(select[1].split(',').map((c) => c.trim()).includes('metadata'),
    'ต้องมี metadata — Actual (actualSource) และยอดรออนุมัติอยู่ในนั้น');
  // ส่งเฉพาะคีย์ที่การ์ดอ่าน ไม่ใช่ metadata ทั้งก้อน (คนเปิดหน้าลีดบางตำแหน่งไม่มีสิทธิ์หน้าดีล)
  assert.match(route, /DEAL_CARD_METADATA_KEYS = \['actualSource', 'soPendingAmount', 'soPendingCount'\]/);
  assert.match(route, /relatedDeals: \(relatedDeals \|\| \[\]\)\.map\(\(deal\) => \(\{ \.\.\.deal, metadata: dealCardMetadata\(deal\.metadata\) \}\)\)/);
  /* supabase ไม่ throw — ดีลที่ผูกอ่านไม่ขึ้นแล้วตกเป็น [] = การ์ด "ยังไม่มีดีล" + canDelete เปิด
     ⇒ ต้องเช็ค error ของทั้งสองก้อนก่อนประกอบคำตอบ */
  assert.match(route, /\{ data: relatedDeals, error: relatedDealsError \}/);
  assert.match(route, /if \(relatedDealsError\) return fail\(/);
  assert.match(route, /\{ data: events, error: eventsError \}/);
  assert.match(route, /if \(eventsError\) return fail\(/);

  const page = stripComments(read(LEAD_PAGE));
  assert.doesNotMatch(page, RAW_WON_FALLBACK, 'ดีลเปิดเคยขึ้น ฿0.00 เพราะ wonValue = 0 ไม่ใช่ null');
  assert.match(page, /isWonDeal\(deal\)\s*\?\s*\{\s*label: "มูลค่าปิดจริง"/);
  assert.match(page, /\{ label: "มูลค่าคาดการณ์", value: fmtMoney\(dealDisplayValue\(deal\)\) \}/);
  assert.match(page, /<PendingApprovalAmount\s+amount=\{pendingApprovalAmountOf\(deal\)\}\s+count=\{pendingApprovalCountOf\(deal\)\}/);
  assert.match(page, /STAGE_LABELS\[deal\.stage\]/, 'ป้ายขั้นต้องเป็นคำไทย ไม่ใช่คีย์ดิบ');
});
