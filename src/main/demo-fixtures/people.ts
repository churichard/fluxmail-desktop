/**
 * Recurring cast of senders for the demo inbox. Keeping a fixed cast makes the
 * inbox feel "lived in" because the same people show up across multiple threads.
 *
 * Every address is under a `.example.com` domain (RFC 2606 reserved), so none
 * of them can ever be a real mailbox.
 */

export interface DemoPerson {
  name: string;
  email: string;
  /** Path under /public, served as a static avatar. */
  photoUrl: string;
}

function avatar(slug: string): string {
  return `/demo/avatars/${slug}.svg`;
}

// --- Customers / prospects ---
export const SARAH_CHEN: DemoPerson = {
  name: "Sarah Chen",
  email: "sarah.chen@northwindlabs.example.com",
  photoUrl: avatar("sarah-chen"),
};
export const BILL_LUMBERGH: DemoPerson = {
  name: "Bill Lumbergh",
  email: "bill.lumbergh@initech.example.com",
  photoUrl: avatar("bill-lumbergh"),
};
export const CHEN_LIU: DemoPerson = {
  name: "Chen Liu",
  email: "chen.liu@globex.example.com",
  photoUrl: avatar("chen-liu"),
};
export const DANA_WHITFIELD: DemoPerson = {
  name: "Dana Whitfield",
  email: "dana.whitfield@umbrellaco.example.com",
  photoUrl: avatar("dana-whitfield"),
};
export const TOM_REYES: DemoPerson = {
  name: "Tom Reyes",
  email: "tom.reyes@hooli.example.com",
  photoUrl: avatar("tom-reyes"),
};
export const NINA_PATEL: DemoPerson = {
  name: "Nina Patel",
  email: "nina.patel@wonkaindustries.example.com",
  photoUrl: avatar("nina-patel"),
};

// --- Investors ---
export const DAVID_HONG: DemoPerson = {
  name: "David Hong",
  email: "david@horizonvc.example.com",
  photoUrl: avatar("david-hong"),
};
export const ROBIN_TATE: DemoPerson = {
  name: "Robin Tate",
  email: "robin@summitventures.example.com",
  photoUrl: avatar("robin-tate"),
};

// --- ACME team (john's company) ---
export const JAMIE_PARK: DemoPerson = {
  name: "Jamie Park",
  email: "jamie@acme.example.com",
  photoUrl: avatar("jamie-park"),
};
export const PRIYA_RAMAN: DemoPerson = {
  name: "Priya Raman",
  email: "priya@acme.example.com",
  photoUrl: avatar("priya-raman"),
};
export const LENA_ORTIZ: DemoPerson = {
  name: "Lena Ortiz",
  email: "lena@acme.example.com",
  photoUrl: avatar("lena-ortiz"),
};
export const SAM_PATEL: DemoPerson = {
  name: "Sam Patel",
  email: "sam@acme.example.com",
  photoUrl: avatar("sam-patel"),
};
export const MARCUS_OByrne: DemoPerson = {
  name: "Marcus O'Byrne",
  email: "marcus@acme.example.com",
  photoUrl: avatar("marcus-obyrne"),
};

// --- Recruiting: candidates & recruiters ---
export const MARCUS_WEBB: DemoPerson = {
  name: "Marcus Webb",
  email: "marcus.webb@example.com",
  photoUrl: avatar("marcus-webb"),
};
export const ALEX_KIM: DemoPerson = {
  name: "Alex Kim",
  email: "alex.kim@talentbridge.example.com",
  photoUrl: avatar("alex-kim"),
};
export const RILEY_NGUYEN: DemoPerson = {
  name: "Riley Nguyen",
  email: "riley.nguyen@example.com",
  photoUrl: avatar("riley-nguyen"),
};
export const GRACE_OKAFOR: DemoPerson = {
  name: "Grace Okafor",
  email: "grace.okafor@example.com",
  photoUrl: avatar("grace-okafor"),
};

// --- Personal ---
export const MOM: DemoPerson = {
  name: "Mom",
  email: "mom@example.com",
  photoUrl: avatar("mom"),
};
export const DENTIST: DemoPerson = {
  name: "Bright Smile Dental",
  email: "appointments@brightsmile.example.com",
  photoUrl: avatar("generic-org"),
};

// --- Automated / no-reply senders (newsletters & notifications) ---
export const STRIPE: DemoPerson = {
  name: "Stripe",
  email: "noreply@stripe.example.com",
  photoUrl: avatar("stripe"),
};
export const LINEAR: DemoPerson = {
  name: "Linear",
  email: "notifications@linear.example.com",
  photoUrl: avatar("linear"),
};
export const VERCEL: DemoPerson = {
  name: "Vercel",
  email: "no-reply@vercel.example.com",
  photoUrl: avatar("vercel"),
};
export const GITHUB: DemoPerson = {
  name: "GitHub",
  email: "notifications@github.example.com",
  photoUrl: avatar("github"),
};
export const TLDR_NEWSLETTER: DemoPerson = {
  name: "TLDR",
  email: "dan@tldr.example.com",
  photoUrl: avatar("tldr"),
};
export const FIGMA: DemoPerson = {
  name: "Figma",
  email: "updates@figma.example.com",
  photoUrl: avatar("figma"),
};
export const NOTION: DemoPerson = {
  name: "Notion",
  email: "team@notion.example.com",
  photoUrl: avatar("notion"),
};
export const AWS: DemoPerson = {
  name: "Amazon Web Services",
  email: "no-reply@aws.example.com",
  photoUrl: avatar("aws"),
};
export const CALENDLY: DemoPerson = {
  name: "Calendly",
  email: "notifications@calendly.example.com",
  photoUrl: avatar("calendly"),
};
export const ZOOM: DemoPerson = {
  name: "Zoom",
  email: "no-reply@zoom.example.com",
  photoUrl: avatar("zoom"),
};
