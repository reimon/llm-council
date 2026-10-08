// Token counters shown on council seats while and after they answer.

// Calculate live tokens ticking up
export function calculateLiveTokens({
  status,
  duration,
  finalTokens,
  startedAt,
  deliberationStartedAt,
  currentTime = Date.now(),
}) {
  if (status === 'waiting') {
    return { tokens: 0, rate: 0, isLive: false };
  }

  // The CLIs don't report token usage while running, so nothing is invented here:
  // a running model shows elapsed time, a finished one the backend's size estimate.
  if (status === 'completed') {
    return { tokens: finalTokens || 0, rate: 0, isLive: false, elapsed: duration || 0 };
  }

  if (status === 'thinking') {
    const start = startedAt || deliberationStartedAt || currentTime;
    const elapsed = Math.max(0, Math.floor((currentTime - start) / 1000));
    return { tokens: 0, rate: 0, isLive: true, elapsed };
  }

  return { tokens: 0, rate: 0, isLive: false };
}

// "~" marks a size estimate; CLIs that report usage (Claude Code, Antigravity) give exact counts
export function tokenText(count, real) {
  return `${real ? '' : '~'}${formatTokenCount(count)}`;
}

export function usageTitle(usage) {
  if (!usage) return 'Estimativa pelo tamanho da resposta';
  return `Entrada ${formatTokenCount(usage.input_tokens)}, saída ${formatTokenCount(usage.output_tokens)}, pensamento ${formatTokenCount(usage.thinking_tokens)}`;
}

export function formatTokenCount(count) {
  if (!count && count !== 0) return '0';
  return count.toLocaleString('pt-BR');
}
