import React, { useState, useEffect, useRef } from 'react';
import MealIntentNotice from '../components/MealIntentNotice';
import { useAuth } from '../context/AuthContext';
import BoysMessMenu from '../components/BoysMessMenu';

export default function PollPage() {
  const { user, loading: authLoading } = useAuth();
  const [pollData, setPollData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Home hostellers / internal residents
  const isInternal = user?.student_type === 'internal' || user?.student_type === 'home';

  // Ref to track active poll ID and date across background refresh cycles
  const activePollKeyRef = useRef(null);

  const fetchPoll = async () => {
    if (isInternal) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/polls/active');
      if (res.ok) {
        const data = await res.json();

        // Detect if active poll transitioned to a new poll ID or date
        const newPollKey = data?.poll ? `${data.poll.id}_${data.poll.meal_date}` : null;
        if (activePollKeyRef.current !== null && activePollKeyRef.current !== newPollKey) {
          // Poll switched: clear previous poll's success/error messages so they don't linger
          setSuccessMsg(null);
          setErrorMsg(null);
        }
        activePollKeyRef.current = newPollKey;

        setPollData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setErrorMsg('Session expired. Please log in again.');
        } else {
          setErrorMsg(errData.details || errData.error || 'Unable to load current active poll');
        }
      }
    } catch (err) {
      console.error('Failed to fetch active poll:', err);
      setErrorMsg('Network error while fetching poll updates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isInternal) {
      setLoading(false);
      return;
    }

    fetchPoll();

    // Live polling: refresh results every 5 seconds for external students
    const interval = setInterval(() => {
      fetchPoll();
    }, 5000);

    return () => clearInterval(interval);
  }, [isInternal]);

  const handleVote = async (menuItemId) => {
    if (!pollData?.poll?.id) return;
    setVoting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/polls/${pollData.poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: menuItemId })
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.details || data.error || 'Failed to submit vote');
      } else {
        setSuccessMsg(`Vote recorded! You voted for: ${data.choice}`);
        await fetchPoll();
      }
    } catch (err) {
      setErrorMsg('Network error while recording vote');
    } finally {
      setVoting(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
        <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--border-medium)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.75rem' }} />
        <div>Authenticating session...</div>
      </div>
    );
  }

  // Internal students: render MealIntentNotice at top, followed by official boys mess menu, no voting UI
  if (isInternal) {
    return (
      <div>
        <MealIntentNotice onAnswerUpdated={fetchPoll} />
        <BoysMessMenu />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
        <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--border-medium)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.75rem' }} />
        <div>Loading active mess poll...</div>
      </div>
    );
  }

  const { poll, userVote, results } = pollData || {};

  return (
    <div>
      {!poll ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', background: 'var(--surface-raised)', marginBottom: '1rem', color: 'var(--accent-saffron)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.4rem' }}>No Active Menu Poll</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto', fontSize: '0.95rem' }}>
            There is currently no active menu preference poll scheduled for upcoming meals. Daily lunch polls open each morning.
          </p>
        </div>
      ) : (
        <div>
          <div className="card">
            <div className="poll-header-strip">
              <div>
                <span className="badge-tag" style={{ marginBottom: '0.5rem', display: 'inline-flex' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {poll.meal_type.toUpperCase()} PREFERENCE POLL
                </span>
                <h1 className="poll-heading">
                  {poll.title}
                </h1>
                <p className="poll-description">
                  {poll.description}
                </p>
              </div>

              <div className="poll-telemetry">
                <span className={`badge-tag service-status ${poll.is_closed ? 'closed' : ''}`}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: poll.is_closed ? 'var(--danger)' : 'var(--primary)',
                    display: 'inline-block'
                  }} />
                  {poll.is_closed ? 'Poll Closed' : 'Voting Live · Auto-sync (5s)'}
                </span>
                <div className="participation-counter">
                  Total Votes Cast: <strong>{results?.totalVotes || 0}</strong>
                </div>
              </div>
            </div>

            {errorMsg && <div className="alert alert-error" style={{ marginTop: '1.25rem' }}>{errorMsg}</div>}
            {successMsg && <div className="alert alert-success" style={{ marginTop: '1.25rem' }}>{successMsg}</div>}

            {userVote?.voted && (
              <div className="alert alert-info" style={{ marginTop: '1.25rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>You voted for: <strong>{userVote.menu_item_name}</strong></span>
              </div>
            )}

            {/* Menu Options Grid (Exactly 4 Options) */}
            <div className="menu-options-grid">
              {results?.items?.map((item) => {
                const isMyVote = userVote?.menu_item_id === item.id;
                const isDisabled = voting || userVote?.voted || poll.is_closed;

                let btnClass = 'btn btn-primary';
                let btnLabel = 'Vote For This';
                if (isMyVote) {
                  btnClass = 'btn btn-voted';
                  btnLabel = 'Voted';
                } else if (userVote?.voted) {
                  btnClass = 'btn btn-disabled';
                  btnLabel = 'Voting Disabled';
                } else if (poll.is_closed) {
                  btnClass = 'btn btn-disabled';
                  btnLabel = 'Poll Closed';
                }

                return (
                  <div
                    key={item.id}
                    className={`menu-card ${isMyVote ? 'selected' : ''}`}
                    id={`menu-item-${item.id}`}
                  >
                    <div>
                      <div className="menu-card-top">
                        <span className="option-number">
                          OPTION #0{item.display_order}
                        </span>
                        {isMyVote && (
                          <span className="selection-tag">
                            Your Choice
                          </span>
                        )}
                      </div>
                      <h3 className="menu-card-title">{item.name}</h3>
                      <p className="menu-card-desc">{item.description}</p>
                    </div>

                    <div>
                      {/* Live Vote Count & Percentage Bar */}
                      <div className="vote-progress-wrapper">
                        <div className="vote-progress-meta">
                          <span className="vote-count-text">{item.vote_count} votes</span>
                          <span className="vote-percentage-text">{item.percentage}%</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleVote(item.id)}
                        disabled={isDisabled}
                        className={btnClass}
                        style={{ width: '100%', marginTop: '1.15rem' }}
                        id={`vote-btn-${item.id}`}
                      >
                        {btnLabel}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Honesty Rule Disclaimer */}
            <div className="disclaimer-banner">
              <strong>Notice:</strong> Menu votes show preferences among students who chose to participate in this poll. Votes alone do not predict exact consumption or total meal preparation quantities.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
