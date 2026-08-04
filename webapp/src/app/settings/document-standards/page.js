"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Edit3, Expand, Eye, FileBadge2, Save, Send, Trash2 } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import AccessDenied from "@/components/ui/AccessDenied";
import Button from "@/components/ui/Button";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import Toast from "@/components/ui/Toast";
import ReadableText from "@/components/ui/ReadableText";
import { useRole } from "@/lib/roleContext";
import { accessState } from "@/lib/accessGate";
import { canManageDocumentStandards } from "@/lib/permissions";
import {
  DOCUMENT_ACCENT_KEYS,
  DOCUMENT_ACCENT_LABELS,
  DOCUMENT_STANDARD_KEYS,
  DOCUMENT_STANDARD_LABELS,
  documentStandardStatusLabel,
  formatDocumentStandardEffectiveDate,
  hasDocumentStandardChangeNote,
  numberingPatternExample,
  resolveDocumentAccentKey,
} from "@/lib/documentStandards";
import { buildQuotationMasterPreview } from "@/lib/sales/quotationMasterTemplate";
import { renderQuotationMasterDocumentHTML } from "@/lib/sales/quotationMasterDocument";
import { buildBillPrintHTML } from "@/lib/tax/billPrint";
import { buildGanttPrintHTML } from "@/lib/pm/ganttPrint";
import styles from "./page.module.css";
import Textarea from "@/components/ui/Textarea";

const EMPTY_FORM = {
  titleTh: "",
  titleEn: "",
  formCode: "",
  revision: "00",
  effectiveDate: "",
  accentKey: "terracotta",
  numberingPattern: "",
  changeNote: "",
};

// Token ที่ validateNumberingPattern รองรับ — คำอธิบายอิงตัวอย่างวันเดียวกับ
// EXAMPLE_DATE (20/07/2026) เพื่อให้เทียบกับแถว "ตัวอย่าง" ด้านล่างได้ตรง ๆ
const NUMBERING_TOKENS = [
  { token: "{YY}", hint: "ปี ค.ศ. 2 หลัก · 26" },
  { token: "{YYYY}", hint: "ปี ค.ศ. เต็ม · 2026" },
  { token: "{MM}", hint: "เดือน · 07" },
  { token: "{DD}", hint: "วัน · 20" },
  { token: "{RUNNING:4}", hint: "เลขรัน 3/4/5 หลัก" },
  { token: "{REVISION}", hint: "ฉบับแก้ไขของเลขที่" },
];

const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const formatDateTime = (value) => value ? dateTime.format(new Date(value)) : "-";
const formatEffectiveDate = formatDocumentStandardEffectiveDate;
const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";
const statusClass = (status) => status === "published" ? styles.publishedBadge : status === "draft" ? styles.draftBadge : styles.archivedBadge;

