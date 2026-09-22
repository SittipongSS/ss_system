/* ── ผูก/ถอดลีดต้นทางของดีล — ฝั่งที่คุยกับฐาน ──────────────────────────────────
 *
 * กติกา (ใครผูกได้ · สถานะไหน · ลีดกลับไปไหนตอนถอด) อยู่ที่ `dealLeadLink.js` ที่เดียว
 * ไฟล์นี้แค่ลงมือตามกติกานั้น · คืน `{ error, status }` หรือ `{ data, status }` แบบเดียวกับ
 * `dealProjectLink` (lib ไม่รู้จัก HTTP — route แปลงเอง)
 *
 * ผู้เรียก:
 *   · POST /api/sales-planning/deals (เปิดดีลจากลีด / เลือกลีดในฟอร์มเพิ่มดีล) → `recordLeadDealOpened`
 *   · POST/DELETE /api/sales-planning/deals/[id]/link-lead (หน้าดีล + หน้าลีด) → `linkDealToLead` /
 *     `unlinkDealFromLead`
 *   · DELETE /api/sales-planning/deals/[id] (ลบดีล) → `releaseLeadAfterDealGone`
 *
 * ⚠️ **ไม่ตรวจสิทธิ์ระดับดีล** — ผู้เรียกต้องโหลดดีลด้วยขอบเขตแก้ของผู้ใช้มาแล้ว
 *    (`loadScoped(..., 'edit')` / `inSalesEditScope`) · ที่ตรวจในนี้คือฝั่งลีด
 * ⚠️ `audit` ฉีดได้ (ค่าตั้งต้น = recordAudit) — เทสต์ส่งตัวเก็บมาแทน ไม่งั้นเทสต์ที่รันพร้อม env
 *    ของเครื่อง dev จะเขียน audit_logs ลงฐานจริง (dev DB = prod DB)
 * ⚠️ ขั้นหลังเขียนดีลสำเร็จ **ห้ามตอบ error** — ดีลขยับไปแล้ว กดซ้ำจะชน 409 ⇒ ทุกอย่างที่พลาด
 *    หลังจากนั้นกลายเป็น `leadWarning` (อยู่ใน RESPONSE_WARNING_KEYS จอทักเองทุกทางเข้า)
 */
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { dealAuditLabel } from '@/lib/salesPlanning';
import { LEAD_STATUS_LABELS } from '@/lib/sales/leads';
import {
  LEAD_QUALIFY_EVENT_KINDS,
  canLinkLeadRole,
  latestQualifyEvent,
  dealLabelForLead,
  dealLeadLinkError,
  dealMetadataWithLead,
  dealMetadataWithoutLead,
  leadLabel,
  leadLinkError,
  leadLinkPatch,
  leadRevertStatus,
  leadUnlinkPatch,
} from '@/lib/sales/dealLeadLink';

const statusLabel = (status) => LEAD_STATUS_LABELS[status] || status;
const joinWarnings = (list) => list.filter(Boolean).join(' · ') || null;

/** โหลดลีดทั้งแถว — audit ต้องได้ `before` ครบทุกคอลัมน์
 *  (🐞 POST /deals เคยโหลด 5 คอลัมน์แล้วส่งเป็น before ⇒ `diffKeys` ใน audit นับทุกคอลัมน์ที่เหลือว่า "เปลี่ยน") */
export async function loadLeadForLink(supabase, leadId) {
  return supabase.from('sales_leads').select('*').eq('id', leadId).maybeSingle();
}

