import type { EmailAddress, Message } from "@fluxmail/core";
import type { DemoPerson } from "./people";

export const DEMO_ACCOUNT_ID = "demo-gmail-account";
export const DEMO_ACCOUNT_EMAIL = "john@acme.example.com";
export const DEMO_ACCOUNT_NAME = "John Carter";

export interface DemoAttachmentSpec {
  filename: string;
  mimeType: string;
  size: number;
}

export interface DemoMessageSpec {
  from: DemoPerson | "me";
  to?: string;
  cc?: string;
  at: { days: number; time?: string };
  html: string;
  isRead?: boolean;
  attachments?: DemoAttachmentSpec[];
  labelIds?: string[];
}

export interface DemoThreadSpec {
  id: string;
  subject: string | null;
  messages: DemoMessageSpec[];
  labelIds?: string[];
  priorityReason?: string;
  isStarred?: boolean;
  archived?: boolean;
  sentOnly?: boolean;
}

function dateAt(anchor: Date, days: number, time = "09:00"): string {
  const [hours = 9, minutes = 0] = time.split(":").map(Number);
  const date = new Date(anchor);
  date.setDate(date.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function address(email: string): EmailAddress {
  return { email };
}

function messageFolder(isFromUser: boolean, spec: DemoThreadSpec): Message["folder"] {
  if (isFromUser || spec.sentOnly) return { id: "SENT", name: "Sent", role: "sent" };
  if (spec.archived) return { id: "ALL", name: "All mail", role: "all" };
  return { id: "INBOX", name: "Inbox", role: "inbox" };
}

export function buildMessages(spec: DemoThreadSpec, anchor: Date): Message[] {
  return spec.messages.map((messageSpec, index) => {
    const isFromUser = messageSpec.from === "me";
    const person: DemoPerson | undefined = messageSpec.from === "me" ? undefined : messageSpec.from;
    const id = `${spec.id}-m${index + 1}`;
    const previousId = index > 0 ? `${spec.id}-m${index}` : undefined;
    const text = plainTextFromHtml(messageSpec.html);
    const isRead = messageSpec.isRead ?? (isFromUser || index < spec.messages.length - 1);

    return {
      id,
      threadId: spec.id,
      accountId: DEMO_ACCOUNT_ID,
      folder: messageFolder(isFromUser, spec),
      labels: [...new Set([...(spec.labelIds ?? []), ...(messageSpec.labelIds ?? [])])],
      from: isFromUser
        ? { name: DEMO_ACCOUNT_NAME, email: DEMO_ACCOUNT_EMAIL }
        : { name: person!.name, email: person!.email },
      to: isFromUser
        ? [address(messageSpec.to ?? DEMO_ACCOUNT_EMAIL)]
        : [{ name: DEMO_ACCOUNT_NAME, email: DEMO_ACCOUNT_EMAIL }],
      ...(messageSpec.cc ? { cc: [address(messageSpec.cc)] } : {}),
      subject: spec.subject ?? "",
      date: dateAt(anchor, messageSpec.at.days, messageSpec.at.time),
      snippet: text.slice(0, 200),
      body: { text, html: messageSpec.html.trim() },
      attachments: (messageSpec.attachments ?? []).map((attachment, attachmentIndex) => ({
        id: `${spec.id}-att${index + 1}-${attachmentIndex + 1}`,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.size,
        disposition: "attachment",
      })),
      flags: { read: isRead, starred: Boolean(spec.isStarred), draft: false },
      headers: {
        "Message-ID": `<${id}@acme.example.com>`,
        ...(previousId
          ? {
              "In-Reply-To": `<${previousId}@acme.example.com>`,
              References: Array.from(
                { length: index },
                (_, referenceIndex) => `<${spec.id}-m${referenceIndex + 1}@acme.example.com>`,
              ).join(" "),
            }
          : {}),
      },
    };
  });
}
