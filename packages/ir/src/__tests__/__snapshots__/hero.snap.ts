import type { PageIR } from "@anvilkit/core/types";

export const hero: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "hero-1",
				type: "Hero",
				props: {
					announcementHref: "",
					announcementLabel: "We raised $69M pre seed",
					announcementOpenInNewTab: false,
					description:
						"Our state of the art tool is a tool that allows you to\nwrite copy instantly.",
					headline: "Write fast with\naccurate precision.",
					linuxHref: "/download/linux",
					linuxLabel: "Download for Linux",
					linuxOpenInNewTab: false,
					windowsHref: "/download/windows",
					windowsLabel: "Download for Windows",
					windowsOpenInNewTab: false,
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