/**
 * ลีดได้ดีลเพิ่มหนึ่งใบ (ดีลใหม่จาก POST /deals หรือดีลเดิมที่เพิ่งผูก) —
 * ลีดที่ยังไม่ "เปิดลูกค้าแล้ว" ขยับเป็น qualified + audit · บันทึกเหตุการณ์ทุกครั้ง
 * (ลีด 1 ใบหลายดีล — เหตุการณ์ต่อดีล)
 *
 * @param via 'create' = เปิดดีลใหม่จากลีด (kind `create_deal`) · 'link' = ผูกดีลที่มีอยู่ (kind `link_deal`)
 * @returns {{ lead, warning }} `lead` = แถวหลังจบเส้นนี้ตามจริง · `warning` = ข้อความถึงผู้ใช้หรือ null
 *
 * ⚠️ อัปเดตแบบมีเงื่อนไข `.eq('status', สถานะที่ตรวจด่านไว้)` — ตีกลับ/ปิดลีดที่แทรกเข้ามา
 *    ระหว่างตรวจกับเขียนต้องไม่ถูกทับเงียบ ๆ (ท่าเดียวกับ cron ตีกลับอัตโนมัติ)
 * ⚠️ kind ในเหตุการณ์ต้องเป็นสตริงตรง ๆ ในบล็อก `.from('lead_events')` — leadEventKinds.test
 *    อ่านจากตรงนั้นเพื่อเทียบกับ CHECK ของตาราง (สร้าง object ไว้ก่อนแล้วส่งเข้าไป = เทสต์ตาบอด)
 */
export async function recordLeadDealOpened(supabase, { lead, deal, user, req = null, via = 'create', now = new Date().toISOString(), audit = recordAudit }) {
  const warnings = [];
  /* 🐞 ลีดที่โหลดมาตอน "เปิดลูกค้าแล้ว" = ไม่มีแพตช์ให้เขียน ⇒ ไม่มีเงื่อนไขสถานะคอยจับ ถ้าระหว่างนั้น
     มีคนถอด/ลบดีลใบสุดท้ายของลีด (นับได้ 0 แล้วย้อนสถานะ) ลีดจะค้างสถานะเปิดทั้งที่ดีลใบนี้เพิ่งผูก
     ⇒ อ่านสถานะสดอีกครั้งหลังเขียนดีลแล้ว ถ้าไม่ใช่ qualified แล้วก็ขยับใหม่จากสถานะที่เห็นจริง */
  let current = lead;
  if (lead.status === 'qualified') {
    const { data: fresh } = await loadLeadForLink(supabase, lead.id);
    if (fresh && fresh.status !== 'qualified') current = fresh;
  }
  let after = current;
  const patch = leadLinkPatch(current, now, deal);
  if (patch) {
    const { data: updated, error } = await supabase.from('sales_leads')
      .update(patch).eq('id', current.id).eq('status', current.status).select().maybeSingle();
    if (error || !updated) {
      const why = error?.message || `สถานะลีดเพิ่งเปลี่ยนไปจาก "${statusLabel(current.status)}" ระหว่างทำรายการ`;
      console.error(`[deal-lead ${deal.id}] เปลี่ยนลีด ${current.id} เป็น qualified ไม่สำเร็จ:`, why);
      warnings.push(`${via === 'link' ? 'ผูกดีลแล้ว' : 'สร้างดีลแล้ว'} แต่เปลี่ยนสถานะลีดต้นทางเป็น "${LEAD_STATUS_LABELS.qualified}" ไม่สำเร็จ: ${why} — ลีดยังค้างสถานะเดิม (ระบบอาจตีกลับอัตโนมัติ) แจ้งแอดมิน`);
    } else {
      after = updated;
      await audit({
        user, action: 'update', entityType: 'sales_lead', entityId: current.id,
        before: current, after: updated,
        summary: `ลีด ${statusLabel(current.status)} → ${LEAD_STATUS_LABELS.qualified} (${via === 'link' ? 'ผูกดีลย้อนหลัง' : 'สร้างดีล'} ${dealAuditLabel(deal)})`,
        request: req,
      });
    }
  }

  /* 🐞 เดิมเส้นนี้ล้มเงียบมาตลอดจน mig 0199 เพิ่ม 'create_deal' เข้า CHECK — insert ชน constraint แล้ว
     error ถูกทิ้ง · ตอนนี้อ่าน error เสมอ แต่ไม่ล้มทั้งคำขอ (ดีลเกิด/ผูกไปแล้ว) */
  /* ⭐ ทีม/ผู้รับผิดชอบในเหตุการณ์ = ค่า **ก่อนผูก** — ตอนถอดใช้คืนค่าให้ลีดที่ประทับผู้ดูแลดีลไว้
     (ดู leadLinkPatch · leadUnlinkPatch) · ลีดที่มีผู้รับอยู่แล้วค่านี้ก็คือผู้รับคนเดิม */
  const event = {
    id: genId('LEV'),
    leadId: current.id,
    fromStatus: current.status,
    toStatus: after.status,
    team: current.team || null,
    assigneeId: current.assigneeId || null,
    assigneeName: current.assigneeName || null,
    reason: dealLabelForLead(deal) || null,
    createdBy: user?.id || null,
    createdByName: user?.name || null,
    eventAt: now,
  };
  const { error: leadEventError } = via === 'link'
    ? await supabase.from('lead_events').insert({ ...event, kind: 'link_deal' })
    : await supabase.from('lead_events').insert({ ...event, kind: 'create_deal' });
  if (leadEventError) {
    console.error(`[deal-lead ${deal.id}] บันทึกเหตุการณ์ของลีด ${current.id} ไม่สำเร็จ:`, leadEventError.message);
    warnings.push(`บันทึกประวัติของลีดต้นทางไม่สำเร็จ: ${leadEventError.message}`);
  }
  return { lead: after, warning: joinWarnings(warnings) };
}

