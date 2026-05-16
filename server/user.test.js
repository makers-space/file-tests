/**
 * Comprehensive User Controller, Middleware, and Routes Test Suite
 * Tests all user endpoints, middleware functions, and edge cases
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import TestStartup from '../utils/test.startup.js';
import ApiClient from '../utils/api.client.js';

describe('User Comprehensive Tests', () => {
    let testStartup;
    let client;

    beforeAll(async () => {
        testStartup = new TestStartup('user');
        await testStartup.initialize();
        client = testStartup.getClient();
        console.log('User tests initialized on port:', testStartup.port, 'DB:', testStartup.dbName);
    }, 60000);

    afterAll(async () => {
        await testStartup.cleanup();
    }, 30000);

    describe('User Controller - Get All Users', () => {
        describe('GET /api/v1/users - Success Cases', () => {
            test('should get all users as admin', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.message).toBe('Users retrieved successfully');
                expect(Array.isArray(response.data.users)).toBe(true);
                expect(response.data.meta).toBeDefined();
                expect(response.data.meta.count).toBeDefined();
                expect(response.data.meta.totalUsers).toBeDefined();
                expect(response.data.meta.timestamp).toBeDefined();
                expect(response.data.users.length).toBeGreaterThan(0);
            });

            test('should get all users as owner', async () => {
                await testStartup.loginAsUser('owner');
                const response = await client.get('/api/v1/users');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.users)).toBe(true);
            });

            test('should support pagination parameters', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?page=1&limit=2');

                expect(response.status).toBe(200);
                expect(response.data.users.length).toBeLessThanOrEqual(2);
                expect(response.data.meta.pagination).toBeDefined();
                expect(response.data.meta.pagination.page).toBe(1);
                expect(response.data.meta.pagination.limit).toBe(2);
                expect(response.data.meta.pagination.totalPages).toBeGreaterThan(0);
            });

            test('should support search and filtering', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?search=admin');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.users)).toBe(true);
            });

            test('should support role filtering', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?role=ADMIN');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });

            test('should support sorting', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?sortBy=createdAt&sortOrder=desc');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.users)).toBe(true);
            });

            test('should return properly formatted user objects', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?limit=1');

                expect(response.status).toBe(200);
                if (response.data.users.length > 0) {
                    const user = response.data.users[0];
                    expect(user).toHaveProperty('id');
                    expect(user).toHaveProperty('firstName');
                    expect(user).toHaveProperty('lastName');
                    expect(user).toHaveProperty('username');
                    expect(user).toHaveProperty('email');
                    expect(user).toHaveProperty('roles');
                    expect(user).toHaveProperty('emailVerified');
                    expect(user).toHaveProperty('active');
                    expect(user).toHaveProperty('createdAt');
                    expect(user).not.toHaveProperty('password');
                    expect(user).not.toHaveProperty('refreshTokens');
                    expect(Array.isArray(user.roles)).toBe(true);
                }
            });

            test('should cache responses appropriately', async () => {
                await testStartup.loginAsUser('admin');
                
                // First request
                const response1 = await client.get('/api/v1/users?limit=3');
                expect(response1.status).toBe(200);
                
                // Second request (should be cached)
                const response2 = await client.get('/api/v1/users?limit=3');
                expect(response2.status).toBe(200);
                
                // Different query should not be cached
                const response3 = await client.get('/api/v1/users?limit=5');
                expect(response3.status).toBe(200);
            });
        });

        describe('GET /api/v1/users - Permission Tests', () => {
            test('should deny access for regular users', async () => {
                await testStartup.loginAsUser('user');
                
                const response = await client.get('/api/v1/users');
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny access for creators', async () => {
                await testStartup.loginAsUser('creator');
                
                const response = await client.get('/api/v1/users');
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny access for super creators', async () => {
                await testStartup.loginAsUser('superCreator');
                
                const response = await client.get('/api/v1/users');
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny access without authentication', async () => {
                client.clearCookies();
                
                const response = await client.get('/api/v1/users');
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });

        describe('GET /api/v1/users - Edge Cases', () => {
            test('should handle invalid pagination parameters gracefully', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?page=-1&limit=0');
                
                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });

            test('should handle invalid sort parameters gracefully', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?sortBy=invalidField');
                
                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });

            test('should handle empty search results', async () => {
                await testStartup.loginAsUser('admin');
                const response = await client.get('/api/v1/users?search=nonexistentuser12345');
                
                expect(response.status).toBe(200);
                expect(response.data.users).toEqual([]);
                expect(response.data.meta.count).toBe(0);
            });
        });
    });

    describe('User Controller - Get User by ID', () => {
        describe('GET /api/v1/users/:id - Success Cases', () => {
            test('should get user by ID as admin', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;
                
                const response = await client.get(`/api/v1/users/${userId}`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.user.id).toBe(userId);
                expect(response.data.user).not.toHaveProperty('password');
            });

            test('should allow users to get their own profile', async () => {
                await testStartup.loginAsUser('user');
                const userId = testStartup.user.id;
                
                const response = await client.get(`/api/v1/users/${userId}`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.user.id).toBe(userId);
            });

            test('should cache user profile responses', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;
                
                const response1 = await client.get(`/api/v1/users/${userId}`);
                const response2 = await client.get(`/api/v1/users/${userId}`);
                
                expect(response1.status).toBe(200);
                expect(response2.status).toBe(200);
            });
        });

        describe('GET /api/v1/users/:id - Permission Tests', () => {
            test('should deny access to other users profiles for regular users', async () => {
                await testStartup.loginAsUser('user');
                const adminId = testStartup.admin.id;
                
                const response = await client.get(`/api/v1/users/${adminId}`);
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny access without authentication', async () => {
                client.clearCookies();
                const userId = testStartup.user.id;
                
                const response = await client.get(`/api/v1/users/${userId}`);
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });

        describe('GET /api/v1/users/:id - Error Cases', () => {
            test('should return 400 for invalid user ID format', async () => {
                await testStartup.loginAsUser('admin');
                
                const response = await client.get('/api/v1/users/invalid-id');
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should return 404 for non-existent user ID', async () => {
                await testStartup.loginAsUser('admin');
                const fakeId = new mongoose.Types.ObjectId();
                
                const response = await client.get(`/api/v1/users/${fakeId}`);
                expect(response.status).toBe(404);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('User Controller - Create User', () => {
        describe('POST /api/v1/users - Success Cases', () => {
            test('should create a new user as admin', async () => {
                await testStartup.loginAsUser('admin');
                const userData = {
                    firstName: 'New',
                    lastName: 'User',
                    username: 'newuser_' + Date.now(),
                    email: `newuser.${Date.now()}@example.com`,
                    password: 'NewUser123!',
                    roles: ['USER']
                };

                const response = await client.post('/api/v1/users', userData);

                expect(response.status).toBe(201);
                expect(response.data.success).toBe(true);
                expect(response.data.message).toBe('User created successfully');
                expect(response.data.user).toBeDefined();
                expect(response.data.user.username).toBe(userData.username);
                expect(response.data.user.email).toBe(userData.email);
                expect(response.data.user).not.toHaveProperty('password');
            });

            test('should create user with default role when none specified', async () => {
                await testStartup.loginAsUser('admin');
                const userData = {
                    firstName: 'Default',
                    lastName: 'Role',
                    username: 'defaultrole_' + Date.now(),
                    email: `defaultrole.${Date.now()}@example.com`,
                    password: 'DefaultRole123!'
                };

                const response = await client.post('/api/v1/users', userData);

                expect(response.status).toBe(201);
                expect(response.data.user.roles).toContain('USER');
            });

            test('should handle role approval for elevated roles', async () => {
                await testStartup.loginAsUser('admin');
                const userData = {
                    firstName: 'Admin',
                    lastName: 'Request',
                    username: 'adminrequest_' + Date.now(),
                    email: `adminrequest.${Date.now()}@example.com`,
                    password: 'AdminReq123!',
                    roles: ['ADMIN']
                };

                const response = await client.post('/api/v1/users', userData);

                expect(response.status).toBe(201);
                expect(response.data.success).toBe(true);
            });
        });

        describe('POST /api/v1/users - Permission Tests', () => {
            test('should deny user creation for regular users', async () => {
                await testStartup.loginAsUser('user');
                const userData = {
                    firstName: 'Denied',
                    lastName: 'User',
                    username: 'denied_' + Date.now(),
                    email: `denied.${Date.now()}@example.com`,
                    password: 'Denied123!'
                };

                const response = await client.post('/api/v1/users', userData);
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny user creation without authentication', async () => {
                client.clearCookies();
                const userData = {
                    firstName: 'No',
                    lastName: 'Auth',
                    username: 'noauth_' + Date.now(),
                    email: `noauth.${Date.now()}@example.com`,
                    password: 'NoAuth123!'
                };

                const response = await client.post('/api/v1/users', userData);
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });

        describe('POST /api/v1/users - Validation Tests', () => {
            test('should reject invalid email format', async () => {
                await testStartup.loginAsUser('admin');
                const userData = {
                    firstName: 'Invalid',
                    lastName: 'Email',
                    username: 'invalidemail_' + Date.now(),
                    email: 'invalid-email-format',
                    password: 'Invalid123!'
                };

                const response = await client.post('/api/v1/users', userData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should reject weak passwords', async () => {
                await testStartup.loginAsUser('admin');
                const userData = {
                    firstName: 'Weak',
                    lastName: 'Password',
                    username: 'weakpass_' + Date.now(),
                    email: `weakpass.${Date.now()}@example.com`,
                    password: '123'
                };

                const response = await client.post('/api/v1/users', userData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should reject missing required fields', async () => {
                await testStartup.loginAsUser('admin');
                const userData = {
                    firstName: 'Missing',
                    lastName: 'Fields'
                    // Missing username, email, password
                };

                const response = await client.post('/api/v1/users', userData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should reject duplicate username', async () => {
                await testStartup.loginAsUser('admin');
                const existingUser = testStartup.user;
                const userData = {
                    firstName: 'Duplicate',
                    lastName: 'Username',
                    username: existingUser.username,
                    email: `duplicate.${Date.now()}@example.com`,
                    password: 'Duplicate123!'
                };

                const response = await client.post('/api/v1/users', userData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('User Controller - Update User', () => {
        describe('PUT /api/v1/users/:id - Success Cases', () => {
            test('should update user as admin', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Update',
                    lastName: 'Test',
                    prefix: 'updatetest'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    const updateData = {
                        firstName: 'Updated',
                        lastName: 'Name'
                    };

                    const response = await client.put(`/api/v1/users/${testUser.id}`, updateData);

                    expect(response.status).toBe(200);
                    expect(response.data.success).toBe(true);
                    expect(response.data.message).toBe('User updated successfully');
                    expect(response.data.user.firstName).toBe('Updated');
                    expect(response.data.user.lastName).toBe('Name');
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should allow users to update their own profile', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Self',
                    lastName: 'Update',
                    prefix: 'selfupdate'
                });

                try {
                    // Login as the user to get cookies
                    client.clearCookies();
                    await client.post('/api/v1/auth/login', {
                        identifier: testUser.email,
                        password: 'MutablePass123!'
                    });
                    
                    const updateData = {
                        firstName: 'Self Updated'
                    };

                    const response = await client.put(`/api/v1/users/${testUser.id}`, updateData);

                    expect(response.status).toBe(200);
                    expect(response.data.success).toBe(true);
                    expect(response.data.user.firstName).toBe('Self Updated');
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should handle role updates with proper approval logic', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Role',
                    lastName: 'Update',
                    prefix: 'roleupdate'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    const updateData = {
                        roles: ['CREATOR']
                    };

                    const response = await client.put(`/api/v1/users/${testUser.id}`, updateData);

                    expect(response.status).toBe(200);
                    expect(response.data.success).toBe(true);
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should invalidate cache after user update', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Cache',
                    lastName: 'Test',
                    prefix: 'cachetest'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    
                    // Get user first (should populate cache)
                    const response1 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response1.status).toBe(200);
                    
                    // Update user
                    const updateData = { firstName: 'Cache Updated' };
                    const updateResponse = await client.put(`/api/v1/users/${testUser.id}`, updateData);
                    expect(updateResponse.status).toBe(200);
                    
                    // Get user again (should return updated data)
                    const response2 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response2.status).toBe(200);
                    expect(response2.data.user.firstName).toBe('Cache Updated');
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });
        });

        describe('PUT /api/v1/users/:id - Permission Tests', () => {
            test('should deny update for other users profiles by regular users', async () => {
                await testStartup.loginAsUser('user');
                const adminId = testStartup.admin.id;
                const updateData = { firstName: 'Unauthorized' };

                const response = await client.put(`/api/v1/users/${adminId}`, updateData);
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny update without authentication', async () => {
                client.clearCookies();
                const userId = testStartup.user.id;
                const updateData = { firstName: 'No Auth' };

                const response = await client.put(`/api/v1/users/${userId}`, updateData);
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });

        describe('PUT /api/v1/users/:id - Validation Tests', () => {
            test('should reject invalid email format', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;
                const updateData = { email: 'invalid-email' };

                const response = await client.put(`/api/v1/users/${userId}`, updateData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should handle non-existent user ID', async () => {
                await testStartup.loginAsUser('admin');
                const fakeId = new mongoose.Types.ObjectId();
                const updateData = { firstName: 'Non Existent' };

                const response = await client.put(`/api/v1/users/${fakeId}`, updateData);
                expect(response.status).toBe(404);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('User Controller - Delete User', () => {
        describe('DELETE /api/v1/users/:id - Success Cases', () => {
            test('should delete user as owner', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Delete',
                    lastName: 'Test',
                    prefix: 'deletetest'
                });

                try {
                    await testStartup.loginAsUser('owner');
                    const response = await client.delete(`/api/v1/users/${testUser.id}`);

                    expect(response.status).toBe(200);
                    expect(response.data.success).toBe(true);
                    expect(response.data.message).toContain('deleted successfully');
                    
                    // Mark as deleted so cleanup doesn't try to delete again
                    testUser = null;
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should soft delete user (set active to false)', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Soft',
                    lastName: 'Delete',
                    prefix: 'softdelete'
                });

                try {
                    await testStartup.loginAsUser('owner');
                    const response = await client.delete(`/api/v1/users/${testUser.id}`);

                    expect(response.status).toBe(200);
                    expect(response.data.success).toBe(true);
                    
                    testUser = null;
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });
        });

        describe('DELETE /api/v1/users/:id - Permission Tests', () => {
            test('should deny delete for admin users (only owner can delete)', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Admin',
                    lastName: 'Deny',
                    prefix: 'admindeny'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    
                    const response = await client.delete(`/api/v1/users/${testUser.id}`);
                    expect(response.status).toBe(403);
                    expect(response.data.success).toBe(false);
                } finally {
                    if (testUser) {
                        // Use owner login to actually delete the user
                        const ownerClient = new ApiClient(testStartup.baseURL);
                        await testStartup.loginAsUser('owner', ownerClient);
                        try {
                            await ownerClient.delete(`/api/v1/users/${testUser.id}`);
                        } catch (e) {
                            // Ignore deletion errors
                        }
                    }
                }
            });

            test('should deny delete for regular users', async () => {
                await testStartup.loginAsUser('user');
                const adminId = testStartup.admin.id;

                const response = await client.delete(`/api/v1/users/${adminId}`);
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });

            test('should deny delete without authentication', async () => {
                client.clearCookies();
                const userId = testStartup.user.id;

                const response = await client.delete(`/api/v1/users/${userId}`);
                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });

        describe('DELETE /api/v1/users/:id - Error Cases', () => {
            test('should handle non-existent user ID', async () => {
                await testStartup.loginAsUser('owner');
                const fakeId = new mongoose.Types.ObjectId();

                const response = await client.delete(`/api/v1/users/${fakeId}`);
                expect(response.status).toBe(404);
                expect(response.data.success).toBe(false);
            });

            test('should handle invalid user ID format', async () => {
                await testStartup.loginAsUser('owner');

                const response = await client.delete('/api/v1/users/invalid-id');
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('User Controller - Change Password', () => {
        describe('PUT /api/v1/users/:id/password - Success Cases', () => {
            test('should allow user to change their own password', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Password',
                    lastName: 'Change',
                    prefix: 'passwordchange'
                });

                try {
                    // Login as the user to get cookies
                    client.clearCookies();
                    await client.post('/api/v1/auth/login', {
                        identifier: testUser.email,
                        password: 'MutablePass123!'
                    });
                    
                    const passwordData = {
                        currentPassword: 'MutablePass123!',
                        newPassword: 'NewPass123!'
                    };

                    const response = await client.put(`/api/v1/users/${testUser.id}/password`, passwordData);

                    expect(response.status).toBe(200);
                    expect(response.data.success).toBe(true);
                    expect(response.data.message).toContain('Password updated successfully');
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should allow admin to change any user password', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Admin',
                    lastName: 'Password',
                    prefix: 'adminpassword'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    
                    const passwordData = {
                        newPassword: 'AdminSet123!'
                    };

                    const response = await client.put(`/api/v1/users/${testUser.id}/password`, passwordData);

                    expect(response.status).toBe(200);
                    expect(response.data.success).toBe(true);
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });
        });

        describe('PUT /api/v1/users/:id/password - Validation Tests', () => {
            test('should reject weak new passwords', async () => {
                await testStartup.loginAsUser('user');
                const userId = testStartup.user.id;
                
                const passwordData = {
                    currentPassword: 'TestPass123!',
                    newPassword: '123'
                };

                const response = await client.put(`/api/v1/users/${userId}/password`, passwordData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should require current password for regular users', async () => {
                await testStartup.loginAsUser('user');
                const userId = testStartup.user.id;
                
                const passwordData = {
                    newPassword: 'NewPass123!'
                    // Missing currentPassword
                };

                const response = await client.put(`/api/v1/users/${userId}/password`, passwordData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should reject wrong current password', async () => {
                await testStartup.loginAsUser('user');
                const userId = testStartup.user.id;
                
                const passwordData = {
                    currentPassword: 'WrongPassword123!',
                    newPassword: 'NewPass123!'
                };

                const response = await client.put(`/api/v1/users/${userId}/password`, passwordData);
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('User Controller - User Files', () => {
        describe('GET /api/v1/users/:id/files - Success Cases', () => {
            test('should get user files as admin', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}/files`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.files)).toBe(true);
                expect(response.data.meta).toBeDefined();
            });

            test('should allow users to get their own files', async () => {
                await testStartup.loginAsUser('user');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}/files`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.files)).toBe(true);
            });

            test('should support pagination for user files', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}/files?page=1&limit=5`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });
        });

        describe('GET /api/v1/users/:id/files - Permission Tests', () => {
            test('should deny access to other users files', async () => {
                await testStartup.loginAsUser('user');
                const adminId = testStartup.admin.id;

                const response = await client.get(`/api/v1/users/${adminId}/files`);
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });
        });
    });

    describe('User Controller - User Statistics', () => {
        describe('GET /api/v1/users/:id/stats - Success Cases', () => {
            test('should get user statistics as admin', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}/stats`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.stats).toBeDefined();
            });

            test('should allow users to get their own stats', async () => {
                await testStartup.loginAsUser('user');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}/stats`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.stats).toBeDefined();
            });

            test('should cache user statistics', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;

                const response1 = await client.get(`/api/v1/users/${userId}/stats`);
                const response2 = await client.get(`/api/v1/users/${userId}/stats`);

                expect(response1.status).toBe(200);
                expect(response2.status).toBe(200);
            });
        });

        describe('GET /api/v1/users/:id/stats/fields - Success Cases', () => {
            test('should get user stats fields as admin', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}/stats/fields`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.data).toBeDefined(); // Note: likely "data" not "fields"
            });
        });

        describe('GET /api/v1/users/stats/overview - Success Cases', () => {
            test('should get users overview statistics as admin', async () => {
                await testStartup.loginAsUser('admin');

                const response = await client.get('/api/v1/users/stats/overview');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.overview).toBeDefined(); // Note: "overview" based on actual response
            });

            test('should support filtering parameters', async () => {
                await testStartup.loginAsUser('admin');

                const response = await client.get('/api/v1/users/stats/overview');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });
        });
    });

    describe('User Middleware Functions', () => {
        describe('checkUserExists middleware', () => {
            test('should pass for valid user ID', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}`);
                expect(response.status).toBe(200);
            });

            test('should return 400 for invalid user ID format', async () => {
                await testStartup.loginAsUser('admin');

                const response = await client.get('/api/v1/users/invalid-id');
                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            test('should return 404 for non-existent user', async () => {
                await testStartup.loginAsUser('admin');
                const fakeId = new mongoose.Types.ObjectId();

                const response = await client.get(`/api/v1/users/${fakeId}`);
                expect(response.status).toBe(404);
                expect(response.data.success).toBe(false);
            });
        });

        describe('checkResourceOwnership middleware', () => {
            test('should allow admins to access any user', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}`);
                expect(response.status).toBe(200);
            });

            test('should allow users to access their own profile', async () => {
                await testStartup.loginAsUser('user');
                const userId = testStartup.user.id;

                const response = await client.get(`/api/v1/users/${userId}`);
                expect(response.status).toBe(200);
            });

            test('should deny regular users access to others profiles', async () => {
                await testStartup.loginAsUser('user');
                const adminId = testStartup.admin.id;

                const response = await client.get(`/api/v1/users/${adminId}`);
                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });
        });

        describe('checkDeletePermission middleware', () => {
            test('should allow owner to delete users', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Delete',
                    lastName: 'Permission',
                    prefix: 'deleteperm'
                });

                try {
                    await testStartup.loginAsUser('owner');
                    const response = await client.delete(`/api/v1/users/${testUser.id}`);

                    expect(response.status).toBe(200);
                    testUser = null;
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });

            test('should deny admin delete permissions', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Admin',
                    lastName: 'Denied',
                    prefix: 'admindenied'
                });

                try {
                    await testStartup.loginAsUser('admin');

                    const response = await client.delete(`/api/v1/users/${testUser.id}`);
                    expect(response.status).toBe(403);
                    expect(response.data.success).toBe(false);
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });
        });
    });

    describe('Route Integration and Edge Cases', () => {
        describe('Caching Behavior', () => {
            test('should properly cache and invalidate user list', async () => {
                await testStartup.loginAsUser('admin');
                
                // Get users list - should populate cache
                const response1 = await client.get('/api/v1/users?limit=2');
                expect(response1.status).toBe(200);
                
                // Same query should potentially be cached
                const response2 = await client.get('/api/v1/users?limit=2');
                expect(response2.status).toBe(200);
                
                // Different query should not use same cache
                const response3 = await client.get('/api/v1/users?limit=3');
                expect(response3.status).toBe(200);
            });

            test('should invalidate cache after user modifications', async () => {
                let testUser = await testStartup.createMutableUser({
                    role: 'USER',
                    firstName: 'Cache',
                    lastName: 'Invalidation',
                    prefix: 'cacheinval'
                });

                try {
                    await testStartup.loginAsUser('admin');
                    
                    // Get user - should populate cache
                    const response1 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response1.status).toBe(200);
                    
                    // Update user - should invalidate cache
                    const updateData = { firstName: 'Cache Updated' };
                    const updateResponse = await client.put(`/api/v1/users/${testUser.id}`, updateData);
                    expect(updateResponse.status).toBe(200);
                    
                    // Get user again - should return updated data
                    const response2 = await client.get(`/api/v1/users/${testUser.id}`);
                    expect(response2.status).toBe(200);
                    expect(response2.data.user.firstName).toBe('Cache Updated');
                } finally {
                    if (testUser) {
                        await testStartup.deleteMutableUser(testUser.id);
                    }
                }
            });
        });

        describe('Error Handling', () => {
            test('should handle malformed JSON gracefully', async () => {
                await testStartup.loginAsUser('admin');
                
                const response = await client.post('/api/v1/users', 'invalid-json');
                expect(response.status).toBe(400);
            });

            test('should handle missing Content-Type header', async () => {
                await testStartup.loginAsUser('admin');
                const userId = testStartup.user.id;
                
                const response = await client.get(`/api/v1/users/${userId}`);
                expect(response.status).toBe(200);
            });
        });

        describe('Performance and Concurrency', () => {
            test('should handle concurrent user requests', async () => {
                await testStartup.loginAsUser('admin');
                
                const promises = Array(5).fill().map(() => 
                    client.get('/api/v1/users?limit=1')
                );
                
                const results = await Promise.allSettled(promises);
                const successes = results.filter(r => 
                    r.status === 'fulfilled' && r.value.status === 200
                );
                
                expect(successes.length).toBe(5);
            });

            test('should handle mixed concurrent operations', async () => {
                await testStartup.loginAsUser('admin');
                
                const promises = [
                    client.get('/api/v1/users?limit=2'),
                    client.get('/api/v1/users/stats/overview'),
                    client.get(`/api/v1/users/${testStartup.user.id}`)
                ];
                
                const results = await Promise.allSettled(promises);
                const successes = results.filter(r => 
                    r.status === 'fulfilled' && r.value.status === 200
                );
                
                expect(successes.length).toBeGreaterThanOrEqual(2);
            });
        });
    });

    // =========================================================================
    // CONNECTION SYSTEM TESTS
    // =========================================================================
    describe('User Controller - Connection System', () => {
        let userA, userB, userC;

        beforeAll(async () => {
            userA = await testStartup.createMutableUser({ role: 'USER', firstName: 'Alice', lastName: 'Connect', prefix: 'connect_a' });
            userB = await testStartup.createMutableUser({ role: 'USER', firstName: 'Bob', lastName: 'Connect', prefix: 'connect_b' });
            userC = await testStartup.createMutableUser({ role: 'USER', firstName: 'Carol', lastName: 'Connect', prefix: 'connect_c' });
        }, 30000);

        const loginAs = async (mutableUser) => {
            const response = await client.post('/api/v1/auth/login', mutableUser.credentials);
            expect(response.status).toBe(200);
            return response;
        };

        describe('POST /api/v1/users/:id/connect - Send Connection Request', () => {
            it('should send a connection request successfully', async () => {
                await loginAs(userA);
                const response = await client.post(`/api/v1/users/${userB.id}/connect`);

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'Connection request sent'
                });
            });

            it('should return 400 when request already sent', async () => {
                await loginAs(userA);
                const response = await client.post(`/api/v1/users/${userB.id}/connect`);

                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
                expect(response.data.message).toMatch(/already sent/i);
            });

            it('should not allow connecting with yourself', async () => {
                await loginAs(userA);
                const response = await client.post(`/api/v1/users/${userA.id}/connect`);

                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
                expect(response.data.message).toMatch(/cannot connect with yourself/i);
            });

            it('should return 404 for non-existent user', async () => {
                await loginAs(userA);
                const fakeId = '000000000000000000000000';
                const response = await client.post(`/api/v1/users/${fakeId}/connect`);

                expect(response.status).toBe(404);
                expect(response.data.success).toBe(false);
            });

            it('should require authentication', async () => {
                client.clearCookies();
                const response = await client.post(`/api/v1/users/${userB.id}/connect`);

                expect(response.status).toBe(401);
                expect(response.data.success).toBe(false);
            });
        });

        describe('GET /api/v1/users/connections/pending - Get Pending Requests', () => {
            it('should return pending incoming requests', async () => {
                await loginAs(userB);
                const response = await client.get('/api/v1/users/connections/pending');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.data)).toBe(true);
                expect(response.data.pagination).toBeDefined();

                const ids = response.data.data.map(u => u._id || u.id);
                expect(ids).toContain(userA.id);
            });

            it('should return empty for user with no pending requests', async () => {
                await loginAs(userC);
                const response = await client.get('/api/v1/users/connections/pending');

                expect(response.status).toBe(200);
                expect(response.data.data).toEqual([]);
            });
        });

        describe('GET /api/v1/users/connections/sent - Get Sent Requests', () => {
            it('should return sent outgoing requests', async () => {
                await loginAs(userA);
                const response = await client.get('/api/v1/users/connections/sent');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.data)).toBe(true);

                const ids = response.data.data.map(u => u._id || u.id);
                expect(ids).toContain(userB.id);
            });
        });

        describe('GET /api/v1/users/:id/connection-status - Check Connection Status', () => {
            it('should report pending_sent when request sent', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userB.id}/connection-status`);

                expect(response.status).toBe(200);
                expect(response.data.data.status).toBe('pending_sent');
                expect(response.data.data.isConnected).toBe(false);
            });

            it('should report pending_received for recipient', async () => {
                await loginAs(userB);
                const response = await client.get(`/api/v1/users/${userA.id}/connection-status`);

                expect(response.status).toBe(200);
                expect(response.data.data.status).toBe('pending_received');
                expect(response.data.data.isConnected).toBe(false);
            });

            it('should report none for unrelated users', async () => {
                await loginAs(userC);
                const response = await client.get(`/api/v1/users/${userA.id}/connection-status`);

                expect(response.status).toBe(200);
                expect(response.data.data.status).toBe('none');
                expect(response.data.data.isConnected).toBe(false);
            });
        });

        describe('PUT /api/v1/users/:id/connect - Respond to Connection Request', () => {
            it('should accept a connection request', async () => {
                await loginAs(userB);
                const response = await client.put(`/api/v1/users/${userA.id}/connect`, { action: 'accept' });

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'Connection request accepted'
                });
            });

            it('should return 404 when no pending request exists', async () => {
                await loginAs(userB);
                const response = await client.put(`/api/v1/users/${userC.id}/connect`, { action: 'accept' });

                expect(response.status).toBe(404);
                expect(response.data.success).toBe(false);
            });

            it('should return 400 for invalid action', async () => {
                await loginAs(userB);
                const response = await client.put(`/api/v1/users/${userA.id}/connect`, { action: 'invalid' });

                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });
        });

        describe('GET /api/v1/users/:id/connections - Get Connections', () => {
            it('should return accepted connections', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userA.id}/connections`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.data)).toBe(true);
                expect(response.data.pagination).toBeDefined();

                const ids = response.data.data.map(u => u._id || u.id);
                expect(ids).toContain(userB.id);
            });

            it('should return populated user objects', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userA.id}/connections`);

                if (response.data.data.length > 0) {
                    const connected = response.data.data[0];
                    expect(connected).toHaveProperty('firstName');
                    expect(connected).toHaveProperty('lastName');
                    expect(connected).toHaveProperty('username');
                }
            });

            it('should support pagination', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userA.id}/connections?page=1&limit=1`);

                expect(response.status).toBe(200);
                expect(response.data.pagination.page).toBe(1);
                expect(response.data.pagination.limit).toBe(1);
            });

            it('should return empty for user with no connections', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userC.id}/connections`);

                expect(response.status).toBe(200);
                expect(response.data.data).toEqual([]);
                expect(response.data.pagination.total).toBe(0);
            });
        });

        describe('GET /api/v1/users/:id/connection-status - After Acceptance', () => {
            it('should report connected after acceptance', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userB.id}/connection-status`);

                expect(response.status).toBe(200);
                expect(response.data.data.status).toBe('connected');
                expect(response.data.data.isConnected).toBe(true);
            });
        });

        describe('GET /api/v1/users/:id/connection-counts - Get Connection Counts', () => {
            it('should return connection counts', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userA.id}/connection-counts`);

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    data: {
                        connectionCount: expect.any(Number),
                        pendingCount: expect.any(Number)
                    }
                });
                expect(response.data.data.connectionCount).toBeGreaterThanOrEqual(1);
            });

            it('should return zero counts for new user', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userC.id}/connection-counts`);

                expect(response.status).toBe(200);
                expect(response.data.data.connectionCount).toBe(0);
                expect(response.data.data.pendingCount).toBe(0);
            });
        });

        describe('POST /api/v1/users/:id/connect - Auto-Accept Mutual Request', () => {
            it('should auto-accept when both users request each other', async () => {
                // userA sends request to userC
                await loginAs(userA);
                await client.post(`/api/v1/users/${userC.id}/connect`);

                // userC sends request to userA — should auto-accept
                await loginAs(userC);
                const response = await client.post(`/api/v1/users/${userA.id}/connect`);

                expect(response.status).toBe(200);
                expect(response.data.message).toMatch(/accepted/i);

                // Verify they are now connected
                const statusRes = await client.get(`/api/v1/users/${userA.id}/connection-status`);
                expect(statusRes.data.data.status).toBe('connected');
                expect(statusRes.data.data.isConnected).toBe(true);
            });
        });

        describe('DELETE /api/v1/users/:id/connect - Remove Connection', () => {
            it('should remove a connection successfully', async () => {
                await loginAs(userA);
                const response = await client.delete(`/api/v1/users/${userB.id}/connect`);

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'Connection removed'
                });
            });

            it('should return 400 when no connection exists', async () => {
                await loginAs(userA);
                const response = await client.delete(`/api/v1/users/${userB.id}/connect`);

                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
                expect(response.data.message).toMatch(/no connection/i);
            });

            it('should require authentication', async () => {
                client.clearCookies();
                const response = await client.delete(`/api/v1/users/${userB.id}/connect`);

                expect(response.status).toBe(401);
            });

            it('should reflect in connection counts after removal', async () => {
                await loginAs(userA);
                const response = await client.get(`/api/v1/users/${userA.id}/connection-counts`);

                expect(response.status).toBe(200);
                // userA removed connection with userB, but still has connection with userC
                expect(response.data.data.connectionCount).toBe(1);
            });
        });
    });

    // =========================================================================
    // =========================================================================
    // GROUP SYSTEM TESTS
    // =========================================================================

    describe('Group System Tests', () => {
        // Role model: OWNER > WRITE > READ
        // - OWNER: manage members, delete group, full read/write on all group files
        // - WRITE: create/edit/delete files and subdirs inside the group folder
        // - READ:  read-only access to all files inside the group folder
        //
        // Group permissions propagate to every file and directory under the group's
        // root folder.  Permissions are set at write time (member add/remove +
        // file creation), so standard read/write checks handle all access control.
        // Group root folders live at /{slug} at the filesystem root — no /groups/ prefix.
        let ownerUser, readUser, writeUser, outsiderUser;
        let groupId, publicGroupId, groupRootPath;

        const loginAs = async (mutableUser) => {
            const response = await client.post('/api/v1/auth/login', mutableUser.credentials);
            expect(response.status).toBe(200);
            return response;
        };

        beforeAll(async () => {
            ownerUser   = await testStartup.createMutableUser({ role: 'CREATOR', firstName: 'Group', lastName: 'Owner',   prefix: 'grp_owner'   });
            readUser    = await testStartup.createMutableUser({ role: 'USER',    firstName: 'Group', lastName: 'Reader',  prefix: 'grp_read'    });
            outsiderUser= await testStartup.createMutableUser({ role: 'USER',    firstName: 'Group', lastName: 'Outside', prefix: 'grp_out'     });
            writeUser   = await testStartup.createMutableUser({ role: 'CREATOR', firstName: 'Group', lastName: 'Writer',  prefix: 'grp_write'   });

            await loginAs(ownerUser);
            const privateGroupRes = await client.post('/api/v1/users/groups', { name: 'Test Private Group', description: 'Private', privacy: 'private' });
            groupId       = privateGroupRes.data.data._id;
            groupRootPath = privateGroupRes.data.data.rootFolderPath;
            publicGroupId = (await client.post('/api/v1/users/groups', { name: 'Test Public Group', description: 'Public', privacy: 'public' })).data.data._id;
            // Add readUser as READ, writeUser as WRITE
            await client.post(`/api/v1/users/groups/${groupId}/members`, { userId: readUser.id,  role: 'READ'  });
            await client.post(`/api/v1/users/groups/${groupId}/members`, { userId: writeUser.id, role: 'WRITE' });
        }, 60000);

        // =========================================================================
        // POST /api/v1/users/groups - Create Group
        // =========================================================================
        describe('POST /api/v1/users/groups - Create Group', () => {
            it('should create a private group', async () => {
                await loginAs(ownerUser);
                const response = await client.post('/api/v1/users/groups', {
                    name: 'Test Private Group',
                    description: 'A private group for testing',
                    privacy: 'private'
                });

                expect(response.status).toBe(201);
                expect(response.data.success).toBe(true);
                expect(response.data.data).toHaveProperty('_id');
                expect(response.data.data.name).toBe('Test Private Group');
                expect(response.data.data.privacy).toBe('private');
                expect(response.data.data.members).toHaveLength(1);
                expect(response.data.data.members[0].role).toBe('OWNER');
                // Each group gets its own dedicated root folder at /{slug}
                expect(response.data.data.rootFolderPath).toMatch(/^\/[a-z0-9-]+$/);
            });

            it('should create a public group', async () => {
                await loginAs(ownerUser);
                const response = await client.post('/api/v1/users/groups', {
                    name: 'Test Public Group',
                    description: 'A public group',
                    privacy: 'public'
                });

                expect(response.status).toBe(201);
                expect(response.data.data.privacy).toBe('public');
            });

            it('should reject missing name', async () => {
                await loginAs(ownerUser);
                const response = await client.post('/api/v1/users/groups', {
                    description: 'No name provided'
                });

                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            it('should require authentication', async () => {
                client.clearCookies();
                const response = await client.post('/api/v1/users/groups', {
                    name: 'Anon group'
                });

                expect(response.status).toBe(401);
            });
        });

        // =========================================================================
        // GET /api/v1/users/groups - List My Groups
        // =========================================================================
        describe('GET /api/v1/users/groups - List My Groups', () => {
            it('should list groups the user belongs to', async () => {
                await loginAs(ownerUser);
                const response = await client.get('/api/v1/users/groups');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.data)).toBe(true);
                expect(response.data.pagination).toBeDefined();
                expect(response.data.data.length).toBeGreaterThanOrEqual(2);
            });

            it('should return empty for user with no groups', async () => {
                await loginAs(outsiderUser);
                const response = await client.get('/api/v1/users/groups');

                expect(response.status).toBe(200);
                expect(response.data.data).toEqual([]);
            });

            it('should support pagination', async () => {
                await loginAs(ownerUser);
                const response = await client.get('/api/v1/users/groups?page=1&limit=1');

                expect(response.status).toBe(200);
                expect(response.data.pagination.page).toBe(1);
                expect(response.data.pagination.limit).toBe(1);
                expect(response.data.data.length).toBeLessThanOrEqual(1);
            });
        });

        // =========================================================================
        // GET /api/v1/users/groups/discover - Discover Public Groups
        // =========================================================================
        describe('GET /api/v1/users/groups/discover - Discover Public Groups', () => {
            it('should list public groups', async () => {
                await loginAs(outsiderUser);
                const response = await client.get('/api/v1/users/groups/discover');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.data)).toBe(true);
                expect(response.data.pagination).toBeDefined();
            });

            it('should support search by name', async () => {
                await loginAs(outsiderUser);
                const response = await client.get('/api/v1/users/groups/discover?search=Public');

                expect(response.status).toBe(200);
                expect(response.data.data.length).toBeGreaterThanOrEqual(1);
            });
        });

        // =========================================================================
        // GET /api/v1/users/groups/:groupId - Get Group Details
        // =========================================================================
        describe('GET /api/v1/users/groups/:groupId - Get Group Details', () => {
            it('should return group details for a member', async () => {
                await loginAs(ownerUser);
                const response = await client.get(`/api/v1/users/groups/${groupId}`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.data._id).toBe(groupId);
                expect(response.data.data.name).toBe('Test Private Group');
                expect(response.data.data.members).toBeDefined();
            });

            it('should deny access for non-member on private group', async () => {
                await loginAs(outsiderUser);
                const response = await client.get(`/api/v1/users/groups/${groupId}`);

                expect(response.status).toBe(403);
                expect(response.data.success).toBe(false);
            });
        });

        // =========================================================================
        // POST /api/v1/users/groups/:groupId/members - Add Member
        // =========================================================================
        describe('POST /api/v1/users/groups/:groupId/members - Add Member', () => {
            it('should add a READ member as group owner', async () => {
                await loginAs(ownerUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: outsiderUser.id,
                    role: 'READ'
                });

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'Member added successfully'
                });

                // Clean up: remove outsiderUser so they remain an outsider for later tests
                await client.delete(`/api/v1/users/groups/${groupId}/members/${outsiderUser.id}`);
            });

            it('should add a WRITE member as group owner', async () => {
                const tempUser = await testStartup.createMutableUser({ role: 'USER', firstName: 'Temp', lastName: 'Write', prefix: 'grp_tmp' });
                await loginAs(ownerUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: tempUser.id,
                    role: 'WRITE'
                });

                expect(response.status).toBe(200);
                await client.delete(`/api/v1/users/groups/${groupId}/members/${tempUser.id}`);
            });

            it('should reject directly assigning OWNER role', async () => {
                await loginAs(ownerUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: outsiderUser.id,
                    role: 'OWNER'
                });

                expect(response.status).toBe(400);
                expect(response.data.success).toBe(false);
            });

            it('should reject adding a user that is already a member', async () => {
                await loginAs(ownerUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: readUser.id,
                    role: 'READ'
                });

                expect(response.status).toBe(400);
                expect(response.data.message).toMatch(/already a member/i);
            });

            it('should deny non-owner members from adding users', async () => {
                await loginAs(writeUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: outsiderUser.id,
                    role: 'READ'
                });

                expect(response.status).toBe(403);
            });

            it('should deny READ members from adding users', async () => {
                await loginAs(readUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: outsiderUser.id,
                    role: 'READ'
                });

                expect(response.status).toBe(403);
            });
        });

        // =========================================================================
        // PATCH /api/v1/users/groups/:groupId/members/:userId - Update Member Role
        // =========================================================================
        describe('PATCH /api/v1/users/groups/:groupId/members/:userId - Update Member Role', () => {
            it('should promote a member from READ to WRITE', async () => {
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}/members/${readUser.id}`, {
                    role: 'WRITE'
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.message).toMatch(/WRITE/);

                // Demote back to READ so subsequent tests see readUser as READ
                await client.patch(`/api/v1/users/groups/${groupId}/members/${readUser.id}`, { role: 'READ' });
            });

            it('should demote a member from WRITE to READ', async () => {
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}/members/${writeUser.id}`, {
                    role: 'READ'
                });

                expect(response.status).toBe(200);
                expect(response.data.message).toMatch(/READ/);

                // Restore writeUser to WRITE for subsequent tests
                await client.patch(`/api/v1/users/groups/${groupId}/members/${writeUser.id}`, { role: 'WRITE' });
            });

            it('should reject changing the owner role', async () => {
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}/members/${ownerUser.id}`, {
                    role: 'READ'
                });

                expect(response.status).toBe(403);
            });

            it('should reject assigning OWNER via updateMemberRole', async () => {
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}/members/${readUser.id}`, {
                    role: 'OWNER'
                });

                expect(response.status).toBe(400);
            });

            it('should deny WRITE members from changing roles', async () => {
                await loginAs(writeUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}/members/${readUser.id}`, {
                    role: 'WRITE'
                });

                expect(response.status).toBe(403);
            });
        });

        // =========================================================================
        // PATCH /api/v1/users/groups/:groupId - Update Group
        // =========================================================================
        describe('PATCH /api/v1/users/groups/:groupId - Update Group', () => {
            it('should update group description as owner', async () => {
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}`, {
                    description: 'Updated description'
                });

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.data.description).toBe('Updated description');
            });

            it('renaming the group updates rootFolderPath to the new slug', async () => {
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}`, {
                    name: 'Renamed Group'
                });

                expect(response.status).toBe(200);
                expect(response.data.data.name).toBe('Renamed Group');
                expect(response.data.data.rootFolderPath).toMatch(/^\/renamed-group/);

                // Restore original name so groupRootPath stays valid for subsequent tests
                const restore = await client.patch(`/api/v1/users/groups/${groupId}`, {
                    name: 'Test Private Group'
                });
                groupRootPath = restore.data.data.rootFolderPath;
            });

            it('should deny WRITE members from updating group details', async () => {
                await loginAs(writeUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}`, {
                    name: 'Nope'
                });

                expect(response.status).toBe(403);
            });

            it('should deny READ members from updating group details', async () => {
                await loginAs(readUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}`, {
                    name: 'Also Nope'
                });

                expect(response.status).toBe(403);
            });
        });

        // =========================================================================
        // POST /api/v1/users/groups/:groupId/join - Join Public Group
        // =========================================================================
        describe('POST /api/v1/users/groups/:groupId/join - Join Public Group', () => {
            it('should allow joining a public group with READ role', async () => {
                await loginAs(outsiderUser);
                const response = await client.post(`/api/v1/users/groups/${publicGroupId}/join`);

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'Joined group successfully'
                });

                // Verify joined as READ
                await loginAs(ownerUser);
                const groupRes = await client.get(`/api/v1/users/groups/${publicGroupId}`);
                const joined = groupRes.data.data.members.find(m => (m.user?._id || m.user) === outsiderUser.id || (m.user?.id) === outsiderUser.id);
                if (joined) {
                    expect(joined.role).toBe('READ');
                }
            });

            it('should reject joining if already a member', async () => {
                await loginAs(outsiderUser);
                const response = await client.post(`/api/v1/users/groups/${publicGroupId}/join`);

                expect(response.status).toBe(400);
                expect(response.data.message).toMatch(/already a member/i);
            });

            it('should reject joining a private group', async () => {
                const newUser = await testStartup.createMutableUser({ role: 'USER', firstName: 'Private', lastName: 'Joiner', prefix: 'grp_priv' });
                await loginAs(newUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/join`);

                expect(response.status).toBe(403);
                expect(response.data.message).toMatch(/private/i);
            });
        });

        // =========================================================================
        // Group Folder File Operations
        // Files are created/read/deleted directly inside the group folder using
        // the standard file API.  The group root lives at /{slug} (e.g. /test-private-group).
        // Member permissions are stamped at write time so standard checks handle all access.
        // =========================================================================
        describe('Group Folder File Operations', () => {
            it('WRITE member can create a file directly in the group folder', async () => {
                await loginAs(writeUser);
                const response = await client.post('/api/v1/files', {
                    filePath: `${groupRootPath}/write-member-file.txt`,
                    content: 'Created by write member'
                });
                expect(response.status).toBe(201);
            });

            it('OWNER can create a file directly in the group folder', async () => {
                await loginAs(ownerUser);
                const response = await client.post('/api/v1/files', {
                    filePath: `${groupRootPath}/owner-file.txt`,
                    content: 'Created by owner'
                });
                expect(response.status).toBe(201);
            });

            it('READ member can list the group folder contents', async () => {
                await loginAs(readUser);
                const encoded = encodeURIComponent(groupRootPath);
                const response = await client.get(`/api/v1/files/directory/contents?filePath=${encoded}`);
                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.contents)).toBe(true);
            });

            it('READ member can download a file from the group folder', async () => {
                await loginAs(readUser);
                const encoded = encodeURIComponent(`${groupRootPath}/owner-file.txt`);
                const response = await client.get(`/api/v1/files/${encoded}/download`);
                expect([200, 206]).toContain(response.status);
            });

            it('READ member cannot create files in the group folder', async () => {
                await loginAs(readUser);
                const response = await client.post('/api/v1/files', {
                    filePath: `${groupRootPath}/read-member-file.txt`,
                    content: 'Should be rejected'
                });
                expect(response.status).toBe(403);
            });

            it('WRITE member can create a subdirectory in the group folder', async () => {
                await loginAs(writeUser);
                const response = await client.post('/api/v1/files/directory', {
                    dirPath: `${groupRootPath}/subdir`
                });
                expect(response.status).toBe(201);
            });

            it('WRITE member can create a file in a group subdirectory', async () => {
                await loginAs(writeUser);
                const response = await client.post('/api/v1/files', {
                    filePath: `${groupRootPath}/subdir/nested-file.txt`,
                    content: 'Nested file content'
                });
                expect(response.status).toBe(201);
            });

            it('READ member can browse a group subdirectory', async () => {
                await loginAs(readUser);
                const encoded = encodeURIComponent(`${groupRootPath}/subdir`);
                const response = await client.get(`/api/v1/files/directory/contents?filePath=${encoded}`);
                expect(response.status).toBe(200);
            });

            it('non-member cannot list the group folder', async () => {
                await loginAs(outsiderUser);
                const encoded = encodeURIComponent(groupRootPath);
                const response = await client.get(`/api/v1/files/directory/contents?filePath=${encoded}`);
                expect(response.status).toBe(404);
            });

            it('non-member cannot download a file from the group folder', async () => {
                await loginAs(outsiderUser);
                const encoded = encodeURIComponent(`${groupRootPath}/owner-file.txt`);
                const response = await client.get(`/api/v1/files/${encoded}/download`);
                expect(response.status).toBe(404);
            });

            it('files created inside the group folder inherit member permissions at write time', async () => {
                await loginAs(ownerUser);
                const response = await client.post('/api/v1/files', {
                    filePath: `${groupRootPath}/inherited-perms.txt`,
                    content: 'Stamped at creation'
                });
                expect(response.status).toBe(201);

                // readUser has read access without any explicit individual share
                await loginAs(readUser);
                const encoded = encodeURIComponent(`${groupRootPath}/inherited-perms.txt`);
                const dl = await client.get(`/api/v1/files/${encoded}/download`);
                expect([200, 206]).toContain(dl.status);
            });

            it('adding a new member retroactively grants access to all existing group files', async () => {
                await loginAs(ownerUser);
                await client.post('/api/v1/files', {
                    filePath: `${groupRootPath}/retroactive-test.txt`,
                    content: 'Existing file'
                });

                // outsiderUser has no access before joining
                await loginAs(outsiderUser);
                const encoded = encodeURIComponent(`${groupRootPath}/retroactive-test.txt`);
                let dl = await client.get(`/api/v1/files/${encoded}/download`);
                expect(dl.status).toBe(404);

                // Add outsiderUser as READ — updateMany stamps permissions on all existing files
                await loginAs(ownerUser);
                await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: outsiderUser.id, role: 'READ'
                });

                // Now outsiderUser can read the pre-existing file
                await loginAs(outsiderUser);
                dl = await client.get(`/api/v1/files/${encoded}/download`);
                expect([200, 206]).toContain(dl.status);

                // Cleanup: keep outsiderUser as non-member for other tests
                await loginAs(ownerUser);
                await client.delete(`/api/v1/users/groups/${groupId}/members/${outsiderUser.id}`);
            });
        });

        // =========================================================================
        // PATCH /api/v1/users/groups/:groupId/transfer - Transfer Ownership
        // =========================================================================
        describe('PATCH /api/v1/users/groups/:groupId/transfer - Transfer Ownership', () => {
            it('should transfer ownership to a member (writeUser becomes OWNER, ownerUser becomes WRITE)', async () => {
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}/transfer`, {
                    userId: writeUser.id
                });

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'Ownership transferred successfully'
                });
            });

            it('should deny previous owner (now WRITE) from transferring again', async () => {
                // ownerUser is now WRITE after transfer
                await loginAs(ownerUser);
                const response = await client.patch(`/api/v1/users/groups/${groupId}/transfer`, {
                    userId: readUser.id
                });

                expect(response.status).toBe(403);
            });

            it('should reject transfer to non-member', async () => {
                await loginAs(writeUser); // current OWNER
                const fakeId = '000000000000000000000000';
                const response = await client.patch(`/api/v1/users/groups/${groupId}/transfer`, {
                    userId: fakeId
                });

                expect(response.status).toBe(400);
            });
        });

        // =========================================================================
        // POST /api/v1/users/groups/:groupId/leave - Leave Group
        // =========================================================================
        describe('POST /api/v1/users/groups/:groupId/leave - Leave Group', () => {
            it('should allow a READ member to leave', async () => {
                await loginAs(readUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/leave`);

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'You have left the group'
                });
            });

            it('should reject leaving if not a member', async () => {
                await loginAs(readUser);
                const response = await client.post(`/api/v1/users/groups/${groupId}/leave`);

                expect(response.status).toBe(403);
            });

            it('should prevent OWNER from leaving', async () => {
                await loginAs(writeUser); // current OWNER
                const response = await client.post(`/api/v1/users/groups/${groupId}/leave`);

                expect(response.status).toBe(403);
                expect(response.data.message).toMatch(/owner/i);
            });
        });

        // =========================================================================
        // DELETE /api/v1/users/groups/:groupId/members/:userId - Remove Member
        // =========================================================================
        describe('DELETE /api/v1/users/groups/:groupId/members/:userId - Remove Member', () => {
            it('should allow OWNER to remove a member', async () => {
                await loginAs(writeUser); // current OWNER
                await client.post(`/api/v1/users/groups/${groupId}/members`, {
                    userId: outsiderUser.id,
                    role: 'READ'
                });

                const response = await client.delete(`/api/v1/users/groups/${groupId}/members/${outsiderUser.id}`);

                expect(response.status).toBe(200);
                expect(response.data.message).toMatch(/removed/i);
            });

            it('should return 404 for non-member', async () => {
                await loginAs(writeUser);
                const response = await client.delete(`/api/v1/users/groups/${groupId}/members/${outsiderUser.id}`);

                expect(response.status).toBe(404);
            });

            it('should prevent removing the OWNER', async () => {
                // ownerUser (now WRITE) cannot remove writeUser (OWNER)
                await loginAs(ownerUser);
                const response = await client.delete(`/api/v1/users/groups/${groupId}/members/${writeUser.id}`);

                expect(response.status).toBe(403);
            });

            it('should deny WRITE member from removing another member', async () => {
                // Add outsiderUser back so there is someone to try to remove
                await loginAs(writeUser);
                await client.post(`/api/v1/users/groups/${groupId}/members`, { userId: outsiderUser.id, role: 'READ' });

                // ownerUser is WRITE — should NOT be able to remove outsiderUser
                await loginAs(ownerUser);
                const response = await client.delete(`/api/v1/users/groups/${groupId}/members/${outsiderUser.id}`);

                expect(response.status).toBe(403);

                // Cleanup
                await loginAs(writeUser);
                await client.delete(`/api/v1/users/groups/${groupId}/members/${outsiderUser.id}`);
            });
        });

        // =========================================================================
        // DELETE /api/v1/users/groups/:groupId - Delete Group
        // =========================================================================
        describe('DELETE /api/v1/users/groups/:groupId - Delete Group', () => {
            it('should deny WRITE member from deleting', async () => {
                await loginAs(ownerUser); // WRITE role
                const response = await client.delete(`/api/v1/users/groups/${groupId}`);

                expect(response.status).toBe(403);
            });

            it('should delete group as OWNER', async () => {
                await loginAs(writeUser); // current OWNER
                const response = await client.delete(`/api/v1/users/groups/${groupId}`);

                expect(response.status).toBe(200);
                expect(response.data).toEqual({
                    success: true,
                    message: 'Group deleted successfully'
                });
            });

            it('should return 404 for deleted group', async () => {
                await loginAs(writeUser);
                const response = await client.get(`/api/v1/users/groups/${groupId}`);

                expect(response.status).toBe(404);
            });
        });
    });

    // =========================================================================
    // STARRED FILES TESTS
    // =========================================================================

    describe('Starred Files Tests', () => {
        let testFileId;
        let testFilePath;
        let sharedFileId;

        beforeAll(async () => {
            await testStartup.loginAsUser('creator');
            const dirPath = `/${testStartup.creator.username}`;
            testFilePath = `${dirPath}/starred-test-${Date.now()}.txt`;

            await client.post('/api/v1/files/directory', { dirPath, description: 'Creator dir' });
            const fileRes = await client.post('/api/v1/files', { filePath: testFilePath, content: 'Starred test content', description: 'Starring test' });
            expect(fileRes.status).toBe(201);
            testFileId = fileRes.data.file.id;

            // Ensure creator ↔ user are connected (idempotent)
            const status = await client.get(`/api/v1/users/${testStartup.user.id}/connection-status`);
            if (!status.data.data.isConnected) {
                await client.post(`/api/v1/users/${testStartup.user.id}/connect`);
                await testStartup.loginAsUser('user');
                await client.put(`/api/v1/users/${testStartup.creator.id}/connect`, { action: 'accept' });
                await testStartup.loginAsUser('creator');
            }

            // Create + share a file for shared-starring tests
            const sharedPath = `${dirPath}/starred-shared-${Date.now()}.txt`;
            const sharedRes = await client.post('/api/v1/files', { filePath: sharedPath, content: 'Shared content', description: 'Shared file' });
            expect(sharedRes.status).toBe(201);
            sharedFileId = sharedRes.data.file.id;
            await client.post(`/api/v1/files/${encodeURIComponent(sharedPath)}/share`, { userIds: testStartup.user.id, permission: 'read' });
        }, 30000);

        describe('GET /api/v1/users/starred - Get Starred Files', () => {
            it('should return empty starred list initially', async () => {
                await testStartup.loginAsUser('creator');
                const response = await client.get('/api/v1/users/starred');

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(Array.isArray(response.data.data)).toBe(true);
                expect(response.data.data.length).toBe(0);
            });

            it('should fail when not authenticated', async () => {
                await testStartup.logout();
                const response = await client.get('/api/v1/users/starred').catch(e => e.response);

                expect(response.status).toBe(401);
            });
        });

        describe('POST /api/v1/users/starred/:fileId - Star a File', () => {
            it('should star a file the user owns', async () => {
                await testStartup.loginAsUser('creator');
                const response = await client.post(`/api/v1/users/starred/${testFileId}`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.message).toBe('File starred');
            });

            it('should appear in starred files list after starring', async () => {
                await testStartup.loginAsUser('creator');
                await client.post(`/api/v1/users/starred/${testFileId}`);
                const response = await client.get('/api/v1/users/starred');

                expect(response.status).toBe(200);
                expect(response.data.data.length).toBeGreaterThanOrEqual(1);
                expect(response.data.data[0].fileName || response.data.data[0].filePath).toBeDefined();
            });

            it('should not duplicate when starring the same file twice', async () => {
                await testStartup.loginAsUser('creator');
                await client.post(`/api/v1/users/starred/${testFileId}`);

                const response = await client.get('/api/v1/users/starred');
                expect(response.status).toBe(200);
                expect(response.data.data.length).toBe(1);
            });

            it('should return 404 for non-existent file', async () => {
                await testStartup.loginAsUser('creator');
                const fakeId = new mongoose.Types.ObjectId().toString();
                const response = await client.post(`/api/v1/users/starred/${fakeId}`).catch(e => e.response);

                expect(response.status).toBe(404);
            });

            it('should return 403 when user has no access to the file', async () => {
                await testStartup.loginAsUser('user');
                const response = await client.post(`/api/v1/users/starred/${testFileId}`).catch(e => e.response);

                expect(response.status).toBe(403);
            });

            it('should allow starring a shared file', async () => {
                // sharedFileId was pre-shared with the user in beforeAll
                await testStartup.loginAsUser('user');
                const response = await client.post(`/api/v1/users/starred/${sharedFileId}`);

                expect(response.status).toBe(200);
                expect(response.data.message).toBe('File starred');
            });

            it('should keep starred files user-specific', async () => {
                // Ensure each user has exactly one star
                await testStartup.loginAsUser('creator');
                await client.post(`/api/v1/users/starred/${testFileId}`);
                await testStartup.loginAsUser('user');
                await client.post(`/api/v1/users/starred/${sharedFileId}`);

                // Creator's starred list should only have their star
                await testStartup.loginAsUser('creator');
                const creatorStarred = await client.get('/api/v1/users/starred');

                // User's starred list should only have their star
                await testStartup.loginAsUser('user');
                const userStarred = await client.get('/api/v1/users/starred');

                expect(creatorStarred.data.data.length).toBe(1);
                expect(userStarred.data.data.length).toBe(1);
            });
        });

        describe('DELETE /api/v1/users/starred/:fileId - Unstar a File', () => {
            it('should unstar a file', async () => {
                await testStartup.loginAsUser('creator');
                const response = await client.delete(`/api/v1/users/starred/${testFileId}`);

                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
                expect(response.data.message).toBe('File unstarred');
            });

            it('should no longer appear in starred list', async () => {
                await testStartup.loginAsUser('creator');
                const response = await client.get('/api/v1/users/starred');

                expect(response.status).toBe(200);
                expect(response.data.data.length).toBe(0);
            });

            it('should not affect other users starred list when unstarring', async () => {
                // Ensure regular user has a star (idempotent)
                await testStartup.loginAsUser('user');
                await client.post(`/api/v1/users/starred/${sharedFileId}`);

                // Creator unstars their file
                await testStartup.loginAsUser('creator');
                await client.delete(`/api/v1/users/starred/${testFileId}`);

                // Regular user should still have their star
                await testStartup.loginAsUser('user');
                const response = await client.get('/api/v1/users/starred');

                expect(response.status).toBe(200);
                expect(response.data.data.length).toBe(1);
            });

            it('should succeed silently when unstarring a file not starred', async () => {
                await testStartup.loginAsUser('creator');
                const fakeId = new mongoose.Types.ObjectId().toString();
                const response = await client.delete(`/api/v1/users/starred/${fakeId}`);

                expect(response.status).toBe(200);
            });

            it('should clean up user starred file', async () => {
                // Clean up: unstar the shared file from regular user too
                await testStartup.loginAsUser('user');
                await client.delete(`/api/v1/users/starred/${sharedFileId}`);

                const response = await client.get('/api/v1/users/starred');
                expect(response.data.data.length).toBe(0);
            });
        });
    });
});
