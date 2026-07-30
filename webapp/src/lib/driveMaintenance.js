// ── เครื่องมือตรวจ/ซ่อม/จัดโครง Google Drive ─────────────────────────────
// ใช้โดยหน้า ตั้งค่า → ที่เก็บไฟล์ (admin เท่านั้น) — งานทั้งหมดที่นี่ต้องรัน**บน Vercel**
// เพราะ WIF ออก token ได้เฉพาะตอนรันบนนั้น (ดูหัวไฟล์ lib/drive.js)
//
// 3 งาน:
//   1. ตรวจการเชื่อมต่อ (driveHealth)         — ตั้งค่าครบไหม คุยกับ Drive ได้ไหม เขียนไฟล์ได้ไหม
//   2. ตรวจไฟล์แนบทั้งระบบ (auditDriveFiles) — ทุกแถวชี้ไปที่ไฟล์ที่ยังอยู่จริงไหม
//   3. จัดโครงโฟลเดอร์ (planRestructure/runRestructure)
import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  FOLDER, driveEnvStatus, getDrive, getFileMeta, uploadFile, deleteFile, moveFile,
  folderPathForEntity, folderPathLabel, resolveFolderForEntity, ensureUnsortedFolder,
  ensureCustomerFolder, ensureRootFolder, ensureSubFolder, listChildren,
} from '@/lib/drive';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const sharedDriveId = () => process.env.GOOGLE_SHARED_DRIVE_ID;
const rootId = () => process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_SHARED_DRIVE_ID;

const errText = (err) => String(err?.errors?.[0]?.message || err?.message || err || 'ไม่ทราบสาเหตุ');

