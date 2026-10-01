// ── ทีมบนนัด — ชื่อคนไป + ผู้ช่วย (แผน operation-crew C10 · S2) ─────────────────────────
//
// ⭐ **ย้ายมาจาก `surveyRepo.loadSurveyCrew`** (หัวงานของจอประเมิน §10.5 S5) — คิวงานของช่าง (`my-visits`)
//    กับหน้างานของนัดทุกชนิดต้องถามคำถามเดียวกัน ⇒ ตัวเดียว · `surveyRepo` / `visitsRepo` export ต่อจากที่นี่
// ⚠️ **ไฟล์ใบ ไม่ import อะไรเลย** — `surveyRepo` ถูก import ตรง ๆ จากเทสต์หลายชุด ถ้าไฟล์นี้ลาก `@/lib/http`
//    (→ `next/headers`) เข้ามา เทสต์พวกนั้นล้มตั้งแต่โหลดโมดูล (ทางเดียวกับที่ visitsRepo ต้องต่อ hook)
//
// ⭐ **ถามบัญชีรายคนเฉพาะผู้ช่วย ไม่ไล่ทั้งทะเบียน** — `loadUserDirectory` ไล่ผู้ใช้ทั้งระบบทุกรอบ ขณะที่จอพวกนี้
//   โหลดใหม่ทุกครั้งที่กลับเข้าหน้า ⇒ `getUserById` ต่อคน ยิงขนานกัน (ท่าเดียวกับ `lib/pm/projectOwner.js`)
//   · ชื่อคนไปมีบนนัดอยู่แล้ว (`assigneeName`) ไม่ต้องถาม
// ⭐ **หนึ่งคนหนึ่งครั้งต่อคำขอ** (C10) — คิวงานหนึ่งหน้ามีหลายนัดที่ผู้ช่วยคนเดียวกันซ้ำกัน ⇒ ผู้เรียกรวม id
//   ของทั้งคำตอบแล้วถาม `loadCrewNames` ครั้งเดียว ค่อยประกอบทีมรายนัดด้วย `visitCrewFrom`
// ⚠️ **"คุณ" ตอบโดย server** (`you`) — จอไม่รู้ user id ของตัวเอง (ท่าเดียวกับ `canWrite` · `onVisit`)
// 🔴 **อ่านชื่อไม่สำเร็จ ≠ ไม่มีคนนี้** (กติกา supabase-never-throws) — ล้ม = ชื่อ `null` + `unknown` ให้จอเขียน
//   "ไม่ทราบ" · บัญชีที่ถูกลบไปแล้ว = `gone` (จอเขียนว่าไม่อยู่ในรายชื่อแล้ว) · ไม่ตีกลับทั้งเส้น — ชื่อผู้ช่วย
//   เป็นของประกอบ งานของวันอ่านได้แล้ว

const cleanId = (id) => (id != null && id !== '' ? String(id) : null);

/** ผู้ช่วยของนัด (ตัดซ้ำ · ตัดค่าว่าง · ตัดคนไปที่ถูกใส่ซ้ำเป็นผู้ช่วย) ตามลำดับบนนัด */
export function visitHelperIds(visit) {
  const leadId = cleanId(visit?.assigneeId);
  return [...new Set((Array.isArray(visit?.assistantIds) ? visit.assistantIds : [])
    .map(cleanId).filter(Boolean))]
    .filter((id) => id !== leadId);
}

/**
 * บทบาทของคนหนึ่งบนนัด — `'lead'` (คนไป) · `'helper'` (ผู้ช่วย) · `null` (ไม่ได้อยู่ในทีมของใบนี้)
 * ⭐ คำถามเดียวของคิวงาน (`enrichMyWork` → `crewRole` ของเจ้าของคิว) กับหน้างาน (GET ของนัด → `viewerRole`
 *    ของคนเปิดจอ · จอช่างเขียน "งานนี้ไม่ได้มอบให้คุณ" เมื่อเป็น `null`) ⇒ ตัวเดียว ไม่ใช่สองสำเนา
 */
export function visitCrewRole(visit, personId) {
  const person = cleanId(personId);
  if (!visit || !person) return null;
  if (cleanId(visit.assigneeId) === person) return 'lead';
  return visitHelperIds(visit).includes(person) ? 'helper' : null;
}

/**
 * ชื่อที่แสดงของผู้ใช้หลายคน — ถามบัญชี **ครั้งเดียวต่อ id ที่ไม่ซ้ำ** (ยิงขนานกัน)
 * @returns `Map<id, { name } | { name: null, gone: true } | { name: null, failed: true }>`
 */
export async function loadCrewNames(supabase, ids = []) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(cleanId).filter(Boolean))];
  const hits = await Promise.all(unique.map(async (id) => {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error) {
        // "ไม่พบ" = บัญชีถูกลบไปแล้ว ไม่ใช่อ่านพลาด
        if (error.status === 404 || /not.?found/i.test(error.message || '')) return [id, { name: null, gone: true }];
        throw error;
      }
      const user = data?.user || null;
      if (!user) return [id, { name: null, gone: true }];
      // ชื่อที่แสดง — กติกาเดียวกับทะเบียนผู้ใช้ (`loadUserDirectory`: ชื่อในบัญชี → อีเมล)
      return [id, { name: String(user.user_metadata?.name || user.email || '').trim() || null }];
    } catch (e) {
      console.error('[service-crew] อ่านชื่อผู้ช่วยบนนัดไม่สำเร็จ', id, e?.message || e);
      return [id, { name: null, failed: true }];
    }
  }));
  return new Map(hits);
}

/**
 * ทีมของนัดหนึ่งใบจากชื่อที่ถามไว้แล้ว (ไม่ยิงอะไร)
 * @returns `{ crew: [{ id, name, lead, you, gone? }], unknown: boolean }` — คนไปก่อน แล้วผู้ช่วยตามลำดับบนนัด
 */
export function visitCrewFrom(visit, names = new Map(), { viewerId = null } = {}) {
  if (!visit) return { crew: [], unknown: false };
  const me = cleanId(viewerId);
  const leadId = cleanId(visit.assigneeId);
  const crew = [];
  let unknown = false;
  if (leadId || visit.assigneeName) {
    crew.push({ id: leadId, name: visit.assigneeName || null, lead: true, you: !!me && me === leadId });
  }
  for (const id of visitHelperIds(visit)) {
    // ไม่มีในชุดที่ถาม = ผู้เรียกลืมรวม id นี้ — ถือว่าไม่ทราบ ไม่ใช่ "ไม่มีคนนี้"
    const hit = names.get(id) || { name: null, failed: true };
    if (hit.failed) unknown = true;
    crew.push({
      id, name: hit.name ?? null, lead: false, you: !!me && me === id,
      ...(hit.gone ? { gone: true } : {}),
    });
  }
  return { crew, unknown };
}

/** ทีมของนัดใบเดียว — ถามชื่อเฉพาะเมื่อมีผู้ช่วย (ไม่มีผู้ช่วย = ไม่ยิงอะไรเลย) */
export async function loadVisitCrew(supabase, visit, { viewerId = null } = {}) {
  if (!visit) return { crew: [], unknown: false };
  const helperIds = visitHelperIds(visit);
  const names = helperIds.length ? await loadCrewNames(supabase, helperIds) : new Map();
  return visitCrewFrom(visit, names, { viewerId });
}
