import type { LegalSection } from "@/components/legal/legal-page";

export const legalLastUpdated = "May 1, 2026";

export const termsSections: LegalSection[] = [
  {
    title: "1. Agreement to these terms",
    body: [
      "These Terms of Service govern access to and use of Vela / Clinicare, including the web app, onboarding, clinic workspace, appointment tools, client records, staff tools, messaging inbox, reminders, reports, and related services.",
      "By creating an account, using the service, or using the service on behalf of a clinic or business, you confirm that you can enter into this agreement and bind that clinic or business to these terms.",
    ],
  },
  {
    title: "2. What Vela provides",
    body: [
      "Vela is clinic operations software. It helps clinics manage clients, appointments, staff, clinic branding, messages, reminders, media, and performance reporting from one workspace.",
      "Vela is not a medical device, emergency service, clinical diagnosis tool, legal service, accounting service, or substitute for professional judgment. Clinics are responsible for the services they provide to their own clients and patients.",
    ],
  },
  {
    title: "3. Accounts and clinic responsibilities",
    body: [
      "You are responsible for keeping account access secure, inviting only authorized staff, using accurate clinic information, and promptly removing staff access when it is no longer needed.",
      "You are responsible for obtaining any permissions, consents, notices, and lawful bases required to collect, store, message, upload, or otherwise process client or patient information through Vela.",
    ],
  },
  {
    title: "4. Client data, media, and messaging",
    body: [
      "Clinics may upload or enter client contact details, appointment history, notes, messages, images, logos, and other operational records. The clinic remains responsible for the content and accuracy of that information.",
      "Messaging and reminder tools depend on the clinic's configuration, third-party messaging networks, phone availability, and recipient permissions. Delivery times, carrier handling, and recipient behavior cannot be guaranteed.",
    ],
  },
  {
    title: "5. AI and reports",
    body: [
      "Reports may include AI-assisted analysis and rule-based insights based on available appointment, client, staffing, messaging, and operating-hour data. These insights are operational guidance only.",
      "AI output may be incomplete, unavailable, delayed, or inaccurate. Clinics should review all recommendations before acting and should not rely on Vela reports as medical, legal, financial, or regulatory advice.",
    ],
  },
  {
    title: "6. Acceptable use",
    body: [
      "You may not use Vela to break the law, violate client privacy, send unlawful or unwanted messages, upload malicious files, reverse engineer the service, interfere with platform security, scrape the service, or access another clinic's workspace without authorization.",
      "We may suspend or limit access if we reasonably believe an account creates security, privacy, payment, abuse, or legal risk.",
    ],
  },
  {
    title: "7. Subscriptions, billing, and cancellation",
    body: [
      "Paid plans are billed according to the plan, billing cycle, currency, and checkout terms shown when the clinic subscribes or upgrades. Taxes, payment processing fees, and messaging provider charges may apply where relevant.",
      "A clinic may cancel its subscription according to the account or billing controls available in the app or by contacting support. Cancellation stops future renewal charges but does not automatically refund prior paid periods unless our Refund Policy says otherwise.",
    ],
  },
  {
    title: "8. Service changes and availability",
    body: [
      "We may improve, modify, add, or remove features as the product develops. We aim to keep core clinic workflows stable, but no cloud service can guarantee uninterrupted availability.",
      "The service may be affected by maintenance, third-party providers, internet issues, messaging networks, hosting providers, browser behavior, or circumstances outside our control.",
    ],
  },
  {
    title: "9. Intellectual property",
    body: [
      "Vela, Clinicare, the app design, software, workflows, text, reports, and product materials are owned by us or our licensors. These terms give you the right to use the service, not ownership of the service itself.",
      "Your clinic keeps ownership of the information and media it enters into the service. You give us permission to host, process, display, transmit, back up, and otherwise handle that content as needed to provide and improve the service.",
    ],
  },
  {
    title: "10. Limits of liability",
    body: [
      "To the maximum extent permitted by law, Vela is provided without warranties that it will be uninterrupted, error-free, or fit for every clinic's specific regulatory needs.",
      "To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost revenue, lost goodwill, or business interruption arising from use of the service.",
    ],
  },
  {
    title: "11. Termination and data export",
    body: [
      "Either you or we may end access as allowed by these terms. After termination, account access may be limited and data may be retained or deleted according to our Privacy Policy, backup cycles, legal obligations, and operational needs.",
      "Before cancellation or termination, clinics should export or copy information they need to keep for clinical, legal, tax, or business records.",
    ],
  },
  {
    title: "12. Changes to these terms",
    body: [
      "We may update these terms as the product, legal requirements, or business needs change. If an update materially affects your rights or responsibilities, we will take reasonable steps to notify account owners.",
      "Continuing to use Vela after updated terms become effective means you accept the updated terms.",
    ],
  },
];

