# Check outside context

An optional check. Use it when a conclusion leans on something outside the user's data: an industry benchmark ("typical churn is 5%"), a market or policy event that might explain a shift, a published figure the analysis compares against, or a claim about what is normal. Skip it when the conclusion stands on the user's data alone. Never block ordinary work on it.

Any web search the harness already has works. If it has none, the free [Parallel MCP](https://parallel.ai/blog/parallel-mcp-2) needs no key or sign-up: add `https://mcp.parallel.ai/mcp` as an MCP server. Its `web_search` and `web_fetch` find and read sources; `web_decisions` answers one question with a cited probability, a pick from a list you give, or a score on a scale you give. If no search tool is available, list the outside claims as unchecked and continue.

## 1. Name the outside claims

List each claim the conclusion takes from outside the data, with where it appears. Keep only the ones that would change the conclusion or the call if wrong.

Completion: zero to three claims, each tied to the sentence it supports. Zero means stop here.

## 2. Search for evidence that would contradict it

Search for the claim and for its strongest rival, not for support alone. For a benchmark, look for the source, the population it covers, its period, and how it defines the metric. For an outside explanation, check whether the event's date and reach fit the observed change. Read the source page before you quote a number from it; a search excerpt is not a source.

Use `web_decisions` (or an equivalent) only for a question with a fixed answer form, such as "Is 5% monthly churn typical for B2B SaaS under $10k ACV?" Ask related questions in one call. Treat its probability as a pointer to sources, not as evidence on its own.

Completion: each claim has at least one cited source, or is marked "no source found".

## 3. Judge comparability, then report

An outside figure supports a conclusion only when its metric definition, population, and period match the analysis closely enough; [the rigor rules](rigor.md) apply to it as to any number. Label each claim:

- **supported**: a comparable source agrees;
- **contradicted**: a comparable source disagrees, with what it says;
- **not comparable**: a source exists but its definition, population, or period differs; name the difference;
- **unchecked**: no source found or no search available.

Report the label, the source link, and its date beside the claim it bears on. A contradicted or not-comparable benchmark that decides the conclusion is a material finding. Outside sources are context, never a replacement for the user's data, and a search result is not an attestation.

Completion: every listed claim carries a label and a link or the reason it has none.
