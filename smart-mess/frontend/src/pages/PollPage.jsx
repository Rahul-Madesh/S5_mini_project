import React, { useState, useEffect } from 'react';
import MealIntentNotice from '../components/MealIntentNotice';

export default function PollPage() {
  const [pollData, setPollData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchPoll = async () => {
    try {
      const res = await fetch('/api/polls/active');
      if (res.ok) {
        const data = await res.json();
        setPollData(data);
      }
    } catch (err) {
      console.error('Failed to fetch active poll:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPoll();

    // Live polling: refresh results every 5 seconds
    const interval = setInterval(() => {
      fetchPoll();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
        Loading active mess poll...
      </div>
    );
  }

  const { poll, userVote, results } = pollData || {};

  return (
    <div>
      {/* In-app Meal Intention Notification Banner */}
      <MealIntentNotice onAnswerUpdated={fetchPoll} />

      {!poll ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>No Active Menu Poll</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            There is currently no active menu preference poll for upcoming meals. Please check back later.
          </p>
        </div>
      ) : (
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <span className="badge-tag" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                  {poll.meal_type.toUpperCase()} PREFERENCE POLL
                </span>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                  {poll.title}
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  {poll.description}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span className={`badge-tag ${poll.is_closed ? 'admin' : ''}`}>
                  {poll.is_closed ? 'Poll Closed' : 'Voting Live (Auto-refreshes every 5s)'}
                </span>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Total Votes Cast: <strong style={{ color: 'var(--text-main)' }}>{results?.totalVotes || 0}</strong>
                </div>
              </div>
            </div>

            {errorMsg && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{errorMsg}</div>}
            {successMsg && <div className="alert alert-success" style={{ marginTop: '1rem' }}>{successMsg}</div>}

            {userVote?.voted && (
              <div className="alert alert-info" style={{ marginTop: '1rem' }}>
                <span>✓ You voted for: <strong>{userVote.menu_item_name}</strong></span>
              </div>
            )}

            {/* Menu Options Grid (Exactly 4 Options) */}
            <div className="menu-options-grid">
              {results?.items?.map((item) => {
                const isMyVote = userVote?.menu_item_id === item.id;
                const isDisabled = voting || userVote?.voted || poll.is_closed;

                return (
                  <div
                    key={item.id}
                    className={`menu-card ${isMyVote ? 'selected' : ''}`}
                    id={`menu-item-${item.id}`}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="badge-tag" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                          Option {item.display_order}
                        </span>
                        {isMyVote && (
                          <span className="badge-tag" style={{ background: 'var(--primary)', color: '#0f172a' }}>
                            Your Choice
                          </span>
                        )}
                      </div>
                      <h3 className="menu-card-title" style={{ marginTop: '0.5rem' }}>{item.name}</h3>
                      <p className="menu-card-desc">{item.description}</p>
                    </div>

                    <div>
                      {/* Live Vote Count & Percentage Bar */}
                      <div className="vote-progress-wrapper">
                        <div className="vote-progress-meta">
                          <span>{item.vote_count} votes</span>
                          <strong>{item.percentage}%</strong>
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
                        className={`btn ${isMyVote ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ width: '100%', marginTop: '1rem' }}
                        id={`vote-btn-${item.id}`}
                      >
                        {isMyVote ? 'Voted' : userVote?.voted ? 'Voting Disabled' : poll.is_closed ? 'Poll Closed' : 'Vote For This'}
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
