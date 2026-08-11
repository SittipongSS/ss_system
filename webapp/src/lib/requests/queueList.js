// ── มิติของ "รายการคำร้อง" — กรอง จัดกลุ่ม เรียง (ล้วน ไม่แตะจอ) ─────────
//
// ⭐ **ลอกโครงหน้ารายการดีลมาทั้งชุด** (มติผู้ใช้ 2026-08-11 · แบบ จ) — หน้าดีลคือ
// หน้าที่ประกาศมาตรฐานนี้ไว้เอง (`FilterPopover` เดียว ทุกหมวด multi-select ·
// `MenuSelect` จัดกลุ่ม/เรียง · หัวกลุ่มย่อ-ขยายได้) · คิวคำร้องเคยมีแค่ช่องค้นหา
// กับตัวเลขกดกรอง ⇒ คำถามอย่าง *"ใบของลูกค้านี้มีกี่ใบ"* หรือ *"ปกิตาถืออยู่กี่ใบ"*
// ตอบไม่ได้เลยนอกจากกวาดตาทั้งตาราง
//
// ⚠️ **หนึ่งคีย์ = หนึ่งนิยาม** — ตัวกรองกับตัวจัดกลุ่มอ่าน `requestFacet` ตัวเดียวกัน
// เขียนแยกเมื่อไรจะได้อาการ "กรองลูกค้า A แล้วหัวกลุ่มขึ้นว่าไม่ระบุลูกค้า" ซึ่งหา
// ต้นเหตุไม่เจอเพราะสองฝั่งต่างก็ดูถูกในตัวเอง
import { compareRequestUrgency } from '@/lib/requests/queue';
import { requestKindLabel } from '@/lib/master/requestTypes';
import { requestAssignee } from '@/lib/requests/assign';

// ค่าที่ใช้แทน "ไม่มีข้อมูลในมิตินี้" — ต้องเป็นคีย์จริง ไม่ใช่ null เพราะมันต้อง
// ถูกเลือกในตัวกรองได้ ("ยังไม่มีคนรับ" คือสิ่งที่หัวหน้าอยากกรองที่สุด)
export const FACET_NONE = '__none';

export const REQUEST_GROUP_OPTIONS = [
  { value: 'none', label: 'ไม่จัดกลุ่ม' },
  { value: 'dept', label: 'ฝ่ายที่ขอไป' },
  { value: 'kind', label: 'ชนิดคำร้อง' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'project', label: 'โครงการ' },
  { value: 'owner', label: 'ผู้รับผิดชอบ' },
];

/**
 * มิติหนึ่งของคำร้องหนึ่งใบ — คืน `{ key, label }` เสมอ (ไม่มีเคสคืน null)
 *
 * ⚠️ `key` ใช้เทียบ ส่วน `label` ใช้แสดง — ห้ามเอา label ไปเป็นคีย์ เพราะชื่อลูกค้า
 * ที่พิมพ์คนละแบบ ("บจก. A" / "บริษัท A") จะกลายเป็นสองกลุ่มทั้งที่เป็นรายเดียวกัน
 * ⇒ ลูกค้าเทียบด้วย `customerId` ก่อนเสมอ แล้วค่อยถอยไปใช้ชื่อที่ normalize แล้ว
 */
