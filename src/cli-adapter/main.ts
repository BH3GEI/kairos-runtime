#!/usr/bin/env bun
/**
 * CLI adapter for kairos-runtime — single-process mode.
 *
 * Directly invokes the OpenAI enclave runtime (no gRPC subprocess needed).
 * Much lighter than the two-process setup; suitable for Harbor containers.
 *
 * Usage:
 *   bun run src/cli-adapter/main.ts "fix the bug in auth.ts"
 *   echo "deploy the service" | bun run src/cli-adapter/main.ts
 */

import { createOpenAIEnclaveRuntime } from "../enclave-runtime/agent/core/openai";
import { logosPrimitiveTools } from "../enclave-runtime/agent/tools/logosPrimitives";
import { createFetchWebpageTool } from "../enclave-runtime/agent/tools";
import * as readline from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Set up runtime env vars required by enclave internals (tools doc writer etc.)
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
process.env.MEMORY_FILES_ROOT ??= resolve(REPO_ROOT, ".runtime/memory_files");
process.env.EVOLUTIONS_ROOT ??= resolve(REPO_ROOT, ".runtime/evolutions");
process.env.RUNTIME_ROOT ??= resolve(REPO_ROOT, ".runtime");
process.env.PROTO_ROOT ??= resolve(REPO_ROOT, ".runtime/proto");
process.env.READ_FILE_SAFE_ROOT ??= REPO_ROOT;

const CLI_SYSTEM_PROMPT = `You are a coding agent operating inside a sandboxed Linux environment.
Your job is to complete programming tasks by actually executing commands and writing files — not describing what you would do.

## Your tools
You have 5 primitives. Use them — do not describe what you would do.

- **logos_exec(command)** — run a shell command in your sandbox. Relative paths are auto-scoped to your working directory. Use this for: running code, installing packages, running tests, compiling, checking exit codes.
  - \`logos_exec("ls -la")\` — list files
  - \`logos_exec("python3 test_foo.py")\` — run tests
  - \`logos_exec("pip install requests")\` — install packages
  - \`logos_exec("cat requirements.txt")\` — read a file via shell

- **logos_write(uri, content)** — write a file. Use relative paths (auto-scoped to sandbox) or \`logos://sandbox/\` URIs.
  - \`logos_write("foo.py", "print('hello')")\` — write a file directly (preferred for code)

- **logos_read(uri)** — read a file or logos:// resource.
  - \`logos_read("foo.py")\` — read a file

- **logos_call(tool, params)** — call a proc tool.
  - \`logos_call("memory.search", { query: "..." })\` — search memory
  - \`logos_call("system.complete", {})\` — signal task complete

- **logos_patch(uri, partial)** — JSON deep merge at a logos:// URI.

## Workflow (follow this order strictly)
1. **EXPLORE**: Use logos_exec to understand the environment before writing anything.
   - \`logos_exec("ls -la")\` to see what files exist
   - \`logos_exec("find . -type f")\` to discover project structure
   - \`logos_read("README.md")\` or \`logos_exec("cat <file>")\` to read existing code and requirements
2. **UNDERSTAND**: Identify what the task requires and what tests/criteria will verify success.
3. **IMPLEMENT**: Write files with logos_write, run commands with logos_exec.
4. **VERIFY**: Run tests. Check exit codes are 0. If a test runner exists, use it.
5. **ITERATE**: If something fails, read the error carefully and fix it.
6. **CONCLUDE**: Only after verification passes, summarize what you did.

## Critical rules
- ALWAYS use tools — never just describe what you would do.
- NEVER claim success without running the code and seeing it pass.
- logos_exec exit code non-zero = failure. Read the error before retrying.
- Prefer logos_write for writing files (faster than shell heredoc).
- Prefer simple, direct solutions.
`;

// Get input
async function getInput(): Promise<string> {
  const args = process.argv.slice(2);
  if (args.length > 0) return args.join(" ");

  if (!process.stdin.isTTY) {
    const chunks: string[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk.toString());
    return chunks.join("").trim();
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question("Task: ", answer => { rl.close(); resolve(answer.trim()); });
  });
}

const input = await getInput();
if (!input) {
  console.error("Usage: bun run src/cli-adapter/main.ts <task>");
  process.exit(1);
}

// Build tools
const tools: any[] = [...logosPrimitiveTools];
try { tools.push(createFetchWebpageTool()); } catch {}

// Create enclave runtime directly (no gRPC)
const runtime = createOpenAIEnclaveRuntime({
  tools,
  apiKey: process.env.API_KEY,
  baseURL: process.env.BASE_URL,
  model: process.env.MODEL,
});

const messages = [
  { role: "system", content: CLI_SYSTEM_PROMPT },
  { role: "user", content: input },
];

console.error(`[cli] task: ${input}`);

let fullOutput = "";
for await (const event of runtime.streamEvents(messages as any)) {
  if (event.type === "message_update" && event.role === "assistant" && event.delta) {
    process.stderr.write(event.delta);
    fullOutput += event.delta;
  }
}

console.error("\n[cli] done");
console.log(fullOutput);
