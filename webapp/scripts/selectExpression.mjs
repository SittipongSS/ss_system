/* ── แกะ `.select(<expr>)` ให้กลายเป็นรายชื่อคอลัมน์ ─────────────────────────
 *
 * 🐞 **บั๊กจริง (2026-09-23):** `check:columns` จับเฉพาะ `.select('สตริง')` ⇒ ทุกจุดที่
 * เขียน `.select(REVISION_COLUMNS)` (และเพื่อนอีก ~40 ชื่อ — CUSTOMER_NAME_SELECT ·
 * ORDER_SELECT · DEAL_COLUMNS · QUOTATION_COLUMNS …) **หลุดเงียบสนิท ไม่ถูกนับว่าข้าม
 * ด้วยซ้ำ** ทั้งที่รีโปนี้เก็บชุดคอลัมน์ก้อนใหญ่ไว้ในค่าคงที่แบบ `[...].join(', ')` เกือบหมด
 * ⇒ ชื่อที่พิมพ์ผิด หรือชื่อของ migration ที่ยังไม่ได้รัน ผ่านด่านเขียวสนิท แล้วไปโผล่บนจอ
 * เป็น "ไม่มีข้อมูล" (PostgREST ตอบ 42703 ทั้ง query) — อาการเดียวกับที่ด่านนี้มีไว้กัน
 *
 * ของจริงที่หลุดออกไป: `orders.updatedAt` ใน `ORDER_SELECT_SLIM` (#1486, 28/08) ⇒
 * `/api/orders?slim=1` พัง 42703 ทั้งเส้น คิวงานของหน้า /tax ว่างเปล่าอยู่ 26 วัน
 *
 * ⚠️ **ไม่ใช่ parser** (เจตนา — ท่าเดียวกับ `scopedVarKeys`/`literalPayload` ของรอบเขียน):
 * เก็บแค่ "ชิ้นส่วน" ของ expression — สตริง · เทมเพลต · ชื่อตัวแปร — แล้วต่อกันด้วย `, `
 * โดยไม่สนโครงสร้าง เพราะปลายทางแค่ตัดด้วยจุลภาคแล้วดูชื่อทีละตัว ⇒ `[a, b].join(', ')` ·
 * `'a,' + 'b'` · `` `${A}, x` `` ให้ผลถูกเหมือนกันหมด
 *
 * ⚠️ **แกะไม่ได้ต้องดัง** — ความเงียบคือสิ่งที่ทำให้บั๊กข้างบนรอดมา ชื่อที่หาค่าไม่เจอจึงถูก
 * คืนออกมาใน `blocked` พร้อมเหตุผลทุกครั้ง ห้ามกลืนเป็น `continue` เฉย ๆ
 *
 * ⚠️ **ราคาที่ยอมจ่ายของการต่อชิ้นส่วนด้วย `, `**: สตริงที่ถูกบวกกันกลางชื่อ
 * (`'crea' + 'tedAt'`) จะกลายเป็น `crea, tedAt` ⇒ ด่านแดงสองชื่อทั้งที่ query ถูก
 * ตอนนี้ไม่มีเคสแบบนั้นในรีโป (ที่มีคือ `'…status,' + ' "customerName"'` ซึ่งตัดตรงจุลภาค
 * พอดีและออกมาถูก) · เขียนไว้ตรงนี้เพื่อให้คนที่เจอ "แดงแปลก ๆ" รู้ว่ามาจากตรงนี้
 * ไม่ใช่จากสคีมา — ทางแก้คือรวมสตริงให้จบเป็นชื่อ ไม่ใช่ทำให้ตัวแกะฉลาดขึ้น
 */
import { dirname, join } from 'node:path';

const MAX_IDENT_DEPTH = 4;
const JS_KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'new', 'typeof', 'await', 'void', 'return']);
/* ชื่อ global ของ JS ที่ไม่มีวันเป็นชุดคอลัมน์ — ต้องข้าม ไม่ใช่รายงานว่า "หาประกาศไม่เจอ"
 * ⚠️ ของจริงที่รออยู่: รีโปนี้เขียนชุดคอลัมน์เป็น `Object.freeze([...])` อยู่แล้ว
 *    (`SITE_FLAG_COLUMNS` ใน lib/sales/siteNotFound.js) ⇒ ถ้าไม่ข้าม `Object` ตัวชื่อ
 *    จะถูกรายงานว่าแกะไม่ได้ทั้งที่คอลัมน์ทั้งชุดแกะออกมาครบ ⇒ ด่านแดงทั้งที่โค้ดถูก
 *    ซึ่งเป็นวิธีที่ด่านโดนปิดทิ้ง ไม่ใช่วิธีที่ด่านจับบั๊ก */
const JS_GLOBALS = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'JSON', 'Math', 'Date', 'Set', 'Map', 'Promise']);

/** ข้ามสตริง/เทมเพลตที่เปิดที่ i — คืนตำแหน่งของตัวปิด (เทมเพลตรู้จัก `${…}` ที่ซ้อนสตริงอีกชั้น) */
export function skipString(src, i) {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j += 1) {
    const ch = src[j];
    if (ch === '\\') { j += 1; continue; }
    if (ch === quote) return j;
    if (quote === '`' && ch === '$' && src[j + 1] === '{') {
      let depth = 1;
      j += 2;
      for (; j < src.length && depth > 0; j += 1) {
        const c = src[j];
        if (c === "'" || c === '"' || c === '`') { j = skipString(src, j); continue; }
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
      }
      j -= 1;
    }
  }
  return src.length;
}

/** ข้ามคอมเมนต์ที่เปิดที่ i — คืนตำแหน่งตัวสุดท้ายของคอมเมนต์ */
export function skipComment(src, i) {
  if (src[i + 1] === '/') {
    const nl = src.indexOf('\n', i);
    return nl < 0 ? src.length : nl;
  }
  const end = src.indexOf('*/', i + 2);
  return end < 0 ? src.length : end + 1;
}

