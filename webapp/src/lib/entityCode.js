// รหัสเอนทิตีมาตรฐาน DL-YYMMXXXX (ดีล) / PJ-YYMMXXXX (โครงการ) — mig 0096.
//   YY=ปี ค.ศ. 2 หลัก, MM=เดือน, XXXX=เลขรัน 4 หลัก (atomic ต่อ scope+เดือน).
//   "ฐาน" ที่เก็บใน DB ไม่มี -R; หน้าจอ/เอกสารแสดง base + '-' + revision
//   (revise เริ่ม 0, เพิ่มเมื่อออก Revise — โครงการ; ดีลคง 0 เสมอ). มติผู้ใช้ 2026-07-14.
import { businessMonthKey } from '@/lib/businessDate';

// เดือนคีย์ 'YYMM' ตามปฏิทินไทย (Asia/Bangkok) — ตัวเดียวกับที่ใบเสนอราคา/ใบขอราคา
// ผลิต/เลขที่คำร้องใช้ (businessMonthKey)
//
// ⚠️ ห้ามกลับไปอ่านเดือนจาก Date ตรง ๆ (getMonth/getFullYear) — นั่นคือเดือนตาม
// timezone ของเครื่องที่รัน ซึ่งบน Vercel คือ UTC ⇒ วันที่ 1 ช่วง 00:00–06:59 ตามเวลาไทย
// ดีล/โครงการ/ใบผลิต/งานบริการ/เรื่องแจ้งระบบ จะได้เลขต่อท้าย "เดือนก่อน" ขณะที่
// ใบเสนอราคาที่ออกนาทีเดียวกันขึ้นเดือนใหม่ไปแล้ว — เลขคาบเกี่ยวสองเดือนพร้อมกัน
export function ymKey(now = new Date()) {
  return businessMonthKey(now);
}

// เลขรันตั้งต้น 4 หลักต่อเดือน — ฟังก์ชัน SQL ที่ออกรหัส (mig 0240) รับค่านี้ไปเติมศูนย์ให้
export const ENTITY_RUNNING_WIDTH = 4;

/* ── รอบตัด + ความกว้างของเลขรัน รายสโคป (มติผู้ใช้ 2026-09-01 · mig 0330) ──
   *"PT ขอทำพร้อม DL PJ"* + เลือกความกว้าง **5 หลัก**

   ⭐ **ดีล (DL) กับโครงการ (PJ) ตัดรอบทุกปี ส่วน PB/SV/IS ยังรายเดือน** — สาม scope หลัง
   ไม่ได้อยู่ในมติรอบนี้ และเลขรายเดือนของมันช่วยให้เดาอายุงานจากเลขได้อยู่

   🔴 **`YYMM` ในรหัส ≠ ตัวตัดรอบ** (กับดักเดิมของทั้งระบบ — ดู requests/docNo.js ·
   sales/contracts.js · mig 0328) · `YYMM` มาจาก **prefix** = เดือนที่สร้างแถว
   ส่วนตัวตัดรอบคือ **คีย์ `month` ของ `entity_number_counters`** ซึ่ง DL/PJ เป็น `'YY'`

   ⭐ **ความกว้าง 5 หลักสำหรับ DL/PJ** เพราะเพดานเปลี่ยนหน่วยจาก "ต่อเดือน" เป็น "ต่อปี":
   ดีลออก ~415 ใบ/เดือน ≈ 5,000 ใบ/ปี ⇒ 4 หลัก (9,999) เหลือหัวไม่ถึงเท่าตัว โตอีกนิด
   เดียวก็ชนเพดานกลางปีแล้ว **สร้างดีลไม่ได้ทั้งระบบ** (RPC โยน sequence_exhausted)

   ⚠️ **รหัสชุด 5 หลักไม่ชนกับชุด 4 หลักเดิมโดยโครงสร้าง** — คนละความยาว = คนละสตริง
   (`DL-26090001` กับ `DL-260900568`) ⇒ ไม่ต้อง backfill และของเก่าคงเดิมทุกใบ
   🪤 แต่มันเรียงสตริงสลับกัน (ชุด 5 หลักมาก่อนชุด 4 หลักในการ sort แบบตัวอักษร) —
   หน้าจอที่เรียงด้วย `code` ดิบจะเห็นสองกองคั่นกัน ให้เรียงด้วยวันที่แทนถ้าสำคัญ */
const ENTITY_YEARLY_SCOPES = Object.freeze(['DL', 'PJ']);
const ENTITY_WIDE_SCOPES = Object.freeze(['DL', 'PJ']);
export const ENTITY_WIDE_RUNNING_WIDTH = 5;

/** คีย์ถังนับของ scope นั้น — ปี (`'26'`) สำหรับ DL/PJ · เดือน (`'2609'`) สำหรับที่เหลือ
 *  ⚠️ นี่คือ **ตัวตัดรอบจริง** ไม่ใช่ `YYMM` ที่โผล่ในรหัส */
export const entityCounterKey = (scope, now = new Date()) => (
  ENTITY_YEARLY_SCOPES.includes(scope) ? ymKey(now).slice(0, 2) : ymKey(now)
);

/** ความกว้างเลขรันของ scope นั้น */
export const entityRunningWidth = (scope) => (
  ENTITY_WIDE_SCOPES.includes(scope) ? ENTITY_WIDE_RUNNING_WIDTH : ENTITY_RUNNING_WIDTH
);

