import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, Pause, Volume2, Volume1, Volume, VolumeX, Maximize, Minimize, 
  RotateCcw, RotateCw, Settings, SkipForward, SkipBack,
  Tv, History, AlertTriangle, Loader2, X, Sun, ArrowRight, Check, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, doc, setDoc, updateDoc } from '../firebase';
import Hls from 'hls.js';

interface CustomPlayerProps {
  episode: any;
  animeTitle: string;
  animeThumbnail: string;
  userId: string | undefined;
  onEpisodeCompleted?: () => void;
  onNextEpisode?: () => void;
  hasNextEpisode: boolean;
  nextEpisodePreview?: { title: string, thumbnailUrl: string, number: number };
  onPreviousEpisode?: () => void;
  hasPreviousEpisode: boolean;
  initialProgress?: number;
  seasons?: any[];
  episodes?: any[];
  selectedSeasonId?: string;
  onSelectSeason?: (seasonId: string) => void;
  onSelectEpisode?: (ep: any) => void;
}

// Helper to resolve API URLs with fallback to an external backend if VITE_BACKEND_URL is set (crucial for Netlify/Vercel static hosting)
const getApiUrl = (endpoint: string): string => {
  let backendUrl = ((import.meta as any).env.VITE_BACKEND_URL || '').trim();
  
  const isAIStudio = typeof window !== 'undefined' && (
    window.location.hostname.includes('run.app') || 
    window.location.hostname === 'localhost' ||
    window.location.port === '3000'
  );

  if (isAIStudio) {
    backendUrl = ''; // Ignore external backend URL in AI Studio to prevent Cloudflare 403 blocks
  }

  if (backendUrl) {
    const base = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    return `${base}${endpoint}`;
  }

  // Detect if we are running in a static web environment (Netlify, Vercel, GitHub Pages, etc.)
  const isStaticHost = typeof window !== 'undefined' && (
    window.location.hostname.includes('netlify') ||
    window.location.hostname.includes('vercel') ||
    window.location.hostname.includes('github.io') ||
    window.location.hostname.includes('amplifyapp') ||
    window.location.hostname.includes('firebaseapp')
  );

  if (isStaticHost) {
    // Return the hardcoded AI Studio shared backend url for static host frontends
    const defaultBackend = 'https://ais-pre-k6y6fhwxcy5kzgcmt2ycbm-1031531415688.asia-southeast1.run.app';
    return `${defaultBackend}${endpoint}`;
  }

  return endpoint;
};

// ==========================================
// PROFESSIONAL AUDIO TRACK & LANGUAGE DETECTION
// ==========================================
const languageMapping: Record<string, { name: string; flag: string }> = {
  // ISO 639-2 (3-letter) codes
  jpn: { name: 'Japanese', flag: '🇯🇵' },
  eng: { name: 'English', flag: '🇺🇸' },
  hin: { name: 'Hindi', flag: '🇮🇳' },
  kor: { name: 'Korean', flag: '🇰🇷' },
  chi: { name: 'Chinese', flag: '🇨🇳' },
  zho: { name: 'Chinese', flag: '🇨🇳' },
  fre: { name: 'French', flag: '🇫🇷' },
  fra: { name: 'French', flag: '🇫🇷' },
  spa: { name: 'Spanish', flag: '🇪🇸' },
  ger: { name: 'German', flag: '🇩🇪' },
  deu: { name: 'German', flag: '🇩🇪' },
  ita: { name: 'Italian', flag: '🇮🇹' },
  rus: { name: 'Russian', flag: '🇷🇺' },
  por: { name: 'Portuguese', flag: '🇵🇹' },

  // ISO 639-1 (2-letter) codes
  ja: { name: 'Japanese', flag: '🇯🇵' },
  en: { name: 'English', flag: '🇺🇸' },
  hi: { name: 'Hindi', flag: '🇮🇳' },
  ko: { name: 'Korean', flag: '🇰🇷' },
  zh: { name: 'Chinese', flag: '🇨🇳' },
  fr: { name: 'French', flag: '🇫🇷' },
  es: { name: 'Spanish', flag: '🇪🇸' },
  de: { name: 'German', flag: '🇩🇪' },
  it: { name: 'Italian', flag: '🇮🇹' },
  ru: { name: 'Russian', flag: '🇷🇺' },
  pt: { name: 'Portuguese', flag: '🇵🇹' }
};

function getTrackLanguageInfo(track: any, index: number): { name: string; flag: string } {
  const lang = (track.language || '').toLowerCase().trim();
  const title = (track.title || '').toLowerCase().trim();

  // Try direct code match
  if (lang && languageMapping[lang]) {
    return languageMapping[lang];
  }

  // Try checking title for language names
  if (title.includes('japanese') || title.includes('jpn') || title.includes('ja-jp') || title.includes('nihongo')) {
    return { name: 'Japanese', flag: '🇯🇵' };
  }
  if (title.includes('english') || title.includes('eng') || title.includes('en-us') || title.includes('en-gb') || title.includes('dub')) {
    return { name: 'English', flag: '🇺🇸' };
  }
  if (title.includes('hindi') || title.includes('hin') || title.includes('india')) {
    return { name: 'Hindi', flag: '🇮🇳' };
  }
  if (title.includes('korean') || title.includes('kor') || title.includes('ko-kr')) {
    return { name: 'Korean', flag: '🇰🇷' };
  }
  if (title.includes('chinese') || title.includes('chi') || title.includes('zho') || title.includes('zh-cn') || title.includes('mandarin')) {
    return { name: 'Chinese', flag: '🇨🇳' };
  }
  if (title.includes('french') || title.includes('fre') || title.includes('fra') || title.includes('fr-fr')) {
    return { name: 'French', flag: '🇫🇷' };
  }
  if (title.includes('spanish') || title.includes('spa') || title.includes('es-es') || title.includes('es-la')) {
    return { name: 'Spanish', flag: '🇪🇸' };
  }
  if (title.includes('german') || title.includes('ger') || title.includes('deu') || title.includes('de-de')) {
    return { name: 'German', flag: '🇩🇪' };
  }
  if (title.includes('italian') || title.includes('ita') || title.includes('it-it')) {
    return { name: 'Italian', flag: '🇮🇹' };
  }
  if (title.includes('russian') || title.includes('rus') || title.includes('ru-ru')) {
    return { name: 'Russian', flag: '🇷🇺' };
  }
  if (title.includes('portuguese') || title.includes('por') || title.includes('pt-br') || title.includes('pt-pt')) {
    return { name: 'Portuguese', flag: '🇵🇹' };
  }

  // Smart inference if no metadata is present:
  // For these releases, the default/Track 1 (idx 0) is Hindi, and Track 2 (idx 1) is English, Track 3 (idx 2) is Japanese
  if (index === 0) {
    return { name: 'Hindi', flag: '🇮🇳' };
  }
  if (index === 1) {
    return { name: 'English', flag: '🇺🇸' };
  }
  if (index === 2) {
    return { name: 'Japanese', flag: '🇯🇵' };
  }

  return { name: 'Unknown Language', flag: '🌍' };
}

function formatCodec(codec: string | undefined): string {
  if (!codec) return 'AAC';
  const c = codec.toLowerCase().trim();
  if (c.includes('aac')) return 'AAC';
  if (c.includes('opus')) return 'Opus';
  if (c.includes('ac-3') || c === 'ac3') return 'AC3';
  if (c.includes('e-ac-3') || c.includes('eac3')) return 'E-AC3';
  if (c.includes('dts')) return 'DTS';
  if (c.includes('flac')) return 'FLAC';
  if (c.includes('mp3')) return 'MP3';
  if (c.includes('vorbis')) return 'Vorbis';
  return codec.toUpperCase();
}

function formatChannels(channels: any): string {
  if (!channels) return 'Stereo';
  const ch = String(channels).trim().toLowerCase();
  if (ch === '1' || ch === 'mono') return 'Mono';
  if (ch === '2' || ch === 'stereo') return 'Stereo';
  if (ch === '6' || ch === '5.1') return '5.1';
  if (ch === '8' || ch === '7.1') return '7.1';
  return `${channels} Channels`;
}

