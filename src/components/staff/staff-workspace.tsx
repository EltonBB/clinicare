"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  Clock3,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserRoundCog,
  UserRoundPen,
} from "lucide-react";

import {
  checkInStaffAction,
  checkOutStaffAction,
  deleteStaffAction,
  saveStaffAction,
} from "@/app/(workspace)/staff/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  staffRoles,
  staffStatuses,
  type SaveStaffPayload,
  type StaffRecord,
  type StaffStatus,
  type StaffViewModel,
} from "@/lib/staff";

type StaffWorkspaceProps = {
  initialView: StaffViewModel;
  initialNewStaffOpen?: boolean;
};

type StaffDraft = SaveStaffPayload;

const filters: Array<{ label: string; value: "all" | StaffStatus }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "ACTIVE" },
  { label: "Away", value: "AWAY" },
  { label: "Inactive", value: "INACTIVE" },
];

function createDraft(staff?: StaffRecord): StaffDraft {
  return staff
    ? {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        email: staff.email,
        phone: staff.phone,
        profileNote: staff.profileNote,
        status: staff.status,
      }
    : {
        name: "",
        role: "Specialist",
        email: "",
        phone: "",
        profileNote: "",
        status: "ACTIVE",
      };
}

function NativeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white/84 px-3 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 focus:border-ring focus:bg-white focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function statusDot(status: StaffStatus) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "ACTIVE" && "bg-primary",
    status === "AWAY" && "bg-amber-500",
    status === "INACTIVE" && "bg-border"
  );
}

function upsertStaff(records: StaffRecord[], staff: StaffRecord) {
  const index = records.findIndex((item) => item.id === staff.id);

  if (index === -1) {
    return [staff, ...records];
  }

  const clone = [...records];
  clone[index] = staff;
  return clone;
}

