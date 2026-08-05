"use client";
// ── แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR · FM-RD-01 Rev.02) ──────────────────
//
// ⭐ **พับเป็นส่วน ๆ ในหน้าเปิดคำร้อง** (มติผู้ใช้ 2026-08-06) — ฟอร์มกระดาษมี ~48 ช่อง
// กางหมดพร้อมกันคือหน้าที่เลื่อนไม่จบ · แต่แยกไปอีกหน้าก็ทำให้คนกรอกครึ่งเดียวแล้วลืม
//
// ⚠️ ใช้ `<details>` ของเบราว์เซอร์ ไม่ใช่ state ของตัวเอง — เปิด/ปิดได้ด้วยคีย์บอร์ด
// และ Ctrl+F ของเบราว์เซอร์หาเจอในส่วนที่ปิดอยู่ ซึ่ง accordion ที่เขียนเองมักทำไม่ได้
//
// ⚠️ ครึ่งหนึ่งของฟอร์มกระดาษ **ระบบรู้อยู่แล้ว** (ลูกค้า · ดีล · ผู้ร้องขอ · มูลค่าโปรเจกต์
// · จำนวนกลิ่น) ⇒ ขึ้นเป็นช่องเส้นประ ไม่ให้พิมพ์ซ้ำแล้วขัดกับของจริง
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import { SCENTOTYPES, SCENT_PERFORMANCE } from "@/lib/requests/kinds/rd/scentBriefTypes";
import styles from "./requestForm.module.css";

export const PDR_REQUEST_TYPES = [
  { value: "new_product", label: "New Product" },
  { value: "modification", label: "Product Modification" },
  { value: "rd_test", label: "R&D Test" },
  { value: "cost_reduction", label: "Cost Reduction" },
];

const TEXTURE = [
  { value: "", label: "— เลือก —" },
  { value: "standard", label: "STANDARD" },
  { value: "premium", label: "PREMIUM" },
];

const CUSTOMER_KIND = [
  { value: "", label: "— เลือก —" },
  { value: "new", label: "ลูกค้าใหม่" },
  { value: "existing", label: "ลูกค้าเก่า" },
];

export const emptyPdr = () => ({
  requestType: "", customerBrand: "", moodTone: "", brandDirection: "",
  shipTo: "", customerKind: "", targetDemographic: "", targetPsychographic: "",
  targetPainpoint: "", productKind: "", wantedAt: "", sellFrom: "",
  targetCost: "", targetPrice: "", moq: "", texture: "", color: "",
  packSize: "", brandSample: "", specialRequirements: "", projectValue: "",
});

// ช่องที่ระบบเติมให้ — เส้นประ อ่านอย่างเดียว (แพตเทิร์นเดียวกับ "เติมจาก SO")
function Derived({ label, value, from }) {
  return (
    <div className="form-group">
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.derived} data-empty={value ? undefined : "1"}>{value || from}</div>
    </div>
  );
}

function Section({ title, note, children, open = false }) {
  return (
    <details className={styles.pdrSection} open={open}>
      <summary className={styles.pdrSummary}>{title}</summary>
      <div className={styles.pdrBody}>
        {note && <small className={styles.hint}>{note}</small>}
        {children}
      </div>
    </details>
  );
}

// ติ๊กแล้วเขียนต่อ — กลุ่มลูกค้าเป้าหมาย / Value Proposition (มติผู้ใช้)
function TickAndWrite({ label, value, onChange, disabled }) {
  const on = value != null && value !== "";
  return (
    <div className="form-group">
      <label className={styles.checkRow}>
        <input
          type="checkbox" checked={on} disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? " " : "")}
        />
        <span className={styles.checkLabel}>{label}</span>
      </label>
      {on && (
        <Input
          value={value.trim()} disabled={disabled} aria-label={label}
          onChange={(e) => onChange(e.target.value || " ")}
        />
      )}
    </div>
  );
}

