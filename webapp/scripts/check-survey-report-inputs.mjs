#!/usr/bin/env node
/* ── ตรวจของจริงก่อนเปิดสวิตช์ "ส่งผลแล้วออกเอกสาร" — **อ่านอย่างเดียว** (PR-2 §16 ข้อ 3) ───────────────────
 *
 * 🔴 dev DB = prod DB ⇒ สคริปต์นี้ **SELECT อย่างเดียว**: ไม่เรียก RPC · ไม่แตะที่เก็บไฟล์ · ไม่ดึง Drive · ไม่เขียนตารางไหน
 *   ยามสองชั้น: ① import เฉพาะตัวโหลดอินพุตกับตรรกะล้วน (`surveyReportInputs` · ด่านส่งผล · ตัวจัดหน้า · ตัวกรองฉบับลูกค้า)
 *   — ไม่มีขั้นออกเลข/ขั้นรูป/ขั้นกระดาษ  ② client ถูกห่อด้วย `readOnlyClient`: `from(t)` ให้เรียกได้แค่ `.select()` ·
 *   `rpc` · `storage` · insert/update/upsert/delete · `auth.admin` นอกจาก `getUserById` = โยนทันที (เทสต์ล็อกทั้งสองชั้น)
 *   ⚠️ ถึงอ่านอย่างเดียวก็เป็นการอ่านฐานของจริง — **รันเมื่อเจ้าของอนุญาตเท่านั้น**
 *
 * ตอบคำถามเดียว: **ถ้าเปิดสวิตช์ `SURVEY_REPORT_ISSUE_AT_SEND` วันนี้ ใบไหนจะถูกตีกลับตอนกด "ส่งผลให้ฝ่ายขาย"**
 *   (มติเจ้าของ 01/10 ข้อ 1: ปัญหาของใบตีกลับ — บางใบที่วันนี้ส่งได้จะถูกตีกลับจนกว่าจะแก้ข้อมูล · ต้องนับก่อนเปิด)
 *   และใบที่ตอบไปแล้ว: ปุ่ม "ออกเอกสาร" จะติดอะไร
 *
 * พิมพ์ต่อใบ: ชิ้นที่อ่านไม่สำเร็จ · ด่านส่งผลเดิม (หกข้อ · ขนาดแพ็คเกจ · รูปจุด) · เหตุของเอกสารแยกชนิด (`content` ตีกลับการส่ง ·
 *   `system` ไม่ตีกลับ) · หน้าที่ล้นของแต่ละฉบับ + จำนวนหน้า · คำเตือนที่หัวหน้าต้องรับทราบ (`seenWarnings`) · รายการรูปที่กระดาษพิมพ์
 *   ⚠️ ที่ **ไม่ได้ตรวจ**: รูปเปิดได้จริงไหม (ต้องดึงไฟล์จาก Drive — เป็นงานของรอบตรวจรูปก่อนส่งผล S3) และผลวัดกระดาษใน chromium
 *
 * รัน (จาก `webapp/` · อ่าน SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY จาก .env.local):
 *   node --import ./scripts/test-loader.mjs scripts/check-survey-report-inputs.mjs RQ-AS-26090186     # เลขที่ใบ หรือ id
 *   node --import ./scripts/test-loader.mjs scripts/check-survey-report-inputs.mjs --open             # ใบประเมินที่ยังไม่ส่งผลทุกใบ + สรุปยอด
 *   … --json                                                                                         # ผลเป็น JSON (ไม่มีข้อความบนจอ)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { businessDate } from '../src/lib/businessDate.js';
import { listAttachments } from '../src/lib/master/attachments.js';
import { surveyPackageSizeSendError } from '../src/lib/service/packageSizes.js';
import { loadPackageSizesOrNull } from '../src/lib/service/packageSizesRepo.js';
import { surveySendError } from '../src/lib/service/survey.js';
import { surveyNeedsVisit } from '../src/lib/service/surveyMethod.js';
import { loadSurveyReportInputs, surveyReportPrecheck } from '../src/lib/service/surveyReportInputs.js';
import { paginateSurveyReport, surveyReportOverflowErrors } from '../src/lib/service/surveyReportLayout.js';
import { buildSurveyReportSnapshot, surveyReportImageFiles } from '../src/lib/service/surveyReportSnapshot.js';
import { surveyReportView } from '../src/lib/service/surveyReportView.js';
import { loadSurveyZones } from '../src/lib/service/surveyRepo.js';
import { surveySendDocumentRefusal, surveySendVisitStep } from '../src/lib/service/surveySendClose.js';
import { surveySpotSendError } from '../src/lib/service/surveySpotPhotos.js';
import { findSurveyVisit } from '../src/lib/service/surveyVisit.js';

/* ใบที่ยังไม่ส่งผลที่อ่านต่อรอบของ `--open` — ต้องมีเพดานเสมอ (กติกา check:rowcap) · เกินนี้ = บอกให้เห็น ไม่ตัดเงียบ */
export const OPEN_SURVEY_LIMIT = 200;

