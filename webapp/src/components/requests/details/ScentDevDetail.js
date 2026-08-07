"use client";
// ── เนื้อหน้ารายละเอียด · พัฒนากลิ่น (P3b · ม-34) ────────────────────────
//
// ⭐ **1 หัวข้อ = 1 component** — สิ่งที่ทำให้ *"แต่ละหัวข้อจุดประสงค์ไม่เหมือนกัน"*
// เป็นจริงเชิงโครงสร้าง ไม่ใช่เชิงตั้งใจ · เพิ่มของเฉพาะหัวข้อนี้ = แก้ไฟล์นี้ไฟล์เดียว
// ไม่ต้องไปแทรก `kind === 'scent_dev'` กลางหน้าที่ทุกหัวข้อใช้ร่วมกัน
//
// หัวข้อนี้ต่างจากตัวอื่นสามอย่าง:
//   1 **แบบฟอร์ม PDR** (FM-RD-01) แทนช่องรายละเอียดธรรมดา
//   2 **โครงสามชั้น** — บรีฟรายกลิ่น (AE เขียนตอนเปิด) → direction (RD สร้างตอนส่ง)
//   3 **กระทบยอดกับใบสั่งขาย** — คอนเฟิร์มแล้วกี่ กก. เทียบกับที่ขายไป
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import BriefBoard from "@/components/requests/BriefBoard";
import PdrForm from "@/components/requests/PdrForm";
import PdrSummary from "@/components/requests/PdrSummary";
import RequestRows from "./RequestRows";
import styles from "./details.module.css";

export default function ScentDevDetail({
  request, board, briefSummary, reconcile, reconcileTone, reconcileText,
  canEditAttachments, saving,
  pdrDraft, onPdrDraftChange, onPdrEdit, onPdrSave, onPdrCancel, onOpenDocument,
}) {
  return (
    <>
      {/* ⭐ กระทบยอดกับใบสั่งขาย — **เตือน ไม่บล็อก** (มติผู้ใช้)
          ส่งเกิน SO เกิดได้จริง (แถมให้ลูกค้าเลือก) และส่งขาดก็เกิดได้ · บล็อกเมื่อไร
          คนจะเลี่ยงด้วยการ *ไม่บันทึกจำนวน* ซึ่งแย่กว่าตัวเลขที่ไม่ตรงมาก เพราะตอนนั้น
          ระบบจะไม่รู้อะไรเลยแทนที่จะรู้ว่าไม่ตรง */}
      {reconcile && reconcileText && (
        <StatusNotice tone={reconcileTone}>{reconcileText}</StatusNotice>
      )}

      <RequestRows rows={request.items || []} canEditAttachments={canEditAttachments} />

      {/* ⭐ ตารางสรุปทั้งใบ (แบบหน้าจอ §07) — "สถานการณ์ตอนนี้" ส่วน PDR คือ
          "ที่ขอไว้ตอนแรก" · ตารางนี้ไม่มีปุ่ม ปุ่มอยู่ท้ายเธรดที่เดียว (ม-49) */}
      <BriefBoard groups={board} />

      <div className={styles.summaryBar}>
        <span><strong>{briefSummary.briefs}</strong> บรีฟ</span>
        {reconcile && <span><strong>{reconcile.ordered}</strong> กลิ่นตาม SO</span>}
        <span><strong>{briefSummary.directions}</strong> direction ที่ส่งแล้ว</span>
        {/* ⚠️ นับ **ก้อนที่ยังไม่มี direction เลย** ไม่ใช่ก้อนที่ยังไม่จบ — คำถามที่ RD
            ถามตัวเองคือ "เหลือบรีฟไหนที่ยังไม่ได้ลงมือ" */}
        {briefSummary.untouched > 0 && (
          <span data-tone="warn"><strong>{briefSummary.untouched}</strong> บรีฟที่ยังไม่ได้ลงมือ</span>
        )}
        {/* ⭐ สองขั้นที่ "ค้างโดยไม่มีใครเห็น" ได้ง่ายที่สุด — รอลูกค้าตอบคือรอข้างนอก
            ส่วนรอใส่ราคาคือของที่จบกับลูกค้าแล้วแต่ยังปิดใบไม่ได้ */}
        {briefSummary.waitingCustomer > 0 && (
          <span><strong>{briefSummary.waitingCustomer}</strong> รอลูกค้าตอบ</span>
        )}
        {briefSummary.awaitingPrice > 0 && (
          <span data-tone="warn"><strong>{briefSummary.awaitingPrice}</strong> รอใส่ราคา</span>
        )}
        {reconcile && reconcileText && (
          <span data-tone={reconcileTone}>{reconcileText}</span>
        )}
      </div>

      {/* ⭐ PDR แบบอ่าน — วางเหนือเธรด เพราะ RD หยิบงานแล้วต้องอ่านบรีฟก่อนคุย */}
      <div className={styles.pdrBlock}>
        {pdrDraft ? (
          <>
            <PdrForm
              value={pdrDraft.pdr} onChange={(pdr) => onPdrDraftChange({ ...pdrDraft, pdr })}
              briefs={pdrDraft.briefs}
              onBriefsChange={(briefs) => onPdrDraftChange({ ...pdrDraft, briefs })}
              disabled={saving}
            />
            <div className={`action-bar ${styles.pdrActions}`}>
              <Button variant="quiet" disabled={saving} onClick={onPdrCancel}>ยกเลิก</Button>
              <Button tone="primary" disabled={saving} onClick={onPdrSave}>บันทึกแบบฟอร์ม</Button>
            </div>
          </>
        ) : (
          <>
            <PdrSummary request={request} briefs={request.briefs || []} />
            {/* ⚠️ ปุ่มโผล่ตาม `_canEditPdr` ที่ **server คำนวณ** — หน้าจอไม่มี user.id
                จึงตัดสินเองไม่ได้ (บทเรียนเดียวกับ `_canApprove`) */}
            {request._canEditPdr && (
              <div className={`action-bar ${styles.pdrActions}`}>
                {/* ⚠️ "ดูฉบับที่ออกจริง" ไม่ใช่ "ดาวน์โหลด" — ฉบับที่ออกเป็น HTML
                    เหมือน QT/SO ไม่ใช่ไฟล์ที่โหลดลงเครื่อง */}
                <Button variant="quiet" onClick={onOpenDocument}>ดูฉบับที่ออกจริง</Button>
                <Button variant="quiet" disabled={saving} onClick={onPdrEdit}>แก้แบบฟอร์ม PDR</Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
