// ── ชนิดรายการในเธรดอัปเดต (mig 0163) — โค้ดล้วน ไม่ต้อง migration ────────
// ตาราง entity_updates ไม่มี CHECK บน kind โดยเจตนา: ชุด kind เป็นของแต่ละ entity
// (งานมี due/late, ดีลมี call/meeting) การล็อกลง DB จะทำให้เพิ่ม entity ใหม่ต้อง
// ออก migration ทุกครั้ง — แพตเทิร์นเดียวกับ attachmentTypes / materialTypes
//
// ⚠️ ป้าย/สีของงานยกมาจาก UPDATE_META เดิมในหน้า pm/tasks แบบตรง ๆ — ผู้ใช้ต้อง
// ไม่รู้สึกว่าอะไรเปลี่ยนหลังย้ายมาใช้ของกลาง

// ── ธงต่อ kind ───────────────────────────────────────────────────────────
// `authorable: true` = คนเลือกชนิดนี้เองได้ตอนโพสต์ · ไม่ติดธง = ระบบเขียนให้
// เท่านั้น (ปล่อยให้ client ส่ง kind='status' มาเอง = ปลอมไทม์ไลน์ได้)
// `due: true`        = ชนิดนี้กรอก "กำหนดวัน" ได้ เก็บใน meta.dueDate
//
// ⚠️ ส่วนใหญ่มี authorable ตัวเดียวคือ comment — ชุดหลายชนิดมีเฉพาะฟีดดีลที่
// แยก โทร/ประชุม/อีเมล มาแต่เดิม (mig 0063) และผู้ใช้ยืนยันให้คงไว้ 2026-07-27
export const UPDATE_KINDS = {
  personal_task: {
    comment: { label: 'อัปเดต', color: 'var(--accent)', authorable: true },
    status: { label: 'เปลี่ยนสถานะ', color: 'var(--blue)' },
    due: { label: 'เลื่อนกำหนด', color: 'var(--amber)' },
    late: { label: 'สาเหตุที่เสร็จช้า', color: 'var(--red)' },
  },
  // เคสขอราคาวัสดุ (mig 0158) — เธรดสองฝ่าย: เซลถาม ↔ RD/PC ตอบ
  // ป้าย 'ข้อความ' ไม่ใช่ 'อัปเดต' เพราะที่นี่คนคุยกันจริง ไม่ใช่รายงานความคืบหน้า
  dept_request: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    submit: { label: 'ส่งเคส', color: 'var(--blue)' },
    acknowledge: { label: 'รับเรื่อง', color: 'var(--blue)' },
    quoted: { label: 'ตอบราคา', color: 'var(--green)' },
    no_quote: { label: 'ตอบไม่ได้', color: 'var(--amber)' },
    close: { label: 'ปิดเคส', color: 'var(--text-3)' },
    cancel: { label: 'ยกเลิกเคส', color: 'var(--red)' },
  },
  // ── โครงการ ──────────────────────────────────────────────────────────
  // ⭐ เธรด**ระดับโครงการ**: เรื่องที่ยังเป็นจริงแม้ดีลใบใดใบหนึ่งจะถูกยกเลิกไป
  // (ลูกค้าเลื่อนส่งมอบทั้งล็อต · โรงงานแจ้งของเสีย · ตัดสินใจข้ามดีล) — ส่วนเรื่อง
  // ที่ตายไปพร้อมดีลต้องอยู่ในเธรดของดีลใบนั้น ไม่ใช่ที่นี่
  //
  // ความเคลื่อนไหวของดีลลูกไหลเข้ามาแสดงรวมในเส้นเรื่องเดียวกันผ่าน `extraItems`
  // (อ่านอย่างเดียว + ลิงก์เข้าดีล) — กล่องพิมพ์บนหน้าโครงการลงที่เธรดนี้เสมอ
  //
  // ⚠️ ยังไม่ประกาศชนิดของเหตุการณ์ระบบ (ผูกดีล/ของเข้า/จบเฟส/ปิดโครงการ) เพราะ
  // ท่อที่เขียนยังไม่ได้ต่อ — ชนิดที่ไม่มีใครเขียนคือโค้ดตายค้างที่หลอกคนอ่าน
  // (บทเรียนจาก `scent` ที่มีชุดชนิดครบแต่ไม่มีทั้งทะเบียนสิทธิ์และหน้าจอ)
  project: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
  },
  // ฟีดความเคลื่อนไหวของดีล (ย้ายมาจาก sales_deal_activities, mig 0063 → 0169)
  //
  // ⭐ เธรดเดียวในระบบที่คนเลือกชนิดเองได้หลายแบบ — ป้าย/สี/ลำดับยกมาจาก
  // ACTIVITY_META เดิมในหน้าดีลตรง ๆ (ผู้ใช้ต้องไม่รู้สึกว่าอะไรเปลี่ยน) และ
  // ชื่อ kind ตรงกับ CHECK ของตารางเก่าทุกตัว จึงไม่ต้องแปลงตอน backfill
  //
  // ไม่มีชนิด 'comment' ที่นี่โดยเจตนา — ของเดิมใช้ 'note' เป็นค่าตั้งต้น
  // (updateKindMeta/defaultAuthorableKind ถอยไปหาตัวแรกที่ประกาศ ไม่ได้ผูกกับ 'comment')
  deal: {
    note: { label: 'บันทึก', color: 'var(--text-3)', authorable: true },
    call: { label: 'โทร', color: 'var(--blue)', authorable: true },
    meeting: { label: 'ประชุม', color: 'var(--violet)', authorable: true },
    email: { label: 'อีเมล', color: 'var(--teal)', authorable: true },
    next_step: { label: 'ขั้นถัดไป', color: 'var(--amber)', authorable: true, due: true },
  },
  // ลีด (mig 0091) — ชุดชนิด **เหมือนดีลทุกตัว** โดยเจตนา: คนกลุ่มเดียวกันทำงาน
  // แบบเดียวกัน และลีดที่ผ่านคัดกรองจะกลายเป็นดีล ถ้าคำศัพท์ต่างกันบันทึกการโทร
  // ก่อน/หลังแตกดีลจะอ่านเป็นคนละเรื่องทั้งที่เป็นการคุยกับคนเดียวกัน
  //
  // ⚠️ ไม่มีชนิดเหตุการณ์ระบบที่นี่ — เหตุการณ์ของลีด (คัดกรอง/มอบหมาย/ตีกลับ)
  // ยังอยู่ในตาราง `lead_events` ของตัวเอง (schema เฉพาะโดเมน + คิว/KPI query ตรง)
  // แล้วส่งเข้าเธรดผ่าน `extraItems` เป็นรายการอ่านอย่างเดียว — ตารางไม่ย้าย
  lead: {
    note: { label: 'บันทึก', color: 'var(--text-3)', authorable: true },
    call: { label: 'โทร', color: 'var(--blue)', authorable: true },
    meeting: { label: 'ประชุม', color: 'var(--violet)', authorable: true },
    email: { label: 'อีเมล', color: 'var(--teal)', authorable: true },
    next_step: { label: 'ขั้นถัดไป', color: 'var(--amber)', authorable: true, due: true },
  },
  // ── ใบเสนอราคา / ใบสั่งขาย ───────────────────────────────────────────
  // คำศัพท์ล็อกตามมติผู้ใช้: **ตีกลับ** (ผู้อนุมัติส่งคืน) · **ดึงกลับ** (ผู้ยื่น
  // เอาคืนเอง) · **ออก Rev.** — ห้ามใช้ "ถอน/ถอด" · ป้ายต้องตรงกับปุ่มบนหน้าใบ
  //
  // ⚠️ ไม่มีชนิดที่ระบบเขียนบน `deal` ทั้งที่มี kind ชื่อเดียวกันบน entity อื่น —
  // ชุด kind เป็นของแต่ละ entity โดยตั้งใจ (ดูหัวไฟล์) เทียบข้าม entity ไม่ได้
  quotation: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    submit: { label: 'ยื่นขออนุมัติ', color: 'var(--blue)' },
    approve: { label: 'อนุมัติ', color: 'var(--green)' },
    returned: { label: 'ตีกลับให้แก้ไข', color: 'var(--red)' },
    withdraw: { label: 'ดึงกลับมาแก้ไข', color: 'var(--text-3)' },
    revise: { label: 'ออก Rev.', color: 'var(--amber)' },
    accept: { label: 'ลูกค้ารับใบ', color: 'var(--green)' },
    unaccept: { label: 'ย้อนการรับ', color: 'var(--amber)' },
  },
  sales_order: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    submit: { label: 'ยื่นขออนุมัติ', color: 'var(--blue)' },
    approve: { label: 'อนุมัติ', color: 'var(--green)' },
    returned: { label: 'ตีกลับให้แก้ไข', color: 'var(--red)' },
    withdraw: { label: 'ดึงกลับมาแก้ไข', color: 'var(--text-3)' },
    revoke: { label: 'ยกเลิกอนุมัติ', color: 'var(--red)' },
    revise: { label: 'ออก Rev.', color: 'var(--amber)' },
    cancel: { label: 'ยกเลิก', color: 'var(--red)' },
    restore: { label: 'กู้คืนเป็นร่าง', color: 'var(--blue)' },
  },
  // ── master data: ลูกค้า / สินค้า ─────────────────────────────────────
  // ด่านอนุมัติชุดเดียวกัน (approvalStatus + rejectionReason + resetApprovalOnEdit)
  // จึงใช้ชุด kind เหมือนกันเป๊ะ — ป้ายต่างกันเมื่อไรคือสัญญาณว่ากฎเริ่มแตกเป็นสองชุด
  customer: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    approve: { label: 'อนุมัติ', color: 'var(--green)' },
    reject: { label: 'ตีกลับให้แก้ไข', color: 'var(--red)' },
    reset: { label: 'กลับไปรออนุมัติ', color: 'var(--amber)' },
  },
  product: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    approve: { label: 'อนุมัติ', color: 'var(--green)' },
    reject: { label: 'ตีกลับให้แก้ไข', color: 'var(--red)' },
    reset: { label: 'กลับไปรออนุมัติ', color: 'var(--amber)' },
  },
  // ── สายภาษีสรรพสามิต ────────────────────────────────────────────────
  excise_registration: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    submit: { label: 'ยื่นให้ฝ่ายกฎหมาย', color: 'var(--blue)' },
    approve: { label: 'ขึ้นทะเบียนแล้ว', color: 'var(--green)' },
    reject: { label: 'ตีกลับให้แก้ไข', color: 'var(--red)' },
    revoke: { label: 'ปลดอนุมัติ', color: 'var(--red)' },
  },
  excise_order: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    status: { label: 'เปลี่ยนสถานะ', color: 'var(--blue)' },
    reject: { label: 'ตีกลับให้แก้ไข', color: 'var(--red)' },
  },
  // ── PO สหมิตร ────────────────────────────────────────────────────────
  // ไม่มีด่านอนุมัติของตัวเอง (ลูกค้าเป็นคนออก PO) — เหตุการณ์เดียวที่มีค่าคือ
  // จุดส่งมอบเข้าท่อขาย
  sahamit_po: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    settle: { label: 'แปลงเป็นดีล', color: 'var(--green)' },
  },
  // ── นัดเข้าบริการ (mig 0188 · S-5) ───────────────────────────────────
  // ⭐ **เหตุผลการเลื่อนต้องอยู่ที่นี่ ไม่ใช่คอลัมน์** — คอลัมน์เดียวถูกเขียนทับทุกครั้ง
  // ที่เลื่อน แปลว่าประวัติการเลื่อน 5 ครั้งเหลือ 1 ซึ่งคือข้อมูลที่มีค่าที่สุดของโมดูลนี้
  // (ลูกค้าถามว่า "ทำไมช่างไม่มาสักที" ต้องตอบได้ว่าเลื่อนเพราะอะไรบ้าง)
  service_visit: {
    comment: { label: 'บันทึกหน้างาน', color: 'var(--accent)', authorable: true },
    reschedule: { label: 'เลื่อนนัด', color: 'var(--amber)' },
    done: { label: 'ปิดงาน', color: 'var(--green)' },
    cancel: { label: 'ยกเลิกนัด', color: 'var(--red)' },
  },
  // ทะเบียนกลิ่น (mig 0171) — เธรดสองฝ่าย: RD ส่งกลิ่น ↔ ฝ่ายขายนำผลจากลูกค้ามาลง
  // เหตุการณ์ระบบเขียนคู่กับ scent_revisions เสมอ (ตารางเก็บ "ผลที่เป็นทางการ"
  // ส่วนเธรดเก็บ "บทสนทนาระหว่างทาง" — คนละหน้าที่ ต้องมีทั้งคู่)
  scent: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    accepted: { label: 'รับเข้าทะเบียน', color: 'var(--blue)' },
    sent: { label: 'ส่งกลิ่น', color: 'var(--violet)' },
    feedback: { label: 'ผลตอบรับลูกค้า', color: 'var(--green)' },
    status: { label: 'เปลี่ยนสถานะ', color: 'var(--amber)' },
  },
  // ใบขอราคาผลิต (mig 0143) — เธรดสองฝ่าย: เซลยื่น ↔ ผู้บริหารอนุมัติ/ตีกลับ
  // ใช้คำที่ล็อกไว้ของ workflow เอกสาร: "ตีกลับให้แก้ไข" / "ออก Rev."
  costing_request: {
    comment: { label: 'ข้อความ', color: 'var(--accent)', authorable: true },
    submit: { label: 'ยื่นขออนุมัติ', color: 'var(--blue)' },
    // ดึงกลับ = ผู้ยื่นเอาคืนเอง (ไม่ใช่ตีกลับ) จึงเป็นสีกลาง ไม่ใช่สีแดง
    withdraw: { label: 'ดึงกลับมาแก้ไข', color: 'var(--text-3)' },
    approve: { label: 'อนุมัติราคาผลิต', color: 'var(--green)' },
    returned: { label: 'ตีกลับให้แก้ไข', color: 'var(--red)' },
    revise: { label: 'ออก Rev.', color: 'var(--amber)' },
  },
};

