import fs from 'fs/promises';
import path from 'path';
import pino from 'pino';

const logger = pino({ name: 'file-state-store' });

/**
 * File-based implementation of state storage
 */
export class FileStateStore {
  constructor(filePath = './data/state.json') {
    this.filePath = filePath;
  }

  /**
   * Load the last processed timestamp from file
   * @returns {string|null} The last processed timestamp or null if not found
   */
  async loadLastProcessedTimestamp() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const state = JSON.parse(data);
      logger.info('Last processed timestamp loaded from file');
      return state.lastProcessedTimestamp || null;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No existing state file found, starting fresh');
        return null;
      }
      logger.error('Error loading last processed timestamp:', error);
      throw error;
    }
  }

  /**
   * Save the last processed timestamp to file
   * @param {string} timestamp - The timestamp to save
   */
  async saveLastProcessedTimestamp(timestamp) {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Read existing state or create new
      let state = {};
      try {
        const data = await fs.readFile(this.filePath, 'utf8');
        state = JSON.parse(data);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Update state
      state.lastProcessedTimestamp = timestamp;

      // Write to temporary file first, then rename for atomic operation
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
      await fs.rename(tempPath, this.filePath);

      logger.info({ timestamp }, 'Last processed timestamp saved to file');
    } catch (error) {
      logger.error('Error saving last processed timestamp:', error);
      throw error;
    }
  }

  /**
   * Clear all stored state
   */
  async clear() {
    try {
      await fs.unlink(this.filePath);
      logger.info('State file cleared');
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('State file already does not exist');
        return;
      }
      logger.error('Error clearing state file:', error);
      throw error;
    }
  }
}