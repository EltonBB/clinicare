import { redirect } from "next/navigation";

// Follow-ups moved to Automations › To review (2026-10); old links still land there.
export default function FollowUpsPage() {
  redirect("/automations/review");
}
