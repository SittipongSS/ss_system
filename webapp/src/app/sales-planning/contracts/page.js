"use client";

// ทะเบียนสัญญา (/sa/contracts — mig 0278)
//
// ⭐ หน้านี้ตอบคำถามเดียวที่ฝ่ายขายถามจริง: **ใบไหนค้างอยู่ที่ขั้นไหน**
//
// ⚠️ **คอมเมนต์เดิมตรงนี้ล้าไปแล้ว — เก็บเหตุผลไว้เพราะยังใช้ได้ แต่ข้อสรุปเปลี่ยน**
//    เดิมเขียนว่า "ไม่มีปุ่มสร้างสัญญาที่นี่ เพราะสัญญาเกิดจากดีลเสมอ · ปุ่มที่กดแล้ว
//    ต้องมาเลือกดีลอีกทีคือทางอ้อมที่ยาวกว่าเดิม" · #1373 ใส่ปุ่มสร้างบนหัวทะเบียนแล้ว
//    และ #1377 ทำให้โมดัลถามเรียง ลูกค้า → ชนิด → ดีล ⇒ "ทางอ้อม" ที่กลัวไว้ถูกแก้ที่
//    ตัวโมดัลแทนที่จะแก้ด้วยการไม่มีปุ่ม
//
// ⭐ **ทางสร้างมีหลายทางโดยตั้งใจ** — หน้าดีล · หน้าใบเสนอราคา · หน้าโครงการ ·
//    หัวทะเบียนนี้ · ทุกทางเรียก `ContractCreateModal` ตัวเดียวกัน ต่างกันแค่ว่ารู้ดีล
//    มาแล้วหรือยัง (prop `dealId` / `dealIds`) ⇒ ไม่มีฟอร์มชุดที่สองให้ดูแล
import { useCallback, useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, FileSignature, Flag, Plus, Search, ShieldCheck } from "lucide-react";
import AccessDenied from "@/components/ui/AccessDenied";
import StatusNotice from "@/components/ui/StatusNotice";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import FilterPopover from "@/components/ui/FilterPopover";
import ApprovalQueue from "@/components/ui/ApprovalQueue";
import Pager from "@/components/ui/Pager";
import styles from "./page.module.css";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import { useCan } from "@/lib/roleContext";
import { fmtDate, naText } from "@/lib/format";
import { usePagination } from "@/lib/usePagination";
import StepTrack from "@/components/ui/StepTrack";
import ContractCreateModal from "@/components/salesPlanning/ContractCreateModal";
import { contractKindBadge, contractStatusBadge } from "@/components/salesPlanning/ui";
import { contractListTrack } from "@/lib/sales/contractListTrack";
import {
  CONTRACT_KINDS, CONTRACT_KIND_LABELS, CONTRACT_STATUSES, CONTRACT_STATUS_LABELS,
  daysAwaitingSignature, contractStatusLabel,
} from "@/lib/sales/contracts";

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

