"use client";

import { Studio } from "@anvilkit/core";
import type { PageIR } from "@anvilkit/core/types";
import { irToPuckData } from "@anvilkit/ir";

import { puckConfig } from "../../../puck-config";

const defaultPageIR: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "heading-1",
				type: "Heading",
				props: {
					text: "Hello from __NAME__",
				},
			},
		],
	},
	assets: [],
	metadata: {
		title: "__NAME__",
		description: "Anvilkit starter page",
	},
};

const seedPageIR: PageIR = defaultPageIR;

export default function PuckEditorPage() {
	return (
		<Studio
			data={irToPuckData(seedPageIR)}
			puckConfig={puckConfig}
			plugins={[]}
			onPublish={async () => {}}
		/>
	);
}
