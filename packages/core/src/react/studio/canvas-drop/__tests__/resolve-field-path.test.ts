/**
 * @file Tests for the position-heuristic field resolver: prop-path
 * collection/matching, immutable path set, and geometry DOM scans.
 */

import { describe, expect, it } from "vitest";
import {
  collectStringPaths,
  findImageTargetAt,
  findStringPropPath,
  findTextElementAt,
  findUrlPropPath,
  getAtPath,
  hasReplaceableTarget,
  looksLikeImageUrl,
  normalizeUrl,
  setPropAtPath,
} from "../resolve-field-path";

const PROPS = {
  id: "hero-1",
  headline: "Build faster",
  description: "Ship in minutes, not weeks.",
  cta: { label: "Get started", id: "cta-1" },
  plans: [
    { id: "p0", name: "Free", blurb: "For hobby" },
    { id: "p1", name: "Pro", blurb: "For teams" },
  ],
  hero: "https://cdn.test/hero.png?v=2",
};

function rect(left: number, top: number, w: number, h: number): DOMRect {
  return {
    left,
    top,
    right: left + w,
    bottom: top + h,
    width: w,
    height: h,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function el(tag: string, r: DOMRect, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (text !== undefined) node.appendChild(document.createTextNode(text));
  node.getBoundingClientRect = () => r;
  return node;
}

describe("collectStringPaths", () => {
  it("collects every string leaf and skips id at any depth", () => {
    const entries = collectStringPaths(PROPS);
    const paths = entries.map((e) => e.path.join("."));
    expect(paths).toContain("headline");
    expect(paths).toContain("cta.label");
    expect(paths).toContain("plans.1.name");
    expect(paths).toContain("plans.0.blurb");
    expect(paths.some((p) => p === "id" || p.endsWith(".id"))).toBe(false);
  });
});

describe("findStringPropPath", () => {
  it("matches an exact top-level value", () => {
    expect(findStringPropPath(PROPS, "Build faster")).toEqual(["headline"]);
  });
  it("matches an array-nested value", () => {
    expect(findStringPropPath(PROPS, "Pro")).toEqual(["plans", 1, "name"]);
  });
  it("normalizes whitespace", () => {
    expect(
      findStringPropPath(PROPS, "  Ship in   minutes, not weeks. "),
    ).toEqual(["description"]);
  });
  it("falls back to closest-length containment", () => {
    const p = findStringPropPath(
      { a: "Get started now", b: "totally unrelated" },
      "Get started",
    );
    expect(p).toEqual(["a"]);
  });
  it("returns null when nothing matches", () => {
    expect(findStringPropPath(PROPS, "nope nope")).toBeNull();
    expect(findStringPropPath(PROPS, "")).toBeNull();
  });
});

describe("findUrlPropPath", () => {
  it("matches ignoring query/hash", () => {
    expect(findUrlPropPath(PROPS, "https://cdn.test/hero.png")).toEqual([
      "hero",
    ]);
  });
  it("matches by basename", () => {
    expect(findUrlPropPath(PROPS, "https://other.cdn/x/hero.png")).toEqual([
      "hero",
    ]);
  });
  it("returns null for an unrelated url", () => {
    expect(findUrlPropPath(PROPS, "https://x/none.jpg")).toBeNull();
  });
});

describe("setPropAtPath", () => {
  it("immutably sets a top-level value, preserving siblings + id", () => {
    const next = setPropAtPath(PROPS, ["headline"], "New");
    expect(next.headline).toBe("New");
    expect(next.id).toBe("hero-1");
    expect(next.description).toBe(PROPS.description);
    expect(PROPS.headline).toBe("Build faster"); // original untouched
    expect(next).not.toBe(PROPS);
  });
  it("sets an array-nested value without touching the other item", () => {
    const next = setPropAtPath(
      PROPS,
      ["plans", 1, "name"],
      "Team",
    ) as typeof PROPS;
    expect(next.plans[1]?.name).toBe("Team");
    expect(next.plans[0]).toBe(PROPS.plans[0]); // sibling ref preserved
    expect(PROPS.plans[1]?.name).toBe("Pro");
  });
});

describe("getAtPath", () => {
  it("reads nested and array paths", () => {
    expect(getAtPath(PROPS, ["cta", "label"])).toBe("Get started");
    expect(getAtPath(PROPS, ["plans", 0, "name"])).toBe("Free");
    expect(getAtPath(PROPS, ["missing", 3])).toBeUndefined();
  });
});

describe("findTextElementAt", () => {
  it("returns the smallest text element containing the point", () => {
    const root = el("div", rect(0, 0, 200, 200));
    const big = el("h1", rect(0, 0, 200, 50), "Build faster");
    const small = el("p", rect(0, 60, 100, 20), "Ship now");
    root.appendChild(big);
    root.appendChild(small);
    document.body.appendChild(root);

    expect(findTextElementAt(root, 10, 10)).toBe("Build faster");
    expect(findTextElementAt(root, 10, 65)).toBe("Ship now");
    expect(findTextElementAt(root, 500, 500)).toBeNull();
    root.remove();
  });

  it("ignores elements whose text is only in descendants", () => {
    const root = el("div", rect(0, 0, 100, 100));
    const wrap = el("section", rect(0, 0, 100, 100)); // no direct text
    const leaf = el("span", rect(0, 0, 40, 20), "Leaf");
    wrap.appendChild(leaf);
    root.appendChild(wrap);
    expect(findTextElementAt(root, 5, 5)).toBe("Leaf");
  });
});

describe("findImageTargetAt", () => {
  it("returns the src of the smallest img containing the point", () => {
    const root = el("div", rect(0, 0, 200, 200));
    const a = document.createElement("img");
    a.setAttribute("src", "/a.png");
    a.getBoundingClientRect = () => rect(0, 0, 200, 200);
    const b = document.createElement("img");
    b.setAttribute("src", "/b.png");
    b.getBoundingClientRect = () => rect(0, 0, 50, 50);
    root.appendChild(a);
    root.appendChild(b);
    expect(findImageTargetAt(root, 10, 10)).toBe("/b.png");
    expect(findImageTargetAt(root, 120, 120)).toBe("/a.png");
  });

  it("extracts a background-image url", () => {
    const root = el("div", rect(0, 0, 100, 100));
    const bg = el("div", rect(0, 0, 80, 80));
    bg.style.backgroundImage = 'url("https://cdn.test/bg.jpg")';
    root.appendChild(bg);
    expect(findImageTargetAt(root, 5, 5)).toBe("https://cdn.test/bg.jpg");
  });
});

describe("helpers", () => {
  it("normalizeUrl strips query/hash", () => {
    expect(normalizeUrl("https://x/y.png?a=1#z")).toBe("https://x/y.png");
  });
  it("looksLikeImageUrl", () => {
    expect(looksLikeImageUrl("/a/b.webp")).toBe(true);
    expect(looksLikeImageUrl("data:image/png;base64,xx")).toBe(true);
    expect(looksLikeImageUrl("just text")).toBe(false);
  });
  it("hasReplaceableTarget", () => {
    expect(hasReplaceableTarget(PROPS, "text")).toBe(true);
    expect(hasReplaceableTarget(PROPS, "image")).toBe(true);
    expect(hasReplaceableTarget({ id: "x" }, "text")).toBe(false);
    expect(hasReplaceableTarget({ id: "x", t: "hi" }, "image")).toBe(false);
  });
});
