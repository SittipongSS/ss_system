// ── สแตมป์ของข้อมูลที่แดชบอร์ดขายคิดจาก ────────────────────────────────────
//
// แดชบอร์ดรวมยอดจาก `sales_deals` + `sales_targets` แล้ว cache ไว้ 5 นาที (endpoint นี้
// เคยเป็นตัวกิน Active CPU อันดับ 1 ของระบบ — 1.4K ครั้ง/12 ชม. จนโควตา Fluid CPU
// ฟรีเต็มทั้งเดือน · TTL คือสิ่งที่ซื้อโควตานั้นกลับมา ห้ามถอด)
//
// ⭐ สแตมป์ทำให้ "สดทันทีที่ข้อมูลเปลี่ยน" อยู่ร่วมกับ "ไม่คิดใหม่ถ้าไม่มีอะไรเปลี่ยน"
// ได้พร้อมกัน: ยิงคำถามเล็ก ๆ สองครั้งก่อนตอบ ถ้าค่าเท่าเดิมก็คืนของใน cache ทันที
//
// ⚠️ **ต้องมีทั้ง "เวลาแก้ล่าสุด" และ "จำนวนแถว"** — `updatedAt` ไม่ขยับตอน **ลบ**
// ⇒ ลบดีลทิ้งแล้วสแตมป์เท่าเดิม แดชบอร์ดจะยังนับดีลที่ไม่มีอยู่แล้วต่อไปจนครบ TTL
//
// ⚠️ ชื่อผู้ดูแล (จาก `loadUserDirectory`) ไม่ได้อยู่ในสแตมป์ — เปลี่ยนชื่อคนแล้วป้าย
// บนแดชบอร์ดช้าได้ถึง 5 นาที ซึ่งรับได้ · การเอาทุกอย่างเข้าสแตมป์แปลว่ายิงคำถาม
// เพิ่มทุกครั้งเพื่อของที่แทบไม่เคยเปลี่ยน

// 📏 **วัดจริงบนฐานข้อมูลจริง (25/08/69 · deals 333 แถว · targets 131 แถว)**
//   สแตมป์ (2 คำถามขนานกัน)      ≈ 70 ms
//   สร้างใหม่ (deals+targets+users) ≈ 200 ms
// ⇒ จ่ายราว 1 ใน 3 ของการสร้างใหม่ เพื่อแลกกับ "สดทันที" · ตอน cache hit เดิมจ่าย 0
// แต่ได้ของเก่านานถึง 5 นาทีแบบที่ F5 ไม่ช่วย ซึ่งคือเรื่องที่ผู้ใช้ร้องมา
// ⚠️ ตัวเลขนี้เป็น I/O wait เกือบทั้งหมด ไม่ใช่ CPU — โควตา Active CPU ที่ TTL ซื้อมา
// จึงยังอยู่ครบ (นั่นคือเหตุผลที่ไม่ลด TTL ลงแทน)

/** คีย์ prefix ของ cache แดชบอร์ด — ใช้ร่วมกับ `bumpStamp` */
export const DASHBOARD_CACHE_PREFIX = 'sales-dashboard';

/** รวมค่าที่อ่านได้จากตารางหนึ่งให้เป็นข้อความสั้น ๆ (ฟังก์ชันล้วน — เทสต์ได้ตรง ๆ) */
export function tableStamp(latestUpdatedAt, rowCount) {
  return `${latestUpdatedAt || '-'}#${rowCount ?? '-'}`;
}

/** รวมสแตมป์ของทุกตารางที่แดชบอร์ดอ่าน */
export function combineStamps(parts) {
  return parts.join('/');
}

/**
 * ถามสแตมป์จาก DB — คำถามละหนึ่ง round trip ต่อหนึ่งตาราง
 * (`limit(1)` + `count: 'exact'` ได้ทั้งเวลาแก้ล่าสุดและจำนวนแถวในคำขอเดียว)
 *
 * ⚠️ อ่านไม่ได้ = คืน null ⇒ `bumpStamp` จะไม่ทำอะไรเลย แล้วระบบถอยไปใช้ TTL
 * ตามเดิม — แดชบอร์ดพังเพราะคำถามเสริมไม่ได้เด็ดขาด
 */
export async function loadDashboardStamp(supabase) {
  const stampOf = async (table) => {
    const { data, count, error } = await supabase
      .from(table)
      .select('updatedAt', { count: 'exact' })
      .order('updatedAt', { ascending: false })
      .limit(1);
    if (error) throw error;
    return tableStamp(data?.[0]?.updatedAt, count);
  };
  try {
    return combineStamps(await Promise.all([stampOf('sales_deals'), stampOf('sales_targets')]));
  } catch (error) {
    console.warn('[dashboard] อ่านสแตมป์ไม่สำเร็จ — ถอยไปใช้ TTL ตามเดิม', error?.message);
    return null;
  }
}
