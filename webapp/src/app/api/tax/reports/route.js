import { getCurrentUser } from '@/lib/authUser';
import { viewScopeUser, canUser, TEAMS } from '@/lib/permissions';
import { buildReport, REPORTS } from '@/lib/tax/reports';
import { reportToXlsxBuffer } from '@/lib/tax/exportExcel';
import { buildRegistrationFilesZip } from '@/lib/tax/registrationFiles';

// exceljs needs the Node runtime (not edge). Always dynamic — depends on user.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tax/reports?type=period&format=json|xlsx&from=&to=&team=&customerId=
// `?team=` = ตัวกรองที่ผู้ใช้เลือก (คั่นด้วย , ได้) — คนละเรื่องกับขอบเขตทีมของผู้ใช้
// ซึ่งบังคับจาก role เสมอและส่งไปเป็น `scopeTeam` (ดูคอมเมนต์ใน GET)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const format = searchParams.get('format') || 'json';
  if (!type || !REPORTS[type]) {
    return Response.json({ error: `type ไม่ถูกต้อง (${Object.keys(REPORTS).join(', ')})` }, { status: 400 });
  }

  const user = await getCurrentUser();

  // `team` เคยแบกสองความหมายในตัวแปรเดียว (`scope === 'team' ? user.team : ?team=`) ซึ่ง
  // ทำให้แก้บั๊ก "แถวไร้ทีมหายจากทุกทีม" ไม่ได้: ถ้าขยายให้พ่วงแถว team = null เข้าไป
  // แอดมินที่ *เลือก* กรองทีม KA จะได้แถวไร้ทีมพ่วงมาด้วย ซึ่งไม่ใช่สิ่งที่เขาสั่ง จึงต้อง
  // แยกเป็นสองช่องที่ทำงานคนละหน้าที่แล้วนำมา AND กัน:
  //   scopeTeam — **ขอบเขตของผู้ใช้** บังคับตาม role · ทีมตัวเอง + แถวไร้ทีม (ของกลาง)
  //               กฎเดียวกับลิสต์ `/api/orders` · null = ไม่บังคับ (role 'all' หรือคนที่
  //               scope 'team' แต่ตัวเองไม่มีทีม = scope ไม่ได้ → เห็นทั้งหมด)
  //   team      — **ตัวกรองที่ผู้ใช้เลือก** ไม่บังคับ · เอาเฉพาะทีมที่เลือกจริง ๆ ไม่พ่วง
  //               แถวไร้ทีม · multi-select ตามมาตรฐานตัวกรองของบ้านนี้ (มติ 2026-07-18)
  // ผู้ใช้ที่ scope 'team' ส่ง ?team= มาได้ แต่ AND กันแล้วมันได้แค่ *แคบลง* เท่านั้น
  const scopeTeam = viewScopeUser(user) === 'team' ? (user?.team || null) : null;

  // ทีมที่ไม่รู้จักต้องเด้ง ไม่ใช่ถูกกรองทิ้งเงียบ ๆ — พิมพ์ผิดแล้วได้ "ทุกทีม" คือบั๊ก
  // ตระกูลเดียวกับที่ไล่เก็บอยู่ (query ที่ผิดแล้วเงียบ กลายเป็นข้อมูลที่ดูเหมือนถูก)
  const teamParam = searchParams.get('team');
  const teamFilter = (teamParam || '').split(',').map((s) => s.trim()).filter(Boolean);
  const unknownTeams = teamFilter.filter((t) => !TEAMS.includes(t));
  if (unknownTeams.length) {
    return Response.json(
      { error: `ทีมไม่ถูกต้อง: ${unknownTeams.join(', ')} (ใช้ได้: ${TEAMS.join(', ')})` },
      { status: 400 },
    );
  }

  const filter = {
    from: searchParams.get('from') || null,
    to: searchParams.get('to') || null,
    scopeTeam,
    team: teamFilter,
    customerId: searchParams.get('customerId') || null,
    status: searchParams.get('status') || null,
    // Optional explicit row selection (download only the chosen rows/files).
    ids: (searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Optional doc-type filter for the ZIP export (which attachment types to include).
    docTypes: (searchParams.get('docTypes') || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Factory cost/profit columns are confidential — LG + admin (and any user
    // granted products:margin, e.g. an SA making management reports).
    margin: canUser(user, 'products:margin'),
  };

  // ZIP of attachment files, foldered per registration (registration report only).
  if (format === 'zip') {
    if (type !== 'registration') {
      return Response.json({ error: 'ดาวน์โหลดไฟล์แนบรองรับเฉพาะรายงานการขึ้นทะเบียน' }, { status: 400 });
    }
    try {
      const { buffer } = await buildRegistrationFilesZip(filter);
      const now = new Date();
      const yymmdd = now.getFullYear().toString().slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      const hhmmss = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
      const ts = `${yymmdd}-${hhmmss}`;
      const fname = `${ts}_registration-files.zip`;
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${fname}"`,
        },
      });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  let report;
  try {
    report = await buildReport(type, filter);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }

  if (format === 'xlsx') {
    const buf = await reportToXlsxBuffer(report);
    const now = new Date();
    const yymmdd = now.getFullYear().toString().slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const hhmmss = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
    const ts = `${yymmdd}-${hhmmss}`;
    const fname = `${ts}_report-${type}.xlsx`;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    });
  }

  return Response.json(report);
}
