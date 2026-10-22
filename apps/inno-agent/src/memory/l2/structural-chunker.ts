export interface StructuralChunkOptions {
	targetChars?: number;
	overlapChars?: number;
}

export interface SemanticSourceChunk {
	id: string;
	index: number;
	total: number;
	headingPath: string;
	overlapBefore: string;
	main: string;
}

const DEFAULT_TARGET_CHARS = 24_000;
const DEFAULT_OVERLAP_CHARS = 400;
const MIN_CHUNK_RATIO = 0.6;

function lastBoundary(content: string, start: number, hardEnd: number): number {
	const minEnd = Math.min(hardEnd, start + Math.floor((hardEnd - start) * MIN_CHUNK_RATIO));
	const window = content.slice(minEnd, hardEnd);
	const candidates = [
		window.lastIndexOf("\n#"),
		window.lastIndexOf("\n\n"),
		Math.max(
			window.lastIndexOf("。"),
			window.lastIndexOf("！"),
			window.lastIndexOf("？"),
			window.lastIndexOf(". "),
			window.lastIndexOf("! "),
			window.lastIndexOf("? "),
		),
	];
	const relative = Math.max(...candidates);
	if (relative < 0) return hardEnd;
	return minEnd + relative + (window.startsWith("\n#", relative) ? 1 : 2);
}

/**
 * Split text without dropping content. Breaks prefer headings, paragraphs and
 * sentence endings; a small read-only overlap gives adjacent chunks context.
 */
export function splitStructuralChunks(content: string, options: StructuralChunkOptions = {}): string[] {
	if (!content) return [];
	const targetChars = Math.max(1_000, Math.trunc(options.targetChars ?? DEFAULT_TARGET_CHARS));
	const overlapChars = Math.max(0, Math.min(Math.trunc(options.overlapChars ?? DEFAULT_OVERLAP_CHARS), targetChars / 4));
	if (content.length <= targetChars) return [content];

	const chunks: string[] = [];
	let cursor = 0;
	while (cursor < content.length) {
		const hardEnd = Math.min(content.length, cursor + targetChars);
		const end = hardEnd < content.length ? lastBoundary(content, cursor, hardEnd) : hardEnd;
		const chunkStart = chunks.length === 0 ? cursor : Math.max(0, cursor - overlapChars);
		chunks.push(content.slice(chunkStart, end));
		cursor = end > cursor ? end : hardEnd;
	}
	return chunks;
}

function splitOversizedBlock(block: string, targetChars: number): string[] {
	if (block.length <= targetChars * 1.25) return [block];
	const pieces = block.match(/[^.!?。！？\n]+[.!?。！？]?|\n+/g) ?? [block];
	const output: string[] = [];
	let current = "";
	for (const piece of pieces) {
		if (current && current.length + piece.length > targetChars) { output.push(current.trim()); current = ""; }
		if (piece.length > targetChars) {
			for (let index = 0; index < piece.length; index += targetChars) {
				const slice = piece.slice(index, index + targetChars).trim();
				if (slice) output.push(slice);
			}
		} else current += piece;
	}
	if (current.trim()) output.push(current.trim());
	return output;
}

function semanticBlocks(content: string, targetChars: number): Array<{ text: string; headingPath: string }> {
	const blocks: Array<{ text: string; headingPath: string }> = [];
	const headingStack: string[] = [];
	let paragraph: string[] = [];
	let paragraphHeading = "";
	const headingPath = () => headingStack.filter(Boolean).join(" > ");
	const flush = () => {
		const text = paragraph.join("\n").trim();
		if (text) for (const piece of splitOversizedBlock(text, targetChars)) blocks.push({ text: piece, headingPath: paragraphHeading });
		paragraph = [];
	};
	for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
		const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
		if (heading) {
			flush();
			const depth = heading[1].length;
			headingStack.length = depth - 1;
			headingStack[depth - 1] = heading[2].trim();
			blocks.push({ text: line.trim(), headingPath: headingPath() });
			paragraphHeading = headingPath();
			continue;
		}
		if (!line.trim()) { flush(); paragraphHeading = headingPath(); continue; }
		if (!paragraph.length) paragraphHeading = headingPath();
		paragraph.push(line);
	}
	flush();
	return blocks;
}

function overlapSuffix(text: string, maxChars: number): string {
	if (!text || maxChars <= 0) return "";
	if (text.length <= maxChars) return text;
	const raw = text.slice(-maxChars);
	const paragraphBreak = raw.search(/\n\s*\n/);
	if (paragraphBreak > 0 && raw.length - paragraphBreak > maxChars * 0.4) return raw.slice(paragraphBreak).trim();
	const sentenceBreak = raw.search(/[.!?。！？]\s+/);
	if (sentenceBreak > 0 && raw.length - sentenceBreak > maxChars * 0.4) return raw.slice(sentenceBreak + 1).trim();
	return raw.trim();
}

/** Split source text into heading-aware chunks with bounded overlap. */
export function splitSourceIntoSemanticChunks(content: string, targetChars: number, overlapChars: number): SemanticSourceChunk[] {
	const target = Math.max(1_000, targetChars);
	const blocks = semanticBlocks(content, target);
	if (!blocks.length) return [];
	const rawChunks: Array<{ main: string; headingPath: string }> = [];
	let current: string[] = [], currentLength = 0, currentHeading = blocks[0]?.headingPath ?? "";
	const flush = () => {
		const main = current.join("\n\n").trim();
		if (main) rawChunks.push({ main, headingPath: currentHeading });
		current = []; currentLength = 0;
	};
	for (const block of blocks) {
		const nextLength = currentLength + block.text.length + (current.length ? 2 : 0);
		if (current.length && nextLength > target) flush();
		if (!current.length) currentHeading = block.headingPath;
		current.push(block.text);
		currentLength += block.text.length + (current.length > 1 ? 2 : 0);
	}
	flush();
	return rawChunks.map((chunk, index) => ({
		id: `chunk-${index + 1}`, index: index + 1, total: rawChunks.length, headingPath: chunk.headingPath,
		overlapBefore: index > 0 ? overlapSuffix(rawChunks[index - 1].main, overlapChars) : "", main: chunk.main,
	}));
}
