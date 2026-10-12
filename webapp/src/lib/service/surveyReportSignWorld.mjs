// ── ของปลอมของลายเซ็นผู้ลงนาม — ใช้ร่วมกันระหว่างเทสต์กับตัวเรนเดอร์ทดลอง (harness) · PR-SIG §7 ─────────────────
//
// ⚠️ **ไม่ใช่โค้ดของแอป** — ไม่มี route/จอไหน import ไฟล์นี้ (นามสกุล .mjs · อยู่นอก bundle) · ไม่แตะฐานจริง ไม่แตะคลังจริง
//
// สามอย่าง (สัญญาของงวด A ที่งวด B เรียก — สเปก §14):
//   ① `makeSignaturePng({ kind })`      PNG ของลายเซ็นปลอม — `'signed'` เส้นปากกาบนพื้นโปร่งใส · `'blank'` โปร่งใสทั้งแผ่น ·
//                                        `'faint'` เส้นเทาอ่อน (ผ่านคลังได้ แต่ด่านหมึกของตัวเตรียมลายเซ็นต้องปฏิเสธ)
//                                        เขียนไฟล์ PNG เองด้วย zlib — **ซิงก์ ไม่ใช้ sharp** ⇒ เทสต์ที่ไม่ได้ย่อรูปไม่ต้องโหลดของหนัก
//                                        และไบต์นิ่งทุกรอบ (seed เดิม = ไฟล์เดิม = sha เดิม)
//   ② `signatureTables(users)`           แถวของ `user_signatures` + `user_signature_versions` ตามรูปที่ฐานเก็บ (mig 0122) —
//                                        ผู้เรียก `Object.assign(tables, signatureTables([...]))` ลงฐานปลอมของตัวเอง
//   ③ `withSignatureStorage(db, files)`  ติดคลัง `signature-assets` **แบบอ่านอย่างเดียว** ให้ฐานปลอมตัวไหนก็ได้ ·
//                                        ถังอื่น (`survey-report`) ส่งต่อให้ที่เก็บเดิมของฐานปลอม หรือเก็บในหน่วยความจำเมื่อฐานปลอมไม่มี
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { SIGNATURE_BUCKET, SIGNATURE_MIME, inspectSignaturePng, signatureStoragePrefix } from '../signatures.js';

/* ── ① PNG ─────────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** RGBA 8 บิต → ไฟล์ PNG (ชนิดสี 6 · ไม่ interlace) — รูปเดียวกับที่คลังลายเซ็นรับ (`inspectSignaturePng`) */
function encodePng(rgba, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ตัวสุ่มที่นิ่ง (mulberry32) — seed เดิมได้เส้นเดิม */
function seeded(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ประทับหัวปากกากลม (ขอบนุ่มหนึ่งพิกเซล) ลงบนผืน — alpha เก็บค่าสูงสุด เส้นที่ทับกันไม่เข้มเกิน */
function stamp(rgba, width, height, cx, cy, radius, [r, g, b]) {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius + 1));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const cover = Math.max(0, Math.min(1, radius + 0.5 - Math.hypot(x - cx, y - cy)));
      if (cover <= 0) continue;
      const at = (y * width + x) * 4;
      const alpha = Math.round(cover * 255);
      if (alpha <= rgba[at + 3]) continue;
      rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = alpha;
    }
  }
}

const INK = Object.freeze({ signed: [26, 42, 108], faint: [206, 208, 212] });

/**
 * PNG ของลายเซ็นปลอม — เส้นปากกาลากต่อเนื่อง (ตัวเขียนหวัด + ขีดเส้นใต้) บนพื้น **โปร่งใส**
 * @param opts.kind    `'signed'` (ค่าตั้งต้น) | `'blank'` (ไม่มีเส้นเลย) | `'faint'` (เส้นเทาอ่อน — จางกว่าเกณฑ์ของด่านหมึก)
 * @param opts.seed    เส้นคนละแบบต่อ seed (ค่าตั้งต้น 1) — ไฟล์นิ่งทุกรอบ
 * @param opts.width · opts.height  ขนาดไฟล์ (ค่าตั้งต้น 640×240 — ใหญ่กว่ากรอบ 600×200 ของตัวเตรียม จึงถูกย่อจริง)
 * @returns `Buffer` ของไฟล์ PNG ที่คลังลายเซ็นรับได้ (`inspectSignaturePng` ผ่าน)
 */
