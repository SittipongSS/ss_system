// ── ตัวกรองสองฉบับของรายงานการประเมินพื้นที่ — ตรรกะล้วน ───────────────────────────────────
//
// ⭐ ภาพนิ่งชุดเดียว (`surveyReportSnapshot.js`) → ของที่กระดาษพิมพ์ ต่อหนึ่งฉบับ
//     `surveyReportView(snapshot, { version: 'customer' | 'internal' })`
//   ทุกค่าที่ออกจากที่นี่เป็น **ข้อความพร้อมพิมพ์** (วันที่ · ตัวเลข · ขีดแทนช่องว่าง) — ตัวเรนเดอร์ไม่คิดอะไรเอง
//   นอกจากจัดวาง · ตัวจัดหน้า (`surveyReportLayout.js`) ก็อ่านจากตรงนี้ ⇒ สิ่งที่ถูกนับความสูงคือสิ่งที่ถูกพิมพ์
//
// 🔴 **ฉบับลูกค้าเป็นรายการอนุญาต (whitelist)** — `customerView` หยิบทีละช่องที่เอ่ยชื่อ ไม่มี `...snapshot`
//   ช่องใหม่ในภาพนิ่งจึงไม่มีทางไปถึงลูกค้าเองจนกว่าจะมีคนตั้งใจเติมที่นี่ (และแก้เทสต์รั่ว)
//   ฉบับลูกค้าไม่มี (มติเจ้าของ 29/09–01/10):
//     · จุดติดตั้งทุกรูปแบบ — ไม่มีคอลัมน์ ไม่มีส่วน ไม่มีบรรทัดอธิบาย ไม่มีรูปจุด
//     · พื้นที่ที่ตัดออก · ขนาดที่ระบบเสนอ · เหตุผลการเคาะ · เลขคำร้อง/ดีล/นัด · ผู้ขอ · ผู้ช่วย
//     · ประวัติตีกลับ/ดึงกลับ · เวลาที่บันทึกแต่ไม่เชื่อ · เครื่อง รุ่น ราคา
//   ⚠️ ฉบับภายใน = ฉบับลูกค้าทั้งชุด + ของที่เติม ⇒ ส่วนที่ใช้ร่วมกันเท่ากันทุกตัวอักษร (เทสต์ล็อก)
//
// รูปร่าง (สเปก PR-1 §3):
//   ลูกค้า  { version, head{surveyDate, company{name,lines}, form{code,revision,effectiveDate,line}},
//            party{customerName, siteName, siteCode, address, contact}, survey{dateText, timeText, assessorName},
//            table{rows[{no,zoneCode,name,floorText,dims[{key,text}],sqm,cbm,size,qty}], total{label,sqm,cbm,sizeMix,qty}},
//            zones[{no,title,name,floorText,zoneCode,sizeLine{dims,totals},parts,wide[{img,caption}],plan,note}],
//            signoff{assessor,approver,customer} }
//   ภายใน   + band{title,right}, panel{rows[{label,lines,rlabel,rlines}], sentLine{lead,text}},
//            table.rows[].spots, table.total.spots, table.spotNote{lead,text},
//            zones[].spots[{no,label,note,img}]   (เฉพาะจุดที่หัวหน้าเลือก),
//            appendix{ref, decisions{by,rows,total,footnote}, scope{countLine,rows}, history[], notes[], signs[3]}
//   · `img` = `{ attId, sha, w, h }` — ตัวเรนเดอร์แปลงเป็น src เอง (ตรึง: token `su-img:<sha>` · ร่าง: ลิงก์ไฟล์แนบ)
//   · หน้าของพื้นที่ (คอลัมน์ "หน้า") ไม่อยู่ที่นี่ — มาจากตัวจัดหน้า (`layout.zonePage`) เพราะต้องจัดหน้าก่อนถึงรู้
//
// คำเตือนก่อนส่งผล (PR-2 §8) อยู่ท้ายไฟล์: `surveyReportSendWarnings(view)` — เตือนอย่างเดียว ไม่บล็อก
//   คำต้องห้ามในหมายเหตุพื้นที่ + อักขระที่ฟอนต์ของกระดาษไม่มี (ทุกข้อความที่ลูกค้าเห็น)
import { documentFormLine } from '@/lib/documentBrand';
import { uncoveredChars } from '@/lib/documents/documentFontRanges';
import { fmtDate, fmtDateTime, fmtNumber, isoDateToWeekdayText } from '@/lib/format';
import { packageMixText } from './packageSizes';
import { surveyZoneTitle } from './surveyFieldView';
import { visitTimeText } from './surveyVisitTime';

const DASH = '—';
const NBSP = String.fromCharCode(0xa0); // ช่องว่างไม่ตัดบรรทัด (U+00A0)

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};
const orDash = (v) => text(v) || DASH;
const numText = (v) => fmtNumber(Number(v) || 0);
const dateText = (v) => (v ? fmtDate(v) : DASH);
const dateTimeText = (v) => (v ? fmtDateTime(v) : DASH);
const isCut = (z) => (z?.status || 'ok') === 'cut';
const img = (i) => ({ attId: i.attId ?? null, sha: i.sha ?? null, w: i.w ?? null, h: i.h ?? null });

