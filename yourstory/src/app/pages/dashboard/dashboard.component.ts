import { Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { GitHubService } from '../../core/services/github.service';
import { AuthService } from '../../core/auth/auth.service';
import { StoryService, StoryResponse, GENRES, LANGUAGES } from '../../core/services/story.service';
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
          Generate a career-spanning story based on your GitHub contributions since you joined.
          Choose a genre and let AI craft your unique developer narrative.
        </p>

        <!-- Genre/language selectors + generate button -->
        <div class="flex flex-wrap items-center gap-3 mb-8">
          <label class="text-xs text-gray-400" for="story-genre">Story Genre</label>
          <select
            id="story-genre"
            class="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            [ngModel]="selectedGenre()"
            (ngModelChange)="selectedGenre.set($event)"
          >
            @for (genre of genres; track genre) {
              <option [value]="genre">{{ genre }}</option>
            }
          </select>

          <label class="text-xs text-gray-400" for="story-language">Story Language</label>
          <select
            id="story-language"
            class="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            [ngModel]="selectedLanguage()"
            (ngModelChange)="selectedLanguage.set($event)"
          >
            @for (language of languages; track language) {
              <option [value]="language">{{ language }}</option>
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

        <!-- Shareable card (captured for download) -->
        @if (aggregatedActivity(); as activity) {
          <div #shareCard class="bg-gray-900 rounded-2xl p-6 shadow-lg mb-4">

            <!-- Card header -->
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-semibold text-indigo-400">Career Totals</h3>
              <span class="text-xs text-gray-500">commitstory</span>
            </div>

            <!-- Stats grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
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
              @if (memberSinceYear(); as sinceYear) {
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-indigo-300">{{ sinceYear }}</p>
                  <p class="text-xs text-gray-400 mt-1">Member since</p>
                </div>
              }
            </div>

            <!-- Generated story -->
            @if (generatedStory(); as storyResult) {
              <div class="border-t border-gray-800 pt-5">
                <div class="flex items-center gap-3 mb-3">
                  <span class="bg-indigo-700 text-indigo-100 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    {{ storyResult.genre }}
                  </span>
                  <span class="text-gray-500 text-xs">~3 min read</span>
                </div>
                <h4 class="text-2xl font-bold text-white mb-3">{{ storyResult.title }}</h4>
                <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{{ storyResult.story }}</p>
                <p class="text-gray-500 text-xs mt-4">Produced by CodeRabbit</p>
              </div>
            }
          </div>

          <!-- Download button — shown once results are ready -->
          @if (generatedStory()) {
            <div class="flex justify-end">
              <button
                class="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-700 transition-colors"
                [disabled]="isDownloading()"
                (click)="downloadAsImage()"
              >
                @if (isDownloading()) {
                  <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  <span>Saving…</span>
                } @else {
                  <span>⬇ Download as Image</span>
                }
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class DashboardComponent {
  @ViewChild('shareCard') private readonly shareCard!: ElementRef<HTMLElement>;

  private readonly githubService = inject(GitHubService);
  protected readonly authService = inject(AuthService);
  private readonly storyService = inject(StoryService);

  readonly genres = GENRES;
  readonly languages = LANGUAGES;

  readonly selectedGenre = signal<string>(GENRES[0] as string);
  readonly selectedLanguage = signal<string>(LANGUAGES[0] as string);
  readonly isGenerating = signal(false);
  readonly isDownloading = signal(false);
  readonly aggregatedActivity = signal<ActivitySummary | null>(null);
  readonly generatedStory = signal<StoryResponse | null>(null);
  readonly memberSinceYear = signal<number | null>(null);

  constructor() {
    // Eagerly derive the "Member since" year from the authenticated user profile.
    effect(() => {
      const createdAt = this.authService.user()?.created_at;
      if (createdAt) {
        this.memberSinceYear.set(new Date(createdAt).getFullYear());
      }
    });
  }

  onGenerateStory(): void {
    this.isGenerating.set(true);

    const createdAt = this.authService.user()?.created_at;

    this.githubService.getAggregatedActivity(createdAt).pipe(
      switchMap((activity) => {
        this.aggregatedActivity.set(activity);
        return this.storyService.generateStory(
          this.selectedGenre(),
          this.selectedLanguage(),
          activity,
          createdAt,
          activity.topRepositories
        );
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

  async downloadAsImage(): Promise<void> {
    if (!this.shareCard) return;
    this.isDownloading.set(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(this.shareCard.nativeElement, {
        backgroundColor: '#0f172a', // gray-950
        pixelRatio: 2,              // retina quality
      });
      const link = document.createElement('a');
      link.download = `github-story-${this.generatedStory()?.genre ?? 'career'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      this.isDownloading.set(false);
    }
  }
}
