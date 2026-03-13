@echo off
echo ====================================
echo Populating verse_strongs Table
echo ====================================
echo.

npx dotenv -e .env -- npx tsx scripts/populateStrongsNumbers.ts

echo.
echo ====================================
echo Done!
echo ====================================
pause
