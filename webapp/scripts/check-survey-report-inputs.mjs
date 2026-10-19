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
 *   … --answered                                                                                     # ใบที่ส่งผลแล้ว (ยังไม่ถูกยกเลิก) ทุกใบด้วย
 *   … --signers                                                                                      # ตรวจด้วยกติกาลายเซ็นจริง (PR-SIG) + รายชื่อผู้ลงนาม
 *   … --json                                                                                         # ผลเป็น JSON (ไม่มีข้อความบนจอ)
 *
 * ⭐ **ก่อนเปิดสวิตช์ลายเซ็นจริง** (PR-SIG §9 ขั้น 3 · มติเจ้าของ 09/10/2026): `--open --answered --signers`
 *   ตอบสองคำถาม: ① ใครต้องเพิ่มลายเซ็นที่ "บัญชีของฉัน" (ผู้ประเมินของทุกใบ · ผู้ส่งผลของใบที่ส่งแล้ว)
 *   ② มีกี่ใบที่ผู้ประเมินยังไม่มีลายเซ็น **และ** บัญชีถูกปิดหรือถูกลบ — ใบแบบนั้นส่งผลใหม่ไม่ได้อีกเลยหลังดึงผลกลับ
 *      ⇒ **ต้องเป็น 0** (หรือเจ้าของตอบคำถามเปิดข้อ 1 ของสเปกก่อน) จึงเปิดสวิตช์
 *   ③ มีกี่ใบที่ **บัญชีของผู้ลงนามนั่งที่นั่งนั้นไม่ได้** — ผู้ประเมินไม่ใช่บัญชีฝ่ายบริการ หรือผู้ส่งผลของใบที่ตอบแล้วไม่ใช่ผู้มีสิทธิ์ส่งผล
 *      (ใบที่ตอบผ่านปุ่มทั่วไปก่อน 24/09 ถูกตอบโดยใครก็ได้ที่ตอบคำร้องของฝ่ายได้) — เอกสารของใบแบบนั้นออกไม่ได้เมื่อกติกาเปิด
 *      ต้องแก้ที่ตัวใบ (เปลี่ยนผู้รับผิดชอบของนัด · ดึงผลกลับแล้วให้หัวหน้าส่งใหม่) ไม่ใช่เพิ่มลายเซ็น
 *   · `--signers` ส่ง `signatureRule: 'required'` ให้ตัวตรวจตรง ๆ (ไม่อ่าน/ไม่สลับสวิตช์) — ไม่ส่ง = ตรวจตามสวิตช์ของเครื่องที่รัน
 *   · อ่านเพิ่มแค่สองตาราง (`user_signatures` · `user_signature_versions`) ผ่านตัวโหลดเดียวกับ route — **ไม่แตะคลังไฟล์ลายเซ็น**
 *     ⇒ ไฟล์ลายเซ็นที่ว่าง/จาง/หาย **ไม่ถูกจับที่นี่** (ถูกจับตอนกดส่งผลหรือออกเอกสาร)
 *   · ใบที่ยังไม่ส่งผล: ที่นั่งผู้ตรวจสอบและอนุมัติยังไม่มีตัวตน (คือหัวหน้าที่จะกดส่ง) — ไม่ถูกรายงาน และบรรทัดของเขาไม่ถูกนับ
 *
 * ⭐ **ประเมินจากแบบ (งวด S3)**
 *   · ทุกใบพิมพ์บรรทัด `วิธีประเมิน: ลงหน้างาน {a} · จากแบบ {b}` (นับเฉพาะพื้นที่ที่ไม่ถูกตัด)
 *   · `--drawing-method on|off` (ค่าตั้งต้น off) = ค่าสวิตช์ `SURVEY_DRAWING_METHOD` ที่ส่งให้ตัวตรวจ/ตัวโหลดเป็น `drawingMethodEnabled`
 *     — **สคริปต์ไม่อ่านสวิตช์เอง** (ไม่ import โมดูลสวิตช์ · เทสต์ล็อกไว้) · ผลเดียวคือหางของบรรทัด "ไม่พบนัด"
 *   · `--r0 [RQ-… | SU-… | id …]` = รายการ R0 ก่อน merge งวด S3 (สเปก S3 §4) แทนการตรวจรายใบ: จำนวนแถวเอกสาร · แถวที่มีเลขแต่ยังไม่ตรึง
 *     กระดาษ · ใบที่ส่งผลแล้วมีพื้นที่จากแบบแต่ยังไม่มีแถวเอกสาร (ใบที่ติดข้อกัน — ภาพแบบรายพื้นที่ + คำตอบ "ต้องยืนยันหน้างานไหม") ·
 *     และของใบที่ระบุ (ไม่ระบุ = `R0_DEFAULT_REFS`): สถานะ · วิธีประเมินรายพื้นที่ · นัดทุกใบพร้อมสถานะ · มีแถวเอกสารไหม
 *     ⇒ วางผลใน PR · เป็นข้อมูล ไม่ใช่ด่าน (มติ O3 = ข: กระดาษของใบลงหน้างานไม่เปลี่ยน)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { businessDate } from '../src/lib/businessDate.js';
