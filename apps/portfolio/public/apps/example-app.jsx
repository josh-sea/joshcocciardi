function App() {
    const [count, setCount] = React.useState(0);
    const [message, setMessage] = React.useState('');

    const handleClick = () => {
        setCount(count + 1);
        setMessage(`Button clicked ${count + 1} times!`);
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <div style={{
                background: 'white',
                padding: '40px',
                borderRadius: '20px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                textAlign: 'center',
                maxWidth: '500px',
                width: '90%'
            }}>
                <h1 style={{
                    fontSize: '32px',
                    marginBottom: '20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                }}>
                    🚀 React JSX App
                </h1>
                
                <p style={{
                    fontSize: '18px',
                    color: '#666',
                    marginBottom: '30px'
                }}>
                    This is a standalone JSX application!
                </p>

                <div style={{
                    background: '#f8f9fa',
                    padding: '30px',
                    borderRadius: '10px',
                    marginBottom: '20px'
                }}>
                    <div style={{
                        fontSize: '48px',
                        fontWeight: 'bold',
                        color: '#667eea',
                        marginBottom: '10px'
                    }}>
                        {count}
                    </div>
                    
                    <button 
                        onClick={handleClick}
                        style={{
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '15px 30px',
                            fontSize: '16px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            fontWeight: 'bold'
                        }}
                        onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                        onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                        Click Me!
                    </button>
                </div>

                {message && (
                    <div style={{
                        background: '#d4edda',
                        color: '#155724',
                        padding: '15px',
                        borderRadius: '10px',
                        marginTop: '20px',
                        animation: 'fadeIn 0.3s'
                    }}>
                        {message}
                    </div>
                )}

                <div style={{
                    marginTop: '30px',
                    padding: '20px',
                    background: '#fff3cd',
                    borderRadius: '10px',
                    fontSize: '14px',
                    color: '#856404'
                }}>
                    <strong>💡 Tip:</strong> This JSX file was loaded and transpiled in real-time using Babel!
                </div>
            </div>
        </div>
    );
}