export const privacySections: LegalSection[] = [
  {
    title: "1. Overview",
    body: [
      "This Privacy Policy explains how Vela / Clinicare collects, uses, stores, and shares information when clinics and their staff use the service.",
      "Clinics control the client and patient information they enter into Vela. Vela processes that information to provide the software, support the account, maintain security, and operate the product.",
    ],
  },
  {
    title: "2. Information we collect",
    body: [
      "We collect account information such as names, email addresses, login details, clinic names, clinic type, staff records, branding choices, settings, plan information, and support communications.",
      "Clinics may store client information such as names, contact details, appointment history, notes, messages, uploaded images, captions, reminder records, and other clinic workflow data.",
      "We also collect technical information such as device, browser, IP address, session, security, usage, error, and performance data needed to run, protect, and improve the service.",
    ],
  },
  {
    title: "3. How we use information",
    body: [
      "We use information to create and secure accounts, provide clinic workspaces, show client and staff records, schedule appointments, support reminders and messaging, generate reports, resolve support requests, prevent abuse, and maintain the service.",
      "We may use aggregated or de-identified operational data to understand product performance and improve features. We do not sell clinic client records.",
    ],
  },
  {
    title: "4. Sensitive clinic and client information",
    body: [
      "Because clinics may enter health, wellness, appointment, or other sensitive client information, clinics must decide what information belongs in Vela and must provide any notices or obtain any consents required by applicable law.",
      "Clinics are responsible for configuring staff access, maintaining accurate records, responding to client requests, and complying with professional, privacy, healthcare, and messaging rules that apply to their business.",
    ],
  },
  {
    title: "5. AI-assisted reports",
    body: [
      "Reports may use clinic operational metrics to generate AI-assisted analysis, diagnosis, recommendations, or rule-based fallback guidance. These features are designed to support operational decision-making, not clinical decisions.",
      "We limit report prompts to the information needed to produce the feature. Clinics should avoid entering unnecessary sensitive details into free-text fields when they are not needed for operations.",
    ],
  },
  {
    title: "6. Service providers",
    body: [
      "We use trusted service providers for hosting, database, authentication, storage, email, messaging, analytics, AI processing, monitoring, payments, and support. These providers process information only as needed to provide their services to us.",
      "Provider availability, data locations, and subprocessors may change over time as the product develops. We aim to choose providers appropriate for a modern SaaS clinic workspace.",
    ],
  },
  {
    title: "7. Security",
    body: [
      "We use technical and organizational safeguards designed to protect information, including authenticated access, workspace separation, private media storage, signed media access, and operational monitoring.",
      "No method of transmission or storage is completely secure. Clinics should use strong passwords, protect staff devices, limit access to authorized staff, and contact us promptly if they suspect unauthorized access.",
    ],
  },
  {
    title: "8. Data retention",
    body: [
      "We retain account and clinic information for as long as needed to provide the service, meet legal or accounting obligations, resolve disputes, enforce agreements, maintain backups, and support security.",
      "After cancellation or deletion, some information may remain in backups, logs, billing records, or legal records for a limited period before deletion according to our operational processes.",
    ],
  },
  {
    title: "9. Access, correction, deletion, and export",
    body: [
      "Account owners may request access, correction, deletion, or export of account information by contacting support. We may need to verify the request before acting.",
      "Requests involving client or patient data should normally be directed to the clinic that controls that data. We may redirect individual client requests to the clinic unless the law requires a different response.",
    ],
  },
  {
    title: "10. International use",
    body: [
      "Vela may be accessed from different countries, and service providers may process information in countries other than where a clinic or client is located.",
      "Clinics are responsible for confirming that their use of Vela is appropriate for their location, profession, and client base.",
    ],
  },
  {
    title: "11. Children",
    body: [
      "Vela is intended for clinics and appointment-based businesses, not for children to create their own accounts.",
      "If a clinic stores information about minors, the clinic is responsible for obtaining appropriate guardian consent and complying with applicable rules.",
    ],
  },
  {
    title: "12. Privacy updates",
    body: [
      "We may update this Privacy Policy to reflect product, provider, legal, or operational changes. The updated version will show a new last updated date.",
      "For material changes, we will take reasonable steps to notify account owners through the service, email, or another appropriate channel.",
    ],
  },
];