/** อาร์กิวเมนต์ **ตัวแรก** ของ call ที่วงเล็บเปิดอยู่ที่ open (null = หาวงเล็บปิดไม่เจอ)
 *  ⚠️ ต้องหยุดที่จุลภาคชั้นบนสุด — `.select('id', { count: 'exact' })` มีตัวเลือกต่อท้าย
 *     ถ้าลาก `'exact'` มาด้วยจะกลายเป็นชื่อคอลัมน์ปลอมและด่านแดงผิด ๆ */
export function firstArg(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(src, i); continue; }
    if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipComment(src, i); continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    } else if (ch === ',' && depth === 1) return src.slice(open + 1, i);
  }
  return null;
}

/** ตำแหน่งวงเล็บที่คู่กับวงเล็บเปิดที่ open (-1 = หาไม่เจอ) */
function closingParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(src, i); continue; }
    if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipComment(src, i); continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/** ตัดเงื่อนไขของ ternary ทิ้ง เหลือเฉพาะ "ค่า" ของทุกขา
 *  🐞 ถ้าไม่ตัด เงื่อนไขจะกลายเป็นชื่อคอลัมน์ปลอม: `.select(manage ? '*' : COLS)` ที่
 *     `const manage = …searchParams.get('manage') === '1'` ⇒ ได้ชื่อ `manage` กับ `1`
 *     แล้วด่านแดงผิด ๆ ทั้งที่ query ถูก
 *  ⚠️ เก็บ **ทั้งสองขา** ไว้ตรวจ — คอลัมน์ที่ไม่มีจริงในขาไหนก็ทำให้ query นั้นพังเท่ากัน
 *     ต่างกันแค่ผู้ใช้ต้องกดทางไหนถึงจะเจอ */
export function ternaryValues(expr) {
  const segs = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(expr, i); continue; }
    if (ch === '/' && (expr[i + 1] === '/' || expr[i + 1] === '*')) { i = skipComment(expr, i); continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === '?' || ch === ':')) {
      if (ch === '?' && (expr[i + 1] === '?' || expr[i + 1] === '.')) { i += 1; continue; } // `??` / `?.` ไม่ใช่ ternary
      segs.push({ text: expr.slice(start, i), next: ch });
      start = i + 1;
    }
  }
  if (!segs.length) return expr;
  segs.push({ text: expr.slice(start), next: '' });
  // ท่อนที่ตามด้วย `?` คือเงื่อนไข ไม่ใช่ค่า
  return segs.filter((s) => s.next !== '?').map((s) => s.text).join(' , ');
}

/** ชิ้นส่วนของ expression: {lit} = ข้อความตรง ๆ · {ident} = ต้องไปแกะต่อ · {opaque} = แกะไม่ได้
 *  ⚠️ ตัวคั่นของ `.join(', ')` จะกลายเป็นชิ้นส่วน `, ` ปนเข้ามาด้วย — ตกไปเองตอน trim
 *     (ได้ชื่อว่าง) จึงไม่ต้องรู้จัก `.join` เป็นกรณีพิเศษ */
export function fragmentsOf(raw) {
  const expr = ternaryValues(raw);
  const out = [];
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === "'" || ch === '"') {
      const end = skipString(expr, i);
      out.push({ lit: expr.slice(i + 1, end) });
      i = end;
    } else if (ch === '`') {
      const end = skipString(expr, i);
      // เทมเพลต: ข้อความคั่นเป็น lit ส่วน `${…}` แกะซ้ำด้วยตัวเดียวกัน
      const body = expr.slice(i + 1, end);
      let k = 0;
      while (k < body.length) {
        const open = body.indexOf('${', k);
        if (open < 0) { out.push({ lit: body.slice(k) }); break; }
        out.push({ lit: body.slice(k, open) });
        let depth = 1;
        let j = open + 2;
        for (; j < body.length && depth > 0; j += 1) {
          const c = body[j];
          if (c === "'" || c === '"' || c === '`') { j = skipString(body, j); continue; }
          if (c === '{') depth += 1;
          else if (c === '}') depth -= 1;
        }
        out.push(...fragmentsOf(body.slice(open + 2, j - 1)));
        k = j;
      }
      i = end;
    } else if (ch === '/' && (expr[i + 1] === '/' || expr[i + 1] === '*')) {
      i = skipComment(expr, i);
    } else if (/[A-Za-z_$]/.test(ch)) {
      const name = /^[A-Za-z_$][\w$]*/.exec(expr.slice(i))[0];
      const head = expr.slice(0, i).replace(/\s+$/, '');
      const rest = expr.slice(i + name.length).replace(/^\s+/, '');
      const after = rest.slice(0, 1);
      let jump = i + name.length - 1;
      if (head.endsWith('.') && !head.endsWith('...')) {
        /* เมธอด/พร็อพเพอร์ตี้ (`.join` · `.filter`) — ตัวมันเองไม่ใช่ชื่อคอลัมน์
           อาร์กิวเมนต์ของมันเดินต่อตามปกติ */
      } else if (after === '(') {
        out.push({ opaque: `${name}() — ผลลัพธ์ของฟังก์ชัน เดาไม่ได้` });
        /* ⚠️ อาร์กิวเมนต์ของฟังก์ชันที่เดาไม่ได้ **ไม่ใช่ชื่อคอลัมน์** — เก็บเฉพาะสตริงที่
           เห็นตรง ๆ (`wrap('id, name')`) ส่วนชื่อตัวแปรข้ามไป ไม่งั้น `buildCols(u)`
           จะรายงานสองบรรทัดว่า `buildCols()` ก็แกะไม่ได้ และ `u` ก็แกะไม่ได้ ทั้งที่ `u`
           เป็นแค่อาร์กิวเมนต์ของตัวที่แกะไม่ได้อยู่แล้ว ⇒ อ่านรายงานยากขึ้นเปล่า ๆ */
        const open = expr.indexOf('(', i + name.length);
        const close = closingParen(expr, open);
        if (close > open) {
          out.push(...fragmentsOf(expr.slice(open + 1, close)).filter((f) => f.lit !== undefined));
          jump = close;
        }
      } else if (after === ':' && (head.endsWith('{') || head.endsWith(','))) {
        /* คีย์ของ object ตัวเลือก — ไม่ใช่คอลัมน์ */
      } else if (JS_KEYWORDS.has(name) || JS_GLOBALS.has(name)) {
        /* คำสงวน/global ของ JS — ข้ามเงียบได้ เพราะไม่มีทางเป็นชุดคอลัมน์ให้ตามไปแกะ */
      } else if (/^\??\.\s*[A-Za-z_$]/.test(rest) && !/^\??\.\s*[A-Za-z_$][\w$]*\s*\(/.test(rest)) {
        /* `entry.select` — พร็อพเพอร์ตี้ของอ็อบเจกต์ ไม่ใช่ค่าคงที่ที่ตามไปแกะได้
           ⚠️ ถ้าปล่อยเป็น `{ident: 'entry'}` ตัวแกะจะไปหยิบ **ทั้งก้อน** ของ `entry`
              มาแทน ⇒ ได้สตริงของพร็อพเพอร์ตี้พี่น้องที่ไม่เกี่ยวข้องมาปนเป็นคอลัมน์
              ⇒ แดงด้วยเหตุผลที่อ่านแล้วงง · แกะไม่ได้ก็บอกว่าแกะไม่ได้ ดีกว่าเดาผิด
           (เมธอดไม่เข้าเงื่อนไขนี้ — `FIELDS.join(', ')` ยังตามไปแกะ `FIELDS` ตามเดิม) */
        out.push({ opaque: `${name}.… — พร็อพเพอร์ตี้ของอ็อบเจกต์ เดาไม่ได้` });
      } else out.push({ ident: name });
      i = jump;
    }
  }
  return out;
}

