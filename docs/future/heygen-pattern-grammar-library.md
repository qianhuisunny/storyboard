# HeyGen Pattern Grammar Library

This library distills a set of HeyGen video titles into reusable video pattern grammars.

The source data is title-only, so classifications are based on title signals rather than full scripts, performance data, or audience retention. The goal is not to copy titles. The goal is to extract pattern families that Plotline can use when building a briefing document, outline, and storyboard.

## 1. How To Use This Library

For each new video request, Plotline should:

1. Extract briefing slots from the user intent.
2. Select one primary pattern grammar.
3. Add one or more secondary patterns when the video is hybrid.
4. Use the selected pattern grammar to decide missing slots, challenge questions, outline moves, and media grammar.
5. Generate the briefing document before writing the outline.

Example:

```json
{
  "primary_pattern": "quick_win_tutorial",
  "secondary_patterns": ["use_case_solution_playbook", "capability_demo"],
  "content_moves": ["show outcome", "explain why", "walk through steps", "warn about mistakes"],
  "media_grammar": ["screen recording", "callouts"]
}
```

## 2. Pattern Families

### 2.1 Quick Win Tutorial

Use when the title promises a concrete outcome in a short time.

Title signals:

- "in minutes"
- "in 5 minutes"
- "fast"
- "easy tutorial"
- "full tutorial"
- "for beginners"

Primary viewer job:

- Do the workflow successfully.

Briefing slots to clarify:

- `success_state`
- `starting_point`
- `workflow_steps`
- `required_assets`
- `common_mistakes`
- `result_check`

Content moves:

- Show the finished outcome first.
- Name what the viewer will be able to make.
- Set prerequisites quickly.
- Walk through the workflow.
- Show the result.
- Warn about the most likely mistake.
- End with next action.

Media grammar:

- screen recording
- before/after result
- callouts
- fast cuts
- progress markers

Example titles:

- Create How-To Videos in Minutes with HeyGen!
- How to Make an AI Influencer in 5 Minutes | FULL TUTORIAL
- How to Make AI Videos Fast with HeyGen AI Studio | Full Tutorial for Beginners
- How to Start a FACELESS YouTube Channel with AI (Easy Tutorial)

### 2.2 Full Stack Trend Tutorial

Use when the video combines several tools or a trending content format.

Title signals:

- multiple tools in one title
- "viral"
- "AI ASMR"
- "AI influencer"
- "faceless YouTube"
- "marketing guide"

Primary viewer job:

- Recreate a trending content system.

Briefing slots to clarify:

- `trend_or_format`
- `tool_stack`
- `final_output`
- `creative_angle`
- `asset_requirements`
- `platform_context`
- `risk_or_ethics_boundary`

Content moves:

- Hook with the trend or opportunity.
- Show the end result.
- Explain the tool stack.
- Break the system into repeatable steps.
- Add creative variation tips.
- Show how to publish or scale.

Media grammar:

- example montage
- tool stack diagram
- screen recording
- output comparison
- social platform references

Example titles:

- Make Viral AI ASMR Videos with Veo 3, HeyGen & ChatGPT (Full Tutorial)
- How to Make an AI Influencer in 5 Minutes | FULL TUTORIAL
- How to Start a FACELESS YouTube Channel with AI (Easy Tutorial)
- How to Make AI Product Ads, Social Content, and More | Full AI Marketing Guide

### 2.3 Product 101 Orientation

Use when the video introduces a product, product surface, or beginner learning path.

Title signals:

- "Intro to"
- "101"
- "Live Workshop"
- multiple feature names in the title
- pricing included

Primary viewer job:

- Understand the product landscape and know where to start.

Briefing slots to clarify:

- `audience_baseline`
- `product_scope`
- `feature_map`
- `first_success_path`
- `depth_level`
- `workshop_or_self_serve`

Content moves:

- Set audience baseline.
- Explain what the product is for.
- Map the major surfaces/features.
- Recommend the first workflow.
- Show one quick example.
- End with where to go next.

Media grammar:

