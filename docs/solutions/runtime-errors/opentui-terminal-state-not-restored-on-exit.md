---
problem_type: runtime-errors
component: src/main.ts (App.quit method, @opentui/core renderer)
date_solved: 2026-02-01
symptoms:
  - Mouse tracking escape codes appear as garbage text after quitting (e.g., `35;72;16M35;71;17M...`)
  - Terminal unresponsive after TUI exits
  - Must run `reset` or open new terminal window
  - Cursor hidden after exit
tags:
  - opentui
  - terminal
  - tui
  - cleanup
  - exit
  - mouse-tracking
  - stdin
  - raw-mode
  - ansi
  - escape-sequences
---

# opentui Terminal State Not Restored on Exit

## Problem Summary

When exiting a TUI application built with `@opentui/core`, the terminal is left in a broken state with mouse tracking enabled and stdin in raw mode.

## Symptoms

- Mouse movement produces garbage text like `35;72;16M35;71;17M35;70;18M...`
- Terminal is unresponsive to normal input
- Cursor may be hidden
- User must run `reset` command or close terminal window

## Investigation Steps That Didn't Work

### Attempt 1: Basic ANSI reset codes

```typescript
await this.renderer.stop()
process.stdout.write("\x1b[?25h") // Show cursor
process.stdout.write("\x1b[0m")   // Reset colors
process.stdout.write("\x1bc")     // Reset terminal
```

**Result:** Mouse tracking still active, terminal still broken.

### Attempt 2: Using renderer.destroy() instead of stop()

```typescript
this.renderer.destroy()
```

**Result:** Still didn't restore terminal state properly.

### Attempt 3: Writing escape sequences before destroy()

```typescript
const cleanup = [
  "\x1b[?1003l", // Disable mouse tracking
  // ... other sequences
].join("")
process.stdout.write(cleanup)
await this.renderer.destroy()
```

**Result:** Escape sequences not flushed before process exit.

## Root Cause

The `@opentui/core` library's `destroy()` method does not reliably restore terminal state. Specifically:

1. **Mouse tracking modes left enabled** - opentui enables multiple mouse tracking modes (`?1003h`, `?1002h`, `?1000h`, `?1006h`) but doesn't disable them on exit
2. **stdin remains in raw mode** - Terminal input set to raw mode for keypress handling isn't restored to "cooked" (line-buffered) mode
3. **Race conditions** - Keypress events can fire during shutdown causing issues

## Working Solution

The fix requires manually taking control of terminal cleanup:

```typescript
private keypressHandler: ((event: { name: string }) => void) | null = null

private setupInput(): void {
  // Store handler reference for later removal
  this.keypressHandler = async (event: { name: string }) => {
    if (!this.running) return  // Guard against events during shutdown
    // ... handle keys
  }
  this.renderer.keyInput.on("keypress", this.keypressHandler)
}

private async quit(): Promise<void> {
  if (!this.running) return // Prevent double quit
  this.running = false

  // 1. Remove keypress handler first
  if (this.keypressHandler) {
    this.renderer.keyInput.off("keypress", this.keypressHandler)
    this.keypressHandler = null
  }

  // 2. Stop background processes
  this.poller.stop()
  this.logWatcher.stop()

  // 3. Manually restore terminal state BEFORE destroy
  const cleanup = [
    "\x1b[?1003l", // Disable all mouse tracking
    "\x1b[?1002l", // Disable cell motion mouse tracking
    "\x1b[?1000l", // Disable mouse click tracking
    "\x1b[?1006l", // Disable SGR mouse mode
    "\x1b[?1004l", // Disable focus reporting
    "\x1b[?2004l", // Disable bracketed paste
    "\x1b[?1049l", // Exit alternate screen buffer
    "\x1b[?25h",   // Show cursor
    "\x1b[0m",     // Reset colors/styles
  ].join("")
  process.stdout.write(cleanup)

  // 4. Restore stdin to cooked mode
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false)
  }
  process.stdin.pause()

  // 5. Call destroy (wrapped in try/catch)
  try {
    this.renderer.destroy()
  } catch {
    // Ignore errors - we already cleaned up manually
  }

  process.exit(0)
}
```

### Key Points

1. **Remove event listeners first** - Prevents race conditions
2. **Write escape codes BEFORE `destroy()`** - Ensures cleanup happens even if library fails
3. **Disable ALL mouse tracking modes** - Must disable `1003`, `1002`, `1000`, `1006`
4. **Restore stdin with `setRawMode(false)`** - Critical for normal terminal input
5. **Guard against double-quit** - Prevents issues if quit called multiple times

## ANSI Escape Code Reference

| Code | Description |
|------|-------------|
| `\x1b[?1003l` | Disable all-events mouse tracking |
| `\x1b[?1002l` | Disable cell motion mouse tracking |
| `\x1b[?1000l` | Disable basic mouse click tracking |
| `\x1b[?1006l` | Disable SGR extended mouse mode |
| `\x1b[?1004l` | Disable focus reporting |
| `\x1b[?2004l` | Disable bracketed paste mode |
| `\x1b[?1049l` | Exit alternate screen buffer |
| `\x1b[?25h` | Show cursor |
| `\x1b[0m` | Reset all text attributes |

Note: `l` suffix disables the mode, `h` suffix enables it.

## Prevention Strategies

### 1. Never rely solely on library cleanup

Always implement manual terminal restoration as a fallback.

### 2. Use defense-in-depth pattern

```typescript
// Create reusable cleanup module
export function restoreTerminal(): void {
  const sequences = [
    "\x1b[?1003l", "\x1b[?1002l", "\x1b[?1000l", "\x1b[?1006l",
    "\x1b[?1004l", "\x1b[?2004l", "\x1b[?1049l", "\x1b[?25h", "\x1b[0m",
  ]
  process.stdout.write(sequences.join(""))
}

export function restoreStdin(): void {
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false)
  }
  process.stdin.pause()
}
```

### 3. Register signal handlers

```typescript
process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)
process.on("uncaughtException", (error) => {
  cleanup()
  console.error(error)
  process.exit(1)
})
```

### 4. Initialization best practice

```typescript
const renderer = await createCliRenderer({
  targetFps: 30,
  exitOnCtrlC: false  // Handle exit manually
})
```

## Checklist for New opentui Projects

- [ ] Set `exitOnCtrlC: false` in createCliRenderer
- [ ] Store event handler references for later removal
- [ ] Implement manual terminal cleanup (escape sequences)
- [ ] Implement stdin restoration (`setRawMode`, `pause`)
- [ ] Guard against double cleanup
- [ ] Register signal handlers (SIGINT, SIGTERM)
- [ ] Wrap `renderer.destroy()` in try/catch
- [ ] Call manual cleanup BEFORE `renderer.destroy()`

## Related Files

- Implementation: `src/main.ts` (lines 369-411)
- Documentation: `CLAUDE.md` (Terminal Cleanup on Exit section)

## Commits

- `360052c` - Initial fix attempt (incomplete)
- `fb42e64` - Working fix with manual stdin cleanup
- `692a695` - Documentation update
