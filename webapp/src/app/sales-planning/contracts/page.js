"use client";

// ทะเบียนสัญญา (/sa/contracts — mig 0278)
//
// ⭐ หน้านี้ตอบคำถามเดียวที่ฝ่ายขายถามจริง: **ใบไหนค้างอยู่ที่ขั้นไหน**
//    ⇒ ไม่มีปุ่ม "สร้างสัญญา" ลอย ๆ ที่นี่ เพราะสัญญาเกิดจากดีลเสมอ (และต้องมี
//    ใบเสนอราคาที่อนุมัติแล้ว) — ทางสร้างอยู่ที่หน้าดีลกับหน้าใบเสนอราคา
//    ปุ่มที่กดแล้วต้องมาเลือกดีลอีกทีคือทางอ้อมที่ยาวกว่าเดิม
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, FileSignature, Flag, Search, ShieldCheck } from "lucide-react";
import AccessDenied from "@/components/ui/AccessDenied";
import StatusNotice from "@/components/ui/StatusNotice";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import FilterPopover from "@/components/ui/FilterPopover";
import Pager from "@/components/ui/Pager";
import styles from "./page.module.css";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import { useCan } from "@/lib/roleContext";
import { fmtDate, naText, NA } from "@/lib/format";
import { usePagination } from "@/lib/usePagination";
import { contractKindBadge, contractStatusBadge } from "@/components/salesPlanning/ui";
import {
  CONTRACT_KINDS, CONTRACT_KIND_LABELS, CONTRACT_STATUSES, CONTRACT_STATUS_LABELS,
  daysAwaitingSignature,
} from "@/lib/sales/contracts";

