// PM task templates (ported from ss-cj). role = ป้ายแผนก:
//   SA=Sales, RD=R&D, PC=Production Control, PD=Production, QC=Quality Control,
//   LG=Legal, WH=Warehouse, ALL=ทุกแผนก.
// dependsOnSteps = step ที่ต้องเสร็จก่อน (แปลงเป็น predecessors ตอน gen).
//   [] ว่าง = เริ่มที่จุดเริ่มโครงการ (ขนานกับแถวแรก), ไม่ใส่ = ต่อจากแถวก่อนหน้า.
// categoryOnly / categoryExclude = แสดง step ตามหมวดสินค้า (productMainCategory).
//   ขั้นสรรพสามิตใช้ token EXCISE_CATEGORY_TOKEN ('flag:excise') = หมวดที่ติ๊ก
//   "เสียภาษีสรรพสามิต" (product_types.isExcise, mig 0131) — ไม่ hardcode รหัสหมวด.
import { EXCISE_CATEGORY_TOKEN } from '../workflowTemplates';
//
// เฟส A (Sales Revamp): แยก template ตามประเภทดีล 3 ค่า —
//   SCENT    = งานพัฒนากลิ่น (ขาย + ออกแบบกลิ่น — Phase 1–2 ของ template NPD เดิม)
//   NPD      = งานพัฒนาสินค้า (Mock-up → ส่งมอบ — Phase 3–6 ของ template NPD เดิม)
//   RE-ORDER = สั่งผลิตซ้ำ (เดิม)
// โครงการ NPD เก่า (สร้างก่อนแยก) มี task ช่วงกลิ่นอยู่แล้ว → merge ใช้ชุด legacy เต็มเส้น
// ผ่าน templateForMerge() เพื่อไม่ลบงานเดิม (ดู SALES_REVAMP_PLAN.md เฟส A).

export const SCENT_TEMPLATE = [
  // Phase 1: กระบวนการขายและบริการ
  { step: 1,  name: 'ประชุมลูกค้า',                         role: 'SA',  durationDays: 3,  phase: 'กระบวนการขายและบริการ' },
  { step: 2,  name: 'ใบเสนอราคาออกแบบกลิ่น',                role: 'SA',  durationDays: 1,  phase: 'กระบวนการขายและบริการ' },
  { step: 3,  name: 'สัญญาออกแบบกลิ่น',                     role: 'SA',  durationDays: 1,  isMilestone: true, phase: 'กระบวนการขายและบริการ' },
  { step: 4,  name: 'ใบสั่งขายออกแบบกลิ่น',                 role: 'SA',  durationDays: 1,  phase: 'กระบวนการขายและบริการ', dependsOnSteps: [3] },
  { step: 5,  name: 'กรอกแบบฟอร์ม (PDR)',                   role: 'SA',  durationDays: 1,  phase: 'กระบวนการขายและบริการ', dependsOnSteps: [3] },
  // Phase 2: พัฒนาสูตร / ออกแบบกลิ่น
  { step: 6,  name: 'ออกแบบกลิ่น',                          role: 'RD',  durationDays: 20, phase: 'พัฒนาสูตร / ออกแบบกลิ่น', dependsOnSteps: [4, 5] },
  { step: 7,  name: 'ส่งกลิ่น ครั้งที่ 1',                  role: 'RD',  durationDays: 3,  phase: 'พัฒนาสูตร / ออกแบบกลิ่น' },
  { step: 8,  name: 'Feedback/Confirm กลิ่น ครั้งที่ 1',    role: 'SA',  durationDays: 3,  isMilestone: true, phase: 'พัฒนาสูตร / ออกแบบกลิ่น' },
];

