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
        setSuccessMsg(`Your attendance plan ("${willEat ? "Attending" : "Not attending"}") has been recorded.`);
        setIsEditing(false);
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
  if (dismissed) return null;

  const hasAnswered = noticeData.answer !== null;
  const isCutoffLocked = !noticeData.canChange;

  const mealDateFormatted = new Date(`${noticeData.meal.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="intent-notice-card" id="meal-intent-banner">
      <div className="intent-header">
        <div className="intent-badge-group">
          <span className="badge-tag" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            Official Dining Notice
          </span>
          <span className="badge-tag">
            {noticeData.meal.type} Service
          </span>
        </div>
        {!hasAnswered && (
          <button
            onClick={() => setDismissed(true)}
            className="intent-dismiss-btn"
            title="Dismiss for now"
            id="dismiss-intent-notice"
            aria-label="Dismiss notice"
          >
            &times;
          </button>
        )}
      </div>

      <h3 className="intent-prompt">
        Will you attend mess dining for {noticeData.meal.type} on {mealDateFormatted}?
      </h3>
      <p className="intent-timing-info">
        Kitchen preparation relies on accurate resident headcounts to prevent food wastage.
      </p>

      {errorMsg && <div className="alert alert-error" style={{ margin: '0.75rem 0' }}>{errorMsg}</div>}
      {successMsg && <div className="alert alert-success" style={{ margin: '0.75rem 0' }}>{successMsg}</div>}

      {!hasAnswered || isEditing ? (
        <div>
          <div className="intent-actions">
            <button
              onClick={() => handleResponse(true)}
              disabled={submitting || isCutoffLocked}
              className="btn btn-primary"
              id="intent-yes-btn"
            >
              {submitting ? 'Recording...' : "Yes, I will eat"}
            </button>
            <button
              onClick={() => handleResponse(false)}
              disabled={submitting || isCutoffLocked}
              className="btn btn-secondary"
              id="intent-no-btn"
            >
              {submitting ? 'Recording...' : "No, skip this meal"}
            </button>
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="form-hint" style={{ marginTop: '0.65rem' }}>
            Note: You may adjust your plan anytime prior to the kitchen cutoff deadline.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your recorded plan: </span>
            <strong style={{ color: noticeData.answer ? 'var(--primary)' : 'var(--danger)', fontSize: '0.95rem' }}>
              {noticeData.answer ? "Yes, Attending" : "No, Skipping Meal"}
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
              <span className="badge-tag" style={{ backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}>
                Cutoff passed (Locked)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
