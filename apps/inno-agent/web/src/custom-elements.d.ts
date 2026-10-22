import type { HTMLAttributes } from "react";

type CustomElementProps = HTMLAttributes<HTMLElement>;

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			"markdown-block": CustomElementProps & {
				content: string;
			};
			"markdown-artifact": CustomElementProps & {
				content: string;
			};
		}
	}
}
