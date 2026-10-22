import { describe, expect, it } from "vitest";
import { parseAgentCommandMessage } from "./agent-command-message.js";

describe("parseAgentCommandMessage", () => {
	it("parses a command bubble without arguments", () => {
		expect(parseAgentCommandMessage("/remember")).toEqual({ command: "remember", args: "" });
	});

	it("keeps skill names and trailing arguments", () => {
		expect(parseAgentCommandMessage("/skill:backwards-design-unit-planner 设计一节课")).toEqual({
			command: "skill:backwards-design-unit-planner",
			args: "设计一节课",
		});
	});

	it("ignores ordinary text", () => {
		expect(parseAgentCommandMessage("请记住这件事")).toBeNull();
		expect(parseAgentCommandMessage("/remember 这件事\n还有补充")).toEqual({
			command: "remember",
			args: "这件事\n还有补充",
		});
	});
});
