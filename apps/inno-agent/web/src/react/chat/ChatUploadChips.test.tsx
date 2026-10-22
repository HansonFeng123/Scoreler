// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PendingUpload } from "./composer-utils.js";
import { ChatUploadChips } from "./ChatUploadChips.js";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? "" }),
}));

afterEach(cleanup);

function workspaceUpload(id: number, path: string): PendingUpload {
	return {
		id,
		fileName: path.split("/").pop() ?? path,
		path,
		source: "workspace",
		status: "ready",
		pct: 100,
	};
}

describe("ChatUploadChips", () => {
	it("does not transfer a removed drag opacity to the next chip", () => {
		const transfer = {
			setData: vi.fn(),
			setDragImage: vi.fn(),
			effectAllowed: "",
		};
		const first = workspaceUpload(1, "first.pdf");
		const second = workspaceUpload(2, "second.pdf");
		const props = {
			onRemove: vi.fn(),
			uploads: [first, second],
		};
		const { rerender } = render(<ChatUploadChips {...props} />);

		const firstChip = screen.getByTitle(first.path);
		fireEvent.dragStart(firstChip, { dataTransfer: transfer });
		expect(firstChip.className).toContain("is-dragging");

		// Dropping onto a smart bubble can unmount the source before its native
		// dragend event fires. The remaining chip must stay fully visible.
		rerender(<ChatUploadChips {...props} uploads={[second]} />);
		expect(screen.getByTitle(second.path).className).not.toContain("is-dragging");
	});

	it("clears drag opacity when the window finishes the drag", () => {
		const transfer = {
			setData: vi.fn(),
			setDragImage: vi.fn(),
			effectAllowed: "",
		};
		const file = workspaceUpload(3, "file.pdf");
		render(<ChatUploadChips uploads={[file]} onRemove={vi.fn()} />);

		const chip = screen.getByTitle(file.path);
		fireEvent.dragStart(chip, { dataTransfer: transfer });
		fireEvent(window, new Event("dragend"));
		expect(chip.className).not.toContain("is-dragging");
	});
});
