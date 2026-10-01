// ── ขั้นกระดาษของรายงานการประเมินพื้นที่ (FM-TS-01) — วัดจริง · ตรึง HTML · เก็บ PDF (PR-2 §4 · §11 · §12) ──────
//
// ⭐ **สองทางเข้า ตัวพิมพ์ตัวเดียว**
//   `ensureSurveyReportPaper`   แถวที่ออกเลขแล้ว → วัดทั้งสองฉบับใน chromium → ตรึง HTML → เก็บ `pdf/<reportId>/<ฉบับ>.pdf`
//                               เรียกจาก GET แรกของเอกสาร และจาก POST "ออกเอกสาร" · เดินต่อจากแถวได้ทุกขั้น (§11)
//   `measureSurveyReportPaper`  ขั้นวัดของ I5b — วัดกระดาษลอง (ยังไม่มีเลข) **ก่อน** เรียก RPC ออกเลข · ไม่เขียนอะไรเลย
//   ทั้งสองแปลง token รูปจากถัง → พิมพ์ → `surveyReportPaperIssues` ด้วยฟังก์ชันเดียวกัน (`printVersions`)
//   ⇒ ไม่มีวันที่ "ผ่านตอนวัดก่อนออกเลข แต่ติดตอนตรึง" เพราะสองทางตรวจคนละกติกา
//
// 🔴 **ตรึงหลังวัดเท่านั้น** (มติ 2) — แผ่นเป็น `overflow: hidden` ของล้นถูกตัดเงียบจนกว่าจะวัด และคอลัมน์ HTML เขียนได้ครั้งเดียว
//   (mig 0401 ②) ⇒ ฉบับใดฉบับหนึ่งติดข้อกัน = **ไม่ตรึง ไม่เก็บอะไรทั้งสิ้น** · สองฉบับตรึงพร้อมกันหรือไม่ตรึงเลย (Rev หนึ่ง = เอกสารเดียว)
//
// 🔴 **ยามกันรั่วรอบสอง** — `surveyReportCustomerHtmlIssues` ตรวจ HTML ฉบับลูกค้า **ตัวที่กำลังจะตรึง** อีกครั้งก่อนเขียน:
//   deploy ที่ตรึงอาจใหม่กว่าตัวที่ออกเลข (ตัวเรนเดอร์เปลี่ยนได้ระหว่างนั้น)
//
// 🔴 **ไฟล์ผูกกับฉบับด้วยคีย์เดียวตลอดเส้น** — HTML · PDF · ที่อยู่ไฟล์ · คอลัมน์ เดินด้วยกันในก้อนของฉบับนั้น
//   (`papers[version]`) และชื่อคอลัมน์มาจากแผนที่ตายตัว ไม่ประกอบจากสตริง ⇒ ไม่มีทางที่ PDF ฉบับภายในไปลง
//   `customer.pdf` (เทสต์ "write-side binding" ล็อกไว้)
//
// 🔴 **เขียนของถาวรได้บน production เท่านั้น** (§0 · `surveyReportStoreAllowed`) — ที่อื่นตอบ `not_production`
//   ก่อนเขียนอะไร · แถวที่กระดาษครบแล้วตอบได้ตามปกติ (อ่านอย่างเดียว)
//
// 🔴 **chromium โหลดด้วย `await import()` ข้างในเท่านั้น** (มติ 24) — `htmlPdf.js` ลาก puppeteer-core + @sparticuz/chromium
//   มาที่หัวไฟล์ · ไฟล์นี้ถูก import จาก route เอกสารเท่านั้น: **ขั้นออกเลข (`surveyReportIssue`) ห้าม import ไฟล์นี้**
//   (เส้นส่งผลจะลาก chromium ตาม) — route เป็นคนส่ง `measureSurveyReportPaper` เข้าไปทางพารามิเตอร์ `measure`
//
// 🔴 **ไม่มีการรอที่ไม่มีเพดาน** — ฟังก์ชันถูกตัดที่ `maxDuration` โดยไม่มีคำตอบ (คนเห็น 504 ของแพลตฟอร์ม ทั้งที่เลขออกไปแล้ว)
//   ทุกการเรียกถัง · ฐาน · chromium วิ่งผ่าน `ctx.call` — ไม่เกินเพดานต่อครั้ง **และ** ไม่เลยงบของรอบ (`deadline`)
//   งบถูกเช็กซ้ำก่อนพิมพ์แต่ละฉบับและก่อนเก็บ PDF แต่ละฉบับ · หมดงบกลางทาง = `timeout` พร้อมของที่เก็บไปแล้ว
//   (ตรึงแล้ว PDF ยังไม่ครบ = รอบถัดไปพิมพ์จากกระดาษที่ตรึงแล้วเก็บต่อ · §11) · audit กับการปิดเบราว์เซอร์มีเพดานสั้นของตัวเอง
//
// ⚠️ **ไม่โยน** — ทุกทางล้มกลับมาเป็น `{ code, reasons }` · supabase ไม่ throw ⇒ ทุกคำสั่งอ่าน `{ error }` เอง
// ⚠️ PDF ที่เก็บแล้ว **ไม่พิมพ์ซ้ำ** — ผลของ chromium ไม่นิ่งระดับไบต์ · อัปด้วย `upsert: false` ไฟล์แรกชนะ
//   "มีอยู่แล้ว" = สำเร็จ (รอบก่อนอัปขึ้นแต่เขียนที่อยู่ไม่ทัน · อีกคำขอวิ่งคู่กัน)
import 'server-only';
import { recordAudit } from '@/lib/audit';
import { pdfInspect } from '@/lib/documents/pdfInspect';
import {
  SURVEY_REPORT_RENDERER_VERSION, renderSurveyReportHTML, resolveImageTokens, surveyReportImageShas,
} from './surveyReportDocument';
import { surveyReportImagePath } from './surveyReportImages';
import { paginateSurveyReport, surveyReportOverflowErrors } from './surveyReportLayout';
import { SURVEY_REPORT_BUCKET, SURVEY_REPORT_NOT_PRODUCTION, surveyReportStoreAllowed } from './surveyReportRows';
import { surveyReportCustomerHtmlIssues, surveyReportPaperIssues } from './surveyReportState';
import { surveyReportView } from './surveyReportView';

/** สองฉบับของเอกสาร — ลำดับนี้คือลำดับที่พิมพ์และเก็บ */
export const SURVEY_REPORT_VERSIONS = Object.freeze(['customer', 'internal']);

/** เปิด chromium ต่อเมื่องบเวลาเหลืออย่างน้อยเท่านี้ (§4 P4) — เปิดเบราว์เซอร์ + พิมพ์สองฉบับ + อัป ต้องจบก่อนฟังก์ชันถูกตัด */
export const SURVEY_REPORT_PAPER_MIN_MS = 40_000;

/** เริ่มพิมพ์ฉบับ **ถัดไป** (เบราว์เซอร์เปิดอยู่แล้ว) ต่อเมื่องบเวลาเหลืออย่างน้อยเท่านี้ */
export const SURVEY_REPORT_PRINT_MIN_MS = 15_000;

/** เริ่มเก็บ PDF หนึ่งฉบับ (อัป + เขียนที่อยู่ไฟล์) ต่อเมื่องบเวลาเหลืออย่างน้อยเท่านี้ */
export const SURVEY_REPORT_STORE_MIN_MS = 5_000;

