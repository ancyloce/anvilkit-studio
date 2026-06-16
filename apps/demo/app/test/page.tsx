"use client";

import { createConsoleAdapter } from "@anvilkit/analytics-core";
import { Studio } from "@anvilkit/core";
import type { Config as PuckConfig } from "@puckeditor/core";

import "@anvilkit/core/styles.css";

const puckConfig: PuckConfig = {
	components: {
		Heading: {
			fields: { text: { type: "text" } },
			defaultProps: { text: "Hello" },
			render: ({ text }) => <h1>{text}</h1>,
		},
	},
};

// F9: stable module-scope adapter for this minimal test mount.
const analyticsAdapter = createConsoleAdapter({ source: "studio" });

export default function EditorPage() {
	return (
		<Studio
			puckConfig={puckConfig}
			plugins={[]}
			analytics={analyticsAdapter}
			onPublish={async (data) => {
				await fetch("/api/publish", {
					method: "POST",
					body: JSON.stringify(data),
				});
			}}
		/>
	);
}
