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
//
// โหมดรหัส (มติผู้ใช้ 2026-08-12 · mig 0230): `onCodeMode` = โหมดสร้าง (มีสวิตช์
// "ระบบใหม่" เปิด/ปิดได้ทุกครั้ง · เปิด = แถบรหัสโชว์เลขถัดไป ไม่มีช่องให้พิมพ์) ·
// ไม่ส่ง = โหมดแก้ (ช่องรหัสธรรมดา + `arLocked` เมื่อรหัสนั้นระบบเป็นคนออกให้)
import { useEffect, useState } from "react";
import CodeStrip from "@/components/ui/CodeStrip";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import AddressesEditor from "@/components/database/AddressesEditor";
import BrandsEditor from "@/components/database/BrandsEditor";
import ContactsEditor from "@/components/database/ContactsEditor";
import NationalIdInput from "@/components/ui/NationalIdInput";
import PhoneInput from "@/components/ui/PhoneInput";
import { customerAddresses, legacyAddressMirror } from "@/lib/master/addresses";
import {
  isCompleteTaxId, splitTaxIdMatches, taxIdDigits, taxIdDuplicateError, taxIdOtherBranchWarning,
} from "@/lib/master/customerTaxId";
import { normalizeBrands } from "@/lib/master/brands";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import {
  AR_MANUAL_HINT, CODE_MODE_AUTO, CODE_MODE_MANUAL, arCodeParts, codeModeOf,
} from "@/lib/master/masterCodes";
import { TEAMS, TEAM_LABELS } from "@/lib/permissions";

// ที่อยู่/สาขา ไม่อยู่ในนี้แล้ว — ย้ายไป addresses[] (mig 0202) ทั้งก้อน
// server เป็นคนกระจกกลับลง address/shippingAddress/branchCode ให้เอง
export const EMPTY_CUSTOMER = {
  arCode: "", name: "", nameEn: "", customerType: "company", taxId: "",
  phone: "", addresses: [], brands: [], contacts: [], creditTerms: "",
  teams: [],
};

