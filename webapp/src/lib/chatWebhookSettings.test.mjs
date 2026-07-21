import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_WEBHOOK_URL_PREFIX,
  chatWebhookStatusLabel,
  hasPublishableChangeNote,
  maskWebhookUrl,
  normalizeChatWebhookInput,
} from './chatWebhookSettings';

test('chat webhook input allows only the Google Chat webhook domain', () => {
  const ok = normalizeChatWebhookInput({
    url: ` ${CHAT_WEBHOOK_URL_PREFIX}AAA/messages?key=k&token=t `,
    enabled: true,
    changeNote: ' ตั้งค่า space ใหม่ ',
  });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.url, `${CHAT_WEBHOOK_URL_PREFIX}AAA/messages?key=k&token=t`);
  assert.equal(ok.value.changeNote, 'ตั้งค่า space ใหม่');

  const bad = normalizeChatWebhookInput({ url: 'https://evil.example.com/hook' });
  assert.ok(bad.errors[0].includes(CHAT_WEBHOOK_URL_PREFIX));
});

test('chat webhook input treats empty URL as "no webhook" and defaults enabled', () => {
  const { value, errors } = normalizeChatWebhookInput({ url: '   ' });
  assert.deepEqual(errors, []);
  assert.equal(value.url, null);
  assert.equal(value.enabled, true);
  assert.equal(normalizeChatWebhookInput({ enabled: false }).value.enabled, false);
});

test('chat webhook helpers mask tokens and gate publish on a change note', () => {
  assert.equal(
    maskWebhookUrl(`${CHAT_WEBHOOK_URL_PREFIX}AAA/messages?key=k&token=secret`),
    `${CHAT_WEBHOOK_URL_PREFIX}AAA/messages?key=k&token=***`,
  );
  assert.equal(chatWebhookStatusLabel('archived'), 'เก็บถาวร');
  assert.equal(hasPublishableChangeNote({ changeNote: '' }), false);
  assert.equal(hasPublishableChangeNote({ changeNote: 'เปลี่ยน space' }), true);
});
