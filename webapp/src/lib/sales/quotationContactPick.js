/* ผู้ติดต่อบนใบ = "ใบนี้ติดต่อใคร" ไม่ใช่การแก้ทะเบียนลูกค้า (มติผู้ใช้ 2026-08-27)
   กติกาเดียวกับที่อยู่: จอส่งมาแค่ **ลำดับในทะเบียน** ไม่ใช่ชื่อ/เบอร์ที่พิมพ์เอง แล้ว
   server อ่านข้อความสดจากทะเบียน ⇒ ใบไม่มีทางมีผู้ติดต่อที่ไม่มีอยู่จริงในทะเบียน

   ⚠️ ที่ต้องเป็นตัวกลางตัวเดียว: PATCH (แก้ใบร่าง) กับ POST /revise (ออก Rev.) ต่างก็รับ
   contactIndex ตัวเดียวกัน · ตอนแยกกันเขียน ฝั่ง revise ไม่ได้อ่านคีย์นี้เลย ⇒ เลือก
   ผู้ติดต่อแล้วกด "ออก Rev." การเลือกหายทั้งดุ้นโดยไม่มีอะไรฟ้อง */

// customer = แถวทะเบียนที่ select `contacts, contactPerson, contactPhone` มาแล้ว
// index    = ค่าที่จอส่งมา (ยังไม่ตรวจ) · คืน { ok, error } หรือ { ok, snapshot }
export function pickQuotationContact(customer, index) {
  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : [];
  // ⚠️ null/'' ต้องถูกปฏิเสธ ไม่ใช่กลายเป็น 0 — `Number(null) === 0` ⇒ คำขอที่ส่งค่าว่าง
  // มาจะเงียบ ๆ ไปหยิบผู้ติดต่อคนแรกของทะเบียนใส่ใบ ทั้งที่ไม่มีใครเลือกไว้
  const at = index === null || index === '' ? NaN : Number(index);
  if (!Number.isInteger(at) || at < 0 || (contacts.length && at >= contacts.length)) {
    return { ok: false, error: 'ผู้ติดต่อที่เลือกไม่อยู่ในทะเบียนลูกค้ารายนี้' };
  }
  // ลูกค้าที่ยังไม่มีลิสต์ contacts (แถวยุคเก่า) ถอยไปช่องเดี่ยวเดิม — กติกาเดียวกับ
  // createQuotationDraft ไม่งั้นใบของลูกค้าเก่าจะเลือกผู้ติดต่อไม่ได้เลย
  const contact = contacts[at] || (contacts.length ? null : {
    name: customer?.contactPerson || '', phone: customer?.contactPhone || '', email: '',
  });
  if (!contact) return { ok: false, error: 'ผู้ติดต่อที่เลือกไม่อยู่ในทะเบียนลูกค้ารายนี้' };
  return {
    ok: true,
    snapshot: {
      contactName: contact.name || null,
      contactPhone: contact.phone || null,
      contactEmail: contact.email || null,
    },
  };
}
