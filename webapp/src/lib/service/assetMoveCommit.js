// ── ลงมือสั่งย้าย/เปลี่ยนสถานะเครื่อง — ทางเขียนเดียว (server เท่านั้น) ─────────
//
// ⭐ ยกออกมาจาก `POST /api/service/assets/[id]/moves` ตอนที่มีทางเข้าที่สอง: นัดถอนเครื่อง
//   ที่ปิดแล้วต้องถอนเครื่องออกจากไซต์ **ด้วยคำสั่งเดียวกัน** (`lib/service/visitRetrieval.js`)
//   ⚠️ ถ้าปล่อยให้แต่ละที่เขียน insert+update เอง กฎ "ทุกการเปลี่ยนสถานะต้องมีแถวประวัติ"
//      จะเหลือแค่ความตั้งใจของคนเขียน — เส้น "เปลี่ยนเครื่อง" ในผลรายเครื่องคือตัวอย่างจริง
//      (เขียน `status: 'removed'` ตรง ๆ ไม่มีแถวประวัติเลย)
//
// ⚠️ **ไม่ตรวจด่าน** — ผู้เรียกต้องผ่าน `assetMoveError` มาแล้ว (ด่านต้องได้บริบทสิทธิ์ของ
//    ผู้เรียก ซึ่งต่างกันระหว่างหน้าเครื่องกับนัด) · ไฟล์นี้รับประกันแค่ **ลำดับการเขียน**
// ⚠️ แยกไฟล์จาก `assetMoves.js` เพราะไฟล์นั้นถูก import ฝั่งเบราว์เซอร์ด้วย
import { genId } from '@/lib/id';
import { assetMovePatch, assetMoveRow } from './assetMoves';

/**
 * เขียนแถวประวัติ แล้วตอกค่าลงตัวเครื่อง — คืน `{ asset, move }` หรือ `{ error, status }`
 *
 * ⚠️ **ไม่มีทรานแซกชันในชั้นนี้** (ทุก route ของโมดูลยิงทีละคำสั่ง) — เขียนประวัติก่อน
 *   แล้วค่อยตอกค่าลงเครื่อง · ถ้าคำสั่งที่สองล้ม จะเหลือแถวประวัติที่ไม่ตรงกับตัวเครื่อง
 *   ซึ่ง **อ่านออกว่าผิด** (ไทม์ไลน์บอกว่าย้ายแล้วแต่หัวใบยังอยู่ที่เดิม) — ดีกว่าลำดับ
 *   กลับกันที่จะได้เครื่องย้ายแล้วไม่มีประวัติ ซึ่งเงียบสนิทและตามกลับไม่ได้
 *   ⚠️ เพราะเหตุผลเดียวกัน error ของ update **ไม่ลบแถวประวัติทันที** — error อาจเกิดหลัง
 *     ฐานเขียนไปแล้ว (คำตอบหายระหว่างทาง) · ลบเมื่อ **รู้แน่ว่าไม่ได้เขียน** เท่านั้น:
 *     0 แถว หรืออ่านเครื่องกลับมาแล้วยังเป็นค่าเดิมทุกช่องที่คำสั่งจะเปลี่ยน
 *   🐞 ไม่อ่านกลับ = แถวค้างของคำสั่งที่ไม่เกิดจริง · นัดถอนใช้แถวประวัติเป็นตัวบอกว่า
 *     "ถอนแล้ว" ⇒ แถวค้างทำให้การลองใหม่ข้ามเครื่องนั้นไปตลอด (เครื่องค้างที่ไซต์ถาวร)
 *
 * @param guard ตัวกรองเพิ่มของ optimistic update (นอกจาก `status` เดิม) — เช่นนัดถอน
 *              ส่ง `{ siteId }` มาด้วย: เครื่องที่ถูกย้ายไปไซต์อื่นระหว่างทางต้องไม่ถูกถอน
 */
export async function commitAssetMove(supabase, {
  asset, kind, input = {}, fromSite = null, toSite = null, user = null, guard = {},
} = {}) {
  const patch = assetMovePatch(asset, kind, input);
  const row = assetMoveRow(asset, kind, input, { fromSite, toSite });

  const { data: move, error: moveError } = await supabase
    .from('service_asset_moves')
    .insert({
      id: genId('SVM'),
      ...row,
      createdById: user?.id || null,
      createdByName: user?.name || user?.email || null,
    })
    .select('*').maybeSingle();
  if (moveError) return { error: moveError.message, status: 500 };

  /* optimistic guard — กันสองคนสั่งพร้อมกัน (คนหนึ่งย้าย อีกคนส่งซ่อม)
     คำสั่งที่มาทีหลังต้องเด้ง ไม่ใช่เขียนทับเงียบ ๆ */
  let query = supabase
    .from('service_assets')
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', asset.id).eq('status', asset.status);
  for (const [column, value] of Object.entries(guard || {})) query = query.eq(column, value);
  const { data: after, error: updateError } = await query.select('*').maybeSingle();
  if (updateError) {
    if (await stillUnmoved(supabase, asset, patch)) await dropMove(supabase, move.id);
    return { error: updateError.message, status: 500 };
  }
  if (!after) {
    // ลบแถวประวัติที่เพิ่งเขียนทิ้ง — คำสั่งไม่ได้เกิดขึ้นจริง
    await dropMove(supabase, move.id);
    return { error: 'สถานะเครื่องเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่', status: 409 };
  }
  return { asset: after, move, row };
}

/* อ่านเครื่องกลับมา — ยังเป็นค่าเดิมทุกช่องที่คำสั่งจะเปลี่ยน = รู้แน่ว่าไม่ได้เขียน
   ⚠️ อ่านไม่ได้ (เน็ตยังหลุดอยู่) = **ไม่รู้** ⇒ ตอบ false แล้วคงแถวประวัติไว้ตามเจตนาเดิม */
async function stillUnmoved(supabase, asset, patch) {
  const { data, error } = await supabase
    .from('service_assets').select('*').eq('id', asset.id).maybeSingle();
  if (error || !data) return false;
  return Object.keys(patch).every((column) => String(data[column] ?? '') === String(asset[column] ?? ''));
}

async function dropMove(supabase, moveId) {
  const { error } = await supabase.from('service_asset_moves').delete().eq('id', moveId);
  // ลบไม่สำเร็จไม่ใช่เหตุให้ตอบผิด — แต่ต้องมีร่องรอยให้ตามได้ ไม่ใช่กลืนเงียบ
  if (error) console.error('[asset-move] ลบแถวประวัติของคำสั่งที่ไม่เกิดจริงไม่สำเร็จ:', moveId, error.message);
}
