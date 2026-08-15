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
 *     บังเอิญตกอยู่ในหน้าต่าง — dept_requests จึงโผล่เพิ่มจาก 13 เป็น 14 (+1 ของจริง) */
const CAPS = {
  project_tasks: 29,            // 2,820 แถว — เกินเพดานแล้ว
  personal_tasks: 12,           // 1,045 แถว — เกินเพดานแล้ว
  notifications: 0,             // 1,194 แถว — เกินเพดานแล้ว แต่ทุก query กรอง userId + มี limit/cursor
  sales_deals: 37,              // 277
  dept_requests: 14,            // 33
  sales_orders: 12,             // 18
  attachments: 11,              // 50
  sahamit_po_lines: 11,         // 126
  sahamit_forecast_lines: 10,   // 331
  quotations: 9,                // 77
  sales_leads: 6,               // 140
  sahamit_pos: 6,               // 112
  sales_deal_forecast_lines: 5, // 41
  sales_order_installments: 3,  // 20
  sahamit_fc_flags: 2,          // 181
  material_prices: 2,           // 0
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
    if (capped(chunk)) continue;
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
