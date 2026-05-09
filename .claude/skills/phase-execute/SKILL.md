# Phase Execute Skill

Given a PRD/plan reference:
1. Read the PRD and existing plan docs
2. Decompose into atomic tasks and present for approval
3. After approval, execute tasks one at a time
4. After each task: run typecheck, lint, tests, build
5. Report gate status and wait for 'continue' before next task
6. Never modify files outside the task scope
