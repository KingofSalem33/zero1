@echo off
REM Check verse count in database
cd /d "%~dp0\.."

REM Read .env file and set variables
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "%%a=%%b"
)

REM Run the script
npx tsx scripts/checkVerseCount.ts