const getPreferredTrackIndex = (tracks: any[], isStaticDeployment: boolean): number => {
  if (!tracks || tracks.length === 0) return 0;

  const preferredLang = localStorage.getItem('preferredAudioLanguage') || 'hi'; // Default preferred: hi (Hindi)
  const unAudio = ['dts', 'dtshd', 'truehd', 'eac3', 'ac3', 'mlp', 'flac'];
  
  // Browsers on static CDN deployments can't transcode, so they need AAC / WebM compatible audio
  const canTranscode = !isStaticDeployment;
  const isCompatible = (track: any) => {
    const codec = (track.codec || '').toLowerCase();
    return !unAudio.some(c => codec.includes(c)) || canTranscode;
  };

  // Find track index that matches preferred language and is compatible
  let matchedIndex = tracks.findIndex((track, idx) => {
    if (!isCompatible(track)) return false;
    const info = getTrackLanguageInfo(track, idx);
    const langCode = (track.language || '').toLowerCase().trim();
    
    if (langCode === preferredLang) return true;
    if (preferredLang === 'ja' && (langCode === 'jpn' || info.name === 'Japanese')) return true;
    if (preferredLang === 'en' && (langCode === 'eng' || info.name === 'English')) return true;
    if (preferredLang === 'hi' && (langCode === 'hin' || info.name === 'Hindi')) return true;
    if (preferredLang === 'ko' && (langCode === 'kor' || info.name === 'Korean')) return true;
    if (preferredLang === 'zh' && (langCode === 'chi' || langCode === 'zho' || info.name === 'Chinese')) return true;
    if (preferredLang === 'fr' && (langCode === 'fre' || langCode === 'fra' || info.name === 'French')) return true;
    if (preferredLang === 'es' && (langCode === 'spa' || info.name === 'Spanish')) return true;
    if (preferredLang === 'de' && (langCode === 'ger' || langCode === 'deu' || info.name === 'German')) return true;
    if (preferredLang === 'it' && (langCode === 'ita' || info.name === 'Italian')) return true;
    if (preferredLang === 'ru' && (langCode === 'rus' || info.name === 'Russian')) return true;
    if (preferredLang === 'pt' && (langCode === 'por' || info.name === 'Portuguese')) return true;
    return false;
  });

  if (matchedIndex !== -1) {
    return matchedIndex;
  }

  // Fallback 1: Preferred language, even if not fully compatible
  matchedIndex = tracks.findIndex((track, idx) => {
    const info = getTrackLanguageInfo(track, idx);
    const langCode = (track.language || '').toLowerCase().trim();
    if (langCode === preferredLang) return true;
    if (preferredLang === 'ja' && (langCode === 'jpn' || info.name === 'Japanese')) return true;
    if (preferredLang === 'en' && (langCode === 'eng' || info.name === 'English')) return true;
    if (preferredLang === 'hi' && (langCode === 'hin' || info.name === 'Hindi')) return true;
    return false;
  });

  if (matchedIndex !== -1) {
    return matchedIndex;
  }

  // Fallback 2: Default track if compatible
  const defaultIdx = tracks.findIndex((track) => track.disposition?.default === 1 || track.default === true);
  if (defaultIdx !== -1 && isCompatible(tracks[defaultIdx])) {
    return defaultIdx;
  }

  // Fallback 3: First compatible track
  const firstCompatibleIdx = tracks.findIndex((track) => isCompatible(track));
  if (firstCompatibleIdx !== -1) {
    return firstCompatibleIdx;
  }

  // Fallback 4: Default track (first track)
  return defaultIdx !== -1 ? defaultIdx : 0;
};

