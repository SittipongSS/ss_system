// แท็บสิทธิ์ในหน้า /users (รื้อระบบสิทธิ์งวด 3) — ตัวตัดสินล้วน + รูปโค้ดของด่านอ่าน/เขียน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { copyDrift, grantEffect, grantEvents } from '@/lib/capabilityGrants';

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('grantEffect: ซ้ำกับตำแหน่ง · ระบบปิด · มีผล', () => {
  assert.equal(grantEffect({ cap: 'products:margin' }, 'admin'), 'dup');
  assert.equal(grantEffect({ cap: 'mgmt:view' }, 'ac'), 'closed');
  assert.equal(grantEffect({ cap: 'ra:view' }, 'rd_coordinator'), 'ok');
  // ตำแหน่งมีอยู่แล้วชนะระบบปิด — admin ถือ mgmt:* จากตำแหน่ง
  assert.equal(grantEffect({ cap: 'mgmt:view' }, 'admin'), 'dup');
});

test('copyDrift: สำเนาใน app_metadata ต้องเท่ากับทะเบียน (ลำดับไม่นับ)', () => {
  const rows = [{ cap: 'ra:view' }, { cap: 'products:margin' }];
  assert.equal(copyDrift({ extraCaps: ['products:margin', 'ra:view'] }, rows), false);
  assert.equal(copyDrift({ extraCaps: ['ra:view'] }, rows), true);
  assert.equal(copyDrift({ extraCaps: ['ra:view', 'products:margin', 'audit:view'] }, rows), true);
  assert.equal(copyDrift({ extraCaps: [] }, []), false);
  // แถวที่ถอนแล้วไม่นับเป็นของที่ต้องมีในสำเนา
  assert.equal(copyDrift({ extraCaps: [] }, [{ cap: 'ra:view', revokedAt: '2026-11-25' }]), false);
});

test('grantEvents: ให้ทุกแถว + ถอน/หมดอายุเมื่อถอนแล้ว · ใหม่สุดก่อน · ของเดิมที่ย้ายมา = "migrated"', () => {
  const events = grantEvents([
    { id: 'a', cap: 'ra:view', grantedAt: '2026-11-01T01:00:00Z', grantedById: null },
    { id: 'b', cap: 'audit:view', grantedAt: '2026-11-02T01:00:00Z', grantedById: 'adm', revokedAt: '2026-11-20T01:00:00Z', revokeKind: 'expired' },
    { id: 'c', cap: 'users:view', grantedAt: '2026-11-03T01:00:00Z', grantedById: 'adm', revokedAt: '2026-11-10T01:00:00Z', revokeKind: 'manual' },
  ]);
  assert.deepEqual(events.map((e) => `${e.g.id}:${e.kind}`), ['b:expired', 'c:revoke', 'c:grant', 'b:grant', 'a:migrated']);
});

test('⭐ GET /api/users/grants: อ่านได้เฉพาะ users:manage หรือ users:view ผ่าน canUser', () => {
  const route = src('../app/api/users/grants/route.js');
  assert.match(route, /if \(!canUser\(user, 'users:manage'\) && !canUser\(user, 'users:view'\)\) return forbidden\(\);/);
  assert.doesNotMatch(route, /export const (POST|PATCH|DELETE)/, 'เส้นนี้อ่านอย่างเดียว');
});

test('⭐ หน้า /users: users:view เปิดได้แบบอ่านอย่างเดียว (มติข้อ 5) — ปุ่มทุกปุ่มยังผูก canManage', () => {
  const page = src('../app/users/page.js');
  assert.match(page, /const canView = useCan\("users:view"\) \|\| canManage;/);
  assert.match(page, /if \(!canView\) \{/);
  assert.match(page, /if \(canView\) fetchUsers\(\);/);
  // แท็บทะเบียนได้ canManage จากหน้า — ไม่ตัดสินเอง
  assert.match(page, /<GrantRegistryTab users=\{users\} registry=\{registry\} canManage=\{canManage\}/);
  // ปุ่มเพิ่มผู้ใช้ / คอลัมน์จัดการ ยังผูก canManage
  assert.match(page, /actions=\{canManage && \(/);
  assert.match(page, /\{canManage && <th className="text-center">จัดการ<\/th>\}/);
  const registry = src('../components/users/GrantRegistry.js');
  assert.match(registry, /actions=\{canManage && \(/);
  assert.match(registry, /\{canManage && <th className="text-center">จัดการ<\/th>\}/);
});

test('แท็บสิทธิ์ตามตำแหน่งอ่านอย่างเดียว — ไม่มีการเรียก API เขียนข้อมูล', () => {
  const tab = src('../components/users/RolePermissionsTab.js');
  assert.doesNotMatch(tab, /apiJson|apiFetch|method:/);
});