const VERSIONS = [['customer', 'ฉบับลูกค้า'], ['internal', 'ฉบับภายใน']];
const message = (e) => String(e?.message || e || '').trim();

/* ผู้ส่งผลสมมติของใบที่ยังไม่ส่ง — ตัวสร้างภาพนิ่งบังคับชื่อผู้ส่ง (ของจริงคือหัวหน้าที่กดปุ่ม) ⇒ ไม่มีชื่อ = ได้เหตุปลอม "ไม่มีผู้ส่งผล" */
const PENDING_HEAD = Object.freeze({ id: 'check-inputs', name: 'หัวหน้าที่จะกดส่งผล' });

/**
 * 🔴 **ห่อ client ให้อ่านได้อย่างเดียว** — ทางเขียนทุกทางโยนทันที ไม่ว่าโมดูลที่ถูกเรียกจะเปลี่ยนไปยังไงในวันหน้า
 *   `from(table)` → เหลือแค่ `.select()` (ตัวต่อ query ของ supabase-js หลัง `.select()` ไม่มีคำสั่งเขียนแล้ว)
 *   `auth.admin.getUserById` → ผ่าน (ชื่อผู้ช่วย · ตำแหน่งผู้ประเมิน) · อย่างอื่นของ `auth` · `rpc` · `storage` → โยน
 */
export function readOnlyClient(client) {
  const refuse = (what) => { throw new Error(`check-survey-report-inputs อ่านอย่างเดียว — ห้าม ${what}`); };
  return Object.freeze({
    from(table) {
      const builder = client.from(table);
      return Object.freeze({
        select: (...args) => builder.select(...args),
        insert: () => refuse(`insert ตาราง ${table}`),
        update: () => refuse(`update ตาราง ${table}`),
        upsert: () => refuse(`upsert ตาราง ${table}`),
        delete: () => refuse(`delete ตาราง ${table}`),
      });
    },
    rpc: (name) => refuse(`rpc ${name}`),
    get storage() { return refuse('ที่เก็บไฟล์ (storage)'); },
    auth: Object.freeze({
      admin: Object.freeze({
        getUserById: (id) => client.auth.admin.getUserById(id),
      }),
    }),
  });
}

/**
 * 🔑 **ตรวจใบเดียว** — คืนรายงาน (ไม่พิมพ์เอง · ไม่โยน: การอ่านที่ล้มกลายเป็น `error` ของรายงาน)
 *
 * @param supabase  client ที่ห่อด้วย `readOnlyClient` แล้ว
 * @param opts.request  แถว `dept_requests`
 * @param opts.now      นาฬิกาของรอบ (ค่าตั้งต้น = ตอนนี้) — "วันนี้" ของด่านคิดตามเวลาไทย (`businessDate`)
 * @returns `{ request, mode, error, unknown, visit, gates, issues, overflow, warnings, images, verdict }`
 *   · `mode`     `'send'` = ใบยังไม่ส่งผล (ถามว่า S4/S5 จะว่ายังไง) · `'issue'` = ส่งผลแล้ว (ถามว่าปุ่ม "ออกเอกสาร" จะติดอะไร)
 *   · `gates`    `[{ name, error }]` ด่านที่มีอยู่ก่อน PR-2 — `error: null` = ผ่าน
 *   · `issues`   `{ content: string[], system: string[] }` เหตุของเอกสารจาก `surveyReportPrecheck` ตัวเดียวกับที่ route ใช้
 *   · `overflow` `{ customer: { pages, errors }, internal: { pages, errors } }` หรือ `null` เมื่อยังจัดหน้าไม่ได้
 *   · `verdict`  `{ refusedByGates, refusedByDocument, newlyRefused, skipped }` — `newlyRefused` = วันนี้ส่งได้ แต่เปิดสวิตช์แล้วถูกตีกลับ
 */