export function makeSignaturePng({ kind = 'signed', seed = 1, width = 640, height = 240 } = {}) {
  const rgba = Buffer.alloc(width * height * 4);
  if (kind !== 'blank') {
    const ink = INK[kind] || INK.signed;
    const rand = seeded(seed);
    const pad = width * 0.1;
    const span = width - pad * 2;
    const mid = height * 0.46;
    // ตัวเขียน: คลื่นสองความถี่ซ้อนกัน + วงวนถอยหลังเป็นช่วง ๆ (เหมือนตัวหนังสือหวัด)
    const f1 = 5 + rand() * 4;
    const f2 = 11 + rand() * 6;
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    const loop = 0.045 + rand() * 0.03;
    const amp = height * (0.2 + rand() * 0.08);
    const steps = width * 6;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6;
      const x = pad + span * (t + loop * Math.sin(f2 * 2 * Math.PI * t + p2));
      const y = mid + amp * taper * (0.62 * Math.sin(f1 * 2 * Math.PI * t + p1) + 0.38 * Math.sin(f2 * 2 * Math.PI * t + p2 + 1.3));
      const pen = 1.7 + 0.9 * Math.abs(Math.cos(f1 * Math.PI * t + p1));
      stamp(rgba, width, height, x, y, pen, ink);
    }
    // ขีดเส้นใต้ลากเฉียงขึ้นเล็กน้อย
    const from = pad * (1.2 + rand());
    const to = width - pad * (0.6 + rand() * 0.6);
    for (let i = 0; i <= width * 3; i += 1) {
      const t = i / (width * 3);
      stamp(rgba, width, height, from + (to - from) * t, height * 0.84 - height * 0.07 * t + 3 * Math.sin(t * 9 + p1), 1.6, ink);
    }
  }
  return encodePng(rgba, width, height);
}

/* ── ② ตาราง ───────────────────────────────────────────────────────────────── */

const sha256Of = (buffer) => `sha256:${createHash('sha256').update(buffer).digest('hex')}`;

/**
 * แถวของตารางลายเซ็นสำหรับฐานปลอม — รูปเดียวกับที่ `publish_user_signature_version_atomic` เขียน (mig 0122)
 *
 * @param users `[userId | { userId, png, versionNumber, versionId, name, revoked, storagePath, sha256 }]`
 *   · สตริง = ผู้ใช้ที่มีลายเซ็นปกติ (เส้นคนละแบบตามลำดับ) · `png` ไม่ส่ง = `makeSignaturePng({ seed: ลำดับ + 1 })`
 *   · `revoked: true` = มีรากแต่ไม่มีฉบับที่ใช้อยู่ (`activeVersionId: null`) — ฉบับเก่ายังอยู่ในตาราง/คลัง (ไฟล์ไม่ถูกลบตอนยกเลิก)
 *   · `storagePath` / `sha256` = ทับค่าที่คิดให้ (จำลองแถวที่เพี้ยน: ที่อยู่นอกโฟลเดอร์ของเจ้าของ · sha ไม่ตรงไฟล์)
 *   · ผู้ใช้ที่ **ไม่มีลายเซ็นเลย** = ไม่ต้องใส่ในลิสต์ (ไม่มีราก)
 * @returns `{ user_signatures, user_signature_versions }` — บวกสองคีย์ที่ **ไม่ถูกไล่** (`Object.assign` / spread ไม่พาลงตาราง):
 *   `files`    `{ [storagePath]: Buffer }` ส่งให้ `withSignatureStorage`
 *   `versions` `{ [userId]: แถวของฉบับ }` ไว้เทียบในเทสต์
 */
