import { IScraper } from '../../core/ports/i-scraper.js';
import { createEnnoblementEvent } from '../../core/entities/ennoblement-event.js';
import { IHttpClient } from '../../core/ports/i-http-client.js';
import * as cheerio from 'cheerio';
import pino from 'pino';

const logger = pino({ name: 'cheerio-scraper' });

/**
 * Cheerio-based scraper for Tribal Wars TR94 ennoblement events
 * Parses HTML table and extracts structured event data
 */
export class CheerioScraper extends IScraper {
  /**
   * Creates a new CheerioScraper instance
   * @param {IHttpClient} httpClient - HTTP client for fetching pages
   * @param {string} url - URL to scrape
   * @param {string} cssSelector - CSS selector for table rows (optional)
   */
  constructor(httpClient, url, cssSelector = 'table.table tbody tr') {
    super();
    this.httpClient = httpClient;
    this.url = url;
    this.cssSelector = cssSelector;
  }

  /**
   * Scrapes ennoblement events from Tribal Wars TR94 page
   * @returns {Promise<EnnoblementEvent[]>} Array of parsed ennoblement events
   * @throws {Error} When scraping or parsing fails
   */
  async scrape() {
    try {
      logger.info({ url: this.url, cssSelector: this.cssSelector }, 'Starting to scrape ennoblement events');
      
      const html = await this.httpClient.get(this.url);
      const $ = cheerio.load(html);
      
      const events = [];
      
      // Try configured CSS selector first, then fallback to multiple selectors
      const rowSelectors = [
        this.cssSelector,
        'table tbody tr',
        'table.table tbody tr',
        'table:contains("Ennoblements") tbody tr',
        'table:contains("Village") tbody tr',
        'table:contains("Old Owner") tbody tr',
        'tbody tr',
        'tr'
      ];
      
      let rows = null;
      for (const selector of rowSelectors) {
        rows = $(selector);
        if (rows.length > 0) {
          logger.debug({ selector, rowCount: rows.length }, 'Found rows with selector');
          break;
        }
      }
      
      if (!rows || rows.length === 0) {
        throw new Error('No ennoblement table rows found on page');
      }
      
      logger.debug({ rowCount: rows.length }, 'Found table rows');
      
      for (let i = 0; i < rows.length; i++) {
        const row = $(rows[i]);
        const cells = row.find('td');
        
        // Skip header rows and empty rows
        if (cells.length < 4 || row.find('th').length > 0) {
          continue;
        }
        
        try {
          const event = this._parseRow($, row, cells);
          if (event) {
            events.push(event);
          }
        } catch (error) {
          logger.warn({ rowIndex: i, error: error.message }, 'Failed to parse row, skipping');
        }
      }
      
      logger.info({ eventCount: events.length }, 'Successfully scraped ennoblement events');
      return events;
      
    } catch (error) {
      logger.error({ url: this.url, error: error.message }, 'Failed to scrape ennoblement events');
      throw error;
    }
  }

  /**
   * Parses a single table row into an EnnoblementEvent
   * @param {Object} $ - Cheerio instance
   * @param {Object} row - Row element
   * @param {Object} cells - Cell elements
   * @returns {EnnoblementEvent|null} Parsed event or null if invalid
   * @private
   */
  _parseRow($, row, cells) {
    const cellTexts = cells.map((i, cell) => $(cell).text().trim()).get();
    
    if (cellTexts.length < 4) {
      return null;
    }
    
    // Extract village name and coordinates
    const villageCell = cellTexts[0];
    const { villageName, x, y, continent } = this._parseVillageAndCoords(villageCell);
    
    // Extract points
    const points = this._parsePoints(cellTexts[1]);
    
    // Extract old owner and tribe
    const oldOwnerCell = cellTexts[2];
    const { player: oldPlayer, tribe: oldTribe } = this._parsePlayerAndTribe(oldOwnerCell);
    
    // Extract new owner and tribe
    const newOwnerCell = cellTexts[3];
    const { player: newPlayer, tribe: newTribe } = this._parsePlayerAndTribe(newOwnerCell);
    
    // Extract timestamp
    const timestamp = this._parseTimestamp(cellTexts[4] || cellTexts[3]);
    
    // Validate required fields
    if (!villageName || !oldPlayer || !newPlayer || !timestamp) {
      return null;
    }
    
    return createEnnoblementEvent({
      villageName,
      x,
      y,
      continent,
      points,
      oldPlayer,
      oldTribe,
      newPlayer,
      newTribe,
      timestamp
    });
  }

  /**
   * Parses village name and coordinates from village cell
   * @param {string} villageCell - Village cell text
   * @returns {Object} Parsed village data
   * @private
   */
  _parseVillageAndCoords(villageCell) {
    // Extract coordinates using regex fallback
    const coordMatch = villageCell.match(/\((\d+)\|(\d+)\)/);
    let x = 0, y = 0;
    
    if (coordMatch) {
      x = parseInt(coordMatch[1], 10);
      y = parseInt(coordMatch[2], 10);
    }
    
    // Extract continent from "K.." suffix
    const continentMatch = villageCell.match(/K(\d+)/);
    const continent = continentMatch ? `K${continentMatch[1]}` : 'Unknown';
    
    // Clean village name (remove coordinates and continent)
    const villageName = villageCell
      .replace(/\(\d+\|\d+\)/, '')
      .replace(/\s*K\d+.*$/, '')
      .trim();
    
    return { villageName, x, y, continent };
  }

  /**
   * Parses points from points cell
   * @param {string} pointsCell - Points cell text
   * @returns {number} Parsed points
   * @private
   */
  _parsePoints(pointsCell) {
    // Remove commas and extract all digits
    const cleanPoints = pointsCell.replace(/,/g, '');
    const pointsMatch = cleanPoints.match(/(\d+)/);
    return pointsMatch ? parseInt(pointsMatch[1], 10) : 0;
  }

  /**
   * Parses player name and tribe from owner cell
   * @param {string} ownerCell - Owner cell text
   * @returns {Object} Parsed player and tribe data
   * @private
   */
  _parsePlayerAndTribe(ownerCell) {
    // Extract tribe using regex fallback
    const tribeMatch = ownerCell.match(/\[(.*?)\]/);
    const tribe = tribeMatch ? tribeMatch[1].trim() : null;
    
    // Extract player name (remove tribe brackets)
    const player = ownerCell
      .replace(/\[.*?\]/, '')
      .trim();
    
    return { player, tribe };
  }

  /**
   * Parses timestamp from date/time cell
   * @param {string} timestampCell - Timestamp cell text
   * @returns {string} ISO timestamp string
   * @private
   */
  _parseTimestamp(timestampCell) {
    // Try to parse various date formats
    const dateFormats = [
      /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/, // DD.MM.YYYY HH:MM
      /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/,   // YYYY-MM-DD HH:MM
      /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/  // MM/DD/YYYY HH:MM
    ];
    
    for (const format of dateFormats) {
      const match = timestampCell.match(format);
      if (match) {
        const [, day, month, year, hour, minute] = match;
        const date = new Date(year, month - 1, day, hour, minute);
        return date.toISOString();
      }
    }
    
    // If no format matches, return as-is (assuming it's already ISO)
    return timestampCell.trim() || new Date().toISOString();
  }
} 