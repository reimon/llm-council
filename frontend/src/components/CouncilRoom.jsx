import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';
import SkillLibrary, { skillName } from './SkillLibrary';

export const ROLE_META = {
  generalist: { color: '#8e9bf0' },
  contrarian: { color: '#ef6461' },
  first_principles: { color: '#4aa3ff' },
  expansionist: { color: '#3fcf8e' },
  outsider: { color: '#f39a3d' },
  executor: { color: '#2fc4b2' },
};
const CHAIR_COLOR = '#e1b75a';
const ROLE_IDS = Object.keys(ROLE_META);

function RoleIcon({ role, size = 22 }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const icons = {
    generalist: <><circle cx="12" cy="8" r="3.5" {...p} /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" {...p} /></>,
    contrarian: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" {...p} /><path d="M10 10a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2M12 16h.01" {...p} /></>,
    first_principles: <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" {...p} /></>,
    expansionist: <><path d="M14 4c3 0 6 3 6 6l-7 7-6-6 7-7zM7 11l-3 1 3 3M13 17l-1 3-3-3M15 9h.01" {...p} /></>,
    outsider: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" {...p} /></>,
    executor: <><circle cx="12" cy="12" r="3" {...p} /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" {...p} /></>,
    chair: <path d="M4 8l4 4 4-7 4 7 4-4-2 11H6z" {...p} />,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {icons[role] || icons.generalist}
    </svg>
  );
}

