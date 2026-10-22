import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatChannel, ChannelStreamEvent, StreamingReplyChannel, StreamingReplyHandle } from "./channel.js";
import { ChannelRegistry } from "./channel.js";
import { PersonalChannelDispatcher, type PersonalChannelDispatcherOptions } from "./personal-dispatcher.js";
import type { IncomingMessage } from "./types.js";

let channelsDataDir: string;
let sessionDir: string;

beforeEach(() => {
	channelsDataDir = mkdtempSync(join(tmpdir(), "inno-disp-ch-"));
	sessionDir = mkdtempSync(join(tmpdir(), "inno-disp-sess-"));
});

afterEach(() => {
	rmSync(channelsDataDir, { recursive: true, force: true });
	rmSync(sessionDir, { recursive: true, force: true });
});

function fakeChannel(name: "feishu" | "qq" | "wechat" = "feishu") {
	const replies: string[] = [];
	const channel: ChatChannel = {
		name,
		verify: async () => true,
		parse: async () => null,
		reply: async (_msg, text) => {
			replies.push(text);
		},
		push: async () => {},
	};
	return { channel, replies };
}

interface OptsProbe {
	opts: PersonalChannelDispatcherOptions;
	prompts: string[];
	inSession: { sessionPath: string; prompt: string }[];
	streaming: { sessionPath: string; prompt: string; events: ChannelStreamEvent[] }[];
	createdSessions: string[];
	recordedChannels: { channel: string; sessionId?: string }[];
	failNextPrompt: { current: boolean };
	nextSessionId: { current: number };
}

function makeOpts(): OptsProbe {
	const probe: OptsProbe = {
		prompts: [],
		inSession: [],
		streaming: [],
		createdSessions: [],
		recordedChannels: [],
		failNextPrompt: { current: false },
		nextSessionId: { current: 0 },
		opts: undefined as unknown as PersonalChannelDispatcherOptions,
	};
	probe.opts = {
		channelRegistry: new ChannelRegistry(),
		runPrompt: async (prompt) => {
			probe.prompts.push(prompt);
			if (probe.failNextPrompt.current) {
				probe.failNextPrompt.current = false;
				throw new Error("LLM exploded");
			}
			return "global reply";
		},
		runPromptInSession: async (sessionPath, prompt) => {
			probe.inSession.push({ sessionPath, prompt });
			if (probe.failNextPrompt.current) {
				probe.failNextPrompt.current = false;
				throw new Error("LLM exploded");
			}
			return "session reply";
		},
		runPromptStreamingInSession: async (sessionPath, prompt, onEvent) => {
			const record = { sessionPath, prompt, events: [] as ChannelStreamEvent[] };
			probe.streaming.push(record);
			if (probe.failNextPrompt.current) {
				probe.failNextPrompt.current = false;
				throw new Error("LLM exploded");
			}
			onEvent({ type: "text_delta", delta: "streamed " });
			record.events.push({ type: "text_delta", delta: "streamed " });
			return "streamed reply";
		},
		createNewSession: async () => {
			const id = `sess_${++probe.nextSessionId.current}.jsonl`;
			probe.createdSessions.push(id);
			return id;
		},
		getCurrentSessionId: () => "current.jsonl",
		recordSessionChannel: (channel, sessionId) => {
			probe.recordedChannels.push({ channel, sessionId });
		},
		channelsDataDir,
		sessionDir,
	};
	return probe;
}

function msg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
	return {
		channel: "feishu",
		messageId: `m_${Math.random().toString(36).slice(2)}`,
		chatId: "chat_1",
		text: "今天学了什么？",
		raw: {},
		...overrides,
	};
}

