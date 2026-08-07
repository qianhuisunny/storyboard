import { forwardRef, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Tabs from "@radix-ui/react-tabs";
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
import { ensureSession } from "@/lib/session";
import {
  deriveCanonicalSourceSnapshot,
  normalizeCanonicalSourceContents,
  type CanonicalIntakeSource,
  type WorkflowResponse,
} from "@/lib/workflow";

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

const MAX_PROMPT_CHARS = 6_000;
const MAX_NOTE_CHARS = 20_000;
const MAX_INTAKE_CHARS = 250_000;
const MAX_SOURCES = 20;
const MAX_SOURCE_URL_CHARS = 2_048;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const RETIRED_ONBOARDING_KEYS = [
  "storyboardPrompt",
  "storyboardType",
  "storyboardTypeName",
  "storyboardIntentRoute",
  "storyboardContentMode",
  "storyboardContext",
  "storyboardDuration",
  "storyboardPlatform",
  "storyboardAspectRatio",
  "storyboardAudience",
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
  const [allocatedProjectId] = useState(() => crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectConfirmedRef = useRef(false);
  const intakeVersionIdRef = useRef<string | null>(null);

  const platformLabel = PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? "Platform";
  const failedSources = sources.filter((source) => source.status === "failed");
  const isFormValid = userInput.trim().length > 0;

  const handleFileUpload = (files: FileList | globalThis.File[]) => {
    const validTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const validExtensions = [".pdf", ".txt", ".md", ".docx"];
    const validFiles = Array.from(files).filter((file) => {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
      return file.size <= MAX_UPLOAD_BYTES && (validTypes.includes(file.type) || validExtensions.includes(extension));
    });

    if (validFiles.length === 0) {
      setSourceError("Upload a PDF, TXT, MD, or DOCX file up to 10 MB.");
      return;
    }
    const availableSlots = MAX_SOURCES - sources.length;
    if (availableSlots <= 0) {
      setSourceError(`You can attach up to ${MAX_SOURCES} sources.`);
      return;
    }
    const accepted = validFiles.slice(0, availableSlots);
    setSources((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: `file-${crypto.randomUUID()}`,
        type: "file" as const,
        name: file.name.slice(0, 255),
        file,
        status: "pending" as const,
      })),
    ]);
    setSourceError(accepted.length < validFiles.length ? `Only the first ${availableSlots} files were added.` : null);
  };

  const handleAddLink = () => {
    const raw = linkInput.trim();
    if (!raw) return;
    try {
      if (sources.length >= MAX_SOURCES) throw new Error("Source limit");
      if (raw.length > MAX_SOURCE_URL_CHARS) throw new Error("URL too long");
      if (/\s/.test(raw)) throw new Error("Invalid URL");
      const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(value);
      if (!parsed.hostname || parsed.username || parsed.password || !["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid URL");
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
      setSourceError(sources.length >= MAX_SOURCES ? `You can attach up to ${MAX_SOURCES} sources.` : "Enter a valid URL.");
    }
  };

  const handleAddText = () => {
    const content = textInput.trim();
    if (!content) return;
    if (sources.length >= MAX_SOURCES) {
      setSourceError(`You can attach up to ${MAX_SOURCES} sources.`);
      return;
    }
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

  const postCreateProject = async (): Promise<void> => {
    const response = await fetch("/api/create-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: allocatedProjectId,
        typeId: 1,
        typeName: "Video storyboard",
        userInput: userInput.trim(),
      }),
    });
    if (!response.ok) throw new Error(await readError(response, "Could not create the project."));
    const body = await response.json() as { projectId?: string };
    if (body.projectId !== allocatedProjectId) throw new Error("The server did not confirm the allocated project ID.");
  };

  const reconcileProject = async (): Promise<boolean> => {
    const response = await fetch(`/api/project/${allocatedProjectId}`);
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(await readError(response, "Could not confirm the project."));
    const body = await response.json() as { project?: { id?: string } };
    if (body.project?.id !== allocatedProjectId) throw new Error("The server returned a different project.");
    return true;
  };

  const createProject = async (): Promise<string> => {
    if (projectConfirmedRef.current) return allocatedProjectId;
    try {
      await postCreateProject();
    } catch (firstError) {
      if (await reconcileProject()) {
        projectConfirmedRef.current = true;
        return allocatedProjectId;
      }
      try {
        await postCreateProject();
      } catch (retryError) {
        if (!await reconcileProject()) throw retryError instanceof Error ? retryError : firstError;
      }
    }
    projectConfirmedRef.current = true;
    return allocatedProjectId;
  };

  const persistedSources = (items: Source[]): CanonicalIntakeSource[] => items.map((source) => ({
    id: source.id,
    kind: source.type === "file" ? "upload" : source.type,
    name: source.name.slice(0, 255),
    ...(source.url ? { url: source.url } : {}),
    status: source.status,
    ...(source.title ? { title: source.title } : {}),
    ...(source.path ? { path: source.path } : {}),
    ...(source.error ? { error: source.error } : {}),
  }));

  const intakeContent = (items: Source[]) => {
    const persisted = persistedSources(items);
    const rawSourceContents = Object.fromEntries(
      items
        .filter((source) => source.status === "ready" && source.extractedContent)
        .map((source) => [source.id, source.extractedContent as string]),
    );
    const sourceContents = normalizeCanonicalSourceContents(persisted, rawSourceContents);
    const content = {
      prompt: userInput.trim(),
      duration_seconds: selectedDuration,
      platform,
      aspect_ratio: aspectRatio,
      source_snapshot: deriveCanonicalSourceSnapshot(persisted, sourceContents),
      source_contents: sourceContents,
      sources: persisted,
    };
    if (JSON.stringify(content).length > MAX_INTAKE_CHARS) {
      throw new Error("Project setup is too large. Remove or shorten a source.");
    }
    return content;
  };

  const stableContent = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stableContent);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, stableContent(item)]),
      );
    }
    return value;
  };
  const sameContent = (left: unknown, right: unknown) => JSON.stringify(stableContent(left)) === JSON.stringify(stableContent(right));

  const reconcileIntake = async (projectId: string, desired: Record<string, unknown>): Promise<void> => {
    const response = await fetch(`/api/project/${projectId}/pipeline-state`);
    if (!response.ok) throw new Error("The save result could not be confirmed. Try again.");
    const body = await response.json() as WorkflowResponse & { artifacts?: { intake?: { current_version_id?: string | null; current_content?: unknown } } };
    const versionId = body.artifacts?.intake?.current_version_id;
    const currentContent = body.artifacts?.intake?.current_content;
    if (typeof versionId === "string" && versionId && sameContent(currentContent, desired)) {
      intakeVersionIdRef.current = versionId;
      return;
    }
    throw new Error("This project setup changed elsewhere. Review the latest version before continuing.");
  };

  const saveIntake = async (projectId: string, items: Source[]): Promise<void> => {
    const content = intakeContent(items);
    let response: Response;
    try {
      response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "save_intake",
          payload: { content, expected_version_id: intakeVersionIdRef.current },
        }),
      });
    } catch {
      await reconcileIntake(projectId, content);
      return;
    }
    if (response.status === 409) {
      const conflict = await response.json().catch(() => null) as { detail?: { current_version_id?: unknown } } | null;
      const currentVersionId = conflict?.detail?.current_version_id;
      if (currentVersionId !== null && (typeof currentVersionId !== "string" || !currentVersionId)) {
        throw new Error("The server returned an invalid version conflict.");
      }
      await reconcileIntake(projectId, content);
      return;
    }
    if (!response.ok) throw new Error(await readError(response, "Could not save the project setup."));
    const body = await response.json() as WorkflowResponse;
    const versionId = body.artifacts?.intake?.current_version_id;
    if (typeof versionId !== "string" || !versionId) {
      await reconcileIntake(projectId, content);
      return;
    }
    intakeVersionIdRef.current = versionId;
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

  const ingestSources = async (projectId: string, current: Source[]): Promise<Source[]> => {
    const targets = current.filter((source) => source.status === "pending" || source.status === "failed");
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
    RETIRED_ONBOARDING_KEYS.forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.setItem("projectId", projectId);
    navigate(`/storyboard/${projectId}`);
  };

  const handleGenerate = async () => {
    if (!isFormValid || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      await ensureSession();
      const projectId = await createProject();
      await saveIntake(projectId, sources);
      const processed = await ingestSources(projectId, sources);
      if (processed !== sources) await saveIntake(projectId, processed);
      if (!processed.every((source) => source.status === "ready")) return;
      finishCreate(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the project.");
    } finally {
      setIsGenerating(false);
    }
  };

  const retryFailedSources = async () => {
    if (!projectConfirmedRef.current || isGenerating) return;
    const projectId = allocatedProjectId;
    setIsGenerating(true);
    setError(null);
    try {
      await ensureSession();
      const processed = await ingestSources(projectId, sources);
      await saveIntake(projectId, processed);
      if (processed.every((source) => source.status === "ready")) finishCreate(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry the source.");
    } finally {
      setIsGenerating(false);
    }
  };

  const continueWithoutFailedSources = async () => {
    if (!projectConfirmedRef.current || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const retained = sources.filter((source) => source.status !== "failed");
      setSources(retained);
      const processed = await ingestSources(allocatedProjectId, retained);
      await saveIntake(allocatedProjectId, processed);
      if (!processed.every((source) => source.status === "ready")) {
        throw new Error("Finish reading or remove every remaining source before continuing.");
      }
      finishCreate(allocatedProjectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not continue without the failed source.");
    } finally {
      setIsGenerating(false);
    }
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
            <div className="mb-[18px] flex items-start gap-3">
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button type="button" aria-label="Attach source" disabled={isGenerating} className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] border border-[#DEDCD4] bg-[#F7F5F0] text-[#73736C] transition hover:border-[#A8C8AD] hover:text-[#3A6B47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A6B47] disabled:cursor-not-allowed disabled:opacity-40">
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
                  disabled={isGenerating}
                />
              </Popover.Root>

              <label className="sr-only" htmlFor="video-prompt">Describe your video</label>
              <textarea
                id="video-prompt"
                rows={1}
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                maxLength={MAX_PROMPT_CHARS}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && isFormValid) {
                    event.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder="Describe what you want to create…"
                className="min-h-10 flex-1 resize-none border-0 bg-transparent pt-2 text-[16px] leading-6 outline-none placeholder:text-[#AAA79F] focus-visible:ring-0"
                disabled={isGenerating}
              />
            </div>

            <div className="mb-3 h-px bg-[#E4E1D9]" />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <ChoicePopover triggerName="Platform" label={platformLabel} icon={<Monitor className="h-3.5 w-3.5" />} disabled={isGenerating}>
                  {(close) => <RadioGroup.Root
                    aria-label="Platform"
                    value={platform}
                    onValueChange={(value) => { setPlatform(value); close(); }}
                    onKeyDownCapture={(event) => {
                      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
                      const currentValue = (event.target as HTMLButtonElement).value || platform;
                      const index = PLATFORM_OPTIONS.findIndex((item) => item.value === currentValue);
                      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
                      const next = PLATFORM_OPTIONS[(index + direction + PLATFORM_OPTIONS.length) % PLATFORM_OPTIONS.length];
                      event.preventDefault();
                      event.stopPropagation();
                      setPlatform(next.value);
                      close();
                    }}
                    orientation="vertical"
                    className="w-[260px] py-1.5"
                  >
                    {PLATFORM_OPTIONS.map((option) => (
                        <RadioGroup.Item
                          key={option.value}
                          value={option.value}
                          aria-label={`${option.label}. ${option.description}`}
                          className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F7F5F0] focus:bg-[#F7F5F0] focus:outline-none", platform === option.value && "bg-[#E8F0E9]")}
                        >
                          <span className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-full border", platform === option.value ? "border-[#3A6B47] bg-[#3A6B47]" : "border-[#CFCBC1]")}>{platform === option.value && <Check className="h-3 w-3 text-white" />}</span>
                          <span><span className="block text-sm font-semibold">{option.label}</span><span className="block text-xs text-[#6B6B65]">{option.description}</span></span>
                        </RadioGroup.Item>
                    ))}
                  </RadioGroup.Root>}
                </ChoicePopover>

                <Popover.Root>
                  <Popover.Trigger asChild>
                    <ChipButton ariaLabel={`Sources: ${sources.length} attached`} icon={<Paperclip className="h-3.5 w-3.5" />} label={`${sources.length} source${sources.length === 1 ? "" : "s"}`} disabled={isGenerating} />
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
                    disabled={isGenerating}
                  />
                </Popover.Root>

                <ChoicePopover triggerName="Duration" label={formatDuration(selectedDuration)} icon={<Clock3 className="h-3.5 w-3.5" />} disabled={isGenerating}>
                  {(close) =>
                  <div className="w-[270px] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#6B6B65]">Duration</p>
                    <RadioGroup.Root aria-label="Duration" value={String(selectedDuration)} onValueChange={(value) => { setSelectedDuration(Number(value)); close(); }} className="grid grid-cols-3 gap-1.5">
                      {DURATION_OPTIONS.map((seconds) => (
                        <RadioGroup.Item key={seconds} value={String(seconds)} aria-label={formatDuration(seconds)} className={cn("rounded-lg border border-transparent bg-[#F7F5F0] px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#3A6B47]", selectedDuration === seconds && "border-[#3A6B47] bg-[#E8F0E9] font-semibold text-[#3A6B47]")}>{formatDuration(seconds)}</RadioGroup.Item>
                      ))}
                    </RadioGroup.Root>
                  </div>
                  }
                </ChoicePopover>

                <ChoicePopover triggerName="Aspect ratio" label={aspectRatio} icon={<LayoutTemplate className="h-3.5 w-3.5" />} disabled={isGenerating}>
                  {(close) =>
                  <div className="w-[min(320px,calc(100vw-40px))] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#6B6B65]">Aspect ratio</p>
                    <RadioGroup.Root aria-label="Aspect ratio" value={aspectRatio} onValueChange={(value) => { setAspectRatio(value); close(); }} orientation="horizontal" className="flex gap-1 rounded-lg bg-[#F7F5F0] p-2">
                      {RATIO_OPTIONS.map(({ value, Icon }) => (
                        <RadioGroup.Item key={value} value={value} aria-label={value} className={cn("flex flex-1 flex-col items-center gap-2 rounded-lg px-1 py-2 text-xs text-[#6B6B65] focus:outline-none focus:ring-2 focus:ring-[#3A6B47]", aspectRatio === value && "bg-white font-semibold text-[#2A2A28] shadow-sm")}><Icon aria-hidden="true" className="h-6 w-6 stroke-[1.5]" />{value}</RadioGroup.Item>
                      ))}
                    </RadioGroup.Root>
                  </div>
                  }
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
                <button type="button" onClick={() => void continueWithoutFailedSources()} disabled={isGenerating} className="rounded-md border border-[#CFCBC1] bg-white px-3 py-2 text-xs font-semibold hover:border-[#A8C8AD] disabled:cursor-not-allowed disabled:opacity-50">Continue without failed source{failedSources.length === 1 ? "" : "s"}</button>
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

function ChoicePopover({ triggerName, label, icon, children, disabled = false }: { triggerName: string; label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <ChipButton ariaLabel={`${triggerName}: ${label}`} icon={icon} label={label} disabled={disabled} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content role="dialog" aria-label={`${triggerName} options`} sideOffset={6} align="start" collisionPadding={12} className="create-workflow z-50 overflow-hidden rounded-[10px] border border-[#E0DED7] bg-white text-[#2A2A28] shadow-[0_8px_24px_rgba(42,42,40,0.10),0_2px_6px_rgba(42,42,40,0.06)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {children(() => setOpen(false))}
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
  disabled: boolean;
}

function SourcePopoverContent(props: SourcePopoverProps) {
  const { sources, setSources, inputMode, setInputMode, linkInput, setLinkInput, textInput, setTextInput, sourceError, handleAddLink, handleAddText, handleFileUpload, isDragging, setIsDragging, fileInputRef, sourceIcon, disabled } = props;
  return (
    <Popover.Portal>
      <Popover.Content role="dialog" aria-label="Sources" sideOffset={6} align="start" collisionPadding={12} className="create-workflow z-50 w-[min(360px,calc(100vw-40px))] rounded-[10px] border border-[#E0DED7] bg-white p-3 text-[#2A2A28] shadow-[0_8px_24px_rgba(42,42,40,0.10),0_2px_6px_rgba(42,42,40,0.06)] outline-none">
        <Tabs.Root value={inputMode} onValueChange={(value) => setInputMode(value as InputMode)}>
          <Tabs.List aria-label="Source type" className="mb-3 flex gap-1 rounded-lg bg-[#F7F5F0] p-1">
            {(["upload", "link", "text"] as InputMode[]).map((mode) => (
              <Tabs.Trigger key={mode} value={mode} disabled={disabled} className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold capitalize text-[#73736C] focus:outline-none focus:ring-2 focus:ring-[#3A6B47] data-[state=active]:bg-white data-[state=active]:text-[#2A2A28] data-[state=active]:shadow-sm">{mode}</Tabs.Trigger>
            ))}
          </Tabs.List>

        <Tabs.Content value="upload" className="outline-none">
          <div className={cn("rounded-lg border border-dashed p-5 text-center", isDragging ? "border-[#3A6B47] bg-[#E8F0E9]" : "border-[#CFCBC1]")} onDragOver={(event) => { if (disabled) return; event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { if (disabled) return; event.preventDefault(); setIsDragging(false); handleFileUpload(event.dataTransfer.files); }}>
            <Upload className="mx-auto mb-2 h-5 w-5 text-[#73736C]" />
            <button type="button" disabled={disabled} onClick={() => fileInputRef.current?.click()} className="text-sm font-semibold text-[#3A6B47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A6B47] disabled:opacity-50">Choose files</button>
            <p className="mt-1 text-xs text-[#6B6B65]">PDF, DOCX, TXT, or Markdown</p>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.docx" disabled={disabled} className="hidden" onChange={(event) => event.target.files && handleFileUpload(event.target.files)} />
          </div>
        </Tabs.Content>
        <Tabs.Content value="link" className="outline-none">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="source-url">Source URL</label>
            <input id="source-url" value={linkInput} maxLength={MAX_SOURCE_URL_CHARS} disabled={disabled} onChange={(event) => setLinkInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleAddLink()} placeholder="Paste a URL" aria-invalid={sourceError === "Enter a valid URL."} className="min-w-0 flex-1 rounded-md border border-[#E0DED7] px-3 py-2 text-sm outline-none focus:border-[#3A6B47] focus:ring-1 focus:ring-[#3A6B47] disabled:opacity-50" />
            <button type="button" aria-label="Add link" disabled={disabled} onClick={handleAddLink} className="rounded-md bg-[#3A6B47] px-3 text-sm font-semibold text-white hover:bg-[#2E5439] disabled:opacity-50">Add</button>
          </div>
        </Tabs.Content>
        <Tabs.Content value="text" className="outline-none">
          <div className="space-y-2">
            <label className="sr-only" htmlFor="source-text">Source notes</label>
            <textarea id="source-text" value={textInput} maxLength={MAX_NOTE_CHARS} disabled={disabled} onChange={(event) => setTextInput(event.target.value)} placeholder="Paste notes or source text" className="min-h-24 w-full resize-none rounded-md border border-[#E0DED7] px-3 py-2 text-sm outline-none focus:border-[#3A6B47] focus:ring-1 focus:ring-[#3A6B47] disabled:opacity-50" />
            <button type="button" disabled={disabled} onClick={handleAddText} className="w-full rounded-md bg-[#3A6B47] py-2 text-sm font-semibold text-white hover:bg-[#2E5439] disabled:opacity-50">Add note</button>
          </div>
        </Tabs.Content>
        </Tabs.Root>

        {sourceError && <p role="alert" className="mt-2 text-xs text-[#A63228]">{sourceError}</p>}
        {sources.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-[#E4E1D9] pt-3">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#F7F5F0]">
                <span className="text-[#73736C]">{sourceIcon(source)}</span>
                <span className="min-w-0 flex-1 truncate">{source.name}</span>
                {source.status === "processing" && <Loader2 aria-label="Reading source" className="h-3.5 w-3.5 animate-spin text-[#3A6B47]" />}
                {source.status === "failed" && <span className="text-xs font-semibold text-[#A63228]">Failed</span>}
                <button type="button" aria-label={`Remove ${source.name}`} disabled={disabled} onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} className="text-[#AAA79F] hover:text-[#2A2A28] disabled:opacity-40"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Popover.Content>
    </Popover.Portal>
  );
}
