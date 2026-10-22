import { describe, expect, it } from "vitest";
import {
	collapseSkillMessage,
	isSkillCommandMessage,
	parseSkillCommandMessage,
	skillMessageFromContent,
} from "./skill-message-collapse.js";

const ENVELOPE = (body: string) => `<skill name="lesson-plan" location="/tmp/skills/lesson-plan/SKILL.md">\nReferences are relative to /tmp/skills/lesson-plan.\n\n${body}\n</skill>`;

describe("collapseSkillMessage", () => {
	it("collapses a skill message without args", () => {
		expect(collapseSkillMessage(ENVELOPE("# Lesson Plan\nDo the thing."))).toEqual({ skillName: "lesson-plan", args: "" });
	});

	it("captures trailing args after the envelope", () => {
		const result = collapseSkillMessage(`${ENVELOPE("body")}\n\n给初二学生讲一次函数`);
		expect(result).toEqual({ skillName: "lesson-plan", args: "给初二学生讲一次函数" });
	});

	it("trims surrounding whitespace", () => {
		expect(collapseSkillMessage(`\n${ENVELOPE("body")}\n`)?.skillName).toBe("lesson-plan");
	});

	it("returns null for plain text", () => {
		expect(collapseSkillMessage("/skill:lesson-plan")).toBeNull();
		expect(collapseSkillMessage("hello")).toBeNull();
	});

	it("returns null when <skill> appears inside normal text", () => {
		expect(collapseSkillMessage(`我试了下 ${ENVELOPE("body")} 这个东西`)).toBeNull();
	});

	it("returns null for an unclosed or malformed envelope", () => {
		expect(collapseSkillMessage('<skill name="x" location="y">\nbody')).toBeNull();
		expect(collapseSkillMessage('<skill name="x">body</skill>')).toBeNull();
	});

	it("parses compact commands for history recovery", () => {
		expect(parseSkillCommandMessage("/skill:review-code fix the bug")).toEqual({
			skillName: "review-code",
			args: "fix the bug",
		});
		expect(skillMessageFromContent("/skill review-code")).toEqual({
			skillName: "review-code",
			args: "",
		});
		expect(isSkillCommandMessage("/skill review-code")).toBe(true);
	});
});
