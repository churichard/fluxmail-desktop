import type { DemoThreadSpec } from "./helpers";
import { JAMIE_PARK, PRIYA_RAMAN, LENA_ORTIZ, SAM_PATEL, MARCUS_OByrne } from "./people";
import { PRIORITY } from "./labels";

export const INTERNAL_THREADS: DemoThreadSpec[] = [
  {
    id: "demo-thread-internal-001",
    subject: "[eng] Postgres query optimization: 14x speedup on /api/events",
    labelIds: ["IMPORTANT"],
    messages: [
      {
        from: PRIYA_RAMAN,
        at: { days: 3, time: "14:32" },
        html: `<p>Hey team,</p>
<p>While digging into the slow <code>/api/events</code> endpoint this morning I noticed we were missing an index on <code>(account_id, created_at)</code>.</p>
<p>Adding it took p95 from <strong>2.4s → 170ms</strong> on the staging replica.</p>
<p>PR up at <a href="https://github.example.com/acme/api/pull/4421">acme/api#4421</a>. Will roll out behind a flag tomorrow.</p>
<p>- Priya</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-002",
    subject: "Weekly metrics, week of May 5",
    labelIds: [],
    messages: [
      {
        from: SAM_PATEL,
        at: { days: 2, time: "08:00" },
        html: `<p>Team, quick metrics:</p>
<ul>
  <li>MRR: <strong>$182k</strong> (+5.4% WoW)</li>
  <li>New paid workspaces: 11 (last week 7)</li>
  <li>Churn: 1 workspace ($1.2k MRR, downgrade not cancel)</li>
  <li>Pipeline added: $640k (Northwind $84k, Hooli $310k, 4 smaller)</li>
</ul>
<p>Dashboard link: <a href="https://internal.acme.example.com/metrics">internal/metrics</a></p>
<p>Sam</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-003",
    subject: "Design review: onboarding v3",
    labelIds: [],
    messages: [
      {
        from: LENA_ORTIZ,
        at: { days: 1, time: "13:14" },
        html: `<p>Hey John,</p>
<p>Onboarding v3 ready for review. Big change: we moved the workspace creation step before the integration step, based on the user research from last sprint.</p>
<p>Figma: <a href="https://figma.example.com/file/onboarding-v3">figma/onboarding-v3</a></p>
<p>Engineering started on the auth piece. Targeting prod by end of next week.</p>
<p>Lena</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-004",
    subject: "Re: Q2 OKRs first draft",
    labelIds: ["IMPORTANT"],
    messages: [
      {
        from: JAMIE_PARK,
        at: { days: 5, time: "16:45" },
        html: `<p>John, first cut of Q2 OKRs in the doc. Top-level:</p>
<ol>
  <li>Reach $250k MRR (currently $182k → need ~$23k/mo net new)</li>
  <li>Ship audit log + SSO add-on tier (gates Hooli, Northwind)</li>
  <li>Hire 2 eng, 1 GTM</li>
  <li>Reduce p95 query latency to &lt; 500ms for the top 80% of customers</li>
</ol>
<p>Strawman doc: <a href="https://notion.example.com/acme/q2-okrs">notion/acme/q2-okrs</a></p>
<p>Comments by Friday?</p>
<p>Jamie</p>`,
      },
      {
        from: "me",
        to: JAMIE_PARK.email,
        at: { days: 4, time: "09:30" },
        html: `<p>Good cut. Two thoughts:</p>
<ul>
  <li>I'd swap #4 for a customer-facing KR (e.g. NRR &gt; 115%). Latency is a means to that, not the goal itself</li>
  <li>Hiring KR should be more specific: 1 founding eng, 1 founding AE, 1 SE</li>
</ul>
<p>Will leave inline comments in the doc.</p>
<p>- John</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-005",
    subject: "[eng] Incident postmortem: analytics dashboard outage",
    labelIds: ["IMPORTANT", PRIORITY.IMPORTANT],
    priorityReason:
      "Customer-facing outage postmortem with action items before the engineering all-hands.",
    messages: [
      {
        from: PRIYA_RAMAN,
        at: { days: 7, time: "21:30" },
        html: `<p>Postmortem for tonight's analytics dashboard outage (22 minutes, ~40% of traffic affected) is up:</p>
<p><a href="https://notion.example.com/acme/postmortem-2026-05-05">notion/acme/postmortem-2026-05-05</a></p>
<p>TL;DR: a config push set the wrong connection pool size, query queue saturated, cascading timeouts. Three action items, all assigned. No customer data lost.</p>
<p>Will walk through it at the eng all-hands Wednesday.</p>
<p>Priya</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-006",
    subject: "PR: feature flag for new pricing page",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: MARCUS_OByrne,
        at: { days: 8, time: "11:14" },
        html: `<p>Hey John, feature flag is ready for the new pricing page. Currently set to 0% rollout. Let me know when you want to flip it. Suggested ramp: 10% → 50% → 100% over 3 days.</p>
<p>Marcus</p>`,
      },
      {
        from: "me",
        to: MARCUS_OByrne.email,
        at: { days: 7, time: "08:45" },
        html: `<p>Let's flip 10% Friday morning and check conversion on Monday.</p>
<p>John</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-007",
    subject: "Re: All-hands agenda for Thursday",
    labelIds: [],
    messages: [
      {
        from: JAMIE_PARK,
        at: { days: 3, time: "17:22" },
        html: `<p>Agenda draft for Thursday all-hands:</p>
<ol>
  <li>State of the company (John, 10 min)</li>
  <li>Q1 retro + Q2 OKRs (Jamie, 15 min)</li>
  <li>Product demo: new audit log (Priya, 10 min)</li>
  <li>Customer story: Globex (Sam, 5 min)</li>
  <li>Q&amp;A (open)</li>
</ol>
<p>OK with you?</p>
<p>Jamie</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-008",
    subject: "[security] Dependency upgrade: Node 22 → 24",
    labelIds: [],
    messages: [
      {
        from: PRIYA_RAMAN,
        at: { days: 9, time: "10:00" },
        html: `<p>FYI, we're upgrading our backend runtime from Node 22 to Node 24 next sprint. Reasons: faster startup, better error stacks, native fetch in workers.</p>
<p>Plan: upgrade in staging Tuesday, soak for 48h, prod on Thursday during the low-traffic window. Zero expected customer impact.</p>
<p>Priya</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-009",
    subject: "Brand refresh: first pass at the new logo mark",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: LENA_ORTIZ,
        at: { days: 10, time: "12:50" },
        html: `<p>Hey John, first pass at the new logo mark. Three directions, all in the Figma file. I'm leaning toward direction B (the geometric one) because it scales down better.</p>
<p>Take a look when you have 5 minutes. No rush.</p>
<p>Lena</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-010",
    subject: "Q1 financials: final numbers",
    labelIds: ["IMPORTANT"],
    messages: [
      {
        from: SAM_PATEL,
        at: { days: 6, time: "09:30" },
        html: `<p>John,</p>
<p>Q1 financials closed. The headline numbers:</p>
<ul>
  <li>Revenue: $467k (vs. plan $440k, +6.1%)</li>
  <li>Net new ARR: $182k (vs. plan $150k)</li>
  <li>Burn: $128k/mo (vs. plan $140k, slightly under thanks to delayed sales hires)</li>
  <li>Runway: 18 months at current burn</li>
</ul>
<p>Full deck attached for the board update.</p>
<p>Sam</p>`,
        attachments: [
          {
            filename: "acme-q1-board-deck.pdf",
            mimeType: "application/pdf",
            size: 1_240_000,
          },
        ],
      },
    ],
  },
  {
    id: "demo-thread-internal-011",
    subject: "Customer health review: May",
    labelIds: [],
    messages: [
      {
        from: SAM_PATEL,
        at: { days: 11, time: "14:00" },
        html: `<p>Quick health rundown, sharing for visibility:</p>
<ul>
  <li><strong>Green</strong> (29): Globex, Wonka, most SMB</li>
  <li><strong>Yellow</strong> (4): Initech (slow adoption), 3 SMB with declining DAUs</li>
  <li><strong>Red</strong> (1): Stark Industries, exec sponsor change, no responses in 3 weeks</li>
</ul>
<p>Plan to do an exec-to-exec outreach on Stark this week.</p>
<p>Sam</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-012",
    subject: "Office snack budget: bumping it up",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: {
          name: "Office Ops",
          email: "ops@acme.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 14, time: "09:00" },
        html: `<p>FYI to all: we're bumping the snack budget from $200/week to $350/week. The team requested more variety. Suggestions to ops@.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-013",
    subject: "Re: Roadmap for H2 strawman",
    labelIds: [],
    messages: [
      {
        from: JAMIE_PARK,
        at: { days: 8, time: "15:30" },
        html: `<p>H2 strawman roadmap doc is up. Three big themes:</p>
<ol>
  <li>Enterprise readiness (audit log, SSO, SCIM, EU data residency)</li>
  <li>Platform expansion (open up SDK to 3rd-party integrations)</li>
  <li>AI features (anomaly detection, natural-language query)</li>
</ol>
<p>Doc: <a href="https://notion.example.com/acme/h2-roadmap">notion/acme/h2-roadmap</a>. Looking for your direction before we open it to the team.</p>
<p>Jamie</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-014",
    subject: "Office space: lease renewal options",
    labelIds: [],
    messages: [
      {
        from: {
          name: "Sara Cohen",
          email: "sara@cushmanwakefield.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 13, time: "11:30" },
        html: `<p>Hi John,</p>
<p>Your lease at 350 Mission renews in October. Three options:</p>
<ol>
  <li>Renew at $58/sqft (current $52) for another 3 years</li>
  <li>Expand to the adjacent suite (3,200 sqft total, $60/sqft) for 3 years</li>
  <li>Stay month-to-month at $66/sqft</li>
</ol>
<p>Want to schedule a walk-through of the expansion suite?</p>
<p>Sara</p>`,
      },
    ],
  },
  {
    id: "demo-thread-internal-015",
    subject: "[eng] Weekly platform metrics",
    labelIds: [],
    messages: [
      {
        from: PRIYA_RAMAN,
        at: { days: 4, time: "17:45" },
        html: `<p>Weekly eng metrics:</p>
<ul>
  <li>API uptime: 99.94% (target 99.9%)</li>
  <li>p95 latency: 412ms (down from 470ms last week)</li>
  <li>Deployments: 47 (no rollbacks)</li>
  <li>Open Sev1: 0</li>
  <li>Open Sev2: 2 (both have ETAs this week)</li>
</ul>
<p>Priya</p>`,
      },
    ],
  },
];
