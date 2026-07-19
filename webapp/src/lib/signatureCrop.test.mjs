import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SIGNATURE_CROP_OUTPUT_HEIGHT,
  SIGNATURE_CROP_OUTPUT_WIDTH,
  signatureCropDrawRect,
  signatureCropTransform,
} from './signatureCrop.js';

test('signature crop cover transform always fills the 3:1 viewport', () => {
  const landscape = signatureCropTransform({
    imageWidth: 900,
    imageHeight: 300,
    viewportWidth: 450,
    viewportHeight: 150,
  });
  assert.equal(landscape.displayWidth, 450);
  assert.equal(landscape.displayHeight, 150);

  const portrait = signatureCropTransform({
    imageWidth: 300,
    imageHeight: 900,
    viewportWidth: 450,
    viewportHeight: 150,
  });
  assert.equal(portrait.displayWidth, 450);
  assert.ok(portrait.displayHeight > 150);
});

test('signature crop clamps drag offsets so blank space cannot enter the frame', () => {
  const transform = signatureCropTransform({
    imageWidth: 300,
    imageHeight: 900,
    viewportWidth: 450,
    viewportHeight: 150,
    offsetX: 999,
    offsetY: -999,
  });
  assert.equal(transform.offsetX, 0);
  assert.equal(transform.offsetY, -transform.maxOffsetY);
});

test('signature crop draw rectangle maps the preview to a 1200x400 PNG', () => {
  const rect = signatureCropDrawRect({
    imageWidth: 900,
    imageHeight: 300,
    viewportWidth: 450,
    viewportHeight: 150,
    zoom: 2,
    offsetX: 25,
    offsetY: 0,
  });
  assert.equal(SIGNATURE_CROP_OUTPUT_WIDTH, 1200);
  assert.equal(SIGNATURE_CROP_OUTPUT_HEIGHT, 400);
  assert.equal(rect.width, 2400);
  assert.equal(rect.height, 800);
  assert.ok(rect.x < 0);
});
