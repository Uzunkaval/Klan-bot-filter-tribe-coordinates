import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheerioScraper } from '../src/infrastructure/scraper/cheerio-scraper.js';
import { IHttpClient } from '../src/core/ports/i-http-client.js';
import fs from 'fs/promises';
import path from 'path';

// Mock IHttpClient
class MockHttpClient extends IHttpClient {
  constructor(fixtureContent) {
    super();
    this.fixtureContent = fixtureContent;
  }

  async get(url) {
    return this.fixtureContent;
  }
}

describe('CheerioScraper', () => {
  let scraper;
  let mockHttpClient;
  let fixtureContent;

  beforeEach(async () => {
    // Load fixture content
    const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'ennoblements.html');
    fixtureContent = await fs.readFile(fixturePath, 'utf-8');
    
    // Create mock HTTP client
    mockHttpClient = new MockHttpClient(fixtureContent);
    
    // Create scraper instance with CSS selector that matches the fixture
    scraper = new CheerioScraper(mockHttpClient, 'https://example.com/ennoblements', 'table tbody tr');
  });

  describe('scrape()', () => {
    it('should parse ennoblement events from HTML table', async () => {
      const events = await scraper.scrape();

      expect(events).toHaveLength(3);
      expect(events).toBeInstanceOf(Array);
    });

    it('should correctly parse village data with coordinates and continent', async () => {
      const events = await scraper.scrape();

      // First event
      expect(events[0].villageName).toBe('VillageName');
      expect(events[0].x).toBe(450);
      expect(events[0].y).toBe(465);
      expect(events[0].continent).toBe('K47');

      // Second event
      expect(events[1].villageName).toBe('AnotherVillage');
      expect(events[1].x).toBe(451);
      expect(events[1].y).toBe(463);
      expect(events[1].continent).toBe('K47');

      // Third event
      expect(events[2].villageName).toBe('ThirdVillage');
      expect(events[2].x).toBe(453);
      expect(events[2].y).toBe(460);
      expect(events[2].continent).toBe('K47');
    });

    it('should correctly parse points', async () => {
      const events = await scraper.scrape();

      expect(events[0].points).toBe(1234);
      expect(events[1].points).toBe(2567);
      expect(events[2].points).toBe(890);
    });

    it('should correctly parse player and tribe information', async () => {
      const events = await scraper.scrape();

      // First event
      expect(events[0].oldPlayer).toBe('OldPlayer');
      expect(events[0].oldTribe).toBe('SiSu');
      expect(events[0].newPlayer).toBe('NewPlayer');
      expect(events[0].newTribe).toBe('EnemyTribe');

      // Second event
      expect(events[1].oldPlayer).toBe('EnemyPlayer');
      expect(events[1].oldTribe).toBe('EnemyTribe');
      expect(events[1].newPlayer).toBe('SiSuPlayer');
      expect(events[1].newTribe).toBe('SiSu');

      // Third event
      expect(events[2].oldPlayer).toBe('SomePlayer');
      expect(events[2].oldTribe).toBe('NeutralTribe');
      expect(events[2].newPlayer).toBe('AnotherPlayer');
      expect(events[2].newTribe).toBe('SiSu');
    });

    it('should normalize timestamps to ISO format', async () => {
      const events = await scraper.scrape();

      // Check that all timestamps are valid ISO strings
      events.forEach(event => {
        expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });

      // Verify specific timestamps are parsed correctly
      const firstEvent = new Date(events[0].timestamp);
      expect(firstEvent.getFullYear()).toBe(2024);
      expect(firstEvent.getMonth()).toBe(11); // December (0-based)
      expect(firstEvent.getDate()).toBe(15);
      expect(firstEvent.getHours()).toBe(14);
      expect(firstEvent.getMinutes()).toBe(30);
    });

    it('should handle missing tribe gracefully', async () => {
      // Create a modified fixture with missing tribe
      const modifiedFixture = fixtureContent.replace('[SiSu]', '');
      const modifiedHttpClient = new MockHttpClient(modifiedFixture);
      const modifiedScraper = new CheerioScraper(modifiedHttpClient, 'https://example.com/ennoblements', 'table tbody tr');

      const events = await modifiedScraper.scrape();
      
      // Should still parse successfully with null tribe
      expect(events[0].oldTribe).toBeNull();
    });

    it('should skip header rows and empty rows', async () => {
      const events = await scraper.scrape();

      // Should only have 3 data rows, not including header
      expect(events).toHaveLength(3);
      
      // Verify no header data is included
      events.forEach(event => {
        expect(event.villageName).not.toBe('Village');
        expect(event.oldPlayer).not.toBe('Old Owner');
        expect(event.newPlayer).not.toBe('New Owner');
      });
    });

    it('should return valid EnnoblementEvent objects', async () => {
      const events = await scraper.scrape();

      events.forEach(event => {
        expect(event).toHaveProperty('villageName');
        expect(event).toHaveProperty('x');
        expect(event).toHaveProperty('y');
        expect(event).toHaveProperty('continent');
        expect(event).toHaveProperty('points');
        expect(event).toHaveProperty('oldPlayer');
        expect(event).toHaveProperty('oldTribe');
        expect(event).toHaveProperty('newPlayer');
        expect(event).toHaveProperty('newTribe');
        expect(event).toHaveProperty('timestamp');

        // Validate data types
        expect(typeof event.villageName).toBe('string');
        expect(typeof event.x).toBe('number');
        expect(typeof event.y).toBe('number');
        expect(typeof event.continent).toBe('string');
        expect(typeof event.points).toBe('number');
        expect(typeof event.oldPlayer).toBe('string');
        expect(typeof event.newPlayer).toBe('string');
        expect(typeof event.timestamp).toBe('string');
        expect(event.oldTribe === null || typeof event.oldTribe === 'string').toBe(true);
        expect(event.newTribe === null || typeof event.newTribe === 'string').toBe(true);
      });
    });
  });
}); 