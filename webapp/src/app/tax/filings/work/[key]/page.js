"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, ReceiptText, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import Workspace from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard } from "@/components/ui/DocumentControlPanel";
import { FilingWorkBody, useFilingWork } from "@/components/excise/FilingWorkView";
import { useCan } from "@/lib/roleContext";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { fmtMoney, naText, NA } from "@/lib/format";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { toneColor } from "@/lib/ui/tone";

/* ── หน้าเต็มของงานรอ RA / กำลังมา (`/tax/filings/work/<คีย์งาน>`) ────────────────────────────────────────────────
   ⭐ เจ้าของ 25/11/2026: "ตารางยื่นชำระ กดเข้าไปต้องเป็นรายละเอียดหน้าเต็ม แล้ว action ใน control panel"
     · เดิมแถวรอ RA/กำลังมาเปิดโมดัลบนหน้ารายการ (`?start=`) — ตอนนี้เป็นหน้าของตัวเอง ท่าเดียวกับหน้าบันทึกการยื่น (/tax/filings/[id]):
       เนื้อ (ต้นทาง · ยอด · รายการ · ทะเบียนที่ขาด) อยู่คอลัมน์หลัก · "เริ่มยื่น" อยู่การ์ดจัดการ · ลิงก์ใบสั่งขายอยู่การ์ดเอกสารต้นทาง
     · เริ่มยื่นสำเร็จ = ไปหน้าบันทึกการยื่นที่เพิ่งเกิด (บันทึกผลชำระ · ยกเลิกการเริ่มยื่น อยู่การ์ดจัดการของหน้านั้น)
     · ลิงก์เก่า `/tax/filings?start=<คีย์>` (แจ้งเตือน/บุ๊กมาร์ก) หน้ารายการพามาที่นี่เอง
   ⚠️ คีย์งาน = `excise:<SO ค่าสรรพสามิต>` · `not_billed:<SO ลูกค้า>` · `upcoming:<ใบเสนอราคาค่าสรรพสามิต>` (มี ":" ⇒ เข้ารหัสใน URL)
   ⚠️ แถวคิวคำนวณสด (ไม่มีตาราง) ⇒ หาด้วยคีย์จากคิวทั้งก้อน (`/api/tax/orders/queue` ตัวเดียวกับหน้ารายการ) */
const BACK = { href: "/tax/filings", label: "กลับไปหน้างานยื่นชำระ" };

const decodeKey = (raw) => {
  try { return decodeURIComponent(String(raw || "")); } catch { return String(raw || ""); }
};

