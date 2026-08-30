// ── ชุดข้อมูล จังหวัด/อำเภอ/ตำบล ของไทย (ฝั่ง server) ────────────────────
//
// ตัวข้อมูลอยู่ที่ src/data/thaiAdmin.js (~650KB, 77 จังหวัด · 930 อำเภอ ·
// 7,452 ตำบล) สร้างด้วย scripts/build-thai-admin.mjs จาก kongvut/thai-province-data
//
// ⚠️ **ห้าม import ไฟล์นี้ใน client component** — 650KB จะติดไปกับ bundle ของทุก
// หน้าที่แตะฟอร์มลูกค้า หน้าจอดึงผ่าน /api/master/thai-address แทน ซึ่งส่ง
// จังหวัด+อำเภอ (ราว 60KB) ครั้งเดียวแล้วค่อยขอตำบลรายอำเภอตอนเลือก
//
// logic ที่ใช้ร่วมกับ client (คำนำหน้า/ประกอบข้อความ/แยกข้อความ) อยู่ที่
// lib/master/thaiAddress.js ซึ่งไม่มีตัวข้อมูลติดมาด้วย
import 'server-only';
import DATA from '@/data/thaiAdmin';
import { buildAddressIndex } from '@/lib/master/thaiAddress';

// index สร้างครั้งเดียวต่อ process (โมดูลถูก cache อยู่แล้ว) — ตำบล 7 พันแถว
// สร้างใหม่ทุก request จะกินเวลาเปล่าโดยที่ข้อมูลไม่เคยเปลี่ยนระหว่างรัน
let cached = null;

export function buildThaiAdminIndex() {
  if (!cached) cached = buildAddressIndex(DATA);
  return cached;
}

// จังหวัด + อำเภอ (ไม่มีตำบล) — ก้อนที่ฟอร์มโหลดครั้งเดียวตอนเปิด
export function provincesWithDistricts() {
  return DATA.map((p) => ({
    code: p.code,
    th: p.th,
    en: p.en,
    districts: p.districts.map((d) => ({ code: d.code, th: d.th, en: d.en })),
  }));
}

// ตำบลของอำเภอหนึ่ง — ขอตอนผู้ใช้เลือกอำเภอแล้วเท่านั้น
export function subdistrictsOf(districtCode) {
  const district = buildThaiAdminIndex().byDistrictCode.get(String(districtCode ?? ''));
  if (!district) return [];
  return district.subdistricts.map((s) => ({ code: s.code, th: s.th, en: s.en, zip: s.zip }));
}

/* ชื่อจังหวัด (ไทย/อังกฤษ) → แถวจังหวัดในทะเบียน — คืน null ถ้าไม่รู้จัก
   ⭐ ใช้กับ **ข้อมูลนำเข้า** ที่มีแต่ชื่อจังหวัดเป็นข้อความ (ชีตเก่าของงานบริการ)
   ⚠️ ตัดคำนำหน้า "จังหวัด"/"จ." ให้ก่อน เพราะชีตจริงเขียนปนกันทั้งสองแบบ
   ⚠️ **ไม่เดา** — สะกดผิดคือไม่รู้จัก ผู้เรียกต้องรายงานให้คนไปแก้ ไม่ใช่เลือกตัวที่
      คล้ายที่สุด (จังหวัดผิดในรหัสไซต์แก้ทีหลังไม่ได้ เพราะรหัสถูกตรึงตั้งแต่วันสร้าง) */
export function findProvinceByName(name) {
  const raw = String(name ?? '').trim().replace(/^(จังหวัด|จ\.)\s*/, '').replace(/\s+/g, ' ');
  if (!raw) return null;
  const key = raw.toLowerCase();
  for (const province of buildThaiAdminIndex().provinces) {
    if (province.th === raw || String(province.en).toLowerCase() === key) return province;
  }
  return null;
}

// ตรวจว่ารหัส/ชื่อที่ client ส่งมาเป็นของจริง แล้วคืน "ชื่อจากทะเบียน" ทับค่าที่ส่งมา
// — client แก้ payload ได้เสมอ และชื่อที่เพี้ยนจะไปโผล่บนใบกำกับภาษี
// คืน null เมื่อรหัสไม่มีในทะเบียน (ผู้เรียกตัดสินเองว่าจะปฏิเสธหรือปล่อยเป็นข้อความเปล่า)
export function resolveAddressParts({ provinceCode, districtCode, subdistrictCode } = {}) {
  const index = buildThaiAdminIndex();
  const sub = subdistrictCode ? index.bySubdistrictCode.get(String(subdistrictCode)) : null;
  const district = index.byDistrictCode.get(String(sub?.districtCode ?? districtCode ?? ''));
  const province = index.byProvinceCode.get(String(district?.provinceCode ?? provinceCode ?? ''));
  if (!province) return null;
  return {
    province: province.th,
    provinceCode: province.code,
    district: district?.th || '',
    districtCode: district?.code || '',
    subdistrict: sub?.th || '',
    subdistrictCode: sub?.code || '',
    zip: sub?.zip || '',
  };
}
