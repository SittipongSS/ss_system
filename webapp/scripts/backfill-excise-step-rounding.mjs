// คิดอัตราภาษีสรรพสามิตของสินค้าใหม่ด้วยสูตรปัดทีละขั้น (มติเจ้าของ 26/11/2026 · V43)
//
//   ราคาขายปลีกรวม VAT → ถอด VAT 7% (ปัด) → ① สรรพสามิต 8% (ปัด) → ② ท้องถิ่น 10% ของ "สรรพสามิตที่ปัดแล้ว" (ปัด)
//   เช่น 1,290 → 1,205.61 → 96.45 → 9.65 ⇒ ภาษี/ชิ้น 106.10 (สูตรเดิม Q2 ได้ 106.09)
//
// เขียนทับเฉพาะ `products.retailPriceExVat` / `exciseTax` / `localTax` ของสินค้าที่ต้องเสียภาษีและค่าเปลี่ยนจริง
// ด้วย `productTaxRates` ตัวเดียวกับที่ระบบใช้ตอนบันทึกสินค้า (กติกาเดียวกับ lib/excise/productExcise.js:
// ถอด VAT = ของราคาขายปลีกตัวสินค้า · ภาษี = จากฐานภาษี — ชุดของขวัญรายชิ้น/ยังไม่เลือก = `exciseBasePriceIncVat`)
//
// ⚠️ **ไม่แตะใบที่ออกไปแล้ว** (QT · SO · ใบยื่น) — เจ้าของเลือก "ใช้กับใบใหม่เท่านั้น" · ใบเหล่านั้นตรึงภาษี/ชิ้นไว้ในตัวเอง
// ⚠️ ฐาน dev = ฐานจริง ⇒ ตั้งต้นเป็น dry-run · เขียนจริงต้องใส่ `--apply`
//    ทุกตัวที่เขียน: ลง `product_price_history` (หน้าสินค้าแท็บราคาเห็น) + `audit_logs` (ย้อนกลับได้จากค่า before)
//
// Usage:  node scripts/backfill-excise-step-rounding.mjs            (ดูว่าจะเปลี่ยนอะไร)
//         node scripts/backfill-excise-step-rounding.mjs --apply    (เขียนจริง)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { productTaxRates } from '../src/lib/tax/exciseBilling.js';

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const ACTOR = 'Claude Code (คิดภาษีสรรพสามิตใหม่ ปัดทีละขั้น · เจ้าของสั่งในแชต 26/11/2026)';
const SOURCE = 'excise-step-rounding-2026-11-26';
const FIELDS = ['retailPriceExVat', 'exciseTax', 'localTax'];
// ฐานภาษีที่ไม่ใช่ราคาขายปลีกตัวสินค้า (mig 0430/0431) — ตรงกับ productExcise.js
const OWN_BASE_MODES = new Set(['pieces', 'unchosen']);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const same = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 1e-9;

async function main() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, "fgCode", "isExciseTaxable", "retailPriceIncVat", "exciseTaxBase", "exciseBasePriceIncVat", "costPrice", "retailPriceExVat", "exciseTax", "localTax"')
    .eq('isExciseTaxable', true)
    .limit(10000);
  if (error) throw error;

  const changes = [];
  for (const p of products || []) {
    const own = productTaxRates(p.retailPriceIncVat);
    const taxed = OWN_BASE_MODES.has(p.exciseTaxBase) ? productTaxRates(p.exciseBasePriceIncVat) : own;
    const after = { retailPriceExVat: own.retailPriceExVat, exciseTax: taxed.exciseTax, localTax: taxed.localTax };
    const before = Object.fromEntries(FIELDS.map((f) => [f, p[f]]));
    if (FIELDS.every((f) => same(before[f], after[f]))) continue;
    const oldPerUnit = Math.round((Number(p.exciseTax) + Number(p.localTax)) * 100) / 100;
    changes.push({ p, before, after, oldPerUnit, newPerUnit: taxed.taxPerUnit });
  }

  const moved = changes.filter((c) => !same(c.oldPerUnit, c.newPerUnit));
  console.log(`สินค้าที่ต้องเสียภาษี ${products.length} ตัว · ค่าที่เก็บเปลี่ยน ${changes.length} ตัว · ภาษี/ชิ้นที่ปัดแล้วเปลี่ยน ${moved.length} ตัว`);
  for (const c of moved.slice(0, 15)) {
    console.log(`  ${c.p.fgCode}  ${c.oldPerUnit.toFixed(2)} → ${c.newPerUnit.toFixed(2)}  (สรรพสามิต ${c.after.exciseTax} · ท้องถิ่น ${c.after.localTax})`);
  }
  if (moved.length > 15) console.log(`  … อีก ${moved.length - 15} ตัว`);
  if (!APPLY) {
    console.log('dry-run — ยังไม่ได้เขียน (ใส่ --apply เพื่อเขียนจริง)');
    return;
  }

  let written = 0;
  for (const { p, before, after, oldPerUnit, newPerUnit } of changes) {
    // เขียนเฉพาะแถวที่ค่ายังเป็นของเดิม — มีคนบันทึกสินค้าระหว่างทาง = ข้าม (โค้ดใหม่คิดสูตรใหม่ให้แล้วตอนบันทึก)
    let q = supabase.from('products').update(after).eq('id', p.id);
    for (const f of FIELDS) q = before[f] == null ? q.is(f, null) : q.eq(f, before[f]);
    const { data: rows, error: upErr } = await q.select('id');
    if (upErr) throw upErr;
    if (!rows?.length) { console.log(`  ข้าม ${p.fgCode} — ค่าเปลี่ยนไปแล้วระหว่างทาง`); continue; }

    const summary = `คิดภาษีสรรพสามิตใหม่แบบปัดทีละขั้น (มติ 26/11): ภาษี/ชิ้น ${oldPerUnit.toFixed(2)} → ${newPerUnit.toFixed(2)}`;
    const { error: histErr } = await supabase.from('product_price_history').insert({
      productId: String(p.id),
      changedBy: null,
      changedByName: ACTOR,
      changeType: 'update',
      costPriceBefore: p.costPrice ?? null, costPriceAfter: p.costPrice ?? null,
      retailPriceIncVatBefore: p.retailPriceIncVat ?? null, retailPriceIncVatAfter: p.retailPriceIncVat ?? null,
      retailPriceExVatBefore: before.retailPriceExVat ?? null, retailPriceExVatAfter: after.retailPriceExVat,
      exciseTaxBefore: before.exciseTax ?? null, exciseTaxAfter: after.exciseTax,
      localTaxBefore: before.localTax ?? null, localTaxAfter: after.localTax,
      source: SOURCE,
      metadata: { reason: summary },
      createdAt: new Date().toISOString(),
    });
    if (histErr) throw histErr;
    const { error: auditErr } = await supabase.from('audit_logs').insert({
      actorId: null,
      actorName: ACTOR,
      action: 'update',
      entityType: 'product',
      entityId: String(p.id),
      summary: `${p.fgCode}: ${summary}`,
      changedKeys: FIELDS.filter((f) => !same(before[f], after[f])),
      before,
      after,
    });
    if (auditErr) throw auditErr;
    written += 1;
  }
  console.log(`เขียนแล้ว ${written} ตัว`);
}

main().catch((e) => {
  console.error('✗', e?.message || e);
  process.exit(1);
});
