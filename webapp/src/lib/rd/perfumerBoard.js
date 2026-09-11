// ── ตารางงานผู้ปรุงกลิ่น — หนึ่งแถวคือหนึ่งกลิ่น ไม่ใช่หนึ่งใบ (มติผู้ใช้ 2026-09-08) ──
//
// ⭐ **หน่วยของตารางนี้คือ "กลิ่น" ต่างจากทุกคิวในระบบที่หน่วยเป็น "ใบ"** — ภาระจริง
// ของฝ่ายคือจำนวนกลิ่นที่ต้องปรุง และใบเดียวมีได้ถึง 4 ก้อนแจกให้คนละคน (วัดจาก
// production 2026-09-08) ⇒ ตารางที่นับเป็นใบตอบไม่ได้เลยว่าใครถืออะไรอยู่
//
// ⚠️ **ประกอบที่ lib ไม่ใช่ใน JSX** — กฎหลังบั๊กรางซ้ำ (#1033) · และเพราะเป็น
// ฟังก์ชันบริสุทธิ์ เทสต์จึงยิงได้โดยไม่ต้องมีจอและไม่ต้องแตะฐาน
//
// ⚠️ **ไม่เขียนกฎ "ใครถือกลิ่นนี้" ซ้ำที่นี่** — อ่านผ่าน `briefBoard()` ซึ่งเรียก
// `briefPerfumer()` ให้แล้ว · เขียนกฎซ้ำเมื่อไร ตารางนี้กับหน้าใบจะเริ่มตอบไม่ตรงกัน
import { briefBoard } from '@/lib/requests/briefBoard';
import { assignBriefPerfumerError, briefScentSent } from '@/lib/requests/briefPerfumer';
import { liveDueDate } from '@/lib/requests/dueRound';
import { requestClosureStarted } from '@/lib/requests/closure';

/* คีย์ของกองที่ยังไม่มีใครปรุง — ต้องเป็นคีย์จริง ไม่ใช่ null เพราะมันเป็น "แถวหนึ่ง"
   ในตารางเดียวกับคน (และเป็นกองที่หัวหน้าต้องจัดการก่อนอย่างอื่น)
   ⚠️ ค่าเดียวกับ `FACET_NONE` ของคิวคำร้อง — บทเรียนจาก ม-107 ที่เคยประกาศคีย์ของ
   ตัวเองแล้วกดแล้วได้ตารางว่างทั้งที่ตัวเลขข้าง ๆ บอกว่ามีของ */
export const UNASSIGNED = '__none';
export const UNASSIGNED_LABEL = 'ยังไม่แจก';

/**
 * แถวของตาราง — บรีฟหนึ่งก้อน พร้อมบริบทของใบที่มันอยู่
 *
 * ⚠️ ก้อน "ยังไม่ผูกบรีฟ" (`id === null`) ถูกตัดออก — มันคือแถว direction กำพร้าจาก
 * ข้อมูลเก่า ไม่ใช่กลิ่นที่แจกได้ · ยอดของมันยังอ่านได้จากหน้าใบตามเดิม
 */
export function perfumerBoardRows(requests = []) {
  const out = [];
  for (const request of requests || []) {
    const groups = briefBoard(request?.briefs || [], request?.items || []);
    for (const group of groups) {
      if (!group.id) continue;
      const sent = briefScentSent(group);
      out.push({
        briefId: group.id,
        label: group.label,
        brief: group.brief,
        requestId: request.id,
        docNo: request.docNo || null,
        title: request.title || null,
        customerName: request.customerName || null,
        customerArCode: request.customerArCode || null,
        status: request.status || null,
        // กำหนดที่ฝ่ายรับปากไว้ ถ้ายังไม่แจ้งวันให้ถอยไปวันที่ผู้ขอต้องการ — ตารางนี้
        // ต้องเรียงตาม "ต้องเสร็จเมื่อไร" ได้เสมอ ไม่ใช่ว่างเปล่าจนกว่าจะมีคนแจ้งวัน
        // ⚠️ ผ่าน `liveDueDate` — วันของรอบที่ส่งไปแล้วไม่ใช่คำสัญญาของรอบนี้ (กติกา dueReaders)
        dueDate: liveDueDate(request) || request.requestedDueDate || null,
        committed: !!liveDueDate(request),
        // มีฝั่งปิดแล้ว = ไม่ใช่งานที่ "เลยกำหนด" (ม-145 · ตัวตัดสินเดียวกับคิว)
        closureStarted: requestClosureStarted(request),
        perfumer: group.perfumer,
        // ⭐ ตัวตัดสินว่าปุ่มแจกกดได้ไหม — โชว์เสมอ บอกเหตุตอนกด (กฎ UI ของระบบ)
        sent,
        /* ⚠️ **เหตุที่แจกไม่ได้มาจากด่านตัวเดียวกับที่ API ใช้ปฏิเสธจริง** — คิด
           เงื่อนไขขึ้นเองตรงจุดที่วางปุ่มเมื่อไร วันหนึ่งปุ่มกับด่านจะพูดคนละเรื่อง
           (กติกาของ `GatedAction`) · เรียกด้วยค่าว่างทั้งคู่ = ถามว่า "ถอนการแจก
           ตอนนี้ได้ไหม" ซึ่งกินเฉพาะด่านสถานะใบ + ด่านส่งกลิ่นแล้ว ไม่ปนด่านค่าที่กรอก */
        blocker: assignBriefPerfumerError(request, group, {}) || '',
        directions: group.summary?.total || 0,
        untouched: group.untouched,
      });
    }
  }
  return out;
}

