"use client";
/* ── โมดัล "เงินเข้า" ของงวด: แจ้งชำระ + สลิป · แนบหลักฐานเพิ่ม (รื้อ SO + บัญชี PR-5 · มติเจ้าของ 09/11 ข้อ 3 "ดูก่อน เพิ่มทีหลัง") ──────
   ⭐ **หนึ่งฟอร์ม สองทางเรียก** (AGENTS.md) — ยกมาจากแผงงวดบนหน้าใบ (`SalesOrderPaymentPanel`) ทุกตัวอักษร แล้วให้สองที่เรียกตัวนี้:
     · แผงงวดบนหน้าใบ (ทุกคน · รวมบัญชีที่บันทึกรับชำระขั้นเดียว — `prompt` ของผลลัพธ์รับรอง)
     · ลิ้นชักรายงวดของหน้ารายการใบสั่งขาย (ฝ่ายขาย · "ชุดเงินเข้า" สามปุ่ม)
   ⚠️ โมดัลไม่ตัดสินอะไรเอง — คำ/ผลลัพธ์มาจากผู้เรียก (`prepay` · `prompt` = installmentReportOutcome / installmentConfirmPrompt ของผู้เรียก) ·
     ด่านจริงอยู่ที่ PATCH งวด (`installmentActionError`) · error ของคำขอขึ้นในโมดัล (แถบของหน้าอยู่ใต้โมดัล)
   ⚠️ ไฟล์ที่เลือกค้างอยู่เมื่อส่งไม่สำเร็จ (กดใหม่ได้) — ขาอัปไฟล์ของผู้เรียกต้องจำ ref ของใบที่อัปไปแล้ว (`uploadPaymentEvidenceOnce`) */
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtMoney } from "@/lib/format";
import styles from "./InstallmentMoneyInDialogs.module.css";

/* หัวโมดัลแจ้งชำระ — ตามปลายทางจริงของแถว (งวดร่างบันทึกเก็บไว้ · บัญชีบันทึกจบในก้าวเดียว · ฝ่ายขายแจ้งให้บัญชีตรวจ) */
export function installmentReportTitle({ row, single, prepay, prompt }) {
  if (prepay) return single ? "บันทึกว่าลูกค้าจ่ายแล้ว" : `บันทึกการจ่าย งวดที่ ${row.seq}`;
  if (prompt) return single ? "บันทึกการรับชำระ" : `บันทึกการรับชำระ งวดที่ ${row.seq}`;
  return single ? "แจ้งลูกค้าจ่ายแล้ว" : `แจ้งชำระ งวดที่ ${row.seq}`;
}

export function InstallmentReportDialog({
  row, single = false, prepay = false, prompt = null, gateUnreadNotice = null,
  paidOn, files, onChange, error = "", busy = false, onClose, onSubmit,
}) {
  if (!row) return null;
  return (
    <Modal open onClose={onClose} title={installmentReportTitle({ row, single, prepay, prompt })} size="sm" dismissible={!busy}>
      <div className={styles.dialog}>
        {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
        {/* ⭐ งวดร่างต้องบอกให้ครบว่า "เก็บไว้แล้วเกิดอะไรต่อ" — ไม่งั้นคนกดจะรอคิวบัญชีที่ยังไม่มี (มติผู้ใช้ 2026-08-19)
            ⭐ บัญชีบันทึกเอง = จบที่ "ชำระแล้ว" ทันที ไม่มีคิวตรวจ — บอกตรง ๆ แล้วตามด้วยผลลัพธ์ชุดเดียวกับโมดัลรับรอง */}
        <p className="form-note">
          {prepay
            ? `ยอด ${fmtMoney(row.amount)} (ยังไม่ยืนยันจนกว่าใบจะอนุมัติ) — เก็บวันจ่ายกับหลักฐานไว้ก่อน ระบบจะส่งให้บัญชีตรวจเองตอนใบสั่งขายอนุมัติ`
            : prompt
              ? `ยอด ${fmtMoney(row.amount)} — คุณรับรองการชำระได้เอง บันทึกแล้วงวดนี้ขึ้น “ชำระแล้ว” ทันที ไม่ผ่านคิวตรวจของบัญชี`
              : `ยอด ${fmtMoney(row.amount)} — บัญชีจะตรวจหลักฐานก่อนรับรอง`}
        </p>
        {prompt ? <p className="form-note pre-line">{prompt.detail}</p> : null}
        {/* บัญชีบันทึก = รับรองในก้าวเดียว ⇒ ผู้เรียกบอกเมื่ออ่านรอบขายไม่ขึ้น (บรรทัดด่านเงินของนัดหายจากผลลัพธ์ · review 29/09) */}
        {prompt && gateUnreadNotice ? <StatusNotice tone="warning">{gateUnreadNotice}</StatusNotice> : null}
        <label className={styles.field}>
          <span>วันที่ลูกค้าชำระ *</span>
          <DateInput value={paidOn} ariaLabel="วันที่ลูกค้าชำระ" onChange={(iso) => onChange({ paidOn: iso, files })} />
        </label>
        <div className={styles.field}>
          <span>หลักฐานการชำระ * (สลิป/ใบนำฝาก)</span>
          <PendingFiles files={files} disabled={!!busy} max={8} onChange={(next) => onChange({ paidOn, files: next })} />
        </div>
        <div className="action-bar">
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>ยกเลิก</Button>
          <Button tone="primary" disabled={!!busy || !paidOn || !files.length} onClick={onSubmit}>
            {busy ? "กำลังบันทึก…" : (prepay ? "บันทึกไว้" : prompt ? prompt.confirmLabel : "ส่งให้บัญชีตรวจ")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function InstallmentEvidenceAddDialog({
  row, single = false, have = 0, room = 0, files, onChange, error = "", busy = false, onClose, onSubmit,
}) {
  if (!row) return null;
  return (
    <Modal open onClose={onClose} title={single ? "แนบหลักฐานการชำระเพิ่ม" : `แนบหลักฐานเพิ่ม งวดที่ ${row.seq}`} size="sm" dismissible={!busy}>
      <div className={styles.dialog}>
        {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
        {/* บอกตรง ๆ ว่าอะไรไม่เปลี่ยน — คนแนบสลิปรอบสองต้องไม่เข้าใจว่าเป็นการแจ้งใหม่/ส่งเข้าคิวบัญชีอีกรอบ */}
        <p className="form-note">
          {`ยอด ${fmtMoney(row.amount)} · มีหลักฐานแล้ว ${have} ไฟล์ — ไฟล์ใหม่ต่อท้ายชุดเดิม`
            + (row.status === "confirmed"
              ? " งวดยังเป็น “ชำระแล้ว” ตามเดิม"
              : row.status === "reported"
                ? " งวดยังรอบัญชีตรวจตามเดิม บัญชีเห็นไฟล์ใหม่ในการตรวจรอบเดียวกัน"
                : " วันที่จ่ายกับสถานะงวดไม่เปลี่ยน")}
        </p>
        <div className={styles.field}>
          <span>{`หลักฐานเพิ่ม * (แนบได้อีก ${room} ไฟล์)`}</span>
          <PendingFiles files={files} disabled={!!busy} max={room} onChange={onChange} />
        </div>
        <div className="action-bar">
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>ยกเลิก</Button>
          <Button tone="primary" disabled={!!busy || !files.length} onClick={onSubmit}>
            {busy ? "กำลังบันทึก…" : "แนบเพิ่ม"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
