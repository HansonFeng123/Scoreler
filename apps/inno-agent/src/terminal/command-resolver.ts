import { extname } from "node:path";

/**
 * Quote a relative path for the active shell.
 *
 * - bash/zsh (POSIX): wrap in double quotes, escape inner `"` as `\"`.
 * - PowerShell (Windows): wrap in double quotes, escape inner `"` as `""`
 *   (PowerShell's standard double-quote escaping inside a "..." literal).
 *
 * If the path has no spaces or quote-like characters we leave it unquoted to
 * preserve the existing behavior on simple paths.
 */
function quoteForShell(relPath: string): string {
	const needsQuoting = relPath.includes(" ") || relPath.includes("'") || relPath.includes('"');
	if (!needsQuoting) return relPath;
	if (process.platform === "win32") {
		return `"${relPath.replace(/"/g, '""')}"`;
	}
	return `"${relPath.replace(/"/g, '\\"')}"`;
}

/**
 * Derive a default shell command for running a workspace file.
 * Returns null when the file kind is not directly runnable.
 */
export function defaultRunCommand(relPath: string): string | null {
	const ext = extname(relPath).toLowerCase();
	const quoted = quoteForShell(relPath);
	switch (ext) {
		case ".py":
			return `python ${quoted}`;
		case ".js":
		case ".mjs":
		case ".cjs":
			return `node ${quoted}`;
		case ".ts":
		case ".tsx":
			return `npx tsx ${quoted}`;
		case ".sh":
		case ".bash":
		case ".zsh":
			return `bash ${quoted}`;
		default:
			return null;
	}
}

export function isRunnable(relPath: string): boolean {
	return defaultRunCommand(relPath) !== null;
}
