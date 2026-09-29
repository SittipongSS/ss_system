// ── ใบสั่งขายย้อนหลังฝั่งบริการ (mig 0360 → 0374 · มติ 22/09) — ยามสายไฟที่เทสต์หน่วยมองไม่เห็น ─────────────
//
// ⭐ ตัวตัดสิน (legacySetupQueue · planQueue · bindTargetError · evaluateVisitGate) มีเทสต์หน่วยของตัวเองแล้ว
//   ไฟล์นี้กัน "สายไฟ": select ที่ต้องพกคอลัมน์ที่ตัวตัดสินอ่าน · route ที่ต้องเรียกตัวตัดสินก่อนเขียน ·
//   ตัวโหลดบริบทด่านที่ห้ามกลืน error · จอที่ต้องถามตัวตัดสินตัวเดียวกับ server
// 🔴 คอลัมน์ตกจาก select = ตัวตัดสินได้ undefined แล้วตอบผิดเงียบ ๆ — คิวนี้เจอมาแล้วกับ `serviceContractId`
//    (UAT 2026-09-01: ชิป "ยังไม่ผูกสัญญา" ทุกใบตลอดกาล) · `check:columns` จับได้แค่คอลัมน์ที่ไม่มีในฐาน
//    ไม่ใช่คอลัมน์ที่ลืมเลือก
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const selectOf = (src, table) => {
  const hit = src.match(new RegExp(`from\\(\\s*'${table}'\\s*\\)\\s*\\.select\\('([^']*)'`));
  assert.ok(hit, `หา select ของ ${table} ไม่เจอ`);
  return hit[1];
};

test('คิวงานเข้าใหม่: ใบพก origin + เลขเดิม + ยอด (ตัดสินใบ ฿0) · บรรทัดพกจุดติดตั้ง · ถังตั้งรอบได้งวด', () => {
  const route = code('app/api/service/intake/route.js');
  const orders = selectOf(route, 'sales_orders');
  for (const col of ['origin', '"historicalQuoteRef"', '"historicalExpressRef"', '"historicalInvoiceRef"', '"totalAmount"']) {
    assert.ok(orders.includes(col), `select ของใบต้องมี ${col}`);
  }
  // มติ 22/09 (0374) ถอดสวิตช์ยกเว้นด่านเงิน — ร่องรอยของ 0360 ต้องไม่ถูกอ่านอีก
  assert.ok(!orders.includes('paymentGateExemptAt'), 'ห้ามอ่านร่องรอยยกเว้นของ 0360 อีก');
  assert.ok(selectOf(route, 'sales_order_lines').includes('"installationPoint"'));
  // ⭐ แถวรอตั้งรอบพก "เงินครอบถึง" — ต้องส่งงวดชุดเดียวกับชิปของถังผูกโซนเข้า planQueue
  assert.match(route, /planQueue\(\{[^}]*installmentsByOrderId[^}]*\}\)/);
  // 🔒 ยอดของใบไม่ออกไปกับ response — ส่งออกเฉพาะแถวคิวที่ตัวตัดสินประกอบแล้ว (ไม่มี orders/ordersById ดิบ)
  const reply = route.slice(route.indexOf('return ok({'), route.indexOf('});', route.indexOf('return ok({')));
  assert.ok(reply.length > 0, 'หา response ของ route ไม่เจอ');
  assert.doesNotMatch(reply, /\borders\b|ordersById/);
});

/* ── ถังใบเดิม (mig 0392 · D14) — ตัวตัดสินอ่านคอลัมน์ 0392 ทั้งหมด · ขาดคอลัมน์ = ตอบผิดเงียบ ────────────
   🔴 `serviceTermsOpenedAt` ตกจาก select = ใบที่เปิดงานให้ TS แล้วกลับมาโผล่ในถังใบเดิม (ตัวถังโยนให้อยู่แล้ว
      แต่ยามนี้จับได้ก่อนรัน) · ความคืบหน้าอ่านชนิด/แพ็คเกจ/หมวดของบรรทัด · สรุป "ยื่นแล้ว" อ่านโซนที่ฝ่ายขายเลือก */
