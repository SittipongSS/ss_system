// ── Google Drive storage backend ─────────────────────────────────────
// ที่เก็บไฟล์แนบบน Google Drive (Shared Drive บริษัท) — **ที่เก็บเดียวของระบบ**
// (ทาง Supabase Storage ถูกตัดออกแล้ว 2026-07-30 · ดู DRIVE_STORAGE_PLAN.md)
//
// Auth = Workload Identity Federation (ไม่มี downloadable key — org บล็อก
// iam.disableServiceAccountKeyCreation). Vercel ออก OIDC token ต่อ request →
// แลกผ่าน GCP STS → impersonate service account. ค่าทั้งหมดไม่ลับ (ชี้ pool/SA เฉย ๆ).
//
// ⚠ Server-only + ต้องรันบน Node runtime (googleapis หนัก + อ่าน OIDC token) —
//   route ที่ใช้ไฟล์นี้ต้องตั้ง `export const runtime = 'nodejs'`.
// ⚠ WIF ออก token ได้เฉพาะตอนรัน**บน Vercel** — สคริปต์บนเครื่องต้อง `vercel env pull`
//   เอา VERCEL_OIDC_TOKEN มาก่อน ไม่งั้นทุกคำสั่งจะล้มที่ขั้นขอ token
import { google } from 'googleapis';
import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/functions/oidc';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { productDisplayName } from '@/lib/master/productIdentity';
import { resolveEntityAlias } from '@/lib/master/driveEntityMap';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── ชื่อโฟลเดอร์มาตรฐาน ───────────────────────────────────────────────
// ที่เดียวที่กำหนดว่าไฟล์ของระบบไปอยู่ตรงไหนบน Drive — ทั้งตอนอัปโหลดจริงและตอน
// สร้าง "แผนการย้าย" ในหน้าตรวจสอบ (lib/driveMaintenance) ใช้ชุดนี้ร่วมกัน
export const FOLDER = {
  customers: 'ลูกค้า',
  customerDocs: 'เอกสารบริษัท',
  customerProducts: 'สินค้า',
  customerOrders: 'ออเดอร์',
  pricing: 'ขอราคา',
  pricingProduction: 'ผลิต',
  pricingMaterial: 'วัสดุ',
  mgmt: 'งานบริหาร',
  mgmtTasks: 'งานติดตาม',
  mgmtMeetings: 'การประชุม',
  sales: 'งานขาย',
  salesTasks: 'งานส่วนบุคคล',
  salesLeads: 'ลีด',
  salesDeals: 'ดีล',
  salesQuotations: 'ใบเสนอราคา',
  salesOrders: 'ใบสั่งขาย',
  sahamit: 'สหมิตร',
  // งานบริการหน้าไซต์ (S-3) — รูปก่อน/หลัง + ลายเซ็นผู้รับงาน แยกเป็นโฟลเดอร์ต่อไซต์
  service: 'งานบริการ',
  unsorted: '_รอจัดที่',
};

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

// env ที่ต้องมีครบก่อนคุยกับ Drive ได้ — ใช้ทั้งตอน health check และตอนตอบ error
// ให้ผู้ใช้รู้ว่า "ยังไม่ได้ตั้งค่า" ต่างจาก "ตั้งแล้วแต่ Drive ปฏิเสธ"
export function driveEnvStatus() {
  const required = ['GOOGLE_WIF_AUDIENCE', 'GOOGLE_SA_EMAIL', 'GOOGLE_SHARED_DRIVE_ID'];
  const missing = required.filter((key) => !process.env[key]);
  return { ok: missing.length === 0, missing };
}

// ชื่อไฟล์/โฟลเดอร์ที่ปลอดภัยพอจะส่งเข้า Drive (Drive รับ Unicode ไทยได้ ไม่ต้องแปลง
// เป็น ASCII เหมือน Supabase — ตัดแค่อักขระควบคุมกับความยาวสุดโต่ง)
// กวาดอักขระควบคุมออกจากชื่อไฟล์ (เขียนเป็น RegExp ไม่ใช่ literal เพื่อไม่ฝังไบต์ควบคุมในซอร์ส)
const CONTROL_CHARS = new RegExp('[\u0000-\u001f\u007f]', 'g');
const safeName = (value, fallback = 'ไม่ระบุ') => {
  const cleaned = String(value ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 120);
};