/** "ศ. 25/09/2026" — วันในสัปดาห์จากวันในปฏิทิน (ไม่ใช่จุดเวลา) */
function weekdayDateText(day) {
  if (!day) return DASH;
  const weekday = isoDateToWeekdayText(day).split(' ')[0];
  return weekday ? `${weekday} ${fmtDate(day)}` : fmtDate(day);
}

/**
 * ชื่อพื้นที่แยกจากชั้น — กติกา "ชั้นขึ้นครั้งเดียว" เดียวกับจอ (`surveyZoneTitle`)
 * @returns `{ name, floorText, title }` · `floorText` = "· ชั้น GF" หรือ '' (ไม่มีชั้น/ชั้นอยู่ในชื่อแล้ว)
 *   ตัวเรนเดอร์พิมพ์ `name` แล้วตาม `floorText` แบบห้ามตัดบรรทัด (ชื่อยาวตัดในชื่อ ไม่ทิ้ง "GF" ไว้บรรทัดเดียว)
 */
function zoneNaming(zone) {
  const floor = text(zone?.floor);
  const title = surveyZoneTitle({ zoneName: zone?.name, floor });
  const tail = floor ? `${NBSP}· ชั้น${NBSP}${floor}` : null;
  if (tail && title.endsWith(tail)) {
    const name = title.slice(0, -tail.length);
    return { name, floorText: `· ชั้น ${floor}`, title: `${name} · ชั้น ${floor}` };
  }
  const plain = title.split(NBSP).join(' ');
  return { name: plain, floorText: '', title: plain };
}

const dimsText = (p) => `${numText(p.widthM)} × ${numText(p.lengthM)} × ${numText(p.heightM)}`;

/** ช่องขนาดของตารางหน้า 1 — ส่วนเดียว = ตัวเลขล้วน · สองส่วนขึ้นไป = ทีละส่วนพร้อมชื่อ (ไม่ต่อด้วย "+" ซึ่งอ่านเป็นผลบวก) */
function dimsCell(zone) {
  const parts = list(zone.parts);
  if (!parts.length) return [{ key: null, text: DASH }];
  if (parts.length === 1) return [{ key: null, text: dimsText(parts[0]) }];
  return parts.map((p) => ({ key: `ส่วน ${p.letter}`, text: dimsText(p) }));
}

/** "SM 1 · ST 1" เมื่อใช้มากกว่าหนึ่งขนาด · ขนาดเดียวทั้งใบ = ขีด (ช่องจำนวนบอกยอดอยู่แล้ว) */
function sizeMixText(snapshot) {
  const by = snapshot?.totals?.packagesBySize || {};
  if (Object.keys(by).length <= 1) return DASH;
  return packageMixText(by, list(snapshot.sizes)) || DASH;
}

const selectedSpots = (zone) => list(zone.spots).filter((s) => s?.selected === true);

/* ── ส่วนที่สองฉบับใช้ร่วมกัน ─────────────────────────────────────────── */

/**
 * บรรทัดใต้ชื่อบริษัทบนหัวหน้า 1 — ที่อยู่ · เลขผู้เสียภาษี · ช่องทางติดต่อ
 * (ตัวจัดหน้าเรียกตัวเดียวกันกับบริษัทตั้งต้นของระบบ เพื่อรู้ว่าหัวกระดาษของกระดานที่วัดไว้สูงกี่บรรทัด)
 */
export function surveyReportCompanyLines(company) {
  const c = company || {};
  const contact = [c.tel && `โทร ${c.tel}`, c.line && `Line ${c.line}`, c.website].filter(Boolean).join(' · ');
  return [c.address, c.taxId && `เลขประจำตัวผู้เสียภาษี ${c.taxId}`, contact].filter(Boolean);
}

function headPart(snapshot) {
  const c = snapshot.company || {};
  const f = snapshot.form || {};
  const visit = snapshot.visit || {};
  return {
    surveyDate: dateText(visit.actualDate || visit.scheduledDate),
    company: { name: orDash(c.name), lines: surveyReportCompanyLines(c) },
    form: {
      code: f.code || null, revision: f.revision || null, effectiveDate: f.effectiveDate || null,
      line: f.code ? documentFormLine({ code: f.code, revision: f.revision || '00', effectiveDate: f.effectiveDate || '' }).trim() : DASH,
    },
  };
}

function partyPart(snapshot) {
  const s = snapshot.site || {};
  return {
    customerName: orDash(snapshot.customer?.name),
    siteName: orDash(s.name),
    siteCode: orDash(s.code),
    address: orDash(s.address),
    contact: [s.contactName, s.contactPhone].filter(Boolean).join(' · ') || DASH,
  };
}

