// role ที่แต่ละช่อง "ผู้รับผิดชอบ" ของ **เอกสารโครงการ** รับได้ — ช่องลงนามบนหัวเอกสาร
// ISO ของโครงการ (components/pm/ProjectDocumentView.js) กรองรายชื่อจากตารางนี้
//
//   ผู้ดูแล (aeOwner)        = AE / Senior AE
//   ผู้ประสานงาน (preparedBy) = AC      ← ชื่อ field ตามสคีมาเดิมของ projects
//   ผู้ตรวจสอบ (aeSupervisor) = AE Supervisor
//
// 📌 ตารางนี้เคยอยู่ที่ `lib/sales/quotationPeople.js` เพราะใบเสนอราคาก๊อปผู้รับผิดชอบ
// ของโครงการมาเป็นของตัวเองแล้ว validate role ฝั่ง server ด้วยรายการชุดเดียวกัน —
// **ใบเสนอราคาไม่มีบล็อกนั้นแล้ว** (มติผู้ใช้ 2026-08-18: บทบาททุกตัวบนใบมีคำตอบอยู่
// ที่อื่นแล้ว ดู quotationMetadata.js) ตารางจึงย้ายมาอยู่กับเจ้าของจริงคือฝั่งโครงการ
export const PROJECT_PEOPLE_ROLES = Object.freeze({
  aeOwner: ['ae', 'senior_ae'],
  preparedBy: ['ac'],
  aeSupervisor: ['ae_supervisor'],
});
