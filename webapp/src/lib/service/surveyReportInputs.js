// ── อินพุตของรายงานการประเมินพื้นที่ + รอบตรวจก่อนส่งผล (PR-2 §9) ─────────────────────────────
//
// ⭐ ตัวสร้างภาพนิ่ง (`surveyReportSnapshot.js`) ไม่แตะฐาน — ไฟล์นี้คือคนอ่านทุกอย่างมาส่งให้ **ที่เดียว**
//   สามผู้เรียกจึงเห็นข้อมูลชุดเดียวกัน: รอบตรวจก่อนส่งผล · ขั้นออกเลข (`issueSurveyReport`) · ตัวอย่างฉบับร่าง
//   🐞 ถ้าต่างคนต่างอ่าน: GET ของจอเห็นนัด "ใบล่าสุดสถานะใดก็ได้" · ทะเบียนพื้นที่แค่ `id, code` · ดึงกลับแถวเดียว ·
//      ไม่มีบริษัท/มาตรฐาน ⇒ แถวด่านบนการ์ดจะพูดไม่ตรงกับที่ server ตัดสิน
//
// 🔴 **อ่านไม่สำเร็จ ≠ ไม่มี** (กติกา supabase-never-throws) — `supabase-js` ไม่ throw · คืน `{ data: null, error }`
//   ⇒ ชิ้นที่อ่านพลาดเป็น `null` **และ** ชื่อของมันเข้า `unknown` · ชิ้นที่ไม่มีจริง (ใบไม่มีดีล · นัดไม่มีผู้ช่วย) เป็น `null` เฉย ๆ
//   · ขั้นออกเลขไม่ออกเมื่อ `unknown` ไม่ว่าง: เอกสารที่ตรึงแล้วแก้ไม่ได้ ชื่อผู้ช่วยที่หายเพราะฐานสะดุดครั้งเดียวจะหายตลอดกาล
//   · รอบตรวจก่อนส่งผลไม่ตีกลับเพราะ `unknown` (มติเจ้าของข้อ 2: ปัญหาของระบบไม่ขวางผลไปถึงฝ่ายขาย)
//
// ⚠️ **ไม่ import ของหนัก** — ไฟล์นี้อยู่บนทางของ GET ใบประเมิน (หัวหน้า) และ route ส่งผล: ไม่มี `sharp` ไม่มี chromium
//   มีแต่ตัวอ่านฐานกับตรรกะล้วน · รูปที่ย่อแล้ว (`imageByAttId`) ผู้เรียกเติมเองหลังเตรียมรูป
// ⚠️ **ไม่เขียนอะไรเลย** — ทุกคำสั่งที่นี่เป็น SELECT (สคริปต์ตรวจของจริง `check-survey-report-inputs.mjs` รันตัวนี้ได้ตรง ๆ)
import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { documentStandardToForm } from '@/lib/documentStandards';
import { listAttachments } from '@/lib/master/attachments';
import { CUSTOMER_NAME_SELECT, customerNameIn } from '@/lib/master/customerName';
import { ROLE_LABELS, normalizeRole } from '@/lib/permissions';
import { IN_CHUNK_SIZE, fetchInChunks } from '@/lib/supabaseInChunks';
import { loadCrewNames, visitHelperIds } from './crew/visitCrew';
import { loadPackageSizesOrNull } from './packageSizesRepo';
import { SEND_BACK_DONE_KIND, SEND_BACK_KIND } from './survey';
import { paginateSurveyReport, surveyReportOverflowErrors } from './surveyReportLayout';
import {
  SURVEY_REPORT_INPUT_LABELS, SURVEY_REPORT_NO_VISIT, buildSurveyReportSnapshot, surveyReportFreezeIssues,
} from './surveyReportSnapshot';
import { surveyReportSendWarnings, surveyReportView } from './surveyReportView';
import { loadSurveyZones } from './surveyRepo';
import { surveySendVisitStep } from './surveySendClose';

/** คีย์มาตรฐานเอกสารของ FM-TS-01 (แถว seed ของ mig 0401 ⑦) — การลงทะเบียนคีย์ในหน้าตั้งค่าเป็นงานของ PR-3 */
export const SURVEY_REPORT_STANDARD_KEY = 'siteSurvey';

