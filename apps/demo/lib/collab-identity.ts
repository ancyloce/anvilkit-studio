"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "anvilkit:demo:peer";
const SESSION_KEY = "anvilkit:demo:peer-session";
const SESSION_SEPARATOR = "::session:";

// Stable defaults used on the server pass and on the first client render
// before we read localStorage. `id` is a fixed sentinel so two different
// browsers don't collide before they each generate their own UUIDs.
const PLACEHOLDER_ID = "demo-guest";
const PLACEHOLDER_NAME = "Guest";

export interface DemoIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly color: string;
}

const ADJECTIVES = [
  "Curious",
  "Daring",
  "Eager",
  "Gentle",
  "Jolly",
  "Keen",
  "Lively",
  "Mighty",
  "Nimble",
  "Playful",
  "Quick",
  "Sunny",
  "Swift",
  "Witty",
  "Zesty",
  "Bright",
];

const ANIMALS = [
  "Falcon",
  "Otter",
  "Panda",
  "Lynx",
  "Heron",
  "Badger",
  "Marmot",
  "Puffin",
  "Quokka",
  "Raven",
  "Seal",
  "Tapir",
  "Vole",
  "Wombat",
  "Yak",
  "Zebra",
];

/**
 * Deterministic pastel from a stable id hash. Used to assign a
 * predictable color per peer so two tabs of the same identity (or two
 * users with the same `id`) render with matching avatars across all
 * presence surfaces.
 */
export function peerColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function randomDisplayName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}

function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `peer-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const fresh = generateId();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return generateId();
  }
}

function withSessionIdentity(profile: DemoIdentity): DemoIdentity {
  const sessionId = getSessionId();
  return {
    id: `${profile.id}${SESSION_SEPARATOR}${sessionId}`,
    displayName: profile.displayName,
    color: profile.color,
  };
}

function profileFromSessionIdentity(identity: DemoIdentity): DemoIdentity {
  const separatorIndex = identity.id.lastIndexOf(SESSION_SEPARATOR);
  if (separatorIndex === -1) return identity;
  return {
    id: identity.id.slice(0, separatorIndex),
    displayName: identity.displayName,
    color: identity.color,
  };
}

function identityFromPeerOverride(peerOverride: string): DemoIdentity {
  const trimmed = peerOverride.trim().slice(0, 64) || PLACEHOLDER_NAME;
  const id = `demo-peer:${trimmed.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
  return {
    id,
    displayName: trimmed,
    color: peerColor(id),
  };
}

function readStored(): DemoIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoIdentity>;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.displayName === "string" &&
      typeof parsed.color === "string"
    ) {
      return {
        id: parsed.id,
        displayName: parsed.displayName,
        color: parsed.color,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeStored(identity: DemoIdentity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage may be blocked (private mode, quota); the in-memory
    // state still drives the session, so swallow.
  }
}

export interface UseDemoIdentityOptions {
  readonly enabled?: boolean;
  /**
   * One-shot override for the display name (from `?peer=`). Does NOT
   * persist to localStorage; lets two-tab manual testing pin distinct
   * names without touching the user's saved identity.
   */
  readonly peerOverride?: string | null;
}

export interface UseDemoIdentityResult {
  readonly identity: DemoIdentity;
  readonly ready: boolean;
  readonly setDisplayName: (next: string) => void;
}

/**
 * Persist a random adjective-animal profile in localStorage so a user
 * who refreshes the demo keeps the same handle (and color), while the
 * awareness peer id gets a per-tab session suffix. That suffix matters
 * for manual collaboration testing: two tabs copied from the same room
 * URL share localStorage, but must still appear as distinct peers.
 *
 * SSR-safe: first render is the static `{ id: "demo-guest",
 * displayName: "Guest" }` placeholder and we flip to the real identity
 * inside an effect on the client.
 */
export function useDemoIdentity(
  options: UseDemoIdentityOptions = {},
): UseDemoIdentityResult {
  const enabled = options.enabled ?? true;
  const [identity, setIdentity] = useState<DemoIdentity>({
    id: PLACEHOLDER_ID,
    displayName: options.peerOverride || PLACEHOLDER_NAME,
    color: peerColor(PLACEHOLDER_ID),
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    if (options.peerOverride) {
      setIdentity(
        withSessionIdentity(identityFromPeerOverride(options.peerOverride)),
      );
      setReady(true);
      return;
    }
    const stored = readStored();
    if (stored) {
      setIdentity(withSessionIdentity(stored));
      setReady(true);
      return;
    }
    const id = generateId();
    const displayName = randomDisplayName();
    const freshProfile: DemoIdentity = {
      id,
      displayName,
      color: peerColor(id),
    };
    writeStored(freshProfile);
    setIdentity(withSessionIdentity(freshProfile));
    setReady(true);
  }, [enabled, options.peerOverride]);

  const setDisplayName = useCallback(
    (next: string) => {
      setIdentity((prev) => {
        const trimmed = next.trim().slice(0, 64) || prev.displayName;
        const profile = profileFromSessionIdentity(prev);
        const updatedProfile: DemoIdentity = {
          ...profile,
          displayName: trimmed,
        };
        if (!options.peerOverride) writeStored(updatedProfile);
        return withSessionIdentity(updatedProfile);
      });
    },
    [options.peerOverride],
  );

  return { identity, ready, setDisplayName };
}
