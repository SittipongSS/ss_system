// ── ใบสั่งขายย้อนหลังฝั่งบริการ (mig 0360 → 0374 · มติ 22/09) — ยามสายไฟที่เทสต์หน่วยมองไม่เห็น ─────────────
//
// ⭐ ตัวตัดสิน (fgSummary · bindQueue · bindTargetError · evaluateVisitGate) มีเทสต์หน่วยของตัวเองแล้ว
//   ไฟล์นี้กัน "สายไฟ": select ที่ต้องพกคอลัมน์ที่ตัวตัดสินอ่าน · route ที่ต้องเรียกตัวตัดสินก่อนเขียน ·
//   ตัวโหลดบริบทด่านที่ห้ามกลืน error · จอที่ต้องถามตัวตัดสินตัวเดียวกับ server
// 🔴 คอลัมน์ตกจาก select = ตัวตัดสินได้ undefined แล้วตอบผิดเงียบ ๆ — คิวนี้เจอมาแล้วกับ `serviceContractId`
//    (UAT 2026-09-01: ชิป "ยังไม่ผูกสัญญา" ทุกใบตลอดกาล) · `check:columns` จับได้แค่คอลัมน์ที่ไม่มีในฐาน
//    ไม่ใช่คอลัมน์ที่ลืมเลือก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('ผูกโซน: ตรวจปลายทางด้วย bindTargetError ก่อนเขียน · ตัดวันของ term จาก body · audit รายแถวพกจุดติดตั้ง', () => {
  const route = code('app/api/service/intake/bind/route.js');
  const sites = selectOf(route, 'service_sites');
  for (const col of ['"customerId"', 'kind', '"isActive"']) assert.ok(sites.includes(col), `select ไซต์ต้องมี ${col}`);
  assert.ok(selectOf(route, 'service_zones').includes('"isActive"'));
  assert.ok(selectOf(route, 'sales_order_lines').includes('"installationPoint"'));
  const check = route.indexOf('bindTargetError(');
  const insert = route.indexOf(".from('service_zone_terms').insert(");
  assert.ok(check > 0 && insert > check, 'ต้องตรวจปลายทางก่อน insert ทั้งชุด');
  /* เรียกตัวตัดสินแล้วทิ้งผล = ด่านหายเงียบ ⇒ ตรึงการตีกลับเองด้วย */
  const guard = route.indexOf('if (targetError) return badRequest(targetError);');
  assert.ok(guard > check && guard < insert, 'ต้องตีกลับทันทีเมื่อปลายทางผิด ก่อน insert');
  assert.match(route, /delete safeRow\.startDate;\s*delete safeRow\.endDate;/);
  assert.match(route, /normalizeTermInput\(\{\s*\.\.\.snapshot,\s*\.\.\.safeRow,/);
  assert.doesNotMatch(route, /\.\.\.row,/, 'ห้ามกระจาย body ดิบลง normalizeTermInput');
  assert.match(route, /installationPoint: linesById\.get\(t\.salesOrderLineId\)\?\.installationPoint \?\? null/);
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

test('wizard: ใบย้อนหลังชี้ไป "เพิ่มไซต์ย้อนหลัง" ด้วยลิงก์ (ไม่ฝังโมดัล) · ถามด่านปลายทางตัวเดียวกับ server ก่อนส่ง', () => {
  const src = code('components/service/IntakeWizard.js');
  assert.match(src, /const historical = isHistoricalOrder\(order\);/);
  const links = src.match(/<Link href="\/database\/sites" className=\{styles\.siteLink\}>เพิ่มไซต์ย้อนหลัง<\/Link>/g) || [];
  assert.equal(links.length, 2, 'สองจุดที่เคยชี้ทางใบคำร้องประเมินพื้นที่');
  assert.doesNotMatch(src, /LegacySiteModal/, 'โมดัลอยู่หลังสิทธิ์ของหน้าทะเบียนไซต์ (siteOrigin.test)');
  const ask = src.indexOf('bindTargetError(');
  assert.ok(ask > 0 && ask < src.indexOf('await onDone('), 'ต้องถามก่อนส่ง');
  /* ถามแล้วไม่หยุด = เหตุโผล่หลัง server ตีกลับ (ปุ่มกับด่านไม่ตรงกัน) ⇒ ตรึงการหยุดก่อนส่ง */
  const stop = src.search(/if \(targetErrors\.length\) \{\s*setError\(\[\.\.\.new Set\(targetErrors\)\]\.join\(" · "\)\);\s*return;\s*\}/);
  assert.ok(stop > ask && stop < src.indexOf('await onDone('), 'ต้องหยุดก่อนส่งเมื่อปลายทางผิด');
  assert.match(src, /\{group\.installationPoint && \(/);
});

test('หน้างานเข้าใหม่: ป้าย "ย้อนหลัง" ตัดสินด้วย isHistoricalOrder · ชิปใบ ฿0 อ่านจาก readiness.paymentNotRequired', () => {
  const src = code('app/service/intake/page.js');
  assert.match(src, /isHistoricalOrder\(row\) && \(\s*<span className="cell-sub">\s*<StatusBadge tone="info" size="sm" label="ย้อนหลัง" \/>/);
  // ชิปอยู่ใน PaidBadge (#1720 แยกคอมโพเนนต์ให้ตาราง + การ์ดใช้ร่วม) — ใบ ฿0 = ไม่มีงวดให้เก็บ (ตัวตัดสินเดียวกับ visitGate ข้อ②)
  assert.match(src, /function PaidBadge\(\{ readiness, label = "จ่ายถึง" \}\) \{[\s\S]{0,600}readiness\?\.paymentNotRequired[\s\S]{0,80}label="ไม่มีงวดให้เก็บ"/);
  assert.doesNotMatch(src, /paymentGateExempt|ยกเว้นด่านเงิน/, 'ชิปยกเว้นของ 0360 ถอดแล้ว (มติ 22/09)');
  assert.equal((src.match(/<PaidBadge readiness=\{row\.readiness\} \/>/g) || []).length >= 2, true, 'ตารางและการ์ดใช้ PaidBadge ตัวเดียวกัน');
  // ถังผูกโซนสองจุด (ตาราง + การ์ด) + ถังตั้งรอบสองจุด (ตาราง + การ์ด · มติ 22/09 ม็อก TsIntake)
  assert.equal((src.match(/label="ย้อนหลัง"/g) || []).length, 4, 'ป้ายย้อนหลังขึ้นทั้งตารางและการ์ดของสองถัง');
});

/* ── ถังตั้งรอบ: ใบย้อนหลังมาถึง TS ที่นี่ครั้งแรก (มติ 22/09 · mig 0374) ────────────────────
   ⭐ รอบขายเกิดตอน AE Sup อนุมัติ ⇒ ใบย้อนหลังไม่ผ่านถังผูกโซน · TS ต้องเห็น "เงินครอบถึง" ตั้งแต่ตอนตั้งรอบ
      และป้ายบนเมนูต้องนับถังนี้ ไม่งั้นใบมาถึงแบบไม่มีสัญญาณ */
test('หน้างานเข้าใหม่: ถังตั้งรอบโชว์ "เงินครอบถึง" ด้วย PaidBadge ตัวเดียวกัน · โน้ตโซนผูกแล้ว · เปิดแท็บแรกที่มีงานครั้งเดียว', () => {
  const src = code('app/service/intake/page.js');
  assert.equal((src.match(/<PaidBadge readiness=\{row\} label="เงินครอบถึง" \/>/g) || []).length, 2, 'ตาราง + การ์ดของถังตั้งรอบ');
  assert.match(src, /<th scope="col">เงินครอบถึง<\/th>/);
  // โน้ตขึ้นเฉพาะแท็บตั้งรอบที่มีใบย้อนหลังจริง
  assert.match(src, /showCounts && tab === "plan" && historicalPlanOrders\.length > 0 && \(/);
  assert.match(src, /โซนผูกจากฝ่ายขายตอนคีย์ใบแล้ว — ใบย้อนหลังไม่ต้องผ่าน “รอตั้งไซต์\/โซน”/);
  // สลับแท็บครั้งเดียวหลังโหลดสำเร็จครั้งแรก · ไม่ทับแท็บที่คนเลือกเอง
  assert.match(src, /if \(!autoTabDone\.current\) \{\s*autoTabDone\.current = true;/);
  assert.match(src, /setTab\(\(current\) => \(current === "bind" \? "plan" : current\)\)/);
});

test('ป้ายงานเข้าใหม่บนเมนูนับถังตั้งรอบด้วย — ใบย้อนหลังไม่ผ่านถังผูกโซน', () => {
  const route = code('app/api/nav/counts/route.js');
  const job = route.slice(route.indexOf("attempt('serviceIntake'"), route.indexOf("attempt('payments'"));
  assert.match(job, /return bind\.rows\.length \+ plan\.length;/);
  assert.ok(selectOf(job, 'service_zones').includes('"siteId"'));
  assert.ok(selectOf(job, 'service_plans').includes('"salesOrderId"'));
});
