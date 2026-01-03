
import React, { useState, useRef, useEffect } from 'react';
import { AppState, TranscriptSegment, ChatMessage } from './types';
import { ResultCard } from './components/ResultCard';
import { transcribeAudio, generateKentianCase, extractKentRubrics, chatWithTranscript } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [caseAnalysis, setCaseAnalysis] = useState<string | null>(null);
  const [rubrics, setRubrics] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
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
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const isRecording = appState === AppState.RECORDING;
  const isPaused = appState === AppState.PAUSED;

  useEffect(() => {
    if (!isChatOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, caseAnalysis, rubrics, appState, isChatOpen]);

  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  const initRecording = async () => {
    try {
      setErrorMsg(null);
      setIsManualInputOpen(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.start();
      setAppState(AppState.RECORDING);
    } catch (err) {
      setErrorMsg("Microphone access denied.");
      setAppState(AppState.ERROR);
    }
  };

  const stopAndProcess = () => {
    if (!mediaRecorderRef.current) return;
    new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = () => resolve();
      mediaRecorderRef.current!.stop();
    }).then(() => {
      const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current!.mimeType });
      processAudio(blob);
    });
    setAppState(AppState.PROCESSING);
  };

  const processAudio = async (blob: Blob) => {
    try {
      const text = await transcribeAudio(blob);
      setSegments(prev => [...prev, { id: Date.now().toString(), text, timestamp: Date.now() }]);
      setAppState(AppState.IDLE);
    } catch (err) {
      setErrorMsg("Transcription failed.");
      setAppState(AppState.IDLE);
    }
  };

  const handleManualSubmit = () => {
    if (!manualInputText.trim()) return;
    setSegments(prev => [...prev, { id: Date.now().toString(), text: manualInputText, timestamp: Date.now() }]);
    setManualInputText("");
    setIsManualInputOpen(false);
  };

  const handleGenerateCase = async () => {
    if (segments.length === 0) return;
    setAppState(AppState.PROCESSING);
    try {
      const result = await generateKentianCase(segments.map(s => s.text));
      setCaseAnalysis(result);
    } catch (err) {
      setErrorMsg("Case analysis failed.");
    } finally {
      setAppState(AppState.IDLE);
    }
  };

  const handleExtractRubrics = async () => {
    if (segments.length === 0) return;
    setAppState(AppState.PROCESSING);
    try {
      const result = await extractKentRubrics(segments.map(s => s.text));
      setRubrics(result);
    } catch (err) {
      setErrorMsg("Rubric extraction failed.");
    } finally {
      setAppState(AppState.IDLE);
    }
  };

  const handleExport = async () => {
    const content = `KENTIAN CASE REPORT\n\nANALYSIS:\n${caseAnalysis || 'N/A'}\n\nRUBRICS:\n${rubrics || 'N/A'}`;
    if (navigator.share) {
      await navigator.share({ title: 'Homeopathic Case', text: content });
    } else {
      navigator.clipboard.writeText(content);
      alert("Report copied to clipboard");
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsChatLoading(true);
    try {
      const context = `Case Analysis: ${caseAnalysis}\nRubrics: ${rubrics}\nTranscripts: ${segments.map(s => s.text).join("\n")}`;
      const response = await chatWithTranscript(context, userMsg.text);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: response, timestamp: Date.now() }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: "Error connecting to AI.", timestamp: Date.now() }]);
    } finally {
      setIsChatLoading(false);
    }
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
              <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest">Clinical Case Taking</p>
            </div>
          </div>
          {hasContent && (
            <button onClick={() => { if(confirm("Clear case data?")) { setSegments([]); setCaseAnalysis(null); setRubrics(null); setChatMessages([]); }}} className="text-xs font-bold text-slate-400 hover:text-red-600 transition-colors uppercase">Reset</button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-44 space-y-4">
        <div className="max-w-md mx-auto">
          {!hasContent && appState === AppState.IDLE && !isManualInputOpen && (
            <div className="text-center py-20 px-8">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 mx-auto mb-6 flex items-center justify-center text-teal-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </div>
              <h2 className="text-slate-800 font-bold text-lg">New Medical Case</h2>
              <p className="text-slate-500 text-sm mt-2">Record the patient consultation or type clinical insights to begin analysis.</p>
            </div>
          )}

          {errorMsg && <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-100 text-xs text-center mb-4">{errorMsg}</div>}

          {/* Analysis Outputs (Strict English) */}
          {caseAnalysis && <ResultCard text={caseAnalysis} type="CASE" onDelete={() => setCaseAnalysis(null)} />}
          {rubrics && <ResultCard text={rubrics} type="RUBRICS" onDelete={() => setRubrics(null)} />}

          {/* Transcript History (Hindi/Hinglish/English mix) */}
          <div className="space-y-3">
            {segments.map((s, idx) => (
              <ResultCard key={s.id} text={s.text} type="TRANSCRIPT" index={idx} onDelete={() => setSegments(prev => prev.filter(seg => seg.id !== s.id))} />
            ))}
          </div>

          {appState === AppState.PROCESSING && (
             <div className="flex flex-col items-center justify-center p-12 space-y-3 animate-pulse">
               <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Medical Analysis in Progress</p>
             </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-none bg-white border-t border-slate-200 p-4 safe-area-pb shadow-2xl z-20">
        <div className="max-w-md mx-auto space-y-4">
          
          {/* Action Row */}
          {hasContent && appState === AppState.IDLE && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button onClick={handleGenerateCase} className="flex-shrink-0 flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-teal-700 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Generate Case
              </button>
              <button onClick={handleExtractRubrics} className="flex-shrink-0 flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-amber-700 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                Kent Rubrics
              </button>
              <button onClick={() => setIsChatOpen(true)} className="flex-shrink-0 flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-slate-900 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                Consult AI
              </button>
              <button onClick={handleExport} className="flex-shrink-0 flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-slate-50 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                Share Case
              </button>
            </div>
          )}

          {/* Manual Input Toggle */}
          {isManualInputOpen && (
            <div className="animate-fade-in-up">
              <div className="flex gap-2 bg-slate-100 p-2 rounded-2xl border border-slate-200">
                <textarea value={manualInputText} onChange={(e) => setManualInputText(e.target.value)} placeholder="Type patient symptoms or observations..." className="flex-1 bg-transparent border-none focus:ring-0 text-sm p-2 min-h-[80px] resize-none" dir="auto" />
                <div className="flex flex-col justify-end"><button onClick={handleManualSubmit} disabled={!manualInputText.trim()} className="bg-teal-600 text-white p-2 rounded-xl shadow-sm disabled:opacity-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button></div>
              </div>
            </div>
          )}

          {/* Primary Controls */}
          <div className="flex items-center justify-center gap-8 relative py-2">
            {!isRecording && !isPaused && (
              <button onClick={() => fileInputRef.current?.click()} className="p-3 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-all flex flex-col items-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">Import</span>
                <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if(f) { setAppState(AppState.PROCESSING); processAudio(f); } }} accept="audio/*,video/*" className="hidden" />
              </button>
            )}

            {appState === AppState.RECORDING ? (
               <button onClick={() => { mediaRecorderRef.current?.pause(); setAppState(AppState.PAUSED); }} className="relative w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg transition-all scale-110">
                 <span className="absolute w-full h-full rounded-full animate-ping bg-red-400 opacity-25"></span>
                 <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
               </button>
            ) : appState === AppState.PAUSED ? (
              <button onClick={() => { mediaRecorderRef.current?.resume(); setAppState(AppState.RECORDING); }} className="w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            ) : (
              <button onClick={initRecording} disabled={appState === AppState.PROCESSING} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${appState === AppState.PROCESSING ? 'bg-slate-300' : 'bg-teal-700 hover:bg-teal-800'}`}>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </button>
            )}

            {(isRecording || isPaused) && (
              <button onClick={stopAndProcess} className="p-3 text-teal-600 hover:bg-teal-50 rounded-full flex flex-col items-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">Process</span>
              </button>
            )}

            {!isRecording && !isPaused && (
              <button onClick={() => setIsManualInputOpen(!isManualInputOpen)} className={`p-3 rounded-full transition-all flex flex-col items-center ${isManualInputOpen ? 'text-teal-600 bg-teal-50' : 'text-slate-400 hover:text-teal-600 hover:bg-teal-50'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">Note</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Chat Sheet */}
      {isChatOpen && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col animate-fade-in-up">
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Clinical Consultation</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Medical Assistant</p>
            </div>
            <button onClick={() => setIsChatOpen(false)} className="p-2 text-slate-400"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${msg.role === 'user' ? 'bg-teal-700 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'}`}>{msg.text}</div>
              </div>
            ))}
            {isChatLoading && <div className="flex justify-start"><div className="bg-white border p-3 rounded-2xl animate-pulse text-xs text-slate-400">Consulting AI Knowledge Base...</div></div>}
            <div ref={chatBottomRef} />
          </div>
          <div className="p-4 border-t bg-white safe-area-pb">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about remedy selection or repertorization..." className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-teal-500 outline-none" />
              <button type="submit" disabled={!chatInput.trim() || isChatLoading} className="bg-teal-700 text-white p-3 rounded-xl shadow-md"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
