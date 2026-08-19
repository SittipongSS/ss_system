// ── เลขที่เอกสาร PDR — DDMMYY-XXX (mig 0271) ─────────────────────
//
// ⭐ ที่มา (IS-26080030 ข้อ 1 · มติผู้ใช้ 2026-08-20): กระดาษเดิมของ RD มีเลข
// ISO ต่อท้ายรหัสแบบฟอร์ม `FM-RD-01-170869-016` ⇒ ส่วนที่ระบบออกให้คือ
// **170869-016** · รหัสแบบฟอร์มพิมพ์อยู่แล้วในบรรทัด `formLine` ของหัวเอกสาร
//
//   DDMMYY = วันที่ฝ่าย **รับเรื่อง** · YY เป็น **พ.ศ.** 2 หลัก (2569 ⇒ 69)
//   XXX    = เลขรัน 3 หลัก **ตัดรอบทุกเดือน**
//
// ⚠️ **คนละตัวกับ `docNo`** — `docNo` (SB-26080001) คือ *เลขที่คำร้อง* ออกตอน
// ผู้ขอกดส่ง · เลขนี้เป็นของ *ฝ่ายปลายทาง* ออกตอนรับเรื่อง ⇒ ใบที่ส่งปลายเดือน
// แล้ว RD รับต้นเดือนถัดไป จะมีเลขสองตัวคนละเดือนกันโดยตั้งใจ
//
// ⚠️ **ตัวนับอยู่ใน SQL ไม่ใช่ที่นี่** (บทเรียนเดียวกับ `docNo.js`) — ฝั่งนี้รู้แค่
// "รูปแบบของเลข" แล้วส่งชิ้นส่วนให้ฟังก์ชันออกเลข ห้ามประกอบเลขเองแล้วส่งไปเขียน
import { businessDate, businessMonthKey } from '@/lib/businessDate';
import { BUDDHIST_YEAR_OFFSET } from '@/lib/format';
import { requestHasPdr } from '@/lib/master/requestTypes';

export const PDR_REF_RUNNING_WIDTH = 3;

/**
 * ⭐ **เดือนแรกที่ระบบออกเลขเอง** (มติผู้ใช้ 2026-08-20) — เดือนนี้ RD ยังเดินเลข
 * บนกระดาษของตัวเองอยู่ ใบที่รับเรื่องก่อนหน้านี้จึง **กรอกเลขเอง** ส่วนใบที่รับเรื่อง
 * ตั้งแต่เดือนนี้เป็นต้นไประบบออกให้ตอนกดรับเรื่อง
 *
 * ⚠️ **เกณฑ์คือเดือนของ `acknowledgedAt` ของใบ ไม่ใช่วันที่ตอนกด** — ใบที่รับเรื่อง
 * เดือน ส.ค. แล้วมากรอกเดือน ก.ย. ยังเป็นเลขของ ส.ค. อยู่ดี · ถ้ายึดวันที่ตอนกด
 * ใบเดือน ส.ค. ที่ยังไม่ได้กรอกจะค้างไม่มีเลขถาวรตั้งแต่ 1 ก.ย.
 *
 * ⚠️ **และมันกันเลขชนกันด้วย** — ตัวนับของเดือน 2608 ไม่เคยถูกใช้ (เดือนนั้นกรอกมือ
 * ล้วน) ⇒ ถ้าปล่อยให้กดออกอัตโนมัติย้อนหลังให้ใบเดือน ส.ค. ได้ ตัวนับจะเริ่มที่
 * เลขที่ RD พิมพ์ไปแล้วบนกระดาษพอดี แล้วชน unique index หรือแย่กว่านั้นคือเลขซ้ำ
 * กับกระดาษคนละใบ
 *
 * รูปแบบเป็น `businessMonthKey` (YYMM · ค.ศ.) — เทียบด้วย `<`/`>=` ตรง ๆ ได้เพราะ
 * ยาวเท่ากันและเติมศูนย์หน้าเสมอ
 */
export const PDR_REF_AUTO_FROM_MONTH = '2609';

