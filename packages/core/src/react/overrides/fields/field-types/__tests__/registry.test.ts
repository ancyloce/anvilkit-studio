/**
 * @file Regression test for review finding M1: the field-type registry
 * is built through `defineFieldTypeRegistry()` — a single cast
 * boundary with a runtime key guard — instead of per-renderer
 * `as unknown as` type erasure.
 */

import { describe, expect, it } from "vitest";
import {
  defaultFieldTypes,
  defineFieldTypeRegistry,
  type FieldTypeRenderer,
} from "@/overrides/fields/field-types";

const EXPECTED_KEYS = [
  "text",
  "textarea",
  "number",
  "select",
  "radio",
  "array",
  "object",
  "slot",
  "external",
];

describe("defaultFieldTypes", () => {
  it("exposes exactly the supported Puck Field.type keys", () => {
    expect(Object.keys(defaultFieldTypes).sort()).toEqual(
      [...EXPECTED_KEYS].sort(),
    );
  });

  it("maps every key to a renderer function", () => {
    for (const key of EXPECTED_KEYS) {
      expect(typeof (defaultFieldTypes as Record<string, unknown>)[key]).toBe(
        "function",
      );
    }
  });
});

describe("defineFieldTypeRegistry", () => {
  const noop = (() => null) as unknown as FieldTypeRenderer;

  it("returns the registry when all keys are valid", () => {
    const registry = defineFieldTypeRegistry({
      text: noop,
      textarea: noop,
      number: noop,
      select: noop,
      radio: noop,
      array: noop,
      object: noop,
      slot: noop,
      external: noop,
    });
    expect(typeof (registry as Record<string, unknown>).text).toBe("function");
  });

  it("throws loudly on an unknown field-type key", () => {
    expect(() =>
      defineFieldTypeRegistry({
        // @ts-expect-error — intentionally invalid key for the runtime guard.
        bogus: noop,
      }),
    ).toThrow(/Unknown field type/);
  });
});
