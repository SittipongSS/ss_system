import { fetchAll } from './supabaseFetchAll.js';

// ── ส่งลิสต์ id เข้า .in() ทีละก้อน ไม่ให้ URL ยาวเกินจนต่อไม่ติด ────────────
//
// 🐞 **บั๊กจริง (พบ 2026-09-07):** `/api/products` ตอบ 500 `TypeError: fetch failed`
// หลังรอ ~7.7 วินาที ⇒ หน้าทะเบียนสินค้าโชว์ "ยังไม่มีสินค้าในระบบ" และ dropdown
// เลือกสินค้าทุกจอในระบบว่างเปล่า **โดยไม่มี error ให้ผู้ใช้เห็น**
//
// ต้นเหตุ: route ดึงสินค้ามาครบ (435 แถว) แล้วยิงต่อว่า
//   `.from('excise_registrations').in('productId', rows.map(p => p.id))`
// PostgREST รับตัวกรองมาทาง **query string ของ GET** ⇒ id 40 ตัวอักษร × 435 ใบ
// = ตัวกรองยาว ~17,800 ไบต์ · Node/undici ตัดที่ **16 KB ต่อบล็อกเฮดเดอร์ทั้งก้อน**
// (`--max-http-header-size` ตั้งต้น 16384) นับรวม request line + apikey +
// Authorization (JWT ยาว 219 ตัวอักษร ส่งสองครั้ง) ⇒ ซ็อกเก็ตถูกตัด แล้ว fetch
// โยน `TypeError: fetch failed` ซึ่ง supabase-js ส่งต่อมาเป็น error ธรรมดา
//
// วัดจริงกับทะเบียนสินค้าชุดปัจจุบัน:
//   300 ids | ตัวกรอง 12,314 ไบต์ |  108ms | ✓
//   370 ids | ตัวกรอง 15,184 ไบต์ | 7,688ms | ✗ TypeError: fetch failed
//   435 ids (ของจริง)              | 7,7xx ms | ✗
//
// ⚠️ **อาการโกหก 2 ชั้น** — (1) ข้อความบอกว่า "fetch failed" เหมือนเน็ตหลุด ทั้งที่
// คีย์/ฐานข้อมูลปกติดี (query เดียวกันแบบไม่มี .in() ใช้ได้ 300ms) (2) มันพังเมื่อ
// **ข้อมูลโตข้ามเส้น** ไม่ใช่ตอนดีพลอย ⇒ โค้ดที่เคยผ่านมาตลอดจะพังเองวันหนึ่ง
// โดยไม่มีใครแก้อะไรเลย
//
// ⚠️ ห้าม "แก้" ด้วยการขึ้น --max-http-header-size — Vercel คุมรันไทม์ฝั่งนั้นไม่ได้
// และเส้นก็แค่ขยับออกไป ไม่ได้หายไป

/** จำนวน id ต่อก้อน — 150 × 41 ไบต์ ≈ 6.2 KB เหลือที่ให้เฮดเดอร์อีกเท่าตัว */
export const IN_CHUNK_SIZE = 150;

/**
 * ยิง query ทีละก้อนแล้วรวมผล — แทน `.in(column, ids)` ที่ลิสต์โตได้ไม่จำกัด
 *
 * @param ids       ลิสต์ค่าที่จะกรอง (ซ้ำได้ ตัวช่วยตัดซ้ำให้)
 * @param makeQuery `(chunk) => query` — ต้องสร้าง query **ใหม่ทุกครั้ง**
 *                  (builder ของ supabase-js ยิงซ้ำไม่ได้ · เหตุผลเดียวกับ fetchAll)
 * @returns `{ data, error }` รูปเดียวกับ query ปกติ — error ตัวแรกที่เจอ
 */
export async function fetchInChunks(ids, makeQuery, { chunkSize = IN_CHUNK_SIZE } = {}) {
  const unique = [...new Set((ids || []).filter((id) => id !== null && id !== undefined))];
  if (!unique.length) return { data: [], error: null };
  const size = Math.max(1, Math.floor(chunkSize));
  const rows = [];
  for (let from = 0; from < unique.length; from += size) {
    const { data, error } = await makeQuery(unique.slice(from, from + size));
    if (error) return { data: null, error };
    rows.push(...(data || []));
  }
  return { data: rows, error: null };
}

/**
 * `fetchAll` ซ้อนใน `fetchInChunks` — ใช้กับจุดที่ทั้งสองปัญหาเจอกัน
 *
 * ⚠️ **`fetchAll` อย่างเดียวไม่ช่วยเรื่อง URL ยาว** — มันไล่ `.range()` ทีละหน้า
 * แต่ **ส่งตัวกรองก้อนเดิมไปทุกหน้า** ⇒ ถ้าลิสต์ยาวเกิน ทุกหน้าก็ยาวเกินเหมือนกัน
 * ⇒ ต้องซอยลิสต์ **ข้างนอก** แล้วค่อยไล่หน้า **ข้างใน** ตามลำดับนี้เท่านั้น
 *
 * @param ids       ลิสต์ค่าที่จะกรอง
 * @param makeQuery `(chunk) => query` — ต้องมี `.order()` ที่นิ่ง (กติกาเดียวกับ fetchAll)
 * @param sort      ตัวเปรียบเทียบสำหรับเรียงซ้ำหลังรวมก้อน
 *                  🔴 **PostgREST เรียงต่อก้อน ไม่ได้เรียงทั้งชุด** — จุดไหนที่ผลถูกใช้
 *                  ตามลำดับจริง (ไม่ใช่ยัดเข้า Map หรือหาค่ามาก/น้อยสุด) ต้องส่งมา
 * @returns ทุกแถวรวมกัน — โยน error แบบเดียวกับ `fetchAll`
 */
export async function fetchAllInChunks(ids, makeQuery, { chunkSize = IN_CHUNK_SIZE, sort = null } = {}) {
  const unique = [...new Set((ids || []).filter((id) => id !== null && id !== undefined))];
  if (!unique.length) return [];
  const size = Math.max(1, Math.floor(chunkSize));
  const rows = [];
  for (let from = 0; from < unique.length; from += size) {
    rows.push(...await fetchAll(() => makeQuery(unique.slice(from, from + size))));
  }
  return sort ? rows.sort(sort) : rows;
}

/** เรียงตามคอลัมน์ตามลำดับที่ให้มา — คู่กับ `sort` ของ fetchAllInChunks
 *  ใช้ชื่อคอลัมน์ชุดเดียวกับที่ส่งให้ `.order()` จะได้ไม่หลุดกัน */
export function byColumns(...columns) {
  return (a, b) => {
    for (const column of columns) {
      const [key, dir] = Array.isArray(column) ? column : [column, 'asc'];
      const x = a?.[key], y = b?.[key];
      if (x === y) continue;
      /* ค่าว่างไปท้ายเสมอ ไม่ว่าจะเรียงขึ้นหรือลง — PostgREST ตั้งต้น NULLS LAST */
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  };
}
