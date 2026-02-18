# WebClaw Production Quality Loop

## Iteration Steps
1. Run `pnpm build` - fix if fails
2. Run `pnpm test` - fix if fails
3. Work on next uncompleted checklist item below
4. Commit progress

## Checklist
- [x] vitest.config.ts added to shared and mcp-server
- [x] packages/shared unit tests: 61 tests
- [x] mcp-server unit tests for native-messaging-client.ts and server.ts: 18 tests
- [x] extension unit tests for snapshot-engine.ts, action-executor.ts, webmcp-discovery.ts using jsdom: 53 tests
- [x] MCP Server stdio startup and shutdown test
- [x] manifest.json MV3 compliance validation
- [x] error handling improvements
- [x] README.md with architecture diagram and setup instructions
- [x] MIT LICENSE file
- [x] package.json metadata (repository, keywords, homepage)
- [x] npx webclaw --help support

## Done Conditions (ALL must be true)
- [x] pnpm build passes
- [x] pnpm test passes with 30+ test cases (132 tests)
- [x] README.md exists with setup instructions
- [x] LICENSE file exists
- [x] All checklist items above completed
- When ALL conditions met, output: <promise>WEBCLAW READY</promise>
