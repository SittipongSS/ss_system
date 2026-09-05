// ── รหัสเครื่อง `MC-AAAA-YYMMBBBBB` (มติผู้ใช้ 2026-09-03) ──────────────────
//
//   MC    = รหัสนำหน้า **คงที่ทุกเครื่อง** เหมือน ST ของไซต์ · ZN ของโซน · FG ของสินค้า
//           (มติผู้ใช้: ชนิดอ่านออกจากรุ่นอยู่แล้ว ไม่ต้องซ้ำสองท่อน)
//   AAAA  = รหัส 4 ตัวของรุ่น — มาจาก **ทะเบียนรุ่น** (`service_asset_models.modelCode`)
//           ไม่ใช่เดาจากข้อความที่คนพิมพ์ ⇒ รุ่นที่ชื่อไม่พอดี 4 ตัว (`7KG` · `ลำโพง`)
//           ก็แค่ตั้งรหัสให้มันตอนขึ้นทะเบียน (`7KG0` · `SPKR`)
//   YYMM  = **ปี-เดือนที่รับเครื่องเข้า** ไม่ใช่เดือนที่กดบันทึก ⇒ ขึ้นทะเบียนย้อนหลัง
//           ให้ของเก่าแล้วรหัสยังสะท้อนเดือนที่ของมาถึงจริง
//   BBBBB = เลขรัน 5 หลัก **นับรวมทั้งบริษัท ไม่ตัดรอบ** (มติผู้ใช้: "เลขรันไม่ตัด")
//           ⇒ OV05 ตัวที่ 8 · OV08 ตัวถัดมาได้ 9 — เลขไม่ซ้ำกันเลยทั้งระบบ
//
// 🔴 **`YYMM` ในรหัส ≠ ตัวตัดรอบของตัวนับ** — กับดักเดิมที่ระบบเขียนเตือนไว้ซ้ำสามที่
//   (`entityCode.js` · mig 0328 · mig 0330) · `YYMM` มาจาก **prefix** ส่วนตัวตัดรอบคือ
//   คีย์ถัง `'-'` ซึ่งแปลว่า "ไม่ตัดเลย" ⇒ เดือนใหม่ไม่ได้เริ่มนับหนึ่ง
//   ⚠️ **เปลี่ยนคีย์ถังทีหลังไม่ได้** — เลขจะเริ่มนับใหม่แล้วชนของเดิม และแถวถังเก่า
//     ลบไม่ได้เพราะ trigger ของ mig 0241
//
// 🔴 **รหัสคือตัวตน ไม่ใช่สรุปสถานะปัจจุบัน** (กติกาเดียวกับ `siteCode.js` · `zoneCode.js`)
//   ⇒ ย้ายเครื่องไปติดที่อื่น เปลี่ยนสี หรือแก้วันรับเข้าทีหลัง **ไม่ออกรหัสใหม่**
//
// ⚠️ **ไม่มีขีดคั่นก่อนเลขรัน** (ต่างจาก ST/ZN) — `MC-OV08-260900013` ⇒ แกะรหัสด้วย
//   `split('-')` ไม่ได้ ท่อนสุดท้ายเป็น `YYMM` + `BBBBB` ติดกัน ต้องใช้ regex เท่านั้น
import { businessMonthKey } from '@/lib/businessDate';

export const MACHINE_CODE_PREFIX = 'MC';
export const MACHINE_RUN_WIDTH = 5;
/** ถังนับเลขรันเครื่อง — `'-'` = ตัวเดียวทั้งบริษัท ไม่ตัดรอบ (แบบเดียวกับ ST/ZN/AR/FG) */
export const MACHINE_RUN_BUCKET = '-';
/** scope ของตัวออกเลขกลาง — ต้องตรงกับ `WHEN 'MC'` ใน RPC (mig 0344) */
export const MACHINE_CODE_SCOPE = 'MC';

export const MACHINE_CODE_HINT = 'MC-AAAA-YYMMBBBBB';
export const MACHINE_CODE_RE = /^MC-[A-Z0-9]{4}-\d{4}\d{5}$/;

