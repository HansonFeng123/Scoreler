import type { HTMLAttributes } from "react";

interface FileNameProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
	name: string;
}

function splitFileName(name: string): { stem: string; extension: string } {
	const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
	const base = slash >= 0 ? name.slice(slash + 1) : name;
	const dot = base.lastIndexOf(".");
	if (dot <= 0 || dot === base.length - 1) return { stem: base, extension: "" };
	return { stem: base.slice(0, dot), extension: base.slice(dot) };
}

/** Truncates only the filename stem so its extension always remains visible. */
export function FileName({ name, className, ...props }: FileNameProps) {
	const { stem, extension } = splitFileName(name);
	return (
		<span {...props} className={`inno-file-name${className ? ` ${className}` : ""}`}>
			<span className="inno-file-name-stem">{stem}</span>
			{extension ? <span className="inno-file-name-extension">{extension}</span> : null}
		</span>
	);
}