- product UI tour
- feature map
- chaptered walkthrough
- live demo moments
- Q&A or workshop beats

Example titles:

- Intro to HeyGen: AI Avatars, HeyGen's Editing Studio, Translation, Interactive Avatars & Pricing!
- HeyGen 101 Live Workshop
- HeyGen 101
- HeyGen 101 + Latest Updates

### 2.4 Academy Micro-Lesson

Use when the video teaches one feature or skill inside a larger learning series.

Title signals:

- "Academy"
- "Part"
- specific feature name
- "Best Practices"

Primary viewer job:

- Learn one feature deeply enough to use it correctly.

Briefing slots to clarify:

- `feature_name`
- `when_to_use`
- `controls_or_steps`
- `best_practices`
- `common_mistakes`
- `quality_check`

Content moves:

- State the feature and use case.
- Show where it lives.
- Demonstrate the controls.
- Explain best practices.
- Show a good output.
- Name the mistake to avoid.
- Connect to the next lesson.

Media grammar:

- screen recording
- close-up UI callouts
- numbered steps
- before/after examples
- short chapter labels

Example titles:

- HeyGen Academy: 101 - Gesture Control (Part 14)
- HeyGen Academy: 101 - Hyper Realistic Avatar (Part 8)
- HeyGen Academy: AI Studio - Perfecting your AI Video Scripts & Pronunciation (Part 2)
- HeyGen Academy: 101 - Translation & Brand Glossary (Part 13)

### 2.5 Feature Launch Story

Use when the title announces a new feature, version, update, or release.

Title signals:

- "New"
- "Latest Updates"
- "Product Updates"
- version number
- "is here"
- named feature launch

Primary viewer job:

- Understand what changed, why it matters, and what to try.

Briefing slots to clarify:

- `new_capability`
- `user_pain_or_opportunity`
- `why_now`
- `demo_moment`
- `value_proposition`
- `availability_or_credits`
- `cta`

Content moves:

- Lead with what is new.
- Name the problem or opportunity.
- Show the feature in action.
- Explain who benefits.
- Compare before/after.
- Close with how to try it.

Media grammar:

- product demo
- before/after output
- feature callouts
- update list
- CTA card

Example titles:

- The Most Realistic Photo-to-Video AI Yet - HeyGen's NEW Avatar IV + Free Credits!
- Personalized Video by HeyGen is Here!
- New | HeyGen Streaming Avatar
- HeyGen 5.0 | The Next-Generation AI Video Platform
- New Feature Launch: Generate Looks - Customize Avatars to Elevate Your Storytelling

### 2.6 Capability Demo

Use when the video showcases a feature capability more than a full tutorial.

Title signals:

- feature name only
- "Demo"
- "Realtime"
- "Interactive"
- "Streaming"
- "Two-Way"

Primary viewer job:

- Understand what the capability does and imagine use cases.

Briefing slots to clarify:

- `capability`
- `interaction_model`
- `demo_scenario`
- `use_cases`
- `limitations`
- `next_step`

Content moves:

- Open with the capability in action.
- Explain the interaction model.
- Show a realistic scenario.
- Highlight use cases.
- Name the boundary or limitation.
- Invite the viewer to try or learn more.

Media grammar:

- live demo
- split screen
- interaction capture
- scenario framing
- captions/callouts

Example titles:

- HeyGen Interactive Avatar
- HeyGen Realtime Avatar
- Interactive Avatar Demo: Creating Live, Two-Way AI Video Experiences
- New | HeyGen Streaming Avatar

### 2.7 Use-Case Solution Playbook

Use when the title maps HeyGen to a business or creator use case.

Title signals:

- "for Training"
- "for Sales"
- "learning videos"
- "video ads"
- "webinars"
- "podcasts"
- "newsletters"
- "brand videos"

Primary viewer job:

- Apply the product to a specific use case.

Briefing slots to clarify:

- `use_case`
- `audience`
- `business_goal`
- `workflow`
- `example_output`
- `distribution_context`
- `success_criteria`

