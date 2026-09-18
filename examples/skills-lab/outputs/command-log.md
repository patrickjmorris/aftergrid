# Executed computation commands and observed results

All commands ran in the provided isolated fixture root. The shell file-creation blocks are reflected in the saved scripts/plans/reports; no source writes occurred.

1. `python3 outputs/conversion/calculate.py > outputs/conversion/stdout.json` — exit 0. Conversion 8.8%→6.2%; −2.6 pp, −29.55% relative; within +1.0 pp and mix −3.6 pp, exact reconciliation; input checks passed.
2. `python3 outputs/revenue/calculate.py > outputs/revenue/stdout.json` — exit 0. MRR $430→$440; +2.33%; +$90 entry +$20 expansion −$20 contraction −$80 churn; baseline accounts $350 current; checks passed.
3. `python3 outputs/review/calculate.py > outputs/review/stdout.json` — exit 0. Observed rates 60%/40%, 20 pp gap, 50% relative group difference; pooled 50%; explicitly hypothetical all-at-60% arithmetic would imply +20% retained, not +50%; checks passed.
4. `python3 outputs/learning/calculate.py > outputs/learning/stdout.json` — exit 0. Conversion 6.2%→8.0%; +1.8 pp / +29.03%; within +0.8 pp and mix +1.0 pp; baseline continuity and other checks passed.
5. `python3 outputs/verify_artifacts.py > outputs/verification-stdout.json` — exit 0. 17 local Markdown links resolved when checked; five Python files parsed; four JSON calculation outputs parsed; all four supplied CSV hashes still matched execution-time hashes. README was then appended to describe this check; this command log was subsequently added. No calculation reruns occurred.

Read-only inspection commands used: `pwd`; `rg --files -g '!input-hashes.json'`; `cat` of supplied skills/cases/three initial data extracts and saved stdout; `rg -n 'conversion|mix|session|grain' outputs --glob '*.md'`; `rg -n 'conversion|mix|session|grain' outputs/learning/lessons`; `cat` of the proposed lesson; `cat data/conversion-followup.csv` only after the follow-up plan was saved; `rg --files outputs`. Output writes used `mkdir -p`, shell heredocs and stdout redirection under `outputs/` only. No web, answer-key, unrelated workspace or input-hashes inspection occurred.