// ── สร้างแถวพร้อมออกรหัส (mig 0240) ───────────────────────────────────────
// ⚠️ **ห้ามกลับไปจองเลขเองแล้วค่อย insert แยก** — นั่นคือสองทรานแซกชัน เลขถูก commit
// ตั้งแต่คำสั่งแรก ⇒ insert ล้มเมื่อไรเลขนั้นหายจากระบบถาวร (เลขข้าม) · ฟังก์ชัน SQL
// จองเลขกับ insert ในคำสั่งเดียว ล้มตรงไหนก็ rollback คืนเลขให้เอง
//
// รับหลายแถวเสมอ: ที่ gen ทีละชุด (ใบผลิตอัตโนมัติ · นัดบริการตามรอบ) ต้องได้พฤติกรรม
// เดิมคือล้มใบไหนก็ล้มทั้งชุด ไม่ค้างครึ่งทาง · คืน { data, error } ดิบตามเดิม
export function insertRowsWithEntityCode(supabase, scope, rows, now = new Date()) {
  // ⚠️ สองค่านี้ **คนละเรื่องกันโดยตั้งใจ**: `p_month` = คีย์ถังนับ (รอบตัด) ·
  // `p_prefix` = สิ่งที่โผล่ในรหัสจริง ซึ่งมี YYMM เสมอไม่ว่ารอบตัดจะเป็นอะไร
  return supabase.rpc('create_entity_rows_with_code', {
    p_scope: scope,
    p_month: entityCounterKey(scope, now),
    p_prefix: `${scope}-${ymKey(now)}`,
    p_width: entityRunningWidth(scope),
    p_rows: rows,
  });
}

/* ── รหัสที่ประกอบเอง (มติผู้ใช้ 2026-08-29 · ไซต์ ST- / โซน ZN-) ──────────
   ⭐ **ตัวออกรหัสไม่รู้จักรูปแบบ** อยู่แล้วโดยเจตนา (mig 0240) — มันแค่ต่อเลขรันท้าย
      `p_prefix` แล้วเขียนลงคอลัมน์ `code` ⇒ รหัสรูปใหม่ที่ **เลขรันอยู่ท้ายสุด**
      ออกได้โดยไม่ต้องแก้ SQL สักบรรทัด
   ⚠️ `bucket` คือ **คีย์ถังนับ** (คอลัมน์ `month` ของ entity_number_counters ซึ่งเป็น
      text อิสระ) — `'-'` = นับยาวตัวเดียวตลอดกาล แบบเดียวกับ AR/FG (mig 0230)
      ห้ามเปลี่ยนคีย์ถังของ scope ที่ออกรหัสไปแล้ว: เลขจะเริ่มนับใหม่แล้วชนของเดิม
   ⚠️ **prefix ต่างกันรายแถว = ต้องยิงทีละแถว** — RPC รับ prefix เดียวต่อหนึ่ง call
      ⇒ ผู้เรียกที่สร้างหลายแถวคนละไซต์/คนละชั้น ต้องวนเอง และรับผลว่าล้มกลางทางได้
      (ต่างจาก `insertRowsWithEntityCode` ที่ทั้งชุดล้มพร้อมกัน) */
export function insertRowsWithComposedCode(supabase, { scope, bucket, prefix, width }, rows) {
  return supabase.rpc('create_entity_rows_with_code', {
    p_scope: scope,
    p_month: bucket,
    p_prefix: prefix,
    p_width: width,
    p_rows: rows,
  });
}

export async function insertRowWithComposedCode(supabase, options, row) {
  const { data, error } = await insertRowsWithComposedCode(supabase, options, [row]);
  if (error) return { data: null, error };
  return { data: Array.isArray(data) ? (data[0] ?? null) : null, error: null };
}

// ใบเดี่ยว — คืนแถวเดียวแทน array ให้ผู้เรียกใช้แทน .insert().select().single() ได้ตรง ๆ
export async function insertRowWithEntityCode(supabase, scope, row, now = new Date()) {
  const { data, error } = await insertRowsWithEntityCode(supabase, scope, [row], now);
  if (error) return { data: null, error };
  return { data: Array.isArray(data) ? (data[0] ?? null) : null, error: null };
}

// พรีวิวรหัสถัดไป "โดยไม่กินเลข" (สำหรับหน้าฟอร์มโชว์เฉย ๆ — ห้ามใช้ตอน insert จริง
// เพราะไม่ atomic และเลขที่โชว์อาจถูกคนอื่นเอาไปก่อน)
// ตัวจริงตอนสร้างคือ insertRowWithEntityCode / insertRowsWithEntityCode ข้างบน
export async function peekNextEntityCode(supabase, scope, now = new Date()) {
  // ⚠️ อ่านถังนับด้วย **คีย์รอบตัด** (ปีสำหรับ DL/PJ) แต่ประกอบรหัสด้วย **YYMM** —
  // เผลอใช้ค่าเดียวกันทั้งสองที่เมื่อไร ตัวอย่างที่โชว์จะเป็นคนละเลขกับที่ออกจริง
  const { data } = await supabase
    .from('entity_number_counters').select('lastNo')
    .eq('scope', scope).eq('month', entityCounterKey(scope, now)).maybeSingle();
  const next = (data?.lastNo || 0) + 1;
  return `${scope}-${ymKey(now)}${String(next).padStart(entityRunningWidth(scope), '0')}`;
}

// แสดงรหัสเต็ม = ฐาน + '-' + revision (revise เริ่ม 0). ไม่มีรหัส → '-'.
export function entityCodeDisplay(baseCode, rev) {
  if (!baseCode) return '-';
  const r = Number.isFinite(Number(rev)) ? Number(rev) : 0;
  return `${baseCode}-${r}`;
}
