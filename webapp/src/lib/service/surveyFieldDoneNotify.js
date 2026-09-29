// ── กระดิ่ง "ช่างส่งงานหน้างานแล้ว" ถึงหัวหน้า TS (มติผู้ใช้ 2026-09-21) ────────
//
// ⭐ flow ของใบประเมิน: ช่างรับงาน → ใส่รายละเอียด → รูป → **ส่งงาน** แล้วหัวหน้าเคาะจุด
//   ติดตั้ง/แพ็คเกจทีหลัง ก่อนกดส่งผลให้ฝ่ายขาย
// 🐞 **ก่อนมีตัวนี้ หัวหน้าไม่รู้ว่าถึงคิวตัวเองแล้ว** — ช่างปิดนัดลงแค่เธรดของ *นัด*
//   ซึ่งไม่มีใครติดตาม · ใบค้างสถานะ "วัดครบแล้ว — รอหัวหน้าเคาะ" จนมีคนบังเอิญเปิด
//
// ⭐ **ผู้รับ = หัวหน้าที่ส่งผลได้จริง** (`SERVICE_HEAD_ROLES` — ตัวเดียวกับ
//   `canSendSurveyResult`) · มติ 2026-09-21 "officer = หัวหน้าสามตำแหน่งตามเดิม"
//   ⚠️ ยิงหา Planner ไม่ได้ — เขาเคาะแพ็คเกจไม่ได้ กระดิ่งที่ทำอะไรต่อไม่ได้คือเสียงรบกวน
//
// ⚠️ **href ไปแท็บสรุปส่งผล** — ที่เดียวที่เคาะได้ · ไม่ใช่หน้าคำร้อง
// ⚠️ **kind ประกาศตรง ๆ ที่นี่** และต้องอยู่ใน `SERVICE_BELL_KINDS` (เทสต์ตรึงไว้)
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';
import { SERVICE_HEAD_ROLES, normalizeRole } from '@/lib/permissions';
import { surveySendBackDoneCountText } from '@/lib/service/survey';
import { loadUserDirectory } from '@/lib/usersRepo';

export const SURVEY_FIELD_DONE_KIND = 'survey_field_done';
export const SURVEY_SEND_BACK_DONE_KIND = 'survey_send_back_done';

/** ปลายทางของกระดิ่ง — แท็บที่หัวหน้าเคาะจุด/แพ็คเกจ */
export const surveyFieldDoneHref = (requestId) => `/service/surveys/${requestId}?tab=result`;

/**
 * ใครได้รับ + ข้อความ — ฟังก์ชันบริสุทธิ์ เทสต์ได้โดยไม่ต้องมี DB
 *
 * @param request   แถว `dept_requests` (ใช้ id · docNo · title)
 * @param visit     นัดหลังปิด (ใช้ id · updatedAt เป็นกุญแจกันซ้ำ)
 * @param users     รายชื่อผู้ใช้ (`loadUserDirectory` แปลงเป็นอาร์เรย์)
 * @param actor     คนกดส่งงาน `{ id, name }` — ไม่เด้งใส่ตัวเอง (Senior เป็นทั้งช่างและหัวหน้า)
 * @param progress  `surveyFieldProgress` ของใบ · `cut` = จำนวนพื้นที่ที่ตัดออก
 * @returns payload ของ `notifyUsers` หรือ null เมื่อไม่มีใครต้องรู้
 */
export function surveyFieldDoneNotice({ request, visit, users = [], actor = null, progress = null, cut = 0 } = {}) {
  if (!request?.id || !visit?.id) return null;
  const actorId = actor?.id ? String(actor.id) : null;
  const userIds = [...new Set((users || [])
    .filter((u) => u && !u.disabled && SERVICE_HEAD_ROLES.includes(normalizeRole(u.role)))
    .map((u) => String(u.id)))]
    .filter((id) => id !== actorId);
  if (!userIds.length) return null;

  const doc = request.docNo || request.title || 'ใบประเมิน';
  const who = actor?.name || 'ช่าง';
  const measured = progress?.total ? `วัด ${progress.done}/${progress.total} พื้นที่` : null;
  const cutText = cut > 0 ? `ตัดออก ${cut}` : null;
  const facts = [measured, cutText].filter(Boolean).join(' · ');
  return {
    userIds,
    entityType: 'dept_request',
    entityId: request.id,
    kind: SURVEY_FIELD_DONE_KIND,
    title: `ช่างส่งงานหน้างานแล้ว · ${doc}`,
    body: `${who} ส่งงาน${request.title ? ` ${request.title}` : ''}${facts ? ` (${facts})` : ''}`
      + ' — รอเคาะจุดติดตั้งและแพ็คเกจ แล้วส่งผลให้ฝ่ายขาย',
    // หนึ่งการส่งหนึ่งกระดิ่ง — ส่งซ้ำหลังเปิดนัดกลับมาได้เวลาใหม่ ⇒ ไม่ถูกกลืน
    dedupeKey: `survey-field-done:${visit.id}:${String(visit.updatedAt || '').slice(0, 19)}`,
    href: surveyFieldDoneHref(request.id),
  };
}

