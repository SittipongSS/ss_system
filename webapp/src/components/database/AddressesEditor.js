"use client";
// ที่อยู่ของลูกค้าหนึ่งราย — หลายรายการ (migration 0202). Controlled:
// value = array, onChange(nextArray). แพตเทิร์นเดียวกับ ContactsEditor/BrandsEditor
// แต่แถวสูงกว่า (ตัวที่อยู่เป็น textarea) จึงห่อเป็นการ์ดต่อแถว ไม่ใช่แถวเดียวยาว
//
// "หลัก" ไม่ใช่ธงในข้อมูล แต่คือ **รายการแรกที่ใช้งานนั้นได้** (ดู addresses.js)
// จึงต้องมีปุ่มเลื่อนขึ้น/ลง ไม่งั้นจะเปลี่ยนที่อยู่หลักไม่ได้เลยนอกจากลบทิ้งแล้ว
// เพิ่มใหม่ (ปัญหาที่ ContactsEditor มีอยู่)
//
// ── ที่อยู่แบบมีโครงสร้าง (2026-08-06) ────────────────────────────────────
// จังหวัด/อำเภอ/ตำบล เลือกจากทะเบียนกรมการปกครอง (/api/master/thai-address) แล้ว
// ระบบประกอบข้อความที่พิมพ์ลงเอกสารให้เอง — ช่องข้อความยังอยู่ (กด "พิมพ์เอง" ได้)
// เพราะที่อยู่บางแห่งเขียนตามที่ลูกค้าให้มาเป๊ะ ๆ ไม่เข้าแม่แบบไหนเลย
//
// ⚠️ แถวยุคเก่ามีแต่ข้อความก้อนเดียว: ช่องเลือกถูกล็อกไว้ก่อน จนกว่าจะกด "แยก
// ที่อยู่อัตโนมัติ" — ถ้าปล่อยให้เลือกจังหวัดทับได้เลย ข้อความเดิมทั้งก้อน (บ้านเลขที่/
// ถนน) จะถูกแทนที่ด้วย "จังหวัดX 20000" ในการบันทึกครั้งเดียว
//
// ⭐ ช่องที่อยู่ของแต่ละแถว (บ้านเลขที่ · จังหวัด/อำเภอ/ตำบล · พรีวิว · พิมพ์เอง/แยกอัตโนมัติ)
// อยู่ที่ `master/ThaiAddressFields` ตั้งแต่ 2026-09-24 — ฟอร์มไซต์บริการใช้ตัวเดียวกัน
// (มติผู้ใช้: "การพิมพ์ไซต์อื่น อยากให้ฟอร์มเหมือนที่อยู่ของฐานข้อมูล") · ไฟล์นี้เหลือเปลือกรายการ:
// ชื่อเรียก · ใช้ทำอะไร · ลำดับ/หลัก · เลขสาขา · ผู้รับของ
//
// ใช้ primitive กลางล้วน (Button/Input) ไม่เขียนคลาส btn/premium-input เอง —
// ratchet ของ audit:ui กันไม่ให้ชั้นเก่างอกเพิ่ม
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import PhoneInput from "@/components/ui/PhoneInput";
import ThaiAddressFields, { useThaiAddressRegistry } from "@/components/master/ThaiAddressFields";
import { genId } from "@/lib/id";
import {
  addressText,
  asAddressRow,
  isBillingAddress,
  isShippingAddress,
  toggleAddressUse,
} from "@/lib/master/addresses";
import { isBranchCodeValid } from "@/lib/master/thaiAddress";

// ปุ่มติ๊ก "ใช้ทำอะไร" (มติผู้ใช้) — ติ๊กได้ทั้งสอง แต่ปิดหมดไม่ได้ (ดู toggleAddressUse)
const USES = [
  { key: "billing", label: "ออกเอกสาร", on: isBillingAddress },
  { key: "shipping", label: "จัดส่ง", on: isShippingAddress },
];

