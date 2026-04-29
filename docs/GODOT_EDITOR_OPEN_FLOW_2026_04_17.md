# Godot Editor Open Flow

## Project Root

- Repository root: `C:\Users\26739\Desktop\8989`
- Godot project root: `C:\Users\26739\Desktop\8989\godot-client`
- Godot formal main scene: `res://scenes/app/main.tscn`

## Editor Vs Runtime

- Window title `Godot Engine` means you are in the editor.
- Window title `SLG Commander Godot Client (DEBUG)` means you are running the project.
- If you only see the game UI, you are not inside the editor panels.

## Fixed Entry Points

- Open editor:
  - `Start-Godot-Editor.cmd`
  - or `npm run godot:editor`
- Run the mainline client window:
  - `Start-Godot-Mainline-Debug.cmd`
  - or `npm run godot:mainline:runtime`
- Run a one-shot headless smoke:
  - `Start-Godot-Headless-Smoke.cmd`
  - or `npm run godot:headless:smoke`

## Backend Pairing

- Start backend first when you need live runtime data:
  - `npm run start`
- Then open the editor or runtime window from the repo root.

## Godot Path Resolution

- The launchers now prefer:
  - `GODOT_EDITOR_EXE`
  - `GODOT_GUI_EXE`
  - `GODOT_CONSOLE_EXE`
  - `GODOT_EXE`
- If auto-detection fails on this machine, set one of those environment variables and rerun the launcher.

## Current Rule

- Do not treat `C:\Users\26739\Desktop\8989` as the Godot project root.
- Always open the actual Godot project under `godot-client`.
