import React, { useState } from 'react';
import { motion } from 'motion/react';
import { googleSignIn } from '../services/googleAuth';
import { ShieldAlert, Lock, Loader2, UserCheck, ChevronRight, Sparkles } from 'lucide-react';

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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-slate-100 to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-purple-950/30 flex flex-col items-center justify-center p-4 transition-colors relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-violet-500/3 dark:bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 25 }}
        className="max-w-md w-full bg-white/80 dark:bg-zinc-900/80 glass border border-slate-200/60 dark:border-zinc-800/60 rounded-3xl shadow-2xl shadow-purple-900/5 dark:shadow-black/40 p-8 flex flex-col items-center text-center space-y-6 relative overflow-hidden"
      >
        {/* Accent gradient bar */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-gradient" />

        {/* Brand Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
          className="p-4 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25"
        >
          <Lock className="w-7 h-7" />
        </motion.div>

        {/* Typography */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-2"
        >
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center justify-center gap-2">
            Roster Manager
            <Sparkles className="w-5 h-5 text-purple-500 animate-float" />
          </h1>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
            Sign in with your Google Account to access<br />duty roster & schedule sync
          </p>
        </motion.div>

        {/* Google Authentication Section */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full text-left space-y-4 pt-1"
        >
          {/* Main Primary Google Sign-In Button */}
          <motion.button
            type="button"
            onClick={handleSignIn}
            disabled={loading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:border-purple-300 dark:hover:border-purple-700 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                <span>Signing in with Google...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign in with Google</span>
                <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
              </>
            )}
          </motion.button>

          {/* Access Notice */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
            <span className="font-bold text-slate-800 dark:text-slate-200 mb-0.5 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-purple-600" /> Authorized Accounts Only
            </span>
            Secured for staff members authorized in system settings.
          </div>

          {/* Error Message & Authorized Domain Helper */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex flex-col gap-3"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sm">Authentication Notice</span>
                  <p className="leading-relaxed">{error}</p>
                </div>
              </div>

              {error.includes('authorized domains') && (
                <div className="mt-1 pt-3 border-t border-rose-200/80 dark:border-rose-900/80 space-y-2.5 text-slate-700 dark:text-slate-300">
                  <p className="font-bold text-slate-900 dark:text-white">How to enable & authorize domain in Firebase Console:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    <li>Open <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="underline font-semibold text-purple-600 dark:text-purple-400">console.firebase.google.com</a> and select project <strong className="text-purple-600 dark:text-purple-400">em-finance-manage</strong></li>
                    <li>In the left sidebar under <strong>Project shortcuts</strong>, click <strong>Authentication</strong></li>
                    <li>If prompted with a <em>"Get started"</em> button, click <strong>Get started</strong></li>
                    <li>Under the <strong>Sign-in method</strong> tab, make sure <strong>Google</strong> provider is enabled</li>
                    <li>Click the <strong>Settings</strong> tab at the top of the page</li>
                    <li>Select <strong>Authorized domains</strong> on the left, then click <strong>Add domain</strong></li>
                    <li>Add <code className="bg-rose-100 dark:bg-rose-900/60 px-1 py-0.5 rounded font-mono text-[10px] text-rose-900 dark:text-rose-100">{window.location.hostname}</code> (and <code className="bg-rose-100 dark:bg-rose-900/60 px-1 py-0.5 rounded font-mono text-[10px] text-rose-900 dark:text-rose-100">roster-manager-ifqt.vercel.app</code>) and click <strong>Save</strong></li>
                  </ol>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Footer info */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-[10px] text-slate-400 dark:text-slate-500"
        >
          Roster Manager &bull; Google Authentication
        </motion.p>
      </motion.div>
    </div>
  );
};
