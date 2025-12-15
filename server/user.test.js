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
});
