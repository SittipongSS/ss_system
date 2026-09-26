"use client";
// ── การ์ด "จัดการผลประเมิน" — จุดจัดการเดียวของใบประเมินพื้นที่ (PR3) ────────
//
// ⭐ **การ์ดใบเดียว หน้าตาเดียวกันทั้งสองแท็บ** (แบบที่อนุมัติ 2026-09-16) — สถานะ ·
//   แถบวัด · กล่องแจ้ง · ปุ่มระดับใบ · ด่านก่อนส่ง · ขั้นของใบ · เอกสารที่เกี่ยวข้อง
//   ⚠️ **ปุ่มส่งผล/ดึงกลับอยู่ที่นี่ที่เดียว** — ย้ายมาจาก `Workspace headerRight`
//   ไม่ใช่ก๊อป · บนมือถือก็ไม่มีปุ่มลอยชุดที่สอง (กฎ "หนึ่งชุด action ต่อระเบียน")
//
// 🔑 **ไม่มีกฎของตัวเองสักข้อ** — ทุกอย่างมาจาก `surveyControlView(...)` ของ PR2
//   (สถานะ · โทน · เหตุผลที่กดส่งไม่ได้ · ด่านต่อพื้นที่ · ขั้นของใบ) การ์ดนี้
//   **วาดอย่างเดียว** · เขียนเงื่อนไขใหม่ที่นี่เมื่อไรจะได้กฎสองชุดที่ server
//   มองไม่เห็นชุดหนึ่ง — กฎใหม่ไปที่ `lib/service/survey.js` เสมอ
//
// ⚠️ **ui-visibility**: ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม (`view.send.show` / `recallAction.show`) ·
//   ติดด่าน = โชว์ปุ่มแล้วบอกเหตุ **เป็นตัวหนังสือเหนือปุ่ม** (`disabledReason` ของ
//   `DocumentControlCard` ซึ่งวาดเป็น `<p role="status">` ไม่ใช่ tooltip)
import { useId, useState } from "react";
import { ArrowDown, Check, ChevronDown, ListChecks, Lock, X } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { DocumentControlCard, WorkflowRail } from "@/components/ui/DocumentControlPanel";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { naText } from "@/lib/format";
import { toneColor } from "@/lib/ui/tone";
import styles from "./SurveyControlCard.module.css";

/* ปุ่มพาไปจุดที่แก้ได้จริง — `target` มาจากตัวตัดสิน ไม่ได้คิดที่นี่ (กฎ "ไปไหนถึงจะ
   แก้ข้อนี้ได้" มีชุดเดียว อยู่ใน `surveyControl.js`) · การ์ดแค่แปลงเป็นปุ่ม */
function JumpButton({ target, onOpenZone, onGoTab, className }) {
  if (!target) return null;
  const go = () => {
    if (target.kind === "zone") onOpenZone?.(target.zoneId);
    else if (target.kind === "tab") onGoTab?.(target.tab);
  };
  return (
    <button type="button" className={`text-action ${className || ""}`.trim()} onClick={go}>
      {target.label}
    </button>
  );
}

/* ⚠️ **ไม่มีพร็อพ `tab`** โดยเจตนา — การ์ดหน้าตาเดียวกันทั้งสองแท็บ และของที่ต่าง
   ตามแท็บจริง ๆ (ปุ่มพาไป "เคาะที่สรุปส่งผล" จะโผล่หรือไม่) ถูกตัดสินใน
   `surveyControlView({ tab })` มาแล้ว ⇒ รับ `tab` ซ้ำที่นี่ = เปิดทางให้การ์ดคิดเอง */