export async function checkSurveyReportInputs(supabase, { request, now = new Date() } = {}) {
  const report = {
    request: {
      id: request?.id ?? null, docNo: request?.docNo ?? null, title: request?.title ?? null,
      answered: !!request?.answeredAt, cancelled: !!request?.cancelledAt, kind: request?.kind ?? null,
    },
    mode: request?.answeredAt ? 'issue' : 'send',
    error: null, unknown: [], visit: { action: 'none', code: null, error: null },
    gates: [], issues: { content: [], system: [] }, overflow: null, warnings: [], images: [],
    verdict: { refusedByGates: false, refusedByDocument: null, newlyRefused: false, skipped: false },
  };
  if (!request?.id || request.kind !== 'site_survey') {
    report.error = 'ไม่ใช่ใบคำร้องประเมินพื้นที่';
    return report;
  }

  const nowIso = new Date(now).toISOString();
  const today = businessDate(nowIso);
  const send = report.mode === 'send';

  try {
    /* ── ชุดเดียวกับที่ route ส่งผลอ่านสำหรับด่านหกข้อ (S4) ───────────────────────────── */
    const zones = await loadSurveyZones(supabase, request.id);
    const lists = await Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, lists[i] || []]));
    const sizes = await loadPackageSizesOrNull(supabase);
    // ใบที่ส่งผลแล้วไม่มีนัดให้ปิดแทนช่าง (`closesVisit: false` — กติกาเดียวกับขั้นออกเลข I3)
    const open = send ? await findSurveyVisit(supabase, request.id, { openOnly: true }) : null;
    // ใบประเมินจากแบบทั้งใบ = ไม่ต้องมีนัด (ตัวตัดสินเดียวกับ route ส่งผล) — นัดที่ยังเปิดบนใบแบบนั้นถูกบล็อก ไม่ถูกปิดให้
    const step = surveySendVisitStep(open, { today, needsVisit: surveyNeedsVisit(zones) });
    report.visit = { action: step.action, code: open?.code ?? null, error: step.error ?? null };

    report.gates = [
      { name: 'ด่านส่งผลหกข้อ', error: surveySendError(zones, filesByZone, { canSend: true }) || null },
      { name: 'ขนาดแพ็คเกจ', error: surveyPackageSizeSendError(zones, sizes) || null },
      { name: 'รูปจุด', error: surveySpotSendError(zones, filesByZone, { closesVisit: step.action === 'close' }) || null },
    ];

    /* ── คำตัดสินของ server เอง (S5 · `document.send` / `document.issue` ของ GET ใบประเมิน) ─────────── */
    const check = await surveyReportPrecheck(supabase, {
      request, user: PENDING_HEAD, zones, filesByZone, sizes, open, today, nowIso,
    });
    report.unknown = [...check.unknown];
    report.warnings = [...check.warnings];
    const seen = new Set();
    for (const issue of check.blockers) {
      if (!issue?.text || seen.has(issue.text)) continue;
      seen.add(issue.text);
      report.issues[issue.kind === 'content' ? 'content' : 'system'].push(issue.text);
    }

    /* ── รายละเอียดที่ตัวตรวจไม่คืน: จำนวนหน้า · หน้าที่ล้นแยกฉบับ · รูปที่กระดาษพิมพ์ ───────────────
       อินพุตชุดเดียวกับที่ตัวตรวจประกอบ (ผู้ส่งที่กำลังจะเขียน + นัดที่การส่งนี้จะปิด) — ผลวัด/ไฟล์/ทะเบียนส่งต่อ ไม่อ่านซ้ำ */
    const { inputs } = await loadSurveyReportInputs(supabase, {
      request,
      closedVisit: step.action === 'close' ? { ...open, ...step.patch } : null,
      pendingAnswer: send ? { answeredAt: nowIso, answeredById: PENDING_HEAD.id, answeredByName: PENDING_HEAD.name } : null,
      zones, filesByZone, sizes, takenAt: nowIso,
    });
    report.images = surveyReportImageFiles(inputs).map(({ attId, kind, file }) => ({
      attId, kind, fileName: file?.fileName ?? null, mimeType: file?.mimeType ?? null,
      sizeBytes: file?.sizeBytes ?? null, onDrive: !!file?.driveFileId,
    }));
    const checked = buildSurveyReportSnapshot(inputs, { mode: 'check' });
    if (checked.snapshot) {
      report.overflow = {};
      for (const [version] of VERSIONS) {
        const layout = paginateSurveyReport(surveyReportView(checked.snapshot, { version }));
        report.overflow[version] = { pages: layout.pageCount, errors: surveyReportOverflowErrors(layout) };
      }
    }

    /* ── สรุป ──────────────────────────────────────────────────────────────── */
    const gateFails = report.gates.some((g) => g.error);
    report.verdict.refusedByGates = gateFails;
    if (send) {
      if (step.action === 'block') report.verdict.refusedByDocument = step.error;
      else if (report.unknown.length) report.verdict.skipped = true; // อ่านไม่ครบ = route ข้ามการตีกลับ (ปัญหาของระบบไม่ขวางการส่งผล)
      else report.verdict.refusedByDocument = surveySendDocumentRefusal(check.blockers);
      // นัดร่างตีกลับอยู่แล้วก่อน PR-2 (ประโยคเดียวกัน จากลำดับการเขียน) — ไม่นับเป็น "ตีกลับใหม่"
      report.verdict.newlyRefused = !gateFails && step.action !== 'block' && !!report.verdict.refusedByDocument;
    } else {
      // ปุ่ม "ออกเอกสาร" ตีกลับทุกชนิด (ทั้ง content และ system) และวิ่งด่านส่งผลซ้ำ
      const all = [...report.gates.map((g) => g.error).filter(Boolean), ...report.issues.content, ...report.issues.system];
      report.verdict.refusedByDocument = all.length ? `ออกเอกสารไม่ได้ — ${[...new Set(all)].join(' | ')}` : null;
    }
  } catch (e) {
    report.error = `อ่าน/ตรวจใบนี้ไม่สำเร็จ — ${message(e)}`;
  }
  return report;
}

