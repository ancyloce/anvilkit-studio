/**
 * @file Tests for the `object` field renderer (task Phase 7): renders
 * as a collapsible `<InspectorSection>` instead of an always-open card,
 * while preserving Puck's default-Label-suppression contract (the
 * cloned `Label` passthrough) so nested sub-fields render exactly once.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectField } from "@/overrides/fields/field-types/ObjectField";
import { EditorUiStoreProvider } from "@/state/index";

afterEach(cleanup);

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return (
		<EditorUiStoreProvider
			storeId={`object-field-${Math.random().toString(36).slice(2)}`}
		>
			{children}
		</EditorUiStoreProvider>
	);
}

function DefaultObjectFieldStub({
	Label,
}: {
	readonly Label?: (props: { children?: ReactNode }) => ReactNode;
}): ReactNode {
	const LabelComponent = Label ?? (({ children }) => <>{children}</>);
	return (
		<LabelComponent>
			<input aria-label="Meta title" defaultValue="" />
		</LabelComponent>
	);
}

describe("ObjectField", () => {
	it("renders the field's label as the section title and shows sub-fields when expanded", () => {
		render(
			<Setup>
				<ObjectField
					field={{ type: "object", label: "SEO", objectFields: {} }}
					value={{}}
					onChange={vi.fn()}
					name="seo"
					id="component-1:seo"
				>
					<DefaultObjectFieldStub />
				</ObjectField>
			</Setup>,
		);
		expect(screen.getByText("SEO")).not.toBeNull();
		expect(screen.getByLabelText("Meta title")).not.toBeNull();
		expect(screen.getByRole("button", { name: "SEO" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	});

	it("falls back to the field name when no label is set", () => {
		render(
			<Setup>
				<ObjectField
					field={{ type: "object", objectFields: {} }}
					value={{}}
					onChange={vi.fn()}
					name="actions"
					id="component-1:actions"
				>
					<DefaultObjectFieldStub />
				</ObjectField>
			</Setup>,
		);
		expect(screen.getByText("actions")).not.toBeNull();
	});

	it("suppresses Puck's own default Label so the header renders exactly once", () => {
		render(
			<Setup>
				<ObjectField
					field={{ type: "object", label: "SEO", objectFields: {} }}
					value={{}}
					onChange={vi.fn()}
					name="seo"
					id="component-1:seo"
				>
					<DefaultObjectFieldStub />
				</ObjectField>
			</Setup>,
		);
		expect(screen.getAllByText("SEO")).toHaveLength(1);
	});
});
