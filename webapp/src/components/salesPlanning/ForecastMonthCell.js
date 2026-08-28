"use client";
// ── ช่อง "เดือน FC" ในตารางดีล — กดแก้ได้ในแถวเลย ──────────────────────────
//
// ทำไมต้องแก้ได้ตรงนี้: กติกาคือ SA/AE ต้องเลื่อนเดือน FC ให้ตรงความจริง แต่เดิม
// ต้องเปิดดีลทีละใบ → เข้าหน้าแก้ → หาช่อง "วันที่คาดปิด" ⇒ 71 ใบที่ค้างจึงไม่มีใคร
// ไล่เลื่อน (ดู lib/sales/forecastDue.js)
//
// ⚠️ **แก้ "วันที่คาดปิด" ไม่ใช่ "เดือน FC"** — เป็นข้อมูลตัวเดียวกัน: server อนุมาน
// `forecastMonth` จาก `expectedCloseDate` เสมอ และ **ไม่รับ forecastMonth จาก client**
// (มติ 2026-07-16) จึงใช้ `DateInput` ตัวเดียวกับในฟอร์มแก้ดีล ไม่ประดิษฐ์ตัวเลือก
// เดือนขึ้นมาใหม่ — ไม่งั้นจะมีสองทางที่เขียนค่าเดียวกันแล้วเพี้ยนหากัน
//
// ⚠️ **มีปุ่มบันทึกเสมอ ไม่ auto-save** — การเซฟหนึ่งครั้งเขียนประวัติ FC หนึ่งแถว
// (`sales_deal_forecasts`) ที่ใช้วัดความแม่นยำการพยากรณ์ ถ้าเซฟทุกครั้งที่คลิกวันใน
// ปฏิทิน ประวัติจะเต็มไปด้วยค่าที่คนแค่กดผ่าน และตารางเป็นที่ที่กดพลาดง่ายที่สุด
import { useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import Button from "@/components/ui/Button";
import { forecastDueState } from "@/lib/sales/forecastDue";
import styles from "./ForecastMonthCell.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function ForecastMonthCell({ deal, currentMonth, canEdit = false, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const due = forecastDueState(deal, currentMonth);

  const open = () => {
    setValue(deal.expectedCloseDate || "");
    setError("");
    setEditing(true);
  };

  const save = async () => {
    setBusy(true); setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // ส่งเฉพาะช่องเดียว — PATCH เป็น partial update และการส่งทั้งฟอร์มจากตาราง
        // เสี่ยงเขียนทับค่าที่คนอื่นเพิ่งแก้
        body: JSON.stringify({ expectedCloseDate: value || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
      setEditing(false);
      onSaved?.(body);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className={styles.editor}>
        <DateInput value={value} onChange={setValue} />
        <div className={styles.actions}>
          <Button size="sm" tone="primary" icon={<Check size={13} aria-hidden="true" />} onClick={save} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
          <Button size="sm" variant="quiet" icon={<X size={13} aria-hidden="true" />} onClick={() => setEditing(false)} disabled={busy}>
            ยกเลิก
          </Button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  const label = deal.forecastMonth || "ยังไม่ระบุ";
  const hint = due.overdue
    ? `ค้างมา ${due.monthsLate} เดือน — เลื่อนเดือน FC ให้ตรงความจริง`
    : (due.missing ? "ยังไม่ระบุเดือน FC" : "แก้วันที่คาดปิด (เดือน FC ขยับตาม)");

  if (!canEdit) {
    return <span className={due.overdue ? styles.overdue : undefined} title={hint}>{label}</span>;
  }
  return (
    <button
      type="button"
      className={`${styles.trigger} ${due.overdue || due.missing ? styles.overdue : ""}`.trim()}
      onClick={open}
      title={hint}
    >
      {(due.overdue || due.missing) && <CalendarClock size={12} aria-hidden="true" />}
      {label}
      {due.overdue ? <span className={styles.late}>+{due.monthsLate}</span> : null}
    </button>
  );
}
