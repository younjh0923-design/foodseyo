"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readCurrentAnalysisResult,
  tryRemoveCurrentAnalysis,
  type CurrentAnalysisReadResult,
} from "@/lib/storage";

export type CurrentAnalysisSessionState =
  | { readonly status: "loading" }
  | CurrentAnalysisReadResult;

const shouldClearInvalidResult = (
  status: CurrentAnalysisReadResult["status"],
): boolean =>
  !["success", "missing", "unavailable"].includes(status);

export function useCurrentAnalysisSession() {
  const [state, setState] = useState<CurrentAnalysisSessionState>({
    status: "loading",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const result = readCurrentAnalysisResult();
      if (shouldClearInvalidResult(result.status)) tryRemoveCurrentAnalysis();
      setState(result);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const clearCurrentAnalysis = useCallback(() => {
    tryRemoveCurrentAnalysis();
    setState({ status: "missing" });
  }, []);

  return { state, clearCurrentAnalysis };
}
