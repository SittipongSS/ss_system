// ── กระดาษ FM-SA-04 ฝั่ง server — ตรึง · เลือกฉบับ · เรนเดอร์ · ตอบ (mig 0370) ─────────
//
// ⭐ มติเจ้าของ 21/09/2569 (docs/fm-sa-04-document-model.md §ภาพนิ่ง/กระดาษ)
//   · AE Sup อนุมัติ ⇒ เรนเดอร์จากภาพนิ่ง + ผู้ลงนามสามขั้น แล้วเก็บลง `frozenHtml` **ครั้งเดียว**
//   · พิมพ์ Rev ที่อนุมัติแล้ว (หรือถูกแทนแล้ว) ใช้ `frozenHtml` เสมอ — ไม่เรนเดอร์ใหม่
//   · Rev ที่ยื่นแล้วแต่ยังไม่จบ (pending_* · rejected) พิมพ์จากภาพนิ่งของตัวเอง
//   · ร่าง = พิมพ์สดจากสเปค + SO ปัจจุบัน (ภาพนิ่งสดจาก `buildDocumentSnapshot` ตัวเดียวกับตอนยื่น)
//   · ตัวอย่างจากหน้าสินค้า = ภาพนิ่งสดที่ไม่มี SO + ลายน้ำ "ตัวอย่าง"
//
// ⚠️ **ตรึงแล้วเขียนทับไม่ได้** (trigger 0370 ⑧) ⇒ ตอนตรึง ข้อมูลบริษัท/มาตรฐานเอกสาร
//    ต้องอ่านได้จริง (อ่านไม่ได้ = ไม่ตรึง คืน error ให้ลองใหม่) · ส่วนร่าง/ตัวอย่างอ่านแบบ best effort
//    (ตกไปค่าสำรองแล้วพิมพ์ต่อ) เพราะเป็นกระดาษที่ไม่ได้เก็บ
// ⚠️ **supabase ไม่ throw** — ทุก query เช็ค `error` เอง และ UPDATE ที่ตรึงต้องโดนแถวจริง
//
// ── รูปของผลลัพธ์ที่ล้ม (ชุดเดียวกับ productSpecStore) ─────────────────────────
//   `{ error: ข้อความไทย, status? }` — ไม่มี status = ระบบ/ฐานล้ม (ตอบ 500)
import 'server-only';
import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { resolveCompanyBlock } from '@/lib/companyProfile';
import { printPlaceholderHtml } from '@/lib/printTheme';
import { DOC_REVISION_STATUS_LABELS, formatRevLabel } from '@/lib/sales/productSpecDocWorkflow';
import {
  PRODUCT_SPEC_RENDERER_VERSION, applyProductSpecWatermark, productSpecSignedSteps, productSpecWatermark,
  renderProductSpecDocument,
} from '@/lib/sales/productSpecDocument';
import { buildDocumentSnapshot, loadSpecDocument } from '@/lib/sales/productSpecStore';
import { loadActiveSignatureAsset, loadSignatureImageDataUri } from '@/lib/sales/issuedQuotationSnapshot';

const STANDARD_KEY = 'productSpec';
// Rev ที่มีกระดาษตรึง — `superseded` เคยเป็น `approved` มาก่อนเสมอ (trigger 0370 ⑧)
const FROZEN_STATUSES = Object.freeze(['approved', 'superseded']);
// Rev ที่ยื่นแล้วแต่ยังไม่จบ — พิมพ์จากภาพนิ่งของตัวเอง ไม่ใช่สเปคสด
const SNAPSHOT_STATUSES = Object.freeze(['pending_ae', 'pending_ae_supervisor', 'rejected']);

const messageOf = (error) => error?.message || String(error || 'ไม่ทราบสาเหตุ');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const statusLabel = (status) => DOC_REVISION_STATUS_LABELS[status] || status || 'ไม่ทราบสถานะ';

/* ── บริษัท + มาตรฐานเอกสาร ─────────────────────────────────────────────── */

async function loadCompany(supabase) {
  try {
    return { company: await getPublishedCompanyProfile(supabase) };
  } catch (error) {
    return { error: messageOf(error) };
  }
}

async function loadStandard(supabase) {
  const { data, error } = await supabase.from('document_standard_versions').select('*')
    .eq('documentKey', STANDARD_KEY).eq('status', 'published').maybeSingle();
  if (error) return { error: messageOf(error) };
  return { standard: data || null };
}