/** ที่ประกาศของชื่อหนึ่งในไฟล์ — ตัวสุดท้ายก่อนจุดใช้งาน (กติกาเดียวกับ `scopedVarKeys`)
 *  ⚠️ ถอยไปใช้ประกาศที่อยู่ **หลัง** จุดใช้งานได้เฉพาะตัวที่อยู่ระดับบนสุดของไฟล์ —
 *     ค่าคงที่ของโมดูลวางไว้ท้ายไฟล์ได้ (ฟังก์ชันที่เรียกมันรันทีหลัง) แต่ `const` ในฟังก์ชัน
 *     อื่นที่บังเอิญชื่อซ้ำ (`columns` · `select` · `patch`) ห้ามหยิบมาใช้ ไม่งั้นได้คอลัมน์
 *     ของตารางอื่นมาปนจนเตือนผิดทุกใบ — บทเรียนเดียวกับรอบเขียน */
export function findDecl(src, name, at) {
  // ⚠️ `$` เป็นชื่อตัวแปรที่ถูกกฎหมายใน JS แต่เป็น **จุดจบสตริง** ในเรกซ์เอ็กซ์ ⇒ ถ้าไม่
  //    escape ก่อน ชื่ออย่าง `$COLS` จะหาประกาศไม่เจอทั้งที่อยู่ในไฟล์เดียวกัน แล้วรายงาน
  //    เหตุผลผิดว่า "ไม่เจอที่ประกาศ" (แดงถูกทิศ แต่ทำให้คนไล่ผิดที่)
  const safe = name.replace(/[$]/g, '\\$&');
  const re = new RegExp(`(^|[^\\w$.])(?:export\\s+)?(?:const|let|var)\\s+${safe}\\s*=(?!=)`, 'g');
  let before = null;
  let after = null;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[1].length;
    const eq = m.index + m[0].length - 1;
    if (start < at) before = eq;
    // ⚠️ ต้องเป็นคอลัมน์ 0 จริง ๆ ไม่ใช่แค่ "ไม่มีตัวอักษรนำหน้า" — `  const COLS = …`
    //    ที่ย่อหน้าอยู่ในฟังก์ชันอื่นเคยผ่านเช็คแบบ trim() แล้วถูกหยิบมาใช้ผิดตัว
    else if (after === null && src.lastIndexOf('\n', start) + 1 === start) after = eq;
  }
  return before ?? after;
}

/** ข้อความของ initializer ที่เริ่มหลัง `=` ตัวนั้น — จบที่ `;` ชั้นบนสุด (รีโปนี้ใส่ `;` เสมอ) */
export function initializerAt(src, eq) {
  let depth = 0;
  for (let i = eq + 1; i < src.length && i - eq < 8000; i += 1) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(src, i); continue; }
    if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { i = skipComment(src, i); continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; if (depth < 0) return null; }
    else if (ch === ';' && depth === 0) return src.slice(eq + 1, i);
  }
  return null;
}

/* ── embed: `alias:table!hint(cols)` — คอลัมน์ของ **ตารางอื่น** ที่ต้องตรวจกับตารางนั้น ──
 *
 * 🐞 **จุดบอดที่เหลือของ #1795 (ปิด 2026-09-24):** ของเดิมตัด embed ทิ้งด้วยเรกซ์เอ็กซ์
 *    `\w+(:\w+)?\([^)]*\)` แล้วแค่นับว่าตัดไปกี่ชื่อ (148 ชื่อ จาก 22 จุด) ⇒ ชื่อผิดใน
 *    `deal:sales_deals(${DEAL_COLUMNS})` ทำให้ PostgREST ตอบ 42703 **ทั้ง query** (จอว่าง
 *    "ไม่มีข้อมูล") แต่ด่านเขียว — รูปเดียวกับที่ซ่อน /tax ไว้ 26 วัน
 *    · เรกซ์เอ็กซ์เดิมยังตัด embed ซ้อนผิดอีกชั้น: `[^)]*` หยุดที่ `)` ตัวแรก ⇒
 *      `deal:sales_deals(id, project:projects(id))` ถูกตัดถึงวงเล็บของ `projects` แล้ว
 *      `)` ตัวนอกหลุดมาเป็นชิ้นเปล่า ๆ ซึ่งกฎ "อักขระแปลก = ข้าม" กลืนไปเงียบ ๆ
 *
 * ⚠️ **ยังไม่ใช่ parser** — ความรู้เรื่องโครงสร้างที่ยอมเพิ่มมีชิ้นเดียว: จุลภาคที่อยู่ใน
 *    วงเล็บไม่ใช่ตัวคั่นชั้นบน (`selectPieces`) · ชิ้นไหนมีวงเล็บก็จับรูป embed ด้วยเรกซ์เอ็กซ์
 *    บรรทัดเดียว แล้วส่ง **ข้างใน** กลับเข้ากฎชุดเดิมของชั้นบนสุด (`columnName`) ซ้ำ ๆ ตามชั้น
 *    ⇒ alias · cast · JSON path · `*` · `count` ตัดสินที่เดียว ไม่มีกฎชุดที่สองให้เพี้ยนหากัน
 * ⚠️ ชื่อตารางถูกต้องยังไม่พอ — แม่กับปลายทางต้องมี FK เชื่อมแบบไม่กำกวม (`linkVerdict`)
 *    ไม่งั้นฐานตอบ PGRST200/201 ทั้ง query เหมือนกัน (รอบรีวิวจับได้ว่ารอบแรกปล่อยผ่าน)
 */

