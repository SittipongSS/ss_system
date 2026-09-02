// ── FC ของดีลเดินตามใบเสนอราคา (mig 0337 — มติผู้ใช้ 2026-09-02) ─────────────
//
// ทุกเคสในไฟล์นี้เคยเป็นคำถามที่ตอบผิดแล้วตัวเลข FC ทั้งบริษัทเพี้ยน:
//   · ร่างขยับ FC   → FC กระตุกตามคนที่กำลังพิมพ์ใบ
//   · นับใบ revised → นับซ้ำทุกใบที่เคยแก้ (ของจริง 69 ใบ)
//   · รวมหลายใบ    → ดีล ททท มี 5 ใบยอด 607,000 เท่ากัน รวมได้ 3,035,000
//   · เลือกใบใหม่สุด → ดีล Jim Thompson เสนอ 3 ขนาด ใบใหม่สุดคือขนาดเล็กสุด
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  eligibleForecastQuotations,
  forecastSourceView,
  isForecastEligibleQuotation,
  resolveForecastSource,
} from './forecastSource.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const deal = (over = {}) => ({
  id: 'DEAL-1',
  stage: 'quotation',
  projectValue: 500000,
  forecastManualValue: 500000,
  forecastSource: 'manual',
  forecastQuotationId: null,
  forecastPinnedAt: null,
  ...over,
});