/**
 * ดีลหลุดจากลีดไปหนึ่งใบ (ถอด หรือ ลบดีล) — ลีดที่ **ไม่เหลือดีลแล้ว** กลับไปสถานะก่อนเปิดดีล
 * (มติผู้ใช้ 2026-09-22) · บันทึกเหตุการณ์ `unlink_deal` ทุกครั้ง
 *
 * ⚠️ ต้องเรียก **หลัง** ดีลหลุดจากลีดแล้วจริง (คอลัมน์ว่าง/แถวถูกลบ) — นับดีลที่เหลือจากฐาน
 * ⚠️ นับไม่ขึ้น/อ่านประวัติไม่ได้ ⇒ **ไม่เดา** · คงสถานะเดิมแล้วเตือน (ลีดค้าง "เปิดลูกค้าแล้ว"
 *    ดีกว่าย้อนผิดสถานะแล้วโดนตีกลับอัตโนมัติ)
 */
export async function releaseLeadAfterDealGone(supabase, { lead, deal, user, req = null, reason, now = new Date().toISOString(), audit = recordAudit }) {
  const warnings = [];
  let after = lead;
  const { count, error: countError } = await supabase
    .from('sales_deals').select('id', { count: 'exact', head: true }).eq('leadId', lead.id);
  if (countError) {
    console.error(`[deal-lead ${deal.id}] นับดีลที่เหลือของลีด ${lead.id} ไม่สำเร็จ:`, countError.message);
    warnings.push(`ตรวจไม่ได้ว่าลีดต้นทางยังเหลือดีลอื่นไหม (${countError.message}) — ลีดคงสถานะเดิม แจ้งแอดมินถ้าต้องย้อนสถานะ`);
  } else if ((count || 0) === 0 && lead.status === 'qualified') {
    const { data: events, error: eventsError } = await supabase
      .from('lead_events').select('kind, fromStatus, toStatus, team, assigneeId, assigneeName, createdAt')
      .eq('leadId', lead.id).in('kind', LEAD_QUALIFY_EVENT_KINDS)
      .order('createdAt', { ascending: false }).limit(50);
    if (eventsError) {
      warnings.push(`อ่านประวัติลีดต้นทางไม่สำเร็จ (${eventsError.message}) — ลีดคงสถานะ "${LEAD_STATUS_LABELS.qualified}" แจ้งแอดมินถ้าต้องย้อนสถานะ`);
    } else {
      const target = leadRevertStatus(events, lead);
      const patch = leadUnlinkPatch(target, now, latestQualifyEvent(events));
      const { data: reverted, error: revertError } = await supabase.from('sales_leads')
        .update(patch).eq('id', lead.id).eq('status', 'qualified').select().maybeSingle();
      if (revertError || !reverted) {
        const why = revertError?.message || 'สถานะลีดเพิ่งเปลี่ยนระหว่างทำรายการ';
        console.error(`[deal-lead ${deal.id}] ย้อนสถานะลีด ${lead.id} ไม่สำเร็จ:`, why);
        warnings.push(`ย้อนสถานะลีดต้นทางกลับเป็น "${statusLabel(target)}" ไม่สำเร็จ: ${why}`);
      } else {
        after = reverted;
        /* 🐞 นับแล้วย้อน = สองจังหวะ · ถ้ามีคนผูกดีลใหม่เข้าลีดใบนี้แทรกระหว่างนั้น ลีดจะค้างสถานะเปิด
           ทั้งที่มีดีลผูกอยู่ ⇒ นับซ้ำหลังย้อน เจอดีลแล้วคืนค่าทุกช่องที่เพิ่งเขียน (มีเงื่อนไขสถานะ) */
        const { count: recount, error: recountError } = await supabase
          .from('sales_deals').select('id', { count: 'exact', head: true }).eq('leadId', lead.id);
        if (recountError) console.error(`[deal-lead ${deal.id}] นับดีลซ้ำหลังย้อนสถานะลีด ${lead.id} ไม่สำเร็จ:`, recountError.message);
        if (!recountError && (recount || 0) > 0) {
          const restore = Object.fromEntries(Object.keys(patch).map((key) => [key, lead[key] ?? null]));
          restore.updatedAt = now;
          const { data: restored } = await supabase.from('sales_leads')
            .update(restore).eq('id', lead.id).eq('status', target).select().maybeSingle();
          if (restored) after = restored;
          else warnings.push(`ลีดต้นทางมีดีลใหม่ผูกเข้ามาระหว่างย้อนสถานะ — ตรวจสถานะลีดอีกครั้ง (ควรเป็น "${LEAD_STATUS_LABELS.qualified}")`);
        } else {
          await audit({
            user, action: 'update', entityType: 'sales_lead', entityId: lead.id,
            before: lead, after: reverted,
            summary: `ลีด ${LEAD_STATUS_LABELS.qualified} → ${statusLabel(target)} (ไม่เหลือดีลหลัง${reason})`,
            request: req,
          });
        }
      }
    }
  }

  const { error: leadEventError } = await supabase.from('lead_events').insert({
    id: genId('LEV'),
    leadId: lead.id,
    kind: 'unlink_deal',
    fromStatus: lead.status,
    toStatus: after.status,
    reason,
    createdBy: user?.id || null,
    createdByName: user?.name || null,
    eventAt: now,
  });
  if (leadEventError) {
    console.error(`[deal-lead ${deal.id}] บันทึกเหตุการณ์ถอดดีลของลีด ${lead.id} ไม่สำเร็จ:`, leadEventError.message);
    warnings.push(`บันทึกประวัติของลีดต้นทางไม่สำเร็จ: ${leadEventError.message}`);
  }
  return { lead: after, warning: joinWarnings(warnings) };
}

