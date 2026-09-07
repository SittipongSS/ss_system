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
import { canDoFieldWork, canEditService, canUser, canViewCosting, canViewRequests } from '@/lib/permissions';
import { canAnswerRequest, canManageRequest, canReadRequestRow } from '@/lib/deptRequests';
import { surveyReadError } from '@/lib/service/surveyAccess';
import { surveyEditLockError } from '@/lib/service/survey';
import { findSurveyVisit } from '@/lib/service/surveyVisit';
import { visitWriteAccess } from '@/lib/service/visitAccess';

export const COSTING_ATTACHMENT_TABLE = {
  costing_item: 'costing_request_items',
  dept_request_item: 'dept_request_items',
  // หัวคำร้อง (มติผู้ใช้ 2026-08-03) — ชนิดที่ไม่มีบรรทัดไม่มีที่แนบไฟล์มาก่อนเลย
  // ทั้งที่บรีฟกลิ่น/Mock-up ต้องมีรูปอ้างอิงเป็นหลัก · ทั้ง 5 จุดข้างบนเดินผ่าน
  // ตารางนี้ จึงต่อครบด้วยการเพิ่มบรรทัดเดียว (จุด 4 อยู่ที่ driveEntityMap ซึ่งมี
  // `dept_request` อยู่แล้วตั้งแต่ mig 0173)
  dept_request: 'dept_requests',
  /* ⭐ ผลวัดพื้นที่รายใบ × รายพื้นที่ (mig 0314) — **สิทธิ์ไหลตามใบคำร้องแม่**
     ไม่ใช่ตามแถวผลวัด · แถวนี้ไม่รู้จักผู้ขอ/ฝ่าย รู้แค่ `requestId`
     ⇒ รูปเดียวกับ `dept_request_item` เป๊ะ: โหลดหัวคำร้องมาตัดสิน
     🔴 ต่อที่นี่ **ไม่ใช่** เขียนสาขาใหม่ในไฟล์ route — ไม่งั้นอ่านกับเขียนใช้คนละมาตรฐาน
        ซึ่งเป็นบั๊กที่ไฟล์นี้เคยโดนมาแล้วสองรอบ (ดูคอมเมนต์ 🐞 ข้างล่าง) */
  service_survey_zone: 'service_survey_zones',
};

export const isCostingAttachment = (entityType) => !!COSTING_ATTACHMENT_TABLE[entityType];

// ดูไฟล์แนบ — cap ของระบบ **บวกด่านรายแถวสำหรับคำร้อง**
//
/* ── หัวคำร้องของแถวลูก — โหลดที่เดียว ใช้ทั้งด่านอ่านและด่านเขียน ──────── */
async function parentRequest(supabase, parent) {
  const requestId = parent?.requestId;
  if (!requestId) return null;
  const { data, error } = await supabase
    .from('dept_requests').select('*').eq('id', requestId).maybeSingle();
  if (error) throw error;
  return data || null;
}

