"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, Archive, ArchiveRestore, ShoppingCart, FolderKanban } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButtons";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import ProductStatusPill from "@/components/ProductStatusPill";
import OrderStatusPill from "@/components/OrderStatusPill";
import EditProductModal from "@/components/EditProductModal";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { customerDocTypes } from "@/lib/master/attachmentTypes";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { brandThList, brandBoth } from "@/lib/master/brands";
import { fmtMoney, fmtDate } from "@/lib/format";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { DetailCard } from "@/components/ui/DetailPage";
import { categoryOf, categoryFlags } from "@/lib/master/categoryOf";
import { apiCache } from "@/lib/apiCache";

// หน้า detail สินค้า (รื้อจัดหน้า — มติผู้ใช้ 2026-07-19): "ข้อมูลหนึ่งชิ้นมีบ้านหลังเดียว"
//   - แถบหัว = ตัวตน (ชื่อ/FG/แบรนด์/สร้างเมื่อ) + ตัวเลขความสัมพันธ์ (โครงการ/ใบสั่งซื้อ/ภาษี)
//   - คอลัมน์หลักซ้าย = การ์ดรายละเอียดสเปค "พระเอกของหน้า" ตามด้วยต้นทุน/ใบสั่งซื้อ/
//     โครงการ/เอกสาร — ไม่มีแถบ KPI (StatCards) กับแถวการ์ดโครงการ (ContextCard) ที่
//     เคยโชว์ข้อมูลซ้ำ 2-3 รอบอีกแล้ว
//   - rail ขวา = ของประกอบด้านภาษี (breakdown + ทะเบียน) — เฉพาะหมวดสรรพสามิต (ธง isExcise)
export default function ProductDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEditProducts = useCan("products:edit");
  const canDeleteProducts = useCan("products:delete");
  // พักใช้/เปิดใช้อีกครั้งสงวนสิทธิ์ให้ admin + ae_supervisor เท่านั้น — SA
  // (senior_ae/ac/ae) แก้สเปค/ราคาได้ปกติแต่ห้ามพักใช้สินค้าเอง (บังคับที่ server ด้วย).
  const role = useRole();
  const canToggleActive = isSuperuser(role);
  // Factory cost data is confidential to the tax system. Two tiers (mirrors the
  // server-side redaction): costPrice is visible to SA + LG + admin; the cost
  // breakdown + profit is LG + admin only. Other departments see neither.
  const canSeeMargin = useCan("products:margin");
  const canSeeCost = canSeeMargin || canEditProducts; // SA (edit) + LG/admin (margin)
  // Excise tax data (per-unit tax, registrations, breakdown) is confidential to
  // the tax workflow — shown only to roles that can see the tax system
  // (SA/LG/admin via history:view). Other depts (staff/viewer) never see it.
  const canViewTax = useCan("history:view");

  const [product, setProduct] = useState(null);
  // แถวหมวดสินค้า — ใช้ตัดสินธงสรรพสามิต/จดแจ้ง อย. ของหมวด (mig 0131)
  const [productTypes, setProductTypes] = useState(() => apiCache.get("/api/master/product-types") ?? []);
  const [regs, setRegs] = useState([]);
  const [orders, setOrders] = useState([]);     // orders this product appears in (tax-gated)
  const [projects, setProjects] = useState([]); // PM projects this product is in (pm-gated)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [brandOptions, setBrandOptions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null); // { title, message, confirmLabel, danger, onConfirm }

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/master/products/${id}`);
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

  // Cross-module relations (360-view): registrations + orders + projects from one
  // scoped endpoint. Returns [] for relations the user may not see (tax →
  // history:view, projects → pm:view), so no extra client-side gate is needed.
  useEffect(() => {
    if (!id) { setRegs([]); setOrders([]); setProjects([]); return; }
    fetch(`/api/master/products/${id}/relations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRegs(d.registrations || []); setOrders(d.orders || []); setProjects(d.projects || []); } })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (id) fetchProduct();
    // หมวดสินค้า — เอาธง isExcise/requiresFdaNotice มาคุมการ์ดภาษี + ป้าย (mig 0131)
    fetch("/api/master/product-types")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { apiCache.set("/api/master/product-types", d || []); setProductTypes(d || []); })
      .catch(() => {});
    // แบรนด์เป็นของลูกค้า (customers.brands[]) — ใช้เป็นรายการแนะนำตอนแก้แบรนด์สินค้า
    fetch("/api/master/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setCustomers(d || []);
        setBrandOptions(brandThList((d || []).flatMap((c) => c.brands || [])));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Retire / reactivate a product (parity with customers). Retired products drop
  // out of registration/order pickers but keep history; used when a product is
  // discontinued but can't be deleted (still referenced).
  const toggleActive = async () => {
    const next = !(product.isActive !== false);
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/master/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (res.ok) await fetchProduct();
      else setToast({ kind: "error", msg: (await res.json()).error || "ดำเนินการไม่สำเร็จ" });
    } catch {
      setToast({ kind: "error", msg: "เกิดข้อผิดพลาด" });
    }
    setIsUpdating(false);
  };

  const handleToggleActive = () => {
    if (product.isActive !== false) {
      setConfirmBox({
        title: "พักใช้งานสินค้านี้?",
        message: "สินค้าจะหายจากรายการเลือกของระบบอื่น (ประวัติยังอยู่ครบ) — กด “เปิดใช้อีกครั้ง” เพื่อนำกลับมาได้",
        confirmLabel: "พักใช้",
        danger: false,
        onConfirm: toggleActive,
      });
    } else {
      toggleActive();
    }
  };

  const handleDelete = () => setConfirmBox({
    title: "ลบรหัสสินค้านี้?",
    message: "ข้อมูลสินค้าจะถูกลบออกจากระบบและกู้คืนไม่ได้",
    confirmLabel: "ลบสินค้า",
    danger: true,
    onConfirm: async () => {
      setIsUpdating(true);
      try {
        const res = await fetch(`/api/master/products/${id}`, { method: "DELETE" });
        if (res.ok) {
          router.push("/database/products");
        } else {
          const errData = await res.json();
          setToast({ kind: "error", msg: errData.error || "ไม่สามารถลบข้อมูลสินค้าได้" });
        }
      } catch (err) {
        setToast({ kind: "error", msg: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์" });
      }
      setIsUpdating(false);
    },
  });

  if (loading) return <SkeletonRows rows={8} />;

  if (error || !product) {
    return (
      <div className="glass-panel p-12 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">{error || "ไม่พบข้อมูลสินค้านี้"}</h2>
        <Link href="/database/products" className="btn btn-primary inline-flex items-center gap-2 mt-4">
          <ArrowLeft size={16} /> กลับไปฐานข้อมูลสินค้า
        </Link>
      </div>
    );
  }

  const isExempt = product.isExciseTaxable === false;
  // การ์ดฝั่งภาษี (Excise breakdown + ทะเบียน) และต้นทุนโรงงาน คิดเฉพาะหมวดที่ติ๊ก
  // "เสียภาษีสรรพสามิต" (product_types.isExcise, mig 0131 — มติผู้ใช้ 2026-07-19);
  // หมวดอื่นไม่เข้าข่ายสรรพสามิต ไม่โชว์เลย
  const catFlags = categoryFlags(product.categoryCode || categoryOf(product.fgCode), productTypes);
  const isExciseCat = catFlags.isExcise;

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {/* แถวย้อนกลับ + action ระดับ entity (แก้ไข/พัก/ลบ) ตามกติกา Page Header
          — ใช้ปุ่ม router.back() ไม่ใช่ Workspace.back เพราะหน้านี้เข้าได้จากหลายทาง */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "14px" }}>
        <button
          type="button"
          className="btn ghost topbar-back-btn"
          onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/database/products"))}
        >
          <ArrowLeft size={16} /> กลับ
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {canEditProducts && (
            <ActionButton kind="edit" iconOnly label="แก้ไขข้อมูล" title="แก้ไขข้อมูล" disabled={isUpdating} onClick={() => setShowEdit(true)} />
          )}
          {canToggleActive && (
            product.isActive === false
              ? <ActionButton kind="resume" iconOnly icon={ArchiveRestore} label="เปิดใช้อีกครั้ง" title="เปิดใช้อีกครั้ง" disabled={isUpdating} onClick={handleToggleActive} />
              : <ActionButton kind="pause" iconOnly icon={Archive} label="พักใช้" title="พักใช้" disabled={isUpdating} onClick={handleToggleActive} />
          )}
          {canDeleteProducts && (
            <ActionButton kind="delete" iconOnly label="ลบสินค้า" title="ลบสินค้า" disabled={isUpdating} onClick={handleDelete} />
          )}
        </div>
      </div>
      <SalesDetailOverview
        eyebrow={`PRODUCT MASTER · ${product.fgCode || "NO FG CODE"}`}
        title={product.productDescriptionEn || product.productDescription}
        description={<><span>{product.productDescriptionEn && product.productDescription ? product.productDescription : "ไม่มีชื่อภาษาไทย"}</span><span>แบรนด์ {brandBoth(product.brandName, product.brandNameEn) || "-"}</span><span>สร้างเมื่อ {fmtDate(product.createdAt)}</span></>}
        badges={<>
          <SalesStateBadge label={product.isActive === false ? "พักใช้งาน" : "ใช้งานอยู่"} color={product.isActive === false ? "var(--text-3)" : "var(--green)"} />
          {isExciseCat && <SalesStateBadge label="ภาษีสรรพสามิต" color="var(--amber)" />}
          {/* เฟสแรกของ "ต้องจดแจ้ง อย." (มติ 2026-07-20): ป้าย + เตือนตอนสร้าง เท่านั้น */}
          {catFlags.requiresFdaNotice && <SalesStateBadge label="ต้องจดแจ้ง อย." color="var(--blue)" />}
        </>}
        facts={[
          // ตัวเลข "ความสัมพันธ์" เท่านั้น — ฟิลด์ตัวตน (ปริมาตร/ราคา/หมวด) อยู่บ้านเดียว
          // ที่การ์ดสเปคด้านล่าง ไม่โชว์ซ้ำบนแถบหัวอีก
          { icon: FolderKanban, label: "โครงการ", value: `${projects.length} โครงการ` },
          ...(canViewTax ? [{ icon: ShoppingCart, label: "ใบสั่งซื้อ", value: `${orders.length} รายการ` }] : []),
          ...(canViewTax && isExciseCat ? [
            { icon: Package, label: "ทะเบียนภาษี", value: `${regs.length} รายการ` },
            { icon: Package, label: "ภาษี/ชิ้น", value: isExempt ? "ยกเว้น" : fmtMoney((product.exciseTax || 0) + (product.localTax || 0)) },
          ] : []),
        ]}
      />

      {product.isActive === false && (
        <div className="my-[18px] rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style={{ background: "var(--panel-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
          <Archive size={16} className="text-[var(--text-3)]" />
          สินค้านี้ถูกพักใช้งาน — ไม่แสดงในรายการเลือกของระบบอื่น (กด “เปิดใช้อีกครั้ง” เพื่อนำกลับมา)
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[22px] mt-[18px]">
        {/* คอลัมน์หลัก — รายละเอียดสินค้าคือพระเอกของหน้า detail จึงขึ้นการ์ดแรก
            (ไม่มี rail ภาษี — หมวดอื่น/ไม่มีสิทธิ์ — ก็กางเต็มความกว้าง) */}
        <div className={`space-y-6 ${canViewTax && isExciseCat ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <DetailCard icon={Package} eyebrow="Product specification" title="ข้อมูลสเปคสินค้า">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div className="md:col-span-2">
                <span className="text-[var(--text-3)] block mb-1">{CUSTOMER_NAME_LABEL} (เจ้าของสินค้า)</span>
                {product.customerId ? (
                  <Link href={`/database/customers/${product.customerId}`} className="font-semibold text-[var(--accent)] text-sm hover:underline">
                    {product.customerName || product.customerId}
                  </Link>
                ) : (
                  <span className="font-semibold text-[var(--text)] text-sm">{product.customerName || "-"}</span>
                )}
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">รหัสสำเร็จรูป FG Code</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm bg-[var(--panel-2)] px-2 py-0.5 rounded">{product.fgCode}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">แบรนด์ (Brand Name)</span>
                <span className="font-semibold text-[var(--text)] text-sm">{brandBoth(product.brandName, product.brandNameEn)}</span>
              </div>
              {/* ข้อมูลสูตร (0112) — FG ที่ไม่มีสูตร (กล่อง/บรรจุภัณฑ์) โชว์ — ได้ */}
              <div>
                <span className="text-[var(--text-3)] block mb-1">ชื่อสูตร (Formula)</span>
                <span className="font-semibold text-[var(--text)] text-sm">{product.formulaName || "—"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">รหัสสูตร (Formula Code)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.formulaCode || "—"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">วันที่สูตร (Formula Date)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.formulaDate ? fmtDate(product.formulaDate) : "—"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">ปริมาตร/น้ำหนักบรรจุ (Volume/Weight)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.volume} {product.volumeUnit || "ml"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">ชิ้นต่อลัง (Pieces / Case)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.piecesPerCase ? `${Number(product.piecesPerCase).toLocaleString("th-TH")} ชิ้น/ลัง` : "—"}</span>
              </div>
              <div>
                <span className="text-[var(--text-3)] block mb-1">หมวดหมู่ (Category)</span>
                <span className="font-semibold font-mono text-[var(--text)] text-sm">{product.categoryCode || "-"}</span>
              </div>
              {isExciseCat && (
                <div>
                  <span className="text-[var(--text-3)] block mb-1">ราคาขายปลีก (ฐานคำนวณสรรพสามิต)</span>
                  <span className="font-semibold font-mono text-[var(--text)] text-sm">{fmtMoney(product.retailPriceIncVat)}</span>
                </div>
              )}
            </div>
          </DetailCard>

          {/* Cost breakdown — เฉพาะหมวดสรรพสามิต (ธง isExcise — มติ 2026-07-19); สิทธิ์เดิม: SA เห็น
              costPrice, LG + admin เห็น breakdown + กำไร. แผนกอื่นไม่เห็นเลย. */}
          {canSeeCost && isExciseCat && (
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">
              {canSeeMargin ? "โครงสร้างต้นทุนโรงงานและกำไรต่อหน่วย (Cost & Profit Breakdown)" : "ราคาทุนโรงงานต่อหน่วย (Cost Price)"}
            </h3>
            <div className={canSeeMargin ? "grid grid-cols-1 md:grid-cols-2 gap-6 text-xs" : "text-xs"}>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ราคาทุนโรงงาน (Cost Price)</span>
                  <span className="font-bold text-[var(--text)] font-mono">{fmtMoney(product.costPrice)}</span>
                </div>
                {canSeeMargin && (
                  <>
                    <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                      <span>↳ ค่าวัตถุดิบ (65%)</span><span className="font-mono">{fmtMoney(product.materialCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                      <span>↳ ค่าแรงบรรจุ (Labor Cost)</span><span className="font-mono">{fmtMoney(product.laborCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                      <span>↳ ค่าจัดส่งสินค้า (Shipping)</span><span className="font-mono">{fmtMoney(product.shippingCost)}</span>
                    </div>
                  </>
                )}
              </div>
              {canSeeMargin && (
                <div className="flex flex-col justify-between bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)]">
                  <span className="text-[var(--green)] font-semibold block text-[10px] uppercase tracking-wider">กำไรของโรงงานต่อชิ้น (Factory Profit)</span>
                  <div className="text-2xl font-bold font-mono text-[var(--green)] mt-2">{fmtMoney(product.factoryProfit)}</div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Orders this product appears in (information) — tax-gated, read-only. */}
          {canViewTax && (
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
              <ShoppingCart size={16} className="text-[var(--accent)]" /> ใบสั่งซื้อที่มีสินค้านี้ ({orders.length})
            </h3>
            {orders.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] italic">ยังไม่มีใบสั่งซื้อที่อ้างถึงสินค้านี้</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => router.push(`/tax/filings/${o.id}`)}
                    className="clickable-row flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold font-mono text-[var(--text)]">{o.quotationRef || o.id}</span>
                      <span className="text-[var(--text-3)] ml-2">{o.customerName || "-"}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[var(--text-3)]">x{o.productQuantity}</span>
                      <OrderStatusPill status={o.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* PM projects this product is part of — read-only, deep-link to /sa. */}
          {projects.length > 0 && (
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4 flex items-center gap-2">
              <FolderKanban size={16} className="text-[var(--accent)]" /> โครงการที่เกี่ยวข้อง ({projects.length})
            </h3>
            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => router.push(`/sa/projects/${p.id}`)}
                  className="clickable-row flex items-center justify-between text-xs border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--text)]">{p.name || p.code}</span>
                    <span className="text-[var(--text-3)] font-mono ml-2">{p.code}</span>
                  </div>
                  {p.status && <span className="ui-badge shrink-0">{p.status}</span>}
                </div>
              ))}
            </div>
          </div>
          )}

          {/* เอกสารของสินค้า — สัญญาจ้างผลิต / Artwork ฯลฯ */}
          <AttachmentsPanel
            entityType="product"
            entityId={id}
            canEdit={canEditProducts}
            title="เอกสารของสินค้า"
            note="Artwork สินค้า (ใช้ต่อเรื่องขึ้นทะเบียนสรรพสามิต) และเอกสารอื่นๆ — สัญญาจ้างผลิตย้ายไปผูกกับลูกค้าแล้ว"
          />

          {/* เอกสารลูกค้าเจ้าของ (อ่านอย่างเดียว) — เชื่อมโยงผ่าน product.customerId */}
          {product.customerId && (
            <AttachmentsPanel
              entityType="customer"
              entityId={product.customerId}
              canEdit={false}
              docTypes={customerDocTypes(product.customerType)}
              title={`เอกสารลูกค้าเจ้าของ${product.customerName ? ` — ${product.customerName}` : ""}`}
              note="เอกสารของลูกค้าที่เป็นเจ้าของสินค้านี้ (จัดการได้ที่หน้าข้อมูลลูกค้า)"
            />
          )}
        </div>

        {/* rail ขวา: ของประกอบด้านภาษี — เฉพาะหมวดสรรพสามิต (ธง isExcise) + tax-gated */}
        {canViewTax && isExciseCat && (
        <div className="space-y-6">
          <div className="glass-panel p-[20px]">
            <h3 className="font-semibold text-sm text-[var(--text)] border-b border-[var(--border)] pb-3 mb-4">
              ภาษีสรรพสามิตต่อหน่วย (Excise Tax Breakdown)
            </h3>
            {isExempt ? (
              <div className="bg-[var(--green-soft)] p-4 rounded-xl border border-[var(--border)] text-center text-xs">
                <span className="font-bold text-[var(--green)] block text-sm">ได้รับการยกเว้นภาษีสรรพสามิต</span>
                <p className="text-[10px] text-[var(--text-3)] mt-1">สินค้านี้ได้รับยกเว้น ไม่ต้องชำระภาษีสรรพสามิต</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ราคาขายปลีกรวม VAT</span>
                  <span className="font-bold text-[var(--text)] font-mono">{fmtMoney(product.retailPriceIncVat)}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-3)] pl-3">
                  <span>ราคาขายปลีกก่อน VAT (7%)</span><span className="font-mono">{fmtMoney(product.retailPriceExVat)}</span>
                </div>
                <div className="border-t border-dashed border-[var(--border)] my-2 pt-2"></div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ภาษีสรรพสามิต (8%)</span>
                  <span className="font-semibold text-[var(--text)] font-mono">{fmtMoney(product.exciseTax)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-3)]">ภาษีบำรุงท้องถิ่น (10% ของสรรพสามิต)</span>
                  <span className="font-semibold text-[var(--text)] font-mono">{fmtMoney(product.localTax)}</span>
                </div>
                <div className="bg-[var(--red-soft)] p-4 rounded-xl border border-[var(--border)] mt-4">
                  <span className="text-[var(--red)] font-semibold block text-[10px] uppercase tracking-wider">ภาษีรวมต่อชิ้น (Total Tax Rate)</span>
                  <div className="text-2xl font-bold font-mono text-[var(--red)] mt-1">{fmtMoney((product.exciseTax || 0) + (product.localTax || 0))}</div>
                </div>
              </div>
            )}
          </div>

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
                    onClick={() => router.push(`/tax/registrations?open=${r.id}`)}
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
        )}
      </div>

      <EditProductModal open={showEdit} product={product} onClose={() => setShowEdit(false)} onSaved={fetchProduct} brandOptions={brandOptions} customers={customers} />
      <ConfirmModal
        open={!!confirmBox}
        onClose={() => setConfirmBox(null)}
        onConfirm={async () => { await confirmBox?.onConfirm?.(); setConfirmBox(null); }}
        title={confirmBox?.title}
        message={confirmBox?.message}
        confirmLabel={confirmBox?.confirmLabel}
        danger={confirmBox?.danger !== false}
      />
    </>
  );
}
