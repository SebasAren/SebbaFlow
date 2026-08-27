---
description: mise tool management — github backend, multi-binary repos, tool_alias
globs: ["mise/.config/mise/*.toml"]
---

- Installing two binaries from one GitHub repo (e.g. OpenShell CLI + gateway): `matching` alone is **not** part of the install path — the same backend string twice resolves to the same directory and the second install overwrites the first. Use `[tool_alias]` to give each binary its own tool name + install dir, with per-tool `matching` for asset selection.
- Use the `github:` backend (`github:owner/repo`), not `ubi:` — ubi is deprecated, removal scheduled for mise 2027.1.
- Asset autodetection prefers glibc over musl on glibc hosts, so a repo shipping both CLI (musl) and daemon (gnu) tarballs picks the wrong one — pin `matching` to the full asset stem.
