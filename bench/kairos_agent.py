"""
Kairos Installed Agent for Harbor / Terminal-Bench.

Installs bun + kairos-runtime + logos-kernel inside the Harbor container,
then runs the real kairos terminal-adapter with SANDBOX_MODE=host.
logos_exec commands execute directly in the container — no separate sandbox.

Usage:
    harbor run -d terminal-bench/terminal-bench-2 \
        --agent-import-path bench.kairos_agent:KairosAgent \
        -m anthropic/claude-opus-4-6 \
        ...
"""

import os
import shlex
from pathlib import Path
from typing import Optional

from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


# Where kairos-runtime lives inside the container
KAIROS_DIR = "/tmp/kairos"
LOGOS_BIN = "/usr/local/bin/logos-kernel"
LOGOS_SOCKET = "/tmp/logos-data/state/sandbox/logos.sock"


class KairosAgent(BaseInstalledAgent):

    @staticmethod
    def name() -> str:
        return "kairos"

    def version(self) -> Optional[str]:
        return "0.2.0"

    def get_version_command(self) -> str | None:
        return f"cat {KAIROS_DIR}/package.json 2>/dev/null | grep version | head -1"

    def parse_version(self, stdout: str) -> str:
        import re
        match = re.search(r'"version"\s*:\s*"([^"]+)"', stdout)
        return match.group(1) if match else stdout.strip()

    async def install(self, environment: BaseEnvironment) -> None:
        # 1. Install system deps
        await self.exec_as_root(
            environment,
            command=(
                "apt-get update && apt-get install -y --no-install-recommends "
                "curl unzip git ca-certificates gzip && "
                "rm -rf /var/lib/apt/lists/*"
            ),
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )

        # 2. Install bun (as root so it's available system-wide)
        await self.exec_as_root(
            environment,
            command=(
                "curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash && "
                "bun --version"
            ),
        )

        # 3. Clone kairos-runtime and install deps
        await self.exec_as_root(
            environment,
            command=(
                f"git clone --depth 1 -b feat/logos-native https://github.com/BH3GEI/kairos-runtime.git {KAIROS_DIR} && "
                f"cd {KAIROS_DIR} && bun install --production"
            ),
        )

        # 4. Upload and install logos-kernel binary (pre-compiled Linux arm64)
        # Look for binary in multiple places
        candidates = [
            os.environ.get("LOGOS_KERNEL_GZ", ""),
            os.path.expanduser("~/.kairos-bench/logos-kernel.gz"),
            os.path.join(os.path.dirname(__file__), "..", "logos-kernel.gz"),
        ]
        logos_gz = next((p for p in candidates if p and os.path.exists(p)), None)
        if logos_gz:
            self.logger.info(f"Uploading logos-kernel from {logos_gz}")
            await environment.upload_file(logos_gz, "/tmp/logos-kernel.gz")
            await self.exec_as_root(
                environment,
                command=(
                    f"gunzip -c /tmp/logos-kernel.gz > {LOGOS_BIN} && "
                    f"chmod +x {LOGOS_BIN} && "
                    f"{LOGOS_BIN} --version 2>/dev/null || echo 'logos-kernel installed'"
                ),
            )
        else:
            self.logger.warning(f"logos-kernel.gz not found, skipping. Looked in: {candidates}")

    def populate_context_post_run(self, context: AgentContext) -> None:
        # TODO: parse terminal-adapter output for token counts
        pass

    @with_prompt_template
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        escaped = shlex.quote(instruction)

        # Get LLM config from env
        api_key = os.environ.get("KAIROS_API_KEY", "")
        base_url = os.environ.get("KAIROS_BASE_URL", "")
        # Inside Docker container, localhost refers to the container itself.
        # Replace with host.docker.internal to reach the host machine.
        base_url = base_url.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal")
        model = os.environ.get("KAIROS_MODEL", "claude-opus-4-6")
        user_agent = os.environ.get("KAIROS_USER_AGENT", "")

        enclave_socket = "/tmp/kairos-enclave.sock"

        env = {
            "API_KEY": api_key,
            "BASE_URL": base_url,
            "MODEL": model,
            "LOGOS_SOCKET": LOGOS_SOCKET,
            "SANDBOX_MODE": "host",
            "LOGOS_DATA_DIR": "/tmp/logos-data",
        }
        if user_agent:
            env["OPENAI_FORCE_USER_AGENT"] = user_agent

        # Single-process: cli-adapter embeds the enclave runtime directly (no gRPC subprocess)
        await self.exec_as_agent(
            environment,
            command=(
                # Start logos-kernel if binary exists
                f"if [ -x {LOGOS_BIN} ]; then "
                f"  mkdir -p /tmp/logos-data/state/sandbox /tmp/logos-data/state/memory && "
                f"  export SANDBOX_MODE=host && "
                f"  export LOGOS_DATA_DIR=/tmp/logos-data && "
                f"  export VFS_SANDBOX_ROOT=/tmp/logos-data/state/sandbox && "
                f"  {LOGOS_BIN} > /tmp/logos-kernel.log 2>&1 & "
                f"  LOGOS_PID=$! && "
                # Wait for logos socket
                f"  for i in $(seq 1 30); do "
                f"    [ -S {LOGOS_SOCKET} ] && break; "
                f"    sleep 0.5; "
                f"  done && "
                f"  echo '[kairos] logos-kernel ready (pid '$LOGOS_PID')'; "
                f"else "
                f"  echo '[kairos] no logos-kernel, running without'; "
                f"fi && "
                f"cd {KAIROS_DIR} && "
                # Run cli-adapter (single process, embeds agent loop directly)
                f"bun {KAIROS_DIR}/src/cli-adapter/main.ts {escaped} "
                f"2>&1 | tee /logs/agent/kairos-output.txt"
            ),
            env=env,
        )
