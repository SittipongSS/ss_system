// Generates a print-ready A4 landscape ISO Timeline document (FM-SA form).
// Ported from ss-cj. ss-team uses project.customerName (FK snapshot) for the
// customer name; the rest of the fields are camelCase and match our schema.
// Usage:  openGanttPrintWindow(project)  where project.tasks = its tasks.

import { buildWeekColumns, autoCellsForTask, cellKey, weekOfDay } from './weekGrid';

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const COMPANY_TEL = '02-000-7722, 092-646-8682';
const COMPANY_LINE = '@perfumefactory';
const LOGO_URL = 'https://static.wixstatic.com/media/279c93_8f08407580cc4842ad6fae8b398eec3e~mv2.png/v1/fill/w_166,h_166,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/marque.png';

const fmtThai = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtShort = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
};
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// สีสถานะให้ตรงกับบนจอ/ทั้งแอป (statusFill ใน ProjectDocumentView): เสร็จ=เขียว,
// กำลังทำ=accent, รอ=เทา. legend ด้านล่าง interpolate จากชุดนี้เพื่อไม่ให้เพี้ยนจากบาร์.
const STATUS_FILL = {
  Completed: '#2c7a55',   // ~ var(--green)
  'In Progress': '#c17a52', // var(--accent)
  Pending: '#8a93a3',     // เทากลาง
};
const fillOf = (t) => STATUS_FILL[t.status] || STATUS_FILL.Pending;

