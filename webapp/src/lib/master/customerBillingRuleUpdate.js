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
//
// ── รุ่นสี่ "ต้องวางบิลไหม" (mig 0393 · system-design §7.1) ─────────────────────────────────────────────────────
// ⭐ ค่าใหม่ที่ route เขียนเป็นรุ่นสี่เสมอ (`normalizeRule(…, { allowLegacy:false })`) · ค่าเดิมอาจเป็นรูปไหนก็ได้
//   · "ไม่มีอะไรเปลี่ยน" เทียบด้วย `sameRule` (ผลการอ่านรุ่นสี่ทั้งสองฝั่ง) — รุ่นสองกับรุ่นสี่ที่ความหมายเท่ากันไม่ขึ้นแถวปลอม
//     · ⚠️ ห้ามกลับไปเทียบด้วย `billingRuleOf` — ตัวอ่านรุ่นเดิมเห็นรุ่นสี่เป็น null ⇒ ตั้งกติการุ่นสี่ทุกครั้งกลายเป็น "ล้าง"
//   · ประโยค = `describeBillingRule` (ตัวห่อ: รูปเดิม = ประโยคเดิมทุกตัวอักษร · รุ่นสี่ = `describeRule` — "ไม่ต้องวางบิล" ·
//     "ต้องวางบิล · ยังไม่ตั้งรอบ" · "วางบิลวันที่ 10 → กำหนดชำระวันที่ 25" …)
//   · หัวบรรทัด: มีฝั่งไหนเป็นรุ่นสี่ = "กำหนดวางบิล" (คำถามใหม่ครอบทั้ง ต้องวางบิลไหม + รอบ + เครดิต) · รูปเดิมล้วน = คำเดิม
//   · meta เก็บรูปมาตรฐานของรุ่นตัวเอง (รูปเดิม = billingRuleOf · รุ่นสี่ = ruleOf) — ย้อนอ่านด้วยเครื่องได้ไม่ต้องเดารุ่น
//
// ── รุ่นห้า "ปฏิทินรายปีของลูกค้า" (มติ 29/09 · contracts v5 §6) ─────────────────────────────────────────────────────
// ⭐ ประโยคกติกาของปฏิทินบอกได้แค่ "ตามปฏิทินลูกค้า ปี 2026 (24 รอบ)" — แก้วันเดียว/แนบรูป/ใส่ปีหน้าแล้วประโยคเท่าเดิม
//    ⇒ ต่อท้ายด้วย `calendarDiffSummary` ของ lib ("ปฏิทิน 2026: แก้ 1 รอบ — ต.ค. รอบ 2: ตัด พ. 21 ต.ค. → พฤ. 22 ต.ค." ·
//    "แนบรูปปฏิทิน 2027" · "เพิ่มปฏิทิน 2027 (24 รอบ)" · "เวลาตัดรอบ 16:00 → —") ทั้งเธรดและ audit (`calendarChangeLines`)
//    ประโยคเท่ากัน + หมายเหตุเท่ากัน = หัวบรรทัด "แก้ปฏิทินวางบิล" แทน "แก้กำหนดวางบิล: X" ที่อ่านเหมือนไม่มีอะไรเปลี่ยน
// ⭐ รูปปฏิทิน (`years[YYYY].fileId`) ต้องเป็นไฟล์แนบของลูกค้ารายนี้ (`calendarFileIdsToCheck` + `checkCalendarFiles`) —
//    ตรวจเฉพาะ id ที่เพิ่งเข้ามา (ไฟล์ที่ผูกไว้เดิมแล้วถูกลบทีหลังต้องไม่ทำให้บันทึกกติกาไม่ได้)
import { NA } from '@/lib/format';
import { appendUpdate } from '@/lib/master/updates';
import { billingRuleOf, calendarDiffSummary, describeBillingRule, isV4Rule, ruleOf, sameRule } from '@/lib/sales/billingRule';

/* หมายเหตุหลายบรรทัด → บรรทัดเดียว (แถวระบบในเธรดโชว์สองบรรทัดแรกก่อนกดดูเพิ่ม) */
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/* รูปมาตรฐานของค่าตามรุ่นของมันเอง — รูปพัง = null ("ไม่ตั้ง") */
const canonicalOf = (value) => (isV4Rule(value) ? ruleOf(value) : billingRuleOf(value));

/**
 * บรรทัดสรุปการแก้ปฏิทิน (เธรด + audit ใช้ชุดเดียวกัน) — สองฝั่งต้องเป็นปฏิทิน ไม่งั้น `[]` (ประโยคกติกาเปลี่ยนอยู่แล้ว)
 * ⚠️ ทน: ค่าพังทุกแบบ = `[]` (ผู้เรียกอยู่หลังจุดที่เขียนฐานแล้ว)
 */
export function calendarChangeLines(beforeValue, afterValue) {
  try {
    return calendarDiffSummary(beforeValue, afterValue).lines;
  } catch {
    return [];
  }
}

