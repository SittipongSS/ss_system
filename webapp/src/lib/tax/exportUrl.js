// ── URL ของการโหลดรายงานภาษี — ตัวประกอบเดียวของทุกปุ่มโหลด ────────────────
//
// แยกออกจาก component เพราะเป็นตรรกะล้วน (เทสต์ตรงได้ · ตัว component มี JSX
// ซึ่ง test runner ของโปรเจกต์นี้อ่านไม่ได้)

/** เพดานความยาว URL ที่ยังปลอดภัยกับเบราว์เซอร์/พร็อกซีทุกตัว */
export const MAX_DOWNLOAD_URL = 1800;

/**
 * ประกอบ query ของการโหลด
 *
 * ⚠️ ค่าว่างต้องไม่กลายเป็นพารามิเตอร์เปล่า — `?status=` ที่ server อ่านเป็น
 * "กรองด้วยสถานะว่าง" จะได้ผลลัพธ์ 0 แถวโดยที่จอบอกว่ามีข้อมูล
 *
 * ⚠️ `docTypes` ส่งเฉพาะตอนเลือกไม่ครบ — ครบทุกชนิดคือค่าตั้งต้นของ server อยู่แล้ว
 * ⇒ URL สั้นลงและไม่ผูกกับลำดับของลิสต์
 *
 * @returns {{ url: string, tooLong: boolean }} `tooLong` = ยาวเกินจนอาจถูกตัดเงียบ ๆ
 */
export function buildExportUrl({ type, params = {}, ids = [], format = null, docTypes = null, allDocTypeCount = 0 } = {}) {
  const p = new URLSearchParams({ type });
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      p.set(k, v.join(','));
    } else {
      p.set(k, String(v));
    }
  }
  if (format) p.set('format', format);
  if (ids.length) p.set('ids', ids.join(','));
  if (docTypes && docTypes.length && docTypes.length < allDocTypeCount) {
    p.set('docTypes', docTypes.join(','));
  }
  const url = `/api/tax/reports?${p.toString()}`;
  return { url, tooLong: url.length > MAX_DOWNLOAD_URL };
}

/* ── แปลงสถานะของ "คิว" เป็นตัวกรองที่ server เข้าใจ ───────────────────────
 * ชิปบนคิวมีสองตัวที่ไม่ใช่สถานะจริง:
 *   `all`  — ไม่กรอง
 *   `mine` — "รอฉันลงมือ" คิดจาก **ตำแหน่งของผู้ใช้** (ownedStages) ฝั่ง server
 *            ไม่มีตัวกรองคู่กัน ⇒ ส่งเป็นชุดสถานะที่เลนนั้นเป็นเจ้าของแทน
 */
export function queueStatusParam(chip, ownedStatuses = []) {
  if (!chip || chip === 'all') return null;
  if (chip === 'mine') return ownedStatuses.length ? ownedStatuses : null;
  return chip;
}

/**
 * id ที่ต้องส่งไปกับการโหลด
 *
 * ⚠️ ลำดับความสำคัญ: **ที่ติ๊กเลือกไว้ชนะเสมอ** · ไม่ได้เลือกแต่มีคำค้น = ส่ง id ของ
 * แถวที่เห็นบนจอ (คำค้นไม่มีคู่ฝั่ง server) · ไม่เลือกไม่ค้น = ปล่อยให้ server กรองเอง
 * จากตัวกรอง ซึ่งสั้นกว่าและรับจำนวนแถวได้ไม่จำกัด
 */
export function queueExportIds({ selected, visibleIds = [], searching = false } = {}) {
  const picked = selected instanceof Set ? [...selected] : (selected || []);
  if (picked.length) return picked;
  if (searching) return [...visibleIds];
  return [];
}
