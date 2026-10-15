import React, { useState } from 'react';

export default function BoysMessMenu() {
  const [pdfError, setPdfError] = useState(false);

  const mealHours = [
    { name: 'Breakfast', time: '07:30 – 09:00 AM' },
    { name: 'Lunch', time: '12:15 – 02:00 PM' },
    { name: 'Evening Tea', time: '04:30 – 05:30 PM' },
    { name: 'Dinner', time: '07:30 – 09:00 PM' }
  ];

  return (
    <div className="card" style={{ maxWidth: '1060px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <span className="badge-tag" style={{ marginBottom: '0.4rem' }}>
            Official Dining Roster
          </span>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 600, marginTop: '0.25rem' }}>
            Boys Mess Schedule
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            October 2026 Monthly Dining Timetable & Daily Nutrition Menu
          </p>
        </div>

        <div>
          <a
            href="/menus/boys-mess-menu-oct-2026.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            Open Document in New Tab
          </a>
        </div>
      </div>

      {/* Service Hours Telemetry */}
      <div className="service-hours-grid">
        {mealHours.map(meal => (
          <div key={meal.name} className="service-hour-card">
            <div className="service-meal-name">{meal.name}</div>
            <div className="service-time-val">{meal.time}</div>
          </div>
        ))}
      </div>

      {pdfError ? (
        <div className="alert alert-error" style={{ margin: '1.5rem 0' }}>
          <strong>Notice:</strong> Unable to embed the menu document preview directly. Please use the button above to view or download the schedule file.
        </div>
      ) : (
        <div className="pdf-viewer-frame">
          <iframe
            src="/menus/boys-mess-menu-oct-2026.pdf#toolbar=0"
            title="Boys Mess Menu October 2026"
            style={{ width: '100%', height: '76svh', border: 'none', display: 'block' }}
            onError={() => setPdfError(true)}
          />
        </div>
      )}

      <div className="disclaimer-banner">
        <strong>Internal Resident Notice:</strong> Hostel residents dine according to the fixed monthly mess schedule above. Meal preference voting is designated for visiting/external college students to forecast guest batches.
      </div>
    </div>
  );
}
