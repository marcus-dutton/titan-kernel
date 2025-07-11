import { TitanLoggerService } from '../services/titan-logger.service';

// Working webpack require.context declaration
declare const require: {
  context(
    directory: string,
    useSubdirectories?: boolean,
    regExp?: RegExp,
    mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once'
  ): {
    keys(): string[];
    (id: string): any;
  };
} & NodeJS.Require;

export interface BundlerDiscoveryResult {
  discovered: number;
  bundlerType: 'webpack' | 'vite' | 'rollup' | 'dynamic' | 'none';
  modules?: string[];
}

/**
 * Simple webpack auto-discovery using require.context
 * 
 * Developer Note: This implementation uses webpack's require.context() to discover
 * decorated classes in bundled environments. If you have a better approach for 
 * universal bundler support or improvements to this method, please feel free to 
 * fork the project and contribute via GitHub pull request.
 * 
 * Repository: https://github.com/marcus-dutton/titan-kernel
 */
export function requireAllFeatures(baseDir: string = '.'): number {
  try {
    const requireContext = require.context(baseDir, true, /^(?!.*node_modules).*\.(gateway|service|controller|model|component)\.ts$/);
    const modules = requireContext.keys();
    console.log(`🔧 Auto-discovered ${modules.length} feature files:`, modules);
    modules.forEach(requireContext);
    return modules.length;
  } catch (error) {
    console.log('🔧 require.context not available (not in webpack)');
    return 0;
  }
}

export function performAutoDiscovery(): BundlerDiscoveryResult {
  const discovered = requireAllFeatures();
  
  return {
    discovered,
    bundlerType: discovered > 0 ? 'webpack' : 'none',
    modules: discovered > 0 ? ['webpack require.context discovery'] : undefined
  };
}

// Legacy class wrapper for backwards compatibility
export class BundlerDiscovery {
  private logger: TitanLoggerService | null;

  constructor(logger: TitanLoggerService | null = null) {
    this.logger = logger;
  }

  performAutoDiscovery(): BundlerDiscoveryResult {
    return performAutoDiscovery();
  }

  static requireAllFeatures(baseDir?: string): number {
    return requireAllFeatures(baseDir);
  }
}