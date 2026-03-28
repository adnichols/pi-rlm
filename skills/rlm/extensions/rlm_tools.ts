import type { TextContent } from "@mariozechner/pi-ai";
import type { AgentToolUpdateCallback, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const readChunkSchema = Type.Object({
	path: Type.String({ description: "Absolute or cwd-relative path to the assigned RLM chunk file" }),
});

function isAllowedPath(absolutePath: string, cwd: string): boolean {
	const normalizedPath = resolve(absolutePath);
	const normalizedCwd = resolve(cwd);
	const rlmStateDir = resolve(normalizedCwd, ".pi", "rlm_state");

	return (
		normalizedPath === normalizedCwd ||
		normalizedPath.startsWith(`${normalizedCwd}/`) ||
		normalizedPath === rlmStateDir ||
		normalizedPath.startsWith(`${rlmStateDir}/`)
	);
}

export default function registerRlmTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "read_chunk",
		label: "read_chunk",
		description:
			"Read the entire content of an assigned RLM chunk file without truncation. Only for chunk files inside the current project or .pi/rlm_state.",
		parameters: readChunkSchema,
		async execute(
			_toolCallId: string,
			params: { path: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback<{ bytes: number; path: string } | { error: true; reason?: string; path?: string }> | undefined,
			ctx: ExtensionContext,
		) {
			const absolutePath = resolve(ctx.cwd, params.path);

			if (!isAllowedPath(absolutePath, ctx.cwd)) {
				return {
					content: [
						{
							type: "text",
							text: `Error: path \"${params.path}\" is outside allowed directories (.pi/rlm_state or current working directory).`,
						},
					] as TextContent[],
					details: { error: true as const, reason: "path_not_allowed" },
				};
			}

			try {
				await access(absolutePath, constants.R_OK);
				const content = await readFile(absolutePath, "utf-8");
				return {
					content: [{ type: "text", text: content }] as TextContent[],
					details: { bytes: content.length, path: absolutePath },
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `Error reading chunk file: ${error.message}` }] as TextContent[],
					details: { error: true as const, path: absolutePath },
				};
			}
		},
	});
}
