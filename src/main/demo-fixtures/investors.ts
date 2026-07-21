import type { DemoThreadSpec } from "./helpers";
import { DAVID_HONG, ROBIN_TATE } from "./people";
import { PRIORITY } from "./labels";

export const INVESTOR_THREADS: DemoThreadSpec[] = [
  {
    id: "demo-thread-investor-001",
    subject: "Re: ACME March board prep",
    labelIds: ["Investors", PRIORITY.NEEDS_REPLY],
    isStarred: true,
    messages: [
      {
        from: DAVID_HONG,
        at: { days: 4, time: "16:08" },
        html: `<p>John,</p>
<p>Saw the deck draft, looks solid.</p>
<p>One ask: can we add a slide on the GTM hiring plan? Specifically the AE ramp timeline and quota assumptions. Board will definitely ask.</p>
<p>Thursday still works for the dry run.</p>
<p>David</p>`,
      },
    ],
  },
  {
    id: "demo-thread-investor-002",
    subject: "April investor update",
    labelIds: ["Investors"],
    sentOnly: true,
    messages: [
      {
        from: "me",
        to: "investors@acme.example.com",
        at: { days: 12, time: "09:30" },
        html: `<p>Hi all,</p>
<p>April update:</p>
<ul>
  <li><strong>MRR:</strong> $170k (+8% MoM)</li>
  <li><strong>New customers:</strong> 9 paid workspaces, including Globex expansion ($11k MRR)</li>
  <li><strong>Hires:</strong> Closed Lena (Head of Design). Hiring 1 founding AE, 2 eng.</li>
  <li><strong>Asks:</strong> Intros to Stripe, Linear, Vercel data teams</li>
</ul>
<p>Full update + financials: <a href="https://internal.acme.example.com/investor-update-apr">internal/investor-update-apr</a></p>
<p>- John</p>`,
      },
    ],
  },
  {
    id: "demo-thread-investor-003",
    subject: "Re: Intro to Sequoia growth team",
    labelIds: ["Investors"],
    messages: [
      {
        from: ROBIN_TATE,
        at: { days: 1, time: "11:42" },
        isRead: false,
        html: `<p>John, I mentioned ACME to Greta at Sequoia growth last night. She wants to grab coffee with you sometime in the next few weeks. No pressure, no agenda: they just want to track the company.</p>
<p>I told her you'd reach out. Greta@sequoia.example.com.</p>
<p>Robin</p>`,
      },
    ],
  },
  {
    id: "demo-thread-investor-004",
    subject: "Board meeting, May 22, 10am PT",
    labelIds: ["Investors", PRIORITY.IMPORTANT],
    priorityReason:
      "Upcoming board meeting with a pre-read deadline and customer section requirements.",
    messages: [
      {
        from: DAVID_HONG,
        at: { days: 9, time: "13:00" },
        html: `<p>Calendar invite incoming for the next board meeting: <strong>May 22, 10am PT, Zoom + our office for in-person.</strong></p>
<p>Pre-read deadline: 48h prior. Standard format. Please include the cash position, hiring, and a deeper customer section.</p>
<p>David</p>`,
      },
    ],
  },
  {
    id: "demo-thread-investor-005",
    subject: "Re: Series A timing",
    labelIds: ["Investors"],
    archived: true,
    messages: [
      {
        from: DAVID_HONG,
        at: { days: 20, time: "14:30" },
        html: `<p>John, quick reply on Series A timing. My read: you've got 14+ months runway, growth is accelerating, and the comps in this space are good right now. I'd start partner conversations in Q3 with the aim of running a process in Q4.</p>
<p>Not urgent, but worth getting on radar of the funds you'd want to talk to.</p>
<p>David</p>`,
      },
    ],
  },
  {
    id: "demo-thread-investor-006",
    subject: "Re: April update, questions",
    labelIds: ["Investors"],
    messages: [
      {
        from: ROBIN_TATE,
        at: { days: 11, time: "10:15" },
        html: `<p>Thanks for the update, John. Couple of questions:</p>
<ul>
  <li>Logo churn 0 again: is that real or are we just early?</li>
  <li>What was the catalyst for the Globex expansion?</li>
  <li>Founding AE: any leading candidates yet?</li>
</ul>
<p>Robin</p>`,
      },
    ],
  },
  {
    id: "demo-thread-investor-007",
    subject: "Customer reference call with Globex CTO",
    labelIds: ["Investors"],
    messages: [
      {
        from: DAVID_HONG,
        at: { days: 6, time: "12:45" },
        html: `<p>One of our LPs is doing diligence on the analytics space and asked for a customer reference. Can we set up a 30-min call with Globex's CTO? Happy to do it on a weekend if needed.</p>
<p>David</p>`,
      },
    ],
  },
  {
    id: "demo-thread-investor-008",
    subject: "Re: 409A valuation",
    labelIds: ["Investors"],
    archived: true,
    messages: [
      {
        from: {
          name: "Carta",
          email: "no-reply@carta.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 22, time: "08:00" },
        html: `<p>Your 409A valuation report is ready: $0.42/share (up from $0.31 at last valuation). PDF in the Carta dashboard.</p>`,
      },
    ],
  },
];
