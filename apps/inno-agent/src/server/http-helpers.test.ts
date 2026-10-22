import { PassThrough } from "node:stream";
import type { IncomingMessage as HttpReq } from "node:http";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_BODY_BYTES, HttpError, matchRoute, readBody } from "./http-helpers.js";

/**
 * Unit tests for the readBody size cap and HttpError plumbing
 * (issue #162: unbounded body accumulation allowed memory DoS).
 */

function fakeReq(headers: Record<string, string> = {}): HttpReq & PassThrough {
	const stream = new PassThrough() as HttpReq & PassThrough;
	stream.headers = headers;
	return stream;
}

async function expectHttpError(promise: Promise<unknown>, statusCode: number): Promise<void> {
	await expect(promise).rejects.toSatisfy(
		(err) => err instanceof HttpError && err.statusCode === statusCode,
	);
}

describe("readBody", () => {
	it("parses a valid JSON body", async () => {
		const req = fakeReq();
		const body = readBody(req);
		req.end(JSON.stringify({ hello: "world" }));
		await expect(body).resolves.toEqual({ hello: "world" });
	});

	it("resolves to {} for an empty body", async () => {
		const req = fakeReq();
		const body = readBody(req);
		req.end();
		await expect(body).resolves.toEqual({});
	});

	it("rejects with HttpError 400 on invalid JSON", async () => {
		const req = fakeReq();
		const body = readBody(req);
		req.end("not json{");
		await expectHttpError(body, 400);
	});

	it("rejects with HttpError 413 when declared Content-Length exceeds the cap", async () => {
		const req = fakeReq({ "content-length": String(DEFAULT_MAX_BODY_BYTES + 1) });
		const body = readBody(req);
		await expectHttpError(body, 413);
	});

	it("rejects with HttpError 413 mid-stream and stops consuming", async () => {
		const req = fakeReq();
		const body = readBody(req);
		// First chunk under the cap, second pushes the total over it.
		req.write(Buffer.alloc(DEFAULT_MAX_BODY_BYTES, "a"));
		req.write(Buffer.alloc(1, "a"));
		await expectHttpError(body, 413);
		// After the cap trips, further data must not accumulate or crash.
		req.write(Buffer.alloc(16, "b"));
		req.end();
	});

	it("honours a per-call maxBytes override", async () => {
		const req = fakeReq();
		const body = readBody(req, { maxBytes: 16 });
		req.end(JSON.stringify({ payload: "this is definitely longer than sixteen bytes" }));
		await expectHttpError(body, 413);
	});
});

describe("matchRoute", () => {
	it("decodes parameters and ignores the query string", () => {
		expect(matchRoute("GET", "GET", "/api/sessions/hello%20world%2F%25%3F?ignored=%", "/api/sessions/:id"))
			.toEqual({ id: "hello world/%?" });
	});

	it.each(["%", "%GG", "%E0%A4%A", "%C3%28", "%ED%A0%80", "%F4%90%80%80"])(
		"rejects malformed parameter encoding %s with HttpError 400",
		(encoded) => {
			const match = () => matchRoute("GET", "GET", `/api/sessions/${encoded}`, "/api/sessions/:id");
			expect(match).toThrowError(HttpError);
			expect(match).toThrowError(expect.objectContaining({
				statusCode: 400,
				message: "Malformed URL encoding",
			}));
		},
	);

	it("returns null before decoding unrelated methods, lengths, or literal prefixes", () => {
		expect(matchRoute("GET", "POST", "/api/sessions/%", "/api/sessions/:id")).toBeNull();
		expect(matchRoute("GET", "GET", "/api/sessions/%/extra", "/api/sessions/:id")).toBeNull();
		expect(matchRoute("GET", "GET", "/api/jobs/%", "/api/sessions/:id")).toBeNull();
	});
});
