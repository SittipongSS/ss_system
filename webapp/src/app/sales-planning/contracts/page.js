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
import { CheckCircle2, Clock3, FileInput, FileSignature, Flag, Plus, Search, ShieldCheck } from "lucide-react";
import AccessDenied from "@/components/ui/AccessDenied";
import StatusNotice from "@/components/ui/StatusNotice";
import SaWorkspace, { ListPanel, Metric as SaMetric, MetricStrip as SaMetricStrip } from "@/components/ui/Workspace";
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
import Tabs from "@/components/ui/Tabs";
import RenewalsPanel, { EMPTY_RENEWAL_COUNTS } from "@/components/salesPlanning/RenewalsPanel";
import { contractKindBadge, contractStatusBadge } from "@/components/salesPlanning/ui";
import { contractListTrack } from "@/lib/sales/contractListTrack";
import { apiFetch } from "@/lib/apiFetch";
import {
  CONTRACT_CARD_PICKS, CONTRACT_KINDS, CONTRACT_KIND_LABELS, CONTRACT_LIST_STATUSES, CONTRACT_SOURCES, CONTRACT_SOURCE_LABELS,
  CONTRACT_STATUS_LABELS, EMPTY_CONTRACT_FILTERS,
  contractPassesListFilters, contractPickActive, contractStatusLabel, isExternalContract, isSignatureLate,
  SIGNATURE_LATE_DAYS,
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
  /* ⭐ **ที่มาของใบเป็นคนละคำถามกับชนิดสัญญา** — ใบที่ระบบเจนกับใบที่ใช้ PO/อีเมล
     แทนสัญญา เดินคนละเส้น มีเอกสารคนละแบบ และตอบคำถาม "ใบไหนมีสัญญาจริง" ต่างกัน
     · ของเดิมสองแบบนี้หน้าตาเหมือนกันทั้งตาราง แยกไม่ออกจนต้องเปิดทีละใบ */
  const [sourceFilter, setSourceFilter] = useStickyState("sourceFilter", EMPTY);
  // ?waiting=1 มาจากลิงก์บนหน้าอื่น (การ์ดคิว) — ตัวกรองที่ "ติดมาจากลิงก์" ต้องมีปุ่มล้าง
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(params.get("waiting") === "1");
  /* ⭐ "ค้างเกิน n วัน" (ตรวจตัวเลข L2) — ตั้งจากการ์ดบนแถบ (หรือ ?late=1) · ไม่จำข้ามการเปิดหน้า (ทรงเดียวกับ "รอฉันลงมือ")
     ตัวตัดสินคือ `isSignatureLate` ตัวเดียวกับเลขบนการ์ด · ติดอยู่ = มีชิป "กรอง: … ×" ให้ถอด */
  const [lateOnly, setLateOnly] = useState(params.get("late") === "1");
  /* ⭐ เวลาอ้างอิงเดียวต่อการโหลด (ตรวจตัวเลข L2) — การ์ด · ตาราง · รางอ่านนาฬิกาตัวเดียวกัน
     🐞 เดิมการ์ดใช้เวลาตอนโหลด ส่วนตารางอ่าน `new Date()` ใหม่ทุกครั้งที่กด ⇒ ใบที่ข้ามเกณฑ์ระหว่างเปิดหน้าค้างไว้
        ขึ้นในตาราง (และรางแดง) แต่การ์ดไม่นับ · โหลดใหม่ = ขยับเวลาอ้างอิงไปพร้อมแถว */
  const [asOf, setAsOf] = useState(() => new Date());
  const router = useRouter();
  // ของค้างของคนที่กำลังดูอยู่ — ธงจาก server (ตัวเดียวกับตัวกรองและป้ายเลขบนเมนู)
  const workQueue = useMemo(() => rows.filter((row) => row._waitingOnMe), [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/sales-planning/contracts");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "โหลดทะเบียนสัญญาไม่สำเร็จ");
      setRows(Array.isArray(data) ? data : []);
      setAsOf(new Date());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  /* ตัวตัดสินของตาราง = `contractPassesListFilters` (lib/sales/contracts) — ตัวเดียวกับที่เทสต์ใช้พิสูจน์ว่า
     แถวหลังกดการ์ด "ค้างเกิน n วัน" = เลขบนการ์ด · ห้ามเขียนเงื่อนไขกรองซ้ำในหน้า */
  const filtered = useMemo(() => {
    const filters = {
      query, status: statusFilter, kind: kindFilter, source: sourceFilter,
      waitingOnMe: waitingOnMeOnly, late: lateOnly,
    };
    return rows.filter((row) => contractPassesListFilters(row, filters, { now: asOf }));
  }, [rows, asOf, query, statusFilter, kindFilter, sourceFilter, waitingOnMeOnly, lateOnly]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } = usePagination(filtered, {
    resetKey: `${query}|${statusFilter.join()}|${kindFilter.join()}|${sourceFilter.join()}|${waitingOnMeOnly}|${lateOnly}`,
  });

  const summary = useMemo(() => ({
    total: rows.length,
    awaiting: rows.filter((row) => row.status === "awaiting_signature").length,
    signed: rows.filter((row) => row.status === "signed").length,
    // ค้างเกินเกณฑ์ = ตัวเลขที่ทำให้ต้องโทรตาม ไม่ใช่แค่จำนวนใบ (เกณฑ์ + ตัวตัดสินอยู่ที่ lib/sales/contracts)
    overdue: rows.filter((row) => isSignatureLate(row, asOf)).length,
  }), [rows, asOf]);

  /* การ์ดบนแถบ = ตัวกรองชุดใหม่ **ทั้งชุด** (`CONTRACT_CARD_PICKS` · ล้างคำค้น/สถานะ/ชนิด/ที่มา/"รอฉันลงมือ" · ตรวจตัวเลข L2)
     ⇒ ตารางเหลือเท่าเลขบนการ์ดพอดี · กดการ์ดที่ใช้อยู่ซ้ำ = ล้างตัวกรองทั้งชุด */
  const applyContractPick = (pick) => {
    setQuery(pick.query); setStatusFilter([...pick.status]); setKindFilter([...pick.kind]); setSourceFilter([...pick.source]);
    setWaitingOnMeOnly(pick.waitingOnMe); setLateOnly(pick.late);
  };
  const activeFilters = {
    query, status: statusFilter, kind: kindFilter, source: sourceFilter, waitingOnMe: waitingOnMeOnly, late: lateOnly,
  };
  const cardActive = (key) => contractPickActive(activeFilters, CONTRACT_CARD_PICKS[key]);
  const pickCard = (key) => applyContractPick(cardActive(key) ? EMPTY_CONTRACT_FILTERS : CONTRACT_CARD_PICKS[key]);

  /* ── แท็บ: ทะเบียนเอกสาร | ต่อสัญญา (มติผู้ใช้ 2026-08-31) ────────────────
     ⭐ **สองแท็บคนละ entity โดยตั้งใจ** — ทะเบียนคือ *เอกสารสัญญา* (`sales_contracts`)
     ส่วนต่อสัญญาคือ *ไซต์* ที่คำนวณจากวันหมดของรอบขาย (`service_zone_terms`)
     ⇒ ยุบเป็นตารางเดียวไม่ได้: ไซต์ที่ยังไม่เคยผูกสัญญาก็ต้องขึ้นแท็บต่อสัญญา
     ⚠️ กติกา UI: สลับ "หน้า/มุมมองคนละชุดข้อมูล" = Tabs · กรองในชุดเดิม = segmented
     ⚠️ แท็บอยู่ใน URL (?tab=) เพื่อให้กระดิ่งลิงก์ตรงเข้าแท็บได้ และปุ่ม back ทำงาน */
  const urlTab = params.get("tab") === "renewals" ? "renewals" : "contracts";
  const [tab, setTab] = useState(urlTab);
  useEffect(() => { setTab(urlTab); }, [urlTab]);
  /* ⭐ โหลดข้อมูลต่อสัญญาที่หน้านี้ **ตั้งแต่เปิดทะเบียน** ไม่ใช่ตอนกดเข้าแท็บ:
       1. เลขบนหัวแท็บ ("ต่อสัญญา 3") ต้องรู้ก่อนกด ไม่งั้นไม่มีใครรู้ว่ามีงานค้าง
       2. การกวาดกระดิ่งอยู่ใน GET ตัวนี้ (ระบบไม่มี cron) ⇒ ยิ่งกวาดบ่อย คนยิ่งรู้ตัวทัน
     ⚠️ ผิดพลาดที่แท็บนี้ต้องไม่ทำให้ทะเบียนสัญญาพัง — เก็บ error แยกคนละตัว */
  const [renewals, setRenewals] = useState({ rows: [], counts: EMPTY_RENEWAL_COUNTS });
  const [renewalsLoading, setRenewalsLoading] = useState(true);
  const [renewalsError, setRenewalsError] = useState("");
  const loadRenewals = useCallback(async () => {
    setRenewalsLoading(true);
    setRenewalsError("");
    try {
      const res = await apiFetch("/api/sales-planning/renewals");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "โหลดทะเบียนต่อสัญญาไม่สำเร็จ");
      setRenewals({ rows: body.rows || [], counts: body.counts || EMPTY_RENEWAL_COUNTS });
    } catch (e) {
      setRenewalsError(e.message || "โหลดทะเบียนต่อสัญญาไม่สำเร็จ");
    } finally {
      setRenewalsLoading(false);
    }
  }, []);
  useEffect(() => { loadRenewals(); }, [loadRenewals]);
  // ป้ายบนแท็บนับเฉพาะ **ของด่วน** (หมดแล้ว + หมดใน 30 วัน) ไม่ใช่ทั้งหน้าต่าง 90 วัน
  const renewalBadge = renewals.counts.expired + renewals.counts.dueIn30;

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
      headerRight={canEdit && tab === "contracts" && (
        <Button tone="accent" onClick={() => setCreateOpen(true)}>
          <Plus size={15} aria-hidden="true" /> สร้างสัญญา
        </Button>
      )}
    >
      <div className="flex flex-col gap-4">
        <Tabs
          value={tab}
          onChange={(next) => {
            setTab(next);
            // เขียนลง URL ด้วย (ไม่ push history ทุกครั้ง — สลับแท็บไม่ใช่การเดินทาง)
            router.replace(next === "renewals" ? "/sa/contracts?tab=renewals" : "/sa/contracts", { scroll: false });
          }}
          ariaLabel="มุมมองของงานสัญญา"
          tabs={[
            { key: "contracts", label: "ทะเบียนสัญญา" },
            { key: "renewals", label: renewalBadge ? `ต่อสัญญา ${renewalBadge}` : "ต่อสัญญา" },
          ]}
        />

        {tab === "renewals" && (
          <RenewalsPanel data={renewals} loading={renewalsLoading} error={renewalsError} reload={loadRenewals} />
        )}

        {tab === "contracts" && <>
        <SaMetricStrip>
          {/* ⭐ การ์ดทั้งสี่เป็นปุ่มตัวกรอง (ตรวจตัวเลข L2) — กด = ตารางเหลือเท่าเลขบนการ์ด · "ค้างเกิน n วัน" = ใบรอลงนามที่เกินเกณฑ์ */}
          <SaMetric
            as="button" type="button" icon={<FileSignature />} label="ทั้งหมด" value={summary.total} note="สัญญาในขอบเขตที่มองเห็น"
            active={cardActive("total")} aria-pressed={cardActive("total")} onClick={() => pickCard("total")}
          />
          <SaMetric
            as="button" type="button" icon={<Clock3 />} label="รอลงนาม" value={summary.awaiting} note="ออกเลขแล้ว รอฉบับเซ็นกลับ"
            tone={summary.awaiting ? "warning" : "good"}
            active={cardActive("awaiting")} aria-pressed={cardActive("awaiting")} onClick={() => pickCard("awaiting")}
          />
          <SaMetric
            as="button" type="button" icon={<ShieldCheck />} label={`ค้างเกิน ${SIGNATURE_LATE_DAYS} วัน`} value={summary.overdue}
            note="ใบรอลงนามที่ควรโทรตาม" tone={summary.overdue ? "warning" : "good"}
            active={cardActive("late")} aria-pressed={cardActive("late")} onClick={() => pickCard("late")}
          />
          <SaMetric
            as="button" type="button" icon={<CheckCircle2 />} label="ลงนามแล้ว" value={summary.signed} note="มีไฟล์ฉบับเซ็นครบ" tone="good"
            active={cardActive("signed")} aria-pressed={cardActive("signed")} onClick={() => pickCard("signed")}
          />
        </SaMetricStrip>

        {/* ⭐ ของค้างขึ้นหัวตาราง — ทรงเดียวกับทะเบียนใบเสนอราคา/ใบสั่งขาย/ลูกค้า/สินค้า
            (มติผู้ใช้ 2026-08-25) ของเดิมมีแต่ตัวกรอง "ที่ต้องทำ" ที่ต้องกดเอง
            ⚠️ **คำบนการ์ดไม่ใช่ "รออนุมัติ"** — สัญญาไม่มีขั้นอนุมัติ (draft →
            awaiting_signature → signed) ⇒ ของที่ค้างคือ "ร่างที่ยังไม่ออกเลข" กับ
            "ออกแล้วรอลายเซ็น" ซึ่งเป็นงานของเจ้าของใบ ไม่ใช่ของผู้อนุมัติคนอื่น
            ⚠️ ใช้ธง `_waitingOnMe` ตัวเดียวกับตัวกรองและป้ายเลขบนเมนู — ห้ามนิยามที่สอง */}
        <ApprovalQueue
          items={workQueue}
          unit="ใบ"
          title="ต้องทำตอนนี้ — สัญญาที่ค้างอยู่กับคุณ"
          primary={(row) => row.contractNo || "ฉบับร่าง"}
          secondary={(row) => `${naText(row.customerName)} · ${contractStatusLabel(row.status)}`}
          rowHref={(row) => `/sa/contracts/${row.id}`}
          renderAction={(row) => (
            <Button as={Link} href={`/sa/contracts/${row.id}`} tone="primary" size="sm">เปิดสัญญา</Button>
          )}
        />

        {/* แผงรายการ (มติผู้ใช้ 2026-09-15 · UI_DESIGN_SYSTEM.md §รายการ) — ป้ายจำนวน = ใบที่เหลือ
            หลังค้นหา/กรองทุกหน้า (เท่ายอดของ Pager) · เครื่องมือส่งเป็น fragment เข้า `toolbar` */}
        <ListPanel
          icon={<FileSignature size={17} aria-hidden="true" />}
          title="ทะเบียนสัญญา"
          subtitle="ค้นหาและเปิดใบเพื่อพิมพ์ ลงนาม หรือติดตาม"
          count={`${filtered.length} ใบ`}
          toolbar={(
          <>
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขที่สัญญา / เลขอ้างอิง / ลูกค้า / ดีล" aria-label="ค้นหาสัญญา" />
            </div>
            {waitingOnMeOnly && (
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>กรอง: รอฉันลงมือ ×</Button>
            )}
            {lateOnly && (
              <Button size="sm" onClick={() => setLateOnly(false)}>กรอง: รอลงนามเกิน {SIGNATURE_LATE_DAYS} วัน ×</Button>
            )}
            <FilterPopover
              count={statusFilter.length + kindFilter.length + sourceFilter.length}
              onClear={() => { setStatusFilter([]); setKindFilter([]); setSourceFilter([]); setLateOnly(false); }}
              groups={[
                {
                  key: "status", label: "สถานะ", icon: Flag,
                  /* ⚠️ ใช้ชุดของ *ทะเบียน* ไม่ใช่ชุดสถานะทั้งหมด — ดูเหตุผลที่ contracts.js */
                  options: CONTRACT_LIST_STATUSES.map((value) => ({ value, label: CONTRACT_STATUS_LABELS[value] })),
                  selected: statusFilter, onChange: setStatusFilter,
                },
                {
                  key: "kind", label: "ชนิดสัญญา", icon: FileSignature,
                  options: CONTRACT_KINDS.map((value) => ({ value, label: CONTRACT_KIND_LABELS[value] })),
                  selected: kindFilter, onChange: setKindFilter,
                },
                {
                  key: "source", label: "ที่มา", icon: FileInput,
                  options: CONTRACT_SOURCES.map((value) => ({ value, label: CONTRACT_SOURCE_LABELS[value] })),
                  selected: sourceFilter, onChange: setSourceFilter,
                },
              ]}
            />
          </>
          )}
        >
          {/* โหลดรายการไม่สำเร็จ = ข้อความในเนื้อแผงพร้อมทางลองใหม่ (ท่าเดียวกับทะเบียนใบเสนอราคา) */}
          {error && (
            <StatusNotice
              tone="error"
              className="mb-4"
              title="โหลดทะเบียนสัญญาไม่สำเร็จ"
              action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}
            >
              {error}
            </StatusNotice>
          )}

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
                  const track = contractListTrack(row, { now: asOf });
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
                      <td>
                        {contractKindBadge(row.kind, "ui-badge-cell ui-badge-w-contract")}
                        {/* ที่มาอยู่ใต้ชนิด ไม่ใช่คอลัมน์ของตัวเอง — ตารางนี้กว้างเต็มแล้ว
                            และสองค่านี้อ่านคู่กันเสมอ ("สัญญาอะไร · เนื้อมาจากไหน") */}
                        {isExternalContract(row)
                          ? <span className={styles.subLine}>{CONTRACT_SOURCE_LABELS.external}</span>
                          : null}
                      </td>
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
        </ListPanel>
        </>}
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
