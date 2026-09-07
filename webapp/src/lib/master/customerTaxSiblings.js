// ── นิติบุคคลเดียวกัน = ใบลูกค้าที่ใช้เลขประจำตัวผู้เสียภาษีเดียวกัน ────────────
//
// ⭐ มติผู้ใช้ 2026-09-07: "สินค้าจะผูกกับลูกค้า ซึ่งเลขประจำตัวเดียวกัน มันก็คือ
// ลูกค้าคนเดียวกัน" — บริษัทเดียวเปิดใบลูกค้าไว้หลายใบได้โดยชอบ (สำนักงานใหญ่ + สาขา
// หรือใบเก่า/ใบใหม่ที่คนละรหัส AR) แต่ **ทะเบียนสินค้า FG ผูกกับใบเดียว** ⇒ ตอนออก
// ใบเสนอราคาให้ AR อีกใบของบริษัทเดิม ดรอปดาวน์ FG ว่างเปล่าทั้งที่สินค้ามีอยู่แล้ว
//
// ไฟล์นี้ตอบคำถามเดียว: "ใบลูกค้าใบไหนบ้างที่เป็นนิติบุคคลเดียวกับใบนี้"
// ทั้งดรอปดาวน์ (`GET /api/products?taxSiblings=1`) และด่านตอนบันทึก
// (`customerMismatchedLines`) ต้องถามตัวนี้ตัวเดียวกัน ไม่งั้นจอให้เลือกได้แต่บันทึกไม่ผ่าน
//
// ⚠️ **แยกไฟล์จาก `customerTaxId.js` โดยตั้งใจ** — ไฟล์นั้นประกาศไว้ว่าไม่มี import
// ฝั่ง server เพราะฟอร์มในเบราว์เซอร์ import ตรง ๆ · ตัวนี้แตะ supabase จึงอยู่ที่นี่
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import {
  TAX_ID_LENGTH, taxIdKey, taxIdMatchFilter, taxIdMatches,
} from '@/lib/master/customerTaxId';

// ช่องที่พอสำหรับ "ป้ายบอกว่า FG ตัวนี้เป็นของ AR ไหน สาขาอะไร" + ด่านกรองด้านล่าง
const FIELDS = 'id, arCode, name, taxId, branchCode, isActive, isForeign, approvalStatus';

/**
 * เลขนี้เอาไปจับกลุ่มได้ไหม — **เข้มกว่าด่านตอนบันทึกลูกค้ามาก และต้องเข้มกว่า**
 *
 * 🪤 `taxIdFormatError` ไม่ตรวจอะไรเลยเมื่อค่ามีตัวอักษร (`customerTaxId.js:110`) เพราะ
 * `isThaiTaxEntity` ตีความว่า "มีตัวอักษร = ต่างชาติ" ⇒ 'N/A' · 'na' · 'ABC' บันทึก
 * ผ่านหมดบนลูกค้าไทยธรรมดา แล้ว `taxIdKey` คืนคีย์ที่ **ไม่ว่าง** ⇒ ถ้าเช็คแค่
 * "มีคีย์ไหม" บริษัทคนละรายที่กรอก 'N/A' เหมือนกันจะกลายเป็นนิติบุคคลเดียวกัน
 * และสลับทะเบียน FG กันทันที
 *
 * 🪤 `taxIdKey` เติมศูนย์ให้เลข 12 หลัก ⇒ '000000000000' (มีอยู่จริงในฐาน: AR-041)
 * กลายเป็นคีย์ 13 หลักที่ใช้ได้สนิท · เลขซ้ำตัวเดียวทั้งชุดคือค่าที่คนกรอกใส่ไว้แทน
 * "ยังไม่รู้" ไม่ใช่เลขจริง
 *
 * ⇒ จับกลุ่มเฉพาะ **เลขไทย 13 หลักล้วน ที่ไม่ใช่ตัวเลขซ้ำตัวเดียว** เท่านั้น
 * เลขต่างชาติไม่จับกลุ่ม: `taxIdMatchFilter` ให้คีย์ที่มีตัวอักษรแค่ `eq` แบบ
 * case-sensitive (`customerTaxId.js:222`) ส่วน `taxIdStore` เก็บตามที่พิมพ์ ⇒ หากันไม่เจอ
 * อยู่แล้ว จับครึ่ง ๆ กลาง ๆ แย่กว่าไม่จับ
 */
