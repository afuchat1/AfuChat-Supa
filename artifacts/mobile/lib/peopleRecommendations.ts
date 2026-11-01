export type AffinityCandidate<T> = {
  id: string;
  value: T;
  interests: unknown;
  mutualCount: number;
};

export type RankedAffinityCandidate<T> = AffinityCandidate<T> & {
  sharedInterestCount: number;
  score: number;
  isSeen: boolean;
};

export function normalizeInterestList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((interest): interest is string => typeof interest === "string")
      .map((interest) => interest.trim().toLowerCase())
      .filter(Boolean),
  ));
}

export function nextProfilePageOffset(
  currentOffset: number,
  resultCount: number,
  pageSize: number,
  failed = false,
): number {
  if (failed) return currentOffset;
  return resultCount < pageSize ? 0 : currentOffset + pageSize;
}

export function rankPeopleByAffinity<T>(
  candidates: AffinityCandidate<T>[],
  viewerInterests: readonly string[],
  seenIds: ReadonlySet<string>,
  random: () => number = Math.random,
): RankedAffinityCandidate<T>[] {
  const viewerInterestSet = new Set(normalizeInterestList(viewerInterests));

  return candidates
    .map((candidate) => {
      const interests = normalizeInterestList(candidate.interests);
      const sharedInterestCount = interests.filter((interest) =>
        viewerInterestSet.has(interest),
      ).length;
      const boundedMutualCount = Math.min(Math.max(candidate.mutualCount, 0), 20);
      return {
        ...candidate,
        sharedInterestCount,
        score: sharedInterestCount * 20 + boundedMutualCount * 4,
        isSeen: seenIds.has(candidate.id),
        tieBreak: random(),
      };
    })
    .sort((a, b) =>
      Number(a.isSeen) - Number(b.isSeen) ||
      b.score - a.score ||
      a.tieBreak - b.tieBreak ||
      a.id.localeCompare(b.id),
    )
    .map(({ tieBreak: _tieBreak, ...candidate }) => candidate);
}
