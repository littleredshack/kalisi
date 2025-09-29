export const environment = {
  production: false,
  apiUrl: `http://localhost:${getEnvVar('TEST_PORT') || getEnvVar('PORT') || '3000'}/api`,
  port: getEnvVar('TEST_PORT') || getEnvVar('PORT') || '3000',
  redisUrl: getEnvVar('TEST_DATABASE_URL') || getEnvVar('REDIS_URL') || 'redis://localhost:6379',
  neo4jUri: getEnvVar('TEST_NEO4J_URI') || getEnvVar('NEO4J_URI') || 'bolt://localhost:7687',
  mfaRequired: getEnvVar('MFA_REQUIRED') === 'true',
  totpOnlyMode: getEnvVar('TOTP_ONLY_MODE') === 'true',
  neo4jAutoLogin: false // Set to false for production/secure environments
};

function getEnvVar(key: string): string | undefined {
  // Try window.__ENV first (injected by build)
  return (window as any).__ENV?.[key];
}