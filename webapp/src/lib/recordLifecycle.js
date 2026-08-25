// เส้นชีวิตของ record (ลีด/ดีล/โครงการ) — ที่เดียวที่ตอบว่า "record ใบนี้ทำอะไรได้บ้าง"
//
// ทำไมต้องมี: การ์ด Document Control ใช้ได้ผลกับเอกสาร (QT/SO/ภาษี/ขอราคาผลิต) เพราะ
// เอกสารมี "สถานะ + ขั้นตอน + ปุ่มจัดการ" อยู่ที่เดียว แต่ ลีด/ดีล/โครงการ กระจายปุ่มไว้
// หลายที่ในหน้าเดียว (โครงการเคยมี 5 ที่) และแถวตารางกับหน้ารายละเอียดคิดกติกาแยกกัน
// ผลคือปุ่มโผล่ไม่ตรงกัน. ที่นี่ประกาศกติกาครั้งเดียว แล้วให้ทั้งการ์ด (RecordControlCard)
// และแถวตาราง (RecordActionMenu) กิน available() ตัวเดียวกัน
//
// ⚠️ visible กับ allow ห้ามสลับกัน (มีเทสต์ล็อกไว้):
//   visible=false → "ไม่มีสิทธิ์รู้ว่ามีปุ่มนี้" ปุ่มหายไปเลย
//   allow คืนสตริง → "มีสิทธิ์เห็น แต่ยังกดไม่ได้" ปุ่มโชว์แบบ disabled พร้อมบอกเหตุ
// สลับกันแล้วจะเกิด 2 บั๊กคนละแบบ: เอาเงื่อนไขเวลาไปใส่ visible = ผู้ใช้ไม่รู้ว่าต้องทำอะไร
// ต่อ (ปุ่มหายเงียบ) · เอาเงื่อนไขสิทธิ์ไปใส่ allow = คนไม่มีสิทธิ์เห็นปุ่มที่ตัวเองแตะไม่ได้

import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { toneColor } from "@/lib/ui/tone";

/* ช่องปุ่มบนการ์ด — ตรงกับที่ DocumentControlCard แบ่งไว้ (primary / secondary / danger) */
export const RECORD_SLOTS = ["primary", "secondary", "danger"];

/* kind ที่ถือว่า "ถอยหลัง/ยกเลิก/ปฏิเสธ" → บังคับ reason:'required' (มติผู้ใช้ ข้อ 3)
   ตรวจตอนประกาศ lifecycle ไม่ใช่ตอนกดปุ่ม เพื่อให้พลาดตอนเขียนโค้ด ไม่ใช่ตอนผู้ใช้กด

   ⚠️ 'withdraw' ไม่อยู่ในลิสต์นี้โดยเจตนา (มติ 2026-07-28): "ดึงกลับ/ถอนคำขอ" คือผู้ยื่น
   ดึงคำขอของตัวเองกลับ ไม่มีใครต้องอ่านเหตุผล — ใช้กล่องยืนยันพอ ต่างจาก 'reject' ที่
   ผู้อนุมัติส่งกลับให้คนอื่นแก้ (ดูคำศัพท์: ตีกลับ = ผู้อนุมัติ / ดึงกลับ = ผู้ยื่นเท่านั้น) */
export const BACKWARD_KINDS = [
  "reject", // ตีกลับให้ผู้จัดทำแก้
  "cancel", // ยกเลิกใบ/คำขอ
  "revert", // ย้อนสถานะที่เคยเดินหน้าไปแล้ว
  "reopen", // เปิดใหม่หลังปิด
  "revoke", // ย้อนการอนุมัติ
  "bounce", // ตีกลับทีมที่รับผิดชอบ
  "drop", // ยกเลิกโครงการ/ดีล
  "disqualify", // ไม่ไปต่อ
];

/* สีของปุ่ม "ก้าวถัดไป" ในแถวตาราง — มติผู้ใช้ 2026-08-01: ให้แต่ละก้าวมีสีต่างกัน
   เพื่อกวาดตาลงคอลัมน์แล้วแยกออกว่าแถวไหนค้างอยู่ขั้นไหน (ของเดิมก่อน #870 เป็นแบบนี้)

   ⚠️ นี่คือ **สีตามขั้นตอน ไม่ใช่สีตามความหมาย** ซึ่งต่างจากกฎปกติของระบบที่ `kind`
   ผูก tone ไว้ที่ ActionButtons.js — ยอมให้เกิดเฉพาะ *ในแถวตาราง* ที่ต้องอ่านเป็นคอลัมน์
   บนการ์ดยังใช้ tone ตาม kind เหมือนเดิม
   ชื่อจึงเป็นชื่อสีตรง ๆ ไม่ใช่ชื่อความหมาย — จะได้ไม่หลอกตัวเองว่ามันคือ semantic tone
   ค่าจริงแมปเป็นคลาสที่ RecordActionMenu.module.css ที่เดียว (ห้ามเขียน --btn-bg ในหน้า) */
