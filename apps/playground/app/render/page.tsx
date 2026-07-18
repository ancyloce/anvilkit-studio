import { Render } from "@puckeditor/core/rsc";
import type { ReactElement } from "react";

import {
	createInitialData,
	playgroundConfig,
} from "../../lib/playground-config";

// Server-side render path: the same config/data pair the editor mounts,
// rendered through Puck's RSC entry point with no client-side editor.
export default function RenderPage(): ReactElement {
	return <Render config={playgroundConfig} data={createInitialData()} />;
}
