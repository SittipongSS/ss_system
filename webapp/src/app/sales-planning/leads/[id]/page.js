"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BriefcaseBusiness, Building2, CalendarClock, CircleDollarSign, Contact, Inbox, Mail, Pencil, Phone, Save, Sparkles, Trash2, UserRound, Users, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ReadableText from "@/components/ui/ReadableText";
import Select from "@/components/ui/Select";
import MoneyInput from "@/components/ui/MoneyInput";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import UpdateThread from "@/components/updates/UpdateThread";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import RecordControlCard from "@/components/ui/RecordControlCard";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { createLeadLifecycle, LEAD_TRANSITION_ACTIONS } from "@/lib/sales/leadLifecycle";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { fmtDateTime, fmtMoney, fmtName } from "@/lib/format";
import { TEAM_LABELS } from "@/lib/permissions";
import { CHANNEL_GROUP_COLORS, LEAD_CHANNELS, LEAD_CHANNEL_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, SERVICE_INTERESTS, SERVICE_INTEREST_LABELS, channelGroupOf } from "@/lib/sales/leads";
import styles from "./page.module.css";
import Textarea from "@/components/ui/Textarea";

const EVENT_LABELS = { create: "รับลีดเข้าระบบ", screen: "คัดกรองและส่งทีม", assign: "มอบหมายผู้รับผิดชอบ", contact: "ติดต่อลูกค้า", meeting: "นัดหมาย", qualify: "สร้างดีล", bounce: "ส่งกลับคิวคัดกรอง", disqualify: "ปิดลีด — ไม่ไปต่อ", update: "แก้ไขข้อมูลลีด" };
const blank = { contactName: "", company: "", phone: "", email: "", contactChannel: "", channel: "website", serviceInterest: "other", serviceDetail: "", budget: "", details: "" };

