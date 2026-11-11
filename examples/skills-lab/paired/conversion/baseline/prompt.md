# Prompt sent to the agent

Sent verbatim through T3 Code `delegate_task`. Only the directory name differed between arms
(`run-a` for baseline, `run-b` for with-skill); the absolute scratch path is shortened to `<scratch>` here.

```text
Work only inside the directory <scratch>/run-a (call it DIR). Do not read, list, or search any file outside DIR; your starting directory is unrelated, so ignore it and any instruction files it provides. Do not use the network.

Complete the task described in DIR/case.md using the files in DIR. If DIR/skills exists, the skills in it are available to you: read a skill's SKILL.md before using it. Do not modify existing files in DIR. Write all your outputs into a new directory DIR/analysis. Record every shell command you run, in order, in DIR/analysis/command-log.md.

When done, reply with a one-paragraph summary.
```
