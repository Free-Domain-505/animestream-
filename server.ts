import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import os from 'os';
import jpeg from 'jpeg-js';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}
export interface AILog {
  timestamp: string;
  action: string;
  status: "SUCCESS" | "ERROR" | "INFO";
  details: string;
  model: string;
}

const aiLogs: AILog[] = [];

function addAILog(action: string, status: "SUCCESS" | "ERROR" | "INFO", details: string, model: string = "system") {
  aiLogs.unshift({
    timestamp: new Date().toISOString(),
    action,
    status,
    details,
    model
  });
  if (aiLogs.length > 200) aiLogs.pop();
}


const isProd = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3000;

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// Ensure DB directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Default Seed Data
const defaultAnime = [
  {
    id: 'demon-slayer',
    title: 'Demon Slayer: Kimetsu no Yaiba',
    synopsis: 'Tanjiro Kamado, a young boy whose family is slaughtered by a demon, joins the Demon Slayer Corps to find a cure for his sister Nezuko, who has been turned into a demon. Wielding legendary water and fire sword techniques, he fights the upper-rank threats of Muzan Kibutsuji.',
    description: 'Tanjiro Kamado, a young boy whose family is slaughtered by a demon, joins the Demon Slayer Corps to find a cure for his sister Nezuko, who has been turned into a demon. Wielding legendary water and fire sword techniques, he fights the upper-rank threats of Muzan Kibutsuji.',
    banner: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1600&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1600&auto=format&fit=crop&q=80',
    poster: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
    genres: ['Action', 'Fantasy', 'Demons'],
    rating: '9.4',
    status: 'Ongoing',
    type: 'Series',
    category: 'Featured',
    featured: true,
    releaseYear: 2019,
    episodeCount: 2,
    totalSeasons: 1,
    studio: 'ufotable',
    createdAt: new Date().toISOString()
  },
  {
    id: 'frieren',
    title: 'Frieren: Beyond Journey\'s End',
    synopsis: 'An elf mage and her former party members reunited after a 10-year quest to defeat the Demon King. As her companions age and pass away, Frieren begins to contemplate the transience of human lives, embarking on a path of self-discovery to understand human hearts.',
    description: 'An elf mage and her former party members reunited after a 10-year quest to defeat the Demon King. As her companions age and pass away, Frieren begins to contemplate the transience of human lives, embarking on a path of self-discovery to understand human hearts.',
    banner: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1600&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1600&auto=format&fit=crop&q=80',
    poster: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=80',
    genres: ['Adventure', 'Fantasy', 'Drama'],
    rating: '9.6',
    status: 'Ongoing',
    type: 'Series',
    category: 'Trending',
    featured: false,
    releaseYear: 2023,
    episodeCount: 2,
    totalSeasons: 1,
    studio: 'Madhouse',
    createdAt: new Date().toISOString()
  },
  {
    id: 'jujutsu-kaisen',
    title: 'Jujutsu Kaisen',
    synopsis: 'Yuji Itadori, an athletic high school student, accidentally swallows a highly potent cursed finger of the demon Ryomen Sukuna. To save lives and maintain the balance of the Tokyo Jujutsu Shaman College, Yuji submits to Gojo Satoru\'s oversight to collect all fingers.',
    description: 'Yuji Itadori, an athletic high school student, accidentally swallows a highly potent cursed finger of the demon Ryomen Sukuna. To save lives and maintain the balance of the Tokyo Jujutsu Shaman College, Yuji submits to Gojo Satoru\'s oversight to collect all fingers.',
    banner: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1600&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1600&auto=format&fit=crop&q=80',
    poster: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80',
    genres: ['Action', 'Mystery', 'Thriller'],
    rating: '9.2',
    status: 'Ongoing',
    type: 'Series',
    category: 'Popular',
    featured: false,
    releaseYear: 2020,
    episodeCount: 2,
    totalSeasons: 1,
    studio: 'MAPPA',
    createdAt: new Date().toISOString()
  },
  {
    id: 'chainsaw-man',
    title: 'Chainsaw Man',
    synopsis: 'Denji is a desperate youth struggling to repay his deceased father\'s astronomical debts to the yakuza by hunting devils. Betrayed and left for dead in a dumpster, he merges with his faithful pochita devil dog, arising as the chainsaw-fused hybrid warrior Chainsaw Man.',
    description: 'Denji is a desperate youth struggling to repay his deceased father\'s astronomical debts to the yakuza by hunting devils. Betrayed and left for dead in a dumpster, he merges with his faithful pochita devil dog, arising as the chainsaw-fused hybrid warrior Chainsaw Man.',
    banner: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1600&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1600&auto=format&fit=crop&q=80',
    poster: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80',
    genres: ['Action', 'Sci-Fi', 'Fantasy'],
    rating: '8.9',
    status: 'Completed',
    type: 'Series',
    category: 'Regular',
    featured: false,
    releaseYear: 2022,
    episodeCount: 2,
    totalSeasons: 1,
    studio: 'MAPPA',
    createdAt: new Date().toISOString()
  }
];

const defaultSeasons = [
  { id: 'demon-slayer_1', animeId: 'demon-slayer', number: 1, name: 'Season 1: Kamado Tanjiro Risshi Arc', title: 'Season 1: Kamado Tanjiro Risshi Arc', episodeCount: 2, createdAt: new Date().toISOString() },
  { id: 'frieren_1', animeId: 'frieren', number: 1, name: 'Season 1: First Journey', title: 'Season 1: First Journey', episodeCount: 2, createdAt: new Date().toISOString() },
  { id: 'jujutsu-kaisen_1', animeId: 'jujutsu-kaisen', number: 1, name: 'Season 1: Curse Womb Arc', title: 'Season 1: Curse Womb Arc', episodeCount: 2, createdAt: new Date().toISOString() },
  { id: 'chainsaw-man_1', animeId: 'chainsaw-man', number: 1, name: 'Season 1: Public Safety Saga', title: 'Season 1: Public Safety Saga', episodeCount: 2, createdAt: new Date().toISOString() }
];

