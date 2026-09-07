// ── "ทีมนี้ถูกใช้ไปแล้วหรือยัง" — ตัวตัดสินว่าลบทีมได้ไหม (มติผู้ใช้ 2026-08-30) ──
//
// ⭐ **ที่มา**: ผู้ใช้ขอปุ่มลบทีมให้แอดมิน · แต่ mig 0310 เขียนกฎไว้ชัดว่า
//    *"ปิดทีม ไม่ใช่ลบทีม — รหัสทีมถูกก๊อปเป็นข้อความลงหลายสิบคอลัมน์ในหลายตาราง
//    ลบแถวทะเบียนแล้วป้ายในรายงานย้อนหลังกลายเป็นรหัสดิบทันที"*
//
// 🔴 **ทั้งสองอย่างเป็นจริงพร้อมกันได้** — สิ่งที่ต้องลบจริง ๆ คือ **ทีมที่ตั้งผิดแล้วยัง
//    ไม่มีใครใช้** (พิมพ์ชื่อผิด · สร้างซ้ำ · ทดลอง) ซึ่งไม่มีประวัติให้พัง · ส่วนทีมที่มี
//    ประวัติแล้ว ปิดทีมคือคำตอบเดิม ⇒ ปุ่มลบต้อง **ถามฐานข้อมูลก่อนเสมอ** ไม่ใช่เชื่อคนกด
//
// ⚠️ ลิสต์ข้างล่างคือ "ที่ที่รหัสทีมไปโผล่" — ตกหล่นตารางไหน = ลบทีมที่ยังถูกอ้างอยู่ได้
//    โดยไม่มีอะไรเตือน ⇒ มีเทสต์ไล่สคีมาทุกไฟล์มาเทียบกับลิสต์นี้ (`teamUsage.test.mjs`)
//    เพิ่มคอลัมน์ที่ประทับรหัสทีมเมื่อไร ต้องมาเติมที่นี่ด้วย
//
// 🐞 **ตัวไล่เคยตาบอด 3 ตารางเต็ม ๆ** (พบ 2026-09-07) — มันอ่านเฉพาะ `supabase/migrations/`
//    แต่ `customers` · `products` · `orders` เกิดใน `supabase/schema.sql` ตั้งแต่ก่อนมี
//    ระบบ migration ⇒ ไม่เคยถูกไล่เจอ · วัดของจริงบน production วันนั้น: ลูกค้า 204 แถว ·
//    สินค้า 409 แถว · ใบสั่ง 1 แถว ถือรหัสทีมอยู่ **โดยที่ด่านลบทีมมองไม่เห็นสักแถว**
//    ⇒ ทีมขายที่มีแต่ลูกค้า/สินค้าใช้ ลบทิ้งได้เงียบ ๆ แล้วป้ายในทะเบียนกลายเป็นรหัสดิบถาวร
//    บทเรียน: **ด่านที่ไล่จาก "ที่ที่เราจำได้ว่าเก็บสคีมา" ไม่ใช่ด่าน** — ต้องไล่ทุกไฟล์สคีมา
//
// 🐞 **และมันเคยพังยิ่งกว่านั้น** (พบวันเดียวกัน จาก UAT ที่ยิงจริงทีละตาราง) — ในลิสต์มี
//    ตารางที่ **ไม่มีอยู่ในฐานแล้ว** สามตัว: `inquiries` (mig 0174 ลบ) ·
//    `material_price_requests` (mig 0158 ลบ) · `material_price_asks` (mig 0173 เปลี่ยนชื่อ
//    เป็น `dept_requests`) ⇒ PostgREST ตอบ `PGRST205 Could not find the table` ⇒ ด่านโยน
//    500 **ทุกครั้ง** ⇒ **ปุ่มลบทีมใช้ไม่ได้เลยตั้งแต่ mig 0174** และไม่มีใครรู้ เพราะเคส
//    ที่คนกดจริงคือ "ทีมที่ถูกใช้แล้ว" ซึ่งควรถูกตีกลับอยู่แล้ว — error กับ blocker
//    อ่านเหมือนกันหมดบนจอ · ส่วน `dept_requests` ที่ควรถูกตรวจ กลับไม่มีใครตรวจ
//    ⇒ ด่านต้องเทียบ **สองทาง**: ตารางที่ประทับรหัสต้องอยู่ในลิสต์ · และทุกตัวในลิสต์
//      ต้องยังมีอยู่จริง (ตัวไล่ต้องรู้จัก DROP TABLE / RENAME TO ไม่ใช่แค่ CREATE)
//
// ⚠️ **ไม่ใช่ทุกคอลัมน์เทียบด้วย `=`** — `customers.teams` เป็น jsonb array (mig 0037)
//    เทียบด้วย `.eq()` ได้ 0 เสมอ ⇒ แต่ละแถวบอก `match` ว่าจะถามฐานยังไง

