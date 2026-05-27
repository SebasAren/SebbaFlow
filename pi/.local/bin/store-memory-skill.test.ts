/**
 * store-memory SKILL.md validation tests
 *
 * Validates that the SKILL.md file exists, has proper YAML frontmatter,
 * and contains the required sections for agent instruction.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL_PATH = join(
	import.meta.dir,
	"..",
	"..",
	".pi",
	"agent",
	"skills",
	"store-memory",
	"SKILL.md",
);

describe("store-memory SKILL.md", () => {
	test("SKILL.md exists at the expected path", () => {
		expect(existsSync(SKILL_PATH)).toBe(true);
	});

	test("SKILL.md has valid YAML frontmatter with name field", () => {
		const content = readFileSync(SKILL_PATH, "utf8");
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		expect(match).not.toBeNull();

		const frontmatter = match![1];
		expect(frontmatter).toContain("name: store-memory");
	});

	test("SKILL.md frontmatter has description field", () => {
		const content = readFileSync(SKILL_PATH, "utf8");
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		expect(match).not.toBeNull();

		const frontmatter = match![1];
		expect(frontmatter).toMatch(/description:/);
	});

	test("SKILL.md contains a Trigger section explaining when to store", () => {
		const content = readFileSync(SKILL_PATH, "utf8");
		expect(content).toMatch(/##\s+Trigger/i);
	});

	test("SKILL.md contains a Format section explaining file format", () => {
		const content = readFileSync(SKILL_PATH, "utf8");
		expect(content).toMatch(/##\s+Format/i);
	});

	test("SKILL.md contains content boundary rules (what goes in wiki vs .claude/rules/)", () => {
		const content = readFileSync(SKILL_PATH, "utf8");
		// Should mention the boundary: conceptual knowledge → wiki, code patterns → .claude/rules/
		const hasBoundary =
			content.match(/boundar/i) ||
			content.match(/conceptual/i) ||
			content.match(/\.claude\/rules/) ||
			content.match(/code pattern/i);
		expect(hasBoundary).not.toBeNull();
	});
});
