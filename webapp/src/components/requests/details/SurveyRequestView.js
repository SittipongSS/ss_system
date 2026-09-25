"use client";

/* ══ หน้าคำร้องประเมินพื้นที่ — แบบ A "ไทม์ไลน์งาน" (มติเจ้าของ 25/09) ═══════════════════════════
 *
 * ⭐ โจทย์: *"ข้อมูลงานขาด (เช่น นัด เจ้าหน้าที่ ผล)"* — หน้าเดิมเล่าแต่เธรด นัดเหลือบรรทัดเดียวกลางหน้า
 *    ⇒ จอแรกตอบสี่คำถาม: งานอยู่ขั้นไหน · ต่อไปอะไร · ตาใคร · ผลมาเมื่อไร
 * 🔑 **ตัวเลข/ถ้อยคำทุกตัวมาจาก `surveyJobView`** (lib/service/surveyJob.js) — ไฟล์นี้แค่วาด
 * 🔑 **ปุ่มระดับใบมาจาก `requestActions` ตัวเดียวของเปลือก** — ที่นี่แค่เลือกที่วาง (หัวใบ · แถบตอนนี้)
 *    ไม่สร้างปุ่มใหม่ และแต่ละปุ่มวาดครั้งเดียว (บทเรียนรางขวารุ่นแรก)
 * ⚠️ ลงทะเบียนที่ `details/index.js` (`viewForKind`) — เปลือกไม่เทียบชื่อหัวข้อเอง
 */
import Link from "next/link";
import { useMemo } from "react";
import {
  Building2, Check, CircleDashed, ClipboardList, FileText, FolderKanban, Handshake, Lock,
  MapPin, MessageCircleQuestion, Route, UserRound,
} from "lucide-react";
import DetailOverview from "@/components/ui/DetailOverview";
import { DetailCard } from "@/components/ui/DetailPage";
import { Metric, MetricStrip } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import GatedAction from "@/components/ui/GatedAction";
import { kindMeta } from "@/components/ui/ActionButtons";
import RichText from "@/components/ui/RichText";
import ReadableText from "@/components/ui/ReadableText";
import { fmtNumber, naText } from "@/lib/format";
import { requestKindLabel } from "@/lib/master/requestTypes";
import { surveyJobView } from "@/lib/service/surveyJob";
import styles from "./surveyRequest.module.css";

const num = (value) => (value == null ? null : fmtNumber(value, { maximumFractionDigits: 2 }));

/* ชื่อย่อในวงกลม — สองคำแรก (ชื่อไทยคำเดียวได้ตัวแรกตัวเดียว) */
const initials = (name) => String(name || "").trim().split(/\s+/).slice(0, 2)
  .map((word) => Array.from(word)[0] || "").join("").toUpperCase();

/* ── ปุ่มจากก้อน action ของเปลือก ─────────────────────────────────────────────────────────
   ⚠️ ติดด่าน = โชว์แล้วบอกเหตุตอนกด (`GatedAction` · กติกา ui-visibility) — ไม่ใช่ปุ่มจางเงียบ */
function ActionControl({ action, busy, tone, variant = "outline", className = "", blocker = "" }) {
  if (!action) return null;
  const meta = kindMeta(action.kind) || {};
  const Icon = action.icon === undefined ? meta.Icon : action.icon;
  const reason = blocker
    || (action.disabled ? (typeof action.disabledReason === "string" ? action.disabledReason : "ตอนนี้ยังทำขั้นนี้ไม่ได้") : "");
  const common = {
    tone: tone || meta.tone || "neutral",
    variant,
    icon: Icon ? <Icon size={15} aria-hidden="true" /> : null,
    className: `${styles.action} ${className}`.trim(),
  };
  if (action.href && !reason) {
    return <Button as={Link} href={action.href} {...common}>{action.label}</Button>;
  }
  return (
    <GatedAction
      {...common}
      blocker={reason}
      onClick={action.onClick}
      disabled={!!busy && !reason}
      aria-disabled={reason ? "true" : undefined}
      data-blocked={reason ? "1" : undefined}
    >
      {action.label}
    </GatedAction>
  );
}

function Person({ name, note, generic = false }) {
  return (
    <span className={styles.person}>
      <span className={styles.avatar} data-generic={generic ? "1" : undefined} aria-hidden="true">
        {generic ? <UserRound size={12} /> : initials(name)}
      </span>
      <span className={styles.personName}>
        {note ? <small>{note}</small> : null}
        {name}
      </span>
    </span>
  );
}

