import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HttpClient } from './core/http';
import { FileModule } from './file';
import type { UploadArgs } from './file';

describe(FileModule, () => {
  let fileModule: FileModule;
  let mockHttpClient: HttpClient;

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      head: vi.fn(),
      request: vi.fn(),
      setToken: vi.fn(),
    } as unknown as HttpClient;

    fileModule = new FileModule(mockHttpClient);
  });

  describe('constructor', () => {
    it('should initialize with http client', () => {
      const instance = new FileModule(mockHttpClient);
      expect(instance).toBeDefined();
    });
  });

  describe('uploadFile', () => {
    it('should upload a File with minimal args', async () => {
      const file = new File(['test content'], 'test.txt', {
        type: 'text/plain',
      });
      const args: UploadArgs = {};

      const mockResponse = {
        payload: {
          message: 'File uploaded successfully',
          file_url: '/files/test.txt',
        },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      const result = await fileModule.uploadFile(file, args);

      expect(mockHttpClient.post).toHaveBeenCalledOnce();
      const calledArgs = (mockHttpClient.post as any).mock.calls[0];
      expect(calledArgs[0]).toBe('/api/method/upload_file');

      const formData = calledArgs[1] as FormData;
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('file')).toBe(file);

      expect(result).toEqual(mockResponse);
    });

    it('should upload a Blob', async () => {
      const blob = new Blob(['binary data'], {
        type: 'application/octet-stream',
      });
      const args: UploadArgs = {};

      const mockResponse = {
        payload: {
          message: 'File uploaded',
        },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(blob, args);

      const calledArgs = (mockHttpClient.post as any).mock.calls[0];
      const formData = calledArgs[1] as FormData;
      // FormData.append converts Blob to File in some environments
      const uploadedFile = formData.get('file');
      expect(uploadedFile).toBeDefined();
      expect(uploadedFile).toHaveProperty('size', 11);
      expect(uploadedFile).toHaveProperty('type', 'application/octet-stream');
    });

    it('should include all upload args in FormData', async () => {
      const file = new File(['content'], 'document.pdf', {
        type: 'application/pdf',
      });
      const args: UploadArgs = {
        isPrivate: true,
        folder: 'Home/Documents',
        file_url: '/custom/path',
        doctype: 'Sales Invoice',
        docname: 'INV-001',
        fieldname: 'attachment',
      };

      const mockResponse = {
        payload: { message: 'Uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      expect(formData.get('file')).toBe(file);
      expect(formData.get('isPrivate')).toBe('true');
      expect(formData.get('folder')).toBe('Home/Documents');
      expect(formData.get('file_url')).toBe('/custom/path');
      expect(formData.get('doctype')).toBe('Sales Invoice');
      expect(formData.get('docname')).toBe('INV-001');
      expect(formData.get('fieldname')).toBe('attachment');
    });

    it('should handle partial args', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const args: UploadArgs = {
        isPrivate: false,
        folder: 'Public/Images',
      };

      const mockResponse = {
        payload: { message: 'Uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      expect(formData.get('isPrivate')).toBe('false');
      expect(formData.get('folder')).toBe('Public/Images');
      expect(formData.get('doctype')).toBeNull();
      expect(formData.get('docname')).toBeNull();
    });

    it('should skip null and undefined values in args', async () => {
      const file = new File(['data'], 'data.csv', { type: 'text/csv' });
      const args: UploadArgs = {
        isPrivate: undefined,
        folder: null as any,
        doctype: 'Test',
      };

      const mockResponse = {
        payload: { message: 'Uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      expect(formData.get('isPrivate')).toBeNull();
      expect(formData.get('folder')).toBeNull();
      expect(formData.get('doctype')).toBe('Test');
    });

    it('should handle onProgress callback', async () => {
      const file = new File(['content'], 'upload.txt', { type: 'text/plain' });
      const args: UploadArgs = {};
      const onProgress = vi.fn();

      const mockResponse = {
        payload: { message: 'Uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args, onProgress);

      // Note: The current implementation doesn't actually use onProgress
      // This test is here to ensure the signature accepts the callback
      expect(mockHttpClient.post).toHaveBeenCalledWith();
    });

    it('should handle large files', async () => {
      const largeContent = Array.from({ length: 10_000 }).fill('x').join('');
      const file = new File([largeContent], 'large.txt', {
        type: 'text/plain',
      });
      const args: UploadArgs = {
        folder: 'Large Files',
      };

      const mockResponse = {
        payload: { message: 'Large file uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      expect(formData.get('file')).toBe(file);
    });

    it('should handle special characters in filenames', async () => {
      const file = new File(['content'], 'test file (2025) - copy.txt', {
        type: 'text/plain',
      });
      const args: UploadArgs = {};

      const mockResponse = {
        payload: { message: 'Uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      const uploadedFile = formData.get('file') as File;
      expect(uploadedFile.name).toBe('test file (2025) - copy.txt');
    });

    it('should handle various file types', async () => {
      const testCases = [
        { content: 'text', name: 'doc.txt', type: 'text/plain' },
        { content: '{}', name: 'data.json', type: 'application/json' },
        { content: '<html/>', name: 'page.html', type: 'text/html' },
        { content: 'binary', name: 'image.png', type: 'image/png' },
        { content: 'csv,data', name: 'sheet.csv', type: 'text/csv' },
      ];

      for (const testCase of testCases) {
        const file = new File([testCase.content], testCase.name, {
          type: testCase.type,
        });

        const mockResponse = {
          payload: { message: 'Uploaded' },
          headers: new Headers(),
          status: 200,
        };

        (mockHttpClient.post as any).mockResolvedValue(mockResponse);

        await fileModule.uploadFile(file, {});

        const formData = (mockHttpClient.post as any).mock.calls.at(-1)[1] as FormData;
        const uploadedFile = formData.get('file') as File;
        expect(uploadedFile.type).toBe(testCase.type);
      }
    });

    it('should handle upload errors', async () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const args: UploadArgs = {};

      const mockError = new Error('Upload failed: File too large');
      (mockHttpClient.post as any).mockRejectedValue(mockError);

      await expect(fileModule.uploadFile(file, args)).rejects.toThrow('Upload failed: File too large');
    });

    it('should handle network errors', async () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const args: UploadArgs = {};

      const mockError = new Error('Network error');
      (mockHttpClient.post as any).mockRejectedValue(mockError);

      await expect(fileModule.uploadFile(file, args)).rejects.toThrow('Network error');
    });

    it('should convert boolean isPrivate to string', async () => {
      const file = new File(['content'], 'private.txt', { type: 'text/plain' });
      const args: UploadArgs = {
        isPrivate: true,
      };

      const mockResponse = {
        payload: { message: 'Uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      expect(formData.get('isPrivate')).toBe('true');
      expect(formData.get('isPrivate')).toBeTypeOf('string');
    });

    it('should handle empty file', async () => {
      const file = new File([''], 'empty.txt', { type: 'text/plain' });
      const args: UploadArgs = {};

      const mockResponse = {
        payload: { message: 'Empty file uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      const uploadedFile = formData.get('file') as File;
      expect(uploadedFile.size).toBe(0);
    });

    it('should handle file with no type', async () => {
      const file = new File(['content'], 'unknown');
      const args: UploadArgs = {};

      const mockResponse = {
        payload: { message: 'Uploaded' },
        headers: new Headers(),
        status: 200,
      };

      (mockHttpClient.post as any).mockResolvedValue(mockResponse);

      await fileModule.uploadFile(file, args);

      const formData = (mockHttpClient.post as any).mock.calls[0][1] as FormData;
      const uploadedFile = formData.get('file') as File;
      expect(uploadedFile.type).toBe('');
    });
  });
});
