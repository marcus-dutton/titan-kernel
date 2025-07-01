import { glob } from 'glob';
import * as path from 'path';
import { ScanOptions } from '../core/types';

export class FileScanner {
  private defaultPatterns = [
    '**/*.service.ts',
    '**/*.controller.ts', 
    '**/*.gateway.ts',
    '**/*.provider.ts',
    '**/*.guard.ts',
    '**/*.middleware.ts'
  ];

  private defaultExcludes = [
    'node_modules/**',
    'dist/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.d.ts'
  ];

  async scanForClasses(options: ScanOptions = {}): Promise<string[]> {
    const {
      include = this.defaultPatterns,
      exclude = this.defaultExcludes,
      baseDir = process.cwd()
    } = options;

    const allFiles: string[] = [];

    for (const pattern of include) {
      try {
        const files = await glob(pattern, {
          cwd: baseDir,
          ignore: exclude,
          absolute: true
        });
        allFiles.push(...files);
      } catch (error) {
        console.warn(`Error scanning pattern ${pattern}:`, error);
      }
    }

    // Remove duplicates and import the files
    const uniqueFiles = [...new Set(allFiles)];
    
    for (const file of uniqueFiles) {
      try {
        // Dynamically import the file to trigger decorator execution
        await import(file);
      } catch (error) {
        console.warn(`Error importing ${file}:`, error);
      }
    }

    return uniqueFiles;
  }

  async scanDirectory(directory: string, patterns: string[] = this.defaultPatterns): Promise<string[]> {
    return this.scanForClasses({
      include: patterns,
      baseDir: directory
    });
  }
}

export const fileScanner = new FileScanner();