/**
 * บล็อกบริษัท + มาตรฐานที่เผยแพร่ของ FM-SA-04
 *
 * @param opts.strict `true` (ตอนตรึง) = อ่านไม่ได้คืน error · `false` (ร่าง/ตัวอย่าง) = ตกไปค่าสำรอง
 *   ⚠️ ค่าสำรองของบริษัทคือ `documentBrand` ตัวเดียวกับเอกสารอื่น · ของมาตรฐานคือ `FM-SA-04 Rev.00`
 * @returns {{ company: object, standard: object|null } | { error: string }}
 */
export async function loadSpecPrintContext(supabase, { strict = false } = {}) {
  const [company, standard] = await Promise.all([loadCompany(supabase), loadStandard(supabase)]);
  if (strict) {
    if (company.error) return { error: `อ่านข้อมูลบริษัทไม่สำเร็จ: ${company.error}` };
    if (standard.error) return { error: `อ่านมาตรฐานเอกสาร FM-SA-04 ไม่สำเร็จ: ${standard.error}` };
  } else {
    // ⚠️ ไม่เงียบ — กระดาษยังพิมพ์ได้ แต่ต้องมีร่องรอยว่าหัวกระดาษมาจากค่าสำรอง
    if (company.error) console.warn('[productSpecFreeze] อ่านข้อมูลบริษัทไม่สำเร็จ — ใช้ค่าสำรอง', company.error);
    if (standard.error) console.warn('[productSpecFreeze] อ่านมาตรฐาน FM-SA-04 ไม่สำเร็จ — ใช้ค่าสำรอง', standard.error);
  }
  return {
    company: company.company || resolveCompanyBlock(null),
    standard: standard.standard || null,
  };
}

/* ── ลายเซ็นของขั้นที่เซ็นแล้ว ─────────────────────────────────────────────── */

/* role ในบัญชีของคนที่ประทับตรา — ตำแหน่งเต็มบนช่องลงนามมาจากตัวนี้ (admin กดแทน = Administrator)
   ⚠️ อ่านไม่ได้ = null (ช่องพิมพ์ตำแหน่งของช่องแทน) + log · ไม่ throw — ห่อ try เพราะ auth admin เป็น
      fetch ที่ reject ได้ (ไม่ใช่ query builder ที่คืน error เสมอ) */
async function loadSignerRole(supabase, userId) {
  try {
    const res = await supabase.auth?.admin?.getUserById?.(userId);
    if (!res) return null;
    if (res.error) {
      console.error('[productSpecFreeze] อ่านบัญชีผู้ลงนามไม่สำเร็จ — พิมพ์ตำแหน่งของช่องแทน', userId, res.error.message || res.error);
      return null;
    }
    return res.data?.user?.app_metadata?.role || null;
  } catch (error) {
    console.error('[productSpecFreeze] อ่านบัญชีผู้ลงนามไม่สำเร็จ — พิมพ์ตำแหน่งของช่องแทน', userId, error?.message || error);
    return null;
  }
}

/**
 * รูปลายเซ็น + role ของคนที่เซ็นแต่ละขั้นของ Rev (มติผู้ใช้ 2026-09-22 "final review ต้องปรับให้เหมือน QT และ SO")
 *
 * ⭐ รูป = ลายเซ็นที่ **ใช้งานอยู่** ของคนนั้น (`loadActiveSignatureAsset` ตัวเดียวกับช่องผู้จัดทำของ QT/SO)
 *    ตอนตรึงกระดาษฝังเป็น data URI ลง `frozenHtml` ⇒ กระดาษที่อนุมัติแล้วไม่เปลี่ยนแม้เจ้าตัวเปลี่ยนลายเซ็นทีหลัง
 * ⚠️ best effort ทุกชั้น — โหลดไม่ได้ = ช่องนั้นเป็นกล่อง "ลายเซ็นอิเล็กทรอนิกส์" + ชื่อ + วันที่ (แบบ QT/SO)
 *    **ห้ามขวางการตรึง** (Rev อนุมัติไปแล้ว ถอยไม่ได้) แต่ทุกความล้มต้องลง log (ตัวโหลดสองตัวล็อกเอง + ตัวนี้)
 * ⚠️ ต้องเป็น client service role — ลายเซ็นอยู่ใน bucket ส่วนตัว (`withUser` ส่งตัวนี้มาอยู่แล้ว)
 * @returns {Promise<{ submit?: {imageDataUri, role}, ae?: {...}, sup?: {...} }>} ขั้นที่ไม่มีคนเซ็น = ไม่มีคีย์
 */