function seatPosition(index, total) {
  // Chairman sits at the top (-90°); councillors share the rest of the ring.
  const angle = ((-90 + ((index + 1) * 360) / (total + 1)) * Math.PI) / 180;
  return { left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 38 * Math.sin(angle)}%` };
}

// Line from the table's edge (ellipse rx 23%, ry 20%) to just short of the seat's orb
function tableToSeat(x, y) {
  const dx = x - 50;
  const dy = y - 50;
  const edge = 1 / Math.sqrt((dx / 23) ** 2 + (dy / 20) ** 2);
  const len = Math.hypot(dx, dy);
  const stop = Math.max(edge, 1 - 7 / len);
  return [50 + dx * edge, 50 + dy * edge, 50 + dx * stop, 50 + dy * stop];
}

function Seat({ color, icon, name, sub, selected, dimmed, crown, style, onClick, ghost, label, skills = [] }) {
  return (
    <button
      type="button"
      className={`seat ${selected ? 'seat-selected' : ''} ${dimmed ? 'seat-dimmed' : ''} ${ghost ? 'seat-ghost' : ''} ${crown ? 'seat-chair' : ''}`}
      style={{ ...style, '--seat': color }}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
    >
      <span className="seat-orb">{icon}</span>
      <span className="seat-name">{name}</span>
      {sub && <span className="seat-sub">{sub}</span>}
      {skills.length > 0 && (
        <span className="seat-skills">
          {skills.slice(0, 2).map((s) => (
            <span key={s} className="seat-skill">{s}</span>
          ))}
          {skills.length > 2 && <span className="seat-skill">+{skills.length - 2}</span>}
        </span>
      )}
    </button>
  );
}

function SeatSkills({ seat, installed, onChange, onOpenLibrary }) {
  const { t, lang } = useLang();
  const [adding, setAdding] = useState(false);
  const attached = seat.skills || [];
  const byId = Object.fromEntries(installed.map((s) => [s.id, s]));
  const available = installed.filter((s) => !attached.includes(s.id));

  return (
    <section>
      {attached.length === 0 && <p className="drawer-hint">{t('noSeatSkills')}</p>}
      <div className="seat-skill-list">
        {attached.map((id) => (
          <span key={id} className="skill-pill">
            <span className="skill-pill-badge">{byId[id]?.icon || '?'}</span>
            {byId[id] ? skillName(byId[id], lang) : id}
            <button
              type="button"
              aria-label={t('removeSkillFromSeat', byId[id] ? skillName(byId[id], lang) : id)}
              onClick={() => onChange(attached.filter((x) => x !== id))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {adding ? (
        <div className="skill-picker">
          {available.length === 0 ? (
            <p className="drawer-hint">{t('allSkillsUsed')}</p>
          ) : (
            available.map((s) => (
              <button
                key={s.id}
                type="button"
                className="skill-option"
                onClick={() => {
                  onChange([...attached, s.id]);
                  setAdding(false);
                }}
              >
                <span className="skill-pill-badge">{s.icon}</span>
                <span>
                  <strong>{skillName(s, lang)}</strong>
                  <small>{s.description?.[lang] || s.description?.pt}</small>
                </span>
              </button>
            ))
          )}
          <div className="skill-picker-foot">
            <button type="button" className="text-link" onClick={onOpenLibrary}>{t('openLibrary')}</button>
            <button type="button" className="text-link" onClick={() => setAdding(false)}>{t('cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="test-row">
          <button
            type="button"
            className="drawer-btn"
            onClick={() => (installed.length ? setAdding(true) : onOpenLibrary())}
          >
            {t('addSkill')}
          </button>
          {installed.length === 0 && <span className="drawer-hint">{t('libraryEmptyHint')}</span>}
        </div>
      )}
    </section>
  );
}

function ProviderList({ providers, value, onChange }) {
  const { t } = useLang();
  if (!providers.length) return <p className="drawer-hint">{t('loadingProviders')}</p>;
  return (
    <div className="provider-list" role="radiogroup" aria-label={t('provider')}>
      {providers.map((p) => {
        const state = !p.installed ? 'off' : p.needs_login ? 'warn' : 'ready';
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            className={`provider-row ${value === p.id ? 'active' : ''} state-${state}`}
            disabled={!p.installed}
            onClick={() => onChange(p)}
          >
            <span className="provider-dot" aria-hidden="true" />
            <span className="provider-row-name">{p.label}</span>
            <span className="provider-row-meta">
              {state === 'off' ? t('notInstalled') : state === 'warn' ? t('needsLogin') : t('modelsCount', p.models.length)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ModelList({ provider, providers, value, onChange }) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const models = providers.find((p) => p.id === provider)?.models || [];
  if (!models.length) {
    return (
      <input
        className="drawer-input mono"
        placeholder={t('typeModel')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const filtered = models.filter((m) => m.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="model-list">
      {models.length > 6 && (
        <input
          className="drawer-input model-search"
          placeholder={t('searchModel')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="model-options" role="radiogroup" aria-label={t('model')}>
        {filtered.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === value}
            className={`model-option ${m === value ? 'active' : ''}`}
            onClick={() => onChange(m)}
          >
            <span className="radio-mark" aria-hidden="true" />
            <span className="mono">{m}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="drawer-hint">{t('noModelMatch')}</p>}
      </div>
    </div>
  );
}

function RoleList({ value, onChange, takenBy = {} }) {
  const { t } = useLang();
  return (
    <div className="role-list" role="radiogroup" aria-label={t('roleHeading')}>
      {ROLE_IDS.map((r) => {
        const active = value === r;
        const others = takenBy[r] || [];
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={active}
            className={`role-row ${active ? 'active' : ''} ${!active && others.length ? 'taken' : ''}`}
            style={{ '--seat': ROLE_META[r].color }}
            onClick={() => onChange(r)}
          >
            <span className="role-row-icon"><RoleIcon role={r} size={18} /></span>
            <span className="role-row-text">
              <span className="role-row-head">
                <span className="role-row-name">{t(`role_${r}`)}</span>
                {others.length > 0 ? (
                  <span className="role-taken" title={others.join(', ')}>
                    {t('roleTakenBy', others[0], others.length - 1)}
                  </span>
                ) : (
                  !active && <span className="role-free">{t('roleFree')}</span>
                )}
              </span>
              <span className="role-row-desc">{active ? t(`roleDesc_${r}`) : t(`roleShort_${r}`)}</span>
              {active && (
                <span className="role-row-traits">
                  {t(`roleTraits_${r}`).map((x) => <span key={x}>{x}</span>)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TestButton({ seat }) {
  const { t } = useLang();
  const [state, setState] = useState(null);
  useEffect(() => setState(null), [seat.provider, seat.model]);
  const run = async () => {
    setState({ running: true });
    try {
      setState(await api.testSeat({ provider: seat.provider, model: seat.model }));
    } catch {
      setState({ ok: false });
    }
  };
  return (
    <div className="test-row">
      <button type="button" className="drawer-btn" onClick={run} disabled={state?.running || !seat.model}>
        {state?.running ? t('testing') : t('testConnection')}
      </button>
      {state && !state.running && (
        <span className={state.ok ? 'test-ok' : 'test-fail'}>
          {state.ok ? t('testOk', state.seconds) : t('testFail')}
        </span>
      )}
    </div>
  );
}

function CouncilSwitcher({ store, currentId, onSwitch, onCreate, onDelete, onMakeDefault }) {
  const { t, councilLabel } = useLang();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const current = store.councils.find((c) => c.id === currentId);

  const create = (fromId) => {
    if (!name.trim()) return;
    onCreate(name.trim(), fromId);
    setCreating(false);
    setName('');
  };

  return (
    <div className="council-switcher">
      <div className="council-tabs" role="tablist" aria-label={t('myCouncils')}>
        {store.councils.map((c) => {
          const active = c.members.filter((m) => m.enabled !== false);
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === currentId}
              className={`council-tab ${c.id === currentId ? 'active' : ''}`}
              onClick={() => onSwitch(c.id)}
            >
              <span className="council-tab-dots" aria-hidden="true">
                <i style={{ background: CHAIR_COLOR }} />
                {active.slice(0, 6).map((m) => (
                  <i key={m.id} style={{ background: ROLE_META[m.role]?.color }} />
                ))}
              </span>
              <span className="council-tab-name">{councilLabel(c.name)}</span>
              {c.id === store.default_id && <span className="council-default">{t('defaultCouncil')}</span>}
            </button>
          );
        })}
        <button type="button" className="council-tab council-tab-new" onClick={() => setCreating((v) => !v)}>
          + {t('newCouncil')}
        </button>
      </div>

      {creating && (
        <div className="council-create">
          <input
            className="field-input"
            autoFocus
            placeholder={t('councilNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create(currentId);
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button type="button" className="room-btn room-save" disabled={!name.trim()} onClick={() => create(currentId)}>
            {t('copyCurrent', councilLabel(current?.name))}
          </button>
          <button type="button" className="room-btn" disabled={!name.trim()} onClick={() => create(null)}>
            {t('startBlank')}
          </button>
        </div>
      )}

      <div className="council-meta-actions">
        {currentId !== store.default_id && (
          <button type="button" className="text-btn" onClick={() => onMakeDefault(currentId)}>
            {t('makeDefault')}
          </button>
        )}
        {store.councils.length > 1 &&
          (confirmDelete ? (
            <span className="inline-confirm">
              {t('deleteCouncilConfirm', councilLabel(current?.name))}
              <button type="button" className="text-btn danger" onClick={() => { setConfirmDelete(false); onDelete(currentId); }}>
                {t('deleteCouncil')}
              </button>
              <button type="button" className="text-btn" onClick={() => setConfirmDelete(false)}>
                {t('cancel')}
              </button>
            </span>
          ) : (
            <button type="button" className="text-btn" onClick={() => setConfirmDelete(true)}>
              {t('deleteCouncil')}
            </button>
          ))}
      </div>
    </div>
  );
}

export default function CouncilRoom({ onClose }) {
  const { t, councilLabel } = useLang();
  const [council, setCouncil] = useState(null);
  const [saved, setSaved] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState('chair');
  const [drawerTab, setDrawerTab] = useState('model');
  // The chair has no role tab
  useEffect(() => {
    if (selected === 'chair' && drawerTab === 'role') setDrawerTab('model');
  }, [selected, drawerTab]);
  const [status, setStatus] = useState('');
  const [installedSkills, setInstalledSkills] = useState([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [store, setStore] = useState(null);

  const openCouncil = async (id) => {
    const c = await api.getCouncil(id);
    setCouncil(c);
    setSaved(JSON.stringify(c));
    setSelected('chair');
    setStatus('');
  };

  const refreshStore = async () => {
    const s = await api.listCouncils();
    setStore(s);
    return s;
  };

  const refreshSkills = async () => {
    try {
      setInstalledSkills(await api.getInstalledSkills());
    } catch {
      setInstalledSkills([]);
    }
  };

  useEffect(() => {
    refreshStore().then((s) => openCouncil(s.default_id));
    api.getProviders().then(setProviders).catch(() => setProviders([]));
    refreshSkills();
  }, []);

  const dirty = council && JSON.stringify(council) !== saved;
  const members = council?.members || [];
  const seat = selected === 'chair' ? council?.chairman : members.find((m) => m.id === selected);

  const patchSeat = (patch) => {
    setStatus('');
    setCouncil((c) =>
      selected === 'chair'
        ? { ...c, chairman: { ...c.chairman, ...patch } }
        : { ...c, members: c.members.map((m) => (m.id === selected ? { ...m, ...patch } : m)) }
    );
  };

  // Keep the display name in sync with the model unless the user renamed the seat
  const chooseModel = (model) => {
    const autoName = !seat.name || seat.name === seat.model;
    patchSeat(autoName ? { model, name: model } : { model });
  };

  const chooseProvider = (p) => {
    if (p.id === seat.provider) return;
    const model = p.models[0] || '';
    const autoName = !seat.name || seat.name === seat.model;
    patchSeat(autoName ? { provider: p.id, model, name: model } : { provider: p.id, model });
  };

  const addSeat = () => {
    const base = providers.find((p) => p.installed) || { id: 'codex', models: [] };
    const used = new Set(members.map((m) => m.role));
    const role = ROLE_IDS.find((r) => !used.has(r)) || 'generalist';
    const member = {
      id: crypto.randomUUID(),
      name: base.models[0] || 'model',
      provider: base.id,
      model: base.models[0] || '',
      role,
      enabled: true,
    };
    setCouncil((c) => ({ ...c, members: [...c.members, member] }));
    setSelected(member.id);
  };

  const removeSeat = () => {
    setCouncil((c) => ({ ...c, members: c.members.filter((m) => m.id !== selected) }));
    setSelected('chair');
  };

  const makeChair = () => {
    setCouncil((c) => ({ ...c, chairman: { name: seat.name, provider: seat.provider, model: seat.model, skills: seat.skills || [] } }));
    setSelected('chair');
  };

  const save = async () => {
    try {
      const result = await api.saveCouncil(council);
      setCouncil(result);
      setSaved(JSON.stringify(result));
      setStatus(t('saved'));
      await refreshStore();
      return true;
    } catch (err) {
      setStatus(err.message);
      return false;
    }
  };

  // Unsaved edits are saved before moving to another council
  const switchCouncil = async (id) => {
    if (id === council?.id) return;
    if (dirty && !(await save())) return;
    await openCouncil(id);
  };

  const createCouncil = async (name, fromId) => {
    if (dirty && !(await save())) return;
    const created = await api.createCouncil(name, fromId);
    await refreshStore();
    await openCouncil(created.id);
  };

  const deleteCouncil = async (id) => {
    try {
      const s = await api.deleteCouncil(id);
      setStore(s);
      await openCouncil(s.default_id);
    } catch (err) {
      setStatus(err.message);
    }
  };

  const [autoRunning, setAutoRunning] = useState(false);
  const [autoReport, setAutoReport] = useState(null);
  const runAutoconfigure = async () => {
    if (dirty && !(await save())) return;
    setAutoRunning(true);
    setStatus(t('autoRunning'));
    try {
      const result = await api.autoconfigureCouncil();
      setAutoReport(result);
      setStatus(result.message);
      const s = await refreshStore();
      await openCouncil(result.ok ? result.council.id : s.default_id);
      if (result.ok) setStatus(result.message);
    } catch (err) {
      setAutoReport({ ok: false, message: t('autoUnreachable'), providers: [], tested: [] });
      setStatus(err.message);
    } finally {
      setAutoRunning(false);
    }
  };

  const makeDefault = async (id) => {
    setStore(await api.setDefaultCouncil(id));
  };

  const skillBadges = (ids = []) =>
    ids.map((id) => installedSkills.find((s) => s.id === id)?.icon).filter(Boolean);

  // Removing a skill from the library also strips it from seats on the server; mirror that locally
  const onLibraryChanged = async () => {
    const next = await api.getInstalledSkills();
    setInstalledSkills(next);
    const ids = new Set(next.map((s) => s.id));
    const strip = (seat) => ({ ...seat, skills: (seat.skills || []).filter((id) => ids.has(id)) });
    setCouncil((c) => ({ ...c, chairman: strip(c.chairman), members: c.members.map(strip) }));
    setSaved((prev) => {
      if (!prev) return prev;
      const p = JSON.parse(prev);
      return JSON.stringify({ ...p, chairman: strip(p.chairman), members: p.members.map(strip) });
    });
  };

  const activeCount = useMemo(() => members.filter((m) => m.enabled).length, [members]);
  const providerLabel = (id) => providers.find((p) => p.id === id)?.label || id;

  if (!council) {
    return (
      <div className="council-room">
        <div className="stage-loading"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <div className="council-room">
      <header className="room-head">
        <div className="room-title">
          <span className="room-kicker">{t('chamberTitle')}</span>
          <input
            className="council-name-input"
            value={councilLabel(council.name)}
            aria-label={t('councilName')}
            onChange={(e) => setCouncil((c) => ({ ...c, name: e.target.value }))}
          />
          <input
            className="council-desc-input"
            value={council.description || ''}
            placeholder={t('councilDescPlaceholder')}
            aria-label={t('councilDescription')}
            onChange={(e) => setCouncil((c) => ({ ...c, description: e.target.value }))}
          />
          <p>{t('chamberSubtitle', activeCount)}</p>
        </div>
        <div className="room-actions">
          {status && <span className="room-status">{status}</span>}
          <button type="button" className="room-btn" onClick={runAutoconfigure} disabled={autoRunning}>
            {autoRunning ? t('autoRunningShort') : t('autoConfigure')}
          </button>
          <button type="button" className="room-btn" onClick={() => setLibraryOpen(true)}>
            {t('skillLibrary')}
            {installedSkills.length > 0 && <span className="room-count">{installedSkills.length}</span>}
          </button>
          <button type="button" className="room-btn" onClick={onClose}>
            {t('backToChat')}
          </button>
          <button type="button" className="room-btn room-save" onClick={save} disabled={!dirty}>
            {dirty ? t('saveCouncil') : t('savedCouncil')}
          </button>
        </div>
      </header>

      {store && (
        <CouncilSwitcher
          store={store}
          currentId={council.id}
          onSwitch={switchCouncil}
          onCreate={createCouncil}
          onDelete={deleteCouncil}
          onMakeDefault={makeDefault}
        />
      )}

      {autoReport && (
        <section className={`auto-report ${autoReport.ok ? 'ok' : 'fail'}`} aria-live="polite">
          <header>
            <strong>{autoReport.message}</strong>
            <button type="button" className="icon-close" onClick={() => setAutoReport(null)} aria-label={t('close')}>
              ×
            </button>
          </header>
          <div className="auto-report-grid">
            <div>
              <h4>{t('autoFound')}</h4>
              <ul>
                {(autoReport.providers || []).map((p) => (
                  <li key={p.id} className={p.installed && !p.needs_login ? 'good' : 'bad'}>
                    <b>{p.label}</b>{' '}
                    {!p.installed ? t('notInstalled') : p.needs_login ? t('needsLogin') : t('autoFoundAt', p.path, p.models)}
                    {p.model_error && <code>{p.model_error}</code>}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{t('autoTested')}</h4>
              {(autoReport.tested || []).length === 0 && <p>{t('autoNothingTested')}</p>}
              <ul>
                {(autoReport.tested || []).map((r) => (
                  <li key={`${r.provider}:${r.model}`} className={r.ok ? 'good' : 'bad'}>
                    <b>{r.provider}:{r.model}</b> {r.ok ? t('testOk', r.seconds) : t('autoFailed', r.seconds)}
                    {!r.ok && r.error && <code>{r.error}</code>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="room-body">
        {/* keyed by council so the "convening" entrance replays when switching councils */}
        <div key={council.id} className="chamber" role="group" aria-label={t('chamberTitle')}>
          <svg className="chamber-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[
              { key: 'chair', x: 50, y: 12, color: CHAIR_COLOR, opacity: 0.55, order: members.length, active: true },
              ...members.map((m, i) => {
                const pos = seatPosition(i, members.length + 1);
                return {
                  key: m.id,
                  x: parseFloat(pos.left),
                  y: parseFloat(pos.top),
                  color: ROLE_META[m.role]?.color,
                  opacity: m.enabled ? 0.4 : 0.1,
                  order: i,
                  active: m.enabled,
                };
              }),
            ].map((l) => {
              const [x1, y1, x2, y2] = tableToSeat(l.x, l.y);
              // pathLength=1 lets CSS draw/animate the beam in fractions of its length
              const common = { x1, y1, x2, y2, stroke: l.color, pathLength: 1 };
              return (
                <g key={l.key} style={{ '--i': l.order }}>
                  {/* the beam draws itself from the table to the seat on entrance */}
                  <line {...common} className="beam" strokeOpacity={l.opacity} strokeWidth="0.25" />
                  {/* a pulse of energy travels to every seat that is taking part */}
                  {l.active && <line {...common} className="beam-pulse" strokeWidth="0.55" />}
                </g>
              );
            })}
          </svg>
          <div className="table-ring" aria-hidden="true">
            <ol>
              {t('stagesOnTable').map((x) => <li key={x}>{x}</li>)}
            </ol>
          </div>

          <Seat
            crown
            color={CHAIR_COLOR}
            icon={<RoleIcon role="chair" size={26} />}
            name={council.chairman.name}
            sub={t('chairman')}
            label={t('chairmanSeat', council.chairman.name)}
            selected={selected === 'chair'}
            skills={skillBadges(council.chairman.skills)}
            style={{ left: '50%', top: '12%', '--i': members.length }}
            onClick={() => setSelected('chair')}
          />

          {members.map((m, i) => (
            <Seat
              key={m.id}
              color={ROLE_META[m.role]?.color}
              icon={<RoleIcon role={m.role} />}
              name={m.name}
              sub={t(`role_${m.role}`)}
              label={`${m.name}, ${t(`role_${m.role}`)}`}
              selected={selected === m.id}
              dimmed={!m.enabled}
              skills={skillBadges(m.skills)}
              style={{ ...seatPosition(i, members.length + 1), '--i': i }}
              onClick={() => setSelected(m.id)}
            />
          ))}

          <Seat
            ghost
            color="#6f7893"
            icon={<span className="plus">+</span>}
            name={t('addSeat')}
            label={t('addSeat')}
            style={{ ...seatPosition(members.length, members.length + 1), '--i': members.length + 1 }}
            onClick={addSeat}
          />
        </div>

        {seat && (
          <aside className="seat-drawer" aria-label={t('seatDetails')}>
            {/* identity: who sits here, at a glance */}
            <header
              className="seat-id"
              style={{ '--seat': selected === 'chair' ? CHAIR_COLOR : ROLE_META[seat.role]?.color }}
            >
              <span className="drawer-orb">
                <RoleIcon role={selected === 'chair' ? 'chair' : seat.role} />
              </span>
              <div className="seat-id-text">
                <span className="seat-id-kicker">
                  {selected === 'chair' ? t('chairman') : t(`role_${seat.role}`)}
                </span>
                <input
                  className="seat-id-name"
                  value={seat.name}
                  aria-label={t('seatName')}
                  onChange={(e) => patchSeat({ name: e.target.value })}
                />
                <span className="seat-id-runs">
                  {providerLabel(seat.provider)} <span className="mono">{seat.model || '—'}</span>
                </span>
              </div>
            </header>

            <div className="segmented drawer-tabs" role="tablist">
              {(selected === 'chair' ? ['model', 'skills'] : ['model', 'role', 'skills']).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={drawerTab === tab}
                  className={drawerTab === tab ? 'active' : ''}
                  onClick={() => setDrawerTab(tab)}
                >
                  {t(`drawerTab_${tab}`)}
                  {tab === 'skills' && (seat.skills || []).length > 0 && (
                    <span className="count">{seat.skills.length}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="drawer-scroll">
              {drawerTab === 'model' && (
                <>
                  {selected === 'chair' && <p className="drawer-hint">{t('chairmanDesc')}</p>}
                  <section>
                    <h4>{t('provider')}</h4>
                    <ProviderList providers={providers} value={seat.provider} onChange={chooseProvider} />
                    {providers.find((p) => p.id === seat.provider)?.needs_login && (
                      <p className="drawer-hint">{t('geminiLoginHint')}</p>
                    )}
                  </section>
                  <section>
                    <h4>{t('model')}</h4>
                    <ModelList provider={seat.provider} providers={providers} value={seat.model} onChange={chooseModel} />
                    <TestButton seat={seat} />
                  </section>
                </>
              )}

              {drawerTab === 'role' && selected !== 'chair' && (
                <RoleList
                  value={seat.role}
                  onChange={(r) => patchSeat({ role: r })}
                  takenBy={members.reduce((acc, m) => {
                    // other active seats only: a seat sitting out does not occupy its role
                    if (m.id !== selected && m.enabled) (acc[m.role] = acc[m.role] || []).push(m.name);
                    return acc;
                  }, {})}
                />
              )}

              {drawerTab === 'skills' && (
                <SeatSkills
                  seat={seat}
                  installed={installedSkills}
                  onChange={(skills) => patchSeat({ skills })}
                  onOpenLibrary={() => setLibraryOpen(true)}
                />
              )}
            </div>

            {selected !== 'chair' && (
              <footer className="drawer-footer">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={seat.enabled}
                    onChange={(e) => patchSeat({ enabled: e.target.checked })}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  <span>{seat.enabled ? t('seatActiveShort') : t('seatInactiveShort')}</span>
                </label>
                <div className="drawer-footer-actions">
                  <button type="button" className="text-btn-dark" onClick={makeChair}>{t('makeChair')}</button>
                  <button
                    type="button"
                    className="text-btn-dark danger icon-only"
                    onClick={removeSeat}
                    title={t('removeSeat')}
                    aria-label={t('removeSeat')}
                  >
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                      <path d="M3 4h10M6.5 4V2.75h3V4M4.5 4l.6 9.25h5.8L11.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </footer>
            )}
          </aside>
        )}
      </div>

      {libraryOpen && (
        <SkillLibrary
          installed={installedSkills}
          onChanged={onLibraryChanged}
          onClose={() => setLibraryOpen(false)}
          seatName={seat?.name}
          seatSkills={seat?.skills || []}
          onAttach={(id) => patchSeat({ skills: [...(seat.skills || []), id] })}
        />
      )}
    </div>
  );
}