Content moves:

- Name the use case pain.
- Show the desired output.
- Explain why AI video helps.
- Walk through the workflow.
- Show variations or templates.
- End with deployment or scaling advice.

Media grammar:

- example gallery
- workflow diagram
- product UI walkthrough
- business scenario
- output examples

Example titles:

- Create engaging learning videos with HeyGen
- HeyGen for Training Videos
- Create Video Ads the Easy Way with HeyGen!
- Create On-Demand Webinars & Video Podcasts with HeyGen!
- Automate Your Sales Pitch with AI Video | HeyGen for Scalable Sales
- AI-Powered Video Newsletters in Minutes | Create Video Updates with HeyGen

### 2.8 Customer Proof Story

Use when the video is built around a customer, public figure, or credible example.

Title signals:

- "Customer Story"
- named person/company
- quantified or authority-backed claim
- "speaks on his behalf"

Primary viewer job:

- Believe the product is credible because a real example worked.

Briefing slots to clarify:

- `customer_or_subject`
- `before_state`
- `solution_used`
- `result_or_proof`
- `quote_or_story_moment`
- `lesson_for_viewer`

Content moves:

- Lead with the credibility hook.
- Describe the before-state.
- Show how HeyGen was used.
- Show the result.
- Extract the lesson.
- Close with who should copy this.

Media grammar:

- testimonial clip
- customer artifact
- before/after
- quote cards
- proof overlays

Example titles:

- LinkedIn co-founder's HeyGen avatar speaks on his behalf with 20 years of insight
- Customer Story: How to Create Engaging Business Videos Using AI

### 2.9 Behind-The-Build / Roadmap Narrative

Use when the video explains how the product is being built, why a decision was made, or what questions the team is hearing.

Title signals:

- "Inside the Build"
- "Questions of the Week"
- roadmap questions
- behind-the-scenes language

Primary viewer job:

- Build trust in product direction and understand the thinking behind updates.

Briefing slots to clarify:

- `build_topic`
- `decision_or_question`
- `behind_the_scenes_detail`
- `roadmap_signal`
- `audience_takeaway`

Content moves:

- Open with the question or build decision.
- Explain the context.
- Show behind-the-scenes detail.
- Connect to user impact.
- Answer likely objections.
- End with what is next.

Media grammar:

- product team narration
- UI prototypes
- roadmap visuals
- Q&A structure
- clips from product surface

Example titles:

- HeyGen's AI Studio | Inside the Build Ep. 1
- Avatar IV, Pixar Avatars, & Digital Twins?! | HeyGen's Questions of the Week

### 2.10 Developer/API Integration

Use when the title points to API, integration, or developer workflow.

Title signals:

- "API"
- developer words
- integration language

Primary viewer job:

- Understand how to integrate or build with the product.

Briefing slots to clarify:

- `developer_goal`
- `integration_use_case`
- `api_surface`
- `auth_or_setup`
- `example_request`
- `error_or_limitations`
- `next_step`

Content moves:

- State what the API enables.
- Show a concrete integration use case.
- Explain setup/auth at a high level.
- Walk through a minimal example.
- Name limitations or pitfalls.
- Point to docs or next step.

Media grammar:

- code snippets
- API diagrams
- terminal/editor capture
- docs screenshots
- request/response examples

Example titles:

- HeyGen-API

## 3. Classification Matrix

