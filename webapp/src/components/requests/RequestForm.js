"use client";
// ── ฟอร์มเคสขอราคาวัสดุ (mig 0158) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เปิดเคส" และ "แก้ร่าง" (กฎ AGENTS.md)
//
// ฝ่ายผู้ตอบมาจากชนิดของรายการเอง (RM→RD, PM→PC) จึงบังคับให้ทุกรายการในเคส
// เป็นชนิดฝั่งเดียวกัน — เลขที่เคสผูกกับฝ่าย ปนกันแล้วส่งผิดคน
import { Plus, Trash2 } from "lucide-react";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import MaterialPicker from "@/components/materials/MaterialPicker";
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, sourceDeptForMaterialKind } from "@/lib/materialPrices";
import { productIdentity } from "@/lib/master/productIdentity";

const QTY_SHORTCUTS = [500, 1000, 3000, 5000, 10000];

export const emptyAskItem = (kind = "PM") => ({
  kind,
  material: { materialId: null, label: "", isNew: false },
  spec: "",
  tiers: [],
  // ผูกกลับบรรทัดในใบขอราคาผลิต — ตั้งค่าเฉพาะตอนเปิดเคสจากในใบ (0159)
  componentId: null,
});

export const emptyRequestForm = () => ({
  customerId: "",
  productId: "",
  formulaCode: "",
  formulaName: "",
  note: "",
  items: [emptyAskItem("PM")],
});

export default function RequestForm({
  value, onChange, materials = [], customers = [], products = [], disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const items = value.items || [];
  const dept = items[0]?.kind ? sourceDeptForMaterialKind(items[0].kind) : null;
  const isRm = dept === "RD";

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

      <div className="form-group">
        <label htmlFor="ask-note">หมายเหตุถึงฝ่าย{dept === "PC" ? "จัดซื้อ" : "RD"}</label>
        <textarea
          id="ask-note" className="textarea-premium" rows={2} maxLength={2000}
          value={value.note} disabled={disabled}
          placeholder="เช่น งานด่วน ลูกค้าต้องการราคาภายในสัปดาห์นี้"
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>

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
    </>
  );
}
