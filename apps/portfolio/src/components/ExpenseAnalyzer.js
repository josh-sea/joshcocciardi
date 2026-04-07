import React from 'react';

const ExpenseAnalyzer = () => {
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>💳 Expense Analyzer</h1>
      <p style={{ fontSize: '18px', color: '#666', marginBottom: '30px' }}>
        Upload your Capital One transaction CSV to analyze your spending patterns, detect subscriptions, and get insights into your financial habits.
      </p>
      
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
        padding: '30px', 
        borderRadius: '15px', 
        color: 'white',
        textAlign: 'center',
        marginBottom: '30px'
      }}>
        <h2 style={{ marginBottom: '15px' }}>🚀 Launch Expense Analyzer</h2>
        <p style={{ marginBottom: '20px', fontSize: '16px' }}>
          Click the button below to open the expense analyzer in a new tab. Upload your Capital One CSV file to get started!
        </p>
        <button
          onClick={() => window.open('/apps/expenseAnalyzer.html', '_blank')}
          style={{
            background: 'white',
            color: '#667eea',
            border: 'none',
            padding: '15px 30px',
            fontSize: '18px',
            fontWeight: 'bold',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}
          onMouseOver={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
          }}
        >
          Open Expense Analyzer
        </button>
      </div>

      <div style={{ 
        background: '#f8f9fa', 
        padding: '25px', 
        borderRadius: '10px',
        marginBottom: '30px'
      }}>
        <h3 style={{ color: '#2c3e50', marginBottom: '15px' }}>📝 How to Use:</h3>
        <ol style={{ lineHeight: '1.8', color: '#495057' }}>
          <li>Click "Open Expense Analyzer" button above</li>
          <li>Export your transactions from Capital One (CSV format)</li>
          <li>Upload the CSV file in the expense analyzer</li>
          <li>Explore spending insights, subscriptions, and trends</li>
        </ol>
      </div>

      <div style={{ 
        background: '#e8f5e8', 
        padding: '25px', 
        borderRadius: '10px'
      }}>
        <h3 style={{ color: '#2b6cb0', marginBottom: '15px' }}>🔍 Features:</h3>
        <ul style={{ lineHeight: '1.8', color: '#2d3748' }}>
          <li><strong>Subscription Detection:</strong> Automatically identifies recurring charges</li>
          <li><strong>Category Analysis:</strong> Break down spending by transaction categories</li>
          <li><strong>Top Merchants:</strong> See where you spend the most money</li>
          <li><strong>Search & Filter:</strong> Find specific transactions quickly</li>
          <li><strong>Visual Insights:</strong> Interactive charts and progress bars</li>
        </ul>
      </div>

      <div style={{ 
        background: '#fff3cd', 
        padding: '25px', 
        borderRadius: '10px',
        border: '1px solid #ffeaa7'
      }}>
        <h3 style={{ color: '#d68910', marginBottom: '15px' }}>📋 Alternative Access:</h3>
        <p style={{ color: '#856404', marginBottom: '10px' }}>
          You can also access the expense analyzer directly:
        </p>
        <div style={{ background: 'white', padding: '15px', borderRadius: '5px', fontFamily: 'monospace' }}>
          <a href="/apps/expenseAnalyzer.html" target="_blank" style={{ color: '#667eea', textDecoration: 'none' }}>
            https://joshcocciardi.com/apps/expenseAnalyzer.html
          </a>
        </div>
        <p style={{ marginTop: '10px', fontSize: '14px', color: '#856404' }}>
          Or view the source code with the runtime viewer:
        </p>
        <div style={{ background: 'white', padding: '15px', borderRadius: '5px', fontFamily: 'monospace' }}>
          <a href="/apps/viewer.html?file=expenseAnalyzer.jsx" target="_blank" style={{ color: '#667eea', textDecoration: 'none' }}>
            https://joshcocciardi.com/apps/viewer.html?file=expenseAnalyzer.jsx
          </a>
        </div>
      </div>
    </div>
  );
};

export default ExpenseAnalyzer;
