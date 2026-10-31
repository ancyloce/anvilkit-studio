import type { ReactNode } from "react";
import { LanguageSwitcher } from "../_site/LanguageSwitcher";

/**
 * Layout of the Agent routes (`/agent/*`, plan 0005 §5): the marketing nav
 * does not render here, so the shared language switcher is mounted on its
 * own. Switching the locale re-renders the client views and refreshes the
 * Server Components through `<DemoI18nProvider>`; it never creates or
 * changes an operation (the views post only on an explicit action).
 */
export default function AgentLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<>
			<header
				className="mx-auto flex w-full max-w-3xl items-center justify-end px-6 pt-4"
				data-testid="agent-header"
			>
				<LanguageSwitcher />
			</header>
			{children}
		</>
	);
}