/** ตัดข้อความ select เป็นชิ้นชั้นบนสุด — จุลภาคในวงเล็บของ embed ไม่ใช่ตัวคั่น
 *  @returns { pieces, unbalanced } — `unbalanced` = วงเล็บไม่ครบคู่ (ต้องรายงาน ไม่ใช่เดา) */
export function selectPieces(text) {
  const s = String(text);
  const pieces = [];
  let depth = 0;
  let start = 0;
  let unbalanced = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth < 0) { unbalanced = true; depth = 0; }
    } else if (ch === ',' && depth === 0) {
      pieces.push(s.slice(start, i));
      start = i + 1;
    }
  }
  pieces.push(s.slice(start));
  return { pieces, unbalanced: unbalanced || depth !== 0 };
}

/** ชื่อคอลัมน์ของชิ้นเดียว (ชิ้นที่ไม่มีวงเล็บ)
 *  @returns { name } = คอลัมน์ให้ตรวจ · { broken } = อ่านไม่ออก ต้องรายงาน · null = ไม่มีชื่อให้ตรวจ (`*` · ชิ้นว่าง)
 *  ⚠️ ชิ้นว่างข้าม — ตัวคั่นของ `.join(', ')` ที่ปนเข้ามาจะตกตรงนี้เอง */
