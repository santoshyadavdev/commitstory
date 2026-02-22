import { Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ActivitySummary, MilestoneEvent, MilestoneType, TimelineData } from '../../core/models/activity.models';
import { GitHubService } from '../../core/services/github.service';
import { ShareService, ShareResult } from '../../core/services/share.service';
import { StoryService, StoryResponse, GENRES, LANGUAGES } from '../../core/services/story.service';
import { ThemeService } from '../../core/services/theme.service';
import { ShareDropdownComponent } from '../../shared/components/share-dropdown/share-dropdown.component';
import { SharePlatform } from '../../core/constants/share.constants';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, ShareDropdownComponent],
  template: `
    <div class="min-h-screen bg-coderabbit-cream dark:bg-coderabbit-neutral text-gray-900 dark:text-white p-6">

      <!-- Share clipboard toast -->
      @if (shareNotification()) {
        <div
          class="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium px-5 py-3 rounded-xl shadow-2xl border border-gray-700 dark:border-gray-300 animate-fade-in"
          role="status"
          aria-live="polite"
        >
          <span class="text-lg leading-none" aria-hidden="true">📋</span>
          <span>{{ shareNotification() }}</span>
        </div>
      }

      <div class="max-w-5xl mx-auto">
        <h2 class="text-3xl font-bold mb-4">Your GitHub Story</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-8">
          Generate a career-spanning story or explore your milestone timeline based on your GitHub activity.
        </p>

        <div class="inline-flex bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-lg p-1 mb-8">
          <button
            class="px-4 py-2 text-sm rounded-md transition-colors"
            [class.bg-coderabbit-orange]="viewMode() === 'story'"
            [class.text-white]="viewMode() === 'story'"
            [class.text-gray-600]="viewMode() !== 'story'"
            [class.dark:text-gray-300]="viewMode() !== 'story'"
            (click)="setViewMode('story')"
          >
            Generate Story
          </button>
          <button
            class="px-4 py-2 text-sm rounded-md transition-colors"
            [class.bg-coderabbit-orange]="viewMode() === 'timeline'"
            [class.text-white]="viewMode() === 'timeline'"
            [class.text-gray-600]="viewMode() !== 'timeline'"
            [class.dark:text-gray-300]="viewMode() !== 'timeline'"
            (click)="onViewTimeline()"
          >
            View Timeline
          </button>
        </div>

        @if (viewMode() === 'story') {
          <div class="flex flex-wrap items-center gap-3 mb-8">
            <label class="text-xs text-gray-600 dark:text-gray-400" for="story-genre">Story Genre</label>
            <select
              id="story-genre"
              class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coderabbit-orange"
              [ngModel]="selectedGenre()"
              (ngModelChange)="selectedGenre.set($event)"
            >
              @for (genre of genres; track genre) {
                <option [value]="genre">{{ genre }}</option>
              }
            </select>

            <label class="text-xs text-gray-600 dark:text-gray-400" for="story-language">Story Language</label>
            <select
              id="story-language"
              class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coderabbit-orange"
              [ngModel]="selectedLanguage()"
              (ngModelChange)="selectedLanguage.set($event)"
            >
              @for (language of languages; track language) {
                <option [value]="language">{{ language }}</option>
              }
            </select>

            <button
              class="flex items-center gap-2 bg-coderabbit-orange hover:bg-coderabbit-orange/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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

          @if (aggregatedActivity(); as activity) {
            <div #shareCard class="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg mb-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-semibold text-coderabbit-orange">Career Totals</h3>
                <span class="text-xs text-gray-500 dark:text-gray-500">commitstory</span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
                <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ activity.commits }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Commits</p>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ activity.issues }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Issues</p>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ activity.pullRequests }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Pull Requests</p>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ activity.reviews }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Reviews</p>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ activity.lifetimeDiscussions }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Discussions</p>
                  <p class="text-xs text-gray-400 dark:text-gray-600 mt-0.5">all time</p>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ activity.lifetimeDiscussionComments }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Comments</p>
                  <p class="text-xs text-gray-400 dark:text-gray-600 mt-0.5">all time</p>
                </div>
                @if (memberSinceYear(); as sinceYear) {
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-coderabbit-orange">{{ sinceYear }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Member since</p>
                  </div>
                }
                @if (activity.privateContributions > 0) {
                  <div class="bg-gray-100 dark:bg-gray-800 border border-coderabbit-orange/40 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-coderabbit-orange">{{ activity.privateContributions }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Private</p>
                  </div>
                }
              </div>

              @if (generatedStory(); as storyResult) {
                <div class="border-t border-gray-200 dark:border-gray-800 pt-5">
                  <div class="flex items-center gap-3 mb-3">
                    <span class="bg-coderabbit-orange text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      {{ storyResult.genre }}
                    </span>
                    <span class="text-gray-500 dark:text-gray-500 text-xs">~3 min read</span>
                  </div>
                  <h4 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">{{ storyResult.title }}</h4>
                  <p class="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">{{ storyResult.story }}</p>
                  <p class="text-gray-500 dark:text-gray-500 text-xs mt-4">Produced by CodeRabbit</p>
                </div>
              }
            </div>

            @if (generatedStory()) {
              <div class="flex justify-end gap-2">
                <app-share-dropdown [onShare]="storyShareHandler"></app-share-dropdown>
                <button
                  class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 transition-colors"
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
        }

        @if (viewMode() === 'timeline') {
          @if (timelineError()) {
            <div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
              {{ timelineError() }}
            </div>
          }

          <div #timelineCard class="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg mb-4 border border-gray-200 dark:border-gray-800">
            <div class="flex items-center justify-between mb-5">
              <h3 class="text-xl font-semibold text-coderabbit-orange">Developer Milestone Timeline</h3>
              <span class="text-xs text-gray-500 dark:text-gray-500">commitstory</span>
            </div>

            @if (isLoadingTimeline()) {
              <div class="flex items-center gap-3 text-gray-600 dark:text-gray-300 py-8">
                <div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-coderabbit-orange"></div>
                <span>Loading timeline milestones…</span>
              </div>
            } @else if (timelineData(); as timeline) {
              @if (timeline.events.length > 0) {
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-gray-900 dark:text-white">{{ timeline.totalCommits }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Total Commits</p>
                  </div>
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-gray-900 dark:text-white">{{ timeline.totalPullRequests }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Total PRs</p>
                  </div>
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-gray-900 dark:text-white">{{ timeline.totalIssues }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Total Issues</p>
                  </div>
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-gray-900 dark:text-white">{{ timeline.totalDiscussions }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Total Discussions</p>
                  </div>
                </div>

                <div class="relative">
                  <div class="absolute left-5 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-700"></div>
                  @for (milestone of timeline.events; track milestone.type + '-' + (milestone.count ?? 0) + '-' + (milestone.date ?? 'none')) {
                    <div class="relative pl-12 pb-6 last:pb-0">
                      <div
                        class="absolute left-0 top-1 z-10 w-10 h-10 rounded-full border flex items-center justify-center text-xl leading-none"
                        [class.bg-coderabbit-orange/20]="!milestone.count"
                        [class.border-coderabbit-orange/40]="!milestone.count"
                        [class.bg-emerald-500/20]="!!milestone.count"
                        [class.border-emerald-500/40]="!!milestone.count"
                        aria-hidden="true"
                      >{{ getMilestoneIcon(milestone.type) }}</div>

                      <div class="bg-gray-100/80 dark:bg-gray-800/70 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <div class="flex flex-wrap items-center gap-2 mb-2">
                          <h4 class="text-base font-semibold text-gray-900 dark:text-white">{{ milestone.title }}</h4>
                          @if (milestone.count) {
                            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-600/30 text-emerald-200">
                              {{ milestone.count }}
                            </span>
                          }
                        </div>
                        <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">{{ milestone.description }}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatMilestoneDate(milestone) }}</p>
                        @if (milestone.url) {
                          <a
                            [href]="milestone.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-block mt-2 text-xs text-coderabbit-orange hover:text-coderabbit-orange/80"
                          >
                            View on GitHub ↗
                          </a>
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="py-8 text-center text-gray-500 dark:text-gray-400">
                  {{ timelineMessage() || 'No milestone data available yet.' }}
                </div>
              }
            } @else {
              <div class="py-8 text-center text-gray-500 dark:text-gray-400">Select View Timeline to load your milestones.</div>
            }
          </div>

          @if (timelineData() && !isLoadingTimeline()) {
            <div class="flex justify-end gap-2">
              <app-share-dropdown [onShare]="timelineShareHandler"></app-share-dropdown>
              <button
                class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 transition-colors"
                [disabled]="isDownloadingTimeline()"
                (click)="downloadTimelineAsImage()"
              >
                @if (isDownloadingTimeline()) {
                  <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  <span>Saving…</span>
                } @else {
                  <span>⬇ Download Timeline as Image</span>
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
  @ViewChild('timelineCard') private readonly timelineCard!: ElementRef<HTMLElement>;

  private readonly githubService = inject(GitHubService);
  protected readonly authService = inject(AuthService);
  private readonly storyService = inject(StoryService);
  private readonly themeService = inject(ThemeService);
  private readonly shareService = inject(ShareService);

  // Bound callbacks passed as @Input to ShareDropdownComponent
  readonly storyShareHandler = async (platform: SharePlatform): Promise<void> => {
    if (!this.shareCard) return;
    const bg = this.themeService.isDark() ? '#171717' : '#F6F6F1';
    const result = await this.shareService.shareWithImage(
      this.shareCard.nativeElement, platform, 'story', this.selectedGenre(), bg,
    );
    this.showShareToast(result);
  };

  readonly timelineShareHandler = async (platform: SharePlatform): Promise<void> => {
    if (!this.timelineCard) return;
    const bg = this.themeService.isDark() ? '#171717' : '#F6F6F1';
    const result = await this.shareService.shareWithImage(
      this.timelineCard.nativeElement, platform, 'timeline', undefined, bg,
    );
    this.showShareToast(result);
  };

  readonly genres = GENRES;
  readonly languages = LANGUAGES;

  readonly viewMode = signal<'story' | 'timeline'>('story');
  readonly selectedGenre = signal<string>(GENRES[0] as string);
  readonly selectedLanguage = signal<string>(LANGUAGES[0] as string);
  readonly isGenerating = signal(false);
  readonly isDownloading = signal(false);
  readonly isLoadingTimeline = signal(false);
  readonly isDownloadingTimeline = signal(false);
  readonly timelineError = signal<string | null>(null);
  readonly timelineMessage = signal<string | null>(null);
  readonly timelineData = signal<TimelineData | null>(null);
  readonly aggregatedActivity = signal<ActivitySummary | null>(null);
  readonly generatedStory = signal<StoryResponse | null>(null);
  readonly memberSinceYear = signal<number | null>(null);
  readonly shareNotification = signal<string | null>(null);

  constructor() {
    effect(() => {
      const createdAt = this.authService.user()?.created_at;
      if (createdAt) {
        this.memberSinceYear.set(new Date(createdAt).getFullYear());
      }
    });
  }

  private showShareToast(result: ShareResult): void {
    const msg = result === 'clipboard'
      ? '📋 Image copied! Paste it (Ctrl+V / ⌘V) into your post on the platform.'
      : '🔗 Opening platform — share your CommitStory!';
    this.shareNotification.set(msg);
    setTimeout(() => this.shareNotification.set(null), 5000);
  }

  setViewMode(mode: 'story' | 'timeline'): void {
    this.viewMode.set(mode);
  }

  onViewTimeline(): void {
    this.viewMode.set('timeline');
    this.timelineError.set(null);

    if (this.timelineData()) {
      return;
    }

    this.isLoadingTimeline.set(true);
    this.githubService.getMilestones().subscribe({
      next: (result) => {
        this.timelineData.set(result);
        this.timelineError.set(
          !result.username && result.events.length === 0
            ? 'Could not load your timeline right now. Please try again.'
            : null
        );
        this.timelineMessage.set(
          result.events.length
            ? null
            : 'No milestones available yet. Keep contributing and check back soon.'
        );
        this.isLoadingTimeline.set(false);
      },
      error: () => {
        this.timelineError.set('Could not load your timeline right now. Please try again.');
        this.timelineMessage.set('Unable to load milestones at this time.');
        this.isLoadingTimeline.set(false);
      },
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

  getMilestoneIcon(type: MilestoneType): string {
    switch (type) {
      case MilestoneType.account_created:
        return '📅';
      case MilestoneType.first_pr:
      case MilestoneType.pr_count:
        return '🔀';
      case MilestoneType.first_issue:
        return '🐞';
      case MilestoneType.first_discussion:
        return '💬';
      case MilestoneType.commit_count:
        return '🧩';
      default:
        return '•';
    }
  }

  formatMilestoneDate(event: MilestoneEvent): string {
    if (!event.date) {
      return 'Date unavailable';
    }

    const date = new Date(event.date);
    if (event.type === MilestoneType.commit_count) {
      return `Reached in ${date.getFullYear()}`;
    }

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  async downloadAsImage(): Promise<void> {
    if (!this.shareCard) return;
    this.isDownloading.set(true);
    try {
      const { toPng } = await import('html-to-image');
      const backgroundColor = this.themeService.isDark() ? '#171717' : '#F6F6F1';
      const dataUrl = await toPng(this.shareCard.nativeElement, {
        backgroundColor,
        pixelRatio: 2,
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

  async downloadTimelineAsImage(): Promise<void> {
    if (!this.timelineCard) return;
    this.isDownloadingTimeline.set(true);
    try {
      const { toPng } = await import('html-to-image');
      const backgroundColor = this.themeService.isDark() ? '#171717' : '#F6F6F1';
      const dataUrl = await toPng(this.timelineCard.nativeElement, {
        backgroundColor,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      const username = this.timelineData()?.username || 'developer';
      link.download = `github-timeline-${username}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Timeline download failed:', err);
    } finally {
      this.isDownloadingTimeline.set(false);
    }
  }
}
