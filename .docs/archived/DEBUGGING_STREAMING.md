# Debugging Guide: Streaming No Text Output

## 🔍 How to Debug

Now that comprehensive logging is added, follow these steps to diagnose the issue:

### Step 1: Test the Stream

Run a test request:

```bash
# In one terminal, watch backend logs
npm run dev

# In another terminal or browser, trigger a streaming request
```

---

### Step 2: Check Backend Logs

Look for these key log lines in order:

#### ✅ Expected Flow

```
[runModelStream] Iteration 1: Added output item type=function_tool_call
[SSE] Sending event: tool_call, data: {"tool":"web_search","args":...
[runModelStream] Iteration 1 stream complete. This iteration: 0 chars, Total accumulated: 0 chars, Output items: 1
  Item 0: type=function_tool_call, name=web_search
[runModelStream] Tool results added to conversation. Looping for AI response...

[runModelStream] Iteration 2: Added output item type=message
[runModelStream] Iteration 2: Text delta received (15 chars)
[SSE] Sending event: content, data: {"delta":"Based on the..."}  ← CRITICAL: Must see this!
[runModelStream] Iteration 2: Text delta received (22 chars)
[SSE] Sending event: content, data: {"delta":" search results..."}
...
[runModelStream] Iteration 2 stream complete. This iteration: 247 chars, Total accumulated: 247 chars
[runModelStream] No tool calls in iteration 2. Ending stream with 247 total chars.
[SSE] Sending event: done, data: {"citations":[]}
```

#### ❌ Problem Scenarios

**Scenario A: No text deltas in iteration 2**

```
[runModelStream] Iteration 2 stream complete. This iteration: 0 chars  ← PROBLEM!
[runModelStream] Fallback extracted 247 chars from output items  ← Fallback triggered
[SSE] Sending event: content, data: {"delta":"Based on the..."}  ← Sent as single chunk
```

**Diagnosis:** OpenAI API is sending text in `message.content` but not as deltas. The fallback code should handle this.

**Scenario B: No iteration 2 at all**

```
[runModelStream] Iteration 1 stream complete. This iteration: 0 chars
[runModelStream] Max iterations reached. Returning 0 total chars.  ← PROBLEM!
```

**Diagnosis:** Loop is exiting prematurely or not continuing after tool calls.

**Scenario C: SSE events not being sent**

```
[runModelStream] Iteration 2: Text delta received (15 chars)
// NO [SSE] Sending event log!  ← PROBLEM!
```

**Diagnosis:** `sendEvent` function not being called or response stream closed.

---

### Step 3: Check Frontend Logs

Open browser console and look for:

#### ✅ Expected Flow

```
[Frontend SSE] Event type: tool_call
[Frontend SSE] Parsed data for event "tool_call": {tool: "web_search", ...}

[Frontend SSE] Event type: content
[Frontend SSE] Parsed data for event "content": {delta: "Based on the"}
[Frontend SSE] Received content delta: "Based on the"
[Frontend SSE] Accumulated content length: 13

[Frontend SSE] Event type: content
[Frontend SSE] Parsed data for event "content": {delta: " search results"}
[Frontend SSE] Received content delta: " search results"
[Frontend SSE] Accumulated content length: 28
...

[Frontend SSE] Event type: done
[Frontend SSE] Parsed data for event "done": {citations: []}
```

#### ❌ Problem Scenarios

**Scenario A: No content events received**

```
[Frontend SSE] Event type: tool_call
[Frontend SSE] Event type: done  ← No content events!
```

**Diagnosis:** Backend is not sending content events. Check backend logs.

**Scenario B: Content events received but not parsed**

```
[Frontend SSE] Event type: content
// NO "Parsed data" log!  ← JSON parse failed
```

**Diagnosis:** Malformed JSON in SSE data. Check backend SSE format.

**Scenario C: Content parsed but not displayed**

```
[Frontend SSE] Received content delta: "Based on the"
[Frontend SSE] Accumulated content length: 13
// But UI still shows "Thinking..."  ← React state not updating
```