// ── 1. ตรวจการเชื่อมต่อ ────────────────────────────────────────────────
// คืนผลเป็นขั้น ๆ เพื่อให้รู้ว่า "พังตรงไหน" ไม่ใช่แค่ "พัง": ตั้งค่า → คุย Drive ได้ →
// เห็น Shared Drive → อ่านโฟลเดอร์ราก → (ถ้าขอ) เขียน/อ่าน/ทิ้งไฟล์ทดสอบได้
export async function driveHealth({ writeTest = false } = {}) {
  const steps = [];
  const step = (key, label, ok, detail) => { steps.push({ key, label, ok, detail }); return ok; };

  const env = driveEnvStatus();
  if (!step('env', 'ตั้งค่า environment ครบ', env.ok,
    env.ok ? 'GOOGLE_WIF_AUDIENCE · GOOGLE_SA_EMAIL · GOOGLE_SHARED_DRIVE_ID' : `ยังไม่ได้ตั้ง: ${env.missing.join(', ')}`)) {
    return { ok: false, steps };
  }

  let drive;
  try {
    drive = getDrive();
  } catch (err) {
    step('client', 'สร้าง client ของ Google', false, errText(err));
    return { ok: false, steps };
  }

  // เรียก API จริงหนึ่งครั้ง — ผ่าน = ทั้ง OIDC token, การแลก token ที่ STS และการ
  // impersonate service account ทำงานครบสาย (แยกทีละขั้นไม่ได้ googleapis ทำให้ในตัว)
  try {
    const res = await drive.drives.get({ driveId: sharedDriveId(), fields: 'id, name' });
    step('auth', 'ยืนยันตัวตนกับ Google (WIF → service account)', true, `service account: ${process.env.GOOGLE_SA_EMAIL}`);
    step('drive', 'เข้าถึง Shared Drive ได้', true, `${res.data.name} (${res.data.id})`);
  } catch (err) {
    const msg = errText(err);
    // แยกสาเหตุที่เจอบ่อยให้เป็นภาษาที่ทำอะไรต่อได้
    const hint = /oidc|token|VERCEL_OIDC/i.test(msg)
      ? 'ขอ OIDC token ไม่ได้ — โค้ดนี้ทำงานเฉพาะตอนรันบน Vercel และต้องเปิด OIDC Federation ใน Project Settings → Security'
      : /permission|forbidden|403/i.test(msg)
        ? 'ยืนยันตัวตนผ่าน แต่ service account ยังไม่มีสิทธิ์ใน Shared Drive — เพิ่มอีเมล SA เป็น Content Manager'
        : /notFound|404/i.test(msg)
          ? 'ไม่พบ Shared Drive ตาม GOOGLE_SHARED_DRIVE_ID — ตรวจค่า env ว่าเป็น id ของ Shared Drive จริง'
          : '';
    step('auth', 'ยืนยันตัวตนกับ Google (WIF → service account)', false, hint ? `${msg} · ${hint}` : msg);
    return { ok: false, steps };
  }

  try {
    const res = await drive.files.list({
      q: `'${rootId()}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'drive',
      driveId: sharedDriveId(),
    });
    const folders = (res.data.files || []).filter((f) => f.mimeType === FOLDER_MIME);
    step('root', 'อ่านโฟลเดอร์รากได้', true, `${folders.length} โฟลเดอร์: ${folders.map((f) => f.name).join(' · ') || '(ว่าง)'}`);
  } catch (err) {
    step('root', 'อ่านโฟลเดอร์รากได้', false, errText(err));
  }

  if (writeTest) {
    // เขียนไฟล์เล็ก ๆ → อ่านกลับ → ทิ้งลงถังขยะ. ทำเฉพาะตอนกดเพราะมันเขียนของจริง
    try {
      const folderId = await ensureUnsortedFolder();
      const stamp = new Date().toISOString();
      const { id } = await uploadFile(folderId, {
        buffer: Buffer.from(`ทดสอบการเชื่อมต่อ ${stamp}\n`, 'utf8'),
        name: `ทดสอบระบบ ${stamp}.txt`,
        mimeType: 'text/plain',
      });
      const meta = await getFileMeta(id, 'id, name, size');
      await deleteFile(id); // ลงถังขยะ (ไม่ลบถาวร) — ล้างเองได้จากถังขยะของ Shared Drive
      step('write', 'อัปโหลด/อ่าน/ลบไฟล์ทดสอบได้', true, `ไฟล์ทดสอบ ${meta.size || '?'} ไบต์ ถูกทิ้งลงถังขยะแล้ว`);
    } catch (err) {
      step('write', 'อัปโหลด/อ่าน/ลบไฟล์ทดสอบได้', false, errText(err));
    }
  }

  return { ok: steps.every((s) => s.ok), steps };
}

// ── 2. ตรวจไฟล์แนบทั้งระบบ ─────────────────────────────────────────────
// อ่านทุกแถวที่อ้างไฟล์บน Drive (ตาราง attachments + ไฟล์ในเธรด entity_updates)
// แล้วยิง files.get ทีละไฟล์ว่า **ยังอยู่จริงไหม** — จับเคสไฟล์ถูกลบ/ทิ้งถังขยะด้วยมือ
// ซึ่งระบบจะเงียบจนกว่าจะมีคนกดเปิดแล้วเจอ error
const CONCURRENCY = 6;

async function mapLimited(items, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    out.push(...await Promise.all(chunk.map(worker)));
  }
  return out;
}

export async function auditDriveFiles() {
  const supabase = getSupabaseAdmin();
  const [attRes, updRes] = await Promise.all([
    supabase.from('attachments').select('id, entityType, entityId, docType, fileName, fileUrl, driveFileId'),
    supabase.from('entity_updates').select('id, entityType, entityId, attachments').not('attachments', 'is', null),
  ]);
  if (attRes.error) throw attRes.error;
  if (updRes.error) throw updRes.error;

  const targets = [];
  for (const row of attRes.data || []) {
    targets.push({
      source: 'attachments',
      rowId: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      fileName: row.fileName || row.docType,
      driveFileId: row.driveFileId,
      fileUrl: row.fileUrl,
    });
  }
  for (const row of updRes.data || []) {
    const list = Array.isArray(row.attachments) ? row.attachments : [];
    list.forEach((att, i) => {
      targets.push({
        source: 'entity_updates',
        rowId: `${row.id}#${i}`,
        entityType: row.entityType,
        entityId: row.entityId,
        fileName: att?.fileName || `ไฟล์ ${i + 1}`,
        driveFileId: att?.driveFileId || null,
        fileUrl: att?.fileUrl || null,
      });
    });
  }

  const checked = await mapLimited(targets, async (t) => {
    // ไม่มี driveFileId = เอกสาร Google native (เปิดลิงก์ตรง) หรือแถวเก่าที่ตกค้าง
    if (!t.driveFileId) return { ...t, status: 'no-drive-id' };
    try {
      const meta = await getFileMeta(t.driveFileId, 'id, name, trashed, size, parents');
      return { ...t, status: meta.trashed ? 'trashed' : 'ok', sizeBytes: Number(meta.size) || null, driveName: meta.name };
    } catch (err) {
      const msg = errText(err);
      return { ...t, status: /notFound|404/i.test(msg) ? 'missing' : 'error', detail: msg };
    }
  });

  const summary = checked.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  return {
    total: checked.length,
    summary,
    // แถวที่ปกติไม่ต้องโชว์ — ส่งกลับเฉพาะที่มีปัญหาเพื่อไม่ให้หน้าจอท่วม
    problems: checked.filter((r) => r.status !== 'ok'),
  };
}

