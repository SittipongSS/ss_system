// ── รับเครื่องเข้าคลังเป็นชุด (เฟส C ต่อ) — logic ล้วน ────────────────────
//
// ⭐ **จุดเกิดของเครื่อง** — เครื่องเข้าระบบทางนี้ทางเดียว แล้วค่อยถูกติดตั้ง
//   (กติกาเดียวกับที่ไซต์เกิดจากใบคำร้อง ไม่ใช่เกิดที่ทะเบียน)
//
// ⭐ **รหัสเครื่องไม่ใช่ของที่ระบบออกให้** — `service_assets` ไม่มีคอลัมน์ `code`
//   มีแต่ `serial` ที่คนพิมพ์เอง · ไฟล์นี้แค่ **เดาเลขถัดไปให้** จากของที่มีอยู่แล้ว
//   ผู้ใช้แก้ทับได้เสมอ (เครื่องที่มีเบอร์จากโรงงานติดมาก็มี)
//
// ⚠️ ทะเบียนเก่าทั้ง 1,221 ตัวใช้รูปเดียวกันหมด: `<รุ่นที่ตัดขีดออก>-<4 หลัก>`
//   OV-08 → OV08-0001 · O-800 → O800-0001 · 7KG → 7KG-0001 · ลำโพง → ลำโพง-0001

// ใส่ได้ครั้งละกี่ตัว — ไม่ใช่เพดานเชิงเทคนิค แต่เป็นเพดานของ "พลาดแล้วแก้ไหว"
// พิมพ์ 500 แล้วกดผิดคือการล้างงานคนอื่นทั้งวัน
export const MAX_RECEIVE = 60;

const SERIAL_RE = /^(.*?)-(\d+)$/;

/* รุ่น → ส่วนหน้าของรหัส · ตัดขีดและช่องว่างออก (`OV-08` → `OV08`)
   ⚠️ ไม่แปลงเป็นตัวพิมพ์ใหญ่ — unique index เทียบด้วย `lower(btrim(serial))` อยู่แล้ว
      และรุ่นภาษาไทย (`ลำโพง`) ไม่มีตัวพิมพ์ใหญ่ให้แปลง */
export function serialPrefixOf(model) {
  return String(model ?? '').trim().replace(/[\s-]+/g, '');
}

/* เลขถัดไปของรุ่นนี้ จากรหัสที่มีอยู่แล้วทั้งหมด
   ⚠️ อ่านจาก **ของจริงในตาราง** ไม่ใช่ตัวนับแยก — ตัวนับที่เดินคู่ขนานกับข้อมูลจริง
      จะเพี้ยนทันทีที่มีคนพิมพ์รหัสเองหรือลบเครื่องทิ้ง (โรคเดียวกับที่ห้ามตาราง
      event คู่ขนานใน assetHistory.js) */
