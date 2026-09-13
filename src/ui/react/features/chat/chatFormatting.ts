/** Format a date string to YYYY-DD-MM hh:mm:ss */
export function formatTimestamp(dateStr: string | undefined | null): string {
	if (!dateStr) return '';
	try {
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return '';
		const year = d.getFullYear();
		const day = String(d.getDate()).padStart(2, '0');
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const hours = String(d.getHours()).padStart(2, '0');
		const minutes = String(d.getMinutes()).padStart(2, '0');
		const seconds = String(d.getSeconds()).padStart(2, '0');
		return `${year}-${day}-${month} ${hours}:${minutes}:${seconds}`;
	} catch {
		return '';
	}
}
