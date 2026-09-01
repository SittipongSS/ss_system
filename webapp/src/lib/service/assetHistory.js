// ── ประวัติของเครื่องหนึ่งตัว (เฟส 4 · จอ asset) ─────────────────────────
//
// ⭐ ของเดิม "เปลี่ยนเครื่อง" เป็นข้อความในช่องหมายเหตุ ⇒ ทะเบียนเพี้ยนตั้งแต่เดือนแรก
//   F-4 ทำให้มันเข้าทะเบียนจริงแล้ว (ตัวเก่า removed · ตัวใหม่ installed) — ที่ยังขาด
//   คือจอที่เอาร่องรอยพวกนั้นมาเรียงให้อ่านเป็นเรื่องเดียว
//
// ⚠️ **ไม่มีตาราง event ที่เขียนคู่ขนาน** โดยเจตนา — ประวัติประกอบจากของที่มีอยู่แล้ว
//   (visit_assets + visit_items) ตารางที่ต้องเขียนคู่ขนานกับตารางพวกนั้นคือตาราง
//   ที่จะไม่ตรงกับความจริงภายในเดือนเดียว
//
// ⭐ `service_asset_moves` (mig 0335) **ไม่ใช่ของคู่ขนาน** — มันเป็น *ทางเขียนเดียว*
//   ของคำสั่งย้าย/เปลี่ยนสถานะ แล้ว `siteId`/`status` บนตัวเครื่องกลายเป็นภาพสรุป
//   ของแถวล่าสุด ⇒ เดินหนีกันไม่ได้ · ก่อนมีมันประวัติการย้ายไม่มีที่เก็บเลย
//   (`installedAt`/`removedAt` มีคู่เดียวต่อเครื่อง ⇒ ย้ายรอบสองทับรอบแรกทิ้ง)
import { fmtPercent } from '@/lib/format';
import { ASSET_OUTCOME_LABELS } from './visitAssets';
import { isAssetOnSite } from './sites';
import { MOVE_LABELS } from './assetMoves';

/* เหตุการณ์ของเครื่อง เรียงใหม่สุดก่อน
   รับ: asset · results (แถวผลรายเครื่องที่แตะเครื่องนี้ ทั้งเป็นตัวหลักและตัวแทน)
        · items (ของที่ใช้กับเครื่องนี้) · visits · assetsById (ไว้แปลง id เป็นชื่อ) */
