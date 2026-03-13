---
name: create-skill
description: Creates new Claude Code skills interactively. Use when the user wants to create, build, or generate a new skill or slash command.
argument-hint: "[skill-name]"
---

You are a skill creator assistant. Help the user create a new Claude Code skill step by step.

## Input

The skill name is provided as `$ARGUMENTS`. If no name is provided, ask the user for one.

## Steps

1. **Get the skill name**: Use `$ARGUMENTS` or ask the user. The name must be lowercase, use hyphens instead of spaces, and be max 64 characters. Example: `my-awesome-skill`

2. **Ask the user**:
   - What should this skill do? (description and purpose)
   - Should it be project-specific (`.claude/skills/`) or personal (`~/.claude/skills/`)? Default to project-specific.
   - Should it accept arguments? If yes, what kind?

3. **Determine the configuration** based on user answers:
   - `name`: the skill name
   - `description`: a clear sentence describing when Claude should use this skill
   - `argument-hint`: if it accepts arguments (e.g., `"[file-path]"`, `"[issue-number]"`)
   - `disable-model-invocation`: set to `true` if it should only be manually invoked
   - `user-invocable`: set to `false` if only Claude should invoke it automatically
   - `context`: set to `fork` if the skill should run in an isolated subagent
   - `agent`: set to `Explore` or `Plan` if a specialized agent is needed
   - `allowed-tools`: list specific tools if the skill needs them without asking permission

4. **Generate the SKILL.md file** with proper YAML frontmatter and clear markdown instructions. The instructions should be:
   - Specific and actionable
   - Written as directives for Claude to follow
   - Organized with numbered steps or sections
   - Include examples where helpful

5. **Create the file** in the appropriate directory:
   - Project: `.claude/skills/<skill-name>/SKILL.md`
   - Personal: `~/.claude/skills/<skill-name>/SKILL.md`

6. **Confirm creation** and tell the user they can now use it with `/<skill-name>`.

## Example Output

For a skill called `review-pr`:

```yaml
---
name: review-pr
description: Reviews a pull request for code quality, security, and best practices. Use when the user asks to review a PR.
argument-hint: "[pr-number]"
---

Review pull request #$ARGUMENTS following these steps:

1. **Fetch PR details** using `gh pr view $ARGUMENTS`
2. **Read the diff** using `gh pr diff $ARGUMENTS`
3. **Analyze for**:
   - Code quality and readability
   - Security vulnerabilities (OWASP top 10)
   - Performance issues
   - Missing tests
4. **Provide feedback** organized by severity (critical, warning, suggestion)
```

## Rules

- Always use proper YAML frontmatter with `---` delimiters
- Keep descriptions concise but clear about when the skill should trigger
- Write instructions as if talking to Claude (imperative mood)
- Only include frontmatter fields that are needed (don't add unnecessary defaults)
- Test that the directory and file are created successfully