export async function loadProductSpecSignatures(supabase, revision) {
  const steps = productSpecSignedSteps(revision).filter((step) => step.userId);
  const entries = await Promise.all(steps.map(async ({ key, userId }) => {
    try {
      const [asset, role] = await Promise.all([
        loadActiveSignatureAsset(supabase, userId),
        loadSignerRole(supabase, userId),
      ]);
      const imageDataUri = asset ? await loadSignatureImageDataUri(supabase, asset) : null;
      if (!asset) console.warn('[productSpecFreeze] ผู้ลงนามยังไม่มีลายเซ็นที่ใช้งานอยู่ — พิมพ์กล่องลายเซ็นอิเล็กทรอนิกส์', key, userId);
      return [key, { imageDataUri, role }];
    } catch (error) {
      console.error('[productSpecFreeze] โหลดลายเซ็นไม่สำเร็จ — พิมพ์กล่องลายเซ็นอิเล็กทรอนิกส์', key, userId, error?.message || error);
      return [key, { imageDataUri: null, role: null }];
    }
  }));
  return Object.fromEntries(entries);
}

/* ── เลือกฉบับ ─────────────────────────────────────────────────────────── */

/**
 * Rev ที่จะพิมพ์ — `?rev=N` · ไม่ส่ง = ฉบับที่อนุมัติอยู่ ไม่มีก็ Rev ล่าสุด
 *
 * @param loaded ผลของ `loadSpecDocument` (`revisions` · `approved` · `latest`)
 * @returns {{ revision: object } | { error: string, status: number }}
 */
export function pickDocumentRevision(loaded, revParam) {
  const revisions = Array.isArray(loaded?.revisions) ? loaded.revisions : [];
  const raw = revParam === null || revParam === undefined ? '' : String(revParam).trim();
  if (raw === '') {
    const revision = loaded?.approved || loaded?.latest || null;
    return revision ? { revision } : { error: 'เอกสารนี้ยังไม่มี Rev. ให้พิมพ์', status: 404 };
  }
  if (!/^\d{1,4}$/.test(raw)) return { error: 'เลข Rev. ไม่ถูกต้อง — ใช้ตัวเลข เช่น ?rev=0', status: 400 };
  const revNo = Number(raw);
  const revision = revisions.find((row) => Number(row.revNo) === revNo);
  return revision ? { revision } : { error: `ไม่พบ ${formatRevLabel(revNo)} ของเอกสารนี้`, status: 404 };
}

/**
 * Rev ที่มาแทน Rev นี้ — Rev ถัดไปที่ผ่านด่านครบ (approved/superseded) ที่เลขน้อยสุด
 *
 * ⚠️ Rev ที่ร่าง/ตีกลับค้างอยู่ระหว่างทางไม่นับ — มันยังไม่ได้แทนใคร
 * @returns {number|null}
 */
export function supersedingRevNo(revisions = [], revision = null) {
  if (revision?.status !== 'superseded') return null;
  const own = Number(revision.revNo);
  const later = (Array.isArray(revisions) ? revisions : [])
    .filter((row) => FROZEN_STATUSES.includes(row?.status) && Number(row.revNo) > own)
    .map((row) => Number(row.revNo));
  return later.length ? Math.min(...later) : null;
}

/* ── ตรึงกระดาษ ────────────────────────────────────────────────────────── */

async function readFrozenHtml(supabase, revisionId) {
  const { data, error } = await supabase.from('product_spec_document_revisions')
    .select('id, frozenHtml').eq('id', revisionId).maybeSingle();
  if (error) return { error: messageOf(error) };
  if (!data) return { error: 'ไม่พบ Rev. ของเอกสารนี้', status: 404 };
  return { frozenHtml: data.frozenHtml || null };
}

