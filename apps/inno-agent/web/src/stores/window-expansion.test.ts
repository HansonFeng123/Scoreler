import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	appStore: {
		sidebarCollapsed: false,
		workspaceMode: "collapsed" as const,
		workspaceWidth: 520,
	},
}));

vi.mock("./app-store.js", () => ({ appStore: mocks.appStore }));

import { ensureWindowForPanel } from "./window-expansion.js";

describe("ensureWindowForPanel", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("falls back cleanly for a browser without the Electron bridge", async () => {
		vi.stubGlobal("window", { innerWidth: 1200 });

		await expect(ensureWindowForPanel("right", 640, "half")).resolves.toBe("unavailable");
	});

	it("moves the window left when the right edge has no room", async () => {
		const windowMock = {
			innerWidth: 1200,
			innoDesktop: {} as NonNullable<Window["innoDesktop"]>,
		};
		const expandWindowWidth = vi.fn(async (side: "left" | "right", additionalWidth: number) => {
			if (side !== "left") return false;
			windowMock.innerWidth += additionalWidth;
			return true;
		});
		const getWindowWidthCapacity = vi.fn(async (side: "left" | "right") => side === "left" ? 400 : 0);
		windowMock.innoDesktop = {
			setCloseDialogCopy: vi.fn(),
			expandWindowWidth,
			getWindowWidthCapacity,
			openLocalFile: vi.fn(async () => false),
		};
		vi.stubGlobal("window", windowMock);

		await expect(ensureWindowForPanel("right", 500, "half")).resolves.toBe("ready");
		expect(getWindowWidthCapacity).toHaveBeenCalledWith("right");
		expect(getWindowWidthCapacity).toHaveBeenCalledWith("left");
		expect(expandWindowWidth).toHaveBeenCalledWith("left", 364);
	});
});
