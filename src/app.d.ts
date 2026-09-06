declare global {
  namespace App {
    interface Locals {
      user: {
        id: number;
        email: string;
        currency: string;
        is_admin: number;
      } | null;
    }
    interface PageData {
      user?: App.Locals['user'];
    }
  }
}

export {};
