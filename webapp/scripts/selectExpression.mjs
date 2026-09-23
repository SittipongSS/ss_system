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

/** ชิ้นที่เป็น embed `alias:table(...)` / `table(...)` — คนละตาราง ด่านไม่ตรวจ */
const EMBED = /\w+\s*(?::\s*\w+\s*)?\([^)]*\)/g;

/** ชื่อคอลัมน์ชั้นบนสุดที่อ่านได้จากข้อความของ select
 *  ⚠️ `alias:table(...)` / `table(...)` = ตารางอื่น (embed) — ด่านไม่รู้จักคอลัมน์ของมัน จึงตัดทิ้ง
 *     (ตัดไปเท่าไรนับได้ที่ `embeddedNames` — ต้องโชว์ในสรุป ไม่งั้นคนอ่านนึกว่าตรวจครบ)
 *  ⚠️ ชิ้นที่มีอักขระนอก [A-Za-z0-9_] (เช่น `metadata->>projectType`) ข้าม — เดาไม่ได้ ไม่เดา
 *  ⚠️ ชิ้นว่างข้าม — ตัวคั่นของ `.join(', ')` ที่ปนเข้ามาจะตกตรงนี้เอง */
export function columnNamesOf(text) {
  const flat = String(text).replace(EMBED, '');
  const out = [];
  for (const piece of flat.split(',')) {
    // `col::text` = cast ไม่ใช่ alias — ตัดชนิดทิ้งก่อนแยกโคลอน
    let name = piece.trim().replace(/^["']|["']$/g, '').split('::')[0];
    // 🐞 `alias:column` ชั้นบนสุด = เปลี่ยนชื่อที่โผล่ใน JSON — **คอลัมน์จริงอยู่หลังโคลอน**
    //    ของเดิมหยิบตัวหน้า (ชื่อ alias) ไปเทียบกับสคีมา ⇒ query ที่ถูกต้องกลับแดง
    //    ตอนที่ด่านอ่านแต่สตริงสั้น ๆ ยังไม่เคยระเบิด แต่พอแกะค่าคงที่ชุดใหญ่ได้แล้ว
    //    (ชุดพวกนั้นเปลี่ยนชื่อคอลัมน์กันเป็นเรื่องปกติ) มันเป็นแค่เรื่องของเวลา —
    //    และด่านที่แดงทั้งที่โค้ดถูก คือด่านที่กำลังจะโดนปิดทิ้ง
    const colon = name.indexOf(':');
    if (colon >= 0) name = name.slice(colon + 1);
    name = name.split('!')[0].trim().replace(/^["']|["']$/g, '');
    if (!name || name === '*' || /[^A-Za-z0-9_]/.test(name)) continue;
    out.push(name);
  }
  return out;
}

/** ชื่อที่ถูก **ตัดทิ้ง** เพราะอยู่ใน embed — ไม่ได้ถูกตรวจกับตารางไหนเลย
 *  ⚠️ มีไว้เพื่อ "นับความไม่รู้" ให้เป็นตัวเลข: จุดที่แกะค่าคงที่ได้แล้วแต่ชื่อทั้งชุด
 *     ไปตกอยู่ใน embed (เช่น `` `${LIST},deal:sales_deals(${DEAL_COLUMNS})` ``) ยังนับว่า
 *     "แกะค่าได้" อยู่ดี ⇒ ถ้าไม่พิมพ์จำนวนชื่อที่ตัดทิ้งไว้ข้าง ๆ คนอ่านสรุปจะเข้าใจว่า
 *     คอลัมน์ทั้งชุดถูกตรวจแล้ว ทั้งที่ไม่มีสักชื่อ */
export function embeddedNames(text) {
  const out = [];
  for (const m of String(text).match(EMBED) || []) {
    const inner = m.slice(m.indexOf('(') + 1, -1);
    for (const piece of inner.split(',')) {
      const name = piece.trim().replace(/^["']|["']$/g, '').split(/[:!]/).pop().trim();
      // `count` เป็น aggregate ของ PostgREST ไม่ใช่คอลัมน์ — นับรวมแล้วตัวเลขจะเวอร์
      if (!name || name === '*' || name === 'count' || /[^A-Za-z0-9_]/.test(name)) continue;
      out.push(name);
    }
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
