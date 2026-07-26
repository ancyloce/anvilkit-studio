/**
 * @file CFX coverage tracking (PLAN-0020 CORE-P2-011).
 *
 * ADR 0005's enforcement clause (c) only means something if a
 * declared fixture that nobody implemented **fails the build** rather
 * than quietly reading as covered. Suites call {@link certify} inside
 * each fixture; {@link uncertifiedFixtures} then names every id the
 * run never reached, and the suite asserts that list is empty.
 *
 * Deliberately not a test-framework helper: the canvas repo runs a
 * different runner, and this contract is a plain function pair.
 */

import { CFX_IDS, type CfxId } from "./manifest.js";

const certified = new Set<CfxId>();

/** Record that a fixture actually executed. */
export function certify(id: CfxId): void {
	certified.add(id);
}

/** Fixture ids the current run never exercised. */
export function uncertifiedFixtures(): readonly CfxId[] {
	return CFX_IDS.filter((id) => !certified.has(id));
}

/** Reset coverage (per-file isolation in watch mode). */
export function resetCfxCoverage(): void {
	certified.clear();
}
