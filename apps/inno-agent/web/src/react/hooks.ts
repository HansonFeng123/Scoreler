import { useEffect, useRef, useState } from "react";

const TITLE_MARQUEE_SPEED_PX_PER_SECOND = 28;
const TITLE_MARQUEE_END_PADDING_PX = 2;

type ChangeStore = {
	on(event: "change", fn: () => void): () => void;
};

/**
 * Shallow equality for store snapshots. Stores emit "change" for any field
 * update, but a component's snapshot often picks fields that didn't change —
 * returning the previous state in that case lets React skip the re-render
 * entirely (this is what keeps high-frequency streaming emits from
 * re-rendering the whole chat view 25 times a second).
 */
function snapshotEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
	const aRecord = a as Record<string, unknown>;
	const bRecord = b as Record<string, unknown>;
	const aKeys = Object.keys(aRecord);
	if (aKeys.length !== Object.keys(bRecord).length) return false;
	return aKeys.every((key) => Object.is(aRecord[key], bRecord[key]));
}

export function useStoreSnapshot<TStore extends ChangeStore, TSnapshot>(
	store: TStore,
	getSnapshot: () => TSnapshot,
): TSnapshot {
	const getSnapshotRef = useRef(getSnapshot);
	const [snapshot, setSnapshot] = useState(getSnapshot);
	getSnapshotRef.current = getSnapshot;

	useEffect(() => {
		setSnapshot((prev) => {
			const next = getSnapshotRef.current();
			return snapshotEqual(prev, next) ? prev : next;
		});
		return store.on("change", () => {
			setSnapshot((prev) => {
				const next = getSnapshotRef.current();
				return snapshotEqual(prev, next) ? prev : next;
			});
		});
	}, [store]);

	return snapshot;
}

export function useTitleMarquee<T extends HTMLElement>(name: string, hovered: boolean) {
	const titleViewportRef = useRef<T>(null);
	const titleMeasureRef = useRef<HTMLSpanElement>(null);
	const [titleOverflowing, setTitleOverflowing] = useState(false);
	const [titleShift, setTitleShift] = useState(0);

	useEffect(() => {
		const viewport = titleViewportRef.current;
		const measure = titleMeasureRef.current;
		if (!viewport || !measure) return;
		const updateTitleOverflow = () => {
			const shift = Math.max(0, measure.getBoundingClientRect().width - viewport.clientWidth);
			setTitleOverflowing(shift > 2);
			setTitleShift(Math.ceil(shift));
		};
		updateTitleOverflow();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(updateTitleOverflow);
		observer.observe(viewport);
		observer.observe(measure);
		return () => observer.disconnect();
	}, [name]);

	const marqueeShift = titleShift + TITLE_MARQUEE_END_PADDING_PX;
	return {
		titleViewportRef,
		titleMeasureRef,
		titleOverflowing,
		marqueeActive: titleOverflowing && hovered,
		marqueeShift,
		titleMarqueeDuration: Math.max(0.05, marqueeShift / TITLE_MARQUEE_SPEED_PX_PER_SECOND),
	};
}
