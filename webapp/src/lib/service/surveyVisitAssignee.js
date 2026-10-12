// ── ผู้รับผิดชอบของนัดประเมินพื้นที่ = "ผู้ประเมิน" บนรายงานการประเมินพื้นที่ (PR-SIG · มติเจ้าของ 09/10/2026) ───────────
//
// ⭐ เมื่อกติกาลายเซ็นจริงเปิด (`SURVEY_REPORT_SIGNATURES`) รายงาน FM-TS-01 พิมพ์ **ลายเซ็นจริงที่บันทึกไว้** ของบัญชีที่ผูกกับนัด
//   (`service_visits.assigneeId`) ลงที่นั่ง "ผู้ประเมิน" — โดยเจ้าตัวไม่ต้องกดอะไร (ข้อยกเว้นของมติ 0006 ข้อ 1)
//   ⇒ ช่องนี้เลิกเป็นแค่ "ใครขึ้นตาราง": มันคือ **ลายเซ็นของใครจะขึ้นกระดาษที่ส่งลูกค้า**
//
// 🐞 PATCH นัดรับ `assigneeId` / `assigneeName` จาก body ตรง ๆ (`normalizeVisitInput`) — ยามเดียวที่มีคือช่างแก้ช่องของแผนไม่ได้:
//   · ผู้จัดคิว/หัวหน้าเปลี่ยนผู้รับผิดชอบของนัดที่ **ปิดงานไปแล้ว** ได้ ⇒ ผู้ประเมิน ก. ที่ยังไม่มีลายเซ็น (หรือออกไปแล้ว) ถูกสลับเป็น ข.
//     ที่มีลายเซ็น แล้วเอกสารพิมพ์ลายเซ็นของ ข. รับรองนัดที่ ข. ไม่เคยไป — ทางลัดที่ทำให้กติกา "ไม่มีลายเซ็น = ส่งผลไม่ได้" ไร้ความหมาย
//   · ใส่รหัสของบัญชีอะไรก็ได้ (หน้าจัดคิวกรองฝ่ายบริการแค่ในเบราว์เซอร์) และพิมพ์ชื่ออะไรก็ได้คู่กับรหัสนั้น
//
// 🔑 กติกาของไฟล์นี้ (นัดประเมินพื้นที่ · กติกาลายเซ็นจริงเปิดเท่านั้น):
//   1. นัดที่ **ปิดงานแล้ว** (เข้าแล้ว · ทำไม่ครบ · ทำไม่ได้) เปลี่ยนผู้รับผิดชอบไม่ได้ — 409 พร้อมทางออก (เปิดนัดกลับก่อน)
//   2. เปลี่ยนผู้รับผิดชอบของนัดที่ยังไม่ปิด: บัญชีต้องมีจริง ไม่ถูกระงับ และเป็นฝ่ายบริการ (`canBeServiceAssignee`) —
//      ตัวตรวจชุดเดียวกับตอนลงคิวจากใบคำร้อง (`/api/sa/requests/[id]` commit-due)
//   3. **ชื่อมาจากทะเบียนผู้ใช้เสมอ ไม่ใช่จาก body** — ชื่อกับรหัสบนนัดชี้คนเดียวกัน
//
// ⚠️ ยามชั้นนี้กัน "ของเข้า" · ยามที่ตัดสินจริงว่าลายเซ็นของใครขึ้นกระดาษอยู่ที่ตัวโหลดของรายงาน (`signerEligible` ·
//   `surveyReportInputs.js`): บัญชีนอกฝ่ายบริการไม่ถูกพิมพ์ลายเซ็นไม่ว่ารหัสจะเข้ามาทางไหน (เส้นมอบหมายของคำร้องก็เขียนช่องนี้ได้)
// ⚠️ **กติกาปิด = ไม่ทำอะไรเลย** (ไม่อ่านทะเบียนผู้ใช้ ไม่ตีกลับ) — PATCH นัดเดินเหมือนก่อนมีไฟล์นี้ทุกก้าว (merge แบบปิดไว้ก่อน)
// ⚠️ นัดชนิดอื่นไม่เกี่ยว — ไม่มีชนิดไหนป้อนที่นั่งผู้ประเมินของรายงาน และนัดประเมินสร้างมือไม่ได้ (เกิดจากใบคำร้องเท่านั้น)
import { canBeServiceAssignee } from '@/lib/permissions';
import { loadUserDirectory } from '@/lib/usersRepo';
import { surveyReportSignaturesOn } from './surveyReportSignFlag';
import { SURVEY_VISIT_KIND } from './surveyVisit';
import { isClosedVisit } from './visitStatus';

