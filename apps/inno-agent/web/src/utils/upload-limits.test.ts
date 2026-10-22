import { describe, expect, it } from "vitest";
import { DEFAULT_UPLOAD_MAX_BYTES, getOversizedFiles, UploadLimitError, assertUploadSize } from "./upload-limits.js";

describe("upload limits", () => {
	it("uses a 32 MB default and rejects only files above it", () => {
		const accepted = { name: "accepted.bin", size: DEFAULT_UPLOAD_MAX_BYTES };
		const oversized = { name: "oversized.bin", size: DEFAULT_UPLOAD_MAX_BYTES + 1 };

		expect(getOversizedFiles([accepted, oversized])).toEqual([oversized]);
		expect(() => assertUploadSize(accepted)).not.toThrow();
		expect(() => assertUploadSize(oversized)).toThrow(UploadLimitError);
	});
});
