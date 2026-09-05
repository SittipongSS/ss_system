// ── เพิ่มเครื่องขึ้นทะเบียน (mig 0344 · ม็อก machine-add) — logic ล้วน ─────
//
// ⭐ **นี่คือจุดเกิดของเครื่อง แทน "รับเครื่องเข้าคลัง"** — ผู้ใช้ทักว่าทางเข้าเดิม
//   เข้าใจผิด: การขึ้นทะเบียนคือการบอกว่า **บริษัทได้เครื่องมา** (รุ่นอะไร สีอะไร
//   รับเข้าวันไหน สถานะอะไร) ไม่ใช่การย้ายของเข้าสถานที่ ⇒ ไม่ต้องมีคลังก่อน
//
// ⭐ **หนึ่งครั้ง = หนึ่งเครื่อง** (มติผู้ใช้ 2026-09-03) — ไม่มีช่องจำนวน ทุกชนิดนับ
//   รายตัวเหมือนกันหมด แต่ละตัวได้รหัสของตัวเองและเดินสถานะได้อิสระตั้งแต่วันแรก
//   ⇒ รับของมาล็อตเดียวกันหลายเครื่องใช้ปุ่ม "เพิ่มอีกตัว" ที่คงชนิด/รุ่น/สี/วันที่ไว้
//   ⚠️ **ผลพลอยได้ที่สำคัญ**: prefix ของรหัสเท่ากันทุกแถวในหนึ่งครั้งที่กดโดยอัตโนมัติ
//     ⇒ ยิงตัวออกเลขกลางครั้งละแถวเดียว ไม่มีสภาพ "บางตัวเข้า บางตัวไม่เข้า"
//
// 🔑 ตัวตัดสินตัวเดียวที่ทั้งจอและ API ใช้ (`machineAddError`) — fail-closed
import { businessDate } from '@/lib/businessDate';
import { ASSET_CONDITIONS, ASSET_STATUS_LABELS } from './sites';

/* สถานะที่เลือกได้ตอน "เพิ่มเครื่อง" — สามค่า ไม่ใช่สี่
   ⚠️ **`removed` (ปลดระวาง) ไม่อยู่ในนี้โดยตั้งใจ** — ขึ้นทะเบียนเครื่องที่ปลดระวาง
     ไปแล้วตั้งแต่วันแรกไม่มีความหมาย · ปลดระวางเป็น action ที่หน้ารายละเอียด */
export const MACHINE_ADD_STATUSES = ['in_stock', 'active', 'repair'];

/* ⭐ **ป้ายสามคำเปลี่ยนตามที่ผู้ใช้เรียกจริง** (มติผู้ใช้ 2026-09-03)
     อยู่ในคลัง → "ว่าง" · ใช้งาน → "ใช้งานอยู่" · ส่งซ่อม → "ซ่อม"
   ⚠️ เปลี่ยนแค่ **คำ** ไม่ใช่ค่า — `status` ในฐานยังเป็น in_stock/active/repair เหมือนเดิม
     (ค่าพวกนี้อยู่ใน CHECK ของ DB · เปลี่ยนค่าต้องมี migration) */
export const MACHINE_STATUS_HINTS = {
  in_stock: 'รับมาแล้ว ยังไม่ได้เอาไปติดตั้ง',
  active: 'ติดตั้งที่หน้างานลูกค้าแล้ว',
  repair: 'อยู่ระหว่างส่งซ่อม',
};

/* ที่อยู่ที่แต่ละสถานะต้องมี (มติผู้ใช้ 2026-09-03 · CHECK ของ mig 0344)
     ว่าง       → **ต้องไม่มี** — รับเข้ามาแล้วยังไม่ได้เอาไปไหน
     ใช้งานอยู่ → **ต้องมี**   — ติดตั้งแล้วต้องรู้ว่าอยู่ไซต์ไหน โซนไหน
     ซ่อม       → มีก็ได้ ไม่มีก็ได้ — ส่งซ่อมจากหน้างาน หรือจากของที่ว่างอยู่ก็ได้
   ⚠️ สวิตช์ "เครื่องเสีย" ไม่เกี่ยวกับที่อยู่เลย — ติ๊กได้ทุกสถานะ */
