// ── เส้นที่ส่ง "ไบต์ที่ผู้ใช้อัปไว้" กลับออกจากโดเมนของระบบ ─────────────────────────────
//
// ของที่พังแล้วไม่มีใครเห็น (ตรวจ 08/10/2569):
//  ① `'Content-Type': att.mimeType || …` + `inline` — `mimeType` ใน ref เป็นค่าที่ client ประกาศมาเองตอนบันทึก
//     ⇒ แนบไฟล์แล้วประกาศ `text/html` = หน้าเว็บที่รันสคริปต์ด้วยคุกกี้ของคนที่กดเปิด (stored XSS)
//  ② `Response.redirect(att.fileUrl, 307)` โดยไม่ตรวจปลายทาง — `fileUrl` ก็เป็นค่าจาก client
//     ⇒ ลิงก์ที่ขึ้นต้นด้วยโดเมนของระบบแต่พาไปเว็บอื่น (open redirect)
//  ③ เส้นสตรีมใหม่ที่ไม่มีใครทบทวน — ก๊อปเส้นเก่ามาแล้วพาช่องโหว่เดิมมาด้วย
// ⇒ header ต้องมาจาก `attachmentFileHeaders` ตัวเดียว (ชนิดคิดจากนามสกุล · nosniff · ชนิดที่ไม่ปลอดภัย
//   บังคับดาวน์โหลด) · redirect ต้องผ่าน `attachmentUrlError` ก่อน · เส้นที่ดึงไบต์ต้องอยู่ในทะเบียนข้างล่าง
//   ("ดึงไบต์" = เรียกตัวดึงเองใน route.js **หรือ** import โมดูลที่เรียกตัวดึง — ลึกหนึ่งชั้น · ดู `byteRoutes`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachmentFileHeaders } from '@/lib/master/attachmentTypes';
import { attachmentUrlError } from '@/lib/master/attachmentStorage';

const API_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(API_DIR, '..', '..');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([;,{}()\s])\/\/ .*$/gm, '$1');
const readRoute = (rel) => stripComments(readFileSync(path.join(API_DIR, rel), 'utf8'));

/* ทะเบียนเส้นที่ดึงไบต์จาก Drive / ถังเก็บไฟล์ (ดึงเอง หรือผ่านโมดูลที่ import มาหนึ่งชั้น) —
   **เพิ่มชื่อที่นี่หลังทบทวนแล้วเท่านั้น**
   client: ไบต์/ชื่อ/ชนิด มาจากสิ่งที่ผู้ใช้อัปหรือประกาศ และส่งออกให้เบราว์เซอร์ตรง ๆ
           ⇒ ต้องผ่านด่าน header + redirect ข้างล่างทุกข้อ
   system: ไบต์ที่ระบบสร้าง/แปลง/ห่อเอง หรือไม่ได้ส่งออกเลย และชนิดเป็นค่าคงที่ในโค้ด (เหตุผลกำกับรายเส้น)
           ⇒ ห้าม redirect · Content-Type ต้องเป็นค่าคงที่ · เปิดในหน้าได้ต้องมี nosniff */
