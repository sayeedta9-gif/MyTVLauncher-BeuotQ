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
  Bell,
  SlidersHorizontal,
  Zap,
  ChevronRight,
  Monitor,
  Sparkles,
  Layers,
  Flame
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
      openSmartBoxSettings(): void;
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
  { pkg: 'com.droidlogic.mboxsettings', name: 'SmartBox Settings', category: 'System' },
  { pkg: 'com.google.android.tv.settings', name: 'Settings', category: 'System' },
  { pkg: 'com.android.vending', name: 'Play Store', category: 'Store' },
  { pkg: 'com.google.android.play.games', name: 'Play Games', category: 'Games' },
  { pkg: 'com.android.chrome', name: 'Chrome', category: 'Tools' },
  { pkg: 'com.mxtech.videoplayer.ad', name: 'MX Player', category: 'Tools' },
];

export default function App() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [activeTab, setActiveTab] = useState<'home' | 'apps' | 'search'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusArea, setFocusArea] = useState<'header' | 'grid' | 'optionsModal' | 'settingsModal'>('grid');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [focusedHeaderItem, setFocusedHeaderItem] = useState<number>(1); // 0: voice, 1: home, 2: apps, 3: optimizer, 4: wifi, 5: notifications, 6: fileManager, 7: settings
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [optionsFocusedIndex, setOptionsFocusedIndex] = useState<number>(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsFocusedIndex, setSettingsFocusedIndex] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isWifi, setIsWifi] = useState<boolean>(true);
  const [memInfo, setMemInfo] = useState<MemoryInfo>({ avail: 0, total: 0 });
  const [boostMsg, setBoostMsg] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef<boolean>(false);

  const handleTouchOrMouseDown = useCallback((app: AppItem, index: number) => {
    isLongPressRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setFocusArea('grid');
      setFocusedIndex(index);
      setSelectedApp(app);
      setOptionsFocusedIndex(0);
      setShowOptionsModal(true);
      setFocusArea('optionsModal');
    }, 500);
  }, []);

  const handleTouchOrMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleAppClick = useCallback((app: AppItem, index: number) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    setFocusArea('grid');
    setFocusedIndex(index);
    launchApp(app);
  }, []);

  // Clock updating
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
      setCurrentDate(
        now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
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

  const openSideSettings = useCallback(() => {
    setShowSettingsModal(true);
    setFocusArea('settingsModal');
    setSettingsFocusedIndex(0);
  }, []);

  // Expose global methods for Android Bridge
  useEffect(() => {
    window.loadApps = refreshApps;
    window.openAllSettings = openSideSettings;
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
  }, [refreshApps, openSideSettings]);

  const filteredApps = apps.filter((app) => {
    if (searchQuery.trim()) {
      return app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             app.pkg.toLowerCase().includes(searchQuery.toLowerCase());
    }
    if (selectedCategory !== 'All' && app.category) {
      return app.category.toLowerCase() === selectedCategory.toLowerCase();
    }
    return true;
  });

  const COLS = 5; // 5 columns grid

  // Launch App
  const launchApp = (app: AppItem) => {
    if (app.pkg === 'com.droidlogic.mboxsettings') {
      if (window.AndroidBridge?.openSmartBoxSettings) {
        window.AndroidBridge.openSmartBoxSettings();
        return;
      }
    }
    if (window.AndroidBridge && typeof window.AndroidBridge.openApp === 'function') {
      window.AndroidBridge.openApp(app.pkg);
    } else {
      alert(`Launching app: ${app.name} (${app.pkg})`);
    }
  };

  const handleSmartBoxSettings = () => {
    if (window.AndroidBridge && typeof window.AndroidBridge.openSmartBoxSettings === 'function') {
      window.AndroidBridge.openSmartBoxSettings();
    } else if (window.AndroidBridge && typeof window.AndroidBridge.openSystemApp === 'function') {
      window.AndroidBridge.openSystemApp('com.droidlogic.mboxsettings');
    } else {
      alert('Launching SmartBox Settings (com.droidlogic.mboxsettings)');
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

  // Side Settings Panel Items
  const SETTINGS_ITEMS = [
    {
      id: 'smartbox',
      icon: SlidersHorizontal,
      title: 'SmartBox Settings',
      subtitle: 'DroidLogic TV Box display & audio settings',
      color: 'from-blue-600 via-indigo-600 to-blue-700',
      action: () => {
        handleSmartBoxSettings();
      }
    },
    {
      id: 'system',
      icon: Settings,
      title: 'Android System Settings',
      subtitle: 'Network, accounts, storage & preferences',
      color: 'from-purple-600 via-pink-600 to-purple-700',
      action: () => {
        if (window.AndroidBridge?.openSystemSettings) {
          window.AndroidBridge.openSystemSettings();
        } else {
          alert('Opening Android System Settings');
        }
      }
    },
    {
      id: 'wifi',
      icon: Wifi,
      title: 'Network & Connection',
      subtitle: isWifi ? 'Wi-Fi connected' : 'Wi-Fi disconnected',
      color: 'from-emerald-600 via-teal-600 to-emerald-700',
      action: () => {
        if (window.AndroidBridge?.openSystemSettings) {
          window.AndroidBridge.openSystemSettings();
        } else {
          alert('Opening Network Settings');
        }
      }
    },
    {
      id: 'notifications',
      icon: Bell,
      title: 'Notification Access',
      subtitle: 'Manage app notification permissions',
      color: 'from-amber-600 via-orange-600 to-amber-700',
      action: () => {
        if (window.AndroidBridge?.requestNotificationAccess) {
          window.AndroidBridge.requestNotificationAccess();
        } else {
          alert('Requesting Notification Access');
        }
      }
    },
    {
      id: 'boost',
      icon: Zap,
      title: 'Boost System Memory',
      subtitle: 'Clean background apps & optimize RAM',
      color: 'from-cyan-600 via-blue-600 to-cyan-700',
      action: () => {
        handleBoost();
      }
    },
    {
      id: 'close',
      icon: X,
      title: 'Close Settings Panel',
      subtitle: 'Return to launcher home screen',
      color: 'from-neutral-700 via-neutral-800 to-neutral-900',
      action: () => {
        setShowSettingsModal(false);
        setFocusArea('header');
      }
    }
  ];

  // DPAD Navigation Handler
  const handleTvKey = useCallback(
    (key: string) => {
      // 1. Handling Options Modal (Context Menu)
      if (showOptionsModal) {
        if (key === 'BACK' || key === 'LEFT') {
          setShowOptionsModal(false);
          setFocusArea('grid');
        } else if (key === 'UP') {
          setOptionsFocusedIndex((prev) => Math.max(0, prev - 1));
        } else if (key === 'DOWN') {
          setOptionsFocusedIndex((prev) => Math.min(2, prev + 1));
        } else if (key === 'OK') {
          if (!selectedApp) return;
          setShowOptionsModal(false);
          if (optionsFocusedIndex === 0) {
            launchApp(selectedApp);
          } else if (optionsFocusedIndex === 1) {
            if (window.AndroidBridge?.openSystemApp) {
              window.AndroidBridge.openSystemApp(selectedApp.pkg);
            }
          } else if (optionsFocusedIndex === 2) {
            if (window.AndroidBridge?.uninstallApp) {
              window.AndroidBridge.uninstallApp(selectedApp.pkg);
            }
          }
          setFocusArea('grid');
        }
        return;
      }

      // 2. Handling Side Settings Panel Navigation
      if (showSettingsModal || focusArea === 'settingsModal') {
        const totalItems = SETTINGS_ITEMS.length;
        if (key === 'BACK' || key === 'LEFT') {
          setShowSettingsModal(false);
          setFocusArea('header');
          setFocusedHeaderItem(7);
        } else if (key === 'UP') {
          setSettingsFocusedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        } else if (key === 'DOWN') {
          setSettingsFocusedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        } else if (key === 'OK') {
          const item = SETTINGS_ITEMS[settingsFocusedIndex];
          if (item) {
            item.action();
          }
        }
        return;
      }

      // 3. Handling Header Navigation
      if (focusArea === 'header') {
        const MAX_HEADER_ITEM = 7;
        if (key === 'RIGHT') {
          setFocusedHeaderItem((prev) => Math.min(prev + 1, MAX_HEADER_ITEM));
        } else if (key === 'LEFT') {
          setFocusedHeaderItem((prev) => Math.max(prev - 1, 0));
        } else if (key === 'DOWN') {
          if (filteredApps.length > 0) {
            setFocusArea('grid');
            setFocusedIndex(0);
          }
        } else if (key === 'OK') {
          switch (focusedHeaderItem) {
            case 0:
              if (window.AndroidBridge && typeof window.AndroidBridge.startVoiceSearch === 'function') {
                window.AndroidBridge.startVoiceSearch();
              }
              break;
            case 1:
              setActiveTab('home');
              setSelectedCategory('All');
              setSearchQuery('');
              break;
            case 2:
              setActiveTab('apps');
              setSelectedCategory('All');
              setSearchQuery('');
              break;
            case 3:
              handleBoost();
              break;
            case 4:
              if (window.AndroidBridge && typeof window.AndroidBridge.openSystemSettings === 'function') {
                window.AndroidBridge.openSystemSettings();
              }
              break;
            case 5:
              if (window.AndroidBridge && typeof window.AndroidBridge.requestNotificationAccess === 'function') {
                window.AndroidBridge.requestNotificationAccess();
              }
              break;
            case 6:
              if (window.AndroidBridge && typeof window.AndroidBridge.openSystemApp === 'function') {
                window.AndroidBridge.openSystemApp('com.android.documentsui');
              } else {
                alert('Opening File Manager');
              }
              break;
            case 7:
              openSideSettings();
              break;
          }
        } else if (key === 'BACK') {
          if (activeTab !== 'home') {
            setActiveTab('home');
          }
        }
        return;
      }

      // 4. Handling Main Grid Navigation
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
            setOptionsFocusedIndex(0);
            setShowOptionsModal(true);
            setFocusArea('optionsModal');
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
    [
      focusArea,
      focusedIndex,
      focusedHeaderItem,
      showOptionsModal,
      optionsFocusedIndex,
      selectedApp,
      showSettingsModal,
      settingsFocusedIndex,
      filteredApps,
      COLS,
      activeTab,
      openSideSettings
    ]
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

  // Auto-scroll side settings panel when settingsFocusedIndex changes
  useEffect(() => {
    if ((showSettingsModal || focusArea === 'settingsModal') && settingsPanelRef.current) {
      const activeEl = settingsPanelRef.current.children[settingsFocusedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [settingsFocusedIndex, showSettingsModal, focusArea]);

  return (
    <div className="relative w-screen h-screen bg-[#08090e] text-white overflow-hidden flex flex-col font-sans select-none bg-ambient-glow">
      {/* Dynamic Ambient Background Glow Highlights */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Navigation Bar */}
      <header className="relative z-20 flex items-center justify-between px-10 py-4.5 glass-header">
        {/* Left Side: Modern Google TV Brand Logo */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 group cursor-pointer">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/20">
              <Tv className="w-4 h-4 text-white" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-1">
              <span className="text-blue-500 font-extrabold">G</span>
              <span className="text-red-500 font-extrabold">o</span>
              <span className="text-yellow-500 font-extrabold">o</span>
              <span className="text-blue-500 font-extrabold">g</span>
              <span className="text-green-500 font-extrabold">l</span>
              <span className="text-red-500 font-extrabold">e</span>
              <span className="text-neutral-200 font-semibold ml-1 text-xl">tv</span>
            </span>
          </div>

          {/* Navigation Tabs & Voice Search */}
          <nav className="flex items-center gap-3 ml-4">
            {/* Google TV Voice Search Button */}
            <button
              id="micBtn"
              onClick={() => {
                setFocusArea('header');
                setFocusedHeaderItem(0);
                if (window.AndroidBridge?.startVoiceSearch) {
                  window.AndroidBridge.startVoiceSearch();
                }
              }}
              title="Voice Search"
              data-focusable="true"
              tabIndex={0}
              className={`relative group flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 border ${
                focusArea === 'header' && focusedHeaderItem === 0
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white border-blue-400 ring-4 ring-blue-400/80 scale-110 shadow-[0_0_25px_rgba(59,130,246,0.7)] z-10'
                  : 'glass-card text-blue-400 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div className="absolute inset-0 rounded-full p-[2px] bg-gradient-to-tr from-blue-500 via-red-500 to-yellow-500 opacity-20 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <Mic className={`w-5 h-5 relative z-10 ${focusArea === 'header' && focusedHeaderItem === 0 ? 'text-white animate-pulse' : 'text-blue-400'}`} />
            </button>

            {/* Home Tab */}
            <button
              onClick={() => {
                setActiveTab('home');
                setSelectedCategory('All');
                setFocusArea('header');
                setFocusedHeaderItem(1);
              }}
              data-focusable="true"
              tabIndex={0}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 border ${
                focusArea === 'header' && focusedHeaderItem === 1
                  ? 'bg-white text-neutral-950 font-extrabold border-white ring-4 ring-white/60 scale-108 shadow-[0_0_20px_rgba(255,255,255,0.6)] z-10'
                  : activeTab === 'home'
                  ? 'bg-white/15 text-white border-white/20 font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white border-transparent'
              }`}
            >
              <HomeIcon className="w-4 h-4" />
              <span>Home</span>
            </button>

            {/* Apps Tab */}
            <button
              onClick={() => {
                setActiveTab('apps');
                setSelectedCategory('All');
                setFocusArea('header');
                setFocusedHeaderItem(2);
              }}
              data-focusable="true"
              tabIndex={0}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 border ${
                focusArea === 'header' && focusedHeaderItem === 2
                  ? 'bg-white text-neutral-950 font-extrabold border-white ring-4 ring-white/60 scale-108 shadow-[0_0_20px_rgba(255,255,255,0.6)] z-10'
                  : activeTab === 'apps'
                  ? 'bg-white/15 text-white border-white/20 font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white border-transparent'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Apps</span>
            </button>
          </nav>
        </div>

        {/* Right Side: Circular Action Buttons & Date / Time */}
        <div className="flex items-center gap-3">
          {/* 1. Device Optimizer Button */}
          <button
            onClick={() => {
              setFocusArea('header');
              setFocusedHeaderItem(3);
              handleBoost();
            }}
            title="Device Optimizer"
            data-focusable="true"
            tabIndex={0}
            className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 border ${
              focusArea === 'header' && focusedHeaderItem === 3
                ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white border-blue-300 ring-4 ring-blue-400/80 scale-110 shadow-[0_0_20px_rgba(59,130,246,0.7)] z-10'
                : 'glass-card text-neutral-300 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <Cpu className={`w-5 h-5 ${focusArea === 'header' && focusedHeaderItem === 3 ? 'text-white' : 'text-blue-400'}`} />
          </button>

          {/* 2. Wi-Fi Status Button */}
          <button
            onClick={() => {
              setFocusArea('header');
              setFocusedHeaderItem(4);
              if (window.AndroidBridge?.openSystemSettings) {
                window.AndroidBridge.openSystemSettings();
              }
            }}
            title={isWifi ? 'Wi-Fi Connected' : 'Wi-Fi Disconnected'}
            data-focusable="true"
            tabIndex={0}
            className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 border ${
              focusArea === 'header' && focusedHeaderItem === 4
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white border-emerald-300 ring-4 ring-emerald-400/80 scale-110 shadow-[0_0_20px_rgba(16,185,129,0.7)] z-10'
                : 'glass-card text-neutral-300 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            {isWifi ? (
              <Wifi className={`w-5 h-5 ${focusArea === 'header' && focusedHeaderItem === 4 ? 'text-white' : 'text-emerald-400'}`} />
            ) : (
              <WifiOff className={`w-5 h-5 ${focusArea === 'header' && focusedHeaderItem === 4 ? 'text-white' : 'text-rose-400'}`} />
            )}
          </button>

          {/* 3. Notifications Button */}
          <button
            onClick={() => {
              setFocusArea('header');
              setFocusedHeaderItem(5);
              if (window.AndroidBridge?.requestNotificationAccess) {
                window.AndroidBridge.requestNotificationAccess();
              }
            }}
            title="Notifications"
            data-focusable="true"
            tabIndex={0}
            className={`relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 border ${
              focusArea === 'header' && focusedHeaderItem === 5
                ? 'bg-gradient-to-tr from-amber-600 to-orange-500 text-white border-amber-300 ring-4 ring-amber-400/80 scale-110 shadow-[0_0_20px_rgba(245,158,11,0.7)] z-10'
                : 'glass-card text-neutral-300 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <Bell className={`w-5 h-5 ${focusArea === 'header' && focusedHeaderItem === 5 ? 'text-white' : 'text-amber-400'}`} />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-amber-400 rounded-full ring-2 ring-neutral-950 animate-pulse" />
            )}
          </button>

          {/* 4. File Manager Button */}
          <button
            onClick={() => {
              setFocusArea('header');
              setFocusedHeaderItem(6);
              if (window.AndroidBridge?.openSystemApp) {
                window.AndroidBridge.openSystemApp('com.android.documentsui');
              } else {
                alert('Opening File Manager');
              }
            }}
            title="File Manager"
            data-focusable="true"
            tabIndex={0}
            className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 border ${
              focusArea === 'header' && focusedHeaderItem === 6
                ? 'bg-gradient-to-tr from-indigo-600 to-purple-500 text-white border-indigo-300 ring-4 ring-indigo-400/80 scale-110 shadow-[0_0_20px_rgba(99,102,241,0.7)] z-10'
                : 'glass-card text-neutral-300 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <Folder className={`w-5 h-5 ${focusArea === 'header' && focusedHeaderItem === 6 ? 'text-white' : 'text-indigo-400'}`} />
          </button>

          {/* 5. Settings Button */}
          <button
            onClick={() => {
              setFocusArea('header');
              setFocusedHeaderItem(7);
              openSideSettings();
            }}
            title="Settings"
            data-focusable="true"
            tabIndex={0}
            className={`flex items-center justify-center w-11 h-11 rounded-full transition-all duration-300 border ${
              focusArea === 'header' && focusedHeaderItem === 7
                ? 'bg-gradient-to-tr from-purple-600 to-pink-500 text-white border-purple-300 ring-4 ring-purple-400/80 scale-110 shadow-[0_0_20px_rgba(168,85,247,0.7)] z-10'
                : 'glass-card text-neutral-300 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <Settings className={`w-5 h-5 ${focusArea === 'header' && focusedHeaderItem === 7 ? 'text-white' : 'text-purple-400'}`} />
          </button>

          {/* Clock & Date Badge */}
          <div className="ml-3 flex flex-col items-end justify-center glass-card px-4 py-1.5 rounded-full border border-white/10 shadow-sm">
            <span className="text-sm font-mono font-bold tracking-wider text-white">
              {currentTime || '12:00 PM'}
            </span>
            {currentDate && (
              <span className="text-[10px] font-semibold text-neutral-400 tracking-tight">
                {currentDate}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Boost Notification Banner */}
      {boostMsg && (
        <div className="absolute top-20 right-10 z-50 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-2xl shadow-2xl text-sm font-bold border border-white/20 flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
          <span>{boostMsg}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 px-10 pt-6 pb-8 overflow-hidden flex flex-col">
        {/* Section Header & Category Filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shadow-inner">
              <Grid className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                {activeTab === 'apps' ? 'Applications Library' : 'Apps & Entertainment'}
              </h2>
              <p className="text-xs text-neutral-400 font-medium">Quick access to your installed launcher apps</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Installed App Count Pill */}
            <span className="text-xs text-neutral-300 font-semibold glass-card px-4 py-1.5 rounded-full border border-white/10 shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{filteredApps.length} Apps Installed</span>
            </span>
          </div>
        </div>

        {/* 5-Column App Grid */}
        <div
          ref={gridContainerRef}
          className="grid grid-cols-5 gap-6 overflow-y-auto pr-2 flex-1 scrollbar-none py-3"
        >
          {filteredApps.map((app, index) => {
            const isFocused = focusArea === 'grid' && focusedIndex === index;
            return (
              <div
                key={app.pkg + index}
                onClick={() => handleAppClick(app, index)}
                onMouseDown={() => handleTouchOrMouseDown(app, index)}
                onMouseUp={handleTouchOrMouseUp}
                onMouseLeave={handleTouchOrMouseUp}
                onTouchStart={() => handleTouchOrMouseDown(app, index)}
                onTouchEnd={handleTouchOrMouseUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleTouchOrMouseUp();
                  isLongPressRef.current = true;
                  setFocusArea('grid');
                  setFocusedIndex(index);
                  setSelectedApp(app);
                  setOptionsFocusedIndex(0);
                  setShowOptionsModal(true);
                  setFocusArea('optionsModal');
                }}
                data-focusable="true"
                tabIndex={0}
                className={`group relative flex flex-col items-center justify-center p-6 rounded-3xl cursor-pointer transition-all duration-300 ease-out border ${
                  isFocused
                    ? 'glass-card-focused scale-110 z-30 focus-glow-blue border-blue-400/90 ring-4 ring-blue-500/80 bg-gradient-to-b from-blue-900/40 via-neutral-900/90 to-neutral-900/95 shadow-[0_0_35px_rgba(59,130,246,0.5)]'
                    : 'glass-card hover:bg-white/10 hover:border-white/20'
                }`}
              >
                {/* App Icon Container */}
                <div className={`w-20 h-20 mb-3.5 flex items-center justify-center rounded-2xl p-2.5 transition-all duration-300 ${
                  isFocused
                    ? 'bg-neutral-800/90 border border-blue-400/40 shadow-lg scale-105'
                    : 'bg-neutral-900/80 border border-white/10 shadow-inner group-hover:scale-105'
                }`}>
                  {app.icon ? (
                    <img
                      src={`data:image/png;base64,${app.icon}`}
                      alt={app.name}
                      className="w-full h-full object-contain rounded-xl drop-shadow"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Tv className={`w-10 h-10 ${isFocused ? 'text-blue-400' : 'text-neutral-400'}`} />
                  )}
                </div>

                {/* App Name Title */}
                <span
                  className={`text-sm font-bold text-center truncate w-full px-1 transition-all duration-200 ${
                    isFocused ? 'text-white text-base font-extrabold tracking-wide drop-shadow-md' : 'text-neutral-200 tracking-tight'
                  }`}
                >
                  {app.name}
                </span>

                {/* App Category Tag */}
                {app.category && (
                  <span className={`text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full mt-1.5 transition-all ${
                    isFocused
                      ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
                      : 'bg-white/5 text-neutral-400 border border-white/5'
                  }`}>
                    {app.category}
                  </span>
                )}

                {/* Focus Active Glow Badge */}
                {isFocused && (
                  <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-blue-400 ring-4 ring-blue-500/40 animate-ping" />
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Context Menu / App Options Modal */}
      {showOptionsModal && selectedApp && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-white/15 rounded-3xl p-7 w-[420px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-neutral-800/90 border border-white/10 p-2 flex items-center justify-center shadow-inner">
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
                  <h3 className="font-extrabold text-white text-lg tracking-tight">{selectedApp.name}</h3>
                  <p className="text-xs text-neutral-400 truncate max-w-[220px] font-mono">{selectedApp.pkg}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  setFocusArea('grid');
                }}
                className="w-8 h-8 rounded-full glass-card hover:bg-white/15 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  launchApp(selectedApp);
                  setFocusArea('grid');
                }}
                data-focusable="true"
                tabIndex={0}
                className={`flex items-center gap-3.5 px-5 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 border ${
                  optionsFocusedIndex === 0
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-400 ring-4 ring-blue-400/80 scale-[1.02] shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                    : 'glass-card text-neutral-200 border-white/10 hover:bg-white/10'
                }`}
              >
                <Play className="w-4 h-4 text-blue-400 fill-current" />
                <span>Open Application</span>
              </button>

              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  if (window.AndroidBridge?.openSystemApp) {
                    window.AndroidBridge.openSystemApp(selectedApp.pkg);
                  }
                  setFocusArea('grid');
                }}
                data-focusable="true"
                tabIndex={0}
                className={`flex items-center gap-3.5 px-5 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 border ${
                  optionsFocusedIndex === 1
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-400 ring-4 ring-purple-400/80 scale-[1.02] shadow-[0_0_20px_rgba(168,85,247,0.5)]'
                    : 'glass-card text-neutral-200 border-white/10 hover:bg-white/10'
                }`}
              >
                <Info className="w-4 h-4 text-purple-400" />
                <span>App Info & Preferences</span>
              </button>

              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  if (window.AndroidBridge?.uninstallApp) {
                    window.AndroidBridge.uninstallApp(selectedApp.pkg);
                  }
                  setFocusArea('grid');
                }}
                data-focusable="true"
                tabIndex={0}
                className={`flex items-center gap-3.5 px-5 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 border ${
                  optionsFocusedIndex === 2
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-400 ring-4 ring-red-400/80 scale-[1.02] shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                    : 'bg-red-950/40 text-red-300 border-red-800/30 hover:bg-red-900/60'
                }`}
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Uninstall Application</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side Settings Panel (Modern Android TV Side Drawer) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Overlay */}
          <div
            onClick={() => {
              setShowSettingsModal(false);
              setFocusArea('header');
            }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          />

          {/* Side Drawer Panel */}
          <aside className="relative w-[440px] h-full glass-panel border-l border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col p-7 z-20 animate-in slide-in-from-right duration-300">
            {/* Panel Header */}
            <div className="flex items-center justify-between pb-5 border-b border-white/10 mb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <Settings className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white tracking-wide">Settings Panel</h2>
                  <p className="text-xs text-neutral-400 font-medium">Launcher & System Controls</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setFocusArea('header');
                }}
                className="w-9 h-9 rounded-full glass-card hover:bg-white/15 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Side Panel D-Pad Navigable Options List */}
            <div ref={settingsPanelRef} className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 py-1 scrollbar-none">
              {SETTINGS_ITEMS.map((item, index) => {
                const isFocused = (showSettingsModal || focusArea === 'settingsModal') && settingsFocusedIndex === index;
                const IconComponent = item.icon;
                const prevIndex = Math.max(0, index - 1);
                const nextIndex = Math.min(SETTINGS_ITEMS.length - 1, index + 1);

                return (
                  <div
                    key={item.id}
                    id={`settings-item-${index}`}
                    onClick={() => {
                      setSettingsFocusedIndex(index);
                      item.action();
                    }}
                    tabIndex={0}
                    data-focusable="true"
                    data-next-focus-up={`settings-item-${prevIndex}`}
                    data-next-focus-down={`settings-item-${nextIndex}`}
                    data-next-focus-left="grid-container"
                    data-next-focus-right={`settings-item-${index}`}
                    className={`group relative flex items-center justify-between p-4.5 rounded-2xl cursor-pointer transition-all duration-300 border ${
                      isFocused
                        ? `bg-gradient-to-r ${item.color} text-white border-white/80 ring-4 ring-purple-400/80 scale-[1.03] shadow-[0_0_30px_rgba(147,51,234,0.5)] z-20`
                        : 'glass-card border-white/10 text-neutral-200 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                        isFocused ? 'bg-white/20 text-white shadow-inner' : 'bg-white/5 border border-white/10 text-purple-400'
                      }`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm font-extrabold tracking-tight ${isFocused ? 'text-white' : 'text-neutral-100'}`}>
                          {item.title}
                        </span>
                        <span className={`text-xs ${isFocused ? 'text-white/80 font-medium' : 'text-neutral-400'}`}>
                          {item.subtitle}
                        </span>
                      </div>
                    </div>

                    <ChevronRight className={`w-5 h-5 transition-transform ${isFocused ? 'text-white translate-x-1' : 'text-neutral-500'}`} />
                  </div>
                );
              })}
            </div>

            {/* Footer Navigation Tip */}
            <div className="pt-4 border-t border-white/10 mt-3 flex items-center justify-between text-xs text-neutral-400 font-semibold">
              <span className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono text-[10px]">▲▼</span> Navigate
              </span>
              <span className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono text-[10px]">OK</span> Select
              </span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
