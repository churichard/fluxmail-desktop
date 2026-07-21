/**
 * Label catalog for the demo account. Gmail-style system labels are required;
 * the rest are user-defined labels.
 */

export interface DemoLabel {
  id: string;
  name: string;
  type: "system" | "user";
}

/** Gmail system label IDs (id === name for system labels). */
export const SYSTEM_LABELS: DemoLabel[] = [
  { id: "INBOX", name: "INBOX", type: "system" },
  { id: "SENT", name: "SENT", type: "system" },
  { id: "STARRED", name: "STARRED", type: "system" },
  { id: "IMPORTANT", name: "IMPORTANT", type: "system" },
  { id: "UNREAD", name: "UNREAD", type: "system" },
  { id: "DRAFT", name: "DRAFT", type: "system" },
  { id: "TRASH", name: "TRASH", type: "system" },
  { id: "SPAM", name: "SPAM", type: "system" },
  { id: "CATEGORY_UPDATES", name: "CATEGORY_UPDATES", type: "system" },
  { id: "CATEGORY_PROMOTIONS", name: "CATEGORY_PROMOTIONS", type: "system" },
  { id: "CATEGORY_PERSONAL", name: "CATEGORY_PERSONAL", type: "system" },
  { id: "CATEGORY_SOCIAL", name: "CATEGORY_SOCIAL", type: "system" },
  { id: "CATEGORY_FORUMS", name: "CATEGORY_FORUMS", type: "system" },
];

/** Priority labels must match `Fluxmail/Priority/<priority>`. */
export const PRIORITY_LABELS: DemoLabel[] = [
  {
    id: "Fluxmail/Priority/needs-reply",
    name: "Fluxmail/Priority/needs-reply",
    type: "user",
  },
  {
    id: "Fluxmail/Priority/needs-follow-up",
    name: "Fluxmail/Priority/needs-follow-up",
    type: "user",
  },
  {
    id: "Fluxmail/Priority/important",
    name: "Fluxmail/Priority/important",
    type: "user",
  },
];

/** Hidden internal labels used by the snooze/unsnooze flow. */
export const INTERNAL_LABELS: DemoLabel[] = [
  {
    id: "Fluxmail/Unsnoozed",
    name: "Fluxmail/Unsnoozed",
    type: "user",
  },
  {
    id: "Fluxmail/Priority/unsnoozed",
    name: "Fluxmail/Priority/unsnoozed",
    type: "user",
  },
];

export const PRIORITY = {
  NEEDS_REPLY: "Fluxmail/Priority/needs-reply",
  NEEDS_FOLLOW_UP: "Fluxmail/Priority/needs-follow-up",
  IMPORTANT: "Fluxmail/Priority/important",
} as const;

export const UNSNOOZED = {
  VISIBLE: "Fluxmail/Unsnoozed",
  ATTENTION: "Fluxmail/Priority/unsnoozed",
} as const;

/** User-defined labels referenced by the seed threads. */
export const USER_LABELS: DemoLabel[] = [
  { id: "Customers/Northwind", name: "Customers/Northwind", type: "user" },
  { id: "Customers/Globex", name: "Customers/Globex", type: "user" },
  { id: "Customers/Initech", name: "Customers/Initech", type: "user" },
  { id: "Pipeline/Q2", name: "Pipeline/Q2", type: "user" },
  { id: "Hiring/Eng", name: "Hiring/Eng", type: "user" },
  { id: "Hiring/GTM", name: "Hiring/GTM", type: "user" },
  { id: "Investors", name: "Investors", type: "user" },
];

export const ALL_DEMO_LABELS: DemoLabel[] = [
  ...SYSTEM_LABELS,
  ...PRIORITY_LABELS,
  ...INTERNAL_LABELS,
  ...USER_LABELS,
];
