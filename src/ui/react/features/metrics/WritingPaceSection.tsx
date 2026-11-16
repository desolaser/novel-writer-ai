import React from "react";
import type { PaceDay, WritingPace } from "../../../../types/WritingPace";
import { MetricsSection, StatGrid, StatTile, formatNumber } from "./MetricsParts";

function formatDay(key: string, withYear = false): string {
	const [year, month, day] = key.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: withYear ? "numeric" : undefined,
	});
}

function dayTooltip(day: PaceDay): string {
	const parts = [`${formatDay(day.date)}: ${formatNumber(day.words)} words`];
	if (day.generated) parts.push(`${formatNumber(day.generated)} by AI (not counted)`);
	if (day.pasted) parts.push(`${formatNumber(day.pasted)} pasted (not counted)`);
	return parts.join(" · ");
}

/** Words that changed today but are not the author's typing. */
function NotCountedToday({ pace }: { pace: WritingPace }) {
	const parts: string[] = [];
	if (pace.todayGenerated) {
		parts.push(`${formatNumber(pace.todayGenerated)} written by the AI`);
	}
	if (pace.todayPasted) {
		parts.push(`${formatNumber(pace.todayPasted)} pasted`);
	}
	if (!parts.length) return null;
	return (
		<p className="nw-metrics-note">
			Not counted as yours today: {parts.join(", ")}. Cutting and pasting text
			inside the novel adds up to zero.
		</p>
	);
}

/** Net words per day for the last 30 days, as columns. */
function DailyColumns({ series }: { series: PaceDay[] }) {
	const max = Math.max(1, ...series.map((day) => day.words));
	return (
		<div className="nw-metrics-days">
			<div className="nw-metrics-days-columns">
				{series.map((day) => (
					<div key={day.date} className="nw-metrics-day" title={dayTooltip(day)}>
						<div
							className="nw-metrics-day-fill"
							style={{ height: `${(Math.max(0, day.words) / max) * 100}%` }}
						/>
					</div>
				))}
			</div>
			<div className="nw-metrics-days-axis">
				<span>{formatDay(series[0].date)}</span>
				<span>Today</span>
			</div>
		</div>
	);
}

function Projection({ pace, targetWords }: { pace: WritingPace; targetWords: number | null }) {
	const projection = pace.projection;
	if (!projection || targetWords === null) {
		return (
			<p className="nw-metrics-note">
				Set "Words per chapter" in Novel Setup to see when the novel would be done.
			</p>
		);
	}
	if (projection.remainingWords === 0) {
		return (
			<p className="nw-metrics-note">
				The novel reached its target of about {formatNumber(targetWords)} words.
			</p>
		);
	}
	const left = `${formatNumber(projection.remainingWords)} words left of about `
		+ `${formatNumber(targetWords)}.`;
	if (projection.finishDate === null) {
		return <p className="nw-metrics-note">{left} Write a few days to get a finish date.</p>;
	}
	return (
		<p className="nw-metrics-note">
			{left} At {formatNumber(Math.round(pace.recentDailyPace))} words a day it would be
			done around <strong>{formatDay(projection.finishDate, true)}</strong>{" "}
			({formatNumber(projection.daysLeft ?? 0)} days).
		</p>
	);
}

/** Words the author writes per day: today, recent days, streaks and a finish date. */
export function WritingPaceSection({
	pace,
	targetWords,
}: {
	pace: WritingPace;
	targetWords: number | null;
}) {
	return (
		<MetricsSection
			title="Writing pace"
			hint="Words you type in the manuscripts while Obsidian is open. Text written by the AI or pasted is not counted."
		>
			{!pace.hasData && (
				<p className="nw-metrics-note">
					Counting starts now: write in any chapter and your words will show up here,
					day by day.
				</p>
			)}
			<StatGrid>
				<StatTile
					value={formatNumber(pace.today)}
					label="Today"
					hint="Words added minus words deleted today."
				/>
				<StatTile value={formatNumber(pace.last7Days)} label="Last 7 days" />
				<StatTile
					value={formatNumber(pace.averagePerWritingDay)}
					label="Per writing day"
					hint="Average of the days you wrote, over the last 30 days."
				/>
				<StatTile
					value={`${pace.streak} ${pace.streak === 1 ? "day" : "days"}`}
					label="Streak"
					hint={`Days in a row with writing. Longest: ${pace.longestStreak}.`}
				/>
				<StatTile
					value={formatNumber(pace.bestDay?.words ?? 0)}
					label="Best day"
					hint={pace.bestDay ? formatDay(pace.bestDay.date, true) : "No writing yet."}
				/>
				<StatTile value={formatNumber(pace.last30Days)} label="Last 30 days" />
			</StatGrid>
			<DailyColumns series={pace.series} />
			<NotCountedToday pace={pace} />
			<Projection pace={pace} targetWords={targetWords} />
		</MetricsSection>
	);
}