/** เพดานของการเรียกถัง/ฐานหนึ่งครั้ง — เท่ากับเพดานต่อไฟล์ของขั้นรูป (`SURVEY_IMAGE_FILE_TIMEOUT_MS`) */
export const SURVEY_REPORT_CALL_TIMEOUT_MS = 30_000;

/** เพดานของ audit ท้ายขั้น (P7) — ไม่ผูกกับงบของรอบ: ของที่เขียนไปแล้วต้องได้ลองลง audit แม้งบหมดพอดี */
export const SURVEY_REPORT_AUDIT_TIMEOUT_MS = 10_000;

/** เพดานของการปิดเบราว์เซอร์ — chromium ที่เปิดไม่จบหรือปิดไม่ตอบ ต้องไม่ลากคำขอค้างตาม */
export const SURVEY_REPORT_SESSION_CLOSE_MS = 5_000;

/** ที่อยู่ของ PDF ใน bucket — จาก id ของแถว ไม่ใช่เลขที่เอกสาร (เลขพิมพ์อยู่บนฉบับลูกค้า เดาได้ · มติ 16) */
export const surveyReportPdfPath = (reportId, version) => `pdf/${reportId}/${version === 'internal' ? 'internal' : 'customer'}.pdf`;

/* 🔴 แผนที่ตายตัวของ "ฉบับ → คอลัมน์" — ไม่มีที่ไหนในไฟล์นี้ประกอบชื่อคอลัมน์จากสตริงของผู้เรียก */
const HTML_COLUMN = Object.freeze({ customer: 'customerHtml', internal: 'internalHtml' });
const PATH_COLUMN = Object.freeze({ customer: 'customerPdfPath', internal: 'internalPdfPath' });
const PATH_PATCH = Object.freeze({
  customer: (path, updatedAt) => ({ customerPdfPath: path, updatedAt }),
  internal: (path, updatedAt) => ({ internalPdfPath: path, updatedAt }),
});
const LABEL = Object.freeze({ customer: 'ฉบับลูกค้า', internal: 'ฉบับภายใน' });

/** ข้อความไทยของเหตุที่กระดาษไม่เสร็จ — route เอกสารส่งต่อให้คนอ่านตรง ๆ */
export const SURVEY_REPORT_PAPER_REASONS = Object.freeze({
  read_failed: 'อ่านเอกสารประเมินไม่สำเร็จ — ลองใหม่อีกครั้ง',
  not_found: 'ไม่พบเอกสารประเมินฉบับนี้',
  paper_failed: 'จัดทำกระดาษของเอกสารไม่สำเร็จ — แจ้งผู้ดูแลระบบ',
  image_missing: 'รูปของเอกสารหายจากที่เก็บ — แจ้งผู้ดูแลระบบ',
  storage_failed: 'อ่านรูปของเอกสารจากที่เก็บไม่สำเร็จ — ลองใหม่อีกครั้ง',
  chromium_failed: 'ตัวพิมพ์ PDF ของระบบทำงานไม่สำเร็จ — ลองใหม่อีกครั้ง',
  timeout: 'เวลาไม่พอจัดทำกระดาษของเอกสาร — ลองใหม่อีกครั้ง',
  freeze_failed: 'ตรึงกระดาษของเอกสารไม่สำเร็จ — ลองใหม่อีกครั้ง',
  store_failed: 'เก็บไฟล์ PDF ของเอกสารไม่สำเร็จ — ลองใหม่อีกครั้ง',
});
const R = SURVEY_REPORT_PAPER_REASONS;

const elapsed = (from) => Math.round(performance.now() - from);
const errorText = (err) => String(err?.message || err || '').split('\n')[0].slice(0, 300);
const defaultLog = (line) => console.info('[survey-report] paper', JSON.stringify(line));

/** ฉบับที่ผู้เรียกต้องการ — `'both'` = สองฉบับ · `'internal'` ตรงตัวเท่านั้นจึงได้ฉบับภายใน · ค่าอื่นทุกค่า = ฉบับลูกค้า
 *  (กติกาเดียวกับ `surveyDocVersion`: พิมพ์ผิด/ไม่ส่ง ต้องตกไปทางที่แคบกว่า) */
function wantedVersions(want) {
  if (want === 'both') return [...SURVEY_REPORT_VERSIONS];
  return want === 'internal' ? ['internal'] : ['customer'];
}

/** `deadline` = จุดเวลา (epoch ms หรือ Date) · เลขต่ำกว่า 1e11 = "อีกกี่ ms จากนี้" — กติกาเดียวกับ `prepareSurveyReportImages` */
function deadlineAt(deadline, now) {
  if (deadline === null || deadline === undefined) return null;
  if (deadline instanceof Date) return deadline.getTime();
  const n = Number(deadline);
  if (!Number.isFinite(n)) return null;
  return n < 1e11 ? now() + n : n;
}

/* ══ เพดานเวลา ══════════════════════════════════════════════════════════ */

/** หมดเวลา — `expired` = งบของทั้งรอบหมด (ขั้นตอบ `timeout`) · ไม่งั้นคือการเรียกครั้งเดียวค้างเกินเพดาน
 *  (เหตุของขั้นนั้นเอง เช่น `storage_failed` · `store_failed` — ลองใหม่ได้) */
class PaperCut extends Error {
  constructor(expired, ms = null) {
    super(expired ? 'หมดงบเวลาของรอบ' : `ไม่ตอบภายใน ${ms} ms`);
    this.name = 'PaperCut';
    this.expired = expired === true;
  }
}

/** แข่งกับ signal — promise ที่ค้างไม่มีวันจบ (ถังไม่ตอบ · chromium ค้าง) ต้องไม่ลากทั้งรอบค้างตาม · กติกาเดียวกับขั้นรูป */
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * 🔑 **เรียกของนอกหนึ่งครั้งใต้เพดานเวลา** — ถัง · ฐาน · chromium ที่ไม่ตอบต้องจบที่เพดาน ไม่ใช่ที่ `maxDuration` ของฟังก์ชัน
 * ใช้ทั้งในขั้นกระดาษ (ผ่าน `ctx.call` ซึ่งเอางบของรอบมาครอบอีกชั้น) และใน route เอกสารตอนอ่านไฟล์มาเสิร์ฟ
 * @param run        `(signal) => promise` — ส่ง `signal` ต่อให้ตัวที่รับได้ (`storage.download(path, {}, { signal })`) สายจะถูกตัดจริง
 * @param timeoutMs  เพดาน ms (ค่าตั้งต้น 30 วิ) · `Infinity` = ไม่มีเพดาน
 * @returns ผลของ `run` · ค้างเกินเพดาน = **โยน** (ผู้เรียกจับเอง — ทุกจุดที่ใช้อยู่ใน try/catch อยู่แล้ว)
 */
export function surveyReportBounded(run, timeoutMs = SURVEY_REPORT_CALL_TIMEOUT_MS) {
  if (timeoutMs === Infinity) return Promise.resolve().then(() => run(undefined));
  const wanted = Number(timeoutMs);
  const ms = Number.isFinite(wanted) && wanted >= 0 ? Math.ceil(wanted) : SURVEY_REPORT_CALL_TIMEOUT_MS;
  const signal = AbortSignal.timeout(ms);
  return abortable(Promise.resolve().then(() => run(signal)), signal)
    .catch((err) => { throw signal.aborted ? new PaperCut(false, ms) : err; });
}

