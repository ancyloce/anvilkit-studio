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
				description: "Hero component",
			},
		},
		CallToAction: {
			render: () => null,
			fields: {
				label: {
					type: "text",
				},
			},
			defaultProps: {
				label: "Start",
			},
			metadata: {
				description: "Call to action component",
			},
		},
	},
};
