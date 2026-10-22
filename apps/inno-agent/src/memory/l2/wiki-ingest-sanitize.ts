/**
 * Conservative cleanup at the generated-page write boundary. Only
 * document-leading wrappers/frontmatter are
 * touched; fenced examples and prose in the body remain byte-for-byte intact.
 */
export function sanitizeGeneratedWikiPage(content: string): string {
	let cleaned = content;
	cleaned = stripDocumentFence(cleaned);
	cleaned = cleaned.replace(/^[ \t]*frontmatter\s*:\s*\r?\n(?=[ \t]*---\s*\r?\n)/i, "");
	cleaned = restoreOpeningFence(cleaned);
	cleaned = repairFrontmatterWikilinkArrays(cleaned);
	return cleaned;
}

function stripDocumentFence(content: string): string {
	const opener = content.match(/^(?:[ \t]*\r?\n)*[ \t]*```(?:yaml|md|markdown)?[ \t]*\r?\n/i);
	if (!opener) return content;
	const rest = content.slice(opener[0].length);
	const finalFence = rest.match(/\r?\n[ \t]*```[ \t]*(?:\r?\n)?\s*$/);
	if (finalFence?.index !== undefined) return rest.slice(0, finalFence.index);
	const frontmatterFence = rest.match(/^(---[ \t]*\r?\n[\s\S]*?^---[ \t]*\r?\n)[ \t]*```[ \t]*(?:\r?\n|$)/m);
	return frontmatterFence
		? frontmatterFence[1] + rest.slice(frontmatterFence[0].length)
		: content;
}

function restoreOpeningFence(content: string): string {
	if (/^[ \t]*---\s*(?:\r?\n|$)/.test(content)) return content;
	const lines = content.split(/\r?\n/);
	const first = lines.findIndex((line) => line.trim().length > 0);
	if (first < 0 || !/^(type|title|created|updated|tags|related|sources)\s*:/i.test(lines[first].trim())) {
		return content;
	}
	for (let index = first + 1; index < Math.min(lines.length, first + 30); index += 1) {
		const line = lines[index].trim();
		if (line === "---") return `---\n${lines.slice(first).join("\n")}`;
		if (/^#{1,6}\s+/.test(line)) break;
	}
	return content;
}

function repairFrontmatterWikilinkArrays(content: string): string {
	const match = content.match(/^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/);
	if (!match) return content;
	const payload = match[2]
		.split(/\r?\n/)
		.map((line) => {
			const invalid = line.match(/^(\s*[A-Za-z_][\w-]*\s*:\s*)(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])+)\s*$/);
			if (!invalid) return line;
			const values = invalid[2]
				.split(",")
				.map((value) => value.trim().replace(/^\[\[|\]\]$/g, ""))
				.map((value) => JSON.stringify(`[[${value}]]`));
			return `${invalid[1]}[${values.join(", ")}]`;
		})
		.join("\n");
	return match[1] + payload + match[3] + content.slice(match[0].length);
}
