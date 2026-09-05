import React, { useState } from "react";
import { 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  TrendingUp, 
  ArrowRight, 
  Loader2, 
  AlertCircle
} from "lucide-react";
import { LoginResponseData } from "../types";

interface LoginViewProps {
  onLogin: (username: string, pass: string) => Promise<LoginResponseData>;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both User ID and Password.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onLogin(username.trim(), password.trim());
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Access denied.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 relative overflow-hidden font-sans select-none px-4">
      
      {/* Background Ambient Glow & Grid Mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(0,179,134,0.15),transparent_55%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(59,130,246,0.08),transparent_45%)] pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Main Glassmorphic Card Container */}
      <div className="w-full max-w-md relative z-10">
        
        {/* Top Branding Pill */}
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs font-medium text-slate-300 backdrop-blur-md shadow-xl">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-white tracking-wide">NSE India Market Terminal</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Client Access Portal</span>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl transition-all">
          
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-[#00B386] mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3.5">
              <TrendingUp className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Access Control Gate</h1>
            <p className="text-xs text-slate-400 mt-1">
              Authorized credentials required to access institutional market feed & analytics.
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-xs text-red-400 animate-in fade-in zoom-in-95 duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* User ID Field */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                User ID / Account
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your User ID"
                  autoComplete="username"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter security password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-3 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-[#00B386] hover:from-emerald-600 hover:to-[#009e75] text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Verifying Session...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Terminal</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Security / Encryption Guarantee Footer */}
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>HMAC-SHA256 Encrypted Session • Authorized Access Only</span>
        </div>

      </div>

    </div>
  );
};
