// Master-data namespace alias — see ../../../customers/route.js.
//
// 🐞 **บั๊กที่ผู้ใช้แจ้ง (IS-26080008 · 2026-08-11): "ใส่วันที่ของเอกสารหนังสือรับรอง
// ไม่ได้"** — ไฟล์นี้เคย re-export แค่ `DELETE` ส่วน `AttachmentsPanel` ยิง **PATCH**
// มาที่ชื่อ `/api/master/attachments/[id]` ⇒ Next ตอบ **405 Method Not Allowed**
// (ไม่ใช่ 404 ที่จะสังเกตง่ายกว่า) ⇒ ช่องวันที่เด้งกลับค่าเดิมทุกครั้งที่กรอก
//
// ⚠️ **alias ต้อง re-export ให้ครบทุก method ที่ปลายทางมี** — ขาดตัวไหน ตัวนั้นตาย
// เงียบด้วย 405 ซึ่งไม่มี log ฝั่ง handler ให้เห็นเลย เพราะ handler ไม่เคยถูกเรียก
export { DELETE, PATCH } from "../../../attachments/[id]/route";
