"use client";
// ── ฟอร์มใบขอราคาต้นทุน — ใช้ตัวเดียวกันทั้งตอนสร้างและตอนแก้ (กฎ AGENTS.md) ──
// ต่างกันแค่โหมดผ่าน props:
//   mode="create" → เลือกดีลได้ (ดีลเป็นตัวตั้งของทั้งใบ)
//   mode="edit"   → ดีลล็อก (0141 guard ห้ามเปลี่ยน dealId) แสดงเป็นข้อความแทน
// payload ที่ส่งออกเป็นรูปเดียวกันทั้งสองทาง — ฝั่ง server เทียบเองว่าอะไรเปลี่ยน
// (lib/costingReconcile.js) จึงไม่ต้องมีฟอร์มแก้แยกอีกชุด
import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import EmptyState from "@/components/ui/EmptyState";

export function emptyCostingItem() {
  return { id: null, categoryCode: "", productLabel: "", fragranceName: "" };
}

// ค่าเริ่มต้นของฟอร์ม — ใบใหม่ หรือแปลงจากใบที่โหลดมา
export function costingFormFromRequest(request) {
  if (!request) {
    return { dealId: "", moq: "1000", note: "", tierQuantities: "", items: [emptyCostingItem()] };
  }
  // ชั้นจำนวนเก็บที่ระดับสินค้า แต่ทั้งใบใช้ชุดเดียวกัน — หยิบจากรายการแรกมาแสดง
  const tiers = request.items?.[0]?.tiers || [];
  return {
    dealId: request.dealId || "",
    moq: String(request.moq ?? "1000"),
    note: request.note || "",
    tierQuantities: tiers.map((t) => Number(t.qty)).join(", "),
    items: (request.items || []).map((item) => ({
      id: item.id,
      categoryCode: item.categoryCode,
      productLabel: item.productLabel,
      fragranceName: item.fragranceName || "",
    })),
  };
}

// แปลงค่าในฟอร์มเป็น payload ของ API (รูปเดียวกันทั้ง POST และ PATCH)
export function costingPayloadFrom(form) {
  return {
    dealId: form.dealId,
    moq: form.moq,
    note: form.note,
    tierQuantities: String(form.tierQuantities || "")
      .split(/[,\s]+/).filter(Boolean),
    items: form.items.map((item) => ({
      id: item.id || undefined,
      categoryCode: item.categoryCode,
      productLabel: item.productLabel,
      fragranceName: item.fragranceName,
    })),
  };
}

