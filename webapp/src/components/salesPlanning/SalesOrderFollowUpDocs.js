"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FilePlus2, Files, XCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import GatedAction from "@/components/ui/GatedAction";
import ReasonDialog from "@/components/ui/ReasonDialog";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { naText } from "@/lib/format";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { docReasonError } from "@/lib/sales/productSpecDocWorkflow";
import {
  docReasonPrompt, followUpLineView, lineIssuePrompt, specDocumentHref,
} from "@/lib/sales/productSpecDocView";
import styles from "./SalesOrderFollowUpDocs.module.css";

/**
 * การ์ด "เอกสารต่อเนื่อง" บนหน้าใบสั่งขาย — FM-SA-04 หนึ่งใบต่อหนึ่งบรรทัด SO (mig 0370)
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md): AC ออกเอกสารได้หลังใบสั่งขาย
 *    **อนุมัติแล้ว** · เส้นอนุมัติ AC ยื่น → AE เจ้าของดีล → AE Supervisor (ขั้นสุดท้าย) ที่หน้าเอกสาร
 *    ⇒ การ์ดนี้ตอบแค่ "บรรทัดไหนต้องทำอะไรต่อ" แล้วพาไปหน้าเอกสาร
 *
 * ⚠️ **สถานะทุกบรรทัดมาจาก API** (`lineDocumentState` ที่คิดด้วยผู้ใช้จริง) — จอห้ามคิดเอง
 * ⚠️ **บรรทัดที่ยังออกไม่ได้ก็ขึ้น** พร้อมปุ่มที่บอกเหตุตอนกด (ui-visibility-rule) · ไม่มีสิทธิ์ออก
 *    = ไม่มีปุ่ม บอกแค่ว่าใครเป็นคนออก
 *
 * 🐞 **อนุมัติใบสั่งขายบนหน้าเดียวกันแล้วการ์ดค้างสถานะเดิมจน F5** — การ์ดโหลดครั้งเดียวตอน mount
 *    ⇒ `orderStatus` เข้า deps ของตัวโหลด: หน้า SO ส่งสถานะใบมา สถานะขยับเมื่อไรการ์ดดึงใหม่เอง
 *    + ดึงใหม่ตอนกลับมามองแท็บ (อีกคนออกเอกสาร/อนุมัติไประหว่างที่แท็บเปิดค้าง)
 *
 * @param orderStatus สถานะของใบสั่งขายที่หน้า SO ถืออยู่ — เปลี่ยนเมื่อไร การ์ดโหลดใหม่
 * @param onChanged เรียกหลังออก/ยกเลิกเอกสารสำเร็จ (ให้หน้า SO ดึงของตัวเองถ้าต้องการ)
 */
