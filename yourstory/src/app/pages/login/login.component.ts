import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

const GITHUB_PATH =
  'M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.505.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.607.069-.607 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.338 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.2 22 16.447 22 12.021 22 6.484 17.523 2 12 2z';

@Component({
  selector: 'app-login',
  standalone: true,
  styles: [
    `
      .animation-delay-2s {
        animation-delay: 2s;
      }
      .animation-delay-4s {
        animation-delay: 4s;
      }
    `,
  ],
  template: `
    <div class="min-h-screen bg-gray-950 text-white overflow-x-hidden">

      <!-- Decorative gradient background orbs -->
      <div class="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div class="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-blob"></div>
        <div class="absolute top-1/3 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-blob animation-delay-2s"></div>
        <div class="absolute bottom-20 right-1/4 w-80 h-80 bg-pink-600/15 rounded-full blur-3xl animate-blob animation-delay-4s"></div>
      </div>

      <!-- ===== HERO SECTION ===== -->
      <section
        class="relative min-h-screen flex flex-col items-center justify-center px-4 pt-16 pb-24 text-center"
        aria-labelledby="hero-heading"
      >
        <!-- Brand mark -->
        <div class="flex items-center gap-3 mb-12 animate-fade-in">
          <svg
            class="w-10 h-10 text-white"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fill-rule="evenodd" [attr.d]="githubPath" clip-rule="evenodd" />
          </svg>
          <span class="text-2xl font-bold tracking-tight">CommitStory</span>
        </div>

        <!-- Main headline -->
        <h1
          id="hero-heading"
          class="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-tight mb-6 max-w-4xl animate-fade-in"
        >
          Transform Your GitHub Journey Into
          <span
            class="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent block sm:inline"
          >
            Epic Stories
          </span>
        </h1>

        <!-- Sub-headline -->
        <p
          class="text-lg md:text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed animate-fade-in-slow"
        >
          Harness the power of Google Gemini AI to transform years of commits,
          pull requests, and code reviews into personalized career narratives
          &mdash; told in the genre you choose.
        </p>

        <!-- Primary CTA with glow -->
        <div class="relative group animate-fade-in-slow">
          <div
            class="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl blur opacity-60 animate-glow-pulse transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden="true"
          ></div>
          <button
            (click)="authService.login()"
            class="relative flex items-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-bold py-4 px-8 rounded-xl text-lg transition-all duration-300 hover:scale-105 shadow-2xl cursor-pointer"
            aria-label="Sign in with GitHub to start generating your story"
          >
            <svg
              class="w-6 h-6"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fill-rule="evenodd" [attr.d]="githubPath" clip-rule="evenodd" />
            </svg>
            Sign in with GitHub &mdash; It&apos;s Free
          </button>
        </div>

        <p class="mt-5 text-gray-500 text-sm animate-fade-in-slower">
          No credit card required &middot; Public repos only &middot; Read-only access
        </p>

        <!-- Scroll hint -->
        <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce" aria-hidden="true">
          <svg class="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      <!-- ===== FEATURES SECTION ===== -->
      <section
        class="relative py-24 px-4"
        id="features"
        aria-labelledby="features-heading"
      >
        <div class="max-w-6xl mx-auto">
          <div class="text-center mb-16">
            <h2 id="features-heading" class="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to Tell Your Story
            </h2>
            <p class="text-gray-400 max-w-xl mx-auto">
              Four years of your GitHub data, infinite ways to tell the story.
            </p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">

            <!-- Card: 8 Story Genres -->
            <div
              class="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-800 p-6 transition-all duration-300 hover:scale-105 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10"
            >
              <div class="text-4xl mb-4" aria-hidden="true">&#127917;</div>
              <h3 class="font-bold text-lg mb-2 text-white">8 Story Genres</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                Drama, Comedy, Thriller, Sci-Fi, Romance, Mystery, Action &amp; more narrative styles
              </p>
            </div>

            <!-- Card: 10 Years of Data -->
            <div
              class="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-800 p-6 transition-all duration-300 hover:scale-105 hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/10"
            >
              <div class="text-4xl mb-4" aria-hidden="true">&#128202;</div>
              <h3 class="font-bold text-lg mb-2 text-white">Max 10 Years of Data</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                Aggregate commits, PRs, issues, and code reviews across your entire history
              </p>
            </div>

            <!-- Card: AI-Powered Narratives -->
            <div
              class="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-800 p-6 transition-all duration-300 hover:scale-105 hover:border-pink-500/50 hover:shadow-xl hover:shadow-pink-500/10"
            >
              <div class="text-4xl mb-4" aria-hidden="true">&#10024;</div>
              <h3 class="font-bold text-lg mb-2 text-white">AI-Powered Narratives</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                Google Gemini generates rich, personalized stories from your unique contribution data
              </p>
            </div>

            <!-- Card: Shareable Cards -->
            <div
              class="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-800 p-6 transition-all duration-300 hover:scale-105 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/10"
            >
              <div class="text-4xl mb-4" aria-hidden="true">&#127183;</div>
              <h3 class="font-bold text-lg mb-2 text-white">Shareable Cards</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                Download and share your developer story card on LinkedIn, Twitter, and beyond
              </p>
            </div>

          </div>
        </div>
      </section>

      <!-- ===== HOW IT WORKS SECTION ===== -->
      <section
        class="relative py-24 px-4 bg-gray-900/30"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <div class="max-w-5xl mx-auto">
          <div class="text-center mb-16">
            <h2 id="how-heading" class="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p class="text-gray-400 max-w-xl mx-auto">From GitHub to story in three simple steps.</p>
          </div>

          <div class="flex flex-col md:flex-row items-stretch">

            <!-- Step 1 -->
            <div
              class="flex-1 flex flex-col items-center text-center px-6 py-8 rounded-2xl transition-all duration-300 hover:bg-gray-800/40 group"
            >
              <div
                class="w-16 h-16 rounded-full bg-indigo-500/20 border-2 border-indigo-500/40 flex items-center justify-center text-indigo-400 font-extrabold text-2xl mb-6 transition-all duration-300 group-hover:bg-indigo-500/30 group-hover:border-indigo-400"
                aria-hidden="true"
              >
                1
              </div>
              <div class="text-3xl mb-3" aria-hidden="true">&#128279;</div>
              <h3 class="font-bold text-xl mb-2 text-white">Connect GitHub</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                One-click OAuth authentication grants read-only access to your public contribution data
              </p>
            </div>

            <!-- Arrow connector (desktop only) -->
            <div
              class="hidden md:flex items-center justify-center px-2 text-gray-600"
              aria-hidden="true"
            >
              <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>

            <!-- Step 2 -->
            <div
              class="flex-1 flex flex-col items-center text-center px-6 py-8 rounded-2xl transition-all duration-300 hover:bg-gray-800/40 group"
            >
              <div
                class="w-16 h-16 rounded-full bg-purple-500/20 border-2 border-purple-500/40 flex items-center justify-center text-purple-400 font-extrabold text-2xl mb-6 transition-all duration-300 group-hover:bg-purple-500/30 group-hover:border-purple-400"
                aria-hidden="true"
              >
                2
              </div>
              <div class="text-3xl mb-3" aria-hidden="true">&#128200;</div>
              <h3 class="font-bold text-xl mb-2 text-white">View Your Stats</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                Explore up to 10 years of commits, pull requests, issues, and code reviews — or your last 4 years if your account is newer.
              </p>
            </div>

            <!-- Arrow connector (desktop only) -->
            <div
              class="hidden md:flex items-center justify-center px-2 text-gray-600"
              aria-hidden="true"
            >
              <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>

            <!-- Step 3 -->
            <div
              class="flex-1 flex flex-col items-center text-center px-6 py-8 rounded-2xl transition-all duration-300 hover:bg-gray-800/40 group"
            >
              <div
                class="w-16 h-16 rounded-full bg-pink-500/20 border-2 border-pink-500/40 flex items-center justify-center text-pink-400 font-extrabold text-2xl mb-6 transition-all duration-300 group-hover:bg-pink-500/30 group-hover:border-pink-400"
                aria-hidden="true"
              >
                3
              </div>
              <div class="text-3xl mb-3" aria-hidden="true">&#128640;</div>
              <h3 class="font-bold text-xl mb-2 text-white">Generate Your Story</h3>
              <p class="text-gray-400 text-sm leading-relaxed">
                Choose your favourite genre and let Gemini AI craft a personalized narrative of your developer journey
              </p>
            </div>

          </div>
        </div>
      </section>

      <!-- ===== TECH STACK SECTION ===== -->
      <section
        class="relative py-24 px-4"
        id="tech-stack"
        aria-labelledby="tech-heading"
      >
        <div class="max-w-5xl mx-auto">
          <div class="text-center mb-12">
            <h2 id="tech-heading" class="text-3xl md:text-4xl font-bold mb-4">Built With Modern Tech</h2>
            <p class="text-gray-400 max-w-xl mx-auto">
              A carefully curated stack for performance, developer experience, and AI capability.
            </p>
          </div>

          <div class="flex flex-wrap justify-center gap-4">

            <!-- Angular -->
            <div
              class="flex items-center gap-3 bg-gray-900/60 border border-gray-800 rounded-xl px-5 py-3 transition-all duration-300 hover:border-red-500/50 hover:bg-gray-900/80 hover:scale-105"
            >
              <span class="text-red-500 text-2xl font-bold leading-none" aria-hidden="true">&#9650;</span>
              <div>
                <div class="font-semibold text-white text-sm">Angular 21</div>
                <div class="text-gray-500 text-xs">SSR-enabled framework</div>
              </div>
            </div>

            <!-- Tailwind CSS -->
            <div
              class="flex items-center gap-3 bg-gray-900/60 border border-gray-800 rounded-xl px-5 py-3 transition-all duration-300 hover:border-cyan-500/50 hover:bg-gray-900/80 hover:scale-105"
            >
              <span class="text-cyan-400 text-2xl font-extrabold leading-none" aria-hidden="true">&#126;</span>
              <div>
                <div class="font-semibold text-white text-sm">Tailwind CSS</div>
                <div class="text-gray-500 text-xs">Utility-first styling</div>
              </div>
            </div>

            <!-- GitHub GraphQL API -->
            <div
              class="flex items-center gap-3 bg-gray-900/60 border border-gray-800 rounded-xl px-5 py-3 transition-all duration-300 hover:border-gray-400/50 hover:bg-gray-900/80 hover:scale-105"
            >
              <svg
                class="w-6 h-6 text-gray-300"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fill-rule="evenodd" [attr.d]="githubPath" clip-rule="evenodd" />
              </svg>
              <div>
                <div class="font-semibold text-white text-sm">GitHub GraphQL API</div>
                <div class="text-gray-500 text-xs">Rich contribution data</div>
              </div>
            </div>

            <!-- Google Gemini AI -->
            <div
              class="flex items-center gap-3 bg-gray-900/60 border border-gray-800 rounded-xl px-5 py-3 transition-all duration-300 hover:border-blue-500/50 hover:bg-gray-900/80 hover:scale-105"
            >
              <span class="text-blue-400 text-2xl" aria-hidden="true">&#10024;</span>
              <div>
                <div class="font-semibold text-white text-sm">Google Gemini AI</div>
                <div class="text-gray-500 text-xs">Story generation</div>
              </div>
            </div>

            <!-- Node.js / Express -->
            <div
              class="flex items-center gap-3 bg-gray-900/60 border border-gray-800 rounded-xl px-5 py-3 transition-all duration-300 hover:border-green-500/50 hover:bg-gray-900/80 hover:scale-105"
            >
              <span class="text-green-400 text-2xl font-bold" aria-hidden="true">&#9654;</span>
              <div>
                <div class="font-semibold text-white text-sm">Node.js / Express</div>
                <div class="text-gray-500 text-xs">Backend &amp; OAuth server</div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <!-- ===== CREDITS SECTION ===== -->
      <section class="relative py-16 px-4 bg-gray-900/20" aria-label="Credits">
        <div class="max-w-2xl mx-auto text-center">
          <div
            class="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-10"
            aria-hidden="true"
          ></div>
          <p class="text-gray-400 text-sm leading-relaxed">
            Built with
            <span class="animate-pulse text-pink-400" aria-label="love">&#10084;&#65039;</span>
            by
            <span class="text-gray-300 font-medium">CodeRabbit Issue Planner</span>,
            <span class="text-gray-300 font-medium">GitHub Copilot</span>
            and
            <span class="text-gray-300 font-medium">Gemini</span>
          </p>
        </div>
      </section>

      <!-- ===== FOOTER ===== -->
      <footer
        class="relative py-20 px-4 border-t border-gray-800/50"
        role="contentinfo"
      >
        <div class="max-w-2xl mx-auto text-center">
          <div class="flex items-center justify-center gap-3 mb-4">
            <svg
              class="w-8 h-8 text-white"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fill-rule="evenodd" [attr.d]="githubPath" clip-rule="evenodd" />
            </svg>
            <h2 class="text-2xl font-bold">Ready to Tell Your Story?</h2>
          </div>

          <p class="text-gray-400 mb-8">
            Join developers who have already transformed their GitHub journey into epic narratives.
          </p>

          <button
            (click)="authService.login()"
            class="inline-flex items-center gap-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-300 hover:scale-105 shadow-2xl shadow-purple-500/25 cursor-pointer"
            aria-label="Get started free by signing in with GitHub"
          >
            <svg
              class="w-6 h-6"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fill-rule="evenodd" [attr.d]="githubPath" clip-rule="evenodd" />
            </svg>
            Get Started Free with GitHub
          </button>

          <p class="mt-8 text-gray-600 text-sm">
            &copy; 2026 CommitStory. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  `,
})
export class LoginComponent {
  protected readonly authService = inject(AuthService);
  protected readonly githubPath = GITHUB_PATH;
}
