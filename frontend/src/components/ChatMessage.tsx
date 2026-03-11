import React from "react";
import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === "user";

  const formatTime = (date?: Date) => {
    if (!date) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex max-w-[75%] space-x-2",
          isUser ? "flex-row-reverse space-x-reverse" : "flex-row"
        )}
      >
        <Avatar className="w-8 h-8">
          <AvatarFallback
            className={cn(
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            {isUser ? (
              <User className="w-4 h-4" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col">
          {!isUser && (
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" as const, color: "#8D9885" }}>
              AI Assistant
            </span>
          )}
          <div
            style={
              isUser
                ? {
                    background: "#3A6B47",
                    color: "white",
                    border: "none",
                    borderRadius: "10px 10px 3px 10px",
                    padding: "10px 13px",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }
                : {
                    background: "#F3F5F0",
                    border: "1px solid #D9DDD2",
                    borderRadius: "3px 10px 10px 10px",
                    padding: "10px 13px",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }
            }
          >
            <p className="whitespace-pre-wrap text-left">{message.content}</p>
          </div>
          {message.createdAt && (
            <span style={{ fontSize: "10px", color: "#8D9885", marginTop: "1px" }}>
              {formatTime(message.createdAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
export type { Message };
