// ── ชุดทดสอบของรายงานการประเมินพื้นที่ — ใช้ร่วมกันระหว่างเทสต์กับตัวเรนเดอร์ทดลอง (harness) ─────────
//
// ⚠️ **ไม่ใช่โค้ดของแอป** — ไม่มี route/จอไหน import ไฟล์นี้ (นามสกุล .mjs · อยู่นอก bundle)
//
// สามอย่างในไฟล์เดียว:
//   ① `surveyReportInputsFromFixture`  แปลงไฟล์ `real/fixture.json` (ของจริง RQ-AS-26090186 ที่ดึงจากฐานแบบอ่านอย่างเดียว)
//      → อินพุตของ `buildSurveyReportSnapshot` · harness กับเทสต์ของจริงใช้ตัวเดียวกัน
//   ② `syntheticSurveyFixture`         **แฝดสังเคราะห์** ของไฟล์นั้น — รูปร่างและตัวเลขเท่ากันทุกตัว แต่ชื่อลูกค้า/คน/เบอร์โทร
//      เป็นของสมมติ · `fixture.json` มีชื่อลูกค้าจริงและเบอร์โทรจริง จึงอยู่นอกรีโป (เทสต์ของจริงข้ามเองเมื่อไม่มีไฟล์)
//   ③ `markedSurveyInputs`             อินพุตที่ทุกช่องพกเครื่องหมายไม่ซ้ำ — เทสต์ "รั่ว" grep หาในฉบับลูกค้า
//      (ทั้ง view ในงวดนี้ และ HTML ในงวดถัดไป ใช้ชุดเดียวกัน)
import { createHash } from 'node:crypto';
import { suggestedPackageSize } from './packageSizes.js';
import { surveyZoneSize } from './survey.js';

/** ชุดตั้งต้นของทะเบียนขนาดแพ็คเกจ (0398) — XS ห้องน้ำ (เลือกเอง) · SM ≤ 300 · ST ≤ 2,400 · XL เกิน 2,400 */
export const PACKAGE_SIZE_SEED = Object.freeze([
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false, note: 'ห้องน้ำ' },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true, note: null },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true, note: null },
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true, note: null },
]);

export const TEST_COMPANY = Object.freeze({
  name: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด',
  address: '2/4 ซอยเพชรเกษม 35/1 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160',
  taxId: '0105557081665',
  tel: '02-000-7722',
  line: '@perfumefactory',
  website: 'www.scentandsense.co.th',
});

export const TEST_FORM = Object.freeze({ code: 'FM-TS-01', revision: '00', effectiveDate: '29/09/2569' });

/* ── ① fixture.json → อินพุตของตัวสร้างภาพนิ่ง ─────────────────────────────────── */

// fixture เก็บวันที่แบบที่จอพิมพ์ ("25/09/2026") — ฐานเก็บ `YYYY-MM-DD`
const isoDay = (value) => {
  const m = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (value || null);
};
// จุดเวลาใน fixture = { date, time, iso } — ฐานเก็บ timestamptz (ISO)
const isoAt = (value) => (value && typeof value === 'object' ? value.iso || null : value || null);

const KINDS = [['wide', 'survey_wide'], ['plan', 'survey_plan'], ['spot', 'survey_spot']];

/** sha ปลอมที่นิ่ง (64 hex) จาก id ไฟล์ — ใช้เมื่อผู้เรียกไม่ได้ส่งรูปจริงมา */
export const fakeSha = (seed) => createHash('sha256').update(String(seed)).digest('hex');

/**
 * @param fixture รูปร่างของ `mockups/survey-report-doc/real/fixture.json`
 * @param opts.sizes      ทะเบียนขนาด (ไม่ส่ง = ชุดตั้งต้น 0398)
 * @param opts.spotLinks  `'order'` (ค่าตั้งต้น) = ผูกรูปจุดกับจุดตามลำดับอัป **เฉพาะในชุดทดสอบนี้** — ของจริงไม่มีวันเดาแบบนี้
 *                        (รูปของ RQ-AS-26090186 อัปก่อนมี `metadata.spotId` · FIXTURE.md:83,96) · `null` = ปล่อยไว้ไม่ผูก
 *                        (ภาพนิ่งจะติดด่าน "ยังไม่ได้ผูกจุด") · หรือ `{ [attachmentId]: spotId }`
 * @param opts.photos     `{ 'z1-wide-1': { sha, w, h, bytes } }` รูปจริงที่ harness อ่านจากดิสก์ — ไม่ส่ง = sha ปลอมที่นิ่ง
 * @param opts.withImages `false` = ไม่ส่งรูปที่เตรียมแล้ว (จำลองรอบตรวจก่อนเตรียมรูป)
 */
