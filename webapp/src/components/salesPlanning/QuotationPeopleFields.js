"use client";

// เลือกผู้รับผิดชอบเอกสารใบเสนอราคา — ทั้งสามช่องเลือกจากผู้ใช้จริง filter ตาม role
// (มติผู้ใช้): ผู้ดูแล=AE/Senior AE, ผู้ประสานงาน=AC, ผู้ตรวจสอบ=AE Supervisor.
// ดึงรายชื่อจาก /api/pm/assignable-users เก็บเป็น "ชื่อ" ใน quotations.metadata และ
// server ตรวจซ้ำว่าชื่อที่ส่งมาเป็นผู้ใช้จริงที่ถือ role นั้น (lib/sales/quotationPeople).
import { useEffect, useState } from "react";
import Select from "@/components/ui/Select";
import { cachedFetchJson } from "@/lib/apiCache";
import { QT_PEOPLE_LABELS, QT_PEOPLE_ROLES } from "@/lib/sales/quotationPeople";

const userName = (u) => (u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "").trim();

export const quotationPeopleFromMetadata = (metadata) => ({
  aeOwner: metadata?.aeOwner || "",
  preparedBy: metadata?.preparedBy || "",
  aeSupervisor: metadata?.aeSupervisor || "",
});

const PICKER_FIELDS = [
  { key: "aeOwner", label: QT_PEOPLE_LABELS.aeOwner, roles: QT_PEOPLE_ROLES.aeOwner },
  { key: "preparedBy", label: QT_PEOPLE_LABELS.preparedBy, roles: QT_PEOPLE_ROLES.preparedBy },
  { key: "aeSupervisor", label: QT_PEOPLE_LABELS.aeSupervisor, roles: QT_PEOPLE_ROLES.aeSupervisor },
];

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

  const pickerFor = ({ key, label, roles }) => (
    <label key={key}>{label}
      <Select fullWidth value={value[key] || ""} disabled={disabled} onChange={(e) => onChange({ ...value, [key]: e.target.value })} aria-label={label}>
        <option value="">— ไม่ระบุ —</option>
        {optionsFor(roles, value[key]).map((name) => <option key={name} value={name}>{name}</option>)}
      </Select>
    </label>
  );

  return <>{PICKER_FIELDS.map(pickerFor)}</>;
}
