"use client";
// ── ส่วน "เอกสารประเมินพื้นที่" (FM-TS-01 · เลข SU · PR-3) — ชิ้นเดียว สองที่วาง ────────────────────────
//
// ⭐ **ยกออกจาก `SurveyControlCard` ตามมติเจ้าของ 19/10/2026** (*"ให้ apisith planner ออกให้ด้วย"*) — ผู้วางคิว (`ts_planner`)
//   กด "ออกเอกสาร" ได้ แต่ไม่มีการ์ดจัดการผล (การ์ดเป็นของคนส่งผล/ดึงผลกลับ = หัวหน้า) ⇒ ส่วนเดียวกันต้องวาดได้สองที่:
//   · ในการ์ดของหัวหน้า — ตำแหน่งเดิมทุกจุด (ปักเหนือปุ่มคลี่ / ต่อใต้ด่านในส่วนรอง ตาม `placement`)
//   · บล็อกเดี่ยวหัวรายการพื้นที่ของผู้วางคิว (`standalone`) — เฉพาะใบที่ส่งผลแล้ว (ตัวตัดสินซ่อนก่อนส่ง)
//   ⚠️ **ห้ามแยกเป็นสองชุด** (กติกา "ปุ่มแก้ไขเปิดฟอร์มตัวเดียวกับตอนสร้าง" ของ AGENTS.md) — ต่างกันได้แค่โหมดผ่าน prop
//
// 🔑 **วาดจาก `view` (= `view.document` ของ `surveyControlView`) อย่างเดียว** — ฉบับไหนมีให้เลือก · ปุ่มไหนขึ้น/จาง · ลิงก์ไหนมี
//   มาจากสิทธิ์ที่ server ให้ (`surveyDocumentView`) · ไม่ประกอบ URL เอง ไม่เดาจากสถานะของใบ · **ไม่ยิง API เอง** —
//   "ออกเอกสาร" เปิดกล่องยืนยันของหน้า · "ตรวจอีกครั้ง" / "โหลดใหม่" เรียกตัวจัดการของหน้าที่บอกผลของการกด
// ⚠️ ถือแค่ของจอ: ฉบับที่กำลังดู กับรายการ Rev ที่กางอยู่ (ไม่เก็บลงเบราว์เซอร์) — ย้ายที่วางระหว่างปัก/พับ (ส่งผล · ดึงกลับ)
//   = ชิ้นถูกสร้างใหม่ ฉบับที่เลือกกลับเป็นฉบับลูกค้า (เนื้อของส่วนเปลี่ยนทั้งก้อนในจังหวะนั้นอยู่แล้ว)
import { useId, useState } from "react";
import Link from "next/link";
import { Eye, FileText } from "lucide-react";
import thaiText from "@/components/ThaiText";
import Segmented from "@/components/ui/Segmented";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { DocumentActionGroup } from "@/components/ui/DocumentControlPanel";
import JumpButton from "./SurveyJumpButton";
import styles from "./SurveyControlCard.module.css";

/**
 * @param view               `view.document` ของ `surveyControlView` — `show: false` = ไม่วาดอะไร
 * @param busy               ปุ่มของส่วนนี้รอคำขอที่วิ่งอยู่ (การ์ด: ส่ง/ดึงกลับ/ส่งกลับ · บล็อกเดี่ยว: ออกเอกสาร)
 * @param onIssueDocument    "ออกเอกสาร" — หน้าเปิดกล่องยืนยันที่บอกผลก่อนกด (ส่วนนี้ไม่ยิงเอง)
 * @param onRecheckDocument  "ตรวจอีกครั้ง" / "โหลดใหม่" ของกล่องสถานะ — อ่านใบใหม่แล้ว **บอกผล** (ไม่ใช่การอ่านใหม่เงียบ ๆ)
 * @param documentRef        ref ของส่วนนี้ — หน้าย้ายโฟกัสมาที่นี่หลังออกเอกสารสำเร็จ (ปุ่มที่เพิ่งกดหายไปพร้อมสถานะ "ยังไม่ออก")
 *                           ⚠️ การ์ดกับบล็อกเดี่ยวไม่มีวันวาดพร้อมกัน (การ์ด = คนส่งผลได้ · บล็อก = คนที่ส่งไม่ได้) ⇒ ref มีเจ้าของเดียว
 * @param standalone         วาดนอกการ์ด (ผู้วางคิว) — กรอบของตัวเอง แทนเส้นคั่นของส่วนในการ์ด
 */