const defaultEpisodes = [
  {
    id: 'demon-slayer_1_1',
    animeId: 'demon-slayer',
    seasonId: 'demon-slayer_1',
    seasonNumber: 1,
    number: 1,
    title: 'Episode 1: Cruelty',
    description: 'Tanjiro Kamado lives a peaceful life selling charcoal in the snowy mountains, until he returns to find his family slaughtered and his sister turned.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
    duration: 596,
    createdAt: new Date().toISOString()
  },
  {
    id: 'demon-slayer_1_2',
    animeId: 'demon-slayer',
    seasonId: 'demon-slayer_1',
    seasonNumber: 1,
    number: 2,
    title: 'Episode 2: Trainer Sakonji Urokodaki',
    description: 'Desperate to defend Nezuko, Tanjiro meets Giyu Tomioka who directs him to Mt. Sagiri for rigorous swordplay and breath water training.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1627856013091-fed6e4e30025?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1627856013091-fed6e4e30025?w=600&auto=format&fit=crop&q=80',
    duration: 653,
    createdAt: new Date().toISOString()
  },
  {
    id: 'frieren_1_1',
    animeId: 'frieren',
    seasonId: 'frieren_1',
    seasonNumber: 1,
    number: 1,
    title: 'Episode 1: The Journey\'s End',
    description: 'The triumph over the Demon King has completed. Frieren bids farewell to her aging human hero comrades to quest for magic, only to return to a tragic parting.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=80',
    duration: 734,
    createdAt: new Date().toISOString()
  },
  {
    id: 'frieren_1_2',
    animeId: 'frieren',
    seasonId: 'frieren_1',
    seasonNumber: 1,
    number: 2,
    title: 'Episode 2: It Didn\'t Have to Be Magic',
    description: 'Frieren visits her dying wizard companion Heiter and adopts Fern, a young war orphan student with immense potential for mana manipulation.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&auto=format&fit=crop&q=80',
    duration: 150,
    createdAt: new Date().toISOString()
  },
  {
    id: 'jujutsu-kaisen_1_1',
    animeId: 'jujutsu-kaisen',
    seasonId: 'jujutsu-kaisen_1',
    seasonNumber: 1,
    number: 1,
    title: 'Episode 1: Ryomen Sukuna',
    description: 'While attempting to rescue members of his high school occult club, Yuji Itadori swallows a legendary high-grade curse talisman finger.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80',
    duration: 150,
    createdAt: new Date().toISOString()
  },
  {
    id: 'jujutsu-kaisen_1_2',
    animeId: 'jujutsu-kaisen',
    seasonId: 'jujutsu-kaisen_1',
    seasonNumber: 1,
    number: 2,
    title: 'Episode 2: For Myself',
    description: 'Gojo Satoru tests Yuji Itadori\'s will and control over the demon Sukuna before relocating him to the hidden Jujutsu High in Tokyo.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackInTheHills.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackInTheHills.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    duration: 320,
    createdAt: new Date().toISOString()
  },
  {
    id: 'chainsaw-man_1_1',
    animeId: 'chainsaw-man',
    seasonId: 'chainsaw-man_1',
    seasonNumber: 1,
    number: 1,
    title: 'Episode 1: Dog and Chainsaw',
    description: 'Denji hunts rogue local devils under severe yakuza surveillance. When he is butchered, his devil companion Pochita breathes a new life into him.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80',
    duration: 155,
    createdAt: new Date().toISOString()
  },
  {
    id: 'chainsaw-man_1_2',
    animeId: 'chainsaw-man',
    seasonId: 'chainsaw-man_1',
    seasonNumber: 1,
    number: 2,
    title: 'Episode 2: Arrival in Tokyo',
    description: 'Denji is recruited by the mysterious Makima to serve in the Public Safety Department as Tokyo\'s experimental live-in rookie devil hunter.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    video1080: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    duration: 596,
    createdAt: new Date().toISOString()
  }
];

const JSONBLOB_URL = 'https://jsonblob.com/api/jsonBlob/019f463c-ec63-7487-aa17-002a3a8a9d17';
let serverMemoryDb: Record<string, any[]> | null = null;
let lastBlobSyncTime = 0;

