// ── เปลี่ยนชื่อบัญชีแล้วสำเนาชื่อในตารางต้องตามด้วย ─────────────────────────
//
// การแก้ชื่อผู้ใช้เขียนแค่ `auth.users.user_metadata` — ไม่มีอะไรไล่แก้คอลัมน์ชื่อที่
// ถูกคัดลอกลงตารางตอนบันทึก ⇒ ชื่อเก่าค้างตลอดกาล วัดบน prod 2026-08-12:
//   sales_leads.assigneeName  75/125 แถว  ("Supisara S." · "Threerapong P." …)
//   scents.ownerName          42/43  แถว
//   sales_targets.ownerName   12/74  แถว  ("Supisara Roitiean" ที่ไม่มีอยู่จริง)
//
// `livePersonName` แก้ให้เฉพาะ *จอที่เรียกใช้มัน* — ที่เหลืออ่านคอลัมน์ดิบ ทั้งจอที่ยัง
// ไม่ได้แปลง และงานที่ไม่ใช่การแสดงผล (ค้นหา · export · สรุปใน audit) จึงต้องซิงก์ตัวคอลัมน์
//
// ⚠️⚠️ **คอลัมน์ที่อยู่ในลิสต์นี้ได้ ต้องเป็น "สถานะปัจจุบัน" ล้วน**
// ห้ามใส่ช่องที่เป็น snapshot ของเหตุการณ์หรือเอกสารที่ออกไปแล้ว — แก้ย้อนหลังเมื่อไร
// ชื่อบนเอกสารเก่าจะขยับตามคนเปลี่ยนชื่อ/ลาออก ซึ่งผิดความจริง
//
// ที่ **จงใจไม่ใส่** พร้อมเหตุผล (อย่าเติมกลับโดยไม่อ่าน):
//   · `sales_deals.ownerName`  → ขึ้นบนใบสั่งขายที่พิมพ์แล้ว ทั้งช่อง "ผู้เสนอราคา"
//     และช่องลงชื่อ "ฝ่ายขาย" (lib/sales/salesOrderPrint.js) + เป็น fallback ของ
//     `approvedByName` ใน issuedQuotationSnapshot ⇒ ชื่อ ณ วันที่ออกใบ
//   · `projects.aeOwner` / `acOwner` → migration 0190 เขียนไว้ตรง ๆ ว่าเพิ่ม
//     `aeOwnerId` มา **ไม่ใช่เพื่อแทนที่** ตัวชื่อยังเป็นของจริงสำหรับเอกสารที่พิมพ์
//   จอที่อยากเห็นชื่อปัจจุบันของสองช่องนี้ ให้ใช้ `livePersonName` แทน (ดู lib/ui/personName.js)

/** คอลัมน์ "ชื่อคน" ที่เป็นสถานะปัจจุบัน — ซิงก์ตามบัญชีได้ */
export const PERSON_NAME_COLUMNS = [
  { table: 'sales_targets', idColumn: 'ownerId', nameColumn: 'ownerName', label: 'เจ้าของเป้า' },
  { table: 'sales_leads', idColumn: 'assigneeId', nameColumn: 'assigneeName', label: 'ผู้รับผิดชอบลีด' },
  { table: 'scents', idColumn: 'ownerId', nameColumn: 'ownerName', label: 'เจ้าของกลิ่น (RD)' },
];

/**
 * ทาชื่อใหม่ทับสำเนาของบัญชีหนึ่ง — คืนจำนวนแถวที่แก้ต่อคอลัมน์
 *
 * ⚠️ ยิงเฉพาะแถวที่ **ชื่อไม่ตรงอยู่แล้ว** (`neq`) เพื่อไม่ให้ `updatedAt`/trigger ของ
 * แถวที่ถูกอยู่แล้วขยับฟรี ๆ · ล้มทั้งชุดไม่ได้ทำให้การเปลี่ยนชื่อล้ม — ชื่อบนบัญชี
 * เปลี่ยนไปแล้วและจอที่ใช้ `livePersonName` ก็ถูกอยู่ดี จึงรายงานเป็น warning
 *
 * supabase: client ที่มีสิทธิ์เขียน (service role)
 */
export async function syncPersonName(supabase, { userId, name }) {
  const clean = String(name ?? '').trim();
  if (!supabase || !userId || !clean) return { updated: {}, errors: [] };

  const updated = {};
  const errors = [];
  for (const col of PERSON_NAME_COLUMNS) {
    const { data, error } = await supabase
      .from(col.table)
      .update({ [col.nameColumn]: clean })
      .eq(col.idColumn, userId)
      .neq(col.nameColumn, clean)
      .select('id');
    if (error) {
      errors.push(`${col.table}.${col.nameColumn}: ${error.message}`);
      continue;
    }
    if (data?.length) updated[`${col.table}.${col.nameColumn}`] = data.length;
  }
  return { updated, errors };
}
