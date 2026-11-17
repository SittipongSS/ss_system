// ── "ดีล SCENT ต้นทาง" ของดีล NPD (ยุบดีล/โครงการ งวด P2c-2 · มติเจ้าของ 13/11/2026 ③) ─────────────────────
//
// กติกา FC "SCENT ปิด Won ⇒ NPD ขึ้น 80" (lib/sales/dealProbability.js) จับคู่ด้วยช่องนี้แทน "ดีลในโครงการเดียวกัน"
// · ไม่บังคับ · เลือกได้เฉพาะดีล NPD · ต้นทางต้องเป็นดีล SCENT ของลูกค้าเดียวกันที่ยังไม่ Lost · ชี้ตัวเองไม่ได้ (CHECK ในฐาน)
// · เปลี่ยนประเภทออกจาก NPD = ถอดต้นทางให้เอง (ช่องนี้ไม่มีความหมายกับดีลประเภทอื่น)
// ⚠️ ไฟล์นี้อ่านแถวดีลต้นทางเอง (ผู้เรียกผ่านด่านของดีลตัวเองแล้ว) — แถวต้นทางเป็นข้อมูลอ้างอิงที่ดีลชี้ ไม่ใช่สิ่งที่ถูกแก้
import { normalizeDealType } from '@/lib/salesPlanning';

const clean = (value) => String(value ?? '').trim();
const typeOf = (deal) => normalizeDealType(deal?.dealType ?? deal?.metadata?.projectType);

/**
 * ตัดสินช่อง sourceScentDealId จากคำขอ — คืน `{ ok: true, patch }` หรือ `{ ok: false, error }`
 * @param body คำขอ (POST/PATCH)
 * @param current แถวดีลเดิม (PATCH) · null = สร้างใหม่
 * @param next { dealType, customerId } ของดีลหลังบันทึก
 */
export async function resolveSourceScent(supabase, { body = {}, current = null, next = {} } = {}) {
  const has = Object.prototype.hasOwnProperty.call(body || {}, 'sourceScentDealId');
  const nextType = normalizeDealType(next.dealType);
  const id = has ? clean(body.sourceScentDealId) : clean(current?.sourceScentDealId);

  if (nextType !== 'NPD') {
    if (has && id) return { ok: false, error: 'เลือกดีล SCENT ต้นทางได้เฉพาะดีลประเภท NPD' };
    // เปลี่ยนประเภทออกจาก NPD แล้วยังถือต้นทางเดิม = ถอดให้เอง
    return { ok: true, patch: current?.sourceScentDealId ? { sourceScentDealId: null } : {} };
  }
  if (!has) return { ok: true, patch: {} };
  if (!id) return { ok: true, patch: { sourceScentDealId: null } };
  if (current?.id && id === current.id) return { ok: false, error: 'ดีลชี้ตัวเองเป็นดีล SCENT ต้นทางไม่ได้' };

  const { data: source, error } = await supabase
    .from('sales_deals').select('id, code, dealType, metadata, stage, customerId')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!source) return { ok: false, error: 'ไม่พบดีล SCENT ต้นทางที่เลือก' };
  if (typeOf(source) !== 'SCENT') return { ok: false, error: `ดีล ${source.code || id} ไม่ใช่ดีลประเภท SCENT` };
  if (source.stage === 'lost') return { ok: false, error: `ดีล SCENT ${source.code || id} ปิด Lost ไปแล้ว — เลือกใบอื่น` };
  if (next.customerId && source.customerId && source.customerId !== next.customerId) {
    return { ok: false, error: 'ดีล SCENT ต้นทางต้องเป็นของลูกค้ารายเดียวกับดีลนี้' };
  }
  return { ok: true, patch: { sourceScentDealId: source.id } };
}
