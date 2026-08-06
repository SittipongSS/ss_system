// ── สิทธิ์ไฟล์แนบของระบบขอราคา (ใบขอราคาผลิต / เคสขอราคาวัสดุ) ──────────
//
// ไฟล์แนบเป็นตาราง polymorphic ตัวเดียว (mig 0028) และปกติสิทธิ์จะ "อิงของแม่"
// ผ่าน canViewRecord/canEditRecord ที่คิดจากทีมเจ้าของ customer/product — แต่
// ระบบขอราคาไม่ได้คุมด้วยทีม มันคุมด้วย cap ของระบบ (canViewCosting) + ฝ่ายเจ้าของ
// จึงต้องมีเส้นทางของตัวเอง เหมือนที่โมดูล mgmt/personal_task มี
//
// ⚠️ **เพิ่ม entity แนบไฟล์ใหม่ ต้องต่อครบ 5 จุด** — ขาดจุดไหนก็หลุดเงียบจุดนั้น:
//   1 GET  /api/attachments             → loadParent คืน null → ตอบ [] เสมอ (ไฟล์ไม่ขึ้น)
//   2 POST /api/attachments             → 404 "ไม่พบระเบียนที่จะแนบเอกสาร"
//   3 DELETE /api/attachments/[id]      → บล็อกสิทธิ์อยู่ใน `if (table)` → ข้ามทั้งก้อน
//                                         = ใครก็ลบไฟล์แนบได้
//   4 lib/drive resolveFolderForEntity  → อัปโหลดพัง 500 ทั้งปุ่ม (โหมด Drive)
//   5 attachments PARENT_TABLE + สาขา   → proxy /file ตอบ 403 = รูปพรีวิวไม่ขึ้น
//     ใน .../attachments/[id]/file         ทั้งที่ไฟล์อัปขึ้นไปแล้วจริง
// costing_item (PR5) โดนข้อ 1–3 มาตั้งแต่ต้น · ทั้งคู่โดนข้อ 4–5 จนถึง 2026-07-26
import { canUser, canViewCosting, canViewRequests } from '@/lib/permissions';
import { canAnswerRequest, canManageRequest, canReadRequestRow } from '@/lib/deptRequests';

export const COSTING_ATTACHMENT_TABLE = {
  costing_item: 'costing_request_items',
  dept_request_item: 'dept_request_items',
  // หัวคำร้อง (มติผู้ใช้ 2026-08-03) — ชนิดที่ไม่มีบรรทัดไม่มีที่แนบไฟล์มาก่อนเลย
  // ทั้งที่บรีฟกลิ่น/Mock-up ต้องมีรูปอ้างอิงเป็นหลัก · ทั้ง 5 จุดข้างบนเดินผ่าน
  // ตารางนี้ จึงต่อครบด้วยการเพิ่มบรรทัดเดียว (จุด 4 อยู่ที่ driveEntityMap ซึ่งมี
  // `dept_request` อยู่แล้วตั้งแต่ mig 0173)
  dept_request: 'dept_requests',
};

export const isCostingAttachment = (entityType) => !!COSTING_ATTACHMENT_TABLE[entityType];