function surveyPart(snapshot) {
  const v = snapshot.visit || {};
  return {
    dateText: weekdayDateText(v.actualDate || v.scheduledDate),
    // ⚠️ กล่อง "การประเมิน" พิมพ์เวลาแบบฉบับลูกค้าทั้งสองฉบับ — ฉบับภายในบอกทั้งสองค่าที่แผงภายใน
    timeText: visitTimeText(v, { version: 'customer', closedBySend: v.closedBySend === true, credible: v.timeCredible }),
    assessorName: orDash(v.assignee?.name),
  };
}

function tableRow(zone) {
  const { name, floorText } = zoneNaming(zone);
  return {
    no: zone.no, zoneCode: orDash(zone.zoneCode), name, floorText,
    dims: dimsCell(zone), sqm: numText(zone.areaSqm), cbm: numText(zone.volumeCbm),
    size: orDash(zone.packageSize), qty: zone.packageQty ? numText(zone.packageQty) : DASH,
  };
}

function tablePart(snapshot, active) {
  const t = snapshot.totals || {};
  return {
    rows: active.map(tableRow),
    total: {
      label: `รวม ${numText(active.length)} พื้นที่`,
      sqm: numText(t.areaSqm), cbm: numText(t.volumeCbm),
      sizeMix: sizeMixText(snapshot), qty: numText(t.packageQty),
    },
  };
}

function zonePart(zone) {
  const parts = list(zone.parts);
  const single = parts.length === 1;
  const wide = list(zone.wide);
  const plans = list(zone.plan);
  const naming = zoneNaming(zone);
  return {
    no: zone.no,
    // `title` = ชื่อเต็มบรรทัดเดียว (alt ของรูป · บรรทัด "ต่อหน้า") · หัวพื้นที่พิมพ์ `name` แล้วตาม `floorText` แบบห้ามตัดบรรทัด
    title: naming.title, name: naming.name, floorText: naming.floorText,
    zoneCode: orDash(zone.zoneCode),
    sizeLine: {
      dims: single ? `${dimsText(parts[0])} ม.` : null,
      totals: `${numText(zone.areaSqm)} ตร.ม. · ${numText(zone.volumeCbm)} ลบ.ม.`,
    },
    // สองส่วนขึ้นไป = ตารางส่วนข้างภาพผัง · ส่วนเดียว = ขนาดพับอยู่ในหัวพื้นที่แล้ว
    parts: parts.length > 1 ? {
      rows: parts.map((p) => ({ name: `ส่วน ${p.letter}`, dims: dimsText(p), sqm: numText(p.areaSqm), cbm: numText(p.volumeCbm) })),
      total: { sqm: numText(zone.areaSqm), cbm: numText(zone.volumeCbm) },
    } : null,
    wide: wide.map((w, i) => ({ img: img(w), caption: `ภาพกว้าง ${i + 1}/${wide.length}` })),
    // ผังหลายรูป = รูปล่าสุด (หัวหน้าอัปผังที่แก้แล้วทับโดยไม่ลบของเก่า) — ภาพนิ่งพกรูปที่พิมพ์รูปเดียว
    // (ภาพนิ่งรุ่นแรกของ PR-1 เคยพกครบ เรียงเก่าก่อน ⇒ หยิบตัวท้ายเสมอ ใช้ได้ทั้งสองแบบ)
    plan: plans.length ? img(plans[plans.length - 1]) : null,
    note: text(zone.note),
  };
}

const E_SIGN = 'ลายเซ็นอิเล็กทรอนิกส์';

function signoffPart(snapshot) {
  const v = snapshot.visit || {};
  const r = snapshot.request || {};
  const role = text(v.assignee?.roleLabel);
  return {
    assessor: {
      title: 'ผู้ประเมิน', role: role ? `ฝ่ายบริการ · ${role}` : 'ฝ่ายบริการ', mark: E_SIGN,
      name: orDash(v.assignee?.name), date: dateText(v.actualDate || v.scheduledDate),
    },
    approver: {
      title: 'ผู้ตรวจสอบและอนุมัติ', role: 'หัวหน้าฝ่ายบริการ', mark: E_SIGN,
      name: orDash(r.answeredByName), date: dateText(r.answeredAt),
    },
    // ที่นั่งลูกค้า: ลงชื่อ · (ชื่อตัวบรรจง) · วันที่ — เส้นให้เขียนเป็นของตัวเรนเดอร์ · ไม่มีบรรทัดตำแหน่ง (มติ 29/09)
    customer: { title: 'ลูกค้ารับทราบ', caption: 'ยืนยันข้อมูลหน้างาน ไม่ใช่การสั่งซื้อ' },
  };
}

/* 🔴 ฉบับลูกค้า — หยิบทีละช่อง ห้ามกระจายภาพนิ่ง/พื้นที่ทั้งก้อน */
function customerView(snapshot) {
  const active = list(snapshot.zones).filter((z) => !isCut(z));
  return {
    version: 'customer',
    head: headPart(snapshot),
    party: partyPart(snapshot),
    survey: surveyPart(snapshot),
    table: tablePart(snapshot, active),
    zones: active.map(zonePart),
    signoff: signoffPart(snapshot),
  };
}

/* ── ฉบับภายใน ───────────────────────────────────────────────────────── */

