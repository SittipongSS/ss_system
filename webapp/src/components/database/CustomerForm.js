"use client";
// ฟอร์มลูกค้า — ใช้ร่วม 2 จุด: โมดัลเพิ่มลูกค้า (/database/customers) กับโมดัล
// แก้ไขลูกค้า (/database/customers/[id]) ตามกฎ [[edit-reuses-create-form]]
// (มติผู้ใช้ 2026-07-17: หน้าสร้างเป็นยังไง ปุ่มแก้ต้องกดแล้วได้อันนั้น)
//
// ก่อนหน้านี้เป็นฟอร์มคนละชุดที่ก๊อปกันมา แล้วเพี้ยนกันไปแล้วจริง: ป้ายเบอร์โทร
// ("เบอร์โทรบริษัท" vs "เบอร์โทร"), ลำดับช่อง, และคลาสความกว้าง (col-span-2 ล้วน
// vs col-span-2 sm:col-span-1) — จอมือถือแสดงคนละแบบ.
//
// ต่างกันได้แค่ "โหมด" ผ่าน props: showTeams — ช่องทีมดูแลมีเฉพาะตอนแก้ เพราะ
// ตอนสร้าง server ตั้งทีมให้จากคนสร้าง ส่วนการ "ย้ายทีมดูแล" เป็น cross-team
// management action ที่ API เปิดให้เฉพาะ superuser (customers/[id] PATCH).
import Select from "@/components/ui/Select";
import BrandsEditor from "@/components/database/BrandsEditor";
import ContactsEditor from "@/components/database/ContactsEditor";
import NationalIdInput from "@/components/ui/NationalIdInput";
import PhoneInput from "@/components/ui/PhoneInput";
import { normalizeBrands } from "@/lib/master/brands";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { TEAMS, TEAM_LABELS } from "@/lib/permissions";

export const EMPTY_CUSTOMER = {
  arCode: "", name: "", customerType: "company", taxId: "", branchCode: "00000",
  phone: "", address: "", shippingAddress: "", brands: [], contacts: [], creditTerms: "",
  teams: [],
};

// แปลงลูกค้าจาก API → state ของฟอร์ม (โมดัลแก้ใช้ตอนเปิด).
// รวม fallback ข้อมูลยุคเก่าไว้ที่นี่ที่เดียว — แถวที่ยังไม่ย้ายมา teams[]/brands[]/
// contacts[] ต้องเปิดฟอร์มแล้วเห็นค่าเดิม ไม่ใช่ว่างแล้วบันทึกทับหาย
export const customerToForm = (c) => ({
  ...EMPTY_CUSTOMER,
  arCode: c.arCode || "", name: c.name || "",
  customerType: c.customerType || "company",
  taxId: c.taxId || "", branchCode: c.branchCode || "00000",
  phone: c.phone || "", address: c.address || "",
  shippingAddress: c.shippingAddress || "",
  brands: normalizeBrands(c.brands),
  // contacts[] (0033) — ยุคเก่าเก็บเป็นช่องเดี่ยว contactPerson/contactPhone/email
  contacts: Array.isArray(c.contacts) && c.contacts.length
    ? c.contacts
    : (c.contactPerson || c.contactPhone || c.email
        ? [{ role: "", name: c.contactPerson || "", phone: c.contactPhone || "", email: c.email || "" }]
        : []),
  creditTerms: c.creditTerms || "",
  // teams[] (0037) — ยุคเก่ามีทีมเดียวที่คอลัมน์ team
  teams: c.teams?.length ? c.teams : (c.team ? [c.team] : []),
});

