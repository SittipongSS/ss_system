"use client";

// เลือกผู้รับผิดชอบเอกสารใบเสนอราคา — ชุดตัวเลือกเดียวกับฟอร์มโครงการ/ไทม์ไลน์
// (SalesProjectCreateModal): ดึงรายชื่อจาก /api/pm/assignable-users เก็บเป็น "ชื่อ"
// ใน quotations.metadata. ยกเว้น "ผู้จัดทำ" (มติผู้ใช้ 2026-07-15): ล็อกจากบัญชี
// ผู้สร้าง/ผู้ออก Revision อัตโนมัติ แก้ไม่ได้ — server เป็นคน stamp ค่าจริง
import { useEffect, useState } from "react";
import Select from "@/components/ui/Select";
import { cachedFetchJson } from "@/lib/apiCache";

const userName = (u) => (u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "").trim();

export const quotationPeopleFromMetadata = (metadata) => ({
  aeOwner: metadata?.aeOwner || "",
  preparedBy: metadata?.preparedBy || "",
  aeSupervisor: metadata?.aeSupervisor || "",
});

// ชื่อบัญชีที่ล็อกอินอยู่ — AppLayout เก็บลง localStorage ตอนโหลดแอป (ใช้โชว์
// ในช่องผู้จัดทำที่ล็อกไว้เท่านั้น ค่าจริง server stamp จาก session เอง)
const selfName = () => {
  try { return localStorage.getItem("userName") || ""; } catch { return ""; }
};

const PICKER_FIELDS = [
  { key: "aeOwner", label: "ผู้ดูแล (AE)", roles: ["ae", "senior_ae", "ae_supervisor"] },
  { key: "aeSupervisor", label: "ผู้ตรวจสอบ (AE Supervisor)", roles: ["ae_supervisor"] },
];

export default function QuotationPeopleFields({ value, onChange, disabled = false }) {
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState("");
  useEffect(() => {
    setMe(selfName());
    cachedFetchJson("/api/pm/assignable-users")
      .then((rows) => setUsers(Array.isArray(rows) ? rows : []))
      .catch(() => setUsers([]));
  }, []);

  const optionsFor = (roles, current) => {
    const names = [...new Set(users.filter((u) => roles.includes(u.role)).map(userName).filter(Boolean))];
    // ค่าที่บันทึกไว้แต่ไม่อยู่ในรายชื่อแล้ว (คนออก/เปลี่ยน role) — คงไว้ให้เห็น/เลือกซ้ำได้
    if (current && !names.includes(current)) names.unshift(current);
    return names;
  };

  const pickerFor = ({ key, label, roles }) => (
    <label key={key}>{label}
      <Select fullWidth value={value[key] || ""} disabled={disabled} onChange={(e) => onChange({ ...value, [key]: e.target.value })} aria-label={label}>
        <option value="">— ไม่ระบุ —</option>
        {optionsFor(roles, value[key]).map((name) => <option key={name} value={name}>{name}</option>)}
      </Select>
    </label>
  );

  return (
    <>
      {pickerFor(PICKER_FIELDS[0])}
      <label>ผู้จัดทำ (อัตโนมัติ)
        <input
          className="premium-input"
          value={value.preparedBy || me || ""}
          placeholder="บัญชีผู้สร้างใบ"
          disabled
          title="ดึงจากบัญชีผู้สร้างใบ/ผู้ออก Revision อัตโนมัติ — แก้ไม่ได้"
          aria-label="ผู้จัดทำ (ล็อกจากบัญชีผู้ใช้)"
        />
      </label>
      {pickerFor(PICKER_FIELDS[1])}
    </>
  );
}
