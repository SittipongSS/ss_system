// ── ยกเลิกใบเสนอราคา — กติกาล้วน ไม่แตะฐาน (มติเจ้าของ 24/09) ─────────────────────────
//
// ⭐ มติ "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" — **เพิ่ม** ทางทิ้งใบให้ผู้อนุมัติ ไม่ถอนสิทธิ์ใคร
//   ด่านว่าใคร/ใบไหนยกเลิกได้อยู่ที่ `canCancelQuotation` (quotationWorkflow.js) ที่เดียว
// ⭐ ไฟล์นี้ตอบสองคำถามให้ตรงกันเสมอ:
//   1. โมดัลบอกอะไรก่อนกด (กติกาโมดัลอนุมัติ #1223 — ต้องบอกผลลัพธ์ ไม่ใช่ "แน่ใจหรือไม่")
//   2. route ทำอะไรจริงหลังกด (quotationCancelRepo.js อ่านกติกาชุดเดียวกันจากที่นี่)
// ⚠️ จอ import ไฟล์นี้ ⇒ ห้าม import ของฝั่ง server (supabase/audit/notifications)
import { fmtMoney } from '@/lib/format';
import { IRREVERSIBLE_NOTE } from '@/lib/approvalPrompt';
import { isWonStage } from '@/lib/salesPlanning';
import { isLiveSalesOrder } from '@/lib/sales/handoffQueue';
import { requestAssignee } from '@/lib/requests/assign';
import { contractFollowsQuotationClosure } from '@/lib/sales/contractQuotationState';

/* เหตุที่ส่งเข้าตัวคิด FC — "ดูแลตัวชี้" ไม่ใช่ "ขึ้นบันได" (ดู CLAIMING_CAUSES ใน forecastSource.js)
   ⇒ ดีลที่ยังกรอกยอดเองอยู่ไม่ถูกลากไปเดินตามใบอื่นเพราะมีคนยกเลิกใบ */
export const QUOTATION_CANCEL_CAUSE = 'quotation_cancelled';

/* ดีลไหนไม่คิด FC ใหม่ตอนยกเลิกใบ
   ⭐ Lost (มติ 24/09) — ดีล Lost อยู่นอกคิว "FC ไม่ตรงใบเสนอราคา" (forecast-review กรองออก) ⇒ ไม่มีใครมา
     แก้ให้ถ้าคิดผิด และการเขียน projectValue ใหม่ = แก้ประวัติยอดที่เสียไปย้อนหลัง ⇒ โมดัลบอก "FC ไม่เปลี่ยน"
   ⭐ Won — FC แช่แข็งตั้งแต่ปิดดีล (0284) resolver ก็ไม่แตะอยู่แล้ว · บอกเหตุให้ตรง */
export function cancelForecastSkip(deal) {
  if (deal?.stage === 'lost') return 'lost';
  if (isWonStage(deal?.stage)) return 'won';
  return null;
}

/* บันทึกการยกเลิกบนใบ — แพตเทิร์นเดียวกับ metadata.unaccept · merge ทีละคีย์ ไม่ทับทั้งก้อน
   ⚠️ approvalStatus ไม่ถูกแตะ (เก็บเป็นประวัติว่าใบตายตอนอยู่ขั้นไหน) ⇒ จดไว้ที่นี่ด้วยให้อ่านได้ตรง ๆ */
export function quotationCancelMetadata(quote, { reason, user, at }) {
  return {
    ...(quote?.metadata || {}),
    cancel: {
      reason,
      by: user?.id || null,
      byName: user?.name || null,
      byRole: user?.role || null,
      at,
      fromStatus: quote?.status || null,
      fromApprovalStatus: quote?.approvalStatus || null,
    },
  };
}

/* ด่านเดียวของการยกเลิกใบนอกจากสิทธิ์ — ใบสั่งขายที่ยังใช้อยู่บนใบนี้
   ⭐ ไม่ควรเกิดได้ (ออก SO ต้องรับใบก่อน · ย้อนการรับต้องไม่มี SO ที่ยังใช้อยู่ — 0380) แต่ถ้ามี = ยอด Actual
     ห้อยอยู่กับใบที่กำลังจะตาย ⇒ กันไว้ บอกทางออกตรง ๆ แทนที่จะปล่อยให้ข้อมูลขัดกันเงียบ ๆ
   ⚠️ ใช้ `isLiveSalesOrder` (ไม่ยกเลิก · ไม่ถูกแทนด้วย Rev.) ตัวเดียวกับด่านของ 0169/0380 */
