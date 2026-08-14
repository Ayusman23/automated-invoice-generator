import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import API from './api';

const C = {
  bg:           '#FAF9F6',
  surface:      '#FFFFFF',
  border:       '#E4E1DA',
  primary:      '#16345C',
  textPrimary:  '#10151F',
  textSecondary:'#4B5361',
  textMuted:    '#8B93A1',
  paid:         '#0E7C4A',
  unpaid:       '#B45309',
  shadow:       '0 1px 3px rgba(16,21,31,0.05), 0 6px 20px rgba(16,21,31,0.02)',
};

const cardStyle = {
  background: C.surface,
  borderRadius: '14px',
  border: `1px solid ${C.border}`,
  padding: '24px',
  boxShadow: C.shadow,
};

const statCardStyle = {
  ...cardStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: '160px',
  flex: 1,
};

export default function AnalyticsDashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    API.get('/api/analytics/summary')
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => { setError('Could not load analytics summary.'); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '50px', color: C.textMuted, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid #16345C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      Loading performance analytics…
    </div>
  );

  if (error) return (
    <div style={{ color: '#B91C1C', padding: '20px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '10px', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
      ⚠️ {error}
    </div>
  );

  const pieData = [
    { name: 'Paid Revenue',   value: data.paidRevenue   || 0 },
    { name: 'Unpaid Due',     value: data.unpaidRevenue  || 0 },
  ];
  const pieColors = [C.paid, C.unpaid];

  const trend = data.monthlyBreakdown?.length >= 2
    ? (data.monthlyBreakdown.at(-1).revenue - data.monthlyBreakdown.at(-2).revenue)
    : 0;
  const trendArrow = trend >= 0 ? '▲' : '▼';
  const trendColor = trend >= 0 ? C.paid : '#B91C1C';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Stat Cards Strip ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Invoiced
          </span>
          <span className="mono" style={{ fontSize: '24px', fontWeight: 700, color: C.textPrimary }}>
            ₹{data.totalRevenue.toLocaleString('en-IN')}
          </span>
          <span style={{ color: C.textSecondary, fontSize: '12px' }}>{data.totalCount || 0} total invoices</span>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Paid &amp; Settled
          </span>
          <span className="mono" style={{ fontSize: '24px', fontWeight: 700, color: C.paid }}>
            ₹{data.paidRevenue.toLocaleString('en-IN')}
          </span>
          <span style={{ color: C.textSecondary, fontSize: '12px' }}>{data.paidCount} invoice{data.paidCount !== 1 ? 's' : ''}</span>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pending Collection
          </span>
          <span className="mono" style={{ fontSize: '24px', fontWeight: 700, color: C.unpaid }}>
            ₹{data.unpaidRevenue.toLocaleString('en-IN')}
          </span>
          <span style={{ color: C.textSecondary, fontSize: '12px' }}>{data.unpaidCount} invoice{data.unpaidCount !== 1 ? 's' : ''}</span>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Forecast (Next Month)
          </span>
          <span className="mono" style={{ fontSize: '24px', fontWeight: 700, color: C.primary }}>
            ₹{data.predictedNextMonth.toLocaleString('en-IN')}
          </span>
          <span className="mono" style={{ color: trendColor, fontSize: '12px', fontWeight: 600 }}>
            {trendArrow} ₹{Math.abs(trend).toLocaleString('en-IN')} vs prior month
          </span>
        </div>

      </div>

      {/* ── Charts Row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', flexWrap: 'wrap' }}>

        {/* Bar Chart — Monthly Revenue */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 className="serif" style={{ color: C.textPrimary, fontSize: '17px', fontWeight: 600 }}>
                Monthly Revenue Trend
              </h3>
              <p style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>Historical billing volume over time</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data.monthlyBreakdown} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="label" tick={{ fill: C.textSecondary, fontSize: 12, fontFamily: 'Inter' }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fill: C.textSecondary, fontSize: 12, fontFamily: 'IBM Plex Mono' }} axisLine={{ stroke: C.border }} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']}
                contentStyle={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: '8px', boxShadow: C.shadow, fontFamily: 'Inter' }}
                labelStyle={{ color: C.textPrimary, fontWeight: 600 }}
              />
              <Bar dataKey="revenue" fill={C.primary} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart — Revenue Split */}
        <div style={cardStyle}>
          <div style={{ marginBottom: '16px' }}>
            <h3 className="serif" style={{ color: C.textPrimary, fontSize: '17px', fontWeight: 600 }}>
              Collection Split
            </h3>
            <p style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>Paid vs outstanding ratio</p>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="45%"
                innerRadius={52} outerRadius={78}
                paddingAngle={4}
                dataKey="value"
                label={({ percent }) => percent > 0 ? `${(percent * 100).toFixed(0)}%` : ''}
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={pieColors[index]} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                wrapperStyle={{ color: C.textSecondary, fontSize: '12px', fontFamily: 'Inter', paddingTop: '10px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