export const refundSections: LegalSection[] = [
  {
    title: "1. Overview",
    body: [
      "This Refund Policy explains how cancellations, refunds, trials, plan changes, and billing issues are handled for Vela / Clinicare subscriptions.",
      "We want billing to be clear and fair, while keeping the policy practical for a cloud software service that provides immediate account access and ongoing infrastructure.",
    ],
  },
  {
    title: "2. Trials and first paid period",
    body: [
      "If Vela offers a free trial, the trial terms shown during signup or checkout apply. A clinic can cancel before the trial ends to avoid the first subscription charge.",
      "For a first paid subscription period, clinics may request a refund within 7 days of the first charge if the workspace has not been used for live clinic operations, messaging, or significant data storage.",
    ],
  },
  {
    title: "3. Subscription renewals",
    body: [
      "Renewal payments are generally non-refundable once a billing period begins. This applies to monthly and annual plans unless required by law or unless we approve an exception.",
      "Canceling a subscription stops future renewals. It does not automatically refund the current billing period, and access may continue until the end of the paid period unless the account is terminated for abuse or legal risk.",
    ],
  },
  {
    title: "4. Annual plans and plan changes",
    body: [
      "Annual plans are discounted in exchange for a longer commitment and are generally non-refundable after the first 7 days of the initial annual charge.",
      "If a clinic upgrades, downgrades, or changes plans, billing adjustments may be prorated, credited, or applied at renewal depending on the checkout flow and billing provider configuration.",
    ],
  },
  {
    title: "5. Setup, messaging, and provider costs",
    body: [
      "One-time setup services, migration work, custom configuration, messaging usage, payment processing fees, carrier fees, and third-party provider charges are not refundable unless we expressly state otherwise.",
      "If a third-party messaging or payment provider rejects, delays, or charges for a transaction, that provider's rules may also apply.",
    ],
  },
  {
    title: "6. Service problems",
    body: [
      "If a serious service issue prevents normal use of paid core features, contact support with details. We may provide a fix, workaround, account credit, partial refund, or other remedy at our discretion.",
      "Refunds are not normally provided for issues caused by clinic configuration, unsupported browsers, local network problems, third-party account restrictions, unavailable messaging recipients, or failure to cancel before renewal.",
    ],
  },
  {
    title: "7. Duplicate or mistaken charges",
    body: [
      "If you believe a charge is duplicate, mistaken, fraudulent, or applied to the wrong account, contact support as soon as possible with the account email, clinic name, charge date, amount, and any payment receipt.",
      "Verified duplicate or mistaken charges will be refunded or credited using the original payment method where possible.",
    ],
  },
  {
    title: "8. How to request a refund",
    body: [
      "Refund requests must be sent to support@clinicare-vela.space from an account owner or authorized billing contact.",
      "Include the clinic name, account email, payment date, amount, reason for the request, and any supporting information. We may ask for additional verification before processing the request.",
    ],
  },
  {
    title: "9. Processing time",
    body: [
      "Approved refunds are usually submitted to the payment processor within 10 business days. Banks and card providers may take additional time to post the refund.",
      "Refunds are normally returned to the original payment method. If that is not possible, we may offer an account credit or another legally permitted method.",
    ],
  },
  {
    title: "10. Policy changes",
    body: [
      "We may update this Refund Policy as our pricing, plan structure, payment providers, or product changes.",
      "The policy in effect at the time of the relevant charge will usually apply unless the updated policy is more favorable to the customer or applicable law requires otherwise.",
    ],
  },
];
