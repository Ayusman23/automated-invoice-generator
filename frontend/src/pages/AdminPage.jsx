import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AnalyticsDashboard from '../AnalyticsDashboard';
import API from '../api';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg:           '#F9FAFB',
  surface:      '#FFFFFF',
  border:       '#E5E7EB',
  borderFocus:  '#2563EB',
  primary:      '#2563EB',
  primaryHover: '#1D4ED8',
  primaryText:  '#FFFFFF',
  textPrimary:  '#111827',
  textSecondary:'#6B7280',
  textMuted:    '#9CA3AF',
  danger:       '#DC2626',
  dangerBg:     '#FEF2F2',
  dangerBorder: '#FECACA',
  paid:         { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  unpaid:       { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
  riskHigh:     { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  riskMed:      { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
  riskLow:      { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  shadow:       '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd:     '0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
  shadowLg:     '0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)',
};

// ─── Shared Style Objects ─────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 13px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  color: C.textPrimary,
  fontSize: '14px',
  outline: 'none',
  marginBottom: '16px',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'Inter, sans-serif',
};

const labelStyle = {
  fontSize: '13px', fontWeight: 600,
  color: C.textPrimary,
  marginBottom: '5px',
  display: 'block',
};

const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  boxShadow: C.shadow,
};

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '9px 18px',
  background: C.primary,
  color: C.primaryText,
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px', fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.15s, transform 0.1s, box-shadow 0.15s',
  fontFamily: 'Inter, sans-serif',
};

const btnSecondary = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '7px 14px',
  background: C.surface,
  color: C.textSecondary,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  fontSize: '13px', fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
  fontFamily: 'Inter, sans-serif',
};

const badge = (type) => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '3px 10px',
  borderRadius: '20px',
  fontSize: '12px', fontWeight: 600,
  background: type === 'paid' ? C.paid.bg   : C.unpaid.bg,
  color:      type === 'paid' ? C.paid.text  : C.unpaid.text,
  border:     `1px solid ${type === 'paid' ? C.paid.border : C.unpaid.border}`,
});

// ─── Debounce Hook ────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

// ─── RISK COLORS ──────────────────────────────────────────────────────────────
const RISK_STYLE = {
  'High Risk':   { bg: C.riskHigh.bg,  text: C.riskHigh.text,  border: C.riskHigh.border,  icon: '⚠️' },
  'Medium Risk': { bg: C.riskMed.bg,   text: C.riskMed.text,   border: C.riskMed.border,   icon: '🔶' },
  'Low Risk':    { bg: C.riskLow.bg,   text: C.riskLow.text,   border: C.riskLow.border,   icon: '✅' },
};