export function nextSerialNumber(prefix, existingSerials = []) {
  const key = String(prefix ?? '').trim().toLowerCase();
  if (!key) return 1;
  let max = 0;
  for (const raw of existingSerials) {
    const m = SERIAL_RE.exec(String(raw ?? '').trim());
    if (!m) continue;
    if (m[1].trim().toLowerCase() !== key) continue;
    const n = Number(m[2]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/* ชุดรหัสที่จะออก — เดินเลขต่อกันจาก `startNumber`
   ⚠️ ความกว้างตามเลขเริ่ม (4 หลักเป็นค่าตั้งต้นตามทะเบียนเดิม) แต่ถ้าเลขล้น
      ให้ยาวขึ้นแทนการตัดทิ้ง — รหัสที่ถูกตัดคือรหัสซ้ำ */
export function serialSequence(prefix, startNumber, count, width = 4) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${prefix}-${String(startNumber + i).padStart(width, '0')}`);
  }
  return out;
}

/* 🔑 **ตัวตัดสินตัวเดียวที่ทั้งจอและ API ใช้** — คืนข้อความไทย หรือ null เมื่อผ่าน
   ⚠️ fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ */
export function receiveError(input = {}, ctx = {}) {
  const { canEdit = false, site = null, takenSerials = [] } = ctx;
  if (!canEdit) return 'ไม่มีสิทธิ์จัดการเครื่องบริการ';
  if (!site) return 'ต้องเลือกคลังปลายทาง';
  if (site.kind !== 'warehouse') return 'เครื่องใหม่ต้องรับเข้าคลัง ไม่ใช่ไซต์ลูกค้า';
  if (site.isActive === false) return 'คลังปลายทางถูกปิดใช้งานอยู่';

  const model = String(input.model ?? '').trim();
  if (!model) return 'ต้องระบุรุ่น';
  if (model.length > 100) return 'รุ่นยาวเกิน 100 ตัวอักษร';

  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1) return 'จำนวนต้องเป็นจำนวนเต็มอย่างน้อย 1';
  if (count > MAX_RECEIVE) return `รับเข้าได้ครั้งละไม่เกิน ${MAX_RECEIVE} ตัว — ถ้ามากกว่านี้ให้แบ่งเป็นหลายรอบ`;

  if (!input.receivedAt) return 'ต้องระบุวันที่รับเข้า';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.receivedAt))) return 'วันที่ไม่ถูกต้อง';

  const serials = plannedSerials(input);
  if (!serials.length) return 'ออกรหัสเครื่องไม่ได้ — ตรวจรุ่นและเลขเริ่มต้น';

  /* รหัสซ้ำต้องบอก **ตั้งแต่ก่อนกด** ไม่ใช่ให้ unique index ตีกลับตอนบันทึก —
     ตีกลับกลางทางแปลว่าบางตัวเข้าไปแล้วบางตัวไม่เข้า (ไม่มีทรานแซกชันในชั้นนี้) */
  const taken = new Set(takenSerials.map((s) => String(s ?? '').trim().toLowerCase()));
  const clash = serials.filter((s) => taken.has(s.toLowerCase()));
  if (clash.length) {
    const show = clash.slice(0, 3).join(' · ');
    return `รหัส ${show}${clash.length > 3 ? ` และอีก ${clash.length - 3} ตัว` : ''} ถูกใช้แล้ว — เปลี่ยนเลขเริ่มต้น`;
  }

  return null;
}

/* รหัสทั้งชุดที่จะออกจาก input — จอใช้โชว์พรีวิว · API ใช้สร้างแถวจริง
   ⚠️ **ตัวเดียวกันทั้งสองฝั่ง** ไม่งั้นพรีวิวกับของจริงเป็นคนละชุด */
export function plannedSerials(input = {}) {
  const prefix = serialPrefixOf(input.model);
  const count = Number(input.count);
  const start = Number(input.startNumber);
  if (!prefix || !Number.isInteger(count) || count < 1) return [];
  if (!Number.isInteger(start) || start < 1) return [];
  return serialSequence(prefix, start, Math.min(count, MAX_RECEIVE));
}

/* แถวเครื่องที่จะ insert — คืน array อย่างเดียว ไม่แตะ DB
   ⚠️ `label` ตั้งเท่ากับ serial: ทะเบียนเก่าไม่มีชื่อเรียกแยก และ label เป็น NOT NULL
      ⇒ ตั้งเป็นค่าที่ **เดาซ้ำได้** ไม่ใช่เลขรันของตัวเอง (รับซ้ำแล้วต้องได้ชื่อเดิม) */
export function receiveRows(input = {}, ctx = {}) {
  const { site } = ctx;
  return plannedSerials(input).map((serial) => ({
    siteId: site.id,
    label: serial,
    serial,
    model: String(input.model ?? '').trim(),
    colour: String(input.colour ?? '').trim() || null,
    kind: input.kind || 'diffuser',
    status: 'in_stock',
    condition: 'ok',
    receivedAt: input.receivedAt,
    note: String(input.note ?? '').trim() || null,
    settings: {},
  }));
}
