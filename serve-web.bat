@echo off
echo Serving http://localhost:8000 — open this in your browser.
echo Press Ctrl+C to stop.
python -m http.server 8000
if errorlevel 1 (
  py -m http.server 8000
)
