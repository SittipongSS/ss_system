#!/usr/bin/env node
/* ── ด่านกันเพดาน 1,000 แถว ──────────────────────────────────────────────────
 *
 * 🐞 โปรเจกต์นี้ตั้ง Supabase → Settings → API → **Max rows = 1000** ⇒ `.select()`
 * ที่ไม่มี `.range()` / `.limit()` จะได้แค่ 1,000 แถวแรก **โดยไม่มี error**
 * ตอนพบบั๊ก (2026-08-16) มี 3 ตารางที่เกินเพดานไปแล้วและคืนข้อมูลไม่ครบอยู่จริง
 *
 * ด่านนี้ตรวจเฉพาะตารางใน `GROWING_TABLES` — ตารางที่โตตามการใช้งานไปเรื่อย ๆ
 * ไม่ใช่ทะเบียนที่มีจำนวนจำกัดโดยธรรมชาติ (หมวดสินค้า/วันหยุด/ผู้ใช้)
 *
 * เพิ่มตารางเข้าลิสต์เมื่อมันเริ่มโตตามธุรกรรม · เอาออกได้เฉพาะเมื่อมันหยุดโต
 *
 * รัน: npm run check:rowcap
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative } from 'node:path';

const ROOT = process.cwd();

/* เพดานจำนวน "จุดอ่านแบบไร้ขอบเขต" ต่อตาราง — **ขึ้นไม่ได้ ลงได้อย่างเดียว**
   (กติกาเดียวกับ ratchet ชั้นสไตล์เก่าใน audit-ui.mjs)
 *
 * ตัวเลขในวงเล็บ = จำนวนแถวจริงบนฐาน ณ 2026-08-16 · ตารางสามตัวแรกเกินเพดาน
 * 1,000 ไปแล้ว ⇒ จุดที่เหลือของสามตัวนั้นคือ **หนี้ที่ต้องรูดลงก่อนเพื่อน**
 *
 * ⚠️ ทำไมยังไม่บังคับให้เป็น 0 ทั้งหมด: จุดส่วนใหญ่กรองด้วย `projectId`/`dealId`
 * ของใบเดียว ซึ่งไม่มีทางแตะพันแถว การไล่แก้ทั้ง 180 จุดในครั้งเดียวจึงเป็นการรื้อ
 * ที่เสี่ยงกว่าตัวบั๊กเอง · ด่านนี้จึงกันของใหม่ก่อน แล้วรูดเพดานลงทีละงาน
 *
 * 2026-08-16 — ตั้งเพดานครั้งแรกหลังแก้ 3 จุดที่ยืนยันว่าคืนข้อมูลไม่ครบอยู่จริง
 * (project_tasks 34→29 · personal_tasks 20→12)
 *
 * 2026-08-16 (รอบสอง) — รูดเพดานลงจาก 180 → 169 หลังแก้วิธีนับของด่านเอง ไม่ใช่หลังแก้
 * โค้ดแอป: ของเดิมกวาดหน้าต่าง 14 บรรทัดแล้วหา `.limit(` ในนั้น ซึ่งผิดสองทาง
 *   · นับ `count: 'exact', head: true` เป็นความผิด ทั้งที่มันไม่คืนแถวสักแถว (−4)
 *   · ตัดก้อนที่บรรทัดว่าง ทำให้ query ที่ต่อ `.limit()` ทีหลังผ่านตัวแปรถูกนับผิด (−8)
 *   · และในทางกลับกัน **ปล่อยของจริงผ่านฟรี** เมื่อ `.limit()` ของคำสั่งข้างเคียง
 *     บังเอิญตกอยู่ในหน้าต่าง — dept_requests จึงโผล่เพิ่มจาก 13 เป็น 14 (+1 ของจริง)
 *
 * 2026-08-27 — sales_deals 34→33 หลังถอดสาขา `project_tasks` ออกจาก `/api/pm/my-work`
 * (ไม่มีจอไหนอ่านผลนั้นแล้วตั้งแต่ cb3f37a0 — ดูหัวไฟล์ route นั้น) · ตัวอ่าน
 * `project_tasks` เองห่อ `fetchAllResult` อยู่แล้ว ด่านนี้จึงไม่เคยนับ เพดานไม่ขยับ */
