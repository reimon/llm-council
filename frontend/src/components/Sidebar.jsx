import { useState, useEffect } from 'react';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