const STREAM_ROUTES = {
  'updates/[id]/file/route.js': { kind: 'client' },
  'master/attachments/[id]/file/route.js': { kind: 'client' },
  'sales-planning/quotations/[id]/file/route.js': { kind: 'client' },
  'sales-planning/sales-orders/[id]/confirm-file/route.js': { kind: 'client' },
  'sales-planning/sales-orders/[id]/payment-file/route.js': { kind: 'client' },
  'service/visits/[id]/file/route.js': { kind: 'client' },
  'account/signature/[versionId]/file/route.js': { kind: 'system', why: 'ลายเซ็นที่ server แปลงเป็น PNG เอง · Content-Type คงที่ + nosniff' },
  'service/surveys/[id]/document/route.js': { kind: 'system', why: 'เอกสารที่ระบบตรึงเอง (HTML/PDF) · Content-Type คงที่ + nosniff' },
  'upload/commit/route.js': { kind: 'system', why: 'อ่านไบต์กลับมาตรวจตอนรับไฟล์ ไม่ได้ส่งออกให้เบราว์เซอร์' },
  // ── เส้นที่ไม่ได้เรียกตัวดึงเอง แต่ import โมดูลที่เรียก (ลึกหนึ่งชั้น) ──
  'sales-planning/quotations/[id]/issued/pdf/route.js': { kind: 'system', why: 'PDF ที่ระบบพิมพ์และตรึงเอง (issuedQuotationPdf) · application/pdf คงที่ + nosniff' },
  'tax/reports/route.js': { kind: 'system', why: 'ไฟล์แนบของผู้ใช้ถูกห่อเป็น ZIP ที่ server สร้าง (registrationFiles) · application/zip คงที่ + attachment เสมอ — ไม่มีทางเปิดในหน้า' },
  'sales-planning/quotations/[id]/approval/route.js': { kind: 'system', why: 'ตรึงเอกสาร/สั่งพิมพ์ PDF ตอนอนุมัติ — ไบต์ลายเซ็นถูกฝังฝั่ง server ตอบเป็น JSON' },
  'sales-planning/quotations/[id]/route.js': { kind: 'system', why: 'ฝังลายเซ็นเป็น data URI ลงเอกสารที่ตรึง — ตอบเป็น JSON ไม่ส่งไบต์ออก' },
  'sales-planning/sales-orders/[id]/route.js': { kind: 'system', why: 'อ่านลายเซ็นมาฝังในเอกสาร SO ฝั่ง server — ตอบเป็น JSON ไม่ส่งไบต์ออก' },
  'service/surveys/[id]/send/route.js': { kind: 'system', why: 'เตรียมรูปประเมินพื้นที่ (ย่อ/แปลงด้วย sharp) ก่อนตรึงเอกสาร — ตอบเป็น JSON ไม่ส่งไบต์ออก' },
};
/* เส้นของไฟล์นี้ (สี่เส้นที่เคยส่ง header เอง/redirect ดิบ) — ตรวจละเอียดกว่าทะเบียนรวม */
const HARDENED = [
  'updates/[id]/file/route.js',
  'sales-planning/quotations/[id]/file/route.js',
  'sales-planning/sales-orders/[id]/confirm-file/route.js',
  'sales-planning/sales-orders/[id]/payment-file/route.js',
];

