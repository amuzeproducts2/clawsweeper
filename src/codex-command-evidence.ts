export interface CommandEvidence {
  command: string;
  output: string;
}

export function matchesExecutedCommand(actual: string, expected: string): boolean {
  const quoted = `'${expected.replaceAll("'", "'\\''")}'`;
  return (
    actual === expected ||
    ["/bin/bash", "/bin/zsh", "/bin/sh"].some(
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
        entry.output.trim() === baseSha,
    ) &&
    (!headSha ||
      commands.some(
        (entry) =>
          matchesExecutedCommand(entry.command, `git show --format=fuller --stat ${headSha}`) &&
          entry.output.includes(headSha),
      ))
  );
}
