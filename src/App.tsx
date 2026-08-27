import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Grid3X3,
  Mic,
  Play,
  Plus,
  Settings,
  Sparkles,
  Tv,
  Volume2,
  X,
  Zap,
} from 'lucide-react';

interface AppItem {
  pkg: string;
  name: string;
  icon?: string;
  banner?: string;
  category?: string;
}

interface MemoryInfo {
  avail: number;
  total: number;
}

type FocusZone = 'search' | 'settings' | 'side' | 'shortcuts' | 'featured' | 'continue';

interface FocusState {
  zone: FocusZone;
  index: number;
}

interface MediaCard {
  id: string;
  title: string;
  eyebrow: string;
  artwork: string;
  app?: AppItem;
}

declare global {
  interface Window {
    AndroidBridge?: {
      getInstalledApps(): string;
      openApp(pkg: string): void;
      openSystemApp(pkg: string): void;
      openSystemSettings(): void;
      getMemoryInfo(): string;
      boostDevice(): number;
      isWifiConnected(): boolean;
      requestNotificationAccess(): void;
      uninstallApp(pkg: string): void;
      startVoiceSearch(): void;
    };
    tvKey?: (key: string) => void;
    openAllSettings?: () => void;
    openSrm?: () => void;
    askNotifPerm?: () => void;
    loadApps?: () => void;
    closeVoice?: () => void;
  }
}

const MOCK_APPS: AppItem[] = [
  { pkg: 'com.google.android.tv', name: 'Google TV', category: 'Entertainment' },
  { pkg: 'com.android.vending', name: 'Google Play Movies & TV', category: 'Movies' },
  { pkg: 'com.google.android.youtube.tv', name: 'YouTube', category: 'Media' },
  { pkg: 'com.google.android.play.games', name: 'Google Play Movies', category: 'Movies' },
  { pkg: 'com.google.android.apps.youtube.music', name: 'YouTube Music', category: 'Music' },
  { pkg: 'com.netflix.ninja', name: 'Netflix', category: 'Media' },
  { pkg: 'com.primevideo.android', name: 'Prime Video', category: 'Media' },
  { pkg: 'com.disney.disneyplus', name: 'Disney+', category: 'Media' },
  { pkg: 'com.spotify.tv.android', name: 'Spotify', category: 'Music' },
  { pkg: 'com.plexapp.android', name: 'Plex', category: 'Media' },
];

const ARTWORKS = [
  'art-butterfly',
  'art-blue-hour',
  'art-turquoise',
  'art-noir',
  'art-forest',
  'art-berry',
  'art-silver',
  'art-warm',
];

const FEATURED_TITLES = [
  ['Fairy', 'Because every story deserves a little magic.'],
  ['The Last Letter', 'Only the truth remains.'],
  ['My Choice', 'A new beginning starts here.'],
  ['Red Horizon', 'Nothing stays buried forever.'],
];

const CONTINUE_TITLES = [
  ['Journey', 'Continue watching'],
  ['Tumble Dry', 'Continue watching'],
  ['The Comedian', 'Continue watching'],
  ['Night Call', 'Continue watching'],
];

function appInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function AppVisual({ app, className = '', preferBanner = false }: { app: AppItem; className?: string; preferBanner?: boolean }) {
  const visual = preferBanner && app.banner ? app.banner : app.icon;
  if (visual) {
    return <img className={`app-visual ${className}`} src={`data:image/png;base64,${visual}`} alt="" />;
  }

  const name = app.name.toLowerCase();
  if (name.includes('youtube')) {
    return <span className={`brand-youtube ${className}`}><span className="play-triangle" />YouTube</span>;
  }
  if (name.includes('play')) {
    return <span className={`brand-play ${className}`}><Play aria-hidden="true" /> <small>Google Play</small></span>;
  }
  if (name.includes('google tv')) {
    return <span className={`brand-g-tv ${className}`}>TV</span>;
  }
  return <span className={`app-monogram ${className}`}>{appInitials(app.name)}</span>;
}

