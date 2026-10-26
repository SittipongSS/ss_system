// ── ตัวกรองของคิวคำร้อง — ตัวตัดสินเดียวของ "ใบนี้ผ่านไหม" ให้ทั้งตารางและทุกตัวเลข ──
//
// 🐞 ตรวจตัวเลข 20/10/2026 (M1–M5) — คิวคำร้องมีตัวกรองสี่ชั้นซ้อนกัน (ตัวเลขบนแถบ · คำค้น ·
// แผงกรอง · แท็บ) แต่ตัวเลขแต่ละตัวนับจากชั้นไม่เหมือนตาราง:
//   · ตัวเลือกในแผงกรอง ("Anan (2)") นับทั้งแท็บ ไม่สนลูกค้าที่ติ๊กอยู่ ⇒ ติ๊กแล้วได้ 1 ใบ
//   · แถบตัวเลข ("เลยกำหนด 2") นับก่อนคำค้นและแผงกรอง ⇒ กดแล้วตารางขึ้น 1 ใบ
//   · เลขบนแท็บนับทั้งแท็บ ขณะที่คำค้น/ตัวกรองค้างข้ามแท็บ ⇒ กดแท็บแล้วได้น้อยกว่าเลข
// ⇒ ไฟล์นี้เป็นที่เดียวที่ตอบว่า "ใบนี้ผ่านตัวกรองไหม" — ตาราง (`RequestQueuePanel`) · แถบตัวเลข ·
//    เลขบนแท็บ/ชิปฝ่าย · ตัวเลือกในแผงกรอง เรียก `passesQueueFilters` ตัวเดียวกัน ต่างกันแค่ `except`
//
// ⭐ **นับแบบแยกมิติ (faceted)** — ทรงเดียวกับ `lib/sales/leadListFilter.js`: ตัวเลขของมิติหนึ่งคิดจาก
// ใบที่ผ่าน *ทุกชั้นยกเว้นมิตินั้น* ⇒ ติ๊ก RD อยู่ ตัวเลือก PC ยังโชว์จำนวนของตัวเอง (ติ๊กเพิ่มได้)
// ส่วนตัวเลือกมิติอื่นนับเฉพาะใบที่ผ่านแล้ว = ตรงกับตารางที่จะเห็นจริงเมื่อติ๊ก
//
// ⚠️ ไฟล์ล้วน ไม่มี "use client" — `useQueueBoard.js` เป็นไฟล์จอ (import `useResponsiveView`)
//    ⇒ `matchesQueueSearch` ย้ายมาอยู่ที่นี่ แล้วฮุกส่งต่อ (re-export) ให้ผู้เรียกเดิม
import { requestKindLabelFull } from '@/lib/master/requestTypes';
import { requestPriceSummary } from '@/lib/requests/rowPrices';
import { matchesQueueCount, queueCounts } from '@/lib/requests/queueBoard';
import { FACET_NONE, requestFacet } from '@/lib/requests/queueList';

