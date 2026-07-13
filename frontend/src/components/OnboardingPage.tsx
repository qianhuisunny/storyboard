import { forwardRef, useCallback, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  File,
  GalleryHorizontal,
  GalleryVertical,
  Globe,
  LayoutTemplate,
  Loader2,
  Monitor,
  Paperclip,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Square,
  Type,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAnonymousUserId } from "@/lib/anonymousUser";

type SourceKind = "file" | "link" | "text";
type SourceStatus = "pending" | "processing" | "ready" | "failed";
type InputMode = "upload" | "link" | "text";

interface Source {
  id: string;
  type: SourceKind;
  name: string;
  status: SourceStatus;
  content?: string;
  file?: globalThis.File;
  url?: string;
  title?: string;
  path?: string;
  extractedContent?: string;
  error?: string;
}

interface WorkflowResponse {
  artifacts?: {
    intake?: {
      current_version_id?: string | null;
    };
  };
}

const PLATFORM_OPTIONS = [
  { value: "youtube", label: "YouTube", description: "Long-form or standard video" },
  { value: "short_form", label: "Short-form social", description: "Reels, Shorts, and TikTok" },
  { value: "internal_lms", label: "Internal LMS", description: "Training and enablement" },
  { value: "general", label: "General", description: "No platform-specific constraints" },
] as const;

const DURATION_OPTIONS = [60, 90, 120, 180, 240, 300, 600, 900, 1200];
const RATIO_OPTIONS = [
  { value: "16:9", Icon: RectangleHorizontal },
  { value: "4:3", Icon: GalleryHorizontal },
  { value: "1:1", Icon: Square },
  { value: "3:4", Icon: GalleryVertical },
  { value: "9:16", Icon: RectangleVertical },
] as const;

