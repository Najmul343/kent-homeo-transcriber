
import React, { useState, useRef, useEffect } from 'react';
import { AppState, TranscriptSegment, ChatMessage } from './types';
import { ResultCard } from './components/ResultCard';
import { transcribeAudio, generateKentianCase, extractKentRubrics, chatWithTranscript, connectLiveConsultation } from './services/geminiService';
import { encode, decode, decodeAudioData } from './utils/audioUtils';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [caseAnalysis, setCaseAnalysis] = useState<string | null>(null);
  const [rubrics, setRubrics] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Live State
  const [isLiveOpen, setIsLiveOpen] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState("");
  const [liveResponse, setLiveResponse] = useState("");
  const liveSessionRef = useRef<any>(null);
  const liveAudioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const liveSourcesRef = useRef(new Set<AudioBufferSourceNode>());

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualInputText, setManualInputText] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRecording = appState === AppState.RECORDING;
  const isPaused = appState === AppState.PAUSED;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments, caseAnalysis, rubrics, appState, isLiveOpen, liveTranscription]);

  // Live Audio Cleanup
  const stopLiveSession = () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    if (liveAudioContextRef.current) {
      liveAudioContextRef.current.input.close();
      liveAudioContextRef.current.output.close();
      liveAudioContextRef.current = null;
    }
    for (const source of liveSourcesRef.current) {
      source.stop();
    }
    liveSourcesRef.current.clear();
    setIsLiveOpen(false);
    setAppState(AppState.IDLE);
    // Add the final transcription to segments if it's substantial
    if (liveTranscription.trim()) {
      setSegments(prev => [...prev, { id: Date.now().toString(), text: `[Live Session]: ${liveTranscription}`, timestamp: Date.now() }]);
    }
    setLiveTranscription("");
    setLiveResponse("");
  };

  const startLiveSession = async () => {
    try {
      setAppState(AppState.PROCESSING);
      setIsLiveOpen(true);
      setErrorMsg(null);

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      liveAudioContextRef.current = { input: inputCtx, output: outputCtx };
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = connectLiveConsultation({
        onopen: () => {
          setAppState(AppState.RECORDING);
          const source = inputCtx.createMediaStreamSource(stream);
          const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const l = inputData.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
            const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
            sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputCtx.destination);
        },
        onmessage: async (message: any) => {
          if (message.serverContent?.inputTranscription) {
            setLiveTranscription(prev => prev + " " + message.serverContent.inputTranscription.text);
          }
          if (message.serverContent?.outputTranscription) {
            setLiveResponse(prev => prev + " " + message.serverContent.outputTranscription.text);
          }
          if (message.serverContent?.turnComplete) {
            setLiveResponse("");
          }

          const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio && outputCtx) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
            const source = outputCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputCtx.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            liveSourcesRef.current.add(source);
            source.onended = () => liveSourcesRef.current.delete(source);
          }
          if (message.serverContent?.interrupted) {
            liveSourcesRef.current.forEach(s => s.stop());
            liveSourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onerror: (err: any) => setErrorMsg(err?.message || "Live Session Error"),
        onclose: () => stopLiveSession()
      });

      liveSessionRef.current = await sessionPromise;
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to start Live Consultation");
      stopLiveSession();
    }
  };

  const initRecording = async () => {
    try {
      setErrorMsg(null);
      setIsManualInputOpen(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.start();
      setAppState(AppState.RECORDING);
    } catch (err: any) {
      setErrorMsg(err?.message || "Microphone access denied.");
      setAppState(AppState.ERROR);
    }
  };

  const stopAndProcess = () => {
    if (!mediaRecorderRef.current) return;
    setAppState(AppState.PROCESSING);
    
    new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = () => resolve();
      mediaRecorderRef.current!.stop();
    }).then(() => {
      if (audioChunksRef.current.length === 0) {
        setErrorMsg("No audio data recorded.");
        setAppState(AppState.IDLE);
        return;
      }
      const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current!.mimeType });
      processAudio(blob);
    });
  };

  const processAudio = async (blob: Blob) => {
    try {
      setErrorMsg(null);
      const text = await transcribeAudio(blob);
      setSegments(prev => [...prev, { id: Date.now().toString(), text, timestamp: Date.now() }]);
      setAppState(AppState.IDLE);
    } catch (err: any) {
      setErrorMsg(`Transcription Error: ${err.message}`);
      setAppState(AppState.IDLE);
    }
  };

  const handleManualSubmit = () => {
    if (manualInputText.trim()) {
      setSegments(prev => [...prev, { 
        id: Date.now().toString(), 
        text: manualInputText.trim(), 
        timestamp: Date.now() 
      }]);
      setManualInputText("");
      setIsManualInputOpen(false);
    }
  };

  const handleGenerateCase = async () => {
    if (segments.length === 0) return;
    setAppState(AppState.PROCESSING);
    try {
      const result = await generateKentianCase(segments.map(s => s.text));
      setCaseAnalysis(result);
    } catch (err: any) { setErrorMsg(`Analysis failed: ${err.message}`); } finally { setAppState(AppState.IDLE); }
  };

  const handleExtractRubrics = async () => {
    if (segments.length === 0) return;
    setAppState(AppState.PROCESSING);
    try {
      const result = await extractKentRubrics(segments.map(s => s.text));
      setRubrics(result);
    } catch (err: any) { setErrorMsg(`Extraction failed: ${err.message}`); } finally { setAppState(AppState.IDLE); }
  };

  const hasContent = segments.length > 0 || caseAnalysis || rubrics;

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex-none bg-white border-b border-slate-200 p-4 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-teal-700 text-white p-2 rounded-lg shadow-inner">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">KentHomeo AI</h1>
              <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest">Clinical AI Assistant</p>
            </div>
          </div>
          {hasContent && (
            <button onClick={() => { if(confirm("Reset all case data?")) { setSegments([]); setCaseAnalysis(null); setRubrics(null); setChatMessages([]); setErrorMsg(null); }}} className="text-xs font-bold text-slate-300 hover:text-red-500 transition-colors">RESET</button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-44 space-y-4">
        <div className="max-w-md mx-auto">
          {isLiveOpen && (
            <div className="bg-teal-900 text-white p-6 rounded-3xl shadow-xl mb-6 animate-fade-in-up border border-teal-800">
              <div className="flex items-center justify-between mb-4">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-300">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  Live Session Active
                </span>
                <button onClick={stopLiveSession} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="min-h-[120px] flex flex-col justify-center gap-4">
                <div className="text-sm text-teal-100 italic leading-relaxed">
                  {liveTranscription || "Listening to your voice..."}
                </div>
                {liveResponse && (
                  <div className="text-sm font-medium text-white bg-teal-800/50 p-3 rounded-xl border border-white/10">
                    AI: {liveResponse}
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-center">
                <div className="flex gap-1 h-8 items-center">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1 bg-teal-400 rounded-full animate-bounce" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }}></div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!hasContent && !isLiveOpen && appState === AppState.IDLE && !isManualInputOpen && (
            <div className="text-center py-16 px-8">
              <div className="w-20 h-20 bg-teal-50 rounded-full mx-auto mb-6 flex items-center justify-center text-teal-600">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </div>
              <h2 className="text-slate-900 font-bold text-xl">Hands-Free Case Taking</h2>
              <p className="text-slate-500 text-sm mt-3 leading-relaxed">Choose "Live Consultation" for real-time conversation or use the recorder to transcribe a case.</p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-100 text-xs font-medium mb-4 flex gap-3 items-start animate-fade-in-up">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div className="flex-1">
                <p className="font-bold mb-1 uppercase tracking-wider">Clinical Error</p>
                {errorMsg}
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {caseAnalysis && <ResultCard text={caseAnalysis} type="CASE" onDelete={() => setCaseAnalysis(null)} />}
          {rubrics && <ResultCard text={rubrics} type="RUBRICS" onDelete={() => setRubrics(null)} />}
          
          <div className="space-y-3">
            {segments.map((s, idx) => (
              <ResultCard key={s.id} text={s.text} type="TRANSCRIPT" index={idx} onDelete={() => setSegments(prev => prev.filter(seg => seg.id !== s.id))} />
            ))}
          </div>

          {appState === AppState.PROCESSING && !isLiveOpen && (
             <div className="flex flex-col items-center justify-center p-12 space-y-4 animate-pulse">
               <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Analyzing Medical Data</p>
             </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="flex-none bg-white border-t border-slate-200 p-4 safe-area-pb shadow-2xl z-20">
        <div className="max-w-md mx-auto space-y-4">
          
          {hasContent && appState === AppState.IDLE && !isLiveOpen && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button onClick={handleGenerateCase} className="flex-shrink-0 flex items-center gap-2 bg-teal-700 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-md">
                Generate Case Analysis
              </button>
              <button onClick={handleExtractRubrics} className="flex-shrink-0 flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-md">
                Identify Rubrics
              </button>
            </div>
          )}

          {isManualInputOpen && !isLiveOpen && (
            <div className="animate-fade-in-up">
              <div className="flex gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <textarea value={manualInputText} onChange={(e) => setManualInputText(e.target.value)} placeholder="Type clinical insights..." className="flex-1 bg-transparent border-none focus:ring-0 text-sm p-1 min-h-[80px] resize-none" dir="auto" />
                <div className="flex flex-col justify-end">
                  <button onClick={handleManualSubmit} disabled={!manualInputText.trim()} className="bg-teal-700 text-white p-2.5 rounded-xl shadow-md disabled:opacity-50">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-2 py-1">
            <button onClick={() => setIsManualInputOpen(!isManualInputOpen)} className={`flex flex-col items-center gap-1 ${isManualInputOpen ? 'text-teal-700' : 'text-slate-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              <span className="text-[9px] font-bold uppercase">Note</span>
            </button>

            {/* Main Primary Button: Live or Record */}
            <div className="relative">
              {!isLiveOpen ? (
                <div className="flex gap-4 items-center">
                  <button onClick={startLiveSession} className="flex flex-col items-center gap-1 group">
                    <div className="w-14 h-14 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-xl group-hover:bg-slate-800 transition-all">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
                    </div>
                    <span className="text-[9px] font-bold text-slate-800 uppercase tracking-tighter">Live Consult</span>
                  </button>

                  {isRecording ? (
                    <button onClick={stopAndProcess} className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-xl relative scale-110">
                      <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-20"></span>
                      <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h12V5H6v14z" /></svg>
                    </button>
                  ) : (
                    <button onClick={initRecording} className="w-20 h-20 bg-teal-700 rounded-full flex items-center justify-center shadow-xl hover:bg-teal-800 transition-all">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={stopLiveSession} className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center shadow-xl">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              <span className="text-[9px] font-bold uppercase">Import</span>
              <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if(f) { setAppState(AppState.PROCESSING); processAudio(f); } }} accept="audio/*" className="hidden" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
