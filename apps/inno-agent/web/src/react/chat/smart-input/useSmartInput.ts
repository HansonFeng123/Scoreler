import { useEffect, useRef, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { SmartInputEngine, type EngineAttachmentItem, type EngineCallbacks, type EngineSnapshot } from "./engine.js";
import type { SmartInputRule, SmartInputSettings } from "../../../types/settings.js";

export interface UseSmartInputOptions {
	enabled: boolean;
	/** Changes when the composer DOM remounts (welcome ↔ conversation view). */
	remountKey: string;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	mirrorRef: RefObject<HTMLDivElement | null>;
	hitRef: RefObject<HTMLDivElement | null>;
	getSettings: () => SmartInputSettings | undefined;
	takeAttachment: (path: string) => EngineAttachmentItem | undefined;
	returnAttachment: (item: EngineAttachmentItem) => void;
	onChange: () => void;
	onSnapshot?: (snapshot: EngineSnapshot) => void;
	onOpenStatusPanel: EngineCallbacks["onOpenStatusPanel"];
	onOpenFillMenu: EngineCallbacks["onOpenFillMenu"];
	onOpenAgentPicker?: EngineCallbacks["onOpenAgentPicker"];
	onAgentBubbleClick?: EngineCallbacks["onAgentBubbleClick"];
	onBubbleContextMenu: EngineCallbacks["onBubbleContextMenu"];
	onBubbleClose?: EngineCallbacks["onBubbleClose"];
	onChipHover?: EngineCallbacks["onChipHover"];
	onUploadLimitExceeded?: EngineCallbacks["onUploadLimitExceeded"];
	onWorkspaceHighlight: EngineCallbacks["onWorkspaceHighlight"];
}

/**
 * Owns the SmartInputEngine lifecycle around the composer textarea. When
 * `enabled` flips off the engine detaches, restores in-draft bubbles back to
 * plain words, and returns their bound files to the attachment row (settings
 * only affect future input).
 */
export function useSmartInput(options: UseSmartInputOptions) {
	const { t } = useTranslation();
	const engineRef = useRef<SmartInputEngine | null>(null);
	// Slot list survives composer remounts: tokens in the draft keep their PUA
	// ids, so a fresh engine instance adopts the previous slots.
	const stashedSlots = useRef<SmartInputEngine["slots"]>([]);
	// Latest callbacks without re-instantiating the engine on every render.
	const optionsRef = useRef(options);
	optionsRef.current = options;

	const enabled = options.enabled;
	const remountKey = options.remountKey;

	useEffect(() => {
		if (!enabled) return;
		const textarea = optionsRef.current.textareaRef.current;
		const mirror = optionsRef.current.mirrorRef.current;
		const hit = optionsRef.current.hitRef.current;
		if (!textarea || !mirror || !hit) return;

		const agentCommandLabel = (command: string): string => {
			switch (command) {
				case "recall": return t("chat.smartInput.agentCommandRecall", "回顾对话");
				case "remember": return t("chat.smartInput.agentCommandRemember", "记忆信息");
				case "wiki": return t("chat.smartInput.agentCommandWiki", "查阅知识库");
				default: return command.startsWith("skill:") ? command.slice("skill:".length) : command;
			}
		};

		const labels = () => ({
			kwHitTitle: t("chat.smartInput.kwHitTitle", "点击转为文件气泡，或拖文件悬停 1 秒自动转换"),
			agentKwHitTitle: t("chat.smartInput.agentKwHitTitle", "点击选择 Agent 命令"),
			agentCommandRecallHint: t("chat.smartInput.agentCommandRecallHint", "查找并回顾以前的对话"),
			agentCommandRememberHint: t("chat.smartInput.agentCommandRememberHint", "将关于你的信息保存到记忆中"),
			agentCommandWikiHint: t("chat.smartInput.agentCommandWikiHint", "在知识库中查找相关资料"),
			emptyBubbleTitle: t("chat.smartInput.emptyBubbleTitle", "拖入文件，或点击选择"),
			removeBubble: t("chat.smartInput.removeBubble", "删除气泡"),
			mergeBubbleHint: t("chat.smartInput.mergeBubbleHint", "融合"),
			dropMatch: t("chat.smartInput.dropMatch", "匹配"),
			dropMismatch: t("chat.smartInput.dropMismatch", "不匹配"),
			dropPartial: t("chat.smartInput.dropPartial", "部分匹配"),
			dropReleaseToFinish: t("chat.smartInput.dropReleaseToFinish", "松手即可完成"),
		});

		const engine = new SmartInputEngine({
			textarea,
			mirror,
			hitLayer: hit,
			labels,
			agentCommandLabel,
			data: {
				getSettings: () => {
					const settings = optionsRef.current.getSettings();
					return {
						enabled: settings?.enabled ?? false,
						allowDrag: settings?.allowDrag !== false,
						allowRightClick: settings?.allowRightClick !== false,
						allowAgentCommands: settings?.allowAgentCommands === true,
					};
				},
				getRules: (): SmartInputRule[] => optionsRef.current.getSettings()?.rules ?? [],
				takeAttachment: (path) => optionsRef.current.takeAttachment(path),
				returnAttachment: (item) => optionsRef.current.returnAttachment(item),
			},
			callbacks: {
				onChange: () => optionsRef.current.onChange(),
				onSlotsSnapshot: (snapshot) => optionsRef.current.onSnapshot?.(snapshot),
				onOpenStatusPanel: (...args) => optionsRef.current.onOpenStatusPanel(...args),
				onOpenFillMenu: (...args) => optionsRef.current.onOpenFillMenu(...args),
				onOpenAgentPicker: (...args) => optionsRef.current.onOpenAgentPicker?.(...args),
				onAgentBubbleClick: (...args) => optionsRef.current.onAgentBubbleClick?.(...args),
				onBubbleContextMenu: (...args) => optionsRef.current.onBubbleContextMenu(...args),
				onBubbleClose: (...args) => optionsRef.current.onBubbleClose?.(...args),
				onChipHover: (...args) => optionsRef.current.onChipHover?.(...args),
				onUploadLimitExceeded: (...args) => optionsRef.current.onUploadLimitExceeded?.(...args),
				onWorkspaceHighlight: (paths) => optionsRef.current.onWorkspaceHighlight(paths),
			},
		});
		engineRef.current = engine;
		engine.adoptSlots(stashedSlots.current);
		engine.attach();

		const onGlobalDragOver = (event: DragEvent) => engine.trackDragPosition(event.clientX, event.clientY);
		const onGlobalDragEnd = () => engine.cancelBubbleDrag();
		const onGlobalDrop = () => {
			// Run after the drop target has finished binding files. This also
			// handles drops whose source chip was unmounted during auto-convert.
			window.setTimeout(() => engine.cancelBubbleDrag(), 0);
		};
		const onGlobalDragLeave = (event: DragEvent) => {
			if (event.relatedTarget !== null) return;
			const outsideViewport = event.clientX <= 0
				|| event.clientY <= 0
				|| event.clientX >= window.innerWidth
				|| event.clientY >= window.innerHeight;
			if (outsideViewport) engine.cancelBubbleDrag();
		};
		const onPageDragStart = (event: Event) => {
			const detail = (event as CustomEvent<unknown>).detail;
			if (!detail || typeof detail !== "object") return;
			const raw = detail as {
				name?: unknown;
				path?: unknown;
				source?: unknown;
				file?: File;
				items?: unknown;
			};
			const candidates = Array.isArray(raw.items) ? raw.items : [raw];
			const items = candidates.flatMap((candidate) => {
				if (!candidate || typeof candidate !== "object") return [];
				const item = candidate as { name?: unknown; path?: unknown; source?: unknown; file?: File };
				if (typeof item.name !== "string" || typeof item.path !== "string") return [];
				if (item.source !== "workspace" && item.source !== "local") return [];
				const source: EngineAttachmentItem["source"] = item.source === "workspace" ? "workspace" : "local";
				return [{ name: item.name, path: item.path, source, file: item.file }];
			});
			if (items.length > 0) engine.markDragStart(items, `page:${items.map((item) => item.path).join("|")}`);
		};
		const onPageDragEnd = () => engine.cancelBubbleDrag();
		window.addEventListener("dragover", onGlobalDragOver, true);
		window.addEventListener("dragend", onGlobalDragEnd, true);
		window.addEventListener("drop", onGlobalDrop, true);
		document.addEventListener("dragleave", onGlobalDragLeave, true);
		window.addEventListener("inno-smart-dragstart", onPageDragStart);
		window.addEventListener("inno-smart-dragend", onPageDragEnd);

		return () => {
			window.removeEventListener("dragover", onGlobalDragOver, true);
			window.removeEventListener("dragend", onGlobalDragEnd, true);
			window.removeEventListener("drop", onGlobalDrop, true);
			document.removeEventListener("dragleave", onGlobalDragLeave, true);
			window.removeEventListener("inno-smart-dragstart", onPageDragStart);
			window.removeEventListener("inno-smart-dragend", onPageDragEnd);
			if (!optionsRef.current.enabled) {
				// Feature turned off: settings only affect future input, so
				// bubbles restore to plain words and slots are dropped.
				stashedSlots.current = [];
				engine.detach();
			} else {
				// Composer remount: keep slots for the next engine instance; the
				// draft value (with tokens) survives via defaultValue.
				engine.detachForRemount();
				stashedSlots.current = engine.slots;
			}
			engineRef.current = null;
		};
	}, [enabled, remountKey, t]);

	return engineRef;
}
