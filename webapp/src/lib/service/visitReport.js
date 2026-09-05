// ── ใบส่งงาน: ระบบประกอบเอง (F-5) — logic ล้วน ────────────────────────────
//
// ⭐ **คำตอบสั้นที่สุดของ docs/service-field-operations.md**:
//   ข้อความ 20 บรรทัดที่เจ้าหน้าที่พิมพ์ส่ง LINE ทุกครั้ง คือใบส่งงานที่ระบบควรประกอบให้เอง
//   90% ของมันคือข้อมูลที่อยู่ในทะเบียนไซต์/เครื่องอยู่แล้ว ⇒ เจ้าหน้าที่กรอกแค่ **สิ่งที่เปลี่ยนวันนี้**
//
//   แกะใบจริง (Jim Thompson Outlet 93 · 01/08/69) ทีละบรรทัดแล้วได้ว่าเจ้าหน้าที่พิมพ์ซ้ำ:
//   วันที่ · ชื่อไซต์ · ชนิดงาน · ชื่อกลิ่น · จำนวนเครื่องแยกรุ่นแยกสี · ตำแหน่งเครื่อง ·
//   ช่วงเวลาที่ไซต์เปิด · ค่าตั้งเครื่อง — ทั้งหมดอยู่ในทะเบียนแล้ว
//
// ⚠️ และ **หัวหน้ามอนิเตอร์จาก "การถูกแท็กใน LINE"** (`@Ming @PHUWA …` ท้ายทุกใบ)
//    ⇒ ระบบต้องแทนที่ *กลไกนั้น* ไม่ใช่แค่มีหน้าให้เข้าไปดู · `reportFlags` คือชั้นที่
//    ตัดสินว่าใบไหนควรถูกดันขึ้นกระดิ่ง — **ดันเฉพาะใบที่ผิดปกติ** ถ้าดันทุกใบ
//    หัวหน้าจะปิดแจ้งเตือนภายในสัปดาห์เดียว (มติ 2026-08-02 ข้อ 10)
import { VISIT_KIND_LABELS } from './rounds';
import { VISIT_STATUS_LABELS } from './visitStatus';
import { ASSET_OUTCOME_LABELS } from './visitAssets';
import { ASSET_KIND_LABELS } from './assetKinds';
import { accessWindowText } from './sites';

/* ป้าย "ต้องดู" — เรียงตามที่หัวหน้าต้องรีบอ่านก่อน
   แต่ละอันมี `kind` ให้ฝั่งแจ้งเตือนเอาไปตัดสินว่าจะดันหรือไม่ โดยไม่ต้องอ่านข้อความ */
export function reportFlags({ visit, results = [], assetsById = new Map() } = {}) {
  if (!visit) return [];
  const name = (id) => assetsById.get(id)?.label || id;
  const flags = [];

  if (visit.status === 'unable') {
    flags.push({ kind: 'unable', tone: 'danger', label: 'ไปแล้วทำไม่ได้', detail: visit.unableReason || null });
  } else if (visit.status === 'partial') {
    flags.push({ kind: 'partial', tone: 'warning', label: 'ทำไม่ครบ', detail: null });
  }

  const swapped = results.filter((r) => r.outcome === 'swapped');
  if (swapped.length) {
    flags.push({
      kind: 'swap', tone: 'info',
      label: `เปลี่ยนเครื่อง ${swapped.length} ตัว`,
      detail: swapped.map((r) => `${name(r.assetId)} → ${name(r.replacedByAssetId)}`).join(' · '),
    });
  }

  const unable = results.filter((r) => r.outcome === 'unable');
  if (unable.length) {
    flags.push({
      kind: 'asset_unable', tone: 'warning',
      label: `ทำไม่ได้ ${unable.length} รายการ`,
      detail: unable.map((r) => `${name(r.assetId)}${r.reason ? ` — ${r.reason}` : ''}`).join(' · '),
    });
  }

  if (!visit.customerSignatureUrl) {
    flags.push({ kind: 'no_signature', tone: 'warning', label: 'ไม่มีลายเซ็นผู้รับงาน', detail: null });
  }
  if (!Array.isArray(visit.attachments) || visit.attachments.length === 0) {
    flags.push({ kind: 'no_photo', tone: 'warning', label: 'ไม่มีรูปหน้างาน', detail: null });
  }
  if (visit.actualTimeEdited) {
    flags.push({ kind: 'time_edited', tone: 'info', label: 'เวลาเข้าจริงถูกแก้ย้อนหลัง', detail: null });
  }

  return flags;
}

/* ใบปกติ = ไม่มีอะไรต้องดู ⇒ ไม่ดันขึ้นกระดิ่ง มาดึงเองที่ภาพรวม
   ⚠️ "ไม่มีลายเซ็น/รูป" นับเป็นสิ่งที่ต้องดู แต่ **ไม่บล็อกการปิดงาน** (มติ 2026-07-30)
   — สองเรื่องนี้คนละเรื่องกัน */
export const shouldPushReport = (flags = []) => flags.length > 0;

/* บรรทัดเดียวที่ใช้เป็นหัวข้อแจ้งเตือน — ต้องอ่านแล้วรู้เลยว่าต้องเปิดดูไหม
   (ไม่ใช่ "มีใบส่งงานใหม่" ซึ่งบอกอะไรไม่ได้เลย) */
export function reportHeadline({ visit, site, flags = [] } = {}) {
  if (!visit) return '';
  const where = site?.name || visit.siteId;
  const what = flags.map((f) => f.label).join(' · ');
  return what ? `${where} — ${what}` : `${where} — ส่งงานแล้ว`;
}

