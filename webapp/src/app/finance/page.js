"use client";
// ── ภาพรวมฝ่ายบัญชีและการเงิน ─────────────────────────────────────────────
//
// > *"อยากสร้าง Module ของบัญชีและการเงินออกมาแบบวิจัยและพัฒนา"* (2026-08-13)
//
// ⭐ ตอบสองคำถามที่ฝ่ายบัญชีเปิดระบบมาถาม: **"มีอะไรรอฉันอยู่"** และ
// **"เงินค้างรับเท่าไร"** — งานของฝ่ายนี้มีสองสาย ซึ่งเป็นคนละแกนกันจริง ๆ:
//   · ตรวจ **ใบ** (financeStatus · mig 0250) — ข้อมูลลูกค้า เงื่อนไข ยอด ถูกไหม
//   · รับรอง **งวด** (installments · mig 0245) — เงินเข้าจริงไหม
// สองสายนี้เดินพร้อมกันได้และไม่รอกัน จึงต้องเป็นคนละก้อนบนหน้า ไม่ใช่ตัวเลขรวม
//
// ⚠️ **ยังไม่มีกราฟโดยตั้งใจ** — เหตุผลเดียวกับหน้าภาพรวม RD: ของจริงในระบบยังมี
// หลักหน่วยถึงหลักสิบ กราฟที่มีจุดเดียวแย่กว่าไม่มีกราฟ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, CircleDollarSign, ClipboardCheck, Wallet } from "lucide-react";
import Workspace, { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText } from "@/lib/format";
import { awaitsFinanceReview } from "@/lib/sales/salesOrderFinanceApproval";

