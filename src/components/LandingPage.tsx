import React from 'react';
import { Database, FileCode2, LogOut, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';

interface LandingPageProps {
  userEmail: string;
  onSelectFlow: (flow: 'tabular' | 'model') => void;
  onSignOut: () => void;
}

export function LandingPage({ userEmail, onSelectFlow, onSignOut }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#141414] text-[#E4E3E0] px-6 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4 md:max-w-3xl">
            <div className="inline-flex items-center justify-center rounded-full bg-[#F27D26]/10 p-4">
              <ShieldAlert className="h-12 w-12 text-[#F27D26]" />
            </div>
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.35em] text-[#F27D26]">Authenticated Workspace</p>
              <h1 className="text-5xl font-black tracking-tighter uppercase">BiasScope</h1>
              <p className="text-xl uppercase tracking-widest text-[#E4E3E0]/60">Sociotechnical AI Auditor</p>
            </div>
            <p className="max-w-2xl text-[#E4E3E0]/40">
              Select the type of AI system you want to audit. BiasScope provides specialized sociotechnical workflows for both raw training data and compiled model weights.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#E4E3E0]/40">Signed in as</p>
              <p className="mt-1 font-mono text-sm text-white">{userEmail}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onSignOut}
              className="border-[#E4E3E0] bg-transparent text-[#E4E3E0] shadow-[2px_2px_0px_#E4E3E0] hover:bg-[#E4E3E0] hover:text-[#141414]"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Tabular Option */}
          <Card 
            className="bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#F27D26] cursor-pointer transition-all duration-300 group"
            onClick={() => onSelectFlow('tabular')}
          >
            <CardHeader>
              <div className="p-3 bg-blue-500/10 w-fit rounded border border-blue-500/20 mb-4 group-hover:bg-blue-500/20 transition-colors">
                <Database className="w-8 h-8 text-blue-400" />
              </div>
              <CardTitle className="text-2xl text-white uppercase tracking-tight">Audit Tabular Dataset</CardTitle>
              <CardDescription className="text-[#E4E3E0]/50">CSV / Excel Files</CardDescription>
            </CardHeader>
            <CardContent className="text-[#E4E3E0]/70">
              <ul className="space-y-2 list-disc pl-4 marker:text-[#F27D26]">
                <li>Proxy feature legitimacy screening</li>
                <li>Intersectional hidden harms analysis</li>
                <li>Human oversight failure modeling</li>
                <li>Full sociotechnical deployment memo</li>
              </ul>
            </CardContent>
          </Card>

          {/* Model Option */}
          <Card 
            className="bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#F27D26] cursor-pointer transition-all duration-300 group"
            onClick={() => onSelectFlow('model')}
          >
            <CardHeader>
              <div className="p-3 bg-purple-500/10 w-fit rounded border border-purple-500/20 mb-4 group-hover:bg-purple-500/20 transition-colors">
                <FileCode2 className="w-8 h-8 text-purple-400" />
              </div>
              <CardTitle className="text-2xl text-white uppercase tracking-tight">Audit Model File</CardTitle>
              <CardDescription className="text-[#E4E3E0]/50">PKL, PT, ONNX, H5, GGUF</CardDescription>
            </CardHeader>
            <CardContent className="text-[#E4E3E0]/70">
              <ul className="space-y-2 list-disc pl-4 marker:text-[#F27D26]">
                <li>Model file intake and schema validation</li>
                <li>Executable fairness testing for supported sklearn files</li>
                <li>Ground-truth and protected-column audit setup</li>
                <li>Plain-English Gemini execution summary</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
