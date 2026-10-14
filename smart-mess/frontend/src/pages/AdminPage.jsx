import React, { useState, useEffect } from 'react';

export default function AdminPage() {
  const [polls, setPolls] = useState([]);
  const [selectedPollId, setSelectedPollId] = useState(null);
  const [pollDetails, setPollDetails] = useState(null);
  const [mealIntentData, setMealIntentData] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedMealType, setSelectedMealType] = useState('lunch');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Fetch admin polls list
  const fetchPolls = async () => {
    try {
      const res = await fetch('/api/admin/polls');
      if (res.ok) {
        const data = await res.json();
        setPolls(data.polls);
        if (data.polls.length > 0 && !selectedPollId) {
          setSelectedPollId(data.polls[0].id);
          setSelectedDate(data.polls[0].meal_date);
          setSelectedMealType(data.polls[0].meal_type);
        }
      }
    } catch (err) {
      console.error('Failed to load admin polls:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch details for selected poll
  const fetchPollDetails = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/polls/${id}/results`);
      if (res.ok) {
        const data = await res.json();
        setPollDetails(data);
      }
    } catch (err) {
      console.error('Failed to load poll details:', err);
    }
  };

  // Fetch meal intention analytics
  const fetchMealIntent = async (date, type) => {
    if (!date || !type) return;
    try {
      const res = await fetch(`/api/admin/meal-intent?date=${date}&type=${type}`);
      if (res.ok) {
        const data = await res.json();
        setMealIntentData(data);
      }
    } catch (err) {
      console.error('Failed to load meal intent data:', err);
    }
  };

  useEffect(() => {
    fetchPolls();
  }, []);

  useEffect(() => {
    if (selectedPollId) {
      fetchPollDetails(selectedPollId);
    }
  }, [selectedPollId]);

  useEffect(() => {
    if (selectedDate && selectedMealType) {
      fetchMealIntent(selectedDate, selectedMealType);
    }
  }, [selectedDate, selectedMealType]);

  // Open or close poll
  const togglePollStatus = async (pollId, currentStatus) => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus })
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.details || data.error || 'Failed to update poll status');
      } else {
        setSuccessMsg(data.message);
        await fetchPolls();
        await fetchPollDetails(pollId);
      }
    } catch (err) {
      setErrorMsg('Network error updating poll');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
        Loading Admin Dashboard...
      </div>
    );
  }

  const currentPoll = pollDetails?.poll;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Kitchen Administration Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Monitor preference polls, intention reports, and manage poll statuses
          </p>
        </div>

        {currentPoll && (
          <div>
            <button
              onClick={() => togglePollStatus(currentPoll.id, currentPoll.is_active)}
              disabled={actionLoading}
              className={`btn ${currentPoll.is_active ? 'btn-danger' : 'btn-primary'}`}
              id="admin-toggle-poll-btn"
            >
              {actionLoading
                ? 'Updating...'
                : currentPoll.is_active
                ? 'Close This Poll'
                : 'Reopen / Activate This Poll'}
            </button>
          </div>
        )}
      </div>

      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {/* Top Stat Overview Grid */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value">{pollDetails?.registeredStudentCount || 0}</div>
          <div className="stat-label">Registered Students</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">{pollDetails?.totalVotes || 0}</div>
          <div className="stat-label">Total Poll Votes</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">{pollDetails?.breakdownByType?.home || 0}</div>
          <div className="stat-label">Home Student Votes</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">{pollDetails?.breakdownByType?.external || 0}</div>
          <div className="stat-label">External Visitor Votes</div>
        </div>
      </div>

      {/* Poll Selection Dropdown if multiple polls */}
      {polls.length > 1 && (
        <div className="card" style={{ padding: '1rem' }}>
          <label className="form-label" htmlFor="select-poll">Select Poll to Inspect</label>
          <select
            id="select-poll"
            className="form-select"
            value={selectedPollId || ''}
            onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedPollId(id);
              const found = polls.find((p) => p.id === id);
              if (found) {
                setSelectedDate(found.meal_date);
                setSelectedMealType(found.meal_type);
              }
            }}
          >
            {polls.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} - {p.title} ({p.meal_date} {p.meal_type}) [{p.is_active ? 'ACTIVE' : 'CLOSED'}]
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Section 1: Menu Preference Vote Results */}
      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 700 }}>
          Menu Preference Vote Breakdown
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {pollDetails?.options?.map((opt) => (
            <div key={opt.id} style={{ background: '#0f172a', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                {opt.name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <span>{opt.vote_count} votes</span>
                <strong>{opt.percentage}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${opt.percentage}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="disclaimer-banner">
          <strong>Notice:</strong> Menu votes represent preference distribution among participating students only. They do not constitute an attendance record or a forecast of exact meals required.
        </div>
      </div>

      {/* Section 2: Meal Intention Responses (Self-reported) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Meal Intention Responses</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Self-reported intentions from students who responded for {selectedMealType.toUpperCase()} on {selectedDate}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="date"
              className="form-input"
              style={{ width: 'auto' }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <select
              className="form-select"
              style={{ width: 'auto' }}
              value={selectedMealType}
              onChange={(e) => setSelectedMealType(e.target.value)}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
        </div>

        {mealIntentData && (
          <div>
            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-value" style={{ color: 'var(--primary)' }}>
                  {mealIntentData.summary.yes.count}
                </div>
                <div className="stat-label">
                  "Yes, I'll Eat" ({mealIntentData.summary.yes.percentage}%)
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-value" style={{ color: 'var(--danger)' }}>
                  {mealIntentData.summary.no.count}
                </div>
                <div className="stat-label">
                  "No, Won't Eat" ({mealIntentData.summary.no.percentage}%)
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-value" style={{ color: 'var(--text-dim)' }}>
                  {mealIntentData.summary.noResponse.count}
                </div>
                <div className="stat-label">
                  No Response ({mealIntentData.summary.noResponse.percentage}%)
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-value" style={{ color: 'var(--accent)' }}>
                  {mealIntentData.summary.responseRate}%
                </div>
                <div className="stat-label">Student Response Rate</div>
              </div>
            </div>

            {/* Split by Student Type */}
            <div style={{ background: '#0f172a', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginTop: '1rem' }}>
              <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: '#c7d2fe' }}>
                Response Breakdown by Student Type:
              </h4>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                <div>
                  <strong>Home Students: </strong>
                  <span style={{ color: 'var(--primary)' }}>Yes: {mealIntentData.splitByStudentType.yes.home}</span> |{' '}
                  <span style={{ color: 'var(--danger)' }}>No: {mealIntentData.splitByStudentType.no.home}</span>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>(Total registered: {mealIntentData.splitByStudentType.totalStudentsByType.home})</span>
                </div>
                <div>
                  <strong>External Visitors: </strong>
                  <span style={{ color: 'var(--primary)' }}>Yes: {mealIntentData.splitByStudentType.yes.external}</span> |{' '}
                  <span style={{ color: 'var(--danger)' }}>No: {mealIntentData.splitByStudentType.no.external}</span>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>(Total registered: {mealIntentData.splitByStudentType.totalStudentsByType.external})</span>
                </div>
              </div>
            </div>

            <div className="disclaimer-banner">
              <strong>Mandatory Notice:</strong> {mealIntentData.notice}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Detailed Voters Audit Table */}
      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 700 }}>
          Individual Voter Records ({pollDetails?.voters?.length || 0})
        </h2>

        {pollDetails?.voters?.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No votes recorded yet for this poll.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Voter Name</th>
                  <th>College Name</th>
                  <th>Student Type</th>
                  <th>Selected Choice</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {pollDetails?.voters?.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.user_name}</strong></td>
                    <td>{v.college_name}</td>
                    <td>
                      <span className="badge-tag">
                        {v.student_type}
                      </span>
                    </td>
                    <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{v.choice}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                      {new Date(v.voted_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
