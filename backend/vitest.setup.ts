// Ensures env-config's schema validation passes in any test run (local or CI) without
// requiring a real .env file, since some spec files import modules that transitively
// load `src/config/env-config.ts`.
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '4000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.DATABASE_URL = 'postgresql://pairkit:pairkit@localhost:5432/pairkit_test';
process.env.DIRECT_URL = 'postgresql://pairkit:pairkit@localhost:5432/pairkit_test';
process.env.SHADOW_DATABASE_URL = 'postgresql://pairkit:pairkit@localhost:5432/pairkit_test_shadow';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'for_tests_only_not_a_real_secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
process.env.WHITE_LIST_URLS = 'http://localhost:3000,https://example.com';
