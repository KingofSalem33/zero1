# Bug Fix: Tool Argument Validation & Wrong Tool Selection

## 🐛 Problem Description

The agent kept calling `file_search` tool without a required `query` argument, receiving validation errors, and retrying infinitely. Additionally, it chose the wrong tool (file_search for internet research instead of web_search).

### Root Causes

1. **No argument validation before execution** - Tools were called with missing/undefined required parameters
2. **Infinite retry loop** - Same invalid call retried many times without progress
3. **Wrong tool selection** - Used `file_search` for government regulations (external web info) instead of `web_search`
4. **Unclear tool descriptions** - Model didn't understand when to use which tool

### Symptoms

```
Tool call: file_search({query: undefined})
→ Error: "invalid_type … expected string"
→ Retry same call with undefined
→ Error again
→ Retry again... (infinite loop)
→ No progress, user gets no response
```

---

## ✅ Solutions Implemented

### 1. Pre-Execution Argument Validation

Added `validateToolArguments()` function that checks BEFORE calling tools:

```typescript
function validateToolArguments(toolName: ToolName, args: any): string | null {
  switch (toolName) {
    case "web_search":
      if (!args.q || typeof args.q !== "string" || args.q.trim().length === 0) {
        return "web_search requires 'q' parameter (non-empty search query string). Example: {q: 'health department regulations'}";
      }
      break;

    case "file_search":
      if (
        !args.query ||
        typeof args.query !== "string" ||
        args.query.trim().length === 0
      ) {
        return "file_search requires 'query' parameter (non-empty search string). Note: Use web_search for internet research, not file_search.";
      }
      break;
    // ... other tools
  }
  return null; // Valid
}
```

**Behavior:**

- ✅ Validates required parameters exist
- ✅ Validates correct types (string, not undefined)
- ✅ Validates non-empty values (trim() > 0)
- ✅ Returns helpful error message with examples
- ✅ Includes guidance (e.g., "Use web_search for internet research")

---

### 2. Single-Attempt Retry Policy

When validation fails:

```typescript
if (validationError) {
  logger.error(
    { toolName, args, validationError },
    "Tool argument validation failed",
  );

  conversationMessages.push({
    type: "function_call_output",
    call_id: id,
    output: JSON.stringify({
      error: validationError,
      hint: "Provide all required parameters with correct types and non-empty values",
    }),
  });

  continue; // ✅ DO NOT RETRY - Skip to next tool call
}
```

**Behavior:**

- ✅ Returns error once to model
- ✅ Does NOT retry with same invalid arguments
- ✅ Continues to next tool or allows model to try different approach
- ✅ Prevents infinite loops

---

### 3. Explicit Tool Descriptions

Updated tool descriptions to guide model selection:

**web_search:**

```typescript
description: "Search the PUBLIC INTERNET for current, external information (news, regulations, laws, prices, weather, etc.). Use this for government regulations, health department rules, permits, licenses, current events, or any information NOT in uploaded files. Example: web_search({q: 'California cottage food law 2024'})";
```

**file_search:**

```typescript
description: "Search ONLY through USER-UPLOADED files (docs, PDFs, code that user provided). DO NOT use for: laws, regulations, permits, government requirements, news, or anything on the internet. Only use when user mentions 'uploaded files', 'my documents', 'this file', 'our notes', etc. Example: file_search({query: 'API endpoints in uploaded code'})";
```

**Key changes:**

- ✅ CAPITALIZED key differentiators (PUBLIC INTERNET vs USER-UPLOADED)
- ✅ Listed specific use cases (regulations, laws, permits = web)
- ✅ Listed negative examples (DO NOT use file_search for...)
- ✅ Added usage examples showing correct parameters

---

### 4. Parameter Schema Improvements

Added `minLength: 1` to required string parameters:

```typescript
{
  type: "string",
  description: "Search query - must be a non-empty string",
  minLength: 1, // ✅ Enforces non-empty
}
```

---

## 📊 Files Changed

### 1. `apps/api/src/ai/tools/index.ts`

- Updated all 4 tool descriptions with explicit guidance
- Added usage examples
- Added `minLength: 1` to string parameters
- Clarified when to use each tool

### 2. `apps/api/src/ai/runModelStream.ts`

- Added `validateToolArguments()` function
- Added pre-execution validation check
- Implements single-attempt policy (no retry on validation errors)
- Returns helpful error messages to model

### 3. `apps/api/src/ai/runModel.ts`

- Same validation function
- Same pre-execution check
- Consistent behavior in non-streaming mode

---

## 🔍 Before vs After

### Before (Broken)

**Scenario:** User asks "Research health department regulations"

