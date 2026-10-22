import { describe, expect, it } from 'vitest';
import { protectConfig, unprotectConfig } from './credentials.js';
describe('Windows credential storage',()=>{
 it.skipIf(process.platform!=='win32')('encrypts secrets on disk and restores them without changing model metadata',()=>{
 const original={providers:{local:{apiKey:'scoreler-test-secret-not-a-real-key',baseUrl:'http://localhost:11434/v1'}},tavily:{apiKey:'test-search-key'},ui:{theme:'light'}};
 const encrypted=protectConfig(original);expect(JSON.stringify(encrypted)).not.toContain('scoreler-test-secret-not-a-real-key');expect(encrypted.providers.local.apiKey).toMatch(/^dpapi:v1:/);expect(unprotectConfig(encrypted)).toEqual(original);
 });
});
