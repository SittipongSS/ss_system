import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  QUOTATION_DEAL_EXCLUDED_STAGES,
  blockedQuotationCustomers,
  eligibleQuotationDeals,
  unassignedQuotationDeals,
} from "./quotationSourcePicker.js";
import { dealAttachmentSummary, dealCustomerAdoptError, dealCustomerPatchError } from "./dealCustomerAdopt.js";

const customers = [
  { id: "C-OK", name: "บริษัท ทิพย์นที (2005) จำกัด", arCode: "AR-001" },
  { id: "C-NOPROJ", name: "บริษัท อุตสาหกรรมไหมไทย จำกัด", arCode: "AR-002" },
  { id: "C-WON", name: "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด", arCode: "AR-000" },
  { id: "C-OTHERTEAM", name: "บริษัท ลิกซิล (ประเทศไทย) จำกัด", arCode: "AR-003" },
  { id: "C-NODEAL", name: "บริษัท ไพรไทย 1960 จำกัด", arCode: "AR-004" },
];
const deals = [
  { id: "D-1", title: "ODM_ok", customerId: "C-OK", projectId: "PRJ-1", stage: "quotation", canEdit: true },
  { id: "D-2", title: "KA_Jim Thompson", customerId: "C-NOPROJ", projectId: null, stage: "qualified", canEdit: true },
  { id: "D-3", title: "TEST_Deal", customerId: "C-WON", projectId: "PRJ-3", stage: "won", canEdit: true },
  { id: "D-4", title: "ทีมอื่น", customerId: "C-OTHERTEAM", projectId: "PRJ-4", stage: "qualified", canEdit: false },
];

test("ดีลที่ออกใบได้ = stage เปิด + แก้ไขได้ (ไม่บังคับโครงการ/ลูกค้า)", () => {
  // ⚠️ D-2 ยังไม่ผูกโครงการแต่ต้องออกใบได้ — โครงการถูกถอดออกจากเงื่อนไข 2026-08-24
  // (ด่านจริงย้ายไปอยู่ตอนรับใบปิด Won ที่ quotations/[id]/accept)
  // ส่วนลูกค้าดูเทสต์ "ดีลที่ยังไม่มีลูกค้ายังอยู่ในลิสต์ออกใบ…" ข้างล่าง
  assert.deepEqual(eligibleQuotationDeals(deals).map((d) => d.id), ["D-1", "D-2"]);
  assert.deepEqual(QUOTATION_DEAL_EXCLUDED_STAGES, ["won", "in_project", "lost"]);
  assert.deepEqual(eligibleQuotationDeals(), []);
});

// เคสจริง 2026-07-26: ผู้ใช้ค้น "เซนท์ แอนด์ เซนส์" ไม่เจอ ทั้งที่ลูกค้า/โครงการ/ดีลมีครบ
// — เพราะดีลถูกปิดเป็น Won ต้องบอกให้รู้ตรงนั้น ไม่ใช่หายเงียบ
test("ค้นเจอลูกค้าที่ดีลปิดเป็น Won → บอกเหตุ + ชี้ไปหน้าดีล", () => {
  const [row] = blockedQuotationCustomers({ search: "เซนท์ แอนด์", customers, deals });
  assert.equal(row.customerId, "C-WON");
  assert.equal(row.reasonCode, "closed_stage");
  assert.match(row.reason, /ปิดแล้ว/);
  assert.equal(row.dealTitle, "TEST_Deal");
  assert.equal(row.href, "/sa/deals/D-3");
});

test("ดีลยังไม่ผูกโครงการ = ออกใบได้ ไม่ต้องมีคำอธิบายอะไรทั้งนั้น", () => {
  // เคสเดิมของเทสต์นี้คือ "ชี้ไปผูกโครงการ" — ตอนนี้ไม่ใช่เหตุขวางอีกแล้ว
  assert.deepEqual(blockedQuotationCustomers({ search: "ไหมไทย", customers, deals }), []);
});

test("ดีลของทีมอื่น (แก้ไขไม่ได้) มีเหตุของตัวเอง", () => {
  const [row] = blockedQuotationCustomers({ search: "ลิกซิล", customers, deals });
  assert.equal(row.reasonCode, "not_editable");
});