export default function CostingRequestForm({
  mode,
  form,
  setForm,
  deals = [],
  productTypes = [],
  templateCategories = new Set(),
  dealLabel = "",
  // รายการที่มีราคา/อนุมัติแล้ว ลบไม่ได้ — ล็อกไว้ให้เห็นตั้งแต่บนหน้าจอ
  // ไม่ต้องรอ server ปฏิเสธ (server ยังกันซ้ำอยู่ดี)
  lockedItemIds = new Set(),
}) {
  const isCreate = mode === "create";

  const dealOptions = useMemo(() => deals.map((deal) => ({
    value: deal.id,
    label: `${deal.code ? `${deal.code} · ` : ""}${deal.title || deal.id}${deal.customerName ? ` — ${deal.customerName}` : ""}`,
    search: [deal.code, deal.title, deal.customerName].filter(Boolean).join(" "),
  })), [deals]);

  // เลือกได้เฉพาะประเภทที่มีแม่แบบต้นทุนอยู่จริง — ไม่งั้นกางบรรทัดไม่ได้
  // แล้ว server จะปฏิเสธตอนกดบันทึก (เสียเวลากรอกฟรี)
  const categoryOptions = useMemo(() => productTypes
    .filter((t) => t.isActive !== false)
    .map((t) => ({
      value: `${t.mainCategoryCode}-${t.typeCode}`,
      label: `${t.mainCategoryCode}-${t.typeCode} · ${t.nameTh || t.nameEn || ""}`,
    }))
    .filter((option) => templateCategories.has(option.value)), [productTypes, templateCategories]);

  const patchItem = (idx, patch) => setForm((f) => ({
    ...f,
    items: f.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="cr-deal">ดีล</label>
          {isCreate ? (
            <SearchableSelect
              value={form.dealId}
              onChange={(value) => setForm((f) => ({ ...f, dealId: value }))}
              options={dealOptions}
              placeholder="เลือกดีลที่ต้องการขอราคา"
              ariaLabel="เลือกดีล"
            />
          ) : (
            <input className="premium-input" value={dealLabel} readOnly disabled />
          )}
          <small style={{ color: "var(--text-3)" }}>
            ลูกค้าและทีมของใบยึดตามดีลเสมอ {isCreate ? "" : "— ดีลของใบที่สร้างแล้วเปลี่ยนไม่ได้"}
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="cr-moq">MOQ (ชิ้น)</label>
          <input
            id="cr-moq" className="premium-input" type="number" min="1" step="1"
            value={form.moq}
            onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))}
          />
          <small style={{ color: "var(--text-3)" }}>ระบบเพิ่มชั้นจำนวนของ MOQ ให้เสมอ</small>
        </div>

        <div className="form-group">
          <label htmlFor="cr-tiers">ชั้นจำนวนเพิ่มเติม</label>
          <input
            id="cr-tiers" className="premium-input"
            placeholder="เช่น 500, 3000, 5000"
            value={form.tierQuantities}
            onChange={(e) => setForm((f) => ({ ...f, tierQuantities: e.target.value }))}
          />
          <small style={{ color: "var(--text-3)" }}>คั่นด้วยจุลภาค — ผู้บริหารกรอกราคาแยกต่อชั้น</small>
        </div>

        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="cr-note">หมายเหตุ</label>
          <textarea
            id="cr-note" className="textarea-premium" rows={2} maxLength={2000}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <span className="toolbar-label">สินค้าในใบ ({form.items.length})</span>
          <span className="spacer" />
          <button
            type="button" className="btn sm"
            onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyCostingItem()] }))}
          >
            <Plus size={14} /> เพิ่มสินค้า
          </button>
        </div>

        {categoryOptions.length === 0 ? (
          <EmptyState plain>
            ยังไม่มีประเภทสินค้าที่มีแม่แบบต้นทุน — ให้ผู้ดูแลระบบสร้างแม่แบบที่
            ตั้งค่า → แม่แบบต้นทุนตามประเภทสินค้า ก่อน
          </EmptyState>
        ) : (
          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: 240 }}>ประเภทสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th style={{ width: 200 }}>กลิ่น</th>
                  <th style={{ width: 60 }} aria-label="จัดการ" />
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, idx) => {
                  const locked = !!item.id && lockedItemIds.has(item.id);
                  return (
                    <tr key={item.id || `new-${idx}`}>
                      <td>
                        <Select
                          value={item.categoryCode}
                          onChange={(e) => patchItem(idx, { categoryCode: e.target.value })}
                          disabled={locked}
                          options={[{ value: "", label: "— เลือกประเภท —" }, ...categoryOptions]}
                          aria-label={`ประเภทสินค้ารายการที่ ${idx + 1}`}
                        />
                        {locked && (
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                            มีราคาแล้ว เปลี่ยนประเภทไม่ได้
                          </div>
                        )}
                      </td>
                      <td>
                        <input
                          className="premium-input"
                          value={item.productLabel}
                          maxLength={300}
                          placeholder="เช่น Reed Diffuser 100ml แบรนด์ A"
                          aria-label={`ชื่อสินค้ารายการที่ ${idx + 1}`}
                          onChange={(e) => patchItem(idx, { productLabel: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="premium-input"
                          value={item.fragranceName}
                          maxLength={300}
                          placeholder="ชื่อกลิ่น (ถ้ามี)"
                          aria-label={`กลิ่นรายการที่ ${idx + 1}`}
                          onChange={(e) => patchItem(idx, { fragranceName: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button" className="btn-icon danger"
                          aria-label={`ลบรายการที่ ${idx + 1}`}
                          disabled={locked || form.items.length === 1}
                          title={locked ? "มีราคาที่ฝ่ายอื่นตอบแล้ว ลบไม่ได้" : undefined}
                          onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <small style={{ color: "var(--text-3)", display: "block", marginTop: 8 }}>
          บรรทัดต้นทุนของแต่ละสินค้าจะถูกกางจากแม่แบบของประเภทนั้นให้อัตโนมัติ
          และกลายเป็นสำเนาของใบนี้ — แม่แบบแก้ทีหลังไม่กระทบใบที่กางไปแล้ว
        </small>
      </div>
    </div>
  );
}