/** ตาราง/คอลัมน์ที่ประทับ "รหัสทีม" ไว้เป็นข้อความ
 *  `match`: `'eq'` (ค่าเดียว · ค่าตั้งต้น) · `'jsonbArray'` (อาเรย์ jsonb ใช้ `contains`) */
export const TEAM_STAMPED_COLUMNS = [
  { table: 'projects', column: 'team', label: 'โครงการ' },
  { table: 'sales_deals', column: 'team', label: 'ดีล' },
  { table: 'sales_leads', column: 'team', label: 'ลีด' },
  { table: 'lead_events', column: 'team', label: 'ประวัติลีด' },
  { table: 'sales_targets', column: 'team', label: 'เป้าขาย' },
  { table: 'sales_history', column: 'team', label: 'ยอดขายย้อนหลัง' },
  { table: 'sales_forecast_reviews', column: 'team', label: 'รอบทบทวนคาดการณ์' },
  { table: 'sales_contracts', column: 'team', label: 'สัญญา' },
  { table: 'sales_contract_addenda', column: 'team', label: 'บันทึกเพิ่มเติมของสัญญา' },
  { table: 'costing_requests', column: 'team', label: 'ใบขอราคาผลิต' },
  /* ⚠️ เดิมชื่อ `material_price_asks` — mig 0173 เปลี่ยนชื่อเป็น `dept_requests`
     (ทะเบียนนี้ยังอ้างชื่อเก่าอยู่ 5 เดือน · ดูหัวไฟล์) */
  { table: 'dept_requests', column: 'team', label: 'คำร้องระหว่างฝ่าย' },
  { table: 'excise_registrations', column: 'team', label: 'ทะเบียนสรรพสามิต' },
  { table: 'team_members', column: 'teamCode', label: 'สมาชิกทีม' },
  /* ── ตารางยุคก่อน migration (supabase/schema.sql) — ตกสำรวจมาตลอดจนถึง 2026-09-07 ── */
  { table: 'customers', column: 'team', label: 'ลูกค้า (ทีมหลัก)' },
  /* ⚠️ jsonb array — ทีมที่ *ร่วมดูแล* ลูกค้ารายนี้ (mig 0037) · แถวเดียวกันนับซ้ำกับ
     บรรทัดบนได้ และนั่นถูกแล้ว: ข้อความบล็อกบอก "ติดตรงไหน" ไม่ใช่ "รวมกี่แถว" */
  { table: 'customers', column: 'teams', label: 'ลูกค้า (ทีมที่ร่วมดูแล)', match: 'jsonbArray' },
  { table: 'products', column: 'team', label: 'สินค้า' },
  { table: 'orders', column: 'team', label: 'ใบสั่ง (ภาษีสรรพสามิต)' },
];

/**
 * ถามฐานว่ารหัสทีมนี้ถูกอ้างอยู่กี่แถวในแต่ละที่ — **ด่านเดียวใช้ร่วมกัน**
 * (ลบทีม · เปลี่ยนรหัสทีม) · เขียนสองที่เมื่อไรมันเพี้ยนหากันภายในเดือนเดียว
 *
 * 🔴 อ่านตารางไหนไม่สำเร็จ = **ไม่รู้ว่าว่างจริงไหม** ⇒ โยน error ห้ามเดาว่าว่าง
 *    (ลบทีมผิดแล้วย้อนไม่ได้ · เปลี่ยนรหัสผิดแล้วแถวเก่าชี้ทีมที่ไม่มีอยู่)
 */
