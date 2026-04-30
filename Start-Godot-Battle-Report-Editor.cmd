@echo off
setlocal
cd /d "%~dp0"
call scripts\run_python.cmd scripts\launch_godot.py --mode editor --scene res://scenes/ui/battle_report_panel.tscn %*
