export default {
	components: {
		BrokenCard: {
			render: () => null,
			fields: {
				onClick: {
					type: "text",
				},
			},
			defaultProps: {
				onClick: () => null,
			},
			metadata: {
				description: "Broken default props component",
			},
		},
	},
};
