"""Seed quality_log with realistic fixture data for dashboard development."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from app.infra.quality_log import QualityLog

FIXTURE_PROJECT = "fixture-quality-dash-001"

# Realistic brief dict matching actual state.story_brief structure
STORY_BRIEF = {
    "round": "review",
    "fields": {
        "viewer_outcome": {"value": "Learn 3 CLI tools that save 30+ min/day", "source": "extracted", "confirmed": True},
        "target_audience": {"value": "Junior developers (0-2 years)", "source": "extracted", "confirmed": True},
        "duration": {"value": 300, "source": "extracted", "confirmed": True},
        "audience_level": {"value": "beginner", "source": "inferred", "confirmed": True},
        "platform": {"value": "youtube", "source": "extracted", "confirmed": True},
        "on_camera_presence": {"value": "none", "source": "extracted", "confirmed": True},
        "delivery_tone": {"value": "casual, encouraging", "source": "extracted", "confirmed": True},
        "point_of_view": {"value": "Every dev hits a wall where clicking through GUIs becomes the bottleneck", "source": "inferred", "confirmed": True},
        "core_talking_points": {"value": ["Why the terminal matters", "cd/ls/grep basics", "Git CLI vs GUI", "Shell aliases", "tmux/screen"], "source": "extracted", "confirmed": True},
        "misconceptions": {"value": "Terminal is only for sysadmins", "source": "inferred", "confirmed": True},
    },
}

# Outline attempt 1 — plain text (too linear, will fail eval)
OUTLINE_V1 = """Section 1 — Hook: The Terminal Is Your Friend
Purpose: Grab attention by showing the speed gap between GUI and CLI
Entry assumption: Viewer uses GUIs for everything
Exit state: Viewer is curious about CLI alternatives
Duration: 0:20–0:30
Talking points:
- Side-by-side: renaming 50 files in Finder vs one terminal command
- "What if I told you this takes 3 seconds?"

Section 2 — Navigation Basics
Purpose: Teach foundational commands
Entry assumption: Viewer can open a terminal
Exit state: Viewer can navigate filesystem confidently
Duration: 0:45–1:00
Talking points:
- cd, ls, pwd — the holy trinity
- Tab completion changes everything"""

# Outline attempt 2 — plain text (stronger narrative, will pass eval)
OUTLINE_V2 = """Section 1 — Hook: Why Most Devs Are Slow
Purpose: Open with a relatable pain point — the viewer has felt this
Entry assumption: Viewer relies on GUIs, doesn't question it
Exit state: Viewer wants to know what they're missing
Duration: 0:20–0:30
Talking points:
- "You're mass-renaming files by clicking. One by one."
- Show the 3-second terminal alternative

Section 2 — The Real Problem
Purpose: Reframe the misconception
Entry assumption: Viewer thinks terminal = hard
Exit state: Viewer sees terminal as a time investment, not a barrier
Duration: 0:30–0:45
Talking points:
- "It's not about being a hacker — it's about being fast"
- The learning curve is 2 hours, the payoff is years

Section 3 — 5 Tools That Change Everything
Purpose: Concrete, actionable tool introductions
Entry assumption: Viewer is motivated to learn
Exit state: Viewer knows 5 specific tools and when to use each
Duration: 2:00–2:30
Talking points:
- cd/ls/grep — the holy trinity
- Git CLI vs GUI — why it's faster
- Shell aliases — automate the repetitive
- tmux — split your terminal, split your brain
- fzf — fuzzy find everything

