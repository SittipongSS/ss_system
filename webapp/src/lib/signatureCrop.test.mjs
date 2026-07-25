import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SIGNATURE_CROP_MIN_ZOOM,
  SIGNATURE_CROP_OUTPUT_HEIGHT,
  SIGNATURE_CROP_OUTPUT_WIDTH,
  signatureCropDrawRect,
  signatureCropMinZoom,
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

test('signature crop lets a non-3:1 signature shrink until it is fully contained', () => {
  const square = { imageWidth: 600, imageHeight: 600, viewportWidth: 450, viewportHeight: 150 };
  const minZoom = signatureCropMinZoom(square);
  // A square image covers the 3:1 frame vertically 3x over, so the fit-to-contain
  // zoom must be well below the old floor of 1.
  assert.ok(minZoom < 1);
  assert.equal(minZoom, 1 / 3);

  const fitted = signatureCropTransform({ ...square, zoom: minZoom });
  // At the fit zoom the whole signature is visible — nothing overflows the frame.
  assert.ok(fitted.displayWidth <= square.viewportWidth + 1e-6);
  assert.ok(fitted.displayHeight <= square.viewportHeight + 1e-6);
  assert.equal(fitted.maxOffsetX, 0);
  assert.equal(fitted.maxOffsetY, 0);
});

test('signature crop min zoom stays at 1 when the signature already matches 3:1', () => {
  assert.equal(
    signatureCropMinZoom({ imageWidth: 900, imageHeight: 300, viewportWidth: 450, viewportHeight: 150 }),
    SIGNATURE_CROP_MIN_ZOOM,
  );
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
