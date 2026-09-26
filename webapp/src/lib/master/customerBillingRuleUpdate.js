// ── แถว "ความเคลื่อนไหว" ของลูกค้า เมื่อเครดิต/รอบวางบิลถูกตั้ง/แก้/ล้าง (มติเจ้าของ 26/09 ข้อ 7 · mig 0389/0390) ──
//
// สองชั้น: `billingRuleChangeUpdate` ตอบแค่ "ควรเขียนอะไรลงเธรด" เป็นตรรกะล้วน (แพตเทิร์น lib/master/recordUpdates.js)
// + `logBillingRuleActivity` เขียนจริงผ่าน appendUpdate พร้อมสัญญา "ลงไม่สำเร็จไม่ทำให้บันทึกพัง" ที่เทสต์ได้ด้วยพฤติกรรม
// (ผู้เรียกคือ route `/api/customers/[id]/billing-rule` จุดเดียว)
//
// ⭐ **ทำไมต้องลงเธรด ทั้งที่ลง audit_logs อยู่แล้ว** — audit_logs เปิดได้เฉพาะแอดมิน (/audit · `audit:view`)
//    ฝ่ายขาย/บัญชีที่แก้รอบกันเองไม่มีทางย้อนดูว่า "เดิมรอบเป็นอะไร ใครเปลี่ยน" · รอบที่ถูกล้างหน้าตา
//    เหมือน "ไม่เคยตั้ง" ⇒ เธรดของลูกค้าเป็นที่เดียวที่ทุกคนที่เปิดหน้าลูกค้าได้อ่านย้อนได้
// ⭐ **เนื้อความ = เดิม → ใหม่** เป็นประโยคเดียวกับที่การ์ด/ใบสั่งขายพูด (`describeBillingRule`) · ยังไม่ระบุ = ขีด
//    รุ่นสอง (0390): "ไม่มีเครดิต" และหลายรอบต่อเดือน ("วางบิล 10 → เงินเข้า 25 · …") มาจากตัวเดียวกัน
//    ⚠️ หลายรอบมี → ในประโยคเอง ⇒ ฝั่งใดฝั่งหนึ่งเป็นหลายรอบ = เขียนสามบรรทัด หัว / "เดิม: …" / "ใหม่: …" แทนลูกศรคั่น
//    ⇒ หัวบรรทัดเรียก "เครดิตและรอบวางบิล" (สวิตช์เครดิตอยู่ในโมดัลเดียวกัน — "ตั้งรอบวางบิล: — → ไม่มีเครดิต" อ่านแปลก)
//    ⚠️ ค่าเดิมรูปรุ่นแรก (0389) อ่านผ่าน billingRuleOf = รุ่นสองแล้ว ⇒ เปิดโมดัลแล้วกดบันทึกเฉย ๆ ไม่ขึ้นแถวปลอม
//    คนที่แก้ไม่ต้องพิมพ์อะไร — ชื่อคนกดมาจากผู้เขียนแถว (appendUpdate ผูก `user` ให้)
// ⚠️ หมายเหตุการวางบิลเป็นส่วนหนึ่งของรอบ (ล้างรอบ = หมายเหตุหายไปด้วย) ⇒ เปลี่ยนเมื่อไรต้องเห็นค่าเดิมด้วย
//    ไม่งั้นแก้แค่หมายเหตุแล้วเธรดขึ้น "X → X" ที่อ่านไม่ออกว่าอะไรเปลี่ยน
// ⚠️ ทนของไม่ครบ (คืน null) — ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว โยน error ตรงนั้น = action ที่สำเร็จตอบ 500
import { NA } from '@/lib/format';
import { appendUpdate } from '@/lib/master/updates';
import { billingRuleOf, describeBillingRule } from '@/lib/sales/billingRule';

/* หมายเหตุหลายบรรทัด → บรรทัดเดียว (แถวระบบในเธรดโชว์สองบรรทัดแรกก่อนกดดูเพิ่ม) */
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param beforeValue  รอบเดิมบนแถวลูกค้า (ค่าดิบจาก DB — อ่านแบบทนด้วย billingRuleOf)
 * @param afterValue   รอบใหม่ที่บันทึกแล้ว (null = ล้าง)
 * @returns `{ body, meta }` สำหรับ appendUpdate (kind `billing_rule` เขียนเป็นค่าคงที่ใน `logBillingRuleActivity` —
 *          ให้ยาม updateKindCallSites ตรวจกับทะเบียนได้) · `null` เมื่อไม่มีอะไรเปลี่ยน
 */
