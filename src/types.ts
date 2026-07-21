export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'user' | 'admin';
  createdAt: any;
  isBanned?: boolean;
  permissions?: string[];
}

export type GenreType = 'Action' | 'Adventure' | 'Fantasy' | 'Sci-Fi' | 'Drama' | 'Comedy' | 'Slice of Life' | 'Mystery' | 'Romance' | 'Thriller' | 'Demons' | 'Mecha' | 'Sports';

export interface Anime {
  id: string;
  title: string;
  description: string;
  bannerUrl: string; // large top banner
  thumbnailUrl: string; // vertical card thumbnail
  genres: GenreType[];
  rating: string; // e.g. "9.2", "8.5"
  status: string;
  category: 'Popular' | 'Trending' | 'Featured' | 'Regular';
  releaseYear: number;
  totalSeasons?: number;
  episodeCount?: number;
  createdAt: any;
  type?: 'Series' | 'Movie';
  videoUrl?: string; // used for Movie
  duration?: number; // used for Movie (in seconds)
  studio?: string;
  language?: 'Sub' | 'Dub' | 'Both';
  characters?: { name: string; role: 'Main' | 'Supporting'; avatarUrl?: string }[];
  voiceActors?: { character: string; actor: string; avatarUrl?: string }[];
}

export interface Comment {
  id: string;
  episodeId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: any;
}

export interface Review {
  id: string;
  animeId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number; // 1 to 5 star rating
  reviewText: string;
  createdAt: any;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  animeId: string;
  createdAt: any;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: any;
}

export interface ScheduleItem {
  id: string;
  animeId: string;
  animeTitle: string;
  episodeNumber: number;
  releaseDay: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  time: string; // e.g. "18:30"
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  source?: string;
  createdAt: any;
}

export interface Season {
  id: string; // animeId_seasonNum
  animeId: string;
  number: number;
  name: string; // e.g., "Season 1", "Season 2: Shibuya Incident"
  episodeCount: number;
  createdAt: any;
}

export interface Episode {
  id: string; // animeId_seasonNum_episodeNum
  animeId: string;
  seasonId: string; // refers to Season.id
  seasonNumber: number;
  number: number;
  title: string;
  description?: string;
  videoUrl: string; // streaming mp4 url
  thumbnailUrl: string; // episode screenshot
  duration?: number; // duration in seconds
  createdAt: any;
  hasSkipIntro?: boolean;
  introShowAt?: number;
  introShowDuration?: number;
  introSkipTo?: number;
  hasSkipOutro?: boolean;
  outroShowAt?: number;
  outroShowDuration?: number;
  outroSkipTo?: number;
  lastGenerated?: string; // ISO string or timestamp of when thumbnail was last generated
  updatedAt?: any;
}

export interface WatchHistory {
  id: string; // userId_episodeId
  userId: string;
  animeId: string;
  episodeId: string;
  animeTitle: string;
  episodeTitle: string;
  episodeNumber: number;
  seasonNumber: number;
  progress: number; // in seconds
  duration: number; // in seconds
  updatedAt: any;
  completed: boolean;
  animeThumbnail: string;
}

export interface Favorite {
  id: string; // userId_animeId
  userId: string;
  animeId: string;
  createdAt: any;
}
