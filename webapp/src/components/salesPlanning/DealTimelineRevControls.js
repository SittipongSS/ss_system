"use client";
import { useState } from "react";
import { GitCommit, History, Printer, RotateCcw } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import ReadableText from "@/components/ui/ReadableText";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import { apiJson } from "@/lib/apiFetch";
import { fmtDateTime, naText } from "@/lib/format";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { dealTimelineDocument } from "@/lib/sales/dealTimelineDocument";
import { nextTimelineRev, restoreSummaryText, timelineRevBadge } from "@/lib/sales/dealTimelineRevisions";
import styles from "./DealTimelineRevControls.module.css";

/* ── Rev. ไทม์ไลน์ของดีล — ป้าย · ออก Rev. · ประวัติ (พิมพ์ฉบับเก่า/ย้อนกลับ) ──────────────────────────────
 *
 * งวด P2b ยุบดีล/โครงการ (มติเจ้าของ 13/11/2026): Rev. ต้องเก็บ (ส่งลูกค้าแล้วต้องปรับได้) และเดินบนดีล ·
 * เลขที่เอกสาร = รหัสดีล + Rev. · ยกมาจากหน้าโครงการ (ออก Rev. / ประวัติ / ย้อน / พิมพ์ฉบับเก่า) ทุกพฤติกรรม
 * ⚠️ กันออก/ย้อน Rev. ตอนตารางยังมีแก้ค้าง (dirtyCount จาก TimelineWorkspace.onDirtyChange) — Rev. คือ snapshot ของ
 *    ขั้นตอนในฐาน ออกตอนมีแก้ค้างจะได้เวอร์ชันที่ไม่ตรงกับที่คนเห็นบนจอ (บทเรียนหน้าโครงการ · timelineUiContract)
 */