const BYTE_SOURCE = /getFileStream\(|createSignedUrls?\(|\.download\(/;
/* "ประกาศ" ตัวดึง ≠ "เรียก" ตัวดึง — ไม่ตัดออก `lib/drive.js` (ที่ประกาศ getFileStream) จะนับเป็นโมดูลดึงไบต์
   แล้วทุกเส้นที่ import มันเพื่ออัป/ลบไฟล์ก็ถูกลากเข้าทะเบียนหมด · เส้นที่เรียก getFileStream เองถูกจับตรง ๆ อยู่แล้ว */
const pullsBytes = (source) => BYTE_SOURCE.test(source.replace(/\bfunction getFileStream\(/g, 'function getFileStream ('));

const posix = (file, base) => path.relative(base, file).split(path.sep).join('/');
function walk(dir, keep, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}
const allRoutes = () => walk(API_DIR, (name) => name === 'route.js').map((full) => posix(full, API_DIR));

/* ไฟล์ที่ import ชี้ไป — `@/…` กับทางสัมพัทธ์ (เส้น alias ที่ `export … from '../x/route'`) · แพ็กเกจนอก = ข้าม */
function importedFiles(file, source, known) {
  const out = [];
  for (const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    const base = spec.startsWith('@/') ? path.join(SRC_DIR, spec.slice(2))
      : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;
    if (!base) continue;
    const hit = [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')].find((candidate) => known.has(candidate));
    if (hit) out.push(hit);
  }
  return out;
}

/* เส้นที่ดึงไบต์ = route.js ที่เรียกตัวดึงเอง **หรือ** import โมดูลใต้ src ที่เรียกตัวดึง (ลึกหนึ่งชั้น)
   — ทางที่สองคือทางที่โค้ดชุดนี้ใช้เป็นปกติ (route บาง ๆ เรียก lib) ถ้าดูแต่ตัว route ด่านนี้ไม่มีวันแดง
   คืน Map<เส้น, ทางที่ถึงไบต์[]> เพื่อบอกในข้อความว่าเข้าทะเบียนเพราะอะไร */
function byteRoutes() {
  const modules = new Map();
  for (const full of walk(SRC_DIR, (name) => /\.(?:js|mjs)$/.test(name) && !/\.test\./.test(name))) {
    modules.set(full, pullsBytes(stripComments(readFileSync(full, 'utf8'))));
  }
  const found = new Map();
  for (const rel of allRoutes().sort()) {
    const full = path.join(API_DIR, rel);
    const via = [];
    if (modules.get(full)) via.push('เรียกเอง');
    for (const dep of importedFiles(full, readRoute(rel), modules)) {
      if (dep !== full && modules.get(dep)) via.push(posix(dep, SRC_DIR));
    }
    if (via.length) found.set(rel, [...new Set(via)]);
  }
  return found;
}

/* ตัด `new Response(<ไบต์>, { … })` ออกมาทีละก้อน — เฉพาะตัวที่ส่งไบต์ที่ดึงมา (`data` จากถังเก็บ ·
   stream จาก Drive) ไม่รวม Response.json */
function byteResponses(source) {
  const out = [];
  for (const m of source.matchAll(/new Response\((data|Readable\.toWeb\(stream\)),/g)) {
    const end = source.indexOf(');', m.index);
    out.push(source.slice(m.index, end + 2));
  }
  return out;
}
/* รูปเดียวที่ยอมให้ส่งไบต์ของผู้ใช้: header ทั้งก้อนคือ `attachmentFileHeaders(…)` — หรือ spread ตัวนั้นแล้วทับได้
   เฉพาะ Cache-Control · ปิดก้อนทันที ⇒ ไม่มีที่ให้แทรก key อื่น (ไม่ว่าจะเขียน key แบบไหน) หรือสลับเป็นตัวช่วยตัวอื่น */
const HELPER_CALL = 'attachmentFileHeaders\\((?:[^()]|\\([^()]*\\))*\\)';
const CLIENT_RESPONSE = new RegExp(
  '^new Response\\((?:data|Readable\\.toWeb\\(stream\\)),\\s*\\{\\s*headers: '
  + `(?:${HELPER_CALL}|\\{ \\.\\.\\.${HELPER_CALL}, 'Cache-Control': '[^']*' \\})`
  + ',?\\s*\\}\\);$',
);

test('⭐ ทุกเส้นใต้ src/app/api ที่ดึงไบต์จาก Drive/ถังเก็บไฟล์ (เรียกเองหรือผ่านโมดูลหนึ่งชั้น) ต้องอยู่ในทะเบียนที่ทบทวนแล้ว', () => {
  const reach = byteRoutes();
  const found = [...reach.keys()];
  const unreviewed = found.filter((rel) => !STREAM_ROUTES[rel]);
  assert.deepEqual(
    unreviewed,
    [],
    `เส้นใหม่ที่ดึงไบต์แต่ยังไม่อยู่ในทะเบียน: ${unreviewed.map((rel) => `${rel} ← ${reach.get(rel).join(' + ')}`).join(', ')}\n`
    + 'ทบทวนก่อน: สิทธิ์อ่านผูกกับระเบียนแม่ · header จาก attachmentFileHeaders · ไม่ redirect ตามค่าในแถวโดยไม่ตรวจ '
    + 'แล้วจึงเพิ่มชื่อใน STREAM_ROUTES',
  );
  // ทะเบียนต้องไม่มีชื่อค้าง — เส้นที่ถูกลบ/ย้ายแล้วยังอยู่ในลิสต์ = ลิสต์ที่ไม่มีใครเชื่อ
  const stale = Object.keys(STREAM_ROUTES).filter((rel) => !found.includes(rel));
  assert.deepEqual(stale, [], `ชื่อในทะเบียนที่ไม่ดึงไบต์แล้ว (ลบออก): ${stale.join(', ')}`);
  // ตัวจับทางอ้อมต้องจับได้จริง — สองเส้นนี้ไม่มีตัวดึงในตัว route เลย ถึงไบต์ผ่าน lib อย่างเดียว
  assert.deepEqual(reach.get('sales-planning/quotations/[id]/issued/pdf/route.js'), ['lib/sales/issuedQuotationPdf.js']);
  assert.deepEqual(reach.get('tax/reports/route.js'), ['lib/tax/registrationFiles.js']);
  // และไม่เหมารวม: เส้นที่ import lib/drive มาอัป/ลบไฟล์อย่างเดียว ไม่ใช่เส้นดึงไบต์
  assert.equal(reach.has('cron/drive-orphans/route.js'), false);
});

test('⭐ เส้นที่ส่งไฟล์ของผู้ใช้: header มาจาก attachmentFileHeaders — ไม่ตั้ง Content-Type จากค่าที่เก็บในแถว', () => {
  for (const [rel, { kind }] of Object.entries(STREAM_ROUTES)) {
    if (kind !== 'client') continue;
    const source = readRoute(rel);
    assert.match(source, /import \{[^}]*\battachmentFileHeaders\b[^}]*\} from '@\/lib\/master\/attachmentTypes';/, rel);
    assert.doesNotMatch(source, /att\.mimeType \|\|/, `${rel}: ใช้ชนิดที่ client ประกาศเป็น Content-Type`);
    // `\]?` = key แบบ computed (`['Content-Type']: …`) ก็นับ
    assert.doesNotMatch(source, /['"]Content-Type['"]\]?\s*:/i, `${rel}: ตั้ง Content-Type เอง — ต้องมาจาก attachmentFileHeaders`);
    assert.doesNotMatch(source, /['"]Content-Disposition['"]\]?\s*:/i, `${rel}: ตั้ง Content-Disposition เอง (inline ทุกชนิด = เปิด .html ในหน้า)`);
    assert.doesNotMatch(source, /data\.type/, `${rel}: ชนิดจาก Blob ของถังเก็บ = ค่าที่ client ประกาศตอนอัป`);
    /* ด่านเชิงบวก — ข้างบนบอกได้แค่ว่า "ไม่มีรูปที่รู้ว่าผิด" · import ค้างไว้แต่ไม่ใช้ / ตัด header ทิ้ง /
       สลับเป็นตัวช่วยของตัวเอง ผ่านด่านข้างบนหมด ⇒ ทุก Response ที่ไม่ใช่ JSON ต้องเป็นรูปที่ยอมรูปเดียว */
    const responses = byteResponses(source);
    assert.ok(responses.length >= 1, `${rel}: ไม่พบ new Response ที่ส่งไบต์ — เส้น client ต้องตอบผ่าน attachmentFileHeaders`);
    assert.equal(
      (source.match(/new (?:Next)?Response\(/g) || []).length,
      responses.length,
      `${rel}: มี new Response ที่ด่านนี้ไม่รู้จัก (ไบต์จากตัวแปรชื่ออื่น/ไม่มี header)`,
    );
    for (const r of responses) {
      assert.match(r, CLIENT_RESPONSE, `${rel}: Response ที่ส่งไบต์ไม่ได้ใช้ header จาก attachmentFileHeaders ล้วน ๆ\n${r}`);
    }
  }
});

test('⭐ เส้นของระบบ: Content-Type เป็นค่าคงที่ในโค้ด · ตอบที่เปิดในหน้าได้ต้องมี nosniff', () => {
  for (const [rel, { kind, why }] of Object.entries(STREAM_ROUTES)) {
    if (kind !== 'system') continue;
    assert.ok(why, `${rel}: เส้น system ต้องมีเหตุผลกำกับ`);
    const source = readRoute(rel);
    // ค่าคงที่ = สตริงล้วน หรือชื่อค่าคงที่ตัวพิมพ์ใหญ่ — ไม่ใช่ค่าจากแถว/ตัวแปร (`att.mimeType` · `data.type`)
    for (const m of source.matchAll(/['"]Content-Type['"]\]?\s*:\s*([^,\n}]+)/gi)) {
      assert.match(m[1].trim(), /^(?:'[^'$]*'|"[^"$]*"|[A-Z][A-Z0-9_]*)$/, `${rel}: Content-Type ไม่ใช่ค่าคงที่ — ${m[1].trim()}`);
    }
    const sent = (source.match(/new (?:Next)?Response\(/g) || []).length;
    if (!sent) continue;
    // บังคับดาวน์โหลดทุกตอบ (เช่น ZIP/Excel) = ไม่มีทางถูกเปิดเป็นเอกสารในหน้า · นอกนั้นต้องกันเบราว์เซอร์เดาชนิด
    const dispositions = [...source.matchAll(/['"]Content-Disposition['"]\]?\s*:\s*(\S+)/gi)].map((m) => m[1]);
    const downloadOnly = dispositions.length === sent && dispositions.every((value) => /^[`'"]attachment;/.test(value));
    if (!downloadOnly) assert.match(source, /'X-Content-Type-Options': 'nosniff'/, `${rel}: ส่งไฟล์ที่เปิดในหน้าได้โดยไม่มี nosniff`);
  }
});

test('⭐ สี่เส้นที่แก้: ทุก Response ที่ส่งไบต์ใช้ attachmentFileHeaders(att) และคงนโยบายแคชเดิม', () => {
  const expected = {
    'updates/[id]/file/route.js': { drive: 1, bucket: 0 },
    'sales-planning/quotations/[id]/file/route.js': { drive: 1, bucket: 1 },
    'sales-planning/sales-orders/[id]/confirm-file/route.js': { drive: 0, bucket: 1 },
    'sales-planning/sales-orders/[id]/payment-file/route.js': { drive: 0, bucket: 1 },
  };
  for (const rel of HARDENED) {
    const source = readRoute(rel);
    const responses = byteResponses(source);
    const drive = responses.filter((r) => r.startsWith('new Response(Readable'));
    const bucket = responses.filter((r) => r.startsWith('new Response(data'));
    assert.deepEqual({ drive: drive.length, bucket: bucket.length }, expected[rel], `${rel}: จำนวนทางส่งไบต์เปลี่ยน — ทบทวนแล้วแก้เลขนี้`);
    // ไม่มี `new Response(` ตัวอื่นที่ส่งไบต์โดยไม่ถูกนับ (เช่น เปลี่ยนชื่อตัวแปรแล้วหลุดด่าน)
    assert.equal((source.match(/new Response\(/g) || []).length, responses.length, `${rel}: มี new Response ที่ด่านนี้ไม่รู้จัก`);
    for (const r of drive) {
      assert.match(r, /\{ headers: attachmentFileHeaders\(att\) \}/, `${rel}: ทาง Drive`);
    }
    for (const r of bucket) {
      // หลักฐานในถังส่วนตัว: ห้ามแคช — ทับค่า max-age=60 ของตัวกลาง **หลัง** spread เสมอ
      assert.match(r, /headers: \{ \.\.\.attachmentFileHeaders\(att\), 'Cache-Control': 'private, no-store' \}/, `${rel}: ทางถังส่วนตัว`);
    }
  }
});

test('⭐ redirect ตามค่าในแถว ต้องผ่านตัวตรวจปลายทางก่อนเสมอ — ไม่ผ่าน = ตอบเหมือนไม่มีไฟล์', () => {
  for (const [rel, { kind }] of Object.entries(STREAM_ROUTES)) {
    const source = readRoute(rel);
    const redirects = [...source.matchAll(/(?:Response\.redirect|NextResponse\.redirect|\bredirect)\(/g)];
    if (kind !== 'client') {
      assert.equal(redirects.length, 0, `${rel}: เส้นของระบบไม่ควร redirect`);
      continue;
    }
    for (const m of redirects) {
      const before = source.slice(Math.max(0, m.index - 400), m.index);
      assert.match(before, /if \(attachmentUrlError(?:ForEnv)?\(att\.fileUrl\)\) (?:\{|return Response\.json\()/, `${rel}: redirect ที่ไม่ตรวจปลายทาง`);
    }
  }
  const withRedirect = {
    'updates/[id]/file/route.js': 1,
    'sales-planning/quotations/[id]/file/route.js': 1,
    'sales-planning/sales-orders/[id]/confirm-file/route.js': 0,
    'sales-planning/sales-orders/[id]/payment-file/route.js': 0,
  };
  for (const rel of HARDENED) {
    const source = readRoute(rel);
    assert.equal((source.match(/Response\.redirect\(/g) || []).length, withRedirect[rel], rel);
    if (!withRedirect[rel]) continue;
    assert.match(source, /import \{ attachmentUrlError \} from '@\/lib\/master\/attachmentStorage';/, rel);
    assert.match(
      source,
      /if \(!att\.driveFileId\) \{\s*if \(attachmentUrlError\(att\.fileUrl\)\) return Response\.json\(\{ error: 'ไม่พบไฟล์แนบ' \}, \{ status: 404 \}\);\s*return Response\.redirect\(att\.fileUrl, 307\);\s*\}/,
      `${rel}: ตรวจปลายทาง → 404 → redirect ต้องเรียงกันในบล็อกเดียว`,
    );
  }
});

test('🔴 confirm-file ของใบสั่งขาย: ส่งได้เฉพาะไฟล์ใน private bucket — ไม่มีทาง Drive / ทาง redirect ตามค่าในแถว', () => {
  const rel = 'sales-planning/sales-orders/[id]/confirm-file/route.js';
  const source = readRoute(rel);
  /* 🐞 `driveFileId` / `fileUrl` ใน ref เป็นค่าที่ client ส่งมาตอนบันทึก ⇒ เดิมใส่ id ไฟล์ Drive ของใครก็ได้แล้วเส้นนี้
     stream ออกมาด้วยสิทธิ์ของระบบ · ทั้งสองทางถูกถอด — กลับมาเมื่อไรต้องแดง */
  assert.doesNotMatch(source, /driveFileId/, 'อ่าน driveFileId จาก ref');
  assert.doesNotMatch(source, /getFileStream/, 'stream จาก Drive');
  assert.doesNotMatch(source, /redirect/i, 'redirect ตามค่าในแถว');
  assert.doesNotMatch(source, /fileUrl|attachmentUrlError|Readable|@\/lib\/drive/, 'ของที่เหลือจากทาง Drive/ลิงก์');
  // ref ที่ไม่มี storagePath = ไม่มีไฟล์ (ด่านแรกหลังหยิบ ref · ก่อนแตะถังเก็บ)
  assert.match(source, /const att = list\[idx\];\s*if \(!att \|\| !att\.storagePath\) \{\s*return Response\.json\(\{ error: 'ไม่พบไฟล์แนบ' \}, \{ status: 404 \}\);\s*\}/);
  // ไบต์ออกทางเดียว: ถังส่วนตัว หลังด่าน bucket + โฟลเดอร์ของใบเสนอราคาต้นทาง
  const pinAt = source.indexOf('isQuotationEvidencePath(att.storagePath, order.quotationId)');
  const downloadAt = source.indexOf('.download(att.storagePath)');
  assert.ok(pinAt > 0 && downloadAt > pinAt, 'ด่าน path ต้องมาก่อนดึงไบต์');
  assert.equal((source.match(/\.download\(/g) || []).length, 1);
  assert.match(source, /if \(att\.storageBucket !== privateBucket\s*\|\| !\(order\.quotationId && isQuotationEvidencePath\(att\.storagePath, order\.quotationId\)\)\) \{\s*return Response\.json\(\{ error: 'ไม่พบไฟล์แนบ' \}, \{ status: 404 \}\);\s*\}/);
});

test('เส้นที่คุยกับ Drive ต้องรันบน Node และ import ตัว Drive แบบ dynamic', () => {
  for (const rel of Object.keys(STREAM_ROUTES)) {
    const source = readRoute(rel);
    if (!/getFileStream\(/.test(source)) continue;
    assert.match(source, /export const runtime = 'nodejs';/, rel);
    assert.match(source, /const \{ [^}]*\bgetFileStream\b[^}]*\} = await import\('@\/lib\/drive'\);/, rel);
    assert.doesNotMatch(source, /^import [^;]*from '@\/lib\/drive';/m, `${rel}: import แบบ static`);
  }
});

// ── พฤติกรรมของตัวกลางที่เส้นข้างบนพึ่ง ──────────────────────────────────────────────
test('attachmentFileHeaders: ชนิดคิดจากนามสกุล ไม่เชื่อค่าที่ประกาศ · ชนิดที่รันสคริปต์ได้ถูกบังคับดาวน์โหลด', () => {
  // .html ที่หลุดเข้ามา (ref เก่า/ยิง API ตรง) แม้ประกาศว่าเป็น text/html
  const html = attachmentFileHeaders({ fileName: 'หลักฐาน.html', mimeType: 'text/html' });
  assert.equal(html['Content-Type'], 'application/octet-stream');
  assert.match(html['Content-Disposition'], /^attachment; filename\*=UTF-8''/);
  assert.equal(html['X-Content-Type-Options'], 'nosniff');

  // .svg รันสคริปต์ได้เมื่อเปิดเป็นเอกสาร — ไม่ว่าจะประกาศชนิดอะไรมา
  for (const mimeType of ['image/svg+xml', 'text/html', '']) {
    const svg = attachmentFileHeaders({ fileName: 'logo.svg', mimeType });
    assert.equal(svg['Content-Type'], 'application/octet-stream');
    assert.match(svg['Content-Disposition'], /^attachment;/);
    assert.equal(svg['X-Content-Type-Options'], 'nosniff');
  }
  /* ประกาศ .svg ว่าเป็น PNG: ชนิดที่ประกาศอยู่ในลิสต์ที่รับ จึงถูกส่งเป็น image/png (inline) — ปลอดภัยเพราะ nosniff
     ทำให้เบราว์เซอร์ถอดเป็นรูป PNG เท่านั้น (ถอดไม่ได้ = รูปแตก) ไม่มีทางถูกอ่านเป็นเอกสาร SVG/HTML */
  const fake = attachmentFileHeaders({ fileName: 'logo.svg', mimeType: 'image/png' });
  assert.equal(fake['Content-Type'], 'image/png');
  assert.equal(fake['X-Content-Type-Options'], 'nosniff');

  // ของที่ใช้จริงทุกวันยังเปิดในหน้าได้เหมือนเดิม — แม้ ref จะประกาศชนิดอันตรายมา ก็ยึดนามสกุล
  const pdf = attachmentFileHeaders({ fileName: 'สลิป.pdf', mimeType: 'text/html' });
  assert.equal(pdf['Content-Type'], 'application/pdf');
  assert.match(pdf['Content-Disposition'], /^inline;/);
  const png = attachmentFileHeaders({ fileName: 'slip.PNG', mimeType: 'text/html' });
  assert.equal(png['Content-Type'], 'image/png');
  assert.match(png['Content-Disposition'], /^inline;/);
  assert.equal(png['X-Content-Type-Options'], 'nosniff');

  // ref ที่ไม่มีชื่อ/ไม่มีนามสกุล + ชนิดนอกลิสต์ = ไบต์ดิบ ดาวน์โหลดอย่างเดียว
  for (const ref of [{ mimeType: 'text/html' }, { fileName: 'noext', mimeType: 'application/xhtml+xml' }, {}, undefined]) {
    const h = attachmentFileHeaders(ref);
    assert.equal(h['Content-Type'], 'application/octet-stream');
    assert.match(h['Content-Disposition'], /^attachment;/);
  }
});

test('attachmentUrlError: redirect ได้เฉพาะ https ของโฮสต์ไฟล์ Google — ที่เหลือถือว่าไม่มีไฟล์', () => {
  assert.equal(attachmentUrlError('https://drive.google.com/file/d/abc/view'), null);
  assert.equal(attachmentUrlError('https://docs.google.com/document/d/abc/edit'), null);
  for (const bad of [
    'https://evil.example/x', 'https://drive.google.com.evil.example/x', 'https://evil.example/?u=https://drive.google.com/',
    'http://drive.google.com/file/d/abc', '//evil.example', '/api/x', 'javascript:alert(1)', 'data:text/html,x', 'x', '', null, undefined,
    'https://drive.google.com@evil.example/x',
  ]) {
    assert.ok(attachmentUrlError(bad), `ต้องไม่ผ่าน: ${bad}`);
  }
});
