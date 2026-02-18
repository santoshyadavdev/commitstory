import { Component, inject, signal, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { GitHubService } from '../../core/services/github.service';
import { AuthService } from '../../core/auth/auth.service';
import { YearlyActivity } from '../../core/models/activity.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
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
                  <p class="text-3xl font-bold text-white">{{ activity.discussions }}</p>
                  <p class="text-xs text-gray-400 mt-1">Discussions</p>
                </div>
                <div class="bg-gray-800 rounded-xl p-4 text-center">
                  <p class="text-3xl font-bold text-white">{{ activity.discussionComments }}</p>
                  <p class="text-xs text-gray-400 mt-1">Comments</p>
                </div>
                @if (activity.privateContributions > 0) {
                  <div class="bg-gray-800 border border-indigo-800 rounded-xl p-4 text-center">
                    <p class="text-3xl font-bold text-indigo-400">{{ activity.privateContributions }}</p>
                    <p class="text-xs text-gray-400 mt-1">Private</p>
                  </div>
                }
              </div>
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

  readonly loading = signal(true);
  readonly activities = signal<YearlyActivity[]>([]);

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
}
