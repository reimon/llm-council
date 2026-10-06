import ReactMarkdown from 'react-markdown';
import { useLang } from '../i18n';
import './Stage3.css';

export default function Stage3({ finalResponse }) {
  const { t } = useLang();
  if (!finalResponse) {
    return null;
  }

  return (
    <div className="stage stage3">
      <header className="stage-head">
        <span className="stage-num">3</span>
        <h3 className="stage-title">{t('stage3Title')}</h3>
      </header>
      <div className="final-response">
        <div className="chairman-label">
          {t('writtenByChair', finalResponse.model.split('/')[1] || finalResponse.model)}
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
