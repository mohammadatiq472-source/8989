@echo off
:: MCP Unity Bridge Launcher
:: Called by VS Code Copilot MCP framework
:: Routes: VS Code Copilot <-> MCP Server (Node.js) <-> Unity WebSocket :8090

set UNITY_PORT=8090
node "C:\Users\Buffoon Queer\Desktop\8989\My project\Library\PackageCache\com.gamelovers.mcp-unity@72c005fa0ae2\Server~\build\index.js"
