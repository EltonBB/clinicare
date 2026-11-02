export const common = {
  language: {
    label: "Language",
  },
  logOut: "Log out",
  showPassword: "Show password",
  hidePassword: "Hide password",
  errors: {
    title: "Something went wrong",
    titleRest: "on our side.",
    copy: "Please try again. If it keeps happening, contact support and we'll look into it.",
    tryAgain: "Try again",
    backHome: "Back to home",
    pageTitle: "This page didn't load",
    pageCopy: "Please try again. If it keeps happening, contact support.",
    backToDashboard: "Back to dashboard",
    notFoundTitle: "We couldn't find that",
    notFoundCopy: "This record may have been removed, or the link is out of date.",
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