// ดูไฟล์แนบ — cap ของระบบ **บวกด่านรายแถวสำหรับคำร้อง**
//
// 🐞 เดิมเป็น `canViewCosting(user)` ล้วน ไม่รับ parent เลย ⇒ ใครก็ตามที่ถือ
// costing:view เปิดดูรูป/สเปกของคำร้องใบไหนก็ได้ ทั้งที่ด่าน **แนบ/ลบ**
// (canAttachToCosting) ผูกกับแถวมาตั้งแต่ต้น — อ่านกับเขียนคนละมาตรฐานกันเงียบ ๆ
//
// ใบขอราคาผลิต (costing_item) คงเดิม: คุมด้วย cap ของระบบอย่างเดียว ด่านรายใบ
// อยู่ใน route ของใบเอง — เปลี่ยนตรงนี้จะไปกระทบระบบที่ไม่เกี่ยวกัน
//
// ⚠️ async แล้ว (บรรทัดคำร้องต้องโหลดหัวคำร้องมาตัดสิน) — ผู้เรียกทั้ง 3 จุดต้อง await
export async function canViewCostingAttachment(supabase, entityType, parent, user) {
  // ใบขอราคาผลิต = ระบบราคา · คำร้อง = ระบบคำร้อง — **คนละด่านชั้นนอกตั้งแต่ R-1**
  if (entityType === 'costing_item') return canViewCosting(user);

  // 🐞 เดิมด่านชั้นนอกของคำร้องเป็น `canViewCosting` ล้วน ซึ่งแคบ `staff` ไว้เฉพาะ
  // ฝ่ายแหล่งราคา (RD/PC) ⇒ **ฝ่ายบัญชี (FN) รับคำร้องของตัวเองได้ แต่เปิดดูรูป/
  // เอกสารที่แนบมากับใบนั้นไม่ได้สักไฟล์ และแนบกลับก็ไม่ได้** — เป็นกับดักเดิมของ R-1
  // เป๊ะ ๆ (REQUEST_ANSWER_DEPARTMENTS มี FN ด้วย, COSTING_SOURCE_DEPARTMENTS ไม่มี)
  // canViewRequests = canViewCosting ∪ ฝ่ายที่รับคำร้องของตัวเอง ⇒ ไม่มีใครเสียสิทธิ์เดิม
  if (!canViewRequests(user)) return false;
  if (entityType === 'dept_request') return canReadRequestRow(user, parent);
  if (entityType !== 'dept_request_item') return false;

  // บรรทัดไม่รู้จักผู้ขอ/ฝ่าย — ต้องถามหัวคำร้อง (รูปเดียวกับ canAttachToCosting)
  const requestId = parent?.requestId;
  if (!requestId) return false;
  const { data: req, error } = await supabase
    .from('dept_requests').select('*').eq('id', requestId).maybeSingle();
  if (error) throw error;
  return canReadRequestRow(user, req);
}

// แนบ/ลบไฟล์:
//   ใบขอราคาผลิต — คนที่แก้ใบได้ (costing:edit); ด่านรายใบอยู่ใน route ของใบเอง
//   เคสขอราคาวัสดุ — ผู้เปิดเคส หรือฝ่ายที่ต้องตอบ และเฉพาะตอนเคสยังเดินอยู่
//                    (ปิด/ยกเลิกแล้วถือเป็นหลักฐาน ไม่ให้แก้ของแนบย้อนหลัง)
export async function canAttachToCosting(supabase, entityType, parent, user) {
  if (entityType === 'costing_item') return canViewCosting(user) && canUser(user, 'costing:edit');

  // ด่านชั้นนอกของคำร้องคือด่านคำร้อง ไม่ใช่ด่านราคา (เหตุผลเดียวกับ
  // canViewCostingAttachment ข้างบน — อ่านกับเขียนต้องใช้มาตรฐานเดียวกัน)
  if (!canViewRequests(user)) return false;

  // หัวคำร้อง = parent เป็นตัวคำร้องเอง ไม่ต้องไปโหลดแม่อีกชั้น
  if (entityType === 'dept_request') return canAttachToRequest(parent, user);

  if (entityType !== 'dept_request_item') return false;
  // 🐞 เคยอ่าน `parent.askId` ซึ่ง **mig 0173 เปลี่ยนชื่อเป็น `requestId` ไปแล้ว** →
  // undefined ทุกครั้ง → ด่านนี้คืน false ทุกครั้ง = แนบไฟล์ในรายการคำร้องไม่ได้เลย
  // ตั้งแต่ 0173 (ยืนยันกับ schema จริง: `dept_request_items.askId does not exist`)
  // · ไม่มีอะไร error เพราะ `?.` กลืนให้หมด — บทเรียนเดิม: rename คอลัมน์ต้อง grep
  //   ผู้อ่านทุกจุด ชื่อคอลัมน์ที่เป็นสตริงไม่มีใครตรวจให้
  const requestId = parent?.requestId;
  if (!requestId) return false;
  const { data: req, error } = await supabase
    .from('dept_requests').select('*').eq('id', requestId).maybeSingle();
  if (error) throw error;
  return canAttachToRequest(req, user);
}

// ปิด/ยกเลิกแล้วถือเป็นหลักฐาน ไม่ให้แก้ของแนบย้อนหลัง (กฎเดียวกับเธรดใน updateAccess)
function canAttachToRequest(req, user) {
  if (!req) return false;
  if (['closed', 'cancelled'].includes(req.status)) return false;
  return canManageRequest(user, req) || canAnswerRequest(user, req);
}
