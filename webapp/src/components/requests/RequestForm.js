"use client";
// ── ฟอร์มเปิดคำร้องข้ามฝ่าย ─────────────────────────────────────────────
//
// ⭐ **ลำดับคำถามคือของจริงที่ผู้ใช้สั่งไว้ (แผนฉบับที่ 3, 2026-08-04)** ห้ามสลับ:
//     1 ฝ่าย → 2 หัวข้อ → 3 ของที่หัวข้อนั้นต้องอ้าง → 4 ชื่อเรื่อง + รายละเอียด
//     5 วันที่ต้องการคำตอบ + ด่วน
// เหตุผลที่ลำดับนี้ไม่ใช่เรื่องความสวยงาม: คนเปิดคำร้องคิดจาก **"จะถามใคร"** ก่อน
// "ถามเรื่องอะไร" เสมอ · ของเดิมกลับหัว (เลือกหัวข้อก่อน แล้วระบบเดาฝ่ายจากชนิดวัสดุ)
// ทำให้ฝ่ายผู้ตอบเป็นผลข้างเคียงที่ผู้ใช้มองไม่เห็นว่าตัวเองเลือกอะไรไป
//
// ⚠️ ฝ่ายเป็น **ปุ่มเรียงกัน ไม่ใช่ดรอปดาวน์** — มีสามตัวและเป็นคำถามแรก · ดรอปดาวน์
// ซ่อนจำนวนตัวเลือกไว้จนกว่าจะกด ทำให้คำถามแรกดูเหมือนช่องกรอกเปล่า ๆ · ฝ่ายที่ยัง
// เปิดไม่ได้ (`PLANNED_REQUEST_DEPTS`) แสดงแบบจางและกดไม่ได้ ไม่ใช่ซ่อน
//
// ⚠️ ไม่มีช่อง "หมายเหตุ" แล้ว (มติเดียวกัน) — รายละเอียดช่องเดียวจบ
//
// ⚠️ ฟอร์มเดียวใช้ทั้งหน้าคำร้องและโมดัลในใบขอราคาผลิต (กฎ AGENTS.md) — ต่างกันที่ธง
// ไม่ใช่คนละไฟล์: `lockKind` (บริบทกำหนดหัวข้อเอง) · `deferAttachments` (หน้าที่บันทึก
// เป็นร่างก่อน แล้วไปแนบไฟล์/กด @ ที่หน้ารายละเอียด) · `showBlocker` (ใครวางข้อความ
// "ยังกรอกไม่ครบ" — เนื้อฟอร์ม หรือแถบปุ่มของผู้เรียก)
import { Plus, Trash2, Paperclip, X, AtSign } from "lucide-react";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DateInput from "@/components/ui/DateInput";
import MaterialPicker from "@/components/materials/MaterialPicker";
import Textarea from "@/components/ui/Textarea";
import { MATERIAL_KIND_LABELS } from "@/lib/materialPrices";
import { productIdentity } from "@/lib/master/productIdentity";
import ProductDevLines, { emptyProductDevRow } from "@/components/requests/ProductDevLines";
import DocumentLines, { emptyDocumentRow } from "@/components/requests/DocumentLines";
import { BILLING_DOC_VOCABULARY } from "@/lib/requests/kinds/fn/billingDocTypes";
import {
  PLANNED_REQUEST_DEPTS,
  REQUEST_DEPTS, REQUEST_DEPT_LABELS,
  kindsForDept, lineShapeForKind, materialKindForRequest, requestHasItems,
  requestHasTiers,
  requestKindFamily, requestKindLabel, requestKindMeta, requestNeedsRef, requestStepLabel,
} from "@/lib/master/requestTypes";
import { requestFormBlocker } from "@/lib/master/requestCreate";
import { isScentUsable } from "@/lib/master/scents";
import { isFormulaUsable } from "@/lib/master/formulas";
import { MAX_MENTIONS } from "@/lib/master/mentions";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";
import styles from "./requestForm.module.css";

const QTY_SHORTCUTS = [500, 1000, 3000, 5000, 10000];

