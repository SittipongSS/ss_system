"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { useCan } from "@/lib/roleContext";
import ProductStatusPill from "@/components/ProductStatusPill";
import ApproveProductModal from "@/components/ApproveProductModal";
import RejectModal from "@/components/RejectModal";

export default function ProductDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canApprove = useCan("legal:approve");
  const canEditProducts = useCan("products:edit");
  const canDeleteProducts = useCan("products:delete");

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/products/${id}`);
      if (res.ok) {
        setProduct(await res.json());
      } else {
        const errData = await res.json();
        setError(errData.error || "ไม่สามารถโหลดข้อมูลสินค้าได้");
      }
    } catch (err) {
      console.error(err);
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) {
      fetchProduct();
    }
  }, [id]);

  const formatMoney = (amount) => {
    if (amount === undefined || amount === null) return "฿0.00";
    return amount.toLocaleString("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    });
  };

  const handleReject = async (reason) => {
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
    });
    if (res.ok) {
      setShowReject(false);
      await fetchProduct();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || "เกิดข้อผิดพลาดในการทำรายการ");
    }
  };

  const handleDelete = async () => {
    if (!confirm("ยืนยันว่าต้องการลบรหัสสินค้านี้ออกจากระบบหรือไม่?")) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        alert("ลบข้อมูลสินค้าเรียบร้อยแล้ว");
        router.push("/products");
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
        <svg
          className="animate-spin h-10 w-10 text-[var(--accent)]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="glass-panel p-12 text-center">
        <svg
          className="w-16 h-16 text-[var(--red)] mx-auto mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">
          {error || "ไม่พบข้อมูลสินค้านี้"}
        </h2>
        <p className="text-[var(--text-3)] mb-6">
          สินค้าที่คุณกำลังพยายามเข้าถึงอาจถูกลบหรือไม่มีอยู่ในระบบ
        </p>
        <Link
          href="/products"
          className="btn btn-primary px-6 inline-flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          กลับไปทะเบียนสินค้า
        </Link>
      </div>
    );
  }

  const isExempt = product.isExciseTaxable === false;

  return (
    <>
      {/* Top Header Section */}
      <button
        type="button"
        onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/products"))}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          color: "var(--text-2)",
          fontSize: "13px",
          fontWeight: 500,
          marginBottom: "14px",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={16} /> กลับ
      </button>
      <div className="premium-header flex justify-between items-center mb-6">
        <div className="header-content">
          <h1 className="flex items-center gap-2 flex-wrap">
            <span className="premium-header-icon">
              <Package size={20} />
            </span>
            {product.productDescription}
            <span className="pill font-mono text-xs">{product.fgCode}</span>
          </h1>
          <p>
            แบรนด์: {product.brandName} | ลูกค้า: {product.customerName}
          </p>
        </div>

        <div className="flex gap-2">
          {canApprove && product.status === "pending_legal" && (
            <>
              <button
                onClick={() => setShowApprove(true)}
                disabled={isUpdating}
                className="btn btn-primary px-6 py-2 text-xs font-semibold flex items-center gap-1.5 rounded-lg"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                อนุมัติขึ้นทะเบียนสินค้า
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={isUpdating}
                className="btn border border-[var(--border)] text-[var(--red)] px-4 py-2 text-xs font-semibold rounded-lg"
              >
                ตีกลับ
              </button>
            </>
          )}
          {canDeleteProducts && (
            <button
              onClick={handleDelete}
              disabled={isUpdating}
              className="btn bg-[var(--red-soft)] text-[var(--red)] hover:bg-[var(--red-soft)] border border-[var(--border)] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 rounded-lg"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
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
              <svg
                className="w-4 h-4 text-[var(--accent)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              ข้อมูลสเปคสินค้า (Product Specs)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div>
                <span className="text-[var(--text-3)] block mb-1">
                  รหัสสำเร็จรูป FG Code
                </span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm bg-[var(--panel-2)] px-2 py-0.5 rounded">
                  {product.fgCode}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">
                  แบรนด์ (Brand Name)
                </span>
                <span className="font-semibold text-[var(--text)] text-sm">
                  {product.brandName}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">
                  ปริมาตร (Volume)
                </span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">
                  {product.volume} ml
                </span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">
                  ผู้จองขึ้นทะเบียน (Assignee)
                </span>
                <span className="font-semibold text-[var(--text)] text-sm">
                  {product.assignee || "-"}
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="text-[var(--text-3)] block mb-1">
                  ลูกค้าเจ้าของสินค้า
                </span>
                <span className="font-semibold text-[var(--text)] text-sm">
                  {product.customerName}
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="text-[var(--text-3)] block mb-1">
                  เลขผู้เสียภาษีลูกค้า
                </span>
                <span className="font-mono text-[var(--text)] ">
                  {product.taxId || "-"}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border)] ">
              <span className="text-[var(--text-3)] block text-[10px] mb-1">
                เอกสารแนบ แผนที่/แบรนด์
              </span>
              {product.mapFileUrl ? (
                <a
                  href={product.mapFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  เปิดเอกสารประกอบการขึ้นทะเบียน
                </a>
              ) : (
                <span className="text-[var(--text-3)] text-xs italic">
                  ไม่ได้อัปโหลดเอกสารแนบ
                </span>
              )}
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-[var(--green)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 14a2 2 0 110-4h4a2 2 0 100 4h-4z"
                />
              </svg>
              โครงสร้างต้นทุนโรงงานและกำไรต่อหน่วย (Cost & Profit Breakdown)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">
                    ราคาทุนโรงงาน (Cost Price)
                  </span>
                  <span className="font-bold text-[var(--text)] font-mono">
                    {formatMoney(product.costPrice)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>↳ ค่าวัตถุดิบ (65%)</span>
                  <span className="font-mono">
                    {formatMoney(product.materialCost)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>↳ ค่าแรงบรรจุ (Labor Cost)</span>
                  <span className="font-mono">
                    {formatMoney(product.laborCost)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>↳ ค่าจัดส่งสินค้า (Shipping)</span>
                  <span className="font-mono">
                    {formatMoney(product.shippingCost)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col justify-between bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)]">
                <div>
                  <span className="text-[var(--green)] font-semibold block text-[10px] uppercase tracking-wider">
                    กำไรของโรงงานต่อชิ้น (Factory Profit)
                  </span>
                  <span className="text-[10px] text-[var(--text-3)] block mt-0.5">
                    คำนวณจาก: ทุนโรงงาน - (วัตถุดิบ + ค่าแรง + ค่าส่ง)
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono text-[var(--green)] mt-2">
                  {formatMoney(product.factoryProfit)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tax Information Column */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="glass-panel p-[20px]">
            <span className="text-[var(--text-3)] text-[10px] block mb-1">
              สถานะขึ้นทะเบียนสินค้า
            </span>
            <div className="mt-1">
              <ProductStatusPill status={product.status} />
              {product.status === "approved" && product.approvalNumber && (
                <div className="mt-2 text-xs font-mono bg-[var(--panel-2)] p-2 rounded border border-[var(--border)]">
                  <span className="text-[var(--text-3)]">เลขที่อนุมัติ: </span>
                  {product.approvalNumber}
                  {product.approvedByName && (
                    <div className="font-sans text-[var(--text-3)] mt-1">
                      โดย {product.approvedByName}
                      {product.approvedAt && ` · ${new Date(product.approvedAt).toLocaleDateString("th-TH")}`}
                    </div>
                  )}
                </div>
              )}
              {product.status === "rejected" && product.rejectionReason && (
                <div className="mt-2 text-xs bg-[var(--red-soft)] p-2 rounded border border-[var(--border)] text-[var(--text-2)]">
                  <span className="text-[var(--red)] font-semibold">เหตุผลที่ตีกลับ: </span>
                  {product.rejectionReason}
                </div>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-3)] mt-2">
              สร้างเมื่อ: {new Date(product.createdAt).toLocaleString("th-TH")}
            </p>
          </div>

          {/* Tax Calculation details */}
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-[var(--red)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                />
              </svg>
              ภาษีสรรพสามิตสรรพากรต่อหน่วย (Excise Tax Breakdown)
            </h3>

            {isExempt ? (
              <div className="bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)] text-center text-xs">
                <svg
                  className="w-10 h-10 text-[var(--green)] mx-auto mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-bold text-[var(--green)] block text-sm">
                  ได้รับการยกเว้นภาษีสรรพสามิต
                </span>
                <p className="text-[10px] text-[var(--text-3)] mt-1">
                  สินค้านี้ไม่เข้าข่ายหมวดหมู่พิกัดอัตราภาษีเครื่องหอม/เครื่องสำอาง
                  (พิกัด 01-002)
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">
                    ราคาขายปลีกรวม VAT
                  </span>
                  <span className="font-bold text-[var(--text)] font-mono">
                    {formatMoney(product.retailPriceIncVat)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>ราคาขายปลีกก่อน VAT (7%)</span>
                  <span className="font-mono">
                    {formatMoney(product.retailPriceExVat)}
                  </span>
                </div>
                <div className="border-t border-dashed border-[var(--border)] my-2 pt-2"></div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">
                    ภาษีสรรพสามิต (Excise Tax 8%)
                  </span>
                  <span className="font-semibold text-[var(--text)] font-mono">
                    {formatMoney(product.exciseTax)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">
                    ภาษีบำรุงท้องถิ่น (Local Tax 10% ของสรรพสามิต)
                  </span>
                  <span className="font-semibold text-[var(--text)] font-mono">
                    {formatMoney(product.localTax)}
                  </span>
                </div>

                <div className="bg-[var(--red-soft)] p-4 rounded-xl border border-[var(--border)] mt-4">
                  <span className="text-[var(--red)] font-semibold block text-[10px] uppercase tracking-wider">
                    ภาษีสรรพสามิตรวมท้องถิ่นต่อชิ้น (Total Tax Rate)
                  </span>
                  <div className="text-2xl font-bold font-mono text-[var(--red)] mt-1">
                    {formatMoney(product.exciseTax + product.localTax)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ApproveProductModal
        open={showApprove}
        product={product}
        onClose={() => setShowApprove(false)}
        onApproved={fetchProduct}
      />
      <RejectModal
        open={showReject}
        onClose={() => setShowReject(false)}
        onConfirm={handleReject}
        title="ตีกลับสินค้าให้แก้ไข"
        entityLabel="สินค้านี้"
      />
    </>
  );
}
