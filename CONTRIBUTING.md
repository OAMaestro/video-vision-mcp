# Contributing to Video Vision MCP

Thanks for contributing! Here's how it works.

## What We Welcome
- Bug fixes
- New video source support (new yt-dlp sites, edge cases)
- Better error messages
- Performance improvements
- Documentation improvements

## What We Don't Merge
- New external API key dependencies (Gemini, OpenAI, etc.) — this defeats the purpose
- Breaking changes to existing tool schemas without a major version bump
- Features that require server-side infrastructure

## Process
1. Open an issue first for anything non-trivial — discuss before building
2. Fork the repo, create a feature branch
3. Make your changes, ensure `npm run build` passes
4. Open a PR with the template filled out

## Running Locally
```
npm install
npm run build
node dist/index.js    # starts MCP server on stdio
```
