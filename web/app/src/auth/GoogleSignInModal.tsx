import { Loader2, Music, UserCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AromaLogo } from '@/components/icons/AromaLogo';
import { useAuth } from './useAuth';

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export function GoogleSignInModal() {
  const isOpen = useAuth((s) => s.signInModalOpen);
  const close = useAuth((s) => s.closeSignInModal);
  const loginWithGoogleToken = useAuth((s) => s.loginWithGoogleToken);
  const isLoading = useAuth((s) => s.isLoading);

  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setShowManual(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleQuickLogin = async (name: string, email: string) => {
    setError(null);
    try {
      const mockId = `mock-user:g_${encodeURIComponent(email)}:${encodeURIComponent(name)}:${encodeURIComponent(email)}`;
      await loginWithGoogleToken(mockId);
      close();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) {
      setError('Please provide both your name and email');
      return;
    }
    void handleQuickLogin(customName.trim(), customEmail.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#161324] p-6 shadow-2xl text-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-modal-title"
      >
        {/* Close Button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header with Aroma Logo */}
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div className="mb-3 p-3 rounded-2xl bg-gradient-to-tr from-[#6842ff]/30 to-[#9d50bb]/20 border border-white/10">
            <AromaLogo className="size-10 text-white" />
          </div>
          <h2 id="signin-modal-title" className="text-xl font-bold tracking-tight">
            Sign in to Aroma
          </h2>
          <p className="mt-1 text-xs text-white/60 max-w-xs">
            Unlock your library, playlists, liked music, and synchronized playback across devices.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Primary Google Sign-In Button */}
        <div className="space-y-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleQuickLogin('Soma Sekhar', 'soma@example.com')}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-medium text-gray-800 shadow hover:bg-gray-100 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin text-gray-600" /> : <GoogleLogo size={20} />}
            <span>Continue with Google</span>
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-white/10" />
            <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-white/40">or choose account</span>
            <div className="flex-grow border-t border-white/10" />
          </div>

          {/* Account Choices */}
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleQuickLogin('Soma Sekhar', 'somasekhar@gmail.com')}
              className="flex items-center gap-3 w-full p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-left transition-colors"
            >
              <div className="size-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-semibold text-sm">
                S
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">Soma Sekhar</div>
                <div className="text-xs text-white/50 truncate">somasekhar@gmail.com</div>
              </div>
              <UserCheck size={16} className="text-[#a78bfa] mr-1 flex-shrink-0" />
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleQuickLogin('New Listener', 'newlistener@gmail.com')}
              className="flex items-center gap-3 w-full p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-left transition-colors"
            >
              <div className="size-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-semibold text-sm">
                N
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">New User Account</div>
                <div className="text-xs text-white/50 truncate">newlistener@gmail.com</div>
              </div>
              <Music size={16} className="text-emerald-400 mr-1 flex-shrink-0" />
            </button>
          </div>

          {/* Toggle Custom Account */}
          {!showManual ? (
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="w-full text-center text-xs text-white/50 hover:text-white/80 py-1 transition-colors"
            >
              Sign in with another Google account
            </button>
          ) : (
            <form onSubmit={handleManualSubmit} className="pt-2 space-y-2.5 border-t border-white/10">
              <div>
                <label className="block text-[11px] font-medium text-white/60 mb-1">Display Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Alex Miller"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/60 mb-1">Google Email</label>
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="alex@gmail.com"
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2 text-xs font-semibold text-white transition-colors"
              >
                Sign In with this Account
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 text-center text-[11px] text-white/40">
          By continuing, you agree to Aroma&apos;s terms and privacy standards.
        </div>
      </div>
    </div>
  );
}
