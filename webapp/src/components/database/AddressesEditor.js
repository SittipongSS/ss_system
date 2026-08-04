"use client";
// ที่อยู่ของลูกค้าหนึ่งราย — หลายรายการ (migration 0202). Controlled:
// value = array, onChange(nextArray). แพตเทิร์นเดียวกับ ContactsEditor/BrandsEditor
// แต่แถวสูงกว่า (ตัวที่อยู่เป็น textarea) จึงห่อเป็นการ์ดต่อแถว ไม่ใช่แถวเดียวยาว
//
// "หลัก" ไม่ใช่ธงในข้อมูล แต่คือ **รายการแรกที่ใช้งานนั้นได้** (ดู addresses.js)
// จึงต้องมีปุ่มเลื่อนขึ้น/ลง ไม่งั้นจะเปลี่ยนที่อยู่หลักไม่ได้เลยนอกจากลบทิ้งแล้ว
// เพิ่มใหม่ (ปัญหาที่ ContactsEditor มีอยู่)
//
// ใช้ primitive กลางล้วน (Button/Input/Select/Textarea) ไม่เขียนคลาส btn/
// premium-input เอง — ratchet ของ audit:ui กันไม่ให้ชั้นเก่างอกเพิ่ม
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { genId } from "@/lib/id";
import {
  ADDRESS_USES,
  ADDRESS_USE_LABELS,
  HEAD_OFFICE_BRANCH,
  asAddressRow,
  isBillingAddress,
  isShippingAddress,
} from "@/lib/master/addresses";

export default function AddressesEditor({ value = [], onChange }) {
  const rows = (Array.isArray(value) ? value : []).map(asAddressRow);
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([
    ...rows,
    { id: genId("ADR"), label: "", branchCode: HEAD_OFFICE_BRANCH, address: "", useFor: "both" },
  ]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const move = (i, delta) => {
    const to = i + delta;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  // แถวที่ยังไม่พิมพ์ที่อยู่ยังไม่นับเป็น "หลัก" — ไม่งั้นกดเพิ่มแถวเปล่าแล้ว
  // ป้าย "หลัก" กระโดดไปแถวว่างทันที
  const filled = (r) => r.address.trim().length > 0;
  const billingPrimary = rows.findIndex((r) => filled(r) && isBillingAddress(r));
  const shippingPrimary = rows.findIndex((r) => filled(r) && isShippingAddress(r));

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <div className="text-[11px] text-[var(--text-3)]">ยังไม่มีที่อยู่ — กด “เพิ่มที่อยู่”</div>
      )}
      {rows.map((a, i) => (
        <div
          key={a.id || i}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 flex flex-col gap-2"
        >
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              className="text-xs flex-1 basis-[150px] min-w-[120px]"
              placeholder="ชื่อเรียก เช่น สำนักงานใหญ่ / คลังบางนา"
              value={a.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <Input
              mono
              className="text-xs w-[88px]"
              placeholder="00000"
              title="รหัสสาขาบนเอกสารภาษี — 00000 = สำนักงานใหญ่"
              value={a.branchCode}
              onChange={(e) => update(i, { branchCode: e.target.value })}
            />
            <Select
              className="w-[178px]"
              value={a.useFor}
              onChange={(e) => update(i, { useFor: e.target.value })}
            >
              {ADDRESS_USES.map((use) => (
                <option key={use} value={use}>{ADDRESS_USE_LABELS[use]}</option>
              ))}
            </Select>
            <div className="flex gap-1 items-center ml-auto">
              {i === billingPrimary && <span className="status-pill" title="ตั้งต้นของช่องที่อยู่ออกเอกสาร">บิลหลัก</span>}
              {i === shippingPrimary && <span className="status-pill" title="ตั้งต้นของช่องที่อยู่จัดส่ง">จัดส่งหลัก</span>}
              <Button iconOnly icon={<ChevronUp size={14} />} onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น" />
              <Button iconOnly icon={<ChevronDown size={14} />} onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="เลื่อนลง" aria-label="เลื่อนลง" />
              <Button iconOnly tone="danger" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(i)} title="ลบที่อยู่" aria-label="ลบที่อยู่" />
            </div>
          </div>
          <Textarea
            rows={2}
            placeholder="ที่อยู่เต็ม…"
            value={a.address}
            onChange={(e) => update(i, { address: e.target.value })}
            className="w-full text-xs h-[70px] resize-none"
          />
        </div>
      ))}
      <Button className="self-start" icon={<Plus size={14} />} onClick={add}>เพิ่มที่อยู่</Button>
    </div>
  );
}
