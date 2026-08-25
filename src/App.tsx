import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Mic,
  Settings,
  Wifi,
  WifiOff,
  Cpu,
  Tv,
  Grid,
  Home as HomeIcon,
  Folder,
  Play,
  Trash2,
  Info,
  X,
  Volume2,
  Bell
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

interface NotificationItem {
  id?: string;
  pkg?: string;
  title?: string;
  text?: string;
}

declare global {
  interface Window {
    AndroidBridge?: {
      getInstalledApps(): string;
      openApp(pkg: string): void;
      openSystemApp(pkg: string): void;
      openSystemSettings(): void;
      saveFilters(data: string): void;
      getSavedFilters(): string;
      saveWallpaper(dataUrl: string): void;
      getSavedWallpaper(): string;
      getMemoryInfo(): string;
      boostDevice(): number;
      isWifiConnected(): boolean;
      hasNotificationAccess(): boolean;
      requestNotificationAccess(): void;
      getNotifications(): string;
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

// Mock installed apps for web browser preview mode
const MOCK_APPS: AppItem[] = [
  { pkg: 'com.google.android.youtube.tv', name: 'YouTube', category: 'Media' },
  { pkg: 'com.netflix.ninja', name: 'Netflix', category: 'Media' },
  { pkg: 'com.primevideo.android', name: 'Prime Video', category: 'Media' },
  { pkg: 'com.disney.disneyplus', name: 'Disney+', category: 'Media' },
  { pkg: 'com.spotify.tv.android', name: 'Spotify', category: 'Music' },
  { pkg: 'com.plexapp.android', name: 'Plex', category: 'Media' },
  { pkg: 'com.vlc.tv', name: 'VLC', category: 'Tools' },
  { pkg: 'com.google.android.tv.settings', name: 'Settings', category: 'System' },
  { pkg: 'com.android.vending', name: 'Play Store', category: 'Store' },
  { pkg: 'com.google.android.play.games', name: 'Play Games', category: 'Games' },
  { pkg: 'com.android.chrome', name: 'Chrome', category: 'Tools' },
  { pkg: 'com.mxtech.videoplayer.ad', name: 'MX Player', category: 'Tools' },
];

export default function App() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'apps' | 'search'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusArea, setFocusArea] = useState<'header' | 'grid' | 'optionsModal' | 'settingsModal'>('grid');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [focusedHeaderItem, setFocusedHeaderItem] = useState<number>(1); // 0: voice, 1: home, 2: apps, 3: settings
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isWifi, setIsWifi] = useState<boolean>(true);
  const [memInfo, setMemInfo] = useState<MemoryInfo>({ avail: 0, total: 0 });
  const [boostMsg, setBoostMsg] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Clock updating
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch installed apps & status from Android Bridge
  const refreshApps = useCallback(() => {
    if (window.AndroidBridge && typeof window.AndroidBridge.getInstalledApps === 'function') {
      try {
        const raw = window.AndroidBridge.getInstalledApps();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setApps(parsed);
        } else {
          setApps(MOCK_APPS);
        }
      } catch (e) {
        setApps(MOCK_APPS);
      }
    } else {
      setApps(MOCK_APPS);
    }
  }, []);

  const refreshSystemStatus = useCallback(() => {
    if (window.AndroidBridge) {
      if (typeof window.AndroidBridge.isWifiConnected === 'function') {
        setIsWifi(window.AndroidBridge.isWifiConnected());
      }
      if (typeof window.AndroidBridge.getMemoryInfo === 'function') {
        try {
          const mem = JSON.parse(window.AndroidBridge.getMemoryInfo());
          setMemInfo(mem);
        } catch (e) {}
      }
      if (typeof window.AndroidBridge.getNotifications === 'function') {
        try {
          const notifs = JSON.parse(window.AndroidBridge.getNotifications());
          if (Array.isArray(notifs)) setNotifications(notifs);
        } catch (e) {}
      }
    }
  }, []);

  useEffect(() => {
    refreshApps();
    refreshSystemStatus();
    const interval = setInterval(refreshSystemStatus, 15000);
    return () => clearInterval(interval);
  }, [refreshApps, refreshSystemStatus]);

  // Expose global methods for Android Bridge
  useEffect(() => {
    window.loadApps = refreshApps;
    window.openAllSettings = () => setShowSettingsModal(true);
    window.openSrm = () => {
      setActiveTab('search');
      setFocusArea('header');
      setFocusedHeaderItem(0);
    };
    window.askNotifPerm = () => {
      if (window.AndroidBridge && typeof window.AndroidBridge.requestNotificationAccess === 'function') {
        window.AndroidBridge.requestNotificationAccess();
      }
    };
    window.closeVoice = () => {
      const micBtn = document.getElementById('micBtn');
      if (micBtn) micBtn.classList.remove('listening');
    };
  }, [refreshApps]);

  const filteredApps = apps.filter((app) => {
    if (!searchQuery.trim()) return true;
    return app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           app.pkg.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const COLS = 5; // 5 columns grid

  // Launch App
  const launchApp = (app: AppItem) => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openApp === 'function') {
      window.AndroidBridge.openApp(app.pkg);
    } else {
      alert(`Launching app: ${app.name} (${app.pkg})`);
    }
  };

  const handleBoost = () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.boostDevice === 'function') {
      const freed = window.AndroidBridge.boostDevice();
      setBoostMsg(`Freed ${freed} MB RAM!`);
      refreshSystemStatus();
      setTimeout(() => setBoostMsg(null), 3000);
    } else {
      setBoostMsg('Memory optimized!');
      setTimeout(() => setBoostMsg(null), 3000);
    }
  };

  // DPAD Navigation Handler
  const handleTvKey = useCallback(
    (key: string) => {
      if (showOptionsModal) {
        if (key === 'BACK') {
          setShowOptionsModal(false);
        }
        return;
      }

      if (showSettingsModal) {
        if (key === 'BACK') {
          setShowSettingsModal(false);
        }
        return;
      }

      if (focusArea === 'header') {
        if (key === 'RIGHT') {
          setFocusedHeaderItem((prev) => Math.min(prev + 1, 3));
        } else if (key === 'LEFT') {
          setFocusedHeaderItem((prev) => Math.max(prev - 1, 0));
        } else if (key === 'DOWN') {
          if (filteredApps.length > 0) {
            setFocusArea('grid');
            setFocusedIndex(0);
          }
        } else if (key === 'OK') {
          if (focusedHeaderItem === 0) {
            // Voice Search
            if (window.AndroidBridge && typeof window.AndroidBridge.startVoiceSearch === 'function') {
              window.AndroidBridge.startVoiceSearch();
            }
          } else if (focusedHeaderItem === 1) {
            setActiveTab('home');
            setSearchQuery('');
          } else if (focusedHeaderItem === 2) {
            setActiveTab('apps');
            setSearchQuery('');
          } else if (focusedHeaderItem === 3) {
            setShowSettingsModal(true);
          }
        } else if (key === 'BACK') {
          if (activeTab !== 'home') {
            setActiveTab('home');
          }
        }
        return;
      }

      if (focusArea === 'grid') {
        const total = filteredApps.length;
        if (total === 0) {
          if (key === 'UP') setFocusArea('header');
          return;
        }

        if (key === 'RIGHT') {
          if ((focusedIndex + 1) % COLS !== 0 && focusedIndex + 1 < total) {
            setFocusedIndex((prev) => prev + 1);
          }
        } else if (key === 'LEFT') {
          if (focusedIndex % COLS !== 0) {
            setFocusedIndex((prev) => Math.max(prev - 1, 0));
          }
        } else if (key === 'DOWN') {
          if (focusedIndex + COLS < total) {
            setFocusedIndex((prev) => prev + COLS);
          }
        } else if (key === 'UP') {
          if (focusedIndex - COLS >= 0) {
            setFocusedIndex((prev) => prev - COLS);
          } else {
            setFocusArea('header');
          }
        } else if (key === 'OK') {
          const app = filteredApps[focusedIndex];
          if (app) launchApp(app);
        } else if (key === 'OK_LONG') {
          const app = filteredApps[focusedIndex];
          if (app) {
            setSelectedApp(app);
            setShowOptionsModal(true);
          }
        } else if (key === 'BACK') {
          if (activeTab !== 'home') {
            setActiveTab('home');
          } else {
            setFocusArea('header');
          }
        }
      }
    },
    [focusArea, focusedIndex, focusedHeaderItem, showOptionsModal, showSettingsModal, filteredApps, COLS, activeTab]
  );

  useEffect(() => {
    window.tvKey = handleTvKey;
  }, [handleTvKey]);

  // Keyboard events for testing in browser (Arrow keys + Enter + Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          handleTvKey('UP');
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleTvKey('DOWN');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleTvKey('LEFT');
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleTvKey('RIGHT');
          break;
        case 'Enter':
          e.preventDefault();
          handleTvKey('OK');
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          handleTvKey('BACK');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTvKey]);

  // Auto-scroll grid container when focusedIndex changes
  useEffect(() => {
    if (focusArea === 'grid' && gridContainerRef.current) {
      const activeEl = gridContainerRef.current.children[focusedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusedIndex, focusArea]);

  return (
    <div className="relative w-screen h-screen bg-neutral-950 text-white overflow-hidden flex flex-col font-sans select-none">
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-900/80 to-neutral-950/90 pointer-events-none z-0" />

      {/* Top Header Navigation Bar */}
      <header className="relative z-10 flex items-center justify-between px-10 py-5 bg-neutral-900/40 backdrop-blur-md border-b border-neutral-800/50">
        {/* Left Side: Clean Google TV Logo (No empty top-left icon) */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5">
              <span className="text-blue-500 font-extrabold">G</span>
              <span className="text-red-500 font-extrabold">o</span>
              <span className="text-yellow-500 font-extrabold">o</span>
              <span className="text-blue-500 font-extrabold">g</span>
              <span className="text-green-500 font-extrabold">l</span>
              <span className="text-red-500 font-extrabold">e</span>
              <span className="text-neutral-300 font-medium ml-1.5">tv</span>
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-3 ml-4">
            {/* Voice Search Button */}
            <button
              id="micBtn"
              onClick={() => {
                setFocusArea('header');
                setFocusedHeaderItem(0);
                if (window.AndroidBridge?.startVoiceSearch) {
                  window.AndroidBridge.startVoiceSearch();
                }
              }}
              className={`p-2.5 rounded-full transition-all duration-200 ${
                focusArea === 'header' && focusedHeaderItem === 0
                  ? 'bg-blue-600 text-white ring-4 ring-blue-400/50 scale-110 shadow-lg shadow-blue-500/30'
                  : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Home Tab */}
            <button
              onClick={() => {
                setActiveTab('home');
                setFocusArea('header');
                setFocusedHeaderItem(1);
              }}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                activeTab === 'home'
                  ? 'bg-white/20 text-white'
                  : 'text-neutral-400 hover:text-white'
              } ${
                focusArea === 'header' && focusedHeaderItem === 1
                  ? 'bg-white text-neutral-900 ring-4 ring-white/40 scale-105 shadow-md'
                  : ''
              }`}
            >
              <HomeIcon className="w-4 h-4" />
              <span>Home</span>
            </button>

            {/* Apps Tab */}
            <button
              onClick={() => {
                setActiveTab('apps');
                setFocusArea('header');
                setFocusedHeaderItem(2);
              }}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                activeTab === 'apps'
                  ? 'bg-white/20 text-white'
                  : 'text-neutral-400 hover:text-white'
              } ${
                focusArea === 'header' && focusedHeaderItem === 2
                  ? 'bg-white text-neutral-900 ring-4 ring-white/40 scale-105 shadow-md'
                  : ''
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Apps</span>
            </button>
          </nav>
        </div>

        {/* Right Side: Status Indicators & Time */}
        <div className="flex items-center gap-5">
          {/* Memory / Boost Button */}
          <button
            onClick={handleBoost}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-700/80 text-xs text-neutral-300 border border-neutral-700/50"
            title="Clean RAM"
          >
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>{memInfo.avail ? `${memInfo.avail}MB` : 'Boost'}</span>
          </button>

          {/* Wi-Fi Icon */}
          <div className="text-neutral-400">
            {isWifi ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
          </div>

          {/* Settings Button */}
          <button
            onClick={() => {
              setFocusArea('header');
              setFocusedHeaderItem(3);
              setShowSettingsModal(true);
            }}
            className={`p-2 rounded-full transition-all duration-200 ${
              focusArea === 'header' && focusedHeaderItem === 3
                ? 'bg-white text-neutral-900 ring-4 ring-white/40 scale-110'
                : 'text-neutral-400 hover:text-white bg-neutral-800/50'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Clock */}
          <div className="text-lg font-medium text-neutral-200 tracking-wider">
            {currentTime || '12:00 PM'}
          </div>
        </div>
      </header>

      {/* Boost Message Banner */}
      {boostMsg && (
        <div className="absolute top-20 right-10 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-xl text-sm font-semibold animate-bounce">
          {boostMsg}
        </div>
      )}

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 px-10 pt-6 pb-10 overflow-hidden flex flex-col">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold tracking-wide text-neutral-200 flex items-center gap-2">
            <Grid className="w-5 h-5 text-blue-400" />
            {activeTab === 'apps' ? 'Your Applications' : 'Your Apps & Games'}
          </h2>
          <span className="text-xs text-neutral-500 font-medium">
            {filteredApps.length} installed
          </span>
        </div>

        {/* Apps Grid */}
        <div
          ref={gridContainerRef}
          className="grid grid-cols-5 gap-6 overflow-y-auto pr-2 flex-1 scrollbar-none py-2"
        >
          {filteredApps.map((app, index) => {
            const isFocused = focusArea === 'grid' && focusedIndex === index;
            return (
              <div
                key={app.pkg + index}
                onClick={() => {
                  setFocusArea('grid');
                  setFocusedIndex(index);
                  launchApp(app);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFocusArea('grid');
                  setFocusedIndex(index);
                  setSelectedApp(app);
                  setShowOptionsModal(true);
                }}
                className={`group relative flex flex-col items-center justify-center p-5 rounded-2xl cursor-pointer transition-all duration-200 ease-out border ${
                  isFocused
                    ? 'bg-neutral-800 border-blue-500 ring-4 ring-blue-500/50 scale-105 shadow-2xl shadow-blue-500/20 z-20'
                    : 'bg-neutral-900/60 border-neutral-800/80 hover:bg-neutral-800/80 hover:border-neutral-700'
                }`}
              >
                {/* App Icon / Banner */}
                <div className="w-20 h-20 mb-3 flex items-center justify-center rounded-2xl bg-neutral-800/80 p-2 shadow-inner group-hover:scale-105 transition-transform">
                  {app.icon ? (
                    <img
                      src={`data:image/png;base64,${app.icon}`}
                      alt={app.name}
                      className="w-full h-full object-contain rounded-xl"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Tv className="w-10 h-10 text-neutral-400" />
                  )}
                </div>

                {/* App Name */}
                <span
                  className={`text-sm font-semibold text-center truncate w-full px-1 ${
                    isFocused ? 'text-white font-bold' : 'text-neutral-300'
                  }`}
                >
                  {app.name}
                </span>

                {/* Focus Indicator Badge */}
                {isFocused && (
                  <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-blue-400 shadow-glow" />
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* App Options Modal (Long Press / Context Menu) */}
      {showOptionsModal && selectedApp && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-96 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 p-1">
                  {selectedApp.icon ? (
                    <img
                      src={`data:image/png;base64,${selectedApp.icon}`}
                      alt={selectedApp.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Tv className="w-6 h-6 text-neutral-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{selectedApp.name}</h3>
                  <p className="text-xs text-neutral-400 truncate max-w-[200px]">{selectedApp.pkg}</p>
                </div>
              </div>
              <button
                onClick={() => setShowOptionsModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  launchApp(selectedApp);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
              >
                <Play className="w-4 h-4" />
                <span>Open Application</span>
              </button>

              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  if (window.AndroidBridge?.openSystemApp) {
                    window.AndroidBridge.openSystemApp(selectedApp.pkg);
                  }
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-sm transition-colors"
              >
                <Info className="w-4 h-4 text-neutral-400" />
                <span>App Info & Settings</span>
              </button>

              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  if (window.AndroidBridge?.uninstallApp) {
                    window.AndroidBridge.uninstallApp(selectedApp.pkg);
                  }
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 font-semibold text-sm border border-red-800/40 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Uninstall Application</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-96 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                Launcher Settings
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  if (window.AndroidBridge?.openSystemSettings) {
                    window.AndroidBridge.openSystemSettings();
                  }
                }}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-sm"
              >
                <span>Android System Settings</span>
                <Settings className="w-4 h-4 text-neutral-400" />
              </button>

              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  if (window.AndroidBridge?.requestNotificationAccess) {
                    window.AndroidBridge.requestNotificationAccess();
                  }
                }}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-sm"
              >
                <span>Notification Permissions</span>
                <Bell className="w-4 h-4 text-neutral-400" />
              </button>

              <button
                onClick={handleBoost}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-sm"
              >
                <span>Boost System Memory</span>
                <Cpu className="w-4 h-4 text-blue-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
