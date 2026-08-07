// ── ด่านสิทธิ์ของเรื่องแจ้งปัญหาระบบ (mig 0219) ──────────────────────────
//
// ⭐ **ทั้งโมดูลมีกติกาสองข้อเท่านั้น** — เจ้าของเรื่องเห็นเรื่องตัวเอง · แอดมินเห็นทุกเรื่อง
// เขียนไว้ที่นี่ที่เดียว แล้วทั้ง API หน้าจอ และเธรดอัปเดตอ้างฟังก์ชันเดียวกัน
//
// ⚠️ **ห้ามใช้ `isSuperuser()`** ทั้งที่มันดูใกล้เคียง — `isSuperuser` นับ
// `ae_supervisor` (หัวหน้าฝ่ายขาย) เข้ามาด้วย ซึ่งไม่ใช่คนดูแลระบบ และไม่ควร
// เห็นเรื่องที่คนทั้งบริษัทแจ้ง (มติ Q3) · ที่นี่เทียบ role === 'admin' ตรง ๆ
//
// ⚠️ ไฟล์นี้ต้องไม่ import อะไรที่หนัก — `lib/master/updateAccess.js` import มัน
// และไฟล์นั้นถูกอ่านโดยเทสต์ที่ไม่ต้องการลากชั้นสิทธิ์ทั้งก้อนมาด้วย

import { ISSUE_OPEN_STATUSES } from '@/lib/issues/statuses';

// คนดูแลระบบ = role 'admin' เท่านั้น (ไม่ใช่ฝ่าย AD ไม่ใช่ superuser)
export const isSystemAdmin = (user) => String(user?.role || '') === 'admin';

// เจ้าของเรื่อง — เทียบเป็น string เสมอ เพราะ id ของ Supabase auth เป็น uuid
// ส่วนคอลัมน์เป็น text (แถวเก่าที่ import เข้ามาอาจเป็นตัวเลข)
export const isIssueReporter = (user, row) => !!user?.id && String(user.id) === String(row?.reportedById || '');

// ⭐ ด่านอ่านหนึ่งเดียว — GET /api/issues/[id] และ canView ของเธรดต้องเรียกตัวนี้
// ทั้งคู่ ห้ามเขียนเงื่อนไขซ้ำสองที่ (เทสต์ issueAccess เทียบสองทางนี้ตรง ๆ)
export function canReadIssueRow(user, row) {
  if (!user || !row) return false;
  return isSystemAdmin(user) || isIssueReporter(user, row);
}

// โพสต์ในเธรดได้ = คนที่อ่านได้ **และ** เรื่องยังเดินอยู่
// ปิด/ปฏิเสธแล้วถือเป็นหลักฐาน — กติกาเดียวกับ dept_request
export function canPostIssueUpdate(user, row) {
  if (!canReadIssueRow(user, row)) return false;
  return ISSUE_OPEN_STATUSES.includes(String(row?.status || ''));
}

// เปิดเรื่องใหม่ได้ = ทุกคนที่ล็อกอิน รวม viewer และผู้สังเกตการณ์ (มติ Q2)
// คนที่เจอบั๊กบ่อยที่สุดคือคนที่สิทธิ์น้อยที่สุด — กันไว้แล้วปัญหาจะไม่ถูกรายงานเลย
export const canReportIssue = (user) => !!user?.id;
