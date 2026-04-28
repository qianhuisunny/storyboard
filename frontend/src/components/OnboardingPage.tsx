import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Upload,
  Link2,
  FileText,
  X,
  File,
  Globe,
  Type,
  Plus,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAnonymousUserId } from "@/lib/anonymousUser";

interface Source {
  id: string;
  type: "file" | "link" | "text";
  name: string;
  content?: string;
  file?: File;
  url?: string;
}

// Fixed to Knowledge Sharing type
const KNOWLEDGE_SHARING = {
  id: 3,
  title: "Knowledge Sharing",
  placeholder: "e.g., How to use AI models as specialized agents in a multi-step analytical workflow...",
};

type InputMode = "upload" | "link" | "text";


const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [userId] = useState(() => getAnonymousUserId());
  const [userInput, setUserInput] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [audience, setAudience] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [inputMode, setInputMode] = useState<InputMode | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateProjectId = (): string => {
    return Date.now().toString();
  };

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((file) => {
      const validTypes = [
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      const validExtensions = [".pdf", ".txt", ".md", ".doc", ".docx"];
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      return validTypes.includes(file.type) || validExtensions.includes(ext);
    });

    if (validFiles.length === 0) {
      alert("Please upload PDF, TXT, MD, DOC, or DOCX files only.");
      return;
    }

    const newSources: Source[] = validFiles.map((file) => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "file" as const,
      name: file.name,
      file: file,
    }));

    setSources((prev) => [...prev, ...newSources]);
    setInputMode(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files);
      }
    },
    [handleFileUpload]
  );

  const handleAddLink = () => {
    if (!linkInput.trim()) return;

    let url = linkInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const newSource: Source = {
      id: `link-${Date.now()}`,
      type: "link",
      name: new URL(url).hostname,
      url: url,
    };

    setSources((prev) => [...prev, newSource]);
    setLinkInput("");
    setInputMode(null);
  };

  const handleAddText = () => {
    if (!textInput.trim()) return;

    const newSource: Source = {
      id: `text-${Date.now()}`,
      type: "text",
      name: `Text note ${sources.filter((s) => s.type === "text").length + 1}`,
      content: textInput.trim(),
    };

    setSources((prev) => [...prev, newSource]);
    setTextInput("");
    setInputMode(null);
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const createProjectFolder = async (
    projectId: string,
    typeId: number,
    userInput: string
  ) => {
    try {
      const response = await fetch("/api/create-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          typeId,
          typeName: KNOWLEDGE_SHARING.title,
          userInput,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create project folder");
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating project folder:", error);
      throw error;
    }
  };

  const uploadFilesToProject = async (projectId: string): Promise<string[]> => {
    const fileContents: string[] = [];
    const fileSources = sources.filter((s) => s.type === "file" && s.file);

    for (const source of fileSources) {
      if (!source.file) continue;

      const formData = new FormData();
      formData.append("file", source.file);

      try {
        const response = await fetch(`/api/project/${projectId}/upload`, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.content) {
            fileContents.push(`[File: ${source.name}]\n${data.content}`);
          }
        }
      } catch (error) {
        console.error(`Error uploading file ${source.name}:`, error);
      }
    }

    return fileContents;
  };

  const fetchLinkContents = async (projectId: string): Promise<string[]> => {
    const linkContents: string[] = [];
    const linkSources = sources.filter((s) => s.type === "link" && s.url);

    for (const source of linkSources) {
      if (!source.url) continue;

      try {
        const response = await fetch(`/api/project/${projectId}/fetch-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: source.url }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.content) {
            linkContents.push(`[Link: ${source.url}]\n${data.content}`);
          }
        }
      } catch (error) {
        console.error(`Error fetching link ${source.url}:`, error);
      }
    }

    return linkContents;
  };

  const isFormValid = userInput.trim() && selectedDuration && audience.trim();

  const handleGenerate = async () => {
    console.log("=== ONBOARDING FORM SUBMISSION ===");
    console.log("Form valid:", isFormValid);
    console.log("User input:", userInput);
    console.log("Selected type:", KNOWLEDGE_SHARING.title);
    console.log("Duration:", selectedDuration);
    console.log("Audience:", audience);
    console.log("Sources:", sources.length);

    if (!isFormValid) {
      console.log("Form validation failed - not submitting");
      return;
    }

    const startTime = performance.now();
    console.log("[Onboarding] handleGenerate started");

    setIsGenerating(true);
    setIsUploadingFiles(true);

    try {
      const projectId = generateProjectId();
      console.log(`[Onboarding] projectId: ${projectId}`);

      const t1 = performance.now();
      await createProjectFolder(projectId, KNOWLEDGE_SHARING.id, userInput);
      console.log(`[Onboarding] createProjectFolder done in ${(performance.now() - t1).toFixed(0)}ms`);

      const t2 = performance.now();
      const [fileContents, linkContents] = await Promise.all([
        uploadFilesToProject(projectId),
        fetchLinkContents(projectId),
      ]);
      console.log(`[Onboarding] upload/fetch done in ${(performance.now() - t2).toFixed(0)}ms`);

      const textContents = sources
        .filter((s) => s.type === "text" && s.content)
        .map((s) => `[Note: ${s.name}]\n${s.content}`);

      const allContext = [...fileContents, ...linkContents, ...textContents].join("\n\n---\n\n");

      setIsUploadingFiles(false);

      console.log("Storing session data...");
      sessionStorage.setItem("projectId", projectId);
      sessionStorage.setItem("storyboardType", KNOWLEDGE_SHARING.id.toString());
      sessionStorage.setItem("storyboardPrompt", userInput);
      sessionStorage.setItem("storyboardDuration", selectedDuration ? String(selectedDuration) : "");
      sessionStorage.setItem("storyboardAudience", audience);
      if (allContext) {
        sessionStorage.setItem("storyboardContext", allContext);
      }
      console.log("Session data stored");

      console.log(`[Onboarding] Navigating in ${(performance.now() - startTime).toFixed(0)}ms`);
      console.log("Navigating to /storyboard/" + projectId);
      navigate(`/storyboard/${projectId}`);

      // Knowledge Share uses the 3-round briefing flow, not the legacy chat API
      if (KNOWLEDGE_SHARING.id === 3) {
        console.log("[Onboarding] Knowledge Share - skipping legacy chat API");
        return;
      }

      // Start AI generation in background (don't await) - for legacy flow only
      const generateInBackground = async () => {
        console.log("=== BACKGROUND AI GENERATION STARTING ===");
        try {
          let promptWithType = `${userInput} with the category type ${KNOWLEDGE_SHARING.title}. Please don't use any placeholder, and search the web if you cannot find enough information. Return without confirm needed.`;

          if (allContext) {
            promptWithType = `Here is reference material to use:\n\n${allContext}\n\n---\n\nBased on the above context, ${promptWithType}`;
          }

          console.log("Prompt sent to chat API:", promptWithType.substring(0, 500) + "...");

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 380000);

          console.log("Calling /api/chat...");
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: promptWithType,
              conversation_history: [],
              project_id: projectId,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          console.log("/api/chat response status:", response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to generate storyboard:", response.status, errorText);
            return;
          }

          const data = await response.json();
          console.log("/api/chat response data:", data);

          sessionStorage.setItem("initialResponse", data.message);
          console.log("Background AI generation completed for project:", projectId);
        } catch (error) {
          console.error("Background AI generation failed:", error);
        }
      };

      generateInBackground();
    } catch (error) {
      console.error("=== ERROR IN FORM SUBMISSION ===");
      console.error("Error creating project:", error);
      alert("Failed to create project. Please try again.");
      setIsGenerating(false);
      setIsUploadingFiles(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && inputMode === null && isFormValid) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const getSourceIcon = (type: Source["type"]) => {
    switch (type) {
      case "file":
        return <File className="w-4 h-4" />;
      case "link":
        return <Globe className="w-4 h-4" />;
      case "text":
        return <Type className="w-4 h-4" />;
    }
  };

  return (
    <div className="grid grid-cols-[380px_1fr] h-full">
      {/* Left Panel */}
      <div className="bg-[#1C2118] text-white px-10 flex flex-col justify-center">
        <h1
          className="text-[30px] font-medium text-white mb-4"
          style={{ fontFamily: "'Fraunces', serif", letterSpacing: "-0.5px", lineHeight: 1.25 }}
        >
          Create Your Storyboard for Knowledge Sharing Videos
        </h1>
        <p className="text-[14px] text-[#B0B8A8] leading-relaxed">
          Best for 5–15 min YouTube explainer-style videos.
        </p>
      </div>

      {/* Right Panel */}
      <div className="overflow-y-auto flex flex-col justify-center px-16 py-14">
        <div className="max-w-[560px] space-y-7">
          {/* Topic */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1.5">
              What's your video about? <span className="text-[#A63228]">*</span>
            </h3>
            <p className="text-[13px] text-muted-foreground mb-3">
              Topic, learning objectives, key points you want to cover
            </p>
            <Textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={KNOWLEDGE_SHARING.placeholder}
              className="min-h-[120px] resize-none text-[15px]"
              disabled={isGenerating}
            />
          </div>

          {/* Duration + Audience side by side */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1.5">
                Duration (seconds) <span className="text-[#A63228]">*</span>
              </h3>
              <p className="text-[13px] text-muted-foreground mb-3">
                Target length in seconds
              </p>
              <Input
                type="number"
                min="1"
                step="1"
                value={selectedDuration ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setSelectedDuration(null);
                  } else {
                    const parsed = parseInt(val, 10);
                    if (!isNaN(parsed) && parsed > 0) {
                      setSelectedDuration(parsed);
                    }
                  }
                }}
                placeholder="e.g., 600"
                disabled={isGenerating}
                className="text-[15px]"
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1.5">
                Target Audience <span className="text-[#A63228]">*</span>
              </h3>
              <p className="text-[13px] text-muted-foreground mb-3">
                Who is this video for?
              </p>
              <Input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g., Data analysts, business analysts..."
                disabled={isGenerating}
                className="text-[15px]"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Sources */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1.5">
              Sources <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
            </h3>
            <p className="text-[13px] text-muted-foreground mb-3">
              Upload reference materials to give the AI more context
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                variant={inputMode === "upload" ? "default" : "outline"}
                size="sm"
                onClick={() => setInputMode(inputMode === "upload" ? null : "upload")}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload files
              </Button>
              <Button
                variant={inputMode === "link" ? "default" : "outline"}
                size="sm"
                onClick={() => setInputMode(inputMode === "link" ? null : "link")}
                className="gap-2"
              >
                <Link2 className="w-4 h-4" />
                Paste link
              </Button>
              <Button
                variant={inputMode === "text" ? "default" : "outline"}
                size="sm"
                onClick={() => setInputMode(inputMode === "text" ? null : "text")}
                className="gap-2"
              >
                <FileText className="w-4 h-4" />
                Paste text
              </Button>
            </div>

            {/* File Upload Zone */}
            {inputMode === "upload" && (
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-foreground mb-1">
                  Drag and drop files here, or{" "}
                  <button
                    className="text-primary hover:underline font-medium"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  Supported: PDF, TXT, MD, DOC, DOCX
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFileUpload(e.target.files);
                  }}
                />
              </div>
            )}

            {/* Link Input */}
            {inputMode === "link" && (
              <div className="flex gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Paste a URL (e.g., https://example.com/article)"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddLink();
                    }
                  }}
                />
                <Button onClick={handleAddLink} disabled={!linkInput.trim()}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            )}

            {/* Text Input */}
            {inputMode === "text" && (
              <div className="space-y-3">
                <Textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste or type your text here..."
                  className="min-h-[120px]"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAddText} disabled={!textInput.trim()}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add note
                  </Button>
                </div>
              </div>
            )}

            {/* Added Sources List */}
            {sources.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {sources.length} source{sources.length !== 1 ? "s" : ""} added
                </p>
                <div className="flex flex-wrap gap-2">
                  {sources.map((source) => (
                    <div
                      key={source.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm"
                    >
                      {getSourceIcon(source.type)}
                      <span className="max-w-[200px] truncate">{source.name}</span>
                      <button
                        onClick={() => removeSource(source.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Row — left-aligned */}
          <div className="flex justify-start pt-2">
            <Button
              onClick={handleGenerate}
              disabled={!isFormValid || isGenerating}
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isUploadingFiles ? "Processing sources..." : "Generating..."}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Generate Storyboard
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
