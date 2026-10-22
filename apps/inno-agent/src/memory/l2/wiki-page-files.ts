import { readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

const ROOT_NON_PAGE_FILES = new Set([
	"wiki/index.md",
	"wiki/log.md",
	"wiki/overview.md",
	"wiki/SCHEMA.md",
	"wiki/PURPOSE.md",
]);

/**
 * Enumerate wiki content recursively instead of assuming a fixed set of
 * built-in folders. Schema-defined page types may live in arbitrary safe
 * subdirectories beneath `wiki/`.
 */
export function listWikiPagePaths(l2DataDir: string): string[] {
	const root = join(l2DataDir, "wiki");
	const paths: string[] = [];
	const visit = (absoluteDir: string, relativeDir: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(absoluteDir, { withFileTypes: true }) as Dirent[];
		} catch {
			return;
		}
		for (const entry of entries) {
			const relativePath = `${relativeDir}/${entry.name}`.replaceAll("\\", "/");
			if (entry.isDirectory()) {
				visit(join(absoluteDir, entry.name), relativePath);
			} else if (entry.isFile() && entry.name.endsWith(".md") && !ROOT_NON_PAGE_FILES.has(relativePath)) {
				paths.push(relativePath);
			}
		}
	};
	visit(root, "wiki");
	return paths.sort((a, b) => a.localeCompare(b, "zh-CN"));
}
