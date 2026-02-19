# Brief Builder UI Implementation Prompt

## Overview

Build a Brief Builder interface for a video storyboarding tool called "Plotline". The interface should transform raw JSON brief data into a user-friendly, conversational experience with a three-tab view system.

## Core Requirements

### Three-Tab Toggle System

Implement a tab/toggle component with three views:

1. **User View** (default, primary)
   - Conversational, friendly interface
   - Editable form with pre-filled values
   - Two-stage flow: required fields → optional/unresolved questions

2. **Processing**
   - Technical log view
   - Shows: original user input, Context Pack extraction, field mapping decisions
   - Collapsible sections for each processing stage
   - Timestamp or step indicators

3. **Output**
   - Raw JSON display
   - Syntax highlighted
   - Copy-to-clipboard button
   - Export/download option

---

## User View Specification

### Stage 1: Required Fields Review

**Header Section:**
```
"Here's what I need to create your video brief. I've pre-filled what I could from your inputs—please review and adjust anything that doesn't look right."
```

**Form Fields:**

Display all brief fields as an editable form. Each field should show:

- Field label (human-readable)
- Current value (editable input/textarea/select as appropriate)
- Status indicator badge:
  - 🟢 **Auto-filled** — Green badge, derived from research with high confidence
  - 🟡 **Needs review** — Yellow/amber badge, derived but low confidence or inferred
  - ⚪ **Empty** — Gray badge, couldn't derive, user must fill

**Field Types by Data:**

| Field | Input Type |
|-------|------------|
| video_goal | Textarea |
| target_audience | Text input |
| company_or_brand_name | Text input |
| tone_and_style | Select dropdown (professional, casual, inspirational, technical) |
| format_or_platform | Select dropdown or text input |
| desired_length | Text input with suffix "seconds" |
| show_face | Toggle (Yes/No) |
| cta | Text input |
| video_type | Select dropdown (Product Release, How-to Demo, Knowledge Share) |
| key_points | Editable list (add/remove/reorder items) |
| constraints | Editable list (add/remove items) |
| problem | Textarea |
| core_interaction_steps | Editable ordered list (add/remove/reorder) |
| common_pitfalls | Editable list (optional, can be empty) |

**Primary Action Button:**
```
"Confirm & Continue" or "Looks Good, Next"
```

---

### Stage 2: Optional/Unresolved Questions

After user confirms Stage 1, transition to Stage 2.

**Header Section:**
```
"Almost done! A few optional questions that could improve your brief:"
```

**Display `unresolved_questions` array as form fields:**

Each unresolved question should show:
- The question text (from `note` field)
- Context/explanation (from `context` field) as helper text
- Appropriate input field based on expected answer type
- "Skip" option for each question

**Also include genuinely optional enhancements:**
- Any video-type-specific optional fields not yet filled
- Suggestions based on video type (e.g., "Would you like to add common pitfalls to warn viewers about?")

**Action Buttons:**
```
"Finish Brief" (primary)
"Back to Edit" (secondary)
```

---

## Processing View Specification

Collapsible accordion or expandable sections:

### Section 1: Original Input
- Show raw user intake data
- What the user originally provided before any processing

### Section 2: Context Pack Extraction
- Show which fields were extracted from Context Pack
- Display source mapping (e.g., "key_points ← context_pack.key_value_propositions")

### Section 3: Auto-Fill Decisions
- Log of each auto-filled field
- Confidence level for each decision
- Source reference

### Section 4: Gaps Identified
- Fields that couldn't be derived
- Reason for each gap

**Styling:**
- Monospace font for technical content
- Subdued colors (not competing with User View)
- Timestamps or step numbers optional

---

## Output View Specification

- Full JSON object display
- Syntax highlighting (use a library like Prism.js or highlight.js, or a React component like react-syntax-highlighter)
- Line numbers
- Copy button (top-right corner)
- Download as .json button
- Wrap long lines or horizontal scroll

---

## Component Structure (Suggested)

