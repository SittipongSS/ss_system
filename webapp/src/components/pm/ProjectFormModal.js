"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import Modal from "@/components/Modal";
import { X, ChevronDown } from "lucide-react";

// Searchable dropdown for a list of string values (brand). Lets the user type to
// filter and pick from existing brands. ("dropdown + ค้นหาได้")
function SearchableTextSelect({ value, onChange, options, placeholder, disabled }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(s)).slice(0, 50);
  }, [options, search]);
  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <input
          className="premium-input w-full"
          value={open ? search : (value || "")}
          disabled={disabled}
          placeholder={placeholder || "เลือกหรือค้นหาแบรนด์..."}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); onChange(e.target.value); }}
          onFocus={() => { setSearch(value || ""); setOpen(true); }}
          style={{ paddingRight: "28px" }}
        />
        <ChevronDown size={16} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
      </div>
      {open && !disabled && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "6px", maxHeight: "200px", overflowY: "auto", zIndex: 50, marginTop: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "6px 10px", fontSize: "12px", color: "var(--text-3)" }}>ไม่พบแบรนด์ (พิมพ์เพื่อเพิ่มใหม่)</div>
          ) : filtered.map((opt) => (
            <div
              key={opt}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{ padding: "6px 10px", fontSize: "13px", cursor: "pointer", borderBottom: "1px solid var(--border)", color: "var(--text)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectFormModal({
  open, onClose, editingId, initialData, onSuccess,
  customers = [], categories = [], allProducts = [],
}) {
  // Assignable users are fetched fresh every time the modal opens (not at the
  // parent page's mount) so a newly-added user shows up without a full reload.
  const [users, setUsers] = useState([]);
  const blank = {
    code: "", name: "", customerId: "", type: "NPD",
    startDate: "", dueDate: "", productMainCategory: "", productSubCategory: "", aeOwner: "",
    mainCode: "", typeCode: "",
    aeSupervisor: "", preparedBy: "", customerEmail: "",
    projectProducts: [],
    quotationNumber: "", brand: "", poNumber: "",
  };

  const [form, setForm] = useState(blank);
  const [linkFg, setLinkFg] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewCode, setPreviewCode] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/pm/assignable-users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUsers(d || []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) {
      if (editingId && initialData) {
        setForm({
          ...blank,
          ...initialData,
          quotationNumber: initialData.metadata?.quotationNumber || "",
          brand: initialData.metadata?.brand || "",
          poNumber: initialData.metadata?.poNumber || "",
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
        setPreviewCode("");
        fetch("/api/pm/projects/next-code")
          .then(r => r.ok ? r.json() : {})
          .then(d => { if (d.nextCode) setPreviewCode(d.nextCode); })
          .catch(() => {});
      }
    }
  }, [open, editingId, initialData]);

  // ข้อ 1: หมวดสินค้า "อิงตาม FG ที่ผูก" — ถ้ามี FG ที่เป็น 01-002 (สรรพสามิต)
  // แม้แต่ตัวเดียว ทั้งโปรเจกต์ใช้หมวด 01-002 (เป็นใหญ่สุด → ได้ template เสียภาษี);
  // ถ้าไม่มีตัวไหนเป็น 01-002 ใช้หมวดของ FG ตัวแรกเพื่อแสดงผล. ไม่มี FG → ปล่อยให้เลือกเอง
  const fgCategoryLock = form.projectProducts.length > 0;
  useEffect(() => {
    if (!open) return;
    const fgs = form.projectProducts.map((pp) => allProducts.find((p) => p.id === pp.productId)).filter(Boolean);
    if (!fgs.length) return; // ไม่มี FG → คงค่าที่ผู้ใช้เลือกเองไว้
    const code = fgs.some((f) => f.categoryCode === "01-002") ? "01-002" : (fgs[0].categoryCode || "");
    const [mainCode = "", typeCode = ""] = code ? code.split("-") : [];
    if (code === form.productMainCategory && mainCode === form.mainCode && typeCode === form.typeCode) return;
    const sub = categories.find((c) => c.mainCategoryCode === mainCode && c.typeCode === typeCode)?.nameTh || "";
    setForm((f) => ({ ...f, productMainCategory: code, mainCode, typeCode, productSubCategory: sub }));
  }, [open, form.projectProducts, allProducts, categories]);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleFg = (id) => {
    setForm(f => {
      const isSelected = f.projectProducts.some(p => p.productId === id);
      const newProducts = isSelected
        ? f.projectProducts.filter(p => p.productId !== id)
        : [...f.projectProducts, { productId: id, orderQty: "", productionQty: "" }];

      // Auto-fill customer/name from the first linked FG (only when still empty).
      // หมวดสินค้าไม่เซ็ตที่นี่ — ปล่อยให้ effect ด้านล่าง derive จาก FG ทั้งหมด
      // (01-002 เป็นใหญ่สุด) เพื่อให้ "FG เป็นตัวกำหนดหมวด" เสมอ
      const firstFg = newProducts[0] ? allProducts.find(p => p.id === newProducts[0].productId) : null;
      if (firstFg && !isSelected) {
        return {
          ...f,
          projectProducts: newProducts,
          customerId: f.customerId || firstFg.customerId || "",
          name: f.name || firstFg.brandName || firstFg.productDescription || "",
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
    // ข้อ 2: แจ้งเตือนก่อนปรับขั้นตอน — เมื่อแก้โปรเจกต์เดิมแล้วสถานะสรรพสามิต
    // (01-002) พลิก ระบบจะเพิ่ม/ลบเฉพาะขั้นตอนสรรพสามิต + คำนวณกำหนดการใหม่
    if (editingId) {
      const wasExcise = (initialData?.productMainCategory || "") === "01-002";
      const nowExcise = (form.productMainCategory || "") === "01-002";
      if (wasExcise !== nowExcise) {
        const msg = nowExcise
          ? "หมวดสินค้าเปลี่ยนเป็นสรรพสามิต (01-002)\nระบบจะเพิ่มขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่ (ขั้นตอนที่ทำไปแล้วจะถูกเก็บไว้)\n\nดำเนินการต่อหรือไม่?"
          : "หมวดสินค้าเปลี่ยนออกจากสรรพสามิต\nระบบจะลบขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่ (ขั้นตอนอื่นจะถูกเก็บไว้)\n\nดำเนินการต่อหรือไม่?";
        if (!window.confirm(msg)) return;
      }
    }
    setSubmitting(true);
    const payload = { ...form };
    if (form.customerId) payload.customerName = customers.find((c) => c.id === form.customerId)?.name || "";
    payload.metadata = { ...(initialData?.metadata || {}), quotationNumber: form.quotationNumber, brand: form.brand, poNumber: form.poNumber };
    delete payload.quotationNumber;
    delete payload.brand;
    delete payload.poNumber;
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
    categories.forEach((c) => {
      if (!c.mainCategoryCode) return; // ข้ามหมวดหลักที่ code ว่าง
      if (!(c.mainCategoryName || "").trim()) return; // ข้ามหมวดที่มีแต่รหัส ไม่มีชื่อ
      if (!seen.has(c.mainCategoryCode)) seen.set(c.mainCategoryCode, c.mainCategoryName);
    });
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ code, name }));
  }, [categories]);

  // ตัวเลือกแบรนด์ = brandName ที่ไม่ซ้ำจากสินค้า — กรองตามลูกค้าที่เลือกถ้ามี
  // (ถ้าลูกค้านั้นยังไม่มีแบรนด์ในระบบ ให้ fallback เป็นทุกแบรนด์)
  const brandOptions = useMemo(() => {
    const rel = form.customerId ? allProducts.filter((p) => p.customerId === form.customerId) : allProducts;
    const set = new Set(rel.map((p) => (p.brandName || "").trim()).filter(Boolean));
    if (form.customerId && set.size === 0) allProducts.forEach((p) => { if (p.brandName) set.add(p.brandName.trim()); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allProducts, form.customerId]);

  const subCatOptions = useMemo(
    () => categories.filter((c) => c.mainCategoryCode === form.mainCode && c.typeCode && (c.nameTh || c.nameEn || "").trim()), // ข้ามหมวดรองที่ code ว่าง/มีแต่รหัส
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
            <label>รหัสโครงการ</label>
            <input name="code" value={form.code} onChange={change} disabled placeholder={editingId ? "" : (previewCode || "สร้างอัตโนมัติ")} className="premium-input w-full font-mono bg-gray-50 text-[var(--text-3)]" />
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
          <div className="form-group">
            <label>เลขที่ใบเสนอราคา</label>
            <input name="quotationNumber" value={form.quotationNumber} onChange={change} className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>เลขที่ PO <span className="text-[var(--text-3)] font-normal">(ถ้ามี)</span></label>
            <input name="poNumber" value={form.poNumber} onChange={change} className="premium-input w-full" />
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

        <div className="form-group" style={{ marginBottom: "18px" }}>
          <label>แบรนด์ (Brand)</label>
          <SearchableTextSelect
            value={form.brand}
            onChange={(v) => setForm((f) => ({ ...f, brand: v }))}
            options={brandOptions}
            placeholder={form.customerId ? "เลือกหรือค้นหาแบรนด์ของลูกค้า..." : "เลือกหรือค้นหาแบรนด์..."}
          />
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
                  // ผูกได้หลายหมวด (ไม่กรองตามหมวด) — หมวดของโปรเจกต์จะ derive จาก FG เอง
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
              <select value={form.mainCode} onChange={(e) => changeMain(e.target.value)} disabled={fgCategoryLock} className="premium-input w-full">
                <option value="">— ไม่ระบุ —</option>
                {mainCatOptions.map((o) => (
                  <option key={o.code} value={o.code}>{o.code} {o.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>หมวดรอง</label>
              <select value={form.typeCode} onChange={(e) => changeSub(e.target.value)} disabled={fgCategoryLock || !form.mainCode} className="premium-input w-full">
                <option value="">{form.mainCode ? "— เลือกหมวดรอง —" : "เลือกหมวดหลักก่อน"}</option>
                {subCatOptions.map((c) => (
                  <option key={c.id} value={c.typeCode}>{subLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>
          {fgCategoryLock && (
            <div style={{ fontSize: "11px", color: "var(--blue)", marginTop: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
              🔒 หมวดอิงตามสินค้า (FG) ที่ผูกไว้โดยอัตโนมัติ
              {form.productMainCategory === "01-002" && " — มีสินค้าเข้าข่ายสรรพสามิต จึงใช้หมวด 01-002"}
            </div>
          )}
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
                const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div className="form-group">
            <label>ผู้จัดทำ (Account Coordinator)</label>
            <select name="preparedBy" value={form.preparedBy} onChange={change} className="premium-input w-full">
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ac").map((u) => {
                const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div className="form-group">
            <label>ผู้ตรวจสอบ (AE Supervisor)</label>
            <select name="aeSupervisor" value={form.aeSupervisor} onChange={change} className="premium-input w-full">
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ae_supervisor").map((u) => {
                const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
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