export function requestFacet(request = {}, dimension) {
  if (dimension === 'dept') {
    const dept = String(request.dept || '').trim();
    return dept ? { key: dept, label: dept } : { key: FACET_NONE, label: 'ไม่ระบุฝ่าย' };
  }
  if (dimension === 'kind') {
    const kind = String(request.kind || '').trim();
    return kind
      ? { key: kind, label: requestKindLabel(kind) }
      : { key: FACET_NONE, label: 'ไม่ระบุชนิด' };
  }
  if (dimension === 'customer') {
    const id = request.customerId || null;
    const name = String(request.customerName || '').trim();
    if (id) return { key: String(id), label: name || 'ลูกค้า (ไม่มีชื่อ)' };
    if (name) return { key: name.toLocaleLowerCase('th-TH'), label: name };
    return { key: FACET_NONE, label: 'ไม่ระบุลูกค้า' };
  }
  if (dimension === 'project') {
    /* ⚠️ **ป้ายมาจาก `projectCode`/`projectName` ที่ API แนบมา ไม่ใช่ `projectId`** —
       id เป็น uuid ที่อ่านไม่ออก · ใบที่ผูกโครงการที่ถูกลบไปแล้วจะได้ id แต่ไม่มีชื่อ
       ⇒ ยังต้องแยกเป็นกลุ่มของตัวเอง (ไม่ใช่ยุบรวมกับ "ไม่ผูกโครงการ" ซึ่งคนละเรื่อง) */
    const id = request.projectId || null;
    if (!id) return { key: FACET_NONE, label: 'ไม่ผูกโครงการ' };
    const code = String(request.projectCode || '').trim();
    const name = String(request.projectName || '').trim();
    const label = [code, name].filter(Boolean).join(' — ') || 'โครงการ (ไม่มีชื่อ)';
    return { key: String(id), label };
  }
  if (dimension === 'owner') {
    /* ⭐ **ผู้รับผิดชอบก่อน แล้วถอยไปคนที่กดรับเรื่อง** (mig 0230) — คำถามคือ
       "งานค้างอยู่ที่ใคร" ไม่ใช่ "ใครกดปุ่มรับ" · กฎอยู่ที่ `requestAssignee`
       ที่เดียว ใช้ร่วมกับตาราง "งานค้างรายคน" บนหน้าภาพรวม (ม-107) */
    const who = requestAssignee(request);
    if (who.id || who.name) {
      return { key: String(who.id || who.name.toLocaleLowerCase('th-TH')), label: who.name || 'ผู้รับผิดชอบ' };
    }
    return { key: FACET_NONE, label: 'ยังไม่มีคนรับ' };
  }
  return { key: FACET_NONE, label: 'ทั้งหมด' };
}

/**
 * ตัวเลือกของมิติหนึ่ง พร้อมจำนวนใบ — ใช้เติม `FilterPopover`
 *
 * ⚠️ **สร้างจากแถวที่มีอยู่จริง ไม่ใช่จากทะเบียน** — ทะเบียนชนิดคำร้องมี 5 ชนิด
 * แต่คิวของคนนี้อาจมีแค่ 2 ⇒ อีก 3 ตัวเป็นตัวเลือกที่กดแล้วได้ตารางว่างเสมอ
 * ⚠️ "ไม่ระบุ…" ไปท้ายสุดเสมอ ไม่ปนกลางลิสต์
 */
export function requestFacetOptions(rows = [], dimension) {
  const map = new Map();
  for (const row of rows) {
    const { key, label } = requestFacet(row, dimension);
    const found = map.get(key);
    if (found) found.count += 1;
    else map.set(key, { value: key, label, count: 1, missing: key === FACET_NONE });
  }
  return [...map.values()]
    .sort((a, b) => {
      if (a.missing !== b.missing) return a.missing ? 1 : -1;
      return a.label.localeCompare(b.label, 'th');
    })
    .map(({ value, label, count }) => ({ value, label: `${label} (${count})` }));
}

/**
 * กรองด้วยหลายมิติพร้อมกัน — `{ dept: [...], kind: [...], customer: [...], owner: [...] }`
 *
 * กติกาเดียวกับหน้าดีล: **ในหมวดเดียวกันเป็น "หรือ" · ข้ามหมวดเป็น "และ"** ·
 * หมวดที่ว่าง = ไม่กรอง (ไม่ใช่ "ไม่เอาอะไรเลย")
 */
export function filterRequestRows(rows = [], filters = {}) {
  const active = Object.entries(filters).filter(([, values]) => values?.length);
  if (!active.length) return rows;
  return rows.filter((row) => active.every(([dimension, values]) =>
    values.includes(requestFacet(row, dimension).key)));
}

export const requestFilterCount = (filters = {}) =>
  Object.values(filters).reduce((sum, values) => sum + (values?.length || 0), 0);

