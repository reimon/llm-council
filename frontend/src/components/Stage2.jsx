import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLang } from '../useLang';
import './Stage2.css';

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel) return text;

  let result = text;
  // Replace each "Response X" with the actual model name
  Object.entries(labelToModel).forEach(([label, model]) => {
    const modelShortName = model.split('/')[1] || model;
    result = result.replace(new RegExp(label, 'g'), `**${modelShortName}**`);
  });
  return result;
}

export default function Stage2({ rankings, labelToModel, aggregateRankings }) {
  const { t } = useLang();
  // Track the open tab by model, not position: answers arrive one by one and can shift positions
  const [activeModel, setActiveModel] = useState(null);

  if (!rankings || rankings.length === 0) {
    return null;
  }

  const activeTab = Math.max(0, rankings.findIndex((r) => r.model === activeModel));

  return (
    <div className="stage stage2">
      <header className="stage-head">
        <span className="stage-num">2</span>
        <h3 className="stage-title">{t('stage2Title')}</h3>
      </header>
      <p className="stage-description">
        {t('stage2Desc1')}{' '}
        {t('stage2Desc2a')}<strong>{t('stage2Bold')}</strong>{t('stage2Desc2b')}
      </p>

      {aggregateRankings && aggregateRankings.length > 0 && (
        <div className="aggregate-rankings">
          <h4>{t('overallStanding')}</h4>
          <ol className="aggregate-list">
            {aggregateRankings.map((agg, index) => {
              const n = aggregateRankings.length;
              const strength = n > 1 ? (n - agg.average_rank) / (n - 1) : 1;
              return (
                <li key={index} className="aggregate-item">
                  <span className="rank-position">{index + 1}</span>
                  <span className="rank-model">
                    {agg.model.split('/')[1] || agg.model}
                  </span>
                  <span className="rank-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(6, strength * 100)}%` }} />
                  </span>
                  <span className="rank-score">
                    {t('avg')} {agg.average_rank.toFixed(2)}
                    <span className="rank-count"> · {agg.rankings_count} {t('votes')}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="stage-description">{t('standingNote')}</p>
        </div>
      )}

      <h4>{t('individualEvaluations')}</h4>

      <div className="tabs">
        {rankings.map((rank, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveModel(rankings[index].model)}
          >
            {rank.model.split('/')[1] || rank.model}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="ranking-model">
          {rankings[activeTab].model}
        </div>
        <div className="ranking-content markdown-content">
          <ReactMarkdown>
            {deAnonymizeText(rankings[activeTab].ranking, labelToModel)}
          </ReactMarkdown>
        </div>

        {rankings[activeTab].parsed_ranking &&
         rankings[activeTab].parsed_ranking.length > 0 && (
          <div className="parsed-ranking">
            <strong>{t('parsedRanking')}</strong>
            <ol>
              {rankings[activeTab].parsed_ranking.map((label, i) => (
                <li key={i}>
                  {labelToModel && labelToModel[label]
                    ? labelToModel[label].split('/')[1] || labelToModel[label]
                    : label}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

    </div>
  );
}
