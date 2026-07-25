// บล็อกข้อมูลบริษัทกลางที่เอกสารทุกชนิดใช้ร่วมกัน (คีย์เดียวกันทั้ง server snapshot
// ตอนอนุมัติ และ client print ตอนพิมพ์/พรีวิว) — แหล่งข้อมูลจริงคือ organization_settings
// ที่เผยแพร่; documentBrand เป็น fallback ที่เดียวเมื่อยังไม่มี published หรือโหลดไม่ได้
import { cachedFetchJson } from '@/lib/apiCache';
import {
  COMPANY_LEGAL_NAME,
  COMPANY_LEGAL_NAME_EN,
  COMPANY_ADDRESS,
  COMPANY_TAX_ID,
  COMPANY_BRANCH_CODE,
  COMPANY_OFFICE_TEL,
  COMPANY_LINE,
  COMPANY_WEBSITE,
} from '@/lib/documentBrand';

// คีย์มาตรฐานของบล็อกบริษัท — ช่องบังคับ (legalNameTh/address/taxId/branchCode/…) จะไม่มี
// ทางว่างหลังผ่าน resolveCompanyBlock เพราะเติมจาก fallback นี้เสมอ
export const COMPANY_PROFILE_FALLBACK = Object.freeze({
  legalNameTh: COMPANY_LEGAL_NAME,
  legalNameEn: COMPANY_LEGAL_NAME_EN,
  address: COMPANY_ADDRESS,
  addressEn: '',
  taxId: COMPANY_TAX_ID,
  branchCode: COMPANY_BRANCH_CODE,
  phone: COMPANY_OFFICE_TEL,
  email: '',
  line: COMPANY_LINE,
  website: COMPANY_WEBSITE,
});

const clean = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

// map แถว published (organization_setting_versions) → บล็อกกลาง; คืน null ถ้าไม่มีแถว
export function mapPublishedCompany(row) {
  if (!row) return null;
  return {
    legalNameTh: clean(row.legalNameTh),
    legalNameEn: clean(row.legalNameEn),
    address: clean(row.registeredAddressTh),
    addressEn: clean(row.registeredAddressEn),
    taxId: clean(row.taxId),
    branchCode: clean(row.branchCode),
    phone: clean(row.phone),
    email: clean(row.email),
    line: clean(row.lineId),
    website: clean(row.website),
  };
}

// เติมช่องที่ว่าง/ขาดจาก fallback — รับได้ทั้ง block ที่ map แล้วหรือ null
export function resolveCompanyBlock(company) {
  const source = company || {};
  const out = { ...COMPANY_PROFILE_FALLBACK };
  for (const key of Object.keys(COMPANY_PROFILE_FALLBACK)) {
    const value = source[key];
    if (value != null && String(value).trim() !== '') out[key] = String(value).trim();
  }
  return out;
}

// ── client only ──────────────────────────────────────────────────────────────
// ดึงบล็อกบริษัทที่เผยแพร่มาใช้ตอนพิมพ์/พรีวิว (cache แบบ SWR ผ่าน apiCache) —
// ล้มเมื่อไรคืน fallback constants เพื่อให้เอกสารยังพิมพ์ได้เสมอ
export async function getCompanyProfileForPrint() {
  try {
    const data = await cachedFetchJson('/api/company-profile');
    return resolveCompanyBlock(data?.company || null);
  } catch (error) {
    // ล้มแล้วยัง print ได้ด้วย fallback เหมือนเดิม แต่ต้องส่งเสียง — การกลืน error เงียบ
    // ตรงนี้คือเหตุที่ 403 จากด่าน proxy รอดมาถึง prod โดยไม่มีใครเห็น (ใบทุกใบของ AE
    // ตกไปใช้ constant สำรองแทนข้อมูลบริษัทที่เผยแพร่)
    console.warn('[companyProfile] โหลด /api/company-profile ไม่สำเร็จ — ใช้ค่าสำรองจาก documentBrand', error);
    return resolveCompanyBlock(null);
  }
}
