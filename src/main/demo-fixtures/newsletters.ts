import type { DemoThreadSpec } from "./helpers";
import {
  STRIPE,
  LINEAR,
  VERCEL,
  GITHUB,
  TLDR_NEWSLETTER,
  FIGMA,
  NOTION,
  AWS,
  CALENDLY,
  ZOOM,
} from "./people";

export const NEWSLETTER_THREADS: DemoThreadSpec[] = [
  {
    id: "demo-thread-news-001",
    subject: "Your weekly Stripe summary: $42,180 in revenue",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: STRIPE,
        at: { days: 1, time: "06:00" },
        html: `<table style="font-family:system-ui;max-width:560px;border-collapse:collapse">
  <tr><td><h2 style="margin:0;">This week at ACME</h2>
  <p style="font-size:32px;font-weight:600;color:#635bff;margin:8px 0;">$42,180.50</p>
  <p style="margin:0;color:#666;">+12% vs last week · 87 new customers</p></td></tr>
  <tr><td style="padding-top:24px;"><strong>Top products</strong><br/>Growth plan ($28k), Enterprise add-ons ($9k), one-time charges ($5k)</td></tr>
  <tr><td style="padding-top:16px;color:#666;font-size:13px;">View full dashboard at dashboard.stripe.example.com</td></tr>
</table>`,
      },
    ],
  },
  {
    id: "demo-thread-news-002",
    subject: "[Linear] 7 new comments on your issues",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: LINEAR,
        at: { days: 0, time: "07:30" },
        isRead: false,
        html: `<p>You have <strong>7 new comments</strong> across your assigned issues:</p>
<ul>
  <li>ACME-1284, Priya: "Ready for review when you have a sec"</li>
  <li>ACME-1291, Jamie: "Approved, ship it"</li>
  <li>ACME-1305, Lena: "Updated the Figma, can you take another look?"</li>
  <li>... 4 more</li>
</ul>
<p><a href="https://linear.example.com/acme/inbox">View in Linear</a></p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-003",
    subject: "Vercel: 3 deployments succeeded",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: VERCEL,
        at: { days: 2, time: "11:48" },
        html: `<p>Your project <code>acme-web</code> had 3 successful deployments today. All checks passed. Production: <a href="https://acme.example.com">acme.example.com</a>.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-004",
    subject: "[GitHub] PR #4421 from priya was merged",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: GITHUB,
        at: { days: 3, time: "10:15" },
        html: `<p><strong>priya merged PR #4421:</strong> <em>Add composite index on (account_id, created_at) for events table</em></p>
<p>+12 / -4 lines · 1 reviewer approved · all checks green</p>
<p><a href="https://github.example.com/acme/api/pull/4421">View on GitHub</a></p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-005",
    subject: "TLDR May 13: NVIDIA earnings, the death of WeWork, AI agents pivot",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: TLDR_NEWSLETTER,
        at: { days: 0, time: "05:15" },
        isRead: false,
        html: `<h2>TLDR May 13</h2>
<p><strong>📈 Big Tech &amp; Startups</strong></p>
<ul>
  <li>NVIDIA Q1 earnings beat estimates by 14% (3 min)</li>
  <li>WeWork files for liquidation, 87 offices to close (4 min)</li>
  <li>OpenAI cuts API prices by 40% for o4-mini (2 min)</li>
</ul>
<p><strong>💻 Programming, Design &amp; Data Science</strong></p>
<ul>
  <li>The truth about microservices: a postmortem (8 min)</li>
  <li>SQLite ships built-in vector search (5 min)</li>
</ul>
<p><a href="https://tldr.example.com">Read on the web</a></p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-006",
    subject: '[Figma] Lena commented in "Onboarding v3"',
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: FIGMA,
        at: { days: 1, time: "14:20" },
        html: `<p>Lena Ortiz left 4 comments on <strong>Onboarding v3</strong>:</p>
<ul>
  <li>"This button should be the same primary color we use on the dashboard, not the marketing site one"</li>
  <li>"+1 to the smaller hero, looks much cleaner"</li>
  <li>"@john can you double-check the copy here?"</li>
  <li>"Replied to your comment about the workspace name field"</li>
</ul>`,
      },
    ],
  },
  {
    id: "demo-thread-news-007",
    subject: "[Notion] 12 new pages updated in your workspace",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: NOTION,
        at: { days: 5, time: "07:00" },
        html: `<p>12 pages updated this week in your workspace. Most active: Q2 OKRs (8 edits), H2 Roadmap Strawman (6 edits), Eng Postmortem 2026-05-05 (4 edits).</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-008",
    subject: "[AWS] Your AWS billing summary for April 2026",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: AWS,
        at: { days: 8, time: "03:00" },
        html: `<p><strong>April 2026 AWS bill: $14,228.40</strong> (vs March $13,891, +2.4%)</p>
<p>Top services: EC2 ($6,140), RDS ($3,210), S3 ($1,402), DataTransfer ($1,218).</p>
<p>View detailed breakdown in the Billing console.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-009",
    subject: "Calendly: 4 meetings scheduled for next week",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: CALENDLY,
        at: { days: 1, time: "17:00" },
        html: `<p>Heads up, you have 4 meetings on your calendar next week:</p>
<ul>
  <li>Mon 10am: Sarah Chen (Northwind), 30 min</li>
  <li>Tue 2pm: Riley Nguyen (interview), 45 min</li>
  <li>Wed 11am: Dana Whitfield (Umbrella), 30 min</li>
  <li>Thu 3pm: Investor sync (David Hong), 30 min</li>
</ul>`,
      },
    ],
  },
  {
    id: "demo-thread-news-010",
    subject: "[Zoom] Recording: ACME × Globex QBR (2026-05-08)",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: ZOOM,
        at: { days: 4, time: "12:30" },
        html: `<p>Your Zoom recording is ready: <strong>ACME × Globex QBR</strong>.</p>
<p>Duration: 47 minutes. Auto-transcript attached. Recording expires in 30 days.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-011",
    subject: "Stripe: New customer signed up (Wonka Industries)",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: STRIPE,
        at: { days: 3, time: "08:40" },
        html: `<p>🎉 New customer: <strong>Wonka Industries</strong> signed up for the Growth plan ($2,400/yr).</p>
<p>Customer email: nina.patel@wonkaindustries.example.com</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-012",
    subject: "[Linear] Sprint review prep: 6 issues to triage",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: LINEAR,
        at: { days: 2, time: "17:30" },
        html: `<p>Sprint review on Thursday. 6 issues need triage before the meeting. <a href="https://linear.example.com/acme/triage">Open triage</a></p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-013",
    subject: "TLDR May 12: Apple WWDC preview, Anthropic Series F, Cursor 1.0",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: TLDR_NEWSLETTER,
        at: { days: 1, time: "05:15" },
        html: `<h2>TLDR May 12</h2>
<p>Today: Apple WWDC preview, Anthropic raises $7B Series F at $80B valuation, Cursor 1.0 ships.</p>
<p><a href="https://tldr.example.com">Read on the web</a></p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-014",
    subject: "[GitHub] Security alert: 2 dependabot updates available",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: GITHUB,
        at: { days: 0, time: "03:20" },
        isRead: false,
        html: `<p>Dependabot found 2 high-severity vulnerabilities in <code>acme/api</code>:</p>
<ul>
  <li><code>express</code> 4.18.0 → 4.19.2 (CVE-2026-1234)</li>
  <li><code>jsonwebtoken</code> 9.0.0 → 9.0.2 (CVE-2026-5678)</li>
</ul>
<p>PRs auto-opened, awaiting review.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-015",
    subject: "[Vercel] Build failed: acme-web (preview)",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: VERCEL,
        at: { days: 6, time: "11:00" },
        html: `<p>Build failed for branch <code>feat/audit-log-ui</code>. Type error in <code>app/audit-log/page.tsx:42</code>. <a href="https://vercel.example.com/acme/builds/4221">View logs</a></p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-016",
    subject: "Notion: Weekly digest",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: NOTION,
        at: { days: 2, time: "07:00" },
        html: `<p>Most-edited pages this week: Q2 OKRs, May All-Hands Notes, Eng Roadmap. 4 teammates were active in your workspace.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-017",
    subject: "[Calendly] Meeting cancelled: Bill Lumbergh (Initech)",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: CALENDLY,
        at: { days: 7, time: "09:14" },
        html: `<p>Bill Lumbergh cancelled the 11am Friday meeting. Reschedule link sent automatically.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-018",
    subject: "Stripe: Payout of $48,920 scheduled for May 15",
    labelIds: ["CATEGORY_UPDATES"],
    messages: [
      {
        from: STRIPE,
        at: { days: 0, time: "02:30" },
        html: `<p>Your next payout of <strong>$48,920.18</strong> is scheduled for <strong>May 15, 2026</strong>. This represents 152 successful charges minus fees and refunds.</p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-019",
    subject: "AWS: Reserved Instance recommendation",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: AWS,
        at: { days: 13, time: "06:00" },
        html: `<p>Based on your usage, you could save <strong>$2,140/month</strong> by purchasing 3-year RIs for your RDS workload. <a href="https://aws.example.com/ri-recommendations">Review recommendation</a></p>`,
      },
    ],
  },
  {
    id: "demo-thread-news-020",
    subject: "[Figma] Library updated: ACME Design System v4",
    labelIds: ["CATEGORY_UPDATES"],
    archived: true,
    messages: [
      {
        from: FIGMA,
        at: { days: 11, time: "15:00" },
        html: `<p>Lena Ortiz published version 4.0 of the <strong>ACME Design System</strong> library. 22 components updated. Auto-merge available in 14 files.</p>`,
      },
    ],
  },
];
