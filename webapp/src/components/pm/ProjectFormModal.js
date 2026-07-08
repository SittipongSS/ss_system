"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/tax/ConfirmModal";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { brandThList } from "@/lib/master/brands";
import { X } from "lucide-react";

export default function ProjectFormModal({
  open, onClose, editingId, initialData, onSuccess,
  customers = [], categories = [], allProducts = [],
  // ปลายทาง POST ตอนสร้างใหม่ (ค่าเริ่มต้น = สร้างโปรเจกต์ PM ปกติ). หน้าบริหารงานขาย
  // ส่ง endpoint ของดีลเข้ามาเพื่อสร้าง + ผูกโครงการเข้าดีลในคราวเดียว.
  createEndpoint = "/api/pm/projects",
  // ข้อความบนปุ่มยืนยันตอนสร้าง (override ได้ เช่น "สร้างโครงการ PM")
  createLabel = "สร้างโปรเจกต์",
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
  const [formError, setFormError] = useState(""); // ข้อความ error แสดงในฟอร์ม (แทน alert)
  const [confirmState, setConfirmState] = useState(null); // ยืนยันแบบ promise (แทน window.confirm)
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const resolveConfirm = (result) => { setConfirmState((s) => { s?.resolve(result); return null; }); };

  useEffect(() => {
    if (!open) return;
    fetch("/api/pm/assignable-users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUsers(d || []))
      .catch(() => {});
  }, [open]);

  // FG picker scope: once a customer is chosen, load THAT customer's FGs (which
  // may have been registered by another team — product.team = creator's team),
  // so cross-team FGs of the same customer are linkable. Before a customer is
  // picked (FG-first flow), fall back to the team-scoped allProducts prop.
  const [customerProducts, setCustomerProducts] = useState(null);
  useEffect(() => {
    if (!open || !form.customerId) { setCustomerProducts(null); return; }
    let cancelled = false;
    fetch(`/api/products?customerId=${encodeURIComponent(form.customerId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setCustomerProducts(d || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, form.customerId]);
  const effectiveProducts = form.customerId && customerProducts ? customerProducts : allProducts;

  useEffect(() => {
    if (open) {
      // initialData ใช้ได้ทั้งตอนแก้ไข (โปรเจกต์เดิม) และตอนสร้างใหม่แบบเติมค่าแนะนำ
      // (เช่น สร้าง PM จากดีล — เติมชื่อ/ลูกค้า/วันเริ่ม/ผู้ดูแลให้ แต่ปรับแก้ได้)
      if (initialData) {
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
      }
    }
  }, [open, editingId, initialData]);

  // ข้อ 1: หมวดสินค้า "อิงตาม FG ที่ผูก" — ถ้ามี FG ที่เป็น 01-002 (สรรพสามิต)
  // แม้แต่ตัวเดียว ทั้งโปรเจกต์ใช้หมวด 01-002 (เป็นใหญ่สุด → ได้ template เสียภาษี);
  // ถ้าไม่มีตัวไหนเป็น 01-002 ใช้หมวดของ FG ตัวแรกเพื่อแสดงผล. ไม่มี FG → ปล่อยให้เลือกเอง
  const fgCategoryLock = form.projectProducts.length > 0;
  useEffect(() => {
    if (!open) return;
    const fgs = form.projectProducts.map((pp) => effectiveProducts.find((p) => p.id === pp.productId)).filter(Boolean);
    if (!fgs.length) return; // ไม่มี FG → คงค่าที่ผู้ใช้เลือกเองไว้
    const code = fgs.some((f) => f.categoryCode === "01-002") ? "01-002" : (fgs[0].categoryCode || "");
    const [mainCode = "", typeCode = ""] = code ? code.split("-") : [];
    if (code === form.productMainCategory && mainCode === form.mainCode && typeCode === form.typeCode) return;
    const sub = categories.find((c) => c.mainCategoryCode === mainCode && c.typeCode === typeCode)?.nameTh || "";
    setForm((f) => ({ ...f, productMainCategory: code, mainCode, typeCode, productSubCategory: sub }));
  }, [open, form.projectProducts, effectiveProducts, categories]);

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
      const firstFg = newProducts[0] ? effectiveProducts.find(p => p.id === newProducts[0].productId) : null;
      if (firstFg && !isSelected) {
        return {
          ...f,
          projectProducts: newProducts,
          customerId: f.customerId || firstFg.customerId || "",
          name: f.name || firstFg.brandNameEn || firstFg.brandName || firstFg.productDescriptionEn || firstFg.productDescription || "",
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
    setFormError("");
    // วันเริ่ม = anchor ของ timeline → บังคับใส่ (โปรเจกต์ย้อนหลังต้องตั้งวันจริงในอดีต)
    if (!form.startDate) { setFormError("กรุณาระบุวันที่เริ่มโปรเจกต์"); return; }
    // ข้อ 2: แจ้งเตือนก่อนปรับขั้นตอน — เมื่อแก้โปรเจกต์เดิมแล้วสถานะสรรพสามิต
    // (01-002) พลิก ระบบจะเพิ่ม/ลบเฉพาะขั้นตอนสรรพสามิต + คำนวณกำหนดการใหม่
    if (editingId) {
      const wasExcise = (initialData?.productMainCategory || "") === "01-002";
      const nowExcise = (form.productMainCategory || "") === "01-002";
      if (wasExcise !== nowExcise) {
        const msg = nowExcise
          ? "หมวดสินค้าเปลี่ยนเป็นสรรพสามิต (01-002) — ระบบจะเพิ่มขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่ (ขั้นตอนที่ทำไปแล้วจะถูกเก็บไว้) ดำเนินการต่อหรือไม่?"
          : "หมวดสินค้าเปลี่ยนออกจากสรรพสามิต — ระบบจะลบขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่ (ขั้นตอนอื่นจะถูกเก็บไว้) ดำเนินการต่อหรือไม่?";
        if (!(await askConfirm({ title: "ยืนยันการปรับขั้นตอนสรรพสามิต", message: msg, confirmLabel: "ดำเนินการต่อ", danger: false }))) return;
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
        editingId ? `/api/pm/projects/${editingId}` : createEndpoint,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (res.ok) {
        // รหัสโครงการสร้างอัตโนมัติฝั่งเซิร์ฟเวอร์ — แจ้งสำเร็จ (toast) จัดการที่ผู้เรียก onSuccess
        onSuccess(data);
      } else {
        setFormError(data.error || (editingId ? "บันทึกไม่สำเร็จ" : "สร้างโปรเจกต์ไม่สำเร็จ"));
      }
    } catch { setFormError("เกิดข้อผิดพลาด"); }
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

  // ตัวเลือกแบรนด์ = แบรนด์ที่ลูกค้า "เป็นเจ้าของ" (customers.brands[]) — master ของแบรนด์.
  // กรองตามลูกค้า "เสมอ": ยังไม่เลือกลูกค้า → ไม่มีแบรนด์ให้เลือก (กันโชว์แบรนด์ข้ามลูกค้า)
  const brandOptions = useMemo(() => {
    const selected = customers.find((c) => c.id === form.customerId);
    return selected ? brandThList(selected.brands || []) : [];
  }, [customers, form.customerId]);

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
        <div className="pm-form-grid gap-[18px]">
          <div className="col-span-2 text-[15px] font-semibold text-[var(--text)] border-b border-[var(--border)] pb-2 mb-2 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[12px]">1</span> ข้อมูลทั่วไป (General Info)
          </div>
          
          {editingId && form.code && (
            <div className="form-group">
              <label>รหัสโครงการ</label>
              <input name="code" value={form.code} disabled className="premium-input w-full font-mono bg-gray-50 text-[var(--text-3)]" />
            </div>
          )}
          <div className={`form-group${editingId && form.code ? "" : " col-span-2"}`}>
            <label>ประเภทงาน</label>
            <Select fullWidth name="type" value={form.type} onChange={change} disabled={!!editingId}>
              <option value="NPD">NPD (สินค้าใหม่)</option>
              <option value="RE-ORDER">RE-ORDER (สั่งซ้ำ)</option>
            </Select>
          </div>
          <div className="form-group col-span-2">
            <label>ชื่อโปรเจกต์ / สินค้า <span className="text-[var(--red)]">*</span></label>
            <input name="name" value={form.name} onChange={change} required className="premium-input w-full" />
          </div>
          <div className="form-group">
            <label>วันที่เริ่มโปรเจกต์ <span className="text-[var(--red)]">*</span></label>
            <input type="date" name="startDate" value={form.startDate} onChange={change} required className="premium-input w-full" title="วันเริ่มเป็นจุดอ้างอิงของ timeline — โปรเจกต์ย้อนหลังให้ใส่วันจริงในอดีต" />
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
            <SearchableSelect
              value={form.customerId}
              onChange={(v) => setForm((f) => ({ ...f, customerId: v }))}
              placeholder="ค้นหารหัส / ชื่อลูกค้า..."
              emptyText="ไม่พบลูกค้า"
              options={customers.map((c) => ({
                value: c.id,
                label: c.arCode ? `${c.arCode} — ${c.name}` : c.name,
                search: `${c.arCode || ""} ${c.name}`,
              }))}
            />
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
          <SearchableSelect
            allowFreeText
            disabled={!form.customerId}
            value={form.brand}
            onChange={(v) => setForm((f) => ({ ...f, brand: v }))}
            options={brandOptions.map((b) => ({ value: b, label: b }))}
            placeholder={form.customerId ? "เลือกหรือค้นหาแบรนด์ของลูกค้า..." : "เลือกลูกค้าก่อน"}
            emptyText="ไม่พบแบรนด์ของลูกค้านี้ (พิมพ์เพื่อเพิ่มใหม่)"
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
                    const p = effectiveProducts.find(x => x.id === pp.productId);
                    if (!p) return null;
                    const cat = categories.find(c => c.mainCategoryCode === p.categoryCode?.split("-")[0] && c.typeCode === p.categoryCode?.split("-")[1]);
                    return (
                      <div key={pp.productId} style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "var(--panel-2)", border: "1px solid var(--border)", padding: "8px 12px", borderRadius: "6px" }}>
                        <div style={{ flex: 1, minWidth: "160px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="font-mono text-[13px] font-semibold">{p.fgCode}</span>
                            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{p.volume ? `(${p.volume} ml)` : ""}</span>
                            <span style={{ fontSize: "11px", background: "var(--blue-soft)", color: "var(--blue)", padding: "2px 6px", borderRadius: "4px" }}>
                              {cat ? cat.nameTh : p.categoryCode || "ไม่มีหมวด"}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-2)" }}>{p.productDescriptionEn || p.productDescription || p.brandNameEn || p.brandName || "-"}</div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", width: "240px", maxWidth: "100%" }}>
                          <input type="text" placeholder="สั่งซื้อ" value={pp.orderQty} onChange={(e) => updateFgQty(pp.productId, "orderQty", e.target.value)} className="premium-input w-full text-[12px] h-[32px]" />
                          <input type="text" placeholder="ผลิต" value={pp.productionQty} onChange={(e) => updateFgQty(pp.productId, "productionQty", e.target.value)} className="premium-input w-full text-[12px] h-[32px]" />
                        </div>
                        <button type="button" className="btn-icon danger" onClick={() => toggleFg(pp.productId)} aria-label="นำสินค้าออก"><X size={16} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <Select fullWidth value="" onChange={(e) => { if(e.target.value) toggleFg(e.target.value); }}>
                <option value="">— เพิ่ม FG —</option>
                {effectiveProducts
                  .filter(pr => !form.projectProducts.some(pp => pp.productId === pr.id))
                  // ผูกได้หลายหมวด (ไม่กรองตามหมวด) — หมวดของโปรเจกต์จะ derive จาก FG เอง
                  .map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.fgCode} — {pr.productDescriptionEn || pr.productDescription || pr.brandNameEn || pr.brandName || ""} {pr.volume ? `(${pr.volume} ml)` : ""}</option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", background: "var(--panel)" }}>
          <div style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 600, marginBottom: "12px" }}>
            หมวดสินค้า <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(หมวดหลัก → หมวดรอง — มีผลต่อขั้นตอนสรรพสามิต)</span>
          </div>
          <div className="pm-form-grid gap-[14px]">
            <div className="form-group">
              <label>หมวดหลัก</label>
              <Select fullWidth value={form.mainCode} onChange={(e) => changeMain(e.target.value)} disabled={fgCategoryLock}>
                <option value="">— ไม่ระบุ —</option>
                {mainCatOptions.map((o) => (
                  <option key={o.code} value={o.code}>{o.code} {o.name}</option>
                ))}
              </Select>
            </div>
            <div className="form-group">
              <label>หมวดรอง</label>
              <Select fullWidth value={form.typeCode} onChange={(e) => changeSub(e.target.value)} disabled={fgCategoryLock || !form.mainCode}>
                <option value="">{form.mainCode ? "— เลือกหมวดรอง —" : "เลือกหมวดหลักก่อน"}</option>
                {subCatOptions.map((c) => (
                  <option key={c.id} value={c.typeCode}>{subLabel(c)}</option>
                ))}
              </Select>
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

        <div className="pm-form-grid gap-[18px]">
          <div className="form-group col-span-2">
            <label>ผู้ดูแล (Account Executive)</label>
            <Select fullWidth name="aeOwner" value={form.aeOwner} onChange={change}>
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ae" || u.role === "senior_ae" || u.role === "ae_supervisor").map((u) => {
                const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </Select>
          </div>
          <div className="form-group">
            <label>ผู้จัดทำ (Account Coordinator)</label>
            <Select fullWidth name="preparedBy" value={form.preparedBy} onChange={change}>
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ac").map((u) => {
                const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </Select>
          </div>
          <div className="form-group">
            <label>ผู้ตรวจสอบ (AE Supervisor)</label>
            <Select fullWidth name="aeSupervisor" value={form.aeSupervisor} onChange={change}>
              <option value="">— ไม่ระบุ —</option>
              {users.filter(u => u.role === "ae_supervisor").map((u) => {
                const name = (u.name || "").trim() || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                return <option key={u.id} value={name}>{name}</option>;
              })}
            </Select>
          </div>
        </div>

        {!editingId && (
          <p className="text-[12px] text-[var(--text-3)] mt-3">
            ระบบจะสร้างขั้นตอนงาน (timeline) อัตโนมัติจากเทมเพลต {form.type} และคำนวณวันทำการให้
          </p>
        )}
        {formError && (
          <p className="text-[13px] text-[var(--red)] mt-4">{formError}</p>
        )}
        <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn">ยกเลิก</button>
          <button type="submit" disabled={submitting} className="btn btn-primary px-8">
            {submitting ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : createLabel}
          </button>
        </div>
      </form>

      <ConfirmModal
        open={!!confirmState}
        onClose={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || "ยืนยัน"}
        danger={confirmState?.danger ?? true}
      />
    </Modal>
  );
}