export function taxGroupKey(customer) {
  if (!customer || customer.isForeign) return '';
  const key = taxIdKey(customer.taxId);
  if (key.length !== TAX_ID_LENGTH || !/^\d+$/.test(key)) return '';
  if (/^(\d)\1+$/.test(key)) return '';
  return key;
}

/** ใบพี่น้องส่งของให้กันได้ไหม — ต้องเป็นใบที่ทะเบียนลูกค้ายอมรับแล้ว
 *
 * ⚠️ `taxIdMatches` กรองแต่คีย์ ไม่ดูสถานะเลย · ทะเบียนลูกค้าปกติซ่อนใบ pending/
 * rejected จากทุกปลายทาง (`api/customers/route.js`) ⇒ ถ้าไม่กรองที่นี่ ใครก็เปิดใบ
 * ลูกค้าใหม่ (ลงเป็น pending เอง ไม่ต้องมีคนอนุมัติ) ใส่เลขของบริษัทเป้าหมาย แล้วดูด
 * ทะเบียน FG ของเขามาทั้งชุด · แถวยุคเก่าที่ `approvalStatus` เป็น null = อนุมัติแล้ว
 * (กติกาเดียวกับ `GET /api/products`)
 *
 * ใบ **พักใช้** (`isActive === false`) ยังนับเป็นพี่น้อง — การยุบใบซ้ำในทะเบียนทำด้วย
 * การพักใช้ ไม่ใช่ลบ ⇒ FG ที่ค้างอยู่ในใบที่พักใช้ต้องยังหยิบมาใช้ได้จากใบหลัก
 */
const isUsableSibling = (row) => !!row
  && (row.approvalStatus === 'approved' || row.approvalStatus == null);

/**
 * ใบลูกค้าทั้งหมดที่เป็นนิติบุคคลเดียวกับ `customerId` (รวมตัวมันเอง เป็นตัวแรกเสมอ)
 *
 * คืน `[]` เมื่อหาใบตั้งต้นไม่เจอ · คืน `[anchor]` เมื่อเลขจับกลุ่มไม่ได้ (ไม่มีเลข /
 * เลขขยะ / ต่างชาติ) ⇒ ผู้เรียกได้พฤติกรรมเดิมเป๊ะโดยไม่ต้องเขียนกิ่งพิเศษ
 */
export async function customerTaxSiblings(supabase, customerId) {
  if (!customerId) return [];
  const { data: anchor, error } = await supabase
    .from('customers').select(FIELDS).eq('id', customerId).maybeSingle();
  if (error) throw error;
  if (!anchor) return [];

  const key = taxGroupKey(anchor);
  if (!key) return [anchor];

  const filter = taxIdMatchFilter(anchor.taxId);
  if (!filter) return [anchor];

  /* ⚠️ ต้องไล่ทีละหน้า — เพดาน 1,000 แถวของ PostgREST ตัดเงียบ ๆ ไม่มี error
     `taxIdMatchFilter` มี `like` ที่กว้างเกินจริงโดยตั้งใจ (ดึงหลวมแล้วกรองซ้ำใน JS)
     จึงกินโควตาแถวได้มากกว่าที่คิด · พ่วง `id` ให้ลำดับนิ่งตอนไล่หน้า */
  const { data, error: siblingError } = await fetchAllResult(() => supabase
    .from('customers').select(FIELDS).or(filter)
    .order('arCode', { ascending: true })
    .order('id', { ascending: true }));
  if (siblingError) throw siblingError;

  const siblings = taxIdMatches(data, { taxId: anchor.taxId, excludeId: anchor.id })
    .filter((row) => taxGroupKey(row) === key && isUsableSibling(row));
  return [anchor, ...siblings];
}

/**
 * รุ่นบริสุทธิ์ — ใช้กับจอที่โหลดทะเบียนลูกค้ามาไว้ในมืออยู่แล้ว (ไม่ยิง query ซ้ำ
 * และ import เข้า client component ได้)
 *
 * ⚠️ เป็นตัวกรอง **การแสดงผล** เท่านั้น — ใบไหนไม่อยู่ใน `rows` (จอโหลดมาไม่ครบ)
 * ก็แค่ไม่ขึ้นในลิสต์ ด่านจริงอยู่ฝั่ง server ที่ถามฐานเอง
 */