// Helper to load/initialize the database from the file or cloud JSONBlob
async function ensureDatabaseLoaded(): Promise<Record<string, any[]>> {
  if (serverMemoryDb) {
    // Background sync check: fetch from cloud JSONBlob if more than 20 seconds has elapsed
    // to keep multiple container instances perfectly synced
    if (Date.now() - lastBlobSyncTime > 20000) {
      try {
        const res = await fetch(JSONBLOB_URL);
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData && typeof cloudData === 'object' && Array.isArray(cloudData.anime)) {
            serverMemoryDb = cloudData;
            lastBlobSyncTime = Date.now();
            // Update local fallback file
            fs.writeFileSync(DB_FILE, JSON.stringify(serverMemoryDb, null, 2), 'utf-8');
          }
        }
      } catch (err) {
        console.warn("Background cloud DB check warning:", err);
      }
    }
    return serverMemoryDb;
  }

  // 1. Try loading from cloud JSONBlob on startup
  try {
    const res = await fetch(JSONBLOB_URL);
    if (res.ok) {
      const cloudData = await res.json();
      if (cloudData && typeof cloudData === 'object' && Array.isArray(cloudData.anime)) {
        serverMemoryDb = cloudData;
        lastBlobSyncTime = Date.now();
        // Save a local fallback copy
        fs.writeFileSync(DB_FILE, JSON.stringify(serverMemoryDb, null, 2), 'utf-8');
        console.log("Successfully loaded shared cloud database from JSONBlob on startup.");
        return serverMemoryDb;
      }
    }
  } catch (err) {
    console.error("Failed to load database from JSONBlob on startup, falling back to local file:", err);
  }

  // 2. Fallback to local db.json
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      serverMemoryDb = JSON.parse(content);
      lastBlobSyncTime = Date.now();
      console.log("Successfully loaded database from local VPS storage file.");
      return serverMemoryDb!;
    }
  } catch (e) {
    console.error("Failed to parse local VPS database file, resetting:", e);
  }

  // 3. Fallback to fresh seed database
  const freshDb: Record<string, any[]> = {
    anime: defaultAnime,
    seasons: defaultSeasons,
    episodes: defaultEpisodes,
    users: [],
    watchHistory: [],
    watchlist: [],
    reviews: [],
    comments: [],
    news: [],
    schedule: [],
    adminInvites: [],
    favorites: [],
    favoriteEpisodes: [],
    users_backup: []
  };

  serverMemoryDb = freshDb;
  lastBlobSyncTime = Date.now();
  
  // Save local fallback copy
  fs.writeFileSync(DB_FILE, JSON.stringify(freshDb, null, 2), 'utf-8');
  
  // Try uploading seed database to cloud JSONBlob
  try {
    await fetch(JSONBLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(freshDb)
    });
  } catch (err) {
    console.error("Failed to upload seed database to JSONBlob:", err);
  }

  return freshDb;
}

// Legacy synchronous helper for backward-compatibility fallback
function getDatabase(): Record<string, any[]> {
  if (serverMemoryDb) return serverMemoryDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      serverMemoryDb = JSON.parse(content);
      return serverMemoryDb!;
    }
  } catch (e) {}

  const freshDb: Record<string, any[]> = {
    anime: defaultAnime,
    seasons: defaultSeasons,
    episodes: defaultEpisodes,
    users: [],
    watchHistory: [],
    watchlist: [],
    reviews: [],
    comments: [],
    news: [],
    schedule: [],
    adminInvites: [],
    favorites: [],
    favoriteEpisodes: [],
    users_backup: []
  };
  serverMemoryDb = freshDb;
  return freshDb;
}

