// ── เจ้าของกลิ่น: แจกบรีฟให้ผู้ปรุงทีละก้อน (mig 0350 · มติผู้ใช้ 2026-09-08) ──
//
// ⭐ **คนละแกนกับ `requestAssignee` (mig 0230)** — ตัวนั้นตอบว่า *ใบ* นี้อยู่ที่ใคร
// (จัดคนระดับใบ ใบละคนเดียว) · ตัวนี้ตอบว่า *กลิ่นก้อนนี้* ใครปรุง ซึ่งใบเดียวมีได้
// เท่าจำนวนบรีฟ · สองอันนี้ต้องไม่ถูกยุบรวมกัน เพราะผู้ประสานงานที่ถือใบไม่ใช่คนปรุง
//
// ⚠️ **ที่เดียวที่ตัดสินว่า "กลิ่นก้อนนี้อยู่ที่ใคร" คือ `briefPerfumer()`** — กฎเดียว
// กับที่หัวไฟล์ `assign.js` เขียนไว้: เขียนกฎถอยหลังซ้ำที่ไหนก็ตาม ตาราง คิว และ
// เอกสารจะเริ่มตอบไม่ตรงกันภายในเดือนเดียว
//
// ⚠️ **ไม่ถอยไปใช้ `pdrSignPerfumer` ของหัวใบโดยตั้งใจ** — ช่องนั้นถูกเลือกครั้งเดียว
// ทั้งใบตอนกดรับเรื่อง ⇒ ถ้าเอามาถอย กลิ่นที่ยังไม่มีใครแจกจะอ่านเหมือน "แจกแล้ว"
// ทั้งที่ไม่มีใครรับผิดชอบจริง (นี่คืออาการเดิมที่ฟีเจอร์นี้มาแก้)
// การถอยไปหาค่าหัวใบเกิดที่ **จังหวะส่งงานเท่านั้น** (`items/route.js`) ซึ่งเป็น
// จังหวะที่ต้องเขียนชื่อลงกระดาษจริง ๆ

import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';

export const MAX_PERFUMER_NAME = 200;

/**
 * กลิ่นก้อนนี้อยู่ที่ใคร — `{ id, name, assignedAt }`
 *
 * ⚠️ `name` ว่าง = **ยังไม่มีใครถือ** ไม่ใช่ "ถือโดยคนไม่มีชื่อ" · จอต้องแยกสองอย่างนี้
 * ออกจากกัน (กองที่ต้องแจกก่อนอย่างอื่น vs กองที่แจกแล้ว)
 */
export function briefPerfumer(brief = {}) {
  const name = String(brief?.perfumerName || '').trim();
  if (brief?.perfumerId || name) {
    return { id: brief?.perfumerId || null, name, assignedAt: brief?.assignedAt || null };
  }
  return { id: null, name: '', assignedAt: null };
}

/**
 * กลิ่นก้อนนี้ถูกส่งไปแล้วหรือยัง — ตัวตัดสินว่า "ยังเปลี่ยนเจ้าของได้ไหม"
 *
 * ถ้อยคำผู้ใช้ (2026-09-08): *"สามารถ เปลี่ยนได้ จนกว่า จะส่งกลิ่น"*
 *
 * ⭐ **วัดจากกลไก ไม่ใช่จากป้าย** — จังหวะที่ `createScent` เขียนชื่อผู้ปรุงลง
 * `scents."perfumerName"` แบบแช่แข็งคือจังหวะที่ direction ผลิตกลิ่นออกมาได้
 * (`producedScentId`) ⇒ หลังจากนั้นแก้ที่บรีฟไม่กระทบทะเบียนอีกแล้ว การปล่อยให้
 * แก้ต่อคือการหลอกผู้ใช้ว่าแก้ได้ทั้งที่ของจริงไม่ขยับ
 * ⚠️ เผื่อแถวเก่าที่ไม่มี `producedScentId` (ข้อมูลก่อน mig 0213) ด้วยขั้นของแถว —
 * `sent`/`done` แปลว่าของออกจากมือฝ่ายไปแล้วแน่นอน
 */
