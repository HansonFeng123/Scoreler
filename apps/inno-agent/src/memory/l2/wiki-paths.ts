/**
 * Wiki-relative logical paths.
 *
 * A wiki path (`wiki/concepts/foo.md`) is an *identifier*: it appears in URLs
 * (`/api/wiki/page?path=…`), frontmatter links, graph node ids, and the
 * manifest. It must therefore always use forward slashes, regardless of the
 * host OS. Using `path.join()` for these silently produces backslashes on
 * Windows, which breaks link resolution, graph edges, and overview stats
 * (caught by the Windows release CI in v0.4.8).
 *
 * Filesystem access keeps using `path.join(l2DataDir, wikiPath)` — Windows
 * accepts forward slashes in file APIs, so a posix logical path is safe to
 * embed in an OS path.
 */

/** Join segments into a wiki-relative logical path (always forward slashes). */
export function wikiPathJoin(...segments: string[]): string {
	return segments.join("/");
}

/** Normalize an OS-specific relative path to a wiki-relative logical path. */
export function toWikiPath(osRelativePath: string): string {
	return osRelativePath.replace(/\\/g, "/");
}
