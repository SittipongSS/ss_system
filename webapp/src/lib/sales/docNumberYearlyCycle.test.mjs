/* ── เลข QT/SO ตัดรอบทุกปี (มติผู้ใช้ 2026-09-01 · mig 0328) ────────────────
   สิ่งที่เทสต์ชุดนี้กันไว้คือ **การเผลอกลับไปใช้เดือนเป็นคีย์ถังนับ** ซึ่งเป็นบั๊กที่มอง
   ไม่เห็นจากหน้าจอ: เลขยังหน้าตาเหมือนเดิมทุกตัวอักษร (`QT-YYMMXXXX-R`) แต่พอขึ้น
   เดือนใหม่มันจะย้อนกลับไป 0001 แล้วชนเลขที่ออกไปหาลูกค้าแล้ว */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteCounterYear } from '../salesPlanning.js';

const migration = readFileSync(
  new URL('../../../supabase/migrations/0328_quote_sales_order_yearly_running.sql', import.meta.url),
  'utf8',
);
const previousQuote = readFileSync(
  new URL('../../../supabase/migrations/0242_quote_costing_atomic_number.sql', import.meta.url),
  'utf8',
);
const previousOrder = readFileSync(
  new URL('../../../supabase/migrations/0285_sales_order_confirmation.sql', import.meta.url),
  'utf8',
);
const excise = readFileSync(
  new URL('../../../supabase/migrations/0329_excise_tax_notice_yearly_running.sql', import.meta.url),
  'utf8',
);
const previousExcise = readFileSync(
  new URL('../../../supabase/migrations/0162_excise_tax_notice_document_standard.sql', import.meta.url),
  'utf8',
);

test('คีย์ถังนับของใบเสนอราคาเป็น "ปี" 2 หลัก และอ่านจากนาฬิกาไทย', () => {
  assert.equal(quoteCounterYear(new Date('2026-08-31T10:00:00Z')), '26');
  // 31/12/2025 17:30 UTC = 01/01/2026 00:30 เวลาไทย ⇒ ต้องเป็นปี 26 ไม่ใช่ 25
  // (ถ้าเผลออ่านจาก Date ตรง ๆ บน Vercel ซึ่งเป็น UTC จะได้ปีเก่าแล้วเลขไปต่อท้ายปีที่แล้ว)
  assert.equal(quoteCounterYear(new Date('2025-12-31T17:30:00Z')), '26');
});

test('มิเกรชัน seed แถวปีก่อนสลับฟังก์ชัน — ไม่งั้นเลขเริ่มใหม่ทับใบที่ออกไปแล้ว', () => {
  const seedAt = migration.indexOf('INSERT INTO public.quote_number_counters AS c (month, "lastNo")\n  VALUES (v_year');
  const quoteFnAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.create_quotation_with_number');
  const orderFnAt = migration.indexOf('CREATE OR REPLACE FUNCTION public.create_sales_order_draft');
  assert.ok(seedAt > 0 && quoteFnAt > 0 && orderFnAt > 0);
  assert.ok(seedAt < quoteFnAt && seedAt < orderFnAt, 'ท่อน seed ต้องมาก่อนนิยามฟังก์ชัน');
  // ทั้งใบต้องอยู่ในทรานแซกชันเดียว — รันครึ่งใบแล้วค้างคือสภาพที่ออกเลขซ้ำได้
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
});