// แปลงลูกค้าจาก API → state ของฟอร์ม (โมดัลแก้ใช้ตอนเปิด).
// รวม fallback ข้อมูลยุคเก่าไว้ที่นี่ที่เดียว — แถวที่ยังไม่ย้ายมา teams[]/brands[]/
// contacts[] ต้องเปิดฟอร์มแล้วเห็นค่าเดิม ไม่ใช่ว่างแล้วบันทึกทับหาย
export const customerToForm = (c) => ({
  ...EMPTY_CUSTOMER,
  arCode: c.arCode || "", name: c.name || "", nameEn: c.nameEn || "",
  customerType: c.customerType || "company",
  taxId: c.taxId || "",
  phone: c.phone || "",
  // addresses[] (0202) — แถวที่ยังไม่ backfill อ่านจากช่องเดี่ยวเดิมให้เห็นค่าเดิม
  addresses: customerAddresses(c),
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
  /* ทีมที่ *เลือกได้* — superuser ไม่ส่งมา = เลือกได้ทุกทีม · คนสายทีมที่อยู่หลายทีม
     ส่งทีมของตัวเองมา แล้วเลือกได้ว่าลูกค้ารายนี้ให้ทีมไหนดูแล (มติ 2026-08-11)
     ⚠️ ด่านจริงอยู่ที่ API — ที่นี่แค่ไม่กางตัวเลือกที่กดไปก็โดนตีกลับ */
  teamOptions = TEAMS,
  // ── โหมดรหัสลูกค้า (มติผู้ใช้ 2026-08-12 "แบบ A") ────────────────────────
  // onCodeMode = null (ค่าตั้งต้น) แปลว่า **ไม่มีสวิตช์** = โหมดแก้: รหัสมีอยู่แล้ว
  // สวิตช์เลือกวิธีออกรหัสจึงไม่มีความหมาย · โหมดสร้างส่งมาทั้งคู่
  codeMode = CODE_MODE_MANUAL,
  onCodeMode = null,
  nextArNumber = null,    // เลขถัดไปสำหรับแถบรหัส (พรีวิว ไม่ใช่เลขที่จองแล้ว)
  arLocked = false,       // รหัสที่ระบบออกให้ = ล็อกตอนแก้ (API บังคับซ้ำอยู่แล้ว)
  selfId = null,          // โหมดแก้: id ของใบนี้เอง — กันรายงานว่า "ซ้ำกับตัวเอง"
}) {
  const set = (k) => (e) => onForm({ [k]: e?.target ? e.target.value : e });
  const mode = codeModeOf(codeMode);
  const autoCode = !!onCodeMode && mode === CODE_MODE_AUTO;
  // ป้ายเปลี่ยนตามประเภทลูกค้า — "ข้อมูลบริษัท / เบอร์โทรบริษัท / เลขผู้เสียภาษี" กลาย
  // เป็นคำที่ผิดทันทีเมื่อเลือกบุคคลธรรมดา (กฎในเอกสารฟอร์ม: ป้ายต้องเรียกชื่อสิ่งที่
  // อยู่ตรงหน้าจริง ๆ ไม่ใช่ชื่อที่ใช้ได้กับกรณีส่วนใหญ่)
  const isCompany = form.customerType !== "individual";

  // ── เช็คลูกค้าซ้ำจากเลขผู้เสียภาษี ตั้งแต่กรอกครบ 13 หลัก (มติผู้ใช้ 2026-08-12) ──
  // เตือน **ก่อน** กรอกทั้งใบเสร็จแล้วค่อยโดนตีกลับตอนกดบันทึก · ด่านจริงอยู่ที่ API
  // (ทั้ง POST/PATCH) ตัวนี้คือการเอาคำตอบเดียวกันมาวางตรงหน้าให้เร็วขึ้น
  const [taxMatches, setTaxMatches] = useState([]);
  const taxKey = taxIdDigits(form.taxId);
  useEffect(() => {
    if (!isCompleteTaxId(taxKey)) { setTaxMatches([]); return undefined; }
    // หน่วงไว้ก่อนยิง — เลขครบ 13 หลักเกิดระหว่างพิมพ์/แก้กลางเลขได้หลายครั้ง
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/master/customers/by-tax-id?taxId=${taxKey}`, { signal: controller.signal });
        setTaxMatches(res.ok ? await res.json() : []);
      } catch {
        // ถามไม่ได้ = ไม่เตือน (ไม่ใช่เตือนผิด) — ด่านจริงยังอยู่ที่ API ตอนบันทึก
        setTaxMatches([]);
      }
    }, 350);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [taxKey]);

  // สาขาที่ใช้เทียบ = สาขาของที่อยู่ออกบิลหลักในฟอร์มนี้ (คีย์ซ้ำคือ เลขภาษี + สาขา)
  const formBranchCode = legacyAddressMirror(form.addresses || []).branchCode;
  const { sameBranch, otherBranch } = splitTaxIdMatches(taxMatches, {
    taxId: taxKey, branchCode: formBranchCode, excludeId: selfId,
  });
  const taxDupError = taxIdDuplicateError(sameBranch, { branchCode: formBranchCode });
  const taxWarning = taxIdOtherBranchWarning(otherBranch);

  return (
    <>
      {/* ── รหัสลูกค้า + สวิตช์โหมด — อยู่เหนือทุก section เพราะเป็น "สิ่งที่กำลังจะถูก
          สร้าง" ไม่ใช่ช่องข้อมูลช่องหนึ่ง (มติผู้ใช้ 2026-08-12 เลือกแบบ A จากม็อก) ── */}
      <div className="mb-[22px]">
        <div className="form-group">
          <label className="flex items-center gap-2 flex-wrap">
            <span>รหัสลูกค้า (AR Code) <span className="text-[var(--red)]">*</span></span>
            {onCodeMode && (
              <button
                type="button"
                className="ui-switch ml-auto"
                data-on={mode === CODE_MODE_AUTO ? "1" : undefined}
                aria-pressed={mode === CODE_MODE_AUTO}
                onClick={() => onCodeMode(mode === CODE_MODE_AUTO ? CODE_MODE_MANUAL : CODE_MODE_AUTO)}
              >
                <i aria-hidden="true" />ระบบใหม่ — ออกรหัสให้เอง
              </button>
            )}
          </label>
          {autoCode ? (
            <>
              <CodeStrip parts={arCodeParts(nextArNumber)} ariaLabel="รหัสลูกค้าที่ระบบจะออกให้" />
              <span className="text-[11px] text-[var(--text-3)] mt-1">
                ระบบจองเลขตอนกดบันทึก — ถ้ามีคนบันทึกก่อน เลขที่ได้จริงจะขยับไปตัวถัดไป
              </span>
            </>
          ) : (
            <>
              <input
                type="text"
                name="arCode"
                value={form.arCode}
                onChange={set("arCode")}
                required
                readOnly={arLocked}
                placeholder="เช่น AR-109"
                className="premium-input w-full font-mono"
                style={arLocked ? { color: "var(--text-3)", background: "var(--panel-2)", cursor: "not-allowed" } : undefined}
              />
              <span className="text-[11px] text-[var(--text-3)] mt-1">
                {arLocked
                  ? "รหัสนี้ออกโดยระบบ (เลขรันอัตโนมัติ) จึงแก้ไม่ได้ — ต้องการรหัสอื่นต้องสร้างรายการใหม่"
                  : `กรอกเอง ${AR_MANUAL_HINT} — ห้ามซ้ำกับรหัสที่มีอยู่`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Section 1 — ข้อมูลลูกค้า */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">
            {isCompany ? "1. ข้อมูลบริษัท (Company Details)" : "1. ข้อมูลลูกค้า (Customer Details)"}
          </h3>
        </div>
        <div className="form-grid cols-2">
          <div className="form-group col-span-2">
            <label>ประเภทลูกค้า <span className="text-[var(--red)]">*</span></label>
            {/* ชุดตายตัว 2 ตัว = แผ่นเลือก ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล v2) */}
            <OptionTiles
              value={form.customerType || "company"}
              onChange={(v) => onForm({ customerType: v })}
              ariaLabel="ประเภทลูกค้า"
              options={[
                { value: "company", label: "นิติบุคคล (บริษัท)", description: "ใช้ ภพ.20 · หนังสือรับรอง" },
                { value: "individual", label: "บุคคลธรรมดา", description: "ใช้สำเนาบัตรประชาชน" },
              ]}
            />
            <span className="text-[11px] text-[var(--text-3)] mt-1">กำหนดชุดเอกสารแนบที่ต้องใช้ (แนบได้ที่หน้าลูกค้า)</span>
          </div>

          {showTeams && (
            <div className="form-group col-span-2">
              <label>ทีมดูแล {!canEditTeams && <span className="text-[11px] font-normal text-[var(--text-3)]">(เฉพาะหัวหน้า/แอดมินแก้ได้)</span>}</label>
              <div className="flex flex-wrap gap-2">
                {teamOptions.map((t) => {
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

          {/* ── ชื่อสองภาษา — ต้องมีอย่างน้อยหนึ่งภาษา (มติ 2026-08-22 · mig 0283) ──
              ⚠️ `required` **สลับข้างกันเอง**: ช่องหนึ่งบังคับเมื่ออีกช่องว่าง ⇒ กรอกภาษาไหน
              ก็ผ่าน แต่ปล่อยว่างทั้งคู่ไม่ได้ · ทำแบบนี้แทน state ตรวจเองเพราะฟอร์มนี้ใช้
              ด่านของเบราว์เซอร์อยู่แล้วทั้งใบ (API บังคับซ้ำที่ customerNameError)
              ⚠️ ชื่ออังกฤษ **ไม่ใช่ชื่อสำหรับแสดงคู่กัน** แบบหมวดสินค้า (`EN · TH`) —
              หน้าจอไทยล้วนตามเดิม ช่องนี้มีไว้ให้เอกสารอังกฤษ (IFRA/MSDS) หยิบไปใช้ */}
          <div className="form-group">
            <label>
              {CUSTOMER_NAME_LABEL}
              {!String(form.nameEn || "").trim() && <span className="text-[var(--red)]"> *</span>}
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={set("name")}
              required={!String(form.nameEn || "").trim()}
              placeholder="ชื่อลูกค้า บริษัท หรือบุคคล..."
              className="premium-input w-full"
            />
          </div>
          <div className="form-group">
            <label>
              ชื่อภาษาอังกฤษ
              {!String(form.name || "").trim() && <span className="text-[var(--red)]"> *</span>}
            </label>
            <Input
              type="text"
              name="nameEn"
              value={form.nameEn || ""}
              onChange={set("nameEn")}
              required={!String(form.name || "").trim()}
              placeholder="เช่น ABC International Co., Ltd."
            />
            <span className="text-[11px] text-[var(--text-3)] mt-1">
              ใช้บนเอกสารภาษาอังกฤษ (IFRA · MSDS) — กรอกอย่างน้อยหนึ่งภาษา
            </span>
          </div>
          <div className="form-group">
            <label>{isCompany ? "เลขประจำตัวผู้เสียภาษี" : "เลขประจำตัวประชาชน"}</label>
            <NationalIdInput name="taxId" value={form.taxId} onChange={(v) => onForm({ taxId: v })} placeholder="เลข 13 หลัก (ถ้ามี)" className="w-full" />
            {/* ซ้ำจริง (เลขเดียวกัน + สาขาเดียวกัน) = บันทึกไม่ผ่านแน่นอน — บอกตั้งแต่ตรงนี้
                ว่าไปชนกับรายไหน · คนละสาขา = เตือนเฉย ๆ เพราะเปิดสาขาเป็นงานปกติ */}
            {taxDupError && (
              <span className="text-[11px] text-[var(--red)] mt-1">{taxDupError}</span>
            )}
            {!taxDupError && taxWarning && (
              <span className="text-[11px] text-[var(--amber)] mt-1">{taxWarning}</span>
            )}
          </div>
          <div className="form-group">
            <label>{isCompany ? "เบอร์โทรบริษัท" : "เบอร์โทร"}</label>
            <PhoneInput name="phone" value={form.phone} onChange={(v) => onForm({ phone: v })} placeholder="เช่น 02-123-4567" className="w-full" />
          </div>
          <div className="form-group col-span-2">
            <label>แบรนด์สินค้า</label>
            <BrandsEditor value={form.brands} onChange={(v) => onForm({ brands: v })} />
            <span className="text-[11px] text-[var(--text-3)] mt-1">ใส่ได้หลายแบรนด์</span>
          </div>
          {/* เงื่อนไขเครดิตเคยเป็น section ของตัวเอง (“4. ข้อมูลเพิ่มเติม”) ที่มีช่องเดียว
              — section ทั้งอันเพื่อช่องเดียวอ่านเหมือนมีอะไรสำคัญรออยู่ข้างล่าง */}
          <div className="form-group col-span-2">
            <label>เงื่อนไขเครดิต (Credit Terms)</label>
            <input type="text" name="creditTerms" value={form.creditTerms} onChange={set("creditTerms")} placeholder="เช่น เครดิต 30 วัน" className="premium-input w-full" />
            <span className="text-[11px] text-[var(--text-3)] mt-1">
              แผนที่และเอกสารแนบ (สัญญา/หนังสือรับรอง/ภพ.20 ฯลฯ) เพิ่มได้ที่หน้าข้อมูลลูกค้า
            </span>
          </div>
        </div>
      </div>

      {/* Section 2 — ที่อยู่ (หลายรายการ, mig 0202) */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">2. ที่อยู่ (Addresses) <span className="text-[var(--red)]">*</span></h3>
          <span className="text-[11px] text-[var(--text-3)]">
            ใส่ได้หลายที่ (สำนักงานใหญ่ · สาขา · คลัง) แล้วเลือกตอนออกใบเสนอราคา — รายการแรกที่ใช้งานนั้นได้คือค่าตั้งต้น เลื่อนลำดับได้ด้วยลูกศร ·
            เลือกจังหวัด/อำเภอ/ตำบล แล้วระบบประกอบข้อความให้เอง · <b>เลขสาขา</b>ของที่อยู่ที่ใช้ออกเอกสารคือเลขที่จะไปอยู่บนใบกำกับภาษี
          </span>
        </div>
        <AddressesEditor value={form.addresses} onChange={(addresses) => onForm({ addresses })} />
      </div>

      {/* Section 3 — ผู้ติดต่อ */}
      <div className="mb-[22px]">
        <div className="border-b border-[var(--border)] pb-3 mb-5">
          <h3 className="font-semibold text-[var(--text)]">3. ผู้ติดต่อ (Contacts)</h3>
          <span className="text-[11px] text-[var(--text-3)]">เพิ่มได้หลายคน แยกตามแผนก (จัดซื้อ/การเงิน/เทคนิค) — คนแรกถือเป็นผู้ติดต่อหลัก</span>
        </div>
        <ContactsEditor value={form.contacts} onChange={(contacts) => onForm({ contacts })} />
      </div>
    </>
  );
}