// ── 2.5 ไฟล์บน Drive ที่ไม่มีใครในระบบอ้างถึง ──────────────────────────
// ตรวจ "ทางกลับ" ของข้อ 2: ไล่ของจริงบน Drive แล้วถามว่ามีแถวไหนในระบบชี้มาไหม
//
// ⭐ บทเรียนจากรอบตรวจ 2026-07-30: **ก่อนบอกว่าไฟล์ไหนกำพร้า ต้องไล่ผู้อ้างอิงให้ครบ
// ทุกคอลัมน์ ไม่ใช่แค่ `attachments.driveFileId`** — เกือบลบแผนที่บริษัทของสหมิตรทิ้ง
// เพราะดูตารางเดียว · ที่ต้องนับเป็น "มีคนอ้าง" ทั้งหมด:
//   attachments: driveFileId · id ที่ฝังใน fileUrl · metadata.googleFileId (เอกสาร
//     Google native ของงานบริหารซึ่ง driveFileId เป็น null โดยเจตนา)
//   entity_updates.attachments[]: driveFileId · id ใน fileUrl
//   quotations.wonAttachments[]: driveFileId
//   customers/products.driveFolderId: โฟลเดอร์ที่ระบบ cache ไว้
const STRUCTURE_FOLDER_NAMES = new Set(Object.values(FOLDER));

// ไล่ทุกไฟล์/โฟลเดอร์ใน Shared Drive (ที่ยังไม่อยู่ถังขยะ)
async function listAllDriveItems() {
  const drive = getDrive();
  const items = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: 'trashed = false',
      fields: 'nextPageToken, files(id, name, mimeType, parents, size, modifiedTime)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'drive',
      driveId: sharedDriveId(),
    });
    items.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return items;
}

// id ของ Drive ที่ฝังอยู่ใน URL (เอกสาร Google native เก็บเป็น webViewLink ไม่มี driveFileId)
const driveIdFromUrl = (url) => {
  const s = String(url || '');
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
};

async function collectReferencedIds(supabase) {
  const refs = new Set();
  const add = (id) => { if (id) refs.add(String(id)); };

  const [attRes, updRes, quoRes, custRes, prodRes] = await Promise.all([
    supabase.from('attachments').select('driveFileId, fileUrl, metadata'),
    supabase.from('entity_updates').select('attachments').not('attachments', 'is', null),
    supabase.from('quotations').select('wonAttachments').not('wonAttachments', 'is', null),
    supabase.from('customers').select('driveFolderId').not('driveFolderId', 'is', null),
    supabase.from('products').select('driveFolderId').not('driveFolderId', 'is', null),
  ]);
  const firstError = attRes.error || updRes.error || quoRes.error || custRes.error || prodRes.error;
  if (firstError) throw firstError;

  for (const row of attRes.data || []) {
    add(row.driveFileId);
    add(driveIdFromUrl(row.fileUrl));
    add(row.metadata?.googleFileId);
  }
  for (const row of updRes.data || []) {
    for (const att of Array.isArray(row.attachments) ? row.attachments : []) {
      add(att?.driveFileId);
      add(driveIdFromUrl(att?.fileUrl));
    }
  }
  for (const row of quoRes.data || []) {
    for (const att of Array.isArray(row.wonAttachments) ? row.wonAttachments : []) add(att?.driveFileId);
  }
  for (const row of custRes.data || []) add(row.driveFolderId);
  for (const row of prodRes.data || []) add(row.driveFolderId);
  return refs;
}

