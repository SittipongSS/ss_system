// ── ดีลรับช่องของโครงการ (งวด P2a ของการยุบดีล/โครงการ · มติเจ้าของ 13/11/2026 ①②③ · mig 0435) ─────────────
//
// ล็อกสิ่งที่พังเงียบได้ถ้ามีคนแก้ migration ทีหลัง:
//  1. ฟังก์ชันเติมค่า "ซ้อม" เป็นค่าตั้งต้น และเติมเฉพาะช่องว่าง (เรียกซ้ำตอนสลับผู้อ่านแต่ละงวดต้องไม่ทับค่าที่คนแก้แล้ว)
//  2. anon/authenticated เรียกฟังก์ชัน/อ่านตาราง Rev. ไม่ได้ (รู anon RPC ปิดไปแล้วเมื่อ 02/09)
//  3. ช่อง "ดีล SCENT ต้นทาง" ไม่ใช่ `parentDealId` (คนละความหมาย · CHECK ของดีลย้อนหลังบังคับว่าง)
//  4. ชื่อ AC/Sup บนดีลเป็นชื่อบนเอกสาร — ห้ามเข้าลิสต์ซิงก์ชื่อตามบัญชี
//  5. ย้ายงานกลางแล้วคืนสถานะ "แก้แล้ว" ของโครงการ (trigger 0045 ไม่ควรตีโครงการเพราะย้ายป้ายดีล)
// พฤติกรรมจริงของ SQL ซ้อมบน Postgres ในหน่วยความจำแล้วตอนเขียน (ซ้อมไม่เขียน · รันซ้ำได้ศูนย์ · trigger · FK)
// — ไฟล์นี้กันการถอยของข้อความ ไม่ได้รัน SQL
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SQL = readFileSync(new URL('../../../supabase/migrations/0435_deal_owns_project_fields.sql', import.meta.url), 'utf8');
const code = SQL.replace(/--[^\n]*/g, '');
const fnBody = (name) => {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start >= 0, `ไม่พบฟังก์ชัน ${name}`);
  return code.slice(start, code.indexOf('$$;', start));
};

