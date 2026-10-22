import { describe, expect, it } from "vitest";
import { defaultRunCommand, isRunnable } from "./command-resolver.js";

describe("defaultRunCommand", () => {
	it("maps each runnable extension to its runner", () => {
		expect(defaultRunCommand("main.py")).toBe("python main.py");
		expect(defaultRunCommand("app.js")).toBe("node app.js");
		expect(defaultRunCommand("mod.mjs")).toBe("node mod.mjs");
		expect(defaultRunCommand("cli.cjs")).toBe("node cli.cjs");
		expect(defaultRunCommand("script.ts")).toBe("npx tsx script.ts");
		expect(defaultRunCommand("comp.tsx")).toBe("npx tsx comp.tsx");
		expect(defaultRunCommand("run.sh")).toBe("bash run.sh");
		expect(defaultRunCommand("env.bash")).toBe("bash env.bash");
		expect(defaultRunCommand("rc.zsh")).toBe("bash rc.zsh");
	});

	it("returns null for non-runnable files", () => {
		expect(defaultRunCommand("notes.md")).toBeNull();
		expect(defaultRunCommand("image.png")).toBeNull();
		expect(defaultRunCommand("Makefile")).toBeNull();
	});

	it("matches extensions case-insensitively", () => {
		expect(defaultRunCommand("MAIN.PY")).toBe("python MAIN.PY");
	});

	it("quotes paths containing spaces", () => {
		const cmd = defaultRunCommand("my dir/hello world.py");
		// POSIX: " escaped as \"; PowerShell: "" — both wrap in double quotes.
		expect(cmd).toBe('python "my dir/hello world.py"');
	});

	it("leaves simple paths unquoted", () => {
		expect(defaultRunCommand("src/main.py")).toBe("python src/main.py");
	});
});

describe("isRunnable", () => {
	it("mirrors defaultRunCommand", () => {
		expect(isRunnable("a.py")).toBe(true);
		expect(isRunnable("a.txt")).toBe(false);
	});
});