/* รูปปฏิทินที่ต้องตรวจตอนบันทึก = fileId ใหม่ (ไม่มีในค่าเดิม) · @returns `[{ year, fileId }]` */
export function calendarFileIdsToCheck(beforeValue, afterValue) {
  const files = (value) => {
    const rule = ruleOf(value);
    if (rule?.runs?.kind !== 'calendar') return [];
    return Object.keys(rule.runs.years).sort()
      .map((year) => ({ year, fileId: rule.runs.years[year].fileId || '' }))
      .filter((f) => f.fileId);
  };
  const seen = new Set(files(beforeValue).map((f) => f.fileId));
  return files(afterValue).filter((f) => !seen.has(f.fileId));
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * รูปปฏิทินที่เพิ่งผูกต้องเป็นไฟล์แนบของลูกค้ารายนี้ — `{ error, status }` (null = ผ่าน)
 * ⚠️ supabase ไม่ throw (คืน `{ error }`) — อ่านพลาด = 503 บอกให้ลองใหม่ ไม่ใช่ผ่านเงียบ (ไม่งั้นด่านนี้ไม่มีความหมาย)
 */
export async function checkCalendarFiles(supabase, customerId, list) {
  if (!list?.length) return null;
  const bad = list.find((f) => !UUID_SHAPE.test(f.fileId));
  if (bad) return { status: 400, error: `รูปปฏิทินปี ${bad.year} ไม่ถูกต้อง — แนบรูปใหม่` };
  const ids = [...new Set(list.map((f) => f.fileId))];
  const { data, error } = await supabase
    .from('attachments')
    .select('id')
    .eq('entityType', 'customer')
    .eq('entityId', customerId)
    .in('id', ids)
    .limit(ids.length);   // ขอบเขตจริง = จำนวนปีที่เพิ่งผูกรูป (ไม่กี่แถว) — ด่าน check:rowcap
  if (error) return { status: 503, error: 'ตรวจรูปปฏิทินไม่สำเร็จ — ลองบันทึกอีกครั้ง' };
  const found = new Set((data || []).map((row) => row.id));
  const missing = list.find((f) => !found.has(f.fileId));
  return missing ? { status: 400, error: `รูปปฏิทินปี ${missing.year} ไม่ใช่ไฟล์ของลูกค้ารายนี้ (หรือถูกลบไปแล้ว) — แนบรูปใหม่` } : null;
}

/**
 * @param beforeValue  รอบเดิมบนแถวลูกค้า (ค่าดิบจาก DB · ทุกรุ่น — อ่านแบบทน รูปพัง = ไม่ตั้ง)
 * @param afterValue   รอบใหม่ที่บันทึกแล้ว (รุ่นสี่ · null = ล้าง)
 * @returns `{ body, meta }` สำหรับ appendUpdate (kind `billing_rule` เขียนเป็นค่าคงที่ใน `logBillingRuleActivity` —
 *          ให้ยาม updateKindCallSites ตรวจกับทะเบียนได้) · `null` เมื่อไม่มีอะไรเปลี่ยน
 */
export function billingRuleChangeUpdate(beforeValue, afterValue) {
  const before = canonicalOf(beforeValue);
  const after = canonicalOf(afterValue);
  if (sameRule(before, after)) return null;

  const verb = !after ? 'ล้าง' : before ? 'แก้' : 'ตั้ง';
  const subject = isV4Rule(before) || isV4Rule(after) ? 'กำหนดวางบิล' : 'เครดิตและรอบวางบิล';
  const oldText = describeBillingRule(before) || NA;
  const newText = describeBillingRule(after) || NA;
  const oldNote = oneLine(before?.note);
  const newNote = oneLine(after?.note);

  const calendar = calendarChangeLines(before, after);

  const lines = [];
  /* ⚠️ ประโยคหลายรอบใช้ → ในตัวเอง ("วางบิล 10 → เงินเข้า 25 · …") — ต่อ "เดิม → ใหม่" บรรทัดเดียวแล้วลูกศรห้าตัว
     มองไม่ออกว่าเดิมจบตรงไหน ⇒ ฝั่งไหนมีลูกศรในประโยค แยกเป็นบรรทัด "เดิม:" / "ใหม่:" ป้ายชัดแทนลูกศร */
  if (oldText !== newText && (oldText.includes('→') || newText.includes('→'))) {
    lines.push(`${verb}${subject}`, `เดิม: ${oldText}`, `ใหม่: ${newText}`);
  } else if (oldText !== newText) lines.push(`${verb}${subject}: ${oldText} → ${newText}`);
  /* ปฏิทินที่แก้แค่วัน/รูป — ประโยคเท่าเดิม ⇒ หัวบรรทัดบอกว่าแก้ปฏิทิน แล้วรายละเอียดอยู่บรรทัดถัดไป
     ⚠️ มาก่อน "แก้หมายเหตุ · ค่าอื่นคงเดิม" — แก้วันในปฏิทิน + หมายเหตุพร้อมกัน ห้ามหัวบรรทัดบอกว่าค่าอื่นคงเดิม */
  else if (calendar.length) lines.push(`แก้ปฏิทินวางบิล · ${newText}`);
  else if (oldNote !== newNote) lines.push(`แก้หมายเหตุการวางบิล · ค่าอื่นคงเดิม: ${newText}`);
  else lines.push(`${verb}${subject}: ${newText}`);
  if (oldNote !== newNote) lines.push(`หมายเหตุ: ${oldNote || NA} → ${newNote || NA}`);
  lines.push(...calendar);

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