export default function SurveyDocumentSection({
  view,
  busy = false,
  onIssueDocument,
  onRecheckDocument,
  documentRef = null,
  standalone = false,
}) {
  /* ฉบับที่กำลังดู (ตั้งต้นฉบับลูกค้า) + รายการ Rev ก่อนหน้าที่กางอยู่ · ของจอล้วน ไม่เก็บลงเบราว์เซอร์ */
  const [docVersion, setDocVersion] = useState("customer");
  const [historyOpen, setHistoryOpen] = useState(false);
  const uid = useId();
  const doc = view;
  if (!doc?.show) return null;
  const docStatusId = `${uid}-doc-status`;
  const docHistoryId = `${uid}-doc-history`;

  /* ⚠️ กล่องสถานะเป็นของ **ฉบับที่เลือก** (`versions[i].status`) — ใบที่ตรึงแล้วมีไฟล์ฉบับลูกค้าแต่ยังไม่มีฉบับภายใน
     ต้องพูดคนละประโยคเมื่อสลับฉบับ · ไม่มีฉบับให้เลือก (อ่านสถานะไม่สำเร็จ · ใบที่จบแล้ว) = กล่องของทั้งส่วน */
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

  /* ที่วาง → คลาส: ในการ์ด = `.sec` (เส้นคั่นจาก `.sec + .sec` ในส่วนรอง · ปักไว้ = ปิดท้ายด้วยเส้นของ `.docPinned` เอง)
     · นอกการ์ด = กรอบของตัวเอง (`.docStandalone`) + `.card` ซึ่งเป็น **ขอบเขตของกฎทั้งการ์ด** (กล่องแจ้งทรงกะทัดรัด · ของที่กดได้ 44px
       ที่จอ ≤1050 · ปุ่มกรมท่าที่จาง) — `.card` ไม่มีกฎของตัวเอง มีแต่กฎลูก ⇒ บล็อกเดี่ยวได้หน้าตาเดียวกับส่วนในการ์ดทุก px ข้างใน */
  const placed = standalone
    ? `${styles.card} ${styles.docStandalone}`
    : `${styles.sec} ${doc.placement === "pinned" ? styles.docPinned : ""}`.trim();

  return (
    <section
      ref={documentRef}
      tabIndex={-1}
      className={placed}
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
            {/* `docStatus.link` = ลิงก์ออกจากหน้านี้ข้างปุ่มตรวจซ้ำ ("ไปบัญชีของฉัน" — คนดูเป็นผู้ลงนามที่ยังไม่มีลายเซ็น · PR-SIG) · มีลิงก์ = แถวนี้
                ใช้ช่องไฟของแถวปุ่ม (`.gapActions`) ให้สองตัวไม่ชิดกัน · ไม่มีลิงก์ = แถวเดิมทุก px */}
            {docStatus.action || docStatus.link ? (
              <span className={docStatus.link ? `${styles.noticeLine} ${styles.gapActions}` : styles.noticeLine}>
                <JumpButton target={docStatus.action} onReload={onRecheckDocument} />
                {docStatus.link ? <Link className="text-action" href={docStatus.link.href}>{docStatus.link.label}</Link> : null}
              </span>
            ) : null}
          </StatusNotice>
        </div>
      ) : null}
      {/* ข้อที่ระบบพิมพ์ลงเอกสารแต่คนกดยังไม่ได้อ่านก่อนออก (เช่น ภาพผังหลายรูปพิมพ์รูปเดียว) — บอกหลังออก ไม่ใช่เงียบ */}
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
  );
}