function columnName(piece) {
  // `col::text` = cast ไม่ใช่ alias — ตัดชนิดทิ้งก่อนแยกโคลอน
  let name = piece.trim().replace(/^["']|["']$/g, '').split('::')[0];
  // 🐞 `alias:column` ชั้นบนสุด = เปลี่ยนชื่อที่โผล่ใน JSON — **คอลัมน์จริงอยู่หลังโคลอน**
  //    ของเดิมหยิบตัวหน้า (ชื่อ alias) ไปเทียบกับสคีมา ⇒ query ที่ถูกต้องกลับแดง
  //    ตอนที่ด่านอ่านแต่สตริงสั้น ๆ ยังไม่เคยระเบิด แต่พอแกะค่าคงที่ชุดใหญ่ได้แล้ว
  //    (ชุดพวกนั้นเปลี่ยนชื่อคอลัมน์กันเป็นเรื่องปกติ) มันเป็นแค่เรื่องของเวลา —
  //    และด่านที่แดงทั้งที่โค้ดถูก คือด่านที่กำลังจะโดนปิดทิ้ง
  const colon = name.indexOf(':');
  if (colon >= 0) name = name.slice(colon + 1);
  // 🐞 JSON path `metadata->>projectType` — ของเดิมทิ้งทั้งชิ้นเพราะมีอักขระแปลก **รวมตัว
  //    `metadata` ที่เป็นคอลัมน์จริงไปด้วย** ⇒ `metdata->>x` ผ่านเขียวทั้งที่ฐานตอบ 42703
  //    ทั้ง query (ยิงจริง 24/09 ทั้งชั้นบนสุดและใน embed) · ส่วนหลัง `->` เป็นคีย์ใน JSON
  //    ไม่มีสคีมาให้เทียบ — แต่ตัวหน้า `->` ตัวแรกคือคอลัมน์ธรรมดา ต้องตรวจเหมือนคอลัมน์อื่น
  const jsonPath = name.includes('->');
  name = name.split('->')[0];
  name = name.split('!')[0].trim().replace(/^["']|["']$/g, '');
  if (!name) {
    return jsonPath ? { broken: `\`${shortPiece(piece)}\` — JSON path ที่ไม่มีชื่อคอลัมน์นำหน้า (ฐานตอบ PGRST100)` } : null;
  }
  if (name === '*') return null;
  // ⚠️ เหลืออักขระนอก [A-Za-z0-9_] หลังตัด alias/cast/JSON path แล้ว = อ่านเป็นชื่อไม่ออก
  //    ของเดิมคืน null เงียบ ๆ (กฎ "อักขระแปลก = ข้าม") — ตอนนี้ต้องดัง เพราะฐานไม่ข้ามให้:
  //    `id name` (ลืมจุลภาค) ได้ 42703 "column quotations.id name does not exist" ทั้ง query
  if (/[^A-Za-z0-9_]/.test(name)) return { broken: `\`${shortPiece(piece)}\` — อ่านเป็นชื่อคอลัมน์ไม่ออก (ลืมจุลภาค/อักขระแปลก?)` };
  return { name };
}

/* รูปของชิ้นที่มีวงเล็บ — จับด้วยเรกซ์เอ็กซ์บรรทัดเดียว ไม่ไล่ไวยากรณ์
 *   embed:     `...`? `alias:`? ชื่อปลายทาง `!ตัวขยาย`* `(ข้างใน)`
 *   aggregate: `alias:`? (`col.`)? count|sum|avg|min|max `()` `::ชนิด`?  (PostgREST 12)
 * ⚠️ aggregate ต้องจับก่อน embed — `count()` หน้าตาเหมือน embed ของตารางชื่อ `count`
 *    ที่ข้างในว่าง ถ้าปล่อยให้ตก embed จะได้เหตุผลผิดเรื่อง ("ตาราง count ไม่มีในสคีมา")
 * 🐞 **โปรเจกต์นี้ปิด aggregate ของ PostgREST** (`db-aggregates-enabled` ค่าตั้งต้น = ปิด) —
 *    ยิงจริง 24/09: `count()` · `n:count()` · `totalTax.sum()` · `order_items(count())` ได้
 *    400 PGRST123 ทั้ง query ทุกตัว ⇒ ชิ้นแบบนี้ต้อง **แดง** ไม่ใช่ข้าม (รอบแรกของงานนี้ข้าม
 *    แล้วเขียนคอมเมนต์ว่า "query ถูก" — ผิด) · วันไหนเปิด aggregate ที่ Supabase ค่อยมาแก้กฎนี้
 *    (รีโปมีรูปนี้ 0 จุดวันนี้) */
const EMBED_PIECE = /^\s*(\.\.\.)?\s*(?:"?([A-Za-z_]\w*)"?\s*:\s*)?"?([A-Za-z_]\w*)"?((?:\s*!\s*[A-Za-z_]\w*)*)\s*\(([\s\S]*)\)\s*$/;
const AGGREGATE_PIECE = /^\s*(?:"?[A-Za-z_]\w*"?\s*:\s*)?(?:"?([A-Za-z_]\w*)"?\s*\.\s*)?(?:count|sum|avg|min|max)\s*\(\s*\)\s*(?:::\s*\w+)?\s*$/;
/** `!inner` / `!left` = ชนิดของ join ไม่ใช่ชื่อ FK — ที่เหลือหลัง `!` คือ hint */
const JOIN_MODIFIERS = new Set(['inner', 'left']);
const shortPiece = (s) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 57)}…` : t; };

/** แยกข้อความ select ชั้นเดียว: คอลัมน์ · embed (ข้างในยังไม่แตะ) · ชิ้นที่อ่านไม่ออก
 *  @returns { columns: string[], embeds: Embed[], broken: string[], items: number }
 *  Embed = { piece, alias, target, spread, join, hints, inner } — PostgREST ใช้ `hints[0]` ตัวเดียว
 *  `items` = จำนวนชิ้น (ไม่ซ้ำ ไม่นับชิ้นว่าง) ของชั้นนี้ — กฎ `count` เปล่า ๆ ต้องรู้ว่ามันอยู่คนเดียวไหม */
export function parseSelect(text) {
  const { pieces, unbalanced } = selectPieces(text);
  const columns = [];
  const embeds = [];
  const broken = [];
  // ⚠️ นับแบบไม่ซ้ำ — ternary แกะค่าคงที่ตัวเดียวกันทั้งสองขา ⇒ `count` ขาละตัวยังนับเป็นหนึ่งชิ้น
  const items = new Set(pieces.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)).size;
  // วงเล็บไม่ครบคู่ = ตัดชิ้นผิดตั้งแต่จุดนั้น ⇒ รายงานบรรทัดเดียวพอ ไม่ต้องไล่บ่นทีละชิ้นที่พังตามกัน
  //   (รายการ ⚠ ที่ยาวเกินจริงทำให้คนเลิกอ่าน — บทเรียนเดียวกับ `buildCols(u)` ข้างบน)
  if (unbalanced) broken.push(`\`${shortPiece(text)}\` — วงเล็บของ embed ไม่ครบคู่ ตัดชิ้นไม่ได้ ชื่อหลังจุดนั้นไม่มีใครตรวจ`);
  for (const piece of pieces) {
    if (!/[()]/.test(piece)) {
      const c = columnName(piece);
      if (c?.broken && !unbalanced) broken.push(c.broken);
      else if (c?.name) columns.push(c.name);
      continue;
    }
    const agg = AGGREGATE_PIECE.exec(piece);
    if (agg) {
      broken.push(`\`${shortPiece(piece)}\` — aggregate ของ PostgREST ถูกปิดบนโปรเจกต์นี้ ⇒ ฐานตอบ PGRST123 ทั้ง query`);
      if (agg[1]) columns.push(agg[1]); // `amount.sum()` — `amount` ยังเป็นคอลัมน์ของตารางนี้ ผิดก็ต้องแดงอีกบรรทัด
      continue;
    }
    const e = EMBED_PIECE.exec(piece);
    if (!e) {
      // ⚠️ ห้ามข้ามเงียบ — ของเดิมกลืนชิ้นแบบนี้ด้วยกฎ "อักขระแปลก = ข้าม" (ดูหัวบล็อก)
      if (!unbalanced) broken.push(`\`${shortPiece(piece)}\` — มีวงเล็บแต่อ่านเป็น embed ไม่ออก`);
      continue;
    }
    const mods = e[4].split('!').map((m) => m.trim()).filter(Boolean);
    embeds.push({
      piece: piece.trim(),
      alias: e[2] || null,
      target: e[3],
      spread: Boolean(e[1]),
      join: mods.find((m) => JOIN_MODIFIERS.has(m)) || null,
      hints: mods.filter((m) => !JOIN_MODIFIERS.has(m)),
      inner: e[5],
    });
  }
  return { columns, embeds, broken, items };
}

/** ชื่อคอลัมน์ชั้นบนสุดที่อ่านได้จากข้อความของ select (embed ไม่รวม — ตรวจแยกที่ `checkSelectText`) */
export function columnNamesOf(text) {
  return parseSelect(text).columns;
}

/** สคีมาจาก `definitions` ของ OpenAPI ที่ PostgREST คืนมา — ตาราง + วิวใน schema ที่เปิดไว้
 *  FK อ่านจากคำอธิบายคอลัมน์ `<fk table='customers' column='id'/>` ที่ PostgREST เขียนให้เอง
 *  (ใช้แปล embed แบบ "คอลัมน์ FK เป็นปลายทาง" `customer:customerId(name)`)
 *  ⚠️ สิ่งที่ spec นี้ **ไม่มี**: ชื่อ constraint ของ FK · computed relationship (ฟังก์ชัน) ·
 *     ตารางนอก schema ที่เปิด ⇒ embed ที่ชี้ไปของพวกนี้แกะไม่ได้ และต้องถูกรายงาน ไม่ใช่ข้าม */
