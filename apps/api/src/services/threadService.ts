import { supabase } from "../db";
import type { ChatCompletionMessageParam } from "openai/resources";
import { trimContextIfNeeded } from "../utils/contextTrimmer";
import pino from "pino";

const logger = pino({ name: "thread-service" });

export interface Thread {
  id: string;
  project_id: string;
  title: string;
  context: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ThreadContext {
  user_preferences?: string[];
  project_facts?: string[];
  key_decisions?: string[];
}

const MAX_HISTORY_MESSAGES = 10; // Last N messages to include in context

export class ThreadService {
  /**
   * Create a new thread for a project
   */
  async createThread(projectId: string, title?: string): Promise<Thread> {
    const { data, error } = await supabase
      .from("threads")
      .insert({
        project_id: projectId,
        title: title || "New Conversation",
        context: {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create thread: ${error.message}`);
    return data;
  }

  /**
   * Get or create a thread for a project
   */
  async getOrCreateThread(projectId: string): Promise<Thread> {
    // Try to get the most recent thread
    const { data: existingThreads, error: fetchError } = await supabase
      .from("threads")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      throw new Error(`Failed to fetch thread: ${fetchError.message}`);
    }

    if (existingThreads && existingThreads.length > 0) {
      return existingThreads[0];
    }

    // Create new thread if none exists
    return this.createThread(projectId);
  }

  /**
   * Save a message to a thread
   */
  async saveMessage(
    threadId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata: Record<string, any> = {},
  ): Promise<Message> {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        role,
        content,
        metadata,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to save message: ${error.message}`);

    // Update thread's updated_at
    await supabase
      .from("threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    return data;
  }

  /**
   * Get recent messages for a thread
   */
  async getRecentMessages(
    threadId: string,
    limit: number = MAX_HISTORY_MESSAGES,
  ): Promise<Message[]> {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch messages: ${error.message}`);

    // Return in chronological order (oldest first)
    return (data || []).reverse();
  }

  /**
   * Build context for the AI with recent history + lightweight facts
   * Automatically trims context if it exceeds token limits
   */
  async buildContextMessages(
    threadId: string,
    systemPrompt: string,
    model: string = "gpt-4o",
  ): Promise<ChatCompletionMessageParam[]> {
    const thread = await this.getThread(threadId);
    const recentMessages = await this.getRecentMessages(threadId);

    const messages: ChatCompletionMessageParam[] = [];

    // 1. System message with thread context
    let enhancedSystemPrompt = systemPrompt;

    if (thread.context && Object.keys(thread.context).length > 0) {
      const contextSummary = this.formatContext(thread.context);
      enhancedSystemPrompt += `\n\n## Conversation Context\n${contextSummary}`;
    }

    messages.push({
      role: "system",
      content: enhancedSystemPrompt,
    });

    // 2. Recent conversation history
    for (const msg of recentMessages) {
      if (msg.role !== "system") {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // 3. Trim context if needed (summarize old assistant messages, preserve user messages)
    const trimResult = trimContextIfNeeded(messages, model);

    if (trimResult.trimmed) {
      logger.info(
        {
          threadId,
          originalTokens: trimResult.originalTokens,
          finalTokens: trimResult.finalTokens,
          summarizedCount: trimResult.summarizedCount,
          reduction: (
            ((trimResult.originalTokens - trimResult.finalTokens) /
              trimResult.originalTokens) *
            100
          ).toFixed(1),
        },
        "Context trimmed to fit token limit",
      );
    }

    return trimResult.messages;
  }

  /**
   * Update thread context with lightweight facts
   */
  async updateContext(
    threadId: string,
    updates: Partial<ThreadContext>,
  ): Promise<Thread> {
    const thread = await this.getThread(threadId);
    const updatedContext = {
      ...thread.context,
      ...updates,
    };

    const { data, error } = await supabase
      .from("threads")
      .update({ context: updatedContext })
      .eq("id", threadId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update context: ${error.message}`);
    return data;
  }

  /**
   * Get a thread by ID
   */
  async getThread(threadId: string): Promise<Thread> {
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (error) throw new Error(`Failed to fetch thread: ${error.message}`);
    return data;
  }

  /**
   * Format context into a readable string
   */
  private formatContext(context: ThreadContext): string {
    const parts: string[] = [];

    if (context.user_preferences && context.user_preferences.length > 0) {
      parts.push(
        `User Preferences:\n${context.user_preferences.map((p) => `- ${p}`).join("\n")}`,
      );
    }

    if (context.project_facts && context.project_facts.length > 0) {
      parts.push(
        `Project Facts:\n${context.project_facts.map((f) => `- ${f}`).join("\n")}`,
      );
    }

    if (context.key_decisions && context.key_decisions.length > 0) {
      parts.push(
        `Key Decisions:\n${context.key_decisions.map((d) => `- ${d}`).join("\n")}`,
      );
    }

    return parts.join("\n\n");
  }

  /**
   * List all threads for a project
   */
  async listThreads(projectId: string): Promise<Thread[]> {
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Failed to list threads: ${error.message}`);
    return data || [];
  }

  /**
   * Delete a thread and all its messages
   */
  async deleteThread(threadId: string): Promise<void> {
    const { error } = await supabase
      .from("threads")
      .delete()
      .eq("id", threadId);

    if (error) throw new Error(`Failed to delete thread: ${error.message}`);
  }

  /**
   * Auto-generate thread title from first message
   */
  async generateTitle(threadId: string, firstMessage: string): Promise<void> {
    const title =
      firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");

    await supabase.from("threads").update({ title }).eq("id", threadId);
  }
}

export const threadService = new ThreadService();