export function surveyReportInputsFromFixture(fixture, {
  sizes = PACKAGE_SIZE_SEED, spotLinks = 'order', photos = null, withImages = true,
  company = TEST_COMPANY, form = TEST_FORM, assigneeRoleLabel = 'เจ้าหน้าที่บริการอาวุโส (Senior)',
  takenAt = null,
} = {}) {
  const fr = fixture.request || {};
  const request = {
    id: fr.id, docNo: fr.docNo, kind: fr.kind, status: fr.status, title: fr.title, body: fr.body, team: fr.team,
    requestedById: fr.requestedById || null, requestedByName: fr.requestedByName,
    submittedAt: isoAt(fr.submittedAt),
    assignedByName: fr.assignedByName || null,
    requestedDueDate: isoDay(fr.requestedDueDate), requestedDueTime: fr.requestedDueTime || null,
    committedDueDate: isoDay(fr.committedDueDate), committedDueTime: fr.committedDueTime || null,
    requestedResultDate: isoDay(fr.requestedResultDate), committedResultDate: isoDay(fr.committedResultDate),
    answeredAt: isoAt(fr.answeredAt), answeredById: fr.answeredById || null, answeredByName: fr.answeredByName || null,
    closedAt: isoAt(fr.closedAt), closedByName: fr.closedByName || null,
    cancelledAt: isoAt(fr.cancelledAt),
  };

  const visits = Array.isArray(fixture.visits) ? fixture.visits : [];
  const done = [...visits].reverse().find((v) => v.status === 'done') || visits[visits.length - 1] || null;
  const visit = done && {
    code: done.code, status: done.status,
    scheduledDate: isoDay(done.scheduledDate), startTime: done.startTime || null, endTime: done.endTime || null,
    actualDate: isoDay(done.actualDate), actualStartTime: done.actualStartTime || null,
    actualEndTime: done.actualEndTime || null, actualEndDate: isoDay(done.actualEndDate),
    assigneeId: done.assigneeId || null, assigneeName: done.assigneeName || null,
  };
  const helpers = (done?.helpers || []).map((h) => (typeof h === 'string' ? { name: h } : h));
  const priorUnable = visits.filter((v) => v !== done && v.unableReason)
    .map((v) => ({ date: isoDay(v.actualDate || v.scheduledDate), reason: v.unableReason }));

  const zones = [];
  const zoneRegistry = [];
  const filesByZone = {};
  const imageByAttId = {};
  for (const [index, z] of (fixture.zones || []).entries()) {
    const parts = (z.parts || []).map((p, i) => ({
      id: p.id || `P-${z.surveyZoneId}-${i}`, label: p.label ?? null,
      widthM: p.widthM, lengthM: p.lengthM, heightM: p.heightM,
    }));
    const row = {
      id: z.surveyZoneId, requestId: fr.id, zoneId: z.zoneId || null, zoneCode: z.zoneCode || null,
      zoneName: z.zoneName, floor: z.floorOnSurveyRow ?? z.floor ?? null,
      status: z.status || 'ok', cutReason: z.cutReason || null,
      parts, spots: (z.spots || []).map((s) => ({ id: s.id, label: s.label, note: s.note ?? null, selected: s.selected === true })),
      packageQty: z.packageQty ?? null, packageNote: z.packageNote ?? null,
      packageSize: z.packageSize ?? null, packageSizeSuggested: z.packageSizeSuggested ?? null,
      packageSizeManual: z.packageSizeManual === true,
      note: z.note ?? null, surveyedByName: z.surveyedByName || null, surveyedAt: isoAt(z.surveyedAt),
      sortOrder: index,
    };
    /* ของจริงถูกเคาะก่อนมีขนาดแพ็คเกจ — เติมค่าที่ระบบจะเสนอ (มติ 01/10 ข้อ 7: 278.08 → SM · 671.67 → ST)
       เหมือนที่หัวหน้าจะกดรับข้อเสนอบนแท็บสรุป */
    if (row.packageQty && !row.packageSize) {
      const offer = suggestedPackageSize(surveyZoneSize(parts).volumeCbm, sizes);
      row.packageSize = offer?.code ?? null;
      row.packageSizeSuggested = offer?.code ?? null;
    }
    zones.push(row);
    if (z.zoneId) zoneRegistry.push({ id: z.zoneId, code: z.zoneCode || null, floor: z.floor ?? null, building: z.building ?? null });

    const files = [];
    for (const [kind, docType] of KINDS) {
      for (const [i, f] of (z.photos?.[kind] || []).entries()) {
        const metadata = { ...(f.metadata || {}) };
        if (kind === 'spot') {
          if (spotLinks === 'order' && row.spots[i]) metadata.spotId = row.spots[i].id;
          else if (spotLinks && typeof spotLinks === 'object' && spotLinks[f.id]) metadata.spotId = spotLinks[f.id];
        }
        files.push({
          id: f.id, entityType: 'service_survey_zone', entityId: row.id, docType,
          fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
          createdAt: isoAt(f.uploadedAt), metadata,
        });
        const key = `z${z.no ?? index + 1}-${kind}-${i + 1}`;
        imageByAttId[f.id] = photos?.[key] || {
          sha: fakeSha(f.id), w: kind === 'plan' ? 1199 : 1400, h: kind === 'plan' ? 919 : 1051, bytes: f.sizeBytes || 1,
        };
      }
    }
    filesByZone[row.id] = files;
  }

  const history = (fixture.thread || [])
    .filter((t) => ['recall', 'send_back', 'send_back_done'].includes(t.kind))
    .map((t, i) => ({
      id: t.id || `EUP-${i}`, kind: t.kind, body: t.body, meta: t.meta || {},
      authorId: t.authorId || null, authorName: t.authorName, createdAt: isoAt(t.at),
    }));

  return {
    takenAt: takenAt || request.answeredAt,
    request,
    deal: fixture.deal ? { code: fixture.deal.code } : null,
    customer: fixture.customer ? { id: fixture.customer.id || null, arCode: fixture.customer.arCode, name: fixture.customer.name } : null,
    site: fixture.site ? {
      code: fixture.site.code, name: fixture.site.name, address: fixture.site.address,
      contactName: fixture.site.contactName, contactPhone: fixture.site.contactPhone,
      accessFrom: fixture.site.accessFrom, accessTo: fixture.site.accessTo,
      accessDays: fixture.site.accessDays, accessNote: fixture.site.accessNote,
      note: fixture.site.siteNote ?? null,
    } : null,
    visit,
    visitClosedBySend: false,
    assigneeRoleLabel,
    helpers,
    priorUnable,
    zones,
    zoneRegistry,
    filesByZone,
    ...(withImages ? { imageByAttId } : {}),
    sizes,
    history,
    company,
    form,
  };
}

/* ── ② แฝดสังเคราะห์ของ RQ-AS-26090186 ────────────────────────────────────────── */

