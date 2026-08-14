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

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            const res = await api.post('/api/auth/signup', { name, email, password });
            login(res.data);
            navigate('/admin');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to sign up. Please try again.');
        }
    };

    const handleGoogleSignup = () => {
        window.location.href = `${API_URL}/api/auth/google`;
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

            {/* Minimal Navbar matching Landing Page */}
            <nav style={{ padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
                    <div style={{ width: '32px', height: '32px', background: '#16345C', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <IconReceipt size={18} />
                    </div>
                    <span className="serif" style={{ fontWeight: 600, fontSize: '19px', color: '#10151F' }}>InvoicePro</span>
                </Link>
                <div style={{ fontSize: '14px', color: '#6B7280' }}>
                    Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
                </div>
            </nav>

            {/* Signup Form Container */}
            <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
                <div style={{ width: '100%', maxWidth: '440px', background: '#fff', border: '1px solid #E4E1DA', borderRadius: '16px', padding: '40px', boxShadow: '0 10px 30px rgba(16,21,31,0.04)' }}>

                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <h1 className="serif" style={{ fontSize: '28px', fontWeight: 600, color: '#10151F', marginBottom: '8px' }}>
                            Create an Account
                        </h1>
                        <p style={{ fontSize: '15px', color: '#6B7280' }}>
                            Start generating beautiful invoices today
                        </p>
                    </div>

                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '24px', fontWeight: 500 }}>
                            <IconAlert size={16} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label htmlFor="signup-name" style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#4B5361', marginBottom: '8px' }}>
                                Full Name
                            </label>
                            <input
                                id="signup-name"
                                name="name"
                                type="text"
                                required
                                autoComplete="name"
                                className="input-field"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="John Doe"
                            />
                        </div>

                        <div>
                            <label htmlFor="signup-email" style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#4B5361', marginBottom: '8px' }}>
                                Email Address
                            </label>
                            <input
                                id="signup-email"
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
                            <label htmlFor="signup-password" style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#4B5361', marginBottom: '8px' }}>
                                Password
                            </label>
                            <input
                                id="signup-password"
                                name="password"
                                type="password"
                                required
                                autoComplete="new-password"
                                className="input-field"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>

                        <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                            Sign Up
                        </button>
                    </form>

                    <div style={{ display: 'flex', alignItems: 'center', margin: '28px 0', color: '#8B93A1', fontSize: '13px' }}>
                        <div style={{ flex: 1, height: '1px', background: '#E4E1DA' }}></div>
                        <span style={{ padding: '0 12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or continue with</span>
                        <div style={{ flex: 1, height: '1px', background: '#E4E1DA' }}></div>
                    </div>

                    <button onClick={handleGoogleSignup} className="btn-google">
                        <img
                            src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg"
                            alt="Google Logo"
                            style={{ width: '20px', height: '20px' }}
                        />
                        Sign up with Google
                    </button>

                </div>
            </main>
        </div>
    );
}