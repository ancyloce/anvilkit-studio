"use client";

import { Studio, StudioLoadingScreen } from "@anvilkit/core";
import type { Data } from "@puckeditor/core";
import { type ReactElement, useState } from "react";

import {
	createInitialData,
	type PlaygroundComponents,
	playgroundConfig,
} from "@/lib/playground-config";

export default function EditorPage(): ReactElement {
	const [data, setData] = useState<Data<PlaygroundComponents>>(() =>
		createInitialData(),
	);

	return (
		<div data-testid="playground-editor" style={{ height: "100vh" }}>
			<Studio
				puckConfig={playgroundConfig}
				data={data}
				onChange={setData}
				loading={<StudioLoadingScreen />}
			/>
		</div>
	);
}
