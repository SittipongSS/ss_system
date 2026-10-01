// ── ด่านลำดับ deploy ของ "ต้องวางบิลไหม" (mig 0393 · เจ้าของรันเองใน SQL Editor) ──────────────────────────────
//
// โค้ดขึ้น prod ก่อนมิกได้ (deploy อัตโนมัติวันละ 3 รอบ) ⇒ ต้องรู้ว่าฐานพร้อมหรือยัง แทนที่จะปล่อยให้ฐานตอบภาษาอังกฤษ:
//   · คอลัมน์ `sales_order_installments."billingSkip"` (ติ๊ก "งวดนี้ไม่ต้องวางบิล") — ก่อนรัน = 42703 (select) / PGRST204 (เขียน)
//   · CHECK `customers_billing_rule_shape` รับรูปรุ่นสี่ (`{ v:4, need, … }`) — ก่อนรัน = 23514 ตอนเขียนกติการุ่นสี่
// ⭐ สองอย่างอยู่ในไฟล์ 0393 ไฟล์เดียว (BEGIN … COMMIT) ⇒ เห็นคอลัมน์ = CHECK รุ่นสี่พร้อมด้วย · ธงตัวเดียว `billingSkipReady`
//   (แพตเทิร์นเดียวกับ `billingSchemaReady` ของ 0389 ที่ route ของใบ)
// ⚠️ ฟังก์ชันล้วน — ตัวที่แตะฐานรับ `supabase` จากผู้เรียก (ไม่มี import ของฐานในไฟล์นี้) · ใช้ได้ทั้ง route และ cron
// ⚠️ error อย่างอื่นห้ามโทษ migration (คนจะไปรันซ้ำผิดเรื่อง) — ตัวแปลคืน null ให้ผู้เรียกตอบตามเดิม

export const BILLING_V4_MIGRATION = '0393';
export const BILLING_V4_SCHEMA_MISSING = 'ฐานข้อมูลยังไม่รองรับ "ต้องวางบิลไหม" (รอรัน migration 0393) — แจ้งผู้ดูแลระบบ';

const isColumnMissing = (error) => error?.code === '42703' || error?.code === 'PGRST204';

/**
 * แปล error ของฐานเป็นประโยค "รอรัน migration 0393" — หรือ null (ไม่ใช่เรื่องของ 0393)
 *   · 23514 ที่ CHECK `customers_billing_rule_shape` (ตัวตรวจของฐานยังเป็นรุ่นสอง · 0390) — หลังผ่าน normalizeRule แล้ว
 *   · 42703 / PGRST204 ที่พูดถึง `billingSkip`
 * ⚠️ route ของงวดต้องถามตัวนี้ **ก่อน** `installmentBillingSchemaError` (0389 · จับแค่ billingDate/Event/Rule) และ
 *    `installmentRefundSchemaError` (0378 · เหมารหัสเดียวกันทุกคอลัมน์ ⇒ จะบอกให้ไปรัน 0378 ผิดตัว)
 */
export function billingV4SchemaError(error) {
  if (!error) return null;
  const message = String(error.message || '');
  if (error.code === '23514' && /customers_billing_rule_shape/.test(message)) return BILLING_V4_SCHEMA_MISSING;
  if (isColumnMissing(error) && /billingSkip/.test(message)) return BILLING_V4_SCHEMA_MISSING;
  return null;
}

/**
 * ฐานรัน 0393 แล้วหรือยัง — ถามคอลัมน์ `billingSkip` หนึ่งแถว (ท่าเดียวกับ probe `kind` ของ historicalOrderCommit.js)
 * @returns `{ ready }` · ready false เฉพาะเมื่อฐานตอบว่าไม่มีคอลัมน์ · อ่านพลาดอย่างอื่น = true (ไม่ปิดของที่อาจใช้ได้เพราะเน็ตสะดุด —
 *   ถ้าเขียนแล้วพังจริง ตัวแปล `billingV4SchemaError` ยังบอกเหตุถูกตัว)
 */
export async function probeBillingSkip(supabase) {
  const { error } = await supabase.from('sales_order_installments').select('billingSkip').limit(1);
  return { ready: !isColumnMissing(error) };
}

/**
 * อ่านจากแถวงวดที่โหลดด้วย `select('*')` อยู่แล้ว (ไม่ต้องยิงเพิ่ม) — มีคีย์ `billingSkip` = ฐานมีคอลัมน์
 * @returns true | false | null (ไม่มีงวดให้ดู — ผู้เรียกถาม `probeBillingSkip` แทน)
 */
export function billingSkipReadyOf(rows) {
  const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
  if (!list.length) return null;
  return list.some((row) => Object.prototype.hasOwnProperty.call(row, 'billingSkip'));
}
