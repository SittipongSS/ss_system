"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney, naText } from "@/lib/format";
import { useApiList } from "@/lib/excise/useApiList";
import { deptOf, isTaxWaitingOnMe, REGISTRATION_FILTERS } from "@/lib/excise/workflow";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import { brandLabel } from "@/lib/master/brands";
import { productDisplayName } from "@/lib/master/productIdentity";
import { exciseTaxLineForRegistration } from "@/lib/tax/exciseBilling";

// ภาษี/ชิ้น อ่านจาก **ทะเบียนสินค้า** เสมอ (อัตราคิดจากราคาขายปลีกของ FG ซึ่งอัปเดตได้
// เหมือนราคาผลิต) — ทะเบียนสรรพสามิตเป็นแค่ผู้ตัดสินว่า "เสียภาษีไหม" ผ่าน
// isExciseTaxable · ตัวคิดตัวเดียวกับที่ API ใช้ตอนออกใบยื่น ตัวเลขบนสองหน้าจึงตรงกันเสมอ
const taxPerUnit = (r, product) =>
  exciseTaxLineForRegistration({ registration: r, product, quantity: 1 }).totalTax;
const registrationBrand = (r) => brandLabel(r.metadata?.brandNameTh, r.metadata?.brandNameEn || r.brandName);
const registrationProduct = (r) => productDisplayName(r);

export default function RegistrationsPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("products:edit");   // SA: create / edit / resubmit / delete

  const { data: regs, loading, reload } = useApiList("/api/excise-registrations");
  const { data: products } = useApiList("/api/products");
  const { data: customers } = useApiList("/api/customers");

  const [userName, setUserName] = useState("");
  // LG lands on their queue; everyone else sees all. A ?status= deep-link
  // (from the dashboard) overrides the default after mount.
  /* เลนของผู้ใช้ (SA / LG) — ตัวเดียวกับที่ `?status=mine` และป้ายบนเมนูใช้ (ม-117)
     AD เห็นทั้งสองเลนแต่ไม่เป็นเจ้าของขั้นไหน ⇒ ชิป "รอฉันลงมือ" จะได้ 0 เสมอ จึงซ่อนทิ้ง */
  const myDept = deptOf(role);
  const filterOptions = useMemo(
    () => REGISTRATION_FILTERS.filter((f) => f.key !== "mine" || myDept === "SA" || myDept === "LG"),
    [myDept],
  );
  const [filter, setFilter] = useState(() => (deptOf(role) === "LG" ? "pending_legal" : "all"));
  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && REGISTRATION_FILTERS.some((f) => f.key === s)) setFilter(s);
    // Legacy ?open=<id> deep-link → go straight to the detail page.
    const openId = params.get("open");
    if (openId) router.replace(`/tax/registrations/${openId}`);
  }, [router]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regs.filter((r) => {
      if (filter === "mine") {
        if (!isTaxWaitingOnMe(r, "registration", myDept)) return false;
      } else if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.fgCode, r.productName, r.brandName, r.customerName, r.approvalNumber,
        r.metadata?.productNameTh, r.metadata?.productNameEn,
        r.metadata?.brandNameTh, r.metadata?.brandNameEn]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [regs, filter, search, myDept]);

  // After saving the form: a freshly created draft opens its full detail page so
  // the user lands on the attachment cards and can submit once they're complete.
  const handleSaved = async (saved, { created } = {}) => {
    await reload();
    if (created && saved?.id) router.push(`/tax/registrations/${saved.id}`);
  };

  // อัตราภาษีมาจากสินค้า ไม่ใช่สำเนาบนทะเบียน — หาสินค้าจาก productId ของทะเบียน
  const productOf = (r) => products.find((p) => p.id === r?.productId) || null;

  const columns = [
    {
      key: "fgCode", label: "รหัสสินค้า (FG)",
      render: (r) => (
        <div>
          <div className="font-semibold font-mono">{r.fgCode}</div>
          <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>{registrationProduct(r)} ({naText(registrationBrand(r))})</div>
        </div>
      ),
    },
    { key: "customerName", label: "ลูกค้า", render: (r) => <span style={{ color: "var(--text-2)" }}>{r.customerName}</span> },
    {
      key: "tax", label: "ภาษี/ชิ้น", align: "right",
      sortValue: (r) => taxPerUnit(r, productOf(r)),
      render: (r) => <span className="font-mono">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r, productOf(r)))}</span>,
    },
    { key: "approvalNumber", label: "เลขที่อนุมัติ", render: (r) => <span className="font-mono" style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>{naText(r.approvalNumber)}</span> },
    { key: "status", label: "สถานะ", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const card = (r) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold font-mono text-sm">{r.fgCode}</div>
          <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }} className="truncate">{registrationProduct(r)} ({naText(registrationBrand(r))})</div>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: "var(--fs-5)" }}>
        <span style={{ color: "var(--text-2)" }} className="truncate">{r.customerName}</span>
        <span className="font-mono">{r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(taxPerUnit(r, productOf(r)))}</span>
      </div>
    </div>
  );

  const headerRight = (
    <>
      <span className="ui-badge">{regs.length} รายการ</span>
      {canEdit && (
        <button className="btn btn-primary flex items-center gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus size={16} /> สร้างทะเบียน
        </button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="การขึ้นทะเบียนสรรพสามิต"
      subtitle="ยื่น ตรวจสอบ และอนุมัติการขึ้นทะเบียนภาษีสรรพสามิต (สินค้า + ลูกค้า)"
      headerRight={headerRight}
      loading={loading}
      toolbar={
        <FilterBar
          filters={filterOptions}
          activeFilter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหา FG / ลูกค้า / เลขอนุมัติ..."
        />
      }
    >
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/tax/registrations/${r.id}`)}
        card={card}
        initialSort={{ key: "fgCode", dir: "asc" }}
        empty={search || filter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีการขึ้นทะเบียน"}
        emptyIcon={ClipboardCheck}
      />

      {/* registrations = ชุดเต็ม (ไม่ใช่ rows ที่ผ่านตัวกรองจอ) — โมดัลใช้เช็คว่า
          FG ไหนขึ้นทะเบียนกับลูกค้าที่เลือกไปแล้ว จะได้ไม่ให้เลือกไปชน 409 */}
      <RegistrationFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        registration={null}
        products={products}
        customers={customers}
        registrations={regs}
        userName={userName}
      />
    </Workspace>
  );
}
