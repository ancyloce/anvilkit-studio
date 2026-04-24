import type { Config } from "@puckeditor/core";

const noop = (() => null) as unknown as Config["components"][string]["render"];

export const missingRenderConfig: Config = {
	components: {
		Broken: {
			fields: {
				title: { type: "text" },
			},
		} as unknown as Config["components"][string],
	},
};

export const asyncRenderConfig: Config = {
	components: {
		Broken: {
			render: (async () =>
				null) as unknown as Config["components"][string]["render"],
			fields: {
				title: { type: "text" },
			},
		},
	},
};

export const missingFieldsConfig: Config = {
	components: {
		Broken: {
			render: noop,
		} as unknown as Config["components"][string],
	},
};

export const invalidFieldShapeConfig: Config = {
	components: {
		Broken: {
			render: noop,
			fields: {
				bad: "not-an-object" as unknown as Config["components"][string]["fields"][string],
			},
		},
	},
};

export const nonSerializableDefaultConfig: Config = {
	components: {
		Broken: {
			render: noop,
			fields: {
				action: { type: "text" },
			},
			defaultProps: {
				action: (() => {
					/* noop */
				}) as unknown,
			},
		} as Config["components"][string],
	},
};

export const nestedNonSerializableDefaultConfig: Config = {
	components: {
		Broken: {
			render: noop,
			fields: {
				settings: { type: "text" },
			},
			defaultProps: {
				settings: {
					layout: {
						onPress: (() => {
							/* noop */
						}) as unknown,
					},
				} as unknown,
			},
		} as Config["components"][string],
	},
};

export const missingDescriptionConfig: Config = {
	components: {
		Broken: {
			render: noop,
			fields: {
				title: { type: "text" },
			},
		},
	},
};

export const unknownFieldTypeConfig: Config = {
	components: {
		Broken: {
			render: noop,
			fields: {
				widget: { type: "magic" },
			} as Config["components"][string]["fields"],
		},
	},
};
