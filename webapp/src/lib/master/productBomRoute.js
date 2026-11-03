// ── POST /api/products/[id]/bom — ปุ่มทุกปุ่มของขั้นลง BOM (มติเจ้าของ 03/11/2026 · mig 0419) ─────────
//
// body: `{ action, reason?, bomCode?, note? }` · action = send | pullback (ฝั่งขาย) · accept | return | done | reopen (RD)
//
// ⭐ **ไม่ผ่าน PATCH สินค้า** — PATCH ทุกครั้งที่ค่าเปลี่ยนจะดึงสินค้ากลับไปรออนุมัติ (resetApprovalOnEdit)
//    ปุ่ม BOM ไม่ใช่การแก้สเปค ⇒ เขียนเฉพาะคอลัมน์ `bom*` ที่นี่ที่เดียว
// ⚠️ เขียนแบบ CAS (`bomStatus` ต้องยังเป็นค่าที่อ่านมา) — RD สองคนกดรับพร้อมกัน / SA ดึงกลับขณะ RD กดรับ
//    = คนช้าได้ 409 พร้อมเหตุ ไม่ใช่ทับกันเงียบ ๆ
// ⚠️ ตัวเขียน audit/เธรด/กระดิ่ง/ทะเบียนผู้ใช้ **รับเป็นพารามิเตอร์** — เทสต์ห้ามแตะฐานจริง (AGENTS.md)
import { canAccessRd, canEditRecord, isRdRole } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/master/updates';
import { notifyUsers } from '@/lib/notifications';
import { loadUserDirectory } from '@/lib/usersRepo';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { loadProductFormulaRows } from '@/lib/master/giftSetFormulasStore';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { productDisplayName } from '@/lib/master/productIdentity';
import {
  BOM_ACTIONS, BOM_COLUMNS, BOM_STATUS_META, BOM_TRANSITIONS,
  bomActionPatch, bomStatusOf, bomThreadEvent, bomTransitionError, hasBomStep,
} from '@/lib/master/productBom';

/* ⚠️ ไม่ import จาก `@/lib/http` — ไฟล์นั้นลาก `authUser` → `next/headers` เข้ามา ซึ่งเทสต์ใต้ Node ตรง ๆ โหลดไม่ได้
   (ท่าเดียวกับ registryPriceRoute.js) · route ห่อด้วย `withUser` ฝั่งตัวเองอยู่แล้ว */
const fail = (error, status = 400) => Response.json({ error }, { status });
const ok = (data) => Response.json(data);

const ACTION_LABEL = {
  send: 'ส่ง RD ลง BOM', pullback: 'ดึงเรื่อง BOM กลับ', accept: 'รับเรื่องลง BOM',
  return: 'ตีกลับเรื่องลง BOM', done: 'ลง BOM เสร็จ', reopen: 'ย้อนสถานะ BOM',
};

const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row?.[k] ?? null]));
const fgOf = (product) => String(product?.fgCode || '').trim() || 'สินค้า';

/**
 * ใครต้องรู้ + ข้อความ — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 * ⭐ ส่งใหม่ = **RD ทุกคน** (มติข้อ 9: ใครในฝ่ายก็รับได้ ⇒ ทุกคนคือคนที่ต้องลงมือต่อ — ไม่ใช่ "ทั้งฝ่ายเผื่อไว้")
 * ⭐ ผลของ RD (ตีกลับ · เสร็จ) กลับไปหา **คนที่กดส่ง** — คนที่ต้องแก้/ต้องรู้ว่าไปต่อได้
 *    รับเรื่อง/ย้อน/ดึงกลับ ไม่เด้ง: ไม่มีใครต้องลงมือเพราะมัน (ยังอ่านได้ในเธรดของสินค้า)
 */
export function bomNotice(action, product, { directory = null, actorId = null } = {}) {
  const actor = actorId != null ? String(actorId) : null;
  const without = (ids) => [...new Set(ids.filter((id) => id && String(id) !== actor).map(String))];
  const name = productDisplayName(product);
  const customer = String(product?.customerName || '').trim();
  if (action === 'send') {
    const rd = [...(directory?.values?.() || [])].filter((u) => u && !u.disabled && isRdRole(u.role)).map((u) => u.id);
    const userIds = without(rd);
    if (!userIds.length) return null;
    const round = Number(product?.bomRound) || 0;
    return {
      userIds,
      title: `${round > 1 ? 'ส่งลง BOM อีกครั้ง' : 'รอลง BOM'} · ${fgOf(product)}`,
      body: [name, customer].filter(Boolean).join(' — ') || null,
      href: '/rd/bom',
    };
  }
  const sender = product?.bomSentBy ? String(product.bomSentBy) : null;
  if (!sender || sender === actor) return null;
  if (action === 'return') {
    return { userIds: [sender], title: `RD ตีกลับเรื่องลง BOM · ${fgOf(product)}`, body: product.bomReturnReason || null };
  }
  if (action === 'done') {
    return {
      userIds: [sender],
      title: `ลง BOM แล้ว · ${fgOf(product)}`,
      body: [product.bomCode ? `รหัส BOM ${product.bomCode}` : null, name].filter(Boolean).join(' — ') || null,
    };
  }
  return null;
}

