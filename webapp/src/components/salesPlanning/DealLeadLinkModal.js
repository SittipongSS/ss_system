"use client";
/* โมดัล "ผูกลีดต้นทางกับดีล" — ตัวเดียวของสองฝั่ง (มติผู้ใช้ 2026-09-22)
   · หน้าดีล: เลือกลีด → POST /deals/{ดีลนี้}/link-lead
   · หน้าลีด: เลือกดีล → POST /deals/{ดีลที่เลือก}/link-lead
   ต่างกันแค่ "เลือกอะไร" ⇒ ส่งตัวเลือก/ป้ายมาเป็น props · ผลลัพธ์ที่บอกในโมดัลมาจาก
   `leadLinkEffects` ตัวเดียวกัน (กติกา approval-confirm: บอกว่ากดแล้วเกิดอะไร ไม่ใช่ "แน่ใจไหม")

   ⚠️ ไม่ยิง API เอง — ผู้เรียกถือการยิง/โหลดหน้าใหม่ของตัวเอง แล้วส่งผลกลับมาเป็น `error`/`loadError`
   🐞 รอบแรกหน้าดีลยิงผ่าน runAction ซึ่งเขียน error ลงแถบบนหน้า **ใต้โมดัล** ⇒ ผูกไม่สำเร็จแล้วโมดัล
      ค้างเฉย ๆ ไม่มีอะไรบอก · และโหลดรายการพลาดเคยหน้าตาเหมือน "ไม่มีอะไรให้ผูก" — ต้องแยกให้ออก */
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import styles from "./DealLeadLinkModal.module.css";

export default function DealLeadLinkModal({
  open,
  title,
  intro,
  fieldLabel,
  entity,
  options = [],
  value = "",
  onChange,
  loading = false,
  /* โหลดรายการตัวเลือกไม่สำเร็จ (ข้อความ) — ต่างจาก "ไม่มีรายการ" ต้องบอกให้ลองใหม่ */
  loadError = "",
  /* ยิงผูกไม่สำเร็จ (ข้อความจาก server) — โชว์ในโมดัล ไม่ใช่หลังโมดัล */
  error = "",
  placeholder,
  emptyPlaceholder,
  searchPlaceholder,
  emptyText,
  effects = [],
  busy = false,
  submitLabel,
  onSubmit,
  onClose,
}) {
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose?.()}
      title={title}
      size="sm"
      footer={(
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button onClick={onSubmit} disabled={busy || !value}>
            {busy ? "กำลังผูก…" : submitLabel}
          </Button>
        </>
      )}
    >
      <div className={styles.body}>
        {intro ? <p className={styles.intro}>{intro}</p> : null}
        <label className={styles.field}>
          {fieldLabel}
          <SearchableSelect
            className="w-full"
            entity={entity}
            ariaLabel={fieldLabel}
            value={value}
            onChange={onChange}
            disabled={loading || busy || !!loadError}
            options={options}
            placeholder={loading ? "กำลังโหลด…" : loadError ? "โหลดรายการไม่สำเร็จ" : (options.length ? placeholder : emptyPlaceholder || placeholder)}
            searchPlaceholder={searchPlaceholder}
            emptyText={(query) => (query ? emptyText : (emptyPlaceholder || emptyText))}
          />
        </label>
        {loadError ? <p className={styles.error} role="alert">โหลดรายการไม่สำเร็จ: {loadError} — ปิดแล้วเปิดใหม่อีกครั้ง</p> : null}
        {effects.length ? (
          <div className={styles.effects}>
            <strong>เมื่อกดผูก</strong>
            <ul>
              {effects.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        ) : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}
