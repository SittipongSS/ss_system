// role ที่แต่ละช่อง "ผู้รับผิดชอบ" ของ **เอกสารโครงการ** รับได้ — ช่องลงนามบนหัวเอกสาร
// ISO ของโครงการ (components/pm/ProjectDocumentView.js) และฟอร์มสร้างโครงการ
// (components/pm/SalesProjectCreateModal.js) กรองรายชื่อจากตารางนี้ · ฝั่ง server ตรวจซ้ำที่
// lib/pm/projectOwner.js ด้วยกลุ่มเดียวกัน
//
//   ผู้ดูแล (aeOwner)        = ผู้ถือดีล (AE / Senior AE)
//   ผู้ประสานงาน (preparedBy) = สาย AC (AC / Senior AC / AC Supervisor)  ← ชื่อ field ตามสคีมาเดิมของ projects
//   ผู้ตรวจสอบ (aeSupervisor) = ผู้มีอำนาจตัดสินของฝ่ายขาย (CCO / CM / AE Supervisor)
// ⭐ ผังตำแหน่ง 2026-09-24 — ถามกลุ่มจาก lib/permissions.js ไม่พิมพ์ชื่อตำแหน่งซ้ำ
//
// 📌 ตารางนี้เคยอยู่ที่ `lib/sales/quotationPeople.js` เพราะใบเสนอราคาก๊อปผู้รับผิดชอบ
// ของโครงการมาเป็นของตัวเองแล้ว validate role ฝั่ง server ด้วยรายการชุดเดียวกัน —
// **ใบเสนอราคาไม่มีบล็อกนั้นแล้ว** (มติผู้ใช้ 2026-08-18: บทบาททุกตัวบนใบมีคำตอบอยู่
// ที่อื่นแล้ว ดู quotationMetadata.js) ตารางจึงย้ายมาอยู่กับเจ้าของจริงคือฝั่งโครงการ
import { AC_TRACK_ROLES, DEAL_HOLDER_ROLES, SALES_MANAGER_ROLES } from '@/lib/permissions';

export const PROJECT_PEOPLE_ROLES = Object.freeze({
  aeOwner: [...DEAL_HOLDER_ROLES],
  preparedBy: [...AC_TRACK_ROLES],
  aeSupervisor: [...SALES_MANAGER_ROLES],
});

/** ช่องผู้รับผิดชอบที่ล็อกเป็น "ตัวเอง" ตอนสร้างโครงการ — ช่องที่ตรงกับตำแหน่งของคนกด · ไม่มี = null */
export function projectPeopleFieldForRole(role) {
  for (const [field, roles] of Object.entries(PROJECT_PEOPLE_ROLES)) {
    if (roles.includes(role)) return field === 'preparedBy' ? 'acOwner' : field;
  }
  return null;
}
