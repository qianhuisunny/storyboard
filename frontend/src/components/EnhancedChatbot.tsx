import React, { useRef, useEffect, useState } from "react";
import { Send, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import ChatMessage, { type Message } from "@/components/ChatMessage";

interface EnhancedChatbotProps {
  className?: string;
}

const EnhancedChatbot: React.FC<EnhancedChatbotProps> = ({ className }) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Load chat history from backend when component mounts
  useEffect(() => {
    const loadChatHistory = async () => {
      const currentProjectId = sessionStorage.getItem("projectId");
      if (!currentProjectId) return;

      setProjectId(currentProjectId);

      try {
        // Load chat history from backend
        const response = await fetch(`/api/chat/history/${currentProjectId}`);

        if (response.ok) {
          const data = await response.json();

          if (data.messages && data.messages.length > 0) {
            // Convert stored messages to Message format
            const loadedMessages: Message[] = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              createdAt: new Date(msg.createdAt),
            }));
            setMessages(loadedMessages);
          } else {
            // If no history exists, initialize with onboarding data
            loadInitialMessages();
          }
        } else {
          // If error loading history, fall back to initial messages
          loadInitialMessages();
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
        loadInitialMessages();
      }
    };

    const loadInitialMessages = () => {
      const storyboardPrompt = sessionStorage.getItem("storyboardPrompt");
      const storyboardType = sessionStorage.getItem("storyboardType");
      const initialResponse = sessionStorage.getItem("initialResponse");

      if (storyboardPrompt && storyboardType) {
        const storyboardTypeNames = ["", "Product Release Video", "Product Demo Video", "Knowledge Sharing"];
        const typeName = storyboardTypeNames[parseInt(storyboardType)] || "Storyboard";

        const initialMessages: Message[] = [
          {
            id: "initial-user",
            role: "user",
            content: `[${typeName}] ${storyboardPrompt}`,
            createdAt: new Date(),
          }
        ];

        if (initialResponse) {
          initialMessages.push({
            id: "initial-response",
            role: "assistant",
            content: initialResponse,
            createdAt: new Date(),
          });
        }

        setMessages(initialMessages);
      }
    };

    loadChatHistory();
  }, []);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  // Save messages whenever they change (excluding initial load)
  useEffect(() => {
    const saveChatHistory = async () => {
      if (!projectId || messages.length === 0) return;

      try {
        const response = await fetch("/api/chat/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId,
            messages: messages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt ? msg.createdAt.toISOString() : new Date().toISOString(),
            })),
          }),
        });

        if (!response.ok) {
          console.error("Failed to save chat history");
        }
      } catch (error) {
        console.error("Error saving chat history:", error);
      }
    };

    // Debounce saving to avoid too many requests
    const timeoutId = setTimeout(saveChatHistory, 1000);
    return () => clearTimeout(timeoutId);
  }, [messages, projectId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      // Call backend API with extended timeout for Langflow processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 380000); // 6 minutes 20 seconds

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: currentInput,
          conversation_history: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          project_id: projectId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Failed to get response from AI");
      }

      const data = await response.json();

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error("Error calling AI API:", error);

      // Fallback to mock response if API fails
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I'm having trouble connecting to the AI service right now. Please try again in a moment.",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleQuickAction = async (action: string) => {
    if (isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: action,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Call backend API with extended timeout for Langflow processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 380000); // 6 minutes 20 seconds

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: action,
          conversation_history: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          project_id: projectId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Failed to get response from AI");
      }

      const data = await response.json();

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error("Error calling AI API:", error);

      // Fallback to mock response if API fails
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I'm having trouble connecting to the AI service right now. Please try again in a moment.",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card
      className={cn(
        "fixed right-0 top-0 h-screen w-1/4 bg-card border-l border-border shadow-lg flex flex-col z-50 rounded-none",
        className
      )}
    >
      {/* Header - Cal.com inverted style */}
      <div className="bg-[var(--header-background)] text-[var(--header-foreground)] p-4">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5" />
          <h3 className="font-semibold">Storyboard AI Assistant</h3>
        </div>
        <div className="flex">
          <p className="text-xs opacity-80 mt-1">
            Edit and iterate your storyboard
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex space-x-2 max-w-[75%]">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-secondary text-secondary-foreground">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <div>
                      <span>Generating your storyboard...</span>
                      <p className="text-xs opacity-70 mt-1">
                        This may take 3-5 minutes. Please be patient.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex space-x-2">
            <Textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you'd like to change about your storyboard..."
              className="flex-1 resize-none min-h-[60px] max-h-[120px]"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="self-end"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>

        {/* Quick Actions */}
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Quick actions:
          </p>
          <div className="flex flex-wrap gap-1">
            {[
              "Make it more dramatic",
              "Simplify the message",
              "Add a call-to-action",
              "Improve pacing",
            ].map((action) => (
              <Button
                key={action}
                variant="outline"
                size="sm"
                className="text-xs h-6"
                onClick={() => void handleQuickAction(action)}
                disabled={isLoading}
              >
                {action}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default EnhancedChatbot;