export const SITE_RULE_BY_STATUS = { in_stock: 'none', active: 'required', repair: 'optional' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ค่าตั้งต้นของฟอร์ม — ของที่เพิ่งรับเข้ามาเริ่มที่ "ว่าง" เสมอ */
export function machineAddDefaults(today = businessDate()) {
  return {
    kind: 'diffuser',
    modelId: '',
    colour: '',
    receivedAt: today,
    status: 'in_stock',
    broken: false,
    siteId: '',
    zoneId: '',
    note: '',
  };
}

/**
 * ค่าที่คงไว้ตอนกด "เพิ่มอีกตัว" — ชนิด · รุ่น · สี · วันที่รับเข้า (มติผู้ใช้)
 * ⚠️ **สถานะ/ที่อยู่/หมายเหตุไม่คงไว้** — ล็อตเดียวกันมักรุ่นเดียวกัน แต่ไม่จำเป็นต้อง
 *   ไปติดตั้งที่เดียวกัน · การคงที่อยู่ไว้จะทำให้เผลอผูกเครื่องเข้าไซต์ผิดเป็นชุด
 */
export function machineAddCarryOver(form = {}, today = businessDate()) {
  return {
    ...machineAddDefaults(today),
    kind: form.kind || 'diffuser',
    modelId: form.modelId || '',
    colour: form.colour || '',
    receivedAt: form.receivedAt || today,
  };
}

/**
 * 🔑 **ด่านเดียวของการเพิ่มเครื่อง** — คืนข้อความไทยเมื่อทำไม่ได้ หรือ `null` เมื่อผ่าน
 *
 * @param ctx.canEdit  ผู้ใช้จัดการเครื่องบริการได้ไหม (ผู้เรียกคำนวณมาให้)
 * @param ctx.model    แถวรุ่นจากทะเบียน (`null` = หาไม่เจอ)
 * @param ctx.site     แถวไซต์ปลายทาง (`null` = ไม่ได้เลือก/หาไม่เจอ)
 * @param ctx.today    วันนี้ตามนาฬิกาไทย
 *
 * ⚠️ fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ
 */
export function machineAddError(input = {}, ctx = {}) {
  const { canEdit = false, model = null, site = null, today = businessDate() } = ctx;
  if (!canEdit) return 'ไม่มีสิทธิ์เพิ่มเครื่อง';

  if (!input.modelId) return 'ต้องเลือกรุ่นเครื่อง';
  if (!model) return 'รุ่นที่เลือกไม่อยู่ในทะเบียนรุ่นแล้ว — เลือกใหม่';
  if (model.isActive === false) return `รุ่น ${model.name} ถูกปิดใช้งาน — เลือกรุ่นอื่น หรือเปิดใช้งานที่หน้าตั้งค่า`;
  /* ⚠️ ชนิดที่ฟอร์มส่งมาต้องตรงกับชนิดของรุ่น — ฟอร์มกรองรุ่นตามชนิดอยู่แล้ว
     แต่เส้นที่ยิง API ตรง (สคริปต์/ตัวนำเข้า) ไม่ได้เดินผ่านฟอร์ม */
  if (input.kind && input.kind !== model.kind) {
    return 'ชนิดกับรุ่นไม่ตรงกัน — เลือกรุ่นของชนิดที่เลือกไว้';
  }

  /* ⭐ **สีต้องเป็นสีที่รุ่นนั้นมีจริง** (มติผู้ใช้: สีผูกกับรุ่น)
     ⚠️ รุ่นที่ไม่แยกสี (`colours` ว่าง) ⇒ ห้ามมีสี ไม่ใช่ "ใส่อะไรก็ได้" */
  const colours = Array.isArray(model.colours) ? model.colours : [];
  const colour = String(input.colour ?? '').trim();
  if (colour && !colours.length) return `รุ่น ${model.name} ไม่ได้แยกสี — เว้นช่องสีไว้`;
  if (colour && !colours.includes(colour)) {
    return `รุ่น ${model.name} ไม่มีสี "${colour}" — เลือกจาก ${colours.join(' · ')}`;
  }
  if (!colour && colours.length) return 'ต้องเลือกสี';

  const receivedAt = String(input.receivedAt ?? '').trim();
  if (!receivedAt) return 'ต้องระบุวันที่รับเข้า';
  if (!ISO_DATE.test(receivedAt)) return 'วันที่รับเข้าไม่ถูกต้อง';
  /* ⚠️ **ห้ามรับเข้าในอนาคต** — `YYMM` ของรหัสมาจากวันนี้ ⇒ วันที่ในอนาคตทำให้ได้
     รหัสของเดือนที่ยังมาไม่ถึง ซึ่งแก้ทีหลังไม่ได้ (รหัสคือตัวตน) */
  if (receivedAt > String(today)) return 'วันที่รับเข้าเป็นวันในอนาคตไม่ได้';
  if (receivedAt < '2000-01-01') return 'วันที่รับเข้าอยู่นอกช่วงปีที่เป็นไปได้';

  const status = input.status ?? 'in_stock';
  if (!MACHINE_ADD_STATUSES.includes(status)) return 'สถานะการใช้งานไม่ถูกต้อง';

  const rule = SITE_RULE_BY_STATUS[status];
  if (rule === 'required' && !site) {
    return `สถานะ "${ASSET_STATUS_LABELS[status]}" ต้องระบุไซต์ที่ติดตั้ง — เครื่องที่ใช้งานอยู่ต้องรู้ว่าอยู่ที่ไหน`;
  }
  if (rule === 'none' && (input.siteId || site)) {
    return `สถานะ "${ASSET_STATUS_LABELS[status]}" คือยังไม่ได้เอาไปติดตั้ง — ไม่ต้องระบุไซต์`;
  }
  /* ⚠️ เครื่องที่ใช้งานอยู่ต้องไม่ไปโผล่ในไซต์ประเภทคลัง (กฎเดิมของ trigger mig 0332)
     ⇒ ตอบเป็นภาษาคนตรงนี้ ไม่ใช่ปล่อยให้ trigger โยน error ฐานข้อมูลออกไปที่จอ */
  if (status === 'active' && site?.kind === 'warehouse') {
    return 'ไซต์ที่เลือกเป็นคลัง ไม่ใช่หน้างานลูกค้า — เครื่องที่ใช้งานอยู่ต้องอยู่ที่ไซต์ลูกค้า';
  }
  if (input.zoneId && !site) return 'เลือกโซนได้เมื่อระบุไซต์แล้วเท่านั้น';

  if (input.broken !== undefined && typeof input.broken !== 'boolean') {
    return 'ค่าสวิตช์ "เครื่องเสีย" ไม่ถูกต้อง';
  }
  const note = String(input.note ?? '').trim();
  if (note.length > 1000) return 'หมายเหตุยาวเกิน 1000 ตัวอักษร';

  return null;
}

/**
 * แถวเครื่องที่จะ insert — **ไม่มี `code`** เพราะตัวออกเลขกลางเป็นคนเติมให้
 * (`create_entity_rows_with_code` เขียนคีย์ `code` ทับ payload เสมอ)
 *
 * ⚠️ **`label` เป็น NOT NULL และตั้งเท่ากับรหัส** — ทะเบียนไม่มีชื่อเรียกแยกสำหรับ
 *   เครื่องที่เพิ่งขึ้นทะเบียน · แต่รหัสยังไม่มีตอนนี้ ⇒ ผู้เรียกต้องเติม `label`
 *   หลังได้รหัสกลับมา (ดู route) · ที่นี่ใส่ค่าชั่วคราวไม่ได้เพราะจะหลุดเป็นชื่อจริง
 * ⚠️ **`serial` ปล่อยว่าง** — มันคือเบอร์จากโรงงาน คนละเรื่องกับรหัสเครื่อง (mig 0344)
 */
export function machineRow(input = {}, ctx = {}) {
  const { model = null, site = null, userId = null, userName = null } = ctx;
  const status = input.status ?? 'in_stock';
  const useSite = SITE_RULE_BY_STATUS[status] !== 'none' && site ? site.id : null;
  return {
    siteId: useSite,
    zoneId: useSite ? (input.zoneId || null) : null,
    kind: model?.kind || input.kind || 'diffuser',
    modelId: model?.id || null,
    // สำเนาชื่อรุ่นบนแถว — ทุกจอ/ตัวค้นอ่าน `asset.model` อยู่แล้ว ไม่ต้อง join
    model: model?.name || null,
    colour: String(input.colour ?? '').trim() || null,
    receivedAt: input.receivedAt,
    status,
    condition: input.broken ? 'broken' : 'ok',
    // ติดตั้งแล้วตั้งแต่วันแรก ⇒ วันติดตั้ง = วันรับเข้า (ขึ้นทะเบียนย้อนหลังของเก่า)
    installedAt: status === 'active' ? (input.installedAt || input.receivedAt) : null,
    note: String(input.note ?? '').trim() || null,
    settings: {},
    createdById: userId ? String(userId) : null,
    createdByName: userName || null,
  };
}

export const isBrokenCondition = (condition) => ASSET_CONDITIONS.includes(condition) && condition === 'broken';
