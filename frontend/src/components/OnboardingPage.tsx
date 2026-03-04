import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Play,
  BookOpen,
  Presentation,
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

interface StoryboardType {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  placeholder: string;
}

interface Source {
  id: string;
  type: "file" | "link" | "text";
  name: string;
  content?: string;
  file?: File;
  url?: string;
}

const storyboardTypes: StoryboardType[] = [
  {
    id: 1,
    title: "Product Release Video",
    description:
      "Create compelling product announcements and launch videos that showcase features and benefits",
    icon: <Play className="w-8 h-8" />,
    placeholder:
      "Describe your product launch - features, benefits, target audience...",
  },
  {
    id: 2,
    title: "Product Demo Video",
    description:
      "Showcase your product in action with walkthroughs and feature demonstrations",
    icon: <BookOpen className="w-8 h-8" />,
    placeholder:
      "Describe the product demo - key features to highlight, use cases, target viewers...",
  },
  {
    id: 3,
    title: "Knowledge Sharing",
    description:
      "Develop educational content and training materials to share expertise and insights",
    icon: <Presentation className="w-8 h-8" />,
    placeholder:
      "Describe your educational content - topic, learning objectives, audience...",
  },
];

// Only show Knowledge Sharing tab (hide others at UI level)
const visibleTypes = storyboardTypes.filter(type => type.id === 3);

type InputMode = "upload" | "link" | "text";


const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [selectedType, setSelectedType] = useState<StoryboardType>(
    visibleTypes[0]
  );
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

    // Basic URL validation
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
      // Create project folder and JSON file via backend API
      const response = await fetch("/api/create-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          typeId,
          typeName: selectedType.title,
          userInput,
          userId: user?.id,
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
    console.log("Selected type:", selectedType.title);
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
      // Generate unique project ID
      const projectId = generateProjectId();
      console.log(`[Onboarding] projectId: ${projectId}`);

      // Create project folder structure
      const t1 = performance.now();
      await createProjectFolder(projectId, selectedType.id, userInput);
      console.log(`[Onboarding] createProjectFolder done in ${(performance.now() - t1).toFixed(0)}ms`);

      // Upload files and fetch links in parallel
      const t2 = performance.now();
      const [fileContents, linkContents] = await Promise.all([
        uploadFilesToProject(projectId),
        fetchLinkContents(projectId),
      ]);
      console.log(`[Onboarding] upload/fetch done in ${(performance.now() - t2).toFixed(0)}ms`);

      // Gather text sources
      const textContents = sources
        .filter((s) => s.type === "text" && s.content)
        .map((s) => `[Note: ${s.name}]\n${s.content}`);

      // Combine all context
      const allContext = [...fileContents, ...linkContents, ...textContents].join("\n\n---\n\n");

      setIsUploadingFiles(false);

      // Store project context immediately
      console.log("Storing session data...");
      sessionStorage.setItem("projectId", projectId);
      sessionStorage.setItem("storyboardType", selectedType.id.toString());
      sessionStorage.setItem("storyboardPrompt", userInput);
      sessionStorage.setItem("storyboardDuration", selectedDuration ? String(selectedDuration) : "");
      sessionStorage.setItem("storyboardAudience", audience);
      if (allContext) {
        sessionStorage.setItem("storyboardContext", allContext);
      }
      console.log("Session data stored");

      console.log(`[Onboarding] Navigating in ${(performance.now() - startTime).toFixed(0)}ms`);
      // Navigate to storyboard layout immediately to show loading state
      console.log("Navigating to /storyboard/" + projectId);
      navigate(`/storyboard/${projectId}`);

      // Knowledge Share uses the 3-round briefing flow, not the legacy chat API
      // Skip background AI generation for Knowledge Share (id: 3)
      if (selectedType.id === 3) {
        console.log("[Onboarding] Knowledge Share - skipping legacy chat API");
        return;
      }

      // Start AI generation in background (don't await) - for legacy flow only
      const generateInBackground = async () => {
        console.log("=== BACKGROUND AI GENERATION STARTING ===");
        try {
          // Format input for Langflow
          let promptWithType = `${userInput} with the category type ${selectedType.title}. Please don't use any placeholder, and search the web if you cannot find enough information. Return without confirm needed.`;

          // Add context from sources if available
          if (allContext) {
            promptWithType = `Here is reference material to use:\n\n${allContext}\n\n---\n\nBased on the above context, ${promptWithType}`;
          }

          console.log("Prompt sent to chat API:", promptWithType.substring(0, 500) + "...");

          // Call the chat API to kick off the Langflow flow with extended timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 380000); // 6 minutes 20 seconds

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

          // Store the AI response
          sessionStorage.setItem("initialResponse", data.message);
          console.log("Background AI generation completed for project:", projectId);
        } catch (error) {
          console.error("Background AI generation failed:", error);
        }
      };

      // Start background generation without blocking navigation
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
    <div className="min-h-full bg-background">
      <div className="container mx-auto px-4 py-8 pb-16">
        {/* Header */}
        <div className="text-left mb-12">
          <h1 className="text-4xl font-semibold text-foreground mb-4">
            Create Your Storyboard
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Choose the type of video you want to create and describe your vision
          </p>
        </div>

        {/* Storyboard Type Cards */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 max-w-6xl mx-auto mb-12"
          style={{ gap: "32px" }}
        >
          {visibleTypes.map((type) => (
            <Card
              key={type.id}
              className={cn(
                "p-6 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]",
                "bg-card border-2 hover:border-primary",
                selectedType.id === type.id &&
                  "border-primary ring-2 ring-primary/20 bg-muted"
              )}
              onClick={() => setSelectedType(type)}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div
                  className={cn(
                    "p-4 rounded-full transition-colors",
                    selectedType.id === type.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {type.icon}
                </div>
                <h3 className="text-xl font-semibold text-foreground">
                  {type.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {type.description}
                </p>
              </div>
            </Card>
          ))}
        </div>

        {/* Input Section - Same width as tiles (max-w-6xl) */}
        <div className="max-w-6xl mx-auto">
          <Card className="p-8 bg-card shadow-md">
            <div className="space-y-6">
              {/* Main Input Section - Now first */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Describe Your {selectedType.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  The more details you provide, the better your storyboard will be!
                </p>

                <Textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedType.placeholder}
                  className="min-h-[150px] resize-none text-base"
                  disabled={isGenerating}
                />
              </div>

              {/* Duration Selector */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Video Duration (seconds) <span className="text-red-500">*</span>
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter your target video length in seconds
                </p>
                <div className="flex items-center gap-2">
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
                    placeholder="e.g., 60, 90, 120..."
                    disabled={isGenerating}
                    className="w-40 text-base"
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Target Audience <span className="text-red-500">*</span>
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Who is this video for?
                </p>
                <Input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="e.g., Tech-savvy millennials, Small business owners, Enterprise decision-makers..."
                  disabled={isGenerating}
                  className="text-base"
                />
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Sources Section - Now second */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Add Sources (Optional)
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload files, paste links, or add text to provide context for your storyboard
                </p>

                {/* Source Input Buttons */}
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

                {/* Text Input - Single textarea only */}
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

              {/* Action Row */}
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  Press Enter to generate, Shift+Enter for new line
                </p>
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
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