export function assetTimeline({ asset, results = [], items = [], visits = [], moves = [], assetsById = new Map() } = {}) {
  if (!asset) return [];
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const itemsByVisit = new Map();
  for (const item of items) {
    const list = itemsByVisit.get(item.visitId) || [];
    list.push(item);
    itemsByVisit.set(item.visitId, list);
  }

  const rows = [];

  for (const result of results) {
    const visit = visitById.get(result.visitId);
    const date = visit?.actualDate || visit?.scheduledDate || null;
    const used = (itemsByVisit.get(result.visitId) || [])
      .map((i) => `${i.label}${i.qty != null ? ` ${i.qty}${i.unit ? ` ${i.unit}` : ''}` : ''}`)
      .join(' · ');

    /* เครื่องนี้ **ถูกเอาไปแทนเครื่องอื่น** — คนละเรื่องกับ "เครื่องนี้ถูกเปลี่ยน"
       ทั้งสองแบบเป็นประวัติของมันเหมือนกัน แต่ต้องอ่านออกว่าอันไหนคืออันไหน */
    const isReplacement = result.replacedByAssetId === asset.id && result.assetId !== asset.id;
    rows.push({
      key: result.id,
      date,
      visitId: result.visitId,
      kind: isReplacement ? 'installed_as_replacement' : result.outcome,
      label: isReplacement
        ? `เอามาแทน ${assetsById.get(result.assetId)?.label || result.assetId}`
        : ASSET_OUTCOME_LABELS[result.outcome] || result.outcome,
      detail: isReplacement ? null : result.reason || null,
      replacedBy: result.outcome === 'swapped' && !isReplacement
        ? assetsById.get(result.replacedByAssetId)?.label || result.replacedByAssetId
        : null,
      used: used || null,
    });
  }

  /* คำสั่งย้าย/เปลี่ยนสถานะ (mig 0335) — เก็บได้หลายรอบ ต่างจาก installedAt/removedAt
     ที่มีคู่เดียวต่อเครื่อง ⇒ เครื่องที่ย้ายสามไซต์เล่าครบทั้งสามรอบ */
  for (const move of moves) {
    const to = move.toSiteName || null;
    const from = move.fromSiteName || null;
    rows.push({
      key: `move-${move.id}`,
      date: move.movedAt,
      kind: `move_${move.kind}`,
      label: MOVE_LABELS[move.kind] || move.kind,
      // เล่าเป็น "จากไหนไปไหน" ไม่ใช่แค่ปลายทาง — ไม่งั้นอ่านไม่ออกว่าย้ายมาจากที่ใด
      detail: [
        move.kind === 'transfer' && from && to ? `${from} → ${to}` : (to || from),
        move.reason,
      ].filter(Boolean).join(' · ') || null,
      used: null,
      by: move.createdByName || null,
    });
  }

  /* ⚠️ สองแถวนี้เหลือไว้สำหรับเครื่องที่ **เกิดก่อน mig 0335** (ไม่มีแถว move เลย)
     ⇒ ประวัติเก่ายังอ่านได้ · เครื่องที่มี move แล้วไม่ต้องขึ้นซ้ำ */
  if (!moves.length) {
    if (asset.installedAt) {
      rows.push({ key: `installed-${asset.id}`, date: asset.installedAt, kind: 'installed', label: 'ติดตั้งที่หน้างาน', detail: null, used: null });
    }
    if (asset.removedAt) {
      rows.push({ key: `removed-${asset.id}`, date: asset.removedAt, kind: 'removed', label: 'ถอดออกจากหน้างาน', detail: null, used: null });
    }
  }

  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/* ── เทียบการใช้กับเครื่องอื่นในโซนเดียวกัน ────────────────────────────
   ⭐ ม็อกเรียกว่า "เตือนเมื่อค่าตั้งกับการใช้จริงไม่ตรงกัน" — เครื่องสองตัวที่ตั้ง
   ต่างกันในโซนเดียวกันมักไม่ได้ตั้งใจ แต่ไม่มีใครเห็นเพราะค่าตั้งอยู่ในรูปถ่าย
   ⚠️ **บอกว่าต่าง ไม่บอกว่าผิด** — ตั้งใจให้ต่างกันก็มี (เครื่องหน้าประตูต้องแรงกว่า) */
export function settingOutlier(asset, zoneAssets = []) {
  const work = Number(asset?.settings?.workSec);
  const pause = Number(asset?.settings?.pauseSec);
  if (!Number.isFinite(work) || !Number.isFinite(pause) || work <= 0 || pause <= 0) return null;
  const duty = work / (work + pause);          // สัดส่วนเวลาที่เครื่องพ่นจริง

  const peers = zoneAssets
    // mig 0332: ไม่เอาเครื่องในคลัง (ค่าตั้งค้างจากไซต์เก่า) มาเฉลี่ยเทียบเพื่อนโซน
    .filter((a) => a.id !== asset.id && isAssetOnSite(a))
    .map((a) => {
      const w = Number(a?.settings?.workSec);
      const p = Number(a?.settings?.pauseSec);
      if (!Number.isFinite(w) || !Number.isFinite(p) || w <= 0 || p <= 0) return null;
      return { asset: a, duty: w / (w + p) };
    })
    .filter(Boolean);
  if (!peers.length) return null;

  const avg = peers.reduce((sum, p) => sum + p.duty, 0) / peers.length;
  if (avg <= 0) return null;
  // เก็บ **ค่าดิบไม่ปัด** — ด่าน 20% ข้างล่างเป็นตรรกะ ต้องเทียบตัวเลข ไม่ใช่สตริง
  // ที่จัดรูปแล้ว · ตัวเลขบนจอจึงจัดรูปตอนพิมพ์ด้วย fmtPercent (2 ตำแหน่ง) แทน
  const pct = (duty / avg - 1) * 100;
  if (Math.abs(pct) < 20) return null;         // ต่างน้อยกว่า 20% = ยังอยู่ในช่วงปกติ
  return {
    pct,
    peers: peers.length,
    text: pct > 0
      ? `เครื่องนี้พ่นถี่กว่าเครื่องอื่นในโซนเดียวกัน ${fmtPercent(pct)}`
      : `เครื่องนี้พ่นน้อยกว่าเครื่องอื่นในโซนเดียวกัน ${fmtPercent(Math.abs(pct))}`,
  };
}

/* ข้อความค่าตั้งแบบอ่านออก — 30/225 อ่านเป็น "พ่น 30 วินาที พัก 3 นาที 45 วินาที" */
export function settingText(settings = {}) {
  const work = Number(settings?.workSec);
  const pause = Number(settings?.pauseSec);
  if (!Number.isFinite(work) || !Number.isFinite(pause)) return null;
  const mins = Math.floor(pause / 60);
  const secs = pause % 60;
  const pauseText = mins ? `${mins} นาที${secs ? ` ${secs} วินาที` : ''}` : `${secs} วินาที`;
  return `พ่น ${work} วินาที · พัก ${pauseText}`;
}