export async function scanTeamUsage(supabase, code) {
  const usage = [];
  for (const { table, column, label, match } of TEAM_STAMPED_COLUMNS) {
    const base = supabase.from(table).select('*', { count: 'exact', head: true });
    /* 🐞 **`contains(col, [code])` ใช้กับ jsonb ไม่ได้** (เจอตอน UAT 2026-09-07) —
       supabase-js เห็นอาเรย์แล้วแปลงเป็น *อาเรย์ของ Postgres* `cs.{SA-X}` ซึ่ง jsonb
       ไม่รับ ⇒ 500 · jsonb ต้องส่งเป็นสตริง JSON เพื่อให้ได้ `cs.["SA-X"]` */
    const query = match === 'jsonbArray'
      ? base.contains(column, JSON.stringify([code]))
      : base.eq(column, code);
    const { count, error } = await query;
    if (error) {
      /* ⚠️ **ต้องพิมพ์ให้ครบทุกช่อง** — PostgREST คืน `message` ว่างในบางเคส
         (เคสนี้เอง) แล้วข้อความที่ได้คือ "ไม่สำเร็จ: " เปล่า ๆ ซึ่งไม่บอกอะไรเลย
         บทเรียนเดียวกับ `schemaFetch` ที่เคยพิมพ์แค่ "401" */
      const detail = [error.code, error.message, error.details, error.hint]
        .filter(Boolean).join(' · ') || 'ฐานข้อมูลไม่ได้บอกสาเหตุ';
      throw new Error(`ตรวจการใช้งานทีมที่ตาราง ${table}.${column} ไม่สำเร็จ: ${detail}`);
    }
    usage.push({ table, column, label, count: count || 0 });
  }
  return usage;
}

/**
 * เหตุผลที่ลบทีมนี้ไม่ได้ — คืนข้อความไทย หรือ `''` ถ้าลบได้
 *
 * @param team          แถวทะเบียนทีม
 * @param usage         `[{ label, count }]` ที่ตรวจจากฐานแล้ว (นับเฉพาะที่ > 0)
 * @param memberUserIds บัญชีผู้ใช้ที่ยังมีรหัสทีมนี้ใน app_metadata (ทีมขาย)
 * @param protectedCode รหัสนี้เป็นหนึ่งในสามทีมที่ seed มาแต่แรกไหม (TEAMS)
 */
export function deleteTeamBlocker(team, { usage = [], memberUserIds = [], protectedCode = false } = {}) {
  if (!team) return 'ไม่พบทีม';
  /* 🔴 สามทีมที่ seed มาแต่แรก (KA/ODM/SV) — รหัสถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19
     ตารางไปแล้ว และยังเป็นค่าถอยของฝั่งจอที่อ่านแบบ sync ⇒ ลบแถวออกไม่ได้แม้ยังไม่มีใครใช้
     · ปิดทีมคือคำตอบของกรณีนั้น
     ⚠️ **ทีมขายที่สร้างใหม่ไม่ติดข้อนี้** (มติ 2026-09-07) — ถ้ายังไม่มีใครใช้ก็ลบได้ตามปกติ */
  if (protectedCode) {
    return `${team.name} เป็นทีมตั้งต้นของระบบ — ลบไม่ได้ ใช้ "ปิดทีม" แทน`;
  }
  if (memberUserIds.length) {
    return `ทีมนี้ยังเป็นสังกัดของผู้ใช้ ${memberUserIds.length} คน — ย้ายคนออกก่อน`;
  }
  const used = usage.filter((u) => u.count > 0);
  if (used.length) {
    const detail = used.map((u) => `${u.label} ${u.count}`).join(' · ');
    return `ทีมนี้ถูกใช้ไปแล้ว (${detail}) — ลบไม่ได้เพราะป้ายในรายงานย้อนหลังจะกลายเป็นรหัสดิบ · ใช้ "ปิดทีม" แทน`;
  }
  return '';
}
