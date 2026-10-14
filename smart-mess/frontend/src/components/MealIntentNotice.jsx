import React, { useState, useEffect } from 'react';

export default function MealIntentNotice({ onAnswerUpdated }) {
  const [noticeData, setNoticeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchIntentStatus = async () => {
    try {
      const res = await fetch('/api/notifications/meal-intent');
      if (res.ok) {
        const data = await res.json();
        setNoticeData(data);
      }
    } catch (err) {
      console.error('Failed to fetch meal intent notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntentStatus();
  }, []);

  const handleResponse = async (willEat) => {
    if (!noticeData?.meal) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/meal-intent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealDate: noticeData.meal.date,
          mealType: noticeData.meal.type,
          willEat: Boolean(willEat)
        })
      });

      const result = await res.json();

      if (!res.ok) {
        setErrorMsg(result.details || result.error || 'Failed to submit intention');
      } else {
        setSuccessMsg(`Your response ("${willEat ? "Yes, I'll eat" : "No, I won't"}") has been recorded.`);
        setIsEditing(false);
        // Refresh intent data
        await fetchIntentStatus();
        if (onAnswerUpdated) onAnswerUpdated();
      }
    } catch (err) {
      setErrorMsg('Network error while recording meal response');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!noticeData || !noticeData.meal) return null;

  // If dismissed without answering in this session, hide it
  if (dismissed) return null;

  const hasAnswered = noticeData.answer !== null;
  const isCutoffLocked = !noticeData.canChange;

  // Format date nicely
  const mealDateFormatted = new Date(`${noticeData.meal.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="intent-notice-banner" id="meal-intent-banner">
      <div className="intent-header">
        <div className="intent-title">
          <span>🔔</span>
          <span>Upcoming Meal Attendance Notification</span>
        </div>
        {!hasAnswered && (
          <button
            onClick={() => setDismissed(true)}
            className="intent-dismiss-btn"
            title="Dismiss for now (reappears on next refresh)"
            id="dismiss-intent-notice"
          >
            &times;
          </button>
        )}
      </div>

      <p style={{ fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>
        <strong>Will you eat mess food for {noticeData.meal.type.toUpperCase()} on {mealDateFormatted}?</strong>
      </p>

      {errorMsg && <div className="alert alert-error" style={{ margin: '0.5rem 0' }}>{errorMsg}</div>}
      {successMsg && <div className="alert alert-success" style={{ margin: '0.5rem 0' }}>{successMsg}</div>}

      {!hasAnswered || isEditing ? (
        <div>
          <div className="intent-actions">
            <button
              onClick={() => handleResponse(true)}
              disabled={submitting || isCutoffLocked}
              className="btn btn-primary"
              id="intent-yes-btn"
            >
              {submitting ? 'Submitting...' : "Yes, I'll eat"}
            </button>
            <button
              onClick={() => handleResponse(false)}
              disabled={submitting || isCutoffLocked}
              className="btn btn-secondary"
              id="intent-no-btn"
            >
              {submitting ? 'Submitting...' : "No, I won't"}
            </button>
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="btn btn-secondary"
                style={{ opacity: 0.8 }}
              >
                Cancel
              </button>
            )}
          </div>
          <p className="form-hint" style={{ marginTop: '0.5rem' }}>
            Note: You can change your choice until the cutoff time. After cutoff, responses lock for kitchen preparation.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your current answer: </span>
            <strong style={{ color: noticeData.answer ? 'var(--primary)' : 'var(--danger)', fontSize: '0.95rem' }}>
              {noticeData.answer ? "Yes, I'll eat" : "No, I won't eat"}
            </strong>
          </div>

          <div>
            {!isCutoffLocked ? (
              <button
                onClick={() => setIsEditing(true)}
                className="btn btn-secondary btn-sm"
                id="change-intent-btn"
              >
                Change answer
              </button>
            ) : (
              <span className="badge-tag" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
                Cutoff passed (Answer locked)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
