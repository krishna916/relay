export const AGENT_WORKFLOW_FIXTURES = {
  sessions: {
    alpha: 'session-alpha',
    beta: 'session-beta',
  },
  agents: {
    codex: 'Codex',
    claudeCode: 'Claude Code',
  },
  workspace: 'relay-verification',
  titles: {
    alphaOpen: 'Alpha open capture',
    alphaCompleted: 'Alpha completed capture',
    alphaArchived: 'Alpha archived capture',
    betaOpen: 'Beta open capture',
    duplicate: 'Duplicate candidate capture',
  },
  malformed: {
    session: 'bad session id!',
    taskId: 'not-a-valid-task-id',
  },
} as const;
