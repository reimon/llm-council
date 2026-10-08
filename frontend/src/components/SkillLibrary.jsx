import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useLang } from '../useLang';
import { skillName } from './skillName';

export default function SkillLibrary({ installed, onChanged, onClose, seatName, seatSkills, onAttach }) {
  const { t, lang } = useLang();
  const [catalog, setCatalog] = useState(null);
  const [source, setSource] = useState('library');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);

  const installedIds = useMemo(() => new Set(installed.map((s) => s.id)), [installed]);

  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    api.getSkillCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  // Local SKILL.md descriptions are usually English: translate them once, then refresh as batches land
  useEffect(() => {
    if (lang !== 'pt') return undefined;
    let stopped = false;
    let timer;
    const poll = async () => {
      const state = await api.translateSkills();
      if (stopped) return;
      setTranslating(state.running);
      if (state.running) {
        timer = setTimeout(async () => {
          const fresh = await api.getSkillCatalog().catch(() => null);
          if (!stopped && fresh) setCatalog(fresh);
          poll();
        }, 5000);
      } else {
        const fresh = await api.getSkillCatalog().catch(() => null);
        if (!stopped && fresh) setCatalog(fresh);
      }
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [lang]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = (catalog || [])
    .filter((s) => (source === 'installed' ? installedIds.has(s.id) : s.source === source))
    .filter((s) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${skillName(s, lang)} ${s.description?.[lang] || ''}`.toLowerCase().includes(q);
    });

  const toggleInstall = async (skill) => {
    setBusy(skill.id);
    try {
      if (installedIds.has(skill.id)) await api.uninstallSkill(skill.id);
      else await api.installSkill(skill.id);
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  const counts = {
    library: catalog?.filter((s) => s.source === 'library').length ?? 0,
    local: catalog?.filter((s) => s.source === 'local').length ?? 0,
    installed: installed.length,
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="skill-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-library-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="library-head">
          <div>
            <h2 id="skill-library-title">{t('skillLibrary')}</h2>
            <p>{t('skillLibraryIntro')}</p>
          </div>
          <button type="button" className="icon-close" onClick={onClose} aria-label={t('close')}>
            ×
          </button>
        </header>

        <div className="library-controls">
          <div className="segmented" role="tablist">
            {['library', 'local', 'installed'].map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={source === s}
                className={source === s ? 'active' : ''}
                onClick={() => setSource(s)}
              >
                {t(`skillSource_${s}`)} <span className="count">{counts[s]}</span>
              </button>
            ))}
          </div>
          <input
            className="drawer-input library-search"
            placeholder={t('searchSkills')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <p className="library-source-note">
          {t(`skillSourceNote_${source}`)}
          {translating && source === 'local' && <span className="translating"> {t('translatingSkills')}</span>}
        </p>

        <div className="skill-grid">
          {catalog === null && <p className="drawer-muted">{t('loadingSkills')}</p>}
          {catalog !== null && items.length === 0 && <p className="drawer-muted">{t('noSkills')}</p>}
          {items.map((s) => {
            const isInstalled = installedIds.has(s.id);
            const attached = seatSkills?.includes(s.id);
            return (
              <article key={s.id} className={`skill-card ${isInstalled ? 'installed' : ''}`}>
                <div className="skill-card-top">
                  <span className="skill-badge">{s.icon}</span>
                  <div className="skill-card-text">
                    <h3>{skillName(s, lang)}</h3>
                    <span className="skill-origin">{s.origin}</span>
                  </div>
                </div>
                <p className="skill-desc">{s.description?.[lang] || s.description?.pt}</p>
                <div className="skill-card-actions">
                  <button
                    type="button"
                    className={`drawer-btn ${isInstalled ? '' : 'drawer-primary'}`}
                    onClick={() => toggleInstall(s)}
                    disabled={busy === s.id}
                  >
                    {busy === s.id ? '…' : isInstalled ? t('uninstallSkill') : t('installSkill')}
                  </button>
                  {isInstalled && seatName && (
                    <button
                      type="button"
                      className="drawer-btn"
                      disabled={attached}
                      onClick={() => onAttach(s.id)}
                    >
                      {attached ? t('skillOnSeat', seatName) : t('giveToSeat', seatName)}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