// ช่องที่ **ระบบเติมให้** — เส้นประ อ่านอย่างเดียว ไม่ใช่ดรอปดาวน์ที่จางลง
// (แผนฉบับที่ 3) · ปล่อยให้เลือกซ้ำได้เมื่อไร จะมีวันที่ SO ชี้ดีลหนึ่งแต่คนกรอก
// เลือกอีกดีลหนึ่ง แล้วไม่มีอะไรบอกว่าอันไหนถูก
function DerivedField({ label, value, from }) {
  return (
    <div className="form-group">
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.derived} data-empty={value ? undefined : "1"}>
        {value || from}
      </div>
    </div>
  );
}

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
  salesOrderId: "",   // บรีฟกลิ่น (ค่าบริการออกแบบกลิ่น)
  productTypeId: "",  // ขอ Mock-up (หมวดสินค้าที่จะขึ้นตัวอย่าง)
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
  // ⚠️ บรรทัดแต่ละรูปร่างเป็นคนละโครง — สลับหัวข้อมาแล้วต้องเริ่มใหม่ ไม่ใช่ลาก
  // บรรทัดวัสดุเดิมมาแล้วได้แถวที่ไม่มีหมวด/กลิ่น
  // ⭐ ตัดสินจาก **รูปร่างบรรทัด** ไม่ใช่ชื่อหัวข้อ — ฝ่ายที่เพิ่มหัวข้อใหม่ที่ใช้รูปร่าง
  // เดิมจะได้แถวเปล่าถูกชนิดทันที โดยไม่ต้องมาต่อชื่อหัวข้อไว้ในฟอร์ม
  const shape = lineShapeForKind(kind);
  if (shape === 'product_dev') return [emptyProductDevRow()];
  if (shape === 'document' || shape === 'billing_doc') return [emptyDocumentRow()];
  const materialKind = materialKindForRequest(kind);
  if (!materialKind) return [];
  const rows = existing.length ? existing : [emptyAskItem(materialKind)];
  return rows.map((it) => ({ ...it, kind: materialKind }));
}

