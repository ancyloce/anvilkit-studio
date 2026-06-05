/**
 * @file Concise re-export of the animate-ui Tabs primitive.
 *
 * Lets call sites use `@/primitives/tabs` instead of the deep
 * `@/primitives/vendor/animate-ui/components/base/tabs` path that the shadcn
 * registry installs into. The animate-ui implementation is the single
 * source of truth — keep edits in `./animate-ui/components/base/tabs`.
 */

export {
	Tabs,
	TabsList,
	type TabsListProps,
	TabsPanel,
	type TabsPanelProps,
	TabsPanels,
	type TabsPanelsProps,
	type TabsProps,
	TabsTab,
	type TabsTabProps,
} from "./vendor/animate-ui/components/base/tabs";