export async function auditOrphanDriveItems() {
  const supabase = getSupabaseAdmin();
  const [items, refs] = await Promise.all([listAllDriveItems(), collectReferencedIds(supabase)]);

  const byId = new Map(items.map((f) => [f.id, f]));
  const hasChildren = new Set(items.flatMap((f) => f.parents || []));
  const pathOf = (item) => {
    const parts = [];
    let cur = item;
    for (let i = 0; i < 12 && cur; i += 1) {
      parts.unshift(cur.name);
      cur = byId.get(cur.parents?.[0]);
    }
    return parts.join(' / ');
  };

  const orphans = [];
  for (const item of items) {
    if (refs.has(item.id)) continue;
    const isFolder = item.mimeType === FOLDER_MIME;
    // โฟลเดอร์ของโครงสร้าง (ลูกค้า/ขอราคา/งานขาย/...) และโฟลเดอร์ที่ยังมีของข้างใน
    // ไม่ใช่ขยะ — ตัวที่ควรเก็บกวาดคือ "กล่องเปล่าที่ไม่มีใครอ้าง"
    if (isFolder && (STRUCTURE_FOLDER_NAMES.has(item.name) || hasChildren.has(item.id))) continue;
    orphans.push({
      id: item.id,
      name: item.name,
      kind: isFolder ? 'โฟลเดอร์ว่าง' : 'ไฟล์',
      path: pathOf(item),
      sizeBytes: Number(item.size) || null,
      modifiedTime: item.modifiedTime || null,
    });
  }
  orphans.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));

  return {
    scanned: items.length,
    referenced: items.filter((f) => refs.has(f.id)).length,
    orphans,
    orphanBytes: orphans.reduce((sum, o) => sum + (o.sizeBytes || 0), 0),
  };
}