/* คอลัมน์ของนัดที่ภาพนิ่งกับตัวเลือกนัดใช้ — เอ่ยชื่อทีละตัว (ด่าน `check:columns` อ่านค่าคงที่นี้) */
const VISIT_COLUMNS = [
  'id', 'code', 'status', '"scheduledDate"', '"startTime"', '"endTime"',
  '"actualDate"', '"actualStartTime"', '"actualEndTime"', '"actualEndDate"',
  '"assigneeId"', '"assigneeName"', '"assistantIds"', '"unableReason"', '"createdAt"',
].join(', ');

/* คอลัมน์ชุดเดียวกับ `loadSurveySheetContext` (หัวงานของจอประเมิน) ยกเว้นลิงก์แผนที่ซึ่งกระดาษไม่พิมพ์
   — ช่วงเข้าไซต์ต้องมากับแถว (`accessWindowText`) */
const SITE_COLUMNS = 'id, code, name, address, "contactName", "contactPhone", "accessFrom", "accessTo", "accessDays", "accessNote"';

const THREAD_COLUMNS = 'id, kind, body, meta, "authorId", "authorName", "createdAt"';

/* เพดานของแต่ละชิ้น — ใบเดียวไม่มีทางแตะ แต่ทุก query ต้องมีขอบเขตของตัวเอง (ด่าน `check:rowcap`) */
const VISIT_LIMIT = 200;
const HISTORY_LIMIT = 200;

/** ขึ้นต้นของบรรทัดเธรด "ปิดพร้อมส่งผล โดย …" (`surveySendCloseBody`) — นัดที่ถูกปิดก่อน PR-2 ไม่มี `meta.closedBySend` (เทสต์ล็อกคู่กัน) */
const SEND_CLOSE_BODY_PREFIX = 'ปิดพร้อมส่งผล';

const cleanId = (id) => (id != null && id !== '' ? String(id) : null);
/* วันล้วน `YYYY-MM-DD` จากคอลัมน์ date ของนัด (ไม่ใช่จุดเวลา — ไม่มีโซนเวลาเกี่ยว) · ไม่มี = '' */
const day = (value) => (String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/) || [''])[0];

/* ใหม่ก่อน: วันเข้าจริง แล้ว `createdAt` · เท่ากัน = id ให้ผลนิ่ง (เลือกนัดเดิมทุกครั้งที่ออกเอกสารซ้ำ) */
const newestFirst = (a, b) => {
  const x = day(a?.actualDate);
  const y = day(b?.actualDate);
  if (x !== y) return x < y ? 1 : -1;
  const i = String(a?.createdAt ?? '');
  const j = String(b?.createdAt ?? '');
  if (i !== j) return i < j ? 1 : -1;
  return String(a?.id ?? '') < String(b?.id ?? '') ? -1 : 1;
};

const oldestFirst = (a, b) => {
  const x = day(a?.actualDate || a?.scheduledDate);
  const y = day(b?.actualDate || b?.scheduledDate);
  if (x !== y) return x < y ? -1 : 1;
  const i = String(a?.createdAt ?? '');
  const j = String(b?.createdAt ?? '');
  if (i !== j) return i < j ? -1 : 1;
  return String(a?.id ?? '') < String(b?.id ?? '') ? -1 : 1;
};

/**
 * นัดที่เอกสารรับรอง — นัด `done` ล่าสุดตามวันเข้าจริง แล้ว `createdAt`
 * 🐞 `findSurveyVisit` คืน "ใบล่าสุดสถานะใดก็ได้" ⇒ ใบที่ไปแล้วเข้าไม่ได้หนึ่งรอบแล้วไปใหม่ หรือถูกยกเลิกแล้วลงคิวใหม่
 *   จะได้นัดที่ไม่มีใครเข้าพื้นที่มาลงชื่อผู้ประเมินบนกระดาษ
 */
export function surveyReportVisitOf(visits) {
  return (Array.isArray(visits) ? visits : []).filter((v) => v?.status === 'done').sort(newestFirst)[0] || null;
}