const CAPS = {
  /* 🔴 **ตัวเลขชุดนี้ตั้งใหม่ 2026-08-25 หลังแก้วิธีนับ** — ของเดิมนับการเขียน
     (`.insert(rows).select()`) และจุดที่ห่อ `fetchAll` ไว้บรรทัดก่อนหน้า เป็นความผิด
     ⇒ ตัวเลขบวมเกินจริงจนหกตารางขึ้นไปเกินเพดานเองโดยที่ไม่มีใครเพิ่มจุดอ่านใหม่เลย
     เทียบก่อน/หลังแก้ตัวนับ: sales_deals 39→34 · project_tasks 29→21 · personal_tasks 15→10 */
  project_tasks: 21,            // 4,653 แถว — เกินเพดานแล้ว (ทุกจุดอ่านมีขอบเขตครบ)
  notifications: 0,             // 3,392 แถว — เกินแล้ว แต่ทุก query กรอง userId + มี limit/cursor
  personal_tasks: 10,           // 1,165 แถว — เกินแล้ว (ข้ามพันระหว่าง 16→25/08)
  sales_deals: 33,              // 353
  products: 24,                 // 281 — ต้นทาง dropdown สินค้าทุกช่องในระบบ
  quotations: 9,                // 198
  customers: 8,                 // 181 — ต้นทาง dropdown ลูกค้าทุกช่องในระบบ
  projects: 8,                  // 155
  dept_requests: 14,            // 74
  sales_orders: 12,             // 74
  sales_leads: 6,               // 181
  /* ⚠️ 0 แถววันนี้ แต่ชีต Stock-Machine.xlsx ที่รอนำเข้ามี **1,239 เครื่อง** ⇒ เกิน
     เพดาน 1,000 ตั้งแต่แถวแรกที่ลง · ขึ้นทะเบียนไว้ตั้งแต่ยังว่างเพื่อให้ทุกจุดอ่าน
     ใหม่ถูกบังคับให้ห่อ fetchAll ตั้งแต่ต้น ไม่ใช่ไปไล่ตามหลังตอนตัวเลขเพี้ยนแล้ว
     (mig 0332 · เฟส A ของทะเบียนเครื่อง) */
  service_assets: 0,
  attachments: 4,
  sahamit_po_lines: 11,
  sahamit_forecast_lines: 10,
  sahamit_pos: 6,
  sales_deal_forecast_lines: 5,
  sales_order_installments: 3,
  sahamit_fc_flags: 2,
  material_prices: 2,
  audit_logs: 0,
  document_updates: 0,
};
const GROWING_TABLES = Object.keys(CAPS);

/* ⚠️ "มีเพดานแล้ว" ต้องมาจาก **คำสั่งเดียวกัน** เท่านั้น — เดิมด่านนี้กวาดหน้าต่าง 14
   บรรทัดแล้วหา `.limit(` ในนั้น ซึ่งพลาดได้สองทาง: `.limit()` ของคำสั่งข้างเคียงปล่อย
   ของจริงผ่านฟรี · และคำสั่งที่ต่อ `.limit()` ทีหลังผ่านตัวแปรถูกนับเป็นความผิดทั้งที่ไม่ผิด */