/* ══ ตัวพิมพ์: เบราว์เซอร์เดียวต่อคำขอ ═══════════════════════════════════ */

const importRenderer = () => import('@/lib/documents/htmlPdf');

/**
 * ⭐ **เบราว์เซอร์เดียวที่ขั้นวัด (I5b) กับขั้นกระดาษใช้ร่วมกัน** — POST "ออกเอกสาร" สร้างหนึ่งตัว ส่งให้ทั้งสองขั้น แล้วปิดเองใน `finally`
 * เปิด chromium **ตอนพิมพ์ครั้งแรก** เท่านั้น (สร้างไว้เฉย ๆ ไม่โหลดอะไร) · เปิดไม่ขึ้น = ทุกการพิมพ์ของรอบนี้ล้มด้วยเหตุเดิม
 * @param opts.loadRenderer จุดเสียบของเทสต์ — คืน `{ launchBrowser, renderHtmlPdf, HTML_PDF_GENERATOR_VERSION }`
 *                          (ไม่ส่ง = `await import('@/lib/documents/htmlPdf')`)
 * @param opts.closeTimeoutMs เพดานของ `close()` (จุดเสียบของเทสต์)
 * @returns `{ print(html) → { buffer, fit, brokenImages }, generator() → string | null, close() }`
 */
export function surveyReportPrintSession({ loadRenderer = importRenderer, closeTimeoutMs = SURVEY_REPORT_SESSION_CLOSE_MS } = {}) {
  let lib = null;
  let browser = null;
  let opening = null;
  const open = async () => {
    const mod = await loadRenderer();
    if (typeof mod?.launchBrowser !== 'function' || typeof mod?.renderHtmlPdf !== 'function') {
      throw new Error('ตัวพิมพ์ PDF โหลดมาไม่ครบ');
    }
    lib = mod;
    browser = await mod.launchBrowser();
    return browser;
  };
  return {
    async print(html) {
      if (!opening) opening = open();
      await opening;
      return lib.renderHtmlPdf(html, { measure: true, browser });
    },
    /** รุ่นของตัวพิมพ์ (ลงแถว audit) — `null` จนกว่าจะพิมพ์ครั้งแรก */
    generator: () => lib?.HTML_PDF_GENERATOR_VERSION || null,
    async close() {
      const pending = opening;
      opening = null;
      const shut = async () => {
        let chrome = null;
        try { chrome = await pending; } catch { /* เปิดไม่ขึ้น = ไม่มีอะไรให้ปิด */ }
        if (browser === chrome) browser = null;
        if (chrome && typeof chrome.close === 'function') {
          try { await chrome.close(); } catch { /* ปิดไม่ได้ก็ปล่อย — ฟังก์ชันกำลังจะจบอยู่แล้ว */ }
        }
      };
      /* เบราว์เซอร์ที่ยังเปิดไม่จบ (การพิมพ์ถูกตัดเพราะหมดงบ) หรือปิดไม่ตอบ: ไม่รอ — `shut` เดินต่อข้างหลังแล้วปิดเองเมื่อเปิดเสร็จ
         รอต่อ = คำขอที่หมดงบไปแล้วค้างเลย `maxDuration` */
      try { await surveyReportBounded(shut, closeTimeoutMs); } catch { /* ปิดไม่ทัน — ปล่อย */ }
    },
  };
}

/* ══ รูปจากถัง → data URI ════════════════════════════════════════════════ */

const IMAGE_BATCH = 6;

// "ไม่มีไฟล์นี้" ของ Supabase Storage — 404 หรือ 400 ที่ข้อความบอกว่าไม่พบ (รุ่นของ storage-js ตอบต่างกัน)
const objectMissing = (error) => Number(error?.status) === 404 || String(error?.statusCode) === '404'
  || /not.?found|does not exist|no such/i.test(`${error?.message || ''} ${error?.error || ''}`);

async function bytesOf(data) {
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer());
  return Buffer.alloc(0);
}

/**
 * ดึง `img/<sha>.jpg` ของ sha ที่ยังไม่มีใน `cache` → data URI (data URI อยู่แค่ใน HTML ที่ส่งให้ chromium · HTML ที่ตรึงพก token)
 * ทุกไฟล์วิ่งใต้ `ctx.call` — ถังที่ไม่ตอบจบที่เพดานต่อครั้ง (`failed`) หรือที่งบของรอบ (`expired`) ไม่ค้างทั้งขั้น
 * @returns `{ missing: sha[], failed: sha[], expired }` — `missing` = ไฟล์ไม่อยู่ในถัง (ถาวร) · `failed` = อ่านไม่สำเร็จ (ลองใหม่ได้)
 *   · `expired` = มีไฟล์ที่อ่านไม่จบเพราะงบของรอบหมด (นับอยู่ใน `failed` ด้วย)
 */
async function loadImages(supabase, shas, ctx) {
  const { bucket, images: cache } = ctx;
  const todo = shas.filter((sha) => !cache.has(sha));
  const missing = [];
  const failed = [];
  let expired = false;
  const one = async (sha) => {
    const path = surveyReportImagePath(sha);
    try {
      // `signal` ไปถึง fetch ของถัง (storage-js รับที่อาร์กิวเมนต์ตัวที่สาม) — หมดเวลาแล้วสายถูกตัดจริง
      // (`download` จบเมื่ออ่านเนื้อไฟล์ครบแล้ว ⇒ `bytesOf` ข้างล่างไม่มีการรอเครือข่าย)
      const { data, error } = await ctx.call((signal) => supabase.storage.from(bucket).download(path, {}, { signal }));
      if (error || !data) {
        const gone = !error || objectMissing(error);
        console.error(`[survey-report] อ่านรูป ${path} ไม่สำเร็จ`, errorText(error) || '(ไม่มีข้อมูล)');
        (gone ? missing : failed).push(sha);
        return;
      }
      const bytes = await bytesOf(data);
      if (!bytes.length) { missing.push(sha); return; }
      cache.set(sha, `data:image/jpeg;base64,${bytes.toString('base64')}`);
    } catch (err) {
      console.error(`[survey-report] อ่านรูป ${path} ไม่สำเร็จ`, errorText(err));
      if (err instanceof PaperCut && err.expired) expired = true;
      failed.push(sha);
    }
  };
  for (let i = 0; i < todo.length; i += IMAGE_BATCH) await Promise.all(todo.slice(i, i + IMAGE_BATCH).map(one));
  return { missing, failed, expired };
}

/* ══ พิมพ์ + วัด — ตัวเดียวของทั้งขั้นวัดและขั้นกระดาษ ════════════════════ */

const stageFailure = (code, reasons) => ({ failure: { code, reasons } });

