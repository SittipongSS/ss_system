"use client";

// ── แผงติดตามต่อสัญญาบริการ (mig 0327 · แผน §PR-E) ──────────────────────────
//
// ⭐ **อยู่เป็นแท็บของทะเบียนสัญญา ไม่ใช่เมนูของตัวเอง** (มติผู้ใช้ 2026-08-31)
//   คนที่ดูแลสัญญากับคนที่ตามต่อสัญญาคือคนเดียวกัน และเมนูงานขายยาว 10 รายการแล้ว
//   ⚠️ แต่ยุบเป็น **ตารางเดียว** กับทะเบียนสัญญาไม่ได้: ทะเบียนสัญญาคือ *เอกสาร*
//   (`sales_contracts`) ส่วนที่นี่คือ *ไซต์* ที่คำนวณจากวันหมดของรอบขาย
//   (`service_zone_terms`) — ไซต์ที่ยังไม่เคยผูกสัญญาก็ต้องขึ้นทะเบียนนี้
//
// ⚠️ **รายชื่อคำนวณสดที่ server ทุกครั้ง** — ไม่มีสถานะ "ใกล้หมด" เก็บในฐานให้เน่า
//   ⇒ ไม่มีตัวกรองสถานะแบบทะเบียนอื่น (สถานะของแถวเป็นผลของวันที่ ไม่ใช่ของที่คนตั้ง)
//
// ⚠️ กระดิ่งถูกกวาดตอนโหลดข้อมูลนี้ (ระบบไม่มี cron) — ดู lib/service/renewalNotify.js
import { useMemo, useState } from "react";
import Link from "next/link";
import useStickyState from "@/lib/ui/useStickyState";
import { CalendarClock, CircleAlert, PhoneCall, RefreshCw, Search } from "lucide-react";
import StatusNotice from "@/components/ui/StatusNotice";
import { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Pager from "@/components/ui/Pager";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import RenewalFollowupModal from "@/components/salesPlanning/RenewalFollowupModal";
import DealCreateModal from "@/components/salesPlanning/DealCreateModal";
import useDealOwners from "@/lib/sales/useDealOwners";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtName, naText, NA } from "@/lib/format";
import { usePagination } from "@/lib/usePagination";
import { apiJson } from "@/lib/apiFetch";
import styles from "./RenewalsPanel.module.css";

export const EMPTY_RENEWAL_COUNTS = { expired: 0, dueIn30: 0, dueSoon: 0, following: 0 };

/* ป้ายวันหมดของแถว — โทนเดียวกับตัวเลขในตารางทั้งระบบ
   ⚠️ "หมดแล้ว" ต้องเด่นกว่า "ใกล้หมด" เสมอ: ของจริงคือเครื่องยังอยู่หน้างานโดยไม่มี
   สัญญาครอบ ซึ่งเป็นสถานะที่แย่ที่สุดในทะเบียนนี้ */
function dueCell(row) {
  const expired = row.state === "expired";
  return (
    <>
      <span className={expired ? "cell-num-bad" : undefined}>{fmtDate(row.endDate)}</span>
      <span className={`cell-sub ${expired ? "cell-num-bad" : ""}`.trim()}>
        {expired ? `เลยมาแล้ว ${Math.abs(row.daysLeft)} วัน` : `อีก ${row.daysLeft} วัน`}
      </span>
    </>
  );
}

/**
 * ⚠️ **ข้อมูลถูกโหลดที่หน้าแม่ ไม่ใช่ที่นี่** — เลขบนหัวแท็บ ("ต่อสัญญา 3") ต้องรู้
 * ตั้งแต่ยังไม่มีใครกดเข้าแท็บ · และการกวาดกระดิ่งจะได้เกิดทุกครั้งที่เปิดทะเบียนสัญญา
 * ไม่ใช่เฉพาะตอนกดแท็บ (ระบบไม่มี cron — ยิ่งกวาดบ่อยยิ่งมีคนรู้ตัวทัน)
 *
 * @param data     { rows, counts } จาก /api/sales-planning/renewals
 * @param reload   ให้หน้าแม่โหลดใหม่หลังบันทึกผล
 */
