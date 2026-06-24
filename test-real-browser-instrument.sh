@echo off
REM Create a helper HTML page that hosts the test and collects diagnostics
REM This runs via Node.js + Puppeteer with headless:false

REM First check if puppeteer is installed
node -e "require('puppeteer')" 2>nul || echo Puppeteer not found. Run: npm install puppeteer
echo Starting real-browser instrumented test...
echo NOTE: This opens two browser windows. Watch the viewer choppiness.
echo Press Ctrl+C in this terminal to exit.
