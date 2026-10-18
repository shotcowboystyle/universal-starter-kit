import type { HttpClient, RequestBody } from './core/http';

export class CallModule {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async get<T>(method: string, params?: Parameters<HttpClient['get']>[1]) {
    return await this.http.get<T>(`/api/method/${method}`, params);
  }

  async post<T>(method: string, body?: RequestBody | null) {
    return await this.http.post<T>(`/api/method/${method}`, body);
  }

  async put<T>(method: string, body?: RequestBody | null) {
    return await this.http.put<T>(`/api/method/${method}`, body);
  }

  async delete<T>(method: string, body?: RequestBody | null) {
    return await this.http.delete<T>(`/api/method/${method}`, body);
  }
}