/**
 * ชิ้นส่วนของเลขสำหรับส่งให้ฟังก์ชัน SQL — ที่นี่เป็นที่เดียวที่รู้รูปแบบเลข
 *
 * ⚠️ `like` คือแพตเทิร์นไว้ให้ SQL seed ตัวนับที่หายกลับมา — ปิดตาสองตัวแรก (วัน)
 * ด้วย `_` เพราะเลขของเดือนเดียวกันมีวันต่างกันได้ทุกใบ · seed ด้วย prefix ตรง ๆ
 * แบบ `docNo` ไม่ได้ แล้วตัวนับที่หายจะเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว
 */
export function pdrRefNoParts(now = new Date()) {
  const [year, month, day] = businessDate(now).split('-');
  const beYear = String((Number(year) + BUDDHIST_YEAR_OFFSET) % 100).padStart(2, '0');
  return {
    month: businessMonthKey(now),
    prefix: `${day}${month}${beYear}-`,
    like: `__${month}${beYear}-%`,
    width: PDR_REF_RUNNING_WIDTH,
  };
}

/**
 * ออกเลข (ถ้าใบยังไม่มี) + บันทึก patch ในทรานแซกชันเดียว (mig 0271)
 *
 * ⚠️ **ออกเลขแยกจากการบันทึกไม่ได้** (บทเรียน mig 0243) — จองเลขก่อนแล้วค่อยเขียน
 * แถวคือท่าที่ทำให้ตัวนับ RQ วิ่งเกินเลขที่ออกจริงไป 8 เลขบน production มาแล้ว ⇒
 * ตอนรับเรื่อง ส่ง patch ของการรับเรื่องเข้ามาทางนี้ทั้งก้อน ไม่ใช่ update สองรอบ
 *
 * ⚠️ ใบที่มีเลขแล้วใช้เลขเดิม ไม่ใช่ error — ปุ่มออกเลขย้อนหลังกดซ้ำได้โดยไม่กินเลข
 * (ด่าน "กดได้ไหม" คือ `pdrRefNoError` ที่นี่ตอบแค่ "ใช้เลขไหน")
 */
export function assignPdrRefNo(supabase, requestId, patch, now = new Date()) {
  const { month, prefix, like, width } = pdrRefNoParts(now);
  return supabase.rpc('assign_pdr_ref_no', {
    p_id: requestId,
    p_month: month,
    p_prefix: prefix,
    p_like: like,
    p_width: width,
    p_patch: patch,
  });
}

/**
 * ใบนี้อยู่ช่วง "กรอกเอง" หรือ "ระบบออกให้" — ตัดสินจากเดือนที่รับเรื่อง
 *
 * คืน `'manual'` · `'auto'` · หรือ `null` (ยังไม่รับเรื่อง = ยังตอบไม่ได้)
 */
export function pdrRefMode(request) {
  if (!request?.acknowledgedAt) return null;
  return businessMonthKey(request.acknowledgedAt) < PDR_REF_AUTO_FROM_MONTH ? 'manual' : 'auto';
}

/**
 * ระบบออกเลขให้ใบนี้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⭐ **ใบเก่าไม่ backfill อัตโนมัติ มีปุ่มกดทีละใบแทน** (มติผู้ใช้ 2026-08-20 ·
 * แนวเดียวกับขั้นบัญชีตรวจใบสั่งขาย) — ไล่ออกเลขให้ทุกใบย้อนหลังแปลว่าเลขรันของ
 * เดือนเก่าถูกใช้ไปกับใบที่ไม่มีใครจะพิมพ์แล้ว
 */
export function pdrRefNoError(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!requestHasPdr(request.kind)) return 'คำร้องหัวข้อนี้ไม่มีแบบฟอร์ม PDR';
  if (request.pdrRefNo) return 'ใบนี้มีเลขที่เอกสารแล้ว';
  // ⚠️ ยึด `acknowledgedAt` ไม่ใช่ `status` — ใบที่เดินไปไกลแล้ว (ตอบ/ปิด) ยังต้อง
  // ออกเลขย้อนหลังได้ · ส่วนใบที่ยังไม่มีใครรับ ยังไม่มีวันที่จะเอามาทำ DDMMYY
  if (!request.acknowledgedAt) return 'ยังไม่ได้รับเรื่อง — เลขที่เอกสารออกตอนฝ่ายรับเรื่อง';
  if (pdrRefMode(request) === 'manual') {
    return 'ใบที่รับเรื่องก่อนเดือนที่ระบบเริ่มออกเลข ต้องกรอกเลขเอง';
  }
  return null;
}