test('seed นับ "เลขที่ออกไปแล้ว" ไม่ใช่แค่แถวที่ยังเหลือ และห้ามถอยเลข', () => {
  // ใบที่ถูกลบทิ้งไม่เหลือแถวให้นับ แต่ตัวนับรายเดือนยังจำได้ว่าเลขถูกออกไปแล้ว
  assert.match(migration, /GREATEST\([\s\S]{0,400}quote_number_counters/);
  assert.match(migration, /GREATEST\([\s\S]{0,400}sales_order_number_counters/);
  // trigger doc_number_counter_guard (0242) ห้ามค่าถอย ⇒ ON CONFLICT ต้องเป็น GREATEST
  assert.match(migration, /ON CONFLICT \(month\) DO UPDATE SET "lastNo" = GREATEST\(c\."lastNo", EXCLUDED\."lastNo"\)/);
});

test('ใบสั่งขายใช้ปีเป็นคีย์ถังนับ แต่เลขที่คนเห็นยังมีเดือน', () => {
  assert.match(migration, /v_year := to_char\(v_now, 'YY'\)/);
  assert.doesNotMatch(migration, /to_char\(v_now, 'YYMM'\)/);
  // ท่อประกอบเลขต้องยังแทน {MM} — เลขบนเอกสารยังเป็น SO-YYMMXXXX-R เท่าเดิม
  assert.match(migration, /replace\(v_order_number, '\{MM\}', to_char\(v_now, 'MM'\)\)/);
  // นิยามเดิมคือแบบที่ตัดรอบรายเดือน — ยืนยันว่าเทสต์นี้จับของจริง
  assert.match(previousOrder, /v_month := to_char\(v_now, 'YYMM'\)/);
});

test('คัดนิยามล่าสุดมาทั้งก้อน — ของที่ 0242/0285 เพิ่มไว้ต้องไม่หายไปกับการคัด', () => {
  // QT: ท่อนเลขฐาน/ฉบับแก้ไข + ทางเขียนแถวผ่าน master_row_columns (0242)
  assert.match(migration, /'baseNumber', v_base/);
  assert.match(migration, /public\.master_row_columns\('quotations', v_payload\)/);
  assert.match(previousQuote, /public\.master_row_columns\('quotations', v_payload\)/);
  // SO: p_overrides + เอกสารยืนยันคำสั่งซื้อ + วันที่บนหัวใบ = วันที่ออกใบ (0285)
  assert.match(migration, /p_overrides jsonb DEFAULT '\{\}'::jsonb/);
  assert.match(migration, /"confirmDocType", "confirmDocNo", "confirmDocDate", "confirmAttachments"/);
  assert.match(migration, /'SOL-' \|\| md5\(p_order_id \|\| ':' \|\| ql\.id\)/);
  assert.match(migration, /COALESCE\(ql\."unit", 'ชิ้น'\)/);
});

/* 🔴 บั๊กที่เกือบหลุด: `sales_order_number_counters.month` มี CHECK `~ '^\d{4}$'` มาตั้งแต่
   0109 ⇒ คีย์ปี '26' ใส่ไม่ผ่าน · อาการคือ **สร้างใบสั่งขายไม่ได้ทั้งระบบ** ไม่ใช่เลขเพี้ยน */
test('ปลด CHECK ที่บังคับคีย์ถังนับ 4 หลัก ก่อน seed — ไม่งั้นคีย์ปีใส่ไม่ผ่าน', () => {
  assert.match(migration, /CHECK \(month ~ '\^\[0-9\]\{2\}\$' OR month ~ '\^\[0-9\]\{4\}\$'\)/);
  const ckAt = migration.indexOf('sales_order_number_counters_month_shape');
  const seedAt = migration.indexOf('VALUES (v_year, v_so)');
  assert.ok(ckAt > 0 && seedAt > ckAt, 'ท่อนปลด CHECK ต้องมาก่อน seed');
  // ห้ามลบ CHECK ของ "lastNo" (กันค่าติดลบ) ไปด้วย — กรองด้วยนิยามที่พูดถึง month เท่านั้น
  assert.match(migration, /pg_get_constraintdef\(oid\) ILIKE '%month%'/);
});

test('มิเกรชันไม่แตะข้อมูลเอกสารเดิม และคืนสิทธิ์ให้ service_role ครบ', () => {
  // ตรวจเฉพาะบรรทัดคำสั่ง — คอมเมนต์พูดถึง DROP ได้ (อธิบายว่าทำไมถึง *ไม่* DROP)
  // ⚠️ ท่อน ⓪ แตะ *ด่านของตารางตัวนับ* ได้ แต่ห้ามแตะแถวเอกสารเลยสักใบ
  const statements = migration.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n');
  assert.doesNotMatch(statements, /\b(TRUNCATE|DELETE FROM)\b/);
  assert.doesNotMatch(statements, /UPDATE public\.(quotations|sales_orders)\b/);
  assert.doesNotMatch(statements, /ALTER TABLE public\.(quotations|sales_orders)\b/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_quotation_with_number[\s\S]{0,80}TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_sales_order_draft[\s\S]{0,80}TO service_role/);
});

/* ── ใบแจ้งชำระค่าภาษีสรรพสามิต (ET) — มติ 2026-09-01 "ET เอาแบบ QT" · mig 0329 ──
   🔴 ของจริงตอนทำ: ตาราง `orders` ไม่เหลือแถวเลย แต่ตัวนับรายเดือนยังจำเลขที่ออกไปแล้ว
   (2607=1 · 2608=3) ⇒ seed ที่นับแต่แถวจริงจะได้ 0 แล้วออกเลขซ้ำของเก่า */
test('ET: seed จากตัวนับเดือนด้วย ไม่ใช่จากแถวอย่างเดียว (ตารางว่างแต่เลขออกไปแล้ว)', () => {
  assert.match(excise, /GREATEST\([\s\S]{0,500}excise_tax_notice_number_counters/);
  assert.match(excise, /ON CONFLICT \(month\) DO UPDATE SET "lastNo" = GREATEST\(c\."lastNo", EXCLUDED\."lastNo"\)/);
  const seedAt = excise.indexOf('VALUES (v_year, v_no)');
  const fnAt = excise.indexOf('CREATE OR REPLACE FUNCTION public.assign_excise_tax_notice_identity');
  assert.ok(seedAt > 0 && fnAt > seedAt, 'ท่อน seed ต้องมาก่อนนิยาม trigger');
});

test('ET: คีย์ถังนับเป็นปี แต่เลขบนใบยังมีเดือน', () => {
  assert.match(excise, /v_year := to_char\(v_local_time, 'YY'\)/);
  assert.doesNotMatch(excise, /to_char\(v_local_time, 'YYMM'\)/);
  assert.match(excise, /replace\(NEW\."taxNoticeNumber", '\{MM\}', to_char\(v_local_time, 'MM'\)\)/);
  // นิยามเดิม (0162) คือแบบรายเดือน — ยืนยันว่าเทสต์จับของจริง
  assert.match(previousExcise, /v_month := to_char\(v_local_time, 'YYMM'\)/);
});

test('ET: คัดนิยามล่าสุดมาครบ — ท่อนที่ 0162 ทำไว้ต้องไม่หาย', () => {
  // ใบที่มีเลขแล้วต้องไม่ถูกออกเลขใหม่ · มาตรฐานที่เผยแพร่ต้องถูกตรึงลงใบ
  assert.match(excise, /IF NEW\."taxNoticeNumber" IS NOT NULL THEN\s+RETURN NEW;/);
  assert.match(excise, /excise_tax_notice_standard_missing/);
  assert.match(excise, /NEW\."taxNoticeStandardSnapshot" := to_jsonb\(v_standard\)/);
});
