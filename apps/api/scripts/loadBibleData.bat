@echo off
REM Load full KJV Bible from JSON files into database
cd /d "%~dp0\.."

REM Read .env file and set variables
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "%%a=%%b"
)

REM Run the script
npx tsx scripts/loadBibleData.ts
