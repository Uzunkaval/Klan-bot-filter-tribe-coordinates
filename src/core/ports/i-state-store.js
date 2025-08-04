/**
 * Interface for state storage operations
 */
export class IStateStore {
  /**
   * Load the last processed timestamp from storage
   * @returns {string|null} The last processed timestamp or null if not found
   */
  loadLastProcessedTimestamp() {
    throw new Error('loadLastProcessedTimestamp() must be implemented');
  }

  /**
   * Save the last processed timestamp to storage
   * @param {string} timestamp - The timestamp to save
   */
  saveLastProcessedTimestamp(timestamp) {
    throw new Error('saveLastProcessedTimestamp() must be implemented');
  }

  /**
   * Clear all stored state
   */
  clear() {
    throw new Error('clear() must be implemented');
  }
} 