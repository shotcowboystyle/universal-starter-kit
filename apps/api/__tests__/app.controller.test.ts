import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppController } from '../src/app.controller';
import type { AppService } from '../src/app.service';

const createAppService = () => ({
  getHello: vi.fn<AppService['getHello']>(),
});

describe(AppController, () => {
  let appController: AppController;
  let appService: ReturnType<typeof createAppService>;

  beforeEach(() => {
    appService = createAppService();

    // Manually instantiate AppController with the mock AppService
    appController = new AppController(appService as any);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      appService.getHello.mockReturnValue('Hello World!');
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