// ── เรียงลำดับ ───────────────────────────────────────────────────────────
//
// ⚠️ **ค่าตั้งต้นคือ "ความเร่ง" ไม่ใช่วันที่** — คำโปรยของหน้าสัญญาไว้ว่า "เรื่องที่
// ยังไม่มีใครรับขึ้นก่อนเสมอ" ซึ่งเป็นกติกาของ `compareRequestUrgency` · เปลี่ยน
// ค่าตั้งต้นเป็นอย่างอื่นเมื่อไรคำโปรยจะกลายเป็นคำโกหกทันที
export const REQUEST_SORT_OPTIONS = [
  { key: 'urgency', label: 'ความเร่ง' },
  { key: 'due', label: 'กำหนดส่ง' },
  { key: 'created', label: 'เปิดล่าสุด' },
  { key: 'docNo', label: 'เลขที่' },
  { key: 'customer', label: 'ลูกค้า' },
];

// ทิศตั้งต้นต่อคีย์ — วันที่/ความเร่ง "ใกล้สุดก่อน", ตัวหนังสือ ก→ฮ, เปิดล่าสุด = ใหม่ก่อน
export const requestSortDefaultDir = (key) => (key === 'created' ? 'desc' : 'asc');

// ค่าที่ใช้เทียบของแต่ละคีย์ — คืน '' เมื่อใบนั้นไม่มีค่าในคีย์นี้
const sortValue = (row, key) => {
  if (key === 'due') return String(row.committedDueDate || '');
  if (key === 'created') return String(row.createdAt || '');
  if (key === 'docNo') return String(row.docNo || '');
  if (key === 'customer') {
    const facet = requestFacet(row, 'customer');
    return facet.key === FACET_NONE ? '' : facet.label;
  }
  return '';
};

/**
 * เรียงแถว — คืนอาร์เรย์ใหม่เสมอ
 *
 * ⚠️ **ใบที่ไม่มีค่าในคีย์นั้นไปท้ายเสมอ ไม่ว่าทิศไหน** — ใบที่ยังไม่มีกำหนดส่งมีเป็น
 * ปกติในคิวนี้ · ปล่อยให้ทิศพามันขึ้นหัวตารางแปลว่ากดสลับทิศทีไรก็ได้ใบเปล่า 10 ใบ
 * ขึ้นก่อน ซึ่งไม่ใช่คำตอบของคำถามไหนเลย
 * ⚠️ เสถียร — ใบที่เท่ากันคงลำดับเดิม (ผูก index ไว้) ไม่งั้นแถวจะสลับที่กันเอง
 * ทุกครั้งที่ re-render
 */
export function sortRequestRows(rows = [], { key = 'urgency', dir = 'asc' } = {}) {
  const sign = dir === 'desc' ? -1 : 1;
  return rows
    .map((row, i) => [row, i])
    .sort(([a, ai], [b, bi]) => {
      if (key === 'urgency') return (compareRequestUrgency(a, b) * sign) || (ai - bi);
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (!av !== !bv) return av ? -1 : 1; // ว่าง = ท้ายเสมอ ไม่คูณทิศ
      const cmp = key === 'customer' ? av.localeCompare(bv, 'th') : av.localeCompare(bv);
      return (cmp * sign) || (ai - bi);
    })
    .map(([row]) => row);
}

/**
 * จัดกลุ่มตามมิติที่เลือก — คืน `null` เมื่อไม่จัดกลุ่ม (ผู้เรียกใช้กลุ่มตามความเร่งแทน)
 *
 * ⚠️ ลำดับกลุ่มยึด **ลำดับแถวที่เรียงมาแล้ว** ไม่ใช่ชื่อกลุ่ม — กลุ่มที่มีใบเร่งที่สุด
 * ต้องอยู่บนสุด ไม่งั้นเรียง "ความเร่ง" แล้วใบด่วนไปโผล่กลางหน้าใต้กลุ่มชื่อขึ้นต้นด้วย ก
 */
export function groupRequestRows(rows = [], dimension) {
  if (!dimension || dimension === 'none') return null;
  const map = new Map();
  for (const row of rows) {
    const { key, label } = requestFacet(row, dimension);
    const group = map.get(key) || { key, label, rows: [], missing: key === FACET_NONE };
    group.rows.push(row);
    map.set(key, group);
  }
  const out = [...map.values()];
  // กลุ่ม "ไม่ระบุ…" ไปท้ายเสมอ — ที่เหลือคงลำดับที่แถวเรียงมา
  return out.filter((g) => !g.missing).concat(out.filter((g) => g.missing));
}
