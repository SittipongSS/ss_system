"use client";
// ── ฟอร์มเคสขอราคาวัสดุ (mig 0158) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เปิดเคส" และ "แก้ร่าง" (กฎ AGENTS.md)
//
// ฝ่ายผู้ตอบมาจากชนิดของรายการเอง (RM→RD, PM→PC) จึงบังคับให้ทุกรายการในเคส
// เป็นชนิดฝั่งเดียวกัน — เลขที่เคสผูกกับฝ่าย ปนกันแล้วส่งผิดคน
import { Plus, Trash2 } from "lucide-react";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DateInput from "@/components/ui/DateInput";
import MaterialPicker from "@/components/materials/MaterialPicker";
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, sourceDeptForMaterialKind } from "@/lib/materialPrices";
import { productIdentity } from "@/lib/master/productIdentity";
import {
  REQUEST_DEPTS, REQUEST_KIND_LIST, requestHasItems, requestKindLabel, requestKindMeta,
} from "@/lib/master/requestTypes";
import { isScentUsable } from "@/lib/master/scents";
import { isFormulaUsable } from "@/lib/master/formulas";

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

export const emptyRequestForm = (kind = "price_pm") => ({
  kind,
  dept: "",            // เฉพาะชนิดที่ไม่ล็อกฝ่าย (สอบถาม/ขอเอกสาร)
  title: "",
  body: "",
  urgent: false,
  requestedDueDate: "",
  dealId: "",
  scentId: "",
  formulaId: "",
  customerId: "",
  productId: "",
  formulaCode: "",
  formulaName: "",
  note: "",
  items: [emptyAskItem("PM")],
});

