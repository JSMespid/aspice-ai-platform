import { useState } from "react";

// ── Notion/Figma-inspired Light Theme Tokens ─────────────────────────────────
export const T = {
  // Backgrounds
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surface2: "#F7F7F5",
  surfaceHover: "#F0F0EE",
  
  // Borders
  border: "#E8E5E0",
  borderHover: "#D3D0CB",
  borderFocus: "#2383E2",

  // Brand / Accent
  accent: "#2383E2",
  accentDim: "#EBF5FF",
  accentGlow: "rgba(35,131,226,0.08)",
  accentHover: "#1A6DC4",

  // Semantic colors
  green: "#0F7B6C",
  greenDim: "#EDFAF6",
  greenBorder: "#B8E6D9",
  amber: "#C77D1A",
  amberDim: "#FFF8EB",
  amberBorder: "#F5D9A3",
  red: "#E03E3E",
  redDim: "#FFF0F0",
  redBorder: "#F5B8B8",
  purple: "#6940A5",
  purpleDim: "#F5F0FF",
  purpleBorder: "#D4C0F0",
  teal: "#0C7D8C",
  tealDim: "#EDFBFD",
  tealBorder: "#B3E4EC",

  // Text
  text: "#37352F",
  textSecondary: "#6B6B6B",
  muted: "#9B9A97",
  subtle: "#E8E5E0",
  textInverse: "#FFFFFF",

  // Pipeline process colors
  process: {
    "SYS.1": "#2383E2",
    "SYS.2": "#6940A5",
    "SYS.3": "#0C7D8C",
    "SYS.4": "#C77D1A",
    "SYS.5": "#0F7B6C",
  },
};

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{
    font-family:'IBM Plex Sans','Apple SD Gothic Neo',-apple-system,BlinkMacSystemFont,sans-serif;
    background:${T.bg};
    color:${T.text};
    min-height:100vh;
    -webkit-font-smoothing:antialiased;
    -moz-osx-font-smoothing:grayscale;
  }
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:${T.border};border-radius:10px}
  ::-webkit-scrollbar-thumb:hover{background:${T.borderHover}}
  input,select,textarea{font-family:inherit;color-scheme:light}
  input::placeholder,textarea::placeholder{color:${T.muted}}
  button{font-family:inherit;cursor:pointer}
  button:focus-visible{outline:2px solid ${T.accent};outline-offset:2px;border-radius:6px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  .fade-in{animation:fadeIn .25s ease forwards}

  @media(min-width:768px){
    .sidebar{display:flex !important}
    .mob-header{display:none !important}
    .mob-menu{display:none !important}
    .main-pad{padding:32px 40px !important}
    .grid2{grid-template-columns:repeat(2,1fr) !important}
    .grid4{grid-template-columns:repeat(4,1fr) !important}
  }
  @media(min-width:1024px){
    .grid3{grid-template-columns:repeat(3,1fr) !important}
  }
`;

// ── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ color = T.accent, children, style = {} }) {
  const dim = color + "18";
  return (
    <span style={{
      background: dim, color, border: `1px solid ${color}30`,
      borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 600,
      letterSpacing: 0.2, whiteSpace: "nowrap", lineHeight: "18px",
      display: "inline-flex", alignItems: "center", ...style
    }}>{children}</span>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, onClick, hoverable = false }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: T.surface,
        border: `1px solid ${hov && hoverable ? T.borderHover : T.border}`,
        borderRadius: 10, transition: "all .15s ease",
        boxShadow: hov && hoverable
          ? "0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(35,131,226,0.15)"
          : "0 1px 2px rgba(0,0,0,0.04)",
        cursor: onClick ? "pointer" : "default", ...style
      }}>{children}</div>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", onClick, style = {}, disabled = false, size = "md" }) {
  const [hov, setHov] = useState(false);
  const pad = { sm: "4px 10px", md: "7px 14px", lg: "10px 20px" }[size];
  const fs = { sm: 12, md: 13, lg: 14 }[size];
  const cfg = {
    primary: {
      bg: T.accent, hbg: T.accentHover, color: "#fff",
      border: T.accent, shadow: "0 1px 3px rgba(35,131,226,0.25)"
    },
    ghost: {
      bg: "transparent", hbg: T.surfaceHover, color: T.textSecondary,
      border: "transparent", shadow: "none"
    },
    outline: {
      bg: "transparent", hbg: T.accentDim, color: T.accent,
      border: T.border, shadow: "none"
    },
    danger: {
      bg: T.red, hbg: "#CC3333", color: "#fff",
      border: T.red, shadow: "0 1px 3px rgba(224,62,62,0.25)"
    },
    success: {
      bg: T.green, hbg: "#0A6A5D", color: "#fff",
      border: T.green, shadow: "0 1px 3px rgba(15,123,108,0.25)"
    },
  }[variant] || {};
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: disabled ? T.surfaceHover : hov ? cfg.hbg : cfg.bg,
        color: disabled ? T.muted : cfg.color,
        border: `1px solid ${disabled ? T.border : hov && variant === "outline" ? T.accent : cfg.border}`,
        borderRadius: 7, padding: pad, fontSize: fs,
        fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all .12s ease", letterSpacing: "-0.01em",
        display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
        boxShadow: disabled ? "none" : (hov ? "none" : cfg.shadow),
        ...style
      }}>{children}</button>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
export function Input({ label, value, onChange, placeholder, type = "text", style = {}, required = false }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{
          fontSize: 13, color: T.textSecondary, fontWeight: 500,
          letterSpacing: "-0.01em",
        }}>
          {label}{required && <span style={{ color: T.red, marginLeft: 2 }}>*</span>}
        </label>
      )}
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          background: T.surface,
          border: `1px solid ${focus ? T.borderFocus : T.border}`,
          borderRadius: 7, padding: "8px 12px", color: T.text, fontSize: 14,
          outline: "none", transition: "border-color .15s, box-shadow .15s",
          boxShadow: focus ? `0 0 0 3px ${T.accentGlow}` : "none",
          ...style
        }} />
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{
          fontSize: 13, color: T.textSecondary, fontWeight: 500,
          letterSpacing: "-0.01em",
        }}>{label}</label>
      )}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 7, padding: "8px 12px", color: T.text, fontSize: 14,
          outline: "none", cursor: "pointer",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%239B9A97' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          paddingRight: 30,
        }}>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    </div>
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({ label, value, onChange, placeholder, rows = 4, style: extraStyle = {} }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{
          fontSize: 13, color: T.textSecondary, fontWeight: 500,
          letterSpacing: "-0.01em",
        }}>{label}</label>
      )}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          background: T.surface,
          border: `1px solid ${focus ? T.borderFocus : T.border}`,
          borderRadius: 7, padding: "8px 12px", color: T.text, fontSize: 14,
          outline: "none", resize: "vertical", lineHeight: 1.6,
          transition: "border-color .15s, box-shadow .15s",
          boxShadow: focus ? `0 0 0 3px ${T.accentGlow}` : "none",
          ...extraStyle,
        }} />
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ text = "AI 생성 중…" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      color: T.textSecondary, fontSize: 13, padding: "14px 0"
    }}>
      <div style={{
        width: 16, height: 16,
        border: `2px solid ${T.border}`, borderTop: `2px solid ${T.accent}`,
        borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0
      }} />
      {text}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = "◇", title, desc, action }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: T.muted }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, marginBottom: 18, lineHeight: 1.7, color: T.textSecondary }}>{desc}</div>}
      {action}
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const cfg = {
    "승인됨": { bg: T.greenDim, color: T.green, border: T.greenBorder },
    "완료": { bg: T.greenDim, color: T.green, border: T.greenBorder },
    "검토중": { bg: T.amberDim, color: T.amber, border: T.amberBorder },
    "진행중": { bg: T.amberDim, color: T.amber, border: T.amberBorder },
    "거부됨": { bg: T.redDim, color: T.red, border: T.redBorder },
    "오류": { bg: T.redDim, color: T.red, border: T.redBorder },
    "대기중": { bg: T.surface2, color: T.muted, border: T.border },
    "초안": { bg: T.surface2, color: T.textSecondary, border: T.border },
  }[status] || { bg: T.surface2, color: T.muted, border: T.border };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 600,
      letterSpacing: 0.2, whiteSpace: "nowrap", lineHeight: "18px",
      display: "inline-flex", alignItems: "center",
    }}>{status}</span>
  );
}

// ── SeverityBadge ────────────────────────────────────────────────────────────
export function SeverityBadge({ severity }) {
  const map = {
    "Critical": { bg: T.redDim, color: T.red, border: T.redBorder },
    "Major": { bg: T.amberDim, color: T.amber, border: T.amberBorder },
    "Minor": { bg: T.amberDim, color: T.amber, border: T.amberBorder },
    "Info": { bg: T.tealDim, color: T.teal, border: T.tealBorder },
    "심각": { bg: T.redDim, color: T.red, border: T.redBorder },
    "주요": { bg: T.amberDim, color: T.amber, border: T.amberBorder },
    "경미": { bg: T.tealDim, color: T.teal, border: T.tealBorder },
  };
  const cfg = map[severity] || { bg: T.surface2, color: T.muted, border: T.border };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 600,
      letterSpacing: 0.2, whiteSpace: "nowrap",
    }}>{severity}</span>
  );
}
