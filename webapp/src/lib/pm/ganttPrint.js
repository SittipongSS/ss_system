import { notifyToast } from "@/lib/feedback";
// เอกสาร Project Timeline — A4 แนวนอน ประกอบจากเปลือกเอกสารกลาง
// (lib/documents/documentShell) ชุดเดียวกับใบเสนอราคาและใบแจ้งชำระภาษี ต่างที่วางแนว
//
// 2026-08-05: เดิมไฟล์นี้ถือ CSS ของตัวเองทั้งชุด — คนละฟอนต์ (ลิงก์ Google Fonts CDN)
// คนละหน่วย (px) คนละชุดสี (hex ตายตัว) และไม่มีขั้นบันได zoom · ตอนนี้เหลือเฉพาะ CSS
// ของตารางแกนต์กับช่องลงชื่อ ซึ่งเป็นกริดนับพิกเซลจริง ๆ ที่เปลือกไม่มีให้
// Ported from ss-cj. ss-team uses project.customerName (FK snapshot) for the
// customer name; the rest of the fields are camelCase and match our schema.
// Usage:  openGanttPrintWindow(project)  where project.tasks = its tasks.

import { buildWeekColumns, autoCellsForTask, cellKey, weekOfDay } from './weekGrid';
import { fmtDateNumeric, fmtDayMonthYear, fmtPhone } from '@/lib/format';
import { productIdentity } from '@/lib/master/productIdentity';
import { entityCodeDisplay } from '@/lib/entityCode';
import { dealTypeOf } from '@/lib/salesPlanning';
import { resolveCompanyBlock, getCompanyProfileForPrint } from '@/lib/companyProfile';
import {
  documentNumberWithRevision,
  getDocumentStandardsForPrint,
  resolveDocumentAccentKey,
  resolveDocumentForm,
  resolveDocumentTitleTh,
} from '@/lib/documentStandards';
import {
  documentFooter,
  documentHeader,
  esc,
  partyGrid,
  renderDocumentHTML,
  watermarkBlock,
} from '@/lib/documents/documentShell';

const TIMELINE_KEY = 'projectTimeline';

// วันที่: ใช้มาตรฐานการแสดงผลกลาง (§2). thai day-month-year = "25 ก.ค. 26",
// คอลัมน์ Start/Finish ในตาราง = DD/MM/YY (พื้นที่แคบ).
const fmtThai = (v) => (v ? fmtDayMonthYear(v, { locale: 'th' }) : '');
const fmtShort = (v) => (v ? fmtDateNumeric(v, { short: true }) : '');

// สีสถานะให้ตรงกับบนจอ/ทั้งแอป (statusFill ใน ProjectDocumentView): เสร็จ=เขียว,
// กำลังทำ=accent, รอ=เทา. legend ด้านล่าง interpolate จากชุดนี้เพื่อไม่ให้เพี้ยนจากบาร์.
const STATUS_FILL = {
  Completed: '#2c7a55',   // ~ var(--green)
  'In Progress': '#c17a52', // var(--accent)
  Pending: '#8a93a3',     // เทากลาง
};
const fillOf = (t) => STATUS_FILL[t.status] || STATUS_FILL.Pending;

// ช่องลงชื่อแบบตีกรอบ — โครงเดียวกันทุกช่อง: หัวช่อง (ตำแหน่ง) / พื้นที่เซ็น /
// ชื่อ (เติมมาให้ หรือเว้นให้เขียน) / วันที่
const signBox = ({ label, role, name }) => `
      <div class="sign-box">
        <div class="sb-head">${esc(label)}${role ? ` <span class="sb-role">· ${esc(role)}</span>` : ''}</div>
        <div class="sb-body">
          <div class="sb-sig"><span class="sb-hint">ลงชื่อ</span></div>
          <div class="sb-name">${name ? `(${esc(name)})` : '<span class="sb-hint">(ชื่อ-นามสกุล ตัวบรรจง)</span>'}</div>
          <div class="sb-date">วันที่ <span class="dline"></span></div>
        </div>
      </div>`;

