import { describe, test, expect } from 'vitest';
import { buildCookieOptions } from '../../file-server/config/cookies.js';

describe('Cookie options', () => {
    test('no domain is set when COOKIE_DOMAIN is missing', () => {
        const options = buildCookieOptions({ NODE_ENV: 'development' });
        expect(options).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
        expect('domain' in options).toBe(false);
    });

    test('no domain is set when COOKIE_DOMAIN is blank', () => {
        expect('domain' in buildCookieOptions({ COOKIE_DOMAIN: '   ' })).toBe(false);
    });

    test('the domain is set when COOKIE_DOMAIN is given', () => {
        const options = buildCookieOptions({ NODE_ENV: 'production', COOKIE_DOMAIN: ' example.test ' });
        expect(options.domain).toBe('example.test');
        expect(options.secure).toBe(true);
        expect(options.httpOnly).toBe(true);
        expect(options.sameSite).toBe('lax');
    });

    test('cookies are only marked secure in production', () => {
        expect(buildCookieOptions({ NODE_ENV: 'test' }).secure).toBe(false);
        expect(buildCookieOptions({ NODE_ENV: 'production' }).secure).toBe(true);
    });
});
