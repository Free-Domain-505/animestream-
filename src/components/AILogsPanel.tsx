import React, { useEffect, useState } from 'react';
import { Activity, Server, AlertTriangle, CheckCircle, Info, RefreshCw } from 'lucide-react';

export default function AILogsPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsRes, statusRes] = await Promise.all([
        fetch('/api/gemini/logs'),
        fetch('/api/gemini/status')
      ]);
      if (logsRes.ok) setLogs(await logsRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch (e) {
      console.error("Error fetching AI logs", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center">
          <Activity className="w-5 h-5 mr-3 text-orange-500" />
          AI Logs & Gemini API Status
        </h2>
        <button 
          onClick={fetchData}
          className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
        >
          <RefreshCw className={`w-5 h-5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {status && (
        <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          status.status === 'ONLINE' ? 'bg-green-500/10 border-green-500/30' :
          status.status === 'OFFLINE' ? 'bg-zinc-800 border-zinc-700' :
          'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-4">
            <Server className={`w-8 h-8 ${
              status.status === 'ONLINE' ? 'text-green-500' :
              status.status === 'OFFLINE' ? 'text-zinc-500' :
              'text-red-500'
            }`} />
            <div>
              <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                Gemini API Connection
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  status.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' :
                  status.status === 'OFFLINE' ? 'bg-zinc-700 text-zinc-300' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {status.status}
                </span>
              </h3>
              <p className="text-sm text-zinc-400 mt-1">{status.message}</p>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel p-6 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col h-[500px]">
        <h3 className="text-lg font-bold text-zinc-200 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-orange-400" />
          System Work Log
        </h3>
        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
          {logs.length === 0 ? (
            <div className="text-center text-zinc-500 py-10 italic">
              No AI actions logged yet. Start auto-setup or interact with AI features.
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-4 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="mt-1">
                  {log.status === 'SUCCESS' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                   log.status === 'ERROR' ? <AlertTriangle className="w-5 h-5 text-red-500" /> :
                   <Info className="w-5 h-5 text-blue-400" />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-zinc-200 text-sm">{log.action}</span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mb-2">{log.details}</p>
                  <span className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded text-orange-300 border border-orange-500/20">
                    Model: {log.model}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