// ── ค้นหาในคิว — logic ล้วน ทดสอบได้โดยไม่ต้องมีจอ ────────────────────────
//
// ⚠️ **ค้นจากสิ่งที่ตาเห็นในตาราง** (เลขที่ · เรื่อง · ลูกค้า · ชนิด · ฝ่าย) ไม่ใช่จาก
// ทุกฟิลด์ที่มี — ค้นเจอของที่มองไม่เห็นบนจอแล้วผู้ใช้จะไม่เข้าใจว่าทำไมแถวนี้ขึ้นมา
export function matchesQueueSearch(request, term, { kindLabel = () => '' } = {}) {
  const q = String(term ?? '').trim().toLowerCase();
  if (!q) return true;
  return [
    request?.docNo,
    request?.title,
    request?.customerName,
    // รหัสลูกค้า (AR) — ตาเห็นบนแถวแล้ว จึงต้องค้นเจอด้วย (กฎของฟังก์ชันนี้)
    request?.customerArCode,
    request?.formulaCode,
    /* ดีลเป็นคอลัมน์บนคิว (รหัสบน ชื่อล่าง — ดู RequestQueuePanel) และ API ส่งมาครบ
       ⇒ กติกาของฟังก์ชันนี้เอง ("ตาเห็นบนแถว = ต้องค้นเจอ") บังคับให้มีสองคีย์นี้ */
    request?.dealCode,
    request?.dealName,
    // ⚠️ ส่ง **ทั้งใบ** — ป้ายบนแถวคือ "ชื่อหัวข้อ · รูปแบบ" (`requestKindLabelFull`)
    // ⇒ ส่งแค่ `kind` แล้วพิมพ์ "NPD" จะหาไม่เจอทั้งที่คำนั้นอยู่บนจอ
    kindLabel(request),
    request?.dept,
    // ชื่อรายการในคอลัมน์ราคา (ม-148) — ตาเห็นบนแถว = ต้องค้นเจอ
    ...requestPriceSummary(request?.items).lines.map((line) => line.label),
  ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
}

/**
 * ใบนี้ผ่านทุกชั้นของคิวไหม — **ตัวตัดสินเดียว** ของตารางและทุกตัวเลขบนหน้าคิว
 *
 * @param state `{ countFilter, search, filters, todayIso }` — ชุดเดียวกับ `useQueueBoard` ถือ
 *   (`todayIso` = วันไทยจาก `businessDate()` เสมอ — ตัดสิน "เลยกำหนด")
 * @param except `'count'` = ข้ามตัวกรองแถบตัวเลข (ใช้นับแถบเอง และเลขบนแท็บ เพราะสลับแท็บล้างตัวนี้) ·
 *   ชื่อมิติ (`'owner'` …) = ข้ามมิตินั้น (ใช้นับตัวเลือกของมิตินั้นในแผงกรอง)
 */
export function passesQueueFilters(row, state = {}, { except = null } = {}) {
  const { countFilter = null, search = '', filters = {}, todayIso = null } = state || {};
  if (except !== 'count' && countFilter && !matchesQueueCount(row, countFilter, { todayIso })) return false;
  if (!matchesQueueSearch(row, search, { kindLabel: requestKindLabelFull })) return false;
  // กติกาเดียวกับ `filterRequestRows`: ในมิติเดียวกัน "หรือ" · ข้ามมิติ "และ" · มิติว่าง = ไม่กรอง
  for (const [dimension, values] of Object.entries(filters || {})) {
    if (dimension === except || !values?.length) continue;
    if (!values.includes(requestFacet(row, dimension).key)) return false;
  }
  return true;
}

/** แถวที่ผ่านทุกชั้น (หรือทุกชั้นยกเว้น `except`) — ลำดับเดิมของ `rows` */
export function filterQueueRows(rows = [], state = {}, opts = {}) {
  return (rows || []).filter((row) => passesQueueFilters(row, state, opts));
}

/**
 * ตัวเลขบนแถบ (`QueueCountStrip`) = **กดช่องนั้นแล้วตารางจะเหลือกี่ใบ**
 *
 * ⭐ นับ *พร้อม* คำค้นและแผงกรองที่ค้างอยู่ (ไม่ล้างตอนกด) — แถบเป็นตัวสลับในหน้าเดียวกับตาราง
 * มีสถานะกดค้างและป้าย "กรอง: X ×" ⇒ ถ้ากดแล้วล้างตัวกรองอื่น เลขบนช่องที่กดค้างจะขัดกับตาราง
 * ทันทีที่ผู้ใช้ติ๊กแผงกรองเพิ่ม และ `?owner=` (คิวของคนเดียว) จะหลุดตอนกดช่อง
 */
export function queueStripCounts(rows = [], state = {}) {
  return queueCounts(filterQueueRows(rows, state, { except: 'count' }), { todayIso: state?.todayIso ?? null });
}

/**
 * ตัวเลือกของมิติหนึ่งในแผงกรอง พร้อมจำนวน = **ติ๊กตัวนั้นแล้วตารางจะเหลือกี่ใบ**
 *
 * ⚠️ ตัวเลือกยังสร้างจากแถวที่มีจริง (กติกาเดิมของ `requestFacetOptions`) — แต่นับจากแถวที่ผ่าน
 *    ทุกชั้นยกเว้นมิตินี้ ⇒ ติ๊ก "RD" แล้วตัวเลือก "PC" ไม่หาย (ยกเลิกตัวเลือกตัวเองได้ · เหตุผลเดิม)
 * ⚠️ **ตัวที่ติ๊กอยู่ต้องอยู่ในลิสต์เสมอ แม้เหลือ (0)** — `FilterPopover` วาดเฉพาะ `options` ⇒ ตัวที่
 *    หลุดลิสต์ (สลับแท็บ · พิมพ์คำค้น) จะยกเลิกติ๊กไม่ได้ เหลือทางเดียวคือ "ล้างทั้งหมด"
 *    ป้ายของตัวที่หลุดอ่านจาก `labelRows` (ชุดกว้างสุดที่หน้าโหลดมา) — ไม่เจอเลย = "ไม่มีในมุมมองนี้"
 * ⚠️ "ไม่ระบุ…" ไปท้ายสุดเสมอ ไม่ปนกลางลิสต์
 */
export function queueFacetOptions(rows = [], state = {}, dimension, { labelRows = rows } = {}) {
  const map = new Map();
  for (const row of filterQueueRows(rows, state, { except: dimension })) {
    const { key, label, sub } = requestFacet(row, dimension);
    const found = map.get(key);
    if (found) { found.count += 1; if (!found.sub && sub) found.sub = sub; }
    else map.set(key, { value: key, label, sub: sub || null, count: 1, missing: key === FACET_NONE });
  }
  for (const key of state?.filters?.[dimension] || []) {
    if (map.has(key)) continue;
    const source = (labelRows || []).find((row) => requestFacet(row, dimension).key === key);
    const facet = source ? requestFacet(source, dimension)
      : key === FACET_NONE ? requestFacet({}, dimension)
        : { key, label: 'ไม่มีในมุมมองนี้', sub: null };
    map.set(key, { value: key, label: facet.label, sub: facet.sub || null, count: 0, missing: key === FACET_NONE });
  }
  return [...map.values()]
    .sort((a, b) => {
      if (a.missing !== b.missing) return a.missing ? 1 : -1;
      return a.label.localeCompare(b.label, 'th');
    })
    // ⚠️ รหัส AR ต่อท้ายป้าย ไม่ใช่บรรทัดใหม่ — ทรงเดียวกับ `requestFacetOptions`
    .map(({ value, label, sub, count }) => ({ value, label: `${label}${sub ? ` · ${sub}` : ''} (${count})` }));
}
