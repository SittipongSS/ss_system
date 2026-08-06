// ── สร้างไฟล์ข้อมูล จังหวัด/อำเภอ/ตำบล ของไทย (src/data/thaiAdmin.js) ───────
//
// ที่มาข้อมูล: https://github.com/thailand-geography-data/thailand-geography-json (MIT)
//   77 จังหวัด · 928 อำเภอ · 7,436 ตำบล/แขวง พร้อมรหัสไปรษณีย์
//
// ⚠️ เคยใช้ kongvut/thai-province-data แล้ว **ถอยออกมา**: ชุดนั้นมีแขวงกรุงเทพฯ แค่
// 170 จาก 180 — ขาดแขวงที่ กทม. ประกาศแบ่งใหม่ปี 2560 (ทับช้าง/ราษฎร์พัฒนา ของ
// เขตสะพานสูง · พลับพลา/สะพานสอง/คลองเจ้าคุณสิงห์ ของเขตวังทองหลาง · บางบอนเหนือ/
// บางบอนใต้/คลองบางพราน/คลองบางบอน ของเขตบางบอน ฯลฯ) ซึ่งเป็นย่านที่ลูกค้าจริงของ
// เราอยู่ ⇒ เลือกตำบลไม่เจอ แล้วต้องพิมพ์เองทั้งที่เพิ่งทำ dropdown มา
//
// ⭐ ทำไมต้อง "แปลงแล้วคอมมิตไฟล์" ไม่ใช่ดึงสด/ลง npm package:
//   • ทะเบียนที่อยู่ต้องใช้ได้ตอน build/ตอน offline — ข้อมูลนี้เปลี่ยนปีละไม่กี่ครั้ง
//   • ต้นทางเป็นตารางแบน 3 ไฟล์ (1.8MB) มีฟิลด์ที่ไม่ใช้ — แปลงแล้วซ้อนชั้นให้ค้น
//     ได้ตรง ๆ ไม่ต้อง join เอง
//
// ── รหัสที่ใช้ = รหัสมาตรฐานกรมการปกครอง (TIS-1099) ──
//   จังหวัด 2 หลัก (10 = กรุงเทพฯ) · อำเภอ 4 หลัก · ตำบล 6 หลัก — ต้นทางให้มาตรง ๆ
//
// ── ชื่อเก็บเป็น "ชื่อเปล่า" ไม่มีคำนำหน้า ──
//   ต้นทางไม่ใส่คำนำหน้าอยู่แล้ว (ตรวจซ้ำในสคริปต์) — คำนำหน้า เขต/อำเภอ/แขวง/ตำบล
//   เป็นหน้าที่ของ thaiAddress.js ฝั่งเดียว (districtPrefix/subdistrictPrefix)
//
// วิธีใช้ (ต้องต่อเน็ต): node scripts/build-thai-admin.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE = 'https://raw.githubusercontent.com/thailand-geography-data/thailand-geography-json/main/src';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outFile = path.join(root, 'src', 'data', 'thaiAdmin.js');

const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };

async function fetchJson(name) {
  const res = await fetch(`${SOURCE}/${name}.json`);
  if (!res.ok) fail(`ดึง ${name}.json ไม่สำเร็จ (HTTP ${res.status})`);
  return res.json();
}

const [provinces, districts, subdistricts] = await Promise.all(
  ['provinces', 'districts', 'subdistricts'].map(fetchJson),
);

// คำนำหน้าติดมากับชื่อเมื่อไหร่ = ต้นทางเปลี่ยนรูป และจะได้ที่อยู่ "เขตเขตบางนา"
// ตอนประกอบข้อความ — ล้มตั้งแต่ตอน build ดีกว่าไปเจอบนใบกำกับภาษี
const PREFIXED = /^(เขต|อำเภอ|กิ่งอำเภอ|แขวง|ตำบล|จังหวัด)/;
const bare = (name, label) => {
  const text = String(name || '').trim();
  if (PREFIXED.test(text)) fail(`${label} "${text}" มีคำนำหน้าติดมาด้วย — ต้นทางเปลี่ยนรูปแล้ว`);
  return text;
};

