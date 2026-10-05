import React, { useState } from 'react';
import { Shield, Key, Copy, Check, Eye, Code, FileText, Cpu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const JwtClaimsInspector: React.FC = () => {
  const { jwtToken, decodedClaims, currentUser } = useAuth();
  const [copiedToken, setCopiedToken] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'claims' | 'raw_token' | 'dotnet_structure'>('claims');

  const handleCopyToken = () => {
    if (jwtToken) {
      navigator.clipboard.writeText(jwtToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  if (!jwtToken || !decodedClaims) {
    return (
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Key className="h-4 w-4 text-amber-400" />
          <span>No active JWT session token stored. Login or select a demo user to inspect JWT claims.</span>
        </div>
      </div>
    );
  }

  // Parse header and payload visually
  const parts = jwtToken.split('.');
  const tokenHeader = parts.length === 3 ? JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'))) : { alg: 'HS256', typ: 'JWT' };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-xs font-mono">
      {/* Header Bar */}
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Shield className="h-4 w-4 text-emerald-400" />
          <span className="font-bold text-white tracking-wide font-sans">
            .NET 9 JWT Bearer Token Inspector
          </span>
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-sans">
            HS256 Signed
          </span>
        </div>

        <div className="flex items-center space-x-2 font-sans">
          <button
            onClick={() => setActiveSubTab('claims')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeSubTab === 'claims' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Decoded Claims
          </button>
          <button
            onClick={() => setActiveSubTab('raw_token')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeSubTab === 'raw_token' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Raw Token
          </button>
          <button
            onClick={handleCopyToken}
            className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition-colors"
          >
            {copiedToken ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copiedToken ? 'Copied' : 'Copy JWT'}</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-4 space-y-3 font-sans">
        {activeSubTab === 'claims' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Header Claims */}
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2 font-mono text-[11px]">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 font-sans block mb-1">
                HEADER: ALGORITHM & TOKEN TYPE
              </span>
              <pre className="text-red-400 whitespace-pre-wrap">
                {JSON.stringify(tokenHeader, null, 2)}
              </pre>
            </div>

            {/* Issuer & Audience Claims */}
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1.5 font-sans text-xs">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                SECURITY ISSUER & AUDIENCE (.NET 9)
              </span>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500">Issuer (iss):</span>
                <span className="font-mono text-purple-400">{decodedClaims.iss}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500">Audience (aud):</span>
                <span className="font-mono text-purple-400">{decodedClaims.aud}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500">Subject (sub):</span>
                <span className="font-mono text-cyan-400">{decodedClaims.sub}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500">Issued At (iat):</span>
                <span className="font-mono text-slate-400">
                  {new Date(decodedClaims.iat * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500">Expires At (exp):</span>
                <span className="font-mono text-emerald-400">
                  {new Date(decodedClaims.exp * 1000).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Payload Identity Claims */}
            <div className="md:col-span-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2 font-mono text-[11px]">
              <div className="flex items-center justify-between font-sans">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                  PAYLOAD CLAIMS (IDENTITY & PERMISSIONS MATRIX)
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  Active User: {decodedClaims.name} ({decodedClaims.role})
                </span>
              </div>
              <pre className="text-cyan-300 whitespace-pre-wrap overflow-x-auto max-h-48">
                {JSON.stringify(
                  {
                    sub: decodedClaims.sub,
                    name: decodedClaims.name,
                    email: decodedClaims.email,
                    role: decodedClaims.role,
                    userType: decodedClaims.userType,
                    department: decodedClaims.department,
                    companyName: decodedClaims.companyName,
                    permissions: decodedClaims.permissions,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}

        {activeSubTab === 'raw_token' && (
          <div className="space-y-3 font-mono text-[11px]">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 font-sans block">
              RAW JWT TOKEN STRING (HEADER . PAYLOAD . SIGNATURE)
            </span>
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 break-all leading-relaxed">
              <span className="text-red-400">{parts[0]}</span>
              <span className="text-white">.</span>
              <span className="text-cyan-400">{parts[1]}</span>
              <span className="text-white">.</span>
              <span className="text-emerald-400">{parts[2] || 'signature_hash'}</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">
              Pass this token in HTTP requests as: <code className="text-amber-300">Authorization: Bearer &lt;token&gt;</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
