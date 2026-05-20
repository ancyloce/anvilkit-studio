/**
 * @file Tests for the canvas drag-and-drop payload codec.
 */

import { describe, expect, it } from "vitest";
import {
  ANVILKIT_CANVAS_DROP_TYPE,
  type CanvasDropPayload,
  encodeDropPayload,
  hasCanvasDropPayload,
  peekDropKind,
  readDropPayload,
} from "../drag-payload";
import { createDataTransfer } from "./data-transfer-double";

describe("drag-payload", () => {
  it("round-trips a text payload and sets the text/plain fallback", () => {
    const dt = createDataTransfer();
    const payload: CanvasDropPayload = { kind: "text", body: "Hello." };
    encodeDropPayload(dt, payload);

    expect(hasCanvasDropPayload(dt)).toBe(true);
    expect(peekDropKind(dt)).toBe("text");
    expect(readDropPayload(dt)).toEqual(payload);
    expect(dt.getData("text/plain")).toBe("Hello.");
  });

  it("round-trips an image payload and falls back to the url", () => {
    const dt = createDataTransfer();
    const payload: CanvasDropPayload = {
      kind: "image",
      url: "https://cdn.test/a.png",
      alt: "A",
    };
    encodeDropPayload(dt, payload);

    expect(peekDropKind(dt)).toBe("image");
    expect(readDropPayload(dt)).toEqual(payload);
    expect(dt.getData("text/plain")).toBe("https://cdn.test/a.png");
  });

  it("ignores foreign drags", () => {
    const dt = createDataTransfer();
    dt.setData("text/plain", "just text");

    expect(hasCanvasDropPayload(dt)).toBe(false);
    expect(peekDropKind(dt)).toBeNull();
    expect(readDropPayload(dt)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const dt = createDataTransfer();
    dt.setData(ANVILKIT_CANVAS_DROP_TYPE, "{not json");

    expect(hasCanvasDropPayload(dt)).toBe(true);
    expect(readDropPayload(dt)).toBeNull();
  });

  it("returns null for structurally invalid payloads", () => {
    const dt = createDataTransfer();
    dt.setData(
      ANVILKIT_CANVAS_DROP_TYPE,
      JSON.stringify({ kind: "text", body: 42 }),
    );
    expect(readDropPayload(dt)).toBeNull();

    const dt2 = createDataTransfer();
    dt2.setData(
      ANVILKIT_CANVAS_DROP_TYPE,
      JSON.stringify({ kind: "image", url: "x" }),
    );
    expect(readDropPayload(dt2)).toBeNull();
  });
});
