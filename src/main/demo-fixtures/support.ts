import type { DemoThreadSpec } from "./helpers";
import { BILL_LUMBERGH, CHEN_LIU, NINA_PATEL } from "./people";
import { PRIORITY } from "./labels";

const SUPPORT_PERSON = {
  name: "Support Customer",
  email: "support-customer@example.com",
  photoUrl: "/demo/avatars/generic-org.svg",
} as const;

export const SUPPORT_THREADS: DemoThreadSpec[] = [
  {
    id: "demo-thread-support-001",
    subject: "[Support] API rate limit on /v1/charges (Initech)",
    labelIds: ["IMPORTANT", "Customers/Initech", PRIORITY.IMPORTANT],
    priorityReason:
      "Production API rate limiting is impacting an active customer and needs same-day attention.",
    messages: [
      {
        from: BILL_LUMBERGH,
        at: { days: 0, time: "11:24" },
        isRead: false,
        html: `<p>Hey ACME team,</p>
<p>Getting 429s on <code>/v1/charges</code> since around 10am ET. Account ID <code>acct_8d2kJxQ</code>. We're on the Growth plan and docs say 100 rps, but we're throttled at maybe 30 rps right now.</p>
<p>Can someone take a look? This is hitting production.</p>
<p>Bill</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-002",
    subject: "[Support] Login flow broken with Okta",
    labelIds: ["Customers/Globex", PRIORITY.NEEDS_REPLY],
    messages: [
      {
        from: CHEN_LIU,
        at: { days: 1, time: "14:08" },
        isRead: false,
        html: `<p>Hey, a few of our users (5/200 so far) are getting kicked back to the login page when they SSO via Okta. Started this morning. Other SSO flows seem fine.</p>
<p>Have console logs and a HAR if useful. Can you take a look today?</p>
<p>Chen</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-003",
    subject: "[Support] Re: How do I export a workspace?",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: NINA_PATEL,
        at: { days: 7, time: "10:00" },
        html: `<p>Quick question. How do I export an entire workspace as CSV? Workspace settings page only shows individual dashboards.</p>
<p>Nina</p>`,
      },
      {
        from: "me",
        to: NINA_PATEL.email,
        at: { days: 7, time: "10:34" },
        html: `<p>Hi Nina, workspace-level export is in the admin settings (gear icon &gt; Data &gt; Export). Generates a ZIP of every dashboard's CSV. Ping me if you don't see it.</p>
<p>John</p>`,
      },
      {
        from: NINA_PATEL,
        at: { days: 7, time: "11:02" },
        html: `<p>Found it. Thanks!</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-004",
    subject: "[Support] Slack integration disconnecting itself",
    labelIds: [],
    messages: [
      {
        from: SUPPORT_PERSON,
        at: { days: 2, time: "09:42" },
        isRead: false,
        html: `<p>Our Slack integration keeps disconnecting itself every couple of days. We reconnect it and then a day or two later it's gone again. Workspace ID: ws_4kk2L.</p>
<p>This is the third time this month. Help?</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-005",
    subject: "Re: [Support] Billing question: annual vs monthly switch",
    labelIds: ["Customers/Northwind"],
    archived: true,
    messages: [
      {
        from: {
          name: "Procurement",
          email: "procurement@northwindlabs.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 9, time: "13:00" },
        html: `<p>Confirming: we'd like to switch our monthly billing to annual effective next month. Net 60 terms.</p>`,
      },
      {
        from: "me",
        to: "procurement@northwindlabs.example.com",
        at: { days: 9, time: "15:30" },
        html: `<p>Confirmed. Updated invoice incoming. Net 60 noted.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-006",
    subject: "[Support] Webhook signature verification failing",
    labelIds: ["Customers/Globex", PRIORITY.NEEDS_FOLLOW_UP],
    priorityReason:
      "Webhook signing keys rotated and Globex may need confirmation that the fix worked.",
    messages: [
      {
        from: CHEN_LIU,
        at: { days: 3, time: "16:18" },
        html: `<p>Our webhook handler started failing signature verification this morning. We're using the documented HMAC-SHA256 process. Did you rotate webhook secrets recently?</p>
<p>Chen</p>`,
      },
      {
        from: "me",
        to: CHEN_LIU.email,
        at: { days: 3, time: "17:00" },
        html: `<p>Hey Chen, yes, we rotated webhook signing keys early this week (heads up went out Monday). You'll need to grab the new secret from the workspace integrations page. Sorry for the friction.</p>
<p>John</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-007",
    subject: "[Support] Feature request: saved views",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: {
          name: "Pat Mizuno",
          email: "pat@wonkaindustries.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 11, time: "11:00" },
        html: `<p>Hi, would love saved views per-dashboard. We have ~10 people sharing the same dashboard but each filters differently and the URL state is getting unwieldy.</p>
<p>Pat</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-008",
    subject: "[Support] Data freshness lag, 4 hours behind",
    labelIds: [PRIORITY.NEEDS_REPLY],
    messages: [
      {
        from: SUPPORT_PERSON,
        at: { days: 0, time: "15:50" },
        isRead: false,
        html: `<p>Our dashboards are showing data from 4 hours ago. Normally we see lag of a couple minutes. Status page shows all green. Workspace ID: ws_99kjQ.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-009",
    subject: "[Support] Re: Two-factor reset",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: {
          name: "Helena Cruz",
          email: "helena@stark-industries.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 16, time: "09:00" },
        html: `<p>Lost my phone. Need a 2FA reset on my account.</p>`,
      },
      {
        from: "me",
        to: "helena@stark-industries.example.com",
        at: { days: 16, time: "09:45" },
        html: `<p>Sending you a verification email now. Please reply from the same address with the code so I can reset the 2FA on our end.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-support-010",
    subject: "[Support] Re: Onboarding question",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: {
          name: "Avery Lin",
          email: "avery@plover-tech.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 19, time: "12:30" },
        html: `<p>How do I add a teammate to my workspace? Settings only shows my own email.</p>`,
      },
      {
        from: "me",
        to: "avery@plover-tech.example.com",
        at: { days: 19, time: "13:00" },
        html: `<p>Settings &gt; Team &gt; Invite Members. Make sure you're an admin. If you're a member, ask your workspace admin to add them.</p>`,
      },
    ],
  },
];