/**
 * P3 + P4 — แปลง token รูปจากถัง → พิมพ์ทีละฉบับในเบราว์เซอร์เดียว → `surveyReportPaperIssues`
 *
 * @param htmlByVersion `{ [version]: html }` HTML ที่ยังเป็น token (`su-img:<sha>`)
 * @param versions      ฉบับที่จะพิมพ์ ตามลำดับ
 * @returns `{ failure: { code, reasons } }` เมื่อทั้งขั้นไปต่อไม่ได้ (รูปหาย · อ่านถังไม่ได้ · เวลาไม่พอ) — ยังไม่ได้พิมพ์อะไร
 *        | `{ papers: { [version]: { ok: true, html, buffer, pdf } | { ok: false, code, reasons, issues } } }`
 *   · `html` = ตัวที่รับเข้ามา (token) — เดินคู่กับ `buffer` ที่พิมพ์จากมันเสมอ
 *   · ฉบับหนึ่งล้ม (ข้อกัน · chromium โยน) ไม่หยุดอีกฉบับ — ผู้เรียกตัดสินเองว่าทั้งรอบยังไปต่อได้ไหม
 *   · 🔴 งบเวลาถูกเช็กซ้ำ **ก่อนพิมพ์ทุกฉบับ** และการพิมพ์แต่ละครั้งถูกตัดที่งบของรอบ — ฉบับที่ไม่ได้พิมพ์/พิมพ์ไม่จบเพราะงบหมด
 *     ได้ `code: 'timeout'` (ฉบับที่พิมพ์จบไปแล้วยังอยู่ใน `papers`)
 */
async function printVersions(supabase, htmlByVersion, versions, ctx) {
  const shas = [...new Set(versions.flatMap((version) => surveyReportImageShas(htmlByVersion[version])))];
  const mark = performance.now();
  const { missing, failed, expired } = await loadImages(supabase, shas, ctx);
  ctx.say({ step: 'images', count: shas.length, ms: elapsed(mark), missing: missing.length, failed: failed.length });
  if (missing.length) return stageFailure('image_missing', [R.image_missing]);
  if (expired) return stageFailure('timeout', [R.timeout]);
  if (failed.length) return stageFailure('storage_failed', [R.storage_failed]);

  if (ctx.left() < SURVEY_REPORT_PAPER_MIN_MS) return stageFailure('timeout', [R.timeout]);

  const papers = {};
  const outOfTime = (version) => ({ ok: false, code: 'timeout', reasons: [`${LABEL[version]}: ${R.timeout}`], issues: [] });
  for (const [index, version] of versions.entries()) {
    const html = htmlByVersion[version];
    const line = { step: 'print', version, ok: false };
    const started = performance.now();
    // ฉบับแรกผ่านด่าน 40 วิข้างบนแล้ว · ฉบับถัดไปเช็กใหม่ — ฉบับก่อนหน้าอาจกินงบไปเกือบหมด (setContent รอได้ถึง 30 วิ)
    if (index > 0 && ctx.left() < SURVEY_REPORT_PRINT_MIN_MS) {
      papers[version] = outOfTime(version);
      ctx.say({ ...line, ms: 0, reason: 'timeout' });
      continue;
    }
    try {
      // data URI อยู่แค่ในตัวที่ส่งให้ chromium — `html` (token) คือตัวที่ตรึง
      const resolved = resolveImageTokens(html, (sha) => ctx.images.get(sha) || null);
      // เพดานของการพิมพ์ = งบที่เหลือของรอบ (puppeteer มีเพดานของตัวเองต่อคำสั่ง แต่รวมกันยาวกว่างบได้)
      const out = await ctx.call(() => ctx.session.print(resolved), Infinity);
      const buffer = !out?.buffer || Buffer.isBuffer(out.buffer) ? out?.buffer || null : Buffer.from(out.buffer);
      const found = surveyReportPaperIssues({ html: resolved, fit: out?.fit, brokenImages: out?.brokenImages, buffer });
      const blocks = found.filter((issue) => issue.kind === 'block');
      for (const issue of found) {
        if (issue.kind === 'log') console.warn(`[survey-report] กระดาษ${LABEL[version]} — ${issue.text}`);
      }
      line.ms = elapsed(started);
      line.bytes = buffer?.length || 0;
      if (blocks.length) {
        papers[version] = {
          ok: false,
          code: 'paper_failed',
          reasons: blocks.map((issue) => `${LABEL[version]}: ${issue.text}`),
          issues: blocks.map((issue) => ({ version, kind: issue.kind, text: issue.text, page: issue.page })),
        };
        line.blocks = blocks.length;
      } else {
        papers[version] = { ok: true, html, buffer, pdf: pdfInspect(buffer) };
        line.ok = true;
        line.pages = papers[version].pdf.pages;
      }
    } catch (err) {
      console.error(`[survey-report] พิมพ์กระดาษ${LABEL[version]}ไม่สำเร็จ`, errorText(err));
      papers[version] = err instanceof PaperCut && err.expired
        ? outOfTime(version)
        : { ok: false, code: 'chromium_failed', reasons: [R.chromium_failed], issues: [] };
      line.ms = elapsed(started);
      line.reason = errorText(err);
    }
    ctx.say(line);
  }
  return { papers };
}

/**
 * ของที่เดินไปด้วยกันทั้งรอบ — เบราว์เซอร์ · ถัง · รูปที่ดึงแล้ว · **งบเวลา**
 *   · `left()`            งบที่เหลือ (ms) · ไม่มี `deadline` = `Infinity`
 *   · `call(run, capMs)`  เรียกของนอกหนึ่งครั้ง — ไม่เกิน `capMs` (ค่าตั้งต้น = เพดานต่อครั้ง) และไม่เลยงบของรอบ
 *                         โยน `PaperCut`: `expired` = งบของรอบหมด · ไม่งั้นคือครั้งนี้ค้างเกินเพดาน · ที่ `run` โยนเองโยนต่อตามเดิม
 *   · `ask(run)`          `call` ของคำสั่งอ่าน/เขียนแถว — หมดเวลา **ไม่โยน** คืน `{ data: null, error, expired }` ให้อ่านแบบ `{ error }` เดิม
 */
function paperContext({ session, bucket, deadline, now, log, callTimeoutMs = SURVEY_REPORT_CALL_TIMEOUT_MS }) {
  const endAt = deadlineAt(deadline, now);
  const left = () => (endAt === null ? Infinity : endAt - now());
  const call = async (run, capMs = callTimeoutMs) => {
    const remaining = left();
    if (remaining <= 0) throw new PaperCut(true);
    try {
      return await surveyReportBounded(run, Math.min(capMs, remaining));
    } catch (err) {
      // เพดานที่ใช้คืองบที่เหลือ (สั้นกว่าเพดานต่อครั้ง) = งบของรอบหมด ไม่ใช่การเรียกครั้งนี้ค้าง
      if (err instanceof PaperCut && remaining <= capMs) throw new PaperCut(true);
      throw err;
    }
  };
  const ask = async (run) => {
    try {
      return await call(run);
    } catch (err) {
      if (!(err instanceof PaperCut)) throw err;
      return { data: null, error: err, expired: err.expired };
    }
  };
  return {
    session,
    bucket,
    images: new Map(),
    now,
    endAt,
    left,
    call,
    ask,
    auditTimeoutMs: Math.min(callTimeoutMs, SURVEY_REPORT_AUDIT_TIMEOUT_MS),
    say: (line) => { try { log(line); } catch { /* log พังต้องไม่ทำให้กระดาษพัง */ } },
  };
}