/* ── หาใบ (SELECT เท่านั้น · ทุกคำสั่งมีขอบเขต) ─────────────────────────────────────────── */

/** ใบเดียวจาก id หรือเลขที่ (`RQ-…`) — คืน `{ request, error }` */
export async function findSurveyRequest(supabase, ref) {
  const key = String(ref ?? '').trim();
  if (!key) return { request: null, error: 'ไม่ได้ระบุใบ' };
  const column = /^RQ-/i.test(key) ? 'docNo' : 'id';
  const { data, error } = await supabase.from('dept_requests').select('*').eq(column, key).limit(1);
  if (error) return { request: null, error: message(error) };
  return { request: (data || [])[0] || null, error: null };
}

/** ใบประเมินที่ยังไม่ส่งผลและไม่ถูกยกเลิก ใหม่ก่อน — คืน `{ requests, capped, error }` */
export async function loadOpenSurveyRequests(supabase, { limit = OPEN_SURVEY_LIMIT } = {}) {
  const { data, error } = await supabase
    .from('dept_requests').select('*')
    .eq('kind', 'site_survey').is('answeredAt', null).is('cancelledAt', null)
    .order('createdAt', { ascending: false }).order('id', { ascending: true })
    .limit(limit);
  if (error) return { requests: [], capped: false, error: message(error) };
  return { requests: data || [], capped: (data || []).length >= limit, error: null };
}

/* ── พิมพ์ ───────────────────────────────────────────────────────────────────── */

const kb = (bytes) => (Number.isFinite(Number(bytes)) && bytes !== null ? `${Math.round(Number(bytes) / 1024)} KB` : '—');