/** นัดอื่นของใบที่ "ทำไม่ได้" — เก่าก่อน · `[{ date, reason }]` (ภาคผนวกของฉบับภายใน) */
function priorUnableOf(visits, visit) {
  const keep = cleanId(visit?.id);
  return visits
    .filter((v) => v?.status === 'unable' && cleanId(v.id) !== keep)
    .sort(oldestFirst)
    .map((v) => ({ date: v.actualDate || v.scheduledDate || null, reason: v.unableReason || null }));
}

/**
 * 🔑 **อ่านอินพุตทั้งชุดของ `buildSurveyReportSnapshot`** — คืน `{ inputs, unknown: string[] }` · ไม่ throw
 *
 * @param opts.request        แถว `dept_requests` (ขั้นออกเลข = แถวหลังเขียนคำตอบ)
 * @param opts.closedVisit    นัดที่การส่งผลนี้ปิด (แถวหลังปิด) — มี = เอกสารรับรองนัดนี้ และ `visitClosedBySend` เป็นจริง
 *                            · รอบตรวจก่อนส่งผลส่งนัดที่ค้าง **บวกแพตช์ปิด** มา (นัดที่กำลังจะถูกปิด)
 * @param opts.pendingAnswer  `{ answeredAt, answeredById, answeredByName }` ที่กำลังจะเขียน (รอบตรวจก่อนส่งผล) — ทับลงแถวใบในอินพุต
 * @param opts.zones          แถวผลวัดที่ผู้เรียกอ่านไว้แล้ว (`loadSurveyZones`) — ไม่ส่ง = อ่านเอง · ไม่ถูกแก้ในที่
 * @param opts.filesByZone    `{ [zoneRowId]: attachments[] }` ที่อ่านไว้แล้ว — ไม่ส่ง = อ่านเอง
 * @param opts.sizes          ทะเบียนขนาดที่อ่านไว้แล้ว · `undefined` = อ่านเอง · `null` = ผู้เรียกอ่านไม่สำเร็จ (`loadPackageSizesOrNull`)
 * @param opts.takenAt        จุดเวลาของภาพนิ่ง (ISO) — ผู้เรียกอ่านนาฬิกา · ไม่ส่ง = `null` (ผู้เรียกเติมเองก่อนสร้างภาพนิ่ง)
 *
 * `unknown` = ชื่อชิ้นที่อ่านไม่สำเร็จ (คีย์ของ `SURVEY_REPORT_INPUT_LABELS`) · ชุดเดียวกันอยู่ใน `inputs.unknown` ด้วย
 *   ⇒ `surveyReportFreezeIssues(inputs)` เปลี่ยนข้อ "ไม่มี" ของชิ้นนั้นเป็น "อ่านไม่สำเร็จ" (ชนิด `system`) เอง
 * ⚠️ ทุกชิ้นยิงขนานกัน · ชิ้นที่ต้องรู้นัดก่อน (เธรดของนัด · ผู้ช่วย · ตำแหน่งผู้ประเมิน) ต่อท้ายการอ่านนัดในสายเดียวกัน
 */
