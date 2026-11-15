// ── AC ผู้ประสานงาน + AE Supervisor บนดีล (ยุบดีล/โครงการ งวด P2c-1 · มติเจ้าของ 13/11/2026 ② ⑤) ─────────────
//
// ② สองช่องนี้ย้ายจากโครงการมาอยู่บนดีล (mig 0435 · backfill จากโครงการแล้ว) — เลือกเองทุกดีล แก้ได้
// ⑤ **บังคับทุกครั้งที่บันทึกฟอร์มดีล** (ฝั่งจอ: `missingDealFieldKeys` ของ lib/sales/dealRequiredFields.js) (POST ทุกครั้ง · PATCH ที่เป็นการบันทึกฟอร์ม `isDealFormSave`) — ดีลเก่าที่ยังว่าง
//    ต้องเลือกก่อนบันทึก · PATCH แบบ action (เปลี่ยนขั้น · ผูก/ปลด) ไม่โดน · ดีลของใบสั่งขายย้อนหลัง (ภาชนะระบบ) ไม่บังคับ
//
// ตัวตรวจคนเป็นชุดเดียวกับโครงการ (`resolveProjectAcOwner` · `resolveProjectSupervisor` — lib/pm/projectOwner.js):
// AC ต้องเป็นสาย AC + ทีมทับกับทีมของดีล · Sup ต้องเป็นหัวหน้าฝ่ายขาย (ไม่มีด่านทีม) · บัญชีไม่ถูกระงับ
// ชื่อที่เก็บ (`acOwnerName` · `aeSupervisorName`) = ชื่อบนเอกสาร (กระดาษ FM-PD-05 · PDR) — **ไม่อยู่ในลิสต์ซิงก์ชื่อ**
// ตามบัญชี (personNameFanOut) · ตรวจซ้ำทุกครั้งที่ฟอร์มส่งมา จึงเติมชื่อปัจจุบันให้เองตอนบันทึก
import { resolveProjectAcOwner, resolveProjectSupervisor } from '@/lib/pm/projectOwner';

export const DEAL_PEOPLE_KEYS = Object.freeze(['acOwnerId', 'aeSupervisorId']);

const clean = (value) => String(value ?? '').trim();

/**
 * ตัดสิน AC + Sup ของดีลจากคำขอ — คืน `{ ok: true, patch }` (ช่องที่จะเขียน) หรือ `{ ok: false, error }`
 * @param body คำขอ (POST/PATCH)
 * @param current แถวดีลเดิม (PATCH) · null = สร้างใหม่
 * @param team ทีมของดีลหลังบันทึก (ด่านทีมของ AC)
 * @param required บังคับมีทั้งสองช่อง (ฟอร์ม) หรือไม่
 */
export async function resolveDealPeople(supabase, { body = {}, current = null, team = null, required = false } = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
  const patch = {};

  const acId = has('acOwnerId') ? clean(body.acOwnerId) : clean(current?.acOwnerId);
  if (!acId && (required || (has('acOwnerId') && clean(current?.acOwnerId)))) {
    return { ok: false, error: 'ต้องเลือกผู้ประสานงาน (AC) ของดีล' };
  }
  if (has('acOwnerId') && acId) {
    const checked = await resolveProjectAcOwner(supabase, acId, team, { required: true, subject: 'ดีล' });
    if (!checked.ok) return checked;
    patch.acOwnerId = checked.acOwnerId;
    patch.acOwnerName = checked.acOwner;
  }

  const supId = has('aeSupervisorId') ? clean(body.aeSupervisorId) : clean(current?.aeSupervisorId);
  if (!supId && (required || (has('aeSupervisorId') && clean(current?.aeSupervisorId)))) {
    return { ok: false, error: 'ต้องเลือกผู้ตรวจสอบ (AE Supervisor) ของดีล' };
  }
  if (has('aeSupervisorId') && supId) {
    const checked = await resolveProjectSupervisor(supabase, supId, { required: true, subject: 'ดีล' });
    if (!checked.ok) return checked;
    patch.aeSupervisorId = checked.aeSupervisorId;
    patch.aeSupervisorName = checked.aeSupervisor;
  }
  return { ok: true, patch };
}
