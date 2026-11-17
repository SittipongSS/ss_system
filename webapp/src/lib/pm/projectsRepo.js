// Data-access helpers for PM projects — mirrors the lib/master/* repo pattern.
// Routes should load projects / team scope / next code through here instead of
// re-querying Supabase inline (which had drifted into 3 divergent copies).
import { userTeams } from '@/lib/permissions';

// Resolve a URL segment to a project. Internal ids ('PRJ-######') and human
// project codes ('PJ-YYMMNNN') never collide, so accept either: try id first,
// then fall back to code. Callers must use the returned row's real `id` for any
// project_tasks / project_products subqueries (those FK the internal id).
// (Canonical version — replaces the id-only copies that 404'd on a human code.)
export async function loadProject(supabase, idOrCode) {
  const { data, error } = await supabase
    .from('projects').select('*').eq('id', idOrCode).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: byCode, error: codeErr } = await supabase
    .from('projects').select('*').eq('code', idOrCode).maybeSingle();
  if (codeErr) throw codeErr;
  return byCode;
}

// Internal project ids for a team (used to scope project_tasks / personal_tasks).
// `team` รับได้ทั้งทีมเดียวและอาร์เรย์ (ผู้ใช้อยู่หลายทีม) — ไม่มีทีมเลย = ไม่มีโครงการ
export async function teamProjectIds(supabase, team) {
  const teams = userTeams(team);
  if (!teams.length) return [];
  /* 🔴 ลิสต์นี้เป็น **ขอบเขตการมองเห็น** — อ่านไม่ได้แล้วคืน [] แปลว่า
     "ทีมนี้ไม่มีโครงการ" ซึ่งอ่านเหมือนข้อมูลจริง ไม่ใช่ความผิดพลาด */
  const { data, error } = await supabase.from('projects').select('id').in('team', teams);
  if (error) throw error;
  return (data || []).map((p) => p.id);
}

/* ⚠️ งวด P3b-1 (ยุบโครงการ 16/11/2026): `deleteProjectDeep` + `projectHasExciseRegistrations` ถูกถอดพร้อม route
   `DELETE /api/pm/projects/[id]` — โครงการเป็นคลังอ่านอย่างเดียวตามมติเจ้าของ 16/11 ไม่มีทางลบจากแอปแล้ว */

// รหัสโครงการฐาน PJ-YYMMXXXX (เลขรัน 4 หลัก ต่อเดือน — mig 0096)
// แสดงเป็น PJ-YYMMXXXX-R ที่ฝั่ง UI/เอกสาร (R = currentRev ผ่าน entityCodeDisplay)
//
// ⚠️ **ไม่มีฟังก์ชัน "ขอรหัสมาถือไว้ก่อน" อีกแล้ว** (มติผู้ใช้ 2026-08-12) — รหัสออก
// พร้อม insert ในทรานแซกชันเดียวผ่าน insertRowWithEntityCode(supabase, 'PJ', row)
// ของ lib/entityCode.js (mig 0240) · ตัวเดิม generateProjectCode() จองเลขคนละคำสั่ง
// กับ insert ⇒ ทุก insert ที่ล้ม (รวมลูป retry ที่ออกรหัสใหม่ทุกรอบ) กินเลขทิ้ง
