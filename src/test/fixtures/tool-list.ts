import { browserFixture } from './browser-fixture';

/** Actual tool catalog with a deterministic read-only catalog large enough to show its filter. */
export function toolListFixture() {
  return browserFixture(`
    import React from'react';import{createRoot}from'react-dom/client';
    import{ToolList}from'@/components/settings/sections/integrations/provider-detail';
    import{TipProvider}from'@/components/ui/tip';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    const actions=Array.from({length:25},(_,i)=>({id:'read_item_'+i,description:'Read fixture item '+i,mutating:false}));
    createRoot(document.getElementById('root')).render(<TipProvider><main style={{padding:16,background:'var(--pane)',color:'var(--t1)'}}><ToolList toolkits={[{id:'sample',displayName:'Sample tools',actions}]} writePolicy={{}} onSetApproval={()=>{}}/></main></TipProvider>);
  `, [], { css: true });
}