/**
 * เรนเดอร์กระดาษของ Rev ที่อนุมัติแล้วจากภาพนิ่ง + ผู้ลงนามสามขั้น แล้วเก็บลง `frozenHtml`
 *
 * ⭐ เรียกหลัง `sup_approve` สำเร็จ (เราต์ PATCH) · เราต์พิมพ์เรียกซ้ำได้เพื่อซ่อมใบที่ตรึงพลาด
 *    (idempotent — ตรึงแล้ว = คืนของเดิม ไม่เขียนซ้ำ)
 * ⚠️ กระดาษที่ตรึง **ไม่มีลายน้ำ** เสมอ — มันคือฉบับอนุมัติ · ลายน้ำ "ถูกแทน"/"ยกเลิก" ประทับทับ
 *    ตอนเสิร์ฟ (`applyProductSpecWatermark`) เพราะสถานะพวกนั้นเกิดทีหลังและเขียนทับของที่ตรึงไม่ได้
 * 🔴 UPDATE มี `.is('frozenHtml', null)` + สถานะต้องยังอนุมัติ/ถูกแทน และต้องโดนแถวจริง —
 *    ไม่โดน = อีกคนตรึงไปก่อน (อ่านของเขามาคืน) หรือ Rev เปลี่ยนไปแล้ว (409)
 *
 * @param opts.loaded ผลของ `loadSpecDocument` ที่โหลดไว้แล้ว (ไม่ส่ง = โหลดเอง)
 * @returns {{ frozenHtml: string, alreadyFrozen?: true } | { error: string, status?: number }}
 *   (สัญญากลางระบุ `{}` เมื่อสำเร็จ — ที่นี่คืน `frozenHtml` ติดมาด้วยให้เราต์พิมพ์ใช้ต่อ)
 */
export async function freezeProductSpecRevision(supabase, {
  documentId, revisionId, loaded = null, now = new Date().toISOString(),
} = {}) {
  if (!documentId || !revisionId) return { error: 'ไม่ระบุเอกสารหรือ Rev. ที่จะตรึงกระดาษ', status: 400 };
  const doc = loaded || await loadSpecDocument(supabase, documentId);
  if (doc.error) return { error: doc.error, status: doc.status };
  if (doc.document?.id !== documentId) return { error: 'ไม่พบเอกสารนี้', status: 404 };
  const revision = (doc.revisions || []).find((row) => row.id === revisionId);
  if (!revision) return { error: 'ไม่พบ Rev. ของเอกสารนี้', status: 404 };
  if (!FROZEN_STATUSES.includes(revision.status)) {
    return {
      error: `ตรึงกระดาษได้เฉพาะ Rev. ที่อนุมัติแล้ว — ${formatRevLabel(revision.revNo)} อยู่สถานะ "${statusLabel(revision.status)}"`,
      status: 409,
    };
  }

  const current = await readFrozenHtml(supabase, revision.id);
  if (current.error) return { error: current.error, status: current.status };
  if (current.frozenHtml) return { frozenHtml: current.frozenHtml, alreadyFrozen: true };

  // ฐานบังคับให้ Rev ที่ยื่นแล้วมีภาพนิ่งเสมอ — ไม่มี = ข้อมูลเสีย ไม่ใช่ให้ไปเรนเดอร์จากสเปคสด
  if (!isObject(revision.snapshot)) {
    return { error: `${formatRevLabel(revision.revNo)} ไม่มีภาพนิ่ง — ตรึงกระดาษไม่ได้ แจ้งผู้ดูแลระบบ` };
  }
  const context = await loadSpecPrintContext(supabase, { strict: true });
  if (context.error) return { error: `ตรึงกระดาษไม่สำเร็จ — ${context.error}` };
  // รูปลายเซ็นของสามขั้นฝังลงกระดาษที่ตรึงครั้งเดียว (best effort — โหลดไม่ได้ไม่ขวางการตรึง)
  const signatures = await loadProductSpecSignatures(supabase, revision);

  const html = renderProductSpecDocument({
    snapshot: revision.snapshot,
    document: doc.document,
    revision,
    watermark: null,
    company: context.company,
    standard: context.standard,
    signatures,
  });

  const { data, error } = await supabase.from('product_spec_document_revisions')
    .update({ frozenHtml: html, frozenAt: now, rendererVersion: PRODUCT_SPEC_RENDERER_VERSION })
    .eq('id', revision.id)
    .eq('documentId', documentId)
    .in('status', [...FROZEN_STATUSES])
    .is('frozenHtml', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: `เก็บกระดาษฉบับอนุมัติไม่สำเร็จ: ${messageOf(error)}` };
  if (!data) {
    // ไม่โดนแถว — แข่งกับอีกคำขอที่ตรึงไปก่อน (ใช้ของเขา) หรือ Rev ถูกเปลี่ยนสถานะไปแล้ว
    const again = await readFrozenHtml(supabase, revision.id);
    if (again.error) return { error: again.error, status: again.status };
    if (again.frozenHtml) return { frozenHtml: again.frozenHtml, alreadyFrozen: true };
    return { error: 'สถานะเปลี่ยนแล้ว กรุณาโหลดใหม่', status: 409 };
  }
  return { frozenHtml: html };
}

