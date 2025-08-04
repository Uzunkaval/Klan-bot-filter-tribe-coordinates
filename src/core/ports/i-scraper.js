import { createEnnoblementEvent } from '../entities/ennoblement-event.js';

/**
 * @typedef {import('../entities/ennoblement-event.js').EnnoblementEvent} EnnoblementEvent
 * @description Web scraper interface for extracting ennoblement events
 */

/**
 * Scrapes ennoblement events from Tribal Wars
 * @returns {Promise<EnnoblementEvent[]>} Array of ennoblement events
 * @throws {Error} When scraping fails
 */
export class IScraper {
  async scrape() {
    throw new Error('IScraper.scrape() must be implemented');
  }
} 