export default function AddressesEditor({ value = [], onChange }) {
  const rows = (Array.isArray(value) ? value : []).map(asAddressRow);
  // ทะเบียนจังหวัด/อำเภอ + ตำบลของอำเภอที่ถูกเลือกไว้แล้วตอนเปิดฟอร์ม (ต้องเห็นทันที ไม่ใช่ช่องว่าง)
  // ⚠️ โหลดไม่ได้ = ช่องเลือกว่าง แต่ยังพิมพ์ข้อความที่อยู่เองได้ ⇒ ไม่ขึ้นข้อความ error ที่นี่
  const registry = useThaiAddressRegistry({ districtCodes: rows.map((r) => r.districtCode) });

  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // ── แถวใหม่ยังไม่ติ๊กอะไรให้ (มติผู้ใช้ 2026-08-06) ─────────────────────
  // "ใช้ทำอะไร" เก็บได้ 3 ค่า (both/billing/shipping) — **ไม่มีค่าว่างในข้อมูล**
  // เพราะที่อยู่ที่ใช้ทำอะไรไม่ได้เลยก็ไม่ใช่ที่อยู่ (ดู toggleAddressUse) · สถานะ
  // "ยังไม่ได้เลือก" จึงอยู่ที่หน้าจอเท่านั้น: จำ id ของแถวที่เพิ่งกดเพิ่มและยังไม่
  // แตะปุ่มไหนเลย แล้ววาดปุ่มเป็นยังไม่ติ๊ก
  //
  // ⭐ ทำแบบนี้แทนการใส่ค่าว่างลงข้อมูล เพราะ addressUse() ตีค่าที่ไม่รู้จักเป็น
  // 'both' โดยตั้งใจ — ที่อยู่ที่บันทึกไว้แล้วต้องไม่หายจาก dropdown ทั้งสองฝั่ง
  // เงียบ ๆ · ถ้าเปลี่ยนตรงนั้น แถวเก่าที่ข้อมูลไม่สมบูรณ์จะหลุดจากใบเสนอราคาทันที
  const [untouched, setUntouched] = useState(() => new Set());
  const isUntouched = (row) => untouched.has(row.id);
  const markTouched = (id) => setUntouched((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  const add = () => {
    const id = genId("ADR");
    setUntouched((prev) => new Set(prev).add(id));
    // ค่าที่บันทึกจริงถ้าผู้ใช้ไม่แตะปุ่มเลย = 'both' (ค่าตั้งต้นเดิมของระบบ) —
    // ไม่ติ๊กให้บนจอ แต่ก็ไม่บันทึกที่อยู่ที่ใช้ทำอะไรไม่ได้เลยลงฐานข้อมูล
    onChange([...rows, { id, label: "", address: "", addressEn: "", useFor: "both" }]);
  };
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
  // แถวที่ยังไม่ได้เลือก "ใช้ทำอะไร" ยังไม่นับเป็นหลักด้วย — ไม่งั้นป้าย "บิลหลัก"
  // ไปเกาะแถวที่ผู้ใช้ยังไม่ได้บอกเลยว่าจะใช้ออกบิลไหม
  const filled = (r) => addressText(r).trim().length > 0 && !isUntouched(r);
  const billingPrimary = rows.findIndex((r) => filled(r) && isBillingAddress(r));
  const shippingPrimary = rows.findIndex((r) => filled(r) && isShippingAddress(r));

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <div className="text-[11px] text-[var(--text-3)]">ยังไม่มีที่อยู่ — กด “เพิ่มที่อยู่”</div>
      )}
      {rows.map((a, i) => {
        return (
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
              <div className="flex gap-1.5 items-center">
                  {USES.map(({ key, label, on }) => {
                  // แถวที่ยังไม่แตะ = วาดเป็นยังไม่ติ๊กทั้งคู่ และกดครั้งแรกได้
                  // "อันนั้นอันเดียว" ไม่ใช่ toggle จากค่า both ที่ซ่อนอยู่ (ซึ่งจะ
                  // กลายเป็นกดบิลแล้วได้จัดส่ง — ตรงข้ามกับที่เห็นบนจอ)
                  const pending = isUntouched(a);
                  const active = !pending && on(a);
                  return (
                    <Button
                      key={key}
                      size="sm"
                      tone={active ? "primary" : undefined}
                      variant={active ? "filled" : "outline"}
                      icon={active ? <Check size={13} /> : null}
                      onClick={() => {
                        markTouched(a.id);
                        update(i, { useFor: pending ? key : toggleAddressUse(a.useFor, key) });
                      }}
                      title={active ? `ที่อยู่นี้ใช้${label}` : `ติ๊กเพื่อใช้ที่อยู่นี้${label}`}
                      aria-pressed={active}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex gap-1 items-center ml-auto">
                {/* มีที่อยู่เดียว = เป็นหลักอยู่แล้วโดยปริยาย — ป้ายจึงไม่ได้บอกอะไร
                    นอกจากซ้ำกับปุ่มติ๊กที่อยู่ข้าง ๆ (ผู้ใช้: "มีป้ายซ้ำซ้อน") */}
                {rows.length > 1 && i === billingPrimary && <span className="status-pill" title="ตั้งต้นของช่องที่อยู่ออกเอกสาร">บิลหลัก</span>}
                {rows.length > 1 && i === shippingPrimary && <span className="status-pill" title="ตั้งต้นของช่องที่อยู่จัดส่ง">จัดส่งหลัก</span>}
                <Button iconOnly icon={<ChevronUp size={14} />} onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น" />
                <Button iconOnly icon={<ChevronDown size={14} />} onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="เลื่อนลง" aria-label="เลื่อนลง" />
                <Button iconOnly tone="danger" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(i)} title="ลบที่อยู่" aria-label="ลบที่อยู่" />
              </div>
            </div>

            <ThaiAddressFields
              value={a}
              onChange={(patch) => update(i, patch)}
              registry={registry}
              /* บอกตรง ๆ ว่าไม่เลือกแล้วจะได้อะไร — ไม่งั้นคนเพิ่มคลังแล้วลืมติ๊ก
                 จะได้ที่อยู่คลังโผล่ในช่อง "ออกบิล" ของใบเสนอราคาโดยไม่รู้ตัว */
              notice={isUntouched(a)
                ? <span>เลือกด้วยว่าที่อยู่นี้ใช้ทำอะไร — ไม่เลือก = ใช้ได้ทั้งออกเอกสารและจัดส่ง</span>
                : null}
            >
              {/* ⚠️ ช่องชุดนี้ต้องอยู่ครบทุกช่องเสมอ ห้ามซ่อนตามปุ่มติ๊ก "ออกเอกสาร/จัดส่ง"
                  — เดิมซ่อน/โผล่ตามสถานะ ทำให้ช่องที่เหลือเลื่อนตำแหน่งทุกครั้งที่กดปุ่ม
                  (ผู้ใช้: "กดแล้วมันโดดไปโดดมา") · เลขสาขามีผลเฉพาะที่อยู่ที่ใช้ออกเอกสาร
                  และผู้รับของมีผลเฉพาะที่อยู่จัดส่ง ซึ่งบอกด้วย placeholder ก็พอ ไม่ต้อง
                  ย้ายของบนจอ */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* ⚠️ ห้ามกรอง e.target.value ให้เหลือแต่ตัวเลข: ของจริงมีลูกค้าที่เก็บ
                    **ชื่อ** สาขาไว้ ('แจ้งวัฒนะ') — กรองทิ้งเมื่อไหร่ = แค่คลิกช่องนี้
                    แล้วบันทึก สาขาก็กลายเป็นสำนักงานใหญ่บนใบกำกับภาษี */}
                <Input
                  mono
                  className="text-xs"
                  maxLength={50}
                  placeholder="เลขสาขา (ว่าง = สำนักงานใหญ่)"
                  value={a.branchCode}
                  invalid={!!a.branchCode && !isBranchCodeValid(a.branchCode)}
                  onChange={(e) => update(i, { branchCode: e.target.value })}
                />
                <Input
                  className="text-xs"
                  placeholder="ลิงก์แผนที่ (Google Maps)"
                  value={a.mapUrl}
                  onChange={(e) => update(i, { mapUrl: e.target.value })}
                />
                <Input
                  className="text-xs"
                  placeholder="ผู้รับของ"
                  value={a.contactName}
                  onChange={(e) => update(i, { contactName: e.target.value })}
                />
                <PhoneInput
                  className="text-xs"
                  placeholder="เบอร์ผู้รับ"
                  value={a.contactPhone}
                  onChange={(v) => update(i, { contactPhone: v })}
                />
              </div>
              {!!a.branchCode && !isBranchCodeValid(a.branchCode) && (
                <span className="text-[10px] text-[var(--red)]">
                  ใบกำกับภาษีต้องใช้เลขสาขา 5 หลัก — แก้เป็นตัวเลขเมื่อทราบ
                </span>
              )}
            </ThaiAddressFields>
          </div>
        );
      })}
      <Button className="self-start" icon={<Plus size={14} />} onClick={add}>เพิ่มที่อยู่</Button>
    </div>
  );
}
