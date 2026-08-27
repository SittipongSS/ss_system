"use client";
/* บล็อก "ข้อมูลลูกค้าในเอกสาร" ของใบเสนอราคา — **ชุดเดียวใช้ทั้งหน้าสร้างและหน้าแก้**
 *
 * ⭐ ที่มา (2026-08-27): บล็อกนี้เคยเป็น JSX คนละชุดสองหน้า แล้วเพี้ยนกันจริงภายในวันเดียว
 * ตามที่ AGENTS.md เตือนไว้ ("ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง"):
 *   · หน้าสร้างมีตัวเลือกว่าง "— เลือกที่อยู่ออกบิล —" + ด่านบังคับเลือก · หน้าแก้ไม่มี
 *   · ช่องสาขา หน้าสร้างใช้ branchValue + กั้นด้วยที่อยู่ที่เลือก · หน้าแก้ใช้ branchLabel
 *   · ผู้ติดต่อเพิ่งมีให้หน้าแก้ โดยมีตัวเลือก "(คงเดิม)" ที่หน้าสร้างไม่มี
 *   · แม้แต่ชื่อคลาส CSS ยังคนละคำ (.contactField vs .addressField) ทั้งที่เป็นของเดียวกัน
 *
 * ── สองโหมด (ต่างกันได้แค่โหมด ตามที่ AGENTS.md อนุญาต) ────────────────────
 * mode="create" — ใบใหม่ ยังไม่มีค่าอะไรตรึงไว้ ⇒ ทุกช่องเริ่มที่ "ยังไม่เลือก"
 *                 และตัวเลือกว่างแปลว่า "ยังไม่ได้เลือก"
 * mode="edit"   — ใบที่มีอยู่แล้ว **มีค่าที่ตรึงไว้บนใบเสมอ** ⇒ ตัวเลือกว่างแปลว่า
 *                 "คงค่าเดิมบนใบ" ไม่ใช่ "ยังไม่เลือก" · และเมื่อ editable=false
 *                 (ใบยื่น/อนุมัติ/รับแล้ว) ต้องวาดจาก `snapshot` อย่างเดียว
 *
 * ⚠️ **โหมดอ่านอย่างเดียวห้ามคำนวณค่าสดจากทะเบียนลูกค้า** — ใบที่ปิดแล้วคือหลักฐาน
 * การค้า ทะเบียนอาจถูกแก้ไปหลังออกใบ (ชื่อ/ที่อยู่/สาขา) การวาดค่าสดจะทำให้จอบอก
 * คนละเรื่องกับกระดาษที่ลูกค้าถืออยู่ · ตัว component จึงรับ `snapshot` มาแยกจาก
 * `customer` และเลือกใช้ตามโหมด ไม่ปนกัน
 */
import { Building2, MapPin, UserRound } from "lucide-react";
import Select from "@/components/ui/Select";
import { addressLabel, customerAddresses, isBillingAddress, isShippingAddress } from "@/lib/master/addresses";
import { branchValue } from "@/lib/master/thaiAddress";
import { naText } from "@/lib/format";
import styles from "./QuotationCustomerFields.module.css";

const contactText = (contact) => [contact?.name, contact?.role, contact?.phone].filter(Boolean).join(" · ");

function ReadOnlyField({ icon: Icon, label, value }) {
  return (
    <div className={styles.info}>
      <Icon size={16} aria-hidden="true" />
      <span><small>{label}</small>{naText(value)}</span>
    </div>
  );
}

/* value  = { billingAddressId, shippingAddressId, contactIndex } — "" = ยังไม่เลือก/คงเดิม
   onChange(patch) = ผู้เรียกเก็บ state เอง (หน้าสร้างเก็บแยกตัวแปร หน้าแก้เก็บใน form)
   picked = ผลของ pickDocumentAddresses(customer, value) ที่ผู้เรียกคำนวณไว้แล้ว —
            ส่งเข้ามาเพราะทั้งสองหน้าต้องใช้ค่าเดียวกันนี้ตอนบันทึกด้วย
   snapshot = ค่าที่ตรึงบนใบ (โหมด edit) */
