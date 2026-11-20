import type { ReactNode } from "react";

export interface CollapsibleSectionProps {
	title: string;
	/** Shown next to the title, also while closed ("Scenes (3)"). */
	count?: number;
	/** One line of what the section holds, shown only while closed. */
	summary?: string;
	open: boolean;
	onToggle: () => void;
	/** Buttons of the header; only shown while open. */
	actions?: ReactNode;
	className?: string;
	children: ReactNode;
}

/**
 * A titled block that folds to a single line. Closed, it shows only its title
 * with its count or summary, so optional tools don't crowd the view of
 * someone not using them.
 */
export function CollapsibleSection({
	title,
	count,
	summary,
	open,
	onToggle,
	actions,
	className,
	children,
}: CollapsibleSectionProps) {
	const label = count ? `${title} (${count})` : title;
	return (
		<div className={`nw-collapsible${open ? " is-open" : ""} ${className ?? ""}`}>
			<div className="nw-collapsible-header">
				<button
					className="nw-btn-link nw-collapsible-toggle"
					aria-expanded={open}
					onClick={onToggle}
				>
					{open ? "▾" : "▸"} {label}
					{!open && summary && (
						<span className="nw-collapsible-summary"> · {summary}</span>
					)}
				</button>
				{open && actions}
			</div>
			{open && children}
		</div>
	);
}
