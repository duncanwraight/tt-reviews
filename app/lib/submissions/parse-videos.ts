/**
 * TT-131: parse `videos[N][url|title|platform]` hidden inputs from
 * `VideoSubmissionSection` into a JSONB-ready array.
 *
 * Used by the submit action for both the standalone `video` type and
 * the player flow (where videos are an optional cascade alongside
 * equipment_setup). Without this parser both flows silently dropped
 * the submitter's videos — the data reached FormData but no code
 * pulled it back out.
 *
 * Validation here is defensive: drop entries missing url/title (the
 * client component already enforces both, but a hand-crafted POST
 * shouldn't be able to inject blank rows). Platform falls back to
 * "other" — the canonical allowlist (youtube|other) lives on the
 * `video_platform` enum and the appliers re-validate before INSERT.
 */
export interface ParsedVideo {
  url: string;
  title: string;
  platform: "youtube" | "other";
}

export function parseBracketedVideos(formData: FormData): ParsedVideo[] {
  const indices = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^videos\[(\d+)\]\[/);
    if (match) {
      indices.add(parseInt(match[1], 10));
    }
  }

  const videos: ParsedVideo[] = [];
  for (const index of [...indices].sort((a, b) => a - b)) {
    const url = formData.get(`videos[${index}][url]`);
    const title = formData.get(`videos[${index}][title]`);
    const platform = formData.get(`videos[${index}][platform]`);
    if (typeof url !== "string" || typeof title !== "string") continue;
    const trimmedUrl = url.trim();
    const trimmedTitle = title.trim();
    if (!trimmedUrl || !trimmedTitle) continue;
    videos.push({
      url: trimmedUrl,
      title: trimmedTitle,
      platform: platform === "youtube" ? "youtube" : "other",
    });
  }
  return videos;
}
