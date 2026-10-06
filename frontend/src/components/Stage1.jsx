import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLang } from '../i18n';
import { ROLE_META } from './CouncilRoom';
import './Stage1.css';

export default function Stage1({ responses }) {
  const { t } = useLang();
  // Track the open tab by model, not position: answers arrive one by one and can shift positions
  const [activeModel, setActiveModel] = useState(null);

  if (!responses || responses.length === 0) {
    return null;
  }

  const activeTab = Math.max(0, responses.findIndex((r) => r.model === activeModel));

  return (
    <div className="stage stage1">
      <header className="stage-head">
        <span className="stage-num">1</span>
        <h3 className="stage-title">{t('stage1Title')}</h3>
      </header>

      <div className="tabs">
        {responses.map((resp, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveModel(responses[index].model)}
          >
            {resp.role && resp.role !== 'generalist' && (
              <span
                className="tab-role-dot"
                style={{ background: ROLE_META[resp.role]?.color }}
                title={t(`role_${resp.role}`)}
              />
            )}
            {resp.model.split('/')[1] || resp.model}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="model-name">{responses[activeTab].model}</div>
        {responses[activeTab].role && responses[activeTab].role !== 'generalist' && (
          <p className="response-role" style={{ '--seat': ROLE_META[responses[activeTab].role]?.color }}>
            {t('answeredAs', t(`role_${responses[activeTab].role}`))}
          </p>
        )}
        <div className="response-text markdown-content">
          <ReactMarkdown>{responses[activeTab].response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
