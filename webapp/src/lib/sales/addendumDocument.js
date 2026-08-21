// ── เอกสาร "บันทึกเพิ่มเติมสัญญา" — แม่แบบ + ค่าที่กรอก → HTML ────────────────
//
// ใช้ **ชิ้นส่วนเดียวกับสัญญา** ทั้งหมด: เปลือกเอกสารกลาง · CSS ของสัญญา · สคริปต์ตัดหน้า
// ที่วัดความสูงจริง · ตัวเติม token ที่ทำตัวหนาให้ข้อมูลคู่สัญญา
// ⇒ บันทึกกับสัญญาออกมาหน้าตาเป็นเอกสารชุดเดียวกัน และแก้ที่เดียวมีผลทั้งคู่
//
// ⚠️ **ห้ามก๊อป CSS/สคริปต์มาไว้ที่นี่อีกชุด** — เหตุผลเดียวกับที่หัวไฟล์เปลือกเขียนไว้
//    (เอกสารสามชนิดของบริษัทเดียวกันเคยใช้คนละฟอนต์คนละหน่วยเพราะต่างคนต่างเขียน)

import {
  documentFileName, documentHeader, esc, renderDocumentHTML, watermarkBlock,
} from '@/lib/documents/documentShell';
import { fmtDate } from '@/lib/format';
import { ADDENDUM_DOC_TITLE } from '@/lib/sales/contractAddenda';
import {
  BLANK, CONTRACT_CSS, PAGINATE_SCRIPT, contractToolbarControls, fillTokensHtml, paragraph,
  thaiContractDate, thaiShortDate,
} from '@/lib/sales/contractDocument';
import { ADDENDUM_TEMPLATE } from '@/lib/sales/contractTemplateAddendum';

/* ค่าที่แม่แบบเรียกใช้ = ข้อมูลของบันทึก + ของสัญญาแม่ + ของบริษัทเรา
   ⚠️ ข้อมูลคู่สัญญามาจาก **สัญญาแม่** ไม่ใช่พิมพ์ใหม่ — บันทึกที่เขียนคู่สัญญาไม่ตรงกับ
   สัญญาที่มันแนบท้าย คือเอกสารที่ใช้ไม่ได้ */
export function addendumTokenValues(addendum, { contract = {}, company = {} } = {}) {
  const contractFields = contract.fields || {};
  return {
    ...contractFields,
    ...(addendum?.fields || {}),
    titleTh: ADDENDUM_DOC_TITLE,
    addendumNo: addendum?.addendumNo ?? '',
    addendumDateTh: thaiContractDate(addendum?.addendumDate) || '',
    contractNo: contract.contractNo || '',
    contractDateTh: thaiContractDate(contract.contractDate) || '',
    // วันมีผลของสัญญาแม่ — ใบที่ยังไม่กรอกวันมีผลใช้วันลงนามแทน (ค่าที่ระบบมีจริง)
    effectiveDateTh: thaiContractDate(contract.effectiveDate || contract.signedDate) || '',
    contractorName: company.legalNameTh || company.nameTh || '',
    contractorRegNo: company.taxId || '',
    contractorAddress: company.address || '',
    contractorSignerName: addendum?.fields?.contractorSignerName || contractFields.contractorSignerName || '',
  };
}

function formulaTable(template, lines = []) {
  const columns = template.clauses.find((clause) => clause.table)?.table.columns || [];
  const rows = (lines || []).map((line) => `
            <tr>
              <td>${esc(line.seq)}.</td>
              <td>${esc(line.name)}</td>
              <td class="mono">${esc(line.code)}</td>
              <td>${esc(line.formulaDate ? fmtDate(line.formulaDate) : '')}</td>
            </tr>`).join('');
  return `
        <table class="formulaTable">
          <thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${columns.length}">— ยังไม่มีสูตรจากคำร้องที่อ้างถึง —</td></tr>`}</tbody>
        </table>`;
}

const ADDENDUM_CSS = `
  /* ตารางสูตรของบันทึก — โครงเดียวกับตารางรายการของใบเสนอราคา (หัวกรมท่า เส้นบาง) */
  .contract .formulaTable { width: 100%; margin-top: 3mm; border-collapse: collapse; }
  .contract .formulaTable th { padding: 2.1mm 1.5mm; color: #fff; background: var(--doc-navy);
    font-size: 8.4pt; font-weight: 600; text-align: left; }
  .contract .formulaTable td { padding: 2mm 1.5mm; border-bottom: 1px solid var(--doc-line); font-size: 8.8pt; }
  .contract .formulaTable th:first-child, .contract .formulaTable td:first-child { width: 14mm; }
  .contract .formulaTable th:nth-child(3), .contract .formulaTable td:nth-child(3) { width: 42mm; }
  .contract .formulaTable th:last-child, .contract .formulaTable td:last-child { width: 26mm; }
  /* เลขที่บันทึกยาวกว่าเลขสัญญา (ต่อท้ายด้วย -A1) ⇒ คืนที่จากคอลัมน์ป้าย ไม่งั้นเลขตกบรรทัด */
  .contract .identityBlock dl div { grid-template-columns: 28mm minmax(0, 1fr); }
  /* หัวเรื่องของบันทึกอยู่กลางหน้าเหมือนชื่อสัญญา แต่มีบรรทัดวันที่ต่อท้าย */
  /* บรรทัดวันที่ชิดขวา (มติผู้ใช้ 2026-08-21) — ต้นฉบับวางวันที่ไว้คนละแถวกับหัวเรื่อง
     ที่กลางหน้า ⇒ ชิดขวาแยกสองอย่างออกจากกันชัดกว่าวางซ้อนกลางทั้งคู่ */
  .contract .docSubtitle { margin: -4mm 0 6mm; color: var(--doc-muted); font-size: 9.5pt; text-align: right; }
