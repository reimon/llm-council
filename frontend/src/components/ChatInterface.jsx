import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import CouncilDeliberation from './CouncilDeliberation';
import Composer, { AttachmentChip } from './Composer';
import { useLang } from '../i18n';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
}) {
  const { t } = useLang();
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
          <h2>{t('welcomeTitle')}</h2>
          <p>{t('welcomeBody')}</p>
          <p className="empty-hint">{t('welcomeHint')}</p>
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
              {project ? t('askAbout', project.name) : t('askGeneral')}
            </h2>
            {project ? (
              <p>{t('projectNote')}</p>
            ) : (
              <p>{t('generalNote')}</p>
            )}
          </div>
        ) : (
          conversation.messages.map((msg, index) => (
            <div key={index} className="message-group">
              {msg.role === 'user' ? (
                <div className="user-message">
                  <div className="message-label">{t('yourQuestion')}</div>
                  <div className="message-content">
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  {msg.council?.name && (
                    <div className="message-council">
                      <span className="brand-seats" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                      {t('askedCouncil', msg.council.name)}
                    </div>
                  )}
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
                  {/* Council Deliberation 3D HUD & Progress */}
                  {(msg.loading?.stage1 || msg.loading?.stage2 || msg.loading?.stage3 || msg.deliberation || msg.stage1) && (
                    <CouncilDeliberation
                      deliberation={msg.deliberation || (msg.stage1 ? {
                        activeStage: 'done',
                        members: msg.stage1.map((s) => ({ name: s.model, role: s.role || 'generalist' })),
                        chairman: msg.stage3 ? { name: msg.stage3.model } : null,
                        models: Object.fromEntries(msg.stage1.map((s) => [s.model, { status: 'completed', role: s.role }])),
                      } : null)}
                      loading={msg.loading}
                      isComplete={!msg.loading?.stage1 && !msg.loading?.stage2 && !msg.loading?.stage3 && !!msg.stage3}
                      project={project}
                    />
                  )}

                  {/* Stage 1 */}
                  {msg.stage1 && <Stage1 responses={msg.stage1} />}

                  {/* Stage 2 */}
                  {msg.stage2 && (
                    <Stage2
                      rankings={msg.stage2}
                      labelToModel={msg.metadata?.label_to_model}
                      aggregateRankings={msg.metadata?.aggregate_rankings}
                    />
                  )}

                  {/* Stage 3 */}
                  {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && !conversation.messages.some((m) => m.role === 'assistant' && (m.loading?.stage1 || m.loading?.stage2 || m.loading?.stage3 || m.deliberation)) && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>{t('convening')}</span>
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
              ? t('placeholderProject', project.name)
              : t('placeholderGeneral')
          }
        />
      )}
    </div>
  );
}
