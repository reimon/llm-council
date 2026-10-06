import ReactMarkdown from 'react-markdown';
import './Stage3.css';

export default function Stage3({ finalResponse }) {
  if (!finalResponse) {
    return null;
  }

  return (
    <div className="stage stage3">
      <header className="stage-head">
        <span className="stage-num">3</span>
        <h3 className="stage-title">A resposta do conselho</h3>
      </header>
      <div className="final-response">
        <div className="chairman-label">
          Redigida pelo presidente, {finalResponse.model.split('/')[1] || finalResponse.model}
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