export function schemaFromDefinitions(definitions = {}) {
  const columns = new Map();
  const fks = new Map();
  for (const [table, def] of Object.entries(definitions)) {
    columns.set(table, new Set(Object.keys(def.properties || {})));
    const list = [];
    for (const [col, prop] of Object.entries(def.properties || {})) {
      const fk = /<fk table='([^']+)' column='([^']+)'\/>/.exec(prop?.description || '');
      if (fk) list.push({ column: col, target: fk[1], targetColumn: fk[2] });
    }
    fks.set(table, list);
  }
  return {
    columnsOf: (table) => columns.get(table) || null,
    fkTargetOf: (table, column) => fks.get(table)?.find((f) => f.column === column)?.target || null,
    /** FK ทุกเส้นที่ตารางนี้ถือ — `{ column, target, targetColumn }` (ใช้พิสูจน์ว่า embed มีเส้นเชื่อมจริง) */
    fksOf: (table) => fks.get(table) || [],
  };
}

/* ── เส้นเชื่อมระหว่างตารางแม่กับ embed (PGRST200 / PGRST201) ──────────────────────
 *
 * 🐞 รอบแรกของงานนี้ดูแค่ว่า "ชื่อปลายทางเป็นตาราง" ⇒ `quotations → formulas(id)` (ไม่มี FK)
 *    กับ `quotations → document_signature_evidence(id)` (มี FK 3 เส้น) ผ่านเขียว และถูกนับว่า
 *    "ตรวจแล้ว" ทั้งที่ฐานตอบ PGRST200 / PGRST201 **ทั้ง query** — จอว่างแบบเดียวกับ 42703
 *    ข้อมูลที่ต้องใช้อยู่ในมือตั้งแต่แรก: OpenAPI เขียน `<fk table=… column=…/>` ให้ทุกคอลัมน์ FK
 *
 * กติกาที่ยิงยืนยันกับฐานจริงแล้ว (24/09 · GET limit=0):
 *   · นับ FK ตรงทั้งสองทิศ (แม่ถือ FK ไปปลายทาง + ปลายทางถือ FK กลับมาที่แม่) · 0 เส้น = PGRST200 ·
 *     เกิน 1 เส้นโดยไม่มี hint = PGRST201
 *   · self-reference นับเส้นละครั้ง — `quotations → quotations(id)` (FK เดียว) 200 ·
 *     `sales_orders → sales_orders(id)` (revisedFromId + supersededById) PGRST201
 *   · hint ตรงกับเส้นเมื่อเป็น คอลัมน์ FK · คอลัมน์ที่ถูกอ้าง (`!id` ตรงทุกเส้นที่ชี้ `id` ⇒ PGRST201) ·
 *     หรือชื่อ constraint · PostgREST ใช้ hint **ตัวแรก** ตัวเดียว (`!dealId!title` 200 · `!title!dealId` PGRST200)
 *   · hint ที่เป็นคอลัมน์ของสองตารางนี้แต่ไม่ใช่เส้นเชื่อม (`!title` · `!customerId`) = PGRST200
 * ⚠️ ชื่อ constraint: OpenAPI ไม่มี ⇒ เทียบได้แค่ชื่อตั้งต้นของ Postgres `<ตาราง>_<คอลัมน์>_fkey`
 *    ชื่อที่ตั้งเอง (หรือชื่อเก่าที่ค้างหลัง rename คอลัมน์ — รีโปนี้เคย rename askId → requestId)
 *    **พิสูจน์ไม่ได้ทั้งถูกและผิด** ⇒ ไม่แดง แต่ต้องนับขึ้นบรรทัดสรุปทุกรอบ (`hintsUnverifiable`)
 *    ห้ามเดาแบบไม่สนตัวพิมพ์: constraint ที่ตั้งชื่อไม่ใส่ `"…"` ถูก Postgres พับเป็นตัวเล็กจริง
 * ⚠️ many-to-many ผ่านตารางกลาง / computed relationship — OpenAPI ไม่บอก ⇒ ออกมาเป็น "0 เส้น" แล้ว
 *    แดง (วันนี้ฐานไม่มีตารางกลางที่ FK สองตัวอยู่ใน PK เลย และรีโปไม่มี embed แบบนี้) · ถ้าวันหนึ่ง
 *    แดงเพราะเรื่องนี้ ให้สอนด่านรู้จักตารางกลาง ไม่ใช่ข้ามเส้นนั้น */
const defaultFkName = (l) => `${l.owner}_${l.column}_fkey`;

/** FK ตรงระหว่างสองตาราง ทั้งสองทิศ — `{ owner, column, target, targetColumn }` */
function linksBetween(schema, parent, target) {
  const links = schema.fksOf(parent).filter((f) => f.target === target).map((f) => ({ owner: parent, ...f }));
  if (target !== parent) {
    for (const f of schema.fksOf(target)) if (f.target === parent) links.push({ owner: target, ...f });
  }
  return links;
}

/** ตัดสินเส้นเชื่อมของ embed หนึ่งก้อน
 *  @returns { why } = ฐานจะไม่รับ/พิสูจน์ไม่ได้ (รายงาน) · { hint: 'checked'|'unverifiable'|null } = ผ่าน */
function linkVerdict(schema, parent, target, hint) {
  const links = linksBetween(schema, parent, target);
  const list = (ls) => ls.map((l) => `${l.owner}.${l.column}`).join(' · ');
  if (!links.length) {
    return {
      why: `ไม่มี FK เชื่อม ${parent} ↔ ${target} ในสคีมา ⇒ ฐานตอบ PGRST200 ทั้ง query`
        + ' (ถ้าตั้งใจเชื่อมผ่านตารางกลาง many-to-many หรือ computed relationship — ด่านยังไม่รู้จัก ต้องสอนเพิ่ม)',
    };
  }
  if (!hint) {
    if (links.length === 1) return { hint: null };
    return { why: `${parent} ↔ ${target} มี FK ${links.length} เส้น (${list(links)}) ⇒ ฐานตอบ PGRST201 ทั้ง query — ใส่ \`!คอลัมน์FK\` เลือกเส้น` };
  }
  const matched = links.filter((l) => hint === l.column || hint === l.targetColumn || hint === defaultFkName(l));
  if (matched.length === 1) return { hint: 'checked' };
  if (matched.length > 1) return { why: `\`!${hint}\` ยังตรงกับ FK ${matched.length} เส้น (${list(matched)}) ⇒ ฐานตอบ PGRST201 — ใช้ชื่อคอลัมน์ FK แทน` };
  if (schema.columnsOf(parent)?.has(hint) || schema.columnsOf(target)?.has(hint)) {
    return { why: `\`!${hint}\` เป็นคอลัมน์ที่ไม่ใช่ FK ระหว่าง ${parent} ↔ ${target} (เส้นที่มี: ${list(links)}) ⇒ ฐานตอบ PGRST200 ทั้ง query` };
  }
  return { hint: 'unverifiable' };
}