function formatDuration(seconds: number): string {
  if (seconds === 60) return "1 min";
  if (seconds === 90) return "90 sec";
  if (seconds % 60 === 0) return `${seconds / 60} mins`;
  return `${seconds} sec`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (typeof body.detail?.message === "string") return body.detail.message;
  } catch {
    // Use the stable fallback for non-JSON responses.
  }
  return fallback;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [userId] = useState(() => getAnonymousUserId());
  const [userInput, setUserInput] = useState("");
  const [selectedDuration, setSelectedDuration] = useState(300);
  const [platform, setPlatform] = useState("youtube");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [sources, setSources] = useState<Source[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [linkInput, setLinkInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectIdRef = useRef<string | null>(null);
  const intakeVersionIdRef = useRef<string | null>(null);

  const platformLabel = PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? "Platform";
  const failedSources = sources.filter((source) => source.status === "failed");
  const isFormValid = userInput.trim().length > 0;

  const handleFileUpload = useCallback((files: FileList | globalThis.File[]) => {
    const validTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const validExtensions = [".pdf", ".txt", ".md", ".doc", ".docx"];
    const validFiles = Array.from(files).filter((file) => {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
      return validTypes.includes(file.type) || validExtensions.includes(extension);
    });

    if (validFiles.length === 0) {
      setSourceError("Upload a PDF, TXT, MD, DOC, or DOCX file.");
      return;
    }

    setSources((current) => [
      ...current,
      ...validFiles.map((file) => ({
        id: `file-${crypto.randomUUID()}`,
        type: "file" as const,
        name: file.name,
        file,
        status: "pending" as const,
      })),
    ]);
    setSourceError(null);
  }, []);

  const handleAddLink = () => {
    const raw = linkInput.trim();
    if (!raw) return;
    try {
      if (/\s/.test(raw)) throw new Error("Invalid URL");
      const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(value);
      if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid URL");
      setSources((current) => [
        ...current,
        {
          id: `link-${crypto.randomUUID()}`,
          type: "link",
          name: parsed.hostname,
          url: parsed.toString(),
          status: "pending",
        },
      ]);
      setLinkInput("");
      setSourceError(null);
    } catch {
      setSourceError("Enter a valid URL.");
    }
  };

  const handleAddText = () => {
    const content = textInput.trim();
    if (!content) return;
    setSources((current) => [
      ...current,
      {
        id: `text-${crypto.randomUUID()}`,
        type: "text",
        name: `Text note ${current.filter((source) => source.type === "text").length + 1}`,
        content,
        extractedContent: content,
        status: "ready",
      },
    ]);
    setTextInput("");
    setSourceError(null);
  };

  const createProject = async (): Promise<string> => {
    if (projectIdRef.current) return projectIdRef.current;
    const projectId = Date.now().toString();
    const response = await fetch("/api/create-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        typeId: 1,
        typeName: "Video storyboard",
        userInput: userInput.trim(),
        userId,
      }),
    });
    if (!response.ok) throw new Error(await readError(response, "Could not create the project."));
    const body = await response.json() as { projectId?: string };
    const persistedProjectId = body.projectId || projectId;
    projectIdRef.current = persistedProjectId;
    sessionStorage.setItem("projectId", persistedProjectId);
    return persistedProjectId;
  };

  const persistedSources = (items: Source[]) => items.map((source) => ({
    id: source.id,
    kind: source.type === "file" ? "upload" : source.type,
    name: source.name,
    ...(source.url ? { url: source.url } : {}),
    status: source.status,
    ...(source.title ? { title: source.title } : {}),
    ...(source.path ? { path: source.path } : {}),
    ...(source.error ? { error: source.error } : {}),
  }));

  const sourceSnapshot = (items: Source[]) => items
    .filter((source) => source.status === "ready" && source.extractedContent)
    .map((source) => `[${source.type === "link" ? "Link" : source.type === "file" ? "File" : "Note"}: ${source.name}]\n${source.extractedContent}`)
    .join("\n\n---\n\n");

  const saveIntake = async (projectId: string, items: Source[]): Promise<void> => {
    const response = await fetch(`/api/project/${projectId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "save_intake",
        payload: {
          content: {
            prompt: userInput.trim(),
            duration_seconds: selectedDuration,
            platform,
            aspect_ratio: aspectRatio,
            source_snapshot: sourceSnapshot(items),
            sources: persistedSources(items),
          },
          expected_version_id: intakeVersionIdRef.current,
        },
      }),
    });
    if (!response.ok) throw new Error(await readError(response, "Could not save the project setup."));
    const body = await response.json() as WorkflowResponse;
    intakeVersionIdRef.current = body.artifacts?.intake?.current_version_id ?? null;
  };

  const processSource = async (projectId: string, source: Source): Promise<Source> => {
    if (source.type === "text") return { ...source, status: "ready", error: undefined };
    let response: Response;
    if (source.type === "file" && source.file) {
      const formData = new FormData();
      formData.append("file", source.file);
      response = await fetch(`/api/project/${projectId}/upload`, { method: "POST", body: formData });
    } else if (source.type === "link" && source.url) {
      response = await fetch(`/api/project/${projectId}/fetch-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });
    } else {
      throw new Error("Source is missing its file or URL.");
    }
    if (!response.ok) throw new Error(await readError(response, "Source could not be read."));
    const body = await response.json() as { content?: string; path?: string; title?: string; filename?: string };
    return {
      ...source,
      name: body.title || body.filename || source.name,
      title: body.title,
      path: body.path,
      extractedContent: body.content ?? "",
      status: "ready",
      error: undefined,
    };
  };

  const ingestSources = async (projectId: string, current: Source[], onlyFailed = false): Promise<Source[]> => {
    const targets = current.filter((source) => onlyFailed ? source.status === "failed" : source.status === "pending" || source.status === "failed");
    if (targets.length === 0) return current;

    const targetIds = new Set(targets.map((source) => source.id));
    setSources((items) => items.map((source) => targetIds.has(source.id) ? { ...source, status: "processing", error: undefined } : source));
    const results = await Promise.allSettled(targets.map((source) => processSource(projectId, source)));
    const replacements = new Map<string, Source>();
    results.forEach((result, index) => {
      const source = targets[index];
      replacements.set(source.id, result.status === "fulfilled"
        ? result.value
        : { ...source, status: "failed", error: result.reason instanceof Error ? result.reason.message : "Source could not be read." });
    });
    const processed = current.map((source) => replacements.get(source.id) ?? source);
    setSources(processed);
    return processed;
  };

  const finishCreate = (projectId: string) => {
    sessionStorage.setItem("projectId", projectId);
    navigate(`/storyboard/${projectId}`);
  };

  const handleGenerate = async () => {
    if (!isFormValid || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const projectId = await createProject();
      await saveIntake(projectId, sources);
      const processed = await ingestSources(projectId, sources);
      if (processed !== sources) await saveIntake(projectId, processed);
      if (processed.some((source) => source.status === "failed")) return;
      finishCreate(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the project.");
    } finally {
      setIsGenerating(false);
    }
  };

  const retryFailedSources = async () => {
    const projectId = projectIdRef.current;
    if (!projectId || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const processed = await ingestSources(projectId, sources, true);
      await saveIntake(projectId, processed);
      if (!processed.some((source) => source.status === "failed")) finishCreate(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry the source.");
    } finally {
      setIsGenerating(false);
    }
  };

  const continueWithoutFailedSources = () => {
    if (projectIdRef.current) finishCreate(projectIdRef.current);
  };

  const sourceIcon = (source: Source) => {
    if (source.type === "file") return <File className="h-4 w-4" />;
    if (source.type === "link") return <Globe className="h-4 w-4" />;
    return <Type className="h-4 w-4" />;
  };

  return (
    <main className="create-workflow min-h-full bg-[#FBFAF7] px-5 py-14 text-[#2A2A28] sm:px-8 lg:py-20">
      <section className="mx-auto flex min-h-[520px] max-w-[680px] items-center">
        <div className="w-full">
          <h1 className="create-workflow__heading mb-8 text-center text-[30px] font-normal leading-[1.16] tracking-[-0.7px] sm:text-[36px]">
            What <span className="border-b-2 border-dashed border-[#A8C8AD] text-[#3A6B47]">video storyboard</span> do you want to create today?
          </h1>

          <div className="rounded-xl border border-[#DEDCD4] bg-white px-5 pb-4 pt-5 shadow-[0_1px_3px_rgba(42,42,40,0.05)] sm:px-[22px]">
            <div className="flex items-start gap-3">
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button type="button" aria-label="Attach source" className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] border border-[#DEDCD4] bg-[#F7F5F0] text-[#73736C] transition hover:border-[#A8C8AD] hover:text-[#3A6B47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A6B47]">
                    <Plus className="h-5 w-5" />
                  </button>
                </Popover.Trigger>
                <SourcePopoverContent
                  sources={sources}
                  setSources={setSources}
                  inputMode={inputMode}
                  setInputMode={setInputMode}
                  linkInput={linkInput}
                  setLinkInput={setLinkInput}
                  textInput={textInput}
                  setTextInput={setTextInput}
                  sourceError={sourceError}
                  handleAddLink={handleAddLink}
                  handleAddText={handleAddText}
                  handleFileUpload={handleFileUpload}
                  isDragging={isDragging}
                  setIsDragging={setIsDragging}
                  fileInputRef={fileInputRef}
                  sourceIcon={sourceIcon}
                />
              </Popover.Root>

              <label className="sr-only" htmlFor="video-prompt">Describe your video</label>
              <textarea
                id="video-prompt"
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && isFormValid) {
                    event.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder="Describe what you want to create…"
                className="min-h-[88px] flex-1 resize-none border-0 bg-transparent pt-2 text-[16px] leading-6 outline-none placeholder:text-[#AAA79F] focus-visible:ring-0"
                disabled={isGenerating}
              />
            </div>

            <div className="mb-3 h-px bg-[#E4E1D9]" />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <ChoicePopover triggerName="Platform" label={platformLabel} icon={<Monitor className="h-3.5 w-3.5" />}>
                  <div className="w-[260px] py-1.5">
                    {PLATFORM_OPTIONS.map((option) => (
                      <Popover.Close asChild key={option.value}>
                        <button type="button" role="option" aria-selected={platform === option.value} aria-label={`${option.label}. ${option.description}`} onClick={() => setPlatform(option.value)} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F7F5F0] focus:bg-[#F7F5F0] focus:outline-none", platform === option.value && "bg-[#E8F0E9]")}>
                          <span className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-full border", platform === option.value ? "border-[#3A6B47] bg-[#3A6B47]" : "border-[#CFCBC1]")}>{platform === option.value && <Check className="h-3 w-3 text-white" />}</span>
                          <span><span className="block text-sm font-semibold">{option.label}</span><span className="block text-xs text-[#6B6B65]">{option.description}</span></span>
                        </button>
                      </Popover.Close>
                    ))}
                  </div>
                </ChoicePopover>

                <Popover.Root>
                  <Popover.Trigger asChild>
                    <ChipButton ariaLabel={`Sources: ${sources.length} attached`} icon={<Paperclip className="h-3.5 w-3.5" />} label={`${sources.length} source${sources.length === 1 ? "" : "s"}`} />
                  </Popover.Trigger>
                  <SourcePopoverContent
                    sources={sources}
                    setSources={setSources}
                    inputMode={inputMode}
                    setInputMode={setInputMode}
                    linkInput={linkInput}
                    setLinkInput={setLinkInput}
                    textInput={textInput}
                    setTextInput={setTextInput}
                    sourceError={sourceError}
                    handleAddLink={handleAddLink}
                    handleAddText={handleAddText}
                    handleFileUpload={handleFileUpload}
                    isDragging={isDragging}
                    setIsDragging={setIsDragging}
                    fileInputRef={fileInputRef}
                    sourceIcon={sourceIcon}
                  />
                </Popover.Root>

                <ChoicePopover triggerName="Duration" label={formatDuration(selectedDuration)} icon={<Clock3 className="h-3.5 w-3.5" />}>
                  <div className="w-[270px] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#6B6B65]">Duration</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {DURATION_OPTIONS.map((seconds) => (
                        <Popover.Close asChild key={seconds}>
                          <button type="button" role="option" aria-selected={selectedDuration === seconds} onClick={() => setSelectedDuration(seconds)} className={cn("rounded-lg border border-transparent bg-[#F7F5F0] px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#3A6B47]", selectedDuration === seconds && "border-[#3A6B47] bg-[#E8F0E9] font-semibold text-[#3A6B47]")}>{formatDuration(seconds)}</button>
                        </Popover.Close>
                      ))}
                    </div>
                  </div>
                </ChoicePopover>

                <ChoicePopover triggerName="Aspect ratio" label={aspectRatio} icon={<LayoutTemplate className="h-3.5 w-3.5" />}>
                  <div className="w-[320px] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#6B6B65]">Aspect ratio</p>
                    <div className="flex gap-1 rounded-lg bg-[#F7F5F0] p-2">
                      {RATIO_OPTIONS.map(({ value, Icon }) => (
                        <Popover.Close asChild key={value}>
                          <button type="button" role="option" aria-selected={aspectRatio === value} onClick={() => setAspectRatio(value)} className={cn("flex flex-1 flex-col items-center gap-2 rounded-lg px-1 py-2 text-xs text-[#6B6B65] focus:outline-none focus:ring-2 focus:ring-[#3A6B47]", aspectRatio === value && "bg-white font-semibold text-[#2A2A28] shadow-sm")}><Icon aria-hidden="true" className="h-6 w-6 stroke-[1.5]" />{value}</button>
                        </Popover.Close>
                      ))}
                    </div>
                  </div>
                </ChoicePopover>
              </div>

              <button type="button" aria-label="Create storyboard" onClick={() => void handleGenerate()} disabled={!isFormValid || isGenerating} className="inline-flex min-w-[118px] items-center justify-center gap-2 self-end rounded-lg bg-[#3A6B47] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#2E5439] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A6B47] disabled:cursor-not-allowed disabled:opacity-40 lg:self-auto">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {isGenerating ? "Preparing…" : "Create"}
              </button>
            </div>
          </div>

          {failedSources.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#D8B7AE] bg-[#FFF8F5] p-4" role="status">
              <div className="flex items-start gap-3">
                <Globe className="mt-0.5 h-4 w-4 text-[#A63228]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{failedSources.length} source{failedSources.length === 1 ? "" : "s"} need{failedSources.length === 1 ? "s" : ""} attention</p>
                  <ul className="mt-1 space-y-1 text-xs text-[#6B6B65]">
                    {failedSources.map((source) => <li key={source.id}><span className="font-medium text-[#2A2A28]">{source.name}</span> — {source.error}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-[#6B6B65]">Your project and the successful sources are already saved.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={continueWithoutFailedSources} className="rounded-md border border-[#CFCBC1] bg-white px-3 py-2 text-xs font-semibold hover:border-[#A8C8AD]">Continue without failed source{failedSources.length === 1 ? "" : "s"}</button>
                <button type="button" onClick={() => void retryFailedSources()} disabled={isGenerating} className="inline-flex items-center gap-1.5 rounded-md bg-[#3A6B47] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2E5439] disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Retry failed source{failedSources.length === 1 ? "" : "s"}</button>
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-3 text-center text-sm text-[#A63228]">{error}</p>}
          <p className="mt-4 text-center text-sm text-[#6B6B65]">A rough idea is enough. Plotline will clarify the decisions that shape the outline next.</p>
        </div>
      </section>
    </main>
  );
}

interface ChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ariaLabel: string;
  icon: React.ReactNode;
  label: string;
}

const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(function ChipButton(
  { ariaLabel, icon, label, ...triggerProps },
  ref,
) {
  return (
    <button ref={ref} type="button" aria-label={ariaLabel} {...triggerProps} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#E0DED7] px-3 py-1.5 text-[13px] text-[#686861] transition hover:border-[#A8C8AD] hover:text-[#3A6B47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A6B47] data-[state=open]:border-[#3A6B47] data-[state=open]:bg-[#E8F0E9] data-[state=open]:font-semibold data-[state=open]:text-[#3A6B47]">
      {icon}{label}<ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
    </button>
  );
});

function ChoicePopover({ triggerName, label, icon, children }: { triggerName: string; label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <ChipButton ariaLabel={`${triggerName}: ${label}`} icon={icon} label={label} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content role="dialog" aria-label={`${triggerName} options`} sideOffset={6} align="start" collisionPadding={12} className="create-workflow z-50 overflow-hidden rounded-[10px] border border-[#E0DED7] bg-white text-[#2A2A28] shadow-[0_8px_24px_rgba(42,42,40,0.10),0_2px_6px_rgba(42,42,40,0.06)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface SourcePopoverProps {
  sources: Source[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
  linkInput: string;
  setLinkInput: (value: string) => void;
  textInput: string;
  setTextInput: (value: string) => void;
  sourceError: string | null;
  handleAddLink: () => void;
  handleAddText: () => void;
  handleFileUpload: (files: FileList | globalThis.File[]) => void;
  isDragging: boolean;
  setIsDragging: (value: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  sourceIcon: (source: Source) => React.ReactNode;
}

function SourcePopoverContent(props: SourcePopoverProps) {
  const { sources, setSources, inputMode, setInputMode, linkInput, setLinkInput, textInput, setTextInput, sourceError, handleAddLink, handleAddText, handleFileUpload, isDragging, setIsDragging, fileInputRef, sourceIcon } = props;
  return (
    <Popover.Portal>
      <Popover.Content role="dialog" aria-label="Sources" sideOffset={6} align="start" collisionPadding={12} className="create-workflow z-50 w-[min(360px,calc(100vw-40px))] rounded-[10px] border border-[#E0DED7] bg-white p-3 text-[#2A2A28] shadow-[0_8px_24px_rgba(42,42,40,0.10),0_2px_6px_rgba(42,42,40,0.06)] outline-none">
        <div role="tablist" aria-label="Source type" className="mb-3 flex gap-1 rounded-lg bg-[#F7F5F0] p-1">
          {(["upload", "link", "text"] as InputMode[]).map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={inputMode === mode} onClick={() => setInputMode(mode)} className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-semibold capitalize text-[#73736C] focus:outline-none focus:ring-2 focus:ring-[#3A6B47]", inputMode === mode && "bg-white text-[#2A2A28] shadow-sm")}>{mode}</button>
          ))}
        </div>

        {inputMode === "upload" && (
          <div className={cn("rounded-lg border border-dashed p-5 text-center", isDragging ? "border-[#3A6B47] bg-[#E8F0E9]" : "border-[#CFCBC1]")} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); handleFileUpload(event.dataTransfer.files); }}>
            <Upload className="mx-auto mb-2 h-5 w-5 text-[#73736C]" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-[#3A6B47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A6B47]">Choose files</button>
            <p className="mt-1 text-xs text-[#6B6B65]">PDF, DOCX, TXT, or Markdown</p>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.doc,.docx" className="hidden" onChange={(event) => event.target.files && handleFileUpload(event.target.files)} />
          </div>
        )}
        {inputMode === "link" && (
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="source-url">Source URL</label>
            <input id="source-url" value={linkInput} onChange={(event) => setLinkInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleAddLink()} placeholder="Paste a URL" aria-invalid={sourceError === "Enter a valid URL."} className="min-w-0 flex-1 rounded-md border border-[#E0DED7] px-3 py-2 text-sm outline-none focus:border-[#3A6B47] focus:ring-1 focus:ring-[#3A6B47]" />
            <button type="button" aria-label="Add link" onClick={handleAddLink} className="rounded-md bg-[#3A6B47] px-3 text-sm font-semibold text-white hover:bg-[#2E5439]">Add</button>
          </div>
        )}
        {inputMode === "text" && (
          <div className="space-y-2">
            <label className="sr-only" htmlFor="source-text">Source notes</label>
            <textarea id="source-text" value={textInput} onChange={(event) => setTextInput(event.target.value)} placeholder="Paste notes or source text" className="min-h-24 w-full resize-none rounded-md border border-[#E0DED7] px-3 py-2 text-sm outline-none focus:border-[#3A6B47] focus:ring-1 focus:ring-[#3A6B47]" />
            <button type="button" onClick={handleAddText} className="w-full rounded-md bg-[#3A6B47] py-2 text-sm font-semibold text-white hover:bg-[#2E5439]">Add note</button>
          </div>
        )}

        {sourceError && <p role="alert" className="mt-2 text-xs text-[#A63228]">{sourceError}</p>}
        {sources.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-[#E4E1D9] pt-3">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#F7F5F0]">
                <span className="text-[#73736C]">{sourceIcon(source)}</span>
                <span className="min-w-0 flex-1 truncate">{source.name}</span>
                {source.status === "processing" && <Loader2 aria-label="Reading source" className="h-3.5 w-3.5 animate-spin text-[#3A6B47]" />}
                {source.status === "failed" && <span className="text-xs font-semibold text-[#A63228]">Failed</span>}
                <button type="button" aria-label={`Remove ${source.name}`} onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} className="text-[#AAA79F] hover:text-[#2A2A28]"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Popover.Content>
    </Popover.Portal>
  );
}
