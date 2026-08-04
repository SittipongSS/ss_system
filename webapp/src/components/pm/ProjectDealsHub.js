"use client";
import { TableScroll } from "@/components/ui/Table";

// ศูนย์รวมดีลในโครงการ — โครงการ = จิ๊กซอว์ครอบดีล: ดีลมีอะไร โครงการ merge หมด
// การ์ดต่อดีล (ใบเสนอราคา + ความคืบหน้า segment ไทม์ไลน์ อยู่ "ใต้ดีล") +
// KPI rollup และฟีดความเคลื่อนไหวรวม "คงระดับโครงการ" ไว้. อ่านอย่างเดียว —
// เพิ่ม/แก้ใบเสนอราคา/อัปเดตงาน ทำที่หน้าดีลตามเดิม.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, FileText, FolderKanban, MessageSquare, PackageCheck, Plus, Search } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import UpdateThread from "@/components/updates/UpdateThread";
import { updateKindMeta } from "@/lib/master/updateTypes";
import { useCan } from "@/lib/roleContext";
import { DEAL_TYPE_LABELS, STAGE_LABELS, dealTypeOf, isWonStage } from "@/lib/salesPlanning";
import { dealTypeBadge } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtMoneyCompact } from "@/lib/format";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { isDealAvailableForProject } from "@/lib/sales/projectLink";
import styles from "./ProjectDealsHub.module.css";

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
  closed: { label: "ปิด (ดีลจบด้วยใบอื่น)", color: "var(--text-3)" },
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
      <div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)", fontWeight: "var(--fw-semibold)" }}>{label}</div>
      <div className="mono tabular-nums" style={{ marginTop: 6, fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)", color: color || "inherit" }}>{value}</div>
      {hint && <div style={{ marginTop: 3, color: "var(--text-3)", fontSize: "var(--fs-4)" }}>{hint}</div>}
    </div>
  );
}

const displayText = (value, fallback = "-") => {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value.name || value.label || value.title || fallback;
};

/* ดีล 1 ใบ = 1 แถว (มติผู้ใช้ 2026-08-05 — เดิมเป็นการ์ดสูงใบละ ~180px เรียงคอลัมน์เดียว
   โครงการที่มี 10 ดีลจึงต้องสกอลล์ ~2,000px กว่าจะพ้นรายการดีล)
   ⚠️ ของที่ "ต้องเทียบข้ามดีล" (ชนิด · สถานะ · มูลค่า · จำนวน QT · ความคืบหน้า) อยู่บนแถว
   ของที่ "ดูทีละใบ" (ใบเสนอราคารายใบ · AE · เดือน forecast · ขั้นที่กำลังทำ) อยู่ในแถวขยาย
   ⇒ เพิ่มคอลัมน์ใหม่ให้ถามก่อนว่ามันอยู่ฝั่งไหน อย่าให้แถวยาวจนเลขเงินไม่มีที่อยู่ */
