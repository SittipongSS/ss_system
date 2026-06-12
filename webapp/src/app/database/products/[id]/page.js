"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Pencil } from "lucide-react";
import { useCan } from "@/lib/roleContext";
import ProductStatusPill from "@/components/ProductStatusPill";
import EditProductModal from "@/components/EditProductModal";

export default function ProductDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEditProducts = useCan("products:edit");
  const canDeleteProducts = useCan("products:delete");

  const [product, setProduct] = useState(null);
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [brandOptions, setBrandOptions] = useState([]);

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/products/${id}`);
      if (res.ok) {
        setProduct(await res.json());
      } else {
        const errData = await res.json();
        setError(errData.error || "ไม่สามารถโหลดข้อมูลสินค้าได้");
      }
      // Registrations this product appears in (which customers it's registered for).
      const rr = await fetch(`/api/excise-registrations`);
      if (rr.ok) {
        const all = await rr.json();
        setRegs((all || []).filter((r) => r.productId === id));
      }
    } catch (err) {
      console.error(err);
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) fetchProduct();
    // แบรนด์เป็นของลูกค้า (customers.brands[]) — ใช้เป็นรายการแนะนำตอนแก้แบรนด์สินค้า
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBrandOptions([...new Set((d || []).flatMap((c) => c.brands || []).map((b) => (b || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const formatMoney = (amount) => {
    if (amount === undefined || amount === null) return "฿0.00";
    return amount.toLocaleString("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 });
  };

  const handleDelete = async () => {
    if (!confirm("ยืนยันว่าต้องการลบรหัสสินค้านี้ออกจากระบบหรือไม่?")) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        alert("ลบข้อมูลสินค้าเรียบร้อยแล้ว");
        router.push("/database/products");
      } else {
        const errData = await res.json();
        alert(errData.error || "ไม่สามารถลบข้อมูลสินค้าได้");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
    setIsUpdating(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-24">
        <svg className="animate-spin h-10 w-10 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="glass-panel p-12 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{error || "ไม่พบข้อมูลสินค้านี้"}</h2>
        <Link href="/database/products" className="btn btn-primary px-6 inline-flex items-center gap-2 mt-4">
          <ArrowLeft size={16} /> กลับไปฐานข้อมูลสินค้า
        </Link>
      </div>
    );
  }

  const isExempt = product.isExciseTaxable === false;

  return (
    <>
      <button
        type="button"
        onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/database/products"))}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--text-2)", fontSize: "13px", fontWeight: 500, marginBottom: "14px", background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        <ArrowLeft size={16} /> กลับ
      </button>
      <div className="premium-header flex justify-between items-center mb-6">
        <div className="header-content">
          <h1 className="flex items-center gap-2 flex-wrap">
            <span className="premium-header-icon"><Package size={20} /></span>
            {product.productDescription}
            <span className="pill font-mono text-xs">{product.fgCode}</span>
          </h1>
          <p>แบรนด์: {product.brandName}</p>
        </div>

        <div className="flex gap-2">
          {canEditProducts && (
            <button onClick={() => setShowEdit(true)} disabled={isUpdating} className="btn px-5 py-2 text-xs font-semibold flex items-center gap-1.5 rounded-lg border border-[var(--border)] text-[var(--text-2)]">
              <Pencil size={14} /> แก้ไขข้อมูล
            </button>
          )}
          {canDeleteProducts && (
            <button onClick={handleDelete} disabled={isUpdating} className="btn bg-[var(--red-soft)] text-[var(--red)] border border-[var(--border)] px-4 py-2 text-xs font-semibold rounded-lg">
              ลบสินค้า
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[22px]">
        {/* Product Profile */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
              <Package size={16} className="text-[var(--accent)]" /> ข้อมูลสเปคสินค้า (Product Specs)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-[var(--text-3)] block mb-1">รหัสสำเร็จรูป FG Code</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm bg-[var(--panel-2)] px-2 py-0.5 rounded">{product.fgCode}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">แบรนด์ (Brand Name)</span>
                <span className="font-semibold text-[var(--text)] text-sm">{product.brandName}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">ปริมาตร/น้ำหนักบรรจุ (Volume/Weight)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.volume} {product.volumeUnit || "ml"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">หมวดหมู่ (Category)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.categoryCode || "-"}</span>
              </div>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">
              โครงสร้างต้นทุนโรงงานและกำไรต่อหน่วย (Cost &amp; Profit Breakdown)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ราคาทุนโรงงาน (Cost Price)</span>
                  <span className="font-bold text-[var(--text)] font-mono">{formatMoney(product.costPrice)}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>↳ ค่าวัตถุดิบ (65%)</span><span className="font-mono">{formatMoney(product.materialCost)}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>↳ ค่าแรงบรรจุ (Labor Cost)</span><span className="font-mono">{formatMoney(product.laborCost)}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>↳ ค่าจัดส่งสินค้า (Shipping)</span><span className="font-mono">{formatMoney(product.shippingCost)}</span>
                </div>
              </div>
              <div className="flex flex-col justify-between bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)]">
                <span className="text-[var(--green)] font-semibold block text-[10px] uppercase tracking-wider">กำไรของโรงงานต่อชิ้น (Factory Profit)</span>
                <div className="text-2xl font-bold font-mono text-[var(--green)] mt-2">{formatMoney(product.factoryProfit)}</div>
              </div>
            </div>
          </div>

          {/* Excise registrations for this product (information). */}
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">
              การขึ้นทะเบียนภาษีของสินค้านี้ ({regs.length})
            </h3>
            {regs.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] italic">ยังไม่มีการขึ้นทะเบียนภาษีให้ลูกค้ารายใด — ยื่นได้ที่เมนู “ยื่นขึ้นทะเบียนสินค้า”</p>
            ) : (
              <div className="space-y-2">
                {regs.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => (window.location.href = `/tax/register/${r.id}`)}
                    className="clickable-row flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer"
                  >
                    <span className="font-medium text-[var(--text-2)]">{r.customerName || "-"}</span>
                    <div className="flex items-center gap-3">
                      {r.approvalNumber && <span className="font-mono text-[var(--text-3)]">{r.approvalNumber}</span>}
                      <ProductStatusPill status={r.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tax Information Column */}
        <div className="space-y-6">
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">
              ภาษีสรรพสามิตต่อหน่วย (Excise Tax Breakdown)
            </h3>
            {isExempt ? (
              <div className="bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)] text-center text-xs">
                <span className="font-bold text-[var(--green)] block text-sm">ได้รับการยกเว้นภาษีสรรพสามิต</span>
                <p className="text-[10px] text-[var(--text-3)] mt-1">สินค้านี้ไม่เข้าข่ายพิกัด 01-002</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ราคาขายปลีกรวม VAT</span>
                  <span className="font-bold text-[var(--text)] font-mono">{formatMoney(product.retailPriceIncVat)}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>ราคาขายปลีกก่อน VAT (7%)</span><span className="font-mono">{formatMoney(product.retailPriceExVat)}</span>
                </div>
                <div className="border-t border-dashed border-[var(--border)] my-2 pt-2"></div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ภาษีสรรพสามิต (8%)</span>
                  <span className="font-semibold text-[var(--text)] font-mono">{formatMoney(product.exciseTax)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ภาษีบำรุงท้องถิ่น (10% ของสรรพสามิต)</span>
                  <span className="font-semibold text-[var(--text)] font-mono">{formatMoney(product.localTax)}</span>
                </div>
                <div className="bg-[var(--red-soft)] p-4 rounded-xl border border-[var(--border)] mt-4">
                  <span className="text-[var(--red)] font-semibold block text-[10px] uppercase tracking-wider">ภาษีรวมต่อชิ้น (Total Tax Rate)</span>
                  <div className="text-2xl font-bold font-mono text-[var(--red)] mt-1">{formatMoney((product.exciseTax || 0) + (product.localTax || 0))}</div>
                </div>
              </div>
            )}
            <p className="text-[10px] text-[var(--text-3)] mt-3">สร้างเมื่อ: {new Date(product.createdAt).toLocaleString("th-TH")}</p>
          </div>
        </div>
      </div>

      <EditProductModal open={showEdit} product={product} onClose={() => setShowEdit(false)} onSaved={fetchProduct} brandOptions={brandOptions} />
    </>
  );
}
