"use client";
import { useState, useEffect, useMemo } from "react";
import { Package, Plus, Search, Filter, LayoutGrid, Table2, ChevronRight } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { canApproveMasterData, isSuperuser } from "@/lib/permissions";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import ProductForm, { EMPTY_PRODUCT } from "@/components/database/ProductForm";
import Workspace from "@/components/ui/Workspace";
import StatCards from "@/components/database/StatCards";
import ApprovalQueue from "@/components/database/ApprovalQueue";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";
import { ApprovalBadge, ApprovalActions, approvalStatusOf } from "@/components/ApprovalStatus";
import { categoryOf, isExciseCategory, categoryInfo } from "@/lib/master/categoryOf";
import { brandBoth, normalizeBrands } from "@/lib/master/brands";
import { productNameBoth, fmtMoney } from "@/lib/format";

// Management view sees every status; the default GET (used by registration / PM
// pickers) returns only approved products.
const MANAGE_KEY = "/api/master/products?manage=1";

// Master product catalog. Every FG is created here owned by a customer
// (chosen in the form). Excise approval still happens later in the excise
// registration flow (/excise).
export default function ProductRegistry() {
  const canEdit = useCan("products:edit");
  const canMargin = useCan("products:margin");
  const role = useRole();
  const myTeam = useTeam();
  // ราคาโรงงานเป็นข้อมูลลับ — โชว์เฉพาะ SA (products:edit) + LG/admin หรือผู้ที่ได้รับสิทธิ์
  // products:margin (เช่น SA ที่ทำรายงานผู้บริหาร). ใช้ useCan เพื่อให้ตรงกับ redactProductMargin
  // ฝั่ง server (รวม per-user grant) — ฟิลด์ costPrice จะไม่ถูกส่งมาเลยถ้าไม่มีสิทธิ์.
  const canSeeCost = canEdit || canMargin;
  // Senior AE approves only own team; supervisor/admin any team. (Products GET is
  // already team-scoped, but the explicit check keeps the rule consistent.)
  const canApproveRow = (rec) =>
    canApproveMasterData(role) && (isSuperuser(role) || rec?.team === myTeam);
  const [products, setProducts] = useState(() => apiCache.get(MANAGE_KEY) ?? []);
  const [productTypes, setProductTypes] = useState(() => apiCache.get("/api/master/product-types") ?? []);
  const [customers, setCustomers] = useState(() => apiCache.get("/api/master/customers") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has(MANAGE_KEY));
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });

  const emptyForm = EMPTY_PRODUCT;
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [userName, setUserName] = useState("");
  const [search, setSearch] = useState("");

  const fetchProducts = async () => {
    try {
      const res = await fetch(MANAGE_KEY);
      if (res.ok) {
        const data = await res.json();
        apiCache.set(MANAGE_KEY, data);
        setProducts(data);
      }
      const typeRes = await fetch("/api/master/product-types");
      if (typeRes.ok) {
        const typeData = await typeRes.json();
        apiCache.set("/api/master/product-types", typeData);
        setProductTypes(typeData);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Approve / reject a pending product (AE Supervisor only — enforced server-side too).
  const decide = async (id, status) => {
    let rejectionReason = null;
    if (status === "rejected") {
      rejectionReason = window.prompt("เหตุผลที่ไม่อนุมัติ (ใส่หรือเว้นว่างก็ได้):", "");
      if (rejectionReason === null) return; // ยกเลิก
    }
    try {
      const res = await fetch(`/api/master/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: status, rejectionReason }),
      });
      if (res.ok) fetchProducts();
      else alert((await res.json()).error || "ดำเนินการไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาดในการอนุมัติ");
    }
  };

  const getCategoryInfo = (fgCode) => categoryInfo(fgCode, productTypes);

  // Main category (เช่น ODM) + sub-category name for the list — prefers the
  // stored categoryCode (set on save), falls back to deriving it from fgCode
  // for legacy rows saved before that column existed.
  const categoryLabelOf = (p) => {
    const code = p.categoryCode || categoryOf(p.fgCode);
    if (!code) return null;
    const info = productTypes.find(t => `${t.mainCategoryCode}-${t.typeCode}` === code);
    if (!info) return null;
    return { main: info.mainCategoryName, sub: info.nameTh || info.nameEn || code };
  };

  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    fetchProducts();
    // แบรนด์เป็นของลูกค้า (customers.brands[]) — ดึงมาเป็นรายการแนะนำของช่องแบรนด์
    fetch("/api/master/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { apiCache.set("/api/master/customers", d || []); setCustomers(d || []); })
      .catch(() => {});
  }, []);

  // FG ผูกกับลูกค้าเสมอ — เลือกลูกค้าก่อน แล้วแบรนด์ที่แนะนำมาจาก brands[] ของลูกค้านั้น
  // (ยังพิมพ์แบรนด์ใหม่ได้ เผื่อแบรนด์ยังไม่ถูกบันทึกในข้อมูลลูกค้า)
  const customerList = useMemo(
    () => [...customers].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [customers],
  );
  const selectedCustomer = useMemo(
    () => customers.find((x) => x.id === formData.customerId),
    [customers, formData.customerId],
  );
  // แบรนด์ = ช่องเดียว โชว์สองภาษา (EN · TH). value ที่เก็บภายใน = TH (คีย์) ถ้ามี ไม่งั้น EN.
  const brandOptions = useMemo(() => normalizeBrands(selectedCustomer?.brands || []), [selectedCustomer]);





  const openForm = () => {
    setFormData(emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // customerId/brandName ใช้ SearchableSelect (ไม่ใช่ native input) — ตรวจ required เองที่นี่
    if (!formData.customerId) { alert("กรุณาเลือกลูกค้าเจ้าของสินค้า"); return; }
    if (!formData.brandName?.trim() && !formData.brandNameEn?.trim()) { alert("กรุณาระบุชื่อแบรนด์"); return; }
    // ชื่อสินค้าไม่บังคับภาษาไทย แต่ต้องมีอย่างน้อย 1 ภาษา
    if (!formData.productDescription?.trim() && !formData.productDescriptionEn?.trim()) {
      alert("กรุณากรอกชื่อสินค้าอย่างน้อย 1 ภาษา (ไทยหรืออังกฤษ)"); return;
    }
    if (!isExciseCategory(categoryOf(formData.fgCode))) {
      if (
        !confirm(
          "⚠️ แจ้งเตือน:\nรหัสสินค้า (FG) ไม่ได้อยู่ในหมวด 01-002 (น้ำหอมฉีดผิวกาย)\n\nระบบจะตีความว่าสินค้านี้ 'ไม่ต้องเสียภาษีสรรพสามิต'\nต้องการบันทึกต่อหรือไม่?",
        )
      )
        return;
    }
    setSubmitting(true);
    const payload = {
      ...formData,
      assignee: userName,
      volume: parseFloat(formData.volume),
      volumeUnit: formData.volumeUnit || "ml",
      costPrice: formData.costPrice === "" ? null : parseFloat(formData.costPrice),
      retailPriceIncVat: formData.retailPriceIncVat === "" ? null : parseFloat(formData.retailPriceIncVat),
    };
    try {
      const res = await fetch("/api/master/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setShowForm(false);
        await fetchProducts();
        if (created?.approvalStatus === "pending") {
          alert("บันทึกแล้ว — รอ Senior AE ขึ้นไปอนุมัติก่อนจึงจะนำสินค้านี้ไปใช้งานได้");
        }
      } else {
        const err = await res.json();
        alert(err.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch (err) {
      alert("Error submitting form");
    } finally {
      setSubmitting(false);
    }
  };

  const q = search.trim().toLowerCase();
  const counts = {
    pending: products.filter((p) => approvalStatusOf(p) === "pending").length,
    approved: products.filter((p) => approvalStatusOf(p) === "approved").length,
    taxable: products.filter((p) => p.isExciseTaxable !== false).length,
    inactive: products.filter((p) => p.isActive === false).length,
  };
  const filteredProducts = products.filter((p) => {
    if (!showInactive && p.isActive === false) return false;
    if (statusFilter !== "all" && approvalStatusOf(p) !== statusFilter) return false;
    if (!q) return true;
    return [p.fgCode, p.productDescription, p.productDescriptionEn, p.brandName, p.brandNameEn].some((v) => (v || "").toLowerCase().includes(q));
  });

  // Pending records this user may approve — surfaced at the top as a queue.
  const approvalQueue = products.filter(
    (p) => approvalStatusOf(p) === "pending" && canApproveRow(p),
  );

  // Default ordering: by product code (FG Code). The first column shows both the
  // description and the FG code, so it sorts by code to match the "(FG Code)" header.
  const sort = useSortableTable(filteredProducts, {
    product: (p) => p.fgCode || p.productDescription || "",
    category: (p) => { const c = categoryLabelOf(p); return c ? `${c.main} ${c.sub}` : ""; },
    brand: (p) => p.brandName || "",
    volume: (p) => p.volume ?? null,
    cost: (p) => p.costPrice ?? null,
    retail: (p) => p.retailPriceIncVat ?? null,
    tax: (p) => (p.isExciseTaxable === false ? 0 : (p.exciseTax || 0) + (p.localTax || 0)),
  }, { key: "product", dir: "asc" });

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sort.sorted, {
      resetKey: `${q}|${statusFilter}|${showInactive}|${sort.sortKey}|${sort.sortDir}`,
    });

  const open = (p) => (window.location.href = `/database/products/${p.id}`);
  const taxPerUnit = (p) => (p.isExciseTaxable === false ? 0 : (p.exciseTax || 0) + (p.localTax || 0));

  const headerRight = (
    <>
      <span className="ui-badge">{products.length} รายการ</span>
      {canEdit && (
        <button onClick={openForm} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={16} /> เพิ่มสินค้า
        </button>
      )}
    </>
  );

  const toolbar = (
    <div className="toolbar">
      <div className="search-glass" style={{ width: "240px" }}>
        <Search size={18} color="var(--text-3)" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาสินค้า / FG / แบรนด์..." />
      </div>
      <div className="spacer" />
      <span className="toolbar-label"><Filter size={14} /> กรอง</span>
      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" style={{ width: "auto" }}>
        <option value="all">ทุกสถานะ</option>
        <option value="pending">รออนุมัติ</option>
        <option value="approved">อนุมัติแล้ว</option>
        <option value="rejected">ไม่อนุมัติ</option>
      </Select>
      {counts.inactive > 0 && (
        <button type="button" onClick={() => setShowInactive((v) => !v)} className={`btn ${showInactive ? "btn-primary" : ""}`} title="แสดง/ซ่อนสินค้าที่เลิกใช้">
          {showInactive ? "ซ่อนที่เลิกใช้" : `แสดงที่เลิกใช้ (${counts.inactive})`}
        </button>
      )}
      <div className="segmented">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} title="ตาราง"><Table2 size={15} /></button>
        <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="การ์ด"><LayoutGrid size={15} /></button>
      </div>
    </div>
  );

  return (
    <Workspace
      icon={<Package size={22} />}
      title="ข้อมูลสินค้า"
      subtitle="ฐานข้อมูลสินค้ากลาง (Master Data) — รหัส FG สเปค และต้นทุน/ภาษีต่อหน่วย"
      headerRight={headerRight}
      loading={loading}
      rail={
        <>
          <StatCards
            items={[
              { label: "ทั้งหมด", value: products.length },
              { label: "รออนุมัติ", value: counts.pending, tone: counts.pending ? "warn" : undefined },
              { label: "อนุมัติแล้ว", value: counts.approved, tone: "success" },
              { label: "ต้องเสียภาษี", value: counts.taxable, tone: "accent" },
            ]}
          />
          <ApprovalQueue
            items={approvalQueue}
            onDecide={decide}
            primary={(p) => p.fgCode}
            secondary={(p) => { const b = brandBoth(p.brandName, p.brandNameEn); return `${productNameBoth(p)}${b ? ` · ${b}` : ""}`; }}
            onOpen={open}
          />
        </>
      }
      toolbar={toolbar}
    >
      {sort.sorted.length === 0 ? (
        <div className="glass-panel p-10 text-center text-[var(--text-3)]">
          {q || statusFilter !== "all" ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้าในระบบ"}
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pageRows.map((p) => {
            const isExempt = p.isExciseTaxable === false;
            const status = approvalStatusOf(p);
            const showActions = status === "pending" && canApproveRow(p);
            const inactive = p.isActive === false;
            const cat = categoryLabelOf(p);
            return (
              <div key={p.id} onClick={() => open(p)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2" style={inactive ? { opacity: 0.6 } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text)] text-sm truncate">{productNameBoth(p)}</div>
                    <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">{p.fgCode}</div>
                    {cat && <div className="text-[10px] text-[var(--text-3)] mt-0.5 truncate">{cat.main} · {cat.sub}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ApprovalBadge status={status} />
                    {inactive && <span className="status-pill" style={{ background: "var(--panel-2)", color: "var(--text-3)" }}>เลิกใช้</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-2)] truncate">{brandBoth(p.brandName, p.brandNameEn) || "-"}</span>
                  <span className="font-mono text-[var(--text-2)]">{p.volume} {p.volumeUnit || "ml"}</span>
                </div>
                {canSeeCost && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-3)]">ราคาโรงงาน</span>
                    <span className="font-mono text-[var(--text-2)]">{fmtMoney(p.costPrice)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-3)]">ราคาขายปลีก</span>
                  <div className="text-right">
                    <div className="font-mono text-[var(--text-2)]">{fmtMoney(p.retailPriceIncVat)}</div>
                    {isExempt ? (
                      <div className="mt-0.5"><span className="status-pill success text-[10px]">ยกเว้นภาษี</span></div>
                    ) : taxPerUnit(p) > 0 && (
                      <div className="text-[10px] text-[var(--text-3)]">ภาษี/ชิ้น: {fmtMoney(taxPerUnit(p))}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end pt-2 border-t border-[var(--border)]">
                  {showActions ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <ApprovalActions onDecide={(s) => decide(p.id, s)} />
                    </div>
                  ) : <ChevronRight size={16} className="text-[var(--text-3)]" />}
                </div>
                {status === "rejected" && p.rejectionReason && (
                  <div className="text-[11px] text-[var(--text-3)] whitespace-normal">เหตุผล: {p.rejectionReason}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel">
          <div className="premium-table-wrapper border-none">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="รายละเอียดสินค้า (FG Code)" sortKey="product" sort={sort} />
                  <SortTh label="หมวดหมู่" sortKey="category" sort={sort} />
                  <SortTh label="แบรนด์" sortKey="brand" sort={sort} />
                  <SortTh label="ปริมาตร" sortKey="volume" sort={sort} className="num" />
                  {canSeeCost && <SortTh label="ราคาโรงงาน" sortKey="cost" sort={sort} className="num" />}
                  <SortTh label="ราคาขายปลีก" sortKey="retail" sort={sort} className="num" />
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const isExempt = p.isExciseTaxable === false;
                  const taxRate = isExempt ? 0 : (p.exciseTax || 0) + (p.localTax || 0);
                  const cat = categoryLabelOf(p);
                  return (
                    <tr key={p.id} onClick={() => open(p)} className="clickable-row" style={p.isActive === false ? { opacity: 0.55 } : undefined}>
                      <td>
                        <div className="font-semibold text-[var(--text)]">{productNameBoth(p)}</div>
                        <div className="text-[11px] text-[var(--text-3)] mt-1 font-mono">{p.fgCode}</div>
                      </td>
                      <td>
                        {cat ? (
                          <div className="text-xs leading-tight">
                            <div className="text-[var(--text-3)]">{cat.main}</div>
                            <div className="text-[var(--text-2)]">{cat.sub}</div>
                          </div>
                        ) : <span className="text-[var(--text-3)]">-</span>}
                      </td>
                      <td className="text-[var(--text-2)]">{brandBoth(p.brandName, p.brandNameEn) || "-"}</td>
                      <td className="num font-mono text-[var(--text-2)]">{p.volume} {p.volumeUnit || "ml"}</td>
                      {canSeeCost && <td className="num mono text-[var(--text-2)]">{fmtMoney(p.costPrice)}</td>}
                      <td className="num mono text-[var(--text-2)]">
                        {fmtMoney(p.retailPriceIncVat)}
                        {isExempt ? (
                          <div className="mt-0.5"><span className="status-pill success text-[10px]">ยกเว้นภาษี</span></div>
                        ) : taxRate > 0 && (
                          <div className="text-[11px] text-[var(--text-3)] font-normal mt-0.5">ภาษี/ชิ้น: {fmtMoney(taxRate)}</div>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {approvalStatusOf(p) === "pending" && canApproveRow(p) ? (
                          <ApprovalActions onDecide={(status) => decide(p.id, status)} />
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            <ApprovalBadge status={approvalStatusOf(p)} />
                            {p.isActive === false && <span className="status-pill" style={{ background: "var(--panel-2)", color: "var(--text-3)" }}>เลิกใช้</span>}
                            {approvalStatusOf(p) === "rejected" && p.rejectionReason && (
                              <div className="text-[11px] text-[var(--text-3)] mt-1 max-w-[200px] whitespace-normal">เหตุผล: {p.rejectionReason}</div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sort.sorted.length > 0 && (
        <Pager
          page={page}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          pageSize={pageSize}
          onPageSize={setPageSize}
        />
      )}

      {/* Add product modal — FG always belongs to a customer (selected below). */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="เพิ่มสินค้าใหม่ (New Product)" size="lg">
        <form onSubmit={handleSubmit}>
          {/* ฟอร์มเดียวกับโมดัลแก้ไข (EditProductModal) — กฎ: แก้ = ฟอร์มเดียวกับสร้าง */}
          <ProductForm
            form={formData}
            onForm={(patch) => setFormData((f) => ({ ...f, ...patch }))}
            productTypes={productTypes}
            customers={customerList}
            brandOptions={brandOptions}
            creatorName={userName}
            onCustomerChange={(v) => setFormData((f) => ({ ...f, customerId: v, brandName: "", brandNameEn: "" }))}
          />
          <div className="form-action-bar">
            <button type="button" onClick={() => setShowForm(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={submitting} className="btn btn-primary px-8">
              {submitting ? "กำลังบันทึก..." : "บันทึกสินค้า"}
            </button>
          </div>
        </form>
      </Modal>
    </Workspace>
  );
}
