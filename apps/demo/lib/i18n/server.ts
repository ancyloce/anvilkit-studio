/**
 * Server-only locale access for the demo's marketing surfaces.
 *
 * The active locale is carried in the {@link LOCALE_COOKIE} cookie (the client
 * `<DemoI18nProvider>` writes it; see `client.tsx`). Server Components and
 * `generateMetadata` read it here so page bodies and `<title>`/description
 * render in the right language with no hydration flash — the matching
 * `initialLocale` is handed to the client provider from the root layout, so
 * the first client render agrees with the server.
 *
 * Reading the cookie opts the marketing routes into dynamic rendering, which
 * is the intended trade-off for a localized demo.
 */

import { cookies } from "next/headers";
import {
	createTranslator,
	type DemoLocale,
	type DemoTranslator,
	LOCALE_COOKIE,
	resolveLocale,
} from "./messages";

/** The locale for the current request, from the cookie (defaults to `en`). */
export async function getServerLocale(): Promise<DemoLocale> {
	const store = await cookies();
	return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

/** A translator bound to the current request's locale. */
export async function getServerT(): Promise<DemoTranslator> {
	return createTranslator(await getServerLocale());
}
