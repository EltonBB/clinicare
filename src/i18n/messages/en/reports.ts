export const reports = {
  meta: { reports: "Reports | Vela" },
  title: "Reports",

  // Text the reports view model writes (lib/reports.ts). Keyed by ReportPeriodKey.
  view: {
    periods: { daily: "Today", weekly: "This week", monthly: "This month", custom: "Custom range" },
    comparison: { daily: "vs yesterday", weekly: "vs last week", monthly: "vs last month", custom: "vs previous range" },
    chartTitles: {
      daily: "Appointments per day",
      weekly: "Appointments per week",
      monthly: "Appointments per month",
      custom: "Appointments in range",
    },
    chartRanges: { daily: "Last 7 days", weekly: "Last 8 weeks", monthly: "Last 6 months", custom: "Selected date range" },
    // Keyed by ReportKpi key.
    kpis: {
      appointments: "Appointments",
      completionRate: "Completion rate",
      newClients: "New clients",
      utilization: "Estimated utilization",
      avgVisitLength: "Avg visit length",
      activeClients: "Active clients",
      unreadMessages: "Unread messages",
    },
    ofClientRecords: "of {count} client records",
    openConversations: "Open conversations",
    week: "W{count}",
    minutes: "{count}m",
    points: "{count} pts",

    insight: {
      rules: "Rule-based insight",
      rulesForRange: "Rule-based analysis",
      aiGenerated: "AI generated",
      aiFailed: "AI refresh failed, using rules",
      aiUnavailable: "AI unavailable, using rules",
      // How a sentence names the period ("strong today", "strong for this range").
      periodWords: { daily: "today", weekly: "this week", monthly: "this month", custom: "for this range" },
      headline: {
        strong: "Clinic performance is strong {period}.",
        healthy: "Clinic performance is healthy {period}.",
        watch: "Clinic performance needs watching {period}.",
        attention: "Clinic performance needs attention {period}.",
      },
      summary: {
        empty:
          "No appointments are booked in this timeframe yet, so the report is using capacity, client, inbox, and schedule setup data until visit activity starts.",
        main: "{appointments} on the schedule, covering {hours}; {completion}, and {movement}.",
        appointments: { one: "{count} appointment is", other: "{count} appointments are" },
        hours: { one: "{count} booked hour", other: "{count} booked hours" },
        completion: "{rate} completion across {visits}",
        finalizedVisits: { one: "{count} finalized visit", other: "{count} finalized visits" },
        noFinalized: "no finalized visits yet",
        up: "booked activity is up {delta}",
        down: "booked activity is down {delta}",
        flat: "booked activity is flat",
      },
      strength: {
        noCapacity: "Utilization can't be measured {period}: there's no configured open capacity to compare against.",
        noBookings:
          "There are no booked appointments {period}, so the clearest signal is unused capacity rather than visit execution.",
        notFinalized: {
          one: "{count} appointment is booked {period}, but it isn't finalized yet, so execution quality is still unproven.",
          other: "{count} appointments are booked {period}, but none are finalized yet, so execution quality is still unproven.",
        },
        reliable: "Visit execution is reliable: {completion} completed with only {lost} lost slots.",
        utilization: "Capacity is being used well at {rate} estimated utilization, which is a healthy operating range.",
        newClients: {
          one: "{count} new client entered the clinic {period}, which keeps acquisition moving.",
          other: "{count} new clients entered the clinic {period}, which keeps acquisition moving.",
        },
        baseline: {
          one: "{count} completed visit gives the clinic a measurable baseline {period}.",
          other: "{count} completed visits give the clinic a measurable baseline {period}.",
        },
      },
      watch: {
        noCapacity:
          "Estimated utilization can't be measured this period: there's no configured open capacity to compare bookings against (closed hours, or a schedule block covering the window).",
        noBookings: "There are 0 booked appointments while utilization is {rate}, so open capacity is the main issue.",
        notFinalized: {
          one: "{count} appointment is booked but not finalized yet, so completion and lost-slot rates cannot be judged from outcomes.",
          other: "{count} appointments are booked but not finalized yet, so completion and lost-slot rates cannot be judged from outcomes.",
        },
        lostSlots:
          "Lost-slot pressure is high at {rate} across {cancelled}. Missed or cancelled visits are the clearest source of preventable leakage.",
        cancelledVisits: { one: "{count} cancelled visit", other: "{count} cancelled visits" },
        lowUtilization: "Estimated utilization is only {rate}. Open hours are not turning into enough booked care time.",
        overload: "Estimated utilization is {rate}, which risks overload and weaker patient experience.",
        lowRepeat: "Repeat-visit rate is {rate}. The clinic is not yet pulling enough return demand from recent patients.",
        lowFollowUp: "Only {rate} of inbound message volume is matched by outbound follow-up. Response discipline is still weak.",
        balanced:
          "No single operational risk dominates right now: completion is {completion}, lost slots are {lost}, and utilization is {utilization}.",
      },
      constraint: {
        noCapacity: "Utilization can't be measured for this period",
        noDemand: "No booked demand in this timeframe",
        needOutcomes: "Booked visits need final outcomes",
        lostSlots: "Lost slots are reducing usable capacity",
        lowUtilization: "Open capacity is not converting into visits",
        overload: "Schedule is near overload",
        lowRepeat: "Return demand needs more follow-up",
        lowFollowUp: "Inbound demand needs stronger response",
        balanced: "No dominant operating constraint",
      },
      action: {
        confirmClosed: "Confirm the closed period is intentional",
        createDemand: "Create booked demand",
        finalize: "Finalize booked visits",
        protect: "Protect the strongest signal",
      },
    },
  },

  // The page.
  customRange: "Choose a custom date range",
  customRangeDialog: "Custom range",
  from: "From",
  to: "To",
  pickStart: "Pick a start date",
  pickEnd: "{from}, pick an end date",
  analyseRange: "Analyse range",
  refreshAi: "Refresh AI",
  // What a manual refresh reports back (reports/actions.ts).
  refreshResult: {
    generated: {
      one: "Generated fresh analysis for {count} timeframe",
      other: "Generated fresh analysis for {count} timeframes",
    },
    kept: { one: " and kept {count} recent timeframe", other: " and kept {count} recent timeframes" },
    tooSoon: "Full AI analysis was refreshed recently. Try again after {time}.",
    none: "AI insights were not generated.",
  },
  refreshFailed: "Analysis could not refresh right now. Current reports are still using saved metrics.",
  pickBoth: "Pick both a start and an end date.",
  endAfterStart: "End date must be after the start date.",

  performance: "Performance",
  legend: { appointments: "Appointments", completed: "Completed", previous: "Previous period" },
  noTrendTitle: "No appointment trend yet",
  noTrendCopy: "The trend appears once appointments are booked in this period.",
  aiInsight: "AI insight",
  tones: { strong: "Strong", healthy: "Healthy", watch: "Needs watching", attention: "Needs attention" },
  healthScore: "Operational health score: {score}/100",
  summary: "Summary",
  diagnosis: "Diagnosis",
  nextMove: "Next move",
  noDiagnosis: "No diagnosis recorded yet",
  // Keyed by severity / priority.
  levels: { high: "High", medium: "Medium", low: "Low" },

  kpiDetail: {
    busiest: { one: "Busiest day this period: {day} ({count} visit).", other: "Busiest day this period: {day} ({count} visits)." },
    quietest: " Quietest: {day} ({count}).",
    noAppointments: "No appointments booked yet this period to break down by day.",
    lostSlot: "Lost-slot rate: {value} of finalized visits were cancelled.",
    noShow: "No-show rate: {value} of finalized visits were no-shows.",
    followUp: "Follow-up coverage: {value} of inbound messages got an outbound reply.",
    avgVisit: "Average visit length: {value}.",
    repeat: "{value} of clients return for another visit.",
    notEnough: "Not enough finalized visits or inbound messages yet to break this down further.",
    newClients: "{active} of {total} total client records are currently active.",
    utilization:
      "Booked minutes vs. open hours × active staff, estimated, not a measured clock-in/clock-out figure. 70-92% is the healthy operating range; below that means open capacity isn't converting into visits, above it risks overload.",
  },

  status: {
    title: "Appointment status",
    count: "Show counts",
    percent: "Show percentages",
    visits: "visits",
    emptyTitle: "No status mix yet",
    emptyCopy: "Statuses appear after visits are booked.",
  },

  highlights: {
    title: "Highlights",
    avgVisit: "Average visit length",
    avgVisitDetail: "Completed visits average {value} this period.",
    repeat: "Repeat-visit rate",
    repeatDetail: "{value} of clients return for another visit.",
    lostSlot: "Lost-slot rate",
    lostSlotDetail: "{value} of finalized visits were cancelled.",
    noShow: "No-show rate",
    noShowDetail: "{value} of finalized visits were no-shows.",
    followUp: "Follow-up coverage",
    followUpDetail: "{value} of inbound messages got an outbound reply.",
    activeClients: "Active clients",
    activeClientsDetail: "{active} of {total} client records are currently active.",
    emptyTitle: "No activity pattern yet",
    emptyCopy: "Highlights appear once visits are completed.",
  },

  staff: {
    title: "Staff performance",
    emptyTitle: "No staff activity yet",
    emptyCopy: "Provider performance appears once appointments are assigned this period.",
    provider: "Provider",
    columns: { appointments: "Visits", bookedMinutes: "Booked time", completion: "Completion" },
    hours: "{count}h",
    teamAverage: "Team average load",
    detail: "{visits} this period, {hours} ({share} of total staff load)",
    visits: { one: "{count} visit", other: "{count} visits" },
    bookedHours: { one: "{count} booked hour", other: "{count} booked hours" },
    withCompletion: ", {rate} completion rate.",
    noFinalized: ", no finalized visits yet.",
    above: " That's {percent}% above the team average of {average} visits.",
    below: " That's {percent}% below the team average of {average} visits.",
    viewProfile: "View profile",
  },

  patterns: {
    title: "Booking patterns",
    peak: { one: "Peak: {window}, {count} appointment, the clearest place to add coverage.", other: "Peak: {window}, {count} appointments, the clearest place to add coverage." },
    peakWindow: "{day} {band}",
    cell: { one: "{day} {band}: {count} appointment", other: "{day} {band}: {count} appointments" },
    // Keyed by the English day and band names the view model uses internally.
    days: { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun" },
    bands: { Morning: "Morning", Midday: "Midday", Afternoon: "Afternoon", Evening: "Evening" },
    bandsShort: { Morning: "Morn", Midday: "Mid", Afternoon: "Aft", Evening: "Eve" },
    emptyTitle: "No booking pattern yet",
    emptyCopy: "The heat-grid fills in once appointments are booked this period.",
    leadTime: "Avg lead time",
    leadHours: "{count}h",
    sameDay: "Same-day",
    unassigned: "Unassigned",
  },

  locked: {
    title: "Reports are part of Pro",
    copy: "Trends, staff load and a weekly read on what to fix next, built from your own visits.",
    upgrade: "Upgrade to Pro",
    compare: "Compare plans",
    previewLabel: "Reports preview with sample data",
    sample: "Sample data",
    sampleCaption: "What Reports shows, from a made-up clinic",
  },
};