/**
 * ตรวจข้อความ select หนึ่งจุดกับสคีมา — ชั้นบนสุดกับ `table` แล้วไล่ลงทุก embed ทุกชั้น
 * โดยเทียบคอลัมน์ข้างในกับ **ตารางปลายทางของ embed** (ไม่ใช่ alias และไม่ใช่ตารางแม่)
 *
 * ตารางปลายทาง = ชื่อหลัง `:` ก่อน `!`/`(` ถ้าเป็นตาราง/วิวในสคีมา · ถ้าไม่ใช่แต่เป็นคอลัมน์
 * FK ของตารางแม่ (`customer:customerId(name)`) ก็ตาม FK ไป · นอกนั้น **แกะไม่ได้ = รายงาน**
 * แล้วต้องมี FK เชื่อมแม่กับปลายทางแบบไม่กำกวม (`linkVerdict` ข้างบน) — ไม่งั้นก็รายงาน
 *
 * ⚠️ `!hint` ไม่ใช่คอลัมน์ของตารางปลายทาง — เป็นตัวเลือกเส้น FK · ตรวจกับเส้นที่มีจริงได้เมื่อเป็น
 *    ชื่อคอลัมน์หรือชื่อ constraint ตั้งต้น (`hintsChecked`) · ชื่อ constraint ตั้งเองพิสูจน์ไม่ได้
 *    ⇒ ไม่แดงแต่ **นับไว้** (`hintsUnverifiable`)
 * ⚠️ `count` เปล่า ๆ (หรือ `n:count`) = จำนวนแถวแบบเก่าของ PostgREST ไม่ใช่คอลัมน์ — ใช้ได้
 *    **เฉพาะเมื่ออยู่คนเดียวในชั้นนั้น** ทั้งชั้นบนสุดและใน embed (ยิงจริง 24/09:
 *    `quotations?select=count` 200 · `order_items(count)` 200 · แต่ `id,count` · `*,count` ·
 *    `order_items(id,count)` · `count,deal:sales_deals(id)` ได้ 400 42803 ทั้ง query)
 *    ⚠️ ternary ที่ขาหนึ่งเป็น `count` เดี่ยว ๆ จะถูกรวมกับอีกขาแล้วแดงผิด (รีโปไม่มีรูปนี้วันนี้)
 *
 * @param schema `schemaFromDefinitions(…)` — `{ columnsOf, fkTargetOf, fksOf }`
 * @returns { missing: [{ table, name, via }], unresolved: [{ via, why }],
 *            embeds, names, hintsChecked, hintsUnverifiable } — `via` = เส้นทาง embed (ว่าง = ชั้นบนสุด)
 *            `embeds` = ก้อนที่ผ่านครบ (ปลายทาง + เส้นเชื่อม) · ก้อนที่ติดเส้นเชื่อมยังถูกไล่คอลัมน์ข้างใน
 */
export function checkSelectText(text, table, schema, via = '') {
  const out = { missing: [], unresolved: [], embeds: 0, names: 0, hintsChecked: 0, hintsUnverifiable: 0 };
  const { columns, embeds, broken, items } = parseSelect(text);
  for (const why of broken) out.unresolved.push({ via, why });

  const cols = schema.columnsOf(table) || new Set();
  // ⚠️ นับชื่อซ้ำครั้งเดียวต่อชั้น — ternary แกะค่าคงที่ตัวเดียวกันทั้งสองขา (ดู check-select-columns)
  for (const name of new Set(columns)) {
    if (name === 'count' && !cols.has('count')) {
      if (items > 1) {
        out.unresolved.push({
          via,
          why: `\`count\` ปนกับชิ้นอื่นใน select ชั้นเดียวกัน (${shortPiece(text)}) ⇒ ฐานตอบ 42803 (GROUP BY) ทั้ง query`
            + ' — `count` เปล่า ๆ ใช้ได้เฉพาะตอนอยู่คนเดียว เช่น `items:order_items(count)`',
        });
      }
      continue;
    }
    if (via) out.names += 1;
    if (!cols.has(name)) out.missing.push({ table, name, via });
  }

  const seen = new Set();
  for (const e of embeds) {
    if (seen.has(e.piece)) continue; // ขาทั้งสองของ ternary ให้ embed ชิ้นเดิมซ้ำ — ตรวจครั้งเดียว
    seen.add(e.piece);
    const label = `${e.spread ? '...' : ''}${e.alias ? `${e.alias}:` : ''}${e.target}${e.hints.concat(e.join || []).map((h) => `!${h}`).join('')}`;
    const path = via ? `${via} › ${label}` : label;
    let target = schema.columnsOf(e.target) ? e.target : null;
    // `customer:customerId(...)` — คอลัมน์ FK ของแม่เป็นปลายทาง ⇒ เส้นเชื่อมคือคอลัมน์นั้นเอง ไม่ต้องพิสูจน์ซ้ำ
    const viaFkColumn = !target && Boolean(schema.fkTargetOf(table, e.target));
    if (viaFkColumn) target = schema.fkTargetOf(table, e.target);
    if (!target || !schema.columnsOf(target)) {
      out.unresolved.push({
        via: path,
        why: `\`${e.target}\` ไม่ใช่ตาราง/วิวในสคีมาที่ด่านโหลด และไม่ใช่คอลัมน์ FK ของ ${table}`
          + ' — พิมพ์ผิด (ฐานตอบ PGRST200) หรือเป็นชื่อ constraint/computed relationship ที่ OpenAPI ไม่บอก'
          + ' (PostgREST รับ `ชื่อ_fkey(...)` เป็นปลายทางได้ แต่ด่านตรวจไม่ได้ ⇒ เขียน `ตาราง!ชื่อ_fkey(...)` แทน)'
          + ` ⇒ คอลัมน์ข้างใน (${shortPiece(e.inner) || 'ว่าง'}) ไม่มีใครตรวจ`,
      });
      continue;
    }
    const link = viaFkColumn ? { hint: null } : linkVerdict(schema, table, target, e.hints[0]);
    if (link.why) out.unresolved.push({ via: path, why: link.why });
    else {
      out.embeds += 1;
      if (link.hint === 'checked') out.hintsChecked += 1;
      if (link.hint === 'unverifiable') out.hintsUnverifiable += 1;
    }
    // เส้นเชื่อมพังก็ยังไล่คอลัมน์ข้างในต่อ — ตารางปลายทางรู้แล้ว ชื่อผิดในนั้นต้องขึ้นมาพร้อมกันในรอบเดียว
    const inner = checkSelectText(e.inner, target, schema, path);
    out.missing.push(...inner.missing);
    out.unresolved.push(...inner.unresolved);
    out.embeds += inner.embeds;
    out.names += inner.names;
    out.hintsChecked += inner.hintsChecked;
    out.hintsUnverifiable += inner.hintsUnverifiable;
  }
  return out;
}