export const ROW_TONES = ["navy", "blue", "violet", "teal", "green", "amber", "red"];

const REASON_MODES = ["none", "optional", "required"];
const DEFAULT_REASON_MIN = 10;
const DEFAULT_REASON_MAX = 500;

const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

/**
 * ประกาศเส้นชีวิตของ entity หนึ่งตัว
 *
 * @param entity  รหัสสั้น ๆ ('lead' | 'deal' | 'project') ใช้เป็น prefix ของ key ใน UI
 * @param noun    คำไทยที่เอาไปต่อท้าย "จัดการ...นี้" บนหัวการ์ด (เช่น 'โครงการ')
 * @param statusOf  record → คีย์สถานะ (ปกติ r.status)
 * @param statuses  { [key]: { label, tone, description } }
 * @param steps     แถบเส้นทาง [{ id, label, hint, statuses: [...] }] — statuses = สถานะที่นับว่าอยู่ขั้นนี้
 * @param cancelledStatuses  สถานะที่ทำให้เส้นทางทั้งเส้นเป็น 'cancelled'
 * @param transitions  ดู normalizeTransition ด้านล่าง
 */
export function defineLifecycle({
  entity,
  noun,
  statusOf = (record) => record?.status,
  statuses = {},
  steps = [],
  cancelledStatuses = [],
  transitions = [],
}) {
  if (!entity) throw new Error("defineLifecycle: ต้องระบุ entity");
  if (!noun) throw new Error(`defineLifecycle(${entity}): ต้องระบุ noun สำหรับหัวการ์ด`);

  const normalized = transitions.map((transition) => normalizeTransition(transition, entity));
  const byId = new Map();
  for (const transition of normalized) {
    if (byId.has(transition.id)) throw new Error(`defineLifecycle(${entity}): transition id ซ้ำ — ${transition.id}`);
    byId.set(transition.id, transition);
  }

  const statusMeta = (record) => {
    const status = statusOf(record);
    const meta = statuses[status] || {};
    const tone = meta.tone || "neutral";
    return {
      status: status ?? null,
      label: meta.label || String(status ?? "—"),
      tone,
      color: toneColor(tone),
      description: meta.description || "",
    };
  };

  const isCancelled = (record) => cancelledStatuses.includes(statusOf(record));

  const railSteps = (record) => {
    const status = statusOf(record);
    // ใช้ step "ท้ายสุด" ที่ครอบสถานะนี้ — สถานะเดียวโผล่ได้หลายขั้น (เช่น 'contacted'
    // เป็นทั้งปลายขั้นติดต่อและต้นขั้นนัดประชุม) ให้ถือว่าเดินมาถึงขั้นหลังสุดแล้ว
    const index = steps.findLastIndex((step) => asArray(step.statuses).includes(status));
    const bare = steps.map(({ statuses: _covered, ...rest }) => rest);
    return workflowStepsFromIndex(bare, index < 0 ? 0 : index, isCancelled(record));
  };

  /** transition ที่ "อยู่ในเส้นทางจากสถานะนี้" — ยังไม่กรองสิทธิ์ */
  const fromStatus = (record) => {
    const status = statusOf(record);
    return normalized.filter((transition) => transition.from === "*" || transition.from.includes(status));
  };

  /**
   * ปุ่มที่ควรโชว์สำหรับ (record, user) — การ์ดและแถวตารางกินตัวนี้ตัวเดียวกัน
   * คืน entry พร้อม disabled/disabledReason แล้ว ฝั่ง UI ไม่ต้องคิดกติกาซ้ำ
   */
  const available = (record, user) => {
    const entries = fromStatus(record)
      .filter((transition) => transition.visible(record, user) !== false)
      .map((transition) => {
        const verdict = transition.allow(record, user);
        const blocked = verdict !== true;
        const label = resolveLabel(transition.label, record);
        return {
          id: transition.id,
          label,
          /* ป้ายสำหรับ *แถวตาราง* — ที่นั่นมีความกว้างเท่าคอลัมน์เดียว ป้ายของการ์ด
             เขียนให้อ่านเป็นประโยคได้ ("มอบหมายผู้รับผิดชอบ") ยาวเกินจนแถวตกบรรทัด
             ไม่ระบุ = ใช้ label เดิม (สั้นอยู่แล้วก็ไม่ต้องเขียนซ้ำ) */
          rowLabel: resolveLabel(transition.rowLabel, record) || label,
          rowTone: transition.rowTone,
          kind: transition.kind,
          icon: transition.icon,
          slot: transition.slot,
          disabled: blocked,
          disabledReason: blocked ? (typeof verdict === "string" ? verdict : "ยังทำรายการนี้ไม่ได้") : undefined,
          transition,
        };
      });
    return normalizeSlots(entries);
  };

  return {
    entity,
    noun,
    statuses,
    steps,
    transitions: normalized,
    statusOf,
    statusMeta,
    railSteps,
    isCancelled,
    available,
    get: (id) => byId.get(id) || null,
  };
}

