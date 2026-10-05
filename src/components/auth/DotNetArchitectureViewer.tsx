import React, { useState, useEffect } from 'react';
import { Code, Database, Server, Copy, Check, Terminal, Cpu } from 'lucide-react';

export const DotNetArchitectureViewer: React.FC = () => {
  const [codeData, setCodeData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'program' | 'controller' | 'sql_ddl'>('program');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/auth/dotnet9-code')
      .then((res) => res.json())
      .then((data) => setCodeData(data))
      .catch((err) => console.error('Error fetching .NET 9 code examples:', err));
  }, []);

  const getActiveCode = () => {
    if (!codeData) return '';
    if (activeTab === 'program') return codeData.programCs;
    if (activeTab === 'controller') return codeData.authControllerCs;
    if (activeTab === 'sql_ddl') return codeData.sqlServerDdl;
    return '';
  };

  const handleCopy = () => {
    const code = getActiveCode();
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn text-xs font-sans">
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 p-4 rounded-2xl border border-purple-900/60 text-white flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="h-4 w-4 text-purple-400" />
            <span className="font-extrabold text-sm text-white">.NET 9 & SQL Server 2022 Implementation Architecture</span>
          </div>
          <p className="text-slate-300 text-xs mt-0.5">
            Production C# Controllers, JwtBearer Middleware configuration, and SQL Server AspNetUsers DDL schema.
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors shrink-0"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy Code'}</span>
        </button>
      </div>

      {/* Code File Selection Tabs */}
      <div className="flex space-x-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 font-mono text-xs">
        <button
          onClick={() => setActiveTab('program')}
          className={`px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
            activeTab === 'program' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          <span>Program.cs (.NET 9 JWT Setup)</span>
        </button>
        <button
          onClick={() => setActiveTab('controller')}
          className={`px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
            activeTab === 'controller' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Code className="h-3.5 w-3.5" />
          <span>AuthController.cs</span>
        </button>
        <button
          onClick={() => setActiveTab('sql_ddl')}
          className={`px-3 py-2 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
            activeTab === 'sql_ddl' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          <span>SQL Server DDL Schema</span>
        </button>
      </div>

      {/* Code Display */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-purple-200">
        <pre className="whitespace-pre-wrap">{getActiveCode() || 'Loading .NET 9 architectural sample...'}</pre>
      </div>
    </div>
  );
};
