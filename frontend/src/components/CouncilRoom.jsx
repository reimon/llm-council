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

function ModelPicker({ provider, providers, value, onChange }) {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const models = providers.find((p) => p.id === provider)?.models || [];
  const filtered = models.filter((m) => m.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="model-picker">
      <input
        className="drawer-input"
        placeholder={models.length ? t('searchModel') : t('typeModel')}
        value={models.length ? query : value}
        onChange={(e) => (models.length ? setQuery(e.target.value) : onChange(e.target.value))}
      />
      {models.length > 0 && (
        <div className="model-chips">
          {filtered.map((m) => (
            <button
              key={m}
              type="button"
              className={`model-chip ${m === value ? 'active' : ''}`}
              onClick={() => onChange(m)}
            >
              {m}
            </button>
          ))}
          {filtered.length === 0 && <span className="drawer-muted">{t('noModelMatch')}</span>}
        </div>
      )}
    </div>
  );
}

function ProviderTiles({ providers, value, onChange }) {
  const { t } = useLang();
  if (!providers.length) {
    return <p className="drawer-muted">{t('loadingProviders')}</p>;
  }
  return (
    <div className="provider-tiles">
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`provider-tile ${value === p.id ? 'active' : ''}`}
          disabled={!p.installed}
          onClick={() => onChange(p)}
        >
          <span className="provider-name">{p.label}</span>
          <span className="provider-meta">
            {p.installed ? t('modelsCount', p.models.length) : t('notInstalled')}
          </span>
        </button>
      ))}
    </div>
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
      <h4>{t('skills')}</h4>
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

export default function CouncilRoom({ onClose }) {
  const { t } = useLang();
  const [council, setCouncil] = useState(null);
  const [saved, setSaved] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState('chair');
  const [status, setStatus] = useState('');
  const [installedSkills, setInstalledSkills] = useState([]);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const refreshSkills = async () => {
    try {
      setInstalledSkills(await api.getInstalledSkills());
    } catch {
      setInstalledSkills([]);
    }
  };

  useEffect(() => {
    api.getCouncil().then((c) => {
      setCouncil(c);
      setSaved(JSON.stringify(c));
    });
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
    } catch (err) {
      setStatus(err.message);
    }
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
        <div>
          <h2>{t('chamberTitle')}</h2>
          <p>{t('chamberSubtitle', activeCount)}</p>
        </div>
        <div className="room-actions">
          {status && <span className="room-status">{status}</span>}
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

      <div className="room-body">
        <div className="chamber" role="group" aria-label={t('chamberTitle')}>
          <svg className="chamber-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[
              { key: 'chair', x: 50, y: 12, color: CHAIR_COLOR, opacity: 0.55 },
              ...members.map((m, i) => {
                const pos = seatPosition(i, members.length + 1);
                return {
                  key: m.id,
                  x: parseFloat(pos.left),
                  y: parseFloat(pos.top),
                  color: ROLE_META[m.role]?.color,
                  opacity: m.enabled ? 0.4 : 0.1,
                };
              }),
            ].map((l) => {
              const [x1, y1, x2, y2] = tableToSeat(l.x, l.y);
              return (
                <line
                  key={l.key}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={l.color}
                  strokeOpacity={l.opacity}
                  strokeWidth="0.25"
                />
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
            style={{ left: '50%', top: '12%' }}
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
              style={seatPosition(i, members.length + 1)}
              onClick={() => setSelected(m.id)}
            />
          ))}

          <Seat
            ghost
            color="#6f7893"
            icon={<span className="plus">+</span>}
            name={t('addSeat')}
            label={t('addSeat')}
            style={seatPosition(members.length, members.length + 1)}
            onClick={addSeat}
          />
        </div>

        {seat && (
          <aside className="seat-drawer" aria-label={t('seatDetails')}>
            {selected === 'chair' ? (
              <>
                <div className="drawer-title" style={{ '--seat': CHAIR_COLOR }}>
                  <span className="drawer-orb"><RoleIcon role="chair" /></span>
                  <div>
                    <h3>{t('chairman')}</h3>
                    <p>{t('chairmanDesc')}</p>
                  </div>
                </div>
                <ul className="role-traits">
                  {t('chairmanTraits').map((x) => <li key={x}>{x}</li>)}
                </ul>
              </>
            ) : (
              <>
                <div className="drawer-title" style={{ '--seat': ROLE_META[seat.role]?.color }}>
                  <span className="drawer-orb"><RoleIcon role={seat.role} /></span>
                  <div>
                    <h3>{t(`role_${seat.role}`)}</h3>
                    <p>{t(`roleDesc_${seat.role}`)}</p>
                  </div>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={seat.enabled}
                    onChange={(e) => patchSeat({ enabled: e.target.checked })}
                  />
                  <span>{seat.enabled ? t('seatActive') : t('seatInactive')}</span>
                </label>
              </>
            )}

            <section>
              <h4>{t('seatName')}</h4>
              <input
                className="drawer-input"
                value={seat.name}
                onChange={(e) => patchSeat({ name: e.target.value })}
              />
            </section>

            <section>
              <h4>{t('provider')}</h4>
              <ProviderTiles providers={providers} value={seat.provider} onChange={chooseProvider} />
              {providers.length > 0 && !providers.some((p) => p.id === seat.provider) && (
                <p className="drawer-muted">{providerLabel(seat.provider)}</p>
              )}
            </section>

            <section>
              <h4>
                {t('model')} <span className="drawer-muted">{seat.model}</span>
              </h4>
              <ModelPicker
                provider={seat.provider}
                providers={providers}
                value={seat.model}
                onChange={chooseModel}
              />
              <TestButton seat={seat} />
            </section>

            <SeatSkills
              seat={seat}
              installed={installedSkills}
              onChange={(skills) => patchSeat({ skills })}
              onOpenLibrary={() => setLibraryOpen(true)}
            />

            {selected !== 'chair' && (
              <>
                <section>
                  <h4>{t('roleHeading')}</h4>
                  <div className="role-grid">
                    {ROLE_IDS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`role-card ${seat.role === r ? 'active' : ''}`}
                        style={{ '--seat': ROLE_META[r].color }}
                        onClick={() => patchSeat({ role: r })}
                      >
                        <span className="role-card-icon"><RoleIcon role={r} size={18} /></span>
                        <span className="role-card-name">{t(`role_${r}`)}</span>
                        <span className="role-card-desc">{t(`roleShort_${r}`)}</span>
                      </button>
                    ))}
                  </div>
                  <ul className="role-traits">
                    {t(`roleTraits_${seat.role}`).map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </section>
                <div className="drawer-footer">
                  <button type="button" className="drawer-btn" onClick={makeChair}>
                    {t('makeChair')}
                  </button>
                  <button type="button" className="drawer-btn drawer-danger" onClick={removeSeat}>
                    {t('removeSeat')}
                  </button>
                </div>
              </>
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