describe("PersonalChannelDispatcher routing", () => {
	it("dedupes repeated messageIds", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies } = fakeChannel();
		const m = msg({ messageId: "fixed-id" });

		await dispatcher.handle(channel, m);
		await dispatcher.handle(channel, m);

		expect(probe.inSession).toHaveLength(1);
		expect(replies).toHaveLength(1);
	});

	it("ignores empty messages with no attachments", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies } = fakeChannel();

		await dispatcher.handle(channel, msg({ text: "   ", attachments: [] }));

		expect(probe.prompts).toHaveLength(0);
		expect(probe.inSession).toHaveLength(0);
		expect(replies).toHaveLength(0);
	});

	it("registers the chatId as the channel default target", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel } = fakeChannel();

		await dispatcher.handle(channel, msg({ chatId: "chat_xyz" }));

		expect(probe.opts.channelRegistry.getDefaultTarget("feishu")).toEqual({ channel: "feishu", chatId: "chat_xyz" });
	});

	it("/new creates and binds a fresh session for the chat", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies } = fakeChannel();

		await dispatcher.handle(channel, msg({ text: "/new" }));

		expect(probe.createdSessions).toEqual(["sess_1.jsonl"]);
		expect(replies[0]).toContain("已新建会话");
		// A /new command must not run any prompt.
		expect(probe.prompts).toHaveLength(0);
		expect(probe.inSession).toHaveLength(0);
		expect(probe.streaming).toHaveLength(0);
	});

	it("auto-creates a dedicated session for an unbound chat and reuses it afterwards", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel } = fakeChannel();

		await dispatcher.handle(channel, msg({ text: "第一条" }));
		expect(probe.createdSessions).toEqual(["sess_1.jsonl"]);
		expect(probe.inSession).toHaveLength(1);
		expect(probe.inSession[0].sessionPath).toBe(join(sessionDir, "sess_1.jsonl"));

		// The PI SDK creates session files lazily; simulate the file existing now.
		writeFileSync(join(sessionDir, "sess_1.jsonl"), "{}\n", "utf-8");

		await dispatcher.handle(channel, msg({ text: "第二条" }));
		// No new session created; the binding was reused.
		expect(probe.createdSessions).toEqual(["sess_1.jsonl"]);
		expect(probe.inSession).toHaveLength(2);
		expect(probe.inSession[1].sessionPath).toBe(join(sessionDir, "sess_1.jsonl"));
	});

	it("drops a stale binding and re-creates when the session file is gone", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel } = fakeChannel();

		await dispatcher.handle(channel, msg({ text: "/new" }));
		expect(probe.createdSessions).toEqual(["sess_1.jsonl"]);
		// Never create sess_1.jsonl on disk → the binding is stale.

		await dispatcher.handle(channel, msg({ text: "hello" }));
		// Stale mapping removed → a brand-new session is auto-created.
		expect(probe.createdSessions).toEqual(["sess_1.jsonl", "sess_2.jsonl"]);
		expect(probe.inSession[0].sessionPath).toBe(join(sessionDir, "sess_2.jsonl"));
	});

	it("falls back to the global session for messages without a chatId", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies } = fakeChannel();

		await dispatcher.handle(channel, msg({ chatId: undefined }));

		expect(probe.prompts).toHaveLength(1);
		expect(probe.inSession).toHaveLength(0);
		expect(replies).toEqual(["global reply"]);
	});

	it("replies with a failure notice and logs an error run when the prompt throws", async () => {
		const probe = makeOpts();
		probe.failNextPrompt.current = true;
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies } = fakeChannel();

		await dispatcher.handle(channel, msg());

		expect(replies[replies.length - 1]).toContain("这次处理失败了");
		const runs = dispatcher.getRunLog().list();
		expect(runs).toHaveLength(1);
		expect(runs[0].status).toBe("error");
		expect(runs[0].error).toContain("LLM exploded");
	});

	it("appends a success run log entry with duration", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel } = fakeChannel();

		await dispatcher.handle(channel, msg());

		const runs = dispatcher.getRunLog().list();
		expect(runs).toHaveLength(1);
		expect(runs[0].status).toBe("success");
		expect(runs[0].durationMs).toBeGreaterThanOrEqual(0);
	});

	it("truncates over-long text and notifies the user", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies } = fakeChannel();

		await dispatcher.handle(channel, msg({ text: "长".repeat(25_000) }));

		expect(replies.some((r) => r.includes("已截断"))).toBe(true);
		expect(probe.inSession[0].prompt.length).toBeLessThanOrEqual(20_000);
	});

	it("appends downloaded file attachments to the prompt", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel } = fakeChannel();

		await dispatcher.handle(
			channel,
			msg({ attachments: [{ type: "file", filePath: "/tmp/report.pdf", fileName: "report.pdf" }] }),
		);

		expect(probe.inSession[0].prompt).toContain("[附件已下载到: /tmp/report.pdf]");
	});
});

describe("PersonalChannelDispatcher streaming", () => {
	function fakeStreamingChannel(opts: { failInit?: boolean } = {}) {
		const replies: string[] = [];
		const finalized: boolean[] = [];
		const handleEvents: ChannelStreamEvent[] = [];
		const channel: StreamingReplyChannel = {
			name: "feishu",
			supportsStreamingReply: true,
			verify: async () => true,
			parse: async () => null,
			reply: async (_msg, text) => {
				replies.push(text);
			},
			push: async () => {},
			beginStreamingReply: async (): Promise<StreamingReplyHandle> => {
				if (opts.failInit) throw new Error("no card permission");
				return {
					onEvent: (event) => {
						handleEvents.push(event);
					},
					finalize: async () => {
						finalized.push(true);
					},
				};
			},
		};
		return { channel, replies, finalized, handleEvents };
	}

	it("uses the streaming path for streaming-capable channels", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies, finalized, handleEvents } = fakeStreamingChannel();

		await dispatcher.handle(channel, msg());

		expect(probe.streaming).toHaveLength(1);
		expect(handleEvents.some((e) => e.type === "text_delta")).toBe(true);
		expect(finalized).toHaveLength(1);
		// Streaming card is the reply — no plain-text duplicate.
		expect(replies).toHaveLength(0);
		const runs = dispatcher.getRunLog().list();
		expect(runs[0].status).toBe("success");
	});

	it("falls back to a plain reply when streaming-card init fails", async () => {
		const probe = makeOpts();
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies } = fakeStreamingChannel({ failInit: true });

		await dispatcher.handle(channel, msg());

		expect(probe.streaming).toHaveLength(0);
		expect(probe.inSession).toHaveLength(1);
		expect(replies).toEqual(["session reply"]);
		const runs = dispatcher.getRunLog().list();
		expect(runs[0].status).toBe("success");
	});

	it("finalizes the card with an error event when the prompt fails mid-stream", async () => {
		const probe = makeOpts();
		probe.failNextPrompt.current = true;
		const dispatcher = new PersonalChannelDispatcher(probe.opts);
		const { channel, replies, finalized, handleEvents } = fakeStreamingChannel();

		await dispatcher.handle(channel, msg());

		expect(handleEvents.some((e) => e.type === "error")).toBe(true);
		expect(finalized).toHaveLength(1);
		expect(replies[replies.length - 1]).toContain("这次处理失败了");
	});
});
