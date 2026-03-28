import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentToolUpdateCallback, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import registerRlmTools from "../skills/rlm/extensions/rlm_tools.ts";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPL_SCRIPT_PATH = join(PACKAGE_ROOT, "skills", "rlm", "scripts", "rlm_repl.py");
const BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents");

interface RlmInitResult {
	success: boolean;
	statePath?: string;
	error?: string;
}

interface RlmExecResult {
	success: boolean;
	output?: string;
	error?: string;
}

function ensureBundledAgentsInstalled(): string[] {
	const installed: string[] = [];
	if (!existsSync(BUNDLED_AGENTS_DIR)) return installed;

	const userAgentsDir = join(getAgentDir(), "agents");
	mkdirSync(userAgentsDir, { recursive: true });

	for (const file of readdirSync(BUNDLED_AGENTS_DIR)) {
		if (!file.endsWith(".md")) continue;
		const source = join(BUNDLED_AGENTS_DIR, file);
		const dest = join(userAgentsDir, file);
		const sourceContent = readFileSync(source, "utf-8");
		const destContent = existsSync(dest) ? readFileSync(dest, "utf-8") : null;
		if (destContent !== sourceContent) {
			copyFileSync(source, dest);
			installed.push(file);
		}
	}

	return installed;
}

function listBundledAgents(): string[] {
	if (!existsSync(BUNDLED_AGENTS_DIR)) return [];
	return readdirSync(BUNDLED_AGENTS_DIR).filter((file) => file.endsWith(".md"));
}

async function initRlmSession(contextPath: string, cwd: string): Promise<RlmInitResult> {
	const absoluteContextPath = resolve(cwd, contextPath);
	if (!existsSync(absoluteContextPath)) {
		return { success: false, error: `Context file not found: ${contextPath}` };
	}
	if (!existsSync(REPL_SCRIPT_PATH)) {
		return { success: false, error: `RLM REPL script not found: ${REPL_SCRIPT_PATH}` };
	}

	return new Promise((resolvePromise) => {
		const proc = spawn("python3", [REPL_SCRIPT_PATH, "init", absoluteContextPath], {
			cwd,
			env: { ...process.env, RLM_STATE_DIR: join(cwd, ".pi", "rlm_state") },
		});

		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (data) => {
			stdout += String(data);
		});
		proc.stderr.on("data", (data) => {
			stderr += String(data);
		});
		proc.on("close", (code) => {
			if (code !== 0) {
				resolvePromise({ success: false, error: stderr || `Process exited with code ${code}` });
				return;
			}
			const match = stdout.match(/Session path:\s*(.+)/);
			resolvePromise(match ? { success: true, statePath: match[1].trim() } : { success: false, error: "Could not parse state path from output" });
		});
	});
}

async function execRlmCode(statePath: string, code: string, cwd: string): Promise<RlmExecResult> {
	if (!existsSync(REPL_SCRIPT_PATH)) {
		return { success: false, error: `RLM REPL script not found: ${REPL_SCRIPT_PATH}` };
	}

	return new Promise((resolvePromise) => {
		const proc = spawn("python3", [REPL_SCRIPT_PATH, "--state", statePath, "exec", "-c", code], {
			cwd,
		});

		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (data) => {
			stdout += String(data);
		});
		proc.stderr.on("data", (data) => {
			stderr += String(data);
		});
		proc.on("close", (code) => {
			if (code !== 0 && stderr) {
				resolvePromise({ success: false, error: stderr, output: stdout });
			} else {
				resolvePromise({ success: true, output: stdout, error: stderr || undefined });
			}
		});
	});
}

export default function registerRlmExtension(pi: ExtensionAPI) {
	registerRlmTools(pi);

	pi.registerTool({
		name: "rlm_init",
		label: "RLM Init",
		description: "Initialize a new RLM session for a large file and return the state path.",
		parameters: Type.Object({
			context_path: Type.String({ description: "Path to the large file to load into the RLM REPL" }),
		}),
		async execute(
			_toolCallId: string,
			params: { context_path: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback<{ statePath: string } | { error: true }> | undefined,
			ctx: ExtensionContext,
		) {
			const result = await initRlmSession(params.context_path, ctx.cwd);
			if (!result.success) {
				return {
					content: [{ type: "text", text: `Failed to initialize RLM session: ${result.error}` }],
					details: { error: true as const },
				};
			}
			return {
				content: [{ type: "text", text: `RLM session initialized.\nState path: ${result.statePath}` }],
				details: { statePath: result.statePath },
			};
		},
	});

	pi.registerTool({
		name: "rlm_exec",
		label: "RLM Exec",
		description: "Execute Python code inside an existing RLM REPL session.",
		parameters: Type.Object({
			state_path: Type.String({ description: "Path to the RLM state file (.pkl)" }),
			code: Type.String({ description: "Python code to execute in the session" }),
		}),
		async execute(
			_toolCallId: string,
			params: { state_path: string; code: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback<{ error: boolean; stderr?: string; output?: string }> | undefined,
			ctx: ExtensionContext,
		) {
			const result = await execRlmCode(params.state_path, params.code, ctx.cwd);
			if (!result.success) {
				return {
					content: [{ type: "text", text: `Execution error: ${result.error}\n\nOutput:\n${result.output || "(none)"}` }],
					details: { error: true, output: result.output },
				};
			}
			return {
				content: [{ type: "text", text: result.output || "(no output)" }],
				details: { error: Boolean(result.error), stderr: result.error },
			};
		},
	});

	pi.registerCommand("rlm", {
		description: "Initialize and use RLM (Recursive Language Model) for large files",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const subcommand = parts[0] || "help";

			switch (subcommand) {
				case "init": {
					if (parts.length < 2) {
						ctx.ui.notify("Usage: /rlm init <path/to/file>", "warning");
						return;
					}
					const result = await initRlmSession(parts[1], ctx.cwd);
					ctx.ui.notify(result.success ? `RLM session initialized: ${result.statePath}` : `Failed: ${result.error}`, result.success ? "info" : "error");
					break;
				}
				case "agents": {
					const installed = ensureBundledAgentsInstalled();
					const bundled = listBundledAgents();
					ctx.ui.notify(
						installed.length > 0
							? `Bundled agents installed/updated: ${installed.join(", ")}\nAvailable bundled agents: ${bundled.join(", ")}`
							: `Available bundled agents: ${bundled.join(", ")}`,
						"info",
					);
					break;
				}
				case "help":
				default: {
					ctx.ui.notify(
						[
							"RLM (Recursive Language Model)",
							"",
							"/rlm init <file>   Initialize an RLM session for a large file",
							"/rlm agents        Install/list bundled rlm-subcall + rlm-autonomous agents",
							"/skill:rlm         Open the bundled RLM skill",
						].join("\n"),
						"info",
					);
				}
			}
		},
	});

	pi.on("session_start", async () => {
		ensureBundledAgentsInstalled();
	});
}