export default function DealTimelineRevControls({ deal, timelineRevision, canEdit = false, dirtyCount = 0, onChanged }) {
  const [issueOpen, setIssueOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState(null);
  const [historyError, setHistoryError] = useState("");

  if (!deal?.id) return null;
  const base = `/api/sales-planning/deals/${encodeURIComponent(deal.id)}/timeline`;
  const badge = timelineRevBadge(deal);
  const nextRev = nextTimelineRev(timelineRevision?.maxRev);

  const blockedByDrafts = () => {
    if (dirtyCount <= 0) return false;
    notifyToast.error(`มีการแก้ไขไทม์ไลน์ค้างอยู่ ${dirtyCount} ขั้นตอน — กด "บันทึกการเปลี่ยนแปลง" ก่อน`);
    return true;
  };

  const openIssue = () => {
    if (blockedByDrafts()) return;
    setNote("");
    setIssueError("");
    setIssueOpen(true);
  };
  const confirmIssue = async () => {
    setBusy(true);
    setIssueError("");
    try {
      const rev = await apiJson(`${base}/revisions`, { method: "POST", json: { note }, fallbackError: "ออก Rev. ไม่สำเร็จ" });
      setIssueOpen(false);
      setRevisions(null);
      notifyToast.success(`ออกเวอร์ชันแล้ว — Rev. ${rev.currentRev}`);
      await onChanged?.();
    } catch (error) {
      setIssueError(error.message || "ออก Rev. ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const loadRevisions = async () => {
    setHistoryError("");
    try {
      const data = await apiJson(`${base}/revisions`, { fallbackError: "โหลดประวัติเวอร์ชันไม่สำเร็จ" });
      setRevisions(data.revisions || []);
    } catch (error) {
      setHistoryError(error.message || "โหลดประวัติเวอร์ชันไม่สำเร็จ");
    }
  };
  const openHistory = async () => {
    setHistoryOpen(true);
    await loadRevisions();
  };

  // พิมพ์ฉบับเก่า: ประกอบจาก snapshot ของ Rev. นั้นทั้งก้อน (ดีล · ขั้นตอน · มาตรฐานฟอร์ม) — ไม่อ่านค่าสดของดีล
  const printRevision = async (revNo) => {
    try {
      const row = await apiJson(`${base}/revisions/${revNo}`, { fallbackError: "ดึงเวอร์ชันไม่สำเร็จ" });
      const snapshot = row?.snapshot || {};
      openGanttPrintWindow(dealTimelineDocument(
        snapshot.deal || deal,
        { projectTasks: snapshot.tasks || [], project: snapshot.project || null },
        { rev: row.revNo, revDate: row.createdAt || null, standard: snapshot.standard || null },
      ));
    } catch (error) {
      notifyToast.error(error.message || "ดึงเวอร์ชันไม่สำเร็จ");
    }
  };

  const restoreRevision = async (revNo) => {
    if (blockedByDrafts()) return;
    if (!(await confirmAction({
      title: `ย้อนกลับไป Rev. ${revNo}?`,
      description: `ขั้นตอนทั้งชุดของดีลนี้จะกลับไปเท่ากับ Rev. ${revNo} (สร้าง/ลบ/แก้ขั้นตอนให้ตรง)`,
      detail: "Rev. อื่นยังอยู่ครบ ย้อนไปมาได้อีก · ขั้นตอนของดีลอื่นในโครงการเดียวกันไม่ถูกแตะ",
      confirmLabel: `ย้อนไป Rev. ${revNo}`,
    }))) return;
    try {
      const result = await apiJson(`${base}/restore`, { method: "POST", json: { revNo }, fallbackError: "ย้อนเวอร์ชันไม่สำเร็จ" });
      setHistoryOpen(false);
      setRevisions(null);
      await onChanged?.();
      notifyToast.success(restoreSummaryText(result, revNo));
    } catch (error) {
      notifyToast.error(error.message || "ย้อนเวอร์ชันไม่สำเร็จ");
    }
  };

  return (
    <>
      <span className={`ui-badge ${badge.stale ? styles.stale : ""}`} title={badge.title}>{badge.label}</span>
      {canEdit && (
        <Button size="sm" onClick={openIssue} disabled={busy} icon={<GitCommit size={14} aria-hidden="true" />}
          title={`freeze ไทม์ไลน์ของดีลนี้เป็นเวอร์ชันใหม่ — เลขรันอัตโนมัติเป็น Rev. ${nextRev} (ขึ้นบนเลขที่เอกสาร)`}>
          {busy ? "กำลังออก…" : `ออก Rev. ${nextRev}`}
        </Button>
      )}
      <Button size="sm" onClick={openHistory} icon={<History size={14} aria-hidden="true" />} title="ดู/พิมพ์/ย้อนเวอร์ชันที่เคยออก">
        ประวัติเวอร์ชัน
      </Button>

      <Modal
        open={issueOpen}
        onClose={() => !busy && setIssueOpen(false)}
        title="ออก Rev. ไทม์ไลน์ใหม่"
        size="sm"
        footer={(
          <>
            <Button disabled={busy} onClick={() => setIssueOpen(false)}>ยกเลิก</Button>
            <Button tone="primary" disabled={busy} onClick={confirmIssue} icon={<GitCommit size={14} aria-hidden="true" />}>
              {busy ? "กำลังออก…" : `ออก Rev. ${nextRev}`}
            </Button>
          </>
        )}
      >
        <div className={styles.body}>
          <p className={styles.lead}>
            จะ freeze ขั้นตอนทั้งชุดของดีลนี้ และรันเลขเป็น <span className="ui-badge">Rev. {nextRev}</span> ·
            เลขที่เอกสารบนกระดาษจะเป็น {naText(deal.code)}-{nextRev}
          </p>
          <label className={styles.field}>
            หมายเหตุการแก้ (ไม่บังคับ)
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="เช่น ปรับวันส่งมอบตาม PO ใหม่" />
          </label>
          {issueError && <StatusNotice tone="error">{issueError}</StatusNotice>}
        </div>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="ประวัติเวอร์ชัน (Rev.)" size="md">
        <div className={styles.body}>
          <p className={styles.lead}>Rev. = เวอร์ชันทางการ (เก็บถาวร) — พิมพ์ซ้ำได้ และย้อนขั้นตอนกลับไปได้</p>
          {historyError && <StatusNotice tone="error">{historyError}</StatusNotice>}
          {revisions == null && !historyError ? (
            <p className={styles.lead}>กำลังโหลด…</p>
          ) : (revisions || []).length === 0 ? (
            <EmptyState plain>ยังไม่มีเวอร์ชัน — กด “ออก Rev.” เพื่อสร้างจุดย้อนแรก</EmptyState>
          ) : (
            <ol className={styles.list}>
              {revisions.map((row) => (
                <li key={row.id} className={styles.row}>
                  <span className={`ui-badge ${row.revNo === deal.timelineRev ? styles.current : ""}`}>Rev. {row.revNo}</span>
                  <div className={styles.meta}>
                    <span>{row.createdAt ? fmtDateTime(row.createdAt) : naText(null)} · {naText(row.createdByName)}</span>
                    {row.note && <ReadableText text={row.note} lines={4} className={styles.note} />}
                  </div>
                  {canEdit && (
                    <Button size="sm" onClick={() => restoreRevision(row.revNo)} icon={<RotateCcw size={13} aria-hidden="true" />} title="ย้อนขั้นตอนทั้งชุดกลับไปเท่ากับ Rev. นี้">
                      ย้อนกลับ
                    </Button>
                  )}
                  <Button size="sm" onClick={() => printRevision(row.revNo)} icon={<Printer size={13} aria-hidden="true" />} title="เปิดเอกสารเวอร์ชันนี้เพื่อพิมพ์/บันทึก PDF">
                    พิมพ์
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Modal>
    </>
  );
}
