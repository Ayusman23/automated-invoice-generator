import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import AnalyticsDashboard from '../AnalyticsDashboard';
import { useAuth } from '../context/AuthContext';
import API from '../api';

/* ---------- SVG Line Icons (Matching LandingPage style) ---------- */
const Icon = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconReceipt = (p) => <Icon {...p}><path d="M6 2h12v20l-2.5-1.5L13 22l-2.5-1.5L8 22l-2-1.5z" /><path d="M9 7h6M9 11h6M9 15h4" /></Icon>;
const IconWhatsapp = (p) => <Icon {...p}><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1z" /><path d="M8.5 9.5c0 3.5 3 6.5 6.5 6.5.8 0 1.2-.6 1.2-1.1v-1c0-.3-.2-.5-.5-.6l-1.8-.6c-.3-.1-.6 0-.7.3l-.4.7c-1.1-.5-2-1.4-2.5-2.5l.7-.4c.3-.1.4-.4.3-.7l-.6-1.8c-.1-.3-.3-.5-.6-.5h-1c-.5 0-1.1.4-1.1 1.2z" /></Icon>;
const IconMail = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>;
const IconCamera = (p) => <Icon {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></Icon>;
const IconMic = (p) => <Icon {...p}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></Icon>;
const IconTrash = (p) => <Icon {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>;
const IconLink = (p) => <Icon {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Icon>;
const IconCopy = (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>;
const IconSend = (p) => <Icon {...p}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Icon>;
const IconHelp = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>;
const IconPlus = (p) => <Icon {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>;
const IconCheck = (p) => <Icon {...p}><polyline points="20 6 9 17 4 12" /></Icon>;
const IconRefresh = (p) => <Icon {...p}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></Icon>;
const IconLogOut = (p) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Icon>;
const IconSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>;

// ─── Debounce Hook ────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

const emptyItem = () => ({ name: '', qty: 1, price: '' });

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // ── WhatsApp State ────────────────────────────────────────────────────────
  const [waSocket,   setWaSocket]   = useState(null);
  const [waStatus,   setWaStatus]   = useState('DISCONNECTED');
  const [waQr,       setWaQr]       = useState(null);
  const [waExpanded, setWaExpanded] = useState(false);

  useEffect(() => {
    const s = io(import.meta.env.VITE_API_URL || 'https://automated-invoice-generator-backend.onrender.com');
    setWaSocket(s);
    if (user?._id) {
      s.emit('get-whatsapp-status', { userId: user._id });
    }
    s.on('whatsapp-qr', (d) => {
      if (!d.userId || d.userId === user?._id) {
        setWaQr(d.qr);
        setWaStatus('QR_READY');
        setWaExpanded(true);
      }
    });
    s.on('whatsapp-status', (d) => {
      if (!d.userId || d.userId === user?._id) {
        setWaStatus(d.status);
        if (d.status === 'READY') {
          setWaQr(null);
        }
      }
    });
    return () => s.close();
  }, [user]);

  const startWhatsApp = () => {
    if (waSocket && user) {
      setWaStatus('INITIALIZING');
      setWaExpanded(true);
      waSocket.emit('start-whatsapp', { userId: user._id });
    }
  };

  const disconnectWhatsApp = () => {
    if (waSocket && user) {
      waSocket.emit('disconnect-whatsapp', { userId: user._id });
      setWaStatus('DISCONNECTED');
      setWaQr(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ── Form State ────────────────────────────────────────────────────────────
  const [clientName,  setClientName]  = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [items,       setItems]       = useState([emptyItem()]);

  // Computed total
  const totalAmount = useMemo(() => {
    return items.reduce(
      (sum, it) => sum + (Number(it.qty) || 1) * (Number(it.price) || 0), 0
    );
  }, [items]);

  // UI state
  const [invoices,      setInvoices]     = useState([]);
  const [activeTab,     setActiveTab]    = useState('invoices');
  const [statusFilter,  setStatusFilter] = useState('ALL');
  const [searchQuery,   setSearchQuery]  = useState('');
  const [currentPage,   setCurrentPage]  = useState(1);
  const itemsPerPage                     = 8;
  const [submitting,    setSubmitting]   = useState(false);
  const [notification,  setNotify]       = useState(null);
  const [deleteTarget,  setDeleteTarget] = useState(null);

  // OCR
  const [ocrLoading,    setOcrLoading]   = useState(false);
  const [showOcrGuide,  setShowOcrGuide] = useState(false);
  const ocrInputRef                      = useRef(null);

  // Voice Invoicing
  const [listening,      setListening]   = useState(false);
  const recognitionRef                   = useRef(null);

  // Risk Prediction
  const [risk,          setRisk]         = useState(null);
  const debouncedClient = useDebounce(clientName, 600);
  const debouncedAmount = useDebounce(totalAmount, 600);
  const debouncedItem   = useDebounce(items[0]?.name || '', 600);

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    try {
      const res = await API.get('/api/invoices');
      setInvoices(res.data);
    } catch {
      console.error('Could not fetch invoices');
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // ── Risk Prediction ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedClient && !debouncedAmount) { setRisk(null); return; }
    API.post('/api/risk/predict', { clientName: debouncedClient, amount: debouncedAmount, itemName: debouncedItem })
      .then(r => setRisk(r.data))
      .catch(() => setRisk(null));
  }, [debouncedClient, debouncedAmount, debouncedItem]);

  // ── Toast Notifications ───────────────────────────────────────────────────
  const notify = (msg, type = 'success') => {
    setNotify({ msg, type });
    setTimeout(() => setNotify(null), 4500);
  };

  // ── Items Helpers ─────────────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addItem    = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  // ── Submit Invoice ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(it => !it.name.trim() || !it.price)) {
      notify('Please fill in all item descriptions and unit prices.', 'error');
      return;
    }
    if (totalAmount <= 0) {
      notify('Total invoice amount must be greater than ₹0.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const fullPhone = phone ? `${countryCode}${phone.replace(/^\+/, '').trim()}` : '';
      const payload = {
        clientName: clientName.trim(),
        email: email.trim(),
        phone: fullPhone,
        items: items.map(it => ({ name: it.name.trim(), qty: Number(it.qty) || 1, price: Number(it.price) })),
        amount: totalAmount,
        itemName: items.map(it => it.name.trim()).join(', '),
      };
      await API.post('/api/invoices', payload);
      notify('Invoice created! Payment link & PDF dispatched.');
      setClientName('');
      setEmail('');
      setPhone('');
      setItems([emptyItem()]);
      setRisk(null);
      fetchInvoices();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to generate invoice.';
      notify(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete Invoice ────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.delete(`/api/invoices/${deleteTarget._id}`);
      notify(`Invoice for ${deleteTarget.clientName} removed.`);
      fetchInvoices();
    } catch {
      notify('Failed to delete invoice.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── OCR Upload ────────────────────────────────────────────────────────────
  const handleOcrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    notify('Scanning handwritten invoice...', 'info');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await API.post('/api/ocr/scan', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = res.data;
      if (!data) throw new Error('OCR failed');

      if (data.client_name)   setClientName(data.client_name);
      if (data.email_address) setEmail(data.email_address);
      if (data.phone) {
        if (data.phone.country_code) setCountryCode(data.phone.country_code);
        if (data.phone.number)       setPhone(data.phone.number);
      }

      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        setItems(data.items.map(it => ({
          name:  it.description || '',
          qty:   it.quantity || 1,
          price: it.unit_price || ''
        })));
      } else if (data.total_amount) {
        setItems([{ name: 'Consulting / Services', qty: 1, price: data.total_amount }]);
      }

      notify('Scan complete! Fields auto-filled — please review.', 'success');
    } catch (err) {
      console.error(err);
      notify('OCR scanning failed. Check image clarity.', 'error');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  };

  // ── Voice Commands ────────────────────────────────────────────────────────
  const parseVoice = (t) => {
    const s = t.toLowerCase();
    const cm = s.match(/(?:for|invoice for|client)\s+([a-z ]+?)\s+(?:for|worth|of)/i);
    if (cm) setClientName(cm[1].trim().replace(/\b\w/g, c => c.toUpperCase()));
    const am = s.match(/(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr|₹)/i);
    const im = s.match(/(?:for|of)\s+([a-z &,]+)(?:\.|$)/i);
    setItems(prev => prev.map((it, i) => i === 0
      ? { ...it, name: im ? im[1].trim().replace(/\b\w/g, c => c.toUpperCase()) : it.name, price: am ? am[1] : it.price }
      : it
    ));
    notify('Voice command parsed — review and submit.');
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { notify('Voice input not supported in this browser. Please use Chrome.', 'error'); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onstart  = () => { setListening(true); notify('Listening... speak now', 'info'); };
    rec.onend    = () => setListening(false);
    rec.onerror  = (ev) => {
      setListening(false);
      notify(`Voice error: ${ev.error === 'not-allowed' ? 'Microphone permission blocked.' : ev.error}`, 'error');
    };
    rec.onresult = (ev) => {
      notify(`Heard: "${ev.results[0][0].transcript}"`, 'info');
      parseVoice(ev.results[0][0].transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  // ── Copy Link & Resend ────────────────────────────────────────────────────
  const copyPayLink = (id) => {
    const origin = window.location.origin;
    navigator.clipboard.writeText(`${origin}/pay/${id}`)
      .then(() => notify('Payment link copied to clipboard!'));
  };

  const handleResendInvoice = async (id) => {
    try {
      notify('Dispatching invoice via WhatsApp & Email…', 'info');
      await API.post(`/api/invoices/${id}/resend`);
      notify('Invoice dispatched to WhatsApp & Email!', 'success');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to dispatch invoice', 'error');
    }
  };

  // ── Metrics Summary ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalCount = invoices.length;
    const paidInvoices = invoices.filter(i => i.status === 'PAID');
    const unpaidInvoices = invoices.filter(i => i.status !== 'PAID');
    const paidRevenue = paidInvoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const unpaidRevenue = unpaidInvoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    return { totalCount, paidCount: paidInvoices.length, paidRevenue, unpaidCount: unpaidInvoices.length, unpaidRevenue };
  }, [invoices]);

  // ── Filtered & Paginated Invoices ─────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'PAID' ? inv.status === 'PAID' : inv.status !== 'PAID');
      const matchesQuery = !searchQuery.trim() || 
        inv.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.itemName?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [invoices, statusFilter, searchQuery]);

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(start, start + itemsPerPage);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FAF9F6', color: '#10151F', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        
        .card-surface { background: #FFFFFF; border: 1px solid #E4E1DA; border-radius: 14px; box-shadow: 0 1px 3px rgba(16,21,31,0.05), 0 6px 20px rgba(16,21,31,0.02); transition: border-color 0.15s, box-shadow 0.15s; }
        .card-surface:hover { border-color: #D3CECE; }
        
        .btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 22px; border-radius: 8px; border: none; cursor: pointer; background: #16345C; color: #FFFFFF; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; transition: background 0.15s, transform 0.1s; }
        .btn-primary:hover:not(:disabled) { background: #0F2643; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        
        .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border-radius: 8px; cursor: pointer; background: #FFFFFF; color: #16345C; font-size: 13px; font-weight: 600; border: 1px solid #E4E1DA; font-family: 'Inter', sans-serif; transition: all 0.15s; }
        .btn-secondary:hover:not(:disabled) { background: #F3F1EC; border-color: #C9C4B8; }
        
        .btn-action-icon { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; border: 1px solid #E4E1DA; background: #FFFFFF; color: #4B5361; cursor: pointer; transition: all 0.15s; }
        .btn-action-icon:hover { background: #F3F1EC; color: #10151F; border-color: #C9C4B8; }
        
        .input-base { width: 100%; padding: 10px 14px; background: #FFFFFF; border: 1px solid #E4E1DA; border-radius: 8px; color: #10151F; font-size: 14px; font-family: 'Inter', sans-serif; outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
        .input-base:focus { border-color: #16345C; box-shadow: 0 0 0 3px rgba(22,52,92,0.12); }
        .input-base::placeholder { color: #8B93A1; }
        
        .badge-paid { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 700; background: #EBF7F0; color: #0E7C4A; border: 1px solid #C6E7D2; }
        .badge-unpaid { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 700; background: #FEF3C7; color: #B45309; border: 1px solid #FDE68A; }
        
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }
        .pulse-live { animation: pulseDot 1.6s infinite ease-in-out; }
      `}</style>

      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(250,249,246,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E4E1DA', height: '68px', display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: '1360px', width: '100%', margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '34px', height: '34px', background: '#16345C', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
              <IconReceipt size={20} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="serif" style={{ fontWeight: 600, fontSize: '20px', color: '#10151F', lineHeight: 1.1 }}>InvoicePro</span>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>Admin Workspace</span>
            </div>
          </div>

          {/* User Profile & Global Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 12px 5px 6px', background: '#FFFFFF', border: '1px solid #E4E1DA', borderRadius: '100px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#16345C', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
                  {(user.name || user.email || 'U')[0].toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#10151F', lineHeight: 1.1 }}>{user.name || 'Admin'}</span>
                  <span className="mono" style={{ fontSize: '10.5px', color: '#8B93A1' }}>{user.email}</span>
                </div>
              </div>
            )}

            <button className="btn-secondary" onClick={fetchInvoices} title="Refresh Invoices">
              <IconRefresh size={15} /> Refresh
            </button>

            <button className="btn-secondary" onClick={handleLogout} style={{ color: '#B91C1C', borderColor: '#FECACA' }} title="Log out">
              <IconLogOut size={15} /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Toast Alert ──────────────────────────────────────────────────── */}
      {notification && (
        <div style={{
          position: 'fixed', top: '80px', right: '28px', zIndex: 9999,
          background: notification.type === 'error' ? '#FEE2E2' : notification.type === 'info' ? '#E0F2FE' : '#EBF7F0',
          color: notification.type === 'error' ? '#991B1B' : notification.type === 'info' ? '#075985' : '#065F46',
          border: `1px solid ${notification.type === 'error' ? '#FECACA' : notification.type === 'info' ? '#BAE6FD' : '#C6E7D2'}`,
          borderRadius: '10px', padding: '14px 20px', maxWidth: '420px', fontSize: '14px', fontWeight: 600,
          boxShadow: '0 10px 30px rgba(16,21,31,0.12)', display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <span>{notification.type === 'error' ? '⚠️' : notification.type === 'info' ? 'ℹ️' : '✓'}</span>
          <span>{notification.msg}</span>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,21,31,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }}>
          <div className="card-surface" style={{ padding: '32px', maxWidth: '440px', width: '92%', boxShadow: '0 20px 50px rgba(16,21,31,0.2)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEE2E2', color: '#B91C1C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <IconTrash size={24} />
            </div>
            <h3 className="serif" style={{ textAlign: 'center', fontSize: '20px', fontWeight: 600, color: '#10151F', marginBottom: '8px' }}>
              Delete Invoice?
            </h3>
            <p style={{ textAlign: 'center', color: '#4B5361', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              Permanently delete invoice for <strong>{deleteTarget.clientName}</strong> (<span className="mono">₹{Number(deleteTarget.amount).toLocaleString('en-IN')}</span>)? This action cannot be reversed.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)} style={{ padding: '10px 22px' }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={confirmDelete} style={{ background: '#B91C1C', padding: '10px 22px' }}>
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Workspace ───────────────────────────────────────────────── */}
      <main style={{ maxWidth: '1360px', width: '100%', margin: '0 auto', padding: '32px 28px', flex: 1 }}>
        
        {/* Top KPI Metrics Strip */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          
          <div className="card-surface" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Invoices</span>
              <div style={{ padding: '5px 8px', background: '#F3F1EC', borderRadius: '6px', color: '#16345C' }}><IconReceipt size={16} /></div>
            </div>
            <div className="mono" style={{ fontSize: '26px', fontWeight: 700, color: '#10151F' }}>{metrics.totalCount}</div>
            <div style={{ fontSize: '12px', color: '#8B93A1', marginTop: '4px' }}>All records created</div>
          </div>

          <div className="card-surface" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue Settled</span>
              <div style={{ padding: '5px 8px', background: '#EBF7F0', borderRadius: '6px', color: '#0E7C4A' }}><IconCheck size={16} /></div>
            </div>
            <div className="mono" style={{ fontSize: '26px', fontWeight: 700, color: '#0E7C4A' }}>₹{metrics.paidRevenue.toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '12px', color: '#8B93A1', marginTop: '4px' }}>{metrics.paidCount} paid invoice{metrics.paidCount !== 1 ? 's' : ''}</div>
          </div>

          <div className="card-surface" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding</span>
              <div style={{ padding: '5px 8px', background: '#FEF3C7', borderRadius: '6px', color: '#B45309' }}><IconReceipt size={16} /></div>
            </div>
            <div className="mono" style={{ fontSize: '26px', fontWeight: 700, color: '#B45309' }}>₹{metrics.unpaidRevenue.toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '12px', color: '#8B93A1', marginTop: '4px' }}>{metrics.unpaidCount} awaiting payment</div>
          </div>

          <div className="card-surface" style={{ padding: '20px', cursor: 'pointer' }} onClick={() => setWaExpanded(v => !v)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>WhatsApp Gateway</span>
              <div style={{ padding: '5px 8px', background: waStatus === 'READY' ? '#EBF7F0' : '#F3F1EC', borderRadius: '6px', color: waStatus === 'READY' ? '#0E7C4A' : '#6B7280' }}>
                <IconWhatsapp size={16} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`pulse-live`} style={{ width: '10px', height: '10px', borderRadius: '50%', background: waStatus === 'READY' ? '#0E7C4A' : waStatus === 'QR_READY' ? '#D97706' : '#9CA3AF' }} />
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#10151F' }}>
                {waStatus === 'READY' ? 'Connected' : waStatus === 'QR_READY' ? 'Scan Required' : waStatus === 'INITIALIZING' ? 'Connecting…' : 'Offline'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#16345C', fontWeight: 600, marginTop: '6px' }}>
              {waExpanded ? '▲ Hide gateway panel' : '▼ Manage connection'}
            </div>
          </div>

        </section>

        {/* ── Two-Column Layout ────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '28px', alignItems: 'start' }}>
          
          {/* LEFT COLUMN: Create Form & WhatsApp Gateway */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* WhatsApp Integration Card (Collapsible or Prompt) */}
            {(waExpanded || waStatus !== 'READY') && (
              <div className="card-surface" style={{ padding: '24px', borderLeft: waStatus === 'READY' ? '4px solid #0E7C4A' : '4px solid #16345C' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ color: '#0E7C4A' }}><IconWhatsapp size={20} /></div>
                    <h3 className="serif" style={{ fontSize: '17px', fontWeight: 600, color: '#10151F' }}>WhatsApp Delivery</h3>
                  </div>
                  <span className={waStatus === 'READY' ? 'badge-paid' : 'badge-unpaid'}>
                    {waStatus === 'READY' ? 'Active' : waStatus === 'QR_READY' ? 'Scan QR' : 'Offline'}
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: '#4B5361', lineHeight: 1.6, marginBottom: '18px' }}>
                  Deliver branded PDF invoices and payment receipts directly to your client’s WhatsApp.
                </p>

                {waStatus === 'DISCONNECTED' || waStatus === 'AUTH_FAILED' || waStatus === 'ERROR' ? (
                  <button className="btn-primary" onClick={startWhatsApp} style={{ width: '100%', background: '#0E7C4A' }}>
                    <IconWhatsapp size={18} /> Connect WhatsApp Account
                  </button>
                ) : null}

                {waStatus === 'INITIALIZING' && (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ width: '32px', height: '32px', border: '3px solid #0E7C4A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: '13px', color: '#4B5361', fontWeight: 500 }}>Initializing browser session…</p>
                  </div>
                )}

                {waStatus === 'QR_READY' && waQr && (
                  <div style={{ textAlign: 'center', background: '#FAF9F6', border: '1px solid #E4E1DA', borderRadius: '12px', padding: '18px' }}>
                    <p style={{ fontSize: '12.5px', color: '#10151F', fontWeight: 600, marginBottom: '12px' }}>
                      Scan QR in WhatsApp → Linked Devices:
                    </p>
                    <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '10px', display: 'inline-block', border: '1px solid #E4E1DA', boxShadow: '0 4px 12px rgba(16,21,31,0.06)' }}>
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(waQr)}&color=10151F&bgcolor=FFFFFF`}
                        alt="WhatsApp QR Code"
                        style={{ display: 'block', width: '190px', height: '190px' }}
                      />
                    </div>
                    <p className="mono" style={{ fontSize: '11px', color: '#8B93A1', marginTop: '10px' }}>
                      QR refreshes automatically.
                    </p>
                  </div>
                )}

                {waStatus === 'READY' && (
                  <div style={{ background: '#EBF7F0', border: '1px solid #C6E7D2', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ color: '#0E7C4A' }}><IconCheck size={18} /></div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#0E7C4A' }}>Gateway Active &amp; Ready</span>
                    </div>
                    <button className="btn-secondary" onClick={disconnectWhatsApp} style={{ padding: '5px 10px', fontSize: '12px', color: '#B91C1C', borderColor: '#FECACA' }}>
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Create Invoice Form Card */}
            <div className="card-surface" style={{ padding: '26px' }}>
              
              {/* Card Header & Fast Tools */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #E4E1DA' }}>
                <div>
                  <h2 className="serif" style={{ fontSize: '20px', fontWeight: 600, color: '#10151F' }}>Create Invoice</h2>
                  <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>Fill client details &amp; line items</p>
                </div>

                {/* OCR & Voice Actions */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-action-icon" onClick={() => ocrInputRef.current?.click()} disabled={ocrLoading} title="Scan handwritten invoice (AI OCR)">
                    {ocrLoading ? <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span> : <IconCamera size={16} />}
                  </button>
                  <input ref={ocrInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleOcrUpload} />

                  <button className="btn-action-icon" onClick={() => setShowOcrGuide(v => !v)} title="Handwriting OCR format guide">
                    <IconHelp size={16} />
                  </button>

                  <button className="btn-action-icon" onClick={toggleVoice} title="Voice invoice dictation" style={{ color: listening ? '#B91C1C' : '#4B5361', borderColor: listening ? '#FECACA' : '#E4E1DA', background: listening ? '#FEE2E2' : '#FFFFFF' }}>
                    <IconMic size={16} />
                  </button>
                </div>
              </div>

              {/* OCR Guide Popover */}
              {showOcrGuide && (
                <div style={{ background: '#FAF9F6', border: '1px solid #E4E1DA', borderRadius: '10px', padding: '14px', marginBottom: '18px', fontSize: '12px', color: '#4B5361', lineHeight: 1.7 }}>
                  <div style={{ fontWeight: 700, color: '#10151F', marginBottom: '4px' }}>📝 Recommended Handwriting Layout:</div>
                  <div className="mono" style={{ background: '#FFFFFF', border: '1px solid #E4E1DA', padding: '8px 10px', borderRadius: '6px', fontSize: '11px', whiteSpace: 'pre' }}>
{`Client: Rahul Sharma
Email:  rahul@example.com
Phone:  +91 9876543210
Item:   Consulting | Qty: 1 | Price: 5000
Total:  5000`}
                  </div>
                </div>
              )}

              {/* Voice Listening Bar */}
              {listening && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', fontSize: '13px', color: '#B45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="pulse-live" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#B45309' }} />
                  <span>Listening… say <em>"Invoice for Priya for ₹15000 for App Design"</em></span>
                </div>
              )}

              {/* AI Risk Indicator */}
              {risk && (
                <div style={{
                  background: risk.label === 'High Risk' ? '#FEE2E2' : risk.label === 'Medium Risk' ? '#FEF3C7' : '#EBF7F0',
                  border: `1px solid ${risk.label === 'High Risk' ? '#FECACA' : risk.label === 'Medium Risk' ? '#FDE68A' : '#C6E7D2'}`,
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '18px', fontSize: '12.5px',
                  color: risk.label === 'High Risk' ? '#991B1B' : risk.label === 'Medium Risk' ? '#B45309' : '#065F46'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '3px' }}>
                    {risk.label === 'High Risk' ? '⚠️ High Risk' : risk.label === 'Medium Risk' ? '🔶 Moderate Risk' : '✓ Low Risk'} ({risk.riskScore}% default probability)
                  </div>
                  {risk.factors?.map((f, idx) => <div key={idx}>• {f}</div>)}
                </div>
              )}

              {/* Invoice Form */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#10151F', marginBottom: '6px' }}>Client Name</label>
                  <input className="input-base" type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Ananya Rao" required />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#10151F', marginBottom: '6px' }}>Email Address</label>
                  <input className="input-base" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@company.com" required />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#10151F', marginBottom: '6px' }}>
                    WhatsApp Phone Number <span style={{ color: '#8B93A1', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className="input-base" value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{ width: '100px', flexShrink: 0 }}>
                      <option value="+91">+91 (IN)</option>
                      <option value="+1">+1 (US)</option>
                      <option value="+44">+44 (UK)</option>
                      <option value="+971">+971 (AE)</option>
                      <option value="+65">+65 (SG)</option>
                      <option value="+61">+61 (AU)</option>
                    </select>
                    <input className="input-base" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" />
                  </div>
                </div>

                {/* Line Items */}
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#10151F' }}>Line Items</label>
                    <button type="button" className="btn-secondary" onClick={addItem} style={{ padding: '4px 10px', fontSize: '12px' }}>
                      <IconPlus size={13} /> Add item
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map((item, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 54px 92px 30px', gap: '6px', alignItems: 'center' }}>
                        <input className="input-base" style={{ padding: '8px 10px', fontSize: '13px' }} type="text" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Item description" required />
                        <input className="input-base" style={{ padding: '8px 6px', fontSize: '13px', textAlign: 'center' }} type="number" min="1" value={item.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} />
                        <div style={{ position: 'relative' }}>
                          <span className="mono" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#8B93A1', fontSize: '12px' }}>₹</span>
                          <input className="input-base" style={{ padding: '8px 8px 8px 18px', fontSize: '13px' }} type="number" min="0" value={item.price} onChange={e => updateItem(idx, 'price', e.target.value)} placeholder="0" required />
                        </div>
                        <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} style={{ background: 'none', border: 'none', color: items.length === 1 ? '#D1D5DB' : '#B91C1C', cursor: items.length === 1 ? 'not-allowed' : 'pointer', padding: '4px' }} title="Remove item">
                          <IconTrash size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary Document Box */}
                <div style={{ background: '#FAF9F6', border: '1px solid #E4E1DA', borderRadius: '10px', padding: '16px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#4B5361', marginBottom: '6px' }}>
                    <span>Line Items ({items.length})</span>
                    <span className="mono">₹{totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '10px', borderTop: '1px solid #E4E1DA' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#10151F' }}>Total Due</span>
                    <span className="mono" style={{ fontSize: '22px', fontWeight: 700, color: '#16345C' }}>
                      ₹{totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={submitting} style={{ padding: '13px', fontSize: '15px', marginTop: '4px' }}>
                  {submitting ? 'Creating Invoice…' : <><IconSend size={16} /> Generate &amp; Dispatch Invoice</>}
                </button>
              </form>

            </div>

          </div>

          {/* RIGHT COLUMN: Tabs, Invoices Table & Analytics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header / Tabs / Search Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              
              {/* Tab Switcher */}
              <div style={{ display: 'inline-flex', background: '#FFFFFF', border: '1px solid #E4E1DA', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 3px rgba(16,21,31,0.04)' }}>
                <button
                  onClick={() => setActiveTab('invoices')}
                  style={{
                    padding: '8px 18px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '13px',
                    background: activeTab === 'invoices' ? '#16345C' : 'transparent',
                    color: activeTab === 'invoices' ? '#FFFFFF' : '#4B5361',
                    transition: 'all 0.15s'
                  }}
                >
                  Invoices ({invoices.length})
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  style={{
                    padding: '8px 18px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '13px',
                    background: activeTab === 'analytics' ? '#16345C' : 'transparent',
                    color: activeTab === 'analytics' ? '#FFFFFF' : '#4B5361',
                    transition: 'all 0.15s'
                  }}
                >
                  Analytics &amp; Trends
                </button>
              </div>

              {/* Status Filter & Search */}
              {activeTab === 'invoices' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: '220px' }}>
                    <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#8B93A1' }}>
                      <IconSearch size={15} />
                    </span>
                    <input 
                      className="input-base" 
                      style={{ padding: '8px 12px 8px 34px', fontSize: '13px' }} 
                      type="text" 
                      value={searchQuery} 
                      onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} 
                      placeholder="Search client or item…" 
                    />
                  </div>

                  <select 
                    className="input-base" 
                    value={statusFilter} 
                    onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                    style={{ width: '130px', padding: '8px 10px', fontSize: '13px' }}
                  >
                    <option value="ALL">All Status</option>
                    <option value="PAID">Paid Only</option>
                    <option value="UNPAID">Unpaid Only</option>
                  </select>
                </div>
              )}

            </div>

            {/* Invoices List Content */}
            {activeTab === 'invoices' && (
              <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
                {filteredInvoices.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F3F1EC', color: '#16345C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <IconReceipt size={24} />
                    </div>
                    <h4 className="serif" style={{ fontSize: '18px', fontWeight: 600, color: '#10151F', marginBottom: '4px' }}>No invoices found</h4>
                    <p style={{ fontSize: '13px', color: '#6B7280' }}>
                      {searchQuery || statusFilter !== 'ALL' ? 'Try adjusting your search or filters.' : 'Create your first invoice using the form.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
                        <thead>
                          <tr style={{ background: '#FAF9F6', borderBottom: '1px solid #E4E1DA', color: '#6B7280', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            <th style={{ padding: '14px 20px', fontWeight: 600 }}>Client &amp; Contact</th>
                            <th style={{ padding: '14px 16px', fontWeight: 600 }}>Items</th>
                            <th style={{ padding: '14px 16px', fontWeight: 600 }}>Amount</th>
                            <th style={{ padding: '14px 16px', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedInvoices.map((inv) => {
                            const isPaid = inv.status === 'PAID';
                            const itemsDisplay = (inv.items && inv.items.length > 0)
                              ? inv.items.map(it => it.name).join(', ')
                              : (inv.itemName || '—');
                            return (
                              <tr key={inv._id} style={{ borderBottom: '1px solid #E4E1DA', transition: 'background 0.12s' }}>
                                
                                {/* Client Info */}
                                <td style={{ padding: '16px 20px' }}>
                                  <div style={{ fontWeight: 600, color: '#10151F' }}>{inv.clientName}</div>
                                  <div className="mono" style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{inv.email}</div>
                                  {inv.phone && (
                                    <div className="mono" style={{ fontSize: '11px', color: '#0E7C4A', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <IconWhatsapp size={12} /> {inv.phone}
                                    </div>
                                  )}
                                </td>

                                {/* Line Items */}
                                <td style={{ padding: '16px 16px', maxWidth: '240px' }}>
                                  <div style={{ color: '#4B5361', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {itemsDisplay}
                                  </div>
                                  {inv.items && inv.items.length > 1 && (
                                    <span style={{ fontSize: '11px', color: '#8B93A1' }}>+{inv.items.length - 1} more item{inv.items.length > 2 ? 's' : ''}</span>
                                  )}
                                </td>

                                {/* Amount */}
                                <td style={{ padding: '16px 16px' }}>
                                  <span className="mono" style={{ fontWeight: 700, fontSize: '15px', color: '#10151F' }}>
                                    ₹{Number(inv.amount).toLocaleString('en-IN')}
                                  </span>
                                </td>

                                {/* Status */}
                                <td style={{ padding: '16px 16px' }}>
                                  <span className={isPaid ? 'badge-paid' : 'badge-unpaid'}>
                                    {isPaid ? <><IconCheck size={12} /> PAID</> : 'UNPAID'}
                                  </span>
                                </td>

                                {/* Actions */}
                                <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                                    <button 
                                      className="btn-secondary" 
                                      onClick={() => handleResendInvoice(inv._id)}
                                      style={{ padding: '6px 10px', fontSize: '12px', color: '#0E7C4A', borderColor: '#C6E7D2', background: '#EBF7F0' }}
                                      title="Resend WhatsApp & Email"
                                    >
                                      <IconSend size={13} /> Send
                                    </button>

                                    <button 
                                      className="btn-secondary" 
                                      onClick={() => navigate(`/pay/${inv._id}`)}
                                      style={{ padding: '6px 10px', fontSize: '12px' }}
                                      title="Open client payment page"
                                    >
                                      <IconLink size={13} /> View
                                    </button>

                                    <button 
                                      className="btn-action-icon" 
                                      onClick={() => copyPayLink(inv._id)}
                                      title="Copy payment link"
                                    >
                                      <IconCopy size={14} />
                                    </button>

                                    <button 
                                      className="btn-action-icon" 
                                      onClick={() => setDeleteTarget(inv)}
                                      style={{ color: '#B91C1C' }}
                                      title="Delete invoice"
                                    >
                                      <IconTrash size={14} />
                                    </button>
                                  </div>
                                </td>

                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Bar */}
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#FAF9F6', borderTop: '1px solid #E4E1DA' }}>
                        <button 
                          className="btn-secondary"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                          ← Previous
                        </button>
                        <span className="mono" style={{ fontSize: '12.5px', color: '#6B7280' }}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button 
                          className="btn-secondary"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && <AnalyticsDashboard />}

          </div>

        </div>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #E4E1DA', background: '#FAF9F6', padding: '24px 28px', textAlign: 'center', fontSize: '12px', color: '#8B93A1', marginTop: 'auto' }}>
        <p>InvoicePro • Fast, GST-ready invoicing with WhatsApp &amp; Razorpay delivery.</p>
      </footer>

    </div>
  );
}
