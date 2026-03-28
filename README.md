# pi-rlm

An RLM (Recursive Language Model) extension for [pi](https://github.com/mariozechner/pi-coding-agent), enabling processing of extremely large context files that exceed typical LLM context windows.

Based on the RLM pattern from [arXiv:2512.24601](https://arxiv.org/abs/2512.24601).

Originally a fork of this claude code minimal implementation [claude_code_RLM](https://github.com/brainqub3/claude_code_RLM)

## Prerequisites

- Python 3.8+
- pi coding agent (`npm install -g @mariozechner/pi-coding-agent`)

## Installation

### Option 1: Install via GitHub URL (Recommended)

```bash
pi install git:github.com/adnichols/pi-rlm
```

For a one-off run without permanently installing:

```bash
pi -e git:github.com/adnichols/pi-rlm
```

### Option 2: Manual Installation

```bash
# Clone the repo
git clone https://github.com/adnichols/pi-rlm.git

# Create extension directory
mkdir -p ~/.pi/agent/extensions/pi-rlm

# Copy extension files
cp -r pi-rlm/extension/* ~/.pi/agent/extensions/pi-rlm/
cp -r pi-rlm/skills ~/.pi/agent/extensions/pi-rlm/
cp -r pi-rlm/agents ~/.pi/agent/extensions/pi-rlm/

# Copy agents
mkdir -p ~/.pi/agent/agents
cp pi-rlm/agents/*.md ~/.pi/agent/agents/

# Reload resources from inside pi
# /reload
```

On first load, the extension automatically installs/updates its bundled `rlm-subcall.md` and `rlm-autonomous.md` agent definitions into `~/.pi/agent/agents/` so the subagent workflow works after package installation.

### Option 3: Development (Symlink)

```bash
# Clone the repo
git clone https://github.com/adnichols/pi-rlm.git ~/projects/pi-rlm

# Symlink the extension
mkdir -p ~/.pi/agent/extensions
ln -s ~/projects/pi-rlm ~/.pi/agent/extensions/pi-rlm

# Symlink the agents
ln -s ~/projects/pi-rlm/agents/rlm-subcall.md ~/.pi/agent/agents/
ln -s ~/projects/pi-rlm/agents/rlm-autonomous.md ~/.pi/agent/agents/
```

## What is RLM?

The Recursive Language Model pattern breaks down large documents into manageable chunks, processes each with a specialized sub-LLM, then synthesizes results. This allows you to analyze textbooks, massive documentation, log dumps, or any context too large to paste into chat.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Pi Main Session (Root LLM)                           │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
┌─────────────────────────┐                 ┌─────────────────────────────────┐
│   Agent-Driven Mode     │                 │      Autonomous Mode            │
│   (/skill:rlm)          │                 │      (rlm-autonomous)           │
│                         │                 │                                 │
│ • Agent drives REPL     │                 │ • Subagent drives REPL          │
│ • Sees each iteration   │                 │ • Runs complete loop internally │
│ • Can adapt approach    │                 │ • Returns only final answer     │
│ • Uses main context     │                 │ • Isolates main context         │
└───────────┬─────────────┘                 └───────────────┬─────────────────┘
            │                                               │
            ▼                                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          rlm_repl.py (Persistent REPL)                      │
│  • Load large context  • Search/grep  • Chunk text  • Accumulate results   │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Sub-LLM Queries (llm_query / rlm-subcall)                │
│           • Semantic analysis  • ~500K char capacity  • Parallel batching  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Usage Modes

pi-rlm provides two modes for different context sizes:

### Agent-Driven Mode (Medium-Large Files)

For files where you want the main agent to steer the analysis:

```
/skill:rlm context=path/to/large-file.txt query="What patterns appear in this document?"
```

Or use the extension tools:

```json
{
  "tool": "rlm_init",
  "context_path": "path/to/large-file.txt"
}
```

Then:

```json
{
  "tool": "rlm_exec",
  "state_path": ".pi/rlm_state/file-20260122-093000/state.pkl",
  "code": "hits = grep('ERROR'); print(f'Found {count(hits)} errors')"
}
```

The main agent drives the REPL, sees intermediate results, and can adapt its approach. Best for files up to ~10MB where interactive exploration adds value.

### Autonomous Mode (Massive Files)

For very large files where you want complete context isolation:

```json
{
  "agent": "rlm-autonomous",
  "task": "File: /path/to/huge-log.txt\nQuery: Find all security errors and classify by severity"
}
```

The subagent handles the entire analysis loop internally. The main agent only sees the final answer. Best for files >10MB or when you need to analyze many large files in one session.

| Mode | Context Cost | Agent Control | Best For |
|------|--------------|---------------|----------|
| Agent-driven (`/skill:rlm`) | Proportional to iterations | Full steering | <10MB, interactive exploration |
| Autonomous (`rlm-autonomous`) | Fixed (~task + answer) | None during analysis | >10MB, batch processing |

## Extension Commands

After installation, the following commands are available:

| Command | Description |
|---------|-------------|
| `/rlm init <file>` | Initialize an RLM session with a large file |
| `/rlm status` | Show RLM status help |
| `/rlm agents` | List available subagents |
| `/rlm help` | Show RLM help |

## Extension Tools

The extension registers these tools:

| Tool | Purpose |
|------|---------|
| `read_chunk` | Read entire chunk files without truncation |
| `rlm_init` | Initialize an RLM session programmatically |
| `rlm_exec` | Execute Python code in an RLM session |

## How It Works

1. **Initialize**: Load the large context file into a persistent Python REPL
2. **Scout**: Preview the beginning and end of the document
3. **Chunk**: Split the content into manageable pieces (default: 200k chars)
4. **Extract**: Delegate each chunk to the `rlm-subcall` subagent for analysis
5. **Synthesize**: Combine findings into a final answer

### Session Structure

Each RLM session creates a timestamped directory:

```
.pi/rlm_state/
└── my-document-20260120-155234/
    ├── state.pkl           # Persistent REPL state
    └── chunks/
        ├── manifest.json   # Chunk metadata (positions, line numbers)
        ├── chunk_0000.txt
        ├── chunk_0001.txt
        └── ...
```

### REPL Helpers

The persistent REPL provides these functions:

| Function | Description |
|----------|-------------|
| `peek(start, end)` | View a slice of content |
| `grep(pattern, max_matches=20)` | Search with context window |
| `chunk_indices(size, overlap)` | Get chunk boundaries |
| `write_chunks(out_dir, size, overlap)` | Materialize chunks to disk |
| `add_buffer(text)` | Accumulate subagent results |
| `llm_query(prompt)` | Query a sub-LLM from within the REPL |
| `llm_query_batch(prompts, concurrency=5)` | Query multiple prompts in parallel |

## Configuration

### Sub-LLM Model

The default sub-LLM uses `google-antigravity/gemini-3-flash`. To change it, edit `agents/rlm-subcall.md`:

```yaml
model: anthropic/claude-sonnet-4-20250514  # or your preferred model
```

### Chunk Size

Adjust chunk size in your `/skill:rlm` invocation or when calling `write_chunks()`:

```python
write_chunks(chunks_dir, size=100000, overlap=5000)  # 100k chars with 5k overlap
```

## Security Considerations

⚠️ **Important Security Notes:**

This extension executes Python code and spawns subprocesses. Please review [SECURITY.md](./SECURITY.md) for full details.

**Key points:**

1. **Path Validation**: The `read_chunk` tool validates paths to prevent directory traversal attacks. Only paths within `.pi/rlm_state/` or the current working directory are allowed.

2. **Pickle Deserialization**: RLM uses Python pickle for state persistence. **Do not load state files from untrusted sources** - pickle can execute arbitrary code during deserialization.

3. **Code Execution**: The RLM REPL executes arbitrary Python code by design. This runs with your user permissions.

4. **Subagent Spawning**: The extension spawns separate `pi` processes for subagents. These run with the same permissions as the main pi process.

### Security Checklist

Before using this extension:

- [ ] Only install from trusted sources (official repo, verified forks)
- [ ] Do not share state files (`.pkl`) with untrusted parties
- [ ] Be cautious when processing files from external sources
- [ ] Review agent definitions before using them

## Development

### Running Tests

```bash
# Python tests for the REPL
cd skills/rlm/tests
pip install pytest
pytest experience/ -v
```

### Project Structure

```
pi-rlm/
├── extension/              # pi extension entry point
│   └── index.ts           # Main extension registration
├── skills/
│   └── rlm/
│       ├── SKILL.md       # Skill documentation
│       ├── extensions/
│       │   └── rlm_tools.ts   # read_chunk tool
│       ├── scripts/
│       │   └── rlm_repl.py    # Python REPL
│       ├── examples/
│       └── tests/
├── agents/
│   ├── rlm-subcall.md     # Subagent for chunk processing
│   └── rlm-autonomous.md  # Autonomous analysis agent
├── SECURITY.md            # Security documentation
├── package.json           # npm package manifest
└── README.md              # This file
```

### Extension Installation Paths

When installed as a pi extension, files are expected at:

```
~/.pi/agent/extensions/pi-rlm/
├── index.ts              # Extension entry point
├── package.json          # npm manifest
├── skills/
│   └── rlm/
│       ├── SKILL.md
│       ├── extensions/
│       │   └── rlm_tools.ts
│       └── scripts/
│           └── rlm_repl.py
└── agents/
    ├── rlm-subcall.md
    └── rlm-autonomous.md
```

## Development History

This extension was created and improved across multiple pi sessions:
- [Initial implementation](https://buildwithpi.ai/session?73eb4c3795064fe93b5c651dd931535a)
- [Handle system & manifest hints](https://buildwithpi.ai/session/#f74ebcfe6673e3a748c44de1565c0ecd)
- Raw sessions: `sessions/` directory

## License

MIT

## Contributing

Contributions welcome! Please ensure:

1. Security implications are considered for any changes
2. The extension remains compatible with pi's extension API
3. Documentation is updated for new features
4. Tests pass (`npm test` or `python3 -m pytest`)

## Support

- Open an issue on GitHub
- See [SECURITY.md](./SECURITY.md) for security-related issues
