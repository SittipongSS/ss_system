// ── คำศัพท์ของบรีฟกลิ่น (PDR 2.1.4 · 2.1.5) ─────────────────────────────
//
// ⚠️ **ทะเบียนฝั่งโค้ด ไม่ผูก CHECK ที่ DB** (mig 0213) — เพิ่ม Scentotype ตัวใหม่
// ควรแก้ไฟล์เดียว ไม่ใช่ออก migration ทุกครั้ง · แพตเทิร์นเดียวกับ docTypes/requestTypes
//
// ⚠️ ค่าที่เก็บคือ **key ไม่ใช่ป้ายชื่อ** — เปลี่ยนคำบนจอแล้วของเก่าต้องไม่กลายเป็นขยะ
// (โรคประจำถิ่นของ repo คือ "จับคู่ด้วยข้อความ" ซึ่ง mig 0171 บันทึกไว้แล้วว่าเจ็บจริง)

// PDR 2.1.4 — เลือกได้หลายอย่าง (มติผู้ใช้ 2026-08-06)
export const SCENTOTYPES = [
  { value: 'cheerer', label: 'CHEERER' },
  { value: 'admirer', label: 'ADMIRER' },
  { value: 'discoverer', label: 'DISCOVERER' },
  { value: 'enchanter', label: 'ENCHANTER' },
  { value: 'counselor', label: 'COUNSELOR' },
];

// PDR 2.1.5 — เลือกได้หลายอย่าง · กลิ่นหนึ่งติดทนและ Impact แรงพร้อมกันได้
export const SCENT_PERFORMANCE = [
  { value: 'lasting', label: 'กลิ่นติดทน (กลิ่นค้างผิว)' },
  { value: 'diffusive', label: 'กลิ่นฟุ้งกระจาย' },
  { value: 'air_lasting', label: 'กลิ่นค้างอากาศ' },
  { value: 'first_impact', label: 'Impact แรก' },
];

const byValue = (list) => new Map(list.map((t) => [t.value, t]));
const SCENTOTYPE_MAP = byValue(SCENTOTYPES);
const PERFORMANCE_MAP = byValue(SCENT_PERFORMANCE);

export const SCENTOTYPE_VALUES = SCENTOTYPES.map((t) => t.value);
export const SCENT_PERFORMANCE_VALUES = SCENT_PERFORMANCE.map((t) => t.value);

// ⚠️ ค่าที่ไม่รู้จัก **คืนค่าดิบ ไม่ใช่ค่าว่าง** — ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก
export const scentotypeLabel = (v) => SCENTOTYPE_MAP.get(v)?.label || String(v ?? '') || '—';
export const scentPerformanceLabel = (v) => PERFORMANCE_MAP.get(v)?.label || String(v ?? '') || '—';
