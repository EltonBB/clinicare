export const common = {
  language: {
    label: "Language",
  },
  meta: {
    description: "Modern client and appointment management for service businesses.",
  },
  // Plan copy shared by the website, checkout, Settings › Billing and the Pro locks.
  plans: {
    perMonth: "per month",
    perYear: "per year",
    basic: {
      description: "For solo practitioners and small clinics that need one clean daily workspace.",
      audience: "Best for a clinic starting with scheduling, records, and daily operations.",
      features: [
        "Calendar and appointment pages",
        "Client records and notes",
        "Documents, images, and scans",
        "Payments and invoice tracking",
        "WhatsApp-ready inbox context",
        "A reminder before each visit and a thank-you after, sent automatically",
        "A daily dashboard of visits, revenue, and today's schedule",
      ],
    },
    pro: {
      description: "For growing clinics that need deeper intelligence, team visibility, and stronger support.",
      audience: "Best for clinics that want reporting, staff visibility, and launch support.",
      // The first line is the "Everything in Basic" connector; the rest is what Pro adds.
      features: [
        "Everything in Basic",
        "Reports with AI-assisted operational insights",
        "Staff activity and utilization",
        "No-show tracking, reporting, risk alerts, automatic slot-offer drafts from your waiting list, and rebooking nudges",
        "More workflow automation",
        "Priority setup support",
        "Launch-ready clinic operations",
      ],
    },
  },
};
