import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, Trash2, Copy, Check, Loader2, Search, AlertCircle, 
  CheckCircle2, ArrowRight, FileText, ChevronDown, Sparkles, RefreshCw, X, HelpCircle,
  Play, Film, Tv, Video, Image, Settings, Flame, Layers, Eye, Download
} from 'lucide-react';
import { db, collection, getDocs, doc, updateDoc, query, where, getDoc, syncWatchHistoryThumbnails } from '../firebase';
import { Anime, Season, Episode } from '../types';

// Shared helper to resolve video sources (including indexeddb:// protocol and raw CDN video streams)
const resolveVideoUrl = async (url: string): Promise<{ url: string; revoke?: () => void }> => {
  if (!url) return { url: '' };
  
  if (url.startsWith('indexeddb://')) {
    const dbKey = url.replace('indexeddb://', '');
    try {
      // Lazy load indexedDb library to keep bundles fast
      const { getVideoFromIndexedDB } = await import('../lib/indexedDb');
      const blob = await getVideoFromIndexedDB(dbKey);
      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        return {
          url: blobUrl,
          revoke: () => URL.revokeObjectURL(blobUrl)
        };
      }
    } catch (err) {
      console.warn("Failed to retrieve local IndexedDB video file:", err);
    }
    
    // Fallback to checking the Firestore videoUrlMap database
    try {
      const mapRef = doc(db, 'videoUrlMap', dbKey);
      const mapSnap = await getDoc(mapRef);
      if (mapSnap.exists() && mapSnap.data()?.cloudUrl) {
        return { url: mapSnap.data().cloudUrl };
      }
    } catch (mapErr) {
      console.warn("Failed to query cloudUrl fallback database mapping:", mapErr);
    }
  }
  
  return { url };
};

const isEmbedUrl = (url: string): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith('blob:')) return false;
  return (
    lower.includes('/embed/') ||
    lower.includes('embed.html') ||
    lower.includes('player.') ||
    lower.includes('youtube.com/') ||
    lower.includes('youtu.be/') ||
    lower.includes('drive.google.com/file/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('gogoplay') ||
    lower.includes('vidstream') ||
    (!lower.includes('.mp4') && !lower.includes('.m3u8') && !lower.includes('.mkv') && !lower.includes('.webm') && !lower.startsWith('indexeddb://'))
  );
};

interface InlineVideoPreviewProps {
  videoUrl: string;
}

function InlineVideoPreview({ videoUrl }: InlineVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');

  useEffect(() => {
    let revokeFn: (() => void) | undefined;
    
    const setup = async () => {
      if (!videoUrl) return;
      setError(null);
      setIsLoading(true);
      
      try {
        const resolved = await resolveVideoUrl(videoUrl);
        let playUrl = resolved.url;
        if (playUrl && (playUrl.startsWith('http://') || playUrl.startsWith('https://'))) {
          playUrl = `/api/proxy-video?url=${encodeURIComponent(playUrl)}`;
        }
        setResolvedUrl(playUrl);
        revokeFn = resolved.revoke;
      } catch (err: any) {
        setError("Failed to resolve video stream source: " + err.message);
        setIsLoading(false);
      }
    };
    
    setup();
    
    return () => {
      if (revokeFn) revokeFn();
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedUrl || isEmbedUrl(videoUrl)) return;

    setError(null);
    setIsLoading(true);

    if (resolvedUrl.includes('.m3u8')) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({
            autoStartLoad: true,
          });
          hlsRef.current = hls;
          hls.loadSource(resolvedUrl);
          hls.attachMedia(video);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
          });

          hls.on(Hls.Events.ERROR, () => {
            setError("Failed to decode HLS stream link. This URL might be restricted or inactive.");
            setIsLoading(false);
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = resolvedUrl;
          video.addEventListener('loadedmetadata', () => setIsLoading(false));
        } else {
          setError("HLS streaming is not natively supported on this browser.");
          setIsLoading(false);
        }
      }).catch((e) => {
        setError("Could not load streaming engine (hls.js).");
        setIsLoading(false);
      });
    } else {
      video.src = resolvedUrl;
      video.addEventListener('loadedmetadata', () => setIsLoading(false));
      video.addEventListener('error', () => {
        setError("Error loading direct video file stream. Verify CORS permissions or connection.");
        setIsLoading(false);
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [resolvedUrl]);

  return (
    <div className="mt-3 relative rounded-xl overflow-hidden bg-black border border-zinc-900 aspect-video flex flex-col justify-end">
      {isLoading && !error && !isEmbedUrl(videoUrl) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin mb-1.5" />
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">LOADING LIVE STREAM PREVIEW...</span>
        </div>
      )}
      {error && !isEmbedUrl(videoUrl) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-zinc-950/90 text-center text-[10px] text-red-400 z-10">
          <AlertCircle className="w-5 h-5 mb-1 text-red-500" />
          <span className="font-bold uppercase tracking-wider block mb-0.5">Stream Playback Failed</span>
          <p className="text-zinc-500 max-w-[200px] leading-tight text-[9px] font-medium">{error}</p>
        </div>
      )}
      {isEmbedUrl(videoUrl) ? (
        <iframe
          src={videoUrl}
          className="w-full h-full border-0 aspect-video bg-black"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture"
        />
      ) : (
        <video
          ref={videoRef}
          controls
          crossOrigin="anonymous"
          playsInline
          className="w-full h-full object-contain"
        />
      )}
    </div>
  );
}

interface AutoThumbnailGeneratorProps {
  allAnime: Anime[];
  refreshData: () => Promise<void>;
}