export function quotationCancelBlock({ orders = [] } = {}) {
  const live = (orders || []).filter(isLiveSalesOrder);
  if (!live.length) return '';
  const list = live.map((row) => row.orderNumber || row.id).join(', ');
  return `ใบนี้มีใบสั่งขายที่ยังใช้อยู่ (${list}) — ยกเลิกใบสั่งขายที่หน้า SO ก่อน จึงจะยกเลิกใบเสนอราคาได้`;
}

/* ใบที่ยกเลิกไม่ได้ — บอกทางที่ถูกแทน ไม่ใช่แค่ "ไม่ได้" (route ตอบ 400 ด้วยข้อความนี้)
   ⚠️ ด่านจริงคือ `isCancellableQuotation` — ที่นี่แค่เลือกคำอธิบายให้ตรงกับเหตุ */
export function quotationCancelStateError(quote) {
  switch (quote?.status) {
    case 'cancelled': return 'ใบเสนอราคานี้ถูกยกเลิกไปแล้ว';
    case 'accepted': return 'ใบนี้ลูกค้ารับแล้ว (Won) — ใช้ “ย้อนการรับ” ก่อน แล้วจึงยกเลิกใบได้';
    case 'revised': return 'ใบนี้มีฉบับแก้ไขใหม่แล้ว — ยกเลิกที่ฉบับล่าสุดแทน';
    case 'closed': return 'ใบนี้ถูกปิดแล้ว (ดีลจบด้วยใบเสนอราคาฉบับอื่น) — ยกเลิกไม่ได้';
    default:
      return quote?.approvalStatus === 'not_submitted'
        ? 'ร่างที่ยังไม่เคยยื่นอนุมัติ — ใช้ “ลบใบเสนอราคา” แทนการยกเลิก'
        : 'ใบเสนอราคานี้ยกเลิกไม่ได้ในสถานะปัจจุบัน';
  }
}

const uniqueText = (values) => [...new Set((values || [])
  .map((value) => String(value ?? '').trim())
  .filter(Boolean))];

/* คำร้องที่อ้างใบนี้และต้องรู้ว่าใบถูกยกเลิก (มติ 24/09: **เตือน + แจ้ง ไม่บล็อก**)
   ⭐ ต้องแจ้ง = คำร้องที่ยังเดินอยู่ (FN อาจกำลังออกใบกำกับจากใบที่ตายแล้ว) **หรือ** มีเลขเอกสารการเงิน
     ออกไปแล้ว (0258 `docNumber` — ใบวางบิล/ใบกำกับ/ใบเสร็จใน Express ที่ระบบนี้ยกเลิกแทนไม่ได้)
     แม้คำร้องจะปิดไปแล้วก็ตาม
   ⭐ ผู้รับ = ผู้ขอ + ผู้รับผิดชอบ (`requestAssignee` — มอบหมายแล้ว หรือคนที่กดรับเรื่อง) · ไม่แจ้ง "ทั้งฝ่าย"
     (มติ 14) · ไม่เด้งใส่คนกดยกเลิกเอง
   ⚠️ ใบที่ยังไม่มีใครรับเรื่องมีแค่ผู้ขอ — FN จะเห็นแถวในเธรดเมื่อเปิดใบ
   ⭐ `revisions` = ทุกฉบับของเลขเดียวกัน (มติ 24/09 · รอบแก้หลังรีวิว) — คำร้องผูกอยู่กับฉบับที่ยื่นตอนนั้น
     (ออก Rev. ไม่ย้ายคำร้องตาม) ⇒ แต่ละแถวบอกเลขที่ฉบับที่คำร้องอ้าง ให้โมดัล/เธรดบอกได้ว่า IV ที่ออกแล้ว
     อ้าง -0 ทั้งที่กดยกเลิก -1 */
export function requestsToNotifyOnCancel(requests = [], items = [], { actorId = null, revisions = [] } = {}) {
  const actor = actorId ? String(actorId) : null;
  const numberByQuotation = new Map((revisions || [])
    .filter((row) => row?.id)
    .map((row) => [row.id, row.quoteNumber || null]));
  const numbersByRequest = new Map();
  for (const item of items || []) {
    if (!item?.requestId) continue;
    const list = numbersByRequest.get(item.requestId) || [];
    list.push(item.docNumber);
    numbersByRequest.set(item.requestId, list);
  }
  return (requests || [])
    .map((request) => ({ request, docNumbers: uniqueText(numbersByRequest.get(request.id)) }))
    .filter(({ request, docNumbers }) => !['closed', 'cancelled'].includes(request.status) || docNumbers.length > 0)
    .map(({ request, docNumbers }) => ({
      id: request.id,
      docNo: request.docNo || null,
      kind: request.kind || null,
      status: request.status || null,
      title: request.title || null,
      quotationId: request.quotationId || null,
      quoteNumber: numberByQuotation.get(request.quotationId) || null,
      docNumbers,
      recipientIds: uniqueText([request.requestedById, requestAssignee(request).id])
        .filter((id) => id !== actor),
    }));
}

