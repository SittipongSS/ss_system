// ── Central audit log helper ──────────────────────────────────────────
// Phase 5.3 ของ BOUNDARY_MAP: จุดเดียวที่ทุกโมดูลเรียกเพื่อบันทึก "ใครทำอะไร
// เมื่อไหร่" ลงตาราง audit_logs (migration 0049). เขียนผ่าน service-role
// (getSupabaseAdmin) เพราะ DB trigger ไม่รู้ตัวตน user จริง (API ต่อด้วย service-role).
//
// หลักการ:
//   • audit ต้อง "ไม่มีวันทำให้ action ของผู้ใช้พัง" — insert ห่อ try/catch
//     เสมอ. action สำเร็จไปแล้วก่อนถึงตรงนี้; log พลาดก็แค่ log.error ทิ้ง.
//   • actor* เป็น snapshot ตัวตน ณ เวลานั้น (จาก getCurrentUser()).
//   • before/after เก็บ record เต็มเป็น jsonb (กู้คืน manual + ดูย้อนหลังได้).
//
// การใช้งานในroute handler (หลัง write สำเร็จ):
//   await recordAudit({ user, action: 'update', entityType: 'customer',
//                       entityId: id, before, after: updated, request });
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// Fields ที่ไม่ถือว่าเป็น "การเปลี่ยนแปลงที่มีความหมาย" ในการ diff (timestamp ระบบ).
const NOISE_KEYS = new Set(['updatedAt', 'createdAt']);

// รายชื่อ key ที่ค่าต่างกันระหว่าง before → after (shallow, เทียบด้วย JSON).
function diffKeys(before, after) {
  if (!before || !after) return null;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const k of keys) {
    if (NOISE_KEYS.has(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
  }
  return changed;
}

// ดึง client IP จาก header ของ proxy (Vercel ใส่ x-forwarded-for ให้).
function ipFrom(request) {
  try {
    const xff = request?.headers?.get?.('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return request?.headers?.get?.('x-real-ip') || null;
  } catch {
    return null;
  }
}

/**
 * บันทึกหนึ่ง audit entry. ไม่ throw — ถ้าพลาดจะ log.error แล้วผ่านไป.
 * @param {object}  p
 * @param {object}  p.user        ผลจาก getCurrentUser() — { id, role, team, name }
 * @param {string}  p.action      'create' | 'update' | 'delete'
 * @param {string}  p.entityType  'customer' | 'product' | 'order' | ...
 * @param {string}  p.entityId    id ของ record
 * @param {object} [p.before]     record ก่อนเปลี่ยน (update/delete)
 * @param {object} [p.after]      record หลังเปลี่ยน (create/update)
 * @param {string} [p.summary]    คำอธิบายสั้นๆ (ถ้าไม่ส่งจะ auto-generate)
 * @param {Request}[p.request]    Request object — ใช้ดึง IP (optional)
 */
export async function recordAudit({
  user, action, entityType, entityId,
  before = null, after = null, summary = null, request = null,
}) {
  try {
    const supabase = getSupabaseAdmin();
    const changedKeys = action === 'update' ? diffKeys(before, after) : null;
    await supabase.from('audit_logs').insert({
      actorId: user?.id != null ? String(user.id) : null,
      actorName: user?.name ?? null,
      actorRole: user?.role ?? null,
      actorTeam: user?.team ?? null,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      summary: summary || defaultSummary({ action, entityType, after, before }),
      changedKeys,
      before,
      after,
      ipAddress: ipFrom(request),
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    // Audit ต้องไม่พัง action ของผู้ใช้ — log แล้วกลืน error.
    console.error('[audit] record failed', action, entityType, entityId, e?.message || e);
  }
}

// Snapshot ที่ปลอดภัยของ Supabase auth user สำหรับ audit (entityType 'user').
// **ห้ามมี password/token เด็ดขาด** — เก็บเฉพาะ field ที่จำเป็นต่อการตรวจสอบ
// (ใคร/role/team/ฝ่าย/สถานะบัญชี). รับ admin user object (จาก auth.admin.*).
export function userAuditSnapshot(u) {
  if (!u) return null;
  const m = u.user_metadata || {};
  const a = u.app_metadata || {};
  return {
    id: u.id,
    email: u.email,
    name: m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || null,
    phone: m.phone || null,
    role: a.role || null,
    team: a.team || null,
    department: a.department || null,
    disabled: !!u.banned_until && new Date(u.banned_until) > new Date(),
  };
}

// คำอธิบายเริ่มต้น (ใช้ชื่อ entity ที่อ่านง่ายถ้ามี).
function defaultSummary({ action, entityType, after, before }) {
  const rec = after || before || {};
  const label = rec.name || rec.productDescription || rec.productDescriptionEn || rec.quotationRef || rec.id || '';
  const verb = action === 'create' ? 'สร้าง' : action === 'delete' ? 'ลบ' : 'แก้ไข';
  return `${verb}${entityType}${label ? ` ${label}` : ''}`.trim();
}
