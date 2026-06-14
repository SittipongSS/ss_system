"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Plus, FileText } from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtMoney } from "@/lib/format";
import TaxWorkspace from "@/components/tax/TaxWorkspace";
import TaxStageRail from "@/components/tax/TaxStageRail";
import ActionQueue, { ActionRow } from "@/components/tax/ActionQueue";
import { TRACK1, TRACK2, deptOf } from "@/lib/tax/status";

// ── Excise-tax command center ─────────────────────────────────────────
// Role-aware landing for the whole tax system: both pipelines at a glance
// (stage rail + live counts) and a single "ต้องทำตอนนี้" queue of the items
// THIS role must act on. Queue rows deep-link into the workspace pages where
// the real actions (approve / receive / file) live.
export default function TaxCommandCenter() {
  const role = useRole();
  const canEdit = useCan("products:edit"); // SA submit caps
  const dept = deptOf(role);

  const [regs, setRegs] = useState(() => apiCache.get("/api/excise-registrations") ?? []);
  const [orders, setOrders] = useState(() => apiCache.get("/api/orders") ?? []);
  const [loading, setLoading] = useState(
    () => !(apiCache.has("/api/excise-registrations") && apiCache.has("/api/orders")),
  );

  useEffect(() => {
    Promise.all([
      fetch("/api/excise-registrations").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/orders").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([r, o]) => {
        if (r) { setRegs(r); apiCache.set("/api/excise-registrations", r); }
        if (o) { setOrders(o); apiCache.set("/api/orders", o); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const t1 = {
    rejected: regs.filter((r) => r.status === "rejected").length,
    pending_legal: regs.filter((r) => r.status === "pending_legal").length,
    approved: regs.filter((r) => r.status === "approved").length,
  };
  const t2 = {
    pending: orders.filter((o) => o.status === "pending").length,
    received: orders.filter((o) => o.status === "received").length,
    filing: orders.filter((o) => o.status === "filing").length,
    complete: orders.filter((o) => o.status === "complete").length,
  };

  const itemsLine = (o) => {
    const n = o.items?.length || 0;
    const tax = (o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : `ภาษีรวม ${fmtMoney(o.totalTax)}`;
    return `${n} รายการ · ${tax}${o.deliveryDate ? ` · ส่ง ${o.deliveryDate}` : ""}`;
  };

  // Build the queue for the current department. Admin (AD) sees both lanes.
  const showSA = dept === "SA" || dept === "AD";
  const showLG = dept === "LG" || dept === "AD";
  const queue = [];

  if (showSA) {
    regs.filter((r) => r.status === "rejected").forEach((r) =>
      queue.push({
        id: `reg-${r.id}`, status: "rejected",
        title: `${r.fgCode} · ${r.productName}`,
        subtitle: `${r.customerName || "-"} — เหตุผล: ${r.rejectionReason || "ตีกลับให้แก้ไข"}`,
        href: `/tax/register/${r.id}`, cta: "แก้ไขและส่งกลับ",
      }));
    orders.filter((o) => o.status === "pending").forEach((o) =>
      queue.push({
        id: `ord-${o.id}`, status: "pending",
        title: `${o.quotationRef} · ${o.customerName || "-"}`,
        subtitle: itemsLine(o), href: "/tax/payment", cta: "ไปรับเงิน",
      }));
    orders.filter((o) => o.status === "rejected").forEach((o) =>
      queue.push({
        id: `ordx-${o.id}`, status: "rejected",
        title: `${o.quotationRef} · ${o.customerName || "-"}`,
        subtitle: `${itemsLine(o)} — ${o.rejectionReason || "ตีกลับ"}`,
        href: "/tax/payment", cta: "แก้ไขและส่งกลับ",
      }));
  }
  if (showLG) {
    regs.filter((r) => r.status === "pending_legal").forEach((r) =>
      queue.push({
        id: `regl-${r.id}`, status: "pending_legal",
        title: `${r.fgCode} · ${r.productName}`,
        subtitle: `${r.customerName || "-"} — รอตรวจขึ้นทะเบียน`,
        href: `/tax/register/${r.id}`, cta: "ตรวจอนุมัติ",
      }));
    orders.filter((o) => o.status === "received").forEach((o) =>
      queue.push({
        id: `ordr-${o.id}`, status: "received",
        title: `${o.quotationRef} · ${o.customerName || "-"}`,
        subtitle: `${itemsLine(o)} — รอยื่นกรมสรรพสามิต`,
        href: "/tax/approve-payment", cta: "ไปยื่น",
      }));
    orders.filter((o) => o.status === "filing").forEach((o) =>
      queue.push({
        id: `ordf-${o.id}`, status: "filing",
        title: `${o.quotationRef} · ${o.customerName || "-"}`,
        subtitle: `${itemsLine(o)} — กำลังยื่น`,
        href: "/tax/approve-payment", cta: "บันทึกชำระ",
      }));
  }

  const headerRight = canEdit ? (
    <>
      <Link href="/tax/register" className="btn flex items-center gap-1.5"><Plus size={16} /> ยื่นขึ้นทะเบียน</Link>
      <Link href="/tax/payment" className="btn btn-primary flex items-center gap-1.5"><FileText size={16} /> ยื่นชำระภาษี</Link>
    </>
  ) : null;

  return (
    <TaxWorkspace
      icon={<LayoutDashboard size={22} />}
      title="ศูนย์บัญชาการภาษีสรรพสามิต"
      subtitle="งานที่ต้องทำของคุณ + ภาพรวมสายงานทั้งสองแทร็ก"
      headerRight={headerRight}
      loading={loading}
      rail={
        <>
          <TaxStageRail track={TRACK1} dept={dept} counts={t1} />
          <TaxStageRail track={TRACK2} dept={dept} counts={t2} />
        </>
      }
    >
      <ActionQueue count={queue.length}>
        {queue.map((q) => (
          <ActionRow
            key={q.id}
            status={q.status}
            title={q.title}
            subtitle={q.subtitle}
            actions={<Link href={q.href} className="btn btn-primary px-4">{q.cta}</Link>}
          />
        ))}
      </ActionQueue>
    </TaxWorkspace>
  );
}
