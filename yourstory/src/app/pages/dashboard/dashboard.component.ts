import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { GitHubService } from '../../core/services/github.service';
import { AuthService } from '../../core/auth/auth.service';
import { StoryService, StoryResponse, GENRES } from '../../core/services/story.service';
import { YearlyActivity } from '../../core/models/activity.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-gray-950 text-white p-6">
      <div class="max-w-5xl mx-auto">
        <h2 class="text-3xl font-bold mb-8">Your GitHub Story</h2>

        @if (loading()) {
          <div class="flex items-center justify-center py-20">
            <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        }

        @if (!loading() && activities().length === 0) {
          <p class="text-gray-400">No activity data available.</p>
        }

        <div class="grid grid-cols-1 gap-6">
          @for (activity of activities(); track activity.year) {
            <div class="bg-gray-900 rounded-2xl p-6 shadow-lg">
              <h3 class="text-xl font-semibold text-indigo-400 mb-4">{{ activity.year }}</h3>

              <!-- Stats grid -->
              <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-white">{{ activity.commits }}</p>
                  <p class="text-xs text-gray-400 mt-1">Commits</p>
                </div>
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-white">{{ activity.issues }}</p>
                  <p class="text-xs text-gray-400 mt-1">Issues</p>
                </div>
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-white">{{ activity.pullRequests }}</p>
                  <p class="text-xs text-gray-400 mt-1">Pull Requests</p>
                </div>
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-white">{{ activity.reviews }}</p>
                  <p class="text-xs text-gray-400 mt-1">Reviews</p>
                </div>
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-white">{{ activity.lifetimeDiscussions }}</p>
                  <p class="text-xs text-gray-400 mt-1">Discussions</p>
                  <p class="text-xs text-gray-600 mt-0.5">all time</p>
                </div>
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-white">{{ activity.lifetimeDiscussionComments }}</p>
                  <p class="text-xs text-gray-400 mt-1">Comments</p>
                  <p class="text-xs text-gray-600 mt-0.5">all time</p>
                </div>
                @if (activity.privateContributions > 0) {
                  <div class="bg-gray-800 border border-indigo-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-indigo-400">{{ activity.privateContributions }}</p>
                    <p class="text-xs text-gray-400 mt-1">Private</p>
                  </div>
                }
              </div>

              <!-- Genre selector + generate button -->
              <div class="mt-4 flex flex-wrap items-center gap-3">
                <select
                  class="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  [ngModel]="selectedGenres()[activity.year] || genres[0]"
                  (ngModelChange)="onGenreChange(activity.year, $event)"
                >
                  @for (genre of genres; track genre) {
                    <option [value]="genre">{{ genre }}</option>
                  }
                </select>

                <button
                  class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  [disabled]="generatingStory()[activity.year]"
                  (click)="onGenerateStory(activity)"
                >
                  @if (generatingStory()[activity.year]) {
                    <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    <span>Generating…</span>
                  } @else {
                    <span>✨ Generate Story</span>
                  }
                </button>
              </div>

              <!-- Generated story card -->
              @if (generatedStories()[activity.year]; as storyResult) {
                <div class="mt-5 bg-gray-800 rounded-xl p-5">
                  <div class="flex items-center gap-3 mb-3">
                    <span class="bg-indigo-700 text-indigo-100 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      {{ storyResult.genre }}
                    </span>
                    <span class="text-gray-500 text-xs">~3 min read</span>
                  </div>
                  <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{{ storyResult.story }}</p>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly githubService = inject(GitHubService);
  protected readonly authService = inject(AuthService);
  private readonly storyService = inject(StoryService);

  readonly genres = GENRES;

  readonly loading = signal(true);
  readonly activities = signal<YearlyActivity[]>([]);

  readonly generatingStory = signal<Record<number, boolean>>({});
  readonly generatedStories = signal<Record<number, StoryResponse>>({});
  readonly selectedGenres = signal<Record<number, string>>({});

  ngOnInit(): void {
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

    forkJoin(years.map((year) => this.githubService.getYearlyActivity(year))).subscribe({
      next: (results) => {
        this.activities.set(results);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  onGenreChange(year: number, genre: string): void {
    this.selectedGenres.update((prev) => ({ ...prev, [year]: genre }));
  }

  onGenerateStory(activity: YearlyActivity): void {
    const { year } = activity;
    const genre = this.selectedGenres()[year] ?? this.genres[0];

    this.generatingStory.update((prev) => ({ ...prev, [year]: true }));

    this.storyService.generateStory(year, genre, activity).subscribe({
      next: (result) => {
        this.generatedStories.update((prev) => ({ ...prev, [year]: result }));
        this.generatingStory.update((prev) => ({ ...prev, [year]: false }));
      },
      error: () => {
        this.generatingStory.update((prev) => ({ ...prev, [year]: false }));
      },
    });
  }
}