const capped = (text) => /\.(range|limit|single|maybeSingle)\(/.test(text) || /fetchAll(?:Result)?\s*\(/.test(text);

/* `select('id', { count: 'exact', head: true })` ไม่คืนแถวสักแถว (คืนแต่ตัวเลขใน header)
   เพดาน max_rows จึงไม่เกี่ยวเลย — เดิมนับเป็นความผิด ทำให้ตัวเลขหนี้บวมเกินจริง */
const HEAD_ONLY = /head:\s*true/;

/* 🐞 **นับการเขียนเป็นการอ่าน** (แก้ 2026-08-25) — `.insert(rows).select()` และ
   `.update(patch).select()` มี `.select(` อยู่ในก้อนจึงรอดด่านบรรทัดบน แต่มันคืนเฉพาะ
   *แถวที่เพิ่งเขียน* ซึ่งเท่ากับจำนวนที่เราส่งไปเอง — เพดาน max_rows ไม่เกี่ยวเลย
   ตัวอย่างที่เคยถูกนับเป็นหนี้: `sales/dealProjectLink.js` (insert ไทม์ไลน์แล้ว select กลับ) */
const WRITE_THEN_SELECT = /\.(insert|update|upsert|delete)\(/;

/* 🐞 **มองไม่เห็น `fetchAll` ที่อยู่บรรทัดก่อนหน้า** (แก้ 2026-08-25) — แพตเทิร์นที่ใช้จริง
   ทั้งระบบคือส่ง "ฟังก์ชันสร้าง query" เข้าไป:

       const allTasks = (supabase) => fetchAllResult(() => supabase
         .from('project_tasks').select('*')          ← ด่านเริ่มนับที่บรรทัดนี้
         .order('stepOrder').order('id'));

   `statementAt` เริ่มที่บรรทัด `.from(` แล้วมองไปข้างหน้าเท่านั้น ⇒ ตัวห่อที่อยู่
   *ข้างบน* หลุดสายตา แล้วจุดที่แก้เรียบร้อยแล้วถูกนับเป็นหนี้ต่อไปเรื่อย ๆ
   (ของจริงที่โดน: `pm/my-work/route.js` · `pm/project-tasks/route.js` · `lib/pm/taskKpi.js`)
   มองย้อน 4 บรรทัดพอ — ตัวห่อกับ `.from(` อยู่ห่างกันไม่เกินนั้นในทุกจุดที่ใช้จริง */
function wrappedInFetchAll(lines, start) {
  return /fetchAll(?:Result)?\s*\(/.test(lines.slice(Math.max(0, start - 4), start).join('\n'));
}

/* ก้อน "คำสั่งเดียว": ไล่จนวงเล็บสมดุลและเจอ `;` หรือจนกว่าจะขึ้นคำสั่งใหม่
   (สูงสุด 14 บรรทัด) — ไม่หยุดแค่เพราะเจอบรรทัดว่างเหมือนเดิม */
function statementAt(lines, start) {
  let depth = 0;
  let text = '';
  for (let j = start; j < Math.min(start + 14, lines.length); j++) {
    const line = lines[j];
    text += (j === start ? '' : '\n') + line;
    for (const ch of line) {
      if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth -= 1;
    }
    if (depth <= 0 && /;\s*$/.test(line.trim())) break;
    if (j > start && depth <= 0 && /^\s*(const|let|var|return|if|for|while|})/.test(lines[j + 1] || '')) break;
  }
  return text;
}

const files = execSync('find src -name "*.js" ! -name "*.test.*"', { cwd: ROOT })
  .toString().trim().split('\n').filter(Boolean);

const offenders = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hit = lines[i].match(/\.from\(\s*['"]([a-zA-Z_]+)['"]\s*\)/);
    if (!hit || !GROWING_TABLES.includes(hit[1])) continue;

    const chunk = statementAt(lines, i);
    if (!/\.select\(/.test(chunk)) continue;         // เขียนอย่างเดียว ไม่เกี่ยว
    if (HEAD_ONLY.test(chunk)) continue;             // นับอย่างเดียว ไม่คืนแถว → เพดานไม่เกี่ยว
    if (WRITE_THEN_SELECT.test(chunk)) continue;     // `.insert(rows).select()` = คืนเฉพาะแถวที่เพิ่งเขียน
    if (capped(chunk)) continue;
    if (wrappedInFetchAll(lines, i)) continue;       // `fetchAll(() => supabase` อยู่บรรทัดก่อนหน้า
    if (/\.eq\(\s*['"]id['"]/.test(chunk)) continue; // ค้นด้วย primary key = แถวเดียว

    /* query ที่ถูกเก็บใส่ตัวแปรก่อน แล้วค่อยปิดท้ายทีหลัง (เช่น notifications.js:214
       ที่ต่อ `.limit()` อีกสามบรรทัดถัดไปผ่าน `pageOrder(query)`) — ตามเฉพาะบรรทัด
       ที่อ้างตัวแปรนั้นจริง ไม่ใช่ทั้งหน้าต่าง เพื่อไม่ให้ `.limit()` ของคำสั่งข้าง ๆ
       ที่ไม่เกี่ยวกันมาปล่อยผ่านให้ฟรี */
    const assigned = chunk.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (assigned) {
      const name = new RegExp(`\\b${assigned[1]}\\b`);
      const tail = lines.slice(i, Math.min(i + 25, lines.length)).filter((l) => name.test(l)).join('\n');
      if (capped(tail) || /fetchAll/.test(tail)) continue;
    }

    offenders.push({ key: `${relative(ROOT, file)}:${i + 1}`, table: hit[1] });
  }
}

const counts = offenders.reduce((acc, o) => ({ ...acc, [o.table]: (acc[o.table] || 0) + 1 }), {});
const over = Object.entries(CAPS)
  .map(([table, cap]) => ({ table, cap, now: counts[table] || 0 }))
  .filter((row) => row.now > row.cap);

if (over.length) {
  console.error('\n❌ มีจุดอ่านแบบไร้ขอบเขตเพิ่มขึ้น — เพดาน 1,000 แถวของ PostgREST จะตัดข้อมูลเงียบ ๆ\n');
  for (const row of over) {
    console.error(`   ${row.table}: ${row.now} จุด (เพดาน ${row.cap})`);
    for (const o of offenders.filter((x) => x.table === row.table)) console.error(`       ${o.key}`);
  }
  console.error(`
วิธีแก้: ใช้ \`fetchAll\` / \`fetchAllResult\` จาก @/lib/supabaseFetchAll
   const { data, error } = await fetchAllResult(() => supabase
     .from('${over[0].table}').select('*')
     .order('createdAt', { ascending: false })
     .order('id', { ascending: true }));   // ← ต้องมีลำดับที่นิ่ง ไม่งั้นหน้าซ้อนกัน

ถ้าจุดนั้นจำกัดแถวด้วยวิธีอื่นอยู่แล้ว (กรองด้วยใบเดียว) และเพดานควรขยับ — ห้ามขยับขึ้น
ให้ยกจุดเก่าจุดหนึ่งมาแก้แทน แล้วเพดานจะพอดีเท่าเดิม\n`);
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
const capTotal = Object.values(CAPS).reduce((a, b) => a + b, 0);
console.log(`check:rowcap ผ่าน — จุดอ่านไร้ขอบเขตบนตารางที่โตได้: ${total}/${capTotal} (เพดาน ขึ้นไม่ได้)`);
if (total < capTotal) {
  console.log('  ⭐ ต่ำกว่าเพดานแล้ว — รูดเพดานลงใน scripts/check-row-cap.mjs ให้ตรงกับของจริง');
}
