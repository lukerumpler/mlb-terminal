import React, { useEffect, useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from './atoms.jsx';
import { fetchTeamNews } from '../api/feed.js';

function readableDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function newsStatusLabel(news) {
  if (news?.status === 'cached-fallback') return 'Cached verified feed';
  if (news?.status === 'cached') return 'Cached club feed';
  if (news?.status === 'unavailable') return 'Source unavailable';
  if (news?.status) return news?.source || 'Club feed';
  return 'Loading…';
}

export default function TeamNewsPanel({ team, accent = C.amber }) {
  const [news, setNews] = useState(null);
  const teamAbbr = String(team?.abbr || '').toUpperCase();
  const teamName = team?.name || 'Selected team';

  useEffect(() => {
    let alive = true;
    setNews(null);
    fetchTeamNews(teamAbbr, 8).then(result => {
      if (alive) setNews(result);
    }).catch(error => {
      if (alive) setNews({ status:'unavailable', freshness:'unavailable', items:[], error:error?.message || 'Team news request failed' });
    });
    return () => { alive = false; };
  }, [teamAbbr]);

  const items = useMemo(() => Array.isArray(news?.items) ? news.items.slice(0, 8) : [], [news]);
  const status = news ? newsStatusLabel(news) : 'Loading…';
  const hasFallback = news?.status === 'cached-fallback';

  return <section id="team-overview-news" role="tabpanel" aria-labelledby="team-overview-news-title" className="skip-team-news-workspace">
    <Panel title={`${teamName} News`} accent={accent} badge={status}>
      <div className="skip-team-news-intro">
        <div>
          <span>Club intelligence feed</span>
          <strong id="team-overview-news-title">{teamName} headlines</strong>
        </div>
        <p>{hasFallback ? 'Showing the last verified club-news snapshot while the provider recovers.' : 'Official club RSS is preferred; league and ESPN sources remain transparent fallbacks.'}</p>
      </div>
      {items.length ? <div className="skip-team-news-list">
        {items.map(item => <a key={item.id || item.url} className="skip-team-news-item" href={item.url} target="_blank" rel="noreferrer" aria-label={`Open sourced article: ${item.title || item.text}`}>
          <div className="skip-team-news-item-copy">
            <div className="skip-team-news-meta"><span>{item.sourceLabel || 'Source unavailable'}</span><time dateTime={item.isoDate || undefined}>{readableDate(item.isoDate)}</time></div>
            <strong>{item.title || item.text}</strong>
            {item.text && item.text !== item.title && <p>{item.text}</p>}
          </div>
          <span aria-hidden="true" style={px({ fontSize:15, color:accent, fontWeight:800 })}>↗</span>
        </a>)}
      </div> : <div className="skip-team-news-empty" role="status">
        <strong>{news ? 'No verified team-news articles are available.' : 'Loading sourced team news…'}</strong>
        <span>{news?.error || 'SKIP will not substitute generic or illustrative headlines for a missing club feed.'}</span>
      </div>}
      <div className="skip-team-news-provenance" style={sans({ color:C.text4 })}>Source state: {news?.freshness || 'loading'}{news?.retrievedAt ? ` · retrieved ${readableDate(news.retrievedAt)}` : ''}. Article links open at their original publisher.</div>
    </Panel>
  </section>;
}