export const NPD_TEMPLATE = [
  // Phase 3: ขึ้นต้นแบบ (Mock-up)
  { step: 15, name: 'ขึ้น Mock-up สินค้า',                  role: 'RD',  durationDays: 10, phase: 'ขึ้นต้นแบบ (Mock-up)' },
  { step: 16, name: 'ส่ง Mock-up ครั้งที่ 1',               role: 'RD',  durationDays: 3,  phase: 'ขึ้นต้นแบบ (Mock-up)' },
  { step: 17, name: 'Feedback/Confirm Mock-up ครั้งที่ 1',  role: 'SA',  durationDays: 3,  isMilestone: true, phase: 'ขึ้นต้นแบบ (Mock-up)' },
  // Phase 4: เตรียมการผลิต
  // step 25 เดิมอ้าง [3] (สัญญาออกแบบกลิ่น — อยู่ฝั่ง SCENT แล้ว) → [] = long-lead
  // เริ่มขนานตั้งแต่ต้นโครงการเหมือนพฤติกรรมเดิม
  { step: 25, name: 'หาบรรจุภัณฑ์ที่ลูกค้าต้องการ',         role: 'PC',  durationDays: 30, phase: 'เตรียมการผลิต', dependsOnSteps: [] },
  { step: 26, name: 'ใบเสนอราคาผลิต',                       role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต', dependsOnSteps: [17] },
  { step: 27, name: 'สัญญาจ้างผลิต',                        role: 'SA',  durationDays: 2,  isMilestone: true, phase: 'เตรียมการผลิต' },
  { step: 28, name: 'ใบสั่งขายผลิต',                        role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต' },
  { step: 29, name: 'FM-SA-04 เอกสารระบุรายละเอียดผลิตภัณฑ์', role: 'SA', durationDays: 1, phase: 'เตรียมการผลิต', dependsOnSteps: [28] },
  { step: 30, name: 'FM-SA-07 ใบรายงานติดตามคำสั่งซื้อ',    role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต', dependsOnSteps: [28] },
  { step: 31, name: 'ขึ้นทะเบียนสรรพสามิต [Optional]',      role: 'LG',  durationDays: 7,  isMilestone: true, phase: 'เตรียมการผลิต', dependsOnSteps: [29, 30], categoryOnly: EXCISE_CATEGORY_TOKEN },
  { step: 32, name: 'ส่ง Check list Planner',               role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต' },
  { step: 33, name: 'นัดประชุมระหว่างแผนก',                 role: 'ALL', durationDays: 1,  phase: 'เตรียมการผลิต' },
  // Phase 4.1: ผลิต — New Product
  { step: 34, name: 'ส่งเรื่องให้ RD ลง BOM / PC ตั้ง Code', role: 'PD', durationDays: 1,  phase: 'ผลิต — New Product' },
  { step: 35, name: 'ลง BOM ใน Express',                    role: 'RD',  durationDays: 3,  phase: 'ผลิต — New Product', dependsOnSteps: [34] },
  { step: 36, name: 'ตั้ง Code',                            role: 'PC',  durationDays: 2,  phase: 'ผลิต — New Product', dependsOnSteps: [34] },
  { step: 37, name: 'ทำเอกสาร PR',                          role: 'PD',  durationDays: 2,  phase: 'ผลิต — New Product', dependsOnSteps: [35, 36] },
  { step: 38, name: 'สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด', role: 'PC', durationDays: 45, isMilestone: true, phase: 'ผลิต — New Product' },
  // Phase 5: QC / ผลิตสินค้า
  { step: 39, name: 'QC สินค้า (ขาเข้า)',                   role: 'QC',  durationDays: 3,  phase: 'QC / ผลิตสินค้า' },
  { step: 40, name: 'เบิกของเข้าไลน์ผลิต',                  role: 'PD',  durationDays: 7,  phase: 'QC / ผลิตสินค้า' },
  { step: 41, name: 'ผลิตสินค้า',                           role: 'PD',  durationDays: 3,  phase: 'QC / ผลิตสินค้า' },
  { step: 42, name: 'ส่งมอบของให้คลัง',                     role: 'PD',  durationDays: 1,  isMilestone: true, phase: 'QC / ผลิตสินค้า' },
  // Phase 6: ส่งมอบสินค้า
  { step: 43, name: 'วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต [Optional]', role: 'SA', durationDays: 7, phase: 'ส่งมอบสินค้า', dependsOnSteps: [42], categoryOnly: EXCISE_CATEGORY_TOKEN },
  { step: 44, name: 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)', role: 'SA',  durationDays: 1,  phase: 'ส่งมอบสินค้า', dependsOnSteps: [42], categoryExclude: EXCISE_CATEGORY_TOKEN },
  { step: 45, name: 'รับชำระเงิน / ยืนยันการโอน',           role: 'SA',  durationDays: 1,  isMilestone: true, phase: 'ส่งมอบสินค้า', dependsOnSteps: [43, 44] },
  { step: 46, name: 'ทำใบส่งของ (QD)',                      role: 'WH',  durationDays: 1,  phase: 'ส่งมอบสินค้า' },
  { step: 47, name: 'จัดส่งสินค้า',                         role: 'WH',  durationDays: 1,  isMilestone: true, phase: 'ส่งมอบสินค้า' },
];

export const REORDER_TEMPLATE = [
  // Phase 4: เตรียมการผลิต
  { step: 1,  name: 'ใบเสนอราคาผลิต',                       role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต' },
  { step: 2,  name: 'สัญญาจ้างผลิต',                        role: 'SA',  durationDays: 2,  isMilestone: true, phase: 'เตรียมการผลิต' },
  { step: 3,  name: 'ใบสั่งขายผลิต',                        role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต' },
  { step: 4,  name: 'FM-SA-04 เอกสารระบุรายละเอียดผลิตภัณฑ์', role: 'SA', durationDays: 1,  phase: 'เตรียมการผลิต' },
  { step: 5,  name: 'FM-SA-07 ใบรายงานติดตามคำสั่งซื้อ',    role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต' },
  // RE-ORDER ไม่มีขั้น "ขึ้นทะเบียนสรรพสามิต" — สินค้าขึ้นทะเบียนไว้แล้ว เหลือแค่
  // ยื่นชำระค่าสรรพสามิตตอนวางบิล (step 16, categoryOnly flag:excise). การขึ้นทะเบียนมีเฉพาะ NPD.
  { step: 7,  name: 'ส่ง Check list Planner',               role: 'SA',  durationDays: 1,  phase: 'เตรียมการผลิต' },
  { step: 8,  name: 'นัดประชุมระหว่างแผนก',                 role: 'ALL', durationDays: 1,  phase: 'เตรียมการผลิต' },
  // Phase 4.RE: ผลิต — Re-order
  { step: 9,  name: 'Planner Check วัตถุดิบ',               role: 'PD',  durationDays: 2,  phase: 'ผลิต — Re-order' },
  { step: 10, name: 'ทำเอกสาร PR',                          role: 'PD',  durationDays: 2,  phase: 'ผลิต — Re-order' },
  { step: 11, name: 'สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด', role: 'PC', durationDays: 45, isMilestone: true, phase: 'ผลิต — Re-order' },
  // Phase 5: QC / ผลิตสินค้า
  { step: 12, name: 'QC สินค้า (ขาเข้า)',                   role: 'QC',  durationDays: 3,  phase: 'QC / ผลิตสินค้า' },
  { step: 13, name: 'เบิกของเข้าไลน์ผลิต',                  role: 'PD',  durationDays: 7,  phase: 'QC / ผลิตสินค้า' },
  { step: 14, name: 'ผลิตสินค้า',                           role: 'PD',  durationDays: 3,  phase: 'QC / ผลิตสินค้า' },
  { step: 15, name: 'ส่งมอบของให้คลัง',                     role: 'PD',  durationDays: 1,  isMilestone: true, phase: 'QC / ผลิตสินค้า' },
  // Phase 6: ส่งมอบสินค้า
  { step: 16, name: 'วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต [Optional]', role: 'SA', durationDays: 7, phase: 'ส่งมอบสินค้า', categoryOnly: EXCISE_CATEGORY_TOKEN },
  { step: 17, name: 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)', role: 'SA',  durationDays: 1,  phase: 'ส่งมอบสินค้า', categoryExclude: EXCISE_CATEGORY_TOKEN },
  { step: 18, name: 'รับชำระเงิน / ยืนยันการโอน',           role: 'SA',  durationDays: 1,  isMilestone: true, phase: 'ส่งมอบสินค้า' },
  { step: 19, name: 'ทำใบส่งของ (QD)',                      role: 'WH',  durationDays: 1,  phase: 'ส่งมอบสินค้า' },
  { step: 20, name: 'จัดส่งสินค้า',                         role: 'WH',  durationDays: 1,  isMilestone: true, phase: 'ส่งมอบสินค้า' },
];

// template NPD เต็มเส้นแบบก่อนแยก (กลิ่น→ส่งมอบ) — ใช้เฉพาะ merge โครงการ NPD เก่า
// step 25 คืน dependsOnSteps [3] แบบเดิม (สัญญาออกแบบกลิ่นอยู่ในชุดนี้)
export const NPD_LEGACY_FULL_TEMPLATE = [
  ...SCENT_TEMPLATE,
  ...NPD_TEMPLATE.map((t) => (t.step === 25 ? { ...t, dependsOnSteps: [3] } : t)),
];

export const templateFor = (type) => {
  if (type === 'SCENT') return SCENT_TEMPLATE;
  if (type === 'RE-ORDER') return REORDER_TEMPLATE;
  return NPD_TEMPLATE;
};

// ชื่อขั้นตอนฝั่งกลิ่น — ไว้ตรวจว่าโครงการ NPD เก่ามี task ช่วงกลิ่นอยู่แล้วหรือไม่
const SCENT_STEP_NAMES = new Set(SCENT_TEMPLATE.map((t) => t.name));

// template สำหรับ merge/resync (mergeTemplateTasks): โครงการ NPD ที่สร้างก่อนแยก template
// มี task ช่วงกลิ่น (origin=template) อยู่ใน DB — ถ้า merge ด้วย NPD_TEMPLATE ใหม่
// task เหล่านั้นจะถูกลบทิ้งพร้อมความคืบหน้า → ใช้ชุด legacy เต็มเส้นแทน.
// โครงการ NPD ใหม่ (ไม่มี task ช่วงกลิ่น) ใช้ชุดใหม่ตามปกติ.
export function templateForMerge(type, existingTasks) {
  if (type === 'NPD') {
    const hasLegacyScent = (existingTasks || []).some(
      (t) => t.origin !== 'custom' && SCENT_STEP_NAMES.has(t.name)
    );
    if (hasLegacyScent) return NPD_LEGACY_FULL_TEMPLATE;
  }
  return templateFor(type);
}

// assignee ตั้งต้น: SA ผูกชื่อ AE owner; แผนกอื่นเว้นว่าง (เป็นป้าย role)
export const defaultAssignee = (role, project) => (role === 'SA' ? (project.aeOwner || project.ae || '') : '');
