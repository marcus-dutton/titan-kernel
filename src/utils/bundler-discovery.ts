import { TitanLoggerService } from '../services/titan-logger.service';

// Interface-based type declarations (cleaner than declare const)
interface WebpackRequire extends NodeJS.Require {
    context(
        directory: string,
        useSubdirectories?: boolean,
        regExp?: RegExp,
        mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once'
    ): {
        keys(): string[];
        (id: string): any;
    };
}

export interface BundlerDiscoveryResult {
    discovered: number;
    bundlerType: 'webpack' | 'vite' | 'rollup' | 'dynamic' | 'none';
    modules?: string[];
}

export class BundlerDiscovery {
    private logger: TitanLoggerService;
    private source = 'BundlerDiscovery';

    constructor(logger: TitanLoggerService) {
        this.logger = logger;
    }

    performAutoDiscovery(): BundlerDiscoveryResult {
        this.logger.debug(this.source, 'Attempting universal bundler auto-discovery...');

        // Try each discovery method
        const webpackResult = this.tryWebpackDiscovery();
        if (webpackResult.discovered > 0) return webpackResult;

        const viteResult = this.tryViteRollupDiscovery();
        if (viteResult.discovered > 0) return viteResult;

        const dynamicResult = this.tryDynamicDiscovery();
        if (dynamicResult.discovered > 0) return dynamicResult;

        this.logger.debug(this.source, 'No bundler auto-discovery available');
        return { discovered: 0, bundlerType: 'none' };
    }

    private tryWebpackDiscovery(): BundlerDiscoveryResult {
        try {
            const webpackRequire = require as WebpackRequire;
            if (webpackRequire.context) {
                const requireContext = webpackRequire.context('../../../', true, /\.(gateway|service|controller|model|component)\.ts$/);
                const modules = requireContext.keys();
                this.logger.verbose(this.source, 'Webpack discovery found modules', { modules });

                modules.forEach(requireContext);

                return {
                    discovered: modules.length,
                    bundlerType: 'webpack',
                    modules
                };
            }
        } catch (error: any) {
            this.logger.verbose(this.source, 'Webpack discovery failed', { error: error.message });
        }

        return { discovered: 0, bundlerType: 'none' };
    }

    private tryViteRollupDiscovery(): BundlerDiscoveryResult {
        try {
            // Safer approach - check for Vite/Rollup specific globals without using import.meta directly
            const globalAny = global as any;

            // Check for Vite-specific variables in global scope
            if (globalAny.__vite_is_modern_browser ||
                globalAny.__vite_plugin_react_preamble_installed ||
                process.env.VITE_APP_ENV) {

                this.logger.verbose(this.source, 'Vite environment detected, but no auto-discovery method available');

                return {
                    discovered: 0,
                    bundlerType: 'vite',
                    modules: []
                };
            }

            // Check for Rollup-specific patterns
            if (globalAny.__rollup_bundled || process.env.ROLLUP_WATCH) {
                this.logger.verbose(this.source, 'Rollup environment detected, but no auto-discovery method available');

                return {
                    discovered: 0,
                    bundlerType: 'rollup',
                    modules: []
                };
            }

        } catch (error: any) {
            this.logger.verbose(this.source, 'Vite/Rollup discovery failed', { error: error.message });
        }

        return { discovered: 0, bundlerType: 'none' };
    }

    private tryDynamicDiscovery(): BundlerDiscoveryResult {
        try {
            const cache = require.cache;
            const bundledModules: string[] = [];

            for (const modulePath in cache) {
                if (modulePath.includes('.js') &&
                    !modulePath.includes('node_modules') &&
                    (modulePath.includes('gateway') ||
                        modulePath.includes('service') ||
                        modulePath.includes('controller') ||
                        modulePath.includes('component'))) {
                    bundledModules.push(modulePath);
                }
            }

            this.logger.verbose(this.source, 'Dynamic discovery analysis', {
                bundledModules,
                totalCacheEntries: Object.keys(cache).length
            });

            return {
                discovered: bundledModules.length,
                bundlerType: 'dynamic',
                modules: bundledModules
            };
        } catch (error: any) {
            this.logger.verbose(this.source, 'Dynamic discovery failed', { error: error.message });
        }

        return { discovered: 0, bundlerType: 'none' };
    }
}