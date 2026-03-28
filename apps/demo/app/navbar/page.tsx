import type { Metadata } from "next";
import { NavbarPlayground } from "./playground";

export const metadata: Metadata = {
	title: "Navbar Demo | Anvilkit Components Demo",
	description:
		"Interactive playground and usage guide for the @anvilkit/navbar package.",
};

export default function NavbarDemoPage() {
	return <NavbarPlayground />;
}
