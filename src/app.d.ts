declare global {
  namespace App {
    interface Locals {
      user: {
        id: number;
        email: string;
        currency: string;
        is_admin: number;
        onboarded_at: string | null;
      } | null;
    }
    interface PageData {
      user?: App.Locals['user'];
    }
  }

  /** App version, injected at build time from package.json — see vite.config.js. */
  const __APP_VERSION__: string;
}

export {};
