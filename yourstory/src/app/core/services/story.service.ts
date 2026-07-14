import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ActivitySummary, RepositoryContribution } from '../models/activity.models';

export interface StoryRequest {
  genre: string;
  language?: string;
  activity: ActivitySummary;
  year?: number;
  createdAt?: string;
  username: string;
  topRepositories?: RepositoryContribution[];
}

export interface StoryResponse {
  title: string;
  story: string;
  genre: string;
  year?: number;
  imageGenerationEnabled?: boolean;
  shareUrl?: string;
}

export interface ImageGenerationRequest {
  genre: string;
  storyTitle: string;
  username: string;
  stats: Record<string, number>;
}

export interface ImageGenerationResponse {
  imageUrl: string;
}

export const GENRES = [
  'Drama',
  'Biography',
  'Comedy',
  'Adventure',
  'Thriller',
  'Sci-Fi',
  'Documentary',
  'Sports',
] as const;

export const LANGUAGES = ['English', 'Hindi', 'Mandarin Chinese', 'Japanese', 'Spanish', 'French', 'German'] as const;

@Injectable({ providedIn: 'root' })
export class StoryService {
  private readonly http = inject(HttpClient);

  /**
   * Sends aggregated career contribution data to the server and returns a generated narrative.
   */
  generateStory(
    genre: string,
    language: string,
    activity: ActivitySummary,
    username: string,
    createdAt?: string,
    topRepositories?: RepositoryContribution[]
  ): Observable<StoryResponse> {
    const body: StoryRequest = { genre, language, activity, username, createdAt, topRepositories };
    return this.http.post<StoryResponse>('/api/stories/generate', body);
  }

  /**
   * Requests a thematic AI image for the generated story card.
   */
  generateStoryImage(
    genre: string,
    storyTitle: string,
    username: string,
    stats: Record<string, number>
  ): Observable<ImageGenerationResponse> {
    const body: ImageGenerationRequest = { genre, storyTitle, username, stats };
    return this.http.post<ImageGenerationResponse>('/api/stories/generate-image', body);
  }
}
