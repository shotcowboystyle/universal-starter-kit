import type { HttpClient } from './core/http';

export class AuthModule {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async loginWithUsernamePassword(input: { username: string; password: string }) {
    return await this.http.post('/api/method/login', {
      usr: input.username,
      pwd: input.password,
    });
  }

  async getLoggedInUser(): Promise<string> {
    const { payload } = await this.http.get<{ message: string }>('/api/method/frappe.auth.get_logged_user');
    return payload?.message ?? '';
  }

  async logout() {
    return await this.http.post('/api/method/logout');
  }

  async forgetPassword(email: string) {
    return await this.http.post('/api/method/frappe.core.doctype.user.user.reset_password', {
      user: email,
    });
  }
}