export function briefScentSent(group = {}) {
  return (group?.directions || []).some((d) => d?.scentId || d?.stage === 'sent' || d?.stage === 'done');
}

/**
 * แจกกลิ่นก้อนนี้ได้ไหม — คืนข้อความไทย หรือ `null` ถ้าผ่าน
 *
 * `perfumerId = null` แปลว่า **ถอนการแจก** (กลิ่นกลับไปกองกลางของฝ่าย) ซึ่งต้องทำได้
 * เสมอที่ยังไม่ส่ง — ไม่งั้นคนลาออก/ลาป่วยจะค้างเป็นเจ้าของกลิ่นถาวร
 *
 * ⚠️ ช่องว่างล้วน (`'   '`) = **พิมพ์พลาด ไม่ใช่การถอน** — ตัดสินด้วยความว่างเปล่า
 * อย่างเดียวเมื่อไร บั๊กช่องว่างจะกลายเป็นการถอนงานเงียบ ๆ (กติกาเดียวกับ
 * `assignRequestError`)
 */
export function assignBriefPerfumerError(request, group, { perfumerId = null, perfumerName = null } = {}) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!group) return 'ไม่พบกลิ่นก้อนนี้ในใบ';
  if (request.status === 'draft') return 'คำร้องนี้ยังไม่ถูกส่ง — ยังไม่มีอะไรให้แจก';
  /* ⚠️ อ่านจากทะเบียนสถานะ ไม่ใช่ไล่เทียบชื่อสถานะเอง — สถานะใหม่ที่เพิ่มวันหลัง
     จะได้ตกมาทาง "ปิดไปแล้ว" โดยอัตโนมัติ แทนที่จะหลุดผ่านด่านนี้เงียบ ๆ */
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return request.status === 'cancelled' ? 'คำร้องนี้ถูกยกเลิกแล้ว' : 'คำร้องนี้ปิดไปแล้ว';
  }
  if (briefScentSent(group)) {
    return 'กลิ่นก้อนนี้ส่งออกไปแล้ว — เปลี่ยนผู้ปรุงได้ที่ทะเบียนกลิ่นเท่านั้น';
  }
  if (perfumerId != null && !String(perfumerId).trim()) return 'ต้องเลือกผู้ปรุงกลิ่น';
  if (perfumerName && String(perfumerName).length > MAX_PERFUMER_NAME) {
    return `ชื่อผู้ปรุงกลิ่นยาวเกิน ${MAX_PERFUMER_NAME} ตัวอักษร`;
  }
  return null;
}

/**
 * ค่าที่จะเขียนลงแถวบรีฟ — คืน **ครบทุกช่องเสมอ** (รวม null)
 *
 * 🐞 คืนเฉพาะช่องที่มีค่าเมื่อไร การถอนการแจกจะกลายเป็น no-op เงียบ ๆ: `perfumerId`
 * ถูกล้างแต่ชื่อเดิมยังค้างอยู่ในแถว แล้วตารางยังขึ้นชื่อคนเดิม (โรคเดียวกับ
 * `assignPatch` และ `pdrTargets` ที่เคยเป็นมาแล้วทั้งคู่)
 *
 * ⚠️ `assignedAt` ต้องมาคู่กับคนถือเสมอ — CHECK ที่ฐาน (mig 0350) จะเด้งเป็น error
 * ดิบของ Postgres ถ้าหลุด
 */
export function briefPerfumerPatch({ perfumerId = null, perfumerName = null, by = null, nowIso = null } = {}) {
  const name = String(perfumerName || '').trim();
  const clear = !perfumerId && !name;
  return {
    perfumerId: clear ? null : (perfumerId || null),
    perfumerName: clear ? null : (name.slice(0, MAX_PERFUMER_NAME) || null),
    assignedAt: clear ? null : nowIso,
    assignedById: clear ? null : (by?.id ?? null),
    assignedByName: clear ? null : (by?.name ?? null),
  };
}
