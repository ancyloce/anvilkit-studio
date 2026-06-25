import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import {
	docSplat,
	localeFromPathname,
	stripLocaleFromPathname,
} from "@/lib/i18n";
import { provider } from "@/lib/i18n-ui";
import appCss from "@/styles/app.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "AnvilKit — Puck-native React component packages" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

// App routes that have no localized variant. Switching language while on one of
// these lands the user on the localized home instead of a non-existent
// `/{locale}/playground` (which the docs splat would 404).
const NON_LOCALIZED_ROUTES = new Set(["playground", "marketplace"]);

function RootComponent() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const navigate = useNavigate();
	const locale = localeFromPathname(pathname);

	const i18nProps = {
		...provider(locale),
		// Honor `hideLocale: 'default-locale'`: English drops the prefix
		// (`/getting-started`), other locales keep it (`/zh/getting-started`).
		// The default handler would produce `/en/...`, breaking Starlight URL parity.
		onLocaleChange: (next: string) => {
			const rest = stripLocaleFromPathname(pathname);
			const firstSegment = rest.split("/")[0];
			const target = NON_LOCALIZED_ROUTES.has(firstSegment)
				? docSplat(next, "")
				: docSplat(next, rest);

			if (target === "") {
				navigate({ to: "/" });
				return;
			}
			navigate({ to: "/$", params: { _splat: target } });
		},
	};

	return (
		<html suppressHydrationWarning lang={locale}>
			<head>
				<HeadContent />
			</head>
			<body className="flex flex-col min-h-screen">
				<RootProvider i18n={i18nProps}>
					<Outlet />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
