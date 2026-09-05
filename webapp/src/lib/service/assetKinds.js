// ── ทะเบียนชนิดอุปกรณ์บริการ (mig 0298 · มติ 2026-08-02 ข้อ 12-14) ─────────
//
// ⭐ ชนิดประกาศ **ที่นี่ ไม่ใช่ CHECK ใน DB** — เพิ่มชนิดใหม่ = เพิ่มรายการเดียว
// ไม่ต้องออก migration (แพตเทิร์นเดียวกับ requestTypes.js / attachmentTypes.js)
//
// 🔄 **หน่วยของแถวไม่แยกตามชนิดแล้ว** (มติผู้ใช้ 2026-09-03 · ม็อก machine-add)
//   ของเดิม (มติ 2026-08-02 ข้อ 13) แยกเป็นสองหน่วย: diffuser = 1 แถว 1 เครื่อง ·
//   ที่เหลือ = 1 แถว 1 ชุด + `qty` จำนวนจุด (AWC เครื่องกดสบู่ 242 จุด = แถวเดียว)
//   ⇒ ตอนนี้ **ทุกชนิดนับรายตัว** หนึ่งแถวคือของจริงหนึ่งชิ้นเสมอ และทุกตัวได้
//     รหัสของตัวเอง (mig 0344) เดินสถานะได้อิสระตั้งแต่วันแรก
//   ⚠️ ปิดมติที่ค้างมาตั้งแต่ 2/08 ข้อ 13 — และตรงกับชีตจริงที่มีรหัสรายตัวครบ
//     ทั้ง 242 ตัวของเครื่องกดสบู่ที่ AWC อยู่แล้ว · ตาราง `service_assets` ว่างเปล่า
//     ตอนตัดสิน ⇒ ไม่มี migration แตกแถวเดิมให้ต้องกลัว
//
// ค่าตั้งเฉพาะชนิดอยู่ใน settings jsonb — ตรวจที่ API ตามชนิด (มติข้อ 14)
// เพราะกฎขึ้นกับชนิด เขียนเป็น CHECK แล้วอ่านไม่รู้เรื่อง

export const ASSET_KINDS = ['diffuser', 'reed', 'soap', 'alcohol'];

export const ASSET_KIND_LABELS = {
  diffuser: 'เครื่องกระจายกลิ่น',
  reed: 'Reed diffuser',
  soap: 'เครื่องกดสบู่',
  alcohol: 'เครื่องกดแอลกอฮอล์',
};

/* คีย์ settings ที่แต่ละชนิดรู้จัก — คีย์แปลกปลอมถูกปัดตกที่ API เพื่อไม่ให้
 * jsonb กลายเป็นถังขยะแบบคอลัมน์ Reed ในชีตเดิม (เก็บของสี่ชนิดปนกันจนอ่านไม่ได้)
 *   diffuser: workSec/pauseSec (วินาทีพ่น/พัก เช่น 30/225) · grade (preset ของเครื่อง)
 *             · schedule (ข้อความช่วงเวลาเครื่องทำงาน เช่น 'จ-อา 07:00-19:00')
 *   reed:     sticks (จำนวนก้าน) · changeEveryDays (รอบเปลี่ยนก้าน)
 *   soap/alcohol: tankMl (ขนาดถัง) · liquidType (สบู่โฟม/เจล/แอลกอฮอล์)
 */
const SETTING_FIELDS = {
  diffuser: {
    workSec: 'posInt',
    pauseSec: 'posInt',
    grade: 'shortText',
    schedule: 'text',
  },
  reed: {
    sticks: 'posInt',
    changeEveryDays: 'posInt',
  },
  soap: {
    tankMl: 'posNumber',
    liquidType: 'shortText',
  },
  alcohol: {
    tankMl: 'posNumber',
    liquidType: 'shortText',
  },
};

const CHECKS = {
  posInt: (v) => Number.isInteger(v) && v > 0,
  posNumber: (v) => Number.isFinite(v) && v > 0,
  shortText: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 50,
  text: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 200,
};

// ตรวจ + ตัด settings ให้เหลือเฉพาะคีย์ของชนิดนั้น · คืน { value, error }
// ค่าที่ไม่ได้กรอก (undefined/null/'') = ไม่เก็บคีย์นั้นเลย ไม่ใช่เก็บค่าว่าง
export function normalizeAssetSettings(kind, raw = {}) {
  if (raw === null || raw === undefined) return { value: {}, error: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: null, error: 'ค่าตั้งเครื่องต้องเป็น object' };
  }
  const fields = SETTING_FIELDS[kind] || {};
  const value = {};
  for (const [key, checkName] of Object.entries(fields)) {
    const v = raw[key];
    if (v === undefined || v === null || v === '') continue;
    // ช่องตัวเลขจากฟอร์มมาเป็น string — แปลงก่อนตรวจ (30.5 วินาทีไม่ผ่าน posInt
    // โดยตั้งใจ ไม่ปัดให้เงียบ ๆ — ค่าที่เพี้ยนจากที่กรอกคือค่าที่ไม่มีใครกล้าเชื่อ)
    const parsed = (checkName === 'posInt' || checkName === 'posNumber') ? Number(v) : v;
    if (!CHECKS[checkName](parsed)) {
      return { value: null, error: `ค่าตั้ง "${key}" ของชนิดนี้ไม่ถูกต้อง` };
    }
    value[key] = parsed;
  }
  return { value, error: null };
}
