import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProvider } from './factory';
import { setLLMConfig } from './config';
import {
  AnthropicProvider,
  CustomProvider,
  DeepSeekProvider,
  GeminiProvider,
  GroqProvider,
  MoonshotProvider,
  OllamaProvider,
  OpenAIProvider,
  OpenRouterProvider,
  ZAIProvider,
} from './providers';

vi.mock('@/stores/useLocaleStore', () => ({
  getCurrentTranslations: () => ({
    ai: {
      apiKeyRequiredWithProvider: '请先为 {provider} 配置 API Key',
      unsupportedProvider: '不支持的 AI 提供商: {provider}',
    },
  }),
}));

describe('createProvider', () => {
  beforeEach(() => {
    setLLMConfig({ provider: 'openai', model: 'gpt-4o', apiKey: 'test-key' });
  });

  describe('Provider creation', () => {
    const providers = [
      { name: 'anthropic', model: 'claude-sonnet-4-5', ctor: AnthropicProvider },
      { name: 'openai', model: 'gpt-5.2', ctor: OpenAIProvider },
      { name: 'gemini', model: 'gemini-2.5-pro', ctor: GeminiProvider },
      { name: 'moonshot', model: 'kimi-k2.5', ctor: MoonshotProvider },
      { name: 'deepseek', model: 'deepseek-chat', ctor: DeepSeekProvider },
      { name: 'zai', model: 'glm-4.7', ctor: ZAIProvider },
      { name: 'groq', model: 'meta-llama/llama-4-maverick-17b-128e-instruct', ctor: GroqProvider },
      { name: 'openrouter', model: 'openai/gpt-5.2', ctor: OpenRouterProvider },
    ] as const;

    it.each(providers)('creates the correct $name provider type', ({ name, model, ctor }) => {
      setLLMConfig({
        provider: name as any,
        model,
        apiKey: 'test-key',
      });

      const provider = createProvider();

      expect(provider).toBeInstanceOf(ctor);
      expect((provider as any).config.provider).toBe(name);
      expect((provider as any).config.model).toBe(model);
    });

    it('creates an ollama provider without an API key', () => {
      setLLMConfig({ provider: 'ollama', model: 'llama3.2' });

      const provider = createProvider();

      expect(provider).toBeInstanceOf(OllamaProvider);
      expect((provider as any).config.provider).toBe('ollama');
    });
  });

  describe('Config override', () => {
    it('uses override config over global config', () => {
      setLLMConfig({
        provider: 'openai',
        model: 'gpt-5.2-mini',
        apiKey: 'global-key',
      });

      const provider = createProvider({
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        apiKey: 'override-key',
      });

      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect((provider as any).config.provider).toBe('anthropic');
      expect((provider as any).config.model).toBe('claude-opus-4-6');
      expect((provider as any).config.apiKey).toBe('override-key');
    });

    it('merges partial override with global config', () => {
      setLLMConfig({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        temperature: 0.5,
      });

      const provider = createProvider({ model: 'gpt-5-mini' });

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect((provider as any).config.provider).toBe('openai');
      expect((provider as any).config.model).toBe('gpt-5-mini');
      expect((provider as any).config.temperature).toBe(0.5);
    });
  });

  describe('Thinking mode resolution', () => {
    it('switches deepseek chat to reasoner when thinking mode is enabled', () => {
      setLLMConfig({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
        thinkingMode: 'thinking',
      });

      const provider = createProvider() as any;
      expect(provider).toBeInstanceOf(DeepSeekProvider);
      expect(provider.config.model).toBe('deepseek-reasoner');
      expect(provider.config.thinkingMode).toBe('thinking');
    });

    it('switches deepseek reasoner to chat when instant mode is enabled', () => {
      setLLMConfig({
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        apiKey: 'test-key',
        thinkingMode: 'instant',
      });

      const provider = createProvider() as any;
      expect(provider).toBeInstanceOf(DeepSeekProvider);
      expect(provider.config.model).toBe('deepseek-chat');
      expect(provider.config.thinkingMode).toBe('instant');
    });
  });

  describe('Custom model handling', () => {
    it('uses customModelId when model is custom', () => {
      setLLMConfig({
        provider: 'openai',
        model: 'custom',
        customModelId: 'my-fine-tuned-model',
        apiKey: 'test-key',
      });

      const provider = createProvider();

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect((provider as any).config.model).toBe('my-fine-tuned-model');
    });

    it('ignores customModelId when model is not custom', () => {
      setLLMConfig({
        provider: 'openai',
        model: 'gpt-4o',
        customModelId: 'my-fine-tuned-model',
        apiKey: 'test-key',
      });

      const provider = createProvider();

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect((provider as any).config.model).toBe('gpt-4o');
    });
  });

  describe('Custom provider', () => {
    it('creates a custom provider without an API key', () => {
      setLLMConfig({
        provider: 'custom',
        model: 'custom',
        customModelId: 'my-model',
        baseUrl: 'https://my-api.example.com/v1',
      });

      const provider = createProvider();

      expect(provider).toBeInstanceOf(CustomProvider);
      expect((provider as any).config.customModelId).toBe('my-model');
    });

    it('uses the user-provided baseUrl for custom provider', () => {
      setLLMConfig({
        provider: 'custom',
        model: 'custom',
        customModelId: 'my-model',
        baseUrl: 'https://my-api.example.com/v1',
      });
      const provider = createProvider() as any;
      expect(provider).toBeInstanceOf(CustomProvider);
      expect(provider.getUrl()).toBe('https://my-api.example.com/v1/chat/completions');
    });

    it('throws when custom provider has no baseUrl', () => {
      setLLMConfig({
        provider: 'custom',
        model: 'custom',
        customModelId: 'my-model',
        baseUrl: undefined,
      });
      expect(() => createProvider()).toThrow('Custom provider requires a Base URL');
    });
  });

  describe('Unsupported provider', () => {
    it('throws for unsupported provider', () => {
      setLLMConfig({
        provider: 'unknown-provider' as any,
        model: 'some-model',
        apiKey: 'test-key',
      });
      expect(() => createProvider()).toThrow('不支持的 AI 提供商');
    });
  });
});
