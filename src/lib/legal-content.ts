import type { LegalSection } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "./public-contact";

export const legalLastUpdated = "October 26, 2026";

/**
 * Who provides Vela: Paddle's domain review and GDPR both require the legal
 * entity's name and registered address on these pages. Filled in by the owner;
 * legal-content.test.ts fails while either is still a placeholder.
 */
export const LEGAL_ENTITY = {
  name: "[Legal entity name]",
  address: "[Registered address]",
};

/** Paddle's required Merchant of Record wording, verbatim. */
export const MERCHANT_OF_RECORD_NOTICE =
  "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders.";

export const termsSections: LegalSection[] = [
  {
    title: "1. Agreement to these terms",
    body: [
      `Vela / Clinicare is provided by ${LEGAL_ENTITY.name}, ${LEGAL_ENTITY.address} ("we", "us"). When you use Vela, your agreement is with us.`,
      "These Terms of Service govern access to and use of Vela / Clinicare, including the web app, the Vela Staff mobile app, onboarding, clinic workspace, appointment tools, client records, staff tools, messaging inbox, reminders, reports, and related services.",
      "By creating an account, using the service, or using the service on behalf of a clinic or business, you confirm that you can enter into this agreement and bind that clinic or business to these terms. Continuing to use Vela means you agree to these terms.",
    ],
  },
  {
    title: "2. What Vela provides",
    body: [
      "Vela is clinic operations software. It helps clinics manage clients, appointments, staff, clinic branding, messages, reminders, media, and performance reporting from one workspace.",
      "Vela is not a medical device, emergency service, clinical decision-support tool, legal service, accounting service, or substitute for professional judgment. Clinics are responsible for the services they provide to their own clients and patients.",
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
      "You may not use Vela to break the law, commit fraud, send spam or other unlawful or unwanted messages, violate client privacy, infringe anyone's intellectual property, upload malicious files, reverse engineer the service, probe or interfere with platform security, scrape the service, or access another clinic's workspace without authorization.",
      "We may suspend or limit access if we reasonably believe an account creates security, privacy, fraud, payment, abuse, or legal risk, or after repeated or serious breaches of these terms.",
    ],
  },
  {
    title: "7. Plans, free trials, billing, and cancellation",
    body: [
      `${MERCHANT_OF_RECORD_NOTICE} Paddle handles payment, invoices, and sales tax, and its buyer terms also apply to your purchase.`,
      "Vela is offered as Basic and Pro plans, billed monthly or yearly. The price, currency, and billing period are shown before you pay, and prices include VAT or the sales tax that applies where you are.",
      "Every plan starts with a 14-day free trial, once per clinic. A payment card is required to start it, and nothing is charged during the trial. Unless you cancel before the trial ends, your subscription begins and the card is charged automatically. You will be reminded by email before the trial ends.",
      "Subscriptions renew automatically at the end of each billing period until cancelled. You can cancel any time in Settings › Billing; cancellation takes effect at the end of the current period or trial, and you keep full access until then.",
      "You can change plan or billing period in Settings › Billing, and a change takes effect immediately. A move to a higher plan is charged for the rest of the current period, and a move to a lower plan is credited to your next bill. Switching between monthly and yearly starts a new billing period that day: you pay for it then, less the unused part of the old one. During a free trial, nothing is charged until the trial ends.",
      "If a payment fails, it is retried for a period of time and you can update your card in Settings › Billing. If payment is not completed, the subscription ends.",
    ],
  },
  {
    title: "8. Service changes and availability",
    body: [
      "We may improve, modify, add, or remove features as the product develops. We aim to keep core clinic workflows stable, but no cloud service can guarantee uninterrupted or error-free availability.",
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
    title: "11. When a plan ends, suspension, and termination",
    body: [
      "When a subscription ends (cancelled, or unpaid after retries), the workspace becomes read-only: you can still sign in and view and download your records, but you cannot add or change anything, and no messages are sent to your clients. Renewing the plan restores full access.",
      "We keep a read-only workspace's data for 90 days from the day the plan ended. After that it may be permanently deleted, except where we must keep certain records by law (for example billing records).",
      "We may suspend or end access for a material breach of these terms, non-payment, or a security or fraud risk. Either party may end this agreement as allowed by these terms. Before your plan ends, export or copy any information you need to keep for clinical, legal, tax, or business records.",
    ],
  },
  {
    title: "12. Changes to these terms",
    body: [
      "We may update these terms as the product, legal requirements, or business needs change. If an update materially affects your rights or responsibilities, we will take reasonable steps to notify account owners.",
      "Continuing to use Vela after updated terms become effective means you accept the updated terms.",
    ],
  },
  {
    title: "13. Contact",
    body: [`Questions about these terms: ${SUPPORT_EMAIL}. ${LEGAL_ENTITY.name}, ${LEGAL_ENTITY.address}.`],
  },
];

export const privacySections: LegalSection[] = [
  {
    title: "1. Who we are",
    body: [
      `This Privacy Policy explains how ${LEGAL_ENTITY.name}, ${LEGAL_ENTITY.address}, which provides Vela / Clinicare, collects, uses, stores, and shares information. For privacy questions or requests, contact ${SUPPORT_EMAIL}.`,
      "We are the controller of account, billing, and website information about clinic owners and their staff. Clinics control the client and patient information they enter into Vela; for that information the clinic is the controller, and we process it on the clinic's behalf to provide the software, support the account, maintain security, and operate the product.",
    ],
  },
  {
    title: "2. Information we collect",
    body: [
      "We collect account information such as names, email addresses, login details, clinic names, clinic type, staff records, branding choices, settings, plan and billing status, and support communications.",
      "Clinics may store client information such as names, contact details, appointment history, notes, messages, uploaded images, captions, reminder records, and other clinic workflow data.",
      "If a clinic gives its staff access to the Vela Staff mobile app, we also process what that app needs to work: staff access codes, registered devices, check-in and check-out times, notifications, and messages exchanged between staff and the clinic's administrators.",
      "We also collect technical information such as device, browser, IP address, session, security, usage, error, and performance data needed to run, protect, and improve the service.",
    ],
  },
  {
    title: "3. How we use information, and why we may",
    body: [
      "To provide the service you signed up for (accounts, workspaces, records, appointments, reminders, messaging, reports, support): this is necessary to perform our contract with you.",
      "To bill your subscription and keep billing records: necessary for the contract and to meet tax and accounting law.",
      "To secure the service, prevent abuse, and fix errors: our legitimate interest in running a safe, reliable product.",
      "To understand product performance with aggregated or de-identified data and improve features: our legitimate interest. We do not sell clinic client records.",
      "Where we ask for consent for something, you can withdraw it at any time.",
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
      "Reports may use clinic operational metrics to generate AI-assisted analysis, operational recommendations, or rule-based fallback guidance. These features are designed to support operational decision-making, not clinical decisions.",
      "We limit report prompts to the information needed to produce the feature. Clinics should avoid entering unnecessary sensitive details into free-text fields when they are not needed for operations.",
    ],
  },
  {
    title: "6. Who we share information with",
    body: [
      "Paddle.com, our reseller and Merchant of Record, processes payments, invoices, and sales tax. Paddle receives billing details such as the clinic owner's name, email, address, and payment information; it never receives client or patient records.",
      "We use trusted service providers for hosting, database, authentication, storage, email, messaging, AI processing, and error monitoring. They process information only on our instructions and only as needed to provide their services to us.",
      "We may also share information with professional advisers, and with authorities where the law requires it.",
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
      "We keep account and clinic information while the account is active. When a plan ends, the workspace becomes read-only and its data is kept for 90 days, then it may be permanently deleted.",
      "Billing records are kept for as long as tax and accounting law requires. Some information may remain in backups or security logs for a limited period before deletion according to our operational processes.",
    ],
  },
  {
    title: "9. Your rights",
    body: [
      `You can ask to access, correct, delete, or export your information, to restrict or object to how we use it, and to withdraw consent. Contact ${SUPPORT_EMAIL}; we answer within one month and may need to verify the request first.`,
      "You can also complain to your data protection supervisory authority.",
      "Requests involving client or patient data should normally be directed to the clinic that controls that data. We may redirect individual client requests to the clinic unless the law requires a different response.",
    ],
  },
  {
    title: "10. International transfers",
    body: [
      "Our main hosting and database run in the European Union. Some service providers may process information in other countries; where information leaves the European Economic Area, we rely on adequacy decisions or the European Commission's standard contractual clauses to protect it.",
      "Clinics are responsible for confirming that their use of Vela is appropriate for their location, profession, and client base.",
    ],
  },
  {
    title: "11. Cookies",
    body: [
      "Vela uses only the cookies it needs to work: keeping you signed in and protecting your account. We do not use advertising or cross-site tracking cookies. The checkout opens Paddle's payment form, which uses its own cookies for payment security.",
    ],
  },
  {
    title: "12. Children",
    body: [
      "Vela is intended for clinics and appointment-based businesses, not for children to create their own accounts.",
      "If a clinic stores information about minors, the clinic is responsible for obtaining appropriate guardian consent and complying with applicable rules.",
    ],
  },
  {
    title: "13. Privacy updates",
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
      `This Refund Policy explains refunds, cancellations, and free trials for Vela / Clinicare subscriptions. ${MERCHANT_OF_RECORD_NOTICE}`,
    ],
  },
  {
    title: "2. Free trials",
    body: [
      "Every plan starts with a 14-day free trial. Nothing is charged during the trial, and if you cancel before it ends you pay nothing.",
    ],
  },
  {
    title: "3. A 14-day refund on your first payment",
    body: [
      "If Vela isn't right for you, you can ask for a full refund within 14 days of your first payment after a free trial, and within 14 days of the first payment of a yearly plan.",
    ],
  },
  {
    title: "4. Renewals",
    body: [
      "Later renewal payments are not refunded, except where the law gives you that right. Cancelling stops future renewals, and you keep access until the end of the period you paid for.",
    ],
  },
  {
    title: "5. Plan changes",
    body: [
      "Moving to a higher plan charges the difference for the rest of the current period; moving to a lower one credits the unused part to your next bill. Switching between monthly and yearly starts a new billing period that day, and the unused part of the old one is taken off what you pay.",
    ],
  },
  {
    title: "6. Duplicate or mistaken charges",
    body: ["A duplicate or mistaken charge is always refunded in full."],
  },
  {
    title: "7. How to request a refund",
    body: [
      `Request a refund through Paddle at paddle.net, using the link in your receipt email, or write to ${SUPPORT_EMAIL} and we will help.`,
      "Refunds go back to the original payment method. Banks and card providers may take several business days to show them.",
    ],
  },
  {
    title: "8. Your legal rights",
    body: [
      "Nothing in this policy limits rights you have under consumer protection law where you live. Where the law gives you more, the law applies.",
    ],
  },
];
