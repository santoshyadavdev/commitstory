import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number;
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string;
      html_url: string;
    };
    accessToken?: string;
    oauthState?: string;
  }
}
