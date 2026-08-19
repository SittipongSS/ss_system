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
 * ออกเลขให้ใบนี้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
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
  return null;
}

/**
 * ใบนี้ควรได้เลขตอนรับเรื่องไหม — ใช้ตอน action `acknowledge`
 * (คำร้องที่ไม่มีแบบฟอร์ม PDR ไม่มีเอกสารให้พิมพ์เลขลงไป จึงไม่ออกเลขให้)
 */
export function issuesPdrRefNoOnAcknowledge(request) {
  return !!request && requestHasPdr(request.kind) && !request.pdrRefNo;
}
