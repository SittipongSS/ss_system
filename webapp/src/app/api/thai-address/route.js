// ── ทะเบียน จังหวัด/อำเภอ/ตำบล สำหรับช่องที่อยู่ ────────────────────────
//
// อ่านอย่างเดียว ไม่มีข้อมูลของใครในนี้ (เป็นข้อมูลสาธารณะของกรมการปกครอง) —
// ทุก role ที่ล็อกอินอ่านได้ ต้องลงทะเบียนใน OPEN_READ_APIS ที่ proxy.js ด้วย
// ไม่งั้น non-admin โดน 403 เงียบ ๆ แล้ว dropdown จังหวัดว่างเปล่าโดยไม่มีข้อความ
// บอกสาเหตุ (บทเรียนเดียวกับ /api/company-profile)
//
// แบ่งสองคำขอโดยตั้งใจ:
//   GET /api/master/thai-address                    → จังหวัด + อำเภอ (~60KB) โหลดครั้งเดียว
//   GET /api/master/thai-address?districtCode=1001  → ตำบลของอำเภอนั้น (สิบกว่าแถว)
// ถ้ายัดตำบลทั้ง 7,452 แถวมาก้อนเดียวจะเป็น 650KB ต่อการเปิดฟอร์มลูกค้าหนึ่งครั้ง
import { provincesWithDistricts, subdistrictsOf } from '@/lib/master/thaiAdmin';

// ข้อมูลนิ่ง (เปลี่ยนปีละไม่กี่ครั้ง และเปลี่ยนพร้อม deploy เท่านั้นเพราะเป็นไฟล์ในรีโป)
// — ให้เบราว์เซอร์เก็บไว้ทั้งวัน ลดการโหลดซ้ำทุกครั้งที่เปิดฟอร์ม
const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=86400' };

export async function GET(request) {
  const districtCode = new URL(request.url).searchParams.get('districtCode');
  if (districtCode) {
    return Response.json({ subdistricts: subdistrictsOf(districtCode) }, { headers: CACHE_HEADERS });
  }
  return Response.json({ provinces: provincesWithDistricts() }, { headers: CACHE_HEADERS });
}