/**
 * ใบนี้ควรได้เลขตอนรับเรื่องไหม — ใช้ตอน action `acknowledge`
 *
 * ⚠️ รับ `now` มาเป็นวันที่รับเรื่อง (ยังไม่ได้เขียนลงแถวตอนถาม) — เดือนนี้ยังเป็น
 * ช่วงกรอกเอง ระบบจึงต้อง **ไม่** ออกเลขให้ตอนกดรับเรื่อง
 */
export function issuesPdrRefNoOnAcknowledge(request, now = new Date()) {
  if (!request || !requestHasPdr(request.kind) || request.pdrRefNo) return false;
  return businessMonthKey(now) >= PDR_REF_AUTO_FROM_MONTH;
}

// ── ช่วงเปลี่ยนผ่าน: RD กรอกเลขของตัวเอง ──────────────────────────────────

const PDR_REF_SHAPE = /^\d{6}-\d{3}$/;

/**
 * ตัดช่องว่างหัวท้าย + แปลงเลขไทยเป็นอารบิก
 *
 * ⚠️ **เลขไทยมาจริงจากการพิมพ์บนแป้นไทย** — ปล่อยผ่านแล้วมันจะตกด่านรูปแบบโดยที่
 * คนกรอกมองไม่ออกว่าต่างกันตรงไหน (เห็น "๒๐๐๘๖๙-๐๑๖" กับ "200869-016" เหมือนกัน
 * ในหัวตัวเอง) · แปลงให้เงียบ ๆ ตรงนี้ที่เดียว
 */
export function normalizePdrRefNo(value) {
  const text = String(value ?? '').trim();
  return text.replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
}

/**
 * กรอก/แก้เลขเองได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ **ไม่บังคับว่า DDMMYY ต้องตรงกับวันที่รับเรื่องของใบ** — คนกรอกกำลังลอกเลขจาก
 * กระดาษที่ออกไปแล้ว ซึ่งอาจลงวันคนละวันกับที่ระบบบันทึกไว้ · บังคับเมื่อไรก็ลอกไม่ได้
 */
export function pdrRefManualError(request, value) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!requestHasPdr(request.kind)) return 'คำร้องหัวข้อนี้ไม่มีแบบฟอร์ม PDR';
  if (!request.acknowledgedAt) return 'ยังไม่ได้รับเรื่อง — กรอกเลขที่เอกสารได้หลังฝ่ายรับเรื่อง';
  if (pdrRefMode(request) === 'auto') {
    return 'ใบนี้อยู่ช่วงที่ระบบออกเลขให้เอง — กรอกเองไม่ได้';
  }
  // ใบที่จบแล้วเป็นบันทึก ไม่ใช่ของที่ยังแก้ได้ (กติกาเดียวกับ trigger ที่ DB)
  if (['closed', 'cancelled'].includes(request.status) && request.pdrRefNo) {
    return 'คำร้องปิดแล้ว — แก้เลขที่เอกสารไม่ได้';
  }
  const text = normalizePdrRefNo(value);
  if (!text) return 'กรุณากรอกเลขที่เอกสาร';
  if (!PDR_REF_SHAPE.test(text)) return 'รูปแบบต้องเป็น DDMMYY-XXX เช่น 200869-016';
  return null;
}

/** ใบนี้แก้เลขที่กรอกเองได้อยู่ไหม (ใช้ตัดสินว่าปุ่มเขียนว่า "กรอก" หรือ "แก้") */
export function canEditPdrRefManual(request) {
  return !!request?.pdrRefManual && !['closed', 'cancelled'].includes(request?.status);
}
