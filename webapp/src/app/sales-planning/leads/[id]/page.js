"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FolderKanban, Building2, CalendarClock, CircleDollarSign, Contact, Inbox, Mail, Pencil, Phone, Save, Sparkles, Trash2, UserRound, Users, X } from "lucide-react";
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
import DealCreateModal from "@/components/salesPlanning/DealCreateModal";
import { buildLeadTransitionPayload, createLeadLifecycle, leadDealAction, LEAD_TRANSITION_ACTIONS } from "@/lib/sales/leadLifecycle";
import { useRole, useTeam } from "@/lib/roleContext";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import useDealOwners from "@/lib/sales/useDealOwners";
import { livePersonName } from "@/lib/ui/personName";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { TEAM_LABELS } from "@/lib/permissions";
import { CHANNEL_GROUP_COLORS, LEAD_CHANNELS, LEAD_CHANNEL_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, MEETING_MODE_LABELS, SERVICE_INTERESTS, SERVICE_INTEREST_LABELS, canCreateDealFromLead, channelGroupOf } from "@/lib/sales/leads";
import styles from "./page.module.css";
import Textarea from "@/components/ui/Textarea";

/* ป้ายของ `lead_events.kind` — ต้องครบทุกค่าที่ CHECK ของตารางยอมรับ (mig 0199)
   ไม่งั้นเหตุการณ์จะโชว์เป็นชื่อ kind ดิบบนไทม์ไลน์
   ⚠️ `create_deal` คือค่าที่ POST /deals เขียนจริง ส่วน `qualify` เป็นค่าของเส้นทางเก่า
   ที่เลิกใช้แล้ว — คงไว้เผื่อแถวเก่า แต่ของใหม่มาทาง create_deal ทั้งหมด */
const EVENT_LABELS = { create: "รับลีดเข้าระบบ", screen: "คัดกรองและส่งทีม", assign: "มอบหมายผู้รับผิดชอบ", contact: "ติดต่อลูกค้า", meeting: "นัดหมาย", qualify: "สร้างดีล", create_deal: "สร้างดีลจากลีดนี้", bounce: "ส่งกลับคิวคัดกรอง", disqualify: "ปิดลีด — ไม่ไปต่อ", update: "แก้ไขข้อมูลลีด" };

/* เนื้อของเหตุการณ์ระบบบนไทม์ไลน์
   🐞 ของเดิมโชว์แค่ `reason` กับ `assigneeName` ⇒ **เวลานัดและรูปแบบนัดที่ AE กรอกทุกครั้ง
   ไม่เคยโผล่ที่ไหนเลย** ทั้งที่ `lead_events.eventAt` / `.meetingMode` ถูกเขียนลงตารางมา
   ตั้งแต่ mig 0091 · บนจอเห็นแค่คำว่า "นัดหมาย" กับเวลาที่กดบันทึก ซึ่งไม่ใช่เวลาที่นัด
   (ก่อนหน้านี้ที่เดียวที่เห็นเวลานัดคือการ์ดสรุป ซึ่งโชว์ได้ใบเดียว)

   ⚠️ `eventAt` = เวลาที่เกิดเหตุการณ์จริง (เวลานัด / เวลาที่โทร) · `createdAt` = เวลาที่กด
   บันทึก — ต่างกันได้เป็นวัน ไทม์ไลน์ **เรียง** ด้วย createdAt แต่ต้อง **เล่าเรื่อง** ด้วย eventAt */
