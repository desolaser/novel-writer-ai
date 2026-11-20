import { useState } from "react";
import { useNovelWriter } from "../store/novelWriterStore";

/** Optional blocks of an expanded chapter that fold away. */
export type OutlineSection = "info" | "scenes" | "facts";

/**
 * Whether a section of an expanded chapter is open. Closed by default; the
 * author's last choice is saved (`uiPrefs.outlineSections`) and applies to
 * the chapters expanded after it.
 */
export function useOutlineSectionOpen(section: OutlineSection): [boolean, () => void] {
	const settings = useNovelWriter((state) => state.settings);
	const [open, setOpen] = useState(
		() => settings?.data.uiPrefs.outlineSections?.[section] ?? false,
	);

	const toggle = () => {
		const next = !open;
		setOpen(next);
		if (!settings) return;
		const prefs = settings.data.uiPrefs;
		prefs.outlineSections = { ...(prefs.outlineSections ?? {}), [section]: next };
		void settings.save();
	};

	return [open, toggle];
}
