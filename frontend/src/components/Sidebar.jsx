import { useState } from 'react';
import { api } from '../api';
import './Sidebar.css';

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3 4h10M6.5 4V2.75h3V4M4.5 4l.6 9.25h5.8L11.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M1.75 4.25c0-.69.56-1.25 1.25-1.25h3.1l1.4 1.5H13c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function ConversationItem({ conv, active, onSelect, onDelete }) {
  return (
    <div
      className={`conversation-item ${active ? 'active' : ''}`}
      onClick={() => onSelect(conv.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(conv.id)}
      role="button"
      tabIndex={0}
    >
      <div className="conversation-title">{conv.title || 'Pergunta sem título'}</div>
      <div className="conversation-meta">
        {conv.message_count === 0 ? 'Ainda não enviada' : 'Respondida'}
      </div>
      <button
        type="button"
        className="icon-btn delete-conversation-btn"
        aria-label={`Apagar ${conv.title || 'conversa'}`}
        title="Apagar conversa"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function NewProjectForm({ onCreate, onCancel }) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const picked = await api.pickFolder();
    if (picked) {
      setPath(picked);
      if (!name) setName(picked.split('/').filter(Boolean).pop() || '');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!path.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(name, path);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="new-project-form" onSubmit={submit}>
      <label className="field-label" htmlFor="project-path">Pasta do projeto</label>
      <div className="path-row">
        <input
          id="project-path"
          className="field-input"
          placeholder="~/devpro/meu-app"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          autoFocus
        />
        <button type="button" className="ghost-btn" onClick={pick}>
          Escolher…
        </button>
      </div>
      <label className="field-label" htmlFor="project-name">Nome</label>
      <input
        id="project-name"
        className="field-input"
        placeholder="Usa o nome da pasta"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <p className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="primary-btn" disabled={!path.trim() || busy}>
          Criar projeto
        </button>
      </div>
    </form>
  );
}

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  projects,
  onCreateProject,
  onDeleteProject,
}) {
  const [showForm, setShowForm] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  const general = conversations.filter((c) => !c.project_id);
  const toggle = (id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderList = (items) =>
    items.map((conv) => (
      <ConversationItem
        key={conv.id}
        conv={conv}
        active={conv.id === currentConversationId}
        onSelect={onSelectConversation}
        onDelete={onDeleteConversation}
      />
    ));

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="brand">
          <span className="brand-seats" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          LLM Council
        </h1>
        <button className="new-conversation-btn" onClick={() => onNewConversation(null)}>
          Nova pergunta
        </button>
      </div>

      <div className="conversation-list">
        <div className="group-heading">
          <span>Projetos</span>
          {!showForm && (
            <button type="button" className="text-btn" onClick={() => setShowForm(true)}>
              Adicionar
            </button>
          )}
        </div>

        {showForm && (
          <NewProjectForm
            onCancel={() => setShowForm(false)}
            onCreate={async (name, path) => {
              await onCreateProject(name, path);
              setShowForm(false);
            }}
          />
        )}

        {projects.length === 0 && !showForm && (
          <p className="no-conversations">
            Adicione a pasta de um projeto para os modelos lerem o código antes de responder.
          </p>
        )}

        {projects.map((project) => {
          const chats = conversations.filter((c) => c.project_id === project.id);
          const isOpen = !collapsed[project.id];
          return (
            <section key={project.id} className="project-group">
              <div className="project-row" title={project.path}>
                <button
                  type="button"
                  className="project-toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggle(project.id)}
                >
                  <span className={`chevron ${isOpen ? 'open' : ''}`} aria-hidden="true" />
                  <FolderIcon />
                  <span className="project-name">{project.name}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn project-new-chat"
                  aria-label={`Novo chat em ${project.name}`}
                  title="Novo chat neste projeto"
                  onClick={() => onNewConversation(project.id)}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-btn project-delete"
                  aria-label={`Remover projeto ${project.name}`}
                  title="Remover projeto"
                  onClick={() => onDeleteProject(project.id)}
                >
                  <TrashIcon />
                </button>
              </div>
              {isOpen && (
                <div className="project-chats">
                  {chats.length === 0 ? (
                    <button
                      type="button"
                      className="empty-project"
                      onClick={() => onNewConversation(project.id)}
                    >
                      Começar um chat neste projeto
                    </button>
                  ) : (
                    renderList(chats)
                  )}
                </div>
              )}
            </section>
          );
        })}

        <div className="group-heading group-heading-general">
          <span>Perguntas gerais</span>
        </div>
        {general.length === 0 ? (
          <p className="no-conversations">Suas perguntas aparecem aqui.</p>
        ) : (
          renderList(general)
        )}
      </div>
    </div>
  );
}
