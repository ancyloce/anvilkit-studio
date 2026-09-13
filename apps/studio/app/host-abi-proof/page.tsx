import type { Metadata } from "next";
import { HostAbiProof } from "./proof";

export const metadata: Metadata = {
	title: "Host ABI proof",
	description:
		"AnvilKit S1-T03: loads a remote component module through the host facades and proves shared runtime identity.",
};

export default function HostAbiProofPage() {
	return <HostAbiProof />;
}
