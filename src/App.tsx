// c:\Users\viraj\nexus-ai-receptionist\src\App.tsx
import { useEffect, useRef, useState } from 'react';
import type { LiveServerMessage, Session } from '@google/genai';
import { Mic, Phone, PhoneOff, Loader2, Volume2, Sparkles, Code, TrendingUp, Globe, Mail, ArrowRight, Languages } from 'lucide-react';
import { motion } from 'motion/react';
import { Particles } from './components/ui/particles';
import { ShinyButton } from './components/ui/shiny-button';
import { LiquidGlass } from './components/ui/liquid-glass';
import { AnimatedText } from './components/ui/animated-text';

const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(4096);
    this.bufferSize = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        this.buffer[this.bufferSize++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        if (this.bufferSize >= 4096) {
          const outBuffer = new ArrayBuffer(8192);
          const view = new DataView(outBuffer);
          for (let j = 0; j < 4096; j++) {
            view.setInt16(j * 2, this.buffer[j], true);
          }
          this.port.postMessage(outBuffer, [outBuffer]);
          this.bufferSize = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
const LIVE_MODEL = 'gemini-2.0-flash-exp';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

class PCMRecorder {
  context: AudioContext | null = null;
  stream: MediaStream | null = null;
  sourceNode: MediaStreamAudioSourceNode | null = null;
  workletNode: AudioWorkletNode | null = null;
  silentGainNode: GainNode | null = null;
  workletUrl: string | null = null;
  onData: (base64: string) => void;
  
  constructor(onData: (base64: string) => void) {
    this.onData = onData;
  }
  
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
          channelCount: 1,
          sampleRate: 16000,
      } });
    } catch (e: any) {
      throw new Error(`Microphone access denied or unavailable: ${e.message}`);
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.context = new AudioContextClass({ sampleRate: 16000 });
    
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    this.workletUrl = URL.createObjectURL(blob);
    await this.context.audioWorklet.addModule(this.workletUrl);
    
    if (!this.stream) throw new Error("No media stream");
    this.sourceNode = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, 'pcm-processor');
    this.silentGainNode = this.context.createGain();
    this.silentGainNode.gain.value = 0;
    
    this.workletNode.port.onmessage = (e) => {
        const buffer = e.data;
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        this.onData(btoa(binary));
    };
    
    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.silentGainNode);
    this.silentGainNode.connect(this.context.destination);
  }
  
  stop() {
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.silentGainNode?.disconnect();
    this.workletNode?.port.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
    }

    this.context = null;
    this.stream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.silentGainNode = null;
    this.workletUrl = null;
  }
}

class PCMPlayer {
  context: AudioContext | null = null;
  nextTime: number = 0;
  sources: AudioBufferSourceNode[] = [];
  onPlayingChange?: (isPlaying: boolean) => void;
  