export default function SurveyControlCard({
  view,
  busy = false,
  onSend,
  onRecall,
  onSendBack,
  onOpenZone,
  onGoTab,
  requestDocNo = null,
  requestHref = null,
  visitCode = null,
  visitHref = null,
  dueLine = null,
  inPane = false,
}) {
  /* ปุ่มคลี่สองตัวในการ์ด — state อยู่ที่การ์ด ไม่ใช่ที่หน้า (หน้าถือ state ของปุ่ม
     ทุกปุ่มเมื่อไร ก็จะได้ state ปุ่มละก้อนเหมือนหน้าโครงการรุ่นก่อน) */
  const [moreOpen, setMoreOpen] = useState(false);
  const [gatesOpen, setGatesOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const uid = useId();
  if (!view) return null;

  const { status, progress, gates, send, recallAction, sendBackAction, notices, zoneGaps, step, flags } = view;
  const extraId = `${uid}-extra`;
  const gatesId = `${uid}-gates`;
  const gapsId = `${uid}-gaps`;
  const stepsId = `${uid}-steps`;

  // ── ① สถานะ + ② แถบวัด ────────────────────────────────────────────────
  /* ⚠️ ใบที่ยกเลิกไม่มีแถบวัด — ไม่มีอะไรให้เดินต่อ แถบที่ค้างครึ่งทางอ่านเหมือนงานยังเดิน */
  /* ⭐ **ขีดละ "หนึ่งพื้นที่" ไม่ใช่เปอร์เซ็นต์** — คำถามของคนอ่านคือ "เหลืออีกกี่ห้อง"
     ซึ่งการนับขีดตอบตรง ๆ ส่วน % ต้องแปลงกลับในหัว (ทรงเดียวกับเกจช่องบังคับของฟอร์ม
     คำร้อง) · และไม่ต้องมี `style={{ width }}` ซึ่ง ratchet ของโมดูลนี้ห้ามเพิ่ม */
  /* 🐞 **ใบที่ทุกพื้นที่ถูกตัดออกก็ไม่มีแถบ** — `progress.total` เป็น 0 ⇒ แถบไม่มีขีด
     สักขีด (สูง 0px) และ `aria-valuemax={0}` เท่ากับ `aria-valuemin` ซึ่ง ARIA ห้าม
     ⇒ โปรแกรมอ่านหน้าจอประกาศ progressbar ที่ไม่มีความหมาย · พาดหัวสถานะ
     ("ยังไม่มีพื้นที่ที่ต้องประเมิน" / "ถูกตัดออกหมด") พูดครบอยู่แล้ว */
  const meter = (flags.cancelled || !progress.total) ? null : (
    <span className={`${styles.meter} ${progress.complete ? styles.meterDone : ""}`.trim()}>
      <span
        className={styles.bar}
        role="progressbar"
        aria-label={`วัดแล้ว ${progress.done} จาก ${progress.total} พื้นที่`}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        {Array.from({ length: progress.total }, (_, i) => (
          <i key={i} data-ok={i < progress.done ? "1" : undefined} />
        ))}
      </span>
      {progress.cut ? <small>ตัดออก {progress.cut}</small> : null}
    </span>
  );

  // ── ③ กล่องแจ้ง ────────────────────────────────────────────────────────
  const noticeNodes = notices.length ? (
    <>
      {notices.map((notice) => (
        <StatusNotice key={notice.key} tone={notice.tone} title={notice.title}>
          {notice.text}
          {notice.meta ? <small className={styles.noticeMeta}>{notice.meta}</small> : null}
        </StatusNotice>
      ))}
    </>
  ) : null;

  // ── ④ ปุ่มระดับใบ — ชุดเดียว ──────────────────────────────────────────
  /* 🔑 `disabledReason` ของการ์ดกลางวาดเป็น `<p role="status">` เหนือปุ่มให้แล้ว —
     ปุ่มพาไปจึงอยู่ **ในบรรทัดเดียวกัน** ไม่ใช่ลิงก์ลอยคนละก้อน (แบบที่อนุมัติ §4) */
  const sendReason = send.reason || null;
  const primaryAction = send.show
    ? {
      id: "send",
      /* `kind` เป็นเจ้าของ สี+ไอคอน+ความหมาย (submit = กรมท่า + ไอคอนส่ง) — ที่นี่
         ทับแค่ **ข้อความ** ตามที่ ActionButtons อนุญาต · ห้ามส่ง element เข้า `icon`
         (ช่องนั้นรับ *คอมโพเนนต์* แล้วเรนเดอร์เอง) */
      kind: "submit",
      label: send.label,
      disabled: !send.allowed,
      disabledReason: sendReason ? (
        <span className={styles.reason}>
          <Lock size={13} aria-hidden="true" />
          <span>
            {sendReason.text}
            <JumpButton
              target={sendReason.target}
              onOpenZone={onOpenZone}
              onGoTab={onGoTab}
              className={styles.reasonJump}
            />
          </span>
        </span>
      ) : undefined,
      onClick: onSend,
    }
    : null;

  const secondaryActions = [];
  if (recallAction.show) {
    /* ดึงกลับ **ย้อนได้** ⇒ โทนอำพัน (kind `revert`) ไม่ใช่แดง — แดงสงวนไว้ให้การลบ
       (แบบเดิมใช้ tone danger ซึ่งอ่านเหมือนงานนี้ทำลายของ) */
    secondaryActions.push({
      id: "recall",
      kind: "revert",
      label: "ดึงผลกลับมาแก้",
      disabled: !recallAction.allowed,
      disabledReason: view.recallBlockedReason || undefined,
      onClick: onRecall,
    });
  }
  /* ช่างที่ยังวัดไม่ครบ — ปุ่มเดียวที่เขาต้องการคือ "ไปพื้นที่ที่ยังไม่ครบ"
     ⚠️ ขึ้นเฉพาะตอนไม่มีปุ่มระดับใบตัวอื่น ไม่งั้นการ์ดจะมีปุ่มสองชุดคนละเรื่อง */
  const nextZone = (!send.show && !recallAction.show && flags.canWrite && view.nextZone)
    ? view.nextZone : null;
  if (nextZone) {
    secondaryActions.push({
      id: "next-zone",
      kind: "goto",
      label: `ไปพื้นที่ที่ยังไม่ครบ: ${nextZone.name}`,
      // ลูกศรลง = "ของที่รออยู่ข้างล่างในหน้านี้" ไม่ใช่ลูกศรขวาที่แปลว่าไปอีกหน้า
      icon: ArrowDown,
      onClick: () => onOpenZone?.(nextZone.id),
    });
  }

  // ── ⑤ ด่านก่อนส่งผล ────────────────────────────────────────────────────
  const gateBadge = flags.sent
    ? <StatusBadge size="sm" tone="success">{`ผ่านครบ ${gates.length} ข้อตอนส่ง`}</StatusBadge>
    : view.gatesFailed
      ? <StatusBadge size="sm" tone="warning">{`ติด ${view.gatesFailed} / ${gates.length} ข้อ`}</StatusBadge>
      : <StatusBadge size="sm" tone="success">{`ผ่านครบ ${gates.length} ข้อ`}</StatusBadge>;

  /* รายการครบทุกข้อ **อยู่หลังปุ่มคลี่** — 🐞 ของเดิมกางครบหกข้อตลอด ใบที่ส่งแล้ว
     จึงได้กล่องเขียวยาว 409px ที่ไม่มีข้อมูลอะไรเพิ่ม (ผลตรวจ 2026-09-16) */
  const gateFullList = (
    <ul className={styles.gateList} id={gatesId} hidden={!gatesOpen}>
      {gates.map((gate) => (
        <li key={gate.key} className={styles.gateRow} data-ok={gate.ok ? "1" : undefined}>
          <span className={styles.mark} aria-hidden="true">
            {gate.ok ? <Check size={12} /> : <X size={12} />}
          </span>
          {/* ⚠️ **ข้อที่ติดต้องบอกชื่อพื้นที่** (กติกาเดียวกับที่ `surveySendError` เขียนไว้:
              "ใบหนึ่งมีได้สิบพื้นที่ ข้อความที่ไม่บอกว่าพื้นที่ไหน แปลว่าหัวหน้าต้อง
              ไล่เปิดทีละอันเอง") — 🐞 รายการนี้เคยมีแต่ชื่อข้อกับ n/m ทั้งที่บรรทัด
              "อีก n พื้นที่ยังติด" ข้างบนชี้มาที่นี่ว่าให้มาดูชื่อ ⇒ ชี้ไปยังที่ที่ไม่มีคำตอบ */}
          <span className={styles.gateBody}>
            <span className={styles.gateLine}>
              <b>{gate.label}</b>
              <small>{gate.done}/{gate.total}</small>
            </span>
            {!gate.ok && gate.zones?.length
              ? <small>{`ขาด ${gate.zones.join(" · ")}`}</small>
              : null}
          </span>
        </li>
      ))}
    </ul>
  );

  /* แถวของพื้นที่ที่ติด — ตัวเดียวกันทั้งอันที่กางอยู่และอันที่อยู่หลังปุ่มคลี่
     (สองชุดเมื่อไรก็เพี้ยนหากันเมื่อนั้น) */
  const gapRow = (row) => (
    <li key={row.zoneId} className={styles.gapRow}>
      <span className={styles.mark} aria-hidden="true"><X size={12} /></span>
      <div>
        <p className={styles.gapName}>
          <b>{row.zoneName}</b>
          <small>{row.zoneCodeUnknown ? "ไม่ทราบรหัส" : naText(row.zoneCode)}</small>
        </p>
        {row.crewText ? <small>{row.crewText}</small> : null}
        {row.headText ? <small>{row.headText}</small> : null}
        {row.targets.length ? (
          <span className={styles.gapActions}>
            {row.targets.map((target) => (
              <JumpButton
                key={`${target.kind}-${target.label}`}
                target={target}
                onOpenZone={onOpenZone}
                onGoTab={onGoTab}
              />
            ))}
          </span>
        ) : null}
      </div>
    </li>
  );
  const gapShown = flags.sent ? [] : zoneGaps.shown;
  const gapFirst = gapShown.slice(0, 1);
  const gapRest = gapShown.slice(1);

  const gatesSection = flags.cancelled ? null : (
    <section className={styles.sec} aria-label={view.gatesTitle}>
      <p className={styles.secTitle}><span>{view.gatesTitle}</span>{gateBadge}</p>
      {/* ⭐ **ด่านที่ติดรวมเป็นกลุ่มต่อพื้นที่ ไม่ใช่กำแพงหกแถว** — คนที่กดส่งไม่ได้
          มีคำถามเดียว: "ต้องไปทำอะไรที่ไหน" · เรียงตามข้อ = เขาต้องประกอบเอง */}
      {gapFirst.length ? <ul className={styles.gapList}>{gapFirst.map(gapRow)}</ul> : null}
      {/* ⭐ **พื้นที่ที่ติดเกินอันแรกอยู่หลังปุ่มคลี่** — 🐞 กางครบสามอันแล้วการ์ดสูง
          เกินเพดานรางที่ปักหมุดได้ (`--pinned-box-max` 721px) ตั้งแต่ใบที่มีสามพื้นที่
          ซึ่งเป็นใบธรรมดาที่สุด ⇒ รางได้สกรอลล์ของตัวเอง แล้ว "ขั้นตอนของใบ" กับ
          "เอกสารที่เกี่ยวข้อง" หลุดสายตา (วัดจริง 2026-09-16 ที่ 1440×900: 721/721)
          ⚠️ อันแรกยังกางเสมอ — คนที่กดส่งไม่ได้ต้องเห็น "ไปทำอะไรที่ไหน" ทันทีอย่างน้อย
             หนึ่งที่ โดยไม่ต้องกดอะไรก่อน */}
      {gapRest.length ? (
        <>
          <p className={styles.more}>
            <button
              type="button"
              className="text-action"
              aria-expanded={gapsOpen}
              aria-controls={gapsId}
              onClick={() => setGapsOpen((v) => !v)}
            >
              {gapsOpen ? "ซ่อนพื้นที่ที่เหลือ" : `ดูอีก ${zoneGaps.rows.length - 1} พื้นที่ที่ติด`}
            </button>
          </p>
          <ul className={styles.gapList} id={gapsId} hidden={!gapsOpen}>{gapRest.map(gapRow)}</ul>
          {gapsOpen && zoneGaps.hidden
            ? <p className={styles.more}>อีก {zoneGaps.hidden} พื้นที่ยังติด — ชื่อครบอยู่ในรายการด่านข้างล่าง</p>
            : null}
        </>
      ) : null}
      <p className={styles.secLinks}>
        {/* ปุ่มส่งกลับมีครั้งเดียวต่อใบ — ไม่ใช่ปุ่มต่อข้อเหมือนของเดิม
            🔄 ขึ้นตาม `sendBackAction.show` ไม่ใช่ "ยังมีของช่างค้าง" (§10.5 S4) — ฝั่งช่างครบแล้ว
            หัวหน้ายังขอรูปเพิ่มได้ (ม็อก A-5/AW-2) · คำบนปุ่มมาจากตัวตัดสินตัวเดียวกัน */}
        {sendBackAction.show ? (
          <button type="button" className="text-action" onClick={() => onSendBack?.()}>
            {sendBackAction.label}
          </button>
        ) : null}
        <button
          type="button"
          className="text-action"
          aria-expanded={gatesOpen}
          aria-controls={gatesId}
          onClick={() => setGatesOpen((v) => !v)}
        >
          {gatesOpen ? "ซ่อนรายการด่าน" : `ดู${flags.sent ? "" : "ด่าน"}ทั้ง ${gates.length} ข้อ`}
        </button>
      </p>
      {gateFullList}
    </section>
  );

  // ── ⑥ ขั้นของใบ — ชุด 6 ขั้นเดียวกับหน้าคำร้อง ────────────────────────
  /* ⚠️ ทับเฉพาะ **บรรทัดใต้ขั้นปัจจุบัน** ด้วยข้อเท็จจริงของใบประเมิน — ชื่อขั้นไม่แตะ
     (ฝ่ายขายอ่านรางบนหน้าคำร้อง TS อ่านการ์ดนี้ · สองชุดที่ชื่อไม่ตรงกัน = สองฝ่าย
     คุยกันคนละเรื่องทั้งที่ดูใบเดียวกัน) */
  const railSteps = workflowStepsFromIndex(step.steps, step.index, step.cancelled)
    .map((s, i) => ({ ...s, number: i + 1, hint: i === step.index ? step.hint : s.hint }));
  const shownSteps = stepsOpen ? railSteps : railSteps.slice(step.index, step.index + 1);
  const stepsSection = (
    <section className={styles.sec} aria-label="ขั้นตอนของใบ">
      <p className={styles.secTitle}>
        <span>ขั้นตอนของใบ · ขั้น {step.index + 1}/{step.total}</span>
        <button
          type="button"
          className="text-action"
          aria-expanded={stepsOpen}
          aria-controls={stepsId}
          onClick={() => setStepsOpen((v) => !v)}
        >
          {stepsOpen ? "ซ่อน" : "ดูทุกขั้น"}
        </button>
      </p>
      {/* ⚠️ ป้ายของรางต้องไม่ซ้ำกับป้ายของบล็อก — สอง landmark ชื่อเดียวกันในการ์ดเดียว
          ทำให้โปรแกรมอ่านหน้าจอ (และตัวตรวจ) หยิบผิดตัว */}
      <div id={stepsId}><WorkflowRail steps={shownSteps} label="ลำดับขั้นของใบประเมิน" /></div>
    </section>
  );

  // ── ⑦ เอกสารที่เกี่ยวข้อง ──────────────────────────────────────────────
  /* ⚠️ **ไม่มีสิทธิ์ = ไม่โชว์ลิงก์** (กติกา ui-visibility) — ช่าง (role `ts`) เปิดหน้า
     คำร้องไม่ได้ (403 จาก `GET /api/sa/requests/[id]`) ⇒ ลิงก์ต้องไม่โผล่ให้เขา
     🐞 **เคยเดาคำตอบนี้เองจากธงเขียน/เคาะ** (`!readOnly && !canDecide` = "ช่าง") ซึ่ง
        พลาด **ช่างที่ไม่ได้อยู่ในนัดนั้น**: เขาเปิดใบของเพื่อนอ่านได้ (ตั้งใจให้ได้ —
        ตอนสลับคิว/ไปช่วยงาน) แต่ `canWrite = false` ⇒ ถูกจัดเป็น "คนดู" แล้วได้ลิงก์
        ที่ตอบ 403 ใส่เขา · สิทธิ์นี้ผูกกับ **role** ซึ่งจอไม่รู้ ⇒ server ตอบมาให้แล้ว
        (`canOpenRequest` ของ payload → `view.flags`) · อย่ากลับไปอนุมานจากธงอื่นอีก */
  const showRequestLink = !!requestHref && flags.canOpenRequest;
  const refsSection = (showRequestLink || visitHref) ? (
    <section className={styles.sec} aria-label="เอกสารที่เกี่ยวข้อง">
      <p className={styles.secTitle}><span>เอกสารที่เกี่ยวข้อง</span></p>
      <dl className={styles.refs}>
        {showRequestLink ? (
          <div><dt>คำร้อง</dt><dd><a className="text-action" href={requestHref}>{naText(requestDocNo)}</a></dd></div>
        ) : null}
        {visitHref ? (
          <div><dt>ใบส่งงาน</dt><dd><a className="text-action" href={visitHref}>{naText(visitCode)}</a></dd></div>
        ) : null}
      </dl>
    </section>
  ) : null;

  /* ⭐ **ปุ่มคลี่นี้มีผลเฉพาะจอ ≤1050px** — ที่นั่นรางขวาเลิกปักหมุดแล้วไหลลงใต้เนื้อ
      ส่วนรองทั้งสามก้อนจึงดันของที่คนกำลังจะกดลงไปก้นหน้า · จอกว้างกางอยู่แล้ว
      (CSS ซ่อนปุ่มและล้าง [hidden] ทิ้งใน media query — ดู .more ใน .module.css)
      ⚠️ ใช้ `hidden` ไม่ใช่ unmount — สถานะของสองปุ่มคลี่ข้างในจะได้ไม่รีเซ็ตทุกครั้ง */
  /* ⚠️ คำบนปุ่มคลี่ใช้ **หัวข้อเดียวกับบล็อกด่านข้างใน** (`view.gatesTitle`) — ช่างเห็น
     "ของที่ช่างต้องเก็บ" หัวหน้าเห็น "ด่านก่อนส่งผล" · ปุ่มที่เรียกของข้างในคนละชื่อ
     ทำให้คนกดแล้วคิดว่ากดผิดปุ่ม */
  const failedLabel = flags.cancelled ? "ขั้นตอน · เอกสารที่เกี่ยวข้อง"
    : flags.sent ? `${view.gatesTitle} (ผ่านครบ) · ขั้นตอน · เอกสาร`
      : `${view.gatesTitle}${view.gatesFailed ? ` (ติด ${view.gatesFailed})` : " (ผ่านครบ)"} · ขั้นตอน · เอกสาร`;

  const footer = (
    <>
      {/* คำอธิบายใต้ปุ่มดึงกลับ — ด่านเหตุผลอยู่ในโมดัล ปุ่มจึงกดได้เลย แต่ต้องบอก
          ล่วงหน้าว่ากดแล้วจะเจออะไร และใครจะได้รับแจ้ง */}
      {recallAction.show && recallAction.allowed
        ? <p className={styles.hint}>{recallAction.hint}</p> : null}
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={moreOpen}
        aria-controls={extraId}
        onClick={() => setMoreOpen((v) => !v)}
      >
        <span className={styles.disclosureLabel}>{failedLabel}</span>
        <span className={styles.chev} aria-hidden="true"><ChevronDown size={16} /></span>
      </button>
      <div className={styles.extra} id={extraId} data-compact-hidden={moreOpen ? undefined : "1"}>
        {gatesSection}
        {stepsSection}
        {refsSection}
      </div>
    </>
  );

  return (
    <DocumentControlCard
      className={styles.card}
      icon={ListChecks}
      /* จอแคบ = การ์ดนี้ไหลขึ้นไปอยู่บนสุดของหน้า และมีพาดหัวสถานะของตัวเองอยู่แล้ว
         ⇒ แถบหัวการ์ดอีก 77px ดันแท็บและพื้นที่แรกตกจอที่ 1024×768 (แบบที่อนุมัติ
         ซ่อนหัวการ์ดที่ ≤1050 เหมือนกัน — ดู `.cc-head` ในม็อก) */
      headerNarrow="hide"
      /* แท็บเล็ต (681–1050): สถานะซ้าย · ปุ่มขวา — ที่ความกว้างนั้นการ์ดกินเต็มแถว
         คอลัมน์เดียวจึงดันแถบแท็บและพื้นที่แรกตกจอ (แบบที่อนุมัติวางไว้แบบนี้เหมือนกัน)
         ⚠️ **ในบานรายการ 320px ไม่แบ่ง** (`inPane` · สองบาน 1000–1199 · §10.5 S9) — เส้น 1050 ของการ์ดกลางดูความกว้างจอ
            ไม่ใช่ความกว้างของกล่อง ⇒ ที่ 1000–1050 การ์ดในบานแคบถูกผ่าเป็นสองคอลัมน์ละ ~140px */
      tabletSplit={!inPane}
      eyebrow="SURVEY CONTROL"
      title="จัดการผลประเมิน"
      status={status.headline}
      statusColor={toneColor(status.tone)}
      statusSub={(
        <>
          <span className={styles.statusSub}>{status.sub}</span>
          {/* กำหนดส่งผล (ม็อก AW-2) — เดิมเป็นช่อง "TS จะส่งผล" ของหัวใบที่ถอดไปในชุด S9 · คำมาจาก `surveyDueLine` */}
          {dueLine ? <span className={styles.due} data-late={dueLine.late ? "" : undefined}>{dueLine.text}</span> : null}
          {meter}
        </>
      )}
      notices={noticeNodes}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      busy={busy}
      footer={footer}
    />
  );
}
