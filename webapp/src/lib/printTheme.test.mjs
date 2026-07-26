import test from "node:test";
import assert from "node:assert/strict";

import { PRINT_FONT_STACK, printPlaceholderHtml } from "./printTheme.js";

test("print theme exposes one Thai-first neutral font stack", () => {
  assert.match(PRINT_FONT_STACK, /IBM Plex Sans Thai/);
  assert.match(PRINT_FONT_STACK, /Noto Sans Thai/);
});

test("print placeholder escapes content and uses the shared font", () => {
  const html = printPlaceholderHtml({
    title: "<เอกสาร>",
    message: "A & B",
    tone: "error",
    closeButton: true,
  });
  assert.match(html, /&lt;เอกสาร&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /IBM Plex Sans Thai/);
  assert.match(html, /window\.close/);
});
