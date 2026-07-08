// ── Google Drive storage backend ─────────────────────────────────────
// ที่เก็บไฟล์แนบบน Google Drive (Shared Drive บริษัท). ใช้เมื่อ STORAGE_BACKEND=drive.
// ดูแผนเต็ม: webapp/DRIVE_STORAGE_PLAN.md
//
// Auth = Workload Identity Federation (ไม่มี downloadable key — org บล็อก
// iam.disableServiceAccountKeyCreation). Vercel ออก OIDC token ต่อ request →
// แลกผ่าน GCP STS → impersonate service account. ค่าทั้งหมดไม่ลับ (ชี้ pool/SA เฉย ๆ).
//
// ⚠ Server-only + ต้องรันบน Node runtime (googleapis หนัก + อ่าน OIDC token) —
//   route ที่ใช้ไฟล์นี้ต้องตั้ง `export const runtime = 'nodejs'`.
// ⚠ deps ที่ต้องเพิ่มก่อน deploy: googleapis, google-auth-library, @vercel/functions
import { google } from 'googleapis';
import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/functions/oidc';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// พารามิเตอร์ที่ทุกคำสั่งบน Shared Drive ต้องมี.
function sharedDriveParams() {
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
  return {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'drive',
    driveId,
  };
}

let _drive = null;
// google drive client (cache ต่อ instance). Auth ผ่าน WIF + Vercel OIDC token supplier.
export function getDrive() {
  if (_drive) return _drive;
  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: process.env.GOOGLE_WIF_AUDIENCE,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GOOGLE_SA_EMAIL}:generateAccessToken`,
    // Vercel ส่ง OIDC token ต่อ invocation — ดึงตอน runtime (ไม่มีไฟล์/URL).
    subject_token_supplier: { getSubjectToken: async () => getVercelOidcToken() },
    scopes: [DRIVE_SCOPE],
  });
  _drive = google.drive({ version: 'v3', auth: authClient });
  return _drive;
}

// หาโฟลเดอร์ตามชื่อใต้ parent ก่อน ถ้าไม่มีค่อยสร้าง (idempotent กันสร้างซ้ำ).
async function ensureFolder(name, parentId) {
  const drive = getDrive();
  const safeName = name.replace(/'/g, "\\'"); // escape quote ใน query
  const q = [
    `name = '${safeName}'`,
    `'${parentId}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
  ].join(' and ');

  const found = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 1,
    ...sharedDriveParams(),
  });
  if (found.data.files?.length) return found.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id;
}

// root ที่ใช้วางโฟลเดอร์ลูกค้า = root ของ Shared Drive หรือ subfolder ที่กำหนด.
function storageRootId() {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_SHARED_DRIVE_ID;
}

// โฟลเดอร์สำรองเมื่ออัปโดยไม่มี entity context (กันไฟล์หลุดไปกอง root ของ Shared Drive).
export async function ensureUnsortedFolder() {
  return ensureFolder('_unsorted', storageRootId());
}

// ── โมดูล "งานบริหาร" (mgmt) — โฟลเดอร์แยกจากลูกค้า/สินค้า ────────────
// งานบริหาร / {งานติดตาม | การประชุม} / "<ชื่อ> (<id>)". ไฟล์ไม่ nest ใต้ลูกค้า.
async function ensureMgmtSubFolder(sub) {
  const root = await ensureFolder('งานบริหาร', storageRootId());
  return ensureFolder(sub, root);
}
async function resolveMgmtFolder(entityType, entityId) {
  const supabase = getSupabaseAdmin();
  const table = entityType === 'mgmt_meeting' ? 'mgmt_meetings' : 'mgmt_tasks';
  const subLabel = entityType === 'mgmt_meeting' ? 'การประชุม' : 'งานติดตาม';
  const parent = await ensureMgmtSubFolder(subLabel);
  const { data } = await supabase.from(table).select('id, title').eq('id', entityId).maybeSingle();
  const label = data ? `${data.title} (${data.id})` : String(entityId);
  return ensureFolder(label, parent);
}

// โฟลเดอร์ลูกค้า (cache id ลง customers.driveFolderId). ชื่อ "<ชื่อ> (<id>)".
export async function ensureCustomerFolder(customer) {
  if (customer.driveFolderId) return customer.driveFolderId;
  const folderId = await ensureFolder(`${customer.name} (${customer.id})`, storageRootId());
  await getSupabaseAdmin().from('customers').update({ driveFolderId: folderId }).eq('id', customer.id);
  return folderId;
}