// ทิ้งรายการที่ผู้ใช้ยืนยันแล้วลงถังขยะ (ไม่ลบถาวร — กู้ได้ 30 วัน)
// ⚠️ คำนวณ "กำพร้า" ใหม่ฝั่ง server เสมอ แล้วทิ้งเฉพาะตัวที่ยังกำพร้าจริงและอยู่ใน
// รายการที่ผู้ใช้เห็นตอนกด — กัน id แปลกปลอมและกันเคสข้อมูลเปลี่ยนระหว่างที่เปิดหน้าค้างไว้
export async function trashOrphanDriveItems(ids) {
  const wanted = new Set((ids || []).map(String));
  const { orphans } = await auditOrphanDriveItems();
  const targets = orphans.filter((o) => wanted.has(o.id));
  const trashed = [];
  const errors = [];
  for (const item of targets) {
    try {
      await getDrive().files.update({
        fileId: item.id,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      trashed.push(item.name);
    } catch (err) {
      errors.push({ what: item.name, error: errText(err) });
    }
  }
  return { requested: wanted.size, trashed: trashed.length, skipped: wanted.size - targets.length, names: trashed.slice(0, 50), errors };
}

// ── 3. จัดโครงโฟลเดอร์ ────────────────────────────────────────────────
// โครงเดิม: โฟลเดอร์ลูกค้าทุกรายกองที่ root ปนกับโฟลเดอร์ของโมดูล และเอกสารบริษัท
// ปนกับโฟลเดอร์สินค้าในโฟลเดอร์เดียวกัน · โครงใหม่ดู FOLDER ใน lib/drive.js
//
// ⭐ การย้ายบน Drive = เปลี่ยน parent เท่านั้น **id ของไฟล์/โฟลเดอร์ไม่เปลี่ยน** ลิงก์
// ทุกอันในระบบและ driveFolderId ที่ cache ไว้จึงยังใช้ได้ ไม่มีการอัป/ดาวน์โหลดซ้ำ
// และย้อนกลับได้ · ทั้งหมด idempotent — กดซ้ำได้ ของที่อยู่ถูกที่แล้วจะถูกข้าม

// โฟลเดอร์ชื่อเดิม → ยุบเข้าโฟลเดอร์ชื่อใหม่ (ของข้างในย้ายตาม แล้วทิ้งกล่องเปล่า)
// 🐞 เดิมใช้วิธี "เปลี่ยนชื่อ" ซึ่งพังเมื่อโฟลเดอร์ชื่อใหม่มีอยู่แล้ว — Drive ยอมให้ชื่อซ้ำ
// จึงได้โฟลเดอร์ชื่อเดียวกันสองอัน (เจอจริง: ปุ่มทดสอบเขียนไฟล์สร้าง `_รอจัดที่` ไว้ก่อน
// แล้วขั้นเปลี่ยนชื่อสร้างอันที่สองทับ) · ยุบเข้าหากันจึงถูกต้องกว่าและกดซ้ำได้เสมอ
const LEGACY_ABSORB = [
  { from: ['_unsorted'], toParent: [], toName: FOLDER.unsorted },
  { from: [FOLDER.sales, 'งาน'], toParent: [FOLDER.sales], toName: FOLDER.salesTasks },
];

async function findFolder(name, parentId) {
  const res = await getDrive().files.list({
    q: [
      `name = '${String(name).replace(/'/g, "\\'")}'`,
      `'${parentId}' in parents`,
      `mimeType = '${FOLDER_MIME}'`,
      'trashed = false',
    ].join(' and '),
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'drive',
    driveId: sharedDriveId(),
  });
  return res.data.files?.[0] || null;
}

// เดินตาม path เพื่อ "หา" (ไม่สร้าง) — ใช้หาโฟลเดอร์ชื่อเดิมก่อนเปลี่ยนชื่อ
async function findFolderByPath(names) {
  let parentId = rootId();
  for (const name of names) {
    const found = await findFolder(name, parentId);
    if (!found) return null;
    parentId = found.id;
  }
  return parentId;
}

// แผนการย้าย — อ่าน DB อย่างเดียว ไม่แตะ Drive เลย (กดดูได้ปลอดภัย)
export async function planRestructure() {
  const supabase = getSupabaseAdmin();
  const [custRes, prodRes, attRes, updRes] = await Promise.all([
    supabase.from('customers').select('id, name, driveFolderId').not('driveFolderId', 'is', null),
    supabase.from('products').select('id, fgCode, customerId, driveFolderId').not('driveFolderId', 'is', null),
    supabase.from('attachments').select('id, entityType, entityId, fileName, driveFileId').not('driveFileId', 'is', null),
    supabase.from('entity_updates').select('id, entityType, entityId, attachments').not('attachments', 'is', null),
  ]);
  const firstError = custRes.error || prodRes.error || attRes.error || updRes.error;
  if (firstError) throw firstError;

  const files = [...(attRes.data || []).map((r) => ({
    source: 'attachments', rowId: r.id, entityType: r.entityType, entityId: r.entityId,
    fileName: r.fileName, driveFileId: r.driveFileId,
  }))];
  for (const row of updRes.data || []) {
    (Array.isArray(row.attachments) ? row.attachments : []).forEach((att, i) => {
      if (att?.driveFileId) {
        files.push({
          source: 'entity_updates', rowId: `${row.id}#${i}`, entityType: row.entityType,
          entityId: row.entityId, fileName: att.fileName, driveFileId: att.driveFileId,
        });
      }
    });
  }

  // จัดกลุ่มตามปลายทาง — ให้คนอ่านเห็นภาพว่าของจะไปกองอยู่ตรงไหนบ้าง
  const byTarget = new Map();
  const failed = [];
  for (const f of files) {
    try {
      const label = folderPathLabel(await folderPathForEntity(f.entityType, f.entityId));
      if (!byTarget.has(label)) byTarget.set(label, []);
      byTarget.get(label).push(f);
    } catch (err) {
      // entity ที่หาโฟลเดอร์ไม่ได้ (สินค้าไม่มีเจ้าของ/แถวแม่ถูกลบ) — ต้องโชว์ ไม่ใช่เงียบ
      failed.push({ ...f, error: errText(err) });
    }
  }

  return {
    folderMoves: {
      customers: custRes.data?.length || 0,
      products: prodRes.data?.length || 0,
    },
    fileCount: files.length,
    targets: [...byTarget.entries()]
      .map(([path, list]) => ({ path, count: list.length, sample: list.slice(0, 3).map((f) => f.fileName) }))
      .sort((a, b) => b.count - a.count),
    failed,
    renames: LEGACY_ABSORB.map((r) => ({ from: r.from.join(' / '), to: [...r.toParent, r.toName].join(' / ') })),
  };
}

// รายการไฟล์ทั้งหมดที่ระบบอ้างถึงบน Drive — เรียงคงที่ (id) เพื่อให้แบ่งเป็นชุดแล้ว
// เดินหน้าได้จริง ไม่วนกลับมาทำชุดเดิม
async function driveFileTargets(supabase) {
  const [attRes, updRes] = await Promise.all([
    supabase.from('attachments').select('id, entityType, entityId, fileName, driveFileId')
      .not('driveFileId', 'is', null).order('id'),
    supabase.from('entity_updates').select('id, entityType, entityId, attachments')
      .not('attachments', 'is', null).order('id'),
  ]);
  if (attRes.error) throw attRes.error;
  if (updRes.error) throw updRes.error;

  const files = (attRes.data || []).map((r) => ({
    rowId: r.id, entityType: r.entityType, entityId: r.entityId, fileName: r.fileName, driveFileId: r.driveFileId,
  }));
  for (const row of updRes.data || []) {
    (Array.isArray(row.attachments) ? row.attachments : []).forEach((att, i) => {
      if (att?.driveFileId) {
        files.push({
          rowId: `${row.id}#${i}`, entityType: row.entityType, entityId: row.entityId,
          fileName: att.fileName, driveFileId: att.driveFileId,
        });
      }
    });
  }
  return files;
}

// งานทั้งหมดของการจัดโครง เรียงตามลำดับที่ต้องทำ (โฟลเดอร์ก่อน แล้วค่อยไฟล์)
// 🐞 เดิมงานระดับโฟลเดอร์ (61 โฟลเดอร์สินค้า + 5 ลูกค้า) ทำทั้งหมดใน "คำขอแรก" คำขอเดียว
// → ชน**เพดาน 60 วินาที**ของ serverless แล้วถูกฆ่ากลางทาง: ย้ายไปได้ราวครึ่งเดียว
// ที่เหลือค้างที่ราก และ UI เห็นเป็น error โดยไม่รู้ว่าทำไปถึงไหน (เจอจริงบน prod)
// → รวมทุกอย่างเป็นลิสต์งานเดียวที่เรียงคงที่ แล้วหั่นด้วย offset เหมือนกันหมด
async function buildRestructureTasks(supabase) {
  const [custRes, prodRes] = await Promise.all([
    supabase.from('customers').select('id, name, driveFolderId').not('driveFolderId', 'is', null).order('id'),
    supabase.from('products').select('id, fgCode, customerId, driveFolderId').not('driveFolderId', 'is', null).order('id'),
  ]);
  if (custRes.error) throw custRes.error;
  if (prodRes.error) throw prodRes.error;

  return [
    ...LEGACY_ABSORB.map((absorb) => ({ kind: 'absorb', absorb, label: absorb.from.join(' / ') })),
    ...(custRes.data || []).map((customer) => ({ kind: 'customerFolder', customer, label: `โฟลเดอร์ลูกค้า ${customer.name}` })),
    ...(prodRes.data || []).map((product) => ({ kind: 'productFolder', product, label: `โฟลเดอร์สินค้า ${product.fgCode || product.id}` })),
    ...(await driveFileTargets(supabase)).map((file) => ({ kind: 'file', file, label: file.fileName || file.rowId })),
  ];
}

// ย้ายจริง — ทำเป็นชุด (batch) เพราะ serverless มีเพดานเวลา 60 วินาที
// offset = ตำแหน่งงานที่จะเริ่มทำต่อ · UI เรียกซ้ำด้วย nextOffset จนกว่า done = true
// ทุกงาน idempotent: ของที่อยู่ถูกที่แล้วจะถูกนับเป็น skipped ไม่ใช่ทำซ้ำ
export async function runRestructure({ limit = 25, offset = 0 } = {}) {
  const supabase = getSupabaseAdmin();
  // memo ต่อ "รอบทำงาน" — กันสร้างโฟลเดอร์ชื่อซ้ำจากดัชนีค้นหาของ Drive ที่ตามไม่ทัน
  const ctx = { memo: new Map() };
  const log = [];
  const errors = [];
  let moved = 0;
  let skipped = 0;

  const tasks = await buildRestructureTasks(supabase);
  const batch = tasks.slice(offset, offset + limit);

  for (const task of batch) {
    try {
      if (task.kind === 'absorb') {
        // ยุบโฟลเดอร์ชื่อเก่าเข้าชื่อใหม่ (ย้ายของข้างในแล้วทิ้งกล่องเปล่าลงถังขยะ)
        const sourceId = await findFolderByPath(task.absorb.from);
        if (!sourceId) { skipped += 1; continue; }
        let parentId = rootId();
        for (const name of task.absorb.toParent) parentId = await ensureSubFolder(name, parentId, ctx);
        const targetId = await ensureSubFolder(task.absorb.toName, parentId, ctx);
        if (targetId === sourceId) { skipped += 1; continue; }
        for (const child of await listChildren(sourceId)) await moveFile(child.id, targetId);
        await deleteFile(sourceId); // ทิ้งถังขยะ ไม่ลบถาวร
        moved += 1;
        log.push(`ยุบโฟลเดอร์ ${task.absorb.from.join(' / ')} → ${task.absorb.toName}`);
        continue;
      }

      if (task.kind === 'customerFolder') {
        const customersRoot = await ensureRootFolder(FOLDER.customers, ctx);
        const folderId = await ensureCustomerFolder(task.customer, ctx);
        if (await moveFile(folderId, customersRoot)) {
          moved += 1;
          log.push(`ย้ายโฟลเดอร์ลูกค้า: ${task.customer.name}`);
        } else skipped += 1;
        continue;
      }

      if (task.kind === 'productFolder') {
        const { product } = task;
        if (!product.customerId) {
          errors.push({ what: task.label, error: 'ไม่มีลูกค้าเจ้าของ — ข้ามไว้ก่อน' });
          continue;
        }
        const { data: customer, error: custError } = await supabase
          .from('customers').select('*').eq('id', product.customerId).maybeSingle();
        if (custError) throw custError;
        if (!customer) {
          errors.push({ what: task.label, error: 'ลูกค้าเจ้าของถูกลบไปแล้ว' });
          continue;
        }
        const custFolder = await ensureCustomerFolder(customer, ctx);
        const parentId = await ensureSubFolder(FOLDER.customerProducts, custFolder, ctx);
        if (await moveFile(product.driveFolderId, parentId)) {
          moved += 1;
          log.push(`ย้ายโฟลเดอร์สินค้า: ${product.fgCode || product.id}`);
        } else skipped += 1;
        continue;
      }

      // ไฟล์เดี่ยว (เอกสารบริษัท/ออเดอร์/งาน/ขอราคา/เธรด) — ไฟล์ในโฟลเดอร์สินค้า
      // ถูกลากไปพร้อมโฟลเดอร์แล้ว จึงตกเป็น skipped
      const target = await resolveFolderForEntity(task.file.entityType, task.file.entityId, ctx);
      if (await moveFile(task.file.driveFileId, target)) {
        moved += 1;
        log.push(`ย้ายไฟล์ ${task.label}`);
      } else skipped += 1;
    } catch (err) {
      errors.push({ what: task.label, error: errText(err) });
    }
  }

  const nextOffset = offset + batch.length;
  return {
    moved,
    skipped,
    errors,
    total: tasks.length,
    nextOffset,
    remaining: Math.max(0, tasks.length - nextOffset),
    done: nextOffset >= tasks.length,
    log: log.slice(0, 60),
  };
}
