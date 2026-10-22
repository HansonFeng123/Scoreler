import { File as FileIcon, FileImage, FileSpreadsheet, FileText, FileType, Presentation } from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { AttachmentFileKind } from "../types/chat.js";
import { KIND_COLORS } from "./chat/smart-input/kinds.js";

const FILE_TYPE_ICONS: Record<AttachmentFileKind, LucideIcon> = {
	pdf: FileType,
	doc: FileText,
	xls: FileSpreadsheet,
	ppt: Presentation,
	image: FileImage,
	file: FileIcon,
};

export interface FileTypeIconProps extends Omit<LucideProps, "color"> {
	kind: AttachmentFileKind;
	color?: string;
}

/** Small format-specific icon used wherever an attachment is shown. */
export function FileTypeIcon({ kind, color, className, style, ...props }: FileTypeIconProps) {
	const Icon = FILE_TYPE_ICONS[kind];
	return (
		<Icon
			{...props}
			aria-hidden="true"
			className={`inno-file-type-icon${className ? ` ${className}` : ""}`}
			style={{ color: color ?? KIND_COLORS[kind], ...style }}
		/>
	);
}
