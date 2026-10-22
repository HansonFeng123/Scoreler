import type { AttachmentBinding } from "../types/chat.js";

/**
 * Split a user message's visible text into segments for attachment-aware
 * rendering. Each binding targets the `wordIndex`-th occurrence of its word
 * in the text (the composer records the index at send time). When the word
 * can no longer be found — e.g. the occurrence index overshoots after edits —
 * the binding falls back to the trailing bucket so no file silently
 * disappears from the rendered message.
 */

export type ContentSegment =
	| { kind: "text"; text: string }
	| { kind: "binding"; binding: AttachmentBinding };

export interface SplitResult {
	segments: ContentSegment[];
	/** Bindings whose word/occurrence could not be located in the text. */
	unplaced: AttachmentBinding[];
}

function nthIndexOf(text: string, needle: string, occurrence: number): number {
	if (!needle) return -1;
	let index = -1;
	for (let count = 0; count <= occurrence; count++) {
		index = text.indexOf(needle, index + 1);
		if (index === -1) return -1;
	}
	return index;
}

export function splitContentByBindings(content: string, bindings: AttachmentBinding[]): SplitResult {
	interface Placement {
		start: number;
		end: number;
		binding: AttachmentBinding;
	}
	const placements: Placement[] = [];
	const unplaced: AttachmentBinding[] = [];

	for (const binding of bindings) {
		const start = nthIndexOf(content, binding.word, binding.wordIndex);
		if (start === -1) {
			unplaced.push(binding);
			continue;
		}
		placements.push({ start, end: start + binding.word.length, binding });
	}

	placements.sort((a, b) => a.start - b.start || a.end - b.end);
	const segments: ContentSegment[] = [];
	let cursor = 0;
	for (const placement of placements) {
		if (placement.start < cursor) {
			// Overlaps a previously placed binding (e.g. nested words) — render
			// this one after the text instead of corrupting the layout.
			unplaced.push(placement.binding);
			continue;
		}
		if (placement.start > cursor) {
			segments.push({ kind: "text", text: content.slice(cursor, placement.start) });
		}
		segments.push({ kind: "binding", binding: placement.binding });
		cursor = placement.end;
	}
	if (cursor < content.length || segments.length === 0) {
		segments.push({ kind: "text", text: content.slice(cursor) });
	}
	return { segments, unplaced };
}
