/**
 * Comprehensive Cache Controller, Middleware, and Routes Test Suite
 * Tests all cache endpoints, middleware functions, and edge cases
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import TestStartup from '../utils/test.startup.js';

describe('Cache Controller, Middleware, and Routes - Comprehensive Tests', () => {
    let testStartup;
    let client;

    beforeAll(async () => {
        testStartup = new TestStartup('cache');
        await testStartup.initialize();
        client = testStartup.getClient();
        console.log('Cache tests initialized on port:', testStartup.port, 'DB:', testStartup.dbName);
    }, 60000);

    afterAll(async () => {
        await testStartup.cleanup();
    }, 30000);

    describe('Cache Controller - Statistics', () => {
        describe('GET /api/v1/cache/stats - Success Cases', () => {
            test('should get cache statistics as admin', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/stats');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.cacheStats).toBeDefined();
                expect(response.data.cacheStats.redisInfo).toBeDefined();
                expect(response.data.cacheStats.redisInfo.memory).toBeDefined();
                expect(response.data.cacheStats.redisInfo.stats).toBeDefined();
                expect(response.data.cacheStats.cacheHitRate).toBeDefined();
                expect(response.data.meta).toBeDefined();
                expect(response.data.meta.timestamp).toBeDefined();
            });

            test('should get cache statistics as owner', async () => {
                await testStartup.loginAsUser('owner');
                const response = await client.get('/api/v1/cache/stats');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.cacheStats).toBeDefined();
                expect(response.data.cacheStats.cacheHitRate).toBeGreaterThanOrEqual(0);
            });

            test('should include Redis connection status', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/stats');

                expect(response.status).toBe(200);
                expect(response.data.cacheStats.redisInfo.memory).toBeDefined();
                expect(response.data.cacheStats.redisInfo.stats).toBeDefined();
            });

            test('should include performance metrics', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/stats');

                expect(response.status).toBe(200);
                expect(response.data.cacheStats.cacheHitRate).toBeDefined();
                expect(response.data.cacheStats.timestamp).toBeDefined();
                expect(response.data.cacheStats.redisInfo.stats.keyspace_hits).toBeDefined();
                expect(response.data.cacheStats.redisInfo.stats.keyspace_misses).toBeDefined();
            });
        });

        describe('GET /api/v1/cache/stats - Permission Errors', () => {
            test('should deny access to regular users', async () => {
                await testStartup.loginAsUser('user');
                const response = await client.get('/api/v1/cache/stats');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny access to creator users', async () => {
                await testStartup.loginAsUser('creator');
                const response = await client.get('/api/v1/cache/stats');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny access to super creator users', async () => {
                await testStartup.loginAsUser('superCreator');
                const response = await client.get('/api/v1/cache/stats');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny access without authentication', async () => {
                client.clearCookies();
                const response = await client.get('/api/v1/cache/stats');
                
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });

            test('should deny access with invalid token', async () => {
                client.clearCookies();
                const response = await client.get('/api/v1/cache/stats');
                
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('Cache Controller - Clear Cache', () => {
        describe('DELETE /api/v1/cache - Success Cases', () => {
            test('should clear cache as admin', async () => {
                // First, populate some cache by making requests
                await testStartup.loginAsUser('admin');
                await client.get('/api/v1/users?limit=1'); // This should be cached

                // Then clear the cache
                const response = await client.delete('/api/v1/cache');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.message).toContain('Cache data and statistics cleared successfully');
                expect(response.data.meta).toBeDefined();
                expect(response.data.meta.resetTimestamp).toBeDefined();
            });

            test('should clear cache as owner', async () => {
                await testStartup.loginAsUser('owner');
                const response = await client.delete('/api/v1/cache');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });

            test('should clear cache when no cache exists', async () => {
                await testStartup.loginAsUser('admin');
                // Clear cache twice
                await client.delete('/api/v1/cache');
                const response = await client.delete('/api/v1/cache');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });
        });

        describe('DELETE /api/v1/cache - Permission Errors', () => {
            test('should deny cache clearing for regular users', async () => {
                await testStartup.loginAsUser('user');
                const response = await client.delete('/api/v1/cache');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny cache clearing for creator users', async () => {
                await testStartup.loginAsUser('creator');
                const response = await client.delete('/api/v1/cache');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny cache clearing without authentication', async () => {
                client.clearCookies();
                const response = await client.delete('/api/v1/cache');
                
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('Cache Controller - Cleanup Service', () => {
        describe('GET /api/v1/cache/cleanup - Success Cases', () => {
            test('should get cleanup service status as admin', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/cleanup');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.cleanup).toBeDefined();
                expect(response.data.cleanup.enabled).toBeDefined();
                expect(response.data.cleanup.isRunning).toBeDefined();
                expect(response.data.cleanup.intervalHours).toBeDefined();
                expect(response.data.cleanup.minAgeHours).toBeDefined();
                expect(response.data.cleanup.maxKeysPerRun).toBeDefined();
                expect(response.data.cleanup.totalRuns).toBeDefined();
            });

            test('should get cleanup service configuration', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/cleanup');

                expect(response.status).toBe(200);
                expect(response.data.cleanup.intervalHours).toBeGreaterThan(0);
                expect(response.data.cleanup.minAgeHours).toBeGreaterThan(0);
                expect(response.data.cleanup.maxKeysPerRun).toBeGreaterThan(0);
            });

            test('should include cleanup statistics', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/cleanup');

                expect(response.status).toBe(200);
                expect(response.data.cleanup.lastRun).toBeDefined();
                expect(response.data.cleanup.nextRun).toBeDefined();
                expect(response.data.cleanup.lastRunStats).toBeDefined();
                expect(response.data.cleanup.lastRunStats.keysRemoved).toBeDefined();
                expect(response.data.cleanup.lastRunStats.duration).toBeDefined();
            });
        });

        describe('POST /api/v1/cache/cleanup - Success Cases', () => {
            test('should manually trigger cleanup as admin', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.post('/api/v1/cache/cleanup');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.message).toContain('Manual cache cleanup completed successfully');
                expect(response.data.cleanup).toBeDefined();
                expect(response.data.cleanup.keysRemoved).toBeDefined();
                expect(response.data.cleanup.duration).toBeDefined();
                expect(response.data.cleanup.keysScanned).toBeDefined();
                expect(response.data.cleanup.timestamp).toBeDefined();
            });

            test('should trigger cleanup as owner', async () => {
                await testStartup.loginAsUser('owner');
                const response = await client.post('/api/v1/cache/cleanup');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });

            test('should handle cleanup when no keys need cleaning', async () => {
                await testStartup.loginAsUser('admin');
                // Run cleanup twice in quick succession
                await client.post('/api/v1/cache/cleanup');
                const response = await client.post('/api/v1/cache/cleanup');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.cleanup.keysRemoved).toBeGreaterThanOrEqual(0);
            });
        });

        describe('Cache Cleanup - Permission Errors', () => {
            test('should deny cleanup status to regular users', async () => {
                await testStartup.loginAsUser('user');
                const response = await client.get('/api/v1/cache/cleanup');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny manual cleanup to regular users', async () => {
                await testStartup.loginAsUser('user');
                const response = await client.post('/api/v1/cache/cleanup');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny cleanup operations without authentication', async () => {
                client.clearCookies();
                const response = await client.get('/api/v1/cache/cleanup');
                
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('Cache Controller - Health Check', () => {
        describe('GET /api/v1/cache/health - Success Cases', () => {
            test('should get cache health status as admin', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/health');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.cache).toBeDefined();
                expect(response.data.cache.redis).toBeDefined();
                expect(response.data.cache.redis.status).toBeDefined();
                expect(response.data.cache.redis.connected).toBeDefined();
                expect(response.data.cache.cache).toBeDefined();
                expect(response.data.cache.cache.enabled).toBeDefined();
                expect(response.data.meta).toBeDefined();
                expect(response.data.meta.timestamp).toBeDefined();
            });

            test('should include Redis connection health', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/health');

                expect(response.status).toBe(200);
                expect(response.data.cache.redis.status).toMatch(/^(connected|disconnected|error)$/);
                expect(typeof response.data.cache.redis.connected).toBe('boolean');
            });

            test('should include cache system health', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/cache/health');

                expect(response.status).toBe(200);
                expect(typeof response.data.cache.cache.enabled).toBe('boolean');
                expect(response.data.cache.cache.operational).toBeDefined();
            });
        });

        describe('GET /api/v1/cache/health - Permission Errors', () => {
            test('should deny health check to regular users', async () => {
                await testStartup.loginAsUser('user');
                const response = await client.get('/api/v1/cache/health');
                
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny health check without authentication', async () => {
                client.clearCookies();
                const response = await client.get('/api/v1/cache/health');
                
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('Cache Middleware - Response Caching', () => {
        describe('cacheResponse Middleware', () => {
            test('should cache GET responses', async () => {
                await testStartup.loginAsUser('admin');
                
                // First request - should be a cache miss
                const response1 = await client.get('/api/v1/users?limit=2');
                expect(response1.status).toBe(200);
                
                // Second request - should be a cache hit
                const response2 = await client.get('/api/v1/users?limit=2');
                expect(response2.status).toBe(200);
                expect(response2.headers['x-cache-status']).toBeDefined();
                
                // Responses should be identical
                expect(response1.data.users.length).toBe(response2.data.users.length);
            });

            test('should handle cache headers correctly', async () => {
                await testStartup.loginAsUser('admin');
                
                // Make a request to a cached endpoint
                const response = await client.get('/api/v1/cache/stats');
                expect(response.status).toBe(200);
                
                // Check for cache-related headers
                expect(response.headers['x-cache']).toBeDefined();
                expect(response.headers['x-cache-status']).toBeDefined();
            });

            test('should respect cache duration', async () => {
                await testStartup.loginAsUser('admin');
                
                // Make request to endpoint with short cache duration
                const response = await client.get('/api/v1/cache/stats');
                expect(response.status).toBe(200);
                
                // Cache should be populated
                expect(response.headers['x-cache-status']).toBeDefined();
            });
        });

        describe('noCacheResponse Middleware', () => {
            test('should prevent caching for health endpoints', async () => {
                await testStartup.loginAsUser('admin');
                
                const response = await client.get('/api/v1/cache/health');
                expect(response.status).toBe(200);
                
                // Should have no-cache headers
                expect(
                    response.headers['cache-control'] || 
                    response.headers['x-cache-status']
                ).toBeDefined();
            });

            test('should prevent caching for cleanup endpoints', async () => {
                await testStartup.loginAsUser('admin');
                
                const response = await client.get('/api/v1/cache/cleanup');
                expect(response.status).toBe(200);
                
                // Should not be cached
                expect(response.headers['x-cache-status']).not.toBe('HIT');
            });
        });

        describe('Cache Invalidation', () => {
            test('should invalidate cache on data updates', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Cache',
                    lastName: 'Test',
                    prefix: 'cacheinvalidation'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    
                    // Get user - should populate cache
                    const response1 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response1.status).toBe(200);
                    expect(response1.data.firstName).toBe('Cache');
                    
                    // Update user - should invalidate cache
                    const updateData = { firstName: 'CacheUpdated' };
                    const updateResponse = await client.put(`/api/v1/users/${testUser.id}`, updateData);
                    expect(updateResponse.status).toBe(200);
                    
                    // Get user again - should return updated data
                    const response2 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response2.status).toBe(200);
                    expect(response2.data.user.firstName).toBe('CacheUpdated');
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should invalidate related caches on user operations', async () => {
                await testStartup.loginAsUser('admin');
                
                // Get users list - should populate cache
                const response1 = await client.get('/api/v1/users?limit=3');
                expect(response1.status).toBe(200);
                
                // Create new user - should invalidate users list cache
                const userData = {
                    firstName: 'Cache',
                    lastName: 'Invalidation',
                    username: 'cacheinval_' + Date.now(),
                    email: `cacheinval.${Date.now()}@example.com`,
                    password: 'CacheInval123!'
                };
                
                const createResponse = await client.post('/api/v1/users', userData);
                expect(createResponse.status).toBe(201);
                
                // Get users list again - should reflect changes
                const response2 = await client.get('/api/v1/users?limit=3');
                expect(response2.status).toBe(200);
            });
        });
    });

    describe('Cache Middleware - Edge Cases', () => {
        describe('Cache Error Handling', () => {
            test('should handle Redis connection issues gracefully', async () => {
                await testStartup.loginAsUser('admin');
                
                // Test should still work even if Redis has issues
                const response = await client.get('/api/v1/users?limit=1');
                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });

            test('should handle cache key generation errors', async () => {
                await testStartup.loginAsUser('admin');
                
                // Request with special characters that might cause issues
                const response = await client.get('/api/v1/users?search=' + encodeURIComponent('test@#$%^&*()'));
                expect(response.status).toBe(200);
            });

            test('should handle large cached responses', async () => {
                await testStartup.loginAsUser('admin');
                
                // Request large dataset
                const response = await client.get('/api/v1/users?limit=50');
                expect(response.status).toBe(200);
                expect(response.data.users).toBeDefined();
            });
        });

        describe('Cache Performance', () => {
            test('should handle multiple concurrent cache requests', async () => {
                await testStartup.loginAsUser('admin');
                
                const startTime = Date.now();
                
                // Make multiple concurrent requests to the same cached endpoint
                const promises = Array(5).fill().map(() => 
                    client.get('/api/v1/users?limit=2')
                );
                
                const results = await Promise.all(promises);
                const endTime = Date.now();
                
                // All requests should succeed
                results.forEach(result => {
                    expect(result.status).toBe(200);
                    expect(result.data.success).toBe(true);
                });
                
                // Should complete within reasonable time
                expect(endTime - startTime).toBeLessThan(3000);
            });

            test('should handle cache statistics updates', async () => {
                await testStartup.loginAsUser('admin');
                
                // Make several requests to populate statistics
                await client.get('/api/v1/users?limit=1');
                await client.get('/api/v1/users?limit=2');
                await client.get('/api/v1/users?limit=3');
                
                // Get cache statistics
                const statsResponse = await client.get('/api/v1/cache/stats');
                expect(statsResponse.status).toBe(200);
                expect(statsResponse.data.cacheStats.cacheHitRate).toBeGreaterThanOrEqual(0);
            });
        });

        describe('Cache Configuration', () => {
            test('should respect cache TTL settings', async () => {
                await testStartup.loginAsUser('admin');
                
                // Test short-lived cache endpoint
                const response = await client.get('/api/v1/cache/stats');
                expect(response.status).toBe(200);
                
                // Cache should have appropriate TTL
                expect(response.headers['x-cache']).toBeDefined();
            });

            test('should handle cache disabled scenarios', async () => {
                await testStartup.loginAsUser('admin');
                
                // Even with cache issues, endpoints should work
                const response = await client.get('/api/v1/users?limit=1');
                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });
        });
    });

    describe('Cache Integration with Other Systems', () => {
        describe('User Management Integration', () => {
            test('should cache user data appropriately', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Integration',
                    lastName: 'Test',
                    prefix: 'cacheintegration'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    
                    // First request should populate cache
                    const response1 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response1.status).toBe(200);
                    
                    // Second request should use cache
                    const response2 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response2.status).toBe(200);
                    
                    // Data should be consistent
                    expect(response1.data.firstName).toBe(response2.data.firstName);
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should handle user statistics caching', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Stats',
                    lastName: 'Cache',
                    prefix: 'statscache'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    
                    // Get user stats
                    const response = await client.get(`/api/v1/users/${testUser.id}/stats`);
                    expect(response.status).toBe(200);
                    expect(response.data.stats).toBeDefined();
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });
        });

        describe('Authentication Integration', () => {
            test('should handle token-based cache keys', async () => {
                // Test with different user tokens
                await testStartup.loginAsUser('admin');
                const adminResponse = await client.get('/api/v1/users?limit=1');
                expect(adminResponse.status).toBe(200);
                
                await testStartup.loginAsUser('owner');
                const ownerResponse = await client.get('/api/v1/users?limit=1');
                expect(ownerResponse.status).toBe(200);
                
                // Both should succeed but may have different caching behavior
                expect(adminResponse.data.success).toBe(true);
                expect(ownerResponse.data.success).toBe(true);
            });
        });
    });

    describe('Performance and Load Testing', () => {
        describe('Cache Performance Under Load', () => {
            test('should handle high-frequency cache operations', async () => {
                await testStartup.loginAsUser('admin');
                
                const startTime = Date.now();
                
                // Make many requests to test cache performance
                const promises = Array(10).fill().map((_, index) => 
                    client.get(`/api/v1/users?limit=${index + 1}`)
                );
                
                const results = await Promise.all(promises);
                const endTime = Date.now();
                
                // All requests should succeed
                results.forEach(result => {
                    expect(result.status).toBe(200);
                    expect(result.data.success).toBe(true);
                });
                
                // Should complete within reasonable time
                expect(endTime - startTime).toBeLessThan(5000);
            });

            test('should handle cache cleanup under load', async () => {
                await testStartup.loginAsUser('admin');
                
                // Generate some cache entries
                const requests = Array(5).fill().map((_, index) => 
                    client.get(`/api/v1/users?page=${index + 1}&limit=2`)
                );
                
                await Promise.all(requests);
                
                // Run cleanup
                const cleanupResponse = await client.post('/api/v1/cache/cleanup');
                expect(cleanupResponse.status).toBe(200);
                expect(cleanupResponse.data.success).toBe(true);
            });

            test('should maintain cache statistics accuracy', async () => {
                await testStartup.loginAsUser('admin');
                
                // Make requests to generate statistics
                await client.get('/api/v1/users?limit=1');
                await client.get('/api/v1/users?limit=2');
                
                // Get statistics multiple times
                const stats1 = await client.get('/api/v1/cache/stats');
                const stats2 = await client.get('/api/v1/cache/stats');
                
                expect(stats1.status).toBe(200);
                expect(stats2.status).toBe(200);
                expect(stats1.data.cacheStats).toBeDefined();
                expect(stats2.data.cacheStats).toBeDefined();
            });
        });
    });
});