/**
 * ตัวแกะที่เดินข้ามไฟล์ได้ — แยกการอ่านไฟล์ออกมาเป็น `readSource` เพื่อให้เทสต์ป้อน
 * ไฟล์ปลอมได้โดยไม่ต้องแตะดิสก์
 * @param srcRoot     โฟลเดอร์ `src` (ใช้แปล `@/…`)
 * @param readSource  (path) → ข้อความในไฟล์ หรือ null ถ้าไม่มีไฟล์นั้น
 * @param label       (path) → ชื่อที่เอาไว้พิมพ์ในข้อความ blocked
 */
export function createSelectResolver({ srcRoot, readSource, label = (f) => f }) {
  /** ไฟล์ปลายทางของ `import … from '<spec>'` — ตาม `@/` กับ path สัมพัทธ์เท่านั้น */
  function moduleFile(fromFile, specifier) {
    let base;
    if (specifier.startsWith('@/')) base = join(srcRoot, specifier.slice(2));
    else if (specifier.startsWith('.')) base = join(dirname(fromFile), specifier);
    else return null; // แพ็กเกจภายนอก — ไม่ตาม
    for (const cand of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js'), join(base, 'index.mjs')]) {
      if (readSource(cand) !== null) return cand;
    }
    return null;
  }

  /** `import { X as NAME } from '…'` ที่ให้ชื่อ NAME มา */
  function findImport(file, src, name) {
    const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      for (const raw of m[1].split(',')) {
        const parts = raw.trim().split(/\s+as\s+/);
        const local = (parts[1] || parts[0] || '').trim();
        if (local !== name) continue;
        return { file: moduleFile(file, m[2]), exported: parts[0].trim(), from: m[2] };
      }
    }
    return null;
  }

  function resolveIdent(name, ctx, depth, seen) {
    if (depth >= MAX_IDENT_DEPTH) return { text: '', blocked: [`${name} — ซ้อนลึกเกิน ${MAX_IDENT_DEPTH} ชั้น`] };

    const eq = findDecl(ctx.src, name, ctx.at);
    if (eq !== null) {
      const mark = `${ctx.file}#${eq}`;
      if (seen.has(mark)) return { text: '', blocked: [`${name} — ประกาศวนกลับมาที่เดิม`] };
      const init = initializerAt(ctx.src, eq);
      if (init === null) return { text: '', blocked: [`${name} — หาจุดจบของประกาศไม่ได้`] };
      const r = resolveAll(fragmentsOf(init), { ...ctx, at: eq }, depth + 1, new Set(seen).add(mark));
      if (!r.text.trim() && !r.blocked.length) return { text: '', blocked: [`${name} — ประกาศแล้วแต่ไม่มีสตริงอยู่ในนั้น`] };
      return r;
    }

    const imported = findImport(ctx.file, ctx.src, name);
    if (!imported) return { text: '', blocked: [`${name} — ไม่เจอที่ประกาศในไฟล์นี้ และไม่ได้ import เข้ามาแบบ { ชื่อ }`] };
    if (!imported.file) return { text: '', blocked: [`${name} — import จาก '${imported.from}' (นอก src/ หรือหาไฟล์ไม่เจอ)`] };
    const mark = `${imported.file}::${imported.exported}`;
    if (seen.has(mark)) return { text: '', blocked: [`${name} — import วนกลับมาที่เดิม`] };
    const modSrc = readSource(imported.file);
    const r = resolveIdent(
      imported.exported,
      { file: imported.file, src: modSrc, at: modSrc.length },
      depth + 1,
      new Set(seen).add(mark),
    );
    // บอกให้รู้ว่าต้องไปดูไฟล์ไหน ไม่ใช่ไฟล์ที่เรียกใช้
    return { text: r.text, blocked: r.blocked.map((b) => `${b} [${label(imported.file)}]`) };
  }

  function resolveAll(frags, ctx, depth, seen) {
    const parts = [];
    const blocked = [];
    for (const f of frags) {
      if (f.lit !== undefined) { parts.push(f.lit); continue; }
      if (f.opaque) { blocked.push(f.opaque); continue; }
      const r = resolveIdent(f.ident, ctx, depth, seen);
      if (r.text) parts.push(r.text);
      blocked.push(...r.blocked);
    }
    return { text: parts.join(', '), blocked };
  }

  /** @returns { text, blocked, viaName } — `viaName` = มีชื่อตัวแปรเข้ามาเกี่ยว (ของเดิมมองไม่เห็น) */
  return function resolveSelect(expr, ctx) {
    const frags = fragmentsOf(expr);
    const viaName = frags.some((f) => f.ident || f.opaque);
    const { text, blocked } = resolveAll(frags, ctx, 0, new Set());
    return { text, blocked: [...new Set(blocked)], viaName };
  };
}