export function buildGanttPrintHTML(project) {
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
    tasks: tasks.filter(t => (t.phase || '—') === phase),
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

  const bodyTbodies = groups.map(g => {
    const phaseRow = `
      <tr class="phase-row">
        <td class="c-no">${g.phaseNum}</td>
        <td colspan="${totalCols - 1}" class="phase-label">${esc(g.phase)}</td>
      </tr>`;
    const taskRows = g.tasks.map((t, ti) => {
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

  const productName = project.productName || project.name || '';
  const customerName = project.customerName || project.customer || '';
  // ผู้ตรวจสอบ = aeSupervisor (field เดียวที่ฟอร์ม/หัวเอกสาร/ช่องลงชื่อใช้ร่วมกัน)
  // fallback reviewedBy ไว้รองรับข้อมูลเก่าที่เคยบันทึกผ่านช่องลงชื่อหน้า Gantt.
  // ผู้จัดทำ = preparedBy, ผู้ดูแล = aeOwner.
  const reviewerName = project.aeSupervisor || project.reviewedBy || '';
  const preparerName = project.preparedBy || '';
  // ช่องลงชื่อผู้รับผิดชอบฝ่าย — ขึ้นครบทุกฝ่ายเสมอ (ไม่ว่ามีขั้นตอนฝ่ายนั้นในโครงการหรือไม่)
  const signDepts = ['PC', 'PD', 'RD'];
  // ยังไม่ผูก FG → โชว์ชื่อหมวด/หมวดรองแทนไปก่อน (categoryFallback resolve ชื่อหมวดหลักจากโค้ดมาแล้วฝั่ง page)
  const categoryFallback = project.categoryFallback || project.productSubCategory || '';

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timeline Project - ${esc(project.docNumber || project.code || '')}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #ffffff; color: #21385e;
         font-family: 'IBM Plex Sans Thai', -apple-system, sans-serif;
         -webkit-font-smoothing: antialiased; font-size: 12px;
         -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

  .toolbar { max-width: 297mm; margin: 0 auto; padding: 16px 12px 0;
             display: flex; justify-content: space-between; align-items: center; }
  .toolbar h1 { font-size: 16px; font-weight: 600; }
  .btn-print { background: #21385e; color: #fff; border: none; font: inherit; font-weight: 600;
               padding: 8px 18px; border-radius: 8px; cursor: pointer; }
  .btn-print:hover { background: #2e2620; }

  .sheet { width: 297mm; min-height: 210mm; margin: 16px auto; background: #fff;
           box-shadow: 0 8px 32px rgba(40,33,24,.12); padding: 8mm 9mm; }

  .doc-top { display: flex; justify-content: space-between; align-items: flex-start;
             border-bottom: 2px solid #c17a52; padding-bottom: 7px; margin-bottom: 7px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo-wrap { width: 38px; height: 38px; background: #21385e; border-radius: 8px;
               display: flex; align-items: center; justify-content: center; padding: 5px; flex-shrink: 0; }
  .logo-img { width: 100%; height: 100%; object-fit: contain; }
  .brand h2 { font-size: 14px; font-weight: 700; line-height: 1.25; }
  .brand .doc-name { font-size: 10px; color: #837868; margin-top: 2px; }
  .doc-title .formno { font-size: 10px; font-weight: 700; color: #837868; letter-spacing: 1px; text-align: right; }
  .doc-title .big { font-size: 17px; font-weight: 800; color: #c17a52; letter-spacing: 2px; text-align: right; white-space: nowrap; }
  .doc-title .sub { font-size: 9.5px; color: #837868; text-align: right; }
  .c-desc .note { font-size: 8px; color: #000; font-style: italic; line-height: 1.2; margin-top: 1px; white-space: pre-wrap; }

  .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0;
                 border: 1px solid #dcd8d0; border-radius: 6px; overflow: hidden; margin-bottom: 7px; }
  .hcol { padding: 6px 12px; }
  .hcol.left { border-right: 1px solid #dcd8d0; background: #f7f3ec; }
  .hrow { display: flex; gap: 6px; font-size: 10px; line-height: 1.55; }
  .hrow .k { color: #000; min-width: 84px; flex-shrink: 0; }
  .hrow .v { font-weight: 600; color: #000; }
  .fg-list { display: flex; flex-direction: column; gap: 3px; }
  .fg-item { display: flex; flex-direction: column; padding-left: 6px; border-left: 2px solid #c17a52; }
  .fg-item .fg-name { font-weight: 600; font-size: 9.5px; color: #000; }
  .fg-item .fg-qty { font-size: 8.5px; color: #000; }
  .fg-item.empty { border-left-style: dashed; border-color: #b8a07a; }
  .fg-item.empty .fg-note { font-size: 8.5px; color: #000; font-style: italic; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #cfc9bf; overflow: hidden; }
  thead th { background: #e8e2d9; color: #000; font-size: 9px; font-weight: 700; padding: 2px 2px; text-align: center; line-height: 1.15; }
  .c-no   { text-align: center; font-size: 8.5px; color: #000; }
  .c-desc { text-align: left;   font-size: 9.5px; line-height: 1.2; word-break: break-word; color: #000; }
  .c-team { text-align: center; font-size: 8.5px; font-weight: 700; color: #000; }
  .c-dur  { text-align: center; font-size: 9px; color: #000; }
  .c-date { text-align: center; font-size: 8px; color: #000; white-space: nowrap; }
  td.c-no, td.c-desc, td.c-team, td.c-dur, td.c-date { padding: 1px 3px; vertical-align: middle; }
  .wk  { height: 15px; padding: 0; text-align: center; }
  .wkd { font-size: 6px; font-weight: 700; color: #fff; line-height: 1; }
  th.wkn { font-size: 5.5px; color: #000; font-weight: 600; letter-spacing: -0.3px; line-height: 1; padding: 1px 0; }
  thead th.wk[colspan] { font-size: 8px; }
  .dia { color: #21385e; font-size: 8px; }
  .ms  { color: #c17a52; }
  tbody tr { page-break-inside: avoid; }
  tbody.pg { break-inside: avoid; page-break-inside: avoid; }
  .phase-row td { background: #f0ebe0; }
  .phase-label { text-align: left; font-weight: 700; font-size: 10px; padding: 2px 8px; color: #000; }
  td.c-no { font-weight: 700; }
  .phase-row .c-no { color: #21385e; }

  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
           margin-top: 34px; padding: 0 30px; page-break-inside: avoid; }
  .sign { text-align: center; }
  .sign .sig-space { height: 40px; }   /* พื้นที่เซ็นจริง — เพิ่มให้เซ็นได้สบาย */
  .sign .nm { font-weight: 400; font-size: 11px; padding-bottom: 2px; }
  .sign .nm-name { font-weight: 600; font-size: 11px; margin-top: 2px; min-height: 16px; }
  .sign .lbl { font-size: 11px; font-weight: 700; color: #21385e; margin-top: 4px; }
  .sign .role { font-size: 10px; color: #837868; }
  .sign .date { font-size: 10px; color: #837868; margin-top: 6px; }

  /* แถวลงชื่อผู้ตรวจสอบฝ่ายอื่น (เฉพาะหน้าพิมพ์) — โชว์เฉพาะฝ่ายที่มีงานในโครงการ */
  .signs-dept { display: flex; flex-wrap: wrap; justify-content: space-around; gap: 16px;
                margin-top: 48px; padding: 0 8px; page-break-inside: avoid; }
  .sign-sm { text-align: center; width: 150px; }
  .sign-sm .sig-space { height: 46px; }
  .sign-sm .line { border-top: 1px dotted #6b7a90; margin: 0 4px 3px; }
  .sign-sm .nm-name { font-size: 9px; color: #837868; }
  .sign-sm .lbl { font-size: 9.5px; font-weight: 700; color: #21385e; margin-top: 2px; }
  .sign-sm .role { font-size: 9px; color: #837868; }
  .sign-sm .date { font-size: 8.5px; color: #837868; margin-top: 5px; }

  .legend { display: flex; gap: 14px; margin-top: 12px; flex-wrap: wrap; page-break-inside: avoid; }
  .leg { display: flex; align-items: center; gap: 4px; font-size: 9.5px; color: #3c577d; }
  .sw { width: 11px; height: 11px; border-radius: 2px; }

  @page {
    size: A4 landscape; margin: 9mm 8mm 13mm;
    @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-size: 9px; color: #837868; }
  }
  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .sheet { margin: 0; box-shadow: none; width: 100%; min-height: auto; padding: 0; }
    thead { display: table-header-group; }
  }

  /* มือถือ/จอแคบ: ให้เอกสารพอดีความกว้างจอ (ไม่ล้น/ฟอนต์ไม่เพี้ยน) + header เรียงเดียว */
  @media screen and (max-width: 820px) {
    .toolbar { max-width: 100%; padding: 12px 10px 0; }
    .toolbar h1 { font-size: 14px; }
    .sheet { width: 100%; min-width: 0; margin: 10px auto; padding: 5mm; }
    .header-grid { grid-template-columns: 1fr; }
    .hcol.left { border-right: none; border-bottom: 1px solid #dcd8d0; }
    .signs { gap: 24px; padding: 0 8px; }
    .signs-dept { gap: 10px; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <h1>เอกสาร Timeline Project — ${esc(project.code || '')}</h1>
    <button class="btn-print" onclick="window.print()">🖨 สั่งพิมพ์ / บันทึก PDF</button>
  </div>

  <div class="sheet">
    <div class="doc-top">
      <div class="brand">
        <div class="logo-wrap"><img class="logo-img" src="${LOGO_URL}" alt="S&amp;S" /></div>
        <div>
          <h2>บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด</h2>
          <div class="doc-name">Project Timeline · ใบรายงานติดตามคำสั่งซื้อ</div>
        </div>
      </div>
      <div class="doc-title">
        <div class="formno">FM-PD-05${project.rev == null ? '' : ` · Rev. ${esc(project.rev)}`}</div>
        <div class="big">TIMELINE PROJECT</div>
        <div class="sub">${esc(project.code || '')}</div>
      </div>
    </div>

    <div class="header-grid">
      <div class="hcol left">
        <div class="hrow"><span class="k">Customer Name</span><span class="v">${esc(customerName)}</span></div>
        <div class="hrow"><span class="k">ผู้ตรวจสอบ</span><span class="v">${esc(reviewerName)}</span></div>
        <div class="hrow"><span class="k">ผู้ดูแล (AE)</span><span class="v">${esc(project.aeOwner || '')}</span></div>
        <div class="hrow"><span class="k">เบอร์ติดต่อ</span><span class="v">${COMPANY_TEL}</span></div>
        <div class="hrow"><span class="k">Line Official</span><span class="v">${COMPANY_LINE}</span></div>
        <div class="hrow"><span class="k">Email</span><span class="v">${esc(project.customerEmail || '')}</span></div>
      </div>
      <div class="hcol">
        <div class="hrow"><span class="k">แบรนด์</span><span class="v">${esc(project.metadata?.brand || '')}</span></div>
        <div class="hrow"><span class="k">ใบเสนอราคา</span><span class="v">${esc(project.metadata?.quotationNumber || '')}</span></div>
        <div class="hrow"><span class="k">เลขที่ PO</span><span class="v">${esc(project.metadata?.poNumber || '')}</span></div>
        <div class="hrow"><span class="k">วันที่</span><span class="v">${esc(fmtThai(project.startDate))}</span></div>
        <div class="hrow"><span class="k">Product Name</span><span class="v">${esc(productName)}</span></div>
        <div class="hrow" style="align-items: flex-start;">
          <span class="k">รายการสินค้า (FG)</span>
          <span class="v" style="font-weight: 400; flex: 1;">
          ${(project.projectProducts || []).length > 0 ? `<span class="fg-list">${(project.projectProducts || []).map(pp => {
            const prod = pp.product || {};
            return `<span class="fg-item">
              <span class="fg-name">${esc(prod.fgCode || '')} — ${esc(prod.productDescription || prod.brandName || 'ไม่มีชื่อสินค้า')} ${prod.volume ? `(${esc(prod.volume)} ${esc(prod.volumeUnit || 'ml')})` : ''}</span>
              <span class="fg-qty">สั่งซื้อ: ${esc(pp.orderQty || '-')} | ผลิต: ${esc(pp.productionQty || '-')}</span>
            </span>`;
          }).join('')}</span>` : (categoryFallback
            ? `<span class="fg-list"><span class="fg-item empty">
                 <span class="fg-name">${esc(categoryFallback)}</span>
                 <span class="fg-note">หมวดสินค้า (ยังไม่ผูก FG)</span>
               </span></span>`
            : `-`)}
          </span>
        </div>
      </div>
    </div>

    <table>
      ${colgroup}
      <thead>
        <tr>
          <th rowspan="2">no.</th>
          <th rowspan="2">Work Description</th>
          <th rowspan="2">Team</th>
          <th rowspan="2">Duration<br/>(Day)</th>
          <th rowspan="2">Start</th>
          <th rowspan="2">Finish</th>
          ${monthHeadCells || '<th rowspan="2">Timeline</th>'}
        </tr>
        <tr>${weekHeadCells}</tr>
      </thead>
      ${bodyTbodies || `<tbody><tr><td colspan="${totalCols}" style="text-align:center;padding:20px;color:#837868">ยังไม่มีขั้นตอนในโปรเจกต์นี้</td></tr></tbody>`}
    </table>

    <div class="legend">
      <div class="leg"><span class="sw" style="background:${STATUS_FILL.Completed}"></span>เสร็จสิ้น</div>
      <div class="leg"><span class="sw" style="background:${STATUS_FILL['In Progress']}"></span>กำลังดำเนินการ</div>
      <div class="leg"><span class="sw" style="background:${STATUS_FILL.Pending}"></span>รอดำเนินการ</div>
      <div class="leg"><span class="dia">◆</span> จุดสำคัญ (Milestone)</div>
    </div>

    <div class="signs">
      <div class="sign">
        <div class="sig-space"></div>
        <div class="nm">ลงชื่อ _____________________________________</div>
        <div class="nm-name">(${esc(preparerName || '...................................................')})</div>
        <div class="lbl">ผู้จัดทำ</div>
        <div class="role">ตำแหน่ง ACCOUNT COORDINATOR</div>
        <div class="date">วันที่ ______________________</div>
      </div>
      <div class="sign">
        <div class="sig-space"></div>
        <div class="nm">ลงชื่อ _____________________________________</div>
        <div class="nm-name">(${esc(reviewerName || '...................................................')})</div>
        <div class="lbl">ผู้ตรวจสอบ</div>
        <div class="role">ตำแหน่ง AE SUPERVISOR</div>
        <div class="date">วันที่ ______________________</div>
      </div>
    </div>

    ${signDepts.length ? `<div class="signs-dept">
      ${signDepts.map((dep) => `
      <div class="sign-sm">
        <div class="sig-space"></div>
        <div class="line"></div>
        <div class="nm-name">(.............................)</div>
        <div class="lbl">ผู้รับผิดชอบ</div>
        <div class="role">ฝ่าย ${dep}</div>
        <div class="date">วันที่ ____________</div>
      </div>`).join('')}
    </div>` : ''}
  </div>
</body>
</html>`;
}

export function openGanttPrintWindow(project) {
  const html = buildGanttPrintHTML(project);
  const w = window.open('', '_blank');
  if (!w) {
    alert('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