export default function ContractsPage() {
  const canView = useCan("salesplan:view");
  const canEdit = useCan("salesplan:edit");
  const params = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useStickyState("query", "");
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useStickyState("statusFilter", EMPTY);
  const [kindFilter, setKindFilter] = useStickyState("kindFilter", EMPTY);
  // ?waiting=1 มาจากลิงก์บนหน้าอื่น (การ์ดคิว) — ตัวกรองที่ "ติดมาจากลิงก์" ต้องมีปุ่มล้าง
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(params.get("waiting") === "1");
  const router = useRouter();
  // ของค้างของคนที่กำลังดูอยู่ — ธงจาก server (ตัวเดียวกับตัวกรองและป้ายเลขบนเมนู)
  const workQueue = useMemo(() => rows.filter((row) => row._waitingOnMe), [rows]);

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
      /* ⚠️ ไม่มีชื่อระบบนำหน้า — เหตุผลเดียวกับหน้าใบเสนอราคา (มติ 2026-08-22):
         เอกสารร่วมถูกเปิดใต้เปลือกของหลายฝ่าย ชื่อระบบเป็นหน้าที่ของเปลือก */
      title="สัญญา"
      subtitle="ออกได้หลังใบเสนอราคาอนุมัติ · พิมพ์ไปเซ็นแล้วอัปโหลดฉบับลงนามกลับเข้าใบ"
      /* ⭐ ปุ่มสร้างบนหัวทะเบียน (มติผู้ใช้ 2026-08-22) — เดิมสร้างได้จากในดีล/ใบเสนอราคา
         เท่านั้น คนที่เริ่มจากเมนูสัญญาไม่มีทางเริ่มงาน · โมดัลตัวเดียวกัน แค่มีช่องเลือกดีล */
      headerRight={canEdit && (
        <Button variant="accent" onClick={() => setCreateOpen(true)}>
          <Plus size={15} aria-hidden="true" /> สร้างสัญญา
        </Button>
      )}
    >
      <div className="flex flex-col gap-4">
        {error && <StatusNotice tone="error" title="โหลดทะเบียนสัญญาไม่สำเร็จ">{error}</StatusNotice>}

        <SaMetricStrip>
          <SaMetric icon={<FileSignature />} label="ทั้งหมด" value={summary.total} note="สัญญาในขอบเขตที่มองเห็น" />
          <SaMetric icon={<Clock3 />} label="รอลงนาม" value={summary.awaiting} note="ออกเลขแล้ว รอฉบับเซ็นกลับ" tone={summary.awaiting ? "warning" : "good"} />
          <SaMetric icon={<ShieldCheck />} label="ค้างเกิน 14 วัน" value={summary.overdue} note="ใบที่ควรโทรตาม" tone={summary.overdue ? "warning" : "good"} />
          <SaMetric icon={<CheckCircle2 />} label="ลงนามแล้ว" value={summary.signed} note="มีไฟล์ฉบับเซ็นครบ" tone="good" />
        </SaMetricStrip>

        {/* ⭐ ของค้างขึ้นหัวตาราง — ทรงเดียวกับทะเบียนใบเสนอราคา/ใบสั่งขาย/ลูกค้า/สินค้า
            (มติผู้ใช้ 2026-08-25) ของเดิมมีแต่ตัวกรอง "ที่ต้องทำ" ที่ต้องกดเอง
            ⚠️ **คำบนการ์ดไม่ใช่ "รออนุมัติ"** — สัญญาไม่มีขั้นอนุมัติ (draft →
            awaiting_signature → signed) ⇒ ของที่ค้างคือ "ร่างที่ยังไม่ออกเลข" กับ
            "ออกแล้วรอลายเซ็น" ซึ่งเป็นงานของเจ้าของใบ ไม่ใช่ของผู้อนุมัติคนอื่น
            ⚠️ ใช้ธง `_waitingOnMe` ตัวเดียวกับตัวกรองและป้ายเลขบนเมนู — ห้ามนิยามที่สอง */}
        <ApprovalQueue
          items={workQueue}
          title="ต้องทำตอนนี้ — สัญญาที่ค้างอยู่กับคุณ"
          primary={(row) => row.contractNo || "ฉบับร่าง"}
          secondary={(row) => `${naText(row.customerName)} · ${contractStatusLabel(row.status)}`}
          onOpen={(row) => router.push(`/sa/contracts/${row.id}`)}
          renderAction={(row) => (
            <Button as={Link} href={`/sa/contracts/${row.id}`} tone="primary" size="sm">เปิดสัญญา</Button>
          )}
        />

        <SaSection
          icon={<FileSignature size={17} />}
          title="ทะเบียนสัญญา"
          subtitle="ค้นหาและเปิดใบเพื่อพิมพ์ ลงนาม หรือติดตาม"
          actions={<span className="ui-badge">{filtered.length} ใบ</span>}
        >
          <div className="toolbar">
            <div className={`search-glass ${styles.search}`}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขที่สัญญา / ลูกค้า / ดีล" aria-label="ค้นหาสัญญา" />
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
                  <th>ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const track = contractListTrack(row);
                  return (
                    <DetailRow key={row.id} href={`/sa/contracts/${row.id}`} className="premium-row">
                      <td>
                        <Link prefetch={false} href={`/sa/contracts/${row.id}`} className="linklike">
                          <strong className="mono">{row.contractNo || "ฉบับร่าง"}</strong>
                        </Link>
                        {/* ทะเบียนโชว์เฉพาะฉบับล่าสุดของแต่ละสาย — บอกให้รู้ว่าใบนี้เป็นฉบับที่เท่าไร */}
                        {row.revisionNo > 0 && <span className={styles.subLine}>ฉบับแก้ไข R{row.revisionNo}</span>}
                      </td>
                      <td>
                        {naText(row.customerName)}
                        <span className={styles.subLine}>{naText(row.deal?.title)}</span>
                      </td>
                      <td>{contractKindBadge(row.kind, "ui-badge-cell ui-badge-w-contract")}</td>
                      <td className={styles.numberCell}>{fmtDate(row.contractDate)}</td>
                      <td>{contractStatusBadge(row.status, "ui-badge-cell ui-badge-w-doc")}</td>
                      <td className={styles.track}>
                        {/* ⭐ รางสามขั้น (มติผู้ใช้ 2026-08-22) — ภาษาเดียวกับการ์ดจัดการในหน้าใบ
                            · ใบที่ตายแล้ว (ยกเลิก/ถูกแทน) ไม่มีรางให้เดิน โชว์เหตุเป็นข้อความแทน
                            · รางขึ้นทุกความกว้างเหมือนตาราง SO — เลื่อนแนวนอนดีกว่าข้อมูลหาย */}
                        {track.closed ? (
                          <span className={styles.trackDead}>
                            {row.status === "revised" ? "ถูกแทนด้วยฉบับแก้ไข" : naText(row.cancelReason) }
                          </span>
                        ) : (
                          <StepTrack steps={track.steps} ariaLabel="ความคืบหน้าของสัญญา" />
                        )}
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

      {/* โมดัลตัวเดียวกับที่หน้าดีล/ใบเสนอราคาใช้ — ไม่ระบุดีลมา = โมดัลมีช่องเลือกดีลให้ */}
      <ContractCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />
    </SaWorkspace>
  );
}