  async init() {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: 24000 });
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.nextTime = this.context.currentTime;
  }
  
  play(base64Data: string) {
    if (!this.context || this.context.state === 'closed') return;
    
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    const view = new DataView(bytes.buffer);
    const float32Array = new Float32Array(bytes.length / 2);
    for (let i = 0; i < float32Array.length; i++) {
        float32Array[i] = view.getInt16(i * 2, true) / 32768.0;
    }
    
    const buffer = this.context.createBuffer(1, float32Array.length, this.context.sampleRate);
    buffer.getChannelData(0).set(float32Array);
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    
    if (this.nextTime < this.context.currentTime) {
        this.nextTime = this.context.currentTime + 0.1;
    }
    
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    
    this.sources.push(source);
    if (this.sources.length === 1 && this.onPlayingChange) {
      this.onPlayingChange(true);
    }
    source.onended = () => {
      source.disconnect();
      this.sources = this.sources.filter(s => s !== source);
      if (this.sources.length === 0 && this.onPlayingChange) {
        this.onPlayingChange(false);
      }
    };
  }
  
  stop() {
    this.sources.forEach(s => {
      try { s.stop(); } catch {}
      s.disconnect();
    });
    this.sources = [];
    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }
    this.context = null;
    this.nextTime = 0;
    if (this.onPlayingChange) this.onPlayingChange(false);
  }
  
  interrupt() {
    this.sources.forEach(s => {
      try { s.stop(); } catch {}
      s.disconnect();
    });
    this.sources = [];
    if (this.context) {
      this.nextTime = this.context.currentTime;
    }
    if (this.onPlayingChange) this.onPlayingChange(false);
  }
}

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [formStatus, setFormStatus] = useState<'idle' | 'submitted'>('idle');
  const [language, setLanguage] = useState('Auto-detect');
  
  const isConnectedRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const playerRef = useRef<PCMPlayer | null>(null);
  const recorderRef = useRef<PCMRecorder | null>(null);
  const connectionAttemptRef = useRef(0);
  const hasApiKey = Boolean(GEMINI_API_KEY);
  const isConversationDisabled = isConnecting || (!hasApiKey && !isConnected);

  const setConnected = (val: boolean) => {
    setIsConnected(val);
    isConnectedRef.current = val;
  };

  const stopActiveSession = (closeSession = true) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (closeSession && session) {
      try { session.close(); } catch {}
    }

    recorderRef.current?.stop();
    recorderRef.current = null;

    playerRef.current?.stop();
    playerRef.current = null;
  };

  const disconnect = ({ closeSession = true }: { closeSession?: boolean } = {}) => {
    connectionAttemptRef.current += 1;
    setConnected(false);
    setIsConnecting(false);
    setIsListening(false);
    setIsSpeaking(false);
    stopActiveSession(closeSession);
  };

  const connect = async () => {
    if (isConnecting || isConnectedRef.current) {
      return;
    }

    if (!hasApiKey) {
      setError('Add GEMINI_API_KEY or VITE_GEMINI_API_KEY to .env before starting a conversation.');
      return;
    }

    const attemptId = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = attemptId;
    setIsConnecting(true);
    setIsListening(false);
    setIsSpeaking(false);
    setError(null);
    
    try {
      stopActiveSession();

      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      if (attemptId !== connectionAttemptRef.current) {
        return;
      }
      
      playerRef.current = new PCMPlayer();
      playerRef.current.onPlayingChange = setIsSpeaking;
      await playerRef.current.init();
      
      let sessionPromise: Promise<Session>;
      sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
          onopen: () => {
            if (attemptId !== connectionAttemptRef.current) {
              return;
            }

            setConnected(true);
            setIsConnecting(false);
            
            recorderRef.current = new PCMRecorder((base64) => {
              void sessionPromise.then((session) => {
                if (attemptId !== connectionAttemptRef.current) {
                  return;
                }

                try {
                  session.sendRealtimeInput({
                    media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                  });
                } catch(e) {}
              });
            });
            void recorderRef.current.start()
              .then(() => {
                if (attemptId === connectionAttemptRef.current) {
                  setIsListening(true);
                }
              })
              .catch((recorderError: unknown) => {
                console.error("Mic error", recorderError);
                if (attemptId !== connectionAttemptRef.current) {
                  return;
                }

                setError("Could not access microphone.");
                disconnect();
              });
          },
          onmessage: (message: LiveServerMessage) => {
            if (attemptId !== connectionAttemptRef.current) {
              return;
            }

            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data && playerRef.current) {
                  playerRef.current.play(part.inlineData.data);
                }
              }
            }
            if (message.serverContent?.interrupted && playerRef.current) {
              playerRef.current.interrupt();
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            if (attemptId !== connectionAttemptRef.current) {
              return;
            }

            setError(err.message || "Connection error occurred.");
            disconnect({ closeSession: false });
          },
          onclose: (e) => {
            console.log("Live API Closed", e);
            if (attemptId !== connectionAttemptRef.current) {
              return;
            }

            disconnect({ closeSession: false });
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          systemInstruction: { parts: [{ text: `You are Aethon AI, an elite sales expert and receptionist for 'Aethon' (aethon.site), a premier Web Development and Digital Agency founded by Viraj. Core Services: High-end Web Development, Digital Marketing, SEO, and AI Automation. Contact info: Phone: 9730575099, Email: aethon.co@gmail.com. Your goal: Engage visitors, build immense value, handle objections (e.g., emphasize ROI and premium quality if they mention price), and convert them into paying customers. Call to Action: Encourage them to fill out the project inquiry form on the screen or call Viraj directly. Tone: Charismatic, confident, professional, and concise. Always drive the conversation towards a successful conversion.\n\nLANGUAGE INSTRUCTION: The user's preferred language is ${language}. ${language === 'Auto-detect' ? 'Detect the language the user speaks and respond naturally in that exact same language.' : 'You MUST speak, understand, and respond ONLY in ' + language + '.'}` }] },
        },
      });
      
      const session = await sessionPromise;
      if (attemptId !== connectionAttemptRef.current || !isConnectedRef.current) {
        try { session.close(); } catch {}
        return;
      }
      sessionRef.current = session;
      
    } catch (err: unknown) {
      console.error("Failed to connect:", err);
      if (attemptId !== connectionAttemptRef.current) {
        return;
      }

      setError(getErrorMessage(err, "Failed to connect to the AI receptionist."));
      disconnect({ closeSession: false });
    }
  };

  useEffect(() => {
    return () => {
      stopActiveSession();
    };
  }, []);

  const handleConversationToggle = () => {
    if (isConversationDisabled) {
      return;
    }

    if (isConnected) {
      disconnect();
      return;
    }

    void connect();
  };

  const conversationStatusText = !hasApiKey
    ? 'Add GEMINI_API_KEY or VITE_GEMINI_API_KEY to .env to enable voice chat.'
    : isConnected
      ? isSpeaking
        ? 'Aethon is speaking right now.'
        : isListening
          ? 'Listening live. Speak naturally.'
          : 'Connecting the audio session...'
      : 'Click to start a voice conversation with the AI receptionist.';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 relative overflow-hidden">
      <Particles
        className="absolute inset-0 pointer-events-none z-0"
        quantity={60}
        ease={80}
        color="#10b981"
        refresh
      />

      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-400" />
            <span className="text-xl font-bold tracking-tight">Aethon</span>
          </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5">
            <Languages className="w-4 h-4 text-zinc-400" />
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isConnected || isConnecting}
              className="bg-transparent text-sm text-zinc-300 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&>option]:bg-zinc-900"
            >
              <option value="Auto-detect">Auto-detect Language</option>
              <option value="English">English</option>
              <option value="Spanish">Español</option>
              <option value="French">Français</option>
              <option value="German">Deutsch</option>
              <option value="Hindi">हिंदी (Hindi)</option>
              <option value="Arabic">العربية (Arabic)</option>
              <option value="Mandarin">中文 (Mandarin)</option>
            </select>
          </div>
          <a href="tel:9730575099" className="hidden sm:flex items-center gap-2 text-sm font-medium bg-zinc-900 hover:bg-zinc-800 px-4 py-2 rounded-full transition-colors border border-zinc-800 z-10">
            <Phone className="w-4 h-4 text-emerald-400" />
            9730575099
          </a>
        </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-2 gap-12 items-center relative z-10">
        {/* Left: AI Interaction */}
        <div className="flex flex-col items-center lg:items-start gap-8">
          <div className="flex flex-col gap-4 max-w-lg mx-auto lg:mx-0 text-center lg:text-left">
            <AnimatedText
              text="Your Digital Vision, Realized by Aethon."
              className="text-4xl sm:text-5xl tracking-tight leading-tight justify-center lg:justify-start"
            />
            <p className="text-zinc-400 text-lg">
              Speak with our AI Sales Expert to discover how our web development and digital marketing services can scale your business.
            </p>
          </div>

          {/* Orb */}
          <div className="relative w-64 h-64 flex items-center justify-center mx-auto lg:mx-0">
            <motion.div
              className="absolute inset-0 rounded-full bg-emerald-500/20 blur-3xl"
              animate={{
                scale: isSpeaking ? [1, 1.2, 1] : isConnected ? [1, 1.05, 1] : 1,
                opacity: isSpeaking ? 0.8 : isConnected ? 0.4 : 0.1,
              }}
              transition={{
                duration: isSpeaking ? 1.5 : 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className={`relative w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-2xl flex items-center justify-center ${
                isConversationDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
              onClick={handleConversationToggle}
              animate={{
                scale: isSpeaking ? [1, 1.1, 1] : 1,
              }}
              transition={{
                duration: 0.5,
                repeat: isSpeaking ? Infinity : 0,
                ease: "easeInOut"
              }}
            >
              {isConnecting ? (
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              ) : isSpeaking ? (
                <Volume2 className="w-10 h-10 text-white" />
              ) : isConnected ? (
                <Mic className="w-10 h-10 text-white" />
              ) : (
                <PhoneOff className="w-10 h-10 text-white/50" />
              )}
            </motion.div>
          </div>

          {/* Controls */}
          <div className="w-full max-w-md space-y-6">
            <div className="flex flex-col items-center lg:items-start gap-2">
              {error && (
                <div className="text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg text-center w-full mb-2">
                  {error}
                </div>
              )}
              <button
                onClick={handleConversationToggle}
                disabled={isConversationDisabled}
                className={`
                  w-full py-4 rounded-2xl font-medium text-lg transition-all flex items-center justify-center gap-2
                  ${isConnected 
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                    : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {isConnecting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Connecting...</>
                ) : isConnected ? (
                  <><PhoneOff className="w-5 h-5" /> End Call</>
                ) : (
                  <><Phone className="w-5 h-5" /> Start Conversation</>
                )}
              </button>
              <p className="text-zinc-500 text-xs text-center lg:text-left w-full">
                {conversationStatusText}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center lg:justify-start pt-4 border-t border-zinc-800/50">
              <span className="text-xs text-zinc-500 uppercase tracking-wider w-full text-center lg:text-left mb-1">Ask me about:</span>
              <div className="flex items-center gap-2 text-xs font-medium bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full text-zinc-300">
                <Code className="w-3 h-3 text-emerald-400" /> Web Development
              </div>
              <div className="flex items-center gap-2 text-xs font-medium bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full text-zinc-300">
                <TrendingUp className="w-3 h-3 text-emerald-400" /> Digital Marketing
              </div>
              <div className="flex items-center gap-2 text-xs font-medium bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full text-zinc-300">
                <Globe className="w-3 h-3 text-emerald-400" /> SEO Optimization
              </div>
            </div>
          </div>
        </div>

        {/* Right: Lead Form & Info */}
        <LiquidGlass>
          <h2 className="text-2xl font-semibold mb-6">Start Your Project</h2>
          
          {formStatus === 'submitted' ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-medium text-emerald-400">Request Received!</h3>
              <p className="text-zinc-400 text-sm">Viraj will get back to you shortly to discuss your project.</p>
              <button onClick={() => setFormStatus('idle')} className="text-sm text-zinc-300 hover:text-white underline mt-4">Submit another</button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setFormStatus('submitted'); }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Name</label>
                  <input required type="text" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all" placeholder="John Doe" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Email</label>
                  <input required type="email" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all" placeholder="john@example.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Project Details</label>
                <textarea required rows={3} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none" placeholder="Tell us about your goals..."></textarea>
              </div>
              <ShinyButton type="submit" className="w-full mt-2">
                Get a Proposal <ArrowRight className="w-4 h-4 inline ml-2" />
              </ShinyButton>
            </form>
          )}

          <div className="mt-8 pt-8 border-t border-zinc-800 grid grid-cols-2 gap-4">
            <a href="mailto:aethon.co@gmail.com" className="flex flex-col gap-1 p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/50 hover:border-zinc-700 transition-colors group">
              <Mail className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
              <span className="text-xs font-medium text-zinc-300 mt-2">Email Us</span>
              <span className="text-xs text-zinc-500 truncate">aethon.co@gmail.com</span>
            </a>
            <a href="tel:9730575099" className="flex flex-col gap-1 p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/50 hover:border-zinc-700 transition-colors group">
              <Phone className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
              <span className="text-xs font-medium text-zinc-300 mt-2">Call Viraj</span>
              <span className="text-xs text-zinc-500">9730575099</span>
            </a>
          </div>
        </LiquidGlass>
      </main>
    </div>
  );
}