const at = (iso) => {
  // ⚠️ ชุดทดสอบ — ค่าตายตัว ไม่ได้อ่านนาฬิกา · date/time ที่นี่ไม่ถูกใช้ (ตัวแปลงอ่านแค่ iso)
  return { date: null, time: null, iso };
};

const photo = (id, fileName, sizeBytes, iso) => ({ id, fileName, mimeType: 'image/jpeg', sizeBytes, uploadedAt: at(iso), metadata: {} });

/**
 * รูปร่างเดียวกับ `real/fixture.json` · ตัวเลข/รหัสพื้นที่/ชื่อพื้นที่/เวลา เท่าของจริงทุกตัว (เลย์เอาต์จึงเท่ากัน)
 * ชื่อบริษัท ชื่อคน ผู้ติดต่อ เบอร์โทร ที่อยู่ เป็นของสมมติ
 */
export function syntheticSurveyFixture() {
  return {
    request: {
      id: 'DR-synthetic-0001', docNo: 'RQ-AS-26090186', kind: 'site_survey', status: 'answered',
      title: 'ประเมินพื้นที่สนามเทนนิสสำหรับติดตั้งเครื่องกระจายกลิ่น',
      body: 'ลูกค้าจะเปิดใช้งานสถานที่วันเสาร์ที่ 26 กันยายน นำส่งให้ภายในวันศุกร์ที่ 25/9/2026\nทีมยืนยันเวลาว่าจะเข้าไป ก่อนเที่ยงวันศุกร์ 26/09',
      team: 'SV', requestedByName: 'Sale Requester', submittedAt: at('2026-09-23T07:36:11.899+00:00'),
      assignedByName: null,
      requestedDueDate: '25/09/2026', requestedDueTime: '15:00',
      committedDueDate: '25/09/2026', committedDueTime: '12:00',
      requestedResultDate: '25/09/2026', committedResultDate: '25/09/2026',
      answeredById: 'U-head', answeredByName: 'Head Approver', answeredAt: at('2026-09-26T03:01:26.314+00:00'),
      closedByName: null, closedAt: null, cancelledAt: null,
    },
    thread: [
      { kind: 'submit', authorName: 'Sale Requester', at: at('2026-09-23T07:36:12.565+00:00'), body: 'ส่งเคสถึง TS — 1 พื้นที่', meta: {} },
      { kind: 'answer', authorName: 'Crew Saver', at: at('2026-09-23T08:01:53.433+00:00'), body: 'TS ตอบเรื่องนี้แล้ว — รอผู้ขอปิดเรื่อง', meta: {} },
      {
        kind: 'recall', authorName: 'Admin Tester', at: at('2026-09-24T17:08:25.78+00:00'),
        body: 'TS ดึงผลประเมินกลับมาแก้ — ยังไม่ได้ส่งผล · ตัวเลขที่ส่งไปแล้ว 1 พื้นที่ · 0 ตร.ม. · 0 แพ็คเกจ (อย่าเพิ่งใช้ตั้งราคา)',
        meta: { totals: { zones: 1, areaSqm: 0, cutZones: 0, volumeCbm: 0, addedZones: 0, packageQty: 0, spotsTotal: 0, spotsSelected: 0 } },
      },
      { kind: 'comment', authorName: 'Crew Saver', at: at('2026-09-25T10:47:56.314+00:00'), body: 'หน้างานยังก่อสร้างไม่เสร็จ', meta: {} },
      { kind: 'answer', authorName: 'Head Approver', at: at('2026-09-26T03:01:26.424+00:00'), body: 'TS ตอบเรื่องนี้แล้ว', meta: {} },
    ],
    customer: { arCode: 'AR-9001', name: 'บริษัท ตัวอย่าง แอนด์ สปอร์ต บางกอก เทนนิส คลับ จำกัด' },
    deal: { code: 'DL-260900570' },
    site: {
      code: 'ST-9001-01-BKK-1159', name: 'Sample & Sports Bangkok Tennis Club',
      address: '99 ถนนตัวอย่าง 32 แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร 10250',
      contactName: 'คุณสมมติ', contactPhone: '0800000000',
      accessFrom: '09:00', accessTo: '17:00', accessDays: [5], accessNote: 'โทรแจ้งก่อนเข้าไป',
      siteNote: 'โน้ตภายในของไซต์ — ห้ามพิมพ์',
    },
    visits: [{
      code: 'SV-26090013', kind: 'survey', status: 'done',
      scheduledDate: '25/09/2026', startTime: '12:00', endTime: null,
      actualDate: '25/09/2026', actualStartTime: '17:45', actualEndTime: '17:45', actualEndDate: null,
      assigneeId: 'U-lead', assigneeName: 'Lead Assessor', helpers: [], unableReason: null,
    }],
    zones: [
      {
        no: 1, surveyZoneId: 'SVZ-syn-1', zoneId: 'SZN-syn-1', zoneCode: 'ZN-1159-10253',
        zoneName: 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส', floor: 'GF', floorOnSurveyRow: 'GF', building: null,
        status: 'ok', cutReason: null,
        parts: [{ label: 'ห้องที่ 1', widthM: 8, lengthM: 7.9, heightM: 4.4 }],
        spots: [{ id: 'new-zsgl2m9', label: 'ห้องที่ 1', note: null, selected: true }],
        packageQty: 1, packageNote: null,
        note: 'เนื่องจากพื้นยังก่อสร้างไม่เสร็จทำให้ทีมคาดว่าใช้ประมาณ 1 เครื่อง',
        surveyedByName: 'Crew Saver', surveyedAt: at('2026-09-26T02:00:08.014+00:00'),
        photos: {
          wide: [
            photo('att-z1-w1', 'S__70180869.jpg', 1164838, '2026-09-26T01:57:10.720841+00:00'),
            photo('att-z1-w2', 'S__70180870.jpg', 1272027, '2026-09-26T01:57:17.535744+00:00'),
          ],
          spot: [photo('att-z1-s1', 'S__70180870.jpg', 1272027, '2026-09-26T01:59:54.585502+00:00')],
          plan: [photo('att-z1-p1', '9047.jpg', 51157, '2026-09-26T02:00:04.466756+00:00')],
        },
      },
      {
        no: 2, surveyZoneId: 'SVZ-syn-2', zoneId: 'SZN-syn-2', zoneCode: 'ZN-1159-10523',
        zoneName: 'ห้องที่2', floor: 'GF', floorOnSurveyRow: 'GF', building: null,
        status: 'added', cutReason: null,
        parts: [{ label: 'ห้องที่ 2', widthM: 7.7, lengthM: 14.3, heightM: 6.1 }],
        spots: [
          { id: 'new-7s2knzl', label: 'จุดที่ 1', note: null, selected: true },
          { id: 'new-t8xz4rk', label: 'จุดที่ 2', note: null, selected: true },
        ],
        packageQty: 1, packageNote: null,
        note: 'เนื่องจากพื้นที่ยังก่อสร้างไม่เสร็จทำให้ทางทีมประเมินจุดติดตั้งไม่ได้ครับ',
        surveyedByName: 'Crew Saver', surveyedAt: at('2026-09-26T02:40:28.844+00:00'),
        photos: {
          wide: [photo('att-z2-w1', 'S__70180879.jpg', 1384584, '2026-09-26T02:33:26.148484+00:00')],
          spot: [
            photo('att-z2-s1', 'S__70180878.jpg', 1656690, '2026-09-26T02:33:33.534847+00:00'),
            photo('att-z2-s2', 'S__70180879.jpg', 1384584, '2026-09-26T02:33:40.050195+00:00'),
          ],
          plan: [photo('att-z2-p1', '9049.jpg', 66848, '2026-09-26T02:33:39.948177+00:00')],
        },
      },
    ],
  };
}

