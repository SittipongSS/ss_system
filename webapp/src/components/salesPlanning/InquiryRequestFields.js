"use client";
// ช่องกรอก "คำถามถึง RD" — ชุดเดียวใช้ทั้งโมดัลสร้างและโมดัลแก้ไข (กฎใน AGENTS.md)
// เดิมเป็นคนละชุด แล้วเพี้ยนกันจริง: ลำดับช่องสลับกัน (หัวเรื่องขึ้นก่อน/หลังบริบท,
// เร่งด่วนสลับกับวันที่คาดหวัง) ทั้งที่เป็นคำถามใบเดียวกัน
import InquiryContextFields, { EMPTY_INQUIRY_CONTEXT, isInquiryContextComplete } from "@/components/salesPlanning/InquiryContextFields";

export const EMPTY_INQUIRY_REQUEST = { title: "", urgent: false, requestedDueDate: "", ...EMPTY_INQUIRY_CONTEXT };

/** เรื่องสอบถามจาก API → ค่าในฟอร์มแก้ไข */
export const inquiryToRequestForm = (inq) => ({
  ...EMPTY_INQUIRY_REQUEST,
  title: inq?.title || "",
  urgent: !!inq?.urgent,
  requestedDueDate: inq?.requestedDueDate || "",
  customerId: inq?.customerId || "",
  projectId: inq?.projectId || "",
  dealId: inq?.dealId || "",
});

/** ส่งได้เมื่อ: มีหัวเรื่อง + บริบทครบ (+ ตอนสร้างต้องมีคำถามหรือไฟล์แนบอย่างน้อยอย่างหนึ่ง) */
export const isInquiryRequestComplete = (form) =>
  !!form?.title?.trim() && isInquiryContextComplete(form);

export default function InquiryRequestFields({
  form,
  setForm,
  disabled,
  customers = [],
  projects = [],
  deals = [],
  // ตอนสร้าง = ตัวคำถาม (ข้อความแรกของเธรด); ตอนแก้ไม่มีช่องนี้ เพราะคำถามถูกเก็บเป็น
  // "ข้อความในเธรด" ไม่ใช่คอลัมน์ของเรื่อง — แก้ตรงนี้เท่ากับแก้ประวัติการสนทนา
  body = null,
  onBodyChange = null,
  // false = เปิดจากหน้าดีล บริบทล็อกตามดีลนั้นแล้ว ผู้เรียกวางแบนเนอร์ของตัวเองไว้เหนือฟอร์ม
  showContext = true,
}) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  return (
    <>
      {showContext && (
        <InquiryContextFields
          value={form}
          onChange={(next) => setForm((f) => ({ ...f, ...next }))}
          customers={customers}
          projects={projects}
          deals={deals}
          disabled={disabled}
        />
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        หัวเรื่อง
        <input className="premium-input" value={form.title} maxLength={200} disabled={disabled}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="เช่น กลิ่นลาเวนเดอร์ปรับให้ติดทนขึ้นได้ไหม" />
      </label>
      {onBodyChange && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          รายละเอียดคำถาม
          <textarea className="premium-input" rows={4} value={body || ""} disabled={disabled}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="อธิบายสิ่งที่อยากรู้ / สเปกที่ลูกค้าขอ..." style={{ resize: "vertical" }} />
        </label>
      )}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={!!form.urgent} disabled={disabled}
          onChange={(e) => set({ urgent: e.target.checked })} /> เร่งด่วน
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        วันที่ SA คาดหวังคำตอบ
        <input className="premium-input" type="date" value={form.requestedDueDate || ""} disabled={disabled}
          onChange={(e) => set({ requestedDueDate: e.target.value })} />
      </label>
    </>
  );
}
