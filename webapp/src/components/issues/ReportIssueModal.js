"use client";

// ── โมดัลแจ้งปัญหาระบบ (mig 0223) ────────────────────────────────────────
//
// ⭐ **บังคับกรอกช่องเดียว** คือรายละเอียด — ยิ่งช่องเยอะ คนยิ่งไม่แจ้ง (มติ Q13)
// หัวข้อว่างได้ ระบบตัดจากบรรทัดแรกให้เอง (server ทำ ไม่ใช่ที่นี่ — กติกาเดียวกัน
// สำหรับทุกทางที่เปิดเรื่อง รวมทางที่ยังไม่มีในวันนี้)
//
// ⚠️ **โมดัลตัวนี้คือทางเดียวที่เปิดเรื่องได้** — ทั้งเมนูผู้ใช้ ปุ่มในหน้า /support
// และปุ่ม "แจ้งปัญหานี้" บนหน้าที่พัง (ก้อน 3) เรียกตัวเดียวกันหมด ห้ามเขียนฟอร์ม
// แจ้งเรื่องชุดที่สอง (กฎของ repo: สร้าง/แก้ ใช้ component เดียว)
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import PendingFiles from "@/components/ui/PendingFiles";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Segmented from "@/components/ui/Segmented";
import StatusBadge from "@/components/ui/StatusBadge";
import { notifyToast } from "@/lib/feedback";
import { shortUserAgent } from "@/lib/issues/userAgent";
import { describeResponseError } from "@/lib/fetchError";
import { uploadFileForEntity } from "@/lib/master/uploadFile";
import {
  ISSUE_IMPACTS, ISSUE_IMPACT_LABELS, ISSUE_KINDS, ISSUE_KIND_LABELS,
  ISSUE_STATUS_LABELS, ISSUE_STATUS_TONES,
} from "@/lib/issues/statuses";
import styles from "./ReportIssueModal.module.css";

const KIND_OPTIONS = ISSUE_KINDS.map((value) => ({ value, label: ISSUE_KIND_LABELS[value] }));
const IMPACT_OPTIONS = ISSUE_IMPACTS.map((value) => ({ value, label: ISSUE_IMPACT_LABELS[value] }));

const MAX_FILES = 4;

