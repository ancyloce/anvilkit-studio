import { cleanup, render } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it } from "vitest";

import { Toaster } from "../sonner.js";

afterEach(cleanup);

describe("Toaster", () => {
	it("mounts without throwing", () => {
		expect(() => render(<Toaster />)).not.toThrow();
	});

	it("uses sonner's toast handle", () => {
		expect(typeof toast).toBe("function");
		expect(typeof toast.error).toBe("function");
		expect(typeof toast.success).toBe("function");
	});
});
