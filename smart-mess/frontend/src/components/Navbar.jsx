import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <div className="nav-logo-icon">M</div>
        <Link to={user?.role === 'admin' ? '/admin' : '/poll'} style={{ color: 'var(--text-main)' }}>
          Smart Mess Agent
        </Link>
      </div>

      {user && (
        <div className="nav-user-meta">
          <div className="user-badge">
            <span>{user.name}</span>
            <span className={`badge-tag ${user.role === 'admin' ? 'admin' : ''}`}>
              {user.student_type ? `${user.student_type} student` : user.role}
            </span>
          </div>

          {user.role === 'admin' && (
            <Link to="/admin" className="btn btn-secondary btn-sm">
              Admin Dashboard
            </Link>
          )}

          <Link to="/poll" className="btn btn-secondary btn-sm">
            Menu Poll
          </Link>

          <button onClick={handleLogout} className="btn btn-secondary btn-sm" id="logout-btn">
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