/* ── ③ อินพุตที่ทุกช่องพกเครื่องหมาย — เทสต์ "ฉบับลูกค้าไม่รั่ว" ─────────────────────── */

/**
 * @returns `{ inputs, leak, allowed }`
 *   · `leak`    เครื่องหมายที่ **ห้าม** โผล่ในฉบับลูกค้า (view และ HTML) — ชื่อคีย์บอกว่าเป็นของช่องไหน
 *   · `allowed` เครื่องหมายที่ **ต้อง** โผล่ในฉบับลูกค้า (กันเทสต์ผ่านเพราะ view ว่างเปล่า)
 * ⚠️ sha ของรูปจุดต่างจากรูปกว้าง/ผังทุกตัว — ของจริงรูปจุดซ้ำกับรูปกว้างได้ (ไฟล์เดียวกัน) แล้ว sha จะโผล่ในฉบับลูกค้า
 *   ในฐานะรูปกว้างโดยชอบ ⇒ ชุดทดสอบนี้แยกไว้เพื่อให้ "sha ของรูปจุด" หมายถึงรูปจุดจริง ๆ
 */
export function markedSurveyInputs() {
  const file = (id, docType, createdAt, metadata = {}) => ({
    id, docType, fileName: `${id}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1000, createdAt, metadata,
  });
  const img = (id, w = 1400, h = 1051) => ({ sha: fakeSha(id), w, h, bytes: 1000 });

  const inputs = {
    takenAt: '2026-09-26T03:01:26.314+00:00',
    request: {
      id: 'DR-MK-REQUESTID', docNo: 'RQ-AS-26099999', kind: 'site_survey',
      title: 'MK_REQUEST_TITLE', body: 'MK_REQUEST_BODY_LINE1\nMK_REQUEST_BODY_LINE2', team: 'MK_TEAM',
      requestedById: 'U-MK-REQUESTER', requestedByName: 'MK_REQUESTER_NAME',
      submittedAt: '2026-09-23T07:36:11.899+00:00', assignedByName: 'MK_ASSIGNED_BY',
      requestedDueDate: '2026-09-25', requestedDueTime: '15:00',
      committedDueDate: '2026-09-25', committedDueTime: '12:00',
      requestedResultDate: '2026-09-25', committedResultDate: '2026-09-25',
      answeredAt: '2026-09-26T03:01:26.314+00:00', answeredById: 'U-MK-HEAD', answeredByName: 'MK_OK_APPROVER',
      closedAt: '2026-09-27T02:00:00.000+00:00', closedByName: 'MK_CLOSER_NAME',
    },
    deal: { code: 'DL-269999999' },
    customer: { id: 'CUS-MK', arCode: 'AR-MK9', name: 'MK_OK_CUSTOMER' },
    site: {
      code: 'ST-MK-SITE', name: 'MK_OK_SITE', address: 'MK_OK_ADDRESS', contactName: 'MK_OK_CONTACT',
      contactPhone: '0811111111', accessFrom: '09:00', accessTo: '17:00', accessDays: [5],
      accessNote: 'MK_ACCESS_NOTE', note: 'MK_SITE_INTERNAL_NOTE',
    },
    visit: {
      code: 'SV-26099999', status: 'done', scheduledDate: '2026-09-25', startTime: '12:00', endTime: null,
      actualDate: '2026-09-25', actualStartTime: '17:45', actualEndTime: '17:45', actualEndDate: null,
      assigneeId: 'U-MK-LEAD', assigneeName: 'MK_OK_ASSESSOR',
    },
    visitClosedBySend: false,
    assigneeRoleLabel: 'MK_OK_ROLE',
    helpers: [{ id: 'U-MK-H1', name: 'MK_HELPER_ONE' }, { id: 'U-MK-H2', name: 'MK_HELPER_TWO' }],
    priorUnable: [{ date: '2026-09-24', reason: 'MK_UNABLE_REASON' }],
    zones: [
      {
        id: 'SVZ-MK-1', zoneId: 'SZN-MK-1', zoneCode: 'ZN-MK-0001', zoneName: 'MK_OK_ZONE_ONE', floor: '2',
        status: 'ok', cutReason: null,
        parts: [{ id: 'p1', label: 'MK_PART_LABEL', widthM: 10, lengthM: 20, heightM: 3 }],
        spots: [
          { id: 'sp-a', label: 'MK_SPOT_SELECTED', note: 'MK_SPOT_NOTE_SELECTED', selected: true },
          { id: 'sp-b', label: 'MK_SPOT_UNSELECTED', note: 'MK_SPOT_NOTE_UNSELECTED', selected: false },
        ],
        packageSize: 'ST', packageSizeSuggested: 'XL', packageSizeManual: false, packageQty: 2,
        packageNote: 'MK_PACKAGE_NOTE',
        note: 'MK_OK_ZONE_NOTE', surveyedByName: 'MK_SAVER_NAME', surveyedAt: '2026-09-26T02:00:08.014+00:00',
        sortOrder: 0,
      },
      {
        id: 'SVZ-MK-2', zoneId: 'SZN-MK-2', zoneCode: 'ZN-MK-0002', zoneName: 'MK_CUT_ZONE', floor: '3',
        status: 'cut', cutReason: 'MK_CUT_REASON',
        parts: [], spots: [], packageSize: null, packageSizeSuggested: null, packageSizeManual: false,
        packageQty: null, packageNote: null, note: 'MK_CUT_ZONE_NOTE', surveyedByName: null, surveyedAt: null,
        sortOrder: 1,
      },
      {
        id: 'SVZ-MK-3', zoneId: 'SZN-MK-3', zoneCode: 'ZN-MK-0003', zoneName: 'MK_OK_ZONE_ADDED', floor: null,
        status: 'added', cutReason: null,
        parts: [
          { id: 'p1', label: null, widthM: 7.5, lengthM: 4, heightM: 3 },
          { id: 'p2', label: null, widthM: 3, lengthM: 2, heightM: 3 },
        ],
        spots: [{ id: 'sp-c', label: 'MK_SPOT_THREE', note: null, selected: true }],
        packageSize: 'XS', packageSizeSuggested: 'SM', packageSizeManual: true, packageQty: 1, packageNote: null,
        note: null, surveyedByName: 'MK_SAVER_NAME', surveyedAt: '2026-09-26T02:40:28.844+00:00',
        sortOrder: 2,
      },
    ],
    zoneRegistry: [
      { id: 'SZN-MK-1', code: 'ZN-MK-0001', floor: '2', building: 'MK_BUILDING' },
      { id: 'SZN-MK-2', code: 'ZN-MK-0002', floor: '3', building: null },
      { id: 'SZN-MK-3', code: 'ZN-MK-0003', floor: null, building: null },
    ],
    filesByZone: {
      'SVZ-MK-1': [
        file('mk-z1-w1', 'survey_wide', '2026-09-26T01:57:10.000+00:00'),
        file('mk-z1-p1', 'survey_plan', '2026-09-26T02:00:04.000+00:00'),
        file('mk-z1-s-sel', 'survey_spot', '2026-09-26T01:59:54.000+00:00', { spotId: 'sp-a' }),
        file('mk-z1-s-unsel', 'survey_spot', '2026-09-26T01:59:58.000+00:00', { spotId: 'sp-b' }),
      ],
      'SVZ-MK-2': [file('mk-z2-w1', 'survey_wide', '2026-09-26T01:50:00.000+00:00')],
      'SVZ-MK-3': [
        file('mk-z3-w1', 'survey_wide', '2026-09-26T02:33:26.000+00:00'),
        file('mk-z3-p1', 'survey_plan', '2026-09-26T02:33:39.000+00:00'),
        file('mk-z3-s1', 'survey_spot', '2026-09-26T02:33:33.000+00:00', { spotId: 'sp-c' }),
      ],
    },
    imageByAttId: Object.fromEntries(
      ['mk-z1-w1', 'mk-z1-p1', 'mk-z1-s-sel', 'mk-z1-s-unsel', 'mk-z2-w1', 'mk-z3-w1', 'mk-z3-p1', 'mk-z3-s1']
        .map((id) => [id, img(id)]),
    ),
    sizes: PACKAGE_SIZE_SEED,
    history: [
      {
        id: 'EUP-MK-1', kind: 'recall', authorName: 'MK_RECALL_BY', createdAt: '2026-09-24T17:08:25.780+00:00',
        body: 'TS ดึงผลประเมินกลับมาแก้ — MK_RECALL_REASON · ตัวเลขที่ส่งไปแล้ว 1 พื้นที่ · 0 ตร.ม. · 0 แพ็คเกจ (อย่าเพิ่งใช้ตั้งราคา)',
        meta: { totals: { zones: 1, areaSqm: 0, volumeCbm: 0, packageQty: 0 } },
      },
      {
        id: 'EUP-MK-2', kind: 'send_back', authorName: 'MK_SENDBACK_BY', createdAt: '2026-09-25T03:00:00.000+00:00',
        body: 'หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — MK_SENDBACK_REASON', meta: { note: 'MK_SENDBACK_REASON', items: ['MK_SENDBACK_REASON'] },
      },
      {
        id: 'EUP-MK-3', kind: 'send_back_done', authorName: 'MK_SENDBACK_DONE_BY', createdAt: '2026-09-25T09:00:00.000+00:00',
        body: 'แก้แล้ว', meta: { note: 'MK_SENDBACK_DONE_NOTE' },
      },
    ],
    company: { ...TEST_COMPANY, name: 'MK_OK_COMPANY' },
    form: TEST_FORM,
  };

  const leak = {
    requestDocNo: 'RQ-AS-26099999',
    requestId: 'DR-MK-REQUESTID',
    requestTitle: 'MK_REQUEST_TITLE',
    requestBody1: 'MK_REQUEST_BODY_LINE1',
    requestBody2: 'MK_REQUEST_BODY_LINE2',
    team: 'MK_TEAM',
    requesterId: 'U-MK-REQUESTER',
    requesterName: 'MK_REQUESTER_NAME',
    assignedBy: 'MK_ASSIGNED_BY',
    closerName: 'MK_CLOSER_NAME',
    dealCode: 'DL-269999999',
    arCode: 'AR-MK9',
    customerId: 'CUS-MK',
    accessNote: 'MK_ACCESS_NOTE',
    siteNote: 'MK_SITE_INTERNAL_NOTE',
    visitCode: 'SV-26099999',
    helper1: 'MK_HELPER_ONE',
    helper2: 'MK_HELPER_TWO',
    unableReason: 'MK_UNABLE_REASON',
    partLabel: 'MK_PART_LABEL',
    spotSelected: 'MK_SPOT_SELECTED',
    spotSelectedNote: 'MK_SPOT_NOTE_SELECTED',
    spotUnselected: 'MK_SPOT_UNSELECTED',
    spotUnselectedNote: 'MK_SPOT_NOTE_UNSELECTED',
    spotThree: 'MK_SPOT_THREE',
    spotPhotoSelectedSha: fakeSha('mk-z1-s-sel'),
    spotPhotoUnselectedSha: fakeSha('mk-z1-s-unsel'),
    spotPhotoThreeSha: fakeSha('mk-z3-s1'),
    spotPhotoAttId: 'mk-z1-s-sel',
    packageNote: 'MK_PACKAGE_NOTE',
    cutZoneName: 'MK_CUT_ZONE',
    cutZoneCode: 'ZN-MK-0002',
    cutReason: 'MK_CUT_REASON',
    cutZoneNote: 'MK_CUT_ZONE_NOTE',
    cutZonePhotoSha: fakeSha('mk-z2-w1'),
    saverName: 'MK_SAVER_NAME',
    recallBy: 'MK_RECALL_BY',
    recallReason: 'MK_RECALL_REASON',
    sendBackBy: 'MK_SENDBACK_BY',
    sendBackReason: 'MK_SENDBACK_REASON',
    sendBackDoneBy: 'MK_SENDBACK_DONE_BY',
    sendBackDoneNote: 'MK_SENDBACK_DONE_NOTE',
    recordedTime: '17:45',
  };

  const allowed = {
    customer: 'MK_OK_CUSTOMER', site: 'MK_OK_SITE', address: 'MK_OK_ADDRESS', contact: 'MK_OK_CONTACT',
    assessor: 'MK_OK_ASSESSOR', role: 'MK_OK_ROLE', approver: 'MK_OK_APPROVER', company: 'MK_OK_COMPANY',
    zoneOne: 'MK_OK_ZONE_ONE', zoneAdded: 'MK_OK_ZONE_ADDED', zoneNote: 'MK_OK_ZONE_NOTE',
    widePhotoSha: fakeSha('mk-z1-w1'), planPhotoSha: fakeSha('mk-z1-p1'),
  };

  return { inputs, leak, allowed };
}

/* ── ④ อินพุตสังเคราะห์ขนาดใดก็ได้ — เทสต์จัดหน้า (กรณีสุดขอบ · property test) และ stress ของ harness ──── */

/** ตัวสุ่มที่นิ่ง (mulberry32) — เทสต์ที่ล้มต้องล้มซ้ำได้ด้วย seed เดิม */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FILLER = 'พื้นที่ยังก่อสร้างไม่เสร็จ ทีมประเมินจากแบบและหน้างานจริง ตำแหน่งปลั๊กไฟอยู่ผนังด้านทิศเหนือ ';

/** ข้อความไทยยาว `length` ตัวอักษร (ตัดที่ความยาวพอดี) */
export const thaiText = (length) => FILLER.repeat(Math.ceil(length / FILLER.length)).slice(0, length).trim();

/**
 * @param spec.zones  `[{ name, floor, parts, wide, spots, selected, spotNotes, note, plan, status, cutReason, packageNote,
 *                        size, qty, portrait }]`
 *   · `parts` จำนวนส่วน (≥1) · `wide` จำนวนรูปกว้าง · `spots` จำนวนจุด · `selected` จำนวนจุดที่เลือก (ไม่ส่ง = ทุกจุด)
 *   · `spotNotes` `true` = ทุกจุดมีหมายเหตุ · `note` หมายเหตุพื้นที่ (string) · `plan` จำนวนภาพผัง (ค่าตั้งต้น 1 ·
 *     0 = ไม่มีผัง ⇒ ตรึงไม่ได้ ต้องใช้โหมดร่าง)
 *   · `size` รหัสขนาดที่หัวหน้าเคาะ (ไม่ส่ง = ขนาดที่ระบบเสนอ) · `qty` จำนวนแพ็ค (ค่าตั้งต้น 1) — คุมข้อความ "ขนาดรวม" ของแถวรวม
 *   · `portrait` `true` = รูปกว้างและรูปจุดของพื้นที่นี้เป็นแนวตั้ง 1051×1400
 * @param spec.history จำนวนแถวประวัติ (สลับ ดึงกลับ/ตีกลับ/แจ้งแก้แล้ว) · `spec.helpers` จำนวนผู้ช่วย
 * @param spec.sendBack `{ items, length }` — แถวตีกลับทุกแถวมี `items` ข้อ ข้อละ `length` ตัวอักษร (เพดานของแอป 10 × 300)
 * @param spec.body   รายละเอียดคำร้อง (string) · `spec.title` ชื่องาน
 */
export function stressSurveyInputs(spec = {}) {
  const base = surveyReportInputsFromFixture(syntheticSurveyFixture());
  const zones = [];
  const zoneRegistry = [];
  const filesByZone = {};
  const imageByAttId = {};
  const stamp = (n) => `2026-09-26T02:${String(10 + (n % 50)).padStart(2, '0')}:00.000+00:00`;

  (spec.zones || []).forEach((z, index) => {
    const id = `SVZ-st-${index + 1}`;
    const zoneId = `SZN-st-${index + 1}`;
    const cut = z.status === 'cut';
    const partCount = cut ? 0 : Math.max(1, z.parts || 1);
    const parts = Array.from({ length: partCount }, (_, i) => ({
      id: `p${i}`, label: null, widthM: 4 + (i % 5), lengthM: 3 + (i % 4), heightM: 3,
    }));
    const spotCount = cut ? 0 : (z.spots ?? 1);
    const selected = z.selected ?? spotCount;
    const spots = Array.from({ length: spotCount }, (_, i) => ({
      id: `sp-${index + 1}-${i + 1}`, label: `จุดที่ ${i + 1}`,
      note: z.spotNotes ? 'ข้างเคาน์เตอร์ ระดับ 2.2 ม.' : null, selected: i < selected,
    }));
    const volume = surveyZoneSize(parts).volumeCbm;
    const offer = cut ? null : suggestedPackageSize(volume, base.sizes);
    const picked = cut ? null : (z.size || offer?.code || null);
    zones.push({
      id, zoneId, zoneCode: `ZN-9001-${String(10000 + index)}`, zoneName: z.name || `ห้อง ${index + 1}`,
      floor: z.floor ?? null, status: z.status || 'ok', cutReason: cut ? (z.cutReason || 'ลูกค้าไม่ติดตั้งพื้นที่นี้') : null,
      parts, spots,
      packageQty: cut ? null : (z.qty ?? 1), packageSize: picked, packageSizeSuggested: offer?.code ?? null,
      packageSizeManual: Boolean(z.size && z.size !== offer?.code), packageNote: z.packageNote ?? null,
      note: z.note ?? null, surveyedByName: 'Crew Saver', surveyedAt: stamp(index), sortOrder: index,
    });
    zoneRegistry.push({ id: zoneId, code: `ZN-9001-${String(10000 + index)}`, floor: z.floor ?? null, building: null });
    const files = [];
    const add = (fileId, docType, metadata = {}) => {
      files.push({ id: fileId, docType, fileName: `${fileId}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1000, createdAt: stamp(files.length), metadata });
      const tall = z.portrait && docType !== 'survey_plan';
      imageByAttId[fileId] = { sha: fakeSha(fileId), w: tall ? 1051 : 1400, h: tall ? 1400 : 1051, bytes: 1000 };
    };
    if (!cut) {
      for (let i = 0; i < (z.wide ?? 1); i += 1) add(`st-z${index + 1}-w${i + 1}`, 'survey_wide');
      for (let i = 0; i < (z.plan ?? 1); i += 1) add(`st-z${index + 1}-p${i + 1}`, 'survey_plan');
      spots.forEach((s, i) => add(`st-z${index + 1}-s${i + 1}`, 'survey_spot', { spotId: s.id }));
    }
    filesByZone[id] = files;
  });

  const kinds = ['recall', 'send_back', 'send_back_done'];
  const history = Array.from({ length: spec.history || 0 }, (_, i) => {
    const kind = kinds[i % 3];
    const createdAt = `2026-09-2${1 + (i % 4)}T0${i % 9}:${String(10 + i).padStart(2, '0')}:00.000+00:00`;
    if (kind === 'recall') {
      return {
        id: `EUP-st-${i}`, kind, authorName: 'Admin Tester', createdAt,
        body: `TS ดึงผลประเมินกลับมาแก้ — ตัวเลขผิดรอบที่ ${i + 1} · ตัวเลขที่ส่งไปแล้ว 1 พื้นที่ · 0 ตร.ม. · 0 แพ็คเกจ (อย่าเพิ่งใช้ตั้งราคา)`,
        meta: { totals: { zones: 1, areaSqm: 12.5, volumeCbm: 37.5, packageQty: 1 } },
      };
    }
    if (kind === 'send_back' && spec.sendBack) {
      const items = Array.from({ length: spec.sendBack.items }, (_, k) => thaiText(spec.sendBack.length - 8) + ` ข้อ ${k + 1}`);
      return { id: `EUP-st-${i}`, kind, authorName: 'Head Approver', createdAt, body: 'x', meta: { note: items.join('\n'), items } };
    }
    return {
      id: `EUP-st-${i}`, kind, authorName: 'Head Approver', createdAt,
      body: 'x', meta: { note: kind === 'send_back' ? `ขอรูปเพิ่มรอบที่ ${i + 1}` : 'แก้แล้ว' },
    };
  });

  return {
    ...base,
    request: { ...base.request, body: spec.body ?? base.request.body, title: spec.title ?? base.request.title },
    helpers: Array.from({ length: spec.helpers || 0 }, (_, i) => ({ id: `U-h${i}`, name: `Helper Number ${i + 1}` })),
    zones, zoneRegistry, filesByZone, imageByAttId, history,
  };
}

