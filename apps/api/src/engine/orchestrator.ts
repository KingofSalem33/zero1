import { makeOpenAI } from "../ai";
import { ENV } from "../env";
import { runModel } from "../ai/runModel";
import { runModelStream } from "../ai/runModelStream";
import { selectRelevantTools } from "../ai/tools/selectTools";
import {
  substepGenerationJsonSchema,
  phaseGenerationJsonSchema,
} from "../ai/schemas";
import type { Response } from "express";
import { threadService } from "../services/threadService";
import type { ChatCompletionMessageParam } from "openai/resources";
import { supabase, withRetry, DatabaseError } from "../db";
import {
  Project,
  PhaseGenerationRequest,
  PhaseGenerationResponse,
  CompleteSubstepRequest,
  CompleteSubstepResponse,
} from "./types";
import { ProjectStateManager } from "../services/projectStateManager";
import { completionDetector } from "../services/completionDetector";
import { celebrationBriefingHelper } from "../services/celebrationBriefingHelper";

// In-memory storage for demo purposes
// In production, this would be replaced with database operations
const projects: Map<string, Project> = new Map();

export class StepOrchestrator {
  public stateManager: ProjectStateManager;

  constructor() {
    this.stateManager = new ProjectStateManager(this);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Progressive revelation: Only expand Phase 1 initially
  async createProjectWithPhase1(goal: string): Promise<Project> {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    console.log(
      "🎯 [CREATE] Creating project with Phase 1 expansion for:",
      goal,
    );

    // First generate high-level phases
    const phaseResponse = await this.generatePhases({
      goal,
      clarification_context:
        "Initial project creation - no clarification needed.",
    });

    // Now expand only Phase 1 with substeps
    const phase1 = phaseResponse.phases[0];
    if (phase1) {
      const expandedPhase1 = await this.expandPhaseWithSubsteps(phase1, goal);

      const now = new Date().toISOString();
      const project: Project = {
        id: this.generateId(),
        goal,
        status: "active",
        current_phase: 1,
        current_substep: 1,
        phases: [
          // Phase 1: Fully expanded with substeps
          {
            ...expandedPhase1,
            phase_number: 1,
            expanded: true,
            locked: false,
            completed: false,
            created_at: now,
          },
          // Phase 2+: High-level only, locked
          ...phaseResponse.phases.slice(1).map((phase, index) => ({
            ...phase,
            phase_number: index + 2,
            substeps: [], // No substeps until unlocked
            expanded: false,
            locked: true,
            completed: false,
            created_at: now,
          })),
        ],
        history: [],
        created_at: now,
        updated_at: now,
      };

      projects.set(project.id, project);
      console.log("✅ [CREATE] Project created with Phase 1 expanded");
      return project;
    }

    throw new Error("Failed to generate initial phases");
  }

  async createProject(goal: string): Promise<Project> {
    return this.createProjectWithPhase1(goal);
  }

  // Create project with a specific ID (for Supabase UUID)
  async createProjectWithId(id: string, goal: string): Promise<Project> {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    console.log("🎯 [CREATE] Creating project with ID:", id);

    // First generate high-level phases
    const phaseResponse = await this.generatePhases({
      goal,
      clarification_context:
        "Initial project creation - no clarification needed.",
    });

    // Now expand only Phase 1 with substeps
    const phase1 = phaseResponse.phases[0];
    if (phase1) {
      const expandedPhase1 = await this.expandPhaseWithSubsteps(phase1, goal);

      const now = new Date().toISOString();
      const project: Project = {
        id, // Use the provided ID instead of generating one
        goal,
        status: "active",
        current_phase: 1,
        current_substep: 1,
        phases: [
          // Phase 1: Fully expanded with substeps
          {
            ...expandedPhase1,
            phase_number: 1,
            expanded: true,
            locked: false,
            completed: false,
            created_at: now,
          },
          // Phase 2+: High-level only, locked
          ...phaseResponse.phases.slice(1).map((phase, index) => ({
            ...phase,
            phase_number: index + 2,
            substeps: [], // No substeps until unlocked
            expanded: false,
            locked: true,
            completed: false,
            created_at: now,
          })),
        ],
        history: [],
        created_at: now,
        updated_at: now,
      };

      projects.set(project.id, project);
      console.log("✅ [CREATE] Project created with ID:", id);
      return project;
    }

    throw new Error("Failed to generate initial phases");
  }

  async generatePhases(
    request: PhaseGenerationRequest,
  ): Promise<PhaseGenerationResponse> {
    console.log(
      "🎯 [PHASES] Generating dynamic P1-P7 roadmap for project:",
      request.goal,
    );

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    // Use LLM to generate project-specific P1-P7 phases
    const systemPrompt = `You are generating a customized Zero-to-One project roadmap.

USER'S PROJECT: "${request.goal}"

TASK: Generate P1-P7 phases that are HYPER-SPECIFIC to this exact project.

UNIVERSAL STRUCTURE (Keep these phase IDs):
- P1: Build Environment
- P2: Core Loop
- P3: Layered Expansion
- P4: Reality Test
- P5: Polish & Freeze Scope
- P6: Launch
- P7: Reflect & Evolve

YOUR JOB: Customize each phase for THIS specific project type and domain.

EXAMPLES:

For "cookie business":
- P1 goal: "Set up commercial kitchen and food business infrastructure"
- P1 why_it_matters: "Commercial kitchen permits, equipment, and food safety certifications are legally required before selling"
- P1 acceptance_criteria: ["Commercial kitchen licensed or home kitchen permitted", "Equipment installed and tested", "First test batch successfully baked"]

For "SaaS app":
- P1 goal: "Set up development environment and hosting infrastructure"
- P1 why_it_matters: "Professional dev tools and deployment pipeline enable rapid iteration"
- P1 acceptance_criteria: ["Development environment configured", "Database and hosting set up", "Hello World app deployed"]

For "podcast":
- P1 goal: "Set up recording equipment and podcast hosting"
- P1 why_it_matters: "Professional audio quality and reliable hosting are essential for audience retention"
- P1 acceptance_criteria: ["Recording equipment tested", "Podcast hosting configured", "Test episode recorded and uploaded"]

BE SPECIFIC:
- Don't say "tools" - say what EXACT type of tools for this domain
- Don't be generic - reference the actual project type
- Make acceptance_criteria measurable and domain-specific
- Keep rollback_plan practical for this project type

Return 7 phases (P1-P7) with customized content for this project.`;

    try {
      // Use Responses API with structured output
      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate customized P1-P7 phases for: "${request.goal}"`,
          },
        ],
        temperature: 0.4, // Some creativity, but stay focused
        max_output_tokens: 2000,
        text: {
          format: {
            type: "json_schema" as const,
            name: phaseGenerationJsonSchema.name,
            schema: phaseGenerationJsonSchema.schema,
          },
          verbosity: "medium",
        },
      });

      console.log(
        "[DEBUG PHASES] Full API response keys:",
        Object.keys(result),
      );
      console.log(
        "[DEBUG PHASES] Response output array:",
        JSON.stringify(result.output, null, 2),
      );

      // Responses API format
      const assistantMessage = result.output.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;

      if (!assistantMessage) {
        console.error("[DEBUG PHASES] No assistant message found in output");
        throw new Error("No assistant message in response");
      }

      console.log(
        "[DEBUG PHASES] Assistant message content:",
        JSON.stringify(assistantMessage.content, null, 2),
      );

      const responseText =
        assistantMessage.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("") || "";

      console.log(
        "[DEBUG PHASES] Extracted response text length:",
        responseText.length,
      );
      console.log(
        "[DEBUG PHASES] Response text preview:",
        responseText.substring(0, 500),
      );

      // If empty response, throw error to trigger fallback
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response from AI - using fallback");
      }

      const parsed = JSON.parse(responseText);

      // Add phase_number and lock status
      const phases = parsed.phases.map((phase: any, index: number) => ({
        ...phase,
        phase_number: index + 1,
        substeps: [],
        locked: index > 0, // Only P1 is unlocked
      }));

      console.log(
        "✅ [PHASES] Generated dynamic roadmap with",
        phases.length,
        "customized phases",
      );

      return {
        phases: phases,
      };
    } catch (error) {
      console.error("❌ [PHASES] Failed to generate dynamic phases:", error);
      console.log("⚠️ [PHASES] Falling back to universal P1-P7 structure");

      // Fallback to universal structure
      return this.generateFallbackPhases();
    }
  }

  // Fallback universal phases when LLM generation fails
  private generateFallbackPhases(): PhaseGenerationResponse {
    const phases = [
      {
        phase_id: "P1",
        phase_number: 1,
        goal: "Build Environment",
        why_it_matters:
          "Create a professional workflow so you feel like a pro from day one",
        acceptance_criteria: [
          "Essential tools identified and installed",
          "Clean project workspace created",
          "Hello World milestone completed to confirm everything works",
        ],
        rollback_plan: [
          "Reset workspace",
          "Remove installed tools",
          "Return to vision phase",
        ],
        substeps: [],
        locked: false,
      },
      {
        phase_id: "P2",
        phase_number: 2,
        goal: "Core Loop",
        why_it_matters:
          "Build the smallest possible input → process → output cycle to prove the concept",
        acceptance_criteria: [
          "Minimal version of core value created",
          "Basic input-process-output cycle working",
          "Micro-prototype demonstrates core idea",
        ],
        rollback_plan: [
          "Return to environment setup",
          "Simplify scope further",
        ],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P3",
        phase_number: 3,
        goal: "Layered Expansion",
        why_it_matters:
          "Add complexity gradually, one concept at a time without overwhelming",
        acceptance_criteria: [
          "One new valuable feature added successfully",
          "Working version maintained between additions",
          "Noticeable upgrade delivered",
        ],
        rollback_plan: [
          "Remove last addition",
          "Return to core loop",
          "Simplify feature set",
        ],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P4",
        phase_number: 4,
        goal: "Reality Test",
        why_it_matters:
          "Validate assumptions with real users before final polish",
        acceptance_criteria: [
          "Authentic feedback gathered from 3-5 real users",
          "Gaps between vision and reality identified",
          "Clear pivot or proceed decision made",
        ],
        rollback_plan: [
          "Return to expansion phase",
          "Revise based on feedback",
        ],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P5",
        phase_number: 5,
        goal: "Polish & Freeze Scope",
        why_it_matters:
          "Reach launch-ready quality while preventing endless iteration",
        acceptance_criteria: [
          "Essential bugs and gaps fixed",
          "Scope frozen to prevent feature creep",
          "Final stable version achieved",
        ],
        rollback_plan: ["Return to testing phase", "Reduce scope further"],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P6",
        phase_number: 6,
        goal: "Launch",
        why_it_matters:
          "Release the project publicly with clear call-to-action",
        acceptance_criteria: [
          "Launch assets and messaging prepared",
          "Project is live and accessible",
          "Initial response and key metrics measured",
        ],
        rollback_plan: ["Return to polish phase", "Fix critical launch issues"],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P7",
        phase_number: 7,
        goal: "Reflect & Evolve",
        why_it_matters: "Capture lessons learned and prepare for future growth",
        acceptance_criteria: [
          "What worked and didn't work documented",
          "Personal toolkit built for future projects",
          "Roadmap for next project or iteration created",
        ],
        rollback_plan: ["Return to launch phase", "Gather more data"],
        substeps: [],
        locked: true,
      },
    ];

    return { phases };
  }

  // Expand a single phase with substeps and master prompts
  async expandPhaseWithSubsteps(phase: any, goal: string): Promise<any> {
    console.log("🔍 [EXPAND] Expanding phase with substeps:", phase.goal);

    // Generate dynamic master prompt for this specific phase
    const masterPrompt = await this.getMasterPromptForPhase(
      phase.phase_id,
      goal,
    );

    // Generate substeps using AI with the specific master prompt
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    const systemPrompt = `You are a Master Builder AI designing substeps for a Zero-to-One project builder.

PHASE: ${phase.phase_id} - ${phase.goal}
PROJECT VISION: ${goal}
PHASE PURPOSE: ${phase.why_it_matters}

🚨 PHASE DISCIPLINE ENFORCEMENT:
You MUST respect the phase boundaries. Each phase has a specific purpose in the Zero-to-One journey:

${this.getPhaseConstraints(phase.phase_id)}

Your substeps MUST ONLY address activities within this phase's scope. Do NOT include:
- Activities from earlier phases (those are already complete)
- Activities from later phases (those are locked until this phase completes)
- Generic strategy work that belongs in a different phase

📋 MASTER PROMPT PRINCIPLES FOR THIS PHASE:
The expert master prompt for ${phase.phase_id} provides the strategic framework. Your substeps must align with these principles:

${masterPrompt}

Your substeps should break down these master prompt principles into concrete, executable tasks. Each substep must directly support one of the principles above.

CRITICAL INSTRUCTION:
The "prompt_to_send" field is a SYSTEM-LEVEL instruction to an AI that will execute this substep. Write it as if you're instructing a senior expert to execute work on behalf of the user, then hand off deliverables for the user to review/modify.

❌ WRONG (first-person role-play):
"I'm a senior brand strategist. Let me build your brand identity..."

❌ WRONG (passive advice):
"Establish a clear brand identity. Use Canva to create a logo."

✅ CORRECT (system-level expert instruction):
"You are a senior brand strategist with 20+ years of experience building iconic brands. We are in Phase P1: Build Environment — Substep 2: Brand Identity Foundation for '${goal}'.

Execute this step now:
- Generate a complete brand identity system including color palette (3-4 colors with hex codes), typography recommendations, brand voice description, and mission statement
- Create a ready-to-use brand guide document the user can copy
- Return copy-paste-ready content with 2-3 sentences explaining why each choice supports the project vision

End by instructing the user to review the brand guide, make any modifications, and upload their finalized version. You will review and mark this substep complete."

MASTER PROMPT STRUCTURE:
1. Identity & Authority: "You are the [expert role] with 20+ years of experience..."
2. Context: "We are in Phase [P#]: [Phase Goal] — Substep [#]: [Substep Label]"
3. Action to Execute: Clear commands of what to generate/build
4. Deliverable: Exact output format (code, document, template, etc.)
5. User Handoff: What user should do next and upload requirement

RULES:
1. Generate 3-5 substeps (15-30 min each)
2. Each prompt is written TO the AI, not AS the AI
3. Focus on generating copy-paste-ready deliverables
4. Always end with upload/review instruction
5. Keep substeps small enough to complete in one focused session

RESPONSE FORMAT:
{
  "substeps": [
    {
      "substep_id": "1A",
      "step_number": 1,
      "label": "Clear action-oriented title",
      "prompt_to_send": "You are the [expert role] with 20+ years experience. We are in Phase [P#]: [Goal] — Substep [#]: [Label]. Execute this step now: [specific actions]. Return [specific deliverable]. End by instructing the user to [upload/review action].",
      "commands": "Tools/resources needed",
      "completed": false
    }
  ]
}`;

    try {
      // Use Responses API with structured output
      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate the substeps for this phase." },
        ],
        temperature: 0.3,
        max_output_tokens: 2000,
        text: {
          format: {
            type: "json_schema" as const,
            name: substepGenerationJsonSchema.name,
            schema: substepGenerationJsonSchema.schema,
          },
          verbosity: "medium",
        },
      });

      // Extract content from Responses API format
      const assistantMessage = result.output.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;

      if (!assistantMessage) {
        throw new Error("No assistant message in response");
      }

      const responseText =
        assistantMessage.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("") || "";

      // If empty response, throw error to trigger fallback
      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response from AI - using fallback");
      }

      const parsed = JSON.parse(responseText);

      return {
        ...phase,
        master_prompt: masterPrompt,
        substeps: parsed.substeps.map((substep: any, index: number) => ({
          ...substep,
          step_number: index + 1,
          completed: false,
          // Keep the unique master prompt generated for each substep
          prompt_to_send: substep.prompt_to_send,
          created_at: new Date().toISOString(),
        })),
      };
    } catch (error) {
      console.error("❌ [EXPAND] Failed to expand phase:", error);
      // Fallback with pre-defined expert substeps
      const fallbackSubsteps = this.getFallbackSubsteps(
        phase.phase_id,
        phase.goal,
        goal,
      );
      return {
        ...phase,
        master_prompt: masterPrompt,
        substeps: fallbackSubsteps,
      };
    }
  }

  // Get phase-specific constraints to enforce phase discipline
  private getPhaseConstraints(phaseId: string): string {
    const constraints: Record<string, string> = {
      P1: `P1 (Build Environment) = Setting up TOOLS, WORKSPACE, and INFRASTRUCTURE
✅ ALLOWED: Installing software, creating folder structures, obtaining licenses/permits/accounts, configuring workspace, running "hello world" proof points
❌ FORBIDDEN: Market research, brand strategy, target audience analysis, product features, user testing, content creation
Example for cookie business: Business registration, commercial kitchen licensing, equipment setup, food safety permits, test batch
Example for tech app: Dev environment (Node/React), database setup, code editor config, Git repo, deploy account, "hello world" running`,

      P2: `P2 (Core Loop) = Building the simplest INPUT → PROCESS → OUTPUT cycle
✅ ALLOWED: Defining minimal input, designing ONE core transformation, creating minimal output, testing the basic flow
❌ FORBIDDEN: Multiple features, complex workflows, user research, branding, deployment, analytics
Example for cookie business: Recipe (input) → Bake one batch (process) → Test cookies (output)
Example for tech app: Single form field (input) → Save to database (process) → Confirmation message (output)`,

      P3: `P3 (Layered Expansion) = Adding ONE new feature at a time to working prototype
✅ ALLOWED: Identifying next highest-value feature, integrating new capability, testing combined system
❌ FORBIDDEN: Multiple simultaneous features, complete redesigns, user recruitment, launch prep
Example for cookie business: Add packaging system, add second flavor, add order tracking
Example for tech app: Add authentication, add search feature, add export functionality`,

      P4: `P4 (Reality Test) = Validating with 3-5 real users
✅ ALLOWED: Creating test plan, recruiting testers, conducting sessions, analyzing feedback, making pivot/proceed decision
❌ FORBIDDEN: Building new features, setting up infrastructure, fixing code bugs, launch activities
Example for cookie business: Give samples to 5 potential customers, collect feedback on taste/packaging/price
Example for tech app: Demo to 5 target users, observe usage, gather feedback on value/usability`,

      P5: `P5 (Polish & Freeze Scope) = Fixing critical bugs and locking features for launch
✅ ALLOWED: Auditing quality issues, fixing critical bugs, declaring scope freeze, final stability testing
❌ FORBIDDEN: Adding new features, user research, deployment, marketing prep
Example for cookie business: Fix recipe consistency issues, finalize packaging, lock menu to 3 flavors
Example for tech app: Fix login bugs, improve error messages, freeze features for v1.0`,

      P6: `P6 (Launch) = Making project publicly accessible and tracking metrics
✅ ALLOWED: Deploying to production, creating launch messaging, posting announcements, setting up analytics, monitoring initial response
❌ FORBIDDEN: Building features, fixing non-critical bugs, user research, long-term planning
Example for cookie business: Launch online ordering, post on social media, track first orders
Example for tech app: Deploy to production URL, post on Product Hunt, track signups/usage`,

      P7: `P7 (Reflect & Evolve) = Documenting lessons and planning next steps
✅ ALLOWED: Analyzing what worked/failed, extracting lessons, building personal toolkit, planning v2.0 or new project
❌ FORBIDDEN: Building features, user research, launching, setting up infrastructure
Example for cookie business: Document successful recipes, analyze customer feedback patterns, plan catering expansion
Example for tech app: Review code patterns that worked, identify tech stack lessons, plan feature roadmap for v2.0`,
    };

    return (
      constraints[phaseId] ||
      `This phase requires activities specific to its goal. Do not mix activities from other phases.`
    );
  }

  // Generate dynamic master prompt using LLM for each phase
  private async getMasterPromptForPhase(
    phaseId: string,
    userVision: string,
  ): Promise<string> {
    console.log(`🎨 [MASTER] Generating dynamic master prompt for ${phaseId}`);

    const client = makeOpenAI();
    if (!client) {
      console.warn("⚠️ [MASTER] AI not configured, using fallback");
      return this.getFallbackMasterPrompt(phaseId, userVision);
    }

    // Define what each phase is about (universal structure)
    const phaseDescriptions: Record<string, string> = {
      P1: "Build Environment - Setting up tools, workspace, and infrastructure to work professionally",
      P2: "Core Loop - Creating the simplest input→process→output cycle that proves the concept",
      P3: "Layered Expansion - Adding one feature at a time without breaking existing functionality",
      P4: "Reality Test - Validating with 3-5 real users to make pivot/proceed decision",
      P5: "Polish & Freeze Scope - Fixing critical issues and locking features for launch",
      P6: "Launch - Making project publicly accessible with clear messaging and metrics",
      P7: "Reflect & Evolve - Capturing lessons learned and planning next steps",
    };

    const phaseDescription = phaseDescriptions[phaseId] || "Unknown phase";

    const prompt = `You are creating a master prompt for an AI expert who will execute ${phaseId}: ${phaseDescription}.

USER'S PROJECT: "${userVision}"

Your task is to generate a complete master prompt that will guide an AI expert through this phase.

THE MASTER PROMPT SHOULD:
1. Define the expert role (e.g., "senior DevOps engineer" for P1, "senior product designer" for P2, etc.) - MUST be hyper-specific to the project domain
2. Explain the phase purpose in context of THIS specific project (not generic advice)
3. Provide domain-specific principles and strategies
4. Include concrete examples relevant to this project type
5. Define what success looks like for THIS project in this phase

EXAMPLES OF GOOD MASTER PROMPTS:

For "cookie business" P1 (Build Environment):
"You are a senior food business operations manager with 20+ years launching commercial food products. Your task is to set up the complete infrastructure for a cookie business.

Essential Setup Strategy:
1. Commercial Kitchen: Identify whether home kitchen cottage laws apply or if commercial kitchen rental/licensing is needed. Research local health department requirements.
2. Equipment & Tools: Source professional baking equipment (commercial oven, mixers, cooling racks, storage containers). Don't start with industrial scale - begin with small batch equipment that can scale.
3. Business Licensing: Secure food handler certification, business license, and liability insurance. Many cookie businesses fail because they skip proper permitting.
4. Hello World Proof: Bake one test batch in your planned production space using the exact recipe and equipment you'll launch with. This validates your setup.

Success means: You can legally bake and sell cookies tomorrow if you had an order."

For "SaaS web app" P1 (Build Environment):
"You are a senior DevOps engineer with 20+ years setting up development environments for web applications. Your task is to build a professional development workflow for this SaaS project.

Essential Setup Strategy:
1. Development Stack: Set up Node.js + React + PostgreSQL + hosting (Vercel/Netlify/Railway). Choose based on the project's expected scale and your deployment needs.
2. Workspace Architecture: Initialize Git repo, configure ESLint/Prettier, set up package.json with all dependencies. Create clear folder structure (frontend/, backend/, shared/).
3. Cloud Accounts: Set up GitHub for version control, hosting platform account, database hosting (Supabase/Railway). Configure environment variables.
4. Hello World Proof: Deploy a simple "Hello World" full-stack app (API endpoint + frontend) to production URL. This validates your entire pipeline.

Success means: You can push code and see it live on the internet within minutes."

NOW CREATE A HYPER-SPECIFIC MASTER PROMPT FOR: "${userVision}" in phase ${phaseId}

Requirements:
- Start with the expert role definition (1 sentence)
- Use terminology and examples from the actual project domain
- Be specific about tools, processes, and deliverables for THIS project type
- Keep the structure clear and actionable
- Length: 200-400 words maximum
- Tone: Professional but encouraging, like a senior mentor

Return ONLY the master prompt text (no meta-commentary, no JSON, just the prompt itself).`;

    try {
      // Use Responses API
      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [{ role: "user", content: prompt }],
        temperature: 0.6, // Balanced creativity for domain-specific expertise
        max_output_tokens: 800,
        text: {
          verbosity: "medium",
        },
      });

      // Extract content from Responses API format
      const assistantMessage = result.output.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;

      if (!assistantMessage) {
        throw new Error("No assistant message in response");
      }

      const masterPromptText =
        assistantMessage.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("") || "";

      // If empty response, throw error to trigger fallback
      if (!masterPromptText || masterPromptText.trim().length === 0) {
        throw new Error("Empty response from AI - using fallback");
      }

      console.log(
        `✅ [MASTER] Generated ${masterPromptText.length} character master prompt for ${phaseId}`,
      );
      return masterPromptText;
    } catch (error) {
      console.error(
        `❌ [MASTER] Failed to generate master prompt for ${phaseId}:`,
        error,
      );
      console.log("⚠️ [MASTER] Falling back to universal master prompt");
      return this.getFallbackMasterPrompt(phaseId, userVision);
    }
  }

  // Fallback universal master prompts when LLM generation fails
  private getFallbackMasterPrompt(phaseId: string, userVision: string): string {
    const fallbackPrompts: Record<string, string> = {
      P1: `You are a senior setup strategist helping to build a professional environment for this project.

**Project:** ${userVision}

**Your Guidance:**
1. Identify 3-5 essential tools professionals use in this domain
2. Design a clean, focused workspace (physical or digital)
3. Secure necessary licenses, accounts, or credentials
4. Create a "hello world" proof point that the setup works

Focus on professional capability, not perfection. The user should feel ready to start building after this phase.`,

      P2: `You are a senior systems architect helping to build the core loop for this project.

**Project:** ${userVision}

**Your Guidance:**
1. Define the simplest possible input the project will process
2. Design ONE core transformation that creates value
3. Deliver minimal output that proves the concept works
4. Ensure the entire loop is completable in one focused session

Make it so simple that someone can understand the value in 30 seconds.`,

      P3: `You are a senior product engineer helping to expand this project systematically.

**Project:** ${userVision}

**Your Guidance:**
1. Assess what's currently working well
2. Identify the single highest-value feature to add next
3. Layer new functionality on top of existing systems
4. Test continuously to maintain stability

Add one feature at a time. Never break what's already working.`,

      P4: `You are a senior UX researcher helping to validate this project with real users.

**Project:** ${userVision}

**Your Guidance:**
1. Design a lightweight test plan for 3-5 target users
2. Create clear questions that reveal true value and pain points
3. Structure sessions to observe authentic behavior
4. Synthesize feedback into clear pivot/proceed decision

Real user feedback is the only validation that matters. Go deep with a few users rather than shallow with many.`,

      P5: `You are a senior QA engineer helping to prepare this project for launch.

**Project:** ${userVision}

**Your Guidance:**
1. Audit all critical issues and prioritize fixes
2. Fix only what's essential for launch (no new features)
3. Declare scope freeze to prevent feature creep
4. Test core functionality thoroughly

Launch-ready means you'd confidently show this to someone whose opinion you respect.`,

      P6: `You are a senior launch strategist helping to make this project public.

**Project:** ${userVision}

**Your Guidance:**
1. Prepare clear launch messaging (what it is, why it matters)
2. Choose 2-3 distribution channels where the audience actually is
3. Set up metrics to track awareness, engagement, and quality
4. Monitor initial 48-hour response and adjust

A focused launch with the right audience beats a scattered announcement every time.`,

      P7: `You are a senior retrospective facilitator helping to capture lessons learned.

**Project:** ${userVision}

**Your Guidance:**
1. Document what worked and why (repeatable playbook)
2. Analyze what didn't work and how to avoid it next time
3. Extract reusable processes, tools, and mental models
4. Plan next project with systematic improvement

Every project is training for the next one. Focus on actionable insights, not essays.`,
    };

    return (
      fallbackPrompts[phaseId] ||
      `You are a senior expert helping with ${phaseId} for the project: ${userVision}. Provide clear, actionable guidance specific to this domain.`
    );
  }

  // Get fallback substeps when AI generation fails
  private getFallbackSubsteps(
    phaseId: string,
    phaseGoal: string,
    userVision: string,
  ): any[] {
    const fallbacksByPhase: Record<string, any[]> = {
      P1: [
        {
          substep_id: "1A",
          step_number: 1,
          label: "Identify Essential Tools",
          prompt_to_send: `You are a senior setup strategist with 20+ years of experience helping beginners build professional environments. We are in Phase P1: Build Environment — Substep 1: Identify Essential Tools for "${userVision}".

Execute this step now:
- Analyze the project type and generate a curated list of 3-5 core tools professionals use in this domain
- For each tool, provide the name, what it does, why it's critical, and a quick-start link
- Create a copy-paste-ready checklist with checkboxes

Return the tools list in markdown format with brief explanations (2-3 sentences per tool) showing why each matters for this specific project.

End by instructing the user to review the list, research any unfamiliar tools, and reply with "Tools reviewed" when ready to proceed.`,
          commands: "Research tools, create checklist",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1B",
          step_number: 2,
          label: "Set Up Workspace",
          prompt_to_send: `You are a senior workflow architect with 20+ years of experience designing productive workspaces. We are in Phase P1: Build Environment — Substep 2: Set Up Workspace for "${userVision}".

Execute this step now:
- Generate a complete folder structure optimized for this project type
- Provide terminal commands or step-by-step instructions to create the structure
- Include a brief guide on organizing resources (files, links, notes) for maximum focus

Return copy-paste-ready commands plus a 2-3 sentence explanation of the organizational philosophy.

End by instructing the user to create the workspace, take a screenshot of their folder structure, and upload it for review. You will confirm setup completion.`,
          commands: "Create folders, organize resources",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1C",
          step_number: 3,
          label: "Secure Credentials & Accounts",
          prompt_to_send: `You are a senior operations specialist with 20+ years of experience setting up business infrastructure. We are in Phase P1: Build Environment — Substep 3: Secure Credentials & Accounts for "${userVision}".

Execute this step now:
- Create a checklist of required accounts, licenses, permits, and credentials for this project type
- For each item, explain why it's necessary and provide the exact URL or process to obtain it
- Include a simple password manager recommendation and setup guide

Return a markdown checklist with links and brief explanations (1-2 sentences each).

End by instructing the user to work through the checklist, document their credentials securely, and reply with "Accounts created" when done.`,
          commands: "Create accounts, document credentials",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1D",
          step_number: 4,
          label: "Create Hello World Milestone",
          prompt_to_send: `You are a senior implementation expert with 20+ years of experience building first prototypes. We are in Phase P1: Build Environment — Substep 4: Create Hello World Milestone for "${userVision}".

Execute this step now:
- Design the smallest possible proof-of-concept that demonstrates the setup works
- Provide step-by-step instructions or starter code/template for this "hello world" moment
- Explain what success looks like in 2-3 sentences

Return copy-paste-ready instructions, code, or template that the user can execute immediately.

End by instructing the user to complete the hello world demo, screenshot or document the result, and upload it for review. You will celebrate this milestone and mark the substep complete.`,
          commands: "Create simple proof of concept",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P2: [
        {
          substep_id: "2A",
          step_number: 1,
          label: "Define Core Input",
          prompt_to_send: `You are a senior systems architect with 20+ years of experience designing minimal viable products. We are in Phase P2: Core Loop — Substep 1: Define Core Input for "${userVision}".

Execute this step now:
- Identify the simplest form of raw material this project consumes (customer request, data file, physical item, etc.)
- Define the minimum required fields/attributes for this input
- Create a sample input example the user can reference

Return a clear definition document with the input specification and 1-2 real-world examples.

End by instructing the user to create their own sample input based on this spec, save it, and upload it for validation.`,
          commands: "Define input requirements",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2B",
          step_number: 2,
          label: "Build Core Process",
          prompt_to_send: `You are a senior process engineer with 20+ years of experience building transformation systems. We are in Phase P2: Core Loop — Substep 2: Build Core Process for "${userVision}".

Execute this step now:
- Design the ONE core transformation that creates value from the input
- Provide pseudocode, workflow diagram, or step-by-step process description
- Strip away all non-essential complexity

Return a clear process blueprint with copy-paste-ready implementation outline or starter code.

End by instructing the user to implement this process using the provided blueprint, test it with their sample input, and upload the working implementation for review.`,
          commands: "Implement core logic",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2C",
          step_number: 3,
          label: "Create Minimal Output",
          prompt_to_send: `You are a senior product designer with 20+ years of experience creating MVPs. We are in Phase P2: Core Loop — Substep 3: Create Minimal Output for "${userVision}".

Execute this step now:
- Design the simplest result that proves the concept works
- Define the output format (file, screen, object, etc.)
- Create a template or example of what successful output looks like

Return an output specification with examples showing the value delivered in 30 seconds or less.

End by instructing the user to generate their first output using the core process, compare it to the example, and upload their result for validation.`,
          commands: "Design output format",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2D",
          step_number: 4,
          label: "Test Core Loop",
          prompt_to_send: `You are a senior quality engineer with 20+ years of experience validating systems. We are in Phase P2: Core Loop — Substep 4: Test Core Loop for "${userVision}".

Execute this step now:
- Create a test checklist for the complete input→process→output cycle
- Identify potential failure points and edge cases
- Define what "working" means for this MVP

Return a testing guide with specific validation steps and success criteria.

End by instructing the user to run through the complete test checklist, document any issues found, and upload their test results. You will help troubleshoot any problems and confirm the core loop is solid.`,
          commands: "Test end-to-end flow",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P3: [
        {
          substep_id: "3A",
          step_number: 1,
          label: "Identify Next Feature",
          prompt_to_send: `You are a senior product strategist with 20+ years of experience scaling MVPs. We are in Phase P3: Layered Expansion — Substep 1: Identify Next Feature for "${userVision}".

Execute this step now:
- Analyze the current core loop and identify which single feature addition will create the biggest impact
- Explain why this feature matters and how it amplifies the project vision
- Provide 2-3 specific examples of how users will benefit

Return a feature proposal document with clear rationale and expected value.

End by instructing the user to review the proposal, suggest any modifications, and reply with "Feature approved" to proceed.`,
          commands: "Prioritize features",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3B",
          step_number: 2,
          label: "Design Feature Integration",
          prompt_to_send: `You are a senior systems designer with 20+ years of experience integrating new capabilities. We are in Phase P3: Layered Expansion — Substep 2: Design Feature Integration for "${userVision}".

Execute this step now:
- Create a step-by-step integration plan that adds this feature without breaking existing functionality
- Identify potential risks and mitigation strategies
- Design how this new layer connects to the existing foundation

Return an integration blueprint with clear steps, diagrams if helpful, and risk assessment.

End by instructing the user to review the plan, ask clarifying questions, and when ready, proceed to implementation.`,
          commands: "Plan integration approach",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3C",
          step_number: 3,
          label: "Implement Feature",
          prompt_to_send: `You are a senior implementation specialist with 20+ years of experience building features incrementally. We are in Phase P3: Layered Expansion — Substep 3: Implement Feature for "${userVision}".

Execute this step now:
- Provide step-by-step implementation instructions or starter code
- Include checkpoints to test functionality at each stage
- Ensure the working version stays stable throughout

Return copy-paste-ready code/instructions with inline comments explaining each step.

End by instructing the user to implement the feature following the guide, test at each checkpoint, and upload their working implementation for review.`,
          commands: "Build new feature",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3D",
          step_number: 4,
          label: "Validate Enhancement",
          prompt_to_send: `You are a senior validation expert with 20+ years of experience testing new features. We are in Phase P3: Layered Expansion — Substep 4: Validate Enhancement for "${userVision}".

Execute this step now:
- Create a validation checklist confirming the feature delivers expected value
- Design regression tests ensuring existing functionality still works
- Define success criteria for this enhancement

Return a test plan with specific validation steps and success metrics.

End by instructing the user to run through all validation tests, document results, and upload evidence that the enhancement works as intended.`,
          commands: "Test and validate",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P4: [
        {
          substep_id: "4A",
          step_number: 1,
          label: "Design Test Plan",
          prompt_to_send: `You are a senior research strategist with 20+ years of experience validating products with real users. We are in Phase P4: Reality Test — Substep 1: Design Test Plan for "${userVision}".

Execute this step now:
- Create a lightweight framework to test with 3-5 real users
- Define exactly what to show them, what questions to ask, and what metrics to measure
- Design a feedback collection method (survey, interview script, observation notes)

Return a complete test plan with user recruitment criteria, testing script, and measurement framework.

End by instructing the user to review the plan, make any adjustments, and reply when ready to recruit test users.`,
          commands: "Create test framework",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4B",
          step_number: 2,
          label: "Recruit Test Users",
          prompt_to_send: `You are a senior user research coordinator with 20+ years of experience finding the right test participants. We are in Phase P4: Reality Test — Substep 2: Recruit Test Users for "${userVision}".

Execute this step now:
- Identify where the target users are (communities, platforms, networks)
- Draft outreach messages that will get responses (3-5 templates for different channels)
- Provide tips for getting commitments from busy people

Return recruitment materials with outreach templates and sourcing strategy.

End by instructing the user to reach out using the templates, track responses, and report back when they have 3-5 committed testers.`,
          commands: "Find and recruit users",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4C",
          step_number: 3,
          label: "Conduct Testing Sessions",
          prompt_to_send: `You are a senior UX researcher with 20+ years of experience conducting user tests. We are in Phase P4: Reality Test — Substep 3: Conduct Testing Sessions for "${userVision}".

Execute this step now:
- Create a testing session script with introduction, tasks, and debrief questions
- Provide observation techniques to capture authentic reactions
- Design a note-taking template to organize feedback

Return a complete session guide with scripts, observation tips, and feedback capture template.

End by instructing the user to run sessions with their recruited testers, take thorough notes, and upload their raw feedback for analysis.`,
          commands: "Run user tests",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4D",
          step_number: 4,
          label: "Analyze & Decide",
          prompt_to_send: `You are a senior product analyst with 20+ years of experience synthesizing user research. We are in Phase P4: Reality Test — Substep 4: Analyze & Decide for "${userVision}".

Execute this step now:
- Create an analysis framework to identify patterns in the feedback
- Generate clear recommendations: pivot or proceed
- Provide specific next steps based on the decision

Return an analysis report with key findings, decision recommendation, and action items.

End by instructing the user to review the analysis, discuss any questions, and confirm their decision (pivot or proceed) to move forward.`,
          commands: "Synthesize feedback, make decision",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P5: [
        {
          substep_id: "5A",
          step_number: 1,
          label: "Audit Critical Issues",
          prompt_to_send: `You are a senior quality auditor with 20+ years of experience preparing products for launch. We are in Phase P5: Polish & Freeze Scope — Substep 1: Audit Critical Issues for "${userVision}".

Execute this step now:
- Systematically review the project to identify essential bugs, gaps, and rough edges
- Create a prioritized issue list ranked by impact (critical, important, nice-to-have)
- Provide specific recommendations for each critical item

Return an audit report with categorized issues and fix recommendations.

End by instructing the user to review the audit, add any issues they've noticed, and confirm the priority list before starting fixes.`,
          commands: "Review and document issues",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5B",
          step_number: 2,
          label: "Fix Priority Issues",
          prompt_to_send: `You are a senior troubleshooting specialist with 20+ years of experience fixing critical bugs. We are in Phase P5: Polish & Freeze Scope — Substep 2: Fix Priority Issues for "${userVision}".

Execute this step now:
- Create a fix plan for each critical and important issue
- Provide step-by-step troubleshooting guides or code fixes
- Include validation steps to ensure fixes don't create new problems

Return fix instructions with implementation guides and validation checklists.

End by instructing the user to work through the fixes systematically, test each one, and upload evidence that critical issues are resolved.`,
          commands: "Resolve critical bugs",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5C",
          step_number: 3,
          label: "Freeze Scope",
          prompt_to_send: `You are a senior project manager with 20+ years of experience shipping products. We are in Phase P5: Polish & Freeze Scope — Substep 3: Freeze Scope for "${userVision}".

Execute this step now:
- Create a clear scope freeze declaration: what's in, what's out
- Document any "nice-to-have" features that are deferred to v2
- Provide a commitment script to resist feature creep

Return a scope freeze document with clear boundaries and v2 feature backlog.

End by instructing the user to sign off on the scope freeze, commit to launching what exists, and move to final stability testing.`,
          commands: "Document scope boundary",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5D",
          step_number: 4,
          label: "Final Stability Check",
          prompt_to_send: `You are a senior QA engineer with 20+ years of experience validating launch readiness. We are in Phase P5: Polish & Freeze Scope — Substep 4: Final Stability Check for "${userVision}".

Execute this step now:
- Create a comprehensive end-to-end testing checklist
- Test all core functionality in realistic conditions
- Document the definition of "launch ready" for this project

Return a final testing protocol with pass/fail criteria for each test.

End by instructing the user to complete all tests, document results, and upload their final stability report. You will celebrate their launch readiness.`,
          commands: "Final testing and validation",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P6: [
        {
          substep_id: "6A",
          step_number: 1,
          label: "Prepare Launch Assets",
          prompt_to_send: `You are a senior launch coordinator with 20+ years of experience creating compelling launch materials. We are in Phase P6: Launch — Substep 1: Prepare Launch Assets for "${userVision}".

Execute this step now:
- Draft announcement copy that clearly communicates the project's value
- Create a checklist of needed assets (screenshots, demo video, social graphics, etc.)
- Provide templates or examples for each asset type

Return launch asset package with copy templates and asset creation guides.

End by instructing the user to create or gather all assets, review for quality, and upload them for final approval before launch.`,
          commands: "Create launch materials",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6B",
          step_number: 2,
          label: "Set Up Analytics",
          prompt_to_send: `You are a senior analytics specialist with 20+ years of experience tracking product performance. We are in Phase P6: Launch — Substep 2: Set Up Analytics for "${userVision}".

Execute this step now:
- Identify the 3 key metrics to track post-launch (acquisition, engagement, conversion)
- Provide implementation guides for setting up tracking (Google Analytics, Mixpanel, etc.)
- Create a simple dashboard template to monitor performance

Return analytics setup guide with tracking implementation and dashboard design.

End by instructing the user to implement tracking, test that events are firing correctly, and confirm analytics are ready for launch day.`,
          commands: "Configure tracking and metrics",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6C",
          step_number: 3,
          label: "Execute Launch",
          prompt_to_send: `You are a senior launch strategist with 20+ years of experience executing product launches. We are in Phase P6: Launch — Substep 3: Execute Launch for "${userVision}".

Execute this step now:
- Create a launch day checklist (publish to platforms, post announcements, activate channels)
- Draft platform-specific posts with clear calls-to-action
- Provide a launch sequence timeline (what to post when and where)

Return launch execution plan with timeline, posts, and checklist.

End by instructing the user to execute the launch following the plan, screenshot confirmation of going live, and share the launch post links.`,
          commands: "Publish and announce",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6D",
          step_number: 4,
          label: "Monitor Initial Response",
          prompt_to_send: `You are a senior growth analyst with 20+ years of experience monitoring launches. We are in Phase P6: Launch — Substep 4: Monitor Initial Response for "${userVision}".

Execute this step now:
- Create a 24-48 hour monitoring checklist (metrics to watch, feedback to collect)
- Define what "success" looks like for the initial response
- Provide quick adjustment guidelines based on early signals

Return monitoring guide with success criteria and response protocols.

End by instructing the user to track performance for 48 hours, gather early feedback, and report back with initial results and any urgent issues.`,
          commands: "Track metrics and feedback",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P7: [
        {
          substep_id: "7A",
          step_number: 1,
          label: "Document What Worked",
          prompt_to_send: `You are a senior retrospective facilitator with 20+ years of experience capturing project insights. We are in Phase P7: Reflect & Evolve — Substep 1: Document What Worked for "${userVision}".

Execute this step now:
- Create a reflection framework to analyze successful decisions, processes, and strategies
- Guide the user through identifying what delivered results and why
- Format insights as a repeatable playbook for future projects

Return a reflection template with guiding questions and documentation structure.

End by instructing the user to complete the reflection, document their successes, and upload their "what worked" analysis.`,
          commands: "Capture successful patterns",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7B",
          step_number: 2,
          label: "Analyze What Didn't",
          prompt_to_send: `You are a senior failure analyst with 20+ years of experience learning from setbacks. We are in Phase P7: Reflect & Evolve — Substep 2: Analyze What Didn't Work for "${userVision}".

Execute this step now:
- Create a judgment-free framework for identifying bottlenecks, mistakes, and dead ends
- Help the user extract lessons from challenges without dwelling on negativity
- Turn failures into actionable prevention strategies

Return a failure analysis template with structured reflection questions.

End by instructing the user to honestly assess what didn't work, extract lessons, and upload their insights to prevent future repetition.`,
          commands: "Document lessons learned",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7C",
          step_number: 3,
          label: "Build Personal Toolkit",
          prompt_to_send: `You are a senior knowledge management specialist with 20+ years of experience building reusable systems. We are in Phase P7: Reflect & Evolve — Substep 3: Build Personal Toolkit from "${userVision}".

Execute this step now:
- Help the user extract workflows, tools, and mental models that proved valuable
- Create templates or checklists they can reuse on future projects
- Build a curated resource collection for their next venture

Return a toolkit template with categories for processes, tools, templates, and frameworks.

End by instructing the user to populate their toolkit with reusable assets from this project and save it for future reference.`,
          commands: "Create reusable resources",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7D",
          step_number: 4,
          label: "Plan Next Project",
          prompt_to_send: `You are a senior career strategist with 20+ years of experience guiding builders through growth. We are in Phase P7: Reflect & Evolve — Substep 4: Plan Next Project after "${userVision}".

Execute this step now:
- Identify skill gaps to fill based on this project's challenges
- Recommend resources to acquire (tools, knowledge, connections)
- Suggest project types that will maximize growth (moving from 1 to many)

Return a growth roadmap with skill development plan and next project recommendations.

End by instructing the user to review the roadmap, choose their next focus area, and celebrate completing their journey from zero to one.`,
          commands: "Design growth roadmap",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
    };

    const defaultFallback = [
      {
        substep_id: `${phaseId.replace("P", "")}A`,
        step_number: 1,
        label: `Start ${phaseGoal}`,
        prompt_to_send: `You are a senior expert with 20+ years of experience in this domain. We are working on "${userVision}" — current phase: ${phaseGoal}.

Execute this step now:
- Create a comprehensive plan for this phase
- Provide copy-paste-ready templates, instructions, or starter materials
- Break down the work into clear, achievable steps

Return actionable deliverables the user can immediately use.

End by instructing the user to review the materials, complete the work, and upload their results for validation.`,
        commands: "Begin phase work",
        completed: false,
        created_at: new Date().toISOString(),
      },
    ];

    return fallbacksByPhase[phaseId] || defaultFallback;
  }

  // Manual substep completion with phase unlocking logic
  async completeSubstep(
    request: CompleteSubstepRequest,
  ): Promise<CompleteSubstepResponse> {
    console.log(
      "✅ [COMPLETE] Completing substep:",
      request.substep_id,
      "for project:",
      request.project_id,
    );

    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    // Find and mark substep as complete
    let substepFound = false;
    let currentPhase: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const phase of project.phases) {
      const substep = phase.substeps.find(
        (s: any) => s.substep_id === request.substep_id,
      );
      if (substep) {
        substep.completed = true;
        substepFound = true;
        currentPhase = phase;
        break;
      }
    }

    if (!substepFound) {
      throw new Error("Substep not found");
    }

    // Check if all substeps in current phase are complete
    const allSubstepsComplete = currentPhase.substeps.every(
      (s: any) => s.completed,
    );

    let unlockedPhase: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (allSubstepsComplete) {
      // Validate acceptance criteria before completing phase
      const acceptanceCriteria = currentPhase.acceptance_criteria || [];
      if (acceptanceCriteria.length > 0) {
        console.log(
          `✅ [VALIDATION] Acceptance criteria for Phase ${currentPhase.phase_number}:`,
          acceptanceCriteria,
        );
        // Note: In a future enhancement, could require explicit validation of each criterion
        // For now, we log the criteria and trust that substeps completion implies criteria met
      }

      // Complete current phase
      currentPhase.completed = true;
      console.log(
        `🎉 [COMPLETE] Phase ${currentPhase.phase_number} completed!`,
      );

      // Find and unlock next phase
      const nextPhase = project.phases.find(
        (
          p: any, // eslint-disable-line @typescript-eslint/no-explicit-any
        ) => p.phase_number === currentPhase.phase_number + 1 && p.locked,
      );

      if (nextPhase) {
        console.log(`🔓 [UNLOCK] Unlocking Phase ${nextPhase.phase_number}`);

        // Expand next phase with substeps
        const expandedNextPhase = await this.expandPhaseWithSubsteps(
          nextPhase,
          project.goal,
        );

        // Update the phase in the project
        const nextPhaseIndex = project.phases.findIndex(
          (p: any) => p.phase_id === nextPhase.phase_id,
        );
        project.phases[nextPhaseIndex] = {
          ...expandedNextPhase,
          phase_number: nextPhase.phase_number,
          expanded: true,
          locked: false,
          completed: false,
          created_at: nextPhase.created_at,
        };

        project.current_phase = nextPhase.phase_number;
        unlockedPhase = project.phases[nextPhaseIndex];
      }
    }

    project.updated_at = new Date().toISOString();
    projects.set(request.project_id, project);

    // Persist to Supabase (write-through cache) with retry logic
    try {
      await withRetry(async () => {
        const result = await supabase
          .from("projects")
          .update({
            current_phase: project.current_phase,
            roadmap: project.phases,
            status: project.status,
            updated_at: project.updated_at,
          })
          .eq("id", request.project_id)
          .select()
          .single();
        return result;
      });
    } catch (err) {
      console.error(
        "[ORCHESTRATOR] Error persisting substep completion to Supabase:",
        err,
      );
      // Don't fail the operation if Supabase write fails (already cached in memory)
    }

    return {
      project,
      phase_unlocked: unlockedPhase,
      message: allSubstepsComplete
        ? unlockedPhase
          ? `Phase ${currentPhase.phase_number} completed! Phase ${unlockedPhase.phase_number} unlocked.`
          : `Phase ${currentPhase.phase_number} completed! Project finished!`
        : `Substep ${request.substep_id} completed.`,
    };
  }

  // Load project from Supabase and cache in memory
  private async loadProjectFromSupabase(
    projectId: string,
  ): Promise<Project | null> {
    try {
      const data = await withRetry(async () => {
        const result = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();
        return result;
      });

      if (!data) {
        return null;
      }

      // Transform Supabase row to Project type
      const project: Project = {
        id: data.id,
        goal: data.goal,
        status: data.status,
        current_phase: data.current_phase || 1,
        current_substep: data.current_substep || 1,
        phases: data.roadmap || [],
        history: [],
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      // Cache in memory
      projects.set(projectId, project);
      return project;
    } catch (err) {
      if (err instanceof DatabaseError) {
        console.error(
          "[ORCHESTRATOR] Database error loading project:",
          err.message,
        );
      } else {
        console.error(
          "[ORCHESTRATOR] Error loading project from Supabase:",
          err,
        );
      }
      return null;
    }
  }

  // Get project with Supabase fallback
  getProject(projectId: string): Project | undefined {
    // First check in-memory cache
    const cached = projects.get(projectId);
    if (cached) {
      return cached;
    }

    // Note: This is synchronous but loadProjectFromSupabase is async
    // For now, return undefined and let caller use async version
    return undefined;
  }

  // Async version for proper Supabase loading
  async getProjectAsync(projectId: string): Promise<Project | undefined> {
    // First check in-memory cache
    const cached = projects.get(projectId);
    if (cached) {
      return cached;
    }

    // Load from Supabase
    const loaded = await this.loadProjectFromSupabase(projectId);
    return loaded || undefined;
  }

  async getAllProjects(): Promise<Project[]> {
    try {
      const data = await withRetry(async () => {
        const result = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false });
        return result;
      });

      if (!data) {
        console.warn("[ORCHESTRATOR] No projects found in database");
        return Array.from(projects.values());
      }

      // Transform and cache all projects
      const allProjects = data.map((row) => {
        const project: Project = {
          id: row.id,
          goal: row.goal,
          status: row.status,
          current_phase: row.current_phase || 1,
          current_substep: row.current_substep || 1,
          phases: row.roadmap || [],
          history: [],
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
        projects.set(project.id, project);
        return project;
      });

      return allProjects;
    } catch (err) {
      if (err instanceof DatabaseError) {
        console.error(
          "[ORCHESTRATOR] Database error fetching projects:",
          err.message,
        );
      } else {
        console.error("[ORCHESTRATOR] Error fetching all projects:", err);
      }
      return Array.from(projects.values());
    }
  }

  detectMasterPrompt(input: string, phases: any[]): string | null {
    // Simple detection logic - look for phase-related keywords
    const lowerInput = input.toLowerCase();

    for (const phase of phases) {
      const phaseKeywords = [
        phase.goal?.toLowerCase(),
        phase.phase_id?.toLowerCase(),
        `phase ${phase.phase_number}`,
      ].filter(Boolean);

      for (const keyword of phaseKeywords) {
        if (lowerInput.includes(keyword)) {
          return phase.phase_id;
        }
      }
    }

    return null;
  }

  async executeStep(request: {
    project_id: string;
    master_prompt: string;
    user_message?: string;
  }): Promise<any> {
    console.log(
      "🚀 [EXECUTE] Processing master prompt for project:",
      request.project_id,
    );

    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    // Get current context
    const currentPhase = project.phases.find(
      (p) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    // Get completed substeps from current phase for context continuity
    const completedSubsteps =
      currentPhase?.substeps
        ?.filter(
          (s: any) =>
            s.completed && s.step_number < (currentSubstep?.step_number || 0),
        )
        .map((s: any) => `- ${s.label} (Substep ${s.step_number})`)
        .join("\n") || "None yet - this is the first substep";

    const systemMessage = `You are helping with project execution.

When using web_search or http_fetch tools:
1. Synthesize information from multiple sources into a comprehensive answer
2. Provide specific details, examples, and actionable insights
3. Present information naturally in paragraph form, not as a list of links
4. The system will automatically display citations at the end - don't mention URLs in your response

Provide comprehensive, helpful responses using the tools when appropriate. Be conversational and thorough like ChatGPT.

After providing your response, ask the immediate next logical question to aid the user in completing the task. Be direct and specific - focus on the exact next action needed.

PROJECT CONTEXT:
- Goal: ${project.goal}
- Current Phase: ${currentPhase?.goal || "Unknown"}
- Current Step: ${currentSubstep?.label || "Unknown"}

COMPLETED SUBSTEPS IN THIS PHASE:
${completedSubsteps}

IMPORTANT: Build upon the work completed in previous substeps. Reference their outputs when relevant. Ensure continuity and avoid asking for information that was already provided in earlier substeps.

MASTER PROMPT FROM SYSTEM:
${request.master_prompt}`;

    const userMessage =
      request.user_message ||
      "Please help me with this step. Provide detailed, actionable guidance to help me complete this specific step. Be practical and specific to my project context.";

    try {
      // Dynamically select relevant tools based on user message
      const { toolSpecs: selectedSpecs, toolMap: selectedMap } =
        selectRelevantTools(userMessage);

      const result = await runModel(
        [
          {
            role: "system",
            content: systemMessage,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        {
          toolSpecs: selectedSpecs,
          toolMap: selectedMap,
          model: ENV.OPENAI_MODEL_NAME,
        },
      );

      console.log("✅ [EXECUTE] AI response generated successfully");

      return {
        ok: true,
        response: result.text,
        citations: result.citations,
        context: {
          phase: currentPhase?.goal,
          step: currentSubstep?.label,
          project_goal: project.goal,
        },
      };
    } catch (error) {
      console.error("❌ [EXECUTE] AI request failed:", error);
      throw new Error("Failed to process master prompt with AI");
    }
  }

  async executeStepStreaming(request: {
    project_id: string;
    master_prompt: string;
    user_message?: string;
    thread_id?: string;
    res: Response;
  }): Promise<void> {
    console.log(
      "🚀 [EXECUTE] Processing streaming master prompt for project:",
      request.project_id,
    );

    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    // Get or create thread (optional - fallback to no thread)
    let thread = null;
    let useThreads = true;
    let accumulatedResponse = ""; // Accumulate AI response to save later

    try {
      thread = request.thread_id
        ? await threadService.getThread(request.thread_id)
        : await threadService.getOrCreateThread(request.project_id);

      // 🔄 SUBSTEP CHANGE DETECTION
      // Check if we've moved to a different substep since the last message
      if (thread && thread.context?.last_substep_context) {
        const lastPhase = thread.context.last_substep_context.phase;
        const lastSubstep = thread.context.last_substep_context.substep;
        const currentPhaseId =
          project.phases.find((p) => p.phase_number === project.current_phase)
            ?.phase_id || "";
        const currentSubstepNum = project.current_substep;

        if (lastPhase !== currentPhaseId || lastSubstep !== currentSubstepNum) {
          console.log(
            `📍 [SUBSTEP CHANGE] Detected transition from ${lastPhase}/${lastSubstep} → ${currentPhaseId}/${currentSubstepNum}`,
          );

          // 🎉 INJECT CELEBRATION/BRIEFING DIVIDER
          // Get the completed and next phase/substep objects
          const completedPhaseObj = project.phases.find(
            (p) => p.phase_id === lastPhase,
          );
          const completedSubstepObj = completedPhaseObj?.substeps?.find(
            (s: any) => s.step_number === lastSubstep,
          );
          const nextPhaseObj = project.phases.find(
            (p) => p.phase_number === project.current_phase,
          );
          const nextSubstepObj = nextPhaseObj?.substeps?.find(
            (s: any) => s.step_number === project.current_substep,
          );

          if (
            completedPhaseObj &&
            completedSubstepObj &&
            nextPhaseObj &&
            nextSubstepObj
          ) {
            const transitionMessages =
              celebrationBriefingHelper.generateTransitionMessage(
                completedPhaseObj,
                completedSubstepObj,
                nextPhaseObj,
                nextSubstepObj,
              );

            // Save celebration message
            await threadService.saveMessage(
              thread.id,
              "system",
              transitionMessages.celebration,
            );

            // Save divider + briefing as a single message
            await threadService.saveMessage(
              thread.id,
              "system",
              transitionMessages.divider + "\n" + transitionMessages.briefing,
            );

            console.log("✅ [CELEBRATION] Injected transition messages");
          }
        }
      }

      // Save user message
      if (request.user_message && thread) {
        await threadService.saveMessage(
          thread.id,
          "user",
          request.user_message,
        );

        // Auto-generate title if this is the first message
        const messages = await threadService.getRecentMessages(thread.id, 1);
        if (messages.length === 1) {
          await threadService.generateTitle(thread.id, request.user_message);
        }

        // 🔍 CHECK FOR EXPLICIT COMPLETION REQUEST
        if (
          completionDetector.isExplicitCompletionRequest(request.user_message)
        ) {
          console.log(
            "✅ [COMPLETION] User explicitly requested to mark substep complete",
          );
          // The actual completion will be handled by the complete endpoint
          // But we can log it here for awareness
        }
      }
    } catch (error) {
      console.warn(
        "⚠️ [EXECUTE] Thread service unavailable, proceeding without threads:",
        error,
      );
      useThreads = false;
    }

    // Get current context
    const currentPhase = project.phases.find(
      (p) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    // Get completed substeps from current phase for context continuity
    const completedSubsteps =
      currentPhase?.substeps
        ?.filter(
          (s: any) =>
            s.completed && s.step_number < (currentSubstep?.step_number || 0),
        )
        .map((s: any) => `- ${s.label} (Substep ${s.step_number})`)
        .join("\n") || "None yet - this is the first substep";

    const systemMessage = `You are helping with project execution.

When using web_search or http_fetch tools:
1. Synthesize information from multiple sources into a comprehensive answer
2. Provide specific details, examples, and actionable insights
3. Present information naturally in paragraph form, not as a list of links
4. The system will automatically display citations at the end - don't mention URLs in your response

Provide comprehensive, helpful responses using the tools when appropriate. Be conversational and thorough like ChatGPT.

After providing your response, ask the immediate next logical question to aid the user in completing the task. Be direct and specific - focus on the exact next action needed.

PROJECT CONTEXT:
- Goal: ${project.goal}
- Current Phase: ${currentPhase?.goal || "Unknown"}
- Current Step: ${currentSubstep?.label || "Unknown"}

COMPLETED SUBSTEPS IN THIS PHASE:
${completedSubsteps}

IMPORTANT: Build upon the work completed in previous substeps. Reference their outputs when relevant. Ensure continuity and avoid asking for information that was already provided in earlier substeps.

MASTER PROMPT FROM SYSTEM:
${request.master_prompt}`;

    const userMessage =
      request.user_message ||
      "Please help me with this step. Provide detailed, actionable guidance to help me complete this specific step. Be practical and specific to my project context.";

    try {
      let contextMessages: ChatCompletionMessageParam[];

      if (useThreads && thread) {
        // Build context with recent history (with automatic token trimming)
        contextMessages = await threadService.buildContextMessages(
          thread.id,
          systemMessage,
          ENV.OPENAI_MODEL_NAME,
        );

        // Add current user message if not already in history
        if (request.user_message) {
          contextMessages.push({
            role: "user" as const,
            content: userMessage,
          });
        }
      } else {
        // Fallback: simple message without history
        contextMessages = [
          {
            role: "system" as const,
            content: systemMessage,
          },
          {
            role: "user" as const,
            content: userMessage,
          },
        ];
      }

      // Dynamically select relevant tools based on user message
      const { toolSpecs: selectedSpecs, toolMap: selectedMap } =
        selectRelevantTools(userMessage);

      accumulatedResponse = await runModelStream(request.res, contextMessages, {
        toolSpecs: selectedSpecs,
        toolMap: selectedMap,
        model: ENV.OPENAI_MODEL_NAME,
      });

      console.log("✅ [EXECUTE] Streaming AI response generated successfully");

      // Save AI response to thread
      if (useThreads && thread && accumulatedResponse) {
        try {
          await threadService.saveMessage(
            thread.id,
            "assistant",
            accumulatedResponse,
          );
          console.log("✅ [EXECUTE] AI response saved to thread");

          // 📍 UPDATE SUBSTEP CONTEXT IN THREAD CONTEXT
          // This enables substep change detection on next message
          const currentPhaseId = currentPhase?.phase_id || "";
          const currentSubstepNum = project.current_substep;

          await threadService.updateContext(thread.id, {
            last_substep_context: {
              phase: currentPhaseId,
              substep: currentSubstepNum,
            },
          });
          console.log(
            `📍 [CONTEXT] Saved substep context: ${currentPhaseId}/${currentSubstepNum}`,
          );
        } catch (saveError) {
          console.error(
            "⚠️ [EXECUTE] Failed to save AI response to thread:",
            saveError,
          );
        }
      }
    } catch (error) {
      console.error("❌ [EXECUTE] Streaming AI request failed:", error);
      throw error;
    }
  }

  async expandPhase(request: {
    project_id: string;
    phase_id: string;
    master_prompt_input: string;
  }): Promise<any> {
    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const phase = project.phases.find(
      (p: any) => p.phase_id === request.phase_id,
    );
    if (!phase) {
      throw new Error("Phase not found");
    }

    if (phase.expanded) {
      return {
        project,
        phase,
        message: "Phase already expanded",
      };
    }

    // Expand the phase with substeps
    const expandedPhase = await this.expandPhaseWithSubsteps(
      phase,
      project.goal,
    );

    // Update the phase in the project
    const phaseIndex = project.phases.findIndex(
      (p: any) => p.phase_id === request.phase_id,
    );
    project.phases[phaseIndex] = {
      ...expandedPhase,
      expanded: true,
      locked: false,
    };

    // Update project's current phase if needed
    const currentPhaseNum =
      typeof project.current_phase === "string"
        ? parseInt(project.current_phase.replace("P", ""))
        : project.current_phase;
    if (phase.phase_number <= currentPhaseNum) {
      project.current_phase = phase.phase_number;
    }

    project.updated_at = new Date().toISOString();
    projects.set(request.project_id, project);

    // Persist to Supabase (write-through cache) with retry logic
    try {
      await withRetry(async () => {
        const result = await supabase
          .from("projects")
          .update({
            current_phase: project.current_phase,
            roadmap: project.phases,
            updated_at: project.updated_at,
          })
          .eq("id", request.project_id)
          .select()
          .single();
        return result;
      });
    } catch (err) {
      console.error(
        "[ORCHESTRATOR] Error persisting phase expansion to Supabase:",
        err,
      );
      // Don't fail the operation if Supabase write fails (already cached in memory)
    }

    return {
      project,
      phase: project.phases[phaseIndex],
      message: `Phase ${phase.phase_number} expanded successfully`,
    };
  }
}
