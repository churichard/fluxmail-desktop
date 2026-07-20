import type { Message } from "@fluxmail/core";
import { HIRING_THREADS } from "./hiring";
import {
  buildMessages,
  DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_ID,
  DEMO_ACCOUNT_NAME,
  type DemoThreadSpec,
} from "./helpers";
import { INTERNAL_THREADS } from "./internal";
import { INVESTOR_THREADS } from "./investors";
import { NEWSLETTER_THREADS } from "./newsletters";
import { PERSONAL_THREADS } from "./personal";
import { SALES_THREADS } from "./sales";
import { SUPPORT_THREADS } from "./support";

export { DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_ID, DEMO_ACCOUNT_NAME };

export const DEMO_THREAD_SPECS: DemoThreadSpec[] = [
  ...SALES_THREADS,
  ...HIRING_THREADS,
  ...INTERNAL_THREADS,
  ...INVESTOR_THREADS,
  ...SUPPORT_THREADS,
  ...NEWSLETTER_THREADS,
  ...PERSONAL_THREADS,
];

export function buildDemoMessages(anchor = new Date()): Message[] {
  return DEMO_THREAD_SPECS.flatMap((spec) => buildMessages(spec, anchor));
}