export default function RequestForm({
  value, onChange, materials = [], products = [],
  // ทะเบียน/รายการที่ฟอร์มอ้างตามหัวข้อ (ดู `needs` ใน lib/master/requestTypes.js)
  projects = [], deals = [], salesOrders = [], scents = [], formulas = [], productTypes = [],
  // ล็อกหัวข้อไว้เมื่อบริบทเป็นตัวกำหนดเอง (เปิดจากบรรทัดในใบขอราคาผลิต)
  lockKind = false, disabled = false,
  mentionPeople = [],
  // ผู้เรียกบันทึกเป็น "ร่าง" ก่อน แล้วให้แนบไฟล์/กล่าวถึงที่หน้ารายละเอียด —
  // ⭐ ไฟล์ต้องมีคำร้องให้เกาะก่อน และ @ ยิงแจ้งเตือนตอน "กดส่ง" ไม่ใช่ตอนบันทึกร่าง
  // ⇒ วางไว้ในฟอร์มนี้จะเป็นช่องที่กรอกแล้วไม่เกิดอะไรขึ้นในจังหวะที่ผู้ใช้คาดว่าเกิด
  deferAttachments = false,
  // ข้อความ "ยังกรอกไม่ครบ" อยู่ในเนื้อฟอร์มหรือไม่ — หน้าเต็มย้ายไปไว้ที่แถบปุ่ม
  // (ด่านตัวเดียวกัน `requestFormBlocker` คนละที่วาง ไม่ใช่คนละกฎ)
  showBlocker = true,
  // ⭐ ถามฝ่าย/หัวข้อให้จบก่อน แล้วค่อยกางฟอร์มของหัวข้อนั้น (มติผู้ใช้ 2026-08-06)
  // ช่องข้างล่างสลับหน้าตาไปทั้งชุดตามหัวข้อ — กางไว้ตั้งแต่ยังไม่เลือกจึงเป็นฟอร์มที่
  // เปลี่ยนรูปใต้มือคนอ่าน · โมดัลที่ล็อกหัวข้อมาแล้วไม่ต้องผ่านขั้นนี้ (ค่าตั้งต้น true)
  revealed = true,
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const items = value.items || [];
  const kind = value.kind || "";
  const meta = requestKindMeta(kind) || {};
  // ⭐ ข้อความทุกช่องมาจาก **ทะเบียนหัวข้อ** ไม่ใช่ `kind === "..."` ในฟอร์ม
  // (ของเดิมผูกกับหัวข้อเก่าที่เปิดใบใหม่ไม่ได้แล้ว หัวข้อที่ใช้จริงเลยไม่เคยได้ข้อความ
  //  ของตัวเอง) · ทะเบียนเติมค่ากลางให้ครบทุกคีย์แล้ว จึงอ่านตรง ๆ ได้ไม่ต้อง fallback
  const copy = meta.form || {};
  const hasItems = requestHasItems(kind);
  // รูปร่างบรรทัดมาจากทะเบียนหัวข้อที่เดียว — ฟอร์มไม่เช็ค `kind === "..."` เอง
  const lineShape = lineShapeForKind(kind);
  const hasTiers = requestHasTiers(kind);
  const dept = value.dept || "";

  // ช่องที่ต้องกรอกมาจากทะเบียนหัวข้อที่เดียว — ห้ามเขียน `kind === "..."` ในฟอร์ม
  // (ธงเพี้ยนจาก server ไม่ได้ เพราะอ่านตัวเดียวกัน)
  const needsProject = requestNeedsRef(kind, "project");
  const needsSalesOrder = requestNeedsRef(kind, "salesOrder");
  const needsScent = requestNeedsRef(kind, "scent");
  const needsFormula = requestNeedsRef(kind, "formula");
  // ⚠️ **หลับอยู่ตั้งแต่ 0204** — คอลัมน์ `dept_requests.productTypeId` ถูก DROP ทิ้ง
  // `productType` จึงถูกถอดออกจาก REQUEST_NEEDS ⇒ ตัวนี้เป็น false เสมอ และช่อง
  // ข้างล่างไม่เรนเดอร์ · **ตั้งใจไม่ลบโค้ดทิ้ง**: หมวดสินค้ากลับมาแน่ตอนหัวข้อ
  // "พัฒนาผลิตภัณฑ์" มาแทน Mock-up แต่กลับมาเป็น **รายแถว**
  // (`dept_request_items.categoryCode`) ผ่าน ProductCategorySelect ตัวกลาง
  const needsProductType = requestNeedsRef(kind, "productType");

  // ดีลที่เลือกได้ = ดีลของโครงการที่เลือกไว้เท่านั้น (ลำดับข้อ 1)
  const dealsOfProject = value.projectId
    ? deals.filter((d) => d.projectId === value.projectId)
    : [];
  const selectedProductType = productTypes.find((t) => String(t.id) === String(value.productTypeId));
  // ⚠️ กลิ่นที่เลือกได้ต้องเป็นของลูกค้าเจ้าของดีลเท่านั้น (มติ 9) — ลูกค้ามาจากดีล
  // ที่เลือกไว้ ไม่ใช่จากที่ผู้ใช้พิมพ์ (คำร้องไม่มีช่องลูกค้าให้เลือกเอง)
  const selectedDeal = deals.find((d) => d.id === value.dealId) || null;

  // ── ของที่ "เติมจาก SO" — ลูกค้า · ดีล · ขั้นในไทม์ไลน์ ────────────────────
  // ⚠️ ค่าที่โชว์ตรงนี้เป็น **ตัวอย่างของสิ่งที่ server จะเขียนจริง** ไม่ใช่ของที่ถูก
  // ส่งไปกับ payload (`requestPayload` ไม่ส่ง projectId/customerId เลย) — โชว์เพื่อให้
  // เห็นก่อนกดว่าใบนี้จะไปเกาะดีลไหน ไม่ใช่ให้แก้
  const selectedSo = salesOrders.find((so) => so.id === value.salesOrderId) || null;
  const soDeal = selectedSo ? deals.find((d) => d.id === selectedSo.dealId) || null : null;
  const stepLabel = requestStepLabel(kind);

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
      {/* ── 1) ฝ่าย → 2) หัวข้อ (หัวข้อถูกกรองด้วยฝ่าย) ───────────────────── */}
      <div className="form-group">
        <span className={styles.fieldLabel} id="req-dept-label">ส่งถึงฝ่ายไหน</span>
        <div className={styles.deptPicker} role="radiogroup" aria-labelledby="req-dept-label">
          {REQUEST_DEPTS.map((d) => (
            <button
              key={d} type="button" role="radio" aria-checked={dept === d}
              className={styles.deptOption} data-on={dept === d ? "1" : undefined}
              disabled={disabled || lockKind}
              onClick={() => {
                // หัวข้อที่เลือกไว้อาจไม่ใช่ของฝ่ายใหม่ — ล้างเมื่อไม่เข้ากัน
                const keep = kindsForDept(d).includes(kind) ? kind : "";
                set({ dept: d, kind: keep, items: itemsForKind(keep, items) });
              }}
            >
              <span className={styles.deptCode}>{REQUEST_DEPT_LABELS[d]?.code || d}</span>
              <span className={styles.deptName}>{REQUEST_DEPT_LABELS[d]?.name || ""}</span>
            </button>
          ))}
          {/* ฝ่ายที่ยังไม่เปิด — จางและกดไม่ได้ **ไม่ใช่ซ่อน** · ซ่อนเมื่อไร คนที่อยาก
              ส่งเรื่องถึงบัญชีจะไปเปิดใบผิดหัวข้อแทน แล้วเราไม่มีทางรู้ว่ามีคนอยากได้ */}
          {PLANNED_REQUEST_DEPTS.map((d) => (
            <button
              key={d} type="button" role="radio" aria-checked={false} disabled
              className={styles.deptOption} title="ยังไม่เปิดใช้"
            >
              <span className={styles.deptCode}>{REQUEST_DEPT_LABELS[d]?.code || d}</span>
              <span className={styles.deptName}>{REQUEST_DEPT_LABELS[d]?.name || ""}</span>
            </button>
          ))}
        </div>
        <small className={styles.hint}>
          คนเปิดคำร้องคิดจาก &ldquo;จะถามใคร&rdquo; ก่อน &ldquo;ถามเรื่องอะไร&rdquo; เสมอ —
          หัวข้อข้างล่างถูกกรองตามฝ่ายนี้
        </small>
      </div>

      <div className="form-grid">
        <div className="form-group col-span-2">
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
                productTypeId: "",
                salesOrderId: "",
                formulaCode: "",
                formulaName: "",
                items: itemsForKind(next),
              });
            }}
            options={[
              { value: "", label: dept ? "เลือกหัวข้อ" : "เลือกฝ่ายก่อน" },
              // หัวกลุ่ม (`group`) มาจากตระกูลของหัวข้อ — ฝ่าย RD มีทั้งงานพัฒนาและ
              // ขอราคาปนกัน ลิสต์แบนทำให้สองเรื่องนี้ดูเท่ากันทั้งที่คนละจังหวะของงาน
              ...kindsForDept(dept).map((k) => ({
                value: k, label: requestKindLabel(k), group: requestKindFamily(k),
              })),
            ]}
          />
          {meta.hint && <small className={styles.hint}>{meta.hint}</small>}
          {meta.dealType && (
            <small className={styles.hint}>ใช้กับดีลประเภท {meta.dealType} เป็นหลัก</small>
          )}
        </div>
      </div>

      {revealed && (
      <>
      {/* ── 3) ของที่หัวข้อนั้นต้องอ้าง ────────────────────────────────────
          ⭐ **อยู่ใต้หัวข้อเสมอ** — ช่องพวกนี้โผล่/หายตามหัวข้อที่เพิ่งเลือก วางไว้
          เหนือหัวข้อเมื่อไร ผู้ใช้จะเจอช่องงอกขึ้นมาเหนือจุดที่ตัวเองกำลังมองอยู่
          → ช่องที่โผล่มาจากธง `needs` ที่เดียว ไม่ใช่ if เขียนตายตัวในฟอร์ม */}
      {needsProject && (
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
      )}

      {/* ── บรีฟกลิ่น: ยึดใบสั่งขาย (ค่าบริการออกแบบกลิ่น) ─────────────────
          แม่แบบ SCENT ขั้น 6 "ออกแบบกลิ่น" ขึ้นกับขั้น 4 "ใบสั่งขายออกแบบกลิ่น"
          → เลือก SO ที่เดียว ดีล/โครงการ/ลูกค้า server เติมจาก SO เอง ไม่ให้เลือกซ้ำ
          แล้วขัดกันเอง (SO ของดีล A แต่เลือกดีล B) */}
      {needsSalesOrder && (
        <>
          <div className="form-grid">
            <div className="form-group">
              <span className={styles.fieldLabel}>ใบสั่งขายออกแบบกลิ่น *</span>
              <SearchableSelect
                value={value.salesOrderId} disabled={disabled}
                onChange={(v) => set({ salesOrderId: v })}
                options={salesOrders.map((so) => ({
                  value: so.id,
                  label: `${so.orderNumber || so.id}${so.customerName ? ` — ${so.customerName}` : ""}`,
                  search: `${so.orderNumber || ""} ${so.customerName || ""} ${so.dealId || ""}`,
                }))}
                placeholder="เลือกใบสั่งขาย"
                emptyText="ยังไม่มีใบสั่งขายในระบบ"
                ariaLabel="ใบสั่งขายของบรีฟกลิ่น"
              />
            </div>
            <DerivedField
              label="ลูกค้า" from="เติมจาก SO"
              value={selectedSo?.customerName || ""}
            />
            <DerivedField
              label="ดีล" from="เติมจาก SO"
              value={soDeal ? `${soDeal.code || soDeal.id}${soDeal.title ? ` — ${soDeal.title}` : ""}` : ""}
            />
            <DerivedField label="ขั้นในไทม์ไลน์" from="—" value={stepLabel || ""} />
          </div>
          {/* ⚠️ prod มี sales_orders = 0 ใบ (นับ 2026-08-03) — ต้องบอกทางออกตรงนี้
              ไม่ใช่ปล่อยให้เจอ dropdown ว่างแล้วคิดว่าระบบพัง */}
          <small className={styles.hint}>
            {salesOrders.length
              ? "ดีลและโครงการเติมจาก SO — ไม่ให้เลือกซ้ำแล้วขัดกันเอง"
              : "ยังไม่มีใบสั่งขายในระบบ — ต้องออก QT แล้วรับเป็น SO ก่อนจึงเปิดบรีฟกลิ่นได้"}
          </small>
        </>
      )}

      {/* ── 4) ชื่อเรื่อง + รายละเอียด (ทุกหัวข้อ) ─────────────────────────── */}
      <div className="form-grid">
        <div className="form-group col-span-2">
          <label htmlFor="req-title">{copy.titleLabel}</label>
          <input
            id="req-title" className="premium-input" maxLength={200}
            value={value.title} disabled={disabled}
            placeholder={copy.titlePlaceholder}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <div className="form-group col-span-2">
          <label htmlFor="req-body">{copy.bodyLabel}</label>
          <Textarea
            variant="data"
            id="req-body" rows={4} maxLength={4000}
            value={value.body} disabled={disabled}
            placeholder={copy.bodyPlaceholder}
            onChange={(e) => set({ body: e.target.value })}
          />
          {/* วางลิงก์หรือรหัสเอกสารในรายละเอียดได้เลย — เธรดเรนเดอร์เป็นลิงก์ให้เอง
              ผ่าน RichText (/go/<รหัส>) ไม่ต้องมีช่อง "ลิงก์" แยก */}
          <small className={styles.hint}>
            วาง URL หรือรหัสเอกสาร (เช่น QT-26080001) ลงไปได้ — ระบบทำเป็นลิงก์ให้เอง
          </small>
        </div>
      </div>

      {/* ⭐ อยู่ตรงที่ช่อง "แนบไฟล์" เคยอยู่ในสายตาผู้ใช้ — ต่อจากรายละเอียด ซึ่งเป็น
          จังหวะที่คนเพิ่งเขียนบรีฟเสร็จแล้วนึกถึงไฟล์อ้างอิงพอดี · ไปวางท้ายสุดเมื่อไร
          จะกลายเป็นคำอธิบายที่มาช้ากว่าคำถามในหัว */}
      {deferAttachments && (
        <p className={styles.deferNote}>
          <Paperclip size={14} aria-hidden="true" />
          แนบไฟล์อ้างอิงได้หลังบันทึกร่าง — ไฟล์ต้องมีคำร้องให้เกาะก่อน
        </p>
      )}

      {/* ── หัวข้อที่ต้องอ้างทะเบียน: F/Mock-up อ้างกลิ่น · FB อ้างสูตร ──────── */}
      {needsScent && (
        <div className="form-group">
          <span className={styles.fieldLabel}>
            {copy.scentLabel}
          </span>
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
            // ต้องตรงกับป้ายที่มองเห็น — Mock-up ไม่ได้ขอราคา มันอ้างกลิ่นที่ลูกค้ามี
            ariaLabel={copy.scentLabel}
          />
        </div>
      )}
      {/* ประเภทสินค้าที่จะขึ้นตัวอย่าง — อ้างหมวดสินค้า ไม่ใช่ตัวสินค้า เพราะตอนขอ
          Mock-up สินค้ายังไม่มีในระบบ · ธง isExcise/requiresFdaNotice ติดมากับหมวด
          ทำให้ RD เห็นทันทีว่าตัวอย่างนี้เป็นสินค้าที่ต้องขึ้นทะเบียน/แจ้ง อย. หรือไม่ */}
      {needsProductType && (
        <div className="form-group">
          <span className={styles.fieldLabel}>ประเภทสินค้าที่จะขึ้นตัวอย่าง</span>
          <SearchableSelect
            value={value.productTypeId} disabled={disabled}
            onChange={(v) => set({ productTypeId: v })}
            options={productTypes.filter((t) => t.isActive !== false).map((t) => ({
              value: String(t.id),
              label: `${t.nameTh || t.nameEn || t.typeCode}${t.nameTh && t.nameEn ? ` (${t.nameEn})` : ""}`,
              search: `${t.nameTh || ""} ${t.nameEn || ""} ${t.typeCode || ""} ${t.mainCategoryName || ""}`,
            }))}
            placeholder="เลือกประเภทสินค้า"
            emptyText="ยังไม่มีหมวดสินค้า"
            ariaLabel="ประเภทสินค้าที่ขอ Mock-up"
          />
          {selectedProductType && (selectedProductType.isExcise || selectedProductType.requiresFdaNotice) && (
            <small className={styles.hint}>
              {[
                selectedProductType.isExcise && "สินค้าประเภทนี้เสียภาษีสรรพสามิต",
                selectedProductType.requiresFdaNotice && "ต้องแจ้ง อย.",
              ].filter(Boolean).join(" · ")}
            </small>
          )}
        </div>
      )}

      {needsFormula && (
        <div className="form-group">
          <span className={styles.fieldLabel}>{copy.formulaLabel}</span>
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

      {/* ── พัฒนาผลิตภัณฑ์: บรรทัด หมวด × กลิ่น ───────────────────────────
          ⚠️ คนละตารางกับบรรทัดวัสดุโดยสิ้นเชิง — วัสดุเลือกจากทะเบียนวัสดุแล้วขอราคา
          ส่วนนี่คือ "หมวดไหน กลิ่นไหน" ซึ่งเป็นตัวตนของสูตรที่จะเกิด · ยัดสองอย่างนี้
          ลงตารางเดียวกันจะได้ช่องที่ครึ่งหนึ่งไม่เกี่ยวกับหัวข้อที่เลือกอยู่ */}
      {lineShape === "product_dev" && (
        <div className="form-group">
          <span className={styles.fieldLabel}>{copy.itemsLabel}</span>
          <ProductDevLines
            rows={items.length ? items : [emptyProductDevRow()]}
            onChange={(rows) => set({ items: rows })}
            categories={productTypes}
            scents={scents}
            customerId={selectedDeal?.customerId || null}
            disabled={disabled}
          />
        </div>
      )}

      {/* ── ขอเอกสาร: บรรทัดชนิดเอกสาร ─────────────────────────────────── */}
      {(lineShape === "document" || lineShape === "billing_doc") && (
        <div className="form-group">
          <span className={styles.fieldLabel}>{copy.itemsLabel}</span>
          {/* ⚠️ ตารางตัวเดียวกัน **คนละชุดคำศัพท์** — เอาสองชุดมารวมลิสต์เดียวเมื่อไร
              คำร้องขอเอกสารของ RD จะมีตัวเลือก "ใบกำกับภาษี" ซึ่ง RD ออกให้ไม่ได้ */}
          <DocumentLines
            rows={items.length ? items : [emptyDocumentRow()]}
            onChange={(rows) => set({ items: rows })}
            vocabulary={lineShape === "billing_doc" ? BILLING_DOC_VOCABULARY : undefined}
            disabled={disabled}
          />
        </div>
      )}

      {/* ── หัวข้อขอราคา: บรรทัดวัสดุ + ชั้นจำนวน ─────────────────────────── */}
      {lineShape === "material" && (
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
              {copy.itemsLabel} — {MATERIAL_KIND_LABELS[materialKindForRequest(kind)]}
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

                {/* ชั้นจำนวน (MOQ) มีเฉพาะวัสดุ — มติผู้ใช้ 2026-08-03: ขอราคา F/FB
                    ไม่มีขั้น MOQ (หัวน้ำหอม/เนื้อสารคิดราคาต่อกิโลเดียว ไม่ลดตามจำนวน)
                    ขั้น MOQ มีเฉพาะวัสดุและราคาผลิต */}
                {hasTiers ? (
                  <>
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
                  </>
                ) : (
                  <small className={styles.hint}>ราคาเดียว — หัวข้อนี้ไม่มีชั้นจำนวน</small>
                )}
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

      {/* ── 6) แนบไฟล์ + กล่าวถึง (ทำงานเหมือนกล่องพิมพ์ในเธรด) ─────────────
          ⭐ หน้าที่บันทึกเป็น "ร่าง" ก่อน (`deferAttachments`) **ไม่มีสองช่องนี้** และ
          บอกไปตรง ๆ ว่าทำไม: ไฟล์ต้องมีคำร้องให้เกาะก่อน (`AttachmentsPanel` ต้องมี
          `entityId`) และ @ ยิงแจ้งเตือนตอนกดส่ง ไม่ใช่ตอนบันทึกร่าง ⇒ ถ้ายังโชว์ไว้
          จะเป็นช่องที่กรอกแล้วไม่เกิดอะไรขึ้นในจังหวะที่ผู้ใช้คาดว่าเกิด */}
      {!deferAttachments && (
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
      )}

      {/* บอกว่ายังขาดอะไรอยู่ตรงนี้ที่เดียว — ฟอร์มรู้กฎของตัวเองอยู่แล้ว (ด่าน
          ตัวเดียวกับที่ server ใช้) · ก่อนหน้านี้ปุ่มแค่จางลงเงียบ ๆ ผู้ใช้ต้องเดาว่า
          ขาดช่องไหน · โทนเป็น hint ไม่ใช่แดง เพราะกรอกยังไม่จบไม่ใช่ความผิดพลาด
          ⚠️ `showBlocker=false` = ผู้เรียกวางข้อความนี้เองที่แถบปุ่ม (ติดตากว่า) —
          **ห้ามเขียนเงื่อนไขใหม่ที่นั่น** ต้องเรียก `requestFormBlocker` ตัวเดียวกัน */}
      {showBlocker && shapeError && (
        <small className={styles.hint}>ยังกรอกไม่ครบ — {shapeError}</small>
      )}
      </>
      )}
    </>
  );
}
