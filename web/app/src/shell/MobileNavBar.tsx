import { PrefetchNavLink } from '@/components/PrefetchLink';
import {
  AllPlaylistsIcon,
  HomeIcon,
  NewIcon,
  SearchIcon,
  type NavIconProps,
} from '@/components/icons/NavIcons';

interface MobileNavItem {
  to: string;
  label: string;
  Icon: (props: NavIconProps) => React.ReactNode;
}

const NAV_ITEMS: MobileNavItem[] = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/new', label: 'New', Icon: NewIcon },
  { to: '/library/playlists', label: 'Library', Icon: AllPlaylistsIcon },
];

export function MobileNavBar() {
  return (
    <nav
      className="hidden max-sm:flex fixed inset-x-0 bottom-0 z-[calc(var(--z-web-chrome)-2)] items-center justify-around border-t border-white/10 bg-[#0d0b18]/95 px-2 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl"
      aria-label="Mobile Navigation"
    >
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <PrefetchNavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-150 select-none ${
              isActive
                ? 'text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.6)] font-medium scale-105'
                : 'text-white/50 hover:text-white/80 active:scale-95'
            }`
          }
        >
          <span className="grid size-6 place-items-center">
            <Icon size={20} />
          </span>
          <span className="text-[10px] leading-tight tracking-tight">{label}</span>
        </PrefetchNavLink>
      ))}
    </nav>
  );
}
