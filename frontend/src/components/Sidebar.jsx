import { useState, useEffect } from 'react';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="brand">
          <span className="brand-seats" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          LLM Council
        </h1>
        <button className="new-conversation-btn" onClick={onNewConversation}>
          Nova pergunta
        </button>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="no-conversations">Suas perguntas aparecem aqui.</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${
                conv.id === currentConversationId ? 'active' : ''
              }`}
              onClick={() => onSelectConversation(conv.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectConversation(conv.id)}
              role="button"
              tabIndex={0}
            >
              <div className="conversation-title">
                {conv.title || 'Pergunta sem título'}
              </div>
              <div className="conversation-meta">
                {conv.message_count === 0 ? 'Ainda não enviada' : 'Respondida'}
              </div>
              <button
                type="button"
                className="delete-conversation-btn"
                aria-label={`Apagar ${conv.title || 'conversa'}`}
                title="Apagar conversa"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conv.id);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M3 4h10M6.5 4V2.75h3V4M4.5 4l.6 9.25h5.8L11.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