export default function PdrForm({
  value = {}, onChange, briefs = [], onBriefsChange, disabled = false,
  scentCount = null, customer = null, deal = null, requester = null,
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setBrief = (i, patch) => onBriefsChange(
    briefs.map((b, j) => (i === j ? { ...b, ...patch } : b)),
  );
  const toggle = (i, field, key) => {
    const list = briefs[i]?.[field] || [];
    setBrief(i, { [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] });
  };

  return (
    <div className={styles.pdr}>
      <div className={styles.pdrHead}>
        <strong>แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR)</strong>
        <span className={styles.pdrCode}>FM-RD-01</span>
      </div>

      <Section title="ข้อมูลคำขอ" open note="ผู้ร้องขอ วันที่ และแผนก ระบบเติมให้จากคนที่เปิดใบ">
        <div className="form-grid">
          <Derived label="ผู้ร้องขอ (AE)" value={requester} from="เติมจากผู้เปิดใบ" />
          <div className="form-group">
            <label htmlFor="pdr-type">ประเภทของคำขอ</label>
            <Select
              id="pdr-type" value={value.requestType} disabled={disabled}
              onChange={(e) => set({ requestType: e.target.value })}
              options={[{ value: "", label: "— เลือก —" }, ...PDR_REQUEST_TYPES]}
            />
          </div>
        </div>
      </Section>

      <Section title="ข้อมูลลูกค้า">
        <div className="form-grid">
          <Derived label="ลูกค้า" value={customer} from="เติมจาก SO" />
          <Derived label="ดีล" value={deal} from="เติมจาก SO" />
          {/* ⚠️ **ไม่ derive จากดีล** — ฟอร์มถาม "มูลค่าโปรเจกต์ทั้งหมด" ซึ่งเป็นทั้ง
              โครงการ ไม่ใช่แค่ค่าออกแบบกลิ่นที่อยู่ในดีล/SO ใบนี้ · ลูกค้าอาจจ่ายค่า
              ออกแบบเก้าหมื่น แต่โครงการรวมทั้งปีเป็นล้าน (ผู้ใช้ทักมาเอง) */}
          <div className="form-group">
            <label htmlFor="pdr-value">มูลค่าโปรเจกต์ทั้งหมด</label>
            <Input id="pdr-value" value={value.projectValue || ""} disabled={disabled}
              placeholder="ทั้งโครงการ ไม่ใช่แค่ค่าออกแบบกลิ่น"
              onChange={(e) => set({ projectValue: e.target.value })} />
          </div>
          <Derived
            label="จำนวนกลิ่นที่ต้องการพัฒนา"
            value={scentCount != null ? `${scentCount} กลิ่น` : ""}
            from="เติมจากใบสั่งขาย"
          />
          <div className="form-group">
            <label htmlFor="pdr-brand">ชื่อแบรนด์</label>
            <Input id="pdr-brand" value={value.customerBrand} disabled={disabled}
              onChange={(e) => set({ customerBrand: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-mood">Mood &amp; Tone</label>
            <Input id="pdr-mood" value={value.moodTone} disabled={disabled}
              onChange={(e) => set({ moodTone: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-dir">ทิศทางการเติบโตของแบรนด์</label>
            <Input id="pdr-dir" value={value.brandDirection} disabled={disabled}
              onChange={(e) => set({ brandDirection: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-ship">ที่อยู่จัดส่งตัวอย่าง</label>
            <Input id="pdr-ship" value={value.shipTo} disabled={disabled}
              onChange={(e) => set({ shipTo: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-ckind">ประเภทลูกค้า</label>
            <Select id="pdr-ckind" value={value.customerKind} disabled={disabled}
              onChange={(e) => set({ customerKind: e.target.value })} options={CUSTOMER_KIND} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-pkind">ประเภทสินค้า</label>
            <Input id="pdr-pkind" value={value.productKind} disabled={disabled}
              onChange={(e) => set({ productKind: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-want">วันที่ต้องการสินค้า</label>
            <DateInput id="pdr-want" value={value.wantedAt} disabled={disabled}
              onChange={(v) => set({ wantedAt: v })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-sell">วันที่ต้องการจำหน่าย</label>
            <DateInput id="pdr-sell" value={value.sellFrom} disabled={disabled}
              onChange={(v) => set({ sellFrom: v })} />
          </div>
        </div>
        <span className={styles.fieldLabel}>กลุ่มลูกค้าเป้าหมาย — ติ๊กแล้วเขียนต่อ</span>
        <TickAndWrite label="DemoGraphic (เพศ · อายุ · การศึกษา · รายได้)" disabled={disabled}
          value={value.targetDemographic} onChange={(v) => set({ targetDemographic: v })} />
        <TickAndWrite label="PsychoGraphic (ความสนใจ · ไลฟ์สไตล์)" disabled={disabled}
          value={value.targetPsychographic} onChange={(v) => set({ targetPsychographic: v })} />
        <TickAndWrite label="Painpoint (ทำไมต้องทำแบรนด์นี้)" disabled={disabled}
          value={value.targetPainpoint} onChange={(v) => set({ targetPainpoint: v })} />
      </Section>

      {/* ⭐ ชั้นกลางของโครงสามชั้น — จำนวนก้อนมาจากใบสั่งขาย ไม่มีปุ่มเพิ่ม/ลบ */}
      <Section
        title={`บรีฟรายกลิ่น${briefs.length ? ` — ${briefs.length} ก้อน` : ""}`}
        open={briefs.length > 0}
        note="จำนวนก้อนมาจากใบสั่งขาย — แต่ละกลิ่นมีบรีฟของตัวเอง กรอกทีละก้อนได้ ไม่ต้องครบถึงจะบันทึก"
      >
        {!briefs.length ? (
          <small className={styles.hint}>เลือกใบสั่งขายก่อน แล้วบล็อกบรีฟจะขึ้นตามจำนวนกลิ่นที่ขาย</small>
        ) : briefs.map((brief, i) => (
          <div key={i} className={styles.briefCard}>
            <div className="form-group">
              <label htmlFor={`brief-label-${i}`}>กลิ่นที่ {i + 1} — ชื่อเรียก</label>
              <Input
                id={`brief-label-${i}`} value={brief.label || ""} disabled={disabled}
                placeholder="เช่น แนวสดชื่น"
                onChange={(e) => setBrief(i, { label: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor={`brief-body-${i}`}>บรีฟกลิ่น</label>
              <Textarea
                variant="data" id={`brief-body-${i}`} rows={3} maxLength={4000}
                value={brief.brief || ""} disabled={disabled}
                placeholder="โทนกลิ่นที่ต้องการ · ตัวอย่างอ้างอิง · ข้อจำกัด"
                onChange={(e) => setBrief(i, { brief: e.target.value })}
              />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor={`brief-insp-${i}`}>แรงบันดาลใจ</label>
                <Input id={`brief-insp-${i}`} value={brief.inspiration || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { inspiration: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`brief-like-${i}`}>ช่วงกลิ่นที่ชื่นชอบ</label>
                <Input id={`brief-like-${i}`} value={brief.likedNotes || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { likedNotes: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`brief-dis-${i}`}>กลิ่นที่ End-user ไม่ชอบ</label>
                <Input id={`brief-dis-${i}`} value={brief.dislikedNotes || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { dislikedNotes: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`brief-res-${i}`}>ให้ทำวิจัยเรื่อง</label>
                <Input id={`brief-res-${i}`} value={brief.researchTopic || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { researchTopic: e.target.value })} />
              </div>
            </div>
            {/* เลือกได้หลายอย่างทั้งคู่ (มติผู้ใช้) — chip ที่กดสลับได้ ไม่ใช่ดรอปดาวน์ */}
            <div className="form-group">
              <span className={styles.fieldLabel}>Scentotype</span>
              <div className={styles.mentionPicker}>
                {SCENTOTYPES.map((t) => {
                  const on = (brief.scentotypes || []).includes(t.value);
                  return (
                    <button
                      key={t.value} type="button" disabled={disabled} aria-pressed={on}
                      className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
                      onClick={() => toggle(i, "scentotypes", t.value)}
                    >
                      {on ? "✓ " : ""}{t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group">
              <span className={styles.fieldLabel}>Performance ของกลิ่น</span>
              <div className={styles.mentionPicker}>
                {SCENT_PERFORMANCE.map((t) => {
                  const on = (brief.performance || []).includes(t.value);
                  return (
                    <button
                      key={t.value} type="button" disabled={disabled} aria-pressed={on}
                      className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
                      onClick={() => toggle(i, "performance", t.value)}
                    >
                      {on ? "✓ " : ""}{t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </Section>

      <Section title="ข้อกำหนดผลิตภัณฑ์">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="pdr-cost">Target Cost / KG (F/FB ไม่รวมบรรจุภัณฑ์)</label>
            <Input id="pdr-cost" value={value.targetCost} disabled={disabled}
              onChange={(e) => set({ targetCost: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-price">Target Price / Unit (ราคาขาย)</label>
            <Input id="pdr-price" value={value.targetPrice} disabled={disabled}
              onChange={(e) => set({ targetPrice: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-moq">MOQ ที่คาดหวัง</label>
            <Input id="pdr-moq" value={value.moq} disabled={disabled}
              onChange={(e) => set({ moq: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-tex">ลักษณะเนื้อผลิตภัณฑ์</label>
            <Select id="pdr-tex" value={value.texture} disabled={disabled}
              onChange={(e) => set({ texture: e.target.value })} options={TEXTURE} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-color">สีเนื้อผลิตภัณฑ์</label>
            <Input id="pdr-color" value={value.color} disabled={disabled}
              onChange={(e) => set({ color: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-pack">ขนาดบรรจุภัณฑ์และจำนวนต่อกลิ่น</label>
            <Input id="pdr-pack" value={value.packSize} disabled={disabled}
              onChange={(e) => set({ packSize: e.target.value })} />
          </div>
          <div className="form-group col-span-2">
            <label htmlFor="pdr-sample">ตัวอย่างแบรนด์ (กลิ่นที่ชอบ)</label>
            <Input id="pdr-sample" value={value.brandSample} disabled={disabled}
              onChange={(e) => set({ brandSample: e.target.value })} />
          </div>
        </div>
      </Section>

      <Section title="ข้อกำหนดด้านเอกสารและกฎระเบียบ"
        note="เอกสารที่ติ๊กจะยังไม่สร้างคำร้องขอเอกสาร — ฟอร์มระบุเองว่าได้รับหลังผลิตเป็นสินค้าแล้ว">
        <div className="form-group col-span-2">
          <label htmlFor="pdr-special">ข้อกำหนดเฉพาะอื่น ๆ</label>
          <Textarea
            variant="data" id="pdr-special" rows={2} maxLength={2000}
            value={value.specialRequirements} disabled={disabled}
            placeholder="เช่น ห้ามใช้สารพาราเบน · Vegan · No Alcohol"
            onChange={(e) => set({ specialRequirements: e.target.value })}
          />
        </div>
      </Section>
    </div>
  );
}
