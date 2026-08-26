// ── แยกของบนไดรฟ์เป็นสามกอง: มีคนอ้าง · โฟลเดอร์โครงสร้าง · กำพร้า ────────────
//
// แยกออกมาจาก driveMaintenance.js เพราะที่นั่น `import 'server-only'` และคุย Google
// ตั้งแต่ import ⇒ ทดสอบตรง ๆ ไม่ได้ · ตรงนี้เป็นตรรกะล้วน ไม่มี IO จึงเทสต์ได้
//
// ⭐ **สามกองต้องบวกกันได้เท่าที่ไล่มา** — ตัวเลขบนหน้าจอเคยบอกแค่ "ไล่ 586 · มีคน
// อ้าง 359 · ไม่มีใครอ้าง 46" ซึ่งบวกกันไม่ครบ (หายไป 181) แล้วคนอ่านนึกว่าจัดครบ
// ทุกตัวแล้ว · ของที่หายไปคือโฟลเดอร์ที่ตั้งใจข้าม จึงต้องรายงานเป็นกองที่สาม
// ไม่ใช่ปล่อยเงียบ (ผู้ใช้ทัก 2026-08-26)

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * @param {Array} items ของทั้งหมดบนไดรฟ์ (ไฟล์ + โฟลเดอร์) จาก Drive API
 * @param {Set<string>} refs id ที่มีแถวในฐานข้อมูลอ้างถึง
 * @param {Set<string>} structureFolderNames ชื่อโฟลเดอร์โครงสร้างที่ระบบสร้างเอง
 * @returns {{scanned:number, referenced:number, keptFolders:number, orphans:Array}}
 */
export function classifyDriveItems(items = [], refs = new Set(), structureFolderNames = new Set()) {
  const byId = new Map(items.map((f) => [f.id, f]));
  const hasChildren = new Set(items.flatMap((f) => f.parents || []));
  const pathOf = (item) => {
    const parts = [];
    let cur = item;
    for (let i = 0; i < 12 && cur; i += 1) {
      parts.unshift(cur.name);
      cur = byId.get(cur.parents?.[0]);
    }
    return parts.join(' / ');
  };

  const orphans = [];
  let referenced = 0;
  let keptFolders = 0;

  for (const item of items) {
    if (refs.has(item.id)) { referenced += 1; continue; }
    const isFolder = item.mimeType === DRIVE_FOLDER_MIME;
    // โฟลเดอร์ของโครงสร้าง (ลูกค้า/ขอราคา/งานขาย/...) และโฟลเดอร์ที่ยังมีของข้างใน
    // ไม่ใช่ขยะ — ตัวที่ควรเก็บกวาดคือ "กล่องเปล่าที่ไม่มีใครอ้าง"
    if (isFolder && (structureFolderNames.has(item.name) || hasChildren.has(item.id))) {
      keptFolders += 1;
      continue;
    }
    orphans.push({
      id: item.id,
      name: item.name,
      kind: isFolder ? 'โฟลเดอร์ว่าง' : 'ไฟล์',
      path: pathOf(item),
      sizeBytes: Number(item.size) || null,
      modifiedTime: item.modifiedTime || null,
    });
  }
  orphans.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));

  return { scanned: items.length, referenced, keptFolders, orphans };
}
