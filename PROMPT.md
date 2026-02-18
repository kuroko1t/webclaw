# WebClaw Production Quality Loop

## Iteration Steps
1. Run `pnpm build` - fix if fails
2. Run `pnpm test` - fix if fails
3. Work on next uncompleted checklist item below
4. Commit progress

## Already Completed
- vitest.config.ts added to shared and mcp-server
- packages/shared unit tests: 61 tests passing

## Remaining Checklist (work top to bottom)
- [ ] mcp-server unit tests for native-messaging-client.ts and server.ts
- [ ] extension unit tests for snapshot-engine.ts, action-executor.ts, webmcp-discovery.ts using jsdom
- [ ] MCP Server stdio startup and shutdown test
- [ ] manifest.json MV3 compliance validation
- [ ] error handling improvements
- [ ] README.md with architecture diagram and setup instructions
- [ ] MIT LICENSE file
- [ ] package.json metadata (repository, keywords, homepage)
- [ ] npx webclaw --help support

## Done Conditions (ALL must be true)
- pnpm build passes
- pnpm test passes with 30+ test cases
- README.md exists with setup instructions
- LICENSE file exists
- All checklist items above completed
- When ALL conditions met, output: <promise>WEBCLAW READY</promise>

## Rules
- Do not try to do everything in one iteration
- Do not commit if tests are failing
- Make steady, reliable progress each iteration
