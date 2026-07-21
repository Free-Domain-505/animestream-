import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Search, 
  User as UserIcon, 
  Heart, 
  Clock, 
  TrendingUp, 
  LogOut, 
  Award, 
  ChevronRight, 
  ChevronLeft,
  Trash2,
  ArrowRight,
  Film, 
  Settings, 
  ShieldCheck,
  ChevronDown,
  X,
  Plus,
  Check,
  Star,
  Compass,
  Grid,
  AlertCircle,
  Download,
  PlayCircle,
  PlusCircle,
  Calendar,
  Tv,
  Bookmark,
  Share2,
  SlidersHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { 
  auth, 
  db, 
  seedAnimeDatabase, 
  onAuthStateChanged, 
  signInWithPopup, 
  googleProvider,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
  setLocalSandboxMode,
  setLocalUser,
  getLocalSandboxMode,
  getLocalAccounts,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  checkIsDefaultAdmin,
  syncUserBackup,
  syncWatchHistoryThumbnails,
  signOut as firebaseSignOut
} from './firebase';
import { Anime, Season, Episode, UserProfile, GenreType, WatchHistory } from './types';
import CustomPlayer from './components/CustomPlayer';
import HeroBanner from './components/HeroBanner';
import AnimeCard from './components/AnimeCard';
import AdminSection from './components/AdminSection';
import ProfileSection from './components/ProfileSection';
import LazyImage from './components/LazyImage';
import ContactForm from './components/ContactForm';

export const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '-');
};

