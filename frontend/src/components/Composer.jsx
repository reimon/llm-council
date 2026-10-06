import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useLang } from '../i18n';

function attachmentLabel(a) {
  if (a.kind === 'link') return a.url.replace(/^https?:\/\//, '');
  if (a.kind === 'folder') return a.path.split('/').filter(Boolean).pop() || a.path;
  return a.name;
}

export function AttachmentChip({ attachment, onRemove }) {
  const { t } = useLang();
  const a = attachment;
  const thumb =
    a.kind === 'image' && a.id
      ? api.uploadUrl(a.id, a.name)
      : a.kind === 'video' && a.frames?.length
        ? api.uploadUrl(a.id, a.frames[0])
        : null;
  const kindLabel = { image: t('kindImage'), video: t('kindVideo'), folder: t('kindFolder'), link: t('kindLink') }[a.kind];

  return (
    <span
      className={`chip chip-${a.kind} ${a.status === 'error' ? 'chip-error' : ''}`}
      title={a.error || a.path || a.url || a.name}
    >
      {thumb ? (
        <img className="chip-thumb" src={thumb} alt="" />
      ) : (
        <span className="chip-kind">{a.status === 'uploading' ? <span className="spinner" /> : kindLabel}</span>
      )}
      <span className="chip-label">
        {a.status === 'error' ? `${attachmentLabel(a)}: ${a.error}` : attachmentLabel(a)}
      </span>
      {onRemove && (
        <button type="button" className="chip-remove" aria-label={t('remove', attachmentLabel(a))} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

function CouncilPicker({ value, onChange }) {
  const { t } = useLang();
  const [store, setStore] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    api.listCouncils().then((s) => {
      setStore(s);
      if (!value) {
        const def = s.councils.find((c) => c.id === s.default_id) || s.councils[0];
        onChange({ id: def.id, name: def.name });
      }
    }).catch(() => setStore(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!store || store.councils.length === 0) return null;

  return (
    <div className="council-picker" ref={ref}>
      <button
        type="button"
        className="council-picker-btn"
        aria-expanded={open}
        aria-label={t('councilForQuestion')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="brand-seats" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <span className="council-picker-name">{value?.name || '…'}</span>
        <span className="chevron open" aria-hidden="true" />
      </button>
      {open && (
        <div className="attach-menu council-menu" role="menu">
          <p className="council-menu-title">{t('councilForQuestion')}</p>
          {store.councils.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitemradio"
              aria-checked={value?.id === c.id}
              className={value?.id === c.id ? 'checked' : ''}
              onClick={() => {
                onChange({ id: c.id, name: c.name });
                setOpen(false);
              }}
            >
              <span className="council-menu-name">
                {c.name}
                {c.id === store.default_id && <span className="council-default">{t('defaultCouncil')}</span>}
              </span>
              <small>{t('seatsSummary', c.members.filter((m) => m.enabled !== false).length, c.chairman?.name)}</small>
              {c.description && <small>{c.description}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Composer({ onSend, disabled, placeholder }) {
  const { t } = useLang();
  const [council, setCouncil] = useState(null);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [entry, setEntry] = useState(null); // 'link' | 'folder' | null
  const [entryValue, setEntryValue] = useState('');
  const fileRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const update = (key, patch) =>
    setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const addFiles = (files) => {
    for (const file of files) {
      const key = crypto.randomUUID();
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      setAttachments((prev) => [...prev, { key, kind, name: file.name, status: 'uploading' }]);
      api
        .uploadFile(file)
        .then((saved) => update(key, { ...saved, status: 'ready' }))
        .catch((err) => update(key, { status: 'error', error: err.message }));
    }
  };

  const openEntry = (kind) => {
    setMenuOpen(false);
    setEntry(kind);
    setEntryValue('');
  };

  const commitEntry = () => {
    const value = entryValue.trim();
    if (!value) return;
    if (entry === 'link') {
      const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      setAttachments((prev) => [...prev, { key: crypto.randomUUID(), kind: 'link', url, status: 'ready' }]);
    } else {
      setAttachments((prev) => [...prev, { key: crypto.randomUUID(), kind: 'folder', path: value, status: 'ready' }]);
    }
    setEntry(null);
    setEntryValue('');
  };

  const pickFolder = async () => {
    const path = await api.pickFolder();
    if (path) {
      setAttachments((prev) => [...prev, { key: crypto.randomUUID(), kind: 'folder', path, status: 'ready' }]);
      setEntry(null);
    }
  };

  const uploading = attachments.some((a) => a.status === 'uploading');
  const ready = attachments.filter((a) => a.status === 'ready');
  const canSend = text.trim() && !disabled && !uploading;

  const submit = (e) => {
    e?.preventDefault();
    if (!canSend) return;
    // eslint-disable-next-line no-unused-vars
    onSend(text, ready.map(({ key, status, ...rest }) => rest), council);
    setText('');
    setAttachments([]);
  };

  return (
    <form
      className="composer"
      onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      {attachments.length > 0 && (
        <div className="chip-row">
          {attachments.map((a) => (
            <AttachmentChip
              key={a.key}
              attachment={a}
              onRemove={() => setAttachments((prev) => prev.filter((x) => x.key !== a.key))}
            />
          ))}
        </div>
      )}

      <textarea
        className="composer-input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={(e) => {
          const files = [...e.clipboardData.files].filter((f) => /^(image|video)\//.test(f.type));
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
        disabled={disabled}
        rows={2}
      />

      {entry && (
        <div className="entry-row">
          <input
            className="entry-input"
            autoFocus
            placeholder={entry === 'link' ? 'https://…' : t('folderPlaceholder')}
            value={entryValue}
            onChange={(e) => setEntryValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEntry();
              }
              if (e.key === 'Escape') setEntry(null);
            }}
          />
          {entry === 'folder' && (
            <button type="button" className="entry-btn" onClick={pickFolder}>
              {t('choose')}
            </button>
          )}
          <button type="button" className="entry-btn entry-add" onClick={commitEntry} disabled={!entryValue.trim()}>
            {entry === 'link' ? t('addLink') : t('addFolder')}
          </button>
          <button type="button" className="entry-btn" onClick={() => setEntry(null)}>
            {t('cancel')}
          </button>
        </div>
      )}

      <div className="composer-bar">
        <div className="attach-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="attach-btn"
            aria-label={t('addAttachment')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          {menuOpen && (
            <div className="attach-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  fileRef.current?.click();
                }}
              >
                {t('imageOrVideo')}
              </button>
              <button type="button" role="menuitem" onClick={() => openEntry('folder')}>
                {t('kindFolder')}
              </button>
              <button type="button" role="menuitem" onClick={() => openEntry('link')}>
                {t('kindLink')}
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <CouncilPicker value={council} onChange={setCouncil} />
        <span className="composer-hint">
          {uploading ? t('uploading') : t('enterHint')}
        </span>
        <button type="submit" className="send-button" disabled={!canSend}>
          {t('askCouncil')}
        </button>
      </div>
    </form>
  );
}