/* ⭐ ประกอบเนื้อใบจากทะเบียน — ทุกบรรทัดที่คืนจากที่นี่คือบรรทัดที่เจ้าหน้าที่ **ไม่ต้องพิมพ์**
   คืนเป็นโครงสร้าง ไม่ใช่ข้อความ เพื่อให้จอกับ PDF ใช้ชุดเดียวกันโดยจัดหน้าคนละแบบได้ */
export function buildVisitReport({
  visit, site, zones = [], assets = [], results = [], items = [], zoneGates = [],
} = {}) {
  if (!visit) return null;
  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const zonesById = new Map(zones.map((z) => [z.id, z]));
  /* ⭐ โซนที่ไม่ผ่านด่าน = **"งดบริการ"** บนใบส่งงาน (PR-C · มติผู้ใช้ 2026-08-27:
     *"จ่ายมา บาง SO ก็ไปเฉพาะที่ครอบคลุม SO นั้น"*)
     ⚠️ ผลด่านมาจาก server (`zoneGates`) ไม่ได้คิดที่นี่ — ตัวประเมินตัวเดียวกับที่
     ปฏิเสธจริง · ไม่ส่งมา = ไม่มีโซนไหนถูกงด (ใบเก่า/จอที่ยังไม่ส่งบริบท) */
  const blockedZone = new Map(
    (zoneGates || []).filter((z) => z.state === 'blocked').map((z) => [z.zoneId, z.reason || null]),
  );
  const resultByAsset = new Map(results.map((r) => [r.assetId, r]));

  const timeText = [visit.actualStartTime, visit.actualEndTime]
    .map((t) => (t ? String(t).slice(0, 5) : null))
    .filter(Boolean).join(' – ');

  const head = [
    { label: 'วันที่', value: visit.actualDate || visit.scheduledDate },
    { label: 'เวลา', value: timeText || null },
    { label: 'ไซต์', value: [site?.name, site?.routeZone].filter(Boolean).join(' · ') || visit.siteId },
    { label: 'ลูกค้า', value: site?.customerName || null },
    { label: 'งาน', value: VISIT_KIND_LABELS[visit.kind] || visit.kind },
    { label: 'เจ้าหน้าที่', value: visit.assigneeName || null },
    { label: 'ช่วงเวลาที่เข้าได้', value: accessWindowText(site) || null },
  ];

  /* รายการอุปกรณ์ — เฉพาะเครื่องที่ **นัดนี้แตะจริง** ไม่ใช่ทุกเครื่องในไซต์
     (เครื่องที่ถอดไปแล้วหรือยังไม่ถึงคิวไม่ควรอยู่ในใบที่ส่งให้ลูกค้าอ่าน) */
  const lines = assets
    .filter((a) => resultByAsset.has(a.id))
    .map((asset) => {
      const result = resultByAsset.get(asset.id);
      const used = items.filter((i) => i.assetId === asset.id);
      const zone = asset.zoneId ? zonesById.get(asset.zoneId) : null;
      const settings = asset.settings && typeof asset.settings === 'object' ? asset.settings : {};
      const spec = [
        ASSET_KIND_LABELS[asset.kind] || asset.kind,
        asset.model,
        asset.colour ? `(${asset.colour})` : null,
        asset.serial,
        settings.workSec && settings.pauseSec ? `${settings.workSec}/${settings.pauseSec}` : null,
        settings.grade || null,
      ].filter(Boolean).join(' · ');
      const suspended = asset.zoneId && blockedZone.has(asset.zoneId);
      return {
        assetId: asset.id,
        label: asset.label,
        where: [zone?.name, asset.floor, asset.spot].filter(Boolean).join(' · ') || null,
        /* งดบริการ — แถวยังอยู่บนใบ (เจ้าหน้าที่ต้องรู้ว่ามีเครื่องอยู่) แต่บอกว่าห้ามทำ
           และบอกเหตุ ไม่ใช่ซ่อนแถวทิ้งจนเหมือนไม่มีเครื่องตัวนั้น */
        suspended: !!suspended,
        suspendedReason: suspended ? (blockedZone.get(asset.zoneId) || 'โซนนี้ยังไม่ผ่านด่านสัญญา/การชำระ') : null,
        spec,
        outcome: result.outcome,
        outcomeLabel: ASSET_OUTCOME_LABELS[result.outcome] || result.outcome,
        reason: result.reason || null,
        replacedBy: result.replacedByAssetId ? (assetsById.get(result.replacedByAssetId)?.label || result.replacedByAssetId) : null,
        used: used.map((i) => ({ label: i.label, qty: i.qty, unit: i.unit })),
      };
    });

  // ของที่ใช้ที่ไม่ได้ผูกกับเครื่องไหน — ของกลางของไซต์ (น้ำยาเช็ด · ก้าน reed สำรอง)
  const sharedItems = items.filter((i) => !i.assetId || !assetsById.has(i.assetId));

  const flags = reportFlags({ visit, results, assetsById });

  return {
    code: visit.code || visit.id,
    statusLabel: VISIT_STATUS_LABELS[visit.status] || visit.status,
    status: visit.status,
    head,
    lines,
    sharedItems,
    summary: visit.summary || null,
    unableReason: visit.unableReason || null,
    attachments: Array.isArray(visit.attachments) ? visit.attachments : [],
    signatureUrl: visit.customerSignatureUrl || null,
    flags,
    // ⭐ สิ่งที่เจ้าหน้าที่พิมพ์เองมีแค่สองอย่าง — ที่เหลือระบบประกอบให้
    authored: ['summary', 'reason'],
  };
}