test('0435: additive ล้วน — ไม่ลบ/ไม่แก้คอลัมน์เดิม ไม่แตะ sales_orders', () => {
  assert.doesNotMatch(code, /\bDROP\s+(TABLE|COLUMN)\b/i);
  assert.doesNotMatch(code, /ALTER\s+COLUMN/i);
  assert.doesNotMatch(code, /sales_orders/, 'projectId ของ SO อยู่ในลายนิ้วมืออนุมัติ — งวดนี้ห้ามแตะ');
  for (const col of ['acOwnerId', 'acOwnerName', 'aeSupervisorId', 'aeSupervisorName', 'sourceScentDealId', 'timelineRev', 'timelineRevStale']) {
    assert.match(code, new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`), col);
  }
});

test('0435: ดีล SCENT ต้นทางเป็นคอลัมน์ใหม่ (ไม่ใช่ parentDealId) · ลบ SCENT แล้วปลดเอง · ชี้ตัวเองไม่ได้', () => {
  assert.doesNotMatch(code, /parentDealId/);
  assert.match(code, /FOREIGN KEY \("sourceScentDealId"\) REFERENCES public\.sales_deals\(id\) ON DELETE SET NULL/);
  assert.match(code, /CHECK \("sourceScentDealId" IS NULL OR "sourceScentDealId" <> id\)/);
});

test('0435: ฟังก์ชันเติมค่า — ซ้อมเป็นค่าตั้งต้น · ซ้อมแล้วโยนทิ้งทั้งบล็อก · เติมเฉพาะช่องว่าง', () => {
  const body = fnBody('backfill_deal_fields_from_projects');
  assert.match(code, /backfill_deal_fields_from_projects\(p_apply boolean DEFAULT false\)/);
  assert.match(body, /IF NOT p_apply THEN\s+RAISE EXCEPTION 'deal_backfill_dry_run';/);
  assert.match(body, /EXCEPTION WHEN raise_exception THEN\s+IF SQLERRM <> 'deal_backfill_dry_run' THEN\s+RAISE;/, 'error อื่นต้องดังต่อ ไม่ถูกกลืนเป็นผลซ้อม');
  for (const guard of ['d."acOwnerId" IS NULL', 'd."aeSupervisorId" IS NULL', 'n."sourceScentDealId" IS NULL', 't."dealId" IS NULL', 'd."timelineRev" IS NULL']) {
    assert.ok(body.includes(guard), `ต้องเติมเฉพาะช่องว่าง: ${guard}`);
  }
  assert.match(body, /ON CONFLICT \("dealId", "revNo"\) DO NOTHING/, 'คัด Rev. ซ้ำต้องไม่พัง');
  assert.match(code, /SELECT public\.backfill_deal_fields_from_projects\(false\) AS dry_run;\s*$/, 'ท้ายไฟล์รันแค่ผลซ้อม');
});

test('0435: NPD เลือก SCENT ที่ Won ก่อน (FC% เท่าเดิม) · งานกลางย้ายเฉพาะโครงการดีลเดียว', () => {
  const body = fnBody('backfill_deal_fields_from_projects');
  assert.match(body, /ORDER BY \(s\.stage IN \('won', 'in_project'\)\) DESC, s\."createdAt" ASC, s\.id ASC/);
  assert.match(body, /HAVING count\(\*\) = 1/);
});

test('0435: ย้ายงานกลางแล้วคืน revStale ของโครงการที่ยังไม่ stale · ย้ายก่อนคัด Rev.', () => {
  const body = fnBody('backfill_deal_fields_from_projects');
  const remember = body.indexOf('INTO v_fresh_projects');
  const move = body.indexOf('UPDATE public.project_tasks t');
  const restore = body.indexOf('WHERE id = ANY (v_fresh_projects)');
  const copyRev = body.indexOf('INSERT INTO public.deal_timeline_revisions');
  assert.ok(remember >= 0 && remember < move && move < restore && restore < copyRev);
});

test('0435: trigger แก้งาน ⇒ ดีลที่เคยออก Rev. ขึ้น "แก้แล้ว" (ทั้งดีลเก่าและใหม่เมื่อย้ายงาน)', () => {
  const body = fnBody('deal_mark_timeline_rev_stale');
  assert.match(body, /CASE WHEN TG_OP <> 'DELETE' THEN NEW\."dealId" END/);
  assert.match(body, /CASE WHEN TG_OP <> 'INSERT' THEN OLD\."dealId" END/);
  assert.match(body, /WHERE id IN \(v_new, v_old\)\s+AND "timelineRev" IS NOT NULL/);
  assert.match(code, /AFTER INSERT OR UPDATE OR DELETE ON public\.project_tasks\s+FOR EACH ROW EXECUTE FUNCTION public\.deal_mark_timeline_rev_stale\(\)/);
});

test('0435: สิทธิ์ — anon/authenticated เรียกฟังก์ชันและอ่านตาราง Rev. ไม่ได้', () => {
  assert.match(code, /REVOKE ALL ON FUNCTION public\.backfill_deal_fields_from_projects\(boolean\) FROM PUBLIC, anon, authenticated;/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.backfill_deal_fields_from_projects\(boolean\) TO service_role;/);
  assert.match(code, /REVOKE ALL ON FUNCTION public\.deal_mark_timeline_rev_stale\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(code, /ALTER TABLE public\.deal_timeline_revisions ENABLE ROW LEVEL SECURITY;/);
  assert.match(code, /REVOKE ALL ON TABLE public\.deal_timeline_revisions FROM anon, authenticated;/);
  assert.match(fnBody('backfill_deal_fields_from_projects'), /SECURITY DEFINER\s+SET search_path = public/);
});

test('ชื่อ AC/Sup บนดีลเป็นชื่อบนเอกสาร — ไม่อยู่ในลิสต์ซิงก์ชื่อตามบัญชี', () => {
  const fanOut = readFileSync(new URL('../personNameFanOut.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fanOut, /acOwnerName|aeSupervisorName/);
});
