import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AromaLogo } from '@/components/icons/AromaLogo';
import { config, isGoogleAuthConfigured } from '@/config';
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

  const [error, setError] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const isConfigured = isGoogleAuthConfigured();

  // Initialize Official Google Identity Services SDK only when a valid Client ID is configured
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      return;
    }

    if (!isConfigured) {
      return;
    }

    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const setupGoogleIdentity = () => {
      if (!window.google?.accounts?.id) {
        if (attempts < 15) {
          attempts++;
          timer = setTimeout(setupGoogleIdentity, 200);
        } else if (isMounted) {
          setGisLoaded(false);
        }
        return;
      }

      if (!isMounted) return;
      setGisLoaded(true);

      try {
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (response) => {
            if (!response?.credential) {
              setError('Google authentication failed. Please try again.');
              return;
            }
            setError(null);
            try {
              await loginWithGoogleToken(response.credential);
              close();
            } catch (err: any) {
              setError(err.message || 'Account verification failed. Please try again.');
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
          ux_mode: 'popup',
        });

        if (buttonContainerRef.current) {
          buttonContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(buttonContainerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'left',
            width: 320,
          });
        }

        // Prompt Google's native account chooser / One Tap
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed()) {
            console.debug('Google account prompt not displayed:', notification.getNotDisplayedReason?.());
          }
        });
      } catch (e: any) {
        console.error('Error initializing Google Identity Services:', e);
        setError('Failed to initialize Google Sign-In. Please check your network connection.');
      }
    };

    setupGoogleIdentity();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, isConfigured, close, loginWithGoogleToken]);

  if (!isOpen) return null;

  const handleManualTrigger = () => {
    setError(null);
    if (!isConfigured) {
      setError('Google Sign-In is not configured. Please set VITE_GOOGLE_CLIENT_ID first.');
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError('Loading Google authentication services... Please try again in a moment.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#161324] p-6 shadow-2xl text-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-modal-title"
      >
        {/* Close Button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header with Aroma Logo */}
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div className="mb-3 p-3 rounded-2xl bg-gradient-to-tr from-[#6842ff]/30 to-[#9d50bb]/20 border border-white/10 shadow-lg">
            <AromaLogo className="size-10 text-white" />
          </div>
          <h2 id="signin-modal-title" className="text-xl font-bold tracking-tight text-white">
            Sign in to Aroma
          </h2>
          <p className="mt-1 text-xs text-white/60 max-w-xs leading-relaxed">
            Unlock your library, playlists, liked music, and synchronized playback across devices.
          </p>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/15 border border-red-500/40 p-3.5 text-xs text-red-200 flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        {/* Configuration Setup State: Shown when VITE_GOOGLE_CLIENT_ID is not yet configured */}
        {!isConfigured ? (
          <div className="my-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
            <div className="flex items-center gap-2 font-semibold text-xs text-amber-300 mb-1.5">
              <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
              <span>Google Sign-In Configuration Required</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed mb-3">
              To prevent authorization errors (<code className="text-amber-300">401: invalid_client</code>), provide your official Google OAuth 2.0 Web Client ID from Google Cloud Console.
            </p>
            <div className="rounded-lg bg-black/40 border border-white/10 p-2.5 text-[11px] font-mono text-white/80">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Configuration Key</div>
              <div className="select-all text-amber-300">VITE_GOOGLE_CLIENT_ID=&lt;client-id&gt;.apps.googleusercontent.com</div>
            </div>
            <p className="mt-2 text-[10px] text-white/50 leading-relaxed">
              Add this to <code className="text-white/70">web/app/.env.local</code> (or your Render Web Service environment variables).
            </p>
          </div>
        ) : (
          /* Official Google Identity Services Container */
          <div className="flex flex-col items-center justify-center min-h-[50px] my-2">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-white/70">
                <Loader2 size={20} className="animate-spin text-[#9d50bb]" />
                <span>Verifying Google account...</span>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                {/* Google's official rendered button */}
                <div
                  ref={buttonContainerRef}
                  className="w-full flex justify-center min-h-[44px]"
                />

                {/* Fallback button if GIS script is delayed or blocked */}
                {!gisLoaded && (
                  <button
                    type="button"
                    onClick={handleManualTrigger}
                    className="flex w-full max-w-[320px] items-center justify-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 font-medium text-white shadow hover:bg-white/15 transition-all cursor-pointer"
                  >
                    <GoogleLogo size={18} />
                    <span>Continue with Google</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Security & Verification Guarantees */}
        <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/90 mb-1.5">
            <ShieldCheck size={15} className="text-emerald-400" />
            <span>Official Google Authentication</span>
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Aroma requests only standard openid identity scopes (email, profile).
            Accounts are cryptographically verified by Google and protected against unauthorized access.
          </p>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-white/40">
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} className="text-emerald-400" /> Real Google IDs only
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} className="text-emerald-400" /> Verified emails only
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} className="text-emerald-400" /> Isolated user data
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 text-center text-[11px] text-white/40">
          By signing in, you agree to Aroma&apos;s terms of service and privacy standards.
        </div>
      </div>
    </div>
  );
}