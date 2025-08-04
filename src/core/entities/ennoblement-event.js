/**
 * @typedef {Object} EnnoblementEvent
 * @description Represents an ennoblement event from Tribal Wars
 * @property {string} villageName - Name of the village
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 * @property {string} continent - Continent identifier
 * @property {number} points - Village points
 * @property {string} oldPlayer - Previous owner player name
 * @property {string|null} oldTribe - Previous owner tribe name or null
 * @property {string} newPlayer - New owner player name
 * @property {string|null} newTribe - New owner tribe name or null
 * @property {string} timestamp - ISO timestamp string
 */

/**
 * Creates a new EnnoblementEvent instance
 * @param {Object} data - Event data
 * @param {string} data.villageName
 * @param {number} data.x
 * @param {number} data.y
 * @param {string} data.continent
 * @param {number} data.points
 * @param {string} data.oldPlayer
 * @param {string|null} data.oldTribe
 * @param {string} data.newPlayer
 * @param {string|null} data.newTribe
 * @param {string} data.timestamp
 * @returns {EnnoblementEvent}
 */
export function createEnnoblementEvent(data) {
  return {
    villageName: data.villageName,
    x: data.x,
    y: data.y,
    continent: data.continent,
    points: data.points,
    oldPlayer: data.oldPlayer,
    oldTribe: data.oldTribe,
    newPlayer: data.newPlayer,
    newTribe: data.newTribe,
    timestamp: data.timestamp
  };
} 