"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Edit3, Eye, FilePlus2, Plus, Send, Trash2, WalletCards } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import { useRole } from "@/lib/roleContext";
import { canManageCommercialPresets } from "@/lib/permissions";
import {
  COMMERCIAL_PRESET_KINDS,
  COMMERCIAL_PRESET_KIND_LABELS,
  COMMERCIAL_PRESET_LIMITS,
  commercialPresetStatusLabel,
  commercialPresetSummary,
  fullPaymentInstallment,
  installmentPercentTotal,
  isFullPaymentPlan,
} from "@/lib/commercialPresets";
import styles from "./page.module.css";

const KIND_HINTS = Object.freeze({
  payment: "วิธีชำระ รายละเอียด และตารางงวด — คนทำใบเลือกทีละชุด",
  remarks: "ข้อความหมายเหตุที่พิมพ์บนใบเสนอราคา เช่น หมายเหตุ SCENT / NPD",
});

const EMPTY_FORM = Object.freeze({
  title: "",
  paymentMethod: "",
  paymentTerms: "",
  remarks: "",
  installments: [],
  changeNote: "",
});

const EMPTY_INSTALLMENT = { label: "", percent: "", trigger: "", dueRule: "", note: "" };
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const formatDateTime = (value) => value ? dateTime.format(new Date(value)) : "-";
const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";