export default function ReportIssueModal({ open, onClose, onCreated, errorStack = null }) {
  const [kind, setKind] = useState("bug");
  const [impact, setImpact] = useState("workaround");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [context, setContext] = useState(null);
  const [related, setRelated] = useState([]);
  const detailRef = useRef(null);

  // เก็บบริบทตอน "เปิดโมดัล" ไม่ใช่ตอนกดส่ง — ผู้ใช้อาจเปิดโมดัลค้างไว้แล้วเปลี่ยน
  // หน้าในแท็บอื่น · และไม่เก็บ console log / ไม่จับภาพหน้าจออัตโนมัติ (มติ Q6)
  useEffect(() => {
    if (!open) return;
    setContext({
      pageUrl: `${window.location.pathname}${window.location.search}`,
      userAgent: navigator.userAgent,
    });
  }, [open]);

  // เรื่องที่คนอื่นแจ้งจากหน้าเดียวกัน — โชว์แค่ **หัวข้อกับสถานะ** ไม่มีรายละเอียด
  // ไม่มีไฟล์แนบ (มติ Q12: ผู้ใช้ทั่วไปเห็นเรื่องของคนอื่นไม่ได้ ที่ยอมให้เห็นคือ
  // "มีคนแจ้งไปแล้ว" ซึ่งกันงานซ้ำโดยไม่เปิดเนื้อในของใคร)
  useEffect(() => {
    if (!open || !context?.pageUrl) return;
    let alive = true;
    fetch(`/api/issues?pageUrl=${encodeURIComponent(context.pageUrl)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (alive) setRelated(d.items || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, context?.pageUrl]);

  const reset = () => {
    setKind("bug"); setImpact("workaround"); setTitle(""); setDetail("");
    setFiles([]); setErr(""); setRelated([]);
  };

  const close = () => { if (!busy) { reset(); onClose?.(); } };

  const submit = async () => {
    if (!detail.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, impact, title, detail, errorStack, ...context }),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "ส่งเรื่องไม่สำเร็จ"));
      const issue = await res.json();

      // ⚠️ **ไฟล์แนบพลาดต้องไม่ล้มเรื่อง** — เรื่องถูกบันทึกแล้ว คนที่กำลังแจ้งบั๊ก
      // อยู่ต้องไม่เจอบั๊กซ้อนบั๊ก · แจ้งให้ไปแนบซ้ำในหน้ารายละเอียดแทน (มติ Q17)
      if (files.length) {
        try {
          await attachToThread(issue.id, files);
        } catch (e) {
          notifyToast.warning(`ส่งเรื่อง ${issue.code} แล้ว แต่แนบไฟล์ไม่สำเร็จ — เปิดเรื่องแล้วแนบซ้ำได้: ${e.message}`);
          reset(); onClose?.(); onCreated?.(issue);
          return;
        }
      }

      notifyToast.success(`ส่งเรื่องแล้ว · ${issue.code}`);
      reset(); onClose?.(); onCreated?.(issue);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="แจ้งปัญหาระบบ" size="md" initialFocusRef={detailRef}>
      <div className={styles.body}>
        <div className={styles.field}>
          <span className={styles.label}>ประเภท</span>
          <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} ariaLabel="ประเภทเรื่อง" />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>กระทบงานยังไง</span>
          <Segmented options={IMPACT_OPTIONS} value={impact} onChange={setImpact} ariaLabel="ผลกระทบต่อการทำงาน" />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="issue-title">
            หัวข้อ <span className={styles.optional}>— ไม่บังคับ</span>
          </label>
          <Input
            id="issue-title" value={title} maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ว่างไว้ได้ ระบบจะตัดจากบรรทัดแรกของรายละเอียด"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="issue-detail">รายละเอียด</label>
          <Textarea
            id="issue-detail" ref={detailRef} value={detail} rows={5} maxLength={5000}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="เกิดอะไรขึ้น · กดอะไรถึงเจอ · คาดว่าควรได้อะไร"
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>ไฟล์แนบ <span className={styles.optional}>— ไม่บังคับ</span></span>
          {/* ⭐ ตะกร้าไฟล์กลาง (`ui/PendingFiles`) — เดิมที่นี่วาดปุ่ม+รายการเอง ซึ่งเป็น
              ฟอร์มที่สามในระบบที่วาดของเดียวกันคนละทรง · ได้ลากมาวาง/Ctrl+V ติดมาด้วย
              (ผู้ใช้ขอเองใน IS-26080013 — และจอนี้คือจอที่เขาใช้ขอ) */}
          <PendingFiles
            files={files} onChange={setFiles} disabled={busy}
            max={MAX_FILES} onOversize={setErr} label="เลือกไฟล์"
          />
          <p className={styles.hint}>
            ไฟล์จะเก็บบน Google Drive ของบริษัท — ปิดข้อมูลลูกค้าที่ไม่เกี่ยวก่อนแนบ
          </p>
        </div>

        {/* บอกให้รู้ว่าเก็บอะไรไปด้วย — ไม่ซ่อน (มติ Q6/Q13) */}
        {context && (
          <div className={styles.context}>
            <b>ระบบจะแนบข้อมูลนี้ไปด้วยอัตโนมัติ</b>
            <dl>
              <dt>หน้า</dt><dd>{context.pageUrl}</dd>
              <dt>เบราว์เซอร์</dt><dd title={context.userAgent}>{shortUserAgent(context.userAgent)}</dd>
              {errorStack && <><dt>ข้อผิดพลาด</dt><dd>แนบรายละเอียดทางเทคนิคของหน้าที่พังไปด้วย</dd></>}
            </dl>
          </div>
        )}

        {!!related.length && (
          <div className={styles.related}>
            <b>มีคนแจ้งจากหน้านี้ไปแล้ว {related.length} เรื่อง</b>
            <ul>
              {related.map((item) => (
                <li key={item.id}>
                  <StatusBadge size="sm" dot tone={ISSUE_STATUS_TONES[item.status]} label={ISSUE_STATUS_LABELS[item.status]} />
                  <span>{item.title || item.code}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {err && <p className={styles.error} role="alert">{err}</p>}
      </div>

      <div className={styles.footer}>
        <span className={styles.footNote}>กรอกแค่รายละเอียดก็ส่งได้</span>
        <Button variant="quiet" onClick={close} disabled={busy}>ยกเลิก</Button>
        <Button tone="accent" onClick={submit} disabled={busy || !detail.trim()}>
          {busy ? "กำลังส่ง…" : "ส่งเรื่อง"}
        </Button>
      </div>
    </Modal>
  );
}

// ── แนบไฟล์ผ่าน "เธรด" ไม่ใช่ตาราง attachments ──────────────────────────
// ⚠️ ตั้งใจใช้เส้น `/api/updates` เพราะด่านหยาบของ `/api/attachments` ใน proxy
// ไล่ตาม cap ของ role ซึ่ง `viewer` ไม่มีสักตัว — แต่ viewer ต้องแนบภาพหน้าจอได้
// (มติ Q2) · เส้นเธรดได้สิทธิ์ที่ถูกต้องพอดีจาก `UPDATE_ENTITIES.system_issue`
// และผลพลอยได้คือไฟล์ไปอยู่ในบทสนทนาที่คนคุยกันจริง ไม่ใช่แผงเอกสารแยกต่างหาก
async function attachToThread(issueId, files) {
  const attachments = [];
  for (const file of files) {
    // ไบต์ขึ้น Drive ตรงจากเบราว์เซอร์ (ไม่ผ่าน function = ไม่ติดเพดาน 4.5 MB)
    const payload = await uploadFileForEntity({
      file, entityType: "system_issue", entityId: issueId,
    });
    attachments.push({
      fileUrl: payload.url,
      driveFileId: payload.driveFileId || null,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  }
  const res = await fetch("/api/updates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: "system_issue", entityId: issueId,
      kind: "comment", body: "แนบไฟล์ประกอบการแจ้ง", attachments,
    }),
  });
  if (!res.ok) throw new Error(await describeResponseError(res, "บันทึกไฟล์แนบไม่สำเร็จ"));
}