Section 4 — Takeaway
Purpose: Motivate the viewer to start today
Entry assumption: Viewer has seen the tools
Exit state: Viewer opens their terminal after the video
Duration: 0:20–0:30
Talking points:
- "You don't need all 5. Start with one."
- Link to cheat sheet in description"""

# Section 3 after user override — trimmed from 5 to 3 tools
OUTLINE_V2_SECTION3_BEFORE = """Section 3 — 5 Tools That Change Everything
Purpose: Concrete, actionable tool introductions
Entry assumption: Viewer is motivated to learn
Exit state: Viewer knows 5 specific tools and when to use each
Duration: 2:00–2:30
Talking points:
- cd/ls/grep — the holy trinity
- Git CLI vs GUI — why it's faster
- Shell aliases — automate the repetitive
- tmux — split your terminal, split your brain
- fzf — fuzzy find everything"""

OUTLINE_V2_SECTION3_AFTER = """Section 3 — 3 Tools That Change Everything
Purpose: Concrete, actionable tool introductions
Entry assumption: Viewer is motivated to learn
Exit state: Viewer knows 3 specific tools and when to use each
Duration: 1:15–1:30
Talking points:
- Git CLI vs GUI — why it's faster
- Shell aliases — automate the repetitive
- fzf — fuzzy find everything"""

# Brief context as built by quality_gate._build_brief_context()
BRIEF_CONTEXT = """Target audience: Junior developers (0-2 years) (level: beginner)
Viewer outcome: Learn 3 CLI tools that save 30+ min/day
Point of view: Every dev hits a wall where clicking through GUIs becomes the bottleneck
Target duration (seconds): 300
Core misconception: Terminal is only for sysadmins
Must avoid:
(none)
Core talking points in order:
1. Why the terminal matters
2. cd/ls/grep basics
3. Git CLI vs GUI
4. Shell aliases
5. tmux/screen"""

OUTLINE_SCORES_FAIL = {
    "passed": False,
    "gut": {"score": 5.5, "feedback": "Structure is too linear, no narrative tension"},
    "dimensions": [
        {"dimension": "narrative_structure", "score": 5.0, "feedback": "Flat progression"},
        {"dimension": "audience_alignment", "score": 6.0, "feedback": "Mostly on target"},
        {"dimension": "content_coverage", "score": 7.0, "feedback": "Good breadth"},
        {"dimension": "visual_potential", "score": 5.5, "feedback": "Mostly talking head"},
        {"dimension": "pacing", "score": 6.0, "feedback": "Uneven section lengths"},
    ],
    "composite_score": 5.9,
    "attempt": 1,
    "total_attempts": 2,
}

OUTLINE_SCORES_PASS = {
    "passed": True,
    "gut": {"score": 8.0, "feedback": "Strong hook, clear arc, good visual variety"},
    "dimensions": [
        {"dimension": "narrative_structure", "score": 8.5, "feedback": "Clear problem-solution arc"},
        {"dimension": "audience_alignment", "score": 7.5, "feedback": "Well-targeted"},
        {"dimension": "content_coverage", "score": 8.0, "feedback": "Comprehensive"},
        {"dimension": "visual_potential", "score": 7.0, "feedback": "Good mix of screen types"},
        {"dimension": "pacing", "score": 8.0, "feedback": "Well-balanced sections"},
    ],
    "composite_score": 7.8,
    "attempt": 2,
    "total_attempts": 2,
}

STORYBOARD_SCORES = {
    "passed": True,
    "gut": {"score": 7.5, "feedback": "Solid storyboard, voiceover flows naturally"},
    "dimensions": [
        {"dimension": "voiceover_quality", "score": 8.0, "feedback": "Conversational tone"},
        {"dimension": "visual_direction", "score": 7.0, "feedback": "Clear direction"},
        {"dimension": "content_accuracy", "score": 8.5, "feedback": "Faithful to outline"},
        {"dimension": "screen_transitions", "score": 7.0, "feedback": "Mostly smooth"},
        {"dimension": "duration_balance", "score": 7.5, "feedback": "Good distribution"},
    ],
    "composite_score": 7.6,
    "attempt": 1,
    "total_attempts": 1,
}

STORYBOARD_RAW = '[{"screen_number": 1, "section_number": 1, "section_title": "Hook: Why Most Devs Are Slow", "screen_type": "slides", "voiceover_text": "Picture this. You need to rename 50 files. So you open Finder, click, rename, click, rename...", "visual_direction": ["Split screen: Finder clicking vs terminal command"], "action_notes": "Quick cut between slow GUI and fast CLI"}, {"screen_number": 2, "section_number": 1, "section_title": "Hook: Why Most Devs Are Slow", "screen_type": "talking_head", "voiceover_text": "What if I told you that takes 3 seconds?", "visual_direction": ["Direct to camera, casual setting"], "action_notes": "Pause for effect after the question"}]'


# ── Additional fixture projects ──

ADDITIONAL_PROJECTS = [
    {
        "project_id": "1774149667144",
        "topic": "ChatGPT for Data Analysis",
        "scenario": "clean_pass",
    },
    {
        "project_id": "1774296123646",
        "topic": "AI to condense meeting notes into Jira tickets",
        "scenario": "outline_retry_pass",
    },
    {
        "project_id": "1773692786261",
        "topic": "Challenges for female leaders in tech",
        "scenario": "outline_pass_storyboard_retry",
    },
    {
        "project_id": "1775153999512",
        "topic": "Claude Code for product marketers",
        "scenario": "outline_only",
    },
    {
        "project_id": "1776546950948",
        "topic": "Video storyboarding before and after Plotline AI",
        "scenario": "double_retry",
    },
]


def _seed_clean_pass(qlog, project_id, topic, t):
    """Outline pass on first try, storyboard pass on first try."""
    brief = f"{{'topic': '{topic}', 'audience': 'general', 'duration': 300}}"
    outline = f"Section 1 — Hook\nPurpose: Grab attention\nDuration: 0:30\nTalking points:\n- Opening question about {topic}"

    g1 = qlog.log_generate(
        project_id=project_id, stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=brief, raw_response=outline,
    )
    e1 = qlog.log_eval(
        project_id=project_id, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context=f"brief + outline", raw_response='{"gut_score": 7.5}',
        scores={"passed": True, "composite_score": 7.5,
                "gut": {"score": 7.5, "feedback": "Good structure, clear flow"},
                "dimensions": [
                    {"dimension": "narrative_structure", "score": 7.5, "feedback": "Solid arc"},
                    {"dimension": "audience_alignment", "score": 8.0, "feedback": "Well-targeted"},
                    {"dimension": "content_coverage", "score": 7.0, "feedback": "Adequate"},
                    {"dimension": "visual_potential", "score": 7.5, "feedback": "Nice variety"},
                    {"dimension": "pacing", "score": 7.0, "feedback": "Even distribution"},
                ]},
        parent_id=g1,
    )
    a1 = qlog.log_approve(project_id=project_id, stage="outline", scope="full", parent_id=e1)

    g2 = qlog.log_generate(
        project_id=project_id, stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_writer_prompt_v0324.md",
        context=f"brief + approved outline", raw_response='[{"screen_number": 1, "voiceover_text": "..."}]',
    )
    e2 = qlog.log_eval(
        project_id=project_id, stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="STORYBOARD_EVAL_PROMPT.md",
        context="brief + outline + storyboard", raw_response='{"gut_score": 7.2}',
        scores={"passed": True, "composite_score": 7.2,
                "gut": {"score": 7.2, "feedback": "Functional storyboard"},
                "dimensions": [
                    {"dimension": "voiceover_quality", "score": 7.0, "feedback": "Clear but could be more engaging"},
                    {"dimension": "visual_direction", "score": 7.5, "feedback": "Good variety"},
                    {"dimension": "content_accuracy", "score": 7.5, "feedback": "Matches outline"},
                    {"dimension": "screen_transitions", "score": 7.0, "feedback": "Smooth"},
                    {"dimension": "duration_balance", "score": 7.0, "feedback": "Acceptable"},
                ]},
        parent_id=g2,
    )
    a2 = qlog.log_approve(project_id=project_id, stage="storyboard", scope="full", parent_id=e2)
    return 6


def _seed_outline_retry_pass(qlog, project_id, topic, t):
    """Outline fails once, passes on retry, storyboard clean pass."""
    brief = f"{{'topic': '{topic}', 'audience': 'product managers', 'duration': 240}}"

    g1 = qlog.log_generate(
        project_id=project_id, stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=brief, raw_response="Section 1 — Introduction\nPurpose: Introduce the topic\nDuration: 1:00\nTalking points:\n- What are meeting notes?",
    )
    e1 = qlog.log_eval(
        project_id=project_id, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline attempt 1", raw_response='{"gut_score": 5.0}',
        scores={"passed": False, "composite_score": 5.0,
                "gut": {"score": 5.0, "feedback": "Too generic, no hook"},
                "dimensions": [
                    {"dimension": "narrative_structure", "score": 4.5, "feedback": "No tension or arc"},
                    {"dimension": "audience_alignment", "score": 5.5, "feedback": "Vague audience"},
                    {"dimension": "content_coverage", "score": 5.0, "feedback": "Surface-level"},
                    {"dimension": "visual_potential", "score": 5.5, "feedback": "All talking head"},
                    {"dimension": "pacing", "score": 5.0, "feedback": "Front-loaded"},
                ]},
        parent_id=g1,
    )
    g2 = qlog.log_generate(
        project_id=project_id, stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=brief + "\nFeedback: Add a hook, be more specific",
        raw_response="Section 1 — Hook: The Meeting That Should Have Been an Email\nPurpose: Open with universal frustration\nDuration: 0:30\nTalking points:\n- 73% of professionals say meetings waste time",
        parent_id=e1,
    )
    e2 = qlog.log_eval(
        project_id=project_id, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline attempt 2", raw_response='{"gut_score": 7.8}',
        scores={"passed": True, "composite_score": 7.8,
                "gut": {"score": 7.8, "feedback": "Strong hook, clear progression"},
                "dimensions": [
                    {"dimension": "narrative_structure", "score": 8.0, "feedback": "Problem-solution arc"},
                    {"dimension": "audience_alignment", "score": 7.5, "feedback": "Speaks to PMs directly"},
                    {"dimension": "content_coverage", "score": 8.0, "feedback": "Comprehensive"},
                    {"dimension": "visual_potential", "score": 7.5, "feedback": "Good demo sections"},
                    {"dimension": "pacing", "score": 7.5, "feedback": "Well-balanced"},
                ]},
        parent_id=g2,
    )
    a1 = qlog.log_approve(project_id=project_id, stage="outline", scope="full", parent_id=e2)

    g3 = qlog.log_generate(
        project_id=project_id, stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_writer_prompt_v0324.md",
        context="brief + approved outline (attempt 2)", raw_response='[{"screen_number": 1}]',
    )
    e3 = qlog.log_eval(
        project_id=project_id, stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="STORYBOARD_EVAL_PROMPT.md",
        context="brief + outline + storyboard", raw_response='{"gut_score": 7.4}',
        scores={"passed": True, "composite_score": 7.4,
                "gut": {"score": 7.4, "feedback": "Good screen flow"},
                "dimensions": [
                    {"dimension": "voiceover_quality", "score": 7.5, "feedback": "Natural tone"},
                    {"dimension": "visual_direction", "score": 7.0, "feedback": "Clear"},
                    {"dimension": "content_accuracy", "score": 8.0, "feedback": "Faithful"},
                    {"dimension": "screen_transitions", "score": 7.0, "feedback": "Smooth"},
                    {"dimension": "duration_balance", "score": 7.5, "feedback": "Good"},
                ]},
        parent_id=g3,
    )
    a2 = qlog.log_approve(project_id=project_id, stage="storyboard", scope="full", parent_id=e3)
    return 8


def _seed_outline_pass_storyboard_retry(qlog, project_id, topic, t):
    """Outline passes first try, storyboard fails once then passes."""
    brief = f"{{'topic': '{topic}', 'audience': 'women in tech', 'duration': 360}}"

    g1 = qlog.log_generate(
        project_id=project_id, stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=brief,
        raw_response="Section 1 — Hook: The Invisible Tax\nPurpose: Name the unspoken cost of navigating leadership as a woman in tech",
    )
    e1 = qlog.log_eval(
        project_id=project_id, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline", raw_response='{"gut_score": 8.2}',
        scores={"passed": True, "composite_score": 8.2,
                "gut": {"score": 8.2, "feedback": "Emotionally resonant, strong narrative"},
                "dimensions": [
                    {"dimension": "narrative_structure", "score": 8.5, "feedback": "Powerful arc"},
                    {"dimension": "audience_alignment", "score": 9.0, "feedback": "Deeply relevant"},
                    {"dimension": "content_coverage", "score": 7.5, "feedback": "Could add more data"},
                    {"dimension": "visual_potential", "score": 8.0, "feedback": "Good interview + data viz mix"},
                    {"dimension": "pacing", "score": 8.0, "feedback": "Well-paced emotional beats"},
                ]},
        parent_id=g1,
    )
    a1 = qlog.log_approve(project_id=project_id, stage="outline", scope="full", parent_id=e1)

    g2 = qlog.log_generate(
        project_id=project_id, stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_writer_prompt_v0324.md",
        context="brief + approved outline",
        raw_response='[{"screen_number": 1, "voiceover_text": "Leadership in tech is hard. But some people pay an invisible tax on top of that."}]',
    )
    e2 = qlog.log_eval(
        project_id=project_id, stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="STORYBOARD_EVAL_PROMPT.md",
        context="brief + outline + storyboard attempt 1", raw_response='{"gut_score": 5.8}',
        scores={"passed": False, "composite_score": 5.8,
                "gut": {"score": 5.8, "feedback": "Voiceover is too preachy, lacks the conversational tone of the outline"},
                "dimensions": [
                    {"dimension": "voiceover_quality", "score": 5.0, "feedback": "Reads like a lecture, not a conversation"},
                    {"dimension": "visual_direction", "score": 6.0, "feedback": "Too many text-on-screen slides"},
                    {"dimension": "content_accuracy", "score": 7.0, "feedback": "Content matches but tone drifts"},
                    {"dimension": "screen_transitions", "score": 6.0, "feedback": "Abrupt jumps"},
                    {"dimension": "duration_balance", "score": 5.5, "feedback": "Hook too long, takeaway rushed"},
                ]},
        parent_id=g2,
    )
    g3 = qlog.log_generate(
        project_id=project_id, stage="storyboard", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="storyboard_writer_prompt_v0324.md",
        context="brief + outline + feedback: more conversational, fix pacing",
        raw_response='[{"screen_number": 1, "voiceover_text": "You know that thing where you say something in a meeting and nobody hears it, then a guy says the same thing and everyone nods?"}]',
        parent_id=e2,
    )
    e3 = qlog.log_eval(
        project_id=project_id, stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="STORYBOARD_EVAL_PROMPT.md",
        context="brief + outline + storyboard attempt 2", raw_response='{"gut_score": 8.0}',
        scores={"passed": True, "composite_score": 8.0,
                "gut": {"score": 8.0, "feedback": "Much better — conversational, specific, emotionally honest"},
                "dimensions": [
                    {"dimension": "voiceover_quality", "score": 8.5, "feedback": "Authentic voice"},
                    {"dimension": "visual_direction", "score": 7.5, "feedback": "Good mix now"},
                    {"dimension": "content_accuracy", "score": 8.0, "feedback": "Faithful to outline"},
                    {"dimension": "screen_transitions", "score": 7.5, "feedback": "Smooth flow"},
                    {"dimension": "duration_balance", "score": 8.0, "feedback": "Well-paced"},
                ]},
        parent_id=g3,
    )
    a2 = qlog.log_approve(project_id=project_id, stage="storyboard", scope="full", parent_id=e3)
    return 8


def _seed_outline_only(qlog, project_id, topic, t):
    """Outline generated and approved, storyboard not yet started."""
    brief = f"{{'topic': '{topic}', 'audience': 'product marketers', 'duration': 300}}"

    g1 = qlog.log_generate(
        project_id=project_id, stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=brief,
        raw_response="Section 1 — Hook: You Don't Need to Code\nPurpose: Challenge the assumption that coding tools aren't for marketers",
    )
    e1 = qlog.log_eval(
        project_id=project_id, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline", raw_response='{"gut_score": 7.0}',
        scores={"passed": True, "composite_score": 7.0,
                "gut": {"score": 7.0, "feedback": "Serviceable, could be sharper"},
                "dimensions": [
                    {"dimension": "narrative_structure", "score": 7.0, "feedback": "Clear but predictable"},
                    {"dimension": "audience_alignment", "score": 7.5, "feedback": "Good audience focus"},
                    {"dimension": "content_coverage", "score": 6.5, "feedback": "Needs more concrete examples"},
                    {"dimension": "visual_potential", "score": 7.0, "feedback": "Demo section helps"},
                    {"dimension": "pacing", "score": 7.0, "feedback": "Adequate"},
                ]},
        parent_id=g1,
    )
    o1 = qlog.log_override(
        project_id=project_id, stage="outline", scope="section:2",
        instruction="Add a real marketing use case — ROI calculator, not generic 'landing page'",
        before_content="Section 2 — Demo: Building a Landing Page",
        after_content="Section 2 — Demo: Building an ROI Calculator for Q3 Campaign",
        parent_id=e1,
    )
    a1 = qlog.log_approve(project_id=project_id, stage="outline", scope="full", parent_id=o1)
    return 4


def _seed_double_retry(qlog, project_id, topic, t):
    """Outline fails twice (hits max attempts), then manual approve. Storyboard passes."""
    brief = f"{{'topic': '{topic}', 'audience': 'instructional designers', 'duration': 180}}"

    g1 = qlog.log_generate(
        project_id=project_id, stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=brief,
        raw_response="Section 1 — Before Plotline\nPurpose: Show the old way",
    )
    e1 = qlog.log_eval(
        project_id=project_id, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline attempt 1", raw_response='{"gut_score": 4.5}',
        scores={"passed": False, "composite_score": 4.5,
                "gut": {"score": 4.5, "feedback": "Too simplistic, reads like a product brochure"},
                "dimensions": [
                    {"dimension": "narrative_structure", "score": 4.0, "feedback": "No story, just before/after"},
                    {"dimension": "audience_alignment", "score": 5.0, "feedback": "Doesn't speak to IDs specifically"},
                    {"dimension": "content_coverage", "score": 4.5, "feedback": "Surface-level comparison"},
                    {"dimension": "visual_potential", "score": 5.0, "feedback": "Screenshot-heavy"},
                    {"dimension": "pacing", "score": 5.0, "feedback": "Lopsided"},
                ]},
        parent_id=g1,
    )
    g2 = qlog.log_generate(
        project_id=project_id, stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=brief + "\nFeedback: Tell a story, not a feature list. Focus on the ID's experience.",
        raw_response="Section 1 — Hook: The 47-Tab Problem\nPurpose: Show the cognitive overload of manual storyboarding\nDuration: 0:20\nTalking points:\n- You have Figma, Google Docs, a spreadsheet, stock photo tabs, and a timer — all open",
        parent_id=e1,
    )
    e2 = qlog.log_eval(
        project_id=project_id, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context="brief + outline attempt 2", raw_response='{"gut_score": 6.5}',
        scores={"passed": False, "composite_score": 6.5,
                "gut": {"score": 6.5, "feedback": "Better hook but middle section drags"},
                "dimensions": [
                    {"dimension": "narrative_structure", "score": 7.0, "feedback": "Good start, weak middle"},
                    {"dimension": "audience_alignment", "score": 7.0, "feedback": "Better ID focus"},
                    {"dimension": "content_coverage", "score": 6.0, "feedback": "Skips the 'how' of Plotline"},
                    {"dimension": "visual_potential", "score": 6.5, "feedback": "Needs live demo section"},
                    {"dimension": "pacing", "score": 6.0, "feedback": "Middle section too long"},
                ]},
        parent_id=g2,
    )
    # Max attempts reached — user approves manually despite below-threshold score
    a1 = qlog.log_approve(project_id=project_id, stage="outline", scope="full", parent_id=e2)

    g3 = qlog.log_generate(
        project_id=project_id, stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_writer_prompt_v0324.md",
        context="brief + manually approved outline (6.5 score)",
        raw_response='[{"screen_number": 1, "voiceover_text": "Forty-seven tabs. That is not an exaggeration — I counted."}]',
    )
    e3 = qlog.log_eval(
        project_id=project_id, stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="STORYBOARD_EVAL_PROMPT.md",
        context="brief + outline + storyboard", raw_response='{"gut_score": 7.3}',
        scores={"passed": True, "composite_score": 7.3,
                "gut": {"score": 7.3, "feedback": "Makes it work despite the weak outline"},
                "dimensions": [
                    {"dimension": "voiceover_quality", "score": 7.5, "feedback": "Personal, relatable"},
                    {"dimension": "visual_direction", "score": 7.0, "feedback": "Good screen recordings"},
                    {"dimension": "content_accuracy", "score": 7.0, "feedback": "Adapts outline well"},
                    {"dimension": "screen_transitions", "score": 7.5, "feedback": "Smooth"},
                    {"dimension": "duration_balance", "score": 7.0, "feedback": "Tight"},
                ]},
        parent_id=g3,
    )
    a2 = qlog.log_approve(project_id=project_id, stage="storyboard", scope="full", parent_id=e3)
    return 8


SCENARIO_SEEDERS = {
    "clean_pass": _seed_clean_pass,
    "outline_retry_pass": _seed_outline_retry_pass,
    "outline_pass_storyboard_retry": _seed_outline_pass_storyboard_retry,
    "outline_only": _seed_outline_only,
    "double_retry": _seed_double_retry,
}


def seed(db_path=None):
    import sqlite3

    kwargs = {"db_path": db_path} if db_path else {}
    qlog = QualityLog(**kwargs)

    all_project_ids = [FIXTURE_PROJECT] + [p["project_id"] for p in ADDITIONAL_PROJECTS]

    conn = sqlite3.connect(qlog._db_path)
    for pid in all_project_ids:
        conn.execute("DELETE FROM quality_log WHERE project_id = ?", (pid,))
    conn.commit()
    conn.close()

    t = time.time() - 600
    total = 0

    # ── Seed the original fixture project ──
    g1 = qlog.log_generate(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=str(STORY_BRIEF), raw_response=OUTLINE_V1,
    )
    e1 = qlog.log_eval(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context=f"{BRIEF_CONTEXT}\n\n{OUTLINE_V1}",
        raw_response='{"gut_score": 5.5, "feedback": "Too linear, no narrative tension"}',
        scores=OUTLINE_SCORES_FAIL, parent_id=g1,
    )
    g2 = qlog.log_generate(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="storyboard_director_prompt_v0324.md",
        context=str(STORY_BRIEF), raw_response=OUTLINE_V2, parent_id=e1,
    )
    e2 = qlog.log_eval(
        project_id=FIXTURE_PROJECT, stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT_v0419.md",
        context=f"{BRIEF_CONTEXT}\n\n{OUTLINE_V2}",
        raw_response='{"gut_score": 8.0, "feedback": "Strong hook, clear arc"}',
        scores=OUTLINE_SCORES_PASS, parent_id=g2,
    )
    o1 = qlog.log_override(
        project_id=FIXTURE_PROJECT, stage="outline", scope="section:3",
        instruction="Trim to 3 tools, not 5 — video is already long",
        before_content=OUTLINE_V2_SECTION3_BEFORE,
        after_content=OUTLINE_V2_SECTION3_AFTER, parent_id=e2,
    )
    a1 = qlog.log_approve(project_id=FIXTURE_PROJECT, stage="outline", scope="full", parent_id=o1)

    outline_final = OUTLINE_V2.replace(OUTLINE_V2_SECTION3_BEFORE, OUTLINE_V2_SECTION3_AFTER)
    g3 = qlog.log_generate(
        project_id=FIXTURE_PROJECT, stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="storyboard_writer_prompt_v0324.md",
        context=f"brief: {STORY_BRIEF}\noutline: {outline_final}",
        raw_response=STORYBOARD_RAW,
    )
    e3 = qlog.log_eval(
        project_id=FIXTURE_PROJECT, stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="STORYBOARD_EVAL_PROMPT.md",
        context=f"{BRIEF_CONTEXT}\n\nOutline:\n{outline_final}\n\nStoryboard:\n{STORYBOARD_RAW}",
        raw_response='{"gut_score": 7.5, "feedback": "Solid storyboard"}',
        scores=STORYBOARD_SCORES, parent_id=g3,
    )
    a2 = qlog.log_approve(project_id=FIXTURE_PROJECT, stage="storyboard", scope="full", parent_id=e3)

    conn = sqlite3.connect(qlog._db_path)
    rows = conn.execute(
        "SELECT id FROM quality_log WHERE project_id = ? ORDER BY id", (FIXTURE_PROJECT,),
    ).fetchall()
    for i, row in enumerate(rows):
        conn.execute("UPDATE quality_log SET created_at = ? WHERE id = ?", (t + i * 30, row[0]))
    conn.commit()
    conn.close()
    total += len(rows)
    print(f"  {FIXTURE_PROJECT}: {len(rows)} events (outline retry + override + storyboard)")

    # ── Seed additional projects ──
    for proj in ADDITIONAL_PROJECTS:
        pid = proj["project_id"]
        seeder = SCENARIO_SEEDERS[proj["scenario"]]
        t_offset = t + total * 30
        count = seeder(qlog, pid, proj["topic"], t_offset)

        conn = sqlite3.connect(qlog._db_path)
        rows = conn.execute(
            "SELECT id FROM quality_log WHERE project_id = ? ORDER BY id", (pid,),
        ).fetchall()
        for i, row in enumerate(rows):
            conn.execute("UPDATE quality_log SET created_at = ? WHERE id = ?", (t_offset + i * 30, row[0]))
        conn.commit()
        conn.close()
        total += len(rows)
        print(f"  {pid}: {len(rows)} events ({proj['scenario']})")

    print(f"\nTotal: {total} events across {len(all_project_ids)} projects")


if __name__ == "__main__":
    seed()