/** primary ได้ตัวเดียว — ตัวถัดไปตกไปเป็น secondary (การ์ดมีช่อง primary ช่องเดียว) */
export function normalizeSlots(entries = []) {
  let primaryTaken = false;
  return entries.map((entry) => {
    if (entry.slot !== "primary") return entry;
    if (primaryTaken) return { ...entry, slot: "secondary" };
    primaryTaken = true;
    return entry;
  });
}

function normalizeTransition(transition, entity) {
  const { id, kind, label } = transition || {};
  if (!id) throw new Error(`defineLifecycle(${entity}): transition ต้องมี id`);
  if (!label) throw new Error(`defineLifecycle(${entity}): transition ${id} ต้องมี label`);
  if (!kind) throw new Error(`defineLifecycle(${entity}): transition ${id} ต้องมี kind`);

  const slot = transition.slot || (BACKWARD_KINDS.includes(kind) ? "danger" : "secondary");
  if (!RECORD_SLOTS.includes(slot)) {
    throw new Error(`defineLifecycle(${entity}): transition ${id} slot ไม่ถูกต้อง — ${slot}`);
  }

  const rowTone = transition.rowTone || "navy";
  if (!ROW_TONES.includes(rowTone)) {
    throw new Error(`defineLifecycle(${entity}): transition ${id} rowTone ต้องเป็น ${ROW_TONES.join("|")}`);
  }

  const reason = transition.reason || "none";
  if (!REASON_MODES.includes(reason)) {
    throw new Error(`defineLifecycle(${entity}): transition ${id} reason ต้องเป็น ${REASON_MODES.join("|")}`);
  }
  // มติผู้ใช้ ข้อ 3 — ตกที่นี่ตอนประกาศ ไม่ใช่ตอนผู้ใช้กดปุ่มแล้วไม่มีที่กรอกเหตุผล
  if (BACKWARD_KINDS.includes(kind) && reason !== "required") {
    throw new Error(
      `defineLifecycle(${entity}): transition ${id} เป็นการถอยหลัง/ยกเลิก (kind=${kind}) ต้องใช้ reason:'required'`,
    );
  }

  const fields = asArray(transition.fields).map((field) => normalizeField(field, entity, id));

  return {
    ...transition,
    id,
    kind,
    label,
    rowTone,
    slot,
    // ไม่ระบุ from = ทำได้จากทุกสถานะ (เช่น "แก้ไข" ที่ไม่ผูกกับขั้นตอน)
    from: transition.from == null || transition.from === "*" ? "*" : asArray(transition.from),
    to: transition.to ?? null,
    reason,
    reasonPolicy: {
      label: "เหตุผล",
      minLength: reason === "required" ? DEFAULT_REASON_MIN : 0,
      maxLength: DEFAULT_REASON_MAX,
      tone: BACKWARD_KINDS.includes(kind) ? "danger" : "warning",
      ...(transition.reasonPolicy || {}),
    },
    fields,
    confirm: transition.confirm || null,
    visible: transition.visible || (() => true),
    allow: transition.allow || (() => true),
  };
}

/* ⚠️ ทะเบียนนี้ต้องตรงกับสาขาที่ `TransitionDialog` เรนเดอร์จริง — เพิ่มที่นี่ที่เดียว
   แล้ว dialog ไม่รู้จัก field จะตกไปเป็น input ข้อความเงียบ ๆ (วันที่จะกลายเป็น
   ช่องพิมพ์อิสระ) · เพิ่มที่ dialog อย่างเดียวแล้ว defineLifecycle จะ throw ตั้งแต่
   ตอนสร้าง lifecycle — อันหลังดังกว่า จึงเป็นด่านที่พึ่งได้
   `date` = วันล้วน ๆ (DateInput · เก็บ/ส่งเป็น ISO ค.ศ.) ต่างจาก `datetime` ที่มีเวลาด้วย */
const FIELD_TYPES = ["text", "select", "person", "date", "datetime", "money"];

