#!/bin/bash
# mcp-cli.sh — 通过 stdio JSON-RPC 协议调用 {{mcpServerName}} MCP 工具
# 用法: .kimi-code/scripts/mcp-cli.sh <toolName> '<jsonArgs>'
# 示例: .kimi-code/scripts/mcp-cli.sh query_audit_records '{}'
# 说明: 当 IDE 未加载 .kimi-code/mcp.json 时，用本脚本等价调用 ADD 审计工具（不绕过审计）。

set -e
cd "$(dirname "$0")/../.."

TOOL="$1"
ARGS="$2"
[ -z "$TOOL" ] && { echo "用法: mcp-cli.sh <toolName> '<jsonArgs>'" >&2; exit 1; }
[ -z "$ARGS" ] && ARGS='{}'

MSG_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcp-cli","version":"1.0"}}}'
MSG_NOTIFY='{"jsonrpc":"2.0","method":"notifications/initialized"}'
MSG_CALL="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS}}"

{
  sleep 5
  echo "$MSG_INIT"
  sleep 1
  echo "$MSG_NOTIFY"
  sleep 1
  echo "$MSG_CALL"
  sleep 4
} | perl -e 'alarm 40; exec @ARGV' node_modules/.bin/tsx .kimi-code/scripts/mcp-server.ts 2>/dev/null | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d))
process.stdin.on("end", () => {
  const lines = s.split("\n").filter((l) => l.includes("\"id\":2"))
  if (!lines.length) { console.error("MCP 无响应"); process.exit(1) }
  try {
    const j = JSON.parse(lines[0])
    console.log(j.result?.content?.[0]?.text ?? JSON.stringify(j))
  } catch { console.log(lines[0]) }
})
'
