// ── entity ไหนมีโฟลเดอร์ของตัวเองบน Drive ─────────────────────────────
// แยกออกมาเป็นไฟล์ล้วน ๆ (ไม่มี I/O) เพื่อให้เทสต์ตรวจได้โดยไม่ต้องโหลด googleapis
// และเพื่อให้ "ชื่อ entity" มีที่อ้างอิงเดียวระหว่างสายไฟล์แนบกับสายเธรดอัปเดต
//
// 🐞 บั๊กจริงที่ทำให้ต้องมีไฟล์นี้: เธรดอัปเดต (lib/master/updateAccess) ตั้งชื่อ entity
// ว่า `excise_registration`/`excise_order` ส่วนไฟล์แนบใช้ `registration`/`order`
// ตัว resolve โฟลเดอร์รู้จักแต่ชุดหลัง → **รูปที่แนบในเธรดทะเบียนภาษี/ใบยื่นตกถัง
// "_รอจัดที่" ทุกไฟล์** ผู้ใช้แนบขึ้นแต่หาบน Drive ไม่เจอ และไม่มี error ให้เห็นเลย

// ชื่อของเธรด → ชื่อที่ตัว resolve โฟลเดอร์รู้จัก
export const THREAD_ALIAS = {
  excise_registration: 'registration',
  excise_order: 'order',
};

// entity ที่มีสาขาโฟลเดอร์ของตัวเองจริง ๆ (นอกลิสต์นี้ = ตกถัง "_รอจัดที่")
export const FOLDER_ENTITY_TYPES = [
  'customer',
  'order',
  'product',
  'registration',
  'costing_item',
  'dept_request_item',
  'costing_request',
  'dept_request',
  'mgmt_task',
  'mgmt_meeting',
  'personal_task',
  'lead',
  'deal',
  'quotation',
  'sales_order',
  'sahamit_po',
];

export const resolveEntityAlias = (entityType) => THREAD_ALIAS[entityType] || entityType;
export const hasFolderBranch = (entityType) => FOLDER_ENTITY_TYPES.includes(resolveEntityAlias(entityType));
