# What Makes a Good Content Mapping Table

A content map translates learning objectives into a development blueprint. It's a communication tool for stakeholders—not a granular storyboard.

---

## Core Principles

### 1. Tight Objective-Assessment-Content Alignment

Every row answers three questions:
- **What will learners do?** (Objective)
- **How will we know they can do it?** (Assessment)
- **What enables them to learn it?** (Practice + Presentation)

If you can't draw a direct line from objective → assessment → content, the row has a gap.

### 2. Job-Relevant, Action-Based Objectives

Objectives must describe actions or decisions learners perform on the job—not cognitive awareness.

| Weak | Problem | Stronger |
|------|---------|----------|
| Recognize the types of errors | Not a job action | **Differentiate** error types |
| Understand the decision process | Vague verb | **Diagnose** using a decision tree |
| Know when to take action | Passive | **Select** the appropriate next action |

**Test:** Ask "Would someone actually do this verb at work?" If not, reframe toward the real job behavior.

### 3. Consistent Column Structure

Use the same framework across all modules:

| Objective | Assessment | Practice | Presentation |
|-----------|------------|----------|--------------|

Optional columns (when relevant): **Integration** (application to ongoing case study), **Delivery Channel**, **Knowledge Type**

### 4. Appropriate Stakeholder Detail

Include enough to show alignment and feasibility. Avoid:
- Slide-by-slide breakdowns (that's storyboarding)
- Verbatim assessment item text (summaries suffice)
- Implementation notes better suited for development

---

## Example: Reasoning vs Recall Errors Module

**Target learner:** People who review model outputs, label failures, or decide what to train on next.

| Objective | Assessment | Practice | Presentation |
|-----------|------------|----------|--------------|
| **1. Differentiate** reasoning failures from non-reasoning errors (recall, computation, helpfulness, instruction-following) | MCQ: Given a model output, classify the failure type | — | Taxonomy with definitions + crisp examples for each of the 5 failure types |
| **2. Diagnose** the primary failure type for a given model output using a decision tree | MCQ: Which step in the decision tree applies first? | Given an output, walk through the decision tree to identify primary failure | Decision Tree (5-question traversal) + Shortcut rule |
| **3. Classify** failures in short scenarios with written justification | Scenario-based MCQs with required justification | Select failure type + write one-line justification per the mini rubric | Scenario bank with explanations; Mini rubric for justification format |
| **4. Select the appropriate next action** based on the diagnosis | MCQ: Given this failure type, what's the correct remediation? | Given a labeled failure, choose: add facts / rewrite prompt / adjust eval / collect training data | "Why it matters" sections mapping failure type → consequence → implied fix |

---

## Quality Checks

Before finalizing, verify:

- [ ] Every objective uses an action verb describing a job task
- [ ] Every objective has a corresponding assessment method
- [ ] Practice activities give learners a chance to fail safely before assessment
- [ ] Presentation content directly enables the objective (no "nice to know" padding)
- [ ] Gaps are explicitly flagged (e.g., "Practice is thin for Objective 1—add matching exercise")
