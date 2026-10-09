// ── กระดิ่งของการสลับวิธีประเมิน (งวด S2a §2.3 · แผน survey-desk-assessment §3.5) ──────────────
//
// สองชนิด:
//   `survey_method_changed` → **ช่างบนนัด** — นัดถูกยกเลิก หรือพื้นที่ที่ไม่ต้องวัดแล้ว
//   `survey_desk_ready`     → **หัวหน้าคนอื่น** — ใบกลายเป็นงานประเมินจากแบบ รอหัวหน้าประเมิน
//
// ⭐ **ประโยคมาจากแผน** (`surveyMethodSwitchPlan().bells`) — ไฟล์นี้ไม่แต่งประโยคเอง
//   ⇒ กล่องยืนยันที่บอกว่า "ช่างได้รับแจ้ง" กับกระดิ่งที่ช่างได้ เป็นคำเดียวกันเสมอ
//
// 🔴 **กุญแจ (`key`) บังคับ — ไม่มี = ไม่ยิง** · กระดิ่งกันซ้ำถาวรที่ unique index `(userId, updateId = dedupeKey)`
//   กุญแจที่ลงท้ายด้วย `undefined` จะเท่ากันทุกครั้ง ⇒ กระดิ่งของการสลับครั้งถัด ๆ ไปของใบนั้นถูกกลืนเงียบตลอดไป
//   ผู้เรียก: ตัวเขียนของแผนส่งกุญแจของการกดครั้งนั้น (`userId|actionId`) · route พื้นที่ส่งกุญแจของเหตุการณ์ของตัวเอง
//
// ⚠️ **href ของช่างชี้ไปจอของฝ่ายบริการ ไม่ใช่หน้าคำร้อง** — role `ts` เปิดหน้าคำร้องไม่ได้ (403)
// ⚠️ สอง kind ต้องอยู่ใน `SERVICE_BELL_KINDS` (`lib/notifications.js`) — เทสต์ตรึงไว้
// ⚠️ กระดิ่งที่พลาดต้องไม่ทำให้การสลับตอบ error — ยิงแบบ fire-and-forget ท่าเดียวกับ `surveyFieldDoneNotify.js`
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';
import { SERVICE_HEAD_ROLES, normalizeRole } from '@/lib/permissions';
import { surveyFieldDoneHref } from '@/lib/service/surveyFieldDoneNotify';
import { loadUserDirectory } from '@/lib/usersRepo';

export const SURVEY_METHOD_CREW_KIND = 'survey_method_changed';
export const SURVEY_DESK_READY_KIND = 'survey_desk_ready';

const idsWithout = (ids, actorId) => [...new Set(ids.filter((id) => id != null && id !== '').map(String))]
  .filter((id) => id !== (actorId != null ? String(actorId) : null));

/**
 * กระดิ่งถึงช่างบนนัด — ฟังก์ชันบริสุทธิ์ · คืน payload ของ `notifyUsers` หรือ `null` เมื่อไม่มีอะไรต้องยิง
 *
 * @param request  แถว `dept_requests` (ใช้ id · docNo · title)
 * @param visit    นัดของใบ (ใช้ assigneeId · assistantIds) — `plan.visit` ใช้ได้ตรง ๆ
 * @param bell     `plan.bells.crew` — `{ kind: 'cancel' | 'zones', title }`
 * @param reason   เหตุผลที่หัวหน้าพิมพ์ (ต่อท้ายเนื้อ)
 * @param actor    คนกด `{ id, name }` — ไม่เด้งใส่ตัวเอง (Senior เป็นทั้งหัวหน้าและคนออกหน้างาน)
 * @param key      กุญแจกันซ้ำของเหตุการณ์ — **ไม่มี = `null`**
 */
export function surveyMethodCrewNotice({ request, visit, bell, reason, actor = null, key } = {}) {
  if (!key || !request?.id || !visit || !bell?.title) return null;
  const assistants = Array.isArray(visit.assistantIds) ? visit.assistantIds : [];
  const userIds = idsWithout([visit.assigneeId, ...assistants], actor?.id);
  if (!userIds.length) return null;
  const why = String(reason ?? '').trim();
  return {
    userIds,
    entityType: 'dept_request',
    entityId: request.id,
    kind: SURVEY_METHOD_CREW_KIND,
    title: bell.title,
    body: `${request.docNo || ''} ${request.title || ''}`.trim() + (why ? ` — ${why}` : ''),
    dedupeKey: `survey-method:${request.id}:${key}`,
    href: `/service/surveys/${request.id}`,
  };
}

/**
 * กระดิ่งถึงหัวหน้าที่ส่งผลได้ (`SERVICE_HEAD_ROLES` · บัญชีที่ปิดแล้วไม่นับ) ลบคนกด
 * — ปลายทางคือแท็บสรุปส่งผล ที่เดียวที่หัวหน้าประเมินต่อได้
 *
 * @param users  รายชื่อผู้ใช้ (`loadUserDirectory` แปลงเป็นอาร์เรย์)
 * @param title  ประโยคของแผน (`plan.bells.head.title`)
 * @param key    กุญแจกันซ้ำของเหตุการณ์ — **ไม่มี = `null`**
 */
export function surveyDeskReadyNotice({ request, users = [], actor = null, title, key } = {}) {
  if (!key || !request?.id || !title) return null;
  const heads = (users || [])
    .filter((u) => u && !u.disabled && SERVICE_HEAD_ROLES.includes(normalizeRole(u.role)))
    .map((u) => u.id);
  const userIds = idsWithout(heads, actor?.id);
  if (!userIds.length) return null;
  return {
    userIds,
    entityType: 'dept_request',
    entityId: request.id,
    kind: SURVEY_DESK_READY_KIND,
    title,
    body: request.title || '',
    dedupeKey: `survey-desk-ready:${request.id}:${key}`,
    href: surveyFieldDoneHref(request.id),
  };
}

/* ยิงหลังตอบ request แล้ว (`after`) · นอก request scope (`after` โยน) ก็ยิงทันทีแทน — ไม่มีทางไหนโยนกลับไปหาผู้เรียก */
function fire(label, deliver) {
  const safe = () => Promise.resolve().then(deliver)
    .catch((e) => console.error(`[${label}] แจ้งเตือนไม่สำเร็จ:`, e?.message));
  try {
    after(safe);
  } catch {
    safe();
  }
}

/** ยิงกระดิ่งช่าง — fire-and-forget · อาร์กิวเมนต์ชุดเดียวกับ `surveyMethodCrewNotice` */
export function notifySurveyMethodCrew(supabase, args = {}) {
  const notice = surveyMethodCrewNotice(args || {});
  if (!notice) return;
  fire('survey-method-crew', () => notifyUsers(supabase, { ...notice, actorName: args.actor?.name || null }));
}

/** ยิงกระดิ่งหัวหน้า — fire-and-forget · `{ request, actor, title, key }` (รายชื่อผู้ใช้โหลดเอง) */
export function notifySurveyDeskReady(supabase, args = {}) {
  const { request, actor = null, title, key } = args || {};
  // ไม่มีทางได้กระดิ่ง = ไม่ต้องโหลดรายชื่อทั้งระบบ
  if (!key || !request?.id || !title) return;
  fire('survey-desk-ready', async () => {
    const directory = await loadUserDirectory(supabase);
    const notice = surveyDeskReadyNotice({ request, users: [...directory.values()], actor, title, key });
    if (!notice) return;
    await notifyUsers(supabase, { ...notice, actorName: actor?.name || null });
  });
}