/* ── พรีวิวที่ส่งให้โมดัล (POST /cancel?dryRun=1) ──────────────────────────────────────────
   @param forecast   ผลของ `previewForecastSource` (null = ข้ามเพราะดีล Lost/Won)
   @param quotations ใบทั้งหมดของดีล — ใช้หาเลขที่ของใบที่ FC จะเดินตามต่อ
   @param requests   ผลของ `requestsToNotifyOnCancel` */
export function buildQuotationCancelPreview({
  quote, deal, forecast = null, quotations = [], contracts = [], requests = [], orders = [],
} = {}) {
  const skipped = cancelForecastSkip(deal);
  const before = Number(deal?.projectValue ?? 0);
  const changed = !skipped && Boolean(forecast?.changed);
  const followId = changed && forecast?.resolved?.source === 'quotation' ? forecast.resolved.quotationId : null;
  const liveContracts = (contracts || []).filter((row) => row?.status !== 'cancelled');
  return {
    quoteNumber: quote?.quoteNumber || '',
    fromApprovalStatus: quote?.approvalStatus || null,
    blocked: quotationCancelBlock({ orders }),
    forecast: {
      skipped,
      changed,
      before,
      after: changed ? Number(forecast.value ?? before) : before,
      reason: skipped ? null : (forecast?.reason || null),
      pinCleared: changed && Boolean(forecast?.resolved?.pinCleared),
      followQuoteNumber: followId
        ? ((quotations || []).find((row) => row.id === followId)?.quoteNumber || null)
        : null,
    },
    contracts: {
      drafts: liveContracts.filter(contractFollowsQuotationClosure).length,
      kept: liveContracts
        .filter((row) => !contractFollowsQuotationClosure(row))
        .map((row) => ({ id: row.id, contractNo: row.contractNo || null, status: row.status || null })),
    },
    requests: (requests || []).map((row) => ({
      id: row.id, docNo: row.docNo || null, status: row.status || null, docNumbers: row.docNumbers || [],
      quoteNumber: row.quoteNumber || null,
    })),
    cancelledOrders: (orders || [])
      .filter((row) => row?.status === 'cancelled')
      .map((row) => ({ id: row.id, orderNumber: row.orderNumber || null })),
  };
}

function forecastLine(forecast) {
  if (forecast?.skipped === 'lost') return 'FC ไม่เปลี่ยน (ดีล Lost — ไม่คิดยอดใหม่ ประวัติยอดที่เสียคงเดิม)';
  if (forecast?.skipped === 'won') return 'FC ไม่เปลี่ยน (ดีลปิด Won แล้ว — ยอดมาจากใบสั่งขาย)';
  if (!forecast?.changed) return 'FC ไม่เปลี่ยน';
  const tail = forecast.followQuoteNumber
    ? ` (เดินตาม ${forecast.followQuoteNumber})`
    : forecast.reason === 'pointer_gone' ? ' (กลับไปใช้ยอดที่กรอกเอง)' : '';
  const pin = forecast.pinCleared ? ' · ปลดการปักใบที่ถูกยกเลิก' : '';
  return `FC ของดีล ${fmtMoney(forecast.before)} → ${fmtMoney(forecast.after)}${tail}${pin}`;
}

