export const automations = {
  meta: {
    automations: "Automations | Vela",
    review: "To review | Vela",
    activity: "Automations activity | Vela",
  },
  title: "Automations",
  tabs: { automations: "Automations", review: "To review", activity: "Activity" },
  sections: "Automations sections",

  // Keyed by AutomationKind. A timed automation has `card` (its line on the
  // board) and `option` (its timing picker) as plural forms; a fixed one has
  // `card` and `fixed` (the editor's when-it-sends box).
  kinds: {
    BOOKING_CONFIRMATION: { label: "Booking confirmation", card: "Right after booking", fixed: "Right after booking" },
    NEW_PATIENT_WELCOME: { label: "New patient welcome", card: "After a first booking", fixed: "After a first booking" },
    FIRST_REMINDER: {
      label: "First reminder",
      card: { one: "{count} hour before", other: "{count} hours before" },
      option: { one: "{count} hour before the visit", other: "{count} hours before the visit" },
    },
    SECOND_REMINDER: {
      label: "Second reminder",
      card: { one: "{count} hour before", other: "{count} hours before" },
      option: { one: "{count} hour before the visit", other: "{count} hours before the visit" },
    },
    HIGH_RISK_REMINDER: {
      label: "High-risk reminder",
      card: { one: "{count} hour before, high risk only", other: "{count} hours before, high risk only" },
      option: { one: "{count} hour before a high-risk visit", other: "{count} hours before a high-risk visit" },
    },
    VISIT_CHANGED: { label: "Visit moved or cancelled", card: "When the clinic changes a visit", fixed: "When a visit changes" },
    THANK_YOU: {
      label: "Thank-you",
      card: { one: "{count} hour after the visit", other: "{count} hours after the visit" },
      option: { one: "{count} hour after the visit", other: "{count} hours after the visit" },
    },
    MISSED_VISIT: {
      label: "Missed visit",
      card: { one: "{count} hour after a no-show", other: "{count} hours after a no-show" },
      option: { one: "{count} hour after a no-show is recorded", other: "{count} hours after a no-show is recorded" },
    },
    PAYMENT_REMINDER: {
      label: "Payment reminder",
      card: { one: "{count} day after an unpaid visit", other: "{count} days after an unpaid visit" },
      option: {
        one: "{count} day after an unpaid payment is recorded",
        other: "{count} days after an unpaid payment is recorded",
      },
    },
    CHECKUP_DUE: { label: "Check-up due", card: "On the follow-up date", fixed: "On the follow-up date" },
    REBOOK: {
      label: "Rebooking nudge",
      card: { one: "{count} month since the last visit", other: "{count} months since the last visit" },
      option: { one: "{count} month after a patient's last visit", other: "{count} months after a patient's last visit" },
    },
    WAITLIST_OFFER: { label: "Waiting-list offer", card: "When a booking is cancelled", fixed: "When a slot opens up" },
  },

  // Keyed by the card's mode.
  modes: { Automatic: "Automatic", "Review first": "Review first", Off: "Off" },
  pro: "Pro",
  edit: "Edit {label}",
  // Shown to Albanian readers while a patient message still uses the English default.
  albanian: {
    note: "Some patient messages are still in English.",
    action: "Write them in Albanian",
    done: "Patient messages are now in Albanian.",
  },

  editor: {
    on: "{label} on",
    when: "When it sends",
    how: "How it sends",
    automatically: "Automatically",
    afterReview: "After I review it",
    message: "Message",
    moved: "When a visit is moved",
    cancelled: "When a visit is cancelled",
    insertDetail: "+ Insert detail",
    reset: "Reset to default",
    phone: "Maya's phone",
    // Keyed by AutomationToken.
    tokens: { client_name: "name", date: "date", time: "time", staff_name: "staff name", clinic_name: "clinic name" },
  },

  review: {
    // Keyed by FollowUpDraftKind: one row's label, and the filter chip.
    kinds: {
      SLOT_OFFER: "Slot offer",
      REBOOK: "Rebooking nudge",
      PAYMENT: "Payment reminder",
      THANK_YOU: "Thank-you message",
      BOOKING_CONFIRMATION: "Booking confirmation",
      NEW_PATIENT_WELCOME: "New patient welcome",
      VISIT_CHANGED: "Visit moved or cancelled",
      MISSED_VISIT: "Missed visit",
      CHECKUP_DUE: "Check-up due",
      FIRST_REMINDER: "First reminder",
      SECOND_REMINDER: "Second reminder",
      HIGH_RISK_REMINDER: "High-risk reminder",
    },
    groups: {
      SLOT_OFFER: "Slot offers",
      PAYMENT: "Payment reminders",
      REBOOK: "Rebooking nudges",
      THANK_YOU: "Thank-yous",
      BOOKING_CONFIRMATION: "Booking confirmations",
      NEW_PATIENT_WELCOME: "Welcomes",
      VISIT_CHANGED: "Visit changes",
      MISSED_VISIT: "Missed visits",
      CHECKUP_DUE: "Check-ups due",
      FIRST_REMINDER: "First reminders",
      SECOND_REMINDER: "Second reminders",
      HIGH_RISK_REMINDER: "High-risk reminders",
    },
    all: "All",
    emptyTitle: "Nothing to review",
    emptyCopy: "Messages from automations set to wait for your review land here. None of them sends until you do.",
    slotOfferSent: "Slot offer sent",
    declined: "Declined",
    declinedLabel: "{name} declined the slot",
    updating: "Updating...",
    book: "Book",
    bookLabel: "Book the slot for {name}",
    booking: "Booking...",
    edit: "Edit",
    done: "Done",
    editLabel: "Edit the message to {name}",
    doneLabel: "Done editing the message to {name}",
    skip: "Skip",
    skipLabel: "Skip the message to {name}",
    skipping: "Skipping...",
    send: "Send",
    sendLabel: "Send the message to {name}",
    sending: "Sending...",
    messageLabel: "Message to {name}",
    somethingWrong: "Something went wrong. Try again.",
    writeFirst: "Write a message before sending.",
    sendFailed: "Couldn't send this message. Try again.",
    skipFailed: "We couldn't skip this follow-up.",
    offerGone: "This slot offer is no longer available.",
    proOnly: "Waiting list is part of the Pro plan.",
  },

  activity: {
    all: "All",
    emptyTitle: "Nothing sent yet",
    emptyCopy: "Messages your automations send in the last 30 days show here.",
    // Keyed by ActivityStatus.
    statuses: { Sent: "Sent", Delivered: "Delivered", Read: "Read", Failed: "Failed" },
    newer: "Newer",
    older: "Older",
  },
};