/** ผูกดีลที่มีอยู่เข้ากับลีด — เนื้อในของ POST /deals/[id]/link-lead */
export async function linkDealToLead(supabase, { deal, leadId, user, req = null, audit = recordAudit }) {
  const id = String(leadId || '').trim();
  if (!id) return { error: 'ต้องระบุลีดที่จะผูก (leadId)', status: 400 };
  const { data: lead, error: leadError } = await loadLeadForLink(supabase, id);
  if (leadError) return { error: leadError.message, status: 500 };
  const denied = dealLeadLinkError({ user, deal, lead });
  if (denied) return { error: denied.message, status: denied.status };

  const now = new Date().toISOString();
  /* คอลัมน์ + กระจก metadata.leadId ในคำสั่งเดียว (สองความจริงในแถวเดียวคือสิ่งที่ sourceLeadIdOf กันไว้)
     ⚠️ `.is('leadId', null)` = กันกดพร้อมกันสองจอ (ท่าเดียวกับ link-project) */
  const { data: updated, error: updateError } = await supabase.from('sales_deals')
    .update({ leadId: lead.id, metadata: dealMetadataWithLead(deal.metadata, lead), updatedAt: now })
    .eq('id', deal.id).is('leadId', null).select().maybeSingle();
  if (updateError) return { error: updateError.message, status: 500 };
  if (!updated) return { error: 'ดีลนี้เพิ่งถูกผูกลีดไปแล้ว — โหลดหน้าใหม่แล้วตรวจอีกครั้ง', status: 409 };

  await audit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id,
    before: deal, after: updated,
    summary: `ผูกลีดต้นทาง ${leadLabel(lead)} กับดีล ${dealAuditLabel(updated)} (ย้อนหลัง)`,
    request: req,
  });

  const opened = await recordLeadDealOpened(supabase, { lead, deal: updated, user, req, via: 'link', now, audit });
  return {
    data: { deal: updated, lead: opened.lead, ...(opened.warning ? { leadWarning: opened.warning } : {}) },
    status: 200,
  };
}

