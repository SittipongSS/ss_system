"use client";

// เลือกผู้รับผิดชอบเอกสารใบเสนอราคา (ผู้ดูแล AE / ผู้จัดทำ AC / ผู้ตรวจสอบ) —
// ชุดตัวเลือกเดียวกับฟอร์มโครงการ/ไทม์ไลน์ (SalesProjectCreateModal): ดึงรายชื่อ
// จาก /api/pm/assignable-users แล้วเก็บเป็น "ชื่อ" ใน quotations.metadata
import { useEffect, useState } from "react";
import Select from "@/components/ui/Select";
import { cachedFetchJson } from "@/lib/apiCache";

const userName = (u) => (u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "").trim();

export const QUOTATION_PEOPLE_FIELDS = [
  { key: "aeOwner", label: "ผู้ดูแล (AE)", roles: ["ae", "senior_ae", "ae_supervisor"] },
  { key: "preparedBy", label: "ผู้จัดทำ (AC)", roles: ["ac"] },
  { key: "aeSupervisor", label: "ผู้ตรวจสอบ (AE Supervisor)", roles: ["ae_supervisor"] },
];

export const quotationPeopleFromMetadata = (metadata) => ({
  aeOwner: metadata?.aeOwner || "",
  preparedBy: metadata?.preparedBy || "",
  aeSupervisor: metadata?.aeSupervisor || "",
});

export default function QuotationPeopleFields({ value, onChange, disabled = false }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
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

  return QUOTATION_PEOPLE_FIELDS.map(({ key, label, roles }) => (
    <label key={key}>{label}
      <Select fullWidth value={value[key] || ""} disabled={disabled} onChange={(e) => onChange({ ...value, [key]: e.target.value })} aria-label={label}>
        <option value="">— ไม่ระบุ —</option>
        {optionsFor(roles, value[key]).map((name) => <option key={name} value={name}>{name}</option>)}
      </Select>
    </label>
  ));
}