function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${styles[status] || styles.draft}`}>{commercialPresetStatusLabel(status)}</span>;
}

function formFrom(row) {
  return {
    title: row?.title || "",
    paymentMethod: row?.paymentMethod || "",
    paymentTerms: row?.paymentTerms || "",
    remarks: row?.remarks || "",
    installments: Array.isArray(row?.installments) && row.installments.length
      ? row.installments.map((item) => ({ ...item, percent: String(item.percent) }))
      : [{ ...fullPaymentInstallment(), percent: "100" }],
    changeNote: row?.changeNote || "",
  };
}

// ตารางงวดมีเสมอ: ปิดสวิตช์ = 1 แถว 100% (แก้ได้เฉพาะชื่อ/เงื่อนไข/หมายเหตุ)
function InstallmentEditor({ rows, setRows }) {
  const split = rows.length > 1;
  const total = installmentPercentTotal(rows);
  const update = (index, field, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  const toggleSplit = () => setRows((current) => split
    ? [{ ...current[0], label: current[0]?.label || "ชำระเต็มจำนวน", percent: "100" }]
    : [{ ...current[0], label: current[0]?.label || "มัดจำ", percent: "50" }, { ...EMPTY_INSTALLMENT, label: "งวดสุดท้าย", percent: "50" }]);

  return (
    <section className={styles.formSection}>
      <div className={styles.sectionTitle}>
        <div>
          <h4>ตารางงวดชำระ</h4>
          <p>{split ? `แบ่งได้ถึง ${COMMERCIAL_PRESET_LIMITS.installmentCount} งวด ผลรวมต้องเท่ากับ 100%` : "ชำระเต็มจำนวน = 1 งวด 100% (ยังกรอกเงื่อนไข/กำหนดชำระได้)"}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={split}
          className={`${styles.planToggle} ${split ? styles.on : ""}`.trim()}
          onClick={toggleSplit}
        >
          <span className={styles.track}><span /></span>
          <b>แบ่งชำระเป็นงวด</b>
        </button>
      </div>

      <div className={styles.installmentList}>
        {rows.map((row, index) => (
          <article key={index} className={styles.installmentCard}>
            <header>
              <strong>{split ? `งวดที่ ${index + 1}` : "การชำระ"}</strong>
              {split && rows.length > 2 && (
                <button type="button" className="btn-icon danger" aria-label={`ลบงวดที่ ${index + 1}`} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button>
              )}
            </header>
            <div className={styles.formGrid}>
              <label>ชื่อรายการ <b>*</b><input className="premium-input" required maxLength={COMMERCIAL_PRESET_LIMITS.installmentLabel} value={row.label} onChange={(event) => update(index, "label", event.target.value)} /></label>
              <label>เปอร์เซ็นต์ <b>*</b><input className="premium-input" required type="number" min="0.01" max="100" step="0.01" value={row.percent} disabled={!split} onChange={(event) => update(index, "percent", event.target.value)} /></label>
              <label className={styles.full}>เงื่อนไขเริ่มชำระ<input className="premium-input" maxLength={COMMERCIAL_PRESET_LIMITS.installmentRule} value={row.trigger || ""} placeholder="เช่น เมื่อยืนยันคำสั่งซื้อ" onChange={(event) => update(index, "trigger", event.target.value)} /></label>
              <label className={styles.full}>กำหนดชำระ<input className="premium-input" maxLength={COMMERCIAL_PRESET_LIMITS.installmentRule} value={row.dueRule || ""} placeholder="เช่น ภายใน 7 วัน" onChange={(event) => update(index, "dueRule", event.target.value)} /></label>
              <label className={styles.full}>หมายเหตุ<input className="premium-input" maxLength={COMMERCIAL_PRESET_LIMITS.installmentNote} value={row.note || ""} onChange={(event) => update(index, "note", event.target.value)} /></label>
            </div>
          </article>
        ))}
        {split && (
          <>
            <button type="button" className="btn sm" onClick={() => setRows((current) => [...current, { ...EMPTY_INSTALLMENT }])} disabled={rows.length >= COMMERCIAL_PRESET_LIMITS.installmentCount}><Plus size={14} /> เพิ่มงวด</button>
            <div className={`${styles.total} ${Math.abs(total - 100) <= 0.001 ? styles.valid : styles.invalid}`}><span>รวม</span><strong>{total.toFixed(2)}%</strong></div>
          </>
        )}
      </div>
    </section>
  );
}

function PresetFields({ kind, form, setForm }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <>
      <section className={styles.formSection}>
        <h4>{kind === "payment" ? "ชุดการชำระ" : "ชุดหมายเหตุ"}</h4>
        <label>ชื่อชุด <b>*</b>
          <input className="premium-input" required maxLength={COMMERCIAL_PRESET_LIMITS.title} value={form.title} placeholder={kind === "payment" ? "เช่น โอน · เครดิต 30 วัน" : "เช่น หมายเหตุ SCENT"} onChange={(event) => update("title", event.target.value)} />
        </label>
        <p className={styles.help}>ชื่อนี้คือสิ่งที่คนทำใบเสนอราคาเห็นใน dropdown ตั้งให้อ่านแล้วรู้ทันทีว่าใช้ตอนไหน</p>
        {kind === "payment" ? (
          <div className={styles.formGrid}>
            <label className={styles.full}>วิธีชำระเงิน <b>*</b><input className="premium-input" required maxLength={COMMERCIAL_PRESET_LIMITS.paymentMethod} value={form.paymentMethod} placeholder="เช่น โอนเงินเข้าบัญชีบริษัท" onChange={(event) => update("paymentMethod", event.target.value)} /></label>
            <label className={styles.full}>รายละเอียดการชำระ<textarea className="textarea-premium" rows={4} maxLength={COMMERCIAL_PRESET_LIMITS.paymentTerms} value={form.paymentTerms} placeholder="เช่น ธนาคารกสิกรไทย เลขที่บัญชี xxx-x-xxxxx-x · เครดิต 30 วันนับจากวันส่งมอบ" onChange={(event) => update("paymentTerms", event.target.value)} /></label>
          </div>
        ) : (
          <label>รายละเอียดหมายเหตุ <b>*</b><textarea className="textarea-premium" rows={8} maxLength={COMMERCIAL_PRESET_LIMITS.remarks} value={form.remarks} placeholder="ข้อความที่จะพิมพ์ในช่องหมายเหตุของใบเสนอราคา" onChange={(event) => update("remarks", event.target.value)} /></label>
        )}
      </section>
      {kind === "payment" && (
        <InstallmentEditor
          rows={form.installments}
          setRows={(updater) => setForm((current) => ({ ...current, installments: typeof updater === "function" ? updater(current.installments) : updater }))}
        />
      )}
      <section className={styles.formSection}>
        <h4>หลักฐานการเปลี่ยนแปลง</h4>
        <label>หมายเหตุการเปลี่ยนแปลง <b>* ก่อนเผยแพร่</b><textarea className="textarea-premium" maxLength={COMMERCIAL_PRESET_LIMITS.changeNote} value={form.changeNote} placeholder="ระบุเหตุผลหรือสิ่งที่เปลี่ยน" onChange={(event) => update("changeNote", event.target.value)} /></label>
      </section>
    </>
  );
}

function PresetPreview({ kind, row }) {
  const installments = Array.isArray(row?.installments) ? row.installments : [];
  return (
    <div className={styles.preview}>
      <header>
        <span>{COMMERCIAL_PRESET_KIND_LABELS[kind]?.toUpperCase()} · VERSION {row?.versionNumber || "-"}</span>
        <strong>{row?.title || "ยังไม่ระบุชื่อ"}</strong>
        <small>{commercialPresetStatusLabel(row?.status)}</small>
      </header>
      {kind === "payment" ? (
        <>
          <dl>
            <div><dt>วิธีชำระเงิน</dt><dd>{row?.paymentMethod || "-"}</dd></div>
            <div><dt>รายละเอียดการชำระ</dt><dd>{row?.paymentTerms || "-"}</dd></div>
          </dl>
          {installments.length > 0 && (
            <div className={styles.previewTable}>
              <table>
                <thead><tr><th>{isFullPaymentPlan(installments) ? "การชำระ" : "งวด"}</th><th>%</th><th>เงื่อนไข / กำหนดชำระ</th></tr></thead>
                <tbody>{installments.map((item, index) => <tr key={index}><td>{item.label}</td><td>{Number(item.percent).toFixed(2)}</td><td>{[item.trigger, item.dueRule, item.note].filter(Boolean).join(" · ") || "-"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <dl><div><dt>รายละเอียดหมายเหตุ</dt><dd>{row?.remarks || "-"}</dd></div></dl>
      )}
    </div>
  );
}

export default function CommercialPresetsPage() {
  const role = useRole();
  const canManage = canManageCommercialPresets(role);
  const [presets, setPresets] = useState([]);
  const [kind, setKind] = useState("payment");
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
      if (!response.ok) throw new Error(payload.error || "โหลดคลังเงื่อนไขการค้าไม่สำเร็จ");
      setPresets(Array.isArray(payload.presets) ? payload.presets : []);
    } catch (loadError) { setError(loadError.message || "โหลดคลังเงื่อนไขการค้าไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const visible = useMemo(() => presets.filter((preset) => preset.kind === kind), [presets, kind]);
  const countOf = useCallback((value) => presets.filter((preset) => preset.kind === value).length, [presets]);
  const drawerPreset = useMemo(() => presets.find((item) => item.id === drawer?.presetId) || drawer?.preset || null, [drawer, presets]);
  const drawerRow = drawer?.rowId ? drawerPreset?.versions?.find((item) => item.id === drawer.rowId) || drawer?.row : drawer?.row;
  const drawerKind = drawer?.kind || drawerPreset?.kind || kind;

  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  };

  const openCreate = () => { setForm(formFrom(null)); setDrawer({ mode: "create", kind }); };
  const openEdit = (preset, row) => { setForm(formFrom(row)); setDrawer({ mode: "edit", kind: preset.kind, presetId: preset.id, rowId: row.id, row }); };
  const openView = (preset, row) => setDrawer({ mode: "view", kind: preset.kind, presetId: preset.id, rowId: row.id, row });

  const submitForm = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const creating = drawer?.mode === "create";
      const payload = {
        ...form,
        kind: drawerKind,
        documentKey: "quotation",
        installments: drawerKind === "payment"
          ? form.installments.map((row) => ({ ...row, percent: Number(row.percent) }))
          : [],
      };
      const saved = await request(creating ? "/api/commercial-presets" : `/api/commercial-presets/draft/${drawerRow.id}`, {
        method: creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating ? payload : { ...payload, expectedUpdatedAt: drawerRow.updatedAt }),
      }, creating ? "สร้างชุดใหม่ไม่สำเร็จ" : "บันทึกฉบับร่างไม่สำเร็จ");
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
      setForm(formFrom(draft));
      setDrawer({ mode: "edit", kind: preset.kind, presetId: preset.id, rowId: draft.id, row: draft });
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
      }, confirm.action === "publish" ? "เผยแพร่ไม่สำเร็จ" : "ยกเลิกฉบับร่างไม่สำเร็จ");
      setConfirm(null); setDrawer(null);
      setToast({ kind: "success", msg: confirm.action === "publish" ? `เผยแพร่ Version ${confirm.draft.versionNumber} แล้ว` : `ยกเลิก Version ${confirm.draft.versionNumber} แล้ว (ลบร่างถาวร)` });
      await load();
    } catch (requestError) { setToast({ kind: "error", msg: requestError.message }); }
    finally { setBusy(false); }
  };

  if (!canManage) return null;
  const editing = drawer?.mode === "edit" || drawer?.mode === "create";
  const kindLabel = COMMERCIAL_PRESET_KIND_LABELS[kind];

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <header className="premium-header"><div className="header-content"><h1><span className="premium-header-icon"><WalletCards size={22} /></span> คลังเงื่อนไขการค้า</h1><p>ชุดการชำระและชุดหมายเหตุที่คนทำใบเสนอราคาเลือกใช้จาก dropdown</p></div></header>

      <div className={styles.notice}>
        <AlertTriangle size={17} />
        <p><strong>ชุดที่เผยแพร่พร้อมให้เลือกใช้บนใบเสนอราคาทันที</strong> คนทำใบเป็นผู้เลือกเองและแก้ทับได้เสมอ — ระบบไม่เลือกให้อัตโนมัติ · ใบที่ออกไปแล้วไม่เปลี่ยนย้อนหลัง เพราะค่าถูกคัดลอกลงใบตั้งแต่ตอนสร้าง</p>
      </div>

      <div className={styles.kindTabs} role="group" aria-label="เลือกคลัง">
        {COMMERCIAL_PRESET_KINDS.map((value) => (
          <button
            key={value}
            type="button"
            className={`${styles.kindTab} ${kind === value ? styles.active : ""}`.trim()}
            aria-pressed={kind === value}
            disabled={loading}
            onClick={() => { setKind(value); setDrawer(null); }}
          >
            <span>{COMMERCIAL_PRESET_KIND_LABELS[value]}</span>
            <small>{loading ? "กำลังโหลด…" : `${countOf(value)} ชุด`}</small>
          </button>
        ))}
      </div>

      {loading ? <SkeletonRows rows={8} /> : error ? (
        <section className={`glass-panel ${styles.error}`} role="alert"><AlertTriangle size={26} /><p>{error}</p><button type="button" className="btn" onClick={load}>ลองอีกครั้ง</button></section>
      ) : visible.length === 0 ? (
        <EmptyState icon={WalletCards}>
          ยังไม่มี{kindLabel} — {KIND_HINTS[kind]}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-accent" onClick={openCreate} disabled={busy}><FilePlus2 size={16} /> สร้าง{kindLabel}</button>
          </div>
        </EmptyState>
      ) : (
        // ปุ่มสร้าง = ปุ่มเพิ่มของรายการในการ์ด — อยู่ขวาสุดของ card header ตามกติกา Page Header
        <section className={`glass-panel ${styles.listPanel}`} aria-labelledby="preset-list-title">
          <header className={styles.panelHeader}>
            <div><h2 id="preset-list-title">{kindLabel}</h2><p>{KIND_HINTS[kind]}</p></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="ui-badge">{visible.length} ชุด</span>
              <button type="button" className="btn btn-accent" onClick={openCreate} disabled={busy}><FilePlus2 size={16} /> สร้าง{kindLabel}</button>
            </div>
          </header>

          <div className={`premium-table-wrapper ${styles.tableWrap}`}>
            <table className="premium-table">
              <thead><tr><th>ชื่อชุด</th><th>เวอร์ชัน</th><th>สรุป</th><th>อัปเดต</th><th aria-label="การทำงาน" /></tr></thead>
              <tbody>
                {visible.map((preset) => {
                  const current = preset.draft || preset.published || preset.versions?.[0];
                  return (
                    <tr key={preset.id}>
                      <td><strong>{current?.title || "ไม่มีชื่อ"}</strong></td>
                      <td>
                        <div className={styles.versionCell}>
                          {preset.published && <span>V{preset.published.versionNumber} <StatusBadge status="published" /></span>}
                          {preset.draft && <span>V{preset.draft.versionNumber} <StatusBadge status="draft" /></span>}
                          {!preset.published && !preset.draft && <span>ไม่มีเวอร์ชันใช้งาน</span>}
                        </div>
                      </td>
                      <td>{commercialPresetSummary(preset.kind, current)}</td>
                      <td>{formatDateTime(current?.updatedAt)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          {current && <button type="button" className="btn ghost sm" onClick={() => openView(preset, current)}><Eye size={14} /> ดู</button>}
                          {preset.draft
                            ? <button type="button" className="btn sm" onClick={() => openEdit(preset, preset.draft)}><Edit3 size={14} /> แก้ร่าง</button>
                            : <button type="button" className="btn sm" onClick={() => createDraft(preset)} disabled={busy}><FilePlus2 size={14} /> สร้างร่าง</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.cards}>
            {visible.map((preset) => {
              const current = preset.draft || preset.published || preset.versions?.[0];
              return (
                <article key={preset.id} className={styles.card}>
                  <header>
                    <div><strong>{current?.title || "ไม่มีชื่อ"}</strong><small>{commercialPresetSummary(preset.kind, current)}</small></div>
                    {current && <StatusBadge status={current.status} />}
                  </header>
                  <div className={styles.cardActions}>
                    {current && <button type="button" className="btn ghost" onClick={() => openView(preset, current)}><Eye size={15} /> ดู</button>}
                    {preset.draft
                      ? <button type="button" className="btn" onClick={() => openEdit(preset, preset.draft)}><Edit3 size={15} /> แก้ร่าง</button>
                      : <button type="button" className="btn" onClick={() => createDraft(preset)} disabled={busy}><FilePlus2 size={15} /> สร้างร่าง</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <RecordDrawer
        open={!!drawer}
        onClose={() => !busy && setDrawer(null)}
        closeOnOverlay={false}
        opaqueSurface
        title={drawer?.mode === "create" ? `สร้าง${COMMERCIAL_PRESET_KIND_LABELS[drawerKind]}` : drawerRow ? `${drawerRow.title} · Version ${drawerRow.versionNumber}` : COMMERCIAL_PRESET_KIND_LABELS[drawerKind]}
        subtitle={editing ? "บันทึกฉบับร่างแบบ explicit ไม่มี Auto-save" : "รายละเอียดและ Preview แบบอ่านอย่างเดียว"}
        badge={drawerRow ? <StatusBadge status={drawerRow.status} /> : null}
        footer={editing
          ? <><button type="button" className="btn ghost" onClick={() => setDrawer(null)} disabled={busy}>ยกเลิก</button><button type="submit" form="commercial-preset-form" className="btn btn-accent" disabled={busy}>{busy ? "กำลังบันทึก…" : drawer?.mode === "create" ? "สร้างฉบับร่าง" : "บันทึกฉบับร่าง"}</button></>
          : <><button type="button" className="btn" onClick={() => setDrawer(null)}>ปิด</button>{drawerPreset?.draft?.id === drawerRow?.id && <button type="button" className="btn" onClick={() => openEdit(drawerPreset, drawerRow)}><Edit3 size={15} /> แก้ไข</button>}</>}
      >
        {editing ? (
          <form id="commercial-preset-form" className={styles.form} onSubmit={submitForm}>
            <PresetFields kind={drawerKind} form={form} setForm={setForm} />
          </form>
        ) : drawerPreset && drawerRow ? (
          <div className={styles.drawerBody}>
            <PresetPreview kind={drawerKind} row={drawerRow} />
            <section className={styles.detailSection}>
              <h4>เวอร์ชันและหลักฐาน</h4>
              <dl>
                <div><dt>สถานะ</dt><dd>{commercialPresetStatusLabel(drawerRow.status)}</dd></div>
                <div><dt>ผู้ดำเนินการ</dt><dd>{actorOf(drawerRow)}</dd></div>
                <div><dt>เวลาล่าสุด</dt><dd>{formatDateTime(drawerRow.publishedAt || drawerRow.archivedAt || drawerRow.updatedAt)}</dd></div>
                <div><dt>หมายเหตุการเปลี่ยนแปลง</dt><dd>{drawerRow.changeNote || "-"}</dd></div>
              </dl>
            </section>
            <section className={styles.historySection}>
              <h4>ประวัติเวอร์ชัน</h4>
              <div>
                {drawerPreset.versions?.map((version) => (
                  <button key={version.id} type="button" className={version.id === drawerRow.id ? styles.historyActive : ""} aria-pressed={version.id === drawerRow.id} onClick={() => setDrawer((current) => ({ ...current, rowId: version.id, row: version }))}>
                    <span><strong>Version {version.versionNumber}</strong><small>{version.changeNote || "ไม่มีหมายเหตุ"}</small></span>
                    <StatusBadge status={version.status} />
                  </button>
                ))}
              </div>
            </section>
            {drawerRow.status === "draft" && (
              <div className={styles.transitionActions}>
                <button type="button" className="btn ghost" onClick={() => setConfirm({ action: "discard", preset: drawerPreset, draft: drawerRow })} disabled={busy}><Trash2 size={15} /> ยกเลิกร่าง</button>
                <button type="button" className="btn" onClick={() => setConfirm({ action: "publish", preset: drawerPreset, draft: drawerRow })} disabled={busy || !String(drawerRow.changeNote || "").trim()} title={!String(drawerRow.changeNote || "").trim() ? "บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่" : undefined}><Send size={15} /> เผยแพร่</button>
              </div>
            )}
          </div>
        ) : null}
      </RecordDrawer>

      <ConfirmDialog
        open={confirm?.action === "publish"}
        title="ยืนยันเผยแพร่"
        description={`Version ${confirm?.draft?.versionNumber || "-"} จะเป็นเวอร์ชันใช้งานของ “${confirm?.draft?.title || "-"}”`}
        detail="เวอร์ชันที่เผยแพร่อยู่เดิมจะถูกซ่อน (ดูย้อนหลังได้ในประวัติเวอร์ชัน) · ใบเสนอราคาที่สร้างหลังจากนี้จะเลือกชุดนี้ได้ ส่วนใบที่ออกไปแล้วไม่เปลี่ยน"
        confirmLabel="เผยแพร่เวอร์ชัน"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transition}
      />
      <ConfirmDialog
        open={confirm?.action === "discard"}
        title="ยกเลิกฉบับร่าง"
        description={confirm?.preset && !confirm.preset.publishedVersionId
          ? `Version ${confirm?.draft?.versionNumber || "-"} จะถูกลบถาวร และชุด “${confirm?.draft?.title || "-"}” ที่ยังไม่เคยเผยแพร่จะถูกลบทั้งตัว`
          : `Version ${confirm?.draft?.versionNumber || "-"} จะถูกลบถาวรและกู้คืนไม่ได้`}
        detail="ร่างที่ไม่เคยเผยแพร่ไม่ใช่หลักฐาน — การยกเลิกจะถูกบันทึกในประวัติการใช้งาน (Audit log) และเวอร์ชันที่เผยแพร่อยู่จะไม่เปลี่ยนแปลง"
        confirmLabel="ยกเลิกร่างถาวร"
        tone="danger"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transition}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