function eventDetail(event) {
  const parts = [];
  if (event.kind === "meeting") {
    if (event.eventAt) parts.push(`นัด ${fmtDateTime(event.eventAt)}`);
    if (event.meetingMode) parts.push(MEETING_MODE_LABELS[event.meetingMode] || event.meetingMode);
  }
  if (event.reason) parts.push(event.reason);
  if (event.kind === "contact" && event.eventAt) parts.push(`ติดต่อเมื่อ ${fmtDateTime(event.eventAt)}`);
  // ทีมกับผู้รับผิดชอบคือ "ผลของเหตุการณ์" ของ screen/assign — เดิมทีมหายไปทั้งที่บันทึกไว้
  if (event.team) parts.push(TEAM_LABELS[event.team] || event.team);
  if (event.assigneeName) parts.push(event.assigneeName);
  return parts.join(" · ");
}
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
  const canCreateDeals = canCreateDealFromLead(role);
  const [meId, setMeId] = useState(null);
  /* รายชื่อผู้ใช้สองหน้าที่ — ชุดเดียวกับหน้ารายการลีด (ห้ามแยกแหล่ง):
     - `directory` (รวมคนที่ปิดบัญชีแล้ว) = อ่าน *ชื่อปัจจุบัน* ของผู้รับผิดชอบ
     - `users` (เฉพาะคนที่ยังทำงาน) = dropdown มอบหมาย

     🐞 เดิมหน้านี้ยิง `/api/users` เองซึ่งต้องมี `users:manage`/`users:view` =
     **แอดมินเท่านั้น** → senior_ae/ac (คนที่มีหน้าที่กระจายลีดจริง ๆ) และ
     ae_supervisor เจอ 403 เงียบ ๆ แล้วได้ `users = []` ⇒ ปุ่ม "มอบหมาย" โผล่
     แต่ช่อง "ผู้รับผิดชอบ" (required) ไม่มีตัวเลือกสักตัว = ทางตัน มอบหมายจาก
     หน้ารายละเอียดไม่ได้เลย ต้องถอยไปทำที่หน้ารายการ (ซึ่งใช้ hook นี้อยู่แล้ว)
     ⚠️ ต้องกรอง disabled ออกด้วย — /api/users ไม่กรองให้ จึงเคยมอบลีดให้คนที่
     ลาออกแล้วได้ ต่างจากหน้ารายการที่กรองมาตลอด */
  const directory = usePeopleDirectory();
  const users = useMemo(() => directory.filter((u) => !u.disabled), [directory]);
  const [dealOpen, setDealOpen] = useState(false);
  const [dealOptions, setDealOptions] = useState({ customers: [], projects: [], categories: [] });

  useEffect(() => {
    fetch("/api/users/me").then((r) => (r.ok ? r.json() : null))
      .then((me) => setMeId(me?.id || null)).catch(() => setMeId(null));
  }, []);

  const viewer = useMemo(() => ({ role, id: meId, team }), [role, meId, team]);
  /* ผู้รับผิดชอบ (AE) ของดีลที่จะเปิดจากลีดนี้ — กติกา "เฉพาะทีมตัวเอง" อยู่ใน hook
     ที่เดียว (หน้ารวมดีลใช้ตัวเดียวกัน) */
  const dealOwners = useDealOwners(meId);
  const lifecycle = useMemo(
    () => createLeadLifecycle({ users, canCreateDeals, viewerTeam: team }),
    [users, canCreateDeals, team],
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
    body: eventDetail(event),
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
    if (!LEAD_TRANSITION_ACTIONS.includes(actionId)) return false;

    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/sales-planning/leads/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLeadTransitionPayload({ action: actionId, values, users })),
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

  /* ปุ่มยกเลิก/บันทึก **ระหว่างแก้ไข** ยังอยู่ที่หัวหน้า — ต้องอยู่ใกล้ช่องที่กำลังพิมพ์
     ส่วนปุ่ม "แก้ไขข้อมูล" (ตอนยังไม่แก้) ย้ายไปอยู่บนการ์ดควบคุมแล้ว

     มติผู้ใช้ 2026-08-01: **การควบคุมคือการควบคุม** ไม่ว่าจะเดินหน้าหรือจัดการตัว
     ระเบียน — แยกด้วย *ช่อง* ในการ์ด (primary/secondary/danger) ไม่ใช่แยกไปคนละที่
     ตรงกับหน้าเอกสาร 6 จาก 7 หน้าที่วางแก้ไข/ลบไว้บนการ์ดอยู่แล้ว (SO · QT · คำร้อง
     · ขอราคาผลิต · PO · ใบยื่นภาษี) — มีแต่หน้าทะเบียนภาษีที่ยังใช้ไอคอนหัวหน้า */
  const backActions = editing ? (
    <>
      <Button icon={<X size={14} aria-hidden="true" />} onClick={() => { setEditing(false); setForm({ ...blank, ...lead, budget: lead.budget ?? "" }); }} disabled={busy}>ยกเลิก</Button>
      <Button tone="primary" icon={<Save size={14} aria-hidden="true" />} onClick={save} disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึก"}</Button>
    </>
  ) : null;

  /* เปิดดีล = สร้าง entity คนละตัว ต้องผ่านฟอร์มดีล (เลือกลูกค้า/มูลค่า/เดือน FC)
     ไม่ใช่ย้ายสถานะ — จึงไม่อยู่ใน lifecycle แล้ว แต่เป็น action เดี่ยวบนการ์ดเดียวกัน
     (ดู leadDealAction: เปิดได้ตั้งแต่ติดต่อแล้ว/นัดประชุมแล้ว/เปิดดีลไปแล้วก็เพิ่มได้อีก)
     ตัวเลือกที่ประกอบฟอร์มโหลดตอนกดจริงเท่านั้น — คนส่วนใหญ่เข้าหน้านี้มาอ่าน ไม่ได้เปิดดีล */
  function openDealForm() {
    Promise.all([
      fetch("/api/master/customers").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([customerRows, projectRows, categoryRows]) => setDealOptions({
      customers: Array.isArray(customerRows) ? customerRows : [],
      projects: Array.isArray(projectRows) ? projectRows : projectRows?.items || [],
      categories: Array.isArray(categoryRows) ? categoryRows : [],
    }));
    setDealOpen(true);
  }

  /* เปิดดีล **ไม่อยู่บนการ์ดคุม flow** (มติผู้ใช้ 2026-08-04) — มันไม่ใช่การเดินสถานะ
     ของลีด แต่เป็นการสร้าง entity คนละตัว และเปิดได้จากหลายขั้น (ติดต่อแล้ว / นัดประชุม
     แล้ว / เปิดไปแล้วก็เพิ่มได้อีก) ปุ่มจึงไปอยู่ในการ์ด "ดีลจากลีดนี้" ซึ่งเป็นที่ของมัน
     — อยู่ติดกับรายการดีลที่ออกไปแล้ว คนอ่านเห็นพร้อมกันว่ามีอะไรอยู่และจะเพิ่มได้ที่ไหน */
  const dealAction = leadDealAction({
    lead, user: viewer, canCreateDeals, icon: FolderKanban, onClick: openDealForm,
  });

  /* action ที่ไม่ใช่การย้ายสถานะ — lifecycle ไม่รู้จัก แต่เป็น "การจัดการตัวระเบียน"
     แก้ไข = secondary (ทำได้ แต่ไม่ใช่ก้าวถัดไป) · ลบ = danger (ทำลาย) */
  const recordActions = [
    {
      id: "edit",
      kind: "edit",
      slot: "secondary",
      label: "แก้ไขข้อมูล",
      icon: Pencil,
      visible: !!lead?.canEdit && !editing,
      onClick: () => setEditing(true),
    },
    {
      id: "delete",
      kind: "delete",
      slot: "danger",
      label: "ลบลีดนี้",
      icon: Trash2,
      visible: !!lead?.canDelete,
      onClick: removeLead,
    },
  ];

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
            // ชื่อจาก `assigneeId` — สำเนาชื่อในแถวไม่ขยับตอนเจ้าตัวเปลี่ยนชื่อ
            { icon: UserRound, label: "ผู้รับผิดชอบ", value: livePersonName(directory, lead.assigneeId, lead.assigneeName) || "ยังไม่มอบหมาย" },
          ]}
        />

        {/* จุดจัดการเดียวของลีด — เดินหน้า (คัดกรอง/มอบหมาย/ติดต่อ) และจัดการตัว
            ระเบียน (แก้ไข/ลบ) อยู่การ์ดเดียวกัน แยกด้วยช่องตามน้ำหนักของ action */}
        <DetailPageLayout aside={<>
          <RecordControlCard
            lifecycle={lifecycle}
            record={lead}
            user={viewer}
            onTransition={runTransition}
            extraActions={recordActions}
            busy={busy}
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

        {/* ── ส่วนของ "ดีล" แยกขาดจากการ์ดคุม flow ─────────────────────────────
            โผล่เมื่อมีดีลแล้ว **หรือ** เปิดดีลได้ — ไม่งั้นลีดที่ยังไม่มีดีลจะไม่มีที่ให้
            ปุ่มยืน และคนต้องไปหาในการ์ดสถานะซึ่งเป็นคนละเรื่องกัน */}
        {(!!lead.relatedDeals?.length || dealAction.visible) && (
          <DetailCard
            icon={FolderKanban}
            eyebrow="Converted opportunities"
            title="ดีลจากลีดนี้"
            meta={lead.relatedDeals?.length ? `${lead.relatedDeals.length} ดีล` : "ยังไม่มีดีล"}
            actions={dealAction.visible ? (
              <Button
                tone="primary"
                icon={<FolderKanban size={14} aria-hidden="true" />}
                onClick={openDealForm}
                disabled={busy}
              >
                {dealAction.label}
              </Button>
            ) : null}
          >
            {lead.relatedDeals?.length ? (
              <ContextGrid>
                {lead.relatedDeals.map((deal) => <ContextCard key={deal.id} icon={FolderKanban} href={`/sales-planning/deals/${deal.id}`} eyebrow="ดีลจาก Lead" title={`${deal.code ? `${deal.code} · ` : ""}${deal.title}`} subtitle={deal.customerName || lead.company || lead.contactName} badges={<>{deal.dealType && <span className="ui-badge">{deal.dealType}</span>}<span className="ui-badge" style={{ color: deal.stage === "won" ? "var(--green)" : "var(--accent)" }}>{deal.stage}</span></>} facts={[{ label: "Forecast", value: deal.forecastMonth || "-" }, { label: "มูลค่า", value: fmtMoney(deal.wonValue ?? deal.projectValue ?? 0) }]} />)}
              </ContextGrid>
            ) : (
              <p className="empty">
                ลีดนี้ยังไม่ได้เปิดดีล — กด “{dealAction.label}” เพื่อเริ่ม (เปิดได้หลายใบจากลีดเดียว)
              </p>
            )}
          </DetailCard>
        )}

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

        {/* ฟอร์มเดียวกับที่หน้ารายการลีดใช้ — ไม่ได้ก๊อปมา */}
        {dealOpen && (
          <DealCreateModal
          owners={dealOwners.owners}
          defaultOwnerId={dealOwners.defaultOwnerId}
          lockedOwner={dealOwners.lockedOwner}
            lead={lead}
            customers={dealOptions.customers}
            projects={dealOptions.projects}
            categories={dealOptions.categories}
            onClose={() => setDealOpen(false)}
          />
        )}
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
    {/* "นัดถัดไป" ไม่ใช่ "นัดล่าสุด" — ลีดหนึ่งใบมีได้หลายนัดแล้ว คอลัมน์เก็บนัดที่ยังไม่ถึง
        (ดู nextMeetingAt ใน route ของ transition) · นัดทั้งหมดอยู่ในประวัติด้านซ้าย */}
    <div className={styles.summaryRow}><span>นัดถัดไป</span><strong>{lead.meetingAt ? fmtDateTime(lead.meetingAt) : "-"}</strong></div>
  </DetailCard>;
}
