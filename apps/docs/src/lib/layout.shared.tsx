import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { i18n } from "./i18n";
import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: appName,
		},
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
		// Render the language switcher in the nav. The available locales and the
		// active one come from the `<RootProvider i18n>` context set in __root.tsx.
		i18n,
	};
}
