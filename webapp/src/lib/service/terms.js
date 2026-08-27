// ── รอบขายของโซน (mig 0297 · service_zone_terms) — ตัวตัดสินเดียว ─────────
//
// ⭐ **สะพานเส้นเดียวระหว่างฝ่ายขายกับฝ่ายบริการ**: 1 บรรทัดใบสั่งขาย = 1 รอบขาย
//   ที่มา "ผูก" โซนหนึ่งโซน · ต่อสัญญา = ใบสั่งขายใบใหม่ ผูกโซน **เดิม** ⇒ ประวัติ
//   และยอดการใช้ของโซนต่อเนื่อง ไม่ขาดตอนตอนเปลี่ยนรอบ (มติผู้ใช้ 2026-08-27)
//
// ⚠️ **term ไม่มีคอลัมน์ status โดยเจตนา** (mig 0297:83-85) — "รอบนี้ยังมีผลไหม"
//   คำนวณจากใบสั่งขายแม่เสมอ: `status = 'approved' AND supersededById IS NULL`
//   ใบถูก Rev. ⇒ ใบเก่าได้ supersededById ⇒ term เก่าตายเองโดยไม่ต้องไปแตะแถว
//   ⇒ เงื่อนไขนี้ต้องอยู่ **ที่ไฟล์นี้ที่เดียว** ห้ามเขียนซ้ำในหน้าจอหรือ API
//   (โรคเดียวกับ "live visit" ที่เคยมี 5 นิยามพร้อมกันใน 5 ไฟล์)
//
// ⚠️ คนละชั้นกับ "ช่วงบริการ" — ใบมีผล ≠ รอบยังไม่หมดอายุ · ใบสั่งขายที่อนุมัติแล้ว
//   ยังอยู่ตลอดไป แต่ startDate/endDate ของ term บอกว่ารอบนั้นครอบเดือนไหนบ้าง
//   สองคำถามนี้แยกกันตอบ (`termOrderActive` กับ `termInWindow`)
import { businessDate } from '@/lib/businessDate';

/* ── ชั้นที่ 1: ใบสั่งขายแม่ยังมีผลไหม ─────────────────────────────────── */
export function termOrderActive(order) {
  if (!order) return false;
  return order.status === 'approved' && !order.supersededById;
}

/* ── ชั้นที่ 2: วันนี้อยู่ในช่วงบริการของรอบนี้ไหม ───────────────────────
   ไม่ระบุวัน = ยังไม่รู้ ไม่ใช่ "หมดอายุ" — ของจริงกรอกวันทีหลังเสมอ */
export function termInWindow(term, todayIso = businessDate()) {
  if (!term) return false;
  if (term.startDate && todayIso < term.startDate) return false;
  if (term.endDate && todayIso > term.endDate) return false;
  return true;
}

/* รอบนี้ "มีผล" = ใบแม่ยังมีผล **และ** วันนี้อยู่ในช่วง
   ⚠️ ต้องส่งใบสั่งขายมาด้วยเสมอ — ไม่ส่ง = ตอบ false ไม่ใช่เดาว่าใช่
   (การเดาว่าใช่คือที่มาของ "ส่งช่างไปที่ที่หมดสัญญา 25 จุด") */
export function termIsActive(term, order, todayIso = businessDate()) {
  return termOrderActive(order) && termInWindow(term, todayIso);
}

/* ── snapshot จากบรรทัดขาย ──────────────────────────────────────────────
   ⭐ ก๊อปเป็นภาพนิ่ง **ไม่ใช่ join** — บรรทัดขายถูกแก้/ใบถูก Rev. ได้ แต่รอบที่
   ตกลงกันไว้ตอนนั้นต้องอ่านย้อนได้เหมือนเดิม (แพตเทิร์นเดียวกับเอกสารที่ตรึงแล้ว)
   ⚠️ `packageQty` = จำนวนที่ขายในบรรทัดนั้น (แพ็ค = หน่วยคิดเงินตามมติสี่หน่วย)
      บรรทัดขายไม่มีคอลัมน์ packageQty ของตัวเอง — `qty` คือตัวเดียวกัน */
export function termSnapshotFromLine(line = {}) {
  const qty = Number(line.qty);
  return {
    productId: line.productId || null,
    fgCode: line.fgCode || null,
    description: line.description || null,
    packageQty: Number.isFinite(qty) && qty > 0 ? qty : null,
    unit: line.unit || null,
  };
}

/* ── มาตรฐานการใช้ต่อเดือน ──────────────────────────────────────────────
   ⚠️ **ไม่มีสูตรที่เป็นทางการ** — บรรทัดขายไม่มีคอลัมน์ ml และไม่มีเอกสารไหน
   กำหนดที่มาไว้ · หลักฐานเดียวที่มีคือชีตของทีม: 10 จาก 13 แถว "แพ็ค = ลิตร/เดือน"
   เป๊ะ ส่วนจำนวนเครื่องต่อแพ็คแกว่ง (docs/service-field-operations.md:84-96)
   ⇒ ที่นี่ให้ได้แค่ **ข้อเสนอที่คนต้องกดรับ** ห้ามเขียนลงแถวเอง
   กติกางานนำเข้าเขียนไว้ชัด: แถวที่แปลงไม่ได้ต้องค้างให้คนตัดสิน ห้ามใส่ค่า
   default แล้วเงียบ (business-line-level-and-handoff.md:349) */
export const ML_PER_PACK_HINT = 1000;