export default function App() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [focus, setFocus] = useState<FocusState>({ zone: 'shortcuts', index: 1 });
  const [activeSide, setActiveSide] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const [memory, setMemory] = useState<MemoryInfo>({ avail: 0, total: 0 });
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const directionFrameRef = useRef<number | null>(null);
  const queuedDirectionRef = useRef<string | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  const refreshApps = useCallback(() => {
    try {
      const raw = window.AndroidBridge?.getInstalledApps();
      const parsed = raw ? JSON.parse(raw) : [];
      setApps(Array.isArray(parsed) && parsed.length > 0 ? parsed : MOCK_APPS);
    } catch {
      setApps(MOCK_APPS);
    }
  }, []);

  const refreshStatus = useCallback(() => {
    try {
      const raw = window.AndroidBridge?.getMemoryInfo?.();
      if (raw) setMemory(JSON.parse(raw));
    } catch {
      // Status is optional for browser preview.
    }
  }, []);

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const timer = window.setInterval(updateClock, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshApps();
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshApps, refreshStatus]);

  const shortcuts = useMemo(() => {
    const available = apps.length > 0 ? apps : MOCK_APPS;
    return available.slice(0, 5);
  }, [apps]);

  const featured = useMemo<MediaCard[]>(() => {
    const source = apps.length > 0 ? apps : MOCK_APPS;
    return FEATURED_TITLES.map(([title, eyebrow], index) => ({
      id: `featured-${index}`,
      title,
      eyebrow,
      artwork: ARTWORKS[index],
      app: source[index % source.length],
    }));
  }, [apps]);

  const continueWatching = useMemo<MediaCard[]>(() => {
    const source = apps.length > 0 ? apps : MOCK_APPS;
    return CONTINUE_TITLES.map(([title, eyebrow], index) => ({
      id: `continue-${index}`,
      title,
      eyebrow,
      artwork: ARTWORKS[index + 4],
      app: source[(index + 4) % source.length],
    }));
  }, [apps]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2_500);
  }, []);

  const launchApp = useCallback((app?: AppItem) => {
    if (!app) return;
    if (window.AndroidBridge?.openApp) {
      window.AndroidBridge.openApp(app.pkg);
    } else {
      notify(`Opening ${app.name}`);
    }
  }, [notify]);

  const startVoiceSearch = useCallback(() => {
    if (window.AndroidBridge?.startVoiceSearch) {
      document.getElementById('micBtn')?.classList.add('is-listening');
      window.AndroidBridge.startVoiceSearch();
    } else {
      notify('Voice search is ready on your Android TV device.');
    }
  }, [notify]);

  const showSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const focusedApp = useCallback((): AppItem | undefined => {
    if (focus.zone === 'shortcuts') return shortcuts[focus.index];
    if (focus.zone === 'featured') return featured[focus.index]?.app;
    if (focus.zone === 'continue') return continueWatching[focus.index]?.app;
    return undefined;
  }, [continueWatching, featured, focus, shortcuts]);

  const zoneLength = useCallback((zone: FocusZone) => {
    if (zone === 'side') return 3;
    if (zone === 'shortcuts') return shortcuts.length;
    if (zone === 'featured') return featured.length;
    if (zone === 'continue') return continueWatching.length;
    return 1;
  }, [continueWatching.length, featured.length, shortcuts.length]);

  const handleTvKey = useCallback((key: string) => {
    if (isSettingsOpen) {
      if (key === 'BACK') setSettingsOpen(false);
      return;
    }

    if (key === 'OK_LONG') {
      const app = focusedApp();
      if (app) setSelectedApp(app);
      return;
    }

    if (key === 'OK') {
      if (focus.zone === 'search') startVoiceSearch();
      else if (focus.zone === 'settings') showSettings();
      else if (focus.zone === 'side') {
        setActiveSide(focus.index);
        if (focus.index === 1) setFocus({ zone: 'continue', index: 0 });
        if (focus.index === 2) setFocus({ zone: 'featured', index: 0 });
      } else {
        launchApp(focusedApp());
      }
      return;
    }

    if (key === 'BACK') {
      if (focus.zone !== 'shortcuts') setFocus({ zone: 'shortcuts', index: 0 });
      return;
    }

    setFocus((previous) => {
      const index = previous.index;
      const clampIndex = (zone: FocusZone, target: number) => Math.max(0, Math.min(target, zoneLength(zone) - 1));

      if (previous.zone === 'search') {
        if (key === 'RIGHT') return { zone: 'settings', index: 0 };
        if (key === 'DOWN') return { zone: 'shortcuts', index: 0 };
        return previous;
      }
      if (previous.zone === 'settings') {
        if (key === 'LEFT') return { zone: 'search', index: 0 };
        if (key === 'DOWN') return { zone: 'shortcuts', index: 0 };
        return previous;
      }
      if (previous.zone === 'side') {
        if (key === 'UP') return { zone: 'side', index: clampIndex('side', index - 1) };
        if (key === 'DOWN') return { zone: 'side', index: clampIndex('side', index + 1) };
        if (key === 'RIGHT') return { zone: 'shortcuts', index: 0 };
        return previous;
      }
      if (previous.zone === 'shortcuts') {
        if (key === 'RIGHT') return { zone: 'shortcuts', index: clampIndex('shortcuts', index + 1) };
        if (key === 'LEFT') return index === 0 ? { zone: 'side', index: activeSide } : { zone: 'shortcuts', index: index - 1 };
        if (key === 'UP') return { zone: 'search', index: 0 };
        if (key === 'DOWN') return { zone: 'featured', index: clampIndex('featured', index) };
        return previous;
      }
      if (previous.zone === 'featured') {
        if (key === 'RIGHT') return { zone: 'featured', index: clampIndex('featured', index + 1) };
        if (key === 'LEFT') return index === 0 ? { zone: 'side', index: 2 } : { zone: 'featured', index: index - 1 };
        if (key === 'UP') return { zone: 'shortcuts', index: clampIndex('shortcuts', index) };
        if (key === 'DOWN') return { zone: 'continue', index: clampIndex('continue', index) };
        return previous;
      }
      if (previous.zone === 'continue') {
        if (key === 'RIGHT') return { zone: 'continue', index: clampIndex('continue', index + 1) };
        if (key === 'LEFT') return index === 0 ? { zone: 'side', index: 1 } : { zone: 'continue', index: index - 1 };
        if (key === 'UP') return { zone: 'featured', index: clampIndex('featured', index) };
        return previous;
      }
      return previous;
    });
  }, [activeSide, focusedApp, isSettingsOpen, launchApp, showSettings, startVoiceSearch, zoneLength]);

  const dispatchTvKey = useCallback((key: string) => {
    const isDirection = key === 'UP' || key === 'DOWN' || key === 'LEFT' || key === 'RIGHT';
    if (!isDirection) {
      handleTvKey(key);
      return;
    }

    // Some low-power Android 7 WebViews queue repeat events faster than React
    // can paint. Keep the latest direction and render at most once per frame.
    queuedDirectionRef.current = key;
    if (directionFrameRef.current !== null) return;

    directionFrameRef.current = window.requestAnimationFrame(() => {
      directionFrameRef.current = null;
      const queuedKey = queuedDirectionRef.current;
      queuedDirectionRef.current = null;
      if (queuedKey) handleTvKey(queuedKey);
    });
  }, [handleTvKey]);

  useEffect(() => {
    window.tvKey = dispatchTvKey;
    window.loadApps = refreshApps;
    window.openAllSettings = showSettings;
    window.openSrm = () => setFocus({ zone: 'search', index: 0 });
    window.askNotifPerm = () => undefined;
    window.closeVoice = () => document.getElementById('micBtn')?.classList.remove('is-listening');
    return () => {
      if (directionFrameRef.current !== null) window.cancelAnimationFrame(directionFrameRef.current);
    };
  }, [dispatchTvKey, refreshApps, showSettings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const keyMap: Record<string, string> = {
        ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
        Enter: 'OK', Escape: 'BACK', Backspace: 'BACK',
      };
      const mapped = keyMap[event.key];
      if (mapped) {
        event.preventDefault();
        dispatchTvKey(mapped);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatchTvKey]);

  useEffect(() => {
    if (focus.zone !== 'featured' && focus.zone !== 'continue') return;
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);

    // Only move the vertical rail when the newly focused card is actually
    // outside the viewport. This avoids queuing smooth scroll animations for
    // every directional event on older Android TV WebViews.
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const activeElement = document.querySelector<HTMLElement>(
        `[data-focus-zone="${focus.zone}"][data-focus-index="${focus.index}"]`,
      );
      const container = document.querySelector<HTMLElement>('.launcher-content');
      if (!activeElement || !container) return;

      const card = activeElement.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      const safePadding = 18;
      if (card.top < viewport.top + safePadding) {
        container.scrollTop -= viewport.top + safePadding - card.top;
      } else if (card.bottom > viewport.bottom - safePadding) {
        container.scrollTop += card.bottom - (viewport.bottom - safePadding);
      }
    });
  }, [focus]);

  const boostDevice = () => {
    const freed = window.AndroidBridge?.boostDevice?.();
    refreshStatus();
    notify(typeof freed === 'number' ? `${freed} MB of memory refreshed` : 'Device memory refreshed');
  };

  return (
    <div className="launcher-shell">
      <div className="ambient ambient-violet" />
      <div className="ambient ambient-cyan" />
      <div className="dark-vignette" />

      <header className="launcher-header">
        <button
          id="micBtn"
          className={`search-pill ${focus.zone === 'search' ? 'is-focused' : ''}`}
          data-focus-zone="search"
          data-focus-index="0"
          onClick={() => { setFocus({ zone: 'search', index: 0 }); startVoiceSearch(); }}
        >
          <Mic aria-hidden="true" />
          <span>Search movies, TV, and more</span>
        </button>
        <div className="header-actions">
          <button
            className={`header-icon ${focus.zone === 'settings' ? 'is-focused' : ''}`}
            data-focus-zone="settings"
            data-focus-index="0"
            aria-label="Settings"
            onClick={() => { setFocus({ zone: 'settings', index: 0 }); showSettings(); }}
          >
            <Settings aria-hidden="true" />
          </button>
          <time>{currentTime || '2:45'}</time>
        </div>
      </header>

      <aside className="side-rail" aria-label="Launcher navigation">
        {[
          { label: 'Apps', icon: Grid3X3, tone: 'apps' },
          { label: 'Play Next', icon: Play, tone: 'next' },
          { label: 'Play Movies & TV', icon: Clapperboard, tone: 'movies' },
        ].map((item, index) => {
          const Icon = item.icon;
          const isFocused = focus.zone === 'side' && focus.index === index;
          return (
            <button
              key={item.label}
              className={`side-action ${item.tone} ${activeSide === index ? 'is-active' : ''} ${isFocused ? 'is-focused' : ''}`}
              data-focus-zone="side"
              data-focus-index={index}
              onClick={() => {
                setFocus({ zone: 'side', index });
                setActiveSide(index);
                if (index === 1) setFocus({ zone: 'continue', index: 0 });
                if (index === 2) setFocus({ zone: 'featured', index: 0 });
              }}
            >
              <span className="side-icon"><Icon aria-hidden="true" /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </aside>

      <main className="launcher-content">
        <section className="app-shortcuts" aria-label="Applications">
          <div className="shortcut-track">
            {shortcuts.map((app, index) => {
              const isFocused = focus.zone === 'shortcuts' && focus.index === index;
              return (
                <button
                  key={app.pkg}
                  className={`app-tile ${isFocused ? 'is-focused' : ''}`}
                  data-focus-zone="shortcuts"
                  data-focus-index={index}
                  onClick={() => { setFocus({ zone: 'shortcuts', index }); launchApp(app); }}
                  onContextMenu={(event) => { event.preventDefault(); setFocus({ zone: 'shortcuts', index }); setSelectedApp(app); }}
                  aria-label={`Open ${app.name}`}
                >
                  <AppVisual app={app} preferBanner />
                  <span className="app-banner-caption">{app.name}</span>
                </button>
              );
            })}
            <button className="app-tile add-tile" onClick={() => { setFocus({ zone: 'shortcuts', index: shortcuts.length - 1 }); notify('All installed applications are available in the Apps section.'); }} aria-label="All applications">
              <Plus aria-hidden="true" />
            </button>
          </div>
        </section>

        <MediaRail
          title="Play Movies & TV"
          cards={featured}
          zone="featured"
          focus={focus}
          onFocus={setFocus}
          onPlay={launchApp}
          onOptions={setSelectedApp}
        />
        <MediaRail
          title="Play Next"
          cards={continueWatching}
          zone="continue"
          focus={focus}
          onFocus={setFocus}
          onPlay={launchApp}
          onOptions={setSelectedApp}
          showProgress
        />
      </main>

      {toast && <div className="toast"><Sparkles aria-hidden="true" />{toast}</div>}

      {selectedApp && (
        <div className="modal-backdrop" role="presentation">
          <section className="launcher-modal" role="dialog" aria-modal="true" aria-label={`${selectedApp.name} options`}>
            <button className="modal-close" aria-label="Close" onClick={() => setSelectedApp(null)}><X /></button>
            <div className="modal-app-title"><AppVisual app={selectedApp} /><div><strong>{selectedApp.name}</strong><span>Application options</span></div></div>
            <button onClick={() => { setSelectedApp(null); launchApp(selectedApp); }}><Play />Open application</button>
            <button onClick={() => { setSelectedApp(null); window.AndroidBridge?.openSystemApp?.(selectedApp.pkg); }}>Application info</button>
            <button className="danger" onClick={() => { setSelectedApp(null); window.AndroidBridge?.uninstallApp?.(selectedApp.pkg); }}>Uninstall application</button>
          </section>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="launcher-modal settings-modal" role="dialog" aria-modal="true" aria-label="Launcher settings">
            <button className="modal-close" aria-label="Close" onClick={() => setSettingsOpen(false)}><X /></button>
            <div className="modal-heading"><Settings /> <strong>Launcher settings</strong></div>
            <button onClick={() => { setSettingsOpen(false); window.AndroidBridge?.openSystemSettings?.(); }}><Settings />Android system settings</button>
            <button onClick={() => { setSettingsOpen(false); window.AndroidBridge?.requestNotificationAccess?.(); }}><Volume2 />Notification permissions</button>
            <button onClick={boostDevice}><Zap />{memory.avail ? `${memory.avail} MB available` : 'Refresh device memory'}</button>
          </section>
        </div>
      )}
    </div>
  );
}

function MediaRail({
  title,
  cards,
  zone,
  focus,
  onFocus,
  onPlay,
  onOptions,
  showProgress = false,
}: {
  title: string;
  cards: MediaCard[];
  zone: 'featured' | 'continue';
  focus: FocusState;
  onFocus: (focus: FocusState) => void;
  onPlay: (app?: AppItem) => void;
  onOptions: (app: AppItem) => void;
  showProgress?: boolean;
}) {
  return (
    <section className="media-section" aria-label={title}>
      <h1>{title}</h1>
      <div className="media-track">
        {cards.map((card, index) => {
          const isFocused = focus.zone === zone && focus.index === index;
          return (
            <button
              key={card.id}
              className={`media-card ${card.artwork} ${isFocused ? 'is-focused' : ''}`}
              data-focus-zone={zone}
              data-focus-index={index}
              onClick={() => { onFocus({ zone, index }); onPlay(card.app); }}
              onContextMenu={(event) => { event.preventDefault(); onFocus({ zone, index }); if (card.app) onOptions(card.app); }}
              aria-label={`${card.title}, ${card.eyebrow}`}
            >
              <span className="card-shimmer" />
              <span className="card-copy"><small>{card.eyebrow}</small><strong>{card.title}</strong></span>
              {showProgress && <span className="watch-progress"><i style={{ width: `${42 + index * 11}%` }} /></span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