/** รายงานของใบเดียว → บรรทัดข้อความ */
export function reportLines(r) {
  const out = [];
  const head = `${r.request.docNo || r.request.id} · ${r.mode === 'send' ? 'ยังไม่ส่งผล' : 'ส่งผลแล้ว'}${r.request.cancelled ? ' · ถูกยกเลิก' : ''}`;
  out.push(`\n── ${head} ──`);
  if (r.request.title) out.push(`  ${r.request.title}`);
  if (r.error) { out.push(`  ❌ ${r.error}`); return out; }

  out.push(`  ชิ้นที่อ่านไม่สำเร็จ: ${r.unknown.length ? r.unknown.join(' · ') : '— (อ่านครบ)'}`);
  if (r.mode === 'send') {
    out.push(`  นัดที่ยังเปิด: ${r.visit.code ? `${r.visit.code} → ${r.visit.action === 'close' ? 'จะถูกปิดพร้อมส่งผล' : r.visit.action === 'block' ? 'เป็นร่าง — ส่งผลไม่ได้' : 'ไม่แตะ'}` : '— (ไม่มี)'}`);
  }
  out.push('  ด่านที่มีอยู่แล้ว (ก่อน PR-2):');
  for (const gate of r.gates) out.push(`    ${gate.error ? '✗' : '✓'} ${gate.name}${gate.error ? ` — ${gate.error}` : ''}`);

  out.push(`  เหตุของเอกสาร · ชนิด content (${r.mode === 'send' ? 'ตีกลับการส่งผล' : 'ต้องดึงผลกลับมาแก้'}): ${r.issues.content.length || '—'}`);
  for (const text of r.issues.content) out.push(`    ✗ ${text}`);
  out.push(`  เหตุของเอกสาร · ชนิด system (${r.mode === 'send' ? 'ไม่ตีกลับการส่ง — ออกเอกสารทีหลัง' : 'แก้แล้วกดออกเอกสารซ้ำได้'}): ${r.issues.system.length || '—'}`);
  for (const text of r.issues.system) out.push(`    ! ${text}`);

  if (r.overflow) {
    for (const [version, label] of VERSIONS) {
      const o = r.overflow[version];
      out.push(`  ${label}: ${o.pages} หน้า · หน้าล้น ${o.errors.length || '—'}`);
      for (const text of o.errors) out.push(`    ✗ ${text}`);
    }
  } else {
    out.push('  จัดหน้ายังไม่ได้ (ภาพนิ่งยังสร้างไม่ได้ — ดูเหตุข้างบน)');
  }

  out.push(`  คำเตือนที่หัวหน้าต้องรับทราบก่อนส่ง (seenWarnings): ${r.warnings.length || '—'}`);
  for (const text of r.warnings) out.push(`    ⚠ ${text}`);

  out.push(`  รูปที่กระดาษพิมพ์: ${r.images.length} ไฟล์ (ไม่ได้ตรวจว่าเปิดได้จริง — ต้องดึงจาก Drive)`);
  for (const img of r.images) {
    out.push(`    ${String(img.kind).padEnd(5)} ${img.fileName || img.attId} · ${img.mimeType || '?'} · ${kb(img.sizeBytes)}${img.onDrive ? '' : ' · ❌ ไม่มีไฟล์บน Drive'}`);
  }

  const v = r.verdict;
  if (r.mode === 'send') {
    if (v.refusedByGates) out.push('  ⇒ วันนี้ก็ยังส่งผลไม่ได้ (ติดด่านเดิม) — ไม่นับเป็นใบที่ถูกตีกลับเพิ่ม');
    else if (v.skipped) out.push('  ⇒ อ่านไม่ครบ: route จะข้ามการตีกลับของเอกสารแล้วส่งผลต่อ (เอกสารออกทีหลัง) — รันซ้ำเพื่อดูผลจริง');
    else if (v.newlyRefused) out.push(`  ⇒ 🔴 เปิดสวิตช์แล้วใบนี้จะถูกตีกลับ: ${v.refusedByDocument}`);
    else if (v.refusedByDocument) out.push(`  ⇒ ส่งผลไม่ได้ (เหมือนวันนี้): ${v.refusedByDocument}`);
    else out.push(`  ⇒ ✅ ส่งผลได้${r.warnings.length ? ` (หัวหน้าต้องรับทราบคำเตือน ${r.warnings.length} ข้อ)` : ''}${r.issues.system.length ? ' · เอกสารจะยังไม่ออกจนกว่าเหตุชนิด system จะหาย' : ''}`);
  } else if (v.refusedByDocument) out.push(`  ⇒ 🔴 ปุ่ม "ออกเอกสาร" จะตอบ: ${v.refusedByDocument}`);
  else out.push('  ⇒ ✅ ปุ่ม "ออกเอกสาร" ผ่านด่านของข้อมูล (ยังเหลือการดึงรูปและการวัดกระดาษ ซึ่งสคริปต์นี้ไม่ทำ)');
  return out;
}

