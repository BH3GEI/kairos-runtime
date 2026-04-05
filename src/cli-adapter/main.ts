#!/usr/bin/env bun
/**
 * CLI adapter for kairos-runtime.
 *
 * Full Telegram-equivalent pipeline: persona, context, memory — all through logos kernel.
 * Replaces terminal-adapter/main.ts (which bypassed clientRuntime entirely).
 *
 * Requires enclave-runtime running separately (same as Telegram mode).
 *
 * Usage:
 *   bun run src/cli-adapter/main.ts "fix the bug in auth.ts"
 *   echo "deploy the service" | bun run src/cli-adapter/main.ts
 */

import { createClientRuntime } from "../state-daemon/gateway/clientRuntime";
import { createGrpcEnclaveClient } from "../state-daemon/enclave/client";
import { MemoryVfsClient } from "../state-daemon/storage/vfs/client";
import type { TelegramMessage } from "../state-daemon/types/message";
import * as readline from "node:readline";

const CLI_BOT_UID = "cli-agent";

const CLI_PERSONA = `You are a coding agent operating inside a sandboxed Linux environment via the Logos kernel.
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

const enclaveTarget = process.env.AGENT_ENCLAVE_TARGET ?? process.env.KAIROS_ENCLAVE_SOCKET;
if (!enclaveTarget) {
  console.error("AGENT_ENCLAVE_TARGET or KAIROS_ENCLAVE_SOCKET required");
  process.exit(1);
}

const enclaveClient = createGrpcEnclaveClient({ target: enclaveTarget });
const vfs = new MemoryVfsClient();

// Write cli-agent persona so clientRuntime picks it up
await vfs.write({
  path: `logos://users/${CLI_BOT_UID}/persona/long.md`,
  content: CLI_PERSONA,
}).catch(() => {});

const runtime = createClientRuntime({ enclaveClient, vfsClient: vfs, botUid: CLI_BOT_UID });

const triggerMessage: TelegramMessage = {
  userId: "cli-user",
  messageId: Date.now(),
  chatId: 0,
  conversationType: "private",
  context: input,
  timestamp: Math.floor(Date.now() / 1000),
  metadata: {
    isBot: false,
    username: "cli",
    replyToMessageId: null,
    replyToUserId: null,
    isReplyToMe: false,
    isMentionMe: false,
    mentions: [],
  },
};

console.error(`[cli] task: ${input}`);

let fullOutput = "";
for await (const chunk of runtime.streamReply({ triggerMessage, prompt: input })) {
  process.stderr.write(chunk);
  fullOutput += chunk;
}

console.error("\n[cli] done");
console.log(fullOutput);