export function signatureTables(users = []) {
  const roots = [];
  const versions = [];
  const files = {};
  const byUser = {};
  (Array.isArray(users) ? users : []).forEach((entry, index) => {
    const user = typeof entry === 'string' ? { userId: entry } : (entry || {});
    const userId = String(user.userId ?? '');
    if (!userId) return;
    const png = Buffer.isBuffer(user.png) ? user.png : makeSignaturePng({ seed: index + 1 });
    const size = inspectSignaturePng(png).value || { width: 640, height: 240 };
    const versionNumber = Number(user.versionNumber) || 1;
    const signatureId = `signature-${userId}`;
    const versionId = String(user.versionId || `signature-version-${userId}-${versionNumber}`);
    const storagePath = user.storagePath ?? `${signatureStoragePrefix(userId)}${versionId}.png`;
    const createdAt = '2026-10-09T02:00:00.000+00:00';
    const version = {
      id: versionId, signatureId, versionNumber, storageBucket: SIGNATURE_BUCKET, storagePath, mimeType: SIGNATURE_MIME,
      sizeBytes: png.length, sha256: user.sha256 ?? sha256Of(png), width: size.width, height: size.height,
      createdById: userId, createdByName: user.name ?? null, createdByRole: null, createdByTeam: null, createdAt,
    };
    roots.push({ id: signatureId, userId, activeVersionId: user.revoked ? null : versionId, createdAt, updatedAt: createdAt });
    versions.push(version);
    files[storagePath] = png;
    byUser[userId] = version;
  });
  const out = { user_signatures: roots, user_signature_versions: versions };
  Object.defineProperty(out, 'files', { value: files, enumerable: false });
  Object.defineProperty(out, 'versions', { value: byUser, enumerable: false });
  return out;
}

/* ── ③ คลัง ───────────────────────────────────────────────────────────────── */

const NOT_FOUND = { message: 'Object not found', status: 400, statusCode: '404' };

/**
 * ติดคลังลายเซ็นปลอมให้ฐานปลอม — **ตัวเดิมถูกแก้ในที่และคืนกลับ** (`db.storage` ถูกแทน)
 *
 * · ถัง `signature-assets`: `download(path)` เท่านั้น — `upload` / `remove` = โยน (ไม่มีขั้นไหนของเอกสารประเมินมีสิทธิ์เขียนคลังลายเซ็น)
 *   `files[path]` = `Buffer` (ไฟล์) · ฟังก์ชัน `(signal) => Buffer | Promise<Buffer>` (จำลองคลังค้าง: คืน promise ที่ไม่จบ) ·
 *   `Error` (คลังตอบ `{ error }` ด้วยข้อความนั้น) · ไม่มีคีย์ = ไม่พบไฟล์ (404)
 * · ถังอื่น: ส่งต่อให้ `db.storage` เดิม · ฐานปลอมที่ไม่มี (หรือ getter ที่โยน) = เก็บในหน่วยความจำ (`vault.objects`)
 * @returns `db` ตัวเดิม + คีย์ `signatureVault` (ไม่ถูกไล่): `{ files, downloads: string[], objects: Map }`
 */
export function withSignatureStorage(db, files = {}) {
  let base = null;
  try { base = db.storage || null; } catch { base = null; }
  const vault = { files, downloads: [], objects: new Map() };
  const signatureBucket = {
    async download(path, _options, parameters) {
      vault.downloads.push(path);
      const hit = Object.hasOwn(vault.files, path) ? vault.files[path] : undefined;
      if (hit === undefined || hit === null) return { data: null, error: { ...NOT_FOUND } };
      if (hit instanceof Error) return { data: null, error: { message: hit.message, status: 500, statusCode: '500' } };
      const body = typeof hit === 'function' ? await hit(parameters?.signal) : hit;
      return { data: new Blob([body]), error: null };
    },
    upload() { throw new Error('คลังลายเซ็น (signature-assets) อ่านอย่างเดียว — ขั้นของเอกสารประเมินห้ามเขียน'); },
    remove() { throw new Error('คลังลายเซ็น (signature-assets) อ่านอย่างเดียว — ขั้นของเอกสารประเมินห้ามลบ'); },
  };
  const memoryBucket = (bucket) => ({
    async download(path) {
      const hit = vault.objects.get(`${bucket}/${path}`);
      return hit ? { data: new Blob([hit.body]), error: null } : { data: null, error: { ...NOT_FOUND } };
    },
    async upload(path, body, options = {}) {
      const key = `${bucket}/${path}`;
      if (vault.objects.has(key)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      vault.objects.set(key, { body: Buffer.from(body), contentType: options.contentType });
      return { data: { path }, error: null };
    },
  });
  const storage = {
    from: (bucket) => (bucket === SIGNATURE_BUCKET ? signatureBucket : (base ? base.from(bucket) : memoryBucket(bucket))),
  };
  Object.defineProperty(db, 'storage', { value: storage, configurable: true, enumerable: true, writable: true });
  Object.defineProperty(db, 'signatureVault', { value: vault, configurable: true, enumerable: false });
  return db;
}
