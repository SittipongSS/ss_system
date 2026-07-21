"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Palette, Printer, ShieldCheck } from 'lucide-react';
import Workspace from '@/components/ui/Workspace';
import {
  QUOTATION_PREVIEW_SCENARIOS,
  QUOTATION_PREVIEW_STATES,
  buildQuotationMasterPreview,
} from '@/lib/sales/quotationMasterTemplate';
import { renderQuotationMasterDocumentHTML } from '@/lib/sales/quotationMasterDocument';
import styles from './page.module.css';

// Phase 7C (Direction B): หน้า preview เรนเดอร์ด้วย "เครื่องยนต์เอกสารตัวจริง"
// (quotationMasterDocument = Quotation Master V4) ใน iframe จึงตรงกับใบที่พิมพ์/ตรึง 100%.
// fixture model มาจาก buildQuotationMasterPreview (คณิต+จัดหน้า V4 ชุดเดียวกับใบจริง).
export default function QuotationMasterPreviewPage() {
  const [scenarioId, setScenarioId] = useState('standard');
  const [documentState, setDocumentState] = useState('approved');
  const [grayscale, setGrayscale] = useState(false);
  const frameRef = useRef(null);

  const scenario = QUOTATION_PREVIEW_SCENARIOS.find((item) => item.id === scenarioId);
  const model = useMemo(
    () => buildQuotationMasterPreview(scenarioId, documentState, 'v4'),
    [scenarioId, documentState],
  );
  const html = useMemo(
    () => renderQuotationMasterDocumentHTML(model, { grayscale, toolbar: false }),
    [model, grayscale],
  );

  // ปรับความสูง iframe ให้เท่าเนื้อหาจริง (หน้า A4 หลายหน้า) ไม่ให้มี scrollbar ซ้อน
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const resize = () => {
      try {
        const doc = frame.contentDocument;
        if (doc?.body) frame.style.height = `${doc.body.scrollHeight}px`;
      } catch { /* same-origin srcDoc — ไม่เกิด cross-origin */ }
    };
    frame.addEventListener('load', resize);
    const timer = setTimeout(resize, 300);
    return () => { frame.removeEventListener('load', resize); clearTimeout(timer); };
  }, [html]);

  function printPreview() {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }

  return (
    <div className={styles.previewPage}>
      {/* แถวย้อนกลับ + action ระดับหน้า แยกเป็น screenOnly เพื่อไม่ติดไปกับงานพิมพ์ */}
      <div className={styles.screenOnly}>
        <Workspace
          hideHeader
          back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}
          backActions={<button type="button" className="btn btn-accent" onClick={printPreview}><Printer size={16} /> พิมพ์ / Save PDF</button>}
        />
      </div>
      <div className={`premium-header ${styles.screenOnly}`}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><FileText size={22} /></span> Quotation Master Template V4</h1>
          <p>ตัวอย่างเรนเดอร์ด้วยเครื่องยนต์เอกสารตัวจริง จึงตรงกับใบที่พิมพ์และฉบับที่ตรึงไว้ 100%</p>
        </div>
      </div>

      <section className={`glass-panel ${styles.controlPanel} ${styles.screenOnly}`} aria-label="ตัวควบคุมตัวอย่างเอกสาร">
        <div className={styles.controlIntro}>
          <span className="ui-badge"><ShieldCheck size={14} /> Preview only</span>
          <strong>ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง</strong>
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
          <strong>{scenario?.label}</strong>
          <span>{scenario?.description}</span>
          <span>{model.lines.length} รายการ · {model.pages.length} หน้า · {model.installments.length} งวด</span>
        </div>
      </section>

      <section className={styles.previewStage} aria-label="ตัวอย่าง A4">
        <iframe
          ref={frameRef}
          className={styles.previewFrame}
          title="ตัวอย่างใบเสนอราคา"
          srcDoc={html}
        />
      </section>
    </div>
  );
}