// ยอดใบ = totalAmount − vatAmount ⇒ ใบนี้เข้า FC ที่ 1,000,000
const quote = (over = {}) => ({
  id: 'QT1',
  quoteNumber: 'QT-26090001-0',
  baseNumber: 'QT-26090001',
  revisionNo: 0,
  status: 'sent',
  approvalStatus: 'approved',
  totalAmount: 1070000,
  vatAmount: 70000,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

test('ร่างและใบที่รออนุมัติไม่มีสิทธิ์เป็นแหล่ง FC', () => {
  assert.equal(isForecastEligibleQuotation(quote({ status: 'draft', approvalStatus: 'not_submitted' })), false);
  assert.equal(isForecastEligibleQuotation(quote({ status: 'draft', approvalStatus: 'pending' })), false);
  const resolved = resolveForecastSource(deal(), [quote({ status: 'draft', approvalStatus: 'pending' })]);
  assert.equal(resolved.source, 'manual');
  assert.equal(resolved.value, 500000);
  assert.equal(resolved.changed, false);
});

test('ใบที่ถูกยกเลิก/ตีกลับ/แทนที่ด้วยฉบับแก้ ไม่นับ', () => {
  for (const status of ['cancelled', 'rejected', 'revised', 'closed']) {
    assert.equal(isForecastEligibleQuotation(quote({ status })), false, status);
  }
  assert.equal(isForecastEligibleQuotation(quote({ approvalStatus: 'pending' })), false);
  assert.equal(isForecastEligibleQuotation(quote({ approvalStatus: 'not_required' })), true);
});

test('ใบอนุมัติฉบับเดียว = FC เดินตามใบ ยอดก่อน VAT', () => {
  const resolved = resolveForecastSource(deal(), [quote()]);
  assert.equal(resolved.source, 'quotation');
  assert.equal(resolved.quotationId, 'QT1');
  assert.equal(resolved.value, 1000000);
  assert.equal(resolved.reason, 'single');
  assert.equal(resolved.changed, true);
});

test('ยอดที่ AE กรอกไม่ถูกทับ — ถอยกลับได้เสมอเมื่อใบหลุดสิทธิ์', () => {
  const followed = deal({
    forecastSource: 'quotation', forecastQuotationId: 'QT1', projectValue: 1000000,
  });
  const resolved = resolveForecastSource(followed, [quote({ status: 'cancelled' })]);
  assert.equal(resolved.source, 'manual');
  assert.equal(resolved.value, 500000, 'ต้องคืนยอดที่ AE กรอกไว้ ไม่ใช่ 0');
  assert.equal(resolved.reason, 'pointer_gone');
});

test('ฉบับแก้ของเลขที่เดิม = ตัวชี้ขยับตามเอง ไม่ต้องถาม', () => {
  const followed = deal({
    forecastSource: 'quotation', forecastQuotationId: 'QT1', projectValue: 1000000,
  });
  const rev1 = quote({
    id: 'QT1R1', quoteNumber: 'QT-26090001-1', revisionNo: 1,
    totalAmount: 1284000, vatAmount: 84000, createdAt: '2026-09-05T00:00:00.000Z',
  });
  const resolved = resolveForecastSource(followed, [quote({ status: 'revised' }), rev1]);
  assert.equal(resolved.quotationId, 'QT1R1');
  assert.equal(resolved.value, 1200000);
  assert.equal(resolved.reason, 'revision');
});

test('ระหว่างรอฉบับแก้อนุมัติ FC ค้างที่ยอดเดิม ไม่ตกกลับ manual', () => {
  const followed = deal({
    forecastSource: 'quotation', forecastQuotationId: 'QT1', projectValue: 1000000,
  });
  // แถวเดิมพลิกเป็น revised ทันทีที่กดสร้าง Rev. — ฉบับใหม่ยังเป็นร่าง
  const draftRev = quote({
    id: 'QT1R1', revisionNo: 1, status: 'draft', approvalStatus: 'not_submitted',
  });
  const resolved = resolveForecastSource(followed, [quote({ status: 'revised' }), draftRev]);
  assert.equal(resolved.value, 1000000, 'ยอดเดิมต้องค้าง ไม่แกว่งตามการกดแก้ใบ');
  assert.equal(resolved.source, 'quotation');
  assert.equal(resolved.quotationId, 'QT1');
  assert.equal(resolved.reason, 'awaiting_revision');
  assert.equal(resolved.changed, false);
});

test('ใบที่ชี้อยู่ถูกยกเลิกทิ้ง (ไม่มีฉบับแก้ตามมา) = ถอย manual จริง ๆ', () => {
  const followed = deal({
    forecastSource: 'quotation', forecastQuotationId: 'QT1', projectValue: 1000000,
  });
  const resolved = resolveForecastSource(followed, [quote({ status: 'cancelled' })]);
  assert.equal(resolved.source, 'manual');
  assert.equal(resolved.value, 500000);
  assert.equal(resolved.reason, 'pointer_gone');
});

test('หลายเลขที่ = ไม่เดา ไม่รวม ไม่เลือกใบใหม่สุด', () => {
  const a = quote({ id: 'A', quoteNumber: 'QT-26080095-0', baseNumber: 'QT-26080095', totalAmount: 818550, vatAmount: 53550, createdAt: '2026-08-01T00:00:00.000Z' });
  const b = quote({ id: 'B', quoteNumber: 'QT-26080096-0', baseNumber: 'QT-26080096', totalAmount: 497550, vatAmount: 32550, createdAt: '2026-08-02T00:00:00.000Z' });
  const c = quote({ id: 'C', quoteNumber: 'QT-26080097-0', baseNumber: 'QT-26080097', totalAmount: 327420, vatAmount: 21420, createdAt: '2026-08-03T00:00:00.000Z' });
  const resolved = resolveForecastSource(deal(), [a, b, c]);
  assert.equal(resolved.reason, 'ambiguous');
  assert.equal(resolved.ambiguous, true);
  assert.equal(resolved.source, 'manual');
  assert.equal(resolved.value, 500000, 'ค้างที่ค่าเดิม');
  assert.equal(resolved.changed, false);
  assert.equal(resolved.candidates.length, 3);
  assert.equal(resolved.candidates[0].id, 'C', 'เรียงใหม่ก่อน แต่ไม่ได้แปลว่าชนะ');
});

test('ปักแล้วระบบไม่เลื่อนที่มาให้ แต่ยังเดินตาม Rev. ของใบที่ปัก', () => {
  const pinned = deal({
    forecastSource: 'quotation',
    forecastQuotationId: 'QT1',
    projectValue: 1000000,
    forecastPinnedAt: '2026-09-02T03:00:00.000Z',
  });
  const other = quote({ id: 'B', quoteNumber: 'QT-26090099-0', baseNumber: 'QT-26090099', totalAmount: 2140000, vatAmount: 140000, createdAt: '2026-09-09T00:00:00.000Z' });
  const stay = resolveForecastSource(pinned, [quote(), other]);
  assert.equal(stay.quotationId, 'QT1');
  assert.equal(stay.value, 1000000);
  assert.equal(stay.reason, 'pinned');

  const rev1 = quote({ id: 'QT1R1', quoteNumber: 'QT-26090001-1', revisionNo: 1, totalAmount: 1284000, vatAmount: 84000 });
  const follow = resolveForecastSource(pinned, [quote({ status: 'revised' }), rev1, other]);
  assert.equal(follow.quotationId, 'QT1R1');
  assert.equal(follow.value, 1200000);
  assert.equal(follow.reason, 'revision');
});

test('ปัก manual ไว้ = ใบที่อนุมัติทีหลังไม่แย่ง FC', () => {
  const pinned = deal({ forecastPinnedAt: '2026-09-02T03:00:00.000Z' });
  const resolved = resolveForecastSource(pinned, [quote()]);
  assert.equal(resolved.source, 'manual');
  assert.equal(resolved.value, 500000);
  assert.equal(resolved.reason, 'pinned');
  assert.equal(resolved.changed, false);
});

test('ดีลที่ปิด Won แล้ว FC แช่แข็ง — resolver ไม่แตะ', () => {
  for (const stage of ['won', 'in_project']) {
    const won = deal({ stage, projectValue: 1200000, forecastSource: 'quotation', forecastQuotationId: 'QT1' });
    const resolved = resolveForecastSource(won, [quote({ id: 'B', baseNumber: 'QT-9', quoteNumber: 'QT-9-0', totalAmount: 9999999, vatAmount: 0 })]);
    assert.equal(resolved.changed, false, stage);
    assert.equal(resolved.reason, 'won_frozen');
    assert.equal(resolved.value, 1200000);
  }
});

test('หนึ่งเลขที่ = หนึ่งผู้ท้าชิง (ฉบับแก้ล่าสุดเท่านั้น)', () => {
  const list = eligibleForecastQuotations([
    quote({ id: 'r0', revisionNo: 0, status: 'revised' }),
    quote({ id: 'r1', revisionNo: 1 }),
    quote({ id: 'other', baseNumber: 'QT-26090002', quoteNumber: 'QT-26090002-0' }),
  ]);
  assert.equal(list.length, 2);
  assert.ok(list.some((q) => q.id === 'r1'));
  assert.ok(!list.some((q) => q.id === 'r0'));
});

test('ดีลก่อนไมเกรชันที่ยังไม่มี forecastManualValue ใช้ยอดเดิมเป็นค่าถอยกลับ', () => {
  const legacy = { id: 'D', stage: 'quotation', projectValue: 250000 };
  const resolved = resolveForecastSource(legacy, []);
  assert.equal(resolved.value, 250000);
  assert.equal(resolved.changed, false);
});

test('มุมมองหน้าจอบอกทั้งค่าปัจจุบันและค่าที่รอกดรับ', () => {
  // เคสจริง ODM_NOURA: FC 250,000 แต่ใบเดียวที่อนุมัติคือใบตัวอย่าง 500 บาท
  const view = forecastSourceView(
    deal({ projectValue: 250000, forecastManualValue: 250000 }),
    [quote({ totalAmount: 535, vatAmount: 35 })],
  );
  assert.equal(view.source, 'manual');
  assert.equal(view.value, 250000);
  assert.equal(view.pendingValue, 500);
  assert.equal(view.needsDecision, true, 'ต้องขึ้นคิวให้คนกด ไม่ใช่ทุบเงียบ ๆ');
  assert.equal(view.ambiguous, false);
});

/* 🔥 production พังจริง 2026-09-02: 0337 ใส่ FK `forecastQuotationId` → quotations
   ทำให้ sales_deals ↔ quotations มี FK หากันสองเส้น · PostgREST เลยเลือกทางเชื่อมไม่ได้
   แล้วทุก `select('*, deal:sales_deals(*)')` ตอบ
   "Could not embed because more than one relationship was found" ⇒ ทะเบียนใบเสนอราคา
   ว่างเปล่า · ด่าน loadScoped ล้ม · ป้ายตัวเลขบนเมนูหาย
   ⇒ ถอน FK ใน 0339 (trigger + CHECK ดูแลความสอดคล้องแทน) และล็อกไว้ไม่ให้ใครใส่คืน */
test('ห้ามมี FK จาก sales_deals ไป quotations (PostgREST embed กำกวมทั้งระบบ)', () => {
  const dir = join(ROOT, 'supabase/migrations');
  const offenders = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
    const sql = read(`supabase/migrations/${file}`).replace(/--[^\n]*/g, '');
    /* ตัดเป็นคำสั่ง ๆ แล้วดูเฉพาะคำสั่งที่ทำกับ sales_deals — ตารางอื่นชี้ไป quotations
       ได้ตามปกติ (quotation_lines · sales_orders · revisedFromId ของใบเอง) */
    for (const statement of sql.split(';')) {
      if (!/ALTER\s+TABLE\s+(?:ONLY\s+)?public\.sales_deals/i.test(statement)) continue;
      if (!/REFERENCES\s+public\.quotations/i.test(statement)) continue;
      if (/DROP\s+CONSTRAINT/i.test(statement)) continue;
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [],
    'sales_deals ห้ามมี FK ไป quotations — จะทำให้ embed quotations↔sales_deals กำกวมทั้งระบบ (ดู 0339)');
});

test('0339 ถอน FK ที่ทำให้ embed กำกวม แต่ไม่ถอน trigger/CHECK ที่ดูแลตัวชี้', () => {
  const sql = read('supabase/migrations/0339_drop_deal_forecast_quotation_fkey.sql');
  assert.ok(sql.includes('DROP CONSTRAINT IF EXISTS sales_deals_forecast_quotation_fkey'));
  const body = sql.replace(/--[^\n]*/g, '');
  assert.ok(!/DROP\s+TRIGGER/i.test(body), 'trigger ตอนลบใบต้องอยู่ต่อ — มันคือตัวแทน ON DELETE SET NULL');
  assert.ok(!/DROP\s+CONSTRAINT[^;]*pointer_check/i.test(body), 'CHECK ตัวชี้ต้องอยู่ต่อ');
  assert.ok(!/DROP\s+INDEX/i.test(body), 'ดัชนีที่ trigger ใช้หาแถวดีลต้องอยู่ต่อ');
});

test('ไมเกรชัน 0337 ไม่แตะ metadata/stage/wonValue (กับดัก trigger 0110)', () => {
  const sql = read('supabase/migrations/0337_deal_forecast_source.sql');
  const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
  for (const column of ['metadata', '"stage"', 'wonValue']) {
    assert.ok(!body.includes(`${column} =`), `trigger ห้ามเขียน ${column}`);
  }
  assert.ok(body.includes('BEFORE DELETE ON public.quotations'));
  assert.ok(sql.includes('sales_deals_forecast_pointer_check'), 'ตัวชี้กับที่มาต้องมาคู่กัน');
  assert.ok(!/UPDATE public\.sales_deals[\s\S]{0,400}SET "forecastSource" = 'quotation'/.test(sql),
    'ห้าม backfill ให้ดีลเก่าไปขั้น quotation (มติผู้ใช้ 2026-09-02)');
});
