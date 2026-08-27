/* ── อ่านสคีมาจาก PostgREST ให้ด่านตรวจต่าง ๆ ใช้ร่วมกัน ────────────────────
 *
 * 🐞 **บั๊กจริง (2026-08-26):** ทั้ง `check:columns` และ `check:refs` ยิง `/rest/v1/`
 * แล้วพิมพ์แค่ `อ่าน schema ไม่สำเร็จ: 401` — **ทิ้ง body ของคำตอบ** ซึ่งมีสาเหตุอยู่ครบ
 * วันนั้น Supabase ตอบ `PGRST303 · JWT issued at future` มาให้ตั้งแต่แรก แต่ไม่มีใครเห็น
 * ⇒ CI ค้างแดงสามรอบ กว่าจะยิงเองด้วยมือถึงรู้ว่าเป็นเรื่องนาฬิกา/คีย์ ไม่ใช่โค้ดใน PR
 *
 * ด่านที่บอกแค่ว่า "พัง" โดยไม่บอกว่าพังเพราะอะไร ทำให้คนเดาว่าเป็นความผิดของตัวเอง
 * ก่อนเสมอ — ซึ่งเป็นการเดาที่แพงที่สุดเมื่อของจริงอยู่นอกโค้ด
 *
 * ⚠️ ห้ามพิมพ์ตัวคีย์ลง log — CI เก็บ log ไว้และคนอ่านได้กว้างกว่าคนที่ถือคีย์
 */

/** แปลรหัสของ PostgREST เป็นสิ่งที่ต้องไปทำต่อ — เดาไม่ออกจากตัวรหัสเอง */
const HINTS = {
  PGRST303: 'โทเคนถูกออก "ในอนาคต" เทียบกับนาฬิกาของ Supabase'
    + ' — ออกคีย์ใหม่ หรือตรวจนาฬิกาเครื่อง/โปรเจกต์ ไม่ใช่แก้โค้ดใน PR',
  PGRST301: 'โทเคนหมดอายุหรือไม่ถูกต้อง — ตรวจ SUPABASE_SERVICE_ROLE_KEY',
};

const statusHint = (status) => {
  if (status === 401 || status === 403) {
    return 'คีย์ใช้ไม่ได้ — ต้องเป็น service role key (anon key อ่านสคีมาไม่ได้)'
      + ' ตรวจ SUPABASE_SERVICE_ROLE_KEY ทั้งใน .env.local และ GitHub Secrets';
  }
  if (status >= 500) return 'ฝั่ง Supabase ตอบไม่ได้ — ลองใหม่อีกครั้งก่อนโทษโค้ด';
  return null;
};

/** แปลคำตอบที่ล้มเหลวเป็นข้อความที่อ่านแล้วรู้ว่าต้องไปทำอะไร
 *  แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อ **เทสต์ข้อความได้โดยไม่ต้องมีเน็ต** — ข้อความคือ
 *  ทั้งหมดของสิ่งที่ไฟล์นี้มีไว้แก้ ถ้าไม่ล็อกไว้ มันจะค่อย ๆ กลับไปเป็น "401" เฉย ๆ อีก
 *  @returns { detail, hint } — `detail` = ฐานว่าอะไร · `hint` = ต้องไปทำอะไรต่อ */
export function describeSchemaError(status, raw = '') {
  let detail = String(raw).slice(0, 300);
  let hint = statusHint(status);
  try {
    const body = JSON.parse(raw);
    const parts = [body.code, body.message, body.details, body.hint].filter(Boolean);
    if (parts.length) detail = parts.join(' · ');
    if (body.code && HINTS[body.code]) hint = HINTS[body.code];
  } catch { /* ไม่ใช่ JSON — ใช้ข้อความดิบที่ตัดไว้แล้ว */ }
  return { detail, hint };
}

/**
 * @param url  SUPABASE_URL
 * @param key  service role key (ไม่ถูกพิมพ์ลง log ไม่ว่ากรณีใด)
 * @param label ชื่อด่านที่เรียก ใช้ขึ้นต้นข้อความ
 * @returns spec ของ OpenAPI — ถ้าอ่านไม่ได้จะพิมพ์สาเหตุแล้ว `process.exit(1)`
 */
export async function fetchSchema({ url, key, label = 'อ่านสคีมา' }) {
  let res;
  try {
    res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  } catch (error) {
    console.error(`${label}ไม่สำเร็จ: ต่อ ${url} ไม่ได้ — ${error.message}`);
    process.exit(1);
  }

  if (!res.ok) {
    /* อ่าน body ให้ได้ก่อนเสมอ — นี่คือทั้งหมดของบั๊กที่ไฟล์นี้มีไว้แก้
       body อาจไม่ใช่ JSON (เช่น หน้า error ของ proxy) จึงถอยไปพิมพ์ข้อความดิบแบบตัดสั้น */
    const raw = await res.text().catch(() => '');
    const { detail, hint } = describeSchemaError(res.status, raw);

    console.error(`${label}ไม่สำเร็จ: HTTP ${res.status}`);
    if (detail) console.error(`  จากฐาน: ${detail}`);
    if (hint) console.error(`  ต้องทำ: ${hint}`);
    process.exit(1);
  }

  try {
    return await res.json();
  } catch (error) {
    console.error(`${label}ไม่สำเร็จ: คำตอบไม่ใช่ JSON — ${error.message}`);
    process.exit(1);
  }
}