| Title | Primary pattern | Secondary patterns |
| --- | --- | --- |
| Create How-To Videos in Minutes with HeyGen! | Quick Win Tutorial | Use-Case Solution Playbook |
| Make Viral AI ASMR Videos with Veo 3, HeyGen & ChatGPT (Full Tutorial) | Full Stack Trend Tutorial | Quick Win Tutorial |
| How to Make an AI Influencer in 5 Minutes \| FULL TUTORIAL | Full Stack Trend Tutorial | Quick Win Tutorial |
| How to Make AI Videos Fast with HeyGen AI Studio \| Full Tutorial for Beginners | Quick Win Tutorial | Product 101 Orientation |
| Intro to HeyGen: AI Avatars, HeyGen's Editing Studio, Translation, Interactive Avatars & Pricing! | Product 101 Orientation | Capability Demo |
| HeyGen Interactive Avatar | Capability Demo | Feature Launch Story |
| The Most Realistic Photo-to-Video AI Yet - HeyGen's NEW Avatar IV + Free Credits! | Feature Launch Story | Capability Demo |
| Create engaging learning videos with HeyGen | Use-Case Solution Playbook | Quick Win Tutorial |
| How to Start a FACELESS YouTube Channel with AI (Easy Tutorial) | Full Stack Trend Tutorial | Quick Win Tutorial |
| HeyGen Academy: 101 - Gesture Control (Part 14) | Academy Micro-Lesson | Capability Demo |
| How to Build an AI Sales Assistant \| Interactive Avatars with HeyGen | Use-Case Solution Playbook | Capability Demo |
| Create Video Ads the Easy Way with HeyGen! | Use-Case Solution Playbook | Quick Win Tutorial |
| Personalized Video by HeyGen is Here! | Feature Launch Story | Capability Demo |
| LinkedIn co-founder's HeyGen avatar speaks on his behalf with 20 years of insight | Customer Proof Story | Capability Demo |
| HeyGen for Training Videos | Use-Case Solution Playbook | Product 101 Orientation |
| HeyGen-API | Developer/API Integration | Capability Demo |
| HeyGen Academy: 101 - Hyper Realistic Avatar (Part 8) | Academy Micro-Lesson | Capability Demo |
| How to auto translate videos into ANY language with AI (Full HeyGen Tutorial) | Quick Win Tutorial | Academy Micro-Lesson |
| HeyGen's AI Studio \| Inside the Build Ep. 1 | Behind-The-Build / Roadmap Narrative | Product 101 Orientation |
| HeyGen Academy: AI Studio - Perfecting your AI Video Scripts & Pronunciation (Part 2) | Academy Micro-Lesson | Quick Win Tutorial |
| How to Create a Product Explainer Video in HeyGen | Use-Case Solution Playbook | Quick Win Tutorial |
| HeyGen Realtime Avatar | Capability Demo | Feature Launch Story |
| HeyGen Latest Updates | Feature Launch Story | Product 101 Orientation |
| New \| HeyGen Streaming Avatar | Feature Launch Story | Capability Demo |
| How to create an Avatar: Best Practices on HeyGen | Academy Micro-Lesson | Quick Win Tutorial |
| HeyGen Latest Updates - Interactive Avatar | Feature Launch Story | Capability Demo |
| HeyGen 5.0 \| The Next-Generation AI Video Platform | Feature Launch Story | Product 101 Orientation |
| Interactive Avatar Demo: Creating Live, Two-Way AI Video Experiences | Capability Demo | Use-Case Solution Playbook |
| New Feature Launch: Generate Looks - Customize Avatars to Elevate Your Storytelling | Feature Launch Story | Academy Micro-Lesson |
| HeyGen 101 Live Workshop | Product 101 Orientation | Academy Micro-Lesson |
| HeyGen 101 | Product 101 Orientation | Academy Micro-Lesson |
| HeyGen Academy: 101 - Custom Photo Avatar (Part 9) | Academy Micro-Lesson | Capability Demo |
| HeyGen Academy: 101 - Generate Looks (Part 11) | Academy Micro-Lesson | Feature Launch Story |
| HeyGen Academy: 101 - Custom Voice (Part 12) | Academy Micro-Lesson | Capability Demo |
| Create Stunning Brand Videos FAST with AI - Full HeyGen Walkthrough | Use-Case Solution Playbook | Quick Win Tutorial |
| Create On-Demand Webinars & Video Podcasts with HeyGen! | Use-Case Solution Playbook | Quick Win Tutorial |
| HeyGen Workshop: Prompting Best Practices | Academy Micro-Lesson | Product 101 Orientation |
| How to Make AI Product Ads, Social Content, and More \| Full AI Marketing Guide | Full Stack Trend Tutorial | Use-Case Solution Playbook |
| HeyGen August Product Updates! | Feature Launch Story | Product 101 Orientation |
| HeyGen 101 Live Workshop | Product 101 Orientation | Academy Micro-Lesson |
| Create Skills-Based Training Videos in Minutes with HeyGen! | Use-Case Solution Playbook | Quick Win Tutorial |
| URL to UGC - Instantly generate UGC content with a URL | Full Stack Trend Tutorial | Feature Launch Story |
| (NEW) Motion Avatar + (Update) Url to Ads | Feature Launch Story | Capability Demo |
| Customer Story: How to Create Engaging Business Videos Using AI | Customer Proof Story | Use-Case Solution Playbook |
| HeyGen 101 + Latest Updates | Product 101 Orientation | Feature Launch Story |
| Product Updates: Tools for Next Level AI Video | Feature Launch Story | Product 101 Orientation |
| Automate Your Sales Pitch with AI Video \| HeyGen for Scalable Sales | Use-Case Solution Playbook | Customer Proof Story |
| HeyGen 101 | Product 101 Orientation | Academy Micro-Lesson |
| HeyGen Academy: 101 - Generating and Sharing your video (Part 7) | Academy Micro-Lesson | Quick Win Tutorial |
| HeyGen Academy: 101 - Generate Avatar (Part 10) | Academy Micro-Lesson | Capability Demo |
| HeyGen Academy: 101 - Translation & Brand Glossary (Part 13) | Academy Micro-Lesson | Use-Case Solution Playbook |
| Avatar IV, Pixar Avatars, & Digital Twins?! \| HeyGen's Questions of the Week | Behind-The-Build / Roadmap Narrative | Feature Launch Story |
| AI-Powered Video Newsletters in Minutes \| Create Video Updates with HeyGen | Use-Case Solution Playbook | Quick Win Tutorial |

