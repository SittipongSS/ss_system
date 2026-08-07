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
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { SCENTOTYPES, SCENT_PERFORMANCE } from "@/lib/requests/kinds/rd/scentBriefTypes";
import { briefsDroppedByMerge, switchBriefMode } from "@/lib/requests/scentBriefs";
import {
  PDR_ARTWORK, PDR_CUSTOMER_KINDS, PDR_DOCUMENTS, PDR_FIELDS, PDR_PACKAGING_FORMS,
  PDR_REQUEST_TYPES, PDR_SECTIONS, PDR_TEXTURES, pdrFieldVisible,
} from "@/lib/requests/pdrFields";
import styles from "./requestForm.module.css";


// ⭐ **ป้ายชื่อและหัวข้อมาจากทะเบียนกลาง** (`lib/requests/pdrFields.js`) — ฟอร์มยัง
// เป็นเจ้าของ *ชนิดช่องกรอก* และช่องเส้นประที่ระบบเติมให้ แต่ **ไม่เป็นเจ้าของคำ**
// อีกต่อไป · เดิมทั้งสามจอเขียนคำเอง ⇒ ผู้ใช้ทักว่า "ฟอร์มกรอก ตอนโชว์ ตอนแก้
// มันไม่เหมือนกันเลย" ซึ่งจริงทุกมิติ: ชื่อหัวข้อ ลำดับ และคำในวงเล็บ
const FIELD = Object.fromEntries(PDR_FIELDS.map((f) => [f.key, f]));
const SECTION = Object.fromEntries(PDR_SECTIONS.map((x) => [x.key, x]));

// ป้ายเต็มของฟอร์ม = ป้ายกลาง + คำขยายในวงเล็บ (จอแสดง/เอกสารไม่เอาวงเล็บ กินที่)
const label = (key) => (FIELD[key].hint
  ? `${FIELD[key].label} (${FIELD[key].hint})`
  : FIELD[key].label);

const withBlank = (options) => [{ value: "", label: "— เลือก —" }, ...options];

// ⭐ derive จากทะเบียน — เพิ่มช่องในทะเบียนแล้วฟอร์มรู้เองว่าต้องมีคีย์นั้น
// (เดิมไล่เขียนมือ ⇒ ช่องใหม่จะเป็น undefined แล้ว React ด่าเรื่อง uncontrolled input)
export const emptyPdr = () => Object.fromEntries(
  PDR_FIELDS.filter((f) => f.column).map((f) => [f.key, f.type === "multi" ? [] : ""]),
);

