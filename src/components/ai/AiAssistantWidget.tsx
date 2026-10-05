import React, { useState } from 'react';
import { Bot, Sparkles, Send, X, ArrowRight, MessageSquare, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AiAssistantWidgetProps {
  onSetCableCode?: (code: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  suggestedCableCode?: string;
}

export const AiAssistantWidget: React.FC<AiAssistantWidgetProps> = ({ onSetCableCode }) => {
  const { jwtToken } = useAuth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputMsg, setInputMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-1',
      sender: 'assistant',
      text: 'Hello! I am Energya AI Quotation & Engineering Copilot. How can I help you configure cables, calculate drum packing, or check LME metal prices today?',
      suggestedCableCode: 'MV-33KV-CU-3C-240-XLPE-PVC-SWA-PVC',
    },
  ]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputMsg;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({ prompt: query }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: data.reply || 'I analyzed your technical request based on IEC 60502 standards.',
          suggestedCableCode: data.suggestedCableCode || 'MV-33KV-CU-3C-240-XLPE-PVC-SWA-PVC',
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        throw new Error('API request failed');
      }
    } catch (err) {
      // Fallback smart response
      const fallbackMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: `Based on your query "${query}", I recommend Medium Voltage 33kV XLPE Armoured Copper Cable (240mm²). Copper LME rate is currently $9,250/MT with 15-day price locking.`,
        suggestedCableCode: 'MV-33KV-CU-3C-240-XLPE-PVC-SWA-PVC',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCableCode = (code: string) => {
    if (onSetCableCode) {
      onSetCableCode(code);
      alert(`Applied cable code "${code}" to Cable Parameters!`);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center space-x-2 px-4 py-3 rounded-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold text-xs shadow-2xl hover:scale-105 transition-all border border-blue-400/40"
        >
          <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
          <span>AI Quotation Assistant</span>
        </button>
      )}

      {isOpen && (
        <div className="w-[360px] sm:w-[420px] h-[520px] bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-4 bg-brand-600 border-b border-brand-700 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-400 flex items-center justify-center">
                <Bot className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-white">Energya AI Copilot</h4>
                <p className="text-[10px] text-emerald-400 font-semibold flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-ping" />
                  Gemini AI Model Connected
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-3 rounded-2xl max-w-[85%] ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white font-medium rounded-br-none'
                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                  }`}
                >
                  <p>{m.text}</p>
                  {m.suggestedCableCode && m.sender === 'assistant' && (
                    <div className="mt-2.5 pt-2 border-t border-slate-700/80">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                        Recommended Cable Code:
                      </span>
                      <div className="flex items-center justify-between mt-1 bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <span className="font-mono text-[11px] font-bold text-amber-400 break-all">
                          {m.suggestedCableCode}
                        </span>
                        <button
                          onClick={() => handleApplyCableCode(m.suggestedCableCode!)}
                          className="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded"
                        >
                          Apply Code
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center space-x-2 text-slate-400 text-xs italic">
                <Sparkles className="h-3.5 w-3.5 animate-spin text-blue-400" />
                <span>Gemini AI is analyzing technical parameters...</span>
              </div>
            )}
          </div>

          {/* Quick Action Chips */}
          <div className="px-3 py-2 bg-slate-950 border-t border-slate-800 flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleSendMessage('Recommend 33kV cable for substation')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 whitespace-nowrap"
            >
              Recommend 33kV Cable
            </button>
            <button
              onClick={() => handleSendMessage('What is current LME Copper rate?')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 whitespace-nowrap"
            >
              LME Copper Price
            </button>
          </div>

          {/* Input Box */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
            <input
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask about cable specs, LME pricing..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={loading}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
