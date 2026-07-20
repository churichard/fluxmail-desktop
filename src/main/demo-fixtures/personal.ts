import type { DemoThreadSpec } from "./helpers";
import { MOM, DENTIST } from "./people";

export const PERSONAL_THREADS: DemoThreadSpec[] = [
  {
    id: "demo-thread-personal-001",
    subject: "Mother's Day plans?",
    labelIds: ["CATEGORY_PERSONAL"],
    messages: [
      {
        from: MOM,
        at: { days: 2, time: "19:30" },
        html: `<p>Hi sweetie, your dad and I were thinking of coming up this weekend if you're around. Don't worry about cooking, we can grab dinner at that Italian place you like. Let me know!</p>
<p>Love,<br/>Mom</p>`,
      },
      {
        from: "me",
        to: MOM.email,
        at: { days: 1, time: "21:00" },
        html: `<p>Sounds great mom. Saturday works. Book the 7pm at Sotto if you can. Love you both!</p>
<p>John</p>`,
      },
    ],
  },
  {
    id: "demo-thread-personal-002",
    subject: "Cleaning reminder: Wednesday 10am",
    labelIds: ["CATEGORY_PERSONAL"],
    archived: true,
    messages: [
      {
        from: DENTIST,
        at: { days: 5, time: "08:00" },
        html: `<p>Hi John, this is a reminder of your dental cleaning appointment Wednesday at 10:00am. Reply YES to confirm or call us if you need to reschedule.</p>
<p>Bright Smile Dental</p>`,
      },
    ],
  },
  {
    id: "demo-thread-personal-003",
    subject: "House paint quote",
    labelIds: ["CATEGORY_PERSONAL"],
    archived: true,
    messages: [
      {
        from: {
          name: "Sunrise Painting",
          email: "jorge@sunrisepainting.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 9, time: "14:30" },
        html: `<p>Hi John,</p>
<p>Quote for exterior paint job, attached. Two coats, includes prep + minor stucco repair. Estimated 4 days of work.</p>
<p>Total: $7,840. Valid for 30 days.</p>
<p>Jorge</p>`,
      },
    ],
  },
  {
    id: "demo-thread-personal-004",
    subject: "Flight confirmation: SFO → BOS, May 23",
    labelIds: ["CATEGORY_PERSONAL"],
    archived: true,
    messages: [
      {
        from: {
          name: "United Airlines",
          email: "no-reply@united.example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 6, time: "11:00" },
        html: `<p>Your booking is confirmed.</p>
<p><strong>Outbound:</strong> SFO → BOS, May 23, 7:25am, UA 256<br/>
<strong>Return:</strong> BOS → SFO, May 26, 4:10pm, UA 257</p>
<p>Confirmation #: NWS2J8</p>`,
      },
    ],
  },
  {
    id: "demo-thread-personal-005",
    subject: "Cycling weekend ride, Saturday 8am",
    labelIds: ["CATEGORY_PERSONAL"],
    messages: [
      {
        from: {
          name: "Marcus (cycling)",
          email: "marcus.r@example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 1, time: "08:14" },
        html: `<p>You in for Saturday's ride? Same route, Headlands → Pantoll → back. Should be 60mi, ~4hr. Starting from Sausalito ferry at 8:00.</p>
<p>Pace will be moderate. Sara is recovering from her ankle so we'll keep it conversational.</p>
<p>Marcus</p>`,
      },
    ],
  },
  {
    id: "demo-thread-personal-006",
    subject: "Re: Book club, June pick",
    labelIds: ["CATEGORY_PERSONAL"],
    archived: true,
    messages: [
      {
        from: {
          name: "Emma Sato",
          email: "emma.sato@example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 12, time: "20:00" },
        html: `<p>OK book club, June pick. I'm advocating for "The Wager" by David Grann. Strong second on "Tomorrow, and Tomorrow, and Tomorrow" if anyone hasn't read it yet. Votes by Sunday!</p>
<p>Emma</p>`,
      },
    ],
  },
  {
    id: "demo-thread-personal-007",
    subject: "Birthday next Saturday, you in?",
    labelIds: ["CATEGORY_PERSONAL"],
    messages: [
      {
        from: {
          name: "Alex Morrison",
          email: "alex.morrison@example.com",
          photoUrl: "/demo/avatars/generic-org.svg",
        },
        at: { days: 3, time: "21:30" },
        html: `<p>Hey John, having people over Saturday for my birthday, casual, drinks + grill around 6. Bring whoever, BYOB. Address is the same as last time. Hope you can make it!</p>
<p>Alex</p>`,
      },
    ],
  },
];