/* ความจุเป็น "หน่วย" = แถวป้ายเฟส 1 + จำนวนงานในเฟส
   วัดจากเอกสารที่เรนเดอร์จริงหลังย้ายมาใช้เปลือกกลาง (A4 แนวนอน 297×210mm):
     แถวสูง 5mm · หัวตาราง 8.1mm · ท้ายกระดาษเริ่มที่ 199.8mm
     หน้าแรกตารางเริ่มที่ 105.7mm (เสียให้หัวเอกสาร 42mm + กล่องข้อมูล 50mm) → 17.2 แถว
     หน้าถัดไปตารางเริ่มที่ ~53mm (ไม่มีกล่องข้อมูล) → 27.7 แถว
   เผื่อไว้หน้าละหนึ่งแถวสำหรับชื่องานที่ยาวจนตัดสองบรรทัด (ค่าเดิม 14/22 ตั้งไว้ตอน
   เลย์เอาต์เก่าที่หัวเอกสารสูงกว่านี้ ทำให้หน้าแรกเหลือที่ว่างท้ายหน้า ~25mm) */
export function paginateTimelineGroups(groups = [], firstPageCapacity = 16, continuationCapacity = 26) {
  if (!Array.isArray(groups) || groups.length === 0) return [[]];
  const queue = groups.map((group) => ({ ...group, tasks: [...group.tasks] }));
  const pages = [];
  let current = [];
  let used = 0;

  while (queue.length > 0) {
    const capacity = pages.length === 0 ? firstPageCapacity : continuationCapacity;
    const group = queue[0];
    const available = capacity - used;
    const units = 1 + group.tasks.length;

    if (units <= available) {
      current.push(queue.shift());
      used += units;
      continue;
    }
    if (current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
      continue;
    }

    const taskCapacity = Math.max(1, capacity - 1);
    current.push({ ...group, tasks: group.tasks.slice(0, taskCapacity) });
    group.tasks = group.tasks.slice(taskCapacity);
    pages.push(current);
    current = [];
    used = 0;
    if (group.tasks.length === 0) queue.shift();
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

// CSS เฉพาะเอกสารไทม์ไลน์ — ตารางแกนต์ที่หนาแน่น (คอลัมน์สัปดาห์ 15px/แถว) กับช่อง
// ลงชื่อแบบตีกรอบ ยังต้องคุมขนาดเป็น px เองเพราะเป็นกริดที่นับพิกเซล ไม่ใช่ข้อความไหล
// แต่ "สี" ทุกจุดหยิบจากตัวแปรของเปลือกแล้ว (เดิมเป็น hex ตายตัวคนละชุดกับใบเสนอราคา)
const TIMELINE_CSS = `
  .timeline .sheet { padding: 8mm 9mm; }
  .timeline .sheetContent { padding-bottom: 0; }
  .timeline .approval-title { margin: 5mm 0 2mm; color: var(--doc-navy); font-size: 13pt; font-weight: 700; }
  /* หัวเอกสารของแนวนอนเตี้ยกว่าแนวตั้ง — บล็อกตัวตนเอกสารไม่ต้องกว้าง 72mm */
  .timeline .documentHeader { grid-template-columns: minmax(0, 1.6fr) minmax(58mm, .7fr); gap: 6mm; padding-bottom: 3mm; }
  .timeline .identityBlock h1 { font-size: 15pt; }
  .timeline .partyGrid { grid-template-columns: 1fr 1fr; gap: 2.5mm; margin-top: 3mm; }
  .timeline .partyGrid > div { padding: 2.5mm 3mm; }
  .timeline .partyGrid dl div { grid-template-columns: 30mm 1fr; }

  /* รายการ FG ในกล่องข้อมูลอ้างอิง */
  .fg-list { display: flex; flex-direction: column; gap: 1mm; }
  .fg-item { display: flex; flex-direction: column; padding-left: 1.5mm; border-left: 1.5px solid var(--doc-accent); }
  .fg-item .fg-meta { color: var(--doc-muted); font-size: 6.6pt; font-weight: 600; }
  .fg-item .fg-name { color: var(--doc-text); font-size: 7.4pt; font-weight: 600; }
  .fg-item .fg-cat { color: var(--doc-accent); font-size: 6.6pt; font-weight: 600; }
  .fg-item .fg-qty { color: var(--doc-muted); font-size: 6.6pt; }
  .fg-item.empty { border-left-style: dashed; border-left-color: var(--doc-line-strong); }
  .fg-item.empty .fg-note { color: var(--doc-muted); font-size: 6.6pt; font-style: italic; }

  /* ── ตารางแกนต์ ─────────────────────────────────────────────────────────── */
  .ganttTable { width: 100%; margin-top: 3mm; border-collapse: collapse; table-layout: fixed; }
  .ganttTable th, .ganttTable td { border: 1px solid var(--doc-line); overflow: hidden; }
  .ganttTable thead { display: table-header-group; }
  .ganttTable thead th { padding: 1mm .7mm; color: #fff; background: var(--doc-navy);
    font-size: 7.2pt; font-weight: 600; line-height: 1.15; text-align: center; }
  .ganttTable .c-no { color: var(--doc-navy); font-size: 6.8pt; text-align: center; }
  .ganttTable .c-desc { color: var(--doc-text); font-size: 7.6pt; line-height: 1.25; text-align: left; word-break: break-word; }
  .ganttTable .c-desc .note { margin-top: .3mm; color: var(--doc-muted); font-size: 6.4pt; font-style: italic; line-height: 1.2; white-space: pre-wrap; }
  .ganttTable .c-team { color: var(--doc-navy); font-size: 6.8pt; font-weight: 700; text-align: center; }
  .ganttTable .c-dur { color: var(--doc-text); font-size: 7.2pt; text-align: center; }
  .ganttTable .c-date { color: var(--doc-text); font-size: 6.6pt; text-align: center; white-space: nowrap; }
  .ganttTable td.c-no, .ganttTable td.c-desc, .ganttTable td.c-team,
  .ganttTable td.c-dur, .ganttTable td.c-date { padding: .3mm 1mm; vertical-align: middle; }
  .ganttTable .wk { height: 15px; padding: 0; text-align: center; }
  .ganttTable .wkd { color: #fff; font-size: 5pt; font-weight: 700; line-height: 1; }
  .ganttTable th.wkn { padding: .3mm 0; color: var(--doc-navy); background: var(--doc-neutral-soft);
    font-size: 4.6pt; font-weight: 600; letter-spacing: -.3px; line-height: 1; }
  .ganttTable thead th.wk[colspan] { font-size: 6.4pt; }
  .ganttTable .dia { color: var(--doc-navy); font-size: 6.4pt; }
  .ganttTable .ms { color: var(--doc-accent); }
  /* ห้ามฉีก "แถวเดียว" กลางหน้า และไม่ให้เฟสโดนตัดกลางหน้า (มติผู้ใช้) —
     thead ซ้ำหัวคอลัมน์ทุกหน้าอยู่แล้ว */
  .ganttTable tbody tr { break-inside: avoid; page-break-inside: avoid; }
  .ganttTable tbody.pg { break-inside: avoid; page-break-inside: avoid; }
  .ganttTable .phase-row { break-after: avoid; page-break-after: avoid; }
  .ganttTable .phase-row td { background: var(--doc-neutral-soft); }
  .ganttTable .phase-row .c-no { font-weight: 700; }
  .ganttTable .phase-label { padding: .5mm 2mm; color: var(--doc-navy); font-size: 7.6pt; font-weight: 700; text-align: left; }

  /* ── ช่องลงชื่อแบบตีกรอบ (จำกัดพื้นที่เขียน — มติผู้ใช้) ───────────────── */
  .sign-sec { margin-top: 4mm; display: flex; flex-direction: column; gap: 2mm; break-inside: avoid; page-break-inside: avoid; }
  .sign-row { display: grid; gap: 2mm; }
  .sign-row.three { grid-template-columns: repeat(3, 1fr); }
  .sign-box { border: 1px solid var(--doc-line-strong); background: var(--doc-paper); overflow: hidden; }
  .sb-head { padding: .8mm 1.5mm; border-bottom: 1px solid var(--doc-line); color: var(--doc-navy);
    background: var(--doc-neutral-soft); font-size: 7.6pt; font-weight: 700; text-align: center; }
  .sb-role { color: var(--doc-muted); font-size: 6.6pt; font-weight: 400; }
  .sb-body { padding: 1mm 3.5mm 2mm; text-align: center; }
  .sb-sig { position: relative; height: 12mm; border-bottom: 1px dotted var(--doc-line-strong); }
  .sb-sig .sb-hint { position: absolute; bottom: .5mm; left: 0; color: var(--doc-muted); font-size: 6.6pt; }
  .sb-name { min-height: 3.5mm; margin-top: 1mm; color: var(--doc-text); font-size: 7.6pt; font-weight: 600; }
  .sb-name .sb-hint { color: var(--doc-muted); font-size: 6.6pt; font-weight: 400; }
  .sb-date { margin-top: 1mm; color: var(--doc-muted); font-size: 7pt; }
  .sb-date .dline { display: inline-block; min-width: 28mm; height: .9em; border-bottom: 1px dotted var(--doc-line-strong); vertical-align: middle; }

  .legend { display: flex; gap: 3.5mm; margin-top: 3mm; flex-wrap: wrap; break-inside: avoid; }
  .leg { display: flex; align-items: center; gap: 1mm; color: var(--doc-muted); font-size: 7.4pt; }
  .sw { width: 3mm; height: 3mm; border-radius: 1px; }`;

// options.toolbar = false → ไม่ใส่แถบปุ่มพิมพ์ (กติกาเดียวกับ renderQuotationMasterDocumentHTML)
// ใช้ตอนฝังเอกสารเป็นพรีวิวใน iframe ซึ่งปุ่มสั่งพิมพ์ไม่มีความหมาย
export function buildGanttPrintHTML(project, company, activeStandard = null, options = {}) {
  const co = resolveCompanyBlock(company);
  // มาตรฐานที่ตรึงไว้ตอนออกเลขที่เอกสาร (mig 0198) มาก่อนมาตรฐานที่เผยแพร่อยู่ตอนนี้
  // เหมือนใบแจ้งชำระภาษี — ใบเก่าพิมพ์ซ้ำต้องได้รหัสฟอร์ม/Rev ชุดเดิมที่เคยออกไป
  const standard = project.timelineStandardSnapshot || activeStandard;
  const form = resolveDocumentForm(standard, TIMELINE_KEY);
  const tasks = Array.isArray(project.tasks) ? project.tasks : [];

  const starts = tasks.map(t => new Date(t.startDate).getTime()).filter(t => !isNaN(t));
  const finishes = tasks.map(t => new Date(t.finishDate).getTime()).filter(t => !isNaN(t));
  const startMs = starts.length ? Math.min(...starts)
    : (project.startDate ? new Date(project.startDate).getTime() : Date.now());
  const endMs = finishes.length ? Math.max(...finishes)
    : (project.dueDate ? new Date(project.dueDate).getTime() : startMs + 30 * 86400000);
  const { months, columns } = buildWeekColumns(startMs, endMs);
  const nCols = columns.length;

  const order = [];
  tasks.forEach(t => { const p = t.phase || '—'; if (!order.includes(p)) order.push(p); });
  const groups = order.map((phase, i) => ({
    phase, phaseNum: i + 1,
    tasks: tasks.filter(t => (t.phase || '—') === phase).map((task, taskIndex) => ({ task, taskIndex })),
  }));

  const fixedCols = 6;
  const totalCols = fixedCols + Math.max(nCols, 1);

  const FIXED = [
    ['no', 3], ['desc', 30], ['team', 3], ['dur', 4], ['start', 5], ['finish', 5],
  ];
  const fixedSum = FIXED.reduce((a, [, w]) => a + w, 0);
  const weekPct = (100 - fixedSum) / Math.max(nCols, 1);
  const colgroup = `<colgroup>${
    FIXED.map(([, w]) => `<col style="width:${w}%">`).join('')
  }${
    (nCols ? columns : [{ key: '_' }]).map(() => `<col style="width:${weekPct}%">`).join('')
  }</colgroup>`;

  const monthHeadCells = months.map(m =>
    `<th class="wk" colspan="${m.weeks.length}">${esc(m.label)}</th>`
  ).join('');
  const weekHeadCells = columns.map(c => `<th class="wk wkn">W${c.week}</th>`).join('');

  const bodyForGroups = (pageGroups) => pageGroups.map(g => {
    const phaseRow = `
      <tr class="phase-row">
        <td class="c-no">${g.phaseNum}</td>
        <td colspan="${totalCols - 1}" class="phase-label">${esc(g.phase)}</td>
      </tr>`;
    const taskRows = g.tasks.map(({ task: t, taskIndex: ti }) => {
      const filled = autoCellsForTask(t);
      const fill = fillOf(t);
      const sd = t.startDate ? new Date(t.startDate) : null;
      const startKey = sd && !isNaN(sd.getTime()) ? cellKey(sd.getFullYear(), sd.getMonth(), weekOfDay(sd.getDate())) : null;
      const startDay = sd && !isNaN(sd.getTime()) ? sd.getDate() : '';
      const cells = (nCols ? columns : []).map(c => {
        if (!filled.has(c.key)) return '<td class="wk"></td>';
        const isStart = c.key === startKey;
        if (t.isMilestone && !isStart) return '<td class="wk"><span class="dia">◆</span></td>';
        return `<td class="wk" style="background:${fill}">${isStart ? `<span class="wkd">${startDay}</span>` : ''}</td>`;
      }).join('') || (nCols ? '' : '<td class="wk"></td>');
      return `
        <tr>
          <td class="c-no">${g.phaseNum}.${ti + 1}</td>
          <td class="c-desc">${t.isMilestone ? '<span class="ms">◆</span> ' : ''}${esc(t.name)}${t.showNoteInPrint && t.note ? `<div class="note">หมายเหตุ: ${esc(t.note)}</div>` : ''}</td>
          <td class="c-team">${esc(t.role || '')}</td>
          <td class="c-dur">${t.durationDays ?? ''}</td>
          <td class="c-date">${fmtShort(t.startDate)}</td>
          <td class="c-date">${fmtShort(t.finishDate)}</td>
          ${cells}
        </tr>`;
    }).join('');
    return `<tbody class="pg">${phaseRow}${taskRows}</tbody>`;
  }).join('');
  const timelinePages = paginateTimelineGroups(groups);

  const productName = project.productName || project.name || '';
  const customerName = project.customerName || project.customer || '';
  // ผู้ตรวจสอบ = aeSupervisor (field เดียวที่ฟอร์ม/หัวเอกสาร/ช่องลงชื่อใช้ร่วมกัน)
  // fallback reviewedBy ไว้รองรับข้อมูลเก่าที่เคยบันทึกผ่านช่องลงชื่อหน้า Gantt.
  // ผู้ประสานงาน (AC) = preparedBy, ผู้ดูแล (AE) = aeOwner — ช่องเซ็นเลิกใช้คำว่า
  // "ผู้จัดทำ" แล้ว (มติผู้ใช้ 2026-08-05) เพราะใบสั่งขายใช้คำนั้นกับ AE เจ้าของดีล
  // คนละบทบาทกับ AC ที่ประสานงานโครงการ · ชื่อ field ยังเป็น preparedBy ตามสคีมาเดิม
  const reviewerName = project.aeSupervisor || project.reviewedBy || '';
  const preparerName = project.preparedBy || '';
  // เบอร์มือถือ + อีเมล ของ AE ผู้ดูแล — ดึงจากข้อมูลผู้ใช้ (เติมมาจากหน้า page
  // ผ่าน aeMobile/aeEmail) ไม่ใช่ของลูกค้า. ไม่มีช่องกรอกในฟอร์ม (CR §3.2).
  const aeMobile = project.aeMobile ? fmtPhone(project.aeMobile) : '';
  const aeEmail = project.aeEmail || '';
  // ใบเสนอราคา + เลขที่ PO ในบรรทัดเดียว: "QT-... (PO-...)" (CR §3.3).
  const quotationNo = project.metadata?.quotationNumber || '';
  const poNo = project.metadata?.poNumber || '';
  const quotationLine = quotationNo
    ? `${quotationNo}${poNo ? ` (${poNo})` : ''}`
    : (poNo ? `(${poNo})` : '');
  // ช่องลงชื่อผู้รับผิดชอบฝ่าย — ขึ้นครบทุกฝ่ายเสมอ (ไม่ว่ามีขั้นตอนฝ่ายนั้นในโครงการหรือไม่)
  const signDepts = ['PC', 'PD', 'RD'];
  // ยังไม่ผูก FG → โชว์ชื่อหมวด/หมวดรองแทนไปก่อน (categoryFallback resolve ชื่อหมวดหลักจากโค้ดมาแล้วฝั่ง page)
  const categoryFallback = project.categoryFallback || project.productSubCategory || '';
  // รหัสเต็มบนเอกสาร = ฐาน + '-' + revision (mig 0096). ดีลส่ง rev=null → -0.
  const displayCode = project.code
    ? entityCodeDisplay(project.code, project.rev)
    : (project.docNumber || '-');
  // เลขที่เอกสารควบคุม (PT-YYMMXXXX-R) แยกจากรหัสโครงการ (PJ-YYMMXXXX-R) — ใบไทม์ไลน์
  // ของดีลที่ยังไม่มีโครงการจริงไม่มีเลขที่เอกสาร จึงโชว์เฉพาะรหัสต้นทางเหมือนเดิม
  const timelineDocNumber = documentNumberWithRevision(
    project.timelineDocBase,
    project.timelineDocNumber,
    project.rev,
  );
  const formLine = `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`;
  // ดีลที่ผูกกับโครงการ — snapshot ของ Rev ที่ถ่ายไว้ก่อนมี field นี้จะไม่มีข้อมูล
  // หน้าเรียกจึงถอยไปใช้ดีลปัจจุบันให้ (ดูหน้า sa/projects/[id])
  // ⚠️ ชื่อกับประเภทแยกคนละแถวตามชุดอ้างอิงของใบเสนอราคา (มติผู้ใช้ 2026-08-05) —
  // โครงการมีได้หลายดีล สองแถวนี้จึงเรียงบรรทัดให้ตรงกัน (ดีลตัวที่ n อยู่บรรทัดที่ n
  // ทั้งสองแถว) · กรองด้วยเงื่อนไขเดียวกันทั้งคู่ ลำดับจึงตรงกันเสมอ
  const linkedDeals = (project.deals || []).filter((deal) => String(deal?.title || '').trim());
  const dealTitles = linkedDeals.map((deal) => String(deal.title).trim());
  const dealTypes = linkedDeals.map((deal) => dealTypeOf(deal) || '-');

  const header = documentHeader({
    // resolveCompanyBlock คืนคีย์ legalNameTh/legalNameEn ส่วนเปลือกรับ nameTh/nameEn
    company: {
      nameTh: co.legalNameTh,
      nameEn: co.legalNameEn,
      address: co.address,
      taxId: co.taxId,
      phone: co.phone,
      line: co.line,
      website: co.website,
    },
    formLine,
    // ชื่อไทยจากมาตรฐาน + ชื่ออังกฤษจากรหัสแบบฟอร์ม — ชุดเดียวกับใบเสนอราคา/ใบภาษี
    // (เดิมหัวใบมีแต่ชื่ออังกฤษบรรทัดเดียว)
    titleTh: resolveDocumentTitleTh(standard, TIMELINE_KEY),
    titleEn: form.title,
    rows: [
      // ป้าย "รหัสโครงการ" ใช้เฉพาะตอนมีเลขที่เอกสารควบคุมคู่กัน เพราะมีสองเลขให้แยกแยะ
      // ไทม์ไลน์ของดีลที่ยังไม่มีโครงการจริงมีเลขเดียว จึงเป็น "เลขที่" เฉย ๆ เหมือนเดิม
      timelineDocNumber ? { label: 'เลขที่เอกสาร', value: timelineDocNumber } : null,
      { label: timelineDocNumber ? 'รหัสโครงการ' : 'เลขที่', value: displayCode },
      { label: 'วันที่', value: fmtThai(project.startDate) },
    ],
  });

  // รายการ FG เป็นโครงหลายบรรทัดต่อชิ้น จึงส่งเป็น html เข้าไปในช่องแทนข้อความล้วน
  const fgHtml = (project.projectProducts || []).length > 0
    ? `<span class="fg-list">${(project.projectProducts || []).map(pp => {
        const prod = pp.product || {};
        const cat = pp.categoryLabel || '';
        const identity = productIdentity(prod, { fallback: 'ไม่มีชื่อสินค้า' });
        return `<span class="fg-item">${identity.meta ? `<span class="fg-meta">${esc(identity.meta)}</span>` : ''}<span class="fg-name">${esc(identity.detail || identity.text)}</span>${cat ? `<span class="fg-cat">${esc(cat)}</span>` : ''}<span class="fg-qty">สั่งซื้อ: ${esc(pp.orderQty || '-')} | ผลิต: ${esc(pp.productionQty || '-')}</span></span>`;
      }).join('')}</span>`
    : (categoryFallback
      ? `<span class="fg-list"><span class="fg-item empty"><span class="fg-name">${esc(categoryFallback)}</span><span class="fg-note">หมวดสินค้า (ยังไม่ผูก FG)</span></span></span>`
      : '-');

  const party = partyGrid({
    ariaLabel: 'ข้อมูลโครงการและข้อมูลอ้างอิง',
    party: {
      heading: 'ข้อมูลโครงการ',
      headingEn: '/ PROJECT',
      name: productName,
      rows: [
        { label: 'ลูกค้า', value: customerName },
        { label: 'แบรนด์', value: project.metadata?.brand },
        { label: 'ผู้ดูแล (AE)', value: project.aeOwner },
        { label: 'ผู้ประสานงาน (AC)', value: preparerName },
        { label: 'ผู้ตรวจสอบ', value: reviewerName },
        aeMobile ? { label: 'เบอร์มือถือ', value: aeMobile } : null,
        aeEmail ? { label: 'Email', value: aeEmail } : null,
      ],
    },
    // เอกสารทุกชนิดต้องอ้างอิงโครงการและโครงการย่อย (ดีล) เสมอ — ไทม์ไลน์ครอบทั้ง
    // โครงการซึ่งมีได้หลายดีล จึงลิสต์ทุกดีลที่ผูกอยู่ (มติผู้ใช้ 2026-08-05)
    // `.partyGrid dd` เป็น pre-wrap อยู่แล้ว ขึ้นบรรทัดใหม่ต่อดีลได้โดยไม่ต้องใส่ markup
    reference: {
      heading: 'ข้อมูลอ้างอิง',
      headingEn: '/ REFERENCE',
      rows: [
        { label: 'เลขที่โครงการ', value: displayCode },
        // เอกสารเรียกดีลว่า "โครงการ" ตามชุดเดียวกับใบเสนอราคา/ใบสั่งขาย — ชื่อโครงการแม่
        // ไม่ต้องซ้ำในบล็อกนี้ เพราะเป็นหัวข้อของกล่องซ้าย (ข้อมูลโครงการ) อยู่แล้ว
        { label: 'โครงการ', value: dealTitles.join('\n') },
        { label: 'ประเภทโครงการ', value: dealTypes.join('\n') },
        { label: 'ใบเสนอราคา', value: quotationLine },
        { label: 'รายการสินค้า (FG)', html: fgHtml },
      ],
    },
  });

  const timelineTable = (pageGroups) => `
    <table class="ganttTable">
      ${colgroup}
      <thead>
        <tr><th rowspan="2">no.</th><th rowspan="2">Work Description</th><th rowspan="2">Team</th><th rowspan="2">Duration<br/>(Day)</th><th rowspan="2">Start</th><th rowspan="2">Finish</th>${monthHeadCells || '<th rowspan="2">Timeline</th>'}</tr>
        <tr>${weekHeadCells}</tr>
      </thead>
      ${bodyForGroups(pageGroups) || `<tbody><tr><td colspan="${totalCols}" class="c-desc" style="text-align:center;padding:6mm">ยังไม่มีขั้นตอนในโครงการนี้</td></tr></tbody>`}
    </table>`;
  const legend = `
    <div class="legend">
      <div class="leg"><span class="sw" style="background:${STATUS_FILL.Completed}"></span>เสร็จสิ้น</div>
      <div class="leg"><span class="sw" style="background:${STATUS_FILL['In Progress']}"></span>กำลังดำเนินการ</div>
      <div class="leg"><span class="sw" style="background:${STATUS_FILL.Pending}"></span>รอดำเนินการ</div>
      <div class="leg"><span class="dia">◆</span> จุดสำคัญ (Milestone)</div>
    </div>`;
  // แถวบน 3 ช่อง (มติผู้ใช้ 2026-07-18, ปรับคำ 08-05): ผู้ดูแล (AE) / ผู้ประสานงาน (AC) / ผู้ตรวจสอบ
  const signatures = `
    <div class="sign-sec">
      <div class="sign-row three">
        ${signBox({ label: 'ผู้ดูแล', role: 'ACCOUNT EXECUTIVE', name: project.aeOwner || '' })}
        ${signBox({ label: 'ผู้ประสานงาน', role: 'ACCOUNT COORDINATOR', name: preparerName })}
        ${signBox({ label: 'ผู้ตรวจสอบ', role: 'AE SUPERVISOR', name: reviewerName })}
      </div>
      ${signDepts.length ? `<div class="sign-row three">${signDepts.map((dep) => signBox({ label: `ผู้รับผิดชอบ ฝ่าย ${dep}` })).join('')}</div>` : ''}
    </div>`;

  const watermark = watermarkBlock(project.watermark);
  const pageCount = timelinePages.length + 1;
  const foot = (pageNumber) => documentFooter({
    left: co.legalNameTh,
    center: formLine,
    right: `หน้า ${pageNumber} / ${pageCount}`,
  });
  // `explicit-page` = หน้าที่ตัดเองล่วงหน้าด้วย paginateTimelineGroups
  const contentPages = timelinePages.map((pageGroups, pageIndex) => `
    <article class="sheet explicit-page" aria-label="เอกสาร Project Timeline หน้า ${pageIndex + 1}">
      ${watermark}
      ${header}
      <div class="sheetContent">
        ${pageIndex === 0 ? party : ''}
        ${timelineTable(pageGroups)}
      </div>
      ${foot(pageIndex + 1)}
    </article>`).join('');
  const approvalPage = `
    <article class="sheet explicit-page approval-page" aria-label="หน้ารับรองเอกสาร">
      ${watermark}
      ${header}
      <div class="sheetContent">
        <div class="approval-title">การรับรองเอกสาร Project Timeline</div>
        ${legend}
        ${signatures}
      </div>
      ${foot(pageCount)}
    </article>`;

  return renderDocumentHTML({
    title: `${displayCode} — เอกสาร Project Timeline`,
    accentKey: resolveDocumentAccentKey(standard, TIMELINE_KEY),
    orientation: 'landscape',
    variantClass: 'timeline',
    extraCss: TIMELINE_CSS,
    toolbar: options.toolbar === false ? null : { label: `เอกสาร Project Timeline — ${displayCode}`, button: '🖨 สั่งพิมพ์ / บันทึก PDF' },
    pages: `${contentPages}${approvalPage}`,
  });
}

export async function openGanttPrintWindow(project) {
  // เปิดหน้าต่างก่อน (ยังไม่ await) กัน popup blocker แล้วค่อยดึงข้อมูลบริษัทที่เผยแพร่
  const w = window.open('', '_blank');
  if (!w) {
    notifyToast.error('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
    return;
  }
  w.document.open();
  w.document.write(printPlaceholderHtml({ title: "Project Timeline", message: "กำลังเตรียมเอกสาร…" }));
  w.document.close();
  // บริษัท + มาตรฐานเอกสาร ดึงคู่กันเสมอตอนสร้างเอกสารสด — ทั้งคู่มีค่าสำรองในตัวเอง
  const [company, standards] = await Promise.all([
    getCompanyProfileForPrint(),
    getDocumentStandardsForPrint(),
  ]);
  const html = buildGanttPrintHTML(project, company, standards?.[TIMELINE_KEY] || null);
  w.document.open();
  w.document.write(html);
  w.document.close();
}
import { PRINT_FONT_STACK, printPlaceholderHtml } from "@/lib/printTheme";
