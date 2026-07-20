"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Edit3, Eye, FilePlus2, Plus, Send, Trash2, WalletCards } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import { useRole } from "@/lib/roleContext";
import { canManageCommercialPresets } from "@/lib/permissions";
import {
  COMMERCIAL_DEAL_TYPES,
  COMMERCIAL_TEAM_LABELS,
  commercialPresetScopeLabel,
  commercialPresetStatusLabel,
  installmentPercentTotal,
} from "@/lib/commercialPresets";
import styles from "./page.module.css";

const EMPTY_FORM = {
  documentKey: "quotation",
  teamKey: "",
  dealType: "",
  serviceType: "",
  priority: 0,
  title: "",
  paymentMethod: "",
  paymentTerms: "",
  remarks: "",
  installments: [],
  changeNote: "",
};

const EMPTY_INSTALLMENT = { label: "", percent: "", trigger: "", dueRule: "", note: "" };
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const formatDateTime = (value) => value ? dateTime.format(new Date(value)) : "-";
const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";

function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${styles[status] || styles.draft}`}>{commercialPresetStatusLabel(status)}</span>;
}

function formFrom(preset, row) {
  return {
    documentKey: preset?.documentKey || "quotation",
    teamKey: preset?.teamKey || "",
    dealType: preset?.dealType || "",
    serviceType: preset?.serviceType || "",
    priority: preset?.priority ?? 0,
    title: row?.title || "",
    paymentMethod: row?.paymentMethod || "",
    paymentTerms: row?.paymentTerms || "",
    remarks: row?.remarks || "",
    installments: Array.isArray(row?.installments) ? row.installments.map((item) => ({ ...item, percent: String(item.percent) })) : [],
    changeNote: row?.changeNote || "",
  };
}

function ScopeFields({ form, setForm, disabled }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <section className={styles.formSection}>
      <h4>ขอบเขตการใช้งาน</h4>
      {disabled && <p className={styles.help}>ขอบเขตเป็น identity ถาวร หากต้องใช้ขอบเขตอื่นให้สร้าง Preset ใหม่</p>}
      <div className={styles.formGrid}>
        <label>ชนิดเอกสาร<select className="premium-select" value={form.documentKey} disabled={disabled} onChange={(event) => update("documentKey", event.target.value)}><option value="quotation">ใบเสนอราคา</option></select></label>
        <label>ทีม<select className="premium-select" value={form.teamKey} disabled={disabled} onChange={(event) => update("teamKey", event.target.value)}><option value="">ทุกทีม</option>{Object.entries(COMMERCIAL_TEAM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>ประเภทดีล<select className="premium-select" value={form.dealType} disabled={disabled} onChange={(event) => update("dealType", event.target.value)}><option value="">ทุกประเภทดีล</option>{COMMERCIAL_DEAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>ประเภทบริการ<input className="premium-input" value={form.serviceType} disabled={disabled} maxLength={80} placeholder="ไม่ระบุ = ใช้ได้ทุกบริการ" onChange={(event) => update("serviceType", event.target.value)} /></label>
        <label>ลำดับความสำคัญ<input className="premium-input" type="number" min="0" max="9999" value={form.priority} disabled={disabled} onChange={(event) => update("priority", event.target.value)} /></label>
      </div>
    </section>
  );
}

function InstallmentEditor({ rows, setRows }) {
  const update = (index, field, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  const total = installmentPercentTotal(rows);
  return (
    <section className={styles.formSection}>
      <div className={styles.sectionTitle}><div><h4>ตารางงวดชำระ</h4><p>ไม่บังคับ หากระบุผลรวมต้องเท่ากับ 100%</p></div><button type="button" className="btn sm" onClick={() => setRows((current) => [...current, { ...EMPTY_INSTALLMENT }])} disabled={rows.length >= 12}><Plus size={14} /> เพิ่มงวด</button></div>
      {rows.length === 0 ? <div className={styles.miniEmpty}>ยังไม่มีงวดชำระ Preset นี้สามารถใช้เงื่อนไขแบบข้อความอย่างเดียวได้</div> : (
        <div className={styles.installmentList}>
          {rows.map((row, index) => (
            <article key={index} className={styles.installmentCard}>
              <header><strong>งวดที่ {index + 1}</strong><button type="button" className="btn-icon danger" aria-label={`ลบงวดที่ ${index + 1}`} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></header>
              <div className={styles.formGrid}>
                <label>ชื่อรายการ <b>*</b><input className="premium-input" required maxLength={120} value={row.label} onChange={(event) => update(index, "label", event.target.value)} /></label>
                <label>เปอร์เซ็นต์ <b>*</b><input className="premium-input" required type="number" min="0.01" max="100" step="0.01" value={row.percent} onChange={(event) => update(index, "percent", event.target.value)} /></label>
                <label className={styles.full}>Trigger / เหตุการณ์เริ่ม<input className="premium-input" maxLength={300} value={row.trigger || ""} placeholder="เช่น เมื่ออนุมัติใบเสนอราคา" onChange={(event) => update(index, "trigger", event.target.value)} /></label>
                <label className={styles.full}>Due rule / กำหนดชำระ<input className="premium-input" maxLength={300} value={row.dueRule || ""} placeholder="เช่น ภายใน 7 วัน" onChange={(event) => update(index, "dueRule", event.target.value)} /></label>
                <label className={styles.full}>หมายเหตุ<input className="premium-input" maxLength={500} value={row.note || ""} onChange={(event) => update(index, "note", event.target.value)} /></label>
              </div>
            </article>
          ))}
          <div className={`${styles.total} ${Math.abs(total - 100) <= 0.001 ? styles.valid : styles.invalid}`}><span>รวม</span><strong>{total.toFixed(2)}%</strong></div>
        </div>
      )}
    </section>
  );
}

function ContentFields({ form, setForm }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <>
      <section className={styles.formSection}>
        <h4>เงื่อนไขการค้า</h4>
        <div className={styles.formGrid}>
          <label className={styles.full}>ชื่อ Preset <b>*</b><input className="premium-input" required maxLength={150} value={form.title} onChange={(event) => update("title", event.target.value)} /></label>
          <label className={styles.full}>วิธีชำระเงิน<textarea className="textarea-premium" maxLength={300} value={form.paymentMethod} placeholder="เช่น โอนเงินเข้าบัญชีบริษัท" onChange={(event) => update("paymentMethod", event.target.value)} /></label>
          <label className={styles.full}>เงื่อนไขการชำระ<textarea className="textarea-premium" maxLength={1500} value={form.paymentTerms} placeholder="เช่น เครดิต 30 วัน" onChange={(event) => update("paymentTerms", event.target.value)} /></label>
          <label className={styles.full}>หมายเหตุในเอกสาร<textarea className="textarea-premium" rows={5} maxLength={6000} value={form.remarks} onChange={(event) => update("remarks", event.target.value)} /></label>
        </div>
      </section>
      <InstallmentEditor rows={form.installments} setRows={(updater) => setForm((current) => ({ ...current, installments: typeof updater === "function" ? updater(current.installments) : updater }))} />
      <section className={styles.formSection}>
        <h4>หลักฐานการเปลี่ยนแปลง</h4>
        <label>หมายเหตุการเปลี่ยนแปลง <b>* ก่อนเผยแพร่</b><textarea className="textarea-premium" maxLength={500} value={form.changeNote} placeholder="ระบุเหตุผลหรือสิ่งที่เปลี่ยน" onChange={(event) => update("changeNote", event.target.value)} /></label>
      </section>
    </>
  );
}

function PresetPreview({ preset, row }) {
  const installments = Array.isArray(row?.installments) ? row.installments : [];
  return (
    <div className={styles.preview}>
      <header><span>COMMERCIAL PRESET · VERSION {row?.versionNumber || "-"}</span><strong>{row?.title || "ยังไม่ระบุชื่อ"}</strong><small>{commercialPresetScopeLabel(preset)}</small></header>
      <dl><div><dt>วิธีชำระเงิน</dt><dd>{row?.paymentMethod || "-"}</dd></div><div><dt>เงื่อนไขการชำระ</dt><dd>{row?.paymentTerms || "-"}</dd></div><div><dt>หมายเหตุ</dt><dd>{row?.remarks || "-"}</dd></div></dl>
      {installments.length > 0 && <div className={styles.previewTable}><table><thead><tr><th>งวด</th><th>%</th><th>Trigger / Due rule</th></tr></thead><tbody>{installments.map((item, index) => <tr key={index}><td>{item.label}</td><td>{Number(item.percent).toFixed(2)}</td><td>{[item.trigger, item.dueRule, item.note].filter(Boolean).join(" · ") || "-"}</td></tr>)}</tbody></table></div>}
    </div>
  );
}

export default function CommercialPresetsPage() {
  const role = useRole();
  const canManage = canManageCommercialPresets(role);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/commercial-presets", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลด Commercial Preset ไม่สำเร็จ");
      setPresets(Array.isArray(payload.presets) ? payload.presets : []);
    } catch (loadError) { setError(loadError.message || "โหลด Commercial Preset ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const drawerPreset = useMemo(() => presets.find((item) => item.id === drawer?.presetId) || drawer?.preset || null, [drawer, presets]);
  const drawerRow = drawer?.rowId ? drawerPreset?.versions?.find((item) => item.id === drawer.rowId) || drawer?.row : drawer?.row;
  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  };

  const openCreate = () => { setForm({ ...EMPTY_FORM, installments: [] }); setDrawer({ mode: "create" }); };
  const openEdit = (preset, row) => { setForm(formFrom(preset, row)); setDrawer({ mode: "edit", presetId: preset.id, rowId: row.id, row }); };
  const openView = (preset, row) => setDrawer({ mode: "view", presetId: preset.id, rowId: row.id, row });

  const submitForm = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const creating = drawer?.mode === "create";
      const payload = { ...form, priority: Number(form.priority), installments: form.installments.map((row) => ({ ...row, percent: Number(row.percent) })) };
      const saved = await request(creating ? "/api/commercial-presets" : `/api/commercial-presets/draft/${drawerRow.id}`, {
        method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating ? payload : { ...payload, expectedUpdatedAt: drawerRow.updatedAt }),
      }, creating ? "สร้าง Commercial Preset ไม่สำเร็จ" : "บันทึกฉบับร่างไม่สำเร็จ");
      setDrawer(null);
      setToast({ kind: "success", msg: creating ? `สร้าง “${saved.draft.title}” Version 1 ฉบับร่างแล้ว` : `บันทึก “${saved.title}” Version ${saved.versionNumber} แล้ว` });
      await load();
    } catch (requestError) { setToast({ kind: "error", msg: requestError.message }); }
    finally { setBusy(false); }
  };

  const createDraft = async (preset) => {
    setBusy(true);
    try {
      const draft = await request(`/api/commercial-presets/${preset.id}/draft`, { method: "POST" }, "สร้างฉบับร่างไม่สำเร็จ");
      await load();
      setForm(formFrom(preset, draft));
      setDrawer({ mode: "edit", presetId: preset.id, rowId: draft.id, row: draft });
      setToast({ kind: "success", msg: `สร้าง Version ${draft.versionNumber} ฉบับร่างแล้ว` });
    } catch (requestError) { setToast({ kind: "error", msg: requestError.message }); }
    finally { setBusy(false); }
  };

  const transition = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await request(`/api/commercial-presets/draft/${confirm.draft.id}/${confirm.action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: confirm.draft.updatedAt }),
      }, confirm.action === "publish" ? "เผยแพร่ Commercial Preset ไม่สำเร็จ" : "เก็บฉบับร่างไม่สำเร็จ");
      setConfirm(null); setDrawer(null);
      setToast({ kind: "success", msg: confirm.action === "publish" ? `เผยแพร่ Version ${confirm.draft.versionNumber} แล้ว` : `เก็บ Version ${confirm.draft.versionNumber} เป็นประวัติแล้ว` });
      await load();
    } catch (requestError) { setToast({ kind: "error", msg: requestError.message }); }
    finally { setBusy(false); }
  };

  if (!canManage) return null;
  const editing = drawer?.mode === "edit" || drawer?.mode === "create";

  return (
    <Workspace
      hideHeader
      back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}
      backActions={<button type="button" className="btn btn-accent" onClick={openCreate} disabled={busy}><FilePlus2 size={16} /> สร้าง Preset</button>}
    >
      <header className="premium-header"><div className="header-content"><h1><span className="premium-header-icon"><WalletCards size={22} /></span> Commercial Preset</h1><p>ตั้งค่าวิธีชำระ เงื่อนไข หมายเหตุ และงวดชำระตามทีมและประเภทดีลแบบมีเวอร์ชัน</p></div></header>
      <div className={styles.notice}><AlertTriangle size={17} /><p><strong>Phase 7A เป็นการตั้งค่าล่วงหน้า</strong> ยังไม่เลือก Preset ให้อัตโนมัติและยังไม่เปลี่ยน Production Print</p></div>
      {loading ? <SkeletonRows rows={8} /> : error ? <section className={`glass-panel ${styles.error}`} role="alert"><AlertTriangle size={26} /><p>{error}</p><button type="button" className="btn" onClick={load}>ลองอีกครั้ง</button></section> : presets.length === 0 ? <EmptyState icon={WalletCards}>ยังไม่มี Commercial Preset เริ่มต้นด้วยการสร้างฉบับร่างรายการแรก</EmptyState> : (
        <section className={`glass-panel ${styles.listPanel}`} aria-labelledby="preset-list-title"><header className={styles.panelHeader}><div><h2 id="preset-list-title">Preset ทั้งหมด</h2><p>เมื่อ scope ตรงกันหลายรายการ resolver จะเลือกความจำเพาะสูงสุด แล้วเรียง priority และ preset key</p></div><span className="ui-badge">{presets.length} รายการ</span></header>
          <div className={`premium-table-wrapper ${styles.tableWrap}`}><table className="premium-table"><thead><tr><th>Preset</th><th>ขอบเขต</th><th>เวอร์ชัน</th><th>วิธีชำระ / งวด</th><th>อัปเดต</th><th aria-label="การทำงาน" /></tr></thead><tbody>{presets.map((preset) => { const current = preset.draft || preset.published || preset.versions?.[0]; return <tr key={preset.id}><td><strong>{current?.title || "ไม่มีชื่อ"}</strong><small className="mono">{preset.presetKey}</small></td><td>{commercialPresetScopeLabel(preset)}<small>Priority {preset.priority}</small></td><td><div className={styles.versionCell}>{preset.published && <span>V{preset.published.versionNumber} <StatusBadge status="published" /></span>}{preset.draft && <span>V{preset.draft.versionNumber} <StatusBadge status="draft" /></span>}{!preset.published && !preset.draft && <span>ไม่มีเวอร์ชันใช้งาน</span>}</div></td><td>{current?.paymentMethod || "-"}<small>{current?.installments?.length || 0} งวด</small></td><td>{formatDateTime(current?.updatedAt)}</td><td><div className={styles.rowActions}>{current && <button type="button" className="btn ghost sm" onClick={() => openView(preset, current)}><Eye size={14} /> ดู</button>}{preset.draft ? <button type="button" className="btn sm" onClick={() => openEdit(preset, preset.draft)}><Edit3 size={14} /> แก้ Draft</button> : <button type="button" className="btn sm" onClick={() => createDraft(preset)} disabled={busy}><FilePlus2 size={14} /> สร้าง Draft</button>}</div></td></tr>; })}</tbody></table></div>
          <div className={styles.cards}>{presets.map((preset) => { const current = preset.draft || preset.published || preset.versions?.[0]; return <article key={preset.id} className={styles.card}><header><div><strong>{current?.title || "ไม่มีชื่อ"}</strong><small>{commercialPresetScopeLabel(preset)}</small></div>{current && <StatusBadge status={current.status} />}</header><p>{current?.paymentMethod || "ยังไม่ระบุวิธีชำระ"} · {current?.installments?.length || 0} งวด</p><div className={styles.cardActions}>{current && <button type="button" className="btn ghost" onClick={() => openView(preset, current)}><Eye size={15} /> ดู</button>}{preset.draft ? <button type="button" className="btn" onClick={() => openEdit(preset, preset.draft)}><Edit3 size={15} /> แก้ Draft</button> : <button type="button" className="btn" onClick={() => createDraft(preset)} disabled={busy}><FilePlus2 size={15} /> สร้าง Draft</button>}</div></article>; })}</div>
        </section>
      )}

      <RecordDrawer open={!!drawer} onClose={() => !busy && setDrawer(null)} closeOnOverlay={false} opaqueSurface title={drawer?.mode === "create" ? "สร้าง Commercial Preset" : drawerRow ? `${drawerRow.title} · Version ${drawerRow.versionNumber}` : "Commercial Preset"} subtitle={editing ? "บันทึกฉบับร่างแบบ explicit ไม่มี Auto-save" : "รายละเอียดและ Preview แบบอ่านอย่างเดียว"} badge={drawerRow ? <StatusBadge status={drawerRow.status} /> : null} footer={editing ? <><button type="button" className="btn ghost" onClick={() => setDrawer(null)} disabled={busy}>ยกเลิก</button><button type="submit" form="commercial-preset-form" className="btn btn-accent" disabled={busy}>{busy ? "กำลังบันทึก…" : drawer?.mode === "create" ? "สร้างฉบับร่าง" : "บันทึกฉบับร่าง"}</button></> : <><button type="button" className="btn" onClick={() => setDrawer(null)}>ปิด</button>{drawerPreset?.draft?.id === drawerRow?.id && <button type="button" className="btn" onClick={() => openEdit(drawerPreset, drawerRow)}><Edit3 size={15} /> แก้ไข</button>}</>}>
        {editing ? <form id="commercial-preset-form" className={styles.form} onSubmit={submitForm}><ScopeFields form={form} setForm={setForm} disabled={drawer?.mode !== "create"} /><ContentFields form={form} setForm={setForm} /></form> : drawerPreset && drawerRow ? <div className={styles.drawerBody}><PresetPreview preset={drawerPreset} row={drawerRow} /><section className={styles.detailSection}><h4>เวอร์ชันและหลักฐาน</h4><dl><div><dt>สถานะ</dt><dd>{commercialPresetStatusLabel(drawerRow.status)}</dd></div><div><dt>ผู้ดำเนินการ</dt><dd>{actorOf(drawerRow)}</dd></div><div><dt>เวลาล่าสุด</dt><dd>{formatDateTime(drawerRow.publishedAt || drawerRow.archivedAt || drawerRow.updatedAt)}</dd></div><div><dt>หมายเหตุการเปลี่ยนแปลง</dt><dd>{drawerRow.changeNote || "-"}</dd></div></dl></section><section className={styles.historySection}><h4>ประวัติเวอร์ชัน</h4><div>{drawerPreset.versions?.map((version) => <button key={version.id} type="button" className={version.id === drawerRow.id ? styles.historyActive : ""} aria-pressed={version.id === drawerRow.id} onClick={() => setDrawer((current) => ({ ...current, rowId: version.id, row: version }))}><span><strong>Version {version.versionNumber}</strong><small>{version.changeNote || "ไม่มีหมายเหตุ"}</small></span><StatusBadge status={version.status} /></button>)}</div></section>{drawerRow.status === "draft" && <div className={styles.transitionActions}><button type="button" className="btn ghost" onClick={() => setConfirm({ action: "archive", preset: drawerPreset, draft: drawerRow })} disabled={busy}><Archive size={15} /> เก็บฉบับร่าง</button><button type="button" className="btn" onClick={() => setConfirm({ action: "publish", preset: drawerPreset, draft: drawerRow })} disabled={busy || !String(drawerRow.changeNote || "").trim()} title={!String(drawerRow.changeNote || "").trim() ? "บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่" : undefined}><Send size={15} /> เผยแพร่</button></div>}</div> : null}
      </RecordDrawer>
      <ConfirmDialog open={confirm?.action === "publish"} title="ยืนยันเผยแพร่ Commercial Preset" description={`Version ${confirm?.draft?.versionNumber || "-"} จะเป็นเวอร์ชันใช้งานของ “${confirm?.draft?.title || "-"}”`} detail="Published เดิมจะถูกเก็บถาวร แต่ Quotation Production ยังไม่เปลี่ยนใน Phase 7A" confirmLabel="เผยแพร่เวอร์ชัน" busy={busy} onClose={() => setConfirm(null)} onConfirm={transition} />
      <ConfirmDialog open={confirm?.action === "archive"} title="เก็บฉบับร่างเป็นประวัติ" description={`Version ${confirm?.draft?.versionNumber || "-"} จะถูกปิดและแก้ไขต่อไม่ได้`} detail="เวอร์ชันที่เผยแพร่อยู่จะไม่เปลี่ยนแปลง" confirmLabel="เก็บฉบับร่าง" tone="danger" busy={busy} onClose={() => setConfirm(null)} onConfirm={transition} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
