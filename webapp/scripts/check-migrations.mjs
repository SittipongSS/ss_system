import { readdir } from 'node:fs/promises';
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

if (malformed.length || unexpectedDuplicates.length || changedLegacyDuplicates.length) {
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
  process.exit(1);
}

const latest = files.at(-1)?.slice(0, 4) || 'none';
console.log(`Migration integrity OK: ${files.length} files, latest ${latest}.`);
console.warn(`Legacy duplicate versions are intentionally preserved: ${[...LEGACY_DUPLICATES.keys()].join(', ')}. Do not reuse them.`);