/** ถอดลีดต้นทางออกจากดีล — เนื้อในของ DELETE /deals/[id]/link-lead
 *  ⚠️ ด่านฝั่งลีดใช้ตัวเดียวกับตอนผูก (ไม่ตรวจสถานะ) — เจ้าของดีลห้ามย้อนสถานะลีดที่ไม่ใช่งานของตัวเอง */
export async function unlinkDealFromLead(supabase, { deal, user, req = null, audit = recordAudit }) {
  if (!deal.leadId) return { error: 'ดีลนี้ยังไม่ได้ผูกลีดต้นทาง', status: 409 };
  if (!canLinkLeadRole(user?.role)) {
    return { error: 'ถอดลีดต้นทางได้เฉพาะ AE · Senior AE · AE Supervisor และแอดมิน', status: 403 };
  }
  const { data: lead, error: leadError } = await loadLeadForLink(supabase, deal.leadId);
  if (leadError) return { error: leadError.message, status: 500 };
  // FK เป็น ON DELETE SET NULL ⇒ ลีดหายแต่คอลัมน์ยังชี้อยู่แทบไม่มีทาง · เจอเมื่อไรให้ถอดได้ (ไม่มีลีดให้ย้อน)
  if (lead) {
    const denied = leadLinkError({ user, lead, forUnlink: true });
    if (denied) return { error: denied.message, status: denied.status };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase.from('sales_deals')
    .update({ leadId: null, metadata: dealMetadataWithoutLead(deal.metadata), updatedAt: now })
    .eq('id', deal.id).eq('leadId', deal.leadId).select().maybeSingle();
  if (updateError) return { error: updateError.message, status: 500 };
  if (!updated) return { error: 'ลีดต้นทางของดีลนี้เพิ่งถูกเปลี่ยน — โหลดหน้าใหม่แล้วตรวจอีกครั้ง', status: 409 };

  await audit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id,
    before: deal, after: updated,
    summary: `ถอดลีดต้นทาง ${lead ? leadLabel(lead) : deal.leadId} ออกจากดีล ${dealAuditLabel(updated)}`,
    request: req,
  });

  let leadAfter = null;
  let warning = null;
  if (lead) {
    const released = await releaseLeadAfterDealGone(supabase, {
      lead, deal: updated, user, req, now, audit, reason: `ถอดดีล ${dealLabelForLead(updated)}`,
    });
    leadAfter = released.lead;
    warning = released.warning;
  }
  return {
    data: { deal: updated, lead: leadAfter, ...(warning ? { leadWarning: warning } : {}) },
    status: 200,
  };
}
