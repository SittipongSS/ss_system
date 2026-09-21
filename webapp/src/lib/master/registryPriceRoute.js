// ── ปุ่ม "ใส่ราคา" บนทะเบียนกลิ่น/สูตร — handler กลางของสอง route ─────────
//
// ⭐ ที่มา (มติผู้ใช้ 2026-08-10): ทะเบียนวัสดุเหลือบรรจุภัณฑ์ (PM) อย่างเดียว
// รอต่อโมดูลจัดซื้อ · ราคา RM (F/FB) จัดการที่ทะเบียนกลิ่น/สูตรโดยตรง
// แต่ **ที่เก็บยังเป็น material_prices เหมือนเดิม** (มติ #1117: ทะเบียนแสดงราคา
// จากที่นั่น ไม่เก็บสำเนา — สองแหล่งขัดกันเองคือโรคที่จ่ายค่าเรียนมาแล้ว)
//
// ก่อนหน้านี้ทางเข้าราคา RM มีทางเดียว: ขั้นใส่ราคาบนคำร้องสายพัฒนา ⇒ กลิ่นที่
// "เพิ่มเอง" เข้าทะเบียน (ของจริงตอนนี้ทั้ง 43 ตัว) ไม่มีทางใส่ราคาเลย —
// route นี้คือทางที่สอง และทั้งสองทางเรียก `priceRegistryEntry` ก้อนเดียวกัน
//
// สองทะเบียนต่างกันแค่: ตัวโหลด · ด่านสถานะ · ชนิดวัสดุ/คอลัมน์ประทับ · ชื่อ entity
// ⇒ เป็น factory ตัวเดียว สอง route เรียก (เขียนสองสำเนาเมื่อไรเพี้ยนหากัน)
import { recordAudit } from '@/lib/audit';
import { canQuoteMaterial } from '@/lib/materialPrices';
import { priceRegistrySlots } from '@/lib/materialPricesAdmin';
import { PRICE_SLOTS, mainPriceEntry, normalizeSlotPrices } from '@/lib/master/priceSlots';

// ⚠️ ไม่ import '@/lib/http' — helpers ที่นั่นลาก authUser → next/headers ซึ่ง
// ตายใต้ node --test · ไฟล์นี้ต้อง unit test ได้ จึงสร้าง Response ตรง ๆ
// (รูปแบบ payload เดียวกับ http.js เป๊ะ: { error } + status)
const fail = (error, status) => Response.json({ error }, { status });

// POST { prices: { F?, B?, FB? }, validUntil?, note? } (ทางเข้าเก่า `{ price }` = ช่องหลัก)
// ราคาเดียวต่อช่อง ฿/กก. (ไม่มีชั้นจำนวน — มติผู้ใช้ 2026-08-03) · ออกเป็น rev ใหม่เสมอ แก้ราคา = ต่อ rev ไม่ใช่ทับ
// ⭐ ม-148 (มติผู้ใช้ 2026-09-22): **สูตรใส่ได้ F · B · FB · กลิ่นใส่ได้ F** — ช่องมาจาก `slotsOf(row)`
//   (ตัวเดียวกับโมดัล) · F ของสูตรลงที่กลิ่นของสูตรนั้น ⇒ ต้องโหลดกลิ่นมาตรวจสถานะด้วย (`findOther`)
export function makeRegistryPriceHandler({
  kind,          // ช่องเดียว (ทางเดิม): 'RM_F' | 'RM_FB' — ไม่ส่ง `slotsOf` มา = ช่องเดียวของตัวมันเอง
  stampColumn,   // 'scentId' | 'formulaId' (คู่กับ `kind`)
  slotsOf = null, // (row) => [{ ...PRICE_SLOTS[k], id }] — ช่องที่ทะเบียนนี้เปิดให้ใส่
  findOther = null, // (supabase, slot) => { source, error } — แหล่งของช่องที่ไม่ใช่ตัวมันเอง
  entityType,    // 'scent' | 'formula'
  entityLabel,   // 'กลิ่น' | 'สูตร'
  find,          // (supabase, id) => แถวทะเบียน
  usableError,   // (row) => ข้อความเมื่อสถานะยังใส่ราคาไม่ได้ | null
}) {
  const selfSlot = Object.values(PRICE_SLOTS).find((s) => s.kind === kind) || null;
  const slotsFor = slotsOf || ((row) => (selfSlot ? [{ ...selfSlot, stampColumn, id: row.id }] : []));
  return async ({ user, supabase, req, ctx }) => {
    if (!user) return fail('unauthorized', 401);
    // สิทธิ์เดียวกับการตอบราคาในสายคำร้อง: ฝ่ายเจ้าของ RM คือ RD (admin แทนได้)
    if (!canQuoteMaterial(user, kind || 'RM_F')) {
      return fail(`ใส่ราคา ${entityLabel} ได้เฉพาะฝ่าย RD`, 403);
    }
    const { id } = await ctx.params;

    let row;
    try {
      row = await find(supabase, id);
    } catch (e) {
      return fail(e.message, 500);
    }
    if (!row) return fail(`ไม่พบ${entityLabel}`, 404);

    const statusError = usableError(row);
    if (statusError) return fail(statusError, 400);

    const body = await req.json().catch(() => ({}));
    const { entries, error: priceError } = normalizeSlotPrices(slotsFor(row), body);
    if (priceError) return fail(priceError, 400);

    try {
      const written = await priceRegistrySlots(supabase, {
        entries,
        // ช่องของตัวมันเองใช้แถวที่ตรวจสถานะแล้วข้างบน · ช่องที่ลงทะเบียนอื่น (F ของสูตร → กลิ่น) ให้ผู้เรียกโหลด+ตรวจ
        loadSource: async (slot) => (slot.id === row.id
          ? { source: row }
          : (findOther ? findOther(supabase, slot) : { source: null, error: `ใส่${slot.text}ที่นี่ไม่ได้` })),
        validUntil: body.validUntil || null,
        note: body.note || null,
        user,
      });
      const { revision, price } = mainPriceEntry(written);

      // ประวัติราคา = ตัว rev ใน material_prices เอง (immutable อยู่แล้ว) —
      // ไม่เขียนเธรด: กลิ่น/สูตรไม่มี kind ราคาในทะเบียนเธรด และหน้ารายละเอียด
      // ไม่มี UI เธรด · audit ด้านล่างเก็บว่าใครกดเมื่อไร
      await recordAudit({
        user,
        action: 'update',
        entityType,
        entityId: row.id,
        after: {
          priceRevisionId: revision.id,
          price,
          prices: Object.fromEntries(written.map((w) => [w.slot.key, { price: w.price, revisionId: w.revision.id }])),
        },
        summary: `ใส่ราคา ${written.map((w) => w.slot.short).join('/')} ${entityLabel} ${row.code || row.name}`
          + ` — rev ${written.map((w) => `${w.slot.short} ${w.revision.revisionNo}`).join(' · ')}`,
        request: req,
      });

      return Response.json({
        ok: true,
        revisionId: revision.id,
        revisionNo: revision.revisionNo,
        revisions: written.map((w) => ({ key: w.slot.key, revisionId: w.revision.id, revisionNo: w.revision.revisionNo })),
      });
    } catch (e) {
      return fail(e.message, e.status || 400);
    }
  };
}
