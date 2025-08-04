import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStateStore } from '../src/infrastructure/store/file-state-store.js';
import fs from 'fs/promises';
import path from 'path';

describe('FileStateStore', () => {
  let stateStore;
  const testFilePath = './test-state.json';

  beforeEach(() => {
    stateStore = new FileStateStore(testFilePath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // File might not exist, ignore
    }
  });

  describe('loadLastHash', () => {
    it('should return null when file does not exist', async () => {
      const hash = await stateStore.loadLastHash();
      expect(hash).toBeNull();
    });

    it('should load hash from existing file', async () => {
      const testHash = 'test-hash-123';
      const testState = { lastHash: testHash };
      
      await fs.writeFile(testFilePath, JSON.stringify(testState));
      
      const hash = await stateStore.loadLastHash();
      expect(hash).toBe(testHash);
    });

    it('should handle malformed JSON gracefully', async () => {
      await fs.writeFile(testFilePath, 'invalid json');
      
      await expect(stateStore.loadLastHash()).rejects.toThrow();
    });
  });

  describe('saveLastHash', () => {
    it('should save hash to file', async () => {
      const testHash = 'new-hash-456';
      
      await stateStore.saveLastHash(testHash);
      
      const data = await fs.readFile(testFilePath, 'utf8');
      const savedState = JSON.parse(data);
      
      expect(savedState.lastHash).toBe(testHash);
    });

    it('should create directory if it does not exist', async () => {
      const dirPath = './test-dir';
      const filePath = `${dirPath}/state.json`;
      const testStore = new FileStateStore(filePath);
      
      const testHash = 'test-hash';
      await testStore.saveLastHash(testHash);
      
      const data = await fs.readFile(filePath, 'utf8');
      const savedState = JSON.parse(data);
      
      expect(savedState.lastHash).toBe(testHash);
      
      // Cleanup
      await fs.unlink(filePath);
      await fs.rmdir(dirPath);
    });
  });

  describe('clear', () => {
    it('should remove state file', async () => {
      const testHash = 'test-hash';
      await stateStore.saveLastHash(testHash);
      
      // Verify file exists
      const exists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      await stateStore.clear();
      
      // Verify file is removed
      const stillExists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(stillExists).toBe(false);
    });

    it('should handle non-existent file gracefully', async () => {
      await expect(stateStore.clear()).resolves.not.toThrow();
    });
  });

  describe('getCurrentState', () => {
    it('should return current state object', async () => {
      const testHash = 'test-hash';
      await stateStore.saveLastHash(testHash);
      
      const state = stateStore.getCurrentState();
      expect(state).toEqual({ lastHash: testHash });
    });

    it('should return null when no state is loaded', () => {
      const state = stateStore.getCurrentState();
      expect(state).toBeNull();
    });
  });
}); 