export function billingRuleChangeUpdate(beforeValue, afterValue) {
  const before = billingRuleOf(beforeValue);
  const after = billingRuleOf(afterValue);
  if (JSON.stringify(before) === JSON.stringify(after)) return null;

  const verb = !after ? 'ล้าง' : before ? 'แก้' : 'ตั้ง';
  const oldText = describeBillingRule(before) || NA;
  const newText = describeBillingRule(after) || NA;
  const oldNote = oneLine(before?.note);
  const newNote = oneLine(after?.note);

  const lines = [];
  /* ⚠️ ประโยคหลายรอบใช้ → ในตัวเอง ("วางบิล 10 → เงินเข้า 25 · …") — ต่อ "เดิม → ใหม่" บรรทัดเดียวแล้วลูกศรห้าตัว
     มองไม่ออกว่าเดิมจบตรงไหน ⇒ ฝั่งไหนมีลูกศรในประโยค แยกเป็นบรรทัด "เดิม:" / "ใหม่:" ป้ายชัดแทนลูกศร */
  if (oldText !== newText && (oldText.includes('→') || newText.includes('→'))) {
    lines.push(`${verb}เครดิตและรอบวางบิล`, `เดิม: ${oldText}`, `ใหม่: ${newText}`);
  } else if (oldText !== newText) lines.push(`${verb}เครดิตและรอบวางบิล: ${oldText} → ${newText}`);
  else if (oldNote !== newNote) lines.push(`แก้หมายเหตุการวางบิล · ค่าอื่นคงเดิม: ${newText}`);
  else lines.push(`${verb}เครดิตและรอบวางบิล: ${newText}`);
  if (oldNote !== newNote) lines.push(`หมายเหตุ: ${oldNote || NA} → ${newNote || NA}`);

  return {
    body: lines.join('\n'),
    // รูปเต็มของทั้งสองฝั่ง — ให้ย้อนอ่านด้วยเครื่องได้โดยไม่ต้องแกะประโยคไทย (audit_logs ยังเก็บทั้งแถวอีกชั้น)
    meta: { action: !after ? 'clear' : before ? 'change' : 'set', billingRuleBefore: before, billingRuleAfter: after },
  };
}

/**
 * ลงแถว `billing_rule` ในเธรดของลูกค้า — คืน `true` เมื่อลงสำเร็จ · **ไม่ throw ไม่ว่ากรณีไหน**
 *
 * ⭐ ผู้เรียกอยู่หลังจุดที่รอบถูกเขียนและ audit_logs ลงแล้ว ⇒ ลงเธรดไม่สำเร็จ ≠ บันทึกไม่สำเร็จ
 *    (ตอบ error = ผู้ใช้กดซ้ำทั้งที่บันทึกไปแล้ว) · log ไว้แล้วคืน `false` ให้ route บอกโมดัลผ่าน `activityLogged`
 *    โมดัลจะเตือนพร้อมพิมพ์รอบเดิมแทนการสัญญาว่า "รอบเดิมอยู่ในความเคลื่อนไหว" ทั้งที่ไม่มีแถวนั้น
 * ⚠️ `appendUpdate` สัญญาว่าไม่ throw แต่ของจริง throw ได้ (supabase client พังก่อนถึง insert) — ห่อ try ทั้งก้อน
 *    เทสต์ครอบทั้งสองทาง (คืน error · throw) ด้วย supabase ปลอม ⇒ ใครเติมทางออกเป็น error ก็แดง
 * ⚠️ kind `billing_rule` เป็น **quiet** — ลงเธรดแต่ไม่เด้งกระดิ่งผู้ติดตาม (เหตุผลที่ทะเบียน updateTypes)
 *
 * @param before  รอบเดิม (รูปมาตรฐานหรือค่าดิบ) · @param after รอบที่บันทึกแล้ว (null = ล้าง)
 */
export async function logBillingRuleActivity(supabase, { customerId, before, after, user = null }) {
  try {
    const change = billingRuleChangeUpdate(before, after);
    if (!change) return false;
    const result = await appendUpdate(supabase, {
      entityType: 'customer',
      entityId: customerId,
      kind: 'billing_rule',
      body: change.body,
      meta: change.meta,
      user,
    });
    if (result && !result.error) return true;
    console.error('[billing-rule] ลงความเคลื่อนไหวของลูกค้าไม่สำเร็จ', customerId, result?.error);
  } catch (err) {
    console.error('[billing-rule] ลงความเคลื่อนไหวของลูกค้าไม่สำเร็จ', customerId, err?.message || err);
  }
  return false;
}