export default function FinanceOverviewPage() {
  const router = useRouter();
  const [ledger, setLedger] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [ledgerRes, orderRes] = await Promise.all([
        fetch("/api/finance/payments", { cache: "no-store" }),
        fetch("/api/sales-planning/sales-orders", { cache: "no-store" }),
      ]);
      const ledgerBody = await ledgerRes.json().catch(() => null);
      if (!ledgerRes.ok) throw new Error(ledgerBody?.error || "โหลดทะเบียนการชำระไม่สำเร็จ");
      setLedger(ledgerBody);
      const orderBody = await orderRes.json().catch(() => []);
      setOrders(Array.isArray(orderBody) ? orderBody : []);
    } catch (loadError) { setError(loadError.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ใบที่รอบัญชีตรวจ — `financeStatus === 'pending'` เท่านั้น
     ⚠️ **ไม่รวม `null`** ซึ่งแปลว่า "ออกก่อนมีขั้นนี้" ไม่ใช่ "รอตรวจ" (มติเดิม
     ตอน mig 0250 ที่จงใจไม่ backfill) · นับรวมเมื่อไรบัญชีจะเปิดมาเจอคิวค้าง
     ทั้งกองที่ไม่มีใครตั้งใจสร้าง */
  const awaitingReview = useMemo(
    // ⚠️ ใช้ helper ตัวเดียวกับคิวบนทะเบียนใบสั่งขาย — เขียนเงื่อนไขซ้ำเมื่อไร
    // สองจอจะนับคนละชุด (ใบยอด 0 เคยโผล่ที่หนึ่งแต่ไม่โผล่อีกที่ก็เพราะแบบนี้)
    () => orders.filter((o) => awaitsFinanceReview(o)),
    [orders],
  );
  const bounced = useMemo(
    () => orders.filter((o) => o.financeStatus === "rejected"),
    [orders],
  );

  const summary = ledger?.summary;

  return (
    <Workspace
      icon={<Wallet size={22} />}
      title="ภาพรวมบัญชีและการเงิน"
      subtitle="มีอะไรรอฝ่ายบัญชีอยู่ และเงินค้างรับเท่าไร"
    >
      <div className="flex flex-col gap-4">
        {error && <StatusNotice tone="error" role="alert" action={<Button size="sm" onClick={load}>ลองใหม่</Button>}>{error}</StatusNotice>}

        {/* ⚠️ **แถบเตือนสำหรับของที่ถูกตีกลับ ไม่ใช่ช่องที่ห้าในแถบตัวเลข** — ใบที่บัญชี
            ตีกลับไปแล้วเป็นงานของ AE Supervisor ไม่ใช่ของฝ่ายบัญชี · เอาไปปนกับคิว
            ของตัวเองจะอ่านเหมือนยังต้องทำอะไรต่อ */}
        {!loading && bounced.length > 0 && (
          <StatusNotice tone="warning" title={`ตีกลับไปแล้ว ${bounced.length} ใบ รอฝ่ายขายแก้`}>
            ใบที่บัญชีส่งกลับ ยังไม่กลับเข้าคิว จนกว่า AE Supervisor จะส่งตรวจใหม่
          </StatusNotice>
        )}

        {!loading && !error && (
          <MetricStrip aria-label="งานที่รอฝ่ายบัญชี และยอดเงิน">
            <Metric
              as="button" type="button"
              icon={<ClipboardCheck />} label="ใบรอบัญชีตรวจ" value={`${awaitingReview.length} ใบ`}
              note="ผ่าน AE Supervisor แล้ว รอตรวจข้อมูลบนใบ"
              tone={awaitingReview.length ? "warning" : "good"}
              onClick={() => router.push("/sa/sales-orders")}
            />
            <Metric
              as="button" type="button"
              icon={<Wallet />} label="งวดรอรับรอง" value={`${summary?.awaitingCount ?? 0} งวด`}
              note={fmtMoney(summary?.awaitingAmount ?? 0)}
              tone={summary?.awaitingCount ? "warning" : "good"}
              onClick={() => router.push("/finance/payments?status=reported")}
            />
            <Metric
              as="button" type="button"
              icon={<AlarmClock />} label="งวดเลยกำหนด" value={`${summary?.overdueCount ?? 0} งวด`}
              note={fmtMoney(summary?.overdueAmount ?? 0)}
              tone={summary?.overdueCount ? "danger" : "good"}
              onClick={() => router.push("/finance/payments?overdue=1")}
            />
            {/* ⚠️ "ค้างรับ" ไม่ใช่ "ยังไม่จ่าย" — รวมงวดที่ SA แจ้งแล้วแต่ยังไม่รับรองด้วย
                เพราะยังไม่ใช่เงินที่นับได้ (กติกาจาก mig 0245) */}
            <Metric
              icon={<CircleDollarSign />} label="ค้างรับทั้งหมด" value={fmtMoney(summary?.outstandingAmount ?? 0)}
              note={`เก็บได้แล้ว ${fmtMoney(summary?.collectedAmount ?? 0)}`}
            />
          </MetricStrip>
        )}

        <WorkspaceSection
          icon={<ClipboardCheck size={17} />}
          title="ใบที่รอบัญชีตรวจ"
          subtitle="ตรวจข้อมูลลูกค้า เงื่อนไขชำระ ยอดและ VAT ก่อนกดผ่าน — ยอด Actual ไม่เปลี่ยนจากขั้นนี้"
          actions={<Link href="/finance/payments" className="linklike">เปิดทะเบียนการชำระ</Link>}
        >
          <TableScroll surface="embedded" cells="stacked" aria-busy={loading}>
              <table className="w-full text-sm">
                <thead><tr><th>เลขที่ SO</th><th>ลูกค้า</th><th>อ้างอิง QT</th><th>วันที่ SO</th><th className="num">ยอดก่อน VAT</th></tr></thead>
                <tbody>
                  {awaitingReview.map((row) => (
                    <DetailRow key={row.id} href={`/sa/sales-orders/${row.id}`} className="premium-row">
                      <td><Link prefetch={false} href={`/sa/sales-orders/${row.id}`} className="linklike mono"><strong>{row.orderNumber}</strong></Link></td>
                      <td>
                        {row.customerArCode ? <span className="ar-code ar-code-block">{row.customerArCode}</span> : null}
                        {naText(row.customerName)}
                      </td>
                      <td className="mono">{naText(row.quotation?.quoteNumber)}</td>
                      <td>{fmtDate(row.orderDate)}</td>
                      <td className="num mono">{fmtMoney(row.actualAmount)}</td>
                    </DetailRow>
                  ))}
                  {!awaitingReview.length && !loading && (
                    <TableEmpty
                      colSpan={5}
                      title="ไม่มีใบรอตรวจ"
                      description="ใบจะเข้าคิวนี้เองทันทีที่ AE Supervisor อนุมัติ"
                    />
                  )}
                </tbody>
              </table>
          </TableScroll>
        </WorkspaceSection>
      </div>
    </Workspace>
  );
}