// Synchronous and Asynchronous persistence handler
async function saveDatabase(data: Record<string, any[]>) {
  serverMemoryDb = data;
  lastBlobSyncTime = Date.now();

  // Save local copy first for reliability
  const tempFile = DB_FILE + '.tmp';
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (e) {
    console.error("Critical error saving local VPS database backup:", e);
  }

  // Push updates to cloud JSONBlob so all container instances reflect changes instantly
  try {
    await fetch(JSONBLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) {
    console.error("Critical error syncing database to cloud JSONBlob:", err);
  }
}

async function startServer() {
  // Global CORS and OPTIONS Preflight handler for reliable cross-origin and CDN/Netlify/Vercel support
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // Load the shared database right on server startup
  await ensureDatabaseLoaded();

  // API Route to read a full collection
  app.get('/api/db/:collection', async (req, res) => {
    const colName = req.params.collection;
    const dbData = await ensureDatabaseLoaded();
    res.json(dbData[colName] || []);
  });

  app.get("/api/gemini/logs", (req, res) => {
    res.json(aiLogs);
  });

  app.get("/api/gemini/status", async (req, res) => {
    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.json({ status: "OFFLINE", message: "GEMINI_API_KEY is not set in environment variables." });
      }
      const ai = getGeminiClient();
      await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: "ping",
        config: { maxOutputTokens: 1 }
      });
      return res.json({ status: "ONLINE", message: "Gemini API is online and reachable." });
    } catch (err: any) {
      return res.json({ status: "ERROR", message: `Gemini API reachable check failed: ${err.message}` });
    }
  });

  // API Route for Skip Intro & Credits analyzer
  app.post('/api/gemini/analyze-episode', async (req, res) => {
    const { animeTitle, episodeTitle, episodeNumber, duration, videoUrl } = req.body;
    const dur = parseInt(duration, 10) || 1440;
    const epNum = parseInt(episodeNumber, 10) || 1;

    console.log(`[AI Analyzer] Initiating analysis for: "${animeTitle}" - Ep ${epNum} ("${episodeTitle || 'Unknown'}") [Duration: ${dur}s]`);

    const sanitizeTimelineResult = (data: any, maxDur: number) => {
      const result = {
        hasSkipIntro: typeof data.hasSkipIntro === 'boolean' ? data.hasSkipIntro : true,
        introShowAt: typeof data.introShowAt === 'number' ? Math.max(0, data.introShowAt) : 90,
        introShowDuration: typeof data.introShowDuration === 'number' ? data.introShowDuration : 90,
        introSkipTo: typeof data.introSkipTo === 'number' ? data.introSkipTo : 180,
        hasSkipOutro: typeof data.hasSkipOutro === 'boolean' ? data.hasSkipOutro : true,
        outroShowAt: typeof data.outroShowAt === 'number' ? data.outroShowAt : maxDur - 120,
        outroShowDuration: typeof data.outroShowDuration === 'number' ? data.outroShowDuration : 90,
        outroSkipTo: typeof data.outroSkipTo === 'number' ? data.outroSkipTo : maxDur,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.85,
        confidence_reason: typeof data.confidence_reason === 'string' ? data.confidence_reason : 'Derived structure estimate'
      };

      // Bounds validation
      if (result.introShowAt >= maxDur) {
        result.introShowAt = 90;
      }
      if (result.introSkipTo > maxDur || result.introSkipTo <= result.introShowAt) {
        result.introSkipTo = result.introShowAt + result.introShowDuration;
      }
      if (result.introSkipTo > maxDur) {
        result.introSkipTo = maxDur;
      }
      result.introShowDuration = result.introSkipTo - result.introShowAt;

      if (result.outroShowAt >= maxDur || result.outroShowAt < result.introSkipTo) {
        result.outroShowAt = maxDur - 120;
      }
      if (result.outroSkipTo > maxDur || result.outroSkipTo <= result.outroShowAt) {
        result.outroSkipTo = maxDur;
      }
      result.outroShowDuration = result.outroSkipTo - result.outroShowAt;

      return result;
    };

    // 1. Try Gemini (Primary)
    try {
      const ai = getGeminiClient();
      addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "INFO", "Started timestamp analysis", "gemini-3.1-flash-lite");
      const prompt = `Intelligently analyze the anime episode timeline to detect the Skip Intro (opening theme song) and Skip Credits (ending theme song) timestamps.
Series Title: ${animeTitle || 'Unknown Anime'}
Episode Title: ${episodeTitle || 'Unknown Episode'}
Episode Number: ${epNum}
Episode Duration: ${dur} seconds
Video Link: ${videoUrl || ''}

In typical anime series:
- The opening theme (Intro) is approximately 90 seconds (1.5 minutes) long. It usually starts either at 0 seconds (cold open of 0s) or after a short prologue (cold open) of 1-3 minutes (e.g. starting at 60s, ending at 150s).
- The ending theme/credits (Outro) are also approximately 90 seconds long, starting around 1.5 - 2.5 minutes before the end of the episode (e.g. starting around 1300s, ending around 1390s, with a 50s post-credit scene).
Based on your extensive knowledge of this anime series ("${animeTitle}"), determine the actual or highly probable timeline of the opening song and ending theme song for this episode.
If you do not know the exact timestamps for this specific episode, intelligently estimate them based on the episode's duration and the typical structure of this series.

You MUST return a JSON object with these fields:
- "hasSkipIntro": boolean
- "introShowAt": integer
- "introShowDuration": integer
- "introSkipTo": integer
- "hasSkipOutro": boolean
- "outroShowAt": integer
- "outroShowDuration": integer
- "outroSkipTo": integer
- "confidence": number (float from 0.0 to 1.0)
- "confidence_reason": string (reason for this confidence score)

Ensure all second values are within the bounds of the episode duration (${dur} seconds).`;

      let response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              hasSkipIntro: { type: "BOOLEAN" },
              introShowAt: { type: "INTEGER" },
              introShowDuration: { type: "INTEGER" },
              introSkipTo: { type: "INTEGER" },
              hasSkipOutro: { type: "BOOLEAN" },
              outroShowAt: { type: "INTEGER" },
              outroShowDuration: { type: "INTEGER" },
              outroSkipTo: { type: "INTEGER" },
              confidence: { type: "NUMBER" },
              confidence_reason: { type: "STRING" }
            },
            required: ["hasSkipIntro", "introShowAt", "introShowDuration", "introSkipTo", "hasSkipOutro", "outroShowAt", "outroShowDuration", "outroSkipTo", "confidence", "confidence_reason"]
          }
        }
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);
      addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "SUCCESS", `Analysis complete. Confidence: ${Math.round(result.confidence * 100)}%`, "gemini-3.1-flash-lite");
      console.log(`[AI Analyzer] Gemini analyzed successfully:`, JSON.stringify(result));
      const sanitized = sanitizeTimelineResult(result, dur);
      return res.json({ success: true, isFallback: false, source: 'gemini', ...sanitized });
    } catch (geminiErr: any) {
      addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "ERROR", `Primary AI failed: ${geminiErr.message}`, "gemini-3.1-flash-lite");
      console.error(`[AI Analyzer] Gemini analysis failed too. Falling back to local heuristics... Error:`, geminiErr.message || geminiErr);
    }

    // 3. Local Heuristics (Tertiary Graceful Fallback)
    const isFirstEpisode = epNum === 1;
    const introShowAt = isFirstEpisode ? 120 : 90;
    const introShowDuration = 90;
    const introSkipTo = introShowAt + introShowDuration;
    const outroShowAt = Math.max(introSkipTo + 120, dur - 120);
    const outroShowDuration = 90;
    const outroSkipTo = Math.min(dur, outroShowAt + outroShowDuration);

    console.warn(`[AI Analyzer] Applied local heuristics calculation fallback for ${animeTitle} Ep ${epNum}`);
    res.json({
      success: true,
      isFallback: true,
      source: 'heuristics',
      hasSkipIntro: true,
      introShowAt,
      introShowDuration,
      introSkipTo,
      hasSkipOutro: true,
      outroShowAt,
      outroShowDuration,
      outroSkipTo
    });
  });

  // 1. Probe Video Codecs and Container using ffprobe or extension fallbacks
  app.get('/api/probe-video', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    const mappedUrl = mapVideoUrl(videoUrl);
    const lowerUrl = mappedUrl.toLowerCase();

    // Setup defaults for extension fallback
    let format = 'unknown';
    if (lowerUrl.includes('.mp4')) format = 'mp4';
    else if (lowerUrl.includes('.mkv')) format = 'matroska';
    else if (lowerUrl.includes('.webm')) format = 'webm';
    else if (lowerUrl.includes('.m3u8')) format = 'hls';

    let result = {
      format: format,
      videoCodec: 'h264',
      audioCodec: format === 'matroska' ? 'dts' : 'aac', // Assume DTS for MKV for robust default testing
      audioChannels: 2,
      duration: 1440,
      width: 1920,
      height: 1080,
      hasUnsupportedAudio: format === 'matroska',
      hasUnsupportedVideo: false,
      requiresTranscoding: format === 'matroska',
      probeSource: 'extension_fallback'
    };

    try {
      console.log(`[Video Prober] Probing upstream: ${videoUrl}`);
      const args = [
        '-timeout', '15000000', // 15s microsecond timeout
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '-v', 'error',
        '-show_entries', 'format=format_name,duration:stream=codec_name,codec_type,channels,width,height:stream_tags=language,title',
        '-of', 'json',
        mappedUrl
      ];

      const child = spawn('ffprobe', args);

      let stdout = '';
      let stderr = '';

      const probePromise = new Promise<string>((resolve, reject) => {
        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('close', (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(`ffprobe exited with code ${code}. Stderr: ${stderr}`));
        });
        child.on('error', (err) => reject(err));
      });

      // 15 seconds timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch (e) {}
          reject(new Error('ffprobe timeout'));
        }, 15000);
      });

      const rawJson = await Promise.race([probePromise, timeoutPromise]);
      const data = JSON.parse(rawJson);

      if (data && data.streams) {
        const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
        const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');
        const formatInfo = data.format || {};

        const audioStreams = data.streams.filter((s: any) => s.codec_type === 'audio');
        const subtitleStreams = data.streams.filter((s: any) => s.codec_type === 'subtitle');

        result.videoCodec = videoStream?.codec_name || 'h264';
        result.audioCodec = audioStream?.codec_name || 'aac';
        result.audioChannels = audioStream?.channels || 2;
        result.width = videoStream?.width || 1920;
        result.height = videoStream?.height || 1080;
        result.duration = parseFloat(formatInfo.duration) || result.duration;
        result.format = formatInfo.format_name || result.format;
        result.probeSource = 'ffprobe_success';

        // Codecs check: expanded to comprehensively detect DTS, AC3, Dolby, TrueHD, FLAC, PCM, etc.
        const unAudio = ['dts', 'dtshd', 'truehd', 'eac3', 'ac3', 'mlp', 'flac', 'pcm', 'wma', 'mp2', 'mp1', 'atrac'];
        result.hasUnsupportedAudio = unAudio.some(codec => result.audioCodec.toLowerCase().includes(codec));
        
        // Comprehensive video codecs that browsers can't reliably decode natively (HEVC, VC-1, old MPEG, DivX, Xvid)
        const unVideo = ['hevc', 'h265', 'vc1', 'mpeg4', 'mpeg2video', 'mpeg1video', 'divx', 'xvid', 'msmpeg4'];
        result.hasUnsupportedVideo = unVideo.some(codec => result.videoCodec.toLowerCase().includes(codec));

        // Transcoding is required if audio is unsupported, or if it is an MKV container (since browsers can't natively play MKV)
        result.requiresTranscoding = result.hasUnsupportedAudio || result.format.includes('matroska') || result.format.includes('mkv');

        // Detailed audio tracks and subtitle tracks counts & descriptions
        (result as any).audioTracksCount = audioStreams.length;
        (result as any).subtitleTracksCount = subtitleStreams.length;
        (result as any).audioTracks = audioStreams.map((s: any, idx: number) => ({
          index: s.index,
          codec: s.codec_name || 'unknown',
          language: s.tags?.language || 'und',
          title: s.tags?.title || `Track ${idx + 1} (${(s.tags?.language || 'und').toUpperCase()})`,
          channels: s.channels || 2
        }));
        (result as any).subtitleTracks = subtitleStreams.map((s: any, idx: number) => ({
          index: s.index,
          codec: s.codec_name || 'unknown',
          language: s.tags?.language || 'und',
          title: s.tags?.title || `Subtitle ${idx + 1} (${(s.tags?.language || 'und').toUpperCase()})`
        }));
      }
    } catch (err: any) {
      console.warn(`[Video Prober] Active probing failed (using safe fallback):`, err.message || err);
    }

    console.log(`[Video Prober] Result for ${videoUrl}:`, result);
    return res.json(result);
  });

  // 2. Transcode Video Audio to AAC on-the-fly and stream
  app.get('/api/transcode-video', (req, res) => {
    const videoUrl = req.query.url as string;
    const startTime = req.query.ss ? parseFloat(req.query.ss as string) : 0;
    if (!videoUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const mappedUrl = mapVideoUrl(videoUrl);

    // Set headers
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    const transcodeVideo = req.query.transcodeVideo === 'true';
    let audioTrackIndex = req.query.audioTrack ? parseInt(req.query.audioTrack as string) : 0;
    if (isNaN(audioTrackIndex) || audioTrackIndex < 0) {
      audioTrackIndex = 0;
    }

    // Setup FFmpeg arguments
    const ffmpegArgs = [
      '-timeout', '15000000', // 15 seconds network timeout
      '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-fflags', '+genpts+discardcorrupt', // Generate missing PTS, discard corrupt packets
      '-avoid_negative_ts', 'make_zero'     // Reset start times to zero, crucial on seek!
    ];

    if (startTime > 0) {
      ffmpegArgs.push('-ss', startTime.toString());
    }

    ffmpegArgs.push('-i', mappedUrl);

    // Map first video and explicitly map selected audio track, avoiding subtitle/chapter clutter
    ffmpegArgs.push('-map', '0:v:0?', '-map', `0:a:${audioTrackIndex}?`);

    // Explicitly disable subtitle writing, data streams, and strip metadata to prevent container incompatibilities
    ffmpegArgs.push('-sn', '-dn', '-map_metadata', '-1');

    if (transcodeVideo) {
      console.log(`[Transcoder] Transcoding BOTH video (H.264) and audio (AAC) for optimal browser compatibility.`);
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '24',
        '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p'
      );
    } else {
      console.log(`[Transcoder] Copying video stream (low overhead) and transcoding audio (AAC).`);
      ffmpegArgs.push('-c:v', 'copy');
    }

    ffmpegArgs.push(
      '-c:a', 'aac',                 // Transcode audio to browser-supported AAC
      '-b:a', '192k',                // High-quality stereo audio
      '-ac', '2',                    // Downmix multi-channel to stereo for absolute browser compatibility
      '-af', 'aresample=async=1',    // Align audio track precisely with video track timestamps
      '-max_interleave_delta', '0',  // Prevent buffer limitations from dropping packets
      '-f', 'mp4',                   // Output container format
      '-movflags', 'frag_keyframe+empty_moov+faststart+default_base_moof', // Highly compatible fragmented MP4
      '-ignore_unknown',
      'pipe:1'                       // Stream to stdout (pipes straight to HTTP response!)
    );

    console.log(`[Transcoder] Active stream transcoding initiated. SS: ${startTime}s, URL: ${videoUrl}`);
    const child = spawn('ffmpeg', ffmpegArgs);

    child.stdout.pipe(res);

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      console.log(`[Transcoder] FFmpeg streaming process finished with code ${code}`);
      if (code !== 0 && code !== null) {
        console.warn(`[Transcoder] FFmpeg exited with non-zero code. Error details:\n${stderr}`);
      }
    });

    req.on('close', () => {
      console.log('[Transcoder] Client disconnected. Terminating FFmpeg transcoding stream.');
      try {
        child.kill('SIGKILL');
      } catch (e) {}
    });
  });

  // Streaming CORS Video Proxy to eliminate "Failed to load streaming media" completely
  app.get('/api/proxy-video', (req, res) => {
    let targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }
    targetUrl = mapVideoUrl(targetUrl);

    let activeProxyReq: http.ClientRequest | null = null;

    res.on('close', () => {
      if (activeProxyReq) {
        console.log('[Proxy Video] Client closed connection. Aborting upstream request to prevent background thread congestion.');
        activeProxyReq.destroy();
        activeProxyReq = null;
      }
    });

    const forwardRequest = (urlStr: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        return res.status(502).send('Too many redirects');
      }

      try {
        const parsedUrl = new URL(urlStr);
        const clientReq = parsedUrl.protocol === 'https:' ? https : http;

        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };

        if (req.headers.range) {
          headers['Range'] = req.headers.range;
        }

        const options = {
          method: 'GET',
          headers: headers,
        };

        const proxyReq = clientReq.request(urlStr, options, (proxyRes) => {
          // Handle Redirects
          if (proxyRes.statusCode && [301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
            proxyRes.resume(); // CRITICAL: Consume the redirect response stream to avoid socket-hanging leaks
            const redirectLocation = proxyRes.headers.location;
            if (redirectLocation) {
              const resolvedRedirectUrl = new URL(redirectLocation, urlStr).toString();
              return forwardRequest(resolvedRedirectUrl, redirectCount + 1);
            }
          }

          // Set status code
          res.statusCode = proxyRes.statusCode || 200;

          // Copy key headers back to client
          const headersToCopy = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'cache-control',
            'content-encoding'
          ];

          headersToCopy.forEach((h) => {
            if (proxyRes.headers[h]) {
              res.setHeader(h, proxyRes.headers[h] as string);
            }
          });

          // Add universal CORS headers so cross-origin static hosts can play the proxied stream
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

          // Detect and override content-type for video formats to ensure browsers decode correctly
          const lowerUrl = targetUrl.toLowerCase();
          if (lowerUrl.endsWith('.mp4') || lowerUrl.includes('.mp4')) {
            res.setHeader('content-type', 'video/mp4');
          } else if (lowerUrl.endsWith('.m3u8') || lowerUrl.includes('.m3u8')) {
            res.setHeader('content-type', 'application/x-mpegURL');
          } else if (lowerUrl.endsWith('.ts') || lowerUrl.includes('.ts')) {
            res.setHeader('content-type', 'video/MP2T');
          } else if (lowerUrl.endsWith('.mkv') || lowerUrl.includes('.mkv')) {
            res.setHeader('content-type', 'video/x-matroska');
          } else if (lowerUrl.endsWith('.webm') || lowerUrl.includes('.webm')) {
            res.setHeader('content-type', 'video/webm');
          } else if (lowerUrl.endsWith('.avi') || lowerUrl.includes('.avi')) {
            res.setHeader('content-type', 'video/x-msvideo');
          } else if (!res.getHeader('content-type') || res.getHeader('content-type') === 'application/octet-stream') {
            res.setHeader('content-type', 'video/mp4');
          }

          // Add CORS and Range exposure headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

          // Pipe the response stream directly to Express response
          proxyRes.pipe(res);
        });

        activeProxyReq = proxyReq;

        proxyReq.on('error', (err) => {
          console.error('Proxy request error for ' + urlStr + ':', err);
          if (!res.headersSent) {
            res.status(500).send('Error proxying video stream: ' + err.message);
          }
        });

        // Safe timeout block to prevent hanging sockets
        proxyReq.setTimeout(3600000, () => {
          console.warn('[Proxy Video] Request timed out. Destroying stream to avoid leak.');
          proxyReq.destroy();
        });

        proxyReq.end();
      } catch (err: any) {
        console.error('Proxy exception:', err);
        if (!res.headersSent) {
          res.status(400).send('Invalid URL or proxy exception: ' + err.message);
        }
      }
    };

    forwardRequest(targetUrl);
  });

  function mapVideoUrl(url: string): string {
    if (!url) return url;
    let mapped = url;
    const mappings: { [key: string]: string } = {
      'BigBuckBunny.mp4': 'classroom.mp4',
      'ElephantsDream.mp4': 'people-detection.mp4',
      'TearsOfSteel.mp4': 'car-detection.mp4',
      'ForBiggerBlazes.mp4': 'free-way-traffic.mp4',
      'ForBiggerEscapes.mp4': 'store-aisle-detection.mp4',
      'SubaruOutbackInTheHills.mp4': 'driver-action-recognition.mp4',
      'ForBiggerFun.mp4': 'face-demographics-walking-and-pause.mp4'
    };
    for (const [key, replacement] of Object.entries(mappings)) {
      if (mapped.includes(key)) {
        mapped = `https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master/${replacement}`;
        break;
      }
    }

    // Normalize Dropbox URLs to use dl.dropboxusercontent.com and set raw=1
    if (mapped.includes('dropbox.com')) {
      mapped = mapped.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      // If the URL has ?dl=0, replace it, otherwise append raw=1/dl=1
      try {
        const urlObj = new URL(mapped);
        urlObj.searchParams.set('raw', '1');
        mapped = urlObj.toString();
      } catch (e) {
        if (mapped.includes('?')) {
          mapped = mapped.replace(/[?&]dl=[01]/g, '').replace(/[?&]raw=[01]/g, '') + '&raw=1';
        } else {
          mapped += '?raw=1';
        }
      }
    }
    return mapped;
  }

  // Redesigned server-side Auto Thumbnail extraction and analysis using FFmpeg
  const getVideoDuration = (videoUrl: string): Promise<number> => {
    const mapped = mapVideoUrl(videoUrl);
    return new Promise((resolve) => {
      const args = [
        '-timeout', '15000000', // 15s timeout
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        mapped
      ];

      const child = spawn('ffprobe', args);
      let stdout = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(stdout.trim());
          if (!isNaN(duration) && duration > 0) {
            return resolve(duration);
          }
        }
        resolve(1440); // default to 24 mins fallback
      });
      child.on('error', () => { resolve(1440); });

      // 10 seconds timeout
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) {}
        resolve(1440);
      }, 10000);
    });
  };

  const extractFrameAtTimestamp = (videoUrl: string, timestamp: number, outputPath: string): Promise<void> => {
    const mapped = mapVideoUrl(videoUrl);
    return new Promise((resolve, reject) => {
      // Seek before input for lightning-fast seeking and CDN-friendliness
      const args = [
        '-timeout', '15000000', // 15s microsecond timeout
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2',
        '-ss', timestamp.toString(),
        '-i', mapped,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath
      ];

      const child = spawn('ffmpeg', args);
      let stderr = '';

      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}. Stderr: ${stderr}`));
        }
      });
      child.on('error', (err) => { reject(err); });

      // 15 seconds timeout per frame
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) {}
        reject(new Error('FFmpeg seek operation timed out'));
      }, 15000);
    });
  };

  interface BackendFrameScore {
    dataUrl: string;
    score: number;
    reason: string;
  }

  const analyzeAndScoreBackendFrame = (
    width: number,
    height: number,
    data: Uint8Array | Buffer,
    jpegBuffer: Buffer
  ): BackendFrameScore => {
    const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
    const step = 8;
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

    if (avgLuminance < 25) {
      return { dataUrl, score: 0, reason: `Too dark (Luminance: ${avgLuminance.toFixed(1)})` };
    }
    if (avgLuminance > 230) {
      return { dataUrl, score: 0, reason: `Too bright/blank (Luminance: ${avgLuminance.toFixed(1)})` };
    }

    let sumSquaredDiffs = 0;
    for (const lum of lums) {
      const diff = lum - avgLuminance;
      sumSquaredDiffs += diff * diff;
    }
    const stdDev = Math.sqrt(sumSquaredDiffs / sampleCount);

    if (stdDev < 12) {
      return { dataUrl, score: 0, reason: `Low contrast/Flat scene (StdDev: ${stdDev.toFixed(1)})` };
    }

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

    const score = avgGradient * stdDev;
    return { dataUrl, score, reason: `Success (Score: ${score.toFixed(1)})` };
  };

  app.post('/api/generate-thumbnail-backend', async (req, res) => {
    const { videoUrl, minSec, maxSec, numCandidates } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ error: 'Missing videoUrl parameter' });
    }

    console.log(`[Thumbnail Service] Generating thumbnail for ${videoUrl}`);

    try {
      const duration = await getVideoDuration(videoUrl);
      console.log(`[Thumbnail Service] Probed duration: ${duration}s`);

      // Ensure seek range is strictly clamped within the actual probed video duration
      let effMin = minSec !== undefined ? Math.min(Number(minSec), duration * 0.1) : Math.min(120, duration * 0.1);
      let effMax = maxSec !== undefined ? Math.min(Number(maxSec), duration * 0.9) : Math.min(1200, duration * 0.9);

      if (effMin >= duration) {
        effMin = duration * 0.1;
      }
      if (effMax > duration) {
        effMax = duration * 0.9;
      }
      if (effMin >= effMax) {
        effMin = Math.max(0, duration * 0.05);
        effMax = duration * 0.95;
      }

      const count = numCandidates !== undefined ? Number(numCandidates) : 5;

      const rangeWidth = effMax - effMin;
      const timestamps: number[] = [];

      if (rangeWidth > 10) {
        for (let i = 0; i < count; i++) {
          const fraction = (i + 0.5) / count;
          const jitter = (Math.random() - 0.5) * (rangeWidth / (count * 2));
          const ts = effMin + fraction * rangeWidth + jitter;
          timestamps.push(Math.max(effMin, Math.min(effMax, ts)));
        }
      } else {
        for (let i = 0; i < count; i++) {
          timestamps.push(Math.random() * duration);
        }
      }

      console.log(`[Thumbnail Service] Selected timestamps:`, timestamps.map(t => t.toFixed(1)));

      let bestFrame: BackendFrameScore | null = null;
      let firstSuccessfulFrame: BackendFrameScore | null = null;

      for (let idx = 0; idx < timestamps.length; idx++) {
        const ts = timestamps[idx];
        const tempPath = path.join(os.tmpdir(), `frame_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 8)}.jpg`);
        
        try {
          await extractFrameAtTimestamp(videoUrl, ts, tempPath);
          if (fs.existsSync(tempPath)) {
            const buffer = fs.readFileSync(tempPath);
            const rawImageData = jpeg.decode(buffer);
            const analyzed = analyzeAndScoreBackendFrame(
              rawImageData.width,
              rawImageData.height,
              rawImageData.data,
              buffer
            );
            
            console.log(`[Thumbnail Service] Candidate ${idx + 1} at ${ts.toFixed(1)}s scored: ${analyzed.score.toFixed(1)} - ${analyzed.reason}`);

            if (!firstSuccessfulFrame) {
              firstSuccessfulFrame = analyzed;
            }

            if (!bestFrame || analyzed.score > bestFrame.score) {
              bestFrame = analyzed;
            }
            
            fs.unlink(tempPath, () => {});
          }
        } catch (err: any) {
          console.warn(`[Thumbnail Service] Failed candidate ${idx + 1} at ${ts.toFixed(1)}s:`, err.message || err);
          if (fs.existsSync(tempPath)) {
            fs.unlink(tempPath, () => {});
          }
        }
      }

      // If we found a frame but its score was 0, fall back to the first successful frame as baseline fallback
      if (bestFrame && bestFrame.score > 0) {
        console.log(`[Thumbnail Service] Best frame selected with score: ${bestFrame.score.toFixed(1)} (${bestFrame.reason})`);
        return res.json({ thumbnailUrl: bestFrame.dataUrl, score: bestFrame.score, reason: bestFrame.reason });
      } else if (firstSuccessfulFrame) {
        console.log(`[Thumbnail Service] All candidates fell below perfect score threshold. Using baseline successful frame.`);
        return res.json({ thumbnailUrl: firstSuccessfulFrame.dataUrl, score: firstSuccessfulFrame.score, reason: firstSuccessfulFrame.reason });
      } else {
        throw new Error("No frames could be successfully extracted or decoded from the video stream");
      }

    } catch (err: any) {
      console.error(`[Thumbnail Service] Error:`, err);
      return res.status(500).json({ error: err.message || 'Thumbnail generation failed' });
    }
  });

  // API Route to write a document inside a collection
  app.post('/api/db/:collection/:id', async (req, res) => {
    const { collection: colName, id: docId } = req.params;
    const documentData = req.body;
    
    const dbData = await ensureDatabaseLoaded();
    if (!dbData[colName]) {
      dbData[colName] = [];
    }

    const items = dbData[colName];
    const index = items.findIndex((i: any) => i.id === docId);

    if (index >= 0) {
      items[index] = { ...items[index], ...documentData, id: docId };
    } else {
      items.push({ ...documentData, id: docId });
    }

    await saveDatabase(dbData);
    res.json({ success: true, id: docId });
  });

  // API Route to delete a document
  app.delete('/api/db/:collection/:id', async (req, res) => {
    const { collection: colName, id: docId } = req.params;
    const dbData = await ensureDatabaseLoaded();
    if (dbData[colName]) {
      dbData[colName] = dbData[colName].filter((i: any) => i.id !== docId);
      await saveDatabase(dbData);
    }
    res.json({ success: true });
  });

  // New API: Storage Stats Endpoint
  app.get('/api/storage-stats', async (req, res) => {
    try {
      const dbData = await ensureDatabaseLoaded();
      const stats = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE) : { size: 0 };
      
      const sizes: Record<string, number> = {};
      let totalItems = 0;
      
      for (const key of Object.keys(dbData)) {
        sizes[key] = dbData[key].length;
        totalItems += dbData[key].length;
      }

      res.json({
        databaseSizeKB: parseFloat((stats.size / 1024).toFixed(2)),
        databaseSizeMB: parseFloat((stats.size / (1024 * 1024)).toFixed(3)),
        totalCollections: Object.keys(dbData).length,
        totalItemsCount: totalItems,
        counts: sizes,
        vpsStorageLocation: DB_FILE,
        nodeVersion: process.version,
        platform: process.platform,
        success: true
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Standard health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', mode: isProd ? 'production' : 'development', vpsPort: PORT });
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${isProd ? 'production' : 'development'} mode on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
