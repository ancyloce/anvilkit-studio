import { createTokenizer as createJapaneseTokenizer } from "@orama/tokenizers/japanese";
import { createTokenizer as createMandarinTokenizer } from "@orama/tokenizers/mandarin";
import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// Orama search engine built into fumadocs-core. The loader is i18n-enabled, so a
// per-locale index is built automatically; the search dialog passes the active
// locale from the i18n context.
//
// Orama ships stemmers only for the languages in `STEMMERS` — none for CJK, and
// passing `zh`/`ja` raw would throw "LANGUAGE_NOT_SUPPORTED". zh/ja have no
// whitespace word boundaries, so the default tokenizer would index a whole line
// as one token; instead they use @orama/tokenizers, which segment with the
// built-in `Intl.Segmenter` (no WASM/dictionary, no async init). Korean DOES use
// whitespace word boundaries and has no Orama tokenizer, so it stays on the
// `english` tokenizer, which splits it acceptably.
// https://docs.orama.com/docs/orama-js/supported-languages
const server = createFromSource(source, {
	localeMap: {
		en: "english",
		zh: { tokenizer: createMandarinTokenizer() },
		ja: { tokenizer: createJapaneseTokenizer() },
		ko: "english",
	},
});

export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: async ({ request }) => server.GET(request),
		},
	},
});
