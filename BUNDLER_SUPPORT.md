# TitanKernel Bundler Support Guide

This guide provides detailed information on using TitanKernel with different bundlers and build tools.

## Overview

TitanKernel provides universal bundler support that automatically adapts to your build environment. The kernel detects whether it's running in:

- **Development mode**: Uses file system scanning
- **Production mode**: Uses bundler-specific discovery strategies

## Supported Bundlers

### Webpack

**Automatic Support**: ✅ Works out of the box  
**Discovery Method**: `require.context()`  
**Minimum Version**: Any version supporting `require.context()`

#### Example webpack.config.js
```javascript
const path = require('path');

module.exports = {
  entry: './src/application.ts',
  target: 'node',
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'application.js',
    path: path.resolve(__dirname, 'dist'),
  },
  externals: {
    // Exclude node_modules from bundle
    'mongoose': 'commonjs mongoose',
    'socket.io': 'commonjs socket.io'
  }
};
```

#### Example Application Setup
```typescript
// src/application.ts
import 'reflect-metadata';
import { TitanKernel } from '@titan/kernel';

async function bootstrap() {
  const context = await TitanKernel.create({
    autoScan: true, // Automatically discovers all decorated classes
    logging: {
      databaseAccess: true
    }
  });
  
  console.log(`✅ Discovered ${context.services.size} services`);
  console.log(`✅ Discovered ${context.controllers.length} controllers`);
  console.log(`✅ Discovered ${context.gateways.length} gateways`);
}

bootstrap().catch(console.error);
```

### Vite

**Automatic Support**: ✅ Works out of the box  
**Discovery Method**: Environment detection + dynamic imports  
**Minimum Version**: 2.0+

#### Example vite.config.js
```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/application.ts',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['mongoose', 'socket.io', 'reflect-metadata'],
      output: {
        entryFileNames: 'application.js'
      }
    },
    target: 'node16'
  },
  ssr: {
    noExternal: ['@titan/kernel']
  }
});
```

### Rollup

**Automatic Support**: ✅ Works out of the box  
**Discovery Method**: Environment detection + dynamic analysis  
**Minimum Version**: 2.0+

#### Example rollup.config.js
```javascript
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/application.ts',
  output: {
    file: 'dist/application.js',
    format: 'cjs'
  },
  external: ['mongoose', 'socket.io', 'reflect-metadata'],
  plugins: [
    nodeResolve(),
    commonjs(),
    typescript()
  ]
};
```

### ESBuild

**Automatic Support**: ✅ Works with fallback strategy  
**Discovery Method**: Dynamic require.cache analysis  
**Minimum Version**: 0.8+

#### Example build script
```javascript
// build.js
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/application.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  outfile: 'dist/application.js',
  external: ['mongoose', 'socket.io'],
  format: 'cjs'
}).catch(() => process.exit(1));
```

## Manual Discovery API

For advanced use cases or custom bundler configurations:

```typescript
import { BundlerDiscovery } from '@titan/kernel';

// Manual discovery with custom options
const result = BundlerDiscovery.performAutoDiscovery({
  baseDir: './src/features',
  patterns: [
    '**/*.service.ts',
    '**/*.controller.ts', 
    '**/*.gateway.ts',
    '**/*.component.ts',
    '**/*.model.ts'
  ]
});

console.log('Discovery method used:', result.method);
console.log('Files discovered:', result.files);
console.log('Success:', result.success);
```

## Troubleshooting

### Services Not Found in Production

**Problem**: Some services, controllers, or gateways are missing in the bundled application.

**Solutions**:

1. **Enable debug logging**:
   ```bash
   TITAN_DEBUG=true node dist/application.js
   ```

2. **Check bundle contents**:
   - Ensure your bundler includes all feature files
   - Verify tree-shaking isn't removing "unused" files

3. **Use explicit modules**:
   ```typescript
   @Module({
     providers: [UserService, AuthService],
     controllers: [UserController],
     gateways: [ChatGateway]
   })
   export class AppModule {}
   
   const context = await TitanKernel.create({
     modules: [AppModule],
     autoScan: false
   });
   ```

4. **Manual imports fallback**:
   ```typescript
   // Force import all decorated classes
   import './features/auth/auth.service';
   import './features/users/user.controller';
   import './features/chat/chat.gateway';
   
   const context = await TitanKernel.create({
     autoScan: true
   });
   ```

### Webpack require.context Issues

**Problem**: `require.context is not a function` in development.

**Solution**: Ensure you're running through webpack-dev-server or webpack build process.

### Vite SSR Issues

**Problem**: Services not discovered in Vite SSR mode.

**Solution**: Add TitanKernel to `ssr.noExternal`:
```javascript
// vite.config.js
export default {
  ssr: {
    noExternal: ['@titan/kernel']
  }
};
```

### Dynamic Imports in ESM

**Problem**: Using TitanKernel in pure ESM projects.

**Solution**: Use dynamic imports for discovery:
```typescript
// For ESM projects, ensure proper async loading
const { TitanKernel } = await import('@titan/kernel');
```

## Best Practices

1. **Always use `autoScan: true`** unless you have specific module requirements
2. **Enable debug logging** during development to verify discovery
3. **Test bundled builds** with the same discovery patterns as development
4. **Use explicit modules** for large applications with complex dependency trees
5. **Profile bundle size** and exclude unnecessary dependencies

## Environment Variables

Set these environment variables for debugging:

```bash
TITAN_DEBUG=true           # Enable detailed discovery logging
NODE_ENV=production        # Triggers production bundler detection
FORCE_BUNDLER_MODE=webpack # Force specific bundler detection (for testing)
```

## Version Compatibility

| TitanKernel | Webpack | Vite | Rollup | ESBuild |
|-------------|---------|------|--------|---------|
| 1.8.5+      | 4.0+    | 2.0+ | 2.0+   | 0.8+    |

## Support

If you encounter issues with bundler support:

1. Check the [GitHub Issues](https://github.com/marcus-dutton/titan-kernel/issues)
2. Enable debug logging and share the output
3. Provide your bundler configuration
4. Test with manual imports as a workaround
