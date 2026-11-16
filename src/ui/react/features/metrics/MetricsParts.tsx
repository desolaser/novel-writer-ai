import React from "react";

/** Building blocks shared by every section of the Metrics tab. */

export function formatNumber(value: number, decimals = 0): string {
	return value.toLocaleString(undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

export function formatPercent(share: number): string {
	return `${Math.round(share * 100)}%`;
}

export function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Collapsible block with a title; open by default. */
export function MetricsSection({
	title,
	hint,
	children,
	defaultOpen = true,
}: {
	title: string;
	hint?: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	return (
		<details className="nw-metrics-section" open={defaultOpen}>
			<summary className="nw-metrics-section-title" title={hint}>
				{title}
			</summary>
			<div className="nw-metrics-section-body">{children}</div>
		</details>
	);
}

/** One headline number with its label. */
export function StatTile({
	value,
	label,
	hint,
}: {
	value: string;
	label: string;
	hint?: string;
}) {
	return (
		<div className="nw-metrics-tile" title={hint}>
			<div className="nw-metrics-tile-value">{value}</div>
			<div className="nw-metrics-tile-label">{label}</div>
		</div>
	);
}

export function StatGrid({ children }: { children: React.ReactNode }) {
	return <div className="nw-metrics-grid">{children}</div>;
}

export interface BarItem {
	key: string;
	label: string;
	value: number;
	/** Text shown at the end of the row; defaults to the value. */
	display?: string;
	/** Color of the dot before the label, for codex entries and categories. */
	dot?: string;
	tooltip?: string;
	/** Bar drawn in the warning style, such as a chapter off its target. */
	flagged?: boolean;
	onClick?: (event: React.MouseEvent) => void;
}

/**
 * Horizontal bars on a shared scale. The value is always written as text, so
 * the bar only helps comparing and never carries information by itself.
 */
export function BarList({
	items,
	band,
	empty,
}: {
	items: BarItem[];
	/** Range drawn behind the bars, such as the target words per chapter. */
	band?: { min: number; max: number } | null;
	empty?: string;
}) {
	if (!items.length) {
		return <p className="nw-metrics-empty">{empty ?? "Nothing to show yet."}</p>;
	}
	const scale = Math.max(1, band?.max ?? 0, ...items.map((item) => item.value));
	const percent = (value: number) => `${(value / scale) * 100}%`;
	return (
		<div className="nw-metrics-bars">
			{items.map((item) => (
				<div
					key={item.key}
					className={`nw-metrics-bar-row${item.onClick ? " is-clickable" : ""}`}
					title={item.tooltip}
					onClick={item.onClick}
				>
					<div className="nw-metrics-bar-label">
						{item.dot !== undefined && (
							<span
								className="nw-metrics-dot"
								style={{ background: item.dot || "var(--text-faint)" }}
							/>
						)}
						<span className="nw-metrics-bar-name">{item.label}</span>
						<span className="nw-metrics-bar-value">
							{item.display ?? formatNumber(item.value)}
						</span>
					</div>
					<div className="nw-metrics-bar-track">
						{band && (
							<div
								className="nw-metrics-bar-band"
								style={{
									left: percent(band.min),
									width: percent(band.max - band.min),
								}}
							/>
						)}
						<div
							className={`nw-metrics-bar-fill${item.flagged ? " is-flagged" : ""}`}
							style={{ width: percent(item.value) }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}
