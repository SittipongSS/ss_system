"use client";
// ── ฟอร์มเปิดคำร้องข้ามฝ่าย ─────────────────────────────────────────────
//
// ⭐ **ลำดับคำถามคือของจริงที่ผู้ใช้สั่งไว้ (2026-08-03)** ห้ามสลับ:
//     1 โครงการ → ดีล (บังคับ)   2 ฝ่าย   3 หัวข้อ   4 ชื่อเรื่อง + รายละเอียด
//     5 วันที่ต้องการคำตอบ + ด่วน  6 แนบไฟล์ · กล่าวถึง
// เหตุผลที่ลำดับนี้ไม่ใช่เรื่องความสวยงาม: คนเปิดคำร้องคิดจาก "งานไหน" → "ถามใคร"
// → "ถามเรื่องอะไร" เสมอ · ของเดิมกลับหัว (เลือกหัวข้อก่อน แล้วระบบเดาฝ่ายจาก
// ชนิดวัสดุ) ทำให้ฝ่ายผู้ตอบเป็นผลข้างเคียงที่ผู้ใช้มองไม่เห็นว่าตัวเองเลือกอะไรไป
//
// ⚠️ ไม่มีช่อง "หมายเหตุ" แล้ว (มติเดียวกัน) — รายละเอียดช่องเดียวจบ
//
// ⚠️ ฟอร์มเดียวใช้ทั้งหน้าคำร้องและโมดัลในใบขอราคาผลิต (กฎ AGENTS.md) — ต่างกันแค่
// `lockKind` (บริบทเป็นตัวกำหนดหัวข้อเอง) ไม่ใช่คนละไฟล์
import { Plus, Trash2, Paperclip, X, AtSign } from "lucide-react";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DateInput from "@/components/ui/DateInput";
import MaterialPicker from "@/components/materials/MaterialPicker";
import Textarea from "@/components/ui/Textarea";
import { MATERIAL_KIND_LABELS } from "@/lib/materialPrices";
import { productIdentity } from "@/lib/master/productIdentity";
import {
  REQUEST_DEPTS, kindsForDept, materialKindForRequest, requestHasItems, requestKindLabel,
  requestKindMeta,
} from "@/lib/master/requestTypes";
import { requestFormBlocker } from "@/lib/master/requestCreate";
import { isScentUsable } from "@/lib/master/scents";
import { isFormulaUsable } from "@/lib/master/formulas";
import { MAX_MENTIONS } from "@/lib/master/mentions";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";
import styles from "./requestForm.module.css";

const DEPT_LABEL = { RD: "RD (วิจัยและพัฒนา)", PC: "จัดซื้อ (PC)" };

const QTY_SHORTCUTS = [500, 1000, 3000, 5000, 10000];

export const emptyAskItem = (kind = "PM") => ({
  kind,
  material: { materialId: null, label: "", isNew: false },
  spec: "",
  tiers: [],
  // ผูกกลับบรรทัดในใบขอราคาผลิต — ตั้งค่าเฉพาะตอนเปิดเคสจากในใบ (0159)
  componentId: null,
});

// ค่าเริ่มต้น: **ไม่เดาหัวข้อให้** — หัวข้อขึ้นกับฝ่ายซึ่งยังไม่ได้เลือก
// (ของเดิมตั้งต้นเป็น price_pm ทำให้โมดัลที่เปิดจากบรรทัด RM_F แสดงหัวข้อผิด
// แล้วส่งไปตาย 400 ที่ปลายทาง เพราะช่องกลิ่นไม่ถูกถาม)
export const emptyRequestForm = (over = {}) => ({
  projectId: "",
  dealId: "",
  dept: "",
  kind: "",
  title: "",
  body: "",
  urgent: false,
  requestedDueDate: "",
  scentId: "",
  formulaId: "",
  productId: "",
  formulaCode: "",
  formulaName: "",
  items: [],
  files: [],       // File[] — อัปหลังคำร้องถูกสร้าง (ยังไม่มี entityId ตอนกรอก)
  mentions: [],    // [{ id, name }] ที่ผู้ใช้เลือกจากรายการ
  ...over,
});