/* ── ⑤ ชุดสุดขอบที่ต้องวัดจริงใน Chrome — harness (`--stress`) กับเทสต์วัดจริงใช้ชุดเดียวกัน ─────────────────────
   แต่ละกรณีคือเรื่องที่เคยล้นหรือเคยเพี้ยนจริง (review 01/10) — เพิ่มกรณีที่นี่ = ถูกวัดทั้งสองที่ */

const tenZones = (overrides = []) => Array.from({ length: 10 }, (_, i) => ({ ...(overrides[i] || {}) }));
const TWO_LINE_NAME = 'ห้องทำงานฝ่ายขายและพื้นที่ส่วนกลาง'; // สองบรรทัดในช่องชื่อ 182px ของฉบับลูกค้า (พร้อม "· ชั้น 12")

/**
 * @returns `[{ name, mode, spec }]` — `mode: 'draft'` = อินพุตที่ตรึงไม่ได้โดยตั้งใจ (พื้นที่ไม่มีภาพผัง)
 *   stress     ทุกอย่างพร้อมกัน: 12 พื้นที่ · รูปเยอะ · รูปแนวตั้ง · หมายเหตุยาว · สี่ขนาดจำนวนสองหลัก · ประวัติ 14 แถว
 *   mix3/mix4/mix2d  10 พื้นที่ + ขนาดรวมสาม/สี่ขนาด/สองขนาดจำนวนสองหลัก — แถวรวมหลายบรรทัด (เดิมหน้า 1 ฉบับลูกค้าเลยขอบ)
 *   limit10    10 พื้นที่ขนาดเดียว — หน้า 1 ของฉบับลูกค้าชิดเพดานพอดี (กระดาน R-C-1: "10 พื้นที่")
 *   limit9     9 พื้นที่ (ชื่อสองบรรทัดสองแถว) + สามขนาด — แถวรวมสองบรรทัดชิดเพดานหน้า 1 ของฉบับลูกค้า (แผน 1046 จาก 1050)
 *   sendback   ตีกลับ 10 ข้อ × 300 ตัว (แถวเดียวสูงกว่าหน้า — แบ่งกลางเหตุผล) + รายละเอียดคำร้อง 4,000 ตัวย่อหน้าเดียว
 *   tallhead   พื้นที่ 1 มี 20 ส่วน — แถวแรกไม่พอใต้หัวหน้า 1 ของฉบับภายใน ⇒ ตารางเริ่มหน้า 2
 *   noplan     พื้นที่ที่ไม่มีภาพผัง/ไม่มีภาพกว้าง (โหมดร่าง) — กล่อง "ไม่มีผัง" เตี้ย
 */
