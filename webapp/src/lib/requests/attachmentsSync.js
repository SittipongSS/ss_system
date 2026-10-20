// ── สองแผงไฟล์แนบของใบเดียวกันต้องเห็นรายการเดียวกัน (ประเมินจากแบบ งวด 4 · ผลรีวิวรอบแก้ S4) ─────────
//
// ⭐ หน้าคำร้องมีแผงที่อ่านไฟล์แนบชุดเดียวกันสองแผง: บล็อกไฟล์บังคับ (การ์ด DRAWINGS / ในฟอร์มแก้) กับการ์ด
//    "ไฟล์แนบของคำร้อง" — ต่างคนต่างโหลด ⇒ แนบ/ลบในแผงหนึ่ง อีกแผงไม่รู้ · ตัวนับไฟล์บังคับ (ด่านก่อนส่ง)
//    มาจากบล็อกไฟล์บังคับอย่างเดียว ⇒ แนบแบบในการ์ดทั่วไป (ชนิด "สเปก / แบบงาน / บรีฟ") แล้วด่านยังบอกว่าไม่มีไฟล์
// ⭐ ทางแก้: ทุกแผงรายงานรายการที่โหลดได้ (`onItemsChange` ของ AttachmentsPanel ส่ง **ทุกใบของ entity**) →
//    หน้าเทียบลายมือชื่อ (id เรียง) กับครั้งก่อน → ต่าง = ขยับ `reloadKey` ให้ทุกแผงโหลดใหม่
//    ⚠️ ไม่วน: แผงที่โหลดใหม่ได้ชุดเดิม = ลายมือชื่อเท่าเดิม = ไม่ขยับอีก
//    ⚠️ ยังโหลดไม่ได้ (`loaded` เท็จ) ไม่นับ — "ยังไม่รู้" ไม่ใช่ "ไม่มีไฟล์"

/* ลายมือชื่อของรายการ = id เรียง (ลำดับที่ API ส่งไม่ใช่ความหมาย) · แถวไม่มี id ไม่นับ */
export function attachmentsSignature(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.id ?? ''))
    .filter(Boolean)
    .sort()
    .join('|');
}

/**
 * ก้าวหนึ่งของการซิงก์ — คืน `{ signature, bump }`
 * · `previous` = ลายมือชื่อที่หน้าจำไว้ (`null` = ยังไม่มีแผงไหนโหลดได้)
 * · ครั้งแรกที่รู้ = จำไว้เฉย ๆ (แผงอื่นโหลดเองอยู่แล้วตอนเมานต์) · ต่างจากที่จำ = จำใหม่ + `bump`
 */
export function attachmentsSyncStep(previous, items, { loaded = false } = {}) {
  if (!loaded) return { signature: previous, bump: false };
  const signature = attachmentsSignature(items);
  if (previous == null) return { signature, bump: false };
  return { signature, bump: signature !== previous };
}
