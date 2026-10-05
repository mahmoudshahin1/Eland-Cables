import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Info, Loader2, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { customerFirstName } from '../../app/customerPortalNav';
import { customerInquiryDetailPath } from '../../app/shellRoutes';
import {
  fetchSupportChatSession,
  postSupportChatMessage,
  requestSupportEngineer,
  type SupportChatSessionDto,
} from '../../services/customerServiceApiService';
import {
  SUPPORT_CHAT_CHIPS,
  engineerStatusLabel,
  supportChatGreeting,
} from '../../domain/supportChat';

type ChatChannel = 'AI_ASSISTANT' | 'ENGINEER';

type SupportChatPanelProps = {
  compact?: boolean;
  initialChannel?: ChatChannel;
  onNewCase: () => void;
  onOpenCase?: (id: string) => void;
  onError?: (message: string) => void;
};

function AssistantAvatar() {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 shrink-0">
      <Bot className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}

export function SupportChatPanel({ compact, initialChannel, onNewCase, onOpenCase, onError }: SupportChatPanelProps) {
  const { jwtToken, currentUser } = useAuth();
  const firstName = customerFirstName(currentUser?.fullName) || 'there';
  const [channel, setChannel] = useState<ChatChannel>(initialChannel || 'AI_ASSISTANT');
  const [aiSession, setAiSession] = useState<SupportChatSessionDto | null>(null);
  const [engineerSession, setEngineerSession] = useState<SupportChatSessionDto | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const session = channel === 'AI_ASSISTANT' ? aiSession : engineerSession;

  const greeting = useMemo(() => supportChatGreeting(firstName), [firstName]);

  useEffect(() => {
    if (initialChannel) setChannel(initialChannel);
  }, [initialChannel]);

  useEffect(() => {
    if (!jwtToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchSupportChatSession(jwtToken, 'AI_ASSISTANT'),
      fetchSupportChatSession(jwtToken, 'ENGINEER'),
    ])
      .then(([ai, engineer]) => {
        setAiSession(ai);
        setEngineerSession(engineer);
      })
      .catch((err) => onError?.(err instanceof Error ? err.message : 'Unable to open support chat'))
      .finally(() => setLoading(false));
  }, [jwtToken, onError]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session?.messages.length, channel]);

  const applySession = (next: SupportChatSessionDto) => {
    if (next.channel === 'ENGINEER') setEngineerSession(next);
    else setAiSession(next);
    if (next.action === 'open_engineer') setChannel('ENGINEER');
    if (next.action === 'open_new_case') onNewCase();
  };

  const send = async (body: string, chipId?: string) => {
    if (!jwtToken || !body.trim() || sending) return;
    setSending(true);
    try {
      const next = await postSupportChatMessage(jwtToken, { channel, body: body.trim(), chipId });
      applySession(next);
      setDraft('');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Unable to send the message');
    } finally {
      setSending(false);
    }
  };

  const requestEngineer = async () => {
    if (!jwtToken || sending) return;
    setSending(true);
    try {
      const next = await requestSupportEngineer(jwtToken);
      applySession(next);
      setChannel('ENGINEER');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Unable to request an engineer');
    } finally {
      setSending(false);
    }
  };

  const messages = session?.messages?.length
    ? session.messages
    : channel === 'AI_ASSISTANT'
      ? [{ id: 'greeting', role: 'ASSISTANT', visibility: 'CUSTOMER', body: greeting, createdAt: '' }]
      : [];

  return (
    <aside
      className={`customer-home-card flex flex-col min-h-0 ${compact ? 'h-full' : 'h-full min-h-[30rem] xl:min-h-[32rem] xl:max-h-[calc(100vh-14rem)]'}`}
      aria-label="Chat with our Support Team"
    >
      <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-brand-500">
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <h2 className="text-[15px] font-bold text-slate-800 tracking-tight">Chat with our Support Team</h2>
      </div>

      <div className="px-4 flex items-center gap-6 border-b border-slate-200" role="tablist">
        {(
          [
            ['AI_ASSISTANT', 'AI Assistant'],
            ['ENGINEER', 'Talk to an Engineer'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={channel === id}
            onClick={() => setChannel(id)}
            className={`pb-2.5 text-[13px] font-semibold border-b-2 -mb-px ${
              channel === id ? 'border-brand-500 text-brand-500' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <AssistantAvatar />
        <p className="text-[13px] font-semibold text-slate-800">Energya Assistant</p>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-2 space-y-3 min-h-[12rem]">
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-slate-400 py-6">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Opening chat…
          </p>
        ) : (
          messages.map((item) => (
            <div
              key={item.id}
              className={
                item.role === 'CUSTOMER'
                  ? 'ml-8 rounded-2xl bg-brand-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap'
                  : 'rounded-2xl bg-slate-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap'
              }
            >
              {item.body}
            </div>
          ))
        )}

        {channel === 'ENGINEER' && session && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 space-y-2">
            <p>
              Engineer status:{' '}
              <span className="font-semibold text-slate-800">{engineerStatusLabel(session.engineerStatus)}</span>
            </p>
            {session.caseNumber && (
              <p>
                Linked case{' '}
                <button
                  type="button"
                  className="text-brand-500 font-semibold hover:underline"
                  onClick={() => (session.caseId ? onOpenCase?.(session.caseId) : onNewCase())}
                >
                  {session.caseNumber}
                </button>
              </p>
            )}
            {session.engineerStatus === 'AVAILABLE' && (
              <button
                type="button"
                onClick={() => void requestEngineer()}
                disabled={sending}
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-2"
              >
                Request Engineer
              </button>
            )}
          </div>
        )}
      </div>

      {channel === 'AI_ASSISTANT' && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {SUPPORT_CHAT_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => void send(chip.label, chip.id)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-600 text-center leading-tight"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 pl-4 pr-1 py-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Type your message..."
            aria-label="Type your message"
            className="flex-1 bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none min-w-0"
          />
          <button
            type="button"
            onClick={() => void send(draft)}
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className="h-9 w-9 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white inline-flex items-center justify-center shrink-0"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <p className="px-4 pb-4 flex items-start gap-1.5 text-[11px] text-slate-400 leading-snug">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          For urgent issues, you can also{' '}
          <button type="button" className="text-brand-500 hover:underline" onClick={onNewCase}>
            raise a support request
          </button>
          .
          {session?.inquiryId ? (
            <>
              {' '}
              <Link className="text-brand-500 hover:underline" to={customerInquiryDetailPath(session.inquiryId)}>
                Open linked inquiry
              </Link>
            </>
          ) : null}
        </span>
      </p>
    </aside>
  );
}
