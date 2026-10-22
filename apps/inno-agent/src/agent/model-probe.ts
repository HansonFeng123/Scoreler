import { logger } from "../logger.js";

/**
 * Server-side model list probing for the settings UI.
 *
 * The browser cannot call provider APIs directly (CORS + API key exposure),
 * so the "fetch model list" button in the add-provider wizard goes through
 * this helper. Supports OpenAI-compatible `GET {baseUrl}/models` (Bearer
 * auth) and Anthropic `GET {baseUrl}/models` (x-api-key auth).
 */

export interface ProbeModelsInput {
	baseUrl: string;
	apiKey?: string;
	api?: string;
}

export interface ProbeModelsResult {
	models: string[];
}

const PROBE_TIMEOUT_MS = 10_000;
const MAX_MODELS = 500;

function normalizeModelsUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	// Users often paste the full chat endpoint; strip it back to the API root.
	return trimmed
		.replace(/\/chat\/completions$/i, "")
		.replace(/\/messages$/i, "") + "/models";
}

function buildHeaders(api: string | undefined, apiKey: string): Record<string, string> {
	if (api === "anthropic-messages") {
		return {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			accept: "application/json",
		};
	}
	return {
		authorization: `Bearer ${apiKey}`,
		accept: "application/json",
	};
}

/**
 * Fetch the list of model ids a provider exposes. Throws an Error with a
 * human-readable message on failure; callers turn that into a 4xx response.
 */
export async function probeProviderModels(input: ProbeModelsInput): Promise<ProbeModelsResult> {
	const baseUrl = input.baseUrl?.trim();
	if (!baseUrl) throw new Error("缺少 Base URL");
	if (!/^https?:\/\//i.test(baseUrl)) throw new Error("Base URL 必须以 http(s):// 开头");

	const apiKey = input.apiKey?.trim() ?? "";
	if (!apiKey) throw new Error("缺少 API Key");

	const url = normalizeModelsUrl(baseUrl);
	let res: Response;
	try {
		res = await fetch(url, {
			headers: buildHeaders(input.api, apiKey),
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
	} catch (err) {
		logger.warn({ url, err }, "model probe: request failed");
		throw new Error("无法连接到服务商，请检查 Base URL 与网络");
	}

	if (res.status === 401 || res.status === 403) {
		throw new Error("API Key 无效或没有权限（401/403）");
	}
	if (res.status === 404) {
		throw new Error("该服务商不支持列出模型，请手动填写模型 ID");
	}
	if (!res.ok) {
		throw new Error(`服务商返回错误（HTTP ${res.status}）`);
	}

	let body: unknown;
	try {
		body = await res.json();
	} catch {
		throw new Error("服务商返回的不是有效的模型列表");
	}

	const ids = extractModelIds(body);
	if (ids.length === 0) {
		throw new Error("未获取到任何模型，请手动填写模型 ID");
	}
	return { models: ids.slice(0, MAX_MODELS) };
}

function extractModelIds(body: unknown): string[] {
	// OpenAI-compatible: { data: [{ id: string }, ...] }
	if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)) {
		return (body as { data: unknown[] }).data
			.map((entry) => (entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined))
			.filter((id): id is string => typeof id === "string" && id.length > 0);
	}
	// Some gateways return a bare array of ids or objects.
	if (Array.isArray(body)) {
		return body
			.map((entry) => (typeof entry === "string" ? entry : entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined))
			.filter((id): id is string => typeof id === "string" && id.length > 0);
	}
	return [];
}
