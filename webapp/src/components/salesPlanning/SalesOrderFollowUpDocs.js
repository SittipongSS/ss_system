"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, FilePlus2, Files, Trash2, XCircle } from "lucide-react";
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
  DOC_DELETE_KEY, docActionDoneMessage, docConfirmPrompt, docReasonPrompt, followUpLineView,
  orphanRemoveFailureOutcome, specDocumentHref,
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
 * ⭐ **"ออกเอกสาร" พาไปหน้าออกเอกสาร ไม่ได้ออกเลขจากการ์ด** (มติเจ้าของ 23/09/2569 "การสร้างเอกสาร ยังไม่ต้องรันอะไร
 *    จนกว่าจะบันทึก เอาแบบ คำร้อง แบบใบเสนอราคา") — เดิมกดแล้วขึ้นโมดัลยืนยันแล้ว POST ทันที (เลขที่ถูกใช้ตั้งแต่
 *    ยังไม่ได้เห็นเนื้อเอกสาร) · ตอนนี้การ์ดไม่ยิง POST เองอีกเลย ⇒ หน้า `/sales-planning/spec-documents/new`
 *    เป็นที่เดียวที่เลขที่ถูกใช้ (ตอนกด "บันทึก")
 *
 * 🐞 **อนุมัติใบสั่งขายบนหน้าเดียวกันแล้วการ์ดค้างสถานะเดิมจน F5** — การ์ดโหลดครั้งเดียวตอน mount
 *    ⇒ `orderStatus` เข้า deps ของตัวโหลด: หน้า SO ส่งสถานะใบมา สถานะขยับเมื่อไรการ์ดดึงใหม่เอง
 *    + ดึงใหม่ตอนกลับมามองแท็บ (อีกคนออกเอกสาร/อนุมัติไประหว่างที่แท็บเปิดค้าง)
 *
 * ⭐ **แถว "บรรทัดถูกถอด" มีปุ่มปลายทางตัวเดียวตามที่ API ส่งมา** (มติเจ้าของ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง")
 *    — ร่างที่ยังไม่เคยยื่น = "ลบร่างเอกสารถาวร" · ใบที่เคยยื่นแล้ว = "ยกเลิกเอกสาร" (`documentExitKey`)
 *    🔴 **ตัดสินใจ: ลบจากการ์ดได้เลย ไม่ใช่คงปุ่มยกเลิกไว้ที่นี่** — แถวนี้เป็นจอเดียวที่ใบกำพร้าโผล่ (บรรทัดหายแล้ว
 *       ไม่มีแถวสินค้าให้กดเข้าไป) ถ้าการ์ดยังยึด `void` ตายตัว ร่างแบบนี้จะเหลือแถวเปล่าไม่มีปุ่ม = ทางตัน
 *       · ถ้าคงปุ่มยกเลิกไว้เฉพาะที่นี่ = ใบเดียวกันได้คนละปุ่มบนสองจอ (หน้าเอกสารบอก "ลบ" การ์ดบอก "ยกเลิก")
 *       สวนมติตรง ๆ ⇒ ใช้เส้น `DELETE` ตัวเดียวกับหน้าเอกสาร + โมดัล `docConfirmPrompt('remove', { orphan: true })`
 *       ข้อความชุดเดียวกับหน้าเอกสาร (ไม่สัญญาว่าออกใบใหม่บนบรรทัดได้ — บรรทัดไม่มีแล้ว)
 *
 * @param orderStatus สถานะของใบสั่งขายที่หน้า SO ถืออยู่ — เปลี่ยนเมื่อไร การ์ดโหลดใหม่
 * @param onChanged เรียกหลังยกเลิก/ลบเอกสารสำเร็จ (ให้หน้า SO ดึงของตัวเองถ้าต้องการ)
 */
export default function SalesOrderFollowUpDocs({ orderId, orderStatus, onChanged }) {
  const [rows, setRows] = useState([]);
  const [orphans, setOrphans] = useState([]);
  const [problem, setProblem] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [warning, setWarning] = useState("");

  /* ⚠️ คืนคำตอบชุดใหม่ด้วย (`null` = โหลดไม่ขึ้น) — ทางล้มของการลบต้องตัดสินจาก **ปุ่มของข้อมูลชุดใหม่**
     ไม่ใช่ชุดที่ค้างบนจอ (setState เป็น async · กติกาเดียวกับ `load` ของหน้าเอกสาร) */
  const load = useCallback(async (opts) => {
    try {
      const next = await apiJson(`/api/sales-planning/sales-orders/${orderId}/spec-documents`, {
        fallbackError: "อ่านสถานะเอกสารต่อเนื่องไม่สำเร็จ",
      });
      setRows(Array.isArray(next?.rows) ? next.rows : []);
      setOrphans(Array.isArray(next?.orphans) ? next.orphans : []);
      setProblem(null);
      return next;
    } catch (loadError) {
      // รอบเบื้องหลัง (กลับมามองแท็บ) ที่ล้ม = เงียบ ไม่ทับของที่ผู้ใช้กำลังอ่าน
      if (!opts?.background) {
        setProblem({ message: loadError.message || "อ่านสถานะเอกสารต่อเนื่องไม่สำเร็จ", status: loadError.status || 0 });
      }
      return null;
    } finally {
      setLoaded(true);
    }
  }, [orderId]);

  // ⚠️ `orderStatus` อยู่ใน deps โดยตั้งใจ — ดูหัวไฟล์ (สถานะใบสั่งขายขยับ = บรรทัดทุกบรรทัดเปลี่ยนคำตอบ)
  useEffect(() => { load(); }, [load, orderStatus]);
  useRevalidateOnFocus(load);

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
      notifyToast.success(`ยกเลิก ${voiding.docNoText || voiding.docNo || "เอกสาร"} แล้ว`);
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

  /* ลบร่างที่บรรทัดถูกถอด — `DELETE` เส้นเดียวกับหน้าเอกสาร (RPC ของ 0375 ตรวจซ้ำทุกข้อที่ฐาน)
     ⚠️ ห้ามเปิด `retry` — คำขอที่ไม่ได้คำตอบอาจลบไปแล้ว รอบสองได้ 404 แล้วจอบอกว่าล้มทั้งที่สำเร็จ
     ⚠️ ล้ม ⇒ ดึงการ์ดใหม่แล้วตัดสินจาก **ข้อมูลชุดใหม่** (`orphanRemoveFailureOutcome`):
        · `done`  — เน็ตหลุด/5xx แต่ใบหายจากการ์ดแล้ว = เซิร์ฟเวอร์ลบไปแล้ว คำตอบแค่หายกลางทาง ⇒ ปิดโมดัล + toast สำเร็จ
          (🐞 UAT 23/09: เคยขึ้น "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — …ลองอีกครั้ง" ทั้งที่แถวหายไปต่อหน้า)
        · `moved` — มีคนยื่นแทรก/ใบไม่มีปุ่มลบแล้ว ⇒ **ปิดโมดัล** แล้วย้ายเหตุจริงขึ้นแถบของการ์ด
          (ปล่อยโมดัลค้าง = ข้อความผลของการลบคร่อมข้อความว่าลบไม่ได้ และปุ่ม "ลบร่างนี้" ยังกดซ้ำได้ ทั้งที่แถวข้างหลัง
          กลายเป็นปุ่มยกเลิกไปแล้ว — ท่าเดียวกับ `removeDraft` ของหน้าเอกสาร)
        · `retry` — ยังลบได้/โหลดการ์ดไม่ขึ้น ⇒ โยนต่อ ให้ข้อความขึ้นในโมดัลแล้วกดใหม่ได้ */
  const removeDone = () => {
    setRemoving(null);
    notifyToast.success(docActionDoneMessage(DOC_DELETE_KEY, { orphan: true }));
  };
  const confirmRemove = async () => {
    const target = removing;
    try {
      await apiJson(`/api/sales-planning/spec-documents/${target.documentId}`, {
        method: "DELETE",
        fallbackError: "ลบร่างไม่สำเร็จ",
      });
      removeDone();
      await load({ background: true });
      onChanged?.();
    } catch (removeFailure) {
      const next = await load({ background: true });
      const outcome = orphanRemoveFailureOutcome({ failure: removeFailure, next, documentId: target.documentId });
      if (outcome === "done") {
        removeDone();
        onChanged?.();
        return;
      }
      if (outcome === "moved") {
        setRemoving(null);
        setWarning(removeFailure.message || "ลบร่างไม่สำเร็จ");
        return;
      }
      throw removeFailure;
    }
  };

  if (!loaded) return null;
  const inScope = rows.filter((row) => row?.state?.kind !== "out_of_scope");
  // ไม่มีบรรทัดในขอบเขตและไม่มีเอกสารค้าง (ใบที่ขายแต่ค่าออกแบบ/รายได้อื่น) = ไม่มีการ์ดนี้ทั้งใบ
  if (!inScope.length && !orphans.length && !problem) return null;

  const voidPrompt = voiding
    /* ⭐ ส่ง Rev ของเอกสารไปด้วย — ไม่งั้นโมดัลพูด "ยกเลิก 220969-001" ขณะที่แถว/toast พูด "220969-001-02"
       (ผลตรวจรอบสอง: เลขเดียวกันสองหน้าตาในโฟลว์เดียว) */
    ? docReasonPrompt("void", {
      document: { docNo: voiding.docNo },
      latest: voiding.revNo === null || voiding.revNo === undefined ? null : { revNo: voiding.revNo },
      orphan: true,
    })
    : null;
  // ⭐ ข้อความชุดเดียวกับโมดัลลบของหน้าเอกสาร — `orphan: true` = ไม่สัญญาว่าออกใบใหม่บนบรรทัดนี้ได้
  const removePrompt = removing
    ? docConfirmPrompt(DOC_DELETE_KEY, {
      document: { docNo: removing.docNo },
      latest: removing.revNo === null || removing.revNo === undefined ? null : { revNo: removing.revNo },
      orphan: true,
    })
    : null;

  return (
    <DetailCard
      icon={Files}
      eyebrow="FOLLOW-UP DOCS"
      title="เอกสารต่อเนื่อง"
      meta="FM-SA-04 รายละเอียดผลิตภัณฑ์ (Product Spec) — หนึ่งใบต่อหนึ่งบรรทัด ออกได้หลังใบสั่งขายอนุมัติแล้ว"
    >
      {problem ? (
        <div className={styles.notice}>
          {/* 4xx = คำตอบของระบบ (เช่นใบย้อนหลังไม่ออกใบสเปค) ไม่ใช่ความผิดพลาด ⇒ กล่องข้อมูล ไม่ใช่แถบแดง */}
          <StatusNotice tone={problem.status >= 400 && problem.status < 500 ? "info" : "error"}>{problem.message}</StatusNotice>
        </div>
      ) : null}
      {warning ? (
        <div className={styles.notice}>
          <StatusNotice tone="warning" onDismiss={() => setWarning("")}>{warning}</StatusNotice>
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
                const view = followUpLineView(row, { orderId });
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
                        /* ⭐ เลขที่รูปเดียวกับกระดาษ DDMMYY-XXX-RR (มติ 22/09) · บรรทัดรอง = **เลขที่เต็มในฐาน**
                           (FM-SA-04-DDMMYY-XXX) + Rev — บอกว่าเป็นเอกสาร FM-SA-04 และสองหลักท้ายคือ Rev
                           🐞 ผลตรวจรอบสอง: เลขรูปใหม่ไม่มีคำนำหน้า ลิงก์อัตโนมัติ (docRefs `FM`) / `/go/` รับแต่รูปเต็ม
                              ⇒ ต้องมีที่ให้คนก๊อปเลขเต็มไปวางในเธรด */
                        <>
                          <div className="mono">{view.docNoText || view.docNo}</div>
                          <div className={styles.sub}>{[view.docNo || "FM-SA-04", view.revLabel].filter(Boolean).join(" · ")}</div>
                        </>
                      ) : naText(null)}
                    </td>
                    <td>
                      <StatusBadge size="sm" tone={view.tone} label={naText(view.statusLabel)} />
                      {view.note ? <div className={styles.sub}>{view.note}</div> : null}
                    </td>
                    <td>
                      {view.action?.kind === "issue" ? (
                        /* ⚠️ ติดด่าน (เช่นใบสั่งขายถูกย้อนการอนุมัติ) = ปุ่มอยู่ แล้วบอกเหตุตอนกด ไม่พาไป
                           · ผ่านด่าน = **พาไปหน้าออกเอกสาร** (`href`) ยังไม่มีอะไรถูกบันทึก — ไม่มีโมดัล ไม่มี POST ที่นี่
                           · ปุ่มในตารางเป็นเส้นขอบทุกแถว — ทึบสงวนไว้หน้าละปุ่ม
                           ⚠️ **ยังเป็น `GatedAction` (`<button>`) ทั้งคอลัมน์ ทั้งที่ตอนนี้มันแค่นำทาง** ⇒ เสีย "เปิดในแท็บใหม่"
                              (AC เปิดหลายบรรทัดพร้อมกันไม่ได้) · แลกมาเพราะแถวในตารางเดียวกันมีทั้งที่ติดด่านและไม่ติด
                              สลับ `<a>`/`<button>` ตามสถานะของแถว = คลาส/โฟกัส/เมนูคลิกขวาไม่เท่ากันในคอลัมน์เดียว
                              (เหตุผลที่ `GatedAction` เขียนไว้เอง) · เอกสารที่ออกแล้วยังเป็น `<Link>` ตามเดิม */
                        <GatedAction
                          blocker={view.action.blocker || ""}
                          href={view.action.href || ""}
                          tone="primary"
                          variant="outline"
                          size="sm"
                          icon={<FilePlus2 size={13} />}
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
          ทางออกคือปุ่มปลายทางของใบ (มติ 21/09: "โผล่ในการ์ดหน้า SO เป็นแถวบรรทัดถูกถอด พร้อมปุ่มยกเลิก")
          · มติ 23/09 "ซ่อนปุ่มยกเลิกช่วงร่าง": ร่างที่ไม่เคยยื่น = ปุ่มลบร่างแทน (ดูหัวไฟล์) — API ส่งมาทีละตัว */}
      {orphans.length ? (
        <div className={styles.orphans}>
          <p className={styles.orphanTitle}>เอกสารที่บรรทัดถูกถอดจากใบสั่งขายแล้ว ({orphans.length})</p>
          <ul className={styles.orphanList}>
            {orphans.map((orphan) => (
              <li key={orphan.documentId} className={styles.orphanRow}>
                <div className={styles.orphanCopy}>
                  <Link className="mono" href={specDocumentHref(orphan.documentId)}>{naText(orphan.docNoText || orphan.docNo)}</Link>
                  <span className={styles.sub}>{[orphan.docNo, orphan.revLabel, orphan.statusLabel].filter(Boolean).join(" · ") || naText(null)}</span>
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
                {orphan.removeAction?.visible ? (
                  <GatedAction
                    blocker={orphan.removeAction.reason || ""}
                    tone="danger"
                    variant="outline"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => { setWarning(""); setRemoving(orphan); }}
                  >
                    ลบร่างเอกสารถาวร
                  </GatedAction>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={`form-note ${styles.footNote}`}>
        AC ออกเอกสาร (ตรวจเนื้อแล้วกดบันทึกจึงได้เลขที่) → ยื่นที่หน้าเอกสาร → AE เจ้าของดีลอนุมัติ → AE Supervisor อนุมัติขั้นสุดท้าย ·
        ขึ้นเฉพาะบรรทัดหมวด 01 และ 02 · FM-SA-07 (รายงานติดตามคำสั่งซื้อ) จะมาในรอบถัดไป
      </p>

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

      <ConfirmDialog
        open={Boolean(removePrompt)}
        title={removePrompt?.title}
        description={removePrompt?.description}
        detail={removePrompt?.detail}
        confirmLabel={removePrompt?.confirmLabel}
        tone={removePrompt?.tone || "danger"}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </DetailCard>
  );
}
