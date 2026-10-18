import type { HttpClient } from './core/http';

export interface UploadArgs {
  isPrivate?: boolean;
  folder?: string;
  file_url?: string;
  doctype?: string;
  docname?: string;
  fieldname?: string;
}

export class FileModule {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async uploadFile(file: File | Blob, args: UploadArgs, _onProgress?: (completed: number, total: number) => void) {
    const form = new FormData();
    form.append('file', file);
    for (const [k, v] of Object.entries(args)) {
      if (v != null) {
        form.append(k, String(v));
      }
    }
    return await this.http.post('/api/method/upload_file', form);
  }
}
