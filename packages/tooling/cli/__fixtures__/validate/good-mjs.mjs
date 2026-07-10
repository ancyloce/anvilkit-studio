export default {
	components: {
		Banner: {
			render: () => null,
			fields: {
				headline: {
					type: "text",
				},
			},
			defaultProps: {
				headline: "Ship it",
			},
			metadata: {
				description: "Banner component",
			},
		},
	},
};