**Diagnosis:** React state update issue. Check `setMessages` is working.

---

## 🛠️ Fixes Based on Diagnosis

### Fix 1: Text Deltas Not Sent (Use Fallback)

If iteration 2 shows `0 chars` but output items contain text, the fallback code should extract it.

**Check:** Look for this log:

```
[runModelStream] Fallback extracted 247 chars from output items
```

If you DON'T see this fallback log, the issue is in lines 157-175 of `runModelStream.ts`.

### Fix 2: Loop Exits Prematurely

If only iteration 1 runs, check:

- Tool results are being added to `conversationMessages` (line 256)
- Loop continues after tool processing (line 289-291)
- `iterations < maxIterations` (should be max 10)

### Fix 3: Response Stream Closed

If SSE events stop sending mid-stream:

- Check for errors in backend logs
- Verify response stream not closed early
- Check rate limiter not blocking subsequent iterations

### Fix 4: Frontend Not Parsing

If frontend logs show no events:

- Check browser Network tab → Look for streaming request
- Verify Content-Type: `text/event-stream` in response headers
- Check for CORS issues blocking SSE

---

## 📊 Quick Diagnostic Checklist

Run through this checklist when debugging:

### Backend Checklist

- [ ] Do you see `[runModelStream] Iteration 2` logs?
- [ ] Do you see `Text delta received` logs in iteration 2?
- [ ] Do you see `[SSE] Sending event: content` logs?
- [ ] Is `Total accumulated` > 0 at the end?
- [ ] Do you see `Ending stream with X total chars` where X > 0?

### Frontend Checklist

- [ ] Do you see `[Frontend SSE] Event type: content` logs?
- [ ] Do you see `Parsed data` logs?
- [ ] Do you see `Received content delta` logs?
- [ ] Is `Accumulated content length` increasing?
- [ ] Does the UI update (check React DevTools)?

### Network Checklist

- [ ] Is the request showing as "Pending" (streaming)?
- [ ] Are response headers correct (`text/event-stream`)?
- [ ] Are you seeing data chunks in Network → Response tab?
- [ ] Any CORS errors in console?

---

## 🔧 Common Issues & Solutions

### Issue: "Fallback extracted... chars" appears every time

**Cause:** OpenAI API not sending `response.output_text.delta` events, only complete messages.

**Solution:** The fallback is working correctly. This might be expected behavior for some models.

**Verify:** Check if text IS appearing in frontend. If yes, everything is working fine.

---

### Issue: No iteration 2, "Max iterations reached"

**Cause:** Loop not continuing after tool calls.

**Solution:** Check line 289-291. Should see:

```javascript
logger.info(
  "Tool calls completed, requesting model response in next iteration",
);
console.log(`Iteration ${iterations} complete. Tool results added...`);
// Loop should continue here!
```

---

### Issue: Frontend shows "Thinking..." forever

**Possible Causes:**

1. Backend error before sending any content
2. SSE connection dropped
3. React state not updating

**Solution:**

1. Check backend logs for errors
2. Check browser Network tab for failed requests
3. Check browser console for React errors

---

## 🎯 Next Steps

Based on the logs you see:

1. **If backend shows text deltas sent but frontend receives nothing:**
   - Network/CORS issue
   - Check browser Network tab

2. **If backend shows no text deltas in iteration 2:**
   - API not returning text
   - Fallback should trigger
   - Check OpenAI API response format

3. **If frontend receives events but doesn't display:**
   - React state update issue
   - Check React DevTools
   - Verify `setMessages` is called

4. **If everything logs correctly but UI doesn't update:**
   - Check MarkdownMessage component
   - Verify message rendering logic

---

## 📝 Collect This Info

When reporting issues, collect:

1. **Full backend logs** from request start to "Streaming step executed successfully"
2. **Full frontend console logs** for the request
3. **Network tab screenshot** showing the streaming request
4. **Browser/Node versions**

This will allow precise diagnosis of the issue.

---

**Created:** 2025-01-18
**Purpose:** Debug streaming pipeline with no text output
**Status:** Comprehensive logging added, ready for testing
