// ── หัวข้อที่ "ตอบแล้ว" ได้ทางเดียว — ผ่านจอของหัวข้อนั้นเอง (มติเจ้าของ 24/09 ข้อ 1) ──
//
// 🐞 **ต้นเรื่อง**: ใบประเมินพื้นที่มีปุ่ม "ตอบแล้ว" สองที่ — "ส่งผลให้ฝ่ายขาย" บนใบประเมิน (ด่านหกข้อ ·
//   หัวหน้าบริการเท่านั้น · ส่งแล้วปิดนัดให้) กับปุ่ม "ตอบแล้ว" กลางของหน้าคำร้อง ซึ่ง **ไม่รู้จักด่านเลย**
//   ⇒ Planner/หัวหน้าขายกดได้ทั้งที่ยังไม่มีขนาดสักพื้นที่ · ฝ่ายขายได้กระดิ่ง · จอประเมินล็อกทันที
//   ⇒ เจ้าของ: "ส่งผล" เป็นทางเดียว — ซ่อนปุ่มกลางบนจอ (แทนด้วยลิงก์ไปการ์ดส่งผล) และ server ปฏิเสธ
//
// ⭐ **หัวข้อประกาศคีย์ที่ทะเบียน** (`answerVia` ใน lib/requests/kinds/**) · ไฟล์นี้แปลคีย์เป็นของที่จอ/route ใช้
//   ⚠️ ไม่เทียบชื่อหัวข้อตรง ๆ (ratchet ของทะเบียน) — หัวข้อใหม่ที่มีจอตอบของตัวเองเพิ่มคีย์ที่นี่ที่เดียว
//   ⚠️ **ไฟล์นี้ต้องอยู่ฝั่งจอได้** (หน้าคำร้องเป็น client) — ห้าม import ของที่ผูก server (notifications ·
//      next/server) · ลิงก์ของใบประเมินจึงเขียนตรงนี้ และเทสต์ตรึงให้ตรงกับกระดิ่ง "ช่างส่งงานแล้ว"
import { canSendSurveyResult } from '@/lib/permissions';
import { requestAnswerViaKey } from '@/lib/master/requestTypes';
import { requestClosure } from '@/lib/requests/closure';
import { requestSideText } from '@/lib/requests/replyTurn';

export const ANSWER_VIA = Object.freeze({
  survey_send: Object.freeze({
    label: 'ไปส่งผลที่ใบประเมิน',
    hint: 'ใบประเมินพื้นที่ตอบด้วยปุ่ม “ส่งผลให้ฝ่ายขาย” — ตรวจขนาด · รูป · แพ็คเกจ และปิดนัดให้ในจังหวะเดียว',
    // แท็บสรุปส่งผล — ที่เดียวที่เคาะแพ็คเกจและกดส่งผลได้ (ปลายทางเดียวกับกระดิ่ง survey_field_done)
    href: (requestId) => `/service/surveys/${requestId}?tab=result`,
    // คนที่กดส่งผลได้จริง — ไม่มีสิทธิ์ = ไม่โชว์ลิงก์ (กติกา ui-visibility)
    canUse: (user) => canSendSurveyResult(user),
    refusal: 'ใบประเมินพื้นที่ตอบได้ทางเดียว — กด “ส่งผลให้ฝ่ายขาย” บนใบประเมิน (ตรวจขนาด · รูป · แพ็คเกจ และปิดนัดให้)',
    // ผู้ขอปิดฝั่งตัวเองไปก่อนได้ผล (ใบก่อนมติ 24/09 ข้อ 3) — ใบประเมินล็อก ปุ่มส่งผลไม่ขึ้น ⇒ บอกทางออกจริง
    closedEarly: (request) => `${requestSideText(request, 'requester', 'ปิดเรื่องไปก่อนได้ผล')} — ใบประเมินล็อกอยู่`
      + ' · กด “ยังไม่จบ” เพื่อเปิดใบกลับ แล้วค่อยส่งผลที่ใบประเมิน',
  }),
});

/**
 * ทางตอบเฉพาะของใบนี้ — `{ key, label, hint, href, canUse, refusal }` หรือ null (ตอบด้วยปุ่มกลางได้)
 * ⚠️ รับ **ทั้งใบ** (ต้องใช้ `id` ประกอบลิงก์) · คีย์ที่ไม่รู้จักตกเป็น null ไม่ได้ — ทะเบียนตีกลับตั้งแต่ตอนโหลด
 */
export function requestAnswerVia(request) {
  const key = requestAnswerViaKey(request?.kind);
  const via = key ? ANSWER_VIA[key] : null;
  if (!via) return null;
  return {
    key,
    label: via.label,
    hint: via.hint,
    href: request?.id ? via.href(request.id) : null,
    canUse: via.canUse,
    refusal: via.refusal,
  };
}

/** ปุ่ม "ตอบแล้ว" กลาง (`PATCH /api/sa/requests/[id]` action=answer) ใช้กับใบนี้ไม่ได้เพราะอะไร — null = ใช้ได้ */
export function genericAnswerError(request) {
  return requestAnswerVia(request)?.refusal || null;
}

/**
 * ทางตอบของหัวข้อไปต่อไม่ได้ เพราะ **ผู้ขอปิดฝั่งตัวเองไปก่อนได้ผล** — ประโยคบอกทางออก หรือ null
 *
 * 🐞 ใบประเมินที่ฝ่ายขายกด "ปิดเรื่อง" ไปก่อนมติ 24/09 ข้อ 3 (`closedAt` มี · `answeredAt` ว่าง · ใบยังไม่ `closed`)
 *   ⇒ หน้าคำร้องเคยโชว์ลิงก์ "ไปส่งผลที่ใบประเมิน" เป็นปุ่มหลัก แต่ปลายทางล็อกทั้งใบ ไม่มีปุ่มส่งผล
 *   ⇒ ลิงก์ต้องจางพร้อมเหตุ (กติกา ui-visibility: ติดด่าน = โชว์แล้วบอกเหตุ) และชี้ปุ่ม "ยังไม่จบ" ที่ใช้ได้จริง
 * ⚠️ ใบ `closed` (ปิดใบโดยไม่ได้ประเมิน · ปิดครบสองฝั่ง) ไม่ใช่เคสนี้ — เปิดกลับไม่ได้ และปุ่มตอบไม่ขึ้นอยู่แล้ว
 */
export function answerViaBlockedReason(request) {
  const via = ANSWER_VIA[requestAnswerViaKey(request?.kind)];
  if (!via?.closedEarly) return null;
  if (request.status === 'closed' || request.status === 'cancelled') return null;
  const { deptDone, requesterDone } = requestClosure(request);
  return requesterDone && !deptDone ? via.closedEarly(request) : null;
}
