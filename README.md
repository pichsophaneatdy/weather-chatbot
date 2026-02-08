# AI Chat Assistant — Take-Home Assessment

A Next.js chat application powered by Claude, with tool-use capabilities.

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the chat interface.

> Note: You may see a Next.js SWC version warning on first run.
> A clean install (`rm -rf node_modules .next && npm install`) resolves it.

## Prerequisites

- Node.js 18+
- Python 3 (for the code analysis tool)
- An [Anthropic API key](https://console.anthropic.com/)

## Project Structure

```
app/
  page.tsx              # Chat UI (complete)
  layout.tsx            # Root layout
  api/chat/route.ts     # Chat API route
lib/
  tools/weather.ts      # Weather tool
  tools/analyze.ts      # Code analysis tool
  utils.ts              # Utility functions
components/ui/          # UI components
```

See [INSTRUCTIONS.md](./INSTRUCTIONS.md) for assessment details.