// 404 จาก Drive = โฟลเดอร์/ไฟล์ถูกลบหรือย้ายออกจากที่ที่เราเข้าถึงได้
const isNotFound = (err) => err?.code === 404
  || err?.status === 404
  || err?.response?.status === 404
  || /notFound|File not found/i.test(String(err?.message || ''));

// ลูกทั้งหมดของโฟลเดอร์ (ใช้ตอนยุบโฟลเดอร์ชื่อซ้ำ + ตอนยุบโฟลเดอร์ชื่อเก่า)
export async function listChildren(folderId) {
  const res = await getDrive().files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1000,
    ...sharedDriveParams(),
  });
  return res.data.files || [];
}

// ยุบโฟลเดอร์ชื่อซ้ำเข้าตัวที่เก่าที่สุด แล้วทิ้งตัวซ้ำลงถังขยะ
// 🐞 บั๊กจริง: Drive ค้นหาไฟล์ผ่าน **ดัชนีที่อัปเดตช้ากว่าการสร้างจริงหลายวินาที** —
// ตอนจัดโครงเรียก ensureFolder('ลูกค้า', root) ซ้ำทุกลูกค้าในคำขอเดียว ตัวที่สองจึง
// "หาไม่เจอ" แล้วสร้างใหม่ = ได้โฟลเดอร์ชื่อ "ลูกค้า" สองอันคาไว้บน Drive จริง
// (เจอบน prod 2026-07-31: ลูกค้า ×2 · _รอจัดที่ ×2) · ป้องกันด้วย memo ต่อรอบทำงาน
// (ดู ctx) และซ่อมของที่ซ้ำไปแล้วตรงนี้ให้อัตโนมัติ
async function mergeDuplicateFolders(keepId, duplicateIds) {
  for (const dupId of duplicateIds) {
    try {
      for (const child of await listChildren(dupId)) {
        await moveFile(child.id, keepId);
      }
      await getDrive().files.update({
        fileId: dupId,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
      console.error('[drive] ยุบโฟลเดอร์ชื่อซ้ำเข้าตัวหลัก', dupId, '→', keepId);
    } catch (err) {
      console.error('[drive] ยุบโฟลเดอร์ซ้ำไม่สำเร็จ', dupId, err?.message);
    }
  }
}

// หาโฟลเดอร์ตามชื่อใต้ parent ก่อน ถ้าไม่มีค่อยสร้าง (idempotent กันสร้างซ้ำ).
// ctx.memo = จำผลภายใน "รอบทำงานเดียว" กันสร้างซ้ำจากดัชนีที่ยังไม่ทัน (ดูด้านบน)
async function ensureFolder(name, parentId, ctx) {
  const drive = getDrive();
  const finalName = safeName(name);
  const memoKey = `${parentId}/${finalName}`;
  if (ctx?.memo?.has(memoKey)) return ctx.memo.get(memoKey);

  const q = [
    `name = '${finalName.replace(/'/g, "\\'")}'`, // escape quote ใน query
    `'${parentId}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
  ].join(' and ');

  const found = await drive.files.list({
    q,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime',
    pageSize: 20,
    ...sharedDriveParams(),
  });
  const matches = found.data.files || [];
  if (matches.length) {
    const keepId = matches[0].id; // ตัวเก่าสุดคือตัวหลัก
    if (matches.length > 1) await mergeDuplicateFolders(keepId, matches.slice(1).map((f) => f.id));
    ctx?.memo?.set(memoKey, keepId);
    return keepId;
  }

  const created = await drive.files.create({
    requestBody: { name: finalName, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  ctx?.memo?.set(memoKey, created.data.id);
  return created.data.id;
}

// โฟลเดอร์ที่ cache id ไว้ยังใช้ได้จริงไหม — **ต้องเช็คทุกครั้งก่อนใช้ค่า cache**
// 🐞 เดิมคืน cache ทันทีโดยไม่ตรวจ: พอมีคนลบ/ย้าย/ทิ้งลงถังขยะโฟลเดอร์นั้นบน Drive
// ด้วยมือ (ซึ่งเกิดแน่เมื่อคนเข้าไปจัดของเอง) ลูกค้า/สินค้ารายนั้นจะอัปโหลดพัง 500
// "อัปโหลดขึ้น Google Drive ไม่สำเร็จ" **ถาวร** และไม่มีอะไรบอกสาเหตุ
async function folderAlive(folderId) {
  if (!folderId) return false;
  try {
    const res = await getDrive().files.get({
      fileId: folderId,
      fields: 'id, trashed, mimeType',
      supportsAllDrives: true,
    });
    return !res.data.trashed && res.data.mimeType === FOLDER_MIME;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

// root ที่ใช้วางโครงทั้งหมด = root ของ Shared Drive หรือ subfolder ที่กำหนด.
function storageRootId() {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_SHARED_DRIVE_ID;
}

// เดิน path ทีละชั้นจาก root — สร้างชั้นที่ยังไม่มี. ชั้นที่มี cache (ลูกค้า/สินค้า)
// ใช้ id เดิมถ้ายังมีชีวิตอยู่ เพื่อให้ "คนเปลี่ยนชื่อโฟลเดอร์บน Drive" ไม่ทำให้ไฟล์แตกเป็นสองที่
async function ensureFolderPath(segments, ctx) {
  let parentId = storageRootId();
  for (const seg of segments) {
    if (seg.cachedId && await folderAlive(seg.cachedId)) {
      parentId = seg.cachedId;
      continue;
    }
    const folderId = await ensureFolder(seg.name, parentId, ctx);
    if (seg.cache && folderId !== seg.cachedId) {
      // cache ใหม่ลง DB (ครั้งแรก หรือของเดิมหายไปแล้ว)
      await getSupabaseAdmin()
        .from(seg.cache.table)
        .update({ driveFolderId: folderId })
        .eq('id', seg.cache.id);
    }
    parentId = folderId;
  }
  return parentId;
}

// โฟลเดอร์สำรองเมื่ออัปโดยไม่มี entity context (กันไฟล์หลุดไปกอง root ของ Shared Drive).
export async function ensureUnsortedFolder(ctx) {
  return ensureFolderPath([{ name: FOLDER.unsorted }], ctx);
}

// ── entity → path ของโฟลเดอร์ ─────────────────────────────────────────
// คืน "รายชื่อชั้น" ไม่ใช่ id — อ่านจาก DB อย่างเดียว ไม่แตะ Drive จึงใช้ทำ
// dry-run ในหน้าตรวจสอบได้ด้วย (แสดงว่าไฟล์จะไปอยู่ตรงไหนโดยยังไม่สร้างอะไร)
//
// ⚠️ ชื่อ entity ของ **เธรดอัปเดต** (lib/master/updateAccess) ไม่ตรงกับของไฟล์แนบ —
// ทะเบียนชื่อพ้อง + ลิสต์ entity ที่มีสาขาโฟลเดอร์จริงอยู่ที่ lib/master/driveEntityMap
// (แยกเป็นไฟล์ล้วนเพื่อให้เทสต์ตรวจความครบได้โดยไม่ต้องโหลด googleapis)

async function customerSegments(customer) {
  return [
    { name: FOLDER.customers },
    {
      name: `${safeName(customer.name, customer.id)} (${customer.id})`,
      cachedId: customer.driveFolderId || null,
      cache: { table: 'customers', id: customer.id },
    },
  ];
}

async function loadCustomer(supabase, customerId) {
  if (!customerId) return null;
  const { data, error } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
  if (error) throw error;
  return data;
}

// ปีของเอกสาร (ค.ศ. 4 หลัก) ใช้ซอยโฟลเดอร์ใบขอราคาไม่ให้กองเป็นพันใบในชั้นเดียว
const docYear = (value) => {
  const t = new Date(value || Date.now());
  return String(Number.isNaN(t.getTime()) ? new Date().getFullYear() : t.getFullYear());
};

// ป้ายของเอกสารที่ใช้ตั้งชื่อโฟลเดอร์ — เลือกคอลัมน์แรกที่มีค่า (แต่ละตารางเรียกชื่อ
// เลขที่เอกสารไม่เหมือนกัน) แล้วต่อท้ายด้วย id เสมอเพื่อกันชื่อซ้ำ
const docLabel = (row, keys) => {
  const label = keys.map((k) => row?.[k]).find((v) => v);
  return label ? `${safeName(label)} (${row.id})` : String(row?.id || 'ไม่ระบุ');
};

async function costingSegments(supabase, entityType, entityId) {
  const isMaterial = entityType === 'dept_request_item' || entityType === 'dept_request';
  const branch = isMaterial ? FOLDER.pricingMaterial : FOLDER.pricingProduction;
  const isItem = entityType.endsWith('_item');
  const parentTable = isMaterial ? 'dept_requests' : 'costing_requests';
  const itemTable = isMaterial ? 'dept_request_items' : 'costing_request_items';
  const itemLabelKey = isMaterial ? 'label' : 'productLabel';

  let item = null;
  let parentId = entityId;
  if (isItem) {
    const { data, error } = await supabase.from(itemTable).select('*').eq('id', entityId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ไม่พบรายการที่จะแนบไฟล์');
    item = data;
    parentId = isMaterial ? data.askId : data.requestId;
  }
  const { data: parent, error: parentError } = await supabase
    .from(parentTable).select('*').eq('id', parentId).maybeSingle();
  if (parentError) throw parentError;

  const segments = [
    { name: FOLDER.pricing },
    { name: branch },
    { name: docYear(parent?.createdAt) },
    { name: parent?.docNo ? safeName(parent.docNo) : String(parentId || 'ไม่ระบุ') },
  ];
  if (item) {
    segments.push({ name: `${safeName(item[itemLabelKey], 'รายการ')} (${item.id})` });
  }
  return segments;
}

// ตารางของ entity ที่ตกลงมาเป็น "เธรดงานขาย" — ไม่ต้อง join ถึงลูกค้า (ไฟล์ในเธรด
// เป็นของบทสนทนา ไม่ใช่เอกสารประจำตัวลูกค้า) แค่จัดเข้าลิ้นชักของตัวเองให้หาเจอ
const SALES_THREAD_FOLDER = {
  lead: { folder: FOLDER.salesLeads, table: 'sales_leads', labelKeys: ['name', 'companyName', 'title'] },
  deal: { folder: FOLDER.salesDeals, table: 'sales_deals', labelKeys: ['docNo', 'title', 'name'] },
  quotation: { folder: FOLDER.salesQuotations, table: 'quotations', labelKeys: ['quotationNo', 'docNo'] },
  sales_order: { folder: FOLDER.salesOrders, table: 'sales_orders', labelKeys: ['orderNo', 'docNo'] },
};

export async function folderPathForEntity(entityType, entityId) {
  const supabase = getSupabaseAdmin();
  const type = resolveEntityAlias(entityType);

  if (type === 'customer') {
    const customer = await loadCustomer(supabase, entityId);
    if (!customer) throw new Error('ไม่พบลูกค้า');
    return [...(await customerSegments(customer)), { name: FOLDER.customerDocs }];
  }

  if (type === 'order') {
    const { data: order, error } = await supabase.from('orders').select('customerId').eq('id', entityId).maybeSingle();
    if (error) throw error;
    if (!order) throw new Error('ไม่พบใบยื่น/ออเดอร์');
    const customer = await loadCustomer(supabase, order.customerId);
    if (!customer) throw new Error('ไม่พบลูกค้าของใบยื่น');
    return [...(await customerSegments(customer)), { name: FOLDER.customerOrders }];
  }

  if (type === 'product' || type === 'registration') {
    // registration: ดึง productId + customerId (snapshot ของทะเบียน) มาด้วยเพื่อ fallback.
    let productId = entityId;
    let regCustomerId = null;
    if (type === 'registration') {
      const { data: reg, error } = await supabase
        .from('excise_registrations').select('productId, customerId').eq('id', entityId).maybeSingle();
      if (error) throw error;
      if (!reg) throw new Error('ไม่พบทะเบียน');
      productId = reg.productId;
      regCustomerId = reg.customerId || null;
    }
    const { data: product, error: productError } = await supabase
      .from('products').select('*').eq('id', productId).maybeSingle();
    if (productError) throw productError;
    if (!product) throw new Error('ไม่พบสินค้า');
    const customer = await loadCustomer(supabase, product.customerId || regCustomerId);
    if (!customer) throw new Error('สินค้านี้ยังไม่มีลูกค้าเจ้าของ');
    return [
      ...(await customerSegments(customer)),
      { name: FOLDER.customerProducts },
      {
        name: `${safeName(productDisplayName(product), product.id)} (${product.fgCode || product.id})`,
        cachedId: product.driveFolderId || null,
        cache: { table: 'products', id: product.id },
      },
    ];
  }

  // นัดเข้าบริการ (S-3) → โฟลเดอร์ "งานบริการ" ใต้ลูกค้าเจ้าของไซต์
  // รูปหน้างาน/ลายเซ็นของไซต์เดียวกันจึงกองอยู่ที่เดียวกับเอกสารอื่นของลูกค้ารายนั้น
  if (type === 'service_visit') {
    const { data: visit, error: visitError } = await supabase
      .from('service_visits').select('siteId, code').eq('id', entityId).maybeSingle();
    if (visitError) throw visitError;
    if (!visit) throw new Error('ไม่พบนัดเข้าบริการ');
    const { data: site, error: siteError } = await supabase
      .from('service_sites').select('customerId, name').eq('id', visit.siteId).maybeSingle();
    if (siteError) throw siteError;
    if (!site) throw new Error('ไม่พบไซต์บริการของนัดนี้');
    const customer = await loadCustomer(supabase, site.customerId);
    if (!customer) throw new Error('ไม่พบลูกค้าของไซต์บริการ');
    // แยกตามไซต์ ไม่ใช่ตามนัด — ลูกค้ารายหนึ่งเข้าไซต์เดิมปีละ 12 ครั้ง
    // ถ้าแยกรายนัดจะได้โฟลเดอร์เปล่า ๆ กองเป็นร้อยภายในปีเดียว
    return [
      ...(await customerSegments(customer)),
      { name: FOLDER.service },
      { name: safeName(site.name, visit.siteId) },
    ];
  }

  if (type === 'costing_item' || type === 'dept_request_item' || type === 'costing_request' || type === 'dept_request') {
    return costingSegments(supabase, type, entityId);
  }

  if (type === 'mgmt_task' || type === 'mgmt_meeting') {
    const table = type === 'mgmt_meeting' ? 'mgmt_meetings' : 'mgmt_tasks';
    const { data } = await supabase.from(table).select('id, title').eq('id', entityId).maybeSingle();
    return [
      { name: FOLDER.mgmt },
      { name: type === 'mgmt_meeting' ? FOLDER.mgmtMeetings : FOLDER.mgmtTasks },
      { name: data ? `${safeName(data.title)} (${data.id})` : String(entityId) },
    ];
  }

  if (type === 'personal_task') {
    const { data, error } = await supabase
      .from('personal_tasks').select('id, title').eq('id', entityId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ไม่พบงาน');
    return [
      { name: FOLDER.sales },
      { name: FOLDER.salesTasks },
      { name: `${safeName(data.title)} (${data.id})` },
    ];
  }

  const salesThread = SALES_THREAD_FOLDER[type];
  if (salesThread) {
    const { data } = await supabase.from(salesThread.table).select('*').eq('id', entityId).maybeSingle();
    return [
      { name: FOLDER.sales },
      { name: salesThread.folder },
      { name: data ? docLabel(data, salesThread.labelKeys) : String(entityId) },
    ];
  }

  if (type === 'sahamit_po') {
    const { data } = await supabase.from('sahamit_pos').select('*').eq('id', entityId).maybeSingle();
    return [
      { name: FOLDER.sahamit },
      { name: data ? docLabel(data, ['poNo', 'docNo']) : String(entityId) },
    ];
  }

  // ⚠️ entity ใหม่ที่ยังไม่ได้ต่อท่อ **ห้ามทำให้ปุ่มอัปโหลดพัง** — ของเดิม throw ที่นี่
  // แล้ว /api/upload ตอบ 500 ผู้ใช้จึงแนบไฟล์ไม่ได้เลยและไม่มีอะไรบอกว่าเพราะอะไร
  // (โดนมาแล้วสองรอบ: costing_item และ dept_request_item). ลง _รอจัดที่ + log แทน
  console.error(`[drive] entityType ยังไม่ได้ map โฟลเดอร์: ${entityType} — ลง ${FOLDER.unsorted} แทน`);
  return [{ name: FOLDER.unsorted }];
}

// path เป็นข้อความอ่านง่าย (ใช้โชว์ในหน้าตรวจสอบ)
export const folderPathLabel = (segments) => segments.map((s) => s.name).join(' / ');

// map entity → id โฟลเดอร์ปลายทาง (สร้างชั้นที่ยังไม่มีให้ครบ).
export async function resolveFolderForEntity(entityType, entityId, ctx) {
  return ensureFolderPath(await folderPathForEntity(entityType, entityId), ctx);
}

// โฟลเดอร์ลูกค้า — ใช้โดยโค้ดที่อยากได้โฟลเดอร์ตรง ๆ (เช่น ปุ่ม "เปิดใน Drive"
// และตัวจัดโครงโฟลเดอร์). คืน id ที่ cache ไว้ถ้ายังมีชีวิต **โดยไม่สนใจว่ามันอยู่ชั้นไหน**
// — ตัวจัดโครงจึงเอา id นี้ไปย้ายเข้าที่ใหม่ได้ โดยไฟล์ข้างในตามไปทั้งก้อน
export async function ensureCustomerFolder(customer, ctx) {
  return ensureFolderPath(await customerSegments(customer), ctx);
}

// โฟลเดอร์ชั้นบนสุดของระบบ (ลูกค้า / ขอราคา / งานบริหาร ...)
export async function ensureRootFolder(name, ctx) {
  return ensureFolderPath([{ name }], ctx);
}

// โฟลเดอร์ย่อยใต้ parent ที่รู้ id อยู่แล้ว
export async function ensureSubFolder(name, parentId, ctx) {
  return ensureFolder(name, parentId, ctx);
}

// อัปไฟล์ขึ้นโฟลเดอร์ (private — ไม่ตั้ง permission). คืน { id, webViewLink }.
export async function uploadFile(folderId, { buffer, name, mimeType }) {
  const { Readable } = await import('node:stream');
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name: safeName(name, 'file'), parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}

// ทางเข้าเดียวของการอัปไฟล์ตาม entity — resolve โฟลเดอร์ + อัป + กู้เคสโฟลเดอร์หาย.
// ถ้าโฟลเดอร์ปลายทางถูกลบ/ย้ายระหว่างทาง (404) ให้ล้าง cache แล้วลองใหม่หนึ่งครั้ง
// แทนที่จะเด้ง error ใส่ผู้ใช้ที่ไม่มีทางรู้ว่าเกิดอะไรขึ้น
export async function uploadForEntity({ entityType, entityId, buffer, name, mimeType }) {
  const attempt = async () => {
    const folderId = (entityType && entityId)
      ? await resolveFolderForEntity(entityType, entityId)
      : await ensureUnsortedFolder();
    return uploadFile(folderId, { buffer, name, mimeType });
  };
  try {
    return await attempt();
  } catch (err) {
    if (!isNotFound(err)) throw err;
    console.error('[drive] โฟลเดอร์ปลายทางหาย — ล้าง cache แล้วสร้างใหม่', entityType, entityId);
    await clearFolderCache(entityType, entityId);
    return attempt();
  }
}

// ล้าง driveFolderId ที่ cache ไว้ของ entity (และของลูกค้าเจ้าของ) เพื่อให้รอบถัดไป
// สร้างโฟลเดอร์ใหม่แทนการยิงเข้า id ที่ตายแล้ว
async function clearFolderCache(entityType, entityId) {
  const supabase = getSupabaseAdmin();
  const type = resolveEntityAlias(entityType);
  try {
    if (type === 'customer' || type === 'order') {
      const customerId = type === 'customer'
        ? entityId
        : (await supabase.from('orders').select('customerId').eq('id', entityId).maybeSingle()).data?.customerId;
      if (customerId) await supabase.from('customers').update({ driveFolderId: null }).eq('id', customerId);
      return;
    }
    if (type === 'product' || type === 'registration') {
      const productId = type === 'product'
        ? entityId
        : (await supabase.from('excise_registrations').select('productId').eq('id', entityId).maybeSingle()).data?.productId;
      if (!productId) return;
      const { data: product, error: productError } = await supabase
        .from('products').select('id, customerId').eq('id', productId).maybeSingle();
      if (productError) throw productError; // ให้ตกลง catch ข้างล่าง = ได้ log ที่บอกสาเหตุจริง
      if (!product) return;
      await supabase.from('products').update({ driveFolderId: null }).eq('id', product.id);
      if (product.customerId) {
        await supabase.from('customers').update({ driveFolderId: null }).eq('id', product.customerId);
      }
    }
  } catch (err) {
    // ล้าง cache ไม่สำเร็จ = รอบถัดไปจะพังซ้ำ แต่ห้ามกลบ error เดิมของการอัปโหลด
    console.error('[drive] ล้าง cache โฟลเดอร์ไม่สำเร็จ', entityType, entityId, err?.message);
  }
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

// ทิ้งไฟล์ลง**ถังขยะ**ของ Shared Drive (best-effort — เรียกตอนลบ attachment row).
// ⭐ ตั้งใจไม่ใช้ files.delete ซึ่งลบถาวรทันทีกู้ไม่ได้: ถังขยะของ Shared Drive เก็บให้
// 30 วัน = ตาข่ายรับความผิดพลาดที่บริษัทได้ฟรีโดยไม่ต้องมี Google Vault (ซึ่งต้องเป็น
// Workspace admin + แพ็กเกจ Business Plus ขึ้นไป)
export async function deleteFile(driveFileId) {
  if (!driveFileId) return;
  try {
    await getDrive().files.update({
      fileId: driveFileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
  } catch (err) {
    // best-effort: ไฟล์อาจถูกลบไปแล้ว — log แต่ไม่ throw (ไม่บล็อกการลบ row).
    console.error('[drive] deleteFile failed', driveFileId, err?.message);
  }
}

// ย้ายไฟล์/โฟลเดอร์ไปอยู่ใต้โฟลเดอร์ใหม่ (id ไม่เปลี่ยน = ลิงก์เดิมทุกอันยังใช้ได้)
export async function moveFile(fileId, targetFolderId) {
  const meta = await getDrive().files.get({
    fileId,
    fields: 'id, parents',
    supportsAllDrives: true,
  });
  const parents = meta.data.parents || [];
  if (parents.includes(targetFolderId) && parents.length === 1) return false;
  await getDrive().files.update({
    fileId,
    addParents: targetFolderId,
    removeParents: parents.join(','),
    fields: 'id, parents',
    supportsAllDrives: true,
  });
  return true;
}

// ── Google Workspace native files (Doc/Sheet) — เอกสารมีชีวิต ─────────
// ใช้โดยโมดูล "งานบริหาร": สร้าง/ผูก Google Doc·Sheet เพื่อทำงานร่วมกัน (แก้ในที่).
// เปิดผ่าน webViewLink ตรง (ไม่ผ่าน proxy) — สิทธิ์คุมด้วย Shared Drive/permission.
export const GOOGLE_NATIVE_MIME = {
  gdoc: 'application/vnd.google-apps.document',
  gsheet: 'application/vnd.google-apps.spreadsheet',
};

// สร้างไฟล์ Google เปล่าในโฟลเดอร์ที่ระบุ. คืน { id, webViewLink, mimeType, name }.
export async function createGoogleFile(folderId, name, type) {
  const mimeType = GOOGLE_NATIVE_MIME[type];
  if (!mimeType) throw new Error(`ชนิดเอกสารไม่รองรับ: ${type}`);
  const res = await getDrive().files.create({
    requestBody: { name: safeName(name), mimeType, parents: [folderId] },
    fields: 'id, name, mimeType, webViewLink',
    supportsAllDrives: true,
  });
  return res.data;
}

// อ่าน metadata ไฟล์ (ใช้ตอนผูกลิงก์ที่มีอยู่ + ตอนตรวจว่าไฟล์ยังอยู่ไหม)
export async function getFileMeta(fileId, fields = 'id, name, mimeType, webViewLink') {
  const res = await getDrive().files.get({
    fileId,
    fields,
    supportsAllDrives: true,
  });
  return res.data;
}

// แยก fileId จาก Drive URL (รองรับ /d/<id>/, ?id=<id>, /document|spreadsheet/d/<id>).
export function parseDriveId(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

// map mimeType → kind ('gdoc' | 'gsheet' | null สำหรับชนิดอื่น).
export function kindFromMime(mimeType) {
  if (mimeType === GOOGLE_NATIVE_MIME.gdoc) return 'gdoc';
  if (mimeType === GOOGLE_NATIVE_MIME.gsheet) return 'gsheet';
  return null;
}

// ให้สิทธิ์ writer แก่อีเมล Workspace (best-effort — ไฟล์ยังอยู่ใน Shared Drive).
export async function grantWriter(fileId, email) {
  if (!fileId || !email) return;
  try {
    await getDrive().permissions.create({
      fileId,
      requestBody: { type: 'user', role: 'writer', emailAddress: email },
      sendNotificationEmail: false,
      supportsAllDrives: true,
    });
  } catch (err) {
    console.error('[drive] grantWriter failed', fileId, email, err?.message);
  }
}
