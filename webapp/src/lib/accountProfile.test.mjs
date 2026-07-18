import { test } from "node:test";
import assert from "node:assert/strict";
import { accountProfileFromAuthUser, normalizeAccountProfile } from "./accountProfile.js";

test("normalizeAccountProfile trims names and formats a mobile number", () => {
  const result = normalizeAccountProfile({
    firstName: "  Sittipong   Somchai ",
    lastName: " Kaenthaw ",
    phone: "0812345678",
  });

  assert.deepEqual(result, {
    value: {
      firstName: "Sittipong Somchai",
      lastName: "Kaenthaw",
      name: "Sittipong Somchai Kaenthaw",
      phone: "081-234-5678",
    },
  });
});

test("normalizeAccountProfile rejects an empty identity and malformed phone", () => {
  assert.match(normalizeAccountProfile({}).error, /ชื่อหรือนามสกุล/);
  assert.match(normalizeAccountProfile({ firstName: "สมชาย", phone: "12345" }).error, /9 หรือ 10 หลัก/);
});

test("accountProfileFromAuthUser exposes profile fields without capability grants", () => {
  const profile = accountProfileFromAuthUser({
    id: "user-1",
    email: "user@example.com",
    user_metadata: { firstName: "สมชาย", lastName: "ใจดี", phone: "081-234-5678" },
    app_metadata: { role: "ae", team: "KA", department: "SALES", extraCaps: ["audit:view"] },
  });

  assert.equal(profile.name, "สมชาย ใจดี");
  assert.equal(profile.role, "ae");
  assert.equal(profile.team, "KA");
  assert.equal(profile.department, "SA");
  assert.equal("extraCaps" in profile, false);
});
