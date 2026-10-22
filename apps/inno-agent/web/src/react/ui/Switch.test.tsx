import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch.js";

afterEach(cleanup);

describe("Switch", () => {
	it("renders as a switch with the checked state exposed to a11y", () => {
		render(<Switch checked={true} onChange={() => {}} aria-label="toggle memory" />);
		const el = screen.getByRole("switch", { name: "toggle memory" });
		expect(el.getAttribute("aria-checked")).toBe("true");
	});

	it("calls onChange with the inverted value on click", () => {
		const onChange = vi.fn();
		render(<Switch checked={false} onChange={onChange} />);
		fireEvent.click(screen.getByRole("switch"));
		expect(onChange).toHaveBeenCalledWith(true);
	});

	it("does not fire onChange when disabled", () => {
		const onChange = vi.fn();
		render(<Switch checked={false} onChange={onChange} disabled />);
		const el = screen.getByRole("switch");
		expect(el).toHaveProperty("disabled", true);
		fireEvent.click(el);
		expect(onChange).not.toHaveBeenCalled();
	});
});
