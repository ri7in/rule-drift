import { CommandAdapter } from './command.js';
import { OllamaAdapter } from './ollama.js';
import type { Adapter, AdapterConfig } from '../types.js';

export function createAdapter(config: AdapterConfig, baseDir: string): Adapter {
  switch (config.type) {
    case 'command':
      return new CommandAdapter(config, baseDir);
    case 'ollama':
      return new OllamaAdapter(config);
  }
}

export { CommandAdapter } from './command.js';
export { OllamaAdapter } from './ollama.js';
