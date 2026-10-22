/** Maximum source-file size accepted by browser upload entry points. */
export const DEFAULT_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_UPLOAD_MAX_LABEL = "32 MB";

export class UploadLimitError extends Error {
	constructor(fileName: string) {
		super(`File "${fileName}" exceeds the ${DEFAULT_UPLOAD_MAX_LABEL} upload limit.`);
		this.name = "UploadLimitError";
	}
}

export function getOversizedFiles<T extends { size: number }>(
	files: readonly T[],
	maxBytes = DEFAULT_UPLOAD_MAX_BYTES,
): T[] {
	return files.filter((file) => file.size > maxBytes);
}

/** Validate before any FileReader/arrayBuffer work allocates a large buffer. */
export function assertUploadSize(file: { name: string; size: number }, maxBytes = DEFAULT_UPLOAD_MAX_BYTES): void {
	if (file.size > maxBytes) throw new UploadLimitError(file.name);
}
