export function ensureHttp(url: string): string {
	return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

export function getDomain(url: string): string {
	try { return new URL(ensureHttp(url)).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function faviconUrl(url: string): string {
	const d = getDomain(url);
	return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=32` : "";
}