export default function RequestForm({
  value, onChange, materials = [], customers = [], products = [],
  deals = [], scents = [], formulas = [],
  // ล็อกชนิดไว้เมื่อบริบทเป็นตัวกำหนดเอง (เปิดจากบรรทัดในใบขอราคาผลิต)
  lockKind = false, disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const items = value.items || [];
  const kind = value.kind || "price_pm";
  const meta = requestKindMeta(kind) || {};
  const hasItems = requestHasItems(kind);
  // ชนิดที่ล็อกฝ่ายไว้ใช้ค่านั้น · ชนิดขอราคาอนุมานจากรายการ · ที่เหลือผู้ขอเลือกเอง
  const dept = meta.dept
    || (hasItems && items[0]?.kind ? sourceDeptForMaterialKind(items[0].kind) : null)
    || value.dept || null;
  const isRm = dept === "RD" && hasItems;

  const patchItem = (idx, patch) => set({
    items: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
  });
  const addItem = () => set({ items: [...items, emptyAskItem(items[0]?.kind || "PM")] });
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

  return (
    <>
      {/* ── ชนิดคำร้อง = ตัวคุมว่าฟอร์มจะถามอะไรต่อ ───────────────────── */}
      <div className="form-grid">
        <div className="form-group col-span-2">
          <label htmlFor="req-kind">ขอเรื่องอะไร</label>
          <Select
            id="req-kind" value={kind} disabled={disabled || lockKind}
            onChange={(e) => {
              // เปลี่ยนชนิด = ล้างช่องเฉพาะชนิดทิ้ง ไม่งั้นค่าเก่าค้างแล้วส่งไปกับ
              // คำร้องชนิดใหม่ (เช่น กลิ่นที่เลือกไว้ตอนขอราคา F ค้างบนคำขอเอกสาร)
              const next = e.target.value;
              set({
                ...emptyRequestForm(next),
                // เก็บของที่ยังมีความหมายข้ามชนิดไว้
                customerId: value.customerId,
                dealId: value.dealId,
                urgent: value.urgent,
                requestedDueDate: value.requestedDueDate,
                note: value.note,
              });
            }}
            options={REQUEST_KIND_LIST.map((k) => ({ value: k, label: requestKindLabel(k) }))}
          />
          {meta.hint && <small style={{ color: "var(--text-3)" }}>{meta.hint}</small>}
        </div>

        {/* ชนิดที่ไม่ล็อกฝ่าย ผู้ขอต้องเลือกเองว่าถามใคร */}
        {!meta.dept && !hasItems && (
          <div className="form-group">
            <label htmlFor="req-dept">ถามฝ่ายไหน</label>
            <Select
              id="req-dept" value={value.dept} disabled={disabled}
              onChange={(e) => set({ dept: e.target.value })}
              options={[
                { value: "", label: "เลือกฝ่าย" },
                ...REQUEST_DEPTS.map((d) => ({ value: d, label: DEPT_LABEL[d] || d })),
              ]}
            />
          </div>
        )}

        {/* ชนิดที่ไม่มีบรรทัด: หัวเรื่อง + รายละเอียด แทนตารางรายการ */}
        {!hasItems && (
          <>
            <div className="form-group col-span-2">
              <label htmlFor="req-title">หัวเรื่อง</label>
              <input
                id="req-title" className="premium-input" maxLength={200}
                value={value.title} disabled={disabled}
                placeholder={kind === "scent_brief" ? "เช่น บรีฟกลิ่นสำหรับ Reed Diffuser ลูกค้า A"
                  : kind === "mockup" ? "เช่น ขอ Mock-up ขวด 30 ml พร้อมฉลาก"
                  : "สรุปสั้น ๆ ว่าขออะไร"}
                onChange={(e) => set({ title: e.target.value })}
              />
            </div>
            <div className="form-group col-span-2">
              <label htmlFor="req-body">รายละเอียด</label>
              <textarea
                id="req-body" className="textarea-premium" rows={4} maxLength={4000}
                value={value.body} disabled={disabled}
                placeholder={kind === "scent_brief"
                  ? "โทนกลิ่นที่ต้องการ · กลุ่มลูกค้า · ตัวอย่างอ้างอิง · ข้อจำกัด"
                  : "อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ"}
                onChange={(e) => set({ body: e.target.value })}
              />
            </div>
          </>
        )}

        {/* บังคับผูกดีลเฉพาะชนิดงานลูกค้า (มติ 5) */}
        {meta.needsDeal && (
          <div className="form-group col-span-2">
            <label htmlFor="req-deal">ดีลที่เกี่ยวข้อง</label>
            <SearchableSelect
              value={value.dealId} disabled={disabled} entity="deal"
              onChange={(v) => {
                const d = deals.find((x) => x.id === v);
                set({ dealId: v, customerId: d?.customerId || value.customerId });
              }}
              options={deals.map((d) => ({
                value: d.id,
                label: `${d.code || d.id} — ${d.title || ""}`.trim(),
                search: `${d.code || ""} ${d.title || ""} ${d.customerName || ""}`,
              }))}
              placeholder="เลือกดีล"
              ariaLabel="ดีลที่เกี่ยวข้อง"
            />
            {meta.dealType && (
              <small style={{ color: "var(--text-3)" }}>
                ชนิดนี้ใช้กับดีลประเภท {meta.dealType} เป็นหลัก
              </small>
            )}
          </div>
        )}

        {/* ขอราคา F อ้างกลิ่น · FB อ้างสูตร — เลือกจากทะเบียนด้วย id ไม่ใช่พิมพ์ชื่อ */}
        {meta.refs === "scent" && (
          <div className="form-group col-span-2">
            <label htmlFor="req-scent">กลิ่นที่ลูกค้าคอนเฟิร์ม</label>
            <SearchableSelect
              value={value.scentId} disabled={disabled}
              onChange={(v) => {
                const s = scents.find((x) => x.id === v);
                set({ scentId: v, customerId: s?.customerId || value.customerId });
              }}
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
          <div className="form-group col-span-2">
            <label htmlFor="req-formula">สูตรที่ลูกค้าคอนเฟิร์ม</label>
            <SearchableSelect
              value={value.formulaId} disabled={disabled}
              onChange={(v) => {
                const f = formulas.find((x) => x.id === v);
                set({
                  formulaId: v,
                  formulaCode: f?.code || value.formulaCode,
                  formulaName: f?.name || value.formulaName,
                  customerId: f?.customerId || value.customerId,
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

        <div className="form-group">
          <label htmlFor="req-due">อยากได้คำตอบภายใน</label>
          <DateInput
            id="req-due" value={value.requestedDueDate} disabled={disabled}
            onChange={(v) => set({ requestedDueDate: v })}
          />
          <small style={{ color: "var(--text-3)" }}>
            เป็นความคาดหวัง — ฝ่ายปลายทางจะรับปากวันจริงตอนกดรับเรื่อง
          </small>
        </div>
        <div className="form-group">
          <label htmlFor="req-urgent">ความเร่งด่วน</label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
            <input
              id="req-urgent" type="checkbox" checked={!!value.urgent} disabled={disabled}
              onChange={(e) => set({ urgent: e.target.checked })}
            />
            <span style={{ fontSize: 13 }}>งานด่วน</span>
          </label>
        </div>
      </div>

      {/* ลูกค้า/สินค้า/สูตร เป็นบริบทของ "ราคา" — ชนิดที่ไม่มีบรรทัดไม่ต้องถาม
          (ลูกค้าของงานมาจากดีลที่เลือกไว้แล้ว) */}
      {hasItems && (
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="ask-customer">ลูกค้า (ถ้าเป็นราคาเฉพาะราย)</label>
          <SearchableSelect
            value={value.customerId} disabled={disabled} entity="customer"
            onChange={(v) => set({ customerId: v })}
            options={[
              { value: "", label: "ราคากลาง (ไม่ผูกลูกค้า)" },
              ...customers.map((c) => ({ value: c.id, label: c.name, search: `${c.name} ${c.id}` })),
            ]}
            ariaLabel="ลูกค้าของเคสนี้"
          />
          <small style={{ color: "var(--text-3)" }}>
            ราคาที่ตอบกลับจะเข้าทะเบียนเป็นราคาของลูกค้ารายนี้โดยเฉพาะ
          </small>
        </div>

        {isRm && (
          <>
            <div className="form-group">
              <label htmlFor="ask-product">สินค้า / สูตรที่ลูกค้าคอนเฟิร์ม</label>
              <SearchableSelect
                value={value.productId} disabled={disabled} entity="product"
                onChange={(v) => {
                  const p = products.find((x) => x.id === v);
                  set({
                    productId: v,
                    formulaCode: p?.formulaCode || value.formulaCode,
                    formulaName: p?.formulaName || value.formulaName,
                  });
                }}
                options={[
                  { value: "", label: "ไม่ระบุสินค้า" },
                  // ตัวตนสินค้าใช้ productIdentity ตัวเดียวทั้งระบบ (มาตรฐาน PR #730) —
                  // ห้ามประกอบ `fgCode — name` เองอีก ไม่งั้นแบรนด์/ปริมาตรหายไปเงียบ ๆ
                  ...products.map((p) => {
                    const identity = productIdentity(p);
                    return {
                      value: p.id,
                      label: identity.text,
                      search: `${identity.search} ${p.formulaCode || ""}`,
                    };
                  }),
                ]}
                ariaLabel="สินค้าที่ขอราคา"
              />
            </div>
            <div className="form-group">
              <label htmlFor="ask-formula">รหัสสูตร</label>
              <input
                id="ask-formula" className="premium-input" value={value.formulaCode}
                disabled={disabled} placeholder="เช่น FM-2401"
                onChange={(e) => set({ formulaCode: e.target.value })}
              />
              <small style={{ color: "var(--text-3)" }}>ราคา F/FB ผูกกับสูตร — คนละสูตรคือคนละราคา</small>
            </div>
          </>
        )}
      </div>
      )}

      <div className="form-group">
        <label htmlFor="ask-note">หมายเหตุถึงฝ่าย{dept === "PC" ? "จัดซื้อ" : dept === "RD" ? "RD" : "ปลายทาง"}</label>
        <textarea
          id="ask-note" className="textarea-premium" rows={2} maxLength={2000}
          value={value.note} disabled={disabled}
          placeholder="เช่น งานด่วน ลูกค้าต้องการราคาภายในสัปดาห์นี้"
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>

      {hasItems && (
      <div className="form-group">
        <label>รายการที่ขอราคา</label>
        {items.map((item, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 170 }}>
                {/* รายการที่ผูกกลับบรรทัดในใบขอราคาผลิต ชนิดถูกกำหนดโดยบรรทัดนั้น */}
                <Select
                  value={item.kind} disabled={disabled || idx > 0 || !!item.componentId}
                  onChange={(e) => {
                    const kind = e.target.value;
                    const nextDept = sourceDeptForMaterialKind(kind);
                    // เปลี่ยนชนิดของรายการแรก = เปลี่ยนฝ่ายผู้ตอบของทั้งเคส —
                    // ถ้าปล่อยให้รายการอื่นค้างชนิดเดิม จะไปตายตอนกดสร้าง
                    set({
                      items: items.map((other, i) => {
                        if (i === idx) return { ...other, ...emptyAskItem(kind) };
                        return sourceDeptForMaterialKind(other.kind) === nextDept
                          ? other
                          : { ...other, ...emptyAskItem(kind) };
                      }),
                    });
                  }}
                  options={MATERIAL_KINDS.map((k) => ({ value: k, label: MATERIAL_KIND_LABELS[k] }))}
                  aria-label={`ชนิดของรายการที่ ${idx + 1}`}
                />
                {idx > 0 && (
                  <small style={{ color: "var(--text-3)" }}>ทุกรายการต้องเป็นฝ่ายเดียวกัน</small>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <MaterialPicker
                  materials={materials} kind={item.kind} customerId={value.customerId || null}
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

            <textarea
              className="textarea-premium" style={{ marginTop: 8 }} rows={2} maxLength={2000}
              value={item.spec} disabled={disabled}
              aria-label={`สเปกของรายการที่ ${idx + 1}`}
              placeholder={item.kind === "PM"
                ? "สเปก เช่น ขวดขนาด 30 ml สีชา สกรีนที่ขวด 1 จุด 1 สี"
                : "รายละเอียดที่ต้องการ เช่น ความเข้มข้น / ปริมาณที่จะสั่ง"}
              onChange={(e) => patchItem(idx, { spec: e.target.value })}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>ขอราคาที่จำนวน:</span>
              {(item.tiers || []).map((qty) => (
                <button
                  key={qty} type="button" className="chip" disabled={disabled}
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer" }}
                  onClick={() => toggleTier(idx, qty)}
                  aria-label={`เอาชั้น ${qty} ออก`}
                >
                  {qty.toLocaleString("th-TH")} ✕
                </button>
              ))}
              {QTY_SHORTCUTS.filter((q) => !(item.tiers || []).includes(q)).map((q) => (
                <button
                  key={q} type="button" className="chip" disabled={disabled}
                  style={{ cursor: "pointer" }} onClick={() => toggleTier(idx, q)}
                >
                  +{q.toLocaleString("th-TH")}
                </button>
              ))}
              <input
                className="premium-input" style={{ width: 120 }} type="number" min="1"
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
            <small style={{ color: "var(--text-3)" }}>
              ปุ่มเป็นแค่ทางลัด — พิมพ์จำนวนเท่าไรก็ได้แล้วกด Enter · ไม่เลือกเลย = ขอราคาเดียว
            </small>
          </div>
        ))}

        <button type="button" className="btn sm" onClick={addItem} disabled={disabled}>
          <Plus size={13} /> เพิ่มรายการ
        </button>
      </div>
      )}
    </>
  );
}
