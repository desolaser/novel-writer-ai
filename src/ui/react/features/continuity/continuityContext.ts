import { createContext, useContext } from "react";
import type { ContinuityChecker } from "./continuityChecker";

/**
 * The continuity checker of the Outline, provided by `outlineRoot.tsx` so the
 * facts panel of each chapter doesn't need it passed through every row.
 */
const ContinuityContext = createContext<ContinuityChecker | null>(null);

export const ContinuityProvider = ContinuityContext.Provider;

export function useContinuityChecker(): ContinuityChecker {
	const checker = useContext(ContinuityContext);
	if (!checker) {
		throw new Error("The continuity checker is only available in the Outline.");
	}
	return checker;
}