export function taxSiblingIdsFromRows(rows, customerId) {
  if (!customerId) return [];
  const anchor = (rows || []).find((row) => row?.id === customerId);
  if (!anchor) return [customerId];
  const key = taxGroupKey(anchor);
  if (!key) return [customerId];
  return [customerId, ...(rows || [])
    .filter((row) => row && row.id !== customerId && taxGroupKey(row) === key && isUsableSibling(row))
    .map((row) => row.id)];
}

/** เอาไว้ตอนต้องการแค่รายการ id (ด่านตอนบันทึก) */
export async function customerTaxSiblingIds(supabase, customerId) {
  const rows = await customerTaxSiblings(supabase, customerId);
  return rows.map((row) => row.id);
}

/**
 * รุ่นหลายใบพร้อมกัน — คืน Map(customerId → id ของนิติบุคคลนั้นทั้งชุด)
 *
 * ⚠️ มีไว้เพื่อ **กัน N+1** ในจอที่ไล่ทีละ SO (คิวส่งงาน · ลิสต์ใบยื่นภาษี): ยิงสอง
 * query คงที่ไม่ว่าจะกี่ใบ · เรียก `customerTaxSiblings` ทีละใบในลูปคือของต้องห้าม
 * ใบที่หาไม่เจอ/เลขจับกลุ่มไม่ได้ ⇒ ได้ `[id]` ตัวเอง = พฤติกรรมเดิมเป๊ะ
 */
export async function customerTaxSiblingIdMap(supabase, customerIds = []) {
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  const out = new Map(ids.map((id) => [id, [id]]));
  if (!ids.length) return out;

  /* ⚠️ ยิงทีละก้อน ไม่ใช่ `.in()` ก้อนเดียว — PostgREST รับตัวกรองทาง query string
     ของ GET ⇒ id 40 ตัวอักษรคูณจำนวนใบ พอเกิน ~16 KB Node/undici ตัดซ็อกเก็ตทิ้ง
     แล้วโยน `TypeError: fetch failed` ดิบ ๆ ออกมา (เหตุผลเต็มอยู่ที่
     lib/supabaseInChunks.js — /api/products เคยล้มทั้งระบบเพราะเรื่องนี้ #1660)
     ผู้เรียกตัวนี้คือคิวส่งงานกับลิสต์ใบยื่นภาษี ซึ่งจำนวนใบโตตามงาน ⇒ ข้ามเส้นได้เอง */
  const { data: anchors, error } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
    .from('customers').select(FIELDS).in('id', chunk)
    .order('id', { ascending: true })));
  if (error) throw error;

  const keyByAnchor = new Map();
  const keys = new Set();
  for (const row of anchors || []) {
    const key = taxGroupKey(row);
    if (!key) continue;
    keyByAnchor.set(row.id, key);
    keys.add(key);
  }
  if (!keys.size) return out;

  /* ตัวกรองก็ยาวได้เหมือนลิสต์ id — หนึ่งคีย์กิน ~90 ไบต์ (`eq` สองรูป + `like` ที่ใส่
     wildcard คั่นทุกหลัก) ⇒ ลูกค้าหลักร้อยรายก็ทะลุ 16 KB แล้ว · ซอยเป็นก้อนละ 40 คีย์
     (~3.6 KB) แล้วแต่ละก้อนยังไล่หน้าเองกันเพดาน 1,000 แถว */
  const pool = [];
  const keyList = [...keys];
  for (let from = 0; from < keyList.length; from += 40) {
    const filter = keyList.slice(from, from + 40)
      .map((key) => taxIdMatchFilter(key)).filter(Boolean).join(',');
    if (!filter) continue;
    const { data, error: poolError } = await fetchAllResult(() => supabase
      .from('customers').select(FIELDS).or(filter)
      .order('arCode', { ascending: true })
      .order('id', { ascending: true }));
    if (poolError) throw poolError;
    pool.push(...(data || []));
  }

  const byKey = new Map();
  const seen = new Set();
  for (const row of pool) {
    if (seen.has(row?.id)) continue;
    seen.add(row?.id);
    const key = taxGroupKey(row);
    if (!key || !keys.has(key) || !isUsableSibling(row)) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row.id);
  }
  for (const [id, key] of keyByAnchor) {
    out.set(id, [...new Set([id, ...(byKey.get(key) || [])])]);
  }
  return out;
}
