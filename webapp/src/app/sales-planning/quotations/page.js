"use client";

// หน้ารวมใบเสนอราคา (/sa/quotations — เฟส D, มติผู้ใช้: เมนูแยกเพื่อง่ายต่อการค้นหา)
// ทุกใบยังผูก โครงการ›ดีล เสมอ — สร้างใหม่ต้องเลือกดีลก่อน แล้วไปแก้ต่อที่หน้า editor.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Printer } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import { useCan } from "@/lib/roleContext";
import { dealTypeBadge } from "@/components/salesPlanning/ui";
import { dealTypeOf } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney } from "@/lib/format";
import { openQuotePrintWindow } from "@/lib/sales/quotePrint";

const STATUS_LABELS = {
  draft: "ฉบับร่าง", sent: "ส่งลูกค้าแล้ว", accepted: "ลูกค้ารับแล้ว",
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
  const router = useRouter();
  const canEdit = useCan("salesplan:edit");
  const canView = useCan("salesplan:view");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // วิซาร์ดสร้าง: เลือกดีล → POST → ไป editor
  const [createOpen, setCreateOpen] = useState(false);
  const [deals, setDeals] = useState([]);
  const [dealId, setDealId] = useState("");
  const [creating, setCreating] = useState(false);

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

  const openCreate = async () => {
    setCreateOpen(true);
    setDealId("");
    const res = await fetch("/api/sales-planning/deals").catch(() => null);
    const all = res?.ok ? await res.json() : [];
    // เสนอเฉพาะดีลที่ยังเปิดอยู่ (won/lost ออกใบใหม่ไม่ได้ตาม flow)
    setDeals((all || []).filter((d) => !["won", "in_project", "lost"].includes(d.stage)));
  };

  const createQuote = async () => {
    if (!dealId) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${dealId}/quotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้างใบเสนอราคาไม่สำเร็จ");
      router.push(`/sa/quotations/${data.id}`);
    } catch (e) {
      setError(e.message || "สร้างใบเสนอราคาไม่สำเร็จ");
      setCreating(false);
    }
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
      back={{ href: "/sa", label: "กลับไปภาพรวม" }}
      headerRight={canEdit && (
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} aria-hidden="true" /> สร้างใบเสนอราคา
        </button>
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
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" aria-label="กรองสถานะ" style={{ width: 190 }}>
              <option value="all">ทุกสถานะ</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
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
                  <th>อนุมัติ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="premium-row">
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
                    <td>
                      {r.approvalStatus === "not_required" ? <span style={{ color: "var(--text-3)", fontSize: 12 }}>-</span>
                        : <span className="ui-badge" style={{ color: r.approvalStatus === "approved" ? "var(--green)" : r.approvalStatus === "rejected" ? "var(--red)" : "var(--amber)" }}>
                          {{ pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ" }[r.approvalStatus] || r.approvalStatus}
                        </span>}
                    </td>
                    <td className="num">
                      <button type="button" className="btn-icon" title="พิมพ์" aria-label={`พิมพ์ ${r.quoteNumber}`}
                        onClick={async () => {
                          const res = await fetch(`/api/sales-planning/quotations/${r.id}`);
                          if (res.ok) openQuotePrintWindow(await res.json());
                        }}>
                        <Printer size={15} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && !loading && (
                  <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีใบเสนอราคา {canEdit ? "— เริ่มจากปุ่มสร้างด้านบน" : ""}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)} title="สร้างใบเสนอราคา — เลือกดีล" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            ใบเสนอราคาผูกกับดีลเสมอ — ระบบจะดึงลูกค้า/สินค้า (FG จากโครงการ) มาตั้งต้นให้ แล้วไปแก้รายละเอียดต่อ
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            ดีล (เฉพาะที่ยังเปิดอยู่)
            <select className="premium-select" value={dealId} onChange={(e) => setDealId(e.target.value)}>
              <option value="">— เลือกดีล —</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.title} · {d.customerName || "ไม่มีลูกค้า"}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setCreateOpen(false)} disabled={creating}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={createQuote} disabled={creating || !dealId}>
              {creating ? "กำลังสร้าง…" : "สร้างและไปแก้ไข"}
            </button>
          </div>
        </div>
      </Modal>
    </Workspace>
  );
}
