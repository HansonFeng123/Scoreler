import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["apps/inno-agent/src/**/*.test.ts", "apps/inno-agent/web/src/**/*.test.{ts,tsx}"],
		exclude: ["**/node_modules/**", "runtime/**", "workspace/**"],
		setupFiles: ["./vitest.setup.ts"],
		// Component tests (*.test.tsx) render real DOM; pure store/util tests
		// (*.test.ts) stay in the faster node environment.
		environmentMatchGlobs: [["apps/inno-agent/web/src/**/*.test.tsx", "jsdom"]],
	},
});
