// PlayerCard setup-line formatter (TT-242). The user-facing string
// is "<blade> / <FH rubber> / <BH rubber>", each piece formatted as
// "<manufacturer> <name>", with cleanly-omitted segments if a piece
// is missing — never "undefined / undefined".
//
// Lives in app/lib/players/ rather than the component file so the
// shape can be unit-tested without the React renderer in the loop,
// and so the Discord embed (or any other surface) can reuse it later
// if needed.

import type { PlayerCurrentSetup } from "~/lib/database/players";

function formatPiece(
  piece: { name: string; manufacturer: string } | undefined
): string | null {
  if (!piece) return null;
  const name = piece.name?.trim();
  const manufacturer = piece.manufacturer?.trim();
  if (!name && !manufacturer) return null;
  if (!manufacturer) return name ?? null;
  if (!name) return manufacturer;
  // Pre-TT-163 rows sometimes have the manufacturer baked into the
  // name (e.g. "Butterfly Tenergy 05" stored as name). Don't render
  // "Butterfly Butterfly Tenergy 05" in that case.
  if (name.toLowerCase().startsWith(manufacturer.toLowerCase() + " ")) {
    return name;
  }
  return `${manufacturer} ${name}`;
}

export function formatCurrentSetup(
  setup: PlayerCurrentSetup | undefined | null
): string | null {
  if (!setup) return null;
  const parts = [
    formatPiece(setup.blade),
    formatPiece(setup.forehandRubber),
    formatPiece(setup.backhandRubber),
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  return parts.join(" / ");
}
