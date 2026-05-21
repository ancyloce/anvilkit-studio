"use client";

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

export default function EditorPage() {
	return (
		<Studio
			puckConfig={puckConfig}
			plugins={[]}
			onPublish={async (data) => {
				await fetch("/api/publish", {
					method: "POST",
					body: JSON.stringify(data),
				});
			}}
		/>
	);
}
