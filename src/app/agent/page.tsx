import { Suspense } from "react";
import { ChatWorkspace, ChatWorkspaceSkeleton } from "@/components/chat/chat-workspace";

export const metadata = {
  title: "Agent · JARVIS",
  description: "Autonomous agent workspace with execution trace and tool approvals.",
};

export default function AgentPage() {
  return (
    <Suspense fallback={<ChatWorkspaceSkeleton />}>
      <ChatWorkspace mode="agent" />
    </Suspense>
  );
}