## 4. Pattern Selection Rules

Use these as soft grammar, not hard routing.

If the title promises a specific output quickly:

- prefer `Quick Win Tutorial`
- add use-case pattern if the output maps to a business job

If the title combines tools or a trend:

- prefer `Full Stack Trend Tutorial`
- add quick win if it includes "tutorial", "easy", or time-boxed language

If the title says `101`, `intro`, or `workshop`:

- prefer `Product 101 Orientation`
- add `Academy Micro-Lesson` if it teaches a concrete skill

If the title names a specific feature plus part number:

- prefer `Academy Micro-Lesson`

If the title says `new`, `latest updates`, `is here`, or a version number:

- prefer `Feature Launch Story`

If the title is a feature name without "how to":

- prefer `Capability Demo`

If the title says `for training`, `for sales`, `ads`, `webinars`, `newsletters`, or `brand videos`:

- prefer `Use-Case Solution Playbook`

If the title contains a customer, named person, or case:

- prefer `Customer Proof Story`

If the title says `inside the build` or `questions of the week`:

- prefer `Behind-The-Build / Roadmap Narrative`

If the title says `API`:

- prefer `Developer/API Integration`

## 5. How This Maps To Plotline Briefing Slots

Pattern grammar should drive slot priority.

For example:

```json
{
  "pattern": "Quick Win Tutorial",
  "high_priority_slots": ["success_state", "starting_point", "workflow_steps", "result_check"],
  "default_media_grammar": ["screen recording", "callouts", "before/after result"],
  "ask_first": [
    "What should the viewer be able to make by the end?",
    "Where is the viewer starting from?",
    "What is the most common mistake?"
  ]
}
```

```json
{
  "pattern": "Feature Launch Story",
  "high_priority_slots": ["new_capability", "user_pain_or_opportunity", "demo_moment", "cta"],
  "default_media_grammar": ["product demo", "before/after output", "feature callouts"],
  "ask_first": [
    "What changed?",
    "Who should care?",
    "What should the viewer try after watching?"
  ]
}
```

The intake engine should not ask all pattern slots. It should ask the uncertain high-impact ones.
