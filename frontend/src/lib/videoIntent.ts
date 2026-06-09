export type VideoIntentRouteKey =
  | "product_release"
  | "tutorial_demo"
  | "deep_explainer"
  | "talking_script"
  | "planner_lifestyle";

export interface VideoIntentRoute {
  key: VideoIntentRouteKey;
  label: string;
  typeId: number;
  contentMode: string;
  description: string;
  defaultPlaceholder: string;
}

export const VIDEO_INTENT_ROUTES: Record<VideoIntentRouteKey, VideoIntentRoute> = {
  product_release: {
    key: "product_release",
    label: "Product Release",
    typeId: 1,
    contentMode: "launch_or_feature_story",
    description: "Launches, feature updates, product stories, business CTAs",
    defaultPlaceholder: "e.g., Announce our new AI scheduling feature to operations leaders...",
  },
  tutorial_demo: {
    key: "tutorial_demo",
    label: "Tutorial / Demo",
    typeId: 2,
    contentMode: "step_by_step_walkthrough",
    description: "How-to videos, product demos, screen recordings, workflows",
    defaultPlaceholder: "e.g., Show new users how to set up an automation from scratch...",
  },
  deep_explainer: {
    key: "deep_explainer",
    label: "YouTube Explainer",
    typeId: 3,
    contentMode: "long_form_explainer",
    description: "Longer YouTube explainers, knowledge shares, essays, frameworks",
    defaultPlaceholder: "e.g., Why AI agents work better when each one has a narrow job...",
  },
  talking_script: {
    key: "talking_script",
    label: "Talking Script",
    typeId: 4,
    contentMode: "short_pov_script",
    description: "Speak-to-camera scripts, short opinions, creator monologues",
    defaultPlaceholder: "e.g., I want a sharp 90-second talking script about why planning apps fail...",
  },
  planner_lifestyle: {
    key: "planner_lifestyle",
    label: "Planner / Lifestyle",
    typeId: 5,
    contentMode: "planner_lifestyle_story",
    description: "Planner videos, routines, lifestyle structures, personal process videos",
    defaultPlaceholder: "e.g., A cozy Sunday reset planner video for creators rebuilding their week...",
  },
};

const ROUTE_ALIASES: Record<string, VideoIntentRouteKey> = {
  "product release": "product_release",
  "product_release": "product_release",
  "launch_or_feature_story": "product_release",
  "product demo": "tutorial_demo",
  "product demo video": "tutorial_demo",
  "how-to demo": "tutorial_demo",
  "how_to_demo": "tutorial_demo",
  "step_by_step_walkthrough": "tutorial_demo",
  "knowledge share": "deep_explainer",
  "knowledge sharing": "deep_explainer",
  "knowledge_share": "deep_explainer",
  "knowledge_sharing": "deep_explainer",
  "youtube explainer": "deep_explainer",
  "deep explainer": "deep_explainer",
  "long_form_explainer": "deep_explainer",
  "talking script": "talking_script",
  "talking head": "talking_script",
  "short pov script": "talking_script",
  "short_pov_script": "talking_script",
  "planner / lifestyle": "planner_lifestyle",
  "planner lifestyle": "planner_lifestyle",
  "planner_lifestyle_story": "planner_lifestyle",
};

const DIRECT_ROUTE_PHRASES: Record<VideoIntentRouteKey, string[]> = {
  product_release: [
    "product release",
    "product launch",
    "launch video",
    "feature announcement",
    "product update",
    "发布",
    "上线",
  ],
  tutorial_demo: [
    "product demo",
    "how-to demo",
    "how to",
    "tutorial",
    "walkthrough",
    "step by step",
    "step-by-step",
    "screen recording",
    "教程",
    "演示",
  ],
  deep_explainer: [
    "youtube explainer",
    "deep explainer",
    "deep dive",
    "long-form",
    "long form",
    "video essay",
    "knowledge share",
    "知识分享",
    "长视频",
  ],
  talking_script: [
    "talking script",
    "talking head",
    "speak to camera",
    "to-camera",
    "short pov",
    "short-form script",
    "口播",
    "想说",
  ],
  planner_lifestyle: [
    "planner video",
    "planner / lifestyle",
    "planner lifestyle",
    "lifestyle video",
    "routine video",
    "sunday reset",
    "weekly reset",
    "生活方式",
    "手帐",
  ],
};

