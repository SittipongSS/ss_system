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
// ⭐ **ส่วน "เอกสารประเมินพื้นที่" (FM-TS-01 · เลข SU · PR-3)** วาดจาก `view.document` ล้วน — ป้าย · ฉบับ · แถวข้อมูล ·
//   กล่องสถานะ · ปุ่ม · รายการ Rev มาจาก `surveyDocumentView` (ปุ่มไหนขึ้น/จาง ลิงก์ไหนมี ตัดสินจากสิทธิ์ที่ server ให้มา)
//   · การ์ดถือแค่ของจอ: ฉบับที่กำลังดู กับรายการ Rev ที่กางอยู่ · **ไม่ยิง API เอง** — "ออกเอกสาร" เปิดกล่องยืนยันของหน้า
//
// ⚠️ **ui-visibility**: ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม (`view.send.show` / `recallAction.show`) ·
//   ติดด่าน = โชว์ปุ่มแล้วบอกเหตุ **เป็นตัวหนังสือเหนือปุ่ม** (`disabledReason` ของ
//   `DocumentControlCard` ซึ่งวาดเป็น `<p role="status">` ไม่ใช่ tooltip)
import { Fragment, useId, useState } from "react";
import { ArrowDown, Check, ChevronDown, Eye, FileText, ListChecks, Lock, X } from "lucide-react";
import thaiText from "@/components/ThaiText";
import Segmented from "@/components/ui/Segmented";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { DocumentActionGroup, DocumentControlCard, WorkflowRail } from "@/components/ui/DocumentControlPanel";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { naText } from "@/lib/format";
import { SURVEY_RAIL_QUERY } from "@/lib/service/surveyFieldView";
import { toneColor } from "@/lib/ui/tone";
import useMediaQuery from "@/lib/ui/useMediaQuery";
import styles from "./SurveyControlCard.module.css";

/* ปุ่มพาไปจุดที่แก้ได้จริง — `target` มาจากตัวตัดสิน ไม่ได้คิดที่นี่ (กฎ "ไปไหนถึงจะ
   แก้ข้อนี้ได้" มีชุดเดียว อยู่ใน `surveyControl.js`) · การ์ดแค่แปลงเป็นปุ่ม */
