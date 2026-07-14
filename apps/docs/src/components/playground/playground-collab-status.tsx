import type { ConnectionStatus } from "@anvilkit/plugin-collab-yjs";
import type { CollabMode } from "../../lib/use-playground-collab";

function describeConnection(status: ConnectionStatus | null): string {
	if (status === null) return "Connecting…";
	switch (status.kind) {
		case "synced":
			return "Synced";
		case "connecting":
			return "Connecting…";
		case "reconnecting":
			return `Reconnecting (attempt ${status.attempt})`;
		case "offline":
			return "Offline";
		case "error":
			return `Error: ${status.message}`;
	}
}

function connectionTone(status: ConnectionStatus | null): string {
	switch (status?.kind) {
		case "synced":
			return "#22c55e";
		case "connecting":
		case "reconnecting":
		case undefined:
			return "#f59e0b";
		default:
			return "#ef4444";
	}
}

export type PlaygroundCollabStatusProps = {
	collabMode: CollabMode;
	collabStatus: ConnectionStatus | null;
};

export function PlaygroundCollabStatus({
	collabMode,
	collabStatus,
}: PlaygroundCollabStatusProps) {
	if (collabMode === "off") return null;
	return (
		<section
			data-testid="playground-collab-status"
			style={{
				display: "flex",
				alignItems: "center",
				gap: "0.5rem",
				fontSize: "0.875rem",
				margin: "0.25rem 0",
			}}
		>
			<span
				aria-hidden
				style={{
					display: "inline-block",
					width: "0.625rem",
					height: "0.625rem",
					borderRadius: "9999px",
					backgroundColor: connectionTone(collabStatus),
				}}
			/>
			<span className="font-medium">{describeConnection(collabStatus)}</span>
			<span className="text-[#6b7280]">
				· {collabMode === "relay" ? "Hocuspocus relay" : "in-memory fallback"}
			</span>
		</section>
	);
}
