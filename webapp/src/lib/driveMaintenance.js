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
  ensureCustomerFolder, ensureRootFolder, ensureSubFolder,
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

// ── 3. จัดโครงโฟลเดอร์ ────────────────────────────────────────────────
// โครงเดิม: โฟลเดอร์ลูกค้าทุกรายกองที่ root ปนกับโฟลเดอร์ของโมดูล และเอกสารบริษัท
// ปนกับโฟลเดอร์สินค้าในโฟลเดอร์เดียวกัน · โครงใหม่ดู FOLDER ใน lib/drive.js
//
// ⭐ การย้ายบน Drive = เปลี่ยน parent เท่านั้น **id ของไฟล์/โฟลเดอร์ไม่เปลี่ยน** ลิงก์
// ทุกอันในระบบและ driveFolderId ที่ cache ไว้จึงยังใช้ได้ ไม่มีการอัป/ดาวน์โหลดซ้ำ
// และย้อนกลับได้ · ทั้งหมด idempotent — กดซ้ำได้ ของที่อยู่ถูกที่แล้วจะถูกข้าม

// โฟลเดอร์ชื่อเดิมที่เปลี่ยนชื่อได้เลย (ของข้างในตามมาเองทั้งก้อน ไม่ต้องย้ายทีละไฟล์)
const LEGACY_RENAMES = [
  { path: ['_unsorted'], to: FOLDER.unsorted },
  { path: [FOLDER.sales, 'งาน'], to: FOLDER.salesTasks },
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
    renames: LEGACY_RENAMES.map((r) => ({ from: r.path.join(' / '), to: r.to })),
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

// ย้ายจริง — ทำเป็นชุด (batch) เพราะ serverless มีเพดานเวลา 60 วินาที
// offset = ตำแหน่งไฟล์ที่จะเริ่มทำต่อ · UI เรียกซ้ำด้วย nextOffset จนกว่า done = true
// รอบแรก (offset 0) ทำงาน "ระดับโฟลเดอร์" ให้เสร็จก่อน: เปลี่ยนชื่อชุดเก่า + ย้าย
// โฟลเดอร์ลูกค้า/สินค้าเข้าที่ใหม่ ซึ่งลากไฟล์ข้างในตามไปทั้งก้อนโดยไม่ต้องแตะทีละใบ
export async function runRestructure({ limit = 40, offset = 0 } = {}) {
  const supabase = getSupabaseAdmin();
  const log = [];
  const errors = [];
  let moved = 0;
  let skipped = 0;

  if (offset === 0) {
    // 3.1 เปลี่ยนชื่อโฟลเดอร์ชุดเก่า (ของข้างในตามไปเอง ไม่ต้องย้ายทีละไฟล์)
    for (const rename of LEGACY_RENAMES) {
      try {
        const id = await findFolderByPath(rename.path);
        if (!id) continue;
        await getDrive().files.update({ fileId: id, requestBody: { name: rename.to }, supportsAllDrives: true });
        log.push(`เปลี่ยนชื่อโฟลเดอร์ ${rename.path.join(' / ')} → ${rename.to}`);
        moved += 1;
      } catch (err) {
        errors.push({ what: `เปลี่ยนชื่อ ${rename.path.join(' / ')}`, error: errText(err) });
      }
    }

    // 3.2 ย้ายโฟลเดอร์ลูกค้าเข้าใต้ "ลูกค้า/"
    const customersRoot = await ensureRootFolder(FOLDER.customers);
    const { data: customers, error: custError } = await supabase
      .from('customers').select('id, name, driveFolderId').not('driveFolderId', 'is', null);
    if (custError) throw custError;
    const customerFolderId = new Map();
    for (const customer of customers || []) {
      try {
        const folderId = await ensureCustomerFolder(customer);
        customerFolderId.set(customer.id, folderId);
        if (await moveFile(folderId, customersRoot)) {
          moved += 1;
          log.push(`ย้ายโฟลเดอร์ลูกค้า: ${customer.name}`);
        } else skipped += 1;
      } catch (err) {
        errors.push({ what: `โฟลเดอร์ลูกค้า ${customer.name}`, error: errText(err) });
      }
    }

    // 3.3 ย้ายโฟลเดอร์สินค้าเข้าใต้ "<ลูกค้า>/สินค้า/"
    const { data: products, error: prodError } = await supabase
      .from('products').select('id, fgCode, customerId, driveFolderId').not('driveFolderId', 'is', null);
    if (prodError) throw prodError;
    const productsFolderOf = new Map(); // customerId → id ของโฟลเดอร์ "สินค้า"
    for (const product of products || []) {
      try {
        if (!product.customerId) {
          errors.push({ what: `สินค้า ${product.fgCode || product.id}`, error: 'ไม่มีลูกค้าเจ้าของ — ข้ามไว้ก่อน' });
          continue;
        }
        let parentId = productsFolderOf.get(product.customerId);
        if (!parentId) {
          const custFolder = customerFolderId.get(product.customerId)
            || await ensureCustomerFolder(
              (await supabase.from('customers').select('*').eq('id', product.customerId).maybeSingle()).data || {},
            );
          parentId = await ensureSubFolder(FOLDER.customerProducts, custFolder);
          productsFolderOf.set(product.customerId, parentId);
        }
        if (await moveFile(product.driveFolderId, parentId)) {
          moved += 1;
          log.push(`ย้ายโฟลเดอร์สินค้า: ${product.fgCode || product.id}`);
        } else skipped += 1;
      } catch (err) {
        errors.push({ what: `โฟลเดอร์สินค้า ${product.fgCode || product.id}`, error: errText(err) });
      }
    }
  }

  // 3.4 ไฟล์ที่เหลือ (เอกสารบริษัท/ออเดอร์/งาน/ขอราคา/เธรด) ย้ายทีละใบตามชนิด entity
  // ไฟล์ในโฟลเดอร์สินค้า (ทะเบียนภาษี) ถูกลากไปพร้อมโฟลเดอร์แล้ว จึงตกเป็น skipped
  const files = await driveFileTargets(supabase);
  const batch = files.slice(offset, offset + limit);
  for (const f of batch) {
    try {
      const target = await resolveFolderForEntity(f.entityType, f.entityId);
      if (await moveFile(f.driveFileId, target)) {
        moved += 1;
        log.push(`ย้ายไฟล์ ${f.fileName || f.driveFileId}`);
      } else skipped += 1;
    } catch (err) {
      errors.push({ what: f.fileName || f.rowId, error: errText(err) });
    }
  }

  const nextOffset = offset + batch.length;
  return {
    moved,
    skipped,
    errors,
    total: files.length,
    nextOffset,
    remaining: Math.max(0, files.length - nextOffset),
    done: nextOffset >= files.length,
    log: log.slice(0, 60),
  };
}