// รายการที่ต้องมีเมื่อหัวข้อเป็นชนิดขอราคา — ชนิดวัสดุมาจากหัวข้อ ไม่ให้เลือกซ้ำ
// (ไม่ export: ใช้เฉพาะในไฟล์นี้ · export ที่ไม่มีผู้เรียกคือโค้ดตายที่ lint ไม่จับ)
function itemsForKind(kind, existing = []) {
  const materialKind = materialKindForRequest(kind);
  if (!materialKind) return [];
  const rows = existing.length ? existing : [emptyAskItem(materialKind)];
  return rows.map((it) => ({ ...it, kind: materialKind }));
}

export default function RequestForm({
  value, onChange, materials = [], products = [],
  // ทะเบียน/รายการที่ฟอร์มอ้างตามหัวข้อ — โครงการ+ดีล (บังคับ) · กลิ่น (F) · สูตร (FB)
  projects = [], deals = [], scents = [], formulas = [],
  // ล็อกหัวข้อไว้เมื่อบริบทเป็นตัวกำหนดเอง (เปิดจากบรรทัดในใบขอราคาผลิต)
  lockKind = false, disabled = false,
  mentionPeople = [],
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const items = value.items || [];
  const kind = value.kind || "";
  const meta = requestKindMeta(kind) || {};
  const hasItems = requestHasItems(kind);
  const dept = value.dept || "";

  // ดีลที่เลือกได้ = ดีลของโครงการที่เลือกไว้เท่านั้น (ลำดับข้อ 1)
  const dealsOfProject = value.projectId
    ? deals.filter((d) => d.projectId === value.projectId)
    : [];

  // ด่านเดียวกับที่ปุ่มส่งใช้ — ฟอร์มไม่คิดกฎเอง (บทเรียน: หน้าจอคำนวณเงื่อนไข
  // action เองแล้วเพี้ยนจาก server จนปุ่มไม่เคยโผล่)
  const shapeError = requestFormBlocker(value);

  const patchItem = (idx, patch) => set({
    items: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
  });
  const addItem = () => set({ items: [...items, emptyAskItem(materialKindForRequest(kind))] });
  const removeItem = (idx) => set({ items: items.filter((_, i) => i !== idx) });

  const toggleTier = (idx, qty) => {
    const tiers = items[idx].tiers || [];
    patchItem(idx, {
      tiers: tiers.includes(qty) ? tiers.filter((q) => q !== qty) : [...tiers, qty].sort((a, b) => a - b),
    });
  };
  const addCustomTier = (idx, raw) => {
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const tiers = items[idx].tiers || [];
    if (tiers.includes(qty)) return;
    patchItem(idx, { tiers: [...tiers, qty].sort((a, b) => a - b) });
  };

  const addFiles = (list) => {
    const picked = Array.from(list || []).filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (!picked.length) return;
    set({ files: [...(value.files || []), ...picked] });
  };
  const removeFile = (idx) => set({ files: (value.files || []).filter((_, i) => i !== idx) });

  const toggleMention = (person) => {
    const picked = value.mentions || [];
    const on = picked.some((p) => p.id === person.id);
    if (!on && picked.length >= MAX_MENTIONS) return;
    set({
      mentions: on
        ? picked.filter((p) => p.id !== person.id)
        : [...picked, { id: person.id, name: person.name }],
    });
  };

  return (
    <>
      {/* ── 1) โครงการ → ดีล (บังคับทุกชนิด) ─────────────────────────────── */}
      <div className="form-grid">
        <div className="form-group">
          <span className={styles.fieldLabel}>โครงการ</span>
          <SearchableSelect
            value={value.projectId} disabled={disabled}
            onChange={(v) => set({
              projectId: v,
              // เปลี่ยนโครงการแล้วดีลเดิมไม่ใช่ของโครงการนี้อีก — ล้างทิ้ง ไม่ค้างไว้
              // ให้ผ่านด่านฝั่ง client แล้วไปตายที่ server
              dealId: "",
            })}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.code || p.id} — ${p.name || p.customerName || ""}`.trim(),
              search: `${p.code || ""} ${p.name || ""} ${p.customerName || ""}`,
            }))}
            placeholder="เลือกโครงการ"
            emptyText="ยังไม่มีโครงการ"
            ariaLabel="โครงการของคำร้อง"
          />
        </div>
        <div className="form-group">
          <span className={styles.fieldLabel}>ดีล</span>
          <SearchableSelect
            value={value.dealId} disabled={disabled || !value.projectId}
            onChange={(v) => set({ dealId: v })}
            options={dealsOfProject.map((d) => ({
              value: d.id,
              label: `${d.code || d.id} — ${d.title || ""}`.trim(),
              search: `${d.code || ""} ${d.title || ""} ${d.customerName || ""}`,
            }))}
            placeholder={value.projectId ? "เลือกดีล" : "เลือกโครงการก่อน"}
            emptyText="โครงการนี้ยังไม่มีดีล"
            ariaLabel="ดีลของคำร้อง"
          />
          {/* กรณีที่เกิดจริงบ่อยบน prod (2026-08-03: 122 จาก 136 ดีลยังไม่ผูก
              โครงการ) — dropdown ว่างเปล่าโดยไม่บอกเหตุผล ผู้ใช้จะคิดว่าระบบพัง */}
          {value.projectId && dealsOfProject.length === 0 && (
            <small className={styles.hint}>
              โครงการนี้ยังไม่มีดีลที่ผูกไว้ — ต้องผูกดีลกับโครงการก่อนจึงเปิดคำร้องได้
            </small>
          )}
        </div>
      </div>

      {/* ── 2) ฝ่าย → 3) หัวข้อ (หัวข้อถูกกรองด้วยฝ่าย) ───────────────────── */}
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="req-dept">ถามฝ่ายไหน</label>
          <Select
            id="req-dept" value={dept} disabled={disabled || lockKind}
            onChange={(e) => {
              const next = e.target.value;
              // หัวข้อที่เลือกไว้อาจไม่ใช่ของฝ่ายใหม่ — ล้างเมื่อไม่เข้ากัน
              const keep = kindsForDept(next).includes(kind) ? kind : "";
              set({ dept: next, kind: keep, items: itemsForKind(keep, items) });
            }}
            options={[
              { value: "", label: "เลือกฝ่าย" },
              ...REQUEST_DEPTS.map((d) => ({ value: d, label: DEPT_LABEL[d] || d })),
            ]}
          />
        </div>
        <div className="form-group">
          <label htmlFor="req-kind">ขอเรื่องอะไร</label>
          <Select
            id="req-kind" value={kind} disabled={disabled || lockKind || !dept}
            onChange={(e) => {
              const next = e.target.value;
              // เปลี่ยนหัวข้อ = ล้างช่องเฉพาะหัวข้อทิ้ง (กลิ่น/สูตร/รายการ) ไม่งั้น
              // ค่าเก่าค้างแล้วถูกส่งไปกับคำร้องหัวข้อใหม่
              set({
                kind: next,
                scentId: "",
                formulaId: "",
                productId: "",
                formulaCode: "",
                formulaName: "",
                items: itemsForKind(next),
              });
            }}
            options={[
              { value: "", label: dept ? "เลือกหัวข้อ" : "เลือกฝ่ายก่อน" },
              ...kindsForDept(dept).map((k) => ({ value: k, label: requestKindLabel(k) })),
            ]}
          />
          {meta.hint && <small className={styles.hint}>{meta.hint}</small>}
          {meta.dealType && (
            <small className={styles.hint}>ใช้กับดีลประเภท {meta.dealType} เป็นหลัก</small>
          )}
        </div>
      </div>

      {/* ── 4) ชื่อเรื่อง + รายละเอียด (ทุกหัวข้อ) ─────────────────────────── */}
      <div className="form-grid">
        <div className="form-group col-span-2">
          <label htmlFor="req-title">ชื่อเรื่อง</label>
          <input
            id="req-title" className="premium-input" maxLength={200}
            value={value.title} disabled={disabled}
            placeholder={kind === "scent_brief" ? "เช่น บรีฟกลิ่นสำหรับ Reed Diffuser"
              : kind === "mockup" ? "เช่น ขอ Mock-up ขวด 30 ml พร้อมฉลาก"
                : "สรุปสั้น ๆ ว่าขออะไร"}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <div className="form-group col-span-2">
          <label htmlFor="req-body">รายละเอียด</label>
          <Textarea
            variant="data"
            id="req-body" rows={4} maxLength={4000}
            value={value.body} disabled={disabled}
            placeholder={kind === "scent_brief"
              ? "โทนกลิ่นที่ต้องการ · กลุ่มลูกค้า · ตัวอย่างอ้างอิง · ข้อจำกัด"
              : "อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ"}
            onChange={(e) => set({ body: e.target.value })}
          />
          {/* วางลิงก์หรือรหัสเอกสารในรายละเอียดได้เลย — เธรดเรนเดอร์เป็นลิงก์ให้เอง
              ผ่าน RichText (/go/<รหัส>) ไม่ต้องมีช่อง "ลิงก์" แยก */}
          <small className={styles.hint}>
            วาง URL หรือรหัสเอกสาร (เช่น QT-26080001) ลงไปได้ — ระบบทำเป็นลิงก์ให้เอง
          </small>
        </div>
      </div>

      {/* ── หัวข้อที่ต้องอ้างทะเบียน: F อ้างกลิ่น · FB อ้างสูตร ─────────────── */}
      {meta.refs === "scent" && (
        <div className="form-group">
          <span className={styles.fieldLabel}>กลิ่นที่ลูกค้าคอนเฟิร์ม</span>
          <SearchableSelect
            value={value.scentId} disabled={disabled}
            onChange={(v) => set({ scentId: v })}
            options={scents.filter(isScentUsable).map((s) => ({
              value: s.id,
              label: s.code ? `${s.name} · ${s.code}` : s.name,
              search: `${s.name} ${s.code || ""} ${s.customerName || ""}`,
            }))}
            placeholder="เลือกกลิ่นจากทะเบียน"
            emptyText="ยังไม่มีกลิ่นที่รับเข้าทะเบียน"
            ariaLabel="กลิ่นที่ขอราคา"
          />
        </div>
      )}
      {meta.refs === "formula" && (
        <div className="form-group">
          <span className={styles.fieldLabel}>สูตรที่ลูกค้าคอนเฟิร์ม</span>
          <SearchableSelect
            value={value.formulaId} disabled={disabled}
            onChange={(v) => {
              const f = formulas.find((x) => x.id === v);
              set({
                formulaId: v,
                formulaCode: f?.code || "",
                formulaName: f?.name || "",
              });
            }}
            options={formulas.filter(isFormulaUsable).map((f) => ({
              value: f.id,
              label: f.code ? `${f.name} · ${f.code}` : f.name,
              search: `${f.name} ${f.code || ""} ${f.customerName || ""}`,
            }))}
            placeholder="เลือกสูตรจากทะเบียน"
            emptyText="ยังไม่มีสูตรที่รับเข้าทะเบียน"
            ariaLabel="สูตรที่ขอราคา"
          />
        </div>
      )}

      {/* ── หัวข้อขอราคา: บรรทัดวัสดุ + ชั้นจำนวน ─────────────────────────── */}
      {hasItems && (
        <>
          <div className="form-group">
            <span className={styles.fieldLabel}>สินค้าที่เกี่ยวข้อง (ถ้ามี)</span>
            <SearchableSelect
              value={value.productId} disabled={disabled} entity="product"
              onChange={(v) => set({ productId: v })}
              options={[
                { value: "", label: "ไม่ระบุสินค้า" },
                // ตัวตนสินค้าใช้ productIdentity ตัวเดียวทั้งระบบ (มาตรฐาน PR #730)
                ...products.map((p) => {
                  const identity = productIdentity(p);
                  return { value: p.id, label: identity.text, search: identity.search };
                }),
              ]}
              ariaLabel="สินค้าที่ขอราคา"
            />
          </div>

          <div className="form-group">
            <span className={styles.fieldLabel}>
              รายการที่ขอราคา — {MATERIAL_KIND_LABELS[materialKindForRequest(kind)]}
            </span>
            {/* ชนิดวัสดุมาจากหัวข้อแล้ว จึงไม่มี Select ชนิดต่อบรรทัดอีก และไม่มีทาง
                ปนฝ่ายกันได้โดยโครงสร้าง (เดิมเป็นกฎที่ผู้ใช้ต้องระวังเอง) */}
            {items.map((item, idx) => (
              <div key={idx} className={`glass-panel ${styles.itemCard}`}>
                <div className={styles.itemHead}>
                  <div className={styles.itemPicker}>
                    <MaterialPicker
                      materials={materials} kind={item.kind} customerId={null}
                      value={item.material} disabled={disabled}
                      ariaLabel={`วัสดุของรายการที่ ${idx + 1}`}
                      onChange={(material) => patchItem(idx, { material })}
                    />
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button" className="btn-icon" disabled={disabled}
                      onClick={() => removeItem(idx)} aria-label={`ลบรายการที่ ${idx + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <Textarea
                  variant="data"
                  className={styles.itemSpec} rows={2} maxLength={2000}
                  value={item.spec} disabled={disabled}
                  aria-label={`สเปกของรายการที่ ${idx + 1}`}
                  placeholder={item.kind === "PM"
                    ? "สเปก เช่น ขวดขนาด 30 ml สีชา สกรีนที่ขวด 1 จุด 1 สี"
                    : "รายละเอียดที่ต้องการ เช่น ความเข้มข้น / ปริมาณที่จะสั่ง"}
                  onChange={(e) => patchItem(idx, { spec: e.target.value })}
                />

                <div className={styles.tierRow}>
                  <span className={styles.tierLabel}>ขอราคาที่จำนวน:</span>
                  {(item.tiers || []).map((qty) => (
                    <button
                      key={qty} type="button" className={`chip ${styles.tierChipOn}`} disabled={disabled}
                      onClick={() => toggleTier(idx, qty)}
                      aria-label={`เอาชั้น ${qty} ออก`}
                    >
                      {qty.toLocaleString("th-TH")} ✕
                    </button>
                  ))}
                  {QTY_SHORTCUTS.filter((q) => !(item.tiers || []).includes(q)).map((q) => (
                    <button
                      key={q} type="button" className={`chip ${styles.tierChip}`} disabled={disabled}
                      onClick={() => toggleTier(idx, q)}
                    >
                      +{q.toLocaleString("th-TH")}
                    </button>
                  ))}
                  <input
                    className={`premium-input ${styles.tierInput}`} type="number" min="1"
                    disabled={disabled} placeholder="จำนวนอื่น"
                    aria-label={`เพิ่มจำนวนที่ขอของรายการที่ ${idx + 1}`}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      addCustomTier(idx, e.currentTarget.value);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
                <small className={styles.hint}>
                  ปุ่มเป็นแค่ทางลัด — พิมพ์จำนวนเท่าไรก็ได้แล้วกด Enter · ไม่เลือกเลย = ขอราคาเดียว
                </small>
              </div>
            ))}

            <button type="button" className="btn sm" onClick={addItem} disabled={disabled}>
              <Plus size={13} /> เพิ่มรายการ
            </button>
          </div>
        </>
      )}

      {/* ── 5) วันที่ต้องการคำตอบ + ด่วน ──────────────────────────────────── */}
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="req-due">อยากได้คำตอบภายใน</label>
          <DateInput
            id="req-due" value={value.requestedDueDate} disabled={disabled}
            onChange={(v) => set({ requestedDueDate: v })}
          />
          <small className={styles.hint}>
            เป็นความคาดหวัง — ฝ่ายปลายทางจะรับปากวันจริงตอนกดรับเรื่อง
          </small>
        </div>
        <div className="form-group">
          <label htmlFor="req-urgent">ความเร่งด่วน</label>
          <label className={styles.checkRow}>
            <input
              id="req-urgent" type="checkbox" checked={!!value.urgent} disabled={disabled}
              onChange={(e) => set({ urgent: e.target.checked })}
            />
            <span className={styles.checkLabel}>งานด่วน</span>
          </label>
        </div>
      </div>

      {/* ── 6) แนบไฟล์ + กล่าวถึง (ทำงานเหมือนกล่องพิมพ์ในเธรด) ───────────── */}
      <div className="form-grid">
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>แนบไฟล์</span>
          {/* ไฟล์ถูกอัปหลังคำร้องถูกสร้าง (ยังไม่มี entityId ตอนกรอกฟอร์ม) —
              เก็บไว้ในหน่วยความจำก่อน แล้วผู้เรียกอัปตามลำดับ */}
          <label className={styles.fileDrop}>
            <Paperclip size={14} aria-hidden="true" />
            <span>เลือกไฟล์ (สูงสุด {MAX_UPLOAD_MB} MB ต่อไฟล์)</span>
            <input
              type="file" multiple accept={UPLOAD_ACCEPT_ATTR} disabled={disabled}
              className={styles.fileInput}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            />
          </label>
          {!!(value.files || []).length && (
            <ul className={styles.fileList}>
              {(value.files || []).map((f, i) => (
                <li key={`${f.name}-${i}`} className={styles.fileRow}>
                  <span className={styles.fileName}>{f.name}</span>
                  {/* ปุ่มไอคอนผ่าน <Button> กลาง — ห้ามเขียนคลาส btn เองในของใหม่
                      (ด่าน audit:ui นับ rawButtonClass เป็น ratchet ขึ้นไม่ได้) */}
                  <Button
                    iconOnly icon={<X size={13} />} disabled={disabled}
                    onClick={() => removeFile(i)} aria-label={`เอา ${f.name} ออก`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>
            <AtSign size={13} aria-hidden="true" /> กล่าวถึง (ได้รับแจ้งเตือนตอนส่ง)
          </span>
          {/* รายชื่อกรองด้วยด่านของเธรดคำร้องมาแล้วที่ server (ดู
              /api/sa/requests/mentionable) — ไม่มีชื่อคนที่เปิดคำร้องนี้ไม่ได้ */}
          {mentionPeople.length ? (
            <div className={styles.mentionPicker}>
              {mentionPeople.map((p) => {
                const on = (value.mentions || []).some((m) => m.id === p.id);
                return (
                  <button
                    key={p.id} type="button" disabled={disabled}
                    className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
                    aria-pressed={on}
                    onClick={() => toggleMention(p)}
                  >
                    {on ? "✓ " : "@"}{p.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <small className={styles.hint}>ไม่มีคนที่กล่าวถึงได้ในคำร้องนี้</small>
          )}
          <small className={styles.hint}>
            กล่าวถึงได้ไม่เกิน {MAX_MENTIONS} คน — แจ้งเตือนออกตอนกดส่ง ไม่ใช่ตอนกรอก
          </small>
        </div>
      </div>

      {/* บอกว่ายังขาดอะไรอยู่ตรงนี้ที่เดียว — ฟอร์มรู้กฎของตัวเองอยู่แล้ว (ด่าน
          ตัวเดียวกับที่ server ใช้) · ก่อนหน้านี้ปุ่มแค่จางลงเงียบ ๆ ผู้ใช้ต้องเดาว่า
          ขาดช่องไหน · โทนเป็น hint ไม่ใช่แดง เพราะกรอกยังไม่จบไม่ใช่ความผิดพลาด */}
      {shapeError && <small className={styles.hint}>ยังกรอกไม่ครบ — {shapeError}</small>}
    </>
  );
}
