const render = async () => null;

export default {
	components: {
		BrokenCard: {
			render,
			fields: {
				title: {
					type: "text",
				},
			},
			defaultProps: {
				title: "Oops",
			},
			metadata: {
				description: "Broken async card component",
			},
		},
	},
};