const zip = (value) => String(value || '').padStart(5, '0');

const subsByDistrict = new Map();
for (const sub of subdistricts) {
  const list = subsByDistrict.get(String(sub.districtCode)) || [];
  list.push({
    code: String(sub.subdistrictCode),
    th: bare(sub.subdistrictNameTh, 'ตำบล'),
    en: String(sub.subdistrictNameEn || '').trim(),
    zip: zip(sub.postalCode),
  });
  subsByDistrict.set(String(sub.districtCode), list);
}

const districtsByProvince = new Map();
for (const district of districts) {
  const list = districtsByProvince.get(String(district.provinceCode)) || [];
  list.push({
    code: String(district.districtCode),
    th: bare(district.districtNameTh, 'อำเภอ'),
    en: String(district.districtNameEn || '').trim(),
    subdistricts: (subsByDistrict.get(String(district.districtCode)) || [])
      .sort((a, b) => a.th.localeCompare(b.th, 'th')),
  });
  districtsByProvince.set(String(district.provinceCode), list);
}

const data = provinces.map((province) => {
  const code = String(province.provinceCode);
  const list = districtsByProvince.get(code);
  if (!list?.length) fail(`จังหวัด "${province.provinceNameTh}" ไม่มีอำเภอเลย`);
  return {
    code,
    th: bare(province.provinceNameTh, 'จังหวัด'),
    en: String(province.provinceNameEn || '').trim(),
    districts: list.sort((a, b) => a.th.localeCompare(b.th, 'th')),
  };
}).sort((a, b) => a.th.localeCompare(b.th, 'th'));

const totals = data.reduce((acc, p) => {
  acc.districts += p.districts.length;
  acc.subdistricts += p.districts.reduce((n, d) => n + d.subdistricts.length, 0);
  return acc;
}, { districts: 0, subdistricts: 0 });

if (data.length !== 77) fail(`ได้จังหวัด ${data.length} รายการ (คาด 77) — ต้นทางเปลี่ยนรูปแล้ว`);
if (totals.districts < 920 || totals.subdistricts < 7400) fail(`จำนวนอำเภอ/ตำบลน้อยผิดปกติ: ${JSON.stringify(totals)}`);
// กรุงเทพฯ 50 เขต 180 แขวง — ตัวเลขที่ชุดข้อมูลเก่าตกไป 10 แขวง (ดูหัวไฟล์)
const bangkok = data.find((p) => p.code === '10');
const bangkokSubs = bangkok.districts.reduce((n, d) => n + d.subdistricts.length, 0);
if (bangkok.districts.length !== 50 || bangkokSubs !== 180) {
  fail(`กรุงเทพฯ ได้ ${bangkok.districts.length} เขต / ${bangkokSubs} แขวง (คาด 50/180)`);
}

// เขียนเป็นโมดูล .js ไม่ใช่ .json — JSON import ต้องใช้ import attributes ซึ่ง
// unit test ที่รันด้วย raw Node กับ bundler ตีความไม่ตรงกัน (ไฟล์นี้ถูก import
// จาก lib/master/thaiAdmin.js ที่มีเทสต์ของตัวเอง)
await writeFile(
  outFile,
  '// ⚠️ ไฟล์นี้ถูกสร้างอัตโนมัติ — ห้ามแก้มือ · สร้างใหม่: node scripts/build-thai-admin.mjs\n'
  + `// ที่มา: ${SOURCE} (MIT)\n`
  + `export default ${JSON.stringify(data)};\n`,
  'utf8',
);
console.log(`✓ ${path.relative(root, outFile)} — ${data.length} จังหวัด · ${totals.districts} อำเภอ · ${totals.subdistricts} ตำบล (กรุงเทพฯ ${bangkokSubs} แขวง)`);
