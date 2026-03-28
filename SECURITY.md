# Security Review: pi-rlm Extension

**Date:** 2025-03-28  
**Scope:** RLM (Recursive Language Model) skill for pi-coding-agent  
**Components Reviewed:**
- `skills/rlm/extensions/rlm_tools.ts` - read_chunk tool
- `skills/rlm/scripts/rlm_repl.py` - Python REPL and chunking logic
- `agents/rlm-subcall.md` - Subagent definition
- `agents/rlm-autonomous.md` - Autonomous agent definition

---

## Summary

**Overall Risk Level: LOW-MEDIUM**

The pi-rlm extension introduces several security considerations typical of REPL-style tools that execute user code and spawn subprocesses. The primary risks are around path traversal, unsafe deserialization, and arbitrary code execution by design. Most risks are mitigated by the fact that this is a user-installed extension running in their own environment with their own permissions.

---

## Findings

### 1. Path Traversal in `read_chunk` Tool ⚠️ MEDIUM

**Location:** `skills/rlm/extensions/rlm_tools.ts`

**Issue:** The `read_chunk` tool resolves paths against `ctx.cwd` but does not validate that the resolved path stays within expected boundaries:

```typescript
const absolutePath = resolve(ctx.cwd, path);
// No validation that absolutePath is within allowed directories
```

**Risk:** A malicious or compromised LLM could read arbitrary files on the system by passing paths like `../../../../etc/passwd`.

**Mitigation:** The tool is only used by the `rlm-subcall` agent to read chunk files that the RLM system itself creates. However, the tool doesn't enforce this restriction.

**Recommendation:** 
- Add path validation to ensure the resolved path is within the expected chunks directory
- Consider adding an allowlist of permitted directories

---

### 2. Unsafe Pickle Deserialization ⚠️ MEDIUM

**Location:** `skills/rlm/scripts/rlm_repl.py` - `_load_state()` function

**Issue:** Python's `pickle` module is used for state serialization, which can execute arbitrary code during deserialization:

```python
def _load_state(state_path: Path) -> Dict[str, Any]:
    with state_path.open("rb") as f:
        state = pickle.load(f)  # Can execute arbitrary code
```

**Risk:** If an attacker can write to the state file location (`.pi/rlm_state/`), they can achieve code execution when the state is loaded.

**Mitigation:** The state directory is within the user's project/workspace. Requires existing write access to the filesystem.

**Recommendation:**
- Consider using JSON for state serialization (slower but safer)
- Or add integrity verification (HMAC) if pickle must be used
- Document that users should not load state files from untrusted sources

---

### 3. Arbitrary Code Execution via `exec()` ⚠️ LOW (By Design)

**Location:** `skills/rlm/scripts/rlm_repl.py` - `cmd_exec()` function

**Issue:** User-provided Python code is executed directly with `exec()`:

```python
exec(code, env, env)
```

**Risk:** This is a REPL by design - users can execute arbitrary Python code.

**Mitigation:** This is the intended functionality. The REPL runs with the user's own permissions.

**Recommendation:**
- Add clear documentation that this executes arbitrary code
- Consider adding a `--sandbox` mode warning

---

### 4. Subprocess Command Construction - LOW

**Location:** `skills/rlm/scripts/rlm_repl.py` - `_spawn_sub_agent()` and `_detect_codemap()`

**Issue:** Several subprocess calls split command strings:

```python
cmd = codemap_cmd.split() + ['-o', 'json', str(context_resolved)]
# ...
cmd = ["pi", "--mode", "json", "-p", "--no-session", "--model", model, ...]
```

**Risk:** While paths are resolved and not shell-interpolated, the codemap command from environment could theoretically be manipulated.

**Mitigation:** 
- Paths are properly resolved before use
- No shell interpolation (not using `shell=True`)
- Commands are hardcoded arrays or come from trusted environment

---

### 5. File System Operations Without Validation - LOW

**Location:** `skills/rlm/scripts/rlm_repl.py` - `write_chunks()`, `_smart_chunk_impl()`, etc.

**Issue:** Directories and files are created based on user input without boundary validation:

```python
out_path.mkdir(parents=True, exist_ok=True)
```

**Risk:** Could create files/directories in unexpected locations if paths are manipulated.

**Mitigation:** The user controls their own filesystem. This is normal behavior for development tools.

---

### 6. JSON Parsing Without Size Limits - LOW

**Location:** `skills/rlm/scripts/rlm_repl.py` - `_extract_symbol_boundaries()`

**Issue:** JSON from codemap subprocess is parsed without size validation:

```python
data = json.loads(codemap_output)
```

**Risk:** Large JSON could cause memory issues.

**Mitigation:** Data comes from trusted codemap subprocess with timeout.

---

## Recommendations Summary

### Immediate Actions (Before Release)

1. **Fix Path Traversal in `read_chunk`** - Add path boundary validation
2. **Document Pickle Security** - Add warning about state files from untrusted sources
3. **Add Security Section to README** - Document the REPL's code execution nature

### Future Hardening

4. **Consider JSON State** - Replace pickle with JSON for state serialization
5. **Add Integrity Checks** - If keeping pickle, add HMAC verification
6. **Sandbox Mode** - Consider a restricted Python execution environment option

---

## Security Model

This extension follows the pi security model:

- **User-installed**: Extensions run with user's full system permissions
- **Trust-based**: Users must trust the extension source (GitHub/npm)
- **Self-contained**: State is stored in `.pi/rlm_state/` within user's workspace
- **Transparent**: Open source, auditable code

---

## Acceptance Criteria

The following security measures should be in place before marking this extension as production-ready:

- [ ] Path validation added to `read_chunk` tool
- [ ] Security documentation added to README
- [ ] Pickle security warning documented
- [ ] Extension includes a `SECURITY.md` file

---

*Review completed by: AI Security Reviewer*  
*Extension version: Pre-release*
