"use client";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";

// หน้ารวมใบเสนอราคา (/sa/quotations — เฟส D, มติผู้ใช้: เมนูแยกเพื่อง่ายต่อการค้นหา)
// ทุกใบยังผูก โครงการ›ดีล เสมอ — สร้างใหม่ต้องเลือกดีลก่อน แล้วไปแก้ต่อที่หน้า editor.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, CircleDollarSign, Clock3, FileText, Flag, Handshake, Pencil, Plus, Search, Printer, Trash2, User } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import FilterPopover from "@/components/ui/FilterPopover";
import ApprovalQueue from "@/components/ui/ApprovalQueue";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import StatusNotice from "@/components/ui/StatusNotice";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { QUOTE_STATUS_LABELS, dealTypeBadge, quoteStatusBadge } from "@/components/salesPlanning/ui";
import { DEAL_TYPES, DEAL_TYPE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { openQuotePrintWindowPreferIssued, prepareQuotePrintWindow, showQuotePrintError } from "@/lib/sales/quotePrint";
import { quotesAwaitingSalesOrder } from "@/lib/sales/handoffQueue";
import { isEditableQuotation } from "@/lib/sales/quotationWorkflow";
import { allBucketsCollapsed, bucketList, toggleBucketKey } from "@/lib/listGrouping";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import { apiFetch } from "@/lib/apiFetch";

// ป้ายสถานะใช้ชุดกลาง QUOTE_STATUS_LABELS/quoteStatusBadge จาก components/salesPlanning/ui
const statusBadge = (s, className) => quoteStatusBadge(s, className);

/* ── มุมมองของตาราง: เรียง · จัดกลุ่ม (มติผู้ใช้ 2026-08-15) ────────────────
   ปุ่มอยู่ใน `ui/ViewMenus` ตัวจัดถังอยู่ใน `lib/listGrouping` — ที่นี่ประกาศแค่
   หัวข้อของหน้านี้ · ทรงเดียวกับทะเบียนการชำระและตารางไปป์ไลน์ดีล */
const SORT_OPTIONS = [
  { value: "recent", label: "ล่าสุด", dir: "asc" },
  { value: "number", label: "เลขที่ QT", dir: "desc" },
  { value: "customer", label: "ลูกค้า", dir: "asc" },
  { value: "amount", label: "ยอดรวม", dir: "desc" },
  { value: "date", label: "วันที่", dir: "desc" },
];
const SORT_DEFAULT = "recent";
const sortDirOf = (key) => SORT_OPTIONS.find((option) => option.value === key)?.dir || "asc";

const GROUP_OPTIONS = [
  { value: "none", label: "ไม่จัดกลุ่ม" },
  { value: "customer", label: "ลูกค้า" },
  { value: "owner", label: "ผู้ดูแล (AE)" },
  { value: "status", label: "สถานะ" },
  { value: "type", label: "ประเภทดีล" },
];

/* ⚠️ ใบที่ยังไม่มีวันที่อยู่ท้ายเสมอทั้งสองทิศ — กติกาเดียวกับทุกตารางในระบบ */
function compareQuotes(a, b, key, dir) {
  const mul = dir === "desc" ? -1 : 1;
  const text = (value) => String(value || "");
  if (key === "date") {
    const aDate = a.quoteDate || null;
    const bDate = b.quoteDate || null;
    if (!aDate !== !bDate) return aDate ? -1 : 1;
    if (aDate !== bDate) return (String(aDate) < String(bDate) ? -1 : 1) * mul;
  } else if (key === "amount") {
    const diff = (Number(a.totalAmount) || 0) - (Number(b.totalAmount) || 0);
    if (diff) return diff * mul;
  } else if (key === "customer") {
    const byName = text(a.customerName).localeCompare(text(b.customerName), "th");
    if (byName) return byName * mul;
  }
  const byNumber = text(a.quoteNumber).localeCompare(text(b.quoteNumber), "th");
  return key === "number" ? byNumber * mul : byNumber;
}

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

export default function QuotationsPage() {
  const canEdit = useCan("salesplan:edit");
  const canView = useCan("salesplan:view");
  const role = useRole();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useStickyState("query", "");
  // ตัวกรองรวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) —
  // ทุกหมวด multi-select, ว่าง = ทั้งหมด
  const [statusFilter, setStatusFilter] = useStickyState("statusFilter", EMPTY);
  const [typeFilter, setTypeFilter] = useStickyState("typeFilter", EMPTY);
  // ⚠️ เก็บเป็น **ownerId** ไม่ใช่ชื่อ — ชื่อเปลี่ยนได้ ตัวกรองจะแตกเป็นสองคน
  const [ownerFilter, setOwnerFilter] = useStickyState("ownerFilter", EMPTY);
  const directory = usePeopleDirectory();
  const ownerNameOf = useCallback(
    (row) => livePersonName(directory, row?.deal?.ownerId, row?.deal?.ownerName),
    [directory],
  );
  // รอยต่อ Won → Sale Order: เดิมไม่มีที่ไหนบอกว่าใบไหนปิดได้แล้วแต่ยังไม่ได้ออก SO
  const [salesOrders, setSalesOrders] = useState([]);
  const navCountParam = useSearchParams().get("count") || "";
  const router = useRouter();
  const [pendingSoOnly, setPendingSoOnly] = useState(false);
  /* ⭐ `?count=quotations` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-114) · ป้ายนับ "ใบที่รอฉันลงมือ"
     (รอฉันอนุมัติ + ใบของฉันที่ถูกตีกลับ) ⇒ กดแล้วต้องเจอเท่านั้น
     ⚠️ ธง `_waitingOnMe` มาจาก **server** ด้วย helper ตัวเดียวกับที่ป้ายใช้นับ — จอไม่รู้ว่า
     ใครเป็นผู้อนุมัติ (ต้องรู้เจ้าของดีล + ดีลปิดยัง) คำนวณเองเมื่อไรเลขก็ไม่ตรงกัน
     ⚠️ อ่านครั้งเดียวตอนเปิดหน้า ไม่เฝ้าค่า — ไม่งั้นผู้ใช้กดล้างตัวกรองไม่ได้ */
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(navCountParam === "quotations");
  const [groupBy, setGroupBy] = useStickyState("groupBy", "none");
  const [sortKey, setSortKey] = useStickyState("sortKey", SORT_DEFAULT);
  const [sortDir, setSortDir] = useStickyState("sortDir", sortDirOf(SORT_DEFAULT));
  const [collapsed, setCollapsed] = useState(() => new Set());

  // สร้างใบใหม่ = ไปหน้าเต็ม /sa/quotations/new (cascade ลูกค้า→โครงการ→ดีล) — ไม่มี modal
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/sales-planning/quotations");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดใบเสนอราคาไม่สำเร็จ");
      setRows(await res.json());
    } catch (e) {
      setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  // SO โหลดแยก: ใช้บอกว่าใบ Won ใบไหนยังไม่มี SO เท่านั้น — ล้มเหลวก็ไม่ต้องกวนหน้าหลัก
  // (แถบเตือนหายไปเฉย ๆ ตารางใบเสนอราคายังใช้งานได้ครบ)
  useEffect(() => {
    let alive = true;
    apiFetch("/api/sales-planning/sales-orders")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (alive) setSalesOrders(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => { load(); }, [load]);

  // ลบ: กติกาเดียวกับ API — ฉบับร่างลบได้, ใบสถานะอื่นลบได้เฉพาะ superuser
  // (ใบที่ส่ง/รับแล้ว = หลักฐานการค้า ปกติให้ cancel/revise แทน)
  const deleteQuote = async (r) => {
    const warn = r.status !== "draft" ? "\n\n⚠ ใบนี้ไม่ใช่ฉบับร่าง — ลบด้วยสิทธิ์ผู้ดูแลระบบ (ปกติควรยกเลิก/Revise แทน)" : "";
    if (!(await confirmAction(`ลบใบเสนอราคา ${r.quoteNumber}?${warn}`))) return;
    setError("");
    try {
      // admin: ใบ accepted (แหล่งยอด Actual) โดนบล็อก → พรีวิว Sale Order ที่จะหาย + ยืนยันบังคับลบ
      const result = await deleteWithForce(`/api/sales-planning/quotations/${r.id}`, { isAdmin: role === "admin" });
      if (result.ok) load();
    } catch (e) {
      setError(e.message || "ลบใบเสนอราคาไม่สำเร็จ");
    }
  };

  // ใบ Won ที่ยังไม่มี SO ที่ใช้งานอยู่ — ตัวตัดสินกลางตัวเดียวกับ migration 0169
  // และการ์ดคิวบนแดชบอร์ด (lib/sales/handoffQueue) ห้ามเขียนเงื่อนไขซ้ำที่นี่
  const awaitingSalesOrderIds = useMemo(() => new Set(
    quotesAwaitingSalesOrder({ quotations: rows, salesOrders }).map((r) => r.id),
  ), [rows, salesOrders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (waitingOnMeOnly && !r._waitingOnMe) return false;
      if (pendingSoOnly && !awaitingSalesOrderIds.has(r.id)) return false;
      if (statusFilter.length && !statusFilter.includes(r.status)) return false;
      if (typeFilter.length && !typeFilter.includes(dealTypeOf(r.deal))) return false;
      if (ownerFilter.length && !ownerFilter.includes(r.deal?.ownerId || "")) return false;
      if (!q) return true;
      // ⚠️ ค้นจากสิ่งที่ตาเห็นบนแถว — รหัส AR โผล่บนจอแล้ว จึงต้องค้นเจอด้วย
      return [r.quoteNumber, r.customerName, r.customerArCode, r.deal?.title, ownerNameOf(r)]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, typeFilter, ownerFilter, pendingSoOnly, waitingOnMeOnly, awaitingSalesOrderIds, ownerNameOf]);

  /* ผู้ดูแลที่มีใบจริงในระบบ (ตัวเลือกกรอง) — ดึงจากแถวที่โหลดมา ไม่ต้องยิง API เพิ่ม
     🐞 เดิมรวมกลุ่มด้วย **ชื่อ** ที่ค้างอยู่ในแถว → คนเดียวที่เปลี่ยนชื่อกลางทาง
     โผล่เป็นสองบรรทัดในตัวกรอง (ใบเก่าชื่อเก่า ใบใหม่ชื่อใหม่) และเลือกอันไหน
     ก็ได้ใบไม่ครบ · ตอนนี้กลุ่มผูกกับ `ownerId` ส่วนชื่อเป็นแค่ป้ายที่อ่านสด */
  const ownerOptions = useMemo(() => {
    const byId = new Map();
    for (const r of rows) {
      const id = r.deal?.ownerId;
      if (!id || byId.has(id)) continue;
      byId.set(id, ownerNameOf(r));
    }
    return [...byId]
      .filter(([, name]) => name)
      .sort((a, b) => a[1].localeCompare(b[1], "th"))
      .map(([id, name]) => ({ value: id, label: name }));
  }, [rows, ownerNameOf]);
  /* `recent` = ลำดับที่ API ส่งมา — ไม่คิดใหม่ที่นี่ · สลับทิศคือกลับลำดับเดิม */
  const sorted = useMemo(() => {
    if (sortKey === SORT_DEFAULT) return sortDir === "desc" ? [...filtered].reverse() : filtered;
    return [...filtered].sort((a, b) => compareQuotes(a, b, sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  const buckets = useMemo(() => {
    if (groupBy === "none") return null;
    return bucketList(sorted, (r) => {
      const weight = Number(r.totalAmount) || 0;
      if (groupBy === "customer") {
        return {
          key: r.customerArCode || String(r.customerName || "").trim(),
          label: r.customerName || "ไม่ระบุลูกค้า",
          sub: r.customerArCode || null,
          weight,
        };
      }
      if (groupBy === "owner") {
        // ⚠️ กุญแจเป็น ownerId ไม่ใช่ชื่อ — เหตุผลเดียวกับตัวกรองผู้ดูแลด้านบน
        const name = ownerNameOf(r);
        return { key: r.deal?.ownerId || name, label: name || "ไม่ระบุผู้ดูแล", weight };
      }
      if (groupBy === "type") {
        const type = r.deal ? dealTypeOf(r.deal) : null;
        return { key: type, label: type ? DEAL_TYPE_LABELS[type] || type : "ไม่ระบุประเภท", weight };
      }
      return { key: r.status, label: QUOTE_STATUS_LABELS[r.status] || r.status, weight };
    });
  }, [sorted, groupBy, ownerNameOf]);

  const toggleBucket = useCallback((key) => setCollapsed((current) => toggleBucketKey(current, key)), []);
  const allCollapsed = allBucketsCollapsed(buckets, collapsed);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sorted, {
      resetKey: `${query}|${statusFilter.join()}|${typeFilter.join()}|${ownerFilter.join()}|${pendingSoOnly}|${sortKey}|${sortDir}`,
    });
  // ใบที่ **รอคนที่กำลังดูอยู่อนุมัติ** — ธงมาจาก server (helper ตัวเดียวกับป้ายบนเมนู)
  const approvalQueue = useMemo(() => rows.filter((q) => q._awaitingMyApproval), [rows]);

  const summary = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => ["draft", "sent", "pending_approval"].includes(row.status)).length,
    accepted: rows.filter((row) => ["accepted", "won"].includes(row.status)).length,
    value: rows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0),
  }), [rows]);

  /* ── แถวของใบเสนอราคาหนึ่งใบ — ใช้ทั้งโหมดปกติและโหมดจัดกลุ่ม ──────────
     ⚠️ ฟังก์ชันตัวเดียว ไม่ใช่ markup สองสำเนาในสองสาขาของ tbody (AGENTS.md) */
  const quoteRow = (r) => (
                <DetailRow key={r.id} href={`/sa/quotations/${r.id}`} className="premium-row">
                  <td>
                    {/* prefetch={false} ลิงก์ในแถว — กัน RSC prefetch ต่อแถวของลิสต์ยาว */}
                    <Link prefetch={false} href={`/sa/quotations/${r.id}`} className="linklike"><strong className="mono">{r.quoteNumber}</strong></Link>
                    {r.revisionNo > 0 && <span style={{ display: "block", color: "var(--amber)", fontSize: "var(--fs-3)" }}>ฉบับแก้ไข R{r.revisionNo}</span>}
                  </td>
                  <td>
                    {/* ⭐ รหัสลูกค้าอยู่ **เหนือ** ชื่อกิจการในตารางนี้ (มติผู้ใช้ 2026-08-12) —
                        เซลนี้เรียงจากบนลงล่างเป็น รหัส → ชื่อกิจการ → ชื่อดีล ⇒ กวาดตาลงคอลัมน์
                        แล้วเจอรหัสที่ตำแหน่งเดียวกันทุกแถว ไม่ต้องอ่านชื่อยาว ๆ ให้จบก่อน
                        ⚠️ ตารางอื่นในชุดนี้ (ดีล) รหัสอยู่ใต้ชื่อ — ต่างกันโดยตั้งใจตามที่สั่ง */}
                    {r.customerArCode ? <span className="ar-code ar-code-block">{r.customerArCode}</span> : null}
                    {naText(r.customerName)}
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
                      <Link prefetch={false} href={`/sa/deals/${r.deal?.id}`} className="linklike" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{naText(r.deal?.title)}</Link>
                    </span>
                  </td>
                  <td>{r.deal ? dealTypeBadge(dealTypeOf(r.deal), "ui-badge-cell ui-badge-w-deal-type") : <span className="muted">{NA}</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.quoteDate)}</td>
                  <td className="num mono">{fmtMoney(r.totalAmount)}</td>
                  <td>{statusBadge(r.status, "ui-badge-cell ui-badge-w-doc")}</td>
                  <td className="num">
                    <div style={{ display: "inline-flex", gap: 2 }}>
                      <button type="button" className="btn-icon" title="พิมพ์" aria-label={`พิมพ์ ${r.quoteNumber}`}
                        onClick={async () => {
                          const printWindow = prepareQuotePrintWindow();
                          if (!printWindow) return;
                          try {
                            const res = await apiFetch(`/api/sales-planning/quotations/${r.id}`);
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data?.error || "ไม่สามารถโหลดข้อมูลใบเสนอราคาได้");
                            await openQuotePrintWindowPreferIssued(data, printWindow);
                          } catch (error) {
                            showQuotePrintError(printWindow, error.message);
                          }
                        }}>
                        <Printer size={15} aria-hidden="true" />
                      </button>
                      {/* ⚠️ ด่านเดียวกับหน้ารายละเอียดและ PATCH ของ API (`isEditableQuotation`)
                          — ใบอื่นใช้ "ออก Rev." ที่หน้าใบ
                          🐞 เดิมเช็คแค่ `status` ⇒ ใบที่อนุมัติแล้ว (ซึ่ง mig 0165 ตั้งเป็น
                          'sent' ให้เอง) ก็ได้ดินสอ ⇒ กดแล้วตกไปอยู่ในโหมดแก้ไขของใบที่แก้
                          ไม่ได้ ซึ่งซ่อนปุ่มทั้งการ์ดจนเหลือ "Won" ปุ่มเดียว (IS-26080011) */}
                      {canEdit && isEditableQuotation(r) && (
                        <Link prefetch={false} href={`/sa/quotations/${r.id}?edit=1`} className="btn-icon" style={{ color: "var(--blue)" }} title="แก้ไข" aria-label={`แก้ไข ${r.quoteNumber}`}>
                          <Pencil size={15} aria-hidden="true" />
                        </Link>
                      )}
                      {/* ลบ: draft ทุกคนที่แก้ได้ / superuser ลบสถานะอื่น / admin บังคับลบได้ทุกสถานะ (รวม accepted) */}
                      {(role === "admin" || (canEdit && r.status !== "accepted" && (r.status === "draft" || isSuperuser(role)))) && (
                        <button type="button" className="btn-icon danger" title={r.status === "draft" ? "ลบฉบับร่าง" : "ลบ (สิทธิ์ผู้ดูแลระบบ)"} aria-label={`ลบ ${r.quoteNumber}`}
                          onClick={() => deleteQuote(r)}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </DetailRow>
  );

  if (!canView) {
    return (
      <SaWorkspace icon={<FileText size={22} />} title="ใบเสนอราคา">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </SaWorkspace>
    );
  }

  return (
    <SaWorkspace
      icon={<FileText size={22} />}
      /* ⚠️ **ห้ามใส่ชื่อระบบนำหน้า** — ตั้งแต่มติ 2026-08-22 เอกสารร่วมถูกเปิดใต้เปลือก
         ของหลายฝ่าย (FN เปิดหน้านี้ใต้ "บัญชีและการเงิน") ⇒ หัวหน้าที่ตรึงชื่อ
         "บริหารงานขาย" ไว้จะขัดกับเปลือกที่ครอบมันอยู่ · ชื่อระบบเป็นหน้าที่ของเปลือก
         (ท่าเดียวกับหน้าใบสั่งขายและคำร้องซึ่งไม่เคยมีคำนำหน้าอยู่แล้ว) */
      title="ใบเสนอราคา"
      subtitle="FM-SA-01 · เลขที่ QT-YYMMXXXX-R ใช้ติดตาม ห้ามซ้ำ — ทุกใบผูกกับดีลเสมอ"
      headerRight={canEdit && (
        <Link href="/sa/quotations/new" className="btn btn-accent">
          <Plus size={15} aria-hidden="true" /> สร้างใบเสนอราคา
        </Link>
      )}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        {/* รอยต่อ Won → ใบสั่งขาย: ดีลปิดได้แล้วแต่เอกสารยังไม่เดินต่อ — เดิมไม่มีอะไร
            บอกเลย ต้องมีคนจำไปกดเอง. ตัวเลขนับตามขอบเขตที่มองเห็นเหมือนตัวเลขอื่นในหน้านี้ */}
        {awaitingSalesOrderIds.size > 0 && (
          <StatusNotice
            tone="warning"
            title={`ใบเสนอราคา Won ${awaitingSalesOrderIds.size} ใบยังไม่ได้ออก ใบสั่งขาย`}
            action={(
              <button type="button" className="linklike" onClick={() => setPendingSoOnly((on) => !on)}>
                {pendingSoOnly ? "แสดงทุกใบ" : "ดูเฉพาะใบที่ค้าง"}
              </button>
            )}
          >
            ดีลปิดได้แล้วแต่เอกสารยังไม่เดินต่อ — เปิดใบแล้วกดสร้างใบสั่งขายเพื่อให้ยอดเข้าเป็น Actual
          </StatusNotice>
        )}

        <SaMetricStrip>
          <SaMetric icon={<FileText />} label="ทั้งหมด" value={summary.total} note="ใบเสนอราคาในขอบเขตที่มองเห็น" />
          <SaMetric icon={<Clock3 />} label="กำลังดำเนินการ" value={summary.active} note="ฉบับร่าง ส่งแล้ว หรือรออนุมัติ" tone={summary.active ? "warning" : "good"} />
          <SaMetric icon={<BadgeCheck />} label="ปิดสำเร็จ" value={summary.accepted} note="ใบที่ลูกค้ายอมรับหรือ Won" tone="good" />
          <SaMetric icon={<CircleDollarSign />} label="มูลค่ารวม" value={fmtMoney(summary.value)} note="รวมยอดใบเสนอราคาที่มองเห็น" />
        </SaMetricStrip>

        {/* ⭐ คิว "รออนุมัติจากคุณ" คาดเหนือตาราง — ทรงเดียวกับทะเบียนลูกค้า/สินค้า
            (มติผู้ใช้ 2026-08-25) · ของเดิมมีแต่ตัวกรอง "รอฉันลงมือ" ที่ต้องกดเอง
            ⚠️ ปุ่มเป็น **เปิดใบ** ไม่ใช่ติ๊กอนุมัติในลิสต์ — การอนุมัติตรึงลายเซ็นกับ
            fingerprint ของเนื้อใบ ผู้อนุมัติต้องเห็นรายการ/ราคาก่อนกด */}
        <ApprovalQueue
          items={approvalQueue}
          unit="ใบ"
          primary={(q) => q.quoteNumber}
          secondary={(q) => `${naText(q.customerName)} · ${fmtMoney(q.totalAmount)}`}
          onOpen={(q) => router.push(`/sa/quotations/${q.id}`)}
          renderAction={(q) => (
            <Button as={Link} href={`/sa/quotations/${q.id}`} tone="primary" size="sm">เปิดใบเพื่ออนุมัติ</Button>
          )}
        />

        <SaSection icon={<FileText size={17} />} title="ทะเบียนใบเสนอราคา" subtitle="ค้นหา กรอง และเปิดเอกสารเพื่อดำเนินการต่อ" actions={<span className="ui-badge">{filtered.length} ใบ</span>}>
          <div className="toolbar">
            <div className="search-glass" style={{ width: 300 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลข QT / ลูกค้า / ดีล" aria-label="ค้นหาใบเสนอราคา" />
            </div>
            {waitingOnMeOnly && (
              /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบเดียวกับคิวคำร้อง
                 (ตัวกรองที่ซ่อนอยู่คือตัวกรองที่ผู้ใช้กล่าวหาว่าข้อมูลหาย) */
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>
                กรอง: รอฉันลงมือ ×
              </Button>
            )}
            <FilterPopover
              count={statusFilter.length + typeFilter.length + ownerFilter.length}
              onClear={() => { setStatusFilter([]); setTypeFilter([]); setOwnerFilter([]); }}
              groups={[
                {
                  key: "status", label: "สถานะ", icon: Flag,
                  options: Object.entries(QUOTE_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
                  selected: statusFilter, onChange: setStatusFilter,
                },
                {
                  key: "type", label: "ประเภทดีล", icon: Handshake,
                  options: DEAL_TYPES.map((t) => ({ value: t, label: DEAL_TYPE_LABELS[t] })),
                  selected: typeFilter, onChange: setTypeFilter,
                },
                ...(ownerOptions.length ? [{
                  key: "owner", label: "ผู้ดูแล", icon: User,
                  options: ownerOptions,
                  selected: ownerFilter, onChange: setOwnerFilter,
                }] : []),
              ]}
            />
            <GroupMenu
              title="จัดกลุ่มใบเสนอราคา"
              value={groupBy}
              onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
              options={GROUP_OPTIONS}
            />
            {!!buckets?.length && (
              <CollapseAllButton
                collapsed={allCollapsed}
                onToggle={() => setCollapsed(allCollapsed ? new Set() : new Set(buckets.map((bucket) => bucket.key)))}
              />
            )}
            <div className="spacer" />
            <SortMenu
              title="เรียงลำดับใบเสนอราคา"
              value={sortKey}
              defaultValue={SORT_DEFAULT}
              onChange={(value) => { setSortKey(value); setSortDir(sortDirOf(value)); }}
              options={SORT_OPTIONS}
            />
            <SortDirButton dir={sortDir} onToggle={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} />
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <TableScroll surface="embedded"><table className="w-full text-sm">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ลูกค้า / ดีล</th>
                  {/* ⭐ ประเภทดีลเป็นคอลัมน์ของตัวเอง (มติผู้ใช้ 2026-08-12) — เดิมป้ายนี้
                      แทรกหน้าชื่อดีลในเซลเดียวกัน ทำให้กวาดตาหาว่า "ใบไหนเป็น NPD" ไม่ได้
                      และตัวกรอง "ประเภทดีล" ที่มีอยู่แล้วไม่มีคอลัมน์ให้ยืนยันผลลัพธ์ */}
                  <th>ประเภท</th>
                  <th>วันที่</th>
                  <th className="num">ยอดรวม</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {/* โหมดจัดกลุ่ม: หัวกลุ่มเต็มแถว แถวใบข้างในเป็น `quoteRow` ตัวเดียวกับโหมดปกติ */}
                {buckets ? buckets.map((bucket) => {
                  const bucketCollapsed = collapsed.has(bucket.key);
                  return (
                    <Fragment key={bucket.key}>
                      <TableGroupRow
                        colSpan={7}
                        label={bucket.label}
                        sub={bucket.sub}
                        badge={`${bucket.count} ใบ`}
                        total={fmtMoney(bucket.total)}
                        totalTitle="ยอดรวมของใบในกลุ่มนี้"
                        collapsed={bucketCollapsed}
                        onToggle={() => toggleBucket(bucket.key)}
                      />
                      {!bucketCollapsed && bucket.items.map(quoteRow)}
                    </Fragment>
                  );
                }) : pageRows.map(quoteRow)}
                {!filtered.length && !loading && (
                  <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีใบเสนอราคา {canEdit ? "— เริ่มจากปุ่มสร้างด้านบน" : ""}</td></tr>
                )}
              </tbody>
            </table></TableScroll>
          </div>

          {/* โหมดจัดกลุ่มไม่แบ่งหน้า — แบ่งหน้าจะหั่นกลุ่มคาหน้าแล้วยอดหัวกลุ่มไม่ตรงกับแถว */}
          {filtered.length > 0 && !buckets && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={setPageSize}
            />
          )}
        </SaSection>
      </div>

    </SaWorkspace>
  );
}
