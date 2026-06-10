"use client";
import { useState, useMemo, useEffect } from "react";
import Modal from "@/components/Modal";
import { X } from "lucide-react";

export default function ProjectFormModal({
  open, onClose, editingId, initialData, onSuccess,
  customers = [], categories = [], allProducts = [], users = []
}) {
  const blank = {
    code: "", name: "", customerId: "", type: "NPD",
    startDate: "", dueDate: "", productMainCategory: "", productSubCategory: "", aeOwner: "",
    mainCode: "", typeCode: "", docNumber: "",
    aeSupervisor: "", preparedBy: "", customerEmail: "",
    projectProducts: [],
  };

  const [form, setForm] = useState(blank);
  const [linkFg, setLinkFg] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingId && initialData) {
        setForm({
          ...blank,
          ...initialData,
          mainCode: (initialData.productMainCategory || "").split("-")[0] || "",
          typeCode: (initialData.productMainCategory || "").split("-")[1] || "",
          projectProducts: initialData.projectProducts ? initialData.projectProducts.map(pp => ({
            productId: pp.productId, orderQty: pp.orderQty || "", productionQty: pp.productionQty || ""
          })) : [],
        });
        setLinkFg((initialData.projectProducts || []).length > 0);
      } else {
        setForm(blank);
        setLinkFg(false);
      }
    }
  }, [open, editingId, initialData]);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleFg = (id) => {
    setForm(f => {
      const isSelected = f.projectProducts.some(p => p.productId === id);
      const newProducts = isSelected 
        ? f.projectProducts.filter(p => p.productId !== id) 
        : [...f.projectProducts, { productId: id, orderQty: "", productionQty: "" }];
      
      const firstFgId = newProducts.length > 0 ? newProducts[0].productId : null;
      const fg = firstFgId ? allProducts.find(p => p.id === firstFgId) : null;
      
      if (fg && newProducts.length > 0 && !isSelected) {
        return {
          ...f,
          projectProducts: newProducts,
          customerId: f.customerId || fg.customerId || "",
          mainCode: f.mainCode || (fg.categoryCode ? fg.categoryCode.split("-")[0] : ""),
          typeCode: f.typeCode || (fg.categoryCode ? fg.categoryCode.split("-")[1] : ""),
          productMainCategory: f.productMainCategory || fg.categoryCode || "",
          productSubCategory: f.productSubCategory || categories.find(c => c.mainCategoryCode === fg.categoryCode?.split("-")[0] && c.typeCode === fg.categoryCode?.split("-")[1])?.nameTh || "",
          name: f.name || fg.brandName || fg.productDescription || ""
        };
      }
      return { ...f, projectProducts: newProducts };
    });
  };

  const updateFgQty = (id, field, value) => {
    setForm(f => ({
      ...f,
      projectProducts: f.projectProducts.map(p => p.productId === id ? { ...p, [field]: value } : p)
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = { ...form };
    if (form.customerId) payload.customerName = customers.find((c) => c.id === form.customerId)?.name || "";
    try {
      const res = await fetch(
        editingId ? `/api/pm/projects/${editingId}` : "/api/pm/projects",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (res.ok) {
        onSuccess(data);
      } else {
        alert(data.error || (editingId ? "บันทึกไม่สำเร็จ" : "สร้างโปรเจกต์ไม่สำเร็จ"));
      }
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setSubmitting(false); }
  };

  const mainCatOptions = useMemo(() => {
    const seen = new Map();
    categories.forEach((c) => { if (!seen.has(c.mainCategoryCode)) seen.set(c.mainCategoryCode, c.mainCategoryName); });
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ code, name }));
  }, [categories]);

  const subCatOptions = useMemo(
    () => categories.filter((c) => c.mainCategoryCode === form.mainCode),
    [categories, form.mainCode],
  );

  const changeMain = (mainCode) => setForm((f) => ({ ...f, mainCode, typeCode: "", productMainCategory: "", productSubCategory: "" }));
  const changeSub = (typeCode) => setForm((f) => {
    const t = categories.find((c) => c.mainCategoryCode === f.mainCode && c.typeCode === typeCode);
    return { ...f, typeCode, productMainCategory: typeCode ? `${f.mainCode}-${typeCode}` : "", productSubCategory: t ? (t.nameTh || t.nameEn || "") : "" };
  });
  const subLabel = (c) => `${c.typeCode} ${c.nameTh || c.nameEn || ""}`.trim();

  return (
    <Modal open={open} onClose={onClose} title={editingId ? "แก้ไขโปรเจกต์" : "สร้างโปรเจกต์ใหม่"} size="lg">
      <form onSubmit={submit}>
        <div className="grid grid-cols-2 gap-[18px]">
          <div className="col-span-2 text-[15px] font-semibold text-[var(--text)] border-b border-[var(--border)] pb-2 mb-2 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[12px]">1</span> ข้อมูลทั่วไป (General Info)
          </div>
          
          <div className="form-group">
            <label>รหัสโครงการ <span className="text-[var(--red)]">*</span></label>
            <input name="code" value={form.code} onChange={change} required className="premium-input w-full font-mono" />
          </div>
          <div className="form-group">
            <label>ประเภทงาน</label>
            <select name="type" value={form.type} onChange={change} disabled={!!editingId} className="premium-input w-full">
              <option value="NPD">NPD (สินค้าใหม่)</option>
              <option value="RE-ORDER">RE-ORDER (สั่งซ้ำ)</option>
            </select>
          </div>
          <div className="form-group col-span-2">
            <label>ชื่อโปรเจกต์ / สินค้า <span className="text-[var(--red)]">*</span></label>
            <input name="name" value={form.name} onChange={change} required className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>วันที่เริ่มโปรเจกต์</label>
            <input type="date" name="startDate" value={form.startDate} onChange={change} className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>Due Date <span className="text-[var(--text-3)] font-normal">(กำหนดส่งลูกค้า)</span></label>
            <input type="date" name="dueDate" value={form.dueDate} onChange={change} className="premium-input w-full" />
          </div>
          <div className="form-group col-span-2">
            <label>เลขที่เอกสาร <span className="text-[var(--text-3)] font-normal">(ISO)</span></label>
            <input name="docNumber" value={form.docNumber} onChange={change} className="premium-input w-full" />
          </div>

          <div className="col-span-2 text-[15px] font-semibold text-[var(--text)] border-b border-[var(--border)] pb-2 mt-4 mb-2 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[12px]">2</span> ข้อมูลลูกค้า (Customer Info)
          </div>
          
          <div className="form-group col-span-2">
            <label>บริษัทลูกค้า</label>
            <select name="customerId" value={form.customerId} onChange={change} className="premium-input w-full">
              <option value="">— เลือกลูกค้า —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group col-span-2">
            <label>อีเมลลูกค้า</label>
            <input type="email" name="customerEmail" value={form.customerEmail} onChange={change} className="premium-input w-full" />
          </div>
        </div>

        <div className="mt-6 mb-4 text-[15px] font-semibold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[12px]">3</span> ข้อมูลสินค้า (Product Info)
        </div>

        <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", background: "var(--panel)", marginBottom: "18px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}>
            <input type="checkbox" checked={linkFg} onChange={(e) => setLinkFg(e.target.checked)} style={{ accentColor: "var(--accent)", width: "16px", height: "16px" }} />
            ผูกสินค้า (FG) ที่มีอยู่แล้ว
          </label>
          
          {linkFg && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-2)", marginBottom: "8px" }}>เลือก FG (รายการจะกรองตาม <b>หมวดสินค้า</b> ที่เลือกด้านล่าง) ระบบจะดึงข้อมูลลูกค้าและหมวดหมู่มาให้อัตโนมัติ</div>
              
              {form.projectProducts.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                  {form.projectProducts.map(pp => {
                    const p = allProducts.find(x => x.id === pp.productId);
                    if (!p) return null;
                    const cat = categories.find(c => c.mainCategoryCode === p.categoryCode?.split("-")[0] && c.typeCode === p.categoryCode?.split("-")[1]);
                    return (
                      <div key={pp.productId} style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--panel-2)", border: "1px solid var(--border)", padding: "8px 12px", borderRadius: "6px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="font-mono text-[13px] font-semibold">{p.fgCode}</span>
                            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{p.volume ? `(${p.volume} ml)` : ""}</span>
                            <span style={{ fontSize: "11px", background: "var(--blue-soft)", color: "var(--blue)", padding: "2px 6px", borderRadius: "4px" }}>
                              {cat ? cat.nameTh : p.categoryCode || "ไม่มีหมวด"}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-2)" }}>{p.productDescription || p.brandName || "-"}</div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", width: "240px" }}>
                          <input type="text" placeholder="สั่งซื้อ" value={pp.orderQty} onChange={(e) => updateFgQty(pp.productId, "orderQty", e.target.value)} className="premium-input w-full text-[12px] h-[32px]" />
                          <input type="text" placeholder="ผลิต" value={pp.productionQty} onChange={(e) => updateFgQty(pp.productId, "productionQty", e.target.value)} className="premium-input w-full text-[12px] h-[32px]" />
                        </div>
                        <button type="button" onClick={() => toggleFg(pp.productId)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "4px" }}><X size={16} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <select value="" onChange={(e) => { if(e.target.value) toggleFg(e.target.value); }} className="premium-select w-full">
                <option value="">— เพิ่ม FG —</option>
                {allProducts
                  .filter(pr => !form.projectProducts.some(pp => pp.productId === pr.id))
                  .filter(pr => !form.productMainCategory || pr.categoryCode === form.productMainCategory) // 2-way filter
                  .map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.fgCode} — {pr.productDescription || pr.brandName || ""} {pr.volume ? `(${pr.volume} ml)` : ""}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", background: "var(--panel)" }}>
          <div style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 600, marginBottom: "12px" }}>
            หมวดสินค้า <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(หมวดหลัก → หมวดรอง — มีผลต่อขั้นตอนสรรพสามิต)</span>
          </div>
          <div className="grid grid-cols-2 gap-[14px]">
            <div className="form-group">
              <label>หมวดหลัก</label>
              <select value={form.mainCode} onChange={(e) => changeMain(e.target.value)} className="premium-input w-full">
                <option value="">— ไม่ระบุ —</option>
                {mainCatOptions.map((o) => (
                  <option key={o.code} value={o.code}>{o.code} {o.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>หมวดรอง</label>
              <select value={form.typeCode} onChange={(e) => changeSub(e.target.value)} disabled={!form.mainCode} className="premium-input w-full">
                <option value="">{form.mainCode ? "— เลือกหมวดรอง —" : "เลือกหมวดหลักก่อน"}</option>
                {subCatOptions.map((c) => (
                  <option key={c.id} value={c.typeCode}>{subLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>
          {form.productMainCategory && (
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "8px" }}>
              รหัสหมวด: <span className="font-mono">{form.productMainCategory}</span>
              {form.productMainCategory === "01-002" && <span style={{ color: "var(--amber)" }}> · เข้าข่ายสรรพสามิต (จะมีขั้นตอนขึ้นทะเบียน)</span>}
            </div>
          )}
        </div>

        <div className="mt-6 mb-4 text-[15px] font-semibold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[12px]">4</span> ทีมงานผู้รับผิดชอบ (Team)
        </div>

        <div className="grid grid-cols-2 gap-[18px]">
          <div className="form-group col-span-2">
            <label>ผู้ดูแล (Account Executive)</label>
            <select name="aeOwner" value={form.aeOwner} onChange={change} className="premium-input w-full">
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ae" || u.role === "senior_ae").map((u) => {
                const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div className="form-group">
            <label>ผู้จัดทำ (Account Coordinator)</label>
            <select name="preparedBy" value={form.preparedBy} onChange={change} className="premium-input w-full">
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ac").map((u) => {
                const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div className="form-group">
            <label>ผู้ตรวจสอบ (AE Supervisor)</label>
            <select name="aeSupervisor" value={form.aeSupervisor} onChange={change} className="premium-input w-full">
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ae_supervisor").map((u) => {
                const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </select>
          </div>
        </div>

        {!editingId && (
          <p className="text-[12px] text-[var(--text-3)] mt-3">
            ระบบจะสร้างขั้นตอนงาน (timeline) อัตโนมัติจากเทมเพลต {form.type} และคำนวณวันทำการให้
          </p>
        )}
        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn">ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-8">
            {submitting ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "สร้างโปรเจกต์"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
