// ── mig 0437 ยุบโครงการงวด P3c: ฐานเลิกเขียน projectId · สายธุรกิจของ SO จากดีล · ยามคลังโครงการ ──────────────
// ล็อก (อ่านไฟล์ SQL — ไม่มี DB ในเทสต์):
//  1. C1–C3 ปะบนตัวที่รันจริงด้วยข้อความยึดที่มีอยู่จริงในนิยามล่าสุด (ไม่ยกเนื้อเก่ามา CREATE OR REPLACE)
//  2. C4 สายธุรกิจของใบอ่านจากดีลอย่างเดียว — คู่กับ `orderBusinessLineOf` ฝั่ง JS (P3b-1)
//  3. C5 ถอดทริกเกอร์ที่เขียน projects."revStale" + ฟังก์ชัน backfill ที่ตาย
//  4. C6 ยามคลัง: เพิ่ม/ลบแถว projects ไม่ได้ (ลบ = ไทม์ไลน์ cascade + ลายนิ้วมือ SO เพี้ยน) · แก้แถวยังได้ (mirror ชื่อลูกค้า)
//  5. ไม่แตะข้อมูลแถวเดิม — `projectId` ของ SO อยู่ในลายนิ้วมืออนุมัติ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const MIG_DIR = new URL('../../../supabase/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, MIG_DIR), 'utf8');
const fileOf = (prefix) => readdirSync(MIG_DIR).find((f) => f.startsWith(prefix));
const RAW = read(fileOf('0437_'));
const CODE = RAW.replace(/--[^\n]*/g, '');
const count = (text, needle) => text.split(needle).length - 1;

const PATCHES = [
  ['create_sales_order_draft', '0437/C1', 'd."projectId"', '0363_'],
  ['revise_approved_sales_order_atomic', '0437/C2', 'v_source."projectId"', '0376_'],
  ['deal_restore_timeline_revision', '0437/C3', 'v_project_id, p_deal_id,', '0436_deal_timeline_restore'],
];

test('0437 C1–C3: ปะบนตัวที่รันจริง · ข้อความยึดมีอยู่ครั้งเดียวในนิยามล่าสุดของไฟล์ · ไม่ CREATE OR REPLACE เนื้อเก่า', () => {
  for (const [fn, marker, anchor, source] of PATCHES) {
    assert.match(CODE, new RegExp(`ARRAY\\['${fn}', '${marker.replace('/', '\\/')}',`), `${fn}: ต้องอยู่ในแถวปะ`);
    assert.ok(CODE.includes(`'${anchor.replace(/'/g, "''")}'`), `${fn}: ข้อความยึด`);
    assert.doesNotMatch(CODE, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), `${fn}: ห้ามยกเนื้อมา CREATE OR REPLACE`);
    const src = read(fileOf(source)).replace(/--[^\n]*/g, '');
    const from = src.indexOf(`FUNCTION public.${fn}(`);
    assert.ok(from >= 0, `${fn}: หานิยามใน ${source} ไม่เจอ`);
    const body = src.slice(from, src.indexOf('\n$$;', from));
    assert.equal(count(body, anchor), 1, `${fn}: ข้อความยึดต้องเจอครั้งเดียวในนิยามล่าสุด (${source})`);
  }
  assert.match(CODE, /IF v_src_hits <> 1 OR v_def_hits <> 1 THEN\s+RAISE EXCEPTION 'mig_0437_patch_anchor/);
  assert.match(CODE, /IF strpos\(v_src, v_marker\) > 0 THEN[\s\S]*?CONTINUE;/, 'รันซ้ำ = ข้าม');
  assert.match(CODE, /RAISE EXCEPTION 'mig_0437_copy_still_present'/);
  for (const [, marker] of PATCHES) assert.ok(RAW.includes(`NULL /* ${marker}`), `${marker}: แทนด้วย NULL พร้อมป้าย`);
});

