import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ปลายทางที่ Google SSO เด้งกลับมา (เฟส 4 ของ GOOGLE_CHAT_PLAN.md):
// แลก authorization code เป็น session แล้วตรวจโดเมนอีเมลฝั่งเซิร์ฟเวอร์ —
// พารามิเตอร์ hd ตอนเรียก Google เป็นแค่ตัวกรองหน้าจอเลือกบัญชี เชื่อไม่ได้
// บัญชีนอกโดเมนบริษัทต้องถูกเตะออก (sign out) ทันที
const ALLOWED_EMAIL_DOMAIN = '@scentandsense.co.th';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(`${origin}/?sso=failed`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.redirect(`${origin}/?sso=failed`);

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?sso=failed`);
  }

  const email = (data?.user?.email || '').toLowerCase();
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    // บัญชี Google นอกบริษัท — ปิด session ที่เพิ่งเปิดแล้วส่งกลับหน้า login
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/?sso=domain`);
  }

  return NextResponse.redirect(`${origin}/home`);
}
