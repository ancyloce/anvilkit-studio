export default {
	components: {
		Hero: {
			render: () => null,
			fields: {
				title: {
					type: "text",
				},
			},
			defaultProps: {
				title: "Hello",
			},
			metadata: {
				description: "Basic hero component",
			},
		},
	},
};
