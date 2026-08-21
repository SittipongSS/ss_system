// ── โหลดแถว + ตรวจสิทธิ์ในจังหวะเดียว ──────────────────────────────────────
//
// 🐞 **ที่มา (ตรวจระบบ 2026-08-16 รอบด่านรายแถว):** ทุก handler เขียนด่านด้วยรูปของ
// ตัวเอง — บางที่ตรวจแถวที่โหลด บางที่ตรวจ entity แม่ บางที่ตรวจ payload ⇒ **ตรวจสอบ
// ด้วยเครื่องไม่ได้เลยว่า "โหลดมาแล้วลืมตรวจ" มีตรงไหนบ้าง** สแกนสองวิธีให้ false
// positive จนใช้ตัดสินอะไรไม่ได้ (บันทึกไว้ที่ audit/11-row-guards.md)
//
// ⭐ ทางแก้คือทำให้ "โหลดแล้วลืมตรวจ" **เขียนไม่ออก**: ที่นี่โหลดกับตรวจอยู่ในคำสั่ง
// เดียว คืน `response` มาให้ return ทันทีเมื่อไม่ผ่าน — ไม่มีจังหวะที่ถือแถวไว้ในมือ
// โดยยังไม่ผ่านด่าน
//
// ⚠️ **ไม่ใช่ตัวแทนของด่านทั้งหมด** — เส้นที่ตรวจ entity แม่ (ไฟล์แนบ) หรือคุมด้วย cap
// ของโมดูล (mgmt · ทะเบียนกลาง) ยังใช้ด่านของตัวเองตามเดิม ที่นี่คุมเฉพาะ "แถวที่มี
// เจ้าของ/ทีมของตัวเอง"
//
// ⚠️ ตารางที่ scope ผ่านดีล (ใบเสนอราคา · ใบสั่งขาย) ต้อง join ดีลมาด้วยเสมอ —
// `scopeOf` เป็นตัวบอกว่าเอา object ไหนไปตรวจ ไม่ใช่แถวที่โหลดเสมอไป
import { inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { inPmProjectScope, inScope, pmEditScope, viewScope } from '@/lib/permissions';

const DEAL_JOIN = '*, deal:sales_deals(*)';

/**
 * ทะเบียนตารางที่คุมด้วย "เจ้าของ/ทีมของแถว"
 *   select  — projection ที่ต้องมีอย่างน้อยเพื่อให้ scopeOf ทำงานได้
 *   scopeOf — object ที่จะถูกส่งเข้าด่าน (ตัวแถวเอง หรือดีลที่มันสังกัด)
 *   view / edit — เพรดิเคตของแต่ละโหมด
 *   label   — คำที่ขึ้นในข้อความ 404
 */
export const SCOPED_TABLES = {
  sales_deals: {
    label: 'ดีล',
    select: '*',
    scopeOf: (row) => row,
    view: inSalesViewScope,
    edit: inSalesEditScope,
  },
  quotations: {
    label: 'ใบเสนอราคา',
    select: DEAL_JOIN,
    scopeOf: (row) => row?.deal,
    view: inSalesViewScope,
    edit: inSalesEditScope,
  },
  sales_orders: {
    label: 'ใบสั่งขาย',
    select: DEAL_JOIN,
    scopeOf: (row) => row?.deal,
    view: inSalesViewScope,
    edit: inSalesEditScope,
  },
  // สัญญา (mig 0278) — scope ผ่านดีลแม่เหมือนใบเสนอราคา/ใบสั่งขาย
  sales_contracts: {
    label: 'สัญญา',
    select: DEAL_JOIN,
    scopeOf: (row) => row?.deal,
    view: inSalesViewScope,
    edit: inSalesEditScope,
  },
  // บันทึกเพิ่มเติมสัญญา (mig 0282) — คัด team/ownerId มาจากสัญญาแม่ตอนสร้าง
  // จึงตรวจด่านจากตัวแถวเองได้ ไม่ต้อง join ขึ้นไปถึงดีล
  sales_contract_addenda: {
    label: 'บันทึกเพิ่มเติมสัญญา',
    select: '*',
    scopeOf: (row) => row,
    view: inSalesViewScope,
    edit: inSalesEditScope,
  },
  sales_leads: {
    label: 'ลีด',
    select: '*',
    scopeOf: (row) => row,
    view: inSalesViewScope,
    edit: inSalesEditScope,
  },
  projects: {
    label: 'โครงการ',
    select: '*',
    scopeOf: (row) => row,
    // PM: เจ้าของโครงการเองก็แก้ได้ แม้อยู่คนละทีม (inPmProjectScope)
    view: (user, row) => inScope(viewScope(user?.role), user, row),
    edit: inPmProjectScope,
  },
};

/**
 * โหลดแถวแล้วตรวจสิทธิ์ทันที
 *
 * @returns {Promise<{row: object, response?: never} | {row?: never, response: Response}>}
 *   ได้ `response` เมื่อไม่พบแถว (404) · ไม่มีสิทธิ์ (403) · หรืออ่านฐานไม่สำเร็จ (500)
 *
 * ⚠️ **อ่านฐานพลาดต้องดัง** — คืน 500 ไม่ใช่ 404: "ไม่พบ" กับ "ถามไม่สำเร็จ" คนละเรื่อง
 * และการกลืนเป็น 404 จะพาผู้ใช้ไปไล่หาของที่ยังอยู่ครบ (บทเรียนเดียวกับ
 * registrationRequirements / projectsRepo)
 */
export async function loadScoped(supabase, table, id, user, mode = 'edit') {
  const entry = SCOPED_TABLES[table];
  if (!entry) throw new Error(`loadScoped: ตาราง "${table}" ยังไม่อยู่ในทะเบียน SCOPED_TABLES`);
  if (!id) return { response: Response.json({ error: `ไม่พบ${entry.label}` }, { status: 404 }) };

  const { data: row, error } = await supabase
    .from(table).select(entry.select).eq('id', id).maybeSingle();
  if (error) return { response: Response.json({ error: error.message }, { status: 500 }) };
  if (!row) return { response: Response.json({ error: `ไม่พบ${entry.label}` }, { status: 404 }) };

  const predicate = mode === 'view' ? entry.view : entry.edit;
  const target = entry.scopeOf(row);
  /* ⚠️ scope object หายไป (เช่น ใบที่ไม่ได้ผูกดีล) = **ยังพิสูจน์สิทธิ์ไม่ได้** ⇒ ปฏิเสธ
     ไม่ใช่ปล่อยผ่าน — เส้นทางที่ตั้งใจให้มีใบไร้ดีลต้องเขียนด่านของตัวเอง ไม่ใช้ตัวนี้ */
  if (!target || !predicate(user, target)) {
    return { response: Response.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { row };
}