export default function SalesOrderFollowUpDocs({ orderId, orderStatus, onChanged }) {
  const [rows, setRows] = useState([]);
  const [orphans, setOrphans] = useState([]);
  const [problem, setProblem] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [issuing, setIssuing] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  const load = useCallback(async (opts) => {
    try {
      const next = await apiJson(`/api/sales-planning/sales-orders/${orderId}/spec-documents`, {
        fallbackError: "อ่านสถานะเอกสารต่อเนื่องไม่สำเร็จ",
      });
      setRows(Array.isArray(next?.rows) ? next.rows : []);
      setOrphans(Array.isArray(next?.orphans) ? next.orphans : []);
      setProblem(null);
    } catch (loadError) {
      // รอบเบื้องหลัง (กลับมามองแท็บ) ที่ล้ม = เงียบ ไม่ทับของที่ผู้ใช้กำลังอ่าน
      if (!opts?.background) {
        setProblem({ message: loadError.message || "อ่านสถานะเอกสารต่อเนื่องไม่สำเร็จ", status: loadError.status || 0 });
      }
    } finally {
      setLoaded(true);
    }
  }, [orderId]);

  // ⚠️ `orderStatus` อยู่ใน deps โดยตั้งใจ — ดูหัวไฟล์ (สถานะใบสั่งขายขยับ = บรรทัดทุกบรรทัดเปลี่ยนคำตอบ)
  useEffect(() => { load(); }, [load, orderStatus]);
  useRevalidateOnFocus(load);

  /* ออกเอกสาร — POST กินเลขจากตัวนับ ⇒ **ไม่ลองซ้ำเอง** (apiFetch ไม่ retry POST อยู่แล้ว)
     ⚠️ ล้ม = โยนให้กล่องยืนยันโชว์ข้อความในกล่อง (แถบของการ์ดอยู่ใต้โมดัล) และดึงสถานะใหม่
        เพราะคำตอบ 4xx แปลว่าจอไม่ตรงกับของจริง (เช่นอีกแท็บออกไปก่อนแล้ว) */
  const issue = async () => {
    const lineId = issuing?.line?.id;
    try {
      const result = await apiJson(`/api/sales-planning/sales-orders/${orderId}/spec-documents`, {
        method: "POST",
        json: { salesOrderLineId: lineId },
        fallbackError: "ออกเอกสารไม่สำเร็จ",
      });
      setIssuing(null);
      const docNo = result?.document?.docNo;
      notifyToast.success(docNo ? `ออกเอกสาร ${docNo} แล้ว — ยื่นอนุมัติได้ที่หน้าเอกสาร` : "ออกเอกสารแล้ว");
      await load({ background: true });
      onChanged?.();
    } catch (issueError) {
      load({ background: true });
      throw issueError;
    }
  };

  const openVoid = (orphan) => {
    setVoiding(orphan);
    setVoidReason("");
    setVoidError("");
  };

  const confirmVoid = async () => {
    const invalid = docReasonError(voidReason, { label: "เหตุผลที่ยกเลิก" });
    if (invalid) { setVoidError(invalid); return; }
    setVoidBusy(true);
    setVoidError("");
    try {
      await apiJson(`/api/sales-planning/spec-documents/${voiding.documentId}`, {
        method: "PATCH",
        json: { action: "void", reason: voidReason.trim() },
        fallbackError: "ยกเลิกเอกสารไม่สำเร็จ",
      });
      setVoiding(null);
      notifyToast.success(`ยกเลิก ${voiding.docNo || "เอกสาร"} แล้ว`);
      await load({ background: true });
      onChanged?.();
    } catch (voidFailure) {
      // ข้อความอยู่ในโมดัล ไม่ใช่แถบใต้โมดัล (บทเรียน ReasonDialog 2026-08-19)
      setVoidError(voidFailure.message || "ยกเลิกเอกสารไม่สำเร็จ");
      load({ background: true });
    } finally {
      setVoidBusy(false);
    }
  };

  if (!loaded) return null;
  const inScope = rows.filter((row) => row?.state?.kind !== "out_of_scope");
  // ไม่มีบรรทัดในขอบเขตและไม่มีเอกสารค้าง (ใบที่ขายแต่ค่าออกแบบ/รายได้อื่น) = ไม่มีการ์ดนี้ทั้งใบ
  if (!inScope.length && !orphans.length && !problem) return null;

  const issuePrompt = issuing ? lineIssuePrompt({ line: issuing.line }) : null;
  const voidPrompt = voiding
    ? docReasonPrompt("void", { document: { docNo: voiding.docNo }, orphan: true })
    : null;

  return (
    <DetailCard
      icon={Files}
      eyebrow="FOLLOW-UP DOCS"
      title="เอกสารต่อเนื่อง"
      meta="FM-SA-04 ใบสเปคสินค้า — หนึ่งใบต่อหนึ่งบรรทัด ออกได้หลังใบสั่งขายอนุมัติแล้ว"
    >
      {problem ? (
        <div className={styles.notice}>
          {/* 4xx = คำตอบของระบบ (เช่นใบย้อนหลังไม่ออกใบสเปค) ไม่ใช่ความผิดพลาด ⇒ กล่องข้อมูล ไม่ใช่แถบแดง */}
          <StatusNotice tone={problem.status >= 400 && problem.status < 500 ? "info" : "error"}>{problem.message}</StatusNotice>
        </div>
      ) : null}

      {rows.length ? (
        <TableScroll family="list" surface="embedded">
          <table>
            <thead>
              <tr>
                <th>สินค้า</th>
                <th className={`num ${styles.colQty}`}>จำนวน</th>
                <th className={styles.colDoc}>เอกสาร</th>
                <th className={styles.colStatus}>สถานะ</th>
                <th className={styles.colAction} aria-label="การกระทำ" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const view = followUpLineView(row);
                const line = row.line || {};
                return (
                  <tr key={line.id} className={view.kind === "out_of_scope" ? styles.muted : undefined}>
                    <td>
                      <div className={`mono ${styles.lineCode}`}>{naText(line.fgCode)}</div>
                      <div className={styles.lineName}>{naText(line.description)}</div>
                    </td>
                    <td className="num">
                      {line.qty === null || line.qty === undefined ? naText(null) : `${line.qty}${line.unit ? ` ${line.unit}` : ""}`}
                    </td>
                    <td>
                      {view.docNo ? (
                        <>
                          <div className="mono">{view.docNo}</div>
                          <div className={styles.sub}>{naText(view.revLabel)}</div>
                        </>
                      ) : naText(null)}
                    </td>
                    <td>
                      <StatusBadge size="sm" tone={view.tone} label={naText(view.statusLabel)} />
                      {view.note ? <div className={styles.sub}>{view.note}</div> : null}
                    </td>
                    <td>
                      {view.action?.kind === "issue" ? (
                        /* ⚠️ ติดด่าน (เช่นใบสั่งขายถูกย้อนการอนุมัติ) = ปุ่มอยู่ แล้วบอกเหตุตอนกด
                           · ปุ่มในตารางเป็นเส้นขอบทุกแถว — ทึบสงวนไว้หน้าละปุ่ม */
                        <GatedAction
                          blocker={view.action.blocker || ""}
                          tone="primary"
                          variant="outline"
                          size="sm"
                          icon={<FilePlus2 size={13} />}
                          onClick={() => setIssuing(row)}
                        >
                          {view.action.label}
                        </GatedAction>
                      ) : view.action?.href ? (
                        <Button as={Link} href={view.action.href} tone="primary" variant="outline" size="sm"
                          icon={<ExternalLink size={13} />}>
                          {view.action.label}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      ) : null}

      {/* ⭐ เอกสารที่บรรทัด SO ถูกถอด (salesOrderLineId = NULL) — ไม่มีสินค้าให้รับรองต่อแล้ว
          ทางออกเดียวคือยกเลิกเอกสาร (มติ: "โผล่ในการ์ดหน้า SO เป็นแถวบรรทัดถูกถอด พร้อมปุ่มยกเลิก") */}
      {orphans.length ? (
        <div className={styles.orphans}>
          <p className={styles.orphanTitle}>เอกสารที่บรรทัดถูกถอดจากใบสั่งขายแล้ว ({orphans.length})</p>
          <ul className={styles.orphanList}>
            {orphans.map((orphan) => (
              <li key={orphan.documentId} className={styles.orphanRow}>
                <div className={styles.orphanCopy}>
                  <Link className="mono" href={specDocumentHref(orphan.documentId)}>{naText(orphan.docNo)}</Link>
                  <span className={styles.sub}>{[orphan.revLabel, orphan.statusLabel].filter(Boolean).join(" · ") || naText(null)}</span>
                </div>
                {orphan.voidAction?.visible ? (
                  <GatedAction
                    blocker={orphan.voidAction.reason || ""}
                    tone="danger"
                    variant="outline"
                    size="sm"
                    icon={<XCircle size={13} />}
                    onClick={() => openVoid(orphan)}
                  >
                    ยกเลิกเอกสาร
                  </GatedAction>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={`form-note ${styles.footNote}`}>
        AC ออกเอกสาร → ยื่นที่หน้าเอกสาร → AE เจ้าของดีลอนุมัติ → AE Supervisor อนุมัติขั้นสุดท้าย ·
        ขึ้นเฉพาะบรรทัดหมวด 01 และ 02 · FM-SA-07 (รายงานติดตามคำสั่งซื้อ) จะมาในรอบถัดไป
      </p>

      <ConfirmDialog
        open={Boolean(issuing)}
        title={issuePrompt?.title}
        description={issuePrompt?.description}
        detail={issuePrompt?.detail}
        confirmLabel={issuePrompt?.confirmLabel}
        onConfirm={issue}
        onClose={() => setIssuing(null)}
      />

      <ReasonDialog
        open={Boolean(voiding)}
        title={voidPrompt?.title}
        description={voidPrompt?.description}
        detail={voidPrompt?.detail}
        label={voidPrompt?.label}
        placeholder={voidPrompt?.placeholder}
        confirmLabel={voidPrompt?.confirmLabel}
        tone={voidPrompt?.tone}
        minLength={voidPrompt?.minLength}
        maxLength={voidPrompt?.maxLength}
        value={voidReason}
        onChange={(value) => { setVoidReason(value); setVoidError(""); }}
        submitError={voidError}
        busy={voidBusy}
        onConfirm={confirmVoid}
        onClose={() => { if (!voidBusy) setVoiding(null); }}
      />
    </DetailCard>
  );
}
