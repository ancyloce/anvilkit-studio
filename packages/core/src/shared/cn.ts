/**
 * @file `cn()` — class-name composition for Studio chrome.
 *
 * Runs every input through {@link clsx} for conditional class
 * concatenation, then through {@link twMerge} so that conflicting
 * Tailwind utilities (e.g. `px-2 px-4`) collapse to the last one.
 * Required by every primitive and layout component that accepts a
 * `className` prop the consumer wants to extend.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: readonly ClassValue[]): string {
	return twMerge(clsx(inputs));
}
