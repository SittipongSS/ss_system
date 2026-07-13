"use client";

// ศูนย์รวมดีลในโครงการ — โครงการ = จิ๊กซอว์ครอบดีล: ดีลมีอะไร โครงการ merge หมด
// การ์ดต่อดีล (ใบเสนอราคา + ความคืบหน้า segment ไทม์ไลน์ อยู่ "ใต้ดีล") +
// KPI rollup และฟีดความเคลื่อนไหวรวม "คงระดับโครงการ" ไว้. อ่านอย่างเดียว —
// เพิ่ม/แก้ใบเสนอราคา/อัปเดตงาน ทำที่หน้าดีลตามเดิม.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, MessageSquare, PackageCheck, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import { useCan } from "@/lib/roleContext";
import { STAGE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { dealTypeBadge } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtMoneyCompact, fmtDateTime } from "@/lib/format";
import { isDealAvailableForProject } from "@/lib/sales/projectLink";

const STAGE_COLORS = {
  lead: "var(--text-3)", qualified: "var(--blue)", quotation: "var(--amber)",
  timeline_proposed: "var(--blue)", awaiting_confirm: "var(--teal)", deposit_pending: "var(--violet)",
  won: "var(--green)", in_project: "var(--green)", lost: "var(--red)",
};
const QUOTE_STATUS = {
  draft: { label: "ฉบับร่าง", color: "var(--text-3)" },
  sent: { label: "ส่งลูกค้าแล้ว", color: "var(--blue)" },
  accepted: { label: "รับแล้ว", color: "var(--green)" },
  rejected: { label: "ถูกปฏิเสธ", color: "var(--red)" },
  cancelled: { label: "ยกเลิก", color: "var(--red)" },
  revised: { label: "ถูกแก้ไข", color: "var(--amber)" },
};
const ACTIVITY_KIND = {
  note: { label: "บันทึก", color: "var(--text-3)" },
  call: { label: "โทร", color: "var(--blue)" },
  meeting: { label: "ประชุม", color: "var(--violet)" },
  email: { label: "อีเมล", color: "var(--teal)" },
  next_step: { label: "ขั้นถัดไป", color: "var(--amber)" },
};
const localToday = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const stageBadge = (stage) => (
  <span className="ui-badge" style={{ color: STAGE_COLORS[stage] || "var(--text-3)" }}>
    {STAGE_LABELS[stage] || stage || "-"}
  </span>
);

function Kpi({ label, value, hint, color }) {
  return (
    <div className="glass-panel" style={{ padding: "12px 14px" }}>
      <div style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div className="mono tabular-nums" style={{ marginTop: 6, fontSize: 19, fontWeight: 800, color: color || "inherit" }}>{value}</div>
      {hint && <div style={{ marginTop: 3, color: "var(--text-3)", fontSize: 11.5 }}>{hint}</div>}
    </div>
  );
}