function panelPart(snapshot) {
  const r = snapshot.request || {};
  const v = snapshot.visit || {};
  const requester = [r.requestedByName, r.team && `ทีม ${r.team}`, r.submittedAt && `ส่ง ${fmtDate(r.submittedAt)}`]
    .filter(Boolean).join(' · ');
  const team = [
    v.assignee?.name && `หัวหน้า ${v.assignee.name}`,
    ...list(v.helpers).map((name) => `ผู้ช่วย ${name}`),
  ].filter(Boolean);
  /* 🔴 สถานะปิดเรื่อง **ณ วันที่ออกเอกสาร** — กระดาษที่ตรึงแล้วพิมพ์ "รอฝ่ายขายปิดเรื่อง" จะเก่าทันทีที่ฝ่ายขายปิด
     ⇒ ปิดแล้ว = บอกใครปิดเมื่อไร · ยังไม่ปิด = บอกตรง ๆ ว่าเป็นสภาพ ณ วันที่ออก */
  const closure = r.closedAt
    ? `ปิดเรื่องโดย ${orDash(r.closedByName)} · ${dateTimeText(r.closedAt)}`
    : 'ยังไม่ปิดเรื่อง ณ วันที่ออก';
  return {
    rows: [
      {
        label: 'อ้างอิงคำร้อง', lines: [orDash(r.docNo)],
        rlabel: 'งานหน้างาน', rlines: [[v.code, v.statusLabel].filter(Boolean).join(' · ') || DASH],
      },
      { label: 'ชื่องาน', lines: [orDash(r.title)], rlabel: 'ทีม', rlines: team.length ? team : [DASH] },
      {
        label: 'ผู้ขอ (ฝ่ายขาย)', lines: [requester || DASH],
        rlabel: 'นัดไว้ · จริง',
        rlines: [visitTimeText(v, { version: 'internal', closedBySend: v.closedBySend === true, credible: v.timeCredible })],
      },
      {
        label: 'ดีล · ลูกค้า', lines: [[snapshot.deal?.code, snapshot.customer?.arCode].filter(Boolean).join(' · ') || DASH],
        rlabel: 'วันนัด ขอ / รับ', rlines: [`${dateText(r.requestedDueDate)} / ${dateText(r.committedDueDate)}`],
      },
      {
        label: 'มอบหมายโดย', lines: [orDash(r.assignedByName)],
        rlabel: 'ส่งผล ขอ / รับ', rlines: [`${dateText(r.requestedResultDate)} / ${dateText(r.committedResultDate)}`],
      },
    ],
    sentLine: {
      lead: 'ส่งผลให้ฝ่ายขายแล้ว',
      text: `ส่งโดย ${orDash(r.answeredByName)} · ${dateTimeText(r.answeredAt)} · ${closure}`,
    },
  };
}

/* เชิงอรรถของภาคผนวก ก — สร้างจากทะเบียนขนาดที่ตรึงไว้ (ทะเบียนเพิ่ม/แก้/ลบได้ · 0398) ไม่ฮาร์ดโค้ดสี่ขนาด */
function sizeFootnote(sizes) {
  const offered = list(sizes).filter((s) => s.autoSuggest !== false);
  const banded = offered.filter((s) => s.maxCbm !== null && s.maxCbm !== undefined).sort((a, b) => a.maxCbm - b.maxCbm);
  const open = offered.find((s) => s.maxCbm === null || s.maxCbm === undefined);
  /* 🔴 ไม่ใช้ "≤" / "⇒" — ฟอนต์ Sarabun ที่ฝังในกระดาษ (ชุด latin + thai) ไม่มีสองตัวนี้ ⇒ Chrome หยิบฟอนต์ของเครื่องมาแทน
     และ chromium บน production มีแต่ Open Sans (ไม่มี "⇒" = กล่องสี่เหลี่ยมบนกระดาษที่ตรึงแล้ว) · เทสต์ช่วงอักขระคุม */
  const bands = banded.map((s, i) => `ไม่เกิน ${numText(s.maxCbm)}${i === 0 ? ' ลบ.ม.' : ''} = ${s.code}`);
  if (open) bands.push(banded.length ? `เกิน ${numText(banded[banded.length - 1].maxCbm)} = ${open.code}` : `ทุกขนาดพื้นที่ = ${open.code}`);
  const manual = list(sizes).filter((s) => s.autoSuggest === false).map((s) => s.code);
  return [
    bands.length ? `ขนาดที่ระบบเสนอ: ${bands.join(' · ')}` : 'ระบบไม่เสนอขนาด',
    manual.length ? `${manual.join(' · ')} หัวหน้าเลือกเอง` : null,
    'จำนวนเสนอ 1 แพ็ค',
    'หัวหน้าแก้ได้',
  ].filter(Boolean);
}

const HISTORY_EVENTS = {
  recall: 'ดึงผลกลับมาแก้',
  send_back: 'ตีกลับให้ช่างแก้',
  send_back_done: 'ช่างแจ้งว่าแก้แล้ว',
};

