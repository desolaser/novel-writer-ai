import type { Model as AvailableModel } from "../types/Model";

export type ModelSortMode = "alpha" | "price" | "context";

/**
 * Price per token, parsed out of a provider's pricing string
 * (format: "$0.00000014/1K prompt, $0.00000028/1K completion" — the "/1K" label
 * is misleading, the value itself is already the per-token price). Returns null
 * when the string carries no usable price, so callers can tell "free/unknown"
 * apart from "priced at zero".
 */
export function parsePricePerToken(pricing: string | undefined | null): number | null {
	if (!pricing) return null;
	const match = pricing.match(/\$([\d.]+)\//);
	if (!match) return null;
	const price = parseFloat(match[1]);
	if (Number.isNaN(price) || price <= 0) return null;
	return price;
}

/** How many thousand tokens a dollar buys, for display ("142K/$"). */
export function formatTokensPerDollar(pricing: string | undefined | null): string {
	const price = parsePricePerToken(pricing);
	if (price == null) return "";
	return `${Math.round(1 / (price * 1_000))}K/$`;
}

/** Same price, as a raw sortable number (tokens per dollar) instead of a label. */
export function tokensPerDollar(pricing: string | undefined | null): number {
	const price = parsePricePerToken(pricing);
	return price == null ? 0 : 1 / (price * 1_000);
}

export function formatModelOption(model: AvailableModel): string {
	const icons: string[] = [];
	if (model.supportsImageGeneration) {
		icons.push("🖌"); // generates images (output)
	}
	if (model.supportsVision) {
		icons.push("👁"); // accepts images as input (vision)
	}
	const parts: string[] = [];
	if (icons.length) parts.push(icons.join(" "));
	parts.push(model.name || model.id);
	parts.push(`${model.contextLength} ctx`);
	const tpd = formatTokensPerDollar(model.pricing);
	if (tpd) parts.push(tpd);
	return parts.join(" | ");
}

export function getFilteredAndSortedModels(
	models: AvailableModel[],
	searchQuery: string,
	sortMode: ModelSortMode,
): AvailableModel[] {
	let filtered = [...models];

	if (searchQuery.trim()) {
		const q = searchQuery.trim().toLowerCase();
		filtered = filtered.filter(
			(m) => (m.name || m.id).toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
		);
	}

	switch (sortMode) {
		case "price":
			filtered.sort((a, b) => tokensPerDollar(b.pricing) - tokensPerDollar(a.pricing)); // descending: best value first
			break;
		case "context":
			filtered.sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0)); // descending: largest context first
			break;
		default:
			filtered.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
			break;
	}

	return filtered;
}
