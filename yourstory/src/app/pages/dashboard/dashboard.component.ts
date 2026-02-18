import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { GitHubService } from '../../core/services/github.service';
import { AuthService } from '../../core/auth/auth.service';
import { StoryService, StoryResponse, GENRES } from '../../core/services/story.service';
import { ActivitySummary } from '../../core/models/activity.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-gray-950 text-white p-6">
      <div class="max-w-5xl mx-auto">
        <h2 class="text-3xl font-bold mb-4">Your GitHub Story</h2>
        <p class="text-gray-400 mb-8">
          Generate a career-spanning story based on your GitHub contributions across the last 4 years.
          Choose a genre and let AI craft your unique developer narrative.
        </p>

        <!-- Genre selector + generate button -->
        <div class="flex flex-wrap items-center gap-3 mb-8">
          <select
            class="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            [ngModel]="selectedGenre()"
            (ngModelChange)="selectedGenre.set($event)"
          >
            @for (genre of genres; track genre) {
              <option [value]="genre">{{ genre }}</option>
            }
          </select>

          <button
            class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            [disabled]="isGenerating()"
            (click)="onGenerateStory()"
          >
            @if (isGenerating()) {
              <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
              <span>Generating…</span>
            } @else {
              <span>✨ Generate Story</span>
            }
          </button>
        </div>

        <!-- Aggregated career stats -->
        @if (aggregatedActivity(); as activity) {
          <div class="bg-gray-900 rounded-2xl p-6 shadow-lg mb-6">
            <h3 class="text-xl font-semibold text-indigo-400 mb-4">Career Totals</h3>

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
          </div>

          <!-- Generated story card -->
          @if (generatedStory(); as storyResult) {
            <div class="bg-gray-900 rounded-2xl p-6 shadow-lg">
              <div class="flex items-center gap-3 mb-4">
                <span class="bg-indigo-700 text-indigo-100 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  {{ storyResult.genre }}
                </span>
                <span class="text-gray-500 text-xs">~3 min read</span>
              </div>
              <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{{ storyResult.story }}</p>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class DashboardComponent {
  private readonly githubService = inject(GitHubService);
  protected readonly authService = inject(AuthService);
  private readonly storyService = inject(StoryService);

  readonly genres = GENRES;

  readonly selectedGenre = signal<string>(GENRES[0] as string);
  readonly isGenerating = signal(false);
  readonly aggregatedActivity = signal<ActivitySummary | null>(null);
  readonly generatedStory = signal<StoryResponse | null>(null);

  onGenerateStory(): void {
    this.isGenerating.set(true);

    this.githubService.getAggregatedActivity().pipe(
      switchMap((activity) => {
        this.aggregatedActivity.set(activity);
        return this.storyService.generateStory(this.selectedGenre(), activity);
      })
    ).subscribe({
      next: (result) => {
        this.generatedStory.set(result);
        this.isGenerating.set(false);
      },
      error: () => {
        this.isGenerating.set(false);
      },
    });
  }
}