// ชนิดตั้งต้นของ entity ที่ไม่ได้ประกาศอะไรเลย — ยังคงชื่อเดิมไว้เพราะเป็นค่าที่
// เธรดส่วนใหญ่ใช้ตัวเดียว (ก่อนหน้านี้เป็น "ชนิดเดียวที่คนพิมพ์เองได้" ทั้งระบบ)
export const AUTHORABLE_KIND = 'comment';

// ชุดชนิดที่คนเลือกเองได้ของ entity นั้น (เรียงตามลำดับที่ประกาศ = ลำดับใน dropdown)
export function authorableKinds(entityType) {
  return Object.entries(UPDATE_KINDS[entityType] || {})
    .filter(([, meta]) => meta?.authorable)
    .map(([kind]) => kind);
}

// ชนิดที่ใช้เมื่อผู้โพสต์ไม่ได้เลือก (หรือ entity มีชนิดเดียว) — ตัวแรกที่ประกาศไว้
export function defaultAuthorableKind(entityType) {
  return authorableKinds(entityType)[0] || AUTHORABLE_KIND;
}

// ⚠️ ด่านกันปลอมไทม์ไลน์: API ต้องเรียกตัวนี้ก่อนรับ kind จาก client เสมอ
export function isAuthorableKind(entityType, kind) {
  return authorableKinds(entityType).includes(kind);
}