function historyTotalsText(totals) {
  if (!totals) return DASH;
  return `${numText(totals.zones)} พื้นที่ · ${numText(totals.areaSqm)} ตร.ม. · ${numText(totals.packageQty)} แพ็คเกจ`;
}

/* ผู้บันทึกผลวัด — พื้นที่ที่คนเดียวกันบันทึกในนาทีเดียวกันรวมเป็นบรรทัดเดียว (ตามกระดานแม่แบบ) */
function saverLines(active) {
  const groups = [];
  for (const zone of active) {
    const stamp = [zone.surveyedByName, zone.surveyedAt && fmtDateTime(zone.surveyedAt)].filter(Boolean).join(' · ');
    if (!stamp) continue;
    const hit = groups.find((g) => g.stamp === stamp);
    if (hit) hit.names.push(zone.name);
    else groups.push({ stamp, names: [zone.name] });
  }
  return groups.length ? groups.map((g) => `${g.names.join(' · ')} — ${g.stamp}`) : [DASH];
}

function appendixPart(snapshot, active) {
  const r = snapshot.request || {};
  const v = snapshot.visit || {};
  const s = snapshot.site || {};
  const t = snapshot.totals || {};
  const c = snapshot.change || {};
  const sentAt = dateTimeText(r.answeredAt);

  const changed = list(snapshot.zones).filter((z) => isCut(z) || z.status === 'added');
  const body = String(r.body ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const prior = list(v.priorUnable).map((p) => [p.date && fmtDate(p.date), p.reason].filter(Boolean).join(' — ')).filter(Boolean);
  const assessorAt = [dateText(v.actualDate || v.scheduledDate), v.actualEndTime || v.actualStartTime].filter(Boolean).join(' ');

  return {
    ref: orDash(r.docNo),
    decisions: {
      by: `${orDash(r.answeredByName)} · ${sentAt}`,
      rows: active.map((zone) => {
        const { name, floorText } = zoneNaming(zone);
        return {
          no: zone.no, zoneCode: orDash(zone.zoneCode), name, floorText,
          cbm: numText(zone.volumeCbm), spots: numText(selectedSpots(zone).length),
          suggested: orDash(zone.packageSizeSuggested), size: orDash(zone.packageSize),
          qty: zone.packageQty ? numText(zone.packageQty) : DASH, reason: orDash(zone.packageNote),
        };
      }),
      total: {
        label: 'รวม', cbm: numText(t.volumeCbm), spots: numText(t.spotsSelected),
        suggested: DASH, sizeMix: sizeMixText(snapshot), qty: numText(t.packageQty), reason: DASH,
      },
      footnote: sizeFootnote(snapshot.sizes),
    },
    scope: {
      countLine: `ขอไป ${numText(c.requested)} · ตัด ${numText(c.cut)} · เพิ่ม ${numText(c.added)} = ประเมินจริง ${numText(c.assessed)} พื้นที่`,
      rows: changed.map((zone) => {
        const { name, floorText } = zoneNaming(zone);
        return {
          zoneCode: orDash(zone.zoneCode), name, floorText,
          status: isCut(zone) ? 'ตัดออก' : 'เพิ่มหน้างาน',
          cutReason: isCut(zone) ? orDash(zone.cutReason) : DASH,
        };
      }),
    },
    history: list(snapshot.history).map((h) => ({
      at: dateTimeText(h.at), event: HISTORY_EVENTS[h.kind] || orDash(h.kind),
      by: orDash(h.byName), reason: orDash(h.reason), totalsText: historyTotalsText(h.totals),
    })),
    notes: [
      { label: 'รายละเอียดคำร้อง (ฝ่ายขาย)', lines: body.length ? body : [DASH] },
      { label: 'เวลาเข้าไซต์', lines: [[s.accessText, s.accessNote].filter(Boolean).join(' · ') || DASH] },
      { label: 'ผู้บันทึกผลวัด', lines: saverLines(active) },
      { label: 'นัดที่ทำไม่ได้ก่อนหน้า', lines: prior.length ? prior : [DASH] },
    ],
    signs: [
      { title: 'ผู้ประเมิน', role: 'ส่งงานหน้างาน', signed: true, name: orDash(v.assignee?.name), date: assessorAt || DASH },
      { title: 'หัวหน้าฝ่ายบริการ', role: 'ผู้เคาะและส่งผล', signed: true, name: orDash(r.answeredByName), date: sentAt },
      r.closedAt
        ? { title: 'ฝ่ายขาย', role: 'ผู้ขอ · รับผลและปิดเรื่อง', signed: true, name: orDash(r.closedByName), date: dateTimeText(r.closedAt) }
        : { title: 'ฝ่ายขาย', role: 'ผู้ขอ · รับผลและปิดเรื่อง', signed: false, name: orDash(r.requestedByName), date: 'ยังไม่ปิดเรื่อง ณ วันที่ออก' },
    ],
  };
}

function internalView(snapshot) {
  const base = customerView(snapshot);
  const active = list(snapshot.zones).filter((z) => !isCut(z));
  return {
    ...base,
    version: 'internal',
    band: { title: 'ฉบับภายใน — ห้ามส่งลูกค้า', right: 'INTERNAL ONLY · มีข้อมูลการเคาะผลและข้อมูลภายใน' },
    panel: panelPart(snapshot),
    table: {
      rows: base.table.rows.map((row, i) => ({ ...row, spots: numText(selectedSpots(active[i]).length) })),
      total: { ...base.table.total, spots: numText(snapshot.totals?.spotsSelected) },
      spotNote: {
        lead: 'จุดที่ติดตั้งได้',
        text: 'คือตำแหน่งที่หน้างานรองรับการติดตั้ง · ตำแหน่งติดตั้งจริงกำหนดอีกครั้งตอนเข้าติดตั้ง',
      },
    },
    zones: base.zones.map((zone, i) => ({
      ...zone,
      /* เฉพาะจุดที่หัวหน้าเลือก (มติ 30/09) — เลข `k.n` นับจากทุกจุด จึงข้ามได้ · จุดที่เลือกแต่ไม่มีรูป = img ว่าง
         (ตัวเรนเดอร์ยังวาดกล่อง "ไม่มีภาพ" พร้อมเลขจุด) · จุดมีหลายรูป = รูปแรก */
      spots: selectedSpots(active[i]).map((spot) => ({
        no: spot.no, label: orDash(spot.label), note: text(spot.note),
        img: list(spot.photos).length ? img(spot.photos[0]) : null,
      })),
    })),
    appendix: appendixPart(snapshot, active),
  };
}

/**
 * @param snapshot ภาพนิ่ง v1
 * @param opts.version `'internal'` เท่านั้นที่ได้ฉบับภายใน — ค่าอื่นทุกค่า (รวมไม่ส่ง/พิมพ์ผิด) = ฉบับลูกค้า
 *   ⚠️ ทางที่ปลอดภัยเป็นค่าตั้งต้น: ผู้เรียกที่ลืมส่ง version ต้องไม่ได้ข้อมูลภายในไปโดยบังเอิญ
 */
export function surveyReportView(snapshot, { version = 'customer' } = {}) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return version === 'internal' ? internalView(snap) : customerView(snap);
}

