"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileText, Palette, Printer, ShieldCheck } from 'lucide-react';
import QuotationMasterDocument from '@/components/documents/QuotationMasterDocument';
import {
  DEFAULT_QUOTATION_MASTER_VARIANT,
  QUOTATION_MASTER_TEMPLATE_VERSIONS,
  QUOTATION_PREVIEW_SCENARIOS,
  QUOTATION_PREVIEW_STATES,
  buildQuotationMasterPreview,
} from '@/lib/sales/quotationMasterTemplate';
import styles from './page.module.css';

export default function QuotationMasterPreviewPage() {
  const [scenarioId, setScenarioId] = useState('standard');
  const [documentState, setDocumentState] = useState('approved');
  const [templateVariant, setTemplateVariant] = useState(DEFAULT_QUOTATION_MASTER_VARIANT);
  const [grayscale, setGrayscale] = useState(false);
  const model = useMemo(
    () => buildQuotationMasterPreview(scenarioId, documentState, templateVariant),
    [scenarioId, documentState, templateVariant],
  );
  const scenario = QUOTATION_PREVIEW_SCENARIOS.find((item) => item.id === scenarioId);
  const selectedTemplate = QUOTATION_MASTER_TEMPLATE_VERSIONS.find((item) => item.id === templateVariant);

  async function printPreview() {
    await document.fonts.ready;
    window.print();
  }

  return (
    <div className={styles.previewPage}>
      <div className={`premium-header ${styles.screenOnly}`}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><FileText size={22} /></span> Quotation Master Template</h1>
          <p>ตัวอย่าง Balanced Controlled สำหรับตรวจ Layout ก่อนเชื่อม Production Document Engine ใน Phase 7</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/settings" className="btn ghost"><ChevronLeft size={16} /> กลับหน้าตั้งค่า</Link>
          <button type="button" className="btn btn-accent" onClick={printPreview}><Printer size={16} /> พิมพ์ / Save PDF</button>
        </div>
      </div>

      <section className={`glass-panel ${styles.controlPanel} ${styles.screenOnly}`} aria-label="ตัวควบคุมตัวอย่างเอกสาร">
        <div className={styles.controlIntro}>
          <span className="ui-badge"><ShieldCheck size={14} /> Preview only</span>
          <strong>Production Template ยังไม่เปลี่ยน</strong>
          <p>ข้อมูลทั้งหมดเป็น Fixture และไม่มีการอ่านหรือเขียนข้อมูลลูกค้าจริง</p>
        </div>

        <div className={styles.controls}>
          <label className="form-group">
            <span>กรณีทดสอบ</span>
            <select className="premium-select" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              {QUOTATION_PREVIEW_SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>

          <div className="form-group">
            <span>รูปแบบแม่แบบ</span>
            <div className="segmented" aria-label="เวอร์ชันแม่แบบ">
              {QUOTATION_MASTER_TEMPLATE_VERSIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={templateVariant === item.id}
                  className={templateVariant === item.id ? 'active' : ''}
                  onClick={() => setTemplateVariant(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <span>สถานะเอกสาร</span>
            <div className="segmented" aria-label="สถานะเอกสารตัวอย่าง">
              {QUOTATION_PREVIEW_STATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={documentState === item.id}
                  className={documentState === item.id ? 'active' : ''}
                  onClick={() => setDocumentState(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <span>โหมดสี</span>
            <div className="segmented" aria-label="โหมดสีตัวอย่าง">
              <button type="button" aria-pressed={!grayscale} className={!grayscale ? 'active' : ''} onClick={() => setGrayscale(false)}><Palette size={14} /> สี</button>
              <button type="button" aria-pressed={grayscale} className={grayscale ? 'active' : ''} onClick={() => setGrayscale(true)}>ขาวดำ</button>
            </div>
          </div>
        </div>

        <div className={styles.scenarioSummary} aria-live="polite">
          <strong>{selectedTemplate?.label} · {scenario?.label}</strong>
          <span>{scenario?.description}</span>
          <span>{model.lines.length} รายการ · {model.pages.length} หน้า · {model.installments.length} งวด</span>
        </div>
      </section>

      <section className={styles.previewStage} aria-label="ตัวอย่าง A4">
        <QuotationMasterDocument model={model} grayscale={grayscale} />
      </section>
    </div>
  );
}
