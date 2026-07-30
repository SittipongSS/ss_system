// ── ไลน์ผลิต + กำลังผลิตรายวัน (mig 0184) — logic ล้วน ────────────────────
//
// ⭐ ที่มา: โรงงานไม่เคยมีตัวตนในระบบ — ขั้น "ผลิตสินค้า" ในไทม์ไลน์เป็นแท่งบน
// Gantt ที่ไม่ผูกกับไลน์ไหน กำลังผลิตไม่ถูกนับ → SO หลายใบที่ขั้นผลิตทับสัปดาห์
// เดียวกันเขียวหมดทุกใบ ทั้งที่โรงงานทำได้ใบเดียว
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ฟอร์ม/บอร์ด) และ server (validate ก่อน insert)
import { isBusinessDay, toLocalISODate } from './dateHelpers';

export const LINE_KINDS = ['mix', 'fill', 'pack', 'other'];
export const LINE_KIND_LABELS = {
  mix: 'ผสม',
  fill: 'บรรจุ',
  pack: 'แพ็ก',
  other: 'อื่น ๆ',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ปีนอกช่วงนี้ = พิมพ์ผิดแน่ ๆ (ของจริงบน prod เคยมี formulaDate = '2202-08-06')
// ต้องตรงกับ CHECK production_capacity_days_date_sane ใน mig 0184
function dateError(value, label) {
  const text = String(value ?? '');
  if (!ISO_DATE.test(text)) return `${label}ไม่ถูกต้อง`;
  const year = Number(text.slice(0, 4));
  if (year < 2000 || year > 2100) return `${label}อยู่นอกช่วงปีที่เป็นไปได้ (${year})`;
  return null;
}

// ── ตรวจข้อมูลไลน์ก่อนแตะ DB — คืนข้อความไทย หรือ null ถ้าผ่าน ─────────────
export function normalizeLineInput(body = {}) {
  const code = String(body.code ?? '').trim().replace(/\s+/g, ' ');
  if (!code) return { value: null, error: 'ต้องระบุรหัสไลน์' };
  if (code.length > 30) return { value: null, error: 'รหัสไลน์ยาวเกิน 30 ตัวอักษร' };

  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อไลน์' };
  if (name.length > 100) return { value: null, error: 'ชื่อไลน์ยาวเกิน 100 ตัวอักษร' };

  const kind = body.kind ?? 'other';
  if (!LINE_KINDS.includes(kind)) return { value: null, error: 'ประเภทไลน์ไม่ถูกต้อง' };

  // กำลังผลิตเป็นตัวเลือก — ไลน์ที่ยังไม่รู้กำลังจริงมีอยู่จริง
  // ⚠️ ห้ามแปลงค่าว่างเป็น 0: 0 แปลว่า "ปิดไลน์" ส่วน null แปลว่า "ยังไม่ระบุ"
  //    ถ้าปนกัน ตัวเตือนเกินกำลังจะบอกว่าไลน์ที่ยังไม่กรอกกำลัง "เต็มตลอดเวลา"
  let capacityPerDay = null;
  if (body.capacityPerDay !== undefined && body.capacityPerDay !== null && String(body.capacityPerDay).trim() !== '') {
    capacityPerDay = Number(body.capacityPerDay);
    if (!Number.isFinite(capacityPerDay) || capacityPerDay <= 0) {
      return { value: null, error: 'กำลังผลิตต่อวันต้องเป็นตัวเลขมากกว่า 0' };
    }
  }

  const unit = String(body.unit ?? '').trim();
  if (unit.length > 30) return { value: null, error: 'หน่วยยาวเกิน 30 ตัวอักษร' };
  if (capacityPerDay !== null && !unit) {
    // กำลังผลิตที่ไม่มีหน่วยอ่านไม่ได้ว่าคือ 500 ชิ้น หรือ 500 กิโล
    return { value: null, error: 'ระบุกำลังผลิตแล้วต้องระบุหน่วยด้วย' };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  let sortOrder = 0;
  if (body.sortOrder !== undefined && body.sortOrder !== null && String(body.sortOrder).trim() !== '') {
    sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) return { value: null, error: 'ลำดับต้องเป็นจำนวนเต็ม' };
  }

  return {
    value: {
      code,
      name,
      kind,
      capacityPerDay,
      unit: unit || null,
      isActive: body.isActive === undefined ? true : !!body.isActive,
      sortOrder,
      note: note || null,
    },
    error: null,
  };
}

// ── ตรวจข้อมูลวันที่กำลังไม่ปกติ ──────────────────────────────────────────
export function normalizeCapacityDayInput(body = {}) {
  const dateErr = dateError(body.date, 'วันที่');
  if (dateErr) return { value: null, error: dateErr };

  // ⚠️ ที่นี่ 0 เป็นค่าที่ **ถูกต้องและมีความหมาย** (ปิดไลน์วันนั้น) จึงเช็คแยก
  // จากกรณี "ไม่กรอก" — ห้ามใช้ falsy check ตัวเดียวจบ
  if (body.capacityPerDay === undefined || body.capacityPerDay === null || String(body.capacityPerDay).trim() === '') {
    return { value: null, error: 'ต้องระบุกำลังผลิตของวันนั้น (0 = ปิดไลน์)' };
  }
  const capacityPerDay = Number(body.capacityPerDay);
  if (!Number.isFinite(capacityPerDay) || capacityPerDay < 0) {
    return { value: null, error: 'กำลังผลิตต้องเป็นตัวเลขไม่ติดลบ' };
  }

  const reason = String(body.reason ?? '').trim();
  if (reason.length > 200) return { value: null, error: 'เหตุผลยาวเกิน 200 ตัวอักษร' };

  return { value: { date: String(body.date), capacityPerDay, reason: reason || null }, error: null };
}

// ── กำลังผลิตของไลน์หนึ่ง ในวันหนึ่ง ─────────────────────────────────────
// ลำดับความสำคัญ: วันหยุด/เสาร์-อาทิตย์ → 0 · มี override → ใช้ override
// · ไลน์ปิดใช้งาน → 0 · ที่เหลือ → กำลังมาตรฐานของไลน์
//
// ⚠️ คืน `null` = "ไม่รู้กำลังของไลน์นี้" ซึ่งไม่เท่ากับ 0 — ตัวเตือนเกินกำลัง
// ต้องเงียบสำหรับไลน์ที่ยังไม่กรอกกำลัง ไม่ใช่ฟ้องว่าเกินทุกวัน
export function capacityOn(line, dateIso, overrides = new Map(), holidays) {
  if (!line) return null;
  if (line.isActive === false) return 0;

  const dt = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  // วันหยุดชนะทุกอย่าง ยกเว้น override ที่ตั้งใจเปิดกะพิเศษ (ดูข้างล่าง)
  const isWorking = holidays ? isBusinessDay(dt, holidays) : isBusinessDay(dt);

  const override = overrides instanceof Map ? overrides.get(dateIso) : overrides?.[dateIso];
  if (override !== undefined && override !== null) {
    // override เขียนทับได้ทั้งสองทาง: ปิดไลน์ในวันทำการ (0) และ **เปิดกะพิเศษ
    // ในวันหยุด** ซึ่งเกิดจริงตอนงานเร่ง — ถ้าให้วันหยุดชนะเสมอ ค่าที่ PC ตั้งใจ
    // กรอกจะหายเงียบ ๆ แล้วบอร์ดจะบอกว่าวันนั้นทำอะไรไม่ได้
    const value = Number(override);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (!isWorking) return 0;
  const base = line.capacityPerDay;
  if (base === undefined || base === null || base === '') return null;
  const value = Number(base);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// แปลงแถว production_capacity_days ของไลน์หนึ่งเป็น Map<'YYYY-MM-DD', number>
export function overridesByDate(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row?.date) continue;
    map.set(String(row.date), Number(row.capacityPerDay));
  }
  return map;
}

// ── กำลังผลิตรวมของไลน์ในช่วงวัน ─────────────────────────────────────────
// ใช้ตอบ "สัปดาห์หน้าไลน์นี้รับได้เท่าไร" บนบอร์ด (PR-3) และหน้าตั้งค่า
// วันที่กำลังเป็น null (ยังไม่กรอก) ถูกนับเป็น 0 ในผลรวม แต่รายงานแยกไว้ที่
// `unknownDays` เพื่อไม่ให้ผลรวมที่ต่ำเพราะ "ไม่รู้" ถูกอ่านว่า "รับไม่ได้"
export function capacityRange(line, fromIso, toIso, overrides = new Map(), holidays) {
  const out = { total: 0, workingDays: 0, closedDays: 0, unknownDays: 0, days: [] };
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return out;

  let guard = 0;
  for (const cursor = new Date(from); cursor <= to && guard < 4000; cursor.setDate(cursor.getDate() + 1), guard++) {
    const iso = toLocalISODate(cursor);
    const capacity = capacityOn(line, iso, overrides, holidays);
    out.days.push({ date: iso, capacity });
    if (capacity === null) out.unknownDays += 1;
    else if (capacity === 0) out.closedDays += 1;
    else { out.total += capacity; out.workingDays += 1; }
  }
  return out;
}
