// ── การจัดกลุ่มแถวในเธรด (หัวเรื่อง + คำตอบที่ซ้อนใต้) ────────────────────
//
// แยกออกมาจาก UpdateThread เพราะกติกาตรงนี้ตัดสิน "เรื่องเดียวกันคืออะไร" ซึ่ง
// ผิดแล้วอ่านไม่ออกทันที และเป็นตรรกะล้วนที่เทสต์ตรง ๆ ได้
//
// สองกลไกที่ทำงานคู่กัน:
//   1) `meta.quotedId` — คนกดตอบกลับข้อความไหน (ซ้อนชั้นเดียว มติ 2026-07-27)
//   2) `threadKey`     — เรื่องเดียวกันแม้มาจากคนละตาราง เช่นงานหนึ่งใบที่ทำให้เกิด
//      "สร้างงาน" (เหตุการณ์ในเธรดนี้) + ความคืบหน้าที่ยืมมาจากเธรดของงาน +
//      "งานเสร็จ/เลยกำหนด" — ปล่อยไว้จะกลายเป็นหัวเรื่องใหม่ทุกแถวของงานใบเดียว
import { quotedIdOf } from './updateQuote';

/** คีย์เรื่องของแถวหนึ่ง — เธรดอ่านจาก meta.taskId · รายการที่ยืมมาส่ง threadKey มาเอง */
export function threadKeyOf(item) {
  if (!item) return null;
  if (item.kind === 'own') {
    const taskId = item.row?.meta?.taskId;
    return taskId ? `task:${taskId}` : null;
  }
  return item.threadKey || null;
}

/**
 * @param timeline แถวทั้งหมดเรียงตามเวลาแล้ว (own + extra ปนกัน)
 * @param byId     Map ของแถวในเธรดนี้ ใช้ไล่หาต้นเรื่องของคำตอบ
 * @param order    'asc' | 'desc' — ทิศของหัวเรื่องระดับบนสุด
 * @returns { roots, repliesOf }
 */
export function groupThreadItems(timeline, { byId = new Map(), order = 'asc' } = {}) {
  const rootIdOf = (row) => {
    let cur = row;
    for (let hop = 0; hop < 20; hop += 1) {   // กันวงวนถ้าข้อมูลเพี้ยน
      const parentId = quotedIdOf(cur);
      const parent = parentId ? byId.get(parentId) : null;
      if (!parent) return cur.id;             // แม่ไม่อยู่ในเธรด = ตัวเองเป็นต้นเรื่อง
      cur = parent;
    }
    return cur.id;
  };

  // หัวกลุ่มของแต่ละคีย์ = แถวที่เก่าที่สุด (คือตอนสร้างงาน)
  // ⚠️ เทียบเวลาเอง ไม่ใช่หยิบตัวแรกที่เจอ — เธรดเรียง desc/asc ต่างกัน
  const headOfKey = new Map();
  for (const item of timeline) {
    const key = threadKeyOf(item);
    if (!key) continue;
    const cur = headOfKey.get(key);
    if (!cur || String(item.at || '') < String(cur.at || '')) headOfKey.set(key, item);
  }

  const groups = new Map();
  const tops = [];
  for (const item of timeline) {
    const head = headOfKey.get(threadKeyOf(item) || '');
    const rootId = head ? head.id : (item.kind === 'own' ? rootIdOf(item.row) : item.id);
    if (rootId === item.id) { tops.push(item); continue; }
    const list = groups.get(rootId) || [];
    list.push(item);
    groups.set(rootId, list);
  }
  // ⚠️ คำตอบเรียงเก่า→ใหม่เสมอแม้เธรดหลักจะเรียงใหม่ก่อน เพราะในกลุ่มคนอ่านเป็น
  // บทสนทนา ไม่ใช่ไล่ดูของใหม่
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  }

  /* ⚠️ กลุ่มที่มีคีย์เรียงตาม **ความเคลื่อนไหวล่าสุดในกลุ่ม** ไม่ใช่เวลาที่สร้าง —
     ไม่งั้นงานที่เปิดไว้สองเดือนแล้วเพิ่งคืบหน้าวันนี้จะจมท้ายเธรด ทั้งที่มันคือ
     ความเคลื่อนไหวล่าสุดของดีล · คำตอบของคนยังยึดตำแหน่งของต้นเรื่องเหมือนเดิม */
  const sortAt = (root) => {
    if (!threadKeyOf(root)) return String(root.at || '');
    return (groups.get(root.id) || []).reduce(
      (max, r) => (String(r.at || '') > max ? String(r.at || '') : max),
      String(root.at || ''),
    );
  };
  tops.sort((a, b) => (order === 'desc'
    ? sortAt(b).localeCompare(sortAt(a))
    : sortAt(a).localeCompare(sortAt(b))));

  return { roots: tops, repliesOf: groups };
}