/* คำที่ฉบับลูกค้าต้องไม่เอ่ยถึง — ของระบบเองไม่มีแล้ว เหลือทางเดียวที่คำพวกนี้ไปถึงลูกค้าได้คือข้อความที่ช่าง/หัวหน้าพิมพ์เอง
     · เครื่อง รุ่น ราคา (มติ 29/09: ไม่มีที่ไหนในเอกสาร)
     · จุดติดตั้ง (มติ 30/09–01/10: ฉบับลูกค้าไม่มีจุดทุกรูปแบบ — ไม่มีคอลัมน์ ไม่มีส่วน ไม่มีบรรทัดอธิบาย)
       ของจริง RQ-AS-26090186 พื้นที่ 2: "…ทำให้ทางทีมประเมินจุดติดตั้งไม่ได้ครับ" เคยผ่านไปโดยไม่มีคำเตือน
   ⚠️ คำที่ยาวกว่ามาก่อน — "จุดที่ติดตั้ง"/"จุดติดตั้ง" ถูกรายงานเป็นคำเดียว ไม่ซ้ำกับ "จุดติด" ที่เป็นท่อนของมัน */
const CUSTOMER_FLAG_GROUPS = [
  { words: ['เครื่อง', 'รุ่น', 'ราคา', 'บาท'], rule: 'เอกสารฉบับลูกค้าไม่ระบุเครื่อง รุ่น หรือราคา' },
  { words: ['จุดที่ติดตั้ง', 'จุดติดตั้ง', 'จุดติด'], rule: 'เอกสารฉบับลูกค้าไม่ระบุจุดติดตั้ง' },
];

/** คำต้องห้ามที่พบในข้อความ — คำที่เป็นท่อนของคำที่พบแล้ว (ตำแหน่งเดียวกัน) ไม่นับซ้ำ */
function flaggedWords(note, words) {
  const found = [];
  let rest = note;
  for (const word of words) {
    if (!rest.includes(word)) continue;
    found.push(word);
    rest = rest.split(word).join(' ');
  }
  return found;
}

/**
 * คำเตือน (ไม่บล็อก) ของข้อความอิสระที่ลูกค้าเห็น — ฉบับลูกค้ามีข้อความอิสระที่เดียวคือ "หมายเหตุพื้นที่"
 * ⚠️ เตือน ไม่แก้ ไม่ตัด: หมายเหตุเป็นคำของคนหน้างาน · หัวหน้าเป็นคนตัดสินตอนดูตัวอย่างก่อนส่ง
 * 🔑 PR-2: ต้องกางคำเตือนชุดนี้ให้หัวหน้าเห็น **ก่อนตรึง** (ยืนยัน หรือกลับไปแก้หมายเหตุ) — กระดาษที่ตรึงแล้วแก้ไม่ได้
 *   ชุดเต็มที่จอกางคือ `surveyReportSendWarnings` ข้างล่าง (ชุดนี้ + อักขระที่กระดาษพิมพ์ไม่ได้)
 * @param view ผลของ `surveyReportView` ฉบับใดก็ได้ (หมายเหตุพื้นที่พิมพ์เหมือนกันทั้งสองฉบับ)
 */
