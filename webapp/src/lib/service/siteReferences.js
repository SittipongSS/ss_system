// ── ค่าอ้างอิงบนแถวไซต์ที่ Postgres ไม่ช่วยตรวจ (mig 0299 / 0313) ─────────
//
// แยกไฟล์จาก `sitesRepo.js` เพราะไฟล์นั้น import `@/lib/http` (→ `next/headers`)
// ซึ่ง unit test รันด้วย raw Node ไม่ได้ · ที่นี่แตะ DB อย่างเดียว ไม่แตะ HTTP
//
// ⚠️ ทั้งสองช่อง **ไม่มี FK โดยเจตนา** — โครงการลบ/รวมได้แต่ไซต์ที่ติดตั้งไปแล้ว
//    ต้องอยู่ต่อ (0299) · ที่อยู่เป็นแถวใน jsonb `customers.addresses[]` ไม่ใช่ตาราง
//    (0313) ⇒ ค่ามั่วเข้าไปได้เงียบ ๆ ถ้าไฟล์นี้ไม่ทำงาน

// โครงการที่ประทับไว้บนไซต์ต้องมีจริง (mig 0299) — ไม่มี FK จึงต้องตรวจเอง
export async function findProject(supabase, projectId) {
  const { data, error } = await supabase
    .from('projects').select('id, code, name, customerId').eq('id', projectId).maybeSingle();
  if (error) throw error;
  return data || null;
}

/* ── ตรวจสองช่องที่ระบบประทับเอง ก่อนเขียนลงแถวไซต์ ──────────────────────
   คืนข้อความไทย หรือ null ถ้าผ่าน — ใช้ตัวเดียวกันทั้ง POST และ PATCH เพื่อให้
   ข้อความตีกลับตรงกันคำต่อคำ (กฎเดียวกับ normalizeSiteInput)

   ⚠️ ทั้งคู่ **ไม่มี FK** โดยเจตนา (ที่อยู่เป็น jsonb · โครงการลบ/รวมได้แต่ไซต์ต้องอยู่)
      ⇒ ถ้าไม่ตรวจตรงนี้ ค่ามั่วเข้าไปได้เงียบ ๆ แล้วปุ่ม "ดึงใหม่" จะไปเทียบกับ
      ที่อยู่ของลูกค้าคนอื่น */
export async function checkSiteReferences(supabase, value, customer) {
  if (value.customerAddressId) {
    const rows = Array.isArray(customer?.addresses) ? customer.addresses : [];
    if (!rows.some((row) => row?.id === value.customerAddressId)) {
      return 'ไม่พบที่อยู่ต้นทางในทะเบียนของลูกค้ารายนี้';
    }
  }
  if (value.projectId) {
    const project = await findProject(supabase, value.projectId);
    if (!project) return 'ไม่พบโครงการที่ระบุ';
    // โครงการที่เป็นของลูกค้าคนอื่น = ประทับผิดใบ · ปล่อยผ่านแล้วสืบย้อนได้คำตอบผิด
    if (project.customerId && project.customerId !== value.customerId) {
      return `โครงการ ${project.code || project.id} เป็นของลูกค้ารายอื่น`;
    }
  }
  return null;
}
