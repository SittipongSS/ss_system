// In-memory cache for API list data, shared across client-side navigations
// (this module loads once per browser session). Enables a stale-while-
// revalidate pattern: pages show cached data instantly, then refresh in the
// background — so re-opening a menu feels instant instead of showing a spinner.
export const apiCache = new Map();

// เวลาที่ fetch ล่าสุดต่อ URL + request ที่กำลังบินอยู่ (dedupe ตอนหลาย component
// mount พร้อมกันแล้วขอ URL เดียวกัน)
const fetchedAt = new Map();
const inflight = new Map();

// บันทึกข้อมูลเข้า cache พร้อม timestamp — ให้ cachedFetchJson นับว่าสดแล้ว
export function primeCache(url, data) {
  apiCache.set(url, data);
  fetchedAt.set(url, Date.now());
}

// fetch แบบมี TTL: ถ้าเพิ่ง fetch ภายใน ttlMs คืนของเดิมโดยไม่ยิง network เลย —
// ใช้กับ master data ที่หลายหน้าเรียกซ้ำ (products/customers/product-types/
// holidays/assignable-users) เพื่อลดจำนวน function invocation ฝั่ง Vercel และ
// ภาระ DB. ข้อมูลที่ต้องสดเสมอ (รายการเอกสาร/ดีล) ให้ fetch ตรงตามเดิม.
export async function cachedFetchJson(url, ttlMs = 2 * 60 * 1000) {
  const at = fetchedAt.get(url);
  if (apiCache.has(url) && at && Date.now() - at < ttlMs) return apiCache.get(url);
  if (inflight.has(url)) return inflight.get(url);
  const request = fetch(url)
    .then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `โหลดข้อมูลไม่สำเร็จ (${r.status})`);
      const json = await r.json();
      primeCache(url, json);
      return json;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}