// ชนิดนี้กรอกกำหนดวันได้ไหม (เช่น "ขั้นถัดไป" ของฟีดดีล)
export function kindAcceptsDueDate(entityType, kind) {
  return !!(UPDATE_KINDS[entityType] || {})[kind]?.due;
}

export function updateKindMeta(entityType, kind) {
  const set = UPDATE_KINDS[entityType] || {};
  return set[kind]
    || set[defaultAuthorableKind(entityType)]
    || { label: 'อัปเดต', color: 'var(--accent)' };
}

export function isKnownUpdateKind(entityType, kind) {
  return !!(UPDATE_KINDS[entityType] || {})[kind];
}

// ── เหตุการณ์ระบบ vs ข้อความคน ───────────────────────────────────────────
// เหตุการณ์ระบบ = ของที่ไม่มีใครพิมพ์: แถวที่ kind ไม่ใช่ AUTHORABLE_KIND (ระบบเขียน
// ให้ตอนเกิดเหตุการณ์) + รายการอ่านอย่างเดียวจากแหล่งอื่น (`extraItems` — ประวัติ
// สถานะ/เหตุการณ์ลีด) ซึ่งไม่มีทางเป็นข้อความคนอยู่แล้ว
//
// ทำไมต้องแยก: พอเธรดขึ้นเอกสารที่มี action เยอะ (QT/SO มี 8 ตัวที่เขียนลงเธรด)
// เหตุการณ์ระบบจะถมจนข้อความคนจม — ต้องมีสวิตช์ให้เหลือเฉพาะที่คนคุยกัน
//
// ⚠️ ข้อความที่ถูกลบแล้วยังเป็น "ข้อความคน" (kind ยังเป็นชนิดที่คนเลือกได้) — ต้อง
// ไม่ถูกซ่อนไปกับเหตุการณ์ระบบ เพราะรอยที่ว่าเคยมีข้อความคือส่วนหนึ่งของบทสนทนา
//
// ⚠️ ต้องรู้ entityType ด้วย: ฟีดดีลมีชนิดที่คนเลือกเองได้ห้าตัว (โทร/ประชุม/อีเมล…)
// ถ้าเทียบกับ 'comment' ตัวเดียวเหมือนเดิม บันทึกการโทรของคนจะถูกจัดเป็น
// "เหตุการณ์ระบบ" แล้วหายไปตอนกดซ่อน
export function isSystemUpdateItem(entityType, item) {
  if (!item) return false;
  if (item.kind === 'extra') return true;
  const kind = item.row?.kind;
  if (!kind) return false;                    // ไม่รู้ = ถือว่าข้อความคน (ไม่ซ่อน)
  return !isAuthorableKind(entityType, kind);
}

