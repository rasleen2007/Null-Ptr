import { Suspense } from "react";
import { ChatWorkspace, ChatWorkspaceSkeleton } from "@/components/chat/chat-workspace";

export const metadata = {
  title: "AI Assistant · Sarkari Saathi",
  description: "Chat with Sarkari Saathi for help with government services, RTI applications, forms, and schemes.",
};

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatWorkspaceSkeleton />}>
      <ChatWorkspace mode="chat" />
    </Suspense>
  );
}