/* ══ ขั้นวัดของ I5b ═════════════════════════════════════════════════════ */

/* เหตุสั้นของ "วัดไม่ได้เลย" — ขั้นออกเลขเอาไปประกอบประโยคของตัวเอง ("ตรวจกระดาษของเอกสารไม่สำเร็จ (…) — กดออกเอกสารอีกครั้ง")
   จึงไม่มีคำแนะนำท้ายประโยคซ้ำ */
const MEASURE_ERROR = Object.freeze({
  chromium_failed: 'ตัวพิมพ์ PDF ของระบบทำงานไม่สำเร็จ',
  image_missing: 'รูปของเอกสารหายจากที่เก็บ',
  storage_failed: 'อ่านรูปของเอกสารจากที่เก็บไม่สำเร็จ',
  timeout: 'เวลาไม่พอวัดกระดาษ',
  paper_failed: 'ไม่มีกระดาษให้วัด',
});

/**
 * 🔑 **วัดกระดาษลองทั้งสองฉบับก่อนออกเลข** (§3 I5b · มติ 29) — POST "ออกเอกสาร" เท่านั้น · เส้นส่งผลไม่เปิด chromium
 * ไม่เขียนอะไรเลย: ไม่ตรึง ไม่อัป ไม่ลง audit · PDF ที่พิมพ์ได้ถูกทิ้ง (กระดาษลองไม่มีเลข — ขั้นกระดาษพิมพ์ใหม่พร้อมเลข)
 *
 * ⭐ รูปของอาร์กิวเมนต์และผล **ตรงกับพารามิเตอร์ `measure` ของ `issueSurveyReport`** — route เอกสารเสียบได้ตรง ๆ:
 *   `measure: (payload) => measureSurveyReportPaper(supabase, { ...payload, session })`
 *
 * @param supabase           service-role client (ใช้เฉพาะ `storage.from(bucket).download` — รูปที่ขั้นรูปเพิ่งอัป)
 * @param opts.customerHtml  HTML ของกระดาษลองฉบับลูกค้า **ที่ยังเป็น token** (`su-img:<sha>`)
 * @param opts.internalHtml  HTML ของกระดาษลองฉบับภายใน — ต้องมีครบสองฉบับ (ขาด = วัดไม่ได้)
 * @param opts.deadline      งบเวลา (epoch ms · Date · หรือจำนวน ms จากนี้) — เหลือไม่ถึง 40 วิ = `timeout` ไม่เปิด chromium
 * @param opts.session       `surveyReportPrintSession()` ที่ใช้ร่วมกับขั้นกระดาษ — ไม่ส่ง = เปิดเองแล้วปิดเอง
 * @param opts.bucket · opts.loadRenderer · opts.now · opts.log · opts.callTimeoutMs  จุดเสียบของเทสต์
 * @returns `{ ok, code, error, issues, reasons }` — **ไม่โยน**
 *   · `ok`      `true` = ทั้งสองฉบับพิมพ์ได้และไม่มีข้อกัน ⇒ ออกเลขได้
 *   · `error`   `null` = วัดครบทั้งสองฉบับ (ดู `issues`) · ข้อความไทยสั้น ๆ = **วัดไม่ได้** (chromium · รูปในถัง · เวลา) ลองใหม่ได้
 *   · `issues`  `[{ version, kind: 'block', text, page }]` ข้อกันรายหน้า — `text` ยังไม่มีชื่อฉบับนำหน้า
 *               (ข้อที่แค่ลง log — เหลือที่น้อยกว่า 8px · ฟอนต์นอก Sarabun — ถูกลง log ที่นี่แล้ว ไม่คืนไป)
 *   · `code`    `null` | `paper_failed` (มีข้อกัน · ไม่มีกระดาษ) | `chromium_failed` | `image_missing` | `storage_failed` | `timeout`
 *   · `reasons` ข้อความไทยเต็มประโยค มีชื่อฉบับนำหน้า ("ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ …")
 *   ⇒ ขั้นออกเลขตอบ `paper_blocked` เมื่อ `error` ไม่ว่างหรือมี `issues` — ยังไม่มีเลขถูกใช้
 */
export async function measureSurveyReportPaper(supabase, opts = {}) {
  const {
    customerHtml = null, internalHtml = null, deadline = null, session = null, bucket = SURVEY_REPORT_BUCKET,
    loadRenderer = importRenderer, now = Date.now, log = defaultLog, callTimeoutMs,
  } = opts || {};
  const html = { customer: String(customerHtml ?? ''), internal: String(internalHtml ?? '') };
  const fail = (code, reasons, { issues = [], measured = false } = {}) => ({
    ok: false, code, error: measured ? null : MEASURE_ERROR[code] || MEASURE_ERROR.chromium_failed, issues, reasons,
  });
  const own = !session;
  const printer = session || surveyReportPrintSession({ loadRenderer });
  try {
    const lacking = SURVEY_REPORT_VERSIONS.filter((version) => !html[version].trim());
    if (lacking.length) return fail('paper_failed', lacking.map((version) => `${LABEL[version]}: ไม่มีกระดาษให้วัด`));

    const ctx = paperContext({ session: printer, bucket, deadline, now, log, callTimeoutMs });
    const printed = await printVersions(supabase, html, SURVEY_REPORT_VERSIONS, ctx);
    if (printed.failure) return fail(printed.failure.code, printed.failure.reasons);

    const bad = SURVEY_REPORT_VERSIONS.map((version) => printed.papers[version]).filter((paper) => !paper.ok);
    if (!bad.length) return { ok: true, code: null, error: null, issues: [], reasons: [] };
    // ฉบับที่พิมพ์ไม่จบ = วัดไม่ครบ ⇒ `error` (ลองใหม่ได้) · มีแต่ข้อกัน = วัดครบแล้ว ⇒ `issues`
    const broken = bad.find((paper) => paper.code !== 'paper_failed');
    return fail((broken || bad[0]).code, bad.flatMap((paper) => paper.reasons), {
      issues: bad.flatMap((paper) => paper.issues), measured: !broken,
    });
  } catch (err) {
    console.error('[survey-report] วัดกระดาษลองล้มกลางทาง', errorText(err));
    return fail('chromium_failed', [R.paper_failed]);
  } finally {
    if (own) await printer.close();
  }
}

/* ══ ขั้นกระดาษ ═════════════════════════════════════════════════════════ */

/** สถานะของกระดาษจากแถว (§1 — เฉพาะสามสถานะที่ขั้นนี้ขยับได้) · ไม่มีแถว = `null` */
function paperState(row) {
  if (!row) return null;
  if (!row.frozenAt) return 'issued';
  return row.customerPdfPath && row.internalPdfPath ? 'ready' : 'frozen';
}

// ไฟล์ค้างอยู่แล้ว (รอบก่อนอัปขึ้นแต่เขียนที่อยู่ไม่ทัน · อีกคำขอวิ่งคู่กัน) = ใช้ได้ — กติกาเดียวกับ `issuedQuotationPdf.js`
const alreadyStored = (error) => /exists|duplicate|already/i.test(`${error?.message || ''} ${error?.error || ''}`);

