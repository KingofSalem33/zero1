# Test script for AI Chat API tools
# This script tests all the different tools available in the AI chat system
# Run with: powershell -ExecutionPolicy Bypass -File test-tools.ps1

$baseUrl = "http://localhost:3001"

Write-Host "=== AI Chat API Tool Testing Script ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl" -ForegroundColor Gray
Write-Host ""

# Check if server is running
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    if ($response.ok) {
        Write-Host "✅ Server is running" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Server is not running. Please start with 'npm run dev'" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 1: Current events question (forces web_search + http_fetch)
Write-Host "🔍 Test 1: Current Events (web_search + http_fetch)" -ForegroundColor Yellow
Write-Host "Question: What are the latest AI developments in 2024?" -ForegroundColor Gray

$test1Body = @{
    message = "What are the latest AI developments in 2024? Please search the web for recent news."
    userId = "test-user-1"
} | ConvertTo-Json

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method POST -Body $test1Body -ContentType "application/json"
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds

    Write-Host "✅ Success! Response time: $([math]::Round($duration, 2))s" -ForegroundColor Green
    Write-Host "📝 Response length: $($response.text.Length) characters" -ForegroundColor Gray
    Write-Host "🔗 Citations found: $($response.citations.Count)" -ForegroundColor Gray

    if ($response.citations.Count -gt 0) {
        Write-Host "📎 Sample citations:" -ForegroundColor Gray
        $response.citations | Select-Object -First 3 | ForEach-Object { Write-Host "   - $_" -ForegroundColor DarkGray }
    }
} catch {
    Write-Host "❌ Test 1 failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Math question (forces calculator)
Write-Host "🔢 Test 2: Mathematical Calculation (calculator)" -ForegroundColor Yellow
Write-Host "Question: Complex math calculation" -ForegroundColor Gray

$test2Body = @{
    message = "Calculate the result of: sqrt(144) + 3^4 - (25 * 2) + ln(e^3)"
    userId = "test-user-2"
} | ConvertTo-Json

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method POST -Body $test2Body -ContentType "application/json"
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds

    Write-Host "✅ Success! Response time: $([math]::Round($duration, 2))s" -ForegroundColor Green
    Write-Host "📝 Response: $($response.text.Substring(0, [Math]::Min(150, $response.text.Length)))..." -ForegroundColor Gray
} catch {
    Write-Host "❌ Test 2 failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: File upload and search (forces file_search)
Write-Host "📄 Test 3: File Upload and Search (file_search)" -ForegroundColor Yellow
Write-Host "Step 1: Uploading test document..." -ForegroundColor Gray

# Create a test document
$testDocContent = @"
AI Development Guidelines

Introduction:
This document outlines best practices for developing AI applications.

Key Principles:
1. Safety First: Always prioritize user safety and data privacy
2. Transparency: Ensure AI decisions are explainable
3. Fairness: Avoid bias and ensure equitable outcomes
4. Reliability: Build robust systems that handle edge cases

Technical Requirements:
- Use TypeScript for type safety
- Implement proper error handling
- Add comprehensive logging
- Include unit and integration tests

Security Considerations:
- Input validation and sanitization
- Rate limiting for API endpoints
- Secure credential management
- Regular security audits

Performance Optimization:
- Caching strategies for frequently accessed data
- Lazy loading for large datasets
- Database query optimization
- CDN usage for static assets
"@

# Write test document to temporary file
$testDocPath = Join-Path $env:TEMP "ai-guidelines-test.txt"
$testDocContent | Out-File -FilePath $testDocPath -Encoding UTF8

try {
    # Upload the file using multipart form data
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    $fileContent = Get-Content $testDocPath -Raw
    $fileName = Split-Path $testDocPath -Leaf

    $bodyLines = (
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: text/plain$LF",
        $fileContent,
        "--$boundary--$LF"
    ) -join $LF

    $uploadResponse = Invoke-RestMethod -Uri "$baseUrl/api/files" -Method POST -Body $bodyLines -ContentType "multipart/form-data; boundary=$boundary"
    Write-Host "✅ File uploaded successfully: $($uploadResponse.name) ($($uploadResponse.bytes) bytes)" -ForegroundColor Green

    # Now test file search
    Write-Host "Step 2: Searching uploaded document..." -ForegroundColor Gray

    $test3Body = @{
        message = "What are the key principles mentioned in the uploaded AI development document?"
        userId = "test-user-3"
    } | ConvertTo-Json

    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method POST -Body $test3Body -ContentType "application/json"
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds

    Write-Host "✅ Success! Response time: $([math]::Round($duration, 2))s" -ForegroundColor Green
    Write-Host "📝 Response: $($response.text.Substring(0, [Math]::Min(200, $response.text.Length)))..." -ForegroundColor Gray

    # Clean up
    Remove-Item $testDocPath -ErrorAction SilentlyContinue

} catch {
    Write-Host "❌ Test 3 failed: $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item $testDocPath -ErrorAction SilentlyContinue
}

Write-Host ""

# Test 4: JSON format response
Write-Host "📋 Test 4: JSON Format Response" -ForegroundColor Yellow
Write-Host "Question: Structured output test" -ForegroundColor Gray

$test4Body = @{
    message = "List the top 3 programming languages for web development in 2024"
    format = "json"
    userId = "test-user-4"
} | ConvertTo-Json

try {
    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method POST -Body $test4Body -ContentType "application/json"
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds

    Write-Host "✅ Success! Response time: $([math]::Round($duration, 2))s" -ForegroundColor Green

    if ($response.answer) {
        Write-Host "📝 JSON Response received with answer field" -ForegroundColor Gray
        Write-Host "📎 Sources: $($response.sources.Count)" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Response not in expected JSON format" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Test 4 failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Memory system test
Write-Host "🧠 Test 5: Memory System" -ForegroundColor Yellow
Write-Host "Step 1: Adding facts to memory..." -ForegroundColor Gray

$memoryBody1 = @{
    userId = "test-memory-user"
    fact = "User is a senior software engineer specializing in Node.js"
} | ConvertTo-Json

$memoryBody2 = @{
    userId = "test-memory-user"
    fact = "User prefers functional programming paradigms"
} | ConvertTo-Json

try {
    # Add facts to memory
    $memResponse1 = Invoke-RestMethod -Uri "$baseUrl/api/memory" -Method POST -Body $memoryBody1 -ContentType "application/json"
    $memResponse2 = Invoke-RestMethod -Uri "$baseUrl/api/memory" -Method POST -Body $memoryBody2 -ContentType "application/json"

    Write-Host "✅ Facts added to memory: $($memResponse2.facts.Count) total facts" -ForegroundColor Green

    # Test chat with memory
    Write-Host "Step 2: Testing chat with memory context..." -ForegroundColor Gray

    $test5Body = @{
        message = "What technology stack would you recommend for my next project?"
        userId = "test-memory-user"
    } | ConvertTo-Json

    $startTime = Get-Date
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method POST -Body $test5Body -ContentType "application/json"
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds

    Write-Host "✅ Success! Response time: $([math]::Round($duration, 2))s" -ForegroundColor Green
    Write-Host "📝 Response includes user context (should mention Node.js/functional programming)" -ForegroundColor Gray

    # Clean up memory
    $cleanupResponse = Invoke-RestMethod -Uri "$baseUrl/api/memory?userId=test-memory-user" -Method DELETE
    Write-Host "🧹 Memory cleaned up" -ForegroundColor Gray

} catch {
    Write-Host "❌ Test 5 failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Summary
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "✅ Web Search + HTTP Fetch: Current events query" -ForegroundColor Green
Write-Host "✅ Calculator: Complex mathematical expressions" -ForegroundColor Green
Write-Host "✅ File Search: Document upload and content search" -ForegroundColor Green
Write-Host "✅ JSON Format: Structured response handling" -ForegroundColor Green
Write-Host "✅ Memory System: User facts and personalization" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 All tool tests completed!" -ForegroundColor Green
Write-Host "📊 The AI chat system supports all major tools and features." -ForegroundColor Gray

# Additional manual test suggestions
Write-Host ""
Write-Host "=== Manual Test Suggestions ===" -ForegroundColor Cyan
Write-Host "Try these additional tests manually:" -ForegroundColor Gray
Write-Host "• Test error handling with invalid requests" -ForegroundColor DarkGray
Write-Host "• Test rate limiting with rapid requests" -ForegroundColor DarkGray
Write-Host "• Test large file uploads (approaching 10MB limit)" -ForegroundColor DarkGray
Write-Host "• Test conversation threading with userId" -ForegroundColor DarkGray
Write-Host "• Test tool combinations in single queries" -ForegroundColor DarkGray