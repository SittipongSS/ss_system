/* งานไทม์ไลน์ SA "วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต" ที่ค้างก่อนตัวซิงก์ขึ้นระบบ (แผนรื้อสรรพสามิต Q21 · มติ 03/11/2026)
 *
 * ตัวซิงก์ทำงานหลัง action บนใบ (route) เท่านั้น ⇒ งานของดีลที่ไม่มีใครแตะใบหลังวันขึ้นระบบยังค้าง Pending ตามเดิม
 * สคริปต์นี้เดินดีลทุกใบที่มีงานนี้รอบเดียว ด้วยตัวตัดสินชุดเดียวกับ route (`lib/pm/exciseBillingTaskSync.js`)
 *
 *   node scripts/sync-excise-billing-tasks.mjs            # ซ้อม (อ่านอย่างเดียว) — โชว์งานที่จะเปลี่ยน
 *   node scripts/sync-excise-billing-tasks.mjs --apply    # เขียนจริง (ต้องได้คำยินยอมเจ้าของก่อน — dev DB = prod DB)
 *
 * ⚠️ ต้องรัน mig 0421 ก่อน — ตัวเขียนตั้ง "systemCompletedAt/By"
 * ⚠️ เขียนแบบ CAS (สถานะเดิม) ทีละงาน แล้วเดินกราฟสถานะต่อ — กติกาเดียวกับคนกดเปลี่ยนสถานะเอง
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

/* ตัวแปลง `@/` ของ lib — รูปเดียวกับ scripts/test-loader.mjs แต่ **ไม่ถอดคีย์ฐาน** (สคริปต์นี้ต้องอ่านฐานจริง) */
const SRC = pathToFileURL(join(process.cwd(), 'src') + '/').href;
register('data:text/javascript,' + encodeURIComponent(`
  const SRC = ${JSON.stringify(SRC)};
  export async function resolve(spec, ctx, next) {
    let s = spec;
    if (s === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
    if (s.startsWith('@/')) s = SRC + s.slice(2);
    if (s === 'next/server') s = 'next/server.js';
    if ((s.startsWith('./') || s.startsWith('../') || s.startsWith('file:')) && !/\\.[mc]?js$/.test(s)) {
      try { return await next(s, ctx); } catch { return next(s + '.js', ctx); }
    }
    return next(s, ctx);
  }
`), import.meta.url);

const { createClient } = await import('@supabase/supabase-js');
const { planExciseBillingTasks, syncExciseBillingTasks } = await import('../src/lib/pm/exciseBillingTaskSync.js');
const { EXCISE_BILLING_STEP_KEYS } = await import('../src/lib/pm/exciseBillingTask.js');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('ต้องมี SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const supabase = createClient(url, key, { auth: { persistSession: false } });

/* ดีลที่มีงานนี้ — จับกว้างด้วยฝ่าย SA (ตัวตัดสินของ lib กรองซ้ำด้วยคีย์ขั้น/ชื่อ) */
const dealIds = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('project_tasks')
    .select('id, "dealId", "workflowTemplateStepKey", name')
    .eq('role', 'SA').not('dealId', 'is', null)
    .order('id').range(from, from + 999);
  if (error) throw new Error(`project_tasks: ${error.message}`);
  for (const row of data) {
    if (EXCISE_BILLING_STEP_KEYS.includes(row.workflowTemplateStepKey) || /\+\s*ค่าสรรพสามิต/.test(row.name || '')) dealIds.add(row.dealId);
  }
  if (data.length < 1000) break;
}

const ids = [...dealIds];
const { tasks, updates } = await planExciseBillingTasks(supabase, ids);
const byStatus = tasks.reduce((acc, task) => ({ ...acc, [task.status]: (acc[task.status] || 0) + 1 }), {});
console.log(`ดีลที่มีงานนี้ ${ids.length} ดีล · งาน ${tasks.length} งาน ${JSON.stringify(byStatus)}`);
console.log(`จะเปลี่ยน ${updates.length} งาน:`);
for (const update of updates) console.log(`  ${update.id}  ดีล ${update.dealId}  ${update.prevStatus} → ${update.patch.status}`);

if (!apply) {
  console.log('\n(ซ้อม — ยังไม่เขียน · ใส่ --apply เพื่อเขียนจริง)');
  process.exit(0);
}
const { updated } = await syncExciseBillingTasks(supabase, ids);
console.log(`\nเขียนแล้ว ${updated}/${updates.length} งาน (ที่ขาด = มีคนเปลี่ยนสถานะชนกันพอดี · CAS ข้าม)`);
