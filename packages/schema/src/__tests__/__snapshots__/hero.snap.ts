import type { AiComponentSchema } from "@anvilkit/core/types";

export const hero: AiComponentSchema = {
	"componentName": "Hero",
	"description": "",
	"fields": [
		{
			"name": "announcementHref",
			"type": "text"
		},
		{
			"name": "announcementLabel",
			"type": "text"
		},
		{
			"name": "announcementOpenInNewTab",
			"type": "boolean"
		},
		{
			"name": "description",
			"type": "text"
		},
		{
			"name": "headline",
			"type": "text"
		},
		{
			"name": "linuxHref",
			"type": "text"
		},
		{
			"name": "linuxLabel",
			"type": "text"
		},
		{
			"name": "linuxOpenInNewTab",
			"type": "boolean"
		},
		{
			"name": "windowsHref",
			"type": "text"
		},
		{
			"name": "windowsLabel",
			"type": "text"
		},
		{
			"name": "windowsOpenInNewTab",
			"type": "boolean"
		}
	]
};
