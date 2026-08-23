// ── ซ่อมของที่ mirror โครงการจากดีลแล้วค้างไม่ตรง ────────────────────────────
//
// ตารางในชุด mirror (lib/sales/dealProjectMove.js) เก็บ `projectId` ไว้ข้าง `dealId`
// โดยความจริงคือ "โครงการของดีล" เสมอ · แถวที่ถูกสร้างตอนดีลยังไม่ผูกโครงการจึงค้าง
// `projectId = null` ถาวร เพราะเส้นผูกครั้งแรกเคยไม่เรียก moveDealMirrors
// (แก้ที่ create-project / link-project แล้ว — สคริปต์นี้ตามเก็บของเก่า)
//
// ค่าเริ่มต้น = **dry-run** พิมพ์อย่างเดียว · เขียนจริงต้องใส่ --apply
//   node scripts/repair-deal-project-mirrors.mjs
//   node scripts/repair-deal-project-mirrors.mjs --apply
//
// ⚠️ ซ่อมเฉพาะแถวที่ `projectId` ว่าง — แถวที่ชี้โครงการอื่นอยู่ **ไม่แตะ** และรายงาน
// แยกไว้ให้คนตัดสิน (อาจเป็นของที่ย้ายมาแล้วจริง ๆ หรือเป็นร่องรอยของบั๊กคนละตัว)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MIRROR_TABLES = ['personal_tasks', 'dept_requests', 'sales_orders', 'production_jobs'];

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('ไม่พบ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const apply = process.argv.includes('--apply');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: deals, error: dealError } = await supabase
  .from('sales_deals').select('id, code, projectId');
if (dealError) { console.error('อ่านดีลไม่สำเร็จ:', dealError.message); process.exit(1); }
const projectOfDeal = new Map(deals.map((d) => [d.id, d.projectId || null]));

let fixable = 0;
let conflicting = 0;

for (const table of MIRROR_TABLES) {
  const { data, error } = await supabase.from(table).select('id, dealId, projectId');
  if (error) { console.error(`อ่าน ${table} ไม่สำเร็จ:`, error.message); process.exit(1); }

  const rows = (data || []).filter((r) => r.dealId && projectOfDeal.has(r.dealId));
  const empty = rows.filter((r) => !r.projectId && projectOfDeal.get(r.dealId));
  const wrong = rows.filter((r) => r.projectId && projectOfDeal.get(r.dealId)
    && r.projectId !== projectOfDeal.get(r.dealId));

  fixable += empty.length;
  conflicting += wrong.length;
  console.log(`${table}: เติมได้ ${empty.length} · ชี้คนละโครงการ (ไม่แตะ) ${wrong.length}`);
  for (const row of wrong) {
    console.log(`   ⚠ ${row.id}: แถว=${row.projectId} · ดีล=${projectOfDeal.get(row.dealId)}`);
  }

  if (!apply || !empty.length) continue;

  // เขียนทีละโครงการ — แถวที่เติมพร้อมกันต้องได้ค่าเดียวกันเท่านั้น
  const byProject = new Map();
  for (const row of empty) {
    const pid = projectOfDeal.get(row.dealId);
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(row.id);
  }
  for (const [projectId, ids] of byProject) {
    const { error: updateError } = await supabase.from(table).update({ projectId }).in('id', ids);
    if (updateError) { console.error(`เขียน ${table} ไม่สำเร็จ:`, updateError.message); process.exit(1); }
    console.log(`   ✓ ${table} ${ids.length} แถว → ${projectId}`);
  }
}

console.log(`\nรวม: เติมได้ ${fixable} แถว · ต้องคนดู ${conflicting} แถว`);
if (!apply) console.log('(dry-run — ใส่ --apply เพื่อเขียนจริง)');
