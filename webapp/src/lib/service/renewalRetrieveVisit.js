// ── นัดถอนเครื่องอัตโนมัติเมื่อลูกค้าไม่ต่อสัญญา (PR-E · มติผู้ใช้ 2026-09-01) ──
//
// ⭐ **ปิดเรื่อง "ไม่ต่อ" ต้องสร้างนัดจริง ไม่ใช่แค่พูดว่าจะสร้าง** — โมดัลบันทึกผล
//   เขียนไว้เองว่า "ฝ่ายบริการจะได้งานถอนเครื่อง" (`FOLLOWUP_RESULT_HINTS.declined`)
//   แต่ก่อนหน้านี้ไม่มีโค้ดจุดไหนทำจริง ⇒ ผู้ใช้กดปิดเรื่องแล้วเข้าใจว่า TS รู้แล้ว
//   ทั้งที่ยังไม่มีใครรู้ (พบตอนเทียบ UI ที่ออกแบบกับของจริง 2026-09-01)
//
// ⚠️ **แยกไฟล์นี้จาก `lib/service/renewals.js`** — ไฟล์นั้นถูก import ฝั่งเบราว์เซอร์
//   (โมดัลบันทึกผล) จึงต้องไม่แตะ supabase/server-only ⇒ ตรรกะสร้างแถวจริงมาอยู่ที่นี่
//
// ⚠️ **สร้างเป็นร่างเสมอ ไม่ใช่ขึ้นตารางทันที** — ยังไม่มีเจ้าหน้าที่ ⇒ ด่านเข้าไซต์
//   (`initialVisitStatus`) ตัดสินเองว่าติดข้อ "ยังไม่มอบหมาย" แล้วจอดเป็น `draft`
//   TS มากด "มอบหมาย" จากคิว "รอจัด" ทีหลัง — แพตเทิร์นเดียวกับนัดทุกชนิดในโมดูลนี้
//   ⚠️ ชนิด `remove` ข้ามด่าน ①② (สัญญา/เงิน) อยู่แล้ว (มติผู้ใช้ 2026-08-31 — สัญญา
//   หมดโดยนิยามคือเหตุผลที่นัดนี้เกิด ไม่ใช่สิ่งที่นัดต้องพิสูจน์ซ้ำ) แต่ยัง**ไม่ข้าม**
//   ข้อ "มีเจ้าหน้าที่" — งานถอนเครื่องยังต้องมีคนขับรถไปจริงเหมือนงานอื่น
import { genId } from '@/lib/id';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { initialVisitStatus } from '@/lib/service/visitGate';
import { loadVisitGateContext, gateContextForSite } from '@/lib/service/gateContext';
import { businessDate } from '@/lib/businessDate';

export const RETRIEVE_VISIT_KIND = 'remove';

/* สถานะที่นับว่า "ยังมีนัดถอนค้างอยู่" — ร่าง/ขึ้นตาราง/กำลังทำ/เลื่อน นับหมด
   มีแต่ปิดจบแล้ว (done/partial/unable) หรือยกเลิกเท่านั้นที่นับว่า "ไม่มีนัดค้าง"
   ⚠️ ต่างจาก isOpenVisit ของโมดูลนี้ตรงที่นับ draft ด้วย — นัดถอนที่ยังไม่มีคน
   มอบหมายก็ยังเป็น "มีนัดอยู่แล้ว" ไม่ใช่ "ยังไม่มีนัด" */
const hasPendingRemoval = (visits = []) => visits.some((v) => (
  v.kind === RETRIEVE_VISIT_KIND
  && !['done', 'partial', 'unable', 'cancelled'].includes(v.status)
));

/**
 * สร้างนัดถอนเครื่องให้ไซต์ที่เพิ่งปิดเรื่อง "ไม่ต่อ" — คืน `{ visit, error }`
 * `visit: null, error: null` = ไซต์นี้มีนัดถอนค้างอยู่แล้ว (ไม่สร้างซ้ำ ไม่ใช่ error)
 *
 * ⚠️ **เรียกก่อนบันทึกปิดเรื่อง ไม่ใช่หลัง** — ผู้เรียก (route) ต้องสร้างนัดให้สำเร็จ
 *   ก่อนเขียนสถานะ `declined` ลงแถว followup: ถ้าสร้างนัดพลาดแล้วยังปิดเรื่องต่อ
 *   จะเป็นบั๊กเดิมที่ไฟล์นี้เกิดมาแก้ (ปิดเรื่องไปแล้วแต่ TS ไม่รู้)
 */
export async function ensureRetrieveVisit(supabase, { site, followup, user, todayIso = businessDate() } = {}) {
  if (!site?.id) return { visit: null, error: 'ไม่พบไซต์ที่จะสร้างนัดถอนเครื่อง' };

  const { data: existing, error: findError } = await supabase
    .from('service_visits').select('id, status, kind').eq('siteId', site.id).eq('kind', RETRIEVE_VISIT_KIND);
  if (findError) return { visit: null, error: findError.message };
  if (hasPendingRemoval(existing || [])) return { visit: null, error: null };

  const reason = String(followup?.declineReason || '').trim();
  const draft = {
    siteId: site.id,
    kind: RETRIEVE_VISIT_KIND,
    scheduledDate: todayIso,
    assigneeId: null,
    assigneeName: null,
    // ⭐ โน้ตต้องบอกที่มา — เจ้าหน้าที่ที่เปิดจากตารางต้องรู้ว่าทำไมถึงมีนัดถอนใบนี้
    note: `ลูกค้าไม่ต่อสัญญาบริการ${reason ? ` — ${reason}` : ''}`.slice(0, 1000),
  };
  const gateCtx = await loadVisitGateContext(supabase, [site.id]);
  const row = {
    id: genId('SVV'),
    ...draft,
    status: initialVisitStatus(draft, gateContextForSite(gateCtx, site.id, { site })),
    createdById: user?.id ? String(user.id) : null,
    createdByName: user?.name || null,
  };
  const { data, error } = await insertRowWithEntityCode(supabase, 'SV', row);
  if (error) return { visit: null, error: error.message };
  return { visit: data, error: null };
}
