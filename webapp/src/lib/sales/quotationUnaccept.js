import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';
import { fmtMoney } from '@/lib/format';

// ย้อนการรับใบเสนอราคา (un-accept — มติผู้ใช้ 2026-07-21): เครื่องมือเฉพาะกิจกรณี
// รับใบผิดก่อนมี Sale Order (มี SO อนุมัติแล้วต้องไปทางย้อน Won ของ mig 0116).
// เหตุผลบังคับ 10–500 ตัวอักษร — เกณฑ์เดียวกับ admin override (mig 0127);
// RPC (mig 0138) ตรวจซ้ำชั้น DB.
export const UNACCEPT_REASON_MIN = 10;
export const UNACCEPT_REASON_MAX = 500;

export function normalizeUnacceptReason(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function unacceptReasonError(value) {
  const reason = normalizeUnacceptReason(value);
  if (reason.length < UNACCEPT_REASON_MIN) {
    return `กรุณาระบุเหตุผลอย่างน้อย ${UNACCEPT_REASON_MIN} ตัวอักษร`;
  }
  if (reason.length > UNACCEPT_REASON_MAX) {
    return `เหตุผลต้องไม่เกิน ${UNACCEPT_REASON_MAX} ตัวอักษร`;
  }
  return '';
}

// ผู้สั่งย้อน = **เจ้าของดีลปัจจุบัน** + ผู้มีอำนาจตัดสิน (admin · CD · CM · AE Sup) — มติผู้ใช้ 2026-09-24
// ⭐ ขาเข้า Won เจ้าของดีลกดเองอยู่แล้ว (อนุมัติใบเอง 07-18 · รับใบเอง 08-24) ⇒ ขาออกไม่ต้องรอหัวหน้า
//    prod: ย้อนการรับ 16 ครั้งเป็นการแก้ใบแล้วกดรับใหม่ทุกครั้ง (ค่ากลาง 27 นาที) · ไม่มีครั้งไหนเป็นเสียลูกค้า
// ⭐ ไม่แตะ Actual — RPC ปฏิเสธเมื่อมี SO ที่ยังใช้อยู่ (0380) · SO อนุมัติแล้วยังต้องให้ผู้มีอำนาจตัดสินย้อน/ยกเลิก
//    ก่อนเสมอ (มติ 16/07 แบ่งแยกหน้าที่ถอนยอด — ไม่เปลี่ยน)
// ⚠️ ยึด deal.ownerId ไม่ใช่ขอบเขตทีม (inSalesEditScope) — senior_ae/ac/senior_ac แก้ดีลของเพื่อนร่วมทีมได้
//    แต่ย้อน Won แทนเจ้าของไม่ได้ · กติกาเดียวกับ canApproveQuotation / canIssueSalesOrderRevision
// 🐞 ข้อความเดิม "การถอยดีลออกจาก Won ต้องไม่อยู่ในมือ AE ฝ่ายเดียว" เป็นคำอธิบายของคนเขียน ไม่ใช่มติ (21/07 สั่งแค่
//    "เครื่องมือฉุกเฉิน + เหตุผลบังคับ")
export function canUnacceptQuotation(user, deal) {
  if (isSalesOrderReviewer(user?.role)) return true;
  return Boolean(user?.id) && user.id === deal?.ownerId;
}

/* ── ใบพี่น้องที่ "การรับใบนี้" ปิดไว้ → เปิดคืนตอนย้อนการรับ (มติเจ้าของ 25/09 · mig 0388) ─────────────────
 *
 * 🐞 ของเดิม: รับใบ (0361) ปิดใบอื่นในดีลเป็น 'closed' โดยไม่จำสถานะเดิม · ย้อนการรับ (0380) คืนแค่ใบหลัก
 *   ⇒ ใบพี่น้องค้าง 'closed' บนดีลที่กลับมาเปิด ไม่มีปุ่มไหนพาออก (แก้/ออก Rev./รับ/ยกเลิก ปฏิเสธใบ closed หมด)
 *   ทั้งที่โมดัลย้อนการรับชวนเองว่า "ดีลนี้ต้องปิดด้วยใบเสนอราคาอีกใบ" · ใบรออนุมัติที่ถูกปิดหลุดคิวผู้อนุมัติถาวร
 * ⭐ ตอนนี้ RPC รับใบประทับตรา metadata.closedByAccept = { quotationId, quoteNumber, prevStatus, at } ให้ทุกใบที่มันปิด
 *   และ RPC ย้อนการรับเปิดคืน **เฉพาะใบที่ตราชี้ใบนี้** กลับเป็น prevStatus แล้วลบตราทิ้ง (Rev. ก๊อป metadata ต่อ)
 * ⭐ ใบที่ปิดก่อน 0388 (ไม่มีตรา · prod 25/09 = 20 ใบ ทุกใบปิดโดยใบที่รับอยู่ตอนนี้) → เดาจากผลอนุมัติ:
 *   approved / not_required → 'sent' (= "อนุมัติแล้ว" บนจอ) · ที่เหลือ → 'draft'
 *   ⚠️ เว้นใบที่พิสูจน์ได้ว่าปิดโดยการรับของใบที่ถูกยกเลิกไปทางใบสั่งขายแล้ว (acceptedAt ของใบนั้น = updatedAt ของใบที่ปิด
 *     — RPC รับใบเขียนสองค่านี้ด้วย v_now ตัวเดียวกัน) ⇒ คงปิด ตรงกับใบที่มีตราของการรับใบอื่น (มติข้อ 4 ข้างล่าง)
 * ⛔ มติข้อ 4: **ย้อนการรับเท่านั้น** ที่เปิดใบพี่น้อง — ยกเลิก SO พร้อมย้อน Won (0170) และบังคับลบใบ/ดีลของแอดมิน
 *   (0381 → revert_deal_out_of_won) ไม่เปิด: ทาง SO ตั้งใบที่รับเป็น 'cancelled' และดีลมักเสนอราคาใหม่ทั้งชุด ·
 *   ตราของใบพวกนั้นค้างอยู่เฉย ๆ ไม่มีใครเปิดตามมันอีก (ตราชี้ใบที่ไม่ใช่ 'accepted' แล้ว)
 * ⚠️ ตัวคิดชุดนี้มีไว้ให้ **พรีวิวในโมดัล** เท่านั้น — ตัวเขียนจริงคือ SQL ใน 0388 · เทสต์
 *   unacceptReopensSiblings.test.mjs ล็อกให้สองฝั่งพูดเหมือนกัน */

// สถานะที่การรับใบปิดได้ (0361: status IN ('draft','sent','rejected')) = สถานะที่ตราพาเปิดคืนได้
export const REOPENABLE_QUOTATION_STATUSES = ['draft', 'sent', 'rejected'];

export function inferredReopenStatus(approvalStatus) {
  return approvalStatus === 'approved' || approvalStatus === 'not_required' ? 'sent' : 'draft';
}

function closedByAcceptStamp(row) {
  const stamp = row?.closedByAccept !== undefined ? row.closedByAccept : row?.metadata?.closedByAccept;
  return stamp && typeof stamp === 'object' && !Array.isArray(stamp) ? stamp : null;
}

/**
 * ใบไหนในดีลจะถูกเปิดคืนเมื่อย้อนการรับ `quote` และเปิดเป็นสถานะอะไร (กติกาเดียวกับ 0388)
 * @param quote    ใบที่กำลังย้อน ({ id })
 * @param rows     ใบทั้งหมดของดีล ({ id, quoteNumber, status, approvalStatus, acceptedAt, updatedAt,
 *                 closedByAccept | metadata.closedByAccept })
 * @returns [{ id, quoteNumber, status, approvalStatus, inferred }] เรียงตามเลขที่ใบ (ลำดับเดียวกับ RPC)
 */
export function siblingsReopenedByUnaccept(quote, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const quoteId = quote?.id;
  // การรับของใบที่ถูกยกเลิกไปแล้ว (ทางใบสั่งขาย) — เวลาที่รับ = เวลาที่ใบพี่น้องถูกปิดในทรานแซกชันเดียวกัน
  const cancelledAcceptTimes = new Set(list
    .filter((row) => row?.id !== quoteId && row?.status === 'cancelled' && row?.acceptedAt)
    .map((row) => String(row.acceptedAt)));
  return list
    .filter((row) => row?.id && row.id !== quoteId && row.status === 'closed')
    .map((row) => {
      const stamp = closedByAcceptStamp(row);
      if (stamp) {
        if (stamp.quotationId !== quoteId) return null;
      } else if (row.updatedAt && cancelledAcceptTimes.has(String(row.updatedAt))) {
        return null;
      }
      const stamped = Boolean(stamp) && REOPENABLE_QUOTATION_STATUSES.includes(stamp.prevStatus);
      return {
        id: row.id,
        quoteNumber: row.quoteNumber || null,
        status: stamped ? stamp.prevStatus : inferredReopenStatus(row.approvalStatus),
        approvalStatus: row.approvalStatus || null,
        inferred: !stamped,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.quoteNumber || a.id).localeCompare(String(b.quoteNumber || b.id), 'en'));
}

/* ป้ายสถานะที่ใบเปิดกลับไป — ภาษาเดียวกับจอใบเสนอราคา (QUOTE_STATUS_LABELS: sent = "อนุมัติแล้ว" มติ 17/08)
   แต่ร่างแยกตามแกนอนุมัติ เพราะ "ร่าง" ที่รออนุมัติอยู่กับร่างที่ถูกตีกลับ คือคนละงานของคนละคน
   ⚠️ ไม่ import ป้ายจาก components/ — ไฟล์นี้ถูก route ฝั่ง server ใช้ด้วย */
export function reopenStatusLabel({ status, approvalStatus } = {}) {
  if (status === 'sent') return 'อนุมัติแล้ว';
  if (status === 'rejected') return 'ถูกปฏิเสธ';
  if (approvalStatus === 'pending') return 'รออนุมัติ';
  if (approvalStatus === 'rejected') return 'ถูกตีกลับ';
  return 'ฉบับร่าง';
}

// ต่อท้ายทุกที่ที่บันทึกใบรุ่นเก่า (audit · เธรดดีล) — คนอ่านย้อนหลังต้องรู้ว่าสถานะนี้ "เดา" ไม่ใช่ "จำ"
export const LEGACY_REOPEN_NOTE = 'ใบปิดก่อนระบบจำสถานะเดิม — อ่านจากผลอนุมัติ';

/* ข้อความในกล่องผลลัพธ์ของโมดัลย้อนการรับ (กติกาโมดัลอนุมัติ #1223 — บอกผลก่อนกด ไม่ใช่ "แน่ใจหรือไม่")
   @param preview  ผลของ POST /unaccept?dryRun=1 ({ quoteNumber, reopen, project }) · null = พรีวิวอ่านไม่ขึ้น
   ⭐ มติ 25/09 ข้อ 2: โครงการที่ผูกไว้ (รวมที่ผูกตอนกดรับใบ) **คงอยู่** — รับใบใหม่ใช้โครงการเดิมต่อได้ทันที
     และไม่มีร่องรอยให้ถอดงานไทม์ไลน์/ของที่ย้ายตามอย่างปลอดภัย ⇒ บอกตรง ๆ ว่าคงอยู่ และย้ายได้ที่ไหน */
export function quotationUnacceptPromptDetail(preview) {
  const lines = [];
  const reopen = Array.isArray(preview?.reopen) ? preview.reopen : [];
  if (reopen.length) {
    const list = reopen.map((row) => `${row.quoteNumber || row.id} → ${reopenStatusLabel(row)}`).join(' · ');
    const queue = reopen.some((row) => row.status === 'draft' && row.approvalStatus === 'pending')
      ? ' (ใบรออนุมัติกลับเข้าคิวผู้อนุมัติ)'
      : '';
    lines.push(`ใบเสนอราคาฉบับอื่นที่ถูกปิดตอนรับใบนี้ เปิดกลับ ${reopen.length} ใบ: ${list}${queue}`);
    const legacy = reopen.filter((row) => row.inferred).map((row) => row.quoteNumber || row.id);
    if (legacy.length) {
      lines.push(`${legacy.join(', ')} ถูกปิดก่อนระบบเริ่มจำสถานะเดิม — สถานะที่เปิดกลับอ่านจากผลอนุมัติของใบ`);
    }
  } else {
    lines.push('ไม่มีใบเสนอราคาฉบับอื่นที่ต้องเปิดกลับ');
  }
  const project = preview?.project;
  // ไม่มีรหัส/ชื่อ (พรีวิวอ่านโครงการไม่ขึ้น) = พูดว่า "โครงการเดิม" — ไม่โชว์ id ดิบให้คนอ่าน
  const projectLabel = project?.code
    ? `${project.code}${project.name ? ` · ${project.name}` : ''}`
    : project?.name || '';
  lines.push(`${projectLabel ? `ดีลยังอยู่ในโครงการ ${projectLabel}` : 'ดีลยังอยู่ในโครงการเดิม'} — ย้อนการรับไม่ถอดโครงการ · ถ้าผูกผิดโครงการ ย้ายได้ที่หน้าดีล แท็บไทม์ไลน์ ปุ่ม “ย้ายไปโครงการอื่น”`);
  lines.push('หลักฐานการรับเดิมยังอยู่ในประวัติของใบ');
  return ['สิ่งที่จะเกิดขึ้นทันที:', ...lines.map((line) => `· ${line}`)].join('\n');
}

/* สรุปใน audit ต่อใบที่เปิดกลับ — route เขียนจากผลของ RPC (ไม่ใช่จากพรีวิว) */
export function quotationReopenAuditSummary(row, acceptedQuoteNumber) {
  const tail = row?.inferred ? ` (${LEGACY_REOPEN_NOTE})` : '';
  return `เปิดใบเสนอราคา ${row?.quoteNumber || row?.id || ''} กลับเป็น “${reopenStatusLabel(row)}” — ย้อนการรับ ${acceptedQuoteNumber || ''}${tail}`;
}

/* toast หลังย้อนการรับสำเร็จ — ผลจริงจากฐาน (รายการที่ RPC เปิด + FC ที่ resolver เขียน) */
export function quotationUnacceptToast(quoteNumber, { reopened = [], forecast = null } = {}) {
  const parts = [`ย้อนการรับ ${quoteNumber} แล้ว`];
  const rows = Array.isArray(reopened) ? reopened : [];
  if (rows.length) parts.push(`เปิดใบกลับ ${rows.length} ใบ (${rows.map((row) => row.quoteNumber || row.id).join(', ')})`);
  if (forecast?.warning) parts.push(`FC ยังไม่ขยับ: ${forecast.warning}`);
  else if (forecast?.changed) parts.push(`FC ${fmtMoney(forecast.previousValue)} → ${fmtMoney(forecast.value)}`);
  return parts.join(' · ');
}