// ─── Empty item template ──────────────────────────────────────────────────────
const emptyItem = () => ({ name: '', qty: 1, price: '' });

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate();

  // Form state
  const [clientName,  setClientName]  = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  // Multi-item state
  const [items, setItems] = useState([emptyItem()]);

  // Computed total
  const totalAmount = items.reduce(
    (sum, it) => sum + (Number(it.qty) || 1) * (Number(it.price) || 0), 0
  );

  // UI state
  const [invoices,     setInvoices]   = useState([]);
  const [activeTab,    setActiveTab]  = useState('invoices');
  const [currentPage,  setCurrentPage]= useState(1);
  const itemsPerPage                  = 10;
  const [submitting,   setSubmitting] = useState(false);
  const [notification, setNotify]    = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // invoice pending confirm

  // OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showOcrGuide, setShowOcrGuide] = useState(false);
  const ocrInputRef = useRef(null);

  // Voice
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  // Risk (uses first item + total for debounced prediction)
  const [risk, setRisk] = useState(null);
  const debouncedClient = useDebounce(clientName, 600);
  const debouncedAmount = useDebounce(totalAmount, 600);
  const debouncedItem   = useDebounce(items[0]?.name || '', 600);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/invoices`);
      const data = await res.json();
      setInvoices(data);
    } catch { console.error('Could not fetch invoices'); }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // ── Risk prediction ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedClient && !debouncedAmount) { setRisk(null); return; }
    fetch(`${API}/api/risk/predict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName: debouncedClient, amount: debouncedAmount, itemName: debouncedItem }),
    }).then(r => r.json()).then(d => setRisk(d)).catch(() => setRisk(null));
  }, [debouncedClient, debouncedAmount, debouncedItem]);

  // ── Notifications ─────────────────────────────────────────────────────────
  const notify = (msg, type = 'success') => {
    setNotify({ msg, type });
    setTimeout(() => setNotify(null), 4500);
  };

  // ── Items helpers ─────────────────────────────────────────────────────────
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addItem    = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  // ── Submit invoice ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(it => !it.name.trim() || !it.price)) {
      notify('Please fill in all item names and prices.', 'error'); return;
    }
    if (totalAmount <= 0) {
      notify('Total amount must be greater than ₹0.', 'error'); return;
    }
    setSubmitting(true);
    try {
      const fullPhone = phone ? `${countryCode}${phone.replace(/^\+/, '')}` : '';
      const payload = {
        clientName,
        email,
        phone: fullPhone,
        items: items.map(it => ({ name: it.name.trim(), qty: Number(it.qty) || 1, price: Number(it.price) })),
        amount: totalAmount,
        itemName: items.map(it => it.name.trim()).join(', '),
      };
      const res = await fetch(`${API}/api/invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        notify('Invoice created! Email dispatched with payment link.');
        setClientName(''); setEmail(''); setPhone(''); setItems([emptyItem()]); setRisk(null);
        fetchInvoices();
      } else { notify('Failed to save invoice.', 'error'); }
    } catch { notify('Server not responding.', 'error'); }
    finally { setSubmitting(false); }
  };

  // ── Delete invoice ─────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`${API}/api/invoices/${deleteTarget._id}`, { method: 'DELETE' });
      if (res.ok) {
        notify(`Invoice for ${deleteTarget.clientName} deleted.`);
        fetchInvoices();
      } else { notify('Failed to delete invoice.', 'error'); }
    } catch { notify('Server not responding.', 'error'); }
    finally { setDeleteTarget(null); }
  };

  // ── OCR ───────────────────────────────────────────────────────────────────
  const handleOcrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true); notify('Scanning image...', 'info');
    const fd = new FormData(); fd.append('image', file);
    try {
      const res  = await fetch(`${API}/api/ocr/scan`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('OCR API failed');
      
      const data = await res.json();
      
      // Update basic fields
      if (data.client_name)   setClientName(data.client_name);
      if (data.email_address) setEmail(data.email_address);
      if (data.phone) {
        if (data.phone.country_code) setCountryCode(data.phone.country_code);
        if (data.phone.number)       setPhone(data.phone.number);
      }

      // Update items array
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        const mappedItems = data.items.map(it => ({
          name:  it.description || '',
          qty:   it.quantity || 1,
          price: it.unit_price || ''
        }));
        setItems(mappedItems);
      } else if (data.total_amount) {
        // Fallback if item array is empty but total exists
        setItems([{ name: 'Miscellaneous', qty: 1, price: data.total_amount }]);
      }

      notify('OCR complete — fields auto-filled. Review and submit.');
    } catch (err) { 
      console.error(err);
      notify('OCR scanning failed.', 'error'); 
    }
    finally { setOcrLoading(false); e.target.value = ''; }
  };

  // ── Voice ─────────────────────────────────────────────────────────────────
  const parseVoice = (t) => {
    const s = t.toLowerCase();
    const cm = s.match(/(?:for|invoice for|client)\s+([a-z ]+?)\s+(?:for|worth|of)/i);
    if (cm) setClientName(cm[1].trim().replace(/\b\w/g, c => c.toUpperCase()));
    const am = s.match(/(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr|₹)/i);
    const im = s.match(/(?:for|of)\s+([a-z &,]+)(?:\.|$)/i);
    // Set first item from voice
    setItems(prev => prev.map((it, i) => i === 0
      ? { ...it, name: im ? im[1].trim().replace(/\b\w/g, c => c.toUpperCase()) : it.name, price: am ? am[1] : it.price }
      : it
    ));
    notify('Voice parsed — review fields and submit.');
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { notify('Voice not supported. Use Chrome.', 'error'); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR(); rec.lang = 'en-IN'; rec.interimResults = false;
    rec.onstart  = () => { setListening(true); notify('Listening... speak now', 'info'); };
    rec.onend    = () => setListening(false);
    rec.onerror  = (ev) => { 
      setListening(false); 
      console.error('Speech recognition error:', ev.error);
      notify(`Voice error: ${ev.error === 'not-allowed' ? 'Microphone permission blocked.' : ev.error}`, 'error'); 
    };
    rec.onresult = (ev) => { notify(`Heard: "${ev.results[0][0].transcript}"`, 'info'); parseVoice(ev.results[0][0].transcript); };
    recognitionRef.current = rec; rec.start();
  };

  // ── Copy link ─────────────────────────────────────────────────────────────
  const copyPayLink = (id) => {
    navigator.clipboard.writeText(`http://localhost:5173/pay/${id}`)
      .then(() => notify('Payment link copied to clipboard.'));
  };

  // ─────────────────────────────────────────────────────────────────────────
  const notifyBg   = { success: '#F0FDF4', error: '#FEF2F2', info: '#EFF6FF' };
  const notifyText = { success: '#166534', error: '#991B1B', info: '#1E40AF' };
  const notifyBdr  = { success: '#BBF7D0', error: '#FECACA', info: '#BFDBFE' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif', color: C.textPrimary }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; background: ${C.bg}; }
        input::placeholder { color: ${C.textMuted}; }
        input:focus, select:focus { border-color: ${C.borderFocus} !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important; }
        button:hover:not(:disabled) { opacity: 0.9; }
        button:active:not(:disabled) { transform: translateY(1px); }
        @keyframes toastIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes modalIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
      `}</style>

      {/* ── Top Nav Bar ──────────────────────────────────────────────────── */}
      <header style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 32px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '30px', height: '30px', background: C.primary, borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
            ⚡
          </div>
          <span style={{ fontWeight: 700, fontSize: '16px', color: C.textPrimary }}>InvoicePro</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...badge('unpaid'), background: '#EFF6FF', color: C.primary, border: `1px solid #BFDBFE` }}>
            🔐 Admin Portal
          </span>
          <button onClick={fetchInvoices} style={btnSecondary}>↻ Refresh</button>
        </div>
      </header>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {notification && (
        <div style={{
          position: 'fixed', top: '72px', right: '24px', zIndex: 9999,
          background: notifyBg[notification.type], color: notifyText[notification.type],
          border: `1px solid ${notifyBdr[notification.type]}`,
          borderRadius: '10px', padding: '12px 18px', maxWidth: '380px',
          fontSize: '14px', fontWeight: 500,
          boxShadow: C.shadowMd, animation: 'toastIn 0.2s ease',
        }}>
          {notification.msg}
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9998, animation: 'fadeIn 0.15s ease',
        }}>
          <div style={{
            background: C.surface, borderRadius: '16px', padding: '32px',
            maxWidth: '420px', width: '90%', boxShadow: C.shadowLg,
            animation: 'modalIn 0.2s ease',
          }}>
            <div style={{ width: '52px', height: '52px', background: C.dangerBg, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', margin: '0 auto 16px' }}>🗑️</div>
            <h3 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, color: C.textPrimary, marginBottom: '8px' }}>
              Delete Invoice?
            </h3>
            <p style={{ textAlign: 'center', color: C.textSecondary, fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              This will permanently delete the invoice for <strong>{deleteTarget.clientName}</strong>
              {' '}(₹{Number(deleteTarget.amount).toLocaleString('en-IN')}) and its PDF. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, padding: '10px 24px' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} style={{
                ...btnPrimary, padding: '10px 24px',
                background: C.danger, boxShadow: '0 2px 6px rgba(220,38,38,0.3)',
              }}>
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Layout ───────────────────────────────────────────────────── */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px', display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ═══════════════════════════════════════════════════════════════
            LEFT PANEL — Invoice Form
        ═══════════════════════════════════════════════════════════════ */}
        <div style={{ ...card, width: '380px', minWidth: '320px', flexShrink: 0, padding: '24px' }}>

          {/* Form header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: `1px solid ${C.border}` }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: C.textPrimary }}>Create Invoice</h2>
              <p style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>Fill in the details below</p>
            </div>
            {/* OCR + Voice */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={() => ocrInputRef.current?.click()} disabled={ocrLoading}
                style={{ ...btnSecondary, padding: '6px 10px', fontSize: '14px' }}
                title="Upload handwritten note (OCR)">
                {ocrLoading ? '⏳' : '📷'}
              </button>
              <button onClick={() => setShowOcrGuide(v => !v)}
                style={{ ...btnSecondary, padding: '6px 10px', fontSize: '14px' }}
                title="See handwriting format guide">
                ❓
              </button>
              <input ref={ocrInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleOcrUpload} />
              <button onClick={toggleVoice}
                style={{
                  ...btnSecondary, padding: '6px 10px', fontSize: '14px',
                  background: listening ? '#FEF2F2' : C.surface,
                  borderColor: listening ? '#FECACA' : C.border,
                  color: listening ? '#DC2626' : C.textSecondary,
                }}
                title="Voice command invoicing">
                {listening ? '🔴' : '🎤'}
              </button>
            </div>
          </div>

          {/* OCR handwriting guide */}
          {showOcrGuide && (
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '10px',
              padding: '14px 16px', marginBottom: '16px', fontSize: '12px', color: '#0C4A6E', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '13px' }}>📝 Handwriting Format Guide</div>
              <div style={{ fontFamily: 'monospace', background: '#E0F2FE', padding: '10px', borderRadius: '6px', whiteSpace: 'pre', fontSize: '11.5px' }}>
{`Client: John Doe
Email:  john@example.com
Phone:  +91 9876543210
Item:   Web Design | Qty: 2 | Price: 5000
Item:   Hosting    | Qty: 1 | Price: 1200
Total:  11200`}
              </div>
              <div style={{ marginTop: '8px', color: '#0369A1', fontSize: '11px' }}>
                💡 Write clearly in block letters. Use the labels above (Client:, Email:, Phone:, Item:, Total:) for best results.
              </div>
            </div>
          )}

          {/* Voice listening hint */}
          {listening && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px',
              padding: '10px 12px', marginBottom: '16px', fontSize: '13px', color: '#C2410C' }}>
              🎙️ Listening… <em>"Invoice for Ravi for ₹2000 for web design"</em>
            </div>
          )}

          {/* Risk badge */}
          {risk && (() => {
            const rs = RISK_STYLE[risk.label] || RISK_STYLE['Low Risk'];
            return (
              <div style={{ background: rs.bg, border: `1px solid ${rs.border}`, borderRadius: '8px',
                padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: rs.text }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>{rs.icon} {risk.riskScore}% {risk.label}</div>
                {risk.factors.map((f, i) => <div key={i} style={{ opacity: 0.9 }}>· {f}</div>)}
              </div>
            );
          })()}

          {/* Form fields */}
          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>Client Name</label>
            <input id="input-clientName" style={inputStyle} type="text" value={clientName}
              onChange={e => setClientName(e.target.value)} placeholder="e.g. Ayusman Sahoo" required />

            <label style={labelStyle}>Email Address</label>
            <input id="input-email" style={inputStyle} type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="client@company.com" required />

            <label style={labelStyle}>Phone <span style={{ color: C.textMuted, fontWeight: 400 }}>(WhatsApp, optional)</span></label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <select value={countryCode} onChange={e => setCountryCode(e.target.value)}
                style={{ ...inputStyle, width: '90px', padding: '9px', marginBottom: 0, cursor: 'pointer' }}>
                <option value="+91">+91 (IN)</option>
                <option value="+1">+1 (US)</option>
                <option value="+44">+44 (UK)</option>
                <option value="+61">+61 (AU)</option>
                <option value="+971">+971 (AE)</option>
                <option value="+65">+65 (SG)</option>
              </select>
              <input id="input-phone" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} type="tel" value={phone}
                onChange={e => setPhone(e.target.value)} placeholder="9876543210" />
            </div>

            {/* ── Multi-item section ──────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Items &amp; Prices</label>
              <button type="button" onClick={addItem}
                style={{ ...btnSecondary, padding: '4px 10px', fontSize: '12px', color: C.primary, borderColor: '#BFDBFE', background: '#EFF6FF' }}>
                + Add Item
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 90px 28px', gap: '6px',
              marginBottom: '6px', fontSize: '11px', fontWeight: 600, color: C.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              <span>Description</span><span style={{ textAlign: 'center' }}>Qty</span>
              <span style={{ textAlign: 'right' }}>Unit Price</span><span />
            </div>

            {/* Item rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 90px 28px', gap: '6px', alignItems: 'center' }}>
                  <input
                    style={{ ...inputStyle, marginBottom: 0, fontSize: '13px', padding: '8px 10px' }}
                    type="text" value={item.name}
                    onChange={e => updateItem(idx, 'name', e.target.value)}
                    placeholder="Item name" required />
                  <input
                    style={{ ...inputStyle, marginBottom: 0, fontSize: '13px', padding: '8px 6px', textAlign: 'center' }}
                    type="number" value={item.qty} min="1"
                    onChange={e => updateItem(idx, 'qty', e.target.value)} />
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
                      color: C.textMuted, fontSize: '13px', pointerEvents: 'none' }}>₹</span>
                    <input
                      style={{ ...inputStyle, marginBottom: 0, fontSize: '13px', padding: '8px 8px 8px 20px', width: '100%' }}
                      type="number" value={item.price} min="0"
                      onChange={e => updateItem(idx, 'price', e.target.value)}
                      placeholder="0" required />
                  </div>
                  <button type="button" onClick={() => removeItem(idx)}
                    style={{ background: 'none', border: 'none', cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                      color: items.length === 1 ? C.textMuted : C.danger, fontSize: '16px', padding: '4px',
                      borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    disabled={items.length === 1} title="Remove item">×</button>
                </div>
              ))}
            </div>

            {/* Running total */}
            <div style={{
              background: totalAmount > 0 ? '#EFF6FF' : C.bg,
              border: `1px solid ${totalAmount > 0 ? '#BFDBFE' : C.border}`,
              borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              transition: 'all 0.2s',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: C.textSecondary }}>
                Invoice Total ({items.length} item{items.length !== 1 ? 's' : ''})
              </span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: totalAmount > 0 ? C.primary : C.textMuted }}>
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>

            <button id="btn-submit" type="submit" disabled={submitting} style={{
              ...btnPrimary, width: '100%', justifyContent: 'center', padding: '11px',
              fontSize: '15px', fontWeight: 700,
              background: submitting ? '#93C5FD' : C.primary,
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: submitting ? 'none' : '0 1px 2px rgba(37,99,235,0.3)',
            }}>
              {submitting ? 'Creating...' : '+ Generate Invoice'}
            </button>
          </form>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            RIGHT PANEL — Dashboard
        ═══════════════════════════════════════════════════════════════ */}
        <div style={{ flex: 1, minWidth: '300px' }}>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '4px', width: 'fit-content', marginBottom: '20px',
            boxShadow: C.shadow,
          }}>
            {['invoices', 'analytics'].map(tab => (
              <button key={tab} id={`tab-${tab}`} onClick={() => setActiveTab(tab)} style={{
                padding: '7px 20px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '13px',
                background: activeTab === tab ? C.primary : 'transparent',
                color:      activeTab === tab ? '#fff'     : C.textSecondary,
                transition: 'all 0.15s',
              }}>
                {tab === 'invoices' ? '📋 Invoices' : '📈 Analytics'}
              </button>
            ))}
          </div>

          {/* ── Invoices Tab ─────────────────────────────────────────── */}
          {activeTab === 'invoices' && (
            <>
              {invoices.length === 0 ? (
                <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧾</div>
                  <p style={{ color: C.textSecondary, fontSize: '15px' }}>No invoices yet.</p>
                  <p style={{ color: C.textMuted, fontSize: '13px', marginTop: '4px' }}>Create your first invoice using the form.</p>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2fr 1.5fr 0.9fr 0.8fr 1.5fr',
                    padding: '10px 20px', marginBottom: '8px',
                    fontSize: '11px', fontWeight: 600, color: C.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.6px',
                  }}>
                    <span>Client</span><span>Items</span><span>Amount</span><span>Status</span><span>Actions</span>
                  </div>

                  {/* Invoice rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {invoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((inv) => {
                      const isPaid = inv.status === 'PAID';
                      // Display: use items array if present, else legacy itemName
                      const itemsDisplay = (inv.items && inv.items.length > 0)
                        ? inv.items.map(it => it.name).join(', ')
                        : (inv.itemName || '—');
                      return (
                        <div key={inv._id} style={{
                          ...card, padding: '16px 20px',
                          display: 'grid', gridTemplateColumns: '2fr 1.5fr 0.9fr 0.8fr 1.5fr',
                          alignItems: 'center', gap: '8px',
                          transition: 'box-shadow 0.15s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = C.shadowMd}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = C.shadow}
                        >
                          {/* Client */}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: C.textPrimary }}>{inv.clientName}</div>
                            <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>{inv.email}</div>
                            <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '1px' }}>
                              {new Date(inv.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                            </div>
                          </div>

                          {/* Items */}
                          <div>
                            <div style={{ fontSize: '13px', color: C.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {itemsDisplay}
                            </div>
                            {inv.items && inv.items.length > 1 && (
                              <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '2px' }}>
                                {inv.items.length} items
                              </div>
                            )}
                            {inv.phone && <span title={`WhatsApp: ${inv.phone}`} style={{ fontSize: '12px' }}>📱</span>}
                          </div>

                          {/* Amount */}
                          <div style={{ fontWeight: 700, fontSize: '15px', color: C.textPrimary }}>
                            ₹{Number(inv.amount).toLocaleString('en-IN')}
                          </div>

                          {/* Status badge */}
                          <div><span style={badge(isPaid ? 'paid' : 'unpaid')}>{isPaid ? '✓ Paid' : 'Unpaid'}</span></div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            <button id={`btn-openPay-${inv._id}`} onClick={() => navigate(`/pay/${inv._id}`)}
                              style={{ ...btnSecondary, padding: '5px 10px', fontSize: '12px' }}>
                              🔗 Pay
                            </button>
                            <button id={`btn-copyLink-${inv._id}`} onClick={() => copyPayLink(inv._id)}
                              style={{ ...btnSecondary, padding: '5px 10px', fontSize: '12px' }}>
                              📋 Copy
                            </button>
                            <button id={`btn-delete-${inv._id}`} onClick={() => setDeleteTarget(inv)}
                              style={{ ...btnSecondary, padding: '5px 10px', fontSize: '12px',
                                color: C.danger, borderColor: C.dangerBorder, background: C.dangerBg }}>
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Controls */}
                  {invoices.length > itemsPerPage && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 10px' }}>
                      <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ ...btnSecondary, opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                      >
                        ← Previous
                      </button>
                      <span style={{ fontSize: '13px', color: C.textSecondary, fontWeight: 500 }}>
                        Page {currentPage} of {Math.ceil(invoices.length / itemsPerPage)}
                      </span>
                      <button 
                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(invoices.length / itemsPerPage), p + 1))}
                        disabled={currentPage === Math.ceil(invoices.length / itemsPerPage)}
                        style={{ ...btnSecondary, opacity: currentPage === Math.ceil(invoices.length / itemsPerPage) ? 0.5 : 1, cursor: currentPage === Math.ceil(invoices.length / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Analytics Tab ────────────────────────────────────────── */}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
        </div>
      </main>
    </div>
  );
}
