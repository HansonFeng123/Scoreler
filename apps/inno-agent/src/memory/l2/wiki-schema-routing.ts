import { dirname } from "node:path";

export interface WikiSchemaRouting {
	typeDirs: Record<string, string>;
}

export interface WikiSchemaRoutingIssue {
	message: string;
}

/**
 * Read the Page Types table as the authoritative mapping from frontmatter
 * `type` values to project-relative wiki directories.
 */
export function parseWikiSchemaRouting(markdown: string): WikiSchemaRouting {
	const typeDirs: Record<string, string> = {};
	const lines = pageTypesSection(markdown);
	for (const line of lines) {
		if (!line.trim().startsWith("|")) continue;
		const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
		if (cells.length < 2) continue;
		const [type, directory] = cells;
		if (!/^[a-z][a-z0-9_-]*$/i.test(type)) continue;
		if (directory !== "wiki" && !directory.startsWith("wiki/")) continue;
		typeDirs[type] = directory.replace(/\/+$/, "");
	}
	return { typeDirs };
}

export function validateWikiPageRouting(
	relativePath: string,
	content: string,
	routing: WikiSchemaRouting,
): WikiSchemaRoutingIssue | null {
	const type = frontmatterType(content);
	if (!type) return null;
	const normalizedPath = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
	const actualDir = dirname(normalizedPath).replaceAll("\\", "/");
	const expectedDir = routing.typeDirs[type];
	if (expectedDir && actualDir !== expectedDir) {
		return { message: `Page type \"${type}\" must be under \"${expectedDir}/\". Current directory: \"${actualDir}\".` };
	}
	// Inno's pre-existing storage uses source-summary while its default schema
	// has always named that same route source. Keep legacy pages readable while
	// newly generated schema-routed pages preserve the schema type verbatim.
	if (type === "source-summary" && routing.typeDirs.source === actualDir) return null;
	for (const [schemaType, schemaDir] of Object.entries(routing.typeDirs)) {
		if (schemaDir === actualDir && schemaType !== type) {
			return { message: `Pages under \"${actualDir}/\" must use type \"${schemaType}\", but found \"${type}\".` };
		}
	}
	return null;
}

function pageTypesSection(markdown: string): string[] {
	const lines = markdown.split("\n");
	const start = lines.findIndex((line) => {
		const heading = line.trim().match(/^(#{1,6})\s+(.+?)\s*#*$/);
		return Boolean(heading && /^page\s+types$/i.test(heading[2].trim()));
	});
	if (start < 0) return [];
	const level = lines[start].trim().match(/^(#{1,6})/)?.[1].length ?? 6;
	const section: string[] = [];
	for (const line of lines.slice(start + 1)) {
		const heading = line.trim().match(/^(#{1,6})\s+/);
		if (heading && heading[1].length <= level) break;
		section.push(line);
	}
	return section;
}

function frontmatterType(content: string): string {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	const raw = match?.[1].match(/^type:\s*(.+?)\s*$/m)?.[1] ?? "";
	return raw.replace(/^['\"]|['\"]$/g, "").trim();
}
