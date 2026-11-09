#!/usr/bin/env python3
"""MCP tool test suite for video-vision-mcp.

Runs against the MCP-over-HTTP endpoint at http://<server>:3000/mcp.
Tests all 8 tools plus the MCP handshake itself.

Usage:
    python3 test_mcp_tools.py            # full suite
    python3 test_mcp_tools.py --fast     # skip heavy tools (analyze_video, transcribe_audio)
    python3 test_mcp_tools.py --timeout 120   # set per-tool timeout in seconds
"""

import json
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Optional

MCP_URL = "http://mcp-server:3000/mcp"
PROTOCOL_VERSION = "2025-03-26"

# Short public-domain test video (Creative Commons, ~10s clip)
TEST_VIDEO_SHORT = "https://www.youtube.com/watch?v=jNQXAC9IVRw"  # Me at the zoo (19s)
# Another short video with captions
TEST_VIDEO_CAPTIONED = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


@dataclass
class TestResult:
    name: str
    passed: bool
    duration_s: float = 0.0
    detail: str = ""
    error: str = ""


@dataclass
class TestSession:
    session_id: Optional[str] = None
    request_id: int = field(default=0)
    results: list[TestResult] = field(default_factory=list)

    def next_id(self) -> int:
        self.request_id += 1
        return self.request_id

    def record(self, name: str, passed: bool, start: float, detail: str = "", error: str = ""):
        dur = time.time() - start
        r = TestResult(name=name, passed=passed, duration_s=dur, detail=detail, error=error)
        self.results.append(r)
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {name} ({dur:.1f}s) {detail}" + (f" — {error}" if error else ""))


