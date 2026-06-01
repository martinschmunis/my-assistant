"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

const SCREENS = { HOME: "home", CHAT: "chat", GOALS: "goals", GOAL_DETAIL: "goal_detail", QUIZ: "quiz", INSIGHTS: "insights" };
const FONT = "'Lexend', 'Comic Sans MS', sans-serif";
const FS = { sm: 15, md: 17, lg: 20, xl: 26 };
const LH = 1.9;
const DAY_ORDER = ["Today","Tomorrow","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

// ── Themes ─────────────────────────────────────────────────────────────────
const DARK = { bg:"#080F1A",surface:"#1E293B",surface2:"#0F172A",border:"#263348",border2:"#334155",text:"#F8FAFC",textSub:"#94A3B8",textMuted:"#64748B",accent:"#0EA5E9",navBg:"#0F172A",navBorder:"#1E293B",inputBg:"#1E293B",rowBg:"#172033" };
const LIGHT = { bg:"#F1F5F9",surface:"#FFFFFF",surface2:"#F8FAFC",border:"#E2E8F0",border2:"#CBD5E1",text:"#0F172A",textSub:"#475569",textMuted:"#94A3B8",accent:"#0284C7",navBg:"#FFFFFF",navBorder:"#E2E8F0",inputBg:"#F8FAFC",rowBg:"#F1F5F9" };

// ── TTS ────────────────────────────────────────────────────────────────────
const tts = {
  speaking:false,currentId:null,listeners:new Set(),
  notify(){this.listeners.forEach(fn=>fn());},
  speak(text,id){
    if(typeof window==="undefined"||!window.speechSynthesis)return;
    if(this.speaking&&this.currentId===id){window.speechSynthesis.cancel();this.speaking=false;this.currentId=null;this.notify();return;}
    window.speechSynthesis.cancel();
    const utt=new SpeechSynthesisUtterance(text.replace(/[#*`>]/g,"").replace(/\n+/g,". ").trim());
    utt.rate=0.9;utt.lang="en-US";
    const voices=window.speechSynthesis.getVoices();
    const pick=voices.find(v=>v.name.includes("Samantha")||v.name.includes("Karen")||v.name.includes("Daniel")||(v.lang.startsWith("en")&&v.localService));
    if(pick)utt.voice=pick;
    utt.onstart=()=>{this.speaking=true;this.currentId=id;this.notify();};
    utt.onend=utt.onerror=()=>{this.speaking=false;this.currentId=null;this.notify();};
    window.speechSynthesis.speak(utt);
  },
  stop(){if(typeof window!=="undefined")window.speechSynthesis?.cancel();this.speaking=false;this.currentId=null;this.notify();},
};

const useTTSState=()=>{const[s,setS]=useState({speaking:false,currentId:null});useEffect(()=>{const fn=()=>setS({speaking:tts.speaking,currentId:tts.currentId});tts.listeners.add(fn);return()=>tts.listeners.delete(fn);},[]);return s;};

const SpeakBtn=({text,id,T})=>{const{speaking,currentId}=useTTSState();const active=speaking&&currentId===id;if(!text)return null;return(<button onClick={e=>{e.stopPropagation();tts.speak(text,id);}} style={{background:active?T.accent:T.border2,border:"none",borderRadius:20,padding:"6px 12px",cursor:"pointer",color:active?"#fff":T.textSub,display:"inline-flex",alignItems:"center",gap:6,fontSize:13,fontFamily:FONT,fontWeight:600,flexShrink:0}}><svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{active?<><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/></>:<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/></>}</svg>{active?"Stop":"Read"}</button>);};

// ── API ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = (name) => `You are ${name}'s personal assistant. Help them plan their day, break down goals into tasks, study for exams, and stay organized.
Rules: Be direct and concrete. Short sentences only. Never write walls of text. Use numbered lists. Keep responses to 6 lines max.
When user describes a GOAL end with: GOAL_JSON:{"title":"...","type":"longterm|weekly","why":"...","tasks":[{"id":"t1","title":"...","deadline":"...","steps":[{"id":"s1","text":"...","duration":"...","day":"Today"}]}]}
When user describes a TASK with deadline end with: TASK_JSON:{"title":"...","deadline":"...","steps":[{"id":"s1","text":"...","duration":"...","day":"Today"}]}
For quiz answers end with: QUIZ_RESULT:{"correct":true} or QUIZ_RESULT:{"correct":false}`;

const apiFetch=async(url,opts={})=>{const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opts});if(!r.ok)throw new Error(r.status);return r.json();};
const callClaude=(msgs,name)=>apiFetch("/api/chat",{method:"POST",body:JSON.stringify({messages:msgs,system:SYSTEM_PROMPT(name)})}).then(d=>d.text||"");
const goalsApi=(action,data)=>apiFetch("/api/goals",{method:"POST",body:JSON.stringify({action,...data})});
const logMsg=(role,content)=>fetch("/api/insights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role,content})}).catch(()=>{});
const todayStr=()=>new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
const goalProgress=goal=>{const all=goal.tasks?.flatMap(t=>t.steps||[])||[];return all.length?Math.round(all.filter(s=>s.done).length/all.length*100):0;};

// ── Icons ──────────────────────────────────────────────────────────────────
const Icon=({n,size=24,color})=>{const d={home:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",chat:"M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",goals:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",insights:"M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",quiz:"M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",check:"M5 13l4 4L19 7",plus:"M12 4v16m8-8H4",back:"M15 19l-7-7 7-7",target:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",warn:"M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",star:"M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",eye:"M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",sun:"M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",moon:"M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"};return<svg width={size} height={size} fill="none" stroke={color||"currentColor"} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24"><path d={d[n]}/></svg>;};

const ErrBox=({msg,T})=>msg?<div style={{background:"#450A0A",border:"1px solid #7F1D1D",borderRadius:12,padding:"14px 16px",marginBottom:14}}><p style={{color:"#FCA5A5",fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH}}>{msg}</p></div>:null;
const SL=({children,mt=0,T})=><p style={{color:T.textMuted,fontSize:12,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",margin:`${mt}px 0 12px`}}>{children}</p>;
const Card=({children,T,onClick,style={}})=><div onClick={onClick} style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,marginBottom:10,...style}}>{children}</div>;

// ── Login Screen ───────────────────────────────────────────────────────────
const LoginScreen = () => (
  <div style={{height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#080F1A",padding:32}}>
    <div style={{textAlign:"center",maxWidth:340}}>
      <div style={{width:72,height:72,background:"#0EA5E9",borderRadius:24,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px"}}>
        <svg width={36} height={36} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
      </div>
      <h1 style={{color:"#F8FAFC",fontSize:28,fontWeight:700,margin:"0 0 8px",fontFamily:FONT}}>My Assistant</h1>
      <p style={{color:"#64748B",fontSize:FS.md,margin:"0 0 40px",fontFamily:FONT,lineHeight:LH}}>Your personal AI planning assistant.</p>
      <button onClick={()=>signIn("google")}
        style={{width:"100%",background:"#fff",border:"none",borderRadius:14,padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:FS.md,fontWeight:600,fontFamily:FONT,color:"#1E293B"}}>
        <svg width={20} height={20} viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Sign in with Google
      </button>
      <p style={{color:"#334155",fontSize:13,margin:"20px 0 0",fontFamily:FONT,lineHeight:LH}}>Access is by invitation only.</p>
    </div>
  </div>
);

// ── Pending Screen ─────────────────────────────────────────────────────────
const PendingScreen = ({name}) => (
  <div style={{height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#080F1A",padding:32}}>
    <div style={{textAlign:"center",maxWidth:340}}>
      <div style={{width:72,height:72,background:"#F59E0B20",border:"2px solid #F59E0B",borderRadius:24,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px"}}>
        <svg width={32} height={32} fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      </div>
      <h1 style={{color:"#F8FAFC",fontSize:24,fontWeight:700,margin:"0 0 8px",fontFamily:FONT}}>Almost there, {name}!</h1>
      <p style={{color:"#94A3B8",fontSize:FS.md,margin:"0 0 32px",fontFamily:FONT,lineHeight:LH}}>Your account is waiting for approval. You will have access as soon as an admin approves your request.</p>
      <button onClick={()=>signOut()} style={{background:"transparent",border:"1px solid #334155",borderRadius:12,padding:"12px 24px",color:"#64748B",cursor:"pointer",fontFamily:FONT,fontSize:FS.sm}}>Sign out</button>
    </div>
  </div>
);

// ── Insights ───────────────────────────────────────────────────────────────
const InsightsScreen=({T,userName})=>{
  const[data,setData]=useState(null);const[loading,setLoading]=useState(true);const[err,setErr]=useState("");const[resetting,setResetting]=useState(false);
  const load=()=>{setLoading(true);fetch("/api/insights").then(r=>r.json()).then(d=>{setData(d.insights);setLoading(false);}).catch(()=>{setErr("Could not load.");setLoading(false);});};
  const resetHistory=async()=>{if(!confirm("Clear AI memory and history? Goals and tasks are kept."))return;setResetting(true);await fetch("/api/insights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"resetAll"})});setResetting(false);load();};
  useEffect(()=>{load();},[]);
  if(loading)return<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg}}><p style={{color:T.textMuted,fontFamily:FONT,fontSize:FS.md}}>Analyzing your progress...</p></div>;
  if(!data)return<div style={{overflowY:"auto",height:"100%",background:T.bg}}><div style={{background:T.surface2,padding:"48px 20px 20px",borderBottom:`1px solid ${T.border}`}}><h2 style={{color:T.text,fontSize:FS.lg,fontWeight:700,margin:0,fontFamily:FONT}}>Insights</h2></div><div style={{padding:"20px 16px"}}><ErrBox msg={err||"No data yet."} T={T}/></div></div>;
  const allText=[data.greeting,data.todayFocus,data.progressSummary,...(data.atRiskGoals||[]).map(g=>`${g.goalTitle}: ${g.reason}`),...(data.blindSpots||[]).map(b=>`${b.title}: ${b.detail}`),...(data.wins||[]).map(w=>`${w.title}: ${w.detail}`)].filter(Boolean).join(". ");
  return(
    <div style={{overflowY:"auto",height:"100%",background:T.bg}}>
      <div style={{background:T.surface2,padding:"48px 20px 20px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><h2 style={{color:T.text,fontSize:FS.lg,fontWeight:700,margin:0,fontFamily:FONT}}>Insights</h2><p style={{color:T.textMuted,fontSize:FS.sm,margin:"4px 0 0",fontFamily:FONT}}>Based on your goals and patterns</p></div>
          <SpeakBtn text={allText} id="insights-all" T={T}/>
        </div>
      </div>
      <div style={{padding:"20px 16px 40px"}}>
        {data.greeting&&<Card T={T} style={{padding:18,marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}><p style={{color:T.text,fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH,flex:1}}>{data.greeting}</p><SpeakBtn text={data.greeting} id="ig" T={T}/></div></Card>}
        {data.todayFocus&&<><SL T={T}>FOCUS TODAY</SL><div style={{background:"#0C2340",borderRadius:16,border:"1px solid #0EA5E9",padding:18,marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}><p style={{color:"#7DD3FC",fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH,fontWeight:600,flex:1}}>{data.todayFocus}</p><SpeakBtn text={data.todayFocus} id="if" T={T}/></div></div></>}
        {data.progressSummary&&<><SL T={T}>PROGRESS</SL><Card T={T} style={{padding:18,marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}><p style={{color:T.textSub,fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH,flex:1}}>{data.progressSummary}</p><SpeakBtn text={data.progressSummary} id="ip" T={T}/></div></Card></>}
        {data.atRiskGoals?.length>0&&<><SL T={T}>AT RISK</SL>{data.atRiskGoals.map((g,i)=><div key={i} style={{background:"#2D1B00",borderRadius:16,border:"1px solid #92400E",padding:16,marginBottom:10,display:"flex",gap:12,alignItems:"flex-start"}}><div style={{color:"#F59E0B",flexShrink:0,marginTop:2}}><Icon n="warn" size={18}/></div><div style={{flex:1}}><p style={{color:"#FCD34D",fontSize:FS.md,margin:"0 0 4px",fontFamily:FONT,fontWeight:700}}>{g.goalTitle}</p><p style={{color:"#D97706",fontSize:FS.sm,margin:0,fontFamily:FONT,lineHeight:LH}}>{g.reason}</p></div><SpeakBtn text={`${g.goalTitle}: ${g.reason}`} id={`risk-${i}`} T={T}/></div>)}</>}
        {data.blindSpots?.length>0&&<><SL T={T} mt={10}>BLIND SPOTS</SL>{data.blindSpots.map((b,i)=><div key={i} style={{background:"#1E0A2E",borderRadius:16,border:"1px solid #6D28D9",padding:16,marginBottom:10,display:"flex",gap:12,alignItems:"flex-start"}}><div style={{color:"#A78BFA",flexShrink:0,marginTop:2}}><Icon n="eye" size={18}/></div><div style={{flex:1}}><p style={{color:"#C4B5FD",fontSize:FS.md,margin:"0 0 4px",fontFamily:FONT,fontWeight:700}}>{b.title}</p><p style={{color:"#9F67FA",fontSize:FS.sm,margin:0,fontFamily:FONT,lineHeight:LH}}>{b.detail}</p></div><SpeakBtn text={`${b.title}: ${b.detail}`} id={`bs-${i}`} T={T}/></div>)}</>}
        {data.wins?.length>0&&<><SL T={T} mt={10}>WINS</SL>{data.wins.map((w,i)=><div key={i} style={{background:"#052E16",borderRadius:16,border:"1px solid #166534",padding:16,marginBottom:10,display:"flex",gap:12,alignItems:"flex-start"}}><div style={{color:"#4ADE80",flexShrink:0,marginTop:2}}><Icon n="star" size={18}/></div><div style={{flex:1}}><p style={{color:"#4ADE80",fontSize:FS.md,margin:"0 0 4px",fontFamily:FONT,fontWeight:700}}>{w.title}</p><p style={{color:"#16A34A",fontSize:FS.sm,margin:0,fontFamily:FONT,lineHeight:LH}}>{w.detail}</p></div><SpeakBtn text={`${w.title}: ${w.detail}`} id={`win-${i}`} T={T}/></div>)}</>}
        {!data.wins?.length&&!data.blindSpots?.length&&!data.atRiskGoals?.length&&<Card T={T} style={{padding:20}}><p style={{color:T.textMuted,fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH}}>Use the app for a few days and insights will appear here based on your patterns.</p></Card>}
        <div style={{marginTop:32,borderTop:`1px solid ${T.border}`,paddingTop:20}}>
          <p style={{color:T.textMuted,fontSize:12,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",margin:"0 0 10px"}}>RESET</p>
          <p style={{color:T.textMuted,fontSize:FS.sm,fontFamily:FONT,lineHeight:LH,margin:"0 0 14px"}}>If the AI is repeating old patterns or being unfair, clear its memory and start fresh. Goals and tasks are not affected.</p>
          <button onClick={resetHistory} disabled={resetting} style={{width:"100%",background:"transparent",border:"1px solid #EF4444",borderRadius:12,padding:"14px",color:"#EF4444",fontSize:FS.md,fontWeight:700,fontFamily:FONT,cursor:"pointer",opacity:resetting?0.6:1}}>{resetting?"Clearing...":"Reset AI Memory & History"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Home ───────────────────────────────────────────────────────────────────
const HomeScreen=({goals,setScreen,setActiveGoalId,onToggleStep,insightGreeting,insightFocus,T,toggleTheme,isDark,userName,onSignOut})=>{
  const todaySteps=goals.flatMap(g=>(g.tasks||[]).flatMap(t=>(t.steps||[]).filter(s=>s.day==="Today"&&!s.done).map(s=>({...s,taskTitle:t.title,goalTitle:g.title,goalId:g.id,taskId:t.id}))));
  const weekly=goals.filter(g=>g.type==="weekly"),longterm=goals.filter(g=>g.type==="longterm");
  return(
    <div style={{overflowY:"auto",height:"100%",paddingBottom:20,background:T.bg}}>
      <div style={{background:T.surface2,padding:"48px 20px 24px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <p style={{color:T.textMuted,fontSize:12,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",margin:"0 0 6px"}}>{todayStr()}</p>
            <h1 style={{color:T.text,fontSize:FS.xl,fontWeight:700,margin:0,fontFamily:FONT,lineHeight:1.3}}>{insightGreeting||`Hey ${userName}.`}</h1>
          </div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={toggleTheme} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"8px 10px",cursor:"pointer",color:T.textSub,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n={isDark?"sun":"moon"} size={18}/></button>
            <button onClick={onSignOut} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"8px 10px",cursor:"pointer",color:T.textMuted,fontSize:12,fontFamily:FONT}}>Sign out</button>
          </div>
        </div>
        {insightFocus&&<div style={{background:"#0C2340",borderRadius:12,border:"1px solid #0EA5E9",padding:"10px 14px",marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}><p style={{color:"#7DD3FC",fontSize:FS.sm,margin:0,fontFamily:FONT,lineHeight:LH,flex:1}}><strong>Today:</strong> {insightFocus}</p><SpeakBtn text={insightFocus} id="home-focus" T={T}/></div>}
      </div>
      <div style={{padding:"20px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <SL T={T}>STEPS FOR TODAY</SL>
          {todaySteps.length>0&&<SpeakBtn text={`Your steps for today: ${todaySteps.map(s=>s.text).join(". ")}`} id="home-steps-all" T={T}/>}
        </div>
        {todaySteps.length===0?<Card T={T} style={{padding:18,marginBottom:12}}><p style={{color:T.textMuted,fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH}}>No steps for today. Go to Chat to set a goal.</p></Card>:todaySteps.map(s=>(
          <div key={`${s.goalId}-${s.taskId}-${s.id}`} style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
            <div onClick={()=>onToggleStep(s.goalId,s.taskId,s.id)} style={{width:26,height:26,borderRadius:8,border:s.done?"none":`2.5px solid ${T.border2}`,background:s.done?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>{s.done&&<Icon n="check" size={14} color="#fff"/>}</div>
            <div onClick={()=>onToggleStep(s.goalId,s.taskId,s.id)} style={{flex:1,cursor:"pointer"}}><p style={{color:T.text,fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH,fontWeight:600}}>{s.text}</p><p style={{color:T.textMuted,fontSize:13,margin:"2px 0 0",fontFamily:"monospace"}}>{s.goalTitle} · {s.duration}</p></div>
            <SpeakBtn text={`${s.text}. Part of ${s.goalTitle}. About ${s.duration}.`} id={`step-home-${s.id}`} T={T}/>
          </div>
        ))}
        <SL T={T} mt={24}>QUICK ACTIONS</SL>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:28}}>
          {[{label:"Talk to Assistant",n:"chat",s:SCREENS.CHAT,c:"#0EA5E9"},{label:"My Insights",n:"insights",s:SCREENS.INSIGHTS,c:"#8B5CF6"},{label:"My Goals",n:"goals",s:SCREENS.GOALS,c:"#22C55E"},{label:"Quiz Me",n:"quiz",s:SCREENS.QUIZ,c:"#F59E0B"}].map(a=>(
            <button key={a.label} onClick={()=>setScreen(a.s)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:"20px 16px",textAlign:"left",cursor:"pointer"}}>
              <div style={{color:a.c,marginBottom:10}}><Icon n={a.n} size={22}/></div>
              <p style={{margin:0,fontSize:FS.sm,fontFamily:FONT,color:T.text,fontWeight:600,lineHeight:1.4}}>{a.label}</p>
            </button>
          ))}
        </div>
        {weekly.length>0&&<><SL T={T}>THIS WEEK</SL>{weekly.map(g=>{const pct=goalProgress(g);return(<Card key={g.id} T={T} onClick={()=>{setActiveGoalId(g.id);setScreen(SCREENS.GOAL_DETAIL);}} style={{padding:16,cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><p style={{color:T.text,fontSize:FS.md,margin:0,fontFamily:FONT,fontWeight:700,flex:1}}>{g.title}</p><SpeakBtn text={`${g.title}. ${pct}% done.`} id={`hw-${g.id}`} T={T}/></div><div style={{background:T.surface2,borderRadius:6,height:8}}><div style={{background:pct===100?"#22C55E":"#F59E0B",width:`${pct}%`,height:8,borderRadius:6}}/></div><p style={{color:T.textMuted,fontSize:12,margin:"6px 0 0",fontFamily:"monospace"}}>{pct}% done · {(g.tasks||[]).length} tasks</p></Card>);})}</>}
        {longterm.length>0&&<><SL T={T} mt={16}>LONG-TERM GOALS</SL>{longterm.map(g=>{const pct=goalProgress(g);return(<Card key={g.id} T={T} onClick={()=>{setActiveGoalId(g.id);setScreen(SCREENS.GOAL_DETAIL);}} style={{padding:16,cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><Icon n="target" size={18} color={T.accent}/><p style={{color:T.text,fontSize:FS.md,margin:0,fontFamily:FONT,fontWeight:700,flex:1}}>{g.title}</p><SpeakBtn text={`${g.title}. ${pct}% done.`} id={`hl-${g.id}`} T={T}/></div><div style={{background:T.surface2,borderRadius:6,height:8}}><div style={{background:pct===100?"#22C55E":T.accent,width:`${pct}%`,height:8,borderRadius:6}}/></div><p style={{color:T.textMuted,fontSize:12,margin:"6px 0 0",fontFamily:"monospace"}}>{pct}% done · {(g.tasks||[]).length} tasks</p></Card>);})}</>}
      </div>
    </div>
  );
};

// ── Goals List ─────────────────────────────────────────────────────────────
const GoalsScreen=({goals,onDeleteGoal,setScreen,setActiveGoalId,T})=>{
  const weekly=goals.filter(g=>g.type==="weekly"),longterm=goals.filter(g=>g.type==="longterm");
  const GoalCard=({g})=>{const pct=goalProgress(g);return(<div style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,marginBottom:12,overflow:"hidden"}}><div onClick={()=>{setActiveGoalId(g.id);setScreen(SCREENS.GOAL_DETAIL);}} style={{padding:16,cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:4}}><p style={{color:T.text,fontSize:FS.md,margin:0,fontFamily:FONT,fontWeight:700,flex:1}}>{g.title}</p><SpeakBtn text={`${g.title}. ${g.why||""}. ${pct}% complete.`} id={`gc-${g.id}`} T={T}/></div>{g.why&&<p style={{color:T.textMuted,fontSize:FS.sm,margin:"0 0 10px",fontFamily:FONT,lineHeight:LH}}>{g.why}</p>}<div style={{background:T.surface2,borderRadius:6,height:8}}><div style={{background:pct===100?"#22C55E":(g.type==="weekly"?"#F59E0B":T.accent),width:`${pct}%`,height:8,borderRadius:6}}/></div><p style={{color:T.textMuted,fontSize:12,margin:"6px 0 0",fontFamily:"monospace"}}>{pct}% done · {(g.tasks||[]).length} tasks</p></div><div style={{borderTop:`1px solid ${T.border}`,padding:"10px 16px",display:"flex",justifyContent:"flex-end"}}><button onClick={()=>onDeleteGoal(g.id)} style={{background:"transparent",border:"none",color:"#EF4444",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:FS.sm,fontFamily:FONT}}><Icon n="trash" size={15} color="#EF4444"/>Delete</button></div></div>);};
  return(<div style={{overflowY:"auto",height:"100%",background:T.bg}}><div style={{background:T.surface2,padding:"48px 20px 20px",borderBottom:`1px solid ${T.border}`}}><h2 style={{color:T.text,fontSize:FS.lg,fontWeight:700,margin:0,fontFamily:FONT}}>My Goals</h2><p style={{color:T.textMuted,fontSize:FS.sm,margin:"4px 0 0",fontFamily:FONT}}>Tap a goal to see its tasks</p></div><div style={{padding:"20px 16px 40px"}}><button onClick={()=>setScreen(SCREENS.CHAT)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",background:T.accent,border:"none",borderRadius:14,padding:"16px",color:"#fff",fontSize:FS.md,fontWeight:700,fontFamily:FONT,cursor:"pointer",marginBottom:24}}><Icon n="plus" size={18} color="#fff"/>Add a New Goal</button>{goals.length===0&&<Card T={T} style={{padding:20}}><p style={{color:T.textMuted,fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH}}>No goals yet.</p></Card>}{weekly.length>0&&<><SL T={T}>THIS WEEK</SL>{weekly.map(g=><GoalCard key={g.id} g={g}/>)}</>}{longterm.length>0&&<><SL T={T} mt={weekly.length?16:0}>LONG-TERM</SL>{longterm.map(g=><GoalCard key={g.id} g={g}/>)}</>}</div></div>);
};

// ── Goal Detail ────────────────────────────────────────────────────────────
const GoalDetailScreen=({goals,onToggleStep,onDeleteTask,onAddStep,onAddTask,setScreen,goalId,T})=>{
  const goal=goals.find(g=>g.id===goalId);
  const[editingTask,setEditingTask]=useState(null);const[newStepText,setNewStepText]=useState("");const[newTaskTitle,setNewTaskTitle]=useState("");const[addingTask,setAddingTask]=useState(false);
  if(!goal)return null;
  const pct=goalProgress(goal);
  const inp={display:"block",width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:10,padding:"12px",color:T.text,fontSize:FS.md,fontFamily:FONT,outline:"none"};
  return(
    <div style={{overflowY:"auto",height:"100%",background:T.bg}}>
      <div style={{background:T.surface2,padding:"48px 20px 20px",borderBottom:`1px solid ${T.border}`}}>
        <button onClick={()=>setScreen(SCREENS.GOALS)} style={{background:"none",border:"none",color:T.accent,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:FS.sm,fontFamily:FONT,marginBottom:14,padding:0}}><Icon n="back" size={16} color={T.accent}/>All Goals</button>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <Icon n={goal.type==="weekly"?"goals":"target"} size={20} color={goal.type==="weekly"?"#F59E0B":T.accent}/>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}><h2 style={{color:T.text,fontSize:FS.lg,fontWeight:700,margin:0,fontFamily:FONT,lineHeight:1.3,flex:1}}>{goal.title}</h2><SpeakBtn text={`${goal.title}. ${goal.why||""}`} id={`gd-${goal.id}`} T={T}/></div>
            {goal.why&&<p style={{color:T.textMuted,fontSize:FS.sm,margin:"6px 0 12px",fontFamily:FONT,lineHeight:LH}}>{goal.why}</p>}
            <div style={{background:T.surface,borderRadius:6,height:8}}><div style={{background:pct===100?"#22C55E":(goal.type==="weekly"?"#F59E0B":T.accent),width:`${pct}%`,height:8,borderRadius:6,transition:"width 0.3s"}}/></div>
            <p style={{color:T.textMuted,fontSize:12,margin:"6px 0 0",fontFamily:"monospace"}}>{pct}% complete</p>
          </div>
        </div>
      </div>
      <div style={{padding:"20px 16px 40px"}}>
        <SL T={T}>TASKS</SL>
        {(goal.tasks||[]).map(task=>{
          const doneCt=(task.steps||[]).filter(s=>s.done).length;
          const byDay=(task.steps||[]).reduce((a,s)=>{(a[s.day]=a[s.day]||[]).push(s);return a;},{});
          const days=Object.keys(byDay).sort((a,b)=>{const ai=DAY_ORDER.indexOf(a),bi=DAY_ORDER.indexOf(b);return(ai<0?99:ai)-(bi<0?99:bi);});
          return(
            <div key={task.id} style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,overflow:"hidden",marginBottom:14}}>
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                  <p style={{color:T.text,fontSize:FS.md,margin:0,fontFamily:FONT,fontWeight:700,flex:1}}>{task.title}</p>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    {task.deadline&&<span style={{background:T.surface2,color:T.textMuted,fontSize:11,fontFamily:"monospace",padding:"3px 8px",borderRadius:6}}>Due {task.deadline}</span>}
                    <SpeakBtn text={`Task: ${task.title}. ${(task.steps||[]).map(s=>s.text).join(". ")}`} id={`task-${task.id}`} T={T}/>
                    <button onClick={()=>onDeleteTask(goalId,task.id)} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",padding:0}}><Icon n="trash" size={15}/></button>
                  </div>
                </div>
                {(task.steps||[]).length>0&&<p style={{color:T.textMuted,fontSize:12,margin:"6px 0 0",fontFamily:"monospace"}}>{doneCt} of {task.steps.length} steps done</p>}
              </div>
              {days.map(day=>(
                <div key={day}>
                  <p style={{color:T.textMuted,fontSize:10,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",margin:0,padding:"8px 16px 4px",background:T.rowBg,borderTop:`1px solid ${T.border}`}}>{day}</p>
                  {byDay[day].map(step=>(
                    <div key={step.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderTop:`1px solid ${T.border}`,opacity:step.done?0.45:1}}>
                      <div onClick={()=>onToggleStep(goalId,task.id,step.id)} style={{width:26,height:26,borderRadius:8,border:step.done?"none":`2.5px solid ${T.border2}`,background:step.done?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",transition:"all 0.2s"}}>{step.done&&<Icon n="check" size={14} color="#fff"/>}</div>
                      <div onClick={()=>onToggleStep(goalId,task.id,step.id)} style={{flex:1,cursor:"pointer"}}><p style={{color:step.done?T.textMuted:T.text,fontSize:FS.md,margin:0,fontFamily:FONT,lineHeight:LH,textDecoration:step.done?"line-through":"none"}}>{step.text}</p>{step.duration&&<p style={{color:T.textMuted,fontSize:12,margin:"2px 0 0",fontFamily:"monospace"}}>{step.duration}</p>}</div>
                      <SpeakBtn text={`${step.text}. ${step.duration?`About ${step.duration}.`:""}`} id={`step-${step.id}`} T={T}/>
                    </div>
                  ))}
                </div>
              ))}
              {editingTask===task.id?(
                <div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`}}>
                  <input value={newStepText} onChange={e=>setNewStepText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){onAddStep(goalId,task.id,newStepText.trim());setNewStepText("");setEditingTask(null);}}} placeholder="Describe the step..." autoFocus style={{...inp,marginBottom:8}}/>
                  <div style={{display:"flex",gap:8}}><button onClick={()=>{onAddStep(goalId,task.id,newStepText.trim());setNewStepText("");setEditingTask(null);}} style={{flex:1,background:T.accent,border:"none",borderRadius:10,padding:"10px",color:"#fff",fontSize:FS.sm,fontWeight:700,fontFamily:FONT,cursor:"pointer"}}>Add Step</button><button onClick={()=>{setEditingTask(null);setNewStepText("");}} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:10,padding:"10px 14px",color:T.textMuted,fontSize:FS.sm,fontFamily:FONT,cursor:"pointer"}}>Cancel</button></div>
                </div>
              ):(
                <button onClick={()=>setEditingTask(task.id)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"transparent",border:"none",borderTop:`1px solid ${T.border}`,padding:"12px 16px",color:T.textMuted,fontSize:FS.sm,fontFamily:FONT,cursor:"pointer"}}><Icon n="plus" size={15}/>Add a step</button>
              )}
            </div>
          );
        })}
        {addingTask?(
          <Card T={T} style={{padding:16}}><SL T={T}>NEW TASK</SL><input value={newTaskTitle} onChange={e=>setNewTaskTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){onAddTask(goalId,newTaskTitle.trim());setNewTaskTitle("");setAddingTask(false);}}} placeholder="Task name..." autoFocus style={{...inp,marginBottom:10}}/><div style={{display:"flex",gap:8}}><button onClick={()=>{onAddTask(goalId,newTaskTitle.trim());setNewTaskTitle("");setAddingTask(false);}} style={{flex:1,background:T.accent,border:"none",borderRadius:10,padding:"12px",color:"#fff",fontSize:FS.md,fontWeight:700,fontFamily:FONT,cursor:"pointer"}}>Add Task</button><button onClick={()=>{setAddingTask(false);setNewTaskTitle("");}} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:10,padding:"12px 14px",color:T.textMuted,fontSize:FS.md,fontFamily:FONT,cursor:"pointer"}}>Cancel</button></div></Card>
        ):(
          <button onClick={()=>setAddingTask(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",background:"transparent",border:`1px dashed ${T.border2}`,borderRadius:14,padding:"16px",color:T.textMuted,fontSize:FS.md,fontFamily:FONT,cursor:"pointer"}}><Icon n="plus" size={18}/>Add a task manually</button>
        )}
      </div>
    </div>
  );
};