```
BriefBuilder/
├── BriefBuilder.tsx          # Main container with tab state
├── TabToggle.tsx             # Three-tab toggle component
├── UserView/
│   ├── UserView.tsx          # Container for user flow
│   ├── RequiredFieldsForm.tsx
│   ├── OptionalQuestionsForm.tsx
│   ├── FormField.tsx         # Reusable field with status badge
│   ├── EditableList.tsx      # For key_points, constraints, steps
│   └── StatusBadge.tsx       # Auto-filled / Needs review / Empty
├── ProcessingView/
│   ├── ProcessingView.tsx
│   └── CollapsibleSection.tsx
├── OutputView/
│   ├── OutputView.tsx
│   └── JsonDisplay.tsx
└── types.ts                  # TypeScript interfaces for Brief schema
```

---

## Data Flow

```
Props into BriefBuilder:
{
  briefData: StoryBrief,           // The current brief object
  contextPack: ContextPack,        // Research data (for Processing view)
  processingLog: ProcessingLog[],  // Array of processing steps
  onBriefUpdate: (brief) => void,  // Callback when user edits
  onConfirm: () => void            // Callback when user finalizes
}
```

---

## Styling Guidelines

- Clean, minimal design consistent with the existing Plotline UI (see screenshot reference)
- White/light background for User View
- Slightly darker/muted background for Processing and Output views
- Use existing color scheme: appears to be grayscale with subtle accents
- Tabs should be clearly distinguishable but not overwhelming
- Form fields should have clear focus states
- Status badges should be small, inline, and not distracting

---

## Interaction Details

### Tab Switching
- Preserve form state when switching tabs
- User View edits should immediately reflect in Output View JSON

### Form Validation
- Required fields must be filled before "Confirm"
- Show inline validation errors
- Don't block tab switching for validation (user might want to see Output even with incomplete form)

### Auto-Save (Optional Enhancement)
- Debounced auto-save as user edits
- Visual indicator for "Saving..." / "Saved"

---

## Sample Data for Testing

```json
{
  "video_goal": "",
  "target_audience": "",
  "company_or_brand_name": "",
  "tone_and_style": "professional",
  "format_or_platform": "general",
  "desired_length": "60",
  "show_face": "No",
  "cta": "",
  "video_type": "How-to Video",
  "user_inputs": "How to grow watermelon in south california",
  "key_points": [
    "Warm climate and long growing season in Southern California are ideal for watermelon cultivation",
    "Traditional methods include selecting suitable varieties, preparing soil, and managing irrigation",
    "Optimized workflows can improve water efficiency and crop yield"
  ],
  "constraints": [
    "Do not claim: specific company or product related to watermelon growing in South California"
  ],
  "problem": {
    "description": "The traditional workflow for growing watermelons in Southern California includes selecting a suitable variety, preparing the soil, planting seeds or transplants, managing irrigation, fertilization, pest control, and harvesting.",
    "auto_filled_from_research": true
  },
  "core_interaction_steps": [
    "Select a suitable watermelon variety for the climate.",
    "Prepare the soil by tilling and adding organic matter.",
    "Plant seeds or transplants at the appropriate depth and spacing.",
    "Set up a drip irrigation system to ensure consistent watering.",
    "Apply mulch to retain soil moisture and suppress weeds.",
    "Monitor plants for pests and diseases, applying treatments as necessary.",
    "Harvest watermelons when they reach full maturity."
  ],
  "common_pitfalls": null,
  "auto_filled_fields": [
    "key_points",
    "constraints",
    "problem",
    "core_interaction_steps"
  ],
  "user_override_fields": [],
  "unresolved_questions": []
}
```

---

## Acceptance Criteria

1. [ ] Three-tab toggle renders and switches views correctly
2. [ ] User View displays conversational header and editable form
3. [ ] Status badges (Auto-filled/Needs review/Empty) display correctly per field
4. [ ] Editable lists work for key_points, constraints, core_interaction_steps
5. [ ] Stage 2 (optional questions) appears after Stage 1 confirmation
6. [ ] Processing View shows collapsible sections with technical details
7. [ ] Output View displays formatted JSON with copy/download
8. [ ] Form edits sync to Output View JSON in real-time
9. [ ] Responsive design works on common screen sizes
10. [ ] Styling matches existing Plotline aesthetic