/* หน่วยที่หลักฐาน "1 แพ็ค = 1 ลิตร/เดือน" ใช้ได้ — บรรทัดที่ขายเป็นกิโลกรัม/ชิ้น/ขวด
   ไม่เข้าข่าย
   🐞 ของเดิมเสนอทุกบรรทัดที่มีจำนวน ⇒ บรรทัด "แฮนด์เจล 240 กิโลกรัม" ขึ้นข้อเสนอ
      "ใช้ 240,000 ml" ซึ่งไม่มีความหมายเลย · ข้อเสนอที่ผิดบ่อยกว่าถูก แย่กว่าไม่มี
      ข้อเสนอ เพราะคนจะกดรับโดยไม่คิด แล้วตัวเลขผิดจะกลายเป็นฐานเทียบยอดใช้จริง */
const PACK_UNITS = ['แพ็ค', 'แพ็ก', 'pack', 'ชุด', 'set'];

export const isPackUnit = (unit) => {
  const value = String(unit ?? '').trim().toLowerCase();
  if (!value) return false;
  return PACK_UNITS.some((u) => value.includes(u.toLowerCase()));
};

export function suggestStandardMl(packageQty, unit = null) {
  // ไม่รู้หน่วย = ไม่เสนอ · รู้ว่าเป็นหน่วยอื่นที่ไม่ใช่แพ็ค = ไม่เสนอ
  if (!isPackUnit(unit)) return null;
  const qty = Number(packageQty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return Math.round(qty * ML_PER_PACK_HINT);
}

export const STANDARD_ML_HINT_TEXT =
  `จากชีตของทีม 10 ใน 13 แถวลงตัวที่ 1 แพ็ค = 1 ลิตร/เดือน — กดใช้ได้ถ้าตรง ไม่ตรงก็พิมพ์ทับ`;

/* ── ตรวจข้อมูลก่อนเขียนแถว ─────────────────────────────────────────── */
export function normalizeTermInput(body = {}) {
  const zoneId = String(body.zoneId ?? '').trim();
  if (!zoneId) return { value: null, error: 'ต้องเลือกโซน' };

  const salesOrderId = String(body.salesOrderId ?? '').trim();
  const salesOrderLineId = String(body.salesOrderLineId ?? '').trim();
  if (!salesOrderId || !salesOrderLineId) return { value: null, error: 'ต้องระบุบรรทัดในใบสั่งขาย' };

  const number = (field, label) => {
    const raw = body[field];
    if (raw === undefined || raw === null || String(raw).trim() === '') return { value: null };
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return { error: `${label}ต้องเป็นตัวเลขมากกว่า 0` };
    return { value };
  };
  const pack = number('packageQty', 'จำนวนแพ็ค');
  if (pack.error) return { value: null, error: pack.error };
  const std = number('standardMlPerMonth', 'มาตรฐานต่อเดือน (ml)');
  if (std.error) return { value: null, error: std.error };

  const date = (field, label) => {
    const value = String(body[field] ?? '').trim();
    if (!value) return { value: null };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: `${label}ไม่ถูกต้อง` };
    return { value };
  };
  const start = date('startDate', 'วันเริ่มบริการ');
  if (start.error) return { value: null, error: start.error };
  const end = date('endDate', 'วันสิ้นสุดบริการ');
  if (end.error) return { value: null, error: end.error };
  if (start.value && end.value && start.value > end.value) {
    return { value: null, error: 'วันเริ่มบริการต้องไม่หลังวันสิ้นสุด' };
  }

  const text = (field, max) => {
    const value = String(body[field] ?? '').trim();
    return value ? value.slice(0, max) : null;
  };

  return {
    value: {
      zoneId,
      salesOrderId,
      salesOrderLineId,
      productId: text('productId', 100),
      fgCode: text('fgCode', 100),
      description: text('description', 500),
      packageQty: pack.value,
      unit: text('unit', 50),
      standardMlPerMonth: std.value,
      startDate: start.value,
      endDate: end.value,
    },
    error: null,
  };
}

/* ── ตัวช่วยอ่าน ─────────────────────────────────────────────────────── */

/* รอบล่าสุดของโซน — เรียงตามวันเริ่ม แล้วค่อยวันสร้าง (รอบที่ยังไม่ระบุวันเริ่ม
   ถือว่าใหม่สุดเพราะเพิ่งผูก) */
export function latestTermOfZone(terms = []) {
  const sorted = [...terms].sort((a, b) => {
    const byStart = String(b.startDate || '9999-99-99').localeCompare(String(a.startDate || '9999-99-99'));
    if (byStart !== 0) return byStart;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  return sorted[0] || null;
}

export function termsByZone(terms = []) {
  const map = new Map();
  for (const term of terms) {
    const list = map.get(term.zoneId) || [];
    list.push(term);
    map.set(term.zoneId, list);
  }
  return map;
}

/* โซนที่ยังไม่มีรอบที่มีผลเลย — คิวที่สองของหน้างานเข้าใหม่
   ⚠️ "ไม่มีรอบ" ต่างจาก "รอบหมดอายุ" — ทั้งคู่ต้องตามต่อ แต่คนละข้อความ */
export function zoneTermState(zoneId, terms = [], ordersById = new Map(), todayIso = businessDate()) {
  const rows = terms.filter((t) => t.zoneId === zoneId);
  if (!rows.length) return { state: 'none', term: null };
  const active = rows.find((t) => termIsActive(t, ordersById.get(t.salesOrderId), todayIso));
  if (active) return { state: 'active', term: active };
  return { state: 'ended', term: latestTermOfZone(rows) };
}
