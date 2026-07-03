# Plugins
## Caveman
https://github.com/juliusbrussee/caveman

## code security review
https://github.com/anthropics/claude-code-security-review

Usage:
`/plugin install comprehensive-review@claude-code-workflows`

## code-simplifier
Source: Anthropic official — github.com/anthropics/claude-plugins-official

`/plugin marketplace add anthropics/claude-plugins-official`
`/plugin install code-simplifier@claude-plugins-official`
AI moves fast and writes faster. The code it produces works but accumulates complexity quickly — nested ternaries, functions doing three things at once, abstractions that made sense in the moment and don’t six weeks later.

The code-simplifier skill is focused on one thing: take recently modified code and make it cleaner without changing what it does. It follows your project’s conventions from CLAUDE.md, applies them consistently, and flags clarity issues like nested conditionals and overly compact logic in favour of explicit, readable alternatives.

The rule it enforces that I appreciate most: never change behaviour, only how behaviour is expressed. It won’t refactor your logic or suggest architecture changes — it cleans up the code you just wrote and moves on. That constraint is what makes it trustworthy.