/* ⚠️ **ไทม์ไลน์ไม่มีของที่โฟกัสได้** — จอแคบสลับแถบตอนนี้ขึ้นก่อนด้วย CSS `order` ซึ่งยอมได้เฉพาะเมื่อ
   ของที่ถูกสลับไม่มีลิงก์/ปุ่ม (WCAG 2.4.3 · กติกาเดียวกับ DocumentControlPanel) ⇒ ลิงก์นัดอยู่บนแถบตอนนี้ที่เดียว */
function Timeline({ steps }) {
  return (
    <ol className={styles.timeline} aria-label="ขั้นตอนของงานประเมิน">
      {steps.map((step) => (
        <li
          key={step.id}
          className={styles.step}
          data-state={step.state}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className={styles.marker} aria-hidden="true">
            {step.state === "done" ? <Check size={13} /> : step.state === "skipped" ? <CircleDashed size={13} /> : step.number}
          </span>
          <span className={styles.stepHead}>
            <b>{step.label}</b>
            {step.badge ? <StatusBadge size="sm" tone={step.badge.tone} label={step.badge.label} /> : null}
            <span className="sr-only">
              {step.state === "done" ? " (ผ่านแล้ว)" : step.state === "current" ? " (ขั้นปัจจุบัน)" : step.state === "skipped" ? " (ข้าม)" : ""}
            </span>
          </span>
          {step.when ? <span className={styles.when}>{step.when}</span> : null}
          {step.people.length ? (
            <span className={styles.people}>
              {step.people.map((p, i) => (
                <Person key={`${p.name}-${i}`} name={p.name} note={p.note} generic={/^หัวหน้า /.test(p.name)} />
              ))}
            </span>
          ) : null}
          {step.visitLink ? (
            <span className={styles.stepLine}>นัด {step.visitLink.code}</span>
          ) : null}
          {step.lines.map((line, i) => (
            <span key={i} className={styles.stepLine} data-tone={line.tone || undefined}>{line.text}</span>
          ))}
        </li>
      ))}
    </ol>
  );
}

