// ── Registration attachments → ZIP ───────────────────────────────────────
// Bundles the attachment files of the in-scope registrations into a .zip, one
// folder per registration (รายการสินค้า) named by FG · product · customer.
// Includes the registration's own docs + the owner customer's company map
// (address_map, shared master data). Server-only (Node runtime — JSZip + fetch).
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { listAttachments } from '@/lib/master/attachments';
import JSZip from 'jszip';

const sanitize = (s) =>
  String(s || '').replace(/[\\/:*?"<>|\n\r\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90) || 'item';

const inRange = (v, from, to) => {
  if (!from && !to) return true;
  const t = new Date(v).getTime();
  if (isNaN(t)) return false;
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86399999) return false;
  return true;
};

const uniqueName = (used, base) => {
  if (!used.has(base)) { used.add(base); return base; }
  const dot = base.lastIndexOf('.');
  let n = 2, name;
  do {
    name = dot > 0 ? `${base.slice(0, dot)}_${n}${base.slice(dot)}` : `${base}_${n}`;
    n++;
  } while (used.has(name));
  used.add(name);
  return name;
};

export async function buildRegistrationFilesZip({ team, customerId, from, to, ids } = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('excise_registrations').select('*');
  if (team) q = q.eq('team', team);
  if (customerId) q = q.eq('customerId', customerId);
  const { data, error } = await q;
  if (error) throw error;
  const idSet = ids && ids.length ? new Set(ids) : null;
  const regs = (data || []).filter((r) => inRange(r.createdAt, from, to) && (!idSet || idSet.has(r.id)));

  const zip = new JSZip();
  let fileCount = 0;
  for (const r of regs) {
    const folder = zip.folder(sanitize(`${r.fgCode || '-'} ${r.productName || ''} - ${r.customerName || ''}`));
    const regDocs = await listAttachments('registration', r.id);
    const mapDocs = r.customerId
      ? (await listAttachments('customer', r.customerId)).filter((a) => a.docType === 'address_map')
      : [];
    const items = [
      ...regDocs.map((a) => ({ a, prefix: '' })),
      ...mapDocs.map((a) => ({ a, prefix: 'แผนที่บริษัท - ' })),
    ];
    const used = new Set();
    for (const { a, prefix } of items) {
      try {
        const res = await fetch(a.fileUrl);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const name = uniqueName(used, sanitize(prefix + (a.fileName || a.docType || 'file')));
        folder.file(name, buf);
        fileCount++;
      } catch { /* skip unreachable file */ }
    }
    if (!items.length) folder.file('(ยังไม่มีไฟล์แนบ).txt', 'ทะเบียนนี้ยังไม่มีไฟล์แนบ');
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, fileCount, regCount: regs.length };
}
