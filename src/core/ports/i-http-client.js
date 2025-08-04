/**
 * @typedef {Object} IHttpClient
 * @description HTTP client interface for making external requests
 */

/**
 * Makes a GET request to the specified URL
 * @param {string} url - The URL to fetch
 * @returns {Promise<string>} The response body as string
 * @throws {Error} When request fails
 */
export class IHttpClient {
  async get(url) {
    throw new Error('IHttpClient.get() must be implemented');
  }
} 