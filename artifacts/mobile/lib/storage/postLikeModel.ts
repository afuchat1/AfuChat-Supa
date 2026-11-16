export type PostLikeSnapshot = {
  liked: boolean;
  likeCount: number;
  pending: boolean;
  updatedAt: number;
  organizationPagePost?: boolean;
};

export type PostLikePresentation = {
  liked: boolean;
  likeCount: number;
};

/**
 * Use a locally saved intent while it is awaiting confirmation, or when a
 * network snapshot began before the local action. Otherwise the server is the
 * source of truth; offline callers pass serverKnown=false.
 */
export function resolvePostLikePresentation(
  serverLiked: boolean,
  serverLikeCount: number,
  local: PostLikeSnapshot | null | undefined,
  serverKnown: boolean,
  requestStartedAt = Number.POSITIVE_INFINITY,
): PostLikePresentation {
  const localIsNewer = !!local && (
    local.pending ||
    local.updatedAt > requestStartedAt ||
    !serverKnown
  );

  if (localIsNewer && local) {
    const likeCount = local.pending && serverKnown
      ? serverLikeCount + Number(local.liked) - Number(serverLiked)
      : local.likeCount;
    return { liked: local.liked, likeCount: Math.max(0, likeCount) };
  }

  return {
    liked: serverLiked,
    likeCount: Math.max(0, serverLikeCount),
  };
}

export function applyPostLikeSnapshots<T extends {
  id: string;
  liked: boolean;
  likeCount: number;
}>(
  items: T[],
  localStates: ReadonlyMap<string, PostLikeSnapshot>,
  serverKnown: boolean,
  requestStartedAt = Number.POSITIVE_INFINITY,
): T[] {
  return items.map((item) => ({
    ...item,
    ...resolvePostLikePresentation(
      item.liked,
      item.likeCount,
      localStates.get(item.id),
      serverKnown,
      requestStartedAt,
    ),
  }));
}