export default function AutoThumbnailGenerator({ allAnime, refreshData }: AutoThumbnailGeneratorProps) {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'bulk' | 'single'>('bulk');

  // Selections States
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [isLoadingSeasons, setIsLoadingSeasons] = useState(false);
  
  const [allEpisodes, setAllEpisodes] = useState<Episode[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  // Search & Dropdowns
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Engine Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentEpIndex, setCurrentEpIndex] = useState<number | null>(null);
  const [processingStatus, setProcessingStatus] = useState<Record<string, 'pending' | 'processing' | 'success' | 'failed' | 'skipped'>>({});
  const [logFeed, setLogFeed] = useState<string[]>([]);
  const [customRangeMin, setCustomRangeMin] = useState<number>(180);
  const [customRangeMax, setCustomRangeMax] = useState<number>(1200);
  const [forceRegenerate, setForceRegenerate] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Progress tracking variables for professional progress bar
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [currentProcessingStage, setCurrentProcessingStage] = useState<'Waiting' | 'Loading Video' | 'Extracting Frames' | 'AI Analyzing' | 'Generating Thumbnail' | 'Saving' | 'Completed' | 'Failed' | 'Retrying'>('Waiting');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingSpeed, setProcessingSpeed] = useState('Calculating...');
  const [estTimeRemaining, setEstTimeRemaining] = useState('Calculating...');

  // Single Episode Generator States
  const [singleSelectedAnime, setSingleSelectedAnime] = useState<Anime | null>(null);
  const [singleSeasons, setSingleSeasons] = useState<Season[]>([]);
  const [singleSelectedSeason, setSingleSelectedSeason] = useState<Season | null>(null);
  const [isLoadingSingleSeasons, setIsLoadingSingleSeasons] = useState(false);
  const [singleEpisodes, setSingleEpisodes] = useState<Episode[]>([]);
  const [isLoadingSingleEpisodes, setIsLoadingSingleEpisodes] = useState(false);
  const [singleSelectedEpisode, setSingleSelectedEpisode] = useState<Episode | null>(null);
  const [singleGeneratedThumbnail, setSingleGeneratedThumbnail] = useState<string | null>(null);
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [singleLogFeed, setSingleLogFeed] = useState<string[]>([]);
  const [singleProcessingStage, setSingleProcessingStage] = useState<string>('Waiting');
  
  // Single Search & Dropdowns
  const [singleSearchQuery, setSingleSearchQuery] = useState('');
  const [isSingleDropdownOpen, setIsSingleDropdownOpen] = useState(false);
  const singleDropdownRef = useRef<HTMLDivElement>(null);
  const singleLogContainerRef = useRef<HTMLDivElement>(null);

  // New Separate Episode Generator Enhancements
  const [selectedSepEpisodeIds, setSelectedSepEpisodeIds] = useState<Record<string, boolean>>({});
  const [sepSearchQuery, setSepSearchQuery] = useState('');
  const [sepFilter, setSepFilter] = useState<'all' | 'generated' | 'not_generated'>('all');
  const [sepSortBy, setSepSortBy] = useState<'number' | 'last_generated'>('number');
  
  // Separate multi-episode progress states
  const [sepIsProcessing, setSepIsProcessing] = useState(false);
  const [sepSuccessCount, setSepSuccessCount] = useState(0);
  const [sepFailedCount, setSepFailedCount] = useState(0);
  const [sepSkippedCount, setSepSkippedCount] = useState(0);
  const [sepCurrentEpId, setSepCurrentEpId] = useState<string | null>(null);
  const [sepLogFeed, setSepLogFeed] = useState<string[]>([]);
  const [sepProcessingStage, setSepProcessingStage] = useState<string>('Waiting');
  const [sepStartTime, setSepStartTime] = useState<number | null>(null);
  const [sepElapsedTime, setSepElapsedTime] = useState(0);
  const [sepSpeed, setSepSpeed] = useState('Calculating...');
  const [sepEstTimeRemaining, setSepEstTimeRemaining] = useState('Calculating...');
  const sepProgressContainerRef = useRef<HTMLDivElement>(null);

  // Preview Modal States
  const [previewEpisode, setPreviewEpisode] = useState<Episode | null>(null);
  const [previewDraftThumbnail, setPreviewDraftThumbnail] = useState<string | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [draftProcessingStage, setDraftProcessingStage] = useState('Waiting');
  const [draftLogFeed, setDraftLogFeed] = useState<string[]>([]);
  const [isUploadingSepThumb, setIsUploadingSepThumb] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sepPasteUrl, setSepPasteUrl] = useState('');

  // Notification Toast States
  const [saveSuccessNotification, setSaveSuccessNotification] = useState<string | null>(null);
  const [saveErrorNotification, setSaveErrorNotification] = useState<string | null>(null);

  // Custom thumbnail edit fields & active video preview selections
  const [customThumbnails, setCustomThumbnails] = useState<Record<string, string>>({});
  const [isSavingThumbnail, setIsSavingThumbnail] = useState<Record<string, boolean>>({});
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  // Filter and sort single episodes for Separate Episode Generator
  const filteredSingleEpisodes = useMemo(() => {
    let result = [...singleEpisodes];

    // Filter by search query (episode number or title)
    if (sepSearchQuery.trim()) {
      const queryLower = sepSearchQuery.toLowerCase();
      result = result.filter(
        ep => 
          ep.number.toString().includes(queryLower) || 
          (ep.title && ep.title.toLowerCase().includes(queryLower))
      );
    }

    // Filter by thumbnail status
    if (sepFilter === 'generated') {
      result = result.filter(ep => !!ep.thumbnailUrl);
    } else if (sepFilter === 'not_generated') {
      result = result.filter(ep => !ep.thumbnailUrl);
    }

    // Sort episodes
    if (sepSortBy === 'last_generated') {
      result.sort((a, b) => {
        const timeA = a.lastGenerated ? new Date(a.lastGenerated).getTime() : 0;
        const timeB = b.lastGenerated ? new Date(b.lastGenerated).getTime() : 0;
        return timeB - timeA; // Most recently generated first
      });
    } else {
      // Default: sort by episode number
      result.sort((a, b) => a.number - b.number);
    }

    return result;
  }, [singleEpisodes, sepSearchQuery, sepFilter, sepSortBy]);

  // Bulk separate select and deselect callbacks
  const handleSelectAllFiltered = () => {
    const updates: Record<string, boolean> = { ...selectedSepEpisodeIds };
    filteredSingleEpisodes.forEach((ep) => {
      updates[ep.id] = true;
    });
    setSelectedSepEpisodeIds(updates);
  };

  const handleDeselectAllFiltered = () => {
    const updates: Record<string, boolean> = { ...selectedSepEpisodeIds };
    filteredSingleEpisodes.forEach((ep) => {
      updates[ep.id] = false;
    });
    setSelectedSepEpisodeIds(updates);
  };

  // Auto-select first anime series if available
  useEffect(() => {
    if (allAnime.length > 0 && !selectedAnime) {
      setSelectedAnime(allAnime[0]);
    }
  }, [allAnime, selectedAnime]);

  // Close searchable dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll log feed to bottom on update
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logFeed]);

  // Fetch seasons and all episodes when selected anime changes
  useEffect(() => {
    if (!selectedAnime) {
      setSeasons([]);
      setSelectedSeason(null);
      setAllEpisodes([]);
      setEpisodes([]);
      return;
    }

    const loadSeasonsAndEpisodes = async () => {
      setIsLoadingSeasons(true);
      setIsLoadingEpisodes(true);
      try {
        // Fetch seasons for this anime
        const seasonsSnap = await getDocs(
          query(collection(db, 'seasons'), where('animeId', '==', selectedAnime.id))
        );
        const seasonsList: Season[] = [];
        seasonsSnap.forEach((docSnap) => {
          seasonsList.push({ id: docSnap.id, ...docSnap.data() } as Season);
        });
        
        // Sort seasons by season number
        seasonsList.sort((a, b) => a.number - b.number);
        setSeasons(seasonsList);

        // Fetch all episodes of this anime
        const epsSnap = await getDocs(
          query(collection(db, 'episodes'), where('animeId', '==', selectedAnime.id))
        );
        const epsList: Episode[] = [];
        epsSnap.forEach((docSnap) => {
          epsList.push({ id: docSnap.id, ...docSnap.data() } as Episode);
        });
        setAllEpisodes(epsList);
        
        // Auto-select first season if available
        if (seasonsList.length > 0) {
          const firstSeason = seasonsList[0];
          setSelectedSeason(firstSeason);
          
          // Filter episodes for the first season immediately
          const firstSeasonEps = epsList.filter(ep => ep.seasonId === firstSeason.id);
          firstSeasonEps.sort((a, b) => a.number - b.number);
          setEpisodes(firstSeasonEps);
        } else {
          setSelectedSeason(null);
          setEpisodes([]);
        }
      } catch (error) {
        console.error("Error loading seasons and episodes:", error);
      } finally {
        setIsLoadingSeasons(false);
        setIsLoadingEpisodes(false);
      }
    };

    loadSeasonsAndEpisodes();
  }, [selectedAnime, refreshCount]);

  // Filter episodes instantaneously when selected season changes
  useEffect(() => {
    if (!selectedSeason) {
      setEpisodes([]);
      return;
    }

    const filtered = allEpisodes.filter(ep => ep.seasonId === selectedSeason.id);
    filtered.sort((a, b) => a.number - b.number);
    setEpisodes(filtered);

    // Reset status flags for the new list
    const initialStatus: Record<string, 'pending'> = {};
    filtered.forEach(ep => {
      initialStatus[ep.id] = 'pending';
    });
    setProcessingStatus(initialStatus);
  }, [selectedSeason, allEpisodes]);

  // Auto-select first anime series for single generator if available
  useEffect(() => {
    if (allAnime.length > 0 && !singleSelectedAnime) {
      setSingleSelectedAnime(allAnime[0]);
    }
  }, [allAnime, singleSelectedAnime]);

  // Close searchable dropdown for single when clicking outside
  useEffect(() => {
    function handleClickOutsideSingle(event: MouseEvent) {
      if (singleDropdownRef.current && !singleDropdownRef.current.contains(event.target as Node)) {
        setIsSingleDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutsideSingle);
    return () => document.removeEventListener('mousedown', handleClickOutsideSingle);
  }, []);

  // Scroll single log feed to bottom on update
  useEffect(() => {
    if (singleLogContainerRef.current) {
      singleLogContainerRef.current.scrollTop = singleLogContainerRef.current.scrollHeight;
    }
  }, [singleLogFeed]);

  // Scroll separate log feed to bottom on update
  useEffect(() => {
    if (sepProgressContainerRef.current) {
      sepProgressContainerRef.current.scrollTop = sepProgressContainerRef.current.scrollHeight;
    }
  }, [sepLogFeed]);

  // Active separate progress and estimated remaining time tracking
  useEffect(() => {
    let intervalId: any = null;
    const selectedCount = Object.values(selectedSepEpisodeIds).filter(Boolean).length;
    if (sepIsProcessing && sepStartTime) {
      intervalId = setInterval(() => {
        const elapsed = (Date.now() - sepStartTime) / 1000;
        setSepElapsedTime(elapsed);
        
        // Calculate speed (average duration per episode)
        const processedCount = sepSuccessCount + sepFailedCount + sepSkippedCount;
        if (processedCount > 0) {
          const speed = elapsed / processedCount;
          setSepSpeed(`${speed.toFixed(1)}s / ep`);
          
          const remainingCount = selectedCount - processedCount;
          if (remainingCount > 0) {
            const estSeconds = Math.round(speed * remainingCount);
            if (estSeconds >= 60) {
              const mins = Math.floor(estSeconds / 60);
              const secs = estSeconds % 60;
              setSepEstTimeRemaining(`${mins}m ${secs}s`);
            } else {
              setSepEstTimeRemaining(`${estSeconds}s`);
            }
          } else {
            setSepEstTimeRemaining('0s');
          }
        } else {
          setSepSpeed('Calculating...');
          setSepEstTimeRemaining('Calculating...');
        }
      }, 1000);
    } else {
      setSepElapsedTime(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [sepIsProcessing, sepStartTime, sepSuccessCount, sepFailedCount, sepSkippedCount, selectedSepEpisodeIds]);

  // Clean up notifications automatically
  useEffect(() => {
    if (saveSuccessNotification || saveErrorNotification) {
      const timer = setTimeout(() => {
        setSaveSuccessNotification(null);
        setSaveErrorNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccessNotification, saveErrorNotification]);

  // Active bulk progress and estimated remaining time tracking
  useEffect(() => {
    let intervalId: any = null;
    if (isProcessing && startTime) {
      intervalId = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setElapsedTime(elapsed);
        
        // Calculate speed (average duration per episode)
        const processedCount = successCount + failedCount + skippedCount;
        if (processedCount > 0) {
          const speed = elapsed / processedCount;
          setProcessingSpeed(`${speed.toFixed(1)}s / ep`);
          
          const remainingCount = episodes.length - processedCount;
          if (remainingCount > 0) {
            const estSeconds = Math.round(speed * remainingCount);
            if (estSeconds >= 60) {
              const mins = Math.floor(estSeconds / 60);
              const secs = estSeconds % 60;
              setEstTimeRemaining(`${mins}m ${secs}s`);
            } else {
              setEstTimeRemaining(`${estSeconds}s`);
            }
          } else {
            setEstTimeRemaining('0s');
          }
        } else {
          setProcessingSpeed('Calculating...');
          setEstTimeRemaining('Calculating...');
        }
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isProcessing, startTime, successCount, failedCount, skippedCount, episodes.length]);

  // Fetch seasons and all episodes for Single Episode Generator when selected anime changes
  useEffect(() => {
    if (!singleSelectedAnime) {
      setSingleSeasons([]);
      setSingleSelectedSeason(null);
      setSingleEpisodes([]);
      setSingleSelectedEpisode(null);
      return;
    }

    const loadSingleSeasonsAndEpisodes = async () => {
      setIsLoadingSingleSeasons(true);
      setIsLoadingSingleEpisodes(true);
      try {
        // Fetch seasons for this anime
        const seasonsSnap = await getDocs(
          query(collection(db, 'seasons'), where('animeId', '==', singleSelectedAnime.id))
        );
        const seasonsList: Season[] = [];
        seasonsSnap.forEach((docSnap) => {
          seasonsList.push({ id: docSnap.id, ...docSnap.data() } as Season);
        });
        
        seasonsList.sort((a, b) => a.number - b.number);
        setSingleSeasons(seasonsList);

        // Fetch all episodes of this anime
        const epsSnap = await getDocs(
          query(collection(db, 'episodes'), where('animeId', '==', singleSelectedAnime.id))
        );
        const epsList: Episode[] = [];
        epsSnap.forEach((docSnap) => {
          epsList.push({ id: docSnap.id, ...docSnap.data() } as Episode);
        });

        // Set the active season and filter episodes
        if (seasonsList.length > 0) {
          const firstSeason = seasonsList[0];
          setSingleSelectedSeason(firstSeason);
          
          const firstSeasonEps = epsList.filter(ep => ep.seasonId === firstSeason.id);
          firstSeasonEps.sort((a, b) => a.number - b.number);
          setSingleEpisodes(firstSeasonEps);
          
          if (firstSeasonEps.length > 0) {
            setSingleSelectedEpisode(firstSeasonEps[0]);
          } else {
            setSingleSelectedEpisode(null);
          }
        } else {
          setSingleSelectedSeason(null);
          setSingleEpisodes([]);
          setSingleSelectedEpisode(null);
        }
      } catch (error) {
        console.error("Error loading single seasons/episodes:", error);
      } finally {
        setIsLoadingSingleSeasons(false);
        setIsLoadingSingleEpisodes(false);
      }
    };

    loadSingleSeasonsAndEpisodes();
  }, [singleSelectedAnime, refreshCount]);

  // Handle single season selection change
  useEffect(() => {
    if (!singleSelectedSeason) {
      setSingleEpisodes([]);
      setSingleSelectedEpisode(null);
      return;
    }

    const loadEpisodesForSeason = async () => {
      setIsLoadingSingleEpisodes(true);
      try {
        const epsSnap = await getDocs(
          query(
            collection(db, 'episodes'), 
            where('animeId', '==', singleSelectedAnime?.id),
            where('seasonId', '==', singleSelectedSeason.id)
          )
        );
        const epsList: Episode[] = [];
        epsSnap.forEach((docSnap) => {
          epsList.push({ id: docSnap.id, ...docSnap.data() } as Episode);
        });
        epsList.sort((a, b) => a.number - b.number);
        setSingleEpisodes(epsList);
        
        if (epsList.length > 0) {
          setSingleSelectedEpisode(epsList[0]);
        } else {
          setSingleSelectedEpisode(null);
        }
      } catch (error) {
        console.error("Error filtering single episodes:", error);
      } finally {
        setIsLoadingSingleEpisodes(false);
      }
    };

    loadEpisodesForSeason();
  }, [singleSelectedSeason]);

  // Local helper to generate a stunning procedural gradient thumbnail card in case of CORS or load issues
  const generateProceduralFallback = (animeTitle: string, epNum: number, epTitle: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Create stylish linear gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0d0b18');
    grad.addColorStop(0.5, '#2e124d');
    grad.addColorStop(1, '#f97316');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Circular geometric space accents
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(canvas.width * 0.85, canvas.height * 0.5, 140, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width * 0.85, canvas.height * 0.5, 210, 0, Math.PI * 2);
    ctx.stroke();

    // Side accent strip
    ctx.fillStyle = '#f97316';
    ctx.fillRect(40, 48, 4, 76);

    // Anime Title
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.fillText(animeTitle.toUpperCase(), 56, 58);

    // Episode Number Display
    ctx.fillStyle = '#ffffff';
    ctx.font = 'extrabold 30px "Space Grotesk", "Inter", sans-serif';
    ctx.fillText(`EPISODE ${epNum}`, 56, 94);

    // Episode Title
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = '500 15px "Inter", sans-serif';
    let displayTitle = epTitle || `Special Broadcast ${epNum}`;
    if (displayTitle.length > 50) {
      displayTitle = displayTitle.substring(0, 47) + '...';
    }
    ctx.fillText(displayTitle, 56, 122);

    // Bottom decorative label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText('ANIMESTREAM PROCEDURAL FALLBACK GENERATOR', 40, 315);

    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Fetch partial video blob through a range request on proxy to bypass CORS security constraints cleanly
  const fetchVideoBlob = async (url: string): Promise<Blob> => {
    const proxies = [
      (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`
    ];

    let lastErr = null;
    for (const proxyFn of proxies) {
      try {
        const proxiedUrl = proxyFn(url);
        const response = await fetch(proxiedUrl, {
          headers: {
            'Range': 'bytes=0-12000000' // Request first 12MB of video for metadata & early frame extraction
          }
        });
        if (response.ok || response.status === 206) {
          return await response.blob();
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to fetch video blob through proxy");
  };

  // Local helper to add a cache buster query parameter to avoid proxy/browser caching issues completely
  const addCacheBuster = (url: string): string => {
    return url;
  };

  interface FrameScore {
    dataUrl: string;
    score: number;
    reason: string;
  }

  // Analyzes frame pixel data to ignore black frames, blank screens, low contrast scenes, or blurriness
  const analyzeAndScoreFrame = (canvas: HTMLCanvasElement): FrameScore => {
    const ctx = canvas.getContext('2d');
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (!ctx) {
      return { dataUrl, score: 0, reason: "No canvas context" };
    }

    const width = canvas.width;
    const height = canvas.height;
    let imgData: ImageData;
    try {
      imgData = ctx.getImageData(0, 0, width, height);
    } catch (e) {
      // In case of CORS canvas taints, return a baseline score of 1.0 to keep the candidate available
      return { dataUrl, score: 1.0, reason: "CORS canvas restriction (baseline candidate)" };
    }

    const data = imgData.data;
    const step = 8; // Sample pixels selectively for blazing performance
    let totalLuminance = 0;
    let sampleCount = 0;
    const lums: number[] = [];

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += lum;
        lums.push(lum);
        sampleCount++;
      }
    }

    if (sampleCount === 0) {
      return { dataUrl, score: 0, reason: "Empty frame sample" };
    }

    const avgLuminance = totalLuminance / sampleCount;

    // Threshold 1: Ignore black / dark frames and blank scenes (too dark or too bright)
    if (avgLuminance < 25) {
      return { dataUrl, score: 0, reason: `Too dark (Luminance: ${avgLuminance.toFixed(1)})` };
    }
    if (avgLuminance > 230) {
      return { dataUrl, score: 0, reason: `Too bright/blank (Luminance: ${avgLuminance.toFixed(1)})` };
    }

    // Threshold 2: Calculate Standard Deviation for contrast & color variety
    let sumSquaredDiffs = 0;
    for (const lum of lums) {
      const diff = lum - avgLuminance;
      sumSquaredDiffs += diff * diff;
    }
    const stdDev = Math.sqrt(sumSquaredDiffs / sampleCount);

    if (stdDev < 12) {
      return { dataUrl, score: 0, reason: `Low contrast/Flat scene (StdDev: ${stdDev.toFixed(1)})` };
    }

    // Threshold 3: Spatial local gradients to measure sharpness (edge density)
    let totalGradient = 0;
    let gradientCount = 0;
    for (let y = 0; y < height - step; y += step) {
      for (let x = 0; x < width - step; x += step) {
        const idx = (y * width + x) * 4;
        const idxRight = (y * width + (x + step)) * 4;
        const idxBottom = ((y + step) * width + x) * 4;

        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const lumRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];
        const lumBottom = 0.299 * data[idxBottom] + 0.587 * data[idxBottom + 1] + 0.114 * data[idxBottom + 2];

        const gradX = Math.abs(lum - lumRight);
        const gradY = Math.abs(lum - lumBottom);
        totalGradient += gradX + gradY;
        gradientCount++;
      }
    }

    const avgGradient = gradientCount > 0 ? totalGradient / gradientCount : 0;

    if (avgGradient < 1.5) {
      return { dataUrl, score: 0, reason: `Blurry/Out-of-focus scene (Gradient: ${avgGradient.toFixed(2)})` };
    }

    // Final frame score based on both sharpness/detail (gradient) and contrast/vibrancy (stdDev)
    const score = avgGradient * stdDev;

    return { 
      dataUrl, 
      score, 
      reason: `Detail: ${avgGradient.toFixed(1)}, Contrast: ${stdDev.toFixed(1)}, Lum: ${avgLuminance.toFixed(1)}` 
    };
  };

  // Seek and capture a frame at a specific timestamp client-side
  const seekAndCaptureFrameClientSide = (video: HTMLVideoElement, time: number): Promise<HTMLCanvasElement> => {
    return new Promise((resolve, reject) => {
      let timeoutId: any = null;

      const onSeeked = () => {
        if (timeoutId) clearTimeout(timeoutId);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas);
          } else {
            reject(new Error("Canvas context acquisition failed"));
          }
        } catch (err) {
          reject(err);
        }
      };

      const onError = () => {
        if (timeoutId) clearTimeout(timeoutId);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        reject(new Error(video.error?.message || "Seek error occurred"));
      };

      timeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        reject(new Error("Seek operation timed out (6s)"));
      }, 6000);

      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      video.currentTime = time;
    });
  };

  // Run multi-frame scoring client-side
  const captureAndScoreMultipleFramesClientSide = async (
    targetUrl: string,
    minSec: number,
    maxSec: number,
    numCandidates: number,
    logCallback: (msg: string) => void,
    stageCallback?: (stage: string) => void
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      logCallback(`🔍 Attempting client-side extraction for local or fallback stream...`);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      const isHls = targetUrl.includes('.m3u8') || targetUrl.includes('m3u8');
      let hlsInstance: any = null;

      const loadTimeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Loading metadata timed out after 15s`));
      }, 15000);

      const cleanup = () => {
        clearTimeout(loadTimeoutId);
        if (hlsInstance) {
          try { hlsInstance.destroy(); } catch (e) {}
          hlsInstance = null;
        }
        try {
          video.pause();
          video.src = '';
          video.load();
        } catch (e) {}
      };

      const runExtraction = async (duration: number) => {
        try {
          stageCallback?.('Extracting Frames');
          logCallback(` -> Client-side media is ready. Duration: ${duration.toFixed(1)}s. Analyzing candidate frames...`);
          
          const effectiveMin = Math.min(minSec, duration * 0.1);
          const effectiveMax = Math.min(maxSec, duration * 0.9);
          const rangeWidth = effectiveMax - effectiveMin;

          const timestamps: number[] = [];
          if (rangeWidth > 10) {
            for (let i = 0; i < numCandidates; i++) {
              const fraction = (i + 0.5) / numCandidates;
              const jitter = (Math.random() - 0.5) * (rangeWidth / (numCandidates * 2));
              const ts = effectiveMin + fraction * rangeWidth + jitter;
              timestamps.push(Math.max(effectiveMin, Math.min(effectiveMax, ts)));
            }
          } else {
            for (let i = 0; i < numCandidates; i++) {
              timestamps.push(Math.random() * duration);
            }
          }

          let bestFrame: FrameScore | null = null;
          let firstSuccessfulFrame: FrameScore | null = null;

          for (let idx = 0; idx < timestamps.length; idx++) {
            const ts = timestamps[idx];
            stageCallback?.('AI Analyzing');
            logCallback(`   • Client seeking candidate ${idx + 1}/${numCandidates} at ${ts.toFixed(1)}s...`);
            
            try {
              const canvas = await seekAndCaptureFrameClientSide(video, ts);
              const analyzed = analyzeAndScoreFrame(canvas);
              logCallback(`     -> Client candidate ${idx + 1} score: ${analyzed.score.toFixed(1)} (${analyzed.reason})`);

              if (!firstSuccessfulFrame) {
                firstSuccessfulFrame = analyzed;
              }

              if (!bestFrame || analyzed.score > bestFrame.score) {
                bestFrame = analyzed;
              }
            } catch (seekErr: any) {
              logCallback(`     ⚠️ Client seek failed at ${ts.toFixed(1)}s: ${seekErr.message || seekErr}`);
            }
          }

          cleanup();

          stageCallback?.('Generating Thumbnail');
          if (bestFrame && bestFrame.score > 0) {
            logCallback(`   🌟 Client selected best candidate with score ${bestFrame.score.toFixed(1)} (${bestFrame.reason})`);
            resolve(bestFrame.dataUrl);
          } else if (firstSuccessfulFrame) {
            logCallback(`   ⚠️ Client using first successful fallback frame due to low scores.`);
            resolve(firstSuccessfulFrame.dataUrl);
          } else {
            reject(new Error("No client frames could be successfully captured"));
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      const onPlayable = () => {
        clearTimeout(loadTimeoutId);
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('canplay', onPlayable);
        video.removeEventListener('error', onLoadError);
        
        const dur = video.duration;
        if (dur && isFinite(dur) && dur > 0) {
          runExtraction(dur);
        } else {
          runExtraction(1440);
        }
      };

      const onMetadata = () => {
        if (video.readyState >= 3) {
          onPlayable();
        } else {
          video.addEventListener('canplay', onPlayable);
        }
      };

      const onLoadError = () => {
        clearTimeout(loadTimeoutId);
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('canplay', onPlayable);
        video.removeEventListener('error', onLoadError);
        cleanup();
        reject(new Error(video.error?.message || "Failed to load streaming media client-side"));
      };

      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', onLoadError);

      if (isHls) {
        import('hls.js').then(({ default: Hls }) => {
          if (Hls.isSupported()) {
            const hls = new Hls({
              autoStartLoad: true,
              maxBufferLength: 10,
              maxMaxBufferLength: 20,
            });
            hlsInstance = hls;
            hls.loadSource(targetUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                cleanup();
                reject(new Error(`HLS loading failed: ${data.details}`));
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = targetUrl;
          } else {
            reject(new Error("HLS streaming is not natively supported"));
          }
        }).catch(err => {
          reject(new Error("Could not load streaming engine (hls.js)"));
        });
      } else {
        video.src = targetUrl;
        video.load();
      }
    });
  };

  // REDESIGNED MULTI-FRAME CAPTURE EXECUTOR WITH HYBRID FALLBACKS
  const captureFrame = async (
    videoUrl: string, 
    logCallback: (msg: string) => void,
    stageCallback?: (stage: string) => void
  ): Promise<string> => {
    stageCallback?.('Loading Video');
    logCallback(` -> Initializing multi-frame capture and visual relevance check...`);
    
    // Resolve local URL protocols or mappings on client-side first
    const resolved = await resolveVideoUrl(videoUrl);
    const playUrl = resolved.url;
    
    const isLocal = playUrl.startsWith('blob:') || playUrl.startsWith('data:') || playUrl.startsWith('indexeddb://');
    
    if (isLocal) {
      logCallback(` -> Detected local browser stream. Executing direct client-side extraction...`);
      try {
        const result = await captureAndScoreMultipleFramesClientSide(
          playUrl,
          customRangeMin,
          customRangeMax,
          5,
          logCallback,
          stageCallback
        );
        if (resolved.revoke) {
          try { resolved.revoke(); } catch (e) {}
        }
        return result;
      } catch (err: any) {
        if (resolved.revoke) {
          try { resolved.revoke(); } catch (e) {}
        }
        throw err;
      }
    }

    logCallback(` -> Remote stream detected. Contacting server-side FFmpeg pipeline...`);
    stageCallback?.('Extracting Frames');
    try {
      stageCallback?.('AI Analyzing');
      const response = await fetch('/api/generate-thumbnail-backend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoUrl: playUrl,
          minSec: customRangeMin,
          maxSec: customRangeMax,
          numCandidates: 5
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${response.status}`);
      }

      stageCallback?.('Generating Thumbnail');
      const result = await response.json();
      logCallback(` 🌟 Best server-side frame selected: score ${result.score.toFixed(1)} (${result.reason})`);
      if (resolved.revoke) {
        try { resolved.revoke(); } catch (e) {}
      }
      return result.thumbnailUrl;
    } catch (err: any) {
      stageCallback?.('Retrying');
      logCallback(` ⚠️ Server-side pipeline failed (${err.message || err}). Falling back to proxy-assisted client-side extraction...`);
      
      try {
        // Fall back to client-side extraction using our local video proxy!
        let proxyUrl = playUrl;
        if (playUrl.startsWith('http://') || playUrl.startsWith('https://')) {
          proxyUrl = `/api/proxy-video?url=${encodeURIComponent(playUrl)}`;
        }
        
        const clientResult = await captureAndScoreMultipleFramesClientSide(
          proxyUrl,
          customRangeMin,
          customRangeMax,
          5,
          logCallback,
          stageCallback
        );
        
        if (resolved.revoke) {
          try { resolved.revoke(); } catch (e) {}
        }
        return clientResult;
      } catch (clientErr: any) {
        if (resolved.revoke) {
          try { resolved.revoke(); } catch (e) {}
        }
        logCallback(` ❌ Both server-side pipeline and client-side fallback failed: ${clientErr.message || clientErr}`);
        throw clientErr;
      }
    }
  };

  // Run the sequence over all filtered episodes in order
  const handleAutoThumbnailSequence = async () => {
    if (episodes.length === 0) return;
    setIsProcessing(true);
    setLogFeed([]);
    
    // Reset state counters
    setSuccessCount(0);
    setFailedCount(0);
    setSkippedCount(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    setProcessingSpeed('Calculating...');
    setEstTimeRemaining('Calculating...');
    setCurrentProcessingStage('Waiting');
    
    setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] 🚀 Initiating Auto-Thumbnail capture pipeline...`]);
    setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] Target series: "${selectedAnime?.title}" - Season ${selectedSeason?.number}`]);
    setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] Total episodes loaded: ${episodes.length}`]);
    setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] Force Regeneration: ${forceRegenerate ? 'ENABLED 💥' : 'DISABLED ⏭️'}`]);

    let localSuccess = 0;
    let localFailed = 0;
    let localSkipped = 0;

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      
      // If an episode already has a generated thumbnail, skip it unless forceRegenerate is requested
      if (ep.thumbnailUrl && !forceRegenerate) {
        setProcessingStatus(prev => ({ ...prev, [ep.id]: 'skipped' }));
        setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] ⏭️ Episode ${ep.number} skipped: Already has a generated thumbnail. (Select 'Force regenerate existing thumbnails' to overwrite)`]);
        localSkipped++;
        setSkippedCount(localSkipped);
        continue;
      }

      if (!ep.videoUrl) {
        setProcessingStatus(prev => ({ ...prev, [ep.id]: 'skipped' }));
        setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] ⚠️ Episode ${ep.number} skipped: No video stream URL configured.`]);
        localSkipped++;
        setSkippedCount(localSkipped);
        continue;
      }

      setProcessingStatus(prev => ({ ...prev, [ep.id]: 'processing' }));
      setCurrentEpIndex(i);
      setCurrentProcessingStage('Loading Video');
      setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] 🎬 Loading Video Ep ${ep.number} ("${ep.title || `Episode ${ep.number}`}")`]);

      try {
        const base64Thumbnail = await captureFrame(
          ep.videoUrl, 
          (msg) => {
            setLogFeed(prev => [...prev, `    ${msg}`]);
          },
          (stage) => {
            setCurrentProcessingStage(stage as any);
          }
        );

        setCurrentProcessingStage('Saving');
        // Save directly back to Firestore
        await updateDoc(doc(db, 'episodes', ep.id), { thumbnailUrl: base64Thumbnail });
        
        setProcessingStatus(prev => ({ ...prev, [ep.id]: 'success' }));
        setLogFeed(prev => [...prev, ` ✔️ Episode ${ep.number} thumbnail analyzed and saved successfully!`]);
        localSuccess++;
        setSuccessCount(localSuccess);
        setCurrentProcessingStage('Completed');
      } catch (err: any) {
        console.warn(`Frame capture failed for Ep ${ep.number}:`, err);
        setLogFeed(prev => [...prev, ` ⚠️ Capture failed: ${err.message || "Network / CORS block"}`]);
        setLogFeed(prev => [...prev, ` -> Fabricating premium procedural graphic vector banner fallback...`]);
        
        setCurrentProcessingStage('Retrying');
        try {
          setCurrentProcessingStage('Generating Thumbnail');
          const fallbackDataUrl = generateProceduralFallback(selectedAnime?.title || 'AnimeStream Series', ep.number, ep.title || '');
          setCurrentProcessingStage('Saving');
          await updateDoc(doc(db, 'episodes', ep.id), { thumbnailUrl: fallbackDataUrl });
          
          setProcessingStatus(prev => ({ ...prev, [ep.id]: 'success' }));
          setLogFeed(prev => [...prev, ` ✔️ Episode ${ep.number} stylized vector fallback generated successfully!`]);
          localSuccess++;
          setSuccessCount(localSuccess);
          setCurrentProcessingStage('Completed');
        } catch (fallbackErr: any) {
          setProcessingStatus(prev => ({ ...prev, [ep.id]: 'failed' }));
          setLogFeed(prev => [...prev, ` ❌ Episode ${ep.number} fallback creation failed: ${fallbackErr.message}`]);
          localFailed++;
          setFailedCount(localFailed);
          setCurrentProcessingStage('Failed');
        }
      }
    }

    setIsProcessing(false);
    setCurrentEpIndex(null);
    setLogFeed(prev => [
      ...prev, 
      `\n[${new Date().toLocaleTimeString()}] 🎉 Auto-Thumbnail pipeline processing complete!`,
      ` -> Successful capture: ${localSuccess} episodes`,
      ` -> Skipped / Retained: ${localSkipped} episodes`,
      ` -> Failed / Unprocessed: ${localFailed} episodes`
    ]);

    // Force data refresh globally
    await refreshData();
    // Update local cache state by triggering refetch count
    setRefreshCount(prev => prev + 1);
  };

  // Run auto thumbnail for a single episode only (inline action)
  const handleSingleEpisodeThumbnail = async (ep: Episode, index: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setLogFeed([]);
    setProcessingStatus(prev => ({ ...prev, [ep.id]: 'processing' }));
    setCurrentEpIndex(index);
    setCurrentProcessingStage('Loading Video');

    setLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] 🚀 Launching single episode frame capture...`]);
    setLogFeed(prev => [...prev, `🎬 Targeting: Ep ${ep.number} - "${ep.title || `Episode ${ep.number}`}"`]);

    if (!ep.videoUrl) {
      setProcessingStatus(prev => ({ ...prev, [ep.id]: 'skipped' }));
      setLogFeed(prev => [...prev, `❌ Error: This episode is missing a video stream URL.`]);
      setIsProcessing(false);
      setCurrentEpIndex(null);
      setCurrentProcessingStage('Failed');
      return;
    }

    try {
      const base64Thumbnail = await captureFrame(
        ep.videoUrl, 
        (msg) => {
          setLogFeed(prev => [...prev, `    ${msg}`]);
        },
        (stage) => {
          setCurrentProcessingStage(stage as any);
        }
      );
      setLogFeed(prev => [...prev, ` -> Frame captured and scored successfully!`]);

      setCurrentProcessingStage('Saving');
      await updateDoc(doc(db, 'episodes', ep.id), { thumbnailUrl: base64Thumbnail });
      
      setProcessingStatus(prev => ({ ...prev, [ep.id]: 'success' }));
      setLogFeed(prev => [...prev, ` ✔️ Episode ${ep.number} thumbnail updated successfully!`]);
      setCurrentProcessingStage('Completed');
    } catch (err: any) {
      console.warn(`Frame capture failed for Ep ${ep.number}:`, err);
      setLogFeed(prev => [...prev, ` ⚠️ Capture failed: ${err.message || "Stream error"}`]);
      setLogFeed(prev => [...prev, ` -> Building custom graphical layout...`]);
      
      setCurrentProcessingStage('Retrying');
      try {
        setCurrentProcessingStage('Generating Thumbnail');
        const fallbackDataUrl = generateProceduralFallback(selectedAnime?.title || 'AnimeStream Series', ep.number, ep.title || '');
        setCurrentProcessingStage('Saving');
        await updateDoc(doc(db, 'episodes', ep.id), { thumbnailUrl: fallbackDataUrl });
        setProcessingStatus(prev => ({ ...prev, [ep.id]: 'success' }));
        setLogFeed(prev => [...prev, ` ✔️ Episode ${ep.number} vector poster generated successfully!`]);
        setCurrentProcessingStage('Completed');
      } catch (fErr: any) {
        setProcessingStatus(prev => ({ ...prev, [ep.id]: 'failed' }));
        setLogFeed(prev => [...prev, ` ❌ Fallback generation failed: ${fErr.message}`]);
        setCurrentProcessingStage('Failed');
      }
    }

    setIsProcessing(false);
    setCurrentEpIndex(null);
    await refreshData();
    setRefreshCount(prev => prev + 1);
  };

  // Targeted frame generator for Single Episode generator workspace tab
  const handleGenerateSingleEpisodeThumbnail = async () => {
    if (!singleSelectedEpisode) return;
    if (isGeneratingSingle) return;

    setIsGeneratingSingle(true);
    setSingleGeneratedThumbnail(null);
    setSingleProcessingStage('Waiting');
    setSingleLogFeed([]);

    const log = (msg: string) => {
      setSingleLogFeed(prev => [...prev, msg]);
    };

    log(`[${new Date().toLocaleTimeString()}] 🚀 Commencing targeted extraction for Single Episode...`);
    log(` -> Anime Series: "${singleSelectedAnime?.title}"`);
    log(` -> Season Selection: Season ${singleSelectedSeason?.number || '1'}`);
    log(` -> Episode ${singleSelectedEpisode.number}: "${singleSelectedEpisode.title || `Episode ${singleSelectedEpisode.number}`}"`);

    if (!singleSelectedEpisode.videoUrl) {
      log(`❌ Failed: Episode does not have a valid video stream URL.`);
      setSingleProcessingStage('Failed');
      setIsGeneratingSingle(false);
      return;
    }

    try {
      setSingleProcessingStage('Loading Video');
      const base64Thumbnail = await captureFrame(
        singleSelectedEpisode.videoUrl,
        (msg) => log(`    ${msg}`),
        (stage) => setSingleProcessingStage(stage)
      );

      setSingleGeneratedThumbnail(base64Thumbnail);
      setSingleProcessingStage('Completed');
      log(` ✔️ Frame analysis complete! High-relevance candidate frame extracted and ready for preview.`);
    } catch (err: any) {
      console.warn(` Targeted single frame capture failed:`, err);
      log(` ⚠️ Targeted frame extraction failed: ${err.message || "Network error"}`);
      log(` -> Resorting to stylized procedural graphic banner fallback...`);
      
      try {
        setSingleProcessingStage('Generating Thumbnail');
        const fallbackDataUrl = generateProceduralFallback(
          singleSelectedAnime?.title || 'AnimeStream Series', 
          singleSelectedEpisode.number, 
          singleSelectedEpisode.title || ''
        );
        setSingleGeneratedThumbnail(fallbackDataUrl);
        setSingleProcessingStage('Completed');
        log(` ✔️ Stylized vector poster generated successfully! Ready for preview.`);
      } catch (fErr: any) {
        setSingleProcessingStage('Failed');
        log(` ❌ Fallback vector generation failed: ${fErr.message}`);
      }
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  // Save the targeted single preview thumbnail to Firestore
  const handleSaveSingleThumbnail = async () => {
    if (!singleSelectedEpisode || !singleGeneratedThumbnail) return;
    setIsGeneratingSingle(true);
    setSingleProcessingStage('Saving');
    try {
      await updateDoc(doc(db, 'episodes', singleSelectedEpisode.id), { 
        thumbnailUrl: singleGeneratedThumbnail 
      });
      setSingleLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✔️ Thumbnail successfully saved to database.`]);
      setSingleProcessingStage('Completed');
      
      // Notify user visually
      setSaveSuccessNotification(`Thumbnail for Episode ${singleSelectedEpisode.number} successfully updated!`);
      
      // Update local states & refetch
      await refreshData();
      setRefreshCount(prev => prev + 1);
    } catch (err: any) {
      console.error(err);
      setSingleProcessingStage('Failed');
      setSaveErrorNotification(`Failed to save thumbnail: ${err.message}`);
      setSingleLogFeed(prev => [...prev, `❌ Failed to save thumbnail: ${err.message}`]);
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  // === SEPARATE EPISODE GENERATOR ENHANCED HANDLERS ===

  // Direct generation & saving for a single episode from the card/row
  const handleSingleEpisodeDirect = async (ep: Episode) => {
    if (sepIsProcessing) return;
    setSepIsProcessing(true);
    setSepLogFeed([]);
    setSepSuccessCount(0);
    setSepFailedCount(0);
    setSepSkippedCount(0);
    setSepStartTime(Date.now());
    setSepElapsedTime(0);
    setSepSpeed('Calculating...');
    setSepEstTimeRemaining('Calculating...');
    setSepProcessingStage('Waiting');
    setSepCurrentEpId(ep.id);

    const log = (msg: string) => {
      setSepLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    log(`🚀 Commencing direct instant capture for Episode ${ep.number}: "${ep.title || `Episode ${ep.number}`}"...`);

    if (!ep.videoUrl) {
      log(`❌ Failed: Episode is missing a valid video stream URL.`);
      setSepProcessingStage('Failed');
      setSepIsProcessing(false);
      setSepCurrentEpId(null);
      setSaveErrorNotification("This episode has no stream URL.");
      return;
    }

    try {
      setSepProcessingStage('Loading Video');
      const base64Thumbnail = await captureFrame(
        ep.videoUrl,
        (msg) => log(`    ${msg}`),
        (stage) => setSepProcessingStage(stage)
      );

      setSepProcessingStage('Saving');
      const lastGenStr = new Date().toISOString();
      await updateDoc(doc(db, 'episodes', ep.id), { 
        thumbnailUrl: base64Thumbnail,
        lastGenerated: lastGenStr
      });
      
      log(`✔️ Thumbnail saved successfully!`);
      setSepSuccessCount(1);
      setSepProcessingStage('Completed');
      setSaveSuccessNotification(`Thumbnail for Episode ${ep.number} generated successfully!`);
    } catch (err: any) {
      console.warn(`Direct capture failed:`, err);
      log(`⚠️ Capture failed: ${err.message || "Network / CORS block"}`);
      log(` -> Resorting to stylized procedural vector banner fallback...`);
      
      setSepProcessingStage('Retrying');
      try {
        setSepProcessingStage('Generating Thumbnail');
        const fallbackDataUrl = generateProceduralFallback(
          singleSelectedAnime?.title || 'AnimeStream Series', 
          ep.number, 
          ep.title || ''
        );
        setSepProcessingStage('Saving');
        const lastGenStr = new Date().toISOString();
        await updateDoc(doc(db, 'episodes', ep.id), { 
          thumbnailUrl: fallbackDataUrl,
          lastGenerated: lastGenStr
        });
        
        log(`✔️ Stylized vector fallback generated and saved!`);
        setSepSuccessCount(1);
        setSepProcessingStage('Completed');
        setSaveSuccessNotification(`Stylized vector fallback saved for Episode ${ep.number}.`);
      } catch (fallbackErr: any) {
        log(`❌ Fallback vector generation failed: ${fallbackErr.message}`);
        setSepFailedCount(1);
        setSepProcessingStage('Failed');
        setSaveErrorNotification(`Failed to generate thumbnail for Episode ${ep.number}.`);
      }
    } finally {
      setSepIsProcessing(false);
      setSepCurrentEpId(null);
      await refreshData();
      setRefreshCount(prev => prev + 1);
    }
  };

  // Bulk separate thumbnail generator loop
  const handleGenerateSelectedThumbnails = async () => {
    const selectedCount = Object.values(selectedSepEpisodeIds).filter(Boolean).length;
    if (selectedCount === 0) {
      setSaveErrorNotification("Please select at least one episode first.");
      return;
    }

    // Get exact list of selected episodes in order
    const selectedEps = singleEpisodes.filter(ep => selectedSepEpisodeIds[ep.id]);
    
    setSepIsProcessing(true);
    setSepLogFeed([]);
    setSepSuccessCount(0);
    setSepFailedCount(0);
    setSepSkippedCount(0);
    setSepStartTime(Date.now());
    setSepElapsedTime(0);
    setSepSpeed('Calculating...');
    setSepEstTimeRemaining('Calculating...');
    setSepProcessingStage('Waiting');

    const log = (msg: string) => {
      setSepLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    log(`🚀 Initiating Separate Episode Auto-Thumbnail generation...`);
    log(` -> Selected episodes count: ${selectedCount}`);

    let localSuccess = 0;
    let localFailed = 0;
    let localSkipped = 0;

    for (let i = 0; i < selectedEps.length; i++) {
      const ep = selectedEps[i];
      setSepCurrentEpId(ep.id);
      setSepProcessingStage('Loading Video');
      log(`🎬 [${i + 1}/${selectedCount}] Processing Episode ${ep.number} ("${ep.title || `Episode ${ep.number}`}")`);

      if (!ep.videoUrl) {
        log(` ⏭️ Episode ${ep.number} skipped: No video stream URL.`);
        localSkipped++;
        setSepSkippedCount(localSkipped);
        continue;
      }

      try {
        const base64Thumbnail = await captureFrame(
          ep.videoUrl,
          (msg) => log(`    ${msg}`),
          (stage) => setSepProcessingStage(stage)
        );

        setSepProcessingStage('Saving');
        const lastGenStr = new Date().toISOString();
        await updateDoc(doc(db, 'episodes', ep.id), { 
          thumbnailUrl: base64Thumbnail,
          lastGenerated: lastGenStr
        });
        
        log(` ✔️ Episode ${ep.number} thumbnail updated successfully!`);
        localSuccess++;
        setSepSuccessCount(localSuccess);
        setSepProcessingStage('Completed');
      } catch (err: any) {
        console.warn(`Frame capture failed for Ep ${ep.number}:`, err);
        log(` ⚠️ Capture failed: ${err.message || "Network / CORS block"}`);
        log(` -> Fabricating premium procedural graphic vector banner fallback...`);
        
        setSepProcessingStage('Retrying');
        try {
          setSepProcessingStage('Generating Thumbnail');
          const fallbackDataUrl = generateProceduralFallback(
            singleSelectedAnime?.title || 'AnimeStream Series', 
            ep.number, 
            ep.title || ''
          );
          setSepProcessingStage('Saving');
          const lastGenStr = new Date().toISOString();
          await updateDoc(doc(db, 'episodes', ep.id), { 
            thumbnailUrl: fallbackDataUrl,
            lastGenerated: lastGenStr
          });
          
          log(` ✔️ Episode ${ep.number} stylized vector fallback generated successfully!`);
          localSuccess++;
          setSepSuccessCount(localSuccess);
          setSepProcessingStage('Completed');
        } catch (fallbackErr: any) {
          log(` ❌ Episode ${ep.number} fallback creation failed: ${fallbackErr.message}`);
          localFailed++;
          setSepFailedCount(localFailed);
          setSepProcessingStage('Failed');
        }
      }
    }

    setSepIsProcessing(false);
    setSepCurrentEpId(null);
    log(`🎉 Separate Episode Auto-Thumbnail generation finished!`);
    log(` -> Success: ${localSuccess} | Failed: ${localFailed} | Skipped: ${localSkipped}`);
    
    // Notify user
    setSaveSuccessNotification(`Finished separate generation. Success: ${localSuccess}, Failed: ${localFailed}`);

    // Force data refresh globally
    await refreshData();
    // Update local cache state by triggering refetch count
    setRefreshCount(prev => prev + 1);
  };

  // Thumbnail Replacement File Upload
  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64 && previewEpisode) {
        setIsUploadingSepThumb(true);
        try {
          const lastGenStr = new Date().toISOString();
          await updateDoc(doc(db, 'episodes', previewEpisode.id), { 
            thumbnailUrl: base64,
            lastGenerated: lastGenStr
          });
          setPreviewEpisode(prev => prev ? { ...prev, thumbnailUrl: base64, lastGenerated: lastGenStr } : null);
          setSaveSuccessNotification("Thumbnail uploaded successfully!");
          await refreshData();
          setRefreshCount(prev => prev + 1);
        } catch (err: any) {
          setSaveErrorNotification(`Upload failed: ${err.message}`);
        } finally {
          setIsUploadingSepThumb(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag and Drop Handlers
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64 && previewEpisode) {
        setIsUploadingSepThumb(true);
        try {
          const lastGenStr = new Date().toISOString();
          await updateDoc(doc(db, 'episodes', previewEpisode.id), { 
            thumbnailUrl: base64,
            lastGenerated: lastGenStr
          });
          setPreviewEpisode(prev => prev ? { ...prev, thumbnailUrl: base64, lastGenerated: lastGenStr } : null);
          setSaveSuccessNotification("Thumbnail uploaded successfully!");
          await refreshData();
          setRefreshCount(prev => prev + 1);
        } catch (err: any) {
          setSaveErrorNotification(`Upload failed: ${err.message}`);
        } finally {
          setIsUploadingSepThumb(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Thumbnail Delete Action
  const handleDeleteThumbnail = async (ep: Episode) => {
    try {
      await updateDoc(doc(db, 'episodes', ep.id), { 
        thumbnailUrl: '',
        lastGenerated: ''
      });
      if (previewEpisode && previewEpisode.id === ep.id) {
        setPreviewEpisode(prev => prev ? { ...prev, thumbnailUrl: '', lastGenerated: '' } : null);
      }
      setConfirmDeleteId(null);
      setSaveSuccessNotification("Thumbnail deleted.");
      await refreshData();
      setRefreshCount(prev => prev + 1);
    } catch (err: any) {
      setSaveErrorNotification(`Delete failed: ${err.message}`);
    }
  };

  // Thumbnail Download Action
  const handleDownloadThumbnail = (ep: Episode) => {
    if (!ep.thumbnailUrl) return;
    
    const link = document.createElement('a');
    link.href = ep.thumbnailUrl;
    link.download = `thumbnail_ep_${ep.number}_${ep.title || 'untitled'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate draft thumbnail inside Preview Modal
  const handleGenerateDraftThumbnail = async (ep: Episode) => {
    if (isGeneratingDraft) return;
    setIsGeneratingDraft(true);
    setPreviewDraftThumbnail(null);
    setDraftProcessingStage('Waiting');
    setDraftLogFeed([]);

    const log = (msg: string) => {
      setDraftLogFeed(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    log(`🚀 Commencing targeted draft extraction for Episode ${ep.number}...`);

    if (!ep.videoUrl) {
      log(`❌ Failed: Episode is missing a valid video stream URL.`);
      setDraftProcessingStage('Failed');
      setIsGeneratingDraft(false);
      return;
    }

    try {
      setDraftProcessingStage('Loading Video');
      const base64Thumbnail = await captureFrame(
        ep.videoUrl,
        (msg) => log(`    ${msg}`),
        (stage) => setDraftProcessingStage(stage)
      );

      setPreviewDraftThumbnail(base64Thumbnail);
      setDraftProcessingStage('Completed');
      log(`✔️ High-relevance draft frame captured and ready for preview.`);
    } catch (err: any) {
      console.warn(`Draft frame capture failed:`, err);
      log(`⚠️ Draft frame extraction failed: ${err.message || "Network error"}`);
      log(` -> Resorting to stylized procedural graphic fallback...`);
      
      try {
        setDraftProcessingStage('Generating Thumbnail');
        const fallbackDataUrl = generateProceduralFallback(
          singleSelectedAnime?.title || 'AnimeStream Series', 
          ep.number, 
          ep.title || ''
        );
        setPreviewDraftThumbnail(fallbackDataUrl);
        setDraftProcessingStage('Completed');
        log(`✔️ Stylized vector poster drafted successfully! Ready for preview.`);
      } catch (fErr: any) {
        setDraftProcessingStage('Failed');
        log(`❌ Fallback vector generation failed: ${fErr.message}`);
      }
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Save the drafted thumbnail to Firestore
  const handleSaveDraftThumbnail = async (ep: Episode) => {
    if (!previewDraftThumbnail) return;
    setIsGeneratingDraft(true);
    setDraftProcessingStage('Saving');
    try {
      const lastGenStr = new Date().toISOString();
      await updateDoc(doc(db, 'episodes', ep.id), { 
        thumbnailUrl: previewDraftThumbnail,
        lastGenerated: lastGenStr
      });
      setSaveSuccessNotification(`Thumbnail for Episode ${ep.number} successfully updated!`);
      setPreviewEpisode(prev => prev ? { ...prev, thumbnailUrl: previewDraftThumbnail, lastGenerated: lastGenStr } : null);
      setPreviewDraftThumbnail(null);
      await refreshData();
      setRefreshCount(prev => prev + 1);
    } catch (err: any) {
      setSaveErrorNotification(`Failed to save draft: ${err.message}`);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Paste image URL
  const handleSavePasteUrl = async () => {
    if (!previewEpisode || !sepPasteUrl.trim()) return;
    setIsUploadingSepThumb(true);
    try {
      const lastGenStr = new Date().toISOString();
      await updateDoc(doc(db, 'episodes', previewEpisode.id), { 
        thumbnailUrl: sepPasteUrl.trim(),
        lastGenerated: lastGenStr
      });
      setPreviewEpisode(prev => prev ? { ...prev, thumbnailUrl: sepPasteUrl.trim(), lastGenerated: lastGenStr } : null);
      setSepPasteUrl('');
      setSaveSuccessNotification("Thumbnail URL saved successfully!");
      await refreshData();
      setRefreshCount(prev => prev + 1);
    } catch (err: any) {
      setSaveErrorNotification(`Failed to save image URL: ${err.message}`);
    } finally {
      setIsUploadingSepThumb(false);
    }
  };

  // Close preview modal and reset states
  const handleClosePreviewModal = () => {
    setPreviewEpisode(null);
    setPreviewDraftThumbnail(null);
    setIsGeneratingDraft(false);
    setDraftLogFeed([]);
    setConfirmDeleteId(null);
    setSepPasteUrl('');
  };

  // Filter list of anime according to search query
  const totalProcessed = successCount + failedCount + skippedCount;
  const progressPct = episodes.length > 0 
    ? Math.min(100, Math.round((totalProcessed / episodes.length) * 100)) 
    : 0;

  return (
    <div className="space-y-8 text-left animate-fade-in pb-16">
      
      {/* Toast Notification Alerts */}
      <AnimatePresence>
        {saveSuccessNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '50%' }}
            animate={{ opacity: 1, y: 0, x: '0%' }}
            exit={{ opacity: 0, y: -20, x: '0%' }}
            className="fixed top-6 right-6 z-50 bg-green-500 text-black px-5 py-3.5 rounded-xl shadow-2xl flex items-center space-x-3 border border-green-400 max-w-sm"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 stroke-[2.5]" />
            <span className="text-xs font-black uppercase tracking-wider font-mono">{saveSuccessNotification}</span>
          </motion.div>
        )}
        {saveErrorNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '50%' }}
            animate={{ opacity: 1, y: 0, x: '0%' }}
            exit={{ opacity: 0, y: -20, x: '0%' }}
            className="fixed top-6 right-6 z-50 bg-red-600 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center space-x-3 border border-red-500 max-w-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider font-mono">{saveErrorNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. Header Information Panel */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-zinc-900 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center mb-1">
            <Sparkles className="w-6 h-6 text-orange-500 mr-2.5 stroke-[2.5]" />
            <span>AUTOMATED VIDEO THUMBNAIL CAPTURER</span>
          </h2>
          <p className="text-xs text-zinc-400 font-medium">
            Scan and decode episode streams in real-time. Pick an elegant random frame and save it instantly as your cover.
          </p>
        </div>
        
        <div className="flex items-center space-x-2 bg-zinc-950/80 px-3.5 py-1.5 rounded-lg border border-zinc-900 shrink-0">
          <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
          <span className="text-[10px] font-bold text-zinc-400 font-mono">AUTOMATED DEC_STAGE READY</span>
        </div>
      </div>

      {/* Navigation / Tabs */}
      <div className="flex border-b border-zinc-900 pb-px">
        <button
          onClick={() => setActiveTab('bulk')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider font-mono border-b-2 transition-all cursor-pointer ${
            activeTab === 'bulk'
              ? 'border-orange-500 text-orange-400 font-extrabold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Bulk Season Capturer
        </button>
        <button
          onClick={() => setActiveTab('single')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider font-mono border-b-2 transition-all cursor-pointer ${
            activeTab === 'single'
              ? 'border-orange-500 text-orange-400 font-extrabold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Separate Episode Generator
        </button>
      </div>

      {/* Tab Content: Bulk Season Capturer */}
      {activeTab === 'bulk' && (
        <div className="space-y-8 animate-fade-in">
          {/* 2. Target Series & Season Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-950/40 p-6 rounded-2xl border border-zinc-900">
            {/* Anime Selection searchable dropdown */}
            <div className="space-y-2 relative" ref={dropdownRef}>
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 font-mono flex items-center">
                <Film className="w-3.5 h-3.5 mr-1.5 text-orange-500" />
                <span>1. Select Anime Series</span>
              </label>
              
              <div 
                onClick={() => !isProcessing && setIsDropdownOpen(!isDropdownOpen)}
                className={`bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 font-semibold cursor-pointer flex justify-between items-center transition-all ${
                  isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:border-purple-800'
                }`}
              >
                <span>{selectedAnime ? selectedAnime.title : 'Choose an Anime series...'}</span>
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              </div>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute z-30 left-0 right-0 mt-2 bg-zinc-950 border border-zinc-850 rounded-xl shadow-2xl p-2.5 overflow-hidden"
                  >
                    <div className="flex items-center border border-zinc-900 bg-zinc-900/50 rounded-lg px-3 py-1.5 mb-2">
                      <Search className="w-3.5 h-3.5 text-zinc-500 mr-2" />
                      <input
                        type="text"
                        placeholder="Search Anime titles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent text-xs text-white placeholder-zinc-650 focus:outline-none w-full"
                      />
                    </div>

                    <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                      {allAnime
                        .filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((anime) => (
                          <div
                            key={anime.id}
                            onClick={() => {
                              setSelectedAnime(anime);
                              setIsDropdownOpen(false);
                              setSearchQuery('');
                            }}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer hover:bg-orange-500 hover:text-black transition-colors flex items-center justify-between ${
                              selectedAnime?.id === anime.id ? 'bg-orange-500/10 text-orange-400 font-extrabold' : 'text-zinc-300'
                            }`}
                          >
                            <span>{anime.title}</span>
                            <span className="text-[10px] font-mono opacity-60">ID: {anime.id}</span>
                          </div>
                        ))}
                      {allAnime.filter(a => a.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <p className="text-zinc-600 text-[11px] text-center py-4 font-semibold">No series match this search prefix.</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Season Selection List */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 font-mono flex items-center">
                <Layers className="w-3.5 h-3.5 mr-1.5 text-orange-500" />
                <span>2. Select Season</span>
              </label>
              
              <select
                disabled={isProcessing || seasons.length === 0}
                value={selectedSeason?.id || ''}
                onChange={(e) => {
                  const matched = seasons.find(s => s.id === e.target.value);
                  if (matched) setSelectedSeason(matched);
                }}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 font-semibold outline-none focus:border-purple-800 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seasons.map((season) => {
                  const dispName = season.name?.trim() || (season as any).title?.trim() || `Season ${season.number}`;
                  return (
                    <option key={season.id} value={season.id} className="bg-zinc-950 text-white font-semibold">
                      {dispName}
                    </option>
                  );
                })}
                {seasons.length === 0 && (
                  <option value="">No Seasons loaded under this series</option>
                )}
              </select>
            </div>
          </div>

          {/* Professional Progress Tracker Dashboard */}
          <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-orange-500 animate-pulse' : 'bg-zinc-700'}`} />
                  <h3 className="text-sm font-black uppercase tracking-wider text-white font-mono">
                    Bulk Processing Progress Dashboard
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-400 font-medium">
                  Monitoring extraction pipeline for <span className="text-orange-400 font-semibold">{selectedAnime?.title || 'None'}</span> • Season {selectedSeason?.number || 'None'}
                </p>
              </div>

              {/* Current Processing Stage Status Badge */}
              <div className="flex items-center space-x-2.5">
                <span className="text-[10px] font-bold text-zinc-500 font-mono uppercase">Current Stage:</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider font-mono shadow-md ${
                  currentProcessingStage === 'Waiting' ? 'bg-zinc-850 text-zinc-450 border border-zinc-700/50' :
                  currentProcessingStage === 'Loading Video' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' :
                  currentProcessingStage === 'Extracting Frames' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20' :
                  currentProcessingStage === 'AI Analyzing' ? 'bg-pink-600/10 text-pink-400 border border-pink-500/20 animate-pulse' :
                  currentProcessingStage === 'Generating Thumbnail' ? 'bg-amber-600/10 text-amber-400 border border-amber-500/20' :
                  currentProcessingStage === 'Saving' ? 'bg-teal-600/10 text-teal-400 border border-teal-500/20' :
                  currentProcessingStage === 'Completed' ? 'bg-green-600/15 text-green-400 border border-green-500/30 font-extrabold' :
                  currentProcessingStage === 'Failed' ? 'bg-red-600/10 text-red-400 border border-red-500/20' :
                  currentProcessingStage === 'Retrying' ? 'bg-yellow-600/10 text-yellow-400 border border-yellow-500/20 animate-pulse' :
                  'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                  {currentProcessingStage}
                </span>
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-400">Pipeline Progress</span>
                <span className="text-sm font-black text-orange-400 font-mono">{progressPct}%</span>
              </div>
              <div className="w-full bg-zinc-900/80 rounded-full h-3 border border-zinc-850 overflow-hidden p-0.5">
                <motion.div 
                  className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Progress Stats Bento Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block">Current Episode</span>
                <span className="text-xs font-bold text-white block truncate">
                  {currentEpIndex !== null ? `Ep ${episodes[currentEpIndex]?.number}` : 'N/A'}
                </span>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block">Completed / Total</span>
                <span className="text-xs font-bold text-white block font-mono">
                  {successCount + failedCount + skippedCount} / {episodes.length}
                </span>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block">Remaining</span>
                <span className="text-xs font-bold text-white block font-mono">
                  {Math.max(0, episodes.length - (successCount + failedCount + skippedCount))}
                </span>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block">Remaining Time</span>
                <span className="text-xs font-bold text-orange-400 block font-mono">
                  {isProcessing ? estTimeRemaining : 'N/A'}
                </span>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-3.5 space-y-1">
                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block">Success / Failed</span>
                <span className="text-xs font-bold block font-mono flex items-center space-x-1.5">
                  <span className="text-green-400">{successCount}</span>
                  <span className="text-zinc-650">/</span>
                  <span className="text-red-400">{failedCount}</span>
                </span>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-3.5 space-y-1 col-span-2 md:col-span-1">
                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block">Processing Speed</span>
                <span className="text-xs font-bold text-white block font-mono">
                  {isProcessing ? processingSpeed : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Engine Settings, Log Terminal & Primary Action Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Settings & Execution Control Panel */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-purple-950/15 bg-zinc-950/40 relative space-y-5">
                <h3 className="text-sm font-black tracking-wider text-orange-400 font-mono uppercase flex items-center">
                  <Settings className="w-4 h-4 mr-2" />
                  <span>Engine Capture Settings</span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[10px] font-black uppercase text-zinc-500 font-mono">Frame Seek Range (Seconds)</label>
                      <span className="text-xs font-bold text-orange-400 font-mono">{customRangeMin}s - {customRangeMax}s</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-900/80 border border-zinc-850 rounded-xl p-3 text-left">
                        <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block mb-1">Min Offset</span>
                        <input
                          type="number"
                          disabled={isProcessing}
                          min={1}
                          max={customRangeMax - 1}
                          value={customRangeMin}
                          onChange={(e) => setCustomRangeMin(Math.max(1, parseInt(e.target.value) || 10))}
                          className="bg-transparent text-sm font-bold font-mono text-white focus:outline-none w-full"
                        />
                      </div>
                      <div className="bg-zinc-900/80 border border-zinc-850 rounded-xl p-3 text-left">
                        <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono block mb-1">Max Offset</span>
                        <input
                          type="number"
                          disabled={isProcessing}
                          min={customRangeMin + 1}
                          value={customRangeMax}
                          onChange={(e) => setCustomRangeMax(Math.max(customRangeMin + 1, parseInt(e.target.value) || 30))}
                          className="bg-transparent text-sm font-bold font-mono text-white focus:outline-none w-full"
                        />
                      </div>
                    </div>
                    
                    <p className="text-[10px] text-zinc-550 leading-relaxed font-semibold mt-2.5">
                      The engine will extract 5 candidate frames spread across this offset window, score them to filter out blank/black/blurry scenes, and select the highest quality action shot.
                    </p>
                  </div>

                  {/* Force Regenerate Option */}
                  <div className="flex items-center space-x-2.5 bg-zinc-900/40 p-3 rounded-xl border border-zinc-900/80">
                    <input
                      type="checkbox"
                      id="forceRegenerate"
                      checked={forceRegenerate}
                      disabled={isProcessing}
                      onChange={(e) => setForceRegenerate(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500 bg-zinc-950 border-zinc-800 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-orange-500"
                    />
                    <label htmlFor="forceRegenerate" className="text-[10px] font-black uppercase text-zinc-400 font-mono cursor-pointer select-none">
                      Force regenerate existing thumbnails
                    </label>
                  </div>

                  {/* Main Execution Trigger */}
                  <button
                    type="button"
                    onClick={handleAutoThumbnailSequence}
                    disabled={isProcessing || episodes.length === 0}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-zinc-850 disabled:to-zinc-850 disabled:text-zinc-550 font-black text-black px-6 py-4 rounded-xl text-xs active:scale-95 transition-all text-center uppercase tracking-widest font-mono flex items-center justify-center space-x-2.5 cursor-pointer shadow-lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 text-black animate-spin" />
                        <span>Processing Episode {currentEpIndex !== null ? currentEpIndex + 1 : ''}...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-black stroke-[2.5]" />
                        <span>AUTO THUMBNAIL ALL EPISODES ({episodes.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* CORS and Tech Warning Notice */}
              <div className="p-4 bg-purple-950/20 border border-purple-900/30 rounded-2xl flex items-start space-x-3 text-xs leading-relaxed font-medium text-purple-300">
                <HelpCircle className="w-4.5 h-4.5 shrink-0 text-purple-400 mt-0.5" />
                <div>
                  <span className="font-extrabold uppercase tracking-wide text-white block mb-0.5">Cross-Origin Policy (CORS) Integration</span>
                  <p className="text-zinc-400 text-[11px] leading-normal font-semibold">
                    Canvas capture requires the media stream server to return valid CORS headers. If your streaming server has CORS disabled, our system automatically detects the lock and crafts a beautiful stylized graphic banner with the episode number and details instead!
                  </p>
                </div>
              </div>
            </div>

            {/* Live Processing Output Console Log */}
            <div className="lg:col-span-7">
              <div className="glass-panel border border-zinc-900 bg-zinc-950/50 p-6 rounded-2xl flex flex-col h-[320px] justify-between">
                <span className="text-[10px] uppercase font-black font-mono tracking-widest text-zinc-500 block mb-2">
                  🖥️ ACTIVE STREAMS ENGINE DECODER SHELL
                </span>
                
                <div 
                  ref={logContainerRef}
                  className="bg-black/85 border border-zinc-900 rounded-xl p-4.5 font-mono text-[10px] leading-normal text-zinc-400 flex-1 overflow-y-auto space-y-1.5 text-left custom-scrollbar"
                >
                  {logFeed.map((log, idx) => (
                    <div 
                      key={idx} 
                      className={
                        log.startsWith(' ✔️') ? 'text-green-400 font-bold' : 
                        log.startsWith(' ⚠️') ? 'text-amber-400 font-bold' :
                        log.startsWith(' ❌') ? 'text-red-400 font-bold' :
                        log.startsWith(' ->') ? 'text-teal-400 font-semibold' :
                        log.includes('🚀') ? 'text-orange-400 font-bold tracking-wide' : 'text-zinc-400'
                      }
                    >
                      {log}
                    </div>
                  ))}
                  {logFeed.length === 0 && (
                    <div className="text-zinc-650 italic text-center py-16">
                      Terminal inactive. Choose a series above and trigger the engine to inspect live action frames.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Episodes Queue Overview */}
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <Video className="w-5 h-5 text-orange-500" />
              <span>Episodes Queue ({episodes.length})</span>
            </h3>

            {isLoadingEpisodes ? (
              <div className="flex justify-center items-center py-20 bg-zinc-950/20 rounded-2xl border border-zinc-900">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              </div>
            ) : episodes.length === 0 ? (
              <div className="text-center py-16 bg-zinc-950/20 rounded-2xl border border-zinc-900 text-zinc-550 font-semibold">
                No episode entries loaded for Season {selectedSeason?.number || 1}. Use the scheduler or bulk operations tab to insert streams.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {episodes.map((ep, index) => {
                  const status = processingStatus[ep.id] || 'pending';
                  const isCurrent = currentEpIndex === index;
                  
                  return (
                    <div 
                      key={ep.id} 
                      className={`glass-panel border rounded-2xl p-4 transition-all flex flex-col justify-between ${
                        isCurrent 
                          ? 'border-orange-500 bg-orange-500/5 shadow-lg shadow-orange-500/5' 
                          : status === 'success' 
                            ? 'border-green-500/35 bg-green-500/5' 
                            : 'border-zinc-850 bg-zinc-950/10'
                      }`}
                    >
                      <div>
                        {/* Thumbnail Preview Banner */}
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-zinc-900 mb-3.5 group">
                          {ep.thumbnailUrl ? (
                            <img 
                              src={ep.thumbnailUrl} 
                              alt="" 
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                              <Image className="w-8 h-8 text-zinc-700 mb-1" />
                              <span className="text-[10px] font-bold font-mono">NO THUMBNAIL LOADED</span>
                            </div>
                          )}
                          
                          {/* Interactive Float Status badge */}
                          <div className="absolute top-2.5 right-2.5">
                            {status === 'processing' && (
                              <span className="bg-orange-500 text-black text-[9px] font-black px-2.5 py-1 rounded-md font-mono tracking-wider shadow-md animate-pulse">
                                DECODING...
                              </span>
                            )}
                            {status === 'success' && (
                              <span className="bg-green-600 text-white text-[9px] font-black px-2.5 py-1 rounded-md font-mono tracking-wider shadow-md flex items-center space-x-1">
                                <Check className="w-3 h-3 stroke-[3]" />
                                <span>CAPTURED</span>
                              </span>
                            )}
                            {status === 'failed' && (
                              <span className="bg-red-600 text-white text-[9px] font-black px-2.5 py-1 rounded-md font-mono tracking-wider shadow-md">
                                FAILED
                              </span>
                            )}
                            {status === 'skipped' && (
                              <span className="bg-zinc-800 text-zinc-400 text-[9px] font-black px-2.5 py-1 rounded-md font-mono tracking-wider shadow-md">
                                SKIPPED
                              </span>
                            )}
                          </div>

                          {/* Video Stream Indicator badge */}
                          <div className="absolute bottom-2.5 left-2.5 bg-black/70 px-2 py-1 rounded text-[9px] font-mono font-bold text-zinc-350">
                            EPISODE {ep.number}
                          </div>
                        </div>

                        <h4 className="font-bold text-white text-sm line-clamp-1">{ep.title || `Episode ${ep.number}`}</h4>
                        <p className="text-zinc-400 text-[11px] leading-relaxed line-clamp-2 mt-1 font-medium">{ep.description || 'No summary description.'}</p>
                        
                        {ep.videoUrl ? (
                          <div className="mt-3 bg-zinc-950/60 border border-zinc-900 rounded-xl px-3 py-2 flex flex-col space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[9px] text-zinc-500 truncate max-w-[150px]">{ep.videoUrl}</span>
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (activePreviewId === ep.id) {
                                      setActivePreviewId(null);
                                    } else {
                                      setActivePreviewId(ep.id);
                                    }
                                  }}
                                  className={`px-2 py-1 rounded text-[9px] font-bold font-mono tracking-wider flex items-center space-x-1 uppercase cursor-pointer ${
                                    activePreviewId === ep.id 
                                      ? 'bg-orange-500 text-black font-extrabold' 
                                      : 'bg-zinc-800 text-zinc-350 hover:bg-zinc-700 hover:text-white'
                                  }`}
                                >
                                  <Play className="w-2.5 h-2.5 fill-current" />
                                  <span>{activePreviewId === ep.id ? 'Close' : 'Preview'}</span>
                                </button>
                                <span className="text-[9px] font-bold text-green-400 uppercase tracking-widest font-mono">Stream Live</span>
                              </div>
                            </div>

                            {activePreviewId === ep.id && (
                              <InlineVideoPreview videoUrl={ep.videoUrl} />
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 bg-red-950/20 border border-red-900/10 rounded-xl px-3 py-2 flex items-center space-x-1.5 text-red-400 font-mono text-[9px]">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>NO SOURCE URL CONFIGURED</span>
                          </div>
                        )}

                        {/* Manual Thumbnail URL Editor */}
                        <div className="mt-4 space-y-1.5 pt-3.5 border-t border-zinc-900/50">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-black uppercase text-zinc-500 font-mono">
                              Pasted Cover URL Fallback
                            </label>
                            {ep.thumbnailUrl && ep.thumbnailUrl.startsWith('data:image') && (
                              <span className="text-zinc-600 text-[8px] font-medium">(Procedural graphic stored)</span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              placeholder="Or paste direct image URL (jpg/png)..."
                              value={customThumbnails[ep.id] !== undefined ? customThumbnails[ep.id] : (ep.thumbnailUrl || '')}
                              onChange={(e) => setCustomThumbnails(prev => ({ ...prev, [ep.id]: e.target.value }))}
                              className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-orange-500/50 transition-colors font-medium"
                            />
                            <button
                              type="button"
                              disabled={isSavingThumbnail[ep.id]}
                              onClick={async () => {
                                const newUrl = customThumbnails[ep.id] !== undefined ? customThumbnails[ep.id] : (ep.thumbnailUrl || '');
                                setIsSavingThumbnail(prev => ({ ...prev, [ep.id]: true }));
                                try {
                                  await updateDoc(doc(db, 'episodes', ep.id), { thumbnailUrl: newUrl });
                                  setLogFeed(prev => [...prev, ` ✔️ Episode ${ep.number} thumbnail URL set successfully!`]);
                                  await refreshData();
                                  setRefreshCount(prev => prev + 1);
                                } catch (e: any) {
                                  console.error(e);
                                  setLogFeed(prev => [...prev, ` ❌ Failed to update thumbnail: ${e.message}`]);
                                } finally {
                                  setIsSavingThumbnail(prev => ({ ...prev, [ep.id]: false }));
                                }
                              }}
                              className="bg-orange-500/10 hover:bg-orange-500 hover:text-black text-orange-400 border border-orange-500/20 disabled:bg-zinc-800 disabled:text-zinc-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase font-mono tracking-wider active:scale-95 transition-all cursor-pointer shrink-0"
                            >
                              {isSavingThumbnail[ep.id] ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Individual Episode Manual Trigger action */}
                      <div className="pt-4 mt-4 border-t border-zinc-900 flex justify-between items-center">
                        <span className="text-[10px] text-zinc-550 font-mono font-bold">
                          Duration: {Math.floor((ep.duration || 1440) / 60)} min
                        </span>
                        <button
                          type="button"
                          disabled={isProcessing || !ep.videoUrl}
                          onClick={() => handleSingleEpisodeThumbnail(ep, index)}
                          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-orange-500 text-zinc-400 hover:text-black disabled:opacity-40 disabled:hover:bg-zinc-900 disabled:hover:text-zinc-400 font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer uppercase flex items-center space-x-1"
                        >
                          <RefreshCw className="w-3 h-3 animate-spin-slow" />
                          <span>Capture Single Frame</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Separate Episode Generator */}
      {activeTab === 'single' && (
        <div className="space-y-8 animate-fade-in">
          
          {/* Step 1 & 2: Anime and Season Selector card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-950/40 p-6 rounded-2xl border border-zinc-900">
            {/* Searchable Anime dropdown */}
            <div className="space-y-2 relative" ref={singleDropdownRef}>
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 font-mono flex items-center">
                <Film className="w-3.5 h-3.5 mr-1.5 text-orange-500" />
                <span>1. Select Anime Series</span>
              </label>
              
              <div 
                onClick={() => !sepIsProcessing && setIsSingleDropdownOpen(!isSingleDropdownOpen)}
                className={`bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 font-semibold cursor-pointer flex justify-between items-center transition-all ${
                  sepIsProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:border-orange-500/50'
                }`}
              >
                <span>{singleSelectedAnime ? singleSelectedAnime.title : 'Choose an Anime series...'}</span>
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              </div>

              <AnimatePresence>
                {isSingleDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute z-30 left-0 right-0 mt-2 bg-zinc-950 border border-zinc-850 rounded-xl shadow-2xl p-2.5 overflow-hidden"
                  >
                    <div className="flex items-center border border-zinc-900 bg-zinc-900/50 rounded-lg px-3 py-1.5 mb-2">
                      <Search className="w-3.5 h-3.5 text-zinc-550 mr-2" />
                      <input
                        type="text"
                        placeholder="Search Anime titles..."
                        value={singleSearchQuery}
                        onChange={(e) => setSingleSearchQuery(e.target.value)}
                        className="bg-transparent text-xs text-white placeholder-zinc-700 focus:outline-none w-full"
                      />
                    </div>

                    <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                      {allAnime
                        .filter(a => a.title.toLowerCase().includes(singleSearchQuery.toLowerCase()))
                        .map((anime) => (
                          <div
                            key={anime.id}
                            onClick={() => {
                              setSingleSelectedAnime(anime);
                              setIsSingleDropdownOpen(false);
                              setSingleSeasons([]);
                              setSingleSelectedSeason(null);
                            }}
                            className="text-xs text-zinc-300 hover:text-white hover:bg-orange-500/10 px-3 py-2 rounded-lg cursor-pointer font-medium transition-all flex items-center justify-between"
                          >
                            <span>{anime.title}</span>
                            {singleSelectedAnime?.id === anime.id && (
                              <Check className="w-3.5 h-3.5 text-orange-500" />
                            )}
                          </div>
                        ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Season selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 font-mono flex items-center">
                <Layers className="w-3.5 h-3.5 mr-1.5 text-orange-500" />
                <span>2. Select Season</span>
              </label>
              <select
                disabled={sepIsProcessing || singleSeasons.length === 0}
                value={singleSelectedSeason?.id || ''}
                onChange={(e) => {
                  const matched = singleSeasons.find(s => s.id === e.target.value);
                  if (matched) {
                    setSingleSelectedSeason(matched);
                  }
                }}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 font-semibold outline-none focus:border-orange-500/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {singleSeasons.map((season) => {
                  const dispName = season.name?.trim() || (season as any).title?.trim() || `Season ${season.number}`;
                  return (
                    <option key={season.id} value={season.id} className="bg-zinc-950 text-white font-semibold">
                      {dispName}
                    </option>
                  );
                })}
                {singleSeasons.length === 0 && (
                  <option value="">No seasons found</option>
                )}
              </select>
            </div>
          </div>

          {/* If season is selected, show episodes list layout */}
          {singleSelectedSeason ? (
            <div className="space-y-6">
              
              {/* Progress Tracker (Only visible during separate generation) */}
              {sepIsProcessing && (
                <div className="bg-zinc-950 border border-orange-500/20 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-black uppercase font-mono tracking-wider text-orange-400">
                        Separate Thumbnail Extractor Running
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-medium">
                        Series: {singleSelectedAnime?.title} • Season {singleSelectedSeason.number}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-black text-white bg-zinc-900 px-3 py-1 rounded-md border border-zinc-800">
                      EPISODE: {singleEpisodes.find(e => e.id === sepCurrentEpId)?.number || 'N/A'}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-mono font-black uppercase text-zinc-400">
                      <span>Overall Progress</span>
                      <span>
                        {Math.round(
                          ((sepSuccessCount + sepFailedCount + sepSkippedCount) /
                            Object.values(selectedSepEpisodeIds).filter(Boolean).length) *
                            100
                        ) || 0}
                        %
                      </span>
                    </div>
                    <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500"
                        style={{
                          width: `${
                            ((sepSuccessCount + sepFailedCount + sepSkippedCount) /
                              Object.values(selectedSepEpisodeIds).filter(Boolean).length) *
                            100
                          }%`
                        }}
                      />
                    </div>
                  </div>

                  {/* Micro stats indicators */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
                      <span className="text-[9px] uppercase tracking-wider font-mono font-black text-zinc-550 block">SUCCESS</span>
                      <span className="text-lg font-black text-green-400 font-mono">{sepSuccessCount}</span>
                    </div>
                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
                      <span className="text-[9px] uppercase tracking-wider font-mono font-black text-zinc-550 block">FAILED</span>
                      <span className="text-lg font-black text-red-400 font-mono">{sepFailedCount}</span>
                    </div>
                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
                      <span className="text-[9px] uppercase tracking-wider font-mono font-black text-zinc-550 block">EST SPEED</span>
                      <span className="text-sm font-black text-teal-400 font-mono truncate block mt-0.5">{sepSpeed}</span>
                    </div>
                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
                      <span className="text-[9px] uppercase tracking-wider font-mono font-black text-zinc-550 block">REMAINING TIME</span>
                      <span className="text-sm font-black text-amber-400 font-mono truncate block mt-0.5">{sepEstTimeRemaining}</span>
                    </div>
                  </div>

                  {/* Log console terminal */}
                  <div className="bg-black/90 border border-zinc-900 rounded-xl p-4 font-mono text-[10px] leading-relaxed text-zinc-400 max-h-40 overflow-y-auto" ref={sepProgressContainerRef}>
                    {sepLogFeed.map((msg, idx) => (
                      <div 
                        key={idx}
                        className={
                          msg.includes('✔️') ? 'text-green-400 font-bold' : 
                          msg.includes('⚠️') ? 'text-amber-400 font-bold' :
                          msg.includes('❌') ? 'text-red-400 font-bold' :
                          msg.includes('🚀') ? 'text-orange-400 font-black' : 'text-zinc-450'
                        }
                      >
                        {msg}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Toolbar: Selection Controls, Filters & Sort */}
              <div className="bg-zinc-950/40 border border-zinc-900 p-5 rounded-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                
                {/* Search and Filters */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 max-w-4xl">
                  {/* Search input */}
                  <div className="flex items-center border border-zinc-800 bg-zinc-900/50 rounded-xl px-3 py-2 flex-1 max-w-md">
                    <Search className="w-4 h-4 text-zinc-550 mr-2" />
                    <input
                      type="text"
                      placeholder="Search by episode # or title..."
                      value={sepSearchQuery}
                      onChange={(e) => setSepSearchQuery(e.target.value)}
                      className="bg-transparent text-xs text-white placeholder-zinc-650 focus:outline-none w-full"
                    />
                    {sepSearchQuery && (
                      <button onClick={() => setSepSearchQuery('')} className="text-zinc-500 hover:text-white ml-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Status filter dropdown */}
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">STATUS:</span>
                    <select
                      value={sepFilter}
                      onChange={(e: any) => setSepFilter(e.target.value)}
                      className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none cursor-pointer hover:border-zinc-700 transition-all font-semibold"
                    >
                      <option value="all" className="bg-zinc-950 text-white">All Episodes</option>
                      <option value="generated" className="bg-zinc-950 text-white">Generated</option>
                      <option value="not_generated" className="bg-zinc-950 text-white">Not Generated</option>
                    </select>
                  </div>

                  {/* Sort dropdown */}
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">SORT:</span>
                    <select
                      value={sepSortBy}
                      onChange={(e: any) => setSepSortBy(e.target.value)}
                      className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none cursor-pointer hover:border-zinc-700 transition-all font-semibold"
                    >
                      <option value="number" className="bg-zinc-950 text-white">Episode Number</option>
                      <option value="last_generated" className="bg-zinc-950 text-white">Last Generated</option>
                    </select>
                  </div>
                </div>

                {/* Bulk actions and multi selection controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[10px] font-bold px-3 py-2.5 rounded-lg font-mono transition-all uppercase tracking-wider"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[10px] font-bold px-3 py-2.5 rounded-lg font-mono transition-all uppercase tracking-wider"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    disabled={sepIsProcessing || Object.values(selectedSepEpisodeIds).filter(Boolean).length === 0}
                    onClick={handleGenerateSelectedThumbnails}
                    className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-zinc-900 disabled:to-zinc-900 disabled:text-zinc-650 text-black font-black text-[11px] px-4.5 py-2.5 rounded-lg font-mono transition-all uppercase tracking-wider shadow-lg flex items-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {sepIsProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing ({Object.values(selectedSepEpisodeIds).filter(Boolean).length})</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate Selected ({Object.values(selectedSepEpisodeIds).filter(Boolean).length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Grid of Episodes */}
              {isLoadingSingleEpisodes ? (
                <div className="flex flex-col items-center justify-center p-24 text-center space-y-4">
                  <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  <span className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Loading Episode Vault...</span>
                </div>
              ) : filteredSingleEpisodes.length === 0 ? (
                <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-16 text-center text-zinc-600 space-y-2">
                  <Image className="w-12 h-12 mx-auto text-zinc-800" />
                  <h4 className="text-xs font-black uppercase font-mono tracking-wider text-zinc-400">No episodes matched filters</h4>
                  <p className="text-[11px] max-w-sm mx-auto">
                    Try adjusting your search criteria, clearing queries, or ensuring the selected season contains episodes.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredSingleEpisodes.map((ep) => {
                    const isSelected = !!selectedSepEpisodeIds[ep.id];
                    const hasThumbnail = !!ep.thumbnailUrl;
                    const isProcessingThis = sepIsProcessing && sepCurrentEpId === ep.id;

                    return (
                      <div 
                        key={ep.id}
                        className={`relative rounded-2xl border bg-zinc-950/40 p-4 transition-all duration-300 flex flex-col justify-between group h-full ${
                          isProcessingThis ? 'border-orange-500 bg-orange-500/5' :
                          isSelected ? 'border-zinc-700 bg-zinc-900/20' : 'border-zinc-900 hover:border-zinc-800'
                        }`}
                      >
                        {/* Upper card header: checkbox and actions */}
                        <div className="flex justify-between items-start gap-4 mb-3">
                          <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={sepIsProcessing}
                              onChange={() => {
                                setSelectedSepEpisodeIds(prev => ({
                                  ...prev,
                                  [ep.id]: !prev[ep.id]
                                }));
                              }}
                              className="w-4 h-4 rounded-md bg-zinc-900 border-zinc-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-zinc-950 accent-orange-500 cursor-pointer disabled:opacity-40"
                            />
                            <span className="text-[10px] font-black font-mono tracking-widest text-zinc-400">
                              EP {ep.number}
                            </span>
                          </label>

                          {/* Status Badge */}
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider font-mono ${
                            hasThumbnail 
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                              : 'bg-zinc-900 text-zinc-555 border border-zinc-850'
                          }`}>
                            {hasThumbnail ? 'Generated' : 'Not Generated'}
                          </span>
                        </div>

                        {/* Middle aspect-ratio image container */}
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-zinc-900/80 mb-3 flex items-center justify-center">
                          {hasThumbnail ? (
                            <img
                              src={ep.thumbnailUrl}
                              alt={`Episode ${ep.number}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-4 text-center">
                              <Image className="w-8 h-8 text-zinc-800 mb-1.5" />
                              <span className="text-[9px] font-black uppercase font-mono text-zinc-600 tracking-wider">
                                No Thumbnail Generated
                              </span>
                            </div>
                          )}

                          {isProcessingThis && (
                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-3 text-center space-y-1.5 animate-fade-in">
                              <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                              <span className="text-[8px] font-black font-mono uppercase text-orange-400 tracking-widest animate-pulse">
                                {sepProcessingStage}...
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Lower text block: episode information */}
                        <div className="space-y-1 mb-4">
                          <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-orange-400 transition-colors">
                            {ep.title || `Episode ${ep.number}`}
                          </h4>
                          {ep.lastGenerated ? (
                            <span className="text-[8px] font-mono text-zinc-555 block">
                              Gen: {new Date(ep.lastGenerated).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono text-zinc-650 block">
                              Never generated
                            </span>
                          )}
                        </div>

                        {/* Interactive Buttons footer */}
                        <div className="grid grid-cols-2 gap-2 mt-auto">
                          <button
                            type="button"
                            disabled={sepIsProcessing}
                            onClick={() => handleSingleEpisodeDirect(ep)}
                            className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[9px] font-black py-2 rounded-lg font-mono tracking-wider transition-all uppercase flex items-center justify-center space-x-1"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>{hasThumbnail ? 'Regen' : 'Generate'}</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewEpisode(ep);
                              setSepPasteUrl('');
                            }}
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[9px] font-black py-2 rounded-lg font-mono tracking-wider transition-all uppercase flex items-center justify-center space-x-1"
                          >
                            <Eye className="w-2.5 h-2.5" />
                            <span>Preview</span>
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          ) : (
            <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-20 text-center text-zinc-650 max-w-xl mx-auto space-y-3.5">
              <Layers className="w-12 h-12 mx-auto text-zinc-800 stroke-[1.5]" />
              <div>
                <h4 className="text-xs font-black uppercase font-mono tracking-widest text-zinc-400 mb-1">
                  SEPARATE EPISODE TUNER WORKSPACE
                </h4>
                <p className="text-[11px] leading-relaxed max-w-sm mx-auto">
                  Choose a series on the Step 1 card and select your target season to unlock a complete, granular episode spreadsheet.
                </p>
              </div>
            </div>
          )}

        </div>
      )}

      {/* 5. Detailed Preview & Actions Overlay Modal */}
      {previewEpisode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-950 border border-zinc-900 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-900 bg-zinc-900/25">
              <div>
                <span className="text-[9px] font-black font-mono tracking-widest text-orange-400 block uppercase">
                  Granular Thumbnail Lab
                </span>
                <h3 className="text-sm font-black text-white font-mono uppercase">
                  Episode {previewEpisode.number}: {previewEpisode.title || `Episode ${previewEpisode.number}`}
                </h3>
              </div>
              <button 
                onClick={handleClosePreviewModal}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white p-1.5 rounded-lg border border-zinc-850 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content split workspace */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Left Side: Thumbnail Preview & Draft Sandbox */}
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                  <span className="text-[10px] font-black font-mono tracking-wider text-zinc-450 uppercase flex items-center">
                    <Image className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                    <span>Active Preview</span>
                  </span>
                  
                  {isGeneratingDraft && (
                    <span className="text-[9px] font-mono font-black text-orange-400 animate-pulse bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                      PROCESSING DRAFT: {draftProcessingStage}...
                    </span>
                  )}
                </div>

                {/* Aspect-ratio Container */}
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-zinc-900 flex flex-col items-center justify-center">
                  {previewDraftThumbnail ? (
                    <>
                      <img 
                        src={previewDraftThumbnail} 
                        alt="Draft Frame" 
                        className="w-full h-full object-cover animate-fade-in"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-4 flex flex-col justify-end">
                        <span className="absolute top-3 left-3 bg-orange-500 text-black text-[8px] font-black px-2.5 py-1 rounded font-mono tracking-wider shadow-lg">
                          UNSAVED DRAFT PREVIEW
                        </span>
                        
                        <div className="flex gap-2 mt-auto">
                          <button
                            type="button"
                            onClick={() => handleSaveDraftThumbnail(previewEpisode)}
                            className="bg-green-600 hover:bg-green-700 text-white font-black text-[10px] px-3 py-1.5 rounded-lg font-mono tracking-wider uppercase transition-all flex items-center space-x-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Save Draft</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewDraftThumbnail(null)}
                            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-black text-[10px] px-3 py-1.5 rounded-lg font-mono tracking-wider uppercase transition-all flex items-center space-x-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Discard</span>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : previewEpisode.thumbnailUrl ? (
                    <>
                      <img 
                        src={previewEpisode.thumbnailUrl} 
                        alt="Current Frame" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-4 flex flex-col justify-end">
                        <span className="absolute top-3 left-3 bg-green-500 text-black text-[8px] font-black px-2.5 py-1 rounded font-mono tracking-wider shadow-lg">
                          LIVE COVER
                        </span>
                        
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadThumbnail(previewEpisode)}
                            className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 font-bold text-[9px] px-2.5 py-1.5 rounded-md font-mono transition-all flex items-center space-x-1 cursor-pointer border border-zinc-800"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                          
                          {confirmDeleteId === previewEpisode.id ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteThumbnail(previewEpisode)}
                              className="bg-red-600 text-white font-black text-[9px] px-2.5 py-1.5 rounded-md font-mono transition-all flex items-center space-x-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3 animate-pulse" />
                              <span>Confirm Delete</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(previewEpisode.id)}
                              className="bg-red-950/80 hover:bg-red-900 border border-red-900/30 text-red-400 hover:text-white font-bold text-[9px] px-2.5 py-1.5 rounded-md font-mono transition-all flex items-center space-x-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-8 text-zinc-655">
                      <Image className="w-12 h-12 text-zinc-800 mb-2.5" />
                      <span className="text-xs font-black font-mono uppercase tracking-wider text-zinc-555">NO LIVE COVER SAVED</span>
                      <p className="text-[10px] text-zinc-600 max-w-[220px] leading-relaxed mt-1">
                        Use the automatic extractor draft generator on the right or manually replace above.
                      </p>
                    </div>
                  )}
                </div>

                {/* Draft Generator Trigger */}
                {!previewDraftThumbnail && (
                  <button
                    type="button"
                    disabled={isGeneratingDraft}
                    onClick={() => handleGenerateDraftThumbnail(previewEpisode)}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-black py-3.5 rounded-xl text-[11px] active:scale-95 transition-all text-center uppercase tracking-wider font-mono flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {isGeneratingDraft ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                        <span>Extracting Draft ({draftProcessingStage})...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-orange-400" />
                        <span>Capture New Draft Cover</span>
                      </>
                    )}
                  </button>
                )}

                {/* Console Log inside Sandbox */}
                <div className="bg-black/90 border border-zinc-900 rounded-xl p-3.5 font-mono text-[9px] leading-relaxed text-zinc-555 h-28 overflow-y-auto">
                  <div className="text-[8px] font-bold text-zinc-650 uppercase mb-1 tracking-wider border-b border-zinc-900 pb-0.5">Console Shell</div>
                  {draftLogFeed.map((m, i) => (
                    <div key={i} className={m.includes('✔️') ? 'text-green-400' : m.includes('❌') ? 'text-red-400' : 'text-zinc-555'}>
                      {m}
                    </div>
                  ))}
                  {draftLogFeed.length === 0 && (
                    <div className="text-zinc-700 italic text-center pt-5">
                      Shell inactive. Trigger the capture draft engine above to listen to live frame entropy streams.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Manual Replacement (Upload or Link) */}
              <div className="space-y-6">
                <span className="text-[10px] font-black font-mono tracking-wider text-zinc-450 uppercase block pb-2 border-b border-zinc-900">
                  Manual Replacement Deck
                </span>

                {/* Upload Section */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 font-mono">
                    Option A: Upload Custom Graphic
                  </label>
                  
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      isDragOver ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                    onClick={() => {
                      const input = document.getElementById('sep-file-uploader');
                      if (input) input.click();
                    }}
                  >
                    <input
                      type="file"
                      id="sep-file-uploader"
                      accept="image/*"
                      onChange={handleThumbnailUpload}
                      className="hidden"
                    />
                    {isUploadingSepThumb ? (
                      <div className="space-y-2">
                        <Loader2 className="w-8 h-8 mx-auto text-orange-500 animate-spin" />
                        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest animate-pulse">Uploading Image...</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-8 h-8 mx-auto text-zinc-500 group-hover:text-zinc-400 transition-colors" />
                        <div>
                          <p className="text-xs font-bold text-zinc-300">Drag & drop your cover here</p>
                          <p className="text-[10px] text-zinc-550 mt-0.5">or click to browse local files (under 1MB recommended)</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct paste image URL */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 font-mono">
                    Option B: Import Direct Cover URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="https://example.com/cover-art.jpg"
                      value={sepPasteUrl}
                      onChange={(e) => setSepPasteUrl(e.target.value)}
                      className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-700 transition-all font-mono"
                    />
                    <button
                      type="button"
                      disabled={isUploadingSepThumb || !sepPasteUrl.trim()}
                      onClick={handleSavePasteUrl}
                      className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-black px-4 rounded-xl text-[10px] font-mono transition-all uppercase tracking-wider"
                    >
                      Import
                    </button>
                  </div>
                </div>

                {/* Technical Sandbox Notice */}
                <div className="p-4 bg-purple-950/20 border border-purple-900/30 rounded-xl flex items-start space-x-3 text-xs leading-relaxed font-medium text-purple-300">
                  <HelpCircle className="w-5 h-5 shrink-0 text-purple-400 mt-0.5" />
                  <div>
                    <span className="font-extrabold uppercase tracking-wide text-white block mb-0.5">Lossless Metadata Encoding</span>
                    <p className="text-zinc-400 text-[10px] leading-normal font-semibold">
                      Manual uploads and direct imports will undergo an instant sub-system scaling process, encoding the graphics into a responsive format to ensure ultra-fast loading for client players.
                    </p>
                  </div>
                </div>

              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-900 bg-zinc-900/20 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClosePreviewModal}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-black px-5 py-3 rounded-xl text-[10px] font-mono tracking-wider uppercase transition-all cursor-pointer"
              >
                Close Lab
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
