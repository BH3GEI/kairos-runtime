"""
Kairos agent for Harbor / Terminal-Bench.

External agent that uses the same LLM and tool-calling approach as
kairos-runtime's terminal-adapter, but executes commands through
Harbor's environment.exec() so results land inside the benchmark container.

Usage:
    harbor run -d terminal-bench/terminal-bench-2 \
        --agent-import-path bench.kairos_agent:KairosAgent \
        ...
"""

import json
import os
from typing import Optional

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

import openai


SYSTEM_PROMPT = """You are an autonomous coding agent. Solve the task using the tools provided.

Rules:
- Use bash_exec to run shell commands in the environment.
- Use write_file to create or overwrite files.
- Use read_file to read file contents.
- Be concise. Do not explain unless asked.
- When the task is done, stop calling tools.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "bash_exec",
            "description": "Execute a bash command in the environment. Returns stdout, stderr, and exit code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The bash command to execute."},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file (creates or overwrites).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute file path."},
                    "content": {"type": "string", "description": "File content."},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file and return its contents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute file path."},
                },
                "required": ["path"],
            },
        },
    },
]

MAX_TURNS = 30
MAX_OUTPUT_CHARS = 16000


class KairosAgent(BaseAgent):

    @staticmethod
    def name() -> str:
        return "kairos"

    def version(self) -> Optional[str]:
        return "0.1.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        pass

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        api_key = os.environ.get("KAIROS_API_KEY") or os.environ.get("API_KEY", "")
        base_url = os.environ.get("KAIROS_BASE_URL") or os.environ.get("BASE_URL", "https://api.kimi.com/coding/v1")
        model = os.environ.get("KAIROS_MODEL") or os.environ.get("MODEL", "kimi-for-coding")
        force_ua = os.environ.get("KAIROS_USER_AGENT", "RooCode/0.1.9")

        client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            default_headers={"User-Agent": force_ua} if force_ua else {},
            timeout=300.0,
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": instruction},
        ]

        total_input_tokens = 0
        total_output_tokens = 0

        for turn in range(MAX_TURNS):
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOLS,
                    max_tokens=4096,
                )
            except Exception as e:
                self.logger.error(f"LLM error on turn {turn}: {e}")
                break

            # Track token usage
            if response.usage:
                total_input_tokens += response.usage.prompt_tokens or 0
                total_output_tokens += response.usage.completion_tokens or 0

            choice = response.choices[0]
            msg = choice.message

            # Build assistant message for conversation history
            # Preserve reasoning_content for reasoning models (kimi, deepseek-r1, etc.)
            assistant_msg: dict = {"role": "assistant", "content": msg.content or ""}

            # Handle reasoning_content if present (needed by reasoning models)
            reasoning = getattr(msg, "reasoning_content", None)
            if reasoning:
                assistant_msg["reasoning_content"] = reasoning

            if msg.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ]
            messages.append(assistant_msg)

            # If no tool calls, agent is done
            if not msg.tool_calls:
                break

            # Execute tool calls
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                result = await self._execute_tool(fn_name, args, environment)

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result[:MAX_OUTPUT_CHARS],
                })

            if choice.finish_reason == "stop":
                break

        # Populate context with token usage
        context.n_input_tokens = total_input_tokens
        context.n_output_tokens = total_output_tokens

    async def _execute_tool(
        self, name: str, args: dict, env: BaseEnvironment
    ) -> str:
        try:
            if name == "bash_exec":
                cmd = args.get("command", "")
                result = await env.exec(cmd)
                output = ""
                if result.stdout:
                    output += result.stdout
                if result.stderr:
                    output += ("\n" if output else "") + result.stderr
                if result.return_code != 0:
                    output += f"\n[exit code: {result.return_code}]"
                return output or "(no output)"

            elif name == "write_file":
                path = args.get("path", "")
                content = args.get("content", "")
                # Use base64 to avoid heredoc escaping issues
                import base64
                b64 = base64.b64encode(content.encode()).decode()
                cmd = f"mkdir -p $(dirname '{path}') && echo '{b64}' | base64 -d > '{path}'"
                result = await env.exec(cmd)
                if result.return_code != 0:
                    return f"write error: {result.stderr}"
                return "ok"

            elif name == "read_file":
                path = args.get("path", "")
                result = await env.exec(f"cat '{path}'")
                if result.return_code != 0:
                    return f"read error: {result.stderr}"
                return result.stdout or "(empty)"

            else:
                return f"unknown tool: {name}"

        except Exception as e:
            return f"tool error: {e}"