/** 409 — นัดประเมินที่ปิดงานแล้ว ผู้รับผิดชอบคือบันทึกว่าใครไป และคือที่นั่งผู้ประเมินของเอกสาร */
export const SURVEY_VISIT_ASSIGNEE_CLOSED_ERROR = 'นัดประเมินที่ปิดงานแล้วเปลี่ยนผู้รับผิดชอบไม่ได้ — คนบนนัดคือ “ผู้ประเมิน” '
  + 'ที่รายงานการประเมินพื้นที่พิมพ์ลายเซ็น · ถ้าบันทึกผิดคน ให้เปิดนัดกลับก่อนแล้วจึงเปลี่ยน';

/** 400 — ประโยคเดียวกับตอนลงคิวจากใบคำร้อง */
export const SURVEY_VISIT_ASSIGNEE_MISSING_ERROR = 'ไม่พบบัญชีเจ้าหน้าที่บริการที่เลือก';
export const surveyVisitAssigneeNotServiceError = (name) => `${name} รับงานเข้าไซต์ไม่ได้ — ต้องเป็นฝ่ายบริการ (TS)`;

const idOf = (value) => (value !== null && value !== undefined && value !== '' ? String(value) : null);
const nameOf = (value) => String(value ?? '').trim() || null;

/**
 * 🔑 **ตรวจการเปลี่ยนผู้รับผิดชอบของนัดประเมิน** — คืน `{ error, status, patch }`
 *   `error` ไม่ว่าง = ตีกลับด้วย `status` (409 นัดปิดแล้ว · 400 บัญชีใช้ไม่ได้) · ไม่งั้น `patch` = คีย์ที่ต้องทับลงค่าที่จะเขียน
 *   (`{}` = ไม่มีอะไรเปลี่ยน หรือยามนี้ไม่ทำงาน)
 *
 * @param before  แถวนัดก่อนแก้
 * @param value   ค่าหลัง `normalizeVisitInput` (`assigneeId` · `assigneeName` ที่กำลังจะเขียน)
 * @param opts.ruleOn         กติกาลายเซ็นจริงเปิดไหม — ไม่ส่ง = ถามสวิตช์ (เทสต์ส่งตรง ๆ)
 * @param opts.loadDirectory  ตัวอ่านทะเบียนผู้ใช้ (เทสต์เสียบแทน) — ถูกเรียก **เฉพาะเมื่อมีอะไรเปลี่ยนจริง**
 *
 * ⚠️ รหัสเดิมแต่ชื่อใน body ต่างจากของเดิม = ไม่ใช่การเปลี่ยนคน: ชื่อถูกแทนด้วยชื่อในทะเบียน (บัญชีหาไม่เจอ = ชื่อเดิมบนนัด) —
 *    ทำได้แม้นัดปิดแล้ว (ปรับสำเนาชื่อให้ตรงบัญชี ไม่ได้ย้ายลายเซ็นไปหาใคร)
 * ⚠️ ถอดผู้รับผิดชอบ (รหัสว่าง) ของนัดที่ยังไม่ปิด: ชื่อถูกล้างด้วย — ชื่อที่ไม่ผูกบัญชีคือที่นั่งที่ไม่มีใครลงนามได้
 * ⚠️ ทะเบียนอ่านไม่สำเร็จ = ตัวอ่านคืนทะเบียนว่าง ⇒ "ไม่พบบัญชี" (fail closed · ยังไม่ได้เขียนอะไร กดใหม่ได้)
 */
export async function surveyVisitAssigneePatch(supabase, before, value, { ruleOn, loadDirectory = loadUserDirectory } = {}) {
  const pass = { error: null, status: null, patch: {} };
  if (before?.kind !== SURVEY_VISIT_KIND) return pass;
  if (!(ruleOn === undefined ? surveyReportSignaturesOn() : ruleOn === true)) return pass;

  const idBefore = idOf(before.assigneeId);
  const idAfter = idOf(value?.assigneeId);
  const moved = idBefore !== idAfter;
  if (!moved && nameOf(before.assigneeName) === nameOf(value?.assigneeName)) return pass;
  if (moved && isClosedVisit(before)) return { error: SURVEY_VISIT_ASSIGNEE_CLOSED_ERROR, status: 409, patch: {} };
  if (!idAfter) return { error: null, status: null, patch: { assigneeName: null } };

  const directory = await loadDirectory(supabase);
  const account = directory?.get?.(idAfter) || null;
  if (!moved) return { error: null, status: null, patch: { assigneeName: nameOf(account?.name) || before.assigneeName || null } };
  if (!account || account.disabled) return { error: SURVEY_VISIT_ASSIGNEE_MISSING_ERROR, status: 400, patch: {} };
  if (!canBeServiceAssignee(account)) {
    return { error: surveyVisitAssigneeNotServiceError(account.name || 'บัญชีนี้'), status: 400, patch: {} };
  }
  return { error: null, status: null, patch: { assigneeName: nameOf(account.name) } };
}