export function StaffWorkspace({
  initialView,
  initialNewStaffOpen = false,
}: StaffWorkspaceProps) {
  const [staff, setStaff] = useState(initialView.staff);
  const [selectedStaffId, setSelectedStaffId] = useState(initialView.initialSelectedStaffId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | StaffStatus>("all");
  const [drawerOpen, setDrawerOpen] = useState(initialNewStaffOpen);
  const [draft, setDraft] = useState<StaffDraft>(createDraft());
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startSaving] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const hasStaff = staff.length > 0;

  const filteredStaff = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return staff.filter((member) => {
      const matchesFilter = filter === "all" ? true : member.status === filter;
      const matchesQuery =
        normalizedQuery.length === 0
          ? true
          : [member.name, member.role, member.email, member.phone].some((value) =>
              value.toLowerCase().includes(normalizedQuery)
            );

      return matchesFilter && matchesQuery;
    });
  }, [staff, deferredQuery, filter]);

  const selectedStaff =
    staff.find((member) => member.id === selectedStaffId) ?? filteredStaff[0] ?? staff[0];

  function replaceStaffUrl(staffId?: string) {
    const nextPath = staffId ? `/staff?staff=${staffId}` : "/staff";
    window.history.replaceState(null, "", nextPath);
  }

  function openNewStaff() {
    setDraft(createDraft());
    setErrorMessage("");
    setDrawerOpen(true);
  }

  function openEditStaff(member: StaffRecord) {
    setDraft(createDraft(member));
    setErrorMessage("");
    setDrawerOpen(true);
  }

  function saveStaff() {
    startSaving(async () => {
      const result = await saveStaffAction(draft);

      if (!result.ok || !result.staff) {
        setErrorMessage(result.error ?? "We couldn't save this staff member.");
        setStatusMessage("");
        return;
      }

      setStaff((current) => upsertStaff(current, result.staff!));
      setSelectedStaffId(result.staff.id);
      setDrawerOpen(false);
      setErrorMessage("");
      setStatusMessage(draft.id ? "Staff profile updated." : "Staff member added.");
      replaceStaffUrl(result.staff.id);
    });
  }

  function deleteStaff(memberId: string) {
    if (!window.confirm("Delete this staff member permanently?")) {
      return;
    }

    startSaving(async () => {
      const result = await deleteStaffAction(memberId);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't delete this staff member.");
        setStatusMessage("");
        return;
      }

      setStaff((current) => {
        const nextStaff = current.filter((member) => member.id !== memberId);
        setSelectedStaffId(nextStaff[0]?.id ?? "");
        return nextStaff;
      });
      setDrawerOpen(false);
      setErrorMessage("");
      setStatusMessage("Staff member deleted.");
      replaceStaffUrl();
    });
  }

  function toggleClock(member: StaffRecord) {
    startSaving(async () => {
      const result = member.isCheckedIn
        ? await checkOutStaffAction(member.id)
        : await checkInStaffAction(member.id);

      if (!result.ok || !result.staff) {
        setErrorMessage(result.error ?? "We couldn't update staff time.");
        setStatusMessage("");
        return;
      }

      setStaff((current) => upsertStaff(current, result.staff!));
      setSelectedStaffId(result.staff.id);
      setErrorMessage("");
      setStatusMessage(member.isCheckedIn ? "Staff checked out." : "Staff checked in.");
    });
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open && initialNewStaffOpen) {
      replaceStaffUrl(selectedStaffId || undefined);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="section-reveal space-y-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Staff workspace
          </p>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Manage staff
            </h1>
            <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
              Keep staff profiles, work time, and completed appointment records in one place.
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="section-reveal-delayed h-11 rounded-[0.9rem] px-4"
          onClick={openNewStaff}
        >
          <Plus className="size-4" />
          New staff member
        </Button>
      </div>

      <div className="section-reveal flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff..."
            className="h-11 rounded-[0.9rem] bg-white/78 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "rounded-[0.9rem] border border-transparent bg-white/36 px-3 py-2 text-sm font-medium text-muted-foreground transition-[background-color,color,border-color,box-shadow] duration-200 hover:border-border/70 hover:bg-white/70 hover:text-foreground",
                filter === item.value &&
                  "border-border/80 bg-white text-foreground shadow-[0_14px_28px_rgba(20,32,51,0.05)]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {!errorMessage && statusMessage ? (
        <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_440px]">
        <section className="section-reveal overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/74 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_130px_140px_120px_40px] border-b border-border/80 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:grid">
            <span>Name</span>
            <span>Status</span>
            <span>This week</span>
            <span>Completed</span>
            <span />
          </div>

          <div className="divide-y divide-border/75">
            {!hasStaff ? (
              <div className="px-6 py-14">
                <div className="mx-auto max-w-md space-y-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-[1.05rem] bg-primary/12 text-primary">
                    <UserRoundCog className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">
                      Add the first staff member
                    </h2>
                    <p className="text-sm leading-7 text-muted-foreground">
                      Staff records connect bookings, time tracking, and completed work.
                    </p>
                  </div>
                  <Button size="lg" className="rounded-[0.95rem]" onClick={openNewStaff}>
                    <Plus className="size-4" />
                    Add staff member
                  </Button>
                </div>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No staff members match this search or filter.
              </div>
            ) : (
              filteredStaff.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setSelectedStaffId(member.id)}
                  className={cn(
                    "interactive-lift grid w-full gap-4 px-5 py-4 text-left transition-[background-color,transform] duration-200 md:grid-cols-[minmax(0,1.4fr)_130px_140px_120px_40px] md:items-center",
                    selectedStaff?.id === member.id ? "bg-secondary/38" : "hover:bg-white/58"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar size="lg">
                      <AvatarFallback>
                        {member.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{member.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={statusDot(member.status)} />
                    <span className="capitalize">{member.status.toLowerCase()}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{member.weeklyHours}h</p>
                  <p className="text-sm font-medium text-foreground">
                    {member.completedThisMonth}
                  </p>
                  <MoreHorizontal className="hidden size-4 text-muted-foreground md:block" />
                </button>
              ))
            )}
          </div>
        </section>

        <aside className="section-reveal-delayed overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/74 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
          {selectedStaff ? (
            <>
              <div className="glass-divider px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Avatar size="lg" className="size-12">
                      <AvatarFallback>
                        {selectedStaff.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xl font-semibold text-foreground">
                        {selectedStaff.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{selectedStaff.role}</p>
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={statusDot(selectedStaff.status)} />
                        <span className="capitalize">{selectedStaff.status.toLowerCase()}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-[0.85rem] bg-white/72"
                    onClick={() => openEditStaff(selectedStaff)}
                  >
                    <UserRoundPen className="size-4" />
                    Edit
                  </Button>
                </div>
              </div>

              <div className="space-y-5 px-5 py-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      This week
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-primary">
                      {selectedStaff.weeklyHours}h
                    </p>
                  </div>
                  <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      This month
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-primary">
                      {selectedStaff.completedThisMonth}
                    </p>
                  </div>
                  <Button
                    className="min-h-[92px] rounded-[0.95rem]"
                    variant={selectedStaff.isCheckedIn ? "outline" : "default"}
                    onClick={() => toggleClock(selectedStaff)}
                    disabled={isPending}
                  >
                    <Clock3 className="size-4" />
                    {selectedStaff.isCheckedIn ? "Check out" : "Check in"}
                  </Button>
                </div>

                <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Contact
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <p>{selectedStaff.phone || "No phone saved."}</p>
                    <p>{selectedStaff.email || "No email saved."}</p>
                  </div>
                </div>

                <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Profile note
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {selectedStaff.profileNote || "No staff note yet."}
                  </p>
                </div>

                <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Last 5 completed appointments
                  </p>
                  <div className="mt-3 space-y-3">
                    {selectedStaff.recentAppointments.length > 0 ? (
                      selectedStaff.recentAppointments.map((appointment) => (
                        <div
                          key={appointment.id}
                          className="rounded-[0.8rem] bg-secondary/46 px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {appointment.title}
                            </p>
                            <p className="shrink-0 text-xs text-muted-foreground">
                              {appointment.date}
                            </p>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {appointment.time} - {appointment.clientName}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No completed appointments yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              Add a staff member to see profile details, work time, and completed appointment
              history here.
            </div>
          )}
        </aside>
      </div>

      <Sheet open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
        <SheetContent side="right" className="w-full max-w-[460px] p-0 sm:max-w-[460px]">
          <SheetHeader className="glass-divider rounded-t-[1.2rem] px-5 py-5">
            <SheetTitle>{draft.id ? "Edit staff member" : "Add staff member"}</SheetTitle>
            <SheetDescription>
              Keep staff profiles focused on booking ownership and daily operations.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 py-5">
            <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Name
                </label>
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Role
                </label>
                <NativeSelect
                  value={draft.role}
                  options={[...staffRoles]}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, role: value }))
                  }
                />
              </div>
            </div>

            <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </label>
                <NativeSelect
                  value={draft.status}
                  options={[...staffStatuses]}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, status: value as StaffStatus }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Phone
                </label>
                <Input
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, phone: event.target.value }))
                  }
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
              </div>
            </div>

            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Email
              </label>
              <Input
                value={draft.email}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, email: event.target.value }))
                }
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
            </div>

            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Profile note
              </label>
              <Textarea
                value={draft.profileNote}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, profileNote: event.target.value }))
                }
                className="min-h-28 rounded-[0.9rem] bg-white/84 px-3 py-3"
              />
            </div>
          </div>

          <SheetFooter className="glass-divider rounded-b-[1.2rem] px-5 py-4">
            {draft.id ? (
              <Button
                variant="outline"
                className="rounded-[0.9rem] border-destructive/25 bg-white/70 text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={() => deleteStaff(draft.id!)}
                disabled={isPending}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="rounded-[0.9rem] bg-white/70"
              onClick={() => setDrawerOpen(false)}
              disabled={isPending}
            >
              Close
            </Button>
            <Button className="rounded-[0.9rem]" onClick={saveStaff} disabled={isPending}>
              {isPending ? "Saving..." : draft.id ? "Save changes" : "Create staff"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