export default function QuotationCustomerFields({
  mode = "create",
  editable = true,
  customer,
  value = {},
  onChange,
  picked,
  snapshot = null,
}) {
  const isEdit = mode === "edit";
  const addresses = customerAddresses(customer);
  const billingOptions = addresses.filter(isBillingAddress);
  const shippingOptions = addresses.filter(isShippingAddress);
  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : [];

  const { billingAddressId = "", shippingAddressId = "", contactIndex = "" } = value;
  const set = (patch) => onChange?.(patch);

  // ใบที่แก้ไม่ได้แล้ว — วาดจากค่าที่ตรึงไว้ล้วน ห้ามแตะทะเบียน
  if (isEdit && !editable) {
    return (
      <div className={styles.grid}>
        <ReadOnlyField icon={Building2} label="สาขา" value={branchValue(snapshot?.branchCode)} />
        <ReadOnlyField
          icon={UserRound}
          label="ผู้ติดต่อ"
          value={[snapshot?.contactName, snapshot?.contactPhone].filter(Boolean).join(" · ")}
        />
        <ReadOnlyField icon={MapPin} label="ที่อยู่ออกบิล" value={snapshot?.billingAddress} />
        <ReadOnlyField
          icon={MapPin}
          label="ที่อยู่จัดส่ง"
          value={snapshot?.shippingAddress || snapshot?.billingAddress}
        />
      </div>
    );
  }

  /* ตัวเลือกว่าง: หน้าสร้าง = "ยังไม่เลือก" · หน้าแก้ = "คงค่าเดิมบนใบ"
     ⚠️ หน้าแก้ห้ามใช้คำว่า "เลือก…" — ใบมีค่าอยู่แล้ว การไม่แตะช่องไม่ได้แปลว่าค้างว่าง */
  const keepLabel = (current) => `${naText(current)} (คงเดิม)`;
  const blankOption = (what, current) => (isEdit ? keepLabel(current) : `— เลือก${what} —`);

  const previewFor = (chosen, text, hint) => {
    if (isEdit) return naText(text);
    return chosen
      ? naText(text)
      : <span className={styles.previewEmpty}>{hint}</span>;
  };

  return (
    <div className={styles.grid}>
      <label className={styles.field}>ที่อยู่ออกบิล
        {billingOptions.length ? (
          <Select
            value={billingAddressId}
            onChange={(e) => set({ billingAddressId: e.target.value })}
            aria-label="เลือกที่อยู่ออกบิล"
          >
            <option value="">{blankOption("ที่อยู่ออกบิล", snapshot?.billingAddress)}</option>
            {billingOptions.map((a) => <option key={a.id} value={a.id}>{addressLabel(a)}</option>)}
          </Select>
        ) : null}
        <span className={styles.preview}>
          {billingOptions.length
            ? previewFor(billingAddressId, picked?.snapshot?.billingAddress,
              "ยังไม่ได้เลือก — ที่อยู่นี้จะขึ้นบนใบกำกับภาษี เลือกให้ตรงกับที่ลูกค้าจะออกบิล")
            : "ลูกค้ารายนี้ยังไม่มีที่อยู่ — เพิ่มที่ฐานข้อมูลลูกค้า"}
        </span>
      </label>

      <label className={styles.field}>ที่อยู่จัดส่ง
        {shippingOptions.length ? (
          <Select
            value={shippingAddressId}
            onChange={(e) => set({ shippingAddressId: e.target.value })}
            aria-label="เลือกที่อยู่จัดส่ง"
          >
            <option value="">{blankOption("ที่อยู่จัดส่ง", snapshot?.shippingAddress || snapshot?.billingAddress)}</option>
            {shippingOptions.map((a) => <option key={a.id} value={a.id}>{addressLabel(a)}</option>)}
          </Select>
        ) : null}
        <span className={styles.preview}>
          {previewFor(shippingAddressId, picked?.snapshot?.shippingAddress,
            "ยังไม่ได้เลือก — เลือกให้ตรงกับที่ลูกค้าจะรับของ")}
        </span>
      </label>

      {/* สาขา = ของ **ที่อยู่ออกบิลที่ใบนี้เลือก** (มติ 2026-08-06 — เหตุผลยาวที่ addresses.js)
          ⚠️ ผ่าน branchValue ไม่ใช่ branchLabel เพราะช่องนี้มีป้าย "สาขา" กำกับอยู่แล้ว
          ⚠️ ยังไม่เลือกที่อยู่ = ยังไม่มีสาขาให้โชว์ — pickDocumentAddresses ถอยไปที่อยู่หลัก
          เสมอ ถ้าไม่กั้นตรงนี้ ช่องนี้จะโชว์เลขของที่อยู่ที่คนทำใบยังไม่ได้เลือก */}
      <ReadOnlyField
        icon={Building2}
        label="สาขา"
        value={(billingAddressId || isEdit) ? branchValue(picked?.snapshot?.branchCode) : ""}
      />

      <label className={styles.field}>ผู้ติดต่อ
        {contacts.length ? (
          <Select
            value={contactIndex}
            onChange={(e) => set({ contactIndex: e.target.value === "" ? "" : Number(e.target.value) })}
            aria-label="เลือกผู้ติดต่อ"
          >
            <option value="">
              {isEdit
                ? keepLabel([snapshot?.contactName, snapshot?.contactPhone].filter(Boolean).join(" · "))
                : "— เลือกผู้ติดต่อ —"}
            </option>
            {contacts.map((contact, index) => (
              <option key={index} value={index}>{contactText(contact) || `ผู้ติดต่อ ${index + 1}`}</option>
            ))}
          </Select>
        ) : (
          <span className={styles.preview}>{naText(customer?.contactPerson)}</span>
        )}
      </label>
    </div>
  );
}
