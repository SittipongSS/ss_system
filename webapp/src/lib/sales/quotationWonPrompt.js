import { quotationWonAmount } from '@/lib/sales/quotationWonAmount';

/**
 * สิ่งที่จะเกิดขึ้นทันทีเมื่อกดปิด Won ด้วยใบเสนอราคาใบนี้
 *
 * ⭐ ยกออกมาเป็นฟังก์ชันเพราะ **โมดัลยืนยันต้องบอกผลลัพธ์เสมอ** (มติ 2026-08-13 ·
 * เหตุผลเดียวกับ `approvalPrompt` ที่บังคับ `effects`) — ตั้งแต่ 2026-08-24 การปิด Won
 * ไม่มีฟอร์มหลักฐานให้กรอกแล้ว โมดัลจึงเหลือ "บอกว่าจะเกิดอะไร" เป็นเนื้อหลักของมัน
 * ถ้าปล่อยให้แต่ละหน้าเขียนเอง รายการจะไม่ครบเหมือนกันทุกครั้ง
 *
 * ⚠️ เขียนเป็นผลลัพธ์ที่ตรวจได้ ไม่ใช่คำอธิบายปุ่ม
 * คืน `[{ id, text }]` — `id` ให้หน้าจอเลือกไอคอนประจำผลลัพธ์ (ยอดเงินไม่อยู่ในลิสต์นี้
 * เพราะมันเป็น *ตัวเลขที่ต้องอ่านก่อนกด* ไม่ใช่ผลลัพธ์ ⇒ โมดัลโชว์เป็นแถวของตัวเอง)
 */
export function quotationWonEffects({ quote, deal = null, project = null, linkingProject = false } = {}) {
  const amount = quotationWonAmount(quote);
  const dealName = deal?.title ? `ดีล ${deal.title}` : 'ดีลของใบนี้';
  const projectLabel = project ? (project.code ? `${project.code} · ${project.name || ''}`.trim() : project.name || project.id) : '';

  return [
    // ผูกโครงการเป็นผลลัพธ์แรก เพราะมันเกิดก่อนการปิดจริง ๆ (route ผูกก่อนเรียก RPC)
    ...(linkingProject && projectLabel
      ? [{
        id: 'link',
        text: `${dealName} เข้าโครงการ ${projectLabel} — ไทม์ไลน์ลอยของดีลถูกรับเข้าเป็นช่วงใหม่ ไม่สร้างทับ · งาน คำร้อง และใบที่เปิดไว้ก่อนหน้าย้ายตาม`,
      }]
      : []),
    { id: 'won', text: `${dealName} เปลี่ยนเป็น Won · FC ขึ้น 100%` },
    ...(amount === 0
      // ใบ 0 บาทปิด Won ได้ (มติ 2026-08-03) — ทวนให้เห็นก่อนกด เพราะยอดนี้ทับมูลค่าดีล
      ? [{ id: 'zero', text: 'ใบนี้ยอดเป็น 0 บาท ⇒ มูลค่าปิดของดีลจะเป็น 0' }]
      : []),
    { id: 'closed', text: 'ใบเสนอราคาฉบับอื่นในดีลนี้ถูกปิด — แก้ไข / ออก Rev. ต่อไม่ได้' },
    { id: 'order', text: 'เปิดใบสั่งขายได้ — เอกสารยืนยันคำสั่งซื้อและงวดชำระกรอกที่หน้าสร้างใบสั่งขาย' },
    { id: 'undo', text: 'ย้อนการรับใบได้เฉพาะก่อนออกใบสั่งขาย และต้องระบุเหตุผล' },
  ];
}

/**
 * โครงการที่เลือกได้ตอนปิด Won — กติกาเดียวกับ `linkDealToProject` (ฝั่ง server ตรวจซ้ำ)
 *
 * ⚠️ ลิสต์ที่กรองแล้ว **ต้องบอกได้ว่าทำไมใบที่หาไม่อยู่ในลิสต์** (กฎฟอร์ม §เลือกคอนโทรล)
 * ⇒ เงื่อนไขทั้งสี่ข้อนี้ต้องตรงกับข้อความใต้ช่องเลือกในโมดัลเสมอ:
 *   ลูกค้าเดียวกับใบเสนอราคา · สายธุรกิจเดียวกับดีล · โครงการยังไม่ปิด · อยู่ในทีมของคุณ
 * (ข้อสุดท้ายกรองมาแล้วจาก /api/pm/projects ตามขอบเขตผู้ใช้)
 */
export function selectableProjectsForWon(projects, { customerId = null, line = null } = {}) {
  return (Array.isArray(projects) ? projects : []).filter((p) => {
    if (!p?.id) return false;
    if ((p.closeStatus || 'open') === 'closed') return false;
    if (customerId && p.customerId && p.customerId !== customerId) return false;
    if (customerId && !p.customerId) return false;
    if (line && p.line && p.line !== line) return false;
    return true;
  });
}