/* ══ ผลวัดพื้นที่ = ของโมดูลบริการ ไม่ใช่ของระบบคำร้อง ═══════════════════
 *
 * 🐞 **เจ้าหน้าที่หน้างาน (role `ts`) แนบและเปิดดูรูปไม่ได้เลยสักไฟล์ (403)** — บันได
 *   ของคำร้องตัดเขาออก **สองชั้นพร้อมกัน**: ชั้นนอก `canViewRequests` (ts ไม่มี
 *   `costing:view` และไม่มี `requests:answer`) และชั้นใน `canReadRequestRow` /
 *   `canAttachToRequest` (เขาไม่ใช่ผู้ขอ · ไม่ร่วมทีมขาย · ตอบคิวคำร้องไม่ได้)
 *   ⇒ ด่าน **"ภาพกว้าง"** ซึ่งเป็นด่านของช่างเอง ไม่มีวันติ๊ก ⇒ หัวหน้ากด "ส่งผลให้
 *     ฝ่ายขาย" ไม่ได้ตลอดกาล · ทางที่เหลือคือให้หัวหน้าถ่ายและอัปแทน ซึ่งขัดกติกาของ
 *     ด่านหกข้อที่เขียนไว้เองว่า "ดักที่ช่างตั้งแต่แรก เพราะตอนนั้นเขายังยืนอยู่ในที่นั้น"
 *
 * 🔴 **ทางลัดที่ห้ามใช้: เติม cap ให้ `role ts`**
 *   `costing:view` → เปิดทะเบียนวัสดุ/ใบขอราคา/ต้นทุนทั้งระบบ **แล้วยังแก้บั๊กไม่ได้**
 *     เพราะยังตกด่านรายแถวอยู่ดี
 *   `requests:answer` → เปิดปุ่มรับเรื่อง/มอบหมาย/ตีกลับ/ปิดใบของคำร้องฝ่าย TS ทั้งชุด
 *     + เมนูคิวคำร้อง ⇒ ยกตำแหน่ง Operation ขึ้นเทียบ Planner ซึ่งขัดมติ 2026-08-30
 *
 * ⭐ **ยกออกจากบันไดคำร้องทั้งบันได แล้วถามด่านของโมดูลบริการแทน** (แพตเทิร์นเดียวกับ
 *   `costing_item` ที่แยกไปตั้งแต่ R-1) — แตะ entityType เดียว ไม่แตะ cap ไม่แตะ proxy
 *   ไม่แตะระบบคำร้อง
 *   อ่าน → `surveyReadError` ตัวเดียวกับที่ `GET /api/service/surveys/[id]` ใช้
 *   เขียน → `visitWriteAccess` ตัวเดียวกับที่ `PATCH .../zones/[zoneId]` ใช้
 *   ⚠️ ทั้งคู่ตรวจ `request.dept === 'TS'` ให้ในตัว — ลืมข้อนี้เมื่อไร ช่างจะอ่านไฟล์แนบ
 *     ของคำร้อง RD/PC/FN ได้ เพราะบันไดชั้นนอกใช้ร่วมกันทั้งสามชนิด
 */
async function canViewSurveyZoneFiles(supabase, parent, user) {
  const req = await parentRequest(supabase, parent);
  return surveyReadError(user, req) === null;
}

async function canWriteSurveyZoneFiles(supabase, parent, user) {
  const req = await parentRequest(supabase, parent);
  if (!req) return false;

  /* 🔴 **ด่านเขียนต้องเป็นเซตย่อยของด่านอ่านเสมอ** — เริ่มจากด่านอ่านตัวเดียวกันก่อน
     🐞 เจอตอนเขียนเทสต์: รอบแรกด่านนี้ตรวจแค่ "ล็อกเวลา + ถูกมอบหมายบนนัด" ⇒ ช่างที่
       ถูกมอบหมายนัดซึ่ง `requestId` ชี้ไปที่ใบของฝ่ายอื่น (คอลัมน์นั้น**ไม่มี FK**
       และ `service_survey_zones.requestId` ก็ไม่ได้จำกัด `kind`) จะแนบไฟล์ลงใบ RD/PC/FN ได้
       ทั้งที่เปิดอ่านใบนั้นไม่ได้ด้วยซ้ำ — เขียนกว้างกว่าอ่านคือรูที่ไม่มีใครเห็นบนจอ */
  if (surveyReadError(user, req)) return false;

  /* ⭐ **ล็อกเวลาต้องเป็นตัวเดียวกับผลวัด ไม่ใช่ `status closed/cancelled` ของคำร้อง**
     🐞 ของเดิมสองระบบล็อกคนละจังหวะ ⇒ ใบที่ส่งผลไปแล้ว **แก้ตัวเลขไม่ได้ แต่สลับรูปได้**
       ⇒ SA เปิดใบเดิมแล้วเห็นภาพคนละใบกับตอนที่เขารับผล โดยไม่มีร่องรอยอะไรเลย
     ⚠️ ทางออกเป็นตัวเดียวกับของผลวัด: กด "ยังไม่จบ" ที่ใบคำร้องก่อน
     ⚠️ แอดมินผ่านด่านเวลาได้ (กติกาเดิมของไฟล์นี้) — เก็บกวาดไฟล์ที่แนบผิดใบ */
  if (user?.role !== 'admin' && surveyEditLockError(req)) return false;

  const canEditAll = canEditService(user);
  if (!canEditAll && !canDoFieldWork(user)) return false;
  /* 🔑 ด่านรายใบ — ช่างแนบได้เฉพาะใบที่ตัวเองถูกมอบหมาย (นัดคือที่เดียวที่บอกว่า "ใครไป")
     ⚠️ แคบกว่าด่านอ่านโดยตั้งใจ: อ่านเปิดให้ทั้งฝ่าย (สลับคิว/ไปช่วยงาน) แต่เขียนไม่ */
  const visit = await findSurveyVisit(supabase, req.id);
  return visitWriteAccess({ user, visit, canEditAll }).ok === true;
}

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
  // ผลวัดพื้นที่ = ระบบบริการ — แยกก่อนถึงบันไดคำร้อง (ดูหัวข้อข้างบน)
  if (entityType === 'service_survey_zone') return canViewSurveyZoneFiles(supabase, parent, user);

  // 🐞 เดิมด่านชั้นนอกของคำร้องเป็น `canViewCosting` ล้วน ซึ่งแคบ `staff` ไว้เฉพาะ
  // ฝ่ายแหล่งราคา (RD/PC) ⇒ **ฝ่ายบัญชี (FN) รับคำร้องของตัวเองได้ แต่เปิดดูรูป/
  // เอกสารที่แนบมากับใบนั้นไม่ได้สักไฟล์ และแนบกลับก็ไม่ได้** — เป็นกับดักเดิมของ R-1
  // เป๊ะ ๆ (REQUEST_ANSWER_DEPARTMENTS มี FN ด้วย, COSTING_SOURCE_DEPARTMENTS ไม่มี)
  // canViewRequests = canViewCosting ∪ ฝ่ายที่รับคำร้องของตัวเอง ⇒ ไม่มีใครเสียสิทธิ์เดิม
  if (!canViewRequests(user)) return false;
  if (entityType === 'dept_request') return canReadRequestRow(user, parent);
  // แถวลูกไม่รู้จักผู้ขอ/ฝ่าย — ต้องถามหัวคำร้อง (รูปเดียวกับ canAttachToCosting)
  if (entityType !== 'dept_request_item') return false;
  return canReadRequestRow(user, await parentRequest(supabase, parent));
}