/** รหัสรุ่น 4 ตัวที่รหัสเครื่องรับได้ — ตัวใหญ่/ตัวเลข 4 ตัวพอดี */
export const MODEL_CODE_RE = /^[A-Z0-9]{4}$/;

/**
 * ตรวจรหัสรุ่นที่คนกรอกตอนขึ้นทะเบียนรุ่น — คืน `{ value, error }`
 *
 * ⚠️ **แปลงเป็นตัวใหญ่ให้ แต่ไม่เติมความยาวให้** — `ov08` → `OV08` (คนพิมพ์เล็กเป็นเรื่องปกติ)
 *   แต่ `7KG` **ไม่**เติมเป็น `7KG0` ให้เอง เพราะตัวที่เติมคือส่วนหนึ่งของรหัสที่จะ
 *   พิมพ์ติดเครื่องไปตลอด ⇒ คนตั้งต้องเป็นคนเลือกเอง ไม่ใช่ระบบเดาให้
 */
export function normalizeModelCode(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return { value: null, error: 'ต้องระบุรหัสรุ่น 4 ตัว — มันคือท่อนกลางของรหัสเครื่อง' };
  if (!MODEL_CODE_RE.test(raw)) {
    return {
      value: null,
      error: 'รหัสรุ่นต้องเป็นตัวอักษรอังกฤษตัวใหญ่หรือตัวเลข 4 ตัวพอดี (เช่น OV08 · SOAP · 7KG0)',
    };
  }
  return { value: raw, error: null };
}

/**
 * ท่อนหน้าเลขรันของรหัสเครื่อง — คืน `{ prefix, error }`
 *
 * @param modelCode   รหัส 4 ตัวจากทะเบียนรุ่น
 * @param receivedAt  วันที่รับเข้า `YYYY-MM-DD` (ปี ค.ศ.)
 *
 * ⚠️ **`YYMM` มาจากวันที่รับเข้า ไม่ใช่นาฬิกา** — ขึ้นทะเบียนย้อนหลังเป็นเรื่องปกติ
 *   (ชีตเก่ามีเครื่องที่รับเข้าตั้งแต่ปี 2567) ⇒ อ่านนาฬิกาตอนนี้จะได้รหัสที่โกหก
 */
export function machineCodePrefix({ modelCode, receivedAt } = {}) {
  const { value: code, error } = normalizeModelCode(modelCode);
  if (error) return { prefix: null, error };

  const date = String(receivedAt ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { prefix: null, error: 'ต้องระบุวันที่รับเข้า — เดือนในรหัสเครื่องมาจากวันนี้' };
  }
  const [y, m] = date.split('-');
  const yy = y.slice(2);
  const mm = m;
  if (Number(m) < 1 || Number(m) > 12) {
    return { prefix: null, error: 'วันที่รับเข้าไม่ถูกต้อง' };
  }
  return { prefix: `${MACHINE_CODE_PREFIX}-${code}-${yy}${mm}`, error: null };
}

/**
 * แกะรหัสเครื่องเป็นส่วน ๆ — คืน `null` ถ้าไม่ใช่รหัสรูปนี้
 * ⚠️ ใช้ regex ตายตัว ไม่ใช่ `split('-')` — ท่อนท้ายเป็น `YYMM`+`BBBBB` ติดกัน
 */
export function parseMachineCode(machineCode) {
  const code = String(machineCode ?? '').trim().toUpperCase();
  const m = /^MC-([A-Z0-9]{4})-(\d{2})(\d{2})(\d{5})$/.exec(code);
  if (!m) return null;
  return { modelCode: m[1], yy: m[2], mm: m[3], run: m[4] };
}

/** เดือน `YYMM` ตามนาฬิกาไทย — ค่าตั้งต้นของช่อง "วันที่รับเข้า" เท่านั้น ไม่ใช่ของรหัส */
export const machineMonthKey = (now = new Date()) => businessMonthKey(now);
