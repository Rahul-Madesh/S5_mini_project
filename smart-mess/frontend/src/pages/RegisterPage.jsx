import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentType, setStudentType] = useState('home');
  const [collegeName, setCollegeName] = useState('');
  const [homeCollegeName, setHomeCollegeName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Load public config to pre-fill home college name
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.homeCollegeName) {
          setHomeCollegeName(data.homeCollegeName);
          setCollegeName(data.homeCollegeName);
        }
      })
      .catch((err) => console.error('Failed to load config:', err));
  }, []);

  // Update college name when switching student type
  const handleStudentTypeChange = (e) => {
    const type = e.target.value;
    setStudentType(type);
    if (type === 'home') {
      setCollegeName(homeCollegeName);
    } else {
      setCollegeName('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Client-side quick checks
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          college_name: collegeName,
          student_type: studentType,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (Array.isArray(data.details)) {
          setError(data.details.map((d) => d.message).join(', '));
        } else {
          setError(data.details || data.error || 'Registration failed');
        }
      } else {
        login(data.user);
        navigate('/poll');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '2rem auto 0', padding: '0 1rem' }}>
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Student Registration
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Register as a home student or external visiting student
          </p>
        </div>

        {error && <div className="alert alert-error" id="register-error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">Full Name</label>
            <input
              id="register-name"
              type="text"
              required
              className="form-input"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">Email Address</label>
            <input
              id="register-email"
              type="email"
              required
              className="form-input"
              placeholder="e.g. rahul@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-type">Student Type</label>
            <select
              id="register-type"
              className="form-select"
              value={studentType}
              onChange={handleStudentTypeChange}
            >
              <option value="home">Home Student (Resident/Hosteller)</option>
              <option value="external">External Student (Visiting/Guest)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-college">College / Institution Name</label>
            <input
              id="register-college"
              type="text"
              required
              className="form-input"
              placeholder="Enter your college name"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              disabled={studentType === 'home' && Boolean(homeCollegeName)}
            />
            {studentType === 'home' && (
              <span className="form-hint">Pre-filled with host institution name</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              required
              className="form-input"
              placeholder="Minimum 8 characters with letter & number"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="form-hint">Must be 8-72 characters, with at least 1 letter and 1 digit</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            id="register-submit-btn"
          >
            {submitting ? 'Creating account...' : 'Complete Registration'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