/* ข้อความในกล่องผลลัพธ์ของโมดัล — รูปเดียวกับ approvalPrompt (คำเตือนย้อนไม่ได้ขึ้นบรรทัดแรก) */
export function quotationCancelPromptDetail(preview) {
  const lines = [];
  if (preview?.fromApprovalStatus === 'pending') {
    lines.push('คำขออนุมัติที่ค้างอยู่ปิดไปพร้อมใบ — ไม่ต้องตีกลับก่อน');
  }
  lines.push(forecastLine(preview?.forecast));
  const drafts = preview?.contracts?.drafts || 0;
  const kept = preview?.contracts?.kept || [];
  if (drafts || kept.length) {
    const parts = [];
    if (drafts) parts.push(`ร่างสัญญา ${drafts} ใบถูกยกเลิกตาม`);
    if (kept.length) {
      parts.push(`สัญญาที่ออกเลข/ลงนามแล้ว ${kept.length} ใบ (${kept.map((row) => row.contractNo || row.id).join(', ')}) ยังมีผล — ระบบแจ้งเจ้าของสัญญา`);
    }
    lines.push(parts.join(' · '));
  }
  const requests = preview?.requests || [];
  if (requests.length) {
    const numbers = [...new Set(requests.flatMap((row) => row.docNumbers || []))];
    const issued = numbers.length ? ` (เลขที่ ${numbers.join(', ')} ออกแล้ว)` : '';
    // ยกเลิกฉบับล่าสุด = ทั้งเลขที่ตาย ⇒ คำร้องบนฉบับก่อนหน้านับด้วย และต้องบอกว่าฉบับไหน (มติ 24/09)
    const earlier = uniqueText(requests
      .map((row) => row.quoteNumber)
      .filter((number) => number && number !== preview?.quoteNumber));
    const scope = earlier.length ? ` รวมฉบับก่อนหน้า (${earlier.join(', ')})` : '';
    lines.push(`คำร้อง ${requests.length} ใบอ้างใบนี้${scope}${issued} — ระบบแจ้งผู้ขอและผู้รับผิดชอบให้ตรวจ ไม่ยกเลิกเอกสารให้`);
  }
  const orders = preview?.cancelledOrders || [];
  if (orders.length) {
    lines.push(`ใบสั่งขายที่ยกเลิกไปแล้วของใบนี้ (${orders.map((row) => row.orderNumber || row.id).join(', ')}) กู้คืนไม่ได้อีก`);
  }
  lines.push('สถานะดีลไม่เปลี่ยน · เลขที่ใบไม่นำกลับมาใช้ · พิมพ์ซ้ำได้พร้อมลายน้ำ “ยกเลิก”');
  return [`⚠️ ${IRREVERSIBLE_NOTE}`, '', 'สิ่งที่จะเกิดขึ้นทันที:', ...lines.map((line) => `· ${line}`)].join('\n');
}

/* ข้อความแถวเธรด (quiet) + กระดิ่งของคำร้องที่อ้างใบ — คนอ่านคือผู้ขอ/FN ที่ถือคำร้อง ไม่ใช่คนกดยกเลิก
   ⭐ คำร้องบนฉบับก่อนหน้า (มติ 24/09 · รอบแก้หลังรีวิว) ต้องบอกทั้งฉบับที่คำร้องอ้างและฉบับที่ถูกยกเลิก —
     "ใบ -1 ถูกยกเลิก" บนคำร้องที่อ้าง -0 อ่านแล้วนึกว่าไม่เกี่ยว ทั้งที่ -0 ออก Rev./ใช้ต่อไม่ได้แล้ว
   ⚠️ ไม่รู้เลขที่ฉบับ (ไม่ได้ส่ง revisions) = ถือว่าอ้างใบนี้ */
export function quotationCancelRequestNote(quote, request, reason) {
  const docNumbers = request?.docNumbers || [];
  const issued = docNumbers.length
    ? ` · เอกสารการเงินที่ออกแล้ว ${docNumbers.join(', ')} ระบบไม่ยกเลิกให้ — ตรวจแล้วจัดการใน Express เอง`
    : '';
  const cancelled = quote?.quoteNumber || '';
  const referenced = request?.quoteNumber || null;
  const head = referenced && referenced !== cancelled
    ? `คำร้องนี้อ้าง ${referenced} — ฉบับล่าสุดของเลขเดียวกัน (${cancelled}) ถูกยกเลิก ใช้เลขที่นี้ต่อไม่ได้แล้ว`
    : `ใบเสนอราคา ${cancelled} ที่คำร้องนี้อ้างถูกยกเลิก`;
  return `${head} — ${reason}${issued}`;
}

/* toast หลังกด — บอกยอด FC ที่ขยับ **จริง** (ผลของการเขียน ไม่ใช่พรีวิว) · FC เขียนไม่ผ่านต้องไม่เงียบ */
export function quotationCancelToast(quoteNumber, forecast) {
  const head = `ยกเลิกใบเสนอราคา ${quoteNumber} แล้ว`;
  if (!forecast) return head;
  if (forecast.warning) return `${head} · FC ยังไม่ขยับ: ${forecast.warning}`;
  if (!forecast.changed) return `${head} · FC ไม่เปลี่ยน`;
  return `${head} · FC ${fmtMoney(forecast.previousValue)} → ${fmtMoney(forecast.value)}`;
}