import { listAttachments } from '../src/lib/master/attachments.js';
import { surveyPackageSizeSendError } from '../src/lib/service/packageSizes.js';
import { loadPackageSizesOrNull } from '../src/lib/service/packageSizesRepo.js';
import { SURVEY_DOC_PLAN, surveySendError } from '../src/lib/service/survey.js';
import { isDrawingZone, surveyMethodMix, surveyNeedsVisit, zoneMethod } from '../src/lib/service/surveyMethod.js';
import { loadSurveyReportInputs, surveyReportPrecheck } from '../src/lib/service/surveyReportInputs.js';
import { paginateSurveyReport, surveyReportOverflowErrors } from '../src/lib/service/surveyReportLayout.js';
import { SURVEY_SIGN_SEAT_LABEL, surveyReportSeatEligible, surveyReportSigners } from '../src/lib/service/surveyReportSigners.js';
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

/* ── ผู้ลงนาม (`--signers` · PR-SIG) ─────────────────────────────────────────── */

/** ผู้ลงนามของใบ ตามที่นั่ง — `[{ seat, label, name, userId, signature, account, barred }]`
 *   · `signature`  `'ready'` มีลายเซ็น · `'none'` ยังไม่มี · `'unlinked'` ชื่อพิมพ์แต่ไม่ได้ผูกบัญชี · `'unknown'` อ่านลายเซ็นไม่สำเร็จ
 *   · `account`    สถานะบัญชีของผู้ประเมิน (`'active' | 'disabled' | 'missing' | null`) — ที่นั่งอื่นเป็น `null`
 *   · `barred`     `true` = บัญชีของคนบนที่นั่ง **นั่งที่นั่งนั้นไม่ได้** (ผู้ประเมินไม่ใช่บัญชีฝ่ายบริการ · ผู้ส่งผลไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน)
 *                  — เอกสารไม่พิมพ์ลายเซ็นของบัญชีนั้นแม้จะมีลายเซ็น (`signerEligible` ของตัวโหลด · เพิ่มลายเซ็นไม่ช่วย)
 *   ⚠️ ใบที่ยังไม่ส่งผล: ตัดที่นั่งผู้ตรวจสอบและอนุมัติออก — คนบนที่นั่งคือผู้ส่งผลสมมติของสคริปต์ ไม่ใช่คนจริง */
function signerRows(inputs, { send }) {
  const unread = (inputs.unknown || []).includes('signatures');
  const have = inputs.signatures && typeof inputs.signatures === 'object' ? inputs.signatures : {};
  return surveyReportSigners(inputs).filter((s) => !(send && s.seat === 'approver')).map((s) => {
    let signature = 'none';
    if (unread) signature = 'unknown';
    else if (!s.userId) signature = 'unlinked';
    else if (have[s.userId]) signature = 'ready';
    const account = s.seat === 'assessor' ? (inputs.assigneeAccount ?? null) : null;
    return {
      seat: s.seat, label: SURVEY_SIGN_SEAT_LABEL[s.seat], name: s.name, userId: s.userId, signature, account,
      // ผู้ประเมินที่บัญชีถูกลบและไม่มีลายเซ็นถูกรายงานเป็น "บัญชีถูกลบ" อยู่แล้ว (บรรทัดเดียวกับที่ด่านพูด) — ไม่นับซ้ำเป็นบัญชีที่นั่งไม่ได้
      barred: !!s.userId && surveyReportSeatEligible(inputs, s.seat) === false && !(account === 'missing' && signature === 'none'),
    };
  });
}

const accountGone = (row) => row.account === 'disabled' || row.account === 'missing';
/** ผู้ประเมินยังไม่มีลายเซ็น และบัญชีถูกปิดหรือถูกลบ — ใบที่ส่งผลใหม่ไม่ได้อีกเลยเมื่อกติกาเปิด (สเปก PR-SIG คำถามเปิดข้อ 1) */
export const signerStuck = (report) => (report.signers || []).some((row) => row.seat === 'assessor' && row.signature === 'none' && accountGone(row));
/** มีที่นั่งที่บัญชีนั่งไม่ได้ — ใบนี้ออกเอกสารไม่ได้จนกว่าจะแก้ที่ตัวใบ (เปลี่ยนผู้รับผิดชอบของนัด · ดึงผลกลับให้หัวหน้าส่งใหม่) */
export const signerBarred = (report) => (report.signers || []).some((row) => row.barred === true);

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
 * @param opts.signers  `true` = ตรวจด้วยกติกาลายเซ็นจริง (`signatureRule: 'required'` — ไม่ผ่านสวิตช์) แล้วเติม `report.signers`
 *                      · ไม่ส่ง = ตรวจตามสวิตช์ของเครื่องที่รัน และรายงานไม่มีคีย์ `signers`
 * @param opts.drawingMethodEnabled  ค่าสวิตช์ประเมินจากแบบ (`--drawing-method` · ค่าตั้งต้น `false`) ส่งต่อให้ตัวตรวจกับตัวโหลด (งวด S3)
 * @returns `{ request, mode, error, unknown, method, visit, gates, issues, overflow, warnings, images, verdict }` (+ `signers` เมื่อ `opts.signers`)
 *   · `method`   `{ onsite, drawing }` จำนวนพื้นที่ที่ไม่ถูกตัดรายวิธี (`surveyMethodMix`) · `null` = อ่านผลวัดไม่ได้
 *   · `mode`     `'send'` = ใบยังไม่ส่งผล (ถามว่า S4/S5 จะว่ายังไง) · `'issue'` = ส่งผลแล้ว (ถามว่าปุ่ม "ออกเอกสาร" จะติดอะไร)
 *   · `gates`    `[{ name, error }]` ด่านที่มีอยู่ก่อน PR-2 — `error: null` = ผ่าน
 *   · `issues`   `{ content: string[], system: string[] }` เหตุของเอกสารจาก `surveyReportPrecheck` ตัวเดียวกับที่ route ใช้
 *   · `overflow` `{ customer: { pages, errors }, internal: { pages, errors } }` หรือ `null` เมื่อยังจัดหน้าไม่ได้
 *   · `verdict`  `{ refusedByGates, refusedByDocument, newlyRefused, skipped }` — `newlyRefused` = วันนี้ส่งได้ แต่เปิดสวิตช์แล้วถูกตีกลับ
 */