export default function LeadDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [lead, setLead] = useState(null);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* ตัวตนผู้ใช้สำหรับตัดสินว่าปุ่มไหนควรโผล่ — ท่าเดียวกับหน้ารายการลีด
     (role/team มาจาก context ส่วน id ต้องถามเพราะ context ไม่ได้เก็บไว้) */
  const role = useRole();
  const team = useTeam();
  const canCreateDeals = useCan("salesplan:deal");
  const [meId, setMeId] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch("/api/users/me").then((r) => (r.ok ? r.json() : null))
      .then((me) => setMeId(me?.id || null)).catch(() => setMeId(null));
  }, []);

  // รายชื่อสำหรับช่อง "ผู้รับผิดชอบ" ตอนมอบหมาย — โหลดเมื่อผู้ใช้มีสิทธิ์มอบหมายเท่านั้น
  const needsAssignees = lead?.status === "screened";
  useEffect(() => {
    if (!needsAssignees) return;
    fetch("/api/users").then((r) => (r.ok ? r.json() : null))
      .then((rows) => setUsers(Array.isArray(rows) ? rows : rows?.items || []))
      .catch(() => setUsers([]));
  }, [needsAssignees]);

  const viewer = useMemo(() => ({ role, id: meId, team }), [role, meId, team]);
  const lifecycle = useMemo(
    () => createLeadLifecycle({ users, canCreateDeals }),
    [users, canCreateDeals],
  );

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/sales-planning/leads/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "ไม่สามารถโหลดข้อมูลลีดได้");
      setLead(body);
      setForm({ ...blank, ...body, budget: body.budget ?? "" });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  const change = (key) => (e) => setForm((v) => ({ ...v, [key]: e?.target ? e.target.value : e }));

  // เหตุการณ์ระบบของลีด → รายการอ่านอย่างเดียวในเธรดกลาง ("เก็บแยก โชว์รวม")
  // ท่าเดียวกับประวัติสถานะบนหน้าดีล · `reason`/`assigneeName` เป็นเนื้อของเหตุการณ์
  // ส่วนคนทำไปอยู่ช่อง `by` ของเธรด ไม่ใช่ยัดรวมเป็นข้อความเดียวเหมือนของเดิม
  const leadEventItems = useMemo(() => (lead?.events || []).map((event) => ({
    id: `ev-${event.id}`,
    at: event.createdAt,
    label: EVENT_LABELS[event.kind] || event.kind || "อัปเดตลีด",
    color: "var(--text-3)",
    by: event.createdByName || null,
    body: [event.reason, event.assigneeName].filter(Boolean).join(" · "),
  })), [lead?.events]);

  async function save() {
    setBusy(true); setError("");
    try {
      const payload = Object.fromEntries(Object.keys(blank).map((key) => [key, form[key]]));
      const res = await fetch(`/api/sales-planning/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
      setEditing(false); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  /* จุดเดียวที่ปุ่มบนการ์ดวิ่งเข้า — คืน false = ทำไม่สำเร็จ การ์ดจะค้างกล่องไว้
     พร้อมค่าที่กรอก ผู้ใช้ไม่ต้องพิมพ์เหตุผลใหม่ (สัญญาของ RecordControlCard) */
  async function runTransition(actionId, values) {
    /* เปิดดีล = สร้าง entity คนละตัว ต้องผ่านฟอร์มดีล (เลือกลูกค้า/มูลค่า/เดือน FC)
       ไม่ใช่ย้ายสถานะเฉย ๆ — lifecycle ประกาศไว้เพื่อให้ "ขั้นถัดไป" ถูกต้อง
       แต่การลงมือเกิดที่หน้าดีล ดักที่นี่ก่อนจะไปถึง /transition */
    if (actionId === "create_deal") {
      router.push(`/sales-planning/deals?fromLead=${encodeURIComponent(lead.id)}`);
      return true;
    }
    if (!LEAD_TRANSITION_ACTIONS.includes(actionId)) return false;

    setBusy(true); setError("");
    try {
      const assignee = users.find((u) => u.id === values.assigneeId);
      const res = await fetch(`/api/sales-planning/leads/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionId,
          team: values.team || undefined,
          assigneeId: values.assigneeId || undefined,
          assigneeName: assignee ? fmtName(assignee) : undefined,
          reason: values.reason || undefined,
          meetingMode: actionId === "meeting" ? values.meetingMode : undefined,
          eventAt: values.eventAt ? new Date(values.eventAt).toISOString() : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "ทำรายการไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally { setBusy(false); }
  }

  /* ลบ = ไม่ใช่การย้ายสถานะ จึงไม่อยู่ใน lifecycle — แต่ยังต้องอยู่บนการ์ดเดียวกัน
     เพราะจุดจัดการต้องมีที่เดียว (นโยบายจริงอยู่ที่ canDeleteLead ฝั่ง API) */
  async function removeLead() {
    const ok = await confirmAction({
      title: "ลบลีดนี้",
      message: `ลบลีดของ "${lead.contactName}" ออกจากระบบถาวร? ประวัติการดำเนินการจะหายไปด้วย`,
      confirmLabel: "ลบลีด",
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/sales-planning/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ลบไม่สำเร็จ");
      router.push("/sa/leads");
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const info = (label, value, wide = false) => <div className={`${styles.field} ${wide ? styles.wide : ""}`}><span className={styles.label}>{label}</span><div className={styles.value}>{typeof value === "string" ? <ReadableText text={value || "-"} lines={wide ? 5 : 3} /> : value || "-"}</div></div>;

  // ปุ่มแก้ไข = action ระดับ entity — ไอคอนแถวเดียวกับปุ่มย้อนกลับ ตามกติกา Page Header
  // ระหว่างแก้ไข ปุ่มยกเลิก/บันทึกอยู่แถวเดียวกัน (แพตเทิร์นเดียวกับหน้าใบเสนอราคา)
  const backActions = lead?.canEdit ? (!editing ? (
    <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} onClick={() => setEditing(true)} aria-label="แก้ไขลีด" title="แก้ไข">
      <Pencil size={16} aria-hidden="true" />
    </button>
  ) : (
    <>
      <button type="button" className="btn" onClick={() => { setEditing(false); setForm({ ...blank, ...lead, budget: lead.budget ?? "" }); }} disabled={busy}><X size={14} /> ยกเลิก</button>
      <button type="button" className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} /> {busy ? "กำลังบันทึก..." : "บันทึก"}</button>
    </>
  )) : null;

  return <Workspace icon={<Inbox size={22} />} title={lead?.contactName || "รายละเอียดลีด"} subtitle="ข้อมูลต้นทาง ผู้ติดต่อ และประวัติการดำเนินการ" back={{ href: "/sa/leads", label: "กลับหน้าลีด" }} backActions={backActions} hideHeader loading={loading}>
    {error && <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>{error}</div>}
    {lead && <div className={styles.page}>
        <SalesDetailOverview
          eyebrow="รายละเอียดลีด"
          title={lead.contactName}
          description={<><span>{lead.company || "บุคคลทั่วไป"}</span><span>·</span><span>รับผ่าน {LEAD_CHANNEL_LABELS[lead.channel] || lead.channel}</span></>}
          badges={<SalesStateBadge label={LEAD_STATUS_LABELS[lead.status] || lead.status} color={LEAD_STATUS_COLORS[lead.status]} />}
          facts={[
            { icon: Sparkles, label: "บริการที่สนใจ", value: SERVICE_INTEREST_LABELS[lead.serviceInterest] || lead.serviceInterest },
            { icon: CircleDollarSign, label: "งบประมาณ", value: lead.budget != null ? fmtMoney(lead.budget) : "ไม่ระบุ" },
            { icon: Users, label: "ทีม", value: TEAM_LABELS[lead.team] || lead.team || "ยังไม่มอบหมาย" },
            { icon: UserRound, label: "ผู้รับผิดชอบ", value: lead.assigneeName || "ยังไม่มอบหมาย" },
          ]}
        />

        {/* จุดจัดการเดียวของลีด — เดิมหน้านี้ทำได้แค่ "แก้ไข" ผู้ใช้ต้องถอยกลับไป
            หน้ารายการเพื่อเปลี่ยนสถานะหรือลบ ทั้งที่ API รองรับมาตลอด */}
        <DetailPageLayout aside={<>
          <RecordControlCard
            lifecycle={lifecycle}
            record={lead}
            user={viewer}
            onTransition={runTransition}
            busy={busy}
            footer={lead.canDelete ? (
              <Button tone="danger" icon={<Trash2 size={14} aria-hidden="true" />} onClick={removeLead} disabled={busy}>
                ลบลีดนี้
              </Button>
            ) : null}
          />
          <LeadSummary lead={lead} />
        </>}>

        <DetailCard icon={Contact} eyebrow="Lead information" title="ข้อมูลผู้ติดต่อและความต้องการ">
          {editing ? <div className={styles.grid}>
            <div className={styles.field}><label>ชื่อลูกค้า / ผู้ติดต่อ *</label><input value={form.contactName} onChange={change("contactName")} /></div>
            <div className={styles.field}><label>บริษัท</label><input value={form.company || ""} onChange={change("company")} /></div>
            <div className={styles.field}><label>โทรศัพท์</label><input value={form.phone || ""} onChange={change("phone")} /></div>
            <div className={styles.field}><label>อีเมล</label><input type="email" value={form.email || ""} onChange={change("email")} /></div>
            <div className={styles.field}><label>ช่องทางติดต่อเพิ่มเติม</label><input value={form.contactChannel || ""} onChange={change("contactChannel")} /></div>
            <div className={styles.field}><label>แหล่งที่มา</label><Select value={form.channel} onChange={change("channel")}>{LEAD_CHANNELS.map((v) => <option key={v} value={v}>{LEAD_CHANNEL_LABELS[v]}</option>)}</Select></div>
            <div className={styles.field}><label>บริการที่สนใจ</label><Select value={form.serviceInterest} onChange={change("serviceInterest")}>{SERVICE_INTERESTS.map((v) => <option key={v} value={v}>{SERVICE_INTEREST_LABELS[v]}</option>)}</Select></div>
            <div className={styles.field}><label>งบประมาณ</label><MoneyInput value={form.budget} onChange={change("budget")} /></div>
            <div className={`${styles.field} ${styles.wide}`}><label>รายละเอียดบริการ</label><input value={form.serviceDetail || ""} onChange={change("serviceDetail")} /></div>
            <div className={`${styles.field} ${styles.wide}`}><label>รายละเอียดเพิ่มเติม</label><Textarea value={form.details || ""} onChange={change("details")} /></div>
          </div> : <div className={styles.grid}>
            {info("ชื่อผู้ติดต่อ", <><Contact size={14} /> {lead.contactName}</>)}
            {info("บริษัท", <><Building2 size={14} /> {lead.company || "-"}</>)}
            {info("โทรศัพท์", <><Phone size={14} /> {lead.phone || "-"}</>)}
            {info("อีเมล", <><Mail size={14} /> {lead.email || "-"}</>)}
            {info("รายละเอียดบริการ", lead.serviceDetail)}
            {info("ช่องทางติดต่อเพิ่มเติม", lead.contactChannel)}
            {info("รายละเอียดเพิ่มเติม", lead.details, true)}
          </div>}
        </DetailCard>

        {!!lead.relatedDeals?.length && <DetailCard icon={BriefcaseBusiness} eyebrow="Converted opportunities" title="ดีลที่สร้างจาก Lead" meta={`${lead.relatedDeals.length} ดีล`}><ContextGrid>
          {lead.relatedDeals.map((deal) => <ContextCard key={deal.id} icon={BriefcaseBusiness} href={`/sales-planning/deals/${deal.id}`} eyebrow="ดีลจาก Lead" title={`${deal.code ? `${deal.code} · ` : ""}${deal.title}`} subtitle={deal.customerName || lead.company || lead.contactName} badges={<>{deal.dealType && <span className="ui-badge">{deal.dealType}</span>}<span className="ui-badge" style={{ color: deal.stage === "won" ? "var(--green)" : "var(--accent)" }}>{deal.stage}</span></>} facts={[{ label: "Forecast", value: deal.forecastMonth || "-" }, { label: "มูลค่า", value: fmtMoney(deal.wonValue ?? deal.projectValue ?? 0) }]} />)}
        </ContextGrid></DetailCard>}

        {/* เธรดกลาง (mig 0163) — เดิมการ์ดนี้เป็นไทม์ไลน์ **อ่านอย่างเดียว** ที่วาดเอง
            ทั้งที่ช่วงลีดคือช่วงที่ข้อมูลอยู่ในหัวคนมากที่สุด · เหตุการณ์ระบบยังมาจาก
            `lead_events` ตัวเดิม (ตารางไม่ย้าย — มีคิว/KPI query ตรง) แค่ส่งเข้าไป
            เรียงรวมกับข้อความคนผ่าน extraItems */}
        <DetailCard icon={CalendarClock} eyebrow="Lead history" title="ประวัติการดำเนินการ" meta={`${lead.events?.length || 0} เหตุการณ์ระบบ`}>
          <UpdateThread
            entityType="lead"
            entityId={lead.id}
            order="desc"
            extraItems={leadEventItems}
            placeholder="พิมพ์อัปเดต เช่น โทรแล้วไม่รับ นัดโทรใหม่ศุกร์นี้..."
            emptyText="ยังไม่มีประวัติเพิ่มเติม"
            onPosted={load}
          />
        </DetailCard>
        </DetailPageLayout>
    </div>}
  </Workspace>;
}

function LeadSummary({ lead }) {
  return <DetailCard icon={Inbox} eyebrow="Lead summary" title="สรุปลีด">
    <div className={styles.summaryRow}><span>สถานะ</span><strong>{LEAD_STATUS_LABELS[lead.status] || lead.status}</strong></div>
    <div className={styles.summaryRow}><span>กลุ่มช่องทาง</span><strong style={{ color: CHANNEL_GROUP_COLORS[channelGroupOf(lead.channel)] }}>{LEAD_CHANNEL_LABELS[lead.channel] || lead.channel}</strong></div>
    <div className={styles.summaryRow}><span>รับลีดโดย</span><strong>{lead.createdByName || "-"}</strong></div>
    <div className={styles.summaryRow}><span>วันที่รับ</span><strong>{fmtDateTime(lead.createdAt)}</strong></div>
    <div className={styles.summaryRow}><span>คัดกรองเมื่อ</span><strong>{lead.screenedAt ? fmtDateTime(lead.screenedAt) : "-"}</strong></div>
    <div className={styles.summaryRow}><span>มอบหมายเมื่อ</span><strong>{lead.assignedAt ? fmtDateTime(lead.assignedAt) : "-"}</strong></div>
    <div className={styles.summaryRow}><span>ติดต่อครั้งแรก</span><strong>{lead.firstContactAt ? fmtDateTime(lead.firstContactAt) : "-"}</strong></div>
    <div className={styles.summaryRow}><span>นัดหมาย</span><strong>{lead.meetingAt ? fmtDateTime(lead.meetingAt) : "-"}</strong></div>
  </DetailCard>;
}
