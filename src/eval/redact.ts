// Credential redaction for anything the eval writes about how an analyzer was invoked: the command template in
// run.json, the rendered argv in a case record, the analyzer's stderr tail in a reason. Shared by the runner and the
// nightly so the two can never disagree about what counts as a secret.
const SECRET_SHAPED = /^(gh[pousr]_[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]+-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,}|xox[abprs]-[A-Za-z0-9_-]{8,})$/;
/**
 * A name that carries a credential, matched by its **suffix** rather than by an enumeration of flags: an
 * unknown vendor's `--anthropic-api-key` is as much a key as `--api-key`, and a list can only ever be behind.
 */
const SECRET_NAME = /(^|[-_])(api[-_]?key|key|token|secret|password|passwd|credential|pat|auth)s?$/i;
/** The environment-assignment form, where the word can sit anywhere in the name (`ANTHROPIC_API_KEY_FILE`). */
const SECRET_NAME_CONTAINS = /^[A-Za-z_][A-Za-z0-9_-]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)[A-Za-z0-9_-]*$/i;

const isSecretName = (raw: string): boolean => {
  const name = raw.replace(/^-+/, "");
  return SECRET_NAME.test(name) || SECRET_NAME_CONTAINS.test(name);
};

/**
 * The analyzer command template, with anything that looks like a credential removed.
 *
 * `run.json` is uploaded as an artifact and quoted in a job summary, so the template is recorded for
 * reproducibility with its secrets taken out. Every token is split on its first `=` first, so `--api-key=VALUE`
 * and `--api-key VALUE` are the same case; a name is credential-shaped by suffix rather than by an enumeration
 * of known flags; and a bare token with a provider shape goes whatever it is attached to. An environment
 * *reference* (`$ANTHROPIC_API_KEY`) is not a secret and is kept, because it is how the run was configured.
 */
export function redactCommand(template: string | null | undefined): string | null {
  if (!template || !template.trim()) return null;
  const tokens = template.trim().split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const eq = t.indexOf("=");
    if (eq > 0) {
      const name = t.slice(0, eq), value = t.slice(eq + 1);
      if (value.startsWith("$")) { out.push(t); continue; }
      out.push(isSecretName(name) || SECRET_SHAPED.test(value) ? `${name}=<redacted>` : t);
      continue;
    }
    if (SECRET_SHAPED.test(t)) { out.push("<redacted>"); continue; }
    out.push(t);
    if (t.startsWith("-") && isSecretName(t) && i + 1 < tokens.length) {
      const next = tokens[i + 1]!;
      out.push(next.startsWith("$") ? next : "<redacted>");
      i++;
    }
  }
  return out.join(" ");
}