/* ── เรนเดอร์กระดาษของเอกสาร ─────────────────────────────────────────────── */

/* ภาพนิ่งสดของร่าง — สเปคปัจจุบัน + SO/บรรทัดปัจจุบัน + เจ้าของดีล (ตัวสร้างเดียวกับตอนยื่น) */
async function liveSnapshot(supabase, loaded, now) {
  const { document, salesOrder, dealOwner } = loaded;
  let line = null;
  if (document.salesOrderLineId) {
    const res = await supabase.from('sales_order_lines')
      .select('id, salesOrderId, quotationLineId, productId, fgCode, description, qty, unit, sortOrder')
      .eq('id', document.salesOrderLineId)
      .maybeSingle();
    if (res.error) return { error: `อ่านบรรทัดใบสั่งขายไม่สำเร็จ: ${messageOf(res.error)}` };
    // ⚠️ ต้องเป็นบรรทัดของ SO เดียวกับเอกสาร (กติกาเดียวกับตอนยื่น) — ไม่ใช่ = พิมพ์แบบไม่มีบรรทัด
    line = res.data && res.data.salesOrderId === document.salesOrderId ? res.data : null;
  }
  const built = await buildDocumentSnapshot(supabase, {
    productId: document.productId, order: salesOrder, line, dealOwner, now,
  });
  if (built.error) return { error: built.error, status: built.status };
  return { snapshot: built.snapshot };
}

/**
 * กระดาษของ Rev หนึ่งใบ — เลือกแหล่งตามสถานะ แล้วติดลายน้ำตามมติ
 *
 *   approved / superseded ⇒ `frozenHtml` (ตรึงให้ถ้ายังไม่มี) + ลายน้ำ "ถูกแทน"/"ยกเลิก" ประทับทับ
 *   pending_* / rejected  ⇒ เรนเดอร์จากภาพนิ่งของ Rev + "ฉบับร่าง" (หรือ "ยกเลิก")
 *   draft                 ⇒ เรนเดอร์สดจากสเปค + SO ปัจจุบัน + "ฉบับร่าง" (หรือ "ยกเลิก")
 *
 * @param opts.loaded   ผลของ `loadSpecDocument`
 * @param opts.revision Rev ที่เลือกแล้ว (`pickDocumentRevision`)
 * @returns {{ html: string } | { error: string, status?: number }}
 */
export async function renderSpecDocumentPaper(supabase, {
  loaded, revision, now = new Date().toISOString(),
} = {}) {
  if (!loaded?.document || !revision) return { error: 'ไม่พบเอกสารหรือ Rev. ที่จะพิมพ์', status: 404 };
  const { document, revisions } = loaded;
  // ⭐ ลายน้ำตามภาษาของกระดาษ (ใบอังกฤษ = DRAFT/CANCELLED/SUPERSEDED BY) — ภาษาอยู่ในภาพนิ่งที่กระดาษพิมพ์จาก
  const watermarkFor = (snapshot) => productSpecWatermark({
    document, revision, supersededByRevNo: supersedingRevNo(revisions, revision),
    language: snapshot?.order?.docLanguage,
  });

  if (FROZEN_STATUSES.includes(revision.status)) {
    /* 🐞 บทเรียนเดียวกับสัญญา (contracts/[id]/document) — ตรึงพลาดแล้วยังส่งเนื้อสดออกไป =
       กระดาษที่ถูกพิมพ์ไม่ได้ถูกเก็บ แล้วครั้งหน้าเรนเดอร์ใหม่ได้อีกหน้าตา ⇒ ตีกลับให้เปิดใหม่แทน */
    const frozen = await freezeProductSpecRevision(supabase, {
      documentId: document.id, revisionId: revision.id, loaded, now,
    });
    if (frozen.error) {
      return { error: `เปิดกระดาษฉบับอนุมัติไม่สำเร็จ — ${frozen.error}`, status: frozen.status };
    }
    // กระดาษที่ตรึงเรนเดอร์จากภาพนิ่งของ Rev นี้ (freezeProductSpecRevision) ⇒ ภาษาเดียวกัน
    return { html: applyProductSpecWatermark(frozen.frozenHtml, watermarkFor(revision.snapshot)) };
  }

  let snapshot = SNAPSHOT_STATUSES.includes(revision.status) && isObject(revision.snapshot)
    ? revision.snapshot
    : null;
  if (!snapshot) {
    const live = await liveSnapshot(supabase, loaded, now);
    if (live.error) return { error: live.error, status: live.status };
    snapshot = live.snapshot;
  }
  const context = await loadSpecPrintContext(supabase, { strict: false });
  /* ขั้นที่เซ็นแล้วของ Rev ที่ยังไม่จบ (รออนุมัติ · ตีกลับ) ได้รูปลายเซ็นเหมือนฉบับอนุมัติ — กระดาษยังมีลายน้ำ
     "ฉบับร่าง" · ร่างไม่มีตราประทับ ⇒ ไม่โหลดอะไร */
  const signatures = await loadProductSpecSignatures(supabase, revision);
  return {
    html: renderProductSpecDocument({
      snapshot, document, revision, watermark: watermarkFor(snapshot), company: context.company, standard: context.standard,
      signatures,
    }),
  };
}