/* หัวหน้าที่ได้รับ — ตำแหน่งที่ส่งผลได้จริง (บัญชีที่ปิดแล้วไม่นับ) · ไม่เด้งใส่คนกดเอง */
const headIds = (users, actorId, extraIds = []) => [...new Set([
  ...(users || [])
    .filter((u) => u && !u.disabled && SERVICE_HEAD_ROLES.includes(normalizeRole(u.role)))
    .map((u) => String(u.id)),
  ...extraIds.filter(Boolean).map(String),
])].filter((id) => id !== (actorId ? String(actorId) : null));

/**
 * กระดิ่ง "ช่างแจ้งว่าแก้แล้ว" (มติผู้ใช้ 2026-09-22) — ปิดวงของ "แจ้งช่างให้กลับไป"
 * ⭐ ผู้รับ = หัวหน้าที่ส่งผลได้ **รวมคนที่กดส่งกลับเสมอ** (แอดมินที่ส่งกลับแทนหัวหน้าไม่อยู่
 *   ในลิสต์ตำแหน่ง แต่เป็นคนที่รอคำตอบนี้อยู่จริง)
 * @param sentBack   `surveySendBackState().sentBack` — ใครส่งกลับ ด้วยข้อไหนบ้าง
 * @param doneItems  เลขข้อที่ช่างติ๊ก (`surveySendBackDoneItems().value`) · `null` = ไม่รู้ (แท็บเก่า)
 * @param itemCount  ส่งกลับไปกี่ข้อ
 */
export function surveySendBackDoneNotice({
  request, users = [], actor = null, sentBack = null, note = '', doneId = null, doneItems = null, itemCount = null,
} = {}) {
  if (!request?.id) return null;
  const userIds = headIds(users, actor?.id, [sentBack?.byId]);
  if (!userIds.length) return null;
  const doc = request.docNo || request.title || 'ใบประเมิน';
  const who = actor?.name || 'ช่าง';
  /* ⚠️ กระดิ่งเป็นบรรทัดเดียว — ข้อที่ขอไปคั่นด้วยจุด ไม่ใช่ `\n` ของ note (ขึ้นบรรทัดกลางกระดิ่งไม่ได้) */
  const asks = Array.isArray(sentBack?.items) && sentBack.items.length
    ? sentBack.items.join(' · ')
    : String(sentBack?.note || '');
  const asked = asks ? ` (ที่แจ้งไว้: ${asks.slice(0, 120)})` : '';
  const count = Array.isArray(doneItems) ? surveySendBackDoneCountText(doneItems.length, itemCount) : null;
  const ticked = count ? ` · แก้แล้ว ${count}` : '';
  const said = String(note || '').trim() ? ` — ${String(note).trim().slice(0, 200)}` : '';
  return {
    userIds,
    entityType: 'dept_request',
    entityId: request.id,
    kind: SURVEY_SEND_BACK_DONE_KIND,
    title: `ช่างแจ้งว่าแก้แล้ว · ${doc}`,
    body: `${who} แก้ตามที่หัวหน้าส่งกลับ${asked}${ticked}${said} — ตรวจแล้วเคาะจุดและแพ็คเกจต่อได้`,
    dedupeKey: `survey-send-back-done:${request.id}:${doneId || String(sentBack?.at || '').slice(0, 19)}`,
    href: surveyFieldDoneHref(request.id),
  };
}

export function notifySurveySendBackDone(supabase, {
  request, actor, sentBack, note, doneId, doneItems = null, itemCount = null,
} = {}) {
  const deliver = async () => {
    const directory = await loadUserDirectory(supabase);
    const notice = surveySendBackDoneNotice({
      request, users: [...directory.values()], actor, sentBack, note, doneId, doneItems, itemCount,
    });
    if (!notice) return;
    await notifyUsers(supabase, { ...notice, actorName: actor?.name || null });
  };
  const safe = () => deliver().catch((e) => console.error('[survey-send-back-done] แจ้งหัวหน้าไม่สำเร็จ:', e?.message));
  try {
    after(safe);
  } catch {
    safe();
  }
}

/**
 * ยิงจริง — fire-and-forget หลังปิดนัดสำเร็จแล้ว
 * ⚠️ กระดิ่งที่พลาดต้องไม่ทำให้การส่งงานตอบ error — ช่างมาส่งงาน ไม่ได้มาส่งแจ้งเตือน
 */
export function notifySurveyFieldDone(supabase, { request, visit, actor, progress, cut } = {}) {
  const deliver = async () => {
    const directory = await loadUserDirectory(supabase);
    const notice = surveyFieldDoneNotice({
      request, visit, users: [...directory.values()], actor, progress, cut,
    });
    if (!notice) return;
    await notifyUsers(supabase, { ...notice, actorName: actor?.name || null });
  };
  const safe = () => deliver().catch((e) => console.error('[survey-field-done] แจ้งหัวหน้าไม่สำเร็จ:', e?.message));
  try {
    after(safe);
  } catch {
    safe();
  }
}