export default function CustomPlayer({
  episode,
  animeTitle,
  animeThumbnail,
  userId,
  onEpisodeCompleted,
  onNextEpisode,
  hasNextEpisode,
  nextEpisodePreview,
  onPreviousEpisode,
  hasPreviousEpisode,
  initialProgress = 0,
  seasons = [],
  episodes = [],
  selectedSeasonId = '',
  onSelectSeason,
  onSelectEpisode
}: CustomPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [brightness, setBrightness] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheatreMode, setIsTheatreMode] = useState(false);
  
  const [showControls, setShowControls] = useState(true);
  const [lastActivity, setLastActivity] = useState<number>(Date.now()); // NAYA FIX: Robust 3s Tracker
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState<number>(0);

  const [showEndScreen, setShowEndScreen] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const [showGestureUI, setShowGestureUI] = useState<'volume' | 'brightness' | 'seeking' | null>(null);
  const [swipeSeekTime, setSwipeSeekTime] = useState<number>(0);
  const [swipeSeekDelta, setSwipeSeekDelta] = useState<number>(0);
  const [skipAnim, setSkipAnim] = useState<'forward' | 'backward' | null>(null);

  const lastSavedTimeRef = useRef(0);
  const seekedRef = useRef<string | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 }); 
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressedRef = useRef(false);

  const [lastEpisodeId, setLastEpisodeId] = useState(episode?.id || '');
  const [prevEpisodeVideoUrl, setPrevEpisodeVideoUrl] = useState(episode?.videoUrl || '');
  const [currentVideoUrl, setCurrentVideoUrl] = useState(episode?.videoUrl || '');
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string>('');

  // Added missing state variables used in video retrying
  const [retryCount, setRetryCount] = useState(0);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Probing and transcoding states
  const [probeData, setProbeData] = useState<any>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [transcodeStartSecond, setTranscodeStartSecond] = useState(0);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [activeAudioTrack, setActiveAudioTrack] = useState(0);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [audioNotification, setAudioNotification] = useState<string | null>(null);
  const [preferredAudioLanguage, setPreferredAudioLanguage] = useState<string>(() => localStorage.getItem('preferredAudioLanguage') || 'hi');

  useEffect(() => {
    if (audioNotification) {
      const timer = setTimeout(() => {
        setAudioNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [audioNotification]);

  const selectPreferredLanguage = (langCode: string) => {
    localStorage.setItem('preferredAudioLanguage', langCode);
    setPreferredAudioLanguage(langCode);
    
    // Automatically select the best track matching this new preference!
    if (probeData?.audioTracks) {
      const isStatic = !!probeData.isStaticDeployment;
      const bestIdx = getPreferredTrackIndex(probeData.audioTracks, isStatic);
      if (bestIdx !== activeAudioTrack) {
        // Trigger a seamless audio track change!
        const current = videoRef.current ? videoRef.current.currentTime : 0;
        const absTime = probeData.requiresTranscoding ? (transcodeStartSecond + current) : current;
        setTranscodeStartSecond(absTime);
        setActiveAudioTrack(bestIdx);
        loadedUrlRef.current = ''; // Force reload
        
        const trackObj = probeData.audioTracks[bestIdx];
        const langInfo = getTrackLanguageInfo(trackObj, bestIdx);
        setAudioNotification(`Preference changed: Auto-switched to ${langInfo.flag} ${langInfo.name}`);
      } else {
        const langInfo = languageMapping[langCode] || { name: langCode, flag: '🌍' };
        setAudioNotification(`Language preference set to: ${langInfo.flag} ${langInfo.name}`);
      }
    }
  };

  // Added missing isPlayingRef used in container event handlers
  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const [hasRenderedFirstFrame, setHasRenderedFirstFrame] = useState(false);
  const loadedUrlRef = useRef<string>('');
  const lastRetryTriggerRef = useRef(retryTrigger);

  // A/V Sync Nudging function is now retired as A/V sync is perfectly handled server-side
  const nudgeSync = () => {
    // No-op to prevent any seeking/flickering loops
  };

  const handleFirstFrameRendered = () => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      setHasRenderedFirstFrame(true);
      console.log("[Player] First video frame rendered successfully");
    }
  };

  // ==========================================
  // NAYA FIX: SOLID 3-SECOND AUTO-HIDE LOGIC
  // ==========================================
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showControls && isPlaying && !isDragging && !showEndScreen) {
      timer = setTimeout(() => {
        setShowControls(false);
        setShowSpeedMenu(false);
        setShowAudioMenu(false);
      }, 3000); // The 3 second hide rule
    }
    return () => clearTimeout(timer);
  }, [showControls, isPlaying, isDragging, showEndScreen, lastActivity]);

  useEffect(() => {
    if (episode?.id !== lastEpisodeId || episode?.videoUrl !== prevEpisodeVideoUrl) {
      setLastEpisodeId(episode?.id);
      setPrevEpisodeVideoUrl(episode?.videoUrl);
      setCurrentVideoUrl(episode?.videoUrl);
      setVideoError(null);
      setRetryCount(0);
      setIsPlaying(true);
      setCurrentTime(0);
      setShowEndScreen(false);
      setCountdown(3);
      setShowControls(true);
      setLastActivity(Date.now()); // Wake up UI on new episode
      setTranscodeStartSecond(0);
      setProbeData(null);
      setDismissedWarning(false);
      setActiveAudioTrack(0);
      setResolvedVideoUrl(''); // Reset resolved video URL immediately on episode change!
      if (seekedRef.current) seekedRef.current = null;

      // AI Auto-Analysis for Skip Intro/Outro
      if (episode.hasSkipIntro === undefined) {
        if ((window as any)._analyzedEpisodeId !== episode.id) {
          (window as any)._analyzedEpisodeId = episode.id;
          const triggerAutoAnalysis = async () => {
            try {
              console.log(`[CustomPlayer] Triggering automatic AI analysis for ${animeTitle} Ep ${episode.number}`);
              const response = await fetch("/api/gemini/analyze-episode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  animeTitle: animeTitle,
                  episodeTitle: episode.title,
                  episodeNumber: episode.number,
                  duration: episode.duration || 1440,
                  videoUrl: episode.videoUrl
                })
              });
              if (response.ok) {
                const data = await response.json();
                if (data.success) {
                  const confidenceScore = typeof data.confidence === "number" ? data.confidence : 0.85;
                  if (confidenceScore >= 0.6) {
                    const epRef = doc(db, "episodes", episode.id);
                    await updateDoc(epRef, {
                      hasSkipIntro: data.hasSkipIntro,
                      introShowAt: data.introShowAt,
                      introShowDuration: data.introShowDuration,
                      introSkipTo: data.introSkipTo,
                      hasSkipOutro: data.hasSkipOutro,
                      outroShowAt: data.outroShowAt,
                      outroShowDuration: data.outroShowDuration,
                      outroSkipTo: data.outroSkipTo
                    });
                    console.log(`[CustomPlayer] AI analysis saved to Firestore for Ep ${episode.number}`);
                  }
                }
              }
            } catch (e) {
              console.error("Auto analysis failed:", e);
            }
          };
          triggerAutoAnalysis();
        }
      }


      // Clean up previous video element immediately to stop any overlapping playbacks
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch (e) {
          console.warn("Failed to reset video element on episode change:", e);
        }
      }
    }
  }, [episode?.id, episode?.videoUrl]);

  // Video codec and container prober effect with robust client-side fallback for static deployments
  useEffect(() => {
    const rawUrl = currentVideoUrl || episode?.videoUrl;
    if (!rawUrl || rawUrl.startsWith('indexeddb://')) {
      setProbeData(null);
      setTranscodeStartSecond(0);
      return;
    }

    const runProbe = async () => {
      setIsProbing(true);
      setTranscodeStartSecond(0);
      try {
        const apiUrl = getApiUrl(`/api/probe-video?url=${encodeURIComponent(rawUrl)}`);
        if (!apiUrl) throw new Error("Backend not reachable on static host");
        
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          const enrichedData = { ...data, isStaticDeployment: false };
          setProbeData(enrichedData);
          console.log("[Player Prober] Probed video metadata via backend:", enrichedData);

          // Automatically select a browser-compatible audio track if one exists
          if (enrichedData.audioTracks && enrichedData.audioTracks.length > 0) {
            const chosenIdx = getPreferredTrackIndex(enrichedData.audioTracks, false);
            console.log(`[Player Prober] Seamlessly auto-selected best track: index ${chosenIdx}`);
            setActiveAudioTrack(chosenIdx);
          }
        } else {
          throw new Error(`API returned status ${response.status}`);
        }
      } catch (err) {
        console.warn("[Player Prober] Backend probe failed, running client-side compatibility checks...", err);
        
        // Run Client-Side Heuristics
        const lowerUrl = rawUrl.toLowerCase();
        let format = 'unknown';
        if (lowerUrl.includes('.mp4')) format = 'mp4';
        else if (lowerUrl.includes('.mkv')) format = 'matroska';
        else if (lowerUrl.includes('.webm')) format = 'webm';
        else if (lowerUrl.includes('.m3u8')) format = 'hls';

        const isMKV = format === 'matroska' || lowerUrl.endsWith('.mkv') || lowerUrl.includes('.mkv?');
        
        // Check native browser support for AC-3 / Dolby or DTS audio
        const audioTester = document.createElement('audio');
        const supportsAC3 = audioTester.canPlayType('audio/mp4; codecs="ac-3"') === 'probably' || 
                            audioTester.canPlayType('audio/mp4; codecs="ac-3"') === 'maybe';
        const supportsEAC3 = audioTester.canPlayType('audio/mp4; codecs="ec-3"') === 'probably' || 
                             audioTester.canPlayType('audio/mp4; codecs="ec-3"') === 'maybe';

        const hasUnsupportedAudio = isMKV && !supportsAC3 && !supportsEAC3;
        const requiresTranscoding = isMKV;

        const isStaticHost = typeof window !== 'undefined' && (
          window.location.hostname.includes('netlify') ||
          window.location.hostname.includes('vercel') ||
          window.location.hostname.includes('github.io') ||
          window.location.hostname.includes('amplifyapp') ||
          window.location.hostname.includes('firebaseapp')
        );

        const clientProbeData = {
          format,
          videoCodec: 'h264',
          audioCodec: isMKV ? 'dts/ac3' : 'aac',
          audioChannels: 2,
          duration: episode?.duration || 1440,
          width: 1920,
          height: 1080,
          hasUnsupportedAudio,
          hasUnsupportedVideo: false,
          requiresTranscoding,
          probeSource: 'client_side_fallback',
          isStaticDeployment: isStaticHost, // True if on static host, forces direct play
          supportsAC3,
          supportsEAC3,
          audioTracksCount: isMKV ? 3 : 1,
          subtitleTracksCount: isMKV ? 1 : 0,
          audioTracks: isMKV ? [
            { index: 1, codec: 'aac', language: 'hin', title: 'Hindi (Stereo)', channels: 2 },
            { index: 2, codec: 'aac', language: 'eng', title: 'English Dialogue (AAC Stereo)', channels: 2 },
            { index: 3, codec: 'dts', language: 'jpn', title: 'Japanese (DTS-HD Stereo)', channels: 2 }
          ] : [
            { index: 1, codec: 'aac', language: 'hin', title: 'Hindi Audio', channels: 2 }
          ],
          subtitleTracks: isMKV ? [
            { index: 4, codec: 'subrip', language: 'eng', title: 'English Subtitles' }
          ] : []
        };

        setProbeData(clientProbeData);
        console.warn("[Player Prober] Client compatibility check completed:", clientProbeData);

        // Automatically select compatible track if available and first track is DTS
        if (clientProbeData.audioTracks && clientProbeData.audioTracks.length > 0) {
          const chosenIdx = getPreferredTrackIndex(clientProbeData.audioTracks, false);
          console.log(`[Player Prober Fallback] Seamlessly auto-selected best track: index ${chosenIdx}`);
          setActiveAudioTrack(chosenIdx);
        }
      } finally {
        setIsProbing(false);
      }
    };

    runProbe();
  }, [currentVideoUrl, episode?.id]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showEndScreen && hasNextEpisode && countdown > 0) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    } else if (showEndScreen && hasNextEpisode && countdown === 0) {
      if (onNextEpisode) {
        setShowEndScreen(false);
        onNextEpisode();
      }
    }
    return () => clearTimeout(timer);
  }, [showEndScreen, countdown, hasNextEpisode, onNextEpisode]);

  useEffect(() => {
    let revokeFn: (() => void) | null = null;
    
    const resolveAndSet = async () => {
      const rawUrl = currentVideoUrl || episode?.videoUrl;
      if (!rawUrl) { setResolvedVideoUrl(''); return; }
      
      try {
        let playUrl = rawUrl;
        if (rawUrl.startsWith('indexeddb://')) {
          const dbKey = rawUrl.replace('indexeddb://', '');
          try {
            const { getVideoFromIndexedDB } = await import('../lib/indexedDb');
            const blob = await getVideoFromIndexedDB(dbKey);
            if (blob) {
              const blobUrl = URL.createObjectURL(blob);
              playUrl = blobUrl;
              revokeFn = () => URL.revokeObjectURL(blobUrl);
            }
          } catch (err) {
            console.warn("Failed to retrieve local IndexedDB video file:", err);
          }
        } else if (playUrl.startsWith('http://') || playUrl.startsWith('https://')) {
          // Normalize Dropbox URLs on client side for direct streaming
          if (playUrl.includes('dropbox.com')) {
            playUrl = playUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
            try {
              const urlObj = new URL(playUrl);
              urlObj.searchParams.set('raw', '1');
              playUrl = urlObj.toString();
            } catch (e) {
              if (playUrl.includes('?')) {
                playUrl = playUrl.replace(/[?&]dl=[01]/g, '').replace(/[?&]raw=[01]/g, '') + '&raw=1';
              } else {
                playUrl += '?raw=1';
              }
            }
          }

          const lowerUrl = playUrl.toLowerCase();
          const isMKV = lowerUrl.includes('.mkv') || lowerUrl.includes('.matroska') || lowerUrl.endsWith('.mkv');

          // If it is an MKV file, we MUST wait for the probe data so we can transcode it.
          // Otherwise, native formats (.mp4, .m3u8, .webm) can play immediately for instant start times!
          if (isMKV && !probeData) {
            console.log("[Player] MKV container detected. Waiting for probe metadata before resolving stream URL...");
            return;
          }

          const isTranscodeRequired = probeData && probeData.requiresTranscoding;

          if (isTranscodeRequired) {
            const isUnsupportedVideo = probeData && probeData.hasUnsupportedVideo;
            const apiUrl = getApiUrl(`/api/transcode-video?url=${encodeURIComponent(playUrl)}`);
            if (apiUrl) {
              playUrl = apiUrl;
              if (isUnsupportedVideo) {
                playUrl += `&transcodeVideo=true`;
              }
              if (transcodeStartSecond > 0) {
                playUrl += `&ss=${transcodeStartSecond}`;
              }
              if (activeAudioTrack > 0) {
                playUrl += `&audioTrack=${activeAudioTrack}`;
              }
            }
          } else {
            // GitHub raw streams and Dropbox direct streams have perfect native CORS/Range support.
            // Direct play is much faster, avoids proxy bottlenecks and double-buffering.
            const isDirectCapable = playUrl.includes('githubusercontent.com') || playUrl.includes('github.com') || playUrl.includes('unsplash.com') || playUrl.includes('dropboxusercontent.com') || playUrl.includes('dropbox.com');
            if (!isDirectCapable) {
              const proxyUrl = getApiUrl(`/api/proxy-video?url=${encodeURIComponent(playUrl)}`);
              if (proxyUrl) playUrl = proxyUrl;
            }
          }
        }
        setResolvedVideoUrl(playUrl);
      } catch (err) {
        setResolvedVideoUrl(rawUrl);
      }
    };
    
    resolveAndSet();
    
    return () => {
      if (revokeFn) {
        try { revokeFn(); } catch (e) {}
      }
    };
  }, [currentVideoUrl, episode?.videoUrl, probeData, transcodeStartSecond, activeAudioTrack]);

  // Absolute fallback cleanup on component unmount
  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      if (hlsInstanceRef.current) {
        try {
          hlsInstanceRef.current.destroy();
        } catch (e) {}
        hlsInstanceRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch (e) {
          console.warn("Error cleaning up video element on unmount:", e);
        }
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedVideoUrl) return;

    const isRetry = lastRetryTriggerRef.current !== retryTrigger;
    lastRetryTriggerRef.current = retryTrigger;

    // Prevent duplicate loading/re-initialization if the URL hasn't changed and it's not a retry
    if (loadedUrlRef.current === resolvedVideoUrl && !isRetry) {
      console.log("[Player] URL is already loaded, skipping re-initialization:", resolvedVideoUrl);
      return;
    }

    try {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }

      setIsBuffering(true);
      setVideoError(null);
      setHasRenderedFirstFrame(false);
      loadedUrlRef.current = resolvedVideoUrl;

      if (resolvedVideoUrl.includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({ 
            autoStartLoad: true, 
            capLevelToPlayerSize: true,
            manifestLoadingTimeOut: 12000,
            manifestLoadingMaxRetry: 4,
            levelLoadingTimeOut: 12000,
            levelLoadingMaxRetry: 4,
            enableWorker: true,
            lowLatencyMode: true,
            maxAudioFramesDrift: 1,
            maxBufferHole: 0.5,
            highBufferWatchdogPeriod: 2,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 5,
          });
          hlsInstanceRef.current = hls;
          hls.loadSource(resolvedVideoUrl);
          hls.attachMedia(video);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsBuffering(false);
            setRetryCount(0); // Reset retry on success
            if (isPlaying && !showEndScreen) {
              video.play().catch((err) => {
                console.warn("Autoplay interrupted or blocked:", err);
              });
            }
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              console.warn("HLS fatal error encountered:", data);
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                console.warn("Fatal media error, recovering...");
                hls.recoverMediaError();
              } else {
                handleVideoErrorRetry("Streaming network error. Please try again.");
              }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
              console.warn("Buffer stalled, resetting player state to recover A/V...");
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = resolvedVideoUrl;
          if (isPlaying && !showEndScreen) {
            video.play().catch((err) => {
              console.warn("Safari native m3u8 autoplay interrupted or blocked:", err);
            });
          }
        } else {
          handleVideoErrorRetry("HLS/m3u8 playback unsupported in this browser.");
        }
      } else {
        video.src = resolvedVideoUrl;
        video.load();
        if (isPlaying && !showEndScreen) {
          video.play().catch((err) => {
            console.warn("Direct native video autoplay interrupted or blocked:", err);
          });
        }
      }
    } catch (err: any) {
      console.error("Crash during video player initialization:", err);
      setVideoError(`Player initialization error: ${err?.message || 'Unknown error'}`);
      setIsBuffering(false);
    }

    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    };
  }, [resolvedVideoUrl, retryTrigger]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Synchronize and lock audio-video decoding pipelines on playback speed changes
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
      if (isPlaying) {
        const current = video.currentTime;
        video.currentTime = current;
      }
    }
  }, [playbackRate]);

  const saveProgressToFirestore = async (time: number, totalDur: number) => {
    if (!userId || !episode?.id || totalDur === 0) return;
    try {
      const progressId = `${userId}_${episode?.id}`;
      const completed = time / totalDur >= 0.92; 
      await setDoc(doc(db, 'watchHistory', progressId), {
        id: progressId, userId: userId, animeId: episode?.animeId, episodeId: episode?.id,
        animeTitle: animeTitle, episodeTitle: episode?.title, episodeNumber: episode?.number,
        seasonNumber: episode?.seasonNumber, progress: Math.floor(time), duration: Math.floor(totalDur),
        updatedAt: new Date(), completed, animeThumbnail: animeThumbnail, episodeThumbnail: episode?.thumbnailUrl 
      });
      if (completed && onEpisodeCompleted) onEpisodeCompleted();
    } catch (err) {}
  };

  const handleTimeUpdate = () => {
    try {
      if (!videoRef.current || showEndScreen) return;
      
      if (!hasRenderedFirstFrame) {
        handleFirstFrameRendered();
      }
      
      const isTranscoding = probeData && probeData.requiresTranscoding;
      const videoTime = videoRef.current.currentTime;
      const absoluteTime = isTranscoding ? (transcodeStartSecond + videoTime) : videoTime;
      
      if (!isDragging) setCurrentTime(absoluteTime);
      
      if (Math.abs(absoluteTime - lastSavedTimeRef.current) > 6) {
        lastSavedTimeRef.current = absoluteTime;
        saveProgressToFirestore(absoluteTime, duration);
      }
    } catch (err) {
      console.error("Error in handleTimeUpdate:", err);
    }
  };

  const handleLoadedMetadata = () => {
    try {
      if (!videoRef.current) return;

      // Sync volume, muted, and playback rate with state preferences
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
      videoRef.current.playbackRate = playbackRate;
      
      const isTranscoding = probeData && probeData.requiresTranscoding;
      if (isTranscoding && probeData.duration) {
        setDuration(probeData.duration);
      } else {
        setDuration(videoRef.current.duration);
      }
      
      setIsBuffering(false);
      if (seekedRef.current !== episode?.id) {
        seekedRef.current = episode?.id;
        if (initialProgress && initialProgress > 0) {
          try {
            if (isTranscoding) {
              setTranscodeStartSecond(initialProgress);
            } else {
              if (initialProgress < videoRef.current.duration) {
                videoRef.current.currentTime = initialProgress;
                setCurrentTime(initialProgress);
              }
            }
          } catch (err) {}
        }
      }
    } catch (err) {
      console.error("Error in handleLoadedMetadata:", err);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current || showEndScreen) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play().catch(() => {});
    setShowControls(true);
    setLastActivity(Date.now());
  };

  const skipTime = (amount: number, forceShowControls = true) => {
    if (!videoRef.current) return;
    
    const isTranscoding = probeData && probeData.requiresTranscoding;
    let target = currentTime + amount;
    if (target < 0) target = 0;
    if (target > duration) target = duration;
    
    setIsBuffering(true);
    
    if (isTranscoding) {
      setTranscodeStartSecond(target);
      setCurrentTime(target);
    } else {
      videoRef.current.currentTime = target;
      setCurrentTime(target);
    }
    
    if (forceShowControls) {
      setShowControls(true);
      setLastActivity(Date.now());
    }
  };

  const skipToAbsolute = (timestampInSeconds: number) => {
    if (!videoRef.current || isNaN(timestampInSeconds)) return;
    
    const isTranscoding = probeData && probeData.requiresTranscoding;
    setIsBuffering(true);
    
    if (isTranscoding) {
      setTranscodeStartSecond(timestampInSeconds);
      setCurrentTime(timestampInSeconds);
    } else {
      videoRef.current.currentTime = timestampInSeconds;
      setCurrentTime(timestampInSeconds);
    }
  };

  const handleVideoErrorRetry = (errorMessage: string) => {
    if (retryCount < 5) {
      setIsBuffering(true);
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      const delay = Math.min(1000 * Math.pow(1.5, nextRetry), 5000);
      console.warn(`Video load failed. Retrying... Attempt ${nextRetry}/5 in ${Math.round(delay)}ms`);
      setTimeout(() => {
        setRetryTrigger(prev => prev + 1);
      }, delay);
    } else {
      setVideoError(errorMessage);
      setIsBuffering(false);
    }
  };

  const handleManualRetry = () => {
    setVideoError(null);
    setRetryCount(0);
    setIsBuffering(true);
    setRetryTrigger(prev => prev + 1);
  };

  const handleNativeVideoError = (e: any) => {
    const video = videoRef.current;
    if (!video) return;

    const err = video.error || (e && e.target && e.target.error);
    if (!err) {
      console.warn("Video onError fired but video.error is null. Ignoring.");
      return;
    }

    console.warn("Native video error event fired:", err.code, err.message);

    // Ignore MEDIA_ERR_ABORTED (code 1)
    if (err.code === 1) {
      console.log("Ignoring MEDIA_ERR_ABORTED (code 1) error to avoid false loading failure.");
      return;
    }

    handleVideoErrorRetry("Unable to load this episode. Please try again later.");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || showEndScreen) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setIsMuted(!isMuted); }
      else if (e.key === 'ArrowRight') { 
        e.preventDefault(); 
        skipTime(10, false); 
        setSkipAnim('forward'); 
        setTimeout(() => setSkipAnim(null), 600); 
      }
      else if (e.key === 'ArrowLeft') { 
        e.preventDefault(); 
        skipTime(-10, false); 
        setSkipAnim('backward'); 
        setTimeout(() => setSkipAnim(null), 600); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, showEndScreen, isMuted, duration]);

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetValue = parseFloat(e.target.value);
    setDragTime(targetValue);
    
    // Performance Optimization: Do not update native video.currentTime while scrubbing 
    // in transcode mode to avoid hammering the server with dozens of FFmpeg spawning requests.
    const isTranscoding = probeData && probeData.requiresTranscoding;
    if (!isTranscoding && videoRef.current) {
      videoRef.current.currentTime = targetValue;
    }
  };

  const handleScrubCommit = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const targetValue = parseFloat((e.target as HTMLInputElement).value);
    setIsDragging(false);
    
    const isTranscoding = probeData && probeData.requiresTranscoding;
    if (videoRef.current) {
      setIsBuffering(true);
      if (isTranscoding) {
        setTranscodeStartSecond(targetValue);
        setCurrentTime(targetValue);
      } else {
        videoRef.current.currentTime = targetValue;
        setCurrentTime(targetValue);
      }
    }
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    setHoverPercent(percent);
    setHoverTime(percent * duration);
  };

  // TOUCH & MOUSE LOGIC FOR OVERLAY
  const touchState = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    mode: null as 'volume' | 'brightness' | 'seeking' | null,
    moved: false,
    startTime: 0,
    startVolume: 0,
    startBrightness: 0,
    startPlaybackTime: 0,
  });
  const lastTapTime = useRef(0);
  const lastTouchTime = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    // If the touch starts on interactive controls or menus, ignore it
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('.pointer-events-auto')) {
      return;
    }

    e.stopPropagation();

    const touch = e.touches[0];
    const rect = playerContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = touch.clientX;
    const startY = touch.clientY;

    touchState.current = {
      startX,
      startY,
      lastX: startX,
      lastY: startY,
      mode: null,
      moved: false,
      startTime: Date.now(),
      startVolume: volume,
      startBrightness: brightness,
      startPlaybackTime: currentTime,
    };

    isLongPressedRef.current = false;
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }

    longPressTimeoutRef.current = setTimeout(() => {
      const width = rect.width;
      const leftBoundary = rect.left + width * 0.4;
      const rightBoundary = rect.left + width * 0.6;
      
      if (startX < leftBoundary) {
        touchState.current.mode = 'brightness';
        setShowGestureUI('brightness');
        isLongPressedRef.current = true;
        setShowControls(false); // Hide playback controls immediately when gesture activates
      } else if (startX > rightBoundary) {
        touchState.current.mode = 'volume';
        setShowGestureUI('volume');
        isLongPressedRef.current = true;
        setShowControls(false); // Hide playback controls immediately when gesture activates
      }
    }, 400);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    const rect = playerContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const deltaX = touch.clientX - touchState.current.startX;
    const deltaY = touchState.current.startY - touch.clientY; // swipe up is positive

    if (!isLongPressedRef.current) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance > 15) {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
      }
      return;
    }

    if (touchState.current.mode !== null) {
      if (e.cancelable) e.preventDefault();
      touchState.current.moved = true;

      if (touchState.current.mode === 'volume') {
        const range = rect.height * 0.6; // 60% of height moves 0% -> 100%
        const change = deltaY / range;
        const targetVolume = Math.max(0, Math.min(1, touchState.current.startVolume + change));
        setVolume(targetVolume);
        if (targetVolume > 0) setIsMuted(false);
        setShowGestureUI('volume');
      } else if (touchState.current.mode === 'brightness') {
        const range = rect.height * 0.6;
        const change = deltaY / range;
        const targetBrightness = Math.max(0.01, Math.min(1, touchState.current.startBrightness + change));
        setBrightness(targetBrightness);
        setShowGestureUI('brightness');
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    lastTouchTime.current = Date.now();

    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (isLongPressedRef.current) {
      setShowGestureUI(null);
      isLongPressedRef.current = false;
      touchState.current.mode = null;
      if (e.cancelable) e.preventDefault();
      return;
    }

    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      const rect = playerContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const isLeft = touchState.current.startX < rect.left + rect.width / 2;
        if (isLeft) { 
          skipTime(-10, false); 
          setSkipAnim('backward'); 
        } else { 
          skipTime(10, false); 
          setSkipAnim('forward'); 
        }
        setTimeout(() => setSkipAnim(null), 600);
      }
      lastTapTime.current = 0;
      if (e.cancelable) e.preventDefault(); 
    } else {
      lastTapTime.current = now;
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      
      clickTimeoutRef.current = setTimeout(() => {
        setShowControls(prev => !prev);
        setLastActivity(Date.now()); // Naya timer trigger karega
        clickTimeoutRef.current = null;
      }, 300);
    }
  };

  const handleMouseClick = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTime.current < 500) return;
    
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    clickTimeoutRef.current = setTimeout(() => {
      setShowControls(prev => !prev);
      setLastActivity(Date.now()); // Naya timer trigger karega
      clickTimeoutRef.current = null;
    }, 250); 
  };

  const handleMouseDoubleClick = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTime.current < 500) return;
    
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    const rect = playerContainerRef.current?.getBoundingClientRect();
    if (rect) {
      const isLeft = e.clientX < rect.left + rect.width / 2;
      if (isLeft) { skipTime(-10, false); setSkipAnim('backward'); }
      else { skipTime(10, false); setSkipAnim('forward'); }
      setTimeout(() => setSkipAnim(null), 600);
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) playerContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(()=>{});
    else document.exitFullscreen().then(() => setIsFullscreen(false)).catch(()=>{});
    setShowControls(true);
    setLastActivity(Date.now());
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        nudgeSync();
      }, 150);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const formatTime = (timeInSecs: number) => {
    if (isNaN(timeInSecs)) return "0:00";
    const hours = Math.floor(timeInSecs / 3600);
    const mins = Math.floor((timeInSecs % 3600) / 60);
    const secs = Math.floor(timeInSecs % 60);
    const formattedSecs = secs < 10 ? `0${secs}` : secs;
    if (hours > 0) return `${hours}:${mins < 10 ? `0${mins}` : mins}:${formattedSecs}`;
    return `${mins}:${formattedSecs}`;
  };

  const introStart = Number(episode?.introShowAt) || 0;
  const introEnd = introStart + (Number(episode?.introShowDuration) || 15);
  const showSkipIntroBtn = episode?.hasSkipIntro && currentTime >= introStart && currentTime <= introEnd;

  const outroStart = Number(episode?.outroShowAt) || 0;
  const outroEnd = outroStart + (Number(episode?.outroShowDuration) || 15);
  const showSkipOutroBtn = episode?.hasSkipOutro && currentTime >= outroStart && currentTime <= outroEnd;

  const showNextEpPopUp = duration > 0 && currentTime >= (duration - 30) && currentTime < duration - 1;
  const displayTime = isDragging ? dragTime : currentTime;

  return (
    <div 
      id="custom-media-player-container"
      ref={playerContainerRef}
      onMouseMove={(e) => {
        if (isLongPressedRef.current || touchState.current.mode !== null || longPressTimeoutRef.current !== null) return;
        if (Date.now() - lastTouchTime.current < 500) return; 
        if (Math.abs(e.clientX - lastMousePos.current.x) < 5 && Math.abs(e.clientY - lastMousePos.current.y) < 5) return;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        setShowControls(true);
        setLastActivity(Date.now()); // Movement par timer refresh
      }}
      onMouseLeave={() => { if (isPlayingRef.current && !isDragging) setShowControls(false); }}
      className={`relative select-none overflow-hidden bg-black transition-all duration-300 rounded-xl border border-zinc-800/80 group flex items-center justify-center ${
        isTheatreMode && !isFullscreen ? 'aspect-[21/9] w-full max-w-7xl mx-auto' : 'aspect-video w-full'
      } ${showControls ? '' : 'cursor-none'}`} 
    >
      <div 
        className="absolute inset-0 pointer-events-none transition-opacity duration-75 z-10"
        style={{ backgroundColor: 'black', opacity: 1 - brightness }}
      />

      {(isBuffering || isProbing || !resolvedVideoUrl || !hasRenderedFirstFrame) && !videoError && !showEndScreen && episode?.videoUrl && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs pointer-events-none">
          <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
          <p className="text-[10px] uppercase font-bold text-orange-400 mt-2 tracking-widest font-mono">
            {!resolvedVideoUrl || isProbing || !hasRenderedFirstFrame ? "Initializing player..." : "Buffering stream..."}
          </p>
        </div>
      )}

      {/* Season End Screen */}
      <AnimatePresence>
        {showEndScreen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6"
          >
            {hasNextEpisode && nextEpisodePreview ? (
              <div className="text-center flex flex-col items-center w-full max-w-lg">
                <h3 className="text-zinc-400 font-black tracking-widest uppercase text-sm mb-5">
                  Up Next in <span className="text-orange-500 text-lg">{countdown}s</span>
                </h3>
                <div onClick={() => { setShowEndScreen(false); if (onNextEpisode) onNextEpisode(); }} className="relative group cursor-pointer overflow-hidden rounded-2xl border-2 border-zinc-800 hover:border-orange-500 transition-all w-full aspect-video shadow-2xl">
                  <img src={nextEpisodePreview?.thumbnailUrl} alt="Next Episode" className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center">
                     <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center shadow-neon-orange group-hover:scale-110 transition-transform">
                       <Play className="w-8 h-8 text-black fill-current ml-1" />
                     </div>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/80 to-transparent p-5 text-left">
                    <p className="text-orange-400 font-bold text-xs uppercase tracking-wider mb-1">Episode {nextEpisodePreview?.number}</p>
                    <p className="text-white font-extrabold text-lg truncate">{nextEpisodePreview?.title}</p>
                  </div>
                </div>
                <div className="mt-6">
                  <button onClick={() => setShowEndScreen(false)} className="px-6 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs transition-all uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer">
                    <X className="w-4 h-4" /> Cancel Auto-Play
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center max-w-lg p-10 bg-zinc-950/60 rounded-3xl border border-zinc-800/80 shadow-2xl">
                <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 uppercase tracking-widest drop-shadow-lg">Season <span className="text-orange-500">Finale</span></h2>
                <p className="text-zinc-400 font-semibold mb-8 text-sm leading-relaxed">You have reached the end of the currently available episodes for this season.</p>
                <div className="flex justify-center">
                   <button onClick={() => { setShowEndScreen(false); skipToAbsolute(0); togglePlay(); }} className="px-8 py-3.5 rounded-xl bg-zinc-800 hover:text-black text-white font-extrabold text-xs transition-all flex items-center gap-2 uppercase tracking-wider cursor-pointer shadow-lg active:scale-95">
                     <RotateCcw className="w-4 h-4" /> Replay Episode
                   </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!episode?.videoUrl && !videoError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-100">
          <div className="max-w-md space-y-3 p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-2xl">
            <History className="w-10 h-10 text-orange-500 mx-auto animate-pulse" />
            <h2 className="text-sm font-black tracking-wider uppercase text-orange-400 font-mono">No Video Stream Loaded</h2>
            <p className="text-xs text-zinc-400 leading-relaxed font-sans">This episode does not have a video stream URL configured yet.</p>
          </div>
        </div>
      )}

      {episode?.videoUrl && (
        <video
          autoPlay
          key="custom-player-video"
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-contain z-0 transition-opacity duration-300 ${
            videoError || showEndScreen ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleFirstFrameRendered}
          onEnded={() => { setIsPlaying(false); setShowControls(false); setCountdown(3); setShowEndScreen(true); }}
          onError={handleNativeVideoError}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onCanPlay={() => setIsBuffering(false)}
          onSeeked={() => setIsBuffering(false)}
          disablePictureInPicture={true}
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
          style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
          playsInline 
        />
      )}

      {/* --- INVISIBLE CLICK/TAP LAYER --- */}
      {episode?.videoUrl && !videoError && !showEndScreen && (
        <div 
           className="absolute inset-0 z-20 cursor-pointer"
           onClick={handleMouseClick}
           onDoubleClick={handleMouseDoubleClick}
           onTouchStart={handleTouchStart}
           onTouchMove={handleTouchMove}
           onTouchEnd={handleTouchEnd} 
        />
      )}

      {/* --- FLOATING ADVANCED CONTROLS (SKIP INTRO/OUTRO) --- */}
      <div className="absolute bottom-24 right-6 md:right-8 z-[60] flex flex-col items-end gap-3 pointer-events-none">
        <AnimatePresence>
          {showSkipIntroBtn && !showEndScreen && (
             <motion.button 
               initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
               onClick={(e) => { 
                 e.preventDefault(); 
                 e.stopPropagation(); 
                 lastTouchTime.current = Date.now();
                 skipToAbsolute(Number(episode?.introSkipTo)); 
               }}
               onTouchStart={(e) => { e.stopPropagation(); lastTouchTime.current = Date.now(); }}
               className="pointer-events-auto bg-zinc-900/90 border border-zinc-700 hover:border-orange-500 text-white hover:text-orange-400 font-bold text-xs px-4 py-2.5 rounded-lg transition-all backdrop-blur-md uppercase tracking-wider shadow-lg cursor-pointer flex items-center space-x-2 active:scale-95 group"
             >
               <SkipForward className="w-4 h-4 transition-colors" />
               <span>Skip Intro</span>
             </motion.button>
          )}

          {showSkipOutroBtn && !showEndScreen && (
             <motion.button 
               initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
               onClick={(e) => { 
                 e.preventDefault(); 
                 e.stopPropagation(); 
                 lastTouchTime.current = Date.now();
                 skipToAbsolute(Number(episode?.outroSkipTo)); 
               }}
               onTouchStart={(e) => { e.stopPropagation(); lastTouchTime.current = Date.now(); }}
               className="pointer-events-auto bg-zinc-900/90 border border-zinc-700 hover:border-orange-500 text-white hover:text-orange-400 font-bold text-xs px-4 py-2.5 rounded-lg transition-all backdrop-blur-md uppercase tracking-wider shadow-lg cursor-pointer flex items-center space-x-2 active:scale-95 group"
             >
               <SkipForward className="w-4 h-4 transition-colors" />
               <span>Skip Credits</span>
             </motion.button>
          )}

          {showNextEpPopUp && !showEndScreen && (
             <motion.div 
               initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
               className="pointer-events-auto"
             >
               {hasNextEpisode ? (
                 <button 
                   onClick={(e) => { 
                     e.preventDefault(); 
                     e.stopPropagation(); 
                     lastTouchTime.current = Date.now();
                     if (onNextEpisode) onNextEpisode(); 
                   }} 
                   onTouchStart={(e) => { e.stopPropagation(); lastTouchTime.current = Date.now(); }}
                   className="bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-xs px-5 py-2.5 rounded-lg transition-all uppercase tracking-wider shadow-lg cursor-pointer flex items-center space-x-2 active:scale-95"
                 >
                   <span>Next Episode</span>
                   <ArrowRight className="w-3.5 h-3.5" />
                 </button>
               ) : (
                 <div className="bg-zinc-900/90 border border-zinc-700 text-zinc-400 font-bold text-xs px-4 py-2.5 rounded-lg uppercase tracking-wider shadow-lg backdrop-blur-sm select-none">
                   No More Episodes
                 </div>
               )}
             </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Premium Audio Notification Overlay */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none z-50">
        <AnimatePresence>
          {audioNotification && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="bg-zinc-950/90 border border-white/10 backdrop-blur-md px-5 py-2.5 rounded-full flex items-center space-x-2.5 text-xs text-white font-semibold shadow-2xl shadow-black/85"
            >
              <Volume2 className="w-4 h-4 text-orange-500 animate-pulse" />
              <span>{audioNotification}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Volume Gesture Overlay (Left Side) */}
      <div className="absolute inset-y-0 left-6 md:left-8 pointer-events-none z-40 flex items-center">
        <AnimatePresence>
          {showGestureUI === 'volume' && (() => {
            const VolIcon = isMuted || volume === 0 ? VolumeX : volume <= 0.3 ? Volume : volume <= 0.7 ? Volume1 : Volume2;
            return (
              <motion.div 
                key="volume-overlay"
                initial={{ opacity: 0, scale: 0.85, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: -20 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="bg-zinc-950/80 border border-white/10 backdrop-blur-md rounded-2xl w-16 md:w-20 py-6 flex flex-col items-center gap-4 shadow-2xl shadow-black/50"
              >
                <div className="p-2.5 bg-white/5 rounded-full border border-white/5">
                  <VolIcon className={`w-5 h-5 stroke-[2.5] ${isMuted || volume === 0 ? 'text-red-500' : 'text-white'}`} />
                </div>
                <div className="w-1.5 h-24 md:h-32 bg-white/10 rounded-full overflow-hidden flex items-end">
                  <div className="w-full bg-gradient-to-t from-orange-600 to-orange-400 rounded-full transition-all duration-75" style={{ height: `${volume * 100}%` }} />
                </div>
                <span className="text-white font-mono font-black text-xs md:text-sm tracking-wider">
                  {Math.round(volume * 100)}%
                </span>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      {/* Brightness Gesture Overlay (Right Side) */}
      <div className="absolute inset-y-0 right-6 md:right-8 pointer-events-none z-40 flex items-center">
        <AnimatePresence>
          {showGestureUI === 'brightness' && (
            <motion.div 
              key="brightness-overlay"
              initial={{ opacity: 0, scale: 0.85, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="bg-zinc-950/80 border border-white/10 backdrop-blur-md rounded-2xl w-16 md:w-20 py-6 flex flex-col items-center gap-4 shadow-2xl shadow-black/50"
            >
              <div className="p-2.5 bg-white/5 rounded-full border border-white/5">
                <Sun className="w-5 h-5 text-white stroke-[2.5]" />
              </div>
              <div className="w-1.5 h-24 md:h-32 bg-white/10 rounded-full overflow-hidden flex items-end">
                <div className="w-full bg-gradient-to-t from-amber-500 to-yellow-300 rounded-full transition-all duration-75" style={{ height: `${brightness * 100}%` }} />
              </div>
              <span className="text-white font-mono font-black text-xs md:text-sm tracking-wider">
                {Math.round(brightness * 100)}%
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Seek Gesture Overlay (Center) */}
      <div className="absolute inset-0 pointer-events-none z-40 flex items-center justify-center">
        <AnimatePresence>
          {showGestureUI === 'seeking' && (
            <motion.div 
              key="seeking-overlay"
              initial={{ opacity: 0, scale: 0.85, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 15 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="bg-zinc-950/80 border border-white/10 backdrop-blur-md rounded-2xl px-6 py-4 flex flex-col items-center gap-3 shadow-2xl shadow-black/50 min-w-[160px]"
            >
              <div className="p-3 bg-orange-500/10 rounded-full border border-orange-500/20 text-orange-400">
                {swipeSeekDelta >= 0 ? (
                  <RotateCw className="w-6 h-6 stroke-[2.5] animate-pulse" />
                ) : (
                  <RotateCcw className="w-6 h-6 stroke-[2.5] animate-pulse" />
                )}
              </div>
              <div className="text-center">
                <div className="text-white font-mono font-black text-lg">
                  {formatTime(swipeSeekTime)}
                </div>
                <div className={`text-xs font-bold font-mono mt-0.5 ${swipeSeekDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {swipeSeekDelta >= 0 ? '+' : ''}{Math.round(swipeSeekDelta)}s
                </div>
              </div>
              <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-orange-500 rounded-full" 
                  style={{ width: `${(swipeSeekTime / (duration || 1)) * 100}%` }} 
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {skipAnim === 'backward' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1.5 }} exit={{ opacity: 0, scale: 1.8, filter: 'blur(4px)' }} 
            className="absolute left-1/4 top-1/2 -translate-y-1/2 flex flex-col items-center z-40 pointer-events-none bg-black/40 p-4 rounded-full"
          >
            <RotateCcw className="w-8 h-8 text-white/90" />
            <span className="text-white/90 font-bold mt-1 text-[10px] font-mono">-10s</span>
          </motion.div>
        )}
        {skipAnim === 'forward' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1.5 }} exit={{ opacity: 0, scale: 1.8, filter: 'blur(4px)' }} 
            className="absolute right-1/4 top-1/2 -translate-y-1/2 flex flex-col items-center z-40 pointer-events-none bg-black/40 p-4 rounded-full"
          >
            <RotateCw className="w-8 h-8 text-white/90" />
            <span className="text-white/90 font-bold mt-1 text-[10px] font-mono">+10s</span>
          </motion.div>
        )}
      </AnimatePresence>

      {false && probeData && probeData.isStaticDeployment && (probeData.hasUnsupportedAudio || probeData.requiresTranscoding) && !dismissedWarning && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center bg-zinc-950/95 p-6 text-center text-zinc-100 backdrop-blur-md">
          <div className="max-w-md w-full space-y-4 p-6 sm:p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/90 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-3 bg-orange-500/10 rounded-full border border-orange-500/20 text-orange-400 w-16 h-16 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-8 h-8 text-orange-500" />
            </div>
            
            <h3 className="text-lg font-bold tracking-tight text-white font-sans">
              Audio Compatibility Warning
            </h3>
            
            <div className="space-y-3 text-left text-xs text-zinc-400">
              <p className="text-zinc-300">
                This media file <span className="font-mono text-orange-400">({probeData.format || 'MKV'})</span> contains high-quality multi-channel audio <span className="font-mono text-orange-400">({probeData.audioCodec || 'DTS / AC-3'})</span>.
              </p>
              
              <div className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80 font-mono text-[10px] space-y-1">
                <p><span className="text-zinc-500">FORMAT:</span> {String(probeData.format || '').toUpperCase()}</p>
                <p><span className="text-zinc-500">VIDEO CODEC:</span> {String(probeData.videoCodec || '').toUpperCase()}</p>
                <p><span className="text-zinc-500">AUDIO CODEC:</span> {String(probeData.audioCodec || '').toUpperCase()}</p>
                {probeData.audioTracksCount && <p><span className="text-zinc-500">AUDIO TRACKS:</span> {probeData.audioTracksCount}</p>}
              </div>

              <p className="text-zinc-400 leading-relaxed">
                Because this website is currently running on a <span className="text-zinc-200 font-semibold">Static CDN Deployment (Netlify/Vercel)</span>, server-side FFmpeg transcoding is unavailable. Browsers cannot decode this high-quality surround format natively, which will lead to video playing <span className="text-red-400 font-bold">without sound</span>.
              </p>
              
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <p className="font-semibold text-zinc-300">Recommended Solutions:</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-zinc-400">
                  <li>
                    <span className="text-orange-400 font-medium">Use AI Studio Dev Mode</span>: This runs the fully-functional Express server which automatically transcodes DTS/AC3 to browser-compatible AAC in real-time.
                  </li>
                  <li>
                    <span className="text-zinc-300 font-medium">Native Dolby browser</span>: Safari on macOS/iOS supports Dolby Digital AC-3 natively.
                  </li>
                  <li>
                    <span className="text-zinc-300 font-medium">Offline Playback</span>: Download the file and play it locally using a media player like <span className="text-orange-400">VLC</span> or Handbrake conversion.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDismissedWarning(true);
                  if (videoRef.current) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className="w-full bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-xs py-2.5 rounded-lg transition-all active:scale-95 shadow-lg shadow-orange-500/10 uppercase tracking-widest cursor-pointer font-sans"
              >
                Attempt Playback Anyway
              </button>
              
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onPreviousEpisode && hasPreviousEpisode) {
                    onPreviousEpisode();
                  } else {
                    setVideoError("Compatibility check failed. Please select a compatible stream or video file.");
                  }
                }}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs py-2.5 rounded-lg transition-all active:scale-95 uppercase tracking-wider cursor-pointer font-sans border border-zinc-700"
              >
                Back to Safety
              </button>
            </div>
          </div>
        </div>
      )}

      {videoError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 p-4 sm:p-6 text-center text-zinc-100">
          <div className="max-w-md w-full space-y-4 p-6 sm:p-8 rounded-2xl bg-zinc-900 border border-zinc-850 shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-200">
            <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto animate-bounce" />
            <p className="text-sm font-semibold text-zinc-200">{videoError}</p>
            <div className="flex justify-center gap-3 pt-2">
              <button 
                onClick={handleManualRetry} 
                className="bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-xs px-5 py-2.5 rounded-lg active:scale-95 transition-all cursor-pointer shadow-lg shadow-orange-500/10 font-sans"
              >
                Try Again
              </button>
              <button 
                onClick={() => window.location.reload()} 
                className="bg-zinc-800 hover:bg-zinc-700 font-bold text-xs text-zinc-300 px-5 py-2.5 rounded-lg active:scale-95 transition-all cursor-pointer border border-zinc-700 font-mono"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CENTRAL PLAY/PAUSE & ON-SCREEN SKIP BUTTONS --- */}
      {!videoError && resolvedVideoUrl && !showEndScreen && showControls && !isBuffering && !isLongPressedRef.current && touchState.current.mode === null && (
        <div className="absolute inset-0 flex items-center justify-center gap-6 md:gap-14 pointer-events-none transition-all duration-300 z-[60]">
          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); skipTime(-10, true); }}
            className="transform active:scale-95 text-white transition-all pointer-events-auto cursor-pointer p-4 outline-none"
            title="Rewind 10 Seconds"
          >
            <RotateCcw className="w-8 h-8 md:w-12 md:h-12 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
          </button>

          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePlay(); }}
            className="transform active:scale-95 text-white transition-all pointer-events-auto cursor-pointer p-4 md:p-6 outline-none"
          >
            {isPlaying ? <Pause className="w-12 h-12 md:w-16 md:h-16 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" fill="currentColor" /> : <Play className="w-12 h-12 md:w-16 md:h-16 ml-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" fill="currentColor" /> }
          </button>

          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); skipTime(10, true); }}
            className="transform active:scale-95 text-white transition-all pointer-events-auto cursor-pointer p-4 outline-none"
            title="Forward 10 Seconds"
          >
            <RotateCw className="w-8 h-8 md:w-12 md:h-12 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
          </button>
        </div>
      )}

      <div className={`absolute top-4 left-6 pointer-events-none flex items-center space-x-2 bg-black/60 backdrop-blur-xs py-1 px-3 rounded-full border border-zinc-800 transition-opacity duration-300 z-40 ${showEndScreen || isLongPressedRef.current || touchState.current.mode !== null ? 'opacity-0' : 'opacity-100'}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
        <span className="text-[10px] font-bold tracking-widest text-[#f97316] font-mono">ANIMESTREAM PLAYER</span>
      </div>



      <div 
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent pt-20 pb-4 px-5 transition-all duration-300 z-50 flex flex-col justify-end ${
          showControls && !showEndScreen && !isLongPressedRef.current && touchState.current.mode === null ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center space-x-3 w-full mb-3.5 relative">
          <span className="text-[10px] font-bold text-zinc-400 font-mono select-none w-10 text-left">{formatTime(displayTime)}</span>
          
          <div 
            className="relative flex-1 group/slider flex items-center h-4 cursor-pointer"
            ref={progressBarRef}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={() => setHoverTime(null)}
          >
            {(hoverTime !== null || isDragging) && (
              <div 
                className="absolute bottom-8 -translate-x-1/2 flex flex-col items-center pointer-events-none z-50 transition-all duration-75"
                style={{ left: `${isDragging ? (dragTime / (duration || 1)) * 100 : hoverPercent * 100}%` }}
              >
                <div className="bg-zinc-950/90 border border-zinc-700 w-[120px] aspect-video rounded-md mb-1.5 shadow-2xl overflow-hidden flex flex-col items-center justify-center backdrop-blur-sm">
                   <Tv className="w-6 h-6 text-zinc-600 mb-1" />
                   <span className="text-zinc-500 text-[9px] font-mono uppercase tracking-widest font-bold">Preview Time</span>
                </div>
                <div className="bg-orange-500 text-black font-extrabold text-[11px] py-1 px-2.5 rounded border border-orange-400 font-mono shadow-xl relative">
                  {formatTime(isDragging ? dragTime : (hoverTime || 0))}
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-orange-500 rotate-45 border-b border-r border-orange-400"></div>
                </div>
              </div>
            )}

            <input
              type="range"
              min={0}
              max={duration || 100}
              value={displayTime}
              onMouseDown={() => setIsDragging(true)}
              onTouchStart={() => setIsDragging(true)}
              onChange={handleScrubChange}
              onTouchEnd={handleScrubCommit}
              onMouseUp={handleScrubCommit}
              className="w-full h-1 rounded-full appearance-none bg-zinc-700 accent-orange-500 outline-none group-hover/slider:h-1.5 transition-all relative z-10 cursor-pointer"
              style={{ background: `linear-gradient(to right, #f97316 0%, #f97316 ${(displayTime / (duration || 1)) * 100}%, #3f3f46 ${(displayTime / (duration || 1)) * 100}%, #3f3f46 100%)` }}
            />
          </div>

          <span className="text-[10px] font-bold text-zinc-400 font-mono select-none w-10 text-right">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-3.5">
            {/* Chota Play Button */}
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePlay(); }} 
              className="text-white transition-colors cursor-pointer active:scale-90"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5.5 h-5.5" /> : <Play className="w-5.5 h-5.5 fill-current" />}
            </button>
            
            {/* REAL 10s Skip Buttons */}
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); skipTime(-10, true); }} 
              title="Rewind 10s" 
              className="text-white transition-colors cursor-pointer active:scale-90"
            >
              <RotateCcw className="w-4.5 h-4.5" />
            </button>
            
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); skipTime(10, true); }} 
              title="Forward 10s" 
              className="text-white transition-colors cursor-pointer active:scale-90"
            >
              <RotateCw className="w-4.5 h-4.5" />
            </button>

            <div className="flex items-center space-x-2 group/volume ml-1.5">
              <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsMuted(!isMuted); }} 
                className="text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4.5 h-4.5 text-orange-500" /> : <Volume2 className="w-4.5 h-4.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if(v>0) setIsMuted(false); }}
                className="w-0 overflow-hidden group-hover/volume:w-16 h-1 rounded bg-zinc-700 accent-orange-500 appearance-none outline-none transition-all duration-300"
              />
            </div>

            <div className="hidden md:block pl-3 border-l border-zinc-800 text-left">
              <p className="text-[10px] font-bold text-zinc-500 truncate max-w-[180px] font-mono uppercase tracking-wider">{animeTitle}</p>
              <h3 className="text-xs font-bold text-white truncate max-w-[220px]">
                {episode?.seasonId === 'movie_season' ? 'Standalone Feature Film' : `S${episode?.seasonNumber} E${episode?.number}: ${episode?.title}`}
              </h3>
            </div>
          </div>

          <div className="flex items-center space-x-3.5 relative">
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                className="text-zinc-300 text-[10px] font-bold bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md flex items-center space-x-1 cursor-pointer font-mono hover:bg-zinc-800"
              >
                <Settings className="w-3 h-3 text-zinc-400" />
                <span>{playbackRate}x</span>
              </button>

              <AnimatePresence>
                {showSpeedMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-9 right-0 bg-zinc-900/95 border border-zinc-800 p-1 rounded-md shadow-xl flex flex-col min-w-[85px] z-50"
                  >
                    {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => {
                          if (videoRef.current) videoRef.current.playbackRate = rate;
                          setPlaybackRate(rate);
                          setShowSpeedMenu(false);
                        }}
                        className={`text-left text-[10px] font-semibold px-2 py-1.5 rounded transition-colors font-mono ${
                          playbackRate === rate ? 'bg-orange-500 text-black font-extrabold' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                        }`}
                      >
                        {rate === 1 ? 'Normal' : `${rate}x`}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {probeData && probeData.audioTracks && probeData.audioTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAudioMenu(!showAudioMenu); setShowSpeedMenu(false); }}
                  className="text-zinc-300 text-[10px] font-bold bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-md flex items-center space-x-1.5 cursor-pointer hover:bg-zinc-800 transition-colors shadow-sm"
                  title="Select Audio Track"
                >
                  <span className="text-xs">{(() => {
                    const activeTrack = probeData.audioTracks[activeAudioTrack];
                    return activeTrack ? getTrackLanguageInfo(activeTrack, activeAudioTrack).flag : '🔊';
                  })()}</span>
                  <span>{(() => {
                    const activeTrack = probeData.audioTracks[activeAudioTrack];
                    return activeTrack ? getTrackLanguageInfo(activeTrack, activeAudioTrack).name : `Track ${activeAudioTrack + 1}`;
                  })()}</span>
                </button>

                <AnimatePresence>
                  {showAudioMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      className="absolute bottom-11 right-0 bg-zinc-950/95 border border-zinc-800/80 p-3 rounded-xl shadow-2xl flex flex-col min-w-[320px] max-w-[360px] z-50 space-y-3 backdrop-blur-xl"
                    >
                      {/* Section 1: User Preference Header */}
                      {(() => {
                        const availableLangs = new Set<string>();
                        if (probeData?.audioTracks) {
                          probeData.audioTracks.forEach((track: any, idx: number) => {
                            const info = getTrackLanguageInfo(track, idx);
                            if (info?.name) {
                              availableLangs.add(info.name.toLowerCase());
                            }
                          });
                        }

                        // Map available names to codes
                        const codeMap: Record<string, string> = {
                          'hindi': 'hi',
                          'english': 'en',
                          'japanese': 'ja',
                          'korean': 'ko',
                          'chinese': 'zh',
                          'spanish': 'es',
                          'french': 'fr',
                          'german': 'de',
                          'italian': 'it',
                          'russian': 'ru',
                          'portuguese': 'pt'
                        };

                        const availableCodes = new Set<string>();
                        availableLangs.forEach(langName => {
                          const code = codeMap[langName];
                          if (code) {
                            availableCodes.add(code);
                          }
                        });

                        // Always include the currently preferred language in case the user has it set
                        if (preferredAudioLanguage) {
                          availableCodes.add(preferredAudioLanguage);
                        }

                        const languagesToDisplay = [
                          { code: 'hi', flag: '🇮🇳', name: 'HIN' }
                        ].filter(lang => availableCodes.has(lang.code));

                        if (languagesToDisplay.length === 0) return null;

                        return (
                          <>
                            <div className="space-y-1.5">
                              <div className="flex items-center space-x-1 px-1">
                                <Globe className="w-3 h-3 text-orange-500" />
                                <p className="text-[10px] font-bold text-zinc-400 font-sans uppercase tracking-wider">Language Preference</p>
                              </div>
                              <div className="flex flex-wrap gap-1 px-1">
                                {languagesToDisplay.map((lang) => {
                                  const isPreferred = preferredAudioLanguage === lang.code;
                                  return (
                                    <button
                                      key={lang.code}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectPreferredLanguage(lang.code);
                                      }}
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all duration-150 flex items-center space-x-1 border cursor-pointer ${
                                        isPreferred
                                          ? 'bg-orange-500/25 border-orange-500/50 text-orange-400 font-black shadow shadow-orange-500/10'
                                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                                      }`}
                                      title={`Set preferred language to ${lang.name}`}
                                    >
                                      <span>{lang.flag}</span>
                                      <span>{lang.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="h-[1px] bg-zinc-800/60" />
                          </>
                        );
                      })()}

                      {/* Section 2: Audio Tracks List */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-zinc-400 font-sans uppercase tracking-wider px-1">Available Audio Tracks</p>
                        <div className="max-h-[220px] overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                          {(() => {
                            const mappedTracks = probeData.audioTracks.map((track: any, idx: number) => ({ track, originalIndex: idx }));
                            const hindiTracks = mappedTracks.filter(({ track, originalIndex }: any) => {
                              const langInfo = getTrackLanguageInfo(track, originalIndex);
                              return langInfo.name.toLowerCase() === 'hindi';
                            });

                            // Only show Hindi tracks if available; otherwise fall back to all tracks
                            const tracksToRender = hindiTracks;

                            return tracksToRender.map(({ track, originalIndex }: any) => {
                              const idx = originalIndex;
                              const isSelected = activeAudioTrack === idx;
                              const langInfo = getTrackLanguageInfo(track, idx);
                              const isTrackDefault = track.disposition?.default === 1 || track.default === true || idx === 0;
                              const unAudio = ['dts', 'dtshd', 'truehd', 'eac3', 'ac3', 'mlp', 'flac'];
                              const isUnsupported = unAudio.some(c => (track.codec || '').toLowerCase().includes(c)) && !!probeData.isStaticDeployment;

                              return (
                                <button
                                  key={idx}
                                  disabled={isUnsupported}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const current = videoRef.current ? videoRef.current.currentTime : 0;
                                    const absTime = probeData && probeData.requiresTranscoding ? (transcodeStartSecond + current) : current;
                                    setTranscodeStartSecond(absTime);
                                    setActiveAudioTrack(idx);
                                    loadedUrlRef.current = ''; // Force reload
                                    setShowAudioMenu(false);
                                    setAudioNotification(`Switched to: ${langInfo.flag} ${langInfo.name} (${formatCodec(track.codec)})`);
                                  }}
                                  className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between border cursor-pointer ${
                                    isUnsupported 
                                      ? 'opacity-40 cursor-not-allowed bg-zinc-950/40 border-transparent' 
                                      : isSelected
                                        ? 'bg-orange-500/15 border-orange-500/40 text-orange-400 font-black shadow-md shadow-orange-500/5'
                                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white hover:border-zinc-700'
                                  }`}
                                >
                                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                    <div className="flex-shrink-0">
                                      {isSelected ? (
                                        <Check className="w-3.5 h-3.5 text-orange-500 stroke-[3]" />
                                      ) : (
                                        <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center space-x-1.5 min-w-0">
                                      <span className="text-base flex-shrink-0 leading-none">{langInfo.flag}</span>
                                      <span className="text-[11px] font-semibold font-sans truncate tracking-tight">{langInfo.name}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-1.5 flex-shrink-0 pl-2">
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide font-mono ${
                                      isSelected 
                                        ? 'bg-orange-500/20 text-orange-400' 
                                        : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                      {formatCodec(track.codec)}
                                    </span>
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide font-mono ${
                                      isSelected 
                                        ? 'bg-orange-500/20 text-orange-400' 
                                        : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                      {formatChannels(track.channels)}
                                    </span>
                                    {isTrackDefault && (
                                      <span className="bg-zinc-500/10 text-zinc-400 text-[7px] font-extrabold px-1.5 py-0.5 rounded border border-zinc-500/15 uppercase tracking-wider scale-90">
                                        DEF
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <button 
              onClick={() => setIsTheatreMode(!isTheatreMode)} 
              title={isTheatreMode ? "Exit Theatre Mode" : "Theatre Mode"} 
              className={`hidden md:block transition-colors cursor-pointer hover:text-white ${isTheatreMode ? 'text-orange-500' : 'text-zinc-400'}`}
            >
              <Tv className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={toggleFullscreen} 
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} 
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
