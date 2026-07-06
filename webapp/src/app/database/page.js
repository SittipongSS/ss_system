"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Package, Building2, ChevronRight } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import KpiCard from "@/components/excise/KpiCard";
import ActionQueue from "@/components/ui/ActionQueue";
import { useApiList } from "@/lib/excise/useApiList";
import { useRole, useTeam } from "@/lib/roleContext";
import { canApproveMasterData, isSuperuser } from "@/lib/permissions";
import { approvalStatusOf } from "@/components/ApprovalStatus";

// Master-data command center — สรุปคลังสินค้า + ลูกค้า และคิวงานรออนุมัติ.
// ดึงจาก manage endpoint (เห็นทุกสถานะ, team-scoped ฝั่ง server) เหมือนหน้า registry.
const teamsOf = (c) => (c?.teams?.length ? c.teams : c?.team ? [c.team] : []);

export default function DatabaseOverview() {
  const router = useRouter();
  const role = useRole();
  const myTeam = useTeam();
  const { data: products, loading: l1 } = useApiList("/api/master/products?manage=1");
  const { data: customers, loading: l2 } = useApiList("/api/master/customers?manage=1");

  const canApprove = canApproveMasterData(role);
  // อนุมัติแถวนี้ได้ไหม — Senior AE เฉพาะทีมตัวเอง, supervisor/admin ทุกทีม.
  const canApproveProduct = (p) => canApprove && (isSuperuser(role) || p?.team === myTeam);
  const canApproveCustomer = (c) => canApprove && (isSuperuser(role) || teamsOf(c).includes(myTeam));

  const countOf = (list) => ({
    approved: list.filter((x) => approvalStatusOf(x) === "approved").length,
    pending: list.filter((x) => approvalStatusOf(x) === "pending").length,
    inactive: list.filter((x) => x.isActive === false).length,
  });
  const p = countOf(products);
  const c = countOf(customers);

  const goProducts = () => router.push("/database/products");
  const goCustomers = () => router.push("/database/customers");

  // คิวงาน: รายการที่ยัง pending. approver → cta "อนุมัติ" (เฉพาะแถวที่อนุมัติได้);
  // ผู้ที่อนุมัติไม่ได้ (AE/AC) → เห็นรายการรออนุมัติในทีมพร้อม cta "ดู" เพื่อติดตาม.
  const queue = [];
  products.filter((x) => approvalStatusOf(x) === "pending").forEach((x) => {
    const mine = canApproveProduct(x);
    if (canApprove && !mine) return; // approver: ข้ามแถวทีมอื่น
    queue.push({
      id: `p-${x.id}`, tone: "warning", badge: "สินค้า",
      title: `${x.fgCode || "-"} · ${x.productDescriptionEn || x.productDescription || x.brandNameEn || x.brandName || ""}`.trim(),
      subtitle: x.customerName || x.brandNameEn || x.brandName || "รออนุมัติสินค้า",
      cta: mine ? "อนุมัติ" : "ดู", onClick: goProducts,
    });
  });
  customers.filter((x) => approvalStatusOf(x) === "pending").forEach((x) => {
    const mine = canApproveCustomer(x);
    if (canApprove && !mine) return;
    queue.push({
      id: `c-${x.id}`, tone: "warning", badge: "ลูกค้า",
      title: `${x.arCode || "-"} · ${x.name || ""}`.trim(),
      subtitle: "รออนุมัติลูกค้า",
      cta: mine ? "อนุมัติ" : "ดู", onClick: goCustomers,
    });
  });

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม"
      subtitle="สรุปคลังข้อมูลสินค้า/ลูกค้า และงานรออนุมัติ"
      loading={l1 || l2}
    >
      <div className="flex flex-col gap-6">
        {/* สินค้า */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <Package size={16} /> ข้อมูลสินค้า
            <Link href="/database/products" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>เปิดหน้างาน <ChevronRight size={14} /></Link>
          </div>
          <div className="kpi-grid">
            <KpiCard label="อนุมัติแล้ว" value={p.approved} tone="success" icon={Package} onClick={goProducts} />
            <KpiCard label="รออนุมัติ" value={p.pending} tone="warning" onClick={goProducts} />
            <KpiCard label="เลิกใช้งาน" value={p.inactive} tone="neutral" onClick={goProducts} />
          </div>
        </section>

        {/* ลูกค้า */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <Building2 size={16} /> ข้อมูลลูกค้า
            <Link href="/database/customers" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>เปิดหน้างาน <ChevronRight size={14} /></Link>
          </div>
          <div className="kpi-grid">
            <KpiCard label="อนุมัติแล้ว" value={c.approved} tone="success" icon={Building2} onClick={goCustomers} />
            <KpiCard label="รออนุมัติ" value={c.pending} tone="warning" onClick={goCustomers} />
            <KpiCard label="เลิกใช้งาน" value={c.inactive} tone="neutral" onClick={goCustomers} />
          </div>
        </section>

        {/* คิวงาน */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            {canApprove ? "รออนุมัติจากคุณ" : "รายการรออนุมัติ"} {queue.length > 0 && <span className="ui-badge warning">{queue.length}</span>}
          </div>
          <ActionQueue items={queue} empty="ไม่มีรายการรออนุมัติตอนนี้ 🎉" />
        </section>
      </div>
    </Workspace>
  );
}
