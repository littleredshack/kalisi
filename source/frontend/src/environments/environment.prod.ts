export const environment = {
  production: true,
  apiUrl: `http://localhost:${getEnvVar('PORT') || '3000'}/api`,
  port: getEnvVar('PORT') || '3000',
  redisUrl: getEnvVar('REDIS_URL') || 'redis://localhost:6379',
  neo4jUri: getEnvVar('NEO4J_URI') || 'bolt://localhost:7687',
  mfaRequired: getEnvVar('MFA_REQUIRED') === 'true',
  totpOnlyMode: getEnvVar('TOTP_ONLY_MODE') === 'true',
  neo4jAutoLogin: false // Disabled in production for security
};

function getEnvVar(key: string): string | undefined {
  // Try window.__ENV first (injected by build)
  return (window as any).__ENV?.[key];
}