export default function ContractsPage() {
  const canView = useCan("salesplan:view");
  const params = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState([]);
  const [kindFilter, setKindFilter] = useState([]);
  // ?waiting=1 มาจากลิงก์บนหน้าอื่น (การ์ดคิว) — ตัวกรองที่ "ติดมาจากลิงก์" ต้องมีปุ่มล้าง
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(params.get("waiting") === "1");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-planning/contracts");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "โหลดทะเบียนสัญญาไม่สำเร็จ");
      setRows(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (waitingOnMeOnly && !row._waitingOnMe) return false;
      if (statusFilter.length && !statusFilter.includes(row.status)) return false;
      if (kindFilter.length && !kindFilter.includes(row.kind)) return false;
      if (!q) return true;
      return [row.contractNo, row.customerName, row.deal?.title, row.ownerName]
        .some((value) => (value || "").toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, kindFilter, waitingOnMeOnly]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } = usePagination(filtered, {
    resetKey: `${query}|${statusFilter.join()}|${kindFilter.join()}|${waitingOnMeOnly}`,
  });

  const summary = useMemo(() => ({
    total: rows.length,
    awaiting: rows.filter((row) => row.status === "awaiting_signature").length,
    signed: rows.filter((row) => row.status === "signed").length,
    // ค้างเกิน 14 วัน = ตัวเลขที่ทำให้ต้องโทรตาม ไม่ใช่แค่จำนวนใบ
    overdue: rows.filter((row) => (daysAwaitingSignature(row) ?? 0) > 14).length,
  }), [rows]);

  if (!canView) {
    return <AccessDenied icon={<FileSignature size={22} />} title="สัญญา" message="บัญชีนี้ยังไม่มีสิทธิ์อ่านเอกสารของสายขาย" back="/home" />;
  }

  return (
    <SaWorkspace
      icon={<FileSignature size={22} />}
      title="บริหารงานขาย — สัญญา"
      subtitle="ออกได้หลังใบเสนอราคาอนุมัติ · พิมพ์ไปเซ็นแล้วอัปโหลดฉบับลงนามกลับเข้าใบ"
    >
      <div className="flex flex-col gap-4">
        {error && <StatusNotice tone="error" title="โหลดทะเบียนสัญญาไม่สำเร็จ">{error}</StatusNotice>}

        <SaMetricStrip>
          <SaMetric icon={<FileSignature />} label="ทั้งหมด" value={summary.total} note="สัญญาในขอบเขตที่มองเห็น" />
          <SaMetric icon={<Clock3 />} label="รอลงนาม" value={summary.awaiting} note="ออกเลขแล้ว รอฉบับเซ็นกลับ" tone={summary.awaiting ? "warning" : "good"} />
          <SaMetric icon={<ShieldCheck />} label="ค้างเกิน 14 วัน" value={summary.overdue} note="ใบที่ควรโทรตาม" tone={summary.overdue ? "warning" : "good"} />
          <SaMetric icon={<CheckCircle2 />} label="ลงนามแล้ว" value={summary.signed} note="มีไฟล์ฉบับเซ็นครบ" tone="good" />
        </SaMetricStrip>

        <SaSection
          icon={<FileSignature size={17} />}
          title="ทะเบียนสัญญา"
          subtitle="ค้นหาและเปิดใบเพื่อพิมพ์ ลงนาม หรือติดตาม"
          actions={<span className="ui-badge">{filtered.length} ใบ</span>}
        >
          <div className="toolbar">
            <div className={`search-glass ${styles.search}`}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขที่สัญญา / ลูกค้า / ดีล" aria-label="ค้นหาสัญญา" />
            </div>
            {waitingOnMeOnly && (
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>กรอง: รอฉันลงมือ ×</Button>
            )}
            <FilterPopover
              count={statusFilter.length + kindFilter.length}
              onClear={() => { setStatusFilter([]); setKindFilter([]); }}
              groups={[
                {
                  key: "status", label: "สถานะ", icon: Flag,
                  options: CONTRACT_STATUSES.map((value) => ({ value, label: CONTRACT_STATUS_LABELS[value] })),
                  selected: statusFilter, onChange: setStatusFilter,
                },
                {
                  key: "kind", label: "ชนิดสัญญา", icon: FileSignature,
                  options: CONTRACT_KINDS.map((value) => ({ value, label: CONTRACT_KIND_LABELS[value] })),
                  selected: kindFilter, onChange: setKindFilter,
                },
              ]}
            />
          </div>

          <TableScroll surface="embedded" aria-busy={loading}><table className="w-full text-sm">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ลูกค้า / ดีล</th>
                  <th>ชนิด</th>
                  <th>วันที่สัญญา</th>
                  <th>สถานะ</th>
                  <th>ติดตาม</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const waiting = daysAwaitingSignature(row);
                  return (
                    <DetailRow key={row.id} href={`/sa/contracts/${row.id}`} className="premium-row">
                      <td>
                        <Link prefetch={false} href={`/sa/contracts/${row.id}`} className="linklike">
                          <strong className="mono">{row.contractNo || "ฉบับร่าง"}</strong>
                        </Link>
                      </td>
                      <td>
                        {naText(row.customerName)}
                        <span className={styles.subLine}>{naText(row.deal?.title)}</span>
                      </td>
                      <td>{contractKindBadge(row.kind, "ui-badge-cell ui-badge-w-contract")}</td>
                      <td className={styles.numberCell}>{fmtDate(row.contractDate)}</td>
                      <td>{contractStatusBadge(row.status, "ui-badge-cell ui-badge-w-doc")}</td>
                      <td className={`${styles.track}${waiting > 14 ? ` ${styles.trackLate}` : ""}`}>
                        {row.status === "signed" && row.signedDate ? `เซ็น ${fmtDate(row.signedDate)}` : null}
                        {row.status === "awaiting_signature" ? `รอมา ${waiting ?? 0} วัน` : null}
                        {row.status === "draft" ? "ยังไม่ออกเลข" : null}
                        {row.status === "cancelled" ? NA : null}
                      </td>
                    </DetailRow>
                  );
                })}
                {!filtered.length && !loading && (
                  <TableEmpty
                    colSpan={6}
                    title="ยังไม่มีสัญญา"
                    description="เปิดดีลที่ใบเสนอราคาอนุมัติแล้ว แล้วกด “ออกสัญญา” จากหน้าดีลหรือหน้าใบเสนอราคา"
                  />
                )}
              </tbody>
          </table></TableScroll>

          {filtered.length > 0 && (
            <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} pageSize={pageSize} onPageSize={setPageSize} />
          )}
        </SaSection>
      </div>
    </SaWorkspace>
  );
}
