import React from 'react';
import { Link } from 'react-router-dom';

// Placeholder — best-line finder is built in Step 4.
export default function ComparePage() {
  return (
    <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
      <h2 className="text-2xl font-bold text-slate-50 mb-2">Compare Books</h2>
      <p>The best-line finder across all books arrives in Step 4.</p>
      <Link to="/" className="text-purple-400 hover:text-purple-300 mt-4 inline-block">
        ← Back to dashboard
      </Link>
    </div>
  );
}