/** คีย์ของคนที่ถือแถวนี้ — ใช้ทั้งจัดกลุ่มและกรอง ต้องมาจากที่เดียวกันเสมอ */
export const rowPerfumerKey = (row) => row?.perfumer?.id || (row?.perfumer?.name
  ? row.perfumer.name.toLocaleLowerCase('th-TH')
  : UNASSIGNED);

/**
 * จัดกลุ่มตามผู้ปรุง — กอง "ยังไม่แจก" **ขึ้นก่อนเสมอ**
 *
 * ⚠️ ต่างจากตาราง "งานค้างรายคน" ของหน้าภาพรวมที่ดันกองไร้เจ้าของไปท้าย — ที่นั่น
 * ตอบคำถาม *"ใครถือเยอะสุด"* ส่วนที่นี่ตอบ *"เหลืออะไรให้แจก"* ซึ่งเป็นงานของหัวหน้า
 * ที่เปิดหน้านี้ ⇒ ของที่ต้องลงมือต้องอยู่บนสุด
 */
export function perfumerGroups(rows = [], { todayIso = null } = {}) {
  const map = new Map();
  for (const row of rows) {
    const key = rowPerfumerKey(row);
    const bucket = map.get(key) || {
      key,
      name: key === UNASSIGNED ? UNASSIGNED_LABEL : (row.perfumer?.name || 'ผู้ปรุงกลิ่น'),
      unassigned: key === UNASSIGNED,
      rows: [],
      overdue: 0,
    };
    bucket.rows.push(row);
    if (isOverdue(row, todayIso)) bucket.overdue += 1;
    map.set(key, bucket);
  }
  const all = [...map.values()];
  for (const bucket of all) bucket.total = bucket.rows.length;
  const named = all.filter((b) => !b.unassigned)
    .sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name, 'th'));
  return all.filter((b) => b.unassigned).concat(named);
}

/* เลยกำหนดแล้วหรือยัง — เทียบวันไทยที่ผู้เรียกส่งมา
   ⚠️ ตัวสร้างแถวไม่มีสิทธิ์รู้ว่า "วันนี้" คือวันไหน (กติกาเดียวกับ `rowIdleStamps`)
   ⚠️ กลิ่นที่ส่งไปแล้วไม่เลยกำหนด แม้วันจะผ่านมานานแค่ไหน — งานจบไปแล้ว */
export function isOverdue(row, todayIso) {
  if (!row?.dueDate || !todayIso || row.sent || row.closureStarted) return false;
  return String(row.dueDate).slice(0, 10) < String(todayIso).slice(0, 10);
}

/**
 * ยอดเหนือตาราง — สี่ตัวที่หัวหน้าถามทุกเช้า
 *
 * ⚠️ **นับเป็นกลิ่นทั้งสี่ช่อง** — ปนหน่วยเมื่อไรคือสิ่งที่ทำให้คนเลิกเชื่อตัวเลข
 * ทั้งแถบ (บทเรียนจากแถบตัวเลขของหน้า /rd ที่เคยมีสองแถบนับคนละหน่วย)
 */
export function perfumerBoardTotals(rows = [], { todayIso = null } = {}) {
  return {
    scents: rows.length,
    unassigned: rows.filter((r) => rowPerfumerKey(r) === UNASSIGNED).length,
    overdue: rows.filter((r) => isOverdue(r, todayIso)).length,
    sent: rows.filter((r) => r.sent).length,
  };
}

/**
 * เรียงแถวในกลุ่ม — ใกล้ครบกำหนดก่อน · ไม่มีวันไปท้าย · กลิ่นที่ส่งแล้วท้ายสุด
 *
 * ⚠️ ปิดท้ายด้วย `briefId` เสมอ เพื่อให้ลำดับนิ่งเมื่อค่าอื่นเท่ากัน — ไม่งั้นแถวจะ
 * สลับที่กันเองทุกครั้งที่โหลดใหม่ แล้วคนอ่านจะนึกว่ามีอะไรเปลี่ยน
 */
export function compareBoardRows(a, b) {
  if (a.sent !== b.sent) return a.sent ? 1 : -1;
  const ad = a.dueDate || '', bd = b.dueDate || '';
  if (!ad !== !bd) return ad ? -1 : 1;
  if (ad !== bd) return ad < bd ? -1 : 1;
  return String(a.briefId).localeCompare(String(b.briefId));
}
