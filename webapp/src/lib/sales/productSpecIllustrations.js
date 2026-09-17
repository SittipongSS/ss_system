// ── ภาพประกอบของใบสเปคสินค้า — ตัวจัดลำดับตัวกลาง (FM-SA-04) ────────────────
//
// ⭐ ไฟล์แนบกับ **ตัวสินค้า** (`entityType='product'` · `docType='spec_illustration'`)
// ตามมติ 2026-09-17 "ภาพประกอบอยู่กับสเปคสินค้า" · ลำดับกับคำบรรยายอยู่ใน
// `attachments.metadata` (`sortOrder` · `caption`)
//
// ⚠️ **จอกับเอกสารต้องเรียงเหมือนกันเป๊ะ** — ถ้าเรียงคนละที่คนละกติกา ลำดับที่คนจัด
// บนจอจะไม่ตรงกับที่พิมพ์ออกมา แล้วไม่มีใครรู้ว่าอันไหนถูก ⇒ ที่นี่เป็นที่เดียว
//
// ⚠️ ไฟล์เก่าที่อัปก่อนมีฟีเจอร์นี้ **ไม่มี `sortOrder`** ⇒ ถอยไปเรียงตามวันที่อัป
// แล้วต่อด้วย id เพื่อให้ลำดับนิ่ง (ไม่นิ่ง = พิมพ์สองครั้งได้ลำดับต่างกัน)
export const ILLUSTRATION_CAPTION_MAX = 200;

const orderOf = (row) => {
  const raw = row?.metadata?.sortOrder;
  const value = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
};

export function sortIllustrations(items = []) {
  return [...items].sort((a, b) => {
    const left = orderOf(a);
    const right = orderOf(b);
    // แถวที่มีลำดับมาก่อนแถวที่ยังไม่เคยจัดลำดับ
    if (left !== right) {
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    }
    const byDate = String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''));
    if (byDate !== 0) return byDate;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

/** คำบรรยายที่จะพิมพ์ — ตัดช่องว่างหัวท้ายและเพดานความยาวที่เดียว */
export function illustrationCaption(row) {
  return String(row?.metadata?.caption || '').trim().slice(0, ILLUSTRATION_CAPTION_MAX);
}