function JumpButton({ target, onOpenZone, onGoTab, onReload, className }) {
  if (!target) return null;
  const go = () => {
    if (target.kind === "zone") onOpenZone?.(target.zoneId);
    else if (target.kind === "tab") onGoTab?.(target.tab);
    /* `reload` = อ่านใบใหม่ (ทะเบียนขนาดแพ็คเกจมากับ GET ใบประเมิน) — ทางออกเดียวของเหตุ "อ่านทะเบียนไม่สำเร็จ" */
    else if (target.kind === "reload") onReload?.();
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
  onReload,
  /* "ตรวจอีกครั้ง" / "โหลดใหม่" ของเอกสารประเมิน — หน้าอ่านใบใหม่แล้ว **บอกผลของการกด** (อ่านไม่สำเร็จ · ตรวจแล้วยังติดเท่าเดิม)
     ⚠️ คนละตัวกับ `onReload` (อ่านใบใหม่เงียบ ๆ ของเหตุ "อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ") — ไม่ส่งมา = ตกไปใช้ `onReload` */
  onRecheckDocument,
  /* "ออกเอกสาร" ของส่วนเอกสารประเมิน — หน้าเปิดกล่องยืนยันที่บอกผลก่อนกด (การ์ดไม่ยิงเอง) */
  onIssueDocument,
  /* ref ของส่วนเอกสารประเมิน — หน้าย้ายโฟกัสมาที่นี่หลังออกเอกสารสำเร็จ (ปุ่มที่เพิ่งกดหายไปพร้อมสถานะ "ยังไม่ออก") */
  documentRef = null,
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
  /* ส่วนเอกสารประเมิน — ฉบับที่กำลังดู (ตั้งต้นฉบับลูกค้า) + รายการ Rev ก่อนหน้าที่กางอยู่ · ของจอล้วน ไม่เก็บลงเบราว์เซอร์ */
  const [docVersion, setDocVersion] = useState("customer");
  const [historyOpen, setHistoryOpen] = useState(false);
  /* จอนี้มีรางไหม (≥1200 — เส้นเดียวกับที่หน้าใช้ย้ายการ์ดเข้าราง `SURVEY_RAIL_QUERY`) · การ์ดรู้แค่ข้อเท็จจริงนี้
     ส่วน "ไม่มีรางแล้วพับไหม" เป็นของตัวตัดสิน (`view.fold.belowRail`) — ดูคำอธิบายผังเหนือ `footer` */
  const atRailWidth = useMediaQuery(SURVEY_RAIL_QUERY);
  const uid = useId();
  if (!view) return null;

  const { status, progress, gates, send, recallAction, sendBackAction, notices, zoneGaps, step, flags } = view;
  const extraId = `${uid}-extra`;
  const gatesId = `${uid}-gates`;
  const gapsId = `${uid}-gaps`;
  const stepsId = `${uid}-steps`;
  const docStatusId = `${uid}-doc-status`;
  const docHistoryId = `${uid}-doc-history`;

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
        /* กล่องแจ้งของการ์ดนี้ใช้ทรงกะทัดรัดทุกกล่อง (ดู `.compactNotice`) — คำเตือนของข้อความบนฉบับลูกค้า 3–5 ข้อในทรงปกติสูง 345–460px
           ในราง 330px · ทรงเดียวกันทั้งการ์ด (กล่องของส่วนเอกสารข้างล่างก็ทรงนี้) ไม่ใช่สองขนาดปนกัน */
        <StatusNotice key={notice.key} tone={notice.tone} title={notice.title} className={styles.compactNotice}>
          {/* กล่องที่มีรายการ (คำเตือนของข้อความบนฉบับลูกค้า · PR-3) — กางครบทุกข้อ แล้ว `text` เป็นบรรทัดปิดท้าย
              ("แก้ได้ที่ไหน · หรือส่งตามนี้ได้") · กล่องอื่นวาดเหมือนเดิมทุกตัวอักษร */}
          {notice.items?.length ? (
            <>
              <ul className={styles.noticeList}>
                {notice.items.map((line) => <li key={line}>{thaiText(line)}</li>)}
              </ul>
              <span className={styles.noticeLine}>{thaiText(notice.text)}</span>
            </>
          ) : notice.text}
          {notice.meta ? <small className={styles.noticeMeta}>{notice.meta}</small> : null}
        </StatusNotice>
      ))}
    </>
  ) : null;

  // ── ④ ปุ่มระดับใบ — ชุดเดียว ──────────────────────────────────────────
  /* 🔑 `disabledReason` ของการ์ดกลางวาดเป็น `<p role="status">` เหนือปุ่มให้แล้ว —
     ปุ่มพาไปจึงอยู่ **ในบรรทัดเดียวกัน** ไม่ใช่ลิงก์ลอยคนละก้อน (แบบที่อนุมัติ §4) */
  const sendReason = send.reason || null;
  /* ปุ่ม `reload` ในบรรทัดเหตุมีสองเจ้าของ — ตัวตัดสินตั้ง `key` ของเหตุมาให้ การ์ดแค่เดินสายไปหาตัวจัดการที่ถูกตัว:
     · อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ (`registry-unread` · "โหลดใหม่") = อ่านใบใหม่ตามเดิม (`onReload`)
     · ที่เหลือคือ "ตรวจอีกครั้ง" ของเหตุที่ติดเฉพาะเอกสารประเมิน = ปุ่มเดียวกับของกล่องสถานะในส่วนเอกสาร ซึ่งบนมือถือ/แท็บเล็ตก่อนส่งผล
       พับอยู่หลังปุ่มคลี่ ⇒ ปุ่มในบรรทัดนี้คือทางตรวจซ้ำเดียวที่ตาเห็น ต้องบอกผลของการกดเหมือนกัน (`recheckDocument`) */
  const recheckDocument = onRecheckDocument || onReload;
  const reasonReload = sendReason?.key === "registry-unread" ? onReload : recheckDocument;
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
            {/* เหตุหลายข้อ (ติดเฉพาะเอกสารประเมิน) = บรรทัดนำ + รายการข้อละบรรทัด จากตัวตัดสิน (`lead` · `items`) — ไม่ใช่ประโยคเดียวที่ต่อด้วย " | "
                · **รายการกางที่กล่องนี้ทุกขนาดจอ** — คนที่กดส่งไม่ได้ต้องเห็นเหตุในจอแรก: ส่วนเอกสาร (ที่กางรายการเดียวกัน) พับอยู่ที่จอที่ไม่มีราง
                  และที่รางก็อยู่ใต้บล็อกด่าน ต่ำกว่าขอบจอแรก (🐞 UAT PR-3 · S03 ที่ 1440×900: กล่องนี้เหลือแค่ "ติด 2 ข้อ" ไม่มีข้อไหนอ่านได้โดยไม่เลื่อน)
                ⚠️ **`span` + role ไม่ใช่ `ul`/`li`** — การ์ดกลางวาดเหตุนี้ใน `<p role="status">` ซึ่งมี `ul` ข้างในไม่ได้ (HTML ผิด = hydration error) */}
            {sendReason.items?.length ? (
              <>
                {thaiText(sendReason.lead)}
                <span className={`${styles.noticeList} ${styles.reasonItems}`} role="list">
                  {sendReason.items.map((line) => <span key={line} role="listitem">{thaiText(line)}</span>)}
                </span>
              </>
            ) : thaiText(sendReason.text)}
            <JumpButton
              target={sendReason.target}
              onOpenZone={onOpenZone}
              onGoTab={onGoTab}
              onReload={reasonReload}
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
  /* ใบที่ส่งผลแล้ว: แถวอื่นหมายถึง "ผ่านตอนส่ง" เหมือนเดิม — มีแค่แถวเอกสารประเมินที่ติดหลังส่งได้ (`view.gatesSentFailed`
     · ตัวตัดสินนับให้ การ์ดไม่มีกติกาเอง) ⇒ ป้ายต้องไม่บอก "ผ่านครบ" ทับแถวที่ยังติดอยู่ */
  const gateBadge = flags.sent
    ? view.gatesSentFailed
      ? <StatusBadge size="sm" tone="warning">{`ติด ${view.gatesSentFailed} / ${gates.length} ข้อ`}</StatusBadge>
      : <StatusBadge size="sm" tone="success">{`ผ่านครบ ${gates.length} ข้อตอนส่ง`}</StatusBadge>
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
            {/* แถวรูปจุด (มติ 01/10) มีเหตุเต็มของ server ในตัว ("มีรูปจุดที่ยังไม่ได้ผูก n รูป — ผูกก่อนส่งผล (…)")
                — ชื่อพื้นที่อยู่ในเหตุแล้ว ⇒ ไม่ต่อ "ขาด …" ซ้ำ */}
            {/* เหตุหลายข้อ (แถวเอกสารประเมิน · แถวแพ็คเกจที่ขนาดถูกลบ) = ข้อละบรรทัดจาก `gate.reasons` — ไม่ใช่ประโยคเดียวที่ต่อด้วย " | " */}
            {!gate.ok && gate.reasons?.length > 1 ? (
              <ul className={`${styles.noticeList} ${styles.gateReasons}`}>
                {gate.reasons.map((line) => <li key={line}>{thaiText(line)}</li>)}
              </ul>
            ) : !gate.ok && gate.reason
              ? <small>{thaiText(gate.reason)}</small>
              : !gate.ok && gate.zones?.length
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
      {/* ⭐ **ด่านที่ติดแต่ไม่มีพื้นที่ให้ชี้ (แถวเอกสารประเมิน) — บล็อกเอ่ยชื่อด่านนั้นเอง** (`view.gateNotes` · ตัวตัดสินเลือกแถวและถ้อยคำ)
          🐞 UAT PR-3 (S03 ที่ราง): ป้าย "ติด 1 / 8 ข้อ" ไม่มีแถวไหนบอกว่าข้อไหน ยืนอยู่ระหว่าง "ติด 2 ข้อ" ของกล่องเหตุกับของส่วนเอกสาร
          ⇒ แถวนี้บอกว่า 1 ข้อนั้นคือด่านเอกสาร เหตุของมันอยู่ที่ส่วนเอกสาร · ไม่พิมพ์เหตุ/จำนวนซ้ำ (รายการครบอยู่แล้วสองที่)
          ⚠️ วาดทั้งก่อนและหลังส่งผล (แถวรายพื้นที่ข้างบนมีเฉพาะก่อนส่ง) — ใบที่ส่งแล้วด่านที่ติดได้มีแถวนี้แถวเดียว */}
      {view.gateNotes.length ? (
        <ul className={styles.gapList}>
          {view.gateNotes.map((row) => (
            <li key={row.key} className={styles.gapRow}>
              <span className={styles.mark} aria-hidden="true"><X size={12} /></span>
              <div>
                <p className={styles.gapName}><b>{row.label}</b></p>
                <small>{thaiText(row.note)}</small>
              </div>
            </li>
          ))}
        </ul>
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

  // ── ⑧ เอกสารประเมินพื้นที่ (FM-TS-01 · เลข SU · PR-3) ─────────────────────
  /* 🔑 **วาดจาก `view.document` อย่างเดียว** — ฉบับไหนมีให้เลือก · ปุ่มไหนขึ้น/จาง · ลิงก์ไหนมี มาจากสิทธิ์ที่ server ให้
     (`surveyDocumentView`) · การ์ดไม่ประกอบ URL เอง และไม่เดาจากสถานะของใบ
     ⚠️ กล่องสถานะเป็นของ **ฉบับที่เลือก** (`versions[i].status`) — ใบที่ตรึงแล้วมีไฟล์ฉบับลูกค้าแต่ยังไม่มีฉบับภายใน
        ต้องพูดคนละประโยคเมื่อสลับฉบับ · ไม่มีฉบับให้เลือก (อ่านสถานะไม่สำเร็จ · ใบที่จบแล้ว) = กล่องของทั้งส่วน */
  const doc = view.document;
  const docShown = doc.versions.find((v) => v.key === docVersion) || doc.versions[0] || null;
  const docStatus = docShown ? docShown.status : doc.status;
  /* ⚠️ เหตุที่ปุ่มกดไม่ได้อยู่ที่กล่องสถานะกล่องเดียว — ปุ่มที่จางทุกตัวชี้ไปด้วย `aria-describedby` (id อยู่ที่ `div` ที่ห่อกล่อง
     เพราะ `StatusNotice` ไม่รับ id) · ปุ่มที่ขึ้นแต่กดไม่ได้ไม่มี `href` ⇒ ช่องปุ่มวาดเป็น `<button aria-disabled>` ที่ยัง Tab ถึง */
  const docActions = [
    docShown?.preview ? {
      id: "doc-preview",
      kind: "open",
      icon: Eye,
      label: docShown.preview.label,
      variant: "outline",
      href: docShown.preview.href,
      external: true,
      disabled: docShown.preview.blocked,
    } : null,
    docShown?.download ? {
      id: "doc-download",
      kind: "download",
      label: docShown.download.label,
      variant: docShown.download.blocked ? "outline" : "filled",
      href: docShown.download.href,
      external: true,
      disabled: docShown.download.blocked,
    } : null,
    /* "ออกเอกสาร" — มีสิทธิ์แต่ยังกดไม่ได้ (กำลังออก · ติดเหตุ) = วาดแล้วจาง ไม่ซ่อน · ไม่มีสิทธิ์ = ไม่มี `doc.issue` เลย */
    doc.issue ? {
      id: "doc-issue",
      kind: "print",
      label: "ออกเอกสาร",
      variant: "filled",
      disabled: !doc.issue.allowed,
      onClick: onIssueDocument,
    } : null,
  ].filter(Boolean);
  const documentSection = doc.show ? (
    <section
      ref={documentRef}
      tabIndex={-1}
      className={`${styles.sec} ${doc.placement === "pinned" ? styles.docPinned : ""}`.trim()}
      aria-label="เอกสารประเมินพื้นที่"
    >
      <p className={styles.secTitle}>
        <span className={styles.docTitle}>
          <FileText size={14} aria-hidden="true" />
          เอกสารประเมินพื้นที่
        </span>
        {doc.badge.label ? <StatusBadge size="sm" tone={doc.badge.tone}>{doc.badge.label}</StatusBadge> : null}
      </p>
      {/* ⭐ สองฉบับ = แถบสองปุ่มที่เห็นทั้งคู่ ไม่ใช่ดรอปดาวน์ (กติกา "ตัวเลือกน้อย = ปุ่มที่มองเห็น") · ฉบับเดียวไม่มีแถบ */}
      {doc.versions.length > 1 ? (
        <Segmented
          className={styles.docSeg}
          ariaLabel="ฉบับของเอกสาร"
          value={docShown.key}
          onChange={setDocVersion}
          options={doc.versions.map((v) => ({ value: v.key, label: v.label }))}
        />
      ) : null}
      {docShown ? <p className={styles.more}>{thaiText(docShown.note)}</p> : null}
      {doc.rows.length ? (
        <dl className={`${styles.refs} ${styles.docBlock}`}>
          {doc.rows.map((row) => (
            <div key={row.key}><dt>{row.label}</dt><dd className="num">{row.value}</dd></div>
          ))}
        </dl>
      ) : null}
      {docStatus ? (
        <div id={docStatusId} className={styles.docBlock}>
          <StatusNotice tone={docStatus.tone} className={styles.compactNotice}>
            {thaiText(docStatus.text)}
            {docStatus.items.length ? (
              <ul className={styles.noticeList}>
                {docStatus.items.map((line) => <li key={line}>{thaiText(line)}</li>)}
              </ul>
            ) : null}
            {docStatus.foot ? <span className={styles.noticeLine}>{thaiText(docStatus.foot)}</span> : null}
            {/* ทางออกของกล่อง ("ตรวจอีกครั้ง" · "โหลดใหม่") = อ่านใบใหม่ — ตัวตรวจเอกสารอยู่ฝั่ง server · หน้าบอกผลของการกด
                (อ่านไม่สำเร็จ · ตรวจแล้วยังติดเท่าเดิม) เพราะทั้งสองกรณีจอนี้ไม่ขยับ */}
            {docStatus.action ? (
              <span className={styles.noticeLine}>
                <JumpButton target={docStatus.action} onReload={recheckDocument} />
              </span>
            ) : null}
          </StatusNotice>
        </div>
      ) : null}
      {/* ข้อที่ระบบพิมพ์ลงเอกสารแต่หัวหน้ายังไม่ได้อ่านก่อนออก (เช่น ภาพผังหลายรูปพิมพ์รูปเดียว) — บอกหลังออก ไม่ใช่เงียบ */}
      {doc.printed ? (
        <div className={styles.docBlock}>
          <StatusNotice tone="info" title={doc.printed.title} className={styles.compactNotice}>
            <ul className={styles.noticeList}>
              {doc.printed.items.map((line) => <li key={line}>{thaiText(line)}</li>)}
            </ul>
          </StatusNotice>
        </div>
      ) : null}
      {docActions.length ? (
        <div className={styles.docBlock}>
          <DocumentActionGroup
            actions={docActions}
            busy={busy}
            /* ชื่อกลุ่มพกชื่อฉบับ — "ดูตัวอย่าง" เฉย ๆ บอกโปรแกรมอ่านจอไม่ได้ว่าของฉบับไหน */
            label={docShown ? `เอกสาร${docShown.label}` : "เอกสารประเมินพื้นที่"}
            describedBy={docStatus ? docStatusId : undefined}
          />
        </div>
      ) : null}
      {doc.hint ? <p className={styles.more}>{thaiText(doc.hint)}</p> : null}
      {/* 🔴 รายการ Rev ก่อนหน้า **ไม่มีลิงก์สักแถว** (มติเจ้าของ 01/10 ข้อ 5 — ฉบับที่ถูกแทนที่เปิดไม่ได้) · มีไว้ให้รู้ว่าเคยออกอะไร
          🐞 UAT PR-3: บรรทัดของแถว ("… · ดึงผลกลับมาแก้") เคยขึ้นบรรทัดใหม่กลางคำ ("ดึงผลก" / "ลับมาแก้") ⇒ ผ่าน `thaiText` เหมือนร้อยแก้วอื่นของส่วนนี้ */}
      {doc.history ? (
        <>
          <p className={styles.secLinks}>
            <button
              type="button"
              className="text-action"
              aria-expanded={historyOpen}
              aria-controls={docHistoryId}
              onClick={() => setHistoryOpen((v) => !v)}
            >
              {historyOpen ? doc.history.hideLabel : doc.history.label}
            </button>
          </p>
          <div id={docHistoryId} className={styles.docBlock} hidden={!historyOpen}>
            <ul className={styles.gateList}>
              {doc.history.rows.map((row, index) => (
                <li key={`${row.docNo}-${index}`} className={styles.gateRow}>
                  <span className={styles.gateBody}>
                    <b className="num">{row.docNo}</b>
                    <small>{thaiText(row.line)}</small>
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.more}>{doc.history.foot}</p>
          </div>
        </>
      ) : null}
    </section>
  ) : null;

  // ── ส่วนรองของการ์ด + ปุ่มคลี่ (มติเจ้าของ 08/10 ชุดสุดท้าย) ─────────────────
  /* ⭐ **การ์ดมีสองผัง และตัวตัดสินเป็นคนเลือก** (`doc.placement` + `view.fold` · การ์ดไม่มีกติกาเอง) — ทุกชิ้นมีตำแหน่งจริงใน DOM
      ที่เดียว ลำดับ Tab ตรงกับที่ตาเห็นทุกขนาดจอ ไม่มีการสลับด้วย CSS `order`
      · `fold` (ก่อนส่งผล) และการ์ดที่ไม่มีส่วนเอกสาร (ช่าง · คนดูที่ไม่ได้ส่งผล):
          [ปุ่มคลี่] → ด่าน → ส่วนเอกสาร → ขั้นตอน → เอกสารที่เกี่ยวข้อง
      · `pinned` (ส่งผลแล้ว · ใบจบแล้ว · อ่านสถานะไม่สำเร็จ):
          ส่วนเอกสาร → [ปุ่มคลี่] → ด่าน → ขั้นตอน → เอกสารที่เกี่ยวข้อง   (ส่วนเอกสารเห็นเสมอทุกขนาดจอ)
      **พับที่ไหน** (ปิดไว้ตั้งต้นทุกที่ที่พับ):
      · จอ ≤1050 — ทุกการ์ด (CSS · เหมือนก่อน PR-3)
      · ทุกความกว้าง — การ์ดที่มีส่วนเอกสารของใบที่ส่งผลแล้ว/จบแล้ว (`fold.wide` ⇒ การ์ดพอดีรางที่ปักหมุด)
      · ทุกที่ที่ไม่มีราง (<1200) — การ์ดที่มีส่วนเอกสารของใบที่ยังไม่ส่ง (`fold.belowRail`): "จอกว้าง" ของมติเจ้าของคือ **ราง** ·
        ที่ 1051–1199 การ์ดไหลตามหน้า/อยู่ในบานรายการเหมือนแท็บเล็ต ⇒ ได้ผังของแท็บเล็ต
      · นอกนั้น **ไม่มีปุ่มคลี่ ทุกก้อนกาง**: ที่ราง ก่อนส่งผล ด่านอยู่ที่เดิมเหมือนก่อน PR-3 ส่วนเอกสารต่อใต้ด่านทันที (รางเลื่อนเองได้) ·
        การ์ดที่ไม่มีส่วนเอกสารที่จอ >1050 เหมือนก่อน PR-3 ทุก px
      ⚠️ ปุ่มคลี่มีตัวเดียว คุมก้อน `.extra` ก้อนเดียว — CSS โชว์ปุ่มเฉพาะที่ที่มีของพับจริง (จอ ≤1050 เสมอ · กว้างกว่านั้นเฉพาะ `data-wide`)
         ที่ไม่มีของพับ ปุ่มเป็น `display: none` (ไม่อยู่ในลำดับ Tab ไม่อยู่ใน accessibility tree) และก้อน `.extra` กางเสมอ
      ⚠️ เส้น 1200 ของรางไม่มีใน CSS ของการ์ด (เส้นจอของรางเป็นของ JS ที่เดียว) — การ์ดใส่ `data-wide` ตามจอเอง
      ⚠️ ซ่อนด้วย attribute ไม่ใช่ unmount — สถานะของปุ่มคลี่ข้างใน (ด่านครบทุกข้อ · ทุกขั้น · Rev ก่อนหน้า) จะได้ไม่รีเซ็ตทุกครั้ง
      ⚠️ กล่องเตือนของข้อความบนฉบับลูกค้าอยู่ในกล่องแจ้งของการ์ด นอกส่วนที่พับทุกขนาดจอ */
  const fold = view.fold;
  const foldsOnWide = fold.wide || (fold.belowRail && !atRailWidth);
  /* ⭐ **คำบนปุ่มคลี่ = ชื่อของก้อนที่อยู่ข้างในจริง เรียงตามลำดับที่กางออกมา** — ชื่อมาจากตัวตัดสิน (`fold.labels` · `null` = ก้อนนั้น
     ไม่อยู่ข้างใน) · การ์ดตัดได้อย่างเดียว: ชื่อของก้อน "เอกสารที่เกี่ยวข้อง" เมื่อตัวเองไม่ได้วาดก้อนนั้น (ลิงก์มาจากหน้า ตัวตัดสินไม่เห็น) */
  const foldParts = [
    fold.labels.gates,
    fold.labels.document,
    fold.labels.steps,
    refsSection ? fold.labels.refs : null,
  ].filter(Boolean);

  const footer = (
    <>
      {/* คำอธิบายใต้ปุ่มดึงกลับ — ด่านเหตุผลอยู่ในโมดัล ปุ่มจึงกดได้เลย แต่ต้องบอก
          ล่วงหน้าว่ากดแล้วจะเจออะไร และใครจะได้รับแจ้ง
          ⚠️ **การ์ดที่มีส่วนเอกสารไม่วาดบรรทัดนี้** (กระดาน S-1: ใต้ปุ่มดึงกลับคือส่วนเอกสารเลย) — 🐞 UAT PR-3: บรรทัดนี้ 31–50px
             คือส่วนที่ทำให้การ์ดของใบที่ส่งผลแล้วสูงเกินรางที่ปักหมุดพอดี (771px ในราง 770px) · กล่องยืนยันดึงกลับบอกเรื่องเดียวกันครบ
             ทุกขนาดจอ รวมเลขเอกสารที่จะถูกแทนที่ (`recallAction.detail`) — จอ ≤1050 ซ่อนบรรทัดนี้ด้วยเหตุเดียวกันอยู่แล้ว */}
      {recallAction.show && recallAction.allowed && !doc.show
        ? <p className={styles.hint}>{recallAction.hint}</p> : null}
      {doc.placement === "pinned" ? documentSection : null}
      <button
        type="button"
        className={styles.disclosure}
        data-wide={foldsOnWide ? "1" : undefined}
        aria-expanded={moreOpen}
        aria-controls={extraId}
        onClick={() => setMoreOpen((v) => !v)}
      >
        {/* แต่ละชื่อเป็นชิ้นที่ไม่ตัดบรรทัดข้างใน — ป้ายที่ยาวเกินบรรทัด (จอ 360) ขึ้นบรรทัดใหม่ระหว่างชื่อเท่านั้น
            ไม่ใช่กลางคำ ("เอกสารที่" / "เกี่ยวข้อง") · ช่องว่างระหว่างชิ้นอยู่นอก `span` จึงเป็นจุดตัดบรรทัดจุดเดียว */}
        <span className={styles.disclosureLabel}>
          {foldParts.map((part, index) => (
            <Fragment key={part}>
              {index ? " " : null}
              <span className={styles.disclosurePart}>{index < foldParts.length - 1 ? `${part} ·` : part}</span>
            </Fragment>
          ))}
        </span>
        <span className={styles.chev} aria-hidden="true"><ChevronDown size={16} /></span>
      </button>
      <div
        className={styles.extra}
        id={extraId}
        data-compact-hidden={moreOpen ? undefined : "1"}
        data-wide-hidden={foldsOnWide && !moreOpen ? "1" : undefined}
      >
        {gatesSection}
        {doc.placement === "fold" ? documentSection : null}
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
      /* กล่องแจ้งของการ์ดนี้ขึ้น **ก่อน** ปุ่มระดับใบทุกขนาดจอ — "ตรวจข้อความบนฉบับลูกค้าก่อนส่งผล" ที่อยู่ใต้ปุ่มส่งผลคือคำเตือนที่มาช้าไปหนึ่งปุ่ม */
      noticesFirst
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      busy={busy}
      footer={footer}
    />
  );
}
