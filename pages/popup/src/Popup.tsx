import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { t } from '@extension/i18n';
import { ToggleButton } from '@extension/ui';
import { useState, useEffect, useRef } from 'react';

// 定义AI提供商类型
type AIProvider = {
  id: string;
  name: string;
  apiKey?: string; // 改为可选，因为每个实例会有自己的 apiKey
  baseUrl: string;
  model: string;
  systemPrompt?: string;
  modelConfig?: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    presence_penalty?: number;
    frequency_penalty?: number;
  };
  isGemini?: boolean; // 添加标识符
};

const defaultProviders: AIProvider[] = [
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    systemPrompt: ``,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    },
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    systemPrompt: '',
    modelConfig: {
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2000,
    },
  },
  {
    id: 'aliyun-r1',
    name: '阿里云 R1',
    baseUrl: 'https://api.aliyun.com/v1/chat/completions',
    model: 'aliyun-reasoner',
    systemPrompt: ``,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
    },
  },
  {
    id: 'tencent-r1',
    name: '腾讯云 R1',
    baseUrl: 'https://api.tencent.com/v1/chat/completions',
    model: 'tencent-reasoner',
    systemPrompt: ``,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
    },
  },
  {
    id: 'guiji-r1',
    name: '硅基流动 R1',
    baseUrl: 'https://api.guiji.ai/v1/chat/completions',
    model: 'guiji-reasoner',
    systemPrompt: `。`,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
    },
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 2 Flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    model: 'gemini-2.0-flash',
    isGemini: true,
    modelConfig: {
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2000,
    },
  },
];

// 在组件顶部添加分类函数
const categorizeProviders = (providers: AIProvider[]) => {
  return providers.reduce(
    (acc, provider) => {
      if (provider.id.includes('r1')) {
        acc.reasoning.push(provider);
      } else {
        acc.chat.push(provider);
      }
      return acc;
    },
    { reasoning: [] as AIProvider[], chat: [] as AIProvider[] },
  );
};

