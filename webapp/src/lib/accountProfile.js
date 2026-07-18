const MAX_NAME_LENGTH = 80;
const LEGACY_DEPARTMENTS = { SALES: "SA", LEGAL: "LG", VIEWER: "Viewer" };

function cleanNamePart(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function formatProfilePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizeAccountProfile(input = {}) {
  const firstName = cleanNamePart(input.firstName);
  const lastName = cleanNamePart(input.lastName);
  const phoneDigits = String(input.phone || "").replace(/\D/g, "");

  if (!firstName && !lastName) {
    return { error: "กรุณาระบุชื่อหรือนามสกุลอย่างน้อยหนึ่งรายการ" };
  }
  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
    return { error: `ชื่อและนามสกุลต้องไม่เกิน ${MAX_NAME_LENGTH} ตัวอักษรต่อช่อง` };
  }
  if (phoneDigits && ![9, 10].includes(phoneDigits.length)) {
    return { error: "เบอร์โทรศัพท์ต้องมี 9 หรือ 10 หลัก" };
  }

  return {
    value: {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      phone: formatProfilePhone(phoneDigits),
    },
  };
}

export function accountProfileFromAuthUser(user) {
  const metadata = user?.user_metadata || {};
  const appMetadata = user?.app_metadata || {};
  return {
    id: user?.id || null,
    email: user?.email || "",
    firstName: metadata.firstName || "",
    lastName: metadata.lastName || "",
    name: metadata.name || `${metadata.firstName || ""} ${metadata.lastName || ""}`.trim(),
    phone: metadata.phone || "",
    role: appMetadata.role || "user",
    team: appMetadata.team || null,
    department: LEGACY_DEPARTMENTS[appMetadata.department] || appMetadata.department || null,
    mustChangePassword: !!appMetadata.must_change_password,
    createdAt: user?.created_at || null,
    lastSignInAt: user?.last_sign_in_at || null,
  };
}