def mcp_request(session: TestSession, method: str, params: dict, timeout: int = 30) -> dict:
    """Send a JSON-RPC request to the MCP endpoint. Handles both JSON and SSE responses."""
    req_id = session.next_id()
    body = json.dumps({
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
        "params": params,
    }).encode()

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session.session_id:
        headers["mcp-session-id"] = session.session_id
        headers["mcp-protocol-version"] = PROTOCOL_VERSION

    req = urllib.request.Request(MCP_URL, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            # Capture session ID from response header
            sid = resp.headers.get("mcp-session-id")
            if sid:
                session.session_id = sid

            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8")

            if "text/event-stream" in content_type:
                return _parse_sse(raw)
            return json.loads(raw)

    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {raw[:500]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection error: {e.reason}")
    except TimeoutError:
        raise RuntimeError(f"Request timed out after {timeout}s")


def _parse_sse(raw: str) -> dict:
    """Parse SSE response into a JSON-RPC result dict."""
    result = None
    for line in raw.splitlines():
        if line.startswith("data:"):
            data = line[5:].strip()
            if data:
                try:
                    result = json.loads(data)
                except json.JSONDecodeError:
                    pass
    if result is None:
        raise RuntimeError(f"No valid SSE data found in response: {raw[:200]}")
    return result


def test_handshake(session: TestSession, timeout: int = 30):
    """Test MCP initialize + tools/list handshake."""
    print("\n=== MCP Handshake ===")

    # Initialize
    start = time.time()
    try:
        resp = mcp_request(session, "initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "mcp-test-suite", "version": "1.0.0"},
        }, timeout=timeout)

        result = resp.get("result", {})
        server_info = result.get("serverInfo", {})
        session.record(
            "initialize",
            True,
            start,
            f"server={server_info.get('name', '?')} v{server_info.get('version', '?')}",
        )
    except Exception as e:
        session.record("initialize", False, start, error=str(e))
        return False

    # Verify session ID was set
    if not session.session_id:
        session.record("session_id", False, time.time(), error="No mcp-session-id header in response")
        return False
    session.record("session_id", True, time.time(), f"id={session.session_id[:16]}...")

    # Tools list
    start = time.time()
    try:
        resp = mcp_request(session, "tools/list", {}, timeout=timeout)
        tools = resp.get("result", {}).get("tools", [])
        tool_names = [t["name"] for t in tools]

        expected = [
            "analyze_video", "extract_frames", "get_video_info",
            "get_transcript", "transcribe_audio", "extract_frame_at",
            "create_frame_grid", "cleanup",
        ]
        missing = [t for t in expected if t not in tool_names]
        if missing:
            session.record("tools/list", False, start, error=f"Missing tools: {missing}")
        else:
            session.record("tools/list", True, start, f"{len(tool_names)} tools: {', '.join(tool_names)}")
    except Exception as e:
        session.record("tools/list", False, start, error=str(e))

    return len(session.results) > 0 and all(r.passed for r in session.results)


def call_tool(session: TestSession, tool_name: str, arguments: dict, timeout: int = 30,
              silent: bool = False) -> Optional[dict]:
    """Call a tool and return its result. Records the test result unless silent=True."""
    start = time.time()
    try:
        resp = mcp_request(session, "tools/call", {
            "name": tool_name,
            "arguments": arguments,
        }, timeout=timeout)

        if "error" in resp:
            err = resp["error"]
            if not silent:
                session.record(tool_name, False, start, error=f"JSON-RPC error: {err.get('message', err)}")
            return None

        result = resp.get("result", {})
        content = result.get("content", [])

        # Check for tool-level errors in content
        for c in content:
            if c.get("type") == "text":
                text = c.get("text", "")
                if text.startswith("Error") and ("Error:" in text or "Error " in text):
                    if not silent:
                        session.record(tool_name, False, start, error=text[:200])
                    return None
                break  # only check first text block

        if not silent:
            types = [c.get("type", "?") for c in content]
            session.record(tool_name, True, start, f"content types: {types}")
        return result

    except Exception as e:
        if not silent:
            session.record(tool_name, False, start, error=str(e))
        return None


def test_get_video_info(session: TestSession, timeout: int = 30):
    """Test get_video_info — lightest tool, no download."""
    print("\n=== get_video_info ===")
    result = call_tool(session, "get_video_info", {
        "source": TEST_VIDEO_SHORT,
    }, timeout=timeout)

    if result:
        content = result.get("content", [])
        text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
        try:
            info = json.loads(text)
            dur = info.get("duration", "?")
            res = info.get("width", "?")
            h = info.get("height", "?")
            print(f"    → duration={dur}s, resolution={res}x{h}")
        except (json.JSONDecodeError, KeyError):
            pass


def test_get_transcript(session: TestSession, timeout: int = 30):
    """Test get_transcript — fetches existing captions (fast if available)."""
    print("\n=== get_transcript ===")
    result = call_tool(session, "get_transcript", {
        "source": TEST_VIDEO_SHORT,
        "format": "plain",
    }, timeout=timeout)

    if result:
        content = result.get("content", [])
        text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
        words = len(text.split()) if text else 0
        print(f"    → {words} words of transcript")


def test_extract_frame_at(session: TestSession, timeout: int = 60):
    """Test extract_frame_at — extract a single frame at a timestamp."""
    print("\n=== extract_frame_at ===")
    result = call_tool(session, "extract_frame_at", {
        "source": TEST_VIDEO_SHORT,
        "timestamp": "00:00:05",
    }, timeout=timeout)

    if result:
        content = result.get("content", [])
        img = [c for c in content if c.get("type") == "image"]
        text = [c for c in content if c.get("type") == "text"]
        if img:
            size = len(img[0].get("data", ""))
            print(f"    → image returned, ~{size // 1024}KB base64")
        for t in text:
            print(f"    → {t.get('text', '')[:100]}")


def test_extract_frames(session: TestSession, timeout: int = 90):
    """Test extract_frames — extract multiple frames (overview mode)."""
    print("\n=== extract_frames ===")
    result = call_tool(session, "extract_frames", {
        "source": TEST_VIDEO_SHORT,
        "mode": "overview",
        "max_frames": 3,
    }, timeout=timeout)

    if result:
        content = result.get("content", [])
        text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
        # Count frames mentioned
        frame_refs = text.count(".png") + text.count(".jpg") + text.count(".jpeg")
        print(f"    → {frame_refs} frame references in response")


def test_create_frame_grid(session: TestSession, timeout: int = 60):
    """Test create_frame_grid — compose a grid from extracted frames.
    Uses frame paths from a prior extract_frames call."""
    print("\n=== create_frame_grid ===")

    # First extract some frames to get paths (silent — not a separate test)
    extract_result = call_tool(session, "extract_frames", {
        "source": TEST_VIDEO_SHORT,
        "mode": "overview",
        "max_frames": 3,
    }, timeout=timeout, silent=True)

    if not extract_result:
        return

    content = extract_result.get("content", [])
    text = "".join(c.get("text", "") for c in content if c.get("type") == "text")

    # Try to parse frame paths from the response
    import re
    frame_paths = re.findall(r'(/[\w/._-]+\.(?:png|jpg|jpeg))', text)
    if not frame_paths:
        # Try relative paths
        frame_paths = re.findall(r'([\w/._-]+\.(?:png|jpg|jpeg))', text)

    if not frame_paths:
        session.record("create_frame_grid", False, time.time(),
                       error="Could not extract frame paths from extract_frames response")
        print(f"    → Could not find frame paths. Response: {text[:200]}")
        return

    print(f"    → Using {len(frame_paths)} frames: {frame_paths[:3]}...")
    grid_result = call_tool(session, "create_frame_grid", {
        "frame_paths": frame_paths[:4],
        "columns": 2,
    }, timeout=timeout)

    if grid_result:
        gcontent = grid_result.get("content", [])
        img = [c for c in gcontent if c.get("type") == "image"]
        if img:
            size = len(img[0].get("data", ""))
            print(f"    → grid image returned, ~{size // 1024}KB base64")


def test_transcribe_audio(session: TestSession, timeout: int = 120):
    """Test transcribe_audio — Whisper transcription (heavier)."""
    print("\n=== transcribe_audio ===")
    result = call_tool(session, "transcribe_audio", {
        "source": TEST_VIDEO_SHORT,
        "format": "plain",
    }, timeout=timeout)

    if result:
        content = result.get("content", [])
        text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
        words = len(text.split()) if text else 0
        print(f"    → {words} words transcribed")
        if text:
            print(f"    → preview: {text[:150]}...")


def test_analyze_video(session: TestSession, timeout: int = 180):
    """Test analyze_video — full end-to-end (heaviest tool)."""
    print("\n=== analyze_video ===")
    result = call_tool(session, "analyze_video", {
        "source": TEST_VIDEO_SHORT,
        "query": "Describe what happens in this video.",
        "mode": "overview",
    }, timeout=timeout)

    if result:
        content = result.get("content", [])
        types = [c.get("type", "?") for c in content]
        text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
        imgs = [c for c in content if c.get("type") == "image"]
        print(f"    → content types: {types}, {len(imgs)} images")
        if text:
            print(f"    → text preview: {text[:150]}...")


def test_cleanup(session: TestSession, timeout: int = 30):
    """Test cleanup — clean up session temp files."""
    print("\n=== cleanup ===")
    result = call_tool(session, "cleanup", {
        "scope": "session",
    }, timeout=timeout)

    if result:
        content = result.get("content", [])
        text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
        print(f"    → {text[:150]}")


def print_report(session: TestSession, total_start: float):
    """Print the final test report."""
    total_time = time.time() - total_start
    passed = sum(1 for r in session.results if r.passed)
    failed = sum(1 for r in session.results if not r.passed)
    total = len(session.results)

    print("\n" + "=" * 70)
    print("  VIDEO-VISION MCP TOOL TEST REPORT")
    print("=" * 70)
    print(f"  Endpoint:  {MCP_URL}")
    print(f"  Session:   {session.session_id or 'N/A'}")
    print(f"  Total time: {total_time:.1f}s")
    print(f"  Results:   {passed}/{total} passed, {failed} failed")
    print("=" * 70)
    print()

    # Group by status
    print(f"  {'STATUS':<6} {'TOOL':<25} {'TIME':<8} {'DETAIL'}")
    print(f"  {'-'*6} {'-'*25} {'-'*8} {'-'*40}")

    for r in session.results:
        status = "PASS" if r.passed else "FAIL"
        detail = r.detail[:50] if r.detail else r.error[:50]
        print(f"  {status:<6} {r.name:<25} {r.duration_s:<8.1f} {detail}")

    print()

    if failed > 0:
        print("  FAILED TESTS:")
        print("  " + "-" * 60)
        for r in session.results:
            if not r.passed:
                print(f"  ✗ {r.name}")
                print(f"    Error: {r.error}")
                if r.detail:
                    print(f"    Detail: {r.detail}")
                print()

    print("=" * 70)

    # Exit code reflects overall result
    return failed == 0


def main():
    fast = "--fast" in sys.argv
    timeout = 30

    if "--timeout" in sys.argv:
        idx = sys.argv.index("--timeout")
        try:
            timeout = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            print("Invalid --timeout value")
            sys.exit(1)

    print("Video-Vision MCP Tool Test Suite")
    print(f"Mode: {'FAST (skip analyze_video, transcribe_audio)' if fast else 'FULL'}")
    print(f"Timeout: {timeout}s per tool")
    print(f"Test video: {TEST_VIDEO_SHORT}")
    print()

    session = TestSession()
    total_start = time.time()

    # 1. Handshake
    if not test_handshake(session, timeout):
        print("\nFATAL: MCP handshake failed. Cannot continue.")
        print_report(session, total_start)
        sys.exit(1)

    # 2. Light tools (always run)
    test_get_video_info(session, timeout)
    test_get_transcript(session, timeout)
    test_extract_frame_at(session, max(timeout, 60))
    test_extract_frames(session, max(timeout, 90))
    test_create_frame_grid(session, max(timeout, 60))

    # 3. Heavy tools (skip in fast mode)
    if not fast:
        test_transcribe_audio(session, max(timeout, 120))
        test_analyze_video(session, max(timeout, 180))

    # 4. Cleanup (always run last)
    test_cleanup(session, timeout)

    # 5. Report
    success = print_report(session, total_start)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