// การ์ดดีล 1 ใบ = จิ๊กซอว์ 1 ชิ้น: หัวดีล + segment ไทม์ไลน์ + ใบเสนอราคาใต้ดีล
function DealCard({ deal, seg, quotes }) {
  const closed = ["won", "in_project"].includes(deal.stage);
  const value = closed ? (deal.wonValue ?? deal.projectValue) : deal.projectValue;
  const shown = quotes.slice(0, 3);
  return (
    <div className="glass-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {dealTypeBadge(dealTypeOf(deal))}
        <Link href={`/sa/deals/${deal.id}`} className="linklike" style={{ fontWeight: 700, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {deal.title}
        </Link>
        {stageBadge(deal.stage)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--text-2)" }}>
        <span>
          <span style={{ color: "var(--text-3)" }}>{closed ? "ปิดจริง " : "FC "}</span>
          <strong className="mono tabular-nums" style={{ color: closed ? "var(--green)" : deal.stage === "lost" ? "var(--red)" : "inherit" }}>
            {fmtMoneyCompact(value)}
          </strong>
          {!closed && deal.forecastMonth ? <span style={{ color: "var(--text-3)" }}> · {deal.forecastMonth}</span> : null}
        </span>
        <span><span style={{ color: "var(--text-3)" }}>AE </span>{deal.ownerName || "-"}{deal.team ? ` · ${deal.team}` : ""}</span>
        {deal.formulaName && <span><span style={{ color: "var(--text-3)" }}>สูตร </span>{deal.formulaName}</span>}
      </div>

      {/* segment ไทม์ไลน์ของดีลนี้ (งานใน Gantt ที่ tag dealId ตรงกัน) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <PackageCheck size={14} aria-hidden="true" style={{ color: "var(--text-3)", flexShrink: 0 }} />
        {seg.total ? (
          <>
            <div className="progress" style={{ flex: 1, minWidth: 60 }} role="progressbar" aria-valuenow={seg.done} aria-valuemax={seg.total} aria-label={`ไทม์ไลน์ ${deal.title}`}>
              <span className={seg.done === seg.total ? "done" : undefined} style={{ width: `${Math.round((seg.done / seg.total) * 100)}%` }} />
            </div>
            <span className="mono tabular-nums" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>{seg.done}/{seg.total}</span>
            {seg.current && <span style={{ color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>กำลังทำ: {seg.current}</span>}
          </>
        ) : (
          <span style={{ color: "var(--text-3)" }}>ยังไม่มี segment ไทม์ไลน์ของดีลนี้</span>
        )}
      </div>

      {/* ใบเสนอราคาใต้ดีล */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>
          <FileText size={13} aria-hidden="true" /> ใบเสนอราคา
          <span className="ui-badge" style={{ color: "var(--text-3)" }}>{quotes.length}</span>
        </div>
        {shown.length ? shown.map((q) => (
          <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minWidth: 0 }}>
            <Link href={`/sa/quotations/${q.id}`} className="linklike mono" style={{ whiteSpace: "nowrap" }}>{q.quoteNumber}</Link>
            <span className="ui-badge" style={{ color: QUOTE_STATUS[q.status]?.color || "var(--text-3)" }}>{QUOTE_STATUS[q.status]?.label || q.status}</span>
            <span className="mono tabular-nums" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{fmtMoney(q.totalAmount)}</span>
          </div>
        )) : <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>ยังไม่มี — สร้างได้ที่เมนูใบเสนอราคา</div>}
        {quotes.length > shown.length && (
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>+ อีก {quotes.length - shown.length} ใบ (ดูทั้งหมดที่หน้าดีล)</div>
        )}
      </div>

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
        <Link href={`/sa/deals/${deal.id}`} className="btn ghost sm"><ExternalLink size={13} aria-hidden="true" /> เปิดดีล</Link>
      </div>
    </div>
  );
}

// ฟีดความเคลื่อนไหวรวมทุกดีล + การเปลี่ยนสถานะ เรียงเวลาเดียวกัน — วางท้ายหน้า
// โครงการ (หลังไทม์ไลน์) แยกจาก hub เพื่อไม่ดันไทม์ไลน์ให้จมลงล่าง
export function ProjectActivityFeed({ project: p, onChanged }) {
  const canEdit = useCan("salesplan:edit");
  const [showAllFeed, setShowAllFeed] = useState(false);
  const [dealId, setDealId] = useState("");
  const [kind, setKind] = useState("note");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const deals = useMemo(() => p.deals || [], [p.deals]);

  const feed = useMemo(() => {
    const dealById = new Map(deals.map((d) => [d.id, d]));
    return [
      ...(p.dealActivities || []).map((a) => ({
        id: `act-${a.id}`, at: a.activityAt || a.createdAt, deal: dealById.get(a.dealId),
        kind: ACTIVITY_KIND[a.kind] || ACTIVITY_KIND.note, body: a.body, by: a.createdByName,
      })),
      ...(p.dealStageHistory || []).map((h) => ({
        id: `st-${h.id}`, at: h.changedAt, deal: dealById.get(h.dealId),
        kind: { label: "สถานะ", color: "var(--accent)" },
        body: `${STAGE_LABELS[h.fromStage] || h.fromStage || "เริ่ม"} → ${STAGE_LABELS[h.toStage] || h.toStage}`,
        by: h.changedByName,
      })),
    ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }, [p.dealActivities, p.dealStageHistory, deals]);
  const feedShown = showAllFeed ? feed : feed.slice(0, 12);

  const addActivity = async (event) => {
    event.preventDefault();
    if (!dealId || !body.trim()) return setError("กรุณาเลือกดีลและระบุรายละเอียด");
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, kind, body: body.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "เพิ่มความเคลื่อนไหวไม่สำเร็จ");
      setBody("");
      await onChanged?.();
    } catch (err) {
      setError(err.message || "เพิ่มความเคลื่อนไหวไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: "16px 20px", marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <MessageSquare size={16} aria-hidden="true" />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>ความเคลื่อนไหวรวมทุกดีล</h3>
        <span className="ui-badge" style={{ color: "var(--text-3)" }}>{feed.length} รายการ</span>
        <div className="spacer" style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>ข้อมูลเดียวกับหน้าดีลแต่ละใบ</span>
      </div>
      {canEdit && deals.length > 0 && (
        <form onSubmit={addActivity} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 150px minmax(240px, 2fr) auto", gap: 8, marginBottom: 14, alignItems: "end" }}>
          <div className="form-group"><label>ดีล</label><Select fullWidth value={dealId} onChange={(event) => setDealId(event.target.value)}><option value="">— เลือกดีล —</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</Select></div>
          <div className="form-group"><label>ประเภท</label><Select fullWidth value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(ACTIVITY_KIND).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</Select></div>
          <div className="form-group"><label>รายละเอียด</label><input className="premium-input w-full" value={body} onChange={(event) => setBody(event.target.value)} placeholder="บันทึก โทร ประชุม หรือขั้นถัดไป..." /></div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "กำลังเพิ่ม..." : "เพิ่ม"}</button>
        </form>
      )}
      {error && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {feed.length ? <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
        {feedShown.map((it) => (
          <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            <span className="ui-badge" style={{ color: it.kind.color, flexShrink: 0 }}>{it.kind.label}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{it.body}</div>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--text-3)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {it.deal && (
                  <Link href={`/sa/deals/${it.deal.id}`} className="linklike" style={{ display: "inline-flex", gap: 4, alignItems: "center", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dealTypeBadge(dealTypeOf(it.deal))} {it.deal.title}
                  </Link>
                )}
                {it.by && <span>{it.by}</span>}
                <span>{fmtDateTime(it.at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div> : <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>{deals.length ? "ยังไม่มีความเคลื่อนไหว" : "ผูกดีลก่อนเพื่อเริ่มบันทึกความเคลื่อนไหว"}</div>}
      {feed.length > 12 && (
        <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setShowAllFeed((v) => !v)}>
          {showAllFeed ? "ย่อ" : `ดูทั้งหมด (${feed.length})`}
        </button>
      )}
    </div>
  );
}

export default function ProjectDealsHub({ project: p, onChanged }) {
  const canEditSales = useCan("salesplan:edit");
  const canEditProjects = useCan("pm:edit");
  const canEdit = canEditSales && canEditProjects;
  const deals = useMemo(() => p.deals || [], [p.deals]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [availableDeals, setAvailableDeals] = useState([]);
  const [dealId, setDealId] = useState("");
  const [startDate, setStartDate] = useState(localToday());
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    if (!linkOpen) return;
    setDealId("");
    setLinkError("");
    fetch("/api/sales-planning/deals")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setAvailableDeals((rows || []).filter((deal) => (
        isDealAvailableForProject(deal, { customerId: p.customerId })
      ))))
      .catch(() => setAvailableDeals([]));
  }, [linkOpen, p.customerId]);

  const linkDeal = async () => {
    if (!dealId) return setLinkError("กรุณาเลือกดีล");
    setLinking(true);
    setLinkError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${dealId}/link-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, startDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ผูกดีลไม่สำเร็จ");
      setLinkOpen(false);
      await onChanged?.();
    } catch (error) {
      setLinkError(error.message || "ผูกดีลไม่สำเร็จ");
    } finally {
      setLinking(false);
    }
  };

  // segment ต่อดีล: นับจาก project_tasks ที่ tag dealId — งาน dealId ว่าง (ส่วนกลาง/
  // ข้อมูลยุค 1:1) นับรวมเข้าดีลเดียวเมื่อโครงการมีดีลเดียว ไม่งั้นแยกเป็น "งานกลาง"
  const segments = useMemo(() => {
    const bySeg = new Map();
    for (const t of p.tasks || []) {
      const key = deals.length === 1 ? deals[0].id : (t.dealId || "__central__");
      const s = bySeg.get(key) || { done: 0, total: 0, current: null };
      s.total += 1;
      if (t.status === "Completed") s.done += 1;
      else if (t.status === "In Progress" && !s.current) s.current = t.name;
      bySeg.set(key, s);
    }
    return bySeg;
  }, [p.tasks, deals]);
  const central = deals.length > 1 ? segments.get("__central__") : null;

  const quotesByDeal = useMemo(() => {
    const m = new Map();
    for (const q of p.quotations || []) {
      if (!m.has(q.dealId)) m.set(q.dealId, []);
      m.get(q.dealId).push(q);
    }
    return m;
  }, [p.quotations]);

  const acceptedTotal = useMemo(
    () => (p.quotations || []).filter((q) => q.status === "accepted").reduce((sum, q) => sum + Number(q.totalAmount || 0), 0),
    [p.quotations],
  );

  const r = p.dealsRollup;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
      {/* KPI รวมระดับโครงการ — สูตรเดียวกับ projectRollup (FC Total / Actual / FC คงเหลือ) */}
      {r && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Kpi label="ดีลในโครงการ" value={deals.length}
            hint={Object.entries(r.byType || {}).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(" · ") || null} />
          <Kpi label="FC Total" value={fmtMoneyCompact(r.fcTotal)} hint="Σ FC ดีล won + เปิด" />
          <Kpi label="Actual" value={fmtMoneyCompact(r.actual)} color="var(--green)" hint="Σ มูลค่าปิดจริง (Won)" />
          <Kpi label="FC คงเหลือ" value={fmtMoneyCompact(r.fcRemaining)} color={r.fcRemaining > 0 ? "var(--amber)" : undefined} hint="Σ FC ดีลที่ยังเปิด" />
          <Kpi label="มูลค่ารวม" value={fmtMoneyCompact(r.totalValue)} hint="Actual + FC คงเหลือ" />
          <Kpi label="ใบเสนอที่รับแล้ว" value={fmtMoneyCompact(acceptedTotal)} hint={`ทั้งหมด ${(p.quotations || []).length} ใบ`} />
        </div>
      )}

      {/* การ์ดดีล — จิ๊กซอว์แต่ละชิ้น */}
      <div className="glass-panel" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>ดีลในโครงการ ({deals.length})</h3>
          {central && (
            <span className="ui-badge" style={{ color: "var(--text-3)" }} title="ขั้นตอนในไทม์ไลน์ที่ไม่ผูกดีล (งานกลาง/ข้อมูลเดิม)">
              งานกลาง {central.done}/{central.total}
            </span>
          )}
          <div className="spacer" style={{ flex: 1 }} />
          {canEdit && (
            <button type="button" className="btn btn-primary sm" onClick={() => setLinkOpen(true)}>
              <Plus size={13} aria-hidden="true" /> ผูกดีล
            </button>
          )}
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>ใบเสนอราคา/ไทม์ไลน์ แก้ไขที่หน้าดีลแต่ละใบ</span>
        </div>
        {deals.length ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))" }}>
            {deals.map((d) => (
            <DealCard key={d.id} deal={d} seg={segments.get(d.id) || { done: 0, total: 0, current: null }} quotes={quotesByDeal.get(d.id) || []} />
            ))}
          </div>
        ) : (
          <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-3)" }}>
            <PackageCheck size={28} aria-hidden="true" style={{ margin: "0 auto 8px" }} />
            <div style={{ fontWeight: 700, color: "var(--text)" }}>ยังไม่มีดีลในโครงการ</div>
            <div style={{ marginTop: 4, fontSize: 13 }}>ผูกดีลของลูกค้ารายนี้เพื่อรวมไทม์ไลน์ ใบเสนอราคา งาน และความเคลื่อนไหว</div>
            {canEdit && <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setLinkOpen(true)}><Plus size={14} /> ผูกดีลแรก</button>}
          </div>
        )}
      </div>

      <Modal open={linkOpen} onClose={() => !linking && setLinkOpen(false)} title="ผูกดีลเข้าโครงการ" size="sm">
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label>ดีลของ {p.customerName || "ลูกค้ารายนี้"} หรือดีลที่ยังไม่มีลูกค้า</label>
            <Select fullWidth value={dealId} onChange={(event) => setDealId(event.target.value)}>
              <option value="">— เลือกดีลที่ยังไม่ผูกโครงการ —</option>
              {availableDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title} · {dealTypeOf(deal)} · {STAGE_LABELS[deal.stage] || deal.stage}{!deal.customerId ? " · ยังไม่มีลูกค้า" : ""}</option>)}
            </Select>
            {!availableDeals.length && <div style={{ marginTop: 6, color: "var(--text-3)", fontSize: 12 }}>ไม่พบดีลที่ผูกได้สำหรับลูกค้ารายนี้หรือดีลที่ยังไม่มีลูกค้า</div>}
            {availableDeals.some((deal) => !deal.customerId) && <div style={{ marginTop: 6, color: "var(--text-3)", fontSize: 12 }}>เมื่อผูกดีลที่ยังไม่มีลูกค้า ระบบจะตั้งลูกค้าให้ตรงกับโครงการอัตโนมัติ</div>}
          </div>
          <div className="form-group"><label>วันที่เริ่ม segment</label><DateInput value={startDate} onChange={setStartDate} className="w-full" /></div>
          {linkError && <div style={{ color: "var(--red)", fontSize: 13 }}>{linkError}</div>}
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setLinkOpen(false)} disabled={linking}>ยกเลิก</button><button type="button" className="btn btn-primary" onClick={linkDeal} disabled={linking || !dealId}>{linking ? "กำลังผูก..." : "ผูกเข้าโครงการ"}</button></div>
        </div>
      </Modal>
    </div>
  );
}