export const formatLastWatched = (updatedAt: any): string => {
  if (!updatedAt) return '';
  let date: Date;
  if (typeof updatedAt.toDate === 'function') {
    date = updatedAt.toDate();
  } else if (updatedAt instanceof Date) {
    date = updatedAt;
  } else {
    try {
      date = new Date(updatedAt);
    } catch (e) {
      return '';
    }
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
};

export const formatRemainingTime = (progress: number, duration: number): string => {
  const remaining = Math.max(0, duration - progress);
  const mins = Math.floor(remaining / 60);
  if (mins === 0) return 'Less than a min left';
  return `${mins}m left`;
};

export default function App() {
  // Global custom Alert overlay to avoid native window.alert layout crashes inside browser iframes
  const [globalAlert, setGlobalAlert] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  useEffect(() => {
    window.alert = (message: any) => {
      setGlobalAlert({ message: String(message || ''), visible: true });
    };
  }, []);

  // Auth state
  const [user, setUser] = useState<UserProfile | null>(null);
  const setSanitizedUser = (profile: UserProfile | null) => {
    if (profile) {
      const emailLower = (profile.email || '').toLowerCase().trim();
      if (emailLower === 'aniverse@gmail.com' || emailLower === 'aniverse@gmail.com ' || emailLower.includes('aniverse')) {
        profile.email = 'notxanlos@gmail.com';
        profile.displayName = 'AnimeStream Admin';
        profile.photoURL = 'https://api.dicebear.com/7.x/pixel-art/svg?seed=notxanlos@gmail.com';
      }
    }
    setUser(profile);
  };
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', displayName: '' });
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Collections real-time states
  const [allAnime, setAllAnime] = useState<Anime[]>([]);
  const [totalEpisodesCount, setTotalEpisodesCount] = useState<number>(0);
  const [favorites, setFavorites] = useState<string[]>([]); // list of favorited animeIds
  const [favoriteEpisodes, setFavoriteEpisodes] = useState<string[]>([]); // list of favorited episodeIds

  // Extended features collections
  const [latestEpisodes, setLatestEpisodes] = useState<any[]>([]);
  const [homeNews, setHomeNews] = useState<any[]>([]);
  const [homeSchedule, setHomeSchedule] = useState<any[]>([]);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);

  // Active View navigation: 'home' | 'details' | 'watch' | 'profile' | 'admin' | 'about' | 'contact' | '404' | 'forbidden' | 'maintenance'
  const [activeView, setActiveView] = useState<'home' | 'details' | 'watch' | 'profile' | 'admin' | 'about' | 'contact' | '404' | 'forbidden' | 'maintenance'>('home');
  const [selectedAnimeId, setSelectedAnimeId] = useState<string>('');
  const [activeEpisodeId, setActiveEpisodeId] = useState<string>('');
  const [profileActiveTab, setProfileActiveTab] = useState<'history' | 'favorites' | 'watchlist' | 'notifications' | 'settings'>('history');
  const [adminActiveTab, setAdminActiveTab] = useState<'stats' | 'anime' | 'seasons_episodes' | 'users' | 'hash_generator' | 'backup_restore' | 'bulk_operations' | 'banner_manager' | 'bulk_thumbnails' | 'auto_thumbnail' | 'auto_setup'>('stats');

  // Pending resolution states for deep links before Firestore collections load
  const [pendingWatchSeasonNumber, setPendingWatchSeasonNumber] = useState<number | null>(null);
  const [pendingWatchEpisodeNumber, setPendingWatchEpisodeNumber] = useState<number | null>(null);

  // Search & Genres filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedRating, setSelectedRating] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('Popularity');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);

  // Detailed view support states
  const [activeDetailsAnime, setActiveDetailsAnime] = useState<Anime | null>(null);
  const [activeDetailsSeasons, setActiveDetailsSeasons] = useState<Season[]>([]);
  const [activeDetailsEpisodes, setActiveDetailsEpisodes] = useState<Episode[]>([]);
  const [activeDetailsSelectedSeasonId, setActiveDetailsSelectedSeasonId] = useState<string>('');
  const [activeDetailsReviews, setActiveDetailsReviews] = useState<any[]>([]);
  const [activeDetailsComments, setActiveDetailsComments] = useState<any[]>([]);
  const [selectedCommentEpisodeId, setSelectedCommentEpisodeId] = useState<string>('');

  // Player state support
  const [activePlayEpisode, setActivePlayEpisode] = useState<Episode | null>(null);

  // Watch view premium season and progress states
  const [watchSelectedSeasonId, setWatchSelectedSeasonId] = useState<string>('');
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  // Global watch history state for Continue Watching section
  const [allWatchHistory, setAllWatchHistory] = useState<WatchHistory[]>([]);
  const [isWatchHistoryLoading, setIsWatchHistoryLoading] = useState<boolean>(true);
  const [continueWatchingEpisodesData, setContinueWatchingEpisodesData] = useState<{ [episodeId: string]: Episode }>({});
  const [watchHistoryToRemoveId, setWatchHistoryToRemoveId] = useState<string | null>(null);
  
  // Ref and scrolling utility for Continue Watching section carousel
  const carouselRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const { scrollLeft, clientWidth } = carouselRef.current;
      const scrollAmount = clientWidth * 0.75;
      carouselRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // User input states inside details
  const [commentText, setCommentText] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'reviews'>('comments');
  const [commentsSortOrder, setCommentsSortOrder] = useState<'newest' | 'liked' | 'oldest'>('newest');
  const [commentReplyTexts, setCommentReplyTexts] = useState<{ [commentId: string]: string }>({});
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState<string>('');
  const [showSandboxToast, setShowSandboxToast] = useState(false);

  const handleToggleDatabaseMode = (isSandbox: boolean) => {
    setLocalSandboxMode(isSandbox);
    try {
      localStorage.setItem('animayx_show_sandbox_toast', isSandbox ? 'true' : 'false');
    } catch (e) {}
    window.location.reload();
  };

  useEffect(() => {
    const handleSwap = () => {
      setShowSandboxToast(true);
    };
    window.addEventListener('animayx_sandbox_swapped', handleSwap);

    try {
      if (localStorage.getItem('animayx_show_sandbox_toast') === 'true') {
        setShowSandboxToast(true);
        localStorage.removeItem('animayx_show_sandbox_toast');
      }
    } catch (e) {}

    return () => {
      window.removeEventListener('animayx_sandbox_swapped', handleSwap);
    };
  }, []);

  useEffect(() => {
    if (showSandboxToast) {
      const t = setTimeout(() => setShowSandboxToast(false), 8000);
      return () => clearTimeout(t);
    }
  }, [showSandboxToast]);

  // Synchronize user backups upon view transitions to ensure all progress syncs automatically
  useEffect(() => {
    if (user && user.uid) {
      try {
        syncUserBackup(user.uid);
      } catch (err) {
        console.warn("Non-blocking backup sync issue on view change:", err);
      }
    }
  }, [activeView, user?.uid]);

  // Reset scroll position on any view, anime selection, or episode selection change (page navigation)
  useEffect(() => {
    const resetScroll = () => {
      try {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      } catch (err) {
        console.error("Scroll reset failed:", err);
      }
    };

    // 1. Reset scroll immediately on change
    resetScroll();

    // 2. Perform a secondary reset on the next paint frame to guarantee accuracy after DOM render
    const rafId = requestAnimationFrame(() => {
      resetScroll();
    });

    // 3. Fallback reset after a tiny delay in case of asynchronously loaded elements causing layout shifts
    const timeoutId = setTimeout(() => {
      resetScroll();
    }, 50);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [activeView, selectedAnimeId, activeEpisodeId]);

  // --- PROFESSIONAL ROUTING, URL STRUCTURE & DEEP LINKING ENGINE ---

  // Scroll Restoration System
  const scrollPositions = useRef<{ [path: string]: number }>({});

  useEffect(() => {
    const handleScroll = () => {
      const path = window.location.pathname + window.location.search + window.location.hash;
      scrollPositions.current[path] = window.scrollY;
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Synchronize state from browser URL path, search params, and hash
  const parseURLToState = () => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    if (path === '/auth/register') {
      setAuthMode('register');
      return;
    } else if (path === '/auth') {
      setAuthMode('login');
      return;
    }

    // Clear pending index states by default
    setPendingWatchSeasonNumber(null);
    setPendingWatchEpisodeNumber(null);

    if (path === '/' || path === '/home' || path === '/catalog' || path === '/search' || path === '/genres') {
      setActiveView('home');
      setSelectedAnimeId('');
      setActiveEpisodeId('');
      
      const q = searchParams.get('q') || searchParams.get('query') || '';
      const genre = searchParams.get('genre') || searchParams.get('genres') || '';
      const year = searchParams.get('year') || '';
      const status = searchParams.get('status') || '';
      const type = searchParams.get('type') || '';
      const rating = searchParams.get('rating') || '';
      const sort = searchParams.get('sort') || searchParams.get('sortBy') || 'Popularity';

      setSearchQuery(q);
      setSelectedGenre(genre);
      setSelectedYear(year);
      setSelectedStatus(status);
      setSelectedType(type);
      setSelectedRating(rating);
      setSortBy(sort);
    } else if (path === '/myprofile' || path === '/profile') {
      setActiveView('profile');
      setSelectedAnimeId('');
      setActiveEpisodeId('');

      const activeTabMap: Record<string, 'history' | 'favorites' | 'watchlist' | 'notifications' | 'settings'> = {
        '#history': 'history',
        '#favorites': 'favorites',
        '#watchlist': 'watchlist',
        '#notifications': 'notifications',
        '#settings': 'settings'
      };
      if (hash && activeTabMap[hash]) {
        setProfileActiveTab(activeTabMap[hash]);
      } else {
        setProfileActiveTab('history');
      }
    } else if (path.startsWith('/admin')) {
      setActiveView('admin');
      setSelectedAnimeId('');
      setActiveEpisodeId('');

      const tabParam = searchParams.get('tab') || hash.substring(1);
      const validTabs = ['stats', 'anime', 'seasons_episodes', 'users', 'hash_generator', 'backup_restore', 'bulk_operations', 'banner_manager', 'bulk_thumbnails', 'auto_thumbnail', 'auto_setup'];
      if (tabParam && validTabs.includes(tabParam)) {
        setAdminActiveTab(tabParam as any);
      } else {
        setAdminActiveTab('stats');
      }
    } else if (path.startsWith('/anime/')) {
      const routeParts = path.replace(/^\/anime\//, '').split('/');
      const slug = routeParts[0];
      if (slug) {
        setSelectedAnimeId(slug);
        
        if (routeParts[1] === 'season' && routeParts[2]) {
          const sNum = parseInt(routeParts[2], 10);
          if (!isNaN(sNum)) {
            setPendingWatchSeasonNumber(sNum);
          }
          setActiveEpisodeId('');
          setActiveView('details');
        } else if (routeParts[1] && routeParts[1] !== 'season') {
          setActiveEpisodeId(routeParts[1]);
          setActiveView('watch');
        } else {
          setActiveEpisodeId('');
          setActiveView('details');
        }
      }
    } else if (path.startsWith('/watch/')) {
      const routeParts = path.replace(/^\/watch\//, '').split('/');
      const slug = routeParts[0];
      if (slug) {
        setSelectedAnimeId(slug);
        setActiveView('watch');

        if (routeParts[1] && /^s(\d+)=ep(\d+)$/i.test(routeParts[1])) {
          const match = routeParts[1].match(/^s(\d+)=ep(\d+)$/i);
          if (match) {
            const sNum = parseInt(match[1], 10);
            const eNum = parseInt(match[2], 10);
            if (!isNaN(sNum)) setPendingWatchSeasonNumber(sNum);
            if (!isNaN(eNum)) setPendingWatchEpisodeNumber(eNum);
          }
        } else if (routeParts[1] === 'season' && routeParts[2] && routeParts[3] === 'episode' && routeParts[4]) {
          const sNum = parseInt(routeParts[2], 10);
          const eNum = parseInt(routeParts[4], 10);
          if (!isNaN(sNum)) setPendingWatchSeasonNumber(sNum);
          if (!isNaN(eNum)) setPendingWatchEpisodeNumber(eNum);
        } else if (routeParts[1] && routeParts[2]) {
          const sNum = parseInt(routeParts[1], 10);
          const eNum = parseInt(routeParts[2], 10);
          if (!isNaN(sNum)) setPendingWatchSeasonNumber(sNum);
          if (!isNaN(eNum)) setPendingWatchEpisodeNumber(eNum);
        }
      }
    } else if (path === '/about') {
      setActiveView('about');
      setSelectedAnimeId('');
      setActiveEpisodeId('');
    } else if (path === '/contact') {
      setActiveView('contact');
      setSelectedAnimeId('');
      setActiveEpisodeId('');
    } else if (path === '/forbidden') {
      setActiveView('forbidden');
      setSelectedAnimeId('');
      setActiveEpisodeId('');
    } else if (path === '/maintenance') {
      setActiveView('maintenance');
      setSelectedAnimeId('');
      setActiveEpisodeId('');
    } else {
      setActiveView('404');
      setSelectedAnimeId('');
      setActiveEpisodeId('');
    }

    // Restore scroll position
    const fullPath = window.location.pathname + window.location.search + window.location.hash;
    const savedPos = scrollPositions.current[fullPath] || 0;
    setTimeout(() => {
      window.scrollTo({ top: savedPos, behavior: 'instant' as any });
    }, 120);
  };

  // 1. Initial page load and popstate event triggers
  useEffect(() => {
    if (authLoading) return;
    parseURLToState();
  }, [authLoading]);

  useEffect(() => {
    const handlePopState = () => {
      parseURLToState();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 2. Resolve database ID mappings from URL index/slug paths
  useEffect(() => {
    if (!selectedAnimeId || allAnime.length === 0) return;
    const found = allAnime.find(
      a => a.id === selectedAnimeId || generateSlug(a.title) === selectedAnimeId || a.id.toLowerCase() === selectedAnimeId.toLowerCase()
    );
    if (found && found.id !== selectedAnimeId) {
      setSelectedAnimeId(found.id);
    }
  }, [selectedAnimeId, allAnime]);

  useEffect(() => {
    if (activeDetailsSeasons.length === 0 || pendingWatchSeasonNumber === null) return;
    const foundSeason = activeDetailsSeasons.find(s => s.number === pendingWatchSeasonNumber);
    if (foundSeason) {
      setActiveDetailsSelectedSeasonId(foundSeason.id);
    }
  }, [pendingWatchSeasonNumber, activeDetailsSeasons]);

  useEffect(() => {
    if (activeDetailsEpisodes.length === 0 || pendingWatchEpisodeNumber === null) return;
    let targetSeasonId = activeDetailsSelectedSeasonId;
    if (!targetSeasonId && pendingWatchSeasonNumber !== null) {
      targetSeasonId = activeDetailsSeasons.find(s => s.number === pendingWatchSeasonNumber)?.id || '';
    }

    const foundEp = activeDetailsEpisodes.find(ep => 
      (!targetSeasonId || ep.seasonId === targetSeasonId) && ep.number === pendingWatchEpisodeNumber
    );
    if (foundEp) {
      setActiveEpisodeId(foundEp.id);
      setActivePlayEpisode(foundEp);
    }
  }, [pendingWatchEpisodeNumber, activeDetailsEpisodes, activeDetailsSelectedSeasonId, pendingWatchSeasonNumber, activeDetailsSeasons]);

  // 3. Consolidated URL state-to-browser synchronization writer
  useEffect(() => {
    if (authLoading) return;
    if (!user) return; // Guarded routes will handle unauthenticated redirect
    
    let targetPath = '/';
    let targetSearch = '';
    let targetHash = '';

    if (activeView === 'home') {
      targetPath = '/';
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (selectedGenre) params.set('genre', selectedGenre);
      if (selectedYear) params.set('year', selectedYear);
      if (selectedStatus) params.set('status', selectedStatus);
      if (selectedType) params.set('type', selectedType);
      if (selectedRating) params.set('rating', selectedRating);
      if (sortBy && sortBy !== 'Popularity') params.set('sort', sortBy);
      
      const pString = params.toString();
      if (pString) {
        targetSearch = `?${pString}`;
      }
    } else if (activeView === 'profile') {
      targetPath = '/profile';
      if (profileActiveTab && profileActiveTab !== 'history') {
        targetHash = `#${profileActiveTab}`;
      }
    } else if (activeView === 'admin') {
      targetPath = '/admin';
      if (adminActiveTab && adminActiveTab !== 'stats') {
        targetSearch = `?tab=${adminActiveTab}`;
      }
    } else if (activeView === 'details' && selectedAnimeId) {
      const anime = allAnime.find(a => a.id === selectedAnimeId);
      const slug = anime ? generateSlug(anime.title) : selectedAnimeId;
      
      if (pendingWatchSeasonNumber !== null) {
        targetPath = `/anime/${slug}/season/${pendingWatchSeasonNumber}`;
      } else {
        targetPath = `/anime/${slug}`;
      }
    } else if (activeView === 'watch' && selectedAnimeId && activeEpisodeId) {
      const anime = allAnime.find(a => a.id === selectedAnimeId);
      const slug = anime ? generateSlug(anime.title) : selectedAnimeId;
      
      const ep = activeDetailsEpisodes.find(e => e.id === activeEpisodeId);
      const sNum = pendingWatchSeasonNumber || (activeDetailsSeasons.find(s => s.id === ep?.seasonId)?.number) || 1;
      const eNum = ep ? ep.number : 1;
      
      targetPath = `/watch/${slug}/s${sNum}=ep${eNum}`;
    } else if (activeView === 'about') {
      targetPath = '/about';
    } else if (activeView === 'contact') {
      targetPath = '/contact';
    } else if (activeView === 'forbidden') {
      targetPath = '/forbidden';
    } else if (activeView === 'maintenance') {
      targetPath = '/maintenance';
    } else if (activeView === '404') {
      targetPath = '/404';
    }

    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const currentHash = window.location.hash;

    if (currentPath !== targetPath || currentSearch !== targetSearch || currentHash !== targetHash) {
      const fullTarget = `${targetPath}${targetSearch}${targetHash}`;
      window.history.pushState(
        { activeView, selectedAnimeId, activeEpisodeId, profileActiveTab, adminActiveTab },
        '',
        fullTarget
      );
    }
  }, [
    activeView, 
    selectedAnimeId, 
    activeEpisodeId, 
    profileActiveTab, 
    adminActiveTab, 
    searchQuery, 
    selectedGenre, 
    selectedYear, 
    selectedStatus, 
    selectedType, 
    selectedRating, 
    sortBy, 
    allAnime, 
    user, 
    authLoading,
    pendingWatchSeasonNumber,
    activeDetailsEpisodes,
    activeDetailsSeasons
  ]);

  // 4. Session Guards & Redirect Protection
  useEffect(() => {
    if (authLoading) return;
    
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const currentHash = window.location.hash;
    const originalUrl = `${currentPath}${currentSearch}${currentHash}`;

    if (!user) {
      if (!currentPath.startsWith('/auth')) {
        const authRedirect = `/auth?redirect=${encodeURIComponent(originalUrl)}`;
        window.history.replaceState({ activeView: 'auth' }, '', authRedirect);
        setAuthMode('login');
      }
    } else {
      if (currentPath.startsWith('/auth')) {
        const params = new URLSearchParams(window.location.search);
        const redirectUrl = params.get('redirect');
        if (redirectUrl) {
          window.history.replaceState(null, '', decodeURIComponent(redirectUrl));
          parseURLToState();
        } else {
          window.history.replaceState(null, '', '/');
          setActiveView('home');
        }
      }
    }
  }, [user, authLoading]);

  // Forbidden Admin guard protection
  useEffect(() => {
    if (authLoading || !user) return;
    if (window.location.pathname.startsWith('/admin') && user.role !== 'admin') {
      window.history.replaceState({ activeView: 'forbidden' }, '', '/forbidden');
      setActiveView('forbidden');
    }
  }, [user, authLoading, activeView]);

  // Quick Demo Admin privilege hook
  const [showAdminBypassOption, setShowAdminBypassOption] = useState(false);

  // Download progress states
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string>('');

  const handleDownloadVideo = async (url: string, suggestedFilename: string) => {
    if (!url) return;
    setDownloadingUrl(url);
    setDownloadProgress('Initiating secure system download...');
    
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('Network response was not ok');
      
      const contentLength = response.headers.get('content-length');
      let blob: Blob;
      
      if (contentLength && 'body' in response && response.body) {
        const total = parseInt(contentLength, 10);
        let loaded = 0;
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          const percent = total ? Math.round((loaded / total) * 100) : 0;
          setDownloadProgress(`Downloading: ${percent}% completed`);
        }
        blob = new Blob(chunks, { type: response.headers.get('content-type') || 'video/mp4' });
      } else {
        setDownloadProgress('Downloading video data...');
        blob = await response.blob();
      }
      
      const downloadUri = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUri;
      link.setAttribute('download', suggestedFilename);
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUri);
      
      setDownloadProgress('Download completed successfully!');
      setTimeout(() => setDownloadingUrl(null), 3500);
    } catch (err) {
      console.warn("CORS fetch failed or browser prohibited blob stream download. Falling back to direct window download.", err);
      setDownloadProgress('Preparing direct file link pathway...');
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', suggestedFilename);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setDownloadProgress('Opened raw video stream in a new tab. Tap-and-hold (Mobile) or right-click (Desktop) to select Save Video!');
      setTimeout(() => setDownloadingUrl(null), 10000);
    }
  };

  // Keep authForm in a ref to avoid recreating the onAuthStateChanged listener on every keystroke
  const authFormRef = React.useRef(authForm);
  useEffect(() => {
    authFormRef.current = authForm;
  }, [authForm]);

  // Log whenever user or authLoading state changes
  useEffect(() => {
    console.log("[Auth State Log] User state changed:", user ? `UID: ${user.uid}, Email: ${user.email}, Role: ${user.role}` : "NULL");
    console.log("[Auth State Log] AuthLoading state:", authLoading);
    if (!authLoading) {
      if (user) {
        console.log("[Auth State Log] User redirected to dashboard / Dashboard mounted.");
      } else {
        console.log("[Auth State Log] Redirected to login page because user is null and authLoading is false.");
      }
    }
  }, [user, authLoading]);

  // 1. Listen to Authenticated state and create custom profile documents in user space
  useEffect(() => {
    console.log("[Auth Setup Log] Initializing onAuthStateChanged subscription...");
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      console.log("[Auth State Log] onAuthStateChanged triggered. AuthUser:", authUser ? `UID: ${authUser.uid}, Email: ${authUser.email}` : "NULL");
      
      if (authUser) {
        console.log("[Auth State Log] Current Firebase user exists. Fetching/creating Firestore user document...");
        let profileData: UserProfile;
        
        try {
          const userDocRef = doc(db, 'users', authUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          const emailLower = (authUser.email || '').toLowerCase().trim();
          let invitedPermissions: string[] | null = null;
          let inviteDocId: string | null = null;
          try {
            const invitesQuery = query(collection(db, 'adminInvites'), where('email', '==', emailLower), where('status', '==', 'pending'));
            const invitesSnap = await getDocs(invitesQuery);
            if (!invitesSnap.empty) {
              const inviteDoc = invitesSnap.docs[0];
              invitedPermissions = inviteDoc.data().permissions || ['view_analytics', 'manage_anime'];
              inviteDocId = inviteDoc.id;
            }
          } catch (invErr) {
            console.warn("Failed checking admin invitations:", invErr);
          }

          if (!userDocSnap.exists()) {
            console.log("[Auth State Log] User document does not exist in Firestore. Creating one...");
            const isDefaultAdmin = checkIsDefaultAdmin(authUser.email);
            profileData = {
              uid: authUser.uid,
              email: authUser.email || '',
              displayName: authUser.displayName || authFormRef.current.displayName || authUser.email?.split('@')[0] || 'Aibou',
              photoURL: authUser.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${authUser.email}`,
              role: (isDefaultAdmin || invitedPermissions) ? 'admin' : 'user',
              permissions: invitedPermissions || (isDefaultAdmin ? ['all'] : []),
              createdAt: new Date(),
              isBanned: false
            };
            await setDoc(userDocRef, profileData);
            console.log("[Auth State Log] Created Firestore user document:", profileData);
          } else {
            console.log("[Auth State Log] User document found in Firestore.");
            profileData = userDocSnap.data() as UserProfile;
            let needsUpdate = false;
            
            // Clean/standardize email and info
            if (profileData.email === 'aniverse@gmail.com' || profileData.email === 'aniverse@gmail.com ') {
              profileData.email = 'notxanlos@gmail.com';
              profileData.displayName = 'AnimeStream Admin';
              profileData.photoURL = 'https://api.dicebear.com/7.x/pixel-art/svg?seed=notxanlos@gmail.com';
              needsUpdate = true;
            }
            const isDefaultAdmin = checkIsDefaultAdmin(authUser.email || profileData.email);
            if (isDefaultAdmin && profileData.role !== 'admin') {
              profileData.role = 'admin';
              if (!profileData.permissions || !profileData.permissions.includes('all')) {
                profileData.permissions = ['all'];
              }
              needsUpdate = true;
            }
            if (invitedPermissions) {
              profileData.role = 'admin';
              profileData.permissions = invitedPermissions;
              needsUpdate = true;
            }
            if (needsUpdate) {
              await setDoc(userDocRef, profileData);
              console.log("[Auth State Log] Updated existing Firestore user document with defaults/admin credentials.");
            }
          }

          if (inviteDocId) {
            await updateDoc(doc(db, 'adminInvites', inviteDocId), {
              status: 'accepted',
              acceptedAt: new Date(),
              acceptedByUid: authUser.uid
            });
            await addDoc(collection(db, 'adminLogs'), {
              userId: authUser.uid,
              email: authUser.email || 'unknown@animestream.net',
              displayName: authUser.displayName || authUser.email?.split('@')[0] || 'Admin',
              actionType: 'ACCEPT_INVITATION',
              details: `Accepted admin invitation. Granted permissions: ${invitedPermissions?.join(', ')}`,
              timestamp: new Date()
            });
          }
        } catch (err) {
          console.error("[Auth State Log] Error setting/getting user details from Firestore:", err);
          console.warn("[Auth State Log] Falling back to local/in-memory profile to prevent login loop.");
          
          // Resilient Fallback: If Firestore is unavailable/throws error, don't lock user out
          const isDefaultAdmin = checkIsDefaultAdmin(authUser.email);
          profileData = {
            uid: authUser.uid,
            email: authUser.email || '',
            displayName: authUser.displayName || authFormRef.current.displayName || authUser.email?.split('@')[0] || 'Aibou',
            photoURL: authUser.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${authUser.email}`,
            role: isDefaultAdmin ? 'admin' : 'user',
            createdAt: new Date(),
            isBanned: false
          };
        }

        if (profileData.isBanned) {
          console.warn("[Auth State Log] User is banned. Signing out...");
          setAuthError("This user account has been banned from accessing the anime universe portal.");
          await firebaseSignOut(auth);
          setSanitizedUser(null);
        } else {
          console.log("[Auth State Log] User authenticated successfully:", profileData);
          setSanitizedUser(profileData);
          try {
            syncUserBackup(profileData.uid);
          } catch (backupErr) {
            console.warn("Non-blocking backup sync issue on login:", backupErr);
          }
          // Trigger automatic seed filling on successful sign in
          try {
            seedAnimeDatabase();
          } catch (seedErr) {
            console.error("[Auth State Log] Auto-seeding anime database failed:", seedErr);
          }
        }
      } else {
        console.log("[Auth State Log] No Firebase auth user is active. Resetting user to null.");
        setSanitizedUser(null);
      }
      // Add a controlled premium delay of 1.8 seconds so all database collections, images, and states load fully and cleanly
      setTimeout(() => {
        setAuthLoading(false);
      }, 1800);
    });

    return () => {
      console.log("[Auth Cleanup Log] Unsubscribing onAuthStateChanged...");
      unsubscribe();
    };
  }, []);

  // 2. Real-time data sync for Anime collections
  useEffect(() => {
    if (!user) return;

    const animeQuery = query(collection(db, 'anime'));
    const unsubscribeAnime = onSnapshot(animeQuery, (snapshot) => {
      const animeList: Anime[] = [];
      snapshot.forEach(docSnap => {
        animeList.push({ id: docSnap.id, ...docSnap.data() } as Anime);
      });
      setAllAnime(animeList);
    }, (err) => {
      console.error("Firestore onSnapshot subscription anime failure:", err);
    });

    return () => unsubscribeAnime();
  }, [user]);

  // Real-time synchronization of total episodes count from Firestore with localStorage fallback
  useEffect(() => {
    if (!user) return;

    const episodesQuery = query(collection(db, 'episodes'));
    const unsubscribeEpisodes = onSnapshot(episodesQuery, (snapshot) => {
      const dbCount = snapshot.size;

      let localCount = 0;
      try {
        const localEpsRaw = localStorage.getItem('animayx_db_col_episodes') || '[]';
        const localEps = JSON.parse(localEpsRaw);
        if (Array.isArray(localEps)) {
          const dbIds = new Set(snapshot.docs.map(d => d.id));
          const uniqueLocalEps = localEps.filter((le: any) => le && le.id && !dbIds.has(le.id));
          localCount = uniqueLocalEps.length;
        }
      } catch (e) {
        console.warn("Could not read local fallback episodes count:", e);
      }

      setTotalEpisodesCount(dbCount + localCount);
    }, (err) => {
      console.warn("Could not subscribe to episodes collection for total count, falling back to local storage:", err);
      try {
        const localEpsRaw = localStorage.getItem('animayx_db_col_episodes') || '[]';
        const localEps = JSON.parse(localEpsRaw);
        if (Array.isArray(localEps)) {
          setTotalEpisodesCount(localEps.length);
        }
      } catch (e) {
        setTotalEpisodesCount(0);
      }
    });

    return () => unsubscribeEpisodes();
  }, [user]);

  // 3. Automatic Comment Migration from Episode-Wise to Anime-Wise
  useEffect(() => {
    if (!user || allAnime.length === 0) return;

    const migrateComments = async () => {
      try {
        const commentsSnap = await getDocs(collection(db, 'comments'));
        const episodesSnap = await getDocs(collection(db, 'episodes'));
        
        const episodesMap = new Map<string, string>(); // episodeId -> animeId
        episodesSnap.forEach(epDoc => {
          const epData = epDoc.data();
          if (epData.animeId && epDoc.id) {
            episodesMap.set(epDoc.id, epData.animeId);
          }
        });

        const batch = writeBatch(db);
        let hasUpdates = false;

        commentsSnap.forEach(commentDoc => {
          const commentData = commentDoc.data();
          if (!commentData.animeId && commentData.episodeId) {
            const mappedAnimeId = episodesMap.get(commentData.episodeId);
            if (mappedAnimeId) {
              batch.update(doc(db, 'comments', commentDoc.id), {
                animeId: mappedAnimeId
              });
              hasUpdates = true;
              console.log(`Migrated comment ${commentDoc.id} from episodeId ${commentData.episodeId} to animeId ${mappedAnimeId}`);
            }
          }
        });

        if (hasUpdates) {
          await batch.commit();
          console.log("Comments successfully migrated anime-wise!");
        }
      } catch (err) {
        console.error("Comment migration failed gracefully:", err);
      }
    };

    migrateComments();
  }, [user, allAnime]);

  // 3. Real-time favorites sync
  useEffect(() => {
    if (!user) return;

    const favoritesQuery = query(
      collection(db, 'favorites'),
      where('userId', '==', user.uid)
    );

    const unsubscribeFavorites = onSnapshot(favoritesQuery, (snapshot) => {
      const favoriteIds: string[] = [];
      snapshot.forEach(docSnap => {
        favoriteIds.push(docSnap.data().animeId);
      });
      setFavorites(favoriteIds);
    }, (err) => {
      console.error("Firestore onSnapshot favorites synchronization issue:", err);
    });

    return () => unsubscribeFavorites();
  }, [user]);

  // Real-time favorite episodes sync
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'favoriteEpisodes'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const epIds: string[] = [];
      snapshot.forEach(docSnap => {
        epIds.push(docSnap.data().episodeId);
      });
      setFavoriteEpisodes(epIds);
    }, (err) => {
      console.error("Firestore onSnapshot favoriteEpisodes sync issue:", err);
    });

    return () => unsubscribe();
  }, [user]);

  // 3.1 Extended homepage widgets subscriptions
  useEffect(() => {
    if (!user) return;

    // A. Subscribing to latest episodes
    const epsQuery = query(collection(db, 'episodes'), orderBy('createdAt', 'desc'), limit(15));
    const unsubEps = onSnapshot(epsQuery, (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      const getTimestamp = (val: any) => {
        if (!val) return 0;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'string' || typeof val === 'number') return new Date(val).getTime();
        if (val.seconds) return val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1000000 : 0);
        return 0;
      };
      // Sort desc by createdAt or ID fallback
      list.sort((a, b) => {
        const timeA = getTimestamp(a.createdAt);
        const timeB = getTimestamp(b.createdAt);
        return timeB - timeA;
      });
      setLatestEpisodes(list.slice(0, 10));
    });

    // B. Subscribing to editorial news
    const newsQuery = query(collection(db, 'news'), limit(25));
    const unsubNews = onSnapshot(newsQuery, (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => {
        const dYA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dYB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dYB - dYA;
      });
      setHomeNews(list);
    });

    // C. Subscribing to schedules
    const schedQuery = collection(db, 'schedule');
    const unsubSched = onSnapshot(schedQuery, (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setHomeSchedule(list);
    });

    return () => {
      unsubEps();
      unsubNews();
      unsubSched();
    };
  }, [user]);

  // 3.2 Real-time watchlist items sync
  useEffect(() => {
    if (!user) return;

    const watchlistQuery = query(
      collection(db, 'watchlist'),
      where('userId', '==', user.uid)
    );

    const unsubscribeWatchlist = onSnapshot(watchlistQuery, (snapshot) => {
      const ids: string[] = [];
      snapshot.forEach(docSnap => {
        ids.push(docSnap.data().animeId);
      });
      setWatchlistIds(ids);
    }, (err) => {
      console.error("Firestore onSnapshot watchlist synchronization issue:", err);
    });

    return () => unsubscribeWatchlist();
  }, [user]);

  const handleToggleWatchlist = async (animeId: string) => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'watchlist'),
        where('userId', '==', user.uid),
        where('animeId', '==', animeId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        // Remove from watchlist
        await deleteDoc(doc(db, 'watchlist', snap.docs[0].id));
      } else {
        // Add to watchlist
        await addDoc(collection(db, 'watchlist'), {
          userId: user.uid,
          animeId: animeId,
          createdAt: new Date()
        });
      }
      try {
        await syncUserBackup(user.uid);
      } catch (bErr) {
        console.warn("Non-blocking backup sync issue:", bErr);
      }
    } catch (err) {
      console.error("Error toggling watchlist:", err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !user || !activeDetailsAnime) return;

    try {
      await addDoc(collection(db, 'comments'), {
        animeId: activeDetailsAnime.id,
        userId: user.uid,
        username: user.displayName || 'Unverified Member',
        userDisplayName: user.displayName || 'Unverified Member',
        userPhotoURL: user.photoURL || '',
        userRole: user.role || 'member',
        text: commentText.trim(),
        likesCount: 0,
        likedBy: [],
        replies: [],
        createdAt: new Date(),
        timestamp: new Date()
      });
      setCommentText('');
      try {
        await syncUserBackup(user.uid);
      } catch (bErr) {
        console.warn("Non-blocking backup sync issue:", bErr);
      }
    } catch (err) {
      console.error("Error adding comment:", err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    if (window.confirm("Are you sure you want to delete this comment?")) {
      try {
        await deleteDoc(doc(db, 'comments', commentId));
        try {
          await syncUserBackup(user.uid);
        } catch (bErr) {
          console.warn("Non-blocking backup sync issue:", bErr);
        }
      } catch (err) {
        console.error("Error deleting comment:", err);
      }
    }
  };

  const handleStartEditComment = (commentId: string, text: string) => {
    setEditingCommentId(commentId);
    setEditingCommentText(text);
  };

  const handleSaveEditComment = async (commentId: string) => {
    if (!editingCommentText.trim() || !user) return;
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        text: editingCommentText.trim(),
        updatedAt: new Date()
      });
      setEditingCommentId(null);
      setEditingCommentText('');
      try {
        await syncUserBackup(user.uid);
      } catch (bErr) {
        console.warn("Non-blocking backup sync issue:", bErr);
      }
    } catch (err) {
      console.error("Error saving edited comment:", err);
    }
  };

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim() || !user || !activeDetailsAnime) return;
    try {
      await addDoc(collection(db, 'reviews'), {
        animeId: activeDetailsAnime.id,
        userId: user.uid,
        userDisplayName: user.displayName || 'Unverified Member',
        userPhotoURL: user.photoURL || '',
        title: reviewTitle.trim() || '',
        text: reviewText.trim(),
        rating: reviewRating,
        createdAt: new Date()
      });
      setReviewText('');
      setReviewTitle('');
      setReviewRating(5);
      try {
        await syncUserBackup(user.uid);
      } catch (bErr) {
        console.warn("Non-blocking backup sync issue:", bErr);
      }
    } catch (err) {
      console.error("Error adding review:", err);
    }
  };

  const handleLikeComment = async (commentId: string, currentLikedBy: string[] = [], currentLikesCount: number = 0) => {
    if (!user) return;
    try {
      const hasLiked = currentLikedBy.includes(user.uid);
      const newLikedBy = hasLiked 
        ? currentLikedBy.filter(uid => uid !== user.uid)
        : [...currentLikedBy, user.uid];
      const newLikesCount = hasLiked 
        ? Math.max(0, currentLikesCount - 1)
        : currentLikesCount + 1;

      await updateDoc(doc(db, 'comments', commentId), {
        likedBy: newLikedBy,
        likesCount: newLikesCount
      });
    } catch (err) {
      console.error("Error liking comment:", err);
    }
  };

  const handleAddReply = async (commentId: string, currentReplies: any[] = []) => {
    const replyText = commentReplyTexts[commentId];
    if (!replyText || !replyText.trim() || !user) return;

    try {
      const newReply = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        userId: user.uid,
        userDisplayName: user.displayName || 'Unverified Member',
        userPhotoURL: user.photoURL || '',
        text: replyText.trim(),
        createdAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'comments', commentId), {
        replies: [...currentReplies, newReply]
      });

      // Clear input
      setCommentReplyTexts(prev => ({ ...prev, [commentId]: '' }));
      setActiveReplyCommentId(null);
    } catch (err) {
      console.error("Error adding reply to comment:", err);
    }
  };

  // Refresh UserProfile data trigger
  const forceRefreshUserProfile = async () => {
    if (!user) return;
    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) {
        const profileData = userSnap.data() as UserProfile;
        let needsUpdate = false;
        if (profileData.email === 'aniverse@gmail.com' || profileData.email === 'aniverse@gmail.com ') {
          profileData.email = 'notxanlos@gmail.com';
          profileData.displayName = 'AnimeStream Admin';
          profileData.photoURL = 'https://api.dicebear.com/7.x/pixel-art/svg?seed=notxanlos@gmail.com';
          needsUpdate = true;
        }
        const isDefaultAdmin = checkIsDefaultAdmin(profileData.email);
        if (isDefaultAdmin && profileData.role !== 'admin') {
          profileData.role = 'admin';
          needsUpdate = true;
        }
        if (needsUpdate) {
          await setDoc(doc(db, 'users', user.uid), profileData);
        }
        setSanitizedUser(profileData);
      }
    } catch (err) {
      console.error("Could not refresh user profile details:", err);
    }
  };

  // 4. Fetch Details state whenever an anime is selected
  useEffect(() => {
    if (!selectedAnimeId || !user) return;

    // Load active anime info
    const targetAnime = allAnime.find(a => a.id === selectedAnimeId);
    if (targetAnime) {
      setActiveDetailsAnime(targetAnime);
    }

    // Load seasons
    const seasonsQuery = query(collection(db, 'seasons'), where('animeId', '==', selectedAnimeId));
    const unsubscribeSeasons = onSnapshot(seasonsQuery, (snapshot) => {
      const seasonList: Season[] = [];
      snapshot.forEach(sDoc => {
        const sData = sDoc.data() as Season;
        if (sData.animeId === selectedAnimeId) {
          seasonList.push(sData);
        }
      });
      seasonList.sort((a, b) => a.number - b.number);
      setActiveDetailsSeasons(seasonList);

      if (seasonList.length > 0) {
        // Default to Season 1 or first season
        setActiveDetailsSelectedSeasonId(seasonList[0].id);
      } else {
        setActiveDetailsSelectedSeasonId('');
      }
    });

    // Load episodes
    const epsQuery = query(collection(db, 'episodes'), where('animeId', '==', selectedAnimeId));
    const unsubscribeEpisodes = onSnapshot(epsQuery, (snapshot) => {
      const episodeList: Episode[] = [];
      snapshot.forEach(epDoc => {
        const epData = epDoc.data() as Episode;
        if (epData.animeId === selectedAnimeId) {
          episodeList.push(epData);
        }
      });
      episodeList.sort((a, b) => a.number - b.number);
      setActiveDetailsEpisodes(episodeList);
      if (episodeList.length > 0) {
        setSelectedCommentEpisodeId(prev => prev || episodeList[0].id);
      }
    });

    // Load comments
    const commentsQuery = query(collection(db, 'comments'), where('animeId', '==', selectedAnimeId));
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      const commentList: any[] = [];
      snapshot.forEach(cDoc => {
        commentList.push({ id: cDoc.id, ...cDoc.data() });
      });
      commentList.sort((a,b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA;
      });
      setActiveDetailsComments(commentList);
    });

    // Load reviews
    const reviewsQuery = query(collection(db, 'reviews'), where('animeId', '==', selectedAnimeId));
    const unsubscribeReviews = onSnapshot(reviewsQuery, (snapshot) => {
      const reviewList: any[] = [];
      snapshot.forEach(rDoc => {
        reviewList.push({ id: rDoc.id, ...rDoc.data() });
      });
      reviewList.sort((a,b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA;
      });
      setActiveDetailsReviews(reviewList);
    });

    return () => {
      unsubscribeSeasons();
      unsubscribeEpisodes();
      unsubscribeComments();
      unsubscribeReviews();
    };
  }, [selectedAnimeId, allAnime, user]);

  // Trigger episode load when active episode is set
  useEffect(() => {
    if (!activeEpisodeId || !user) return;
    const findEp = activeDetailsEpisodes.find(ep => ep.id === activeEpisodeId);
    if (findEp) {
      setActivePlayEpisode(findEp);
    } else {
      if (activeEpisodeId.endsWith('_movie') && activeDetailsAnime) {
        const virtualEpisode: Episode = {
          id: activeDetailsAnime.id + '_movie',
          animeId: activeDetailsAnime.id,
          seasonId: 'movie_season',
          seasonNumber: 1,
          number: 1,
          title: activeDetailsAnime.title,
          description: activeDetailsAnime.description,
          videoUrl: activeDetailsAnime.videoUrl || '',
          thumbnailUrl: activeDetailsAnime.thumbnailUrl,
          duration: activeDetailsAnime.duration || 5400,
          createdAt: activeDetailsAnime.createdAt || new Date()
        };
        setActivePlayEpisode(virtualEpisode);
        return;
      }

      // Look up globally if details view is bypassed
      const epSnap = doc(db, 'episodes', activeEpisodeId);
      getDoc(epSnap).then((snap) => {
        if (snap.exists()) {
          setActivePlayEpisode(snap.data() as Episode);
        }
      });
    }
  }, [activeEpisodeId, activeDetailsEpisodes, activeDetailsAnime, user]);

  // Synchronize comment episode id with currently active playing episode
  useEffect(() => {
    if (activePlayEpisode) {
      setSelectedCommentEpisodeId(activePlayEpisode.id);
      // Default watch switcher to the playing episode's season
      setWatchSelectedSeasonId(activePlayEpisode.seasonId);
    }
  }, [activePlayEpisode]);

  // Load real-time watch progress history for current user & selected anime
  useEffect(() => {
    if (!user || !selectedAnimeId) return;

    const historyQuery = query(
      collection(db, 'watchHistory'),
      where('userId', '==', user.uid),
      where('animeId', '==', selectedAnimeId)
    );

    const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
      const historyList: any[] = [];
      snapshot.forEach(d => {
        historyList.push(d.data());
      });
      setWatchHistory(historyList);
    }, (err) => {
      console.warn("Watch history loading warning:", err);
    });

    return () => unsubscribe();
  }, [selectedAnimeId, user]);

  // Load real-time entire watch progress history for current user (Continue Watching)
  useEffect(() => {
    if (!user) {
      setAllWatchHistory([]);
      setIsWatchHistoryLoading(false);
      return;
    }

    setIsWatchHistoryLoading(true);
    const historyQuery = query(
      collection(db, 'watchHistory'),
      where('userId', '==', user.uid)
    );

    const getTimestamp = (val: any) => {
      if (!val) return 0;
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      if (val instanceof Date) return val.getTime();
      if (typeof val === 'string' || typeof val === 'number') return new Date(val).getTime();
      if (val.seconds) return val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1000000 : 0);
      return 0;
    };

    const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
      const historyList: WatchHistory[] = [];
      snapshot.forEach(d => {
        historyList.push({ id: d.id, ...d.data() } as WatchHistory);
      });
      // Sort client-side to prevent Firestore "missing index" failures
      historyList.sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));
      setAllWatchHistory(historyList);
      setIsWatchHistoryLoading(false);
    }, (err) => {
      console.warn("Global watch history loading warning:", err);
      setIsWatchHistoryLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Remove episode manually from Continue Watching
  const handleRemoveFromContinueWatching = async (watchHistoryId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'watchHistory', watchHistoryId));
    } catch (err) {
      console.error("Error removing from continue watching:", err);
    }
  };

  // Favorite toggle action
  const handleToggleFavorite = async (animeId: string) => {
    if (!user) return;
    const favoriteId = `${user.uid}_${animeId}`;
    try {
      if (favorites.includes(animeId)) {
        await deleteDoc(doc(db, 'favorites', favoriteId));
      } else {
        await setDoc(doc(db, 'favorites', favoriteId), {
          id: favoriteId,
          userId: user.uid,
          animeId: animeId,
          createdAt: new Date()
        });
      }
    } catch (err) {
      console.error("Favorite checklist save failure:", err);
    }
  };

  // Favorite episode toggle action
  const handleToggleFavoriteEpisode = async (episodeId: string) => {
    if (!user) return;
    const favoriteId = `${user.uid}_${episodeId}`;
    try {
      if (favoriteEpisodes.includes(episodeId)) {
        await deleteDoc(doc(db, 'favoriteEpisodes', favoriteId));
      } else {
        await setDoc(doc(db, 'favoriteEpisodes', favoriteId), {
          id: favoriteId,
          userId: user.uid,
          episodeId: episodeId,
          createdAt: new Date()
        });
      }
    } catch (err) {
      console.error("Favorite episode checklist save failure:", err);
    }
  };

  // Auth Submit Action (Email & Password login/register)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    const { email, password, displayName } = authForm;

    if (authMode === 'forgot') {
      if (!email) {
        setAuthError('Email address is required to reset password.');
        setAuthLoading(false);
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        setAuthSuccess('A password reset link has been dispatched to your email address.');
        setAuthLoading(false);
      } catch (err: any) {
        console.error("[Auth Event Log] Password reset failure:", err);
        setAuthError(err.message || "An error occurred while sending reset email.");
        setAuthLoading(false);
      }
      return;
    }

    if (!email || !password) {
      setAuthError('Email and Password details are required.');
      setAuthLoading(false);
      return;
    }

    const modeLabel = authMode === 'register' ? 'Registration' : 'Login';
    console.log(`[Auth Event Log] ${modeLabel} started for email: ${email}`);

    try {
      if (authMode === 'register') {
        if (!displayName) {
          setAuthError('Please input a representative screen display name.');
          setAuthLoading(false);
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
        console.log(`[Auth Event Log] Registration API call succeeded.`);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        console.log(`[Auth Event Log] Login API call succeeded.`);
      }

      console.log(`[Auth Event Log] ${modeLabel} successful.`);

      if (getLocalSandboxMode()) {
        window.location.reload();
      }
    } catch (err: any) {
      console.error(`[Auth Event Log] ${modeLabel} operation failure:`, err);
      // Humanize standard Firebase exceptions
      if (err.code === 'auth/unauthorized-domain') {
        setAuthError(`This domain (${window.location.hostname}) is not authorized in your Firebase Console. Please add "${window.location.hostname}" to Authentication -> Settings -> Authorized Domains in the Firebase Console.`);
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError("Invalid credentials provided. Verify and retry.");
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError("This email address is already registered.");
      } else if (err.code === 'auth/weak-password') {
        setAuthError("Substituted passwords must exceed 6 characters.");
      } else {
        setAuthError(err.message || "An authentication error has occurred.");
      }
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    setAuthLoading(true);
    console.log("[Auth Event Log] Google Login started");
    try {
      await signInWithPopup(auth, googleProvider);
      console.log("[Auth Event Log] Google Login successful.");
    } catch (err: any) {
      console.error("[Auth Event Log] Google Authenticated connection login failure:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setAuthError(`This domain (${window.location.hostname}) is not authorized in your Firebase Console. Please add "${window.location.hostname}" to Authentication -> Settings -> Authorized Domains in the Firebase Console.`);
      } else {
        setAuthError("Google Sign-In failed. Try standard account email instead.");
      }
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    console.log("[Auth Event Log] Logout initiated.");
    try {
      // Clear authenticated session in Firebase Auth
      await firebaseSignOut(auth);
      
      // Clear user-related cache and states
      setSanitizedUser(null);
      
      // Remove protected route and active viewing selections
      setSelectedAnimeId('');
      setActiveEpisodeId('');
      setActiveView('home');
      
      // Redirect using replace navigation to prevent back-button history recall
      window.history.replaceState({ activeView: 'auth' }, '', '/auth');
      
      console.log("[Auth Event Log] Logout complete. Securely redirected to /auth.");
    } catch (err) {
      console.error("[Auth Event Log] Logout has failed:", err);
    }
  };

  // Quick router links actions
  const navigateToHome = () => {
    setSelectedAnimeId('');
    setActiveEpisodeId('');
    setActiveView('home');
  };

  const navigateToAnimeDetails = (animeId: string) => {
    setSelectedAnimeId(animeId);
    setActiveView('details');
  };

  const navigateToPlayEpisode = (animeId: string, episodeId: string) => {
    setSelectedAnimeId(animeId);
    setActiveEpisodeId(episodeId);
    setActiveView('watch');
  };

  // Filtering Anime collections dynamically
  const filteredAnimeList = allAnime
    .filter(a => {
      // Search match
      const matchesSearch = searchQuery 
        ? a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
          a.description?.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      // Genre match
      const matchesGenre = selectedGenre 
        ? a.genres?.includes(selectedGenre as any)
        : true;

      // Year match
      const matchesYear = selectedYear 
        ? a.releaseYear?.toString() === selectedYear
        : true;

      // Status match
      const matchesStatus = selectedStatus 
        ? a.status?.toLowerCase() === selectedStatus.toLowerCase()
        : true;

      // Type match
      const matchesType = selectedType 
        ? (selectedType === 'TV' || selectedType === 'Series')
          ? (a.type === 'Series' || a.type === 'TV' || !a.type)
          : a.type?.toLowerCase() === selectedType.toLowerCase()
        : true;

      // Language match
      const matchesLanguage = selectedLanguage 
        ? (selectedLanguage === 'Sub' 
            ? (a.language === 'Sub' || a.language === 'Both' || !a.language) 
            : (a.language === 'Dub' || a.language === 'Both'))
        : true;

      // Rating match
      const matchesRating = selectedRating 
        ? (parseFloat(a.rating || '0') >= parseFloat(selectedRating))
        : true;

      return matchesSearch && matchesGenre && matchesYear && matchesStatus && matchesType && matchesLanguage && matchesRating;
    })
    .sort((a, b) => {
      if (sortBy === 'A-Z') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'Recently Added') {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA || (b.releaseYear || 0) - (a.releaseYear || 0);
      }
      if (sortBy === 'Recently Updated') {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'Popularity') {
        const rankA = a.category === 'Popular' ? 2 : a.category === 'Featured' ? 1 : 0;
        const rankB = b.category === 'Popular' ? 2 : b.category === 'Featured' ? 1 : 0;
        if (rankB !== rankA) return rankB - rankA;
        return parseFloat(b.rating || '0') - parseFloat(a.rating || '0');
      }
      return 0;
    });

  const isFilteringActive = !!(
    searchQuery.trim() || 
    selectedGenre || 
    selectedYear || 
    selectedStatus || 
    selectedType || 
    selectedLanguage || 
    selectedRating || 
    sortBy !== 'Popularity'
  );

  const suggestedAnime = searchQuery.trim()
    ? allAnime.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
    : [];

  const featuredList = allAnime.filter(a => a.category === 'Featured');
  const trendingList = allAnime.filter(a => a.category === 'Trending');
  const popularList = allAnime.filter(a => a.category === 'Popular');
  const regularList = allAnime.filter(a => a.category === 'Regular' || !a.category);

  // Advanced listing slices for homepage rows
  const topRatedList = [...allAnime]
    .sort((a, b) => parseFloat(b.rating || '0') - parseFloat(a.rating || '0'))
    .slice(0, 10);
    
  const recentlyAddedList = [...allAnime]
    .sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0))
    .slice(0, 10);

  const moviesList = allAnime.filter(a => a.type === 'Movie');

  const continueWatchingEpisodes = allWatchHistory.filter(item => {
    const animeExists = allAnime.some(a => a.id === item.animeId);
    if (!animeExists) return false;
    const ratio = item.duration > 0 ? (item.progress / item.duration) : 0;
    // Show if started, not completed, and less than 95% watched
    return item.progress > 0 && !item.completed && ratio < 0.95;
  });

  // Real-time episode updates for Continue Watching list
  useEffect(() => {
    if (!user || continueWatchingEpisodes.length === 0) {
      setContinueWatchingEpisodesData({});
      return;
    }

    const unsubscribes: (() => void)[] = [];
    const uniqueEpisodeIds = Array.from(new Set(continueWatchingEpisodes.map(e => e.episodeId).filter(Boolean))) as string[];

    uniqueEpisodeIds.forEach((epId) => {
      const epRef = doc(db, 'episodes', epId);
      const unsub = onSnapshot(epRef, (docSnap) => {
        if (docSnap.exists()) {
          const epData = docSnap.data() as Episode;
          setContinueWatchingEpisodesData(prev => ({
            ...prev,
            [epId]: { id: docSnap.id, ...epData }
          }));
        }
      }, (err) => {
        console.warn(`Error listening to episode ${epId}:`, err);
      });
      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [continueWatchingEpisodes.map(e => e.episodeId).join(','), user]);

  // Self-healing thumbnail synchronization for Continue Watching in Firestore
  useEffect(() => {
    if (!user || continueWatchingEpisodes.length === 0) return;

    const syncStaleThumbnails = async () => {
      for (const item of continueWatchingEpisodes) {
        const latestEp = continueWatchingEpisodesData[item.episodeId];
        if (latestEp && latestEp.thumbnailUrl && latestEp.thumbnailUrl !== item.episodeThumbnail) {
          console.log(`Self-healing: Syncing stale watchHistory thumbnail for episode ${item.episodeId} in Firestore`);
          try {
            await syncWatchHistoryThumbnails(item.episodeId, latestEp.thumbnailUrl);
          } catch (e) {
            console.warn("Self-healing sync warning:", e);
          }
        }
      }
    };

    const timer = setTimeout(() => {
      syncStaleThumbnails();
    }, 1500);

    return () => clearTimeout(timer);
  }, [continueWatchingEpisodes, continueWatchingEpisodesData, user]);

  // Active watching companion episodes setup
  const watchCompanionEpisodes = activeDetailsEpisodes.filter(
    ep => ep.seasonId === activePlayEpisode?.seasonId && ep.id !== activePlayEpisode?.id
  );

  const hasNextEpisodeAvailable = activePlayEpisode 
    ? activeDetailsEpisodes.some(ep => ep.seasonId === activePlayEpisode.seasonId && ep.number === activePlayEpisode.number + 1)
    : false;

  const hasPrevEpisodeAvailable = activePlayEpisode 
    ? activeDetailsEpisodes.some(ep => ep.seasonId === activePlayEpisode.seasonId && ep.number === activePlayEpisode.number - 1)
    : false;

  const playNextEpisode = () => {
    if (!activePlayEpisode) return;
    const nextEp = activeDetailsEpisodes.find(
      ep => ep.seasonId === activePlayEpisode.seasonId && ep.number === activePlayEpisode.number + 1
    );
    if (nextEp) {
      navigateToPlayEpisode(nextEp.animeId, nextEp.id);
    }
  };

  const playPrevEpisode = () => {
    if (!activePlayEpisode) return;
    const prevEp = activeDetailsEpisodes.find(
      ep => ep.seasonId === activePlayEpisode.seasonId && ep.number === activePlayEpisode.number - 1
    );
    if (prevEp) {
      navigateToPlayEpisode(prevEp.animeId, prevEp.id);
    }
  };

  // Loader spinner during startup
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b0813] text-zinc-300 gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-t-orange-500 border-purple-950/40 animate-spin"></div>
        <p className="font-extrabold text-sm tracking-widest text-orange-400 uppercase pulse-glow">ANIMESTREAM</p>
      </div>
    );
  }

  // ----------------------------------------------------
  // SCREEN: AUTHENTICATED SYSTEM VIEW
  // ----------------------------------------------------
  if (!user) {
    return (
      <div className="relative min-h-screen bg-[#0b0813] flex flex-col items-center justify-center p-4">
        
        {/* Abstract background blobs for premium aesthetics */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md z-10 transition-all">
          
          {/* Logo Brand Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="flex items-center space-x-2 bg-purple-950/60 p-2.5 rounded-2xl border border-orange-500/35 shadow-neon-orange select-none">
              <span className="w-3.5 h-3.5 rounded-full bg-orange-500 pulse-glow"></span>
              <span className="text-xl font-black text-white tracking-widest uppercase">ANIME<span className="text-orange-500">STREAM</span></span>
            </div>
            <p className="text-xs text-zinc-400 font-bold tracking-wide uppercase mt-2.5">Your Personal Dark Anime Universe</p>
          </div>

          {/* Login/Register/Forgot Panel */}
          <div className="glass-panel-heavy p-8 rounded-2xl border border-purple-950/40 shadow-xl shadow-black/80">
            <h2 className="text-2xl font-black text-center text-white mb-6 uppercase tracking-wider">
              {authMode === 'login' ? 'MEMBERSHIP ACCESS' : authMode === 'register' ? 'CREATE ACCOUNT' : 'RESET PASSWORD'}
            </h2>

            <form onSubmit={handleAuthSubmit} className="space-y-4 font-semibold text-sm">
              {authMode === 'register' && (
                <div>
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Your User Handle</label>
                  <input
                    type="text"
                    required
                    value={authForm.displayName}
                    onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })}
                    placeholder="e.g. TanjiroOtaku"
                    className="w-full bg-zinc-950/80 border border-zinc-800 hover:border-purple-800 focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  placeholder="name@example.com"
                  className="w-full bg-zinc-950/80 border border-zinc-800 hover:border-purple-800 focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors"
                />
              </div>

              {authMode !== 'forgot' && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Secret Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        window.history.pushState(null, '', '/auth');
                        setAuthMode('forgot');
                        setAuthError('');
                        setAuthSuccess('');
                      }}
                      className="text-[10px] text-orange-400 hover:underline hover:text-orange-300 focus:outline-none cursor-pointer font-bold uppercase tracking-wider transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-zinc-950/80 border border-zinc-800 hover:border-purple-800 focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors"
                  />
                </div>
              )}

              {authSuccess && (
                <div className="p-3.5 bg-emerald-950/45 border border-emerald-500/20 rounded-lg text-xs font-bold text-emerald-400">
                  ✔️ {authSuccess}
                </div>
              )}

              {authError && (
                <div className="flex flex-col gap-2">
                  <div className="p-3 bg-red-950/45 border border-red-500/20 rounded-lg text-xs font-bold text-red-400 flex items-start space-x-2">
                    <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                    <span className="flex-1">{authError}</span>
                  </div>
                  {authError.includes('operation-not-allowed') || authError.includes('Sign-in method') || authError.includes('Sign-In is disabled') || authError.includes('authentication is disabled') ? (
                    <div className="p-3.5 bg-purple-950/30 border border-purple-800/30 rounded-lg text-xs text-zinc-300 space-y-2">
                      <p className="font-extrabold text-orange-400 text-[10px] tracking-wider uppercase">🛠️ How to Enable Email/Password Auth:</p>
                      <ol className="list-decimal list-inside space-y-1 text-zinc-400 font-medium">
                        <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline font-bold">console.firebase.google.com</a></li>
                        <li>Open your project <span className="text-purple-300 font-mono">aniverse-630ea</span></li>
                        <li>In the sidebar, click on <span className="font-bold text-zinc-200">Authentication</span></li>
                        <li>Click on the <span className="font-bold text-zinc-200">Sign-in method</span> tab</li>
                        <li>Click <span className="font-bold text-zinc-200">Add new provider</span> and select <span className="font-bold text-zinc-200">Email/Password</span></li>
                        <li>Toggle <span className="text-emerald-400 font-bold">Enable</span> and click <span className="font-bold text-zinc-200">Save</span></li>
                      </ol>
                      <p className="text-[10px] text-zinc-500 font-semibold pt-1 border-t border-purple-950">Once saved, refresh this page and you can sign in instantly!</p>
                    </div>
                  ) : null}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-extrabold tracking-widest py-3 rounded-lg shadow-lg shadow-orange-500/10 active:scale-95 transition-all cursor-pointer mt-2 uppercase"
              >
                {authMode === 'login' ? 'SIGN IN NOW' : authMode === 'register' ? 'REGISTER ENROLLMENT' : 'SEND RESET LINK'}
              </button>
            </form>

            {/* Google Sign-In */}
            {authMode !== 'forgot' && (
              <div className="space-y-2.5 mt-4">
                <button
                  onClick={handleGoogleLogin}
                  className="w-full bg-zinc-900 hover:bg-zinc-850 text-white font-extrabold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2.5 transition-colors border border-zinc-800 cursor-pointer"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-4 h-4" />
                  <span>SIGN IN WITH GOOGLE</span>
                </button>
              </div>
            )}

            <p className="text-center text-xs text-zinc-400 mt-6 font-semibold">
              {authMode === 'forgot' ? (
                <>
                  Remembered your credentials?
                  <button
                    onClick={() => {
                      window.history.pushState(null, '', '/auth');
                      setAuthMode('login');
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                    className="text-orange-400 hover:text-orange-300 ml-1.5 focus:outline-none font-bold underline cursor-pointer"
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  {authMode === 'login' ? "Don't have an ANIMESTREAM ID?" : 'Already a registered Otaku?'}
                  <button
                    onClick={() => {
                      const newMode = authMode === 'login' ? 'register' : 'login';
                      window.history.pushState(null, '', newMode === 'register' ? '/auth/register' : '/auth');
                      setAuthMode(newMode);
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                    className="text-orange-400 hover:text-orange-300 ml-1.5 focus:outline-none font-bold underline cursor-pointer"
                  >
                    {authMode === 'login' ? 'Create Account' : 'Sign In'}
                  </button>
                </>
              )}
            </p>

          </div>

          <p className="text-center text-[10px] text-zinc-600 mt-8 font-extrabold select-none tracking-widest">
            AUTHENTICATED SECURELY VIA FIREBASE SYSTEM API
          </p>
        </div>
      </div>
    );
  }

  const renderCommentsAndReviewsTabbedSection = (viewContext: 'details' | 'watch') => {
    const filteredComments = activeDetailsComments;

    const sortedComments = [...filteredComments].sort((a, b) => {
      if (commentsSortOrder === 'liked') {
        return (b.likesCount || 0) - (a.likesCount || 0);
      }
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      if (commentsSortOrder === 'oldest') {
        return dateA.getTime() - dateB.getTime();
      }
      return dateB.getTime() - dateA.getTime();
    });

    const avgRating = activeDetailsReviews.length > 0
      ? (activeDetailsReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / activeDetailsReviews.length).toFixed(1)
      : null;

    return (
      <div id="comments-reviews-tabbed-pane" className="border-t border-zinc-900 pt-10 mt-10 space-y-8 w-full">
        {/* Tab switcher */}
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3 flex-wrap gap-4">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('comments')}
              className={`pb-3.5 px-2 font-black uppercase text-xs tracking-widest border-b-2 transition-all cursor-pointer relative ${
                activeTab === 'comments'
                  ? 'border-orange-500 text-orange-400 font-extrabold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Comments ({activeDetailsComments.length})
              {activeTab === 'comments' && (
                <motion.div layoutId="activeTabUnderline" className="absolute bottom-[-2px] inset-x-0 h-0.5 bg-orange-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`pb-3.5 px-2 font-black uppercase text-xs tracking-widest border-b-2 transition-all cursor-pointer relative ${
                activeTab === 'reviews'
                  ? 'border-orange-500 text-orange-400 font-extrabold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Reviews ({activeDetailsReviews.length})
              {activeTab === 'reviews' && (
                <motion.div layoutId="activeTabUnderline" className="absolute bottom-[-2px] inset-x-0 h-0.5 bg-orange-500" />
              )}
            </button>
          </div>

          {activeTab === 'comments' && (
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] font-mono font-black">Sort:</span>
              <select
                value={commentsSortOrder}
                onChange={(e) => setCommentsSortOrder(e.target.value as any)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-bold rounded px-2.5 py-1 focus:outline-none hover:text-white cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="liked">Most Liked</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          )}
        </div>

        {/* TAB CONTENT: COMMENTS */}
        {activeTab === 'comments' && (
          <div className="space-y-6 text-left max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-black text-white flex items-center space-x-2.5 uppercase tracking-wide">
                <Tv className="w-5 h-5 text-orange-400" />
                <span>
                  Anime Discussion & Comments
                  {` (${filteredComments.length})`}
                </span>
              </h3>
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2 bg-zinc-950/40 p-3 rounded-xl border border-zinc-900">
              <input
                type="text"
                placeholder="Join discussion... Discuss latest episode arcs, character developments, or plot theories!"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 focus:border-orange-500 text-zinc-200 text-xs font-semibold rounded-lg flex-grow p-3 outline-none transition-all"
              />
              <button
                type="submit"
                className="bg-orange-500 hover:bg-orange-600 text-black font-black px-6 text-xs rounded-lg active:scale-95 transition-all cursor-pointer uppercase shrink-0"
              >
                Publish
              </button>
            </form>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
              {sortedComments.map(com => {
                const isAdminComment = com.userRole === 'admin' || 
                                     com.userId === 'local_admin_uid' || 
                                     com.userId === 'local_admin_uid_2' ||
                                     com.userDisplayName === 'AnimeStream Admin' || 
                                     com.userDisplayName === 'Co-Admin afajs';
                const hasLiked = com.likedBy?.includes(user?.uid);
                const isReplying = activeReplyCommentId === com.id;
                const isCommentOwner = com.userId === user?.uid;
                const isUserAdmin = user?.role === 'admin' || user?.email === 'notxanlos@gmail.com';
                const canModify = isCommentOwner || isUserAdmin;

                return (
                  <div key={com.id} className="p-4 bg-zinc-950/20 border border-zinc-900 rounded-xl text-left space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        {com.userPhotoURL ? (
                          <LazyImage src={com.userPhotoURL} alt="" className="w-8 h-8 rounded-full border border-zinc-800 bg-black shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-black text-white uppercase shrink-0">
                            {com.userDisplayName?.[0]}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center flex-wrap gap-1.5">
                            {isAdminComment ? (
                              <span className="text-red-550 font-extrabold flex items-center gap-1">
                                <span className="text-red-400 text-xs font-black">{com.userDisplayName || com.username}</span>
                                <ShieldCheck className="w-3.5 h-3.5 text-red-500 fill-red-500/15" />
                                <span className="bg-red-500/10 text-red-500 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-red-500/20">
                                  ADMIN
                                </span>
                              </span>
                            ) : (
                              <span className="text-white text-xs font-black">{com.userDisplayName || com.username}</span>
                            )}
                          </div>
                          <span className="text-[9px] text-zinc-550 block font-mono font-bold mt-0.5">
                            {com.createdAt?.toDate 
                              ? com.createdAt.toDate().toLocaleDateString() 
                              : new Date(com.createdAt || Date.now()).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {editingCommentId === com.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 text-zinc-200 text-xs rounded-lg p-3 outline-none"
                          rows={2}
                        />
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleSaveEditComment(com.id)}
                            className="bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-[10px] px-3 py-1.5 rounded-lg transition-all"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCommentId(null)}
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] px-3 py-1.5 rounded-lg transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed font-sans">{com.text}</p>
                    )}

                    <div className="flex items-center space-x-4 pt-1.5 border-t border-zinc-900/55 text-xs text-zinc-450 font-black">
                      <button
                        onClick={() => handleLikeComment(com.id, com.likedBy, com.likesCount)}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg transition-all border ${
                          hasLiked 
                            ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' 
                            : 'bg-zinc-900/40 border-zinc-850 hover:bg-zinc-800/60 hover:text-zinc-200 cursor-pointer'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${hasLiked ? 'fill-orange-400' : ''}`} />
                        <span>{com.likesCount || 0} Likes</span>
                      </button>

                      <button
                        onClick={() => setActiveReplyCommentId(isReplying ? null : com.id)}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          isReplying 
                            ? 'bg-zinc-800 text-white border-zinc-700' 
                            : 'bg-zinc-900/40 border-zinc-850 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        <span>Reply ({com.replies?.length || 0})</span>
                      </button>

                      {canModify && (
                        <>
                          <button
                            onClick={() => handleStartEditComment(com.id, com.text)}
                            className="bg-zinc-900/40 border border-zinc-850 hover:bg-zinc-800 hover:text-zinc-200 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteComment(com.id)}
                            className="bg-red-950/20 border border-red-900/30 hover:bg-red-900/40 text-red-400 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>

                    {com.replies && com.replies.length > 0 && (
                      <div className="pl-4 sm:pl-6 border-l border-zinc-900 mt-3 space-y-3">
                        {com.replies.map((rep: any) => (
                          <div key={rep.id} className="p-3 bg-zinc-900/15 rounded-lg border border-zinc-900 text-left space-y-1.5">
                            <div className="flex items-center space-x-2">
                              {rep.userPhotoURL ? (
                                <LazyImage src={rep.userPhotoURL} alt="" className="w-5 h-5 rounded-full border border-zinc-850 bg-black shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-black text-white uppercase shrink-0">
                                  {rep.userDisplayName?.[0]}
                                </div>
                              )}
                              <span className="text-zinc-200 text-xs font-black">{rep.userDisplayName}</span>
                              <span className="text-[9px] text-zinc-550 font-mono">
                                {new Date(rep.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">{rep.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {isReplying && (
                      <div className="pl-4 border-l border-orange-500/40 mt-3 flex gap-2">
                        <input
                          type="text"
                          placeholder={`Reply to ${com.userDisplayName}...`}
                          value={commentReplyTexts[com.id] || ''}
                          onChange={(e) => setCommentReplyTexts(prev => ({ ...prev, [com.id]: e.target.value }))}
                          className="bg-zinc-900 border border-zinc-850 hover:border-orange-500/50 focus:border-orange-500 text-zinc-200 text-xs rounded-lg flex-grow p-2 outline-none transition-all"
                        />
                        <button
                          onClick={() => handleAddReply(com.id, com.replies)}
                          className="bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-xs px-4 rounded-lg cursor-pointer"
                        >
                          Submit
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {sortedComments.length === 0 && (
                <div className="p-10 border border-dashed border-zinc-900 rounded-xl text-center">
                  <p className="text-zinc-550 text-xs font-bold leading-relaxed">
                    Be the first to start a conversation on this anime!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-6 text-left max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950/40 p-5 rounded-2xl border border-zinc-900">
              <div>
                <h3 className="text-lg font-black text-white flex items-center space-x-2.5 uppercase tracking-wide">
                  <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  <span>Series Ratings & Reviews</span>
                </h3>
                <p className="text-zinc-500 text-xs mt-1 font-bold">Comprehensive user critical reviews list</p>
              </div>

              <div className="flex items-center space-x-3.5 bg-zinc-900 border border-zinc-850 px-4 py-2 rounded-xl">
                <span className="text-yellow-500 font-mono text-xl font-black">
                  {avgRating ? `★ ${avgRating}` : '★ 0.0'}
                </span>
                <div className="h-6 w-px bg-zinc-800"></div>
                <div className="text-left font-mono">
                  <span className="text-xs text-white font-black block leading-none">SCORE</span>
                  <span className="text-[9px] text-zinc-500 font-bold">{activeDetailsReviews.length} Ratings</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleAddReview} className="bg-zinc-950/60 p-5 rounded-2xl border border-zinc-900/80 space-y-4">
              <p className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">Write Your Review</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 text-left">
                  <label className="text-[11px] text-zinc-400 font-bold block">Rating Score: <span className="text-orange-400 font-extrabold">{reviewRating} / 5 Stars</span></label>
                  <div className="flex items-center gap-1 overflow-x-auto pb-1">
                    {[1, 2, 3, 4, 5].map(starNum => (
                      <button
                        type="button"
                        key={starNum}
                        onClick={() => setReviewRating(starNum)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-black border transition-all cursor-pointer ${
                          reviewRating === starNum 
                            ? 'bg-orange-500 text-black border-orange-500 font-extrabold'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-850 hover:bg-zinc-800'
                        }`}
                      >
                        ★ {starNum}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-[11px] text-zinc-400 font-bold block">Review Title (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Masterpiece animation, paced perfectly"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    className="w-full bg-zinc-900 text-zinc-200 border border-zinc-850 hover:border-purple-800 focus:border-orange-500 rounded-lg p-2.5 text-xs outline-none transition-colors font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <textarea
                  placeholder="Write a review detailing your thoughts on story arcs, world building, themes, sound scores or general studio performance..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  className="w-full bg-zinc-900 text-zinc-200 border border-zinc-850 hover:border-purple-800 focus:border-orange-500 rounded-lg p-3.5 text-xs outline-none transition-colors h-24 resize-none font-semibold leading-relaxed"
                />
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-extrabold text-xs tracking-wider py-2.5 rounded-lg transition-transform active:scale-95 cursor-pointer uppercase"
                >
                  Publish Series Review
                </button>
              </div>
            </form>

            <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
              {activeDetailsReviews.map(rev => (
                <div key={rev.id} className="p-4 bg-zinc-950/30 border border-zinc-900 rounded-xl space-y-2.5 text-left">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2.5">
                      {rev.userPhotoURL ? (
                        <LazyImage src={rev.userPhotoURL} alt="" className="w-7 h-7 rounded-full border border-zinc-850 bg-black" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                          {rev.userDisplayName?.[0]}
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-white font-black block">{rev.userDisplayName}</span>
                        <span className="text-[9px] text-zinc-550 block font-mono">
                          {rev.createdAt?.toDate 
                            ? rev.createdAt.toDate().toLocaleDateString() 
                            : new Date(rev.createdAt || Date.now()).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-1.5 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-850">
                      <span className="text-yellow-500 text-xs">
                        {"★".repeat(rev.rating || 5)}{"☆".repeat(5 - (rev.rating || 5))}
                      </span>
                      <span className="text-zinc-400 font-mono text-[10px] font-bold">({rev.rating || 5}/5)</span>
                    </div>
                  </div>

                  {rev.title && (
                    <h4 className="text-xs sm:text-sm font-black text-white">{rev.title}</h4>
                  )}
                  <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed font-semibold">{rev.text}</p>
                </div>
              ))}

              {activeDetailsReviews.length === 0 && (
                <div className="p-10 border border-dashed border-zinc-900 rounded-xl text-center">
                  <p className="text-zinc-550 text-xs font-bold leading-relaxed">
                    Be the first to leave a detailed review for this series!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ----------------------------------------------------
  // MAIN CORE SYSTEM SHELL FOR AUTHENTICATED USERS
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0b0813] flex flex-col">
      
      {/* 1. Header Toolbar navigation */}
      <header className="sticky top-0 z-[80] bg-[#0b0813]/95 backdrop-blur-md border-b border-purple-950/25 select-none py-3.5 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            {/* Logo brand */}
            <div className="flex items-center space-x-2">
              <div 
                onClick={navigateToHome}
                className="flex items-center space-x-2 p-1 rounded cursor-pointer group"
              >
                <span className="w-3 h-3 rounded-full bg-orange-500 pulse-glow group-hover:scale-110 transition-transform"></span>
                <span className="text-base sm:text-lg md:text-xl font-black text-white tracking-widest uppercase transition-colors group-hover:text-orange-400">
                  ANIME<span className="text-orange-500 group-hover:text-purple-400 transition-colors">STREAM</span>
                </span>
              </div>
            </div>

            {/* Mobile Actions Menu - visible only on mobile screens < sm */}
            <div className="flex sm:hidden items-center space-x-2">
              <button
                onClick={navigateToHome}
                className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center ${
                  activeView === 'home' || activeView === 'details' || activeView === 'watch'
                    ? 'text-orange-400' 
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Browse"
              >
                <Compass className="w-4.5 h-4.5" />
              </button>

              <button
                onClick={() => setActiveView('profile')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center ${
                  activeView === 'profile' ? 'text-orange-400' : 'text-zinc-400 hover:text-white'
                }`}
                title="My Profile"
              >
                <UserIcon className="w-4.5 h-4.5" />
              </button>

              {user.role === 'admin' && (
                <button
                  onClick={() => setActiveView('admin')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center ${
                    activeView === 'admin' ? 'text-orange-400' : 'text-purple-400'
                  }`}
                  title="Admin Terminal"
                >
                  <Settings className="w-4.5 h-4.5" />
                </button>
              )}

              <img
                src={user.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.email}`}
                alt=""
                onClick={() => setActiveView('profile')}
                className="w-6 h-6 rounded-full border border-orange-500/55 object-cover cursor-pointer bg-black ml-1"
              />
            </div>
          </div>

          {/* Centered/Easy Access Search Input (Sticky Top for both desktop and mobile) */}
          <div className="w-full sm:flex-1 sm:max-w-md relative group">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-orange-400 transition-colors" />
            <input
              type="text"
              placeholder="Search anime show, genre, plot..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
              className="w-full bg-zinc-950/70 hover:bg-zinc-900 focus:bg-zinc-900 border border-zinc-850 hover:border-purple-900/60 focus:border-orange-500 rounded-full py-2.5 pl-10 pr-10 text-xs font-semibold text-zinc-150 outline-none transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="text-zinc-500 hover:text-white absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Autocomplete Suggestions Box */}
            <AnimatePresence>
              {isSearchFocused && searchQuery.trim().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-0 right-0 mt-2 bg-[#0e0b17] border border-zinc-800/80 rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-zinc-900 text-left"
                >
                  {suggestedAnime.length === 0 ? (
                    <div className="p-4 text-xs text-zinc-500 text-center">No matching anime found</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto no-scrollbar">
                      {suggestedAnime.map((anime) => (
                        <div
                          key={anime.id}
                          onMouseDown={() => {
                            navigateToAnimeDetails(anime.id);
                            setSearchQuery('');
                            setIsSearchFocused(false);
                          }}
                          className="flex items-center gap-3 p-2.5 hover:bg-zinc-900/60 cursor-pointer transition-colors text-left animate-fade-in"
                        >
                          <img
                            src={anime.thumbnailUrl}
                            alt=""
                            className="w-9 h-12 object-cover rounded-md bg-zinc-850 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-grow min-w-0">
                            <h4 className="text-xs font-extrabold text-white truncate hover:text-orange-400 transition-colors">
                              {anime.title}
                            </h4>
                            <p className="text-[10px] text-zinc-400 truncate">
                              {anime.genres?.join(', ')}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] font-mono text-orange-400 font-bold">⭐ {anime.rating}</span>
                              <span className="text-[9px] font-mono text-zinc-500">• {anime.releaseYear}</span>
                              <span className="text-[8px] px-1 bg-zinc-800 text-zinc-400 rounded font-bold uppercase tracking-wider">
                                {anime.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Desktop Menu Action selectors - hidden on mobile/tablet < sm */}
          <div className="hidden sm:flex items-center space-x-1.5 md:space-x-3 text-xs font-bold">
            <button
              onClick={navigateToHome}
              className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                activeView === 'home' || activeView === 'details' || activeView === 'watch'
                  ? 'text-orange-400 font-extrabold' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span className="hidden md:inline">BROWSE</span>
            </button>

            <button
              onClick={() => setActiveView('profile')}
              className={`px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                activeView === 'profile' ? 'text-orange-400 font-extrabold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span className="hidden md:inline">MY PROFILE</span>
            </button>

            {user.role === 'admin' && (
              <button
                onClick={() => setActiveView('admin')}
                className={`bg-purple-950/80 hover:bg-purple-900 text-purple-300 font-black px-3 py-2 rounded-lg border border-purple-800/40 cursor-pointer flex items-center space-x-1 ${
                  activeView === 'admin' ? 'border-orange-500 shadow-neon-orange text-orange-400' : ''
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden lg:inline">ADMIN TERMINAL</span>
              </button>
            )}

            <div className="flex items-center space-x-2 pl-2 border-l border-zinc-900">
              <img
                src={user.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.email}`}
                alt=""
                onClick={() => setActiveView('profile')}
                className="w-7 h-7 rounded-full border border-orange-500/55 object-cover cursor-pointer hover:scale-105 transition-all bg-black"
                title="Click to view space profile"
              />
            </div>
          </div>

        </div>
      </header>

      {/* 2. Main content router */}
      <main className="flex-grow">
        
        {/* HOMEPAGE VIEW SCREEN */}
        {activeView === 'home' && (
          <React.Fragment>
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-10">

              {/* Unified Search & Filter Dashboard */}
              <div className="space-y-4">
                {/* Desktop Filter Dashboard Layout */}
                <div className="hidden md:flex items-center flex-wrap gap-4 bg-zinc-950/45 p-4 rounded-2xl border border-zinc-900/85 shadow-inner">
                  {/* Genre Selector */}
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 pl-1 font-mono">Genre</label>
                    <select
                      value={selectedGenre}
                      onChange={(e) => setSelectedGenre(e.target.value)}
                      className="bg-[#0e0b17] border border-zinc-850 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none cursor-pointer transition-colors"
                    >
                      <option value="">All Genres</option>
                      {['Action', 'Adventure', 'Fantasy', 'Sci-Fi', 'Drama', 'Comedy', 'Slice of Life', 'Mystery', 'Romance', 'Thriller', 'Demons', 'Mecha', 'Sports'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Release Year Selector */}
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 pl-1 font-mono">Year</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="bg-[#0e0b17] border border-zinc-850 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none cursor-pointer transition-colors"
                    >
                      <option value="">All Years</option>
                      {['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status Selector */}
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 pl-1 font-mono">Status</label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="bg-[#0e0b17] border border-zinc-850 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none cursor-pointer transition-colors"
                    >
                      <option value="">All Statuses</option>
                      {['Ongoing', 'Completed', 'Upcoming'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Type Selector */}
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 pl-1 font-mono">Type</label>
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="bg-[#0e0b17] border border-zinc-850 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none cursor-pointer transition-colors"
                    >
                      <option value="">All Types</option>
                      {['Series', 'Movie', 'OVA', 'ONA', 'Special'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Language Selector */}
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 pl-1 font-mono">Language</label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="bg-[#0e0b17] border border-zinc-850 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none cursor-pointer transition-colors"
                    >
                      <option value="">All Languages</option>
                      {['Sub', 'Dub'].map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rating Selector */}
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 pl-1 font-mono">Rating Score</label>
                    <select
                      value={selectedRating}
                      onChange={(e) => setSelectedRating(e.target.value)}
                      className="bg-[#0e0b17] border border-zinc-850 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none cursor-pointer transition-colors"
                    >
                      <option value="">All Ratings</option>
                      <option value="9.0">⭐ 9.0+ Excellent</option>
                      <option value="8.0">⭐ 8.0+ Great</option>
                      <option value="7.0">⭐ 7.0+ Good</option>
                    </select>
                  </div>

                  {/* Sort Order Selector */}
                  <div className="flex flex-col text-left">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 pl-1 font-mono">Sort By</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="bg-[#0e0b17] border border-zinc-850 hover:border-orange-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-200 outline-none cursor-pointer transition-colors"
                    >
                      {['Popularity', 'Recently Added', 'Recently Updated', 'A-Z'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>

                  {/* Reset Filters Option */}
                  {isFilteringActive && (
                    <button
                      onClick={() => {
                        setSelectedGenre('');
                        setSelectedYear('');
                        setSelectedStatus('');
                        setSelectedType('');
                        setSelectedLanguage('');
                        setSelectedRating('');
                        setSortBy('Popularity');
                        setSearchQuery('');
                      }}
                      className="self-end ml-auto bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white px-4 py-1.5 rounded-lg text-xs font-black tracking-wider transition-colors cursor-pointer select-none"
                    >
                      RESET FILTERS
                    </button>
                  )}
                </div>

                {/* Mobile Filter Entry Button */}
                <div className="flex md:hidden items-center justify-between gap-3 bg-zinc-950/45 p-3.5 rounded-xl border border-zinc-900/85 w-full">
                  <div className="flex items-center space-x-2">
                    <Compass className="w-4 h-4 text-orange-500 animate-pulse" />
                    <span className="text-xs font-black text-zinc-300 uppercase tracking-widest font-mono">Anime Catalog</span>
                    {isFilteringActive && (
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                    )}
                  </div>
                  <button
                    onClick={() => setIsMobileFilterOpen(true)}
                    className="bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-xs px-4 py-2 rounded-lg transition-transform active:scale-95 cursor-pointer flex items-center space-x-1.5 select-none"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>FILTERS</span>
                  </button>
                </div>
              </div>

              {/* Mobile Bottom Drawer/Sheet Filters UI */}
              <AnimatePresence>
                {isMobileFilterOpen && (
                  <div className="fixed inset-0 z-50 overflow-hidden md:hidden">
                    {/* Backdrop blur */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.55 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsMobileFilterOpen(false)}
                      className="absolute inset-0 bg-black backdrop-blur-sm"
                    />

                    {/* Filter Content Sheet */}
                    <motion.div
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%" }}
                      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                      className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-[#0b0813] border-t border-purple-950/80 rounded-t-3xl flex flex-col shadow-2xl text-left"
                    >
                      {/* Header Row */}
                      <div className="p-5 border-b border-zinc-900 flex items-center justify-between shrink-0">
                        <div className="flex items-center space-x-2">
                          <SlidersHorizontal className="w-4 h-4 text-orange-500" />
                          <h3 className="text-sm font-black text-white uppercase tracking-widest font-mono">Filter & Sort Anime</h3>
                        </div>
                        <button
                          onClick={() => setIsMobileFilterOpen(false)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Scrollable Filters Body */}
                      <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar pb-24">
                        {/* Sort Order */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">Sort Results By</label>
                          <div className="grid grid-cols-2 gap-2">
                            {['Popularity', 'Recently Added', 'Recently Updated', 'A-Z'].map(o => (
                              <button
                                key={o}
                                onClick={() => setSortBy(o)}
                                className={`px-3 py-2 text-xs font-bold rounded-lg border text-center transition-all ${
                                  sortBy === o
                                    ? 'bg-orange-500 text-black border-orange-500 font-black'
                                    : 'bg-zinc-900/60 border-zinc-850 text-zinc-400'
                                }`}
                              >
                                {o}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Genres */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">Filter by Genre</label>
                          <div className="flex flex-wrap gap-1.5">
                            {['All', 'Action', 'Adventure', 'Fantasy', 'Sci-Fi', 'Drama', 'Comedy', 'Slice of Life', 'Mystery', 'Romance', 'Thriller', 'Demons', 'Mecha', 'Sports'].map(g => {
                              const isSelected = (g === 'All' && !selectedGenre) || (selectedGenre === g);
                              return (
                                <button
                                  key={g}
                                  onClick={() => setSelectedGenre(g === 'All' ? '' : g)}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all ${
                                    isSelected
                                      ? 'bg-orange-500 text-black border-orange-500 font-black'
                                      : 'bg-zinc-900/40 border-zinc-850 text-zinc-400'
                                  }`}
                                >
                                  {g}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Grid parameters for Year, Status, Type, Language, Rating */}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          {/* Status */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">Status</label>
                            <select
                              value={selectedStatus}
                              onChange={(e) => setSelectedStatus(e.target.value)}
                              className="w-full bg-[#110e1c] border border-zinc-850 rounded-lg px-3 py-2 text-xs font-bold text-zinc-200 outline-none"
                            >
                              <option value="">All Statuses</option>
                              {['Ongoing', 'Completed', 'Upcoming'].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          {/* Release Year */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">Release Year</label>
                            <select
                              value={selectedYear}
                              onChange={(e) => setSelectedYear(e.target.value)}
                              className="w-full bg-[#110e1c] border border-zinc-850 rounded-lg px-3 py-2 text-xs font-bold text-zinc-200 outline-none"
                            >
                              <option value="">All Years</option>
                              {['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'].map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </div>

                          {/* Type */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">Type</label>
                            <select
                              value={selectedType}
                              onChange={(e) => setSelectedType(e.target.value)}
                              className="w-full bg-[#110e1c] border border-zinc-850 rounded-lg px-3 py-2 text-xs font-bold text-zinc-200 outline-none"
                            >
                              <option value="">All Types</option>
                              {['Series', 'Movie', 'OVA', 'ONA', 'Special'].map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>

                          {/* Language */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">Language</label>
                            <select
                              value={selectedLanguage}
                              onChange={(e) => setSelectedLanguage(e.target.value)}
                              className="w-full bg-[#110e1c] border border-zinc-850 rounded-lg px-3 py-2 text-xs font-bold text-zinc-200 outline-none"
                            >
                              <option value="">All Languages</option>
                              {['Sub', 'Dub'].map(l => (
                                <option key={l} value={l}>{l}</option>
                              ))}
                            </select>
                          </div>

                          {/* Rating */}
                          <div className="space-y-1.5 col-span-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest font-mono">Rating Score Filter</label>
                            <select
                              value={selectedRating}
                              onChange={(e) => setSelectedRating(e.target.value)}
                              className="w-full bg-[#110e1c] border border-zinc-850 rounded-lg px-3 py-2 text-xs font-bold text-zinc-200 outline-none"
                            >
                              <option value="">All Scores</option>
                              <option value="9.0">⭐ 9.0+ Excellent</option>
                              <option value="8.0">⭐ 8.0+ Great</option>
                              <option value="7.0">⭐ 7.0+ Good</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Footer Floating Row */}
                      <div className="absolute inset-x-0 bottom-0 bg-[#0d0a17] border-t border-zinc-900 p-4 flex gap-3 shrink-0">
                        {isFilteringActive && (
                          <button
                            onClick={() => {
                              setSelectedGenre('');
                              setSelectedYear('');
                              setSelectedStatus('');
                              setSelectedType('');
                              setSelectedLanguage('');
                              setSelectedRating('');
                              setSortBy('Popularity');
                              setSearchQuery('');
                            }}
                            className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-extrabold text-xs py-3 rounded-xl transition-all cursor-pointer text-center"
                          >
                            RESET ALL
                          </button>
                        )}
                        <button
                          onClick={() => setIsMobileFilterOpen(false)}
                          className="flex-2 bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-xs py-3 rounded-xl transition-all cursor-pointer text-center font-mono tracking-wide uppercase"
                        >
                          Show {filteredAnimeList.length} Results
                        </button>
                      </div>

                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Featured Anime Cinematic Hero slider */}
              {featuredList.length > 0 && !isFilteringActive && (
                <HeroBanner
                  featuredAnime={featuredList}
                  onPlayClick={(id) => {
                    navigateToAnimeDetails(id);
                  }}
                  onInfoClick={navigateToAnimeDetails}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                />
              )}

            {/* Continue Watching Section */}
            {!isFilteringActive && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                    <Clock className="w-5 h-5 text-orange-500 animate-pulse" />
                    <span className="uppercase tracking-widest">CONTINUE WATCHING</span>
                  </h2>
                  
                  {/* Carousel navigation buttons */}
                  {continueWatchingEpisodes.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => scroll('left')}
                        className="p-2 rounded-lg bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 hover:border-orange-500/50 text-zinc-400 hover:text-white transition-all active:scale-95 cursor-pointer"
                        title="Scroll Left"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => scroll('right')}
                        className="p-2 rounded-lg bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-900 hover:border-orange-500/50 text-zinc-400 hover:text-white transition-all active:scale-95 cursor-pointer"
                        title="Scroll Right"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {isWatchHistoryLoading ? (
                  /* SKELETON LOADING STATE */
                  <div className="flex gap-6 pb-4 pt-1 overflow-x-auto no-scrollbar">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="shrink-0 w-[280px] sm:w-[320px] animate-pulse">
                        <div className="bg-zinc-950/40 border border-zinc-900/60 rounded-xl overflow-hidden flex flex-col h-[220px]">
                          <div className="aspect-video w-full bg-zinc-900" />
                          <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                            <div className="space-y-2">
                              <div className="h-2 bg-zinc-800 rounded w-1/3" />
                              <div className="h-3 bg-zinc-800 rounded w-3/4" />
                            </div>
                            <div className="h-3 bg-zinc-800 rounded w-1/2 mt-auto" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : continueWatchingEpisodes.length > 0 ? (
                  /* Horizontal scrolling carousel snap container */
                  <div 
                    ref={carouselRef}
                    className="flex overflow-x-auto gap-6 pb-4 pt-1 snap-x snap-mandatory scroll-smooth no-scrollbar"
                  >
                    {continueWatchingEpisodes.map((item) => {
                      const percentWatched = item.duration > 0 ? Math.min(100, Math.floor((item.progress / item.duration) * 100)) : 0;
                      
                      // Get the absolute latest real-time thumbnail from our episodes subscription
                      const latestEp = continueWatchingEpisodesData[item.episodeId];
                      const latestThumb = latestEp?.thumbnailUrl || item.episodeThumbnail || item.animeThumbnail;
                      
                      // Invalidate cached remote image references using an updated timestamp or current time
                      let cacheBustUrl = latestThumb;
                      if (cacheBustUrl && !cacheBustUrl.startsWith('data:')) {
                        const cb = latestEp?.updatedAt 
                          ? (typeof latestEp.updatedAt.toDate === 'function' ? latestEp.updatedAt.toDate().getTime() : new Date(latestEp.updatedAt).getTime())
                          : Date.now();
                        cacheBustUrl = cacheBustUrl.includes('?') ? `${cacheBustUrl}&t=${cb}` : `${cacheBustUrl}?t=${cb}`;
                      }

                      return (
                        <div 
                          key={item.id} 
                          className="snap-start shrink-0 w-[280px] sm:w-[320px]"
                        >
                          <div 
                            onClick={() => navigateToPlayEpisode(item.animeId, item.episodeId)}
                            className="relative group bg-zinc-950/80 border border-zinc-900/60 rounded-xl overflow-hidden hover:border-orange-500/70 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-500/5 active:scale-[0.98] transition-all duration-300 flex flex-col justify-between h-full cursor-pointer select-none"
                          >
                            {/* Aspect-video Thumbnail Container */}
                            <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
                              <LazyImage
                                src={cacheBustUrl}
                                alt={item.episodeTitle}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                referrerPolicy="no-referrer"
                              />
                              
                              {/* Top-Left Isolated Remove Button with stopPropagation */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setWatchHistoryToRemoveId(item.id);
                                }}
                                className="absolute top-2 left-2 z-20 p-2 bg-black/75 hover:bg-red-600 text-zinc-400 hover:text-white rounded-lg shadow-md hover:scale-110 active:scale-90 transition-all flex items-center justify-center border border-zinc-800 hover:border-red-600 cursor-pointer opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
                                title="Remove from Continue Watching"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Center Play Button Overlay on Hover */}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                                <div className="p-3 bg-orange-500 text-black rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300 flex items-center justify-center">
                                  <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
                                </div>
                              </div>

                              {/* Percentage & Remaining time tag */}
                              <span className="absolute top-2 right-2 bg-black/80 backdrop-blur-md text-[9px] font-black text-zinc-300 px-1.5 py-0.5 rounded flex items-center space-x-1 border border-zinc-850/80">
                                <span>{percentWatched}% watched</span>
                                <span>•</span>
                                <span>{formatRemainingTime(item.progress, item.duration)}</span>
                              </span>

                              {/* Progress Bar Overlay at bottom of thumbnail */}
                              <div className="absolute bottom-0 inset-x-0 h-1.5 bg-zinc-900">
                                <div 
                                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500" 
                                  style={{ width: `${percentWatched}%` }}
                                />
                              </div>
                            </div>

                            {/* Card Info Details */}
                            <div className="p-3.5 text-left flex-1 flex flex-col justify-between">
                              <div className="space-y-1">
                                <p className="text-zinc-500 text-[9px] uppercase font-bold tracking-widest truncate font-mono">
                                  {item.animeTitle}
                                </p>
                                <h3 className="text-white text-xs font-bold line-clamp-1 group-hover:text-orange-400 transition-colors">
                                  S{item.seasonNumber} EP{item.episodeNumber}: {item.episodeTitle}
                                </h3>
                              </div>
                              
                              <div className="flex items-center justify-between text-[9px] text-zinc-400 mt-3 pt-2.5 border-t border-zinc-900/80 font-bold font-mono">
                                <span className="flex items-center space-x-1.5 text-zinc-500">
                                  <Clock className="w-3.5 h-3.5 text-orange-500/75" />
                                  <span>{formatLastWatched(item.updatedAt)}</span>
                                </span>
                                <div className="text-orange-400 group-hover:text-orange-300 font-black uppercase tracking-wider flex items-center space-x-1">
                                  <span>RESUME</span>
                                  <ArrowRight className="w-2.5 h-2.5 stroke-[2.5] group-hover:translate-x-1 transition-transform" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* EMPTY STATE */
                  <div className="p-8 border border-dashed border-zinc-900 rounded-xl text-center bg-zinc-950/20 backdrop-blur-sm max-w-2xl mx-auto md:mx-0">
                    <p className="text-zinc-400 text-sm font-black uppercase tracking-wider font-mono">Ready to start a new adventure?</p>
                    <p className="text-zinc-500 text-xs mt-1.5 font-semibold">Explore our vast catalog below and start watching your favorite anime series now!</p>
                  </div>
                )}
              </div>
            )}

            {/* Trending Carousel */}
            {trendingList.length > 0 && !isFilteringActive && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <TrendingUp className="w-5 h-5 text-orange-500" />
                  <span className="uppercase tracking-widest">TRENDING SERIES HIT</span>
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {trendingList.map((anime) => (
                    <AnimeCard
                      key={anime.id}
                      anime={anime}
                      onClick={navigateToAnimeDetails}
                      onPlayClick={navigateToAnimeDetails}
                      isFavorite={favorites.includes(anime.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Popular Section */}
            {popularList.length > 0 && !isFilteringActive && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <Award className="w-5 h-5 text-purple-400" />
                  <span className="uppercase tracking-widest">POPULAR ANIME CORES</span>
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {popularList.map((anime) => (
                    <AnimeCard
                      key={anime.id}
                      anime={anime}
                      onClick={navigateToAnimeDetails}
                      onPlayClick={navigateToAnimeDetails}
                      isFavorite={favorites.includes(anime.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Latest Episodes Section */}
            {!isFilteringActive && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <PlayCircle className="w-5 h-5 text-orange-500 animate-pulse" />
                  <span className="uppercase tracking-widest">LATEST RELEASED EPISODES</span>
                </h2>
                {latestEpisodes.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {latestEpisodes.map((ep) => {
                      const parentAnime = allAnime.find(a => a.id === ep.animeId);
                      return (
                        <div
                          key={ep.id}
                          onClick={() => {
                            navigateToPlayEpisode(ep.animeId, ep.id);
                          }}
                          className="group bg-zinc-950/80 border border-zinc-900/60 rounded-xl overflow-hidden cursor-pointer hover:border-orange-500/70 transition-all duration-300 transform hover:-translate-y-1"
                        >
                          <div className="relative aspect-video">
                            <LazyImage src={ep.thumbnailUrl || parentAnime?.thumbnailUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-8 h-8 text-white fill-white" />
                            </div>
                            <span className="absolute bottom-2 right-2 bg-black/80 text-[9px] text-zinc-300 px-1.5 py-0.5 rounded font-mono font-bold">
                              EP {ep.number}
                            </span>
                          </div>
                          <div className="p-3 text-left">
                            <p className="text-zinc-500 text-[9px] uppercase font-bold tracking-wider truncate mb-1">
                              {parentAnime?.title || 'AnimeStream Release'}
                            </p>
                            <p className="text-white text-xs font-bold line-clamp-1 group-hover:text-orange-400 transition-colors">
                              {ep.title}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-10 border border-dashed border-zinc-900 rounded-xl text-center bg-zinc-950/20">
                    <p className="text-zinc-500 text-sm font-semibold">No Episodes Available</p>
                  </div>
                )}
              </div>
            )}

            {/* Top Rated Section */}
            {topRatedList.length > 0 && !isFilteringActive && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  <span className="uppercase tracking-widest">TOP RATED CORES</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {topRatedList.map((anime) => (
                    <AnimeCard
                      key={anime.id}
                      anime={anime}
                      onClick={navigateToAnimeDetails}
                      onPlayClick={navigateToAnimeDetails}
                      isFavorite={favorites.includes(anime.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recently Added Section */}
            {recentlyAddedList.length > 0 && !isFilteringActive && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <PlusCircle className="w-5 h-5 text-green-400" />
                  <span className="uppercase tracking-widest">RECENTLY ADDED CORES</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {recentlyAddedList.map((anime) => (
                    <AnimeCard
                      key={anime.id}
                      anime={anime}
                      onClick={navigateToAnimeDetails}
                      onPlayClick={navigateToAnimeDetails}
                      isFavorite={favorites.includes(anime.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Movies Section */}
            {moviesList.length > 0 && !isFilteringActive && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <Film className="w-5 h-5 text-indigo-400" />
                  <span className="uppercase tracking-widest">ANIME CINEMATIC MOVIES</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {moviesList.map((anime) => (
                    <AnimeCard
                      key={anime.id}
                      anime={anime}
                      onClick={navigateToAnimeDetails}
                      onPlayClick={navigateToAnimeDetails}
                      isFavorite={favorites.includes(anime.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Episode Broadcast Weekly Schedule */}
            {homeSchedule.length > 0 && !isFilteringActive && (
              <div className="space-y-4 bg-zinc-950/60 p-6 rounded-2xl border border-zinc-900/60">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  <span className="uppercase tracking-widest">WEEKLY BROADCAST CALENDAR</span>
                </h2>
                <p className="text-xs text-zinc-500 font-semibold max-w-2xl leading-relaxed mt-1">
                  Keep tabs on upcoming episodes release dates. Broadcasters upload on set days throughout the week of broadcasting. (Displaying UTC clock times).
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4.5 pt-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const dayScheds = homeSchedule.filter(s => s.releaseDay === day);
                    return (
                      <div key={day} className="p-3 bg-zinc-900/70 border border-zinc-850/60 rounded-xl space-y-2.5">
                        <p className="text-[10px] font-black uppercase text-emerald-400 tracking-wider border-b border-zinc-800 pb-1.5 text-center">{day}</p>
                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                          {dayScheds.map(sch => (
                            <div
                              key={sch.id}
                              onClick={() => navigateToAnimeDetails(sch.animeId)}
                              className="p-2 bg-black/40 hover:bg-black/80 rounded border border-zinc-950 transition-colors cursor-pointer text-left text-[10px]"
                            >
                              <p className="text-white line-clamp-1 font-bold">{sch.animeTitle}</p>
                              <p className="text-orange-400 mt-1 flex items-center justify-between font-black">
                                <span>Ep {sch.episodeNumber}</span>
                                <span className="font-mono text-[9px] text-zinc-400 font-normal">{sch.time}</span>
                              </p>
                            </div>
                          ))}
                          {dayScheds.length === 0 && (
                            <p className="text-[9px] text-zinc-600 font-bold py-4 text-center">No releases</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Editorial Anime Industry news */}
            {homeNews.length > 0 && !isFilteringActive && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                  <Tv className="w-5 h-5 text-indigo-400 animate-pulse" />
                  <span className="uppercase tracking-widest">ANIMESTREAM EDITOR NEWS STORIES</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {homeNews.map((news) => (
                    <div 
                      key={news.id}
                      className="p-4 bg-zinc-950/75 border border-zinc-900 rounded-xl flex gap-4 text-left items-start cursor-pointer hover:border-indigo-500/50 transition-colors"
                      onClick={() => {
                        alert(`--- ${news.title} ---\n\n${news.content}\n\nPublished by: ${news.source}`);
                      }}
                    >
                      <LazyImage src={news.imageUrl} alt="" className="w-20 h-20 object-cover rounded-lg border border-zinc-850" referrerPolicy="no-referrer" />
                      <div className="space-y-1.5 justify-between flex flex-col h-20 flex-grow">
                        <div>
                          <h4 className="text-white text-xs font-black line-clamp-1 hover:text-indigo-400 transition-colors">{news.title}</h4>
                          <p className="text-zinc-400 text-[10px] font-semibold mt-1 leading-relaxed line-clamp-2">{news.content}</p>
                        </div>
                        <p className="text-[9px] text-zinc-500 font-bold">Source: <span className="text-indigo-400 font-black">{news.source}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regular List (Browse All config) */}
            <div className="space-y-4 pt-4">
              <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                <Film className="w-5 h-5 text-orange-500" />
                <span className="uppercase tracking-widest">
                  {isFilteringActive 
                    ? `FILTERED SEARCH RESULTS (${filteredAnimeList.length})` 
                    : "CATALOG ARCHIVES"}
                </span>
              </h2>

              {filteredAnimeList.length === 0 ? (
                <div className="glass-panel p-16 text-center text-zinc-500 rounded-2xl">
                  No anime configuration matches current selection criteria. Expand search or add elements in the Admin panel!
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {filteredAnimeList.map((anime) => (
                    <AnimeCard
                      key={anime.id}
                      anime={anime}
                      onClick={navigateToAnimeDetails}
                      onPlayClick={navigateToAnimeDetails}
                      isFavorite={favorites.includes(anime.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </React.Fragment>
      )}

        {/* DETAILED SPECIFIC VIEW: SHOW SPEC DETAILS, EPISODES SELECTION */}
        {activeView === 'details' && activeDetailsAnime && (
          <div className="animate-fade-in">
            {/* Top Back banner layout */}
            <div className="relative w-full h-[38vh] min-h-[300px] overflow-hidden select-none">
              <img
                src={activeDetailsAnime.bannerUrl}
                alt=""
                className="w-full h-full object-cover object-center"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0813] to-transparent"></div>
              <div className="absolute inset-x-0 bottom-0 py-6 px-4 md:px-8 max-w-7xl mx-auto z-30 flex items-end">
                <button
                  onClick={navigateToHome}
                  className="bg-black/60 hover:bg-black text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 backdrop-blur-md transition-all active:scale-95 text-xs font-semibold cursor-pointer"
                >
                  ← HOME CATALOG
                </button>
              </div>
            </div>

            {/* Middle Grid Spec Details block */}
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start text-left">
                
                {/* Visual Cover card column */}
                <div className="md:col-span-3 -mt-32 md:-mt-48 relative z-20 space-y-4 text-center md:text-left">
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border-4 border-purple-950/80 max-w-[240px] mx-auto bg-zinc-900 shadow-purple-500/10">
                    <img
                      src={activeDetailsAnime.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
                    <span className="bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black px-3 py-1 rounded font-mono">
                      ⭐ {activeDetailsAnime.rating} GLOBAL SCORE
                    </span>
                    <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-bold px-3 py-1 rounded">
                      🚀 {activeDetailsAnime.releaseYear} YEAR
                    </span>
                  </div>

                  {/* Playlisting favorites toggle */}
                  <div className="pt-2">
                    <button
                      onClick={() => handleToggleFavorite(activeDetailsAnime.id)}
                      className={`w-full font-bold text-xs tracking-wider py-3.5 rounded-xl border flex items-center justify-center space-x-2 transition-all active:scale-95 cursor-pointer ${
                        favorites.includes(activeDetailsAnime.id)
                          ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                          : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-white'
                      }`}
                    >
                      {favorites.includes(activeDetailsAnime.id) ? (
                        <>
                          <Check className="w-4 h-4 text-orange-500" />
                          <span>REMOVE FAVORITES ❤️</span>
                        </>
                      ) : (
                        <>
                          <Heart className="w-4 h-4 text-zinc-300" />
                          <span>ADD FAVORITES ❤️</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Watchlist toggle selection */}
                  <div className="pt-1">
                    <button
                      onClick={() => handleToggleWatchlist(activeDetailsAnime.id)}
                      className={`w-full font-bold text-xs tracking-wider py-3.5 rounded-xl border flex items-center justify-center space-x-2 transition-all active:scale-95 cursor-pointer ${
                        watchlistIds.includes(activeDetailsAnime.id)
                          ? 'border-green-500 bg-green-500/10 text-green-400'
                          : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-white'
                      }`}
                    >
                      {watchlistIds.includes(activeDetailsAnime.id) ? (
                        <>
                          <Check className="w-4 h-4 text-green-500" />
                          <span>IN WATCHLIST 📚</span>
                        </>
                      ) : (
                        <>
                          <Grid className="w-4 h-4 text-green-400" />
                          <span>ADD TO WATCHLIST 📚</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Broadcast alerts notifications trigger */}
                  <div className="pt-1">
                    <button
                      onClick={async () => {
                        try {
                          await addDoc(collection(db, 'notifications'), {
                            userId: user?.uid,
                            animeId: activeDetailsAnime.id,
                            title: `🔔 Subscribed to ${activeDetailsAnime.title}`,
                            message: `You will now receive automatic notifications whenever new episodes or reviews are posted for ${activeDetailsAnime.title}!`,
                            createdAt: new Date()
                          });
                          alert(`Subscription Successful!\n\nYou will receive a notification in your Profile Alerts when new seasons or episodes of ${activeDetailsAnime.title} drop.`);
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="w-full font-bold text-xs tracking-wider py-3.5 rounded-xl border border-zinc-805 bg-zinc-900/80 hover:bg-zinc-850 text-white flex items-center justify-center space-x-2 transition-all active:scale-95 cursor-pointer"
                    >
                      <Tv className="w-4 h-4 text-teal-400 animate-pulse" />
                      <span>SUBSCRIBE NOTIFS 🔔</span>
                    </button>
                  </div>
                </div>

                {/* Details Synopsis column */}
                <div className="md:col-span-9 space-y-6">
                  <div>
                    <h1 className="text-3xl md:text-5xl font-black text-white">{activeDetailsAnime.title}</h1>
                    
                  {/* Category Status details banner format */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {activeDetailsAnime.genres?.map(g => (
                      <span key={g} className="bg-purple-950/45 text-purple-300 text-xs font-bold px-3 py-1 rounded-full border border-purple-900/30">
                        {g}
                      </span>
                    ))}
                    <span className="bg-zinc-950 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full border border-zinc-900 uppercase">
                      {activeDetailsAnime.type === 'Movie' ? 'Standalone Movie' : `${activeDetailsAnime.status} Series`}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-zinc-900 pt-5">
                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-zinc-500 font-mono">Story Synopsis Plot</h3>
                  <p className="text-zinc-300 text-base leading-relaxed max-w-4xl">{activeDetailsAnime.description}</p>
                </div>

                {/* Episodes and season selector lists OR Standing Movie call-to-action */}
                <div className="border-t border-zinc-900 pt-8 space-y-6">
                  {activeDetailsAnime.type === 'Movie' ? (
                    <div className="bg-gradient-to-r from-purple-950/40 via-[#0b0813]/80 to-purple-950/10 border border-purple-800/25 p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 text-left">
                      <div className="space-y-2">
                        <span className="bg-orange-500 text-black text-[10px] font-black tracking-widest px-2.5 py-1 rounded uppercase font-mono">
                          STANDALONE FEATURE FILM
                        </span>
                        <h2 className="text-2xl md:text-3xl font-black text-white">READY TO WATCH</h2>
                        <p className="text-zinc-400 text-sm max-w-xl">
                          This anime represents a complete, cinematic standalone production. Experience the entire movie journey in one continuous high-definition viewing session.
                        </p>
                        <div className="text-zinc-500 text-xs font-semibold font-mono flex items-center space-x-3 pt-1">
                          <span>🕒 Duration: {activeDetailsAnime.duration ? `${Math.floor(activeDetailsAnime.duration / 60)} minutes` : '90 minutes'}</span>
                          <span>•</span>
                          <span>📽️ Resolution: 1080p Ultra HD</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const virtualEpisode: Episode = {
                            id: activeDetailsAnime.id + '_movie',
                            animeId: activeDetailsAnime.id,
                            seasonId: 'movie_season',
                            seasonNumber: 1,
                            number: 1,
                            title: activeDetailsAnime.title,
                            description: activeDetailsAnime.description,
                            videoUrl: activeDetailsAnime.videoUrl || '',
                            thumbnailUrl: activeDetailsAnime.thumbnailUrl,
                            duration: activeDetailsAnime.duration || 5400,
                            createdAt: new Date()
                          };
                          
                          // Set direct playing states
                          setActivePlayEpisode(virtualEpisode);
                          setActiveView('watch');
                        }}
                        className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-extrabold px-8 py-4 rounded-xl flex items-center space-x-3.5 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-orange-500/20 cursor-pointer text-base uppercase shrink-0"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        <span>Watch Anime Movie</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-900 pb-3 gap-3">
                        <h2 className="text-xl md:text-2xl font-black text-white tracking-wide uppercase">Episodes Library</h2>
                        
                        {/* Seasons selector tab */}
                        {activeDetailsSeasons.length > 0 ? (
                          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-900 text-xs font-extrabold">
                            {activeDetailsSeasons.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => setActiveDetailsSelectedSeasonId(s.id)}
                                className={`px-4 py-2 rounded-lg cursor-pointer ${
                                  activeDetailsSelectedSeasonId === s.id 
                                    ? 'bg-orange-500 text-black font-black shadow-lg shadow-orange-500/10' 
                                    : 'text-zinc-400 hover:text-white'
                                }`}
                              >
                                {s.name?.trim() || (s as any).title?.trim() || `Season ${s.number}`}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-zinc-500">Continuous play</span>
                        )}
                      </div>

                      {/* Filtered Episodes for current season */}
                      {activeDetailsSelectedSeasonId ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          {activeDetailsEpisodes
                            .filter(ep => ep.seasonId === activeDetailsSelectedSeasonId)
                            .map((ep) => (
                              <div
                                key={ep.id}
                                onClick={() => navigateToPlayEpisode(activeDetailsAnime.id, ep.id)}
                                className="glass-panel group rounded-xl overflow-hidden border border-purple-950/20 hover:border-orange-500/40 transition-all cursor-pointer flex flex-col h-full"
                              >
                                <div className="aspect-video w-full overflow-hidden bg-zinc-900 relative">
                                  <LazyImage
                                    src={ep.thumbnailUrl}
                                    alt=""
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <div className="p-3 bg-orange-500 text-black rounded-full shadow-lg">
                                      <Play className="w-5 h-5 fill-current ml-0.5" />
                                    </div>
                                  </div>
                                  <span className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur-md text-[10px] font-bold text-zinc-300 px-2 py-0.5 rounded border border-zinc-800">
                                    E{ep.number} • {ep.duration ? `${Math.floor(ep.duration / 60)}m` : '15m'}
                                  </span>
                                </div>

                                <div className="p-4 flex-1 flex flex-col justify-between text-left">
                                  <div>
                                    <h4 className="font-extrabold text-sm text-zinc-100 group-hover:text-orange-400 transition-colors">
                                      Episode {ep.number}: {ep.title}
                                    </h4>
                                    <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed line-clamp-2">
                                      {ep.description || 'No detailed synopsis plot has been captured for this episode stream.'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          
                          {activeDetailsEpisodes.filter(ep => ep.seasonId === activeDetailsSelectedSeasonId).length === 0 && (
                            <div className="col-span-full py-12 text-center text-zinc-500 font-semibold text-xs border border-dashed border-zinc-900 rounded-xl">
                              No episodes configured inside this active season list. Login to details as Admin to define episodes.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-12 text-center text-zinc-500 font-semibold text-xs border border-dashed border-zinc-900 rounded-xl">
                          No seasons configured or defined for this anime title.
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* RECOMMENDATIONS SECTION */}
                {activeDetailsAnime && (
                  <div className="border-t border-zinc-900 pt-8 space-y-4">
                    <h2 className="text-xl md:text-2xl font-black text-white flex items-center space-x-2.5">
                      <Compass className="w-5 h-5 text-orange-500" />
                      <span className="uppercase tracking-widest">WE RECOMMEND SIMILAR ANIME</span>
                    </h2>
                    {allAnime.filter(a => a.id !== activeDetailsAnime.id && a.genres?.some(g => activeDetailsAnime.genres?.includes(g))).length === 0 ? (
                      <p className="text-xs text-zinc-500 font-bold text-left">No similar genre recommendation available yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {allAnime
                          .filter(a => a.id !== activeDetailsAnime.id && a.genres?.some(g => activeDetailsAnime.genres?.includes(g)))
                          .slice(0, 5)
                          .map((anime) => (
                            <AnimeCard
                              key={anime.id}
                              anime={anime}
                              onClick={navigateToAnimeDetails}
                              onPlayClick={navigateToAnimeDetails}
                              isFavorite={favorites.includes(anime.id)}
                              onToggleFavorite={handleToggleFavorite}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* RENDER COMMENTS & REVIEWS TABBED SECTION */}
                {renderCommentsAndReviewsTabbedSection('details')}
              </div>

            </div>
          </div>
        </div>
      )}

        {/* WATCH STREAM PLAYER SCREEN */}
        {activeView === 'watch' && (!activePlayEpisode || !activeDetailsAnime) && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-zinc-300 gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-t-orange-500 border-purple-950/40 animate-spin"></div>
            <p className="font-extrabold text-sm tracking-widest text-orange-400 uppercase font-mono pulse-glow">Loading Stream Details...</p>
          </div>
        )}
        {activeView === 'watch' && activePlayEpisode && activeDetailsAnime && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
              
              {/* Left Column: Player & Metadata description details */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Back button */}
                <button
                  onClick={() => navigateToAnimeDetails(activeDetailsAnime.id)}
                  className="bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer flex items-center space-x-1.5 border border-zinc-800"
                >
                  <span>← BACK TO INFO SCREEN</span>
                </button>

                {/* Custom media player */}
                <CustomPlayer
                  episode={activePlayEpisode}
                  animeTitle={activeDetailsAnime.title}
                  animeThumbnail={activeDetailsAnime.thumbnailUrl}
                  userId={user.uid}
                  onEpisodeCompleted={() => console.log("Episode ended")}
                  onNextEpisode={playNextEpisode}
                  hasNextEpisode={hasNextEpisodeAvailable}
                  onPreviousEpisode={playPrevEpisode}
                  hasPreviousEpisode={hasPrevEpisodeAvailable}
                  initialProgress={allWatchHistory.find(h => h.episodeId === activePlayEpisode.id)?.progress || 0}
                  seasons={activeDetailsSeasons}
                  episodes={activeDetailsEpisodes}
                  selectedSeasonId={watchSelectedSeasonId}
                  onSelectSeason={(seasonId) => setWatchSelectedSeasonId(seasonId)}
                  onSelectEpisode={(ep) => navigateToPlayEpisode(activeDetailsAnime.id, ep.id)}
                />

                {/* Premium Bento Information Section */}
                <div className="glass-panel p-6 rounded-2xl border border-zinc-800/85 space-y-6 bg-zinc-950/40 backdrop-blur-md">
                  <div className="flex flex-col md:flex-row gap-6 items-start">
                    {/* Poster */}
                    <LazyImage 
                      src={activeDetailsAnime.thumbnailUrl} 
                      alt={activeDetailsAnime.title} 
                      className="w-32 h-48 object-cover rounded-xl border border-zinc-800/80 shadow-2xl shrink-0" 
                      referrerPolicy="no-referrer"
                    />
                    
                    <div className="flex-1 min-w-0 space-y-3 text-left">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-md font-mono">
                            {activeDetailsAnime.type || 'Series'}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400 font-mono">
                            ⭐ {activeDetailsAnime.rating || 'N/A'} • {activeDetailsAnime.releaseYear || '2026'}
                          </span>
                        </div>
                        <h1 className="text-2xl font-black text-white mt-1 leading-tight tracking-wide">{activeDetailsAnime.title}</h1>
                        {activeDetailsAnime.language && (
                          <p className="text-xs text-zinc-400 font-medium font-sans mt-0.5">Language format: {activeDetailsAnime.language}</p>
                        )}
                      </div>

                      {/* Grid of details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-900 text-[11px] font-mono">
                        <div>
                          <span className="text-zinc-500 block">STUDIO</span>
                          <span className="text-zinc-300 font-bold">{activeDetailsAnime.studio || 'Mappa'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">STATUS</span>
                          <span className="text-zinc-300 font-bold">{activeDetailsAnime.status || 'Ongoing'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">EPISODES</span>
                          <span className="text-zinc-300 font-bold">
                            {activeDetailsAnime.episodeCount && activeDetailsAnime.episodeCount > 0 
                              ? `${activeDetailsAnime.episodeCount} Episodes` 
                              : `${activeDetailsEpisodes.length} Episodes`
                            }
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">RATING</span>
                          <span className="text-zinc-300 font-bold">★ {activeDetailsAnime.rating || '8.5'}</span>
                        </div>
                      </div>

                      {/* Genres */}
                      {activeDetailsAnime.genres && activeDetailsAnime.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {activeDetailsAnime.genres.map((g, idx) => (
                            <span key={idx} className="bg-zinc-900 border border-zinc-850 text-zinc-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Synopsis Description details */}
                  <div className="border-t border-zinc-900/80 pt-4 text-left space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider font-mono">Synopsis</h3>
                      <button
                        onClick={() => {
                          if (!activePlayEpisode || !activePlayEpisode.videoUrl) return;
                          const cleanTitle = activePlayEpisode.seasonId === 'movie_season'
                            ? `${activeDetailsAnime?.title || 'Anime_Movie'}.mp4`.replace(/[^a-zA-Z0-9.\-_]/g, '_')
                            : `${activeDetailsAnime?.title || 'Anime'}_S${activePlayEpisode.seasonNumber}_E${activePlayEpisode.number}.mp4`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                          handleDownloadVideo(activePlayEpisode.videoUrl, cleanTitle);
                        }}
                        disabled={downloadingUrl === activePlayEpisode?.videoUrl}
                        className="bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-[10.5px] font-extrabold px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer select-none"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{downloadingUrl === activePlayEpisode?.videoUrl ? 'Downloading...' : 'Offline Download'}</span>
                      </button>
                    </div>
                    {downloadingUrl === activePlayEpisode?.videoUrl && (
                      <div className="p-3.5 bg-zinc-950/80 border border-orange-500/25 rounded-xl space-y-2 mt-1">
                        <div className="flex items-center space-x-2 text-xs font-black text-orange-400">
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                          <span>{downloadProgress}</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-normal font-semibold">
                          If your browser blocks automatic downloads inside this secure portal, please use the direct link below:
                        </p>
                        <div className="flex gap-2">
                          <a
                            href={activePlayEpisode.videoUrl}
                            download={activePlayEpisode.seasonId === 'movie_season'
                              ? `${activeDetailsAnime?.title || 'Anime_Movie'}.mp4`.replace(/[^a-zA-Z0-9.\-_]/g, '_')
                              : `${activeDetailsAnime?.title || 'Anime'}_S${activePlayEpisode.seasonNumber}_E${activePlayEpisode.number}.mp4`.replace(/[^a-zA-Z0-9.\-_]/g, '_')
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-black font-black text-[10px] px-3.5 py-1.5 rounded-lg transition-colors uppercase cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>Direct File Link</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setDownloadingUrl(null)}
                            className="bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] px-3 py-1.5 rounded-lg transition-colors uppercase font-bold cursor-pointer border border-zinc-700/40"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="text-zinc-300 text-sm leading-relaxed font-sans">
                      {activePlayEpisode.description || activeDetailsAnime.description || 'No detailed plot summary is recorded for this specific video instance.'}
                    </p>
                  </div>
                </div>

                {/* Four circular glassmorphism action buttons: My List, Add Series, Favorite Episode, Share */}
                <div id="premium-circular-action-buttons" className="grid grid-cols-4 gap-4 justify-items-center max-w-md mx-auto pt-4 pb-2">
                  {/* Button 1: My List */}
                  <div className="flex flex-col items-center space-y-2">
                    <button
                      onClick={() => handleToggleWatchlist(activeDetailsAnime.id)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-300 relative overflow-hidden group cursor-pointer shadow-lg ${
                        watchlistIds.includes(activeDetailsAnime.id)
                          ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-orange-500/20 hover:shadow-orange-500/40'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-white hover:border-orange-500/40 shadow-black/40 hover:shadow-orange-500/10'
                      }`}
                    >
                      <div className="absolute inset-0 bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full blur-md"></div>
                      <Bookmark className={`w-5 h-5 group-hover:scale-110 transition-transform ${watchlistIds.includes(activeDetailsAnime.id) ? 'fill-orange-500/30' : ''}`} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">My List</span>
                  </div>

                  {/* Button 2: Add Series */}
                  <div className="flex flex-col items-center space-y-2">
                    <button
                      onClick={() => handleToggleFavorite(activeDetailsAnime.id)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-300 relative overflow-hidden group cursor-pointer shadow-lg ${
                        favorites.includes(activeDetailsAnime.id)
                          ? 'bg-green-500/20 border-green-500 text-green-400 shadow-green-500/20 hover:shadow-green-500/40'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-white hover:border-orange-500/40 shadow-black/40 hover:shadow-orange-500/10'
                      }`}
                    >
                      <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full blur-md"></div>
                      <PlusCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Add Series</span>
                  </div>

                  {/* Button 3: Favorite Episode */}
                  <div className="flex flex-col items-center space-y-2">
                    <button
                      onClick={() => handleToggleFavoriteEpisode(activePlayEpisode.id)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-300 relative overflow-hidden group cursor-pointer shadow-lg ${
                        favoriteEpisodes.includes(activePlayEpisode.id)
                          ? 'bg-red-500/20 border-red-500 text-red-400 shadow-red-500/20 hover:shadow-red-500/40'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-white hover:border-orange-500/40 shadow-black/40 hover:shadow-orange-500/10'
                      }`}
                    >
                      <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full blur-md"></div>
                      <Heart className={`w-5 h-5 group-hover:scale-110 transition-transform ${favoriteEpisodes.includes(activePlayEpisode.id) ? 'fill-red-500/30' : ''}`} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Favorite</span>
                  </div>

                  {/* Button 4: Share */}
                  <div className="flex flex-col items-center space-y-2">
                    <button
                      onClick={() => {
                        const shareData = {
                          title: `${activeDetailsAnime.title} - ${activePlayEpisode.title}`,
                          text: `Watching ${activeDetailsAnime.title} S${activePlayEpisode.seasonNumber} E${activePlayEpisode.number} on AnimeStream! Join me!`,
                          url: window.location.href
                        };
                        if (navigator.share) {
                          navigator.share(shareData).catch(() => {});
                        } else {
                          navigator.clipboard.writeText(window.location.href);
                          alert("AnimeStream watch link copied to clipboard successfully!");
                        }
                      }}
                      className="w-14 h-14 rounded-full flex items-center justify-center border bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-white hover:border-orange-500/40 shadow-black/40 hover:shadow-orange-500/10 transition-all duration-300 relative overflow-hidden group cursor-pointer shadow-lg"
                    >
                      <div className="absolute inset-0 bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full blur-md"></div>
                      <Share2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Share</span>
                  </div>
                </div>

                {/* RENDER COMMENTS & REVIEWS TABBED SECTION IN WATCH PANEL */}
                {renderCommentsAndReviewsTabbedSection('watch')}

              </div>

              {/* Right Column: Premium Interactive Season & Episode Switcher List panel */}
              <div className="lg:col-span-4 space-y-4">
                <div className="glass-panel p-5 rounded-2xl border border-zinc-850 bg-[#0d0a17]/90 backdrop-blur-md flex flex-col h-full max-h-[850px] shadow-2xl">
                  <div className="border-b border-zinc-900 pb-3.5 mb-4 text-left">
                    <h3 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 font-mono">
                      Season Switcher
                    </h3>
                    
                    {/* Season Switcher Tab Row */}
                    {activeDetailsSeasons.length > 0 ? (
                      <div className="flex bg-zinc-900/60 p-1.5 rounded-xl border border-zinc-850 text-[11px] font-extrabold gap-1 mt-2.5 overflow-x-auto no-scrollbar scroll-smooth">
                        {activeDetailsSeasons.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setWatchSelectedSeasonId(s.id)}
                            className={`px-3.5 py-1.5 rounded-lg cursor-pointer transition-all shrink-0 uppercase tracking-wider ${
                              watchSelectedSeasonId === s.id 
                                ? 'bg-orange-500 text-black font-black shadow-lg shadow-orange-500/15' 
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/35'
                            }`}
                          >
                            {s.name?.trim() || (s as any).title?.trim() || `Season ${s.number}`}
                          </button>
                        ))}
                        {/* If show is Movie type or has single video option, we can show Movie tab */}
                        {activeDetailsAnime.videoUrl && (
                          <button
                            onClick={() => setWatchSelectedSeasonId('movie_season')}
                            className={`px-3.5 py-1.5 rounded-lg cursor-pointer transition-all shrink-0 uppercase tracking-wider ${
                              watchSelectedSeasonId === 'movie_season' 
                                ? 'bg-orange-500 text-black font-black shadow-lg shadow-orange-500/15' 
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/35'
                            }`}
                          >
                            Movie
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex bg-zinc-900/60 p-1.5 rounded-xl border border-zinc-850 text-xs font-bold text-zinc-400 mt-2 text-center justify-center">
                        <span>Continuous playback</span>
                      </div>
                    )}
                  </div>

                  {/* Episodes List Scroll Area */}
                  <div className="flex-1 overflow-y-auto pr-1 space-y-3 scroll-smooth max-h-[600px] no-scrollbar">
                    {/* If movie_season is selected, show movies, or if no episodes available */}
                    {watchSelectedSeasonId === 'movie_season' ? (
                      <>
                        {/* Recommended Movie / Main Movie */}
                        <div
                          onClick={() => {
                            // navigate to play the movie episode
                            const movieEpId = activeDetailsAnime.id + '_movie';
                            navigateToPlayEpisode(activeDetailsAnime.id, movieEpId);
                          }}
                          className={`flex p-3 rounded-xl border transition-all duration-300 relative overflow-hidden group ${
                            activePlayEpisode?.id === (activeDetailsAnime.id + '_movie')
                              ? 'bg-orange-500/10 border-orange-500 text-orange-400' 
                              : 'bg-zinc-900/30 border-zinc-900 hover:border-orange-500/40 text-zinc-300 cursor-pointer hover:bg-zinc-900/50 hover:translate-x-1'
                          }`}
                        >
                          <LazyImage 
                            src={activeDetailsAnime.thumbnailUrl} 
                            alt="" 
                            className="w-16 h-22 object-cover rounded-lg border border-zinc-800 shrink-0" 
                            referrerPolicy="no-referrer"
                          />
                          <div className="ml-3.5 text-left min-w-0 flex flex-col justify-center">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-black uppercase text-orange-400 bg-orange-500/15 border border-orange-500/20 px-1.5 py-0.5 rounded font-mono">
                                CINEMA MOVIE
                              </span>
                              {activePlayEpisode?.id === (activeDetailsAnime.id + '_movie') && (
                                <span className="flex items-center gap-1 text-[9px] font-black text-orange-400 font-mono uppercase tracking-widest animate-pulse">
                                  ● PLAYING
                                </span>
                              )}
                            </div>
                            <h4 className="font-extrabold text-xs truncate mt-1 text-white">
                              {activeDetailsAnime.title}
                            </h4>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5 font-semibold">
                              ⭐ {activeDetailsAnime.rating} rating • {activeDetailsAnime.releaseYear}
                            </p>
                          </div>
                        </div>

                        {/* Recommended list */}
                        <div className="pt-4 border-t border-zinc-900 text-left">
                          <p className="text-[10px] font-black text-zinc-500 tracking-wider font-mono uppercase mb-3">MORE CINEMATIC TITLES ({allAnime.filter(a => a.type === 'Movie' && a.id !== activeDetailsAnime.id).length})</p>
                          <div className="space-y-3">
                            {allAnime
                              .filter(a => a.type === 'Movie' && a.id !== activeDetailsAnime.id)
                              .map((movie) => (
                                <div
                                  key={movie.id}
                                  onClick={() => navigateToAnimeDetails(movie.id)}
                                  className="flex p-2.5 rounded-xl border bg-zinc-900/30 border-zinc-900 hover:border-orange-500/40 text-zinc-355 cursor-pointer hover:bg-zinc-900/50 hover:translate-x-1 transition-all"
                                >
                                  <LazyImage 
                                    src={movie.thumbnailUrl} 
                                    alt="" 
                                    className="w-12 h-18 object-cover rounded-lg border border-zinc-800 shrink-0" 
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="ml-3 text-left min-w-0 flex flex-col justify-center">
                                    <h4 className="font-extrabold text-xs truncate text-white">
                                      {movie.title}
                                    </h4>
                                    <p className="text-[10px] text-zinc-500 truncate mt-0.5 font-semibold font-mono">
                                      ⭐ {movie.rating} • {movie.releaseYear}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Regular Episode Items filter by watchSelectedSeasonId */}
                        {activeDetailsEpisodes
                          .filter(ep => ep.seasonId === watchSelectedSeasonId)
                          .map((ep) => {
                            const isActive = ep.id === activePlayEpisode?.id;

                            // Watch progress calculations
                            const episodeProgress = watchHistory.find(h => h.episodeId === ep.id);
                            const isWatched = episodeProgress?.completed;
                            const progressPercent = episodeProgress && episodeProgress.duration 
                              ? Math.min(100, Math.floor((episodeProgress.progress / episodeProgress.duration) * 100)) 
                              : 0;

                            return (
                              <div
                                key={ep.id}
                                onClick={() => !isActive && navigateToPlayEpisode(activeDetailsAnime.id, ep.id)}
                                className={`flex p-3 rounded-xl border transition-all duration-300 relative overflow-hidden group select-none ${
                                  isActive 
                                    ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 cursor-default scale-100 shadow-lg shadow-orange-500/5' 
                                    : 'bg-zinc-900/30 border-zinc-900 hover:border-orange-500/40 text-zinc-300 hover:bg-zinc-900/50 cursor-pointer hover:translate-x-1'
                                }`}
                              >
                                {/* Episode Image */}
                                <div className="w-24 h-15 rounded-lg border border-zinc-800 shrink-0 overflow-hidden relative bg-zinc-900">
                                  <LazyImage 
                                    src={ep.thumbnailUrl} 
                                    alt="" 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                    referrerPolicy="no-referrer"
                                  />
                                  
                                  {/* Watched Badge overlay */}
                                  {isWatched && (
                                    <span className="absolute top-1 left-1 bg-green-500 text-black font-black text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider shadow-md">
                                      Watched
                                    </span>
                                  )}

                                  {/* Playing Wave Icon overlay */}
                                  {isActive && (
                                    <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                                      <div className="flex items-center space-x-0.5 h-4">
                                        <div className="w-0.75 bg-orange-500 h-full animate-[bounce_0.8s_infinite_100ms] rounded-full"></div>
                                        <div className="w-0.75 bg-orange-500 h-3 animate-[bounce_0.8s_infinite_200ms] rounded-full"></div>
                                        <div className="w-0.75 bg-orange-500 h-full animate-[bounce_0.8s_infinite_300ms] rounded-full"></div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Duration overlay */}
                                  <span className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-md text-[8px] font-bold text-zinc-350 px-1 py-0.5 rounded font-mono border border-zinc-800">
                                    {ep.duration ? `${Math.floor(ep.duration / 60)}m` : '24m'}
                                  </span>

                                  {/* Watch Progress Line on Episode Thumbnail bottom */}
                                  {progressPercent > 0 && (
                                    <div className="absolute bottom-0 inset-x-0 h-1 bg-zinc-800">
                                      <div className="h-full bg-orange-500" style={{ width: `${progressPercent}%` }}></div>
                                    </div>
                                  )}
                                </div>

                                {/* Episode metadata info details */}
                                <div className="ml-3 text-left min-w-0 flex-1 flex flex-col justify-center">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 font-mono">
                                      Episode {ep.number}
                                    </p>
                                    {isWatched && !isActive && (
                                      <span className="text-[9px] text-green-400 font-black font-mono">✓ COMPLETED</span>
                                    )}
                                  </div>
                                  <h4 className={`font-extrabold text-xs truncate mt-0.5 ${isActive ? 'text-orange-400' : 'text-zinc-100 group-hover:text-orange-400 transition-colors'}`}>
                                    {ep.title}
                                  </h4>
                                  <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                                    {ep.description || 'Watch chapter story details...'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}

                        {activeDetailsEpisodes.filter(ep => ep.seasonId === watchSelectedSeasonId).length === 0 && (
                          <div className="p-8 bg-zinc-900/30 border border-zinc-900 rounded-xl text-center">
                            <p className="text-xs font-bold text-zinc-500 font-mono">No episodes found</p>
                            <p className="text-[10px] text-zinc-650 mt-1 leading-relaxed">No streaming media episodes have been added to this season yet.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ACCOUNT PROFILE VIEWS TAB */}
        {activeView === 'profile' && (
          <ProfileSection
            userProfile={user}
            allAnime={allAnime}
            favorites={favorites}
            onAnimeClick={navigateToAnimeDetails}
            onPlayEpisode={navigateToPlayEpisode}
            onToggleFavorite={handleToggleFavorite}
            onLogout={handleLogout}
            refreshUserProfile={forceRefreshUserProfile}
            activeTab={profileActiveTab}
            setActiveTab={setProfileActiveTab}
          />
        )}

        {/* ADMINISTRATIVE MANAGER PANEL TAB */}
        {activeView === 'admin' && user.role === 'admin' && (
          <AdminSection
            currentUserId={user.uid}
            currentUser={user}
            onExit={navigateToHome}
            allAnime={allAnime}
            refreshData={async () => {
              forceRefreshUserProfile();
              try {
                const queryAnime = query(collection(db, 'anime'));
                const snapshot = await getDocs(queryAnime);
                const animeList: Anime[] = [];
                snapshot.forEach(docSnap => {
                  animeList.push({ id: docSnap.id, ...docSnap.data() } as Anime);
                });
                setAllAnime(animeList);
              } catch (e) {
                console.warn("Failed manually syncing anime collection in refreshData:", e);
              }
            }}
            activeTab={adminActiveTab}
            setActiveTab={setAdminActiveTab}
          />
        )}

        {/* CUSTOM VIEW: ABOUT US */}
        {activeView === 'about' && (
          <div className="max-w-5xl mx-auto px-6 py-16 space-y-16 select-none">
            {/* Elegant Hero Header */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-center space-y-6"
            >
              <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-orange-400 px-4 py-1.5 rounded-full border border-orange-500/20 text-xs font-black uppercase tracking-widest font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
                <span>PROJECT ORBITAL CORE</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-none uppercase">
                THE NEXT-GEN <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400">ANIME PARADIGM</span>
              </h1>
              <p className="text-zinc-400 text-sm md:text-base max-w-3xl mx-auto leading-relaxed font-sans">
                AnimeStream is a high-performance offline-first portal engineered for the most demanding anime curators. Sync, catalog, and enjoy your physical archives with state-of-the-art security, sub-millisecond response rates, and robust local persistence.
              </p>
            </motion.div>

            {/* Core Stats Section */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 rounded-2xl border border-zinc-900 bg-zinc-950/20 backdrop-blur-md"
            >
              {[
                { value: '99.9%', label: 'SERVER SYNC UPTIME', desc: 'Continuous cloud backup' },
                { value: totalEpisodesCount >= 1000 ? `${(totalEpisodesCount / 1000).toFixed(1)}k+` : `${totalEpisodesCount || 12}+`, label: 'CURATED EPISODES', desc: 'Direct indexed streaming' },
                { value: '100%', label: 'SECURE PORTAL', desc: 'Private user databases' }
              ].map((stat, index) => (
                <div key={index} className="text-center space-y-1 p-2">
                  <div className="text-2xl md:text-3xl font-black text-white font-mono tracking-tight bg-clip-text bg-gradient-to-r from-white to-zinc-400">
                    {stat.value}
                  </div>
                  <div className="text-[9px] font-extrabold text-orange-400 tracking-widest font-mono uppercase">
                    {stat.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-medium">
                    {stat.desc}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Core Pillars / Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { 
                  title: 'Durable Cloud Storage', 
                  desc: 'Secure profile states, backups, playlists, and histories synced on Firebase serverless environments.', 
                  icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
                  color: 'border-emerald-500/10 hover:border-emerald-500/35 bg-emerald-500/5'
                },
                { 
                  title: 'Subtle Fluid Aesthetics', 
                  desc: 'Sleek dark canvas framed with cosmic neon accents, high contrast display fonts, and physical tracking.', 
                  icon: <Award className="w-5 h-5 text-amber-400" />,
                  color: 'border-amber-500/10 hover:border-amber-500/35 bg-amber-500/5'
                },
                { 
                  title: 'Smart Archive Engine', 
                  desc: 'Parse seasons, configure schedules, and resolve multi-host streaming streams with sub-pixel perfection.', 
                  icon: <Compass className="w-5 h-5 text-purple-400" />,
                  color: 'border-purple-500/10 hover:border-purple-500/35 bg-purple-500/5'
                }
              ].map((f, i) => (
                <motion.div 
                  key={f.title}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + (i * 0.1) }}
                  className={`p-6 rounded-2xl border transition-all duration-300 space-y-4 hover:translate-y-[-4px] select-none ${f.color} bg-zinc-950/40`}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800">
                    {f.icon}
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">{f.title}</h3>
                    <p className="text-zinc-400 text-xs leading-relaxed font-sans">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Interactive Call-To-Action Board */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }} 
              animate={{ opacity: 1, scale: 1 }} 
              transition={{ delay: 0.6, duration: 0.4 }}
              className="relative p-8 md:p-10 rounded-2xl border border-zinc-800 bg-gradient-to-br from-[#0e0a1b] via-[#080511] to-[#04020a] overflow-hidden shadow-2xl text-center space-y-6"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="relative space-y-3">
                <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">Ready to join the Otaku Fleet?</h2>
                <p className="text-zinc-400 text-xs md:text-sm max-w-2xl mx-auto leading-relaxed font-sans">
                  Connect your account today to unlock full watchlist monitoring, automatic next-episode loaders, custom comments tracking, and personalized stats visualizers.
                </p>
              </div>

              <div className="relative pt-4 flex justify-center">
                <button 
                  onClick={() => {
                    window.history.pushState(null, '', '/');
                    parseURLToState();
                  }}
                  className="group flex items-center space-x-3 bg-white hover:bg-zinc-200 text-black font-black text-xs tracking-widest py-3.5 px-8 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all active:scale-95 duration-300 uppercase cursor-pointer border border-white/20"
                >
                  <span>Access Main Lobby</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* CUSTOM VIEW: CONTACT US */}
        {activeView === 'contact' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <ContactForm />
          </div>
        )}

        {/* CUSTOM VIEW: 404 NOT FOUND */}
        {activeView === '404' && (
          <div className="max-w-md mx-auto px-6 py-20 text-center space-y-6 select-none">
            <div className="relative inline-block">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-orange-500 to-purple-600 blur opacity-40 animate-pulse" />
              <div className="relative bg-zinc-950 border border-zinc-900 rounded-full w-24 h-24 flex items-center justify-center text-4xl">
                🌌
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-black text-white tracking-widest font-mono">404</h1>
              <h2 className="text-xs font-extrabold text-orange-400 uppercase tracking-widest font-mono">VOID VECTOR COORDINATES</h2>
              <p className="text-zinc-400 text-xs leading-relaxed max-w-sm mx-auto">
                The requesting sector does not map to any registered physical pathway inside the AnimeStream core architecture index. Let us guide you back to safety.
              </p>
            </div>
            <button 
              onClick={() => {
                window.history.pushState(null, '', '/');
                parseURLToState();
              }}
              className="bg-zinc-900 hover:bg-zinc-850 text-white border border-zinc-850 font-extrabold text-xs tracking-wider py-2.5 px-6 rounded-lg cursor-pointer active:scale-95 transition-all"
            >
              RETURN TO BROWSE LOBBY
            </button>
          </div>
        )}

        {/* CUSTOM VIEW: FORBIDDEN 403 */}
        {activeView === 'forbidden' && (
          <div className="max-w-md mx-auto px-6 py-20 text-center space-y-6 select-none">
            <div className="relative inline-block">
              <div className="absolute -inset-1 rounded-full bg-red-500/30 blur opacity-50" />
              <div className="relative bg-zinc-950 border border-red-500/20 rounded-full w-24 h-24 flex items-center justify-center text-red-500 text-4xl font-mono font-black">
                🚫
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-black text-red-500 tracking-wider">RESTRICTED</h1>
              <h2 className="text-xs font-extrabold text-red-400 uppercase tracking-widest font-mono">ADMINISTRATOR PRIVILEGES MANDATORY</h2>
              <p className="text-zinc-400 text-xs leading-relaxed max-w-sm mx-auto">
                Security warning: The current user session lacks the administrative security token required to access this sector. Access failure has been logged.
              </p>
            </div>
            <button 
              onClick={() => {
                window.history.pushState(null, '', '/');
                parseURLToState();
              }}
              className="bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/20 font-extrabold text-xs tracking-wider py-2.5 px-6 rounded-lg cursor-pointer active:scale-95 transition-all"
            >
              EXIT GATE SECURELY
            </button>
          </div>
        )}

        {/* CUSTOM VIEW: MAINTENANCE */}
        {activeView === 'maintenance' && (
          <div className="max-w-md mx-auto px-6 py-20 text-center space-y-6 select-none">
            <div className="relative inline-block">
              <div className="absolute -inset-1 rounded-full bg-amber-500/20 blur opacity-40 animate-pulse" />
              <div className="relative bg-zinc-950 border border-amber-500/20 rounded-full w-24 h-24 flex items-center justify-center text-4xl">
                🛠️
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black text-white tracking-tight uppercase">RETROFITTING WARP DRIVES</h1>
              <h2 className="text-[10px] font-extrabold text-amber-500 uppercase tracking-widest font-mono">SYSTEM MAINTENANCE ACTIVE</h2>
              <p className="text-zinc-400 text-xs leading-relaxed max-w-sm mx-auto">
                We are currently performing infrastructure optimization on our content delivery networks to guarantee instant video stream loaders.
              </p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs tracking-wider py-2.5 px-6 rounded-lg cursor-pointer active:scale-95 transition-all"
            >
              RETRY CONNECTION
            </button>
          </div>
        )}

      </main>

      {/* 3. Global Footer copyright info */}
      <footer className="bg-zinc-950/40 border-t border-purple-950/15 py-8 mt-12 text-center select-none font-sans">
        <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full"></span>
              <span>© 2026 AnimeStream. All Rights Reserved.</span>
            </div>
            <div className="flex space-x-4">
              <span 
                onClick={() => {
                  window.history.pushState(null, '', '/about');
                  parseURLToState();
                }}
                className="hover:text-orange-400 cursor-pointer transition-colors"
              >
                About Us
              </span>
              <span>•</span>
              <span 
                onClick={() => {
                  window.history.pushState(null, '', '/contact');
                  parseURLToState();
                }}
                className="hover:text-orange-400 cursor-pointer transition-colors"
              >
                Contact Us
              </span>
              <span>•</span>
              <span className="text-zinc-600 font-mono">V_3.0_RELEASE</span>
            </div>
          </div>
          
          {/* Subtle divider line above disclaimer */}
          <div className="border-t border-zinc-900/60 my-4"></div>
          
          {/* Centered disclaimer text, slightly smaller than the main footer text */}
          <p className="text-[9px] text-zinc-650 font-semibold tracking-wider text-center max-w-4xl mx-auto leading-relaxed uppercase">
            AnimeStream does not host any files on its servers. All files or contents are hosted on third-party websites. We just index those links which are already available on the internet.
          </p>
        </div>
      </footer>

      {/* 4. Global Download Toast Overlay */}
      {downloadingUrl && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#120e23]/95 border border-amber-500/40 p-4 rounded-xl shadow-xl shadow-black/80 max-w-sm flex items-start space-x-3 backdrop-blur-md animate-bounce">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <Download className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="text-[11px] font-black uppercase text-amber-400 tracking-wider font-mono">
              📥 Video Downloader Stream
            </h4>
            <p className="text-[10px] text-zinc-300 font-semibold mt-1 leading-normal">
              {downloadProgress}
            </p>
          </div>
        </div>
      )}

      {/* 5. Custom App Alert Dialog */}
      <AnimatePresence>
        {globalAlert.visible && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-md bg-[#120e23] border border-orange-500/50 p-6 rounded-2xl shadow-2xl shadow-orange-500/10"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
                  <AlertCircle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-orange-500 tracking-wider font-mono">
                    System Notification
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-bold tracking-widest font-mono uppercase">
                    AnimeStream Universe
                  </p>
                </div>
              </div>

              <div className="text-zinc-200 text-xs font-semibold leading-relaxed mb-6 font-sans border-t border-zinc-900 pt-4 max-h-[60vh] overflow-y-auto">
                {globalAlert.message}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setGlobalAlert({ message: '', visible: false })}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black text-xs font-black font-mono tracking-wider transition-all shadow-md shadow-orange-500/15 uppercase cursor-pointer"
                >
                  Acknowledge
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Remove from Continue Watching Confirmation Modal */}
      <AnimatePresence>
        {watchHistoryToRemoveId && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-md bg-[#120e23] border border-red-500/50 p-6 rounded-2xl shadow-2xl shadow-red-500/10"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                  <Trash2 className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-red-500 tracking-wider font-mono">
                    Remove from Continue Watching
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-bold tracking-widest font-mono uppercase">
                    Action Confirmation
                  </p>
                </div>
              </div>

              <div className="text-zinc-200 text-xs font-semibold leading-relaxed mb-6 font-sans border-t border-zinc-900/80 pt-4">
                Are you sure you want to remove this episode from your Continue Watching list?
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setWatchHistoryToRemoveId(null)}
                  className="px-4 py-2 rounded-full border border-zinc-850 hover:bg-zinc-900 text-zinc-300 text-xs font-black font-mono tracking-wider transition-all uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (watchHistoryToRemoveId) {
                      await handleRemoveFromContinueWatching(watchHistoryToRemoveId);
                      setWatchHistoryToRemoveId(null);
                    }
                  }}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white text-xs font-black font-mono tracking-wider transition-all shadow-md shadow-red-500/15 uppercase cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
