import { TestBed } from '@angular/core/testing';
import { SafetyGuardService, QueryClassification, SafetyConfig } from './safety-guard.service';

describe('SafetyGuardService', () => {
  let service: SafetyGuardService;
  let defaultConfig: SafetyConfig;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SafetyGuardService);
    
    defaultConfig = {
      cypherReadOnly: true,
      enableWriteFlow: false,
      allowDestructive: false
    };
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('classifyQuery', () => {
    describe('Read-only queries', () => {
      const readOnlyQueries = [
        'MATCH (n) RETURN n',
        'MATCH (n:User) WHERE n.name = "test" RETURN n.email',
        'MATCH (a)-[r]->(b) RETURN a, r, b LIMIT 10',
        'CALL db.schema.nodeTypeProperties()',
        'CALL db.labels()',
        'EXPLAIN MATCH (n) RETURN n',
        'PROFILE MATCH (n) RETURN n',
        '  MATCH (n) RETURN n  ', // with whitespace
      ];

      readOnlyQueries.forEach(query => {
        it(`should classify "${query}" as read-only`, () => {
          const result = service.classifyQuery(query);
          
          expect(result.isReadOnly).toBe(true);
          expect(result.containsWrite).toBe(false);
          expect(result.containsDelete).toBe(false);
          expect(result.containsSchemaChange).toBe(false);
          expect(result.riskLevel).toBe('safe');
          expect(result.requiresConfirmation).toBe(false);
        });
      });
    });

    describe('Write queries', () => {
      const writeQueries = [
        'CREATE (n:User {name: "test"})',
        'MERGE (n:User {id: 1}) SET n.updated = timestamp()',
        'MATCH (n:User) SET n.active = true',
        'MATCH (n:User) REMOVE n.oldProperty',
        'LOAD CSV WITH HEADERS FROM "file://data.csv" AS row CREATE (n:Node {data: row})'
      ];

      writeQueries.forEach(query => {
        it(`should classify "${query}" as write operation`, () => {
          const result = service.classifyQuery(query);
          
          expect(result.isReadOnly).toBe(false);
          expect(result.containsWrite).toBe(true);
          expect(result.riskLevel).toBe('moderate');
          expect(result.requiresConfirmation).toBe(true);
        });
      });
    });

    describe('Delete queries', () => {
      const deleteQueries = [
        'MATCH (n:User) DELETE n',
        'MATCH (n:User)-[r]-() DELETE r',
        'MATCH (n:User) DETACH DELETE n'
      ];

      deleteQueries.forEach(query => {
        it(`should classify "${query}" as delete operation`, () => {
          const result = service.classifyQuery(query);
          
          expect(result.isReadOnly).toBe(false);
          expect(result.containsDelete).toBe(true);
          expect(result.riskLevel).toBe('high');
          expect(result.requiresConfirmation).toBe(true);
        });
      });
    });

    describe('Schema change queries', () => {
      const schemaQueries = [
        'CREATE INDEX idx_user_email FOR (n:User) ON (n.email)',
        'DROP INDEX idx_user_email',
        'CREATE CONSTRAINT unique_user_email FOR (n:User) REQUIRE n.email IS UNIQUE',
        'DROP CONSTRAINT unique_user_email',
        'CREATE DATABASE testdb',
        'DROP DATABASE testdb'
      ];

      schemaQueries.forEach(query => {
        it(`should classify "${query}" as schema change`, () => {
          const result = service.classifyQuery(query);
          
          expect(result.isReadOnly).toBe(false);
          expect(result.containsSchemaChange).toBe(true);
          expect(result.riskLevel).toBe('high');
          expect(result.requiresConfirmation).toBe(true);
        });
      });
    });

    describe('Critical queries', () => {
      const criticalQueries = [
        'DROP DATABASE production',
        'MATCH (n) DETACH DELETE n',
        'MATCH () DELETE *'
      ];

      criticalQueries.forEach(query => {
        it(`should classify "${query}" as critical risk`, () => {
          const result = service.classifyQuery(query);
          
          expect(result.isReadOnly).toBe(false);
          expect(result.riskLevel).toBe('critical');
          expect(result.requiresConfirmation).toBe(true);
        });
      });
    });

    describe('Edge cases', () => {
      it('should handle empty query', () => {
        const result = service.classifyQuery('');
        
        expect(result.isReadOnly).toBe(true);
        expect(result.riskLevel).toBe('safe');
        expect(result.requiresConfirmation).toBe(false);
      });

      it('should handle null query', () => {
        const result = service.classifyQuery(null as any);
        
        expect(result.isReadOnly).toBe(true);
        expect(result.riskLevel).toBe('safe');
        expect(result.requiresConfirmation).toBe(false);
      });

      it('should handle whitespace-only query', () => {
        const result = service.classifyQuery('   \n\t   ');
        
        expect(result.isReadOnly).toBe(true);
        expect(result.riskLevel).toBe('safe');
        expect(result.requiresConfirmation).toBe(false);
      });
    });
  });

  describe('mustConfirm', () => {
    it('should require confirmation for write queries in read-only mode', () => {
      const config: SafetyConfig = { cypherReadOnly: true, enableWriteFlow: false, allowDestructive: false };
      const result = service.mustConfirm('CREATE (n:Test)', config);
      
      expect(result).toBe(true);
    });

    it('should not require confirmation for read-only queries in read-only mode', () => {
      const config: SafetyConfig = { cypherReadOnly: true, enableWriteFlow: false, allowDestructive: false };
      const result = service.mustConfirm('MATCH (n) RETURN n', config);
      
      expect(result).toBe(false);
    });

    it('should require confirmation for write queries when write flow is disabled', () => {
      const config: SafetyConfig = { cypherReadOnly: false, enableWriteFlow: false, allowDestructive: false };
      const result = service.mustConfirm('CREATE (n:Test)', config);
      
      expect(result).toBe(true);
    });

    it('should require confirmation for destructive queries when destructive operations are disabled', () => {
      const config: SafetyConfig = { cypherReadOnly: false, enableWriteFlow: true, allowDestructive: false };
      const result = service.mustConfirm('DELETE n', config);
      
      expect(result).toBe(true);
    });

    it('should allow write queries when properly configured', () => {
      const config: SafetyConfig = { cypherReadOnly: false, enableWriteFlow: true, allowDestructive: false };
      const result = service.mustConfirm('CREATE (n:Test)', config);
      
      expect(result).toBe(true); // Still requires confirmation due to requiresConfirmation flag
    });
  });

  describe('getSafetyMessage', () => {
    it('should return safe message for read-only queries', () => {
      const classification: QueryClassification = {
        isReadOnly: true,
        containsWrite: false,
        containsDelete: false,
        containsSchemaChange: false,
        riskLevel: 'safe',
        requiresConfirmation: false
      };
      
      const message = service.getSafetyMessage(classification, defaultConfig);
      expect(message).toBe('✅ Safe read-only query');
    });

    it('should return disabled message for writes in read-only mode', () => {
      const classification: QueryClassification = {
        isReadOnly: false,
        containsWrite: true,
        containsDelete: false,
        containsSchemaChange: false,
        riskLevel: 'moderate',
        requiresConfirmation: true
      };
      
      const message = service.getSafetyMessage(classification, defaultConfig);
      expect(message).toBe('❌ Write operations disabled by configuration');
    });

    it('should return appropriate risk level messages', () => {
      const criticalClassification: QueryClassification = {
        isReadOnly: false,
        containsWrite: false,
        containsDelete: true,
        containsSchemaChange: false,
        riskLevel: 'critical',
        requiresConfirmation: true
      };
      
      const config: SafetyConfig = { cypherReadOnly: false, enableWriteFlow: true, allowDestructive: true };
      const message = service.getSafetyMessage(criticalClassification, config);
      expect(message).toBe('🚨 CRITICAL: This operation may cause irreversible data loss');
    });
  });

  describe('getRiskLevelClass', () => {
    it('should return correct CSS classes for risk levels', () => {
      expect(service.getRiskLevelClass('safe')).toBe('risk-safe');
      expect(service.getRiskLevelClass('moderate')).toBe('risk-moderate');
      expect(service.getRiskLevelClass('high')).toBe('risk-high');
      expect(service.getRiskLevelClass('critical')).toBe('risk-critical');
    });
  });
});