/**
 * Roadmap Generation Service
 *
 * Generates dynamic, LLM-driven roadmaps tailored to each project vision.
 * Replaces static P0-P7 structure with adaptive step-by-step journey.
 */

import { makeOpenAI } from "../../../ai";
import { ENV } from "../../../env";

export interface RoadmapStep {
  step_number: number;
  title: string;
  description: string;
  master_prompt: string;
  context: {
    previous_steps_summary?: string;
    next_steps_preview?: string;
    artifacts?: string[];
    dependencies?: string[];
  };
  acceptance_criteria: string[];
  estimated_complexity: number; // 1-10 scale
  status: "pending" | "active" | "completed" | "skipped";
}

export interface GenerateRoadmapRequest {
  vision: string;
  clarification_context?: string;
  user_skill_level?: "beginner" | "intermediate" | "advanced";
}

export interface GenerateRoadmapResponse {
  steps: RoadmapStep[];
  total_steps: number;
  estimated_timeline?: string;
  generated_by: string;
}

/**
 * JSON Schema for LLM-generated roadmap
 */
const roadmapGenerationSchema = {
  name: "dynamic_roadmap",
  schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "Ordered list of steps from start to finish",
        items: {
          type: "object",
          properties: {
            step_number: {
              type: "number",
              description: "Sequential step number (1, 2, 3, ...)",
            },
            title: {
              type: "string",
              description:
                "Concise, action-oriented title (e.g., 'Define Data Model')",
            },
            description: {
              type: "string",
              description:
                "Detailed explanation of what this step accomplishes and why it matters",
            },
            acceptance_criteria: {
              type: "array",
              description:
                "Specific, measurable criteria that define when this step is complete",
              items: { type: "string" },
            },
            estimated_complexity: {
              type: "number",
              description:
                "Complexity rating: 1 (trivial) to 10 (highly complex)",
              minimum: 1,
              maximum: 10,
            },
          },
          required: [
            "step_number",
            "title",
            "description",
            "acceptance_criteria",
            "estimated_complexity",
          ],
          additionalProperties: false,
        },
      },
      estimated_timeline: {
        type: "string",
        description:
          "Human-readable estimate (e.g., '2-3 weeks for a dedicated developer')",
      },
    },
    required: ["steps", "estimated_timeline"],
    additionalProperties: false,
  },
};

/**
 * RoadmapGenerationService
 *
 * Core service for generating dynamic, LLM-driven project roadmaps
 */
export class RoadmapGenerationService {
  /**
   * Generate a complete roadmap from vision
   */
  async generateRoadmap(
    request: GenerateRoadmapRequest,
  ): Promise<GenerateRoadmapResponse> {
    console.log(
      "🎯 [RoadmapGenerationService] Generating dynamic roadmap for:",
      request.vision,
    );

    const client = makeOpenAI();
    if (!client) {
      console.warn(
        "⚠️ [RoadmapGenerationService] AI not configured, using fallback",
      );
      return this.generateFallbackRoadmap(request.vision);
    }

    try {
      const systemPrompt = this.buildSystemPrompt(request);
      const userPrompt = this.buildUserPrompt(request);

      console.log("[RoadmapGenerationService] Calling Responses API...");

      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5, // Balanced creativity and consistency
        max_output_tokens: 8000, // Allow for comprehensive roadmaps
        text: {
          format: {
            type: "json_schema" as const,
            name: roadmapGenerationSchema.name,
            schema: roadmapGenerationSchema.schema,
          },
          verbosity: "medium",
        },
      });

      console.log("[RoadmapGenerationService] Responses API call succeeded");

      // Parse response
      const assistantMessage = result.output.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;

      if (!assistantMessage) {
        throw new Error("No assistant message in response");
      }

      const responseText = assistantMessage.content.find(
        (c: any) => c.type === "text",
      )?.text;
      if (!responseText) {
        throw new Error("No text content in assistant message");
      }

      const parsed = JSON.parse(responseText);

      // Generate master prompts for each step
      const stepsWithPrompts = await this.enrichStepsWithMasterPrompts(
        parsed.steps,
        request.vision,
      );

