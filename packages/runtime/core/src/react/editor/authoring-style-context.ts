"use client";

/**
 * @file Authoring style lookup context (PLAN-0020 CORE-P0-011;
 * DD-0019 §11.4).
 *
 * The seam between config decoration (which installs the render
 * wrappers) and the Phase 1A editor providers (which supply resolved
 * styles). With no provider mounted — every Phase 0 host — the
 * default `null` lookup makes every decorated render behaviorally
 * inert, so decoration alone changes nothing for legacy hosts.
 */

import type { ResolvedAuthoringStyle } from "../../editor/style/resolve-authoring-style.js";
import { createContext } from "react";

/** Resolve one node's materialized authoring style, if any. */
export type AuthoringStyleLookup = (
	nodeId: string,
) => ResolvedAuthoringStyle | undefined;

/**
 * Provided by the editor root (Phase 1A). `null` = no editor mounted:
 * decorated renders pass through untouched.
 */
export const AuthoringStyleContext = createContext<AuthoringStyleLookup | null>(
	null,
);
