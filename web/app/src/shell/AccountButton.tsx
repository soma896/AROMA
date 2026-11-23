import { ArrowUpRight, ChevronsUpDown, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { GoogleLogo, GoogleSignInModal } from '@/auth/GoogleSignInModal';
import { useAuth } from '@/auth/useAuth';
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '@/components/Menu';
import { useRefreshYtAuth, useSelectChannel, useSetConnected, useYtAuth } from '@/extension/useYtAuth';

const avatarClass = 'inline-grid flex-none place-items-center rounded-full bg-quinary object-cover type-[600_11px/1] text-secondary';

function UserAvatar({ src, name, size }: { src?: string | null; name: string; size: number }) {
  return src ? (
    <img className={avatarClass} src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className={avatarClass} style={{ width: size, height: size }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Aroma Account Control in the sidebar.
 * Displays "Continue with Google" when signed out,
 * and user profile + account menu when signed in.
 */
export function AccountButton() {
  const { user, isAuthenticated, logout, openSignInModal } = useAuth();
  const ytStatus = useYtAuth();
  const select = useSelectChannel();
  const connect = useSetConnected();
  const refresh = useRefreshYtAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);

  // 1. Authenticated Aroma User
  if (isAuthenticated && user) {
    return (
      <>
        <button
          className="flex w-full min-w-0 items-center gap-2 rounded-nav px-1 py-1.5 text-start type-body-reduced text-primary hover:bg-quinary aria-expanded:bg-quinary cursor-pointer transition-colors"
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
        >
          <UserAvatar src={user.picture} name={user.name} size={24} />
          <span className="min-w-0 flex-1 truncate font-medium text-[13px]">{user.name}</span>
          <ChevronsUpDown size={14} strokeWidth={2} className="flex-none text-secondary" />
        </button>

        {anchor && (
          <Menu anchor={anchor} placement="above-start" onClose={close} label="Account">
            <div role="group" aria-label={user.name}>
              <MenuHeader>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-white">{user.name}</span>
                  <span className="text-[11px] text-white/50">{user.email}</span>
                </div>
              </MenuHeader>
              <div className="px-3 py-1 text-[11px] text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck size={13} />
                <span>Google Account Synced</span>
              </div>
            </div>

            {/* If YouTube Extension is also active */}
            {ytStatus.state === 'ready' && ytStatus.auth.active && (
              <>
                <MenuSeparator />
                <div role="group" aria-label="YouTube Music">
                  <MenuHeader>YouTube Music Connected</MenuHeader>
                  <MenuItem
                    icon={<UserAvatar src={ytStatus.auth.active.avatarUrl} name={ytStatus.auth.active.name} size={20} />}
                    onSelect={close}
                  >
                    {ytStatus.auth.active.name}
                  </MenuItem>
                </div>
              </>
            )}

            <MenuSeparator />
            <MenuItem
              onSelect={() => {
                close();
                openSignInModal();
              }}
              icon={<UserIcon size={14} />}
            >
              Switch Account
            </MenuItem>
            <MenuItem
              destructive
              icon={<LogOut size={14} />}
              onSelect={() => {
                close();
                void logout();
              }}
            >
              Sign Out
            </MenuItem>
          </Menu>
        )}
        <GoogleSignInModal />
      </>
    );
  }

  // 2. Signed out: Render high-fidelity "Continue with Google" button
  return (
    <>
      <button
        type="button"
        onClick={openSignInModal}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/15 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-all cursor-pointer"
        aria-label="Continue with Google"
      >
        <GoogleLogo size={16} />
        <span className="truncate">Continue with Google</span>
      </button>
      <GoogleSignInModal />
    </>
  );
}
