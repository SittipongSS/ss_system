import test from 'node:test';
import assert from 'node:assert/strict';
import { authOutcome } from './authOutcome.js';
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';

test('มีผู้ใช้ = ผ่าน · ไม่มีทั้ง user และ error = ไม่มี session จริง ⇒ ไปหน้าเข้าสู่ระบบ', () => {
  assert.equal(authOutcome({ user: { id: 'u1' } }), 'ok');
  assert.equal(authOutcome({ user: null }), 'login');
  assert.equal(authOutcome(), 'login');
});

test('ตัวตนหมดอายุ/ถูกเพิกถอน ⇒ ไปหน้าเข้าสู่ระบบ', () => {
  assert.equal(authOutcome({ error: new AuthSessionMissingError() }), 'login');
  for (const status of [400, 401, 403]) {
    assert.equal(authOutcome({ error: new AuthApiError('bad token', status, undefined) }), 'login', String(status));
  }
});

/* 🔴 หัวใจของด่านนี้: เน็ตสะดุดหรือ server ล่ม **ห้ามเด้งคนออกจากงานที่ทำค้างอยู่** */
test('อ่านไม่สำเร็จชั่วคราว ⇒ กล่องลองใหม่ ไม่ใช่เด้งออก', () => {
  assert.equal(authOutcome({ error: new AuthRetryableFetchError('offline', 0) }), 'retry');
  assert.equal(authOutcome({ error: new AuthApiError('upstream', 502, undefined) }), 'retry');
  assert.equal(authOutcome({ thrown: new TypeError('Failed to fetch') }), 'retry');
  // error แปลกหน้าที่ไม่ใช่ AuthError ก็ถือว่าชั่วคราวไว้ก่อน — เดาว่าหมดสิทธิ์แล้วเด้งออกแพงกว่า
  assert.equal(authOutcome({ error: new Error('???') }), 'retry');
});