const KEYWORDS: Record<VideoIntentRouteKey, string[]> = {
  planner_lifestyle: [
    "planner",
    "planning",
    "routine",
    "lifestyle",
    "vlog",
    "day in the life",
    "reset",
    "weekly plan",
    "monthly plan",
    "morning routine",
    "evening routine",
    "notion setup",
    "journal",
    "habits",
    "life admin",
    "life update",
    "生活方式",
    "手帐",
    "计划",
  ],
  tutorial_demo: [
    "how to",
    "how-to",
    "tutorial",
    "walkthrough",
    "demo",
    "step by step",
    "step-by-step",
    "screen recording",
    "setup",
    "install",
    "configure",
    "workflow",
    "use ",
    "using ",
    "build ",
    "操作",
    "教程",
    "演示",
  ],
  product_release: [
    "launch",
    "release",
    "announce",
    "announcement",
    "new feature",
    "feature update",
    "product update",
    "go-to-market",
    "gtm",
    "sales",
    "customers",
    "cta",
    "waitlist",
    "发布",
    "上线",
    "产品更新",
  ],
  talking_script: [
    "talking head",
    "speak to camera",
    "to camera",
    "script",
    "monologue",
    "rant",
    "hot take",
    "reel",
    "shorts",
    "tiktok",
    "linkedin post",
    "what i want to say",
    "口播",
    "想说",
    "短视频",
    "短稿",
  ],
  deep_explainer: [
    "youtube",
    "deep dive",
    "explainer",
    "explain",
    "essay",
    "analysis",
    "breakdown",
    "knowledge",
    "teach",
    "why ",
    "what is",
    "concept",
    "framework",
    "长视频",
    "解释",
    "知识",
  ],
};

function normalizeRouteKey(value?: string | null): VideoIntentRouteKey | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return ROUTE_ALIASES[normalized] || null;
}

function parseDurationFromText(text: string): number | null {
  const pattern = /(\d+(?:\.\d+)?)\s*[- ]?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|小时|分钟|分|秒)/i;
  const match = text.match(pattern);
  if (!match) return null;

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (Number.isNaN(amount) || amount <= 0) return null;
  if (unit.startsWith("hour") || unit.startsWith("hr") || unit === "h" || unit === "小时") {
    return Math.round(amount * 3600);
  }
  if (
    unit.startsWith("minute") ||
    unit.startsWith("min") ||
    unit === "m" ||
    unit === "分钟" ||
    unit === "分"
  ) {
    return Math.round(amount * 60);
  }
  return Math.round(amount);
}

export function inferVideoIntentRoute(
  text: string,
  durationSeconds?: number | null
): VideoIntentRoute {
  const normalized = text.toLowerCase();
  const explicitRoute = normalizeRouteKey(normalized);
  if (explicitRoute) return VIDEO_INTENT_ROUTES[explicitRoute];

  const inferredDuration = parseDurationFromText(normalized) ?? durationSeconds ?? null;
  const scores = Object.fromEntries(
    Object.keys(VIDEO_INTENT_ROUTES).map((key) => [key, 0])
  ) as Record<VideoIntentRouteKey, number>;

  (Object.entries(KEYWORDS) as [VideoIntentRouteKey, string[]][]).forEach(([route, words]) => {
    words.forEach((word) => {
      if (normalized.includes(word)) {
        scores[route] += word.length > 4 ? 2 : 1;
      }
    });
  });

  (Object.entries(DIRECT_ROUTE_PHRASES) as [VideoIntentRouteKey, string[]][]).forEach(([route, phrases]) => {
    phrases.forEach((phrase) => {
      if (normalized.includes(phrase)) {
        scores[route] += 6;
      }
    });
  });

  if (inferredDuration) {
    if (inferredDuration <= 180) scores.talking_script += 2;
    else if (inferredDuration >= 540) scores.deep_explainer += 2;
    else if (inferredDuration >= 240 && inferredDuration <= 900) scores.planner_lifestyle += 1;
  }

  if (normalized.includes("youtube shorts") || normalized.includes("short form")) {
    scores.talking_script += 3;
  }
  if (normalized.includes("youtube") && inferredDuration && inferredDuration >= 360) {
    scores.deep_explainer += 2;
  }

  let winner = "deep_explainer" as VideoIntentRouteKey;
  let bestScore = -1;
  (Object.keys(scores) as VideoIntentRouteKey[]).forEach((key) => {
    if (scores[key] > bestScore) {
      winner = key;
      bestScore = scores[key];
    }
  });

  if (bestScore <= 0) {
    if (inferredDuration && inferredDuration <= 180) winner = "talking_script";
    else if (inferredDuration && inferredDuration >= 540) winner = "deep_explainer";
  }

  return VIDEO_INTENT_ROUTES[winner];
}

export function isGuidedBriefType(typeName?: string | null): boolean {
  if (!typeName) return false;
  if (normalizeRouteKey(typeName)) return true;
  return Object.values(VIDEO_INTENT_ROUTES).some(
    (route) => route.label === typeName || route.key === typeName
  );
}