/** P2 ของแถวที่ยังไม่ตรึง — ภาพนิ่ง → view → แผนหน้า (ต้องไม่ล้น) → HTML (token) ของทั้งสองฉบับ */
function renderPapers(row, renderHtml) {
  const docs = {};
  const reasons = [];
  if (!row.snapshot || typeof row.snapshot !== 'object' || !Array.isArray(row.snapshot.zones)) {
    return { docs, reasons: ['ภาพนิ่งของเอกสารอ่านไม่ได้ — แจ้งผู้ดูแลระบบ'] };
  }
  // กระดาษที่ตรึงแก้ไม่ได้ — แถวที่ไม่มีเลขที่หรือวันที่ออกต้องไม่ถูกตรึงเป็นกระดาษที่พิมพ์ขีด
  if (!row.docNo || !row.issuedAt) return { docs, reasons: ['แถวของเอกสารไม่มีเลขที่หรือวันที่ออก — แจ้งผู้ดูแลระบบ'] };
  for (const version of SURVEY_REPORT_VERSIONS) {
    try {
      const view = surveyReportView(row.snapshot, { version });
      const layout = paginateSurveyReport(view);
      const overflow = surveyReportOverflowErrors(layout);
      if (overflow.length) {
        reasons.push(...overflow.map((text) => `${LABEL[version]}: ${text}`));
        continue;
      }
      /* `issuedAt` ของแถว ไม่ใช่นาฬิกาของแอป (RPC คืนแค่เลข · ใกล้เที่ยงคืนสองเรือนไม่ตรงกัน) ·
         ไม่ส่ง `accentKey` — ค่าตั้งต้นของตัวเรนเดอร์คือ teal ตามกระดานที่อนุมัติ */
      const html = String(renderHtml({ view, layout, docNo: row.docNo, issuedAt: row.issuedAt }) ?? '');
      if (!html.trim()) {
        reasons.push(`${LABEL[version]}: ตัวเรนเดอร์คืนกระดาษว่าง`);
        continue;
      }
      docs[version] = { html, layout };
    } catch (err) {
      console.error(`[survey-report] เรนเดอร์กระดาษ${LABEL[version]}ของ ${row.docNo} ไม่สำเร็จ`, errorText(err));
      reasons.push(`${LABEL[version]}: เรนเดอร์กระดาษไม่สำเร็จ — แจ้งผู้ดูแลระบบ`);
    }
  }
  return { docs, reasons };
}

/** กระดาษที่ตรึงไว้ของฉบับที่จะพิมพ์ — อ่านเฉพาะคอลัมน์ของฉบับนั้น (คำขอฉบับลูกค้าไม่แตะ `internalHtml`) */
async function readFrozenHtml(supabase, id, versions) {
  const customer = versions.includes('customer');
  const internal = versions.includes('internal');
  if (customer && internal) {
    return supabase.from('service_survey_reports').select('"customerHtml", "internalHtml"').eq('id', id).maybeSingle();
  }
  if (internal) return supabase.from('service_survey_reports').select('"internalHtml"').eq('id', id).maybeSingle();
  return supabase.from('service_survey_reports').select('"customerHtml"').eq('id', id).maybeSingle();
}

