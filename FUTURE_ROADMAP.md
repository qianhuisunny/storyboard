# Future Roadmap

Notes on architectural decisions and future directions for Plotline.

---

## Research Strategy

### Three Pillar Document Structure — Limited Applicability

The "three pillar document" structure (e.g., company context, product context, industry context) **only helps when doing account-based onboarding** — where we know the company/product upfront and can pre-research.

**For the general case:**
- Research questions should be **generated per turn**
- The system should dynamically determine what to research based on:
  - Current user input
  - What's already known
  - What gaps exist in the brief
- Static document structures don't scale to varied video types and use cases

**Implication:** Move away from fixed research schemas toward dynamic, context-aware research generation.
