// แก้บรรทัดต้นทุนในใบขอราคาผลิต (mig 0159) — ผูกวัสดุ / กรัมต่อชิ้น / ชั้นราคา
//
// สามอย่างนี้เป็นของ "บรรทัด" ไม่ใช่ของราคา จึงเป็นสิทธิ์ของฝ่ายขายเจ้าของใบ:
//   materialId    บรรทัดผูกวัสดุตัวไหนในทะเบียน (แทนการเทียบชื่อ — บั๊ก 4)
//   gramsPerUnit  แม่แบบให้มาแค่ค่าตั้งต้น แก้ได้ตลอด (บั๊ก 3)
//   priceTierQty  ชั้นราคาที่เลือกใช้ — จำนวนวัสดุ ≠ จำนวนสินค้า เซลตัดสินเอง (มติ 2)
//
// ผูกวัสดุที่มีราคาสดอยู่แล้ว = เติมราคาให้ทันทีในก้าวเดียว (ไม่ต้องไปกดดึงอีกที)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditCostingRequest } from '@/lib/costing';
import { componentFillFromRevision, componentLibraryStatus } from '@/lib/costingLibrary';
import { findCostingRequest } from '@/lib/costingAdmin';
import { MATERIAL_KINDS, canQuoteMaterial } from '@/lib/materialPrices';
import { ensureMaterial, findMaterial, loadMaterials } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// ตัวเลขบวก หรือ null (ช่องว่าง = ล้างค่า) — คืน { value, error }
function positiveOrNull(raw, label) {
  if (raw == null || raw === '') return { value: null, error: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { value: null, error: `${label}ต้องเป็นตัวเลขมากกว่า 0` };
  return { value: n, error: null };
}

// PATCH { componentId, materialId?, newMaterialLabel?, pmType?, gramsPerUnit?, priceTierQty? }
// ส่งเฉพาะ key ที่อยากแก้ — key ที่ไม่ส่งมาไม่ถูกแตะ
export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canEditCostingRequest(user, before)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้ใบนี้ หรือใบจบแล้ว' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const component = (before.items || [])
    .flatMap((i) => i.components || []).find((c) => c.id === body.componentId);
  if (!component) return Response.json({ error: 'ไม่พบบรรทัดที่ระบุ' }, { status: 404 });
  if (!component.sourceDept) {
    return Response.json({ error: 'บรรทัดค่าดำเนินการคิดภายใน ไม่ต้องผูกวัสดุ' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const patch = { updatedAt: nowIso };
  const notes = [];

  try {
    // ── 1) ผูกวัสดุ ──────────────────────────────────────────────────────
    let linkedMaterial = null;
    const wantsNew = String(body.newMaterialLabel ?? '').trim();
    if (wantsNew) {
      if (!MATERIAL_KINDS.includes(component.kind)) {
        return Response.json({ error: 'บรรทัดนี้ไม่ใช่วัสดุที่ขึ้นทะเบียนได้' }, { status: 400 });
      }
      // เซลเสนอได้แต่ตัววัสดุ (ร่าง) — คนใส่ราคายังเป็น RD/PC เสมอ
      const { material } = await ensureMaterial(supabase, {
        kind: component.kind,
        label: wantsNew,
        pmType: body.pmType || null,
        customerId: before.customerId || null,
        customerName: before.customerName || null,
        status: canQuoteMaterial(user, component.kind) ? 'active' : 'draft',
        user,
      });
      linkedMaterial = material;
    } else if ('materialId' in body) {
      if (!body.materialId) {
        // ปลดการผูก = ล้างราคา snapshot ด้วย ไม่งั้นเหลือตัวเลขลอยที่ตามรอยกลับไม่ได้
        patch.materialId = null;
        patch.materialRevisionId = null;
        patch.priceTierQty = null;
        patch.pricePerKg = null;
        patch.pricePerUnit = null;
        patch.priceStatus = 'pending';
        notes.push('ปลดการผูกวัสดุ');
      } else {
        linkedMaterial = await findMaterial(supabase, body.materialId);
        if (!linkedMaterial) return Response.json({ error: 'ไม่พบวัสดุในทะเบียน' }, { status: 404 });
        if (linkedMaterial.kind !== component.kind) {
          return Response.json({
            error: `วัสดุตัวนี้เป็นชนิดอื่น — บรรทัดนี้ต้องเป็น ${component.kind}`,
          }, { status: 400 });
        }
        if (linkedMaterial.status === 'archived') {
          return Response.json({ error: 'วัสดุตัวนี้ถูกเก็บเข้ากรุแล้ว' }, { status: 409 });
        }
        // ราคาทับรายลูกค้าของ "ลูกค้าอื่น" ไม่ใช่ราคาของงานนี้
        if (linkedMaterial.customerId && linkedMaterial.customerId !== (before.customerId || null)) {
          return Response.json({
            error: 'วัสดุตัวนี้เป็นราคาเฉพาะของลูกค้ารายอื่น',
          }, { status: 400 });
        }
      }
    }

    if (linkedMaterial) {
      const changed = linkedMaterial.id !== component.materialId;
      patch.materialId = linkedMaterial.id;
      if (changed) {
        // เปลี่ยนวัสดุ = ราคาเดิมไม่ใช่ของวัสดุตัวนี้แล้ว ต้องล้างก่อนเสมอ
        patch.materialRevisionId = null;
        patch.pricePerKg = null;
        patch.pricePerUnit = null;
        patch.priceStatus = 'pending';
        notes.push(`ผูกวัสดุ "${linkedMaterial.label}"`);
      }
    }

    // ── 2) กรัม/ชิ้น (per_kg เท่านั้น — per_piece ไม่ใช้กรัมในสูตรต้นทุน) ──
    if ('gramsPerUnit' in body) {
      if (component.unitBasis !== 'per_kg') {
        return Response.json({ error: 'บรรทัดคิดเป็นบาท/ชิ้น ไม่ต้องระบุกรัม' }, { status: 400 });
      }
      const { value, error } = positiveOrNull(body.gramsPerUnit, 'กรัมต่อชิ้น');
      if (error) return Response.json({ error }, { status: 400 });
      patch.gramsPerUnit = value;
      notes.push(value == null ? 'ล้างกรัม/ชิ้น' : `กรัม/ชิ้น = ${value}`);
    }

    // ── 3) ชั้นราคาที่เลือกใช้ ────────────────────────────────────────────
    if ('priceTierQty' in body) {
      const { value, error } = positiveOrNull(body.priceTierQty, 'จำนวนของชั้นราคา');
      if (error) return Response.json({ error }, { status: 400 });
      patch.priceTierQty = value;
      notes.push(value == null ? 'ใช้ราคาชั้นตั้งต้น' : `ใช้ราคาชั้น ${value}`);
    }

    // ── 4) มีราคาสดอยู่แล้ว = เติมให้เลยในก้าวเดียว ───────────────────────
    const materialId = patch.materialId !== undefined ? patch.materialId : component.materialId;
    const tierQty = patch.priceTierQty !== undefined ? patch.priceTierQty : component.priceTierQty;
    // เติมเมื่อบรรทัดยังไม่มีราคา (เพิ่งผูก/เพิ่งล้าง) หรือเมื่อเซลเปลี่ยนชั้นราคา —
    // ไม่แตะ snapshot ที่นิ่งอยู่แล้ว (ใบตรึงตัวเลขของตัวเองไว้ มติ 2)
    const priceCleared = patch.priceStatus === 'pending' || component.priceStatus !== 'quoted';
    let filled = false;
    let tierBelow = false;
    if (materialId && (priceCleared || 'priceTierQty' in body)) {
      const materials = await loadMaterials(supabase, { status: null });
      const probe = { ...component, materialId, priceTierQty: tierQty };
      const state = componentLibraryStatus(probe, materials, { todayIso: nowIso.slice(0, 10) });
      if (state.status === 'ready') {
        const fill = componentFillFromRevision(state.revision, { tierQty });
        if (fill) {
          Object.assign(patch, fill, {
            quotedById: user?.id ?? null,
            quotedByName: user?.name ?? null,
            quotedAt: nowIso,
          });
          filled = true;
          tierBelow = state.tierBelow;
        }
      }
    }

    const { error } = await supabase.from('costing_item_components').update(patch).eq('id', component.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const after = await findCostingRequest(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
      summary: `แก้บรรทัด "${component.label}" ในใบ ${after.docNo || id}`
        + (notes.length ? ` — ${notes.join(' · ')}` : '')
        + (filled ? ' (เติมราคาจากทะเบียนให้แล้ว)' : ''),
      request,
    });
    return Response.json({ ...after, _filled: filled, _tierBelow: tierBelow });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