function DealRow({ deal, seg, quotes, directory, expanded, onToggle, canReorder, filtering, canMoveUp, canMoveDown, moving, onMoveUp, onMoveDown, columnCount }) {
  const closed = isWonStage(deal.stage);
  const value = closed ? (deal.wonValue ?? deal.projectValue) : deal.projectValue;
  const pct = seg.total ? Math.round((seg.done / seg.total) * 100) : 0;
  return (
    <>
      <tr className="premium-row">
        {canReorder && (
          <td>
            {/* ⚠️ ปิดตอนกำลังค้นหา ไม่ใช่ซ่อนคอลัมน์ — ซ่อนแล้วหัวตารางกับแถวจะเหลื่อมกัน */}
            <span className={styles.reorder}>
              <button type="button" className="btn-icon" onClick={onMoveUp} disabled={moving || filtering || !canMoveUp} aria-label={`เลื่อนดีล ${deal.title} ขึ้น`} title={filtering ? "ล้างคำค้นก่อนจึงจะจัดลำดับได้" : "เลื่อนดีลขึ้น"}><ArrowUp size={13} /></button>
              <button type="button" className="btn-icon" onClick={onMoveDown} disabled={moving || filtering || !canMoveDown} aria-label={`เลื่อนดีล ${deal.title} ลง`} title={filtering ? "ล้างคำค้นก่อนจึงจะจัดลำดับได้" : "เลื่อนดีลลง"}><ArrowDown size={13} /></button>
            </span>
          </td>
        )}
        <td>
          <div className={styles.dealCell}>
            {dealTypeBadge(dealTypeOf(deal))}
            <Link prefetch={false} href={`/sa/deals/${deal.id}`} className={`linklike ${styles.dealTitle}`}>
              {displayText(deal.title)}
            </Link>
          </div>
          {deal.formulaName && <div className={styles.subLine}>สูตร {displayText(deal.formulaName)}</div>}
        </td>
        <td>{stageBadge(deal.stage)}</td>
        {/* สีตามผลของดีล = ข้อมูล ไม่ใช่สไตล์ (เขียว = ปิดได้จริง · แดง = แพ้) */}
        <td className="num mono tabular-nums" style={{ color: closed ? "var(--green)" : deal.stage === "lost" ? "var(--red)" : "inherit" }}>
          {fmtMoney(value)}
          <div className={styles.valueNote}>{closed ? "ปิดจริง" : `FC${deal.forecastMonth ? ` · ${deal.forecastMonth}` : ""}`}</div>
        </td>
        <td className="num mono tabular-nums">{quotes.length || <span className={styles.muted}>-</span>}</td>
        <td>
          {seg.total ? (
            <div className={styles.progressCell}>
              <div className="progress" role="progressbar" aria-valuenow={seg.done} aria-valuemax={seg.total} aria-label={`ไทม์ไลน์ ${deal.title}`}>
                <span className={seg.done === seg.total ? "done" : undefined} style={{ width: `${pct}%` }} />
              </div>
              <span className={`mono tabular-nums ${styles.progressCount}`}>{seg.done}/{seg.total}</span>
            </div>
          ) : <span className={styles.muted}>ยังไม่มี segment</span>}
        </td>
        <td>
          <button
            type="button"
            className="btn ghost sm"
            onClick={onToggle}
            aria-expanded={expanded}
            title={expanded ? "ย่อรายละเอียดดีล" : "ดูใบเสนอราคา / AE / ขั้นที่กำลังทำ"}
          >
            {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />} รายละเอียด
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={columnCount}>
            <div className={styles.expandPanel}>
              <div className={styles.expandInfo}>
                {/* ชื่อ AE อ่านจาก ownerId — สำเนาชื่อในแถวไม่ขยับตอนเจ้าตัวเปลี่ยนชื่อ */}
                <div><span className={styles.mutedBadge}>AE </span>{displayText(livePersonName(directory, deal.ownerId, deal.ownerName))}{deal.team ? ` · ${displayText(deal.team, "")}` : ""}</div>
                <div className={styles.expandInfoLine}>
                  <PackageCheck size={13} aria-hidden="true" className={styles.expandInfoIcon} />
                  {seg.current ? <span>กำลังทำ: {seg.current}</span> : <span className={styles.mutedBadge}>ไม่มีขั้นตอนที่กำลังทำ</span>}
                </div>
                <Link prefetch={false} href={`/sa/deals/${deal.id}`} className={`btn ghost sm ${styles.openDeal}`}>
                  <ExternalLink size={13} aria-hidden="true" /> เปิดดีล
                </Link>
              </div>
              <div className={styles.quoteList}>
                <div className={styles.quoteHead}>
                  <FileText size={13} aria-hidden="true" /> ใบเสนอราคาของดีลนี้
                  <span className={`ui-badge ${styles.mutedBadge}`}>{quotes.length}</span>
                </div>
                {quotes.length ? quotes.map((q) => (
                  <div key={q.id} className={styles.quoteRow}>
                    <Link prefetch={false} href={`/sa/quotations/${q.id}`} className={`linklike mono ${styles.quoteNo}`}>{q.quoteNumber}</Link>
                    {/* สีป้าย = สถานะของใบ (ข้อมูล) — ทะเบียนเดียวกับตารางในแท็บเอกสาร */}
                    <span className="ui-badge" style={{ color: QUOTE_STATUS[q.status]?.color || "var(--text-3)" }}>{QUOTE_STATUS[q.status]?.label || q.status}</span>
                    <span className={`mono tabular-nums ${styles.quoteAmount}`}>{fmtMoney(q.totalAmount)}</span>
                  </div>
                )) : <div className={styles.quoteEmpty}>ยังไม่มี — สร้างได้ที่เมนูใบเสนอราคา</div>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ใบเสนอราคาจริงที่รวมจากทุกดีล ใช้ชุดเดียวกันทั้งแท็บและหน้า Overview
export function ProjectQuotationsCard({ project: p }) {
  const dealById = useMemo(() => new Map((p.deals || []).map((deal) => [deal.id, deal])), [p.deals]);
  const quotes = p.quotations || [];
  const salesOrders = p.salesOrders || [];
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", marginBottom: 24 }}>
    <section className="glass-panel" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <FileText size={18} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: "var(--fs-10)" }}>ใบเสนอราคา</h2>
        <span className="ui-badge" style={{ color: "var(--text-3)" }}>{quotes.length} ใบ</span>
        <div className="spacer" />
        <Link href="/sa/quotations" className="btn ghost sm"><ExternalLink size={13} aria-hidden="true" /> เมนูใบเสนอราคา</Link>
      </div>
      {quotes.length ? (
        /* 🐞 เดิมห่อด้วย `.premium-glass-table.table-responsive` + `.premium-table` ซึ่งบังคับ
           `white-space: nowrap !important` ทุกเซลล์ — ชื่อดีลไทยยาว ๆ จึงดันตารางกว้างเกิน
           การ์ด แล้วคอลัมน์ "สถานะ/ยอดรวม" ถูกตัดหายไปหลังสกอลล์ (ผู้ใช้ส่งภาพมา 2026-08-05)
           ตารางกลางปล่อยให้เซลล์ตัดบรรทัดตามปกติ คอลัมน์จึงอยู่ครบในความกว้างเท่าเดิม */
        <div>
          <TableScroll surface="embedded"><table>
            <thead><tr><th>เลขที่</th><th>ดีล</th><th>สถานะ</th><th className="num">ยอดรวม</th></tr></thead>
            <tbody>{quotes.map((quote) => {
              const deal = dealById.get(quote.dealId);
              const status = QUOTE_STATUS[quote.status];
              return (
                <tr key={quote.id} className="premium-row">
                  <td><Link prefetch={false} href={`/sa/quotations/${quote.id}`} className="linklike mono">{quote.quoteNumber}</Link></td>
                  <td>{deal ? <Link prefetch={false} href={`/sa/deals/${deal.id}`} className="linklike">{deal.title}</Link> : "-"}</td>
                  <td><span className="ui-badge" style={{ color: status?.color || "var(--text-3)" }}>{status?.label || quote.status || "-"}</span></td>
                  <td className="num mono tabular-nums">{fmtMoney(quote.totalAmount)}</td>
                </tr>
              );
            })}</tbody>
          </table></TableScroll>
        </div>
      ) : (
        <div style={{ padding: 18, color: "var(--text-3)", fontSize: "var(--fs-7)" }}>ยังไม่มีใบเสนอราคา — สร้างได้จากเมนู <Link href="/sa/quotations" className="linklike">ใบเสนอราคา</Link></div>
      )}
    </section>
    <section className="glass-panel" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <FileText size={18} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: "var(--fs-10)" }}>Sale Order</h2>
        <span className="ui-badge" style={{ color: "var(--text-3)" }}>{salesOrders.length} ใบ</span>
        <div className="spacer" />
        <Link href="/sa/sales-orders" className="btn ghost sm"><ExternalLink size={13} aria-hidden="true" /> เมนู Sale Order</Link>
      </div>
      {salesOrders.length ? (
        <div>
          <TableScroll surface="embedded"><table>
            <thead><tr><th>เลขที่ SO</th><th>ดีล</th><th>สถานะ</th><th className="num">Actual</th></tr></thead>
            <tbody>{salesOrders.map((order) => {
              const deal = dealById.get(order.dealId);
              return <tr key={order.id} className="premium-row">
                <td><Link prefetch={false} href={`/sa/sales-orders/${order.id}`} className="linklike mono">{order.orderNumber}</Link></td>
                <td>{deal ? <Link prefetch={false} href={`/sa/deals/${deal.id}`} className="linklike">{deal.title}</Link> : "-"}</td>
                <td><span className="ui-badge" style={{ color: order.status === "approved" ? "var(--green)" : order.status === "pending_approval" ? "var(--amber)" : "var(--text-3)" }}>{({ draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" })[order.status] || order.status}</span></td>
                <td className="num mono tabular-nums">{fmtMoney(order.status === "approved" ? order.actualAmount : 0)}</td>
              </tr>;
            })}</tbody>
          </table></TableScroll>
        </div>
      ) : <div style={{ padding: 18, color: "var(--text-3)", fontSize: "var(--fs-7)" }}>ยังไม่มี Sale Order — ผู้ขายสร้างร่างได้จาก QT ที่ Won</div>}
    </section>
    </div>
  );
}

// ── ความเคลื่อนไหวโครงการ ────────────────────────────────────────────────
// เธรดของ **ตัวโครงการ** เป็นเจ้าของกล่องพิมพ์เพียงกล่องเดียวบนหน้านี้ ส่วนความ
// เคลื่อนไหวของดีลลูกไหลเข้ามาเรียงในเส้นเรื่องเดียวกันแบบ **อ่านอย่างเดียว**
// พร้อมลิงก์เข้าไปดีลใบนั้น (ท่า "เก็บแยก โชว์รวม" เดียวกับลีด/ดีล)
//
// ⭐ มติผู้ใช้ 2026-08-01: **พิมพ์ที่ไหน = ลงที่นั่น** — ของเดิมเป็นฟอร์มที่เลือกดีล
// จาก dropdown แล้วโพสต์ข้ามใบ ซึ่งพังสามชั้น: (ก) ข้อความขาดบริบทตอนถูกอ่านจาก
// หน้าดีล (เขียนตอนเทียบหลายดีลอยู่) (ข) เลือกผิดใบแล้วกู้ไม่ได้ — ย้ายเธรดข้าม
// entity ไม่ได้ ต้องลบทิ้งซึ่งเหลือรอย "ข้อความนี้ถูกลบแล้ว" ในดีลผิดใบถาวร
// (ค) เป็น UI ชุดที่สองที่ขาดไฟล์แนบ/ยกคำพูด/ป้ายฝ่าย/กำหนดวันไปเงียบ ๆ
//
// เส้นแบ่งว่าเรื่องไหนลงเธรดไหน: **"ถ้าดีลใบนี้ถูกยกเลิก ข้อความนี้ยังจริงไหม"**
// ยังจริง (ลูกค้าเลื่อนส่งมอบทั้งล็อต) → เธรดโครงการ · ไม่จริงแล้ว (ต่อราคาใบนั้น)
// → เธรดของดีลใบนั้น
export function ProjectActivityFeed({ project: p, onChanged }) {
  // ทั้งหมด | project (เฉพาะเรื่องระดับโครงการ) | <dealId> (เฉพาะดีลใบเดียว)
  const [scope, setScope] = useState("all");

  // เสนอเฉพาะดีลที่ **อ่านเธรดได้จริง** (server กรองมาให้ใน dealFeedIds) — ไม่งั้น
  // เลือกแล้วได้ผลว่าง โดยแยกไม่ออกว่าไม่มีความเคลื่อนไหวหรือไม่มีสิทธิ์
  const feedDeals = useMemo(() => {
    const allowed = new Set(p.dealFeedIds || []);
    return (p.deals || []).filter((deal) => allowed.has(deal.id));
  }, [p.deals, p.dealFeedIds]);

  // ความเคลื่อนไหวของดีล → รายการอ่านอย่างเดียวของเธรดกลาง
  // ป้าย/สีมาจาก **ทะเบียนชนิดกลาง** (updateKindMeta) ไม่ใช่ตารางท้องถิ่นอีกชุด —
  // ของเดิมมี ACTIVITY_KIND ของตัวเองที่ต้องแก้คู่มือกับ UPDATE_KINDS.deal ทุกครั้ง
  const extraItems = useMemo(() => {
    const dealById = new Map((p.deals || []).map((d) => [d.id, d]));
    const dealLink = (deal) => (deal
      ? { href: `/sa/deals/${deal.id}`, linkLabel: deal.title || deal.id }
      : {});
    const rows = [
      ...(p.dealActivities || []).map((a) => ({
        id: `act-${a.id}`,
        at: a.activityAt || a.createdAt,
        dealId: a.dealId,
        ...updateKindMeta("deal", a.kind),
        body: a.body,
        by: a.createdByName,
        ...dealLink(dealById.get(a.dealId)),
      })),
      ...(p.dealStageHistory || []).map((h) => ({
        id: `st-${h.id}`,
        at: h.changedAt,
        dealId: h.dealId,
        label: "สถานะ",
        color: "var(--text-3)",
        body: `${STAGE_LABELS[h.fromStage] || h.fromStage || "เริ่ม"} → ${STAGE_LABELS[h.toStage] || h.toStage}`,
        by: h.changedByName,
        ...dealLink(dealById.get(h.dealId)),
      })),
    ];
    if (scope === "project") return [];
    if (scope === "all") return rows;
    return rows.filter((row) => row.dealId === scope);
  }, [p.dealActivities, p.dealStageHistory, p.deals, scope]);

  return (
    <div className="glass-panel" style={{ padding: "16px 20px", marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <MessageSquare size={16} aria-hidden="true" />
        <h3 style={{ margin: 0, fontSize: "var(--fs-9)", fontWeight: "var(--fw-bold)" }}>ความเคลื่อนไหวโครงการ</h3>
        {/* ดีลที่ผู้อ่านไม่มีสิทธิ์เห็นถูกกรองที่ server — ต้องบอกตรง ๆ ว่ามีของที่ถูกซ่อน
            ไม่งั้นเส้นเรื่องที่สั้นลงจะอ่านเป็น "ยังไม่มีความเคลื่อนไหว" คนละความหมายกัน */}
        {p.hiddenDealFeeds > 0 && (
          <span className="ui-badge">ซ่อน {p.hiddenDealFeeds} ดีลที่ไม่มีสิทธิ์เห็น</span>
        )}
        <div className="spacer" style={{ flex: 1 }} />
        {feedDeals.length > 0 && (
          <Select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="ความเคลื่อนไหวที่แสดง">
            <option value="all">ทั้งหมด</option>
            <option value="project">เฉพาะเรื่องระดับโครงการ</option>
            {feedDeals.map((deal) => (
              <option key={deal.id} value={deal.id}>ดีล: {deal.title}</option>
            ))}
          </Select>
        )}
      </div>
      {/* กล่องพิมพ์ลงเธรดของโครงการเสมอ · เรื่องของดีลกดลิงก์เข้าไปพิมพ์ในดีลใบนั้น */}
      <UpdateThread
        entityType="project"
        entityId={p.id}
        order="desc"
        extraItems={extraItems}
        placeholder="พิมพ์เรื่องระดับโครงการ เช่น ลูกค้าขอเลื่อนส่งมอบทั้งล็อตเป็นสิงหาคม..."
        emptyText="ยังไม่มีความเคลื่อนไหว — เรื่องที่ยังจริงแม้ดีลใบใดใบหนึ่งถูกยกเลิก บันทึกไว้ตรงนี้ได้"
        onPosted={onChanged}
      />
    </div>
  );
}

export default function ProjectDealsHub({ project: p, onChanged }) {
  const canEditSales = useCan("salesplan:edit");
  const canEditProjects = useCan("pm:edit");
  const canEdit = canEditSales && canEditProjects;
  const directory = usePeopleDirectory(); // ชื่อ AE ปัจจุบันของแต่ละดีล
  const deals = useMemo(() => p.deals || [], [p.deals]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [availableDeals, setAvailableDeals] = useState([]);
  const [dealId, setDealId] = useState("");
  const [startDate, setStartDate] = useState(localToday());
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderError, setReorderError] = useState("");
  const [expandedDeals, setExpandedDeals] = useState([]); // แถวที่กางรายละเอียดอยู่
  const [dealQuery, setDealQuery] = useState("");

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

  const moveDeal = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= deals.length || reorderBusy) return;
    const dealIds = deals.map((deal) => deal.id);
    [dealIds[index], dealIds[targetIndex]] = [dealIds[targetIndex], dealIds[index]];
    setReorderBusy(true);
    setReorderError("");
    try {
      const res = await fetch(`/api/pm/projects/${p.id}/deal-order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "จัดลำดับดีลไม่สำเร็จ");
      await onChanged?.();
    } catch (error) {
      setReorderError(error.message || "จัดลำดับดีลไม่สำเร็จ");
    } finally {
      setReorderBusy(false);
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
  const canReorder = canEdit && deals.length > 1;
  // คอลัมน์: [จัดลำดับ] ดีล · สถานะ · มูลค่า · QT · ไทม์ไลน์ · ปุ่มขยาย
  const columnCount = canReorder ? 7 : 6;
  /* ค้นหาโผล่เมื่อดีลเกิน 6 ใบ — ต่ำกว่านั้นตากวาดครบอยู่แล้ว ช่องค้นหาจะเป็นแค่ของรก
     ⚠️ กรองแล้ว "จัดลำดับ" ต้องปิด: ปุ่มขึ้น/ลงสลับกับเพื่อนบ้าน **ในลิสต์เต็ม** ถ้ากรองอยู่
     เพื่อนบ้านที่เห็นกับที่สลับจริงคนละใบ — ผู้ใช้จะเห็นดีลกระโดดข้ามใบที่ถูกซ่อน */
  const showSearch = deals.length > 6;
  const q = dealQuery.trim().toLowerCase();
  const shownDeals = q
    ? deals.filter((deal) => [deal.title, deal.formulaName, deal.dealType, deal.ownerName]
      .some((field) => (field || "").toLowerCase().includes(q)))
    : deals;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
      {/* KPI รวมระดับโครงการ — สูตรเดียวกับ projectRollup (FC Total / Actual / FC คงเหลือ)
          ⚠️ เงินล้วน: ตัวนับ "ดีลในโครงการ" ถูกถอดออก (มติผู้ใช้ 2026-08-05) เพราะบอก
          เรื่องเดียวกับหัวตารางด้านล่าง "ดีลในโครงการ (N)" ที่อยู่ห่างกันไม่ถึงหนึ่งจอ */}
      {r && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Kpi label="FC Total" value={fmtMoneyCompact(r.fcTotal)} />
          <Kpi label="Actual" value={fmtMoneyCompact(r.actual)} color="var(--green)" />
          <Kpi label="FC คงเหลือ" value={fmtMoneyCompact(r.fcRemaining)} color={r.fcRemaining > 0 ? "var(--amber)" : undefined} />
          <Kpi label="ใบเสนอที่รับแล้ว" value={fmtMoneyCompact(acceptedTotal)} hint={`ทั้งหมด ${(p.quotations || []).length} ใบ`} />
        </div>
      )}

      {/* ตารางดีล — เทียบข้ามใบได้ในจอเดียว กดขยายดูรายละเอียดทีละใบ */}
      <div className="glass-panel" style={{ padding: "16px 20px" }}>
        <div className={styles.tableHead}>
          {/* ไอคอนดีลตัวเดียวกับเมนูหลัก — ดู src/lib/dealIcon.test.mjs (เดิมอยู่บนการ์ด
              "ดีลในโครงการ" ของหน้าโครงการ ที่ถูกยุบมาเป็นตารางนี้) */}
          <FolderKanban size={17} aria-hidden="true" />
          <h3>ดีลในโครงการ ({deals.length})</h3>
          {/* ชนิดของดีลที่โครงการนี้ผ่านมาแล้ว — เดิมเป็น hint ใต้ KPI ที่ถอดไป */}
          {(r?.byType || [])
            .filter((item) => (item.openCount + item.wonCount + item.lostCount) > 0)
            .map((item) => (
              <span key={item.type} className={`ui-badge ${styles.mutedBadge}`}>
                {DEAL_TYPE_LABELS[item.type] || item.type} {item.openCount + item.wonCount + item.lostCount}
              </span>
            ))}
          {central && (
            <span className={`ui-badge ${styles.mutedBadge}`} title="ขั้นตอนในไทม์ไลน์ที่ไม่ผูกดีล (งานกลาง/ข้อมูลเดิม)">
              งานกลาง {central.done}/{central.total}
            </span>
          )}
          <div className="spacer" />
          {showSearch && (
            <div className={`search-glass ${styles.search}`}>
              <Search size={15} color="var(--text-3)" aria-hidden="true" />
              <input value={dealQuery} onChange={(event) => setDealQuery(event.target.value)} placeholder="ค้นหาดีล / สูตร / AE" aria-label="ค้นหาดีลในโครงการ" />
            </div>
          )}
          {canEdit && (
            <button type="button" className="btn btn-primary sm" onClick={() => setLinkOpen(true)}>
              <Plus size={13} aria-hidden="true" /> ผูกดีล
            </button>
          )}
        </div>
        {reorderError && <div className={styles.errorNote}>{reorderError}</div>}
        {deals.length ? (
          <>
            {/* ตารางกลางล้วน ๆ — ไม่มี `.premium-glass-table` / `.premium-table` ครอบ
                (พื้น ขอบ padding แถว ฟอนต์ตัวเลข มาจาก Table.module.css หมดแล้ว) */}
            <TableScroll surface="embedded"><table>
              <thead>
                <tr>
                  {canReorder && <th aria-label="จัดลำดับ" />}
                  <th>ดีล</th>
                  <th>สถานะ</th>
                  <th className="num">มูลค่า</th>
                  <th className="num">QT</th>
                  <th>ไทม์ไลน์</th>
                  <th aria-label="รายละเอียด" />
                </tr>
              </thead>
              <tbody>
                {shownDeals.map((d) => {
                  const index = deals.indexOf(d);
                  return (
                    <DealRow
                      key={d.id}
                      deal={d}
                      seg={segments.get(d.id) || { done: 0, total: 0, current: null }}
                      quotes={quotesByDeal.get(d.id) || []}
                      directory={directory}
                      expanded={expandedDeals.includes(d.id)}
                      onToggle={() => setExpandedDeals((current) => (
                        current.includes(d.id) ? current.filter((item) => item !== d.id) : [...current, d.id]
                      ))}
                      columnCount={columnCount}
                      canReorder={canReorder}
                      filtering={!!q}
                      canMoveUp={index > 0}
                      canMoveDown={index < deals.length - 1}
                      moving={reorderBusy}
                      onMoveUp={() => moveDeal(index, -1)}
                      onMoveDown={() => moveDeal(index, 1)}
                    />
                  );
                })}
                {!shownDeals.length && (
                  <tr><td colSpan={columnCount} className={styles.noMatch}>ไม่พบดีลที่ตรงกับ “{dealQuery}”</td></tr>
                )}
              </tbody>
            </table></TableScroll>
            <div className={styles.footNote}>ใบเสนอราคา/ไทม์ไลน์ แก้ไขที่หน้าดีลแต่ละใบ</div>
          </>
        ) : (
          <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-3)" }}>
            <PackageCheck size={28} aria-hidden="true" style={{ margin: "0 auto 8px" }} />
            <div style={{ fontWeight: "var(--fw-bold)", color: "var(--text)" }}>ยังไม่มีดีลในโครงการ</div>
            <div style={{ marginTop: 4, fontSize: "var(--fs-7)" }}>ผูกดีลของลูกค้ารายนี้เพื่อรวมไทม์ไลน์ ใบเสนอราคา งาน และความเคลื่อนไหว</div>
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
            {!availableDeals.length && <div style={{ marginTop: 6, color: "var(--text-3)", fontSize: "var(--fs-5)" }}>ไม่พบดีลที่ผูกได้สำหรับลูกค้ารายนี้หรือดีลที่ยังไม่มีลูกค้า</div>}
            {availableDeals.some((deal) => !deal.customerId) && <div style={{ marginTop: 6, color: "var(--text-3)", fontSize: "var(--fs-5)" }}>เมื่อผูกดีลที่ยังไม่มีลูกค้า ระบบจะตั้งลูกค้าให้ตรงกับโครงการอัตโนมัติ</div>}
          </div>
          <div className="form-group"><label>วันที่เริ่ม segment</label><DateInput value={startDate} onChange={setStartDate} className="w-full" /></div>
          {linkError && <div style={{ color: "var(--red)", fontSize: "var(--fs-7)" }}>{linkError}</div>}
          <div className="form-action-bar"><button type="button" className="btn" onClick={() => setLinkOpen(false)} disabled={linking}>ยกเลิก</button><button type="button" className="btn btn-primary" onClick={linkDeal} disabled={linking || !dealId}>{linking ? "กำลังผูก..." : "ผูกเข้าโครงการ"}</button></div>
        </div>
      </Modal>
    </div>
  );
}
