import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { t } from '@extension/i18n';
import { ToggleButton } from '@extension/ui';
import { useState, useEffect } from 'react';

// 定义AI提供商类型
type AIProvider = {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
};

const defaultProviders: AIProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek R1',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  { id: 'claude', name: 'Claude 3' },
  { id: 'gpt4', name: 'GPT-4' },
];

const Popup = () => {
  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai'; content: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(defaultProviders[0]);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 从 storage 加载 API key
  useEffect(() => {
    chrome.storage.local.get(['deepseekApiKey'], result => {
      if (result.deepseekApiKey) {
        setApiKey(result.deepseekApiKey);
      }
    });
  }, []);

  // 保存 API key
  const handleSaveApiKey = () => {
    chrome.storage.local.set({ deepseekApiKey: apiKey });
  };

  const handleSend = async () => {
    if (!inputText.trim() || !apiKey) return;

    setMessages(prev => [...prev, { type: 'user', content: inputText }]);
    setIsLoading(true);

    try {
      const response = await fetch(selectedProvider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: inputText }],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      const data = await response.json();

      if (data.choices && data.choices[0]) {
        setMessages(prev => [
          ...prev,
          {
            type: 'ai',
            content: data.choices[0].message.content,
          },
        ]);
      }
    } catch (error) {
      console.error('API 调用错误:', error);
      setMessages(prev => [
        ...prev,
        {
          type: 'ai',
          content: '抱歉，发生了错误，请稍后重试。',
        },
      ]);
    } finally {
      setIsLoading(false);
      setInputText('');
    }
  };

  return (
    <div className={`w-[360px] h-[520px] ${isLight ? 'bg-slate-50' : 'bg-gray-800'}`}>
      {/* 顶部导航栏 */}
      <nav
        className={`flex items-center justify-between p-4 border-b ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
        <h1 className={`text-lg font-semibold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>AI Helper</h1>
        <div className="flex items-center gap-2">
          <ToggleButton className="!mt-0" />
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full hover:bg-opacity-10 hover:bg-gray-500 transition-colors`}>
            <svg
              className={`w-5 h-5 ${isLight ? 'text-gray-600' : 'text-gray-300'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
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
      </nav>

      {/* 设置面板 */}
      {showSettings && (
        <div
          className={`absolute right-4 top-16 w-72 rounded-lg shadow-lg p-4 ${
            isLight ? 'bg-white' : 'bg-gray-900'
          } border ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
          <h2 className={`text-sm font-semibold mb-3 ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            AI Provider Settings
          </h2>

          <div className="mb-4">
            <label className={`block text-sm font-medium mb-1 ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className={`w-full p-2 rounded-md border ${
                isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-600 bg-gray-800 text-gray-100'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="Enter your API key"
            />
            <button
              onClick={handleSaveApiKey}
              className={`mt-2 w-full p-2 rounded-md ${
                isLight ? 'bg-blue-500' : 'bg-blue-600'
              } text-white hover:opacity-90 transition-opacity`}>
              Save API Key
            </button>
          </div>

          <div className="space-y-2">
            {defaultProviders.map(provider => (
              <div key={provider.id} className="flex items-center">
                <input
                  type="radio"
                  id={provider.id}
                  name="ai-provider"
                  checked={selectedProvider.id === provider.id}
                  onChange={() => setSelectedProvider(provider)}
                  className="mr-2"
                />
                <label htmlFor={provider.id} className={`text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                  {provider.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 聊天区域 */}
      <div className="h-[calc(100%-8rem)] overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className={`mb-4 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
            <div
              className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
                message.type === 'user'
                  ? isLight
                    ? 'bg-blue-500 text-white'
                    : 'bg-blue-600 text-white'
                  : isLight
                    ? 'bg-gray-200 text-gray-900'
                    : 'bg-gray-700 text-gray-100'
              }`}>
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-center items-center py-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div className={`h-16 px-4 py-2 border-t ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className={`flex-1 p-2 rounded-lg border ${
              isLight ? 'border-gray-200 bg-white text-gray-900' : 'border-gray-600 bg-gray-700 text-gray-100'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          <button
            onClick={handleSend}
            className={`p-2 rounded-lg ${
              isLight ? 'bg-blue-500' : 'bg-blue-600'
            } text-white hover:opacity-90 transition-opacity`}>
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
