// ── ไซต์เกิดได้ทางเดียว: ใบคำร้อง "ประเมินพื้นที่" (มติผู้ใช้ 2026-08-30) ──────
//
// ⭐ **ทำไมต้องมียาม** — "ห้ามสร้างผ่านทะเบียนไซต์" เป็นกติกาเชิงกระบวนการ ไม่ใช่กติกา
// ที่โค้ดบังคับตัวเองได้: ปุ่ม "เพิ่มไซต์" กลับมาได้ด้วยการเติม JSX สามบรรทัด และ
// จะดูสมเหตุสมผลมากสำหรับคนที่ไม่รู้มติ (หน้าทะเบียนของ entity อื่นทุกหน้ามีปุ่มนั้น)
//
// ⚠️ ยามนี้ตรวจ **ฝั่งจอ** เท่านั้น — API ยังรับ POST ได้ตามปกติ เพราะฟอร์มในใบคำร้อง
// ยิงเส้นเดียวกัน · ที่กันคือ "ทางเข้าใหม่บนจอ" ไม่ใช่ตัว endpoint
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');

/* จอที่ **ห้าม** มีทางสร้างไซต์ — ไล่ทั้งการเรียกฟอร์มและการยิง POST เอง
   (สองแบบนี้คือทางกลับมาที่เป็นไปได้จริงทั้งคู่) */
const NO_CREATE = [
  ['app/service/sites/page.js', 'ทะเบียนไซต์'],
  ['app/service/intake/page.js', 'งานเข้าใหม่ (SO → ไซต์)'],
  ['components/service/IntakeWizard.js', 'วิซาร์ดรับใบสั่งขาย'],
];

test('🔴 หน้าทะเบียนไซต์และงานเข้าใหม่ ต้องไม่มีทางสร้างไซต์', () => {
  for (const [rel, label] of NO_CREATE) {
    const src = read(rel);
    assert.ok(
      !/ServiceSiteModal[\s\S]{0,400}site=\{null\}/.test(src),
      `${label} (${rel}): เปิดฟอร์มไซต์โหมดสร้างอยู่ — ไซต์ต้องเกิดจากใบคำร้องเท่านั้น`,
    );
    assert.ok(
      !/apiFetch\(\s*["'`]\/api\/service\/sites["'`]\s*,\s*\{[\s\S]{0,120}POST/.test(src)
      && !/apiJson\(\s*["'`]\/api\/service\/sites["'`]/.test(src),
      `${label} (${rel}): ยิง POST /api/service/sites เอง — ไซต์ต้องเกิดจากใบคำร้องเท่านั้น`,
    );
  }
});

test('⭐ ฟอร์มในใบคำร้องยังเป็นทางเกิดของไซต์ — ยามข้างบนต้องไม่เผลอปิดทางนี้ด้วย', () => {
  const src = read('components/requests/SurveySiteFields.js');
  assert.match(src, /apiJson\(\s*["'`]\/api\/service\/sites["'`]/);
  assert.match(src, /ServiceSiteModal/);
});

/* ⚠️ **การนำเข้าชีตเก่ายังสร้างไซต์ได้** (มติผู้ใช้ 2026-08-30: "เหลือไว้") — เป็นงาน
   ย้ายข้อมูลเก่าครั้งเดียว ไม่ใช่การสร้างงานใหม่รายวัน และแคบด้วย canImportServiceData
   อยู่แล้ว · เขียนไว้ที่นี่เพื่อให้คนอ่านยามนี้ไม่ไปถอดเส้นนั้นทิ้งด้วยความหวังดี */
test('การนำเข้าชีตเก่ายังสร้างไซต์ได้ตามมติ — ไม่ใช่ของหลุด', () => {
  assert.match(read('lib/service/importRepo.js'), /insertRowWithComposedCode/);
});
