"use client";
import Select from "@/components/ui/Select";

// หน้ารวมใบเสนอราคา (/sa/quotations — เฟส D, มติผู้ใช้: เมนูแยกเพื่อง่ายต่อการค้นหา)
// ทุกใบยังผูก โครงการ›ดีล เสมอ — สร้างใหม่ต้องเลือกดีลก่อน แล้วไปแก้ต่อที่หน้า editor.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Pencil, Plus, Search, Printer, Trash2 } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { dealTypeBadge } from "@/components/salesPlanning/ui";
import { dealTypeOf } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney } from "@/lib/format";
import { openQuotePrintWindow, prepareQuotePrintWindow, showQuotePrintError } from "@/lib/sales/quotePrint";

const STATUS_LABELS = {
  draft: "ฉบับร่าง", sent: "ส่งลูกค้าแล้ว", accepted: "Won",
  rejected: "ถูกปฏิเสธ", cancelled: "ยกเลิก", revised: "ถูกแก้ไข (มีฉบับใหม่)",
};
const STATUS_COLORS = {
  draft: "var(--text-3)", sent: "var(--blue)", accepted: "var(--green)",
  rejected: "var(--red)", cancelled: "var(--red)", revised: "var(--amber)",
};
const statusBadge = (s) => (
  <span className="ui-badge" style={{ color: STATUS_COLORS[s] || "var(--text-3)", borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
    {STATUS_LABELS[s] || s}
  </span>
);

export default function QuotationsPage() {
  const canEdit = useCan("salesplan:edit");
  const canView = useCan("salesplan:view");
  const role = useRole();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
    const res = await fetch(`/api/sales-planning/quotations/${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "ลบใบเสนอราคาไม่สำเร็จ");
      return;
    }
    load();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.quoteNumber, r.customerName, r.deal?.title, r.deal?.ownerName].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter]);

  if (!canView) {
    return (
      <Workspace icon={<FileText size={22} />} title="ใบเสนอราคา">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="บริหารงานขาย — ใบเสนอราคา"
      subtitle="FM-SA-01 · เลขที่ QT-YYMMXXXX-R ใช้ติดตาม ห้ามซ้ำ — ทุกใบผูกกับดีลเสมอ"
      headerRight={canEdit && (
        <Link href="/sa/quotations/new" className="btn btn-primary">
          <Plus size={15} aria-hidden="true" /> สร้างใบเสนอราคา
        </Link>
      )}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        <section className="glass-panel" style={{ padding: 16 }}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 300 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลข QT / ลูกค้า / ดีล" aria-label="ค้นหาใบเสนอราคา" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" aria-label="กรองสถานะ" style={{ width: 190 }}>
              <option value="all">ทุกสถานะ</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <div className="spacer" />
            <span className="ui-badge">{filtered.length} ใบ</span>
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
                {filtered.map((r) => (
                  <DetailRow key={r.id} href={`/sa/quotations/${r.id}`} className="premium-row">
                    <td>
                      <Link href={`/sa/quotations/${r.id}`} className="linklike"><strong className="mono">{r.quoteNumber}</strong></Link>
                      {r.revisionNo > 0 && <span style={{ display: "block", color: "var(--amber)", fontSize: 11 }}>ฉบับแก้ไข R{r.revisionNo}</span>}
                    </td>
                    <td>
                      {r.customerName || "-"}
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)", fontSize: 12 }}>
                        {r.deal && dealTypeBadge(dealTypeOf(r.deal))}
                        <Link href={`/sa/deals/${r.deal?.id}`} className="linklike" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{r.deal?.title || "-"}</Link>
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
                              openQuotePrintWindow(data, printWindow);
                            } catch (error) {
                              showQuotePrintError(printWindow, error.message);
                            }
                          }}>
                          <Printer size={15} aria-hidden="true" />
                        </button>
                        {/* แก้ได้เฉพาะสถานะที่ API เปิด (draft/sent/rejected) — ใบอื่นใช้ Revise ที่หน้าใบ */}
                        {canEdit && ["draft", "sent", "rejected"].includes(r.status) && (
                          <Link href={`/sa/quotations/${r.id}?edit=1`} className="btn-icon" style={{ color: "var(--blue)" }} title="แก้ไข" aria-label={`แก้ไข ${r.quoteNumber}`}>
                            <Pencil size={15} aria-hidden="true" />
                          </Link>
                        )}
                        {canEdit && (r.status === "draft" || isSuperuser(role)) && (
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
        </section>
      </div>

    </Workspace>
  );
}
