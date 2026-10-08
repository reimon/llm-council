import { useState, useEffect } from 'react';
import Council3DVisualizer from './Council3DVisualizer';
import { calculateLiveTokens, tokenText, usageTitle } from './tokens';
import ModelIcon from './ModelIcon';
import { useLang } from '../useLang';
import './CouncilDeliberation.css';

export default function CouncilDeliberation({
  deliberation,
  loading = {},
  isComplete = false,
  project = null,
}) {
  const { t } = useLang();
  const [viewMode, setViewMode] = useState('3d'); // '3d' | 'compact'
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const activeStage = deliberation?.activeStage || (loading?.stage3 ? 3 : loading?.stage2 ? 2 : 1);
  const isDone = isComplete || activeStage === 'done';

  // Real-time ticker for live tokens accumulation and smooth counting
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 80);
    return () => clearInterval(interval);
  }, []);

  // Elapsed time, derived from the ticker above (frozen at the real duration once done)
  const elapsedSeconds = !deliberation?.startedAt
    ? 0
    : isDone && deliberation?.completedAt
      ? Math.max(1, Math.round((deliberation.completedAt - deliberation.startedAt) / 1000))
      : Math.max(0, Math.floor((currentTime - deliberation.startedAt) / 1000));

  // Format mm:ss
  const formatTimer = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Build model display list
  const memberList = (deliberation?.members || []).map((m, idx) => {
    const state = deliberation?.models?.[m.name] || {};
    let status = state.status || 'waiting';

    // If stage1 loading and model has no status yet, mark as thinking
    if (activeStage === 1 && loading?.stage1 && status === 'waiting') {
      status = 'thinking';
    } else if (activeStage === 2 && loading?.stage2 && status !== 'error') {
      status = state.stage === 2 && state.status === 'completed' ? 'completed' : 'thinking';
    } else if (isDone) {
      status = 'completed';
    }

    const tokenData = calculateLiveTokens({
      status,
      duration: state.duration,
      finalTokens: state.tokens,
      startedAt: state.startedAt,
      deliberationStartedAt: deliberation?.startedAt,
      index: idx,
      isProject: !!project,
      currentTime,
    });

    return {
      name: m.name,
      role: m.role || 'generalist',
      model: m.model,
      provider: m.provider,
      status,
      duration: state.duration,
      tokens: state.tokens,
      tokensReal: !!state.tokensReal,
      usage: state.usage || null,
      liveTokens: tokenData.tokens,
      tokenRate: tokenData.rate,
      elapsed: tokenData.elapsed,
      stage: state.stage || activeStage,
    };
  });

  // Calculate live chairman tokens
  const chairTokenData = calculateLiveTokens({
    status: activeStage === 3 ? 'thinking' : isDone ? 'completed' : 'waiting',
    duration: deliberation?.chairman?.duration,
    finalTokens: deliberation?.chairman?.tokens,
    startedAt: deliberation?.chairman?.startedAt,
    deliberationStartedAt: deliberation?.startedAt,
    index: 10,
    isProject: !!project,
    currentTime,
  });

  // Calculate total live tokens across entire council
  const totalTokens = memberList.reduce((acc, m) => acc + m.liveTokens, 0) + (activeStage === 3 || isDone ? chairTokenData.tokens : 0);

  // Calculate stage progress
  const completedCount = memberList.filter((m) => m.status === 'completed').length;
  const totalCount = Math.max(1, memberList.length);

  // Role names translation mapping
  const getRoleLabel = (role) => {
    switch (role) {
      case 'contrarian': return t('role_contrarian') || 'Contrário';
      case 'first_principles': return t('role_first_principles') || 'Primeiros Princípios';
      case 'expansionist': return t('role_expansionist') || 'Expansionista';
      case 'outsider': return t('role_outsider') || 'Olhar de fora';
      case 'executor': return t('role_executor') || 'Executor';
      case 'chairman': return t('chairman') || 'Presidente';
      default: return t('role_generalist') || 'Generalista';
    }
  };

  return (
    <div className={`council-deliberation-panel ${isDone ? 'is-complete' : 'is-active'}`}>
      {/* Top Header Bar */}
      <div className="deliberation-header">
        <div className="deliberation-headline">
          <div className={`status-orb-pulse ${isDone ? 'done' : `stage-${activeStage}`}`} />
          <div className="headline-text">
            <h3>
              {isDone
                ? (t('deliberationComplete') || 'Deliberação Concluída')
                : (t('deliberationTitle') || 'Deliberação do Conselho em tempo real')}
            </h3>
            {project && (
              <span className="project-badge" title={project.path}>
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1.75 4.25c0-.69.56-1.25 1.25-1.25h3.1l1.4 1.5H13c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25z" />
                </svg>
                {t('deliberationInProject') ? t('deliberationInProject', project.name) : `Projeto: ${project.name} (sandbox read-only)`}
              </span>
            )}
          </div>
        </div>

        <div className="deliberation-actions">
          {/* Live Total Tokens Metric */}
          <div className="deliberation-tokens-badge" title="Tokens acumulados em tempo real">
            <span className="tokens-bolt">⚡</span>
            <span className="tokens-val">
              {tokenText(totalTokens, memberList.length > 0 && memberList.every((m) => m.tokensReal))}
            </span>
            <span className="tokens-unit">tokens</span>
          </div>

          {/* Live Timer Stopwatch */}
          <div className="deliberation-timer" title="Tempo total da deliberação">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{deliberation?.startedAt ? formatTimer(elapsedSeconds) : "--:--"}</span>
          </div>

          {/* 3D vs Compact toggle */}
          <button
            type="button"
            className="deliberation-toggle-btn"
            onClick={() => setViewMode(viewMode === '3d' ? 'compact' : '3d')}
            title={viewMode === '3d' ? 'Ver modo compacto' : 'Ver visualização 3D'}
          >
            {viewMode === '3d' ? '3D' : 'Cards'}
          </button>

          {/* Collapse/Expand button */}
          <button
            type="button"
            className="deliberation-toggle-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expandir' : 'Recolher'}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Stage Progress Stepper */}
          <div className="stage-stepper">
            <div className={`step-item ${activeStage === 1 ? 'current' : activeStage > 1 || isDone ? 'finished' : ''}`}>
              <div className="step-circle">{activeStage > 1 || isDone ? '✓' : '1'}</div>
              <div className="step-label">
                <span className="step-name">{t('stage1Name') || '1. Respostas Individuais'}</span>
                <span className="step-meta">
                  {activeStage === 1 && !isDone
                    ? `${completedCount}/${totalCount} ${t('modelsDone') || 'concluídos'}`
                    : `${totalCount} modelos`}
                </span>
              </div>
            </div>

            <div className={`step-connector ${activeStage > 1 || isDone ? 'filled' : ''}`} />

            <div className={`step-item ${activeStage === 2 ? 'current' : activeStage > 2 || isDone ? 'finished' : ''}`}>
              <div className="step-circle">{activeStage > 2 || isDone ? '✓' : '2'}</div>
              <div className="step-label">
                <span className="step-name">{t('stage2Name') || '2. Avaliação Anônima'}</span>
                <span className="step-meta">
                  {activeStage === 2 ? (t('modelReviewing') || 'Avaliando pares…') : (t('stagesOnTable')?.[1] || 'Avaliar às cegas')}
                </span>
              </div>
            </div>

            <div className={`step-connector ${activeStage > 2 || isDone ? 'filled' : ''}`} />

            <div className={`step-item ${activeStage === 3 ? 'current' : isDone ? 'finished' : ''}`}>
              <div className="step-circle">{isDone ? '✓' : '3'}</div>
              <div className="step-label">
                <span className="step-name">{t('stage3Name') || '3. Síntese do Presidente'}</span>
                <span className="step-meta">
                  {deliberation?.chairman?.name || 'Presidente'}
                </span>
              </div>
            </div>
          </div>

          {/* 3D Visualizer Canvas with 3D-pinned labels and real-time token tracking */}
          {viewMode === '3d' && (
            <Council3DVisualizer
              members={memberList}
              chairman={deliberation?.chairman}
              activeStage={activeStage}
              isComplete={isDone}
              isProject={!!project}
              deliberationStartedAt={deliberation?.startedAt}
              selectedModel={selectedModel}
              onSelectModel={(name) => setSelectedModel(name === selectedModel ? null : name)}
            />
          )}

          {/* Council Models Status Grid */}
          <div className="council-models-grid">
            {memberList.map((m) => {
              const isSelected = selectedModel === m.name;
              const isThinking = m.status === 'thinking';
              const isFinished = m.status === 'completed';

              return (
                <div
                  key={m.name}
                  className={`model-seat-card ${m.status} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedModel(isSelected ? null : m.name)}
                >
                  <div className="seat-card-top">
                    <div className="seat-model-ident">
                      <ModelIcon model={m.model || m.name} provider={m.provider} size={18} />
                      <span className="seat-model-name" title={m.name}>
                        {m.name}
                      </span>
                    </div>
                    <span className={`seat-role-pill role-${m.role}`}>
                      {getRoleLabel(m.role)}
                    </span>
                  </div>

                  <div className="seat-card-status">
                    {isThinking ? (
                      <div className="seat-status-thinking">
                        <span className="status-badge thinking">
                          <span className="pulse-dot" />
                          {activeStage === 2
                            ? (t('modelReviewing') || 'Avaliando…')
                            : (t('modelThinking') || 'Pensando…')}
                        </span>
                        <span className="seat-live-tokens">{m.elapsed}s</span>
                      </div>
                    ) : isFinished ? (
                      <div className="seat-status-done">
                        <span className="status-badge completed">
                          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 8.5 6.5 12 13 4" />
                          </svg>
                          {m.duration ? `${m.duration}s` : (t('modelDone') || 'Concluído')}
                        </span>
                        {m.liveTokens > 0 && (
                          <span className="seat-done-tokens" title={usageTitle(m.usage)}>
                            {tokenText(m.liveTokens, m.tokensReal)} tokens
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="status-badge waiting">
                        {t('modelWaiting') || 'Aguardando'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Chairman Seat Card (Shown during Stage 3 or when completed) */}
            {deliberation?.chairman && (
              <div className={`model-seat-card chairman ${activeStage === 3 ? 'thinking' : isDone ? 'completed' : 'waiting'}`}>
                <div className="seat-card-top">
                  <div className="seat-model-ident">
                    <ModelIcon model={deliberation.chairman.model || deliberation.chairman.name} provider={deliberation.chairman.provider} size={18} />
                    <span className="seat-model-name" title={deliberation.chairman.name}>
                      {deliberation.chairman.name}
                    </span>
                  </div>
                  <span className="seat-role-pill role-chairman">
                    {t('chairman') || 'Presidente'}
                  </span>
                </div>
                <div className="seat-card-status">
                  {activeStage === 3 ? (
                    <div className="seat-status-thinking">
                      <span className="status-badge thinking chair">
                        <span className="pulse-dot" />
                        {t('modelSynthesizing') || 'Sintetizando…'}
                      </span>
                      <span className="seat-live-tokens chair">{chairTokenData.elapsed}s</span>
                    </div>
                  ) : isDone ? (
                    <div className="seat-status-done">
                      <span className="status-badge completed">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 8.5 6.5 12 13 4" />
                        </svg>
                        {t('modelDone') || 'Concluído'}
                      </span>
                      {chairTokenData.tokens > 0 && (
                        <span className="seat-done-tokens" title={usageTitle(deliberation?.chairman?.usage)}>
                          {tokenText(chairTokenData.tokens, deliberation?.chairman?.tokensReal)} tokens
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="status-badge waiting">
                      {t('modelWaiting') || 'Aguardando síntese'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
