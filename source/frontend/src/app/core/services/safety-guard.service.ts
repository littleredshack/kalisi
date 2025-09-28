import { Injectable } from '@angular/core';

export interface QueryClassification {
  isReadOnly: boolean;
  containsWrite: boolean;
  containsDelete: boolean;
  containsSchemaChange: boolean;
  riskLevel: 'safe' | 'moderate' | 'high' | 'critical';
  requiresConfirmation: boolean;
}

export interface SafetyConfig {
  cypherReadOnly: boolean;
  enableWriteFlow: boolean;
  allowDestructive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SafetyGuardService {
  
  private readonly READ_ONLY_PATTERNS = [
    /^\s*MATCH\b/i,
    /^\s*RETURN\b/i,
    /^\s*WITH\b/i,
    /^\s*WHERE\b/i,
    /^\s*ORDER\s+BY\b/i,
    /^\s*LIMIT\b/i,
    /^\s*SKIP\b/i,
    /^\s*UNION\b/i,
    /^\s*CALL\s+db\.schema/i,
    /^\s*CALL\s+db\.labels/i,
    /^\s*CALL\s+db\.relationshipTypes/i,
    /^\s*CALL\s+db\.propertyKeys/i,
    /^\s*EXPLAIN\b/i,
    /^\s*PROFILE\b/i
  ];

  private readonly WRITE_PATTERNS = [
    /\bCREATE\b/i,
    /\bMERGE\b/i,
    /\bSET\b/i,
    /\bREMOVE\b/i,
    /\bLOAD\s+CSV\b/i
  ];

  private readonly DELETE_PATTERNS = [
    /\bDELETE\b/i,
    /\bDETACH\s+DELETE\b/i
  ];

  private readonly SCHEMA_CHANGE_PATTERNS = [
    /\bCREATE\s+(INDEX|CONSTRAINT)\b/i,
    /\bDROP\s+(INDEX|CONSTRAINT)\b/i,
    /\bCREATE\s+DATABASE\b/i,
    /\bDROP\s+DATABASE\b/i,
    /\bALTER\b/i
  ];

  private readonly CRITICAL_PATTERNS = [
    /\bDROP\s+DATABASE\b/i,
    /\bDETACH\s+DELETE\b/i,
    /\bDELETE.*\*\b/i,
    /\bMATCH\s*\(\s*\w*\s*\)\s*DETACH\s+DELETE\b/i
  ];

  /**
   * Classifies a Cypher query to determine its safety level and required permissions
   */
  classifyQuery(cypher: string): QueryClassification {
    if (!cypher || typeof cypher !== 'string') {
      return this.createSafeClassification();
    }

    const normalizedQuery = cypher.trim();
    
    // Check for critical operations first
    const isCritical = this.CRITICAL_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    
    // Check for schema changes
    const containsSchemaChange = this.SCHEMA_CHANGE_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    
    // Check for delete operations
    const containsDelete = this.DELETE_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    
    // Check for write operations
    const containsWrite = this.WRITE_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    
    // Check if it's purely read-only
    const isReadOnly = this.isQueryReadOnly(normalizedQuery);

    // Determine risk level
    let riskLevel: QueryClassification['riskLevel'] = 'safe';
    if (isCritical) {
      riskLevel = 'critical';
    } else if (containsSchemaChange || containsDelete) {
      riskLevel = 'high';
    } else if (containsWrite) {
      riskLevel = 'moderate';
    }

    return {
      isReadOnly,
      containsWrite,
      containsDelete,
      containsSchemaChange,
      riskLevel,
      requiresConfirmation: !isReadOnly
    };
  }

  /**
   * Determines if a query must be confirmed based on current safety configuration
   */
  mustConfirm(cypher: string, config: SafetyConfig): boolean {
    const classification = this.classifyQuery(cypher);
    
    // Always block if read-only mode is enabled and query contains writes
    if (config.cypherReadOnly && !classification.isReadOnly) {
      return true;
    }

    // Block write operations if write flow is disabled
    if (!config.enableWriteFlow && classification.containsWrite) {
      return true;
    }

    // Block destructive operations if not allowed
    if (!config.allowDestructive && (classification.containsDelete || classification.containsSchemaChange)) {
      return true;
    }

    return classification.requiresConfirmation;
  }

  /**
   * Gets a human-readable safety message for a query classification
   */
  getSafetyMessage(classification: QueryClassification, config: SafetyConfig): string {
    if (classification.isReadOnly) {
      return '✅ Safe read-only query';
    }

    if (config.cypherReadOnly) {
      return '❌ Write operations disabled by configuration';
    }

    if (!config.enableWriteFlow && classification.containsWrite) {
      return '❌ Write operations require explicit enablement';
    }

    if (!config.allowDestructive && classification.containsDelete) {
      return '❌ Destructive operations not permitted';
    }

    switch (classification.riskLevel) {
      case 'critical':
        return '🚨 CRITICAL: This operation may cause irreversible data loss';
      case 'high':
        return '⚠️ HIGH RISK: This operation modifies database structure or deletes data';
      case 'moderate':
        return '⚠️ MODERATE RISK: This operation will modify data';
      default:
        return '✅ Safe operation';
    }
  }

  /**
   * Gets appropriate CSS class for risk level styling
   */
  getRiskLevelClass(riskLevel: QueryClassification['riskLevel']): string {
    switch (riskLevel) {
      case 'critical':
        return 'risk-critical';
      case 'high':
        return 'risk-high';
      case 'moderate':
        return 'risk-moderate';
      default:
        return 'risk-safe';
    }
  }

  private isQueryReadOnly(query: string): boolean {
    // First, check if it starts with known read-only patterns
    const startsWithReadOnly = this.READ_ONLY_PATTERNS.some(pattern => pattern.test(query));
    
    // If it doesn't start with read-only patterns, it's likely not read-only
    if (!startsWithReadOnly) {
      // Check if it contains any write operations
      const hasWriteOperations = this.WRITE_PATTERNS.some(pattern => pattern.test(query)) ||
                               this.DELETE_PATTERNS.some(pattern => pattern.test(query)) ||
                               this.SCHEMA_CHANGE_PATTERNS.some(pattern => pattern.test(query));
      
      return !hasWriteOperations;
    }

    // Even if it starts with read-only, check for write operations in the rest of the query
    const hasWriteOperations = this.WRITE_PATTERNS.some(pattern => pattern.test(query)) ||
                             this.DELETE_PATTERNS.some(pattern => pattern.test(query)) ||
                             this.SCHEMA_CHANGE_PATTERNS.some(pattern => pattern.test(query));

    return !hasWriteOperations;
  }

  private createSafeClassification(): QueryClassification {
    return {
      isReadOnly: true,
      containsWrite: false,
      containsDelete: false,
      containsSchemaChange: false,
      riskLevel: 'safe',
      requiresConfirmation: false
    };
  }
}