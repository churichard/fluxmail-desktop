import type { Message } from "@fluxmail/core";

export function quotedReplyCitation(original: Message): string {
  const sender = original.from?.name
    ? `${original.from.name} <${original.from.email}>`
    : (original.from?.email ?? "unknown sender");
  return `On ${formatQuotedReplyDate(original.date)} ${sender} wrote:`;
}

function formatQuotedReplyDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formattedDate} at ${formattedTime}`;
}
