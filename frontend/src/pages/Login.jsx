import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { API_URL } from '../api';
import { useAuth } from '../context/AuthContext';

/* ---------- Icons ---------- */
const Icon = ({ children, size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
    </svg>
);
const IconReceipt = (p) => <Icon {...p}><path d="M6 2h12v20l-2.5-1.5L13 22l-2.5-1.5L8 22l-2-1.5z" /><path d="M9 7h6M9 11h6M9 15h4" /></Icon>;
const IconAlert = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></Icon>;

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            const res = await api.post('/api/auth/login', { email, password });
            login(res.data);
            navigate('/admin');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to login. Please check your credentials.');
        }
    };

    const handleGoogleLogin = () => {
        window.location.href = `${API_URL}/api/auth/google`;
    };

    const handleDemoLogin = async () => {
        setError(null);
        try {
            const res = await api.post('/api/auth/demo');
            login(res.data);
            navigate('/admin');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to start demo session.');
        }
    };

    return (
        <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FAF9F6', color: '#10151F', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap');
                * { box-sizing: border-box; margin: 0; padding: 0; }
                .serif { font-family: 'Fraunces', Georgia, serif; }
                
                .btn-primary { display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; padding: 14px; border-radius: 8px; border: none; cursor: pointer; background: #16345C; color: #fff; font-size: 15px; font-weight: 600; font-family: 'Inter', sans-serif; transition: background 0.15s, transform 0.15s; }
                .btn-primary:hover { background: #0F2643; transform: translateY(-1px); }
                .btn-primary:focus-visible { outline: 2px solid #16345C; outline-offset: 2px; }
                
                .btn-google { display: flex; justify-content: center; align-items: center; gap: 10px; width: 100%; padding: 13px; border-radius: 8px; cursor: pointer; background: #fff; color: #10151F; font-size: 15px; font-weight: 600; border: 1px solid #E4E1DA; font-family: 'Inter', sans-serif; transition: background 0.15s, border-color 0.15s; }
                .btn-google:hover { background: #FAF9F6; border-color: #C9C4B8; }
                
                .input-field { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid #E4E1DA; font-family: 'Inter', sans-serif; font-size: 15px; color: #10151F; background: #fff; transition: border-color 0.15s, box-shadow 0.15s; }
                .input-field:focus { outline: none; border-color: #16345C; box-shadow: 0 0 0 3px rgba(22,52,92,0.1); }
                .input-field::placeholder { color: #8B93A1; }
                
                .auth-link { color: #16345C; text-decoration: none; font-weight: 600; transition: color 0.15s; }
                .auth-link:hover { color: #0F2643; text-decoration: underline; }
            `}</style>

            <header style={{ height: '72px', borderBottom: '1px solid #E4E1DA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: '#fff' }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#16345C' }}>
                    <div style={{ background: '#16345C', color: '#fff', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconReceipt size={20} />
                    </div>
                    <span className="serif" style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em' }}>
                        InvoicePro
                    </span>
                </Link>
                <div style={{ fontSize: '14px', color: '#6B7280' }}>
                    Don't have an account?{' '}
                    <Link to="/signup" className="auth-link">
                        Sign up
                    </Link>
                </div>
            </header>

            <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
                <div style={{ width: '100%', maxWidth: '440px', background: '#fff', border: '1px solid #E4E1DA', borderRadius: '16px', padding: '40px', boxShadow: '0 10px 30px rgba(16,21,31,0.04)' }}>

                    <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                        <h1 className="serif" style={{ fontSize: '28px', fontWeight: 600, color: '#10151F', marginBottom: '8px' }}>
                            Welcome Back
                        </h1>
                        <p style={{ fontSize: '15px', color: '#6B7280' }}>
                            Sign in to manage your invoices and clients
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleDemoLogin}
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '13px',
                            borderRadius: '8px',
                            border: '1px solid #16a34a',
                            background: '#f0fdf4',
                            color: '#15803d',
                            fontSize: '14.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            marginBottom: '20px',
                            fontFamily: "'Inter', sans-serif"
                        }}
                    >
                        ⚡ 1-Click Instant Demo Login
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0 24px', color: '#8B93A1', fontSize: '12px' }}>
                        <div style={{ flex: 1, height: '1px', background: '#E4E1DA' }}></div>
                        <span style={{ padding: '0 10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or with email</span>
                        <div style={{ flex: 1, height: '1px', background: '#E4E1DA' }}></div>
                    </div>

                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '24px', fontWeight: 500 }}>
                            <IconAlert size={16} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label htmlFor="login-email" style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#4B5361', marginBottom: '8px' }}>
                                Email Address
                            </label>
                            <input
                                id="login-email"
                                name="email"
                                type="email"
                                required
                                autoComplete="email"
                                className="input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                                <label htmlFor="login-password" style={{ fontSize: '13.5px', fontWeight: 600, color: '#4B5361' }}>
                                    Password
                                </label>
                                <Link to="/forgot-password" style={{ fontSize: '13px', color: '#6B7280', textDecoration: 'none' }}>
                                    Forgot password?
                                </Link>
                            </div>
                            <input
                                id="login-password"
                                name="password"
                                type="password"
                                required
                                autoComplete="current-password"
                                className="input-field"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>

                        <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                            Sign In
                        </button>
                    </form>

                    <div style={{ display: 'flex', alignItems: 'center', margin: '28px 0', color: '#8B93A1', fontSize: '13px' }}>
                        <div style={{ flex: 1, height: '1px', background: '#E4E1DA' }}></div>
                        <span style={{ padding: '0 12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or continue with</span>
                        <div style={{ flex: 1, height: '1px', background: '#E4E1DA' }}></div>
                    </div>

                    <button onClick={handleGoogleLogin} className="btn-google">
                        <img
                            src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg"
                            alt="Google Logo"
                            style={{ width: '20px', height: '20px' }}
                        />
                        Sign in with Google
                    </button>

                </div>
            </main>
        </div>
    );
}