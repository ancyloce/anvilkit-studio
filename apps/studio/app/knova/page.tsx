"use client";

import React from "react";
import { Stage, Layer, Rect, Circle, Text } from "react-konva";

const App = () => {
	const [size, setSize] = React.useState<{
		width: number;
		height: number;
	} | null>(null);

	React.useEffect(() => {
		const update = () =>
			setSize({ width: window.innerWidth, height: window.innerHeight });
		update();
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);

	if (!size) {
		return null;
	}

	return (
		<Stage width={size.width} height={size.height}>
			<Layer>
				<Text text="Try to drag shapes" fontSize={15} />
				<Rect
					x={20}
					y={50}
					width={100}
					height={100}
					fill="red"
					shadowBlur={10}
					draggable
				/>
				<Circle x={200} y={100} radius={50} fill="green" draggable />
			</Layer>
		</Stage>
	);
};

export default App;