      return {
        steps: stepsWithPrompts,
        total_steps: stepsWithPrompts.length,
        estimated_timeline: parsed.estimated_timeline,
        generated_by: ENV.OPENAI_MODEL_NAME,
      };
    } catch (error) {
      console.error(
        "[RoadmapGenerationService] Error generating roadmap:",
        error,
      );
      return this.generateFallbackRoadmap(request.vision);
    }
  }

  /**
   * Build system prompt for roadmap generation
   */
  private buildSystemPrompt(request: GenerateRoadmapRequest): string {
    const skillContext = request.user_skill_level
      ? `The user is a ${request.user_skill_level} developer.`
      : "Assume the user is a beginner unless specified.";

    return `You are a senior software architect with 20+ years of experience.
Your specialty is breaking down ambitious visions into achievable, step-by-step roadmaps.

${skillContext}

PHILOSOPHY:
- "Carry them to the finish line, but they own it" - Guide with expertise, but preserve user autonomy
- Every step must have a tangible, visible win
- Progressive scaffolding: small wins build confidence
- Adaptive complexity: simple projects = fewer steps, complex = more granular breakdown

ROADMAP PRINCIPLES:
1. **Bespoke, not generic**: Each roadmap is custom-designed for the specific vision
2. **Right-sized**: Simple landing page might be 8-12 steps, full SaaS might be 40-60 steps
3. **Dependency-aware**: Each step builds on previous work
4. **Testable milestones**: Every step has clear acceptance criteria
5. **Visible progress**: User sees tangible results at each step

STEP STRUCTURE:
- Titles: Action-oriented, clear (e.g., "Set Up Database Schema", not "Database")
- Descriptions: Explain WHAT and WHY - connect to bigger picture
- Acceptance Criteria: Specific, measurable (e.g., "Database has users table with email, password_hash columns")
- Complexity: Honest assessment (1=trivial config, 10=major architectural decision)

COMPLEXITY CALIBRATION:
1-3: Quick tasks, clear path (setup, config, simple CRUD)
4-6: Moderate complexity, some problem-solving (API design, auth flow)
7-10: High complexity, architectural decisions (scaling, security, ML models)

OUTPUT ONLY THE STRUCTURED JSON. No additional commentary.`;
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(request: GenerateRoadmapRequest): string {
    let prompt = `Generate a complete, step-by-step roadmap for this vision:\n\n"${request.vision}"`;

    if (request.clarification_context) {
      prompt += `\n\nAdditional Context:\n${request.clarification_context}`;
    }

    prompt += `\n\nCreate a roadmap that:
- Starts from absolute zero (no existing code)
- Ends with a fully launched, production-ready product
- Includes setup, development, testing, deployment, and launch steps
- Has clear milestones and dependencies
- Gives the user confidence they can succeed

Return the complete roadmap as structured JSON.`;

    return prompt;
  }

  /**
   * Enrich steps with context-aware master prompts
   */
  private async enrichStepsWithMasterPrompts(
    steps: any[],
    vision: string,
  ): Promise<RoadmapStep[]> {
    console.log(
      `[RoadmapGenerationService] Enriching ${steps.length} steps with master prompts...`,
    );

    const enrichedSteps: RoadmapStep[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const previousSteps = steps.slice(0, i);
      const nextSteps = steps.slice(i + 1, Math.min(i + 4, steps.length));

      const masterPrompt = this.generateMasterPrompt({
        vision,
        currentStep: step,
        previousSteps,
        nextSteps,
        stepNumber: i + 1,
        totalSteps: steps.length,
      });

      enrichedSteps.push({
        step_number: step.step_number,
        title: step.title,
        description: step.description,
        master_prompt: masterPrompt,
        context: {
          previous_steps_summary:
            previousSteps.length > 0
              ? previousSteps.map((s: any) => `✓ ${s.title}`).join("\n")
              : undefined,
          next_steps_preview:
            nextSteps.length > 0
              ? nextSteps
                  .slice(0, 3)
                  .map((s: any) => `→ ${s.title}`)
                  .join("\n")
              : undefined,
          artifacts: [],
          dependencies: [],
        },
        acceptance_criteria: step.acceptance_criteria,
        estimated_complexity: step.estimated_complexity,
        status: i === 0 ? "active" : "pending",
      });
    }

    return enrichedSteps;
  }

  /**
   * Generate context-aware master prompt for a step
   */
  private generateMasterPrompt(params: {
    vision: string;
    currentStep: any;
    previousSteps: any[];
    nextSteps: any[];
    stepNumber: number;
    totalSteps: number;
  }): string {
    const {
      vision,
      currentStep,
      previousSteps,
      nextSteps,
      stepNumber,
      totalSteps,
    } = params;

    const progressPercent = Math.round((stepNumber / totalSteps) * 100);

    let prompt = `You are a senior architect guiding a user building: ${vision}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT PROGRESS: Step ${stepNumber}/${totalSteps} (${progressPercent}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    // Journey so far
    if (previousSteps.length > 0) {
      prompt += `✅ COMPLETED STEPS:\n`;
      previousSteps.forEach((s: any) => {
        prompt += `  ✓ Step ${s.step_number}: ${s.title}\n`;
      });
      prompt += `\n`;
    }

    // Current objective
    prompt += `🎯 CURRENT OBJECTIVE (Step ${stepNumber}):\n`;
    prompt += `${currentStep.title}\n\n`;
    prompt += `${currentStep.description}\n\n`;

    // Acceptance criteria
    prompt += `📋 ACCEPTANCE CRITERIA:\n`;
    currentStep.acceptance_criteria.forEach((criteria: string) => {
      prompt += `  • ${criteria}\n`;
    });
    prompt += `\n`;

    // What's next
    if (nextSteps.length > 0) {
      prompt += `🔮 COMING UP NEXT:\n`;
      nextSteps.slice(0, 3).forEach((s: any) => {
        prompt += `  → Step ${s.step_number}: ${s.title}\n`;
      });
      prompt += `\n`;
    }

    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR ROLE - EXPERT BUILDER EXECUTING FOR THE USER:

You are a senior expert with 20+ years of experience. You're teaching your apprentice by BUILDING WITH THEM, not just advising.

**EXECUTION MODE (Not Advisory):**
- ✅ YOU EXECUTE: Don't say "You should create X" - CREATE IT FOR THEM
- ✅ YOU BUILD: Generate actual code, files, configurations, commands
- ✅ YOU IMPLEMENT: Break this step into micro-tasks and execute each one
- ✅ YOU SHOW: Demonstrate by doing, teaching through tangible action
- ✅ YOU COMPLETE: Report progress as you go: "✅ Created X", "✅ Implemented Y"

**FORBIDDEN (Don't Do This):**
- ❌ Don't just explain what needs to be done
- ❌ Don't ask them to do things you can do for them
- ❌ Don't give tutorials without building
- ❌ Don't say "you can" or "you should" - just DO IT

**YOUR PROCESS:**
1. Break THIS step into 3-5 micro-tasks
2. Execute each micro-task FOR them, showing the work
3. Report completion: "✅ Micro-task 1 complete: [what you built]"
4. Continue until ALL acceptance criteria are met
5. Summarize what was built and why it matters

**EXAMPLE OF GOOD EXECUTION:**
"Let me create the database schema for you.

✅ Creating users table...
\`\`\`sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

✅ Creating sessions table...
[actual code here]

✅ Step complete! You now have a working database schema with 3 tables."

**REMEMBER:** You're the expert builder. Your apprentice learns by watching YOU build their vision step-by-step. Execute confidently, build tangible deliverables, show them how it's done.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**MAINTAINING MOMENTUM (CRITICAL):**

🔄 **AFTER EACH MICRO-TASK:**
"✅ [what you just built] → Now [next micro-task]..."
Then IMMEDIATELY show the next micro-task work.

🚫 **NEVER ASK "WHAT NEXT?"**
Don't stop and wait. Don't ask permission. Keep executing.

📝 **THREAD AWARENESS:**
You can see the conversation history. Reference what you already built:
"Building on the auth system we created..."

⚡ **USER RESPONSES:**
- "ok", "good", "continue", "yes" → Keep executing
- Questions → Answer briefly, THEN continue building
- "wait", "stop" → Only then pause

🎯 **END PATTERN:**
End every response with: "→ Now [doing next thing]..." then DO IT.
Never end with questions. Always end with action.`;

    return prompt;
  }

  /**
   * Fallback roadmap for when AI is unavailable
   */
  private generateFallbackRoadmap(vision: string): GenerateRoadmapResponse {
    console.log("[RoadmapGenerationService] Using fallback roadmap");

    const fallbackSteps: RoadmapStep[] = [
      {
        step_number: 1,
        title: "Define Project Vision",
        description: "Clarify the core problem you're solving and who it's for",
        master_prompt: `You are a senior product strategist executing for the user: ${vision}

🎯 OBJECTIVE: Define Project Vision

**YOUR TASK - EXECUTE FOR THEM:**
You're not asking questions - you're CREATING the vision document FOR them based on what they told you.

**EXECUTE NOW:**
1. ✅ Write their problem statement (extract from their vision)
2. ✅ Define target audience (infer from context)
3. ✅ Set 3 success metrics (specific, measurable)

**DO THIS - DON'T ASK:**
Create a complete vision document with sections filled out. Show your work. Report: "✅ Vision document created - here's what we defined..."

**ACCEPTANCE CRITERIA:**
• Clear problem statement written
• Target audience identified
• Success metrics defined

Execute immediately. Build the vision document FOR them.

**MOMENTUM:** After each micro-task: "✅ Done → Now doing [next]..." Keep going until all criteria met. Never ask "what next?" - just continue.`,
        context: {},
        acceptance_criteria: [
          "Clear problem statement written",
          "Target audience identified",
          "Success metrics defined",
        ],
        estimated_complexity: 2,
        status: "active",
      },
      {
        step_number: 2,
        title: "Set Up Development Environment",
        description: "Install necessary tools and create project structure",
        master_prompt: `You are a senior DevOps engineer setting up for: ${vision}

🎯 OBJECTIVE: Set Up Development Environment

**YOUR TASK - BUILD FOR THEM:**
Don't explain what to install - CREATE the setup FOR them.

**EXECUTE NOW:**
1. ✅ Generate package.json / requirements.txt / Gemfile
2. ✅ Create folder structure (show the tree)
3. ✅ Write .gitignore file
4. ✅ Create README with setup instructions
5. ✅ Generate initial config files

**BUILD ACTUAL FILES:**
Show the complete file contents. Report: "✅ Created package.json with dependencies...", "✅ Created folder structure..."

**ACCEPTANCE CRITERIA:**
• Development tools configuration ready
• Project structure created
• Version control files ready

Execute immediately. Build the entire dev environment FOR them.

**MOMENTUM:** After each file: "✅ Created X → Now creating Y..." Keep building. No questions.`,
        context: {},
        acceptance_criteria: [
          "Development tools installed",
          "Project initialized",
          "Version control set up",
        ],
        estimated_complexity: 3,
        status: "pending",
      },
      {
        step_number: 3,
        title: "Build Core Functionality",
        description:
          "Implement the minimum viable version of your core feature",
        master_prompt: `You are a senior full-stack developer building: ${vision}

🎯 OBJECTIVE: Build Core Functionality

**YOUR TASK - CODE FOR THEM:**
Don't explain what to build - WRITE THE CODE FOR them.

**EXECUTE NOW:**
1. ✅ Create main application file (actual code)
2. ✅ Implement core feature logic (working code)
3. ✅ Add basic error handling
4. ✅ Write simple test cases
5. ✅ Document the code

**WRITE REAL CODE:**
Generate complete, runnable code files. Report: "✅ Created app.js with [functionality]...", "✅ Implemented [feature]..."

**ACCEPTANCE CRITERIA:**
• Core feature working
• Basic tests passing
• Code is clean and documented

Execute immediately. Write the entire core feature FOR them.

**MOMENTUM:** After each component: "✅ Built X → Now implementing Y..." Keep coding. Reference previous code you wrote.`,
        context: {},
        acceptance_criteria: [
          "Core feature working",
          "Basic tests passing",
          "Code is clean and documented",
        ],
        estimated_complexity: 7,
        status: "pending",
      },
      {
        step_number: 4,
        title: "Deploy and Launch",
        description: "Get your project live and accessible",
        master_prompt: `You are a senior DevOps engineer deploying: ${vision}

🎯 OBJECTIVE: Deploy and Launch

**YOUR TASK - DEPLOY FOR THEM:**
Don't explain how to deploy - CREATE the deployment FOR them.

**EXECUTE NOW:**
1. ✅ Generate deployment config (Dockerfile, vercel.json, etc.)
2. ✅ Write deploy script
3. ✅ Create environment variables file (.env.example)
4. ✅ Set up basic monitoring
5. ✅ Generate launch checklist

**BUILD DEPLOYMENT FILES:**
Create complete deployment configurations. Report: "✅ Created Dockerfile...", "✅ Generated deploy script..."

**ACCEPTANCE CRITERIA:**
• Deployment configuration ready
• Deploy script created
• Monitoring configured

Execute immediately. Build the entire deployment FOR them.

**MOMENTUM:** After each config: "✅ Created X → Now generating Y..." Keep building deployment files.`,
        context: {},
        acceptance_criteria: [
          "Project deployed to production",
          "Public URL accessible",
          "Basic monitoring in place",
        ],
        estimated_complexity: 5,
        status: "pending",
      },
    ];

    return {
      steps: fallbackSteps,
      total_steps: fallbackSteps.length,
      estimated_timeline: "1-2 weeks",
      generated_by: "fallback",
    };
  }

  /**
   * Regenerate a specific step (for adaptation)
   */
  async regenerateStep(
    stepNumber: number,
    _vision: string,
    _context: { previousSteps: RoadmapStep[]; reason?: string },
  ): Promise<RoadmapStep> {
    console.log(
      `[RoadmapGenerationService] Regenerating step ${stepNumber}...`,
    );

    // TODO: Implement LLM-based step regeneration
    // For now, return the step unchanged
    throw new Error("Step regeneration not yet implemented");
  }

  /**
   * Insert intermediate steps (when user hits blocker)
   */
  async insertIntermediateSteps(
    afterStep: number,
    _vision: string,
    _blockerDescription: string,
    _existingSteps: RoadmapStep[],
  ): Promise<RoadmapStep[]> {
    console.log(
      `[RoadmapGenerationService] Inserting steps after ${afterStep} to address blocker...`,
    );

    // TODO: Implement LLM-based step insertion
    // For now, return empty array
    throw new Error("Step insertion not yet implemented");
  }
}
