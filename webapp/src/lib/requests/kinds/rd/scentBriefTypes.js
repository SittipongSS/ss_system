// ── คำศัพท์ของบรีฟกลิ่น (PDR 2.1.4) + Archetype ของแบรนด์ (PDR 1.15) ──
//
// ⚠️ **ทะเบียนฝั่งโค้ด ไม่ผูก CHECK ที่ DB** (mig 0213) — เพิ่มตัวเลือกใหม่
// ควรแก้ไฟล์เดียว ไม่ใช่ออก migration ทุกครั้ง · แพตเทิร์นเดียวกับ docTypes/requestTypes
//
// ⚠️ ค่าที่เก็บคือ **key ไม่ใช่ป้ายชื่อ** — เปลี่ยนคำบนจอแล้วของเก่าต้องไม่กลายเป็นขยะ
// (โรคประจำถิ่นของ repo คือ "จับคู่ด้วยข้อความ" ซึ่ง mig 0171 บันทึกไว้แล้วว่าเจ็บจริง)

/* ⛔ **2.1.5 Scentotype ถอดออกจาก PDR แล้ว** (มติผู้ใช้ 2026-10-19) — ฟอร์ม · จอสรุป · กระดาษ
   ไม่มีข้อนี้ทุกใบ รวมใบเก่า · คอลัมน์ `dept_request_scents.scentotypes` / `scentotypeNotes`
   (mig 0213 · 0222) **ยังอยู่และไม่ถูกล้าง** — บรีฟ 18 ตัวที่เคยติ๊กไว้เก็บค่าเดิม แต่ไม่มีโค้ดอ่าน
   และ API เลิกเขียนสองคอลัมน์นี้ (บันทึกบรีฟทับแล้วค่าเดิมไม่หาย) */

// PDR 2.1.4 — เลือกได้หลายอย่าง · กลิ่นหนึ่งติดทนและ Impact แรงพร้อมกันได้
export const SCENT_PERFORMANCE = [
  { value: 'lasting', label: 'กลิ่นติดทน (กลิ่นค้างผิว)' },
  { value: 'diffusive', label: 'กลิ่นฟุ้งกระจาย' },
  { value: 'air_lasting', label: 'กลิ่นค้างอากาศ' },
  { value: 'first_impact', label: 'Impact แรก' },
];

/* PDR 1.15 — Archetype ของแบรนด์ 12 แบบ · เลือกได้หลายอย่าง + เขียนต่อได้รายตัว
   ⭐ **ระดับใบ ไม่ใช่รายกลิ่น** (มติผู้ใช้ 2026-09-11) — ไฟล์ของ AE วางไว้ที่ 2.1.6 ในกล่อง
   บรีฟ แต่ Archetype เป็นบุคลิกของ**แบรนด์** ไม่ใช่ของกลิ่นตัวใดตัวหนึ่ง และใบพัฒนาสูตร
   NPD ไม่มีบรีฟกลิ่นเลย ⇒ ย้ายมาหมวด 1 ต่อท้าย 1.14 ให้ทั้งสองหัวข้อกรอกได้
   ป้ายเป็นอังกฤษตัวใหญ่ตามกระดาษ (ชื่อเฉพาะของโมเดล 12 Archetypes — ไม่แปล) */
export const BRAND_ARCHETYPES = [
  { value: 'innocent', label: 'INNOCENT' },
  { value: 'everyman', label: 'EVERYMAN' },
  { value: 'hero', label: 'HERO' },
  { value: 'caregiver', label: 'CAREGIVER' },
  { value: 'explorer', label: 'EXPLORER' },
  { value: 'rebel', label: 'REBEL' },
  { value: 'lover', label: 'LOVER' },
  { value: 'creator', label: 'CREATOR' },
  { value: 'jester', label: 'JESTER' },
  { value: 'sage', label: 'SAGE' },
  { value: 'magician', label: 'MAGICIAN' },
  { value: 'ruler', label: 'RULER' },
];
export const BRAND_ARCHETYPE_VALUES = BRAND_ARCHETYPES.map((t) => t.value);

const byValue = (list) => new Map(list.map((t) => [t.value, t]));
const PERFORMANCE_MAP = byValue(SCENT_PERFORMANCE);

export const SCENT_PERFORMANCE_VALUES = SCENT_PERFORMANCE.map((t) => t.value);

// ⚠️ ค่าที่ไม่รู้จัก **คืนค่าดิบ ไม่ใช่ค่าว่าง** — ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก
export const scentPerformanceLabel = (v) => PERFORMANCE_MAP.get(v)?.label || String(v ?? '') || '—';
