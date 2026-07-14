"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Building2, CalendarClock, CircleDollarSign, Contact, Inbox, Mail, Pencil, Phone, Save, Sparkles, UserRound, Users, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Select from "@/components/ui/Select";
import MoneyInput from "@/components/ui/MoneyInput";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { TEAM_LABELS } from "@/lib/permissions";
import { CHANNEL_GROUP_COLORS, LEAD_CHANNELS, LEAD_CHANNEL_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, SERVICE_INTERESTS, SERVICE_INTEREST_LABELS, channelGroupOf } from "@/lib/sales/leads";
import styles from "./page.module.css";

const EVENT_LABELS = { create: "รับลีดเข้าระบบ", screen: "คัดกรองและส่งทีม", assign: "มอบหมายผู้รับผิดชอบ", contact: "ติดต่อลูกค้า", meeting: "นัดหมาย", qualify: "สร้างดีล", bounce: "ส่งกลับคิวคัดกรอง", disqualify: "ปิดลีด — ไม่ไปต่อ", update: "แก้ไขข้อมูลลีด" };
const blank = { contactName: "", company: "", phone: "", email: "", contactChannel: "", channel: "website", serviceInterest: "other", serviceDetail: "", budget: "", details: "" };

export default function LeadDetailPage() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const info = (label, value, wide = false) => <div className={`${styles.field} ${wide ? styles.wide : ""}`}><span className={styles.label}>{label}</span><div className={styles.value}>{value || "-"}</div></div>;

  return <Workspace icon={<Inbox size={22} />} title={lead?.contactName || "รายละเอียดลีด"} subtitle="ข้อมูลต้นทาง ผู้ติดต่อ และประวัติการดำเนินการ" back={{ href: "/sa/leads", label: "กลับหน้าลีด" }} hideHeader loading={loading}>
    {error && <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>{error}</div>}
    {lead && <div className={styles.layout}>
      <main className={styles.main}>
        <SalesDetailOverview
          eyebrow="รายละเอียดลีด"
          title={lead.contactName}
          description={<><span>{lead.company || "บุคคลทั่วไป"}</span><span>·</span><span>รับผ่าน {LEAD_CHANNEL_LABELS[lead.channel] || lead.channel}</span></>}
          badges={<SalesStateBadge label={LEAD_STATUS_LABELS[lead.status] || lead.status} color={LEAD_STATUS_COLORS[lead.status]} />}
          actions={lead.canEdit ? (!editing ? <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> แก้ไข</button> : <><button className="btn" onClick={() => { setEditing(false); setForm({ ...blank, ...lead, budget: lead.budget ?? "" }); }} disabled={busy}><X size={14} /> ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} /> {busy ? "กำลังบันทึก..." : "บันทึก"}</button></>) : null}
          facts={[
            { icon: Sparkles, label: "บริการที่สนใจ", value: SERVICE_INTEREST_LABELS[lead.serviceInterest] || lead.serviceInterest },
            { icon: CircleDollarSign, label: "งบประมาณ", value: lead.budget != null ? fmtMoney(lead.budget) : "ไม่ระบุ" },
            { icon: Users, label: "ทีม", value: TEAM_LABELS[lead.team] || lead.team || "ยังไม่มอบหมาย" },
            { icon: UserRound, label: "ผู้รับผิดชอบ", value: lead.assigneeName || "ยังไม่มอบหมาย" },
          ]}
        />

        <section className={styles.card}>
          <div className={styles.heading}><h2>ข้อมูลผู้ติดต่อและความต้องการ</h2>{!lead.canEdit && <span className="ui-badge">ข้อมูลถูกล็อกตามสถานะ/สิทธิ์</span>}</div>
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
            <div className={`${styles.field} ${styles.wide}`}><label>รายละเอียดเพิ่มเติม</label><textarea value={form.details || ""} onChange={change("details")} /></div>
          </div> : <div className={styles.grid}>
            {info("ชื่อผู้ติดต่อ", <><Contact size={14} /> {lead.contactName}</>)}
            {info("บริษัท", <><Building2 size={14} /> {lead.company || "-"}</>)}
            {info("โทรศัพท์", <><Phone size={14} /> {lead.phone || "-"}</>)}
            {info("อีเมล", <><Mail size={14} /> {lead.email || "-"}</>)}
            {info("รายละเอียดบริการ", lead.serviceDetail)}
            {info("ช่องทางติดต่อเพิ่มเติม", lead.contactChannel)}
            {info("รายละเอียดเพิ่มเติม", lead.details, true)}
          </div>}
        </section>

        <section className={styles.card}>
          <div className={styles.heading}><h2>ประวัติการดำเนินการ</h2><span className="ui-badge">{lead.events?.length || 0} รายการ</span></div>
          {lead.events?.length ? <div className={styles.timeline}>{lead.events.map((event) => <div className={styles.event} key={event.id}><div className={styles.rail}><span className={styles.dot} /></div><div className={styles.eventBody}><strong>{EVENT_LABELS[event.kind] || event.kind || "อัปเดตลีด"}</strong><p>{[event.createdByName, event.reason, event.assigneeName, fmtDateTime(event.createdAt)].filter(Boolean).join(" · ")}</p></div></div>)}</div> : <div className={styles.empty}>ยังไม่มีประวัติเพิ่มเติม</div>}
        </section>
      </main>

      <aside className={styles.sidebar}>
        <section className={styles.card}>
          <div className={styles.heading}><h2>สรุปลีด</h2></div>
          <div className={styles.summaryRow}><span>สถานะ</span><strong>{LEAD_STATUS_LABELS[lead.status] || lead.status}</strong></div>
          <div className={styles.summaryRow}><span>กลุ่มช่องทาง</span><strong style={{ color: CHANNEL_GROUP_COLORS[channelGroupOf(lead.channel)] }}>{LEAD_CHANNEL_LABELS[lead.channel] || lead.channel}</strong></div>
          <div className={styles.summaryRow}><span>รับลีดโดย</span><strong>{lead.createdByName || "-"}</strong></div>
          <div className={styles.summaryRow}><span>วันที่รับ</span><strong>{fmtDateTime(lead.createdAt)}</strong></div>
          <div className={styles.summaryRow}><span>คัดกรองเมื่อ</span><strong>{lead.screenedAt ? fmtDateTime(lead.screenedAt) : "-"}</strong></div>
          <div className={styles.summaryRow}><span>มอบหมายเมื่อ</span><strong>{lead.assignedAt ? fmtDateTime(lead.assignedAt) : "-"}</strong></div>
          <div className={styles.summaryRow}><span>ติดต่อครั้งแรก</span><strong>{lead.firstContactAt ? fmtDateTime(lead.firstContactAt) : "-"}</strong></div>
          <div className={styles.summaryRow}><span>นัดหมาย</span><strong>{lead.meetingAt ? fmtDateTime(lead.meetingAt) : "-"}</strong></div>
        </section>
      </aside>
    </div>}
  </Workspace>;
}
