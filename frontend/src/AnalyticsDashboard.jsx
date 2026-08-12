import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import API from './api';

const C = {
  bg:           '#F9FAFB',
  surface:      '#FFFFFF',
  border:       '#E5E7EB',
  primary:      '#2563EB',
  textPrimary:  '#111827',
  textSecondary:'#6B7280',
  textMuted:    '#9CA3AF',
  paid:         '#10B981',
  unpaid:       '#F59E0B',
  shadow:       '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
};

const cardStyle = {
  background: C.surface,
  borderRadius: '12px',
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
    fetch(`${API}/api/analytics/summary`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Could not load analytics.'); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px', color: C.textMuted }}>
      ⏳ Loading analytics...
    </div>
  );

  if (error) return (
    <div style={{ color: '#DC2626', padding: '20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
      ⚠️ {error}
    </div>
  );

  const pieData = [
    { name: 'Paid',   value: data.paidRevenue   || 0 },
    { name: 'Unpaid', value: data.unpaidRevenue  || 0 },
  ];
  const pieColors = [C.paid, C.unpaid];

  const trend = data.monthlyBreakdown?.length >= 2
    ? data.monthlyBreakdown.at(-1).revenue - data.monthlyBreakdown.at(-2).revenue
    : 0;
  const trendArrow = trend >= 0 ? '▲' : '▼';
  const trendColor = trend >= 0 ? C.paid : '#DC2626';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Total Revenue
          </span>
          <span style={{ fontSize: '26px', fontWeight: 800, color: C.textPrimary }}>
            ₹{data.totalRevenue.toLocaleString('en-IN')}
          </span>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Paid
          </span>
          <span style={{ fontSize: '26px', fontWeight: 800, color: C.paid }}>
            ₹{data.paidRevenue.toLocaleString('en-IN')}
          </span>
          <span style={{ color: C.textSecondary, fontSize: '13px' }}>{data.paidCount} invoice{data.paidCount !== 1 ? 's' : ''}</span>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Outstanding
          </span>
          <span style={{ fontSize: '26px', fontWeight: 800, color: C.unpaid }}>
            ₹{data.unpaidRevenue.toLocaleString('en-IN')}
          </span>
          <span style={{ color: C.textSecondary, fontSize: '13px' }}>{data.unpaidCount} invoice{data.unpaidCount !== 1 ? 's' : ''}</span>
        </div>

        <div style={statCardStyle}>
          <span style={{ color: C.textMuted, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Predicted Next Month
          </span>
          <span style={{ fontSize: '26px', fontWeight: 800, color: C.primary }}>
            ₹{data.predictedNextMonth.toLocaleString('en-IN')}
          </span>
          <span style={{ color: trendColor, fontSize: '13px', fontWeight: 600 }}>
            {trendArrow} ₹{Math.abs(trend).toLocaleString('en-IN')} vs last month
          </span>
        </div>

      </div>

      {/* ── Charts Row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

        {/* Bar Chart — Monthly Revenue */}
        <div style={{ ...cardStyle, flex: 2, minWidth: '300px' }}>
          <h3 style={{ margin: '0 0 20px', color: C.textPrimary, fontSize: '16px', fontWeight: 700 }}>
            📊 Monthly Revenue Trend
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.monthlyBreakdown} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="label" tick={{ fill: C.textSecondary, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fill: C.textSecondary, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']}
                contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', boxShadow: C.shadow }}
                labelStyle={{ color: C.textPrimary, fontWeight: 600 }}
              />
              <Bar dataKey="revenue" fill={C.primary} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart — Revenue Split */}
        <div style={{ ...cardStyle, flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 20px', color: C.textPrimary, fontSize: '16px', fontWeight: 700 }}>
            🥧 Revenue Split
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }) =>
                  percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                }
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={pieColors[index]} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                wrapperStyle={{ color: C.textSecondary, fontSize: '13px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