```
[Iteration 1]
Model: file_search({query: undefined})  ❌ Wrong tool + missing arg
Validation: ❌ None - tool executes
Tool error: "expected string, got undefined"
Added to conversation

[Iteration 2]
Model: file_search({query: undefined})  ❌ Same bad call
Validation: ❌ None
Tool error: "expected string, got undefined"

[Iteration 3-10]
... same loop repeats ...
Max iterations reached → Empty response
```

**User sees:** Nothing (dead zone)

---

### After (Fixed)

**Scenario:** User asks "Research health department regulations"

```
[Iteration 1]
Model: file_search({query: undefined})  ← Still tries wrong tool
Validation: ✅ Catches missing 'query' parameter
Error returned to model: "file_search requires 'query' parameter (non-empty string). Note: Use web_search for internet research, not file_search."

[Iteration 2]
Model: (sees error message, reads tool descriptions)
Model: web_search({q: "health department cottage food regulations"})  ✅ Correct tool!
Validation: ✅ Passes ('q' is non-empty string)
Tool executes successfully
Returns: Compliance checklist from .gov sites

[Iteration 3]
Model: (composes response based on search results)
Returns: Complete compliance checklist to user
```

**User sees:** Detailed compliance checklist ✅

---

## 🎯 What "Good" Looks Like

For a request like "Research health department regulations":

1. **Model selects web_search** (not file_search)
2. **Provides proper query:** `{q: "state health department cottage food regulations"}`
3. **Validation passes** (non-empty string)
4. **Tool executes** → Fetches from .gov sites
5. **Model synthesizes** compliance checklist:
   - Licensing/permit types
   - Food categories allowed
   - Facility requirements
   - Equipment & sanitation
   - Labeling requirements
   - Process controls
   - Inspection procedures
   - Recordkeeping
   - Renewal cadence

---

## 📝 Validation Rules

### web_search

- ✅ Required: `q` (string, non-empty)
- ❌ Rejects: undefined, empty string, null
- 📖 Guidance: Use for internet research

### http_fetch

- ✅ Required: `url` (string, starts with http:// or https://)
- ❌ Rejects: undefined, empty, invalid URL
- 📖 Guidance: Use for specific URLs

### file_search

- ✅ Required: `query` (string, non-empty)
- ❌ Rejects: undefined, empty string
- 📖 Guidance: Use ONLY for uploaded files, hints to use web_search for internet

### calculator

- ✅ Required: `expression` (string, non-empty)
- ❌ Rejects: undefined, empty string

---

## 🚀 Deployment Impact

**Breaking Changes:** None

- Existing valid tool calls work unchanged
- Only invalid calls (that would have failed anyway) are caught earlier

**Improvements:**

- ✅ No more infinite retry loops
- ✅ Better error messages guide model to correct behavior
- ✅ Faster failure (fail fast at validation, not at execution)
- ✅ Better tool selection (clear descriptions)
- ✅ Consistent behavior (streaming & non-streaming)

---

## 🧪 Testing Scenarios

### Test 1: Missing Required Parameter

```
Tool call: web_search({})
Expected: Validation error immediately, no retry
Model sees: "web_search requires 'q' parameter..."
Result: Model tries again with proper parameters OR switches tools
```

### Test 2: Empty String Parameter

```
Tool call: file_search({query: ""})
Expected: Validation error
Model sees: Helpful error with example
Result: Model provides non-empty query
```

### Test 3: External Research (Correct Tool Selection)

```
User: "Research cottage food laws"
Expected: Model chooses web_search (not file_search)
Reason: Tool description clearly states file_search is for uploaded files only
Result: Successful web search, compliance info returned
```

### Test 4: Internal Files (Correct Tool Selection)

```
User: "Search my uploaded documentation for API endpoints"
Expected: Model chooses file_search
Reason: User mentions "uploaded documentation"
Result: Search through user's files
```

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Tool calls with missing arguments are rejected immediately
- [ ] Error messages appear in logs with helpful guidance
- [ ] No infinite retry loops (max 1 attempt per invalid call)
- [ ] Model switches to web_search when file_search fails
- [ ] Compliance checklist tasks use web_search by default
- [ ] File-specific tasks still use file_search
- [ ] Both streaming and non-streaming modes behave consistently

---

## 📚 Related Documentation

- `apps/api/src/ai/tools/index.ts` - Tool definitions
- `apps/api/src/ai/schemas.ts` - Zod validation schemas
- `apps/api/src/ai/runModel.ts` - Non-streaming execution
- `apps/api/src/ai/runModelStream.ts` - Streaming execution

---

**Fixed by:** Claude Code
**Date:** 2025-01-18
**Root Cause:** No pre-execution validation, unclear tool descriptions, infinite retries
**Solution:** Validate arguments before execution, explicit tool guidance, single-attempt policy