function normalizeField(field, entity, transitionId) {
  if (!field?.name) throw new Error(`defineLifecycle(${entity}): ${transitionId} — field ต้องมี name`);
  const type = field.type || "text";
  if (!FIELD_TYPES.includes(type)) {
    throw new Error(`defineLifecycle(${entity}): ${transitionId} — field ${field.name} type ไม่รองรับ (${FIELD_TYPES.join("|")})`);
  }
  return { required: false, ...field, type };
}

/**
 * ตัวเลือกของ field ชนิด `person` — รับได้ทั้งอาร์เรย์ตายตัวและ **ฟังก์ชันของ record**
 *
 * ทำไมต้องรับฟังก์ชัน: lifecycle ถูกสร้างครั้งเดียวต่อหน้า (useMemo) แต่หน้ารายการมี
 * หลายระเบียนในจอเดียว และบางชุดรายชื่อขึ้นกับ *ตัวระเบียน* ไม่ใช่ตัวคนที่เปิดหน้าอยู่ —
 * ผู้รับผิดชอบลีดต้องอยู่ทีมเดียวกับ **ลีดใบนั้น** ส่วน admin/หัวหน้าฝ่ายไม่มีทีมของตัวเอง
 * ถ้ากรองด้วยทีมของคนดู ทั้งสองตำแหน่งจะเห็นชื่อทุกคนทุกทีมแล้วเลือกไปโดน 400 จาก server
 *
 * ⚠️ เห็นชื่อในดรอปดาวน์แล้วเลือกไม่ได้ = แย่กว่าไม่เห็นชื่อนั้นเลย
 */
/**
 * ป้ายของ transition — รับได้ทั้งสตริงและ **ฟังก์ชันของ record**
 *
 * บาง action เป็นปุ่มเดียวกันแต่คนละจังหวะ แล้วคำที่ถูกต้องคนละคำ — เช่นลีดที่ยังไม่มีนัด
 * ปุ่มคือ "บันทึกนัดประชุม" ส่วนลีดที่นัดไว้แล้วปุ่มเดียวกันนั้นคือ "นัดเพิ่ม / เลื่อนนัด"
 * ถ้าใช้คำเดียวตายตัว ผู้ใช้จะเดาไม่ออกว่ากดแล้วทับของเดิมหรือเพิ่มใบใหม่
 * (แพตเทิร์นเดียวกับที่ `leadDealAction` ทำมือไว้ก่อนหน้านี้: "เปิดดีล" vs "เปิดดีลเพิ่ม")
 */
export function resolveLabel(label, record) {
  return typeof label === "function" ? label(record) : label;
}

export function fieldUsers(field, record) {
  const users = typeof field?.users === "function" ? field.users(record) : field?.users;
  return Array.isArray(users) ? users : [];
}

/** ตัวเลือกของ field ชนิด select — **รับฟังก์ชันได้เหมือน `users`**
 *
 *  ⚠️ lifecycle ถูกสร้าง **ครั้งเดียวต่อหน้า** แต่ตารางมีหลายแถวที่บริบทต่างกัน
 *  (เช่น ทีมที่ถูกล็อกของใบที่ถูกส่งกลับ) ⇒ ตัวเลือกที่ขึ้นกับแถวต้องเป็นฟังก์ชัน
 *  🪤 ส่ง `field.options` ดิบเข้า `<Select options>` เมื่อไร ฟังก์ชันจะกลายเป็น
 *  อาร์เรย์ว่างเงียบ ๆ (Select ทำ `options.map`) ⇒ ดรอปดาวน์ว่างเปล่าโดยไม่มี error */
export function fieldOptions(field, record) {
  const options = typeof field?.options === "function" ? field.options(record) : field?.options;
  return Array.isArray(options) ? options : [];
}

/**
 * ค่าที่กรอกครบตามที่ transition ขอหรือยัง — TransitionDialog ใช้คุมปุ่มยืนยัน
 * คืน null = ผ่าน / สตริง = เหตุที่ยังกดไม่ได้
 */
export function validateTransitionValues(transition, values = {}) {
  if (!transition) return "ไม่พบรายการนี้";
  const { reason, reasonPolicy, fields } = transition;
  if (reason === "required") {
    const text = String(values.reason || "").trim();
    if (text.length < reasonPolicy.minLength) return `กรุณาระบุอย่างน้อย ${reasonPolicy.minLength} ตัวอักษร`;
  }
  const overLimit = String(values.reason || "").trim().length > reasonPolicy.maxLength;
  if (overLimit) return `เหตุผลยาวเกิน ${reasonPolicy.maxLength} ตัวอักษร`;
  for (const field of fields) {
    if (!field.required) continue;
    const value = values[field.name];
    if (value === undefined || value === null || String(value).trim() === "") {
      return `กรุณากรอก${field.label || field.name}`;
    }
  }
  return null;
}
