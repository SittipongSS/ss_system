"use client";
import { useState } from "react";
import { Check, PencilLine, X } from "lucide-react";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import { fmtDate } from "@/lib/format";
import { DELIVERY_DUE_AMEND_TEXT } from "@/lib/sales/salesOrderDeliveryDue";
import styles from "./SalesOrderDeliveryDueField.module.css";

/* ใต้ตัวแก้ของใบที่อนุมัติแล้ว — บอกว่าแก้แล้วอะไรเปลี่ยน อะไรไม่เปลี่ยน ก่อนกดบันทึก */
const AMEND_NOTE = "แก้ได้โดยไม่ต้องออก Rev. · ไม่กระทบยอดเงินหรือ Actual · "
  + "เอกสาร FM-SA-04 ที่ยื่นแล้วยังพิมพ์วันเดิม (ร่างที่ยังไม่ยื่นเห็นวันใหม่)";

/**
 * ช่อง "กำหนดส่งสินค้า" ของใบสั่งขาย (0363) — **ตัวเดียวกันทั้งตอนสร้างใบและตอนแก้ใบร่าง**
 * (กฎ AGENTS.md: ฟอร์มสร้างกับฟอร์มแก้ต้องเป็น component เดียว ต่างกันได้แค่โหมด)
 *
 * ⭐ ค่านี้เป็นคำสัญญาเรื่อง **ของ** ไม่ใช่เรื่องเงิน — คนละอันกับ "วันที่ SO"
 * (วันออกใบ แก้ไม่ได้) และ "กำหนดชำระ" (อยู่ที่งวดในการ์ดการชำระ) · ทั้งสามค่าอยู่ใกล้กัน
 * บนจอ จึงต้องมีคำกำกับบอกว่าอันไหนคืออะไร ไม่ใช่ปล่อยให้เดาจากป้าย
 *
 * ⚠️ **ไม่บังคับกรอก** — AE ที่ยังรอลูกค้าเคาะวันส่งต้องตั้งใบร่างไว้ก่อนได้
 * ว่าง = "ยังไม่ตกลงวันส่ง" ซึ่งเป็นข้อเท็จจริง ไม่ใช่ข้อมูลขาด ⇒ โหมดอ่านขึ้นข้อความนั้น
 * ตรง ๆ ไม่ใช่ขีดเปล่า ๆ ที่อ่านแล้วไม่รู้ว่าลืมกรอกหรือยังไม่ตกลง
 *
 * ⭐ **ดินสอบนใบที่อนุมัติแล้ว** (มติผู้ใช้ 2026-09-29) — โหมดอ่าน + `onAmend` = แก้ทีละช่อง
 * ผ่าน action `set_delivery_due` (ไม่ต้องออก Rev.) · ผู้เรียกส่ง `onAmend` เฉพาะคนที่ด่าน
 * `deliveryDueAmendError` ปล่อย (ไม่มีสิทธิ์ = ไม่วาดดินสอ · กฎ ui-visibility-rule)
 * `onAmend(next)` คืน true เมื่อบันทึกสำเร็จ — ตัวแก้ปิดเฉพาะตอนนั้น (ไม่สำเร็จ = ค้างค่าที่เลือกไว้ให้กดใหม่)
 * ⚠️ ไม่สำเร็จต้องบอกเหตุ **ที่ช่องนี้** — แถบ error ของหน้าอยู่เหนือแท็บ มักพ้นจอไปแล้วตอนแก้การ์ดนี้
 *    ⇒ ผู้เรียกส่ง `amendError` (ข้อความ error ปัจจุบันของหน้า) มาด้วย · onAmend throw (เน็ตหลุด) ก็จับที่นี่
 * ⚠️ ช่องว่าง = กดบันทึกไม่ได้ (ทางนี้ตั้ง/เลื่อนวันเท่านั้น ไม่ล้าง — route ตีกลับซ้ำด้วยข้อความเดียวกัน)
 */
export default function SalesOrderDeliveryDueField({
  value,
  onChange,
  mode = "edit",     // 'edit' | 'read'
  disabled = false,
  readonlyClassName,
  onAmend,           // (next: 'YYYY-MM-DD') => Promise<boolean> — โหมดอ่านของใบที่อนุมัติแล้ว
  amendError = "",   // ข้อความ error ล่าสุดของหน้า — ขึ้นใต้ช่องเมื่อการบันทึกรอบนี้ไม่สำเร็จ
}) {
  const [amending, setAmending] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [thrown, setThrown] = useState("");

  if (mode === "read") {
    if (onAmend && amending) {
      const save = async () => {
        if (!draft) return;
        setBusy(true);
        setFailed(false);
        setThrown("");
        try {
          if (await onAmend(draft)) setAmending(false);
          else setFailed(true);
        } catch (err) {
          setFailed(true);
          setThrown(err?.message || "บันทึกกำหนดส่งไม่สำเร็จ");
        } finally {
          setBusy(false);
        }
      };
      const errorText = failed ? (thrown || amendError || "บันทึกกำหนดส่งไม่สำเร็จ") : "";
      return (
        <div className={readonlyClassName}>
          <span>กำหนดส่งสินค้า</span>
          <div className={styles.editor}>
            <DateInput
              value={draft}
              disabled={busy}
              ariaLabel="กำหนดส่งสินค้า"
              onChange={(next) => setDraft(next || "")}
            />
            <div className={styles.actions}>
              <Button
                size="sm" tone="primary" icon={<Check size={13} aria-hidden="true" />}
                onClick={save} disabled={busy || !draft || draft === (value || "")}
              >
                {busy ? "กำลังบันทึก…" : "บันทึกกำหนดส่ง"}
              </Button>
              <Button
                size="sm" variant="quiet" icon={<X size={13} aria-hidden="true" />}
                onClick={() => setAmending(false)} disabled={busy}
              >
                ยกเลิก
              </Button>
            </div>
            {errorText ? <p className={styles.error} role="alert">{errorText}</p> : null}
            {!draft && !busy ? <p className="form-note">{DELIVERY_DUE_AMEND_TEXT.empty}</p> : null}
            <p className="form-note">{AMEND_NOTE}</p>
          </div>
        </div>
      );
    }
    const readValue = (
      <div className="readable-field">
        {value
          ? fmtDate(value)
          : <span className="readable-field-empty">ยังไม่ตกลงวันส่ง</span>}
      </div>
    );
    return (
      <div className={readonlyClassName}>
        <span>กำหนดส่งสินค้า</span>
        {onAmend
          ? (
            <div className={styles.readRow}>
              {readValue}
              <Button
                size="sm" variant="quiet" icon={<PencilLine size={13} aria-hidden="true" />}
                onClick={() => { setDraft(value || ""); setFailed(false); setThrown(""); setAmending(true); }}
              >
                {value ? "แก้" : "ตั้งวันส่ง"}
              </Button>
            </div>
          )
          : readValue}
      </div>
    );
  }
  return (
    <label>
      <span>กำหนดส่งสินค้า</span>
      <DateInput
        value={value || ""}
        disabled={disabled}
        ariaLabel="กำหนดส่งสินค้า"
        onChange={(next) => onChange(next || "")}
      />
      <p className="form-note">วันที่ตกลงกับลูกค้าว่าจะส่งของ — ไม่ใช่กำหนดชำระ · ยังไม่ตกลงก็เว้นว่างได้</p>
    </label>
  );
}
