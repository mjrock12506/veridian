import { redirect } from "next/navigation";

// The single-order agent run now lives inside the AI Action Center (one unified
// workflow), so this route just forwards there to avoid a confusing duplicate.
export default function AgentRedirect() {
  redirect("/actions");
}
