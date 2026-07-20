import type { DemoThreadSpec } from "./helpers";
import { MARCUS_WEBB, ALEX_KIM, RILEY_NGUYEN, GRACE_OKAFOR, JAMIE_PARK } from "./people";
import { PRIORITY } from "./labels";

export const HIRING_THREADS: DemoThreadSpec[] = [
  {
    id: "demo-thread-hiring-001",
    subject: "Senior Backend Engineer, interested in ACME",
    labelIds: ["Hiring/Eng"],
    messages: [
      {
        from: MARCUS_WEBB,
        at: { days: 0, time: "07:02" },
        isRead: false,
        html: `<p>Hi John,</p>
<p>Saw the ACME engineering blog post on your Postgres scaling work. Really impressive, especially the read-replica routing layer.</p>
<p>I'm a Sr. Backend Engineer (8y at Stripe, Plaid) and I'd love to talk about the Platform team role. CV attached. Available for a chat any time next week.</p>
<p>Marcus</p>`,
        attachments: [
          {
            filename: "marcus-webb-resume.pdf",
            mimeType: "application/pdf",
            size: 154_000,
          },
        ],
      },
    ],
  },
  {
    id: "demo-thread-hiring-002",
    subject: "Re: Founding AE candidate, Riley Nguyen",
    labelIds: ["Hiring/GTM"],
    messages: [
      {
        from: ALEX_KIM,
        at: { days: 2, time: "10:15" },
        html: `<p>John,</p>
<p>Strongest founding AE candidate I've seen this quarter. Riley sold the first $4M ARR at Vega (analytics) and was second engineer in at their seed-stage gig before that. Looking for a player-coach role.</p>
<p>Her resume + a quick blurb attached. Worth a 30-minute intro this week?</p>
<p>Alex</p>`,
        attachments: [
          {
            filename: "riley-nguyen-resume.pdf",
            mimeType: "application/pdf",
            size: 132_000,
          },
        ],
      },
      {
        from: "me",
        to: ALEX_KIM.email,
        at: { days: 1, time: "17:08" },
        html: `<p>Hot. Yes please, can you intro? Earliest slot Thursday or Friday afternoon PT.</p>
<p>- John</p>`,
      },
      {
        from: RILEY_NGUYEN,
        at: { days: 0, time: "10:30" },
        isRead: false,
        html: `<p>Hi John,</p>
<p>Alex passed along your note, great to e-meet. Friday at 2pm PT works for me. I'll send a Zoom unless you prefer to use ACME's tooling.</p>
<p>Excited to chat.</p>
<p>Riley</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-003",
    subject: "Quick chat about the Design Engineer role?",
    labelIds: ["Hiring/Eng"],
    messages: [
      {
        from: GRACE_OKAFOR,
        at: { days: 1, time: "12:48" },
        isRead: false,
        html: `<p>Hi John,</p>
<p>Came across the Design Engineer posting via the React Bay Area Slack. I've spent the last 3 years on the design systems team at Linear and I'm itching to do greenfield work at an earlier-stage company.</p>
<p>Portfolio: <a href="https://grace.example.com">grace.example.com</a>. Happy to share the case study on Linear's design tokens migration if useful.</p>
<p>Grace</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-004",
    subject: "Re: Marcus Webb phone screen feedback",
    labelIds: ["Hiring/Eng"],
    messages: [
      {
        from: JAMIE_PARK,
        at: { days: 4, time: "15:08" },
        html: `<p>Did the phone screen with Marcus this morning. Notes:</p>
<ul>
  <li>+ Deep Postgres knowledge, immediately spotted the partition issue</li>
  <li>+ Walked through Stripe's idempotency design thoughtfully</li>
  <li>~ Less excited about prod ownership / on-call. Said "ideally a platform role without rotation"</li>
  <li>+ Asked good questions about our culture</li>
</ul>
<p>Recommend moving forward to onsite, but flag the on-call thing early.</p>
<p>Jamie</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-005",
    subject: "Offer letter for Riley Nguyen, final review",
    labelIds: ["Hiring/GTM", PRIORITY.NEEDS_REPLY],
    messages: [
      {
        from: ALEX_KIM,
        at: { days: 0, time: "14:11" },
        isRead: false,
        html: `<p>John,</p>
<p>Riley's offer letter attached. $185k base / $185k OTE / 0.45% equity. She countered on equity (asked for 0.6%). I told her you'd come back today. Worth countering at 0.5%?</p>
<p>Alex</p>`,
        attachments: [
          {
            filename: "riley-nguyen-offer-v2.pdf",
            mimeType: "application/pdf",
            size: 88_000,
          },
        ],
      },
    ],
  },
  {
    id: "demo-thread-hiring-006",
    subject: "Interview debrief: Grace Okafor",
    labelIds: ["Hiring/Eng"],
    messages: [
      {
        from: {
          name: "Lena Ortiz",
          email: "lena@acme.example.com",
          photoUrl: "/demo/avatars/lena-ortiz.svg",
        },
        at: { days: 6, time: "18:00" },
        html: `<p>Team, quick debrief on Grace:</p>
<p><strong>Strong yes from me.</strong> Walked us through the Linear design tokens migration in real depth, and the take-home redesign of our settings page is honestly better than what's in prod.</p>
<p>What did everyone else think?</p>
<p>Lena</p>`,
      },
      {
        from: JAMIE_PARK,
        at: { days: 6, time: "19:14" },
        html: `<p>Strong yes. Best React fluency I've seen in an interview, and she pushed back on a couple of API choices in ways that actually made the design better.</p>
<p>Jamie</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-007",
    subject: "Resume: Senior Solutions Engineer",
    labelIds: ["Hiring/GTM"],
    messages: [
      {
        from: {
          name: "Diego Alvarez",
          email: "diego.alvarez@example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 5, time: "08:30" },
        html: `<p>Hi John,</p>
<p>Saw the SE posting. 6 years SE experience (Snowflake → Hightouch), focused on enterprise data infra accounts. Resume attached. Happy to chat.</p>
<p>Diego</p>`,
        attachments: [
          {
            filename: "diego-alvarez-resume.pdf",
            mimeType: "application/pdf",
            size: 168_000,
          },
        ],
      },
    ],
  },
  {
    id: "demo-thread-hiring-008",
    subject: "Re: Reference call for Marcus Webb",
    labelIds: ["Hiring/Eng"],
    archived: true,
    messages: [
      {
        from: {
          name: "Priya Iyer",
          email: "priya.iyer@plaid.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 7, time: "13:00" },
        html: `<p>Hi John, happy to be a reference for Marcus. Free for a 15-min call Friday 10am PT?</p>
<p>Priya (Eng Manager at Plaid, ex-direct manager)</p>`,
      },
      {
        from: "me",
        to: "priya.iyer@plaid.example.com",
        at: { days: 7, time: "13:18" },
        html: `<p>Friday 10am works. I'll send an invite. Thanks!</p>
<p>John</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-009",
    subject: "Following up on the engineering manager opening",
    labelIds: [],
    messages: [
      {
        from: {
          name: "Sofia Chen",
          email: "sofia.chen@example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 12, time: "11:00" },
        html: `<p>Hi John,</p>
<p>Following up on my email from last week about the eng manager opening. I'd love a quick conversation if the role is still open.</p>
<p>Sofia (currently leading platform infra at Datadog)</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-010",
    subject: "Resume: Designer with HCI background",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: {
          name: "Aria Khan",
          email: "aria.khan@example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 15, time: "15:30" },
        html: `<p>Hi, applying for the Senior Designer role. PhD in HCI from CMU, 4y at Airbnb on the search team. Resume + portfolio link attached.</p>
<p>Aria</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-011",
    subject: "Interview scheduling for Grace Okafor final round",
    labelIds: ["Hiring/Eng"],
    messages: [
      {
        from: GRACE_OKAFOR,
        at: { days: 1, time: "08:30" },
        html: `<p>Hi John, looking forward to the final round. The scheduling tool is showing Tuesday and Thursday slots; I prefer Thursday afternoon if it's open. Otherwise Tuesday morning works.</p>
<p>Grace</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-012",
    subject: "Sourcing list: Founding Engineer pipeline",
    labelIds: ["Hiring/Eng"],
    messages: [
      {
        from: ALEX_KIM,
        at: { days: 3, time: "11:30" },
        html: `<p>John,</p>
<p>Updated sourcing list for the founding engineer slot: 14 active candidates, 6 phone screens scheduled. Sheet attached.</p>
<p>Top 3 to focus on: Marcus Webb (Plaid), Lior Ben-David (Vercel infra), Yuki Tanaka (Cloudflare workers).</p>
<p>Alex</p>`,
        attachments: [
          {
            filename: "sourcing-list-founding-eng.xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size: 56_000,
          },
        ],
      },
    ],
  },
  {
    id: "demo-thread-hiring-013",
    subject: "Declining, going with another offer",
    labelIds: [],
    archived: true,
    messages: [
      {
        from: {
          name: "Theo Park",
          email: "theo.park@example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 20, time: "09:00" },
        html: `<p>Hi John,</p>
<p>Thanks so much for the offer and for the time you spent with me. After a lot of thought I've decided to go with another offer that's closer to my family in Seattle.</p>
<p>Really enjoyed meeting the team. Would love to keep in touch.</p>
<p>Theo</p>`,
      },
    ],
  },
  {
    id: "demo-thread-hiring-014",
    subject: "Re: Marcus Webb, final decision?",
    labelIds: ["Hiring/Eng", PRIORITY.IMPORTANT],
    priorityReason:
      "Marcus has a competing offer expiring soon and John needs to make the final hiring call today.",
    isStarred: true,
    messages: [
      {
        from: JAMIE_PARK,
        at: { days: 0, time: "11:50" },
        isRead: false,
        html: `<p>John, we need to make a call on Marcus today. He's got an offer from Stripe expiring Friday.</p>
<p>My read: strong technical, weak on the prod ownership piece. We can either move fast on a competitive offer or pass and stay focused on the other candidates.</p>
<p>Your call.</p>
<p>Jamie</p>`,
      },
    ],
  },
];
