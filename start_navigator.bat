@echo off
title Ibis Rice Field Navigator
echo ========================================================
echo    IBIS RICE FIELD PLOT NAVIGATOR
echo ========================================================
echo Starting local offline server on http://localhost:8080...
echo Opening browser...
start http://localhost:8080
python server.py
pause
