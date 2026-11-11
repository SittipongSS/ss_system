// ── ใส่ราคาที่ทะเบียนกลิ่น/สูตร → ผูกเข้าแถวคำร้องที่รอราคาของตัวนั้นให้เลย (มติเจ้าของ 11/11/2026) — server only ──
//
// ⭐ เจ้าของ (ดูภาพแถว SOFT RELEASE #1): *"ทำไมต้องมี ใช้ราคานี้ ทั้งที่ราคาก็เพิ่งใส่"* → ตอบว่า "ใช้ราคานี้" มีไว้ให้ RD
//   ยืนยัน **ราคาเก่าที่ค้างอยู่** ก่อนผูก (ม-153) · เจ้าของรับ แล้วสั่งแก้ช่องโหว่: ใส่ราคา **ใหม่** จากแท็บกลิ่น/สูตร (หรือหน้าทะเบียน)
//   แล้วแถวคำร้องที่รอราคาของตัวนั้นยังต้องกด "ใช้ราคานี้" ซ้ำ ⇒ ราคาที่เพิ่งพิมพ์ = RD ยืนยันแล้วในตัว ไม่ต้องกดอีก
//
// ⭐ **ผูกเฉพาะแถวที่ "ใช้ราคานี้" จะเลือก rev ที่เพิ่งเขียน** — ตัวตัดสินเดียวกับปุ่ม (`currentPriceToUse` · ช่องหลัก FB > B > F
//   ที่พร้อมใช้) บนราคาสดหลังเขียน ⇒ ใส่แค่ F ให้สูตรที่มี FB เดิมอยู่ = ช่องหลักยังเป็น FB เก่า → แถวไม่ถูกแตะ (ยังต้องยืนยัน FB เก่า)
//   · ราคาเก่าที่ค้างอยู่ (ไม่ได้เพิ่งเขียน) ไม่ถูกผูกเอง — กติกา ม-153 ยังอยู่ครบ
// ⭐ จบแถวด้วยตัวเดียวกับทุกทาง (`settleRow` · ม-159: สูตรยังขาด Ingredient List = `recordRowPrice` ประทับไว้ แถวไปรอ Ingredient List)
// ⚠️ ด่านต่อใบ = ชุดเดียวกับขั้นราคาในคำร้อง: ฝ่าย RD · ใบเปิดอยู่ · คนกดตอบฝ่ายนี้ได้ (`canAnswerRequest`) · แถวรอราคา (`canPriceRow`)
import { fetchAll } from '@/lib/supabaseFetchAll';
import { findRequest } from '@/lib/materialPricesAdmin';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { canPriceRow } from '@/lib/requests/rowStage';
import { canAnswerRequest } from '@/lib/deptRequests';
import { currentPriceToUse } from '@/lib/master/priceSlots';
import { rowsSlotPricesLive } from '@/lib/master/scentFormulaAdmin';
import { INGREDIENT_LIST_LABEL, ingredientListMissing } from '@/lib/master/ingredientList';
import { recordRowPrice, settleRow } from '@/lib/requests/rowSettle';
import { appendUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';
import { fmtNumber } from '@/lib/format';

const DEPT = 'RD';

/**
 * แถวไหนจะผูก — `rows[i]` คู่กับ `live[i]` (ผลของ `rowsSlotPricesLive` หลังเขียนราคา)
 * คืน `[{ row, entry, waitIngredients }]` เฉพาะแถวที่ "ใช้ราคานี้" จะเลือก rev ใน `revisionIds` และราคาพร้อมใช้
 */
export function rowsToLink(rows = [], live = [], revisionIds = new Set()) {
  const out = [];
  (rows || []).forEach((row, i) => {
    if (!canPriceRow(row)) return;
    const { entry, blocker } = currentPriceToUse(live?.[i]?.current || []);
    if (!entry || blocker || !revisionIds.has(entry.price?.revisionId)) return;
    out.push({ row, entry, waitIngredients: ingredientListMissing(live[i]?.ingredient) });
  });
  return out;
}

/* แถวที่อาจได้รับผลจากราคาชุดนี้ — คัดหยาบก่อนอ่านทะเบียนสด (ตัดสินจริงที่ `rowsToLink`)
   · ช่องของสูตร (B/FB) → แถวที่ผลิตสูตรนั้น · ช่อง F ของกลิ่น → แถวกลิ่นล้วนของกลิ่นนั้น + แถวสูตรทุกแถว
     (F ของสูตรลงกลิ่นของ **สูตร** — รู้ได้ตอนอ่านสูตรสดเท่านั้น · แถวรอราคามีหลักหน่วย) */
export function mayBeAffected(row, { formulaIds, scentIds }) {
  if (row?.producedFormulaId && formulaIds.has(row.producedFormulaId)) return true;
  if (!scentIds.size) return false;
  return Boolean(row?.producedFormulaId) || scentIds.has(row?.producedScentId);
}

/**
 * @param written ผลของ `priceRegistrySlots` — `[{ slot, price, revision, source }]`
 * ตัวที่เหลือ (`audit` · `loadRequest` · `loadLive` · `settle` · `record` · `append`) = ตัวจริงเป็นค่าตั้งต้น ·
 * เทสต์ส่งตัวจำลองมาแทน (กติกาของรีโป: เทสต์ห้ามเขียนฐานจริง — AGENTS.md)
 * คืน `[{ requestId, docNo, itemId, waitIngredients }]`
 */
export async function linkRegistryPriceToWaitingRows(supabase, {
  written = [], user, request = null,
  audit = recordAudit, loadRequest = findRequest, loadLive = rowsSlotPricesLive,
  settle = settleRow, record = recordRowPrice, append = appendUpdate,
  now = () => new Date().toISOString(),
} = {}) {
  const revisionIds = new Set((written || []).map((w) => w?.revision?.id).filter(Boolean));
  if (!revisionIds.size) return [];
  const formulaIds = new Set(written.filter((w) => w.slot?.stampColumn === 'formulaId').map((w) => w.slot.id));
  const scentIds = new Set(written.filter((w) => w.slot?.stampColumn === 'scentId').map((w) => w.slot.id));

  // แถวที่ลูกค้าคอนเฟิร์มแล้ว ยังไม่มีราคา ยังไม่จบ (= ขั้น "รอใส่ราคา") — ไล่หน้า (ตารางโตตามธุรกรรม)
  const waiting = await fetchAll(() => supabase.from('dept_request_items')
    .select('id, "requestId", "producedFormulaId", "producedScentId"')
    .eq('outcome', 'confirmed')
    .is('answeredRevisionId', null)
    .not('answerStatus', 'in', '("done","declined")')
    .order('id'));
  const candidates = waiting.filter((r) => mayBeAffected(r, { formulaIds, scentIds }));
  const candidateIds = new Set(candidates.map((r) => r.id));
  const requestIds = [...new Set(candidates.map((r) => r.requestId))].sort();

  const linked = [];
  for (const requestId of requestIds) {
    const ask = await loadRequest(supabase, requestId);
    if (!ask || ask.dept !== DEPT || !REQUEST_OPEN_STATUSES.includes(ask.status) || !canAnswerRequest(user, ask)) continue;
    // แถวเต็มจากตัวโหลดใบ (รูปเดียวกับที่หน้า/ขั้นราคาเห็น) — ไม่ใช่สี่คอลัมน์ที่คัดหยาบมา
    const rows = (ask.items || []).filter((i) => candidateIds.has(i.id));
    if (!rows.length) continue;
    const links = rowsToLink(rows, await loadLive(supabase, rows), revisionIds);
    if (!links.length) continue;

    const nowIso = now();
    for (const { row, entry, waitIngredients } of links) {
      if (waitIngredients) await record(supabase, { itemId: row.id, revisionId: entry.price.revisionId, nowIso });
      else await settle(supabase, { id: requestId, itemId: row.id, revisionId: entry.price.revisionId, user, nowIso });
      linked.push({ requestId, docNo: ask.docNo || null, itemId: row.id, waitIngredients });
    }

    // ใบละหนึ่งบรรทัดเธรด + audit (แพตเทิร์นเดียวกับตัวเขียน Ingredient List)
    const { entry } = links[0];
    const target = entry.source?.code || entry.source?.name || 'ทะเบียน';
    const rev = entry.price.revisionNo != null ? ` (rev ${entry.price.revisionNo})` : '';
    const waitCount = links.filter((l) => l.waitIngredients).length;
    await append(supabase, {
      entityType: 'dept_request', entityId: requestId, kind: 'quoted',
      body: `ใส่ราคาที่ทะเบียน ${target} — ${entry.short} ${fmtNumber(entry.price.unitPrice)} ฿/กก.${rev} · ผูกเข้า ${links.length} รายการ`
        + (waitCount ? ` · รอ ${INGREDIENT_LIST_LABEL} ${waitCount} รายการ` : ''),
      user,
    }).catch(() => {});
    await audit({
      user, action: 'update', entityType: 'dept_request', entityId: requestId, request,
      before: { items: links.map((l) => l.row) },
      after: {
        items: links.map((l) => ({
          ...l.row, answeredRevisionId: l.entry.price.revisionId, answerStatus: l.waitIngredients ? l.row.answerStatus : 'done',
        })),
      },
      summary: `ผูกราคาที่ใส่จากทะเบียน ${target} เข้า ${links.length} รายการ (${ask.docNo || requestId})`,
    });
  }
  return linked;
}
