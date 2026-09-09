import Link from "next/link";

const mentionPattern = /(?<![\w])@[A-Za-z0-9][A-Za-z0-9._-]{0,31}/g;

export function PublicMentionText({ children }: { children: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of children.matchAll(mentionPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(children.slice(cursor, index));
    const mention = match[0];
    parts.push(
      <Link key={`${mention}-${index}`} className="public-mention" href={`/${mention.slice(1)}`}>
        {mention}
      </Link>
    );
    cursor = index + mention.length;
  }

  if (cursor < children.length) parts.push(children.slice(cursor));
  return <>{parts}</>;
}