test('คิวงานเข้าใหม่ (ถังใบเดิม): select พกคอลัมน์ 0392 · อ่านโซนที่เลือกแบบซอยก้อน · ส่งเข้า legacySetupQueue', () => {
  const route = code('app/api/service/intake/route.js');
  const orders = selectOf(route, 'sales_orders');
  for (const col of ['"serviceTermsOpenedAt"', '"serviceSetupState"', '"serviceSetupSubmittedAt"', '"serviceSetupSubmittedByName"',
    '"serviceSetupRejectedAt"', '"serviceSetupRejectedByName"', '"serviceSetupRejectedReason"', '"servicePeriodFrom"', '"updatedAt"']) {
    assert.ok(orders.includes(col), `select ของใบต้องมี ${col}`);
  }
  const lines = selectOf(route, 'sales_order_lines');
  for (const col of ['"serviceKind"', '"serviceProductId"', '"serviceFgCode"', 'metadata', '"serviceRounds"']) {
    assert.ok(lines.includes(col), `select ของบรรทัดต้องมี ${col}`);
  }
  // 🔒 ฝ่ายบริการไม่เห็นราคา — บรรทัดไม่ดึงราคา/ส่วนลด
  assert.doesNotMatch(lines, /unitPrice|discount|lineTotal/);
  assert.ok(selectOf(route, 'sales_deals').includes('"ownerName"'), 'ผู้ดูแลฝ่ายขาย = เจ้าของดีลปัจจุบัน');
  const allocations = selectOf(route, 'sales_order_line_zones');
  for (const col of ['"salesOrderId"', '"salesOrderLineId"', '"zoneId"', '"packsPerRound"']) assert.ok(allocations.includes(col), col);
  assert.match(route, /fetchAllInChunks\(legacyCandidateIds, \(chunk\) => supabase\.from\('sales_order_line_zones'\)/,
    'ซอยก้อน + ไล่หน้า เฉพาะใบที่ยังไม่ประทับ');
  assert.match(route, /legacySetupQueue\(\{[^}]*allocations[^}]*zonesById/);
  assert.doesNotMatch(route, /bindQueue/, 'ถังผูกโซนของ TS ถอดแล้ว');
  // คีย์ response คงชื่อเดิม (หน้า/ลิงก์เดิม) แต่แถวเป็นทรงของถังใบเดิม
  assert.match(route, /bind: legacy\.rows,/);
  assert.match(route, /intakeCounts\(\{ legacy, plan, visit \}\)/);
});

/* 🔒 ทางผูกโซนของ TS ปิดแล้ว (mig 0392 · D14) — term ที่ไม่ได้เกิดจาก 0392 (id ไม่ขึ้นต้น SZT-S) ทำให้การเปิด
   งานบริการของใบนั้นถูกปฏิเสธ (D29) ⇒ ทางนี้ต้องตอบ 409 **ก่อนอ่านอะไรทั้งสิ้น** และไม่มีทางเขียนเหลืออยู่ */
test('ผูกโซน: ปิดแล้ว — ตอบ 409 พร้อมทางไปต่อเป็นไทย · ไม่อ่าน ไม่เขียนอะไรเลย', async () => {
  const route = code('app/api/service/intake/bind/route.js');
  assert.doesNotMatch(route, /\.from\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(|recordAudit|req\.json/, 'ห้ามแตะฐานข้อมูลหรืออ่าน body');
  // ด่านสิทธิ์จากตัวผู้ใช้ล้วน (กฎ 1 ของ systemRules) แล้วตอบ 409 ทันที — ไม่มีอะไรคั่นระหว่างสองบรรทัด
  assert.match(route, /export const POST = withUser\(async \(\{ user \}\) => \{\s*const access = requireService\(\{ user \}\);\s*if \(access\.response\) return access\.response;\s*return conflict\(BIND_RETIRED_MESSAGE\);\s*\}\);/);
  assert.match(route, /'ปิดทางผูกโซนของ TS แล้ว — ฝ่ายขายตั้งงานบริการที่หน้าใบสั่งขาย แล้วผู้จัดการฝ่ายขายตรวจ · ใบที่อนุมัติแล้วขึ้น ‘รอตั้งรอบ’ เอง'/);
  assert.doesNotMatch(route, /export const (GET|PUT|PATCH|DELETE)\b/, 'ไม่มีเมธอดอื่นเปิดทางกลับมา');
});

test('🔴 บริบทด่านเข้าไซต์: เลือก origin + totalAmount · ยอดจริงไม่ออกไปกับบริบท · ไม่กลืน error ของทั้งสามก้อน', () => {
  const src = code('lib/service/gateContext.js');
  const orders = selectOf(src, 'sales_orders');
  assert.ok(orders.includes('origin') && orders.includes('"totalAmount"'));
  assert.ok(!orders.includes('paymentGateExemptAt'), 'ร่องรอยยกเว้นของ 0360 ไม่มีใครอ่านแล้ว');
  // บริบทถูกส่งถึงจอฝ่ายบริการทั้งก้อน ⇒ เหลือแค่คำตอบของด่าน (0 = ใบยอด 0 · null = ไม่รู้/มียอด)
  assert.match(src, /ordersById\[o\.id\] = \{ \.\.\.o, totalAmount: paymentNotRequired\(o\.totalAmount\) \? 0 : null \};/);
  const loads = src.match(/const \{[^}]*\} = await fetchInChunks\(/g) || [];
  assert.equal(loads.length, 3, 'ใบ · งวด · สัญญา');
  for (const load of loads) assert.match(load, /error:/, `ต้องรับ error: ${load}`);
  for (const name of ['orderError', 'installmentError', 'contractError']) {
    assert.match(src, new RegExp(`if \\(${name}\\) throw ${name};`), name);
  }
});

test('บริบทด่านเข้าไซต์ (พฤติกรรม): ใบยอด 0 ส่งออกเป็น 0 · ใบที่มียอดส่งออกเป็น null — ด่านข้อ② ตอบตรงกับยอดจริง', async () => {
  const { loadVisitGateContext } = await import('./gateContext.js');
  const { evaluateVisitGate } = await import('./visitGate.js');
  const tables = {
    service_zones: [{ id: 'Z1', siteId: 'S1', name: 'ล็อบบี้' }, { id: 'Z2', siteId: 'S2', name: 'ล็อบบี้' }],
    service_zone_terms: [
      { id: 'T1', zoneId: 'Z1', salesOrderId: 'SO0', createdAt: '2026-09-01' },
      { id: 'T2', zoneId: 'Z2', salesOrderId: 'SO9', createdAt: '2026-09-01' },
    ],
    sales_orders: [
      { id: 'SO0', status: 'approved', supersededById: null, serviceContractId: 'CT1', origin: 'historical', totalAmount: 0 },
      { id: 'SO9', status: 'approved', supersededById: null, serviceContractId: 'CT1', origin: 'pipeline', totalAmount: 261936 },
    ],
    sales_order_installments: [],
    sales_contracts: [{ id: 'CT1', status: 'signed', effectiveDate: '2026-01-01', expiryDate: '2026-12-31' }],
  };
  const supabase = {
    from(table) {
      const filters = [];
      let range = null;
      const q = {
        select: () => q,
        in: (col, values) => { filters.push((r) => values.includes(r[col])); return q; },
        eq: (col, value) => { filters.push((r) => r[col] === value); return q; },
        order: () => q,
        range: (a, b) => { range = [a, b]; return q; },
        then: (resolve, reject) => Promise.resolve().then(() => {
          const rows = (tables[table] || []).filter((r) => filters.every((keep) => keep(r)));
          return { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
        }).then(resolve, reject),
      };
      return q;
    },
  };
  const ctx = await loadVisitGateContext(supabase, ['S1', 'S2']);
  assert.equal(ctx.ordersById.SO0.totalAmount, 0);
  assert.equal(ctx.ordersById.SO9.totalAmount, null, '🔒 ยอดจริงของใบห้ามออกไปกับบริบทด่าน');
  assert.ok(!JSON.stringify(ctx).includes('261936'));
  const visit = { assigneeId: 'U1', scheduledDate: '2026-08-27', kind: 'refill' };
  const paymentOf = (siteId) => evaluateVisitGate(visit, {
    zones: ctx.zonesBySite[siteId], terms: ctx.termsBySite[siteId], ordersById: ctx.ordersById,
    installmentsByOrderId: ctx.installmentsByOrderId, contractsById: ctx.contractsById,
  }).find((i) => i.key === 'payment');
  assert.equal(paymentOf('S1').state, 'ok', 'ใบยอด 0 ผ่านข้อ② เอง');
  assert.equal(paymentOf('S2').state, 'blocked', 'ใบที่มียอดแต่ไม่มีงวดรับรองต้องติด');
});

test('ด่านเข้าไซต์: ใบยอด 0 ผ่านเฉพาะข้อ② ผ่าน paymentNotRequired — ไม่แตะข้อ① และไม่อ่านร่องรอยยกเว้นอีก', () => {
  const src = code('lib/service/visitGate.js');
  const linked = src.indexOf('const linked = live.filter(');
  const paid = src.indexOf('const paid = covered.filter(');
  const zero = src.indexOf('paymentNotRequired(pick(ordersById, t.salesOrderId)?.totalAmount)');
  assert.ok(linked > 0 && zero > linked && paid > zero, 'ตัวตัดสินใบ ฿0 ต้องอยู่ที่ข้อเงิน หลังข้อสัญญา');
  assert.doesNotMatch(src.slice(0, linked), /paymentNotRequired\(/, 'ห้ามปล่อยผ่านก่อนถึงข้อสัญญา');
  assert.match(src, /if \(noPaymentStep\(t\)\) return true;/);
  assert.doesNotMatch(src, /paymentGateExemptAt|historicalGateExempt/, 'สวิตช์ยกเว้นของ 0360 ถอดแล้ว (มติ 22/09)');
  assert.match(src, /import \{ paymentNotRequired \} from '@\/lib\/sales\/salesOrderPayments';/);
});

/* 🔄 mig 0392 (D14): วิซาร์ดรับใบสั่งขายของ TS ถูกถอดทั้งไฟล์ — ด่านปลายทาง (`bindTargetError`) ย้ายไปถามที่
   ตัวตัดสินงานบริการของใบสั่งขาย (serviceSetup.js · มีเทสต์ของตัวเอง) */
test('wizard: ถอดแล้ว — ไฟล์ต้องไม่อยู่ และหน้างานเข้าใหม่ไม่เรียก/ไม่ยิงทางผูกโซน', () => {
  assert.equal(existsSync('src/components/service/IntakeWizard.js'), false, 'IntakeWizard.js ต้องถูกลบ');
  assert.equal(existsSync('src/components/service/IntakeWizard.module.css'), false, 'IntakeWizard.module.css ต้องถูกลบ');
  const page = code('app/service/intake/page.js');
  assert.doesNotMatch(page, /IntakeWizard|\/api\/service\/intake\/bind|bindOrder|รับเข้าไซต์/);
});

test('หน้างานเข้าใหม่: ป้าย "ย้อนหลัง" ตัดสินด้วย isHistoricalOrder · ชิปใบ ฿0 อ่านจาก readiness.paymentNotRequired', () => {
  const src = code('app/service/intake/page.js');
  assert.match(src, /isHistoricalOrder\(row\) && \(\s*<span className="cell-sub">\s*<StatusBadge tone="info" size="sm" label="ย้อนหลัง" \/>/);
  // ชิปอยู่ใน PaidBadge (#1720 แยกคอมโพเนนต์ให้ตาราง + การ์ดใช้ร่วม) — ใบ ฿0 = ไม่มีงวดให้เก็บ (ตัวตัดสินเดียวกับ visitGate ข้อ②)
  assert.match(src, /function PaidBadge\(\{ readiness, label = "จ่ายถึง" \}\) \{[\s\S]{0,600}readiness\?\.paymentNotRequired[\s\S]{0,80}label="ไม่มีงวดให้เก็บ"/);
  assert.doesNotMatch(src, /paymentGateExempt|ยกเว้นด่านเงิน/, 'ชิปยกเว้นของ 0360 ถอดแล้ว (มติ 22/09)');
  /* 🔄 mig 0392: แท็บใบเดิมไม่มีชิปเงินและไม่มีป้าย "ย้อนหลัง" (ใบ pipeline ทั้งหมดโดยนิยาม) ⇒ เหลือเฉพาะถังตั้งรอบ
     (ตาราง + การ์ด · มติ 22/09 ม็อก TsIntake) */
  assert.equal((src.match(/label="ย้อนหลัง"/g) || []).length, 2, 'ป้ายย้อนหลังขึ้นเฉพาะตาราง + การ์ดของถังตั้งรอบ');
  assert.doesNotMatch(src, /<PaidBadge readiness=\{row\.readiness\} \/>/, 'แท็บใบเดิมไม่มีชิปเงิน');
});

/* ── แท็บใบเดิม (mig 0392 · D14 · ม็อก TsIntakeLegacy) — ดูอย่างเดียว ───────────────────────────────── */
test('หน้างานเข้าใหม่: แท็บใบเดิมดูอย่างเดียว · ตัวกรองสถานะพร้อมตัวเลข · ค้นหาปิด autocomplete · ตาราง + การ์ดใช้เซลล์สถานะตัวเดียว', () => {
  const src = code('app/service/intake/page.js');
  assert.match(src, /const LEGACY_PANEL_TITLE = "รายการรอฝ่ายขายตั้งงานบริการ";/);
  assert.match(src, /const LEGACY_PANEL_SUB = "ดูอย่างเดียว — แพ็คเกจ · ไปกี่รอบ · โซน · แต่ละครั้งกี่แพ็ค · ช่วงบริการ ฝ่ายขายตั้งที่หน้าใบสั่งขาย";/);
  for (const head of ['ใบสั่งขาย · ลูกค้า', 'อนุมัติเมื่อ', 'ผู้ดูแลฝ่ายขาย', 'สถานะการตั้งงานบริการ', 'สัญญา']) {
    assert.ok(src.includes(`>${head}</th>`), head);
  }
  assert.equal((src.match(/<LegacySetupStatus row=\{row\} \/>/g) || []).length, 2, 'ตาราง + การ์ด');
  assert.equal((src.match(/href=\{`\/sa\/sales-orders\/\$\{row\.orderId\}`\}/g) || []).length, 2, 'ลิงก์เปิดใบสั่งขายทั้งสองมุมมอง');
  assert.match(src, /<Input\s+autoComplete="off"\s+value=\{search\}/);
  assert.match(src, /count: showCounts \? legacyCounts\[key\] : null,/);
  assert.match(src, /legacySetupHaystack\(row\)\.includes\(needle\)/, 'ค้นหาด้วยคำที่ตาเห็นบนแถว');
  // ดูอย่างเดียว — ไม่มีปุ่มกระทำในแท็บนี้
  const legacy = src.slice(src.indexOf('{tab === "bind" && (\n              legacyRows.length === 0'), src.indexOf('{tab === "plan" && ('));
  assert.ok(legacy.length > 200, 'หาก้อนแท็บใบเดิมไม่เจอ');
  assert.doesNotMatch(legacy, /<Button\b|onClick=\{\(\) => open|PaidBadge|ย้อนหลัง/);
});

/* ── ถังตั้งรอบ: ใบย้อนหลังมาถึง TS ที่นี่ครั้งแรก (มติ 22/09 · mig 0374) ────────────────────
   ⭐ รอบขายเกิดตอน AE Sup อนุมัติ ⇒ ใบย้อนหลังไม่ผ่านถังผูกโซน · TS ต้องเห็น "เงินครอบถึง" ตั้งแต่ตอนตั้งรอบ
      และป้ายบนเมนูต้องนับถังนี้ ไม่งั้นใบมาถึงแบบไม่มีสัญญาณ */
test('หน้างานเข้าใหม่: ถังตั้งรอบโชว์ "เงินครอบถึง" ด้วย PaidBadge ตัวเดียวกัน · โน้ตโซนผูกแล้ว · แท็บตั้งต้น = รอตั้งรอบ', () => {
  const src = code('app/service/intake/page.js');
  assert.equal((src.match(/<PaidBadge readiness=\{row\} label="เงินครอบถึง" \/>/g) || []).length, 2, 'ตาราง + การ์ดของถังตั้งรอบ');
  assert.match(src, /<th scope="col">เงินครอบถึง<\/th>/);
  // โน้ตขึ้นเฉพาะแท็บตั้งรอบที่มีใบย้อนหลังจริง · ไม่ชี้ไปหาถัง "รอตั้งไซต์/โซน" ที่ถอดแล้ว (mig 0392)
  assert.match(src, /showCounts && tab === "plan" && historicalPlanOrders\.length > 0 && \(/);
  assert.match(src, /โซนผูกจากฝ่ายขายตอนคีย์ใบแล้ว — ใบย้อนหลังขึ้นที่ ‘รอตั้งรอบ’ ตรง ๆ/);
  assert.doesNotMatch(src, /รอตั้งไซต์\/โซน/);
  /* 🔄 mig 0392 (D14): แท็บตั้งต้นคือ "รอตั้งรอบ" เสมอ — ตัวสลับแท็บอัตโนมัติ (มติ 22/09) ถอดแล้ว
     เพราะถังผูกโซนที่มันหลบไม่มีแล้ว */
  assert.match(src, /const \[tab, setTab\] = useState\("plan"\);/);
  assert.doesNotMatch(src, /autoTabDone/);
  assert.doesNotMatch(src, /setTab\(\(current\) => \(current === "bind" \? "plan" : current\)\)/);
  assert.match(src, /subtitle="ใบสั่งขายสายบริการที่อนุมัติแล้ว — ใบใหม่มาพร้อมโซนและรอบ · ใบเดิมรอฝ่ายขายตั้งงานบริการ"/);
});

/* 🔄 mig 0392 (D14 · [owner]): ป้ายนับเฉพาะ "รอตั้งรอบ" — ถังผูกโซนถอดแล้ว · ถังใบเดิมเป็นงานของฝ่ายขาย (ไม่ใช่ TS)
   ⚠️ literal `return plan.length;` ตกลงร่วมกับ U4 (เจ้าของ nav/counts) — แก้ฝั่งเดียว = แดง */
test('ป้ายงานเข้าใหม่บนเมนูนับเฉพาะถังตั้งรอบ — ตัวเดียวกับตัวเลขบนแท็บ "รอตั้งรอบ"', () => {
  const route = code('app/api/nav/counts/route.js');
  const job = route.slice(route.indexOf("attempt('serviceIntake'"), route.indexOf("attempt('payments'"));
  assert.match(job, /return plan\.length;/);
  assert.doesNotMatch(job, /bindQueue|bind\.rows/);
  assert.ok(selectOf(job, 'service_zones').includes('"siteId"'));
  assert.ok(selectOf(job, 'service_plans').includes('"salesOrderId"'));
});
