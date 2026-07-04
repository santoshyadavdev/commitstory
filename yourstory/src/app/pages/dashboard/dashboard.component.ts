import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, of, switchMap } from 'rxjs';
import {
  ActivitySummary,
  MilestoneEvent,
  MilestoneType,
  RepositoryInsight,
  TimelineData,
} from '../../core/models/activity.models';
import { GitHubService, GitHubUserProfile } from '../../core/services/github.service';
import { ShareService, ShareResult } from '../../core/services/share.service';
import { StoryService, StoryResponse, GENRES, LANGUAGES } from '../../core/services/story.service';
import { ThemeService } from '../../core/services/theme.service';
import { ShareDropdownComponent } from '../../shared/components/share-dropdown/share-dropdown.component';
import { SharePlatform } from '../../core/constants/share.constants';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ShareDropdownComponent],
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

        <!-- Username search -->
        <div class="mb-8">
          <form (ngSubmit)="onSearchUser()" class="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div class="flex flex-1 gap-2 w-full sm:w-auto">
              <input
                type="text"
                id="github-username"
                class="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-coderabbit-orange placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Enter GitHub username…"
                [ngModel]="usernameInput()"
                (ngModelChange)="usernameInput.set($event)"
                name="username"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
              />
              <button
                type="submit"
                class="flex items-center gap-2 bg-coderabbit-orange hover:bg-coderabbit-orange/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
                [disabled]="isSearching() || !usernameInput().trim()"
              >
                @if (isSearching()) {
                  <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  <span>Loading…</span>
                } @else {
                  <span>🔍 View Story</span>
                }
              </button>
            </div>
          </form>
          @if (searchError()) {
            <p class="mt-2 text-sm text-red-600 dark:text-red-400">{{ searchError() }}</p>
          }
          @if (userProfile(); as profile) {
            <div class="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <img [src]="profile.avatar_url" [alt]="profile.login" class="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600" />
              <span class="font-medium text-gray-900 dark:text-white">{{ profile.name || profile.login }}</span>
              <span class="text-gray-400">·</span>
              <a [href]="profile.html_url" target="_blank" rel="noopener noreferrer" class="text-coderabbit-orange hover:underline">@{{ profile.login }}</a>
            </div>
          }
        </div>

        @if (!currentUsername()) {
          <!-- Landing prompt -->
          <div class="flex flex-col items-center justify-center py-24 text-center">
            <div class="text-6xl mb-6">🐇</div>
            <h2 class="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Explore Any GitHub Journey</h2>
            <p class="text-gray-500 dark:text-gray-400 max-w-md">
              Enter a GitHub username above to generate a career-spanning story, explore milestone timelines, and view repository insights — no login required.
            </p>
          </div>
        } @else {
        <h2 class="text-3xl font-bold mb-4">GitHub Story</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-8">
          Generate a career-spanning story or explore the milestone timeline based on GitHub activity.
        </p>

        <div class="inline-flex bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-lg p-1 mb-8">
          <button
            class="px-4 py-2 text-sm rounded-md transition-colors"
            [class.bg-coderabbit-orange]="viewMode() === 'timeline'"
            [class.text-white]="viewMode() === 'timeline'"
            [class.text-gray-600]="viewMode() !== 'timeline'"
            [class.dark:text-gray-300]="viewMode() !== 'timeline'"
            (click)="onViewTimeline()"
          >
            Timeline
          </button>
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
            [class.bg-coderabbit-orange]="viewMode() === 'insights'"
            [class.text-white]="viewMode() === 'insights'"
            [class.text-gray-600]="viewMode() !== 'insights'"
            [class.dark:text-gray-300]="viewMode() !== 'insights'"
            (click)="onViewInsights()"
          >
            Insights
          </button>
        </div>

        @if (viewMode() === 'story') {
          <div class="flex flex-wrap items-center gap-3 mb-8">
            <div class="flex items-center gap-2">
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
            </div>

            <div class="flex items-center gap-2">
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
            </div>

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

                  @if (isImageGenerationEnabled()) {
                    @if (isGeneratingImage()) {
                      <div class="mb-4 h-52 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"></div>
                    } @else if (storyImageUrl(); as imageUrl) {
                      <img
                        [src]="imageUrl"
                        [alt]="storyResult.title + ' thematic artwork'"
                        class="mb-4 w-full h-auto object-contain rounded-xl border border-gray-200 dark:border-gray-700"
                        loading="lazy"
                      />
                    }
                  }

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

          <div #timelineCard class="bg-white dark:bg-gray-900 rounded-2xl p-6 md:p-8 shadow-lg mb-4 border border-gray-200 dark:border-gray-800">
            <!-- Header -->
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-coderabbit-orange to-amber-500 flex items-center justify-center shadow-md">
                  <span class="text-white text-lg">🗓️</span>
                </div>
                <div>
                  <h3 class="text-xl font-bold text-gray-900 dark:text-white">Developer Timeline</h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Your journey on GitHub — scroll to explore</p>
                </div>
              </div>
              <span class="text-xs text-gray-400 dark:text-gray-600 font-mono">commitstory</span>
            </div>

            <!-- Filter Chips -->
            @if (timelineData()) {
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Filters</span>
                  <div class="flex gap-3">
                    <button
                      class="text-xs font-medium text-coderabbit-orange hover:text-coderabbit-orange/70 transition-colors"
                      (click)="selectAllFilters()"
                    >All</button>
                    <button
                      class="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      (click)="clearAllFilters()"
                    >None</button>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    class="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200"
                    [class]="filterAccountCreated()
                      ? 'bg-orange-50 dark:bg-orange-950/40 border-coderabbit-orange/50 text-coderabbit-orange shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'"
                    (click)="filterAccountCreated.set(!filterAccountCreated())"
                  >
                    <span class="w-2 h-2 rounded-full bg-coderabbit-orange" [class.opacity-30]="!filterAccountCreated()"></span>
                    Account
                  </button>
                  <button
                    class="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200"
                    [class]="filterFirstPR()
                      ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-400/50 text-violet-600 dark:text-violet-400 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'"
                    (click)="filterFirstPR.set(!filterFirstPR())"
                  >
                    <span class="w-2 h-2 rounded-full bg-violet-500" [class.opacity-30]="!filterFirstPR()"></span>
                    First PR
                  </button>
                  <button
                    class="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200"
                    [class]="filterFirstIssue()
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400/50 text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'"
                    (click)="filterFirstIssue.set(!filterFirstIssue())"
                  >
                    <span class="w-2 h-2 rounded-full bg-amber-500" [class.opacity-30]="!filterFirstIssue()"></span>
                    Issues
                  </button>
                  <button
                    class="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200"
                    [class]="filterFirstDiscussion()
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-400/50 text-teal-600 dark:text-teal-400 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'"
                    (click)="filterFirstDiscussion.set(!filterFirstDiscussion())"
                  >
                    <span class="w-2 h-2 rounded-full bg-teal-500" [class.opacity-30]="!filterFirstDiscussion()"></span>
                    Discussions
                  </button>
                  <button
                    class="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200"
                    [class]="filterPRMilestones()
                      ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-400/50 text-violet-600 dark:text-violet-400 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'"
                    (click)="filterPRMilestones.set(!filterPRMilestones())"
                  >
                    <span class="w-2 h-2 rounded-full bg-violet-500" [class.opacity-30]="!filterPRMilestones()"></span>
                    PR Milestones
                  </button>
                  <button
                    class="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200"
                    [class]="filterCommitMilestones()
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400/50 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'"
                    (click)="filterCommitMilestones.set(!filterCommitMilestones())"
                  >
                    <span class="w-2 h-2 rounded-full bg-emerald-500" [class.opacity-30]="!filterCommitMilestones()"></span>
                    Commits
                  </button>
                </div>
              </div>
            }

            @if (isLoadingTimeline()) {
              <div class="flex flex-col items-center gap-4 py-16">
                <div class="relative">
                  <div class="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 dark:border-gray-700 border-t-coderabbit-orange"></div>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Loading your timeline…</span>
              </div>
            } @else if (timelineData(); as timeline) {
              @if (timeline.events.length > 0) {
                <!-- Stats Row -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                  <div class="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800">
                    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ timeline.totalCommits | number }}</p>
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Commits</p>
                  </div>
                  <div class="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800">
                    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-400 to-violet-600"></div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ timeline.totalPullRequests | number }}</p>
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Pull Requests</p>
                  </div>
                  <div class="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800">
                    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600"></div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ timeline.totalIssues | number }}</p>
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Issues</p>
                  </div>
                  <div class="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800">
                    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 to-teal-600"></div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ timeline.totalDiscussions | number }}</p>
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Discussions</p>
                  </div>
                </div>

                <!-- Horizontal Swim-Lane Timeline -->
                @if (filteredTimelineEvents().length > 0) {
                  <div class="overflow-x-auto -mx-6 md:-mx-8 px-6 md:px-8 timeline-scroll">
                    <div class="relative inline-flex min-w-max" style="height: 480px;">
                      <!-- Spine line -->
                      <div class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent"></div>

                      @for (milestone of filteredTimelineEvents(); track milestone.type + '-' + (milestone.count ?? 0) + '-' + (milestone.date ?? 'none'); let i = $index) {
                        <div class="relative" style="width: 100px; height: 100%;">

                          <!-- Year separator -->
                          @if (i === 0 || getMilestoneYear(milestone) !== getMilestoneYear(filteredTimelineEvents()[i - 1])) {
                            <!-- Vertical dashed line spanning the full height -->
                            <div class="absolute top-0 bottom-0 left-0 w-px border-l border-dashed border-gray-300 dark:border-gray-600 z-10"></div>
                            <!-- Year badge pinned at top-left outside the node area -->
                            <div class="absolute -top-0 left-0 -translate-x-1/2 z-30">
                              <span class="text-[10px] font-bold uppercase tracking-widest text-white bg-gray-400 dark:bg-gray-600 px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap">
                                {{ getMilestoneYear(milestone) }}
                              </span>
                            </div>
                          }

                          <!-- Horizontal connector at spine (left) -->
                          @if (i > 0) {
                            <div class="absolute top-1/2 left-0 w-1/2 h-px -translate-y-1/2 bg-gray-200 dark:bg-gray-700"></div>
                          }
                          <!-- Horizontal connector at spine (right) -->
                          @if (i < filteredTimelineEvents().length - 1) {
                            <div class="absolute top-1/2 right-0 w-1/2 h-px -translate-y-1/2 bg-gray-200 dark:bg-gray-700"></div>
                          }

                          <!-- Dot on spine -->
                          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 z-10"></div>

                          <!-- Vertical stem from spine to node -->
                          <div
                            class="absolute left-1/2 -translate-x-1/2 w-px"
                            [class]="getMilestoneAccentClasses(milestone.type) + ' opacity-40'"
                            [style.top.%]="getStemTop(milestone.type)"
                            [style.height.%]="getStemHeight(milestone.type)"
                          ></div>

                          <!-- Node group at lane position -->
                          <div
                            class="absolute flex flex-col items-center z-20"
                            [style.top.%]="getMilestoneLanePercent(milestone.type)"
                            [style.left]="'50%'"
                            [style.transform]="'translate(-50%, -50%)'"
                          >
                            <button
                              class="w-11 h-11 rounded-full flex items-center justify-center text-lg shadow-lg ring-4 ring-white dark:ring-gray-900 transition-all duration-300 cursor-pointer"
                              [class]="getMilestoneNodeClasses(milestone.type) + (expandedMilestone() === i ? ' scale-125 ring-coderabbit-orange/40' : ' hover:scale-110')"
                              (click)="toggleMilestone(i)"
                              [attr.aria-expanded]="expandedMilestone() === i"
                              [attr.aria-label]="milestone.title"
                            >{{ getMilestoneIcon(milestone.type) }}</button>

                            <p class="text-[10px] font-semibold text-gray-600 dark:text-gray-400 mt-1.5 text-center leading-tight max-w-[90px] line-clamp-2">
                              {{ milestone.title }}
                            </p>
                          </div>

                        </div>
                      }
                    </div>
                  </div>

                  <!-- Scroll hint -->
                  <div class="flex items-center justify-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    <span>←</span>
                    <span>Scroll to explore</span>
                    <span>→</span>
                  </div>

                  <!-- Detail panel for selected milestone -->
                  @if (selectedMilestoneDetail(); as milestone) {
                    <div class="mt-4 animate-fade-in">
                      <div
                        class="relative overflow-hidden rounded-2xl p-5 border shadow-lg"
                        [class]="getMilestoneCardClasses(milestone.type)"
                      >
                        <div
                          class="absolute top-0 left-0 right-0 h-1"
                          [class]="getMilestoneAccentClasses(milestone.type)"
                        ></div>

                        <div class="flex items-start gap-3 mt-1">
                          <span class="text-3xl">{{ getMilestoneIcon(milestone.type) }}</span>
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <h4 class="text-base font-bold text-gray-900 dark:text-white">{{ milestone.title }}</h4>
                              @if (milestone.count) {
                                <span
                                  class="text-xs font-semibold px-2 py-0.5 rounded-full"
                                  [class]="getMilestoneBadgeClasses(milestone.type)"
                                >{{ milestone.count | number }}</span>
                              }
                            </div>
                            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-2">{{ milestone.description }}</p>
                            <div class="flex items-center gap-4 mt-3">
                              <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                {{ formatMilestoneDate(milestone) }}
                              </span>
                              @if (milestone.url) {
                                <a
                                  [href]="milestone.url"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="inline-flex items-center gap-1 text-xs font-medium text-coderabbit-orange hover:text-coderabbit-orange/70 transition-colors"
                                >
                                  View on GitHub ↗
                                </a>
                              }
                            </div>
                          </div>
                          <button
                            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-lg leading-none p-1"
                            (click)="toggleMilestone(expandedMilestone()!)"
                            aria-label="Close details"
                          >✕</button>
                        </div>
                      </div>
                    </div>
                  }
                } @else {
                  <div class="py-12 text-center">
                    <p class="text-sm text-gray-400 dark:text-gray-500">No events match the selected filters.</p>
                    <button
                      class="mt-2 text-xs text-coderabbit-orange hover:text-coderabbit-orange/70 transition-colors"
                      (click)="selectAllFilters()"
                    >Show all events</button>
                  </div>
                }
              } @else {
                <div class="py-12 text-center text-gray-500 dark:text-gray-400">
                  {{ timelineMessage() || 'No milestone data available yet.' }}
                </div>
              }
            } @else {
              <div class="py-12 text-center text-gray-400 dark:text-gray-500">
                <p class="text-lg mb-1">🗓️</p>
                <p class="text-sm">Loading your milestone history…</p>
              </div>
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

        @if (viewMode() === 'insights') {
          @if (insightsError()) {
            <div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
              {{ insightsError() }}
            </div>
          }

          <div #insightsShareCard class="bg-white dark:bg-gray-900 rounded-2xl p-6 md:p-8 shadow-lg mb-4 border border-gray-200 dark:border-gray-800">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-md">
                  <span class="text-white text-lg">📊</span>
                </div>
                <div>
                  <h3 class="text-xl font-bold text-gray-900 dark:text-white">Repository Insights</h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400">Top repositories by contribution impact</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <app-share-dropdown [onShare]="insightsShareHandler"></app-share-dropdown>
                <button
                  class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 transition-colors"
                  [disabled]="isDownloadingInsights()"
                  (click)="downloadInsightsAsImage()"
                >
                  @if (isDownloadingInsights()) {
                    <div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    <span>Saving…</span>
                  } @else {
                    <span>⬇ Download Insights as Image</span>
                  }
                </button>
              </div>
            </div>

            @if (isLoadingInsights()) {
              <div class="flex flex-col items-center gap-4 py-16">
                <div class="relative">
                  <div class="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 dark:border-gray-700 border-t-coderabbit-orange"></div>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Loading repository insights…</span>
              </div>
            } @else if (insightsData(); as insights) {
              <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800">
                  <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600"></div>
                  <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ insights.length | number }}</p>
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Repositories</p>
                </div>
                <div class="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center border border-gray-100 dark:border-gray-800">
                  <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
                  <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ totalInsightContributions() | number }}</p>
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Total Contributions</p>
                </div>
              </div>

              @if (insights.length > 0) {
                <div class="space-y-3">
                  @for (repo of insights; track repo.nameWithOwner) {
                    <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/30 p-4">
                      <button
                        class="w-full flex items-center justify-between gap-4 text-left"
                        (click)="toggleRepoExpand(repo.nameWithOwner)"
                        [attr.aria-expanded]="expandedRepo() === repo.nameWithOwner"
                      >
                        <div class="min-w-0 flex-1">
                          <a
                            [href]="repo.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-sm md:text-base font-semibold text-gray-900 dark:text-white hover:text-coderabbit-orange transition-colors truncate block"
                            (click)="$event.stopPropagation()"
                          >
                            {{ repo.nameWithOwner }}
                          </a>
                          <div class="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span class="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-amber-700 dark:text-amber-300 font-medium">
                              ⭐ {{ repo.stargazerCount | number }}
                            </span>
                            <span>{{ repo.totalContributions | number }} contributions</span>
                          </div>
                        </div>
                        <span
                          class="text-gray-400 dark:text-gray-500 transition-transform"
                          [class.rotate-180]="expandedRepo() === repo.nameWithOwner"
                        >⌄</span>
                      </button>

                      @if (expandedRepo() === repo.nameWithOwner) {
                        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                          @for (year of repo.yearlyBreakdown; track year.year) {
                            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/50 px-3 py-2">
                              <div class="flex items-center justify-between gap-3">
                                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ year.year }}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">{{ year.totalContributions | number }} total</p>
                              </div>
                              <div class="mt-1 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                                <p>Commits: <span class="font-semibold">{{ year.commits | number }}</span></p>
                                <p>Pull Requests: <span class="font-semibold">{{ year.pullRequests | number }}</span></p>
                              </div>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              } @else {
                <div class="py-12 text-center text-gray-500 dark:text-gray-400">
                  No repository insights available yet.
                </div>
              }
            } @else {
              <div class="py-12 text-center text-gray-400 dark:text-gray-500">
                <p class="text-lg mb-1">📊</p>
                <p class="text-sm">Loading repository insights…</p>
              </div>
            }

            <div class="mt-6 text-right">
              <span class="text-xs text-gray-400 dark:text-gray-600 font-mono">commitstory</span>
            </div>
          </div>
        }
        } <!-- end @else currentUsername -->
      </div>
    </div>
  `,
})
export class DashboardComponent {
  @ViewChild('shareCard') private readonly shareCard!: ElementRef<HTMLElement>;
  @ViewChild('timelineCard') private readonly timelineCard!: ElementRef<HTMLElement>;
  @ViewChild('insightsShareCard') private readonly insightsShareCard!: ElementRef<HTMLElement>;

  private readonly githubService = inject(GitHubService);
  private readonly storyService = inject(StoryService);
  protected readonly themeService = inject(ThemeService);
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

  readonly insightsShareHandler = async (platform: SharePlatform): Promise<void> => {
    if (!this.insightsShareCard) return;
    const bg = this.themeService.isDark() ? '#171717' : '#F6F6F1';
    const result = await this.shareService.shareWithImage(
      this.insightsShareCard.nativeElement, platform, 'insights', undefined, bg,
    );
    this.showShareToast(result);
  };

  readonly genres = GENRES;
  readonly languages = LANGUAGES;

  // Username search state
  readonly usernameInput = signal('');
  readonly currentUsername = signal('');
  readonly userProfile = signal<GitHubUserProfile | null>(null);
  readonly isSearching = signal(false);
  readonly searchError = signal<string | null>(null);

  readonly viewMode = signal<'story' | 'timeline' | 'insights'>('timeline');
  readonly expandedMilestone = signal<number | null>(null);
  readonly expandedRepo = signal<string | null>(null);
  readonly selectedGenre = signal<string>(GENRES[0] as string);
  readonly selectedLanguage = signal<string>(LANGUAGES[0] as string);
  readonly isGenerating = signal(false);
  readonly isImageGenerationEnabled = signal(true);
  readonly isGeneratingImage = signal(false);
  readonly isDownloading = signal(false);
  readonly isLoadingTimeline = signal(false);
  readonly isDownloadingTimeline = signal(false);
  readonly isLoadingInsights = signal(false);
  readonly isDownloadingInsights = signal(false);
  readonly timelineError = signal<string | null>(null);
  readonly insightsError = signal<string | null>(null);
  readonly timelineMessage = signal<string | null>(null);
  readonly timelineData = signal<TimelineData | null>(null);
  readonly insightsData = signal<RepositoryInsight[] | null>(null);
  readonly aggregatedActivity = signal<ActivitySummary | null>(null);
  readonly generatedStory = signal<StoryResponse | null>(null);
  readonly storyImageUrl = signal<string | null>(null);
  readonly memberSinceYear = signal<number | null>(null);
  readonly shareNotification = signal<string | null>(null);

  readonly totalInsightContributions = computed(() =>
    (this.insightsData() ?? []).reduce((sum, repo) => sum + repo.totalContributions, 0)
  );

  // Timeline filters
  readonly filterAccountCreated = signal(true);
  readonly filterFirstPR = signal(true);
  readonly filterFirstIssue = signal(true);
  readonly filterFirstDiscussion = signal(true);
  readonly filterPRMilestones = signal(true);
  readonly filterCommitMilestones = signal(true);

  // Computed filtered timeline events
  readonly filteredTimelineEvents = computed(() => {
    const timeline = this.timelineData();
    if (!timeline) return [];

    return timeline.events.filter((event) => {
      switch (event.type) {
        case MilestoneType.account_created:
          return this.filterAccountCreated();
        case MilestoneType.first_pr:
          return this.filterFirstPR();
        case MilestoneType.first_issue:
          return this.filterFirstIssue();
        case MilestoneType.first_discussion:
          return this.filterFirstDiscussion();
        case MilestoneType.pr_count:
          return this.filterPRMilestones();
        case MilestoneType.commit_count:
          return this.filterCommitMilestones();
        default:
          return true;
      }
    });
  });

  readonly selectedMilestoneDetail = computed(() => {
    const idx = this.expandedMilestone();
    if (idx === null) return null;
    const events = this.filteredTimelineEvents();
    return idx < events.length ? events[idx] : null;
  });

  constructor() {
    // Nothing auto-loaded — user must enter a username first
  }

  onSearchUser(): void {
    const username = this.usernameInput().trim();
    if (!username) return;

    this.isSearching.set(true);
    this.searchError.set(null);

    this.githubService.getUser(username).subscribe({
      next: (profile) => {
        this.userProfile.set(profile);
        this.currentUsername.set(profile.login);
        this.isSearching.set(false);
        // Reset all data when switching users
        this.timelineData.set(null);
        this.insightsData.set(null);
        this.aggregatedActivity.set(null);
        this.generatedStory.set(null);
        this.storyImageUrl.set(null);
        this.memberSinceYear.set(new Date(profile.created_at).getFullYear());
        // Auto-load timeline for the new user
        this.onViewTimeline();
      },
      error: (err) => {
        const status = (err as { status?: number }).status;
        this.searchError.set(status === 404 ? `User "${username}" not found on GitHub.` : 'Failed to load user. Please try again.');
        this.isSearching.set(false);
      },
    });
  }

  toggleMilestone(index: number): void {
    this.expandedMilestone.set(this.expandedMilestone() === index ? null : index);
  }

  private showShareToast(result: ShareResult): void {
    const msg = result === 'clipboard'
      ? '📋 Image copied! Paste it (Ctrl+V / ⌘V) into your post on the platform.'
      : '🔗 Opening platform — share your CommitStory!';
    this.shareNotification.set(msg);
    setTimeout(() => this.shareNotification.set(null), 5000);
  }

  setViewMode(mode: 'story' | 'timeline' | 'insights'): void {
    this.viewMode.set(mode);
  }

  onViewTimeline(): void {
    this.viewMode.set('timeline');
    this.timelineError.set(null);

    const username = this.currentUsername();
    if (!username) return;

    if (this.timelineData()) {
      return;
    }

    this.isLoadingTimeline.set(true);
    const createdAt = this.userProfile()?.created_at ?? null;
    this.githubService.getMilestones(username, createdAt).subscribe({
      next: (result) => {
        this.timelineData.set(result);
        this.timelineError.set(
          !result.username && result.events.length === 0
            ? 'Could not load the timeline right now. Please try again.'
            : null
        );
        this.timelineMessage.set(
          result.events.length
            ? null
            : 'No milestones available yet.'
        );
        this.isLoadingTimeline.set(false);
      },
      error: () => {
        this.timelineError.set('Could not load the timeline right now. Please try again.');
        this.timelineMessage.set('Unable to load milestones at this time.');
        this.isLoadingTimeline.set(false);
      },
    });
  }

  onViewInsights(): void {
    this.viewMode.set('insights');
    this.insightsError.set(null);

    const username = this.currentUsername();
    if (!username) return;

    if (this.insightsData()) {
      return;
    }

    this.isLoadingInsights.set(true);
    const createdAt = this.userProfile()?.created_at;

    this.githubService.getRepositoryInsights(username, createdAt).subscribe({
      next: (result) => {
        this.insightsData.set(result.entries);
        this.isLoadingInsights.set(false);
      },
      error: () => {
        this.insightsError.set('Could not load repository insights right now. Please try again.');
        this.isLoadingInsights.set(false);
      },
    });
  }

  toggleRepoExpand(nameWithOwner: string): void {
    this.expandedRepo.set(this.expandedRepo() === nameWithOwner ? null : nameWithOwner);
  }

  selectAllFilters(): void {
    this.filterAccountCreated.set(true);
    this.filterFirstPR.set(true);
    this.filterFirstIssue.set(true);
    this.filterFirstDiscussion.set(true);
    this.filterPRMilestones.set(true);
    this.filterCommitMilestones.set(true);
  }

  clearAllFilters(): void {
    this.filterAccountCreated.set(false);
    this.filterFirstPR.set(false);
    this.filterFirstIssue.set(false);
    this.filterFirstDiscussion.set(false);
    this.filterPRMilestones.set(false);
    this.filterCommitMilestones.set(false);
  }

  onGenerateStory(): void {
    const username = this.currentUsername();
    if (!username) return;

    this.isGenerating.set(true);
    this.isImageGenerationEnabled.set(true);
    this.storyImageUrl.set(null);
    this.isGeneratingImage.set(false);

    const createdAt = this.userProfile()?.created_at;

    this.githubService.getAggregatedActivity(username, createdAt).pipe(
      switchMap((activity) => {
        this.aggregatedActivity.set(activity);
        return this.storyService.generateStory(
          this.selectedGenre(),
          this.selectedLanguage(),
          activity,
          username,
          createdAt,
          activity.topRepositories
        );
      }),
      switchMap((storyResult) => {
        this.generatedStory.set(storyResult);
        this.isImageGenerationEnabled.set(storyResult.imageGenerationEnabled !== false);

        if (storyResult.imageGenerationEnabled === false) {
          this.storyImageUrl.set(null);
          this.isGeneratingImage.set(false);
          return of(null);
        }

        const activity = this.aggregatedActivity();
        if (!activity) return of(null);

        this.isGeneratingImage.set(true);
        return this.storyService.generateStoryImage(
          this.selectedGenre(),
          storyResult.title,
          username,
          {
            commits: activity.commits,
            issues: activity.issues,
            pullRequests: activity.pullRequests,
            reviews: activity.reviews,
            lifetimeDiscussions: activity.lifetimeDiscussions,
            lifetimeDiscussionComments: activity.lifetimeDiscussionComments,
            privateContributions: activity.privateContributions,
          }
        ).pipe(
          catchError((error) => {
            console.error('Story image generation failed:', error);
            this.storyImageUrl.set(null);
            return of(null);
          }),
          finalize(() => {
            this.isGeneratingImage.set(false);
          })
        );
      })
    ).subscribe({
      next: (imageResult) => {
        if (imageResult?.imageUrl) {
          this.storyImageUrl.set(imageResult.imageUrl);
        }
        this.isGenerating.set(false);
      },
      error: () => {
        this.isGeneratingImage.set(false);
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

  getMilestoneYear(milestone: MilestoneEvent): string {
    if (!milestone.date) return 'Unknown';
    return new Date(milestone.date).getFullYear().toString();
  }

  getMilestoneLanePercent(type: MilestoneType): number {
    switch (type) {
      case MilestoneType.account_created: return 16;
      case MilestoneType.first_pr: return 30;
      case MilestoneType.first_issue: return 42;
      case MilestoneType.first_discussion: return 58;
      case MilestoneType.pr_count: return 70;
      case MilestoneType.commit_count: return 84;
      default: return 50;
    }
  }

  getStemTop(type: MilestoneType): number {
    return Math.min(this.getMilestoneLanePercent(type), 50);
  }

  getStemHeight(type: MilestoneType): number {
    return Math.abs(this.getMilestoneLanePercent(type) - 50);
  }

  getMilestoneNodeClasses(type: MilestoneType): string {
    switch (type) {
      case MilestoneType.account_created:
        return 'bg-gradient-to-br from-orange-400 to-coderabbit-orange text-white';
      case MilestoneType.first_pr:
      case MilestoneType.pr_count:
        return 'bg-gradient-to-br from-violet-400 to-violet-600 text-white';
      case MilestoneType.first_issue:
        return 'bg-gradient-to-br from-amber-400 to-amber-600 text-white';
      case MilestoneType.first_discussion:
        return 'bg-gradient-to-br from-teal-400 to-teal-600 text-white';
      case MilestoneType.commit_count:
        return 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white';
      default:
        return 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
    }
  }

  getMilestoneCardClasses(type: MilestoneType): string {
    switch (type) {
      case MilestoneType.account_created:
        return 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200/60 dark:border-orange-900/40';
      case MilestoneType.first_pr:
      case MilestoneType.pr_count:
        return 'bg-violet-50/50 dark:bg-violet-950/20 border-violet-200/60 dark:border-violet-900/40';
      case MilestoneType.first_issue:
        return 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40';
      case MilestoneType.first_discussion:
        return 'bg-teal-50/50 dark:bg-teal-950/20 border-teal-200/60 dark:border-teal-900/40';
      case MilestoneType.commit_count:
        return 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40';
      default:
        return 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700';
    }
  }

  getMilestoneAccentClasses(type: MilestoneType): string {
    switch (type) {
      case MilestoneType.account_created:
        return 'bg-coderabbit-orange';
      case MilestoneType.first_pr:
      case MilestoneType.pr_count:
        return 'bg-violet-500';
      case MilestoneType.first_issue:
        return 'bg-amber-500';
      case MilestoneType.first_discussion:
        return 'bg-teal-500';
      case MilestoneType.commit_count:
        return 'bg-emerald-500';
      default:
        return 'bg-gray-400';
    }
  }

  getMilestoneBadgeClasses(type: MilestoneType): string {
    switch (type) {
      case MilestoneType.pr_count:
        return 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300';
      case MilestoneType.commit_count:
        return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
    }
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

  async downloadInsightsAsImage(): Promise<void> {
    if (!this.insightsShareCard) return;
    this.isDownloadingInsights.set(true);
    try {
      const { toPng } = await import('html-to-image');
      const backgroundColor = this.themeService.isDark() ? '#171717' : '#F6F6F1';
      const dataUrl = await toPng(this.insightsShareCard.nativeElement, {
        backgroundColor,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      const username = this.currentUsername() || 'developer';
      link.download = `github-insights-${username}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Insights download failed:', err);
    } finally {
      this.isDownloadingInsights.set(false);
    }
  }
}
