/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bgApp: "var(--bg-app)",
        bgCard: "var(--bg-card)",
        bgSubtle: "var(--bg-subtle)",
        borderSubtle: "var(--border-subtle)",
        borderStrong: "var(--border-strong)",
        textPrimary: "var(--text-primary)",
        textSecondary: "var(--text-secondary)",
        textMuted: "var(--text-muted)",
        brandPrimary: "var(--brand-primary)",
        brandPrimaryLight: "var(--brand-primary-light)",
        gain: "var(--gain)",
        gainBg: "var(--gain-bg)",
        loss: "var(--loss)",
        lossBg: "var(--loss-bg)",
        neutralPill: "var(--neutral-pill)",
      },
      fontFamily: {
        sans: ["Inter", "Plus Jakarta Sans", "Geist Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Geist Mono", "IBM Plex Mono", "Consolas", "monospace"],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }
    },
  },
  plugins: [],
}