export default function FilingWorkPage() {
  const params = useParams();
  const router = useRouter();
  const key = decodeKey(params?.key);
  const canFile = useCan("ra:approve");      // RA: เริ่มยื่น (ฝ่ายขายไม่มีขั้นบนเส้นนี้)
  const canOpenSales = useCan("salesplan:view"); // RA ไม่มี ⇒ การ์ดต้นทางไม่มีลิงก์ไปหน้าขาย

  const { data: queue, loading, error, staleError, errorDetail, loaded, reload } = useApiList(canFile ? "/api/tax/orders/queue" : null);
  const row = useMemo(() => (queue || []).find((item) => item.key === key) || null, [queue, key]);
  const work = useFilingWork(row);
  const { preview, startBlocker, busy, upcoming } = work;

  const failing = (error || staleError) ? [{ label: "คิวงาน RA", error: error || staleError, detail: errorDetail }] : [];
  const notice = failing.length ? (
    <StatusNotice
      tone="error"
      className="mb-4"
      detail={sourcesFailureDetail(failing)}
      action={<Button size="sm" variant="ghost" onClick={() => reload()} disabled={loading}>{loading ? "กำลังลองใหม่…" : "ลองใหม่"}</Button>}
    >
      {`ดึงข้อมูลไม่ได้: คิวงาน RA — ${row ? "ข้อมูลที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด" : "ยังเปิดงานนี้ไม่ได้ (ไม่ได้แปลว่างานหายไป)"} · ${error || staleError}`}
    </StatusNotice>
  ) : null;

  if (!canFile) {
    return (
      <Workspace icon={<ReceiptText size={22} />} title="งานยื่นชำระภาษีสรรพสามิต" back={BACK}>
        <StatusNotice tone="info">งานรอ RA เปิดได้เฉพาะฝ่าย RA — บันทึกการยื่นที่เริ่มแล้วดูได้ที่หน้ารายการ</StatusNotice>
      </Workspace>
    );
  }
  // "ไม่พบ" ได้เฉพาะหลังคิวเคยโหลดสำเร็จ — ยังไม่เคยได้คำตอบ = ยังไม่รู้ (skeleton / ป้ายข้างบน)
  if (!row) {
    return (
      <Workspace icon={<ReceiptText size={22} />} title="งานยื่นชำระภาษีสรรพสามิต" back={BACK} loading={loading && !loaded}>
        {notice}
        {loaded && !error ? (
          <StatusNotice tone="warning" action={<Button as={Link} href="/tax/filings" size="sm" variant="ghost">ไปหน้ารายการ</Button>}>
            ไม่พบงานนี้ในคิวรอ RA แล้ว — อาจเริ่มยื่นไปแล้ว (ดูบันทึกการยื่นในหน้ารายการ) หรือใบสั่งขายถูกยกเลิก
          </StatusNotice>
        ) : null}
      </Workspace>
    );
  }

  const sales = row.salesOrder || {};
  const statusLabel = upcoming ? "กำลังมา" : "รอ RA";
  const statusTone = upcoming ? "info" : "warning";
  const workflowSteps = workflowStepsFromIndex([
    { id: "upcoming", label: "ใบค่าสรรพสามิต", hint: upcoming ? (row.stageLabel || "กำลังมา") : "ใบสั่งขายค่าสรรพสามิตอนุมัติแล้ว" },
    { id: "queued", label: "รอ RA", hint: "ฝ่าย RA ตรวจรายการ/ทะเบียน แล้วกดเริ่มยื่น" },
    { id: "filing", label: "กำลังยื่น", hint: "ฝ่าย RA ยื่นแบบต่อกรมสรรพสามิต" },
    { id: "complete", label: "ชำระแล้ว", hint: "บันทึกเลขที่ใบเสร็จและวันที่ชำระ" },
  ], upcoming ? 0 : 1);
  const startWork = async () => {
    const record = await work.start();
    if (!record) return;
    await reload();
    router.push(`/tax/filings/${record.id}`);
  };
  const primaryAction = {
    id: "start", label: busy ? "กำลังบันทึก…" : "เริ่มยื่น", kind: "submit", icon: Send,
    onClick: startWork,
    disabled: Boolean(startBlocker) || busy,
    disabledReason: startBlocker || undefined,
  };
  const ready = !upcoming && !preview.loading && !preview.error;

  return (
    <Workspace
      icon={<ReceiptText size={22} />}
      title={`งานยื่น ${sales.orderNumber || ""}`}
      subtitle={naText(sales.customerName)}
      back={BACK}
    >
      {notice}
      <DetailPageLayout
        asideLabel="สรุปและจัดการงานยื่นชำระสรรพสามิต"
        aside={(
          <>
            <DocumentSummaryCard
              title={row.exciseOrder ? "ยอดที่ลูกค้าจ่าย (รวม VAT 7%)" : "ยอดภาษี + VAT 7%"}
              total={ready ? fmtMoney(preview.amountToCollect) : NA}
              rows={[
                { id: "tax-before-vat", label: "ค่าภาษี (ก่อน VAT)", value: ready ? fmtMoney(preview.totalTax) : NA },
                { id: "items", label: "รายการสรรพสามิต", value: ready ? `${preview.lines.length} รายการ` : NA },
                { id: "registration", label: "ทะเบียน", value: preview.gates?.registration?.label || NA },
                // V3: เงินไม่ใช่ด่าน — บอกให้รู้เฉย ๆ
                { id: "money", label: "บัญชี (แสดงเท่านั้น)", value: preview.gates?.money?.label || NA },
              ]}
              status={statusLabel}
              statusColor={toneColor(statusTone)}
            />
            <DocumentControlCard
              status={statusLabel}
              statusColor={toneColor(statusTone)}
              statusDescription="การดำเนินการของฝ่าย RA"
              workflowSteps={workflowSteps}
              primaryAction={primaryAction}
              busy={busy}
              notices={work.error ? <StatusNotice tone="error">{work.error}</StatusNotice> : null}
            />
            <RelatedDocumentCard
              title="ใบสั่งขายต้นทาง"
              meta={sales.orderNumber || "ใบสั่งขายของลูกค้า"}
              actions={canOpenSales ? (
                <>
                  {sales.id ? (
                    <Button as={Link} href={`/sa/sales-orders/${sales.id}`} variant="ghost" size="sm">
                      <ExternalLink size={13} /> เปิด ใบสั่งขาย
                    </Button>
                  ) : null}
                  {row.exciseOrder?.id ? (
                    <Button as={Link} href={`/sa/sales-orders/${row.exciseOrder.id}`} variant="quiet" size="sm">
                      <ExternalLink size={13} /> เปิด ใบสั่งขายค่าสรรพสามิต
                    </Button>
                  ) : null}
                </>
              ) : sales.customerId ? (
                <Button as={Link} href={`/database/customers/${sales.customerId}`} variant="ghost" size="sm">
                  <ExternalLink size={13} /> เปิดลูกค้า
                </Button>
              ) : null}
            >
              {preview.existing ? (
                <Link href={`/tax/filings/${preview.existing.id}`} className="linklike">
                  เริ่มยื่นไปแล้ว — เปิดบันทึกการยื่น {preview.existing.id}
                </Link>
              ) : null}
            </RelatedDocumentCard>
          </>
        )}
      >
        <FilingWorkBody row={row} preview={preview} upcoming={upcoming} />
      </DetailPageLayout>
    </Workspace>
  );
}
