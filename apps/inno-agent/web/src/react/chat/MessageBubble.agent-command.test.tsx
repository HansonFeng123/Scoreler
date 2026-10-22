// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageBubble } from "./MessageBubble.js";
import type { ChatMessage } from "../../types/chat.js";

afterEach(cleanup);

function renderCommand(content: string, onOpenSkill?: (skillName: string) => void) {
	const message: ChatMessage = {
		role: "user",
		content,
		timestamp: Date.now(),
	};
	render(<MessageBubble message={message} onOpenSkill={onOpenSkill} />);
	return document.querySelector<HTMLElement>(".inno-smart-agent-ref-bubble");
}

describe("sent Agent command bubbles", () => {
	it("renders a user-side skill command bubble immediately after sending", () => {
		const chip = renderCommand("/skill:backwards-design-unit-planner");

		expect(chip?.textContent).toContain("backwards-design-unit-planner");
	});

	it("renders persisted expanded skill messages as the same compact bubble", () => {
		const chip = renderCommand('<skill name="backwards-design-unit-planner" location="/tmp/SKILL.md">\nbody\n</skill>\n\n请帮我规划课程');

		expect(chip?.textContent).toContain("backwards-design-unit-planner");
		expect(document.querySelector(".inno-smart-agent-ref-args")?.textContent).toBe("请帮我规划课程");
	});

	it("keeps native command hints on non-skill bubbles", () => {
		const chip = renderCommand("/recall");

		expect(chip?.textContent).toContain("回顾对话");
		expect(chip?.getAttribute("title")).toBe("查找并回顾以前的对话");
	});

	it("opens the skill detail panel from the assistant timeline row", () => {
		let openedSkill = "";
		render(
			<MessageBubble
				message={{
					role: "assistant",
					content: "",
					timestamp: Date.now(),
					trace: [{
						id: "skill:planner",
						kind: "skill",
						status: "completed",
						title: "已载入技能 · backwards-design-unit-planner",
						skillName: "backwards-design-unit-planner",
						skillState: "expanded",
					}],
				}}
				onOpenSkill={(skillName) => { openedSkill = skillName; }}
			/>,
		);

		fireEvent.click(document.querySelector<HTMLElement>(".inno-trace-row-toggle")!);
		fireEvent.click(document.querySelector<HTMLElement>(".inno-trace-open-skill")!);
		expect(openedSkill).toBe("backwards-design-unit-planner");
	});

	it("renders legacy thinking as a timeline row", () => {
		render(
			<MessageBubble
				message={{ role: "assistant", content: "", thinking: "Planning", timestamp: Date.now() }}
			/>,
		);

		const row = document.querySelector<HTMLElement>(".inno-trace-row");
		expect(row).not.toBeNull();
		expect(row?.textContent).toContain("思考");
		expect(document.querySelector("details")).toBeNull();
	});

	it("can hide actions on an intermediate assistant fragment", () => {
		render(
			<MessageBubble
				message={{ role: "assistant", content: "前一段", timestamp: Date.now() }}
				showActions={false}
			/>,
		);

		expect(document.querySelector(".inno-message-actions")).toBeNull();
	});
});