// ⭐ ติ๊กได้หลายอัน — chip ที่กดสลับได้ ชุดเดียวกับ Scentotype/Performance ในบรีฟ
// ⚠️ **ไม่ติ๊กไว้ล่วงหน้า** (มติผู้ใช้เรื่องหมวดเอกสาร) — ค่าเริ่มต้นที่ติ๊กไว้ให้
// แปลว่าไม่มีใครตัดสินใจ แล้วเสียงลืมติ๊กของที่ควรมีจริงจะกลืนหายไปกับค่าเริ่มต้น
function ChipPicker({ label, options, value, onChange, disabled, hint }) {
  const list = Array.isArray(value) ? value : [];
  const toggle = (v) => onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="form-group col-span-2">
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.mentionPicker}>
        {options.map((o) => {
          const on = list.includes(o.value);
          return (
            <button
              key={o.value} type="button" disabled={disabled} aria-pressed={on}
              className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
              onClick={() => toggle(o.value)}
            >
              {on ? "✓ " : ""}{o.label}
            </button>
          );
        })}
      </div>
      {hint && <small className={styles.hint}>{hint}</small>}
    </div>
  );
}

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
  coordinator = null, contactName = null, contactPhone = null, sampleDue = null,
}) {
  // ⭐ ลูกค้าซื้อหลายกลิ่นแต่บอกมาแนวเดียวเป็นเรื่องปกติ (มติผู้ใช้) — รวบเป็นก้อนเดียว
  // แล้ว RD ส่งหลาย direction จากก้อนนั้น ซึ่งระบบรองรับอยู่แล้ว · จำนวนกลิ่นที่ขาย
  // เป็น **เพดาน** ไม่ใช่จำนวนที่ต้องเท่ากัน
  const merged = scentCount != null && scentCount > 1 && briefs.length === 1;
  const canMerge = scentCount != null && scentCount > 1;
  // ⚠️ **สลับโหมดต้องไม่ทิ้งของที่พิมพ์ไปแล้ว** (มติผู้ใช้ 2026-08-08) — ของเดิมล้าง
  // ทุกก้อนทุกครั้ง แม้แต่ตอนแยก 1 → N ซึ่งไม่มีเหตุผลให้ทิ้งอะไรเลย
  // · รวบแล้วก้อนที่มีเนื้อจะหายจริง ⇒ **ถามก่อน** ด้วยโมดัลของบ้าน ไม่ใช่ `confirm()`
  //   ของเบราว์เซอร์ (ratchet ห้าม native feedback)
  const switchMode = async (merge) => {
    if (merge) {
      const dropped = briefsDroppedByMerge(briefs);
      if (dropped) {
        const ok = await confirmAction({
          title: "รวบเป็นบรีฟเดียว",
          description: `บรีฟอีก ${dropped} ก้อนที่กรอกไว้จะถูกลบ เหลือเฉพาะก้อนแรก — ยืนยันไหม`,
          confirmLabel: "รวบเป็นก้อนเดียว",
          tone: "danger",
        });
        if (!ok) return;
      }
    }
    onBriefsChange(switchBriefMode(briefs, { merge, scentCount }));
  };
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

      <Section title={SECTION.request.title} open note={SECTION.request.note}>
        <div className="form-grid">
          <Derived label={label("requester")} value={requester} from={FIELD.requester.from} />
          <Derived label={label("coordinator")} value={coordinator} from={FIELD.coordinator.from} />
          <Derived label={label("department")} value="การขายและบริการ" from={FIELD.department.from} />
          {/* ⚠️ วันเดียวกับช่อง "ต้องการคำตอบ" ของคำร้อง ไม่ใช่ช่องใหม่ — เก็บซ้ำ
              เมื่อไรก็ได้สองวันที่ขัดกันโดยไม่มีใครรู้ว่าอันไหนจริง */}
          <Derived label={label("sampleDue")} value={sampleDue} from={FIELD.sampleDue.from} />
          <div className="form-group">
            <label htmlFor="pdr-type">{label("requestType")}</label>
            <Select
              id="pdr-type" value={value.requestType} disabled={disabled}
              onChange={(e) => set({ requestType: e.target.value })}
              options={withBlank(PDR_REQUEST_TYPES)}
            />
          </div>
          {/* ⭐ ขึ้นเฉพาะประเภทที่กระดาษมีช่องกรอกต่อ — ซ่อนเฉย ๆ ไม่ล้างค่า
              (สลับประเภทไปมาแล้วของที่พิมพ์ไว้ต้องไม่หาย) */}
          {pdrFieldVisible(FIELD.prevProductCode, value) && (
            <div className="form-group">
              <label htmlFor="pdr-prev">{label("prevProductCode")}</label>
              <Input id="pdr-prev" mono value={value.prevProductCode || ""} disabled={disabled}
                onChange={(e) => set({ prevProductCode: e.target.value })} />
            </div>
          )}
        </div>
      </Section>

      <Section title={SECTION.customer.title}>
        <div className="form-grid">
          <Derived label={label("contactName")} value={contactName} from={FIELD.contactName.from} />
          <Derived label={label("contactPhone")} value={contactPhone} from={FIELD.contactPhone.from} />
          <Derived label={label("customer")} value={customer} from={FIELD.customer.from} />
          <Derived label={label("deal")} value={deal} from={FIELD.deal.from} />
          {/* ⚠️ **ไม่ derive จากดีล** — ฟอร์มถาม "มูลค่าโปรเจกต์ทั้งหมด" ซึ่งเป็นทั้ง
              โครงการ ไม่ใช่แค่ค่าออกแบบกลิ่นที่อยู่ในดีล/SO ใบนี้ · ลูกค้าอาจจ่ายค่า
              ออกแบบเก้าหมื่น แต่โครงการรวมทั้งปีเป็นล้าน (ผู้ใช้ทักมาเอง) */}
          <div className="form-group">
            <label htmlFor="pdr-value">{label("projectValue")}</label>
            <Input id="pdr-value" value={value.projectValue || ""} disabled={disabled}
              placeholder={FIELD.projectValue.placeholder}
              onChange={(e) => set({ projectValue: e.target.value })} />
          </div>
          <Derived
            label={label("scentCount")}
            value={scentCount != null ? `${scentCount} กลิ่น` : ""}
            from={FIELD.scentCount.from}
          />
          <div className="form-group">
            <label htmlFor="pdr-brand">{label("customerBrand")}</label>
            <Input id="pdr-brand" value={value.customerBrand} disabled={disabled}
              onChange={(e) => set({ customerBrand: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-mood">{label("moodTone")}</label>
            <Input id="pdr-mood" value={value.moodTone} disabled={disabled}
              onChange={(e) => set({ moodTone: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-dir">{label("brandDirection")}</label>
            <Input id="pdr-dir" value={value.brandDirection} disabled={disabled}
              onChange={(e) => set({ brandDirection: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-ship">{label("shipTo")}</label>
            <Input id="pdr-ship" value={value.shipTo} disabled={disabled}
              onChange={(e) => set({ shipTo: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-ckind">{label("customerKind")}</label>
            <Select id="pdr-ckind" value={value.customerKind} disabled={disabled}
              onChange={(e) => set({ customerKind: e.target.value })} options={withBlank(PDR_CUSTOMER_KINDS)} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-pkind">{label("productKind")}</label>
            <Input id="pdr-pkind" value={value.productKind} disabled={disabled}
              onChange={(e) => set({ productKind: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-want">{label("wantedAt")}</label>
            <DateInput id="pdr-want" value={value.wantedAt} disabled={disabled}
              onChange={(v) => set({ wantedAt: v })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-sell">{label("sellFrom")}</label>
            <DateInput id="pdr-sell" value={value.sellFrom} disabled={disabled}
              onChange={(v) => set({ sellFrom: v })} />
          </div>
        </div>
        <span className={styles.fieldLabel}>{FIELD.targetDemographic.group} — ติ๊กแล้วเขียนต่อ</span>
        <TickAndWrite label={label("targetDemographic")} disabled={disabled}
          value={value.targetDemographic} onChange={(v) => set({ targetDemographic: v })} />
        <TickAndWrite label={label("targetPsychographic")} disabled={disabled}
          value={value.targetPsychographic} onChange={(v) => set({ targetPsychographic: v })} />
        <TickAndWrite label={label("targetPainpoint")} disabled={disabled}
          value={value.targetPainpoint} onChange={(v) => set({ targetPainpoint: v })} />
      </Section>

      {/* ⭐ ชั้นกลางของโครงสามชั้น — จำนวนก้อนมาจากใบสั่งขาย ไม่มีปุ่มเพิ่ม/ลบ */}
      <Section
        title={`บรีฟกลิ่น${briefs.length ? ` — ${briefs.length} ก้อน` : ""}`}
        open={briefs.length > 0}
        note="กรอกทีละก้อนได้ ไม่ต้องครบถึงจะบันทึก"
      >
        {canMerge && (
          <div className={styles.topicAction}>
            {/* ⭐ แยก 1 → N ไม่ถามอะไร — ก้อนแรกอยู่ที่เดิม ที่เพิ่มมาเป็นก้อนว่าง
                ⚠️ รวบ N → 1 ถามก่อนเฉพาะตอนที่มีก้อนที่กรอกไว้จริงจะหาย */}
            <Button
              variant="quiet" size="sm" disabled={disabled}
              title={merged
                ? "ก้อนที่กรอกไว้อยู่ที่เดิม ที่เพิ่มมาเป็นก้อนว่าง"
                : "บรีฟก้อนที่ 2 เป็นต้นไปจะถูกลบ (ถามก่อน)"}
              onClick={() => switchMode(!merged)}
            >
              {merged ? `แยกบรีฟรายกลิ่น (${scentCount} ก้อน)` : "รวบเป็นบรีฟเดียว"}
            </Button>
          </div>
        )}
        {merged && (
          <small className={styles.hint}>
            บรีฟก้อนนี้ครอบทั้ง {scentCount} กลิ่น — RD ส่งได้หลาย direction จากก้อนเดียว
          </small>
        )}
        {!merged && canMerge && (
          <small className={styles.hint}>
            ลูกค้าบอกมาแนวเดียวสำหรับทุกกลิ่น? กด &ldquo;รวบเป็นบรีฟเดียว&rdquo; จะได้ไม่ต้องพิมพ์ซ้ำ
          </small>
        )}
        {!briefs.length ? (
          <small className={styles.hint}>เลือกใบสั่งขายก่อน แล้วบล็อกบรีฟจะขึ้นตามจำนวนกลิ่นที่ขาย</small>
        ) : briefs.map((brief, i) => (
          <div key={i} className={styles.briefCard}>
            <div className="form-group">
              <label htmlFor={`brief-label-${i}`}>
                {merged ? "ชื่อเรียกบรีฟ" : `กลิ่นที่ ${i + 1} — ชื่อเรียก`}
              </label>
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
            {/* เลือกได้หลายอย่างทั้งคู่ (มติผู้ใช้) — chip ที่กดสลับได้ ไม่ใช่ดรอปดาวน์
                ⭐ **Scentotype มีเส้นให้เขียนต่อหลังทุกตัวบนกระดาษ** (ข้อ 2.1.4) ⇒ ติ๊ก
                แล้วมีช่องข้อความโผล่ตามตัวที่ติ๊ก (mig 0222) · ไม่ติ๊ก = ไม่มีช่อง
                ⚠️ ข้อความของตัวที่ถูกติ๊กออกจะถูกทิ้งตอนบันทึก (ดู scentBriefs.js) */}
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
              {SCENTOTYPES.filter((t) => (brief.scentotypes || []).includes(t.value)).map((t) => (
                <div key={t.value} className={styles.scentotypeNote}>
                  <label htmlFor={`brief-${i}-st-${t.value}`}>{t.label}</label>
                  <Input
                    id={`brief-${i}-st-${t.value}`} disabled={disabled}
                    value={(brief.scentotypeNotes || {})[t.value] || ""}
                    placeholder="เขียนต่อได้ (เว้นว่างได้)"
                    onChange={(e) => setBrief(i, {
                      scentotypeNotes: { ...(brief.scentotypeNotes || {}), [t.value]: e.target.value },
                    })}
                  />
                </div>
              ))}
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

      <Section title={SECTION.spec.title}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="pdr-cost">{label("targetCost")}</label>
            <Input id="pdr-cost" value={value.targetCost} disabled={disabled}
              onChange={(e) => set({ targetCost: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-price">{label("targetPrice")}</label>
            <Input id="pdr-price" value={value.targetPrice} disabled={disabled}
              onChange={(e) => set({ targetPrice: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-moq">{label("moq")}</label>
            <Input id="pdr-moq" value={value.moq} disabled={disabled}
              onChange={(e) => set({ moq: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-tex">{label("texture")}</label>
            <Select id="pdr-tex" value={value.texture} disabled={disabled}
              onChange={(e) => set({ texture: e.target.value })} options={withBlank(PDR_TEXTURES)} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-color">{label("color")}</label>
            <Input id="pdr-color" value={value.color} disabled={disabled}
              onChange={(e) => set({ color: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-pack">{label("packSize")}</label>
            <Input id="pdr-pack" value={value.packSize} disabled={disabled}
              onChange={(e) => set({ packSize: e.target.value })} />
          </div>
          <ChipPicker
            label={label("packagingForms")} options={PDR_PACKAGING_FORMS} disabled={disabled}
            value={value.packagingForms} onChange={(v) => set({ packagingForms: v })}
          />
          <div className="form-group">
            <label htmlFor="pdr-art">{label("packagingArtwork")}</label>
            <Select id="pdr-art" value={value.packagingArtwork || ""} disabled={disabled}
              onChange={(e) => set({ packagingArtwork: e.target.value })}
              options={withBlank(PDR_ARTWORK)} />
            {/* ⚠️ มติผู้ใช้: บอกว่ามี = ต้องแนบจริง · บังคับตอนกดส่ง ไม่ใช่ตอนเปิดใบ
                (หน้าเปิดคำร้องยังแนบไฟล์ไม่ได้ ต้องมี id ของใบก่อน) */}
            {value.packagingArtwork === "has" && (
              <small className={styles.hint}>ต้องแนบไฟล์ภาพก่อนกดส่ง</small>
            )}
          </div>
          {/* 2.9 Value Proposition — ของทั้งใบ ไม่ใช่รายกลิ่น (มติผู้ใช้)
              ⚠️ **ติ๊กแล้วเขียนต่อ ไม่ใช่ช่องข้อความเปล่า** — กระดาษ FM-RD-01 มีช่องติ๊ก
              หน้าทั้งสามคำ เหมือนข้อ 1.10 · ทำเป็นช่องเปล่าแล้วเสียข้อมูลว่า "ข้อไหน
              ลูกค้าสนใจ" ตอนที่ยังไม่ได้เขียนรายละเอียด */}
          <div className="form-group col-span-2">
            <span className={styles.fieldLabel}>{FIELD.vpAttribute.group} — ติ๊กแล้วเขียนต่อ</span>
            {["vpAttribute", "vpBenefit", "vpValue"].map((key) => (
              <TickAndWrite
                key={key} label={label(key)} disabled={disabled}
                value={value[key]} onChange={(v) => set({ [key]: v })}
              />
            ))}
          </div>
          <div className="form-group col-span-2">
            <label htmlFor="pdr-sample">{label("brandSample")}</label>
            <Input id="pdr-sample" value={value.brandSample} disabled={disabled}
              onChange={(e) => set({ brandSample: e.target.value })} />
          </div>
        </div>
      </Section>

      <Section title={SECTION.regulatory.title} note={SECTION.regulatory.note}>
        <ChipPicker
          label={label("documents")} options={PDR_DOCUMENTS} disabled={disabled}
          value={value.documents} onChange={(v) => set({ documents: v })}
          hint="COA · MSDS · IFRA · อย. มีให้เป็นพื้นฐานอยู่แล้ว — ติ๊กเพื่อยืนยันว่าใบนี้ต้องการ"
        />
        {pdrFieldVisible(FIELD.exportDocNote, value) && (
          <div className="form-group col-span-2">
            <label htmlFor="pdr-export">{label("exportDocNote")}</label>
            <Input id="pdr-export" value={value.exportDocNote || ""} disabled={disabled}
              placeholder={FIELD.exportDocNote.placeholder}
              onChange={(e) => set({ exportDocNote: e.target.value })} />
          </div>
        )}
        <div className="form-group col-span-2">
          <label htmlFor="pdr-special">{label("specialRequirements")}</label>
          <Textarea
            variant="data" id="pdr-special" rows={2} maxLength={2000}
            value={value.specialRequirements} disabled={disabled}
            placeholder={FIELD.specialRequirements.placeholder}
            onChange={(e) => set({ specialRequirements: e.target.value })}
          />
        </div>
      </Section>

      {/* ── ผู้เซ็นบนเอกสาร (ม-45 · mig 0221) ─────────────────────────────
          ⭐ **ชื่อบนกระดาษ ไม่ใช่ role ในระบบ** — ระบบยังไม่มีตำแหน่ง Perfumer /
          PD Chemist / Project Coordinator · กรอกชื่อไว้เพื่อให้พิมพ์ลงตารางลายเซ็น
          แทนที่จะเป็นเส้นว่างทุกใบ
          ⚠️ ช่องวนจากทะเบียนโดยตั้งใจ — ป้ายตำแหน่งต้องตรงกับที่กระดาษพิมพ์เป๊ะ
          ไล่เขียนมือเมื่อไรก็เพี้ยนจากกระดาษเมื่อนั้น */}
      <Section title={SECTION.signers.title} note={SECTION.signers.note}>
        {SECTION.signers.fields.map((f) => (
          <div className="form-group" key={f.key}>
            <label htmlFor={`pdr-${f.key}`}>{f.label}</label>
            <Input
              id={`pdr-${f.key}`} value={value[f.key] || ""} disabled={disabled}
              placeholder="ชื่อผู้เซ็น (เว้นว่างได้)"
              onChange={(e) => set({ [f.key]: e.target.value })}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}

// คอลัมน์ `pdr*` บนแถวคำร้อง → ค่าที่ฟอร์มใช้ — ทางกลับของ normalizePdr
//
// ⚠️ ชื่อช่องในฟอร์มสั้นเพราะอยู่ในบริบท PDR อยู่แล้ว · DB ต้อง prefix เพื่อไม่ให้ปน
// กับคอลัมน์ของกลไกคำร้อง ⇒ ต้องมีตัวแปลงทั้งสองทาง ไม่ใช่ทางเดียว
export function pdrValuesFrom(row = {}) {
  return Object.fromEntries(
    PDR_FIELDS.filter((f) => f.column).map((f) => {
      const raw = row[f.column];
      // ช่องติ๊กหลายตัวต้องกลับมาเป็น array — ไม่งั้น `String([])` ได้ "" แล้วค่าที่
      // ติ๊กไว้หายทั้งชุดตอนเปิดโหมดแก้
      if (f.type === "multi") return [f.key, Array.isArray(raw) ? raw : []];
      return [f.key, raw == null ? "" : String(raw)];
    }),
  );
}
