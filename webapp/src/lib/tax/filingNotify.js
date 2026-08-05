// แจ้งเตือนการส่งต่อใบยื่นชำระภาษีข้ามเลน SA ↔ LG
// การตัดสินใจว่า "เปลี่ยนมือหรือยัง / ถึงคิวใคร" อยู่ใน filingHandoff.js (ไม่มี dependency
// เพื่อให้เทสต์ได้) ที่นี่เหลือแค่ประกอบการ์ดกับยิงเข้า space
import { chatCard, sendChat } from '@/lib/chat';
import { fmtMoney } from '@/lib/format';
import { filingHandoffTarget } from '@/lib/tax/filingHandoff';

export function notifyFilingHandoff({ before, after, user }) {
  const handoff = filingHandoffTarget(before, after);
  if (!handoff) return;
  sendChat(handoff.space, chatCard({
    title: handoff.title,
    subtitle: `${after.id} · ${after.customerName || ''}`.trim(),
    rows: [
      { label: 'ใบสั่งขาย / อ้างอิง', value: after.poReference || after.quotationRef },
      { label: 'ยอดที่เรียกเก็บ', value: after.amountToCollect ? `${fmtMoney(after.amountToCollect)} บาท` : null },
      { label: 'ค่าภาษีรวม', value: after.totalTax ? `${fmtMoney(after.totalTax)} บาท` : null },
      { label: 'เหตุผล', value: after.status === 'rejected' ? after.rejectionReason : null },
      { label: 'ผู้ดำเนินการ', value: user?.name },
      { label: 'ขั้นถัดไป', value: handoff.next },
    ],
    linkPath: `/tax/filings/${after.id}`,
    linkLabel: 'เปิดใบยื่น',
  }));
}