export function customerFreeTextWarnings(view) {
  const out = [];
  for (const zone of list(view?.zones)) {
    const note = String(zone?.note ?? '');
    for (const group of CUSTOMER_FLAG_GROUPS) {
      const words = flaggedWords(note, group.words);
      if (!words.length) continue;
      out.push(`หมายเหตุพื้นที่ ${zone.no} มีคำว่า ${words.map((w) => `"${w}"`).join(' ')} — ${group.rule} ตรวจข้อความก่อนส่ง`);
    }
  }
  return out;
}

/* ── คำเตือนก่อนส่งผล (สเปก PR-2 §8 · มติเจ้าของ 01/10 ข้อ 3) ─────────────────────────────── */

/* ส่วนของ view ที่ลูกค้าเห็น — เรียงตามที่คนหน้างานพิมพ์เองก่อน (ลูกค้า/สถานที่ → การประเมิน → พื้นที่)
   แล้วค่อยของที่มาจากทะเบียน (ตารางสรุป → ลงนาม → หัวกระดาษ) ⇒ บรรทัดคำเตือนเรียงตามนี้
   ⚠️ ส่งฉบับภายในเข้ามาก็ตรวจเท่านี้: แถบ · แผงภายใน · ภาคผนวก ไม่อยู่ในรายการ และคีย์ของจุดถูกข้ามทุกชั้น */
const PRINTED_PARTS = ['party', 'survey', 'zones', 'table', 'signoff', 'head'];
const INTERNAL_KEYS = new Set(['spots', 'spotNote']);
/* รูป (`{ attId, sha, w, h }`) ไม่ใช่ข้อความบนกระดาษ — sha/รหัสไฟล์แนบไม่ถูกพิมพ์ */
const IMAGE_KEYS = new Set(['img', 'plan']);

/* ชื่อช่องในบรรทัดคำเตือน — คำเดียวกับป้ายบนกระดาษ (หัวหน้าหาช่องที่ต้องแก้ได้จากคำนี้) */
const PRINTED_FIELDS = {
  'party.customerName': 'ชื่อลูกค้า',
  'party.siteName': 'ชื่อสถานที่',
  'party.siteCode': 'รหัสไซต์',
  'party.address': 'ที่อยู่',
  'party.contact': 'ผู้ติดต่อหน้างาน',
  'survey.assessorName': 'ชื่อผู้ประเมิน',
  'signoff.assessor.name': 'ชื่อผู้ประเมิน',
  'signoff.assessor.role': 'ตำแหน่งผู้ประเมิน',
  'signoff.approver.name': 'ชื่อผู้ตรวจสอบและอนุมัติ',
  'head.company.name': 'ชื่อบริษัท',
  'head.company.lines': 'ที่อยู่และช่องทางติดต่อของบริษัท',
  'head.form': 'รหัสแบบฟอร์ม',
  'table.total.sizeMix': 'ขนาดแพ็คเกจรวม',
};
const PRINTED_PART_FALLBACK = {
  party: 'ข้อมูลลูกค้าและสถานที่', survey: 'ข้อมูลการประเมิน', table: 'ตารางสรุป', signoff: 'ส่วนลงนาม', head: 'หัวกระดาษ',
};
/* ช่องของพื้นที่ — ใช้ทั้งแถวของตารางหน้า 1 (`table.rows[i]`) และบล็อกพื้นที่ (`zones[i]`) ⇒ ชื่อเดียวกันรวมเป็นบรรทัดเดียว */
const PRINTED_ZONE_FIELDS = {
  name: 'ชื่อพื้นที่', title: 'ชื่อพื้นที่', floorText: 'ชั้นของพื้นที่',
  zoneCode: 'รหัสพื้นที่', note: 'หมายเหตุพื้นที่', size: 'ขนาดแพ็คเกจของพื้นที่',
};

/** ข้อความทุกตัวใต้ค่าหนึ่ง พร้อมเส้นทางและออบเจกต์ที่ถือมัน — ข้ามรูปกับคีย์ของฉบับภายใน */
function printedStrings(value, path, out, parent = null) {
  if (typeof value === 'string') out.push({ path, value, parent });
  else if (Array.isArray(value)) value.forEach((v, i) => printedStrings(v, [...path, i], out, value));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (INTERNAL_KEYS.has(key) || IMAGE_KEYS.has(key)) continue;
      printedStrings(v, [...path, key], out, value);
    }
  }
  return out;
}

function printedFieldLabel(view, path) {
  const [part] = path;
  const inRow = part === 'table' && path[1] === 'rows';
  if (part === 'zones' || inRow) {
    const zone = inRow ? view.table.rows[path[2]] : view.zones[path[1]];
    const field = PRINTED_ZONE_FIELDS[path[inRow ? 3 : 2]] || 'ข้อมูลพื้นที่';
    return zone?.no === undefined || zone?.no === null ? field : `${field} ${zone.no}`;
  }
  // ยาวไปสั้น: `head.company.lines.0` → `head.company.lines` → `head.company` → …
  const keys = path.filter((key) => typeof key === 'string');
  for (let n = keys.length; n > 1; n -= 1) {
    const label = PRINTED_FIELDS[keys.slice(0, n).join('.')];
    if (label) return label;
  }
  return PRINTED_PART_FALLBACK[part] || 'ข้อความบนเอกสาร';
}

