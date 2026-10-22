import type { AttachmentFileKind } from "../../../types/chat.js";
import type { SmartInputRule } from "../../../types/settings.js";

/**
 * Shared file-kind vocabulary for smart input (便捷输入) attachments: the
 * fixed type colors kept from the v76 prototype (red/blue/green/orange/
 * purple/gray hues) and the extension → kind mapping used to color and
 * type-check bubbles, chips and settings previews. Pure constants — safe to
 * import from props-only render modules (showcase replay included).
 */

/** Type color per kind — fixed hues blended into the theme surface via CSS. */
export const KIND_COLORS: Record<AttachmentFileKind, string> = {
	pdf: "#ef4444",
	doc: "#3b82f6",
	xls: "#22c55e",
	ppt: "#f97316",
	image: "#a855f7",
	file: "#8b92a5",
};

/** i18n keys for short kind labels (PDF / 文档 / 表格 / 幻灯片 / 图片 / 文件). */
export const KIND_LABEL_KEYS: Record<AttachmentFileKind, string> = {
	pdf: "chat.smartInput.kinds.pdf",
	doc: "chat.smartInput.kinds.doc",
	xls: "chat.smartInput.kinds.xls",
	ppt: "chat.smartInput.kinds.ppt",
	image: "chat.smartInput.kinds.image",
	file: "chat.smartInput.kinds.file",
};

/** Extension (with leading dot, lowercase) → kind. Unknown → "file". */
const EXTENSION_KINDS: Record<string, AttachmentFileKind> = {
	".pdf": "pdf",
	".doc": "doc",
	".docx": "doc",
	".rtf": "doc",
	".txt": "doc",
	".md": "doc",
	".xls": "xls",
	".xlsx": "xls",
	".csv": "xls",
	".ppt": "ppt",
	".pptx": "ppt",
	".png": "image",
	".jpg": "image",
	".jpeg": "image",
	".gif": "image",
	".webp": "image",
	".bmp": "image",
	".tiff": "image",
	".svg": "image",
};

export function extensionOf(name: string): string {
	const index = name.lastIndexOf(".");
	return index === -1 ? "" : name.slice(index).toLowerCase();
}

export function kindFromExtension(ext: string): AttachmentFileKind {
	return EXTENSION_KINDS[ext] ?? "file";
}

/** Kind for a file name or workspace path (last path segment's extension). */
export function kindFromName(name: string): AttachmentFileKind {
	const base = name.split("/").pop() ?? name;
	return kindFromExtension(extensionOf(base));
}

/** Kind used for a rule preview. All-format rules use the neutral file color. */
export function kindFromRule(rule: Pick<SmartInputRule, "allExtensions" | "extensions">): AttachmentFileKind {
	return rule.allExtensions ? "file" : kindFromExtension(rule.extensions[0] ?? "");
}

/**
 * Stable identity for a rule's accepted file formats. Extension order is not
 * meaningful, and the all-formats flag applies to every rule. Exclusions are
 * part of the identity because they change which files a bubble can receive.
 */
export function ruleFormatKey(
	rule: Pick<SmartInputRule, "allExtensions" | "extensions" | "excludeExtensions">,
): string {
	const normalize = (values: string[] | undefined): string => Array.from(new Set(
		(values ?? [])
			.map((value) => value.trim().toLowerCase())
			.filter(Boolean)
			.map((value) => value.startsWith(".") ? value : `.${value}`),
	)).sort().join(",");
	const allExtensions = rule.allExtensions === true;
	return `${allExtensions ? "*" : normalize(rule.extensions)}|!${normalize(rule.excludeExtensions)}`;
}

/** Two bubbles can fuse only when their file-format contracts are identical. */
export function sameRuleFormat(
	a: Pick<SmartInputRule, "allExtensions" | "extensions" | "excludeExtensions">,
	b: Pick<SmartInputRule, "allExtensions" | "extensions" | "excludeExtensions">,
): boolean {
	return ruleFormatKey(a) === ruleFormatKey(b);
}

/** true when `name`'s extension is in `extensions` (literal, dot-prefixed). */
export function nameMatchesExtensions(name: string, extensions: string[]): boolean {
	const ext = extensionOf(name);
	return extensions.some((candidate) => {
		const normalized = candidate.startsWith(".") ? candidate.toLowerCase() : `.${candidate.toLowerCase()}`;
		return normalized === ext;
	});
}

/** Apply a rule's allow-all/allow-list mode, then reject excluded extensions. */
export function nameMatchesRule(
	name: string,
	rule: Pick<SmartInputRule, "allExtensions" | "extensions" | "excludeExtensions">,
): boolean {
	if (nameMatchesExtensions(name, rule.excludeExtensions ?? [])) return false;
	if (rule.allExtensions === true) return true;
	return nameMatchesExtensions(name, rule.extensions ?? []);
}

/** Rules that can form a bubble: enabled, named, with a non-empty format contract. */
export function activeRules(rules: SmartInputRule[]): SmartInputRule[] {
	return rules.filter(
		(rule) => rule.enabled && rule.keyword && (rule.allExtensions || rule.extensions.length > 0),
	);
}

/** true when at least one active rule accepts `name`'s extension. */
export function anyActiveRuleMatches(name: string, rules: SmartInputRule[]): boolean {
	return activeRules(rules).some((rule) => nameMatchesRule(name, rule));
}
