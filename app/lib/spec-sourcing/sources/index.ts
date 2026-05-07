// Spec-sourcing source registry (TT-147). Flat array exported in
// (tier ASC, manufacturer-first within tier) order. The worker
// (TT-149) walks this list per equipment, calling each source's
// `search` until enough fields are filled, then `fetch` per surviving
// candidate to feed the LLM extractor.
//
// Adding a new tier-1 manufacturer adapter (TT-152) means appending
// it to the tier-1 group below — the `brand` field on the source lets
// the worker skip non-matching brands without per-call branching.

import { androSource } from "./andro";
import { butterflySource } from "./butterfly";
import { dhsSource } from "./dhs";
import { donicSource } from "./donic";
import { joolaSource } from "./joola";
import { revspinSource } from "./revspin";
import { stigaSource } from "./stiga";
import { tibharSource } from "./tibhar";
import { tt11Source } from "./tt11";
import { victasSource } from "./victas";
import { xiomSource } from "./xiom";
import { yasakaSource } from "./yasaka";
import type { SpecSource } from "./types";

export const SPEC_SOURCES: SpecSource[] = [
  androSource,
  butterflySource,
  dhsSource,
  donicSource,
  joolaSource,
  stigaSource,
  tibharSource,
  victasSource,
  xiomSource,
  yasakaSource,
  tt11Source,
  revspinSource,
];

export type { EquipmentRef, SpecCandidate, SpecSource } from "./types";
