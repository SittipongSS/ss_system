// ── GET /api/customers/export — ทะเบียนลูกค้าเป็นไฟล์ Excel (04/11/2026) ──────────────────────
//
// 🪤 **ต้องเป็น GET เท่านั้น** — proxy ตัดสินสิทธิ์เขียนจาก method+path และกฎของ `/api/customers`
//    คือ "POST/PATCH ต้องมี customers:edit" ⇒ ทำเป็น POST เมื่อไร คนที่ดูทะเบียนได้อย่างเดียว
//    (ฝ่ายบัญชี/RD/คลัง) กดโหลดไม่ได้ทันที (ดูหัว `/api/products/export`)
// ⚠️ ด่านอ่าน = `customers:view` ตัวเดียวกับหน้า `/database/customers` (proxy) — `GET /api/customers` เปิดให้
//    ทุกบทบาทเพราะ picker ต้องใช้ แต่ไฟล์ทั้งทะเบียน (ที่อยู่ · ผู้ติดต่อ · เลขผู้เสียภาษี) ได้เฉพาะคนที่เห็นหน้าทะเบียน
//
// แถวที่ได้ = **เท่าที่ตาเห็นบนจอ** — รับตัวกรองชุดเดียวกับหน้ารายการทาง query แล้วกรองด้วย
// `filterCustomers` ตัวเดียวกับที่จอใช้ · ไม่มีตัวกรอง = ทั้งทะเบียน (ไม่รวมใบเลิกใช้ เหมือนจอ)
import { getCurrentUser } from '@/lib/authUser';
import { canUser } from '@/lib/permissions';
import { filterCustomers } from '@/lib/master/customerFilter';
import {
  buildCustomerExportBuffer, customerExportFilename, sortCustomersForExport,
} from '@/lib/master/customerWorkbook';
import { GET as listCustomers } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const csv = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canUser(user, 'customers:view')) return Response.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(request.url);

  // แหล่งแถว = handler เดิมของหน้าทะเบียน (`manage=1` เห็นทุกสถานะ ทุกทีม · ทั้งแถว) — เรียกตรง ๆ ไม่ผ่าน HTTP
  // ⭐ ได้การไล่หน้าทะลุเพดาน 1,000 แถวของ PostgREST มาด้วย ไม่ต้องเขียนซ้ำ
  const listRes = await listCustomers(new Request(new URL('/api/customers?manage=1', url.origin)));
  if (!listRes.ok) return listRes;
  const customers = await listRes.json();

  const rows = sortCustomersForExport(filterCustomers(customers, {
    search: url.searchParams.get('q') || '',
    statuses: csv(url.searchParams.get('status')),
    teams: csv(url.searchParams.get('team')),
    showInactive: url.searchParams.get('inactive') === '1',
  }));

  try {
    const now = new Date();
    const buffer = await buildCustomerExportBuffer(rows, { now });
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${customerExportFilename(now)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[customer-export]', err);
    return Response.json({ error: 'ส่งออกข้อมูลลูกค้าไม่สำเร็จ' }, { status: 500 });
  }
}
