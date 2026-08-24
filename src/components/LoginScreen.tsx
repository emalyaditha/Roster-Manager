import React, { useState } from 'react';
import { motion } from 'motion/react';
import { googleSignIn } from '../services/googleAuth';
import { ShieldAlert, Loader2, UserCheck, ChevronRight } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: any) => void;
  initialError?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, initialError }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const { user } = await googleSignIn();
      onLoginSuccess(user);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to authenticate with Google Account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="card shadow-[var(--shadow-md)] rounded-xl w-full max-w-sm p-6 space-y-4 flex flex-col items-center text-center"
      >
        {/* Brand Square */}
        <div className="w-10 h-10 rounded-lg bg-accent text-on-accent flex items-center justify-center font-bold">
          E
        </div>

        {/* Typography */}
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-fg tracking-tight">
            Roster Manager
          </h1>
          <p className="text-xs text-muted leading-relaxed">
            Sign in to manage duty rosters<br />and calendar sync
          </p>
        </div>

        {/* Google Sign-In */}
        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading}
            className="btn-secondary w-full h-10 flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign in with Google</span>
                <ChevronRight className="w-3.5 h-3.5 text-faint ml-auto" />
              </>
            )}
          </button>

          {/* Access Notice */}
          <div className="bg-well border border-line rounded-lg p-3 text-muted text-[11px] leading-relaxed text-left">
            <span className="font-semibold text-fg flex items-center gap-1.5 mb-0.5">
              <UserCheck className="w-3 h-3" /> Authorized accounts only
            </span>
            Access is restricted to staff members configured in system settings.
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-lg p-3 text-xs text-left flex flex-col gap-3"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-sm text-fg">Authentication error</span>
                  <p className="leading-relaxed">{error}</p>
                </div>
              </div>

              {error.includes('authorized domains') && (
                <div className="mt-1 pt-3 space-y-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <p className="font-semibold text-fg text-[11px]">Enable authorized domain in Firebase Console:</p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                    <li>Open <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="underline font-semibold text-accent">console.firebase.google.com</a> and select <strong>em-finance-manage</strong></li>
                    <li>Under <strong>Authentication</strong> &gt; <strong>Settings</strong> &gt; <strong>Authorized domains</strong></li>
                    <li>Add <code className="bg-well px-1 py-0.5 rounded font-mono text-[10px]">{window.location.hostname}</code> and <code className="bg-well px-1 py-0.5 rounded font-mono text-[10px]">roster-manager-ifqt.vercel.app</code></li>
                  </ol>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <p className="text-[10px] text-faint">
          Roster Manager &bull; Google Authentication
        </p>
      </motion.div>
    </div>
  );
};