// โฟลเดอร์สินค้า ใต้โฟลเดอร์ลูกค้า (cache ลง products.driveFolderId).
export async function ensureProductFolder(product, customer) {
  if (product.driveFolderId) return product.driveFolderId;
  const parentId = await ensureCustomerFolder(customer);
  const label = product.fgCode || product.id;
  const folderId = await ensureFolder(`${product.productDescriptionEn || product.productDescription || product.id} (${label})`, parentId);
  await getSupabaseAdmin().from('products').update({ driveFolderId: folderId }).eq('id', product.id);
  return folderId;
}

// map entity → โฟลเดอร์ปลายทาง.
//   customer     → โฟลเดอร์ลูกค้า
//   product      → โฟลเดอร์สินค้า (ใต้ลูกค้า)
//   registration → โฟลเดอร์สินค้า (เป็นของ product เดียว — findable กว่า)
//   order        → โฟลเดอร์ลูกค้า (1 ออเดอร์ครอบหลายสินค้าของลูกค้าเดียว)
export async function resolveFolderForEntity(entityType, entityId) {
  const supabase = getSupabaseAdmin();
  if (entityType === 'mgmt_task' || entityType === 'mgmt_meeting') {
    return resolveMgmtFolder(entityType, entityId);
  }
  if (entityType === 'customer') {
    const { data } = await supabase.from('customers').select('*').eq('id', entityId).maybeSingle();
    if (!data) throw new Error('ไม่พบลูกค้า');
    return ensureCustomerFolder(data);
  }
  if (entityType === 'product' || entityType === 'registration') {
    // registration: ดึง productId + customerId (snapshot ของทะเบียน) มาด้วย เพื่อ fallback.
    let productId = entityId;
    let regCustomerId = null;
    if (entityType === 'registration') {
      const { data: reg } = await supabase
        .from('excise_registrations').select('productId, customerId').eq('id', entityId).maybeSingle();
      productId = reg?.productId;
      regCustomerId = reg?.customerId || null;
    }
    const { data: product } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
    if (!product) throw new Error('ไม่พบสินค้า');
    // ลูกค้า = เจ้าของสินค้า; ถ้าสินค้าไม่มีเจ้าของ → fallback เป็น customerId ของทะเบียน.
    const customerId = product.customerId || regCustomerId;
    const { data: customer } = customerId
      ? await supabase.from('customers').select('*').eq('id', customerId).maybeSingle()
      : { data: null };
    if (!customer) throw new Error('สินค้านี้ยังไม่มีลูกค้าเจ้าของ');
    return ensureProductFolder(product, customer);
  }
  if (entityType === 'order') {
    const { data: order } = await supabase.from('orders').select('customerId').eq('id', entityId).maybeSingle();
    if (!order) throw new Error('ไม่พบออเดอร์');
    const { data: customer } = await supabase.from('customers').select('*').eq('id', order.customerId).maybeSingle();
    if (!customer) throw new Error('ไม่พบลูกค้าของออเดอร์');
    return ensureCustomerFolder(customer);
  }
  throw new Error(`entityType ไม่รองรับ: ${entityType}`);
}

// อัปไฟล์ขึ้นโฟลเดอร์ (private — ไม่ตั้ง permission). คืน { id, webViewLink }.
export async function uploadFile(folderId, { buffer, name, mimeType }) {
  const { Readable } = await import('node:stream');
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}

// ดึงไฟล์เป็น stream (ใช้ใน proxy ดาวน์โหลด + ZIP export).
export async function getFileStream(driveFileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  return res.data; // Node Readable stream
}

// ลบไฟล์บน Drive (best-effort — เรียกตอนลบ attachment row).
export async function deleteFile(driveFileId) {
  if (!driveFileId) return;
  try {
    await getDrive().files.delete({ fileId: driveFileId, supportsAllDrives: true });
  } catch (err) {
    // best-effort: ไฟล์อาจถูกลบไปแล้ว — log แต่ไม่ throw (ไม่บล็อกการลบ row).
    console.error('[drive] deleteFile failed', driveFileId, err?.message);
  }
}
