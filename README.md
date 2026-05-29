# AI UI Testing Tool

An autonomous, AI-powered front-end UI testing tool. It crawls, plans, generates, runs, and heals Playwright test suites using sequential Claude agents (Sonnet) integrated with the Playwright CLI.

## Prerequisites

* Node.js (v18+)
* An Anthropic API key (`ANTHROPIC_API_KEY`)

## Setup & Installation

Follow these steps to set up and initialize the project:

### 1. Install Dependencies
Install all package dependencies via npm:
```bash
npm install
```

### 2. Initialize Playwright CLI & Skills
The agent pipeline uses Microsoft's token-efficient `@playwright/cli` to drive browser actions. You **must** initialize the workspace and install the agent skills:
```bash
npx playwright-cli install --skills
```
This initializes the workspace and outputs the skill definitions to `.claude/skills/playwright-cli/SKILL.md` so the AI subagents can discover and correctly execute browser commands without errors.

### 3. Environment Variables
Create a `.env.local` file at the root of the project and set your Anthropic API Key:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Running the Application

### Running the Web UI locally:
Start the Next.js development server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### Running Unit Tests:
Run the test suite using:
```bash
npm run test:unit
```

### Building for Production:
```bash
npm run build
```
