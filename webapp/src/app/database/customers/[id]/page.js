"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Boxes, ShoppingCart, Archive, ArchiveRestore, FolderKanban } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButtons";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser, TEAM_LABELS } from "@/lib/permissions";
import { useIsPortrait } from "@/lib/useResponsiveView";
import Modal from "@/components/Modal";
import CustomerForm, { EMPTY_CUSTOMER, customerToForm } from "@/components/database/CustomerForm";
import OrderDetailModal from "@/components/OrderDetailModal";
import ProductStatusPill from "@/components/ProductStatusPill";
import OrderStatusPill from "@/components/OrderStatusPill";
import StatusBadge from "@/components/excise/StatusBadge";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import StatCards from "@/components/database/StatCards";
import { brandBothOf, brandBoth } from "@/lib/master/brands";
import { fmtPhone, fmtNationalId, productNameBoth, fmtMoney, fmtDate } from "@/lib/format";
import { customerDocTypes } from "@/lib/master/attachmentTypes";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { ContextCard, ContextGrid, DetailCard } from "@/components/ui/DetailPage";

export default function CustomerDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const canEdit = useCan("customers:edit");
  const canDelete = useCan("customers:delete");
  // Excise tax data (rollups, orders/filings, per-item tax) is confidential to
  // the tax workflow — shown only to roles allowed to see the tax system.
  const canViewTax = useCan("history:view");
  const superuser = isSuperuser(useRole());
  const isPortrait = useIsPortrait();

  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [regs, setRegs] = useState([]); // excise registrations for this customer (tax-gated)
  const [projects, setProjects] = useState([]); // PM projects for this customer (pm-gated)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_CUSTOMER);

  // Table Tabs
  const [activeTab, setActiveTab] = useState("products");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchCustomerData = async () => {
    try {
      const res = await fetch(`/api/master/customers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer);
        setProducts(data.products || []);
        setOrders(data.orders || []);

        // Populate edit form (fallback ข้อมูลยุคเก่าอยู่ใน customerToForm)
        setFormData(customerToForm(data.customer));
      } else {
        const errData = await res.json();
        setError(errData.error || "ไม่สามารถโหลดข้อมูลลูกค้าได้");
      }
    } catch (err) {
      console.error(err);
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) {
      fetchCustomerData();
    }
  }, [id]);

  // Cross-module relations (360-view): registrations + projects from one scoped
  // endpoint instead of fetching every registration and filtering client-side.
  // The endpoint returns [] for relations the user may not see (tax → history:view,
  // projects → pm:view), so no extra client-side capability gate is needed here.
  useEffect(() => {
    if (!id) { setRegs([]); setProjects([]); return; }
    fetch(`/api/master/customers/${id}/relations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setRegs(d.registrations || []); setProjects(d.projects || []); } })
      .catch(() => {});
  }, [id]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // แผนที่/เอกสารย้ายไปจัดการที่ส่วน "เอกสารของลูกค้า" (attachments) แล้ว.
    const payload = {
      arCode: formData.arCode,
      name: formData.name,
      customerType: formData.customerType || "company",
      teams: formData.teams,
      taxId: formData.taxId,
      branchCode: formData.branchCode || "00000",
      phone: formData.phone,
      address: formData.address,
      shippingAddress: formData.shippingAddress || null,
      brands: formData.brands || [], // [{th,en}] — API normalize อีกชั้น (0059)
      contacts: formData.contacts || [],
      creditTerms: formData.creditTerms || null,
    };

    try {
      const res = await fetch(`/api/master/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsEditing(false);
        await fetchCustomerData();
      } else {
        const errData = await res.json();
        alert(errData.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
    setIsSubmitting(false);
  };

  // Retire / reactivate a customer. Retired (isActive=false) customers drop out
  // of every downstream picker but keep their history — used when a customer
  // stops ordering but can't be deleted (still referenced by orders/projects).
  const handleToggleActive = async () => {
    const next = !(customer.isActive !== false);
    if (!next && !confirm("พักใช้งานลูกค้ารายนี้? จะหายจากรายการเลือกของระบบอื่น (ประวัติยังอยู่ครบ)")) return;
    try {
      const res = await fetch(`/api/master/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (res.ok) await fetchCustomerData();
      else alert((await res.json()).error || "ดำเนินการไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "ยืนยันว่าต้องการลบข้อมูลลูกค้ารายนี้ออกจากระบบหรือไม่? การลบนี้ไม่สามารถกู้คืนได้",
      )
    )
      return;

    try {
      const res = await fetch(`/api/master/customers/${id}`, { method: "DELETE" });
      if (res.ok) {
        alert("ลบข้อมูลลูกค้าเรียบร้อยแล้ว");
        router.push("/database/customers");
      } else {
        const errData = await res.json();
        alert(errData.error || "ไม่สามารถลบข้อมูลได้");
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการลบข้อมูล");
    }
  };

  // Calculations for Stats. The order rollup totals already exclude exempt
  // items (their per-item tax is 0), so we can sum them directly.
  const totalExciseTax = orders.reduce((sum, o) => sum + (o.totalExciseTax || 0), 0);
  const totalLocalTax = orders.reduce((sum, o) => sum + (o.totalLocalTax || 0), 0);
  const totalTaxAccrued = totalExciseTax + totalLocalTax;

  const totalPaidTax = orders
    .filter((o) => o.status === "complete")
    .reduce((sum, o) => sum + (o.totalTax || 0), 0);

  // Outstanding = everything not yet paid and not rejected (pending awaiting
  // payment, received, or in the middle of filing).
  const totalPendingTax = orders
    .filter((o) => ["pending", "received", "filing"].includes(o.status))
    .reduce((sum, o) => sum + (o.totalTax || 0), 0);

  const hasTaxObligation = totalTaxAccrued > 0 || products.some((p) => p.isExciseTaxable !== false);

  if (loading) {
    return (
      <div className="flex justify-center p-24">
        <svg
          className="animate-spin h-10 w-10 text-[var(--accent)]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="glass-panel p-12 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">
          {error || "ไม่พบข้อมูลลูกค้ารายนี้"}
        </h2>
        <p className="text-[var(--text-3)] mb-6">
          ลูกค้าที่คุณกำลังพยายามเข้าถึงอาจถูกลบหรือไม่มีอยู่ในระบบ
        </p>
        <Link href="/database/customers" className="btn btn-primary px-6 inline-flex items-center gap-2">
          <ArrowLeft size={16} /> กลับไปยังข้อมูลลูกค้า
        </Link>
      </div>
    );
  }

  // Field cell for the profile grid.
  const Field = ({ label, value, mono }) => (
    <div>
      <span className="text-[var(--text-3)] block mb-1 text-[11px]">{label}</span>
      <span className={`font-semibold text-[var(--text)] text-sm ${mono ? "font-mono" : ""}`}>{value || "-"}</span>
    </div>
  );

  return (
    <>
      {/* Top Header Section */}
      <Link
        href="/database/customers"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          color: "var(--text-2)",
          fontSize: "13px",
          fontWeight: 500,
          marginBottom: "14px",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} /> กลับไปข้อมูลลูกค้า
      </Link>
      <SalesDetailOverview
        eyebrow={`CUSTOMER MASTER · ${customer.arCode || "NO AR CODE"}`}
        title={customer.name}
        description={<><span>{customer.customerType === "individual" ? "บุคคลธรรมดา" : "นิติบุคคล"}</span><span>สร้างเมื่อ {fmtDate(customer.createdAt)}</span></>}
        badges={<SalesStateBadge label={customer.isActive === false ? "พักใช้งาน" : "ใช้งานอยู่"} color={customer.isActive === false ? "var(--text-3)" : "var(--green)"} />}
        actions={<>
          {canEdit && (
            <ActionButton kind="edit" label="แก้ไขข้อมูล" onClick={() => setIsEditing(true)} />
          )}
          {canEdit && (
            customer.isActive === false
              ? <ActionButton kind="resume" icon={ArchiveRestore} label="เปิดใช้อีกครั้ง" onClick={handleToggleActive} />
              : <ActionButton kind="pause" icon={Archive} label="พักใช้" onClick={handleToggleActive} />
          )}
          {canEdit && canDelete && (
            <ActionButton kind="delete" label="ลบลูกค้า" onClick={handleDelete} />
          )}
        </>}
        facts={[
          { icon: Boxes, label: "สินค้า", value: `${products.length} รายการ` },
          { icon: ShoppingCart, label: "ใบสั่งซื้อ", value: `${orders.length} รายการ` },
          { icon: FolderKanban, label: "โครงการ", value: `${projects.length} โครงการ` },
          { icon: Building2, label: "ทีมดูแล", value: (customer.teams?.length ? customer.teams : customer.team ? [customer.team] : []).map((t) => TEAM_LABELS[t] || t).join(", ") || "-" },
        ]}
      />

      {!!projects.length && <div className="my-[18px]"><ContextGrid>{projects.slice(0, 3).map((project) => <ContextCard key={project.id} icon={FolderKanban} href={`/sa/projects/${project.id}`} eyebrow="โครงการของลูกค้า" title={`${project.code ? `${project.code} · ` : ""}${project.name}`} subtitle="เปิดดูดีล ไทม์ไลน์ และงานของโครงการ" badges={project.status ? <span className="ui-badge">{project.status}</span> : null} facts={[{ label: "ทีม", value: project.team || "-" }, { label: "สถานะ", value: project.status || "-" }]} />)}</ContextGrid></div>}

      {customer.isActive === false && (
        <div className="mb-[22px] rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style={{ background: "var(--panel-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
          <Archive size={16} className="text-[var(--text-3)]" />
          ลูกค้ารายนี้ถูกพักใช้งาน — ไม่แสดงในรายการเลือกของระบบอื่น (กด “เปิดใช้อีกครั้ง” เพื่อนำกลับมา)
        </div>
      )}

      {/* Metric strip — counts + (when relevant) tax obligation */}
      <div className="mb-[22px]">
        <StatCards
          items={
            canViewTax && hasTaxObligation
              ? [
                  { label: "สินค้าทั้งหมด", value: products.length },
                  { label: "ใบสั่งซื้อทั้งหมด", value: orders.length },
                  { label: "ภาษีชำระแล้ว", value: fmtMoney(totalPaidTax), tone: "success" },
                  { label: "ภาษีค้างชำระ", value: fmtMoney(totalPendingTax), tone: totalPendingTax ? "warn" : undefined },
                ]
              : [
                  { label: "สินค้าทั้งหมด", value: products.length },
                  ...(canViewTax ? [{ label: "ใบสั่งซื้อทั้งหมด", value: orders.length }] : []),
                ]
          }
        />
        {canViewTax && hasTaxObligation && (
          <p className="text-[11px] text-[var(--text-3)] mt-2">
            ยอดภาษีรวมสะสม {fmtMoney(totalTaxAccrued)} — สรรพสามิต {fmtMoney(totalExciseTax)} + ท้องถิ่น {fmtMoney(totalLocalTax)}
          </p>
        )}
      </div>

      {/* Profile Card (full width) */}
      <div className="mb-[22px]"><DetailCard icon={Building2} eyebrow="Customer profile" title="ข้อมูลลูกค้า บริษัท/บุคคล">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
          <Field label="ประเภทลูกค้า" value={customer.customerType === "individual" ? "บุคคลธรรมดา" : "นิติบุคคล (บริษัท)"} />
          <Field label="ทีมดูแล" value={(customer.teams?.length ? customer.teams : customer.team ? [customer.team] : []).map((t) => TEAM_LABELS[t] || t).join(", ") || "-"} />
          <Field label="รหัสลูกค้า AR Code" value={customer.arCode} mono />
          <Field label="เลขผู้เสียภาษี (Tax ID)" value={customer.taxId ? fmtNationalId(customer.taxId) : ""} mono />
          <Field label="สาขา (Branch)" value={!customer.branchCode || customer.branchCode === "00000" ? "สำนักงานใหญ่" : `สาขา ${customer.branchCode}`} />
          <Field label="เบอร์โทร (Phone)" value={customer.phone ? fmtPhone(customer.phone) : ""} mono />
          <Field label="เงื่อนไขเครดิต (Credit Terms)" value={customer.creditTerms} />
          <div className="md:col-span-3">
            <span className="text-[var(--text-3)] block mb-1 text-[11px]">ที่อยู่ออกใบเอกสาร</span>
            <p className="font-medium text-[var(--text)] leading-relaxed text-sm">{customer.address}</p>
          </div>
          <div className="md:col-span-3">
            <span className="text-[var(--text-3)] block mb-1 text-[11px]">ที่อยู่จัดส่ง</span>
            <p className="font-medium text-[var(--text)] leading-relaxed text-sm">
              {customer.shippingAddress || <span className="text-[var(--text-3)] italic font-normal">ใช้ที่อยู่ออกเอกสาร</span>}
            </p>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <span className="text-[var(--text-3)] block text-[11px] mb-2">ผู้ติดต่อ ({(customer.contacts || []).length})</span>
          {(customer.contacts || []).length > 0 ? (
            <div className="flex flex-col gap-2">
              {customer.contacts.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border border-[var(--border)] rounded-lg px-3 py-2">
                  {c.role && <span className="ui-badge">{c.role}</span>}
                  <span className="font-medium text-[var(--text)]">{c.name || "-"}</span>
                  {c.phone && <span className="font-mono text-[var(--text-2)]">{fmtPhone(c.phone)}</span>}
                  {c.email && <span className="text-[var(--text-2)]">{c.email}</span>}
                  {i === 0 && <span className="text-[10px] text-[var(--text-3)]">(ผู้ติดต่อหลัก)</span>}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[var(--text-3)] text-xs italic">ไม่มีข้อมูลผู้ติดต่อ</span>
          )}
        </div>
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <span className="text-[var(--text-3)] block text-[11px] mb-1.5">แบรนด์สินค้าที่ดูแล</span>
          <div className="flex flex-wrap gap-1.5">
            {customer.brands && customer.brands.length > 0 ? (
              customer.brands.map((b, i) => (
                <span key={i} className="bg-[var(--panel-2)] px-2.5 py-0.5 rounded-full text-[11px] text-[var(--text-2)] font-semibold">
                  {brandBothOf(b)}
                </span>
              ))
            ) : (
              <span className="text-[var(--text-3)] text-xs italic">ไม่มีข้อมูลแบรนด์</span>
            )}
          </div>
        </div>
      </DetailCard></div>

      {/* เอกสารแนบของลูกค้า — แผนที่/สัญญา/หนังสือรับรอง/ภพ.20 ฯลฯ */}
      <div className="mb-[22px]">
        <AttachmentsPanel
          entityType="customer"
          entityId={id}
          canEdit={canEdit}
          docTypes={customerDocTypes(customer.customerType)}
          title="เอกสารของลูกค้า"
          note={customer.customerType === "individual"
            ? "เอกสารบุคคลธรรมดา: สำเนาบัตรประชาชน, ทะเบียนบ้าน, เอกสารเปลี่ยนชื่อ-นามสกุล (ถ้ามี)"
            : "เอกสารนิติบุคคล: หนังสือรับรองบริษัท, ภ.พ.20, บัตร/ทะเบียนบ้านกรรมการ, หนังสือมอบอำนาจ, แผนที่บริษัท"}
        />
      </div>

      {/* Tabs Header */}
      <div className="tabs-header">
        <button onClick={() => setActiveTab("products")} className={`tab-btn ${activeTab === "products" ? "active" : ""}`}>
          รายการสินค้า ({products.length})
        </button>
        {canViewTax && (
          <>
            <button onClick={() => setActiveTab("registrations")} className={`tab-btn ${activeTab === "registrations" ? "active" : ""}`}>
              การขึ้นทะเบียน ({regs.length})
            </button>
            <button onClick={() => setActiveTab("orders")} className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}>
              การยื่นชำระภาษี ({orders.length})
            </button>
          </>
        )}
        {projects.length > 0 && (
          <button onClick={() => setActiveTab("projects")} className={`tab-btn ${activeTab === "projects" ? "active" : ""}`}>
            โครงการ ({projects.length})
          </button>
        )}
      </div>

      {/* Products Tab */}
      {activeTab === "products" && (
        products.length === 0 ? (
          <div className="glass-panel p-10 text-center text-[var(--text-3)]">ยังไม่มีสินค้าของลูกค้ารายนี้</div>
        ) : isPortrait ? (
          <div className="grid grid-cols-1 gap-3">
            {products.map((p) => {
              const isExempt = p.isExciseTaxable === false;
              const taxRate = isExempt ? 0 : p.exciseTax + p.localTax;
              return (
                <div key={p.id} onClick={() => (window.location.href = `/database/products/${p.id}`)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text)] text-sm truncate">{productNameBoth(p)}</div>
                      <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">{p.fgCode} · {brandBoth(p.brandName, p.brandNameEn)}</div>
                    </div>
                    <ProductStatusPill status={p.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border)]">
                    <span className="font-mono text-[var(--text-2)]">{p.volume} ml · {fmtMoney(p.retailPriceIncVat)}</span>
                    {canViewTax && (
                      <span className="text-[var(--text-2)]">
                        {isExempt ? <span className="status-pill success text-[10px]">ไม่ต้องเสียภาษี</span> : <span className="font-mono">{fmtMoney(taxRate)}</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel">
            <div className="px-4 py-3.5 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm text-[var(--text)] flex items-center gap-2"><Boxes size={16} className="text-[var(--accent)]" /> สินค้าของลูกค้ารายนี้ ({products.length} รายการ)</h3>
            </div>
            <div className="premium-table-wrapper border-none rounded-t-none">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>รหัสสินค้า (FG Code)</th>
                    <th>รายละเอียดสินค้า / แบรนด์</th>
                    <th>ปริมาตร (ml)</th>
                    <th className="num">ราคาขายปลีก</th>
                    {canViewTax && <th className="num">ภาษีคำนวณต่อชิ้น</th>}
                    <th className="text-center">สถานะการอนุมัติ</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const isExempt = p.isExciseTaxable === false;
                    const taxRate = isExempt ? 0 : p.exciseTax + p.localTax;
                    return (
                      <tr key={p.id} onClick={() => (window.location.href = `/database/products/${p.id}`)} className="clickable-row">
                        <td className="font-semibold font-mono text-[var(--text)]">{p.fgCode}</td>
                        <td>
                          <div className="font-semibold text-[var(--text)]">{productNameBoth(p)}</div>
                          <div className="text-[10px] text-[var(--text-3)] font-mono mt-0.5">Brand: {brandBoth(p.brandName, p.brandNameEn)}</div>
                        </td>
                        <td className="font-mono">{p.volume} ml</td>
                        <td className="num font-mono text-[var(--text-2)]">{fmtMoney(p.retailPriceIncVat)}</td>
                        {canViewTax && (
                          <td className="num font-mono text-[var(--text-2)]">
                            {isExempt ? <span className="status-pill success text-[10px]">ไม่ต้องเสียภาษี</span> : fmtMoney(taxRate)}
                          </td>
                        )}
                        <td className="text-center"><ProductStatusPill status={p.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Registrations Tab — tax-gated, read-only (manage in /tax) */}
      {canViewTax && activeTab === "registrations" && (
        regs.length === 0 ? (
          <div className="glass-panel p-10 text-center text-[var(--text-3)]">ยังไม่มีการขึ้นทะเบียนสรรพสามิตของลูกค้ารายนี้</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {regs.map((r) => (
              <div key={r.id} onClick={() => router.push(`/tax/registrations/${r.id}`)} className="glass-panel clickable-row cursor-pointer p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold font-mono text-sm text-[var(--text)]">{r.fgCode}</div>
                  <div className="text-[11px] text-[var(--text-3)] truncate">{r.productName} · {brandBoth(r.metadata?.brandNameTh, r.metadata?.brandNameEn || r.brandName)}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.approvalNumber && <span className="font-mono text-[11px] text-[var(--text-3)]">{r.approvalNumber}</span>}
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Orders Tab — tax-gated */}
      {canViewTax && activeTab === "orders" && (
        orders.length === 0 ? (
          <div className="glass-panel p-10 text-center text-[var(--text-3)]">ยังไม่มีรายการสั่งซื้อในระบบ</div>
        ) : isPortrait ? (
          <div className="grid grid-cols-1 gap-3">
            {orders.map((o) => {
              const isExempt = (o.totalTax || 0) === 0;
              const itemCount = o.items?.length || 0;
              return (
                <div key={o.id} onClick={() => setSelectedOrder(o)} className="glass-panel clickable-row cursor-pointer p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text)] font-mono text-sm">{o.quotationRef}</div>
                      <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">PO: {o.poReference || "-"} · {itemCount} รายการ</div>
                    </div>
                    <OrderStatusPill status={o.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border)]">
                    <span className="text-[var(--text-3)]">กำหนดส่ง: {o.deliveryDate || "-"}</span>
                    <span className="font-mono font-bold text-[var(--text)]">
                      {isExempt ? <span className="status-pill success text-[10px]">ไม่ต้องเสียภาษี</span> : fmtMoney(o.totalTax)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel">
            <div className="px-4 py-3.5 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm text-[var(--text)] flex items-center gap-2"><ShoppingCart size={16} className="text-[var(--accent)]" /> รายการสั่งซื้อ ({orders.length} รายการ)</h3>
            </div>
            <div className="premium-table-wrapper border-none rounded-t-none">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>เลขที่ใบเสนอราคา</th>
                    <th>PO Reference</th>
                    <th className="text-center">จำนวนรายการ</th>
                    <th className="num">ยอดภาษีรวม</th>
                    <th className="text-center">กำหนดส่ง</th>
                    <th className="text-center">สถานะชำระเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const isExempt = (o.totalTax || 0) === 0;
                    const itemCount = o.items?.length || 0;
                    return (
                      <tr key={o.id} className="clickable-row" onClick={() => setSelectedOrder(o)}>
                        <td className="font-semibold font-mono text-[var(--text)]">{o.quotationRef}</td>
                        <td className="font-mono text-xs text-[var(--text-2)]">{o.poReference || "-"}</td>
                        <td className="text-center font-mono font-semibold">{itemCount}</td>
                        <td className="num font-mono font-bold text-[var(--text)]">
                          {isExempt ? <span className="status-pill success text-[10px]">ไม่ต้องเสียภาษี</span> : fmtMoney(o.totalTax)}
                        </td>
                        <td className="text-center text-xs">{o.deliveryDate || "-"}</td>
                        <td className="text-center"><OrderStatusPill status={o.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Projects Tab — PM 360-view, read-only (manage in /sa) */}
      {activeTab === "projects" && (
        projects.length === 0 ? (
          <div className="glass-panel p-10 text-center text-[var(--text-3)]">ยังไม่มีโครงการของลูกค้ารายนี้</div>
        ) : (
          <div className="glass-panel">
            <div className="px-4 py-3.5 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm text-[var(--text)] flex items-center gap-2"><FolderKanban size={16} className="text-[var(--accent)]" /> โครงการที่เกี่ยวข้อง ({projects.length} รายการ)</h3>
            </div>
            <div className="p-3 grid grid-cols-1 gap-2">
              {projects.map((p) => (
                <div key={p.id} onClick={() => router.push(`/sa/projects/${p.id}`)} className="glass-panel clickable-row cursor-pointer p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[var(--text)] truncate">{p.name || p.code}</div>
                    <div className="text-[11px] text-[var(--text-3)] font-mono mt-0.5">{p.code}</div>
                  </div>
                  {p.status && <span className="ui-badge shrink-0">{p.status}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Edit modal */}
      <Modal open={isEditing} onClose={() => setIsEditing(false)} title="แก้ไขข้อมูลลูกค้า (Edit Customer)" size="md">
        <form onSubmit={handleEditSubmit}>
          {/* ฟอร์มเดียวกับโมดัลเพิ่มลูกค้า (หน้ารวม) — กฎ: แก้ = ฟอร์มเดียวกับสร้าง.
              ต่างแค่โหมด: มีช่องทีมดูแล (ย้ายทีมได้เฉพาะ superuser — API บังคับซ้ำ) */}
          <CustomerForm
            form={formData}
            onForm={(patch) => setFormData((f) => ({ ...f, ...patch }))}
            showTeams
            canEditTeams={superuser}
          />
          <div className="form-action-bar page">
            <button type="button" onClick={() => setIsEditing(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary px-6">
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </button>
          </div>
        </form>
      </Modal>

      <OrderDetailModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
    </>
  );
}