export default function RenewalsPanel({ data, loading = false, error = "", reload }) {
  const canEdit = useCan("salesplan:edit");
  /* 🪤 `data?.rows || []` เขียนสดในตัวแปรทำให้ได้ array ใหม่ทุกเรนเดอร์ ⇒ useMemo
     ข้างล่างคิดว่าเปลี่ยนตลอด (กับดักเดียวกับค่าตั้งต้น `EMPTY` ในทะเบียนใบสั่งขาย) */
  const rows = useMemo(() => data?.rows || [], [data]);
  const counts = data?.counts || EMPTY_RENEWAL_COUNTS;
  const [query, setQuery] = useStickyState("renewalQuery", "");
  const [busy, setBusy] = useState(false);
  const [followRow, setFollowRow] = useState(null);
  // ต่อสัญญา = เปิดฟอร์มสร้างดีลตัวเดิมของระบบ ไม่ใช่สร้างดีลเงียบ ๆ ให้เอง
  const [dealDefaults, setDealDefaults] = useState(null);
  const dealOwners = useDealOwners();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => [
      row.site?.name, row.site?.customerName, row.order?.orderNumber, row.deal?.title, row.deal?.ownerName,
    ].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [rows, query]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filtered, { resetKey: query });

  const saveFollowup = async (payload) => {
    setBusy(true);
    try {
      await apiJson("/api/sales-planning/renewals", {
        method: "POST", json: payload, fallbackError: "บันทึกผลการติดตามไม่สำเร็จ",
      });
      const row = followRow;
      setFollowRow(null);
      await reload?.();
      /* ต่อสัญญาแล้ว → เปิดฟอร์มสร้างดีลต่อทันที (RE-ORDER สายบริการ ลูกค้าเดิม)
         ⚠️ ไม่สร้างดีลให้เองที่ server — ดีลต้องมีเจ้าของ/มูลค่า/หมวด ซึ่งเป็นการ
         ตัดสินใจของคน และฟอร์มสร้างดีลของระบบมีด่านครบอยู่แล้ว (กฎ AGENTS.md:
         ฟอร์มเดียวใช้ทุกทาง ห้ามมีทางสร้างชุดที่สอง) */
      if (payload.status === "renewed" && row?.site?.customerId) {
        setDealDefaults({
          customerId: row.site.customerId,
          line: "SERVICE",
          dealType: "RE-ORDER",
          title: `${row.site.customerName || row.site.name} — ต่อสัญญาบริการ`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <StatusNotice tone="error" title="โหลดทะเบียนต่อสัญญาไม่สำเร็จ">{error}</StatusNotice>}

      <SaMetricStrip>
        <SaMetric icon={<CircleAlert />} label="หมดแล้ว" value={counts.expired}
          note="ยังไม่มีใครปิดเรื่อง" tone={counts.expired ? "danger" : "good"} />
        <SaMetric icon={<CalendarClock />} label="หมดใน 30 วัน" value={counts.dueIn30}
          note="ต้องคุยลูกค้าสัปดาห์นี้" tone={counts.dueIn30 ? "warning" : "good"} />
        <SaMetric icon={<CalendarClock />} label="หมดใน 90 วัน" value={counts.dueSoon} note="ทั้งหน้าต่างเตือน" />
        <SaMetric icon={<PhoneCall />} label="กำลังติดตาม" value={counts.following} note="มีคนรับเรื่องแล้ว" tone="good" />
      </SaMetricStrip>

      <SaSection
        icon={<RefreshCw size={17} />}
        title="ไซต์ที่ต้องตาม"
        subtitle="รอบบริการใกล้หมดหรือหมดแล้ว — เรียงตามวันหมดเสมอ หมดแล้วขึ้นก่อน"
        actions={<span className="ui-badge">{filtered.length} ไซต์</span>}
      >
        <div className="toolbar">
          <div className={`search-glass ${styles.search}`}>
            <Search size={16} color="var(--text-3)" />
            <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาไซต์ / ลูกค้า / เลข SO / ดีล / AE" />
          </div>
        </div>

        <TableScroll surface="embedded" cells="stacked" minWidth={880} aria-busy={loading}>
          <table className="w-full text-sm">
            <thead><tr>
              <th>ไซต์ / ลูกค้า</th>
              <th>ใบสั่งขาย · ดีล</th>
              <th>ผู้ดูแล (AE)</th>
              <th className="num">รอบหมด</th>
              <th>การติดตาม</th>
              <th aria-label="การกระทำ" />
            </tr></thead>
            <tbody>
              {/* ⚠️ แถวนี้ **ไม่ใช่** DetailRow (เปลี่ยน 2026-09-02) — DetailRow คือแถวที่พาไป
                  ปลายทางเดียว และทางเข้าจริงของมันคือลิงก์ในเซลล์ที่ href ตรงกับของแถว
                  แถวนี้ไม่มีปลายทางแบบนั้น: **แถวหมายถึงไซต์** ส่วนลิงก์ข้างในไปที่ *ใบ SO*
                  ซึ่งคนละของกัน · ของเดิมเรียก DetailRow โดยไม่ส่ง href เลย ⇒ ได้
                  `cursor: pointer` ที่โกหก (ชี้แล้วเป็นมือ กดแล้วไม่ไปไหน) และตั้งแต่มีด่าน
                  ROW_MIRROR ก็ถูกฟ้องทันที · `.premium-row` มีสไตล์ครบของตัวเอง หน้าตาไม่ขยับ */}
              {pageRows.map((row) => (
                <tr key={row.siteId} className="premium-row">
                  <td>
                    {naText(row.site?.name)}
                    <span className="cell-sub">{naText(row.site?.customerName)}</span>
                  </td>
                  <td>
                    {row.order
                      ? <Link prefetch={false} href={`/sa/sales-orders/${row.order.id}`} className="linklike mono">{row.order.orderNumber}</Link>
                      : NA}
                    <span className="cell-sub cell-ellipsis">{naText(row.deal?.title)}</span>
                  </td>
                  <td>{row.deal?.ownerName ? fmtName(row.deal.ownerName) : NA}</td>
                  <td className="num mono">{dueCell(row)}</td>
                  <td>
                    {row.followup ? (
                      <>
                        <span className="ui-badge">กำลังติดตาม</span>
                        <span className="cell-sub">
                          {row.followup.nextContactOn ? `นัดอีกครั้ง ${fmtDate(row.followup.nextContactOn)}` : "ยังไม่ได้นัดครั้งหน้า"}
                        </span>
                      </>
                    ) : (
                      <span className="cell-num-idle">ยังไม่มีใครรับเรื่อง</span>
                    )}
                  </td>
                  {/* กติกาเปลือก: ปุ่มโชว์เสมอ ติดด่านค่อยบอกเหตุตอนชี้/กด
                      (คนดูอย่างเดียวต้องเห็นว่ามีปุ่มนี้อยู่ ไม่ใช่หาไม่เจอ) */}
                  <td>
                    <Button
                      tone="neutral" size="sm"
                      disabled={!canEdit}
                      title={canEdit ? undefined : "บันทึกผลการติดตามได้เฉพาะฝ่ายขาย"}
                      onClick={() => setFollowRow(row)}
                      icon={<PhoneCall size={15} aria-hidden="true" />}
                    >
                      บันทึกผล
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && !loading && (
                <TableEmpty
                  colSpan={6}
                  title="ยังไม่มีไซต์ที่ใกล้หมดรอบ"
                  description="ไซต์จะขึ้นที่นี่เมื่อรอบขายของโซนเหลืออายุไม่ถึง 90 วัน หรือหมดไปแล้วโดยยังไม่มีใครปิดเรื่อง"
                />
              )}
            </tbody>
          </table>
        </TableScroll>

        {filtered.length > 0 && (
          <Pager page={page} pageCount={pageCount} total={total} onPage={setPage}
            pageSize={pageSize} onPageSize={setPageSize} />
        )}
      </SaSection>

      <RenewalFollowupModal
        open={!!followRow}
        row={followRow}
        canEdit={canEdit}
        busy={busy}
        onClose={() => setFollowRow(null)}
        onSave={saveFollowup}
      />

      {/* mount ตอนจะเปิดเท่านั้น — ค่าตั้งต้นถูกอ่านตอน mount ครั้งเดียว (ดูคำเตือนในไฟล์นั้น) */}
      {dealDefaults && (
        <DealCreateModal
          owners={dealOwners.owners}
          defaultOwnerId={dealOwners.defaultOwnerId}
          lockedOwner={dealOwners.lockedOwner}
          defaults={dealDefaults}
          onClose={() => setDealDefaults(null)}
        />
      )}
    </>
  );
}
