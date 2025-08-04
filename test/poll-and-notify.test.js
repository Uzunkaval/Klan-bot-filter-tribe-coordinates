import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollAndNotify } from '../src/core/use-cases/poll-and-notify.js';

// Mock dependencies
const mockScraper = {
  scrape: vi.fn()
};

const mockNotifier = {
  notifyMany: vi.fn()
};

const mockStateStore = {
  loadLastHash: vi.fn(),
  saveLastHash: vi.fn()
};

describe('PollAndNotify', () => {
  let pollAndNotify;
  const recipients = ['905551234567', '905559876543'];
  const template = 'Updates:\n{{items}}';
  const filters = {
    clan: 'SiSu',
    xMax: 452,
    yMin: 462
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh instance
    pollAndNotify = new PollAndNotify(
      mockScraper,
      mockNotifier,
      mockStateStore,
      recipients,
      template,
      filters
    );
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(pollAndNotify.scraper).toBe(mockScraper);
      expect(pollAndNotify.notifier).toBe(mockNotifier);
      expect(pollAndNotify.store).toBe(mockStateStore);
      expect(pollAndNotify.recipients).toEqual(recipients);
      expect(pollAndNotify.template).toBe(template);
      expect(pollAndNotify.filters).toEqual(filters);
      expect(pollAndNotify.executionCount).toBe(0);
      expect(pollAndNotify.errorCount).toBe(0);
    });
  });

  describe('filterEvents', () => {
    it('should filter events by clan and coordinates', () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          oldPlayer: 'Player1',
          oldTribe: 'SiSu',
          newPlayer: 'Player2',
          newTribe: 'EnemyTribe',
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          villageName: 'Village2',
          x: 453, // x >= 452, should be filtered out
          y: 465,
          oldPlayer: 'Player3',
          oldTribe: 'SiSu',
          newPlayer: 'Player4',
          newTribe: 'EnemyTribe',
          timestamp: '2024-01-01T11:00:00Z'
        },
        {
          villageName: 'Village3',
          x: 450,
          y: 460, // y <= 462, should be filtered out
          oldPlayer: 'Player5',
          oldTribe: 'EnemyTribe',
          newPlayer: 'Player6',
          newTribe: 'SiSu',
          timestamp: '2024-01-01T12:00:00Z'
        },
        {
          villageName: 'Village4',
          x: 450,
          y: 465,
          oldPlayer: 'Player7',
          oldTribe: 'EnemyTribe',
          newPlayer: 'Player8',
          newTribe: 'SiSu',
          timestamp: '2024-01-01T13:00:00Z'
        }
      ];

      const filtered = pollAndNotify.filterEvents(events);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].villageName).toBe('Village1');
      expect(filtered[1].villageName).toBe('Village4');
    });

    it('should handle case-insensitive clan matching', () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          oldPlayer: 'Player1',
          oldTribe: 'SISU', // Uppercase
          newPlayer: 'Player2',
          newTribe: 'EnemyTribe',
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          villageName: 'Village2',
          x: 450,
          y: 465,
          oldPlayer: 'Player3',
          oldTribe: 'EnemyTribe',
          newPlayer: 'Player4',
          newTribe: 'sisu', // Lowercase
          timestamp: '2024-01-01T11:00:00Z'
        }
      ];

      const filtered = pollAndNotify.filterEvents(events);
      expect(filtered).toHaveLength(2);
    });

    it('should handle null tribe values', () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          oldPlayer: 'Player1',
          oldTribe: null,
          newPlayer: 'Player2',
          newTribe: 'SiSu',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ];

      const filtered = pollAndNotify.filterEvents(events);
      expect(filtered).toHaveLength(1);
    });
  });

  describe('buildSignature', () => {
    it('should create stable signature from events', () => {
      const events = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          x: 450,
          y: 465,
          oldTribe: 'SiSu',
          newTribe: 'EnemyTribe'
        },
        {
          timestamp: '2024-01-01T11:00:00Z',
          x: 451,
          y: 463,
          oldTribe: 'EnemyTribe',
          newTribe: 'SiSu'
        }
      ];

      const signature = pollAndNotify.buildSignature(events);
      
      // Should be sorted and contain all relevant data
      expect(signature).toContain('2024-01-01T10:00:00Z|450|465|SiSu|EnemyTribe');
      expect(signature).toContain('2024-01-01T11:00:00Z|451|463|EnemyTribe|SiSu');
    });

    it('should handle empty tribe values', () => {
      const events = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          x: 450,
          y: 465,
          oldTribe: null,
          newTribe: 'SiSu'
        }
      ];

      const signature = pollAndNotify.buildSignature(events);
      expect(signature).toBe('2024-01-01T10:00:00Z|450|465||SiSu');
    });
  });

  describe('hashSignature', () => {
    it('should create SHA256 hash', () => {
      const signature = 'test-signature';
      const hash = pollAndNotify.hashSignature(signature);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex string
      // Calculate the actual expected hash
      const crypto = require('crypto');
      const expectedHash = crypto.createHash('sha256').update(signature).digest('hex');
      expect(hash).toBe(expectedHash);
    });
  });

  describe('renderMessage', () => {
    it('should render message with template', () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          points: 1234,
          oldPlayer: 'Player1',
          oldTribe: 'SiSu',
          newPlayer: 'Player2',
          newTribe: 'EnemyTribe'
        }
      ];

      const message = pollAndNotify.renderMessage(events);
      
      // Template should be replaced with actual content
      expect(message).toContain('Updates:');
      expect(message).toContain('Village1 (450|465) 1234p');
      expect(message).toContain('Player1 [SiSu] → Player2 [EnemyTribe]');
    });

    it('should handle missing tribe information', () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          points: 1234,
          oldPlayer: 'Player1',
          oldTribe: null,
          newPlayer: 'Player2',
          newTribe: 'SiSu'
        }
      ];

      const message = pollAndNotify.renderMessage(events);
      
      expect(message).toContain('Player1 [No Tribe] → Player2 [SiSu]');
    });
  });

  describe('runOnce', () => {
    it('should complete successfully when no changes detected', async () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          points: 1234,
          oldPlayer: 'Player1',
          oldTribe: 'SiSu',
          newPlayer: 'Player2',
          newTribe: 'EnemyTribe',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ];

      // Calculate the expected hash for these events
      const signature = pollAndNotify.buildSignature(events);
      const expectedHash = pollAndNotify.hashSignature(signature);

      mockScraper.scrape.mockResolvedValue(events);
      mockStateStore.loadLastHash.mockResolvedValue(expectedHash); // Return the same hash
      mockStateStore.saveLastHash.mockResolvedValue();

      await pollAndNotify.runOnce();

      expect(mockScraper.scrape).toHaveBeenCalled();
      expect(mockStateStore.loadLastHash).toHaveBeenCalled();
      expect(mockNotifier.notifyMany).not.toHaveBeenCalled();
      expect(pollAndNotify.executionCount).toBe(1);
      expect(pollAndNotify.errorCount).toBe(0);
    });

    it('should send notifications when changes detected', async () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          points: 1234,
          oldPlayer: 'Player1',
          oldTribe: 'SiSu',
          newPlayer: 'Player2',
          newTribe: 'EnemyTribe',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ];

      mockScraper.scrape.mockResolvedValue(events);
      mockStateStore.loadLastHash.mockResolvedValue('different-hash');
      mockStateStore.saveLastHash.mockResolvedValue();
      mockNotifier.notifyMany.mockResolvedValue();

      await pollAndNotify.runOnce();

      expect(mockNotifier.notifyMany).toHaveBeenCalledWith(recipients, expect.stringContaining('Village1'));
      expect(mockStateStore.saveLastHash).toHaveBeenCalled();
      expect(pollAndNotify.executionCount).toBe(1);
      expect(pollAndNotify.errorCount).toBe(0);
    });

    it('should handle scraping errors', async () => {
      mockScraper.scrape.mockRejectedValue(new Error('Scraping failed'));

      await expect(pollAndNotify.runOnce()).rejects.toThrow('PollAndNotify.runOnce() failed: Scraping failed');
      
      expect(pollAndNotify.executionCount).toBe(1);
      expect(pollAndNotify.errorCount).toBe(1);
    }, 15000); // Increased timeout for retry mechanism

    it('should handle notification errors', async () => {
      const events = [
        {
          villageName: 'Village1',
          x: 450,
          y: 465,
          points: 1234,
          oldPlayer: 'Player1',
          oldTribe: 'SiSu',
          newPlayer: 'Player2',
          newTribe: 'EnemyTribe',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ];

      mockScraper.scrape.mockResolvedValue(events);
      mockStateStore.loadLastHash.mockResolvedValue('different-hash');
      mockNotifier.notifyMany.mockRejectedValue(new Error('Notification failed'));

      await expect(pollAndNotify.runOnce()).rejects.toThrow('PollAndNotify.runOnce() failed: Notification failed');
      
      expect(pollAndNotify.executionCount).toBe(1);
      expect(pollAndNotify.errorCount).toBe(1);
    }, 15000); // Increased timeout for retry mechanism
  });

  describe('getExecutionStats', () => {
    it('should return correct execution statistics', () => {
      pollAndNotify.executionCount = 10;
      pollAndNotify.errorCount = 2;
      pollAndNotify.lastExecutionTime = new Date('2024-01-01T10:00:00Z');

      const stats = pollAndNotify.getExecutionStats();

      expect(stats.executionCount).toBe(10);
      expect(stats.errorCount).toBe(2);
      expect(stats.successRate).toBe('80.00');
      expect(stats.errorRate).toBe('20.00');
      expect(stats.lastExecutionTime).toEqual(new Date('2024-01-01T10:00:00Z'));
    });

    it('should handle zero executions', () => {
      const stats = pollAndNotify.getExecutionStats();

      expect(stats.executionCount).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.errorRate).toBe(0);
    });
  });
}); 