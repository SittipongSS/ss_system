"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Palette, Printer, ShieldCheck } from 'lucide-react';
import Workspace from '@/components/ui/Workspace';
import {
  DOCUMENT_STANDARD_KEYS,
  DOCUMENT_STANDARD_LABELS,
  documentStandardFormLine,
} from '@/lib/documentStandards';
import {
  SCENARIO_DOCUMENT_KEYS,
  buildStandardPreviewHTML,
  standardPreviewModel,
} from '@/lib/documents/standardPreview';
import { QUOTATION_PREVIEW_SCENARIOS, QUOTATION_PREVIEW_STATES } from '@/lib/sales/quotationMasterTemplate';
import styles from './page.module.css';

// หน้าพรีวิวเต็มจอของมาตรฐานเอกสาร — เรนเดอร์ด้วย "เครื่องยนต์เอกสารตัวจริง" ใน iframe
// จึงตรงกับใบที่พิมพ์/ตรึง 100%
//
// 🐞 เดิมหน้านี้ชื่อ `quotation-preview` และรู้จักแค่เครื่องยนต์ใบเสนอราคา ⇒ ปุ่ม
// "เปิดเต็มจอ" บนหน้ามาตรฐานเอกสารจึงโผล่ได้แค่ QT/SO อีกสามชนิดดูเต็มจอไม่ได้เลย
// (ผู้ใช้ทักเอง) · ตอนนี้เลือกเครื่องยนต์ผ่าน `buildStandardPreviewHTML` ตัวเดียวกับ
// พรีวิวย่อในหน้าตั้งค่า ⇒ ครบทุกชนิด และเพิ่มชนิดใหม่แก้ที่เดียว
//
// ⚠️ **โหลดมาตรฐานที่เผยแพร่จริงมาด้วย** — ไม่งั้นหน้าเต็มจอจะโชว์รหัสฟอร์ม/Rev จาก
// ค่าสำรอง ซึ่งเพี้ยนจากพรีวิวย่อที่ป้อนแถวจริงเข้าไป แล้วสองที่บอกคนละอย่าง
export default function DocumentStandardPreviewPage() {
  const searchParams = useSearchParams();
  const requested = searchParams.get('doc');
  const documentKey = DOCUMENT_STANDARD_KEYS.includes(requested) ? requested : 'quotation';
  const hasScenarios = SCENARIO_DOCUMENT_KEYS.includes(documentKey);

  const [standard, setStandard] = useState(null);
  const [scenarioId, setScenarioId] = useState('standard');
  const [documentState, setDocumentState] = useState('approved');
  const [grayscale, setGrayscale] = useState(false);
  const frameRef = useRef(null);

  // ⚠️ ร่างที่ยังไม่เผยแพร่ **ไม่เอา** — หน้านี้เปิดจากลิงก์ ไม่ได้ผูกกับฟอร์มที่กำลังแก้
  // จึงต้องโชว์ "ของที่ใช้งานอยู่จริง" ไม่ใช่ของที่ยังไม่ได้ตัดสินใจ
  const loadStandard = useCallback(async () => {
    try {
      const response = await fetch('/api/document-standards', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const row = (data.standards || []).find((item) => item.documentKey === documentKey);
      setStandard(row?.published || null);
    } catch {
      // โหลดไม่ได้ = พรีวิวตกไปใช้ค่าสำรองของเอกสารชนิดนั้น ซึ่งยังเรนเดอร์ได้
    }
  }, [documentKey]);

  useEffect(() => { loadStandard(); }, [loadStandard]);

  const scenario = QUOTATION_PREVIEW_SCENARIOS.find((item) => item.id === scenarioId);
  const model = useMemo(
    () => standardPreviewModel(documentKey, standard, { scenarioId, documentState }),
    [documentKey, standard, scenarioId, documentState],
  );
  const html = useMemo(
    () => buildStandardPreviewHTML(documentKey, standard, { grayscale, scenarioId, documentState }),
    [documentKey, standard, grayscale, scenarioId, documentState],
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

  const label = DOCUMENT_STANDARD_LABELS[documentKey] || 'เอกสาร';

  return (
    <div className={styles.previewPage}>
      {/* แถวย้อนกลับ + action ระดับหน้า แยกเป็น screenOnly เพื่อไม่ติดไปกับงานพิมพ์ */}
      <div className={styles.screenOnly}>
        <Workspace
          hideHeader
          back={{ href: "/settings/document-standards", label: "กลับหน้ามาตรฐานเอกสาร" }}
          backActions={<button type="button" className="btn btn-accent" onClick={printPreview}><Printer size={16} /> พิมพ์ / Save PDF</button>}
        />
      </div>
      <div className={`premium-header ${styles.screenOnly}`}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><FileText size={22} /></span> {label}</h1>
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
          {/* ⚠️ กรณีทดสอบ/สถานะ มีเฉพาะเครื่องยนต์ใบเสนอราคา — อีกสามชนิดมีใบตัวอย่าง
              ชุดเดียว โชว์ตัวควบคุมที่กดแล้วไม่เกิดอะไรจะหลอกคนใช้ */}
          {hasScenarios ? (
            <>
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
            </>
          ) : null}

          {/* ⚠️ ขาวดำมีผลเฉพาะเครื่องยนต์ใบเสนอราคา (รับธง grayscale) — อีกสามชนิด
              เปลือกเอกสารไม่ได้รับธงนี้ จึงไม่โชว์ปุ่มที่กดแล้วไม่เกิดอะไร */}
          {hasScenarios ? (
            <div className="form-group">
              <span>โหมดสี</span>
              <div className="segmented" aria-label="โหมดสีตัวอย่าง">
                <button type="button" aria-pressed={!grayscale} className={!grayscale ? 'active' : ''} onClick={() => setGrayscale(false)}><Palette size={14} /> สี</button>
                <button type="button" aria-pressed={grayscale} className={grayscale ? 'active' : ''} onClick={() => setGrayscale(true)}>ขาวดำ</button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.scenarioSummary} aria-live="polite">
          <strong>{hasScenarios ? scenario?.label : label}</strong>
          <span>{hasScenarios ? scenario?.description : 'ใบตัวอย่างชุดเดียว — ปรับค่าได้ที่หน้ามาตรฐานเอกสาร'}</span>
          <span>
            {standard ? documentStandardFormLine(standard) : 'ยังไม่มีเวอร์ชันที่เผยแพร่ — ใช้ค่าสำรองของเอกสารชนิดนี้'}
            {model ? ` · ${model.lines.length} รายการ · ${model.pages.length} หน้า · ${model.installments.length} งวด` : ''}
          </span>
        </div>
      </section>

      <section className={styles.previewStage} aria-label="ตัวอย่าง A4">
        <iframe
          ref={frameRef}
          className={styles.previewFrame}
          title={`ตัวอย่าง${label}`}
          srcDoc={html}
        />
      </section>
    </div>
  );
}
