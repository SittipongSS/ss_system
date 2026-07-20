"use client";

// หน้ารวมใบเสนอราคา (/sa/quotations — เฟส D, มติผู้ใช้: เมนูแยกเพื่อง่ายต่อการค้นหา)
// ทุกใบยังผูก โครงการ›ดีล เสมอ — สร้างใหม่ต้องเลือกดีลก่อน แล้วไปแก้ต่อที่หน้า editor.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CircleDollarSign, Clock3, FileText, FolderKanban, Pencil, Plus, Search, Printer, Trash2, User } from "lucide-react";
import SaWorkspace, { SaMetric, SaMetricStrip, SaSection } from "@/components/salesPlanning/SaWorkspace";
import DetailRow from "@/components/ui/DetailRow";
import FilterPopover from "@/components/ui/FilterPopover";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { QUOTE_STATUS_LABELS, dealTypeBadge, quoteStatusBadge } from "@/components/salesPlanning/ui";
import { DEAL_TYPES, DEAL_TYPE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney } from "@/lib/format";
import { openQuotePrintWindowPreferIssued, prepareQuotePrintWindow, showQuotePrintError } from "@/lib/sales/quotePrint";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";

// ป้ายสถานะใช้ชุดกลาง QUOTE_STATUS_LABELS/quoteStatusBadge จาก components/salesPlanning/ui
const statusBadge = (s) => quoteStatusBadge(s);

