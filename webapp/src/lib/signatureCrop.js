export const SIGNATURE_CROP_ASPECT = 3;
export const SIGNATURE_CROP_OUTPUT_WIDTH = 1200;
export const SIGNATURE_CROP_OUTPUT_HEIGHT = 400;
export const SIGNATURE_CROP_MIN_ZOOM = 1;
export const SIGNATURE_CROP_MAX_ZOOM = 3;

export function clampSignatureCropValue(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

// Zoom is expressed relative to a "cover" fit (baseScale). A value of 1 fills the
// whole 3:1 frame. To let a signature whose aspect ratio isn't 3:1 shrink until it
// is fully visible (contained) instead of overflowing, we allow zoom to drop below 1
// down to the ratio that turns the cover fit into a contain fit.
export function signatureCropMinZoom({ imageWidth, imageHeight, viewportWidth, viewportHeight }) {
  const iw = Number(imageWidth);
  const ih = Number(imageHeight);
  const vw = Number(viewportWidth);
  const vh = Number(viewportHeight);
  if (!(iw > 0) || !(ih > 0) || !(vw > 0) || !(vh > 0)) return SIGNATURE_CROP_MIN_ZOOM;
  const coverScale = Math.max(vw / iw, vh / ih);
  const containScale = Math.min(vw / iw, vh / ih);
  return Math.min(SIGNATURE_CROP_MIN_ZOOM, containScale / coverScale);
}

export function signatureCropTransform({
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  zoom = SIGNATURE_CROP_MIN_ZOOM,
  offsetX = 0,
  offsetY = 0,
}) {
  const iw = Number(imageWidth);
  const ih = Number(imageHeight);
  const vw = Number(viewportWidth);
  const vh = Number(viewportHeight);
  if (!(iw > 0) || !(ih > 0) || !(vw > 0) || !(vh > 0)) return null;

  const minZoom = signatureCropMinZoom({ imageWidth: iw, imageHeight: ih, viewportWidth: vw, viewportHeight: vh });
  const safeZoom = clampSignatureCropValue(zoom, minZoom, SIGNATURE_CROP_MAX_ZOOM);
  const baseScale = Math.max(vw / iw, vh / ih);
  const displayWidth = iw * baseScale * safeZoom;
  const displayHeight = ih * baseScale * safeZoom;
  const maxOffsetX = Math.max(0, (displayWidth - vw) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - vh) / 2);

  return {
    zoom: safeZoom,
    minZoom,
    baseScale,
    displayWidth,
    displayHeight,
    maxOffsetX,
    maxOffsetY,
    offsetX: clampSignatureCropValue(offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampSignatureCropValue(offsetY, -maxOffsetY, maxOffsetY),
  };
}

export function signatureCropDrawRect(input, output = {}) {
  const transform = signatureCropTransform(input);
  if (!transform) return null;
  const outputWidth = Number(output.width) || SIGNATURE_CROP_OUTPUT_WIDTH;
  const outputHeight = Number(output.height) || SIGNATURE_CROP_OUTPUT_HEIGHT;
  const scaleX = outputWidth / Number(input.viewportWidth);
  const scaleY = outputHeight / Number(input.viewportHeight);

  return {
    x: ((Number(input.viewportWidth) / 2) + transform.offsetX - (transform.displayWidth / 2)) * scaleX,
    y: ((Number(input.viewportHeight) / 2) + transform.offsetY - (transform.displayHeight / 2)) * scaleY,
    width: transform.displayWidth * scaleX,
    height: transform.displayHeight * scaleY,
  };
}
