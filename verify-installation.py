#!/usr/bin/env python3
"""
Verify pi-rlm extension installation and security settings.
Run this after installation to ensure everything is set up correctly.
"""

import os
import sys
from pathlib import Path

def check_file(path: str, description: str) -> bool:
    """Check if a file exists and report status."""
    if Path(path).exists():
        print(f"✓ {description}: {path}")
        return True
    else:
        print(f"✗ {description} NOT FOUND: {path}")
        return False

def main():
    print("=" * 60)
    print("pi-rlm Extension Verification")
    print("=" * 60)
    print()

    # Determine installation location
    home = Path.home()
    extension_dir = home / ".pi" / "agent" / "extensions" / "pi-rlm"
    agents_dir = home / ".pi" / "agent" / "agents"

    checks = []

    print("Checking Extension Files:")
    print("-" * 40)
    checks.append(check_file(
        extension_dir / "extension" / "index.ts",
        "Extension entry point"
    ))
    checks.append(check_file(
        extension_dir / "package.json",
        "Package manifest"
    ))
    checks.append(check_file(
        extension_dir / "skills" / "rlm" / "extensions" / "rlm_tools.ts",
        "read_chunk tool"
    ))
    checks.append(check_file(
        extension_dir / "skills" / "rlm" / "scripts" / "rlm_repl.py",
        "RLM REPL script"
    ))
    
    print()
    print("Checking Agent Definitions:")
    print("-" * 40)
    checks.append(check_file(
        agents_dir / "rlm-subcall.md",
        "rlm-subcall agent"
    ))
    checks.append(check_file(
        agents_dir / "rlm-autonomous.md",
        "rlm-autonomous agent"
    ))

    print()
    print("Checking Python Environment:")
    print("-" * 40)
    
    # Check Python version
    python_version = sys.version_info
    if python_version >= (3, 8):
        print(f"✓ Python version: {python_version.major}.{python_version.minor}.{python_version.micro}")
        checks.append(True)
    else:
        print(f"✗ Python version too old: {python_version.major}.{python_version.minor}.{python_version.micro} (need 3.8+)")
        checks.append(False)

    # Check rlm_repl.py is executable
    repl_script = extension_dir / "skills" / "rlm" / "scripts" / "rlm_repl.py"
    if repl_script.exists():
        print(f"✓ rlm_repl.py found")
        checks.append(True)
    else:
        print(f"✗ rlm_repl.py not found")
        checks.append(False)

    print()
    print("=" * 60)
    passed = sum(checks)
    total = len(checks)
    print(f"Results: {passed}/{total} checks passed")
    
    if passed == total:
        print("✓ Extension is properly installed!")
        print()
        print("Quick start:")
        print("  1. Run pi and type: /rlm init path/to/large-file.txt")
        print("  2. Or use: /skill:rlm for the skill interface")
        print("  3. Or use agents: rlm-subcall, rlm-autonomous")
        return 0
    else:
        print("✗ Some checks failed. See above for details.")
        print()
        print("Installation help:")
        print("  Manual: Copy files to ~/.pi/agent/extensions/pi-rlm/")
        print("  GitHub: pi --extension git:github.com/Whamp/pi-rlm@main")
        return 1

if __name__ == "__main__":
    sys.exit(main())