export default function QuotationsPage() {
  const canEdit = useCan("salesplan:edit");
  const canView = useCan("salesplan:view");
  const role = useRole();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // ตัวกรองรวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) —
  // ทุกหมวด multi-select, ว่าง = ทั้งหมด
  const [statusFilter, setStatusFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [ownerFilter, setOwnerFilter] = useState([]);

  // สร้างใบใหม่ = ไปหน้าเต็ม /sa/quotations/new (cascade ลูกค้า→โครงการ→ดีล) — ไม่มี modal
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/quotations");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดใบเสนอราคาไม่สำเร็จ");
      setRows(await res.json());
    } catch (e) {
      setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ลบ: กติกาเดียวกับ API — ฉบับร่างลบได้, ใบสถานะอื่นลบได้เฉพาะ superuser
  // (ใบที่ส่ง/รับแล้ว = หลักฐานการค้า ปกติให้ cancel/revise แทน)
  const deleteQuote = async (r) => {
    const warn = r.status !== "draft" ? "\n\n⚠ ใบนี้ไม่ใช่ฉบับร่าง — ลบด้วยสิทธิ์ผู้ดูแลระบบ (ปกติควรยกเลิก/Revise แทน)" : "";
    if (!window.confirm(`ลบใบเสนอราคา ${r.quoteNumber}?${warn}`)) return;
    setError("");
    try {
      // admin: ใบ accepted (แหล่งยอด Actual) โดนบล็อก → พรีวิว Sale Order ที่จะหาย + ยืนยันบังคับลบ
      const result = await deleteWithForce(`/api/sales-planning/quotations/${r.id}`, { isAdmin: role === "admin" });
      if (result.ok) load();
    } catch (e) {
      setError(e.message || "ลบใบเสนอราคาไม่สำเร็จ");
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter.length && !statusFilter.includes(r.status)) return false;
      if (typeFilter.length && !typeFilter.includes(dealTypeOf(r.deal))) return false;
      if (ownerFilter.length && !ownerFilter.includes(r.deal?.ownerName || "")) return false;
      if (!q) return true;
      return [r.quoteNumber, r.customerName, r.deal?.title, r.deal?.ownerName].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, typeFilter, ownerFilter]);

  // ผู้ดูแลที่มีใบจริงในระบบ (ตัวเลือกกรอง) — ดึงจากแถวที่โหลดมา ไม่ต้องยิง API เพิ่ม
  const ownerOptions = useMemo(() => (
    [...new Set(rows.map((r) => r.deal?.ownerName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "th"))
      .map((name) => ({ value: name, label: name }))
  ), [rows]);
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filtered, {
      resetKey: `${query}|${statusFilter.join()}|${typeFilter.join()}|${ownerFilter.join()}`,
    });
  const summary = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => ["draft", "sent", "pending_approval"].includes(row.status)).length,
    accepted: rows.filter((row) => ["accepted", "won"].includes(row.status)).length,
    value: rows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0),
  }), [rows]);

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
      title="บริหารงานขาย — ใบเสนอราคา"
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

        <SaMetricStrip>
          <SaMetric icon={<FileText />} label="ทั้งหมด" value={summary.total} note="ใบเสนอราคาในขอบเขตที่มองเห็น" />
          <SaMetric icon={<Clock3 />} label="กำลังดำเนินการ" value={summary.active} note="ฉบับร่าง ส่งแล้ว หรือรออนุมัติ" tone={summary.active ? "warning" : "good"} />
          <SaMetric icon={<BadgeCheck />} label="ปิดสำเร็จ" value={summary.accepted} note="ใบที่ลูกค้ายอมรับหรือ Won" tone="good" />
          <SaMetric icon={<CircleDollarSign />} label="มูลค่ารวม" value={fmtMoney(summary.value)} note="รวมยอดใบเสนอราคาที่มองเห็น" />
        </SaMetricStrip>

        <SaSection icon={<FileText size={17} />} title="ทะเบียนใบเสนอราคา" subtitle="ค้นหา กรอง และเปิดเอกสารเพื่อดำเนินการต่อ" actions={<span className="ui-badge">{filtered.length} ใบ</span>}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 300 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลข QT / ลูกค้า / ดีล" aria-label="ค้นหาใบเสนอราคา" />
            </div>
            <FilterPopover
              count={statusFilter.length + typeFilter.length + ownerFilter.length}
              onClear={() => { setStatusFilter([]); setTypeFilter([]); setOwnerFilter([]); }}
              groups={[
                {
                  key: "status", label: "สถานะ", icon: FileText,
                  options: Object.entries(QUOTE_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })),
                  selected: statusFilter, onChange: setStatusFilter,
                },
                {
                  key: "type", label: "ประเภทดีล", icon: FolderKanban,
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
            <div className="spacer" />
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ลูกค้า / ดีล</th>
                  <th>วันที่</th>
                  <th className="num">ยอดรวม</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <DetailRow key={r.id} href={`/sa/quotations/${r.id}`} className="premium-row">
                    <td>
                      {/* prefetch={false} ลิงก์ในแถว — กัน RSC prefetch ต่อแถวของลิสต์ยาว */}
                      <Link prefetch={false} href={`/sa/quotations/${r.id}`} className="linklike"><strong className="mono">{r.quoteNumber}</strong></Link>
                      {r.revisionNo > 0 && <span style={{ display: "block", color: "var(--amber)", fontSize: 11 }}>ฉบับแก้ไข R{r.revisionNo}</span>}
                    </td>
                    <td>
                      {r.customerName || "-"}
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)", fontSize: 12 }}>
                        {r.deal && dealTypeBadge(dealTypeOf(r.deal))}
                        <Link prefetch={false} href={`/sa/deals/${r.deal?.id}`} className="linklike" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{r.deal?.title || "-"}</Link>
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.quoteDate)}</td>
                    <td className="num mono">{fmtMoney(r.totalAmount)}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td className="num">
                      <div style={{ display: "inline-flex", gap: 2 }}>
                        <button type="button" className="btn-icon" title="พิมพ์" aria-label={`พิมพ์ ${r.quoteNumber}`}
                          onClick={async () => {
                            const printWindow = prepareQuotePrintWindow();
                            if (!printWindow) return;
                            try {
                              const res = await fetch(`/api/sales-planning/quotations/${r.id}`);
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data?.error || "ไม่สามารถโหลดข้อมูลใบเสนอราคาได้");
                              await openQuotePrintWindowPreferIssued(data, printWindow);
                            } catch (error) {
                              showQuotePrintError(printWindow, error.message);
                            }
                          }}>
                          <Printer size={15} aria-hidden="true" />
                        </button>
                        {/* แก้ได้เฉพาะสถานะที่ API เปิด (draft/sent/rejected) — ใบอื่นใช้ Revise ที่หน้าใบ */}
                        {canEdit && ["draft", "sent", "rejected"].includes(r.status) && (
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
                ))}
                {!filtered.length && !loading && (
                  <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีใบเสนอราคา {canEdit ? "— เริ่มจากปุ่มสร้างด้านบน" : ""}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
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
