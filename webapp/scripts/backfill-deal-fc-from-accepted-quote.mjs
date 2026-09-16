/* ยอดของดีลที่ปิด Won ให้ตรงกับใบที่ลูกค้ารับ (มติผู้ใช้ 2026-09-16)
 *
 * ก่อน mig 0361 ตอนรับใบไม่มีใครเขียน `projectValue` ⇒ ดีล Won ถือเลขที่บังเอิญอยู่ตอนนั้น
 * (ส่วนใหญ่เป็นเลขที่ AE กรอกมือ) แล้วถูกแช่แข็ง · สคริปต์นี้ตั้งให้ตรงกับใบที่ลูกค้ารับย้อนหลัง
 *
 *   node scripts/backfill-deal-fc-from-accepted-quote.mjs           # ซ้อม (ไม่เขียน)
 *   node scripts/backfill-deal-fc-from-accepted-quote.mjs --apply   # เขียนจริง
 *
 * ⚠️ เขียนเฉพาะ projectValue / forecastSource / forecastQuotationId / forecastManualValue
 *    — ไม่แตะ stage · wonValue · metadata ⇒ ทริกเกอร์ Actual (0353/0360) ไม่ถูกปลุก และ Actual ไม่ขยับ
 * ⚠️ ดีลที่ไม่มีใบที่ลูกค้ารับ (metadata.acceptedQuotationId ว่าง) = ข้าม ไม่เดา
 */
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
// สูตรยอดก่อน VAT ตัวกลางตัวเดียวกับทุกจุดที่แอปเขียน FC (ปัดสตางค์) — ห้ามเขียนสูตรซ้ำในสคริปต์
import { quotationWonAmount } from '../src/lib/sales/quotationWonAmount.js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('ต้องมี SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const all = async (table, cols) => {
  const rows = []; let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(cols).order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
};

const deals = await all('sales_deals', 'id, code, stage, "projectValue", "forecastSource", "forecastQuotationId", "forecastManualValue", metadata, origin');
const quotes = await all('quotations', 'id, "quoteNumber", "totalAmount", "vatAmount", status');
const byId = new Map(quotes.map((q) => [q.id, q]));
const exVat = (q) => quotationWonAmount(q);

const targets = [];
for (const d of deals) {
  if (d.origin && d.origin !== 'pipeline') continue;          // ดีลของใบสั่งขายย้อนหลังไม่มี FC
  const accId = d.metadata?.acceptedQuotationId;
  if (!accId) continue;
  const q = byId.get(accId);
  if (!q) { console.log(`⚠️  ${d.code || d.id}: acceptedQuotationId ${accId} ไม่มีในทะเบียนใบเสนอราคา — ข้าม`); continue; }
  const next = exVat(q);
  const now = Number(d.projectValue) || 0;
  if (Math.abs(next - now) <= 0.005) continue;
  targets.push({ deal: d, quote: q, next, now });
}

console.log(`ดีลทั้งหมด ${deals.length} · ต้องแก้ ${targets.length} ใบ`);
let up = 0, down = 0;
for (const t of targets) {
  const diff = t.next - t.now;
  if (diff > 0) up += diff; else down += -diff;
  console.log(`  ${t.deal.code || t.deal.id} [${t.deal.stage}] ${money(t.now)} → ${money(t.next)} (${diff > 0 ? '+' : ''}${money(diff)}) · ใบ ${t.quote.quoteNumber} [${t.quote.status}]`);
}
console.log(`รวม: ขึ้น ${money(up)} · ลง ${money(down)} · สุทธิ ${money(up - down)}`);

if (!apply) {
  console.log('\nนี่คือการซ้อม — ใส่ --apply เพื่อเขียนจริง');
  process.exit(0);
}

/* ⭐ กู้คืนได้เสมอ: เก็บค่าเดิมสี่ช่องลงไฟล์ก่อนเขียน + บันทึก audit_logs รายใบ (before/after)
   🐞 รีวิว 16/09: เวอร์ชันแรกเขียนทับโดยไม่มีบันทึก และ `forecastManualValue ?? projectValue` ไม่เคยถอย
      เพราะคอลัมน์ NOT NULL DEFAULT 0 ⇒ ยอดเดิมกู้คืนไม่ได้ */
const FIELDS = ['projectValue', 'forecastSource', 'forecastQuotationId', 'forecastManualValue'];
const pick = (row) => Object.fromEntries(FIELDS.map((k) => [k, row[k] ?? null]));
const backupPath = `backfill-deal-fc-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(backupPath, JSON.stringify(targets.map((t) => ({ id: t.deal.id, code: t.deal.code, before: pick(t.deal) })), null, 2));
console.log(`\nสำรองค่าเดิมไว้ที่ ${backupPath}`);

let ok = 0;
const failed = [];
for (const t of targets) {
  const patch = {
    projectValue: t.next,
    forecastSource: 'quotation',
    forecastQuotationId: t.quote.id,
    // ดีลที่เดินตามเลขกรอก ⇒ ยอดดีลตอนนี้คือเลขกรอก เก็บไว้ช่องของมัน (กติกาเดียวกับ mig 0361)
    forecastManualValue: t.deal.forecastSource === 'manual' ? t.now : (Number(t.deal.forecastManualValue) || 0),
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabase.from('sales_deals').update(patch).eq('id', t.deal.id);
  if (error) { failed.push(t.deal.code || t.deal.id); console.error(`  ❌ ${t.deal.code || t.deal.id}: ${error.message}`); continue; }
  const { error: auditError } = await supabase.from('audit_logs').insert({
    actorId: null,
    actorName: 'backfill-deal-fc-from-accepted-quote',
    actorRole: 'system',
    action: 'update',
    entityType: 'sales_deal',
    entityId: String(t.deal.id),
    summary: `ยอดดีล ${t.deal.code || t.deal.id} ตามใบที่ลูกค้ารับ ${t.quote.quoteNumber}: ${money(t.now)} → ${money(t.next)} (มติผู้ใช้ 2026-09-16)`,
    changedKeys: FIELDS,
    before: pick(t.deal),
    after: pick({ ...t.deal, ...patch }),
    createdAt: new Date().toISOString(),
  });
  if (auditError) console.error(`  ⚠️ ${t.deal.code || t.deal.id}: เขียนแล้วแต่บันทึก audit ไม่สำเร็จ — ${auditError.message} (ค่าเดิมอยู่ใน ${backupPath})`);
  ok += 1;
}
console.log(`เขียนแล้ว ${ok}/${targets.length} ใบ`);
// เขียนไม่ครบ = ต้องให้ shell รู้ ไม่ใช่จบแบบสำเร็จ
if (failed.length) {
  console.error(`❌ ไม่สำเร็จ ${failed.length} ใบ: ${failed.join(', ')} — รันซ้ำได้ (ใบที่ตรงแล้วจะถูกข้าม)`);
  process.exit(1);
}