test("ไม่มีดีลเลย → ชี้ไปหน้าดีลให้สร้างก่อน", () => {
  const [row] = blockedQuotationCustomers({ search: "ไพรไทย", customers, deals });
  assert.equal(row.reasonCode, "no_deal");
  assert.equal(row.dealId, null);
  assert.equal(row.href, "/sa/deals");
});

test("ลูกค้าที่ออกใบได้อยู่แล้วไม่ต้องอธิบาย + ค้นสั้นเกินไม่กวน", () => {
  assert.deepEqual(blockedQuotationCustomers({ search: "ทิพย์นที", customers, deals }), []);
  assert.deepEqual(blockedQuotationCustomers({ search: "ท", customers, deals }), []);
  assert.deepEqual(blockedQuotationCustomers({ search: "", customers, deals }), []);
});

test("ค้นด้วยรหัสลูกค้าได้ และจำกัดจำนวนที่แสดง", () => {
  const [byCode] = blockedQuotationCustomers({ search: "AR-000", customers, deals });
  assert.equal(byCode.customerId, "C-WON");
  const many = blockedQuotationCustomers({ search: "บริษัท", customers, deals, limit: 2 });
  assert.equal(many.length, 2);
});

// หน้าเว็บกับตัวบอกเหตุต้องใช้เงื่อนไขชุดเดียวกัน ไม่งั้นลิสต์กับคำอธิบายเถียงกันเอง
test("หน้าสร้างใบเสนอราคาเรียกเงื่อนไขจาก lib ไม่ได้ก๊อปไปเขียนเอง", () => {
  const page = readFileSync(
    new URL("../../app/sales-planning/quotations/new/page.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /eligibleQuotationDeals\(deals\)/);
  assert.match(page, /blockedQuotationCustomers\(\{ search, customers, registryCustomers, deals \}\)/);
  assert.doesNotMatch(page, /EXCLUDE_STAGES/);
  // ทะเบียนทั้งหมด (?manage=1) มีไว้ตอบเหตุเท่านั้น — ถ้าหลุดไปเป็น customerOptions
  // ลูกค้าที่รออนุมัติ/พักใช้/ทีมอื่น จะกลายเป็นตัวเลือกออกใบ = พังกติกาการกรอง
  assert.match(page, /cachedFetchJson\("\/api\/customers\?manage=1"\)/);
  assert.doesNotMatch(page, /registryCustomers\.map|registryCustomers\.filter/);
});

/* ── ด่าน "ต้องมีโครงการ" มีได้ที่เดียว: ตอนรับใบปิด Won ─────────────────────
   ฟีดแบคผู้ใช้ 2026-08-24: "จะทำอะไรต่อก็ต้องผูกโครงการก่อน ยุ่งยาก" — ด่านตอน
   *ออกใบ* ถูกถอด เพราะไม่มีใครอ่านค่าโครงการก่อนปิด Won · ด่านตอน *รับใบ* ต้องอยู่
   เพราะ RPC สร้าง SO ก๊อป `projectId` ของดีลไปใช้จริงแล้วไหลต่อไปงานผลิต/ส่งของ
   ⚠️ เทสต์นี้ล็อก **ทั้งสองข้าง**: ถอดด่านออกทั้งคู่ = ใบสั่งขายไม่มีโครงการ ·
   ใส่กลับที่ตอนออกใบ = ฟีดแบครอบนี้กลับมาใหม่ */
const routeSource = (path) => readFileSync(new URL(`../../app/api/${path}`, import.meta.url), 'utf8');

test('ออกใบเสนอราคาไม่บังคับโครงการ แต่รับใบปิด Won ยังบังคับ', () => {
  const create = routeSource('sales-planning/deals/[id]/quotations/route.js');
  const accept = routeSource('sales-planning/quotations/[id]/accept/route.js');
  assert.doesNotMatch(create, /if \(!deal\.projectId\) return/, 'ตอนออกใบต้องไม่มีด่านโครงการ');
  assert.match(accept, /if \(!deal\.projectId\) return/, 'ตอนปิด Won ต้องยังบังคับโครงการ');
  /* ⚠️ ลูกค้า **ยังบังคับ** แต่เปลี่ยนท่า (2026-08-24): ใบต้องมีลูกค้าเสมอ ถ้าดีลยังไม่มี
     ให้รับจากฟอร์มมาตั้งให้ดีล — ไม่ใช่ตีกลับให้ไปแก้ที่หน้าดีล ⇒ ด่านต้องเหลืออยู่ใน
     รูป "ไม่มีทั้งที่ดีลและที่ body = ตีกลับ" */
  assert.match(create, /dealAwaitsCustomer\(deal\)/, 'ต้องยังตรวจว่าดีลมีลูกค้าหรือยัง');
  assert.match(create, /if \(!body\.customerId\) \{[\s\S]{0,200}?return badRequest/,
    'ไม่มีลูกค้าทั้งที่ดีลและบนฟอร์ม = ต้องตีกลับเหมือนเดิม');
  assert.match(create, /\.is\('customerId', null\)/, 'การตั้งลูกค้าต้อง guard กันเขียนทับ');
});

test('ตั้งลูกค้าให้ดีลได้เฉพาะช่องที่ว่าง และเฉพาะลูกค้าที่ใช้ออกเอกสารได้', () => {
  const ok = { id: 'CUS-1', name: 'ลูกค้า ก', approvalStatus: 'approved', isActive: true };
  assert.equal(dealCustomerAdoptError({ id: 'D1' }, ok), null);
  // legacy NULL = อนุมัติแล้ว/ใช้งานอยู่ (แถวก่อน mig 0027/0030)
  assert.equal(dealCustomerAdoptError({ id: 'D1' }, { id: 'CUS-2', name: 'เก่า' }), null);
  assert.match(dealCustomerAdoptError({ id: 'D1', customerId: 'CUS-9' }, ok), /มีลูกค้าอยู่แล้ว/);
  assert.match(dealCustomerAdoptError({ id: 'D1' }, null), /ไม่พบลูกค้า/);
  assert.match(dealCustomerAdoptError({ id: 'D1' }, { ...ok, approvalStatus: 'pending' }), /รออนุมัติ/);
  assert.match(dealCustomerAdoptError({ id: 'D1' }, { ...ok, isActive: false }), /พักใช้/);
});

test('ดีลที่ยังไม่มีลูกค้ายังอยู่ในลิสต์ออกใบ และแยกออกมาเป็นกลุ่มของตัวเองได้', () => {
  const rows = [
    { id: 'D-1', customerId: 'C-OK', stage: 'quotation', canEdit: true },
    { id: 'D-9', customerId: null, stage: 'qualified', canEdit: true },
    { id: 'D-8', customerId: null, stage: 'won', canEdit: true },      // ปิดแล้ว = ไม่นับ
    { id: 'D-7', customerId: null, stage: 'lead', canEdit: false },    // ทีมอื่น = ไม่นับ
  ];
  assert.deepEqual(eligibleQuotationDeals(rows).map((d) => d.id), ['D-1', 'D-9']);
  assert.deepEqual(unassignedQuotationDeals(rows).map((d) => d.id), ['D-9']);
});

test('เปิดคำร้องไม่บังคับโครงการ — ด่านเดิมที่ requests ต้องไม่กลับมา', () => {
  const requests = routeSource('sa/requests/route.js');
  assert.doesNotMatch(requests, /requestNeedsRef\(kind, 'project'\)/,
    "ด่านโครงการของคำร้องถูกถอดแล้ว (needs เหลือ 'deal')");
  assert.match(requests, /projectId = dealRow\.projectId \|\| null;/,
    'โครงการยัง derive จากดีลเหมือนเดิม แค่ว่างได้');
});

// ── เหตุระดับทะเบียน (2026-07-27) — สามเหตุที่เคยหายเงียบแม้มีตัวบอกเหตุรอบแรก ──
// ตัวบอกเหตุเดิมค้นได้แค่ในลิสต์ที่ถูกกรองมาแล้ว ลูกค้าที่ถูกกรองออกจึงไม่มีคำอธิบายเลย
const registryCase = (customer) => blockedQuotationCustomers({
  search: 'ลูกค้า',
  customers: [],
  registryCustomers: [{ id: 'CUS-9', name: 'ลูกค้า ก', ...customer }],
  deals: [],
});

test('ลูกค้าตกกลับรออนุมัติ (เช่นถูกแก้ที่อยู่) = บอกเหตุ + ชี้ไปทะเบียนลูกค้า', () => {
  const [row] = registryCase({ approvalStatus: 'pending' });
  assert.equal(row.reasonCode, 'pending_approval');
  assert.match(row.reason, /รออนุมัติ/);
  assert.equal(row.href, '/database/customers');
});

test('ลูกค้าถูกปฏิเสธ / พักใช้ / ทีมอื่นดูแล = แยกเหตุคนละข้อ', () => {
  assert.equal(registryCase({ approvalStatus: 'rejected' })[0].reasonCode, 'rejected');
  assert.equal(registryCase({ approvalStatus: 'approved', isActive: false })[0].reasonCode, 'inactive');
  assert.equal(registryCase({ approvalStatus: 'approved' })[0].reasonCode, 'other_team');
});

test('ลูกค้าที่ยังมองเห็นในลิสต์ไม่ถูกนับซ้ำเป็นเหตุระดับทะเบียน', () => {
  const visible = { id: 'CUS-9', name: 'ลูกค้า ก', approvalStatus: 'approved' };
  const rows = blockedQuotationCustomers({
    search: 'ลูกค้า',
    customers: [visible],
    registryCustomers: [visible],
    deals: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reasonCode, 'no_deal'); // เหตุที่ดีล ไม่ใช่เหตุที่ทะเบียน
});

test('เหตุที่ใกล้ออกใบได้มาก่อนเหตุระดับทะเบียน', () => {
  const rows = blockedQuotationCustomers({
    search: 'ลูกค้า',
    customers: [{ id: 'CUS-1', name: 'ลูกค้า ข', approvalStatus: 'approved' }],
    registryCustomers: [
      { id: 'CUS-1', name: 'ลูกค้า ข', approvalStatus: 'approved' },
      { id: 'CUS-2', name: 'ลูกค้า ค', approvalStatus: 'pending' },
    ],
    // ดีลปิดแล้ว = เหตุระดับดีล ซึ่งต้องมาก่อนเหตุระดับทะเบียนของอีกราย
    deals: [{ id: 'DL-1', customerId: 'CUS-1', canEdit: true, stage: 'won' }],
  });
  assert.deepEqual(rows.map((r) => r.reasonCode), ['closed_stage', 'pending_approval']);
});

/* ── เปลี่ยนลูกค้าของดีล (ฟอร์มแก้ไข) — ด่านที่ PATCH ใช้ ────────────────────
   ของเดิม `PATCH deals/[id]` รับ customerId ดิบ ๆ เข้าคอลัมน์ ⇒ เดินอ้อมด่านของ
   link-project ได้ · prod หลุดจริง 1 ใบ (DL-26080193) เทสต์ชุดนี้ล็อกทุกเงื่อนไข */
const CUS = { id: 'CUS-1', name: 'ลูกค้า ก', approvalStatus: 'approved', isActive: true };
const CUS2 = { id: 'CUS-2', name: 'ลูกค้า ข', approvalStatus: 'approved', isActive: true };

test('เปลี่ยนลูกค้า: ไม่เปลี่ยนอะไร = ผ่าน · ค่าเดิมว่างแล้วเติม = ผ่าน', () => {
  assert.equal(dealCustomerPatchError({ deal: { id: 'D1', customerId: 'CUS-1' }, customer: CUS }), null);
  assert.equal(dealCustomerPatchError({ deal: { id: 'D1' }, customer: CUS }), null);
  assert.equal(dealCustomerPatchError({ deal: { id: 'D1' }, customer: null }), null);
});

test('เปลี่ยนลูกค้า: ดีลปิด Won แล้วห้ามแตะ', () => {
  assert.match(
    dealCustomerPatchError({ deal: { id: 'D1', customerId: 'CUS-1' }, customer: CUS2, isWon: true }),
    /ปิด Won/,
  );
  // เติมช่องว่างของดีล Won ก็ห้าม — ยอดจริงถูกผูกไปแล้ว
  assert.match(dealCustomerPatchError({ deal: { id: 'D1' }, customer: CUS, isWon: true }), /ปิด Won/);
});

test('เปลี่ยนลูกค้า: ต้องมีจริง + ใช้ออกเอกสารได้', () => {
  // 🐞 ขอ id ที่ไม่มีในทะเบียน ต้องตีกลับ ไม่ใช่กลายเป็น "ล้างลูกค้า" เงียบ ๆ
  assert.match(
    dealCustomerPatchError({ deal: { id: 'D1', customerId: 'CUS-1' }, customer: null, requestedId: 'CUS-ไม่มีจริง' }),
    /ไม่พบลูกค้า/,
  );
  assert.match(
    dealCustomerPatchError({ deal: { id: 'D1' }, customer: { ...CUS, isActive: false } }),
    /พักใช้/,
  );
});

test('เปลี่ยนลูกค้า: ห้ามให้ดีลกับโครงการเป็นคนละลูกค้า (เคส DL-26080193)', () => {
  const project = { id: 'PRJ-1', code: 'PJ-26080114', customerId: 'CUS-1', customerName: 'ลูกค้า ก' };
  assert.match(
    dealCustomerPatchError({ deal: { id: 'D1', projectId: 'PRJ-1' }, customer: CUS2, project }),
    /PJ-26080114 เป็นของ ลูกค้า ก/,
  );
  // ตรงกับโครงการ = ผ่าน
  assert.equal(dealCustomerPatchError({ deal: { id: 'D1', projectId: 'PRJ-1' }, customer: CUS, project }), null);
  // ⚠️ ล้างเป็นค่าว่างต้องยังทำได้ทั้งที่ผูกโครงการ — เป็นทางออกจากทางตัน
  // (ล้างลูกค้า → ย้ายโครงการ → ตั้งลูกค้าใหม่) และตรงกับ hasCompatibleProjectCustomer
  assert.equal(
    dealCustomerPatchError({ deal: { id: 'D1', projectId: 'PRJ-1', customerId: 'CUS-1' }, customer: null, project }),
    null,
  );
});

test('เปลี่ยนลูกค้า: มีเอกสารงอกจากดีลแล้ว = ห้ามเปลี่ยน และต้องบอกว่าติดอะไรกี่ใบ', () => {
  const deal = { id: 'D1', customerId: 'CUS-1' };
  const err = dealCustomerPatchError({ deal, customer: CUS2, counts: { quotations: 2, salesOrders: 1 } });
  assert.match(err, /ใบเสนอราคา 2 · ใบสั่งขาย 1/);
  // ดีลที่ยังไม่เคยมีลูกค้า = เติมได้เสมอ ถึงจะมีคำร้องค้างอยู่ก็ตาม
  assert.equal(
    dealCustomerPatchError({ deal: { id: 'D1' }, customer: CUS, counts: { requests: 3 } }),
    null,
  );
  assert.equal(dealAttachmentSummary({ quotations: 0, salesOrders: 0, requests: 0 }), '');
});

test('PATCH ดีลต้องเรียกด่านกลาง ไม่เขียน customerId ดิบ ๆ เข้าคอลัมน์', () => {
  const route = routeSource('sales-planning/deals/[id]/route.js');
  assert.match(route, /dealCustomerPatchError\(/, 'ต้องผ่านด่านกลาง');
  assert.doesNotMatch(
    route,
    /for \(const key of \['customerId', 'customerName'/,
    'customerId/customerName ต้องไม่อยู่ในลูปที่ก๊อป body เข้า patch ตรง ๆ',
  );
  assert.match(route, /patch\.customerName = customer\?\.name \|\| null;/,
    'ชื่อลูกค้าต้องอ่านจากทะเบียน ไม่ใช่รับจาก body');
});
