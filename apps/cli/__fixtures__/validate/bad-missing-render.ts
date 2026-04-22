export default {
	components: {
		BrokenCard: {
			fields: {
				title: {
					type: "text",
				},
			},
			defaultProps: {
				title: "Oops",
			},
			metadata: {
				description: "Broken card component",
			},
		},
	},
};