test('0437 C4: สายธุรกิจของใบ = สายของดีล · ไม่อ่าน projects · ตอบไม่ได้ = NULL', () => {
  const from = CODE.indexOf('CREATE OR REPLACE FUNCTION public.sales_order_business_line(p_order_id text)');
  assert.ok(from > 0);
  const body = CODE.slice(from, CODE.indexOf('\n$$;', from));
  assert.doesNotMatch(body, /projects/);
  assert.match(body, /SELECT CASE WHEN d\.line IN \('PRODUCT', 'SERVICE'\) THEN d\.line END/);
  assert.match(body, /LEFT JOIN public\.sales_deals d ON d\.id = o\."dealId"/);
  assert.match(body, /STABLE\s+SET search_path = public/);
  // ฝั่ง JS อ่านสายจากดีลอยู่แล้ว (P3b-1) — สองฝั่งต้องตอบชุดเดียวกัน
  const js = readFileSync(new URL('./serviceOrders.js', import.meta.url), 'utf8');
  assert.match(js, /export function orderBusinessLineOf\(order, ctx = \{\}\) \{\s+return orderBusinessLine\(order, \{\s+dealsById:/);
  assert.doesNotMatch(js.slice(js.indexOf('export function orderBusinessLineOf')), /^\s*projectsById/m);
});

test('0437 C5: ถอดทริกเกอร์ revStale ของโครงการ + ฟังก์ชัน backfill ที่ตาย', () => {
  assert.match(CODE, /DROP TRIGGER IF EXISTS project_tasks_mark_rev_stale ON public\.project_tasks;/);
  assert.match(CODE, /DROP FUNCTION IF EXISTS public\.pm_mark_rev_stale\(\);/);
  assert.match(CODE, /DROP FUNCTION IF EXISTS public\.backfill_deal_fields_from_projects\(boolean\);/);
  // Rev. ของดีล (0435) ห้ามโดนถอดไปด้วย
  assert.doesNotMatch(CODE, /project_tasks_mark_deal_timeline_rev_stale|deal_mark_timeline_rev_stale/);
});

test('0437 C6: ยามคลัง — เพิ่ม/ลบ/TRUNCATE แถว projects ไม่ได้ · แก้แถวได้ · ทางออกเฉพาะ SET LOCAL', () => {
  assert.match(CODE, /CREATE TRIGGER projects_archive_guard_rows\s+BEFORE INSERT OR DELETE ON public\.projects\s+FOR EACH ROW EXECUTE FUNCTION public\.projects_archive_guard\(\);/);
  assert.match(CODE, /CREATE TRIGGER projects_archive_guard_truncate\s+BEFORE TRUNCATE ON public\.projects\s+FOR EACH STATEMENT/);
  assert.doesNotMatch(CODE, /BEFORE (INSERT OR )?UPDATE|OR UPDATE ON public\.projects/, 'แก้แถวต้องยังได้ — mirror ชื่อลูกค้า/รวมลูกค้าเขียนคลัง');
  assert.match(CODE, /current_setting\('app\.projects_archive_unlock', true\), ''\) = 'on'/);
  assert.match(CODE, /\[projects_archived\]/);
  assert.match(CODE, /REVOKE ALL ON FUNCTION public\.projects_archive_guard\(\) FROM PUBLIC, anon, authenticated;/);
});

test('0437: ไม่แตะข้อมูลแถวเดิม (projectId ของ SO อยู่ในลายนิ้วมือ) · ทรานแซกชันเดียว · มี SELECT ตรวจหลัง COMMIT', () => {
  assert.doesNotMatch(CODE, /UPDATE public\.(sales_orders|project_tasks|sales_deals|projects)\b/);
  assert.doesNotMatch(CODE, /DELETE FROM public\./);
  assert.doesNotMatch(CODE, /DROP (TABLE|COLUMN)|ALTER TABLE/);
  assert.equal(count(CODE, '\nBEGIN;'), 1);
  assert.equal(count(CODE, '\nCOMMIT;'), 1);
  assert.ok(CODE.indexOf('AS patched') > CODE.indexOf('\nCOMMIT;'), 'SELECT ตรวจอยู่หลัง COMMIT');
  assert.match(CODE, /NOTIFY pgrst, 'reload schema';/);
});