const LISTED_CHARS = 6;
const NOT_VISIBLE_ALONE = /[\p{C}\p{M}]/u; // ตัวควบคุม · ตัวที่ยังไม่กำหนด · วรรณยุกต์ผสม — พิมพ์เดี่ยว ๆ แล้วมองไม่เห็น
const codeText = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
/* "😀 U+1F600" — ตัวอักขระให้หัวหน้าหาในข้อความ · รหัสบอกว่าเป็นตัวพิเศษ (ขีด U+2010 หน้าตาเหมือนขีดธรรมดาทุกประการ) */
const charText = (ch) => (NOT_VISIBLE_ALONE.test(ch) ? codeText(ch) : `${ch} ${codeText(ch)}`);

function unprintableText(chars) {
  const shown = chars.slice(0, LISTED_CHARS).map(charText).join(' · ');
  return chars.length > LISTED_CHARS ? `${shown} และอีก ${numText(chars.length - LISTED_CHARS)} ตัว` : shown;
}

/** บรรทัด "<ช่อง> มีอักขระที่เอกสารพิมพ์ไม่ได้ (…)" — ช่องละบรรทัด ทุกข้อความที่ลูกค้าเห็น */
function unprintableWarnings(view) {
  const found = new Map(); // ชื่อช่อง → อักขระที่พิมพ์ไม่ได้ (ไม่ซ้ำ เรียงตามที่พบ)
  for (const part of PRINTED_PARTS) {
    for (const { path, value, parent } of printedStrings(view[part], [part], [])) {
      let chars = uncoveredChars(value);
      // `title` = ชื่อ + ชั้น ต่อกัน — อักขระที่มาจากชั้นรายงานที่ "ชั้นของพื้นที่" แล้ว ไม่ต้องโทษชื่อซ้ำ
      if (chars.length && part === 'zones' && path[2] === 'title') {
        const fromFloor = uncoveredChars(parent?.floorText);
        chars = chars.filter((ch) => !fromFloor.includes(ch));
      }
      if (!chars.length) continue;
      const label = printedFieldLabel(view, path);
      const seen = found.get(label) || [];
      for (const ch of chars) if (!seen.includes(ch)) seen.push(ch);
      found.set(label, seen);
    }
  }
  return [...found].map(([label, chars]) => `${label} มีอักขระที่เอกสารพิมพ์ไม่ได้ (${unprintableText(chars)}) — จะขึ้นเป็นกล่องสี่เหลี่ยม`);
}

/**
 * คำเตือนทั้งชุดที่หัวหน้าต้องเห็นก่อนกด "ส่งผลให้ฝ่ายขาย" — **เตือนอย่างเดียว ไม่บล็อก** (มติ 01/10 ข้อ 3:
 * ข้อความที่คนหน้างานพิมพ์ ขึ้นฉบับลูกค้าตามที่พิมพ์)
 *   ① คำว่าเครื่อง/รุ่น/ราคา/จุดติดตั้ง — **เฉพาะหมายเหตุพื้นที่** (`customerFreeTextWarnings`)
 *      ชื่อพื้นที่ไม่ตรวจ: "ห้องเครื่อง" เป็นชื่อพื้นที่จริง (สเปก PR-2 ข้อ 33)
 *   ② อักขระที่ฟอนต์ของกระดาษไม่มี — **ทุกข้อความที่ลูกค้าเห็น** (ชื่อ/หมายเหตุพื้นที่ · ลูกค้า · สถานที่ · ที่อยู่ · ผู้ติดต่อ · …)
 *      อีโมจิ · ขีด U+2010 · "≤" "→" ⇒ กล่องสี่เหลี่ยมบนกระดาษที่ตรึงแล้ว · ช่องว่างกับ ZWSP ไม่นับ (`uncoveredChars`)
 * 🔑 เซิร์ฟเวอร์เป็นคนคิดรายการนี้ (`surveyReportPrecheck`) ส่งให้จอ แล้วจอส่งกลับเป็น `seenWarnings` — เทียบกันทั้งบรรทัด
 *   ⇒ ข้อความต้องนิ่ง: view เดียวกันได้บรรทัดเดิมทุกครั้ง ตามลำดับเดิม
 * @param view ผลของ `surveyReportView` — ฉบับลูกค้า (ฉบับภายในได้ผลเท่ากัน: ตรวจเฉพาะส่วนที่ลูกค้าเห็น)
 * @returns `string[]` · `[]` = ไม่มีอะไรต้องเตือน
 */
export function surveyReportSendWarnings(view) {
  const v = view && typeof view === 'object' ? view : {};
  return [...customerFreeTextWarnings(v), ...unprintableWarnings(v)];
}