export default function CustomerForm({
  form,
  onForm,                 // (patch) => void
  showTeams = false,      // true = โหมดแก้ (ช่องทีมดูแล)
  canEditTeams = false,   // superuser เท่านั้น (API บังคับซ้ำอยู่แล้ว)
}) {
  const set = (k) => (e) => onForm({ [k]: e?.target ? e.target.value : e });

  return (
    <>
      {/* Section 1 — ข้อมูลบริษัท */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">1. ข้อมูลบริษัท (Company Details)</h3>
        </div>
        <div className="form-grid cols-2">
          <div className="form-group col-span-2">
            <label>ประเภทลูกค้า <span className="text-[var(--red)]">*</span></label>
            <Select name="customerType" value={form.customerType} onChange={set("customerType")} className="premium-select w-full">
              <option value="company">นิติบุคคล (บริษัท)</option>
              <option value="individual">บุคคลธรรมดา</option>
            </Select>
            <span className="text-[11px] text-[var(--text-3)] mt-1">กำหนดชุดเอกสารแนบที่ต้องใช้ (แนบได้ที่หน้าลูกค้า)</span>
          </div>

          {showTeams && (
            <div className="form-group col-span-2">
              <label>ทีมดูแล {!canEditTeams && <span className="text-[11px] font-normal text-[var(--text-3)]">(เฉพาะหัวหน้า/แอดมินแก้ได้)</span>}</label>
              <div className="flex flex-wrap gap-2">
                {TEAMS.map((t) => {
                  const on = (form.teams || []).includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!canEditTeams}
                      onClick={() => onForm({ teams: on ? form.teams.filter((x) => x !== t) : [...(form.teams || []), t] })}
                      className={`btn text-xs ${on ? "btn-primary" : ""}`}
                      style={!canEditTeams ? { opacity: on ? 1 : 0.5, cursor: "default" } : undefined}
                    >
                      {TEAM_LABELS[t] || t}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-[var(--text-3)] mt-1">เลือกได้หลายทีม — ทีมที่เลือกจะแก้/อนุมัติลูกค้ารายนี้ได้</span>
            </div>
          )}

          <div className="form-group">
            <label>รหัสลูกค้า (AR Code) <span className="text-[var(--red)]">*</span></label>
            <input type="text" name="arCode" value={form.arCode} onChange={set("arCode")} required placeholder="เช่น AR-001" className="premium-input w-full font-mono" />
          </div>
          <div className="form-group">
            <label>{CUSTOMER_NAME_LABEL} <span className="text-[var(--red)]">*</span></label>
            <input type="text" name="name" value={form.name} onChange={set("name")} required placeholder="ชื่อลูกค้า บริษัท หรือบุคคล..." className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>เลขประจำตัวผู้เสียภาษี</label>
            <NationalIdInput name="taxId" value={form.taxId} onChange={(v) => onForm({ taxId: v })} placeholder="เลข 13 หลัก (ถ้ามี)" className="w-full" />
          </div>
          <div className="form-group">
            <label>สาขา (Branch)</label>
            <input type="text" name="branchCode" value={form.branchCode} onChange={set("branchCode")} placeholder="00000" className="premium-input w-full font-mono" />
            <span className="text-[11px] text-[var(--text-3)] mt-1">00000 = สำนักงานใหญ่</span>
          </div>
          <div className="form-group col-span-2">
            <label>เบอร์โทรบริษัท</label>
            <PhoneInput name="phone" value={form.phone} onChange={(v) => onForm({ phone: v })} placeholder="เช่น 02-123-4567" className="w-full" />
          </div>
          <div className="form-group col-span-2">
            <label>ที่อยู่ลูกค้า (ออกเอกสาร) <span className="text-[var(--red)]">*</span></label>
            <textarea name="address" value={form.address} onChange={set("address")} required rows={2} placeholder="ที่อยู่สำหรับออกเอกสาร..." className="premium-input w-full" style={{ height: "80px", padding: "10px 12px", resize: "none" }} />
          </div>
          <div className="form-group col-span-2">
            <label>ที่อยู่จัดส่ง (ถ้าต่างจากที่อยู่ออกเอกสาร)</label>
            <textarea name="shippingAddress" value={form.shippingAddress} onChange={set("shippingAddress")} rows={2} placeholder="เว้นว่าง = ใช้ที่อยู่ออกเอกสารเป็นที่อยู่จัดส่ง" className="premium-input w-full" style={{ height: "80px", padding: "10px 12px", resize: "none" }} />
          </div>
          <div className="form-group col-span-2">
            <label>แบรนด์สินค้า</label>
            <BrandsEditor value={form.brands} onChange={(v) => onForm({ brands: v })} />
            <span className="text-[11px] text-[var(--text-3)] mt-1">ใส่ได้หลายแบรนด์</span>
          </div>
        </div>
      </div>

      {/* Section 2 — ผู้ติดต่อ */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">2. ผู้ติดต่อ (Contacts)</h3>
          <span className="text-[11px] text-[var(--text-3)]">เพิ่มได้หลายคน แยกตามแผนก (จัดซื้อ/การเงิน/เทคนิค) — คนแรกถือเป็นผู้ติดต่อหลัก</span>
        </div>
        <ContactsEditor value={form.contacts} onChange={(contacts) => onForm({ contacts })} />
      </div>

      {/* Section 3 — ข้อมูลเพิ่มเติม */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">3. ข้อมูลเพิ่มเติม (Additional)</h3>
        </div>
        <div className="form-grid cols-2">
          <div className="form-group col-span-2">
            <label>เงื่อนไขเครดิต (Credit Terms)</label>
            <input type="text" name="creditTerms" value={form.creditTerms} onChange={set("creditTerms")} placeholder="เช่น เครดิต 30 วัน" className="premium-input w-full" />
          </div>
          <div className="form-group col-span-2">
            <span className="text-[11px] text-[var(--text-3)]">
              แผนที่และเอกสารแนบ (สัญญา/หนังสือรับรอง/ภพ.20 ฯลฯ) เพิ่มได้ที่หน้าข้อมูลลูกค้า
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