async function runPaper(supabase, o) {
  const wanted = wantedVersions(o.want);
  const captured = [];
  const stored = {}; // ฉบับ → ข้อเท็จจริงของไฟล์ที่รอบนี้เก็บ (ลง audit)
  let row = null;
  const done = (code = null, reasons = []) => ({
    state: paperState(row),
    code,
    reasons,
    captured: [...captured],
    ready: { customer: !!row?.customerPdfPath, internal: !!row?.internalPdfPath },
  });
  const complete = () => wanted.every((version) => !!row[PATH_COLUMN[version]]);

  if (!o.reportId) return done('read_failed', [R.not_found]);

  const ctx = paperContext(o);
  const outOfTime = () => done('timeout', [R.timeout]);

  /* P1 — แถวของฉบับนี้ (สถานะใดก็ได้: ฉบับที่ถูกแทนที่ระหว่างทางยังทำกระดาษให้จบได้ · §11 ข้อ 14) */
  const read = await ctx.ask(() => supabase.from('service_survey_reports')
    .select('id, "docNo", rev, status, "issuedAt", snapshot, "rendererVersion", "frozenAt", "customerPdfPath", "internalPdfPath"')
    .eq('id', o.reportId).maybeSingle());
  if (read.expired) return outOfTime();
  if (read.error) {
    console.error(`[survey-report] อ่านแถวเอกสาร ${o.reportId} ไม่สำเร็จ`, errorText(read.error));
    return done('read_failed', [R.read_failed]);
  }
  if (!read.data) return done('read_failed', [R.not_found]);
  row = { ...read.data };
  if (complete()) return done();

  /* §0 — จากนี้ลงไปคือการเขียนของถาวร (ตรึง · อัป PDF · เขียนที่อยู่ไฟล์) · ต้องเป็น `true` ตรงตัว */
  const store = (o.storeAllowed === undefined ? surveyReportStoreAllowed() : o.storeAllowed) === true;
  if (!store) return done('not_production', [SURVEY_REPORT_NOT_PRODUCTION]);

  const failures = []; // { version | null, code, reasons } — เหตุที่ฉบับที่ต้องการยังไม่ครบ
  const papers = {};   // ฉบับ → { html, buffer, pdf } ที่พิมพ์ผ่านแล้วจาก HTML ที่ตรึง (หรือกำลังจะตรึง) ของฉบับนั้น
  let froze = false;

  if (!row.frozenAt) {
    /* ── แถวที่ยังไม่ตรึง: พิมพ์ **ทั้งสองฉบับ** เสมอ ไม่ว่า `want` จะขออะไร ── */
    const { docs, reasons } = renderPapers(row, o.renderHtml);
    if (reasons.length) return done('paper_failed', reasons);

    const printed = await printVersions(supabase, { customer: docs.customer.html, internal: docs.internal.html }, SURVEY_REPORT_VERSIONS, ctx);
    if (printed.failure) return done(printed.failure.code, printed.failure.reasons);
    const bad = SURVEY_REPORT_VERSIONS.map((version) => printed.papers[version]).filter((paper) => !paper.ok);
    // ฉบับใดฉบับหนึ่งไม่ผ่าน = ไม่ตรึง ไม่เก็บอะไรทั้งสิ้น
    if (bad.length) return done(bad[0].code, bad.flatMap((paper) => paper.reasons));

    /* P4b — 🔴 ยามกันรั่วรอบสอง บน HTML ฉบับลูกค้า **ตัวที่กำลังจะตรึง** */
    const leaks = surveyReportCustomerHtmlIssues({ html: docs.customer.html, snapshot: row.snapshot, layout: docs.customer.layout });
    if (leaks.length) {
      console.error(`[survey-report] 🔴 ยามกันรั่ว: ไม่ตรึงฉบับลูกค้าของ ${row.docNo} —`, leaks.join(' | '));
      return done('paper_failed', leaks.map((text) => `${LABEL.customer}: ${text}`));
    }

    /* P5 — ตรึงสองฉบับในคำสั่งเดียว · `frozenAt` ยังว่างเท่านั้น (คอลัมน์เขียนได้ครั้งเดียว · ห้ามเขียน '' — ตรวจว่างไปแล้วที่ P2) */
    const frozenAt = new Date(o.now()).toISOString();
    const freeze = await ctx.ask(() => supabase.from('service_survey_reports')
      .update({
        customerHtml: docs.customer.html,
        internalHtml: docs.internal.html,
        rendererVersion: SURVEY_REPORT_RENDERER_VERSION,
        frozenAt,
        updatedAt: frozenAt,
      })
      .eq('id', row.id).is('frozenAt', null).select('id').maybeSingle());
    /* หมดเวลาระหว่างรอคำตอบ: คำสั่งอาจลงแถวไปแล้ว — ไม่เป็นไร รอบถัดไปอ่านแถวแล้วเดินต่อจากกระดาษที่ตรึง (§11) */
    if (freeze.expired) return outOfTime();
    if (freeze.error) {
      console.error(`[survey-report] ตรึงกระดาษของ ${row.docNo} ไม่สำเร็จ`, errorText(freeze.error));
      return done('freeze_failed', [R.freeze_failed]);
    }

    if (freeze.data) {
      froze = true;
      row.frozenAt = frozenAt;
      row.rendererVersion = SURVEY_REPORT_RENDERER_VERSION;
      for (const version of SURVEY_REPORT_VERSIONS) papers[version] = printed.papers[version];
    } else {
      /* ไม่มีแถวถูกเขียน = อีกคำขอตรึงไปก่อน — กระดาษของเขาคือของจริง · ของเราใช้ได้เฉพาะฉบับที่ HTML ตรงกันทุกตัวอักษร */
      const again = await ctx.ask(() => supabase.from('service_survey_reports')
        .select('"frozenAt", "rendererVersion", "customerHtml", "internalHtml", "customerPdfPath", "internalPdfPath"')
        .eq('id', row.id).maybeSingle());
      if (again.expired) return outOfTime();
      if (again.error || !again.data) {
        console.error(`[survey-report] อ่านกระดาษที่อีกคำขอตรึงของ ${row.docNo} ไม่สำเร็จ`, errorText(again.error));
        return done('read_failed', [R.read_failed]);
      }
      if (!again.data.frozenAt) {
        console.error(`[survey-report] ตรึงกระดาษของ ${row.docNo} ไม่ลงแถว ทั้งที่ยังไม่มีใครตรึง`);
        return done('freeze_failed', [R.freeze_failed]);
      }
      row = {
        ...row,
        frozenAt: again.data.frozenAt,
        rendererVersion: again.data.rendererVersion,
        customerPdfPath: again.data.customerPdfPath,
        internalPdfPath: again.data.internalPdfPath,
      };
      const redo = {};
      for (const version of SURVEY_REPORT_VERSIONS) {
        const winner = String(again.data[HTML_COLUMN[version]] ?? '');
        if (winner === docs[version].html) papers[version] = printed.papers[version];
        else if (wanted.includes(version) && !row[PATH_COLUMN[version]]) redo[version] = winner; // PDF ของเราทิ้ง — พิมพ์ใหม่จากของเขา
      }
      await printFrozen(supabase, ctx, redo, papers, failures);
    }
  } else {
    /* ── แถวที่ตรึงแล้ว: พิมพ์เฉพาะฉบับที่ต้องการและยังไม่มี PDF ── */
    const todo = wanted.filter((version) => !row[PATH_COLUMN[version]]);
    const html = await ctx.ask(() => readFrozenHtml(supabase, row.id, todo));
    if (html.expired) return outOfTime();
    if (html.error || !html.data) {
      console.error(`[survey-report] อ่านกระดาษที่ตรึงของ ${row.docNo} ไม่สำเร็จ`, errorText(html.error));
      return done('read_failed', [R.read_failed]);
    }
    const frozen = {};
    for (const version of todo) frozen[version] = String(html.data[HTML_COLUMN[version]] ?? '');
    await printFrozen(supabase, ctx, frozen, papers, failures);
  }

  /* P6 — เก็บ PDF ทีละฉบับ: อัป (ไฟล์แรกชนะ) แล้วเขียนที่อยู่เมื่อคอลัมน์ยังว่าง · ฉบับหนึ่งล้มไม่หยุดอีกฉบับ
     🔴 เช็กงบก่อนเก็บทุกฉบับ และทั้งสองคำสั่งวิ่งใต้เพดาน — หมดงบ = `timeout` ของฉบับนั้น (กระดาษตรึงแล้ว PDF ค้างไว้:
        รอบถัดไปพิมพ์จากกระดาษที่ตรึงแล้วเก็บต่อ · อัปที่ถูกตัดแล้วไปลงทีหลัง = "มีอยู่แล้ว" ของรอบถัดไป) */
  for (const version of SURVEY_REPORT_VERSIONS) {
    const paper = papers[version];
    if (!paper || row[PATH_COLUMN[version]]) continue;
    const path = surveyReportPdfPath(row.id, version);
    const mark = performance.now();
    let existed = false;
    try {
      if (ctx.left() < SURVEY_REPORT_STORE_MIN_MS) throw new PaperCut(true);
      const upload = await ctx.call(() => supabase.storage.from(o.bucket).upload(path, paper.buffer, { contentType: 'application/pdf', upsert: false }));
      if (upload?.error) {
        if (!alreadyStored(upload.error)) throw upload.error;
        existed = true;
      }
      const wrote = await ctx.call(() => supabase.from('service_survey_reports')
        .update(PATH_PATCH[version](path, new Date(o.now()).toISOString()))
        .eq('id', row.id).is(PATH_COLUMN[version], null).select('id').maybeSingle());
      if (wrote.error) throw wrote.error;
      row[PATH_COLUMN[version]] = path;
      // ไม่มีแถวถูกเขียน = อีกคำขอเขียนที่อยู่เดียวกันไปก่อน — ไฟล์พร้อมแล้ว แต่ไม่ใช่ของรอบนี้
      if (wrote.data) {
        captured.push(version);
        stored[version] = existed ? { existed: true } : paper.pdf;
      }
      ctx.say({ step: 'store', version, ok: true, existed, ms: elapsed(mark) });
    } catch (err) {
      const expired = err instanceof PaperCut && err.expired;
      console.error(`[survey-report] เก็บ PDF ${LABEL[version]}ของ ${row.docNo} ไม่สำเร็จ`, errorText(err));
      failures.push({
        version, code: expired ? 'timeout' : 'store_failed', reasons: [`${LABEL[version]}: ${expired ? R.timeout : R.store_failed}`],
      });
      ctx.say({ step: 'store', version, ok: false, ms: elapsed(mark), reason: errorText(err) });
    }
  }

  /* P7 — audit ของสิ่งที่รอบนี้เขียน · แทนคอลัมน์ sha/ขนาดที่ตารางไม่มี (§12 · §13)
     🔴 ประกอบ `after` ทีละคีย์ — ห้ามส่งแถว ภาพนิ่ง หรือ HTML เข้า audit (`after` ถูกเก็บตามตัว) */
  if (froze || captured.length) {
    try {
      const parts = SURVEY_REPORT_VERSIONS.filter((version) => stored[version]).map((version) => LABEL[version]);
      // เพดานของตัวเอง ไม่ผ่าน `ctx.call` — งบของรอบหมดแล้วก็ยังต้องได้ลองลง audit ของสิ่งที่เขียนไป
      await surveyReportBounded(() => o.audit({
        user: o.user,
        action: 'update',
        entityType: 'service_survey_report',
        entityId: row.id,
        summary: `เก็บกระดาษของเอกสารประเมิน ${row.docNo}${parts.length ? ` — ${parts.join(' · ')}` : ' — ตรึงแล้ว ยังไม่มี PDF'}`,
        after: {
          id: row.id,
          docNo: row.docNo,
          rendererVersion: row.rendererVersion || null,
          generator: typeof ctx.session.generator === 'function' ? ctx.session.generator() : null,
          ...(stored.customer ? { customer: stored.customer } : {}),
          ...(stored.internal ? { internal: stored.internal } : {}),
        },
      }), ctx.auditTimeoutMs);
    } catch (err) {
      console.error(`[survey-report] ลง audit ของกระดาษ ${row.docNo} ไม่สำเร็จ`, errorText(err));
    }
  }

  if (complete()) return done();
  const mine = failures.filter((failure) => wanted.includes(failure.version));
  if (!mine.length) return done('paper_failed', [R.paper_failed]);
  return done(mine[0].code, mine.flatMap((failure) => failure.reasons));
}