export function surveyStressCases() {
  return [
    {
      name: 'stress', mode: 'freeze',
      spec: {
        title: 'ประเมินพื้นที่อาคารสำนักงานและโชว์รูมทั้งโครงการสำหรับติดตั้งเครื่องกระจายกลิ่นทุกชั้น',
        body: Array.from({ length: 6 }, (_, i) => `บรรทัดที่ ${i + 1} ${thaiText(90)}`).join('\n'),
        helpers: 3,
        history: 14,
        zones: [
          { name: 'โถงต้อนรับและพื้นที่พักคอยของลูกค้าชั้นล่างติดกับร้านกาแฟ', floor: 'G', wide: 7, spots: 5, spotNotes: true, note: thaiText(400), size: 'XL', qty: 24 },
          { name: 'ห้องประชุมใหญ่', floor: '2', parts: 3, wide: 2, spots: 2, note: thaiText(120), portrait: true },
          { name: 'ห้องน้ำชาย', floor: '2', wide: 0, spots: 0, size: 'XS' },
          { name: 'ร้านค้าที่ลูกค้ายกเลิก', floor: '1', status: 'cut', cutReason: thaiText(110) },
          ...Array.from({ length: 9 }, (_, i) => ({
            name: `ห้องทำงานฝ่ายที่ ${i + 1}${i % 3 === 0 ? ' และพื้นที่ส่วนกลางหน้าลิฟต์ฝั่งทิศตะวันออก' : ''}`,
            floor: String(3 + i), wide: 1 + (i % 4), spots: i % 5, selected: Math.max(0, (i % 5) - 1),
            parts: 1 + (i % 2), packageNote: i % 4 === 0 ? thaiText(70) : null, note: i % 2 ? thaiText(60 + i * 20) : null,
            status: i === 7 ? 'added' : 'ok', ...(i === 2 ? { size: 'ST', qty: 12 } : {}),
          })),
        ],
      },
    },
    { name: 'mix3', mode: 'freeze', spec: { zones: tenZones([{ size: 'XS' }, { size: 'XL' }]) } },
    { name: 'mix4', mode: 'freeze', spec: { zones: tenZones([{ size: 'XS' }, { size: 'XL' }, { size: 'ST' }]) } },
    { name: 'mix2d', mode: 'freeze', spec: { zones: tenZones([{ size: 'ST', qty: 12 }, { size: 'XL', qty: 24 }, ...Array.from({ length: 8 }, () => ({ size: 'ST' }))]) } },
    { name: 'limit10', mode: 'freeze', spec: { zones: tenZones() } },
    {
      name: 'limit9', mode: 'freeze',
      spec: { zones: tenZones([{ name: TWO_LINE_NAME, floor: '12', size: 'XS' }, { name: TWO_LINE_NAME, floor: '14', size: 'XL' }]).slice(0, 9) },
    },
    {
      name: 'sendback', mode: 'freeze',
      spec: { zones: [{}, {}], history: 4, sendBack: { items: 10, length: 300 }, body: thaiText(4000) },
    },
    { name: 'tallhead', mode: 'freeze', spec: { zones: [{ parts: 20 }, {}, {}], helpers: 2 } },
    {
      name: 'noplan', mode: 'draft',
      spec: { zones: [{ name: 'ห้องน้ำชาย', floor: '2', wide: 0, spots: 0, plan: 0 }, { wide: 2, plan: 0, parts: 4, note: thaiText(80) }, { wide: 1 }] },
    },
  ];
}
