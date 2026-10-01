export interface CommandEvidence {
  command: string;
  output: string;
}

export function matchesExecutedCommand(actual: string, expected: string): boolean {
  const quoted = `'${expected.replaceAll("'", "'\\''")}'`;
  return (
    actual === expected ||
    ["/bin/bash", "/bin/zsh", "/bin/sh", "/usr/bin/bash", "/usr/bin/zsh", "/usr/bin/sh"].some(
      (shell) => actual === `${shell} -lc ${quoted}` || actual === `${shell} -c ${quoted}`,
    )
  );
}

// These are tool completion events, never text from the model's final message.
export function successfulCodexCommands(transcript: string): CommandEvidence[] {
  return transcript.split("\n").flatMap((line) => {
    try {
      const event = JSON.parse(line);
      const item = event.item;
      return event.type === "item.completed" &&
        item?.type === "command_execution" &&
        item.status === "completed" &&
        item.exit_code === 0 &&
        typeof item.command === "string" &&
        typeof item.aggregated_output === "string"
        ? [{ command: item.command, output: item.aggregated_output }]
        : [];
    } catch {
      return [];
    }
  });
}

export function verifiedCheckoutEvidence(
  transcript: string,
  baseSha: string,
  headSha: string | null,
): boolean {
  const commands = successfulCodexCommands(transcript);
  return (
    commands.some(
      (entry) =>
        matchesExecutedCommand(entry.command, "git rev-parse HEAD") &&
        entry.output.trim() === (headSha ?? baseSha),
    ) &&
    (!headSha ||
      commands.some(
        (entry) =>
          matchesExecutedCommand(entry.command, `git show --format=fuller --stat ${headSha}`) &&
          entry.output.includes(headSha),
      ))
  );
}

// Persist only fixed labels, statuses, counts and booleans. Never retain arbitrary
// commands, output, model messages, environment, or error text in this diagnostic.
export function checkoutExecutionDiagnostics(
  transcript: string,
  baseSha: string,
  headSha: string | null,
) {
  type Observation = { status: string; exitCode: number | null; matchesHead: boolean };
  const identity: Observation[] = [];
  const summary: Observation[] = [];
  let commandEvents = 0;
  let completedCommandEvents = 0;
  let malformedLines = 0;
  for (const line of transcript.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.item?.type !== "command_execution") continue;
      commandEvents += 1;
      if (event.type !== "item.completed") continue;
      completedCommandEvents += 1;
      const item = event.item;
      if (typeof item.command !== "string") continue;
      const output = typeof item.aggregated_output === "string" ? item.aggregated_output : "";
      const status = ["completed", "failed", "in_progress"].includes(item.status)
        ? item.status
        : "unknown";
      const exitCode = Number.isSafeInteger(item.exit_code) ? item.exit_code : null;
      if (matchesExecutedCommand(item.command, "git rev-parse HEAD")) {
        identity.push({ status, exitCode, matchesHead: output.trim() === (headSha ?? baseSha) });
        if (identity.length > 8) identity.shift();
      } else if (
        headSha &&
        matchesExecutedCommand(item.command, `git show --format=fuller --stat ${headSha}`)
      ) {
        summary.push({ status, exitCode, matchesHead: output.includes(headSha) });
        if (summary.length > 8) summary.shift();
      }
    } catch {
      malformedLines += 1;
    }
  }
  return {
    version: 1,
    commandEvents,
    completedCommandEvents,
    malformedLines,
    headIdentity: identity,
    prHeadSummary: summary,
    verified: verifiedCheckoutEvidence(transcript, baseSha, headSha),
  };
}