export function makeProductBomHandler({
  audit = recordAudit,
  append = appendUpdate,
  notify = notifyUsers,
  loadDirectory = loadUserDirectory,
  caretakerTeams = productCaretakerTeams,
  loadGiftSetRows = loadProductFormulaRows,
} = {}) {
  return async ({ user, supabase, req, ctx }) => {
    if (!user) return fail('unauthorized', 401);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (!BOM_ACTIONS.includes(action)) return fail('ไม่รู้จักคำสั่งนี้', 400);

    const { data: product, error: findErr } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
    if (findErr) return fail(findErr.message, 500);
    if (!product) return fail('ไม่พบสินค้าชิ้นนี้', 404);
    if (!hasBomStep(product)) return fail('สินค้ากลุ่มนี้ไม่มีขั้นลง BOM', 400);

    /* สิทธิ์ตามฝั่ง — ฝั่งขาย = ทีมที่แก้สินค้านี้ได้ (ด่านเดียวกับ PATCH) · ฝั่ง RD = คนของโมดูล RD (ด่านเดียวกับเมนู/คิว) */
    if (BOM_TRANSITIONS[action].side === 'sales') {
      let teams;
      try {
        teams = await caretakerTeams(product, supabase);
      } catch (e) {
        return fail(e?.message || 'อ่านทีมที่ดูแลลูกค้าไม่สำเร็จ', 500);
      }
      if (!canEditRecord(user, 'products', product, teams)) {
        return fail('ส่ง/ดึงกลับได้เฉพาะทีมที่ดูแลลูกค้าของสินค้านี้', 403);
      }
    } else if (!canAccessRd(user)) {
      return fail('ปุ่มนี้เป็นของฝ่าย RD', 403);
    }

    // ทางเดินสถานะ = ชนกับคนที่กดก่อน ⇒ 409 (จอดึงใหม่) · ข้อมูลไม่ครบ/เหตุผลว่าง = 400
    const transition = bomTransitionError(action, product);
    if (transition) return fail(transition, 409);

    let formulaComponents = [];
    if (action === 'send' && isGiftSetCategory(product.categoryCode)) {
      try {
        formulaComponents = await loadGiftSetRows(supabase, id);
      } catch (e) {
        return fail(e?.message || 'อ่านสูตรในชุดไม่สำเร็จ', 500);
      }
    }
    const plan = bomActionPatch(action, product, {
      user, reason: body.reason, bomCode: body.bomCode, note: body.note, formulaComponents,
    });
    if (plan.error) return fail(plan.error, 400);

    let query = supabase.from('products').update(plan.patch).eq('id', id);
    query = plan.from == null ? query.is('bomStatus', null) : query.eq('bomStatus', plan.from);
    const { data: saved, error: saveErr } = await query.select().maybeSingle();
    if (saveErr) return fail(saveErr.message, 500);
    if (!saved) {
      return fail(`มีคนเปลี่ยนสถานะ BOM ไปก่อนแล้ว — โหลดหน้าใหม่ (ที่หน้าจอเห็น: ${BOM_STATUS_META[bomStatusOf(product) || 'none'].label})`, 409);
    }

    // เธรดของสินค้า = ประวัติของทุกรอบ (คอลัมน์เก็บแค่รอบล่าสุด) · ไม่เช็ค error โดยเจตนา (สัญญาของ appendUpdate)
    const event = bomThreadEvent(action, product, plan.patch);
    if (event) {
      await append(supabase, {
        entityType: 'product', entityId: id, ...event,
        meta: { from: plan.from, to: plan.to, round: saved.bomRound ?? null },
        user,
      });
    }
    await audit({
      user, action: 'update', entityType: 'product', entityId: id,
      before: product, after: saved,
      summary: `${ACTION_LABEL[action]} ${fgOf(saved)}${saved.bomCode && action === 'done' ? ` (รหัส BOM ${saved.bomCode})` : ''}`,
      request: req,
    });

    let directory = null;
    if (action === 'send') {
      try { directory = await loadDirectory(supabase); } catch { directory = null; }
    }
    const notice = bomNotice(action, saved, { directory, actorId: user.id });
    if (notice) {
      await notify(supabase, {
        ...notice, entityType: 'product', entityId: id, kind: `bom_${action}`, actorName: user.name || null,
      });
    }
    // ⚠️ คืนเฉพาะช่อง BOM — แถวเต็มมีราคาผลิต ซึ่ง RD ไม่มีสิทธิ์เห็น (redactProductMargin)
    return ok({ id, ...pick(saved, BOM_COLUMNS) });
  };
}
