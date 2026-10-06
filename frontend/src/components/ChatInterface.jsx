import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import Composer, { AttachmentChip } from './Composer';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
}) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>Leve uma pergunta ao conselho</h2>
          <p>Vários modelos respondem, avaliam uns aos outros de forma anônima e um presidente redige a resposta final.</p>
          <p className="empty-hint">Comece em “Nova pergunta”, à esquerda.</p>
        </div>
      </div>
    );
  }

  const project = conversation.project;

  return (
    <div className="chat-interface">
      {project && (
        <div className="project-banner" title={project.path}>
          <span className="project-banner-name">{project.name}</span>
          <span className="project-banner-path">{project.path}</span>
        </div>
      )}
      <div className="messages-container">
        {conversation.messages.length === 0 ? (
          <div className="empty-state">
            <h2>
              {project ? `O que você quer saber sobre ${project.name}?` : 'Sobre o que o conselho deve opinar?'}
            </h2>
            {project ? (
              <p>
                Cada modelo vai ler os arquivos do projeto antes de responder, sem alterar nada.
                Com código para explorar, a deliberação pode levar vários minutos.
              </p>
            ) : (
              <p>Faça uma pergunta. A deliberação completa leva um ou dois minutos.</p>
            )}
          </div>
        ) : (
          conversation.messages.map((msg, index) => (
            <div key={index} className="message-group">
              {msg.role === 'user' ? (
                <div className="user-message">
                  <div className="message-label">Sua pergunta</div>
                  <div className="message-content">
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  {msg.attachments?.length > 0 && (
                    <div className="chip-row chip-row-sent">
                      {msg.attachments.map((att, i) => (
                        <AttachmentChip key={i} attachment={att} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="assistant-message">
                  
                  {/* Stage 1 */}
                  {msg.loading?.stage1 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>Os modelos estão escrevendo suas respostas…</span>
                    </div>
                  )}
                  {msg.stage1 && <Stage1 responses={msg.stage1} />}

                  {/* Stage 2 */}
                  {msg.loading?.stage2 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>Os modelos estão avaliando uns aos outros…</span>
                    </div>
                  )}
                  {msg.stage2 && (
                    <Stage2
                      rankings={msg.stage2}
                      labelToModel={msg.metadata?.label_to_model}
                      aggregateRankings={msg.metadata?.aggregate_rankings}
                    />
                  )}

                  {/* Stage 3 */}
                  {msg.loading?.stage3 && (
                    <div className="stage-loading">
                      <div className="spinner"></div>
                      <span>O presidente está redigindo a resposta final…</span>
                    </div>
                  )}
                  {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Reunindo o conselho…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {conversation.messages.length === 0 && (
        <Composer
          onSend={onSendMessage}
          disabled={isLoading}
          placeholder={
            project
              ? `Pergunte sobre ${project.name}. Use + para anexar imagens, vídeos, pastas ou links.`
              : 'Escreva sua pergunta. Use + para anexar imagens, vídeos, pastas ou links.'
          }
        />
      )}
    </div>
  );
}
