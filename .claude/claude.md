```markdown
# Claude.md — Zero-to-One Builder: Two-Pane Adaptive Scaffolding System

## Overview

The **Zero-to-One Builder** is an AI-powered system designed to take a complete beginner from **nothing (0)** to a **finished project (1)** using expert scaffolding and progressive mastery.

It uses a **two-pane interface**:

- **Left Pane:** A chat interface like ChatGPT where the user works step-by-step using conversational text.
- **Right Pane:** A visual roadmap showing the entire journey. The user can preview all phases but can **only interact with the current step**.

---

## Core Philosophy

> _"Every expert was once a beginner. The difference is scaffolding."_

- **Senior Architect in Your Pocket:**
  Every step is powered by **expert-level Master Prompts** that deliver 20+ years of domain knowledge through natural conversation.

- **Progressive Scaffolding:**
  The user is never overwhelmed. Each phase is broken into **small, sub-steps** with immediate visible wins.

- **Universal Methodology:**
  The same system works for apps, books, podcasts, businesses, art, or any other project. The AI adapts dynamically to the user’s initial Vision Sentence.

---

## Two-Pane Layout
```

```

**Flow:**
1. User enters **Vision Sentence** (e.g., "I want to create an app for teachers to share lesson plans").
2. Mentor AI generates a **hidden roadmap** of phases (P0 → P7).
3. Right Pane displays the roadmap, with only Phase 1 unlocked.
4. User works through the step via conversational interaction.
5. Upon completion, they click **"Complete Phase"** → next phase unlocks.

---

## Zero-to-One Roadmap (P0 → P7)

### **P0: Define Vision**
**Goal:** Turn a vague idea into a crystal-clear one-sentence Vision Statement.

- Clarify purpose and target audience.
- Identify constraints and success metrics.
- Establish scope boundaries.
- **Visible Win:** A single sentence:
  *"I want to build ______ so that ______."*

**Example Master Prompt:**

```

You are a senior strategist.

Help me refine my vision into one clear sentence using this format:

"I want to build **\_\_** so that **\_\_**."

Then define the top 3 success metrics and main constraints for this project.

```

---

### **P1: Build Environment**
**Goal:** Create a professional workflow so the user feels like a pro from day one.

- Identify essential tools.
- Install and test them.
- Create a clean project workspace.
- **First Win:** Run a simple "Hello World" action to confirm everything works.

**Example Master Prompt:**

```

You are a senior architect guiding a complete beginner.

Design a step-by-step plan to set up a professional environment for my project.

Include:

- Which tools to install and why,
- Exact steps to test each tool,
- How to create a clean folder structure,
- A simple "Hello World" milestone to confirm success.
  Project Vision: {{User Vision Sentence}}

```

---

### **P2: Core Loop**
**Goal:** Build the smallest possible **input → process → output** cycle.

- Create a minimal version of the project’s core value.
- Prove the concept works before scaling.
- **Visible Win:** A working micro-prototype.

**Example Master Prompt:**

```

You are a senior builder.

Design the simplest possible version of my project that takes input, processes it, and outputs a result.

It must be small enough to complete today and clearly demonstrate the core idea.

```

---

### **P3: Layered Expansion**
**Goal:** Add complexity gradually, one concept or feature at a time.

- Prevent overwhelm by limiting changes to one new idea per layer.
- Maintain a working version between additions.
- **Visible Win:** Each added layer delivers a noticeable upgrade.

**Example Master Prompt:**

```

Based on my current prototype, identify the single most valuable new feature to add.

Guide me step-by-step to implement it without breaking what already works.

After completing, suggest the next layer of expansion.

```

---

### **P4: Reality Test**
**Goal:** Validate assumptions with real users or stakeholders.

- Gather authentic feedback before final polish.
- Identify gaps between vision and reality.
- **Visible Win:** Clear pivot or proceed decision.

**Example Master Prompt:**

```

You are a senior product strategist.

Create a lightweight test plan to validate my project with 3–5 real people.

Include:

- What to show them,
- Questions to ask,
- Metrics to measure,
- How to decide whether to pivot or proceed.

```

---

### **P5: Polish & Freeze Scope**
**Goal:** Reach launch-ready quality while stopping feature creep.

- Fix only essential bugs and gaps.
- Freeze scope to prevent endless iteration.
- **Visible Win:** Final, stable version of the project.

**Example Master Prompt:**

```

Identify the minimum essential fixes and improvements required for my project to be launch-ready.

List them in priority order and guide me to complete them step-by-step.

```

---

### **P6: Launch**
**Goal:** Release the project publicly with a single clear call-to-action.

- Prepare launch assets and messaging.
- Measure initial response and key metrics.
- **Visible Win:** Project is live and accessible.

**Example Master Prompt:**

```

You are a senior launch manager.

Create a simple, focused launch plan for my project that includes:

- A single clear call-to-action,
- Where and how to announce it,
- The first 3 metrics to track post-launch.

```

---

### **P7: Reflect & Evolve**
**Goal:** Capture lessons learned and prepare for future growth.

- Document what worked and what didn’t.
- Build a personal toolkit for future projects.
- **Visible Win:** A roadmap for the next project or iteration.

**Example Master Prompt:**

```

Help me analyze what worked, what didn’t, and why.

Create a simple reflection document and suggest a roadmap for my next version or next project.

```

---

## Sub-Steps Within Phases
Each phase is broken into **2–5 sub-steps**
This prevents overwhelm and ensures continuous motivation.

**Example (P1 Environment Sub-Steps):**
1. Identify required tools for the project domain.
2. Install and validate each tool.
3. Create folder or workspace structure.
4. Run a "Hello World" milestone to confirm everything works.

---

## Example User Flow

**User Vision:**
"I want to start a podcast that teaches teens about entrepreneurship."

| Phase | Right Pane (Roadmap) | Left Pane (Chat) |
|-------|---------------------|------------------|
| **P0 Vision** | Shows step to refine idea | AI helps craft final sentence |
| **P1 Environment** | "Install recording tools & test setup" | AI walks through installing Audacity & mic test |
| **P2 Core Loop** | "Record 1-minute intro episode" | AI guides scripting & publishing tiny clip |
| **P3 Expansion** | "Add editing, intro music, interviews" | AI provides editing tips & workflows |
| **P4 Reality Test** | "Share with 3 listeners & get feedback" | AI provides survey questions |
| **P6 Launch** | "Release first 3 episodes publicly" | AI helps with hosting & promotion |


## Why This System Works

| Element | Benefit |
|----------|---------|
| Two-Pane Design | Clear separation of **planning** (right) and **doing** (left) |
| Expert Prompts | Every interaction feels like working with a senior mentor |
| Progressive Scaffolding | No overwhelm; just one focused step at a time |
| Visible Wins | Motivation reinforced through tangible results each phase |
| Universal Applicability | Works for apps, books, businesses, art, research, etc. |

---

## Minimal Technical Requirements
- **State Tracking:** Save Vision Sentence, current phase, and progress markers.
- **Prompt Injection:** Right Pane dynamically updates Master Prompt as phases change.
- **Preview Mode:** Always render full roadmap visually; lock interactivity to current phase.

---

## Endgame
At the end of P7:
- The user has a **live, launched project** they fully understand.
- They’ve grown in skill, confidence, and workflow maturity.
- The system suggests a **next project**, taking them from **1 → many**.

---

## Summary
This simplified system:
- Guides any novice to create something real.
- Combines the clarity of a roadmap with the power of natural conversation.
- Works across any domain through dynamic, adaptive scaffolding.

> **The user only sees one clear step at a time.
> Behind the scenes, the AI knows the entire journey.**

```