const Popup = () => {
  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai'; content: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(defaultProviders[0]);
  const [providerApiKeys, setProviderApiKeys] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const categorizedProviders = categorizeProviders(defaultProviders);

  // 从 storage 加载所有配置
  useEffect(() => {
    chrome.storage.local.get(['providerApiKeys', 'selectedProviderId'], result => {
      if (result.providerApiKeys) {
        setProviderApiKeys(result.providerApiKeys);
      }
      if (result.selectedProviderId) {
        const savedProvider = defaultProviders.find(p => p.id === result.selectedProviderId);
        if (savedProvider) {
          setSelectedProvider(savedProvider);
        }
      }
    });
  }, []);

  // 从 storage 加载聊天记录
  useEffect(() => {
    chrome.storage.local.get(['chatHistory'], result => {
      if (result.chatHistory) {
        setMessages(result.chatHistory);
      }
    });
  }, []);

  // 监听消息变化并保存
  useEffect(() => {
    if (messages.length > 0) {
      chrome.storage.local.set({ chatHistory: messages });
    }
  }, [messages]);

  // 保存特定提供商的 API key
  const handleSaveApiKey = (providerId: string, apiKey: string) => {
    const newProviderApiKeys = { ...providerApiKeys, [providerId]: apiKey };
    setProviderApiKeys(newProviderApiKeys);
    chrome.storage.local.set({ providerApiKeys: newProviderApiKeys });
  };

  // 修改清除对话历史函数，同时清除存储
  const handleClearChat = () => {
    setMessages([]);
    setCurrentStreamingMessage('');
    chrome.storage.local.remove(['chatHistory']);
  };

  // 修改选择提供商的处理函数
  const handleProviderChange = (provider: AIProvider) => {
    setSelectedProvider(provider);
    // 保存选中的提供商 ID
    chrome.storage.local.set({ selectedProviderId: provider.id });
  };

  // 添加主题切换函数
  const toggleTheme = () => {
    if (theme === 'light') {
      exampleThemeStorage.set('dark');
    } else {
      exampleThemeStorage.set('light');
    }
  };

  const handleSend = async () => {
    const currentApiKey = providerApiKeys[selectedProvider.id];
    if (!inputText.trim() || !currentApiKey) return;

    setMessages(prev => [...prev, { type: 'user', content: inputText }]);
    setIsLoading(true);
    setCurrentStreamingMessage('');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      if (selectedProvider.isGemini) {
        // Gemini API 特定处理
        const requestBody = {
          contents: [
            {
              parts: [{ text: inputText }],
            },
          ],
          generationConfig: {
            temperature: selectedProvider.modelConfig?.temperature,
            topP: selectedProvider.modelConfig?.top_p,
            maxOutputTokens: selectedProvider.modelConfig?.max_tokens,
          },
        };

        const response = await fetch(`${selectedProvider.baseUrl}?key=${currentApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            `Gemini API error! status: ${response.status}${
              errorData ? `, message: ${errorData.error?.message || JSON.stringify(errorData)}` : ''
            }`,
          );
        }

        const data = await response.json();
        const content = data.candidates[0]?.content?.parts[0]?.text || '';

        setMessages(prev => [...prev, { type: 'ai', content }]);
      } else {
        // 原有的其他 API 处理逻辑
        const messageHistory = messages.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

        const requestBody = {
          model: selectedProvider.model,
          messages: [
            selectedProvider.systemPrompt ? { role: 'system', content: selectedProvider.systemPrompt } : null,
            ...messageHistory,
            { role: 'user', content: inputText },
          ].filter(Boolean),
          ...selectedProvider.modelConfig,
          stream: true,
        };

        const response = await fetch(`${selectedProvider.baseUrl}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentApiKey}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            `HTTP error! status: ${response.status}${errorData ? `, message: ${errorData.error?.message || JSON.stringify(errorData)}` : ''}`,
          );
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let streamedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                streamedContent += content;
                setCurrentStreamingMessage(streamedContent);
              } catch (e) {
                console.error('解析流式数据错误:', e);
              }
            }
          }
        }

        // 流式响应完成后，添加完整消息
        setMessages(prev => [...prev, { type: 'ai', content: streamedContent }]);
        setCurrentStreamingMessage('');
      }
    } catch (error) {
      console.error('API 调用错误:', error);
      setMessages(prev => [
        ...prev,
        {
          type: 'ai',
          content: `错误: ${error.message || '发生了错误，请稍后重试。'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
      setInputText('');
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="min-h-[520px] h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* 导航栏 - 更新夜间模式颜色 */}
      <div
        className={`h-14 shrink-0 px-4 flex justify-between items-center ${
          isLight ? 'bg-white shadow-sm' : 'bg-gray-800'
        }`}>
        <div className="flex items-center gap-2">
          <h1
            className={`text-lg font-medium ${
              isLight ? 'text-gray-700' : 'text-blue-400' // 夜间模式改为浅蓝色
            }`}>
            AI Chat
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* 主题切换按钮 */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-gray-100 text-amber-500' : 'hover:bg-gray-700/50 text-blue-400' // 夜间模式统一为浅蓝色
            }`}>
            {isLight ? (
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>

          {/* 设置按钮 - 更新夜间模式颜色 */}
          <button
            onClick={() => setShowSettings(true)}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-gray-700/50 text-blue-400' // 夜间模式统一为浅蓝色
            }`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 设置面板 - 简化模型选择 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div
            className={`w-[320px] rounded-2xl shadow-xl ${
              isLight ? 'bg-white' : 'bg-gray-800'
            } p-6 transform transition-all duration-200 settings-scroll max-h-[480px] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-lg font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>设置</h2>
              <button
                onClick={() => setShowSettings(false)}
                className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 简化的模型选择列表 */}
            <div className="space-y-3">
              {defaultProviders.map(provider => (
                <div
                  key={provider.id}
                  className={`relative rounded-xl p-4 transition-all duration-200 ${
                    selectedProvider.id === provider.id
                      ? isLight
                        ? 'bg-blue-50 ring-2 ring-blue-500'
                        : 'bg-blue-900/20 ring-2 ring-blue-400'
                      : isLight
                        ? 'hover:bg-gray-50'
                        : 'hover:bg-gray-700/50'
                  }`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="radio"
                        id={provider.id}
                        name="ai-provider"
                        checked={selectedProvider.id === provider.id}
                        onChange={() => handleProviderChange(provider)}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-400"
                      />
                      <label
                        htmlFor={provider.id}
                        className={`text-sm font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
                        {provider.name}
                      </label>
                    </div>
                    <input
                      type="password"
                      value={providerApiKeys[provider.id] || ''}
                      onChange={e => handleSaveApiKey(provider.id, e.target.value)}
                      placeholder="API Key"
                      className={`w-32 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                        isLight
                          ? 'border-gray-200 focus:border-blue-500'
                          : 'border-gray-600 bg-gray-700/50 focus:border-blue-400'
                      } focus:outline-none focus:ring-1 focus:ring-blue-500/50`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 聊天区域 - 更新背景色 */}
      <div className="flex-1 overflow-y-auto">
        <div
          className={`h-full px-4 py-4 space-y-4 ${
            isLight ? 'bg-white' : 'bg-gray-900' // 白天模式使用纯白背景
          }`}>
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {message.type === 'ai' && (
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                  }`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : isLight
                      ? 'bg-gray-200 text-gray-900 rounded-bl-none'
                      : 'bg-gray-700 text-gray-100 rounded-bl-none'
                }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.type === 'user' && (
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                  }`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}

          {/* 流式响应显示 */}
          {currentStreamingMessage && (
            <div className="flex justify-start items-end gap-2">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 rounded-bl-none ${
                  isLight ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-100'
                }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {currentStreamingMessage}
                  <span className="inline-block w-1 h-4 ml-0.5 align-middle animate-pulse bg-current opacity-75"></span>
                </p>
              </div>
            </div>
          )}

          {/* 加载动画 */}
          {isLoading && !currentStreamingMessage && (
            <div className="flex justify-center items-center py-4">
              <div className="relative w-8 h-8">
                <div className="absolute top-0 left-0 w-full h-full border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 输入区域 - 固定在底部 */}
      <div
        className={`shrink-0 border-t ${
          isLight ? 'border-gray-200/80 bg-white' : 'border-gray-700/80 bg-gray-800' // 修改背景色
        }`}>
        <div
          className={`flex items-center gap-3 p-4 ${
            isLight ? 'bg-white' : 'bg-gray-800' // 内部容器也设置对应的背景色
          }`}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className={`flex-1 px-4 py-2 rounded-xl border text-sm transition-all ${
              isLight
                ? 'border-gray-200 bg-white text-gray-900 focus:border-blue-500'
                : 'border-gray-600 bg-gray-700/50 text-gray-100 focus:border-blue-400'
            } focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className={`p-2 rounded-xl ${
              isLight ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'
            } text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
