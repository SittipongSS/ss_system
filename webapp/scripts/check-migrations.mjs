import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, 'supabase', 'migrations');

// These duplicate numeric prefixes were already committed and may already be
// recorded/applied in production. Renaming them would make an existing database
// disagree with git. Keep the exception explicit and reject every new duplicate.
//
// 0230 (2026-08-12): #1146 กับ #1147 ต่างคนต่างจอง 0230 แล้วเข้า main ทั้งคู่ภายในวันเดียว
// — CI ของแต่ละใบเขียวเพราะตอนนั้นสาขาตัวเองเห็นไฟล์ของตัวเองไฟล์เดียว พอ merge ครบ
// main ก็แดงทุก PR ที่ตามมา · **ตรวจแล้วว่ารันขึ้น production ไปแล้วทั้งคู่** จึงเปลี่ยนชื่อ
// ไม่ได้: `dept_requests."assigneeId"` มีจริง และ `entity_number_counters` มีแถว
// (AR, '-', 1000) กับ (FG, '-', 10000) ครบ ⇒ ลงทะเบียนเป็นข้อยกเว้นตามแนวเดียวกับ
// 0076/0087/0099 ⚠️ ห้ามใช้เลข 0230 ซ้ำอีก และเลขถัดไปเริ่มที่ 0231
const LEGACY_DUPLICATES = new Map([
  ['0076', ['0076_mgmt_departments.sql', '0076_product_pieces_per_case.sql']],
  ['0087', ['0087_personal_tasks_proxy_worker.sql', '0087_sales_history.sql']],
  ['0099', ['0099_chat_webhooks.sql', '0099_quotation_concurrent_create_guard.sql']],
  ['0230', ['0230_master_code_counters.sql', '0230_request_assignee.sql']],
  /* 2026-08-31 — สองสายงานทำพร้อมกันในวันเดียวกัน แล้วจองเลขเดียวกันคนละแบรนช์
     **ทั้งคู่รันบน production ไปแล้ว** จึงเปลี่ยนชื่อไม่ได้ (git จะไม่ตรงกับฐานจริง)
     หลักฐานที่ตรวจ:
       · `0325_product_brand_optional`      → `products."hasBrand"` มีอยู่จริงบนฐาน
       · `0325_unconfirm_service_...`       → `audit_logs` มี 4 แถวของ actorId
         `migration-0325` (งวด 2 · ใบ 2) และงวดเป้าหมายกลับเป็น `reported` ครบ */
  ['0325', ['0325_product_brand_optional.sql', '0325_unconfirm_service_installments_missing_coverage.sql']],
]);

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, 'en'));

const malformed = files.filter((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name));
const byVersion = new Map();

for (const name of files) {
  const version = name.slice(0, 4);
  const group = byVersion.get(version) || [];
  group.push(name);
  byVersion.set(version, group);
}

const unexpectedDuplicates = [];
const changedLegacyDuplicates = [];

for (const [version, group] of byVersion) {
  if (group.length < 2) continue;
  const expected = LEGACY_DUPLICATES.get(version);
  if (!expected) {
    unexpectedDuplicates.push(`${version}: ${group.join(', ')}`);
    continue;
  }
  if (group.join('\n') !== [...expected].sort().join('\n')) {
    changedLegacyDuplicates.push(`${version}: expected [${expected.join(', ')}], found [${group.join(', ')}]`);
  }
}

for (const [version, expected] of LEGACY_DUPLICATES) {
  if (!byVersion.has(version)) {
    changedLegacyDuplicates.push(`${version}: legacy exception is stale; expected [${expected.join(', ')}]`);
  }
}


/* ── คำสั่งที่ถูกตัดกลางทาง (วงเล็บไม่ครบ) ────────────────────────────────────
 *
 * 🐞 **ที่มา 2026-09-17**: mig 0363 ถูกประกอบด้วยการ "ยกฟังก์ชันจากไฟล์ก่อนมาทั้งก้อน"
 *   แล้วช่วงบรรทัดที่ตัดมาพลาดไปหนึ่งบรรทัด ⇒ `GRANT EXECUTE ON FUNCTION …(` ค้างไว้
 *   ไม่มี `) TO service_role;` · ไฟล์ยัง `.sql` ปกติ ด่านเลขไฟล์เขียว เทสต์เขียว
 *   **ไปพังตอนวางลง SQL Editor**: `syntax error at or near ";"` ชี้ที่บรรทัด COMMIT
 *   ซึ่งอยู่ห่างจากต้นเหตุ 8 บรรทัด
 *
 * ⚠️ ไม่ใช่ parser ของ Postgres — ตรวจแค่ "วงเล็บครบต่อคำสั่ง" ซึ่งจับคลาสนี้ได้พอดี
 *   โดยไม่ต้องมีฐานข้อมูล · ข้าม dollar-quoted block ($$…$$) กับคอมเมนต์ทั้งสองแบบ
 */
function sqlStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let inLineComment = false;
  let inBlockComment = 0;
  let inString = false;
  let dollarTag = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && sql[i + 1] === '/') { inBlockComment -= 1; i += 2; continue; }
      if (ch === '/' && sql[i + 1] === '*') { inBlockComment += 1; i += 2; continue; }
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { i += dollarTag.length; dollarTag = null; continue; }
      i += 1;
      continue;
    }
    if (inString) {
      if (ch === "'") inString = false;
      i += 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') { inLineComment = true; i += 2; continue; }
    if (ch === '/' && sql[i + 1] === '*') { inBlockComment = 1; i += 2; continue; }
    const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (tag) { dollarTag = tag[0]; i += dollarTag.length; continue; }
    if (ch === "'") { inString = true; i += 1; continue; }
    if (ch === ';') { out.push(cur.trim()); cur = ''; i += 1; continue; }
    cur += ch;
    i += 1;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const truncated = [];
for (const name of files) {
  const sql = await readFile(path.join(migrationsDir, name), 'utf8');
  for (const statement of sqlStatements(sql)) {
    const open = (statement.match(/\(/g) || []).length;
    const close = (statement.match(/\)/g) || []).length;
    if (open !== close) {
      truncated.push(`${name}: ${open} "(" vs ${close} ")" — ${statement.split('\n')[0].slice(0, 90)}`);
    }
  }
}

if (malformed.length || unexpectedDuplicates.length || changedLegacyDuplicates.length || truncated.length) {
  console.error('Migration integrity check failed.');
  if (malformed.length) console.error(`Malformed filenames:\n- ${malformed.join('\n- ')}`);
  if (unexpectedDuplicates.length) {
    console.error(`Unexpected duplicate versions:\n- ${unexpectedDuplicates.join('\n- ')}`);
    // ⚠️ เคสนี้เกิดจากสองสาขาจองเลขเดียวกันแล้วเข้า main ทั้งคู่ (CI ของแต่ละใบเขียว
    // เพราะเห็นไฟล์ของตัวเองไฟล์เดียว) — ทางแก้ขึ้นกับว่า "รันขึ้น production ไปแล้วหรือยัง"
    console.error(
      'ทางแก้: ถ้าใบที่ชนยัง **ไม่ได้รัน** บน production ให้เปลี่ยนชื่อเป็นเลขว่างถัดไป · '
      + 'ถ้ารันไปแล้วทั้งคู่ (เปลี่ยนชื่อ = ฐานข้อมูลจริงไม่ตรงกับ git) ให้ลงทะเบียนใน '
      + 'LEGACY_DUPLICATES พร้อมหลักฐานว่าตรวจอะไรถึงรู้ว่ารันแล้ว',
    );
  }
  if (changedLegacyDuplicates.length) console.error(`Changed legacy duplicate groups:\n- ${changedLegacyDuplicates.join('\n- ')}`);
  if (truncated.length) {
    console.error(`คำสั่ง SQL ที่วงเล็บไม่ครบ (คำสั่งถูกตัดกลางทาง):\n- ${truncated.join('\n- ')}`);
    console.error('ไฟล์แบบนี้พังตอนวางลง SQL Editor ไม่ใช่ตอน CI — error จะชี้ที่ COMMIT ซึ่งห่างจากต้นเหตุ');
  }
  process.exit(1);
}

const latest = files.at(-1)?.slice(0, 4) || 'none';
console.log(`Migration integrity OK: ${files.length} files, latest ${latest}.`);
console.warn(`Legacy duplicate versions are intentionally preserved: ${[...LEGACY_DUPLICATES.keys()].join(', ')}. Do not reuse them.`);