function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${statusClass(status)}`}>{documentStandardStatusLabel(status)}</span>;
}

function versionForm(row) {
  const form = Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, row?.[key] ?? EMPTY_FORM[key]]));
  // มาตรฐานเวอร์ชันเก่าอาจถือ accent ที่เลิกให้เลือกแล้ว (teal/amber/green/navy) — ถ้าปล่อย
  // ค่านั้นค้างในฟอร์ม ตัวเลือกสีจะไม่มีปุ่มไหนติด แล้วกดบันทึกจะโดนตีกลับว่า Accent
  // ไม่ถูกต้องโดยผู้ใช้ไม่รู้ว่าต้องแก้อะไร
  form.accentKey = resolveDocumentAccentKey(row, row?.documentKey);
  return form;
}

const sameForm = (a, b) => Object.keys(EMPTY_FORM).every((key) => String(a?.[key] ?? "") === String(b?.[key] ?? ""));

// การ์ดที่มีหัวข้อของหน้านี้ (ฟอร์มแก้ไข / ประวัติเวอร์ชัน) — ประกอบที่เดียวเพราะ
// เป็นพื้นผิวเดียวกัน แค่คนละเนื้อหา
const cardPanel = `glass-panel ${styles.panel}`;

function AccentMark({ accentKey, label = true, className = "" }) {
  return (
    <span className={`${styles.accentMark} ${className}`.trim()}>
      <span className={`${styles.swatch} ${styles[accentKey] || styles.terracotta}`} aria-hidden="true" />
      {label && <span>{DOCUMENT_ACCENT_LABELS[accentKey] || accentKey}</span>}
    </span>
  );
}

// โครงการตัวอย่างของพรีวิวเอกสารไทม์ไลน์ — วันที่ชุดเดียวกับตัวอย่างเลขที่ (20/07/2569)
// timelineDocBase เว้นว่างไว้ตั้งใจ: พรีวิวโชว์เลขที่ "ตอนออก" (Rev 0) ตรงตามรูปแบบที่
// กำลังแก้อยู่ ไม่ต้องประกอบเลข Rev ใหม่
const timelinePreviewProject = (standard) => ({
  id: "timeline-preview",
  code: "PJ-26070001",
  rev: 0,
  timelineDocBase: "",
  timelineDocNumber: numberingPatternExample(standard?.numberingPattern, "0") || "PT-26070001-0",
  name: "น้ำหอม Eau de Parfum 50 ml",
  productName: "น้ำหอม Eau de Parfum 50 ml",
  customerName: "บริษัท ตัวอย่าง จำกัด",
  aeOwner: "ตัวอย่าง ผู้ดูแล",
  preparedBy: "ตัวอย่าง ผู้ประสานงาน",
  aeSupervisor: "ตัวอย่าง ผู้ตรวจสอบ",
  startDate: "2026-07-20",
  dueDate: "2026-09-14",
  categoryFallback: "น้ำหอม / Eau de Parfum",
  metadata: { brand: "EXAMPLE", quotationNumber: "QT-26070001-0", poNumber: "PO-2607-001" },
  projectProducts: [],
  tasks: [
    { id: "t1", phase: "เตรียมงาน", name: "ยืนยันบรีฟและกลิ่นตัวอย่าง", role: "AC", status: "Completed", startDate: "2026-07-20", finishDate: "2026-07-31" },
    { id: "t2", phase: "เตรียมงาน", name: "อนุมัติสูตร", role: "RD", status: "Completed", startDate: "2026-08-01", finishDate: "2026-08-07", isMilestone: true },
    { id: "t3", phase: "ผลิต", name: "สั่งวัสดุบรรจุ", role: "PC", status: "In Progress", startDate: "2026-08-08", finishDate: "2026-08-28" },
    { id: "t4", phase: "ผลิต", name: "ผลิตและบรรจุ", role: "PD", status: "Pending", startDate: "2026-08-29", finishDate: "2026-09-14" },
  ],
});

// พรีวิวเอกสารจริง — เรนเดอร์ด้วยเครื่องยนต์ตัวเดียวกับที่พิมพ์/ตรึง (ไม่ใช่กล่อง CSS
// จำลองแบบเดิมที่โชว์คนละสีคนละสัดส่วนกับใบจริง) ป้อนค่าจาก "ร่างที่กำลังแก้" เข้าไป
// จึงเห็นผลของสิ่งที่พิมพ์อยู่ทันที
function LiveDocumentPreview({ documentKey, standard, className = "" }) {
  const html = useMemo(() => {
    if (documentKey === "projectTimeline") {
      // ส่งมาตรฐานเป็น activeStandard (ไม่ใช่ timelineStandardSnapshot บนตัวอย่าง)
      // เพื่อให้ร่างที่กำลังแก้มีผลกับพรีวิวทันที
      return buildGanttPrintHTML(timelinePreviewProject(standard), null, standard);
    }
    if (documentKey === "exciseTaxNotice") {
      return buildBillPrintHTML({
        id: "TAX-PREVIEW",
        taxNoticeNumber: numberingPatternExample(standard?.numberingPattern, "0") || "ET-26070001-0",
        taxNoticeStandardSnapshot: standard,
        quotationRef: "QT-26070001-0",
        poReference: "SO-26070001-0",
        customerName: "บริษัท ตัวอย่าง จำกัด",
        customerTaxId: "0100000000001",
        createdAt: "2026-07-20T09:00:00+07:00",
        deliveryDate: "2026-08-20",
        items: [{
          id: "preview-line-1",
          quantity: 100,
          totalTax: 880,
          product: {
            fgCode: "PF-EDP-050-001",
            brand: "EXAMPLE",
            productDescription: "น้ำหอม Eau de Parfum 50 ml",
            retailPriceIncVat: 107,
            retailPriceExVat: 100,
          },
        }],
      }, {
        name: "บริษัท ตัวอย่าง จำกัด",
        taxId: "0100000000001",
        address: "กรุงเทพมหานคร",
      });
    }
    const model = buildQuotationMasterPreview("standard", "approved", "v4", documentKey, { standard });
    return renderQuotationMasterDocumentHTML(model, { toolbar: false });
  }, [documentKey, standard]);
  return (
    <iframe
      className={`${styles.livePreview} ${className}`.trim()}
      title={`ตัวอย่าง${DOCUMENT_STANDARD_LABELS[documentKey] || "เอกสาร"}`}
      srcDoc={html}
    />
  );
}

function DocumentStandardFields({ form, setForm }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <>
      <section className={styles.formSection}>
        <h4>ตัวตนของเอกสารควบคุม</h4>
        {/* ป้ายอยู่ใน <span> เสมอ — label เป็น flex column ถ้าปล่อยข้อความลอย
            ดอกจัน <b>*</b> จะกลายเป็น flex item ของตัวเองแล้วตกลงไปคนละบรรทัดกับป้าย */}
        <div className={styles.formGrid}>
          <label className={styles.full}><span>ชื่อเอกสารภาษาไทย <b>*</b></span><input className="premium-input" value={form.titleTh} onChange={(event) => update("titleTh", event.target.value)} required maxLength={150} /></label>
          <label className={styles.full}><span>ชื่อเอกสารภาษาอังกฤษ</span><input className="premium-input" value={form.titleEn} onChange={(event) => update("titleEn", event.target.value)} maxLength={150} /></label>
          <div className={styles.formTriple}>
            <label><span>รหัสแบบฟอร์ม <b>*</b></span><input className="premium-input mono" value={form.formCode} onChange={(event) => update("formCode", event.target.value)} required maxLength={40} placeholder="FM-SA-01" /></label>
            <label><span>Revision <b>*</b></span><input className="premium-input mono" value={form.revision} onChange={(event) => update("revision", event.target.value)} required maxLength={20} placeholder="00" /></label>
            <label><span>วันที่มีผล <b>*</b></span><input className="premium-input" type="date" value={form.effectiveDate} onChange={(event) => update("effectiveDate", event.target.value)} required /></label>
          </div>
        </div>
      </section>
      <section className={styles.formSection}>
        <h4>สี Accent ของเอกสาร</h4>
        <div className={styles.accentPicker} role="group" aria-label="สี Accent ของเอกสาร">
          {DOCUMENT_ACCENT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`${styles.accentOption} ${styles[key] || styles.terracotta}`}
              aria-pressed={form.accentKey === key}
              onClick={() => update("accentKey", key)}
            >
              <span className={styles.swatch} aria-hidden="true" />
              <span>{DOCUMENT_ACCENT_LABELS[key]}</span>
            </button>
          ))}
        </div>
      </section>
      <section className={styles.formSection}>
        <h4>รูปแบบเลขที่เอกสาร</h4>
        <label><span>Numbering pattern <b>*</b></span><input className="premium-input mono" value={form.numberingPattern} onChange={(event) => update("numberingPattern", event.target.value)} required maxLength={120} placeholder="QT-{YY}{MM}{RUNNING:4}-{REVISION}" /></label>
        <div className={styles.tokenLegend}>
          {NUMBERING_TOKENS.map((item) => <span key={item.token}><code className="mono">{item.token}</code>{item.hint}</span>)}
        </div>
        <ul className={styles.patternRules}>
          <li>{"{REVISION}"} ต้องปิดท้ายเสมอ — เป็นฉบับแก้ไขของ <strong>เลขที่เอกสาร</strong> คนละตัวกับ Revision ของรหัสแบบฟอร์ม</li>
          <li>ต้องมี {"{MM}"} และ {"{YY}"} หรือ {"{YYYY}"} เพราะตัวนับเลขรันรีเซ็ตทุกเดือน</li>
          <li><strong>เผยแพร่แล้วมีผลกับใบที่ออกใหม่เท่านั้น</strong> เลขของใบเดิมไม่ถูกเขียนทับ</li>
        </ul>
        <div className={styles.numberExample}><span>ตัวอย่าง</span><strong className="mono">{numberingPatternExample(form.numberingPattern, "0") || "-"}</strong></div>
      </section>
      <section className={styles.formSection}>
        <h4>หลักฐานการเปลี่ยนแปลง</h4>
        <label><span>หมายเหตุการเปลี่ยนแปลง <b>*</b></span><Textarea value={form.changeNote} onChange={(event) => update("changeNote", event.target.value)} required maxLength={500} placeholder="ระบุเหตุผลหรือรายการมาตรฐานที่เปลี่ยน" /></label>
      </section>
    </>
  );
}

export default function DocumentStandardsPage() {
  const role = useRole();
  const canManage = canManageDocumentStandards(role);
  const [standards, setStandards] = useState([]);
  const [selectedKey, setSelectedKey] = useState(DOCUMENT_STANDARD_KEYS[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // แก้ไข = โหมดของ "ทั้งหน้า" ไม่ใช่ลิ้นชัก — พรีวิวด้านบนต้องเห็นค่าที่กำลังพิมพ์สด ๆ
  const [editRow, setEditRow] = useState(null);
  const [viewRow, setViewRow] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const selectedStandard = useMemo(
    () => standards.find((standard) => standard.documentKey === selectedKey) || null,
    [selectedKey, standards],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/document-standards", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดมาตรฐานเอกสารไม่สำเร็จ");
      setStandards(Array.isArray(payload.standards) ? payload.standards : []);
    } catch (loadError) {
      setError(loadError.message || "โหลดมาตรฐานเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  };

  const openEdit = (row) => {
    if (!row) return;
    setForm(versionForm(row));
    setViewRow(null);
    setEditRow(row);
  };

  const createDraft = async () => {
    setBusy(true);
    try {
      const draft = await request(`/api/document-standards/${selectedKey}/draft`, { method: "POST" }, "สร้างฉบับร่างไม่สำเร็จ");
      setToast({ kind: "success", msg: `สร้าง ${DOCUMENT_STANDARD_LABELS[selectedKey]} Version ${draft.versionNumber} ฉบับร่างแล้ว` });
      await load();
      openEdit(draft);
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (event) => {
    event.preventDefault();
    if (!editRow) return;
    setBusy(true);
    try {
      const saved = await request(`/api/document-standards/draft/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expectedUpdatedAt: editRow.updatedAt }),
      }, "บันทึกฉบับร่างไม่สำเร็จ");
      setEditRow(null);
      setToast({ kind: "success", msg: `บันทึก ${saved.formCode} Version ${saved.versionNumber} แล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const transitionDraft = async () => {
    const row = selectedStandard?.draft;
    if (!row || !confirm) return;
    const action = confirm.action;
    setBusy(true);
    try {
      await request(`/api/document-standards/draft/${row.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: row.updatedAt }),
      }, action === "publish" ? "เผยแพร่มาตรฐานเอกสารไม่สำเร็จ" : "ยกเลิกฉบับร่างไม่สำเร็จ");
      setConfirm(null);
      setEditRow(null);
      setToast({ kind: "success", msg: action === "publish" ? `เผยแพร่ Version ${row.versionNumber} แล้ว` : `ยกเลิก Version ${row.versionNumber} แล้ว (ลบร่างถาวร)` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  // เดิม return null = จอขาวสนิท ไม่มีทั้งคำอธิบายและทางกลับ
  const gate = accessState(role, canManage);
  if (gate === "loading") return <SkeletonRows rows={6} />;
  if (gate === "denied") {
    return (
      <AccessDenied
        icon={<FileBadge2 size={22} />}
        title="มาตรฐานเอกสาร"
        message="หน้านี้สำหรับหัวหน้าฝ่ายขายและผู้ดูแลระบบเท่านั้น"
        back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}
      />
    );
  }

  const published = selectedStandard?.published;
  const draft = selectedStandard?.draft;
  const versions = selectedStandard?.versions || [];
  const editing = !!editRow;
  const dirty = editing && !sameForm(form, versionForm(editRow));
  // ร่างมาก่อนเสมอเพราะเป็นสิ่งที่กำลังแก้ · ระหว่างแก้ใช้ค่าในฟอร์มตรง ๆ
  // ⚠️ ต้องเป็น `form` ทั้งก้อน ไม่ใช่ออบเจ็กต์ที่ประกอบใหม่ทุกรอบเรนเดอร์ — พรีวิว
  //    memo ด้วยตัวตนของ standard ถ้าเปลี่ยนทุกเรนเดอร์ iframe จะโหลดใหม่รัว ๆ
  const previewStandard = editing ? form : (draft || published);
  // ตัวที่ "กำลังแสดง" สำหรับข้อความ/รายละเอียด — ระหว่างแก้ต้องได้เลขเวอร์ชันกับ
  // เวลาจากแถวร่างด้วย ซึ่งฟอร์มไม่มี จึงซ้อนค่าฟอร์มทับแถว (ใช้กับข้อความเท่านั้น)
  const shown = editing ? { ...editRow, ...form } : (draft || published);

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <header className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><FileBadge2 size={22} /></span> มาตรฐานเอกสาร</h1>
          <p>ควบคุมรหัสแบบฟอร์ม Revision วันที่มีผล สี Accent และรูปแบบเลขที่โดยไม่เปลี่ยนเอกสารย้อนหลัง</p>
        </div>
      </header>

      {/* แท็บกลางของระบบ (Tabs.js) — เดิมเป็นกริดปุ่มการ์ด 2×2 ที่กินพื้นที่แนวตั้ง
          เท่าการ์ดจริงทั้งที่เป็นแค่ตัวสลับมุมมอง และไม่มี roving tabindex */}
      <Tabs
        className={styles.docTabs}
        ariaLabel="ชนิดเอกสาร"
        value={selectedKey}
        onChange={(key) => { setSelectedKey(key); setEditRow(null); setViewRow(null); }}
        tabs={DOCUMENT_STANDARD_KEYS.map((key) => {
          const standard = standards.find((item) => item.documentKey === key);
          return {
            key,
            disabled: loading,
            ariaLabel: DOCUMENT_STANDARD_LABELS[key],
            label: (
              <span className={`${styles.docTab} ${selectedKey === key ? styles.docTabActive : ""}`.trim()}>
                <span>{DOCUMENT_STANDARD_LABELS[key]}</span>
                {standard?.published?.formCode ? <span className={styles.tabCode}>{standard.published.formCode}</span> : null}
                {/* จุดเหลือง = ชนิดนี้มีฉบับร่างค้างอยู่ เห็นได้โดยไม่ต้องกดเข้าไปดูทีละแท็บ */}
                {standard?.draft ? <span className={styles.draftDot} title="มีฉบับร่างค้างอยู่" /> : null}
              </span>
            ),
          };
        })}
      />

      {loading ? <SkeletonRows rows={7} /> : error ? (
        <section className={`glass-panel ${styles.errorPanel}`} role="alert"><div><AlertTriangle size={28} aria-hidden="true" /><p>{error}</p><button type="button" className="btn" onClick={load}>ลองอีกครั้ง</button></div></section>
      ) : !published ? (
        <EmptyState icon={FileBadge2}>ยังไม่มีมาตรฐานเอกสารเวอร์ชันที่เผยแพร่</EmptyState>
      ) : (
        <>
          {/* พรีวิวเอกสารจริงเต็มความกว้างอยู่บนสุด — เป็นผลลัพธ์ที่ทุกค่าบนหน้านี้ควบคุมอยู่ */}
          <section className={`glass-panel ${styles.previewPanel}`} aria-labelledby="live-preview-title">
            <header className={styles.previewHeader}>
              <div>
                <h2 id="live-preview-title">ตัวอย่างเอกสารจริง · {DOCUMENT_STANDARD_LABELS[selectedKey]}</h2>
                <p>เรนเดอร์ด้วยเครื่องยนต์เดียวกับที่พิมพ์ — สิ่งที่เห็นตรงนี้คือสิ่งที่ออกจากเครื่องพิมพ์</p>
              </div>
              {/* หน้าเต็มจอใช้เครื่องยนต์ใบเสนอราคา จึงมีเฉพาะ QT/SO — ใบภาษีและ
                  ไทม์ไลน์ดูจากพรีวิวในหน้านี้ (เรนเดอร์ด้วยเครื่องยนต์ของตัวเอง) */}
              {selectedKey === "quotation" || selectedKey === "salesOrder" ? (
                <Link className="btn ghost sm" href={`/settings/document-standards/quotation-preview?doc=${selectedKey}`}>
                  <Expand size={14} /> เปิดเต็มจอ
                </Link>
              ) : null}
            </header>
            <LiveDocumentPreview documentKey={selectedKey} standard={previewStandard} />
          </section>

          {/* แถบควบคุมใต้พรีวิว — บรรทัดเดียวบอกว่ากำลังดูเวอร์ชันอะไร ส่วนค่าทั้งชุด
              พับไว้หลังปุ่ม (เดิมกางเป็นการ์ดเต็มตลอดเวลา ดันพรีวิวกับประวัติห่างกัน)
              ปุ่มทำงานอยู่ที่นี่ที่เดียว ฟอร์มด้านล่างจึงไม่มีปุ่มบันทึกซ้ำ */}
          <section className={`glass-panel ${styles.controlBar}`}>
            <div className={styles.controlHead}>
              <button
                type="button"
                className={styles.detailsToggle}
                aria-expanded={detailsOpen}
                aria-controls="standard-details"
                onClick={() => setDetailsOpen((open) => !open)}
              >
                <ChevronDown size={16} aria-hidden="true" />
                <span className={styles.controlSummary}>
                  <strong>{shown.titleTh || DOCUMENT_STANDARD_LABELS[selectedKey]}</strong>
                  <small>Version {shown.versionNumber} · <span className="mono">{shown.formCode || "-"} · Rev.{shown.revision || "-"}</span> · มีผล {formatEffectiveDate(shown.effectiveDate)}{dirty ? " · ยังไม่บันทึก" : ""}</small>
                </span>
                <StatusBadge status={editing || draft ? "draft" : "published"} />
              </button>

              {/* ปุ่มทุกตัวผ่าน Button primitive — คลาส btn ประกอบที่เดียวในระบบ */}
              <div className={styles.controlActions}>
                {editing ? (
                  <>
                    <Button variant="quiet" onClick={() => setEditRow(null)} disabled={busy}>ยกเลิก</Button>
                    {/* form= ชี้ไปที่ฟอร์มด้านล่าง ปุ่มจึงอยู่นอกฟอร์มได้โดยยังยิง onSubmit ตัวเดิม */}
                    <Button tone="accent" type="submit" form="document-standard-form" icon={<Save size={15} />} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</Button>
                    <Button icon={<Send size={15} />} disabled title="บันทึกฉบับร่างก่อนจึงเผยแพร่ได้">เผยแพร่</Button>
                  </>
                ) : (
                  <>
                    {draft ? <Button variant="quiet" icon={<Trash2 size={15} />} onClick={() => setConfirm({ action: "discard" })} disabled={busy}>ยกเลิกร่าง</Button> : null}
                    {/* ไม่มีร่าง = สร้างร่างเบื้องหลังแล้วเปิดฟอร์มทันที (แนวเดียวกับหน้าข้อมูลบริษัท
                        — ซ่อนศัพท์ version/ร่างจากปุ่มหลัก) · มีร่างอยู่แล้ว = เปิดร่างนั้นมาแก้ต่อ */}
                    <Button tone={draft ? undefined : "accent"} icon={<Edit3 size={15} />} onClick={() => draft ? openEdit(draft) : createDraft()} disabled={busy}>แก้ไข</Button>
                    {draft ? (
                      <Button
                        tone="accent"
                        icon={<Send size={15} />}
                        onClick={() => setConfirm({ action: "publish" })}
                        disabled={busy || !hasDocumentStandardChangeNote(draft)}
                        title={hasDocumentStandardChangeNote(draft) ? undefined : "บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่"}
                      >
                        เผยแพร่
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {detailsOpen ? (
              <div id="standard-details" className={styles.details}>
                <div className={styles.detailsHead}>
                  <p className={styles.english}>{shown.titleEn || "-"}</p>
                  <AccentMark accentKey={resolveDocumentAccentKey(shown, selectedKey)} />
                </div>
                <div className={styles.metaGrid}>
                  <div><span>รหัสแบบฟอร์ม</span><strong className="mono">{shown.formCode || "-"}</strong></div>
                  <div><span>Revision</span><strong className="mono">{shown.revision || "-"}</strong></div>
                  <div><span>วันที่มีผล</span><strong>{formatEffectiveDate(shown.effectiveDate)}</strong></div>
                  <div><span>เลขที่ตัวอย่าง</span><strong className="mono">{numberingPatternExample(shown.numberingPattern, "0") || "-"}</strong></div>
                  <div className={styles.full}><span>รูปแบบเลขที่</span><strong className="mono">{shown.numberingPattern || "-"}</strong></div>
                  <div className={styles.full}><span>{shown.publishedAt ? "เผยแพร่เมื่อ" : "แก้ไขล่าสุด"}</span><strong>{formatDateTime(shown.publishedAt || shown.updatedAt)}</strong></div>
                  {published && shown !== published ? <div className={styles.full}><span>เวอร์ชันที่ใช้งานอยู่ตอนนี้</span><strong>Version {published.versionNumber} · <span className="mono">{published.formCode}</span> (เผยแพร่ {formatDateTime(published.publishedAt)})</strong></div> : null}
                </div>
              </div>
            ) : null}
          </section>

          {editing ? (
            <form id="document-standard-form" className={`${cardPanel} ${styles.editPanel}`} onSubmit={saveDraft}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>แก้ไขฉบับร่าง Version {editRow.versionNumber} · {DOCUMENT_STANDARD_LABELS[selectedKey]}</h2>
                  <p>ทุกช่องที่แก้จะเห็นผลบนตัวอย่างเอกสารด้านบนทันที — กด “บันทึก” ที่แถบด้านบน</p>
                </div>
                <StatusBadge status="draft" />
              </header>
              <div className={styles.form}>
                <p className={styles.note}>การบันทึกเปลี่ยนเฉพาะฉบับร่าง — ค่าจะมีผลกับเอกสารที่ออกใหม่เมื่อกดเผยแพร่ ส่วนใบที่ออกไปแล้วคงรหัสแบบฟอร์มเดิม</p>
                <DocumentStandardFields form={form} setForm={setForm} />
              </div>
            </form>
          ) : null}

          <section className={cardPanel} aria-labelledby="version-history-title">
            <header className={styles.panelHeader}>
              <div><h2 id="version-history-title">ประวัติเวอร์ชัน · {DOCUMENT_STANDARD_LABELS[selectedKey]}</h2><p>เวอร์ชันที่เผยแพร่แล้วลบไม่ได้ — เมื่อถูกแทนที่จะถูกซ่อนและดูย้อนหลังได้ที่นี่</p></div>
            </header>
            <TableScroll surface="embedded" className={styles.historyTableWrap}>
              <table className={`premium-table ${styles.historyTable}`}><thead><tr><th>Version</th><th>สถานะ</th><th>แบบฟอร์ม</th><th>Accent</th><th>หมายเหตุ</th><th>ผู้ดำเนินการ</th><th>วันที่</th><th aria-label="การทำงาน" /></tr></thead><tbody>
                {versions.map((row) => <tr key={row.id}><td><strong>Version {row.versionNumber}</strong><small>{row.id}</small></td><td><StatusBadge status={row.status} /></td><td><span className="mono">{row.formCode}</span><small>Rev.{row.revision}</small></td><td><AccentMark accentKey={row.accentKey} label={false} /></td><td><ReadableText text={row.changeNote} lines={3} empty="-" /></td><td>{actorOf(row)}</td><td>{formatDateTime(row.publishedAt || row.archivedAt || row.updatedAt)}</td><td><button type="button" className="btn ghost sm" onClick={() => setViewRow(row)}><Eye size={14} /> ดูรายละเอียด</button></td></tr>)}
              </tbody></table>
            </TableScroll>
            <div className={styles.historyCards}>{versions.map((row) => <article key={row.id} className={styles.historyCard}><div className={styles.cardHead}><strong>Version {row.versionNumber} · {row.formCode}</strong><StatusBadge status={row.status} /></div><ReadableText text={row.changeNote} lines={3} empty="ไม่มีหมายเหตุ" style={{ margin: "10px 0", color: "var(--text-2)", fontSize: "var(--fs-6)" }} /><small>{actorOf(row)} · {formatDateTime(row.publishedAt || row.archivedAt || row.updatedAt)}</small><button type="button" className="btn ghost" onClick={() => setViewRow(row)}><Eye size={15} /> ดูรายละเอียด</button></article>)}</div>
          </section>
        </>
      )}

      <RecordDrawer open={!!viewRow} onClose={() => setViewRow(null)} title={`${viewRow?.titleTh || "มาตรฐานเอกสาร"} Version ${viewRow?.versionNumber || "-"}`} badge={viewRow ? <StatusBadge status={viewRow.status} /> : null} footer={<button type="button" className="btn" onClick={() => setViewRow(null)}>ปิด</button>}>
        {viewRow ? (
          <div className={styles.drawerBody}>
            <LiveDocumentPreview documentKey={viewRow.documentKey || selectedKey} standard={viewRow} className={styles.previewInDrawer} />
            <section className={styles.drawerSection}><h4>ตัวตนของเอกสารควบคุม</h4><div className={styles.detailGrid}><div className={styles.full}><span>ชื่อภาษาไทย</span><strong>{viewRow.titleTh}</strong></div><div className={styles.full}><span>ชื่อภาษาอังกฤษ</span><strong>{viewRow.titleEn || "-"}</strong></div><div><span>รหัสแบบฟอร์ม</span><strong className="mono">{viewRow.formCode}</strong></div><div><span>Revision</span><strong className="mono">{viewRow.revision}</strong></div><div><span>วันที่มีผล</span><strong>{formatEffectiveDate(viewRow.effectiveDate)}</strong></div><div><span>สี Accent</span><strong><AccentMark accentKey={viewRow.accentKey} /></strong></div></div></section>
            <section className={styles.drawerSection}><h4>เลขที่เอกสาร</h4><div className={styles.detailGrid}><div className={styles.full}><span>Numbering pattern</span><strong className="mono">{viewRow.numberingPattern}</strong></div><div className={styles.full}><span>ตัวอย่าง</span><strong className="mono">{numberingPatternExample(viewRow.numberingPattern, "0")}</strong></div></div></section>
            <section className={styles.drawerSection}><h4>ประวัติเวอร์ชัน</h4><div className={styles.detailGrid}><div className={styles.full}><span>หมายเหตุ</span><ReadableText text={viewRow.changeNote} lines={4} empty="-" /></div><div><span>สร้างโดย</span><strong>{viewRow.createdByName || "ระบบ"}</strong></div><div><span>สร้างเมื่อ</span><strong>{formatDateTime(viewRow.createdAt)}</strong></div><div><span>ดำเนินการล่าสุดโดย</span><strong>{actorOf(viewRow)}</strong></div><div><span>เวลาล่าสุด</span><strong>{formatDateTime(viewRow.publishedAt || viewRow.archivedAt || viewRow.updatedAt)}</strong></div></div></section>
          </div>
        ) : null}
      </RecordDrawer>

      <ConfirmDialog open={confirm?.action === "publish"} title="ยืนยันเผยแพร่มาตรฐานเอกสาร" description={`Version ${draft?.versionNumber || "-"} จะเป็นมาตรฐานของ ${DOCUMENT_STANDARD_LABELS[selectedKey]} ที่ใช้งานอยู่`} detail="เวอร์ชันที่เผยแพร่อยู่เดิมจะถูกซ่อน (ดูย้อนหลังได้ในประวัติเวอร์ชัน)" confirmLabel="เผยแพร่เวอร์ชัน" busy={busy} onClose={() => setConfirm(null)} onConfirm={transitionDraft} />
      <ConfirmDialog open={confirm?.action === "discard"} title="ยกเลิกฉบับร่าง" description={`Version ${draft?.versionNumber || "-"} จะถูกลบถาวรและกู้คืนไม่ได้`} detail="ร่างที่ไม่เคยเผยแพร่ไม่ใช่หลักฐาน — การยกเลิกจะถูกบันทึกในประวัติการใช้งาน (Audit log) และมาตรฐานเวอร์ชันที่เผยแพร่อยู่จะไม่เปลี่ยนแปลง" confirmLabel="ยกเลิกร่างถาวร" tone="danger" busy={busy} onClose={() => setConfirm(null)} onConfirm={transitionDraft} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