// ── ไฟล์แนบในข้อความ ────────────────────────────────────────────────────
// รับเฉพาะ ref ของไฟล์ที่อัปผ่าน /api/upload แล้ว (กัน payload แปลกปลอม) —
// แพตเทิร์นเดียวกับ sanitizeInquiryAttachments / sanitizeWonAttachments
export const MAX_UPDATE_ATTACHMENTS = 8;

export function sanitizeUpdateAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => a && typeof a === 'object' && typeof a.fileUrl === 'string' && a.fileUrl)
    .slice(0, MAX_UPDATE_ATTACHMENTS)
    .map((a) => ({
      fileUrl: String(a.fileUrl),
      driveFileId: a.driveFileId ? String(a.driveFileId) : null,
      fileName: a.fileName ? String(a.fileName).slice(0, 200) : null,
      mimeType: a.mimeType ? String(a.mimeType).slice(0, 100) : null,
      sizeBytes: Number.isFinite(a.sizeBytes) ? Number(a.sizeBytes) : null,
    }));
}

// ข้อความที่ลบแล้วยังอยู่ในเธรด (soft delete) — แสดงเป็นรอยว่าเคยมี ไม่ใช่หายเงียบ
export const DELETED_UPDATE_TEXT = 'ข้อความนี้ถูกลบแล้ว';

// ตัดของที่ผู้อ่านไม่ควรเห็นออกจากแถวที่ลบแล้ว (เนื้อความ/ไฟล์แนบหายไป เหลือแต่รอย)
export function redactDeleted(row) {
  if (!row?.deletedAt) return row;
  return { ...row, body: null, attachments: [], meta: {} };
}
