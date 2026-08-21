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
  /* เว้นใต้ตารางก่อนข้อถัดไป — ข้อ 2 ชิดขอบตารางจนอ่านเหมือนเป็นคำอธิบายของตาราง
     (ระยะระหว่างบล็อก 3.5mm ไม่พอ เพราะตารางมีเส้นขอบล่างซึ่งดึงสายตาเข้าหาบรรทัดถัดไป) */
  .contract .formulaTable { width: 100%; margin: 3mm 0 5mm; border-collapse: collapse; }
  /* เส้นตารางครบทุกช่อง (มติผู้ใช้ 2026-08-21) — เดิมมีแต่เส้นใต้แถว ซึ่งอ่านเป็น
     "รายการ" มากกว่า "ตาราง" ในเอกสารที่ต้องเซ็น · เส้นคั่นบนหัวใช้สีขาวจาง เพราะ
     เส้นสีเทาบนพื้นกรมท่าจะมองไม่เห็น */
  .contract .formulaTable { border: 1px solid var(--doc-line-strong); }
  .contract .formulaTable th { padding: 2.1mm 1.5mm; color: #fff; background: var(--doc-navy);
    font-size: 8.4pt; font-weight: 600; text-align: left;
    border-right: 1px solid rgb(255 255 255 / 35%); }
  .contract .formulaTable th:last-child { border-right: 0; }
  .contract .formulaTable td { padding: 2mm 1.5mm; font-size: 8.8pt;
    border-right: 1px solid var(--doc-line); border-bottom: 1px solid var(--doc-line); }
  .contract .formulaTable td:last-child { border-right: 0; }
  .contract .formulaTable tr:last-child td { border-bottom: 0; }
  .contract .formulaTable th:first-child, .contract .formulaTable td:first-child { width: 14mm; }
  .contract .formulaTable th:nth-child(3), .contract .formulaTable td:nth-child(3) { width: 42mm; }
  .contract .formulaTable th:last-child, .contract .formulaTable td:last-child { width: 26mm; }
  /* เลขที่บันทึกยาวกว่าเลขสัญญา (ต่อท้ายด้วย -A1) ⇒ คืนที่จากคอลัมน์ป้าย ไม่งั้นเลขตกบรรทัด */
  .contract .identityBlock dl div { grid-template-columns: 28mm minmax(0, 1fr); }
  /* หัวเรื่องของบันทึกอยู่กลางหน้าเหมือนชื่อสัญญา แต่มีบรรทัดวันที่ต่อท้าย */
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
