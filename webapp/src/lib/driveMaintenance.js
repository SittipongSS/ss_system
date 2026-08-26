// ── เครื่องมือตรวจ/ซ่อม Google Drive ─────────────────────────────────────
// ใช้โดยหน้า ตั้งค่า → ที่เก็บไฟล์ (admin เท่านั้น) — งานทั้งหมดที่นี่ต้องรัน**บน Vercel**
// เพราะ WIF ออก token ได้เฉพาะตอนรันบนนั้น (ดูหัวไฟล์ lib/drive.js)
//
// 2 งาน:
//   1. ตรวจการเชื่อมต่อ (driveHealth)         — ตั้งค่าครบไหม คุยกับ Drive ได้ไหม เขียนไฟล์ได้ไหม
//   2. ตรวจไฟล์แนบทั้งระบบ (auditDriveFiles) — ทุกแถวชี้ไปที่ไฟล์ที่ยังอยู่จริงไหม
import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { classifyDriveItems } from '@/lib/driveOrphanClassify';
import { PARENT_TABLE } from '@/lib/master/attachments';
import {
  FOLDER, driveEnvStatus, getDrive, getFileMeta, uploadFile, deleteFile, ensureUnsortedFolder,
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
  const [attachments, updates] = await Promise.all([
    fetchAll(() => supabase
      .from('attachments').select('id, entityType, entityId, docType, fileName, fileUrl, driveFileId').order('id')),
    fetchAll(() => supabase
      .from('entity_updates').select('id, entityType, entityId, attachments').order('id')),
  ]);

  const targets = [];
  for (const row of attachments) {
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
  for (const row of updates) {
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

// ── 2.2 แถวไฟล์แนบที่ระเบียนแม่ถูกลบไปแล้ว ────────────────────────────
// 🐞 เจอจริงบน prod 2026-07-31: **96 จาก 129 แถวเป็นแถวกำพร้า** (ทะเบียน 92 · ใบยื่น 3 ·
// ขอราคา 1) — มีคนลบทะเบียนทิ้งช่วงทดสอบ แต่แถวไฟล์แนบไม่ถูกลบตาม เลยค้างชี้ไปยัง
// ระเบียนที่ไม่มีอยู่จริง · มองไม่เห็นจากหน้าไหนเลยเพราะไม่มีหน้าแม่ให้เปิด และทำให้
// รายงาน "ไฟล์เข้าถึงไม่ได้" อ่านแล้วเข้าใจผิดว่าของสำคัญหาย ทั้งที่เป็นของตายทั้งหมด
async function loadOrphanAttachmentRows(supabase) {
  const data = await fetchAll(() => supabase.from('attachments').select('*').order('id'));

  const byType = {};
  for (const row of data) (byType[row.entityType] ||= []).push(row);

  const orphans = [];
  const unknownTypes = [];
  for (const [entityType, rows] of Object.entries(byType)) {
    const table = PARENT_TABLE[entityType];
    // entityType ที่ยังไม่ได้ลงทะเบียนตาราง = **ห้ามเดาว่ากำพร้า** (ลบผิดกู้ยาก)
    if (!table) { unknownTypes.push(entityType); continue; }
    const ids = [...new Set(rows.map((r) => r.entityId))];
    /* ⚠️ หั่น `.in()` เป็นชุด — รายการยาว ๆ ทำให้ URL ของ PostgREST ยาวเกินจนถูกปฏิเสธ
       และผลลัพธ์ต้องไล่ทีละหน้าด้วย ไม่งั้นแม่ที่ยังอยู่จริงถูกตัดออกจากชุด `alive`
       แล้วแถวลูกถูกตัดสินว่ากำพร้า ⇒ **ปุ่มล้างจะลบของที่ยังใช้อยู่** */
    const alive = new Set();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const parents = await fetchAll(() => supabase.from(table).select('id').in('id', chunk).order('id'));
      for (const row of parents) alive.add(row.id);
    }
    orphans.push(...rows.filter((r) => !alive.has(r.entityId)));
  }
  return { orphans, unknownTypes, total: data.length };
}

export async function auditOrphanAttachmentRows() {
  const { orphans, unknownTypes, total } = await loadOrphanAttachmentRows(getSupabaseAdmin());
  const byType = {};
  for (const row of orphans) byType[row.entityType] = (byType[row.entityType] || 0) + 1;
  return {
    total,
    orphanCount: orphans.length,
    byType,
    unknownTypes,
    withDriveFile: orphans.filter((r) => r.driveFileId).length,
    rows: orphans.slice(0, 200).map((r) => ({
      id: r.id, entityType: r.entityType, entityId: r.entityId, docType: r.docType, fileName: r.fileName,
    })),
  };
}

// ลบแถวกำพร้าออกจากตาราง attachments — **ไม่แตะไฟล์บน Drive**
// ไฟล์จะกลายเป็น "ของกำพร้าบนไดรฟ์" ซึ่งตรวจและทิ้งได้จากหัวข้อถัดไปของหน้าเดียวกัน
// (แยกสองขั้นโดยเจตนา: ลบแถวคืนความถูกต้องให้ฐานข้อมูลทันที ส่วนไฟล์ให้คนดูก่อนทิ้ง)
export async function purgeOrphanAttachmentRows() {
  const supabase = getSupabaseAdmin();
  const { orphans, unknownTypes } = await loadOrphanAttachmentRows(supabase);
  if (!orphans.length) return { deleted: 0, unknownTypes, byType: {}, rows: [] };

  const byType = {};
  for (const row of orphans) byType[row.entityType] = (byType[row.entityType] || 0) + 1;

  /* 🐞 **คืนตัวตนของแถวที่ลบด้วย ไม่ใช่แค่ตัวเลข** — แถวกำพร้าคือหลักฐานชิ้นเดียวที่
     ผูกไฟล์บน Drive เข้ากับระเบียนที่ถูกลบไปแล้ว · ลบแล้วไฟล์ยังอยู่ (ตั้งใจ) แต่จะ
     ไปโผล่ในหัวข้อ "ของบน Drive ที่ไม่มีใครอ้างถึง" โดย **ไม่มีใครรู้ว่ามันเคยเป็นของใบไหน**
     ⇒ ผู้เรียกต้องเอาไปลง audit ให้ครบ ไม่งั้นความรู้นั้นหายไปพร้อมแถว
     ⚠️ ตัดที่ 200 แถว — เท่ากับเพดานที่ `auditOrphanAttachmentRows` ส่งให้หน้าจอดู
     ก่อนกด ⇒ "สิ่งที่บันทึก" ครอบคลุม "สิ่งที่คนเห็นตอนตัดสินใจ" เสมอ */
  const rows = orphans.slice(0, 200).map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    fileName: r.fileName || null,
    driveFileId: r.driveFileId || null,
  }));

  const { data, error } = await supabase
    .from('attachments').delete().in('id', orphans.map((r) => r.id)).select('id');
  if (error) throw error;
  return {
    deleted: data?.length || 0,
    byType,
    unknownTypes,
    withDriveFile: orphans.filter((r) => r.driveFileId).length,
    rows,
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

  const [attachments, updates, quotations, customers, products] = await Promise.all([
    fetchAll(() => supabase.from('attachments').select('id, driveFileId, fileUrl, metadata').order('id')),
    fetchAll(() => supabase.from('entity_updates').select('id, attachments').order('id')),
    fetchAll(() => supabase.from('quotations').select('id, "wonAttachments"').order('id')),
    fetchAll(() => supabase.from('customers').select('id, "driveFolderId"').order('id')),
    fetchAll(() => supabase.from('products').select('id, "driveFolderId"').order('id')),
  ]);

  for (const row of attachments) {
    add(row.driveFileId);
    add(driveIdFromUrl(row.fileUrl));
    add(row.metadata?.googleFileId);
  }
  for (const row of updates) {
    for (const att of Array.isArray(row.attachments) ? row.attachments : []) {
      add(att?.driveFileId);
      add(driveIdFromUrl(att?.fileUrl));
    }
  }
  for (const row of quotations) {
    for (const att of Array.isArray(row.wonAttachments) ? row.wonAttachments : []) add(att?.driveFileId);
  }
  for (const row of customers) add(row.driveFolderId);
  for (const row of products) add(row.driveFolderId);
  return refs;
}

export async function auditOrphanDriveItems() {
  const supabase = getSupabaseAdmin();
  const [items, refs] = await Promise.all([listAllDriveItems(), collectReferencedIds(supabase)]);
  // การจัดกอง = ตรรกะล้วน อยู่ที่ lib/driveOrphanClassify.js เพื่อให้เทสต์ได้โดยไม่ต้องมี Drive
  const { scanned, referenced, keptFolders, orphans } = classifyDriveItems(items, refs, STRUCTURE_FOLDER_NAMES);
  return {
    scanned,
    referenced,
    // โฟลเดอร์ที่ไม่มีใครอ้างแต่ไม่ใช่ขยะ — **ต้องส่งขึ้นหน้าจอด้วย** ไม่งั้นสามตัวเลข
    // บนหัวบวกกันไม่ครบแล้วคนอ่านนึกว่าจัดครบทุกตัวแล้ว
    keptFolders,
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
