import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";

type Testimonial = { quote: string; name: string; role: string; org: string };

const ROW_1: Testimonial[] = [
  { quote: "Our front desk stopped juggling three apps just to book one appointment. Everything lives in the same place now.", name: "Sarah Mitchell", role: "Practice Manager", org: "Riverside Dental" },
  { quote: "I can see the whole day at a glance instead of piecing it together from memory and three sticky notes.", name: "James Whitfield", role: "Clinic Director", org: "Sunrise Family Clinic" },
  { quote: "Switching felt risky. It wasn't. The whole team was booking real appointments by the end of the first week.", name: "Michael Chen", role: "Founder", org: "Chen Dental Care" },
  { quote: "No more sticky notes taped to the monitor. Everything the front desk needs is already on the screen.", name: "Emily Carter", role: "Receptionist", org: "Bright Smile Dental" },
  { quote: "We stopped losing follow-ups in a spreadsheet nobody opened. Now they just show up where they belong.", name: "David Reynolds", role: "Clinic Director", org: "Reynolds Dermatology" },
];

const ROW_2: Testimonial[] = [
  { quote: "Patients message us on WhatsApp and it just lands in the right conversation, next to the right patient.", name: "Olivia Bennett", role: "Front Desk Lead", org: "Harborview Dermatology" },
  { quote: "Simple tools used well beat complicated tools used badly. Vela is the first one that actually stuck.", name: "Thomas Hayes", role: "Owner", org: "Clarity Physiotherapy" },
  { quote: "Every patient record actually looks the same way twice. That's rarer than it sounds.", name: "Rachel Adams", role: "Clinic Coordinator", org: "Riverside Health" },
  { quote: "It feels like it was built by people who've actually worked a front desk, not just designed one.", name: "Laura Bishop", role: "Practice Manager", org: "Bishop Family Practice" },
  { quote: "One login, one workspace, every part of the day: scheduling, records, messages, and payments together.", name: "Daniel Foster", role: "Owner", org: "Foster Wellness Clinic" },
];

const ROW_3: Testimonial[] = [
  { quote: "Reports finally tell me something I can act on, not just a wall of numbers to squint at.", name: "Kevin Brooks", role: "Owner", org: "Brooks Orthodontics" },
  { quote: "Our whole team finally works off the same page. Literally, not as a figure of speech.", name: "Hannah Wright", role: "Office Manager", org: "Wellpoint Clinic" },
  { quote: "The calendar is the first thing I open every morning, and the last thing I check before I leave.", name: "Peter Collins", role: "Practice Owner", org: "Collins Orthopedics" },
  { quote: "Our staff schedule used to live in someone's head. Now it lives in Vela, where everyone can see it.", name: "Megan Shaw", role: "Operations Lead", org: "Shaw Physiotherapy Group" },
  { quote: "Our patients notice when a clinic is organized. Vela is a quiet part of why ours feels that way.", name: "Elena Ross", role: "Owner", org: "Ross Dental" },
];

const ROWS: { items: Testimonial[]; direction: "left" | "right"; duration: string }[] = [
  { items: ROW_1, direction: "left", duration: "48s" },
  { items: ROW_2, direction: "right", duration: "56s" },
  { items: ROW_3, direction: "left", duration: "52s" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function TestimonialCard({ t, copy }: { t: Testimonial; copy?: boolean }) {
  return (
    <div aria-hidden={copy || undefined} className="testimonial-card group/card flex h-[184px] w-[340px] shrink-0 flex-col rounded-(--radius-mkt-card) border border-border/70 bg-white p-6 shadow-[0_1px_2px_rgba(20,21,47,0.03)] transition-all duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_14px_30px_-20px_rgba(10,34,255,0.14)]">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-mkt-tile) bg-[var(--brand-ink)] text-[11px] font-bold text-white transition-colors duration-(--duration-base) group-hover/card:bg-primary/90">
          {initials(t.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--brand-ink)]">{t.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t.role}, {t.org}
          </p>
        </div>
      </div>
      <p className="mt-4 line-clamp-3 text-sm leading-6 text-foreground/90">{t.quote}</p>
    </div>
  );
}

function Row({ items, direction, duration }: { items: Testimonial[]; direction: "left" | "right"; duration: string }) {
  // Track renders the row twice back-to-back so the 50% translate loop is seamless.
  // py-3 gives the hover lift + shadow room so the parent's overflow-hidden
  // doesn't clip the card's top border/shadow. Pausing on hover is handled
  // wall-wide via the .testimonial-wall:hover .testimonial-track rule in
  // globals.css, so hovering any card pauses every row, not just its own.
  const track = [...items, ...items];
  return (
    <div className="overflow-hidden">
      <div
        className={cn("testimonial-track flex items-start gap-3 py-3", direction === "left" ? "animate-marquee" : "animate-marquee-reverse")}
        style={{ animationDuration: duration }}
      >
        {track.map((t, i) => (
          // The second half only makes the loop seamless; screen readers hear each quote once.
          <TestimonialCard key={i} t={t} copy={i >= items.length} />
        ))}
      </div>
    </div>
  );
}

/** Ever-drifting wall of testimonials — three rows floating sideways at
 *  different speeds and directions. Hovering any card spotlights it and
 *  dims every other card across the whole wall; hovering a row pauses just
 *  that row. Sample quotes for illustration; Vela is pre-launch, no real
 *  clinic names or numbers. */
export function TestimonialWall() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          className="mb-12"
          lead="What clinics say"
          rest="once the day slows down."
          aside={<p className="text-sm text-muted-foreground">Illustrative quotes, not real customers.</p>}
        />
        <div className="testimonial-wall marquee-mask flex flex-col gap-1">
          {ROWS.map((row, i) => (
            <Row key={i} {...row} />
          ))}
        </div>
      </div>
    </section>
  );
}