/**
 * ตัวอย่างจากหน้าสเปคของสินค้า — ยังไม่มีเอกสาร ไม่มีเลขที่ ไม่มี Rev · ลายน้ำ "ตัวอย่าง"
 *
 * ⚠️ ด่าน (เห็นสินค้า + อยู่ในหมวด) เป็นของเราต์ — ที่นี่ประกอบกระดาษอย่างเดียว
 * @returns {{ html: string } | { error: string, status?: number }}
 */
export async function renderProductSpecSample(supabase, { productId, now = new Date().toISOString() } = {}) {
  if (!productId) return { error: 'ไม่ระบุสินค้า', status: 400 };
  const built = await buildDocumentSnapshot(supabase, { productId, now });
  if (built.error) return { error: built.error, status: built.status };
  const context = await loadSpecPrintContext(supabase, { strict: false });
  return {
    html: renderProductSpecDocument({
      snapshot: built.snapshot,
      document: null,
      revision: null,
      watermark: productSpecWatermark({ sample: true }),
      company: context.company,
      standard: context.standard,
    }),
  };
}

/* ── คำตอบของเราต์พิมพ์ ────────────────────────────────────────────────────── */

export function specPaperResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const GENERIC_MESSAGES = Object.freeze({
  forbidden: 'คุณไม่มีสิทธิ์เปิดเอกสารนี้',
  unauthorized: 'กรุณาเข้าสู่ระบบก่อนเปิดเอกสาร',
});

/**
 * คำตอบตอนเปิดกระดาษไม่ได้ — ภาษาไทยเสมอ
 *
 * ⭐ จอเปิดกระดาษด้วย `window.open` (แท็บใหม่) ⇒ JSON ดิบคือสิ่งที่คนเห็นเต็มจอ · คำขอที่รับ
 *    `text/html` จึงได้หน้าแจ้งเหตุภาษาไทย (`printPlaceholderHtml` ตัวเดียวกับหน้าต่างพิมพ์อื่น)
 *    ส่วนคำขอจาก `apiFetch` ได้ `{ error }` ตามรูปเดียวกับทั้งระบบ
 */
export function specPaperErrorResponse(req, message, status = 500) {
  const raw = String(message ?? '').trim();
  const text = GENERIC_MESSAGES[raw] || raw || 'เปิดเอกสารไม่สำเร็จ';
  const accept = req?.headers?.get?.('accept') || '';
  if (!/text\/html/i.test(accept)) return Response.json({ error: text }, { status });
  return new Response(printPlaceholderHtml({
    title: 'เปิดเอกสารรายละเอียดผลิตภัณฑ์ไม่ได้',
    message: text,
    tone: 'error',
    closeButton: true,
  }), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** แปลงคำตอบของ `loadScoped` (JSON) เป็นคำตอบของเราต์พิมพ์ — ข้อความเดิม สถานะเดิม */
export async function specPaperScopedErrorResponse(req, response) {
  let message = '';
  try {
    message = (await response.clone().json())?.error || '';
  } catch {
    message = '';
  }
  return specPaperErrorResponse(req, message, response.status || 500);
}
