import { Suspense } from "react";
import { ChatWorkspace, ChatWorkspaceSkeleton } from "@/components/chat/chat-workspace";

export const metadata = {
  title: "Chat · JARVIS",
  description: "Streaming chat with persistent memory and approval-gated tools.",
};

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatWorkspaceSkeleton />}>
      <ChatWorkspace mode="chat" />
    </Suspense>
  );
}
