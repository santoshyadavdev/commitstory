import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { YearlyActivity } from '../models/activity.models';

export interface StoryRequest {
  year: number;
  genre: string;
  activity: YearlyActivity;
}

export interface StoryResponse {
  story: string;
  year: number;
  genre: string;
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

@Injectable({ providedIn: 'root' })
export class StoryService {
  private readonly http = inject(HttpClient);

  /**
   * Sends contribution data to the server and returns a generated narrative.
   */
  generateStory(
    year: number,
    genre: string,
    activity: YearlyActivity
  ): Observable<StoryResponse> {
    const body: StoryRequest = { year, genre, activity };
    return this.http.post<StoryResponse>('/api/stories/generate', body);
  }
}