function Meter({ done, total, complete }) {
  if (!total) return null;
  return (
    <span
      className={styles.meter}
      data-complete={complete ? "1" : undefined}
      role="progressbar"
      aria-label={`วัดแล้ว ${done} จาก ${total} พื้นที่`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      {Array.from({ length: total }, (_, i) => <i key={i} data-ok={i < done ? "1" : undefined} />)}
    </span>
  );
}

/* ── ตารางพื้นที่ ─────────────────────────────────────────────────────────────────────── */
/* เซลล์ที่มีป้าย — จอแคบตารางกลายเป็นการ์ด ป้ายซ้าย (`data-label`) ค่าขวา
   ⚠️ ค่าต้องอยู่ในก้อนเดียว (`cellValue`) — ไม่งั้นตัวเลขกับบรรทัด "สูตร n" แตกเป็นสองช่องของกริด */
function Cell({ label, num: isNum = false, children }) {
  return (
    <td data-label={label} className={isNum ? "num" : undefined}>
      <span className={styles.cellValue}>{children}</span>
    </td>
  );
}

/* null = อ่านรูปไม่สำเร็จ — "ไม่ทราบ" ไม่ใช่ขีด (ขีด = ไม่มีรูป) */
const photoText = (count) => (count == null ? "ไม่ทราบ" : count ? `${count} รูป` : naText(null));

function ZonesTable({ zones }) {
  const { rows, sent, totals, photos } = zones;
  return (
    <TableScroll surface="embedded" cells="stacked" minWidth={860} className={styles.zoneShell}>
      <table className={styles.zoneTable}>
        <thead>
          <tr>
            <th>พื้นที่</th>
            <th>ชั้น</th>
            <th>ขนาด (ก × ย × ส)</th>
            <th className="num">ตร.ม.</th>
            <th className="num">ลบ.ม.</th>
            {!sent && <th className="num">ภาพกว้าง</th>}
            <th className="num">{sent ? "จุดติดตั้ง (เลือก / ทั้งหมด)" : "จุดติดตั้งได้"}</th>
            <th className="num">แพ็คเกจ</th>
            <th>{sent ? "รูป" : "หน้างาน"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-cut={row.cut ? "1" : undefined}>
              <td data-label="พื้นที่">
                <span className="t-strong">
                  {row.code || (row.codeUnknown ? "ไม่ทราบรหัส" : "พื้นที่ใหม่")}
                </span>
                <span className="cell-sub">
                  {row.name}
                  {row.added ? " · เพิ่มหน้างาน" : ""}
                  {row.cut ? ` · ตัดออก${row.cutReason ? ` — ${row.cutReason}` : ""}` : ""}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
              </td>
              <Cell label="ชั้น">{naText(row.floor)}</Cell>
              <Cell label="ขนาด">{naText(row.size)}</Cell>
              <Cell label="ตร.ม." num>{naText(num(row.areaSqm))}</Cell>
              <Cell label="ลบ.ม." num>{naText(num(row.volumeCbm))}</Cell>
              {!sent && <Cell label="ภาพกว้าง" num>{photoText(row.photosWide)}</Cell>}
              <Cell label="จุดติดตั้ง" num>
                {sent
                  ? naText(row.spotsTotal ? `${row.spotsSelected} / ${row.spotsTotal}` : null)
                  : naText(row.spotsTotal ? `${row.spotsTotal} จุด` : null)}
              </Cell>
              <Cell label="แพ็คเกจ" num>
                {naText(row.packageQty)}
                {row.suggested ? <span className="cell-sub">สูตร {row.suggested}</span> : null}
                {sent && row.packageNote ? <span className="cell-sub">{row.packageNote}</span> : null}
              </Cell>
              <Cell label={sent ? "รูป" : "หน้างาน"}>
                {sent ? (
                  row.cut ? naText(null) : row.photosWide == null ? "ไม่ทราบ" : `ภาพกว้าง ${row.photosWide} · ผัง ${row.photosPlan}`
                ) : (
                  <>
                    {row.state ? <StatusBadge size="sm" tone={row.state.tone} label={row.state.label} /> : null}
                    {row.missingText ? <span className={styles.miss}>{row.missingText}</span> : null}
                  </>
                )}
              </Cell>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td data-label="รวม">
              {sent ? `รวม ${totals.zones} พื้นที่` : "รวมตอนนี้"}
              {!sent && zones.measured.total
                ? <span className="cell-sub">วัดแล้ว {zones.measured.done} / {zones.measured.total} พื้นที่</span>
                : null}
            </td>
            <td />
            <td />
            <Cell label="ตร.ม." num>{naText(num(totals.areaSqm || null))}</Cell>
            <Cell label="ลบ.ม." num>{naText(num(totals.volumeCbm || null))}</Cell>
            {!sent && <Cell label="ภาพกว้าง" num>{photoText(photos.wide)}</Cell>}
            <Cell label="จุดติดตั้ง" num>
              {sent
                ? naText(totals.spotsTotal ? `${totals.spotsSelected} / ${totals.spotsTotal}` : null)
                : naText(totals.spotsTotal ? `${totals.spotsTotal} จุด` : null)}
            </Cell>
            <Cell label="แพ็คเกจ" num>
              {naText(totals.packageQty || null)}
              {totals.suggestedPackages ? <span className="cell-sub">สูตร {totals.suggestedPackages}</span> : null}
            </Cell>
            <Cell label={sent ? "รูป" : "หัวหน้า"}>
              {sent
                ? (photos.wide == null ? "ไม่ทราบ" : `ภาพกว้าง ${photos.wide} · ผัง ${photos.plan}`)
                : (zones.headGate.ok ? "หัวหน้าเคาะแล้ว" : "หัวหน้ายังไม่เคาะ")}
            </Cell>
          </tr>
        </tfoot>
      </table>
    </TableScroll>
  );
}

function GateCard({ icon: Icon, title, gate }) {
  return (
    <div className={styles.gateCard}>
      <span className={styles.gateIcon} aria-hidden="true"><Icon size={16} /></span>
      <span className={styles.gateBody}>
        <b>{title}</b>
        {gate.text ? <small>{gate.text}</small> : null}
      </span>
      <StatusBadge size="sm" tone={gate.badge.tone} label={gate.badge.label} />
    </div>
  );
}

/**
 * @param request   ใบจาก GET (มีก้อน survey* ครบ)
 * @param actions   `requestActions` ของเปลือก (normalize แล้ว) — ปุ่มระดับใบชุดเดียว
 * @param viewer    `{ canDecide, canWork, canOpenVisit, isOpener, isRequesterSide }`
 * @param thread    การ์ดความเคลื่อนไหว (เปลือกประกอบ — `UpdateThread` ตัวเดียวกับทุกหัวข้อ)
 * @param attachments การ์ดไฟล์แนบของคำร้อง
 */
export default function SurveyRequestView({
  request, today, viewer = {}, people = [], peopleLoading = false,
  actions = {}, busy = false, thread = null, attachments = null,
}) {
  const job = useMemo(
    () => surveyJobView({ request, today, viewer, people, peopleLoading }),
    [request, today, viewer, people, peopleLoading],
  );
  if (!job) return null;

  const surveyHref = viewer.canWork ? `/service/surveys/${request.id}` : null;
  const visitHref = viewer.canOpenVisit && job.visit?.id ? `/service/visits/${job.visit.id}` : null;

  /* ── จัดที่วางปุ่ม (วาดครั้งเดียวต่อปุ่ม) ─────────────────────────────────────────────
     หัวใบ = ของระดับใบที่ไม่ใช่ก้าวของงาน (แก้ไข · เปลี่ยนผู้รับผิดชอบ · ปุ่มอันตราย)
     แถบตอนนี้ = ก้าวของงาน (ปุ่มหลัก + ที่เหลือ) */
  const HEAD_IDS = new Set(["edit", "assign"]);
  const primary = actions.primaryAction || null;
  const secondary = actions.secondaryActions || [];
  const danger = actions.dangerActions || [];
  /* ⭐ **SA ที่ยังไม่มีอะไรให้ทำ = ไม่วาดปุ่มจาง** (บรีฟข้อ 6) — "ปิดเรื่อง" ที่รอผล กับ "ยกเลิก" หลัง TS รับเรื่อง
     เป็นด่านของขั้น ไม่ใช่ของที่คนตรงหน้าแก้ได้ ⇒ แถบบอกว่ารออะไร ผลมาเมื่อไร แทนปุ่มสองปุ่มที่กดไม่ได้
     ⚠️ เหตุผลยังมาจากด่านตัวเดียวกับ server (`closeRequestError`) — ไม่เขียนประโยคใหม่ */
  const closeWaiting = primary?.id === "close" && primary.disabled;
  const bandPrimary = closeWaiting ? null : primary;
  const waitNote = closeWaiting && typeof primary.disabledReason === "string" ? primary.disabledReason : null;
  /* ⭐ **ส่งผลต้องผ่านด่านหกข้อ** — ปุ่มพาไปใบประเมินเดิมกดได้แม้ช่างยังไม่เริ่ม (บรีฟ B2 ข้อ 5)
     ⇒ ถามด่านตัวเดียวกับ server (`surveySendError` ผ่าน `surveyControlView.send`) แล้วโชว์เหตุ */
  /* ⚠️ อ่านรูปไม่สำเร็จ = ไม่รู้ว่าผ่านด่านไหม ⇒ ไม่เดาว่า "ติด" — ปล่อยเป็นลิงก์ ใบประเมินตรวจด่านจริงอีกรอบ */
  const sendGate = job.control?.send && !job.zones.unknownFiles ? job.control.send : null;
  const sendReason = sendGate && !sendGate.allowed ? (sendGate.reason?.text || sendGate.reason?.detail || "") : "";
  const sendBlocker = bandPrimary?.id === "answer-via" && !bandPrimary.disabled ? sendReason : "";
  /* ลิงก์ส่งผลรอง (ตอนปุ่มหลักเป็น "ลงคิว/ลงคิวใหม่") — โชว์เมื่อ **ส่งได้จริง** เท่านั้น เช่น วัดครบแล้วแต่นัดถูกเลื่อน/เข้าไม่ได้
     ⚠️ ส่งยังไม่ได้ = ไม่วาดซ้อนปุ่มลงคิว (บรีฟ B2 ข้อ 5: ใบที่ยังไม่มีนัดเคยได้ปุ่มส่งผลที่ติด 6 ข้อ) · ปุ่มหลักยังบอกก้าวที่ถูก */
  const bandSecondary = secondary.filter((a) => !HEAD_IDS.has(a.id)
    && !(a.id === "answer-via" && bandPrimary?.id !== "answer-via" && (!!sendReason || a.disabled)));
  const headActions = [
    ...secondary.filter((a) => HEAD_IDS.has(a.id)),
    ...danger.filter((a) => !(a.id === "cancel" && a.disabled)),
  ];
  const renderHead = (extraClass = "") => headActions.map((action) => (
    <ActionControl
      key={action.id}
      action={action}
      busy={busy}
      tone={danger.includes(action) ? "danger" : "neutral"}
      variant="outline"
      className={extraClass}
    />
  ));

  const refs = [
    request.refCustomer && {
      key: "customer", icon: Building2, label: "ลูกค้า",
      href: `/database/customers/${request.refCustomer.id}`,
      text: [request.refCustomer.arCode, request.refCustomer.name || request.customerName].filter(Boolean).join(" · "),
    },
    {
      key: "requester", icon: UserRound, label: "ผู้ยื่น",
      text: [request.requestedByName, request.team ? `ทีม ${request.team}` : null].filter(Boolean).join(" · "),
    },
    request.refDeal && {
      key: "deal", icon: Handshake, label: "ดีล", href: `/sa/deals/${request.refDeal.id}`,
      text: [request.refDeal.code, request.refDeal.title].filter(Boolean).join(" · "),
    },
    request.refProject && {
      key: "project", icon: FolderKanban, label: "โครงการ",
      href: `/sa/projects/${request.refProject.code || request.refProject.id}`,
      text: [request.refProject.code, request.refProject.name].filter(Boolean).join(" · "),
    },
    request.quotationId && {
      key: "quotation", icon: FileText, label: "ใบเสนอราคา",
      href: request.refQuotation ? `/sa/quotations/${request.quotationId}` : null,
      text: request.refQuotation?.quoteNumber || "ถูกลบไปแล้ว",
    },
  ].filter(Boolean);

  const zones = job.zones;
  const site = job.site;
  const current = job.current;

  return (
    <>
      <DetailOverview
        eyebrow={`${requestKindLabel(request.kind)} · ถึง ${request.dept}`}
        title={request.docNo || `${requestKindLabel(request.kind)} (ร่าง)`}
        description={<span className={styles.subject}>{request.title || requestKindLabel(request.kind)}</span>}
        meta={(
          <span className={styles.refs}>
            {refs.map((ref) => {
              const Icon = ref.icon;
              return (
                <span key={ref.key} className={styles.ref}>
                  <Icon size={14} aria-hidden="true" />
                  <span className={styles.refLabel}>{ref.label}</span>
                  {ref.href ? <Link className="linklike" href={ref.href}>{ref.text}</Link> : <span>{naText(ref.text)}</span>}
                </span>
              );
            })}
          </span>
        )}
        badges={<StatusBadge tone={job.status.tone} label={job.status.label} dot />}
        actions={headActions.length ? <span className={styles.headActions}>{renderHead()}</span> : null}
      />

      {request.status === "draft" && request.bounceReason ? (
        <StatusNotice tone="warning" title={`${request.dept} ตีกลับให้แก้ไข${request.bouncedByName ? ` · ${request.bouncedByName}` : ""}`}>
          <ReadableText text={request.bounceReason} lines={6} />
        </StatusNotice>
      ) : null}

      {/* ── งานตอนนี้ ─────────────────────────────────────────────────────────────── */}
      <DetailCard
        icon={Route}
        eyebrow="JOB"
        title="งานตอนนี้"
        meta={[
          "ประเมินพื้นที่ที่",
          site ? [site.code, site.name].filter(Boolean).join(" · ") : null,
          zones.rows.length ? `${zones.rows.filter((r) => !r.cut).length} พื้นที่` : null,
          job.visit?.code ? `นัด ${job.visit.code}` : null,
        ].filter(Boolean).join(" · ").replace("ที่ · ", "ที่ ")}
        actions={current ? <span className={styles.stepCount}>ขั้น {current.number} / {job.steps.length} · {current.label}</span> : null}
        className={styles.jobCard}
      >
        <div className={styles.jobBody}>
        <Timeline steps={job.steps} />

        <section className={styles.now} data-tone={job.now.tone} aria-label="ตอนนี้">
          <div className={styles.nowMain}>
            <small className={styles.nowStep}>
              {job.now.step}
              {job.now.visitCode ? (
                <>
                  {" · นัด "}
                  {visitHref ? <Link className="linklike" href={visitHref}>{job.now.visitCode}</Link> : job.now.visitCode}
                </>
              ) : null}
            </small>
            <p className={styles.nowHeadline}>{job.now.headline}</p>
            {job.now.progress ? <Meter {...job.now.progress} /> : null}
            {job.now.sub ? <p className={styles.nowSub}>{job.now.sub}</p> : null}
            {job.now.next ? (
              <p className={styles.nowNext}><span>ต่อไป</span>{job.now.next}</p>
            ) : null}
          </div>
          <div className={styles.nowFacts}>
            {job.now.turn ? (
              <div>
                <small>ตาใคร</small>
                <p className={styles.turn}>
                  <StatusBadge size="sm" tone={job.now.turn.side === request.dept ? "info" : "accent"} label={job.now.turn.side} />
                  <b>{job.now.turn.who}</b>
                </p>
                {job.now.turn.note ? <small className={styles.factNote}>{job.now.turn.note}</small> : null}
              </div>
            ) : null}
            {job.now.due ? (
              <div>
                <small>{job.now.due.label}</small>
                <p className={styles.due}>
                  <b>{naText(job.now.due.value)}</b>
                  {job.now.due.badge ? <StatusBadge size="sm" tone={job.now.due.badge.tone} label={job.now.due.badge.text} /> : null}
                </p>
                {job.now.due.note ? <small className={styles.factNote}>{job.now.due.note}</small> : null}
              </div>
            ) : null}
          </div>
          <div className={styles.nowActions}>
            {bandPrimary ? (
              <ActionControl
                action={bandPrimary}
                busy={busy}
                tone="primary"
                variant="filled"
                blocker={sendBlocker}
                className={styles.bandAction}
              />
            ) : null}
            {sendBlocker ? (
              <p className={styles.blocked} role="status"><Lock size={13} aria-hidden="true" />{sendBlocker}</p>
            ) : null}
            {bandPrimary?.disabled && typeof bandPrimary.disabledReason === "string" ? (
              <p className={styles.blocked} role="status"><Lock size={13} aria-hidden="true" />{bandPrimary.disabledReason}</p>
            ) : null}
            {bandSecondary.map((action) => (
              <ActionControl key={action.id} action={action} busy={busy} className={styles.bandAction} />
            ))}
            {surveyHref ? (
              <Button as={Link} href={surveyHref} variant="outline" icon={<ClipboardList size={15} aria-hidden="true" />} className={`${styles.action} ${styles.bandAction}`}>
                เปิดใบประเมิน
              </Button>
            ) : null}
            {waitNote && !job.now.finished ? (
              <p className={styles.wait}>{waitNote}</p>
            ) : null}
          </div>
        </section>
        </div>
      </DetailCard>

      {/* ── พื้นที่และผล ─────────────────────────────────────────────────────────── */}
      <DetailCard
        icon={ClipboardList}
        eyebrow="ZONES"
        title={zones.sent ? "ผลประเมินพื้นที่" : "พื้นที่ที่ประเมิน"}
        meta={zones.sent
          ? [request.answeredByName && `ส่งผลให้ฝ่ายขายแล้ว · ${request.answeredByName}`, job.steps.find((s) => s.id === "answered")?.when].filter(Boolean).join(" · ")
          : (zones.progressText || "ยังไม่มีผลวัด")}
        actions={<span className={styles.stepCount}>{zones.rows.filter((r) => !r.cut).length} พื้นที่</span>}
      >
        <div className={styles.zoneStack}>
          {zones.sent ? (
            <MetricStrip className={styles.summary}>
              <Metric label="พื้นที่" value={`${fmtNumber(zones.totals.zones)} พื้นที่`} note={zones.unchanged ? "ครบตามที่ขอ" : "มีตัด/เพิ่ม"} />
              <Metric label="พื้นที่รวม" value={`${num(zones.totals.areaSqm)} ตร.ม.`} />
              <Metric label="ปริมาตรรวม" value={`${num(zones.totals.volumeCbm)} ลบ.ม.`} />
              <Metric label="แพ็คเกจ" value={`${fmtNumber(zones.totals.packageQty)} แพ็คเกจ`} note={zones.totals.suggestedPackages ? `สูตร ${zones.totals.suggestedPackages}` : null} />
              <Metric label="จุดติดตั้ง" value={`${zones.totals.spotsSelected} / ${zones.totals.spotsTotal}`} note="เลือก / ที่ติดตั้งได้" />
              <Metric label="เอกสารผลประเมิน" value="ยังไม่ออก" note="ภาพและผังจะมาในเอกสารส่งงาน" />
            </MetricStrip>
          ) : null}

          {site ? (
            <div className={styles.siteStrip}>
              <div>
                <small>ไซต์</small>
                <p>
                  <MapPin size={14} aria-hidden="true" />
                  <Link className="linklike" href={`/database/sites/${site.id}`}>
                    {[site.code, site.name].filter(Boolean).join(" · ")}
                  </Link>
                  {site.routeZone ? <StatusBadge size="sm" label={site.routeZone} /> : null}
                </p>
                {site.address ? <small className={styles.factNote}>{site.address}</small> : null}
              </div>
              <div>
                <small>ผู้ติดต่อหน้างาน</small>
                <p><b>{naText(site.contact)}</b></p>
              </div>
              <div>
                <small>ช่วงที่ไซต์ให้เข้า</small>
                <p><b>{site.access || "ไม่จำกัดเวลา"}</b></p>
                {site.accessNote ? <small className={styles.factNote}>{site.accessNote}</small> : null}
              </div>
            </div>
          ) : null}

          {zones.unknownFiles ? (
            <StatusNotice tone="warning" title="อ่านรูปรายพื้นที่ไม่สำเร็จ">
              ความคืบหน้าและจำนวนรูปในตารางอาจต่ำกว่าจริง — ลองโหลดหน้าใหม่
            </StatusNotice>
          ) : null}

          {zones.rows.length ? <ZonesTable zones={zones} /> : (
            <p className={styles.empty}>ยังไม่มีพื้นที่ที่ต้องประเมิน</p>
          )}

          {!zones.sent && zones.rows.length ? (
            <div className={styles.gates}>
              <GateCard icon={Route} title={`ฝั่งช่าง · ${zones.crewGate.labels.join(" · ")}`} gate={zones.crewGate} />
              <GateCard icon={UserRound} title={`ฝั่งหัวหน้า · ${zones.headGate.labels.join(" · ")}`} gate={zones.headGate} />
            </div>
          ) : null}
          {zones.sent ? (
            <p className={styles.changeLine} data-tone={zones.unchanged ? "ok" : undefined}>
              {zones.unchanged ? <Check size={14} aria-hidden="true" /> : null}
              {zones.unchanged
                ? `ครบ ${zones.totals.zones} พื้นที่ตามที่ขอ — ไม่มีพื้นที่ถูกตัดหรือเพิ่ม`
                : zones.changeText}
            </p>
          ) : null}
        </div>
      </DetailCard>

      {/* ── รายละเอียดคำร้อง ───────────────────────────────────────────────────────── */}
      <DetailCard
        icon={MessageCircleQuestion}
        eyebrow="REQUEST"
        title="รายละเอียดคำร้อง"
        meta={[request.requestedByName && `จาก ${request.requestedByName}`, request.team && `ทีม ${request.team}`, job.facts[0]?.value && `ส่งเมื่อ ${job.facts[0].value}`].filter(Boolean).join(" · ")}
      >
        <div className={styles.details}>
          <div className={styles.body}>
            {request.body ? <RichText text={request.body} lines={12} /> : <p className={styles.empty}>ไม่มีรายละเอียดเพิ่ม</p>}
            {request.note ? <ReadableText text={request.note} lines={4} /> : null}
          </div>
          <dl className={styles.facts}>
            {job.facts.map((fact) => (
              <div key={fact.key} data-tone={fact.tone || undefined}>
                <dt>{fact.label}</dt>
                <dd>
                  <b>{naText(fact.value)}</b>
                  {fact.sub ? <small>{fact.sub}</small> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </DetailCard>

      <div className={styles.bottom}>
        <div className={styles.threadCol}>{thread}</div>
        <div className={styles.filesCol}>{attachments}</div>
      </div>

      {/* ⭐ จอแคบ: ปุ่มระดับใบย้ายลงการ์ดท้ายหน้า — จอแรกต้องเป็นงาน ไม่ใช่ปุ่มแก้ไข (บรีฟ D ข้อ 1)
          ⚠️ ของชุดเดียวกับหัวใบ แต่ซ่อน/โชว์ตามขนาดจอ ⇒ เห็นครั้งเดียวเสมอ */}
      {headActions.length ? (
        <DetailCard icon={FileText} eyebrow="MANAGE" title="จัดการคำร้อง" className={styles.manageCard}>
          <div className={styles.manageActions}>{renderHead(styles.bandAction)}</div>
        </DetailCard>
      ) : null}
    </>
  );
}
