import { useState } from "react";

export const T = {
  bg: "#07090F", surface: "#0D1117", surface2: "#141A24",
  border: "#1C2333", borderHover: "#2D3F5E",
  accent: "#3B82F6", accentDim: "#1E3A6E", accentGlow: "rgba(59,130,246,0.12)",
  green: "#10B981", greenDim: "rgba(16,185,129,0.1)",
  amber: "#F59E0B", amberDim: "rgba(245,158,11,0.1)",
  red: "#EF4444", redDim: "rgba(239,68,68,0.1)",
  purple: "#8B5CF6", purpleDim: "rgba(139,92,246,0.1)",
  teal: "#14B8A6", tealDim: "rgba(20,184,166,0.1)",
  text: "#E2E8F0", muted: "#64748B", subtle: "#1C2333",
};

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{font-family:'Sora','Apple SD Gothic Neo',sans-serif;background:${T.bg};color:${T.text};min-height:100vh}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:${T.bg}}
  ::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px}
  input,select,textarea{font-family:inherit;color-scheme:dark}
  input::placeholder,textarea::placeholder{color:${T.muted}}
  button{font-family:inherit;cursor:pointer}
  button:focus{outline:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .fade-in{animation:fadeIn .3s ease forwards}

  /* 반응형 레이아웃 */
  @media(min-width:768px){
    .sidebar{display:flex !important}
    .mob-header{display:none !important}
    .mob-menu{display:none !important}
    .main-pad{padding:28px 36px !important}
    .grid2{grid-template-columns:repeat(2,1fr) !important}
    .grid4{grid-template-columns:repeat(4,1fr) !important}
  }
  @media(min-width:1024px){
    .grid3{grid-template-columns:repeat(3,1fr) !important}
  }
`;

export function Badge({ color = T.accent, children, style = {} }) {
  return (
    <span style={{
      background: color + "20", color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700,
      letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", ...style
    }}>{children}</span>
  );
}

export function Card({ children, style = {}, onClick, hoverable = false }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: T.surface, border: `1px solid ${hov && hoverable ? T.borderHover : T.border}`,
        borderRadius: 14, transition: "border-color .2s, box-shadow .2s",
        boxShadow: hov && hoverable ? `0 0 24px ${T.accentGlow}` : "none",
        cursor: onClick ? "pointer" : "default", ...style
      }}>{children}</div>
  );
}

export function Btn({ children, variant = "primary", onClick, style = {}, disabled = false, size = "md" }) {
  const [hov, setHov] = useState(false);
  const pad = { sm: "5px 12px", md: "8px 16px", lg: "11px 24px" }[size];
  const fs = { sm: 11, md: 13, lg: 14 }[size];
  const cfg = {
    primary: { bg: T.accent, hbg: "#2563EB", color: "#fff", border: T.accent },
    ghost: { bg: "transparent", hbg: T.surface2, color: T.muted, border: T.border },
    outline: { bg: "transparent", hbg: T.accentGlow, color: T.accent, border: T.accent },
    danger: { bg: T.red, hbg: "#DC2626", color: "#fff", border: T.red },
    success: { bg: T.green, hbg: "#059669", color: "#fff", border: T.green },
  }[variant] || {};
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? cfg.hbg : cfg.bg, color: cfg.color,
        border: `1px solid ${cfg.border}`, borderRadius: 10, padding: pad, fontSize: fs,
        fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
        transition: "all .15s", letterSpacing: 0.3, display: "inline-flex",
        alignItems: "center", gap: 6, whiteSpace: "nowrap", ...style
      }}>{children}</button>
  );
}

export function Input({ label, value, onChange, placeholder, type = "text", style = {}, required = false }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: T.red }}> *</span>}
      </label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ background: T.bg, border: `1px solid ${focus ? T.accent : T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 13, outline: "none", transition: "border-color .2s", ...style }} />
    </div>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 13, outline: "none", cursor: "pointer" }}>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    </div>
  );
}

export function Textarea({ label, value, onChange, placeholder, rows = 4 }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ background: T.bg, border: `1px solid ${focus ? T.accent : T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.6, transition: "border-color .2s" }} />
    </div>
  );
}

export function Spinner({ text = "AI 생성 중…" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.muted, fontSize: 13, padding: "16px 0" }}>
      <div style={{ width: 18, height: 18, border: `2px solid ${T.border}`, borderTop: `2px solid ${T.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
      {text}
    </div>
  );
}

export function EmptyState({ icon = "◈", title, desc, action }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: T.muted }}>
      <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.35 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 8 }}>{title}</div>
      {desc && <div style={{ fontSize: 12, marginBottom: 20, lineHeight: 1.7 }}>{desc}</div>}
      {action}
    </div>
  );
}

export function StatusBadge({ status }) {
  const cfg = {
    "승인됨": { color: T.green }, "완료": { color: T.green },
    "검토중": { color: T.amber }, "진행중": { color: T.amber },
    "거부됨": { color: T.red }, "오류": { color: T.red },
    "대기중": { color: T.muted }, "초안": { color: T.muted },
  }[status] || { color: T.muted };
  return <Badge color={cfg.color}>{status}</Badge>;
}

export function SeverityBadge({ severity }) {
  const cfg = {
    "Critical": T.red, "Major": T.amber, "Minor": T.amber, "Info": T.teal,
    "심각": T.red, "주요": T.amber, "경미": T.teal,
  }[severity] || T.muted;
  return <Badge color={cfg}>{severity}</Badge>;
}