/** พิมพ์จาก HTML **ที่ตรึงแล้ว** — ฉบับที่ผ่านลง `papers` · ฉบับที่ไม่ผ่านลง `failures` (ไม่เก็บ PDF ที่มีข้อกัน) */
async function printFrozen(supabase, ctx, htmlByVersion, papers, failures) {
  const versions = SURVEY_REPORT_VERSIONS.filter((version) => version in htmlByVersion);
  const printable = versions.filter((version) => {
    if (htmlByVersion[version].trim()) return true;
    failures.push({ version, code: 'paper_failed', reasons: [`${LABEL[version]}: กระดาษที่ตรึงไว้ว่าง — แจ้งผู้ดูแลระบบ`] });
    return false;
  });
  if (!printable.length) return;
  const printed = await printVersions(supabase, htmlByVersion, printable, ctx);
  for (const version of printable) {
    if (printed.failure) failures.push({ version, code: printed.failure.code, reasons: printed.failure.reasons });
    else if (printed.papers[version].ok) papers[version] = printed.papers[version];
    else failures.push({ version, code: printed.papers[version].code, reasons: printed.papers[version].reasons });
  }
}

/**
 * 🔑 **ทำกระดาษของเอกสารหนึ่งฉบับ (Rev) ให้ครบ** — วัดทั้งสองฉบับ · ตรึง HTML · เก็บ PDF (§4 P1–P7)
 *
 * ขั้นของแถวที่ยังไม่ตรึง: P2 เรนเดอร์สองฉบับ (แผนหน้าต้องไม่ล้น) → P3 รูปจากถัง → P4 พิมพ์ + วัด **ทั้งสองฉบับ**
 *   (ไม่ว่า `want` จะขออะไร) → P4b ยามกันรั่ว → P5 ตรึง (`frozenAt` ยังว่างเท่านั้น) → P6 เก็บ PDF ทั้งสองฉบับ → P7 audit
 * ขั้นของแถวที่ตรึงแล้ว: อ่าน HTML ที่ตรึงของฉบับที่ `want` และยังไม่มี PDF → P3 → P4 → P6 → P7
 *   (คำขอฉบับลูกค้าไม่อ่าน `internalHtml` ไม่ดึงรูปจุด ไม่พิมพ์ฉบับภายใน)
 *
 * @param supabase        service-role client
 * @param opts.reportId   `service_survey_reports.id`
 * @param opts.want       `'customer'` | `'internal'` | `'both'` (ค่าตั้งต้น) — ค่าอื่น = ฉบับลูกค้า
 * @param opts.deadline   งบเวลา (epoch ms · Date · หรือจำนวน ms จากนี้) — เหลือไม่ถึง 40 วิ = `timeout` ไม่เปิด chromium ·
 *                        เช็กซ้ำก่อนพิมพ์ฉบับถัดไป (15 วิ) และก่อนเก็บ PDF แต่ละฉบับ (5 วิ) · ทุกการรอถูกตัดที่จุดนี้
 * @param opts.user       คนที่ทำให้ขั้นนี้วิ่ง (ผู้เปิดเอกสารคนแรก · ผู้กดออกเอกสาร) — ลงแถว audit เท่านั้น
 * @param opts.session    `surveyReportPrintSession()` ที่ใช้ร่วมกับขั้นวัด — ไม่ส่ง = เปิดเองแล้วปิดเอง
 * @param opts.storeAllowed · opts.bucket · opts.loadRenderer · opts.renderHtml · opts.audit · opts.now · opts.log ·
 *        opts.callTimeoutMs (เพดานของการเรียกถัง/ฐานหนึ่งครั้ง)  จุดเสียบของเทสต์
 * @returns `{ state, code, reasons, captured, ready }` — **ไม่โยน**
 *   · `state`    สถานะของกระดาษหลังรอบนี้ จากแถว: `'issued'` (ยังไม่ตรึง) · `'frozen'` · `'ready'` · `null` (อ่านแถวไม่ได้)
 *   · `code`     `null` = ฉบับที่ `want` มี PDF ครบแล้ว · ไม่งั้น `not_production` · `read_failed` · `paper_failed` ·
 *                `image_missing` · `storage_failed` · `chromium_failed` · `timeout` · `freeze_failed` · `store_failed`
 *   · `reasons`  ข้อความไทยของเหตุ (ว่างเมื่อ `code` เป็น `null`)
 *   · `captured` ฉบับที่ **รอบนี้** เก็บ PDF และเขียนที่อยู่ไฟล์เอง เช่น `['customer', 'internal']`
 *   · `ready`    `{ customer, internal }` ฉบับที่มี PDF แล้วหลังรอบนี้
 *   ⚠️ ฉบับที่ไม่ได้ขอแล้วเก็บไม่สำเร็จ ไม่ทำให้ `code` ไม่ว่าง (ลง log) — รอบที่ขอฉบับนั้นจะทำต่อเอง
 *   ⚠️ `timeout` กลางทางมาพร้อมของที่เก็บไปแล้ว: `state: 'frozen'` + `ready`/`captured` ของฉบับที่ทัน — เรียกซ้ำแล้วเดินต่อจากแถว
 */
export async function ensureSurveyReportPaper(supabase, opts = {}) {
  const {
    reportId = null, want = 'both', deadline = null, user = null, session = null,
    storeAllowed, bucket = SURVEY_REPORT_BUCKET, loadRenderer = importRenderer,
    renderHtml = renderSurveyReportHTML, audit = recordAudit, now = Date.now, log = defaultLog, callTimeoutMs,
  } = opts || {};
  const own = !session;
  const printer = session || surveyReportPrintSession({ loadRenderer });
  try {
    return await runPaper(supabase, {
      reportId, want, deadline, user, session: printer, storeAllowed, bucket, renderHtml, audit, now, log, callTimeoutMs,
    });
  } catch (err) {
    console.error(`[survey-report] ขั้นกระดาษของ ${reportId} ล้มกลางทาง`, errorText(err));
    return { state: null, code: 'paper_failed', reasons: [R.paper_failed], captured: [], ready: { customer: false, internal: false } };
  } finally {
    if (own) await printer.close();
  }
}