export async function loadSurveyReportInputs(supabase, {
  request, closedVisit = null, pendingAnswer = null, zones = null, filesByZone = null, sizes, takenAt = null,
} = {}) {
  const requestId = request?.id ?? null;
  const failed = new Set();
  const miss = (name, error) => {
    failed.add(name);
    console.error('[survey-report] อ่าน', name, 'ไม่สำเร็จ', requestId, error?.message || error);
    return null;
  };
  /* อ่านหนึ่งชิ้น — `{ error }` กับ throw จบที่เดียวกัน: ชิ้นเป็น `null` + ชื่อเข้า `unknown` */
  const read = async (name, run) => {
    try {
      const res = await run();
      if (res?.error) return miss(name, res.error);
      return res?.data ?? null;
    } catch (error) {
      return miss(name, error);
    }
  };

  /* ── ผลวัด → ไฟล์รายพื้นที่ + ทะเบียนพื้นที่ ──────────────────────────────────── */
  const zonesChain = (async () => {
    const rows = Array.isArray(zones)
      ? zones
      : await read('zones', async () => ({ data: await loadSurveyZones(supabase, requestId) }));
    // อ่านผลวัดไม่สำเร็จ = ไม่รู้ว่าต้องอ่านไฟล์/ทะเบียนของพื้นที่ไหน — ชื่อ `zones` พูดแทนทั้งสามชิ้น
    if (!rows) return { zones: null, filesByZone: null, zoneRegistry: null };
    /* รหัส ZN · ชั้น · อาคาร อ่านสดจากทะเบียน (จอประเมินอ่านแค่ `id, code` — กระดาษพิมพ์ชั้น/อาคารด้วย)
       ⚠️ ห่อ `fetchInChunks`: ลิสต์โตตามข้อมูล (พื้นที่ที่ช่างเพิ่มหน้างานไม่มีเพดาน) — `.in()` ยาวเกิน ~16 KB ตายเงียบ */
    const zoneIds = [...new Set(rows.map((r) => r?.zoneId).filter(Boolean))];
    const [files, registry] = await Promise.all([
      filesByZone && typeof filesByZone === 'object'
        ? filesByZone
        : read('files', async () => {
          const lists = await Promise.all(rows.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
          return { data: Object.fromEntries(rows.map((z, i) => [z.id, lists[i] || []])) };
        }),
      zoneIds.length
        ? read('zoneRegistry', () => fetchInChunks(zoneIds, (chunk) => supabase
          .from('service_zones').select('id, code, floor, building').in('id', chunk)
          .order('id', { ascending: true }).limit(IN_CHUNK_SIZE)))
        : [],
    ]);
    return { zones: rows, filesByZone: files, zoneRegistry: registry };
  })();

  /* ── นัดทุกใบของคำร้อง (อ่านครั้งเดียว) → นัดที่รับรอง · นัดที่ทำไม่ได้ · ปิดพร้อมส่งผลไหม · ผู้ช่วย · ตำแหน่ง ── */
  const visitChain = (async () => {
    const rows = requestId
      ? await read('visits', () => supabase
        .from('service_visits').select(VISIT_COLUMNS).eq('requestId', requestId)
        .order('createdAt', { ascending: false }).order('id', { ascending: true }).limit(VISIT_LIMIT))
      : [];
    const visit = closedVisit || surveyReportVisitOf(rows);
    const visitId = cleanId(visit?.id);
    const helperIds = visitHelperIds(visit);
    const assigneeId = cleanId(visit?.assigneeId);

    const [closedBySend, helpers, assigneeRoleLabel] = await Promise.all([
      /* ปิดพร้อมการส่งผลไหม — เวลาจบที่ไม่มีบนนัดต้องอ่านว่า "ไม่ได้กดส่งงาน" ไม่ใช่ "ระบบทำหาย" (`visitTimeCredible`)
         แถว `done` ล่าสุดเป็นตัวตัดสิน: นัดที่ถูกเปิดกลับแล้วช่างส่งงานเอง = ไม่ใช่ปิดพร้อมส่งผลแล้ว */
      (async () => {
        if (closedVisit) return true;
        if (!visitId) return false;
        const thread = await read('visitThread', () => supabase
          .from('entity_updates').select('id, body, meta, "createdAt"')
          .eq('entityType', 'service_visit').eq('entityId', visitId).eq('kind', 'done')
          .order('createdAt', { ascending: false }).limit(1));
        const last = (thread || [])[0] || null;
        return last?.meta?.closedBySend === true || String(last?.body ?? '').startsWith(SEND_CLOSE_BODY_PREFIX);
      })(),
      /* ⚠️ `loadCrewNames` คืน **Map** — ส่งต่อทั้งก้อนไม่ได้ (ตัวสร้างภาพนิ่งรับลิสต์ ⇒ Map กลายเป็น "ไม่มีผู้ช่วย" เงียบ ๆ)
         แปลงตามลำดับบนนัด · `failed` = ไม่ทราบ (ทั้งชิ้นเป็น null) · `gone` (บัญชีถูกลบ) = ไม่พิมพ์ชื่อนั้น */
      (async () => {
        if (!helperIds.length) return [];
        return read('helpers', async () => {
          const names = await loadCrewNames(supabase, helperIds);
          const out = [];
          for (const id of helperIds) {
            const hit = names.get(id);
            if (!hit || hit.failed) return { error: { message: `อ่านชื่อผู้ช่วย ${id} ไม่สำเร็จ` } };
            if (hit.name) out.push({ id, name: hit.name });
          }
          return { data: out };
        });
      })(),
      /* ตำแหน่งของผู้ประเมิน ("เจ้าหน้าที่บริการอาวุโส (Senior)") — ป้ายเดียวกับทะเบียนผู้ใช้ (`ROLE_LABELS`)
         บัญชีถูกลบไปแล้ว = ไม่มีตำแหน่งให้พิมพ์ (กระดาษพิมพ์ฝ่ายอย่างเดียว) ไม่ใช่อ่านพลาด */
      (async () => {
        if (!assigneeId) return null;
        return read('assigneeRole', async () => {
          const { data, error } = await supabase.auth.admin.getUserById(assigneeId);
          if (error) {
            if (error.status === 404 || /not.?found/i.test(error.message || '')) return { data: null };
            return { error };
          }
          const role = normalizeRole(data?.user?.app_metadata?.role);
          return { data: (role && Object.hasOwn(ROLE_LABELS, role) && ROLE_LABELS[role]) || null };
        });
      })(),
    ]);

    return {
      visit: visit || null,
      // อ่านนัดไม่สำเร็จ = ไม่รู้ว่ามีนัดที่ทำไม่ได้ไหม (`null`) — ต่างจาก "ไม่มี" (`[]`)
      priorUnable: rows ? priorUnableOf(rows, visit) : null,
      visitClosedBySend: closedBySend,
      helpers,
      assigneeRoleLabel,
    };
  })();

  const [zonePart, visitPart, site, customerRow, deal, history, sizeRows, company, standard] = await Promise.all([
    zonesChain,
    visitChain,
    request?.siteId
      ? read('site', () => supabase.from('service_sites').select(SITE_COLUMNS).eq('id', request.siteId).maybeSingle())
      : null,
    /* 🔴 ห้าม select แค่ `name` — ลูกค้าที่มีแต่ชื่ออังกฤษจะได้ `null` ทั้งที่ชื่อมีจริง (บทเรียน AR-630 · `customerName.js`) */
    request?.customerId
      ? read('customer', () => supabase.from('customers').select(`${CUSTOMER_NAME_SELECT}, "arCode"`)
        .eq('id', request.customerId).maybeSingle())
      : null,
    request?.dealId
      ? read('deal', () => supabase.from('sales_deals').select('id, code').eq('id', request.dealId).maybeSingle())
      : null,
    /* ตีกลับ · แจ้งแก้แล้ว · ดึงกลับ **ทุกรอบ** (ภาคผนวกของฉบับภายใน) — ตัวโหลดของจออ่านแค่แถวล่าสุด (1 และ 20 แถว)
       ใหม่ก่อนแล้วตัดที่เพดาน: ถ้าเกินจริง ของที่หลุดคือรอบเก่าสุด · ตัวสร้างภาพนิ่งเรียงเก่าก่อนเอง */
    requestId
      ? read('history', () => supabase.from('entity_updates').select(THREAD_COLUMNS)
        .eq('entityType', 'dept_request').eq('entityId', String(requestId))
        .in('kind', ['recall', SEND_BACK_KIND, SEND_BACK_DONE_KIND])
        .order('createdAt', { ascending: false }).limit(HISTORY_LIMIT))
      : [],
    // `null` จากตัวโหลด = อ่านไม่สำเร็จ (ไม่ใช่ทะเบียนว่าง) — กติกาเดียวกับ GET ใบประเมินและ route ส่งผล
    sizes === undefined
      ? read('sizes', async () => {
        const rows = await loadPackageSizesOrNull(supabase);
        return rows ? { data: rows } : { error: { message: 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ' } };
      })
      : (Array.isArray(sizes) ? sizes : miss('sizes', 'ผู้เรียกอ่านทะเบียนขนาดไม่สำเร็จ')),
    /* บริษัทที่เผยแพร่ — ตัวเดียวกับ QT/SO/สัญญา/PDR · ไม่มีแถวที่เผยแพร่ = ค่าสำรองของ `documentBrand` (ไม่ใช่อ่านพลาด) */
    read('company', async () => ({ data: await getPublishedCompanyProfile(supabase) })),
    read('form', () => supabase.from('document_standard_versions')
      .select('"formCode", revision, "effectiveDate", "titleEn", "versionNumber"')
      .eq('documentKey', SURVEY_REPORT_STANDARD_KEY).eq('status', 'published')
      .order('versionNumber', { ascending: false }).limit(1)),
  ]);

  const form = documentStandardToForm((standard || [])[0] || null);
  // ลำดับตามตารางป้าย ไม่ใช่ตามว่าการอ่านไหนล้มก่อน — ข้อความที่ขึ้นจอและลง log นิ่งทุกรอบ
  const unknown = Object.keys(SURVEY_REPORT_INPUT_LABELS).filter((name) => failed.has(name));
  const inputs = {
    takenAt: takenAt || null,
    request: pendingAnswer && request ? { ...request, ...pendingAnswer } : (request || null),
    deal: deal ? { code: deal.code || null } : null,
    // ไทยก่อน ไม่มีค่อยตกไปอังกฤษ — ตัวเดียวกับที่ทุกจุดสำเนาชื่อลูกค้าใช้ ห้ามอ่าน `.name` ตรง ๆ
    customer: customerRow
      ? { id: customerRow.id, arCode: customerRow.arCode || null, name: customerNameIn(customerRow, 'th') || null }
      : null,
    site: site || null,
    visit: visitPart.visit,
    visitClosedBySend: visitPart.visitClosedBySend,
    assigneeRoleLabel: visitPart.assigneeRoleLabel,
    helpers: visitPart.helpers,
    priorUnable: visitPart.priorUnable,
    zones: zonePart.zones,
    zoneRegistry: zonePart.zoneRegistry,
    filesByZone: zonePart.filesByZone,
    sizes: sizeRows,
    history,
    company: company
      ? {
        name: company.legalNameTh || null, address: company.address || null, taxId: company.taxId || null,
        tel: company.phone || null, line: company.line || null, website: company.website || null,
      }
      : null,
    // `documentStandardToForm` คืนวันที่มีผลเป็น พ.ศ. แล้ว ("29/09/2569")
    form: form ? { code: form.code, revision: form.revision, effectiveDate: form.effectiveDate } : null,
    unknown,
  };
  return { inputs, unknown };
}

/* ฉบับที่ต้องจัดหน้าได้ทั้งคู่ก่อนส่งผล — ป้ายนำหน้าเหตุ: เลขหน้าของสองฉบับไม่ตรงกัน (ฉบับภายในมีแผงกับภาคผนวก) */
const VERSIONS = [['customer', 'ฉบับลูกค้า'], ['internal', 'ฉบับภายใน']];

/**
 * 🔑 **รอบตรวจก่อนส่งผล** — คืน `{ blockers: [{ kind, text }], warnings: string[], unknown: string[] }`
 *   ตัวเดียวของ route ส่งผล (S5) และของ GET ใบประเมิน (`document.send`) ⇒ แถวด่านบนการ์ดพูดตรงกับที่ server ตัดสิน
 *
 * @param opts.request      แถว `dept_requests` · ยังไม่ส่งผล = ใส่ผู้ส่งที่กำลังจะเขียน (`nowIso` + `user`) ให้ในอินพุต
 *                          (ตัวสร้างภาพนิ่งบังคับ `answeredAt` + `answeredByName`) · ส่งผลแล้ว = ใช้ของบนแถว
 * @param opts.zones · filesByZone · sizes   ที่ผู้เรียกอ่านไว้แล้วสำหรับด่านหกข้อ — ไม่ส่ง = ตัวโหลดอ่านเอง
 * @param opts.open         นัดที่ยังกินสิทธิ์ของใบ (`findSurveyVisit(…, { openOnly: true })`) หรือ null
 * @param opts.today        วันไทยวันนี้ `YYYY-MM-DD` (`businessDate()` ของผู้เรียก) · @param opts.nowIso จุดเวลาของคำขอ
 *
 * - `blockers` = `surveyReportFreezeIssues` ทุกชนิด + (เมื่อภาพนิ่งโหมด `check` ออกได้) หน้าที่ล้นของทั้งสองฉบับ ชนิด `content`
 *    ⭐ การส่งผลตีกลับเฉพาะชนิด `content` · ขั้นออกเลขตีกลับทุกชนิด (ผู้เรียกกรองเอง)
 *    ⚠️ ตัวจัดหน้าไม่อ่านขนาดรูป ⇒ โหมด `check` (ยังไม่มีรูป) จัดหน้าได้ผลเท่าโหมด `freeze`
 *    ⭐ นัดที่ค้างยังเป็นร่าง = เหตุของ `surveySendVisitStep` เอง (ข้อความเดียวกับที่ route ตอบ) แทน "ไม่พบนัดประเมิน"
 *    🔴 **ไม่มีคำไหนในข้อความที่คนพิมพ์เป็นเหตุขัดข้อง** (มติเจ้าของข้อ 3: พิมพ์ตามที่พิมพ์มา — คำต้องห้ามเป็นแค่คำเตือน)
 *       ⇒ สิ่งที่รอบตรวจนี้ปล่อยผ่าน ขั้นออกเลขต้องไม่มาติดหลังใบถูกตอบ (มติข้อ 2): ยามกันรั่วของฉบับลูกค้า
 *       (`surveyReportCustomerHtmlIssues`) จึงดู markup ของตัวเรนเดอร์ ไม่ค้นคำ — หมายเหตุ "ดูรายละเอียดในฉบับภายใน" ผ่านทั้งสองด่าน
 *       🐞 เดิมยามค้นคำว่า "ฉบับภายใน" ทั้ง HTML: รอบตรวจปล่อยผ่าน → ใบถูกตอบ กระดิ่งถึงฝ่ายขาย → เอกสารออกไม่ได้ทุกครั้งที่กด
 *       (เทสต์ของไฟล์นี้ล็อกสองด่านคู่กัน — ใครเพิ่มด่านคำที่ฝั่งใดฝั่งหนึ่ง ต้องเพิ่มอีกฝั่งให้ตรงกัน)
 * - `warnings` = `surveyReportSendWarnings` ของฉบับลูกค้าจากภาพนิ่งโหมด `draft` (ของขาดไม่ล้ม) — จอกางให้หัวหน้าอ่านแล้วส่งกลับ
 *    มาเป็น `seenWarnings` · server ตีกลับเฉพาะเมื่อเจอบรรทัดที่จอไม่ได้ส่งมา
 * - `unknown`  = ชิ้นที่อ่านไม่สำเร็จ — ไม่ว่าง = ผู้เรียกข้ามการตีกลับ (ปัญหาของระบบไม่ขวางการส่งผล)
 * ⚠️ ตัวโหลดไม่ throw · ตรรกะล้วนข้างล่าง throw ได้เมื่อข้อมูลผิดรูปจริง ๆ — ผู้เรียกห่อ try/catch แล้วไม่ตีกลับ (สเปก S5)
 */
export async function surveyReportPrecheck(supabase, {
  request, user = null, zones = null, filesByZone = null, sizes, open = null, today = null, nowIso = null,
} = {}) {
  const step = surveySendVisitStep(open, { today });
  const closing = step.action === 'close' ? { ...open, ...step.patch } : null;
  const pendingAnswer = request && !request.answeredAt
    ? { answeredAt: nowIso, answeredById: user?.id ?? null, answeredByName: user?.name ?? null }
    : null;

  const { inputs, unknown } = await loadSurveyReportInputs(supabase, {
    request, closedVisit: closing, pendingAnswer, zones, filesByZone, sizes, takenAt: nowIso,
  });

  let blockers = surveyReportFreezeIssues(inputs);
  if (step.action === 'block') {
    blockers = [
      { kind: 'content', text: step.error },
      ...blockers.filter((issue) => issue.text !== SURVEY_REPORT_NO_VISIT),
    ];
  }

  const checked = buildSurveyReportSnapshot(inputs, { mode: 'check' });
  if (checked.snapshot) {
    for (const [version, label] of VERSIONS) {
      const layout = paginateSurveyReport(surveyReportView(checked.snapshot, { version }));
      for (const line of surveyReportOverflowErrors(layout)) blockers.push({ kind: 'content', text: `${label}: ${line}` });
    }
  }

  const draft = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
  const warnings = surveyReportSendWarnings(surveyReportView(draft.snapshot, { version: 'customer' }));

  return { blockers, warnings: Array.isArray(warnings) ? warnings : [], unknown };
}