// แนบ/ลบไฟล์:
//   ใบขอราคาผลิต — คนที่แก้ใบได้ (costing:edit); ด่านรายใบอยู่ใน route ของใบเอง
//   เคสขอราคาวัสดุ — ผู้เปิดเคส หรือฝ่ายที่ต้องตอบ และเฉพาะตอนเคสยังเดินอยู่
//                    (ปิด/ยกเลิกแล้วถือเป็นหลักฐาน ไม่ให้แก้ของแนบย้อนหลัง)
export async function canAttachToCosting(supabase, entityType, parent, user) {
  if (entityType === 'costing_item') return canViewCosting(user) && canUser(user, 'costing:edit');
  if (entityType === 'service_survey_zone') return canWriteSurveyZoneFiles(supabase, parent, user);

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
  return canAttachToRequest(await parentRequest(supabase, parent), user);
}

// ปิด/ยกเลิกแล้วถือเป็นหลักฐาน ไม่ให้แก้ของแนบย้อนหลัง (กฎเดียวกับเธรดใน updateAccess)
function canAttachToRequest(req, user) {
  if (!req) return false;
  /* ⭐ ผู้ดูแลระบบผ่านก่อนด่านสถานะ (มติผู้ใช้ 2026-08-28) — ของเดิมตัดที่บรรทัด
     สถานะ **ก่อน** ถึง canManageRequest ที่มีทางลัด superuser ⇒ แอดมินเก็บกวาด
     ไฟล์ที่แนบผิดใบบนคำร้องที่ปิดไปแล้วไม่ได้เลย ซึ่งเป็นเคสเดียวที่ต้องใช้แอดมินจริง
     ⚠️ `role === 'admin'` ไม่ใช่ isSuperuser — หัวหน้าฝ่ายขายไม่ควรแก้ของแนบบนใบที่ปิดแล้ว */
  if (user?.role === 'admin') return true;
  if (['closed', 'cancelled'].includes(req.status)) return false;
  return canManageRequest(user, req) || canAnswerRequest(user, req);
}
