import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client using the SERVICE ROLE key.
// NEVER import this into client components — the service role key bypasses RLS.
let _admin = null;

export function getSupabaseAdmin() {
  if (_admin) return _admin;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase env missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).'
    );
  }

  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: guardedFetch },
  });
  return _admin;
}

/* ── ยามความยาว URL ของ PostgREST ────────────────────────────────────────────
   🐞 2026-09-07: `/api/products` ตอบ 500 `TypeError: fetch failed` หลังรอ 7.7 วิ
   ⇒ ทะเบียนสินค้าและ dropdown เลือกสินค้าทุกจอว่างเปล่า **โดยไม่มี error ให้เห็น**
   ต้นเหตุคือ `.in('productId', <435 ไอดี>)` ⇒ ตัวกรองยาว ~17,800 ไบต์
   แต่ Node/undici ตัดที่ 16 KB **ต่อบล็อกเฮดเดอร์ทั้งก้อน** (request line + apikey
   + Authorization ซึ่งเป็น JWT ยาว) ⇒ ซ็อกเก็ตถูกตัด แล้วโยน TypeError ดิบ ๆ ออกมา

   ⚠️ ข้อความ "fetch failed" ชี้ไปผิดทางสองชั้น — อ่านเหมือนเน็ตหลุด/คีย์พัง ทั้งที่
   ฐานข้อมูลปกติดี และมันพังตอน **ข้อมูลโตข้ามเส้น** ไม่ใช่ตอนดีพลอย ⇒ โค้ดที่เคย
   ผ่านมาตลอดจะพังเองวันหนึ่งโดยไม่มีใครแก้อะไร

   ระบบมี `.in()` 182 จุดที่ป้อนลิสต์จาก `.map()` และตารางที่เกินเส้นแล้วมี 6 ตัว
   (notifications 6,193 · project_tasks 5,725 · personal_tasks 1,320 ·
   customers 523 · products 435 · sales_deals 420) ⇒ ไล่แก้ทีละจุดไม่จบ
   ยามตรงนี้จึงเปลี่ยน "พังเงียบหลัง 8 วินาที" ให้เป็น **error ที่บอกตารางและความยาว**
   ทันที ที่จุดเดียวคุมทั้งระบบ · ทางแก้ของแต่ละจุดคือ `fetchInChunks`
   (src/lib/supabaseInChunks.js) */
export const POSTGREST_URL_LIMIT = 14000;

export async function guardedFetch(input, init) {
  const href = typeof input === 'string' ? input : input?.url || String(input);
  if (href.length > POSTGREST_URL_LIMIT) {
    const table = href.match(/\/rest\/v1\/([^?]+)/)?.[1] || '(ไม่ทราบตาราง)';
    const filter = href.slice(href.indexOf('?') + 1).match(/([\w.]+)=in\./)?.[1];
    throw new Error(
      `Supabase URL ยาว ${href.length} ไบต์ เกินเพดาน ${POSTGREST_URL_LIMIT} — ตาราง ${table}`
      + (filter ? ` ตัวกรอง ${filter}=in.(…)` : '')
      + ' · ลิสต์ที่ส่งเข้า .in() ยาวเกินไป ให้ยิงทีละก้อนด้วย fetchInChunks()'
      + ' (src/lib/supabaseInChunks.js) — ถ้าปล่อยไว้ undici จะตัดซ็อกเก็ตแล้วโยน'
      + ' "TypeError: fetch failed" หลังรอ ~8 วินาที ซึ่งอ่านไม่ออกว่าเกิดจากอะไร',
    );
  }
  return fetch(input, init);
}
