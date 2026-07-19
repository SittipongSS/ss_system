"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Archive, ArrowDown, ArrowUp, ChevronLeft, Clock3, Copy, Edit3,
  Eye, FilePlus2, GitBranch, Milestone, Plus, Save, Send, Trash2, Workflow,
} from "lucide-react";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import { useCan } from "@/lib/roleContext";
import {
  WORKFLOW_TEMPLATE_KEYS,
  WORKFLOW_TEMPLATE_LIMITS,
  WORKFLOW_TEMPLATE_ROLES,
  normalizeWorkflowTemplateDraft,
  templateMatchesCategory,
  workflowTemplateKeyLabel,
  workflowTemplateStatusLabel,
  workflowTemplateSummary,
} from "@/lib/workflowTemplates";
import styles from "./page.module.css";

const EMPTY_STEP = {
  stepKey: "",
  name: "",
  role: "SA",
  durationDays: 1,
  phase: "",
  isMilestone: false,
  dependencyMode: "sequential",
  dependsOnStepKeys: [],
  categoryOnly: "",
  categoryExclude: "",
};

const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (value) => value ? dateTime.format(new Date(value)) : "-";
const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";
const statusClass = (status) => status === "published" ? styles.published : status === "draft" ? styles.draft : styles.archived;

function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${statusClass(status)}`}>{workflowTemplateStatusLabel(status)}</span>;
}

function toEditor(row) {
  return {
    nameTh: row?.nameTh || "",
    description: row?.description || "",
    changeNote: row?.changeNote || "",
    steps: (row?.steps || []).map((step) => ({
      ...EMPTY_STEP,
      ...step,
      durationDays: Number(step.durationDays ?? 1),
      dependsOnStepKeys: [...(step.dependsOnStepKeys || [])],
      categoryOnly: step.categoryOnly || "",
      categoryExclude: step.categoryExclude || "",
      phase: step.phase || "",
    })),
  };
}

function DependencyLabel({ step, steps }) {
  if (step.dependencyMode === "root") return "เริ่มได้ทันที";
  if (step.dependencyMode === "sequential") return "ต่อจากขั้นก่อนหน้า";
  const names = (step.dependsOnStepKeys || []).map((key) => steps.find((item) => item.stepKey === key)?.name || key);
  return names.join(", ") || "ยังไม่ได้เลือก";
}

function StepFormFields({ value, onChange, steps, editIndex }) {
  const set = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  const toggleDependency = (key) => {
    const current = value.dependsOnStepKeys || [];
    set("dependsOnStepKeys", current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };
  const candidates = steps.filter((_, index) => index !== editIndex);

  return (
    <div className={styles.stepFormGrid}>
      <label>
        <span>Step key <b>*</b></span>
        <input
          required
          maxLength={WORKFLOW_TEMPLATE_LIMITS.stepKey}
          pattern="[a-z0-9][a-z0-9_-]*"
          value={value.stepKey}
          onChange={(event) => set("stepKey", event.target.value.toLowerCase().replace(/\s+/g, "_"))}
          placeholder="เช่น prepare_brief"
        />
        <small>รหัสถาวร a-z, 0-9, _ หรือ - ใช้อ้างอิงข้ามเวอร์ชัน</small>
      </label>
      <label>
        <span>ชื่อขั้นตอน <b>*</b></span>
        <input required maxLength={WORKFLOW_TEMPLATE_LIMITS.stepName} value={value.name} onChange={(event) => set("name", event.target.value)} />
      </label>
      <label>
        <span>ผู้รับผิดชอบ <b>*</b></span>
        <select value={value.role} onChange={(event) => set("role", event.target.value)}>
          {WORKFLOW_TEMPLATE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      </label>
      <label>
        <span>ระยะเวลา (วันทำการ) <b>*</b></span>
        <input
          required type="number" min="0" max={WORKFLOW_TEMPLATE_LIMITS.maxDurationDays} step="1"
          value={value.durationDays}
          onChange={(event) => set("durationDays", Number(event.target.value))}
        />
      </label>
      <label className={styles.full}>
        <span>Phase</span>
        <input maxLength={WORKFLOW_TEMPLATE_LIMITS.phase} value={value.phase} onChange={(event) => set("phase", event.target.value)} placeholder="เช่น Development" />
      </label>
      <label className={styles.full}>
        <span>Dependency <b>*</b></span>
        <select value={value.dependencyMode} onChange={(event) => set("dependencyMode", event.target.value)}>
          <option value="sequential">ต่อจากขั้นก่อนหน้าที่ใช้กับหมวดสินค้านี้</option>
          <option value="root">เริ่มได้ทันที ไม่รอขั้นอื่น</option>
          <option value="custom">เลือกขั้นตอนที่ต้องเสร็จก่อน</option>
        </select>
      </label>
      {value.dependencyMode === "custom" && (
        <fieldset className={`${styles.full} ${styles.dependencyBox}`}>
          <legend>ขั้นตอนที่ต้องเสร็จก่อน <b>*</b></legend>
          {candidates.length ? candidates.map((step) => (
            <label key={step.stepKey || step.name} className={styles.checkRow}>
              <input
                type="checkbox"
                checked={(value.dependsOnStepKeys || []).includes(step.stepKey)}
                disabled={!step.stepKey}
                onChange={() => toggleDependency(step.stepKey)}
              />
              <span><strong>{step.name || "ยังไม่มีชื่อ"}</strong><small>{step.stepKey || "กรุณากำหนด Step key ก่อน"}</small></span>
            </label>
          )) : <p className={styles.helpText}>ยังไม่มีขั้นตอนอื่นให้เลือก</p>}
        </fieldset>
      )}
      <div className={`${styles.full} ${styles.categoryGrid}`}>
        <label>
          <span>ใช้เฉพาะหมวดสินค้า</span>
          <input maxLength={WORKFLOW_TEMPLATE_LIMITS.categoryCode} value={value.categoryOnly} onChange={(event) => set("categoryOnly", event.target.value.trim())} placeholder="เช่น 01-002" />
        </label>
        <label>
          <span>ยกเว้นหมวดสินค้า</span>
          <input maxLength={WORKFLOW_TEMPLATE_LIMITS.categoryCode} value={value.categoryExclude} onChange={(event) => set("categoryExclude", event.target.value.trim())} placeholder="เช่น 01-002" />
        </label>
      </div>
      <label className={`${styles.full} ${styles.switchRow}`}>
        <input type="checkbox" checked={value.isMilestone} onChange={(event) => set("isMilestone", event.target.checked)} />
        <span><strong>เป็น Milestone</strong><small>แสดงเป็นหมุดหมายสำคัญบน Timeline</small></span>
      </label>
    </div>
  );
}

export default function WorkflowTemplatesPage() {
  const canManage = useCan("master:manage");
  const [templates, setTemplates] = useState([]);
  const [selectedKey, setSelectedKey] = useState(WORKFLOW_TEMPLATE_KEYS[0]);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepDrawer, setStepDrawer] = useState(null);
  const [stepForm, setStepForm] = useState(EMPTY_STEP);
  const [versionDrawer, setVersionDrawer] = useState(null);
  const [previewDrawer, setPreviewDrawer] = useState(false);
  const [previewCategory, setPreviewCategory] = useState("01-002");
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workflow-templates", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลด Workflow Template ไม่สำเร็จ");
      setTemplates(payload.templates || []);
    } catch (loadError) {
      setError(loadError.message || "โหลด Workflow Template ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const selected = useMemo(
    () => templates.find((template) => template.templateKey === selectedKey) || null,
    [templates, selectedKey],
  );

  useEffect(() => { setEditor(selected?.draft ? toEditor(selected.draft) : null); }, [selected]);

  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(payload.error || fallback);
      requestError.errors = payload.errors;
      throw requestError;
    }
    return payload;
  };

  const createDraft = async () => {
    setBusy(true);
    try {
      const draft = await request(`/api/workflow-templates/${selectedKey}/draft`, { method: "POST" }, "สร้างฉบับร่างไม่สำเร็จ");
      setToast({ kind: "success", msg: `สร้าง Version ${draft.versionNumber} ฉบับร่างแล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!selected?.draft || !editor) return;
    const normalized = normalizeWorkflowTemplateDraft(editor);
    if (normalized.errors.length) {
      setToast({ kind: "error", msg: normalized.errors.slice(0, 4).join("\n") });
      return;
    }
    setBusy(true);
    try {
      const saved = await request(`/api/workflow-templates/draft/${selected.draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...normalized.value, expectedUpdatedAt: selected.draft.updatedAt }),
      }, "บันทึกฉบับร่างไม่สำเร็จ");
      setToast({ kind: "success", msg: `บันทึก Version ${saved.versionNumber} ฉบับร่างแล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: [requestError.message, ...(requestError.errors || []).slice(1, 3)].join("\n") });
    } finally {
      setBusy(false);
    }
  };

  const transitionDraft = async () => {
    if (!selected?.draft || !confirm) return;
    const action = confirm.action;
    setBusy(true);
    try {
      await request(`/api/workflow-templates/draft/${selected.draft.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: selected.draft.updatedAt }),
      }, action === "publish" ? "เผยแพร่ Template ไม่สำเร็จ" : "เก็บฉบับร่างไม่สำเร็จ");
      setConfirm(null);
      setToast({ kind: "success", msg: action === "publish" ? `เผยแพร่ Version ${selected.draft.versionNumber} แล้ว` : `เก็บ Version ${selected.draft.versionNumber} เป็นประวัติแล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const openStep = (index = null) => {
    const row = index === null ? EMPTY_STEP : editor.steps[index];
    setStepForm({ ...EMPTY_STEP, ...row, dependsOnStepKeys: [...(row.dependsOnStepKeys || [])] });
    setStepDrawer({ index });
  };

  const commitStep = (event) => {
    event.preventDefault();
    const index = stepDrawer?.index;
    const next = { ...stepForm, stepKey: stepForm.stepKey.trim().toLowerCase(), name: stepForm.name.trim() };
    setEditor((current) => {
      const steps = [...current.steps];
      if (index === null) steps.push(next);
      else {
        const previousKey = steps[index].stepKey;
        steps[index] = next;
        if (previousKey !== next.stepKey) {
          for (let cursor = 0; cursor < steps.length; cursor += 1) {
            steps[cursor] = {
              ...steps[cursor],
              dependsOnStepKeys: (steps[cursor].dependsOnStepKeys || []).map((key) => key === previousKey ? next.stepKey : key),
            };
          }
        }
      }
      return { ...current, steps };
    });
    setStepDrawer(null);
  };

  const removeStep = (index) => setEditor((current) => {
    const removedKey = current.steps[index].stepKey;
    return {
      ...current,
      steps: current.steps.filter((_, cursor) => cursor !== index).map((step) => ({
        ...step,
        dependsOnStepKeys: (step.dependsOnStepKeys || []).filter((key) => key !== removedKey),
      })),
    };
  });

  const duplicateStep = (index) => setEditor((current) => {
    const source = current.steps[index];
    const usedKeys = new Set(current.steps.map((step) => step.stepKey));
    const baseKey = `${source.stepKey || "step"}_copy`;
    let stepKey = baseKey;
    let suffix = 2;
    while (usedKeys.has(stepKey)) {
      stepKey = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    const copy = { ...source, stepKey, name: `${source.name || "ขั้นตอน"} (สำเนา)`, dependsOnStepKeys: [...(source.dependsOnStepKeys || [])] };
    const steps = [...current.steps];
    steps.splice(index + 1, 0, copy);
    return { ...current, steps };
  });

  const moveStep = (index, direction) => setEditor((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.steps.length) return current;
    const steps = [...current.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    return { ...current, steps };
  });

  if (!canManage) return null;

  const publishedSummary = workflowTemplateSummary(selected?.published);
  const draftValidation = editor ? normalizeWorkflowTemplateDraft(editor) : null;
  const draftDirty = !!(editor && selected?.draft && JSON.stringify(editor) !== JSON.stringify(toEditor(selected.draft)));
  const selectedVersion = versionDrawer?.row;
  const previewSteps = (editor?.steps || []).filter((step) => templateMatchesCategory(step, previewCategory));
  const previewSummary = workflowTemplateSummary({ steps: previewSteps });

  return (
    <>
      <header className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><Workflow size={22} /></span> Workflow และ Timeline Template</h1>
          <p>กำหนดขั้นตอน ระยะเวลา ผู้รับผิดชอบ และ dependency ที่ใช้สร้าง Timeline งานใหม่แบบมีเวอร์ชัน</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/settings" className="btn ghost"><ChevronLeft size={16} /> กลับหน้าตั้งค่า</Link>
          {!loading && selected && !selected.draft && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={createDraft}><FilePlus2 size={16} /> สร้างฉบับร่าง</button>
          )}
        </div>
      </header>

      <nav className={styles.templateTabs} aria-label="ประเภท Workflow Template">
        {WORKFLOW_TEMPLATE_KEYS.map((key) => {
          const item = templates.find((template) => template.templateKey === key);
          return (
            <button key={key} type="button" aria-current={selectedKey === key ? "page" : undefined} className={selectedKey === key ? styles.activeTab : ""} onClick={() => setSelectedKey(key)}>
              <span>{key}</span><strong>{workflowTemplateKeyLabel(key)}</strong>{item?.draft && <i>มีฉบับร่าง</i>}
            </button>
          );
        })}
      </nav>

      {loading ? <SkeletonRows rows={8} /> : error ? (
        <div className={`glass-panel ${styles.errorPanel}`}>
          <AlertTriangle size={28} /><p>{error}</p><button type="button" className="btn ghost" onClick={load}>ลองใหม่</button>
        </div>
      ) : !selected ? (
        <EmptyState icon={Workflow}>ไม่พบข้อมูล Workflow Template</EmptyState>
      ) : (
        <main className={styles.layout}>
          <section className={`glass-panel ${styles.publishedPanel}`} aria-labelledby="published-title">
            <div className={styles.identity}>
              <div className={styles.titleLine}><span className={styles.eyebrow}>PUBLISHED TEMPLATE</span><StatusBadge status="published" /></div>
              <h2 id="published-title">{selected.published?.nameTh || workflowTemplateKeyLabel(selectedKey)}</h2>
              <p>{selected.published?.description || "Template ที่ใช้สร้าง Timeline สำหรับงานใหม่"}</p>
              <small>Version {selected.published?.versionNumber || "-"} · เผยแพร่ {formatDate(selected.published?.publishedAt)} โดย {actorOf(selected.published)}</small>
            </div>
            <div className={styles.summaryGrid}>
              <div><GitBranch size={17} /><span>ขั้นตอน<strong>{publishedSummary.steps}</strong></span></div>
              <div><Clock3 size={17} /><span>รวมระยะเวลา<strong>{publishedSummary.durationDays} วัน</strong></span></div>
              <div><Workflow size={17} /><span>Phase<strong>{publishedSummary.phases}</strong></span></div>
              <div><Milestone size={17} /><span>Milestone<strong>{publishedSummary.milestones}</strong></span></div>
            </div>
          </section>

          {selected.draft && editor ? (
            <section className={`glass-panel ${styles.editorPanel}`} aria-labelledby="draft-title">
              <header className={styles.panelHeader}>
                <div>
                  <div className={styles.titleLine}><h2 id="draft-title">Version {selected.draft.versionNumber} ฉบับร่าง</h2><StatusBadge status="draft" /></div>
                  <p>การแก้ไขยังไม่กระทบงานใหม่จนกว่าจะเผยแพร่ และไม่เปลี่ยน Timeline ของงานที่สร้างไปแล้ว</p>
                </div>
                <div className={styles.editorActions}>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirm({ action: "archive" })}><Archive size={16} /> เก็บฉบับร่าง</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => setPreviewDrawer(true)}><Eye size={16} /> Preview</button>
                  <button type="button" className="btn ghost" title={draftDirty ? "บันทึกฉบับร่างก่อนเผยแพร่" : undefined} disabled={busy || draftDirty || !editor.changeNote.trim() || draftValidation?.errors.length} onClick={() => setConfirm({ action: "publish" })}><Send size={16} /> เผยแพร่</button>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={saveDraft}><Save size={16} /> บันทึกฉบับร่าง</button>
                </div>
              </header>

              <div className={styles.metadataGrid}>
                <label><span>ชื่อ Template <b>*</b></span><input value={editor.nameTh} maxLength={WORKFLOW_TEMPLATE_LIMITS.nameTh} onChange={(event) => setEditor({ ...editor, nameTh: event.target.value })} /></label>
                <label><span>คำอธิบาย</span><textarea value={editor.description} maxLength={WORKFLOW_TEMPLATE_LIMITS.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
                <label className={styles.full}><span>หมายเหตุการเปลี่ยนแปลง <b>* ก่อนเผยแพร่</b></span><textarea value={editor.changeNote} maxLength={WORKFLOW_TEMPLATE_LIMITS.changeNote} onChange={(event) => setEditor({ ...editor, changeNote: event.target.value })} placeholder="อธิบายว่าเปลี่ยนอะไรและเพราะเหตุใด" /></label>
              </div>

              <div className={styles.stepsHeader}>
                <div><h3>ลำดับขั้นตอน</h3><p>{editor.steps.length} ขั้นตอน · ลำดับมีผลกับ dependency แบบ “ต่อจากขั้นก่อนหน้า”</p></div>
                <button type="button" className="btn ghost" onClick={() => openStep(null)}><Plus size={16} /> เพิ่มขั้นตอน</button>
              </div>

              {draftValidation?.errors.length ? (
                <div className={styles.validation} role="alert"><AlertTriangle size={17} /><div><strong>ยังเผยแพร่ไม่ได้</strong>{draftValidation.errors.slice(0, 4).map((item) => <p key={item}>{item}</p>)}</div></div>
              ) : null}

              {editor.steps.length ? (
                <>
                  <div className={styles.stepTableWrap}>
                    <table className={styles.stepTable}>
                      <thead><tr><th>ลำดับ / ขั้นตอน</th><th>ผู้รับผิดชอบ</th><th>ระยะเวลา</th><th>Dependency / เงื่อนไขหมวด</th><th><span className="sr-only">จัดการ</span></th></tr></thead>
                      <tbody>{editor.steps.map((step, index) => (
                        <tr key={`${step.stepKey}-${index}`}>
                          <td><div className={styles.stepIdentity}><span>{index + 1}</span><div><strong>{step.name || "ยังไม่มีชื่อ"}{step.isMilestone && <Milestone size={14} aria-label="Milestone" />}</strong><small>{step.stepKey || "ยังไม่มี Step key"}{step.phase ? ` · ${step.phase}` : ""}</small></div></div></td>
                          <td><span className={styles.roleBadge}>{step.role}</span></td>
                          <td>{step.durationDays} วัน</td>
                          <td><strong className={styles.dependency}><DependencyLabel step={step} steps={editor.steps} /></strong><small>{step.categoryOnly ? `เฉพาะ ${step.categoryOnly}` : step.categoryExclude ? `ยกเว้น ${step.categoryExclude}` : "ทุกหมวดสินค้า"}</small></td>
                          <td><div className={styles.rowActions}>
                            <button type="button" className="btn-icon" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label={`เลื่อน ${step.name} ขึ้น`}><ArrowUp size={15} /></button>
                            <button type="button" className="btn-icon" disabled={index === editor.steps.length - 1} onClick={() => moveStep(index, 1)} aria-label={`เลื่อน ${step.name} ลง`}><ArrowDown size={15} /></button>
                            <button type="button" className="btn-icon" onClick={() => openStep(index)} aria-label={`แก้ไข ${step.name}`}><Edit3 size={15} /></button>
                            <button type="button" className="btn-icon" onClick={() => duplicateStep(index)} aria-label={`ทำสำเนา ${step.name}`}><Copy size={15} /></button>
                            <button type="button" className="btn-icon" onClick={() => removeStep(index)} aria-label={`ลบ ${step.name}`}><Trash2 size={15} /></button>
                          </div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className={styles.stepCards}>{editor.steps.map((step, index) => (
                    <article key={`${step.stepKey}-${index}`} className={styles.stepCard}>
                      <div className={styles.cardHead}><div className={styles.stepIdentity}><span>{index + 1}</span><div><strong>{step.name || "ยังไม่มีชื่อ"}</strong><small>{step.stepKey || "ยังไม่มี Step key"}</small></div></div><span className={styles.roleBadge}>{step.role}</span></div>
                      <dl><div><dt>ระยะเวลา</dt><dd>{step.durationDays} วัน</dd></div><div><dt>Dependency</dt><dd><DependencyLabel step={step} steps={editor.steps} /></dd></div><div><dt>หมวดสินค้า</dt><dd>{step.categoryOnly ? `เฉพาะ ${step.categoryOnly}` : step.categoryExclude ? `ยกเว้น ${step.categoryExclude}` : "ทุกหมวด"}</dd></div></dl>
                      <div className={styles.mobileActions}><button type="button" className="btn ghost" onClick={() => openStep(index)}><Edit3 size={15} /> แก้ไข</button><button type="button" className="btn ghost" onClick={() => duplicateStep(index)}><Copy size={15} /> สำเนา</button><button type="button" className="btn ghost" onClick={() => removeStep(index)}><Trash2 size={15} /> ลบ</button><button type="button" className="btn-icon" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label="เลื่อนขึ้น"><ArrowUp size={15} /></button><button type="button" className="btn-icon" disabled={index === editor.steps.length - 1} onClick={() => moveStep(index, 1)} aria-label="เลื่อนลง"><ArrowDown size={15} /></button></div>
                    </article>
                  ))}</div>
                </>
              ) : <EmptyState icon={GitBranch} plain action={{ label: "เพิ่มขั้นตอนแรก", onClick: () => openStep(null) }}>ฉบับร่างยังไม่มีขั้นตอน</EmptyState>}
            </section>
          ) : (
            <section className={`glass-panel ${styles.noDraft}`}>
              <FilePlus2 size={26} /><div><h2>ยังไม่มีฉบับร่าง</h2><p>สร้างฉบับร่างจาก Published version ปัจจุบันเพื่อเริ่มแก้ไข โดยงานที่มีอยู่จะไม่เปลี่ยนตาม</p></div><button type="button" className="btn btn-primary" disabled={busy} onClick={createDraft}><FilePlus2 size={16} /> สร้างฉบับร่าง</button>
            </section>
          )}

          <section className={`glass-panel ${styles.historyPanel}`} aria-labelledby="history-title">
            <header className={styles.panelHeader}><div><h2 id="history-title">ประวัติเวอร์ชัน</h2><p>Published และ Archived เป็นข้อมูลถาวร เปิดดูได้แต่แก้ไขไม่ได้</p></div></header>
            <div className={styles.historyTableWrap}><table className={styles.historyTable}><thead><tr><th>Version</th><th>สถานะ</th><th>รายละเอียด</th><th>ผู้ดำเนินการ</th><th>เวลา</th><th><span className="sr-only">เปิดดู</span></th></tr></thead><tbody>{selected.versions.map((version) => <tr key={version.id}><td><strong>Version {version.versionNumber}</strong></td><td><StatusBadge status={version.status} /></td><td>{version.changeNote || version.description || "-"}<small>{version.steps?.length || 0} ขั้นตอน</small></td><td>{actorOf(version)}</td><td>{formatDate(version.publishedAt || version.archivedAt || version.updatedAt)}</td><td><button type="button" className="btn ghost" onClick={() => setVersionDrawer({ row: version })}><Eye size={15} /> ดู</button></td></tr>)}</tbody></table></div>
            <div className={styles.historyCards}>{selected.versions.map((version) => <article key={version.id} className={styles.historyCard}><div className={styles.cardHead}><strong>Version {version.versionNumber}</strong><StatusBadge status={version.status} /></div><p>{version.changeNote || version.description || "ไม่มีหมายเหตุ"}</p><small>{version.steps?.length || 0} ขั้นตอน · {formatDate(version.publishedAt || version.archivedAt || version.updatedAt)}</small><button type="button" className="btn ghost" onClick={() => setVersionDrawer({ row: version })}><Eye size={15} /> ดูรายละเอียด</button></article>)}</div>
          </section>
        </main>
      )}

      <RecordDrawer
        open={!!stepDrawer}
        onClose={() => setStepDrawer(null)}
        title={stepDrawer?.index === null ? "เพิ่มขั้นตอน" : "แก้ไขขั้นตอน"}
        subtitle="ข้อมูลนี้จะอยู่ในฉบับร่างจนกดบันทึก"
        footer={<><button type="button" className="btn ghost" onClick={() => setStepDrawer(null)}>ยกเลิก</button><button type="submit" form="workflow-step-form" className="btn btn-primary">{stepDrawer?.index === null ? "เพิ่มขั้นตอน" : "บันทึกขั้นตอน"}</button></>}
      >
        <form id="workflow-step-form" onSubmit={commitStep}><StepFormFields value={stepForm} onChange={setStepForm} steps={editor?.steps || []} editIndex={stepDrawer?.index} /></form>
      </RecordDrawer>

      <RecordDrawer
        open={previewDrawer}
        onClose={() => setPreviewDrawer(false)}
        title={`Preview ${selectedKey} Timeline`}
        subtitle="อ่านอย่างเดียว · ยังไม่สร้างงานหรือเปลี่ยนข้อมูล"
        footer={<button type="button" className="btn ghost" onClick={() => setPreviewDrawer(false)}>ปิด Preview</button>}
      >
        <div className={styles.previewBody}>
          <label className={styles.previewFilter}>
            <span>จำลองหมวดสินค้า</span>
            <input value={previewCategory} maxLength={WORKFLOW_TEMPLATE_LIMITS.categoryCode} onChange={(event) => setPreviewCategory(event.target.value.trim())} placeholder="เว้นว่าง = หมวดทั่วไป" />
            <small>ใช้ 01-002 เพื่อตรวจขั้นตอนสรรพสามิต หรือเปลี่ยนเป็นหมวดอื่นเพื่อเทียบผล</small>
          </label>
          <div className={styles.previewSummary}>
            <div><strong>{previewSummary.steps}</strong><span>ขั้นตอน</span></div>
            <div><strong>{previewSummary.phases}</strong><span>Phase</span></div>
            <div><strong>{previewSummary.durationDays}</strong><span>วันรวม</span></div>
            <div><strong>{previewSummary.milestones}</strong><span>Milestone</span></div>
          </div>
          {previewSteps.length ? <ol className={styles.previewTimeline}>{previewSteps.map((step, index) => (
            <li key={step.stepKey}>
              <span className={styles.previewRail} aria-hidden="true"><i>{index + 1}</i></span>
              <div>
                <div className={styles.cardHead}><strong>{step.name}</strong><span className={styles.roleBadge}>{step.role}</span></div>
                <small>{step.phase || "ไม่มี Phase"} · {step.durationDays} วัน{step.isMilestone ? " · Milestone" : ""}</small>
                <p><GitBranch size={13} /><DependencyLabel step={step} steps={previewSteps} /></p>
              </div>
            </li>
          ))}</ol> : <EmptyState icon={Workflow} plain>ไม่มีขั้นตอนที่ใช้กับหมวดสินค้านี้</EmptyState>}
          <p className={styles.previewNote}>ผล Preview แสดงลำดับและ dependency หลังกรองหมวดสินค้า ยอด “วันรวม” เป็นผลรวมระยะเวลา ไม่ใช่ critical path เมื่อมีงานขนาน</p>
        </div>
      </RecordDrawer>

      <RecordDrawer
        open={!!versionDrawer}
        onClose={() => setVersionDrawer(null)}
        title={`Workflow Template Version ${selectedVersion?.versionNumber || "-"}`}
        subtitle={selectedVersion?.nameTh}
        badge={selectedVersion ? <StatusBadge status={selectedVersion.status} /> : null}
        footer={<button type="button" className="btn ghost" onClick={() => setVersionDrawer(null)}>ปิด</button>}
      >
        {selectedVersion && <div className={styles.versionDetail}>
          <section><h4>รายละเอียดเวอร์ชัน</h4><dl><div><dt>ประเภท</dt><dd>{selectedVersion.templateKey}</dd></div><div><dt>ผู้ดำเนินการ</dt><dd>{actorOf(selectedVersion)}</dd></div><div className={styles.full}><dt>คำอธิบาย</dt><dd>{selectedVersion.description || "-"}</dd></div><div className={styles.full}><dt>หมายเหตุการเปลี่ยนแปลง</dt><dd>{selectedVersion.changeNote || "-"}</dd></div></dl></section>
          <section><h4>ขั้นตอน ({selectedVersion.steps?.length || 0})</h4><ol className={styles.versionSteps}>{(selectedVersion.steps || []).map((step) => <li key={step.stepKey}><span>{step.stepOrder + 1}</span><div><strong>{step.name}</strong><small>{step.stepKey} · {step.role} · {step.durationDays} วัน</small><small><DependencyLabel step={step} steps={selectedVersion.steps} /></small></div></li>)}</ol></section>
        </div>}
      </RecordDrawer>

      <ConfirmDialog
        open={confirm?.action === "publish"}
        title="ยืนยันเผยแพร่ Workflow Template"
        description={`Version ${selected?.draft?.versionNumber || "-"} จะถูกใช้สร้าง Timeline ของงาน ${selectedKey} ใหม่หลังจากนี้`}
        detail="งานและ Timeline ที่สร้างไปแล้วจะคง version เดิมไว้ Published version ก่อนหน้าจะถูกเก็บถาวรและยังเปิดดูได้"
        confirmLabel="เผยแพร่เวอร์ชัน"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <ConfirmDialog
        open={confirm?.action === "archive"}
        title="เก็บฉบับร่างเป็นประวัติ"
        description={`Version ${selected?.draft?.versionNumber || "-"} จะถูกปิดและแก้ไขต่อไม่ได้`}
        detail="Published version ที่ใช้งานอยู่จะไม่เปลี่ยนแปลง"
        confirmLabel="เก็บฉบับร่าง"
        tone="danger"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
