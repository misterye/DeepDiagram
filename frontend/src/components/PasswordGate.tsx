import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

const REQUIRED_PASSWORD = import.meta.env.VITE_PASSWORD || '';
const AUTH_KEY = 'deepdiagram_authenticated';

// Compute initial auth state synchronously to prevent flash
function getInitialAuth(): boolean {
    if (!REQUIRED_PASSWORD) return true;
    try {
        return sessionStorage.getItem(AUTH_KEY) === 'true';
    } catch {
        return false;
    }
}

export const PasswordGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [authenticated, setAuthenticated] = useState(getInitialAuth);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [shaking, setShaking] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === REQUIRED_PASSWORD) {
            sessionStorage.setItem(AUTH_KEY, 'true');
            setAuthenticated(true);
        } else {
            setError('密码错误，请重试');
            setShaking(true);
            setTimeout(() => setShaking(false), 500);
            setPassword('');
        }
    };

    if (authenticated) {
        return <>{children}</>;
    }

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
            </div>

            <form
                onSubmit={handleSubmit}
                className={`relative z-10 w-full max-w-sm mx-4 ${shaking ? 'animate-shake' : ''}`}
            >
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                    {/* Logo & Title */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                            <Lock className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-white mb-1">DeepDiagram AI</h1>
                        <p className="text-sm text-slate-400">请输入访问密码</p>
                    </div>

                    {/* Password Input */}
                    <div className="relative mb-4">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            placeholder="输入密码..."
                            autoFocus
                            className="w-full px-5 py-3.5 bg-white/10 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm pr-12"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <p className="text-red-400 text-xs font-medium text-center">{error}</p>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={!password}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-bold hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                        <span>进入</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </form>

            {/* Shake animation */}
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
                    20%, 40%, 60%, 80% { transform: translateX(4px); }
                }
                .animate-shake { animation: shake 0.5s ease-in-out; }
            `}</style>
        </div>
    );
};
