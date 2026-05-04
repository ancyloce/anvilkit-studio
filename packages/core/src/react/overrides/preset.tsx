/**
 * @file Default override preset (PRD §3.5).
 *
 * `studioOverrides` is the singleton that maps every chrome-owned
 * Puck override slot to its default component. `<Studio chrome=
 * "anvilkit">` prepends it to the `mergeOverrides()` input list;
 * `<Studio chrome="puck">` skips it entirely.
 *
 * `createStudioOverrides({ fieldTypes })` is the factory variant —
 * v1 supports a partial fieldTypes override so consumers can swap
 * one renderer without cloning the entire registry.
 */

import type { Overrides as PuckOverrides } from "@puckeditor/core";

import {
  ActionBar,
  CanvasIframe,
  CanvasPreview,
  ComponentOverlay,
} from "./canvas/index";
import { defaultFieldTypes } from "./fields/field-types/index";
import {
  DrawerItem,
  EditorDrawer,
  FieldLabel,
  FieldsPanel,
} from "./layout/index";
import type { CreateStudioOverridesOptions } from "./types";
import { StudioLayout } from "../studio/layout/StudioLayout";

/**
 * Build the default override set. Per-slot wrappers convert the
 * presentational components into the `RenderFunc` shape Puck expects.
 */
export function createStudioOverrides(
	options: CreateStudioOverridesOptions = {},
): Partial<PuckOverrides> {
	const fieldTypes =
		options.fieldTypes === undefined
			? defaultFieldTypes
			: ({ ...defaultFieldTypes, ...options.fieldTypes } as NonNullable<
					PuckOverrides["fieldTypes"]
				>);

	return {
		puck: () => <StudioLayout />,
		drawer: ({ children }) => <EditorDrawer>{children}</EditorDrawer>,
		drawerItem: ({ children, name }) => (
			<DrawerItem name={name}>{children}</DrawerItem>
		),
		fields: ({ children, isLoading, itemSelector }) => (
			<FieldsPanel
				isLoading={isLoading}
				itemSelector={itemSelector ?? null}
			>
				{children}
			</FieldsPanel>
		),
		fieldLabel: ({ children, icon, label, el, readOnly, className }) => (
			<FieldLabel
				icon={icon}
				label={label}
				el={el}
				readOnly={readOnly}
				className={className}
			>
				{children}
			</FieldLabel>
		),
		iframe: ({ children, document: doc }) => (
			<CanvasIframe document={doc}>{children}</CanvasIframe>
		),
		componentOverlay: (props) => <ComponentOverlay {...props} />,
		actionBar: (props) => <ActionBar {...props} />,
		preview: () => <CanvasPreview />,
		fieldTypes,
	};
}

/**
 * Singleton instance of the default preset. Identity is stable
 * across renders so `<Studio>` can pass it directly into
 * `mergeOverrides()` without additional memoization.
 */
export const studioOverrides: Partial<PuckOverrides> = createStudioOverrides();