/** สรุปยอดของหลายใบ (`--open`) */
export function summaryLines(reports, { capped = false, limit = OPEN_SURVEY_LIMIT } = {}) {
  const send = reports.filter((r) => r.mode === 'send' && !r.error);
  const issue = reports.filter((r) => r.mode === 'issue' && !r.error);
  // วันนี้ (สวิตช์ปิด) ส่งผลได้ไหม — ติดด่านเดิม หรือนัดยังเป็นร่าง = ส่งไม่ได้อยู่แล้ว
  const blockedToday = (r) => r.verdict.refusedByGates || r.visit.action === 'block';
  const ready = send.filter((r) => !blockedToday(r));
  const count = (fn) => ready.filter(fn).length;
  return [
    `\n══ สรุป ${reports.length} ใบ${capped ? ` (ถึงเพดาน ${limit} ใบ — อาจมีมากกว่านี้)` : ''} ══`,
    `  อ่าน/ตรวจไม่สำเร็จ: ${reports.filter((r) => r.error).length}`,
    `  ยังไม่ส่งผล: ${send.length} ใบ`,
    `    วันนี้ก็ส่งไม่ได้ (ติดด่านเดิม · นัดเป็นร่าง): ${send.length - ready.length}`,
    `    วันนี้ส่งได้: ${ready.length}`,
    `      🔴 จะถูกตีกลับเพิ่มเมื่อเปิดสวิตช์ (S5): ${count((r) => r.verdict.newlyRefused)}`,
    `      อ่านไม่ครบ (route ข้ามการตีกลับ): ${count((r) => r.verdict.skipped)}`,
    `      มีคำเตือนให้รับทราบ: ${count((r) => r.warnings.length > 0)}`,
    `      มีเหตุชนิด system (ส่งได้ เอกสารยังไม่ออก): ${count((r) => r.issues.system.length > 0)}`,
    `  ส่งผลแล้ว: ${issue.length} ใบ · ปุ่ม "ออกเอกสาร" จะติด: ${issue.filter((r) => r.verdict.refusedByDocument).length}`,
  ];
}

/**
 * ทั้งรอบ — เทสต์เรียกตรงด้วย client ปลอม · รันจริงผ่านท้ายไฟล์
 * @returns exit code: 0 = ตรวจครบ (ไม่ว่าผลของใบจะเป็นอะไร — สคริปต์นี้รายงาน ไม่ใช่ด่าน) · 1 = หาใบไม่เจอ/อ่านไม่ได้ · 2 = ใช้ผิด
 */
export async function main({ argv = [], supabase, log = console.log, now = new Date() } = {}) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const refs = argv.filter((a) => !a.startsWith('--'));
  const json = flags.has('--json');
  if ((!refs.length && !flags.has('--open')) || flags.has('--help')) {
    log('ใช้: node --import ./scripts/test-loader.mjs scripts/check-survey-report-inputs.mjs <id | RQ-…> [...] | --open [--json]');
    return flags.has('--help') ? 0 : 2;
  }
  const client = readOnlyClient(supabase);
  const requests = [];
  let capped = false;
  for (const ref of refs) {
    const found = await findSurveyRequest(client, ref);
    if (found.error || !found.request) {
      log(`❌ ${ref}: ${found.error || 'ไม่พบใบคำร้อง'}`);
      return 1;
    }
    requests.push(found.request);
  }
  if (flags.has('--open')) {
    const open = await loadOpenSurveyRequests(client);
    if (open.error) { log(`❌ อ่านใบประเมินที่ยังไม่ส่งผลไม่สำเร็จ: ${open.error}`); return 1; }
    capped = open.capped;
    const have = new Set(requests.map((r) => r.id));
    requests.push(...open.requests.filter((r) => !have.has(r.id)));
  }

  const reports = [];
  // ทีละใบ — ใบหนึ่งยิงสิบกว่าคำสั่งขนานกันอยู่แล้ว ไม่ต้องถล่มฐานของจริงพร้อมกันทุกใบ
  for (const request of requests) reports.push(await checkSurveyReportInputs(client, { request, now }));

  if (json) {
    log(JSON.stringify({ reports, capped }, null, 2));
    return 0;
  }
  for (const report of reports) reportLines(report).forEach((line) => log(line));
  if (reports.length > 1 || flags.has('--open')) summaryLines(reports, { capped }).forEach((line) => log(line));
  return 0;
}

/* ── รันจริง (ไม่ใช่ตอน import จากเทสต์) ─────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* ไม่มี .env.local = ใช้ env ของ shell */ }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ต้องมี SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY (ใน .env.local)');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const code = await main({ argv: process.argv.slice(2), supabase: createClient(url, key, { auth: { persistSession: false } }) });
  process.exit(code);
}