export async function checkSurveyReportInputs(supabase, { request, now = new Date(), signers = false, drawingMethodEnabled = false } = {}) {
  const report = {
    request: {
      id: request?.id ?? null, docNo: request?.docNo ?? null, title: request?.title ?? null,
      answered: !!request?.answeredAt, cancelled: !!request?.cancelledAt, kind: request?.kind ?? null,
    },
    mode: request?.answeredAt ? 'issue' : 'send',
    error: null, unknown: [], method: null, visit: { action: 'none', code: null, error: null },
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
  // กติกาลายเซ็นจริงของรอบ — ส่งตรงให้ตัวตรวจกับตัวโหลด (ชุดเดียวกัน) เฉพาะเมื่อขอ `--signers`
  const rule = signers ? { signatureRule: 'required' } : {};
  // ค่าสวิตช์ประเมินจากแบบ — ส่งตรง (สคริปต์ไม่อ่านสวิตช์) · `true` ตรงตัวเท่านั้นที่เปิด
  const drawing = { drawingMethodEnabled: drawingMethodEnabled === true };

  try {
    /* ── ชุดเดียวกับที่ route ส่งผลอ่านสำหรับด่านหกข้อ (S4) ───────────────────────────── */
    const zones = await loadSurveyZones(supabase, request.id);
    const lists = await Promise.all(zones.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
    const filesByZone = Object.fromEntries(zones.map((z, i) => [z.id, lists[i] || []]));
    const sizes = await loadPackageSizesOrNull(supabase);
    const mix = surveyMethodMix(zones);
    report.method = { onsite: mix.onsite, drawing: mix.drawing };
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
      request, user: PENDING_HEAD, zones, filesByZone, sizes, open, today, nowIso, ...rule, ...drawing,
    });
    report.unknown = [...check.unknown];
    report.warnings = [...check.warnings];
    /* ผู้ส่งผลสมมติของใบที่ยังไม่ส่ง "ยังไม่มีลายเซ็น" เสมอ (ไม่มีบัญชีจริง) — บรรทัดนั้นเป็นเหตุปลอม ตัดก่อนนับ
       (ของจริง: หัวหน้าที่กดส่งต้องมีลายเซ็นเอง — ดูรายชื่อบัญชีฝ่ายบริการที่หน้า "ความครอบคลุมลายเซ็น") */
    const blockers = check.blockers.filter((issue) => !(send && issue?.sign === true && issue.userId === PENDING_HEAD.id));
    const seen = new Set();
    for (const issue of blockers) {
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
      zones, filesByZone, sizes, takenAt: nowIso, ...rule, ...drawing,
    });
    if (signers) report.signers = signerRows(inputs, { send });
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
      else report.verdict.refusedByDocument = surveySendDocumentRefusal(blockers);
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

/** ใบประเมินที่ **ส่งผลแล้ว** และไม่ถูกยกเลิก ใหม่ก่อน (`--answered`) — คืน `{ requests, capped, error }`
 *  ใบพวกนี้คือใบที่ปุ่ม "ออกเอกสาร" / การดึงผลกลับแล้วส่งใหม่จะถูกถามเรื่องลายเซ็นเมื่อกติกาเปิด */
export async function loadAnsweredSurveyRequests(supabase, { limit = OPEN_SURVEY_LIMIT } = {}) {
  const { data, error } = await supabase
    .from('dept_requests').select('*')
    .eq('kind', 'site_survey').not('answeredAt', 'is', null).is('cancelledAt', null)
    .order('createdAt', { ascending: false }).order('id', { ascending: true })
    .limit(limit);
  if (error) return { requests: [], capped: false, error: message(error) };
  return { requests: data || [], capped: (data || []).length >= limit, error: null };
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

/* ── R0 ก่อน merge งวด S3 (สเปก S3 §4 · `--r0`) — SELECT เท่านั้น · ทุกคำสั่งมีเพดาน ──────────────────────────── */

/** ใบที่ R0 พิมพ์รายละเอียดเมื่อไม่ระบุใบ — สองใบที่เป็นงานจากแปลนจริงแต่ยังเป็นใบลงหน้างาน + ใบของเอกสารจริงใบแรก */
export const R0_DEFAULT_REFS = Object.freeze(['RQ-AS-26090217', 'RQ-AS-26100312', 'SU-26100001-0']);
/** แถวเอกสารที่อ่านต่อรอบ — เพดานของ PostgREST (กติกา check:rowcap) · ถึงเพดาน = บอกให้เห็น ไม่สรุปเงียบ */
export const R0_REPORT_LIMIT = 1000;
// นัดของหนึ่งใบที่อ่านต่อรอบ — เท่าตัวโหลดอินพุต (หนึ่งใบไม่มีนัดถึงเท่านี้)
const R0_VISIT_LIMIT = 200;
// ไม่อ่านภาพนิ่ง/HTML/PDF — "ตรึงแล้วไหม" ดูจาก `frozenAt` (ขั้นกระดาษเติม HTML กับ `frozenAt` ในคำสั่งเดียว)
const R0_REPORT_COLUMNS = 'id, "requestId", "docNo", status, "frozenAt", "issuedAt"';
const R0_VISIT_COLUMNS = 'id, code, status, "scheduledDate", "actualDate", "createdAt"';

const isCutZone = (z) => (z?.status || 'ok') === 'cut';
const zoneLabel = (z, i) => `พื้นที่ ${i + 1} ${String(z?.zoneName ?? '').trim() || '—'}`;

/* รายละเอียดของใบหนึ่งใบ (`RQ-…` · `SU-…` = ใบของเอกสารนั้น · id) — คืน `{ ref, error }` หรือข้อมูลของใบ */
async function r0Sheet(supabase, ref, rows, capped) {
  const key = String(ref ?? '').trim();
  let lookup = key;
  if (/^SU-/i.test(key)) {
    const row = rows.find((r) => r.docNo === key);
    if (!row) return { ref: key, error: `ไม่พบเอกสาร ${key}${capped ? ' (แถวเอกสารถึงเพดาน — อาจมีแต่อ่านไม่ถึง)' : ''}` };
    lookup = row.requestId;
  }
  const found = await findSurveyRequest(supabase, lookup);
  if (found.error || !found.request) return { ref: key, error: found.error || 'ไม่พบใบคำร้อง' };
  const request = found.request;
  const zones = await loadSurveyZones(supabase, request.id);
  const { data, error } = await supabase
    .from('service_visits').select(R0_VISIT_COLUMNS).eq('requestId', request.id)
    .order('createdAt', { ascending: true }).order('id', { ascending: true }).limit(R0_VISIT_LIMIT);
  if (error) return { ref: key, error: `อ่านนัดไม่สำเร็จ — ${message(error)}` };
  return {
    ref: key, error: null, docNo: request.docNo ?? null, id: request.id, status: request.status ?? null,
    answered: !!request.answeredAt, cancelled: !!request.cancelledAt, surveyConfirm: request.surveyConfirm ?? null,
    zones: zones.map((z, i) => ({ label: zoneLabel(z, i), method: zoneMethod(z), cut: isCutZone(z) })),
    visits: (data || []).map((v) => ({ code: v.code ?? null, status: v.status ?? null, date: v.actualDate || v.scheduledDate || null })),
    reports: rows.filter((r) => r.requestId === request.id)
      .map((r) => ({ docNo: r.docNo ?? null, status: r.status ?? null, frozen: !!r.frozenAt })),
  };
}

/**
 * 🔑 **รายการ R0** (สเปก S3 §4) — คืน `{ error, reports, held, heldCapped, sheets }` (ไม่พิมพ์เอง)
 *   · `reports`  `{ count, capped, unfrozen: [{ docNo, requestId, status, issuedAt }] }` — แถวที่มีเลขแต่ยังไม่ตรึงกระดาษ
 *   · `held`     ใบที่ส่งผลแล้ว (ไม่ถูกยกเลิก) มีพื้นที่จากแบบ และยังไม่มีแถวเอกสารของรอบปัจจุบัน (แถว `superseded` ไม่นับ) — `[{ docNo, id, surveyConfirm, plans: [{ zone, files }] }]`
 *                (`files` = ภาพแบบของพื้นที่จากแบบ `{ fileName, mimeType }`) · `heldCapped` = ชุดใบที่ส่งผลแล้วถึงเพดาน
 *   · `sheets`   รายละเอียดของใบที่ระบุ (`r0Sheet`) — ใบที่อ่านไม่ได้มี `error` ของตัวเอง ไม่ล้มทั้งรายการ
 * ⚠️ แถวเอกสารถึงเพดาน = "ยังไม่มีแถวเอกสาร" ของ `held` อาจผิด — บรรทัดสรุปบอกไว้
 */
export async function releaseCheckR0(supabase, { refs = R0_DEFAULT_REFS, limit = R0_REPORT_LIMIT } = {}) {
  const out = { error: null, reports: { count: 0, capped: false, unfrozen: [] }, held: [], heldCapped: false, sheets: [] };
  const { data, error } = await supabase
    .from('service_survey_reports').select(R0_REPORT_COLUMNS)
    .order('issuedAt', { ascending: false }).order('id', { ascending: true }).limit(limit);
  if (error) { out.error = `อ่านแถวเอกสาร (service_survey_reports) ไม่สำเร็จ — ${message(error)}`; return out; }
  const rows = data || [];
  const capped = rows.length >= limit;
  out.reports = {
    count: rows.length, capped,
    unfrozen: rows.filter((r) => r.docNo && !r.frozenAt)
      .map((r) => ({ docNo: r.docNo, requestId: r.requestId ?? null, status: r.status ?? null, issuedAt: r.issuedAt ?? null })),
  };
  /* ใบที่ "มีแถวเอกสาร" = มีแถวของรอบปัจจุบัน — แถว `superseded` (เลขรอบก่อนที่ดึงผลกลับแล้ว) ไม่นับ: ใบที่ส่งใหม่ระหว่างข้อกันของ S2b
     ยังไม่มีเอกสารของรอบนี้ ต้องขึ้นรายการให้เจ้าของอ่านก่อนกดออกเอกสาร (R1 ข้อ 4) */
  const withRow = new Set(rows.filter((r) => r.status !== 'superseded').map((r) => r.requestId));

  const answered = await loadAnsweredSurveyRequests(supabase);
  if (answered.error) { out.error = `อ่านใบที่ส่งผลแล้วไม่สำเร็จ — ${answered.error}`; return out; }
  out.heldCapped = answered.capped;
  try {
    // ทีละใบ — อ่านผลวัดของใบที่ส่งผลแล้วทุกใบ (มีเพดานที่ชุดใบ) แล้วอ่านไฟล์เฉพาะพื้นที่จากแบบของใบที่ติด
    for (const request of answered.requests) {
      if (withRow.has(request.id)) continue;
      const zones = await loadSurveyZones(supabase, request.id);
      if (surveyMethodMix(zones).drawing === 0) continue;
      const plans = [];
      for (const [i, z] of zones.entries()) {
        if (isCutZone(z) || !isDrawingZone(z)) continue;
        const files = await listAttachments('service_survey_zone', z.id, supabase);
        plans.push({
          zone: zoneLabel(z, i),
          files: files.filter((f) => f.docType === SURVEY_DOC_PLAN).map((f) => ({ fileName: f.fileName ?? null, mimeType: f.mimeType ?? null })),
        });
      }
      out.held.push({ docNo: request.docNo ?? null, id: request.id, surveyConfirm: request.surveyConfirm ?? null, plans });
    }
  } catch (e) {
    out.error = `อ่านผลวัด/ไฟล์ของใบที่ส่งผลแล้วไม่สำเร็จ — ${message(e)}`;
    return out;
  }
  for (const ref of refs) {
    try {
      out.sheets.push(await r0Sheet(supabase, ref, rows, capped));
    } catch (e) {
      out.sheets.push({ ref: String(ref), error: `อ่านใบนี้ไม่สำเร็จ — ${message(e)}` });
    }
  }
  return out;
}

const CONFIRM_TEXT = Object.freeze({ needed: 'ต้องยืนยันหน้างาน', not_needed: 'ไม่ต้องยืนยันหน้างาน' });
// ยังไม่ได้ตอบ — คำเดียวทั้งรายการใบที่ติดและรายละเอียดรายใบ
const NO_CONFIRM_TEXT = 'ยังไม่ได้เลือกว่าต้องยืนยันหน้างานไหม';
const METHOD_TEXT = Object.freeze({ onsite: 'ลงหน้างาน', drawing: 'ประเมินจากแบบ' });
/* `YYYY-MM-DD` หรือ timestamptz → "dd/mm/yyyy" (วันไทย) · ว่าง = ขีด */
const dayText = (value) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? String(value) : (value ? businessDate(value) : null);
  return day ? day.split('-').reverse().join('/') : '—';
};

/** ผลของ `releaseCheckR0` → บรรทัดข้อความ (วางใน PR) */
export function r0Lines(r) {
  const out = ['\n══ R0 — ก่อน merge งวด S3 (อ่านอย่างเดียว · สเปก S3 §4) ══'];
  if (r.error) { out.push(`  ❌ ${r.error}`); return out; }
  out.push(`  แถวเอกสาร (service_survey_reports): ${r.reports.count} แถว${r.reports.capped ? ` (ถึงเพดาน ${R0_REPORT_LIMIT} — อาจมีมากกว่านี้ · สองข้อถัดไปอาจไม่ครบ)` : ''}`);
  out.push(`  มีเลขแต่ยังไม่ตรึงกระดาษ: ${r.reports.unfrozen.length || '— (ไม่มี)'}`);
  for (const row of r.reports.unfrozen) out.push(`    ${row.docNo} · ${row.status || '—'} · ออก ${dayText(row.issuedAt)}`);
  out.push(`  ใบที่ส่งผลแล้ว มีพื้นที่ประเมินจากแบบ และยังไม่มีแถวเอกสาร: ${r.held.length || '— (ไม่มี)'}`
    + (r.heldCapped ? ` (ชุดใบที่ส่งผลแล้วถึงเพดาน ${OPEN_SURVEY_LIMIT} ใบ — อาจมีมากกว่านี้)` : ''));
  for (const sheet of r.held) {
    out.push(`    ${sheet.docNo || sheet.id} · ${CONFIRM_TEXT[sheet.surveyConfirm] || NO_CONFIRM_TEXT}`);
    for (const plan of sheet.plans) {
      const files = plan.files.map((f) => `${f.fileName || '?'} (${f.mimeType || '?'})`).join(' · ');
      out.push(`      ${plan.zone}: ${files || '— ไม่มีภาพแบบ'}`);
    }
  }
  out.push(`  ใบที่ขอดู: ${r.sheets.length || '—'}`);
  for (const sheet of r.sheets) {
    if (sheet.error) { out.push(`    ❌ ${sheet.ref}: ${sheet.error}`); continue; }
    const head = `${sheet.docNo || sheet.id}${sheet.ref !== sheet.docNo ? ` (จาก ${sheet.ref})` : ''}`;
    out.push(`    ${head} · ${sheet.answered ? 'ส่งผลแล้ว' : 'ยังไม่ส่งผล'}${sheet.cancelled ? ' · ถูกยกเลิก' : ''} · สถานะ ${sheet.status || '—'}`
      + `${sheet.answered ? ` · ${CONFIRM_TEXT[sheet.surveyConfirm] || NO_CONFIRM_TEXT}` : ''}`);
    out.push(`      พื้นที่: ${sheet.zones.map((z) => `${z.label} — ${METHOD_TEXT[z.method]}${z.cut ? ' (ตัดแล้ว)' : ''}`).join(' · ') || '— (ไม่มี)'}`);
    out.push(`      นัด: ${sheet.visits.map((v) => `${v.code || '—'} ${v.status || '—'} ${dayText(v.date)}`).join(' · ') || '— (ไม่มี)'}`);
    out.push(`      แถวเอกสาร: ${sheet.reports.map((x) => `${x.docNo} ${x.status || '—'} · ${x.frozen ? 'ตรึงแล้ว' : 'ยังไม่ตรึง'}`).join(' · ') || '— (ยังไม่มี)'}`);
  }
  return out;
}

/* ── พิมพ์ ───────────────────────────────────────────────────────────────────── */

const kb = (bytes) => (Number.isFinite(Number(bytes)) && bytes !== null ? `${Math.round(Number(bytes) / 1024)} KB` : '—');

const SIGNATURE_TEXT = Object.freeze({
  ready: 'มีลายเซ็นแล้ว', none: 'ยังไม่มีลายเซ็น', unlinked: 'ชื่อไม่ได้ผูกกับบัญชีผู้ใช้', unknown: 'อ่านลายเซ็นไม่สำเร็จ (รันซ้ำ)',
});
const ACCOUNT_TEXT = Object.freeze({ disabled: 'บัญชีถูกระงับ', missing: 'บัญชีถูกลบ' });
/** "ยังไม่มีลายเซ็น · บัญชีถูกระงับ — เพิ่มลายเซ็นเองไม่ได้" */
const BARRED_TEXT = Object.freeze({
  assessor: 'ไม่ใช่บัญชีฝ่ายบริการ — เอกสารไม่พิมพ์ลายเซ็นของบัญชีนี้ (แก้ผู้รับผิดชอบของนัด)',
  approver: 'ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน — เอกสารไม่พิมพ์ลายเซ็นของบัญชีนี้ (ดึงผลกลับแล้วให้หัวหน้าฝ่ายบริการส่งใหม่)',
});
const signerText = (row) => `${SIGNATURE_TEXT[row.signature] || row.signature}`
  + (ACCOUNT_TEXT[row.account] ? ` · ${ACCOUNT_TEXT[row.account]}${row.signature === 'none' ? ' — เพิ่มลายเซ็นเองไม่ได้' : ''}` : '')
  + (row.barred ? ` · 🔴 ${BARRED_TEXT[row.seat] || 'บัญชีนั่งที่นั่งนี้ไม่ได้'}` : '');

/** รายงานของใบเดียว → บรรทัดข้อความ */
export function reportLines(r) {
  const out = [];
  const head = `${r.request.docNo || r.request.id} · ${r.mode === 'send' ? 'ยังไม่ส่งผล' : 'ส่งผลแล้ว'}${r.request.cancelled ? ' · ถูกยกเลิก' : ''}`;
  out.push(`\n── ${head} ──`);
  if (r.request.title) out.push(`  ${r.request.title}`);
  if (r.error) { out.push(`  ❌ ${r.error}`); return out; }

  out.push(`  ชิ้นที่อ่านไม่สำเร็จ: ${r.unknown.length ? r.unknown.join(' · ') : '— (อ่านครบ)'}`);
  if (r.method) out.push(`  วิธีประเมิน: ลงหน้างาน ${r.method.onsite} · จากแบบ ${r.method.drawing}`);
  if (r.mode === 'send') {
    /* นัดที่บล็อกการส่งมีได้หลายเหตุ (นัดร่าง · นัดที่ยังเปิดบนใบจากแบบล้วน) — เหตุจริงของ `surveySendVisitStep` อยู่บรรทัดถัดไป */
    const step = { close: 'จะถูกปิดพร้อมส่งผล', block: 'บล็อกการส่งผล — เหตุอยู่บรรทัดถัดไป' }[r.visit.action] || 'ไม่แตะ';
    out.push(`  นัดที่ยังเปิด: ${r.visit.code ? `${r.visit.code} → ${step}` : '— (ไม่มี)'}`);
    if (r.visit.action === 'block' && r.visit.error) out.push(`    ✗ ${r.visit.error}`);
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

  if (r.signers) {
    out.push('  ผู้ลงนาม (กติกาลายเซ็นจริง):');
    for (const row of r.signers) {
      const mark = row.barred ? '✗' : row.signature === 'ready' ? '✓' : row.signature === 'unknown' ? '?' : '✗';
      out.push(`    ${mark} ${row.label} ${row.name} — ${signerText(row)}`);
    }
    if (!r.signers.length) out.push('    — (ยังไม่มีที่นั่งที่พิมพ์ชื่อ)');
    if (r.mode === 'send') out.push('    · ผู้ตรวจสอบและอนุมัติ = หัวหน้าที่จะกดส่งผล (ยังไม่รู้ว่าใคร — ต้องมีลายเซ็นของตัวเองก่อนกด)');
  }

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
  // วันนี้ (สวิตช์ปิด) ส่งผลได้ไหม — ติดด่านเดิม หรือนัดที่ยังเปิดบล็อกการส่ง (นัดร่าง · นัดบนใบจากแบบล้วน) = ส่งไม่ได้อยู่แล้ว
  const blockedToday = (r) => r.verdict.refusedByGates || r.visit.action === 'block';
  const ready = send.filter((r) => !blockedToday(r));
  const count = (fn) => ready.filter(fn).length;
  return [
    `\n══ สรุป ${reports.length} ใบ${capped ? ` (ถึงเพดาน ${limit} ใบ — อาจมีมากกว่านี้)` : ''} ══`,
    `  อ่าน/ตรวจไม่สำเร็จ: ${reports.filter((r) => r.error).length}`,
    `  ยังไม่ส่งผล: ${send.length} ใบ`,
    `    วันนี้ก็ส่งไม่ได้ (ติดด่านเดิม · นัดที่ยังเปิดบล็อกการส่ง): ${send.length - ready.length}`,
    `    วันนี้ส่งได้: ${ready.length}`,
    `      🔴 จะถูกตีกลับเพิ่มเมื่อเปิดสวิตช์ (S5): ${count((r) => r.verdict.newlyRefused)}`,
    `      อ่านไม่ครบ (route ข้ามการตีกลับ): ${count((r) => r.verdict.skipped)}`,
    `      มีคำเตือนให้รับทราบ: ${count((r) => r.warnings.length > 0)}`,
    `      มีเหตุชนิด system (ส่งได้ เอกสารยังไม่ออก): ${count((r) => r.issues.system.length > 0)}`,
    `  ส่งผลแล้ว: ${issue.length} ใบ · ปุ่ม "ออกเอกสาร" จะติด: ${issue.filter((r) => r.verdict.refusedByDocument).length}`,
    ...signerSummaryLines(reports),
  ];
}

/** สรุปของ `--signers`: ใครต้องเพิ่มลายเซ็น (คนละบรรทัด พร้อมจำนวนใบ) + ใบที่ผู้ประเมินเพิ่มลายเซ็นเองไม่ได้แล้ว · ไม่ได้ขอ = `[]` */
function signerSummaryLines(reports) {
  const checked = reports.filter((r) => !r.error && Array.isArray(r.signers));
  if (!checked.length) return [];
  const people = new Map(); // คน (id หรือชื่อเมื่อไม่ผูกบัญชี) → { name, seats, sheets, gone }
  for (const r of checked) {
    for (const row of r.signers) {
      if (row.signature !== 'none' && row.signature !== 'unlinked') continue;
      const key = row.userId || `ชื่อ:${row.name}`;
      const hit = people.get(key) || { name: row.name, seats: new Set(), sheets: 0, gone: false, unlinked: false };
      hit.seats.add(row.label);
      hit.sheets += 1;
      hit.gone = hit.gone || accountGone(row);
      hit.unlinked = hit.unlinked || row.signature === 'unlinked';
      people.set(key, hit);
    }
  }
  const stuck = checked.filter(signerStuck);
  const barred = checked.filter(signerBarred);
  const unread = checked.filter((r) => r.signers.some((row) => row.signature === 'unknown')).length;
  return [
    `  ── ลายเซ็นของผู้ลงนาม (กติกาลายเซ็นจริง · ตรวจ ${checked.length} ใบ) ──`,
    `  ผู้ที่ต้องเพิ่มลายเซ็นที่ "บัญชีของฉัน": ${people.size || '— (ผู้ลงนามของทุกใบมีลายเซ็นแล้ว)'}${people.size ? ' คน' : ''}`,
    ...[...people.values()].sort((a, b) => b.sheets - a.sheets || a.name.localeCompare(b.name, 'th')).map((p) => (
      `    ${p.name} (${[...p.seats].join(' · ')}) — ${p.sheets} ใบ${p.unlinked ? ' · ชื่อไม่ได้ผูกกับบัญชี' : ''}${p.gone ? ' · 🔴 บัญชีถูกปิดหรือถูกลบ' : ''}`
    )),
    `  ${stuck.length ? '🔴' : '✅'} ใบที่ผู้ประเมินยังไม่มีลายเซ็นและบัญชีถูกปิดหรือถูกลบ: ${stuck.length}`
      + ` (ต้องเป็น 0 ก่อนเปิดสวิตช์ลายเซ็นจริง — ใบแบบนี้ส่งผลใหม่ไม่ได้อีกหลังดึงผลกลับ)`,
    ...stuck.map((r) => `    ${r.request.docNo || r.request.id} · ${r.mode === 'send' ? 'ยังไม่ส่งผล' : 'ส่งผลแล้ว'}`),
    `  ${barred.length ? '🔴' : '✅'} ใบที่บัญชีของผู้ลงนามนั่งที่นั่งนั้นไม่ได้ (ผู้ประเมินนอกฝ่ายบริการ · ผู้ส่งผลที่ไม่ใช่หัวหน้า): ${barred.length}`
      + ' (เอกสารของใบแบบนี้ออกไม่ได้เมื่อกติกาเปิด — ต้องแก้ที่ตัวใบ ไม่ใช่เพิ่มลายเซ็น)',
    ...barred.map((r) => `    ${r.request.docNo || r.request.id} · ${r.mode === 'send' ? 'ยังไม่ส่งผล' : 'ส่งผลแล้ว'} · `
      + r.signers.filter((row) => row.barred).map((row) => `${row.label} ${row.name}`).join(' · ')),
    ...(unread ? [`  ? อ่านลายเซ็นไม่สำเร็จ ${unread} ใบ — รันซ้ำก่อนสรุป`] : []),
    '  ⚠️ ผู้ส่งผลของใบที่ยังไม่ส่งไม่อยู่ในรายการนี้ (คือหัวหน้าที่จะกดส่ง) · ไฟล์ลายเซ็นว่าง/จาง/หายไม่ถูกตรวจที่นี่',
  ];
}

const USAGE = 'ใช้: node --import ./scripts/test-loader.mjs scripts/check-survey-report-inputs.mjs <id | RQ-…> [...] | --open | --answered '
  + '[--signers] [--drawing-method on|off] [--json] · หรือ --r0 [RQ-… | SU-… | id …] [--json]';

/**
 * ทั้งรอบ — เทสต์เรียกตรงด้วย client ปลอม · รันจริงผ่านท้ายไฟล์
 * @returns exit code: 0 = ตรวจครบ (ไม่ว่าผลของใบจะเป็นอะไร — สคริปต์นี้รายงาน ไม่ใช่ด่าน) · 1 = หาใบไม่เจอ/อ่านไม่ได้ · 2 = ใช้ผิด
 */
export async function main({ argv = [], supabase, log = console.log, now = new Date() } = {}) {
  // `--drawing-method on|off` กินค่าถัดไป (ค่านั้นไม่ใช่ชื่อใบ) · ค่าอื่น/ไม่มีค่า = ใช้ผิด
  const methodAt = argv.indexOf('--drawing-method');
  const methodValue = methodAt >= 0 ? argv[methodAt + 1] : 'off';
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const refs = argv.filter((a, i) => !a.startsWith('--') && !(methodAt >= 0 && i === methodAt + 1));
  const json = flags.has('--json');
  const signers = flags.has('--signers');
  const r0 = flags.has('--r0');
  if ((!refs.length && !flags.has('--open') && !flags.has('--answered') && !r0) || flags.has('--help')
    || (methodValue !== 'on' && methodValue !== 'off')) {
    log(USAGE);
    return flags.has('--help') ? 0 : 2;
  }
  const drawingMethodEnabled = methodValue === 'on';
  const client = readOnlyClient(supabase);
  if (r0) {
    const result = await releaseCheckR0(client, { refs: refs.length ? refs : R0_DEFAULT_REFS });
    if (json) log(JSON.stringify(result, null, 2));
    else r0Lines(result).forEach((line) => log(line));
    return result.error ? 1 : 0;
  }
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
  if (flags.has('--answered')) {
    const answered = await loadAnsweredSurveyRequests(client);
    if (answered.error) { log(`❌ อ่านใบประเมินที่ส่งผลแล้วไม่สำเร็จ: ${answered.error}`); return 1; }
    capped = capped || answered.capped;
    const have = new Set(requests.map((r) => r.id));
    requests.push(...answered.requests.filter((r) => !have.has(r.id)));
  }

  const reports = [];
  // ทีละใบ — ใบหนึ่งยิงสิบกว่าคำสั่งขนานกันอยู่แล้ว ไม่ต้องถล่มฐานของจริงพร้อมกันทุกใบ
  for (const request of requests) reports.push(await checkSurveyReportInputs(client, { request, now, signers, drawingMethodEnabled }));

  if (json) {
    log(JSON.stringify({ reports, capped }, null, 2));
    return 0;
  }
  for (const report of reports) reportLines(report).forEach((line) => log(line));
  if (reports.length > 1 || flags.has('--open') || flags.has('--answered')) summaryLines(reports, { capped }).forEach((line) => log(line));
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
