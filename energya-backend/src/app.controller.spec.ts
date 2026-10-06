import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { AppController } from './app.controller.js';
import { PrismaService } from './prisma.service.js';

describe('AppController', () => {
  let appController: AppController;

  const mockPrisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return health status matching modular-monolith contract', async () => {
      const res = await appController.getHealth();
      expect(res.ok).toBe(true);
      expect(res.service).toBe('energya-connect');
      expect(res.architecture).toBe('modular-monolith');
      expect(res.database.ok).toBe(true);
    });
  });
});
