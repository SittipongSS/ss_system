"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderKanban } from "lucide-react";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { quotationWonEffects, selectableProjectsForWon } from "@/lib/sales/quotationWonPrompt";
import { describeResponseError } from "@/lib/fetchError";
import styles from "./QuotationWonDialog.module.css";

// โมดัลยืนยันปิด Won (มติผู้ใช้ 2026-08-24)
//
// ⭐ **ไม่มีฟอร์มหลักฐานแล้ว** — สลิป / PO / เอกสารยืนยันการสั่งซื้อ ย้ายไปกรอกที่
// หน้าสร้างใบสั่งขาย (mig 0285) ซึ่งเป็นที่ที่มันถูกใช้จริง · สิ่งที่โมดัลนี้ทำคือ
// บอกผลลัพธ์ให้ครบก่อนกด (กติกาเดียวกับ `approvalPrompt`)
//
// ⭐ **คำถามเดียวที่เหลืออยู่คือโครงการ** — ตั้งแต่ #1385 ด่าน "ต้องมีโครงการ" เหลือ
// ที่เดียวคือตอนปิด Won ⇒ ดีลลอยต้องปลดด่านได้จากตรงนี้เลย ไม่ใช่ถูกตีกลับให้ไปทำ
// ที่หน้าดีลแล้วเดินกลับมา · ผูกโครงการกับปิด Won ไปด้วยกันในคำขอเดียว (accept รับ
// projectId) ไม่ใช่สองคำขอเรียงกัน — ครั้งที่สองล้ม = ดีลผูกโครงการโดยยังไม่ Won
export default function QuotationWonDialog({ open, onClose, quote, deal: dealProp, project: projectProp = null, customerId, customerName, onDone }) {
  const deal = dealProp || quote?.deal || null;
  // โครงการที่ผูกอยู่: บางหน้าโหลดมากับดีล บางหน้ามีเป็นทะเบียนแยก ⇒ รับได้ทั้งสองทาง
  const linkedProject = deal?.project || projectProp || null;
  const needsProject = !!deal && !deal.projectId;

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dealCustomerId = customerId || quote?.customerId || deal?.customerId || null;

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/pm/projects");
      const rows = res.ok ? await res.json() : [];
      const usable = selectableProjectsForWon(rows, { customerId: dealCustomerId, line: deal?.line || null });
      setProjects(usable);
      // มีให้เลือกใบเดียว = เลือกให้เลย (ไม่ใช่ค่าตั้งต้นของการตัดสินใจ — มันคือ
      // ตัวเลือกทั้งหมดที่มี · กฎ "ห้าม default ให้การตัดสินใจ" พูดถึงชุดที่มีหลายทาง)
      if (usable.length === 1) setProjectId(usable[0].id);
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [dealCustomerId, deal?.line]);

  useEffect(() => {
    if (!open || !needsProject) return;
    setProjectId("");
    setError("");
    loadProjects();
  }, [open, needsProject, loadProjects]);

  const chosenProject = useMemo(
    () => (needsProject ? projects.find((p) => p.id === projectId) || null : linkedProject),
    [needsProject, projects, projectId, linkedProject],
  );

  const effects = useMemo(
    () => quotationWonEffects({ quote, deal, project: chosenProject, linkingProject: needsProject }),
    [quote, deal, chosenProject, needsProject],
  );

  const close = () => {
    if (busy) return;
    setError("");
    onClose?.();
  };

  const submit = async () => {
    if (needsProject && !projectId) { setError("เลือกโครงการที่ดีลนี้จะเข้าไปอยู่ก่อน"); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${quote.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsProject ? { projectId } : {}),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "ปิด Won ไม่สำเร็จ"));
      const data = await res.json();
      await onDone?.(data);
    } catch (e) {
      setError(e.message || "ปิด Won ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (!quote) return null;
  const blockedReason = needsProject && !projectId
    ? "เลือกโครงการก่อนจึงจะปิด Won ได้ — ใบสั่งขายและงานผลิตที่ตามมาต้องรู้ว่าอยู่โครงการไหน"
    : "";

  return (
    <Modal open={open} onClose={close} title={`ปิดการขาย (Won) · ${quote.quoteNumber || "ใบเสนอราคา"}`} size="md">
      <div className={styles.body}>
        <p className={styles.subject}>
          {quote.quoteNumber} · {customerName || quote.customerName || "ไม่ระบุลูกค้า"}
        </p>

        {error && (
          <div role="alert" className={styles.error}>{error}</div>
        )}

        {/* โครงการ: ผูกแล้ว = ช่องอ่านอย่างเดียว (ค่าที่ระบบรู้แล้วห้ามให้เลือกซ้ำ) ·
            ยังไม่ผูก = ต้องเลือก และลิสต์ต้องบอกได้ว่าทำไมใบที่หาไม่อยู่ในลิสต์ */}
        <div className="form-group">
          <span className="toolbar-label"><FolderKanban size={13} aria-hidden="true" /> โครงการ {needsProject ? "*" : ""}</span>
          {needsProject ? (
            <>
              <SearchableSelect
                className="w-full" entity="project" ariaLabel="โครงการที่ดีลนี้จะเข้าไปอยู่"
                value={projectId} onChange={setProjectId} disabled={busy || loadingProjects}
                options={projects.map((p) => ({
                  value: p.id,
                  label: `${p.code || p.id} · ${p.name || ""}`.trim(),
                  search: `${p.code || ""} ${p.name || ""}`,
                }))}
                placeholder={loadingProjects ? "กำลังโหลด…" : projects.length ? "— เลือกโครงการ —" : "ลูกค้ารายนี้ยังไม่มีโครงการที่เลือกได้"}
                searchPlaceholder="ค้นหารหัสหรือชื่อโครงการ…"
                emptyText="ไม่พบโครงการที่ตรงกับคำค้น"
              />
              <p className="form-note">
                เห็นเฉพาะโครงการของ <b>{customerName || quote.customerName || "ลูกค้ารายนี้"}</b> ที่ยังไม่ปิด
                อยู่ในสายธุรกิจเดียวกับดีล และอยู่ในทีมของคุณ — โครงการที่ไม่อยู่ในลิสต์ติดข้อใดข้อหนึ่งใน 4 ข้อนี้
                {!loadingProjects && !projects.length && <> · ยังไม่มีโครงการที่ใช้ได้ ⇒ สร้างโครงการจากหน้าดีลก่อน</>}
              </p>
            </>
          ) : (
            <div className="readable-field is-compact">
              {linkedProject
                ? `${linkedProject.code || linkedProject.id}${linkedProject.name ? ` · ${linkedProject.name}` : ""}`
                : <span className="readable-field-empty">ผูกโครงการไว้แล้ว</span>}
            </div>
          )}
        </div>

        <div className="form-group">
          <span className="toolbar-label">สิ่งที่จะเกิดขึ้นทันที</span>
          <ul className={styles.effects}>
            {effects.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>

        {/* เหตุผลที่ปุ่มกดไม่ได้ต้องเป็นตัวหนังสือเหนือปุ่ม ไม่ใช่ tooltip
            (ปุ่มที่จางเฉย ๆ คือสิ่งที่ทำให้คนคิดว่าระบบพัง) */}
        {blockedReason && <p className="form-note" role="status">{blockedReason}</p>}

        <div className={styles.footer}>
          <button type="button" className="btn ghost" onClick={close} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || (needsProject && !projectId)} title={blockedReason || undefined}>
            <CheckCircle2 size={15} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "ยืนยันปิด Won"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