// ── Chat ───────────────────────────────────────────────────────────────────
const ChatScreen=({onGoalExtracted,onTaskExtracted,T,userName})=>{
  const[msgs,setMsgs]=useState([{role:"assistant",content:`What do you want to work towards?\n\nTell me a goal and I will break it into tasks and steps.\n\nOr describe a specific assignment and I will make a schedule.`}]);
  const[input,setInput]=useState("");const[loading,setLoading]=useState(false);const[err,setErr]=useState("");const bottom=useRef(null);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth"});},[msgs,loading]);
  const send=async()=>{const text=input.trim();if(!text||loading)return;setInput("");setErr("");const next=[...msgs,{role:"user",content:text}];setMsgs(next);setLoading(true);logMsg("user",text);try{const reply=await callClaude(next.map(m=>({role:m.role,content:m.content})),userName);let clean=reply;const gm=reply.match(/GOAL_JSON:(\{[\s\S]*?\})\s*$/m);if(gm){try{await onGoalExtracted(JSON.parse(gm[1]));clean=reply.replace(/GOAL_JSON:[\s\S]*$/,"").trim()+"\n\nGoal saved. Go to Goals to see it.";}catch(_){}}const tm=reply.match(/TASK_JSON:(\{[\s\S]*?\})\s*$/m);if(tm){try{await onTaskExtracted(JSON.parse(tm[1]));clean=reply.replace(/TASK_JSON:[\s\S]*$/,"").trim()+"\n\nTask saved to your Goals.";}catch(_){}}logMsg("assistant",clean);setMsgs(p=>[...p,{role:"assistant",content:clean}]);}catch(e){setErr("Could not connect. Check your internet and try again.");}setLoading(false);};
  const renderText=t=>t.split("\n").map((line,i)=>{const tr=line.trim();if(!tr)return<div key={i} style={{height:8}}/>;const num=/^\d+\./.test(tr);return<p key={i} style={{margin:"5px 0",fontSize:FS.md,fontFamily:FONT,lineHeight:LH,color:T.text,paddingLeft:num?12:0,borderLeft:num?`3px solid ${T.accent}`:"none"}}>{tr}</p>;});
  const starters=["I want to achieve a new goal","I have an assignment due this week","Help me plan my week","I want to learn something new"];
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:T.bg}}>
      <div style={{background:T.surface2,padding:"20px 20px 16px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}><h2 style={{color:T.text,fontSize:FS.lg,fontWeight:700,margin:0,fontFamily:FONT}}>Assistant</h2><p style={{color:T.textMuted,fontSize:FS.sm,margin:"4px 0 0",fontFamily:FONT}}>Set a goal or describe a task</p></div>
      <div style={{flex:1,overflowY:"auto",padding:16,background:T.bg}}>
        <ErrBox msg={err} T={T}/>
        {msgs.map((m,i)=>(<div key={i} style={{marginBottom:20,display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:"88%",background:m.role==="user"?T.accent:T.surface,borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"14px 16px",border:m.role==="assistant"?`1px solid ${T.border}`:"none"}}>{m.role==="assistant"?renderText(m.content):<p style={{margin:0,fontSize:FS.md,color:"#fff",fontFamily:FONT,lineHeight:LH}}>{m.content}</p>}</div>{m.role==="assistant"&&<div style={{marginTop:6}}><SpeakBtn text={m.content.replace(/GOAL_JSON:[\s\S]*$/,"").replace(/TASK_JSON:[\s\S]*$/,"").trim()} id={`msg-${i}`} T={T}/></div>}</div>))}
        {loading&&<div style={{display:"flex",gap:6,padding:"14px 16px",background:T.surface,borderRadius:"18px 18px 18px 4px",width:"fit-content",border:`1px solid ${T.border}`}}>{[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:T.textMuted,animation:`blink 1.2s ${i*0.28}s infinite`}}/>)}</div>}
        {msgs.length===1&&!loading&&<div style={{marginTop:20}}><p style={{color:T.textMuted,fontSize:12,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",margin:"0 0 12px"}}>TRY SAYING</p>{starters.map(s=><button key={s} onClick={()=>setInput(s)} style={{display:"block",width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:10,color:T.textSub,fontSize:FS.md,textAlign:"left",cursor:"pointer",fontFamily:FONT,lineHeight:LH}}>{s}</button>)}</div>}
        <div ref={bottom}/>
      </div>
      <div style={{background:T.surface2,borderTop:`2px solid ${T.border}`,padding:"12px 16px",flexShrink:0}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();send();}}} placeholder="Type your message..." style={{display:"block",width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:12,padding:"14px",color:T.text,fontSize:FS.md,fontFamily:FONT,outline:"none",marginBottom:10}}/>
        <button onClick={send} disabled={loading} style={{display:"block",width:"100%",background:T.accent,border:"none",borderRadius:12,padding:"14px",cursor:"pointer",color:"#fff",fontSize:FS.md,fontWeight:700,fontFamily:FONT,opacity:loading?0.6:1}}>{loading?"Sending...":"Send Message"}</button>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:.25;transform:scale(.9)}50%{opacity:1;transform:scale(1.2)}}`}</style>
    </div>
  );
};

// ── Quiz ───────────────────────────────────────────────────────────────────
const QuizScreen=({T,userName})=>{
  const[topic,setTopic]=useState("");const[started,setStarted]=useState(false);const[msgs,setMsgs]=useState([]);const[input,setInput]=useState("");const[loading,setLoading]=useState(false);const[err,setErr]=useState("");const[score,setScore]=useState({correct:0,total:0});const bottom=useRef(null);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth"});},[msgs,loading]);
  useEffect(()=>{const last=msgs[msgs.length-1];if(last?.role==="assistant"&&last.content){const clean=last.content.replace(/QUIZ_RESULT:\{.*?\}/,"").trim();setTimeout(()=>tts.speak(clean,`qa-${msgs.length}`),400);}},[msgs]);
  const start=async()=>{if(!topic.trim())return;setStarted(true);setLoading(true);setErr("");const first={role:"user",content:`Quiz me on: ${topic}. Ask me the first question now. Keep it short and clear.`};setMsgs([first]);try{const reply=await callClaude([first],userName);setMsgs([first,{role:"assistant",content:reply}]);}catch(e){setErr("Could not connect.");setStarted(false);}setLoading(false);};
  const answer=async()=>{const text=input.trim();if(!text||loading)return;setInput("");setErr("");const next=[...msgs,{role:"user",content:text}];setMsgs(next);setLoading(true);try{const reply=await callClaude(next.map(m=>({role:m.role,content:m.content})),userName);const match=reply.match(/QUIZ_RESULT:\{"correct":(true|false)\}/);let correct=null;const clean=reply.replace(/QUIZ_RESULT:\{.*?\}/,"").trim();if(match){correct=match[1]==="true";setScore(s=>({correct:s.correct+(correct?1:0),total:s.total+1}));}setMsgs(p=>[...p,{role:"assistant",content:clean,correct}]);}catch(e){setErr("Could not connect.");}setLoading(false);};
  const topics=["Driver's license test","US History","Algebra","Biology","SAT words","Geography","English grammar","Science"];
  if(!started)return(<div style={{overflowY:"auto",height:"100%",background:T.bg}}><div style={{background:T.surface2,padding:"48px 20px 20px",borderBottom:`1px solid ${T.border}`}}><h2 style={{color:T.text,fontSize:FS.lg,fontWeight:700,margin:0,fontFamily:FONT}}>Quiz Me</h2><p style={{color:T.textMuted,fontSize:FS.sm,margin:"4px 0 0",fontFamily:FONT}}>Pick a topic and practice</p></div><div style={{padding:"24px 16px 40px"}}><ErrBox msg={err} T={T}/><SL T={T}>PICK A TOPIC</SL><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>{topics.map(t=><button key={t} onClick={()=>setTopic(t)} style={{background:topic===t?T.accent:T.surface,border:topic===t?"2px solid #38BDF8":`1px solid ${T.border}`,borderRadius:14,padding:"16px 12px",color:topic===t?"#fff":T.textSub,fontSize:FS.md,fontFamily:FONT,cursor:"pointer",textAlign:"left",fontWeight:topic===t?700:400,lineHeight:1.5}}>{t}</button>)}</div><SL T={T}>OR TYPE YOUR OWN</SL><input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. Spanish verbs..." style={{width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:14,padding:16,color:T.text,fontSize:FS.md,fontFamily:FONT,outline:"none"}}/><button onClick={start} disabled={!topic.trim()} style={{marginTop:16,width:"100%",background:topic.trim()?T.accent:T.border,border:"none",borderRadius:14,padding:18,color:topic.trim()?"#fff":T.textMuted,fontSize:FS.md,fontWeight:700,fontFamily:FONT,cursor:topic.trim()?"pointer":"default"}}>Start Quiz</button></div></div>);
  return(<div style={{display:"flex",flexDirection:"column",height:"100%",background:T.bg}}><div style={{background:T.surface2,padding:"20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{color:T.text,fontSize:FS.lg,fontWeight:700,margin:0,fontFamily:FONT}}>{topic}</h2><p style={{color:T.textMuted,fontSize:FS.sm,margin:"4px 0 0",fontFamily:FONT}}>Questions read aloud automatically</p></div>{score.total>0&&<div style={{background:T.surface,borderRadius:12,padding:"10px 16px",textAlign:"center",border:`1px solid ${T.border}`}}><p style={{color:"#22C55E",fontSize:22,fontWeight:700,margin:0,fontFamily:"monospace"}}>{score.correct}/{score.total}</p><p style={{color:T.textMuted,fontSize:10,margin:0,fontFamily:"monospace",textTransform:"uppercase"}}>Score</p></div>}</div></div><div style={{flex:1,overflowY:"auto",padding:16,background:T.bg}}><ErrBox msg={err} T={T}/>{msgs.filter(m=>m.role==="assistant").map((m,i)=>(<div key={i} style={{marginBottom:20}}>{m.correct!==undefined&&<div style={{display:"inline-flex",alignItems:"center",background:m.correct?"#14532D":"#450A0A",border:`1px solid ${m.correct?"#166534":"#7F1D1D"}`,borderRadius:10,padding:"8px 14px",marginBottom:10}}><p style={{color:m.correct?"#4ADE80":"#FCA5A5",fontSize:FS.md,margin:0,fontFamily:FONT,fontWeight:700}}>{m.correct?"✓  Correct!":"✗  Not quite"}</p></div>}<div style={{background:T.surface,borderRadius:"18px 18px 18px 4px",padding:16,border:`1px solid ${T.border}`}}>{m.content.split("\n").filter(l=>l.trim()).map((line,j)=><p key={j} style={{color:T.text,fontSize:FS.md,margin:"5px 0",fontFamily:FONT,lineHeight:LH}}>{line.trim()}</p>)}</div><div style={{marginTop:6}}><SpeakBtn text={m.content.replace(/QUIZ_RESULT:\{.*?\}/,"").trim()} id={`qm-${i}`} T={T}/></div></div>))}{loading&&<div style={{display:"flex",gap:6,padding:"14px 16px",background:T.surface,borderRadius:"18px 18px 18px 4px",width:"fit-content",border:`1px solid ${T.border}`}}>{[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:T.textMuted,animation:`blink 1.2s ${i*0.28}s infinite`}}/>)}</div>}<div ref={bottom}/></div><div style={{background:T.surface2,borderTop:`2px solid ${T.border}`,padding:"12px 16px",flexShrink:0}}><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")answer();}} placeholder="Type your answer..." style={{display:"block",width:"100%",background:T.inputBg,border:`1px solid ${T.border2}`,borderRadius:12,padding:"14px",color:T.text,fontSize:FS.md,fontFamily:FONT,outline:"none",marginBottom:10}}/><button onClick={answer} disabled={loading} style={{display:"block",width:"100%",background:T.accent,border:"none",borderRadius:12,padding:"14px",cursor:"pointer",color:"#fff",fontSize:FS.md,fontWeight:700,fontFamily:FONT,opacity:loading?0.6:1,marginBottom:8}}>{loading?"Checking...":"Submit Answer"}</button><button onClick={()=>{setStarted(false);setMsgs([]);setScore({correct:0,total:0});setErr("");tts.stop();}} style={{display:"block",width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:12,padding:12,color:T.textMuted,fontSize:FS.sm,fontFamily:FONT,cursor:"pointer"}}>Change topic</button></div><style>{`@keyframes blink{0%,100%{opacity:.25;transform:scale(.9)}50%{opacity:1;transform:scale(1.2)}}`}</style></div>);
};

// ── Nav ────────────────────────────────────────────────────────────────────
const NavBar=({screen,setScreen,T})=>{
  const isActive=ids=>[ids].flat().includes(screen);
  const tabs=[{ids:SCREENS.HOME,n:"home",label:"Today",t:SCREENS.HOME},{ids:SCREENS.CHAT,n:"chat",label:"Chat",t:SCREENS.CHAT},{ids:[SCREENS.GOALS,SCREENS.GOAL_DETAIL],n:"goals",label:"Goals",t:SCREENS.GOALS},{ids:SCREENS.INSIGHTS,n:"insights",label:"Insights",t:SCREENS.INSIGHTS},{ids:SCREENS.QUIZ,n:"quiz",label:"Quiz",t:SCREENS.QUIZ}];
  return(<div style={{background:T.navBg,borderTop:`2px solid ${T.navBorder}`,display:"flex",flexShrink:0,paddingBottom:"env(safe-area-inset-bottom, 8px)"}}>{tabs.map(tab=>{const active=isActive(tab.ids);return(<button key={tab.label} onClick={()=>{tts.stop();setScreen(tab.t);}} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"10px 0",color:active?T.accent:T.textMuted,minHeight:56}}><div style={{background:active?(T===DARK?"#0EA5E920":"#0284C720"):"transparent",borderRadius:10,padding:"4px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><Icon n={tab.n} size={22} color={active?T.accent:T.textMuted}/><span style={{fontSize:9,fontFamily:"monospace",textTransform:"uppercase",fontWeight:active?700:400,letterSpacing:0.5}}>{tab.label}</span></div></button>);})}</div>);
};

// ── Root ───────────────────────────────────────────────────────────────────
export default function App() {
  const { data: session, status } = useSession();
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [goals, setGoals] = useState([]);
  const [activeGoalId, setActiveGoalId] = useState(null);
  const [insightGreeting, setInsightGreeting] = useState("");
  const [insightFocus, setInsightFocus] = useState("");
  const [isDark, setIsDark] = useState(true);
  const T = isDark ? DARK : LIGHT;

  const toggleTheme = useCallback(() => {
    setIsDark(d => { const next = !d; if (typeof window !== "undefined") localStorage.setItem("ma-theme", next ? "dark" : "light"); return next; });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") { const saved = localStorage.getItem("ma-theme"); if (saved) setIsDark(saved === "dark"); }
    if (typeof window !== "undefined") { window.speechSynthesis?.getVoices(); window.speechSynthesis?.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices()); }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.approved) return;
    fetch("/api/setup").then(() => fetch("/api/goals")).then(r => r.json()).then(d => setGoals(d.goals || [])).catch(() => {});
    fetch("/api/insights").then(r => r.json()).then(d => { if (d.insights?.greeting) setInsightGreeting(d.insights.greeting); if (d.insights?.todayFocus) setInsightFocus(d.insights.todayFocus); }).catch(() => {});
  }, [status, session?.user?.approved]);

  const userName = session?.user?.dbName || session?.user?.name?.split(" ")[0] || "there";

  const handleGoalExtracted = async (data) => {
    const g = { id: uid(), title: data.title, type: data.type || "longterm", why: data.why || "", tasks: (data.tasks || []).map(t => ({ id: uid(), title: t.title, deadline: t.deadline || "", steps: (t.steps || []).map(s => ({ id: uid(), text: s.text, duration: s.duration || "", day: s.day || "Today", done: false })) })) };
    setGoals(p => [...p, g]); await goalsApi("saveGoal", { goal: g }).catch(() => {}); setActiveGoalId(g.id); setTimeout(() => setScreen(SCREENS.GOAL_DETAIL), 500);
  };
  const handleTaskExtracted = async (data) => {
    const t = { id: uid(), title: data.title, deadline: data.deadline || "", steps: (data.steps || []).map(s => ({ id: uid(), text: s.text, duration: s.duration || "", day: s.day || "Today", done: false })) };
    setGoals(p => { if (p.length === 0) { const g = { id: uid(), title: "Tasks", type: "weekly", why: "", tasks: [t] }; goalsApi("saveGoal", { goal: g }).catch(() => {}); return [g]; } goalsApi("saveTask", { task: t, goalId: p[0].id }).catch(() => {}); return p.map((g, i) => i !== 0 ? g : { ...g, tasks: [...(g.tasks || []), t] }); });
    setTimeout(() => setScreen(SCREENS.GOALS), 500);
  };
  const handleToggleStep = useCallback(async (goalId, taskId, stepId) => {
    const current = goals.find(g => g.id === goalId)?.tasks?.find(t => t.id === taskId)?.steps?.find(s => s.id === stepId);
    if (!current) return;
    const newDone = !current.done;
    setGoals(p => p.map(g => g.id !== goalId ? g : { ...g, tasks: (g.tasks || []).map(t => t.id !== taskId ? t : { ...t, steps: (t.steps || []).map(s => s.id !== stepId ? s : { ...s, done: newDone }) }) }));
    await goalsApi("toggleStep", { stepId, done: newDone }).catch(() => {});
  }, [goals]);
  const handleDeleteGoal = useCallback(async (id) => { setGoals(p => p.filter(g => g.id !== id)); await goalsApi("deleteGoal", { id }).catch(() => {}); }, []);
  const handleDeleteTask = useCallback(async (goalId, taskId) => { setGoals(p => p.map(g => g.id !== goalId ? g : { ...g, tasks: (g.tasks || []).filter(t => t.id !== taskId) })); await goalsApi("deleteTask", { id: taskId }).catch(() => {}); }, []);
  const handleAddStep = useCallback(async (goalId, taskId, text) => { if (!text) return; const s = { id: uid(), text, duration: "", day: "Today", done: false }; setGoals(p => p.map(g => g.id !== goalId ? g : { ...g, tasks: (g.tasks || []).map(t => t.id !== taskId ? t : { ...t, steps: [...(t.steps || []), s] }) })); await goalsApi("saveStep", { step: s, taskId }).catch(() => {}); }, []);
  const handleAddTask = useCallback(async (goalId, title) => { if (!title) return; const t = { id: uid(), title, deadline: "", steps: [] }; setGoals(p => p.map(g => g.id !== goalId ? g : { ...g, tasks: [...(g.tasks || []), t] })); await goalsApi("saveTask", { task: t, goalId }).catch(() => {}); }, []);

  // Loading
  if (status === "loading") return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#080F1A" }}>
      <p style={{ color: "#64748B", fontFamily: FONT, fontSize: FS.md }}>Loading...</p>
    </div>
  );

  // Not signed in
  if (status === "unauthenticated") return <LoginScreen />;

  // Signed in but pending approval
  if (!session.user.approved) return <PendingScreen name={userName} />;

  // Main app
  return (
    <div style={{ maxWidth: 430, margin: "0 auto", background: T.bg, height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`*{-webkit-font-smoothing:antialiased;box-sizing:border-box}body{margin:0;background:${T.bg}}html,body{height:100%}`}</style>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {screen === SCREENS.HOME     && <HomeScreen goals={goals} setScreen={setScreen} setActiveGoalId={setActiveGoalId} onToggleStep={handleToggleStep} insightGreeting={insightGreeting} insightFocus={insightFocus} T={T} toggleTheme={toggleTheme} isDark={isDark} userName={userName} onSignOut={() => signOut()} />}
        {screen === SCREENS.CHAT     && <ChatScreen onGoalExtracted={handleGoalExtracted} onTaskExtracted={handleTaskExtracted} T={T} userName={userName} />}
        {screen === SCREENS.GOALS    && <GoalsScreen goals={goals} onDeleteGoal={handleDeleteGoal} setScreen={setScreen} setActiveGoalId={setActiveGoalId} T={T} />}
        {screen === SCREENS.GOAL_DETAIL && <GoalDetailScreen goals={goals} onToggleStep={handleToggleStep} onDeleteTask={handleDeleteTask} onAddStep={handleAddStep} onAddTask={handleAddTask} setScreen={setScreen} goalId={activeGoalId} T={T} />}
        {screen === SCREENS.INSIGHTS && <InsightsScreen T={T} userName={userName} />}
        {screen === SCREENS.QUIZ     && <QuizScreen T={T} userName={userName} />}
      </div>
      <NavBar screen={screen} setScreen={setScreen} T={T} />
    </div>
  );
}