`;

export function buildAddendumHTML(addendum, { contract = {}, company = {}, options = {} } = {}) {
  const template = ADDENDUM_TEMPLATE;
  const values = addendumTokenValues(addendum, { contract, company });
  const titleTh = ADDENDUM_DOC_TITLE;

  const header = documentHeader({
    company: {
      nameTh: company.legalNameTh,
      nameEn: company.legalNameEn,
      address: company.address,
      taxId: company.taxId,
      phone: company.phone,
      line: company.line,
      website: company.website,
    },
    formLine: null,
    titleTh,
    titleEn: null,
    rows: [
      { label: 'เลขที่บันทึก', value: addendum.docNo || 'ฉบับร่าง' },
      { label: 'วันที่บันทึก', value: thaiShortDate(addendum.addendumDate) },
      { label: 'แนบท้ายสัญญา', value: contract.contractNo },
      { label: 'อ้างอิงคำร้อง', value: addendum.requestDocNo },
    ],
  });

  const watermark = watermarkBlock(
    addendum.status === 'cancelled' ? 'ยกเลิก' : (!addendum.docNo ? 'ฉบับร่าง' : null),
  );

  const clauses = template.clauses.map((clause) => `
        <div class="blk clause">
          <span class="clauseNo">${esc(clause.no)}</span>
          <div>
            ${paragraph(clause.text, values)}
            ${clause.table ? formulaTable(template, addendum.lines) : ''}
          </div>
        </div>`).join('');

  const flow = `
    <article class="sheet flowSheet" aria-label="${esc(titleTh)}">
      ${watermark}
      ${header}
      <div class="sheetContent">
        <div class="contractBody">
          <h1 class="blk docTitle" data-keep-next="1">${esc(fillTokensHtml(template.heading, values).replace(/<[^>]+>/g, ''))}</h1>
          <p class="blk docSubtitle" data-keep-next="1">${esc(fillTokensHtml(template.headingDate, values).replace(/<[^>]+>/g, ''))}</p>
          ${template.intro.map((text) => `<div class="blk intro">${paragraph(text, values)}</div>`).join('')}
          ${clauses}
          <section class="blk signPage">
            ${template.closing.map((text) => `<div class="closing">${paragraph(text, values)}</div>`).join('')}
            <section class="signGrid" aria-label="ส่วนลงนาม">
              ${template.signatures.map((sig) => {
    const name = fillTokensHtml(sig.name || '', values).replace(/<[^>]+>/g, '');
    const org = fillTokensHtml(sig.org || '', values).replace(/<[^>]+>/g, '');
    const title = fillTokensHtml(sig.title || '', values).replace(/<[^>]+>/g, '');
    return `
              <div class="signBox">
                <div class="signLine">ลงชื่อ ......................................................</div>
                <div class="signName">( ${esc(!name || name === BLANK ? '......................................................' : name)} )</div>
                <div class="signRole">${esc(sig.role)}</div>
                ${title && title !== BLANK ? `<div class="signMeta">${esc(title)}</div>` : ''}
                ${org && org !== BLANK ? `<div class="signMeta">${esc(org)}</div>` : ''}
              </div>`;
  }).join('')}
            </section>
          </section>
        </div>
      </div>
    </article>`;

  const footerMeta = JSON.stringify({
    company: company.legalNameTh || '',
    number: addendum.docNo ? `เลขที่ ${addendum.docNo}` : 'ฉบับร่าง',
    title: titleTh,
  });

  return renderDocumentHTML({
    title: documentFileName(addendum.docNo || 'ร่างบันทึกเพิ่มเติม', contract.customerName, contract.metadata?.dealTitle),
    accentKey: 'terracotta',
    variantClass: 'contract',
    dataAttrs: ` data-footer='${esc(footerMeta).replace(/'/g, '&#39;')}'`,
    extraCss: CONTRACT_CSS + ADDENDUM_CSS,
    toolbar: options.toolbar === false ? null : {
      label: `${titleTh} ${addendum.docNo || '(ฉบับร่าง)'}`,
      button: 'พิมพ์เอกสาร',
      controlsHtml: contractToolbarControls(),
    },
    pages: flow,
    script: PAGINATE_SCRIPT,
  });
}
