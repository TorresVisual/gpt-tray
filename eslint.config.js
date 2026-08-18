const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['build/**', 'dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['main.js', 'config.js', 'windows.js', 'browsers.js', 'preload.js', 'lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly'
      }
    }
  },
  {
    files: ['renderer.js', 'settings_renderer.js', 'settings/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly'
      }
    }
  }
];
