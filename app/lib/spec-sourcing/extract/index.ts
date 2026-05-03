// Public exports for the spec-sourcing extractor module (TT-148).

export { cleanHtml, takeExcerpt } from "./clean-html";
export { makeGeminiExtractor } from "./gemini";
export {
  withSpecExtractorBudget,
  type BudgetedSpecExtractor,
  type ExtractEnvelope,
  type ExtractorStatus,
  type MatchEnvelope,
  type SpecExtractorBudgetOptions,
} from "./budget";
export type {
  ExtractedSpec,
  MatchResult,
  SpecExtractor,
  SpecValue,
} from "./types";
